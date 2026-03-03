# Tasks: Human Approval Layer

## 1. Config Extension

- [x] 1.1 Update `load-config.mjs` to resolve `notification` section from project.json with defaults (`provider: "none"`, `mailboxPath: "pm/mailbox.md"`, `mediaDir: "pm/media"`, `triggers: {}`, `channel: ""`)
- [x] 1.2 Create `agents/templates/notification.json.template` with example config for openclaw, file, and none providers
- [x] 1.3 Update `agents/project.json.template` to include the notification section

## 2. Core notify.mjs Script

- [x] 2.1 Create `agents/notify.mjs` with CLI: `send`, `approve`, `check-mailbox`, `pending`, `resolve`, `status` subcommands
- [x] 2.2 Implement `send` subcommand — dispatches to provider (openclaw, file, none) with optional `--media` flag
- [x] 2.3 Implement OpenClaw provider — calls `openclaw message send` CLI with channel and optional media
- [x] 2.4 Implement file provider — appends timestamped message to mailbox file
- [x] 2.5 Implement none provider — prints to stdout, exits 0
- [x] 2.6 Implement `status` subcommand — checks provider health (OpenClaw: `which openclaw`, file: path writable)

## 3. Approval Gate

- [x] 3.1 Implement `approve` subcommand — sends request, creates `pm/approvals/<id>.json`, polls for response
- [x] 3.2 Implement approval file schema: id, type, requestedBy, taskId, message, media, status, requestedAt, timeout, response, respondedAt
- [x] 3.3 Implement `pending` subcommand — reads and lists all pending approvals from `pm/approvals/`
- [x] 3.4 Implement `resolve` subcommand — manually set approved/rejected with optional `--note`
- [x] 3.5 Implement timeout logic — first timeout sends reminder, second timeout auto-approves with `autoApproved: true`

## 4. Mailbox Integration

- [x] 4.1 Implement `check-mailbox` subcommand — reads mailbox file, finds messages since last check, matches to pending approvals
- [x] 4.2 Implement keyword matching — "approved"/"yes"/"lgtm" → approve, "no"/"reject" → reject, unrecognized → log only
- [x] 4.3 Track last-checked position in `pm/approvals/.mailbox-cursor.json` to avoid re-processing old messages

## 5. Trigger Integration

- [x] 5.1 Add blocker notification to `queue-drainer.mjs` — fires when task flagged blocked and `triggers.blocker` is true
- [x] 5.2 Add budget alert to `queue-drainer.mjs` — fires when agent hits 80% daily budget and `triggers.budgetAlert` is true
- [x] 5.3 Add daily summary notification to `cycles/daily-review.mjs` — fires at end of review and `triggers.dailySummary` is true
- [x] 5.4 Add high-severity failure notification to `memory-manager.mjs` — fires on HIGH/CRITICAL severity and `triggers.highSeverityFailure` is true

## 6. Queue Drainer Approval Gate

- [x] 6.1 Modify `queue-drainer.mjs complete` to check task's `approvalRequired` field — if true, call `notify.mjs approve` before marking complete
- [x] 6.2 Handle approval rejection — if rejected, keep task in_progress and log rejection reason

## 7. Setup and Templates

- [x] 7.1 Update `setup.mjs` to prompt for notification provider during bootstrap, create `pm/approvals/` directory, and add notification config to project.json
- [x] 7.2 Create `pm/mailbox.md` with header during setup (empty mailbox ready for messages)
- [x] 7.3 Update `agents/templates/AGENT.md.template` to mention notification channel in the micro cycle (check mailbox at session start)

## 8. Documentation

- [x] 8.1 Update `CLAUDE.md` — add Notification & Approval section with `notify.mjs` commands, trigger config, and done checklist integration
- [x] 8.2 Update `docs/agent-system.md` — add Human Communication section covering the notification channel, mailbox, and approval workflow
- [x] 8.3 Update `docs/safety-mechanisms.md` — add Approval Gates as a sixth safety mechanism
- [x] 8.4 Add `agents/notify.mjs` to CLAUDE.md script reference table

## 9. Verification

- [x] 9.1 Syntax-check all modified scripts (`node --check`)
- [x] 9.2 Run behavior tests (`test-behavior.mjs`) — all must pass
- [x] 9.3 Test `notify.mjs status` with no provider configured (should report "none" gracefully)
- [x] 9.4 Test `notify.mjs send` with file provider (should append to mailbox file)
- [x] 9.5 Test `notify.mjs approve` + `resolve` cycle (create approval, resolve manually, verify file updated)
- [x] 9.6 Test `notify.mjs pending` with mixed approval states
- [x] 9.7 Commit and push to GitHub
