import { NextRequest, NextResponse } from 'next/server';

// In-memory store for context pushed by Claude via MCP
// The viewer polls this to show research/findings inline
interface ContextEntry {
  id: string;
  meeting: string;       // meeting filename this relates to
  context: string;       // the text content
  source?: string;       // where it came from (git log, code analysis, etc)
  timestamp: string;
  consumed: boolean;
}

const entries: ContextEntry[] = [];
const MAX_ENTRIES = 50;

// Called by the viewer to get context for a meeting
export async function GET(request: NextRequest) {
  const meeting = request.nextUrl.searchParams.get('meeting');

  if (!meeting) {
    return NextResponse.json({ entries: [] });
  }

  // Return unconsumed entries for this meeting
  const pending = entries.filter(e => e.meeting === meeting && !e.consumed);

  // Mark as consumed
  pending.forEach(e => { e.consumed = true; });

  return NextResponse.json({
    entries: pending.map(e => ({
      id: e.id,
      context: e.context,
      source: e.source,
      timestamp: e.timestamp,
    })),
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}

// Called by Claude (via MCP) to push context
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meeting, context, source } = body;

    if (!meeting || !context) {
      return NextResponse.json({ error: 'meeting and context are required' }, { status: 400 });
    }

    // Cap field lengths
    if (meeting.length > 500 || context.length > 10000 || (source && source.length > 500)) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 });
    }

    entries.push({
      id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      meeting,
      context,
      source,
      timestamp: new Date().toISOString(),
      consumed: false,
    });

    // Keep only recent entries
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
