# Tasks: runtime-state-isolation

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: tasks

---

## Overview

Implements `design.md` and the six specs under `specs/` (prefix `RS`). Authored artifacts only; **nothing here is implemented**. Specs approved 2026-11-12 (Bryce delegated all decisions); readiness is `approved`. **RS-601 (the Hermes mount change) is the FIRST task and must land before every other task.**
Node stdlib only, zero new dependencies, no OpenAI, no Anthropic API. Tests run with `node --test <file>` (full: `npm test`). Tasks that touch the guardrail surface (`hermes-drain.sh`,
`pr-auto-review.mjs`, `cron-schedule.json`, the trespass guard) are `Lane: interactive` so the cheap drain never claims them; the rest are `Lane: hermes`. All timing and ownership inputs are injectable so tests need no root, no systemd, no network.

---

## Prerequisites

- [x] Bryce approves proposal, design and specs (decisions delegated 2026-11-12)
- [x] Open questions 1-4 decided and final: root source found (Docker home mount); state dir + Sunday 23:45 publish accepted; `sdlc-update` alert-only; PR #164 merged first
- [x] PR #164 (preserved dirty-tree state) merged; lesson content is on main, so migration RS-004 can assert it

---

## Work Stream Summary

| Work Stream | Lane | Tasks | Parallel With |
|---|---|---|---|
| Sandbox isolation | interactive (RS-601..603), hermes (RS-604) | RS-601..RS-604 | FIRST; nothing else starts before RS-601 |
| State dir + memory | hermes (+ interactive RS-006, RS-007) | RS-001..RS-009 | task archive, update, doctor |
| Task archive | hermes | RS-101..RS-103 | state dir, update, doctor |
| Update safety | hermes (+ Bryce for RS-203) | RS-201..RS-203 | all others |
| Checkout hygiene | hermes (+ interactive RS-303) | RS-301..RS-303 | all others |
| Guard and review | interactive | RS-401..RS-403 | blocked by RS-001..RS-009, RS-101 |

---

## Implementation Tasks

### Phase 0: Sandbox isolation (RS-REQ-060..064). DO THIS FIRST

- [ ] **RS-601** (FIRST): Change Hermes so sandboxes no longer mount the home: create `~/.hermes/workspaces/<project>` worktrees, set `docker_mount_cwd_to_workspace: false` and the `terminal.docker_*` volume to mount only that workspace at `/workspace`, stop and recreate `hermes-a08d6519`, `hermes-3ea76145`, `hermes-ed0a7fff`, verify with `docker inspect` that no mount sources `/home/bryce` rw and that a container-written file is human-owned
  - Files: none in repo (`~/.hermes/config.yaml`, containers); results noted in `docs/RUNBOOK.md`
  - Spec: RS-REQ-060, RS-REQ-061, RS-REQ-062
  - Tests: verified by RS-602 guard (rc 0 on the new config) and RS-603 doctor against the recreated containers
  - Lane: interactive (Bryce session only; outside the repo, guardrail surface) | Parallel: NO, blocks all other tasks | Complexity: M

- [x] **RS-602**: Config guard: extend `agents/hermes-cron-guard.mjs` or add `agents/hermes-config-guard.mjs`; wire into `health-check.mjs`
  - Files: `agents/hermes-cron-guard.mjs` or `agents/hermes-config-guard.mjs`, `agents/health-check.mjs`, `tests/hermes-config-guard.test.mjs`
  - Spec: RS-REQ-063, RS-REQ-060, RS-REQ-061
  - Tests: `hermes-config-guard.test.mjs` "flag true + home cwd -> fail", "flag true + dedicated workspace cwd -> pass", "rw volume of live checkout -> fail", "ro volume permitted only when listed", "missing config -> pass with note", "never writes the config", "workspace mount is per project", "mount source is not the live checkout"
  - Lane: interactive | Parallel: blocked-by RS-601 for the live verification, tests can be written first | Complexity: M

- [x] **RS-603**: `checkout-doctor` inspects running `hermes-*` containers' Mounts for rw home/ancestor/live-checkout; `health-check` alerts once per container-id set
  - Files: `agents/checkout-doctor.mjs`, `agents/health-check.mjs`, `tests/checkout-doctor.test.mjs`, `tests/health-check.test.mjs`
  - Spec: RS-REQ-064
  - Tests: `checkout-doctor.test.mjs` "rw home mount reported", "dedicated workspace mount clean", "docker missing is a note"; `health-check.test.mjs` "new exposed container alerts once"
  - Lane: hermes | Parallel: blocked-by RS-301 (doctor skeleton) | Complexity: S

- [x] **RS-604**: Output-via-git check and docs: test that a sandbox write leaves the live checkout status unchanged; RUNBOOK section on the dedicated workspace and how to collect sandbox output (branch/PR, bundle fallback)
  - Files: `tests/hermes-config-guard.test.mjs`, `docs/RUNBOOK.md`
  - Spec: RS-REQ-062
  - Tests: "live checkout status unchanged after sandbox write"
  - Lane: hermes | Parallel: blocked-by RS-602 | Complexity: S

### Phase 1: State directory and memory (RS-REQ-010..017)

- [x] **RS-001**: Write failing tests, then `agents/state-dir.mjs` (`resolveStateDir`, `memoryPath`, `isLegacyMode`, ownership check, 0700 create) and wire `config.stateDir` in `load-config.mjs`
  - Files: `agents/state-dir.mjs`, `agents/load-config.mjs`, `tests/state-dir.test.mjs`
  - Spec: RS-REQ-010, RS-REQ-043
  - Tests: `state-dir.test.mjs` "default path has project segment", "legacy mode returns tracked path", "foreign-owned dir refused, nothing written", "env override wins"
  - Lane: hermes | Parallel: yes | Complexity: S

- [x] **RS-002**: Route `getMemoryPath`/`loadMemory`/`saveMemory` through the resolver with seed fallback, seed-copy-on-first-write, atomic write; move audit append to the state dir
  - Files: `agents/memory-manager.mjs`, `agents/__tests__/memory-state.test.mjs`, `agents/__tests__/memory-audit.test.mjs`
  - Spec: RS-REQ-011
  - Tests: `memory-state.test.mjs` "read falls back to seed", "save never touches seed (git status unchanged)", "truncated write impossible (kill simulation)", "audit failure never fails save"
  - Lane: hermes | Parallel: blocked-by RS-001 | Complexity: M

- [x] **RS-003**: Per-agent `mkdir` advisory lock around read-modify-write (stale 10 min; timer skips after 5 s, worker retries)
  - Files: `agents/memory-manager.mjs`, `agents/__tests__/memory-state.test.mjs`
  - Spec: RS-REQ-012
  - Tests: "two concurrent writers both persist", "stale lock broken", "timer skip is non-fatal"
  - Lane: hermes | Parallel: blocked-by RS-002 | Complexity: M

- [x] **RS-004**: `migrate-runtime-state.mjs` (copy, sha256 verify, manifest, `--dry-run`, idempotent, pre-snapshot, never deletes seeds)
  - Files: `agents/migrate-runtime-state.mjs`, `tests/migrate-runtime-state.test.mjs`
  - Spec: RS-REQ-015
  - Tests: "20 layers -> 20 matching hashes", "mismatch exits non-zero, no manifest, seeds intact", "second run is a no-op", "newer state never overwritten", "dry-run writes nothing"
  - Lane: hermes | Parallel: blocked-by RS-002 | Complexity: M

- [x] **RS-005**: `version-snapshot` and `rem-sleep`, `worker`, `rag-indexer` read/write via the resolver; gitignore and untrack `vectors.json`
  - Files: `agents/version-snapshot.mjs`, `agents/rem-sleep.mjs`, `agents/worker.mjs`, `agents/rag-indexer.mjs`, `.gitignore`, `agents/__tests__/memory-state.test.mjs`
  - Spec: RS-REQ-014, RS-REQ-017
  - Tests: "restore --memory writes state not seed", "vectors.json recreated outside checkout", "snapshot reads state, writes agents/versions"
  - Lane: hermes | Parallel: blocked-by RS-002 | Complexity: M

- [x] **RS-006**: `hermes-drain.sh` exports host `SDLC_STATE_DIR` to the worker; `pr-auto-review.mjs` recall uses it
  - Files: `agents/hermes-drain.sh`, `agents/pr-auto-review.mjs`, `tests/hermes-drain.test.mjs`, `tests/pr-auto-review.test.mjs`
  - Spec: RS-REQ-013, RS-REQ-052
  - Tests: "worker env contains SDLC_STATE_DIR", "clone memory write leaves clone clean", "recall survives clone reset", "reviewer recall reads state dir"
  - Lane: interactive | Parallel: blocked-by RS-002 | Complexity: M

- [x] **RS-007**: `memory-publish.mjs` (scratch worktree, diff, pii-scrub + secrets check, branch, PR, one-open-PR rule, never merges) and `memory-publish-weekly` schedule entry
  - Files: `agents/memory-publish.mjs`, `agents/cron-schedule.json`, `agents/templates/cron-schedule.json.template`, `tests/memory-publish.test.mjs`
  - Spec: RS-REQ-016, RS-REQ-053
  - Tests: "no diff -> no PR", "secret in diff -> refusal, nothing pushed, one alert", "two changed layers -> one PR with exactly two files", "skips when a publish PR is open", "no merge call exists"
  - Lane: interactive (cron-schedule is guardrail surface) | Parallel: blocked-by RS-002 | Complexity: L

- [ ] **RS-008** (NOT DONE: operational cutover, run by Bryce; see Implementation notes below): Run migration on this host (Bryce session): dry-run, real run, verify manifest, confirm PR #164 lesson present, set `SDLC_STATE_DIR` unit env if a non-default location is wanted (default needs none)
  - Files: none (operational); results noted in `docs/RUNBOOK.md`
  - Spec: RS-REQ-015
  - Lane: interactive | Parallel: blocked-by RS-004, RS-005, RS-006 | Complexity: S
  - Notes: rollback is `SDLC_STATE_DIR=legacy`; state dir and seeds both retained.

- [x] **RS-009**: Docs: RUNBOOK section "Where runtime state lives", state-dir layout, publish PR review, rollback
  - Files: `docs/RUNBOOK.md`, `docs/appendix/script-reference.md`, `CLAUDE.md` Memory System section (one line)
  - Spec: RS-REQ-010, RS-REQ-016
  - Lane: hermes | Parallel: blocked-by RS-005 | Complexity: S

### Implementation notes (RS-001..RS-007, RS-009; branch feat/rs-runtime-state)

- RS-002/003 live in a new `agents/memory-store.mjs` (`createMemoryStore`: seed-fallback read, atomic write, per-agent `mkdir` lock, audit) rather than inline in `memory-manager.mjs`, so `rem-sleep`, `worker`, `semantic-index`, `version-snapshot`, `pattern-hunt`, `migrate-memory`, `monthly-review`, `weekly-review` and the migration share one implementation. Tests: `agents/__tests__/memory-state.test.mjs`.
- RS-004: the "pre-migration snapshot" is written under `<stateDir>/migration/pre-migration-snapshot/` (not tracked `agents/versions/`), so migration leaves `git status` clean. Migration additionally merges the PR #164 `state-archive/*/agent-memory-local-state` entries by id (a higher-layer archive position is a promotion, composted ids stay composted) and fails if any archived sdlc-developer long-term lesson is absent afterwards.
- RS-005 also routed the other in-tree memory writers (`pattern-hunt` teach, `migrate-memory`, `monthly-review` compost cleanup, `weekly-review` maturation metrics) through the store; without that the checkout would still be dirtied by the weekly/monthly cycles. `autonomous-launcher.sh` prompt now says `memory-manager.mjs recall` instead of reading seed files.
- RS-007: pii-scrub entities block a publish only for high-risk types (email except `noreply@`, phone, SSN, card, IBAN, bank, passport, licence, crypto, IP); PERSON/LOCATION/DATE are normal memory content. `rem-sleep` locks per layer save (skip-after-5s), not across the whole async consolidation.
- RS-008 cutover (Bryce): see RUNBOOK section 15.

### Phase 2: Task archive (RS-REQ-020..022)

- [x] **RS-101**: `archive` stamps `archived_at` in place; `archiveTask` no longer renames; default list hides archived, `--all` shows
  - Files: `agents/queue-drainer.mjs`, `agents/adapters/orchestration/file-based.mjs`, `tests/queue-drainer-archive.test.mjs`
  - Spec: RS-REQ-020, RS-REQ-043
  - Tests: "3 completed + 2 pending -> 3 stamped, 0 moved, no completed dir", "re-run does not restamp", "root-owned queue reports and writes nothing"
  - Lane: hermes | Parallel: yes | Complexity: S

- [x] **RS-102**: Readers use archived-in-queue: counts, dependency resolution, `capability-monitor`; legacy `tasks/completed/` read for counts only
  - Files: `agents/queue-drainer.mjs`, `agents/adapters/orchestration/file-based.mjs`, `agents/capability-monitor.mjs`, `agents/__tests__/capability-monitor.test.mjs`, `tests/queue-drainer-archive.test.mjs`
  - Spec: RS-REQ-021
  - Tests: "dependency on archived task is satisfied", "counts = queue-archived + legacy", "no writer to completedDir"
  - Lane: hermes | Parallel: blocked-by RS-101 | Complexity: M

- [x] **RS-103**: `migrate-task-archive.mjs` (restore missing, skip identical, save conflicts to state dir, never touch the legacy dir, print human chown/remove command)
  - Files: `agents/migrate-task-archive.mjs`, `tests/migrate-task-archive.test.mjs`
  - Spec: RS-REQ-022
  - Tests: "146 files: 144 no-op, 2 conflicts saved, queue unchanged", "idempotent", "unreadable dir reports, writes nothing", "dry-run"
  - Lane: hermes | Parallel: blocked-by RS-001, RS-101 | Complexity: S

### Phase 3: Update safety (RS-REQ-030..033)

- [x] **RS-201**: `sdlc-update.mjs` with pure `classifyTree`, injectable git runner and notifier; never stash/reset/checkout/clean/chown
  - Files: `agents/sdlc-update.mjs`, `tests/sdlc-update.test.mjs`
  - Spec: RS-REQ-030, RS-REQ-031, RS-REQ-032
  - Tests: classification table (clean+behind, dirty-disjoint, dirty-overlap, ahead, wrong branch, mid-rebase, fetch fail); "argv never contains stash/reset/checkout/clean"; "same cause twice -> one alert"; "notifier throws -> exit 0"; "31 behind -> drift alert with count and date"
  - Lane: hermes | Parallel: yes | Complexity: M
  - Notes: reuse `triggerNotificationOnce` from `agents/notify.mjs`; guard CLI with `__isMainModule`.

- [x] **RS-202**: Repo-owned unit template and test that it calls `sdlc-update.mjs` (no `git pull`)
  - Files: `agents/templates/systemd/sdlc-update.service.template`, `tests/sdlc-update.test.mjs`, `docs/RUNBOOK.md`
  - Spec: RS-REQ-033
  - Lane: hermes | Parallel: blocked-by RS-201 | Complexity: S

- [x] **RS-203**: Install the new `ExecStart` in `~/.config/systemd/user/sdlc-update.service` and `daemon-reload` (Bryce session only; outside the repo)
  - Files: none (operational)
  - Spec: RS-REQ-033
  - Lane: interactive | Parallel: blocked-by RS-202 | Complexity: S
  - Notes: verify by `systemctl --user start sdlc-update` on the live tree; confirm exactly one alert or one clean pull.

### Phase 4: Checkout hygiene (RS-REQ-040..043)

- [x] **RS-301**: `checkout-doctor.mjs` read-only report, `--json`, injectable ownership lookup, shared ownership helper (also used by RS-001/RS-201)
  - Files: `agents/checkout-doctor.mjs`, `agents/state-dir.mjs` (helper export), `tests/checkout-doctor.test.mjs`
  - Spec: RS-REQ-040
  - Tests: "root-owned dir and untracked secrets.mjs reported with owner and command", "clean tree exits 0 with no findings", "never modifies anything (fixture hash before/after)", "unreadable path reported"
  - Lane: hermes | Parallel: yes | Complexity: M

- [ ] **RS-302**: `health-check.mjs` runs the doctor and raises the existing notification, deduped per path set
  - Files: `agents/health-check.mjs`, `tests/health-check.test.mjs`
  - Spec: RS-REQ-041
  - Tests: "new foreign path alerts once", "unchanged set silent inside window"
  - Lane: hermes | Parallel: blocked-by RS-301 | Complexity: S

- [x] **RS-303**: No-root rule: `hermes-drain.sh` and `drain-supervisor.mjs` exit 98 at uid 0 before any side effect
  - Files: `agents/hermes-drain.sh`, `agents/drain-supervisor.mjs`, `tests/hermes-drain.test.mjs`, `tests/drain-supervisor-review.test.mjs`
  - Spec: RS-REQ-042
  - Tests: "uid 0 -> rc 98, no mutex/clone/log created", "dry-run also refuses", "message names the user-level unit"
  - Lane: interactive | Parallel: yes | Complexity: S

### Phase 5: Guard and review interaction (RS-REQ-050..053)

- [ ] **RS-401**: Whole-cycle cleanliness integration test (archive, REM sleep, snapshot, rag-index, daily/weekly/monthly in a fixture repo): `git status --porcelain` empty
  - Files: `tests/runtime-state-isolation.test.mjs`
  - Spec: RS-REQ-050, RS-REQ-017
  - Tests: "no tracked or untracked-unignored change after every cycle script"; any failure names the script to move
  - Lane: interactive | Parallel: blocked-by RS-005, RS-101 | Complexity: M

- [ ] **RS-402**: Trespass guard stays strict: update header comment, add tests (tracked edit restored and rc 97; state-dir write ignored)
  - Files: `agents/drain-trespass-guard.sh`, `tests/drain-trespass-guard.test.mjs`
  - Spec: RS-REQ-051
  - Lane: interactive | Parallel: blocked-by RS-401 | Complexity: S

- [ ] **RS-403**: Memory-only PRs are not guardrail-surface; publisher has no merge call (assert in `hardGate` fixture)
  - Files: `tests/pr-auto-review.test.mjs`, `tests/memory-publish.test.mjs`
  - Spec: RS-REQ-053
  - Lane: interactive | Parallel: blocked-by RS-007 | Complexity: S

### Phase 6: Verify and ship

- [ ] **RS-501**: Full suite and validators
  - Command: `npm test` (includes `node agents/four-layer-validate.mjs`, `test-behavior.mjs --framework`, `--drift`)
  - Expected: all passing; `__isMainModule` guard present on every new script
- [ ] **RS-502**: One-week soak on the host after RS-008 and RS-203; `checkout-doctor --json` shows zero findings; record result in the change dir; then archive the change per OpenSpec
- [ ] **RS-503**: Update memory with change summary (via the new path: `memory-manager.mjs record`)

---

## Completion Criteria

- [ ] All tasks checked off; `npm test` green; no regressions
- [ ] `git status --porcelain` clean in the live checkout after a scheduler week
- [ ] No drain pass loses agent memory (RS-REQ-013 proven by test and one real pass)
- [ ] `sdlc-update` has produced either a pull or exactly one specific alert for every tick
- [ ] Change committed, pushed, reviewed by Bryce, archived

---

## Notes

- Order: RS-601 first (stops the root writes at the source), then RS-602/RS-603/RS-604, then the rest. Within the rest: land RS-001..RS-005 and RS-101 before RS-006/RS-008; the migration (RS-008) is the only step that changes behaviour on this host and is reversible by one env var.
- Do not touch `agents/secrets.mjs` here; it is reported by the doctor, owned by a separate decision about the VaultWarden resolver.
- Run drains and tests for this change from a worktree (`agents/worktree.mjs`), never the live checkout.
