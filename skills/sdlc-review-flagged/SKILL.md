---
name: sdlc-review-flagged
author: Bryce + Claude
version: 1.0.0
license: MIT
platforms: [linux]
description: "Review flagged PRs in the Claude review queue — PRs touching the guardrail surface (FLAG_PATHS) that the cheap drain tier must not auto-merge. Guides an interactive Claude Code session through listing open entries, checking them out in a scratch worktree, merging origin/main, reading the flagged diffs, deciding merge/changes-requested/close, leaving a review comment, and resolving the queue entry."
metadata:
  hermes:
    tags: [sdlc, review, flagged, pr, claude-review-queue, telegram]
requirements:
  - node >= 18
  - gh (GitHub CLI, authenticated)
  - git >= 2.25 (for worktree add --guess-remote)
---

Audience: **you, the interactive Claude Code session working the flagged-PR queue.**  
When the drain flags a PR touching `FLAG_PATHS` (guardrail files the cheap tier must not merge), it enters `pm/claude-review-queue.json`. This skill walks you through reviewing each entry in a safe scratch worktree, running tests, reading the diffs, and resolving the entry with a PR comment. **You never call an LLM API — your job is reading code and running tests.** You never merge with failing tests. You never merge a flagged file without reading every changed line of it.

## 1. List open entries

Start by listing the queue of flagged PRs awaiting your review:

```bash
node agents/pr-auto-review.mjs list-flagged
```

This prints tab-separated rows: `#PR  branch  headSha  flaggedAt  reasons`.  
If no entries are listed, the queue is empty — nothing to do; stop here.

For each open entry, work through steps 2–9 below.

## 2. Create a scratch worktree

Clone the PR into an isolated scratch worktree so you never modify your main working directory:

```bash
SCRATCH=$(mktemp -d /tmp/review-XXXXX)
git worktree add --guess-remote "$SCRATCH" "$BRANCH"
```

Replace `$BRANCH` with the branch column from `list-flagged`. Use the scratch worktree for all subsequent steps — your session's main checkout stays clean.

## 3. Merge `origin/main` into the worktree

The PR was branched from an older main. Bring it current so tests run against today's code:

```bash
cd "$SCRATCH"
git merge origin/main
```

Resolve any merge conflicts if they arise. A clean merge means the PR integrates with the current state of the repo.

## 4. Run the full test suite

The PR must pass tests before you consider merging. Run from inside the worktree:

```bash
npm test
```

**Hard rule: Never merge with failing tests.** If tests fail:
- Decide whether the failures are pre-existing (reproduce on `main` alone) or introduced by the PR.
- If introduced, request changes with a `gh pr comment` describing the failures (step 8), then resolve as `changes-requested` (step 9).
- If pre-existing, note it in your review comment and proceed to step 5 — but do **not** merge. Resolve as `changes-requested` with a comment saying the PR needs a rebase or main needs fixing first.

## 5. Read the FLAG_PATHS diffs fully

The PR was flagged because it touches one or more guardrail paths defined in `FLAG_PATHS` (`agents/pr-auto-review.mjs` line 67). Read **every changed line** of those files — not just the diff summary. The cheap drain tier is forbidden to skim here; your eyes are the quality gate.

```bash
gh pr view "$PR" --json files --jq '.files[].path'
# Then read each flagged file's diff
gh pr diff "$PR" -- <path>
```

Cross-reference the flag reasons (printed by `list-flagged`) with what the diff actually does. Ask yourself:
- Does this change weaken a security or safety invariant?
- Does this introduce a path the drain could exploit to bypass the guard?
- Is the change structurally sound (no silent error swallowing, no missing schema validation)?

If the diff is large, focus on the flagged files first; skim the rest for consistency.

## 6. Decide the outcome

| Condition | Action |
|---|---|
| Diffs look correct; tests pass; no concerns | **merge** |
| Tests fail or changes are needed | **changes-requested** — include the specific feedback in your comment |
| PR is stale, superseded, or no longer needed | **close** — note why in your comment |

## 7. Leave a PR review comment

Post your decision as a PR comment so the author and future reviewers see the reasoning:

```bash
gh pr comment "$PR" --body "**Review outcome:** <merge|changes-requested|close>

<your rationale — what you checked, what you found, why you chose the outcome>"
```

For `changes-requested`, be specific about what needs to change and reference the failing tests or problematic code.

## 8. Resolve the queue entry

Mark the PR resolved in the queue so the drain stops skipping it and the entry is archived:

```bash
node agents/pr-auto-review.mjs resolve-flagged <PR> <merged|closed|changes-requested>
```

- `resolve-flagged <PR> merged` — marks the entry resolved; your next step is the actual merge in the worktree.
- `resolve-flagged <PR> closed` — PR was closed without merging.
- `resolve-flagged <PR> changes-requested` — creates a `FIX-<PR>` task from your comment in the queue for re-drain.

**Allowed outcomes only:** `merged`, `closed`, `changes-requested`. An unknown outcome exits 1 and does nothing.

## 9. Merge the PR (only if outcome was `merge`)

If you chose `merge` in step 6, merge from inside the worktree:

```bash
gh pr merge "$PR" --merge --subject "chore: merge PR #$PR after flagged review"
```

Do **not** squash — the branch's individual commits preserve the task history. If the merge button is disabled (branch protection, failing CI), respect the block and resolve as `changes-requested` instead.

## 10. Remove the scratch worktree

Clean up the scratch worktree — never leave detritus behind:

```bash
cd /  # leave the worktree directory first
git worktree remove "$SCRATCH"
rm -rf "$SCRATCH"
```

## 11. Repeat for the next open entry

Go back to step 1 (`list-flagged`) to ensure no new entries appeared while you were reviewing. The queue may have been updated by another pass.

---

## Guardrails (hard rules)

- **NO API calls.** You are reading code and running tests, not calling an LLM for review. Never invoke an LLM API — the entire point of this lane is that a human-quality (interactive Claude Code) reviewer, not a cheap model, inspects flagged diffs.
- **Never merge with failing tests.** If `npm test` fails in the merged worktree, the outcome is `changes-requested`, not `merge`.
- **Read every changed line of FLAG_PATHS files.** Skimming is not acceptable. The cheap tier is blocked from these files specifically because they need a human-quality read.
- **Never leave a worktree behind.** Always `git worktree remove` and `rm -rf` the scratch directory.
- **Never reuse a scratch directory.** Each PR gets a fresh `mktemp -d` worktree.
- **Never resolve a PR without leaving a comment.** The PR author and the automated system need the audit trail.
- **Never force-merge past branch protection.** If `gh pr merge` fails because of CI or rules, respect the block.

---

## Reference card

| Fact | Value |
|---|---|
| Queue file | `pm/claude-review-queue.json` (runtime, gitignored) |
| Queue CLI (list) | `node agents/pr-auto-review.mjs list-flagged` |
| Queue CLI (resolve) | `node agents/pr-auto-review.mjs resolve-flagged <pr> <merged\|closed\|changes-requested>` |
| Guardrail paths | `FLAG_PATHS` in `agents/pr-auto-review.mjs` (line 67) |
| Schema | `agents/schemas/claude-review-queue.schema.json` |
| Outcomes | `merged` · `closed` · `changes-requested` |
| Worktree | Scratch `mktemp -d` directory, one per PR |
| Test gate | `npm test` must pass in the merged worktree |
| PR comment | `gh pr comment <PR> --body "<review>"` |
| Merge | `gh pr merge <PR> --merge` (in the worktree) |