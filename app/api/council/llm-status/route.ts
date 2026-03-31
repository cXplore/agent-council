import { NextResponse } from 'next/server';
import { detectBackend, isLLMAvailable } from '@/lib/llm-query';

/**
 * GET /api/council/llm-status
 *
 * Check which LLM backend is available. Used by the UI to determine
 * whether the "Run Meeting" button should be enabled.
 */
export async function GET() {
  const backend = detectBackend();
  return NextResponse.json({
    available: isLLMAvailable(),
    backend,
    hint: backend === 'none'
      ? 'Set ANTHROPIC_API_KEY in .env.local or run from Claude Code (CLAUDE_CODE_OAUTH_TOKEN)'
      : undefined,
  });
}
