import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat, appendFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import type { MeetingListItem, MeetingDetail } from '@/lib/types';

function parseMetadata(content: string) {
  const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
  const typeMatchComment = content.match(/<!--\s*(?:meeting-)?type:\s*(.+?)\s*-->/);
  const startedMatchComment = content.match(/<!--\s*(?:created|started):\s*(.+?)\s*-->/);
  const participantsMatchComment = content.match(/<!--\s*participants:\s*(.+?)\s*-->/);

  const typeMatchBold = content.match(/\*\*Type:\*\*\s*(.+)/i);
  const startedMatchBold = content.match(/\*\*Date:\*\*\s*(.+)/i);
  const participantsMatchBold = content.match(/\*\*Participants:\*\*\s*(.+)/i);

  const titleMatch = content.match(/^#\s+(.+)$/m);

  let type = typeMatchComment?.[1] ?? typeMatchBold?.[1]?.trim() ?? null;
  if (!type && titleMatch) {
    const titleParts = titleMatch[1].split(/\s*[—–\-]{1,2}\s*/);
    type = titleParts[0]?.trim() ?? null;
  }

  const participantsRaw = participantsMatchComment?.[1] ?? participantsMatchBold?.[1]?.trim() ?? '';
  const participants = participantsRaw
    ? participantsRaw.split(',').map(p => p.trim()).filter(Boolean)
    : [];

  if (participants.length === 0) {
    const agentMatches = content.matchAll(/\*\*([a-z][\w-]+):\*\*/g);
    const found = new Set<string>();
    for (const m of agentMatches) {
      const lower = m[1].toLowerCase();
      if (lower !== 'type' && lower !== 'date' && lower !== 'participants' && lower !== 'facilitator') {
        found.add(m[1]);
      }
    }
    participants.push(...found);
  }

  // Parse recommended next meetings from summary
  const recommendedMeetings: string[] = [];
  const recMatch = content.match(/###?\s*Recommended(?:\s+Next)?\s*(?:Meetings?|Follow-?ups?)\s*\n([\s\S]*?)(?:\n##|\n---|\n\n\n|$)/i);
  if (recMatch) {
    const lines = recMatch[1].split('\n');
    for (const line of lines) {
      const item = line.replace(/^[-*]\s*/, '').trim();
      if (item) recommendedMeetings.push(item);
    }
  }

  return {
    status: statusMatch?.[1] ?? (/^## Summary$/m.test(content) ? 'complete' : 'in-progress'),
    type: type?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown',
    title: titleMatch?.[1]?.trim() ?? null,
    started: startedMatchComment?.[1] ?? startedMatchBold?.[1]?.trim() ?? null,
    participants,
    recommendedMeetings,
  };
}

/** Extract a readable title from a meeting filename as last resort */
function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-?/, '') // strip date prefix
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Untitled Meeting';
}

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
          const agentMatch = content.match(/\*\*[\w-]+:\*\*\s*(.+)/);
          const preview = agentMatch
            ? agentMatch[1].slice(0, 120).replace(/\s+/g, ' ').trim()
            : undefined;

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
          };
        } catch {
          return null; // Skip unreadable files
        }
      })
    );
    const meetings = results.filter((m): m is MeetingListItem => m !== null);

    meetings.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

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

    const sanitizedMessage = message.replace(/\*\*[\w-]+:\*\*/g, (match) => match.replace(/\*/g, '\\*'));
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

  if (!filename) {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
  }

  try {
    const safeName = path.basename(filename);
    const filePath = path.join(meetingsDir, safeName);

    const content = await readFile(filePath, 'utf-8');
    const metadata = parseMetadata(content);

    if (metadata.status === 'in-progress') {
      return NextResponse.json({ error: 'Cannot delete in-progress meetings' }, { status: 400 });
    }

    await unlink(filePath);
    return NextResponse.json({ success: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
