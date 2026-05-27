## 1. Template Infrastructure

- [x] 1.1 Create `agents/templates/execution-agents/` directory
- [x] 1.2 Add YAML frontmatter parsing to `setup.mjs` — function `parseFrontmatter(templateContent)` that extracts and returns `{ metadata, content }` where metadata has `role_keywords`, `archetype`, `default_patterns`, `capabilities`
- [x] 1.3 Extend role→archetype mapping in `setup.mjs` — replace hardcoded keyword matching with dynamic scan of all `agents/templates/execution-agents/*.md` frontmatter `role_keywords`. Fall back to `backend` archetype when no match found. Show matched template and ask for confirmation.
- [x] 1.4 Add template addendum logic to `setup.mjs` agent creation loop — when a matching execution template is found, strip frontmatter and append content to the agent's AGENT.md after the base template. Special case: CTO template replaces base entirely.
- [x] 1.5 Add default pattern suggestion to `setup.mjs` — when a template match is found, use its `default_patterns` as the default answer for the file patterns prompt
- [x] 1.6 Add capability auto-assignment to `setup.mjs` — when a template match is found, use its `capabilities` field instead of the hardcoded archetype lookup. Merge into capabilities.json.

## 2. LinguaFlow Battle-Tested Templates (11)

- [x] 2.1 Create `agents/templates/execution-agents/cto-orchestrator.md` — YAML frontmatter + full replacement template (not addendum). Micro cycle: decompose → delegate → monitor → unblock → report. Non-negotiable: never code, always delegate, use `in_review` for board handoffs. Failure patterns from LinguaFlow CTO (F-CTO-001 through F-CTO-003).
- [x] 2.2 Create `agents/templates/execution-agents/code-reviewer.md` — YAML frontmatter + addendum. Universal review checklist (code quality, types, console.log, file size, return patterns, secrets, accessibility). Verdict format: APPROVED / CHANGES_REQUESTED with severity tags. Failure pattern: approved exceptions become normalized (hard-block, never soft-suggest).
- [x] 2.3 Create `agents/templates/execution-agents/release-manager.md` — YAML frontmatter + addendum. Merge sequencing, changelog, deploy pipeline gates. Non-negotiable: full test suite on merged state, never force-push, serialize shared-file merges, pipeline-only deploys. Failure pattern: clean merge masked TypeScript duplicate.
- [x] 2.4 Create `agents/templates/execution-agents/backend-developer.md` — YAML frontmatter + addendum. Service patterns: <150 lines, typed `{data, error}` returns, no queries in `.map()`, no `.select('*')` on content tables, no raw SQL. Failure patterns from Roy (maybeSingle vs single, N+1 queries).
- [x] 2.5 Create `agents/templates/execution-agents/frontend-developer.md` — YAML frontmatter + addendum. Screen patterns: <200 lines, accessibility labels on interactive elements, handle all 3 hook states, no hardcoded px, extract sub-components. Failure patterns from Jen (missing loading states, hardcoded pixels).
- [x] 2.6 Create `agents/templates/execution-agents/ai-engineer.md` — YAML frontmatter + addendum. LLM integration: validate output schema, max 2 retries, track tokens, cap input at context window, API keys from env only. Failure patterns from Moss (22-min transcript exceeded context, hardcoded API key fallback).
- [x] 2.7 Create `agents/templates/execution-agents/documentarian.md` — YAML frontmatter + addendum. Accuracy rules: verify CLI commands in clean env, doc-as-code (same commit), never document from memory. Failure patterns from Douglas (stale API shapes, incorrect CLI in setup guide).
- [x] 2.8 Create `agents/templates/execution-agents/security-engineer.md` — YAML frontmatter + addendum. OWASP top 10 checklist, dependency audit, hardcoded secret detection, RLS/auth verification, input validation at boundaries.
- [x] 2.9 Create `agents/templates/execution-agents/qa-engineer.md` — YAML frontmatter + addendum. E2E patterns: test against production build, screenshot every step, fail on console errors, module certification, visual regression, smoke test gates.
- [x] 2.10 Create `agents/templates/execution-agents/integration-tester.md` — YAML frontmatter + addendum. Contract testing: real database (not mocks), schema validation at boundaries, N+1 detection, error path testing across services.
- [x] 2.11 Create `agents/templates/execution-agents/ethics-advisor.md` — YAML frontmatter + addendum. Generic framework: `{{ETHICAL_FRAMEWORK}}` placeholder, bias detection checklist, privacy audit protocol, user impact assessment. Technology and domain-agnostic.

## 3. Novel Agent Templates (4)

- [x] 3.1 Create `agents/templates/execution-agents/architect.md` — YAML frontmatter + addendum. ADR format (Context, Decision, Consequences, Alternatives), system design patterns, dependency graph management. Default patterns: `docs/decisions/`, `architecture/`, `*.openapi.*`, `docker*`, `infra/`.
- [x] 3.2 Create `agents/templates/execution-agents/dependency-auditor.md` — YAML frontmatter + addendum. Cron-based: CVE scanning, license compliance, version drift detection, deprecated dependency flags. Creates tasks for security-engineer on findings. Sends `highSeverityFailure` notifications on critical CVEs.
- [x] 3.3 Create `agents/templates/execution-agents/performance-sentinel.md` — YAML frontmatter + addendum. Cron-based: benchmark tracking, bundle size monitoring, query performance thresholds, regression detection (bundle +10%, response time +50%, test duration +25%). Creates tasks for relevant domain agent on regression.
- [x] 3.4 Create `agents/templates/execution-agents/research-agent.md` — YAML frontmatter + addendum. Context gathering: codebase exploration, documentation reading, prior art analysis. Produces context documents linked as dependencies for execution tasks. Default patterns: `docs/`, `README*`, `CHANGELOG*`, `openspec/`, `plans/`.

## 4. Configuration Updates

- [x] 4.1 Update `agents/templates/capabilities.json.template` — add capability profiles for all 15 execution roles: `cto-orchestrator`, `code-reviewer`, `release-manager`, `backend-developer`, `frontend-developer`, `ai-engineer`, `documentarian`, `security-engineer`, `qa-engineer`, `integration-tester`, `ethics-advisor`, `architect`, `dependency-auditor`, `performance-sentinel`, `research-agent`
- [x] 4.2 Update `framework/agent-routing.md` — add all 15 execution agent roles to the routing flowchart and decision table alongside existing planning agents. Include trigger conditions and domain patterns for each.
- [x] 4.3 Update `CLAUDE.md` script reference and agent system sections — document the execution agent templates, how setup.mjs applies them, and the addendum vs replacement distinction

## 5. Documentation

- [x] 5.1 Create `docs/execution-agents.md` — guide covering: available templates (table with name, domain, key rules), how to choose agents for your project, how to customize post-setup, how to create new templates (addendum pattern with frontmatter), CTO as replacement exception, starter roster suggestions by project type
- [x] 5.2 Update `agents/templates/cron-schedule.json.template` — add suggested crons for dependency-auditor (daily) and performance-sentinel (per-commit or hourly)

## 6. Testing

- [x] 6.1 Add behavior tests to `agents/test-behavior.mjs` — verify all 15 execution templates exist, have valid YAML frontmatter, define `role_keywords` and `capabilities`, and non-CTO templates contain "## " section headers (addendum format)
- [x] 6.2 Add unit tests to `tests/adapter-and-model-manager.test.mjs` — verify frontmatter parsing, role keyword matching, template selection logic, CTO replacement vs addendum distinction
- [x] 6.3 Add integration test — simulate `setup.mjs` flow for a "backend" role agent: verify AGENT.md contains both base template content AND backend addendum content, capabilities.json has backend-developer profile, domains.json has default patterns
