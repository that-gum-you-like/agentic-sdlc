# Cursor Pro+ with the Agentic SDLC Framework

This guide is for users on **Cursor Pro+** (the tier with Background Agents and Automations, launched March 2026) who want to run the agentic-sdlc framework on a new project.

## TL;DR

```bash
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
cd ~/your-new-project
node ~/agentic-sdlc/setup.mjs --discover --dir .   # (optional) preview
node ~/agentic-sdlc/setup.mjs --dir .              # bootstrap
cursor .                                            # open in Cursor
```

`setup.mjs` copies `.cursorrules` + `.cursor/rules/*.mdc` into your project, so Cursor loads the SDLC rules automatically. The OpenSpec workflow, micro cycle, and quality gates are immediately available to any Cursor agent (foreground or background) in this project.

## What Cursor Pro+ adds to the SDLC

| Cursor feature | SDLC pattern it powers |
|---|---|
| **Background Agents** (cloud sandboxes that work async) | Run `queue-drainer.mjs run` in the background while you code in the editor. The agent claims a task, implements, tests, commits, pushes — you review when ready. |
| **Automations** (cron-like scheduled fires) | Schedule weekly `rem-sleep.mjs`, daily `cost-tracker.mjs report`, daily `daily-review.mjs`. No local cron needed; runs in Cursor cloud. |
| **Auto mode** (Cursor picks the model, unlimited) | Worker tier: free, top-quality code. Reserve your `$20/mo` API credit pool for high-stakes operations. |
| **`.cursorrules` + `.cursor/rules/*.mdc`** (loaded every turn) | The SDLC rules (OpenSpec workflow, micro cycle, anti-pattern checklist) constrain *every* Cursor session — foreground edits, background agents, automations. |

## Architecture for Cursor Pro+ users

```
┌─────────────────────────────────────────────────────────────┐
│  Foreground (you editing in Cursor)                         │
│   - .cursorrules loaded every turn                          │
│   - OpenSpec workflow: /openspec-new-change, etc.           │
│   - Micro cycle: pick → implement → test → commit           │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ same repo, same rules
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Background Agents (claimed manually or by Automation)      │
│   - Long-running task execution                             │
│   - Claims from tasks/queue/*.json                          │
│   - Same .cursorrules → same SDLC constraints               │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ triggered by
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Automations (Cursor cloud cron)                            │
│   - Schedule: hourly, daily, weekly                          │
│   - Fire framework scripts:                                  │
│       • `queue-drainer.mjs run`                              │
│       • `rem-sleep.mjs` (weekly)                             │
│       • `cost-tracker.mjs report` (daily)                    │
│       • `pattern-hunt.mjs` (weekly)                          │
└─────────────────────────────────────────────────────────────┘
```

## Setting up a Background Agent for queue drain

In Cursor, open the Background Agents panel and create one with this prompt:

```
Read ~/agentic-sdlc/CLAUDE.md and the .cursorrules in this project. Then:
1. Run `node ~/agentic-sdlc/agents/queue-drainer.mjs status`.
2. If there are pending tasks, claim the highest-priority one with `node ~/agentic-sdlc/agents/queue-drainer.mjs claim <id> <agent>`.
3. Execute the task following the micro cycle: read memory → implement → write tests → run tests → commit.
4. On success, mark the task `node ~/agentic-sdlc/agents/queue-drainer.mjs complete <id> passing`.
5. On failure, release the task and flag it as blocked.
6. Sleep 5 minutes, then repeat.
```

The agent will keep working while you focus on other things. Review its commits in your normal git workflow.

## Setting up Automations (scheduled SDLC tasks)

Cursor Automations can fire framework scripts on a schedule. Recommended starter set:

| Schedule | What it runs | Why |
|---|---|---|
| Daily 06:00 | `node ~/agentic-sdlc/agents/cost-tracker.mjs report` | Token spend visibility |
| Daily 22:00 | `node ~/agentic-sdlc/agents/cycles/daily-review.mjs` | Dashboard refresh + summary |
| Weekly Sun 23:00 | `node ~/agentic-sdlc/agents/rem-sleep.mjs` | Memory consolidation |
| Weekly Sun 23:30 | `node ~/agentic-sdlc/agents/pattern-hunt.mjs` | Anti-pattern detection |
| Weekly Mon 09:00 | `node ~/agentic-sdlc/agents/cycles/weekly-review.mjs` | Quality review |

In the Cursor Automation editor, create each as a "Scheduled" trigger pointing at the command. The Pro+ tier covers all of these without burning your $20/mo API credit pool (housekeeping scripts make no LLM calls).

## Safety notes

- Background agents respect `agents/budget.json` daily token limits. If an agent hits 80% of its budget, conservation mode activates.
- Automations cannot deploy to production without an approval gate. The `done-checklist` in `project.json` enforces this.
- All work happens in a git branch the agent creates; merging to `main` is your decision.
- If you don't want a background agent touching a specific file, add it to `.cursorrules` under "do not modify."

## Going further: full Level 6 (Self-Improving)

This guide gets you to Level 3 (Orchestrated) — multi-agent task queue + scheduled SDLC cycles. To reach Level 6 (continuous pattern detection, drift monitoring, self-improving checklists), see [`openspec/changes/level-6-autonomous-activation/`](../openspec/changes/level-6-autonomous-activation/) — the in-progress change that wires every cycle to a cron-driven loop. Out of scope for first-week work-project use; pursue when your project has stabilized.

## Related docs

- [`README.md`](../README.md) — top-level overview
- [`ONBOARDING.md`](../ONBOARDING.md) — full 5-phase integration protocol
- [`docs/cursor-setup.md`](cursor-setup.md) — Cursor-specific setup (OpenAI provider, OpenSpec without Claude Code skills)
- [`docs/levels/level-3-orchestrated.md`](levels/level-3-orchestrated.md) — Level 3 maturity guide
- [`docs/execution-agents.md`](execution-agents.md) — agent template reference
