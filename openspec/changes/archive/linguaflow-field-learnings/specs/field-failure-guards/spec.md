## ADDED Requirements

### Requirement: Redundant heartbeat validation
`setup.mjs` SHALL validate that at least 2 agents in the roster are configured with active heartbeats or cron schedules. Projects with only 1 heartbeat-enabled agent SHALL receive a warning about single-point-of-failure risk.

#### Scenario: Single heartbeat warning
- **WHEN** `setup.mjs` detects only 1 agent with a heartbeat/cron configured
- **THEN** it warns: "Only 1 agent has active oversight. Recommend 2+ agents with heartbeats to prevent cascade stalls (ref: LinguaFlow 17-day stall incident)"

#### Scenario: Two or more heartbeats pass validation
- **WHEN** 2+ agents have heartbeats/crons configured
- **THEN** no warning is emitted

### Requirement: Budget exhaustion auto-response
When any agent reaches 90%+ token utilization, the model-manager (or `cost-tracker.mjs` if model-manager is not configured) SHALL emit an alert. The system SHALL NOT silently starve agents.

#### Scenario: Alert on 90% utilization without model-manager
- **WHEN** an agent hits 90% budget and no model-manager is configured
- **THEN** `cost-tracker.mjs` sends a notification via `notify.mjs` warning of imminent budget exhaustion

#### Scenario: Model-manager handles budget exhaustion
- **WHEN** an agent hits 90% budget and model-manager is configured
- **THEN** the model-manager performs the fallback chain swap (per model-manager-agent spec)

### Requirement: Exception normalization guard
The reviewer checklist template SHALL include: "Approved exceptions MUST be time-boxed (include expiry date) or logged as tech debt with a removal plan. One-time approvals MUST NOT become permanent patterns."

#### Scenario: Exception approved with expiry
- **WHEN** a reviewer approves a code exception
- **THEN** the approval comment includes an expiry date or a linked tech debt ticket

#### Scenario: Expired exception flagged
- **WHEN** `daily-review.mjs` runs and finds an exception past its expiry date
- **THEN** it flags the exception as "stale approval — review or remove"

### Requirement: Pipeline-only deploy rule
The AGENT.md.template and framework documentation SHALL state: "NEVER bypass the deploy pipeline with manual commands. All post-export fixups, platform-specific corrections, and quality gates run ONLY in the automated pipeline."

#### Scenario: Deploy rule in agent prompt
- **WHEN** a release agent's AGENT.md is scaffolded from the template
- **THEN** the non-negotiable rules section includes the pipeline-only deploy rule

### Requirement: Stale openspec hygiene
`daily-review.mjs` SHALL check the openspec changes directory and flag: changes stuck in proposal/design >14 days, shipped changes not archived >7 days.

#### Scenario: Stale proposal flagged
- **WHEN** an openspec change has been in `proposal` phase for >14 days (per status.json timestamp)
- **THEN** the daily review output includes "STALE: <change-name> has been in proposal for N days"

#### Scenario: Unarchived shipped change flagged
- **WHEN** an openspec change has `phase: "shipped"` in status.json for >7 days
- **THEN** the daily review output includes "ARCHIVE: <change-name> shipped N days ago, needs archiving"

### Requirement: Doc-as-code rule
The AGENT.md.template non-negotiable rules SHALL include: "Documentation updates for changed APIs, signatures, or interfaces are part of the SAME task, not follow-on work." The reviewer checklist SHALL check for stale docs on API changes.

#### Scenario: API change without doc update flagged in review
- **WHEN** a commit changes a service function signature and does not update corresponding docs
- **THEN** the reviewer SHALL flag it as a required change, not optional follow-up

### Requirement: Merge safety rule
The release agent checklist template SHALL include: "Clean git merge != safe merge. Full test suite MUST run against the merged state before deploy. TypeScript compilation MUST succeed on merged output."

#### Scenario: Post-merge test gate
- **WHEN** the release agent merges a branch to main
- **THEN** the full test suite runs against the merged state BEFORE any deploy step
- **AND** if tests fail, the deploy is blocked and the merge is flagged for investigation

### Requirement: No-questions mode
The AGENT.md.template SHALL document the no-questions mode pattern: "Resolve ambiguity independently using best judgment and domain knowledge. Record the decision and reasoning in core memory as a clarification pattern. Ask questions AFTER completing the task, not before — questions become learning opportunities, not blockers."

#### Scenario: Agent resolves ambiguity independently
- **WHEN** a task description is ambiguous and the agent can make a reasonable judgment call
- **THEN** the agent proceeds with its best interpretation, completes the task, and records the clarification in `core.json` or `long-term.json`
