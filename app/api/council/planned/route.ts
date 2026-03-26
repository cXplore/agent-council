import { NextRequest, NextResponse } from 'next/server';

// Planned meetings — queued from the viewer or auto-extracted from meeting summaries
// Claude picks these up via MCP and runs them
interface PlannedMeeting {
  id: string;
  type: string;           // standup, design-review, strategy, etc.
  topic: string;          // what the meeting is about
  trigger?: string;       // when to run it (e.g., "after prototype is ready", "next session")
  source?: string;        // where this came from (e.g., "recommended by 2026-03-26-sprint-checkin.md")
  participants?: string[]; // suggested participants (optional)
  timestamp: string;
  status: 'planned' | 'running' | 'done' | 'dismissed';
}

const planned: PlannedMeeting[] = [];

// Called by Claude (via MCP) to get planned meetings
export async function GET() {
  const active = planned.filter(m => m.status === 'planned');

  return NextResponse.json({
    meetings: active.map(m => ({
      id: m.id,
      type: m.type,
      topic: m.topic,
      trigger: m.trigger,
      source: m.source,
      participants: m.participants,
      timestamp: m.timestamp,
    })),
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}

// Called by the viewer to queue a meeting, or by the API to auto-add from summaries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, topic, trigger, source, participants } = body;

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    if ((topic?.length ?? 0) > 500 || (trigger?.length ?? 0) > 500) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 });
    }

    const meeting: PlannedMeeting = {
      id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: type || 'strategy',
      topic,
      trigger,
      source,
      participants: Array.isArray(participants) ? participants : undefined,
      timestamp: new Date().toISOString(),
      status: 'planned',
    };

    planned.push(meeting);

    // Keep last 30
    if (planned.length > 30) {
      planned.splice(0, planned.length - 30);
    }

    return NextResponse.json({ success: true, id: meeting.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// Update status (mark as running, done, or dismissed)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    }

    const validStatuses = ['planned', 'running', 'done', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const meeting = planned.find(m => m.id === id);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    meeting.status = status;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
