import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { loadTemplate, fillTemplate, parseFrontmatter, serializeFrontmatter } from '@/lib/agent-templates';
import type { ProjectProfile } from '@/lib/types';

interface AgentInput {
  name: string;
  template: string;
  model?: string;
  description?: string;
}

interface GenerateRequest {
  targetDir: string;
  agents: AgentInput[];
  projectProfile: ProjectProfile;
  meetingsDir?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateRequest = await req.json();
    const { targetDir, agents, projectProfile } = body;

    if (!targetDir || typeof targetDir !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "targetDir" field' },
        { status: 400 },
      );
    }

    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty "agents" array' },
        { status: 400 },
      );
    }

    // Derive placeholder values from project profile
    const projectName = await getProjectName(targetDir);
    const frameworkNames = (projectProfile?.frameworks ?? []).map(f => f.name).join(', ') || 'Unknown';
    const languageNames = (projectProfile?.languages ?? []).map(l => l.name).join(', ') || 'Unknown';
    const pkgManager = projectProfile?.packageManager ?? 'unknown';

    const placeholders: Record<string, string> = {
      PROJECT_NAME: projectName,
      FRAMEWORK: frameworkNames,
      LANGUAGES: languageNames,
      PACKAGE_MANAGER: pkgManager,
      MEETINGS_DIR: body.meetingsDir || 'meetings',
    };

    // Validate targetDir is an existing directory
    const resolvedTarget = path.resolve(targetDir);

    // Reject filesystem root or system paths
    if (resolvedTarget === '/' || resolvedTarget === 'C:\\' || resolvedTarget.length < 4) {
      return NextResponse.json({ error: 'Invalid target directory' }, { status: 400 });
    }

    // Verify the directory actually exists
    try {
      const { stat: statFn } = await import('node:fs/promises');
      const s = await statFn(resolvedTarget);
      if (!s.isDirectory()) throw new Error('Not a directory');
    } catch {
      return NextResponse.json({ error: 'Target directory does not exist' }, { status: 404 });
    }

    // Ensure agents directory exists
    const agentsDir = path.join(resolvedTarget, '.claude', 'agents');
    await mkdir(agentsDir, { recursive: true });

    // Ensure meetings directory exists in target project
    const meetingsDir = path.join(resolvedTarget, 'meetings');
    await mkdir(meetingsDir, { recursive: true });

    const createdFiles: string[] = [];
    const errors: { agent: string; error: string }[] = [];

    for (const agent of agents) {
      try {
        // Load template
        let templateContent: string;
        try {
          templateContent = await loadTemplate(agent.template);
        } catch {
          errors.push({ agent: agent.name, error: `Template "${agent.template}" not found` });
          continue;
        }

        // Fill placeholders
        let content = fillTemplate(templateContent, placeholders);

        // Override frontmatter values if customized
        if (agent.name || agent.description || agent.model) {
          const { frontmatter, body } = parseFrontmatter(content);

          if (agent.name) frontmatter['name'] = agent.name;
          if (agent.description) frontmatter['description'] = agent.description;
          if (agent.model) frontmatter['model'] = agent.model;

          // Reconstruct the file preserving YAML arrays
          content = `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;
        }

        // Sanitize agent name to prevent path traversal
        const safeName = path.basename(agent.name).replace(/[^a-zA-Z0-9_-]/g, '-');
        if (!safeName) {
          errors.push({ agent: agent.name, error: 'Invalid agent name' });
          continue;
        }

        // Write file
        const filePath = path.join(agentsDir, `${safeName}.md`);
        await writeFile(filePath, content, 'utf-8');
        createdFiles.push(filePath);
      } catch (err: any) {
        errors.push({ agent: agent.name, error: err.message ?? 'Unknown error' });
      }
    }

    // Add meeting system section to CLAUDE.md if it doesn't exist
    const claudeMdPath = path.join(resolvedTarget, 'CLAUDE.md');
    const hasFacilitator = agents.some(a => a.template === 'facilitator');
    if (hasFacilitator) {
      await appendMeetingInstructions(claudeMdPath, projectName);
    }

    return NextResponse.json({
      created: createdFiles,
      errors: errors.length > 0 ? errors : undefined,
      agentsDir,
    });
  } catch (err: any) {
    console.error('Generate error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

async function appendMeetingInstructions(claudeMdPath: string, projectName: string) {
  const meetingSection = `

## Meeting System (Agent Council)

This project uses Agent Council for structured agent meetings. When the user asks for any kind of meeting, discussion, review, or standup, use the **facilitator** agent to orchestrate it.

### How to Run a Meeting

1. The user asks for a meeting in plain language (no special commands needed)
2. Spawn the facilitator agent, which creates a meeting file and orchestrates the conversation
3. The user watches it live at the Agent Council meeting viewer

### Meeting Formats

The facilitator picks the right format based on what the user asks for:

- **Standup** — daily brief, what matters today
- **Design Review** — evaluate a specific component or design decision
- **Strategy Session** — direction and priorities on a topic
- **Retrospective** — what went well, what's messy
- **Architecture Review** — system design and trade-offs
- **Sprint Planning** — what to tackle next
- **Incident Review** — what went wrong, how to prevent it

### Mandatory Roles

Every decision-producing meeting includes: **project-manager** (what's real), **critic** (what's wrong), **north-star** (what's possible).
`;

  try {
    await access(claudeMdPath);
    // File exists — check if meeting section already present
    const existing = await readFile(claudeMdPath, 'utf-8');
    if (!existing.includes('Meeting System (Agent Council)')) {
      await writeFile(claudeMdPath, existing + meetingSection, 'utf-8');
    }
  } catch {
    // File doesn't exist — create it
    await writeFile(claudeMdPath, `# ${projectName}\n${meetingSection}`, 'utf-8');
  }
}

async function getProjectName(dirPath: string): Promise<string> {
  try {
    const raw = await readFile(path.join(dirPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    if (pkg.name) return pkg.name;
  } catch {
    // Fall through to directory name
  }
  return path.basename(dirPath);
}
