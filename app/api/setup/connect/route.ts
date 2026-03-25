import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, saveConfig } from '@/lib/config';

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
      const mdFiles = agentFiles.filter(f => f.endsWith('.md'));
      agentCount = mdFiles.length;
      hasFacilitator = mdFiles.includes('facilitator.md');
    } catch {
      // no agents dir
    }

    // Ensure meetings directory exists
    const absMeetingsDir = path.isAbsolute(resolvedMeetingsDir)
      ? resolvedMeetingsDir
      : path.join(projectPath, resolvedMeetingsDir);
    try {
      await mkdir(absMeetingsDir, { recursive: true });
    } catch {
      // might already exist
    }

    // Add project to config and make it active
    const config = await getConfig();
    config.projects[projectName] = {
      path: projectPath.replace(/\\/g, '/'),
      meetingsDir: resolvedMeetingsDir,
      agentsDir,
    };
    config.activeProject = projectName;
    await saveConfig(config);

    return NextResponse.json({
      success: true,
      name: projectName,
      project: config.projects[projectName],
      agentCount,
      hasFacilitator,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to connect project' }, { status: 500 });
  }
}
