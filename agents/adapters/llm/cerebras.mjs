/**
 * Cerebras LLM adapter — Cerebras Inference (OpenAI-compatible API).
 * Requires CEREBRAS_API_KEY environment variable (free tier: 1M tokens/day, no CC).
 *
 * Uses the OpenAI-compatible endpoint at api.cerebras.ai.
 * Known for fastest inference speeds available.
 */

const MODELS = {
  'llama3.1-8b': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 8192, free: true },
  'llama-4-scout-17b': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 131072, free: true },
};

export async function complete(prompt, options = {}) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('CEREBRAS_API_KEY not set');

  const model = options.model || 'llama3.1-8b';
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 1,
      messages: [
        ...(options.system ? [{ role: 'system', content: options.system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Cerebras API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    text: data.choices?.[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  return {
    available: !!apiKey,
    remainingTokens: null,
  };
}

export function getModelInfo(model) {
  const info = MODELS[model];
  if (!info) return { provider: 'cerebras', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return { provider: 'cerebras', ...info };
}

export function listModels() {
  return Object.keys(MODELS);
}
