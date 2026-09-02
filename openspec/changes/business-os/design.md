# Design: business-os

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: design

---

## Context

### Current State

**Runtime (verified this session, 2026-09-02).** Workstream A is already executed
— recorded here because the design's later phases assume it:

- `hermes-gateway.service` was `disabled`/`inactive` since **2026-08-01**. Now
  `enabled --now`; Telegram reconnected at 16:46:38Z, 60 commands registered,
  clean start.
- 18 `sdlc-sched-*` timers plus `sdlc-update` existed but were all `disabled`.
  **Wave 1 (12 units — housekeeping only)** is enabled and every catch-up run
  returned `success`: `daily-review`, `backlog-review`, `daily-cost-report`,
  `doc-sync-daily`, `health-check-daily`, `kanban-sync`, `model-manager-check`,
  `monthly-behavior-audit`, `rag-index-weekly`, `red-team-weekly`,
  `weekly-pattern-hunt`, `sdlc-update`.
- **Wave 2 (7 units) is deliberately still disabled**: `autonomous-drain`,
  `pilot-drain`, `personal-website-drain`, `pr-auto-review`, `pilot-review`,
  `personal-website-review`, `deploy-reconcile`. These write code, merge PRs, and
  deploy. They stay off until Workstream C's guard exists (see Decision 5).
- `command-center-sync.mjs` verified working end to end: 29 changes, 374
  sub-tasks, 8 backlog ideas, 13 queue tasks synced to the board; the following
  15-minute tick was a clean idempotent no-op.
- Network verified: `net-doctor` reports OK, IPv4 precedence in effect for both
  `openrouter.ai` and `api.telegram.org`.

**Framework.** Config resolution is per-repo: `load-config.mjs` walks CWD upward
for `agents/project.json`. There is no portfolio object anywhere;
`agents/projects.json` does not exist. `agents/deploy-runner.mjs` is a
reconciling state machine gated on single-use sha-bound `APPROVE <sha8>` tokens
from a second Telegram bot, but it targets exactly one thing: `vercel --prod`.
Task JSON in `tasks/queue/` is code-shaped (`files[]`, `test_status`,
`estimatedTokens`, `blockedBy[]`). `docs/MISSION_PLAYBOOK.md` runs intake →
`mission-bootstrap.mjs` → optional single Supabase project → seed build tasks.

**Two defects found while verifying Workstream A** (both in scope here):

1. `agents/cycles/daily-review.mjs:231` replaces `/\*\*Last Updated:\*\* .*/`
   (capital U) but `pm/DASHBOARD.md` contains `**Last updated:**` (lowercase).
   The regex never matches, so the dashboard's own date has read
   **2026-04-07 since April** while the script rewrites the file and exits 0
   daily. Its `## Recent Activity` insert targets a heading the dashboard does
   not have either (it has `## Recent Changes (OpenSpec)`), so no activity row
   is ever added. The daily review has been a silent no-op on its primary
   artifact.
2. `pm/` is gitignored (0 tracked files). Any ledger placed there is
   unversioned, unreviewable, and lost with the machine — which matters
   because Bryce owns one computer and no spare parts.

### Problem Restatement

Give the framework a durable, versioned model of **what work exists, who owns
it, and which environments are real**, so a single Telegram surface can run the
portfolio — and so no autonomous agent can reach a paying customer's production
data without an explicit, human-approved gate.

---

## Goals

Each is independently verifiable:

1. `systemctl --user list-timers 'sdlc-*'` lists running timers, the gateway is
   `active`, and a daily Telegram heartbeat arrives — so a second outage is
   visible within 24 hours instead of 32 days.
2. `node agents/portfolio.mjs list` answers "what am I working on, for whom, and
   what state is it in" from one versioned file, and the same roster appears on
   the command-center board.
3. Every environment an agent can reach carries a `tier`. `env-guard.mjs`
   **denies** any write to `customer-production` without a fresh sha-bound
   approval, and **denies on unknown, missing, or malformed tier**.
4. A `chore`/`note` task can be captured from Telegram, is never claimed by the
   drain, and is read back in the heartbeat.
5. No mission seeds build tasks until a wireframe artifact exists and Bryce has
   approved it; the component-library search runs before the wireframe.
6. `pm/DASHBOARD.md` shows today's date after a daily review.
7. `npm test`, `four-layer-validate.mjs`, and `test-behavior.mjs` stay green;
   zero new npm dependencies.

## Non-Goals

- Replacing Hermes, the drain, the approval bot, or the kanban board.
- Un-parking `level-6-autonomous-activation`, `competitive-roadmap`, or
  `onboarding-and-context-diet`.
- Multi-user access, client logins, billing, invoicing, or time tracking.
- Provisioning cloud accounts **owned by a client** (using them is in scope;
  creating them stays a human step — see Decision 6).
- Migrating existing project data between Supabase accounts.
- Turning wave 2 on as part of this design's implementation. Wave 2 is gated on
  Workstream C landing and is its own explicit task.

---

## Design

### Overview

Four additive layers on shipped rails. The spine is one new versioned file —
`portfolio.json` at the repo root — that every other layer reads. `portfolio.mjs`
maintains it, `env-guard.mjs` enforces the safety facts inside it,
`heartbeat.mjs` reports from it, `command-center-sync.mjs` projects it onto the
board, and two Hermes skills make it reachable from Telegram. Nothing here
rewrites an existing subsystem; `deploy-runner.mjs` and `mission-bootstrap.mjs`
gain parameters, not new architectures.

### Components

#### 1. `portfolio.json` (repo root)

**File(s)**: `portfolio.json`, `agents/schemas/portfolio.schema.json`

The single registry. Versioned in git, reviewable in a PR, contains **no secret
values** — only environment-variable *names*. Supersedes the unbuilt
`projects.json` from `level-6-autonomous-activation` T-103/T-104, carrying
forward its `enabled` toggle.

#### 2. `agents/portfolio.mjs`

**File(s)**: `agents/portfolio.mjs`, `agents/__tests__/portfolio.test.mjs`

CLI: `list | show <name> | add | set <name> <key> <value> | status | validate`.
Stdlib only, `__isMainModule`-guarded, exports its functions for tests. `status`
is the dry-run/report mode matching the established `command-center-sync` shape.
`validate` runs the schema check and is wired into `four-layer-validate.mjs` so a
malformed portfolio fails validation rather than failing at runtime.

#### 3. `agents/env-guard.mjs`

**File(s)**: `agents/env-guard.mjs`, `agents/__tests__/env-guard.test.mjs`

The safety boundary. One exported function plus a CLI:

```
checkAccess({ project, environment, operation }) → { allowed, tier, reason, approvalToken? }
```

`operation` ∈ `read | write | migrate | deploy`. Decision table:

| tier | read | write / migrate / deploy |
|---|---|---|
| `scratch` | allow | allow |
| `internal-production` | allow | allow + notify Telegram (post-hoc record) |
| `customer-production` | allow + record | **deny** unless a fresh single-use sha-bound approval is presented |
| missing / unknown / malformed | **deny** | **deny** |

Fails closed on every error path: unreadable portfolio, unparseable JSON, project
not found, environment not found, tier absent — all deny. The
`customer-production` approval reuses `deploy-runner.mjs`'s existing token
mechanism verbatim rather than introducing a second approval concept.

#### 4. `agents/heartbeat.mjs` + `sdlc-sched-heartbeat` timer

**File(s)**: `agents/heartbeat.mjs`, `agents/__tests__/heartbeat.test.mjs`,
entry in `agents/cron-schedule.json`

One daily Telegram message via the existing `notify.mjs`: timers alive vs
expected, drain ticks in 24h, PRs merged, open deploy approvals, blocked tasks,
open `chore`/`note` items, today's spend, and any health-check degradation. Sent
**even when everything is nominal** — a silent channel is the failure mode this
change exists to eliminate. Exits non-zero if it cannot deliver, so a failed
heartbeat is itself visible in `systemctl --failed`.

#### 5. Task `kind` + the personal lane

**File(s)**: `agents/schemas/task.schema.json`, `agents/queue-drainer.mjs`,
`agents/seed-queue-from-openspec.mjs`, `agents/command-center-sync.mjs`

Adds `kind: "code" | "chore" | "note"`. **Absent means `code`**, so all 13
existing tasks and the drain behave identically. `queue-drainer.mjs` filters to
`kind === 'code'` (treating absent as `code`) when claiming. `chore`/`note`
items sync to the board like any other card and are summarized by the heartbeat.

#### 6. `deploy-runner.mjs` — environment awareness

**File(s)**: `agents/deploy-runner.mjs`

Gains `--environment <name>` (default: the portfolio entry's environment marked
`default_deploy`). Before deploying it calls `env-guard.checkAccess({operation:
'deploy'})`. The existing reconcile/approve/smoke/rollback state machine is
untouched; the guard is a precondition in front of it.

#### 7. `mission-bootstrap.mjs` — environment pairs

**File(s)**: `agents/mission-bootstrap.mjs`, `docs/MISSION_PLAYBOOK.md`

Provisions a **staging + production pair** instead of one database, registers
both in `portfolio.json` with explicit tiers (new missions default to
`scratch` for staging and `internal-production` for production — a mission is
never born `customer-production`; promoting it is a deliberate human edit), and
adds the new project to the portfolio. `--client <name>` marks the entry
`owner: client`.

#### 8. Hermes skills

**File(s)**: `~/.hermes/skills/sdlc-portfolio/SKILL.md`,
`~/.hermes/skills/sdlc-inbox/SKILL.md` (sources kept in `skills/` and installed,
matching how `sdlc-mission` was shipped)

`sdlc-portfolio` teaches the Telegram agent to answer roster questions by
shelling out to `portfolio.mjs`. `sdlc-inbox` captures `chore`/`note` items into
the queue.

#### 9. Wireframe gate

**File(s)**: `docs/MISSION_PLAYBOOK.md`

A new §4 between requirements and task-seeding: run
`node ~/component-library/bin/search.mjs <keywords>` **first**, record hits and
misses, produce a wireframe as a `.dc.html`-compatible artifact committed to the
new repo under `design/`, deliver it to Telegram as an image via
`telegram-notify.mjs sendDocument`, and **stop** until Bryce replies. Only then
seed build tasks. Existing §4 (task seeding) becomes §5, §5 (report) becomes §6.

#### 10. Dashboard defect fix

**File(s)**: `agents/cycles/daily-review.mjs`

Case-insensitive `Last updated` match, and insert the activity row into the
heading that actually exists. Regression test asserting the written dashboard
carries today's date.

### Data Flow

```
Telegram message ("what's the state of tally?" / "new idea: X" / "remind me to Y")
   │
   ▼
hermes-gateway (systemd, active) ──► skill: sdlc-portfolio | sdlc-mission | sdlc-inbox
   │                                     │
   │                                     ├─ portfolio.mjs  ──► portfolio.json (git)
   │                                     ├─ mission-bootstrap.mjs ──► repo + staging/prod pair
   │                                     │        └─ component-library search ──► wireframe ──► [BRYCE APPROVES]
   │                                     └─ tasks/queue/*.json (kind: code|chore|note)
   ▼
timers ── kind:code ──► queue-drainer ──► PR ──► pr-auto-review ──► merge
   │                                                                  │
   │                                                                  ▼
   │                                                       deploy-runner --environment <e>
   │                                                                  │
   │                                                      env-guard.checkAccess()
   │                                          scratch → allow │ internal → allow+notify
   │                                          customer-production → DENY without APPROVE <sha8>
   │                                          unknown/missing → DENY
   ▼
heartbeat.mjs (daily) ──► notify.mjs ──► Telegram   [sent even when nominal]
```

### Schema / Interface Changes

```jsonc
// portfolio.json (repo root, versioned, NO secret values)
{
  "version": 1,
  "projects": [
    {
      "name": "tally",                       // kebab-case, unique, primary key
      "description": "Multi-tenant inventory SaaS for grow-and-sell farms",
      "owner": "client",                     // "self" | "client"
      "client": "Texas Olive Ranch",         // required when owner === "client"
      "repo": "that-gum-you-like/tally",
      "path": "/home/bryce/tally",
      "liveUrl": "https://granary.farm",
      "stage": "live",                       // idea|design|build|live|maintenance|parked
      "enabled": false,                      // autonomous drain toggle (from level-6 T-103)
      "cadence": "weekly",
      "environments": [
        {
          "name": "production",
          "tier": "customer-production",     // REQUIRED; no default — absent denies
          "provider": "supabase",
          "ref": "<project-ref>",
          "credentialVars": ["TALLY_PROD_SUPABASE_URL", "TALLY_PROD_SERVICE_ROLE_KEY"],
          "agentWritable": false,
          "defaultDeploy": true
        },
        {
          "name": "staging",
          "tier": "scratch",
          "provider": "supabase",
          "credentialVars": ["TALLY_STAGING_SUPABASE_URL"],
          "agentWritable": true
        }
      ]
    }
  ]
}
```

```jsonc
// tasks/queue/<id>.json — additive field
{
  "kind": "code"    // "code" (default when absent) | "chore" | "note"
}
```

```js
// agents/env-guard.mjs
export function checkAccess({ project, environment, operation, approval }) {
  // → { allowed: boolean, tier: string|null, reason: string, requiresApproval: boolean }
  // Throws never; every failure path returns { allowed: false }.
}
```

---

## Decisions

### Decision 1: The portfolio ledger lives at the repo root, not in `pm/`

**Chosen**: `portfolio.json` at the repo root, tracked in git.

**Considered**: `pm/portfolio.json` (as originally proposed); Hermes'
`kanban.db`; a new `agents/projects.json`.

**Rationale**: `pm/` is gitignored with zero tracked files — it is regenerated
runtime state. The roster is the opposite: durable, reviewable, and the thing
that must survive a machine rebuild, which is not hypothetical when Bryce owns
one computer and no spare parts. `kanban.db` is SQLite in `~/.hermes`, also
unversioned, and is the *view* rather than the source. Repo root also matches
where `level-6` intended `projects.json`, so this reads as the promised registry
finally landing rather than a fourth competing location. It holds no secrets —
only variable names — so committing it is safe in a private repo.

### Decision 2: Absorb `level-6` T-103/T-104 rather than fork a second registry

**Chosen**: `portfolio.json` + `portfolio.mjs` are a strict superset of the
specified-but-unbuilt `projects.json` + `projects.mjs`; those tasks are marked
superseded, and their `enabled` toggle is carried forward as a field.

**Considered**: Building `projects.json` first as specified, then layering
portfolio data on top; leaving both.

**Rationale**: Two registries is the failure this framework's own rules forbid
("never duplicate"), and `level-6` is parked at 3/46 with no plan to resume.
Adopting its one good idea and retiring the tasks is honest bookkeeping.

### Decision 3: `env-guard` fails closed, including on absent tier

**Chosen**: Deny on missing, unknown, or malformed tier. No default tier exists.

**Considered**: Defaulting an unspecified tier to `scratch` (convenient);
defaulting to `customer-production` (safe but makes every new project need
ceremony).

**Rationale**: A default of `scratch` means the *one* case that matters —
somebody added an environment and forgot the tier — silently becomes the
permissive case. Defaulting to `customer-production` fails closed but trains
people to bypass the guard. Requiring the field explicitly means the schema
validator catches omissions at commit time, and the runtime denies if one slips
through. A guard that can be defeated by an omission is decoration.

### Decision 4: Reuse the deploy approval token; do not invent a second approval

**Chosen**: `customer-production` writes require the same single-use, sha-bound
`APPROVE <sha8>` token flow already implemented in `deploy-runner.mjs` against
the second Telegram bot.

**Considered**: A separate DB-approval bot/command; a time-boxed "unlock
window"; an allowlist file.

**Rationale**: The mechanism is already built, tested, and proven end to end
(`deploy-approval-usability`, 20/20). A second approval concept doubles the
surface Bryce must understand and creates two things to get wrong. An unlock
window is strictly worse than per-action approval — it grants blanket access
across a period nobody is watching.

### Decision 5: Wave 2 stays off until the guard lands

**Chosen**: `autonomous-drain`, the three review/merge timers, the two other
drain timers, and `deploy-reconcile` remain disabled until `env-guard.mjs` is
implemented, tested, and wired into `deploy-runner.mjs`.

**Considered**: Turning everything on now and adding the guard afterward.

**Rationale**: `deploy-reconcile` is already configured with
`--project-dir /home/bryce/tally` — the repo behind granary.farm and a real
customer's data. Arming a deploy loop pointed at that path *before* the
environment tiering exists inverts the entire point of Workstream C. The cost of
waiting is a few days of no autonomous drain, which the system has been living
without for a month.

### Decision 6: Missions are never born `customer-production`

**Chosen**: `mission-bootstrap.mjs` registers new environments as `scratch`
(staging) and `internal-production` (production). Promotion to
`customer-production` is a hand edit to `portfolio.json`, reviewed in a commit.

**Considered**: A `--tier` flag on bootstrap; inferring the tier from whether
`--client` was passed.

**Rationale**: The moment a project starts holding someone else's data is a
business decision, not a bootstrap flag. Making it a reviewed commit means the
riskiest state transition in the system leaves a diff with a date and a message.
Inference from `--client` is exactly the kind of implicit magic that produces a
mis-tiered environment nobody remembers creating.

### Decision 7: `kind` defaults to `code` by absence

**Chosen**: No migration of the 13 existing tasks; absent `kind` is read as
`code` everywhere.

**Considered**: A migration script stamping `kind: "code"` on every existing
task; making `kind` required.

**Rationale**: Backward compatibility for free, zero risk to a live queue, and
the drain's filter is one predicate. A required field would break every existing
task file and every external writer of task JSON.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `env-guard` is bypassed because a caller forgets to invoke it | Medium | **Critical** — the whole point of the change | Invoke from the chokepoints, not the call sites: `deploy-runner.mjs` before deploy, and a documented `checkAccess` requirement in the playbook. Add a `four-layer-validate` rule flagging direct `supabase db push` / `vercel --prod` strings in agent-authored task descriptions. |
| A mis-tiered environment (typo, omission) grants access to real data | Medium | **Critical** | Tier is required with no default; schema validation in `portfolio.mjs validate` wired into `four-layer-validate`; runtime denies on anything it cannot positively identify as `scratch` or `internal-production`. |
| Wave 2 gets enabled before the guard exists | Low | **Critical** | Decision 5 makes it an explicit, separately-tracked task rather than a step inside another task. `deploy-reconcile` already points at `~/tally`. |
| `portfolio.json` drifts from reality and becomes another lying dashboard | **High** — this is exactly what happened to `pm/DASHBOARD.md` | Medium | The heartbeat reports portfolio entries whose repo path is missing, whose git HEAD hasn't moved in N days, or whose `stage` contradicts observed activity. A ledger nobody reconciles is worse than none. |
| Committing client names to a git repo | Low | Low | Private repo; no credential values, only variable names; `owner`/`client` are business facts Bryce already stores in memory files. |
| Heartbeat becomes noise and gets muted | Medium | Medium | One message per day, nominal state included but terse; anything abnormal leads. If it is muted the change has failed and should be revisited, not made louder. |
| Wireframe gate stalls missions waiting on Bryce | Medium | Low | The gate blocks *build task seeding*, not bootstrap. The repo, envs, and openspec artifacts are already in place when he replies. |
| A month of dormancy left stale queue/PR state that wave 2 acts on wrongly | Medium | Medium | Before enabling wave 2: audit `tasks/queue/`, open PRs, and `pm/.last-deployed` against `origin`. Explicit pre-flight task. |

---

## Testing Approach

- **Unit tests** (`agents/__tests__/`, node:test, stdlib):
  - `portfolio.test.mjs` — schema validation, all CLI verbs, malformed-file
    handling, superset behavior of the `enabled` toggle.
  - `env-guard.test.mjs` — the full decision table above, and every fail-closed
    path: missing file, unparseable JSON, unknown project, unknown environment,
    absent tier, unknown tier string, null/undefined operation. **This is the
    test file that matters most in the change**; it should read like an
    adversary's checklist.
  - `heartbeat.test.mjs` — composes a message from fixtures, non-zero exit on
    delivery failure, nominal-state message still sent.
  - `daily-review.test.mjs` — regression: written dashboard carries today's date.
- **Integration tests**:
  - `queue-drainer` given a mixed `code`/`chore`/`note` queue claims only
    `code`, including absent-`kind` tasks.
  - `deploy-runner --environment` against a `scratch` fixture proceeds; against a
    `customer-production` fixture denies without approval and proceeds with a
    valid token.
  - `command-center-sync` projects portfolio entries onto the board idempotently
    (second run = all zeros).
- **Manual verification**:
  - `portfolio.mjs list` from a Telegram message returns the real roster.
  - Heartbeat lands on Bryce's phone, once, readable.
  - A deliberate `customer-production` write attempt against tally is **denied**
    and the denial is visible — demonstrated before wave 2 is enabled.
  - A wireframe reaches Telegram as an image and no build tasks appear until it
    is approved.
  - `pm/DASHBOARD.md` shows today's date after a daily-review run.
- **Gates**: `npm test`, `node agents/four-layer-validate.mjs`,
  `node agents/test-behavior.mjs` all green; zero new npm dependencies.

---

## Next Step

Proceed to specs phase using `openspec-continue-change`. Specs should be written
in WHEN/THEN/AND form per capability: `portfolio-registry`,
`environment-tiering` (the largest, and the one whose scenarios become the
`env-guard` test file), `liveness-heartbeat`, `personal-task-lane`, and
`wireframe-gate`.
