# Specs — environment-tiering

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: specs

Covers `agents/env-guard.mjs` and the environment model inside `portfolio.json`.

**Governing principle: a guard that can be defeated by an omission is
decoration.** Every path that cannot positively establish a permissive tier
must deny. The scenario table below is written to be transcribed directly into
`agents/__tests__/env-guard.test.mjs`; it is deliberately adversarial.

---

## REQ-001 — Every environment carries an explicit tier

**Statement:** Each entry in a project's `environments` array declares
`tier` ∈ `{scratch, internal-production, customer-production}`. There is **no
default tier**. `agentWritable` (boolean) and `credentialVars` (array of
variable *names*) are likewise explicit.

**Acceptance:**
- Schema rejects an environment without `tier`
- Schema rejects a `tier` value outside the three literals, including
  case variants (`Scratch`, `CUSTOMER-PRODUCTION`) — the comparison is exact
- Schema rejects `credentialVars` containing anything that looks like a value
  rather than a name

**Dependencies:** `portfolio-registry/REQ-001`
**Complexity:** S
**Value:** CRITICAL

---

## REQ-002 — `checkAccess` fails closed on every uncertain path

**Statement:** `checkAccess({ project, environment, operation, approval })`
returns `{ allowed, tier, reason, requiresApproval }`. It **never throws**.
Every path that cannot positively identify the tier as `scratch` or
`internal-production` returns `allowed: false` with a reason naming the cause.

**Acceptance:** covered by Scenarios 4–12 below. Specifically, `allowed` is
`false` when: the portfolio file is missing, unreadable, or unparseable; the
project is unknown; the environment is unknown; `tier` is absent, null, empty,
or an unrecognized string; `operation` is absent or unrecognized; the
environment is `customer-production` and no valid approval is supplied.

**Dependencies:** REQ-001
**Complexity:** M
**Value:** CRITICAL

---

## REQ-003 — The decision table is exactly as designed

**Statement:** For `operation` ∈ `{read, write, migrate, deploy}`:

| tier | `read` | `write` / `migrate` / `deploy` |
|---|---|---|
| `scratch` | allow | allow |
| `internal-production` | allow | allow, and emit a Telegram notification recording the action |
| `customer-production` | allow, and record | **deny** unless a fresh single-use sha-bound approval is presented |
| absent / unknown / malformed | **deny** | **deny** |

**Acceptance:** Scenarios 1–3 and 6–9 below; one test per cell of the table.

**Dependencies:** REQ-002
**Complexity:** M
**Value:** CRITICAL

---

## REQ-004 — `customer-production` reuses the existing approval token

**Statement:** Approval for a `customer-production` write is the same
single-use, sha-bound `APPROVE <sha8>` mechanism already implemented in
`agents/deploy-runner.mjs` against `TELEGRAM_DEPLOY_BOT_TOKEN`. No second
approval concept, command, or bot is introduced.

**Acceptance:**
- The token parser used by `env-guard` is the one exported by `deploy-runner`,
  asserted by an identity test rather than a duplicated regex
- A token already consumed is rejected on reuse
- A token bound to a different sha is rejected
- No new Telegram bot token variable is introduced anywhere in the change

**Dependencies:** REQ-003
**Complexity:** M
**Value:** CRITICAL

---

## REQ-004a — Approval is tier-driven, not universal

**Statement:** Deploy approval is required **only** for `customer-production`.
`scratch` and `internal-production` deploy without a gate. This supersedes
`deploy-approval-usability`'s "keep the approval gate on **all** deploys"
position.

**Acceptance:**
- `project.json` `deploy.approval: "none"` is honored for self-owned projects
  (already applied to `hermes-pilot` and `personal-website`, 2026-09-02)
- A `customer-production` environment requires approval **regardless** of the
  project's `deploy.approval` setting — the tier overrides local config, so
  speed cannot be configured onto a customer's database
- A test asserts `approval: "none"` + `tier: customer-production` still denies

**Dependencies:** REQ-004
**Complexity:** S
**Value:** CRITICAL

**Notes — rationale (Bryce, 2026-09-02):** "deploy doesn't need my approve right
now, we are going for speed." Correct for everything that actually deploys:
`hermes-pilot` and `personal-website` are self-owned, smoke-verified, and
auto-rollback on failure, so the gate was ceremony. Tally is the only
`customer-production` project and it is `deploy.enabled: false` today — so
removing the gate cost nothing there and changed nothing. The tier override in
this REQ is what keeps that true if tally is ever re-enabled in a hurry.

---

## REQ-005 — `deploy-runner` consults the guard before deploying

**Statement:** `agents/deploy-runner.mjs` accepts `--environment <name>`
(defaulting to the portfolio entry's `defaultDeploy` environment) and calls
`checkAccess({ operation: 'deploy' })` as a precondition. The existing
reconcile → approve → smoke → rollback state machine is otherwise unchanged.

**Acceptance:**
- A deploy against a `scratch` environment proceeds as today
- A deploy against a `customer-production` environment with no approval is
  denied, and the denial is recorded and notified
- A project absent from the portfolio denies the deploy — an unregistered
  project is an unknown tier
- Existing `deploy-runner` tests still pass unmodified

**Dependencies:** REQ-004
**Complexity:** M
**Value:** CRITICAL

---

## REQ-006 — Wave 2 timers are enabled only after the guard is live

**Statement:** The seven drain/review/deploy timers (`autonomous-drain`,
`pilot-drain`, `personal-website-drain`, `pr-auto-review`, `pilot-review`,
`personal-website-review`, `deploy-reconcile`) are enabled as an explicit,
separately-tracked step that runs **after** REQ-005 is merged and after a stale
state audit.

**Acceptance:**
- Before enabling: `tasks/queue/`, open PRs, and each project's
  `pm/.last-deployed` are audited against `origin` and the findings recorded
- A live denial is demonstrated against tally's `customer-production` and the
  evidence captured, before any deploy timer is armed
- After enabling, `systemctl --user list-timers 'sdlc-*'` shows all 19 timers
  and `systemctl --user --failed` is empty

**Dependencies:** REQ-005
**Complexity:** S
**Value:** CRITICAL — `deploy-reconcile` is already configured
`--project-dir /home/bryce/tally`. Arming it before the guard exists inverts
the purpose of this capability.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: Scratch environment permits everything
**Verifies:** REQ-003
**WHEN** `checkAccess` is called for a `scratch` environment with any of
`read|write|migrate|deploy`
**THEN** `allowed` is `true` for all four
**AND** no approval is required and no notification is emitted

### Scenario 2: Internal production permits writes but records them
**Verifies:** REQ-003
**WHEN** `checkAccess` is called for `internal-production` with `write`
**THEN** `allowed` is `true`
**AND** a Telegram notification recording project, environment, and operation is
emitted through `notify.mjs`

### Scenario 3: Customer production denies an unapproved write
**Verifies:** REQ-003, REQ-004
**WHEN** `checkAccess` is called for `customer-production` with `write` and no
`approval`
**THEN** `allowed` is `false` and `requiresApproval` is `true`
**AND** the reason names the project, the environment, and the tier
**AND** no write is attempted by the caller

### Scenario 4: Error Case — portfolio file is missing
**Verifies:** REQ-002
**WHEN** `portfolio.json` does not exist
**THEN** `checkAccess` returns `allowed: false` for every operation
**AND** it does not throw, and creates no file

### Scenario 5: Error Case — portfolio file is unparseable
**Verifies:** REQ-002
**WHEN** `portfolio.json` contains malformed JSON, or valid JSON that is not an
object with a `projects` array
**THEN** `checkAccess` returns `allowed: false`
**AND** the reason distinguishes "unparseable" from "not found"

### Scenario 6: Edge Case — environment has no tier field
**Verifies:** REQ-002, REQ-003
**WHEN** an environment entry omits `tier` entirely
**THEN** `checkAccess` returns `allowed: false` for **read as well as write**
**AND** the reason states that the tier is absent
**AND** no operation is silently treated as `scratch`

### Scenario 7: Edge Case — tier is an unrecognized string
**Verifies:** REQ-002
**WHEN** `tier` is `"prod"`, `"Production"`, `"CUSTOMER-PRODUCTION"`, `""`, or
`null`
**THEN** `checkAccess` returns `allowed: false` in every case
**AND** matching is exact — no case-folding, trimming, or prefix matching
rescues a near-miss

### Scenario 8: Error Case — unknown project or environment
**Verifies:** REQ-002
**WHEN** `project` names a project absent from the portfolio, or `environment`
names an environment absent from that project
**THEN** `checkAccess` returns `allowed: false`
**AND** the reason distinguishes the two cases

### Scenario 9: Error Case — missing or unrecognized operation
**Verifies:** REQ-002
**WHEN** `operation` is absent, `null`, or a string outside the four verbs
**THEN** `checkAccess` returns `allowed: false` even for a `scratch` environment
**AND** the reason names the invalid operation

### Scenario 10: Edge Case — approval replay
**Verifies:** REQ-004
**WHEN** a valid `APPROVE <sha8>` token that has already been consumed is
presented again
**THEN** `checkAccess` returns `allowed: false`
**AND** the reason states the token was already used

### Scenario 11: Edge Case — approval bound to a different sha
**Verifies:** REQ-004
**WHEN** a well-formed, unconsumed approval whose sha does not match the
requested action is presented
**THEN** `checkAccess` returns `allowed: false`

### Scenario 12: Edge Case — two environments, one mis-tiered
**Verifies:** REQ-002
**WHEN** a project has a valid `scratch` staging environment and a production
environment whose `tier` is missing
**THEN** access to staging is unaffected and still allowed
**AND** access to production is denied
**AND** one malformed environment never widens access to a sibling

### Scenario 13: Deploy path honors the guard
**Verifies:** REQ-005
**WHEN** `deploy-runner.mjs --environment production` runs against a project
whose production tier is `customer-production` and no approval is pending
**THEN** the deploy does not execute
**AND** the existing approval-request flow is what the operator sees, not a
crash or a silent skip

---

## Invariants

- `checkAccess` never throws; every failure is a returned denial.
- Denial is the default. A permissive result requires positively reading one of
  exactly two literal tier strings.
- No tier is ever inferred — not from the environment's name, not from
  `agentWritable`, not from whether `--client` was passed at bootstrap.
- No credential value is ever read, logged, or returned by the guard; it reasons
  over variable names only.
- A new mission is never born `customer-production` (see `wireframe-gate` and
  design Decision 6); promotion is a reviewed commit.

## Out of Scope

- Provisioning or creating client-owned cloud accounts.
- Rotating, storing, or injecting credentials.
- Row-level or per-table permissions inside a database.
- Retroactively auditing what agents did to any environment before this guard
  existed.
