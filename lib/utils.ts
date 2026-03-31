/** Generate a deterministic HSL color from a name string. */
export function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue}, 50%, 68%)`;
}

/** Format a byte size into a human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Truncate a string to maxLen characters with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

/**
 * @deprecated Use `stableActionKey` instead. Kept for backward-compatible
 * migration of `.council-action-status.json` entries.
 */
export function hashItem(text: string, meeting: string): string {
  const input = `${text}::${meeting}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Generate a slug from a string */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a stable, human-readable key for an action/decision/open-question.
 *
 * Format: `<slugified-first-60-chars>--<meeting-date>`
 *
 * Survives minor text edits (whitespace, punctuation, capitalization).
 * Only breaks on substantial rewrites — which should signal a new item anyway.
 * The meeting date suffix prevents collisions between similar items across meetings.
 */
export function stableActionKey(text: string, meeting: string): string {
  if (!text) return `item--${(meeting ?? '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? 'unknown'}`;

  // Normalize: strip tag prefixes, assignee/priority modifiers, "done when:" clauses
  const cleaned = text
    .replace(/^\[(?:ACTION|DECISION|OPEN|RESOLVED|IDEA)[^\]]*\]\s*/i, '')
    .replace(/@\w+/g, '')
    .replace(/!\w+/g, '')
    .replace(/\s*[—–-]+\s*done when[:.]?\s*.+$/i, '')
    .trim();

  // Extract date from meeting filename (YYYY-MM-DD prefix)
  const dateMatch = meeting.match(/^(\d{4}-\d{2}-\d{2})/);
  const dateSuffix = dateMatch ? dateMatch[1] : meeting.replace(/\.md$/, '').slice(0, 10);

  // Slugify first 60 chars
  const slug = slugify(cleaned.slice(0, 60));

  // Ensure non-empty
  if (!slug) {
    return `item--${dateSuffix}`;
  }

  return `${slug}--${dateSuffix}`;
}
