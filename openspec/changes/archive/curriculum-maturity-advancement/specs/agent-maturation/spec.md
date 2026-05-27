## ADDED Requirements

### Requirement: Maturation milestones in core memory
Each agent's `core.json` SHALL include a `maturation` object tracking: `level` (0-5), `weekStarted` (ISO date), `milestonesHit` (array of milestone names), `metrics` (object with weekly correction rates and self-correction counts).

Milestone levels:
- 0: New (no corrections received)
- 1: Corrected (first correction received and acknowledged)
- 2: Remembering (first self-correction observed — agent avoids a previously-corrected mistake without being told)
- 3: Teaching (agent's corrections decrease AND critic shifts to higher-level review)
- 4: Autonomous (agent produces zero basic corrections for 2 consecutive weeks)
- 5: Evolving (agent proposes new checklist items or defeat tests based on its own observations)

#### Scenario: New agent starts at level 0
- **WHEN** a new agent is created via setup.mjs
- **THEN** core.json contains `"maturation": { "level": 0, "weekStarted": "<today>", "milestonesHit": [], "metrics": {} }`

#### Scenario: Agent advances to level 1
- **WHEN** Richmond records the first correction for Roy AND memory-manager records it
- **THEN** Roy's maturation level advances to 1 AND "first-correction" is added to milestonesHit

### Requirement: Weekly maturation metrics collection
`cycles/weekly-review.mjs` SHALL compute and record per-agent maturation metrics: corrections received this week, self-corrections observed, review severity distribution (basic vs. higher-level). Metrics SHALL be appended to `core.json` maturation.metrics keyed by ISO week.

#### Scenario: Weekly metrics recorded
- **WHEN** weekly-review runs for week 2026-W12
- **THEN** each agent's core.json maturation.metrics contains `"2026-W12": { "correctionsReceived": 3, "selfCorrections": 1, "reviewSeverity": { "basic": 2, "elevated": 1 } }`

### Requirement: Maturation regression detection in behavior tests
`test-behavior.mjs` SHALL check for maturation regression: if an agent's correction rate has been declining for 2+ weeks and then increases, the behavior test SHALL fail with "Maturation regression detected for <agent>: corrections increased from N to M after declining trend."

#### Scenario: Regression detected
- **WHEN** Roy's corrections were: week 10=8, week 11=5, week 12=3, week 13=7
- **THEN** test-behavior.mjs fails with "Maturation regression detected for roy: corrections increased from 3 to 7 after 3-week declining trend"

#### Scenario: No regression — normal fluctuation
- **WHEN** Roy's corrections were: week 10=5, week 11=3, week 12=4
- **THEN** test-behavior.mjs passes (no sustained declining trend broken — only 1 week of decline before increase)

### Requirement: Performance feedback in agent context
`worker.mjs` SHALL inject efficiency metrics into the agent prompt: average tokens per task (last 5 tasks), error rate (failed attempts / total attempts), and comparison to type average. This enables agents to self-regulate token usage.

#### Scenario: Efficiency metrics injected
- **WHEN** worker generates prompt for Roy AND Roy's last 5 tasks averaged 15K tokens with 1 failure
- **THEN** the prompt includes "Your recent efficiency: 15K tokens/task avg (team avg: 12K), 80% first-attempt success rate"

### Requirement: Maturation in PM Dashboard
`daily-review.mjs` SHALL include an "Agent Maturation" section in the PM Dashboard showing each agent's current level, weeks at current level, and trend (improving/stable/regressing).

#### Scenario: Dashboard shows maturation
- **WHEN** daily-review updates DASHBOARD.md
- **THEN** it includes "Agent Maturation: Roy: Level 3 (Teaching) — 4 weeks, trend: stable | Jen: Level 2 (Remembering) — 2 weeks, trend: improving"

### Requirement: Evolution timeline in AGENT.md template
`agents/templates/AGENT.md.template` SHALL include an "Evolution Timeline" section documenting the expected 6-week maturation cycle: Week 1 (mistakes), Week 2 (corrections → checklist), Week 3 (memory of corrections), Week 4 (self-correction), Week 5 (critic elevation), Week 6 (new patterns, cycle repeats).

#### Scenario: New agent has evolution timeline
- **WHEN** setup.mjs creates a new agent from the template
- **THEN** the generated AGENT.md includes an "## Evolution Timeline" section with the 6-week cycle description
