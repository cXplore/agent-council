import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { getConfig, getActiveProjectConfig } from '@/lib/config';
import { appendContextLearnings, trimContextFile } from '@/lib/context-files';

/**
 * POST /api/agents/context — Append learnings to an agent's context file.
 * Auto-trims to 50-line rolling window.
 *
 * Body: { agent: string, entries: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent, entries } = body;

    if (!agent || !entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'agent (string) and entries (string[]) are required' },
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

    await appendContextLearnings(filePath, entries);

    return NextResponse.json({
      success: true,
      agent: safeName,
      entriesAdded: entries.length,
    });
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
    const { readdir } = await import('fs/promises');

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
