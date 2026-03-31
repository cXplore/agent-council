import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureGitignore, generateCoreAgents, buildPlaceholders, CORE_AGENTS } from '../lib/project-setup';
import type { ProjectProfile } from '../lib/types';

const TEST_DIR = path.join(os.tmpdir(), 'council-setup-test-' + Date.now());

const mockProfile: ProjectProfile = {
  languages: [
    { name: 'Python', fileCount: 50, percentage: 70 },
    { name: 'JavaScript', fileCount: 20, percentage: 30 },
  ],
  frameworks: [{ name: 'Django', confidence: 'high', version: '5.0' }],
  structure: {
    hasApi: true,
    hasFrontend: false,
    hasDatabase: true,
    hasTests: true,
    hasCICD: false,
    isMonorepo: false,
    hasDocker: true,
  },
  packageManager: 'pip',
  libraries: { database: ['psycopg2', 'sqlalchemy'], testing: ['pytest'] },
  suggestedPreset: 'backend',
  suggestedAgents: ['developer', 'architect'],
};

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('ensureGitignore', () => {
  it('appends meetingsDir to existing .gitignore', async () => {
    await writeFile(path.join(TEST_DIR, '.gitignore'), 'node_modules/\n', 'utf-8');
    await ensureGitignore(TEST_DIR, 'meetings');
    const content = await readFile(path.join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('meetings/');
    expect(content).toContain('node_modules/');
  });

  it('does not duplicate if meetingsDir already present', async () => {
    await writeFile(path.join(TEST_DIR, '.gitignore'), 'meetings/\n', 'utf-8');
    await ensureGitignore(TEST_DIR, 'meetings');
    const content = await readFile(path.join(TEST_DIR, '.gitignore'), 'utf-8');
    const matches = content.match(/meetings\//g);
    expect(matches).toHaveLength(1);
  });

  it('does not duplicate if meetingsDir present without trailing slash', async () => {
    await writeFile(path.join(TEST_DIR, '.gitignore'), 'meetings\n', 'utf-8');
    await ensureGitignore(TEST_DIR, 'meetings');
    const content = await readFile(path.join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).not.toContain('meetings/\n');
  });

  it('adds newline separator if .gitignore does not end with newline', async () => {
    await writeFile(path.join(TEST_DIR, '.gitignore'), 'node_modules/', 'utf-8');
    await ensureGitignore(TEST_DIR, 'meetings');
    const content = await readFile(path.join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\nmeetings/\n');
  });

  it('does nothing if no .gitignore exists', async () => {
    await ensureGitignore(TEST_DIR, 'meetings');
    // Should not create a .gitignore
    await expect(access(path.join(TEST_DIR, '.gitignore'))).rejects.toThrow();
  });

  it('handles nested meetingsDir like docs/meetings', async () => {
    await writeFile(path.join(TEST_DIR, '.gitignore'), 'node_modules/\n', 'utf-8');
    await ensureGitignore(TEST_DIR, 'docs/meetings');
    const content = await readFile(path.join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('docs/meetings/');
  });
});

describe('buildPlaceholders', () => {
  it('builds correct placeholders from profile', () => {
    const placeholders = buildPlaceholders('/tmp/my-django-app', mockProfile);
    expect(placeholders.PROJECT_NAME).toBe('my-django-app');
    expect(placeholders.FRAMEWORK).toBe('Django');
    expect(placeholders.LANGUAGES).toBe('Python, JavaScript');
    expect(placeholders.PACKAGE_MANAGER).toBe('pip');
    expect(placeholders.DB_LIBS).toBe('psycopg2, sqlalchemy');
    expect(placeholders.TESTING_LIBS).toBe('pytest');
  });

  it('returns descriptive fallback for empty languages/frameworks without scanQuality', () => {
    const emptyProfile: ProjectProfile = {
      ...mockProfile,
      languages: [],
      frameworks: [],
    };
    const placeholders = buildPlaceholders('/tmp/empty', emptyProfile);
    expect(placeholders.FRAMEWORK).toBe('no standard framework detected');
    expect(placeholders.LANGUAGES).toBe('Unknown');
    expect(placeholders.SCAN_CONFIDENCE_NOTICE).toBe('');
  });

  it('uses hedged language for minimal scan quality', () => {
    const minimalProfile: ProjectProfile = {
      ...mockProfile,
      languages: [],
      frameworks: [],
      scanQuality: { quality: 'minimal', score: 1, signals: [], missingSignals: ['No languages detected'] },
    };
    const placeholders = buildPlaceholders('/tmp/mystery', minimalProfile);
    expect(placeholders.FRAMEWORK).toContain('not yet identified');
    expect(placeholders.LANGUAGES).toContain('not yet identified');
    expect(placeholders.SCAN_CONFIDENCE_NOTICE).toContain('minimal results');
    expect(placeholders.SCAN_CONFIDENCE_NOTICE).toContain('Ask clarifying questions');
  });

  it('uses hedged language for basic scan quality', () => {
    const basicProfile: ProjectProfile = {
      ...mockProfile,
      languages: [{ name: 'Python', fileCount: 5, percentage: 100 }],
      frameworks: [{ name: 'Flask', confidence: 'medium' }],
      scanQuality: { quality: 'basic', score: 4, signals: [], missingSignals: [] },
    };
    const placeholders = buildPlaceholders('/tmp/basic', basicProfile);
    expect(placeholders.FRAMEWORK).toContain('possibly Flask');
    expect(placeholders.FRAMEWORK).toContain('not confirmed');
    expect(placeholders.SCAN_CONFIDENCE_NOTICE).toContain('Verify assumptions');
  });

  it('uses confident language for rich scan quality', () => {
    const placeholders = buildPlaceholders('/tmp/rich', {
      ...mockProfile,
      scanQuality: { quality: 'rich', score: 8, signals: [], missingSignals: [] },
    });
    expect(placeholders.FRAMEWORK).toBe('Django');
    expect(placeholders.LANGUAGES).toBe('Python, JavaScript');
    expect(placeholders.SCAN_CONFIDENCE_NOTICE).toBe('');
  });

  it('separates high and medium confidence frameworks', () => {
    const mixedProfile: ProjectProfile = {
      ...mockProfile,
      frameworks: [
        { name: 'Next.js', confidence: 'high', version: '16' },
        { name: 'TailwindCSS', confidence: 'high' },
        { name: 'Prisma', confidence: 'medium' },
      ],
    };
    const placeholders = buildPlaceholders('/tmp/mixed', mixedProfile);
    expect(placeholders.FRAMEWORK).toContain('Next.js');
    expect(placeholders.FRAMEWORK).toContain('TailwindCSS');
    expect(placeholders.FRAMEWORK).toContain('possibly also Prisma');
  });
});

describe('generateCoreAgents', () => {
  it('generates all 5 core agents in empty directory', async () => {
    const agentsDir = '.claude/agents';
    const result = await generateCoreAgents(TEST_DIR, agentsDir, mockProfile);

    expect(result.generated).toHaveLength(5);
    expect(result.skipped).toHaveLength(0);
    expect(result.generated).toEqual(CORE_AGENTS.map(n => `${n}.md`));

    // Verify files exist and contain filled placeholders
    const architectContent = await readFile(
      path.join(TEST_DIR, agentsDir, 'architect.md'),
      'utf-8'
    );
    expect(architectContent).toContain(path.basename(TEST_DIR)); // PROJECT_NAME
    expect(architectContent).toContain('Django'); // FRAMEWORK
    expect(architectContent).not.toContain('{{PROJECT_NAME}}'); // No unresolved placeholders
  });

  it('skips agents that already exist', async () => {
    const agentsDir = '.claude/agents';
    const absAgentsDir = path.join(TEST_DIR, agentsDir);
    await mkdir(absAgentsDir, { recursive: true });

    // Create an existing architect agent
    await writeFile(
      path.join(absAgentsDir, 'architect.md'),
      '# Custom Architect\nMy custom agent.',
      'utf-8'
    );

    const result = await generateCoreAgents(TEST_DIR, agentsDir, mockProfile);

    expect(result.generated).toHaveLength(4);
    expect(result.skipped).toEqual(['architect.md']);

    // Verify custom agent was NOT overwritten
    const content = await readFile(path.join(absAgentsDir, 'architect.md'), 'utf-8');
    expect(content).toBe('# Custom Architect\nMy custom agent.');
  });

  it('creates .claude/agents directory if it does not exist', async () => {
    const agentsDir = '.claude/agents';
    await generateCoreAgents(TEST_DIR, agentsDir, mockProfile);

    // Directory should now exist
    await expect(access(path.join(TEST_DIR, agentsDir))).resolves.toBeUndefined();
  });
});
