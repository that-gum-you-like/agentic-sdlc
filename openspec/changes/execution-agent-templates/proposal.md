## Why

The agentic-sdlc framework templates planning agents (5) and model-manager (1) but has zero execution agent templates. Every project using the framework builds execution agents from the generic `AGENT.md.template` — losing the battle-tested operating rules, domain boundaries, failure patterns, and quality gates that LinguaFlow's agents evolved over 6 months. Additionally, industry frameworks (MetaGPT, ChatDev, CrewAI) demonstrate valuable agent roles the framework doesn't yet offer.

This means:
- New projects start with blank-slate agents that repeat LinguaFlow's first 6 weeks of mistakes
- Projects lack specialist roles (dependency auditor, performance sentinel) that prevent entire categories of production incidents
- The framework's value proposition is incomplete — it provides orchestration but not the agents that get orchestrated

## Value Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| User Value | 10/10 | Every new project gets production-ready agent team from day 1 |
| Complexity | 4/10 | Templates are markdown + JSON — no script changes needed |
| Risk | 1/10 | Purely additive; projects choose which templates to instantiate |
| Urgency | 8/10 | Every day without templates, new projects rediscover LinguaFlow's mistakes |

## What Changes

### Execution Agent Templates (from LinguaFlow field experience)

11 new agent templates in `agents/templates/execution-agents/`, each containing:
- `<role>.md` — system prompt with identity, domain, operating rules, non-negotiable rules, failure patterns
- Domain patterns for `domains.json` routing
- Capability definitions for `capabilities.json`

| Template | Based On | Domain |
|----------|----------|--------|
| `cto-orchestrator.md` | LinguaFlow CTO | Planning orchestration, monitoring, decision-making, delegation. NEVER codes — only decomposes, assigns, and unblocks. |
| `code-reviewer.md` | LinguaFlow Richmond | Universal review checklist (code quality, types, console.log, file size, return patterns, security, accessibility). Verdict format: APPROVED / CHANGES REQUESTED with severity tags. |
| `release-manager.md` | LinguaFlow Denholm | Merge sequencing, changelog, CI/CD, deploy pipeline. Rules: serialize shared-file merges, full test suite on merged state, never force-push without approval. |
| `backend-developer.md` | LinguaFlow Roy | Services, stores, hooks, migrations, data layer. Rules: services <150 lines, typed returns `{ data, error }`, no queries inside `.map()`, no `.select('*')` on content tables. |
| `frontend-developer.md` | LinguaFlow Jen | Screens, components, navigation, styling, accessibility. Rules: screens <200 lines, every interactive element needs `accessibilityLabel`, handle all 3 hook states (loading/error/data), no hardcoded px. |
| `ai-engineer.md` | LinguaFlow Moss | LLM integration, prompt engineering, transcription, schema validation. Rules: validate output schema, max 2 retries, track tokens, cap input at context window limits, API keys ONLY from env. |
| `documentarian.md` | LinguaFlow Douglas | API docs, integration guides, setup guides, README. Rules: verify every CLI command in clean env, doc updates are code (same commit), never document from memory — verify against current source. |
| `security-engineer.md` | LinguaFlow Security | Code audit, dependency review, RLS policies, auth checks, incident response. Rules: flag all hardcoded secrets, validate all user input, check OWASP top 10 on every PR. |
| `qa-engineer.md` | LinguaFlow QA Engineer | E2E browser tests, module certification, smoke tests, visual regression. Rules: test against production build (not dev server), screenshot every step, fail on JS console errors. |
| `integration-tester.md` | LinguaFlow Integration Tester | Service-to-API contract tests, boundary testing, anti-pattern detection. Rules: test real database (not mocks), validate schema at boundaries, detect N+1 queries. |
| `ethics-advisor.md` | LinguaFlow Human Touch (abstracted) | Ethics review, bias detection, privacy audit, user impact assessment. Project specifies the ethical framework (humanistic, deontological, utilitarian, etc.). |

### Novel Agent Templates (from industry best practices)

4 additional templates addressing gaps identified across MetaGPT, CrewAI, and practitioner experience:

| Template | Domain | Why Valuable |
|----------|--------|-------------|
| `architect.md` | System design, architecture decisions, tech stack selection, dependency graph management. Produces ADRs (Architecture Decision Records). | MetaGPT showed architect as distinct from CTO — CTO orchestrates, architect designs structures. Prevents organic spaghetti. |
| `dependency-auditor.md` | Supply chain security, CVE scanning, license compliance, version drift detection, breaking change alerts. Runs on cron. | Nobody does this manually until a CVE hits. Autonomous scanning catches `left-pad` scenarios before they become incidents. |
| `performance-sentinel.md` | Benchmark tracking, bundle size monitoring, query performance, memory leak detection, regression flagging. Runs on every commit or cron. | Performance regressions are invisible until users complain. Automated sentinel catches the 2x slowdown before it ships. |
| `research-agent.md` | Context gathering, codebase exploration, documentation reading, prior art analysis. Runs BEFORE other agents to reduce hallucination and wasted tokens. | CrewAI pattern — research agent gathers context so execution agents don't waste tokens exploring. Reduces first-attempt failure rate. |

### Template Infrastructure Updates

- **`setup.mjs`**: Add execution agent selection during setup — show available templates, let user pick which roles to instantiate. Auto-configure `domains.json` and `capabilities.json` from template metadata.
- **`capabilities.json.template`**: Add capability definitions for all 15 new roles.
- **`domains.json.template`**: Add domain pattern examples for all 15 new roles.
- **`AGENT.md.template`**: Enhance base template with evolved patterns from LinguaFlow — explicit evolution timeline (Week 1-6 maturation), failure memory severity guidance, SHARED_PROTOCOL reference.
- **Agent routing docs**: Update `framework/agent-routing.md` to include execution agents alongside planning agents.

### Template Structure Convention

Each execution agent template follows this structure:
```
agents/templates/execution-agents/
├── cto-orchestrator.md
├── code-reviewer.md
├── release-manager.md
├── backend-developer.md
├── frontend-developer.md
├── ai-engineer.md
├── documentarian.md
├── security-engineer.md
├── qa-engineer.md
├── integration-tester.md
├── ethics-advisor.md
├── architect.md
├── dependency-auditor.md
├── performance-sentinel.md
└── research-agent.md
```

Templates use `{{VARIABLE}}` placeholders that `setup.mjs` fills during project instantiation:
- `{{NAME}}`, `{{ROLE}}` — agent identity
- `{{TECH_STACK}}` — project-specific technology (React, Django, etc.)
- `{{APP_DIR}}` — project app directory
- `{{TEST_CMD}}` — project test command

## Capabilities

### New Capabilities
- `execution-agent-templates`: 11 battle-tested execution agent templates from LinguaFlow field experience
- `novel-agent-templates`: 4 high-value agent templates from industry best practices (architect, dependency-auditor, performance-sentinel, research-agent)
- `template-infrastructure`: Setup.mjs execution agent selection, auto-configured domains/capabilities, enhanced base template

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **New directory**: `agents/templates/execution-agents/` — 15 template files
- **Modified files**: `setup.mjs` (execution agent picker), `agents/templates/capabilities.json.template` (15 new role definitions), `framework/agent-routing.md` (execution agent routing), `CLAUDE.md` (document new templates)
- **New docs**: `docs/execution-agents.md` — guide to choosing and customizing execution agent templates
- **No breaking changes**: Existing projects unaffected; new templates are opt-in during setup
