import { NextRequest, NextResponse } from 'next/server';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';
import { buildTagIndex, getUnresolved, recallByTopic } from '@/lib/tag-index';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectParam = searchParams.get('project');
    const mode = searchParams.get('mode'); // 'summary' | 'unresolved' | null (full)
    const typeFilter = searchParams.get('type'); // 'decision' | 'open' | 'action'
    const query = searchParams.get('q'); // text search

    // Resolve meetings directory
    const config = await getConfig();
    let meetingsDir: string;

    if (projectParam) {
      const projectConfig = getProjectConfig(config, projectParam);
      if (!projectConfig) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      meetingsDir = projectConfig.meetingsDir;
    } else {
      const active = getActiveProjectConfig(config);
      meetingsDir = active.meetingsDir;
    }

    // Handle unresolved mode
    if (mode === 'unresolved') {
      const unresolved = await getUnresolved(meetingsDir);
      return NextResponse.json(unresolved, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // Handle recall mode — topic-based decision/open-question search with context
    if (mode === 'recall') {
      const topic = query || searchParams.get('topic') || '';
      if (!topic) {
        return NextResponse.json({ error: 'query or topic parameter required for recall mode' }, { status: 400 });
      }
      const results = await recallByTopic(meetingsDir, topic);
      return NextResponse.json({ results, total: results.length }, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // Build full index
    const index = await buildTagIndex(meetingsDir);

    // Summary mode — just counts
    if (mode === 'summary') {
      return NextResponse.json({
        decisions: index.decisions.length,
        open: index.open.length,
        actions: index.actions.length,
        meetingCount: index.meetingCount,
        builtAt: index.builtAt,
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // Full mode — optionally filtered
    let results = [...index.decisions, ...index.open, ...index.actions, ...index.resolved, ...index.ideas];

    if (typeFilter) {
      const t = typeFilter.toUpperCase();
      results = results.filter(r => r.type === t);
    }

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(r => r.text?.toLowerCase().includes(q));
    }

    // Sort by date descending (newest first) — better for recall use case
    results.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    return NextResponse.json({
      results,
      total: results.length,
      meetingCount: index.meetingCount,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.error('Tags API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
