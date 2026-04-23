/**
 * Azure OpenAI LLM adapter — OpenAI models (GPT-4o, o-series) deployed in
 * Azure OpenAI / Microsoft Foundry.
 *
 * Endpoint: https://{resource}.openai.azure.com/openai/v1/chat/completions
 * Auth:     api-key header (simple) or Bearer token (Entra ID)
 * Schema:   OpenAI chat/completions (drop-in compatible with openai.mjs body)
 *
 * Env vars:
 *   AZURE_OPENAI_ENDPOINT        https://<resource>.openai.azure.com   (required)
 *   AZURE_OPENAI_API_KEY         resource key                           (for api-key auth)
 *   AZURE_OPENAI_AUTH_TOKEN      Entra Bearer token                     (alternative to API key)
 *   AZURE_OPENAI_API_VERSION     override api-version query param       (optional, defaults v1)
 *
 * Models are referenced by DEPLOYMENT NAME, not model id. In Azure you deploy
 * `gpt-4o` as e.g. `gpt4o-prod`, and you call `model: "gpt4o-prod"`.
 * Set a deployment-name → model-family mapping in project.json to get cost
 * lookups right:
 *   "llm": { "azureOpenAI": { "deployments": { "gpt4o-prod": "gpt-4o" } } }
 */

const MODEL_FAMILIES = {
  'gpt-4o': { costPer1kInput: 0.0025, costPer1kOutput: 0.01, contextWindow: 128000 },
  'gpt-4o-mini': { costPer1kInput: 0.00015, costPer1kOutput: 0.0006, contextWindow: 128000 },
  'gpt-4-turbo': { costPer1kInput: 0.01, costPer1kOutput: 0.03, contextWindow: 128000 },
  'gpt-4': { costPer1kInput: 0.03, costPer1kOutput: 0.06, contextWindow: 8192 },
  'o1': { costPer1kInput: 0.015, costPer1kOutput: 0.06, contextWindow: 200000 },
  'o1-mini': { costPer1kInput: 0.003, costPer1kOutput: 0.012, contextWindow: 128000 },
  'o3-mini': { costPer1kInput: 0.0011, costPer1kOutput: 0.0044, contextWindow: 200000 },
  'o3': { costPer1kInput: 0.002, costPer1kOutput: 0.008, contextWindow: 200000 },
};

function normaliseEndpoint(raw) {
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function resolveFamily(model, deploymentMap) {
  if (MODEL_FAMILIES[model]) return model;
  if (deploymentMap && deploymentMap[model] && MODEL_FAMILIES[deploymentMap[model]]) {
    return deploymentMap[model];
  }
  return null;
}

export async function complete(prompt, options = {}) {
  const endpoint = normaliseEndpoint(process.env.AZURE_OPENAI_ENDPOINT);
  if (!endpoint) throw new Error('AZURE_OPENAI_ENDPOINT not set (expected https://<resource>.openai.azure.com)');

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const bearerToken = process.env.AZURE_OPENAI_AUTH_TOKEN;
  if (!apiKey && !bearerToken) {
    throw new Error('Azure OpenAI requires AZURE_OPENAI_API_KEY or AZURE_OPENAI_AUTH_TOKEN');
  }

  const deploymentName = options.model;
  if (!deploymentName) throw new Error('Azure OpenAI requires options.model (deployment name)');

  const family = resolveFamily(deploymentName, options.deploymentMap) || deploymentName;
  const isReasoningModel = /^o[13]/.test(family);

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || 'v1';
  const url = `${endpoint}/openai/v1/chat/completions${apiVersion === 'v1' ? '' : `?api-version=${apiVersion}`}`;

  const messages = [];
  if (options.system && !isReasoningModel) {
    messages.push({ role: 'system', content: options.system });
  } else if (options.system && isReasoningModel) {
    messages.push({ role: 'user', content: `${options.system}\n\n${prompt}` });
  }
  if (!isReasoningModel || !options.system) {
    messages.push({ role: 'user', content: prompt });
  }

  const body = { model: deploymentName, messages };
  if (isReasoningModel) {
    body.max_completion_tokens = options.maxTokens || 4096;
  } else {
    body.max_tokens = options.maxTokens || 4096;
    body.temperature = options.temperature ?? 1;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  } else {
    headers['api-key'] = apiKey;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`Azure OpenAI ${res.status}: ${await res.text()}`);
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

export async function checkAvailability() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const hasAuth = !!(process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_AUTH_TOKEN);
  return { available: !!endpoint && hasAuth, remainingTokens: null };
}

export function getModelInfo(model) {
  const family = resolveFamily(model) || model;
  const info = MODEL_FAMILIES[family];
  if (!info) return { provider: 'azure-openai', costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 0 };
  return { provider: 'azure-openai', family, ...info };
}

export function listModels() {
  return Object.keys(MODEL_FAMILIES);
}
