## 1. Budget Enforcement in Queue-Drainer

- [ ] 1.1 In queue-drainer.mjs task assignment logic, check if agent's `activeModel === 'budget-exhausted'` before assigning. Skip agent with log message.
- [ ] 1.2 Add test: agent with budget-exhausted gets no tasks assigned

## 2. Model Intelligence Database

- [ ] 2.1 Create `agents/model-intel.json` with all models from all 4 adapters: cost per 1M tokens (input/output), context window, strengths (coding/review/docs/architecture/research rated 1-5), known limitations, latency tier (fast/medium/slow), provider
- [ ] 2.2 Add `model-manager.mjs research` command: fetch pricing pages for each provider, parse costs, update model-intel.json, show diff
- [ ] 2.3 Add `model-manager.mjs models` command: display all known models in a table with costs and ratings

## 3. Predictive Budget Management

- [ ] 3.1 Add burn rate calculation to check(): compute tokens/hour from recent cost-log entries (last 2 hours)
- [ ] 3.2 Add depletion projection: if projected to hit 100% within `predictiveSwapHours` (default: 1), trigger pre-emptive swap
- [ ] 3.3 Log predictive-swap events to ledger (distinct from reactive budget-exhausted swaps)
- [ ] 3.4 Add `predictiveSwapHours` config to project.json with default

## 4. Cross-Provider Dynamic Cost Model

- [ ] 4.1 Replace hardcoded MODEL_COST_ORDER with dynamic sort from model-intel.json costs
- [ ] 4.2 Update recommend() to compare across providers: "gpt-4o-mini costs 81% less than claude-haiku with similar quality for simple fixes"
- [ ] 4.3 Allow fallbackChain in budget.json to reference any provider's models (resolve via model-intel.json)

## 5. Quality-Aware Model Selection

- [ ] 5.1 Add `model-manager.mjs suggest <task-type>` command: given a task type (simple fix, feature, architecture, research), recommend the best model considering cost + quality ratings
- [ ] 5.2 Update worker.mjs to call suggest() when no modelPreferences override exists, using model-intel.json ratings
- [ ] 5.3 Add quality rating feedback: when a task completes, adjust model's quality rating for that task type (weighted running average from ledger data)

## 6. Functional Tests

- [ ] 6.1 Test: check() detects 80/90/100% thresholds correctly
- [ ] 6.2 Test: swap walks fallback chain, sets activeModel
- [ ] 6.3 Test: predictive swap triggers before 100% based on burn rate
- [ ] 6.4 Test: recommend() uses dynamic cost model, not hardcoded
- [ ] 6.5 Test: suggest() returns appropriate model for task type
- [ ] 6.6 Test: budget-exhausted agent gets no tasks from queue-drainer
- [ ] 6.7 Test: research command parses model-intel.json correctly

## 7. Documentation & Integration

- [ ] 7.1 Update CLAUDE.md with new commands, predictive swap, model-intel.json
- [ ] 7.2 Add daily reset + model-manager research to cron template
- [ ] 7.3 Update .cursorrules and .windsurfrules with model-manager commands
