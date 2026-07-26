# Hermes Autonomous SDLC — Operator Runbook

Everything needed to run, watch, steer, and stop the system **solo**. All
inference runs on OpenRouter via `~/.hermes/.env` — no Claude, no OpenAI,
anywhere in the loop.

## The system at a glance

```
tasks/queue/*.json ──(15 min timer)──▶ hermes-drain.sh ──▶ draft PR
                                                             │ (20 min timer)
Telegram ◀── notifications ──┐                pr-auto-review.mjs ──▶ squash-merge
   │ APPROVE <sha8>          │                               │
   ▼                         │                               ▼ (30 min timer)
deploy bot ──▶ deploy-runner.mjs ──▶ vercel --prod ──▶ smoke verify ──▶ ✅/rollback
```

## 1. Services

```bash
systemctl --user status  hermes-gateway hermes-dashboard   # health
systemctl --user restart hermes-gateway                    # after .env/config changes
journalctl --user -fu hermes-gateway                       # follow gateway logs
```

- **Gateway** — Telegram chat bot + agent runtime.
- **Dashboard** — http://127.0.0.1:7777 (Command Center).
- **Chat CLI** — `hermes` in any terminal, or the **Hermes Agent** desktop icon
  (right-click: Dashboard / Gateway logs). Install/repair the icon:
  `node ~/agentic-sdlc/agents/install-desktop-launcher.mjs install`

## 2. Scheduler (the autonomy heartbeat)

```bash
node ~/agentic-sdlc/agents/scheduler-install.mjs status    # all timers + next runs
systemctl --user list-timers 'sdlc-sched-*'                # same, raw
```

Cadence: drain + kanban-sync every 15 min · PR review every 20 min ·
deploy-reconcile every 30 min · daily/weekly/monthly cycles.
Job list lives in `~/agentic-sdlc/agents/cron-schedule.json` — after editing:
`node ~/agentic-sdlc/agents/scheduler-install.mjs install`

## 3. Watching

```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs status        # queue state
tail -f ~/agentic-sdlc/pm/drain-logs/$(ls -t ~/agentic-sdlc/pm/drain-logs | head -1)
cat ~/agentic-sdlc/pm/pr-auto-review.log | tail -5         # review decisions (JSONL)
ls -t ~/hermes-outbox | head                               # delivered artifacts
```

Telegram tells you the rest: drain results, merges, deploy requests, deploys.
Desktop popups mirror the same events when you're at the machine.

## 4. Adding work

- **Drop a task file**: `tasks/queue/<ID>.json` in the target project
  (copy an existing one; `status: "pending"`, unique `id`). The next drain tick
  picks it up.
- **From an openspec change**: `node ~/agentic-sdlc/agents/seed-queue-from-openspec.mjs`
- **Another project**: `SDLC_REPO=~/tally bash ~/agentic-sdlc/agents/hermes-drain.sh --dry-run`
  to check, then add a drain job for it in `cron-schedule.json`.
- **Ad hoc**: just message the Telegram chat bot or run `hermes` — that's a
  full agent with terminal access.

## 5. Deploy approvals

When a deployable project's base branch advances, the bot asks:
`🚀 Deploy <project>? origin/<base>@<sha8> …`

- **Approve**: send `APPROVE <sha8>` to the **deploy bot** (the second bot).
- **Reject**: `REJECT <sha8>` — that commit will never deploy (terminal).
- **Pause all deploys for a project**: set `"enabled": false` in the `deploy`
  block of `<project>/agents/project.json`.
- **A deploy failed and is stuck**: failures are terminal per commit (no retry
  loops). After fixing the cause, delete the token:
  `rm <project>/pm/.deploy-failed-<sha8>` — the next 30-min tick retries.
- **Force a reconcile now**:
  `node ~/agentic-sdlc/agents/deploy-runner.mjs --project-dir <project>`

## 6. Budget & caps

- `~/agentic-sdlc/agents/budget.json` — per-agent model ladders + daily token
  budgets; `"conservationMode": true` halves all limits.
- `MAX_OPEN_DRAIN_PRS` (default 3) — drain back-pressure.
- `MAX_AUTO_MERGES` (default 3) — merges per review tick.
- Cost report: `node ~/agentic-sdlc/agents/cost-tracker.mjs report`

## 7. KILL SWITCH

```bash
systemctl --user stop 'sdlc-sched-*'                       # stop ALL autonomy now
systemctl --user disable 'sdlc-sched-*'                    # keep it off across reboots
```

Re-arm: `node ~/agentic-sdlc/agents/scheduler-install.mjs install`
(Gateway chat stays up separately; `systemctl --user stop hermes-gateway` for
full silence.)

## 8. Recovery

| Symptom | Fix |
|---|---|
| "another run holds the lock" for >2h | `rm -rf ~/agentic-sdlc/pm/.sdlc-autonomous.lock.d` (auto-stales after 2h anyway) |
| Drain clone wedged | `rm -rf ~/.sdlc-drain-clone-<project>` — next tick re-clones (derived state) |
| Deploy clone wedged | `rm -rf ~/.sdlc-deploy-clone-<project>` — same |
| Telegram silent | `node ~/agentic-sdlc/agents/notify.mjs status`; check `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` in `~/.hermes/.env`; restart gateway |
| Vercel deploys failing with auth errors | `vercel whoami` → `vercel login`; then clear the failed-sha token (§5) |
| Gateway acting up | `systemctl --user restart hermes-gateway`; `hermes doctor` |
| GitHub pushes failing | `gh auth status` (account: that-gum-you-like) |

## 9. File map

| Path | What |
|---|---|
| `~/.hermes/.env` | ALL secrets (OpenRouter, GitHub, Telegram) — never in a repo |
| `~/.hermes/config.yaml` | Hermes model ladder + plugins |
| `~/.hermes-drain/` | isolated drain-worker Hermes profile |
| `~/agentic-sdlc/agents/cron-schedule.json` | live timer schedule |
| `<project>/agents/project.json` | per-project config incl. `deploy` block |
| `<project>/tasks/queue/` | the work queue (source of truth) |
| `<project>/pm/` | markers, locks, approvals, drain logs |
| `~/hermes-outbox/` | artifacts delivered to you (receipts, failed-run logs) — safe to empty |
| `~/.sdlc-{drain,deploy}-clone-*` | disposable isolated clones |
