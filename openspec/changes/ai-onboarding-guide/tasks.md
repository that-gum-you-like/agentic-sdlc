## 1. Core Onboarding Files

- [x] 1.1 Create `ONBOARDING.md` at repo root — AI-agent-first onboarding protocol with 5 phases: (1) Discover the project (read package.json, test config, CI, git history), (2) Assess current maturity level, (3) Choose starting level with user, (4) Integrate level-by-level using progressive guides, (5) Validate with checkpoints. Written as imperative instructions an AI agent follows. Also human-readable. Include example discovery questions, maturity assessment rubric, and links to level guides.
- [x] 1.2 Create `.cursorrules` at repo root — condensed onboarding context for Cursor. Explain what the framework is, direct agent to read ONBOARDING.md for full protocol, provide quick reference for key commands (setup.mjs, queue-drainer, worker).
- [x] 1.3 Create `.windsurfrules` at repo root — same content as .cursorrules adapted for Windsurf conventions.
- [x] 1.4 Add ONBOARDING.md cross-reference to top of `CLAUDE.md` — "If you are helping a user set up this framework for the first time, read ONBOARDING.md before applying these rules."

## 2. Progressive Level Guides

- [x] 2.1 Create `docs/levels/level-1-assisted.md` — Adding AI to your existing workflow. Steps: create CLAUDE.md in project, add project-specific instructions, establish coding conventions. Validation: AI agent follows your project rules.
- [x] 2.2 Create `docs/levels/level-2-automated.md` — AI writes, tests, commits. Steps: add test command config, establish micro cycle (implement → test → commit), set up pre-commit hooks. Validation: AI commits only pass tests.
- [x] 2.3 Create `docs/levels/level-3-orchestrated.md` — Multiple agents with task queue. Steps: run setup.mjs, create agent roster, configure domains.json and budget.json, seed task queue, run queue-drainer. Validation: queue-drainer assigns task to correct agent.
- [x] 2.4 Create `docs/levels/level-4-quality.md` — Defeat tests, code review, browser E2E. Steps: add defeat test patterns (four-layer-validate), configure code reviewer agent, set up browser E2E for frontend. Validation: defeat tests catch anti-patterns, reviewer produces verdicts.
- [x] 2.5 Create `docs/levels/level-5-evolution.md` — Memory, failure tracking, model management. Steps: initialize 5-layer memory per agent, configure REM sleep cron, add model-manager with fallback chains, set up performance ledger. Validation: agent reads memory before task, model-manager detects utilization.
- [x] 2.6 Create `docs/levels/level-6-self-improving.md` — Pattern hunt, behavior tests, capability monitoring. Steps: run pattern-hunt to find recurring issues, configure behavior tests for prompt quality, enable capability drift detection. Validation: pattern-hunt proposes defeat tests, behavior tests pass.

## 3. Project Discovery

- [x] 3.1 Add `--discover` flag to `setup.mjs` — scan target directory for: package.json (language, deps, test script), tsconfig/jsconfig, .github/workflows or .gitlab-ci.yml, Dockerfile, existing CLAUDE.md or .cursorrules, agents/ directory, tasks/ directory. Output JSON report to stdout. No files modified.
- [x] 3.2 Add `discoverProject(dir)` function to `setup.mjs` — returns structured object with: language, framework, testFramework, testCmd, ci, packageManager, hasExistingAgents, hasTaskQueue, hasMemory, suggestedAgents (based on detected tech), suggestedLevel (based on what's already in place).

## 4. README.md Rewrite

- [x] 4.1 Rewrite `README.md` — Lead with 3-sentence value proposition. Quick start section with 3 paths: (a) "Point your AI agent at this repo" → ONBOARDING.md, (b) "Run the setup script" → setup.mjs, (c) "Learn the methodology" → framework/lesson-plan.md. Feature overview as a concise bullet list. Maturity model as a simple numbered list. Detailed reference sections below the fold. Keep existing content but reorganize for scannability.

## 5. Validation

- [x] 5.1 Test: verify ONBOARDING.md exists and contains the 5-phase protocol (discover, assess, choose, integrate, validate)
- [x] 5.2 Test: verify .cursorrules exists and references ONBOARDING.md
- [x] 5.3 Test: verify all 6 level guides exist in docs/levels/
- [x] 5.4 Test: verify setup.mjs --discover outputs valid JSON without modifying any files
