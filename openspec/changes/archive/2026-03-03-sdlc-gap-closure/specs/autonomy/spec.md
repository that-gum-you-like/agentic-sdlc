# Spec: Autonomous Run

## Acceptance Criteria
- SDLC-001 task JSON exists in tasks/queue/ then moves to tasks/completed/
- Queue drainer assigns SDLC-001 to Roy and marks in_progress
- Worker generates a full prompt for Roy with AGENT.md + memory + task
- Roy subagent (sonnet model) implements integration tests for audioLessonService
- New test file exists and passes Jest
- Git commit references SDLC-001
- cost-log.json has at least 1 entry

## Test Cases
- Happy path: task created → assigned → worked → completed → archived
- Budget check: agent assignment respects budget.json limits
