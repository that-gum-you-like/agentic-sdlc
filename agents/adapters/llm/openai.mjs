/**
 * OpenAI LLM adapter — GPT models via OpenAI API.
 * Requires OPENAI_API_KEY environment variable.
 *
 * Uses the /v1/chat/completions endpoint (same as Groq adapter).
 */

const MODELS = {
  'gpt-4o': { costPer1kInput: 0.0025, costPer1kOutput: 0.01, contextWindow: 128000 },
  'gpt-4o-mini': { costPer1kInput: 0.00015, costPer1kOutput: 0.0006, contextWindow: 128000 },
  'gpt-4-turbo': { costPer1kInput: 0.01, costPer1kOutput: 0.03, contextWindow: 128000 },
  'gpt-4': { costPer1kInput: 0.03, costPer1kOutput: 0.06, contextWindow: 8192 },
  'gpt-3.5-turbo': { costPer1kInput: 0.0005, costPer1kOutput: 0.0015, contextWindow: 16385 },
  'o1': { costPer1kInput: 0.015, costPer1kOutput: 0.06, contextWindow: 200000 },
  'o1-mini': { costPer1kInput: 0.003, costPer1kOutput: 0.012, contextWindow: 128000 },
  'o3-mini': { costPer1kInput: 0.0011, costPer1kOutput: 0.0044, contextWindow: 200000 },
};

// Shorthand aliases
const ALIASES = {
  'gpt4': 'gpt-4o',
  'gpt4o': 'gpt-4o',
  'gpt4-mini': 'gpt-4o-mini',
  'gpt35': 'gpt-3.5-turbo',
};

function resolveModel(model) {
  return ALIASES[model] || model;
}

export async function complete(prompt, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = resolveModel(options.model || 'gpt-4o');

  // o1/o3 models don't support system messages or temperature
  const isReasoningModel = model.startsWith('o1') || model.startsWith('o3');

  const messages = [];
  if (options.system && !isReasoningModel) {
    messages.push({ role: 'system', content: options.system });
  } else if (options.system && isReasoningModel) {
    // Prepend system content to user message for reasoning models
    messages.push({ role: 'user', content: `${options.system}\n\n${prompt}` });
  }
  if (!isReasoningModel || !options.system) {
    messages.push({ role: 'user', content: prompt });
  }

  const body = {
    model,
    messages,
  };

  if (!isReasoningModel) {
    body.max_tokens = options.maxTokens || 4096;
    body.temperature = options.temperature ?? 1;
  } else {
    body.max_completion_tokens = options.maxTokens || 4096;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    text: data.choices?.[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

export function estimateTokens(text) {
  // GPT models: ~4 chars per token is a reasonable estimate
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    available: !!apiKey,
    remainingTokens: null,
  };
}

export function getModelInfo(model) {
  const resolved = resolveModel(model);
  const info = MODELS[resolved];
  if (!info) return { provider: 'openai', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return { provider: 'openai', ...info };
}

export function listModels() {
  return Object.keys(MODELS);
}
