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

## Activate the whole schedule (systemd user timers)

The fastest way to make every cycle below run autonomously — for as long as the
machine is online, with runs missed during downtime caught up on next boot — is
`scheduler-install.mjs`. It reads `agents/cron-schedule.json` (or the shipped
template), skips jobs whose required agent/adapter isn't present, translates each
cron expression to a systemd `OnCalendar`, and installs a `Persistent=true` timer
per job under `~/.config/systemd/user/` (namespaced `sdlc-sched-*`).

```bash
node ~/agentic-sdlc/agents/scheduler-install.mjs list              # Preview (incl. skips)
node ~/agentic-sdlc/agents/scheduler-install.mjs install           # Install + enable
node ~/agentic-sdlc/agents/scheduler-install.mjs status            # systemctl --user list-timers
node ~/agentic-sdlc/agents/scheduler-install.mjs uninstall         # Remove all sdlc-sched-* units
```

Requires the systemd **user** manager and `loginctl enable-linger $USER` (so
timers fire without an active login session). This is the local, privacy-first
alternative to the OpenClaw-cron one-liners below — use whichever you prefer.

## Automated via OpenClaw Cron (Optional)

- Weekly REM sleep: `openclaw cron add --name rem-sleep-weekly --cron "0 23 * * 0" --message "Run: node ~/agentic-sdlc/agents/rem-sleep.mjs" --session isolated`
- Daily cost report: `openclaw cron add --name cost-report-daily --cron "0 6 * * *" --message "Run: node ~/agentic-sdlc/agents/cost-tracker.mjs report" --session isolated`

### Hermes-ported automation scripts (opt-in)

Registration ≠ activation — these run only once you add the cron job. Telegram is a notification *channel* (`notification.provider: "telegram"`), not a scheduled job.

| Script | Cadence | OpenClaw cron one-liner |
|--------|---------|-------------------------|
| `health-check.mjs` | Daily | `openclaw cron add --name health-check-daily --cron "0 6 * * *" --message "Run: node ~/agentic-sdlc/agents/health-check.mjs --notify" --session isolated` |
| `red-team-tester.mjs` | Weekly | `openclaw cron add --name red-team-weekly --cron "0 22 * * 0" --message "Run: node ~/agentic-sdlc/agents/red-team-tester.mjs --notify" --session isolated` |
| `rag-indexer.mjs` | Weekly | `openclaw cron add --name rag-index-weekly --cron "30 23 * * 0" --message "Run: node ~/agentic-sdlc/agents/rag-indexer.mjs" --session isolated` |
| `document-sync.mjs` | Daily | `openclaw cron add --name doc-sync-daily --cron "15 6 * * *" --message "Run: node ~/agentic-sdlc/agents/document-sync.mjs" --session isolated` |

## Monthly

- Behavior audit, agent versioning, compost cleanup, cost review

## Cycle History

All automated cycle runs are recorded in `pm/cycle-history.json` with type, timestamp, success/failure, and summary stats. Both daily and weekly reviews append entries automatically.
