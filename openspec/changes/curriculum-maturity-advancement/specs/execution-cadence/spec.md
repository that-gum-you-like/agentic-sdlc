## ADDED Requirements

### Requirement: Cadence configuration
`project.json` SHALL support an optional `cadence` section with fields: `commitWindowMinutes` (number, default 15), `agentOffsets` (object mapping agent names to minute offsets within the window).

#### Scenario: Cadence configured
- **WHEN** project.json contains `"cadence": { "commitWindowMinutes": 15, "agentOffsets": { "roy": 0, "jen": 5, "moss": 10 } }`
- **THEN** worker.mjs injects commit timing guidance into each agent's prompt

### Requirement: Commit window prompt injection
When cadence is configured, `worker.mjs` SHALL inject commit timing guidance into the agent prompt: "Preferred commit times: :<offset>, :<offset + window>, :<offset + 2*window>, etc. If you finish between windows, prepare your commit but wait for the next window."

#### Scenario: Roy gets commit timing
- **WHEN** cadence is configured with Roy offset=0 and window=15
- **THEN** Roy's prompt includes "Preferred commit times: :00, :15, :30, :45. If you finish between windows, prepare your commit and wait for the next window."

#### Scenario: Jen gets staggered timing
- **WHEN** cadence is configured with Jen offset=5 and window=15
- **THEN** Jen's prompt includes "Preferred commit times: :05, :20, :35, :50."

### Requirement: Cadence is advisory
Cadence commit windows SHALL be advisory guidance in agent prompts, not hard-enforced by hooks or scripts. Agents MAY commit outside their window if task completion requires it.

#### Scenario: Agent commits outside window
- **WHEN** an agent commits at :07 but its window is :15
- **THEN** the commit succeeds normally AND no error or warning is raised

### Requirement: Cadence in status display
When cadence is configured, `queue-drainer.mjs status` SHALL display each agent's next commit window time.

#### Scenario: Status shows commit windows
- **WHEN** `queue-drainer.mjs status` is run at 14:08 AND cadence is configured
- **THEN** output shows "Roy: next window :15 (7 min)" and "Jen: next window :20 (12 min)"
