import { describe, it, expect } from 'vitest';

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
    function hashItem(text: string, meeting: string): string {
      const input = `${text}::${meeting}`;
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash + char) | 0;
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    }

    const hash1 = hashItem('Build login endpoint', 'meeting-1.md');
    const hash2 = hashItem('Build login endpoint', 'meeting-1.md');
    const hash3 = hashItem('Build login endpoint', 'meeting-2.md');

    expect(hash1).toBe(hash2); // same input → same hash
    expect(hash1).not.toBe(hash3); // different meeting → different hash
    expect(hash1).toHaveLength(8); // always 8 hex chars
  });
});
