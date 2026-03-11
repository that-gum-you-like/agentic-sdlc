# Design: SDLC Gap Closure

## Context

The multi-agent SDLC has 15 scripts, 6 agents, and a 5-layer memory system — all hardcoded to LinguaFlow. The infrastructure has never been exercised end-to-end.

## Goals

- Make the SDLC portable to any project via a single config file
- Complete the first real autonomous agent run
- Verify all safety nets, communication channels, and tooling
- Generate real documentation from the codebase

## Non-Goals

- Rewriting agent logic or changing the micro cycle
- Adding new agents or new script capabilities
- Changing the Matrix server configuration

## Decisions

### 1. Portability via `agents/project.json` + `agents/load-config.mjs`

**Chosen approach:** Single JSON config file + shared ESM loader module.

All 15 scripts import `loadConfig()` from `load-config.mjs` instead of using inline hardcoded paths. The loader:
- Reads `project.json` from the same directory
- Falls back to current hardcoded defaults if no config found (backward-compatible)
- Exports `projectDir`, `appDir`, `testCmd`, `agents`, `matrixDomain`, `matrixServer`, `credentialsPath`

**Alternatives considered:**
- Environment variables: Less discoverable, harder to version control
- Monorepo workspace config: Over-engineered for current needs
- `__dirname` relative paths only: Doesn't solve the agent name list duplication

### 2. Autonomous Run via Existing Queue Drainer + Worker

No new infrastructure needed. The existing `queue-drainer.mjs run` + `worker.mjs --agent --task` pipeline is complete — it just needs to be exercised with a real task and real subagent spawn.

### 3. Documentation Generation via Douglas Subagent

Douglas agents will be spawned with `model: haiku` per budget.json. Each Douglas agent reads the actual codebase (services, screens, agents) and generates markdown documentation. No AI hallucination — all counts and references verified against live files.

## Key Architectural Patterns

- **Config-first:** `project.json` is the single source of truth for project-specific values
- **Backward-compatible:** All changes fall back gracefully if `project.json` is missing
- **Test-driven verification:** Every phase has explicit acceptance criteria checked by existing test infrastructure
