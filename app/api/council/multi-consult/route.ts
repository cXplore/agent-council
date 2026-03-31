import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfigByName } from '@/lib/config';
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
import { queryLLM } from '@/lib/llm-query';
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
async function loadWorkContext(meetingsDir: string, topic?: string): Promise<string> {
  try {
    const [index, unresolved] = await Promise.all([
      buildTagIndex(meetingsDir),
      getUnresolved(meetingsDir),
    ]);

    const sortByDate = (a: { date?: string | null }, b: { date?: string | null }) =>
      (b.date ?? '').localeCompare(a.date ?? '');

    const sections: string[] = [];

    // Summary counts — gives agents a sense of the decision landscape
    sections.push(
      `Outcome totals: ${index.decisions.length} decisions, ${unresolved.actions.length} active actions, ${unresolved.open.length} open questions`
    );

    const decisions = [...index.decisions].sort(sortByDate).slice(0, 5);
    if (decisions.length > 0) {
      sections.push('Recent decisions:\n' + decisions.map(d => `- ${d.text}`).join('\n'));
    }

    // Stale actions (>5 days old) — surface these so agents can address them
    const now = Date.now();
    const staleThresholdMs = 5 * 24 * 60 * 60 * 1000;
    const staleActions = unresolved.actions.filter(a => {
      if (!a.date) return false;
      return now - new Date(a.date).getTime() > staleThresholdMs;
    });

    if (staleActions.length > 5) {
      // Triage gate: when backlog is heavy, instruct agents to triage before producing new items
      const shown = staleActions.slice(0, 5);
      sections.push(
        `⚠️ TRIAGE REQUIRED: ${staleActions.length} stale action items (>5 days old). Before generating new items, briefly assess these — are they done, still relevant, or should be dropped?\n` +
        shown.map(a => `- [${a.date}]${a.assignee ? ` @${a.assignee}` : ''} ${a.text}`).join('\n') +
        `\n  ...and ${staleActions.length - 5} more`
      );
    } else if (staleActions.length > 0) {
      const shown = staleActions.slice(0, 5);
      sections.push(
        `Stale action items (${staleActions.length} total, >5 days old — consider closing, reassigning, or addressing):\n` +
        shown.map(a => `- [${a.date}]${a.assignee ? ` @${a.assignee}` : ''} ${a.text}`).join('\n')
      );
    }

    const recentActions = unresolved.actions.filter(a => {
      if (!a.date) return true;
      return now - new Date(a.date).getTime() <= staleThresholdMs;
    }).slice(0, 3);
    if (recentActions.length > 0) {
      sections.push('Recent action items:\n' + recentActions.map(a => `- ${a.text}`).join('\n'));
    }

    // Topic-relevant open questions and actions (if topic provided)
    if (topic) {
      try {
        const [topicOpenQ, topicActions] = await Promise.all([
          recallByTopic(meetingsDir, topic, { types: ['open'], limit: 3 }),
          recallByTopic(meetingsDir, topic, { types: ['action'], limit: 5 }),
        ]);
        if (topicActions.length > 0) {
          sections.push(
            'Existing action items related to this topic (avoid creating duplicates):\n' +
            topicActions.map(m => `- ${m.text}`).join('\n')
          );
        }
        if (topicOpenQ.length > 0) {
          sections.push(
            'Open questions related to this topic (DO NOT create new [OPEN:slug] tags with these slugs — they already exist):\n' +
            topicOpenQ.map(m => `- ${m.id ? `[OPEN:${m.id}]` : '[OPEN]'} ${m.text}`).join('\n')
          );
        }
      } catch { /* recallByTopic failure is non-critical */ }
    }

    // Remaining open questions (not already shown via topic matching)
    const open = unresolved.open.slice(0, 2);
    if (open.length > 0) {
      sections.push('Other open questions:\n' + open.map(o => `- ${o.text}`).join('\n'));
    }

    // Quality digest: surface tag validation warnings so agents maintain quality standards
    if (index.validationWarnings.length > 0) {
      const byCat: Record<string, number> = {};
      for (const w of index.validationWarnings) {
        byCat[w.type] = (byCat[w.type] ?? 0) + 1;
      }
      const parts: string[] = [];
      if (byCat['missing-assignee']) parts.push(`${byCat['missing-assignee']} ACTIONs missing @role`);
      if (byCat['missing-done-when']) parts.push(`${byCat['missing-done-when']} ACTIONs missing "done when:"`);
      if (byCat['missing-rationale']) parts.push(`${byCat['missing-rationale']} DECISIONs missing "because:" rationale`);
      sections.push(
        `Quality issues in past outcomes (${index.validationWarnings.length} total): ${parts.join(', ')}. ` +
        'Ensure YOUR outputs include @role assignments on ACTIONs, "done when:" completion criteria, and "because:" rationale on DECISIONs.'
      );
    }

    // Compact slug list for dedup: all active OPEN slugs so agents avoid creating duplicates
    const existingSlugs = unresolved.open
      .filter(o => o.id)
      .map(o => o.id!);
    if (existingSlugs.length > 0) {
      sections.push(
        `Existing OPEN slugs (${existingSlugs.length} total — do NOT reuse these slugs in new [OPEN:slug] tags):\n` +
        existingSlugs.slice(0, 30).join(', ') +
        (existingSlugs.length > 30 ? `, ...and ${existingSlugs.length - 30} more` : '')
      );
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
  } catch {
    return '';
  }
}

/**
 * Build the system prompt for an agent, including context enrichment.
 * Returns both the prompt and the agent's preferred model (from frontmatter).
 */
async function buildAgentPrompt(
  agentName: string,
  agentsDir: string,
  meetingsDir: string,
  topic: string,
  workContext: string,
): Promise<{ prompt: string; model?: string }> {
  const parts: string[] = [];
  let agentModel: string | undefined;

  // Load agent's system prompt and model preference
  try {
    const agentFile = path.join(agentsDir, `${agentName}.md`);
    const content = await readFile(agentFile, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    if (body.trim()) parts.push(body.trim());
    // Read model from frontmatter (e.g., "opus", "anthropic/claude-opus-4.6", "openai/gpt-5.4")
    if (frontmatter['model'] && typeof frontmatter['model'] === 'string') {
      agentModel = frontmatter['model'] as string;
    }
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

  return { prompt: parts.join('\n\n'), model: agentModel };
}

// queryWithRetry is now provided by lib/llm-query.ts as queryLLM

/**
 * Query a single agent and return the response text.
 */
async function queryAgent(
  agentName: string,
  question: string,
  systemPrompt: string,
  model?: string,
): Promise<string> {
  // DECISION (2026-03-31 design review): codeAware meetings do NOT give agents
  // file-reading tools. Tool presence overrides prompt instructions, causing agents
  // to spend all turns reading files instead of deliberating. Code awareness is
  // achieved through pre-flight context injection only.
  return queryLLM(question, { systemPrompt, model }, `Agent ${agentName}`);
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
    const projectOverride: string | undefined = typeof body?.project === 'string' ? body.project : undefined;

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

    // Pre-compute meeting filename so it's available for the 202 response
    const earlyMeetingFilename = writeMeeting ? generateMeetingFilename(type, topic) : '';

    // Core meeting execution — extracted so it can run sync or async
    async function runMeeting(jobId?: string): Promise<Record<string, unknown>> {
      const config = await getConfig();
      const active = projectOverride
        ? getProjectConfigByName(config, projectOverride) ?? getActiveProjectConfig(config)
        : getActiveProjectConfig(config);

      if (jobId) updateJob(jobId, { status: 'running', progress: 'Loading context...' });

      // Load shared work context once
      const workContext = await loadWorkContext(active.meetingsDir, topic);

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

      // Build base system prompts and load model preferences for all agents in parallel
      const agentConfigs = new Map<string, { prompt: string; model?: string }>();
      await Promise.all(
        agents.map(async (agentName) => {
          const result = await buildAgentPrompt(
            agentName, active.agentsDir, active.meetingsDir, topic, workContext,
          );
          let prompt = result.prompt;
          // Inject pre-flight context into every agent's prompt
          if (preflightContext) {
            prompt += '\n\n---\n\n' + preflightContext;
          }
          // DECISION (2026-03-31): codeAware agents get no tools, only injected context.
          if (codeAware && preflightContext) {
            prompt += '\n\n---\n\n## Code-Aware Context\n\nRelevant source files have been pre-injected above. Use this context to ground your analysis in the actual codebase. Focus entirely on deliberating the topic — do not attempt to read additional files.';
          }
          agentConfigs.set(agentName, { prompt, model: result.model });
        }),
      );

      // Generate meeting filename early so events reference the right file
      const meetingFilename = earlyMeetingFilename;
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
        if (projectOverride) lines.push(`project: ${projectOverride}`);
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
            const config = agentConfigs.get(agentName) ?? { prompt: '' };
            const answer = await queryAgent(
              agentName, question, config.prompt, config.model,
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
          const extractedText = await queryLLM(extractionPrompt, {}, 'Outcome extraction');
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

        // Log to activity feed — lead with outcomes, not meeting topic
        const decisionCount = outcomes.decisions.length;
        const actionCount = outcomes.actions.length;
        const openCount = outcomes.openQuestions.length;
        const outcomeCounts = [
          decisionCount > 0 ? `${decisionCount} decision${decisionCount > 1 ? 's' : ''}` : '',
          actionCount > 0 ? `${actionCount} action${actionCount > 1 ? 's' : ''}` : '',
          openCount > 0 ? `${openCount} open` : '',
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
        ...(earlyMeetingFilename ? { meetingFile: earlyMeetingFilename } : {}),
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
