## 1. Maturity Level Numbering (P0)

- [ ] 1.1 Define canonical numbering: Levels 0-6 with names: Manual, Assisted, Automated, Orchestrated, Quality, Evolving, Self-Improving
- [ ] 1.2 Update README.md maturity table to use 0-6 (currently 1-6, missing Level 0)
- [ ] 1.3 Verify ONBOARDING.md Phase 2 table matches (already uses 0-6, verify names match)
- [ ] 1.4 Update framework/maturity-model.md to use 0-6 naming (currently uses 1-7 with different names)
- [ ] 1.5 Verify level guide filenames and content headers match

## 2. CLI Discoverability (P0)

- [ ] 2.1 Add --help flag to setup.mjs: print usage text and exit instead of launching interactive mode
- [ ] 2.2 Document --dry-run in the --help output
- [ ] 2.3 Add openspec CLI to README Prerequisites section: "Optional: npm install -g openspec (for Cursor/Windsurf OpenSpec workflows)"
- [ ] 2.4 Add openspec prerequisite note to docs/cursor-setup.md

## 3. Hello World Quickstart (P1)

- [ ] 3.1 Add "Try It (5 minutes)" section to README between "Get Started" and "What's Included"
- [ ] 3.2 Improve setup.mjs completion message: add 3 concrete next-step commands

## 4. README Rewrite (P1)

- [ ] 4.1 Rewrite "What's Included" bullet points as outcomes/benefits, not features
- [ ] 4.2 Add numbered reading order to Documentation table
- [ ] 4.3 Move "Optional: Semantic Memory Search" out of README into Level 5 guide
- [ ] 4.4 Add inline glossary section to ONBOARDING.md defining: OpenSpec, defeat tests, REM sleep, micro cycle, domain routing
- [ ] 4.5 Add "Configure your LLM provider" step to ONBOARDING.md Phase 4 with API key env vars

## 5. Stale Docs Fixes (P1-P2)

- [ ] 5.1 Fix docs/safety-mechanisms.md: update "all six mechanisms" to current count
- [ ] 5.2 Fix docs/portability-guide.md: update stale paths (agents/setup.mjs → ~/agentic-sdlc/setup.mjs)
- [ ] 5.3 Add note to .windsurfrules explaining it intentionally mirrors .cursorrules
- [ ] 5.4 Update test-behavior.mjs to print summary line FIRST, then details

## 6. Tests + Deploy

- [ ] 6.1 Run all tests (unit, behavior, validation)
- [ ] 6.2 Commit and push
