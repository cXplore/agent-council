import { NextRequest, NextResponse } from 'next/server';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { buildTagIndex } from '@/lib/tag-index';
import { extractSummary, parseMetadata, titleFromFilename } from '@/lib/meeting-utils';
import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * POST /api/council/ai-context
 *
 * Uses the Agent SDK (no tools) to generate a natural language narrative
 * about recent project activity — what's been happening, what matters, and
 * what to focus on next. More insightful than the structured session brief.
 *
 * Optional body: { maxMeetings?: number } — how many recent meetings to analyze (default: 4)
 */
export async function POST(req: NextRequest) {
  try {
    let maxMeetings = 4;
    try {
      const body = await req.json();
      if (typeof body?.maxMeetings === 'number') {
        maxMeetings = Math.min(Math.max(1, body.maxMeetings), 8);
      }
    } catch {
      // Missing body is fine — use defaults
    }

    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const meetingsDir = active.meetingsDir;

    // Load tag index for decisions/actions/open questions
    const index = await buildTagIndex(meetingsDir);

    // Load recent meeting summaries
    let files: string[] = [];
    try {
      const entries = await readdir(meetingsDir);
      files = entries
        .filter(f => f.endsWith('.md'))
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

    // Build active work items summary
    const activeActions = index.actions.slice(0, 5).map(a => `• ${a.text}`).join('\n');
    const activeOpen = index.open.slice(0, 3).map(o => `? ${o.text}`).join('\n');
    const recentDecisions = index.decisions.slice(0, 5).map(d => `✓ ${d.text}`).join('\n');

    const workContext = [
      activeActions && `Active actions:\n${activeActions}`,
      activeOpen && `Open questions:\n${activeOpen}`,
      recentDecisions && `Recent decisions:\n${recentDecisions}`,
    ].filter(Boolean).join('\n\n');

    const prompt = `You are analyzing recent project activity for the "${active.name ?? 'current project'}" project.

Here are the most recent meeting summaries:

${meetingSections.map((s, i) => `--- Meeting ${i + 1} ---\n${s}`).join('\n\n')}

${workContext ? `Current work state:\n${workContext}` : ''}

Write a concise narrative context (3-5 sentences) that:
1. Describes what the team has been working on recently and why
2. Identifies any patterns or recurring themes
3. Highlights the most important thing to focus on right now
4. Notes any unresolved tensions or open questions that matter

Be specific and direct. Don't summarize — synthesize. Focus on what would help someone starting a work session understand the current state and direction.

Return only the narrative paragraph. No headings, no bullet points, no preamble.`;

    let narrative = '';

    for await (const message of query({
      prompt,
      options: {
        tools: [],  // No tools needed — pure text generation
        maxTurns: 1,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block && block.text) {
            narrative += block.text;
          }
        }
      }
    }

    narrative = narrative.trim();

    if (!narrative) {
      return NextResponse.json({ error: 'Failed to generate context' }, { status: 500 });
    }

    return NextResponse.json({
      narrative,
      meetingsAnalyzed: meetingSections.length,
      inProgressMeetings: inProgressCount,
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
