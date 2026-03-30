import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, saveConfig } from '@/lib/config';
import { scanProject } from '@/lib/scanner';
import { ensureGitignore, generateCoreAgents } from '@/lib/project-setup';
import type { ProjectProfile } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { projectPath, meetingsDir, name } = await req.json();

    if (!projectPath) {
      return NextResponse.json({ error: 'projectPath is required' }, { status: 400 });
    }

    // Normalize path: resolve relative paths, fix mixed separators, strip trailing slashes
    const normalizedPath = path.resolve(projectPath.replace(/\//g, path.sep));

    // Verify project directory exists
    try {
      const s = await stat(normalizedPath);
      if (!s.isDirectory()) {
        return NextResponse.json({ error: 'Path exists but is not a directory' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Project directory not found' }, { status: 404 });
    }

    // Derive project name
    const projectName = name || path.basename(normalizedPath);

    // Auto-detect meetings dir if not provided
    let resolvedMeetingsDir = meetingsDir || 'meetings';
    if (!meetingsDir) {
      const candidates = ['docs/10-meetings', 'docs/meetings', 'meetings', '.meetings'];
      for (const candidate of candidates) {
        try {
          await stat(path.join(normalizedPath, candidate));
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
      const agentFiles = await readdir(path.join(normalizedPath, agentsDir));
      const mdFiles = agentFiles.filter(f => f.endsWith('.md') && !f.endsWith('.context.md'));
      agentCount = mdFiles.length;
      hasFacilitator = mdFiles.includes('facilitator.md');
    } catch {
      // no agents dir
    }

    // Ensure meetings directory exists — must be inside project
    const absMeetingsDir = path.isAbsolute(resolvedMeetingsDir)
      ? resolvedMeetingsDir
      : path.join(normalizedPath, resolvedMeetingsDir);
    const normalizedMeetings = path.resolve(absMeetingsDir);
    if (!normalizedMeetings.startsWith(normalizedPath + path.sep) && normalizedMeetings !== normalizedPath) {
      return NextResponse.json({ error: 'meetingsDir must be inside the project directory' }, { status: 400 });
    }
    try {
      await mkdir(absMeetingsDir, { recursive: true });
    } catch {
      // might already exist
    }

    // Run lightweight filesystem scan — pure file I/O, no AI tokens needed
    let profile: ProjectProfile | undefined = undefined;
    let scanWarning: string | undefined = undefined;
    try {
      profile = await scanProject(normalizedPath);
      if (profile.truncated) {
        scanWarning = 'Large repository — scan was capped at 50,000 files. Agent context may be incomplete.';
      } else if (profile.scanQuality?.quality === 'minimal') {
        scanWarning = 'Could not detect enough project structure. Agents will use generic prompts.';
      }
    } catch (scanErr) {
      scanWarning = `Scan failed: ${scanErr instanceof Error ? scanErr.message : 'unknown error'}. Connected without project profile.`;
    }

    // Add meetingsDir to .gitignore if a .gitignore exists
    try {
      await ensureGitignore(normalizedPath, resolvedMeetingsDir);
    } catch {
      // Non-fatal — gitignore update is best-effort
    }

    // Auto-generate core agents if profile is available and agents are missing
    let generatedAgents: string[] = [];
    if (profile && agentCount === 0) {
      try {
        const result = await generateCoreAgents(normalizedPath, agentsDir, profile);
        generatedAgents = result.generated;
        agentCount = result.generated.length + result.skipped.length;
        hasFacilitator = false; // Core agents don't include facilitator
      } catch {
        // Non-fatal — agent generation is best-effort
      }
    }

    // Add project to config and make it active
    const config = await getConfig();
    config.projects[projectName] = {
      path: normalizedPath.replace(/\\/g, '/'),
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
      generatedAgents,
      ...(scanWarning ? { scanWarning } : {}),
    });
  } catch (err) {
    console.error('Connect project error:', err);
    return NextResponse.json({ error: 'Failed to connect project' }, { status: 500 });
  }
}
