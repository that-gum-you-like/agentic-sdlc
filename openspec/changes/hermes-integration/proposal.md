# Proposal: hermes-integration

**Date**: 2026-07-04
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

Bryce runs the **Hermes** agent CLI (`~/.hermes/`, a full tool-calling agent framework) alongside this agentic-sdlc repo and Claude Code. A set of advanced capability "workshops" was built as **Hermes skills** — `constitutional-ai-engineer`, `context-engineering-master`, `hierarchical-memory-architect`, `oodle-12factor-agent`, `rag-specialist`, `token-embedding-analyzer` — but they live only in Hermes' local skill store. They are invisible to this framework's agent-routing, execution-template roster, and OpenSpec workflow.

A hand-off guide ("Connecting Hermes ↔ GitHub & Using Claude with Your Forked Agentic-SDLC Repo") describes these capabilities *as if they already exist in the repo* — as `agents/templates/execution-agents/*.md` templates, as cron scripts (`red-team-tester.mjs`, `rag-indexer.mjs`, `health-check.mjs`, `telegram-notify.mjs`, `document-sync.mjs`), and as `docs/claude-quickstart.md`. **None of those repo artifacts exist.** The guide also instructs Bryce to *fork his own repo* and set up a PAT, both of which are unnecessary: he owns `that-gum-you-like/agentic-sdlc` (cloned at `~/agentic-sdlc`, `origin` already correct) and `gh` is already authenticated with `repo` + `workflow` scopes.

The result is a documentation/reality gap: the framework claims capabilities it can't route to, and a new operator following the guide hits missing files. This change closes the gap by **porting the Hermes-side capabilities into first-class repo artifacts** and writing accurate onboarding.

---

## Discovery

- **Source material (Hermes skills, on disk):**
  - `~/.hermes/skills/constitutional-ai-engineer/SKILL.md`
  - `~/.hermes/skills/context-engineering-master/SKILL.md`
  - `~/.hermes/skills/hierarchical-memory-architect/SKILL.md`
  - `~/.hermes/skills/oodle-12factor-agent/SKILL.md`
  - `~/.hermes/skills/rag-specialist/SKILL.md`
  - `~/.hermes/skills/token-embedding-analyzer/SKILL.md`
- **Existing patterns to match:**
  - Execution-agent templates — `agents/templates/execution-agents/*.md` — YAML frontmatter (`role_keywords`, `archetype`, `template_type: addendum`, `default_patterns`, `capabilities`) + markdown operating rules. See `research-agent.md` for the canonical shape.
  - Cron/automation scripts — `agents/*.mjs` — `#!/usr/bin/env node`, JSDoc usage header, ESM stdlib-only imports, `loadConfig()` from `load-config.mjs`, `logCapabilityUsage()` from `capability-logger.mjs`, and a `__isMainModule` guard so importing the module triggers no CLI side effects (enforced by `four-layer-validate.mjs` Layer 5).
  - Notification providers — `agents/notify.mjs` already abstracts a pluggable channel (`openclaw` / `file` / `none`); a Telegram channel slots into the same shape.
  - Semantic memory — `agents/memory-manager.mjs` already shells out to local `sentence-transformers` when installed and falls back to full recall; `rag-indexer.mjs` / `document-sync.mjs` must follow the same optional-python, zero-npm-dep posture.
- **Constraints:**
  - **Zero npm dependencies** (framework rule). Embeddings via optional local python only, with graceful fallback.
  - Every script ships with a test (non-negotiable rule #1).
  - Scripts that export functions MUST guard the CLI entry point with `__isMainModule` (non-negotiable rule #9).
  - Templates changing behavior must pass `test-behavior.mjs`.
  - Privacy-first (Bryce): no OpenAI, no third party that sells data to governments. Telegram bot API is opt-in and self-configured; no always-on listening.

---

## Proposed Solution

Three workstreams, one OpenSpec change:

1. **Port 6 Hermes skills → execution-agent templates** (`agents/templates/execution-agents/`): `constitutional-ai-engineer.md`, `context-engineering-master.md`, `memory-architect.md`, `twelve-factor-agent.md`, `rag-specialist.md`, `token-embedding-analyzer.md`. Each faithfully distills its source `SKILL.md` into the repo's addendum-template format, with `role_keywords` that make it routable and `capabilities` blocks that match reality.

2. **Author the 5 missing cron scripts** (`agents/`): `red-team-tester.mjs` (adversarial prompt-injection / alignment scan over agent outputs), `rag-indexer.mjs` (build a local semantic index of docs + memory), `health-check.mjs` (queue / budget / disk / cron liveness → report + notify on failure), `telegram-notify.mjs` (Telegram notification channel with parity to `notify.mjs`), `document-sync.mjs` (version + embed the knowledge docs). All stdlib-only, `__isMainModule`-guarded, each with a test.

3. **Write accurate onboarding docs** (`docs/`): `claude-quickstart.md` (no-fork reality, existing `gh` auth, OpenSpec-first micro cycle, backlog/queue workflow) and `hermes-backlog-bridge.md` (how the ported skills, cron scripts, and the OpenSpec backlog/queue map onto Hermes ↔ Claude co-operation).

The BACKLOG.md and README get pointers to the new artifacts. Existing behavior is unchanged — everything here is additive.

---

## Value Analysis

- **Closes a correctness gap in the framework's self-description.** Agent-routing and the execution-template table now match what actually exists; a new operator following the onboarding guide no longer hits missing files.
- **Makes 6 already-built capabilities usable by *this* framework**, not just Hermes — routable, model-tiered via `budget.json`, and testable via `test-behavior.mjs`.
- **Fills the autonomous-operation gaps** (health, red-team, RAG index, doc sync, notification parity) that the maturity model's Automation/Quality levels assume.
- **Corrects unsafe/unnecessary guidance** (fork-your-own-repo, PAT-to-Claude) with the secure path already in place (`gh` OAuth, no raw tokens exposed).
- **Cost:** L. ~13 net-new files (6 templates, 5 scripts + 5 tests, 2 docs), all additive, zero deps. Risk low — no existing code paths modified.
