import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { getConfig, saveConfig, validateProjects } from '@/lib/config';
import { connectProject } from '@/lib/connect-project';
import type { ProjectProfile } from '@/lib/types';

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
      profile: p.profile,
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
      // Add a new project — delegates to shared connect logic
      const { name, projectPath, meetingsDir, agentsDir, profile } = body as {
        name?: string; projectPath?: string; meetingsDir?: string;
        agentsDir?: string; profile?: ProjectProfile;
      };

      if (!projectPath) {
        return NextResponse.json(
          { error: 'projectPath is required' },
          { status: 400 }
        );
      }

      if (!path.isAbsolute(projectPath)) {
        return NextResponse.json(
          { error: 'projectPath must be an absolute path' },
          { status: 400 }
        );
      }

      try {
        const result = await connectProject({
          projectPath,
          meetingsDir,
          agentsDir,
          name,
          profile,
        });
        return NextResponse.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add project';
        const status = message.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
      }
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
