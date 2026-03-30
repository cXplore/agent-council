import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  appendContextLearnings,
  appendCorrection,
  trimContextFile,
  getContextHealth,
  parseLearningDate,
  MAX_LEARNING_LINES,
} from '../lib/context-files';
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

const SAMPLE_WITH_CORRECTIONS = `# test-agent — Context

## Meeting Learnings
- [2026-03-01] First learning
- [2026-03-02] Second learning

## Corrections
- [2026-03-03] [CORRECTION] In strategy meeting, claimed API uses REST. Actual: uses GraphQL. Update: agent now knows API is GraphQL.

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

describe('parseLearningDate', () => {
  it('parses date from standard format', () => {
    const d = parseLearningDate('- [2026-03-15 strategy] Some learning');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2); // March = 2
    expect(d!.getDate()).toBe(15);
  });

  it('parses date without meeting type', () => {
    const d = parseLearningDate('- [2026-01-05] Plain entry');
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(0); // January
  });

  it('returns null for entries without dates', () => {
    expect(parseLearningDate('- No date here')).toBeNull();
    expect(parseLearningDate('- Some random entry')).toBeNull();
  });

  it('returns null for invalid dates', () => {
    expect(parseLearningDate('- [2026-13-45] Bad date')).toBeNull();
  });
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

  it('preserves corrections section when appending learnings', async () => {
    await writeFile(TEST_FILE, SAMPLE_WITH_CORRECTIONS, 'utf-8');
    await appendContextLearnings(TEST_FILE, ['[2026-03-04] New learning']);
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('[CORRECTION]');
    expect(content).toContain('[2026-03-04] New learning');
  });
});

describe('appendCorrection', () => {
  it('adds a correction to a file without corrections section', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    await appendCorrection(TEST_FILE, '[2026-03-04] [CORRECTION] Claimed X. Actual: Y.');
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('## Corrections');
    expect(content).toContain('[CORRECTION] Claimed X. Actual: Y.');
  });

  it('appends to existing corrections section', async () => {
    await writeFile(TEST_FILE, SAMPLE_WITH_CORRECTIONS, 'utf-8');
    await appendCorrection(TEST_FILE, '[2026-03-05] [CORRECTION] Second correction.');
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('API uses REST');
    expect(content).toContain('Second correction');
  });

  it('auto-prefixes with dash', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    await appendCorrection(TEST_FILE, 'no dash correction');
    const content = await readFile(TEST_FILE, 'utf-8');
    expect(content).toContain('- no dash correction');
  });

  it('caps corrections at maxCorrections', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    for (let i = 0; i < 5; i++) {
      await appendCorrection(TEST_FILE, `[2026-03-0${i + 1}] Correction ${i + 1}`, 3);
    }
    const content = await readFile(TEST_FILE, 'utf-8');
    // Only last 3 should remain
    expect(content).not.toContain('Correction 1');
    expect(content).not.toContain('Correction 2');
    expect(content).toContain('Correction 3');
    expect(content).toContain('Correction 4');
    expect(content).toContain('Correction 5');
  });

  it('corrections are NOT trimmed by learning rolling window', async () => {
    await writeFile(TEST_FILE, SAMPLE_WITH_CORRECTIONS, 'utf-8');
    // Add many learnings to trigger trimming
    const entries = Array.from({ length: 55 }, (_, i) => `[2026-04-${String(i + 1).padStart(2, '0')}] Learning ${i + 1}`);
    await appendContextLearnings(TEST_FILE, entries);
    const content = await readFile(TEST_FILE, 'utf-8');
    // Corrections should persist
    expect(content).toContain('[CORRECTION]');
    expect(content).toContain('API uses REST');
  });

  it('creates file if it does not exist', async () => {
    const newFile = path.join(TEST_DIR, 'corrected-agent.context.md');
    try {
      await appendCorrection(newFile, '[2026-03-01] [CORRECTION] Was wrong about X.');
      const content = await readFile(newFile, 'utf-8');
      expect(content).toContain('# corrected-agent — Context');
      expect(content).toContain('[CORRECTION]');
    } finally {
      try { await unlink(newFile); } catch { /* ignore */ }
    }
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

describe('getContextHealth', () => {
  it('returns empty health for nonexistent file', async () => {
    const health = await getContextHealth('/nonexistent/file.context.md');
    expect(health.agent).toBe('file');
    expect(health.totalLearnings).toBe(0);
    expect(health.totalCorrections).toBe(0);
    expect(health.oldestEntryDate).toBeNull();
    expect(health.newestEntryDate).toBeNull();
    expect(health.staleEntries).toBe(0);
    expect(health.capacityUsed).toBe(0);
  });

  it('reports correct stats for file with entries', async () => {
    await writeFile(TEST_FILE, SAMPLE_CONTEXT, 'utf-8');
    const health = await getContextHealth(TEST_FILE);
    expect(health.agent).toBe('test-agent');
    expect(health.totalLearnings).toBe(3);
    expect(health.totalCorrections).toBe(0);
    expect(health.oldestEntryDate).toBe('2026-03-01');
    expect(health.newestEntryDate).toBe('2026-03-03');
    expect(health.capacityUsed).toBe(Math.round((3 / MAX_LEARNING_LINES) * 100));
  });

  it('reports corrections count', async () => {
    await writeFile(TEST_FILE, SAMPLE_WITH_CORRECTIONS, 'utf-8');
    const health = await getContextHealth(TEST_FILE);
    expect(health.totalLearnings).toBe(2);
    expect(health.totalCorrections).toBe(1);
  });

  it('detects stale entries', async () => {
    // Create entries from 60 days ago
    const oldDate = '2025-01-01';
    const content = `# test — Context\n\n## Meeting Learnings\n- [${oldDate}] Old entry\n- [2026-03-29] Recent entry\n\n## Project Conventions\n_Reserved._\n\n## Domain Knowledge\n_Reserved._\n`;
    await writeFile(TEST_FILE, content, 'utf-8');

    const now = new Date('2026-03-30');
    const health = await getContextHealth(TEST_FILE, now);
    expect(health.staleEntries).toBe(1);
    expect(health.oldestEntryDate).toBe('2025-01-01');
    expect(health.newestEntryDate).toBe('2026-03-29');
  });

  it('reports 0 stale when all entries are recent', async () => {
    const content = `# test — Context\n\n## Meeting Learnings\n- [2026-03-28] Entry 1\n- [2026-03-29] Entry 2\n\n## Project Conventions\n_Reserved._\n\n## Domain Knowledge\n_Reserved._\n`;
    await writeFile(TEST_FILE, content, 'utf-8');

    const now = new Date('2026-03-30');
    const health = await getContextHealth(TEST_FILE, now);
    expect(health.staleEntries).toBe(0);
  });

  it('handles entries without dates gracefully', async () => {
    const content = `# test — Context\n\n## Meeting Learnings\n- No date here\n- [2026-03-01] Has date\n- Also no date\n\n## Project Conventions\n_Reserved._\n\n## Domain Knowledge\n_Reserved._\n`;
    await writeFile(TEST_FILE, content, 'utf-8');

    const health = await getContextHealth(TEST_FILE);
    expect(health.totalLearnings).toBe(3);
    expect(health.oldestEntryDate).toBe('2026-03-01');
    expect(health.newestEntryDate).toBe('2026-03-01');
  });
});
