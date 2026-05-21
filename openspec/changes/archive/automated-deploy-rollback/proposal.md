# Proposal: automated-deploy-rollback

**Date**: 2026-05-21
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: proposed

---

## Problem

The framework's `agents/templates/deploy-pipeline.md.template` documents a 7-stage pipeline ending with browser verification (stage 6) and stakeholder notification (stage 7). It does NOT document what to do when stage 5 (post-deploy smoke tests) or stage 6 (browser verify) FAILS in production. Today the implicit expectation is "the human notices the failure and manually reverts." This is fragile:

- If the deploy succeeded but smoke tests fail, broken code is live until a human intervenes
- The notify.mjs trigger list (`blocker, budgetAlert, deployComplete, highSeverityFailure, dailySummary, approvalTimeout, capabilityDrift`) has no `deployFailed` or `deployRolledBack` triggers
- BACKLOG #12 has been pending since the framework's 2026-03-13 review: "When a deploy fails smoke tests, the rollback is manual. The framework should auto-revert and notify."

For Bryce's work-project use case (starting tomorrow), a deploy that fails verification means broken production until he manually rolls back. That's an unacceptable production posture for a multi-agent SDLC pitched as Level 3+ Orchestrated.

---

## Discovery

- **Existing artifacts**:
  - `agents/templates/deploy-pipeline.md.template` (127 lines) covers stages 1-7 — no rollback stage
  - `agents/notify.mjs` (line 605-607) defines 7 trigger types — no deploy-failure triggers
  - `agents/schemas/deploy-request.schema.json` — defines the deploy request shape (does NOT include `rollbackCmd` field today)
- **Existing patterns**:
  - The notify.mjs `triggerNotification(triggerName, message, mediaPath)` API (line 608) — drop-in helper for any new trigger
  - Project-level config in `agents/project.json` — already supports per-project commands like `testCmd`; can extend with `rollbackCmd`
- **Constraints**:
  - The framework can't perform rollbacks itself (Vercel/Netlify/Railway/custom each have different rollback mechanisms)
  - The framework's role is: document the pattern, ship the notification triggers, provide a tiny helper script that invokes the project-defined `rollbackCmd`

---

## Proposed Solution

Three small additions:

1. **Extend `deploy-pipeline.md.template`** with explicit "ON FAILURE" subsections at stages 5 and 6, plus a new stage 8: "Rollback on failure." The new stage documents the pattern: invoke `rollbackCmd` from `project.json`, then trigger the `deployRolledBack` notification.

2. **Add 2 new triggers to `notify.mjs`**: `deployFailed` (fires when stage 5 or 6 fails) and `deployRolledBack` (fires when rollback completes).

3. **Add a tiny helper `agents/deploy-rollback.mjs`** (~80 lines) — reads `agents/project.json` for the `rollbackCmd`, executes it, captures output, triggers notifications. Zero-dep. Idempotent.

Document the pattern in a new `docs/rollback-pattern.md` so users (and AI agents) know how to wire `rollbackCmd` into their project.

---

## Value Analysis

### Benefits

- **Auto-revert reduces blast radius** — broken production lasts ~minutes (until smoke tests fail → rollback fires) instead of hours (until a human notices)
- **Standardized notification** — `deployFailed` + `deployRolledBack` triggers fit the existing notify.mjs surface; any consumer (WhatsApp, Slack, file) gets the alert
- **Zero LLM tokens** — the rollback helper is pure Node; no model calls
- **Closes a 9-week-old BACKLOG item** (#12 since 2026-03-13)
- **Production posture** for Bryce's work project — when he starts deploying anything, this is in place

### Costs

- **Effort**: ~60 minutes (3 small file edits + 1 new helper + 1 new doc + tests)
- **Risk**:
  - Rollback script invokes `rollbackCmd` from `project.json` — if mis-configured, could fire incorrectly. Mitigation: dry-run flag, explicit confirmation requirement when invoked manually.
  - Rollback notification spam if a deploy is repeatedly failing — Mitigation: trigger debounce (default 5 min between same-trigger fires from same project).
- **Dependencies**:
  - Project must define `rollbackCmd` in `agents/project.json` (new optional field). Without it, rollback stage logs a warning and skips.

### Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Framework performs the rollback itself | Can't — different hosts have different rollback APIs. Project-defined `rollbackCmd` is the right abstraction. |
| Just document the pattern, no code | Documentation without enforcement = pattern not followed. The 2-line trigger + 80-line helper makes adoption near-zero-effort. |
| Add full canary deploy support | Out of scope — canary is a separate feature with its own design. Rollback is the simpler/cheaper safety net. |
| Defer to Level 6 | #12 was filed 9 weeks ago; bigger picture work shouldn't keep blocking simple safety improvements. |

### Decision

**Yes, proceed.** Small, self-contained, no Level-6 dependency, closes a long-standing backlog item, ships production safety for Bryce's work project.

---

## Scope

### In Scope

- Update `agents/templates/deploy-pipeline.md.template` with: ON FAILURE subsections (stages 5, 6) + new stage 8 (Rollback) + new stage 9 (Notify rollback)
- Add 2 new triggers to `agents/notify.mjs`: `deployFailed`, `deployRolledBack`
- New `agents/deploy-rollback.mjs` helper script
- New `docs/rollback-pattern.md` user-facing pattern doc
- Update `agents/schemas/deploy-request.schema.json` to optionally include `rollbackCmd`
- One test file: `tests/deploy-rollback.test.mjs` (helper unit tests)
- Backlog cleanup: move #12 from Remaining Ideas to Promoted to Changes

### Out of Scope

- Auto-detecting which hosting platform a project uses (project author sets `rollbackCmd` explicitly)
- Canary deploys (separate change, future)
- Multi-environment rollback (rolling back staging vs prod — project author handles via `rollbackCmd`)
- Database migration rollback (project-specific, out of scope)

---

## Next Step

If approved: design.md to lock the trigger debounce policy, rollback helper interface, and template structure.
