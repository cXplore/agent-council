import { NextResponse } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getConfig, getActiveProjectConfig } from '@/lib/config';

/**
 * POST /api/agents/suggest-teams — AI-powered team suggestions.
 *
 * Uses the Claude Agent SDK to analyze the project and suggest
 * meaningful team groupings for the current agents.
 */
export async function POST() {
  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const projectPath = active.projectPath ?? process.cwd();

    const prompt = `You are analyzing a project to suggest team groupings for AI agents.

The project is at "${projectPath}". Read key files (README, package.json, key source files) to understand the project's architecture and domains.

Then suggest team groupings for these agents: facilitator, project-manager, critic, north-star, developer, architect, designer, qa-engineer, security-reviewer, devops, tech-writer, domain-expert.

Return ONLY a JSON object (no markdown, no explanation) mapping agent names to team names:

{
  "teams": {
    "facilitator": "core",
    "developer": "engineering",
    ...
  },
  "teamDescriptions": {
    "core": "Why this team exists for this project",
    "engineering": "What this team focuses on"
  }
}

Team names should be specific to THIS project when possible. For example, a project with distinct frontend/backend might have "frontend" and "backend" instead of generic "engineering". A project with AI features might have an "ai" team.

Return ONLY the JSON.`;

    let resultText = '';

    for await (const message of query({
      prompt,
      options: {
        allowedTools: ['Read', 'Glob', 'Grep'],
        permissionMode: 'acceptEdits',
        cwd: projectPath,
        maxTurns: 15,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block && block.text) {
            resultText += block.text;
          }
        }
      }
    }

    let jsonStr = resultText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const objStart = jsonStr.indexOf('{');
    const objEnd = jsonStr.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      jsonStr = jsonStr.slice(objStart, objEnd + 1);
    }

    const result = JSON.parse(jsonStr);
    return NextResponse.json(result);
  } catch (err) {
    console.error('AI suggest teams error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to suggest teams' },
      { status: 500 },
    );
  }
}
