import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
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

  // Track whether we're inside a "Future considerations" section (untracked)
  let inFutureConsiderations = false;

  for (let i = startLine; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Detect "Future considerations" heading (## or ###) — skip tags inside it
    if (/^#{2,3}\s+Future considerations/i.test(trimmed)) {
      inFutureConsiderations = true;
      continue;
    }
    // Exit Future considerations when a new heading of same or higher level appears
    if (inFutureConsiderations && /^#{2,3}\s+/.test(trimmed) && !/^#{2,3}\s+Future considerations/i.test(trimmed)) {
      inFutureConsiderations = false;
    }
    if (inFutureConsiderations) continue;

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

  // Write cache atomically: write to .tmp then rename to prevent corruption on interrupted writes
  try {
    const cacheData: CacheFile = { index, mtimes };
    const tmpPath = cachePath + '.tmp';
    await writeFile(tmpPath, JSON.stringify(cacheData, null, 2), 'utf-8');
    await rename(tmpPath, cachePath);
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
/**
 * Recall decisions and open questions relevant to a topic.
 * Searches tag text, meeting titles, and surrounding paragraph context.
 * Returns results with context snippets, sorted by recency, capped at limit.
 */
export async function recallByTopic(
  meetingsDir: string,
  topic: string,
  options: {
    limit?: number;
    dateFrom?: string;  // YYYY-MM-DD inclusive
    dateTo?: string;    // YYYY-MM-DD inclusive
    types?: Array<'decision' | 'open' | 'action'>;
  } = {},
): Promise<Array<TagEntry & { context: string }>> {
  const { limit = 10, dateFrom, dateTo, types } = options;
  const index = await buildTagIndex(meetingsDir);
  const query = topic.toLowerCase();
  const keywords = query.split(/\s+/).filter(k => k.length >= 3);

  // Score relevance: tag text match > meeting title match
  type Scored = TagEntry & { context: string; score: number };
  const scored: Scored[] = [];

  // Select candidate pools based on types filter (default: decisions + open)
  let candidates: TagEntry[];
  if (types && types.length > 0) {
    candidates = [];
    if (types.includes('decision')) candidates.push(...index.decisions);
    if (types.includes('open')) candidates.push(...index.open);
    if (types.includes('action')) candidates.push(...index.actions);
  } else {
    // Default: decisions and open questions (not actions — those are work items, not knowledge)
    candidates = [...index.decisions, ...index.open];
  }

  // Apply date range filter
  if (dateFrom || dateTo) {
    candidates = candidates.filter(entry => {
      if (!entry.date) return false;
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo) return false;
      return true;
    });
  }

  for (const entry of candidates) {
    let score = 0;
    const textLower = entry.text.toLowerCase();
    const titleLower = entry.meetingTitle.toLowerCase();

    // Full query match in tag text (strongest signal)
    if (textLower.includes(query)) score += 10;
    // Full query match in meeting title
    if (titleLower.includes(query)) score += 5;
    // Individual keyword matches in tag text
    for (const kw of keywords) {
      if (textLower.includes(kw)) score += 3;
      if (titleLower.includes(kw)) score += 1;
    }

    if (score === 0) continue;

    // Load surrounding context from the meeting file
    let context = '';
    try {
      const filePath = path.join(meetingsDir, entry.meeting);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      if (entry.lineNumber > 0) {
        // Extract 2 lines before and after the tag for context
        const start = Math.max(0, entry.lineNumber - 2);
        const end = Math.min(lines.length, entry.lineNumber + 3);
        context = lines.slice(start, end).join('\n').trim();
      } else {
        // JSON appendix entries have lineNumber=0 — search for the text in the file
        const idx = lines.findIndex(l => l.includes(entry.text.slice(0, 60)));
        if (idx >= 0) {
          const start = Math.max(0, idx - 2);
          const end = Math.min(lines.length, idx + 3);
          context = lines.slice(start, end).join('\n').trim();
        }
      }
    } catch {
      // File read failed — proceed without context
    }

    scored.push({ ...entry, context, score });
  }

  // Sort by score desc, then by date desc (newest first)
  scored.sort((a, b) => b.score - a.score || (b.date ?? '').localeCompare(a.date ?? ''));

  return scored.slice(0, limit);
}

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
