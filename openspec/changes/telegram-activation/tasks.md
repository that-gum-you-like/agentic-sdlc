# Tasks — telegram-activation

## Implementation

- [x] **T1**: `agents/scheduler-install.mjs` — add `EnvironmentFile=-%h/.hermes/.env` to generated `[Service]` blocks
  - Complexity: S · Spec: REQ-001
- [x] **T2**: `agents/notify.mjs` — `sendDesktopNotification()` helper (notify-send, DBUS fallback, never throws) + fire it from `sendNotification()` when `notification.desktop` is true
  - Complexity: S · Spec: REQ-003
- [x] **T3**: `agents/project.json` — provider → `telegram`, `desktop: true`, enable deployComplete/deployFailed/deployRolledBack triggers
  - Complexity: S · Spec: REQ-002
- [x] **T4**: `agents/hermes-drain.sh` — best-effort completion notify with the drained project's config
  - Complexity: S · Spec: REQ-004
- [x] **T5**: `agents/pr-auto-review.mjs` — best-effort notify after squash-merge
  - Complexity: S · Spec: REQ-005

## Verification

- [x] **T6**: `tests/scheduler-install.test.mjs` — EnvironmentFile line present in buildUnits output
  - Complexity: S · Spec: REQ-001
- [x] **T7**: `tests/notify-desktop.test.mjs` — desktop helper no-throw without notify-send; provider result unaffected
  - Complexity: S · Spec: REQ-003
- [x] **T8**: `tests/hermes-drain.test.mjs` — notify present, `|| true` guarded, absent on dry-run
  - Complexity: S · Spec: REQ-004
- [x] **T9**: `npm test` green (no regressions)
  - Complexity: S · Spec: all

## Host activation (with Bryce — not repo tasks)

- [ ] **T10**: BotFather ×2, chat id, 3 vars into `~/.hermes/.env`
- [ ] **T11**: `auth.json` → openrouter; remove `chronos` plugin; restart gateway; `scheduler-install.mjs install`
- [ ] **T12**: Acceptance: bot replies in chat; `telegram-notify.mjs send` arrives; desktop popup fires; gateway log clean
