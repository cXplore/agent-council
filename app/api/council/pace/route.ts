import { NextRequest, NextResponse } from 'next/server';

/**
 * Meeting pacing control — lets the viewer tell the facilitator
 * to wait before proceeding to the next round.
 *
 * Modes:
 * - "auto" — facilitator proceeds without waiting (default)
 * - "guided" — facilitator waits for explicit "proceed" signal between rounds
 *
 * The facilitator polls GET /api/council/pace?meeting=filename to check
 * whether it should proceed. The viewer POSTs to set the pace mode or
 * signal "proceed."
 */

interface PaceState {
  mode: 'auto' | 'guided';
  proceed: boolean; // true = facilitator can continue, false = wait
  meeting: string;
  timestamp: string;
}

const paceStates = new Map<string, PaceState>();

// GET — facilitator checks if it should proceed
export async function GET(request: NextRequest) {
  const meeting = request.nextUrl.searchParams.get('meeting');

  if (!meeting) {
    return NextResponse.json({ mode: 'auto', proceed: true });
  }

  const state = paceStates.get(meeting);
  if (!state) {
    return NextResponse.json({ mode: 'auto', proceed: true });
  }

  // In guided mode, consume the proceed signal (one-shot)
  if (state.mode === 'guided' && state.proceed) {
    state.proceed = false;
    paceStates.set(meeting, state);
  }

  return NextResponse.json({
    mode: state.mode,
    proceed: state.mode === 'auto' ? true : state.proceed,
  }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}

// POST — viewer sets pace mode or signals proceed
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meeting, action } = body;

    if (!meeting || !action) {
      return NextResponse.json({ error: 'meeting and action required' }, { status: 400 });
    }

    if (action === 'set-auto') {
      paceStates.set(meeting, { mode: 'auto', proceed: true, meeting, timestamp: new Date().toISOString() });
      return NextResponse.json({ success: true, mode: 'auto' });
    }

    if (action === 'set-guided') {
      paceStates.set(meeting, { mode: 'guided', proceed: false, meeting, timestamp: new Date().toISOString() });
      return NextResponse.json({ success: true, mode: 'guided' });
    }

    if (action === 'proceed') {
      const state = paceStates.get(meeting);
      if (state) {
        state.proceed = true;
        state.timestamp = new Date().toISOString();
        paceStates.set(meeting, state);
      }
      return NextResponse.json({ success: true, proceed: true });
    }

    return NextResponse.json({ error: 'action must be set-auto, set-guided, or proceed' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
