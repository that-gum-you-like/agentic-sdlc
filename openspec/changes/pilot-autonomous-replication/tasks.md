# Tasks — pilot-autonomous-replication

## Setup (scripted)

- [x] **T1**: Create + clone private repo `that-gum-you-like/hermes-pilot`; bootstrap with `setup.mjs --yes`
  - Complexity: S · Spec: REQ-001
- [x] **T2**: `vercel link`; deploy block enabled with team-scoped smoke URL; telegram+desktop notifications; testCmd `node tests/smoke.test.mjs`
  - Complexity: S · Spec: REQ-001
- [x] **T3**: OpenRouter-only budget ladders (zero Claude/Anthropic models)
  - Complexity: S · Spec: REQ-001
- [x] **T4**: Seed `tasks/queue/PILOT-001.json`; initial commit pushed to `main`; `SDLC_REPO=~/hermes-pilot hermes-drain.sh --dry-run` → 1 ready task
  - Complexity: S · Spec: REQ-001

## Arming (ONLY after Telegram is live — REQ-002)

- [x] **T5**: `notify.mjs status` ✅ + test Telegram message received
  - Complexity: S · Spec: REQ-002
- [x] **T6**: Add pilot-drain / pilot-review jobs + extend deploy-reconcile in `agents/cron-schedule.json`; `scheduler-install.mjs install`
  - Complexity: S · Spec: REQ-002

## Proof (autonomous — observe only)

- [ ] **T7**: Draft PR from `agent/drain/PILOT-001` opened by the drain
  - Complexity: S · Spec: REQ-003
- [ ] **T8**: pr-auto-review squash-merges after clean-worktree test gate
  - Complexity: S · Spec: REQ-003
- [ ] **T9**: Approval requested on Telegram; Bryce replies `APPROVE <sha8>`; deploy + smoke verify pass; page live
  - Complexity: S · Spec: REQ-003
- [ ] **T10**: Evidence recorded in status.json (PR#, messages, receipt, URL); PILOT-001 completed
  - Complexity: S · Spec: REQ-003

## Fallback validation

- [ ] **T11**: One tally task through drain → PR → review (deploy dark)
  - Complexity: S · Spec: REQ-004
