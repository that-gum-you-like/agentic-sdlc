# Framework Comparison: Agentic SDLC vs. LangGraph, Autogen, CrewAI, OpenAI Swarm, and Claude Agent SDK

This document maps the core concepts of this framework to equivalent (or absent) concepts in five other popular multi-agent frameworks. It is intended to help engineers who know another framework understand this one quickly, and to help teams choose the right tool for their situation.

---

## Concept Comparison Table

| Concept | This Framework | LangGraph | Autogen | CrewAI | OpenAI Swarm | Claude Agent SDK |
|---------|---------------|-----------|---------|--------|--------------|------------------|
| **Task queue / routing** | File-based JSON queue in `tasks/queue/`. Tasks have priority, `blockedBy` deps, domain tags. `queue-drainer.mjs` assigns tasks to agents by matching file patterns in `domains.json`. | Graph nodes + edges. Routing is explicit control flow between nodes defined at graph construction time. | Agent `GroupChat` with a `GroupChatManager` that selects the next speaker. Routing is LLM-driven or round-robin. | `Crew` assigns `Task` objects to `Agent` roles. Order is sequential or hierarchical by default. | Handoffs: agents transfer control to another agent by returning a reference. No persistent queue. | Tool calls drive routing. Parent agent invokes subagents as tools. No persistent queue. |
| **Agent system prompts (AGENT.md)** | Each agent has an `AGENT.md` file with identity, role, operating rules, failure memories, and version header. Prompt evolves over time and is version-controlled. | System message passed at node creation. No standard file convention; not version-controlled by default. | Each `AssistantAgent` or `ConversableAgent` has a `system_message` parameter. String literal, not file-based. | Each `Agent` has a `role`, `goal`, and `backstory` string. Defined in code, not version-controlled separately. | System prompt passed inline at agent creation. No file-based convention. | System prompt passed at subagent creation. No file-based convention. |
| **Domain routing (domains.json)** | `domains.json` maps file path patterns and keywords to agent slugs. `queue-drainer.mjs` reads this to auto-assign tasks without human input. Fully declarative. | No equivalent. Routing is hardcoded in the graph topology at build time. | No equivalent. Speaker selection logic is in code or a custom `speaker_selection_func`. | No equivalent. Task-to-agent assignment is defined per-task or by crew hierarchy. | No equivalent. Handoff targets are hardcoded in each agent's tool list. | No equivalent. Subagent selection is decided by the parent agent's reasoning. |
| **5-layer memory system** | Per-agent files: `core.json` (permanent identity + failure memories), `long-term.json` (learned patterns), `medium-term.json` (sprint context), `recent.json` (current session), `compost.json` (deprecated ideas). `memory-manager.mjs` and `rem-sleep.mjs` manage promotion and pruning. | No built-in memory layers. State is a typed dict on the graph. Long-term memory requires external integration (e.g., vector store). | `ConversableAgent` has conversation history as in-context memory only. Long-term memory requires custom `retrieve_config` with a vector DB. | Agent has `memory` flag and can use `Memory` tools, but no layered consolidation model. | No memory. Agents are stateless between invocations; context window is the only memory. | No persistent memory layer built in. Context is passed at invocation; any persistence must be built externally. |
| **Micro cycle (ReACT + test gates)** | Pick task → Read memory → Implement → Write tests → Run tests → Browser E2E (if frontend) → Commit only if passing → Record learnings → Next task. Test gate is mandatory; commit is blocked if tests fail. | ReACT-style loops are supported via conditional edges looping back to an agent node. No test gate convention; that logic must be built into nodes. | Each agent can loop via `human_input_mode` or `reply_func_from_human`. No built-in test gate. | Tasks execute in a pipeline; no built-in test gate. Quality checks must be added as custom tools or tasks. | Agent can loop by handing off to itself or by calling tools repeatedly. No test gate. | Subagent can loop via recursive tool calls. No built-in test gate. |
| **OpenSpec workflow** | Mandatory structured change management: proposal → design → specs → tasks → implement → archive. Every change has documented value analysis, design rationale, and acceptance criteria before a line of code is written. | No equivalent. | No equivalent. | No equivalent. | No equivalent. | No equivalent. |
| **Defeat tests** | Tests that specifically target known recurring anti-patterns: `any` types, silent fallbacks, missing error handling, oversized files. Pattern hunt identifies new anti-patterns and proposes new defeat tests. These grow over time and can never be deleted without approval. | No equivalent. | No equivalent. | No equivalent. | No equivalent. | No equivalent. |
| **REM sleep memory consolidation** | Weekly automated job (`rem-sleep.mjs`) promotes entries from `recent.json` → `medium-term.json` → `long-term.json` → `core.json` based on recurrence and importance. Compost entries that are stale or superseded. | No equivalent. | No equivalent. | No equivalent. | No equivalent. | No equivalent. |
| **Pattern hunt** | `pattern-hunt.mjs` mines post-commit review history to find recurring failure patterns, proposes new defeat tests, and flags agents whose checklist has not grown in N weeks. Drives continuous self-improvement. | No equivalent. | No equivalent. | No equivalent. | No equivalent. | No equivalent. |
| **Review agent / post-commit hooks** | `review-hook.mjs` installs as a git post-commit hook. A dedicated reviewer agent (e.g., Richmond) runs after every commit, checks against a growing checklist, and records findings. Review severity is tracked over time. | No built-in post-commit convention. Can add a review node in the graph, but no hook integration. | `ReviewerAgent` pattern is common in Autogen examples, but no hook integration. | CrewAI supports a manager agent that reviews task output, but no git hook integration. | No hook integration. Review must be an explicit handoff. | No hook integration. Review must be a separate subagent invocation. |
| **Budget / cost tracking** | `budget.json` sets daily token limits per agent. `cost-tracker.mjs` logs actual usage per task. Circuit breaker blocks new task assignment when an agent exceeds daily budget. Conservation mode halves all limits. | No built-in cost tracking. LangSmith (paid) provides observability. | Token usage is available via callback but no enforcement mechanism. | No built-in budget enforcement. | No built-in budget tracking. | No built-in per-agent budget enforcement. |
| **Browser E2E validation** | Tier 5 tests using real browser automation (Playwright). Runs against the production build before deploy. Required gate for any frontend change. Screenshots at every step. `openclaw_browser_test` provides screenshot capture. | No built-in browser testing. Can add a tool node that calls Playwright. | No built-in browser testing. | No built-in browser testing. | No built-in browser testing. | No built-in browser testing. |

---

## When to Use Which Framework

This is an honest assessment, not a sales pitch. Choose the right tool for the situation.

### Use This Framework When

- You want **autonomous overnight work** with no human in the loop. The file-based queue, budget circuit breaker, and test gates mean agents can work for hours without supervision and you review in the morning.
- You need **structured change management**. OpenSpec ensures every change has documented rationale before implementation. Good for teams that need audit trails or that have burned by "just ship it" decisions.
- You want agents that **get better over time**. The REM sleep cycle, pattern hunt, defeat tests, and memory layers mean the system accumulates institutional knowledge rather than starting fresh every session.
- Your project is a **real software product** (not a demo). The framework is built around real git workflows, real test suites, real deploy pipelines, and real cost management.
- You are using **Claude Code** as your development environment. The framework is deeply integrated with Claude Code's file-based tool use and session model.

### Use LangGraph When

- You need **fine-grained control over agent control flow**. LangGraph's explicit graph topology is better than file-based routing when the routing logic is complex and needs to be readable by engineers who don't know this framework.
- You are building **real-time or streaming pipelines** where latency matters. LangGraph's Python-native graph execution is faster than spawning Claude Code subagents.
- You need **LangChain ecosystem integration** (LangSmith tracing, vector stores, retrieval chains).

### Use Autogen When

- You want **conversational multi-agent patterns** where agents debate, critique, and refine output through back-and-forth dialogue.
- Your team is Python-first and prefers code-defined agents over file-based configuration.
- You are prototyping quickly and do not need structured change management.

### Use CrewAI When

- You need a **simple, readable crew definition** that non-engineers can understand. CrewAI's `role/goal/backstory` model is approachable.
- You want **hierarchical task delegation** (manager assigns to workers) without writing graph topology.
- Your use case maps cleanly onto a linear pipeline of tasks.

### Use OpenAI Swarm When

- You want **minimal, educational primitives**. Swarm is a reference implementation, not a production framework.
- You are learning how handoffs and context variables work before building your own framework.
- Note: Swarm is not actively maintained and is not recommended for production.

### Use Claude Agent SDK When

- You are building **Claude-native tools** and want the simplest possible subagent invocation.
- You need tight integration with Anthropic's tooling and are comfortable implementing your own orchestration layer on top.
- You want **the least framework overhead** and are willing to build routing, memory, and quality gates yourself.

### Honest Trade-offs of This Framework

| Strength | Limitation |
|----------|------------|
| Autonomous overnight work without supervision | Requires Claude Code; not portable to other agent runtimes |
| Agents improve over time via memory and pattern hunt | File-based memory is not queryable; no vector search |
| Structured change management via OpenSpec | Overhead is too high for quick experiments or prototypes |
| Real git integration (hooks, atomic commits, test gates) | File-based queue has no real-time notification or pub/sub |
| Built-in cost management and circuit breaker | Budget tracking is approximate (token estimates, not exact counts) |
| Browser E2E as a first-class testing tier | Browser tests are slow; not suitable for tight feedback loops |
| Growing defeat test suite catches recurring anti-patterns | Defeat tests must be maintained; stale tests create false confidence |

---

## What Is Unique to This Framework

These features have no equivalent in LangGraph, Autogen, CrewAI, OpenAI Swarm, or the Claude Agent SDK. They represent the framework's most distinctive bets.

### OpenSpec: Structured Change Management

Every change goes through a documented lifecycle: proposal (with value analysis) → design → specs → tasks → implement → archive. The proposal must answer "why are we doing this?" before any code is written. This is not a process overhead — it is how the system accumulates reasoning history that agents can reference later. An agent reading a spec knows not just what was built but why, what alternatives were rejected, and what the acceptance criteria were.

### Defeat Tests: Anti-Pattern Immunization

Defeat tests are tests that specifically target failure patterns this project has experienced before. They are different from ordinary tests because they are named after specific past failures and can never be deleted without documented justification. When pattern hunt finds that a failure pattern has recurred more than twice, it proposes a new defeat test. The defeat test suite grows monotonically. This is the framework's primary mechanism for preventing regression at the level of agent behavior, not just code behavior.

### REM Sleep: Memory Consolidation Across Time

The five-layer memory system is what makes agents improve over weeks rather than resetting every session. REM sleep (`rem-sleep.mjs`) runs weekly and promotes entries up the memory stack: session observations become sprint context, sprint context becomes learned patterns, learned patterns become core identity. Stale or superseded entries are composted. This is a deliberate analog to how human memory consolidation works — the system forgets trivia and strengthens important patterns.

### Pattern Hunt: Review Mining for Self-Improvement

`pattern-hunt.mjs` reads the history of post-commit reviews and looks for recurring themes. If the same class of issue appears in reviews for the same agent three or more times, it is flagged as a candidate for a new defeat test and a new memory entry. This closes the loop between "agent made a mistake" and "agent is immunized against that mistake." Without pattern hunt, review feedback stays in review comments and never feeds back into the agent's behavior.

### Maturity Tracking: Measuring Agent Growth

The framework tracks agent maturity across seven levels (Foundation through Mastery) and defines concrete signals for each transition. This is not a subjective assessment — it is based on measurable indicators: corrections per week declining, self-corrections increasing, review severity shifting from basic issues to architectural concerns. This makes agent improvement visible and gives teams a common vocabulary for discussing where their agents are in the growth curve.

### 5-Layer Validation: Catching Failures at Every Stage

The five validation layers (Research, Critique, Code, Statistics, Browser Verification) are designed so that each layer catches failure modes the previous layers miss. Layer 1 catches hallucinated citations and misapplied patterns before implementation begins. Layer 5 catches rendering bugs and navigation failures that pass all code-level tests. No other framework in this comparison has a structured multi-layer validation model built in.
