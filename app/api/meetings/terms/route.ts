import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';

const STOP_WORDS = new Set([
  // Common English
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need',
  'must', 'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very',
  'just', 'about', 'above', 'after', 'again', 'all', 'also', 'any',
  'because', 'before', 'between', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'only', 'own', 'same', 'into', 'over',
  'under', 'further', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'its', 'his', 'her', 'their', 'our', 'your', 'my',
  'itself', 'himself', 'herself', 'themselves', 'ourselves', 'yourself',
  'out', 'up', 'down', 'off', 'through', 'during', 'while', 'until',
  'against', 'among', 'throughout', 'despite', 'towards', 'upon',
  'around', 'without', 'within', 'along', 'across', 'behind', 'beyond',
  'like', 'since', 'still', 'already', 'yet', 'even', 'well',
  'back', 'much', 'many', 'really', 'right', 'now', 'get', 'got',
  'make', 'made', 'going', 'way', 'thing', 'things', 'think', 'know',
  'see', 'come', 'want', 'look', 'use', 'used', 'using', 'take',
  'give', 'good', 'new', 'first', 'last', 'long', 'great', 'little',
  'say', 'said', 'one', 'two', 'also', 'well', 'don', 'doesn', 'didn',
  'won', 'isn', 'aren', 'wasn', 'weren', 'hasn', 'haven', 'hadn',

  // Technical / code-adjacent (noise in meeting discussions)
  'function', 'const', 'var', 'let', 'import', 'export', 'return',
  'true', 'false', 'null', 'undefined', 'class', 'type', 'interface',
  'async', 'await', 'new', 'this', 'else', 'case', 'break', 'continue',
  'default', 'switch', 'try', 'catch', 'throw', 'finally', 'typeof',
  'void', 'delete', 'instanceof', 'yield', 'static', 'extends',
  'implements', 'super', 'enum', 'readonly', 'abstract', 'declare',

  // Markdown / meeting boilerplate
  'http', 'https', 'www', 'com', 'org', 'html', 'css',
  'meeting', 'round', 'summary', 'participants', 'facilitator',
  'date', 'status', 'complete', 'progress',
]);

interface TermEntry {
  word: string;
  count: number;
}

function extractTerms(content: string): { terms: TermEntry[]; totalWords: number } {
  // Strip HTML comments (metadata markers)
  const cleaned = content.replace(/<!--[\s\S]*?-->/g, '');

  // Split into words, normalize
  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && w.length <= 25);

  const totalWords = words.length;

  // Count frequencies, skipping stop words
  const freq = new Map<string, number>();
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    // Skip pure numbers
    if (/^\d+$/.test(word)) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // Sort by count desc, take top 20
  const terms = Array.from(freq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return { terms, totalWords };
}

/** Resolve meetings dir -- uses ?project= param or active project */
async function getMeetingsDir(request: NextRequest): Promise<string> {
  const config = await getConfig();
  const projectParam = request.nextUrl.searchParams.get('project');

  if (projectParam) {
    const projectConfig = getProjectConfig(config, projectParam);
    if (projectConfig) return projectConfig.meetingsDir;
  }

  return getActiveProjectConfig(config).meetingsDir;
}

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');

  if (!filename) {
    return NextResponse.json({ error: 'file parameter is required' }, { status: 400 });
  }

  const meetingsDir = await getMeetingsDir(request);

  try {
    const safeName = path.basename(filename);
    const filePath = path.join(meetingsDir, safeName);
    const content = await readFile(filePath, 'utf-8');

    const { terms, totalWords } = extractTerms(content);

    return NextResponse.json({ terms, totalWords }, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to extract terms' }, { status: 500 });
  }
}
