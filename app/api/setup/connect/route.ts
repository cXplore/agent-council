import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { clearConfigCache } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const { projectDir, meetingsDir } = await req.json();

    if (!projectDir || !meetingsDir) {
      return NextResponse.json(
        { error: 'projectDir and meetingsDir are required' },
        { status: 400 }
      );
    }

    // Verify project directory exists
    try {
      await stat(projectDir);
    } catch {
      return NextResponse.json(
        { error: 'Project directory not found' },
        { status: 404 }
      );
    }

    // Check if .claude/agents/ exists and has agent files
    const agentsDir = path.join(projectDir, '.claude', 'agents');
    let hasAgents = false;
    let agentCount = 0;
    let hasFacilitator = false;
    try {
      const agentFiles = await readdir(agentsDir);
      const mdFiles = agentFiles.filter(f => f.endsWith('.md'));
      agentCount = mdFiles.length;
      hasAgents = agentCount > 0;
      hasFacilitator = mdFiles.includes('facilitator.md');
    } catch {
      // agents dir doesn't exist
    }

    // Ensure meetings directory exists
    try {
      await mkdir(meetingsDir, { recursive: true });
    } catch {
      // might already exist
    }

    // Update council.config.json
    const configPath = path.join(process.cwd(), 'council.config.json');
    const config = {
      projectDir: projectDir.replace(/\\/g, '/'),
      meetingsDir: meetingsDir.replace(/\\/g, '/'),
      agentsDir: '.claude/agents',
      port: 3001,
    };

    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    // Invalidate cached config so subsequent requests use the new values
    clearConfigCache();

    return NextResponse.json({
      success: true,
      config,
      hasAgents,
      agentCount,
      hasFacilitator,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to connect' },
      { status: 500 }
    );
  }
}
