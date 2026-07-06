# Proposal: self-healing-review-loop

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: proposed

---

## Problem

The autonomous loop is live (queue → drain → PR → auto-review → merge), but a
**rejected** drain PR dead-ends on a human: `pr-auto-review` posts the rejection
reasons as a comment and leaves the PR open, and the drain never revisits a
task whose PR is open. Observed live 2026-07-06: PR #35 was LLM-rejected with
actionable feedback and sat until the owner session manually fixed and pushed.
The curriculum's Level 6 ("Self-Improving": *system gets better without human
intervention*) requires the loop to close this gap itself.

## Discovery

- The reviewer already produces exactly what a fix needs: per-reason feedback,
  the PR number, branch, and head SHA (`reviewPr` record + review comment).
- The reviewer already owns a safe write path to main: the dedicated review
  clone (`completeTaskInClone` pattern).
- The drain worker already proves it can act on review feedback: the manual
  fix of PR #35 was re-reviewed at the new SHA and merged unattended.
- Blockers to remove: (a) nothing turns a rejection into queue work; (b) the
  drain prompt forbids working tasks that have an open PR; (c) the PR cap can
  starve fix work when rejected PRs pile up.

## Proposed Solution

Extend the existing components — no new subsystem:

1. **`pr-auto-review.mjs`**: on `llm-rejected` or `gate-failed`, upsert a
   **fix task** `FIX-<pr>.json` into the queue *via the review clone* (same
   isolation as task completion): CRITICAL priority, feedback verbatim in the
   description, `fixFor: {pr, branch, headSha, sourceTask}`. Idempotent per
   head SHA; a re-rejection at a new SHA refreshes the same task. When a PR
   merges, `reconcileMerged` also completes its `FIX-<pr>` task.
2. **`agents/drain-prompt.md`**: a "Fix tasks" section — a `FIX-*` task means
   check out the EXISTING `agent/drain/*` branch, address each rejection
   reason, test, push to the same branch (never a new PR). The
   skip-tasks-with-open-PRs rule explicitly exempts `FIX-*` tasks.
3. **`agents/hermes-drain.sh`**: the unreviewed-PR cap no longer starves
   repairs — when pending `FIX-*` tasks exist, the drain proceeds (fix work
   *reduces* the pile the cap protects against).

## Value Analysis

- **Closes the last human-in-the-loop step for non-guardrail work**: rejected
  PRs now feed back into the queue automatically — Find→Reject→Fix→Re-review
  →Merge with no human touch (guardrail-surface PRs stay human-only by design).
- **Cheap and bounded**: one queue file per rejected PR, CRITICAL priority so
  repairs preempt new work; re-review already gates the result at the new SHA.
- **No new attack surface**: fix tasks are written only by the reviewer via
  the review clone; the drain still can't merge anything; the reviewer still
  hard-gates everything.
