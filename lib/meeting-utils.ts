/**
 * Utility functions for meeting file validation and analysis.
 */

export interface MeetingValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    wordCount: number;
    roundCount: number;
    agentCount: number;
    hasTitle: boolean;
    hasMetadata: boolean;
    hasSummary: boolean;
    decisionCount: number;
    openCount: number;
    actionCount: number;
  };
}

/**
 * Validate a meeting file's structure and content.
 * Returns validation results with warnings and errors.
 */
export function validateMeeting(content: string, filename: string): MeetingValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for title
  const hasTitle = /^#\s+.+$/m.test(content);
  if (!hasTitle) warnings.push('Missing meeting title (# heading)');

  // Check for metadata comments
  const hasMetadata = /<!--\s*(meeting-)?type:/m.test(content);
  if (!hasMetadata) warnings.push('Missing meeting type metadata comment');

  const hasStatus = /<!--\s*status:/m.test(content);
  if (!hasStatus) warnings.push('Missing status metadata comment');

  const hasParticipants = /<!--\s*participants:/m.test(content);
  if (!hasParticipants) warnings.push('Missing participants metadata comment');

  // Check for summary section
  const hasSummary = /^## Summary$/m.test(content);

  // Count rounds
  const roundMatches = content.match(/^## Round \d+/gm);
  const roundCount = roundMatches?.length ?? 0;

  // Count unique agents
  const agentMatches = new Set<string>();
  for (const m of content.matchAll(/\*\*(\w[\w-]+):\*\*/g)) {
    const name = m[1].toLowerCase();
    if (!['type', 'date', 'participants', 'facilitator', 'status', 'topic'].includes(name)) {
      agentMatches.add(name);
    }
  }
  // Also check ### Agent (Round N) format
  for (const m of content.matchAll(/^### (\w[\w-]+)/gm)) {
    const name = m[1].toLowerCase();
    if (!['decisions', 'open', 'action', 'dissent', 'recommended', 'carry', 'context', 'summary'].includes(name)) {
      agentMatches.add(name);
    }
  }

  // Count words (rough)
  const cleanContent = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^---$/gm, '')
    .replace(/^#+\s+/gm, '')
    .trim();
  const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;

  // Count tags
  const decisionCount = (content.match(/\[?DECISION[:\]]/gi) || []).length;
  const openCount = (content.match(/\[?OPEN(?::[\w-]+)?[:\]]/gi) || []).length;
  const actionCount = (content.match(/\[?ACTION[:\]]/gi) || []).length;

  // Validation rules
  if (hasSummary && decisionCount === 0 && openCount === 0 && actionCount === 0) {
    warnings.push('Summary section exists but contains no tagged outcomes');
  }

  if (roundCount === 0 && agentMatches.size > 0) {
    warnings.push('Agent responses found but no round markers (## Round N)');
  }

  if (agentMatches.size === 0 && wordCount > 100) {
    warnings.push('No agent responses detected in meeting content');
  }

  // Date in filename
  if (!/^\d{4}-\d{2}-\d{2}/.test(filename)) {
    warnings.push('Filename does not start with date (YYYY-MM-DD)');
  }

  const valid = errors.length === 0;

  return {
    valid,
    warnings,
    errors,
    stats: {
      wordCount,
      roundCount,
      agentCount: agentMatches.size,
      hasTitle,
      hasMetadata,
      hasSummary,
      decisionCount,
      openCount,
      actionCount,
    },
  };
}

/**
 * Extract a clean summary from meeting content.
 * Returns just the Summary section text, or null if not found.
 */
export function extractSummary(content: string): string | null {
  const match = content.match(/^## Summary\s*\n([\s\S]*?)(?=\n##[^#]|\n---\s*$|$)/m);
  return match ? match[1].trim() : null;
}

/**
 * Extract all agent names from meeting content.
 */
export function extractAgents(content: string): string[] {
  const agents = new Set<string>();

  for (const m of content.matchAll(/\*\*(\w[\w-]+):\*\*/g)) {
    const name = m[1].toLowerCase();
    if (!['type', 'date', 'participants', 'facilitator', 'status', 'topic'].includes(name)) {
      agents.add(m[1]);
    }
  }
  for (const m of content.matchAll(/^### (\w[\w-]+)\s*\(Round/gm)) {
    agents.add(m[1]);
  }

  return [...agents];
}
