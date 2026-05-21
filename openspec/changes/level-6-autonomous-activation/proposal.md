# Proposal: level-6-autonomous-activation

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

Bryce's target maturity is **Level 6 (Self-Improving) across every dimension** within **one week**. This means two concurrent measurements must both hit Level 6:

1. **System maturity (README scale, Levels 0–6):** the whole-system property where "agents teach discipline to each other, continuous pattern detection & defeat, behavior tests catch regressions, the system gets better without your intervention." Today: ~Level 3 (Orchestrated) per the stale PM dashboard.
2. **Per-dimension scores from `maturity-assess.mjs` (0–5):** all 8 dimensions must reach ≥5.0/5.0 for the system to demonstrate Level 6 in practice. Today: **3.9/5.0 overall**, with three dimensions below 5.0 (Deployment & Release **1.5**, Observability **3.0**, Testing & Quality **3.5**).

The gap is not missing tools. Tooling for Level 6 has shipped: `pattern-hunt.mjs`, `capability-monitor.mjs`, `alignment-monitor.mjs`, `maturity-assess.mjs`, `rem-sleep.mjs`, `cycles/daily-review.mjs`, `cycles/weekly-review.mjs`, `test-behavior.mjs`, `four-layer-validate.mjs` all exist. The gap is **operational**:

1. **Nothing fires the tools on a schedule.** Last PM dashboard refresh: 2026-04-07 (6+ weeks stale). Last pattern-hunt: ad hoc. Last alignment-monitor: never recorded. The "self-improving loop" exists as scripts, not as a running system.
2. **No multi-project orchestration.** The framework supports multiple consuming projects (LinguaFlow, agentic-sdlc itself, future projects), but there is no central registry of which projects exist, which are enabled for autonomous drain, or how the cron driver should iterate them. Bryce explicitly wants a per-backlog enable/disable toggle.
3. **No portable infrastructure.** Bryce wants the framework to be his "portable brand of SDLC" — clone to any device, work follows him. Today the framework relies on OpenClaw cron, which is tied to his home machine and cannot follow him to a work laptop.
4. **Three maturity dimensions below Level 6:** Deployment & Release **1.5/5** (no framework self-release pipeline), Observability **3.0/5** (no structured logging or metrics aggregation), Testing & Quality **3.5/5** (0.42 test/src ratio, target 1.0+).
5. **Empty queue + zero recent autonomous activity.** `queue-drainer.mjs status` shows 0 pending / 0 in progress / 0 completed. The bots are not working because nothing is asking them to.

Bryce's operating model — split between **non-LLM housekeeping** (cheap, frequent) and **LLM task execution** (expensive, throttled):

| Layer | Tool | Frequency | LLM tokens? |
|---|---|---|---|
| Backlog → queue derivation | `seed-queue-from-openspec.mjs` (already exists) | every 15 min | **no** |
| Queue → archive (completed item cleanup) | `garden-roadmap.mjs` | daily | **no** |
| Drift / capability scan | `capability-monitor.mjs` | every 6h | **no** |
| Anti-pattern scan | `four-layer-validate.mjs` | per commit | **no** |
| Maturity re-score | `maturity-assess.mjs` | weekly | **no** |
| **Task execution** | `queue-drainer run` → `autonomous-launcher.sh` → headless agent (Groq) | hourly | yes (1 task per fire) |
| Daily review (dashboard refresh) | `cycles/daily-review.mjs` | daily 23:00 | small |
| Weekly review (pattern hunt + REM) | `cycles/weekly-review.mjs` | Sunday 23:00 | medium |

Today none of these are wired to a schedule. Interactive grooming (Bryce + Claude, billed to Max) writes proposals/tasks.md; deterministic crons turn those into a populated queue; throttled LLM crons execute one task per fire. **Token consumption stays bounded by execution cadence, not housekeeping cadence.**

---

## Discovery

- **Files examined**:
  - `agents/maturity-assess.mjs` output (this session): scores per dimension, gap to 5.0
  - `pm/DASHBOARD.md` — last update 2026-04-07; claims Level 3 (Orchestrated)
  - `agents/cycles/daily-review.mjs`, `agents/cycles/weekly-review.mjs` — exist; entry points present; never wired to a schedule in this repo
  - `agents/queue-drainer.mjs` — `status` confirms empty queue
  - `agents/project.json.template` — no `enabled`, `crons`, `schedule`, or `automations` fields
  - `agents/templates/cron-schedule.json.template` — exists; documents intended cron entries; no installer
  - `openspec/changes/archive/sdlc-operational-activation/` — predecessor change (shipped 2026-03-11) closed deploy quality gates and pattern-hunt auto-generation, but did **not** install recurring schedulers
  - `openspec/BACKLOG.md` — 68 lines; promoted items already tracked; format is established
- **Existing patterns**:
  - Multi-project context already exists in `load-config.mjs` (walks CWD → parent dirs for `agents/project.json`)
  - LLM adapter pattern (`agents/adapters/llm/`) supports Groq, Gemini, Cerebras, Anthropic, Ollama, OpenAI, Azure — fallback chains already wired in `budget.json`
  - `notification.provider` already supports `file`/`openclaw`/`none` — portable when set to `file`
  - `setup.mjs` already idempotent; safe to extend with a `--install-timers` flag
- **Existing tests**: 18 test files in `tests/`; ratio 0.42. No tests yet for cycle scripts or project orchestration.
- **Key findings**:
  - Bryce's machine is Linux (`systemd` available without extra install)
  - Bryce explicitly accepts the "machine must be awake when timer fires" constraint as the cost of $0 marginal spend
  - Groq Llama 3.3 70B is acceptable for autonomous work (slower/dumber than Claude, but validation layer compensates)
  - Interactive Claude sessions (this one) bill against Bryce's existing Max plan — keep grooming interactive, drain autonomous
  - The framework is zero-dependency by design; new code must stay Node stdlib

---

## Proposed Solution

Wire the existing Level-6 tooling to recurring `systemd --user` timers, add a central multi-project registry with enable/disable toggles, and close the three sub-5.0 maturity dimensions (deployment, observability, testing). The framework becomes self-running: Bryce drops ideas into `openspec/BACKLOG.md` per project, the cron loop drains the queue and runs the self-improvement cadence (daily review, weekly pattern hunt + REM sleep, monthly maturity reassessment), and the dashboard refreshes itself. Bryce + Claude interactively groom backlog items into OpenSpec proposals during sessions like this one. Everything stays local (no API spend, no GitHub Actions minutes, no Cursor subscription) using Groq as the default autonomous LLM with Gemini/Cerebras fallback.

---

## Value Analysis

### Success Metrics (one-week target)

The change is "done" when, on **Day 7 (2026-05-28)**, all of the following hold:

- `node agents/maturity-assess.mjs` reports **5.0/5.0 on every one of the 8 dimensions** (SDLC Process, Testing, Deployment, Observability, Security, Dependencies, Documentation, Operational Readiness)
- System maturity dashboard claims **Level 6 (Self-Improving)** with evidence: timers visible in `systemctl --user list-timers`, drift alerts logged from real cron firings, pattern-hunt output dated within 7 days, behavior tests passing on every committed AGENT.md change
- `queue-drainer status` shows ≥ 1 task completed per autonomous workday (≥ 3 over the 3 working-day autonomous window)
- `pm/DASHBOARD.md` `Last updated:` field is within the last 24h
- Bryce has dropped at least one new idea into `openspec/BACKLOG.md`, it was groomed interactively into a tasks.md entry, and the cron loop seeded it into the queue without human action
- Bryce can clone the repo to a fresh machine and run `setup.mjs --install-timers` to reconstitute the schedule end-to-end (verified once on Bryce's home machine; second-machine validation is a stretch goal)

### Timeline (one week)

| Day | What happens | Who | LLM cost |
|---|---|---|---|
| **Day 0** (today) | Bryce + Claude (this session): write design.md, specs, tasks.md (this is the **3-working-day bootstrap plan** broken into atomic tasks), implement Phase 1 manually (timers, projects.json, multi-project orchestrator, Groq default, install timers, seed queue) | Claude Code (Max-billed) | Free — billed to Max plan |
| **Day 1–3** (autonomous, working days) | Bots clear seed tasks: build `log.mjs`, instrument scripts, build `metrics.mjs`, build `release.mjs`, raise test/src ratio. Bryce monitors via dashboard, interventions via interactive Claude when bots get stuck. | Groq Llama 70B (autonomous) + Bryce interventions | Free (Groq) + Bryce-time |
| **Day 4–6** | Continued drain of any spillover tasks; Bryce starts grooming his real backlog into proposals so the loop has post-bootstrap work to chew on after Day 7. | Groq + Bryce + Claude interactive | Free |
| **Day 7** (verification) | Run `maturity-assess.mjs`; confirm 5.0 across the 8 dimensions; archive `level-6-autonomous-activation`; system is "online" and Bryce's role becomes idea-generation + grooming, not implementation | Verified by Bryce | None |

### Benefits

- **All 8 maturity dimensions hit 5.0** by Day 7 — the only literal definition of "Level 6 across the board"
- **Token-bounded operation** — housekeeping cadence (every 15 min) uses zero LLM tokens; LLM execution cadence is throttled to one task per hour, ~24 task attempts/day, well within Groq free tier
- **Portability** — `setup.mjs --install-timers` reconstitutes the full schedule on a fresh clone. No machine-specific config; Bryce's "brand of SDLC" follows him to any Linux machine
- **Per-backlog control** — Bryce can enable/disable LinguaFlow vs. agentic-sdlc drain independently with a single CLI call
- **Career signal** — by Day 7, Bryce has a working, portable, multi-agent autonomous SDLC suite that ran his own framework's bootstrap as its first autonomous job. That's the demo.

### Costs

- **Effort**: ~6–8 hours Claude+Bryce on Day 0 (this session) for design + Phase 1 manual implementation; 3 working days of autonomous bot work (Days 1–3) with light Bryce intervention; ~2 hours Day 7 verification.
- **Risk**:
  - **Groq Llama 70B quality risk** — bots may take 2–4 attempts per task, some seed tasks may need Bryce/Claude rescue. Mitigated by: small task scope, four-layer-validate, defeat tests, behavior tests, stale-claim circuit breaker (>30 min in-progress → flag blocked → human review).
  - **One-week target is aggressive for autonomous Groq throughput** — if Groq quality forces too many rescues, the realistic outcome is Phase 1+2+3 done by Day 7 with Phase 4 (testing ratio) trailing. Acceptable degradation: Testing dimension lands at 4.5 instead of 5.0 on Day 7, closes to 5.0 by Day 14 without further LLM intervention as bots organically add tests with each feature.
  - **systemd user timers pause when laptop is closed** — accepted constraint; VM migration is an Open Question in design.md, not blocking this change.
  - **Token vacuum risk** — every cron firing must be reviewable for token cost before the change is archived. design.md will lock cadences and budget per cron.
- **Dependencies**:
  - Linux + systemd (Bryce's machine has both)
  - Node 18+ (already required)
  - `GROQ_API_KEY` env var (Bryce already has)
  - Optional: `GEMINI_API_KEY`, `CEREBRAS_API_KEY` for fallback chain — Bryce has these too
  - `gh` CLI for the release pipeline (already installed on Bryce's machine)
  - No new npm packages (zero-dep mandate preserved)

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Cursor Automations ($20/mo Pro) | Bryce explicitly declined additional paid services after $100+/mo Max with no ROI yet. Re-evaluable in Phase 5 if free-tier LLM quality is insufficient. |
| GitHub Actions schedules | Free for public repos but bots can't write to local file system; would require routing all work through PRs and burn Actions runtime. Also tied to GitHub-hosted execution. |
| OpenClaw cron (status quo) | Tied to Bryce's home machine. Bryce stated he cannot take OpenClaw to his work computer. Fails the portability requirement. |
| VM-hosted (Norway/Lyseparken etc.) | Best long-term answer for 24/7 operation, but requires Bryce to first find the VM credentials and set up SSH. Listed as Phase-5+ migration path in design.md (Open Question), not blocking this change. |
| Anthropic API for autonomous work | Bryce will not fund additional API credits. |
| Codex (OpenAI) | Conflicts with Bryce's stated no-OpenAI rule (border-patrol concerns). |
| Do nothing | Framework remains "scripts that exist but don't run." Bryce continues paying $100+/mo for Max with no autonomous return. Maturity score stays at 3.9. |

### Decision

**Yes, proceed.** This is the lowest-cost path to Level 6 ($0 marginal spend) and the highest-leverage operational improvement available given existing tooling. The architectural choices are all reversible — systemd timers can be swapped for VM cron, Groq can be swapped for Claude when Bryce funds API or moves to Cursor at his employer's cost. Nothing in this change locks Bryce into the local-laptop deployment.

---

## Scope

### In Scope

**Cron infrastructure (Phase 1, done in this session manually):**

- `agents/cron-installer.sh` — idempotent install/uninstall of all systemd `--user` timers
- `agents/templates/systemd/` — `.service` + `.timer` templates, one per recurring job
- `setup.mjs --install-timers` flag for fresh-machine reconstitution

**Cron cadences locked (token-conservative; LLM-using jobs spaced):**

| Job | Cadence | LLM? | Rationale |
|---|---|---|---|
| `seed-queue-from-openspec.mjs` | every 15 min | no | derives queue from grooming output cheaply |
| `garden-roadmap.mjs --status` | daily 06:00 | no | tiny — checks roadmap state |
| `capability-monitor.mjs check` | every 6 h | no | drift scan via JSONL log read |
| `four-layer-validate.mjs` | per commit (git hook, not cron) | no | already wired |
| `queue-drainer.mjs run` | hourly, business hours only (08–22 local) | yes (1 task) | one task per fire; circuit-broken by budget.json |
| `cycles/daily-review.mjs` | daily 23:00 | small (Groq) | dashboard + summary |
| `alignment-monitor.mjs` | daily 12:00 | small (Groq) | mostly deterministic, light LLM for suggestions |
| `cycles/weekly-review.mjs` (= pattern hunt + REM sleep + maturity assess) | Sun 23:00 | medium (Groq) | weekly self-improvement loop |
| `cost-tracker.mjs report` | daily 06:00 | no | reads logs, writes report |

**Multi-project orchestration (Phase 1):**

- `projects.json` (repo root) — central registry: `{ name, path, enabled, priority, description }`
- `agents/projects.mjs` — CLI: `enable`, `disable`, `list`, `add`, `remove`, `status`
- `agents/multi-project-orchestrator.mjs` — iterates enabled projects, runs a named cycle per project
- Modify `daily-review.mjs`, `weekly-review.mjs` to accept `--project <name>`

**LLM defaults (Phase 1):**

- Switch default autonomous LLM in `budget.json.template` to Groq Llama 3.3 70B with Gemini → Cerebras fallback chain

**Observability (Phase 2, bot work Days 1–3):**

- `agents/log.mjs` — structured JSON-lines logger (level, ts, agent, script, msg, correlationId)
- Instrument the 10 most-called scripts (queue-drainer, daily-review, weekly-review, cost-tracker, notify, four-layer-validate, capability-monitor, alignment-monitor, pattern-hunt, seed-queue-from-openspec)
- `agents/metrics.mjs` — daily aggregator → `pm/METRICS.md` (queue throughput, autonomous task count, costs, drift alerts)

**Note on the PM dashboard UI:** Bryce will use **Paperclip** (self-hosted at `~/paperclip`, `localhost:3100`) as the visual project-management dashboard. `pm/DASHBOARD.md` and `pm/METRICS.md` remain as machine-readable artifacts for the cron loop, but no visual dashboard work happens in this change — Paperclip already provides the UI.

**Deployment (Phase 3, bot work Days 1–3):**

- `agents/release.mjs` — framework self-release: semver bump, `CHANGELOG.md` from git log since last tag, GitHub release via `gh`
- `scripts/release.sh` wrapper invoked by Bryce or a cron tagged `manual-fire-only`

**Testing (Phase 4, bot work Days 1–3):**

- Test coverage raised to ≥1.0 test/src ratio
- Tests for: log.mjs, metrics.mjs, projects.mjs, multi-project-orchestrator.mjs, release.mjs, cron-installer.sh (smoke + idempotency), seed-queue-from-openspec.mjs (delta verification)

**Bootstrap seed tasks (committed Day 0 to drive Days 1–3 autonomous work):**

The seed tasks ARE the implementation work for Phases 2–4, scoped atomically so a Groq-driven bot can attempt each in <90 min. tasks.md will enumerate the ~15–20 atomic tasks. Phase 1 is bootstrapped by Claude in this session (not a seed task — chicken-and-egg).

### Out of Scope

- VM migration (deferred to design.md Open Question + future change)
- Autonomous backlog grooming (deferred — for this change, grooming is interactive Claude+Bryce only)
- Web dashboard (terminal CLI + markdown dashboard only)
- Cursor Automations integration (re-evaluable if free-tier quality is insufficient)
- GitHub Actions integration (deferred)
- Changes to LinguaFlow itself — this change only modifies the framework; LinguaFlow consumes the multi-project registry as a configured client
- New agent personas — uses existing agent templates; no new agents hired
- Voice/WhatsApp grooming intake — exists already via OpenClaw, no changes needed here
- **PM dashboard UI** — Bryce will use Paperclip (`~/paperclip`, self-hosted) for the visual layer; no custom dashboard work in this change
- Paperclip token-optimization work — covered in a separate research-driven change (see open research item)

---

## Next Step

If approved: proceed to design phase. design.md will lock:

- systemd unit naming convention (`sdlc-<job>.service` / `.timer`)
- `projects.json` schema (field types, defaults, validation)
- `log.mjs` JSON-line format (which keys are required vs optional)
- Release pipeline strategy (tag-on-merge vs manual-fire)
- Token-budget guardrails per cron (hard cap, soft cap, fallback chain triggers)
- **Open Question:** when (not whether) to migrate to a VM for 24/7 operation — likely a future change `vm-migration` once Bryce locates the Norwegian VM credentials

Then specs/ deltas, then tasks.md (which IS the bootstrap plan for Days 1–3), then Phase 1 manual implementation in this session.
