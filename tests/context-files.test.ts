import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendContextLearnings, trimContextFile } from '../lib/context-files';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'agent-council-context-test');
const TEST_FILE = path.join(TEST_DIR, 'test-agent.context.md');

const SAMPLE_CONTEXT = `# test-agent — Context

## Meeting Learnings
- [2026-03-01] First learning
- [2026-03-02] Second learning
- [2026-03-03] Third learning

## Project Conventions
_Reserved for project-specific patterns._

## Domain Knowledge
_Reserved for domain-specific knowledge._
`;

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  try { await unlink(TEST_FILE); } catch { /* ignore */ }
});

describe('appendContextLearnings', () => {
  it('appends entries to existing file', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    await appendContextLearnings(TEST_FILE, ['[2026-03-04] New learning']);
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('[2026-03-04] New learning');
    expect(content).toContain('[2026-03-01] First learning');
  });

  it('auto-prefixes entries with dash', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    await appendContextLearnings(TEST_FILE, ['no dash entry']);
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('- no dash entry');
  });

  it('preserves entries already starting with dash', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    await appendContextLearnings(TEST_FILE, ['- already dashed']);
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('- already dashed');
    // Should not double-dash
    expect(content).not.toContain('- - already dashed');
  });

  it('enforces rolling window by trimming oldest entries', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    // Add entries to exceed maxLines=5 (already have 3)
    await appendContextLearnings(TEST_FILE, [
      '[2026-03-04] Fourth',
      '[2026-03-05] Fifth',
      '[2026-03-06] Sixth',
    ], 5);
    const content = await readFile(TEST_FILE, 'utf-8');
    // First entry should be trimmed
    expect(content).not.toContain('First learning');
    // Recent entries should remain
    expect(content).toContain('Fifth');
    expect(content).toContain('Sixth');
  });

  it('creates file if it does not exist', async () => {
    const newFile = path.join(TEST_DIR, 'new-agent.context.md');
    try {
      await appendContextLearnings(newFile, ['[2026-03-01] Brand new learning']);
      const content = await readFile(newFile, 'utf-8');
      expect(content).toContain('# new-agent — Context');
      expect(content).toContain('[2026-03-01] Brand new learning');
      expect(content).toContain('## Meeting Learnings');
      expect(content).toContain('## Project Conventions');
      expect(content).toContain('## Domain Knowledge');
    } finally {
      try { await unlink(newFile); } catch { /* ignore */ }
    }
  });

  it('preserves Project Conventions and Domain Knowledge sections', async () => {
    const customContent = `# test — Context

## Meeting Learnings
- [2026-03-01] Entry

## Project Conventions
Use snake_case for variables.

## Domain Knowledge
The API uses REST patterns.
`;
    await writeFile(TEST_FILE, customContent, 'utf-8');
    await appendContextLearnings(TEST_FILE, ['[2026-03-02] New entry']);
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('Use snake_case for variables.');
    expect(content).toContain('The API uses REST patterns.');
  });

  it('handles empty file gracefully', async () => {
    await writeFile(TEST_FILE, '', 'utf-8');
    await appendContextLearnings(TEST_FILE, ['[2026-03-01] Entry']);
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('[2026-03-01] Entry');
  });
});

describe('trimContextFile', () => {
  it('returns 0 when file is within limit', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    const trimmed = await trimContextFile(TEST_FILE, 50);
    expect(trimmed).toBe(0);
  });

  it('trims file when over limit', async () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      `- [2026-03-${String(i + 1).padStart(2, '0')}] Entry ${i + 1}`
    );
    const content = `# test — Context\n\n## Meeting Learnings\n${entries.join('\n')}\n\n## Project Conventions\n_Reserved._\n\n## Domain Knowledge\n_Reserved._\n`;
    await writeFile(TEST_FILE, content, 'utf-8');

    const trimmed = await trimContextFile(TEST_FILE, 10);
    expect(trimmed).toBe(10);

    const result = await readFile(TEST_FILE, 'utf-8');
    expect(result).not.toContain('Entry 1\n');
    expect(result).not.toContain('Entry 10\n');
    expect(result).toContain('Entry 20');
    expect(result).toContain('Entry 11');
  });

  it('returns 0 for nonexistent file', async () => {
    const trimmed = await trimContextFile('/nonexistent/file.context.md');
    expect(trimmed).toBe(0);
  });
});
