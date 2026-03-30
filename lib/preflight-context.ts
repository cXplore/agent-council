/**
 * Pre-flight context gathering for meetings.
 *
 * Runs between context assembly and Round 1 to inject relevant source files
 * into the shared agent context. Uses keyword extraction from the topic string
 * matched against the project file tree.
 *
 * Design decisions (from 2026-03-30 design review):
 * - Additive pipeline stage — does not modify existing context paths
 * - Automatic by default, not opt-in
 * - Keyword/pattern extraction (Pass 1 only — no LLM)
 * - Token budget: ~4500 for code + ~500 for manifest
 * - Graceful degradation: injects nothing when no matches found
 * - Resolution manifest is non-optional for observability
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedFile {
  /** Relative path from project root */
  relativePath: string;
  /** Absolute path */
  absolutePath: string;
  /** Portion of file content included */
  content: string;
  /** Tokens (estimated as chars / 4) */
  estimatedTokens: number;
  /** What triggered inclusion */
  matchSignals: string[];
  /** Whether the file was truncated */
  truncated: boolean;
}

export interface ResolutionManifest {
  /** Files that were gathered and injected */
  files: ResolvedFile[];
  /** Total estimated tokens of gathered content */
  totalTokens: number;
  /** Keywords extracted from the topic */
  extractedKeywords: string[];
  /** Whether any files were found */
  found: boolean;
  /** Human-readable summary */
  summary: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max estimated tokens for gathered code content */
const CODE_TOKEN_BUDGET = 4500;
/** Max estimated tokens per individual file */
const PER_FILE_TOKEN_BUDGET = 1500;
/** Max number of files to inject */
const MAX_FILES = 5;
/** Rough chars-per-token estimate */
const CHARS_PER_TOKEN = 4;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'vendor', 'target', '.cache', '.turbo', '.vercel', '.output',
  'coverage', '.nyc_output', '.venv', 'venv', 'env', '.env',
  'out', 'tmp', 'temp',
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.rb', '.cs',
  '.c', '.cpp', '.h', '.hpp', '.swift', '.kt',
  '.vue', '.svelte', '.dart', '.lua', '.zig',
  '.ex', '.exs', '.scala', '.php',
]);

// Reserved for future use: config file detection in Pass 2
// const CONFIG_FILES = new Set([
//   'package.json', 'tsconfig.json', 'next.config.ts', 'next.config.js',
// ]);

// ---------------------------------------------------------------------------
// Keyword extraction (Pass 1)
// ---------------------------------------------------------------------------

/**
 * Extract meaningful keywords and identifiers from a meeting topic string.
 * Filters out common English stop words and short tokens.
 */
export function extractKeywords(topic: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'for', 'with',
    'from', 'into', 'about', 'between', 'through', 'during', 'before',
    'after', 'above', 'below', 'to', 'of', 'in', 'on', 'at', 'by',
    'up', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'what',
    'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'each', 'every', 'all', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'any', 'only', 'own', 'same', 'than',
    'too', 'very', 'just', 'also', 'now', 'its', 'it', 'they', 'them',
    'we', 'our', 'us', 'you', 'your', 'he', 'she', 'his', 'her',
    // Meeting-specific noise words
    'meeting', 'discuss', 'review', 'design', 'should', 'currently',
    'proposal', 'question', 'answer', 'approach', 'strategy',
    'improve', 'better', 'make', 'existing', 'new', 'using',
  ]);

  // Split on whitespace and common separators, extract identifier-like tokens
  // Preserve dots in file-like patterns (e.g., scanner.ts, route.ts)
  const raw = topic
    .replace(/[`"'()[\]{}<>]/g, ' ')
    .replace(/[,:;!?—–]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim().replace(/^[-\/\\]+|[-\/\\]+$/g, '')) // trim leading/trailing path chars
    .filter(t => t.length >= 3);

  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const token of raw) {
    const lower = token.toLowerCase();
    if (STOP_WORDS.has(lower) || seen.has(lower)) continue;

    // Camel/pascal case identifiers are high value
    if (/[a-z][A-Z]/.test(token) || /^[A-Z][a-z]+[A-Z]/.test(token)) {
      seen.add(lower);
      keywords.push(token);
      // Also add the individual parts
      const parts = token.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
      for (const p of parts) {
        const pl = p.toLowerCase();
        if (pl.length >= 3 && !STOP_WORDS.has(pl) && !seen.has(pl)) {
          seen.add(pl);
          keywords.push(pl);
        }
      }
      continue;
    }

    // File-like patterns (path segments, extensions)
    if (token.includes('.') || token.includes('/') || token.includes('\\')) {
      seen.add(lower);
      keywords.push(token);
      continue;
    }

    // Regular words — skip very common stop words
    if (!STOP_WORDS.has(lower)) {
      seen.add(lower);
      keywords.push(lower);
    }
  }

  return keywords;
}

// ---------------------------------------------------------------------------
// File tree walker (lightweight — just collects paths)
// ---------------------------------------------------------------------------

async function walkFileTree(
  dir: string,
  root: string,
  maxDepth: number = 10,
  depth: number = 0,
): Promise<string[]> {
  if (depth > maxDepth) return [];

  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const sub = await walkFileTree(fullPath, root, maxDepth, depth + 1);
      files.push(...sub);
    } else if (entry.isFile()) {
      const rel = path.relative(root, fullPath).replace(/\\/g, '/');
      files.push(rel);
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// File matching
// ---------------------------------------------------------------------------

interface FileMatch {
  relativePath: string;
  signals: string[];
  score: number;
}

/**
 * Score how well a file path matches the extracted keywords.
 * Higher score = more relevant.
 */
function scoreFileMatch(filePath: string, keywords: string[]): FileMatch | null {
  const lower = filePath.toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const basenameNoExt = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const signals: string[] = [];
  let score = 0;

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();

    // Exact basename match (strongest signal)
    if (basenameNoExt === kwLower) {
      score += 10;
      signals.push(`exact-basename: "${kw}"`);
      continue;
    }

    // Basename contains keyword
    if (basenameNoExt.includes(kwLower)) {
      score += 5;
      signals.push(`basename-contains: "${kw}"`);
      continue;
    }

    // Path segment match
    const segments = lower.split('/');
    if (segments.some(s => s === kwLower || s.includes(kwLower))) {
      score += 3;
      signals.push(`path-segment: "${kw}"`);
      continue;
    }

    // Full path contains keyword
    if (lower.includes(kwLower)) {
      score += 1;
      signals.push(`path-contains: "${kw}"`);
    }
  }

  // Boost source code files over config
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) score += 1;

  // Boost files that are likely entry points or important
  if (basename.includes('route') || basename.includes('page') ||
      basename.includes('index') || basename.includes('server') ||
      basename.includes('api')) {
    score += 1;
  }

  if (score === 0) return null;

  return { relativePath: filePath, signals, score };
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Gather relevant source files for a meeting topic.
 *
 * @param projectPath - Absolute path to the project root
 * @param topic - Meeting topic string
 * @returns Resolution manifest with gathered files (or empty if no matches)
 */
export async function gatherPreflightContext(
  projectPath: string,
  topic: string,
): Promise<ResolutionManifest> {
  const keywords = extractKeywords(topic);

  if (keywords.length === 0) {
    return {
      files: [],
      totalTokens: 0,
      extractedKeywords: [],
      found: false,
      summary: 'No keywords extracted from topic — pre-flight context skipped.',
    };
  }

  // Walk the file tree
  const allFiles = await walkFileTree(projectPath, projectPath);

  // Score all files against keywords
  const matches: FileMatch[] = [];
  for (const file of allFiles) {
    const match = scoreFileMatch(file, keywords);
    if (match) matches.push(match);
  }

  // Sort by score (descending), take top candidates
  matches.sort((a, b) => b.score - a.score);
  const candidates = matches.slice(0, MAX_FILES * 2); // over-select to account for read failures

  if (candidates.length === 0) {
    return {
      files: [],
      totalTokens: 0,
      extractedKeywords: keywords,
      found: false,
      summary: `No matching files found for keywords: ${keywords.slice(0, 8).join(', ')}. Meeting proceeds without pre-flight context.`,
    };
  }

  // Read files up to budget
  const resolved: ResolvedFile[] = [];
  let totalTokens = 0;

  for (const candidate of candidates) {
    if (resolved.length >= MAX_FILES) break;
    if (totalTokens >= CODE_TOKEN_BUDGET) break;

    const absPath = path.join(projectPath, candidate.relativePath);
    let content: string;
    try {
      const fileStat = await stat(absPath);
      // Skip very large files (>50KB)
      if (fileStat.size > 50_000) continue;
      content = await readFile(absPath, 'utf-8');
    } catch {
      continue; // File unreadable — skip
    }

    const remainingBudget = CODE_TOKEN_BUDGET - totalTokens;
    const maxChars = Math.min(
      PER_FILE_TOKEN_BUDGET * CHARS_PER_TOKEN,
      remainingBudget * CHARS_PER_TOKEN,
    );

    let truncated = false;
    if (content.length > maxChars) {
      // Truncate at a line boundary
      const cutoff = content.lastIndexOf('\n', maxChars);
      content = content.slice(0, cutoff > 0 ? cutoff : maxChars);
      truncated = true;
    }

    const estimatedTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
    totalTokens += estimatedTokens;

    resolved.push({
      relativePath: candidate.relativePath,
      absolutePath: absPath,
      content,
      estimatedTokens,
      matchSignals: candidate.signals,
      truncated,
    });
  }

  if (resolved.length === 0) {
    return {
      files: [],
      totalTokens: 0,
      extractedKeywords: keywords,
      found: false,
      summary: `Files matched keywords but all were unreadable or too large. Keywords: ${keywords.slice(0, 8).join(', ')}`,
    };
  }

  const fileList = resolved
    .map(f => `${f.relativePath} (${f.estimatedTokens} tokens${f.truncated ? ', truncated' : ''})`)
    .join(', ');

  return {
    files: resolved,
    totalTokens,
    extractedKeywords: keywords,
    found: true,
    summary: `Gathered ${resolved.length} file(s) [${totalTokens} tokens]: ${fileList}`,
  };
}

// ---------------------------------------------------------------------------
// Manifest formatting (for injection into agent prompts)
// ---------------------------------------------------------------------------

/**
 * Format the resolution manifest as a markdown section for agent prompts.
 */
export function formatManifest(manifest: ResolutionManifest): string {
  if (!manifest.found) {
    return `## Pre-Flight Context Resolution\n\n_${manifest.summary}_\n\nNo source files were gathered for this meeting. Agents should note when their analysis would benefit from code they have not seen.`;
  }

  const lines: string[] = [
    '## Pre-Flight Context Resolution',
    '',
    `**Keywords:** ${manifest.extractedKeywords.slice(0, 10).join(', ')}`,
    `**Files gathered:** ${manifest.files.length} (${manifest.totalTokens} tokens total)`,
    '',
    '| File | Tokens | Signals | Truncated |',
    '|------|--------|---------|-----------|',
  ];

  for (const f of manifest.files) {
    const signals = f.matchSignals.join('; ');
    lines.push(`| \`${f.relativePath}\` | ${f.estimatedTokens} | ${signals} | ${f.truncated ? 'Yes' : 'No'} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Append actual file contents
  for (const f of manifest.files) {
    const ext = path.extname(f.relativePath).replace('.', '') || 'text';
    lines.push(`### \`${f.relativePath}\`${f.truncated ? ' (truncated)' : ''}`);
    lines.push('');
    lines.push('```' + ext);
    lines.push(f.content);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format the manifest as a section for the meeting file header.
 * This is the observability artifact — shows what was gathered without the full content.
 */
export function formatManifestForMeetingFile(manifest: ResolutionManifest): string {
  if (!manifest.found) {
    return `<!-- pre-flight: no files gathered. ${manifest.summary} -->`;
  }

  const lines: string[] = [
    '## Pre-Flight Context',
    '',
    `Keywords extracted: ${manifest.extractedKeywords.slice(0, 10).join(', ')}`,
    '',
    'Files injected into agent context:',
  ];

  for (const f of manifest.files) {
    const truncNote = f.truncated ? ' (truncated)' : '';
    lines.push(`- \`${f.relativePath}\`${truncNote} — ${f.estimatedTokens} tokens [${f.matchSignals.join('; ')}]`);
  }

  lines.push(`\nTotal: ${manifest.files.length} files, ~${manifest.totalTokens} tokens`);

  return lines.join('\n');
}
