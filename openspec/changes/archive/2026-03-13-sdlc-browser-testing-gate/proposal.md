## Why

The agentic SDLC framework has a structural blind spot: it prescribes robust code-level testing (unit, integration, defeat, behavior) but has no requirement for browser-based E2E testing in the maturity model, validation patterns, or micro cycle. The framework's Lesson Plan (Hour 2) mentions "front-end e2e on every commit" but this is aspirational text — it does not appear in any maturity checklist, validation layer, or enforced pipeline step.

This gap was exposed in LinguaFlow where 6,600+ unit tests passed but 6 runtime browser bugs reached production — broken components on refresh, TypeError on navigation, dead links, broken audio, lost state. Every one of these is invisible to Jest but immediately obvious in a browser. The framework failed to prevent this because it never required browser verification.

The fix belongs in the framework itself (`~/agentic-sdlc`), not in any individual project. When the framework is updated, all projects using it inherit the requirement.

## What Changes

All changes are to `~/agentic-sdlc/` — the standalone framework repo:

- **Maturity model**: Add browser E2E requirements to Level 4 (Quality) and Level 5 (Evolution) checklists
- **Validation patterns**: Add Layer 5 (Browser Verification) defining user journey testing, refresh resilience, and screenshot proof verification
- **CLAUDE.md**: Update micro cycle to include conditional browser E2E step for frontend changes. Update testing tiers to include Tier 4: Browser E2E. Update Done checklist template to include browser verification before reporting done.
- **Templates**: Add a deploy pipeline template that includes an E2E gate step. Add a browser test template for common scenarios (refresh resilience, user journeys, state persistence).
- **Case studies**: Document the LinguaFlow failure as a case study in `framework/case-studies.md`

## Capabilities

### New Capabilities
- `browser-e2e-maturity-requirement`: Browser E2E as a named maturity requirement at Levels 4 and 5
- `validation-layer-5`: New validation layer for browser-based verification
- `micro-cycle-e2e-step`: Conditional browser E2E step in the agent micro cycle
- `browser-test-templates`: Reusable templates for common browser test scenarios
- `deploy-e2e-gate-template`: Deploy pipeline template with E2E gate before production

### Modified Capabilities
- None

## Impact

- **Files**: `~/agentic-sdlc/framework/maturity-model.md`, `~/agentic-sdlc/framework/validation-patterns.md`, `~/agentic-sdlc/framework/case-studies.md`, `~/agentic-sdlc/CLAUDE.md`, new template files in `~/agentic-sdlc/agents/templates/`
- **Backward compatible**: All additions. Existing maturity levels, validation layers, and micro cycle are preserved.
- **Affects all projects**: Any project bootstrapped from the framework will inherit browser E2E requirements

## Value Analysis

- **Who benefits**: All projects using the agentic SDLC framework — they get browser verification as a structural requirement, not an afterthought
- **What if we don't**: The framework continues to have a blind spot where unit tests pass but runtime browser bugs reach users. Agents ship code that "works in tests" but breaks in the browser.
- **Success metrics**: No browser-detectable bug reaches production in a project following the updated framework. The maturity audit catches missing browser E2E as a gap.
