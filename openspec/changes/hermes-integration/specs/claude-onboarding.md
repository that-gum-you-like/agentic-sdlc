# Spec: claude-onboarding

**Date**: 2026-07-04
**Status**: specs
**Capability**: NEW

---

## Overview

Replaces the incorrect fork/PAT hand-off guidance with accurate onboarding for Claude Code, and documents how Hermes, Claude, and the OpenSpec backlog/queue coordinate.

---

### REQ-006: Accurate Claude Quickstart

**Statement:** The system shall provide `docs/claude-quickstart.md` describing the real, already-working setup for operating this repo with Claude Code.

**Acceptance Criteria:**
- [ ] States that the operator **owns** `that-gum-you-like/agentic-sdlc` — no fork step
- [ ] States that `gh` is already authenticated (`repo` + `workflow` scopes) — no PAT creation, no token exposed to any agent
- [ ] Documents the OpenSpec-first workflow (proposal → design → specs → tasks → implement → archive) as mandatory
- [ ] Documents pulling work from `openspec/BACKLOG.md` and `tasks/queue/`, and the micro cycle
- [ ] Lists the new cron scripts and how to run them
- [ ] Contains no instruction to `export GH_TOKEN` to an LLM or to fork the repo

**Complexity:** S
**Value:** High

---

### REQ-007: Hermes ↔ Backlog Bridge Documented

**Statement:** The system shall provide `docs/hermes-backlog-bridge.md` describing how Hermes skills, the ported repo templates, and the OpenSpec backlog/queue coordinate work across the Hermes, Claude, and autonomous-launcher runtimes.

**Acceptance Criteria:**
- [ ] Maps each ported capability to its Hermes skill and its repo template
- [ ] Explains the backlog/queue as the shared work ledger across runtimes
- [ ] Describes the hand-off pattern (who picks up what, how state is signaled)
- [ ] `README.md` and `openspec/BACKLOG.md` link to the new docs and templates

**Complexity:** S
**Value:** Medium
