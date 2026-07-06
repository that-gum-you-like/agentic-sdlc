# Design: self-healing-review-loop

**Date**: 2026-07-06

## Fix-task shape (`tasks/queue/FIX-<pr>.json`)

```jsonc
{
  "id": "FIX-35",                    // matches taskIdFromBranch's [A-Za-z]+-\d+
  "phase": 1,
  "title": "Fix rejected drain PR #35 (agent/drain/Q-105)",
  "description": "<instructions + verbatim rejection reasons>",
  "assignee": "sdlc-developer",
  "priority": "CRITICAL",            // repairs preempt new work
  "estimatedTokens": 16000,
  "files": [],
  "blockedBy": [],
  "status": "pending",
  "created": "<iso>",
  "tags": ["auto-fix"],
  "fixFor": {
    "pr": 35,
    "branch": "agent/drain/Q-105",
    "headSha": "<sha at rejection>",
    "sourceTask": "Q-105",
    "rejectionKind": "llm-rejected" | "gate-failed"
  }
}
```

## Reviewer side (`pr-auto-review.mjs`)

- `buildFixTask({ pr, reasons, kind, existing })` — exported pure builder
  (unit-testable). If `existing` is passed, it refreshes: status back to
  `pending`, new headSha, feedback replaced, `refreshedAt` stamped.
- `upsertFixTaskInClone(repoDir, pr, reasons, kind, log)` — writes the task in
  the review clone, commits `chore(queue): file FIX-<pr> …`, pushes (non-ff
  push fails safe; next run retries — same semantics as completion).
- Wired at the two failure exits of `reviewPr`: `gate-failed` and
  `llm-rejected` (NOT `llm-unavailable` — an adapter outage is not actionable
  feedback; NOT `reject-unsafe`/`flagged` — those are human-only by design).
- Idempotency: `alreadyReviewed` (per head SHA) already prevents duplicate
  processing; on a NEW sha rejection the upsert refreshes the existing task.
- `reconcileMerged` additionally completes `FIX-<pr>` for merged PRs.

## Drain side

- `drain-prompt.md`: fix-task procedure — claim, `git fetch origin <branch> &&
  git checkout <branch>`, address EVERY listed reason, `npm test`, commit,
  push to the same branch, mark complete, output `DRAIN: pushed fix for PR #N`.
  Open-PR skip rule exempts `FIX-*`. Never open a second PR for a fix task.
- `hermes-drain.sh`: cap check becomes: at cap AND no pending `FIX-*` task →
  skip; otherwise proceed. (One-liner shell check over `tasks/queue/FIX-*.json`
  status fields.)

## Safety notes

- The reviewer writes fix tasks only for branches matching `agent/drain/*`
  (everything else was filtered upstream by the PR search).
- A fix task never grants merge rights: the re-pushed branch goes through the
  full gate again at its new SHA.
- Loop bound: each rejection cycle requires a fresh head SHA; identical-SHA
  re-reviews are skipped, so a non-converging task plateaus as an open PR +
  pending FIX task — visible in the dashboard, zero further LLM spend until
  the drain works it.
