import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat, appendFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, resolveDir } from '@/lib/config';
import type { MeetingListItem, MeetingDetail } from '@/lib/types';

function parseMetadata(content: string) {
  // Try HTML comment format first: <!-- status: in-progress -->
  const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
  const typeMatchComment = content.match(/<!--\s*type:\s*(.+?)\s*-->/);
  const startedMatchComment = content.match(/<!--\s*started:\s*(.+?)\s*-->/);
  const participantsMatchComment = content.match(/<!--\s*participants:\s*(.+?)\s*-->/);

  // Fallback: bold-text format — **Type:** Strategy Session
  const typeMatchBold = content.match(/\*\*Type:\*\*\s*(.+)/i);
  const startedMatchBold = content.match(/\*\*Date:\*\*\s*(.+)/i);
  const participantsMatchBold = content.match(/\*\*Participants:\*\*\s*(.+)/i);

  // Fallback: extract title from first # heading
  const titleMatch = content.match(/^#\s+(.+)$/m);

  // Determine type: prefer comment, fallback to bold, fallback to title
  let type = typeMatchComment?.[1] ?? typeMatchBold?.[1]?.trim() ?? null;
  if (!type && titleMatch) {
    // Extract type from title like "Strategy Session — Homepage" or "Design Review -- Dashboard"
    const titleParts = titleMatch[1].split(/\s*[—–\-]{1,2}\s*/);
    type = titleParts[0]?.trim() ?? null;
  }

  // Determine participants
  const participantsRaw = participantsMatchComment?.[1] ?? participantsMatchBold?.[1]?.trim() ?? '';
  const participants = participantsRaw
    ? participantsRaw.split(',').map(p => p.trim()).filter(Boolean)
    : [];

  // Also try to find participants from **agent-name:** patterns if no explicit list
  if (participants.length === 0) {
    const agentMatches = content.matchAll(/\*\*([a-z][\w-]+):\*\*/g);
    const found = new Set<string>();
    for (const m of agentMatches) {
      if (m[1] !== 'Type' && m[1] !== 'Date' && m[1] !== 'Participants' && m[1] !== 'Facilitator') {
        found.add(m[1]);
      }
    }
    participants.push(...found);
  }

  return {
    status: statusMatch?.[1] ?? (content.includes('## Summary') ? 'complete' : 'in-progress'),
    type: type?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown',
    title: titleMatch?.[1]?.trim() ?? null,
    started: startedMatchComment?.[1] ?? startedMatchBold?.[1]?.trim() ?? null,
    participants,
  };
}

async function getMeetingsDir(): Promise<string> {
  const config = await getConfig();
  return resolveDir(config.meetingsDir);
}

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');
  const meetingsDir = await getMeetingsDir();

  try {
    if (filename) {
      // Single file mode
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
        title: metadata.title,
        started: metadata.started,
        participants: metadata.participants,
        modifiedAt: fileStat.mtime.toISOString(),
        date: safeName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
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

    const meetings: MeetingListItem[] = await Promise.all(
      mdFiles.map(async (f) => {
        const filePath = path.join(meetingsDir, f);
        const content = await readFile(filePath, 'utf-8');
        const fileStat = await stat(filePath);
        const metadata = parseMetadata(content);
        const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);

        return {
          filename: f,
          date: dateMatch?.[1] ?? null,
          status: metadata.status,
          type: metadata.type,
          title: metadata.title,
          started: metadata.started,
          participants: metadata.participants,
          modifiedAt: fileStat.mtime.toISOString(),
        };
      })
    );

    // Sort by modification time, newest first
    meetings.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    return NextResponse.json(meetings, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to read meetings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const meetingsDir = await getMeetingsDir();

  try {
    const { file, message } = await request.json();

    if (!file || !message) {
      return NextResponse.json(
        { error: 'file and message are required' },
        { status: 400 }
      );
    }

    const safeName = path.basename(file);
    const filePath = path.join(meetingsDir, safeName);

    // Verify file exists and is in-progress
    const content = await readFile(filePath, 'utf-8');
    const metadata = parseMetadata(content);

    if (metadata.status !== 'in-progress') {
      return NextResponse.json(
        { error: 'Can only add messages to in-progress meetings' },
        { status: 400 }
      );
    }

    // Append the human's message
    const formatted = `\n\n**human:** ${message}\n`;
    await appendFile(filePath, formatted, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Meeting file not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to add message' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const meetingsDir = await getMeetingsDir();
  const filename = request.nextUrl.searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: 'file parameter required' }, { status: 400 });
  }

  try {
    const safeName = path.basename(filename);
    const filePath = path.join(meetingsDir, safeName);

    // Verify file exists and is complete (don't delete in-progress)
    const content = await readFile(filePath, 'utf-8');
    const metadata = parseMetadata(content);

    if (metadata.status === 'in-progress') {
      return NextResponse.json(
        { error: 'Cannot delete in-progress meetings' },
        { status: 400 }
      );
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
