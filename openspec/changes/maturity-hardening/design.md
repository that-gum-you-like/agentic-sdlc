## Context

LinguaFlow's agentic SDLC is at Level 5 (Evolution). Budget enforcement works, all 6 agents have failure memories (2 each, 12 total), and the task queue is operational. To reach Level 6 (Continuous Improvement), the system needs automated pattern detection and self-correcting feedback loops.

The app's analytics service has a clean `AnalyticsProvider` interface with an `InMemoryProvider` for dev. Umami is the chosen production provider (self-hosted, privacy-respecting, no data sharing with governments — aligns with Bryce's requirements).

The CEFR question bank has 1,004 items total but uneven distribution: A1(185), A2(169), B1(225), B2(325), C1(45), C2(55). Advanced learners get thin question variety.

## Goals / Non-Goals

**Goals:**
- Automate weekly pattern-hunt via OpenClaw cron
- Gate AGENT.md edits with behavior test validation in lint-staged
- Implement UmamiProvider for production analytics (behind env var)
- Expand C1 to 145+ items and C2 to 155+ items (100 new each)

**Non-Goals:**
- Changing the agent roster or adding new agents
- Connecting external services (Supabase, Cloudflare) — separate concern, requires Bryce's API keys
- Building Epic 6 features (advanced creator tools)
- Changing the analytics interface — use existing `AnalyticsProvider`

## Decisions

### 1. Umami for analytics (not Mixpanel/Amplitude)

**Decision**: Implement `UmamiProvider` class implementing the existing `AnalyticsProvider` interface. Enable via `UMAMI_URL` and `UMAMI_WEBSITE_ID` env vars.

**Rationale**: Umami is self-hosted, open-source, GDPR-compliant, and doesn't sell data. Aligns with Bryce's privacy-first requirements. The existing `AnalyticsProvider` interface makes this a drop-in replacement.

**Alternative rejected**: Mixpanel/Amplitude — 3rd party SaaS, data ownership concerns.

### 2. OpenClaw cron for pattern-hunt (not GitHub Actions)

**Decision**: Schedule `node agents/pattern-hunt.mjs` weekly via OpenClaw cron (Sunday 22:00, before REM sleep at 23:00). Posts findings to Matrix #reviews.

**Rationale**: OpenClaw cron already manages REM sleep and cost reports. Adding pattern-hunt keeps automation in one place. GitHub Actions would require a self-hosted runner for local Matrix access.

### 3. lint-staged for behavior test gate (not separate pre-commit hook)

**Decision**: Add `agents/**/*.md` pattern to lint-staged config that runs `node agents/test-behavior.mjs`.

**Rationale**: lint-staged already handles TypeScript linting and testing. Adding AGENT.md validation to the same system keeps the pre-commit flow unified. A separate hook would be fragile.

### 4. Human-authored C1/C2 questions (not AI-generated)

**Decision**: Manually expand `src/data/questionBankSeed.ts` with ~200 new C1/C2 items covering all 4 skills (reading, grammar, vocabulary, listening) and all question types.

**Rationale**: Core philosophy — human-curated content only. AI does not author questions. The seed file already has 1,004 items as precedent.

## Risks / Trade-offs

- **Risk**: Behavior test may have false positives on valid AGENT.md edits → **Mitigation**: Run `node agents/test-behavior.mjs` first to confirm current tests pass before adding the gate. Fix any flaky tests first.
- **Risk**: Umami self-hosted instance not yet deployed → **Mitigation**: Provider is behind env vars. InMemoryProvider remains default. Umami only activates when `UMAMI_URL` is set.
- **Risk**: Pattern-hunt on empty review history yields nothing → **Mitigation**: Pattern-hunt gracefully handles empty data. Will generate meaningful output once review history accumulates.
- **Trade-off**: 200 new question items adds ~2,000 lines to seed file → **Accepted**: File is already 4,448 lines, well-structured, and only loaded in demo mode.
