# Proposal: hermes-sandbox-salvage

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

An autonomous Hermes drain session (running on free-tier OpenRouter models —
`qwen/qwen3-coder:free` → `cohere/north-mini-code:free`) built a large body of
framework work inside its Docker sandbox at
`~/.hermes/sandboxes/docker/default/home/agentic-sdlc-enhanced`, then reported
to Bryce that the work was "trapped in Docker and impossible to extract." That
report was a hallucination: the sandbox `/root` is a read-write bind mount, so
every file already exists on the host.

The real problem is worse than "stuck files" and is the reason a careful
salvage — not a merge — is required:

1. **The sandbox is a stale fork, not ahead of `main`.** It diverged at
   `558c6db` and is **only 2 commits ahead** but **75 commits behind** current
   `origin/main` (all of PR #17–#38: curriculum conformance, hardening, the
   autonomous self-healing loop, replay-regression, scheduler-daemon,
   openrouter-provider, etc.).
2. **A naive merge/push would destroy real work.** Diffed against `main`, the
   sandbox branch shows **~104 files "deleted"** — but those are not intentional
   deletions; they are files the stale base never had (`pr-auto-review.mjs`,
   `scheduler-install.mjs`, the OpenRouter adapter, the entire
   `openspec/changes/*` for shipped work, the replay corpus, ~30 test files).
   Merging the branch would revert 75 commits of shipped work.
3. **The genuinely new work is real and worth keeping.** ~118 pure-addition
   files (~9,700 lines) that do not exist on `main`: deployment infrastructure
   (`terraform/`, `k8s/`, `charts/`, `Dockerfile`, `docker-compose.yml`,
   `scripts/deploy.sh`), seven new execution-agent roles with unit/contract/
   property tests, release-automation + semantic-version scripts, and
   observability enablement scripts (`enable-{health,sentry,winston}-*`).
4. **Root cause is model capability.** The work — and the false Docker report —
   came from free-tier models doing judgment-heavy orchestration while
   `budget-exhausted` (confirmed in `cost-log.json`). This is tracked as a
   companion config change (`hermes-model-ladder-hardening`); this proposal
   covers only the salvage of the output.

## Discovery

- The sandbox's `/root` → `~/.hermes/sandboxes/docker/default/home` bind mount
  (`rw=true`) means container files are host files (same inode verified:
  `agent-portal.sh` = inode 40902843 on both sides).
- A `git bundle --all` (node_modules excluded) was extracted from the sandbox,
  chowned to `bryce`, and fetched into the real repo as branch
  `hermes-sandbox-review` — `main` untouched, nothing merged. This is the safe
  review surface for the salvage.
- Diff categorization against `main` (excluding `node_modules`):
  - **Added (safe to lift):** 118 files / ~9,718 insertions.
  - **Modified with genuinely new content (hand-pick):** ~5 files —
    `execution-agents/{rag-specialist,memory-architect,constitutional-ai-engineer,twelve-factor-agent}.md`,
    `docs/claude-quickstart.md`.
  - **Modified as stale regressions (discard):** `setup.mjs` (−1036),
    `alignment-monitor.mjs` (−382), `pattern-hunt.mjs` (−339), and ~70 others —
    the fork reverting shipped work.
  - **Deleted (discard entirely):** 104 files — all shipped `main` work the
    stale base lacked.
- The accidentally-git-tracked `node_modules/playwright` (~350k lines, ~99% of
  the raw diff) must never enter `main`; `.gitignore` already covers it.

## Proposed Solution

Salvage **only the pure-addition and hand-picked-new work** onto a fresh branch
off current `main`, through the normal OpenSpec + test + review pipeline:

1. **Lift the 118 pure-addition files** via `git checkout hermes-sandbox-review
   -- <path>` onto a branch off `main`, in reviewable groups:
   - **Infrastructure:** `terraform/`, `k8s/`, `charts/`, `Dockerfile`,
     `docker-compose.yml`, `scripts/deploy.sh`, `setup-*-infrastructure.sh`,
     `tf-*-automation.sh`.
   - **New execution-agent roles + tests:** `architecture-senior`,
     `documentarian`, `production-engineer`, `release-manager`,
     `security-analyst`, `testing-engineer`, `maturity-assess`, plus their
     `tests/*-{basic,contract,property}.test.mjs`.
   - **Automation/observability scripts:** `*-release-automation.sh`,
     `*-semantic-version.sh`, `enable-{health,sentry,winston}-*.mjs`,
     `implement-{iac,k8s}-*.mjs`, `expand-test-coverage.mjs`.
   - **Portal + docs:** `sdslc-portal.sh`, `quick-portal.sh`,
     `docs/curriculum-conformance-follow-ups.md`.
2. **Hand-merge the ~5 additive template/doc edits** as three-way merges against
   current `main` (accept only the new content, never the stale reverts around
   it).
3. **Reconcile with existing capabilities.** Several lifted pieces overlap
   shipped work (e.g. a sandbox `Dockerfile`/`deploy.sh` vs. the
   `framework-release-pipeline` change). For each, keep the `main` version as
   canonical and fold in only net-new capability; document any that are
   superseded and dropped.
4. **Validate before merge:** every lifted script gets (or already has) a test;
   `node tests/adapter-and-model-manager.test.mjs` and the new agent tests pass;
   `openspec validate --strict` passes; `node_modules` confirmed untracked.
5. **Discard the rest** — the 104 "deletions", all stale-regression
   modifications, and the tracked `node_modules`. Delete the
   `hermes-sandbox-review` branch and the bundle once salvage is merged.

## Value Analysis

- **Recovers ~9,700 lines of legitimately useful infra + agent-role work** that
  would otherwise rot in a throwaway sandbox, without a single line of shipped
  work being reverted.
- **Prevents a catastrophic regression** — documents exactly why this branch
  must never be merged wholesale (104 real files would be deleted).
- **Right-sizes the salvage:** of a claimed "359k-line enhanced framework," the
  true, non-junk, non-regressive salvage is ~118 files — the analysis itself is
  a deliverable.
- **Privacy/compliance clean:** no OpenAI, no new external deps introduced by the
  lifted files; `node_modules` stays untracked.
- **Cost:** M. Mechanical `git checkout` lifts + ~5 hand-merges + reconciliation
  against 3–4 existing changes + test/validate. Risk low: work happens on a new
  branch; `main` is never touched until PR review.

## Companion Changes

- **`hermes-model-ladder-hardening`** (config) — demote/remove the `:free`
  models that produced the stale fork and the false Docker report; promote
  `deepseek/deepseek-chat-v3.1` (reasoning) and `qwen/qwen3-coder` (code).
- **`hermes-github-write-access`** (capability) — give Hermes scoped,
  per-project GitHub push so autonomous work lands on a branch/PR each cycle
  instead of rotting in a sandbox. Root-cause fix for the "stuck in Docker"
  class of failure.
