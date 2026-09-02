# Proposal: business-os

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: proposed

---

## Problem

Bryce wants one place — Telegram — to run **both** his business and his personal
work: a standing roster of every project and client, the ability to say "here's a
new idea" or "what's the state of Tally?" and have the system take it from
requirements → wireframe → product → deploy, leaning on the component library,
the RAG/rules corpus, and the customized harness that already exist. Ultimately
this becomes the delivery vehicle for **other people's businesses**, which means
it must be able to tell a paying customer's production database from a scratch
one.

About 90% of the machinery for this is already built. Five things stand between
what exists and what Bryce described.

### 1. The system is cold — nothing has run in a month

- `hermes-gateway.service` is `inactive` and `disabled`. Its own state file
  (`~/.hermes/gateway_state.json`) records the last Telegram connection at
  **2026-08-01T21:19:29Z**. The gateway is the only thing that answers Telegram.
- All **20** `sdlc-sched-*` timers are present but `disabled` — including
  `autonomous-drain`, `pr-auto-review`, `kanban-sync`, `deploy-reconcile`, and
  the daily/weekly self-improvement cycles. `systemctl --user list-timers
  'sdlc-sched-*'` lists **zero**.
- Ironically the thing previously recorded as the blocker is **resolved**:
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_DEPLOY_BOT_TOKEN` are
  all present in `~/.hermes/.env`.

So the system did not fail — it was switched off and nothing said so. There is
no liveness signal: a month of silence is indistinguishable from a month of
nothing needing attention.

### 2. There is no portfolio — the framework has no idea what Bryce works on

The framework is strictly **per-repo**: `load-config.mjs` walks up from CWD
looking for an `agents/project.json`. There is no object anywhere that
enumerates the portfolio. `agents/projects.json` does not exist;
`agent-registry.mjs` registers *agents*, not projects; `scheduler-install.mjs`
contains no `projects` concept (timers are hand-registered per mission).

Consequence: `mission-bootstrap.mjs` can create a **new** project brilliantly,
but the Telegram agent cannot answer "what am I working on," "what's blocked,"
"which of these has a customer," or "add this to the willtopaint list." The real
portfolio — tally/granary.farm, LinguaFlow, willtopaint, personal-website,
nellis-scout, peach-shaker-5000, cyberdeck, ai-gateway, personal-tools,
component-library and this framework — exists only in Claude's memory files and
in Bryce's head. An operating system for a business cannot be missing the list
of the business's work.

### 3. There is no environment or tenancy model — the blocking risk for client work

`docs/MISSION_PLAYBOOK.md` §3 provisions **exactly one** Supabase project per
mission, in Bryce's personal org (`pokrglvhuuyufsiuanql`), free tier. There is
no staging/prod split, no notion of an account the *client* owns, and no
structural marker distinguishing a database with real customer rows from a
throwaway.

`agents/deploy-runner.mjs` knows only `vercel --prod` — grepping it for
`staging|preview|production` returns one comment line. The approval gate is
sha-bound and works, but it gates *a* deploy, not *which environment*.

Meanwhile **tally/granary.farm has a real paying customer** (Texas Olive Ranch)
with imported production data. Today an autonomous agent handed a credential has
no mechanical way to know that. Every guardrail protecting that data is prose in
a playbook. That is acceptable for a solo hobby loop and unacceptable the moment
this system is pointed at someone else's business — which is the stated goal.

### 4. Personal and non-code work has nowhere to live

The task schema (`tasks/queue/*.json`) is code-shaped: `files[]`,
`test_status`, `assignee: <agent>`, `estimatedTokens`, and a drain that expects
a testCmd. There is no representation for "call the accountant," "follow up with
Will about the Patreon copy," or "renew the domain." So Telegram cannot be the
one place Bryce talks to — half his life has to live somewhere else, and a
second place to look is the same as no place to look.

### 5. Requirements never become a wireframe before code

Every ingredient exists and none are in the pipeline: the `jony-ive-design`
skill (product thinking), the live design workspace at brycewadley.com/design,
the `component-library` Hermes skill wrapping 44 copy-source components with a
mandatory search-first workflow. But `MISSION_PLAYBOOK.md` goes intake (§1) →
bootstrap (§2) → Supabase (§3) → **straight to seeding build tasks** (§4).
Nothing produces an artifact a client can look at and react to before code is
written — which is exactly the step that makes this sellable to other
businesses, and exactly the step where the component library should be consulted
so the build reuses instead of reinventing.

---

## Discovery

- **Files examined**:
  - Runtime state: `systemctl --user list-unit-files` (20 `sdlc-sched-*`
    timers, all `disabled`; `hermes-gateway.service` `disabled`/`inactive`),
    `~/.hermes/gateway_state.json` (last Telegram connect 2026-08-01),
    `~/.hermes/.env` (Telegram + OpenRouter + GitHub tokens present),
    `~/.hermes/config.yaml` (OpenRouter ladder, `terminal.backend: local`,
    plugins `agentic-sdlc`/`drain`/`openrouter` enabled, `chronos` disabled).
  - Framework: `agents/project.json`, `agents/load-config.mjs`,
    `agents/mission-bootstrap.mjs`, `agents/deploy-runner.mjs`,
    `agents/command-center-sync.mjs`, `agents/kanban-bridge.mjs`,
    `agents/agent-registry.mjs`, `agents/scheduler-install.mjs`,
    `agents/cron-schedule.json`, `agents/domains.json`, `agents/budget.json`,
    `tasks/queue/*.json` (13 tasks).
  - Docs: `docs/MISSION_PLAYBOOK.md`, `docs/hermes-backlog-bridge.md`,
    `docs/RUNBOOK.md`, `openspec/README.md`, `openspec/BACKLOG.md`.
  - Hermes skills: `~/.hermes/skills/{component-library,sdlc-mission,sdlc-backlog,rag-specialist,agentic-sdlc-enhanced}/SKILL.md`.
  - Historic changes (28 active, 39 archived), read in full for the six that
    bear on this: `mission-intake`, `telegram-activation`, `hermes-integration`,
    `openrouter-provider`, `command-center-bridge`,
    `level-6-autonomous-activation`.
- **Existing patterns**:
  - Zero npm dependencies, Node stdlib only; every script `__isMainModule`-
    guarded and shipped with a test (non-negotiable rules #1, #9).
  - JSON-file-as-ledger with an idempotent sync pass — `command-center-sync.mjs`
    is the canonical shape (`sync` / `status` dry-run, links file in `pm/`).
  - Sha-bound Telegram approval before any privileged action —
    `deploy-runner.mjs` + `@Nels_hermes_deploy_bot`, proven end-to-end
    (`deploy-approval-usability`, 20/20 tasks).
  - Idempotent one-command provisioning with `--dry-run` —
    `mission-bootstrap.mjs`.
  - Search-first-then-build enforcement — the `component-library` skill's
    mandatory workflow with exit-code-signalling `bin/search.mjs`.
- **Existing tests**: 23 test files across `tests/` and `agents/__tests__/`;
  `four-layer-validate.mjs` (5 layers) and `test-behavior.mjs` are the gates.
  No tests exist for portfolio, environment tiering, or non-code tasks — all
  net-new surface.
- **Key findings**:
  1. The blockers recorded in memory are stale: Telegram tokens exist, the
     deploy approval chain shipped, `terminal.backend` is already `local`. The
     live blocker is simply that **everything is switched off**.
  2. `hermes-integration` (37/37), `openrouter-provider` (18/18),
     `autonomous-drain` (16/16), `scheduler-daemon` (17/17),
     `deploy-approval-usability` (20/20), `mission-intake` (11/11) and
     `command-center-visibility` (17/17) are task-complete but still marked
     `proposed` — the repo understates itself, which is why the gaps look
     bigger than they are.
  3. Every gap above is **additive** to shipped rails. Nothing here requires
     rewriting the drain, the approval gate, or Hermes.
  4. The one genuinely new *safety* surface is environment tiering. It is the
     only part of this change that touches a path leading to a real customer's
     data, and it should be built deny-by-default.

---

## Proposed Solution

Turn the existing autonomous SDLC into a **portfolio operating system** by adding
four thin, additive layers on the shipped rails, and switching the machine back
on with a heartbeat so it can never again go quiet unnoticed.

**A. Cold start + liveness.** Enable and start `hermes-gateway.service` and the
20 `sdlc-sched-*` timers; add a `sdlc-sched-heartbeat` timer that posts a daily
one-line Telegram digest (timers alive, drain ticks in 24h, open approvals,
blocked tasks, spend). Silence becomes a signal instead of an ambiguity.

**B. The portfolio ledger (`pm/portfolio.json` + `agents/portfolio.mjs`).** One
entry per project: name, repo, local path, `owner: self | client`, client name,
live URL, lifecycle stage, cadence, whether autonomous drain is enabled, and a
free-text "what this is." Seeded from the existing repos. `portfolio.mjs`
exposes `list | show | add | status | sync`, follows the `command-center-sync`
shape, and feeds the existing kanban board so the roster appears in the command
center. A new `sdlc-portfolio` Hermes skill makes "what am I working on" and
"add X to willtopaint" answerable from Telegram. **This absorbs, rather than
duplicates, the unbuilt `projects.json` + `agents/projects.mjs` registry
specified in `level-6-autonomous-activation` T-103/T-104** — those tasks are
marked superseded during design (see Cross-Feature Notes).

**C. Environment tiering + the credential guard (`agents/env-guard.mjs`).** Each
portfolio entry gains an `environments` block: named environments, each with a
`tier` — `customer-production` | `internal-production` | `scratch` — the
credential **variable names** (never values), and `agent_writable: true|false`.
`env-guard.mjs` is a preflight every agent DB/deploy/migration action must call:
`scratch` proceeds freely, `internal-production` warns and notifies,
`customer-production` is **deny-by-default** and requires the same sha-bound
Telegram approval the deploy pipeline already uses. `mission-bootstrap.mjs` is
extended to provision a **staging + production pair** and register both, and to
support a client-owned account rather than assuming Bryce's org. Tally/Granary
(and its Texas Olive Ranch data) is registered as `customer-production` as the
first real entry.

**D. The personal + non-code lane.** Extend the task schema with
`kind: "code" | "chore" | "note"` (absent = `code`, so every existing task and
the drain are unaffected). The drain claims only `kind: code`. A `personal`
portfolio entry holds the rest. An `sdlc-inbox` Hermes skill lets Bryce dictate
items to Telegram; the daily heartbeat reads them back. One place to talk to.

**E. The wireframe gate.** Insert a design step into `MISSION_PLAYBOOK.md`
between requirements and build tasks: the mission agent runs the
component-library search **first**, produces a wireframe against the `/design`
workspace, delivers it to Telegram as an image, and waits for Bryce's OK before
seeding build tasks. Requirements → wireframe → product becomes the actual
pipeline, and reuse is enforced at the moment the UI is decided rather than
after.

Everything is zero-dependency Node stdlib, every script tested and
`__isMainModule`-guarded, and every new file additive.

---

## Value Analysis

### Benefits

- **Turns a switched-off pile of shipped machinery into a running system.**
  Workstream A alone recovers a month of dormant capability at near-zero cost,
  and the heartbeat makes a repeat structurally impossible.
- **Answers the question the system currently cannot**: "what am I working on,
  for whom, and what's blocked" — from a phone, without a terminal.
- **Removes the single blocker to client work.** Today the only thing standing
  between an autonomous agent and Texas Olive Ranch's production rows is prose
  in a playbook. Tiering makes it a deny-by-default preflight with an approval
  gate that is already proven in production.
- **Makes Telegram the whole surface.** Code work and life admin land in one
  inbox; the daily digest closes the loop.
- **Enforces reuse where it pays.** The component library is consulted at
  wireframe time — before a line of UI is written — instead of being a rule
  nobody reaches for mid-build.
- **Everything is measurable**: timers running, heartbeat delivered, portfolio
  entries with a tier set, `customer-production` writes requiring approval,
  wireframe artifact present before a mission's first build task.

### Costs

- **Effort**: **L**. Roughly: 3 new scripts (`portfolio.mjs`, `env-guard.mjs`,
  `heartbeat.mjs`) + tests, 2 schema extensions (portfolio entry,
  task `kind`), 2 script extensions (`mission-bootstrap.mjs` for env pairs and
  client-owned accounts, `deploy-runner.mjs` for env awareness), 2 Hermes skills
  (`sdlc-portfolio`, `sdlc-inbox`), 1 playbook rewrite, and the operational
  cold-start. No new dependencies.
- **Risk**:
  - *Highest* — `env-guard.mjs` sits on a path to real customer data. Mitigated
    by deny-by-default (a missing or unknown tier denies), by never storing
    credential values in the ledger (names only), and by reusing the proven
    approval gate rather than inventing one.
  - *Moderate* — switching 20 timers on at once after a month could produce a
    burst of drain activity and notification noise. Mitigated by enabling in two
    waves (housekeeping timers first, then drain/deploy) and verifying the queue
    before the drain wave.
  - *Low* — the task-schema and portfolio additions are additive and default to
    today's behavior.
- **Dependencies**: none blocking. It sits on top of `hermes-integration`,
  `telegram-activation`, `mission-intake`, `autonomous-deploy-pipeline`, and
  `command-center-visibility` — all task-complete. It does **not** depend on the
  half-finished changes (`level-6-autonomous-activation` 3/46,
  `competitive-roadmap` 8/23, `onboarding-and-context-diet` 8/28), which stay
  parked.

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Build a custom framework to replace Hermes | Hermes already provides the Telegram gateway, tool-calling agent, skills, kanban, sandboxes, and OpenRouter fallback ladder — all working and integrated. Replacing it discards a year of proven rails to re-earn the same capabilities. This change is a portfolio layer *on* Hermes, not instead of it. |
| Use Hermes' kanban (`kanban.db`) as the portfolio ledger | The kanban is the *view*, not the source — it is SQLite-in-`~/.hermes`, not versioned, not reviewable in a PR, and not readable by the framework's stdlib scripts without shelling out. `pm/portfolio.json` stays the source of truth and syncs into the board through the existing bridge, matching the "three runtimes, one ledger" principle already established. |
| Finish `level-6-autonomous-activation` first (46 tasks) | It is a maturity-score change, not a capability change; its remaining work does not unblock any part of Bryce's stated vision, and starting there delays the cold start by weeks. Portfolio + tiering raise the same Observability and Deployment dimensions as a side effect. |
| Rely on the playbook's prose guardrails for client data | Prose does not survive a model swap, a context compaction, or a cheap fallback rung. The whole point of the framework is that guardrails are code with tests. |
| Add environment tiering later, after client work starts | The first client engagement is exactly when the guardrail must already exist. Retrofitting a safety boundary around live customer data is strictly worse than building it while the only customer relationship is one Bryce controls end to end. |
| Do nothing | The machinery stays off, the portfolio stays in Bryce's head, and the system cannot be pointed at another business without risking someone's production data. |

### Decision

**Yes — build it, in the order A → B → C → D → E.** Workstream A is hours and
recovers everything already paid for. B and C are the two layers that convert a
personal automation loop into something that can be sold as a service, and C is
the one that must exist before the first client credential is handed to an
agent. D and E are the layers that make the daily experience match the stated
vision ("one place I talk to", "requirements to wireframes to products"), and
both ride entirely on artifacts that already exist.

---

## Scope

### In Scope

- Enabling and starting `hermes-gateway.service` + the 20 `sdlc-sched-*` timers,
  in two waves, with verification.
- `agents/heartbeat.mjs` + `sdlc-sched-heartbeat` timer — daily Telegram digest.
- `pm/portfolio.json` schema + `agents/portfolio.mjs`
  (`list|show|add|status|sync`) + seeding from existing repos.
- Portfolio → kanban surfacing through the existing `command-center-sync`
  bridge.
- Environment tiering on portfolio entries + `agents/env-guard.mjs`
  deny-by-default preflight, wired into the deploy and DB paths.
- `mission-bootstrap.mjs`: staging + production environment pairs;
  client-owned account support; portfolio registration on create.
- `deploy-runner.mjs`: environment-aware deploys (which env, not just "prod").
- Task schema `kind` field; drain claims `kind: code` only; `personal`
  portfolio entry.
- Hermes skills `sdlc-portfolio` and `sdlc-inbox`.
- `MISSION_PLAYBOOK.md` rewrite: component-library search + wireframe gate
  between requirements and build tasks.
- Tests for every new script; `four-layer-validate` and `test-behavior` clean.
- Registering the real portfolio, with Tally/Granary marked
  `customer-production`.

### Out of Scope

- Replacing or forking Hermes.
- The parked in-flight changes (`level-6-autonomous-activation`,
  `competitive-roadmap`, `onboarding-and-context-diet`,
  `anthropic-native-compaction`, `whatsapp-router-provider-swap`,
  `cost-tracker-otel`, `replay-regression-ci-gate`).
- Multi-user / team access, client-facing logins, or any UI a client logs into.
- Billing, invoicing, contracts, or time tracking.
- Migrating existing project data between Supabase accounts.
- Automated *creation* of client-owned cloud accounts (the guard covers using
  them; provisioning someone else's account stays a human step).
- Any new npm dependency, any OpenAI dependency, any always-on listening.

---

## Cross-Feature Notes

`node agents/cross-feature-analyze.mjs` flags 25 overlaps involving this change.
Reviewed; none block, and one requires a deliberate decision:

- **`level-6-autonomous-activation` (3/46, parked) — `agents/projects.json` +
  `agents/projects.mjs`.** A real duplication: that change specifies a central
  project registry with `enable/disable/list/add/remove/status`, which was never
  built (its timers were delivered by `scheduler-daemon` instead). The portfolio
  ledger is a strict superset of it — same verbs, plus ownership, client,
  environments, and tiering. **Decision: extend, do not fork.** `pm/portfolio.json`
  is the single registry; T-103/T-104 are marked superseded in design, and the
  `enabled` toggle they specify is carried forward as a portfolio field.
- **`deploy-runner.mjs`** — overlaps `autonomous-deploy-pipeline`,
  `deploy-approval-usability`, `operator-desktop-launcher`,
  `maturity-reconciliation`. All are task-complete and merged; this change adds
  an environment argument to a working runner rather than reshaping it. The
  sha-bound approval flow is reused verbatim, not reimplemented.
- **`command-center-sync.mjs` / `kanban-bridge.mjs`** — overlaps
  `command-center-visibility` (17/17) and `command-center-parked-lane` (11/11),
  both complete. The portfolio sync adds a new card source through the existing
  bridge API; no change to the lane mapping or the links file format.
- **`agents/scheduler-install.mjs`, `agents/cron-schedule.json`** — overlaps
  `scheduler-daemon` (17/17) and `telegram-activation` (9/12). This change adds
  one timer entry (`heartbeat`) using the established generator; it does not
  alter unit generation. `telegram-activation`'s three open tasks are the host
  steps this change's Workstream A performs — they should be closed by it, not
  re-done.
- **`agents/budget.json`, `.hermes/config.yaml`** — overlaps several complete
  provider changes. This change does not modify model ladders or provider
  config; the flags come from file mentions in prose. No action.
- **`agents/project.json`** — overlaps `pilot-autonomous-replication`,
  `maturity-reconciliation`, `scheduler-daemon`, `telegram-activation`. Per-repo
  config stays authoritative for its own repo; the portfolio references projects,
  it does not replace their `project.json`.
- **`docs/MISSION_PLAYBOOK.md`** — overlaps `mission-intake` (11/11, complete).
  Workstream E rewrites §3–§4 of the playbook that change authored. Intentional
  and additive: the environment pair and the wireframe gate slot into the
  existing numbered procedure.

---

## Next Step

If approved: proceed to design phase using `openspec-continue-change`. The design
must settle, at minimum: the `pm/portfolio.json` schema; the exact `env-guard`
decision table and its failure-closed semantics; where the guard is invoked from
so it cannot be bypassed; and the wireframe artifact's format and hand-off.
