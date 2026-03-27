import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getActiveProjectConfig, getProjectConfig } from '@/lib/config';

interface SuggestionState {
  dismissed: string[]; // suggestion text keys that have been dismissed
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
    return JSON.parse(content);
  } catch {
    return { dismissed: [] };
  }
}

async function writeState(filePath: string, state: SuggestionState): Promise<void> {
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

// GET — return dismissed suggestion keys
export async function GET(request: NextRequest) {
  const filePath = await getStateFilePath(request);
  const state = await readState(filePath);
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-cache, no-store' } });
}

// POST — dismiss a suggestion by text key
export async function POST(request: NextRequest) {
  const filePath = await getStateFilePath(request);
  const { text } = await request.json();

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const state = await readState(filePath);
  if (!state.dismissed.includes(text)) {
    state.dismissed.push(text);
    await writeState(filePath, state);
  }

  return NextResponse.json({ success: true });
}

// DELETE — restore a dismissed suggestion
export async function DELETE(request: NextRequest) {
  const filePath = await getStateFilePath(request);
  const text = request.nextUrl.searchParams.get('text');

  if (!text) {
    return NextResponse.json({ error: 'text parameter required' }, { status: 400 });
  }

  const state = await readState(filePath);
  state.dismissed = state.dismissed.filter(d => d !== text);
  await writeState(filePath, state);

  return NextResponse.json({ success: true });
}
