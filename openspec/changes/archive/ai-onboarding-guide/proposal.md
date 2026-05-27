## Why

The agentic-sdlc framework has 4,700+ lines of methodology, 15 execution templates, 5 planning templates, adapter layers, and 24 scripts. But the entry point is a dense README written for humans who already understand multi-agent systems. When a new user tells their AI agent "integrate this into my project," the agent has no clear starting path — it lands on a 400-line CLAUDE.md of strict rules with no adaptive integration guidance.

The framework needs an **AI-agent-first onboarding experience** that:
1. Works with ANY AI coding tool (Claude Code, Cursor, Windsurf, Copilot, Aider, local agents)
2. **Discovers** the user's existing project before prescribing anything (what tech stack, what tests, what CI, what existing agents/processes)
3. **Integrates** incrementally — doesn't force the full framework on day 1, lets users adopt maturity levels progressively
4. **Validates** each step before moving to the next — "did it work?" checkpoints

## Value Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| User Value | 10/10 | This IS the product — if onboarding fails, the framework is worthless |
| Complexity | 5/10 | Mostly documentation + a structured guide file; small setup.mjs enhancements |
| Risk | 2/10 | Additive; existing users unaffected |
| Urgency | 10/10 | Framework is public on GitHub right now with no AI-readable onboarding path |

## What Changes

### 1. AI-Readable Onboarding Entry Point

Create `ONBOARDING.md` at the repo root — the file any AI agent reads when a user says "integrate this framework into my project." This file:

- **Speaks to AI agents directly** — written as instructions an LLM can follow, not prose for humans to read
- **Starts with discovery** — "Before doing anything, understand the user's project: What language? What framework? What tests exist? What CI? What's their current dev process?"
- **Presents the maturity model as a menu** — "Where is this project today? Level 0 (manual)? Level 2 (automated)? Start from their current level, not Level 0."
- **Provides a progressive integration path** — each maturity level is a checkpoint with clear "you're done with this level when..." criteria
- **Never forces** — every recommendation is framed as "if the project would benefit from X, here's how to add it"
- **Tool-agnostic** — works whether the agent can run bash, only edit files, or just advise

### 2. README.md Rewrite

Rewrite the README to be both human-readable and AI-parseable:
- Lead with a 3-sentence value proposition
- "Quick Start" becomes "Point your AI agent at this repo" with clear entry points
- Link to ONBOARDING.md prominently
- Keep the detailed reference but move it below the fold

### 3. Discovery-First Setup Flow

Enhance `setup.mjs` with a `--discover` flag that:
- Scans the project directory for existing config (package.json, tsconfig, .github/workflows, Dockerfile, etc.)
- Detects tech stack, test framework, CI/CD, existing agent patterns
- Pre-fills setup answers based on discovery
- Outputs a discovery report the AI agent can use to make integration decisions

### 4. Progressive Integration Guides

Create `docs/levels/` with one guide per maturity level:
- `level-1-assisted.md` — Add AI to your existing workflow (CLAUDE.md, basic prompts)
- `level-2-automated.md` — Add micro cycle, tests, commits (1 agent)
- `level-3-orchestrated.md` — Add task queue, multiple agents, domain routing
- `level-4-quality.md` — Add defeat tests, code review agent, browser E2E
- `level-5-evolution.md` — Add memory, REM sleep, failure tracking, model-manager
- `level-6-self-improving.md` — Add pattern hunt, behavior tests, capability monitoring

Each guide has: prerequisites, what you'll add, step-by-step integration, "you're done when" checklist.

### 5. Cursor/IDE Rules File

Create `.cursorrules` (and `.windsurfrules`) at the repo root — Cursor automatically reads this file. Content mirrors ONBOARDING.md's AI-agent instructions but formatted for Cursor's conventions. This means Cursor users get onboarding guidance automatically when they open the repo.

## Capabilities

### New Capabilities
- `ai-onboarding`: AI-agent-readable onboarding entry point (ONBOARDING.md) with discovery-first, progressive integration approach
- `progressive-levels`: Per-maturity-level integration guides that let users adopt incrementally
- `project-discovery`: Setup.mjs --discover flag for automatic project analysis

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **New files**: `ONBOARDING.md`, `.cursorrules`, `.windsurfrules`, `docs/levels/level-{1-6}-*.md`
- **Modified files**: `README.md` (rewrite for AI-parseability), `setup.mjs` (--discover flag)
- **No breaking changes**: Existing projects and workflows unaffected
