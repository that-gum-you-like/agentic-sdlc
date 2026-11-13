# Specs — runtime-memory-state

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/state-dir.mjs`, `agents/load-config.mjs`, `agents/memory-manager.mjs`, `agents/version-snapshot.mjs`, `agents/memory-publish.mjs`, `agents/migrate-runtime-state.mjs`, `hermes-drain.sh` env export. Band 010-019.

Prefix `RS` (see `openspec/REQUIREMENT-PREFIXES.md`). Scenarios are Given/When/Then and transcribe directly into the named test files. Node stdlib only; no new dependency; no OpenAI.

---

## RS-REQ-010 — Runtime memory resolves to a per-project state directory

**Statement:** `config.stateDir` shall be `$SDLC_STATE_DIR` when set, else `${XDG_STATE_HOME:-~/.local/state}/sdlc/<project>/`; `memoryPath(agent, layer)` shall be the only function that names a memory file location.

**Acceptance:** default path has the project name segment; `SDLC_STATE_DIR=legacy` returns `agents/<agent>/memory/<layer>.json` exactly as before; a pre-existing state dir not owned by the current uid is refused with a clear error and no write; created dirs are mode 0700; no configuration is required for any of this.

**Scenario:** GIVEN no env vars WHEN `memoryPath('sdlc-developer','core')` is called THEN it returns `<home>/.local/state/sdlc/agentic-sdlc/memory/sdlc-developer/core.json`.
**Scenario:** GIVEN `SDLC_STATE_DIR=legacy` WHEN called THEN it returns the tracked path.
**Scenario:** GIVEN the state dir exists owned by another uid WHEN the first write is attempted THEN it throws and nothing is written.

**Test:** `tests/state-dir.test.mjs` | **Complexity:** S | **Value:** CRITICAL | **Dependencies:** none

---

## RS-REQ-011 — Memory reads fall back to the tracked seed; writes never touch it

**Statement:** `loadMemory` shall read the state file, else the tracked seed, else empty; `saveMemory` shall write only to the state dir, atomically (temp + rename), after first copying the seed layer into state when state has none.

**Acceptance:** after any `saveMemory`, `git status --porcelain` in the checkout is unchanged; killing the process mid-write leaves either the old or the new file, never a truncated one; the audit append (`memory-audit.jsonl`, same line format as CV-REQ-072) moves to the state dir and an audit failure still never fails the save.

**Scenario:** GIVEN a seed core.json and an empty state dir WHEN a lesson is saved to `long-term` THEN the state file contains the seed entries plus the new one and the seed file is byte-identical.
**Scenario:** GIVEN the audit path is unwritable WHEN `saveMemory` runs THEN the memory file is written and a warning is logged.

**Test:** `agents/__tests__/memory-state.test.mjs` | **Complexity:** M | **Value:** CRITICAL | **Dependencies:** RS-REQ-010

---

## RS-REQ-012 — Concurrent writers cannot interleave a layer

**Statement:** `saveMemory` read-modify-write sequences for one agent shall be serialised by an advisory `mkdir` lock at `<stateDir>/memory/<agent>/.lock`, stale after 10 minutes.

**Acceptance:** two concurrent writers adding different entries to one layer both persist; a stale lock is broken; a timer-side writer that cannot lock within 5 s skips with a logged, non-fatal result; a worker-side writer retries.

**Scenario:** GIVEN two processes each append one lesson to `recent` WHEN they run at the same instant THEN the file contains both lessons.

**Test:** `agents/__tests__/memory-state.test.mjs` | **Complexity:** M | **Value:** HIGH | **Dependencies:** RS-REQ-011

---

## RS-REQ-013 — Worker-written memory survives the next drain pass

**Statement:** `hermes-drain.sh` shall export the host `SDLC_STATE_DIR` to the worker and the reviewer, so memory written from inside the drain clone lands outside it.

**Acceptance:** a `saveMemory` performed with `SDLC_PROJECT_DIR=<clone>` creates no file under the clone's `agents/*/memory/`; after the clone is `reset --hard` and `clean -fdq`, the entry is still readable; `pr-auto-review.mjs` recall in a clone returns state-dir memory.

**Scenario:** GIVEN a worker records a lesson in the clone WHEN the next pass resets the clone THEN `recall` still returns that lesson.

**Test:** `tests/hermes-drain.test.mjs`, `tests/runtime-state-isolation.test.mjs` | **Complexity:** M | **Value:** CRITICAL | **Dependencies:** RS-REQ-011 | **Lane:** interactive (guardrail surface)

---

## RS-REQ-014 — Snapshot and restore go through state

**Statement:** `version-snapshot snapshot` shall read live memory from the state dir and write the copy to tracked `agents/versions/<date>/memory/<agent>/`; `restore <date> --memory` shall write into the state dir.

**Acceptance:** AGENT.md snapshot behaviour unchanged; restore refuses a date with no memory snapshot (CV-REQ-072 unchanged); restore never writes a seed.

**Scenario:** GIVEN a corrupted state layer WHEN `restore <date> --memory` runs THEN the state file equals the snapshot copy and the seed is untouched.

**Test:** `agents/__tests__/memory-state.test.mjs` | **Complexity:** S | **Value:** MEDIUM | **Dependencies:** RS-REQ-011

---

## RS-REQ-015 — One-shot, verified, non-destructive migration

**Statement:** `migrate-runtime-state.mjs` shall copy every tracked memory layer to the state dir, verify sha256 of each copy, write a manifest, and report; it shall refuse to flip anything on a mismatch and shall never delete a seed.

**Acceptance:** idempotent (second run reports "already migrated" and changes nothing); a state file newer than its seed is never overwritten; `--dry-run` writes nothing; a pre-migration `version-snapshot` is taken first; the lesson preserved by PR #164 is asserted present in `sdlc-developer/long-term` after migration when that content is available in the seed or state.

**Scenario:** GIVEN 20 tracked layers WHEN migration runs THEN the manifest lists 20 matching hashes and `git status --porcelain` is empty.
**Scenario:** GIVEN one copy fails verification WHEN migration runs THEN it exits non-zero, writes no manifest, and the tracked files are intact.

**Test:** `tests/migrate-runtime-state.test.mjs` | **Complexity:** M | **Value:** CRITICAL | **Dependencies:** RS-REQ-010

---

## RS-REQ-016 — Memory reaches git only by a batched, scrubbed, never-self-merged PR

**Statement:** `memory-publish.mjs` shall, from a scratch worktree off `origin/<base>`, write only changed layers into the seeds, commit on `chore/memory-publish-<date>`, push, open a PR, and stop. It shall refuse the entire publish if `pii-scrub` or a secrets-pattern check matches the added content.

**Acceptance:** no diff -> exit 0, no branch, no PR; a matching secret -> exit non-zero, nothing written or pushed, one deduped alert; skip when a memory-publish PR is already open; the live checkout is never read-written; never merges.

**Scenario:** GIVEN state differs from seed in two layers WHEN publish runs THEN one PR changes exactly those two files.
**Scenario:** GIVEN an added entry contains `sk-...` WHEN publish runs THEN no branch is pushed.

**Test:** `tests/memory-publish.test.mjs` | **Complexity:** L | **Value:** HIGH | **Dependencies:** RS-REQ-011

---

## RS-REQ-017 — Derived memory artifacts are not tracked

**Statement:** `agents/*/memory/vectors.json` (derived by `rag-indexer`) shall be gitignored and untracked, and rebuilt on demand.

**Acceptance:** `git ls-files` lists no `vectors.json`; `rag-indexer` regenerates it into the state dir.

**Scenario:** GIVEN `vectors.json` is removed WHEN `rag-indexer.mjs` runs THEN it is recreated outside the checkout.

**Test:** `tests/runtime-state-isolation.test.mjs` | **Complexity:** S | **Value:** LOW | **Dependencies:** RS-REQ-010

---

## Invariants

- No runtime process writes a tracked file in any human checkout.
- Seeds change only through a reviewed PR.
- Memory is never deleted by migration, publish or rollback.

## Out of Scope

- Cross-host sync; encryption at rest of the state dir; changing the memory layer schema.
