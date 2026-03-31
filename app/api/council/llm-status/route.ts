import { NextResponse } from 'next/server';
import { detectBackend, detectProviders, isLLMAvailable } from '@/lib/llm-query';

/**
 * GET /api/council/llm-status
 *
 * Check which LLM providers are available. Used by the UI to show
 * provider status and enable/disable the "Run Meeting" button.
 */
export async function GET() {
  const backend = detectBackend();
  const providers = detectProviders();
  return NextResponse.json({
    available: isLLMAvailable(),
    backend,
    providers,
    hint: backend === 'none'
      ? 'Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in .env.local'
      : undefined,
  });
}
