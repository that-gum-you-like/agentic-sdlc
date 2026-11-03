# Spec: agent-identity

The autonomous path runs AS the task's assigned specialist agent — the curriculum's core
(w3 "Creating Specialist Agents", w6 "Memory creates agent characters"). Before this, one
generic `hermes-drain` worker did every task: the queue's `agent` field, each agent's
AGENT.md, its memory and its budget.json models were all ignored at runtime (Bryce asked to
review the architecture, 2026-11-03). Band 120-129.

## CV-REQ-120 — The drain script selects the task, not the model
`queue-drainer.mjs next [--exclude id,...]` prints the single highest-priority ready task as
JSON (FIX-* first, then CRITICAL→LOW, ties by id). `hermes-drain.sh` excludes non-FIX tasks
whose `agent/drain/<id>` PR is open, and passes the chosen id to the worker.
- WHEN two tasks are ready and one has an open drain PR THEN `next --exclude` returns the other.
- WHEN a FIX task is pending THEN it is returned even if its PR is open.
- WHEN nothing is ready THEN `next` prints nothing and exits 0, and the drain skips without an LLM call.

## CV-REQ-121 — The worker runs as the task's agent
The prompt names the task (`{{TASK_ID}}`) and embeds the assigned agent's AGENT.md under
"## Your identity" (agent = task.agent, else `sdlc-developer`; the file is read from the
drained repo's clone). Memory recall/record use `{{AGENT}}`.
- WHEN the task's agent is `sdlc-documentarian` THEN the prompt contains that AGENT.md and recalls/records `sdlc-documentarian`.
- WHEN the agent has no AGENT.md THEN the drain falls back to `sdlc-developer` and logs it.

## CV-REQ-122 — Per-agent drain model, opt-in only
`budget.json agents.<a>.drainModel` (optional) is passed to Hermes as `-m`. Absent → the
drain profile's own ladder (unchanged). A model is only set after it passes an end-to-end
Hermes tool-call run: coder models produced invalid tool calls in Hermes before (incident).
- WHEN `drainModel` is absent THEN the hermes command line has no `-m`.
- WHEN `drainModel` is set THEN `-m <model>` is passed.

## CV-REQ-123 — The reviewer runs as `sdlc-reviewer`
`buildReviewPrompt` embeds `agents/<REVIEW_AGENT>/AGENT.md` (identity, rules, core failures)
and the agent's memory recall; `budget.json agents.<REVIEW_AGENT>.reviewModel` overrides
`REVIEW_MODEL` when set. Missing files never fail a review.
- WHEN agents/sdlc-reviewer/AGENT.md exists THEN the review prompt contains its identity section.
- WHEN it is missing THEN the prompt is built exactly as before.
