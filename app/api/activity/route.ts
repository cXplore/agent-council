import { NextResponse } from 'next/server';
import { readActivityLog, writeActivityEntry } from '@/lib/activity-log';
import type { ActivityEntry } from '@/lib/types';

/** GET /api/activity — Read activity log entries (newest first) */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const source = url.searchParams.get('source') as ActivityEntry['source'] | null;

  try {
    let entries = await readActivityLog(limit ? parseInt(limit, 10) : undefined);
    if (source) {
      entries = entries.filter(e => e.source === source);
    }
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST /api/activity — Append an activity log entry */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { source, type, summary, detail, linkedMeeting, linkedCommit } = body;

    if (!source || !type || !summary) {
      return NextResponse.json(
        { error: 'source, type, and summary are required' },
        { status: 400 }
      );
    }

    const validSources = ['worker', 'interactive', 'meeting'];
    const validTypes = ['code_change', 'meeting_complete', 'action_resolved', 'flag', 'worker_run'];

    if (!validSources.includes(source)) {
      return NextResponse.json({ error: `source must be one of: ${validSources.join(', ')}` }, { status: 400 });
    }
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const id = await writeActivityEntry({
      source,
      type,
      summary,
      detail: detail ?? undefined,
      linkedMeeting: linkedMeeting ?? undefined,
      linkedCommit: linkedCommit ?? undefined,
    });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
