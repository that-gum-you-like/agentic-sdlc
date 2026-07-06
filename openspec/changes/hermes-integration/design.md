# Design: hermes-integration

**Date**: 2026-07-04
**Status**: design

---

## Context

Hermes and this agentic-sdlc framework are two agent runtimes over the same repo. Hermes carries the advanced "workshop" capabilities as local skills; this framework carries the multi-agent SDLC machinery (routing, queue, budget, memory, validation). Claude Code is a third operator. The three coordinate through repo artifacts — templates, cron scripts, the OpenSpec backlog, and the task queue — not through a shared process. This change makes the Hermes-side capabilities legible to the repo so all three runtimes share one source of truth.

The porting is a **translation**, not a copy: a Hermes `SKILL.md` is a self-contained skill prompt; a repo execution-agent template is an *addendum* that layers role-specific rules onto the base agent prompt and is selected by `role_keywords` / `default_patterns`. The distillation keeps the operating rules, cycle, and failure-mode wisdom; it drops Hermes-runtime-specific invocation syntax.

---

## Goals

- Six routable execution-agent templates, each a faithful distillation of its source Hermes skill, valid against the existing frontmatter schema.
- Five stdlib-only cron scripts matching framework conventions, each importable without side effects and each tested.
- Two accurate onboarding docs that replace the incorrect fork/PAT guidance with the real (already-working) setup.
- Everything additive; `npm test`, `four-layer-validate.mjs`, and `test-behavior.mjs` stay green.

## Non-Goals

- No changes to Hermes itself or its skill store.
- No new npm dependencies. Embeddings remain optional-python with graceful fallback.
- No always-on listeners or cloud data egress. Telegram is opt-in, config-gated.
- Not wiring the new cron scripts into a live scheduler in this change — that's a follow-up once each is verified in a dry run.

---

## Design

### 1. Skill → template port

Each template file `agents/templates/execution-agents/<name>.md` has the standard frontmatter:

```yaml
---
role_keywords: [...]          # what routes work here
archetype: "<name>"
template_type: "addendum"
default_patterns: [...]       # file globs that trigger this agent
capabilities:
  required: [...]
  conditional: { <cap>: "when <condition>" }
  notExpected: [...]
---
```

followed by: Domain · Operating Cycle · Non-Negotiable Rules · Quality Patterns · Known Failure Patterns (`No failures documented yet — this agent starts at maturation level 0.`) · Boundary. Name mapping:

| Source Hermes skill | Repo template | role_keywords (indicative) |
|---|---|---|
| `constitutional-ai-engineer` | `constitutional-ai-engineer.md` | constitution, self-critique, alignment, red-team |
| `context-engineering-master` | `context-engineering-master.md` | context, prompt, window, compaction |
| `hierarchical-memory-architect` | `memory-architect.md` | memory, retention, consolidation, recall |
| `oodle-12factor-agent` | `twelve-factor-agent.md` | twelve-factor, stateless, config, deploy |
| `rag-specialist` | `rag-specialist.md` | rag, retrieval, embedding, rerank, chunk |
| `token-embedding-analyzer` | `token-embedding-analyzer.md` | token, embedding, tokenizer, vector |

`capabilities.required` uses only capabilities the framework already tracks (`memoryRecall`, `memoryRecord`, `costTracking`, `semanticSearch`, etc.); RAG/embedding/memory templates mark `semanticSearch: "when sentence-transformers installed"` as conditional.

### 2. Cron scripts

Shared skeleton (matches `alignment-monitor.mjs`):

```javascript
#!/usr/bin/env node
/** <name> — one-line purpose. Usage: node ~/agentic-sdlc/agents/<name>.mjs [--flags] */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const __filename = fileURLToPath(import.meta.url);
export function run(opts = {}) { /* pure-ish core, returns a result object */ }
function __isMainModule() { return process.argv[1] && resolve(process.argv[1]) === __filename; }
if (__isMainModule()) { /* parse argv, call run(), print, logCapabilityUsage() */ }
```

- **`red-team-tester.mjs`** — scans recent agent outputs / AGENT.md prompts for prompt-injection and alignment-bypass patterns (a rule set: instruction-override phrases, exfiltration asks, tool-abuse, jailbreak markers). Emits a report to `pm/red-team-reports/` and returns findings; `--notify` routes high-severity findings through `notify.mjs`.
- **`rag-indexer.mjs`** — walks `docs/`, `openspec/`, and agent `memory/`, chunks text, and writes a local index to `pm/rag-index/`. Uses local `sentence-transformers` (via the same python bridge `memory-manager.mjs` uses) when available; falls back to a deterministic lexical (BM25-ish) index otherwise. Zero npm deps.
- **`health-check.mjs`** — checks queue depth, per-agent budget headroom (`budget.json`), disk free, and cron liveness; returns a health object with `ok|degraded|down` and reasons; `--notify` alerts on non-ok.
- **`telegram-notify.mjs`** — sends a message via the Telegram Bot API using stdlib `https` only. Reads bot token + chat id from env/config (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`); no-ops with a clear message when unconfigured. Designed to be registered as a `notify.mjs` channel later.
- **`document-sync.mjs`** — computes content hashes for knowledge docs, records versions in `pm/doc-versions.json`, and (when the index exists) marks changed docs for re-indexing by `rag-indexer.mjs`. The "version-controlled, embedding-first knowledge base" primitive.

Each returns a plain object from its exported `run()` so tests can assert without spawning a process.

### 3. Tests

`tests/hermes-integration.test.mjs` (node:test) imports each script's `run()`/pure helpers and asserts: importing triggers no stdout/exit (side-effect-free), the return shape is correct, `OTEL_DISABLED`-style no-op env flags are honored (`TELEGRAM` unconfigured → no-op), and the RAG indexer degrades gracefully with no python. Templates are covered by `test-behavior.mjs` (frontmatter + prompt-quality) which runs in the suite.

### 4. Docs

- **`docs/claude-quickstart.md`** — corrected onboarding: you own the repo (no fork); `gh` is already authed (no PAT); every change goes through OpenSpec; work is pulled from `openspec/BACKLOG.md` and `tasks/queue/`; the micro cycle; how to run the new cron scripts.
- **`docs/hermes-backlog-bridge.md`** — the coordination model: which capabilities live as Hermes skills vs repo templates, how the backlog/queue is the shared work ledger, and the hand-off pattern between Hermes, Claude Code, and the autonomous launcher.

`README.md` and `openspec/BACKLOG.md` get one-line pointers to the new docs and templates.

---

## Addendum (2026-07-05): Integration completeness

A completeness review found that Workstreams A–C created the artifacts and pointed the two *new* Hermes docs at them, but did not register them in the framework's **canonical registries** — so per the framework's own rules the templates were unroutable and the scripts undiscoverable, contradicting this change's own Value Analysis claim that "agent-routing and the execution-template table now match what actually exists." Two items originally listed under Non-Goals are therefore promoted into scope. Workstream D (see `tasks.md`, spec `registry-integration.md`) closes them.

**Non-Goals updated:**
- ~~"Not wiring Telegram as a `notify.mjs` channel — that's later."~~ → **In scope.** Telegram becomes a first-class `notification.provider`. Integration mirrors `sendViaOpenclaw`: a synchronous `sendViaTelegram()` shells out to the already-tested `telegram-notify.mjs` CLI, preserving `sendNotification()`'s synchronous boolean contract (no async ripple through its ~9 call sites).
- ~~"Templates/scripts present on disk is sufficient."~~ → **In scope.** Every roster/routing/script/schedule registry that enumerates these artifacts is updated, with counts kept consistent.

**Still a Non-Goal:** standing up a live scheduler daemon. Cron cadence is expressed the same way the rest of the repo expresses it — OpenClaw cron one-liners in `iteration-cycles.md` plus entries in `cron-schedule.json.template`. Registration ≠ activation; the operator still opts in by adding the cron job.

**Registry surface (the integration checklist):**
- Templates → `CLAUDE.md`, `docs/appendix/agent-system.md`, `docs/execution-agents.md`, `framework/agent-routing.md`, `README.md`
- Scripts → `docs/appendix/script-reference.md`, `docs/appendix/iteration-cycles.md`, `agents/templates/cron-schedule.json.template`
- Telegram channel → `agents/notify.mjs` (switch + status), `CLAUDE.md` §Notification
