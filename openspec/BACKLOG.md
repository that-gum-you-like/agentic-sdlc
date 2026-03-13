# OpenSpec Backlog

Potential ideas and future proposals for the agentic SDLC framework. Items here are candidates for `openspec-new-change` — they have not yet been proposed, designed, or specced. When an idea is promoted to a full openspec change, remove it from this list and link to the change directory.

---

## Ideas from Curriculum Review (2026-03-13)

Source: "Intro to Agents: 1-Day Intensive" course material — foundational agent patterns evaluated against our framework.

### 1. Semantic Memory Retrieval (RAG for Agent Memory)

**Problem:** Our 5-layer memory system (core → long-term → medium-term → recent → compost) uses file-based JSON with linear scanning. When an agent recalls memory, it reads entire files. As memory grows, relevant entries get buried in noise, and pattern-hunt must scan all reviews linearly.

**Idea:** Add vector embeddings over memory entries, past reviews, case studies, and failure memories. Agents would semantically search memory ("find past failures related to silent fallbacks") instead of reading everything. Pattern-hunt could cluster similar issues automatically rather than counting string-match recurrences.

**What it would improve:**
- `memory-manager.mjs` recall becomes semantic search instead of full-file read
- `pattern-hunt.mjs` groups issues by meaning, not just category string
- `rem-sleep.mjs` deduplication becomes similarity-based (catches near-duplicates)
- Agent context windows stay lean — retrieve only what's relevant

**Complexity:** Medium-high. Requires embedding generation (could use Anthropic or local model), a lightweight vector store (FAISS or SQLite + vector extension), and changes to memory-manager, pattern-hunt, and rem-sleep scripts.

**Privacy note:** Must use local/self-hosted embedding model or Anthropic — no OpenAI.

---

### 2. Formalized Agent Permission Tiers

**Problem:** Our agents have implicit trust levels — Richmond reviews commits, the human-approval-layer gates destructive actions — but there's no explicit permission model per agent. Any agent with Claude Code access can technically read, write, and execute anything. The curriculum's "permission modes" concept (default → plan → acceptEdits → bypassPermissions) maps well to different agent roles.

**Idea:** Add a `permissions` field to `budget.json` (or a new `permissions.json`) that defines per-agent capability tiers:
- **read-only**: Can read files, search, analyze (e.g., Richmond during review)
- **edit-gated**: Can read + propose edits, but edits require review approval (e.g., new/untrusted agents)
- **full-edit**: Can read + write + run tests, but not deploy (e.g., Roy, Moss, Jen during implementation)
- **deploy**: Can trigger deploy pipeline (e.g., Denholm during release)

**What it would improve:**
- Principle of least privilege enforced at framework level
- New agents start restricted, earn trust via behavior tests
- Reduces blast radius of agent errors
- Maps cleanly to Claude Agent SDK permission modes for future SDK integration

**Complexity:** Low-medium. Mostly config + queue-drainer enforcement. Worker.mjs would pass permission mode to subagent spawn options.

---

### 3. Structured Inter-Agent Data Contracts

**Problem:** Our `handoff-template.md` defines a markdown format for code review handoffs, and Matrix messages between agents are free-form text. When Agent A hands off to Agent B, the data format is loosely defined. The curriculum emphasizes JSON schemas for inter-agent communication to prevent data loss during handoffs.

**Idea:** Define typed JSON schemas for each handoff type:
- **task-claim**: `{ taskId, agentName, claimedAt, estimatedTokens }`
- **task-complete**: `{ taskId, agentName, filesChanged[], testsPassed, testsFailed, commitHash, learnings[] }`
- **review-request**: `{ taskId, commitHash, filesChanged[], summary, questions[], riskLevel }`
- **review-result**: `{ taskId, approved, issues[], suggestions[], mustFix[] }`
- **deploy-request**: `{ commitHash, testsPassedCount, browserE2EPassed, changeDescription }`

Store schemas in `agents/schemas/` and validate in queue-drainer and Matrix client.

**What it would improve:**
- Eliminates ambiguity in agent-to-agent communication
- Enables automated validation of handoffs (reject malformed ones)
- Makes Matrix messages machine-parseable for analytics
- Pattern-hunt can mine structured review data more precisely

**Complexity:** Medium. Schema definitions are straightforward. Enforcement requires changes to queue-drainer, worker, review-hook, and matrix-cli.

---

### 4. Framework Portability Comparison Matrix

**Problem:** Our `docs/portability-guide.md` explains how to customize the framework (rename agents, swap tools), but doesn't position the framework relative to other agent orchestration approaches. Teams evaluating our framework vs. LangGraph, Autogen, CrewAI, or Claude Agent SDK don't have a clear comparison.

**Idea:** Add a comparison section to the portability guide (or a standalone `docs/comparison.md`) that maps our framework's concepts to equivalent features in other systems:
- Our task queue ↔ LangGraph state graph / Autogen GroupChat
- Our AGENT.md ↔ Autogen AssistantAgent system_message / CrewAI Agent role
- Our domains.json routing ↔ LangGraph conditional edges / Swarm handoff functions
- Our memory layers ↔ LangGraph checkpoints / Autogen memory
- Our micro cycle ↔ ReACT loop with test gates
- Our OpenSpec ↔ no equivalent (unique to our framework)

**What it would improve:**
- Helps new adopters understand the framework faster by mapping to known concepts
- Clarifies what's unique about our approach (OpenSpec, defeat tests, memory consolidation)
- Aids framework selection decisions for teams

**Complexity:** Low. Documentation only — no code changes.

---

## Ideas from Agentic SDLC Course Review (2026-03-13)

Source: "Agentic SDLC: Building Software with AI Teams" course material (7-hour workshop format) — evaluated against our framework. Focus on mature components: human wellness safeguards, human task assignment, agent scaling, execution cadence, NLP analysis, and evolution timelines.

### 5. The Paperclip Safeguard — Human Wellness Guardrails

**Problem:** Our framework has robust token budgets, conservation mode, and circuit breakers for *agents*. But there are zero safeguards for the *human operator*. The curriculum explicitly warns about "the diarrhea phase" — manic overbuilding when execution capability suddenly unblocks years of backlogged ideas. This is a real risk for operators with ADHD, bipolar tendencies, or hyperfocus patterns. Our framework can accidentally enable unsustainable human behavior by being too effective.

**Idea:** Add a human-facing wellness layer to the framework:
- **Session time tracking** in `cost-tracker.mjs` — track wall-clock hours per day, not just tokens
- **Hard time boundaries** — configurable in `project.json` (e.g., `"humanHours": { "dailyMax": 8, "nightCutoff": "23:00", "weekendMode": "reduced" }`)
- **Wellness alerts** via notify.mjs — "You've been running agents for 14 hours straight. The projects will be there tomorrow."
- **Mandatory breaks** — after N hours of continuous agent activity, system pauses the queue and sends a notification
- **Weekly human-hours report** in daily-review.mjs output

**What it would improve:**
- Prevents operator burnout, which is the #1 risk to any long-running agent operation
- Makes the framework sustainable, not just powerful
- Adds a maturity indicator — mature systems protect their operators, not just their code
- Differentiates our framework from others that optimize only for throughput

**Complexity:** Low-medium. Timer logic in cost-tracker, new config fields in project.json, notify.mjs integration. No architectural changes.

**Why this matters (from curriculum):** "The goal isn't to work 10x longer because you can. The goal is to work 10x faster in focused bursts, then stop and do something else with your life."

---

### 6. Human Task Assignment — The System Assigns Work TO Humans

**Problem:** Our framework flows one direction: human creates tasks → agents execute. The PM Dashboard is passive — humans must check it. The curriculum describes a bidirectional model where the *system* can assign tasks to humans: requesting decisions, flagging items that need human creativity, escalating blocked work. Our approval layer (`notify.mjs approve`) is close but limited to yes/no gates.

**Idea:** Add a `human-tasks` queue alongside the agent task queue:
- **`tasks/human-queue/*.json`** — tasks that require human action (design decisions, content creation, external API key setup, vendor negotiations, user testing)
- **Auto-generated human tasks** — when agents hit blockers that can't be resolved autonomously (e.g., "need brand colors", "need API credentials", "need product decision on feature scope"), they create a human-task instead of just flagging blocked
- **Mobile-friendly notifications** — human tasks pushed via WhatsApp/notify.mjs with clear action items and deadlines
- **Human task completion** — human marks done via WhatsApp reply or file edit, unblocks dependent agent tasks automatically
- **PM Dashboard active view** — dashboard shows "YOUR action items" prominently, not just agent status

**What it would improve:**
- Eliminates the "agent blocked, human didn't notice for 3 days" failure mode
- Makes human-in-the-loop explicit and trackable, not implicit and forgotten
- Enables true asynchronous collaboration — human does their part when available, agents pick up immediately
- Turns the PM Dashboard from a status board into a task assignment system

**Complexity:** Medium. New queue type in queue-drainer, notify.mjs integration, dashboard template update. Worker.mjs needs a "create human task" action when blocked.

---

### 7. Agent Instance Scaling — Multiple Instances of Same Agent Type

**Problem:** Our framework assumes 1 instance per agent role (1 Roy, 1 Moss, 1 Jen). The curriculum explicitly covers spawning "5 Roy instances working simultaneously" on independent features. Our queue-drainer routes tasks to agent *types* but doesn't support parallel instances of the same type, which limits throughput on large batches of independent work.

**Idea:** Add instance scaling to the queue-drainer:
- **`maxInstances` field in budget.json** per agent (e.g., `"roy": { "maxInstances": 5, "dailyTokenLimit": 100000 }`)
- **Instance-aware claiming** — task claims include instance ID (e.g., `roy-1`, `roy-2`), budget tracked per-instance but capped per-type
- **Conflict detection** — before spawning a second instance, check that claimed tasks don't touch overlapping file patterns (using domains.json)
- **Instance coordination** — instances of same type share a Matrix subchannel (e.g., `#backend-pool`) to avoid stepping on each other
- **Auto-scale triggers** — when queue depth for a domain exceeds N unblocked tasks, suggest scaling up

**What it would improve:**
- Dramatically increases throughput for independent work batches
- Enables overnight runs to clear large backlogs
- Maintains safety via conflict detection and shared budget caps
- Maps to the curriculum's "video game character" metaphor — spawn as many as needed

**Complexity:** Medium-high. Queue-drainer needs instance tracking, budget.json schema change, worker.mjs needs instance ID injection into agent prompts ("You are Roy instance 3 of 5, working alongside other Roy instances").

**Key insight from curriculum:** "One agent doing 5 related features in sequence often beats 5 agents stepping on each other." The scaling logic must enforce this — only scale when work is truly independent.

---

### 8. Execution Cadence Design — Staggered Timing and Turn-Based Coordination

**Problem:** Our queue-drainer assigns tasks based on availability and priority but doesn't manage *timing*. The curriculum describes 15-minute stagger offsets between agents to minimize merge conflicts, and a 30-minute turn-based system where agents check messages, respond, and post updates in rhythm. Without explicit cadence, agents can pile up commits simultaneously, causing merge hell.

**Idea:** Add execution cadence to `project.json` and queue-drainer:
- **Stagger offsets** — `"cadence": { "staggerMinutes": 15 }` — when spawning multiple agents, offset their start times
- **Turn-based coordination** — agents commit at their assigned time slot, not whenever they finish. If Roy's slot is :00 and :30, Jen's is :15 and :45, they naturally avoid simultaneous commits
- **Commit windows** — queue-drainer enforces "commit only during your window" to prevent pileup
- **Turn logging** — track which agents committed in which windows for conflict analysis

**What it would improve:**
- Reduces merge conflicts from parallel work (currently our biggest pain point at scale)
- Creates predictable commit cadence for human reviewers
- Release manager (Denholm) can plan merge sequences around known windows
- Makes overnight runs more orderly

**Complexity:** Low-medium. Mostly scheduling logic in queue-drainer and worker launch timing. No deep architectural change.

---

### 9. NLP-Based Code Analysis — Semantic Distance for Property/API Misuse Detection

**Problem:** Our `ast-analyzer.mjs` does TypeScript AST-level analysis (structural), and defeat tests catch pattern-matched anti-patterns. But neither catches *semantic near-misses* — when an agent uses `user.fullName` but the object has `user.full_name`, or calls `api.getUsers()` when the actual method is `api.fetchUsers()`. The curriculum describes using spaCy/word2vec for semantic distance analysis to catch these.

**Idea:** Add a semantic analysis layer to four-layer-validate:
- **Property access validation** — extract all property accesses from changed files, compare against actual type definitions using semantic similarity (not just exact match)
- **API call validation** — verify method calls exist on their targets, suggest corrections for near-misses
- **"Did you mean?" suggestions** — when semantic distance is close but not exact, flag as warning with suggestion
- **Integration with Layer 1 (Research)** — catch hallucinated APIs/properties before code review

**What it would improve:**
- Catches a class of bugs that AST analysis misses (structurally valid but semantically wrong)
- Reduces "it looked right" errors that pass code review because the method name was plausible
- Particularly valuable for agents working with unfamiliar codebases or large APIs

**Complexity:** Medium-high. Requires NLP model (spaCy or local embedding model — NOT OpenAI). Could start simple with edit-distance before graduating to full semantic similarity.

**Privacy note:** Must use local NLP model (spaCy runs locally). No cloud API calls for code analysis.

---

### 10. Agent Evolution Timeline — Structured Maturation Framework

**Problem:** Our framework has agent versioning and memory migration, but no explicit *expected timeline* for agent maturation. The curriculum describes a concrete week-by-week progression: Week 1 (mistakes) → Week 2 (corrections → checklist) → Week 3 (memory of corrections) → Week 4 (self-correction) → Week 5 (critic shifts to higher-level review) → Week 6 (new patterns emerge, cycle repeats). Without this, we don't know if an agent is maturing on schedule or stalling.

**Idea:** Add maturation tracking to agent memory and behavior tests:
- **Maturation milestones** in `core.json` — `{ "maturationLevel": 3, "weekStarted": "2026-03-01", "milestonesHit": ["first-correction", "first-self-correction", "critic-elevation"] }`
- **Expected timeline** in AGENT.md template — document the 6-week cycle so agents and reviewers know what to expect
- **Maturation metrics** — track: corrections received per week (should decrease), self-corrections per week (should increase), review severity (should shift from basic → higher-level)
- **Behavior test: maturation regression** — flag if an agent's correction rate increases after previously decreasing (regression in learned behavior)
- **Dashboard widget** — show agent maturation status in PM Dashboard

**What it would improve:**
- Makes agent improvement measurable, not anecdotal
- Identifies agents that are stalling (not learning from corrections)
- Provides data for when to version-bump agents (milestone-driven, not time-driven)
- Gives the human operator confidence that the system is actually improving

**Complexity:** Medium. Metrics tracking in memory-manager, new behavior test checks, dashboard template update. Most of the logic is in `daily-review.mjs` and `pattern-hunt.mjs` analysis.

---

## Backlog Management

- **To promote an idea**: Run `openspec-new-change` with the idea as the basis for the proposal
- **To reject an idea**: Move it to the "Rejected" section below with a reason
- **To defer an idea**: Leave it here — backlog items have no deadline

## Rejected

(none yet)
