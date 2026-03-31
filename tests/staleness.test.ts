import { describe, it, expect } from 'vitest';
import {
  tokenize,
  jaccardSimilarity,
  checkStaleness,
  getDoneItems,
} from '@/lib/staleness';
import { hashItem, stableActionKey } from '@/lib/utils';
import type { TagIndex } from '@/lib/tag-index';
import type { DoneItem, PlannedMeetingInput } from '@/lib/staleness';

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric', () => {
    const tokens = tokenize('Token Rotation Strategy');
    expect(tokens.has('token')).toBe(true);
    expect(tokens.has('rotation')).toBe(true);
  });

  it('removes common stop words', () => {
    const tokens = tokenize('the best way to handle authentication');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('way')).toBe(true);
    expect(tokens.has('handle')).toBe(true);
    expect(tokens.has('authentication')).toBe(true);
  });

  it('removes meeting-type noise words', () => {
    const tokens = tokenize('Design Review: Token rotation strategy');
    expect(tokens.has('design')).toBe(false);
    expect(tokens.has('review')).toBe(false);
    expect(tokens.has('strategy')).toBe(false);
    expect(tokens.has('token')).toBe(true);
    expect(tokens.has('rotation')).toBe(true);
  });

  it('removes action noise words', () => {
    const tokens = tokenize('Build authentication middleware — assigned to developer');
    expect(tokens.has('build')).toBe(false);
    expect(tokens.has('assigned')).toBe(false);
    expect(tokens.has('authentication')).toBe(true);
    expect(tokens.has('middleware')).toBe(true);
    expect(tokens.has('developer')).toBe(true);
  });

  it('removes words 2 chars or shorter', () => {
    const tokens = tokenize('an API to do IO');
    expect(tokens.has('an')).toBe(false);
    expect(tokens.has('to')).toBe(false);
    expect(tokens.has('do')).toBe(false);
    expect(tokens.has('api')).toBe(true);
  });

  it('returns empty set for empty string', () => {
    expect(tokenize('').size).toBe(0);
  });

  it('handles special characters', () => {
    const tokens = tokenize('[OPEN:auth-flow] How should refresh tokens work?');
    expect(tokens.has('auth')).toBe(true);
    expect(tokens.has('flow')).toBe(true);
    expect(tokens.has('refresh')).toBe(true);
    expect(tokens.has('tokens')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    const s = new Set(['token', 'rotation']);
    expect(jaccardSimilarity(s, s)).toBe(1);
  });

  it('returns 0.0 for completely disjoint sets', () => {
    const a = new Set(['token', 'rotation']);
    const b = new Set(['database', 'schema']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns correct fraction for partial overlap', () => {
    const a = new Set(['token', 'rotation', 'strategy']);
    const b = new Set(['token', 'rotation', 'middleware']);
    // intersection: {token, rotation} = 2
    // union: {token, rotation, strategy, middleware} = 4
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5);
  });

  it('returns 0 for two empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it('returns 0 when one set is empty', () => {
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0);
  });

  it('is symmetric', () => {
    const a = new Set(['token', 'auth']);
    const b = new Set(['token', 'rotation', 'middleware']);
    expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a));
  });
});

// ---------------------------------------------------------------------------
// checkStaleness
// ---------------------------------------------------------------------------

function makePlanned(overrides: Partial<PlannedMeetingInput> = {}): PlannedMeetingInput {
  return {
    id: 'plan_test',
    type: 'design-review',
    topic: 'Token rotation strategy',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeDoneItem(text: string): DoneItem {
  return { text, tokens: tokenize(text) };
}

describe('checkStaleness', () => {
  it('flags a planned meeting when a done item shares keywords', () => {
    const planned = [makePlanned({ topic: 'Token rotation strategy' })];
    const done = [makeDoneItem('Build token rotation middleware — assigned to developer')];

    const results = checkStaleness(planned, done);
    expect(results[0].staleness.isStale).toBe(true);
    expect(results[0].staleness.reason).toBe('keyword_match');
    expect(results[0].staleness.matchedItems.length).toBeGreaterThan(0);
    expect(results[0].staleness.matchedItems[0].text).toContain('token rotation');
  });

  it('does not flag a fresh meeting with no keyword overlap', () => {
    const planned = [makePlanned({ topic: 'Database migration plan' })];
    const done = [makeDoneItem('Fix CSS regression on the dashboard')];

    const results = checkStaleness(planned, done);
    expect(results[0].staleness.isStale).toBe(false);
    expect(results[0].staleness.reason).toBeNull();
    expect(results[0].staleness.matchedItems).toHaveLength(0);
  });

  it('flags old meetings by age even without keyword matches', () => {
    const oldDate = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
    const planned = [makePlanned({ topic: 'Completely unrelated topic xyz', timestamp: oldDate })];

    const results = checkStaleness(planned, []);
    expect(results[0].staleness.isStale).toBe(true);
    expect(results[0].staleness.reason).toBe('age');
    expect(results[0].staleness.ageDays).toBeGreaterThanOrEqual(25);
  });

  it('does not flag by age if within threshold', () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const planned = [makePlanned({ topic: 'Something unique', timestamp: recentDate })];

    const results = checkStaleness(planned, []);
    expect(results[0].staleness.isStale).toBe(false);
    expect(results[0].staleness.ageDays).toBeLessThan(21);
  });

  it('prefers keyword_match reason over age when both apply', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const planned = [makePlanned({ topic: 'Token rotation', timestamp: oldDate })];
    const done = [makeDoneItem('Token rotation with refresh tokens')];

    const results = checkStaleness(planned, done);
    expect(results[0].staleness.isStale).toBe(true);
    expect(results[0].staleness.reason).toBe('keyword_match');
  });

  it('respects custom threshold options', () => {
    const planned = [makePlanned({ topic: 'Authentication flow' })];
    const done = [makeDoneItem('JWT authentication middleware')];

    // With low threshold — should match
    const loose = checkStaleness(planned, done, { matchThreshold: 0.1 });
    expect(loose[0].staleness.isStale).toBe(true);

    // With high threshold — should not match
    const strict = checkStaleness(planned, done, { matchThreshold: 0.9 });
    expect(strict[0].staleness.isStale).toBe(false);
  });

  it('limits matched items to maxMatches', () => {
    const planned = [makePlanned({ topic: 'API endpoints caching' })];
    const done = [
      makeDoneItem('API caching layer for endpoints'),
      makeDoneItem('Caching strategy for API responses'),
      makeDoneItem('API endpoint rate limiting with cache'),
      makeDoneItem('Cache invalidation for API endpoints'),
    ];

    const results = checkStaleness(planned, done, { maxMatches: 2 });
    expect(results[0].staleness.matchedItems.length).toBeLessThanOrEqual(2);
  });

  it('handles multiple planned meetings independently', () => {
    const planned = [
      makePlanned({ id: 'p1', topic: 'Token rotation' }),
      makePlanned({ id: 'p2', topic: 'Something completely different xyz' }),
    ];
    const done = [makeDoneItem('Token rotation middleware')];

    const results = checkStaleness(planned, done);
    expect(results[0].staleness.isStale).toBe(true);
    expect(results[1].staleness.isStale).toBe(false);
  });

  it('handles empty planned array', () => {
    const results = checkStaleness([], [makeDoneItem('something')]);
    expect(results).toHaveLength(0);
  });

  it('handles empty done items', () => {
    const results = checkStaleness([makePlanned()], []);
    expect(results[0].staleness.isStale).toBe(false);
  });

  it('preserves all original planned meeting fields', () => {
    const planned = [makePlanned({ id: 'keep-me', type: 'strategy', topic: 'xyz' })];
    const results = checkStaleness(planned, []);
    expect(results[0].id).toBe('keep-me');
    expect(results[0].type).toBe('strategy');
    expect(results[0].topic).toBe('xyz');
  });
});

// ---------------------------------------------------------------------------
// getDoneItems
// ---------------------------------------------------------------------------

describe('getDoneItems', () => {
  function makeIndex(overrides: Partial<TagIndex> = {}): TagIndex {
    return {
      decisions: [],
      open: [],
      actions: [],
      resolved: [],
      closed: [],
      ideas: [],
      meetingCount: 1,
      builtAt: new Date().toISOString(),
      validationWarnings: [],
      ...overrides,
    };
  }

  it('returns DECISION items as done by default', () => {
    const index = makeIndex({
      decisions: [{
        type: 'DECISION', text: 'Use JWT', id: null, assignee: null, priority: null, doneWhen: null,
        meeting: 'test.md', meetingTitle: 'Test', meetingStatus: 'complete',
        lineNumber: 1, date: '2026-03-28',
      }],
    });
    const result = getDoneItems(index, {});
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Use JWT');
  });

  it('returns RESOLVED items as done by default', () => {
    const index = makeIndex({
      resolved: [{
        type: 'RESOLVED', text: 'Fixed auth flow', id: 'auth-flow', assignee: null, priority: null, doneWhen: null,
        meeting: 'test.md', meetingTitle: 'Test', meetingStatus: 'complete',
        lineNumber: 1, date: '2026-03-28',
      }],
    });
    const result = getDoneItems(index, {});
    expect(result).toHaveLength(1);
  });

  it('returns OPEN items that have been resolved by slug', () => {
    const index = makeIndex({
      open: [{
        type: 'OPEN', text: 'How should auth work?', id: 'auth-flow', assignee: null, priority: null, doneWhen: null,
        meeting: 'test.md', meetingTitle: 'Test', meetingStatus: 'complete',
        lineNumber: 1, date: '2026-03-28',
      }],
      resolved: [{
        type: 'RESOLVED', text: 'Decided on JWT', id: 'auth-flow', assignee: null, priority: null, doneWhen: null,
        meeting: 'test2.md', meetingTitle: 'Test2', meetingStatus: 'complete',
        lineNumber: 1, date: '2026-03-28',
      }],
    });
    const result = getDoneItems(index, {});
    // Both the OPEN (resolved by slug) and RESOLVED items should be done
    expect(result).toHaveLength(2);
  });

  it('does not return active ACTION items', () => {
    const index = makeIndex({
      actions: [{
        type: 'ACTION', text: 'Build the feature', id: null, assignee: null, priority: null, doneWhen: null,
        meeting: 'test.md', meetingTitle: 'Test', meetingStatus: 'complete',
        lineNumber: 1, date: '2026-03-28',
      }],
    });
    const result = getDoneItems(index, {});
    expect(result).toHaveLength(0);
  });

  it('respects status store overrides', () => {
    const index = makeIndex({
      actions: [{
        type: 'ACTION', text: 'Build the feature', id: null, assignee: null, priority: null, doneWhen: null,
        meeting: 'test.md', meetingTitle: 'Test', meetingStatus: 'complete',
        lineNumber: 1, date: '2026-03-28',
      }],
    });
    // Override this action as done in status store (stable key)
    const key = stableActionKey('Build the feature', 'test.md');
    const result = getDoneItems(index, { [key]: { status: 'done' } });
    expect(result).toHaveLength(1);
  });

  it('recognizes done items via legacy hash key (backward compat)', () => {
    const index = makeIndex({
      actions: [{
        type: 'ACTION', text: 'Build the feature', id: null, assignee: null, priority: null, doneWhen: null,
        meeting: 'test.md', meetingTitle: 'Test', meetingStatus: 'complete',
        lineNumber: 1, date: '2026-03-28',
      }],
    });
    // Legacy hash key should still work
    const hash = hashItem('Build the feature', 'test.md');
    const result = getDoneItems(index, { [hash]: { status: 'done' } });
    expect(result).toHaveLength(1);
  });
});
