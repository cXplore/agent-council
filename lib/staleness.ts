/**
 * Staleness detection for planned meetings and suggested follow-ups.
 *
 * Cross-references planned meeting topics against completed roadmap items
 * using Jaccard similarity on tokenized text. Flags meetings that have
 * likely been overtaken by work done outside of meetings.
 */

import type { TagIndex, TagEntry } from './tag-index';
import { hashItem } from './utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StalenessInfo {
  isStale: boolean;
  reason: 'keyword_match' | 'age' | null;
  matchedItems: { text: string; score: number }[];
  ageDays: number;
}

export interface PlannedMeetingInput {
  id: string;
  type: string;
  topic: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface DoneItem {
  text: string;
  tokens: Set<string>;
}

export interface StalenessOptions {
  /** Minimum Jaccard score to consider a match (default: 0.25) */
  matchThreshold?: number;
  /** Days after which a planned meeting is flagged as stale by age (default: 21) */
  ageDays?: number;
  /** Maximum number of matched items to return per planned meeting (default: 3) */
  maxMatches?: number;
}

// ---------------------------------------------------------------------------
// Stop words — removed during tokenization
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  // Common English
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'its',
  'they', 'them', 'their', 'this', 'that', 'these', 'those',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up',
  'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'out', 'off', 'over', 'under',
  'and', 'but', 'or', 'nor', 'not', 'so', 'if', 'then', 'else',
  'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'why',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
  // Meeting-type noise — these describe format, not content
  'meeting', 'meetings', 'review', 'session', 'discussion', 'consult',
  'design', 'architecture', 'strategy', 'planning', 'retrospective',
  'retro', 'sprint', 'standup', 'incident', 'quick',
  // Action noise
  'assigned', 'effort', 'build', 'implement', 'create', 'add', 'update',
  'fix', 'make', 'set', 'use', 'check', 'get', 'run', 'test',
]);

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Tokenize text into content words, removing stop words and short tokens */
export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/** Jaccard similarity: |intersection| / |union|. Returns 0.0–1.0. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;

  for (const word of smaller) {
    if (larger.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract done items from a tag index + status store.
 * Uses the same default-status logic as the roadmap API.
 */
export function getDoneItems(
  index: TagIndex,
  statusStore: Record<string, { status: string }>,
): DoneItem[] {
  const resolvedSlugs = new Set(
    index.resolved.map(r => r.id).filter((id): id is string => id !== null)
  );

  const allTags: TagEntry[] = [
    ...index.decisions,
    ...index.open,
    ...index.actions,
    ...index.resolved,
  ];

  const doneItems: DoneItem[] = [];

  for (const tag of allTags) {
    const hash = hashItem(tag.text, tag.meeting);
    const stored = statusStore[hash];

    // Determine effective status (same logic as roadmap/route.ts)
    let effectiveStatus = 'active';
    if (tag.type === 'DECISION' || tag.type === 'RESOLVED') {
      effectiveStatus = 'done';
    } else if (tag.type === 'OPEN' && tag.id && resolvedSlugs.has(tag.id)) {
      effectiveStatus = 'done';
    }
    if (stored) {
      effectiveStatus = stored.status;
    }

    if (effectiveStatus === 'done') {
      doneItems.push({
        text: tag.text,
        tokens: tokenize(tag.text),
      });
    }
  }

  return doneItems;
}

/**
 * Check staleness of planned meetings against completed work items.
 * Returns the same meetings with a `staleness` annotation attached.
 */
export function checkStaleness<T extends PlannedMeetingInput>(
  planned: T[],
  doneItems: DoneItem[],
  options: StalenessOptions = {},
): (T & { staleness: StalenessInfo })[] {
  const {
    matchThreshold = 0.25,
    ageDays: maxAgeDays = 21,
    maxMatches = 3,
  } = options;

  const now = Date.now();

  return planned.map(meeting => {
    const topicTokens = tokenize(meeting.topic);
    const ageDays = Math.floor((now - new Date(meeting.timestamp).getTime()) / (1000 * 60 * 60 * 24));

    // Find keyword matches against done items
    const matches: { text: string; score: number }[] = [];

    if (topicTokens.size > 0) {
      for (const item of doneItems) {
        if (item.tokens.size === 0) continue;
        const score = jaccardSimilarity(topicTokens, item.tokens);
        if (score >= matchThreshold) {
          matches.push({ text: item.text, score });
        }
      }
    }

    // Sort by score descending, keep top N
    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, maxMatches);

    const isStaleByKeywords = topMatches.length > 0;
    const isStaleByAge = ageDays >= maxAgeDays;
    const isStale = isStaleByKeywords || isStaleByAge;

    return {
      ...meeting,
      staleness: {
        isStale,
        reason: isStaleByKeywords ? 'keyword_match' : isStaleByAge ? 'age' : null,
        matchedItems: topMatches,
        ageDays,
      },
    };
  });
}
