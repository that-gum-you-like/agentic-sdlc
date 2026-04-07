## ADDED Requirements

### Requirement: CTO orchestrator template
The framework SHALL provide `agents/templates/execution-agents/cto-orchestrator.md` as a **standalone replacement** template (not addendum) for the CTO/orchestrator role. The CTO micro cycle is: decompose → delegate → monitor → unblock → report. It SHALL NOT include code implementation steps.

#### Scenario: CTO template replaces base template
- **WHEN** `setup.mjs` detects role keywords `cto` or `orchestrat`
- **THEN** the CTO template replaces the base `AGENT.md.template` output entirely (not appended)
- **AND** the agent's AGENT.md contains delegation rules, monitoring protocol, and escalation procedures
- **AND** the agent's AGENT.md does NOT contain "Implement", "Write tests", or "Commit" in its micro cycle

#### Scenario: CTO non-negotiable rules
- **WHEN** a CTO agent is created
- **THEN** its AGENT.md includes: "NEVER write code directly — always create subtasks and delegate", "Use `in_review` status for board handoffs", "Escalate system-level blockers immediately"

### Requirement: Code reviewer template
The framework SHALL provide `agents/templates/execution-agents/code-reviewer.md` as an addendum with a universal review checklist, structured verdict format (APPROVED / CHANGES REQUESTED), and severity tags (critical/high/medium/low).

#### Scenario: Reviewer addendum appended
- **WHEN** `setup.mjs` detects role keywords `review` or `code review`
- **THEN** the addendum is appended to the base AGENT.md
- **AND** includes checklist items: no `:any` types, no `console.log`, file size limits, return pattern consistency, no hardcoded secrets, accessibility labels

#### Scenario: Verdict format
- **WHEN** a reviewer completes a review
- **THEN** the output uses format: `## Verdict: APPROVED|CHANGES_REQUESTED` followed by issues with severity tags and actionable suggestions

### Requirement: Release manager template
The framework SHALL provide `agents/templates/execution-agents/release-manager.md` as an addendum with merge sequencing rules, deploy pipeline gates, and changelog management.

#### Scenario: Release manager non-negotiable rules
- **WHEN** a release manager agent is created
- **THEN** its AGENT.md includes: "Clean git merge != safe merge — run full test suite on merged state", "Never force-push without approval", "Serialize shared-file merges", "Never bypass deploy pipeline with manual commands"

### Requirement: Backend developer template
The framework SHALL provide `agents/templates/execution-agents/backend-developer.md` as an addendum with service patterns, data layer rules, and common anti-patterns.

#### Scenario: Backend rules
- **WHEN** a backend developer agent is created
- **THEN** its AGENT.md includes: services <150 lines, typed `{data, error}` returns, no queries inside `.map()`, no `.select('*')` on content tables, no raw SQL without parameterization

### Requirement: Frontend developer template
The framework SHALL provide `agents/templates/execution-agents/frontend-developer.md` as an addendum with screen patterns, accessibility rules, and state management guidelines.

#### Scenario: Frontend rules
- **WHEN** a frontend developer agent is created
- **THEN** its AGENT.md includes: screens <200 lines, every interactive element needs accessibility labels, handle all 3 hook states (loading/error/data), no hardcoded pixel values, extract sub-components at complexity threshold

### Requirement: AI/ML engineer template
The framework SHALL provide `agents/templates/execution-agents/ai-engineer.md` as an addendum with LLM integration patterns, token management, and prompt engineering rules.

#### Scenario: AI engineer rules
- **WHEN** an AI engineer agent is created
- **THEN** its AGENT.md includes: validate output schema, max 2 retries, track token usage, cap input at context window limits, API keys ONLY from environment variables, pre-estimate tokens before API calls

### Requirement: Documentarian template
The framework SHALL provide `agents/templates/execution-agents/documentarian.md` as an addendum with documentation accuracy rules and verification procedures.

#### Scenario: Documentarian rules
- **WHEN** a documentarian agent is created
- **THEN** its AGENT.md includes: verify every CLI command in clean environment, doc updates are code (same commit as change), never document from memory — verify against current source, every code example must compile/run

### Requirement: Security engineer template
The framework SHALL provide `agents/templates/execution-agents/security-engineer.md` as an addendum with security audit checklist and vulnerability detection patterns.

#### Scenario: Security rules
- **WHEN** a security engineer agent is created
- **THEN** its AGENT.md includes: flag all hardcoded secrets/keys, validate all user input at boundaries, check OWASP top 10 on every PR, audit dependencies for known CVEs, verify RLS/auth on data access endpoints

### Requirement: QA engineer template
The framework SHALL provide `agents/templates/execution-agents/qa-engineer.md` as an addendum with E2E testing patterns and production verification procedures.

#### Scenario: QA rules
- **WHEN** a QA engineer agent is created
- **THEN** its AGENT.md includes: test against production build (not dev server), screenshot every step, fail on JS console errors, module certification before deploy, visual regression detection

### Requirement: Integration tester template
The framework SHALL provide `agents/templates/execution-agents/integration-tester.md` as an addendum with contract testing rules and boundary validation patterns.

#### Scenario: Integration tester rules
- **WHEN** an integration tester agent is created
- **THEN** its AGENT.md includes: test real database (not mocks), validate schema at service boundaries, detect N+1 queries, verify API contract consistency, test error paths across service boundaries

### Requirement: Ethics advisor template
The framework SHALL provide `agents/templates/execution-agents/ethics-advisor.md` as an addendum with a generic ethical review framework that projects customize.

#### Scenario: Ethics advisor framework
- **WHEN** an ethics advisor agent is created
- **THEN** its AGENT.md includes: `{{ETHICAL_FRAMEWORK}}` placeholder for project-specific ethics lens, bias detection checklist, privacy audit protocol, user impact assessment template
- **AND** the template is technology and domain-agnostic

### Requirement: YAML frontmatter metadata
Every execution agent template SHALL include YAML frontmatter with `role_keywords`, `archetype`, `default_patterns`, and `capabilities` fields. `setup.mjs` reads this metadata for auto-configuration.

#### Scenario: Frontmatter parsed by setup.mjs
- **WHEN** `setup.mjs` detects a role keyword matching a template's `role_keywords`
- **THEN** it reads the template's `default_patterns` and offers them as the default file patterns prompt
- **AND** it reads the template's `capabilities` and assigns them to the agent in `capabilities.json`
