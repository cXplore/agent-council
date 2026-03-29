/**
 * Utility functions for meeting file validation and analysis.
 */

/**
 * Parse metadata from meeting markdown content.
 * Extracts status, type, title, started date, participants, and recommended meetings.
 */
export function parseMetadata(content: string) {
  const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
  const typeMatchComment = content.match(/<!--\s*(?:meeting-)?type:\s*(.+?)\s*-->/);
  const startedMatchComment = content.match(/<!--\s*(?:created|started):\s*(.+?)\s*-->/);
  const participantsMatchComment = content.match(/<!--\s*participants:\s*(.+?)\s*-->/);

  const typeMatchBold = content.match(/\*\*Type:\*\*\s*(.+)/i);
  const startedMatchBold = content.match(/\*\*Date:\*\*\s*(.+)/i);
  const participantsMatchBold = content.match(/\*\*Participants:\*\*\s*(.+)/i);

  const titleMatch = content.match(/^#\s+(.+)$/m);

  let type = typeMatchComment?.[1] ?? typeMatchBold?.[1]?.trim() ?? null;
  if (!type && titleMatch) {
    const titleParts = titleMatch[1].split(/\s*[—–\-]{1,2}\s*/);
    type = titleParts[0]?.trim() ?? null;
  }

  const participantsRaw = participantsMatchComment?.[1] ?? participantsMatchBold?.[1]?.trim() ?? '';
  const participants = participantsRaw
    ? participantsRaw.split(',').map(p => p.trim()).filter(Boolean)
    : [];

  if (participants.length === 0) {
    const agentMatches = content.matchAll(/\*\*([a-z][\w-]+):\*\*/g);
    const found = new Set<string>();
    for (const m of agentMatches) {
      const lower = m[1].toLowerCase();
      if (lower !== 'type' && lower !== 'date' && lower !== 'participants' && lower !== 'facilitator') {
        found.add(m[1]);
      }
    }
    participants.push(...found);
  }

  // Parse recommended next meetings from summary
  const recommendedMeetings: { text: string; type?: string; topic?: string }[] = [];
  const recMatch = content.match(/###?\s*Recommended(?:\s+Next)?\s*(?:Meetings?|Follow-?ups?)\s*\n([\s\S]*?)(?:\n##|\n---|\n\n\n|$)/i);
  if (recMatch) {
    const lines = recMatch[1].split('\n');
    for (const line of lines) {
      const raw = line.replace(/^[-*]\s*/, '').trim();
      if (!raw || raw.startsWith('Only include') || raw.startsWith('Do not')) continue;
      // Try to parse "Type: Topic" or "Type — Topic" format
      const dashMatch = raw.match(/^([^—–:]+)[—–]\s*(.+)/);
      const colonMatch = raw.match(/^([^:]+):\s*(.+)/);
      if (dashMatch) {
        recommendedMeetings.push({ text: raw, type: dashMatch[1].trim().toLowerCase().replace(/\s+/g, '-'), topic: dashMatch[2].trim() });
      } else if (colonMatch) {
        recommendedMeetings.push({ text: raw, type: colonMatch[1].trim().toLowerCase().replace(/\s+/g, '-'), topic: colonMatch[2].trim() });
      } else {
        recommendedMeetings.push({ text: raw });
      }
    }
  }

  return {
    status: statusMatch?.[1] ?? (/^## Summary$/m.test(content) ? 'complete' : 'in-progress'),
    type: type?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown',
    title: titleMatch?.[1]?.trim() ?? null,
    started: startedMatchComment?.[1] ?? startedMatchBold?.[1]?.trim() ?? null,
    participants,
    recommendedMeetings,
  };
}

/** Extract a readable title from a meeting filename as last resort */
export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-?/, '') // strip date prefix
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Untitled Meeting';
}

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
/**
 * Filter meeting content to show only a specific round (or all if round is null).
 * Returns the context part (before first ## Round) plus the matching round content.
 */
export function getContentForRound(content: string, round: number | null): string {
  if (round === null) return content;

  const parts = content.split(/^(## Round \d+.*)/m);
  const contextPart = parts[0] || '';
  let roundContent = '';

  for (let i = 1; i < parts.length; i += 2) {
    const header = parts[i];
    const body = parts[i + 1] || '';
    const match = header.match(/## Round (\d+)/);
    if (match && parseInt(match[1], 10) === round) {
      roundContent = header + body;
      break;
    }
  }

  return contextPart + roundContent;
}

export function extractAgents(content: string): string[] {
  const agents = new Set<string>();

  for (const m of content.matchAll(/\*\*(\w[\w-]+):\*\*/g)) {
    const name = m[1].toLowerCase();
    if (!['type', 'date', 'participants', 'facilitator', 'status', 'topic'].includes(name)) {
      agents.add(name);
    }
  }
  for (const m of content.matchAll(/^### (\w[\w-]+)\s*\(Round/gm)) {
    agents.add(m[1].toLowerCase());
  }

  return [...agents];
}
