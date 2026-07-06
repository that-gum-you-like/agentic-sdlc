/**
 * OpenRouter LLM adapter — routes to many providers through one OpenAI-compatible
 * API. Requires OPENROUTER_API_KEY. Privacy-first posture: the curated catalog
 * below is affordable, coding-capable, and **excludes OpenAI** — pass any other
 * OpenRouter model id explicitly via options.model if you need it.
 *
 * This is the same OpenRouter account Hermes uses (the framework and Hermes share
 * OPENROUTER_API_KEY), so framework LLM calls draw on the same balance and the
 * same free→cheap ladder philosophy configured in ~/.hermes/config.yaml.
 */

// Curated affordable, coding-capable models (cost per 1K tokens). Free tiers
// first. No OpenAI. Costs are indicative — OpenRouter is the source of truth.
const MODELS = {
  // --- free ---
  'qwen/qwen3-coder:free': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 1048576 },
  'qwen/qwen3-next-80b-a3b-instruct:free': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 262144 },
  'cohere/north-mini-code:free': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 256000 },
  'meta-llama/llama-3.3-70b-instruct:free': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 131072 },
  // --- low-cost paid ---
  'qwen/qwen3-coder-30b-a3b-instruct': { costPer1kInput: 0.00007, costPer1kOutput: 0.00019, contextWindow: 131072 },
  'deepseek/deepseek-v4-flash': { costPer1kInput: 0.00009, costPer1kOutput: 0.00018, contextWindow: 1048576 },
  'qwen/qwen3-30b-a3b-instruct-2507': { costPer1kInput: 0.00005, costPer1kOutput: 0.00019, contextWindow: 131072 },
  'deepseek/deepseek-chat-v3.1': { costPer1kInput: 0.00021, costPer1kOutput: 0.00079, contextWindow: 163840 },
  'qwen/qwen3-coder': { costPer1kInput: 0.00022, costPer1kOutput: 0.00180, contextWindow: 1048576 },
};

const BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'qwen/qwen3-coder:free';

export async function complete(prompt, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const model = options.model || DEFAULT_MODEL;
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      // Optional attribution headers OpenRouter recommends (harmless if unused).
      'HTTP-Referer': 'https://github.com/that-gum-you-like/agentic-sdlc',
      'X-Title': 'agentic-sdlc',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 1,
      messages: [
        ...(options.system ? [{ role: 'system', content: options.system }] : []),
        { role: 'user', content: prompt },
      ],
      // OpenRouter falls back across upstream providers for a given model.
      // Prefer throughput/price; never silently upgrade to a pricier route.
      ...(options.models ? { models: options.models } : {}),
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    text: data.choices?.[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model: data.model || model,
  };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  return {
    available: !!process.env.OPENROUTER_API_KEY,
    remainingTokens: null,
  };
}

export function getModelInfo(model) {
  const info = MODELS[model];
  if (!info) return { provider: 'openrouter', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return { provider: 'openrouter', ...info };
}

export function listModels() {
  return Object.keys(MODELS);
}
