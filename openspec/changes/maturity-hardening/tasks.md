## 1. SDLC: Behavior Test Gate

- [x] 1.1 Run `node agents/test-behavior.mjs` to confirm all 30 checks currently pass
- [x] 1.2 Add `agents/**/*.md` pattern to lint-staged config in `LinguaFlow/package.json` that runs behavior tests
- [x] 1.3 Test the gate by verifying lint-staged picks up the new pattern

## 2. SDLC: Pattern-Hunt Cron

- [x] 2.1 Register OpenClaw cron job `pattern-hunt-weekly` running `node agents/pattern-hunt.mjs` at `0 22 * * 0` (Sunday 22:00)
- [x] 2.2 Verify cron appears in `openclaw cron list`

## 3. App: Umami Analytics Provider

- [x] 3.1 Implement `UmamiProvider` class in `src/services/analyticsService.ts` conforming to `AnalyticsProvider` interface
- [x] 3.2 Add provider selection logic: use `UmamiProvider` when `UMAMI_URL` and `UMAMI_WEBSITE_ID` env vars are set, else `InMemoryProvider`
- [x] 3.3 Write tests for `UmamiProvider` (mock fetch, verify event payloads)

## 4. App: C1/C2 Question Bank Expansion

- [x] 4.1 Add ~100 C1-level questions to `src/data/questionBankSeed.ts` covering reading, grammar, vocabulary, listening
- [x] 4.2 Add ~100 C2-level questions to `src/data/questionBankSeed.ts` covering reading, grammar, vocabulary, listening
- [x] 4.3 Verify question counts: C1 ≥ 100, C2 ≥ 100, all skills represented

## 5. Verify & Ship

- [x] 5.1 Run full test suite — all tests pass
- [x] 5.2 Commit and push
- [x] 5.3 Deploy with `bash scripts/deploy.sh --skip-git`
- [x] 5.4 Visually verify production screenshots
- [x] 5.5 Send WhatsApp to Bryce with summary
