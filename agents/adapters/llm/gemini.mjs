/**
 * Google Gemini LLM adapter — Gemini models via Google AI Studio.
 * Requires GEMINI_API_KEY environment variable (free, no credit card).
 *
 * Free tier (2026): gemini-2.5-flash at 250 req/day, 250K TPM.
 * Uses REST API at generativelanguage.googleapis.com.
 */

const MODELS = {
  'gemini-2.5-flash': { costPer1kInput: 0.00015, costPer1kOutput: 0.0006, contextWindow: 1000000, free: true },
  'gemini-2.5-flash-lite': { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 1000000, free: true },
  'gemini-2.5-pro': { costPer1kInput: 0.00125, costPer1kOutput: 0.01, contextWindow: 1000000, free: false },
};

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function complete(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const model = options.model || 'gemini-2.5-flash';
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 1,
    },
  };

  if (options.system) {
    body.systemInstruction = { parts: [{ text: options.system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata || {};

  return {
    text,
    tokensUsed: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
  };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  const apiKey = process.env.GEMINI_API_KEY;
  return {
    available: !!apiKey,
    remainingTokens: null,
  };
}

export function getModelInfo(model) {
  const info = MODELS[model];
  if (!info) return { provider: 'gemini', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return { provider: 'gemini', ...info };
}

export function listModels() {
  return Object.keys(MODELS);
}
