import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';
import { buildTagIndex, getUnresolved, recallByTopic } from '@/lib/tag-index';
import {
  generateMeetingFilename,
  buildRound1Prompt,
  buildRoundPrompt,
  formatOutcomesAppendix,
  extractStructuredOutcomes,
  buildOutcomeExtractionPrompt,
  type StructuredOutcomes,
} from '@/lib/meeting-utils';
import {
  gatherPreflightContext,
  formatManifest,
  formatManifestForMeetingFile,
  type ResolutionManifest,
} from '@/lib/preflight-context';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { writeActivityEntry } from '@/lib/activity-log';
import { createJob, updateJob, completeJob, failJob } from '@/lib/job-store';

const VALID_AGENTS = ['architect', 'critic', 'developer', 'designer', 'north-star', 'project-manager'];

/**
 * Emit a meeting event to the events API for the live viewer.
 * Fire-and-forget — failures are silently ignored.
 */
async function emitEvent(event: string, meeting: string, detail?: string) {
  try {
    await fetch(`http://localhost:${process.env.PORT || 3003}/api/council/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, meeting, detail }),
    });
  } catch {
    // Non-critical — don't fail the meeting
  }
}

const MEETING_TYPES = [
  'standup', 'design-review', 'strategy', 'architecture',
  'sprint-planning', 'retrospective', 'incident-review', 'direction-check',
  'project-intake',
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

  // Load project brief if it exists
  try {
    const { PROJECT_BRIEF_FILENAME } = await import('@/lib/context-files');
    const briefPath = path.join(meetingsDir, PROJECT_BRIEF_FILENAME);
    const briefContent = await readFile(briefPath, 'utf-8');
    // Only include if user has filled in at least some content (not just template comments)
    const hasUserContent = briefContent.split('\n').some(l => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('**Created') && !l.startsWith('<!--'));
    if (hasUserContent) {
      parts.push('---\n\n## Project Brief\n\n' + briefContent.trim());
    }
  } catch {
    // No project brief
  }

  // Work context (shared across agents)
  if (workContext) {
    parts.push('---\n\n## Current Project State\n\n' + workContext);
  }

  // Topic-specific recall
  if (topic) {
    try {
      const recalled = await recallByTopic(meetingsDir, topic, { limit: 5 });
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
 * Run a query with retry on transient failures (overloaded, network errors).
 * Uses exponential backoff: 2s, 4s for up to 2 retries.
 */
async function queryWithRetry(
  prompt: string,
  options: Record<string, unknown>,
  label: string,
  maxRetries = 2,
): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let answer = '';
      for await (const message of query({ prompt, options })) {
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block && block.text) {
              answer += block.text;
            }
          }
        }
      }
      return answer.trim();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable = lastError.message.includes('overloaded')
        || lastError.message.includes('529')
        || lastError.message.includes('rate_limit')
        || lastError.message.includes('ECONNRESET')
        || lastError.message.includes('ETIMEDOUT');
      if (!isRetryable || attempt >= maxRetries) throw lastError;
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.warn(`${label} attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error('Query failed after retries');
}

/**
 * Query a single agent and return the response text.
 */
async function queryAgent(
  agentName: string,
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

  return queryWithRetry(question, queryOptions, `Agent ${agentName}`);
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
    const asyncMode: boolean = body?.async === true;

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

    // Core meeting execution — extracted so it can run sync or async
    async function runMeeting(jobId?: string): Promise<Record<string, unknown>> {
      const config = await getConfig();
      const active = getActiveProjectConfig(config);

      if (jobId) updateJob(jobId, { status: 'running', progress: 'Loading context...' });

      // Load shared work context once
      const workContext = await loadWorkContext(active.meetingsDir);

      // Pre-flight context gathering: resolve relevant source files from the topic
      let preflightManifest: ResolutionManifest | undefined;
      if (active.projectPath) {
        try {
          preflightManifest = await gatherPreflightContext(active.projectPath, topic);
        } catch {
          // Pre-flight is additive — failures don't block the meeting
        }
      }
      const preflightContext = preflightManifest?.found
        ? formatManifest(preflightManifest)
        : '';

      if (jobId) updateJob(jobId, { progress: 'Building agent prompts...' });

      // Build base system prompts for all agents in parallel
      const promptsMap = new Map<string, string>();
      await Promise.all(
        agents.map(async (agentName) => {
          let prompt = await buildAgentPrompt(
            agentName, active.agentsDir, active.meetingsDir, topic, workContext,
          );
          // Inject pre-flight context into every agent's prompt
          if (preflightContext) {
            prompt += '\n\n---\n\n' + preflightContext;
          }
          // When codeAware + pre-flight context: tell agents not to re-read injected files
          if (codeAware && preflightContext) {
            prompt += '\n\n---\n\n## Important: Code-Aware Meeting Protocol\n\nRelevant source files have been pre-injected above. Do NOT use file-reading tools to re-read files that are already in your context. Focus your tool use on files NOT in the pre-flight manifest — files you need to verify claims, check implementation status, or investigate related code. Spend most of your response deliberating on the topic, not reading files.';
          }
          promptsMap.set(agentName, prompt);
        }),
      );

      // Generate meeting filename early so events reference the right file
      const meetingFilename = writeMeeting ? generateMeetingFilename(type, topic) : '';
      // Use first sentence or first 80 chars as title — full topic goes in the objective field
      const shortTopic = topic.includes('.') ? topic.split('.')[0] : (topic.length > 80 ? topic.slice(0, 80).replace(/\s+\S*$/, '') + '...' : topic);
      const meetingTitle = `${type.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}: ${shortTopic}`;
      let meetingFilePath: string | undefined;

      // Helper to build/rebuild the meeting file content from current state
      const buildMeetingContent = (
        rounds: Array<{ round: number; responses: Array<{ agent: string; answer: string }> }>,
        status: 'in-progress' | 'complete',
        outcomesAppendix?: string,
      ): string => {
        const lines: string[] = [];
        lines.push('---');
        lines.push(`type: ${type}`);
        lines.push(`status: ${status}`);
        lines.push(`date: ${new Date().toISOString().slice(0, 10)}`);
        lines.push(`participants: [${agents.join(', ')}]`);
        lines.push(`rounds: ${roundCount}`);
        lines.push(`objective: "Multi-agent consult on: ${topic.replace(/"/g, '\\"')}"`);
        lines.push('---');
        lines.push('');
        lines.push(`# ${meetingTitle}`);
        lines.push('');
        // Include pre-flight context manifest in the meeting file for observability
        if (preflightManifest) {
          lines.push(formatManifestForMeetingFile(preflightManifest));
          lines.push('');
        }
        // Show a starting indicator when no rounds have completed yet
        if (rounds.length === 0 && status === 'in-progress') {
          lines.push(`*Meeting starting — ${agents.length} agents, ${roundCount} round${roundCount > 1 ? 's' : ''}...*`);
          lines.push('');
        }
        for (const { round, responses } of rounds) {
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
        if (outcomesAppendix) lines.push(outcomesAppendix);
        return lines.join('\n');
      };

      // Create the meeting file at the start so the viewer can pick it up
      if (writeMeeting) {
        const meetingsDir = active.meetingsDir;
        await mkdir(meetingsDir, { recursive: true });
        meetingFilePath = path.join(meetingsDir, meetingFilename);
        await writeFile(meetingFilePath, buildMeetingContent([], 'in-progress'), 'utf-8');
      }

      // Run rounds
      const allRounds: Array<{ round: number; responses: Array<{ agent: string; answer: string }> }> = [];

      if (meetingFilename) {
        await emitEvent('meeting_starting', meetingFilename, `${agents.length} agents, ${roundCount} round${roundCount > 1 ? 's' : ''}`);
      }

      for (let round = 1; round <= roundCount; round++) {
        if (jobId) updateJob(jobId, { progress: `Round ${round} of ${roundCount}` });
        if (meetingFilename) {
          await emitEvent('round_starting', meetingFilename, `Round ${round} of ${roundCount}`);
        }

        const question = round === 1
          ? buildRound1Prompt(topic, roundCount)
          : buildRoundPrompt(round, topic, allRounds, roundCount);

        const responses = await Promise.all(
          agents.map(async (agentName) => {
            if (meetingFilename) {
              emitEvent('agent_speaking', meetingFilename, agentName);
            }
            const systemPrompt = promptsMap.get(agentName) ?? '';
            const answer = await queryAgent(
              agentName, question, systemPrompt, codeAware, active.projectPath,
            );
            return { agent: agentName, answer };
          }),
        );

        allRounds.push({ round, responses });

        // Update meeting file after each round so the viewer shows progress
        if (meetingFilePath) {
          await writeFile(meetingFilePath, buildMeetingContent(allRounds, 'in-progress'), 'utf-8');
        }

        if (meetingFilename) {
          await emitEvent('round_complete', meetingFilename, `Round ${round}`);
        }
      }

      if (jobId) updateJob(jobId, { progress: 'Extracting outcomes...' });

      // Extract structured outcomes from agent responses
      // First try tag-based parsing (fast, deterministic)
      let outcomes: StructuredOutcomes = extractStructuredOutcomes(allRounds);

      // If no tagged outcomes found, use AI extraction as fallback.
      // Now that agents receive tagging instructions, this should rarely fire —
      // but it's a safety net against silent outcome loss.
      const hasOutcomes = outcomes.decisions.length > 0 || outcomes.actions.length > 0 || outcomes.openQuestions.length > 0;
      if (!hasOutcomes) {
        try {
          const extractionPrompt = buildOutcomeExtractionPrompt(topic, allRounds);
          const extractedText = await queryWithRetry(extractionPrompt, { maxTurns: 1 }, 'Outcome extraction');
          // Parse the AI-extracted outcomes using the same tag parser
          if (extractedText.trim()) {
            const syntheticRound = [{ round: 0, responses: [{ agent: 'synthesizer', answer: extractedText }] }];
            outcomes = extractStructuredOutcomes(syntheticRound);
          }
        } catch {
          // AI extraction failed — proceed without outcomes
        }
      }

      // Finalize meeting file with outcomes and 'complete' status
      let meetingFile: string | undefined;
      if (meetingFilePath) {
        const outcomesAppendix = formatOutcomesAppendix(outcomes);
        await writeFile(
          meetingFilePath,
          buildMeetingContent(allRounds, 'complete', outcomesAppendix || undefined),
          'utf-8',
        );
        meetingFile = meetingFilename;

        await emitEvent('meeting_complete', meetingFilename, `${allRounds.length} round${allRounds.length > 1 ? 's' : ''} complete`);

        // Log to activity feed
        const decisionCount = outcomes.decisions.length;
        const actionCount = outcomes.actions.length;
        const outcomeCounts = [
          decisionCount > 0 ? `${decisionCount} decision${decisionCount > 1 ? 's' : ''}` : '',
          actionCount > 0 ? `${actionCount} action${actionCount > 1 ? 's' : ''}` : '',
        ].filter(Boolean).join(', ');
        // Format: "[N decisions, N actions]: first decision truncated to 80 chars"
        const firstDecision = outcomes.decisions[0]?.text;
        const decisionPreview = firstDecision
          ? firstDecision.length > 80 ? firstDecision.slice(0, 77) + '...' : firstDecision
          : shortTopic;
        const summaryText = outcomeCounts
          ? `[${outcomeCounts}]: ${decisionPreview}`
          : `Meeting complete: ${shortTopic}`;
        await writeActivityEntry({
          source: 'meeting',
          type: 'meeting_complete',
          summary: summaryText,
          linkedMeeting: meetingFilename,
        }).catch(() => {}); // fire-and-forget
      }

      // Build response
      const outcomesResponse: Record<string, unknown> = {};
      if (outcomes.decisions.length > 0) outcomesResponse.decisions = outcomes.decisions;
      if (outcomes.actions.length > 0) outcomesResponse.actions = outcomes.actions;
      if (outcomes.openQuestions.length > 0) outcomesResponse.openQuestions = outcomes.openQuestions;

      return {
        rounds: allRounds,
        ...(Object.keys(outcomesResponse).length > 0 ? { outcomes: outcomesResponse } : {}),
        ...(meetingFile ? { meetingFile } : {}),
        generatedAt: new Date().toISOString(),
      };
    }

    // Async mode: return job ID immediately, run meeting in background
    if (asyncMode) {
      const job = createJob();
      // Fire and forget — runMeeting completes the job when done
      runMeeting(job.id).then(
        (result) => completeJob(job.id, result),
        (err) => failJob(job.id, err instanceof Error ? err.message : 'Meeting failed'),
      );
      return NextResponse.json({
        jobId: job.id,
        status: 'pending',
        message: 'Meeting started in background. Poll GET /api/council/job-status/' + job.id + ' for results.',
      }, { status: 202 });
    }

    // Synchronous mode (default): run meeting and return result
    const result = await runMeeting();
    return NextResponse.json(result);
  } catch (err) {
    console.error('Multi-consult error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to run multi-consult' },
      { status: 500 },
    );
  }
}
