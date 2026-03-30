import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hashItem } from '@/lib/utils';
import { extractTags, buildTagIndex, recallByTopic } from '@/lib/tag-index';
import { mkdtemp, writeFile, rm, readFile, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Test the tag extraction logic directly
// These are the 4 targeted integration tests from the sprint planning meeting

const TAG_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED|IDEA)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

describe('Tag extraction regex', () => {
  it('matches bracket format tags', () => {
    const cases = [
      { input: '- [DECISION] Use JWT for authentication', type: 'DECISION', slug: null, text: 'Use JWT for authentication' },
      { input: '- [OPEN:auth-flow] How should token refresh work?', type: 'OPEN', slug: 'auth-flow', text: 'How should token refresh work?' },
      { input: '- [ACTION] Build login endpoint — assigned to developer', type: 'ACTION', slug: null, text: 'Build login endpoint — assigned to developer' },
      { input: '- [RESOLVED:auth-flow] Decided: use refresh tokens with 7-day expiry', type: 'RESOLVED', slug: 'auth-flow', text: 'Decided: use refresh tokens with 7-day expiry' },
      { input: '- [IDEA] Consider OAuth2 for third-party integrations', type: 'IDEA', slug: null, text: 'Consider OAuth2 for third-party integrations' },
    ];

    for (const c of cases) {
      const match = c.input.match(TAG_REGEX);
      expect(match, `Should match: ${c.input}`).not.toBeNull();
      expect(match![1].toUpperCase()).toBe(c.type);
      expect(match![2]?.toLowerCase() ?? null).toBe(c.slug);
      expect(match![3].trim()).toBe(c.text);
    }
  });

  it('matches colon format tags (legacy)', () => {
    const cases = [
      { input: 'DECISION: Use PostgreSQL', type: 'DECISION' },
      { input: '  - ACTION: Deploy to staging', type: 'ACTION' },
    ];

    for (const c of cases) {
      const match = c.input.match(TAG_REGEX);
      expect(match, `Should match legacy: ${c.input}`).not.toBeNull();
      expect(match![1].toUpperCase()).toBe(c.type);
    }
  });

  it('does not match plain text', () => {
    const nonMatches = [
      'This is a regular sentence about decisions',
      'The action was taken yesterday',
      'We resolved the issue manually',
      '**project-manager:** I think we should decide...',
    ];

    for (const text of nonMatches) {
      const match = text.match(TAG_REGEX);
      expect(match, `Should NOT match: ${text}`).toBeNull();
    }
  });
});

describe('JSON appendix parsing', () => {
  it('extracts structured data from meeting-outcomes comment', () => {
    const content = `# Design Review: API Auth

## Summary
- [DECISION] Use JWT

<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [
    { "text": "Use JWT for authentication", "rationale": "Industry standard" }
  ],
  "actions": [
    { "text": "Build login endpoint", "assignee": "developer", "effort": "2 hours" }
  ],
  "open_questions": [
    { "slug": "token-refresh", "text": "How should refresh tokens work?" }
  ],
  "resolved": []
}
-->`;

    const jsonMatch = content.match(/<!--\s*meeting-outcomes\s*\n([\s\S]*?)\n(?:meeting-outcomes\s*)?-->/);
    expect(jsonMatch).not.toBeNull();

    const data = JSON.parse(jsonMatch![1]);
    expect(data.schema_version).toBe(1);
    expect(data.decisions).toHaveLength(1);
    expect(data.decisions[0].text).toBe('Use JWT for authentication');
    expect(data.actions).toHaveLength(1);
    expect(data.actions[0].assignee).toBe('developer');
    expect(data.open_questions).toHaveLength(1);
    expect(data.open_questions[0].slug).toBe('token-refresh');
    expect(data.resolved).toHaveLength(0);
  });

  it('handles plain string entries in decisions/actions/open_questions', () => {
    const content = `<!-- status: complete -->
# Design Review: Navigation

<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [
    "Use filter chips for type filtering",
    "Defer outcome-aware search"
  ],
  "actions": [
    "Implement filter chips in MeetingList.tsx"
  ],
  "open_questions": [
    { "slug": "outcome-search", "text": "Build when type filter alone proves insufficient" }
  ]
}
meeting-outcomes -->`;

    const tags = extractTags(content, '2026-03-30-design-review-navigation.md');
    expect(tags).toHaveLength(4);
    expect(tags[0]).toMatchObject({ type: 'DECISION', text: 'Use filter chips for type filtering' });
    expect(tags[1]).toMatchObject({ type: 'DECISION', text: 'Defer outcome-aware search' });
    expect(tags[2]).toMatchObject({ type: 'ACTION', text: 'Implement filter chips in MeetingList.tsx' });
    expect(tags[3]).toMatchObject({ type: 'OPEN', id: 'outcome-search' });
  });
});

describe('Meeting metadata parsing', () => {
  it('extracts metadata from HTML comments', () => {
    const content = `<!-- meeting-type: design-review -->
<!-- status: complete -->
<!-- created: 2026-03-28 14:30 -->
<!-- participants: project-manager, critic, north-star -->

# Design Review: API Authentication

## Context
Some context here.`;

    const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
    expect(statusMatch![1]).toBe('complete');

    const typeMatch = content.match(/<!--\s*(?:meeting-)?type:\s*(.+?)\s*-->/);
    expect(typeMatch![1]).toBe('design-review');

    const participantsMatch = content.match(/<!--\s*participants:\s*(.+?)\s*-->/);
    const participants = participantsMatch![1].split(',').map(p => p.trim());
    expect(participants).toEqual(['project-manager', 'critic', 'north-star']);

    const titleMatch = content.match(/^#\s+(.+)$/m);
    expect(titleMatch![1]).toBe('Design Review: API Authentication');
  });
});

describe('Roadmap item hashing', () => {
  it('produces consistent hashes for same input', () => {
    const hash1 = hashItem('Build login endpoint', 'meeting-1.md');
    const hash2 = hashItem('Build login endpoint', 'meeting-1.md');
    const hash3 = hashItem('Build login endpoint', 'meeting-2.md');

    expect(hash1).toBe(hash2); // same input → same hash
    expect(hash1).not.toBe(hash3); // different meeting → different hash
    expect(hash1).toHaveLength(8); // always 8 hex chars
  });
});

describe('Tag summary extraction', () => {
  const TAG_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED|IDEA)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

  function extractTagsFromSummary(content: string): { type: string; id: string | null; text: string }[] {
    const lines = content.split('\n');
    const summaryIndex = lines.findIndex(l => l.trim() === '## Summary');
    const startLine = summaryIndex >= 0 ? summaryIndex : 0;
    const results = [];

    for (let i = startLine; i < lines.length; i++) {
      const match = lines[i].match(TAG_REGEX);
      if (match) {
        results.push({
          type: match[1].toUpperCase(),
          id: match[2]?.toLowerCase() ?? null,
          text: match[3].trim(),
        });
      }
    }
    return results;
  }

  it('extracts tags only from summary section of complete meetings', () => {
    const content = `<!-- status: complete -->
# My Meeting

## Round 1

### Developer (Round 1)
DECISION: This is a round decision that should be excluded

## Summary

- [DECISION] This is the real decision from the summary
- [ACTION] Do the thing — assigned to developer`;

    const tags = extractTagsFromSummary(content);
    // Should NOT include the round decision since we start from summary
    expect(tags.some(t => t.text.includes('round decision'))).toBe(false);
    expect(tags.some(t => t.text.includes('real decision'))).toBe(true);
    expect(tags.some(t => t.type === 'ACTION')).toBe(true);
  });

  it('extracts OPEN tags with slugs', () => {
    const content = `## Summary

- [OPEN:auth-tokens] How should refresh tokens work?
- [OPEN] What is the fallback strategy?`;

    const tags = extractTagsFromSummary(content);
    const withSlug = tags.find(t => t.id === 'auth-tokens');
    const withoutSlug = tags.find(t => t.id === null && t.type === 'OPEN');

    expect(withSlug).toBeDefined();
    expect(withSlug?.text).toContain('How should refresh tokens');
    expect(withoutSlug).toBeDefined();
  });

  it('handles RESOLVED tags with slugs', () => {
    const content = `## Summary

- [RESOLVED:auth-tokens] Decided: use rotating refresh tokens`;

    const tags = extractTagsFromSummary(content);
    expect(tags[0].type).toBe('RESOLVED');
    expect(tags[0].id).toBe('auth-tokens');
    expect(tags[0].text).toContain('rotating refresh tokens');
  });

  it('handles IDEA tags', () => {
    const content = `## Summary

- [IDEA] Build an integrator that tracks decisions across commits`;

    const tags = extractTagsFromSummary(content);
    expect(tags[0].type).toBe('IDEA');
    expect(tags[0].text).toContain('integrator');
  });

  it('returns empty array for content without tags', () => {
    const content = `# Meeting

## Summary

Nothing tagged here. Just prose.`;

    const tags = extractTagsFromSummary(content);
    expect(tags).toHaveLength(0);
  });
});

describe('JSON appendix extraction', () => {
  function extractFromJSON(content: string): { decisions: number; actions: number; open: number; resolved: number } | null {
    const jsonMatch = content.match(/<!--\s*meeting-outcomes\s*\n([\s\S]*?)\n(?:meeting-outcomes\s*)?-->/);
    if (!jsonMatch) return null;
    try {
      const data = JSON.parse(jsonMatch[1]);
      if (!data.schema_version) return null;
      return {
        decisions: (data.decisions ?? []).length,
        actions: (data.actions ?? []).length,
        open: (data.open_questions ?? []).length,
        resolved: (data.resolved ?? []).length,
      };
    } catch {
      return null;
    }
  }

  it('returns null when no JSON appendix present', () => {
    expect(extractFromJSON('# Plain markdown\n\n- [DECISION] Some decision')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const content = `<!-- meeting-outcomes
{ invalid json
-->`;
    expect(extractFromJSON(content)).toBeNull();
  });

  it('returns null when schema_version is missing', () => {
    const content = `<!-- meeting-outcomes
{"decisions": []}
-->`;
    expect(extractFromJSON(content)).toBeNull();
  });

  it('extracts counts from valid JSON appendix', () => {
    const content = `# Meeting

<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [
    { "text": "Use TypeScript", "rationale": "Type safety" },
    { "text": "Use Drizzle ORM" }
  ],
  "actions": [
    { "text": "Set up database schema", "assignee": "developer" }
  ],
  "open_questions": [
    { "slug": "deployment-target", "text": "Where do we deploy?" }
  ],
  "resolved": []
}
-->`;

    const result = extractFromJSON(content);
    expect(result).not.toBeNull();
    expect(result!.decisions).toBe(2);
    expect(result!.actions).toBe(1);
    expect(result!.open).toBe(1);
    expect(result!.resolved).toBe(0);
  });

  it('handles empty arrays in appendix', () => {
    const content = `<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [],
  "actions": [],
  "open_questions": [],
  "resolved": []
}
-->`;
    const result = extractFromJSON(content);
    expect(result).not.toBeNull();
    expect(result!.decisions).toBe(0);
  });

  it('handles missing optional fields in appendix', () => {
    const content = `<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [{ "text": "Decision only" }]
}
-->`;
    const result = extractFromJSON(content);
    expect(result).not.toBeNull();
    expect(result!.decisions).toBe(1);
    expect(result!.actions).toBe(0);
    expect(result!.open).toBe(0);
    expect(result!.resolved).toBe(0);
  });

  it('parses the "meeting-outcomes -->" closing format', () => {
    // This is the format produced by formatOutcomesAppendix
    const content = `<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [{ "text": "Use JWT" }],
  "actions": [{ "text": "Build auth", "assignee": "developer" }]
}
meeting-outcomes -->`;
    const result = extractFromJSON(content);
    expect(result).not.toBeNull();
    expect(result!.decisions).toBe(1);
    expect(result!.actions).toBe(1);
  });

  it('parses formatOutcomesAppendix output (includes schema_version)', () => {
    // formatOutcomesAppendix now includes schema_version and uses open_questions
    const content = `<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [{ "text": "Ship it" }],
  "open_questions": [{ "text": "Token rotation?", "slug": "token-refresh" }]
}
meeting-outcomes -->`;
    const result = extractFromJSON(content);
    expect(result).not.toBeNull();
    expect(result!.decisions).toBe(1);
    expect(result!.open).toBe(1);
  });
});

describe('RESOLVED tags after JSON appendix', () => {
  it('picks up [RESOLVED:slug] appended after JSON appendix', () => {
    const content = `# Design Review: Auth

## Summary

- [DECISION] Use JWT for auth
- [OPEN:token-refresh] How often should tokens rotate?

<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [{ "text": "Use JWT for auth" }],
  "open_questions": [{ "text": "How often should tokens rotate?", "slug": "token-refresh" }],
  "resolved": []
}
meeting-outcomes -->

[RESOLVED:token-refresh] Decided: rotate every 7 days based on security audit`;

    const tags = extractTags(content, '2026-03-31-auth.md');
    const resolved = tags.filter(t => t.type === 'RESOLVED');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('token-refresh');
    expect(resolved[0].text).toContain('rotate every 7 days');
  });

  it('still extracts JSON entries alongside appended RESOLVED tags', () => {
    const content = `# Meeting

<!-- meeting-outcomes
{
  "schema_version": 1,
  "decisions": [{ "text": "Ship the feature" }],
  "open_questions": [{ "text": "Deadline?", "slug": "deadline" }],
  "resolved": []
}
meeting-outcomes -->

[RESOLVED:deadline] Set for March 15`;

    const tags = extractTags(content, '2026-03-31-test.md');
    expect(tags.filter(t => t.type === 'DECISION')).toHaveLength(1);
    expect(tags.filter(t => t.type === 'OPEN')).toHaveLength(1);
    expect(tags.filter(t => t.type === 'RESOLVED')).toHaveLength(1);
  });
});

describe('Future considerations section', () => {
  it('skips tags inside Future considerations section', () => {
    const content = `# Test Meeting

## Summary

### Decisions Made
- [DECISION] Real decision that should be indexed

### Future considerations
- [OPEN:speculative] Some speculative question that should NOT be indexed
- [ACTION] Speculative action that should NOT be indexed

### Recommended Next Meetings
- [ACTION] This action is after future considerations and SHOULD be indexed`;

    const tags = extractTags(content, '2026-03-31-test.md');
    expect(tags.some(t => t.text.includes('Real decision'))).toBe(true);
    expect(tags.some(t => t.text.includes('speculative'))).toBe(false);
    expect(tags.some(t => t.text.includes('after future considerations'))).toBe(true);
  });

  it('handles ## Future considerations heading level', () => {
    const content = `# Test Meeting

## Summary

- [DECISION] Keep this

## Future considerations
- [OPEN:skip-me] Should be skipped

## Other Section
- [ACTION] Keep this too`;

    const tags = extractTags(content, '2026-03-31-test2.md');
    expect(tags).toHaveLength(2);
    expect(tags.some(t => t.id === 'skip-me')).toBe(false);
  });
});

describe('recallByTopic', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'recall-test-'));

    // Create a meeting with decisions about authentication
    await writeFile(path.join(tmpDir, '2026-03-30-auth-review.md'), `---
type: design-review
status: complete
---

# Design Review: Authentication Strategy

## Round 1

The team discussed authentication approaches for the API.

## Summary

- [DECISION] Use JWT tokens with 15-minute expiry for API authentication — balances security and UX
- [DECISION] Store refresh tokens in HTTP-only cookies — prevents XSS attacks
- [OPEN:auth-logout] How should logout invalidate tokens across all devices?
`);

    // Create a meeting with decisions about caching
    await writeFile(path.join(tmpDir, '2026-03-29-cache-strategy.md'), `---
type: strategy
status: complete
---

# Strategy: Caching Strategy

## Summary

- [DECISION] Use Redis for session caching with 1-hour TTL
- [ACTION] Implement cache invalidation on user profile update
`);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds decisions matching a topic keyword', async () => {
    const results = await recallByTopic(tmpDir, 'authentication');
    expect(results.length).toBeGreaterThan(0);
    // Should find JWT and refresh token decisions
    const texts = results.map(r => r.text);
    expect(texts.some(t => t.includes('JWT'))).toBe(true);
  });

  it('returns open questions in recall results', async () => {
    const results = await recallByTopic(tmpDir, 'auth logout');
    const openItems = results.filter(r => r.type === 'OPEN');
    expect(openItems.length).toBeGreaterThan(0);
    expect(openItems[0].text).toContain('logout');
  });

  it('does not return actions (only decisions and open questions)', async () => {
    const results = await recallByTopic(tmpDir, 'cache invalidation');
    const actions = results.filter(r => r.type === 'ACTION');
    expect(actions.length).toBe(0);
  });

  it('ranks direct text matches higher than title matches', async () => {
    const results = await recallByTopic(tmpDir, 'JWT');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain('JWT');
  });

  it('returns empty array for unmatched topic', async () => {
    const results = await recallByTopic(tmpDir, 'blockchain quantum');
    expect(results).toEqual([]);
  });

  it('respects the limit parameter', async () => {
    const results = await recallByTopic(tmpDir, 'authentication', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('includes context snippets from the meeting file', async () => {
    const results = await recallByTopic(tmpDir, 'JWT');
    expect(results.length).toBeGreaterThan(0);
    // Context should include nearby lines from the meeting
    expect(results[0].context).toBeTruthy();
  });

  it('filters by dateFrom', async () => {
    // Only 2026-03-30 meeting should match
    const results = await recallByTopic(tmpDir, 'authentication', { dateFrom: '2026-03-30' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.date! >= '2026-03-30')).toBe(true);
  });

  it('filters by dateTo', async () => {
    // Only 2026-03-29 meeting should match
    const results = await recallByTopic(tmpDir, 'Redis', { dateTo: '2026-03-29' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.date! <= '2026-03-29')).toBe(true);
  });

  it('filters by date range', async () => {
    // Narrow range that excludes the cache meeting
    const results = await recallByTopic(tmpDir, 'JWT', { dateFrom: '2026-03-30', dateTo: '2026-03-30' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.date === '2026-03-30')).toBe(true);
  });

  it('returns empty when date range excludes all matches', async () => {
    const results = await recallByTopic(tmpDir, 'JWT', { dateFrom: '2027-01-01' });
    expect(results).toEqual([]);
  });

  it('includes actions when types includes action', async () => {
    const results = await recallByTopic(tmpDir, 'cache invalidation', { types: ['action'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.type === 'ACTION')).toBe(true);
  });

  it('excludes decisions when types only includes action', async () => {
    const results = await recallByTopic(tmpDir, 'Redis', { types: ['action'] });
    const decisions = results.filter(r => r.type === 'DECISION');
    expect(decisions.length).toBe(0);
  });

  it('combines type and date filters', async () => {
    const results = await recallByTopic(tmpDir, 'authentication', {
      types: ['decision', 'open'],
      dateFrom: '2026-03-30',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.type === 'DECISION' || r.type === 'OPEN')).toBe(true);
    expect(results.every(r => r.date! >= '2026-03-30')).toBe(true);
  });
});

describe('buildTagIndex caching', () => {
  let cacheDir: string;
  const cacheName = '.council-tag-cache.json';

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'cache-test-'));
  });

  afterAll(async () => {
    // Best-effort cleanup (beforeEach creates new dirs)
  });

  it('creates a cache file on first build', async () => {
    await writeFile(path.join(cacheDir, '2026-01-01-test.md'), `# Test\n\n- [DECISION] Ship it`);
    await buildTagIndex(cacheDir);

    const cacheExists = await stat(path.join(cacheDir, cacheName)).then(() => true, () => false);
    expect(cacheExists).toBe(true);
  });

  it('returns cached results on second call (cache hit)', async () => {
    await writeFile(path.join(cacheDir, '2026-01-01-test.md'), `# Test\n\n- [DECISION] Ship it`);

    const first = await buildTagIndex(cacheDir);
    const second = await buildTagIndex(cacheDir);

    expect(first.decisions).toHaveLength(1);
    expect(second.decisions).toHaveLength(1);
    expect(first.decisions[0].text).toBe(second.decisions[0].text);
  });

  it('detects new files and rebuilds (cache miss)', async () => {
    await writeFile(path.join(cacheDir, '2026-01-01-test.md'), `# Test\n\n- [DECISION] Decision A`);
    const first = await buildTagIndex(cacheDir);
    expect(first.decisions).toHaveLength(1);

    // Add a new file
    await writeFile(path.join(cacheDir, '2026-01-02-test2.md'), `# Test 2\n\n- [DECISION] Decision B`);
    const second = await buildTagIndex(cacheDir);
    expect(second.decisions).toHaveLength(2);
  });

  it('detects modified files and re-indexes them', async () => {
    const filePath = path.join(cacheDir, '2026-01-01-test.md');
    await writeFile(filePath, `# Test\n\n- [DECISION] Old decision`);
    const first = await buildTagIndex(cacheDir);
    expect(first.decisions[0].text).toBe('Old decision');

    // Wait briefly so mtime changes, then overwrite
    await new Promise(r => setTimeout(r, 50));
    await writeFile(filePath, `# Test\n\n- [DECISION] New decision`);
    const second = await buildTagIndex(cacheDir);
    expect(second.decisions[0].text).toBe('New decision');
  });

  it('handles deleted files by removing their entries', async () => {
    await writeFile(path.join(cacheDir, '2026-01-01-keep.md'), `# Keep\n\n- [DECISION] Keep this`);
    await writeFile(path.join(cacheDir, '2026-01-02-delete.md'), `# Delete\n\n- [DECISION] Remove this`);

    const first = await buildTagIndex(cacheDir);
    expect(first.decisions).toHaveLength(2);

    // Delete one file
    await unlink(path.join(cacheDir, '2026-01-02-delete.md'));
    const second = await buildTagIndex(cacheDir);
    expect(second.decisions).toHaveLength(1);
    expect(second.decisions[0].text).toBe('Keep this');
  });

  it('uses atomic writes (tmp file renamed)', async () => {
    await writeFile(path.join(cacheDir, '2026-01-01-test.md'), `# Test\n\n- [DECISION] Ship it`);
    await buildTagIndex(cacheDir);

    // The .tmp file should not exist after successful write
    const tmpExists = await stat(path.join(cacheDir, cacheName + '.tmp')).then(() => true, () => false);
    expect(tmpExists).toBe(false);

    // But the cache file should exist
    const cacheContent = await readFile(path.join(cacheDir, cacheName), 'utf-8');
    const parsed = JSON.parse(cacheContent);
    expect(parsed.index.decisions).toHaveLength(1);
    expect(parsed.mtimes).toHaveProperty('2026-01-01-test.md');
  });
});
