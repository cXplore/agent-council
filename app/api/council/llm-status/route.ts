import { NextResponse } from 'next/server';
import { detectBackend, detectProviders, isLLMAvailable } from '@/lib/llm-query';
import { getConfig, getUsageSettings } from '@/lib/config';

/**
 * GET /api/council/llm-status
 *
 * Check which LLM providers are available and the user's backend preference.
 */
export async function GET() {
  let preference: 'auto' | 'oauth' | 'api-key' = 'auto';
  try {
    const config = await getConfig();
    const usage = getUsageSettings(config);
    preference = usage.llmBackend ?? 'auto';
  } catch { /* config not available */ }

  const backend = detectBackend(preference);
  const providers = detectProviders();
  return NextResponse.json({
    available: isLLMAvailable(),
    backend,
    preference,
    providers,
    hint: backend === 'none'
      ? preference === 'oauth'
        ? 'Backend set to OAuth but CLAUDE_CODE_OAUTH_TOKEN is not available. Run from Claude Code.'
        : preference === 'api-key'
          ? 'Backend set to API Key but no keys found. Set ANTHROPIC_API_KEY in .env.local.'
          : 'No credentials found. Set an API key in .env.local or run from Claude Code.'
      : undefined,
  });
}
