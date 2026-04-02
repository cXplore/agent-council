import { NextRequest } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildOperatorPrompt, loadSubagentsWithContext } from '@/lib/sdk/operator';

/**
 * POST /api/setup/ai-scan — Deep project scan using Claude Agent SDK.
 *
 * Streams progress as Server-Sent Events so the setup wizard shows
 * what Claude is doing in real-time. Final event contains the JSON result.
 */
export async function POST(req: NextRequest) {
  let projectPath: string;
  try {
    const body = await req.json();
    projectPath = body?.path;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'path is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate path is absolute and exists on disk
  const nodePath = await import('node:path');
  const { stat } = await import('node:fs/promises');
  if (!nodePath.default.isAbsolute(projectPath)) {
    return new Response(JSON.stringify({ error: 'path must be absolute' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    await stat(projectPath);
  } catch {
    return new Response(JSON.stringify({ error: 'path does not exist' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let resultText = '';

        send('status', { message: 'Starting project scan...' });

        // Load subagents from the TARGET project (not active project)
        const targetAgentsDir = projectPath + '/.claude/agents';
        let agents: Record<string, { description: string; prompt: string; tools: string[] }> = {};
        try {
          agents = await loadSubagentsWithContext(targetAgentsDir);
          if (Object.keys(agents).length > 0) {
            send('status', { message: `Loaded ${Object.keys(agents).length} agents as subagents` });
          }
        } catch {
          // No agents available — operator works alone
        }

        const agentNames = Object.keys(agents);
        const systemPrompt = buildOperatorPrompt(agentNames);

        for await (const message of query({
          prompt,
          options: {
            systemPrompt,
            allowedTools: agentNames.length > 0 ? ['Read', 'Glob', 'Grep', 'Agent'] : ['Read', 'Glob', 'Grep'],
            permissionMode: 'acceptEdits',
            cwd: projectPath,
            maxTurns: 30,
            ...(agentNames.length > 0 ? { agents } : {}),
          },
        })) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if ('text' in block && block.text) {
                resultText += block.text;
              } else if ('name' in block) {
                // Tool call — show what Claude is doing
                const toolName = (block as { name: string }).name;
                const toolInput = (block as { input?: Record<string, unknown> }).input;
                let detail = '';
                if (toolName === 'Read' && toolInput?.file_path) {
                  detail = `Reading ${String(toolInput.file_path).split(/[\\/]/).pop()}`;
                } else if (toolName === 'Glob' && toolInput?.pattern) {
                  const pattern = String(toolInput.pattern);
                  detail = `Finding ${pattern.split(/[\\/]/).pop() || pattern}`;
                } else if (toolName === 'Grep' && toolInput?.pattern) {
                  detail = `Searching for "${toolInput.pattern}"`;
                } else if (toolName === 'Bash') {
                  const cmd = String(toolInput?.command || '').slice(0, 60);
                  detail = cmd ? `Running: ${cmd}` : '';
                } else if (toolName === 'Agent') {
                  detail = 'Analyzing project structure...';
                }
                if (detail) send('progress', { tool: toolName, detail });
              }
            }
          }
        }

        // Parse the JSON result
        let jsonStr = resultText.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();

        const objStart = jsonStr.indexOf('{');
        const objEnd = jsonStr.lastIndexOf('}');
        if (objStart >= 0 && objEnd > objStart) {
          jsonStr = jsonStr.slice(objStart, objEnd + 1);
        }

        const result = JSON.parse(jsonStr);
        send('result', result);
        send('done', {});
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Scan failed';
        send('error', { message: errorMsg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
    },
  });
}
