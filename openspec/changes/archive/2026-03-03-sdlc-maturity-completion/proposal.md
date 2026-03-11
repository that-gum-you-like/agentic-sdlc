## Why

The Agentic SDLC lesson plan (Hours 1–6) defines 13 systems that a mature project should have. After the initial remediation pass, LinguaFlow is at Phase 4: 75%, Phase 5: 85%, Phase 6: 40%. This change closes all remaining gaps to bring every phase to 100%, making LinguaFlow the reference implementation of the full framework.

The most critical gaps are: zero e2e tests (the lesson plan calls this "non-negotiable"), no prompt injection filtering on AI inputs, and no formalized validation pipeline. These are safety and quality systems that prevent regressions the current test suite cannot catch.

## What Changes

- **e2e tests**: Create end-to-end tests using Playwright that verify full user flows (login → feed → quiz → results) through the web export
- **Front-end e2e**: Same Playwright tests cover front-end e2e (the web export IS the front-end)
- **Prompt injection filter**: Add injection pattern detection to sanitize.ts (beyond control-char stripping) — detect "ignore previous instructions", role-play injection, delimiter attacks
- **Four-layer validation pipeline**: Formalize research→critique→code→statistics as a validation protocol in Richmond's review process and a reusable script
- **Error deduplication**: Add fingerprinting to crashReportService.ts so duplicate errors are counted, not repeated
- **Structured handoff templates**: Define what an agent submission to #reviews must contain (files changed, tests added, self-assessment)
- **Semantic analysis alternative**: Build a TypeScript AST-based analyzer (replaces spaCy) that catches patterns ESLint/defeat tests miss (dead code, unused exports, circular dependencies)
- **OpenClaw cron jobs**: Register REM sleep (weekly Sunday 23:00) and cost report (daily 06:00)
- **Pattern hunt → defeat test loop**: Create a script that scans Richmond's reviews + git history for recurring patterns, proposes new defeat tests
- **Mobile workflow documentation**: Document how to use claude.ai/code for mobile task management
- **estimatedTokens population**: Backfill token estimates for all task templates based on actual usage data

## Capabilities

### New Capabilities
- `e2e-tests`: Playwright-based end-to-end tests for critical user flows through the web export
- `prompt-injection-filter`: AI input sanitization that detects and blocks prompt injection patterns
- `four-layer-validation`: Formalized research→critique→code→statistics validation pipeline as a reusable protocol
- `error-deduplication`: Fingerprint-based error dedup in crash reporting
- `semantic-analysis`: TypeScript AST-based code analyzer for patterns beyond ESLint (dead code, unused exports, circular deps)
- `pattern-hunt-automation`: Script that mines review history for recurring patterns and proposes defeat tests
- `agent-handoff-templates`: Structured submission format for agent→reviewer handoffs
- `openclaw-cron-registration`: Automated scheduling of REM sleep and cost report jobs
- `mobile-workflow-docs`: Documentation for mobile-first task management via claude.ai/code

### Modified Capabilities
- `linguaflow`: estimatedTokens field population in task schema

## Value Analysis

**Who benefits:**
- Bryce: Full confidence that the framework is complete — no hidden gaps when applying to new projects
- Future projects: LinguaFlow becomes the proven reference implementation; every system is tested and documented
- Agents: e2e tests catch integration failures that unit tests miss; injection filter protects AI pipeline; handoff templates reduce review friction

**What happens if we don't build this:**
- e2e tests: Integration bugs ship to production undetected (the lesson plan calls this "non-negotiable")
- Injection filter: Malicious user input could manipulate Claude's quiz matching via transcript injection
- Validation pipeline: Reviews stay informal — no structured quality gate between agent work and merge
- Pattern hunt: Anti-patterns accumulate silently until someone manually notices

**Success metrics:**
- All 6 phases at 100% in linguaflow-sdlc-assessment.md
- e2e test suite covers login → feed → quiz → results flow
- Prompt injection filter blocks known injection patterns with tests proving it
- Pattern hunt script produces actionable output from real review history
- OpenClaw crons fire on schedule (verifiable via `openclaw_cron_list`)

## Impact

- **New files**: `__tests__/e2e/*.test.ts`, `agents/pattern-hunt.mjs`, `agents/four-layer-validate.mjs`, `docs/MOBILE_WORKFLOW.md`, `agents/handoff-template.md`
- **Modified files**: `src/utils/sanitize.ts` (injection patterns), `src/services/crashReportService.ts` (dedup), `agents/richmond/AGENT.md` (validation protocol), task JSON schema (estimatedTokens)
- **Dependencies**: `@playwright/test` (dev dependency for e2e)
- **No app feature changes**: All work is infrastructure/tooling
