## ADDED Requirements

### Requirement: Orchestration adapter interface
The framework SHALL define a standard orchestration adapter interface with methods: `createTask`, `updateTaskStatus`, `queryTasks`, `claimTask`, `getAgentInbox`, `syncConfig`. All SDLC scripts that perform orchestration operations MUST call through this interface, never directly to a platform API.

#### Scenario: File-based adapter works without external dependencies
- **WHEN** `project.json` has `orchestration.adapter` set to `"file-based"` or the field is absent
- **THEN** all orchestration operations read/write `tasks/queue/*.json` and `tasks/completed/*.json` directly with zero network calls and zero external dependencies

#### Scenario: Paperclip adapter routes to Paperclip API
- **WHEN** `project.json` has `orchestration.adapter` set to `"paperclip"` and `.paperclip.env` exists
- **THEN** orchestration operations call the Paperclip REST API using credentials from `.paperclip.env`
- **AND** `paperclip-sync.mjs` continues to function as the CLI entry point for Paperclip sync

#### Scenario: Claude-code-native adapter spawns subagents
- **WHEN** `project.json` has `orchestration.adapter` set to `"claude-code-native"`
- **THEN** task assignment spawns Claude Code Agent tool subagents with task context as the prompt

#### Scenario: Unknown adapter fails fast
- **WHEN** `project.json` references an adapter name that has no corresponding implementation file
- **THEN** the system SHALL throw an error with a clear message naming the missing adapter and the expected file path

### Requirement: LLM provider adapter interface
The framework SHALL define a standard LLM provider adapter interface with methods: `complete`, `estimateTokens`, `checkAvailability`, `getModelInfo`, `listModels`. Agent model assignment in `budget.json` SHALL use full model IDs and provider names, not shorthand.

#### Scenario: Anthropic provider routes to Claude API
- **WHEN** an agent's `provider` in `budget.json` is `"anthropic"`
- **THEN** LLM calls route to the Anthropic API using `ANTHROPIC_API_KEY`

#### Scenario: Groq provider routes to Groq API
- **WHEN** an agent's `provider` in `budget.json` is `"groq"`
- **THEN** LLM calls route to the Groq API using `GROQ_API_KEY`

#### Scenario: Ollama provider routes to local Ollama instance
- **WHEN** an agent's `provider` in `budget.json` is `"ollama"`
- **THEN** LLM calls route to the local Ollama HTTP API (default `http://localhost:11434`)

#### Scenario: Provider availability check
- **WHEN** `checkAvailability(model)` is called
- **THEN** the adapter SHALL return `{ available: bool, remainingTokens: number }` reflecting current budget and API reachability

### Requirement: Dynamic adapter loading
The framework SHALL provide `load-adapter.mjs` that reads `project.json` and returns the configured adapter module. Scripts SHALL import adapters via `load-adapter.mjs`, never by direct file path.

#### Scenario: Default adapter when config is absent
- **WHEN** `project.json` does not contain `orchestration.adapter`
- **THEN** `load-adapter.mjs` SHALL return the `file-based` orchestration adapter

#### Scenario: Setup.mjs offers adapter selection
- **WHEN** `setup.mjs` runs for a new project
- **THEN** it SHALL prompt the user to choose an orchestration adapter (file-based, paperclip, claude-code-native) and LLM providers (anthropic, groq, ollama)
- **AND** store the selections in `project.json`

### Requirement: Backward-compatible budget.json
The `budget.json` schema SHALL accept new fields (`provider`, `fallbackChain`, `activeModel`, `modelPreferences`) while continuing to work with existing files that lack these fields. Missing fields SHALL use sensible defaults: `provider` defaults to `"anthropic"`, `fallbackChain` defaults to `[model]`, `activeModel` defaults to `null`, `modelPreferences` defaults to `{}`.

#### Scenario: Old budget.json still works
- **WHEN** an existing `budget.json` contains `{ "roy": { "model": "sonnet", "dailyTokens": 100000 } }`
- **THEN** the system SHALL normalize `model` to the full model ID and apply defaults for all missing fields without error

#### Scenario: New budget.json with fallback chain
- **WHEN** `budget.json` contains `"fallbackChain": ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"]`
- **THEN** the model-manager agent SHALL use this chain when performing budget-driven model swaps
