import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { parseFrontmatter } from '@/lib/agent-templates';
import { query } from '@anthropic-ai/claude-agent-sdk';

const VALID_AGENTS = ['architect', 'critic', 'developer', 'designer', 'north-star', 'project-manager'];

/**
 * POST /api/council/quick-consult
 *
 * Ask a single agent one question and get one answer — no meeting overhead.
 * Uses the Agent SDK with the agent's own system prompt from their .md file.
 *
 * Body: { question: string, agent?: string }
 * Response: { answer: string, agent: string, generatedAt: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = typeof body?.question === 'string' ? body.question.trim() : '';
    const agentName: string = typeof body?.agent === 'string' ? body.agent.trim() : 'critic';

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
    let systemPrompt: string | undefined;
    try {
      const agentFile = path.join(active.agentsDir, `${agentName}.md`);
      const content = await readFile(agentFile, 'utf-8');
      const { body: agentBody } = parseFrontmatter(content);
      systemPrompt = agentBody.trim() || undefined;
    } catch {
      // Agent file not found — proceed without system prompt
    }

    let answer = '';

    for await (const message of query({
      prompt: question,
      options: {
        ...(systemPrompt ? { systemPrompt } : {}),
        tools: [],
        maxTurns: 1,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block && block.text) {
            answer += block.text;
          }
        }
      }
    }

    answer = answer.trim();

    if (!answer) {
      return NextResponse.json({ error: 'No response from agent' }, { status: 500 });
    }

    return NextResponse.json({
      answer,
      agent: agentName,
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
