# Agentic SDLC Framework

[![Tests](https://github.com/that-gum-you-like/agentic-sdlc/actions/workflows/test.yml/badge.svg)](https://github.com/that-gum-you-like/agentic-sdlc/actions/workflows/test.yml)

A methodology for running multi-agent AI development teams. Plug it into your existing project to get task queues, agent memory, quality gates, and progressive automation — from "AI helps me code" to "agents ship features overnight."

Works with any AI coding tool: Claude Code, Cursor, Windsurf, Copilot, Aider, or local agents.

| Tool | How it picks up rules |
|------|----------------------|
| Claude Code | Reads `CLAUDE.md` automatically |
| Cursor | Reads `.cursorrules` automatically |
| Windsurf | Reads `.windsurfrules` automatically |
| Copilot / Aider / Others | Point them at `ONBOARDING.md` — it's the universal entry point |

## Get Started

### Option A: Point your AI agent at this repo
Tell your AI agent: *"Read ONBOARDING.md in this repo and help me integrate this framework into my project."* The onboarding guide walks the agent through discovering your project, assessing your current practices, and integrating incrementally.

**Required:** Node.js 18+, git. That's it. The framework has zero npm dependencies (pure Node stdlib) and installs nothing globally.

**Optional (only if you opt in):**
- `npm install -g openspec` — required for Cursor/Windsurf OpenSpec workflows
- Python 3 + `pip install -r agents/requirements-nlp.txt` — only for semantic memory search (non-semantic search works without it)
- An LLM provider API key — Anthropic / Groq / Gemini / Cerebras / OpenAI / Ollama (only needed for scripts that call a model; the orchestration scripts run locally with no network)

## What Running This Repo Does (and Doesn't Do) — Safety Review

If you're cloning this onto a work or locked-down machine, here's exactly what you're getting:

| Concern | Reality |
|---|---|
| **Does cloning run any code?** | No. `git clone` just downloads source files. |
| **Does `setup.mjs` install anything globally?** | No. It creates files in *your* project directory (`agents/`, `plans/`, `openspec/`, config files). It never modifies your system, shell, or PATH. Run with `--dry-run` to preview. |
| **Any npm dependencies?** | Zero. Every script uses Node.js stdlib only. The only `package.json` with deps is empty. |
| **Any network calls at rest?** | No. Scripts only call the network when you explicitly invoke a model (via a provider adapter you configured) or run `model-manager.mjs research` (fetches provider pricing pages). |
| **Any telemetry?** | None. The framework writes logs *locally* to `pm/` — never transmits anywhere. |
| **Does it need OpenClaw, Paperclip, Matrix, or WhatsApp?** | **No — all optional adapters.** See below. |

### Optional integrations (adapters — skip any you don't want)

| Adapter | What it is | Skip by… |
|---|---|---|
| **OpenClaw** | A personal WhatsApp/browser automation gateway the author uses locally. Appears in `notify.mjs` as one of three notification providers. | Default. Leave `notification.provider: "none"` (the default) in `project.json`. No OpenClaw binary means OpenClaw code paths are never entered. |
| **Paperclip** | Cloud orchestration control plane. Requires `.paperclip.env` with API keys. | Default. Leave `orchestration.adapter: "file-based"` (the default) in `project.json`. Without `.paperclip.env`, Paperclip code never runs. |
| **Matrix** | Self-hosted agent-to-agent chat (`matrix-client/`). Requires you to run your own Synapse/conduwuit homeserver. | Simply don't use `matrix-cli.mjs`. Nothing else depends on it. |
| **WhatsApp / external channels** | Delivery targets for `notify.mjs`. | `notification.provider: "file"` writes to `pm/notifications.log` instead — zero external network. |

### Using the framework with Microsoft / Azure (Foundry, Agent Framework, Cursor)

The framework is provider-neutral via its LLM adapter pattern. For Microsoft-ecosystem teams, two adapters ship out of the box:

- **`azure-openai`** — OpenAI models (GPT-4o, o-series) deployed in Azure OpenAI / Foundry. Uses the v1 chat/completions API. API-key or Entra ID auth.
- **`azure-foundry-claude`** — Claude models deployed in Foundry via the Anthropic Messages API. Supports `thinking`, `effort`, prompt caching, and MCP just like Claude direct. Enterprise/MCA-E only, East US 2 / Sweden Central.

Point `llm.defaultProvider` in `agents/project.json` at either, set the `AZURE_*_ENDPOINT` and `AZURE_*_API_KEY` env vars, and the rest of the framework (queue, memory, cost tracker, micro cycle) runs unchanged. Cursor users get this automatically — `.cursorrules` is loaded every turn, so the SDLC micro cycle and OpenSpec workflow drive Cursor's agent while Foundry serves the models.

**Microsoft Agent Framework** (merged AutoGen + Semantic Kernel, GA end of Q1 2026) doesn't overlap with this framework — MAF builds individual agents, this framework orchestrates a team of them over the SDLC. MAF agents can be wrapped as execution agents, or SDLC scripts can be exposed as tools in a MAF agent. Both sides speak MCP and A2A.

See [docs/azure-foundry-integration.md](docs/azure-foundry-integration.md) for the full guide (auth, CI/CD, deployment cheat sheet, troubleshooting).

**Bottom line for a work machine:** clone, run `setup.mjs --dry-run` first, review what it would create, and keep all adapter settings at their defaults (`file-based` / `none`). You can use the framework with nothing but Node.js and your AI coding tool of choice.

### What to review before trusting it
- `setup.mjs` — the only script that modifies your filesystem outside `pm/` (creates template files in *your* project)
- `agents/*.mjs` — the orchestration scripts. All stay inside your project directory.
- `agents/adapters/llm/*.mjs` — these are the only files that make network calls to third parties (and only when you invoke them with a configured provider)
- `agents/templates/` — string templates written into your project by `setup.mjs`; inspect anything you don't want copied

### Option B: Run the setup script
```bash
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
cd ~/your-project
node ~/agentic-sdlc/setup.mjs
```

### Option C: Discover first, decide later
```bash
node ~/agentic-sdlc/setup.mjs --discover --dir ~/your-project
```
Outputs a JSON analysis of your project (language, framework, tests, CI) without changing any files.

### Try It (5 minutes)

```bash
# 1. Clone
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc

# 2. See what it would do (no changes)
node ~/agentic-sdlc/setup.mjs --discover --dir ~/your-project

# 3. Preview the files it would create
node ~/agentic-sdlc/setup.mjs --dry-run --dir ~/your-project

# 4. Check the model intelligence database
node ~/agentic-sdlc/agents/model-manager.mjs models

# 5. If you like what you see, run setup for real
node ~/agentic-sdlc/setup.mjs --dir ~/your-project
```

## What's Included

- **Agents remember past mistakes** — 5-layer memory system means agents learn from failures and don't repeat them
- **Budget can't run away** — model manager monitors token spend, predictively swaps to cheaper models before budget runs out, falls back to free-tier providers so work never stops
- **Quality improves automatically** — defeat tests catch known anti-patterns, shrinking allowlists ensure technical debt only goes down
- **Every change is governed** — OpenSpec workflow (proposal → design → specs → tasks → implement) prevents cowboy coding
- **Works with your AI tool** — 6 LLM providers (Anthropic, OpenAI, Groq, Gemini, Cerebras, Ollama), adapters for Claude Code, Cursor, Windsurf, and any other agent
- **20 agent templates** — 15 execution roles (backend, frontend, reviewer, QA, architect, etc.) + 5 planning agents, each with battle-tested operating rules
- **Self-healing** — health checks detect provider outages, auto-swap to healthy providers, reset stuck tasks, alert you via notification
- **Adopt incrementally** — start with a rules file (Level 1), add as you need. No big-bang migration

## Maturity Model

Adopt incrementally — each level builds on the previous:

| Level | Name | What You Add | Guide |
|-------|------|-------------|-------|
| 0 | Manual | No AI involvement (your starting point) | — |
| 1 | Assisted | CLAUDE.md with project rules | [Level 1](docs/levels/level-1-assisted.md) |
| 2 | Automated | Micro cycle: implement → test → commit | [Level 2](docs/levels/level-2-automated.md) |
| 3 | Orchestrated | Task queue, multiple agents, domain routing | [Level 3](docs/levels/level-3-orchestrated.md) |
| 4 | Quality | Defeat tests, code reviewer, browser E2E | [Level 4](docs/levels/level-4-quality.md) |
| 5 | Evolving | Agent memory, failure tracking, model manager | [Level 5](docs/levels/level-5-evolution.md) |
| 6 | Self-Improving | Pattern detection, behavior tests, drift monitoring | [Level 6](docs/levels/level-6-self-improving.md) |

## Key Commands

```bash
# Task management
node ~/agentic-sdlc/agents/queue-drainer.mjs status          # See queue
node ~/agentic-sdlc/agents/queue-drainer.mjs run              # Assign next task

# Agent memory
node ~/agentic-sdlc/agents/memory-manager.mjs recall <agent>  # Read memory
node ~/agentic-sdlc/agents/rem-sleep.mjs                      # Consolidate memory

# Quality
node ~/agentic-sdlc/agents/four-layer-validate.mjs            # Anti-pattern scan
node ~/agentic-sdlc/agents/test-behavior.mjs                  # Prompt quality check

# Budget & Model Intelligence
node ~/agentic-sdlc/agents/model-manager.mjs check            # Utilization + predictive swap
node ~/agentic-sdlc/agents/model-manager.mjs models           # All known models with costs
node ~/agentic-sdlc/agents/model-manager.mjs suggest coding   # Best model for task type
node ~/agentic-sdlc/agents/model-manager.mjs recommend        # Cross-provider recommendations
node ~/agentic-sdlc/agents/model-manager.mjs research         # Fetch latest pricing
node ~/agentic-sdlc/agents/cost-tracker.mjs report             # Cost report
```

## Documentation (Recommended Reading Order)

| # | Guide | When to read |
|---|-------|-------------|
| 1 | [ONBOARDING.md](ONBOARDING.md) | **Start here** — 5-phase integration protocol |
| 2 | [docs/levels/](docs/levels/) | Read the guide matching your current level |
| 3 | [docs/cursor-setup.md](docs/cursor-setup.md) | If using Cursor or Windsurf |
| 4 | [docs/execution-agents.md](docs/execution-agents.md) | When choosing agent templates (Level 3+) |
| 5 | [docs/safety-mechanisms.md](docs/safety-mechanisms.md) | When adding quality gates (Level 4+) |
| 6 | [docs/adapter-guide.md](docs/adapter-guide.md) | When writing custom adapters |
| 7 | [framework/maturity-model.md](framework/maturity-model.md) | Strategic planning and full checklists |
| 8 | [docs/comparison.md](docs/comparison.md) | If evaluating alternatives |
| 9 | [framework/lesson-plan.md](framework/lesson-plan.md) | 7-hour deep-dive curriculum |

## License

MIT
