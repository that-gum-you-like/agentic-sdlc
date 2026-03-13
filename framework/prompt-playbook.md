# Production Prompt Playbook

Ready-to-use prompts for common agentic SDLC workflows. Copy, adapt, and use.

## Planning Phase

### Brain Dump → Requirements
```
Use the requirements engineer agent to define requirements for this application.
Create a requirements.md file in the plans folder using the REQ-xxx format.

[Paste your brain dump here]

Write these requirements and put them in plans/requirements.md.
```

### Requirements → Priorities
```
Use the business value analyst agent to review plans/requirements.md.
Create plans/priorities.md with value scores, complexity scores, priority matrix,
and a cut list. Use the value analyst's workflow.
```

### Priorities → Roadmap
```
Using plans/requirements.md and plans/priorities.md, create a phased roadmap
at plans/roadmap.md. Focus on what we can parallelize — what multiple agents
can work on at the same time. No time estimates — agents work differently
than humans.
```

### Roadmap → Parallelization
```
Using plans/roadmap.md, create plans/parallelization.md with dependency graphs,
work stream assignments, interface contracts, and the critical path. Identify
what can run in parallel and what must be sequential.
```

### Update Requirements After Changes
```
I moved some items from excluded to included scope. Update plans/requirements.md
to include all the ones I moved up. Then update plans/priorities.md and
plans/roadmap.md to reflect the changes.
```

### Technology Stack Change
```
Update [WORKSTREAM] to use [NEW_TECH] instead of [OLD_TECH]. Update requirements
and roadmap using the requirements engineer and product manager agents in parallel.
```

## Execution Phase

### Assign Specific Work
```
Work on workstream [ID] from the roadmap. Mark it as in progress.
Follow the micro cycle: implement → write tests → run tests → commit if passing.
Update the roadmap and write a dev log entry when done.
```

### Full Implementation Cycle
```
Get started on workstream [ID]. Write tests first (TDD). Implement code to
satisfy the tests. Ensure all tests pass. Commit with a descriptive message.
Update the roadmap and write a dev log.
```

### Fix All Failing Tests
```
Fix all failing tests. Ensure all bugs are fixed and that no tests are failing
before we proceed. Do not skip any test — every failure must be resolved.
```

### Write Tests for Existing Code
```
Write tests for everything that was just implemented. Unit tests for all
endpoints/services. Test files should set up and tear down any required
infrastructure. Update the roadmap and write a dev log.
```

## Roadmap Management

### Garden the Roadmap
```
Garden the roadmap: move completed items from plans/roadmap.md to
plans/completed/roadmap-archive.md with completion dates. Remove them from
the active roadmap so only incomplete work remains.
```

### Check Roadmap Status
```
Check the roadmap for any items that have been completed but not marked done.
Review recent commits and code changes. Update the roadmap accordingly.
```

### Add New Idea Without Derailing
```
I have a new feature idea: [DESCRIBE IT]. Don't implement it now. Add it as
a new REQ-xxx to plans/requirements.md, score it in plans/priorities.md,
and place it in the appropriate roadmap phase. Then return to current work.
```

## Review & Quality

### Architectural Review
```
Do an architectural review of the codebase. Focus on code quality issues
and industry-standard best practices. Don't note things already on the roadmap.
Put findings in plans/reviews/ with actionable recommendations.
```

### Agent Prompt Optimization
```
Review the [AGENT_NAME] agent prompt. Reduce token count while preserving
all workflows, checklists, and critical instructions. Make sure nothing
functional is lost.
```

### Refactor Component
```
Refactor [COMPONENT]. Maintain all existing functionality and tests.
Improve code quality without changing behavior. Run tests before and after.
```

## Autonomous Operation

### Launch Autonomous Agent
```bash
# Run the autonomous launcher for a specific agent
bash ~/agentic-sdlc/agents/autonomous-launcher.sh --agent [AGENT_NAME]
```

### Schedule Periodic Execution
```bash
# Via OpenClaw cron (recommended)
openclaw cron add --name "autonomous-[agent]" \
  --cron "*/30 * * * *" \
  --message "Run: bash ~/agentic-sdlc/agents/autonomous-launcher.sh --agent [AGENT_NAME]" \
  --session isolated

# Via system cron
crontab -e
# Add: */30 * * * * bash ~/agentic-sdlc/agents/autonomous-launcher.sh --agent [AGENT_NAME]
```

### Check Agent Progress
```
Check on the autonomous agent. Did it finish? What did it complete?
Are there any failures or blocked tasks? Show me the dev log entries
from the last session.
```

## Deployment

### Deploy
```
Deploy using the project's deploy pipeline. Follow the done checklist:
tests pass → commit → deploy via pipeline → verify on production → notify.
```

### Fix and Redeploy
```
[DESCRIBE THE ISSUE]. Fix it and redeploy. Make sure to run tests before
deploying. Update the roadmap if this was a tracked item.
```

### Validate Deployment
```
Validate that the deployment is running correctly. Check that all endpoints
respond, the UI loads, and core functionality works.
```

## Git & Version Control

### Commit and Push
```
Commit all changes with a descriptive message. Push to [BRANCH].
Don't commit .env files or secrets.
```

### Auto-Commit After Work
```
Check if the working tree is dirty. If there are uncommitted changes,
generate a reasonable commit message based on what changed and commit.
Don't commit .env or secret files.
```

## Delegation Patterns

### Full Delegation
```
Perform all of the setup steps yourself. Set everything up. I'm not
doing any of it.
```

### Iterate Until Success
```
Can you finish it? Make sure it works and iterate until it does.
Don't stop until all tests pass and the feature is complete.
```

### Parallel Agent Launch
```
Launch [AGENT_1] and [AGENT_2] in parallel. Have them work on
[WORKSTREAM_A] and [WORKSTREAM_B] respectively. They share the
interface contracts defined in plans/parallelization.md.
```

## Anti-Patterns to Avoid

| Don't Do This | Do This Instead |
|---------------|-----------------|
| "Can you help me set up the database?" | "Set up the database. Do all the steps yourself." |
| "Maybe we should update the roadmap?" | "Update the roadmap and write a dev log." |
| "Try to fix the auth if you can" | "Fix all failing tests. No failures before proceeding." |
| Vague requests without context | Reference specific workstream IDs and files |
| Mixing unrelated tasks | One task per prompt, one concern per commit |
| Forgetting roadmap updates | Always include "update the roadmap" in prompts |
| Skipping tests | "Write tests" is mandatory in every implementation prompt |
| Including time estimates | Agents work differently — use phases, not timelines |
