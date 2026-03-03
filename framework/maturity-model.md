# Agentic SDLC Maturity Model

A universal methodology for AI-assisted software development. This model applies to any project regardless of tech stack, domain, or team size.

---

## Maturity Levels (0–6)

### Level 0: Manual

- You write code, run tests, commit, review.
- No AI involvement in the development loop.

### Level 1: Assisted

- AI helps you write code.
- AI suggests tests.
- You still commit and review.

### Level 2: Automated

- AI writes, you review.
- AI runs tests.
- AI commits (if tests pass).
- AI reviews first, human reviews second.

### Level 3: Orchestrated

- Multiple AI agents working in parallel.
- Queue-based work distribution.
- Parallel execution of independent tasks.
- Coordinated merging and conflict resolution.

### Level 4: Autonomous

- Agents work overnight without supervision.
- Merge while you sleep.
- Human reviews results in the morning.
- Human handles exceptions only.

### Level 5: Evolving

- Agents improve themselves based on feedback.
- Learn from past mistakes via memory systems.
- Defeat their own recurring anti-patterns.
- Spawn new specialized agents as new problem types emerge.

### Level 6: Self-Improving

- Agents teach discipline to each other.
- Continuous pattern detection and defeat.
- Behavior tests catch regressions in agent decision-making.
- System gets better without human intervention.
- Human provides vision; agents handle execution.

---

## Maturity Pyramid

Each level builds on the previous. No skipping.

```
7. MASTERY               — Self-improving agent team
6. CONTINUOUS IMPROVEMENT — TDD + Behavior testing
5. EVOLUTION             — Memory + Character
4. QUALITY               — Checklists + Static Analysis
3. SCALE                 — Multi-agent + Release Management
2. AUTOMATION            — Headless agents + Test suites
1. FOUNDATION            — Brain dump → Roadmap
```

Each pass through the pyramid makes the system more robust. You will revisit earlier levels as the system grows — this is expected.

---

## New Project Setup Checklist

Use this checklist when starting any project. Work through the levels sequentially.

### Level 1–2 (Foundation + Automation)

- [ ] `CLAUDE.md` (or equivalent) with project rules and LLM-friendly style guide
- [ ] Spec system initialized: `openspec/changes/`, `openspec/archive/`, `openspec/specs/`
- [ ] Every change has: `proposal.md` (with value analysis), `tasks.md`, `status.json`
- [ ] Testing: unit + integration + e2e scripts, pre-commit hooks
- [ ] Micro cycle defined: pick → implement → test → commit → next

### Level 3 (Scale)

- [ ] Specialist agents with character sheets (`AGENT.md`)
- [ ] Task queue: `tasks/queue/*.json` with priority + claim fields
- [ ] Queue drainer with pattern-based agent routing
- [ ] `tasks/completed/` archive for finished tasks
- [ ] Release manager agent + deploy pipeline
- [ ] Agent communication channel (Matrix, Slack, or equivalent)
- [ ] PM Dashboard for human oversight

### Level 4 (Quality)

- [ ] Senior developer review checklist
- [ ] Post-commit review hook
- [ ] Defeat tests for known anti-patterns
- [ ] Static analysis (linting, type checking, semantic analysis)

### Level 5 (Evolution)

- [ ] 5-layer memory per agent (core, long-term, medium-term, recent, compost)
- [ ] Failure memories populated in `core.json`
- [ ] REM Sleep automated (weekly memory consolidation)
- [ ] Agent versioning with snapshots and rollback capability
- [ ] Memory migration on version changes

### Level 6 (Continuous Improvement + Mastery)

- [ ] Behavior tests for prompt changes
- [ ] Per-agent token budgets + circuit breakers
- [ ] Cost tracking and monitoring
- [ ] Pattern hunt → defeat test loop
- [ ] Conservation mode trigger at 80% budget

---

## Core Principles

**Testing is non-negotiable.** Unit, integration, e2e, and front-end e2e on every commit. The cost of bad code exceeds the cost of writing tests.

**LLM-friendly style matters.** Small files, small commits, clear interfaces, consistent patterns. Agents work better with predictable, decomposed codebases.

**Every correction becomes a rule.** When a senior developer catches a mistake, it must become a checklist item, not just a one-time fix.

**Directory structure = status report.** Organize your project so the file tree communicates what is complete, in progress, and planned.

---

## Lesson Plan

For a structured walkthrough of setting up and using this framework (Hours 1-7), see [`lesson-plan.md`](lesson-plan.md).
