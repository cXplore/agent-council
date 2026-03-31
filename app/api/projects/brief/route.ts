import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getConfig, getProjectConfigByName } from '@/lib/config';
import { scanProject } from '@/lib/scanner';
import { readFile } from 'node:fs/promises';
import { PROJECT_BRIEF_FILENAME } from '@/lib/context-files';
import path from 'node:path';

/**
 * GET /api/projects/brief?project=name
 *
 * Returns scanner profile + project brief for a specific project.
 * Used by /run-meeting to show project context before starting a meeting.
 */
export async function GET(req: NextRequest) {
  const projectName = req.nextUrl.searchParams.get('project');
  if (!projectName) {
    return NextResponse.json({ error: 'project parameter required' }, { status: 400 });
  }

  const config = await getConfig();
  const projectConfig = getProjectConfigByName(config, projectName);
  if (!projectConfig) {
    return NextResponse.json({ error: `Project "${projectName}" not found` }, { status: 404 });
  }

  // Run scanner if project has a path
  let profile = null;
  if (projectConfig.projectPath) {
    try {
      profile = await scanProject(projectConfig.projectPath);
    } catch {
      // Scanner failed — proceed without profile
    }
  }

  // Load project brief if it exists
  let brief: string | null = null;
  try {
    const briefPath = path.join(projectConfig.meetingsDir, PROJECT_BRIEF_FILENAME);
    brief = await readFile(briefPath, 'utf-8');
  } catch {
    // No brief file
  }

  // Count meetings
  let meetingCount = 0;
  try {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(projectConfig.meetingsDir);
    meetingCount = files.filter(f => f.endsWith('.md') && f.match(/^\d{4}-\d{2}-\d{2}/)).length;
  } catch {
    // Directory doesn't exist yet
  }

  return NextResponse.json({
    name: projectName,
    path: projectConfig.projectPath ?? null,
    profile,
    brief,
    meetingCount,
    synthesis: profile?.synthesis ?? null,
  });
}
