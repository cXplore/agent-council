/**
 * Activity log — shared append-only log for worker, interactive, and meeting contexts.
 *
 * Storage: JSONL file at {meetingsDir}/activity.log
 * Schema: see ActivityEntry in types.ts
 *
 * Established by Operator vs Worker design review (2026-03-30).
 */

import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from './config';
import type { ActivityEntry } from './types';

function generateId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getLogPath(): Promise<string> {
  const config = await getConfig();
  const active = getActiveProjectConfig(config);
  return path.join(active.meetingsDir, 'activity.log');
}

/** Append a new entry to the activity log. Returns the generated ID, or existing ID if deduplicated. */
export async function writeActivityEntry(
  entry: Omit<ActivityEntry, 'id' | 'timestamp'>
): Promise<string> {
  const logPath = await getLogPath();
  const now = new Date();

  // Dedup: skip if an entry with same linkedMeeting + type exists within 2 hours
  if (entry.linkedMeeting && existsSync(logPath)) {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const raw = await readFile(logPath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const existing: ActivityEntry = JSON.parse(lines[i]);
        if (existing.timestamp < twoHoursAgo) break; // past 2h window, stop scanning
        if (existing.type === entry.type && existing.linkedMeeting === entry.linkedMeeting) {
          return existing.id; // duplicate — return existing ID
        }
      } catch { /* skip malformed */ }
    }
  }

  const full: ActivityEntry = {
    id: generateId(),
    timestamp: now.toISOString(),
    ...entry,
  };
  const line = JSON.stringify(full) + '\n';

  // Create file if it doesn't exist
  if (!existsSync(logPath)) {
    await writeFile(logPath, line, 'utf-8');
  } else {
    await appendFile(logPath, line, 'utf-8');
  }

  return full.id;
}

/** Read all activity log entries, newest first. Optional limit. */
export async function readActivityLog(limit?: number): Promise<ActivityEntry[]> {
  const logPath = await getLogPath();
  if (!existsSync(logPath)) return [];

  const raw = await readFile(logPath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const entries: ActivityEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // newest first
  entries.reverse();
  return limit ? entries.slice(0, limit) : entries;
}

/** Read entries filtered by source */
export async function readActivityBySource(
  source: ActivityEntry['source'],
  limit?: number
): Promise<ActivityEntry[]> {
  const all = await readActivityLog();
  const filtered = all.filter(e => e.source === source);
  return limit ? filtered.slice(0, limit) : filtered;
}
