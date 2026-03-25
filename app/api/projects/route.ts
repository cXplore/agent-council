import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, saveConfig } from '@/lib/config';

/** GET /api/projects — list all projects + active */
export async function GET() {
  const config = await getConfig();

  const projects = Object.entries(config.projects).map(([name, p]) => ({
    name,
    path: p.path,
    meetingsDir: p.meetingsDir,
    agentsDir: p.agentsDir,
  }));

  return NextResponse.json({
    projects,
    activeProject: config.activeProject,
    hasWorkspace: true,
  });
}

/** POST /api/projects — add a new project or switch active */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'switch') {
      // Switch active project
      const { name } = body;
      if (!name) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      }

      const config = await getConfig();

      if (name !== 'workspace' && !config.projects[name]) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      config.activeProject = name;
      await saveConfig(config);

      return NextResponse.json({ success: true, activeProject: name });
    }

    if (action === 'add') {
      // Add a new project
      const { name, projectPath, meetingsDir, agentsDir } = body;

      if (!name || !projectPath) {
        return NextResponse.json(
          { error: 'name and projectPath are required' },
          { status: 400 }
        );
      }

      // Verify project directory exists
      try {
        await stat(projectPath);
      } catch {
        return NextResponse.json(
          { error: 'Project directory not found' },
          { status: 404 }
        );
      }

      // Auto-detect meetings dir if not provided
      let resolvedMeetingsDir = meetingsDir || 'meetings';
      if (!meetingsDir) {
        const candidates = ['docs/10-meetings', 'docs/meetings', 'meetings', '.meetings'];
        for (const candidate of candidates) {
          try {
            await stat(path.join(projectPath, candidate));
            resolvedMeetingsDir = candidate;
            break;
          } catch {
            // try next
          }
        }
      }

      // Check for agents
      const resolvedAgentsDir = agentsDir || '.claude/agents';
      let agentCount = 0;
      let hasFacilitator = false;
      try {
        const agentFiles = await readdir(path.join(projectPath, resolvedAgentsDir));
        const mdFiles = agentFiles.filter(f => f.endsWith('.md'));
        agentCount = mdFiles.length;
        hasFacilitator = mdFiles.includes('facilitator.md');
      } catch {
        // no agents dir
      }

      const config = await getConfig();
      config.projects[name] = {
        path: projectPath.replace(/\\/g, '/'),
        meetingsDir: resolvedMeetingsDir,
        agentsDir: resolvedAgentsDir,
      };
      config.activeProject = name;
      await saveConfig(config);

      return NextResponse.json({
        success: true,
        project: config.projects[name],
        agentCount,
        hasFacilitator,
      });
    }

    if (action === 'remove') {
      const { name } = body;
      if (!name || name === 'workspace') {
        return NextResponse.json({ error: 'Cannot remove workspace' }, { status: 400 });
      }

      const config = await getConfig();
      delete config.projects[name];

      if (config.activeProject === name) {
        config.activeProject = 'workspace';
      }

      await saveConfig(config);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update projects' }, { status: 500 });
  }
}
