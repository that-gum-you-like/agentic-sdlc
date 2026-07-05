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

- All new scripts import side-effect-free (Layer 5 clean)
- `tests/hermes-integration.test.mjs` passes; full `npm test` green
- `test-behavior.mjs` passes with 6 new templates
- `openspec validate --strict` passes
- Docs contain no fork/PAT guidance; state real gh-auth + no-fork reality
