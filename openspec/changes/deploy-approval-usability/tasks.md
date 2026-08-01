# Tasks: deploy-approval-usability

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: tasks

---

## Overview

Make the deploy approval request actionable: name the deploy bot, link to it,
state the exact command, and warn that the delivering chat cannot accept the
reply. Per design.md and `specs/deploy-approval.md` (REQ-001..REQ-005).

---

## Prerequisites

- [x] Design is approved
- [x] Specs are written and reviewed
- [x] Bryce's decision recorded: keep the approval gate on **all** deploys
- [x] Root cause confirmed: deploy bot `pending_update_count: 0` (never messaged),
      `.deploy-pending-db255a7c` open since 2026-07-31, no `.last-deployed`
- [x] Deploy chain otherwise healthy: Vercel CLI logged in, both tokens valid,
      reconcile timer active, no webhook blocking `getUpdates`

---

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Handle resolution | sdlc-developer | T-101 | — |
| Message construction | sdlc-developer | T-102 | blocked-by T-101 |
| Tests | sdlc-developer | T-201, T-202 | blocked-by T-102 |
| Verify | sdlc-documentarian | T-301..T-303 | blocked-by T-201 |

---

## Implementation Tasks

### Phase 1: Implementation

- [x] **T-101**: Add `deployBotHandle(token)` near `pollApprovals` — memoised in a
      module-level `_deployBotHandle` (`undefined` unresolved / `null` failed /
      `'@name'` resolved), resolving via the existing `telegramGet(token, 'getMe')`.
      Returns `null` on missing token, network error, non-`ok` response, or absent
      `username`. Never throws.
  - Files: `agents/deploy-runner.mjs`
  - Spec: REQ-001, REQ-004, REQ-005
  - Agent: sdlc-developer
  - Complexity: S
  - Notes: Export it so tests can reach it, and keep the CLI `__isMainModule` guard
    intact (CLAUDE.md rule 9).

- [x] **T-102**: Extract message construction into a pure exported
      `buildApprovalMessage({ projectName, baseBranch, sha8, subject, handle })` and
      call it from the `request-approval` branch. Resolved branch: `@handle`,
      `https://t.me/<name>`, `APPROVE <sha8>` on its own line, `REJECT <sha8>`, and
      the "DIFFERENT bot / replying here does nothing" warning. Fallback branch
      (`handle === null`): same command lines, naming `TELEGRAM_DEPLOY_BOT_TOKEN`.
  - Files: `agents/deploy-runner.mjs`
  - Spec: REQ-001, REQ-002, REQ-003, REQ-004
  - Agent: sdlc-developer
  - Complexity: S
  - Notes: Plain text only — no Markdown/HTML parse mode, so commit subjects cannot
    break rendering. A pure builder is what makes REQ-001..003 testable offline.

### Phase 2: Tests

- [x] **T-201**: Unit tests for `buildApprovalMessage` — resolved branch contains the
      `@handle`, the `t.me` link, and `APPROVE <sha8>`; fallback branch still carries
      the exact commands and the different-bot warning; the emitted `APPROVE`/`REJECT`
      lines each satisfy `parseApprovalCommand()` when passed verbatim
  - Files: `tests/deploy-runner.test.mjs`
  - Covers: REQ-001, REQ-002, REQ-003, REQ-004
  - Agent: sdlc-developer
  - Complexity: S
  - Notes: Round-tripping the emitted line back through `parseApprovalCommand()` is
    the assertion that actually matters — it proves the instruction we print is one
    the runner will accept.

- [x] **T-202**: Unit test for `deployBotHandle` — returns `null` without throwing on
      an empty token and performs no network call
  - Files: `tests/deploy-runner.test.mjs`
  - Covers: REQ-004, REQ-005
  - Agent: sdlc-developer
  - Complexity: S
  - Notes: Keep offline — no live Telegram calls in the suite.

- [x] **T-203**: Run the full suite and confirm no regressions
  - Command: `cd ~/agentic-sdlc && npm test`
  - Expected: all passing, `tests/deploy-runner.test.mjs` included

### Phase 3: Verification

- [x] **T-301**: Resolve the live handle and confirm it is `@Nels_hermes_deploy_bot`;
      render the real message for `db255a7c` and confirm it satisfies REQ-001..003
  - Spec: Scenario 1
  - Agent: sdlc-documentarian

- [x] **T-302**: Send Bryce a corrected, actionable approval request for the pending
      `personal-website` sha `db255a7c`
  - Spec: Scenario 1
  - Agent: sdlc-documentarian
  - Notes: The existing `.deploy-pending-db255a7c` token stays as-is — it is what
    binds his reply to this sha. Do NOT approve on his behalf; the gate is his.

- [ ] **T-303**: After Bryce approves, confirm the next tick deploys and smoke-verifies
      `https://brycewadley.com/design`, and that `pm/.last-deployed` is written
  - Spec: Scenario 2
  - Agent: sdlc-documentarian
  - Notes: Human-in-the-loop. This is the first end-to-end deploy the pipeline will
    have ever completed.

---

## Completion Criteria

- [x] All implementation tasks are checked off
- [x] All tests pass (`npm test`)
- [x] No regressions in the existing suite
- [x] Live handle resolves to `@Nels_hermes_deploy_bot`
- [x] Bryce receives an actionable approval request
- [ ] Bryce approves and `brycewadley.com` deploys + verifies
- [ ] Change is committed and pushed to `~/agentic-sdlc`

---

## Notes

- Do NOT approve `db255a7c` on Bryce's behalf. He explicitly chose to approve every
  deploy; auto-approving would defeat the gate he just asked to keep.
- Do NOT poll the notify bot for approvals — the two-bot split is a security boundary
  against a prompt-injected agent approving its own deploy (design Decision 2).
- `tally` has `deploy.enabled: false` and a live paying customer. Out of scope here.
