# OpenSpec Backlog

Potential ideas and future proposals for the agentic SDLC framework. Items here are candidates for `openspec-new-change` — they have not yet been proposed, designed, or specced. When an idea is promoted to a full openspec change, remove it from this list and link to the change directory.

---

## Promoted to Changes

The following ideas from the 2026-03-13 curriculum review have been implemented:

| # | Idea | Change |
|---|------|--------|
| 1 | Semantic Memory Retrieval | `curriculum-maturity-advancement` (tasks 4.1-4.7, 5.1-5.3, 6.1-6.3) |
| 2 | Formalized Permission Tiers | `curriculum-maturity-advancement` (tasks 2.1-2.6) |
| 3 | Structured Data Contracts | `curriculum-maturity-advancement` (tasks 1.1-1.6) |
| 4 | Framework Comparison Matrix | `curriculum-maturity-advancement` (tasks 3.1-3.5) |
| 5 | Human Wellness Guardrails | `curriculum-maturity-advancement` (tasks 13.1-13.7) |
| 6 | Human Task Assignment | `curriculum-maturity-advancement` (tasks 12.1-12.8) |
| 7 | Instance Scaling | `curriculum-maturity-advancement` (tasks 9.1-9.7) |
| 8 | Execution Cadence | `curriculum-maturity-advancement` (tasks 10.1-10.4) |
| 9 | NLP Code Analysis | `curriculum-maturity-advancement` (tasks 14.1-14.5) — partially implemented |
| 10 | Agent Evolution Timeline | `curriculum-maturity-advancement` (tasks 7.1-7.6) |
| — | Capability Monitoring | `agent-capability-checklist` (31 tasks) — tasks 5.1–5.3, 6.1–6.4 implemented (2026-03-13) |

---

## Remaining Ideas

### 11. Agent-to-Agent Direct Communication Protocol

**Problem:** Agents currently communicate through task handoffs and Matrix messages, but there's no structured protocol for agents to request specific information from each other in real-time (e.g., Roy asking Moss "what embedding model did you use?").

**Idea:** Define a request-response protocol between agents via Matrix, with schema validation on both sides.

**Complexity:** Medium.

---

### 12. Automated Rollback on Deploy Failure

**Problem:** When a deploy fails smoke tests, the rollback is manual. The framework should auto-revert and notify.

**Idea:** Add rollback logic to the deploy pipeline template and notify.mjs.

**Complexity:** Low-medium.

---

### 13. Agent Specialization Branching

**Problem:** As the framework matures, a single backend agent (Roy) may need to specialize into sub-roles (Roy-API, Roy-DB, Roy-Queue). The framework doesn't support role splitting.

**Idea:** Add agent specialization templates and a "split" command that forks an agent's memory and AGENT.md.

**Complexity:** Medium.

---

## Backlog Management

- **To promote an idea**: Run `openspec-new-change` with the idea as the basis for the proposal
- **To reject an idea**: Move it to the "Rejected" section below with a reason
- **To defer an idea**: Leave it here — backlog items have no deadline

## Rejected

(none yet)
