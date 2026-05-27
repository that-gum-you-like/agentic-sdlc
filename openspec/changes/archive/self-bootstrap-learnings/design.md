## Context

All 10 issues were discovered in a single session by building 4 OpenSpec changes, running the onboarding walkthrough, and bootstrapping the framework on itself. They represent the gap between "methodology as documented" and "methodology as practiced."

## Goals / Non-Goals

**Goals:**
- Fix all 10 systemic issues discovered during self-bootstrap
- Every fix makes the framework more reliable for ALL projects, not just the framework repo
- Backward compatible — existing projects work without changes

**Non-Goals:**
- Full adapter migration of all 24 scripts (only queue-drainer in this change; others follow incrementally)
- Adding `js-yaml` as a dependency (document the subset instead)
- Rewriting the memory system (add summarization layer, not a new architecture)

## Decisions

### D1: CLI guard is a defeat test, not a linter rule
The CLI guard scan runs as part of `four-layer-validate.mjs` — the same tool that catches `:any` types and `console.log`. This means it runs in the same CI step and follows the same allowlist pattern. No new tooling.

### D2: CI pipeline is minimal — 2 jobs
Job 1: unit tests. Job 2: behavior tests (framework mode). No deploy, no build artifact. Node.js 18 + 20 matrix. Runs on push to main and on PRs.

### D3: Adapter migration is internal refactor, not API change
Queue-drainer's public CLI interface doesn't change. Internally, `loadTasks()` calls `adapter.loadTasks(TASKS_DIR)` instead of `readdirSync`. The file-based adapter does the same thing — this is provably identical behavior.

### D4: Memory summarization is a recall-time operation, not write-time
Memory entries stay full-fidelity in JSON files. Summarization happens when `memory-manager.mjs recall` is called and total tokens exceed the budget. This means no data loss — full memory is always on disk.

### D5: Behavior test split uses a flag, not separate files
One file (`test-behavior.mjs`), two modes (`--framework`, `--project`). Default runs both. This avoids maintaining two test files that can diverge.

### D6: Done checklist reads from project.json at runtime
Not a new file — `project.json` gains a `doneChecklist` array. The CLAUDE.md section and agent templates reference it. If absent, defaults to the full app checklist for backward compatibility.

## Risks / Trade-offs

- **[Risk] Queue-drainer adapter refactor breaks something** → Mitigation: Integration test proves identical output. File-based adapter is a line-by-line extraction of existing code.
- **[Risk] Memory summarization loses important context** → Mitigation: Core.json failures are always returned in full. Summarization only affects medium-term and older entries.
- **[Risk] CLI guard defeat test has false positives** → Mitigation: Allowlist for scripts that intentionally have CLI entry points without exports (pure CLI tools).
