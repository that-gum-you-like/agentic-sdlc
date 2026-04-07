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

**Prerequisites:** Node.js 18+, git

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

## What's Included

- **15 execution agent templates** — battle-tested roles (backend, frontend, reviewer, release manager, AI engineer, security, QA, architect, and more) with built-in failure patterns and quality rules
- **5 planning agent templates** — requirements engineering, value analysis, product management, parallelization, quality alignment
- **Task queue** — JSON-based with priority, dependencies, domain routing, and parallel assignment
- **5-layer memory** — agents learn from mistakes via core, long-term, medium-term, recent, and compost memory layers
- **Model manager** — monitors token budgets, swaps models on exhaustion, tracks performance by agent/model/task-type
- **Adapter layer** — pluggable orchestration (file-based, Paperclip, Claude Code native) and LLM providers (Anthropic, OpenAI, Groq, Ollama)
- **OpenSpec workflow** — structured change management: proposal → design → specs → tasks → implement
- **14 safety mechanisms** — budget circuit breakers, stale claim detection, test-gated completion, REM sleep, and more
- **Defeat tests** — anti-pattern scanners with shrinking allowlists that track technical debt

## Maturity Model

Adopt incrementally — each level builds on the previous:

| Level | Name | What You Add | Guide |
|-------|------|-------------|-------|
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

## Documentation

| Guide | For |
|-------|-----|
| [ONBOARDING.md](ONBOARDING.md) | AI-agent-guided integration (start here) |
| [docs/execution-agents.md](docs/execution-agents.md) | Choosing and customizing agent templates |
| [docs/adapter-guide.md](docs/adapter-guide.md) | Writing custom orchestration/LLM adapters |
| [docs/safety-mechanisms.md](docs/safety-mechanisms.md) | 14 safety mechanisms explained |
| [framework/maturity-model.md](framework/maturity-model.md) | Full maturity model with checklists |
| [framework/lesson-plan.md](framework/lesson-plan.md) | 7-hour structured learning curriculum |
| [docs/cursor-setup.md](docs/cursor-setup.md) | Cursor + OpenAI setup guide |
| [docs/comparison.md](docs/comparison.md) | vs LangGraph, AutoGen, CrewAI, MetaGPT |

## Optional: Semantic Memory Search

```bash
pip install -r agents/requirements-nlp.txt
```

Enables vector-embedding-based memory search. Without it, memory search falls back to full recall.

## License

MIT
