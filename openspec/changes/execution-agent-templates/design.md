## Context

The framework creates agents through `setup.mjs` using a role→archetype→capability pipeline:
1. User enters agent name + role + file patterns
2. `setup.mjs` maps role keywords to an archetype (`backend`, `frontend`, `reviewer`, `release`, `uix`)
3. Archetype selects the capability profile from `capabilities.json.template`
4. Base `AGENT.md.template` gets filled with `{{NAME}}`, `{{ROLE}}`, `{{RESPONSIBILITIES}}`
5. Special case: UIX agents get domain-specific operating rules **appended** to the base AGENT.md

Planning agents are standalone templates in `agents/templates/planning-agents/` — they replace the base template entirely because planning agents have a fundamentally different operating model (no code, no tests, produce artifacts).

Execution agent templates must integrate into this existing flow, not bypass it.

## Goals / Non-Goals

**Goals:**
- Add 15 execution agent templates that `setup.mjs` automatically selects and applies based on role keywords
- Follow the existing UIX pattern: base template + role-specific addendum appended
- Each template adds domain-specific operating rules, non-negotiable rules, failure patterns, and domain file patterns
- Auto-configure `domains.json` with sensible defaults when role is recognized
- Auto-configure `capabilities.json` with role-specific capability profiles
- Templates are starting points — projects customize after setup

**Non-Goals:**
- Replacing the base `AGENT.md.template` — execution agents inherit from it
- Making templates work without `setup.mjs` — the setup flow is the integration point
- Auto-creating planning agents — those remain standalone templates (different operating model)
- Prescribing specific tech stacks — templates use `{{TECH_STACK}}` for project customization

## Decisions

### D1: Execution agent templates are addenda, not replacements

Like the UIX pattern at setup.mjs lines 293-365, each execution template is a markdown addendum that gets **appended** to the base `AGENT.md.template` output. The base template provides: micro cycle, memory protocol reference, evolution timeline, maturation levels. The addendum provides: domain-specific rules, failure patterns from LinguaFlow, file patterns, quality checklist additions.

**Why not standalone templates like planning agents?** Execution agents share the same operating model (pick task → implement → test → commit). Planning agents have a fundamentally different model (receive input → produce artifact → hand off). Duplication of the micro cycle across 15 standalone templates would be a maintenance burden and diverge over time.

**File structure:**
```
agents/templates/execution-agents/
├── cto-orchestrator.md          # Addendum: orchestration rules, delegation protocol
├── code-reviewer.md             # Addendum: review checklist, verdict format
├── release-manager.md           # Addendum: merge sequencing, deploy gates
├── backend-developer.md         # Addendum: service patterns, data layer rules
├── frontend-developer.md        # Addendum: screen patterns, accessibility rules
├── ai-engineer.md               # Addendum: LLM integration, token management
├── documentarian.md             # Addendum: doc verification, accuracy rules
├── security-engineer.md         # Addendum: OWASP checklist, dependency audit
├── qa-engineer.md               # Addendum: E2E patterns, smoke test gates
├── integration-tester.md        # Addendum: contract testing, boundary rules
├── ethics-advisor.md            # Addendum: ethical review framework
├── architect.md                 # Addendum: ADR format, design decisions
├── dependency-auditor.md        # Addendum: CVE scanning, license check
├── performance-sentinel.md      # Addendum: benchmark tracking, regression rules
└── research-agent.md            # Addendum: context gathering protocol
```

### D2: Role keyword detection in setup.mjs extended for all 15 roles

The existing archetype mapping (setup.mjs ~line 393) currently handles 4 patterns: `ui/ux`, `frontend`, `review`, `release`. We extend this to detect all 15 execution roles and 5 planning roles by keyword matching. When a role is recognized, setup.mjs:

1. Selects the matching capability profile from `capabilities.json.template`
2. Appends the matching addendum from `agents/templates/execution-agents/`
3. Pre-fills `domains.json` with sensible default patterns for that role
4. Selects the appropriate `core.json` template if a role-specific one exists

**Keyword mapping (additions):**
```javascript
const ROLE_TEMPLATES = {
  // Execution agents
  'cto': 'cto-orchestrator',
  'orchestrat': 'cto-orchestrator',
  'code review': 'code-reviewer',
  'reviewer': 'code-reviewer',
  'release': 'release-manager',
  'deploy': 'release-manager',
  'backend': 'backend-developer',
  'services': 'backend-developer',
  'frontend': 'frontend-developer',
  'mobile': 'frontend-developer',
  'ai': 'ai-engineer',
  'ml': 'ai-engineer',
  'llm': 'ai-engineer',
  'document': 'documentarian',
  'docs': 'documentarian',
  'security': 'security-engineer',
  'qa': 'qa-engineer',
  'e2e': 'qa-engineer',
  'integration test': 'integration-tester',
  'ethics': 'ethics-advisor',
  'architect': 'architect',
  'dependency': 'dependency-auditor',
  'supply chain': 'dependency-auditor',
  'performance': 'performance-sentinel',
  'benchmark': 'performance-sentinel',
  'research': 'research-agent',
  // UIX (existing)
  'ui/ux': 'uix',
  'uix': 'uix',
  'design': 'uix',
  // Planning (for capability mapping only — standalone templates)
  'requirements': 'requirements-engineer',
  'value analyst': 'value-analyst',
  'product manager': 'product-manager',
  'parallelization': 'parallelization-analyst',
  'quality': 'quality-alignment',
};
```

**Fallback:** If no keyword matches, agent gets the generic `backend` archetype (current behavior preserved).

### D3: Default domain patterns per role

When a user enters a recognized role, `setup.mjs` pre-fills the file patterns prompt with sensible defaults from the template metadata. The user can accept or modify.

**Example:** If role contains "backend", suggest patterns: `services/, stores/, hooks/, migrations/, api/`. If "frontend", suggest: `app/, screens/, components/, navigation/`.

This is stored as a `_defaultPatterns` array in each template file header (YAML frontmatter between `---` markers, ignored when appended to AGENT.md).

### D4: CTO orchestrator has a modified micro cycle

The CTO is the one execution agent that does NOT follow the standard micro cycle — it orchestrates, never codes. Rather than using the addendum pattern, the CTO template overrides the micro cycle section entirely. `setup.mjs` detects `cto` or `orchestrat` in the role and uses the CTO template as a **replacement** (like planning agents) rather than an addendum.

**Why the exception:** A CTO agent that inherits "Implement → Write tests → Run tests → Commit" from the base template would be actively harmful — it would try to write code instead of delegating.

### D5: Template metadata via YAML frontmatter

Each execution agent template has YAML frontmatter at the top with:
```yaml
---
role_keywords: ["backend", "services", "data layer"]
archetype: "backend-developer"
default_patterns: ["services/", "stores/", "hooks/", "migrations/"]
capabilities:
  required: ["memoryRecall", "memoryRecord", "defeatTests", "learningRecord", "costTracking"]
  conditional:
    browserE2E: "when frontend files changed"
  notExpected: ["openclawBrowser", "deployPipeline"]
---
```

`setup.mjs` reads this frontmatter to auto-configure domains.json and capabilities.json. The frontmatter is stripped when the addendum is appended to AGENT.md.

### D6: Research agent runs BEFORE other agents

The research agent template includes a rule that it should be assigned tasks BEFORE execution agents claim them. `queue-drainer.mjs` already supports task dependencies (`blockedBy`) — the convention is that research tasks produce context files that execution tasks depend on. No script changes needed — this is a template convention, not a code change.

## Risks / Trade-offs

- **[Risk] Too many role keywords cause false matches** → Mitigation: Keywords are checked in priority order, most specific first. User confirms role during setup. `setup.mjs` shows which template was selected and lets user override.
- **[Risk] Templates diverge from base over time** → Mitigation: Templates are addenda, not replacements. Base template changes automatically apply to all agents. Only the CTO is a full replacement.
- **[Risk] 15 templates overwhelm new users** → Mitigation: `setup.mjs` suggests a starter roster based on project type (web: backend + frontend + reviewer + release; AI: + ai-engineer; etc.)
- **[Risk] LinguaFlow-specific patterns leak into generic templates** → Mitigation: All LinguaFlow references (Supabase, Expo, NativeWind, React Native) are replaced with `{{TECH_STACK}}` or generic language.

## Open Questions

- **Q1:** Should the research agent be a cron-based autonomous agent (like model-manager) or a task-driven agent? Current design says task-driven with dependency convention.
- **Q2:** Should `setup.mjs` offer a "starter pack" menu (e.g., "Web app team", "AI product team", "API team") that pre-selects agents? Or keep it fully manual?
