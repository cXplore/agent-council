import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';
import { buildTagIndex, getUnresolved, recallByTopic } from '@/lib/tag-index';
import {
  generateMeetingFilename,
  buildRoundPrompt,
  formatOutcomesAppendix,
  extractStructuredOutcomes,
  buildOutcomeExtractionPrompt,
  type StructuredOutcomes,
} from '@/lib/meeting-utils';
import { query } from '@anthropic-ai/claude-agent-sdk';

const VALID_AGENTS = ['architect', 'critic', 'developer', 'designer', 'north-star', 'project-manager'];

const MEETING_TYPES = [
  'standup', 'design-review', 'strategy', 'architecture',
  'sprint-planning', 'retrospective', 'incident-review', 'direction-check',
] as const;

/**
 * Load recent decisions + active work items as context for agents.
 */
async function loadWorkContext(meetingsDir: string): Promise<string> {
  try {
    const [index, unresolved] = await Promise.all([
      buildTagIndex(meetingsDir),
      getUnresolved(meetingsDir),
    ]);

    const sortByDate = (a: { date?: string | null }, b: { date?: string | null }) =>
      (b.date ?? '').localeCompare(a.date ?? '');

    const sections: string[] = [];

    const decisions = [...index.decisions].sort(sortByDate).slice(0, 5);
    if (decisions.length > 0) {
      sections.push('Recent decisions:\n' + decisions.map(d => `- ${d.text}`).join('\n'));
    }

    const actions = unresolved.actions.slice(0, 3);
    if (actions.length > 0) {
      sections.push('Active action items:\n' + actions.map(a => `- ${a.text}`).join('\n'));
    }

    const open = unresolved.open.slice(0, 2);
    if (open.length > 0) {
      sections.push('Open questions:\n' + open.map(o => `- ${o.text}`).join('\n'));
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
  } catch {
    return '';
  }
}

/**
 * Build the system prompt for an agent, including context enrichment.
 */
async function buildAgentPrompt(
  agentName: string,
  agentsDir: string,
  meetingsDir: string,
  topic: string,
  workContext: string,
): Promise<string> {
  const parts: string[] = [];

  // Load agent's system prompt
  try {
    const agentFile = path.join(agentsDir, `${agentName}.md`);
    const content = await readFile(agentFile, 'utf-8');
    const { body } = parseFrontmatter(content);
    if (body.trim()) parts.push(body.trim());
  } catch {
    // Agent file not found — proceed without role prompt
  }

  // Load agent's context file
  try {
    const contextFile = path.join(agentsDir, `${agentName}.context.md`);
    const contextContent = await readFile(contextFile, 'utf-8');
    if (contextContent.trim()) {
      parts.push('---\n\n## Project Context\n\n' + contextContent.trim());
    }
  } catch {
    // No context file
  }

  // Work context (shared across agents)
  if (workContext) {
    parts.push('---\n\n## Current Project State\n\n' + workContext);
  }

  // Topic-specific recall
  if (topic) {
    try {
      const recalled = await recallByTopic(meetingsDir, topic, 5);
      if (recalled.length > 0) {
        const recallLines = recalled.map(r => {
          const label = r.type === 'OPEN' ? 'OPEN QUESTION' : 'DECISION';
          return `- [${label}] ${r.text}\n  From: ${r.meetingTitle} (${r.date ?? 'unknown'})`;
        });
        parts.push(
          '---\n\n## Relevant Team Decisions\n\n' +
          `The following decisions and open questions are relevant to "${topic}":\n\n` +
          recallLines.join('\n\n'),
        );
      }
    } catch {
      // Recall failed
    }
  }

  return parts.join('\n\n');
}

/**
 * Query a single agent and return the response text.
 */
async function queryAgent(
  _agentName: string,
  question: string,
  systemPrompt: string,
  codeAware: boolean,
  projectPath?: string,
): Promise<string> {
  const tools = codeAware ? ['Read', 'Glob', 'Grep'] : [];
  const maxTurns = codeAware ? 5 : 1;
  const queryOptions: Record<string, unknown> = {
    ...(systemPrompt ? { systemPrompt } : {}),
    tools,
    maxTurns,
  };

  if (codeAware && projectPath) {
    queryOptions.cwd = projectPath;
    queryOptions.permissionMode = 'acceptEdits';
  }

  let answer = '';
  for await (const message of query({
    prompt: question,
    options: queryOptions,
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block && block.text) {
          answer += block.text;
        }
      }
    }
  }

  return answer.trim();
}

/**
 * POST /api/council/multi-consult
 *
 * Query multiple agents on the same topic. Supports multi-round deliberation
 * where each round's responses are fed as context to the next round.
 *
 * Body: {
 *   topic: string,           // The question or topic to discuss
 *   agents: string[],        // Array of agent names (2-6 agents)
 *   type?: string,           // Meeting type (default: 'direction-check')
 *   rounds?: number,         // Number of rounds (1-3, default: 1)
 *   codeAware?: boolean,     // Give agents Read/Glob/Grep tools
 *   writeMeeting?: boolean,  // Write results to a meeting file (default: true)
 * }
 *
 * Response: {
 *   rounds: Array<{ round: number, responses: Array<{ agent: string, answer: string }> }>,
 *   meetingFile?: string,    // Filename if writeMeeting was true
 *   generatedAt: string,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic: string = typeof body?.topic === 'string' ? body.topic.trim() : '';
    const agents: string[] = Array.isArray(body?.agents) ? body.agents : [];
    const type: string = typeof body?.type === 'string' ? body.type : 'direction-check';
    const roundCount: number = Math.min(3, Math.max(1, typeof body?.rounds === 'number' ? body.rounds : 1));
    const codeAware: boolean = body?.codeAware === true;
    const writeMeeting: boolean = body?.writeMeeting !== false;

    // Validate
    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }
    if (agents.length < 2 || agents.length > 6) {
      return NextResponse.json({ error: 'agents must contain 2-6 agent names' }, { status: 400 });
    }
    const invalid = agents.filter(a => !VALID_AGENTS.includes(a));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid agents: ${invalid.join(', ')}. Valid: ${VALID_AGENTS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!MEETING_TYPES.includes(type as typeof MEETING_TYPES[number]) && type !== 'quick-consult') {
      return NextResponse.json(
        { error: `Invalid type. Valid: ${MEETING_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const config = await getConfig();
    const active = getActiveProjectConfig(config);

    // Load shared work context once
    const workContext = await loadWorkContext(active.meetingsDir);

    // Build base system prompts for all agents in parallel
    const promptsMap = new Map<string, string>();
    await Promise.all(
      agents.map(async (agentName) => {
        const prompt = await buildAgentPrompt(
          agentName, active.agentsDir, active.meetingsDir, topic, workContext,
        );
        promptsMap.set(agentName, prompt);
      }),
    );

    // Run rounds
    const allRounds: Array<{ round: number; responses: Array<{ agent: string; answer: string }> }> = [];

    for (let round = 1; round <= roundCount; round++) {
      const question = round === 1
        ? topic
        : buildRoundPrompt(round, topic, allRounds);

      const responses = await Promise.all(
        agents.map(async (agentName) => {
          const systemPrompt = promptsMap.get(agentName) ?? '';
          const answer = await queryAgent(
            agentName, question, systemPrompt, codeAware, active.projectPath,
          );
          return { agent: agentName, answer };
        }),
      );

      allRounds.push({ round, responses });
    }

    // Extract structured outcomes from agent responses
    // First try tag-based parsing (fast, deterministic)
    let outcomes: StructuredOutcomes = extractStructuredOutcomes(allRounds);

    // If no tagged outcomes found and we have 2+ rounds, use AI extraction
    const hasOutcomes = outcomes.decisions.length > 0 || outcomes.actions.length > 0 || outcomes.openQuestions.length > 0;
    if (!hasOutcomes && roundCount >= 2) {
      try {
        const extractionPrompt = buildOutcomeExtractionPrompt(topic, allRounds);
        let extractedText = '';
        for await (const message of query({
          prompt: extractionPrompt,
          options: { maxTurns: 1 },
        })) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if ('text' in block && block.text) {
                extractedText += block.text;
              }
            }
          }
        }
        // Parse the AI-extracted outcomes using the same tag parser
        if (extractedText.trim()) {
          const syntheticRound = [{ round: 0, responses: [{ agent: 'synthesizer', answer: extractedText }] }];
          outcomes = extractStructuredOutcomes(syntheticRound);
        }
      } catch {
        // AI extraction failed — proceed without outcomes
      }
    }

    // Write to meeting file if requested
    let meetingFile: string | undefined;
    if (writeMeeting) {
      const filename = generateMeetingFilename(type, topic);
      const meetingsDir = active.meetingsDir;

      await mkdir(meetingsDir, { recursive: true });

      const lines: string[] = [];
      lines.push('---');
      lines.push(`type: ${type}`);
      lines.push('status: complete');
      lines.push(`date: ${new Date().toISOString().slice(0, 10)}`);
      lines.push(`participants: [${agents.join(', ')}]`);
      lines.push(`rounds: ${roundCount}`);
      lines.push(`objective: "Multi-agent consult on: ${topic.replace(/"/g, '\\"')}"`);
      lines.push('---');
      lines.push('');
      lines.push(`# ${type.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}: ${topic}`);
      lines.push('');

      for (const { round, responses } of allRounds) {
        lines.push(`## Round ${round}`);
        lines.push('');
        for (const { agent, answer } of responses) {
          const displayName = agent.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
          lines.push(`### ${displayName}`);
          lines.push('');
          lines.push(answer || '*No response*');
          lines.push('');
        }
      }

      // Append structured outcomes if any were extracted
      const outcomesAppendix = formatOutcomesAppendix(outcomes);
      if (outcomesAppendix) {
        lines.push(outcomesAppendix);
      }

      const filePath = path.join(meetingsDir, filename);
      await writeFile(filePath, lines.join('\n'), 'utf-8');
      meetingFile = filename;
    }

    // Build outcomes for response (only include non-empty arrays)
    const outcomesResponse: Record<string, unknown> = {};
    if (outcomes.decisions.length > 0) outcomesResponse.decisions = outcomes.decisions;
    if (outcomes.actions.length > 0) outcomesResponse.actions = outcomes.actions;
    if (outcomes.openQuestions.length > 0) outcomesResponse.openQuestions = outcomes.openQuestions;

    return NextResponse.json({
      rounds: allRounds,
      ...(Object.keys(outcomesResponse).length > 0 ? { outcomes: outcomesResponse } : {}),
      ...(meetingFile ? { meetingFile } : {}),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Multi-consult error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to run multi-consult' },
      { status: 500 },
    );
  }
}
