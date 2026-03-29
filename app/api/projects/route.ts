import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, saveConfig, validateProjects } from '@/lib/config';

/** GET /api/projects — list all projects + active */
export async function GET() {
  try {
    const config = await getConfig();

    // Check which projects are still accessible
    const { missing } = await validateProjects(config);
    const missingSet = new Set(missing);

    const projects = Object.entries(config.projects).map(([name, p]) => ({
      name,
      path: p.path,
      meetingsDir: p.meetingsDir,
      agentsDir: p.agentsDir,
      accessible: !missingSet.has(name),
    }));

    return NextResponse.json({
      projects,
      activeProject: config.activeProject,
      hasWorkspace: true,
      missingProjects: missing.length > 0 ? missing : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
  }
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

      // Validate project name: alphanumeric, hyphens, underscores, dots only
      if (!/^[\w.-]{1,100}$/.test(name)) {
        return NextResponse.json(
          { error: 'Project name must be alphanumeric (hyphens, underscores, dots allowed), max 100 chars' },
          { status: 400 }
        );
      }

      // Validate path is absolute
      if (!path.isAbsolute(projectPath)) {
        return NextResponse.json(
          { error: 'projectPath must be an absolute path' },
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
        const mdFiles = agentFiles.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
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
    console.error('Projects update error:', err);
    return NextResponse.json({ error: 'Failed to update projects' }, { status: 500 });
  }
}
