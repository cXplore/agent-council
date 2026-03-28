import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';

/**
 * GET /api/meetings/feed — RSS feed of recent meetings.
 * Useful for following meeting activity in feed readers.
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
        return new NextResponse('Project not found', { status: 404 });
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
      files = [];
    }

    // Parse meetings and sort by modification time
    const meetings = await Promise.all(
      files.map(async (filename) => {
        try {
          const filePath = path.join(meetingsDir, filename);
          const content = await readFile(filePath, 'utf-8');
          const fileStat = await stat(filePath);

          const titleMatch = content.match(/^#\s+(.+)$/m);
          const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
          const typeMatch = content.match(/<!--\s*(?:meeting-)?type:\s*(.+?)\s*-->/);

          // Extract first 200 chars of actual content (skip metadata)
          const cleanContent = content
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/^#.*$/m, '')
            .trim()
            .slice(0, 200);

          return {
            filename,
            title: titleMatch?.[1]?.trim() ?? filename.replace(/\.md$/, ''),
            status: statusMatch?.[1] ?? 'unknown',
            type: typeMatch?.[1] ?? 'meeting',
            modifiedAt: fileStat.mtime,
            description: cleanContent.replace(/\n/g, ' ').trim(),
          };
        } catch {
          return null;
        }
      })
    );

    const validMeetings = meetings
      .filter(m => m !== null)
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
      .slice(0, 20);

    const baseUrl = `http://localhost:${config.port || 3003}`;
    const now = new Date().toUTCString();

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Agent Council — ${projectName}</title>
    <link>${baseUrl}/meetings</link>
    <description>Meeting activity for ${projectName}</description>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>Agent Council</generator>
${validMeetings.map(m => `    <item>
      <title>${escapeXml(m.title)}</title>
      <link>${baseUrl}/meetings?file=${encodeURIComponent(m.filename)}</link>
      <description>${escapeXml(m.description)}</description>
      <pubDate>${m.modifiedAt.toUTCString()}</pubDate>
      <guid>${baseUrl}/meetings/${m.filename}</guid>
      <category>${escapeXml(m.type)}</category>
    </item>`).join('\n')}
  </channel>
</rss>`;

    return new NextResponse(rss, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'no-cache, max-age=60',
      },
    });
  } catch (err) {
    console.error('Feed error:', err);
    return new NextResponse('Feed generation failed', { status: 500 });
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
