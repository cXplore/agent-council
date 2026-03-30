import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, saveConfig } from '@/lib/config';
import { scanProject } from '@/lib/scanner';

export async function POST(req: NextRequest) {
  try {
    const { projectPath, meetingsDir, name } = await req.json();

    if (!projectPath) {
      return NextResponse.json({ error: 'projectPath is required' }, { status: 400 });
    }

    // Verify project directory exists
    try {
      await stat(projectPath);
    } catch {
      return NextResponse.json({ error: 'Project directory not found' }, { status: 404 });
    }

    // Derive project name
    const projectName = name || path.basename(projectPath);

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
    const agentsDir = '.claude/agents';
    let agentCount = 0;
    let hasFacilitator = false;
    try {
      const agentFiles = await readdir(path.join(projectPath, agentsDir));
      const mdFiles = agentFiles.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
      agentCount = mdFiles.length;
      hasFacilitator = mdFiles.includes('facilitator.md');
    } catch {
      // no agents dir
    }

    // Ensure meetings directory exists — must be inside projectPath
    const absMeetingsDir = path.isAbsolute(resolvedMeetingsDir)
      ? resolvedMeetingsDir
      : path.join(projectPath, resolvedMeetingsDir);
    const normalizedMeetings = path.resolve(absMeetingsDir);
    const normalizedProject = path.resolve(projectPath);
    if (!normalizedMeetings.startsWith(normalizedProject + path.sep) && normalizedMeetings !== normalizedProject) {
      return NextResponse.json({ error: 'meetingsDir must be inside the project directory' }, { status: 400 });
    }
    try {
      await mkdir(absMeetingsDir, { recursive: true });
    } catch {
      // might already exist
    }

    // Run lightweight filesystem scan — pure file I/O, no AI tokens needed
    let profile = undefined;
    try {
      profile = await scanProject(projectPath);
    } catch {
      // Scan failure is non-fatal — connect still works without a profile
    }

    // Add project to config and make it active
    const config = await getConfig();
    config.projects[projectName] = {
      path: projectPath.replace(/\\/g, '/'),
      meetingsDir: resolvedMeetingsDir,
      agentsDir,
      ...(profile ? { profile } : {}),
    };
    config.activeProject = projectName;
    await saveConfig(config);

    return NextResponse.json({
      success: true,
      name: projectName,
      project: config.projects[projectName],
      agentCount,
      hasFacilitator,
      profile,
    });
  } catch (err) {
    console.error('Connect project error:', err);
    return NextResponse.json({ error: 'Failed to connect project' }, { status: 500 });
  }
}
