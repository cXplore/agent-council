import { NextRequest, NextResponse } from 'next/server';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { buildTagIndex, getUnresolved } from '@/lib/tag-index';
import { extractSummary, parseMetadata, titleFromFilename } from '@/lib/meeting-utils';
import { query } from '@anthropic-ai/claude-agent-sdk';

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
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.warn(`AI context attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error('Query failed after retries');
}

/**
 * POST /api/council/ai-context
 *
 * Uses the Agent SDK (no tools) to generate a natural language narrative
 * about recent project activity — what's been happening, what matters, and
 * what to focus on next. More insightful than the structured session brief.
 *
 * Optional body: {
 *   maxMeetings?: number  — how many recent meetings to analyze (default: 4)
 *   codeAware?: boolean   — when true, the AI can inspect the project codebase
 *                            using Read/Glob/Grep tools to ground its narrative
 *                            in actual code state (default: false)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    let maxMeetings = 4;
    let codeAware = false;
    try {
      const body = await req.json();
      if (typeof body?.maxMeetings === 'number') {
        maxMeetings = Math.min(Math.max(1, body.maxMeetings), 8);
      }
      if (body?.codeAware === true) {
        codeAware = true;
      }
    } catch {
      // Missing body is fine — use defaults
    }

    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const meetingsDir = active.meetingsDir;

    // Load tag index for decisions; use getUnresolved for actions/open (filters done/stale)
    const [index, unresolved] = await Promise.all([
      buildTagIndex(meetingsDir),
      getUnresolved(meetingsDir),
    ]);

    // Load recent meeting summaries
    let files: string[] = [];
    try {
      const entries = await readdir(meetingsDir);
      files = entries
        .filter(f => f.endsWith('.md') && !f.startsWith('.'))
        .sort()
        .reverse(); // newest first
    } catch {
      return NextResponse.json({ error: 'No meetings directory found' }, { status: 404 });
    }

    const meetingSections: string[] = [];
    let inProgressCount = 0;

    // First, include any in-progress meetings
    for (const filename of files) {
      if (meetingSections.length >= maxMeetings) break;
      try {
        const content = await readFile(path.join(meetingsDir, filename), 'utf-8');
        const meta = parseMetadata(content);
        if (meta.status !== 'in-progress') continue;
        inProgressCount++;
        const title = meta.title ?? titleFromFilename(filename);
        const snippet = content.slice(0, 800).replace(/\n{3,}/g, '\n\n');
        meetingSections.push(`[IN PROGRESS] ${title} (${filename})\n${snippet}`);
      } catch {
        // skip unreadable files
      }
    }

    // Then, include recent complete meetings (summary only)
    for (const filename of files) {
      if (meetingSections.length >= maxMeetings) break;
      try {
        const content = await readFile(path.join(meetingsDir, filename), 'utf-8');
        const meta = parseMetadata(content);
        if (meta.status !== 'complete') continue;
        const title = meta.title ?? titleFromFilename(filename);
        const summary = extractSummary(content);
        const excerpt = summary
          ? summary.slice(0, 1200)
          : content.slice(0, 800).replace(/\n{3,}/g, '\n\n');
        meetingSections.push(`[COMPLETE] ${title} (${filename})\n${excerpt}`);
      } catch {
        // skip unreadable files
      }
    }

    if (meetingSections.length === 0) {
      return NextResponse.json({
        narrative: 'No meetings found yet. Run your first meeting to start building project context.',
        generatedAt: new Date().toISOString(),
      });
    }

    // Build active work items summary — use unresolved for actions/open, sort decisions by recency
    const sortByDate = (a: { date?: string | null }, b: { date?: string | null }) =>
      (b.date ?? '').localeCompare(a.date ?? '');
    const activeActions = unresolved.actions.slice(0, 5).map(a => `• ${a.text}`).join('\n');
    const activeOpen = unresolved.open.slice(0, 3).map(o => `? ${o.text}`).join('\n');
    const recentDecisions = [...index.decisions].sort(sortByDate).slice(0, 5).map(d => `✓ ${d.text}`).join('\n');

    const workContext = [
      activeActions && `Active actions:\n${activeActions}`,
      activeOpen && `Open questions:\n${activeOpen}`,
      recentDecisions && `Recent decisions:\n${recentDecisions}`,
    ].filter(Boolean).join('\n\n');

    const codeAwareInstructions = codeAware
      ? `\n\nYou have access to the project's codebase. Before writing the narrative, inspect the code to verify the current state — check if recent decisions have been implemented, look at recent file changes, and ground your analysis in what the code actually shows. Use Read, Glob, and Grep tools to look at relevant files. Be specific about what you find.`
      : '';

    const prompt = `You are analyzing recent project activity for the "${active.name ?? 'current project'}" project.

Here are the most recent meeting summaries:

${meetingSections.map((s, i) => `--- Meeting ${i + 1} ---\n${s}`).join('\n\n')}

${workContext ? `Current work state:\n${workContext}` : ''}
${codeAwareInstructions}

Write a concise narrative context (3-5 sentences) that:
1. Describes what the team has been working on recently and why
2. Identifies any patterns or recurring themes
3. Highlights the most important thing to focus on right now
4. Notes any unresolved tensions or open questions that matter

Be specific and direct. Don't summarize — synthesize. Focus on what would help someone starting a work session understand the current state and direction.

Return only the narrative paragraph. No headings, no bullet points, no preamble.`;

    // Code-aware mode: enable read-only tools and multiple turns
    const tools = codeAware ? ['Read', 'Glob', 'Grep'] : [];
    const maxTurns = codeAware ? 5 : 1;
    const queryOptions: Record<string, unknown> = {
      tools,
      maxTurns,
    };

    // Set working directory to the project path for code-aware queries
    if (codeAware && active.projectPath) {
      queryOptions.cwd = active.projectPath;
      queryOptions.permissionMode = 'acceptEdits'; // read-only tools are safe
    }

    const narrative = await queryWithRetry(prompt, queryOptions);

    if (!narrative) {
      return NextResponse.json({ error: 'Failed to generate context' }, { status: 500 });
    }

    return NextResponse.json({
      narrative,
      meetingsAnalyzed: meetingSections.length,
      inProgressMeetings: inProgressCount,
      codeAware,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('AI context error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate context' },
      { status: 500 },
    );
  }
}
