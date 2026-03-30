/**
 * Utility functions for meeting file validation and analysis.
 */

/**
 * Parse metadata from meeting markdown content.
 * Extracts status, type, title, started date, participants, and recommended meetings.
 */
export function parseMetadata(content: string) {
  // Extract YAML frontmatter if present (---\n...\n---)
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const fm: Record<string, string> = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^(\w[\w-]*):\s*(.+)/);
      if (kv) fm[kv[1]] = kv[2].replace(/^["'\[]|["'\]]$/g, '').trim();
    }
  }

  const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
  const typeMatchComment = content.match(/<!--\s*(?:meeting-)?type:\s*(.+?)\s*-->/);
  const startedMatchComment = content.match(/<!--\s*(?:created|started):\s*(.+?)\s*-->/);
  const participantsMatchComment = content.match(/<!--\s*participants:\s*(.+?)\s*-->/);
  const objectiveMatch = content.match(/<!--\s*objective:\s*(.+?)\s*-->/);

  const typeMatchBold = content.match(/\*\*Type:\*\*\s*(.+)/i);
  const startedMatchBold = content.match(/\*\*Date:\*\*\s*(.+)/i);
  const participantsMatchBold = content.match(/\*\*Participants:\*\*\s*(.+)/i);

  const titleMatch = content.match(/^#\s+(.+)$/m);

  let type = fm['type'] ?? typeMatchComment?.[1] ?? typeMatchBold?.[1]?.trim() ?? null;
  if (!type && titleMatch) {
    const titleParts = titleMatch[1].split(/\s*[—–\-]{1,2}\s*/);
    type = titleParts[0]?.trim() ?? null;
  }

  const participantsRaw = fm['participants'] ?? participantsMatchComment?.[1] ?? participantsMatchBold?.[1]?.trim() ?? '';
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
    status: fm['status'] ?? statusMatch?.[1] ?? (/^## Summary$/m.test(content) ? 'complete' : 'in-progress'),
    type: type?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown',
    title: fm['title'] ?? titleMatch?.[1]?.trim() ?? null,
    started: fm['created'] ?? fm['date'] ?? startedMatchComment?.[1] ?? startedMatchBold?.[1]?.trim() ?? null,
    participants,
    recommendedMeetings,
    objective: fm['objective'] ?? objectiveMatch?.[1]?.replace(/^["']|["']$/g, '').trim() ?? null,
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

/**
 * Format structured outcomes into the meeting-outcomes HTML comment block.
 * Used by the PATCH /api/meetings endpoint and MCP council_close_meeting tool.
 */
export function formatOutcomesAppendix(outcomes: {
  decisions?: Array<{ text: string; rationale?: string }>;
  actions?: Array<{ text: string; assignee?: string }>;
  openQuestions?: Array<{ text: string; slug?: string }>;
}): string {
  const json: Record<string, unknown> = { schema_version: 1 };
  if (outcomes.decisions?.length) json.decisions = outcomes.decisions;
  if (outcomes.actions?.length) json.actions = outcomes.actions;
  if (outcomes.openQuestions?.length) json.open_questions = outcomes.openQuestions;
  // Only schema_version means no actual outcomes
  if (Object.keys(json).length === 1) return '';
  return `\n\n<!-- meeting-outcomes\n${JSON.stringify(json, null, 2)}\nmeeting-outcomes -->`;
}

/**
 * Generate a meeting filename from type and topic.
 */
export function generateMeetingFilename(type: string, topic: string, date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${d}-${type}-${slug}.md`;
}

/**
 * Summarize one round's responses into a compact context block for the next round.
 * Each agent's position is condensed to key points for cross-referencing.
 */
export function summarizeRound(
  roundNumber: number,
  responses: Array<{ agent: string; answer: string }>,
): string {
  const lines: string[] = [`## Round ${roundNumber} Summary\n`];
  for (const { agent, answer } of responses) {
    const displayName = agent.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    const condensed = answer.length > 800
      ? answer.slice(0, 800).replace(/\n[^\n]*$/, '') + '...'
      : answer;
    lines.push(`### ${displayName}\n${condensed}\n`);
  }
  return lines.join('\n');
}

/**
 * Build the prompt for Round N that includes previous rounds' context,
 * instructing agents to respond to each other's positions.
 */
export function buildRoundPrompt(
  roundNumber: number,
  topic: string,
  previousRounds: Array<{ round: number; responses: Array<{ agent: string; answer: string }> }>,
): string {
  const roundSummaries = previousRounds.map(r => summarizeRound(r.round, r.responses));
  return [
    `You are participating in Round ${roundNumber} of a structured multi-agent meeting.`,
    `The topic is: ${topic}\n`,
    `You have heard your colleagues' responses from previous rounds. Now respond to what they said — agree, challenge, build on their ideas, or synthesize. Reference specific colleagues by name.`,
    `\n---\n\n## Previous Rounds\n`,
    ...roundSummaries,
    `\n---\n\nNow give your Round ${roundNumber} response. Address specific points from your colleagues. Where do you agree? Where do you push back? What synthesis emerges?`,
  ].join('\n');
}

/**
 * Structured outcomes extracted from meeting responses.
 */
export interface StructuredOutcomes {
  decisions: Array<{ text: string; rationale?: string }>;
  actions: Array<{ text: string; assignee?: string }>;
  openQuestions: Array<{ text: string; slug?: string }>;
}

/**
 * Extract structured outcomes (decisions, actions, open questions) from
 * agent responses by parsing [DECISION], [ACTION], and [OPEN:slug] tags.
 *
 * Each tag must appear at the start of a line (possibly preceded by `-` or `*`).
 * The text after the tag on the same line is captured as the item text.
 * If the next non-empty line starts with "Rationale:" or "Why:", it's captured too.
 */
export function extractStructuredOutcomes(
  rounds: Array<{ round: number; responses: Array<{ agent: string; answer: string }> }>,
): StructuredOutcomes {
  const decisions: Array<{ text: string; rationale?: string }> = [];
  const actions: Array<{ text: string; assignee?: string }> = [];
  const openQuestions: Array<{ text: string; slug?: string }> = [];

  // Collect all response text
  const allText = rounds
    .flatMap(r => r.responses.map(resp => resp.answer))
    .join('\n\n');

  const lines = allText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^[-*]\s*/, '').trim();

    // [DECISION] or [DECISION:] text
    const decisionMatch = line.match(/^\[DECISION[:\]]?\s*(.+)/i);
    if (decisionMatch) {
      const text = decisionMatch[1].replace(/^\]?\s*/, '').trim();
      if (text) {
        const rationale = peekRationale(lines, i);
        decisions.push(rationale ? { text, rationale } : { text });
      }
      continue;
    }

    // [ACTION] or [ACTION:] text
    const actionMatch = line.match(/^\[ACTION[:\]]?\s*(.+)/i);
    if (actionMatch) {
      const text = actionMatch[1].replace(/^\]?\s*/, '').trim();
      if (text) {
        // Check for "— assignee" or "(assignee)" at end
        const assigneeMatch = text.match(/\s*[—–]\s*([\w-]+)\s*$/);
        const parenMatch = text.match(/\s*\(([\w-]+)\)\s*$/);
        if (assigneeMatch) {
          actions.push({ text: text.replace(assigneeMatch[0], '').trim(), assignee: assigneeMatch[1] });
        } else if (parenMatch) {
          actions.push({ text: text.replace(parenMatch[0], '').trim(), assignee: parenMatch[1] });
        } else {
          actions.push({ text });
        }
      }
      continue;
    }

    // [OPEN:slug] text
    const openMatch = line.match(/^\[OPEN(?::([a-z][\w-]*))?\]?\s*(.+)/i);
    if (openMatch) {
      const slug = openMatch[1] || undefined;
      const text = openMatch[2].replace(/^\]?\s*/, '').trim();
      if (text) {
        openQuestions.push(slug ? { text, slug } : { text });
      }
      continue;
    }
  }

  return { decisions, actions, openQuestions };
}

/**
 * Look at the next non-empty line for a "Rationale:" or "Why:" prefix.
 */
function peekRationale(lines: string[], currentIndex: number): string | undefined {
  for (let j = currentIndex + 1; j < Math.min(currentIndex + 3, lines.length); j++) {
    const next = lines[j].trim();
    if (!next) continue;
    const match = next.match(/^(?:Rationale|Why|Reason)[:\s]\s*(.+)/i);
    return match ? match[1].trim() : undefined;
  }
  return undefined;
}

/**
 * Build a synthesis prompt that asks an agent to extract outcomes from meeting responses.
 * Used when tag-based parsing finds no results but we still want structured outcomes.
 */
export function buildOutcomeExtractionPrompt(
  topic: string,
  rounds: Array<{ round: number; responses: Array<{ agent: string; answer: string }> }>,
): string {
  const roundTexts = rounds.map(r => {
    const agentTexts = r.responses.map(resp => {
      const name = resp.agent.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      return `### ${name}\n${resp.answer}`;
    }).join('\n\n');
    return `## Round ${r.round}\n\n${agentTexts}`;
  }).join('\n\n---\n\n');

  return [
    `You are a meeting synthesizer. A team of agents discussed: "${topic}"`,
    '',
    'Here are their responses:',
    '',
    roundTexts,
    '',
    '---',
    '',
    'Extract the key outcomes from this discussion. Output ONLY in this exact format, one item per line:',
    '',
    '[DECISION] The agreed-upon decision text',
    'Rationale: Why this was decided',
    '',
    '[ACTION] The specific action to take — assignee-name',
    '',
    '[OPEN:kebab-slug] The unresolved question',
    '',
    'Rules:',
    '- Only include items that have clear consensus or near-consensus across agents',
    '- Decisions must be things the team agreed on, not individual opinions',
    '- Actions must be concrete and actionable',
    '- Open questions are unresolved disagreements or unknowns',
    '- If there are no clear outcomes of a type, omit that type entirely',
    '- Do NOT include any other text, headers, or explanation',
  ].join('\n');
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
