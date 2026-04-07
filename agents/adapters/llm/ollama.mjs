/**
 * Ollama LLM adapter — local models via Ollama HTTP API.
 * Default endpoint: http://localhost:11434
 * Set OLLAMA_HOST to override.
 */

const BASE_URL = process.env.OLLAMA_HOST || 'http://localhost:11434';

export async function complete(prompt, options = {}) {
  const model = options.model || 'llama3.2';
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        ...(options.system ? [{ role: 'system', content: options.system }] : []),
        { role: 'user', content: prompt },
      ],
      stream: false,
      options: {
        num_predict: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
      },
    }),
  });

  if (!res.ok) throw new Error(`Ollama API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    text: data.message?.content || '',
    tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    inputTokens: data.prompt_eval_count || 0,
    outputTokens: data.eval_count || 0,
  };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { available: false, remainingTokens: null };
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    return {
      available: !model || models.some(m => m.startsWith(model)),
      remainingTokens: null, // Local models have no token budget
    };
  } catch {
    return { available: false, remainingTokens: null };
  }
}

export function getModelInfo(model) {
  // Local models have zero API cost
  return { provider: 'ollama', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
}

export async function listModels() {
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}
