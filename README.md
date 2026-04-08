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
**Optional:** `npm install -g openspec` (required for Cursor/Windsurf OpenSpec workflows)

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
