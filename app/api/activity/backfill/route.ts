import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readActivityLog, writeActivityEntry } from '@/lib/activity-log';
import { getConfig, getActiveProjectConfig } from '@/lib/config';

const execAsync = promisify(exec);

/**
 * POST /api/activity/backfill — Backfill activity entries from git log.
 *
 * Reads recent commits and creates activity entries for any not already
 * in the log (matched by linkedCommit hash). Designed to be called by
 * the autonomous worker at session start to fill gaps.
 *
 * Query params:
 *   since — ISO date string or relative (e.g., "24h", "7d"). Default: 48h.
 *   limit — Max commits to process. Default: 20.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since') ?? '48h';
  const limitParam = parseInt(url.searchParams.get('limit') ?? '20', 10);

  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);

    // Parse 'since' into a git-compatible date
    const sinceDate = parseSince(sinceParam);

    // Get existing commit hashes already in the log
    const existing = await readActivityLog();
    const existingCommits = new Set(
      existing
        .filter(e => e.linkedCommit)
        .map(e => e.linkedCommit!.slice(0, 7))
    );

    // Read git log from the project directory
    const cwd = active.projectPath ?? process.cwd();
    // Use record separator (\x1e) to split commits since messages may contain |||
    const gitLogCmd = `git log --since="${sinceDate}" --format="%x1e%h|||%s|||%an|||%b" --max-count=${limitParam}`;
    const { stdout } = await execAsync(gitLogCmd, { cwd });

    const commits = stdout.split('\x1e').filter(Boolean);
    let added = 0;
    const entries: Array<{ hash: string; summary: string }> = [];

    for (const commit of commits) {
      const firstLine = commit.trim().split('\n')[0];
      const [shortHash, message, author, ...bodyParts] = firstLine.split('|||');
      const body = bodyParts.join('|||') + '\n' + commit.trim().split('\n').slice(1).join('\n');
      if (!shortHash || !message) continue;

      // Skip if already in log
      if (existingCommits.has(shortHash)) continue;

      // Skip merge commits
      if (message.startsWith('Merge ')) continue;

      // Check author and body for Co-Authored-By to determine source
      const isCoAuthored = body.includes('Co-Authored-By') || author?.includes('Claude');
      const source = isCoAuthored ? 'worker' : 'interactive';

      await writeActivityEntry({
        source: source as 'worker' | 'interactive',
        type: 'code_change',
        summary: message.slice(0, 200),
        linkedCommit: shortHash,
      });

      entries.push({ hash: shortHash, summary: message.slice(0, 80) });
      added++;
    }

    return NextResponse.json({
      ok: true,
      added,
      skipped: commits.length - added,
      entries,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** Convert relative time strings (48h, 7d) or ISO dates to git --since format */
function parseSince(input: string): string {
  // Relative: "48h", "7d", "2w"
  const relMatch = input.match(/^(\d+)([hdwm])$/);
  if (relMatch) {
    const [, num, unit] = relMatch;
    const unitMap: Record<string, string> = { h: 'hours', d: 'days', w: 'weeks', m: 'months' };
    return `${num} ${unitMap[unit]} ago`;
  }
  // ISO date: try to parse directly
  const d = new Date(input);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return '48 hours ago';
}
