# Design: level-6-autonomous-activation

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: design

---

## Context

### Current State

The agentic-sdlc framework has shipped tooling for Level 6 (Self-Improving) but operates at ~Level 3 (Orchestrated) because none of the Level-6 scripts are wired to a schedule. Key state:

- 24+ scripts in `~/agentic-sdlc/agents/` including `pattern-hunt.mjs`, `capability-monitor.mjs`, `alignment-monitor.mjs`, `maturity-assess.mjs`, `rem-sleep.mjs`, `cycles/daily-review.mjs`, `cycles/weekly-review.mjs`, `test-behavior.mjs`, `four-layer-validate.mjs`, `seed-queue-from-openspec.mjs` — all functional, none on a cron
- `pm/DASHBOARD.md` last touched 2026-04-07 (stale)
- `maturity-assess.mjs` reports 3.9/5.0 overall; three dimensions below 5.0 (Deployment 1.5, Observability 3.0, Testing 3.5)
- Queue empty: `queue-drainer status` shows 0/0/0
- `~/paperclip` will provide the visual project-management UI (no custom dashboard work in this change)
- LLM provider adapters in place: Anthropic, Groq, Gemini, Cerebras, OpenAI, Azure, Ollama. Groq has the most generous free tier (Llama 3.3 70B)
- The framework already uses an adapter pattern for orchestration (`file-based`, `paperclip`, `claude-code-native`) — orchestration choice is per-project

### Problem Restatement

Turn the existing Level-6 tooling on with `systemd --user` timers, add multi-project orchestration with per-project enable/disable, and close the three sub-5.0 maturity dimensions — all within one week, at $0 marginal cost, on Bryce's local Linux machine.

---

## Goals

- All 8 maturity dimensions reach 5.0/5.0 by Day 7 (verified by `maturity-assess.mjs`)
- System maturity reaches Level 6 (Self-Improving) — measurable via active timers + cron-firing evidence + drift alerts logged
- Token consumption stays bounded: housekeeping crons cost $0 (no LLM), executor crons capped at 14 fires/day (hourly 08-22 local), daily budget circuit-breaker hard-caps total LLM spend
- Reconstitutable on any Linux machine: `setup.mjs --install-timers` rebuilds the schedule end-to-end from a fresh clone
- Per-project enable/disable: Bryce can toggle LinguaFlow vs agentic-sdlc autonomous drain independently
- 3-working-day autonomous bootstrap: bots clear seed tasks (Phase 2-4 implementation) on Days 1-3

## Non-Goals

- VM migration (deferred to future change `vm-migration`; tracked as Open Question)
- Web/visual dashboard (Paperclip handles this; `pm/*.md` artifacts remain machine-readable only)
- Cursor Automations or GitHub Actions integration
- Anthropic API funding for autonomous work (Bryce won't pay; Groq is the default)
- Paperclip upgrade and security patching (separate change `paperclip-upgrade-and-security` in backlog)
- Paperclip prompt-caching contribution (separate change `paperclip-prompt-caching` in backlog)
- LinguaFlow product feature work (LinguaFlow is paused per Bryce's job-focus shift)
- Autonomous backlog grooming (grooming is interactive Bryce+Claude only for this change)
- New agent personas (existing roster sufficient)
- Voice/WhatsApp grooming intake (already exists via OpenClaw, unchanged)

---

## Design

### Overview

Wire existing scripts to `systemd --user` timers via a single idempotent installer. Add a thin orchestration layer (`projects.json` + `multi-project-orchestrator.mjs`) that iterates enabled projects when a timer fires. Add structured logging (`log.mjs`) and metrics aggregation (`metrics.mjs`) for observability. Add a release pipeline (`release.mjs`) for deployment maturity. Switch the default autonomous LLM provider to Groq with a free-tier fallback chain. The 3-working-day autonomous bootstrap is encoded as ~15 atomic tasks in `tasks.md` — the existing `seed-queue-from-openspec.mjs` will derive them into `tasks/queue/*.json` on its next cron tick.

### Components

#### Cron Installer

**File**: `agents/cron-installer.sh`, `agents/templates/systemd/*.service|.timer`

A bash script that:
- Resolves the agentic-sdlc home (default `~/agentic-sdlc`) and the projects-registry path
- Reads templates in `agents/templates/systemd/`, substitutes `$AGENTIC_SDLC_HOME` and shell escape patterns, writes to `~/.config/systemd/user/sdlc-<job>.service|timer`
- Runs `systemctl --user daemon-reload`, `systemctl --user enable --now sdlc-*.timer`
- Supports `install`, `uninstall`, `status`, `restart` subcommands; idempotent

One template pair per recurring job (9 jobs total). All `.timer` files use `Persistent=true` so a missed tick during sleep fires on next wake.

#### Multi-Project Orchestrator

**File**: `agents/multi-project-orchestrator.mjs`

The entry point fired by every systemd timer with `--cycle <name>`. It:
- Loads `~/agentic-sdlc/projects.json`
- Iterates entries where `enabled === true`, sorted by `priority` descending
- For each project, sets `SDLC_PROJECT_DIR` env var and invokes the cycle script (`queue-drainer.mjs run`, `cycles/daily-review.mjs`, etc.) via `child_process.spawn`
- Acquires a file lock at `~/.agentic-sdlc/orchestrator.lock` to prevent overlapping runs
- Emits structured logs via `log.mjs`
- Skips projects whose `lastSuccess` is within the cycle's debounce window (default 80% of cadence)

#### Projects Registry CLI

**File**: `agents/projects.mjs`

CLI for the central registry:
- `projects list` — table with name, path, enabled, priority, last run, last success
- `projects enable <name>`, `projects disable <name>`
- `projects add <name> --path <abs-path> [--priority N] [--description "..."]`
- `projects remove <name>` — soft-delete (sets enabled=false, retains history); `--purge` to actually delete
- `projects status` — health summary

#### Structured Logger

**File**: `agents/log.mjs`

A 60-line Node module exporting `info`, `warn`, `error`, `debug` functions. Writes JSONL to `pm/logs/YYYY-MM-DD.jsonl` (one file per UTC day). Each line: `{ts, level, agent, script, cycle, correlationId, msg, data?}`. The `correlationId` defaults to a per-process UUID set on module load so a full cycle invocation can be traced.

#### Metrics Aggregator

**File**: `agents/metrics.mjs`

Daily aggregator. Reads `pm/logs/*.jsonl`, computes per-project throughput (tasks completed, time-to-completion, retry rate), token spend (joined from `pm/cost-tracker.jsonl`), drift alerts (joined from capability-monitor output). Emits `pm/METRICS.md` (human-readable) and `pm/metrics.json` (machine-readable). Run daily at 06:30.

#### Release Pipeline

**File**: `agents/release.mjs`, `scripts/release.sh`

Manual-fire only (no cron). `release.mjs patch|minor|major`:
1. Bumps `package.json` version
2. Generates `CHANGELOG.md` entry from `git log $LAST_TAG..HEAD` grouped by commit prefix (feat/fix/docs/refactor)
3. Commits the version + changelog
4. Tags with `v<version>`
5. Pushes branch + tag
6. Calls `gh release create v<version> --notes-file <generated-notes>`

`--dry-run` shows what would happen without doing it.

### Data Flow

```
Bryce dumps idea → openspec/BACKLOG.md (manual edit, or voice intake, or WhatsApp)
                 ↓
Bryce + Claude (interactive session) → openspec/changes/<name>/proposal.md → design.md → specs/ → tasks.md
                 ↓ (every 15 min)
seed-queue-from-openspec.mjs (non-LLM) scans openspec/changes/*/tasks.md
                 ↓
tasks/queue/<id>.json files materialized
                 ↓ (hourly 08-22, fired by sdlc-queue-drain.timer)
multi-project-orchestrator --cycle queue-drain → iterates enabled projects in projects.json
                 ↓ (per project)
queue-drainer.mjs run → picks 1 task → autonomous-launcher.sh → headless agent (Groq)
                 ↓
Agent implements task → runs tests → commits → updates task to "completed"
                 ↓ (daily 23:00)
cycles/daily-review.mjs (small Groq call) → refreshes pm/DASHBOARD.md, pm/METRICS.md
                 ↓ (Sun 23:00)
cycles/weekly-review.mjs (medium Groq call) → pattern-hunt + rem-sleep + maturity-assess + alignment summary
```

### Schema / Interface Changes

```typescript
// projects.json at repo root (NEW)
interface ProjectsRegistry {
  version: 1;
  projects: ProjectEntry[];
}
interface ProjectEntry {
  name: string;                    // unique identifier, e.g. "agentic-sdlc", "linguaflow"
  path: string;                    // absolute path to project dir
  enabled: boolean;                // per-cycle drain on/off toggle
  priority: number;                // higher runs first within a cycle, default 0
  description?: string;
  orchestrationAdapter?: "file-based" | "paperclip" | "claude-code-native"; // default inherited from project's own project.json
  lastRun?: Record<string, string>;     // cycle name → ISO timestamp
  lastSuccess?: Record<string, string>; // cycle name → ISO timestamp
}

// pm/logs/YYYY-MM-DD.jsonl (NEW)
interface LogEntry {
  ts: string;             // ISO 8601 UTC
  level: "debug" | "info" | "warn" | "error";
  agent?: string;         // agent name if applicable
  script: string;         // script that emitted this line
  cycle?: string;         // cycle name (queue-drain, daily-review, etc.)
  correlationId: string;  // links log lines from one orchestrator invocation
  msg: string;
  data?: Record<string, unknown>;
}

// budget.json default change (MODIFIED)
{
  "cronTokenBudget": {
    "dailyLimit": 200000,        // total LLM tokens per day across all cron-fired LLM jobs
    "circuitBreak": true,        // when exceeded, all LLM crons skip until UTC midnight
    "warningThreshold": 0.8
  },
  // existing agent budgets unchanged
}
```

---

## Decisions

### Decision 1: systemd User Timer Naming Convention

**Chosen**: `sdlc-<cycle-name>.timer` and `sdlc-<cycle-name>.service`. Examples: `sdlc-queue-drain.timer`, `sdlc-daily-review.timer`, `sdlc-weekly-review.timer`.

**Considered**: `agentic-sdlc-*` (too long), generic `<cycle>.timer` (collides with system services).

**Rationale**: `sdlc-` prefix is unique and discoverable via `systemctl --user list-timers sdlc-*`. Short, greppable.

### Decision 2: Single-Installer Bash Script vs Per-Job Scripts

**Chosen**: One `cron-installer.sh` with `install|uninstall|status|restart` subcommands. Reads all timer templates from `agents/templates/systemd/` at install time.

**Considered**: One script per job; declarative YAML/JSON config consumed by Node.

**Rationale**: Bash is the right tool for `systemctl` — no Node startup cost, no extra deps. Single entry point matches Bryce's mental model (`./cron-installer.sh install` = done). YAML config is overkill for ~9 timers.

### Decision 3: Multi-Project Orchestrator as the Timer Entry Point

**Chosen**: All systemd timers call `multi-project-orchestrator.mjs --cycle <name>`. The orchestrator iterates enabled projects and runs the named cycle per project.

**Considered**: One timer per project per cycle (e.g. `sdlc-agentic-sdlc-queue-drain.timer`, `sdlc-linguaflow-queue-drain.timer`).

**Rationale**: Per-project timers don't scale — adding a project means installing N new timer files. Single orchestrator means projects.json is the only thing that changes when toggling a project. Trade-off: a slow project drags out a cycle, but the orchestrator can parallelize when safe.

### Decision 4: projects.json at Repo Root, Not in agents/

**Chosen**: `~/agentic-sdlc/projects.json`.

**Considered**: `agents/projects.json`.

**Rationale**: `projects.json` is framework-level configuration, not agent-specific. Existing `agents/` directory holds per-project files (the framework consuming this would have its own `agents/`). Putting it at repo root makes the boundary clean.

### Decision 5: Hourly Executor Cap (08-22 local), Daily Token Budget Circuit Breaker

**Chosen**: `sdlc-queue-drain.timer` fires at `OnCalendar=*-*-* 08..22:13:00` (13 past every hour, 08-22 local time). Adds a 200K-token daily budget circuit-breaker in `budget.json` for LLM-using crons.

**Considered**: every 30 min around the clock (28 fires/day); every hour 24/7 (24 fires/day); on-demand only (no cron, manual `queue-drainer run`).

**Rationale**: 13 past the hour avoids the on-the-hour rush across all users worldwide (per CronCreate scheduler best-practice). 08-22 matches Bryce's "machine awake" window (systemd timers pause when laptop closed anyway). 200K/day token budget is well within Groq free tier (no published cap, but rate-limited at ~30 req/min for the 70B model). Circuit-breaker pauses LLM crons cleanly if a runaway task burns tokens; housekeeping crons remain unaffected.

### Decision 6: Structured Log Format = JSONL, One File Per UTC Day

**Chosen**: `pm/logs/YYYY-MM-DD.jsonl`. Required keys: `ts, level, script, correlationId, msg`. Optional: `agent, cycle, data`.

**Considered**: Pino logger output, OpenTelemetry traces, single rolling log file.

**Rationale**: JSONL is `jq`-greppable and zero-dependency. One file per day enables natural rotation without external tools. The format is `metrics.mjs`-readable and human-readable in `less`. No external logger library = zero-dep mandate preserved.

### Decision 7: Release Pipeline = Manual Fire Only

**Chosen**: `agents/release.mjs` invoked manually by Bryce; no systemd timer for releases. Required cleanly-staged git tree.

**Considered**: Autonomous release on every passing CI run (continuous deployment); weekly release timer.

**Rationale**: Framework releases are intentional decisions, not continuous events. Autonomous releases on a framework consumed by other projects could ship bugs faster than they're caught. Bryce cuts a tag when he means it. The pipeline IS the deployment-dimension upgrade — automation lives in the script, not the schedule.

### Decision 8: Default Autonomous LLM = Groq Llama 3.3 70B

**Chosen**: Set `budget.json.template`'s default `model` field to `groq/llama-3.3-70b-versatile` with fallback chain to `gemini/gemini-2.0-flash` then `cerebras/llama-3.3-70b`. Anthropic Claude is excluded from the autonomous default — reserved for interactive sessions only.

**Considered**: Anthropic Sonnet via API (rejected — costs money); Cerebras primary (less rate-limit headroom than Groq).

**Rationale**: Groq's free tier has no published rate or volume cap on Llama 3.3 70B for normal use. Gemini's free tier (250 req/day) and Cerebras' free tier (1M tokens/day) are sufficient backups. The bots ARE dumber than Claude — but the validation layer (four-layer-validate, defeat tests, behavior tests, stale-claim circuit breaker at 30 min) catches more than it lets through.

### Decision 9: Seed Tasks Live in tasks.md, Derived by Existing seed-queue-from-openspec.mjs

**Chosen**: Phases 2-4 of `tasks.md` ARE the seed task definitions. The existing non-LLM `seed-queue-from-openspec.mjs` (cron-fired every 15 min) scans them and materializes `tasks/queue/<id>.json` files. No new seeding mechanism.

**Considered**: A separate `agents/seed-tasks.json` file with bootstrap-specific tasks.

**Rationale**: One source of truth (tasks.md). The existing seed-queue script already does the work; piggybacking on it is zero new code. When the bots complete a task, marking the checkbox in tasks.md flows through the same machinery.

### Decision 10: Per-Project Cycle Debounce = 80% of Cadence

**Chosen**: If a project's `lastSuccess[cycle]` is within 80% of the cycle's cadence, skip on this orchestrator pass.

**Considered**: No debounce; 50% debounce; track only `lastRun`.

**Rationale**: 80% prevents accidental double-runs when a slow cycle nearly overlaps the next tick. Tracking `lastSuccess` (not `lastRun`) means failed runs are retried sooner. Skip is logged so missed cycles are visible.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Groq Llama 70B quality is too weak — bots fail seed tasks repeatedly | Medium | Medium | Each task is atomic <90 min; 3-attempt cap then auto-flag-blocked; Bryce reviews flagged tasks in interactive Claude session (Max-billed). Acceptable degradation: Phase 4 testing ratio lands at 4.5 on Day 7, closes to 5.0 by Day 14. |
| Token vacuum: a runaway prompt or infinite loop drains Groq free tier | Low | High | `cronTokenBudget.dailyLimit: 200000` circuit-breaker pauses all LLM crons until UTC midnight. Existing `budget.json` per-agent caps unchanged. Each cron logs `cache_read_input_tokens` / `cache_creation_input_tokens` from Groq response. |
| systemd timer drift when laptop sleeps mid-cycle | Medium | Low | `Persistent=true` on timers fires the missed tick on wake. Last-run timestamps in projects.json show drift. Daily-review summarizes missed cycles. |
| Empty queue after seed tasks clear | High (by Day 4-5) | Low | Documented in done-checklist: at end of every interactive session, Bryce + Claude groom at least 1 backlog item into a tasks.md addition. Bots have work to chew. |
| Multi-project orchestrator race conditions (concurrent timer fires) | Low | Medium | File lock at `~/.agentic-sdlc/orchestrator.lock` (advisory `flock`). If a previous cycle is still running, the new fire logs and skips. |
| `seed-queue-from-openspec.mjs` double-seeds tasks across cron ticks | Medium (today, before validation) | Low | Existing script has dedup logic; verify in Phase 1 with a test that runs the seed twice and checks queue stays stable. Add `tests/seed-queue-idempotency.test.mjs`. |
| Bot picks a task with implicit cross-project dependency | Low | Medium | Tasks in tasks.md include explicit `blockedBy` field; queue-drainer honors. For inter-project dependencies (rare), a project boundary is enforced — bots only touch files within their assigned project root. |
| Test/src ratio gamed by trivial tests | Medium | Low | `four-layer-validate.mjs` Layer 4 (statistics) flags tests with zero assertions or pure boilerplate. Behavior tests verify decision quality independent of code coverage. |
| Paperclip Claude weekly-limit bug (#6499) bites Bryce later when he restarts Paperclip | Medium | Medium | Out of scope here (Paperclip is offline). Flagged in BACKLOG.md item #14. When Bryce restores Paperclip, upgrade first. |
| Bryce closes laptop for full weekend, bots produce nothing | High | Low | Acceptable. Throughput target is "≥1 task/working day"; closed-laptop days don't count against goal. |

---

## Open Questions

### OQ1: VM Migration Timing

**Question:** When (not whether) do we migrate the cron infrastructure from local systemd to a 24/7 VM?

**Trigger conditions:**
- Bryce locates the Norwegian/non-5-eyes VM credentials he subscribed to
- OR autonomous throughput is consistently bottlenecked by laptop-closed time (verifiable via missed-cycle metrics)
- OR Bryce takes the framework to his employer for a demo and needs a server-side presence

**Tracked as:** future change `vm-migration` (not yet a BACKLOG.md item — add when first trigger fires).

### OQ2: Paperclip Status Post-Day 7

**Question:** Once Level 6 is online, how do we restore + harden Paperclip?

**Sub-questions:**
- Restart current v0.3.0 with `codex-local` adapter disabled? (60-second fix to clear the heartbeat error)
- Upgrade through breaking changes (v2026.427.0 sandbox removal)? Risk vs. reward
- Open PR for prompt caching upstream? Career-signal vs. effort

**Tracked as:** BACKLOG.md items #14 (upgrade) and #15 (prompt caching).

### OQ3: LinguaFlow Re-Activation

**Question:** Bryce shifted focus to SDLC-for-job. When does LinguaFlow get re-enabled in `projects.json`?

**Trigger:** Bryce explicitly flips it. Until then, LinguaFlow is registered in projects.json with `enabled: false`.

### OQ4: Interactive Grooming Cadence

**Question:** How often does Bryce + Claude (interactive session) need to groom backlog items to keep the queue fed?

**Working assumption:** at least 1 grooming session per 3 working days (one tasks.md addition or one new openspec change). Below that, the queue empties and bots idle. Track via `metrics.mjs` "days since last queue refill" — alert if > 3.

---

## Testing Approach

- **Unit tests**: every new script gets a `tests/<name>.test.mjs` — log.mjs, metrics.mjs, projects.mjs, multi-project-orchestrator.mjs, release.mjs. cron-installer.sh gets a smoke test (`tests/cron-installer.smoke.test.sh`).
- **Integration tests**: an end-to-end orchestrator test that creates a temp projects.json with one enabled project, fires a fake cycle, asserts the right script was invoked with the right env vars and projects.json lastRun updated.
- **Defeat tests**: ensure `seed-queue-from-openspec.mjs` is idempotent (running it twice produces the same queue); ensure `multi-project-orchestrator.mjs` doesn't run a project marked disabled; ensure release.mjs refuses to run on a dirty git tree.
- **Behavior tests**: existing `test-behavior.mjs` runs against unchanged AGENT.md files; if any AGENT.md is updated as a side effect of Phase 2-4 (unlikely), behavior tests gate the commit.
- **Manual verification on Day 7**:
  - `systemctl --user list-timers sdlc-*` shows all 9 timers active with non-zero `NEXT` times
  - `node agents/maturity-assess.mjs` reports 5.0 on every dimension
  - `pm/DASHBOARD.md` `Last updated:` is within 24h
  - `pm/METRICS.md` shows ≥3 autonomous tasks completed across Days 1-3

---

## Next Step

Proceed to specs phase. Four delta spec files in `specs/`:

1. `scheduled-self-improvement.md` — REQ-001..010 covering the cron-driven Level 6 loop
2. `multi-project-orchestration.md` — REQ-001..008 covering projects.json + orchestrator
3. `structured-observability.md` — REQ-001..006 covering log.mjs + metrics.mjs
4. `framework-self-release.md` — REQ-001..005 covering release.mjs pipeline
