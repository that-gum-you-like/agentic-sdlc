# LLM Provider Adapter Interface

Every LLM provider adapter MUST export these named functions with the exact signatures below.

## Methods

### `complete(prompt: string, options?: object): Promise<{ text: string, tokensUsed: number }>`
Send a completion request to the LLM.
- `options.model` — model ID to use (e.g., `claude-sonnet-4-6`)
- `options.maxTokens` — max tokens in response
- `options.temperature` — sampling temperature
- `options.system` — system prompt
- Returns response text and token count

### `estimateTokens(text: string): number`
Estimate token count for a text string.
- Uses provider-specific tokenization or a reasonable approximation (chars/4 as fallback)

### `checkAvailability(model: string): Promise<{ available: boolean, remainingTokens: number | null }>`
Check if a model is currently available and estimate remaining budget.
- `available` — whether the model API is reachable and the key is valid
- `remainingTokens` — remaining daily budget from cost-tracker, or `null` if unknown

### `getModelInfo(model: string): { provider: string, costPer1kInput: number, costPer1kOutput: number, contextWindow: number }`
Return static metadata about a model.
- Cost in USD per 1,000 tokens
- Context window size in tokens

### `listModels(): string[]`
List all model IDs supported by this provider.

## Adapter File Convention

Each adapter is a single `.mjs` file in `agents/adapters/llm/`:
- `anthropic.mjs` — Claude models via Anthropic API (`ANTHROPIC_API_KEY`)
- `groq.mjs` — Groq-hosted models (`GROQ_API_KEY`)
- `ollama.mjs` — Local models via Ollama HTTP API (`http://localhost:11434`)

Loaded dynamically by `agents/adapters/load-adapter.mjs` based on `project.json` config.
