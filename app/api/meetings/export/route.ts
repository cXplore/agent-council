import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';

/**
 * GET /api/meetings/export — export all meetings as a JSON bundle.
 * Useful for backup, migration, or external analysis.
 * Accepts optional ?project= param.
 */
export async function GET(request: NextRequest) {
  try {
    const config = await getConfig();
    const projectParam = request.nextUrl.searchParams.get('project');

    let meetingsDir: string;
    let projectName: string;

    if (projectParam) {
      const projectConfig = getProjectConfig(config, projectParam);
      if (!projectConfig) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      meetingsDir = projectConfig.meetingsDir;
      projectName = projectParam;
    } else {
      const active = getActiveProjectConfig(config);
      meetingsDir = active.meetingsDir;
      projectName = active.name;
    }

    let files: string[];
    try {
      const entries = await readdir(meetingsDir);
      files = entries.filter(f => f.endsWith('.md'));
    } catch {
      return NextResponse.json({ error: 'Meetings directory not found' }, { status: 404 });
    }

    const meetings = await Promise.all(
      files.map(async (filename) => {
        try {
          const filePath = path.join(meetingsDir, filename);
          const content = await readFile(filePath, 'utf-8');
          const fileStat = await stat(filePath);

          // Extract basic metadata
          const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
          const typeMatch = content.match(/<!--\s*(?:meeting-)?type:\s*(.+?)\s*-->/);
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const participantsMatch = content.match(/<!--\s*participants:\s*(.+?)\s*-->/);
          const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);

          return {
            filename,
            title: titleMatch?.[1]?.trim() ?? filename.replace(/\.md$/, ''),
            type: typeMatch?.[1] ?? 'unknown',
            status: statusMatch?.[1] ?? 'unknown',
            date: dateMatch?.[1] ?? null,
            participants: participantsMatch?.[1]?.split(',').map(p => p.trim()).filter(Boolean) ?? [],
            modifiedAt: fileStat.mtime.toISOString(),
            content,
          };
        } catch {
          return null;
        }
      })
    );

    const validMeetings = meetings.filter(m => m !== null);

    const exportData = {
      exportedAt: new Date().toISOString(),
      project: projectName,
      meetingCount: validMeetings.length,
      meetings: validMeetings,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${projectName}-meetings-export.json"`,
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
