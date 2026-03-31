import { NextRequest, NextResponse } from 'next/server';
import { getConfig, getUsageSettings, setUsageSettings } from '@/lib/config';
import type { UsageProfile } from '@/lib/types';

/** GET /api/settings/usage — Get current usage settings */
export async function GET() {
  try {
    const config = await getConfig();
    const settings = getUsageSettings(config);
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST /api/settings/usage — Update usage settings */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profile, maxRounds, maxAgents, maxTokens, defaultModel, llmBackend } = body;

    // Validate
    if (profile && !['lean', 'standard', 'deep'].includes(profile)) {
      return NextResponse.json({ error: 'profile must be lean, standard, or deep' }, { status: 400 });
    }
    if (llmBackend !== undefined && !['auto', 'oauth', 'api-key'].includes(llmBackend)) {
      return NextResponse.json({ error: 'llmBackend must be auto, oauth, or api-key' }, { status: 400 });
    }
    if (maxRounds !== undefined && (typeof maxRounds !== 'number' || maxRounds < 1 || maxRounds > 5)) {
      return NextResponse.json({ error: 'maxRounds must be 1-5' }, { status: 400 });
    }
    if (maxAgents !== undefined && (typeof maxAgents !== 'number' || maxAgents < 2 || maxAgents > 6)) {
      return NextResponse.json({ error: 'maxAgents must be 2-6' }, { status: 400 });
    }
    if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 512 || maxTokens > 16384)) {
      return NextResponse.json({ error: 'maxTokens must be 512-16384' }, { status: 400 });
    }

    const updated = await setUsageSettings({
      ...(profile ? { profile: profile as UsageProfile } : {}),
      ...(maxRounds !== undefined ? { maxRounds } : {}),
      ...(maxAgents !== undefined ? { maxAgents } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(defaultModel !== undefined ? { defaultModel: defaultModel || undefined } : {}),
      ...(llmBackend !== undefined ? { llmBackend } : {}),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
