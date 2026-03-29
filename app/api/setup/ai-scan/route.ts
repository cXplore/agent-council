import { NextRequest, NextResponse } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * POST /api/setup/ai-scan — Deep project scan using Claude Agent SDK.
 *
 * Uses the Claude Agent SDK with the user's subscription (via setup-token)
 * to read and analyze a project's codebase. Returns project-specific agent
 * suggestions, descriptions, and team groupings.
 *
 * This replaces the basic scanner for the "Connect & scan" flow.
 */
export async function POST(req: NextRequest) {
  try {
    const { path: projectPath } = await req.json();

    if (!projectPath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const prompt = `You are scanning a project at "${projectPath}" to set up an AI agent team.

Read the project's key files to understand what it does:
1. README.md (if exists)
2. package.json or equivalent dependency file
3. Key source files (entry points, route files, main components)
4. Any config files (database, auth, deployment)

Then return a JSON object (and NOTHING else — no markdown, no explanation, just the JSON) with this exact structure:

{
  "projectSummary": "One-line description of what this project does",
  "profile": {
    "languages": [{"name": "TypeScript", "fileCount": 77, "percentage": 87}],
    "frameworks": [{"name": "Next.js", "confidence": "high", "version": "16.1.6"}],
    "structure": {"hasApi": true, "hasFrontend": true, "hasDatabase": true, "hasTests": false, "hasCICD": false, "isMonorepo": false, "hasDocker": false},
    "packageManager": "npm",
    "libraries": {"ai": ["SDK Name"], "auth": ["Auth Lib"]},
    "suggestedPreset": "full-stack",
    "suggestedAgents": ["facilitator", "developer", "architect"]
  },
  "suggestedAgents": ["facilitator", "project-manager", "critic", "north-star", "developer", "architect"],
  "agentDescriptions": {
    "facilitator": "Project-specific one-line description",
    "developer": "Project-specific one-line description mentioning actual frameworks/tools used"
  },
  "teamSuggestions": {
    "core": ["facilitator", "project-manager", "critic", "north-star"],
    "engineering": ["developer", "architect"]
  }
}

Available agent templates: facilitator, project-manager, critic, north-star, developer, architect, designer, qa-engineer, security-reviewer, devops, tech-writer, domain-expert.

The mandatory triad (project-manager, critic, north-star) + facilitator should always be included. Other agents depend on the project's actual needs.

Make descriptions specific to THIS project — mention actual frameworks, services, and architectural patterns you find. Not generic descriptions.

Return ONLY the JSON. No markdown fences, no explanation.`;

    let resultText = '';

    for await (const message of query({
      prompt,
      options: {
        allowedTools: ['Read', 'Glob', 'Grep'],
        permissionMode: 'acceptEdits',
        cwd: projectPath,
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

    // Extract JSON from the response (Claude might wrap it in markdown fences)
    let jsonStr = resultText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    // Find the JSON object
    const objStart = jsonStr.indexOf('{');
    const objEnd = jsonStr.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      jsonStr = jsonStr.slice(objStart, objEnd + 1);
    }

    const result = JSON.parse(jsonStr);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.error('AI scan error:', err);
    const message = err instanceof Error ? err.message : 'AI scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
