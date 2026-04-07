# Level 4: Automated Quality Gates

**Prerequisites:** Level 3 complete (task queue draining, agents executing micro cycles).

## What You Add

- Defeat tests: anti-pattern scanners that catch `:any` types, `console.log`, file size violations, missing error handling
- Code reviewer agent: universal review checklist, APPROVED/CHANGES_REQUESTED verdicts
- Browser E2E testing for frontend projects (Playwright/Puppeteer against production builds)

## Steps

### 1. Configure Defeat Tests

Run the four-layer validation scanner:

```bash
node ~/agentic-sdlc/agents/four-layer-validate.mjs
```

This scans for `:any` types, `console.log` statements, file size violations, and missing error handling.

Create an allowlist for pre-existing violations so they do not block new work:

```bash
cp ~/agentic-sdlc/agents/templates/defeat-allowlist.json.template agents/defeat-allowlist.json
```

Edit `agents/defeat-allowlist.json` to list files and patterns that should be exempted.

### 2. Add a Code Reviewer Agent

If your roster does not already include a reviewer, add one:

```bash
node ~/agentic-sdlc/setup.mjs
```

Select the "reviewer" role when prompted, or manually create an agent directory using the code-reviewer template. The reviewer template provides a universal checklist covering test coverage, error handling, naming conventions, and security.

### 3. Add Browser E2E Testing (Frontend Projects)

Build the production artifact locally, serve it, then run browser automation against it. See `agents/templates/browser-tests.md.template` for six test patterns covering navigation, form submission, error states, responsive layout, accessibility, and visual regression.

### 4. Add Defeat Tests to CI

Add this to your CI pipeline:

```bash
node ~/agentic-sdlc/agents/four-layer-validate.mjs --allowlist agents/defeat-allowlist.json
```

New anti-patterns introduced after the allowlist was created will fail the build.

### 5. Validate Agent Prompt Quality

Run behavior tests in dry-run mode to check agent AGENT.md files:

```bash
node ~/agentic-sdlc/agents/test-behavior.mjs --dry-run
```

This validates that agent prompts contain required sections (micro cycle, memory protocol, maturation levels).

## Validation

- Introduce a `:any` type in a TypeScript file. Run `four-layer-validate.mjs` -- it should fail.
- Remove the `:any` type. Run again -- it should pass.
- Trigger a code review. The reviewer agent should produce an APPROVED or CHANGES_REQUESTED verdict.

## Next Level

When you want agents to learn from mistakes and optimize model spending, move to [Level 5: Memory, Failures, and Model Management](level-5-evolution.md).
