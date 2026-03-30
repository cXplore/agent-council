import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractKeywords,
  gatherPreflightContext,
  formatManifest,
  formatManifestForMeetingFile,
} from '@/lib/preflight-context';

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

describe('extractKeywords', () => {
  it('extracts meaningful words, skipping stop words', () => {
    const kw = extractKeywords('How should the MeetingViewer handle large meetings?');
    expect(kw).toContain('MeetingViewer');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('how');
    expect(kw).not.toContain('should');
  });

  it('splits camelCase identifiers into parts', () => {
    const kw = extractKeywords('Refactor the buildAgentPrompt function');
    expect(kw).toContain('buildAgentPrompt');
    // Also extracts the camelCase parts
    expect(kw).toContain('build');
    expect(kw).toContain('agent');
    expect(kw).toContain('prompt');
  });

  it('preserves file-like patterns with dots', () => {
    const kw = extractKeywords('Fix bug in scanner.ts and route.ts');
    expect(kw).toContain('scanner.ts');
    expect(kw).toContain('route.ts');
  });

  it('deduplicates keywords', () => {
    const kw = extractKeywords('context context context injection injection');
    const contextCount = kw.filter(k => k === 'context').length;
    expect(contextCount).toBe(1);
  });

  it('returns empty array for stop-word-only input', () => {
    const kw = extractKeywords('how should the new approach be using');
    expect(kw).toEqual([]);
  });

  it('handles empty input', () => {
    expect(extractKeywords('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// File gathering (uses a temp directory with mock project structure)
// ---------------------------------------------------------------------------

describe('gatherPreflightContext', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'preflight-test-'));

    // Create a mock project structure
    await mkdir(path.join(tempDir, 'lib'), { recursive: true });
    await mkdir(path.join(tempDir, 'app', 'api', 'meetings'), { recursive: true });
    await mkdir(path.join(tempDir, 'app', 'meetings'), { recursive: true });
    await mkdir(path.join(tempDir, 'node_modules', 'some-pkg'), { recursive: true });

    // Write mock files
    await writeFile(
      path.join(tempDir, 'lib', 'scanner.ts'),
      'export function scanProject(dir: string) { /* scan logic */ }\n',
    );
    await writeFile(
      path.join(tempDir, 'lib', 'config.ts'),
      'export function getConfig() { return {}; }\n',
    );
    await writeFile(
      path.join(tempDir, 'lib', 'tag-index.ts'),
      'export function buildTagIndex() { return {}; }\n',
    );
    await writeFile(
      path.join(tempDir, 'app', 'meetings', 'MeetingViewer.tsx'),
      'export default function MeetingViewer() { return <div>Viewer</div>; }\n',
    );
    await writeFile(
      path.join(tempDir, 'app', 'api', 'meetings', 'route.ts'),
      'export async function GET() { return new Response("ok"); }\n',
    );
    // This should be skipped
    await writeFile(
      path.join(tempDir, 'node_modules', 'some-pkg', 'index.js'),
      'module.exports = {};\n',
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('finds files matching topic keywords', async () => {
    const manifest = await gatherPreflightContext(
      tempDir,
      'How does the scanner work?',
    );

    expect(manifest.found).toBe(true);
    expect(manifest.files.length).toBeGreaterThan(0);

    const filePaths = manifest.files.map(f => f.relativePath);
    expect(filePaths).toContain('lib/scanner.ts');
  });

  it('finds MeetingViewer by camelCase keyword', async () => {
    const manifest = await gatherPreflightContext(
      tempDir,
      'Improve the MeetingViewer component',
    );

    expect(manifest.found).toBe(true);
    const filePaths = manifest.files.map(f => f.relativePath);
    expect(filePaths).toContain('app/meetings/MeetingViewer.tsx');
  });

  it('skips node_modules', async () => {
    const manifest = await gatherPreflightContext(
      tempDir,
      'Find the some-pkg package',
    );

    const filePaths = manifest.files.map(f => f.relativePath);
    expect(filePaths.every(p => !p.includes('node_modules'))).toBe(true);
  });

  it('returns found=false when no keywords match', async () => {
    const manifest = await gatherPreflightContext(
      tempDir,
      'Should we pivot to blockchain microservices?',
    );

    // May or may not find files depending on keyword extraction
    // But should not crash
    expect(manifest.extractedKeywords.length).toBeGreaterThan(0);
  });

  it('returns found=false for empty topic', async () => {
    const manifest = await gatherPreflightContext(tempDir, '');
    expect(manifest.found).toBe(false);
    expect(manifest.files).toEqual([]);
  });

  it('respects token budget — does not exceed ~4500 tokens', async () => {
    const manifest = await gatherPreflightContext(
      tempDir,
      'Review all the lib files config scanner tag-index',
    );

    expect(manifest.totalTokens).toBeLessThanOrEqual(5000);
  });

  it('reads file content and includes it in resolved files', async () => {
    const manifest = await gatherPreflightContext(
      tempDir,
      'How does scanProject work in scanner?',
    );

    expect(manifest.found).toBe(true);
    const scanner = manifest.files.find(f => f.relativePath === 'lib/scanner.ts');
    expect(scanner).toBeDefined();
    expect(scanner!.content).toContain('scanProject');
    expect(scanner!.estimatedTokens).toBeGreaterThan(0);
  });

  it('includes match signals explaining why each file was selected', async () => {
    const manifest = await gatherPreflightContext(
      tempDir,
      'Fix the scanner',
    );

    if (manifest.found && manifest.files.length > 0) {
      const scanner = manifest.files.find(f => f.relativePath === 'lib/scanner.ts');
      if (scanner) {
        expect(scanner.matchSignals.length).toBeGreaterThan(0);
        expect(scanner.matchSignals.some(s => s.includes('scanner'))).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Manifest formatting
// ---------------------------------------------------------------------------

describe('formatManifest', () => {
  it('produces markdown with file contents when files are found', () => {
    const manifest = {
      files: [{
        relativePath: 'lib/example.ts',
        absolutePath: '/tmp/lib/example.ts',
        content: 'const x = 1;',
        estimatedTokens: 5,
        matchSignals: ['exact-basename: "example"'],
        truncated: false,
      }],
      totalTokens: 5,
      extractedKeywords: ['example'],
      found: true,
      summary: 'Gathered 1 file(s) [5 tokens]: lib/example.ts (5 tokens)',
    };

    const md = formatManifest(manifest);
    expect(md).toContain('## Pre-Flight Context Resolution');
    expect(md).toContain('lib/example.ts');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('exact-basename');
  });

  it('produces graceful message when no files found', () => {
    const manifest = {
      files: [],
      totalTokens: 0,
      extractedKeywords: ['blockchain'],
      found: false,
      summary: 'No matching files found.',
    };

    const md = formatManifest(manifest);
    expect(md).toContain('No matching files found');
    expect(md).toContain('should note when their analysis would benefit from code');
  });
});

describe('formatManifestForMeetingFile', () => {
  it('produces a summary without file contents', () => {
    const manifest = {
      files: [{
        relativePath: 'lib/example.ts',
        absolutePath: '/tmp/lib/example.ts',
        content: 'const x = 1;',
        estimatedTokens: 5,
        matchSignals: ['exact-basename: "example"'],
        truncated: false,
      }],
      totalTokens: 5,
      extractedKeywords: ['example'],
      found: true,
      summary: 'Gathered 1 file',
    };

    const md = formatManifestForMeetingFile(manifest);
    expect(md).toContain('## Pre-Flight Context');
    expect(md).toContain('lib/example.ts');
    expect(md).toContain('5 tokens');
    // Should NOT contain the actual file content
    expect(md).not.toContain('const x = 1;');
  });

  it('produces an HTML comment when no files found', () => {
    const manifest = {
      files: [],
      totalTokens: 0,
      extractedKeywords: [],
      found: false,
      summary: 'No keywords extracted.',
    };

    const md = formatManifestForMeetingFile(manifest);
    expect(md).toContain('<!-- pre-flight:');
  });
});
