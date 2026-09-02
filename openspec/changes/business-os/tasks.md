# Tasks: business-os

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: tasks

---

## Overview

Implements `design.md` and the five capability specs. Workstream A (cold start)
is already done and recorded below as a prerequisite, not a task.

**The critical path is Phase 1 → Phase 2 → Phase 3.** Nothing in Phases 4–6
unblocks the drain, and the drain stays off until Phase 3 closes, because
`deploy-reconcile` is already configured `--project-dir /home/bryce/tally` —
the repo behind granary.farm and Texas Olive Ranch's data.

Every script is Node stdlib only, `__isMainModule`-guarded, and ships with its
test in the same task. Zero new npm dependencies.

---

## Prerequisites

- [x] Design is approved
- [x] Specs are written and reviewed (25 REQs across 5 files)
- [x] **Workstream A complete (2026-09-02)**: `hermes-gateway.service`
      `enable --now`, Telegram reconnected; 12 housekeeping timers enabled, all
      catch-up runs `success`; `command-center-sync` verified idempotent
- [x] Wave 2 (7 drain/review/deploy timers) confirmed still `disabled`
- [x] `net-doctor` OK — IPv4 precedence in effect for openrouter.ai and
      api.telegram.org
- [ ] Bryce confirms which environments are genuinely `customer-production`
      (blocks T-302 only)

---

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|---|---|---|---|
| **Readiness gate (blocks all)** | sdlc-developer | T-001..T-005 | — |
| Portfolio foundation | sdlc-developer | T-101..T-105 | blocked-by T-003 |
| Environment guard (critical) | sdlc-developer | T-201..T-206 | blocked-by T-103 |
| Arm the system | sdlc-developer + Bryce | T-301..T-305 | blocked-by T-206 |
| Liveness | sdlc-developer | T-401..T-405 | parallel with Phase 2 |
| Personal lane | sdlc-developer | T-501..T-504 | parallel with Phase 2 |
| Wireframe gate | jony-aive + sdlc-developer | T-601..T-605 | blocked-by T-105 |
| Verify + document | sdlc-documentarian | T-701..T-705 | blocked-by all |

Phases 4 and 5 are genuinely parallel with Phase 2 — they touch no shared file.
Phase 6 touches `mission-bootstrap.mjs` and needs the portfolio writer from
Phase 1, but not the guard.

---

## Implementation Tasks

### Phase 0: Work-item readiness — GATES EVERYTHING ELSE

- [x] **T-001**: Add `readiness` ∈ `{draft, ready-for-dev, in-dev,
      ready-for-review, done}` to the change status schema; absence resolves to
      `draft` in every consumer.
  - Files: `agents/schemas/status.schema.json`, `openspec/templates/status.json.template`
  - Spec: work-item-readiness/REQ-001
  - Agent: sdlc-developer
  - Test: five values accepted, absence accepted and resolving to `draft`,
    unrecognized value rejected
  - Complexity: S

- [x] **T-002**: Narrow `seed-queue-from-openspec.mjs` — seed only when
      `isSeedable(status)` **and** `readiness === 'ready-for-dev'`. Report
      `not-ready` as a distinct skip reason.
  - Files: `agents/seed-queue-from-openspec.mjs`, `tests/seed-queue.test.mjs`
  - Spec: work-item-readiness/REQ-002
  - Agent: sdlc-developer
  - Test: phase `tasks` + readiness absent seeds nothing; same change at
    `ready-for-dev` seeds its open tasks; dry-run distinguishes `not-ready`
    from the phase-based skip
  - Parallel: blocked-by T-001
  - Complexity: S
  - Notes: Without this, enabling the drain floods the queue with ~43 open
    tasks from `level-6-autonomous-activation` alone plus seven other
    out-of-scope changes.

- [x] **T-003**: Park all out-of-scope work — set `readiness: draft` with a
      one-line reason on the eight currently-seedable changes; set `business-os`
      to `ready-for-dev`.
  - Files: `openspec/changes/*/status.json`
  - Spec: work-item-readiness/REQ-005
  - Agent: sdlc-developer
  - Test: dry-run seed reports exactly the `business-os` tasks and nothing else
  - Parallel: blocked-by T-002
  - Complexity: S

- [ ] **T-004**: Advance readiness through the loop — `ready-for-dev → in-dev`
      on first claim, `in-dev → ready-for-review` on tasks complete with an open
      PR, `ready-for-review → done` on merge. Illegal transitions refused;
      replays are no-ops.
  - Files: `agents/queue-drainer.mjs`, `agents/pr-auto-review.mjs`
  - Spec: work-item-readiness/REQ-003
  - Agent: sdlc-developer
  - Test: each transition; illegal transition refused and logged; replay is a
    no-op not an error
  - Parallel: blocked-by T-003
  - Complexity: M

- [ ] **T-005**: Render readiness on the change card and accept a `ready`
      comment to promote `draft → ready-for-dev`, mirroring the existing
      `approve` comment mechanism.
  - Files: `agents/command-center-sync.mjs`
  - Spec: work-item-readiness/REQ-004
  - Agent: sdlc-developer
  - Test: readiness appears on the parent card; a `ready` comment promotes and
    survives the next sync; `in-dev`/`ready-for-review` are not settable by
    comment
  - Parallel: blocked-by T-004
  - Complexity: M

### Phase 1: Portfolio foundation

- [x] **T-101**: Write `agents/schemas/portfolio.schema.json` — projects array
      with name/description/owner/client/repo/path/liveUrl/stage/enabled/cadence
      and an `environments` array (name, tier, provider, ref, credentialVars,
      agentWritable, defaultDeploy). `tier` required with **no default**;
      `client` required when `owner === "client"`.
  - Files: `agents/schemas/portfolio.schema.json`
  - Spec: portfolio-registry/REQ-001, environment-tiering/REQ-001
  - Agent: sdlc-developer
  - Test: schema fixture tests — rejects missing name, duplicate name, bad
    `owner`, `owner:client` without `client`, bad `stage`, missing `tier`,
    `tier` case-variants (`Scratch`, `CUSTOMER-PRODUCTION`)
  - Complexity: S

- [x] **T-102**: Create `portfolio.json` at the **repo root** with a minimal
      valid skeleton (version 1, empty projects array) and confirm it is
      tracked by git — explicitly NOT under the gitignored `pm/`.
  - Files: `portfolio.json`
  - Spec: portfolio-registry/REQ-001
  - Agent: sdlc-developer
  - Test: `git ls-files portfolio.json` returns the path
  - Parallel: blocked-by T-101
  - Complexity: S

- [x] **T-103**: Implement `agents/portfolio.mjs` — `list` (+`--json`),
      `show <name>`, `add`, `set <name> <key> <value>`, `status`, `validate`.
      Stdlib only, `__isMainModule` guard, all verbs exported.
  - Files: `agents/portfolio.mjs`, `agents/__tests__/portfolio.test.mjs`
  - Spec: portfolio-registry/REQ-002
  - Agent: sdlc-developer
  - Test: every verb; `add` refuses duplicates and invalid schema writing
    nothing; `set` refuses unknown keys; `status` leaves mtime unchanged;
    importing the module runs no CLI
  - Parallel: blocked-by T-102
  - Complexity: M

- [x] **T-104**: Wire `portfolio.mjs validate` into
      `agents/four-layer-validate.mjs` so a malformed portfolio fails the
      standard gate at commit time rather than at runtime.
  - Files: `agents/four-layer-validate.mjs`
  - Spec: portfolio-registry/REQ-003
  - Agent: sdlc-developer
  - Test: gate fails on a fixture missing `tier` and names the project + field;
    gate passes on the real `portfolio.json`
  - Parallel: blocked-by T-103
  - Complexity: S
  - Notes: This is the commit-time half of the fail-closed guarantee. Without
    it the only defense against a forgotten tier is a runtime denial nobody
    sees until an agent is already blocked.

- [x] **T-105**: Project portfolio entries onto the kanban via
      `command-center-sync.mjs`, keyed on project name, reusing the existing
      bridge API and lane mapping.
  - Files: `agents/command-center-sync.mjs`
  - Spec: portfolio-registry/REQ-004
  - Agent: sdlc-developer
  - Test: first sync creates one card per project, immediate second sync
    reports zero created/zero moved; `stage: parked` lands in the parked lane;
    one project's failure does not abort remaining sync steps
  - Parallel: blocked-by T-103
  - Complexity: S

### Phase 2: The environment guard — CRITICAL PATH

- [x] **T-201**: Implement `agents/env-guard.mjs` `checkAccess({project,
      environment, operation, approval})` → `{allowed, tier, reason,
      requiresApproval}`. Never throws. Implements the Phase-2 decision table.
  - Files: `agents/env-guard.mjs`
  - Spec: environment-tiering/REQ-002, REQ-003
  - Agent: sdlc-developer
  - Test: see T-202 (written together, landed together)
  - Parallel: blocked-by T-103
  - Complexity: M

- [x] **T-202**: Write `agents/__tests__/env-guard.test.mjs` by transcribing
      **all 13 scenarios** from `specs/environment-tiering.md` verbatim, one
      test per scenario, plus one test per cell of the decision table.
  - Files: `agents/__tests__/env-guard.test.mjs`
  - Spec: environment-tiering/REQ-002, REQ-003 (Scenarios 1–12)
  - Agent: sdlc-developer
  - Test: this IS the test. Must cover: missing file, unparseable file, unknown
    project, unknown environment, absent tier (deny **reads** too), unknown
    tier string, case-variant tier, missing/invalid operation, and Scenario 12
    (one mis-tiered environment must not widen access to a healthy sibling)
  - Parallel: blocked-by T-201
  - Complexity: M
  - Notes: The most important test file in the change. It should read like an
    adversary's checklist, not a happy-path suite.

- [x] **T-203**: Export the approval-token parser from `deploy-runner.mjs` and
      consume that export in `env-guard.mjs`. Do not duplicate the regex.
  - Files: `agents/deploy-runner.mjs`, `agents/env-guard.mjs`
  - Spec: environment-tiering/REQ-004
  - Agent: sdlc-developer
  - Test: identity test asserting both modules use the same parser function;
    consumed-token replay rejected; token bound to a different sha rejected;
    no new Telegram bot token variable introduced anywhere
  - Parallel: blocked-by T-201
  - Complexity: M

- [x] **T-204**: Emit a Telegram notification via `notify.mjs` on every
      `internal-production` write and every `customer-production` access
      attempt (allowed or denied).
  - Files: `agents/env-guard.mjs`
  - Spec: environment-tiering/REQ-003
  - Agent: sdlc-developer
  - Test: notification emitted with project/environment/operation; notification
    failure never converts a denial into an allow
  - Parallel: blocked-by T-201
  - Complexity: S

- [x] **T-205**: Add `--environment <name>` to `deploy-runner.mjs` (defaulting
      to the entry's `defaultDeploy`) and call `checkAccess({operation:
      'deploy'})` as a precondition ahead of the existing state machine.
  - Files: `agents/deploy-runner.mjs`
  - Spec: environment-tiering/REQ-005
  - Agent: sdlc-developer
  - Test: `scratch` deploy proceeds as today; `customer-production` without
    approval is denied and recorded; a project absent from the portfolio denies
    the deploy; **all existing deploy-runner tests pass unmodified**
  - Parallel: blocked-by T-202, T-203
  - Complexity: M

- [x] **T-206**: Add a `four-layer-validate` rule flagging direct
      `supabase db push` / `vercel --prod` strings in agent-authored task
      descriptions, so the guard cannot be routed around by an agent writing
      its own shell command.
  - Files: `agents/four-layer-validate.mjs`
  - Spec: environment-tiering/REQ-005 (bypass risk in design risk table)
  - Agent: sdlc-developer
  - Test: flags a task description containing either string; does not flag the
    playbook or docs that legitimately quote them
  - Parallel: blocked-by T-205
  - Complexity: S

### Phase 3: Populate and arm

- [x] **T-301**: Seed `portfolio.json` with the real roster — agentic-sdlc,
      tally, linguaflow, willtopaint, personal-website, personal-tools,
      component-library, ai-gateway, peach-shaker-5000, cyberdeck, hermes-pilot,
      nellis-scout, and `personal`. Every entry gets an explicit `stage`,
      `owner`, and every environment an explicit `tier`.
  - Files: `portfolio.json`
  - Spec: portfolio-registry/REQ-005
  - Agent: sdlc-developer
  - Test: no environment lacks a tier; each `path` exists on disk or the entry
    is `stage: parked`; `owner: client` entries carry a `client`
  - Parallel: blocked-by T-104
  - Complexity: M
  - Notes: `owner: self` = Nels Workshop internal/personal; `owner: client` =
    billable engagement. An empty registry satisfies every other spec while
    delivering nothing.

- [ ] **T-302**: With Bryce, confirm which environments genuinely hold customer
      data and set those to `customer-production` / `agentWritable: false`.
      Tally production is expected to be among them (Texas Olive Ranch).
  - Files: `portfolio.json`
  - Spec: portfolio-registry/REQ-005, environment-tiering/REQ-001
  - Agent: **Bryce** (decision) + sdlc-developer (edit)
  - Test: test asserts tally production is `customer-production`
  - Parallel: blocked-by T-301
  - Complexity: S
  - Notes: **Human decision, not inferable.** Do not guess which environments
    hold real customer rows.

- [ ] **T-303**: Audit stale state left by the 32-day dormancy **before**
      arming anything: `tasks/queue/`, open PRs across all drained repos, and
      each project's `pm/.last-deployed` versus `origin`. Record findings.
  - Files: `pm/wave2-preflight.md` (report)
  - Spec: environment-tiering/REQ-006
  - Agent: sdlc-developer
  - Test: report exists and names every drained repo with its queue depth, open
    PR count, and last-deployed sha versus `origin/<base>`
  - Parallel: blocked-by T-302
  - Complexity: S

- [x] **T-304**: Demonstrate a **live denial** — attempt a
      `customer-production` write against tally with no approval, confirm it is
      denied, and capture the evidence. Do this before any deploy timer is armed.
  - Files: `pm/wave2-preflight.md`
  - Spec: environment-tiering/REQ-006
  - Agent: sdlc-developer, verified by Bryce
  - Test: denial reproduced and recorded with its reason string
  - Parallel: blocked-by T-303
  - Complexity: S

- [x] **T-305**: Enable wave 2 — `autonomous-drain`, `pilot-drain`,
      `personal-website-drain`, `pr-auto-review`, `pilot-review`,
      `personal-website-review`, `deploy-reconcile`.
  - Files: (systemd user units — operational)
  - Spec: environment-tiering/REQ-006
  - Agent: sdlc-developer, approved by Bryce
  - Test: `systemctl --user list-timers 'sdlc-*'` shows all 19+ timers;
    `systemctl --user --failed` is empty; first drain tick observed to complete
  - Parallel: blocked-by T-304
  - Complexity: S
  - Notes: **Do not start this task early.** It is the one irreversible-ish
    step; `deploy-reconcile` points at `~/tally`.

### Phase 4: Liveness (parallel with Phase 2)

- [ ] **T-401**: Fix `agents/cycles/daily-review.mjs` — case-insensitive
      `Last updated` match, and insert the activity row into a heading that
      actually exists in `pm/DASHBOARD.md`.
  - Files: `agents/cycles/daily-review.mjs`
  - Spec: liveness-heartbeat/REQ-004
  - Agent: sdlc-developer
  - Test: regression asserting the **written content** carries today's date —
    not merely that the file was written, which is what passed while the bug
    was live; missing headings reported on stderr rather than silently no-op'd
  - Complexity: S

- [x] **T-402**: Implement `agents/heartbeat.mjs` — compose one daily message
      (timers alive vs expected, drain ticks 24h, PRs merged, open approvals,
      blocked tasks, open chore/note counts, spend, health degradation).
      Abnormal items lead; nominal days still send.
  - Files: `agents/heartbeat.mjs`, `agents/__tests__/heartbeat.test.mjs`
  - Spec: liveness-heartbeat/REQ-001
  - Agent: sdlc-developer
  - Test: nominal fixture still produces a message; abnormal items sort first;
    single message not one per section; composes without network access
  - Complexity: M

- [ ] **T-403**: Make heartbeat failure visible — non-zero exit on delivery
      failure, stderr naming the provider error, no `Restart=` masking; partial
      data-collection failure still sends a degraded message rather than
      aborting.
  - Files: `agents/heartbeat.mjs`
  - Spec: liveness-heartbeat/REQ-002
  - Agent: sdlc-developer
  - Test: delivery failure → non-zero exit; success → 0; `gh` unavailable →
    message still sent with that section marked unavailable
  - Parallel: blocked-by T-402
  - Complexity: S

- [ ] **T-404**: Add portfolio drift detection to the heartbeat — missing
      `path`, `stage: build` with a git HEAD unmoved for N days, `enabled: true`
      with no drain activity. Capped list with an overflow count.
  - Files: `agents/heartbeat.mjs`
  - Spec: liveness-heartbeat/REQ-003
  - Agent: sdlc-developer
  - Test: each drift condition against a fixture; a clean portfolio produces no
    drift section at all
  - Parallel: blocked-by T-402, T-301
  - Complexity: M
  - Notes: This is the mitigation for the highest-likelihood risk in the design
    — the portfolio becoming another lying dashboard.

- [x] **T-405**: Register the heartbeat in `agents/cron-schedule.json` and
      install via `scheduler-install.mjs`, matching sibling units' PATH,
      `WorkingDirectory`, and `EnvironmentFile=-%h/.hermes/.env`.
  - Files: `agents/cron-schedule.json`
  - Spec: liveness-heartbeat/REQ-005
  - Agent: sdlc-developer
  - Test: generated unit matches sibling shape; `OnCalendar` minute avoids
    {0,15,30,45}; existing `scheduler-install` tests pass
  - Parallel: blocked-by T-403
  - Complexity: S

### Phase 5: Personal lane (parallel with Phase 2)

- [x] **T-501**: Add `kind` ∈ `{code, chore, note}` to
      `agents/schemas/task.schema.json`, optional, absence meaning `code`.
  - Files: `agents/schemas/task.schema.json`
  - Spec: personal-task-lane/REQ-001
  - Agent: sdlc-developer
  - Test: all three values accepted; absence accepted; the 13 existing task
    files validate unchanged; an unrecognized value fails validation
  - Complexity: S

- [x] **T-502**: Filter the drain to `kind === 'code'` (absent counts as code)
      in `agents/queue-drainer.mjs`; report code and non-code counts separately
      in `status`.
  - Files: `agents/queue-drainer.mjs`
  - Spec: personal-task-lane/REQ-002
  - Agent: sdlc-developer
  - Test: mixed queue → claims only code and absent-kind; chore/note-only queue
    → clean "nothing to drain", no error, no idle-spin; existing drainer tests
    pass unmodified
  - Parallel: blocked-by T-501
  - Complexity: S

- [x] **T-503**: Author the `sdlc-inbox` Hermes skill (source in `skills/`,
      installed to `~/.hermes/skills/`) that captures a dictated item as a
      schema-valid `chore`/`note` task against a named project or `personal`.
  - Files: `skills/sdlc-inbox/SKILL.md`
  - Spec: personal-task-lane/REQ-003
  - Agent: sdlc-documentarian
  - Test: captured item is schema-valid with kind + title + project, requiring
    no `files[]`/`test_status`/`estimatedTokens`; unknown project falls back to
    `personal` preserving the original text
  - Parallel: blocked-by T-501, T-301
  - Complexity: M

- [ ] **T-504**: Surface non-code items on the board (distinguishable by kind)
      and in the heartbeat; completing a card reconciles back to the task file.
  - Files: `agents/command-center-sync.mjs`, `agents/heartbeat.mjs`
  - Spec: personal-task-lane/REQ-004
  - Agent: sdlc-developer
  - Test: idempotent card creation; kind visible on the card; heartbeat reports
    open counts; card completion reconciles task `status`
  - Parallel: blocked-by T-502, T-402
  - Complexity: S

### Phase 6: Wireframe gate

- [x] **T-601**: Extend `mission-bootstrap.mjs` to provision a **staging +
      production pair** and register both in `portfolio.json` with tiers
      `scratch` and `internal-production`.
  - Files: `agents/mission-bootstrap.mjs`
  - Spec: wireframe-gate/REQ-003
  - Agent: sdlc-developer
  - Test: bootstrapped mission has exactly two tiered environments; `--dry-run`
    prints both and writes nothing; second run neither duplicates the portfolio
    entry nor re-provisions; existing bootstrap tests pass unmodified
  - Parallel: blocked-by T-103
  - Complexity: M

- [x] **T-602**: Add `--client <name>` setting `owner: client` + `client`, and
      assert **no code path** can write `customer-production`.
  - Files: `agents/mission-bootstrap.mjs`
  - Spec: wireframe-gate/REQ-004
  - Agent: sdlc-developer
  - Test: `--client "Acme"` yields `owner: client` and still provisions
    scratch + internal-production; grep-style test asserts the string
    `customer-production` appears in no write path; `--client` alone changes no
    tier
  - Parallel: blocked-by T-601
  - Complexity: S

- [ ] **T-603**: Rewrite `docs/MISSION_PLAYBOOK.md` — insert the design step as
      §4 (component-library search, then wireframe, then stop for approval),
      renumber task-seeding to §5 and report to §6.
  - Files: `docs/MISSION_PLAYBOOK.md`
  - Spec: wireframe-gate/REQ-001, REQ-002
  - Agent: jony-aive (design step content) + sdlc-documentarian (structure)
  - Test: search step precedes the wireframe step and is non-optional; §
    renumbering is internally consistent
  - Parallel: blocked-by T-602
  - Complexity: M

- [ ] **T-604**: Assert the playbook's pre-existing guardrails survive the
      rewrite — the 2026-07-27 incident rules (never create scheduler entries,
      always `pwd` first, never commit `.env.local`, never deploy manually).
  - Files: `tests/mission-playbook.test.mjs`
  - Spec: wireframe-gate/REQ-005
  - Agent: sdlc-developer
  - Test: each pre-existing guardrail string still present after the rewrite;
    no orphaned cross-reference from `mission-intake` REQ-003/REQ-006
  - Parallel: blocked-by T-603
  - Complexity: S
  - Notes: Those rules exist because each one already went wrong once.

- [x] **T-605**: Author the `sdlc-portfolio` Hermes skill so Telegram can
      answer roster questions by shelling out to `portfolio.mjs`.
  - Files: `skills/sdlc-portfolio/SKILL.md`
  - Spec: portfolio-registry/REQ-002
  - Agent: sdlc-documentarian
  - Test: skill present under `~/.hermes/skills/sdlc-portfolio/`; a Telegram
    query returns the real roster
  - Parallel: blocked-by T-301
  - Complexity: S

### Phase 7: Verify and document

- [ ] **T-701**: Full suite green — `npm test`,
      `node agents/four-layer-validate.mjs`, `node agents/test-behavior.mjs`.
  - Command: `npm test && node agents/four-layer-validate.mjs && node agents/test-behavior.mjs`
  - Expected: all passing, zero new npm dependencies
  - Parallel: blocked-by all implementation tasks

- [ ] **T-702**: Manual verification per design — `portfolio.mjs list` answered
      from Telegram; heartbeat lands once, readable; denial demonstrated;
      wireframe delivered as an image with no build tasks seeded before
      approval; `pm/DASHBOARD.md` shows today's date.
  - Agent: sdlc-developer, confirmed by Bryce
  - Parallel: blocked-by T-701

- [ ] **T-703**: Update `docs/RUNBOOK.md` — the two-wave timer model, what the
      heartbeat means, and how to read/act on a guard denial.
  - Files: `docs/RUNBOOK.md`
  - Agent: sdlc-documentarian
  - Parallel: blocked-by T-702

- [ ] **T-704**: Mark `level-6-autonomous-activation` T-103/T-104 superseded,
      pointing at `portfolio.json` + `portfolio.mjs`, per design Decision 2.
  - Files: `openspec/changes/level-6-autonomous-activation/tasks.md`
  - Agent: sdlc-documentarian
  - Parallel: blocked-by T-103

- [ ] **T-705**: Update agent memory and `openspec/BACKLOG.md`; unblock
      BACKLOG #29 (Nels Workshop hub) now that B and C have landed.
  - Files: `agents/*/memory/*.json`, `openspec/BACKLOG.md`
  - Agent: sdlc-documentarian
  - Parallel: blocked-by T-702

---

## Completion Criteria

This change is complete when:

- [ ] All implementation tasks are checked off
- [ ] `npm test`, `four-layer-validate`, and `test-behavior` all pass
- [ ] No regressions — existing `deploy-runner`, `queue-drainer`,
      `scheduler-install`, and `mission-bootstrap` tests pass **unmodified**
- [ ] Zero new npm dependencies
- [ ] A `customer-production` write has been demonstrably denied, with evidence
- [ ] All 19+ timers running, `systemctl --user --failed` empty
- [ ] A heartbeat has arrived on Bryce's phone
- [ ] Memory updated; committed and pushed

---

## Notes

- **Sequencing is the safety property here.** T-305 (enable wave 2) must not be
  pulled forward. `deploy-reconcile` is already configured
  `--project-dir /home/bryce/tally`; arming it before T-201..T-206 inverts the
  purpose of the whole change.
- **T-202 is the task to slow down on.** Everything else in this change is
  plumbing; that test file is the thing standing between an autonomous agent on
  a cheap fallback rung and a customer's production rows.
- Existing tests passing *unmodified* is a completion criterion on purpose. If
  a change to `deploy-runner` requires editing its old tests, that is a signal
  the state machine was reshaped rather than gated — reread design Decision 4.
- Two tasks need Bryce and cannot be inferred: T-302 (which environments hold
  real customer data) and T-305 (approval to arm wave 2).
