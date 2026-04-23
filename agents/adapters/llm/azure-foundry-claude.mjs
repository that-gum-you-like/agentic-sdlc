/**
 * Azure Foundry (Claude) LLM adapter — Anthropic Claude models deployed in
 * Microsoft Foundry via the Anthropic Messages API.
 *
 * Endpoint: https://{resource}.services.ai.azure.com/anthropic/v1/messages
 * Auth:     x-api-key header (simple) or Bearer token (Entra ID)
 * Schema:   Native Anthropic Messages API (NOT OpenAI chat/completions)
 * Regions:  East US 2 or Sweden Central (as of April 2026)
 * Access:   Enterprise / MCA-E Azure subscriptions only
 *
 * Env vars:
 *   AZURE_FOUNDRY_ENDPOINT       https://<resource>.services.ai.azure.com  (required)
 *   AZURE_FOUNDRY_API_KEY        resource key                              (for x-api-key auth)
 *   AZURE_FOUNDRY_AUTH_TOKEN     Entra Bearer token                        (alternative)
 *   ANTHROPIC_VERSION            Anthropic API version header              (default 2023-06-01)
 *
 * `options.model` must be your DEPLOYMENT NAME. Foundry maps that to the
 * underlying Claude model behind the scenes.
 */

const MODELS = {
  'claude-opus-4-7': { costPer1kInput: 0.015, costPer1kOutput: 0.075, contextWindow: 1000000 },
  'claude-opus-4-6': { costPer1kInput: 0.015, costPer1kOutput: 0.075, contextWindow: 1000000 },
  'claude-opus-4-5': { costPer1kInput: 0.015, costPer1kOutput: 0.075, contextWindow: 200000 },
  'claude-opus-4-1': { costPer1kInput: 0.015, costPer1kOutput: 0.075, contextWindow: 200000 },
  'claude-sonnet-4-6': { costPer1kInput: 0.003, costPer1kOutput: 0.015, contextWindow: 1000000 },
  'claude-sonnet-4-5': { costPer1kInput: 0.003, costPer1kOutput: 0.015, contextWindow: 200000 },
  'claude-haiku-4-5': { costPer1kInput: 0.0008, costPer1kOutput: 0.004, contextWindow: 200000 },
};

const REASONING_MODELS = new Set([
  'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5',
  'claude-sonnet-4-6', 'claude-sonnet-4-5',
]);

function normaliseEndpoint(raw) {
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function resolveFamily(deploymentName, deploymentMap) {
  if (MODELS[deploymentName]) return deploymentName;
  if (deploymentMap && deploymentMap[deploymentName] && MODELS[deploymentMap[deploymentName]]) {
    return deploymentMap[deploymentName];
  }
  return null;
}

export async function complete(prompt, options = {}) {
  const endpoint = normaliseEndpoint(process.env.AZURE_FOUNDRY_ENDPOINT);
  if (!endpoint) throw new Error('AZURE_FOUNDRY_ENDPOINT not set (expected https://<resource>.services.ai.azure.com)');

  const apiKey = process.env.AZURE_FOUNDRY_API_KEY;
  const bearerToken = process.env.AZURE_FOUNDRY_AUTH_TOKEN;
  if (!apiKey && !bearerToken) {
    throw new Error('Azure Foundry requires AZURE_FOUNDRY_API_KEY or AZURE_FOUNDRY_AUTH_TOKEN');
  }

  const deploymentName = options.model;
  if (!deploymentName) throw new Error('Azure Foundry requires options.model (deployment name)');

  const url = `${endpoint}/anthropic/v1/messages`;

  const body = {
    model: deploymentName,
    max_tokens: options.maxTokens || 4096,
    messages: [{ role: 'user', content: prompt }],
  };

  if (options.system) body.system = options.system;
  if (options.temperature !== undefined) body.temperature = options.temperature;

  if (options.thinking) {
    body.thinking = typeof options.thinking === 'string'
      ? { type: options.thinking }
      : options.thinking;
  }
  if (options.effort) {
    body.output_config = { effort: options.effort };
  }

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
  };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  } else {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) throw new Error(`Azure Foundry (Claude) ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const text = (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return {
    text,
    tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
    stopReason: data.stop_reason,
  };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export async function checkAvailability() {
  const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
  const hasAuth = !!(process.env.AZURE_FOUNDRY_API_KEY || process.env.AZURE_FOUNDRY_AUTH_TOKEN);
  return { available: !!endpoint && hasAuth, remainingTokens: null };
}

export function getModelInfo(model) {
  const family = resolveFamily(model) || model;
  const info = MODELS[family];
  if (!info) return { provider: 'azure-foundry-claude', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return {
    provider: 'azure-foundry-claude',
    family,
    supportsThinking: REASONING_MODELS.has(family),
    ...info,
  };
}

export function listModels() {
  return Object.keys(MODELS);
}
