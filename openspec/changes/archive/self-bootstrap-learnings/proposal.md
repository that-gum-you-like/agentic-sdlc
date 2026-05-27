## Why

Bootstrapping the agentic-sdlc framework on itself revealed 10 process and architecture gaps that affect every project using the framework. These aren't theoretical — they were discovered by actually using the methodology end-to-end in a single session: 4 OpenSpec changes, 6 commits, 6,700+ lines of code, and a full onboarding walkthrough. Every issue below was encountered firsthand.

The gaps range from systemic (CLI scripts that break when imported) to architectural (adapter layer declared but not wired) to process (micro cycle doesn't fit documentation work). Fixing them strengthens the methodology for every project, not just the framework repo.

## Value Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| User Value | 10/10 | Every gap affects every project using the framework |
| Complexity | 7/10 | Mix of simple fixes (#1, #2, #8) and architectural work (#6, #7) |
| Risk | 3/10 | Most changes are additive; adapter migration (#6) needs careful backward compat |
| Urgency | 8/10 | CLI guard (#1) and CI (#2) are immediate reliability issues |

## What Changes

### 1. CLI Side Effect Guard — Defeat Test + Non-Negotiable Rule

**Problem:** `notify.mjs` executed its CLI router when imported by other scripts. Fixed for notify.mjs, but the pattern could exist in any of the 24+ scripts.

**Changes:**
- Add defeat test pattern to `four-layer-validate.mjs`: scan all `.mjs` files for `process.argv` usage outside `__isMainModule` guards. Fail if a script exports functions AND has unguarded CLI routing.
- Add non-negotiable rule to CLAUDE.md: "Scripts that export functions MUST guard their CLI entry point with an `__isMainModule` check."
- Audit all existing scripts and fix any that have the pattern.

### 2. CI Pipeline for Framework Repo

**Problem:** The framework that preaches "test-gated completion" has no CI. Six commits pushed today with no automated validation.

**Changes:**
- Create `.github/workflows/test.yml` — runs unit tests (`node tests/adapter-and-model-manager.test.mjs`) and behavior tests (`node agents/test-behavior.mjs --dry-run`) on every push to main and every PR.
- Add badge to README.md showing test status.

### 3. Documentation-Mode Micro Cycle

**Problem:** The micro cycle (pick → implement → test → commit per task) doesn't fit template/documentation work where there's nothing to test per-task.

**Changes:**
- Document a "documentation mode" micro cycle variant in CLAUDE.md: implement batch → validate batch → commit batch. Apply when tasks produce non-testable artifacts (templates, docs, config).
- Add guidance to AGENT.md.template: "If the task produces documentation or templates (not code), batch implementation with a single validation pass is acceptable."
- Update `framework/iteration-cycles.md` to acknowledge the variant.

### 4. Discovery Phase in OpenSpec Proposals

**Problem:** OpenSpec proposals explain WHY but don't require discovering WHAT EXISTS first. This leads to proposals that conflict with or duplicate existing code.

**Changes:**
- Update OpenSpec proposal template to include a `## Discovery` section: "What files, patterns, and tests already exist in the affected area? What did you read before writing this proposal?"
- Update the `openspec-new-change` skill instructions to prompt for discovery.
- Reference the research-agent template as the canonical discovery approach.

### 5. Frontmatter Parser Hardening

**Problem:** `parseFrontmatter()` in setup.mjs is a hand-rolled regex parser that handles simple cases but breaks on multiline strings, deep nesting, or YAML comments.

**Changes:**
- Document the supported frontmatter subset (flat key-value, single-level arrays, single-level objects) in `docs/execution-agents.md`.
- Add a validation test that parses all 15 execution templates and verifies no unsupported YAML features are used.
- Add clear error message when parsing fails: "Frontmatter parse error in {file}. Supported: flat key-value pairs, JSON arrays, single-level objects."

### 6. Adapter Layer Migration — Wire Into Queue-Drainer

**Problem:** The adapter layer has 6 implementations but `queue-drainer.mjs` still uses direct file I/O. The adapters are architecture without integration.

**Changes:**
- Refactor `queue-drainer.mjs` to call adapter methods (`loadTasks`, `saveTask`, `archiveTask`, etc.) instead of direct `readFileSync`/`writeFileSync`.
- The `file-based` adapter already implements these methods identically to the current inline code — this is a refactor, not a behavior change.
- Add integration test: verify queue-drainer produces identical output when using file-based adapter vs direct I/O.
- Document the migration in `docs/adapter-guide.md`: "Queue-drainer now uses the configured orchestration adapter."

### 7. Memory Scaling — Auto-Summarize on Threshold

**Problem:** Memory is write-only without semantic search. At 60+ entries, reading ALL memory wastes tokens. Semantic search is documented as "optional" but is practically required.

**Changes:**
- Add token-budget-aware recall to `memory-manager.mjs`: when total memory exceeds a configurable threshold (default: 4000 tokens), auto-summarize older entries instead of returning raw JSON.
- Add `memoryTokenBudget` to `project.json` config (default: 4000).
- When summarizing, prioritize: core.json failures (always full), long-term patterns (full up to budget), medium-term (summarized), recent (latest 5 entries only).
- Document the threshold in `docs/memory-protocol.md`.
- Semantic search remains the preferred approach when `sentence-transformers` is installed; this is the fallback for projects without it.

### 8. Setup.mjs --dry-run Flag

**Problem:** `setup.mjs` interactive mode immediately creates files. No way to preview what would be created.

**Changes:**
- Add `--dry-run` flag to setup.mjs. When active, the interactive flow runs normally but every `writeIfNotExists` and `ensureDir` call logs what WOULD happen instead of doing it.
- Output format: `[DRY RUN] Would create: agents/project.json (33 lines)`, `[DRY RUN] Would create directory: tasks/queue/`
- User or AI agent reviews the plan, then re-runs without `--dry-run` to apply.

### 9. Configurable Done Checklist per Project Type

**Problem:** The done checklist (OpenSpec → tests → commit → deploy → visual verify → notify) assumes app projects. Framework repos skip deploy/verify/notify, making agents feel perpetually "not done."

**Changes:**
- Add `doneChecklist` to `project.json` schema — array of step names that apply to this project.
- Default for app projects: `["openspec", "tests", "commit", "deploy", "verify", "notify"]`
- Default for framework repos: `["openspec", "tests", "commit", "push"]`
- Update CLAUDE.md done checklist section to read from config.
- Update `agents/templates/AGENT.md.template` to reference the configurable checklist.

### 10. Split Behavior Tests: Framework vs Project

**Problem:** 16 behavior tests fail on the framework repo because they check project-specific agent content (memory read instructions in domain agents, `{data, error}` patterns, file size limits in AGENT.md).

**Changes:**
- Split `test-behavior.mjs` into two modes: `--framework` (template quality, script existence, CLAUDE.md completeness, adapter existence) and `--project` (agent-specific content, domain patterns, memory completeness).
- Framework repo runs `--framework` only. Project repos run both.
- Default (no flag) runs both for backward compatibility.
- Move the 16 currently-failing tests into the `--project` bucket.

## Capabilities

### New Capabilities
- `cli-guard-defeat-test`: Defeat test for unguarded CLI entry points in scripts that export functions
- `ci-pipeline`: GitHub Actions workflow for framework repo test automation
- `documentation-micro-cycle`: Documented variant of the micro cycle for non-code tasks
- `openspec-discovery-phase`: Required discovery section in OpenSpec proposals
- `frontmatter-validation`: Parser hardening and supported subset documentation
- `adapter-migration`: Queue-drainer wired to orchestration adapter interface
- `memory-scaling`: Token-budget-aware memory recall with auto-summarization
- `setup-dry-run`: Preview mode for setup.mjs interactive flow
- `configurable-done-checklist`: Per-project done checklist in project.json
- `split-behavior-tests`: Framework vs project test modes

### Modified Capabilities
<!-- No existing specs to modify — all new capabilities -->

## Impact

- **Scripts modified:** `four-layer-validate.mjs` (CLI guard scan), `queue-drainer.mjs` (adapter integration), `memory-manager.mjs` (token-budget recall), `setup.mjs` (--dry-run flag), `test-behavior.mjs` (--framework/--project modes)
- **New files:** `.github/workflows/test.yml`, potentially `agents/cli-guard.mjs` (defeat test scanner)
- **Config changes:** `project.json` gains `doneChecklist` and `memoryTokenBudget` fields
- **Documentation:** CLAUDE.md (CLI guard rule, documentation micro cycle, done checklist), `framework/iteration-cycles.md` (doc mode), `docs/memory-protocol.md` (scaling), `docs/adapter-guide.md` (migration), `docs/execution-agents.md` (frontmatter subset)
- **Templates:** `AGENT.md.template` (doc mode reference, configurable done checklist), OpenSpec proposal template (discovery section)
- **Backward compatible:** All new config fields have sensible defaults. Existing projects unaffected.
