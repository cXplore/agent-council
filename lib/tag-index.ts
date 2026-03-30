import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashItem } from '@/lib/utils';

export interface TagEntry {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED' | 'IDEA';
  text: string;
  id: string | null;       // optional slug from [OPEN:slug] format
  meeting: string;         // filename
  meetingTitle: string;    // extracted from # heading
  meetingStatus: string;   // from <!-- status: ... --> or inferred
  lineNumber: number;
  date: string | null;     // from filename YYYY-MM-DD
}

export interface TagIndex {
  decisions: TagEntry[];
  open: TagEntry[];
  actions: TagEntry[];
  resolved: TagEntry[];
  ideas: TagEntry[];
  meetingCount: number;
  builtAt: string;
}

interface CacheFile {
  index: TagIndex;
  mtimes: Record<string, number>;  // filename -> mtime ms
}

// --- JSON appendix parser (preferred, structured source) ---

interface MeetingOutcomesJSON {
  schema_version: number;
  decisions?: (string | { text: string; rationale?: string })[];
  actions?: (string | { text: string; assignee?: string; effort?: string })[];
  open_questions?: (string | { slug?: string; text: string })[];
  resolved?: { slug: string; resolution: string }[];
}

function extractFromJSON(content: string, filename: string): TagEntry[] | null {
  const jsonMatch = content.match(/<!--\s*meeting-outcomes\s*\n([\s\S]*?)\n(?:meeting-outcomes\s*)?-->/);
  if (!jsonMatch) return null;

  try {
    const data: MeetingOutcomesJSON = JSON.parse(jsonMatch[1]);
    if (!data.schema_version) return null;

    const entries: TagEntry[] = [];
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const meetingTitle = titleMatch?.[1]?.trim() ?? filename.replace(/\.md$/, '');
    const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
    const meetingStatus = statusMatch?.[1] ?? 'complete';
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] ?? null;

    for (const d of data.decisions ?? []) {
      const text = typeof d === 'string' ? d : d.text;
      const rationale = typeof d === 'string' ? undefined : d.rationale;
      if (!text) continue;
      entries.push({ type: 'DECISION', id: null, text: text + (rationale ? ` — ${rationale}` : ''), meeting: filename, meetingTitle, meetingStatus, lineNumber: 0, date });
    }
    for (const a of data.actions ?? []) {
      const text = typeof a === 'string' ? a : a.text;
      const assignee = typeof a === 'string' ? undefined : a.assignee;
      if (!text) continue;
      const suffix = assignee ? ` — assigned to ${assignee}` : '';
      entries.push({ type: 'ACTION', id: null, text: text + suffix, meeting: filename, meetingTitle, meetingStatus, lineNumber: 0, date });
    }
    for (const o of data.open_questions ?? []) {
      const text = typeof o === 'string' ? o : o.text;
      const slug = typeof o === 'string' ? null : (o.slug ?? null);
      if (!text) continue;
      entries.push({ type: 'OPEN', id: slug, text, meeting: filename, meetingTitle, meetingStatus, lineNumber: 0, date });
    }
    for (const r of data.resolved ?? []) {
      entries.push({ type: 'RESOLVED', id: r.slug, text: r.resolution, meeting: filename, meetingTitle, meetingStatus, lineNumber: 0, date });
    }

    return entries;
  } catch {
    return null; // JSON parse failed — fall back to regex
  }
}

// --- Regex fallback (legacy meetings without JSON appendix) ---

// Matches both formats: "DECISION: text" and "[DECISION] text" and "[OPEN:slug] text"
const TAG_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED|IDEA)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

export function extractTags(content: string, filename: string): TagEntry[] {
  // Try JSON appendix first (preferred, structured)
  const jsonEntries = extractFromJSON(content, filename);
  if (jsonEntries !== null && jsonEntries.length > 0) return jsonEntries;
  const entries: TagEntry[] = [];
  const lines = content.split('\n');

  // Extract title from first heading
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const meetingTitle = titleMatch?.[1]?.trim() ?? filename.replace(/\.md$/, '');

  // Extract status from frontmatter comment, fall back to content-based detection
  const statusMatch = content.match(/<!--\s*status:\s*(\S+)\s*-->/);
  const meetingStatus = statusMatch?.[1] ?? (/^## Summary$/m.test(content) ? 'complete' : 'in-progress');

  // Extract date from filename
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch?.[1] ?? null;

  // For complete meetings, only index tags from the ## Summary section.
  // Round tags are working notes; summary tags are the curated final record.
  // For in-progress meetings, index all tags (no summary exists yet).
  // Exception: IDEA tags are always scanned from the full document — they're casual
  // proposals written inline by agents and never restated in the summary.
  const summaryIndex = lines.findIndex(l => l.trim() === '## Summary');
  const startLine = meetingStatus === 'complete' && summaryIndex >= 0 ? summaryIndex : 0;
  const summaryStart = summaryIndex >= 0 ? summaryIndex : lines.length;

  for (let i = startLine; i < lines.length; i++) {
    const match = lines[i].match(TAG_REGEX);
    if (match) {
      const type = match[1].toUpperCase() as TagEntry['type'];
      entries.push({
        type,
        id: match[2]?.toLowerCase() ?? null,  // optional slug from [OPEN:slug]
        text: match[3].trim(),
        meeting: filename,
        meetingTitle,
        meetingStatus,
        lineNumber: i,
        date,
      });
    }
  }

  // Scan pre-summary body for IDEA tags (only for complete meetings — in-progress already scanned all)
  if (meetingStatus === 'complete' && summaryStart > 0) {
    for (let i = 0; i < summaryStart; i++) {
      const match = lines[i].match(TAG_REGEX);
      if (match && match[1].toUpperCase() === 'IDEA') {
        entries.push({
          type: 'IDEA',
          id: match[2]?.toLowerCase() ?? null,
          text: match[3].trim(),
          meeting: filename,
          meetingTitle,
          meetingStatus,
          lineNumber: i,
          date,
        });
      }
    }
  }

  return entries;
}

/**
 * Invalidate the tag cache so the next buildTagIndex call re-reads all files.
 * Call this after modifying meeting files (e.g., appending [RESOLVED:slug]).
 */
export async function invalidateTagCache(meetingsDir: string): Promise<void> {
  const cachePath = path.join(meetingsDir, '.council-tag-cache.json');
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(cachePath);
  } catch {
    // Cache file may not exist — that's fine
  }
}

export async function buildTagIndex(meetingsDir: string): Promise<TagIndex> {
  // Check cache first
  const cachePath = path.join(meetingsDir, '.council-tag-cache.json');
  let cached: CacheFile | null = null;

  try {
    const cacheContent = await readFile(cachePath, 'utf-8');
    cached = JSON.parse(cacheContent);
  } catch {
    // No cache or invalid — will rebuild
  }

  // Read directory
  let files: string[];
  try {
    const entries = await readdir(meetingsDir);
    files = entries.filter(f => f.endsWith('.md') && !f.startsWith('.'));
  } catch {
    return { decisions: [], open: [], actions: [], resolved: [], ideas: [], meetingCount: 0, builtAt: new Date().toISOString() };
  }

  // Check mtimes to determine which files need re-indexing
  const currentMtimes: Record<string, number> = {};
  const changedFiles: string[] = [];
  const unchangedFiles: string[] = [];

  for (const file of files) {
    try {
      const fileStat = await stat(path.join(meetingsDir, file));
      currentMtimes[file] = fileStat.mtimeMs;
      if (cached?.mtimes[file] && cached.mtimes[file] === fileStat.mtimeMs) {
        unchangedFiles.push(file);
      } else {
        changedFiles.push(file);
      }
    } catch {
      changedFiles.push(file); // treat unreadable as changed
    }
  }

  // Check for removed files
  const removedFiles = cached ? Object.keys(cached.mtimes).filter(f => !files.includes(f)) : [];

  // If nothing changed, return cached index
  if (cached && changedFiles.length === 0 && removedFiles.length === 0) {
    return cached.index;
  }

  // Incremental rebuild: reuse cached entries for unchanged files, re-index changed ones
  const decisions: TagEntry[] = [];
  const open: TagEntry[] = [];
  const actions: TagEntry[] = [];
  const resolved: TagEntry[] = [];
  const ideas: TagEntry[] = [];
  const mtimes: Record<string, number> = {};

  // Carry forward cached entries for unchanged files
  if (cached) {
    const unchangedSet = new Set(unchangedFiles);
    for (const entry of cached.index.decisions) if (unchangedSet.has(entry.meeting)) decisions.push(entry);
    for (const entry of cached.index.open) if (unchangedSet.has(entry.meeting)) open.push(entry);
    for (const entry of cached.index.actions) if (unchangedSet.has(entry.meeting)) actions.push(entry);
    for (const entry of cached.index.resolved) if (unchangedSet.has(entry.meeting)) resolved.push(entry);
    for (const entry of (cached.index.ideas ?? [])) if (unchangedSet.has(entry.meeting)) ideas.push(entry);
    for (const file of unchangedFiles) mtimes[file] = currentMtimes[file];
  }

  // Re-index only changed files
  for (const file of changedFiles) {
    try {
      const filePath = path.join(meetingsDir, file);
      const content = await readFile(filePath, 'utf-8');
      mtimes[file] = currentMtimes[file];

      const tags = extractTags(content, file);
      for (const tag of tags) {
        switch (tag.type) {
          case 'DECISION': decisions.push(tag); break;
          case 'OPEN': open.push(tag); break;
          case 'ACTION': actions.push(tag); break;
          case 'RESOLVED': resolved.push(tag); break;
          case 'IDEA': ideas.push(tag); break;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  const index: TagIndex = {
    decisions,
    open,
    actions,
    resolved,
    ideas,
    meetingCount: files.length,
    builtAt: new Date().toISOString(),
  };

  // Write cache
  try {
    const cacheData: CacheFile = { index, mtimes };
    await writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  } catch {
    // Cache write failure is non-critical
  }

  return index;
}

/**
 * Get unresolved items for carry-forward prompts.
 * Returns OPEN and ACTION items that haven't been resolved in later meetings,
 * and aren't marked done/stale in the roadmap status store.
 */
export async function getUnresolved(meetingsDir: string): Promise<{ open: TagEntry[]; actions: TagEntry[] }> {
  const index = await buildTagIndex(meetingsDir);

  // Build set of resolved slugs so we can suppress matching OPEN items
  const resolvedSlugs = new Set(
    index.resolved.map(r => r.id).filter((id): id is string => id !== null)
  );

  // Load roadmap status store to filter out done/stale items
  const statusFilePath = path.join(meetingsDir, '.council-action-status.json');
  let doneOrStale = new Set<string>();
  try {
    const raw = await readFile(statusFilePath, 'utf-8');
    const store = JSON.parse(raw) as { statuses: Record<string, { status: string }> };
    doneOrStale = new Set(
      Object.entries(store.statuses)
        .filter(([, v]) => v.status === 'done' || v.status === 'stale')
        .map(([k]) => k)
    );
  } catch {
    // File doesn't exist yet — no status overrides
  }

  const isActive = (tag: TagEntry) => !doneOrStale.has(hashItem(tag.text, tag.meeting));
  const sortByDate = (a: TagEntry, b: TagEntry) => (b.date ?? '').localeCompare(a.date ?? '');

  return {
    open: index.open
      .filter(o => !o.id || !resolvedSlugs.has(o.id))
      .filter(isActive)
      .sort(sortByDate),
    actions: index.actions
      .filter(isActive)
      .sort(sortByDate),
  };
}
