/**
 * Dynamic adapter loader.
 *
 * Reads project.json for orchestration.adapter and llm.defaultProvider,
 * dynamically imports the matching adapter module.
 *
 * Usage:
 *   import { loadOrchestrationAdapter, loadLlmAdapter } from './adapters/load-adapter.mjs';
 *   const orch = await loadOrchestrationAdapter(config);
 *   const llm = await loadLlmAdapter(config, 'anthropic');
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ORCHESTRATION_ADAPTERS = {
  'file-based': join(__dirname, 'orchestration', 'file-based.mjs'),
  'paperclip': join(__dirname, 'orchestration', 'paperclip.mjs'),
  'claude-code-native': join(__dirname, 'orchestration', 'claude-code-native.mjs'),
};

const LLM_ADAPTERS = {
  'anthropic': join(__dirname, 'llm', 'anthropic.mjs'),
  'groq': join(__dirname, 'llm', 'groq.mjs'),
  'ollama': join(__dirname, 'llm', 'ollama.mjs'),
};

/**
 * Load the orchestration adapter based on project config.
 * @param {object} config - Project config from load-config.mjs
 * @returns {Promise<object>} Adapter module with loadTasks, saveTask, etc.
 */
export async function loadOrchestrationAdapter(config) {
  const adapterName = config?.orchestration?.adapter || 'file-based';
  const adapterPath = ORCHESTRATION_ADAPTERS[adapterName];

  if (!adapterPath) {
    const available = Object.keys(ORCHESTRATION_ADAPTERS).join(', ');
    throw new Error(
      `Unknown orchestration adapter "${adapterName}". ` +
      `Available: ${available}. ` +
      `Expected file: agents/adapters/orchestration/${adapterName}.mjs`
    );
  }

  return import(adapterPath);
}

/**
 * Load an LLM provider adapter.
 * @param {object} config - Project config from load-config.mjs
 * @param {string} [providerOverride] - Explicit provider name, overrides config default
 * @returns {Promise<object>} Adapter module with complete, estimateTokens, etc.
 */
export async function loadLlmAdapter(config, providerOverride) {
  const providerName = providerOverride || config?.llm?.defaultProvider || 'anthropic';
  const adapterPath = LLM_ADAPTERS[providerName];

  if (!adapterPath) {
    const available = Object.keys(LLM_ADAPTERS).join(', ');
    throw new Error(
      `Unknown LLM provider "${providerName}". ` +
      `Available: ${available}. ` +
      `Expected file: agents/adapters/llm/${providerName}.mjs`
    );
  }

  return import(adapterPath);
}

/**
 * List available orchestration adapter names.
 */
export function listOrchestrationAdapters() {
  return Object.keys(ORCHESTRATION_ADAPTERS);
}

/**
 * List available LLM provider adapter names.
 */
export function listLlmAdapters() {
  return Object.keys(LLM_ADAPTERS);
}
