import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat, appendFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import type { MeetingListItem, MeetingDetail } from '@/lib/types';
import { parseMetadata, titleFromFilename } from '@/lib/meeting-utils';

/** Resolve meetings dir — uses ?project= param or active project */
async function getMeetingsDir(request: NextRequest): Promise<{ dir: string; project: string }> {
  const config = await getConfig();
  const projectParam = request.nextUrl.searchParams.get('project');

  if (projectParam) {
    const projectConfig = getProjectConfig(config, projectParam);
    if (projectConfig) {
      return { dir: projectConfig.meetingsDir, project: projectParam };
    }
  }

  const active = getActiveProjectConfig(config);
  return { dir: active.meetingsDir, project: active.name };
}

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');
  const { dir: meetingsDir, project } = await getMeetingsDir(request);

  try {
    if (filename) {
      const safeName = path.basename(filename);
      const filePath = path.join(meetingsDir, safeName);
      const content = await readFile(filePath, 'utf-8');
      const fileStat = await stat(filePath);
      const metadata = parseMetadata(content);

      const detail: MeetingDetail = {
        filename: safeName,
        content,
        status: metadata.status,
        type: metadata.type,
        title: metadata.title || titleFromFilename(safeName),
        started: metadata.started,
        participants: metadata.participants,
        modifiedAt: fileStat.mtime.toISOString(),
        date: safeName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
        project,
        recommendedMeetings: metadata.recommendedMeetings,
      };

      return NextResponse.json(detail, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // List mode
    let files: string[];
    try {
      files = await readdir(meetingsDir);
    } catch {
      return NextResponse.json([]);
    }

    const mdFiles = files.filter(f => f.endsWith('.md'));

    const results = await Promise.all(
      mdFiles.map(async (f): Promise<MeetingListItem | null> => {
        try {
          const filePath = path.join(meetingsDir, f);
          const content = await readFile(filePath, 'utf-8');
          const fileStat = await stat(filePath);
          const metadata = parseMetadata(content);
          const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);

          // Extract preview: first agent response snippet
          // Skip metadata fields (Type, Date, Participants, Facilitator) and h3-style agent headings
          const SKIP_FIELDS = /^(type|date|participants|facilitator|status|context|topic)$/i;
          let preview: string | undefined;
          for (const m of content.matchAll(/\*\*([\w-]+):\*\*\s*(.+)/g)) {
            if (SKIP_FIELDS.test(m[1])) continue;
            const text = m[2].slice(0, 120).replace(/\s+/g, ' ').trim();
            if (text.length > 10) { preview = text; break; }
          }

          // Word count (rough — strip metadata comments and count)
          const cleanText = content.replace(/<!--[\s\S]*?-->/g, '').replace(/^---$/gm, '');
          const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;

          return {
            filename: f,
            date: dateMatch?.[1] ?? null,
            status: metadata.status,
            type: metadata.type,
            title: metadata.title || titleFromFilename(f),
            started: metadata.started,
            participants: metadata.participants,
            modifiedAt: fileStat.mtime.toISOString(),
            project,
            preview: preview ? (preview.length >= 120 ? preview + '...' : preview) : undefined,
            recommendedMeetings: metadata.recommendedMeetings?.length ? metadata.recommendedMeetings : undefined,
            wordCount,
          };
        } catch {
          return null; // Skip unreadable files
        }
      })
    );
    const meetings = results.filter((m): m is MeetingListItem => m !== null);

    meetings.sort((a, b) => {
      // Live meetings always first
      const aLive = a.status === 'in-progress' ? 0 : 1;
      const bLive = b.status === 'in-progress' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
    });

    return NextResponse.json(meetings, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to read meetings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { dir: meetingsDir } = await getMeetingsDir(request);

  try {
    const { file, message } = await request.json();

    if (!file || !message || typeof message !== 'string') {
      return NextResponse.json({ error: 'file and message are required' }, { status: 400 });
    }

    const MAX_MESSAGE_LENGTH = 10000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
        { status: 400 }
      );
    }

    const safeName = path.basename(file);
    const filePath = path.join(meetingsDir, safeName);

    const content = await readFile(filePath, 'utf-8');
    const metadata = parseMetadata(content);

    if (metadata.status !== 'in-progress') {
      return NextResponse.json(
        { error: 'Can only add messages to in-progress meetings' },
        { status: 400 }
      );
    }

    // Sanitize: prevent fake agent names and HTML comment injection (could alter meeting metadata)
    let sanitizedMessage = message.replace(/\*\*[\w-]+:\*\*/g, (match: string) => match.replace(/\*/g, '\\*'));
    sanitizedMessage = sanitizedMessage.replace(/<!--/g, '&lt;!--').replace(/-->/g, '--&gt;');
    const formatted = `\n\n**human:** ${sanitizedMessage}\n`;
    await appendFile(filePath, formatted, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Meeting file not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { dir: meetingsDir } = await getMeetingsDir(request);
  const filename = request.nextUrl.searchParams.get('file');
  const filesParam = request.nextUrl.searchParams.get('files');

  // Bulk delete: ?files=a.md,b.md,c.md
  if (filesParam) {
    const filenames = filesParam.split(',').map(f => f.trim()).filter(Boolean);
    if (filenames.length === 0) {
      return NextResponse.json({ error: 'files parameter must contain at least one filename' }, { status: 400 });
    }

    const deleted: string[] = [];
    const skipped: { filename: string; reason: string }[] = [];

    for (const name of filenames) {
      const safeName = path.basename(name);
      if (!safeName.endsWith('.md')) {
        skipped.push({ filename: safeName, reason: 'Not a .md file' });
        continue;
      }
      const filePath = path.join(meetingsDir, safeName);
      try {
        const content = await readFile(filePath, 'utf-8');
        const metadata = parseMetadata(content);
        if (metadata.status === 'in-progress') {
          skipped.push({ filename: safeName, reason: 'Meeting is in-progress' });
          continue;
        }
        await unlink(filePath);
        deleted.push(safeName);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          skipped.push({ filename: safeName, reason: 'File not found' });
        } else {
          skipped.push({ filename: safeName, reason: 'Failed to delete' });
        }
      }
    }

    return NextResponse.json({ success: true, deleted, skipped });
  }

  // Single delete: ?file=meeting.md
  if (!filename) {
    return NextResponse.json({ error: 'file or files parameter required' }, { status: 400 });
  }

  try {
    const safeName = path.basename(filename);
    if (!safeName.endsWith('.md')) {
      return NextResponse.json({ error: 'Only .md files can be deleted' }, { status: 400 });
    }
    const filePath = path.join(meetingsDir, safeName);

    const content = await readFile(filePath, 'utf-8');
    const metadata = parseMetadata(content);

    if (metadata.status === 'in-progress') {
      return NextResponse.json({ error: 'Cannot delete in-progress meetings' }, { status: 400 });
    }

    await unlink(filePath);
    return NextResponse.json({ success: true, deleted: [safeName], skipped: [] });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
