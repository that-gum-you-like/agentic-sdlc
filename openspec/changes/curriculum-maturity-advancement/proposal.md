## Why

Our agentic SDLC framework is strong at Levels 1-3 (Foundation through Scale) but stalls at Level 4 (~80%), with Level 5 at ~30% and Level 6 at ~10%. A curriculum review of "Intro to Agents" (foundational) and "Agentic SDLC: Building Software with AI Teams" (advanced) against our actual codebase reveals that while our *documentation* describes a Level 6 system, the *implementation* has critical gaps in feedback loops, human-agent bidirectional collaboration, scaling, cadence management, and self-improvement automation. The framework tells agents to learn but doesn't measure whether they do. It describes cycles but doesn't automate them. It protects code but not the human operator.

Closing these gaps transforms the framework from "well-documented orchestration" to genuinely autonomous, self-improving agent teams — matching and exceeding the curriculum's most mature capabilities.

## What Changes

### Feedback Loops & Self-Improvement (Level 5-6 gaps)
- Add **semantic memory retrieval** via local embeddings so agents search memory by meaning, not file scan
- Add **agent maturation tracking** with measurable milestones (corrections/week declining, self-corrections increasing, critic elevation)
- Add **maturation regression detection** in behavior tests — flag when an agent's error rate increases after previously declining
- Wire **REM sleep deduplication** to use similarity-based matching (catches near-duplicates, not just exact)
- Add **performance feedback** — agents receive their own efficiency metrics (tokens/task, error rate) in their context

### Human-Agent Bidirectional Collaboration (novel — exceeds curriculum)
- Add **human task queue** (`tasks/human-queue/`) — system assigns work TO humans (design decisions, API keys, content, testing)
- Add **Paperclip safeguard / wellness guardrails** — session time tracking, mandatory breaks, burnout alerts via notify.mjs
- Add **bottleneck detection** — alert when human approvals are the limiting factor in throughput

### Scaling & Cadence (Level 3-4 gaps)
- Add **agent instance scaling** — spawn N instances of same agent type for independent work, with conflict detection
- Add **execution cadence** — staggered commit windows, turn-based coordination to prevent merge pileup
- Add **automatic cycle scheduling** — daily review, weekly pattern hunt, monthly audit run on schedule (not manually triggered)

### Validation & Analysis (Level 4 gaps)
- Add **NLP-based semantic code analysis** — property/API near-miss detection using spaCy (local, no cloud)
- Add **structured inter-agent data contracts** — JSON schemas for handoffs, validated in queue-drainer
- Add **formalized agent permission tiers** — per-agent capability levels enforced at framework level

### Documentation & Adoption (cross-cutting)
- Add **framework comparison matrix** — map our concepts to LangGraph/Autogen/CrewAI equivalents
- Add **agent evolution timeline template** — structured 6-week maturation expectation in AGENT.md template

## Value Analysis

**Who benefits:** Any team using the agentic SDLC framework — currently Bryce (LinguaFlow) and future adopters.

**What problem it solves:** The framework documents maturity levels it can't actually deliver. Teams following the docs hit a ceiling at Level 3-4 because the automation, feedback loops, and scaling infrastructure don't exist in code. This makes the framework aspirational rather than operational at higher maturity levels.

**Priority:** High. The framework is the foundation for all project work. Every improvement here multiplies across every project that uses it.

**What happens if we don't build this:** The framework remains a Level 3 system with Level 6 documentation. Agents run but don't measurably improve. Humans remain the bottleneck without the system helping manage their workload. Scaling requires manual coordination.

**Success metrics:**
- Level 5 operational: agents demonstrate measurable improvement over 4-week period (declining correction rate)
- Level 6 operational: behavior tests catch regressions without human intervention, pattern-hunt proposes and agents implement defeat tests autonomously
- Human task queue reduces "agent blocked, human didn't notice" incidents to zero
- Instance scaling enables 3x throughput on independent work batches
- Wellness guardrails prevent >10 hour continuous sessions

## Capabilities

### New Capabilities
- `semantic-memory`: Vector embedding-based memory search replacing linear file scanning. Affects memory-manager.mjs, rem-sleep.mjs, pattern-hunt.mjs
- `human-task-queue`: Bidirectional task assignment — system creates tasks for humans, tracks completion, unblocks dependent agent work
- `wellness-guardrails`: Human operator protection — session time limits, mandatory breaks, burnout detection and alerts
- `instance-scaling`: Spawn multiple instances of same agent type with conflict detection, shared budget caps, and instance-aware coordination
- `execution-cadence`: Staggered commit windows, turn-based coordination, automatic merge conflict prevention
- `agent-maturation`: Measurable maturation milestones, regression detection, efficiency metrics feedback to agents
- `nlp-code-analysis`: Semantic distance analysis for property/API near-miss detection using local NLP (spaCy)
- `data-contracts`: JSON schemas for inter-agent handoffs, validated at queue-drainer and Matrix client
- `permission-tiers`: Per-agent capability levels (read-only → deploy) enforced by queue-drainer and worker
- `cycle-automation`: Scheduled daily/weekly/monthly cycles via cron integration, not manual triggers
- `framework-comparison`: Documentation mapping framework concepts to LangGraph/Autogen/CrewAI/Swarm equivalents

### Modified Capabilities
(none — no existing specs in openspec/specs/ to modify)

## Impact

### Scripts Modified
- `agents/memory-manager.mjs` — add semantic search, maturation tracking
- `agents/rem-sleep.mjs` — similarity-based deduplication
- `agents/pattern-hunt.mjs` — semantic categorization, NLP analysis integration
- `agents/four-layer-validate.mjs` — add NLP layer, data contract validation
- `agents/test-behavior.mjs` — maturation regression checks, permission tier validation
- `agents/queue-drainer.mjs` — instance scaling, cadence enforcement, human task routing, permission enforcement
- `agents/worker.mjs` — instance ID injection, permission mode injection, efficiency metrics
- `agents/cost-tracker.mjs` — wall-clock tracking, human hours, wellness monitoring
- `agents/notify.mjs` — wellness alerts, human task creation, bottleneck detection
- `agents/cycles/daily-review.mjs` — maturation metrics, automated scheduling
- `agents/cycles/weekly-review.mjs` — automated scheduling

### New Scripts
- `agents/semantic-index.mjs` — build/query vector index over agent memories
- `agents/nlp-analyzer.mjs` — spaCy-based semantic code analysis
- `agents/cadence-scheduler.mjs` — execution window management and stagger logic

### New Files
- `agents/schemas/*.json` — JSON schemas for inter-agent data contracts
- `agents/templates/human-task.json.template` — human task queue entry template
- `agents/templates/maturation-milestones.json.template` — agent maturation tracking template
- `docs/comparison.md` — framework comparison matrix
- `framework/evolution-timeline.md` — structured agent maturation timeline

### Config Changes
- `project.json` — new fields: `humanHours`, `cadence`, `instanceScaling`
- `budget.json` — new fields per agent: `maxInstances`, `permissions`

### Dependencies
- spaCy (local Python NLP — no cloud API)
- Local embedding model for semantic memory (e.g., sentence-transformers or Anthropic embeddings)
- No OpenAI dependencies (privacy requirement)
