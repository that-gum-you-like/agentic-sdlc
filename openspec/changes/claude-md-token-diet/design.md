# Design: claude-md-token-diet

**Date**: 2026-05-27
**Status**: design

---

## Context

`CLAUDE.md` was grown additively over many openspec changes — each change appended a section. Today it's the framework's authoritative reference, but the always-loaded cost is significant on every Claude Code session.

Cursor and Claude Code both load `CLAUDE.md` at session start. Cursor caches it; Claude Code caches it via Anthropic prompt caching when the prefix is stable. Splitting the file does NOT lose caching benefit — it only reduces the prefix size, lowering cache-write cost on the rare cache miss.

---

## Goals

- `CLAUDE.md` ≤500 lines (75% reduction from current ~2000)
- `AGENTS.md` ≤150 lines
- Zero loss of content — everything moves to `docs/appendix/` with a pointer from `CLAUDE.md`
- Agent behavior unchanged on a battery of standard tasks

## Non-Goals

- Rewriting framework rules
- Removing capabilities
- Changing the OpenSpec workflow

---

## Design

### CLAUDE.md target structure (~500 lines)

```
# Agentic SDLC Framework

## Non-Negotiable Rules                          [~30 lines, verbatim]
## Done Checklist                                [~25 lines, verbatim]
## OpenSpec Workflow                             [~50 lines summary + link]
## Micro Cycle                                   [~30 lines verbatim]
## Testing Requirements (Tiers 1-5)              [~40 lines summary + link]
## Safety Mechanisms                             [~30 lines summary + link]
## Memory System (5-layer summary)               [~30 lines summary + link]
## Agent Roster (1-line per agent)               [~30 lines summary + link]
## Permission Tiers                              [~25 lines verbatim]
## Git Conventions                               [~25 lines verbatim]
## Session Protocols                             [~30 lines summary + link]
## Pointers
  - docs/appendix/iteration-cycles.md
  - docs/appendix/capability-monitoring.md
  - docs/appendix/performance-feedback.md
  - docs/appendix/prompt-playbook.md
  - docs/appendix/voice-input.md
  - docs/appendix/glossary.md
  - docs/appendix/maturity-model.md
  - docs/appendix/agent-system-full.md
```

### Migration script

Write `agents/claude-md-split.mjs` (one-shot script):
1. Parse `CLAUDE.md` by `##` headers
2. For each "move to appendix" section: write the section content to `docs/appendix/<slug>.md` with a `**Source**: CLAUDE.md (pre-split)` header
3. Replace the section body in `CLAUDE.md` with a 3-line summary + `→ See docs/appendix/<slug>.md`
4. Verify total `CLAUDE.md` ≤500 lines

Keep the script committed so the operation is reproducible/auditable.

### AGENTS.md slim-down

Audit first — read every line, classify: (keep / move-to-CLAUDE.md / move-to-docs/ / delete-padding). Then edit in place.
