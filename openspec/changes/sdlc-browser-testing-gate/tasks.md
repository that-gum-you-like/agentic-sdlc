## 1. Maturity Model Update

- [x] 1.1 In `~/agentic-sdlc/framework/maturity-model.md`, add to Level 4 (Quality) new-project checklist: "Browser E2E: critical user flows tested in real browser", "Refresh resilience: route groups survive hard refresh", "Deploy gate: E2E must pass before production deploy"
- [x] 1.2 In `~/agentic-sdlc/framework/maturity-model.md`, add to Level 5 (Evolution) new-project checklist: "User journey coverage: new features require browser journey test", "Dead link audit: navigation targets verified to have content", "State persistence testing: interactions survive navigation and reload"

## 2. Validation Patterns — Layer 5

- [x] 2.1 In `~/agentic-sdlc/framework/validation-patterns.md`, add Layer 5 (Browser Verification) section after Layer 4, with principles (user intent not implementation, built artifact not dev server, screenshot proof), required scenarios (refresh resilience, demo mode, navigation completeness, state persistence, error states), and when-to-run guidance
- [x] 2.2 Update the reference architecture diagram in validation-patterns.md to include Layer 5

## 3. CLAUDE.md Updates

- [x] 3.1 In `~/agentic-sdlc/CLAUDE.md`, update the micro cycle to add conditional step: "IF frontend files changed: Run browser E2E against local build" between "Run tests" and "Commit"
- [x] 3.2 In `~/agentic-sdlc/CLAUDE.md`, add Tier 5 (Browser E2E) to the testing tiers table with: when to run, what it checks, tool requirements, and deploy gate status
- [x] 3.3 In `~/agentic-sdlc/CLAUDE.md`, update the Done checklist / session protocol to include browser verification step: exercise changed features in real browser, capture screenshots, visually confirm, fix before reporting done

## 4. Templates

- [x] 4.1 Create `~/agentic-sdlc/agents/templates/browser-tests.md.template` with 6 test pattern categories: refresh resilience, user journey, navigation completeness, state persistence, demo/seed mode, error resilience — each with description and example test structure
- [x] 4.2 Create `~/agentic-sdlc/agents/templates/deploy-pipeline.md.template` documenting the recommended deploy pipeline with E2E gate: build → serve locally → run browser E2E → deploy → post-deploy smoke → browser verification → notify

## 5. Case Study

- [x] 5.1 In `~/agentic-sdlc/framework/case-studies.md`, add case study: "6,600 tests pass, 6 browser bugs ship" — document the LinguaFlow failure, root cause (no browser verification tier), specific bugs (refresh, TypeError, dead links, audio, state loss), and the fix (Layer 5, maturity requirements, deploy gate)

## 6. Verify

- [x] 6.1 Run `node ~/agentic-sdlc/agents/test-behavior.mjs` from a project directory to verify behavior tests still pass after CLAUDE.md changes
- [x] 6.2 Verify all modified markdown files have no broken links or references
- [x] 6.3 Commit and push to `~/agentic-sdlc` repo
