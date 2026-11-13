# Specs — guard-and-review-interaction

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/drain-trespass-guard.sh`, `agents/pr-auto-review.mjs` and the scheduled cycles. Band 050-059.

Prefix `RS` (see `openspec/REQUIREMENT-PREFIXES.md`). Scenarios are Given/When/Then and transcribe directly into the named test files. Node stdlib only; no new dependency; no OpenAI.

---

## RS-REQ-050 — Scheduled cycles leave the live checkout clean

**Statement:** a full pass of the scheduled cycle scripts (daily, weekly incl. REM sleep, monthly, `queue-drainer archive`) in a fixture repo with `SDLC_STATE_DIR` set shall leave `git status --porcelain` empty.

**Acceptance:** covers `rem-sleep`, `version-snapshot` (which may write `agents/versions/` only when invoked with `--publish`, never from a timer), `queue-drainer archive`, `rag-indexer`; any script found to write a tracked file fails this test and must be moved.

**Scenario:** GIVEN a fixture repo WHEN every cycle script runs THEN no tracked file changes and no untracked non-ignored path appears.

**Test:** `tests/runtime-state-isolation.test.mjs` | **Complexity:** M | **Value:** CRITICAL | **Dependencies:** RS-REQ-011, RS-REQ-020

---

## RS-REQ-051 — The trespass guard stays strict

**Statement:** `drain-trespass-guard.sh` shall keep restoring tracked files modified during a drain (saving the patch first) and shall not gain an allowlist; its header shall record that timer writers were removed rather than tolerated.

**Acceptance:** the existing guard tests pass unchanged; a new test shows a tracked file modified mid-drain is still restored and reported (rc 97 path), and a state-dir memory write mid-drain is not reported.

**Scenario:** GIVEN a REM-sleep memory write lands in the state dir during a drain WHEN the guard checks THEN there is no trespass report.
**Scenario:** GIVEN a worker edits `agents/worker.mjs` in the live checkout during a drain WHEN the guard checks THEN the file is restored, the patch saved and rc is 97.

**Test:** `tests/drain-trespass-guard.test.mjs` | **Complexity:** S | **Value:** HIGH | **Dependencies:** RS-REQ-050 | **Lane:** interactive

---

## RS-REQ-052 — The reviewer recalls real memory

**Statement:** `pr-auto-review.mjs` shall resolve reviewer memory through the state dir (environment inherited into the clone call), so a review in a clone sees the host's memory.

**Acceptance:** with `SDLC_PROJECT_DIR=<clone>` and a state dir containing a reviewer lesson, the recall block contains it; the existing "recall failure never fails a review" behaviour is unchanged.

**Scenario:** GIVEN a lesson in the state dir and a stale seed in the clone WHEN the review prompt is built THEN it includes the lesson.

**Test:** `tests/pr-auto-review.test.mjs` | **Complexity:** S | **Value:** MEDIUM | **Dependencies:** RS-REQ-013 | **Lane:** interactive

---

## RS-REQ-053 — Memory-publish PRs do not trip the merge gates

**Statement:** `chore(memory):` PRs touching only `agents/*/memory/**` shall be reviewed by `pr-auto-review` as ordinary PRs and shall never be auto-merged by the publisher itself.

**Acceptance:** a test fixture PR touching only memory seeds is not classified as guardrail-surface; the publisher has no merge call.

**Scenario:** GIVEN a PR touching only `agents/sdlc-developer/memory/long-term.json` WHEN `hardGate` evaluates it THEN it is not blocked as guardrail surface.

**Test:** `tests/pr-auto-review.test.mjs`, `tests/memory-publish.test.mjs` | **Complexity:** S | **Value:** LOW | **Dependencies:** RS-REQ-016 | **Lane:** interactive

---

## Invariants

- The guard and the reviewer see the same state dir as every other process on the host.

## Out of Scope

- Changing the drain mutex, PR caps or model ladder.
