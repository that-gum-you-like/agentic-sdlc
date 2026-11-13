# Specs — task-archive

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/queue-drainer.mjs`, `agents/adapters/orchestration/file-based.mjs`, `agents/load-config.mjs`, `agents/capability-monitor.mjs`, `agents/migrate-task-archive.mjs`. Band 020-029.

Prefix `RS` (see `openspec/REQUIREMENT-PREFIXES.md`). Scenarios are Given/When/Then and transcribe directly into the named test files. Node stdlib only; no new dependency; no OpenAI.

---

## RS-REQ-020 — Archive stamps in place and moves nothing

**Statement:** `queue-drainer.mjs archive` shall set `archived_at` on each `status: completed` task file in `tasks/queue/` and shall not rename, move or delete any file.

**Acceptance:** after `archive`, `git diff --stat` shows only modifications (the stamp), no deletions and no untracked paths; re-running archive does not restamp; tasks that are not completed are untouched.

**Scenario:** GIVEN 3 completed and 2 pending tasks WHEN archive runs THEN 3 files gain `archived_at`, 0 files leave `tasks/queue/`, and `tasks/completed/` is not created.
**Scenario:** GIVEN a task already archived WHEN archive runs again THEN its `archived_at` is unchanged.

**Test:** `tests/queue-drainer-archive.test.mjs` | **Complexity:** S | **Value:** HIGH | **Dependencies:** none

---

## RS-REQ-021 — Readers treat archived-in-queue as archived

**Statement:** the status summary, `loadCompletedCount`, dependency resolution and `capability-monitor` shall read archived tasks from `tasks/queue/`; a legacy `tasks/completed/` shall be read for counts only if it exists; the default task list shall hide `archived_at` tasks, `--all` shall show them.

**Acceptance:** a dependency on an archived task still resolves as satisfied (`status === 'completed'`); counts equal queue-archived plus legacy dir; no code path writes `config.completedDir`.

**Scenario:** GIVEN task B depends on archived task A WHEN B is evaluated for readiness THEN it is ready.

**Test:** `tests/queue-drainer-archive.test.mjs`, `agents/__tests__/capability-monitor.test.mjs` | **Complexity:** M | **Value:** HIGH | **Dependencies:** RS-REQ-020

---

## RS-REQ-022 — Legacy archive is restored without loss or deletion

**Statement:** `migrate-task-archive.mjs` shall restore each file in `tasks/completed/` into `tasks/queue/` when the name is absent; when present and byte-identical it shall do nothing; when present and different it shall keep the queue copy and save the other to `<stateDir>/migration/task-archive-conflicts/`. It shall never delete or modify `tasks/completed/`.

**Acceptance:** `--dry-run` supported; prints the one command a human can run to remove a root-owned `tasks/completed/`; idempotent; works when the directory is unreadable by writing nothing and reporting.

**Scenario:** GIVEN 146 archived files of which 144 match the queue WHEN migrate runs THEN 144 are no-ops, 2 are saved as conflicts, and the queue is unchanged.

**Test:** `tests/migrate-task-archive.test.mjs` | **Complexity:** S | **Value:** MEDIUM | **Dependencies:** RS-REQ-020

---

## Invariants

- Origin/main's `tasks/queue/` is the only task store; there is no tracked-vs-untracked split of finished tasks.

## Out of Scope

- Pruning old tasks from the queue; changing task schema beyond the optional `archived_at`.
