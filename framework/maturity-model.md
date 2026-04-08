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

### Level 4: Quality

- Automated code review with growing checklists.
- Defeat tests catch known anti-patterns.
- Browser E2E testing for frontend changes.
- Quality gates must pass before commits land.

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
6. SELF-IMPROVING   — Pattern detection, behavior tests, drift monitoring
5. EVOLVING         — Agent memory, failure tracking, model manager
4. QUALITY          — Defeat tests, code reviewer, browser E2E
3. ORCHESTRATED     — Task queue, multiple agents, domain routing
2. AUTOMATED        — Micro cycle: implement → test → commit
1. ASSISTED         — CLAUDE.md with project rules
0. MANUAL           — No AI involvement (starting point)
```

Each pass through the pyramid makes the system more robust. You will revisit earlier levels as the system grows — this is expected.

---

## New Project Setup Checklist

Use this checklist when starting any project. Work through the levels sequentially.

### Level 1–2 (Assisted + Automated)

- [ ] `CLAUDE.md` (or equivalent) with project rules and LLM-friendly style guide
- [ ] Spec system initialized: `openspec/changes/`, `openspec/archive/`, `openspec/specs/`
- [ ] Every change has: `proposal.md` (with value analysis), `tasks.md`, `status.json`
- [ ] Testing: unit + integration + e2e scripts, pre-commit hooks
- [ ] Micro cycle defined: pick → implement → test → commit → next

### Level 3 (Orchestrated)

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
- [ ] Shrinking allowlist defeat tests — pre-existing violations tracked, never grow, auto-shrink on fix
- [ ] Failure severity taxonomy — F-xxx IDs with critical/high/medium response mapping
- [ ] Static analysis (linting, type checking, semantic analysis)
- [ ] Browser E2E: critical user flows tested in real browser (login → navigate → interact → verify)
- [ ] Refresh resilience: route groups survive hard browser refresh
- [ ] Deploy gate: browser E2E must pass before production deploy

### Level 5 (Evolving)

- [ ] 5-layer memory per agent (core, long-term, medium-term, recent, compost)
- [ ] Failure memories populated in `core.json`
- [ ] REM Sleep automated (weekly memory consolidation + similarity dedup)
- [ ] Semantic memory search via embeddings (`semantic-index.mjs`)
- [ ] Agent versioning with snapshots and rollback capability
- [ ] Memory migration on version changes
- [ ] Agent maturation tracking (6 levels: New → Evolving)
- [ ] Performance feedback metrics injected into agent prompts
- [ ] Model-manager agent — token monitoring, live model swaps, performance ledger
- [ ] Performance ledger (pm/model-performance.jsonl) — task outcomes by model × agent
- [ ] Platform-agnostic adapter layer — orchestration + LLM providers pluggable
- [ ] Semantic clustering in pattern-hunt
- [ ] Capability monitoring — system-instrumented logs + agent self-report
- [ ] User journey coverage: new features require corresponding browser journey test
- [ ] Dead link audit: navigation targets verified to have content
- [ ] State persistence testing: user interactions survive navigation and reload

### Level 6 (Self-Improving)

- [ ] Behavior tests for prompt changes + maturation regression
- [ ] Per-agent token budgets + circuit breakers
- [ ] Cost tracking, efficiency metrics, and session hours monitoring
- [ ] Pattern hunt → defeat test loop (with semantic clustering)
- [ ] Conservation mode trigger at 80% budget
- [ ] Data-driven model recommendations — model-manager analyzes performance ledger for optimal assignments
- [ ] Instance scaling — multiple instances of same agent type
- [ ] Execution cadence — staggered commit windows
- [ ] Human task queue — bidirectional human-agent task flow
- [ ] Human wellness guardrails — advisory session limits
- [ ] Bottleneck detection — alerts when human tasks block agent work
- [ ] Capability drift detection — fire alerts on 3+ consecutive skips
- [ ] Cycle history logging — all automated runs recorded

---

## Core Principles

**Testing is non-negotiable.** Unit, integration, e2e, and front-end e2e on every commit. The cost of bad code exceeds the cost of writing tests.

**LLM-friendly style matters.** Small files, small commits, clear interfaces, consistent patterns. Agents work better with predictable, decomposed codebases.

**Every correction becomes a rule.** When a senior developer catches a mistake, it must become a checklist item, not just a one-time fix.

**Directory structure = status report.** Organize your project so the file tree communicates what is complete, in progress, and planned.

---

## Lesson Plan

For a structured walkthrough of setting up and using this framework (Hours 1-7), see [`lesson-plan.md`](lesson-plan.md).
