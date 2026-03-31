/**
 * LLM Query Abstraction Layer
 *
 * Auto-detects the available auth method and routes queries accordingly:
 * 1. If CLAUDE_CODE_OAUTH_TOKEN is set → use Claude Agent SDK (streaming)
 * 2. If ANTHROPIC_API_KEY is set → use Anthropic SDK directly
 * 3. Otherwise → throw with a helpful error message
 *
 * This enables Agent Council to run meetings both WITH and WITHOUT Claude Code.
 */

import Anthropic from '@anthropic-ai/sdk';

// Default model for direct API calls
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export type QueryOptions = {
  systemPrompt?: string;
  maxTokens?: number;
  model?: string;
};

/**
 * Detect available LLM backend.
 */
export function detectBackend(): 'agent-sdk' | 'anthropic-api' | 'none' {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return 'agent-sdk';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic-api';
  return 'none';
}

/**
 * Check if any LLM backend is available.
 */
export function isLLMAvailable(): boolean {
  return detectBackend() !== 'none';
}

/**
 * Query the LLM with automatic backend detection and retry.
 *
 * Uses exponential backoff on transient failures (overloaded, rate limits, network errors).
 */
export async function queryLLM(
  prompt: string,
  options: QueryOptions = {},
  label = 'LLM query',
  maxRetries = 2,
): Promise<string> {
  const backend = detectBackend();

  if (backend === 'none') {
    throw new Error(
      'No LLM credentials found. Set either CLAUDE_CODE_OAUTH_TOKEN (via Claude Code) ' +
      'or ANTHROPIC_API_KEY (in .env.local) to enable AI features.',
    );
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (backend === 'agent-sdk') {
        return await queryViaAgentSDK(prompt, options);
      } else {
        return await queryViaAnthropicAPI(prompt, options);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const isRetryable =
        msg.includes('overloaded') ||
        msg.includes('529') ||
        msg.includes('rate_limit') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT');
      if (!isRetryable || attempt >= maxRetries) throw lastError;
      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
      console.warn(`${label} attempt ${attempt + 1} failed (${msg}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('Query failed after retries');
}

/**
 * Query via Claude Agent SDK (requires CLAUDE_CODE_OAUTH_TOKEN).
 */
async function queryViaAgentSDK(prompt: string, options: QueryOptions): Promise<string> {
  // Dynamic import to avoid loading when not needed
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  const queryOptions: Record<string, unknown> = {};
  if (options.systemPrompt) queryOptions.systemPrompt = options.systemPrompt;

  let answer = '';
  for await (const message of query({ prompt, options: queryOptions })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block && block.text) {
          answer += block.text;
        }
      }
    }
  }
  return answer.trim();
}

/**
 * Query via Anthropic API directly (requires ANTHROPIC_API_KEY).
 */
async function queryViaAnthropicAPI(prompt: string, options: QueryOptions): Promise<string> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 4096,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  let answer = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      answer += block.text;
    }
  }
  return answer.trim();
}
