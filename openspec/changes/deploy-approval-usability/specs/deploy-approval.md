# Spec: deploy-approval

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: specs

---

## Overview

Covers the content of the deploy approval request emitted by
`agents/deploy-runner.mjs` on the `request-approval` transition: how the
approving bot is identified, what the reader is told to send, and how the
message degrades when the bot handle cannot be resolved.

Governing principle: **an approval request must be actionable by the person who
receives it.** A gate that cannot be passed is an outage, not a safeguard.

---

## Requirements

### REQ-001: Approval request names the approving bot

**Statement:** The system shall include the deploy bot's `@username` and a
`https://t.me/<username>` link in every approval request for which the handle
can be resolved.

**Acceptance Criteria:**
- [ ] The message contains the literal `@<username>` of the bot whose token is
      `TELEGRAM_DEPLOY_BOT_TOKEN`
- [ ] The message contains `https://t.me/<username>` for that same bot
- [ ] The username is derived from the token via `getMe`, not from a constant or
      a separate config value, so the named bot is by construction the polled bot
- [ ] Edge case: if the token is rotated to a different bot, the next request
      names the new bot with no config edit

**Dependencies:** None

**Complexity:** S

**Value:** CRITICAL

**Notes:** Without this the reader has no way to determine which bot can accept
the reply — the failure that produced zero deploys since 2026-07-31.

---

### REQ-002: Approval request states the exact command

**Statement:** The system shall state the exact, copy-pasteable command that
`parseApprovalCommand()` accepts, for both approval and rejection.

**Acceptance Criteria:**
- [ ] The message contains `APPROVE <sha8>` with the real 8-character sha
- [ ] The message contains `REJECT <sha8>` with the same sha
- [ ] Both strings satisfy `/^\s*(APPROVE|REJECT)\s+([0-9a-f]{8})\s*$/i` when
      sent verbatim as a standalone message
- [ ] Edge case: the command appears on its own line, so copying it does not pick
      up surrounding prose

**Dependencies:** None

**Complexity:** S

**Value:** HIGH

**Notes:** The parser is strict — a whole-string match. Any extra words on the
line make the reply a no-op.

---

### REQ-003: Approval request warns that the sending chat is not the approving chat

**Statement:** The system shall state explicitly that the bot delivering the
request cannot accept the reply.

**Acceptance Criteria:**
- [ ] The message states that the approving bot is different from the sender
- [ ] The message states that replying in the delivering chat has no effect
- [ ] The warning is present in both the resolved and fallback branches

**Dependencies:** REQ-001

**Complexity:** S

**Value:** HIGH

**Notes:** Naming the bot is necessary but insufficient. The reader's default
action — reply where the message arrived — is the wrong one, and silently so.

---

### REQ-004: Handle resolution fails soft

**Statement:** The system shall never allow deploy-bot handle resolution to
throw, block, or alter deploy state.

**Acceptance Criteria:**
- [ ] `deployBotHandle()` returns `null` rather than throwing on network error,
      non-`ok` response, or missing `username`
- [ ] A `null` handle still produces an approval request, using fallback wording
- [ ] The fallback names `TELEGRAM_DEPLOY_BOT_TOKEN` as the bot to use and
      satisfies REQ-002 and REQ-003
- [ ] `pm/.deploy-pending-<sha8>` is written regardless of resolution outcome, so
      the state machine is unaffected
- [ ] Edge case: a missing or empty `TELEGRAM_DEPLOY_BOT_TOKEN` yields `null`
      without a network call

**Dependencies:** REQ-001

**Complexity:** S

**Value:** HIGH

**Notes:** Mirrors the existing contract that `notify()` is best-effort — "a
notify failure never changes deploy state."

---

### REQ-005: At most one handle lookup per invocation

**Statement:** The system shall resolve the deploy bot handle at most once per
runner invocation, and only when an approval request is actually being sent.

**Acceptance Criteria:**
- [ ] The resolved value (including `null`) is memoised for the process lifetime
- [ ] Processing N projects that each need a request performs exactly one `getMe`
- [ ] No `getMe` is performed when no project reaches `request-approval`
- [ ] Edge case: a failed resolution is cached as `null` and not retried within
      the same invocation

**Dependencies:** REQ-001

**Complexity:** S

**Value:** MEDIUM

**Notes:** The runner is a `oneshot` unit fired every 30 minutes, so per-process
memoisation is the correct lifetime — a new tick re-resolves.

---

## Acceptance Criteria (Scenarios)

---

### Scenario 1: Actionable approval request

**Verifies:** REQ-001, REQ-002, REQ-003

**WHEN** a project reaches `request-approval` for sha `db255a7c` and `getMe`
resolves the deploy bot as `Nels_hermes_deploy_bot`

**THEN** the notification contains `@Nels_hermes_deploy_bot`,
`https://t.me/Nels_hermes_deploy_bot`, and `APPROVE db255a7c` on its own line

**AND** it states that this is a different bot from the sender and that replying
in the delivering chat does nothing

---

### Scenario 2: Approval completes the deploy

**Verifies:** REQ-002

**WHEN** Bryce sends exactly `APPROVE db255a7c` to the deploy bot from
`TELEGRAM_CHAT_ID` and the next reconcile tick runs

**THEN** `pollApprovals()` records `pm/.deploy-approved-db255a7c` and `decide()`
returns `deploy`

**AND** the test gate, deploy, and smoke verify run in order, and
`pm/.last-deployed` is written on success

---

### Scenario 3: Error Case — `getMe` unavailable

**Verifies:** REQ-004

**WHEN** the `getMe` call fails or returns no username

**THEN** the approval request is still sent, using wording that names
`TELEGRAM_DEPLOY_BOT_TOKEN` as the required bot and still carries the exact
`APPROVE <sha8>` command

**AND** `pm/.deploy-pending-<sha8>` is written and no exception propagates —
deploy state is byte-identical to the resolved path

---

### Scenario 4: Edge Case — multiple projects in one tick

**Verifies:** REQ-005

**WHEN** two projects both reach `request-approval` in the same invocation

**THEN** exactly one `getMe` call is made and both messages carry the same handle

---

### Scenario 5: Edge Case — rotated deploy bot token

**Verifies:** REQ-001

**WHEN** `TELEGRAM_DEPLOY_BOT_TOKEN` is changed to a different bot

**THEN** the next approval request names the new bot's handle with no code or
config change, because the handle is derived from the token being polled

---

## Invariants

- The bot named in the message is always the bot whose `getUpdates` is polled
- Message construction never throws and never changes deploy state
- The approval gate itself is never bypassed — this spec changes wording only
- Approvals are accepted only from `TELEGRAM_DEPLOY_BOT_TOKEN` and only from
  `TELEGRAM_CHAT_ID`; the notify bot remains unable to authorise a deploy
- Messages are plain text with no parse mode, so commit subjects cannot break
  rendering or inject markup

---

## Out of Scope

- Polling the notify bot for approvals
- Inline keyboards or callback-button approvals
- Changes to `decide()`, `parseApprovalCommand()`, or token file naming
- Disabling the approval gate for any project
- Enabling deploys for `tally`

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/deploy-runner.test.mjs` | `approval message names the deploy bot and the exact command` |
| Scenario 2 | manual / T-402 | live approval of `db255a7c` |
| Scenario 3 | `tests/deploy-runner.test.mjs` | `approval message falls back safely without a handle` |
| Scenario 4 | `tests/deploy-runner.test.mjs` | `deployBotHandle memoises and never throws` |
| Scenario 5 | covered by REQ-001 construction | handle derived from token, asserted in Scenario 1 |

---

## Next Step

Proceed to tasks phase.
