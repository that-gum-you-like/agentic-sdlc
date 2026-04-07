# Adapter Guide

The Agentic SDLC framework uses adapter interfaces to decouple core logic from specific orchestration platforms and LLM providers. Adapters are thin `.mjs` files that implement a fixed contract, loaded dynamically at runtime based on `project.json` configuration.

There are two adapter categories:

- **Orchestration adapters** (`agents/adapters/orchestration/`) -- task queue management and platform sync.
- **LLM provider adapters** (`agents/adapters/llm/`) -- model invocation and token estimation.

## Orchestration Adapter Interface

Every orchestration adapter must export 7 named functions. See `agents/adapters/orchestration/interface.md` for the full contract and task object shape.

| Method | Signature | Returns |
|--------|-----------|---------|
| `loadTasks` | `(tasksDir: string)` | `Task[]` -- all queue tasks, each with `_file` metadata |
| `saveTask` | `(tasksDir: string, task: object)` | `void` -- writes task using `task._file` as filename |
| `archiveTask` | `(tasksDir: string, completedDir: string, task: object)` | `void` -- moves task from queue to completed |
| `loadCompletedCount` | `(completedDir: string)` | `number` -- count of completed task files |
| `loadHumanTasks` | `(humanQueueDir: string)` | `Task[]` -- human tasks with `_file` metadata |
| `saveHumanTask` | `(humanQueueDir: string, task: object)` | `void` -- writes human task |
| `syncConfig` | `(sdlcConfig: object)` | `{ drift: object[] }` -- differences between SDLC config and platform |

The `syncConfig` method is a no-op for adapters that have no external platform (e.g., `file-based` returns empty drift). For platform-backed adapters like `paperclip`, it pushes SDLC agent configuration and reports drift.

**Queue-drainer now uses the orchestration adapter.** All task loading, saving, and archiving goes through `agents/adapters/orchestration/file-based.mjs` (the default adapter). The adapter produces identical behavior to the previous inline I/O — this is a refactor, not a behavior change.

## LLM Provider Adapter Interface

Every LLM adapter must export 5 named functions. See `agents/adapters/llm/interface.md` for the full contract.

| Method | Signature | Returns |
|--------|-----------|---------|
| `complete` | `(prompt: string, options?: object)` | `Promise<{ text: string, tokensUsed: number }>` |
| `estimateTokens` | `(text: string)` | `number` -- token count estimate |
| `checkAvailability` | `(model: string)` | `Promise<{ available: boolean, remainingTokens: number \| null }>` |
| `getModelInfo` | `(model: string)` | `{ provider, costPer1kInput, costPer1kOutput, contextWindow }` |
| `listModels` | `()` | `string[]` -- supported model IDs |

The `complete` method accepts an options object with `model`, `maxTokens`, `temperature`, and `system` fields.

## Creating a Custom Adapter

### 1. Create the adapter file

Add a new `.mjs` file in the appropriate directory:

```
agents/adapters/orchestration/my-platform.mjs   # for orchestration
agents/adapters/llm/my-provider.mjs             # for LLM
```

### 2. Export all interface methods

Every method from the interface must be a named export. Example skeleton for an LLM adapter:

```js
// agents/adapters/llm/my-provider.mjs

export async function complete(prompt, options = {}) {
  const { model, maxTokens, temperature, system } = options;
  // Call your provider API
  return { text: responseText, tokensUsed: count };
}

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export async function checkAvailability(model) {
  // Ping the API, check key validity
  return { available: true, remainingTokens: null };
}

export function getModelInfo(model) {
  return {
    provider: 'my-provider',
    costPer1kInput: 0.001,
    costPer1kOutput: 0.002,
    contextWindow: 128000,
  };
}

export function listModels() {
  return ['my-model-small', 'my-model-large'];
}
```

### 3. Register it in load-adapter.mjs

Open `agents/adapters/load-adapter.mjs` and add your adapter to the appropriate map:

```js
const LLM_ADAPTERS = {
  'anthropic': join(__dirname, 'llm', 'anthropic.mjs'),
  'groq': join(__dirname, 'llm', 'groq.mjs'),
  'ollama': join(__dirname, 'llm', 'ollama.mjs'),
  'my-provider': join(__dirname, 'llm', 'my-provider.mjs'),  // add this
};
```

For orchestration adapters, add to `ORCHESTRATION_ADAPTERS` instead.

### 4. Set it in project.json

Configure the project to use your adapter:

```json
{
  "orchestration": {
    "adapter": "my-platform"
  },
  "llm": {
    "defaultProvider": "my-provider"
  }
}
```

The `loadOrchestrationAdapter` and `loadLlmAdapter` functions in `load-adapter.mjs` read these keys and dynamically import the matching module.

## Shipped Adapters

### Orchestration

| Adapter | Key | Description |
|---------|-----|-------------|
| File-based | `file-based` | Default. Reads and writes task JSON files on the local filesystem. |
| Paperclip | `paperclip` | Syncs tasks and agent config with the Paperclip control plane REST API. |
| Claude Code Native | `claude-code-native` | Spawns Claude Code subagents for task execution. |

### LLM Providers

| Adapter | Key | Description |
|---------|-----|-------------|
| Anthropic | `anthropic` | Claude models via the Anthropic API (requires `ANTHROPIC_API_KEY`). |
| Groq | `groq` | Groq-hosted models via the Groq API (requires `GROQ_API_KEY`). |
| Ollama | `ollama` | Locally-hosted models via the Ollama HTTP API at `http://localhost:11434`. |

## Testing

To test a custom adapter, verify that every interface method exists and returns the correct shape.

A minimal test approach:

```js
import * as adapter from './agents/adapters/llm/my-provider.mjs';

// Verify all methods are exported
const required = ['complete', 'estimateTokens', 'checkAvailability', 'getModelInfo', 'listModels'];
for (const method of required) {
  assert(typeof adapter[method] === 'function', `Missing export: ${method}`);
}

// Verify return shapes
const result = await adapter.complete('Hello', { model: 'my-model-small' });
assert(typeof result.text === 'string');
assert(typeof result.tokensUsed === 'number');

const estimate = adapter.estimateTokens('test string');
assert(typeof estimate === 'number');

const availability = await adapter.checkAvailability('my-model-small');
assert(typeof availability.available === 'boolean');

const info = adapter.getModelInfo('my-model-small');
assert(typeof info.provider === 'string');
assert(typeof info.costPer1kInput === 'number');
assert(typeof info.contextWindow === 'number');

const models = adapter.listModels();
assert(Array.isArray(models));
```

For orchestration adapters, use a temporary directory for `tasksDir` and write/read task JSON files to confirm round-trip integrity. Verify that `loadTasks` returns objects with `_file` metadata and that `archiveTask` moves files between directories.
