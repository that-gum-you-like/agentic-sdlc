# Tasks: hermes-github-write-access

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: tasks

---

## Overview

Ship the two-gate push helper (`agents/hermes-git-push.mjs`) + allowlist
scaffold + tests. Drain wiring stays deferred until Bryce creates the
fine-grained PAT (proposal's blocking dependency).

## Prerequisites

- [x] Proposal approved direction (Bryce chose the two-gate design)
- [x] `GITHUB_TOKEN` present in `~/.hermes/.env` (fine-grained PAT swap remains Bryce's)

## Implementation Tasks

- [x] **T1 — origin parsing + guards** (REQ-001, REQ-002): `parseOrigin`, `sanitizeId`, `guard` pure functions; fail-closed allowlist load.
- [x] **T2 — token discovery + redaction** (REQ-003): env → `~/.hermes/.env`; `redact` scrubs `x-access-token`.
- [x] **T3 — push pipeline** (REQ-004): commit-if-dirty, no-op when clean+synced, tokenized push (no force), draft PR via fetch, 422 = success.
- [x] **T4 — init scaffold** (REQ-005): seeded allowlist, mode 600, never overwrite.
- [x] **T5 — CLI + rule #9 guard**: `push|init|check` modes, `__isMainModule`.
- [x] **T6 — tests**: `tests/hermes-git-push.test.mjs` — fake `git` shim + injected `fetchImpl`; guards, redaction, no-op, duplicate PR.
- [ ] **T7 — drain wiring (DEFERRED)**: call helper from sandboxed cycles once Bryce's fine-grained PAT replaces the broad token; one-line change documented in design D6.
- [ ] **T8 — server-side backstop (Bryce)**: branch protection on `main` for each designated repo.

## Done Checklist (framework repo)

- [x] openspec (this change)
- [x] tests pass
- [x] commit
- [x] push
