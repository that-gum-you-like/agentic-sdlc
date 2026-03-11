## Context

The agentic SDLC framework (`~/agentic-sdlc`) has 4 validation layers (Research, Critique, Code, Statistics), a 7-level maturity model, and a well-defined micro cycle. Testing is prescribed at 3 tiers: unit, integration, and defeat. The framework mentions "front-end e2e" in the lesson plan but it's not in any checklist or enforced step. Browser-based verification doesn't exist as a concept in the framework.

## Goals / Non-Goals

**Goals:**
- Browser E2E testing becomes a named, enforced requirement in the maturity model
- User journey testing is defined as a concept with clear scope
- The micro cycle includes a conditional browser E2E step for frontend work
- Templates exist for common browser test scenarios so projects can bootstrap quickly
- The Done checklist includes browser verification with screenshot proof

**Non-Goals:**
- Prescribing specific tools (Playwright vs Cypress vs Puppeteer) — framework stays tool-agnostic
- Visual regression / pixel diffing — too brittle, not appropriate for framework-level prescription
- Modifying existing maturity levels or validation layers — only additions

## Decisions

### D1: Maturity Model Updates

**Level 4 (Quality) — add to new-project checklist:**
```
- Browser E2E: critical user flows tested in real browser (login → navigate → interact → verify)
- Refresh resilience: route groups survive hard browser refresh
- Deploy gate: E2E must pass before production deploy
```

**Level 5 (Evolution) — add to new-project checklist:**
```
- User journey coverage: new features require corresponding browser journey test
- Dead link audit: navigation targets verified to have content
- State persistence testing: user interactions survive navigation and reload
```

These additions follow the existing pattern: Level 4 establishes quality gates, Level 5 evolves them into coverage requirements.

### D2: Validation Patterns — Layer 5 (Browser Verification)

Add after the existing Layer 4 (Statistics):

```
## Layer 5 — Browser Verification

Tests the system from the user's perspective in a real browser.

### Principles
- User journey tests express user intent, not implementation details
- Tests run against the built artifact, not the dev server
- Every deployable frontend feature has a corresponding browser test
- Screenshot proof is captured and reviewed before reporting done

### Required Scenarios
- **Refresh resilience**: Every route group tested for hard refresh survival
- **Demo/seed mode**: Full login → browse → interact flow verified
- **Navigation completeness**: Every UI link/button navigates to a screen with content
- **State persistence**: User interactions (likes, comments, bookmarks) survive navigation and reload
- **Error states**: Network failures, empty states, and edge cases produce graceful UI

### When to Run
- After any change to screens, navigation, or state management
- As a deploy pipeline gate (before production, after build)
- Post-deploy against production URL as smoke verification
```

### D3: CLAUDE.md — Micro Cycle Update

Update the existing micro cycle (Pick → Implement → Write tests → Run tests → Commit) to include:

```
Pick task → Implement → Write tests → Run tests →
  IF frontend files changed (screens, navigation, components):
    Run browser E2E against local build →
Commit if passing → Next
```

This is a conditional step — backend-only changes skip it. The framework doesn't prescribe the tool, just the requirement.

### D4: CLAUDE.md — Testing Tiers Update

Current tiers: unit, integration, defeat, behavior. Add:

```
Tier 5: Browser E2E
- Run when: any change to app screens, navigation, state management, or components
- What it checks: real browser rendering, navigation flows, state persistence, refresh resilience
- Tools: Playwright, Puppeteer, or equivalent browser automation
- Gate: must pass before deploy to production
```

### D5: CLAUDE.md — Done Checklist Update

Update the Done checklist template to include browser verification:

```
### Done Checklist
1. Tests pass (unit + defeat + behavior)
2. Browser E2E pass (for frontend changes)
3. Commit + push
4. Deploy via pipeline
5. Post-deploy browser verification
   - Exercise every changed feature in a real browser
   - Screenshot at every step
   - Visually confirm each screenshot shows correct rendering
   - Fix and re-deploy if any verification fails
6. Notify stakeholder LAST — only after browser verification passes
```

### D6: Templates — Browser Test Scenarios

Add `agents/templates/browser-tests.md.template` documenting common browser test patterns projects should implement:

1. **Refresh resilience** — login → navigate to each route group → reload → verify content still renders
2. **User journey** — login → primary flow (browse → select → interact → verify result)
3. **Navigation completeness** — every visible link/button → verify target has content
4. **State persistence** — interact → navigate away → return → verify state retained
5. **Demo/seed mode** — verify demo data loads without network calls to production APIs
6. **Error resilience** — network failure → verify graceful error UI (not blank screen or TypeError)

### D7: Case Studies — Document the LinguaFlow Failure

Add to `framework/case-studies.md`:

**Case: "6,600 tests pass, 6 browser bugs ship"**
- Project had comprehensive unit test coverage (6,600+ tests, 431 suites)
- 5 Playwright smoke tests ran post-deploy checking DOM text presence
- User found 6 bugs on production: broken refresh, TypeError on navigation, dead links, broken audio, lost state
- Root cause: no test tier verified runtime browser behavior. Unit tests mock the browser. Smoke tests checked "does text X appear?" not "does flow Y work?"
- Fix: Added browser E2E as a maturity requirement, validation layer, and deploy gate

## Alternatives Considered

- **Prescribe Playwright specifically**: Rejected — framework should be tool-agnostic. Projects choose their browser automation tool.
- **Make browser E2E Level 2 (Foundation)**: Rejected — Level 2 projects may not have frontend components. Browser E2E is a quality concern, not a foundation concern.
- **Add visual regression (pixel diffing)**: Rejected — too brittle for rapidly iterating projects, adds significant infrastructure overhead. Screenshot + human review is more practical.
- **Require E2E for every commit**: Rejected — E2E is slow. Conditional on frontend file changes is the right balance.
