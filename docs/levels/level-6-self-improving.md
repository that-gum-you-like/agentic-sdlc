# Level 6: Pattern Detection and Self-Correction

**Prerequisites:** Level 5 complete (memory system and model-manager active).

## What You Add

- Pattern hunt: recurring issue detection across agent reviews
- Behavior tests: prompt quality regression testing
- Capability monitoring: drift detection when agents skip required capabilities
- Quality alignment monitor: micro-cycle adherence and scope creep detection

## Steps

### 1. Run Pattern Hunt

Scan review history to find recurring anti-patterns (3+ occurrences) and propose new defeat tests:

```bash
node ~/agentic-sdlc/agents/pattern-hunt.mjs
```

Review the output. Each identified pattern includes a frequency count, affected agents, and a proposed defeat test rule. Add accepted rules to your defeat test configuration.

### 2. Configure Behavior Tests

Validate that all agent AGENT.md files contain required sections:

```bash
node ~/agentic-sdlc/agents/test-behavior.mjs
```

Required sections checked: micro cycle, memory protocol, maturation levels. Run this after any agent prompt edit to catch regressions.

### 3. Enable Capability Monitoring

In your `project.json`, enable capability monitoring:

```json
{
  "capabilityMonitoring": {
    "enabled": true
  }
}
```

This tracks which capabilities each agent uses per task. A drift alert fires when a required capability is skipped 3+ consecutive times.

Check current status:

```bash
node ~/agentic-sdlc/agents/capability-monitor.mjs status
```

### 4. Add Quality Alignment Monitor (Optional)

The alignment monitor checks micro-cycle adherence, planning artifact compliance, and scope creep detection across all agents:

```bash
node ~/agentic-sdlc/agents/alignment-monitor.mjs
```

This is optional but recommended for teams with more than 5 agents.

### 5. Schedule Weekly Automation

Combine pattern hunt, REM sleep, and behavior tests into a single weekly run:

```bash
node ~/agentic-sdlc/agents/cycles/weekly-review.mjs
```

Add this to your cron schedule. It runs all three in sequence and outputs a consolidated report.

## Validation

- Pattern hunt identifies at least one recurring pattern from review history.
- Behavior tests pass for all agents in your roster.
- Capability monitoring shows no drift alerts (or expected alerts for newly added agents that have not yet completed enough tasks).

## You Have Reached the Highest Maturity Level

The system now identifies its own improvement opportunities and proposes fixes. From here, focus on:

- Reviewing pattern hunt proposals and accepting high-value defeat tests
- Monitoring capability drift and adjusting agent prompts when alerts appear
- Running the weekly review cycle consistently to keep memory and patterns current
