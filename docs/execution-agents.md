# Execution Agent Templates

## Overview

The framework provides 15 execution agent templates in `agents/templates/execution-agents/`. These are starter operating rules for specialist agents -- not full AGENT.md files (with one exception).

Templates follow two patterns:

- **Addendum** (14 of 15): Content is appended to the base `AGENT.md.template` during setup. The base template provides identity, memory protocol, micro cycle, and shared rules. The addendum adds domain-specific operating rules, quality patterns, and failure patterns.
- **Replacement** (CTO only): Replaces the base `AGENT.md.template` entirely. The CTO orchestrator has a fundamentally different operating model -- it decomposes and delegates rather than implementing, so the standard micro cycle does not apply.

During `setup.mjs`, templates are auto-detected by matching role keywords you enter against each template's YAML frontmatter.

---

## Available Templates

| Template | Role Keywords | Domain | Key Rules |
|----------|--------------|--------|-----------|
| `ai-engineer` | ai, ml, llm, machine learning, ai pipeline | LLM integration, prompts, transcription, embeddings | Validate LLM output against schema; max 2 retries; track token usage per call |
| `architect` | architect, system design, technical architect | System design, ADRs, API contracts, tech stack evaluation | Every significant decision documented as an ADR; dependency graph awareness |
| `backend-developer` | backend, services, api, data layer, server | Services, stores, hooks, migrations, data access | Services <150 lines; return `{data, error}`; no queries in loops; no `select('*')` |
| `code-reviewer` | code review, reviewer, review | Universal review gate across all code | No `:any` types; no `console.log`; file size limits enforced; hard-block violations never soft-suggested |
| `cto-orchestrator` | cto, orchestrat, technical director | Decompose, delegate, monitor, unblock | **Replacement template.** Orchestration cycle replaces micro cycle; does not write code |
| `dependency-auditor` | dependency, supply chain, cve, license audit | CVE scanning, license compliance, version drift | Cron-based; scans manifests daily; flags copyleft in proprietary projects; creates tasks on critical findings |
| `documentarian` | document, docs, technical writer | API docs, guides, README, CHANGELOG | Verify every CLI command in clean shell; doc updates in same commit as code changes |
| `ethics-advisor` | ethics, ethical, responsible ai, bias | Bias detection, privacy audit, user impact assessment | Bias checklist on every feature; never approve data collection without documented purpose |
| `frontend-developer` | frontend, mobile, ui developer, screen, react | Screens, components, navigation, styling | Screens <200 lines; every interactive element needs `accessibilityLabel`; handle loading/error/data states |
| `integration-tester` | integration test, contract test, api test | Contract tests, boundary validation, N+1 detection | Test against real database (not mocks); validate schema at service boundaries |
| `performance-sentinel` | performance, benchmark, profiler, perf | Benchmarks, bundle size, query performance, memory leaks | Cron-based; compare metrics against baselines; flag regressions that exceed thresholds |
| `qa-engineer` | qa, e2e, quality assurance, test engineer | Browser E2E, module certification, smoke tests, visual regression | Test against production build; screenshot every step; fail on JS console errors |
| `release-manager` | release, deploy, devops | Merge sequencing, changelog, deploy pipeline gates | Never bypass deploy pipeline; serialize merges on shared files; smoke test after deploy |
| `research-agent` | research, context, investigation, spike | Context gathering, codebase exploration, prior art | Runs before execution agents; produces context documents; reduces hallucination |
| `security-engineer` | security, infosec, appsec | OWASP, CVE audit, auth/RLS, incident response | OWASP top 10 on every PR; flag hardcoded secrets; validate all user input at boundaries |

---

## Starter Rosters by Project Type

Pick a roster based on your project's needs. You can always add agents later with `setup.mjs`.

### Web Application (minimum viable team)

| Agent | Why |
|-------|-----|
| backend-developer | Services, API, data layer |
| frontend-developer | Screens, components, UI |
| code-reviewer | Quality gate on all code |
| release-manager | Deploy pipeline, merge safety |
| documentarian | Keeps docs accurate and current |

### AI Product

Start with the web application roster, then add:

| Agent | Why |
|-------|-----|
| ai-engineer | LLM integration, prompt engineering, output validation |
| research-agent | Context gathering before execution to reduce wasted tokens |

### Security-Sensitive

Start with the web application roster, then add:

| Agent | Why |
|-------|-----|
| security-engineer | OWASP review, auth/RLS audit, incident response |
| dependency-auditor | Automated CVE scanning and license compliance (runs on cron) |

### Performance-Critical

Start with the web application roster, then add:

| Agent | Why |
|-------|-----|
| performance-sentinel | Benchmark tracking, regression detection (runs on cron) |
| qa-engineer | Browser E2E, visual regression, smoke test gates |

### Full Team (all 15)

Use all templates. Appropriate for large projects with broad requirements. Includes the CTO orchestrator to coordinate work across all specialists, the architect for system design governance, the ethics-advisor for responsible development review, and the integration-tester for cross-service contract validation.

---

## How Setup.mjs Applies Templates

When you run `node ~/agentic-sdlc/setup.mjs` and enter a role for a new agent, the following happens:

1. **Keyword matching.** `setup.mjs` reads the YAML frontmatter of every `.md` file in `agents/templates/execution-agents/`. It compares the role you entered against each template's `role_keywords` array. Partial matches work -- entering "backend" matches `["backend", "services", "api", "data layer", "server"]`.

2. **Default file patterns.** The matched template's `default_patterns` are suggested as the agent's domain routing patterns. For example, matching `backend-developer` suggests `["services/", "stores/", "hooks/", "migrations/", "api/"]`. You can accept or customize these.

3. **Capability profiles.** If the template defines a `capabilities` block, those are written to `agents/capabilities.json` for the new agent. Capabilities have three tiers:
   - `required` -- the agent must use these on every task (e.g., `memoryRecall`, `costTracking`)
   - `conditional` -- used only in specific situations, with a description of when
   - `notExpected` -- using these triggers a scope creep alert from the capability monitor

4. **Template application.**
   - **Addendum templates:** The base `AGENT.md.template` is rendered first (filling in agent name, role, project details). Then the matched template's markdown content is appended below the base.
   - **Replacement templates:** The base template is skipped entirely. The matched template is rendered as the complete `AGENT.md`. Currently only `cto-orchestrator` uses this pattern.

5. **Output.** The rendered `AGENT.md` is written to `agents/<agent-name>/AGENT.md` in your project directory. Memory files (`core.json`, `long-term.json`, etc.) are also scaffolded.

---

## Customizing Templates Post-Setup

After setup, the template content lives directly in your agent's `AGENT.md`. There is no ongoing link to the template file -- it was a one-time scaffold.

Edit the agent's `AGENT.md` directly to:

- **Add project-specific rules.** For example, a backend-developer on a Supabase project might add: "Always use `.maybeSingle()` for user profile lookups."
- **Add tech stack details.** Specify the exact frameworks, libraries, and conventions your project uses.
- **Record failure patterns.** When an agent makes a mistake, add it to the Known Failure Patterns section with an ID (e.g., `F-003`) and a description of what went wrong and the correct behavior. These become part of the agent's permanent operating rules.
- **Adjust file size limits.** The defaults (services <150 lines, screens <200 lines) work well for most projects but can be tuned.
- **Remove inapplicable rules.** If a rule does not apply to your stack, remove it rather than leaving dead instructions in the prompt.

After editing any `AGENT.md`, run behavior tests to verify prompt quality:

```bash
node ~/agentic-sdlc/agents/test-behavior.mjs
```

---

## Creating New Templates

To create a template for a role not covered by the existing 15:

1. Create a new `.md` file in `agents/templates/execution-agents/`.

2. Add YAML frontmatter with required fields:

```yaml
---
role_keywords: ["keyword1", "keyword2", "keyword3"]
archetype: "your-archetype-name"
template_type: "addendum"
default_patterns: ["dir1/", "dir2/", "*.ext"]
capabilities:
  required: ["memoryRecall", "memoryRecord", "costTracking"]
  conditional:
    someCapability: "when condition applies"
  notExpected: ["browserE2E", "defeatTests"]
---
```

Field reference:

| Field | Required | Description |
|-------|----------|-------------|
| `role_keywords` | Yes | Array of strings. `setup.mjs` matches these against the role entered by the user. |
| `archetype` | Yes | Unique identifier for this template type. |
| `template_type` | Yes | `"addendum"` or `"replacement"`. Use `"addendum"` unless the role has a fundamentally different operating model than the standard micro cycle. |
| `default_patterns` | Yes | Array of file glob patterns for domain routing. Can be empty `[]`. |
| `capabilities` | No | Object with `required`, `conditional`, and `notExpected` arrays/maps. Omit if not using capability monitoring. |

3. Write the markdown body with these sections:

```markdown
---

## <Role>-Specific Operating Rules

### Domain
What this agent owns and is responsible for.

### Non-Negotiable Rules
- Hard rules that must never be violated.

### Quality Patterns
- Best practices and guidelines.

### Known Failure Patterns
- F-001: Description of a known failure and how to avoid it.

### Boundary
- What this agent does NOT do (prevents scope creep).
```

The leading `---` (horizontal rule) separates the addendum content from the base template content in the rendered `AGENT.md`.

4. Use `template_type: "replacement"` only if the role operates on a fundamentally different cycle. The CTO orchestrator is the only current example -- it uses an orchestration cycle (read state, assess, delegate, monitor) instead of the standard micro cycle (implement, test, commit). If your new role still writes code and follows implement-test-commit, use `"addendum"`.

---

## Cron-Based Agents

Three templates are designed for autonomous cron operation rather than task-queue-driven work:

| Agent | Recommended Schedule | What It Does |
|-------|---------------------|--------------|
| `dependency-auditor` | Daily | Scans dependency manifests for CVEs, license violations, version drift, deprecated packages. Creates tasks for security-engineer on critical findings. |
| `performance-sentinel` | Daily or post-commit | Runs benchmarks, compares against baselines, flags regressions. Creates tasks for the relevant domain agent when thresholds are exceeded. |
| `model-manager`* | Every 15 minutes | Monitors agent token utilization, performs model swaps on budget exhaustion, logs to performance ledger. |

*The model-manager template lives in `agents/templates/model-manager/` (separate from execution-agents) because it manages the agent system itself rather than project code.

Configure schedules in `agents/templates/cron-schedule.json.template`. The template includes recommended cron expressions for all automated cycles:

```bash
# Example: Add dependency audit to OpenClaw cron
openclaw cron add \
  --name dependency-audit-daily \
  --cron "0 6 * * *" \
  --message "Run: node ~/agentic-sdlc/agents/worker.mjs --agent dependency-auditor" \
  --session isolated
```

Cron-based agents still use memory (read baselines, write findings) and notifications (alert on critical findings). They differ from queue-driven agents in that they self-initiate on schedule rather than waiting for task assignment.
