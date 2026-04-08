# Proposal: infrastructure-hardening

**Date**: 2026-04-08
**Author**: Claude
**Status**: proposed

---

## Discovery

- **Files examined**: Root directory (no package.json, no .env*, no lock file), all `agents/*.mjs` imports (100% Node builtins — zero npm dependencies), `agents/adapters/llm/*.mjs` (6 adapters, each references 1 env var), `setup.mjs` (also pure builtins)
- **Existing patterns**: The framework is intentionally zero-dependency for portability. All 40+ scripts use only Node.js builtins (fs, path, child_process, url, readline, crypto). This is a feature, not a bug — it means `git clone` + `node` works everywhere.
- **Key findings**: 13 environment variables referenced across the codebase. No .env.example documenting them. No package.json means `npm audit` can't run. The maturity assessment scored 0/5 on Dependency Health and 1.5/5 on Security because of these gaps. But the fix must NOT break the zero-dependency architecture.

---

## Problem

The maturity assessment identified 3 infrastructure gaps:
1. **No package.json** — tools expecting npm projects (audit, outdated, CI caching) can't work
2. **No .env.example** — users discover required env vars by hitting errors at runtime
3. **No lock file** — follows from no package.json

These are real gaps, but they're also traps. A careless fix (adding npm dependencies, creating a complex build step) would destroy the framework's core strength: `git clone && node setup.mjs` works everywhere with zero install step.

---

## Proposed Solution — 4 Targeted, Isolated Changes

Each change is independently deployable and independently revertable. None depend on each other. None add npm dependencies.

### Change 1: Add minimal package.json (zero dependencies)
- `package.json` with `"type": "module"`, `"name"`, `"version"`, `"description"`, `"license"`, `"engines"` (Node ≥ 18)
- **Zero `dependencies` and zero `devDependencies`** — this is a manifest, not a dependency tree
- Enables: `npm audit` (reports no vulnerabilities since no deps), `npm outdated` (reports nothing), `node --check` via npm scripts
- **Risk**: Near zero. A package.json with no deps changes nothing about how scripts run
- **Revert**: `git rm package.json`

### Change 2: Add .env.example documenting all 13 env vars
- One file listing every `process.env.X` the framework reads, grouped by purpose, with comments
- **No actual values** — just names and descriptions
- **Risk**: Zero. Informational file only
- **Revert**: `git rm .env.example`

### Change 3: Add npm scripts as convenience aliases
- `"scripts"` in package.json: `"test"`, `"assess"`, `"models"`, `"check"` pointing to existing scripts
- Users can run `npm test` instead of `node tests/adapter-and-model-manager.test.mjs`
- **Risk**: Near zero. Scripts already exist; these are aliases
- **Revert**: Remove the `"scripts"` block from package.json

### Change 4: Update maturity-assess.mjs to handle zero-dep projects correctly
- Dependency Health should not score 0/5 for a project that intentionally has no dependencies
- Add detection: if package.json exists with empty deps, score based on "zero-dep by design" rather than "missing manifest"
- **Risk**: Low. Assessment logic only, no project modifications
- **Revert**: Revert the function change

---

## Value Analysis

### Benefits
- Maturity score jumps from 3.1 → ~3.8 with honest scoring
- New users discover env vars from .env.example instead of runtime errors
- `npm test` works as a universal entry point
- CI can cache based on package.json
- npm ecosystem tools (audit, outdated) work if the user adds deps later

### Costs
- **Effort**: Small — 4 files, each < 30 lines
- **Risk**: Near zero — no behavioral changes to any script
- **Dependencies added**: **ZERO** — this is critical

### Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Add actual npm dependencies (e.g., js-yaml, dotenv) | Destroys the zero-install portability |
| Add a build step | Over-engineering for a pure-script framework |
| Do nothing | Assessment correctly identifies real gaps that affect adoption |

### Decision
Yes — targeted, isolated, zero-dependency additions that close real gaps without compromising portability.

---

## Scope

### In Scope
- package.json (manifest only, zero deps)
- .env.example (all 13 vars documented)
- npm script aliases
- Assessment scoring fix for zero-dep projects

### Out of Scope
- Adding any npm dependencies
- Adding a build step or bundler
- Changing how any existing script runs
- Lock file (no deps = no lock file needed)
