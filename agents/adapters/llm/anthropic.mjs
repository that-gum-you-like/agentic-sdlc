/**
 * Anthropic LLM adapter — Claude models via Anthropic API.
 * Requires ANTHROPIC_API_KEY environment variable.
 */

const MODELS = {
  'claude-opus-4-6': { costPer1kInput: 0.015, costPer1kOutput: 0.075, contextWindow: 200000 },
  'claude-sonnet-4-6': { costPer1kInput: 0.003, costPer1kOutput: 0.015, contextWindow: 200000 },
  'claude-haiku-4-5': { costPer1kInput: 0.0008, costPer1kOutput: 0.004, contextWindow: 200000 },
  'claude-haiku-4-5-20251001': { costPer1kInput: 0.0008, costPer1kOutput: 0.004, contextWindow: 200000 },
};

// Shorthand aliases for backward compatibility
const ALIASES = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

function resolveModel(model) {
  return ALIASES[model] || model;
}

export async function complete(prompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const model = resolveModel(options.model || 'claude-sonnet-4-6');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 1,
      system: options.system || undefined,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    text: data.content?.[0]?.text || '',
    tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

export function estimateTokens(text) {
  // Anthropic models: ~4 chars per token is a reasonable estimate
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return {
    available: !!apiKey,
    remainingTokens: null, // Budget tracked by cost-tracker, not API-level
  };
}

export function getModelInfo(model) {
  const resolved = resolveModel(model);
  const info = MODELS[resolved];
  if (!info) return { provider: 'anthropic', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return { provider: 'anthropic', ...info };
}

export function listModels() {
  return Object.keys(MODELS);
}
