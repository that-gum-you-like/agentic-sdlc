# Using Agentic SDLC with Cursor

This guide covers setting up the Agentic SDLC framework in a Cursor environment. The framework works with any LLM provider — Anthropic (Claude direct), OpenAI, Groq, Gemini, Cerebras, Ollama (local), Azure OpenAI, or Claude deployed in Microsoft Foundry.

## Prerequisites

- Node.js 18+
- Cursor IDE
- An API key for any supported LLM provider (or a Foundry/Azure OpenAI deployment — see below)
- Optional: `npm install -g openspec` (enables the OpenSpec workflow commands)

## How Cursor picks up framework rules

Two rule files are loaded automatically when you open a project that has this framework integrated:

1. **`.cursorrules`** (legacy, always-loaded) — top-level rules file. Contains OpenSpec workflow commands and framework essentials.
2. **`.cursor/rules/*.mdc`** (modern, project rules) — three files ship with the framework:
   - `agentic-sdlc.mdc` — always-applied core rules (micro cycle, tests, memory)
   - `openspec-workflow.mdc` — auto-attached when OpenSpec is mentioned
   - `azure-foundry.mdc` — auto-attached when editing LLM adapter config

You don't need to touch these — they load automatically. The MDC files are the canonical source going forward; `.cursorrules` exists for backward compat with older Cursor versions.

## Setup

### 1. Clone the framework

```bash
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
```

### 2. Run setup in your project

```bash
cd ~/your-project
node ~/agentic-sdlc/setup.mjs
```

The interactive setup will create:
- `agents/project.json` — project config
- `agents/budget.json` — token budgets per agent
- `agents/domains.json` — agent routing
- Agent directories with `AGENT.md` and memory files
- `.cursorrules` — Cursor reads this automatically
- OpenSpec templates

### 3. Configure an LLM provider

Edit `agents/project.json` — pick whichever provider matches your environment:

```json
{
  "llm": {
    "defaultProvider": "anthropic"
  }
}
```

Then set the env var(s) for your provider:

| Provider | Env vars |
|---|---|
| `anthropic` (Claude direct) | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `groq` / `gemini` / `cerebras` | respective `*_API_KEY` (free tiers available) |
| `ollama` | `OLLAMA_HOST=http://localhost:11434` |
| `azure-openai` | `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` |
| `azure-foundry-claude` | `AZURE_FOUNDRY_ENDPOINT` + `AZURE_FOUNDRY_API_KEY` |

**For enterprise/work environments using Azure or Microsoft Foundry**, jump to [Using Cursor with Azure / Foundry](#using-cursor-with-azure--foundry) below.

### 4. Verify Cursor picks up the rules

Open the project in Cursor. The `.cursorrules` file is read automatically — no configuration needed. You should see the SDLC framework rules in Cursor's context when you chat.

## How It Works in Cursor

### OpenSpec Workflow (Without Skills)

Claude Code has a `/skill` system for OpenSpec workflows. Cursor doesn't have this — instead, the `.cursorrules` file contains embedded workflow instructions that Cursor's AI follows.

**To start a change**, tell Cursor:
> "Start a new OpenSpec change called add-user-auth"

Cursor will follow the workflow from `.cursorrules`: create the change, show the first artifact template, and wait for your direction.

**To continue**, say:
> "Continue the openspec change" or "Create the next artifact"

**To implement**, say:
> "Implement the tasks from the openspec change"

All 10 OpenSpec workflows are embedded in `.cursorrules`:
- Start new change
- Continue change
- Fast-forward (create all artifacts at once)
- Implement/apply
- Verify implementation
- Archive
- Sync specs
- Bulk archive
- Explore (thinking partner)
- Onboard (guided tutorial)

### Task Queue

The task queue works identically — it's plain Node.js scripts reading JSON files:

```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs status
node ~/agentic-sdlc/agents/queue-drainer.mjs run
```

### Agent Memory

Memory is JSON files on disk. Works the same regardless of IDE:

```bash
node ~/agentic-sdlc/agents/memory-manager.mjs recall my-agent
node ~/agentic-sdlc/agents/memory-manager.mjs record my-agent recent "Learned X"
```

### Testing & Validation

```bash
# Run your project tests
node ~/agentic-sdlc/agents/four-layer-validate.mjs

# Check agent prompt quality
node ~/agentic-sdlc/agents/test-behavior.mjs --framework
```

## LLM Provider Configuration

The framework supports 4 LLM providers. Set in `project.json` → `llm.defaultProvider`:

| Provider | Key | Models |
|----------|-----|--------|
| `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo, o1, o1-mini, o3-mini |
| `anthropic` | `ANTHROPIC_API_KEY` | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| `groq` | `GROQ_API_KEY` | llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768 |
| `ollama` | (local) | Any model pulled via `ollama pull` |

The adapter is used by framework scripts (cost-tracker, model-manager) for token estimation and model info. Your IDE's own LLM (Cursor uses its own connection) is separate from the framework's adapter.

## Differences from Claude Code

| Feature | Claude Code | Cursor |
|---------|------------|--------|
| OpenSpec skills | `/openspec-new-change` slash command | Natural language: "start a new openspec change" |
| Subagent spawning | `Agent` tool with isolation | Not available — single agent |
| MCP servers | Built-in MCP support | Cursor has its own tool system |
| Task queue | Same | Same |
| Memory system | Same | Same |
| Testing | Same | Same |
| `.cursorrules` | Ignored (uses `CLAUDE.md`) | Primary rules file |

## Migrating Between Environments

The framework is designed to work across IDEs. The same project can be used in both Claude Code and Cursor:

- `CLAUDE.md` — read by Claude Code
- `.cursorrules` — read by Cursor
- `agents/project.json` — shared config (just change `llm.defaultProvider`)
- Task queue, memory, OpenSpec artifacts — all portable JSON/markdown

To switch LLM providers between environments:

```bash
# In your Cursor environment (OpenAI)
# agents/project.json: "defaultProvider": "openai"
export OPENAI_API_KEY="sk-..."

# In your Claude Code environment (Anthropic)
# agents/project.json: "defaultProvider": "anthropic"
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Using Cursor with Azure / Foundry

For enterprise or work environments running on Azure, Cursor + Agentic SDLC + Foundry compose cleanly.

### Quick setup

**Claude in Foundry (recommended for Claude-centric teams):**

```bash
export AZURE_FOUNDRY_ENDPOINT="https://<your-resource>.services.ai.azure.com"
export AZURE_FOUNDRY_API_KEY="..."   # or set AZURE_FOUNDRY_AUTH_TOKEN for Entra SSO
```

```json
// agents/project.json
{
  "llm": { "defaultProvider": "azure-foundry-claude" }
}
```

```json
// agents/budget.json — reference deployment names
{
  "agents": {
    "reviewer": { "model": "claude-sonnet-4-6", "dailyTokens": 500000 }
  }
}
```

**Azure OpenAI (GPT-4o / o-series):**

```bash
export AZURE_OPENAI_ENDPOINT="https://<your-resource>.openai.azure.com"
export AZURE_OPENAI_API_KEY="..."
```

```json
{
  "llm": {
    "defaultProvider": "azure-openai",
    "azureOpenAI": { "deployments": { "gpt4o-prod": "gpt-4o" } }
  }
}
```

### How Cursor, SDLC, and Foundry compose

1. **Cursor** reads `.cursor/rules/*.mdc` and `.cursorrules` every turn. The rules tell Cursor's agent to follow the SDLC micro cycle, use OpenSpec, write tests, read/write memory.
2. **Cursor's agent** runs framework scripts directly — `queue-drainer.mjs`, `memory-manager.mjs`, etc. These are pure Node.js and don't touch an LLM themselves.
3. **When a framework script needs an LLM** (e.g. `test-behavior.mjs`, sub-task delegation), it calls through the LLM adapter — which is Foundry.
4. **Cursor's built-in AI** is independent — it uses whatever model you've configured in Cursor's own settings. The SDLC's `llm.defaultProvider` only affects framework-invoked LLM calls.

So you get two agents on the problem: Cursor's in-editor agent (following SDLC rules) and framework-spawned agents (governed by budget, memory, and domain routing).

### Microsoft Agent Framework (optional)

If your org uses Microsoft Agent Framework (MAF — AutoGen + Semantic Kernel merged, GA Q1 end 2026), MAF-built agents can plug into the SDLC as execution agents. The SDLC doesn't care what language they're written in — wrap the invocation in a shell script and `worker.mjs` drives the rest.

See [azure-foundry-integration.md](azure-foundry-integration.md) for the complete guide: auth details, Azure Pipelines CI example, deployment cheat sheet, neutral ethics note.

## Troubleshooting

**Cursor doesn't see the rules:** Check that `.cursorrules` exists in your project root and `.cursor/rules/*.mdc` files are present (not in `~/agentic-sdlc` — they should be copied to your project by `setup.mjs` or the framework repo cloned alongside).

**OpenSpec commands not found:** Install the `openspec` CLI: `npm install -g openspec` (or use it via `npx openspec`).

**LLM adapter errors:** Check your API key is set in the environment Cursor inherited. The adapter is only used by framework scripts, not by Cursor's built-in AI.

**Azure / Foundry `401`:** Verify the key is for the right resource, or that your Entra token has scope `https://ai.azure.com/.default`.

**Azure / Foundry `404`:** Deployment name in `budget.json` must match what you actually deployed in Foundry. Run `az cognitiveservices account deployment list` to confirm.

**Claude in Foundry `subscription eligibility error`:** Claude on Foundry requires Enterprise or MCA-E. Fall back to `anthropic` (Claude direct) or `azure-foundry-claude` on a different subscription.
