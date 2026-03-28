import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { validateMeeting } from '@/lib/meeting-utils';

/**
 * GET /api/meetings/validate?file=filename.md — validate a meeting file structure.
 * Returns validation results with warnings, errors, and stats.
 */
export async function GET(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get('file');
    if (!filename) {
      return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
    }

    const projectParam = request.nextUrl.searchParams.get('project');
    const config = await getConfig();

    let meetingsDir: string;
    if (projectParam) {
      const projectConfig = getProjectConfig(config, projectParam);
      if (!projectConfig) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      meetingsDir = projectConfig.meetingsDir;
    } else {
      const active = getActiveProjectConfig(config);
      meetingsDir = active.meetingsDir;
    }

    const safeName = path.basename(filename);
    const filePath = path.join(meetingsDir, safeName);
    const content = await readFile(filePath, 'utf-8');

    const result = validateMeeting(content, safeName);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Meeting file not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }
}
