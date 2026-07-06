# Proposal: auto-review-merge

**Date**: 2026-07-05
**Author**: CTO (claude-fable-5), operating under Bryce's delegated review-and-merge authority
**Status**: proposed

---

## Problem

The autonomous drain opens `agent/drain/<task-id>` PRs, but nothing merges them. Bryce has explicitly delegated review: he will **not** review drain PRs himself. Without an automated reviewer the loop stalls at `MAX_OPEN_DRAIN_PRS` (3) and the backlog stops draining — the "autonomous" system still has a human in the hot path.

Reviewing PR #7 (H-001) by hand also surfaced why merging cannot be naive:

- The PR was *correct* but would have turned CI red — the full suite wasn't hermetic on a clean checkout (missing gitignored `model-intel.json`, missing python venv, a drain test that could launch a **real LLM worker against the host repo** from a CI-style worktree).
- Timer-run drains currently die with rc=127: systemd units render `PATH` without `~/.local/bin` (where `hermes` lives) or the `gh` directory, so the scheduled half of the loop silently fails.

## Proposed Solution

An automated review-merge pipeline, `agents/pr-auto-review.mjs` (Node stdlib only), scheduled between drain ticks:

1. **HARD GATE** — check the PR branch out into a temp `git worktree` and run `npm test` + `node agents/four-layer-validate.mjs` there. No pass, no merge. Ever.
2. **Scope/safety scan** — hard-reject diffs touching `.env`/secrets/keys, `.github` deploy workflows, or paths escaping the repo. **Flag** (leave for a human/CTO session, never auto-merge) diffs touching the drain script/prompt, this pipeline, CI workflows, or `budget.json` — the system must not be able to silently weaken its own guardrails.
3. **LLM review** — score the diff against the task description + a safety checklist via the framework's OpenRouter adapter (`deepseek/deepseek-chat-v3.1`; affordable, no OpenAI), returning strict-JSON approve/reject + reasons.
4. **Act** — all three pass → `gh pr merge --squash --delete-branch`, then mark the queue task completed on `main` (otherwise the drain would re-pick it). Any soft fail → post the review as a PR comment (once per head SHA — no spam) and leave the PR open. Hard-unsafe diffs are rejected with a comment. ≤ 3 merges per run. Every decision logged to `pm/pr-auto-review.log`.

Plus the enabling fix: scheduler units get a `PATH` that includes `~/.local/bin` and the installer-resolved `gh` directory, so `hermes`, `gh`, and `node` all resolve from timers.

Scheduled at `7,27,47 * * * *` — offset from the drain's `*/15` so review runs between drain ticks and never races it.

## Value Analysis

- **Closes the loop that is the whole point:** queue → drain → PR → *automated review* → merge → task completed → next task. This is the missing half of unattended operation; without it the drain wedges at 3 open PRs.
- **Safety is layered, not vibes:** a deterministic test gate (the same clean-worktree standard that caught 4 real bugs in PR #7), a deterministic scope scan with a self-protection flag list, and only then a cheap LLM judgment. The LLM can *withhold* a merge but can never override the hard gate.
- **Cheap:** one `deepseek/deepseek-chat-v3.1` call per PR review (~$0.001–0.01); hard gate is local CPU. Idle runs (no open drain PRs) make no LLM call.
- **Self-healing:** a reconcile pass marks tasks complete for already-merged PRs, so a crash between merge and queue-update cannot cause double work.
- **Reversible:** stop/uninstall the timer; PRs simply wait for a human again. No change to the drain or the main assistant.
- **Cost:** M — one script + tests + a template entry + a scheduler PATH fix. Risk is auto-merging bad code; bounded by the hard gate, the flag list (guardrail files never auto-merge), the merge rate limit, and full audit logging.
