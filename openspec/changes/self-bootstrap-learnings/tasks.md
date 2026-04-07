## 1. CLI Side Effect Guard (#1)

- [ ] 1.1 Audit all 24+ `.mjs` scripts in `agents/` — identify any that export functions AND have unguarded `process.argv` / CLI routing at top level. List files needing fixes.
- [ ] 1.2 Add `__isMainModule` guard to each identified script (same pattern as notify.mjs fix)
- [ ] 1.3 Add CLI guard scan to `four-layer-validate.mjs` — new check: scan `.mjs` files for `process.argv` usage, fail if file has named exports AND unguarded CLI routing. Support allowlist for pure CLI tools.
- [ ] 1.4 Add non-negotiable rule to `CLAUDE.md`: "Scripts that export functions MUST guard their CLI entry point with `__isMainModule`. Importing a script must never trigger CLI side effects."

## 2. CI Pipeline (#2)

- [ ] 2.1 Create `.github/workflows/test.yml` — Node.js 18 + 20 matrix, runs on push to main and PRs. Job 1: `node tests/adapter-and-model-manager.test.mjs`. Job 2: `node agents/test-behavior.mjs --framework` (after split in #10).
- [ ] 2.2 Add test status badge to `README.md` top section

## 3. Documentation Micro Cycle (#3)

- [ ] 3.1 Add "Documentation Mode" subsection to CLAUDE.md Micro Cycle section — "For tasks producing templates, documentation, or configuration (not testable code): implement batch → validate batch → commit batch is acceptable."
- [ ] 3.2 Update `agents/templates/AGENT.md.template` micro cycle section — add note: "If the task produces documentation or templates (not executable code), batch implementation with a single validation pass is acceptable."
- [ ] 3.3 Update `framework/iteration-cycles.md` Micro section to acknowledge doc-mode variant

## 4. OpenSpec Discovery Phase (#4)

- [ ] 4.1 Update OpenSpec proposal template (`openspec/templates/` if exists, or document in CLAUDE.md) — add `## Discovery` section: "What files, patterns, and tests already exist in the affected area? What did you read before writing this proposal?"
- [ ] 4.2 Update `openspec-new-change` skill instructions to prompt for discovery before drafting proposal

## 5. Frontmatter Validation (#5)

- [ ] 5.1 Add "Supported Frontmatter Subset" section to `docs/execution-agents.md` — flat key-value pairs, JSON-formatted arrays (`["a", "b"]`), single-level objects. No multiline strings, no YAML comments, no deep nesting.
- [ ] 5.2 Add frontmatter validation test to `tests/adapter-and-model-manager.test.mjs` — parse all 15 templates, verify each key is a supported type
- [ ] 5.3 Add error message to `parseFrontmatter()` in setup.mjs — on parse failure: "Frontmatter parse error in {file}. Supported: flat key-value, JSON arrays, single-level objects."

## 6. Adapter Migration (#6)

- [ ] 6.1 Refactor `queue-drainer.mjs` `loadTasks()` to call `fileBased.loadTasks(TASKS_DIR)` from the file-based adapter instead of inline `readdirSync` + `readFileSync`
- [ ] 6.2 Refactor `saveTask()` to call `fileBased.saveTask(TASKS_DIR, task)`
- [ ] 6.3 Refactor `archiveTask` case to call `fileBased.archiveTask(TASKS_DIR, COMPLETED_DIR, task)`
- [ ] 6.4 Refactor `loadHumanTasks()` and `saveHumanTask()` to use adapter
- [ ] 6.5 Refactor `loadCompletedCount()` to use adapter
- [ ] 6.6 Add integration test: run `queue-drainer.mjs status` before and after refactor, verify identical output
- [ ] 6.7 Update `docs/adapter-guide.md` — note that queue-drainer now uses the orchestration adapter

## 7. Memory Scaling (#7)

- [ ] 7.1 Add `memoryTokenBudget` field to `project.json` schema (default: 4000). Document in `load-config.mjs` defaults.
- [ ] 7.2 Add `estimateTokens(text)` helper to `memory-manager.mjs` — chars/4 approximation
- [ ] 7.3 Modify `memory-manager.mjs recall` — when total memory tokens exceed budget: return core.json failures in full, long-term entries up to remaining budget, medium-term as 1-line summaries, recent as latest 5 entries only. Print "[summarized — {N} tokens over budget]" note.
- [ ] 7.4 Add unit test: recall with small memory returns full content; recall with large memory returns summarized content with core failures intact
- [ ] 7.5 Document in `docs/memory-protocol.md` — "Memory recall auto-summarizes when total exceeds memoryTokenBudget. Install sentence-transformers for semantic search as a better alternative."

## 8. Setup Dry Run (#8)

- [ ] 8.1 Add `--dry-run` flag handling to `setup.mjs` — set a `dryRun` boolean from `process.argv`
- [ ] 8.2 Wrap `writeIfNotExists` and `ensureDir` — when dryRun is true, log `[DRY RUN] Would create: {path}` instead of writing. Track planned files.
- [ ] 8.3 At end of dry-run, print summary: "Would create {N} files and {M} directories. Re-run without --dry-run to apply."
- [ ] 8.4 Add unit test: `setup.mjs --dry-run --dir /tmp/test-project` creates zero files

## 9. Configurable Done Checklist (#9)

- [ ] 9.1 Add `doneChecklist` field to `project.json` schema — array of step names. Document defaults: app projects `["openspec", "tests", "commit", "deploy", "verify", "notify"]`, framework repos `["openspec", "tests", "commit", "push"]`.
- [ ] 9.2 Add `doneChecklist` to the framework's own `agents/project.json` with value `["openspec", "tests", "commit", "push"]`
- [ ] 9.3 Update CLAUDE.md Done Checklist section — note that steps come from `project.json.doneChecklist` and list the default
- [ ] 9.4 Update `agents/templates/AGENT.md.template` "What Done Means" section to reference configurable checklist

## 10. Split Behavior Tests (#10)

- [ ] 10.1 Add `--framework` and `--project` flags to `test-behavior.mjs` argument parsing
- [ ] 10.2 Wrap project-specific tests (agent AGENT.md content checks, domain pattern checks, memory content checks) in `if (!frameworkOnly)` guard
- [ ] 10.3 Wrap framework tests (template existence, script existence, CLAUDE.md checks, adapter checks) in `if (!projectOnly)` guard
- [ ] 10.4 Default (no flag) runs both. `--framework` sets frameworkOnly=true. `--project` sets projectOnly=true.
- [ ] 10.5 Update CI pipeline (task 2.1) to use `--framework` flag
- [ ] 10.6 Verify: `node agents/test-behavior.mjs --framework` passes with 0 failures on framework repo
