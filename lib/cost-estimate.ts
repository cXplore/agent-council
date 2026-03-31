/**
 * Rough cost estimation for meetings.
 *
 * NOTE: These are approximate prices as of early 2026. Prices change frequently.
 * This is for user guidance, not billing. Marked as rough estimates in the UI.
 *
 * Sources:
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * - OpenAI: https://openai.com/api/pricing/
 * - Google: https://ai.google.dev/pricing
 */

// Prices per million tokens (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-opus-4.6': { input: 5.0, output: 25.0 },
  'claude-sonnet-4.6': { input: 3.0, output: 15.0 },
  'claude-haiku-3.5': { input: 1.0, output: 5.0 },
  // OpenAI
  'gpt-5.4': { input: 2.5, output: 15.0 },
  'gpt-5.2': { input: 1.75, output: 14.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  // Google
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

// Shorthand aliases
const ALIASES: Record<string, string> = {
  opus: 'claude-opus-4.6',
  sonnet: 'claude-sonnet-4.6',
  haiku: 'claude-haiku-3.5',
};

// Average tokens per agent response by profile
const AVG_OUTPUT_TOKENS: Record<string, number> = {
  lean: 500,
  standard: 1000,
  deep: 2000,
};

// Average input tokens (system prompt + context + topic)
const AVG_INPUT_TOKENS = 3000;

export interface CostEstimate {
  /** Estimated cost in USD */
  cost: number;
  /** Human-readable string like "~$0.15" */
  display: string;
  /** Whether this is a known model (false = couldn't estimate) */
  known: boolean;
}

/**
 * Estimate the cost of a meeting.
 */
export function estimateMeetingCost(
  agentModels: (string | undefined)[],
  rounds: number,
  profile: string = 'standard',
): CostEstimate {
  const outputTokens = AVG_OUTPUT_TOKENS[profile] ?? 1000;
  let totalCost = 0;
  let allKnown = true;

  for (const rawModel of agentModels) {
    const modelKey = resolveModelKey(rawModel);
    const pricing = modelKey ? PRICING[modelKey] : null;

    if (!pricing) {
      allKnown = false;
      // Use sonnet pricing as fallback
      const fallback = PRICING['claude-sonnet-4.6'];
      totalCost += (AVG_INPUT_TOKENS * fallback.input + outputTokens * fallback.output) / 1_000_000;
    } else {
      totalCost += (AVG_INPUT_TOKENS * pricing.input + outputTokens * pricing.output) / 1_000_000;
    }
  }

  // Multiply by rounds
  totalCost *= rounds;

  // Add ~10% for outcome extraction (1 extra LLM call on multi-round meetings)
  if (rounds >= 2) {
    totalCost *= 1.1;
  }

  return {
    cost: totalCost,
    display: totalCost < 0.01 ? '<$0.01' : `~$${totalCost.toFixed(2)}`,
    known: allKnown,
  };
}

function resolveModelKey(model?: string): string | null {
  if (!model) return 'claude-sonnet-4.6'; // default
  // Check aliases
  if (ALIASES[model.toLowerCase()]) return ALIASES[model.toLowerCase()];
  // Check if it's a provider/model format
  if (model.includes('/')) {
    const modelId = model.split('/').slice(1).join('/');
    if (PRICING[modelId]) return modelId;
  }
  // Check direct match
  if (PRICING[model]) return model;
  return null;
}
