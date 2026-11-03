# Specs — claude-review-lane

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/pr-auto-review.mjs`, `skills/sdlc-review-flagged/SKILL.md`, `pm/claude-review-queue.json` (runtime, gitignored),
`agents/cron-schedule.json`, `docs/RUNBOOK.md`. Prefix `REV`.

**Model of work.** Cheap OpenRouter agents (drain, pr-auto-review) do volume. Claude, through Bryce's subscription and
**only in an interactive Claude Code session** (no API key exists), is the high-quality reviewer of what the cheap tier
must not merge alone: PRs touching the guardrail surface (`FLAG_PATHS`). Today those PRs are flagged and then
re-reviewed as `skip` every 20 minutes; #63, #64 and #66 sat open 8 weeks with no notice anyone would act on.

---

## CV-REQ-100 — Flagged PRs enter a Claude review queue and notify once

**Statement:** When `pr-auto-review.mjs` flags a PR it shall upsert an entry in `pm/claude-review-queue.json` and send one Telegram notice for that (PR, head SHA); later passes shall send nothing.

**Acceptance:**
- Entry shape (validated by `agents/schemas/claude-review-queue.schema.json`): `{pr, branch, headSha, reasons[], flaggedAt, notifiedAt, status}` with `status` in `open|resolved|superseded`
- Notice text names PR number, title and the flag reasons and says "run /sdlc-review-flagged"
- A new head SHA on a queued PR marks the old entry `superseded` and creates a new open entry with one new notice
- Notification failure leaves `notifiedAt` unset so the next pass retries, but never throws

**Scenarios:**
- WHEN PR 70 is flagged for touching `agents/hermes-drain.sh` THEN one entry and one Telegram message exist
- WHEN the next 10 passes run with the same SHA THEN no further messages are sent

**Complexity:** M | **Value:** HIGH | **Lane:** interactive

---

## CV-REQ-101 — Already-flagged PRs are not re-reviewed

**Statement:** `pr-auto-review.mjs` shall skip any PR whose (number, head SHA) is an `open` queue entry, without calling the LLM or running the gate, and shall write the `skip-awaiting-claude` log line only the first time.

**Acceptance:** zero LLM calls and zero worktrees for such PRs; `pm/pr-auto-review.log` gets no repeating `already reviewed` lines for them; a PR merged or closed outside the loop has its entry marked `resolved` on the next pass.

**Scenarios:** WHEN a queued PR is merged by hand THEN the next pass marks it `resolved` and stops tracking it.

**Complexity:** S | **Value:** HIGH | **Lane:** interactive | **Dependencies:** CV-REQ-100

---

## CV-REQ-102 — A repo skill lets an interactive Claude session work the queue

**Statement:** `skills/sdlc-review-flagged/SKILL.md` shall guide a Claude Code session through: `node agents/pr-auto-review.mjs list-flagged`; for each open entry check out the PR in a scratch worktree, merge `origin/main` into it, run `npm test`, read the diff with the flag reasons in mind, decide merge / request changes / close, leave a `gh pr comment` review, then `node agents/pr-auto-review.mjs resolve-flagged <pr> <merged|closed|changes-requested>`.

**Acceptance:**
- `pr-auto-review.mjs` provides `list-flagged` and `resolve-flagged` subcommands
- The skill states it never calls an API, never merges with failing tests, never merges a PR touching `FLAG_PATHS` without reading every changed line of those files, and removes the scratch worktree
- `tests/sdlc-review-flagged-skill.test.mjs` asserts frontmatter, the queue path, both subcommands, the head-merged-with-main step and the no-API statement

**Scenarios:** WHEN the operator runs the skill with two open entries THEN each ends `resolved` with a PR comment, or stays `open` if skipped.

**Complexity:** M | **Value:** HIGH | **Dependencies:** CV-REQ-100

---

## CV-REQ-103 — `changes-requested` becomes a fix task, not a wedge

**Statement:** `resolve-flagged <pr> changes-requested` shall create a `FIX-<task>` queue task from the Claude comment via the existing `buildFixTask`/`upsertFixTaskInClone` path, subject to the three-attempt cap of CV-REQ-035, and mark the entry `resolved`.

**Acceptance:** idempotent per (PR, SHA); the FIX task's lane is hermes only if its Files avoid interactive-lane machinery, otherwise it is created `blocked` with a human task.

**Scenarios:** WHEN Claude requests changes on PR 70 THEN a FIX task exists and PR 70 is no longer `open` in the queue.

**Complexity:** M | **Value:** MEDIUM | **Lane:** interactive | **Dependencies:** CV-REQ-102, CV-REQ-035

---

## CV-REQ-104 — OPTIONAL: headless Claude review timer (default OFF, Bryce-gated)

**Statement:** `pr-auto-review.mjs claude-review-headless --max <N>` shall, only when `agents/project.json` has `claudeReview.headless.enabled: true`, run `claude -p` with the subscription login against open queue entries, at most `maxPerDay` (default 2) per day, recording usage in `pm/claude-review-usage.json`. A schedule entry `claude-review-headless` shall exist with `enabled: false`.

**Acceptance:** disabled config makes the command exit 0 doing nothing; the daily counter is enforced across restarts; the command never runs when `claude` is not on PATH (exit 0, logged); it only writes review comments and queue state, never merges.

**Scenarios:**
- WHEN the flag is false THEN the command is a logged no-op
- WHEN `maxPerDay` is 2 and two reviews ran today THEN a third pass does nothing

**Complexity:** M | **Value:** LOW | **Lane:** interactive | **Dependencies:** CV-REQ-102
**Notes:** decision recorded in design.md (token cost vs. latency); not part of the default path.
