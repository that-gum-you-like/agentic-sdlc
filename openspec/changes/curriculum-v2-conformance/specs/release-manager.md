# Specs — release-manager

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/pr-auto-review.mjs` (merge loop, `hardGate`, ordering at the `sort a.number-b.number` site), `agents/queue-drainer.mjs` (`showStatus`)
and `agents/seed-queue-from-openspec.mjs`. Prefix `REL`. The release-manager *rules* already exist
(`agents/templates/execution-agents/release-manager.md`); this capability implements them in the merger that actually runs.
All pr-auto-review/queue-drainer edits are Lane: interactive.

---

## CV-REQ-050 — Gate tests run on the head merged with current base

**Gaps:** D4-03 | **Curriculum:** w4-release-management.md "Responsibilities"

**Statement:** `hardGate` shall run `git merge --no-commit --no-ff origin/<base>` in the temp worktree before the test command, so a stale branch that passes alone but breaks `main` fails the gate.

**Acceptance:** a merge conflict yields action `gate-failed` with reason `merge-conflict-with-base`; the worktree is removed in every outcome; a branch already up to date behaves as before.

**Scenarios:** WHEN the PR head is behind base and the merge applies cleanly THEN tests run on the merged tree. WHEN the merge conflicts THEN no tests run and the PR is not merged.

**Complexity:** S | **Value:** HIGH | **Dependencies:** none

---

## CV-REQ-051 — Merge order is infra, backend, frontend; small before large

**Gaps:** D4-01 | **Curriculum:** w4-release-management.md "Release Manager"

**Statement:** `pr-auto-review.mjs` shall process open drain PRs ordered by domain rank (`infra` < `backend` < `frontend` < `docs-tests`), then by `additions+deletions` ascending, then PR number.

**Acceptance:**
- Pure exported `classifyDomain(files)` (highest-rank domain among changed files wins; ties broken toward the lower rank) and `orderPrs(prs)`
- PR file lists and sizes come from `gh pr view --json files,additions,deletions`; a fetch failure falls back to number order and logs it

**Scenarios:** WHEN PR 9 (frontend, 20 lines) and PR 12 (infra, 500 lines) are open THEN PR 12 is processed first.

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-052 — Overlapping open PRs are deferred, not rejected

**Gaps:** D4-02 | **Curriculum:** w4-release-management.md "Conflict Detection"

**Statement:** When two open drain PRs change a common file, the later one in merge order shall be deferred with a single idempotent comment, action `deferred-overlap`, and shall not count as a rejection or open a FIX task.

**Acceptance:** pure `findOverlaps(prs)` returns `[{later, earlier, files}]`; comment carries a marker so re-runs do not repeat it; once the earlier PR merges or closes the later PR is reviewed normally.

**Scenarios:** WHEN PR 5 and PR 6 both edit `agents/health-check.mjs` and PR 5 is earlier THEN PR 6 is deferred AND after PR 5 merges PR 6 is gated against the new base.

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** CV-REQ-051

---

## CV-REQ-053 — Merges append to CHANGELOG.md

**Gaps:** D4-04 | **Curriculum:** w4-release-management.md "Responsibilities" (maintain changelog)

**Statement:** After a successful squash-merge, `pr-auto-review.mjs` shall append `- <date> #<pr> <squash subject> (<domain>)` to `CHANGELOG.md` in the review clone, committed and pushed through the existing `completeTaskInClone` path (no new push path).

**Acceptance:** pure `formatChangelogEntry` and `appendChangelog(path, entry)`; idempotent per PR number; creates the file with a `# Changelog` header when absent; entries grouped under a `## <YYYY-MM-DD>` heading.

**Scenarios:** WHEN PR 70 merges THEN `CHANGELOG.md` has one line for #70, and re-running the reconcile adds none.

**Complexity:** M | **Value:** LOW | **Dependencies:** CV-REQ-051

---

## CV-REQ-054 — `blockedBy` cycles are detected

**Gaps:** D4-05 | **Curriculum:** w4-release-management.md "Common Issues" (circular dependencies)

**Statement:** `seed-queue-from-openspec.mjs` shall export `detectBlockedByCycle(tasks)`; seeding shall skip tasks in a cycle with reason `blockedBy-cycle`; `queue-drainer.mjs status` shall warn on cycles among queued tasks.

**Acceptance:** DFS handles self-reference, 2-cycles and longer; unknown ids are ignored; returns the member ids of each cycle; a DAG returns `[]`.

**Scenarios:** WHEN A is blockedBy B and B blockedBy A THEN `status` prints `CYCLE: A -> B -> A` and neither is seeded.

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** none
