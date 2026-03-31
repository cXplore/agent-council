import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { buildTagIndex } from '@/lib/tag-index';
import type { TagEntry } from '@/lib/tag-index';
import { hashItem, stableActionKey } from '@/lib/utils';

// --- Status store types ---

type ItemStatus = 'active' | 'done' | 'stale' | 'working' | 'duplicate';

interface StatusEntry {
  status: ItemStatus;
  note?: string;
  commitHash?: string;
  filesChanged?: string[];
  completedAt?: string;
  duplicateOf?: string; // key of the canonical item this is a duplicate of
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
  /** Stable slug-based key (preferred) */
  hash: string;
  itemStatus: ItemStatus;
  statusNote?: string;
  statusUpdatedAt?: string;
  commitHash?: string;
  filesChanged?: string[];
  completedAt?: string;
  /** Key of the canonical item this is a duplicate of (read-path tombstone) */
  duplicateOf?: string;
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

// --- Implementation Log append ---

async function appendImplementationLog(
  meetingsDir: string,
  actionKey: string,
  evidence: { note?: string; commitHash?: string; filesChanged?: string[] },
): Promise<void> {
  // Extract meeting date from the action key (format: slug--YYYY-MM-DD)
  const dateMatch = actionKey.match(/--(\d{4}-\d{2}-\d{2})$/);
  if (!dateMatch) return;

  const meetingDate = dateMatch[1];

  // Find the source meeting file by date prefix
  try {
    const files = await readdir(meetingsDir);
    const meetingFile = files.find(f => f.startsWith(meetingDate) && f.endsWith('.md'));
    if (!meetingFile) return;

    const filePath = path.join(meetingsDir, meetingFile);
    const content = await readFile(filePath, 'utf-8');

    // Build log entry
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const parts = [`- **${timestamp}** — `];
    if (evidence.note) parts.push(evidence.note);
    if (evidence.commitHash) parts.push(` (commit: \`${evidence.commitHash.slice(0, 7)}\`)`);
    if (evidence.filesChanged?.length) {
      parts.push(`\n  Files: ${evidence.filesChanged.map(f => `\`${f}\``).join(', ')}`);
    }
    const entry = parts.join('');

    // Dedup: skip if the same note+commit was already logged (within same minute)
    const dedupKey = evidence.note?.slice(0, 40) ?? '';
    if (content.includes('## Implementation Log') && content.includes(dedupKey) && dedupKey.length > 10) {
      return;
    }

    // Append or create Implementation Log section
    if (content.includes('## Implementation Log')) {
      await writeFile(filePath, content.trimEnd() + '\n' + entry + '\n', 'utf-8');
    } else {
      await writeFile(filePath, content.trimEnd() + '\n\n## Implementation Log\n\n' + entry + '\n', 'utf-8');
    }
  } catch {
    // Best-effort — don't fail the status update if log append fails
  }
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

    // Build resolved/closed slug set for filtering open questions
    const resolvedSlugs = new Set([
      ...index.resolved.map(r => r.id).filter((id): id is string => id !== null),
      ...(index.closed ?? []).map(c => c.id).filter((id): id is string => id !== null),
    ]);

    // Enrich all items with hash and status
    const allTags = [...index.decisions, ...index.open, ...index.actions, ...index.resolved, ...(index.closed ?? []), ...index.ideas];
    const items: RoadmapItem[] = allTags.map(tag => {
      const hash = stableActionKey(tag.text, tag.meeting);
      // Fall back to legacy hash for items marked before migration
      const legacyHash = hashItem(tag.text, tag.meeting);
      const stored = statusStore.statuses[hash] ?? statusStore.statuses[legacyHash];

      // Default status logic:
      // - RESOLVED items and DECISION items default to 'done'
      // - OPEN items that have been resolved by slug default to 'done'
      // - Everything else defaults to 'active'
      let defaultStatus: ItemStatus = 'active';
      if (tag.type === 'DECISION' || tag.type === 'RESOLVED' || tag.type === 'CLOSED') {
        defaultStatus = 'done';
      } else if (tag.type === 'OPEN' && tag.id && resolvedSlugs.has(tag.id)) {
        defaultStatus = 'done';
      }

      return {
        ...tag,
        hash,
        itemStatus: stored?.duplicateOf ? 'duplicate' : (stored?.status ?? defaultStatus),
        statusNote: stored?.note,
        statusUpdatedAt: stored?.updatedAt,
        commitHash: stored?.commitHash,
        filesChanged: stored?.filesChanged,
        completedAt: stored?.completedAt,
        duplicateOf: stored?.duplicateOf,
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
    const { id, status, note, commitHash, filesChanged, duplicateOf } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required (string)' }, { status: 400 });
    }

    if (!status || !['done', 'active', 'stale', 'working', 'duplicate'].includes(status)) {
      return NextResponse.json({ error: 'status must be done, active, stale, working, or duplicate' }, { status: 400 });
    }

    if (status === 'duplicate' && (!duplicateOf || typeof duplicateOf !== 'string')) {
      return NextResponse.json({ error: 'duplicateOf is required when status is duplicate' }, { status: 400 });
    }

    if (note && (typeof note !== 'string' || note.length > 2000)) {
      return NextResponse.json({ error: 'note must be a string under 2000 chars' }, { status: 400 });
    }

    if (commitHash && typeof commitHash !== 'string') {
      return NextResponse.json({ error: 'commitHash must be a string' }, { status: 400 });
    }

    if (filesChanged && (!Array.isArray(filesChanged) || filesChanged.some((f: unknown) => typeof f !== 'string'))) {
      return NextResponse.json({ error: 'filesChanged must be an array of strings' }, { status: 400 });
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
      const now = new Date().toISOString();
      store.statuses[id] = {
        status: status === 'duplicate' ? 'done' : status, // duplicates are stored as 'done' with duplicateOf marker
        ...(note ? { note } : {}),
        ...(commitHash ? { commitHash } : {}),
        ...(filesChanged?.length ? { filesChanged } : {}),
        ...(status === 'done' ? { completedAt: now } : {}),
        ...(status === 'duplicate' ? { duplicateOf, completedAt: now } : {}),
        updatedAt: now,
      };
    }

    await saveStatusStore(meetingsDir, store);

    // If marking done and we can find the source meeting, append to Implementation Log
    if (status === 'done') {
      await appendImplementationLog(meetingsDir, id, { note, commitHash, filesChanged });
    }

    return NextResponse.json({ success: true, id, status });
  } catch (err) {
    console.error('Roadmap API POST error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
