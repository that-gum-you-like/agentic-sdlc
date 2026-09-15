# Wave 2 Preflight — Stale State Audit

**Task:** T-303 (environment-tiering REQ-006)
**Date:** 2026-09-12
**Agent:** sdlc-developer (hermes-drain)

## Summary

Audit of every drained repo's queue depth, open PRs, and deployment
state vs origin, performed **before** enabling wave 2 timers.

---

## 1. agentic-sdlc (framework repo)

| Metric | Value |
|---|---|
| **Base branch** | `main` |
| **Queue depth** | 12 pending (CC-001, CC-002, CC-003, OS-business-os-13, OS-business-os-17, OS-business-os-19, OS-business-os-21, OS-business-os-22, OS-business-os-23, OS-business-os-4, OS-business-os-7, OS-business-os-8) + 2 blocked (OS-business-os-1, OS-business-os-2) |
| **Open PRs** | 3 (PR #66 `agent/drain/CC-003`, PR #64 `agent/drain/OS-business-os-21`, PR #63 `agent/drain/OS-business-os-19`) |
| **Last deployed SHA** | N/A (no `pm/.last-deployed` — framework repo is not deployed) |
| **Origin/main HEAD** | `6bcdced` |

## 2. hermes-pilot

| Metric | Value |
|---|---|
| **Base branch** | `main` |
| **Queue depth** | 0 pending (1 completed: PILOT-001) |
| **Open PRs** | 0 |
| **Last deployed SHA** | `b212e16` |
| **Origin/main HEAD** | `7fd814c` |
| **Drift** | ⚠️ **Drifted** — deployed SHA `b212e16` is behind origin/main `7fd814c` |

## 3. personal-website

| Metric | Value |
|---|---|
| **Base branch** | `main` |
| **Queue depth** | 0 pending (empty queue) |
| **Open PRs** | 0 |
| **Last deployed SHA** | `e76f11b` |
| **Origin/main HEAD** | `e76f11b` |
| **Drift** | ✅ Up to date |

## 4. nels-workshop

| Metric | Value |
|---|---|
| **Base branch** | `main` |
| **Queue depth** | 0 pending (empty queue) |
| **Open PRs** | 1 (PR #2 `agent/drain/V1-002` — Supabase client wiring) |
| **Last deployed SHA** | N/A (no `pm/.last-deployed` — never deployed) |
| **Origin/main HEAD** | `e8cc2a6` |

## 5. willtopaint

| Metric | Value |
|---|---|
| **Base branch** | `staging` (per project.json `deploy.baseBranch`) |
| **Queue depth** | 3 pending (WTP-001, WTP-002, WTP-003) |
| **Open PRs** | 1 (PR #1 `agent/drain/WTP-001` — Apply schema to staging) |
| **Last deployed SHA** | N/A (no `pm/.last-deployed` — never deployed) |
| **Origin/staging HEAD** | `48acd00` |

---

## Findings

1. **agentic-sdlc** has 12 pending + 2 blocked tasks and 3 open PRs awaiting
   review/merge. Wave 2 timers include `pr-auto-review` which will process
   these PRs — this is expected, not stale state.

2. **hermes-pilot** shows a deployment drift: `pm/.last-deployed` (`b212e16`)
   is behind `origin/main` (`7fd814c`). This is stale state from the 32-day
   dormancy period. The guard (REQ-005) is live, so enabling wave 2 timers
   will cause `deploy-reconcile` to attempt a deployment here — appropriate
   given the drift.

3. **personal-website** is clean — deployed SHA matches origin/main, no
   pending tasks, no open PRs.

4. **nels-workshop** has never been deployed (no `.last-deployed`). One open
   PR (V1-002) awaiting review. No stale state concerns.

5. **willtopaint** has never been deployed (no `.last-deployed`). Three
   pending tasks and one open PR. The base branch is `staging` (not `main`),
   which is correctly configured.

---

## Verdict

No blocking stale-state issues found. The one drift (hermes-pilot) is
expected post-dormancy and will be resolved by `deploy-reconcile` once wave 2
timers are enabled. **Proceed with T-304 (live denial demonstration) followed
by T-305 (enable wave 2).**
