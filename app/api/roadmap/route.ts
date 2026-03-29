import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { buildTagIndex } from '@/lib/tag-index';
import type { TagEntry } from '@/lib/tag-index';
import { hashItem } from '@/lib/utils';

// --- Status store types ---

type ItemStatus = 'active' | 'done' | 'stale' | 'working';

interface StatusEntry {
  status: ItemStatus;
  note?: string;
  updatedAt: string;
}

interface StatusStore {
  statuses: Record<string, StatusEntry>;
}

// --- Status file helpers ---

function getStatusFilePath(meetingsDir: string): string {
  return path.join(meetingsDir, '.council-action-status.json');
}

async function loadStatusStore(meetingsDir: string): Promise<StatusStore> {
  const filePath = getStatusFilePath(meetingsDir);
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.statuses === 'object') {
      return parsed as StatusStore;
    }
  } catch {
    // File doesn't exist or invalid — return empty store
  }
  return { statuses: {} };
}

async function saveStatusStore(meetingsDir: string, store: StatusStore): Promise<void> {
  const filePath = getStatusFilePath(meetingsDir);
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

// --- Enriched item type ---

export interface RoadmapItem extends TagEntry {
  hash: string;
  itemStatus: ItemStatus;
  statusNote?: string;
  statusUpdatedAt?: string;
}

interface RoadmapResponse {
  items: RoadmapItem[];
  total: number;
  meetingCount: number;
  counts: {
    active: number;
    done: number;
    stale: number;
    decisions: number;
    openQuestions: number;
  };
}

// --- GET: return all items with their status ---

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectParam = searchParams.get('project');

    // Resolve meetings directory
    const config = await getConfig();
    let meetingsDir: string;

    if (projectParam) {
      const projectConfig = getProjectConfig(config, projectParam);
      if (!projectConfig) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      meetingsDir = projectConfig.meetingsDir;
    } else {
      const active = getActiveProjectConfig(config);
      meetingsDir = active.meetingsDir;
    }

    // Build tag index and load status store
    const [index, statusStore] = await Promise.all([
      buildTagIndex(meetingsDir),
      loadStatusStore(meetingsDir),
    ]);

    // Build resolved slug set for filtering open questions
    const resolvedSlugs = new Set(
      index.resolved.map(r => r.id).filter((id): id is string => id !== null)
    );

    // Enrich all items with hash and status
    const allTags = [...index.decisions, ...index.open, ...index.actions, ...index.resolved];
    const items: RoadmapItem[] = allTags.map(tag => {
      const hash = hashItem(tag.text, tag.meeting);
      const stored = statusStore.statuses[hash];

      // Default status logic:
      // - RESOLVED items and DECISION items default to 'done'
      // - OPEN items that have been resolved by slug default to 'done'
      // - Everything else defaults to 'active'
      let defaultStatus: ItemStatus = 'active';
      if (tag.type === 'DECISION' || tag.type === 'RESOLVED') {
        defaultStatus = 'done';
      } else if (tag.type === 'OPEN' && tag.id && resolvedSlugs.has(tag.id)) {
        defaultStatus = 'done';
      }

      return {
        ...tag,
        hash,
        itemStatus: stored?.status ?? defaultStatus,
        statusNote: stored?.note,
        statusUpdatedAt: stored?.updatedAt,
      };
    });

    // Count by status (only action items and open questions for progress tracking)
    const trackable = items.filter(i => i.type === 'ACTION' || i.type === 'OPEN');
    const counts = {
      active: trackable.filter(i => i.itemStatus === 'active').length,
      done: items.filter(i => i.itemStatus === 'done').length,
      stale: items.filter(i => i.itemStatus === 'stale').length,
      decisions: items.filter(i => i.type === 'DECISION').length,
      openQuestions: items.filter(i => i.type === 'OPEN' && i.itemStatus === 'active').length,
    };

    const response: RoadmapResponse = {
      items,
      total: items.length,
      meetingCount: index.meetingCount,
      counts,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.error('Roadmap API GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// --- POST: update an item's status ---

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, note } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required (string)' }, { status: 400 });
    }

    if (!status || !['done', 'active', 'stale', 'working'].includes(status)) {
      return NextResponse.json({ error: 'status must be done, active, stale, or working' }, { status: 400 });
    }

    if (note && (typeof note !== 'string' || note.length > 2000)) {
      return NextResponse.json({ error: 'note must be a string under 2000 chars' }, { status: 400 });
    }

    // Resolve meetings directory
    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const meetingsDir = active.meetingsDir;

    // Load, update, save
    const store = await loadStatusStore(meetingsDir);

    if (status === 'active') {
      // Removing an override — delete the entry so it falls back to default
      delete store.statuses[id];
    } else {
      store.statuses[id] = {
        status,
        ...(note ? { note } : {}),
        updatedAt: new Date().toISOString(),
      };
    }

    await saveStatusStore(meetingsDir, store);

    return NextResponse.json({ success: true, id, status });
  } catch (err) {
    console.error('Roadmap API POST error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
