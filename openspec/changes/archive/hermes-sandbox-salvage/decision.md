# Decision — hermes-sandbox-salvage: CLOSED, NOT PURSUED

**Date:** 2026-07-26 · **Decided during:** hermes-production-activation effort (Bryce + Claude)

## Decision

Do **not** execute the salvage. Archive this change as closed. The
`hermes-sandbox-review` branch and the extracted git bundle are **retained** as
the recovery surface in case any specific file is wanted later.

## Rationale

1. **The deploy need is met differently.** The most valuable claimed salvage —
   deployment infrastructure (`terraform/`, `k8s/`, `charts/`, `Dockerfile`,
   `scripts/deploy.sh`) — targets self-hosted container/cloud deployment. The
   framework's actual deploy path (openspec: `autonomous-deploy-pipeline`) is
   Vercel + Supabase via CLI with a Telegram approval gate; none of the k8s/
   terraform scaffolding is used by it.
2. **Provenance is poor.** The work was produced by budget-exhausted free-tier
   models (see `hermes-model-ladder-hardening`) against a base 75 commits
   behind main — the same session that hallucinated the "trapped in Docker"
   report. Every lifted file would need full review + tests; the ~5 hand-merge
   files risk reintroducing stale regressions. Estimated cost (M, ~days of
   careful review) exceeds the value of unrequested infra scaffolding.
3. **The two real lessons already shipped** as companion changes:
   `hermes-model-ladder-hardening` (applied + archived) and
   `hermes-github-write-access` (helper shipped; T7/T8 deferred on Bryce's
   fine-grained PAT) — autonomous work now lands as PRs, so the "work rots in a
   sandbox" failure class is closed at the root.

## If something is wanted later

`git log main..hermes-sandbox-review` — lift individual files with
`git checkout hermes-sandbox-review -- <path>` through a normal OpenSpec change.
Never merge the branch wholesale: relative to main it "deletes" 104 shipped
files (stale-base artifact, documented in proposal.md §Problem).
