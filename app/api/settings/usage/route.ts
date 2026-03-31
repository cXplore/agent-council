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
    const { profile, defaultRounds, maxTokens, defaultModel } = body;

    // Validate
    if (profile && !['lean', 'standard', 'deep'].includes(profile)) {
      return NextResponse.json({ error: 'profile must be lean, standard, or deep' }, { status: 400 });
    }
    if (defaultRounds !== undefined && (typeof defaultRounds !== 'number' || defaultRounds < 1 || defaultRounds > 3)) {
      return NextResponse.json({ error: 'defaultRounds must be 1-3' }, { status: 400 });
    }
    if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 512 || maxTokens > 16384)) {
      return NextResponse.json({ error: 'maxTokens must be 512-16384' }, { status: 400 });
    }

    const updated = await setUsageSettings({
      ...(profile ? { profile: profile as UsageProfile } : {}),
      ...(defaultRounds !== undefined ? { defaultRounds } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(defaultModel !== undefined ? { defaultModel: defaultModel || undefined } : {}),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
