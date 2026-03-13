## 1. Capabilities Template

- [x] 1.1 Add `uix` archetype to `agents/templates/capabilities.json.template` with required capabilities (`memoryRecall`, `memoryRecord`, `designSystemAudit`, `accessibilityAudit`, `visualReview`, `costTracking`), conditional (`storybookGovernance: "when Storybook is installed in the project"`), and notExpected (`defeatTests`, `deployPipeline`, `openclawBrowser`, `openclawNotify`)

## 2. Domains Template

- [x] 2.1 Add `uix` entry to `agents/templates/domains.json.template` with file patterns (`**/*.stories.*`, `**/tokens/**`, `**/theme/**`, `**/design-system/**`, `**/*.css`, `**/*.scss`, `**/*.styled.*`) and keywords (`accessibility`, `a11y`, `wcag`, `design system`, `visual`, `storybook`, `responsive`, `animation`, `typography`, `color`, `spacing`, `contrast`)

## 3. Setup Script

- [x] 3.1 Update `setup.mjs` to recognize `uix` role (and variants: "ui/ux", "design", "uix designer") and auto-assign haiku model, 50000 dailyTokens in budget.json
- [x] 3.2 Update `setup.mjs` to use the `uix` capabilities archetype when generating `capabilities.json` for uix-role agents
- [x] 3.3 Update `setup.mjs` to inject UIX-specific operating rules into the generated AGENT.md for uix-role agents (design token checks, accessibility validation, visual review via screenshots, conditional Storybook governance)

## 4. Agent Template Enhancements

- [x] 4.1 Create a UIX-specific AGENT.md addendum section (to be appended to the base template) covering: design-specific micro cycle (check tokens → validate a11y → screenshot visual review → check story coverage), design system audit rules, accessibility checklist (WCAG 2.1 AA), visual review workflow, Storybook governance rules
- [x] 4.2 Create a UIX-specific `core.json` seed with identity (UI/UX Designer), values (consistency over novelty, accessibility is non-negotiable, visual hierarchy guides users, design tokens are the source of truth), and non-negotiable rules (never ship inaccessible components, never hard-code values that have tokens, always validate at 3 breakpoints)

## 5. Documentation

- [x] 5.1 Add `uix` to the agent archetype table in `framework/agent-routing.md`
- [x] 5.2 Add UIX capability descriptions (`designSystemAudit`, `accessibilityAudit`, `visualReview`, `storybookGovernance`) to `CLAUDE.md` capability monitoring section

## 6. Tests

- [x] 6.1 Add UIX archetype to `test-behavior.mjs` expected archetypes — N/A (test-behavior.mjs does not validate archetype completeness)
- [x] 6.2 Verify `setup.mjs` correctly generates UIX agent config by running setup in dry-run or test mode
