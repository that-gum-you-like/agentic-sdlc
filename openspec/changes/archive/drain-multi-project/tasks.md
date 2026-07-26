# Tasks — drain-multi-project

## Implementation

- [x] **T-101**: Split `SCRIPTS_DIR` (script's own location) from `REPO` (drain target) in `agents/hermes-drain.sh`; `REPO` keeps defaulting to the framework repo so the installed timer is unaffected
  - Complexity: S · Spec: REQ-005
- [x] **T-102**: Cost gate invokes `"$SCRIPTS_DIR/queue-drainer.mjs" status --project-dir "$REPO"`
  - Complexity: S · Spec: REQ-005
- [x] **T-103**: Prompt resolution chain — `SDLC_DRAIN_PROMPT` → project `agents/drain-prompt.md` → framework `agents/drain-prompt.md`
  - Complexity: S · Spec: REQ-005
- [x] **T-104**: Cost gate captures stderr, exits non-zero on failure or unparseable output, and reaches the "no ready tasks" path only on a parsed zero
  - Complexity: S · Spec: REQ-006
- [x] **T-105**: `detect_base_branch()` from `origin/HEAD` with `SDLC_BASE_BRANCH` override and `main` as last-resort fallback; refresh `origin/HEAD` when missing; clone checkout/reset use the resolved branch
  - Complexity: M · Spec: REQ-007
- [x] **T-106**: Pass the resolved base branch into the drain prompt so the agent branches off the right base
  - Complexity: S · Spec: REQ-007
- [x] **T-107**: Per-project `DRAIN_CLONE` and `LOGDIR`; mutex stays host-global and shared with `pr-auto-review`
  - Complexity: S · Spec: REQ-008

## Verification

- [x] **T-201**: `tests/hermes-drain.test.mjs` — framework resolution independent of `SDLC_REPO` (fixture project without framework scripts)
  - Complexity: M · Spec: REQ-005
- [x] **T-202**: `tests/hermes-drain.test.mjs` — status failure exits non-zero AND does not emit "no ready tasks"
  - Complexity: M · Spec: REQ-006
- [x] **T-203**: `tests/hermes-drain.test.mjs` — `origin/HEAD`=`master` detected; `SDLC_BASE_BRANCH` overrides; missing `origin/HEAD` falls back to `main`
  - Complexity: M · Spec: REQ-007
- [x] **T-204**: `npm test` green including the existing drain suite (no regressions to `REQ-001`–`REQ-004`)
  - Complexity: S · Spec: REQ-005, REQ-006, REQ-007, REQ-008
- [x] **T-205**: Live check — `SDLC_REPO=~/tally bash agents/hermes-drain.sh --dry-run` reports the real ready-task count instead of "no ready tasks"
  - Complexity: S · Spec: REQ-005, REQ-006

## Notes

- Discovered while seeding the 24-task `game-log-inventory` backlog into `~/tally`: a full, unblocked queue reported "no ready tasks — skip".
- `~/tally` defaults to `master`, which is what surfaced the hardcoded `main`.
- Changing the framework repo's own default clone path to `~/.sdlc-drain-clone-agentic-sdlc` causes one re-clone on the next scheduled run. Expected, not data loss — the clone is derived state.
