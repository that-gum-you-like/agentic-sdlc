# Spec: hermes-skill-templates

**Date**: 2026-07-04
**Status**: specs
**Capability**: NEW

---

## Overview

Ports six Hermes skills into first-class execution-agent addendum templates under `agents/templates/execution-agents/`, faithful to their source `SKILL.md`, valid against the existing frontmatter schema, and routable by `role_keywords` / `default_patterns`.

---

### REQ-001: Six Hermes Skills Ported as Execution-Agent Templates

**Statement:** The system shall provide six execution-agent addendum templates, each a faithful distillation of its source Hermes skill.

**Acceptance Criteria:**
- [ ] These files exist under `agents/templates/execution-agents/`: `constitutional-ai-engineer.md`, `context-engineering-master.md`, `memory-architect.md`, `twelve-factor-agent.md`, `rag-specialist.md`, `token-embedding-analyzer.md`
- [ ] Each preserves the source skill's core operating rules, cycle, and boundary (not a verbatim copy — translated to addendum form)
- [ ] Each body contains: Domain, Operating Cycle, Non-Negotiable Rules, Quality Patterns, Known Failure Patterns, Boundary
- [ ] No template invents a capability the framework does not track

**Complexity:** M
**Value:** High

---

### REQ-002: Templates Are Schema-Valid and Routable

**Statement:** Each ported template shall carry valid frontmatter that makes it selectable by agent-routing and shall pass behavior tests.

**Acceptance Criteria:**
- [ ] Frontmatter includes `role_keywords` (non-empty), `archetype`, `template_type: "addendum"`, `default_patterns`, and a `capabilities` block with `required` / `conditional` / `notExpected`
- [ ] `capabilities.required` references only capabilities the framework already tracks
- [ ] RAG / embedding / memory templates mark `semanticSearch` as `conditional: "when sentence-transformers installed"`
- [ ] `node ~/agentic-sdlc/agents/test-behavior.mjs` passes with the new templates present
- [ ] `role_keywords` are distinct enough that routing does not collide with the 16 existing templates

**Complexity:** S
**Value:** High
