import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import {
  appendContextLearnings,
  appendCorrection,
  trimContextFile,
  getContextHealth,
} from '@/lib/context-files';

/**
 * GET /api/agents/context — Get health/staleness report for all agent context files.
 */
export async function GET() {
  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);

    let entries: string[];
    try {
      entries = await readdir(active.agentsDir);
    } catch {
      return NextResponse.json({ agents: [] });
    }

    const contextFiles = entries.filter(f => f.endsWith('.context.md'));
    const health = await Promise.all(
      contextFiles.map(f => getContextHealth(path.join(active.agentsDir, f)))
    );

    return NextResponse.json({ agents: health });
  } catch (err) {
    console.error('Context health error:', err);
    return NextResponse.json({ error: 'Failed to get context health' }, { status: 500 });
  }
}

/**
 * POST /api/agents/context — Append learnings or corrections to an agent's context file.
 * Auto-trims learnings to 50-line rolling window. Corrections persist separately (max 20).
 *
 * Body: { agent: string, entries?: string[], correction?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent, entries, correction } = body;

    if (!agent) {
      return NextResponse.json(
        { error: 'agent (string) is required' },
        { status: 400 }
      );
    }

    if (!entries && !correction) {
      return NextResponse.json(
        { error: 'entries (string[]) or correction (string) is required' },
        { status: 400 }
      );
    }

    const config = await getConfig();
    const active = getActiveProjectConfig(config);
    const safeName = path.basename(agent).replace(/\.md$/, '').replace(/\.context$/, '');
    const filePath = path.join(active.agentsDir, `${safeName}.context.md`);

    // Path traversal check
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(active.agentsDir);
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const result: Record<string, unknown> = { success: true, agent: safeName };

    if (entries && Array.isArray(entries) && entries.length > 0) {
      await appendContextLearnings(filePath, entries);
      result.entriesAdded = entries.length;
    }

    if (correction && typeof correction === 'string') {
      await appendCorrection(filePath, correction);
      result.correctionAdded = true;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Context update error:', err);
    return NextResponse.json({ error: 'Failed to update context' }, { status: 500 });
  }
}

/**
 * PATCH /api/agents/context — Trim all context files to rolling window.
 * Useful for one-time cleanup.
 */
export async function PATCH() {
  try {
    const config = await getConfig();
    const active = getActiveProjectConfig(config);

    let entries: string[];
    try {
      entries = await readdir(active.agentsDir);
    } catch {
      return NextResponse.json({ trimmed: [] });
    }

    const contextFiles = entries.filter(f => f.endsWith('.context.md'));
    const results: { agent: string; linesTrimmed: number }[] = [];

    for (const file of contextFiles) {
      const filePath = path.join(active.agentsDir, file);
      const trimmed = await trimContextFile(filePath);
      if (trimmed > 0) {
        results.push({ agent: file.replace('.context.md', ''), linesTrimmed: trimmed });
      }
    }

    return NextResponse.json({ trimmed: results });
  } catch (err) {
    console.error('Context trim error:', err);
    return NextResponse.json({ error: 'Failed to trim context files' }, { status: 500 });
  }
}
