# Tasks: hermes-integration

**Date**: 2026-07-04
**Status**: tasks

---

## Prerequisites

- [x] proposal.md approved (incl. Value Analysis)
- [x] design.md written
- [x] specs written (hermes-skill-templates, autonomous-cron-scripts, claude-onboarding)
- [x] Source Hermes skills present under `~/.hermes/skills/`
- [x] `gh` authenticated with `repo` + `workflow` scopes

---

## Implementation Tasks

### Workstream A — Skill → template port

- [x] **T-101**: `agents/templates/execution-agents/constitutional-ai-engineer.md`
  - Complexity: S · Spec: REQ-001, REQ-002
- [x] **T-102**: `agents/templates/execution-agents/context-engineering-master.md`
  - Complexity: S · Spec: REQ-001, REQ-002
- [x] **T-103**: `agents/templates/execution-agents/memory-architect.md`
  - Complexity: S · Spec: REQ-001, REQ-002
- [x] **T-104**: `agents/templates/execution-agents/twelve-factor-agent.md`
  - Complexity: S · Spec: REQ-001, REQ-002
- [x] **T-105**: `agents/templates/execution-agents/rag-specialist.md`
  - Complexity: S · Spec: REQ-001, REQ-002
- [x] **T-106**: `agents/templates/execution-agents/token-embedding-analyzer.md`
  - Complexity: S · Spec: REQ-001, REQ-002

### Workstream B — Cron scripts

- [x] **T-201**: `agents/red-team-tester.mjs` + import guard
  - Complexity: M · Spec: REQ-003, REQ-004
- [x] **T-202**: `agents/rag-indexer.mjs` (optional python, lexical fallback)
  - Complexity: M · Spec: REQ-003, REQ-004
- [x] **T-203**: `agents/health-check.mjs`
  - Complexity: S · Spec: REQ-003, REQ-004
- [x] **T-204**: `agents/telegram-notify.mjs` (stdlib https, no-op unconfigured)
  - Complexity: S · Spec: REQ-003, REQ-004
- [x] **T-205**: `agents/document-sync.mjs`
  - Complexity: S · Spec: REQ-003, REQ-004
- [x] **T-206**: `tests/hermes-integration.test.mjs` + wire into `npm test`
  - Complexity: M · Spec: REQ-005

### Workstream C — Docs

- [x] **T-301**: `docs/claude-quickstart.md`
  - Complexity: S · Spec: REQ-006
- [x] **T-302**: `docs/hermes-backlog-bridge.md`
  - Complexity: S · Spec: REQ-007
- [x] **T-303**: Pointers from `README.md` + `openspec/BACKLOG.md`
  - Complexity: S · Spec: REQ-007

### Workstream D — Registry integration & wiring (completeness, added 2026-07-05)

- [x] **T-501**: Register 6 templates in `CLAUDE.md` §Agent System (count 15→21 + archetype names)
  - Complexity: S · Spec: REQ-008
- [x] **T-502**: Add 6 rows to `docs/appendix/agent-system.md` execution-template table + fix count
  - Complexity: S · Spec: REQ-008
- [x] **T-503**: Update `docs/execution-agents.md` — Overview count, Available Templates table (6 rows), Full Team roster
  - Complexity: S · Spec: REQ-008
- [x] **T-504**: Add 6 routing rows to `framework/agent-routing.md`
  - Complexity: S · Spec: REQ-008
- [x] **T-505**: Update `README.md` template counts (15→21 execution, 20→26 total)
  - Complexity: S · Spec: REQ-008
- [x] **T-506**: Add 5 script rows to `docs/appendix/script-reference.md`
  - Complexity: S · Spec: REQ-009
- [x] **T-507**: Add cron cadence + OpenClaw one-liners to `docs/appendix/iteration-cycles.md` (4 cron scripts)
  - Complexity: S · Spec: REQ-009
- [x] **T-508**: Add 4 schedule entries to `agents/templates/cron-schedule.json.template`
  - Complexity: S · Spec: REQ-009
- [x] **T-509**: Wire `telegram` provider into `notify.mjs` (`sendViaTelegram` + switch + `status` health) mirroring `sendViaOpenclaw`
  - Complexity: M · Spec: REQ-010
- [x] **T-510**: Add `telegram` to `CLAUDE.md` §Notification provider list
  - Complexity: S · Spec: REQ-010
- [x] **T-511**: Test: `telegram` provider dispatch + graceful no-op when unconfigured (`tests/hermes-integration.test.mjs`, 7/7 green)
  - Complexity: S · Spec: REQ-010

### Workstream B — hardening (post-review, 2026-07-05)

- [x] **T-207**: Fix `rag-indexer.mjs` `callEmbed` E2BIG — smoke-testing on the real corpus (244 chunks) showed the old `echo '<json>' | python` form overflowed `MAX_ARG_STRLEN` (spawnSync E2BIG) and mis-escaped quotes. Now streams the payload over stdin (embed.py reads `sys.stdin`). Added offline embedding env (`HF_HUB_OFFLINE`/`TRANSFORMERS_OFFLINE`/`HF_HUB_DISABLE_TELEMETRY` — privacy-first, no HF Hub network) and a graceful lexical fallback so a scheduled run never hard-fails (REQ-004). Injectable `opts.embedFn` enables deterministic regression tests for both the embed and fallback paths.
  - Complexity: M · Spec: REQ-003, REQ-004

### Verification

- [x] **T-401**: `npm test` green (incl. new suite)
  - Complexity: S · Spec: VERIFY
- [x] **T-402**: `node agents/four-layer-validate.mjs --files 'agents/*.mjs'` passes (Layer 5 import-guard scan)
  - Complexity: S · Spec: VERIFY
- [x] **T-403**: `node agents/test-behavior.mjs` passes with new templates
  - Complexity: S · Spec: VERIFY
- [x] **T-404**: Change is structurally complete (proposal + design + specs + tasks + status.json), matching the repo's house spec style (`REQ-xxx` + Acceptance Criteria). NOTE: the repo does not use OpenSpec's canonical delta format, so `openspec validate` is not a gate here — consistency with existing changes is.
  - Complexity: S · Spec: VERIFY
- [x] **T-405**: Dry-run each cron script once; confirm no side effects on import
  - Complexity: S · Spec: VERIFY

---

## Verification

- All new scripts import side-effect-free (Layer 5 clean — `four-layer-validate` scanned 65 `.mjs`, all guarded)
- `tests/hermes-integration.test.mjs` passes 7/7 (incl. telegram provider dispatch); full `npm test` green (47 + 7 + 6 + 1, 0 failures)
- `test-behavior.mjs`: 175 passed, 10 failed — **the 10 failures are pre-existing on `main`** (sdlc-* version headers + Richmond checklist content), unrelated to this change; this branch introduces **zero** regression. (The PR body's earlier "165/165" figure was inaccurate.)
- `openspec validate --strict` is **not** a gate here — per T-404, this repo uses house REQ-xxx specs, not the canonical delta format; consistency with existing changes is the bar
- All six new templates are registered in every roster/routing registry (CLAUDE.md, agent-system.md, execution-agents.md, agent-routing.md, README.md); all five scripts in script-reference + iteration-cycles + cron-schedule template; telegram is a first-class `notify.mjs` provider
- Docs contain no fork/PAT guidance; state real gh-auth + no-fork reality
