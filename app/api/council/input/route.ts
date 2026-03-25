import { NextRequest, NextResponse } from 'next/server';

// In-memory store for human messages from the viewer
// The facilitator polls this to check if the human typed something
interface HumanMessage {
  meeting: string;
  message: string;
  timestamp: string;
  consumed: boolean;
}

const messages: HumanMessage[] = [];

// Called by the MCP server to check for pending input
export async function GET(request: NextRequest) {
  const meeting = request.nextUrl.searchParams.get('meeting');

  if (!meeting) {
    return NextResponse.json({ messages: [] });
  }

  // Return unconsumed messages for this meeting
  const pending = messages.filter(m => m.meeting === meeting && !m.consumed);

  // Mark as consumed
  pending.forEach(m => { m.consumed = true; });

  return NextResponse.json({
    messages: pending.map(m => ({
      message: m.message,
      timestamp: m.timestamp,
    })),
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}

// Called by the viewer when the human types a message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meeting, message } = body;

    if (!meeting || !message) {
      return NextResponse.json({ error: 'meeting and message required' }, { status: 400 });
    }

    // Cap message length
    if (message.length > 10000 || meeting.length > 500) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 });
    }

    messages.push({
      meeting,
      message,
      timestamp: new Date().toISOString(),
      consumed: false,
    });

    // Clean old messages (keep last 50)
    if (messages.length > 50) {
      messages.splice(0, messages.length - 50);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
