import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';

interface SuggestionState {
  dismissed: string[];
  queued: string[];   // suggestions that have been added to planned meetings
}

async function getStateFilePath(request: NextRequest): Promise<string> {
  const config = await getConfig();
  const projectParam = request.nextUrl.searchParams.get('project');
  let meetingsDir: string;

  if (projectParam) {
    const projectConfig = getProjectConfig(config, projectParam);
    meetingsDir = projectConfig ? projectConfig.meetingsDir : getActiveProjectConfig(config).meetingsDir;
  } else {
    meetingsDir = getActiveProjectConfig(config).meetingsDir;
  }

  return path.join(meetingsDir, '.council-suggestion-state.json');
}

async function readState(filePath: string): Promise<SuggestionState> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return { dismissed: parsed.dismissed ?? [], queued: parsed.queued ?? [] };
  } catch {
    return { dismissed: [], queued: [] };
  }
}

async function writeState(filePath: string, state: SuggestionState): Promise<void> {
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

// GET — return full suggestion state
export async function GET(request: NextRequest) {
  const filePath = await getStateFilePath(request);
  const state = await readState(filePath);
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-cache, no-store' } });
}

// POST — dismiss or queue a suggestion
// Body: { text, action?: 'dismiss' | 'queue' }  (default action: 'dismiss')
export async function POST(request: NextRequest) {
  const filePath = await getStateFilePath(request);
  const { text, action = 'dismiss' } = await request.json();

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const state = await readState(filePath);

  if (action === 'queue') {
    if (!state.queued.includes(text)) {
      state.queued.push(text);
    }
  } else {
    if (!state.dismissed.includes(text)) {
      state.dismissed.push(text);
    }
  }

  await writeState(filePath, state);
  return NextResponse.json({ success: true });
}

// DELETE — restore a dismissed suggestion (remove from dismissed or queued)
export async function DELETE(request: NextRequest) {
  const filePath = await getStateFilePath(request);
  const text = request.nextUrl.searchParams.get('text');
  const from = request.nextUrl.searchParams.get('from') ?? 'dismissed';

  if (!text) {
    return NextResponse.json({ error: 'text parameter required' }, { status: 400 });
  }

  const state = await readState(filePath);
  if (from === 'queued') {
    state.queued = state.queued.filter(q => q !== text);
  } else {
    state.dismissed = state.dismissed.filter(d => d !== text);
  }
  await writeState(filePath, state);

  return NextResponse.json({ success: true });
}
