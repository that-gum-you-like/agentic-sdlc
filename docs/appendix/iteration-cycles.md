# Appendix: Iteration Cycles

**Source**: CLAUDE.md (pre-split 2026-05-27). The slim CLAUDE.md mentions cycles in one line; full detail lives here.

---

## Micro (Minutes)

Pick → Implement → Test → Browser E2E (if frontend changed) → Commit → Next

## Daily

- After every task: update task JSON, record cost
- End of session: `node ~/agentic-sdlc/agents/cycles/daily-review.mjs`

## Weekly

- Weekly review: `node ~/agentic-sdlc/agents/cycles/weekly-review.mjs`
- Pattern review: `node ~/agentic-sdlc/agents/pattern-hunt.mjs`
- Memory cleanup: `node ~/agentic-sdlc/agents/rem-sleep.mjs`
- Behavior tests: `node ~/agentic-sdlc/agents/test-behavior.mjs`

## Automated via OpenClaw Cron (Optional)

- Weekly REM sleep: `openclaw cron add --name rem-sleep-weekly --cron "0 23 * * 0" --message "Run: node ~/agentic-sdlc/agents/rem-sleep.mjs" --session isolated`
- Daily cost report: `openclaw cron add --name cost-report-daily --cron "0 6 * * *" --message "Run: node ~/agentic-sdlc/agents/cost-tracker.mjs report" --session isolated`

## Monthly

- Behavior audit, agent versioning, compost cleanup, cost review

## Cycle History

All automated cycle runs are recorded in `pm/cycle-history.json` with type, timestamp, success/failure, and summary stats. Both daily and weekly reviews append entries automatically.
