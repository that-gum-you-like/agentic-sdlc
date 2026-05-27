# Design: cursor-rules-modernization

**Date**: 2026-05-27
**Author**: CTO-Opus (claude-opus-4-7) with Bryce
**Status**: design

---

## Context

Cursor 2026 best practice (per Morph guide and Cursor docs):
- `alwaysApply: true` rules should be ≤50 lines
- Glob-scoped rules should be ≤150 lines
- 5-8 rules total is the sweet spot
- Commands beat suggestions ("must" not "try to")

Current state: 5 rule files, one over cap (167 lines), legacy `.cursorrules` still present.

---

## Goals

- Zero `.cursor/rules/*.mdc` file exceeds Morph's caps (50 always-apply / 150 glob)
- `.cursorrules` removed if it duplicates `.cursor/rules/` content
- `.windsurfrules` either kept with a documented reason, or removed
- No regression in agent behavior (verified via test session)

## Non-Goals

- Rewriting rule semantics (this is a refactor, not a redesign)
- Adding new rules
- Touching `CLAUDE.md` (separate change: `claude-md-token-diet`)

---

## Design

### Step 1: Verify `.cursorrules` is redundant

Diff `.cursorrules` against the union of `.cursor/rules/*.mdc`. Any content unique to `.cursorrules` must be migrated to a `.mdc` file before deletion.

### Step 2: Split `sdlc-task-execution.mdc`

Current 167-line file covers:
- Pre-flight (env check, dependency check) — ~30 lines
- Task claim mechanics (stale-claim detection, lock semantics) — ~30 lines
- Implement loop (micro cycle reference) — ~40 lines
- Test invocation — ~30 lines
- Commit conventions — ~25 lines
- Misc — ~12 lines

Split:
- **`sdlc-task-claim.mdc`** (glob: `tasks/queue/*.json`, `agents/queue-drainer.mjs`): pre-flight + claim mechanics (~60 lines)
- **`sdlc-task-implement.mdc`** (glob: `**/*.mjs`, `**/*.test.mjs`): implement loop + test + commit (~80 lines)

### Step 3: Slim `agentic-sdlc.mdc`

Move from always-apply (current 87 lines, target ≤50):
- "Memory protocol" section → new `sdlc-memory.mdc` glob: `agents/templates/*/memory/**`
- "Anti-patterns" section → new `sdlc-anti-patterns.mdc` glob: `**/*.mjs`

What stays in `agentic-sdlc.mdc`: non-negotiable 7, micro cycle one-liner, "where to learn more" pointer.

### Step 4: `.windsurfrules` decision

Check `~/.windsurf/` usage timestamps. If unused in 30+ days, delete and note in BACKLOG.md. Otherwise add a header comment explaining what tool consumes it.

### Verification

Open a Cursor session in the repo, run a small task, confirm:
- Rule files load correctly (check Cursor's "rules loaded" indicator)
- Agent behavior unchanged on a standard micro-cycle task
