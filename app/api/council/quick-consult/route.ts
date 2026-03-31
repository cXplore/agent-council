import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';
import { buildTagIndex, getUnresolved, recallByTopic } from '@/lib/tag-index';
import { query } from '@anthropic-ai/claude-agent-sdk';

const VALID_AGENTS = ['architect', 'critic', 'developer', 'designer', 'north-star', 'project-manager'];

/**
 * Run a query with retry on transient failures (overloaded, network errors).
 * Uses exponential backoff: 2s, 4s for up to 2 retries.
 */
async function queryWithRetry(
  prompt: string,
  options: Record<string, unknown>,
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
      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
      console.warn(`Quick consult attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error('Query failed after retries');
}

/**
 * Load recent decisions + active work items as context for the agent.
 * Keeps it concise — max 5 decisions, 3 actions, 2 open questions.
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
 * POST /api/council/quick-consult
 *
 * Ask a single agent one question and get one answer — no meeting overhead.
 * Uses the Agent SDK with the agent's own system prompt from their .md file.
 * Enriches agents with their context file and recent project decisions.
 *
 * Body: { question: string, agent?: string, codeAware?: boolean, topic?: string }
 *   - codeAware: when true, allows the agent to read the project's codebase
 *     using Read/Glob/Grep tools (up to 5 turns). Default: false.
 *   - topic: when provided, auto-searches relevant decisions and open questions
 *     and injects them into the agent's context. Grounds the response in
 *     institutional memory from past meetings.
 *
 * Response: { answer: string, agent: string, codeAware: boolean, topic?: string, generatedAt: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = typeof body?.question === 'string' ? body.question.trim() : '';
    const agentName: string = typeof body?.agent === 'string' ? body.agent.trim() : 'critic';
    const codeAware: boolean = body?.codeAware === true;
    const topic: string = typeof body?.topic === 'string' ? body.topic.trim() : '';

    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }
    if (!VALID_AGENTS.includes(agentName)) {
      return NextResponse.json(
        { error: `agent must be one of: ${VALID_AGENTS.join(', ')}` },
        { status: 400 },
      );
    }

    const config = await getConfig();
    const active = getActiveProjectConfig(config);

    // Load the agent's system prompt from their .md file
    const promptParts: string[] = [];
    try {
      const agentFile = path.join(active.agentsDir, `${agentName}.md`);
      const content = await readFile(agentFile, 'utf-8');
      const { body: agentBody } = parseFrontmatter(content);
      if (agentBody.trim()) {
        promptParts.push(agentBody.trim());
      }
    } catch {
      // Agent file not found — proceed without role prompt
    }

    // Enrich with agent's context file (project-specific learnings)
    try {
      const contextFile = path.join(active.agentsDir, `${agentName}.context.md`);
      const contextContent = await readFile(contextFile, 'utf-8');
      if (contextContent.trim()) {
        promptParts.push('---\n\n## Project Context\n\n' + contextContent.trim());
      }
    } catch {
      // No context file — that's fine
    }

    // Load project brief if it exists
    try {
      const { PROJECT_BRIEF_FILENAME } = await import('@/lib/context-files');
      const briefPath = path.join(active.meetingsDir, PROJECT_BRIEF_FILENAME);
      const briefContent = await readFile(briefPath, 'utf-8');
      const hasUserContent = briefContent.split('\n').some(l => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('**Created') && !l.startsWith('<!--'));
      if (hasUserContent) {
        promptParts.push('---\n\n## Project Brief\n\n' + briefContent.trim());
      }
    } catch {
      // No project brief
    }

    // Enrich with recent decisions and work items
    const workContext = await loadWorkContext(active.meetingsDir);
    if (workContext) {
      promptParts.push('---\n\n## Current Project State\n\n' + workContext);
    }

    // Enrich with topic-specific decisions if topic provided
    if (topic) {
      try {
        const recalled = await recallByTopic(active.meetingsDir, topic, { limit: 5 });
        if (recalled.length > 0) {
          const recallLines = recalled.map(r => {
            const label = r.type === 'OPEN' ? 'OPEN QUESTION' : 'DECISION';
            return `- [${label}] ${r.text}\n  From: ${r.meetingTitle} (${r.date ?? 'unknown'})`;
          });
          promptParts.push(
            '---\n\n## Relevant Team Decisions\n\n' +
            `The following decisions and open questions are relevant to the topic "${topic}":\n\n` +
            recallLines.join('\n\n')
          );
        }
      } catch {
        // Recall failed — proceed without topic context
      }
    }

    // DECISION (2026-03-31 design review): codeAware does NOT give agents tools.
    // Tool presence overrides prompt instructions, causing agents to read instead
    // of deliberate. Code awareness is achieved through pre-flight context injection.
    if (codeAware) {
      promptParts.push('---\n\n## Code-Aware Context\n\nRelevant source files and project context have been pre-injected above. Use this context to ground your answer in the actual codebase. Focus entirely on answering the question — do not attempt to read additional files.');
    }

    const systemPrompt = promptParts.length > 0 ? promptParts.join('\n\n') : undefined;

    const queryOptions: Record<string, unknown> = {
      ...(systemPrompt ? { systemPrompt } : {}),
    };

    const answer = await queryWithRetry(question, queryOptions);

    if (!answer) {
      return NextResponse.json({ error: 'No response from agent' }, { status: 500 });
    }

    return NextResponse.json({
      answer,
      agent: agentName,
      codeAware,
      ...(topic ? { topic } : {}),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Quick consult error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get response' },
      { status: 500 },
    );
  }
}
