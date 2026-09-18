# Wave 2 Preflight Audit

**Task:** T-303 — Audit stale state before arming wave 2 timers
**Spec:** environment-tiering/REQ-006
**Date:** 2026-09-18
**Auditor:** hermes-drain (autonomous)

---

## Summary

Preflight audit of stale state across all drained repos before enabling the seven wave 2 timers (`autonomous-drain`, `pilot-drain`, `personal-website-drain`, `pr-auto-review`, `pilot-review`, `personal-website-review`, `deploy-reconcile`).

**Verdict:** One drift item found — hermes-pilot has 3 commits on `origin/main` that were never deployed. All other repos are clean or have no deploy tracking. Proceed with wave 2 after resolving the drift.

---

## 1. Tasks Queue (`tasks/queue/`)

**Repo:** agentic-sdlc (framework)

| Metric | Count |
|--------|-------|
| Pending | 7 |
| In Progress | 0 |
| Completed (+ archived) | 31 (+ 0) |
| Blocked | 2 |
| Stale (status: `done` not `completed`) | 1 (OS-business-os-16) |

**Pending by priority:**
- HIGH: CC-001, CC-002, CC-003
- MEDIUM: OS-business-os-13, OS-business-os-17, OS-business-os-19, OS-business-os-21, OS-business-os-22, OS-business-os-23, OS-business-os-4, OS-business-os-7, OS-business-os-8

**Blocked:** OS-business-os-1 (blocked by T-004), OS-business-os-2 (blocked by T-004)

**Note:** OS-business-os-16 has status `done` instead of the standard `completed`. This is an anomaly that should be reconciled.

Other drained repos do not have task queues in this framework — they are managed by their own Hermes drain instances.

---

## 2. Open PRs Across Drained Repos

| Repo | Open PRs | Details |
|------|----------|---------|
| **agentic-sdlc** | 3 | #66 (CC-003), #64 (T-703), #63 (T-701) — all `agent/drain/` branches |
| **hermes-pilot** | 0 | — |
| **personal-website** | 0 | — |
| **nels-workshop** | 1 | #2 — V1-002: Supabase client wiring (branch: `agent/drain/V1-002`, base: `main`) |
| **willtopaint** | 1 | #1 — WTP-001: Apply schema to staging (branch: `agent/drain/WTP-001`, base: `staging`) |

---

## 3. `pm/.last-deployed` vs `origin` Comparison

| Repo | `.last-deployed` SHA | `origin/<base>` SHA | Match? | Drift |
|------|---------------------|---------------------|--------|-------|
| **agentic-sdlc** | *file missing* | `8908ae1671a` (main) | N/A | No deploy tracking file |
| **hermes-pilot** | `b212e16822a` | `7fd814c29ae` (main) | **NO** | 3 undepoyed commits |
| **personal-website** | `e76f11bbd98` | `e76f11bbd98` (main) | ✅ Match | Clean |
| **nels-workshop** | *file missing* | `3de4d5d310f` (main) | N/A | No deploy tracking file |
| **willtopaint** | *file missing* | `48acd005a68` (staging) | N/A | No deploy tracking file |

### Drift Detail — hermes-pilot

The deployed SHA (`b212e16822a`) is 3 commits behind `origin/main` (`7fd814c29ae`):

```
7fd814c deploy: drop the approval gate (self-owned project, speed over ceremony)
5f1f9db chore(queue): mark PILOT-001 completed (drain PR merged by pr-auto-review)
b34da4f feat(pilot): implement Hermes status page end-to-end (#1)
```

These commits appear to have been merged by `pr-auto-review` but never deployed. This is a minor drift — hermes-pilot is a scratch-tier proving ground — but should be resolved before wave 2 timers are armed, per REQ-006's requirement that all deploy state is clean.

---

## 4. Recommendations

1. **Resolve hermes-pilot drift** — either deploy the pending commits or update `.last-deployed` to match `origin/main`.
2. **Reconcile OS-business-os-16** — change its status from `done` to `completed` for consistency.
3. **Add `.last-deployed` tracking** to agentic-sdlc, nels-workshop, and willtopaint, or document why they don't need it (e.g., no deploy pipeline configured).
4. **Proceed with wave 2** after items 1–3 are resolved.
