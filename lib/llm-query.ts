/**
 * LLM Query Abstraction Layer — Multi-Provider
 *
 * Supports any model via Vercel AI SDK provider strings: "anthropic/claude-sonnet-4.6",
 * "openai/gpt-5.4", "google/gemini-2.5-pro", etc.
 *
 * Auto-detects available providers from environment variables:
 * - ANTHROPIC_API_KEY → Anthropic models
 * - OPENAI_API_KEY → OpenAI models
 * - GOOGLE_GENERATIVE_AI_API_KEY → Google models
 * - CLAUDE_CODE_OAUTH_TOKEN → Claude Agent SDK (legacy, still supported)
 *
 * Falls back gracefully: if a specific provider key is missing, uses whatever is available.
 */

import { generateText, streamText, type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Default models per provider (used when agent specifies provider but not model)
const PROVIDER_DEFAULTS: Record<string, string> = {
  anthropic: 'claude-sonnet-4.6',
  openai: 'gpt-5.4',
  google: 'gemini-2.5-pro',
};

export type QueryOptions = {
  systemPrompt?: string;
  maxTokens?: number;
  model?: string; // "provider/model" format, e.g. "anthropic/claude-opus-4.6"
};

/** Structured error types for LLM failures — callers can display actionable guidance. */
export type LLMErrorType = 'auth_failure' | 'rate_limit' | 'model_error' | 'timeout' | 'no_provider' | 'unknown';

export class LLMError extends Error {
  type: LLMErrorType;
  constructor(type: LLMErrorType, message: string) {
    super(message);
    this.name = 'LLMError';
    this.type = type;
  }
}

/** Classify a raw error into a structured LLMError. */
function classifyError(err: Error): LLMError {
  const msg = err.message.toLowerCase();
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') ||
      msg.includes('authentication') || msg.includes('invalid api key') ||
      msg.includes('not found') || msg.includes('invalid_api_key')) {
    return new LLMError('auth_failure', `Authentication failed: ${err.message}. Check your API key in Settings.`);
  }
  if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('overloaded') || msg.includes('529')) {
    return new LLMError('rate_limit', `Rate limited: ${err.message}. Wait a moment and try again.`);
  }
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('econnrefused')) {
    return new LLMError('timeout', `Connection failed: ${err.message}. Check your network and try again.`);
  }
  if (msg.includes('model') || msg.includes('does not exist') || msg.includes('not supported')) {
    return new LLMError('model_error', `Model error: ${err.message}. Check your model configuration.`);
  }
  return new LLMError('unknown', err.message);
}

/**
 * Detect which providers are available based on env vars.
 */
export function detectProviders(): Record<string, boolean> {
  return {
    anthropic: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN),
    openai: !!process.env.OPENAI_API_KEY,
    google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    'agent-sdk': !!process.env.CLAUDE_CODE_OAUTH_TOKEN,
  };
}

/**
 * Check if any LLM backend is available.
 */
export function isLLMAvailable(): boolean {
  const providers = detectProviders();
  return Object.values(providers).some(Boolean);
}

/**
 * For backward compat — returns the legacy backend type.
 */
export function detectBackend(): 'agent-sdk' | 'anthropic-api' | 'ai-sdk' | 'none' {
  if (process.env.ANTHROPIC_API_KEY) return 'ai-sdk';
  if (process.env.OPENAI_API_KEY) return 'ai-sdk';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'ai-sdk';
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return 'agent-sdk';
  return 'none';
}

/**
 * Resolve a model string to a Vercel AI SDK LanguageModel.
 *
 * Accepts:
 * - "anthropic/claude-sonnet-4.6" → Anthropic provider with specific model
 * - "openai/gpt-5.4" → OpenAI provider
 * - "google/gemini-2.5-pro" → Google provider
 * - "opus" / "sonnet" / "haiku" → Anthropic shorthand (from agent frontmatter)
 * - undefined → best available default
 */
export function resolveModel(modelStr?: string): LanguageModel {
  // Parse provider/model format
  let provider: string;
  let modelId: string;

  if (!modelStr) {
    // No model specified — use best available
    const providers = detectProviders();
    if (providers.anthropic) {
      provider = 'anthropic';
      modelId = PROVIDER_DEFAULTS.anthropic;
    } else if (providers.openai) {
      provider = 'openai';
      modelId = PROVIDER_DEFAULTS.openai;
    } else if (providers.google) {
      provider = 'google';
      modelId = PROVIDER_DEFAULTS.google;
    } else {
      throw new Error('No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.');
    }
  } else if (modelStr.includes('/')) {
    // Full "provider/model" format
    const parts = modelStr.split('/');
    provider = parts[0];
    modelId = parts.slice(1).join('/');
  } else {
    // Shorthand: "opus", "sonnet", "haiku", or bare model name
    const shorthandMap: Record<string, string> = {
      opus: 'claude-opus-4.6',
      sonnet: 'claude-sonnet-4.6',
      haiku: 'claude-haiku-3.5',
    };
    provider = 'anthropic';
    modelId = shorthandMap[modelStr.toLowerCase()] ?? modelStr;
  }

  // Create provider instance and return model
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({});
      return anthropic(modelId);
    }
    case 'openai': {
      const openai = createOpenAI({});
      return openai(modelId);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({});
      return google(modelId);
    }
    default:
      throw new Error(`Unknown provider: ${provider}. Supported: anthropic, openai, google`);
  }
}

/**
 * Query the LLM with automatic provider detection and retry.
 */
export async function queryLLM(
  prompt: string,
  options: QueryOptions = {},
  label = 'LLM query',
  maxRetries = 2,
): Promise<string> {
  const backend = detectBackend();

  if (backend === 'none') {
    throw new LLMError(
      'no_provider',
      'No LLM credentials found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in Settings.',
    );
  }

  let lastError: LLMError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (backend === 'agent-sdk' && !options.model) {
        // Legacy path: use Claude Agent SDK when no specific model requested and only OAuth token available
        return await queryViaAgentSDK(prompt, options);
      } else {
        // AI SDK path: supports any provider
        return await queryViaAISDK(prompt, options);
      }
    } catch (err) {
      const raw = err instanceof Error ? err : new Error(String(err));
      lastError = raw instanceof LLMError ? raw : classifyError(raw);
      const isRetryable = lastError.type === 'rate_limit' || lastError.type === 'timeout';
      if (!isRetryable || attempt >= maxRetries) throw lastError;
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.warn(`${label} attempt ${attempt + 1} failed (${lastError.type}: ${lastError.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new LLMError('unknown', 'Query failed after retries');
}

/**
 * Query via Vercel AI SDK — supports any provider.
 */
async function queryViaAISDK(prompt: string, options: QueryOptions): Promise<string> {
  const model = resolveModel(options.model);

  const result = await generateText({
    model,
    maxOutputTokens: options.maxTokens ?? 4096,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  return result.text.trim();
}

/**
 * Query via Claude Agent SDK (legacy — requires CLAUDE_CODE_OAUTH_TOKEN).
 * Still needed for tool-using queries that leverage Claude Code's tool system.
 */
async function queryViaAgentSDK(prompt: string, options: QueryOptions): Promise<string> {
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
 * Stream a response from the LLM. Returns an async iterable of text chunks.
 */
export async function streamLLM(
  prompt: string,
  options: QueryOptions = {},
): Promise<AsyncIterable<string>> {
  const model = resolveModel(options.model);

  const result = streamText({
    model,
    maxOutputTokens: options.maxTokens ?? 4096,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  return result.textStream;
}
