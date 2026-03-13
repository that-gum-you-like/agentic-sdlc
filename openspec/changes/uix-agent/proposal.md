## Why

The agentic SDLC has strong coverage for backend (Roy archetype), frontend logic (Jen archetype), AI pipelines (Moss archetype), code review (Richmond archetype), releases (Denholm archetype), and documentation (Douglas archetype) — but no agent specializes in **UI/UX quality**. Frontend agents write functional code that renders correctly, but nobody enforces design system consistency, accessibility compliance, visual hierarchy, responsive behavior, or interaction polish. UI/UX issues are caught late (post-deploy browser verification) or not at all. A dedicated UI/UX agent shifts design quality left — catching issues during implementation, not after.

## What Changes

- **New agent archetype: `uix` (UI/UX Designer)** — a support-tier agent (haiku model) that reviews and implements visual design, accessibility, and interaction quality
- **New capability: `designSystemAudit`** — checks component output against design tokens (spacing, color, typography, contrast ratios)
- **New capability: `accessibilityAudit`** — validates WCAG 2.1 AA compliance (semantic HTML, ARIA, focus management, touch targets, contrast)
- **New capability: `visualReview`** — uses browser screenshots to evaluate layout, visual hierarchy, responsive behavior, and interaction states
- **New capability: `storybookGovernance`** — ensures components have Storybook stories covering key states, and that stories stay in sync with implementation
- **New domain patterns** in `domains.json.template` for routing UI/UX tasks (style files, theme configs, design tokens, component visual props, Storybook stories)
- **Updated `capabilities.json.template`** with a `uix` archetype entry
- **Updated `AGENT.md.template`** documentation to reference the UIX role
- **New Storybook integration guidance** in the agent's operating rules (story-driven development, visual testing via Storybook + browser automation)
- **Updated `setup.mjs`** to recognize the `uix` role during bootstrapping

## Value Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| User Impact | High | Catches visual/accessibility regressions before users see them |
| Developer Velocity | Medium | Reduces back-and-forth on UI polish during review |
| Quality Gate | High | Adds a missing validation layer — design consistency is currently unguarded |
| Framework Completeness | High | Fills the last major gap in the agent archetype roster |
| Effort | Medium | New templates + capabilities + setup.mjs changes, but follows established patterns |

## Capabilities

### New Capabilities
- `uix-agent-archetype`: Agent template, core memory, domain patterns, and capabilities definition for the UI/UX Designer archetype
- `uix-design-system-audit`: Design token enforcement — spacing, color palette, typography, and component consistency checks
- `uix-accessibility-audit`: WCAG 2.1 AA compliance validation — semantic HTML, ARIA roles, contrast ratios, focus management, touch targets
- `uix-visual-review`: Screenshot-based visual review — layout evaluation, responsive behavior, visual hierarchy, interaction states
- `uix-storybook-governance`: Storybook story coverage enforcement — ensuring components have stories for key states, stories stay in sync with code

### Modified Capabilities
- (none — all new additions, no existing spec changes)

## Impact

- **Templates affected**: `AGENT.md.template` (reference only), `capabilities.json.template` (new archetype), `domains.json.template` (new patterns)
- **Scripts affected**: `setup.mjs` (recognize `uix` role), `worker.mjs` (inject UIX-specific prompt context)
- **No breaking changes** — existing projects continue to work; the UIX agent is opt-in during `setup.mjs` bootstrapping
- **Dependencies**: Projects using the UIX agent should have Storybook installed (`@storybook/react` or equivalent) for full story governance capability. The agent degrades gracefully without it (skips Storybook checks, focuses on accessibility + design tokens)
- **Browser automation**: Leverages existing Tier 5 browser E2E infrastructure (Playwright/OpenClaw browser) for visual review — no new tooling required
