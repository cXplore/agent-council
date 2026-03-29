import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { buildTagIndex } from '@/lib/tag-index';
import { checkStaleness, getDoneItems } from '@/lib/staleness';

// Planned meetings — persisted to .council-planned.json in the app directory
interface PlannedMeeting {
  id: string;
  type: string;
  topic: string;
  trigger?: string;
  source?: string;
  participants?: string[];
  timestamp: string;
  status: 'planned' | 'running' | 'done' | 'dismissed';
}

const PLANNED_FILE = path.join(process.cwd(), '.council-planned.json');

// Simple async mutex to prevent concurrent read-modify-write races
let writeLock: Promise<void> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeLock.then(fn, fn);
  writeLock = result.then(() => {}, () => {});
  return result;
}

async function loadPlanned(): Promise<PlannedMeeting[]> {
  try {
    const data = await readFile(PLANNED_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function savePlanned(meetings: PlannedMeeting[]): Promise<void> {
  await writeFile(PLANNED_FILE, JSON.stringify(meetings, null, 2), 'utf-8');
}

// Load roadmap status store for staleness detection
async function loadStatusStore(meetingsDir: string): Promise<Record<string, { status: string }>> {
  try {
    const content = await readFile(path.join(meetingsDir, '.council-action-status.json'), 'utf-8');
    const parsed = JSON.parse(content);
    return parsed?.statuses ?? {};
  } catch {
    return {};
  }
}

// Called by Claude (via MCP) and the viewer to get planned meetings
export async function GET(request: NextRequest) {
  const planned = await loadPlanned();
  const active = planned.filter(m => m.status === 'planned');
  const enrich = request.nextUrl.searchParams.get('enrich');

  const meetings = active.map(m => ({
    id: m.id,
    type: m.type,
    topic: m.topic,
    trigger: m.trigger,
    source: m.source,
    participants: m.participants,
    timestamp: m.timestamp,
  }));

  // Optionally enrich with staleness detection
  if (enrich === 'staleness' && meetings.length > 0) {
    try {
      const config = await getConfig();
      const activeProject = getActiveProjectConfig(config);
      const [index, statuses] = await Promise.all([
        buildTagIndex(activeProject.meetingsDir),
        loadStatusStore(activeProject.meetingsDir),
      ]);
      const doneItems = getDoneItems(index, statuses);
      const enriched = checkStaleness(meetings, doneItems);
      return NextResponse.json({ meetings: enriched }, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    } catch {
      // Staleness enrichment failed — return unenriched data
    }
  }

  return NextResponse.json({ meetings }, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
  });
}

// Called by the viewer to queue a meeting
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

    const id = await withLock(async () => {
      const planned = await loadPlanned();

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

      await savePlanned(planned);
      return meeting.id;
    });

    return NextResponse.json({ success: true, id });
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

    const found = await withLock(async () => {
      const planned = await loadPlanned();
      const meeting = planned.find(m => m.id === id);
      if (!meeting) return false;
      meeting.status = status;
      await savePlanned(planned);
      return true;
    });

    if (!found) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
