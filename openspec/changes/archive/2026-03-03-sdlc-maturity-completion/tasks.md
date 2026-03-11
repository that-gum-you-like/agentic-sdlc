## 1. e2e Test Infrastructure (Playwright)

- [x] 1.1 Install `@playwright/test` as dev dependency in LinguaFlow/ and run `npx playwright install chromium`
- [x] 1.2 Create `playwright.config.ts` targeting `http://localhost:8081` with `webServer` config to auto-start Expo web
- [x] 1.3 Add `"test:e2e": "playwright test"` script to LinguaFlow/package.json
- [x] 1.4 Write login flow e2e test: page loads, "LinguaFlow" visible, demo buttons present, Student Demo navigates to feed
- [x] 1.5 Write creator flow e2e test: Creator Demo → creator dashboard loads with analytics sections
- [x] 1.6 Write quiz flow e2e test: Student Demo → feed → navigate to quiz (verify quiz screen renders)
- [x] 1.7 Run `npm run test:e2e` and verify all tests pass

## 2. Prompt Injection Filter

- [x] 2.1 Add `detectPromptInjection(input: string): { score: number; patterns: string[] }` to `src/utils/sanitize.ts`
- [x] 2.2 Implement pattern detection: role-override ("ignore previous instructions", "you are now", "act as"), delimiter injection (`<|system|>`, `[INST]`, `<<SYS>>`), base64-encoded injections, jailbreak phrases
- [x] 2.3 Integrate into `ai.ts`: call `detectPromptInjection()` on transcript/prompt inputs, log warning if score >= 0.8
- [x] 2.4 Write unit tests for `detectPromptInjection()`: at least 10 injection patterns + 5 benign inputs that should score 0
- [x] 2.5 Run tests and verify all pass

## 3. Error Deduplication

- [x] 3.1 Add `fingerprint(error: Error): string` function to `src/services/crashReportService.ts` using hash of message + first 3 stack frames
- [x] 3.2 Modify error storage to use fingerprint as key: `{ fingerprint, count, firstSeen, lastSeen, error }`
- [x] 3.3 On duplicate fingerprint, increment `count` and update `lastSeen` instead of appending
- [x] 3.4 Write unit tests: same error produces same fingerprint, different errors differ, duplicates increment counter
- [x] 3.5 Run tests and verify all pass

## 4. Four-Layer Validation Pipeline

- [x] 4.1 Create `agents/four-layer-validate.mjs` with CLI: `--files <glob>`, `--json`, default to `git diff --name-only HEAD~1`
- [x] 4.2 Implement Layer 1 (Research): verify imports resolve using TypeScript's `ts.createProgram`, report unresolved imports
- [x] 4.3 Implement Layer 2 (Critique): check files against Richmond's checklist patterns (no any, no console.log, {data,error}, file size limits)
- [x] 4.4 Implement Layer 3 (Code): run defeat test patterns + AST analysis on changed files
- [x] 4.5 Implement Layer 4 (Statistics): report file size deltas, count of new/modified files, test file coverage
- [x] 4.6 Output structured JSON report: `{ passed, layers: [{ name, status, details }] }`
- [x] 4.7 Test: run `node agents/four-layer-validate.mjs` against current codebase, verify output is valid JSON

## 5. Semantic Analysis (AST Analyzer)

- [x] 5.1 Create `agents/ast-analyzer.mjs` using TypeScript compiler API (`ts.createProgram`)
- [x] 5.2 Implement unused export detection: find exports not imported anywhere in `src/`
- [x] 5.3 Implement circular dependency detection: build import graph, find cycles
- [x] 5.4 Implement dead code detection: functions defined but never called or exported
- [x] 5.5 Add `--path <dir>` and `--json` CLI flags
- [x] 5.6 Wire AST analyzer into four-layer-validate.mjs layer 3
- [x] 5.7 Test: run `node agents/ast-analyzer.mjs` and verify output (may find real issues)

## 6. Pattern Hunt Automation

- [x] 6.1 Create `agents/pattern-hunt.mjs` that reads `agents/richmond/reviews/*.json`
- [x] 6.2 Extract and group flagged issues by category across all reviews
- [x] 6.3 Flag categories appearing in 3+ reviews as "recurring patterns"
- [x] 6.4 Add git log analysis: scan `git log --oneline -100` for revert/fix commits on same files
- [x] 6.5 Generate proposed defeat test descriptions for each recurring pattern
- [x] 6.6 Add `--json` flag for machine-readable output
- [x] 6.7 Test: run `node agents/pattern-hunt.mjs` and verify output structure

## 7. Agent Handoff Templates

- [x] 7.1 Create `agents/handoff-template.md` with required sections: Task ID, Files Changed, Tests Added/Modified, Self-Assessment (checklist items), Known Risks
- [x] 7.2 Add handoff template reference to Roy, Moss, Jen, and Douglas AGENT.md files (agents that submit to #reviews)
- [x] 7.3 Add behavior test check: agents referencing #reviews must also reference `handoff-template.md`
- [x] 7.4 Run `node agents/test-behavior.mjs` and verify all checks pass (including new handoff check)

## 8. OpenClaw Cron Registration

- [x] 8.1 Register weekly REM sleep cron: `openclaw_cron_create` with name `rem-sleep-weekly`, schedule `0 23 * * 0`, command `cd /home/bryce/languageapp && node agents/rem-sleep.mjs`
- [x] 8.2 Register daily cost report cron: `openclaw_cron_create` with name `cost-report-daily`, schedule `0 6 * * *`, command `cd /home/bryce/languageapp && node agents/cost-tracker.mjs report`
- [x] 8.3 Verify with `openclaw_cron_list` that both jobs appear
- [x] 8.4 Update CLAUDE.md Iteration Cycles section to reference the cron schedules

## 9. Mobile Workflow Documentation

- [x] 9.1 Create `docs/MOBILE_WORKFLOW.md` with sections: Overview, Task Creation from Mobile, Reviewing Agent Work, Kicking Off Autonomous Sessions, Quick Commands
- [x] 9.2 Include copy-pasteable commands for: check status, start session, view dashboard, deploy, cost report
- [x] 9.3 Reference claude.ai/code as the mobile interface

## 10. Task Schema: estimatedTokens Population

- [x] 10.1 Create a reference mapping in CLAUDE.md or a config file: simple fix → 3500, feature → 20000, architecture → 35000, research → 65000
- [x] 10.2 Update queue-drainer.mjs `status` command to display estimatedTokens when present
- [x] 10.3 Populate estimatedTokens in all archived task files in `tasks/completed/` based on their task type

## 11. Assessment Update & Verification

- [x] 11.1 Update `linguaflow-sdlc-assessment.md` — all phases to 100%
- [x] 11.2 Run all verification: `npm run test:defeat`, `npm run test:integration`, `node agents/test-behavior.mjs`, `node agents/four-layer-validate.mjs`
- [x] 11.3 Commit, push, deploy, visual test on production, WhatsApp notification (full Done checklist)
