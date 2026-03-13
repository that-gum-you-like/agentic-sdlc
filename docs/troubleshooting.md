# Troubleshooting

Common issues and solutions when running the Agentic SDLC framework.

---

## Agent Issues

### Agent produces low-quality output
- **Check memory:** Run `node ~/agentic-sdlc/agents/memory-manager.mjs recall <agent>`. If core memory is empty or stale, the agent lacks context.
- **Check AGENT.md:** Ensure the system prompt has clear responsibilities, operating rules, and failure memories.
- **Run behavior tests:** `node ~/agentic-sdlc/agents/test-behavior.mjs` to verify prompt quality.
- **Check model tier:** Confirm `budget.json` assigns an appropriate model (sonnet for complex tasks, haiku for simple ones).

### Agent keeps repeating the same mistake
- **Add a failure memory:** Record the mistake in `core.json` so the agent self-corrects.
- **Add a defeat test:** Write a test that fails when the anti-pattern is present.
- **Update the checklist:** Add a checklist item so the review agent catches it.

### Agent exceeds token budget
- **Check cost-tracker:** `node ~/agentic-sdlc/agents/cost-tracker.mjs report` to see usage breakdown.
- **Enable conservation mode:** Set `conservationMode: true` in `budget.json` to halve all daily limits.
- **Reduce task scope:** Break large tasks into smaller ones with lower `estimatedTokens`.

---

## Coordination Issues

### Tasks stuck in `in_progress` state
- **Stale claim detection:** The queue drainer flags tasks in_progress for more than 30 minutes. Run `node ~/agentic-sdlc/agents/queue-drainer.mjs status` to identify stuck tasks.
- **Reset stuck tasks:** `node ~/agentic-sdlc/agents/queue-drainer.mjs reset <task-id>`.
- **Check for blocking dependencies:** The task may depend on another incomplete task.

### Merge conflicts between parallel agents
- **Serialize dependent work.** If two agents touch the same files, assign tasks sequentially.
- **Tell agents about each other.** Include context about parallel work in the task description.
- **Use smaller commits.** Frequent small commits reduce the surface area for conflicts.

### Matrix communication not working
- **Check server status:** Verify the Matrix server is running and reachable.
- **Check credentials:** Ensure `credentialsPath` in `project.json` points to a valid credentials file.
- **Test connectivity:** `node ~/agentic-sdlc/agents/matrix-client/matrix-cli.mjs rooms <agent>`.

---

## Testing Issues

### Tests pass locally but fail in CI
- **Check test environment:** Ensure CI has the same dependencies and configuration.
- **Check for flaky tests:** Non-deterministic tests (random data, timing) can cause intermittent failures.
- **Check for missing mocks:** Tests that depend on external services need mocks in CI.

### Defeat tests produce false positives
- **Review the pattern definition:** Ensure the defeat test targets the actual anti-pattern, not a valid use case.
- **Narrow the file scope:** Restrict defeat tests to relevant directories.
- **Add exceptions:** If specific files have legitimate reasons for the flagged pattern, exclude them.

### Behavior tests fail after prompt change
- **This is expected.** Behavior tests exist to catch behavioral drift from prompt changes.
- **Review the failure:** Determine whether the behavior change is intentional or a regression.
- **Update the test or revert the prompt.** If intentional, update the behavior test. If not, revert the AGENT.md change.

---

## Cost Issues

### Token usage is unexpectedly high
- **Check for retry loops.** An agent failing and retrying 3 times uses 3x tokens.
- **Check task complexity.** Tasks with `estimatedTokens` set too low may indicate scope creep.
- **Review agent output length.** Agents producing verbose output waste tokens. Tighten the system prompt.

### Conservation mode is not activating
- **Check budget.json:** Ensure `conservationMode` field exists and the circuit breaker logic is wired into your queue drainer.
- **Manual activation:** Set `conservationMode: true` in `budget.json`.

---

## Recovery Patterns

### Recovering from a bad agent version
1. Check version history: `node ~/agentic-sdlc/agents/version-snapshot.mjs list`
2. Restore previous version: `node ~/agentic-sdlc/agents/version-snapshot.mjs restore <version>`
3. Run behavior tests to confirm the rollback is clean.

### Recovering from corrupted memory
1. Check the memory files in `agents/<agent>/memory/`.
2. If a specific layer is corrupted, replace it with `{ "entries": [] }`.
3. Re-run REM Sleep to reconsolidate: `node ~/agentic-sdlc/agents/rem-sleep.mjs`.

### Recovering from a stuck queue
1. Run `node ~/agentic-sdlc/agents/queue-drainer.mjs status` to see all tasks.
2. Reset stuck tasks: `node ~/agentic-sdlc/agents/queue-drainer.mjs reset <id>` for each.
3. Archive completed tasks: `node ~/agentic-sdlc/agents/queue-drainer.mjs archive`.

---

## New Feature Issues

### Embedding model not found (semantic search)
- **Install dependencies:** `pip install -r ~/agentic-sdlc/agents/requirements-nlp.txt`
- **First run downloads model:** `all-MiniLM-L6-v2` (~80MB) downloads on first use. Needs internet once.
- **Graceful fallback:** If sentence-transformers isn't installed, semantic search falls back to full recall. No error.

### Human task stuck / not unblocking agents
- **Check task status:** `node ~/agentic-sdlc/agents/queue-drainer.mjs human-status`
- **Complete manually:** `node ~/agentic-sdlc/agents/queue-drainer.mjs human-complete <HTASK-id>`
- **Verify unblocks:** The `unblocks` array in the human task JSON lists which agent tasks get unblocked.
- **Missing human-queue dir:** The directory `tasks/human-queue/` is created automatically on first use.

### Instance conflict (parallel agents)
- **Check for overlapping files:** Two instances assigned tasks touching the same files will conflict.
- **Queue-drainer detects this:** File pattern conflict detection serializes overlapping tasks automatically.
- **Shared budget:** All instances share the base agent's daily token limit. Check with `cost-tracker.mjs report`.
- **Manual fix:** If instances are fighting, reduce `maxInstances` in `budget.json` to 1.

### Wellness alerts not firing
- **Check config:** Ensure `humanWellness.enabled: true` in `project.json`.
- **Check alert dedup:** `pm/wellness-alerts.json` tracks which alerts fired today. Delete it to reset.
- **Manual check:** `node ~/agentic-sdlc/agents/notify.mjs wellness-check`

### Capability drift not detected
- **Check log exists:** System-instrumented log is at `pm/capability-log.jsonl`. If empty, scripts may not have the instrumentation yet.
- **Check capabilities.json:** Ensure `agents/capabilities.json` defines `required` capabilities for each agent.
- **Run manually:** `node ~/agentic-sdlc/agents/capability-monitor.mjs check`
- **Check threshold:** Default is 3 consecutive skips. Configurable via `capabilityMonitoring.driftThreshold` in `project.json`.
