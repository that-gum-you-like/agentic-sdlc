## Why

LinguaFlow is feature-complete at MVP level (10 phases, 6,457 tests, 99 screens, 202 services) but the agentic SDLC has gaps preventing Level 6 (Continuous Improvement): no automated weekly pattern hunt, no behavior test gate on agent prompt edits, and the pre-commit hook doesn't validate AGENT.md changes. On the app side, the analytics service uses an in-memory provider with no production analytics wired, and the CEFR question bank has weak C1/C2 coverage (45+55 items vs 150+ at lower levels).

## What Changes

- **Schedule weekly pattern hunt** via OpenClaw cron — mines Richmond's reviews for recurring anti-patterns and posts findings to Matrix
- **Add behavior test gate** to lint-staged config — AGENT.md edits must pass `agents/test-behavior.mjs` before commit
- **Expand C1/C2 question bank** — add ~100 items at C1 and ~100 at C2 to match lower-level coverage
- **Wire Umami analytics provider** — implement the production-ready UmamiProvider in analyticsService.ts with configurable endpoint, replacing InMemoryProvider when env var is set

## Capabilities

### New Capabilities
- `pattern-hunt-automation`: Automated weekly pattern detection that identifies recurring anti-patterns from Richmond's review history and generates draft defeat tests
- `analytics-production`: Production analytics provider (Umami, self-hosted, privacy-respecting) wired into the existing AnalyticsProvider interface

### Modified Capabilities
- (none — no existing spec requirements changing)

## Impact

- **Files**: `agents/test-behavior.mjs` (verify), `.lintstagedrc` or `package.json` lint-staged config, `src/services/analyticsService.ts`, `src/data/questionBankSeed.ts`, OpenClaw cron config
- **Dependencies**: Umami (self-hosted, privacy-respecting — no 3rd party data sharing)
- **Risk**: Low — question bank expansion is additive, analytics provider follows existing interface, cron job is non-destructive read-only analysis
- **Systems affected**: Pre-commit hooks, OpenClaw cron, analytics pipeline

## Value Analysis

- **Who benefits**: Bryce (better analytics visibility, stronger C1/C2 content), agents (self-improving via automated pattern detection), advanced learners (more C1/C2 content)
- **What happens if we don't build this**: SDLC stays at Level 5 — pattern detection manual only, no production analytics, C1/C2 learners have thin question coverage
- **Success metrics**: Pattern-hunt cron fires weekly with actionable findings; AGENT.md edits blocked by failing behavior tests; C1/C2 question counts ≥ 100 each; analytics events tracked in Umami on production
