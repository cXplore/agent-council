import { NextRequest, NextResponse } from 'next/server';

// Suggestions from the Agent Council viewer for Claude to act on
// The viewer queues suggestions; Claude picks them up via MCP
interface Suggestion {
  id: string;
  type: 'move_team' | 'set_role' | 'set_model' | 'update_description' | 'create_agent' | 'custom';
  agent?: string;       // agent name (for agent-specific suggestions)
  field?: string;       // which field to change
  value?: string;       // new value
  message?: string;     // human-readable description of the suggestion
  timestamp: string;
  consumed: boolean;
}

const suggestions: Suggestion[] = [];

// Called by Claude (via MCP) to check for pending suggestions
export async function GET(request: NextRequest) {
  const consumed = request.nextUrl.searchParams.get('include_consumed') === 'true';

  const pending = consumed
    ? suggestions.slice(-20)
    : suggestions.filter(s => !s.consumed);

  // Mark as consumed
  pending.forEach(s => { s.consumed = true; });

  return NextResponse.json({
    suggestions: pending.map(s => ({
      id: s.id,
      type: s.type,
      agent: s.agent,
      field: s.field,
      value: s.value,
      message: s.message,
      timestamp: s.timestamp,
    })),
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}

// Called by the viewer when the user makes a suggestion
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, agent, field, value, message } = body;

    if (!type || !message) {
      return NextResponse.json({ error: 'type and message are required' }, { status: 400 });
    }

    const validTypes = ['move_team', 'set_role', 'set_model', 'update_description', 'create_agent', 'custom'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid suggestion type' }, { status: 400 });
    }

    // Cap field lengths
    if ((message?.length ?? 0) > 2000 || (agent?.length ?? 0) > 200 || (value?.length ?? 0) > 500) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 });
    }

    suggestions.push({
      id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      agent,
      field,
      value,
      message,
      timestamp: new Date().toISOString(),
      consumed: false,
    });

    // Keep last 50
    if (suggestions.length > 50) {
      suggestions.splice(0, suggestions.length - 50);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// Delete a suggestion (dismiss without acting)
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const idx = suggestions.findIndex(s => s.id === id);
  if (idx !== -1) {
    suggestions.splice(idx, 1);
  }
  return NextResponse.json({ success: true });
}
