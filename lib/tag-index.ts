import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface TagEntry {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED';
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
  meetingCount: number;
  builtAt: string;
}

interface CacheFile {
  index: TagIndex;
  mtimes: Record<string, number>;  // filename -> mtime ms
}

// Matches both formats: "DECISION: text" and "[DECISION] text" and "[OPEN:slug] text"
const TAG_REGEX = /^[\s\-*]*\[?(DECISION|OPEN|ACTION|RESOLVED)(?::([a-z0-9-]+))?[:\]]\s*(.+)/i;

function extractTags(content: string, filename: string): TagEntry[] {
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

  for (let i = 0; i < lines.length; i++) {
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

  return entries;
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
    files = entries.filter(f => f.endsWith('.md'));
  } catch {
    return { decisions: [], open: [], actions: [], resolved: [], meetingCount: 0, builtAt: new Date().toISOString() };
  }

  // Check if cache is still valid by comparing mtimes
  if (cached) {
    let cacheValid = true;
    const currentMtimes: Record<string, number> = {};

    for (const file of files) {
      try {
        const fileStat = await stat(path.join(meetingsDir, file));
        currentMtimes[file] = fileStat.mtimeMs;
        if (!cached.mtimes[file] || cached.mtimes[file] !== fileStat.mtimeMs) {
          cacheValid = false;
        }
      } catch {
        cacheValid = false;
      }
    }

    // Also check if files were removed
    if (Object.keys(cached.mtimes).length !== files.length) {
      cacheValid = false;
    }

    if (cacheValid) {
      return cached.index;
    }
  }

  // Rebuild index
  const decisions: TagEntry[] = [];
  const open: TagEntry[] = [];
  const actions: TagEntry[] = [];
  const resolved: TagEntry[] = [];
  const mtimes: Record<string, number> = {};

  for (const file of files) {
    try {
      const filePath = path.join(meetingsDir, file);
      const content = await readFile(filePath, 'utf-8');
      const fileStat = await stat(filePath);
      mtimes[file] = fileStat.mtimeMs;

      const tags = extractTags(content, file);
      for (const tag of tags) {
        switch (tag.type) {
          case 'DECISION': decisions.push(tag); break;
          case 'OPEN': open.push(tag); break;
          case 'ACTION': actions.push(tag); break;
          case 'RESOLVED': resolved.push(tag); break;
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
 * Returns OPEN and ACTION items that haven't been resolved in later meetings.
 */
export async function getUnresolved(meetingsDir: string): Promise<{ open: TagEntry[]; actions: TagEntry[] }> {
  const index = await buildTagIndex(meetingsDir);

  // Build set of resolved slugs so we can suppress matching OPEN items
  const resolvedSlugs = new Set(
    index.resolved.map(r => r.id).filter((id): id is string => id !== null)
  );

  const sortByDate = (a: TagEntry, b: TagEntry) => (b.date ?? '').localeCompare(a.date ?? '');

  return {
    open: index.open.filter(o => !o.id || !resolvedSlugs.has(o.id)).sort(sortByDate),
    actions: index.actions.sort(sortByDate),
  };
}
