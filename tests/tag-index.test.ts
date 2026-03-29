import { describe, it, expect } from 'vitest';
import { hashItem } from '@/lib/utils';

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

    const jsonMatch = content.match(/<!--\s*meeting-outcomes\s*\n([\s\S]*?)\n\s*-->/);
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
    const jsonMatch = content.match(/<!--\s*meeting-outcomes\s*\n([\s\S]*?)\n\s*-->/);
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
});
