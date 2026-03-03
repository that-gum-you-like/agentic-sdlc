# Agentic SDLC Lesson Plan

A structured walkthrough for setting up and using the Agentic SDLC framework. Each hour builds on the previous, following the maturity pyramid.

---

## Hour 1: Planning & Requirements

- **Conversation-first process:** brain dump → explore → formalize.
- **OpenSpec workflow:** `proposal.md` → `tasks.md` → `status.json` in `openspec/changes/<name>/`.
- **Business value analysis** added to proposals: personas, problem, priority, success metrics.
- **Phased task breakdown** with dependencies.
- **Archive completed changes** to `openspec/archive/`.
- **Directory structure = status report.** Organize your project so the file tree communicates what is complete, in progress, and planned.

---

## Hour 2: Autonomous Workers

- **File-based task coordination:** `tasks/` with per-agent JSON files.
- **Micro cycle:** pick → implement → write tests → run tests → commit if passing → next.
- **Testing is non-negotiable:** unit, integration, e2e, front-end e2e on every commit.
- **Pre-commit hooks:** test, lint, typecheck.
- **Cost of bad code > cost of tests.**

---

## Hour 3: Agent Orchestration

- **LLM-friendly style:** small files, small commits, clear interfaces, consistent patterns.
- **Specialist agents:** name, system prompt, tools, scope, character.
- **Queue drainer pattern:** ticket queue → drainer → agent instance.
- **Agent communication:** Matrix (interactive) + Task files (silent).
- **Turn-based system:** 30-minute cycles for thoughtful coordination.

---

## Hour 4: Release Management & Scaling

- **Priority queue:** CRITICAL → HIGH → MEDIUM → LOW with claim system and token estimates.
- **Release manager agent:** sequences merges, flags conflicts, maintains changelog.
- **Parallelize independent work, serialize dependent work.**
- **Tell agents when working alongside others.**
- **PM Dashboard** for human oversight: blockers, activity, costs.
- **Review agent** checks every submission against a style guide.
- **Documentation agent** maintains real docs (not just PR descriptions).

---

## Hour 5: Anti-Pattern Detection

- **Name anti-patterns specifically** using the standard vocabulary (modular, robust, testable, discoverable, decomposed).
- **Senior developer checklist:** every correction becomes a checklist item.
- **Post-commit hook:** senior review agent reviews against checklist.
- **Static analysis:** linting, type checking, semantic analysis, AST parsers.
- **Semantic pattern detection** for regex-based scanning and distance-based suggestions.

---

## Hour 6: Agent Memory & Evolution

- **5-layer memory:** core, long-term, medium-term, recent, compost.
- **Core memories** include failure/embarrassment memories for self-correction.
- **REM Sleep:** memory consolidation (prune recent → promote → archive stale).
- **Character sheets:** name, personality, core memories, responsibilities, tools, interfaces.
- **Agent evolution:** mistakes → corrections → checklist → memory → self-correction.
- **When to create new agents:** repeated input pattern = new agent opportunity.
- **Four-layer validation:** research, critique, code, statistics.

---

## Hour 7: Continuous Improvement

- **Improvement loop:** Find Pattern → Defeat with Test → Teach Discipline → Repeat.
- **Agent TDD:** Pattern Found → Test Written → Agent Trained → Pattern Defeated.
- **E2E tests** verify behavior through the whole system (not just functions).
- **Mobile workflow** via claude.ai/code: add requirements, kick off tasks, review.
- **Troubleshooting:** See `docs/troubleshooting.md` for common issues and solutions.
- **Cost tracking:** per-agent token budgets, circuit breakers, conservation mode at 80% budget.
- **Token usage by task type:**
  - Simple fix: 2-5K (haiku)
  - Feature: 10-30K (sonnet)
  - Architecture: 20-50K (sonnet/opus)
  - Research: 30-100K (opus)
- **Agent versioning:** version history in AGENT.md, memory migration on upgrade, rollback capability.
- **Reference architecture:** Human Layer → Coordination Layer → Agent Layer → Validation Layer → Code Layer.
- **Validation layer:** 4 layers (research → critique → code → statistics) + pre-commit + post-commit + E2E.
- **Behavior testing:** tests that verify agent decision-making quality, not just code correctness.
- **Case studies to review:** Citation Crisis (fabricated sources), NaN Fallback Disaster (silent zeros), uncontrolled randomness in deterministic logic.
