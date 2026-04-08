# Using Agentic SDLC with Cursor

This guide covers setting up the Agentic SDLC framework in a Cursor environment, including OpenAI as the LLM provider.

## Prerequisites

- Node.js 18+
- Cursor IDE
- An OpenAI API key (or another supported LLM provider)
- Optional: `npm install -g openspec` (enables the OpenSpec workflow commands in .cursorrules)

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

### 3. Configure OpenAI as LLM provider

Edit `agents/project.json`:

```json
{
  "llm": {
    "defaultProvider": "openai"
  }
}
```

Set your API key:

```bash
export OPENAI_API_KEY="sk-..."
```

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

## Troubleshooting

**Cursor doesn't see the rules:** Check that `.cursorrules` exists in your project root (not in `~/agentic-sdlc` — it should be copied to your project by `setup.mjs`).

**OpenSpec commands not found:** Install the `openspec` CLI: `npm install -g openspec` (or use it via `npx openspec`).

**LLM adapter errors:** Check your API key is set in the environment. The adapter is only used by framework scripts, not by Cursor's built-in AI.
