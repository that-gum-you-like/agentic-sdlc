/**
 * Groq LLM adapter — Groq-hosted models via Groq API.
 * Requires GROQ_API_KEY environment variable.
 */

const MODELS = {
  'llama-3.3-70b-versatile': { costPer1kInput: 0.00059, costPer1kOutput: 0.00079, contextWindow: 128000 },
  'llama-3.1-8b-instant': { costPer1kInput: 0.00005, costPer1kOutput: 0.00008, contextWindow: 128000 },
  'mixtral-8x7b-32768': { costPer1kInput: 0.00024, costPer1kOutput: 0.00024, contextWindow: 32768 },
  'whisper-large-v3': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 },
};

export async function complete(prompt, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const model = options.model || 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
  });

  if (!res.ok) throw new Error(`Groq API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    text: data.choices?.[0]?.message?.content || '',
    tokensUsed: (data.usage?.total_tokens || 0),
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  const apiKey = process.env.GROQ_API_KEY;
  return {
    available: !!apiKey,
    remainingTokens: null,
  };
}

export function getModelInfo(model) {
  const info = MODELS[model];
  if (!info) return { provider: 'groq', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return { provider: 'groq', ...info };
}

export function listModels() {
  return Object.keys(MODELS);
}
