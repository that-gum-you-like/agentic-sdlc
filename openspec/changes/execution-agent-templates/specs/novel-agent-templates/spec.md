## ADDED Requirements

### Requirement: Architect template
The framework SHALL provide `agents/templates/execution-agents/architect.md` as an addendum with system design patterns and Architecture Decision Record (ADR) format.

#### Scenario: Architect produces ADRs
- **WHEN** an architect agent is assigned a design task
- **THEN** it produces an ADR document with: Context, Decision, Consequences, Alternatives Considered
- **AND** the ADR is stored in `docs/decisions/` or the project's configured architecture directory

#### Scenario: Architect domain
- **WHEN** an architect agent is created
- **THEN** its AGENT.md includes: system design patterns, dependency graph management, tech stack evaluation criteria, API contract design principles
- **AND** its default domain patterns include: `docs/decisions/`, `architecture/`, `*.openapi.*`, `docker*`, `infra/`

### Requirement: Dependency auditor template
The framework SHALL provide `agents/templates/execution-agents/dependency-auditor.md` as an addendum with supply chain security rules designed for cron-based autonomous operation.

#### Scenario: Dependency auditor runs on cron
- **WHEN** a dependency auditor agent is created
- **THEN** its AGENT.md includes instructions for cron-based execution: scan `package.json`/`requirements.txt`/`Cargo.toml` for known CVEs, check license compliance, detect version drift from lockfile, flag deprecated dependencies

#### Scenario: Auditor alerts
- **WHEN** the dependency auditor finds a critical CVE
- **THEN** it creates a task for the security engineer and sends a notification via `notify.mjs` with severity `highSeverityFailure`

### Requirement: Performance sentinel template
The framework SHALL provide `agents/templates/execution-agents/performance-sentinel.md` as an addendum with benchmark tracking and regression detection patterns.

#### Scenario: Sentinel detects regression
- **WHEN** the performance sentinel detects a metric exceeding its threshold (bundle size +10%, API response time +50%, test suite duration +25%)
- **THEN** it flags the regression with the commit that introduced it and creates a task for the relevant domain agent

#### Scenario: Sentinel domain
- **WHEN** a performance sentinel agent is created
- **THEN** its AGENT.md includes: benchmark tracking conventions, bundle size monitoring, query performance thresholds, memory leak detection heuristics
- **AND** its capabilities include `performanceBenchmark` as required

### Requirement: Research agent template
The framework SHALL provide `agents/templates/execution-agents/research-agent.md` as an addendum with context gathering protocol designed to run BEFORE execution agents on unfamiliar tasks.

#### Scenario: Research agent gathers context
- **WHEN** a research agent is assigned a research task
- **THEN** it produces a context document with: relevant code locations, existing patterns, prior art, potential approaches, risk assessment
- **AND** the context document is linked as a dependency for the execution task

#### Scenario: Research reduces token waste
- **WHEN** a research task completes before an execution task starts
- **THEN** the execution agent receives the research context in its task prompt, reducing exploratory token usage
- **AND** the research agent's domain includes: `docs/`, `README*`, `CHANGELOG*`, `openspec/`, `plans/`
