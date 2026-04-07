## 1. ONBOARDING.md Enhancements

- [x] 1.1 Add prerequisites section at top of ONBOARDING.md (after the intro blockquote, before Phase 1) — state: Node.js 18+ required, git required, framework cloned to ~/agentic-sdlc
- [x] 1.2 Add greenfield project subsection to Phase 1 — "If no package.json or source files exist: start at Level 1 (create CLAUDE.md with your intended tech stack and conventions), then run setup.mjs when you have initial code and tests"
- [x] 1.3 Add monorepo note to Phase 1 — "For monorepo or subdirectory projects: setup.mjs asks for 'App subdirectory'. Set this to your app's location (e.g., 'packages/web'). Discovery reads agents/project.json appDir to find the right package.json."
- [x] 1.4 Add multi-language guidance to Phase 3 — subsection with Python (pytest, src/ layout), Rust (cargo test, src/ + tests/), Go (go test, cmd/ + pkg/) adaptation notes including example test commands and CLAUDE.md patterns
- [x] 1.5 Add example --discover output to Phase 1 — annotated JSON example showing what each field means, with note that AI agents parse this and humans can add --human for a summary line
- [x] 1.6 Expand troubleshooting table with 4 new entries: "language: unknown" (check subdirectory or set appDir), "CLAUDE.md not being read" (verify you're running AI tool from project root), "No agents/ directory after setup" (run setup.mjs from project dir, not framework dir), "Test command fails during agent task" (verify testCmd in agents/project.json matches your actual test runner)

## 2. Level Guide Fixes

- [x] 2.1 Fix Level 3 "Next Level" section — add path reference: "See `docs/levels/level-4-quality.md`" using same format as other levels
- [x] 2.2 Standardize cross-reference format across all 6 guides — use relative markdown links: `See [Level N: Title](level-N-name.md)` consistently in every "Next Level" section
- [x] 2.3 Add "no tests yet" guidance to Level 2 — add a subsection: "If your project has no tests yet: (1) Install a test framework (jest for JS/TS, pytest for Python, cargo test for Rust), (2) Write one test for any existing function, (3) Verify the test command works, (4) Then proceed with the micro cycle"

## 3. README.md Updates

- [x] 3.1 Add prerequisites line to README Quick Start section — "**Prerequisites:** Node.js 18+, git" before the clone command

## 4. Discovery Enhancement

- [x] 4.1 Add --human flag to setup.mjs --discover — when both --discover and --human are present, print a 1-line summary before the JSON: "[language]/[framework] project at Level [N] ([reason]). Suggested agents: [list]."

## 5. Validation

- [x] 5.1 Re-run onboarding walkthrough: verify --discover on LinguaFlow still outputs correct JSON, verify --discover --human adds summary line, verify all level guide cross-references are consistent
