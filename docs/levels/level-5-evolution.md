# Level 5: Memory, Failures, and Model Management

**Prerequisites:** Level 4 complete (defeat tests and code reviewer active).

## What You Add

- 5-layer memory per agent (core, long-term, medium-term, recent, compost)
- Failure tracking with severity levels (critical/high/medium)
- REM sleep: automated memory consolidation
- Model-manager with fallback chains and budget monitoring
- Performance ledger tracking task outcomes by agent and model

## Steps

### 1. Verify Agent Memory Structure

Memory directories should already exist from `setup.mjs`. Verify:

```bash
ls agents/*/memory/core.json
```

Each agent should have five files: `core.json`, `long-term.json`, `medium-term.json`, `recent.json`, `compost.json`.

### 2. Add Failure Tracking

When an agent makes a mistake, record it in that agent's `core.json` under the `failures` array. Each entry needs these fields:

| Field       | Example                                      |
|-------------|----------------------------------------------|
| id          | F-001                                        |
| date        | 2026-04-07                                   |
| severity    | critical, high, or medium                    |
| description | Committed to wrong repo                      |
| lesson      | Always verify CWD before git commit          |

See `agents/templates/core.json.template` for the full schema.

### 3. Configure REM Sleep

REM sleep consolidates memory automatically: recent entries promote to medium-term, medium-term to long-term, stale entries compost.

Add to your cron schedule (weekly recommended):

```bash
node ~/agentic-sdlc/agents/rem-sleep.mjs
```

### 4. Add Model-Manager for Budget Monitoring

Create a model-manager agent in your roster, or add `model-manager` to your agent directory.

Configure fallback chains in `budget.json` per agent:

```json
{
  "fallbackChain": ["claude-sonnet-4-6", "claude-haiku-4-5"]
}
```

Schedule budget checks every 15 minutes:

```bash
node ~/agentic-sdlc/agents/model-manager.mjs check
```

### 5. Performance Ledger

The performance ledger starts automatically once the model-manager is active. Task outcomes are recorded in `pm/model-performance.jsonl`.

View a summary report:

```bash
node ~/agentic-sdlc/agents/model-manager.mjs report
```

## Validation

- Confirm agents read memory before starting tasks: check that `recent.json` has entries after a task run.
- Run `model-manager.mjs check` -- it should show utilization percentages per agent.
- Run `model-manager.mjs report` -- it should show task history grouped by agent and model.

## Next Level

When you want the system to identify its own improvement opportunities, move to [Level 6: Pattern Detection and Self-Correction](level-6-self-improving.md).
