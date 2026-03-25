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

    events.push({ event, meeting, detail, timestamp: timestamp || new Date().toISOString() });

    // Keep only recent events
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }

    return NextResponse.json({ ok: true });
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

  return NextResponse.json({ events: filtered.slice(-20) });
}
