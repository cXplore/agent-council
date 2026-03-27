import { NextRequest, NextResponse } from 'next/server';

// In-memory event store — viewers poll this
interface MeetingEvent {
  event: string;
  meeting: string;
  detail?: string;
  timestamp: string;
}

// Simple in-memory store (resets on server restart, which is fine)
const events: MeetingEvent[] = [];
const MAX_EVENTS = 100;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, meeting, detail, timestamp } = body;

    if (!event || !meeting) {
      return NextResponse.json({ error: 'event and meeting are required' }, { status: 400 });
    }

    // Validate event type and field lengths
    const validEvents = ['meeting_starting', 'round_starting', 'round_complete', 'meeting_complete', 'agent_speaking'];
    if (!validEvents.includes(event)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }
    if (meeting.length > 500 || (detail && detail.length > 2000)) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 });
    }

    events.push({ event, meeting, detail, timestamp: timestamp || new Date().toISOString() });

    // Keep only recent events
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }

    // Auto-mark planned meetings on meeting lifecycle events
    if (event === 'meeting_starting' || event === 'meeting_complete') {
      try {
        const plannedRes = await fetch(`http://localhost:${process.env.PORT || 3003}/api/council/planned`);
        if (plannedRes.ok) {
          const data = await plannedRes.json();
          const planned = data.meetings || [];
          const targetStatus = event === 'meeting_starting' ? 'running' : 'done';
          const matchStatus = event === 'meeting_starting' ? 'planned' : 'running';
          for (const p of planned) {
            if (p.status === matchStatus) {
              await fetch(`http://localhost:${process.env.PORT || 3003}/api/council/planned`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: p.id, status: targetStatus }),
              });
              break;
            }
          }
        }
      } catch {
        // Non-critical — don't fail the event
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const meeting = request.nextUrl.searchParams.get('meeting');
  const since = request.nextUrl.searchParams.get('since');

  let filtered = events;

  if (meeting) {
    filtered = filtered.filter(e => e.meeting === meeting);
  }

  if (since) {
    filtered = filtered.filter(e => e.timestamp > since);
  }

  return NextResponse.json({ events: filtered.slice(-20) }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}
