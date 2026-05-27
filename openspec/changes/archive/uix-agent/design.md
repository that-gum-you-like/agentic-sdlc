## Context

The agentic SDLC framework defines agent archetypes via templates (`AGENT.md.template`, `capabilities.json.template`, `domains.json.template`) that `setup.mjs` uses to bootstrap project-specific agent rosters. Currently 9 archetypes exist: backend, frontend, AI pipeline, reviewer, release, docs, requirements-engineer, value-analyst, product-manager, quality-alignment, and parallelization-analyst.

UI/UX quality is handled implicitly — the frontend agent (Jen archetype) writes functional UI code and browser E2E tests verify rendering, but no agent specializes in design system enforcement, accessibility compliance, or visual polish. The Claude frontend-design plugin demonstrates that LLMs can evaluate and generate production-grade visual design when given the right prompt framing (aesthetic direction, typography, color theory, spatial design, motion).

Storybook is the industry standard for component isolation, visual testing, and design system documentation. Integrating Storybook governance into the agent's responsibilities creates a natural workflow: components get stories → stories get visual review → visual review catches regressions.

## Goals / Non-Goals

**Goals:**
- Add a `uix` agent archetype to the framework templates
- Define 4 new capabilities: designSystemAudit, accessibilityAudit, visualReview, storybookGovernance
- Update `setup.mjs` to recognize the `uix` role and configure it as support-tier (haiku)
- Update `capabilities.json.template` with the `uix` archetype
- Update `domains.json.template` with UIX file patterns
- Provide a specialized AGENT.md section for the UIX agent's operating rules (design-specific micro cycle additions)
- Ensure the UIX agent integrates with existing browser E2E infrastructure (Tier 5)

**Non-Goals:**
- Building a Storybook plugin or addon (the agent uses Storybook's existing CLI and APIs)
- Automated visual regression diffing tooling (the agent uses screenshots + LLM vision, same as existing Tier 5)
- Figma/design tool integration (out of scope — the agent works from design tokens and code, not design files)
- Replacing the frontend agent's responsibilities (UIX reviews and polishes, Jen builds features)
- Creating a full design system from scratch (the agent enforces whatever tokens/system the project defines)

## Decisions

### 1. Support-tier agent (haiku model)

**Decision:** The UIX agent runs on haiku, same as Richmond (reviewer), Denholm (release), and Douglas (docs).

**Rationale:** UIX work is primarily review and audit — reading code, checking patterns, evaluating screenshots. It doesn't need the reasoning depth of sonnet-tier agents that write complex business logic. Haiku is sufficient for pattern matching against design tokens, WCAG rules, and Storybook story coverage. This keeps costs aligned with other support agents.

**Alternative considered:** Sonnet tier — rejected because the UIX agent's tasks are well-defined checklists, not open-ended problem solving.

### 2. Four distinct capabilities (not one monolithic "uix-review")

**Decision:** Split into designSystemAudit, accessibilityAudit, visualReview, and storybookGovernance.

**Rationale:** Capability monitoring tracks drift per capability. A monolithic capability would hide which specific UIX concern is being skipped. Splitting them lets the framework detect "this agent hasn't done an accessibility audit in 5 tasks" distinctly from "Storybook governance is being skipped." Also allows projects to mark some as conditional (e.g., storybookGovernance only when Storybook is installed).

**Alternative considered:** Two capabilities (design + accessibility) — rejected because visual review (screenshot-based) and Storybook governance are distinct workflows with different triggers.

### 3. Domain patterns: style files, design tokens, component visual props, Storybook stories

**Decision:** Route tasks to the UIX agent based on these file patterns:
- `**/*.stories.*` (Storybook stories)
- `**/tokens/**`, `**/theme/**`, `**/design-system/**` (design tokens)
- `**/*.css`, `**/*.scss`, `**/*.styled.*` (style files)
- Keywords: `accessibility`, `a11y`, `wcag`, `design system`, `visual`, `storybook`, `responsive`, `animation`, `typography`, `color`, `spacing`, `contrast`

**Rationale:** These patterns capture the UIX agent's domain without overlapping with the frontend agent's patterns (which focus on screens, navigation, components as functional units). The UIX agent cares about *how things look and feel*, the frontend agent cares about *what they do*.

### 4. Integration with existing browser E2E (not a new tool)

**Decision:** The UIX agent uses the same Playwright/OpenClaw browser infrastructure as Tier 5 browser E2E tests. No new tooling.

**Rationale:** The framework already has browser screenshot capabilities. The UIX agent's `visualReview` capability is differentiated by *what it looks for* in screenshots (visual hierarchy, spacing consistency, responsive breakpoints), not by *how* it takes them.

### 5. Storybook governance as conditional capability

**Decision:** `storybookGovernance` is conditional ("when Storybook is installed in the project"). The other three capabilities are required.

**Rationale:** Not every project uses Storybook. The UIX agent should still be useful for design tokens, accessibility, and visual review in projects without Storybook. The agent degrades gracefully — it skips story checks and focuses on the other three capabilities.

### 6. UIX agent reviews frontend agent's work (not vice versa)

**Decision:** The UIX agent acts as a design reviewer. When Jen (frontend) completes a task that touches visual files, the UIX agent can be assigned a follow-up review task.

**Rationale:** This mirrors how Richmond (reviewer) reviews code quality. The UIX agent reviews visual quality. The queue-drainer already supports task dependencies (`blockedBy`), so a UIX review task can depend on the frontend implementation task.

## Risks / Trade-offs

- **[Risk] Overlap with reviewer agent** → Mitigation: Clear domain separation. Richmond reviews code quality (logic, patterns, tests). UIX reviews visual quality (design tokens, accessibility, layout). Document the boundary in both agents' AGENT.md.
- **[Risk] Storybook adds project complexity** → Mitigation: Storybook governance is conditional. Projects without Storybook get the other 3 capabilities. The framework doesn't force Storybook adoption.
- **[Risk] Haiku may miss subtle visual issues** → Mitigation: For critical visual reviews, the UIX agent can escalate to a human task. The capability monitoring will track if visual reviews are consistently low-quality, signaling a need for model tier upgrade.
- **[Risk] Design token enforcement requires project-specific token definitions** → Mitigation: The designSystemAudit capability checks *consistency* (are the same tokens used throughout?) rather than *correctness* (are these the right tokens?). Projects define their own tokens; the agent enforces their consistent use.
