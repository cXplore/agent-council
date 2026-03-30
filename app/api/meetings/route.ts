import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat, appendFile, unlink, writeFile, mkdir } from 'node:fs/promises';
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

    const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('.'));

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

export async function PUT(request: NextRequest) {
  const { dir: meetingsDir } = await getMeetingsDir(request);

  try {
    const body = await request.json();
    const { title, type, participants, context, carryForward } = body;

    if (!title || !type) {
      return NextResponse.json({ error: 'title and type are required' }, { status: 400 });
    }

    const validTypes = ['standup', 'design-review', 'strategy', 'architecture', 'sprint-planning', 'retrospective', 'incident-review', 'quick-consult', 'direction-check'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const participantList: string[] = participants || [];
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(0, 16).replace('T', ' ');

    // Generate filename: YYYY-MM-DD-type-topic-slug.md
    const topicSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60)
      .replace(/-$/, '');
    const filename = `${dateStr}-${type}-${topicSlug}.md`;
    const filePath = path.join(meetingsDir, filename);

    // Check if file already exists
    try {
      await stat(filePath);
      return NextResponse.json({ error: `Meeting file already exists: ${filename}` }, { status: 409 });
    } catch {
      // File doesn't exist — good
    }

    // Build meeting file content
    const lines: string[] = [];
    lines.push(`<!-- meeting-type: ${type} -->`);
    lines.push(`<!-- status: in-progress -->`);
    lines.push(`<!-- created: ${timeStr} -->`);
    if (participantList.length > 0) {
      lines.push(`<!-- participants: ${participantList.join(', ')} -->`);
    }
    lines.push(`<!-- topic: ${title} -->`);
    lines.push('');
    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`**Date:** ${dateStr}`);
    lines.push(`**Type:** ${type}`);
    lines.push(`**Status:** in-progress`);
    if (participantList.length > 0) {
      lines.push(`**Participants:** ${participantList.join(', ')}`);
    }
    lines.push('');
    lines.push('## Context');
    lines.push('');
    if (context) {
      lines.push(context);
    } else {
      lines.push(`Meeting topic: ${title}`);
    }

    if (carryForward && typeof carryForward === 'string' && carryForward.trim()) {
      lines.push('');
      lines.push('### Carry-forward from previous meetings');
      lines.push('');
      lines.push(carryForward.trim());
    }

    lines.push('');
    lines.push('---');
    lines.push('');

    // Ensure meetings directory exists
    await mkdir(meetingsDir, { recursive: true });
    await writeFile(filePath, lines.join('\n'), 'utf-8');

    return NextResponse.json({
      filename,
      title,
      type,
      status: 'in-progress',
      participants: participantList,
      date: dateStr,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: `Failed to create meeting: ${(err as Error).message}` }, { status: 500 });
  }
}

/** Format structured outcomes into the meeting-outcomes HTML comment block */
function formatOutcomesAppendix(outcomes: {
  decisions?: Array<{ text: string; rationale?: string }>;
  actions?: Array<{ text: string; assignee?: string }>;
  openQuestions?: Array<{ text: string; slug?: string }>;
}): string {
  const json: Record<string, unknown[]> = {};
  if (outcomes.decisions?.length) json.decisions = outcomes.decisions;
  if (outcomes.actions?.length) json.actions = outcomes.actions;
  if (outcomes.openQuestions?.length) json.openQuestions = outcomes.openQuestions;
  if (Object.keys(json).length === 0) return '';
  return `\n\n<!-- meeting-outcomes\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\nmeeting-outcomes -->`;
}

export async function PATCH(request: NextRequest) {
  const { dir: meetingsDir } = await getMeetingsDir(request);

  try {
    const { file, status, content: appendContent, outcomes } = await request.json();

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const safeName = path.basename(file);
    const filePath = path.join(meetingsDir, safeName);
    let fileContent = await readFile(filePath, 'utf-8');

    // Append content if provided (e.g., summary section, agent responses)
    if (appendContent && typeof appendContent === 'string') {
      fileContent += appendContent;
    }

    // Append structured outcomes as JSON appendix (avoids JSON-in-JSON escaping)
    if (outcomes && typeof outcomes === 'object') {
      const appendix = formatOutcomesAppendix(outcomes);
      if (appendix) fileContent += appendix;
    }

    // Update status if provided
    if (status && typeof status === 'string') {
      const validStatuses = ['in-progress', 'complete'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
      }
      fileContent = fileContent.replace(
        /<!--\s*status:\s*[\w-]+\s*-->/,
        `<!-- status: ${status} -->`
      );
      // Also update the frontmatter-style status if present
      fileContent = fileContent.replace(
        /^\*\*Status:\*\*\s*.+$/m,
        `**Status:** ${status}`
      );
    }

    await writeFile(filePath, fileContent, 'utf-8');

    return NextResponse.json({
      filename: safeName,
      status: status || 'unchanged',
      appended: !!appendContent,
      outcomesAppended: !!(outcomes && typeof outcomes === 'object'),
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Meeting file not found' }, { status: 404 });
    }
    return NextResponse.json({ error: `Failed to update meeting: ${(err as Error).message}` }, { status: 500 });
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
