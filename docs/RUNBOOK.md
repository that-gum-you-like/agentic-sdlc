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

## 2. Scheduler

### Quick commands

```bash
node ~/agentic-sdlc/agents/scheduler-install.mjs status    # all timers + next runs
systemctl --user list-timers 'sdlc-sched-*'                # same, raw
```

### Cadence

The system runs on a multi-frequency timer model:

| Interval | Services |
|---|---|
| Every 15 min | autonomous drain, pilot drain, kanban-sync |
| Every 20 min | PR auto-review (all review agents) |
| Every 30 min | deploy-reconcile |
| Daily | heartbeat, daily-review, backlog-review, daily-cost-report, health-check |
| Weekly | doc-sync, rag-index, pattern-hunt, red-team |
| Monthly | behavior-audit |

### Two-wave timer model

Timers are deployed in two waves with different risk profiles:

**Wave 1 — Housekeeping (12 units, always enabled).** Read-only monitoring and
reporting that writes nothing to customer systems: `daily-review`,
`backlog-review`, `daily-cost-report`, `doc-sync-daily`, `health-check-daily`,
`kanban-sync`, `model-manager-check`, `monthly-behavior-audit`,
`rag-index-weekly`, `red-team-weekly`, `weekly-pattern-hunt`, `sdlc-update`.
These run autonomously and are safe to leave enabled at all times.

**Wave 2 — Autonomous action (7 units, deliberately disabled by default).**
These write code, merge PRs, and deploy to production: `autonomous-drain`,
`pilot-drain`, `personal-website-drain`, `pr-auto-review`, `pilot-review`,
`personal-website-review`, `deploy-reconcile`. Wave 2 is gated on the
`env-guard.mjs` safety layer (see §11). It stays disabled until the guard
explicitly lands and is verified.

### Managing the schedule

The job list lives in `~/agentic-sdlc/agents/cron-schedule.json`. After editing:

```bash
node ~/agentic-sdlc/agents/scheduler-install.mjs install
```

Enable or disable individual timers:

```bash
systemctl --user enable sdlc-sched-<name>.timer
systemctl --user disable sdlc-sched-<name>.timer
```

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

## 9. Heartbeat (daily liveness)

A daily Telegram message sent by `agents/heartbeat.mjs` that proves the system
is alive. **Governing principle: silence must never be ambiguous.** Without the
heartbeat, the system was once offline for 32 days without anyone noticing.

### What it reports

The heartbeat composes a single Telegram message each day containing:

- Timers running vs expected (any missing timer is flagged first)
- Drain ticks in the last 24 hours
- PRs merged since yesterday
- Open deploy approvals awaiting your response
- Blocked tasks in the queue
- Open `chore`/`note` items (non-code work)
- Today's token spend
- Health-check degradation
- Portfolio drift (missing project paths, stale git HEADs, enabled projects with
  no drain activity)

Abnormal items always appear first in the message body, followed by nominal
counts. A completely nominal day still sends a message — that is the point.

### Reading the heartbeat

| Signal | Meaning |
|---|---|
| All sections present, abnormal section empty | System is running nominally |
| Timer X is missing | That timer is disabled or failed — check `systemctl --user list-timers` |
| Drain ticks = 0 | No work was drained in 24h — the queue may be empty or the drain is stuck |
| Drift findings appear | A project path is missing, a build-stage repo is stale, or an enabled project is inactive |

### Acting on a degraded heartbeat

1. Check the specific failing subsystem:
   ```bash
   systemctl --user list-timers 'sdlc-sched-*'        # timer health
   systemctl --user --failed                           # failed units
   journalctl --user -u sdlc-sched-heartbeat -n 20     # heartbeat's own logs
   ```
2. If a timer shows as missing, re-install:
   ```bash
   node ~/agentic-sdlc/agents/scheduler-install.mjs install
   ```
3. If the heartbeat itself is not arriving, check the gateway and notify path:
   ```bash
   node ~/agentic-sdlc/agents/notify.mjs status
   systemctl --user status hermes-gateway
   ```

### Manual trigger

```bash
node ~/agentic-sdlc/agents/heartbeat.mjs
```
Exit code 0 = delivered successfully. Non-zero = delivery failure — the failure
is visible in `systemctl --user --failed`.

## 10. Guard denial

`agents/env-guard.mjs` is the safety boundary that prevents an autonomous agent
from writing to a customer production database without an explicit, single-use,
sha-bound human approval.

### How the guard works

Every environment in `portfolio.json` carries a `tier` field. The guard checks
the tier before allowing any operation:

| Tier | Read | Write / Migrate / Deploy |
|---|---|---|
| `scratch` | allow | allow |
| `internal-production` | allow | allow + notify (recorded) |
| `customer-production` | allow + record | **DENY** unless a fresh approval is presented |
| missing / unknown / malformed | **DENY** | **DENY** |

The guard **fails closed**: if a tier is missing, the portfolio is unreadable,
the project is unknown, or the environment doesn't exist — the answer is always
deny. A guard that can be defeated by an omission is decoration.

### Reading a guard denial

When a drain agent or deploy-runner hits a denial, it leaves an artifact:

```bash
cat ~/agentic-sdlc/pm/drain-logs/$(ls -t ~/agentic-sdlc/pm/drain-logs | head -1)
```

A denial message looks like:

```
DENY: customer-production write to tally/production — requires APPROVE <sha8>
```

The denial tells you three things:
1. Which project + environment was targeted
2. What operation was attempted
3. What is needed to proceed (a sha-bound approval)

### Acting on a guard denial — approving a specific action

When the guard denies a `customer-production` write, you can approve the exact
commit by sending the deploy bot (the second Telegram bot):

```
APPROVE <sha8>
```

Where `<sha8>` is the 8-character prefix of the commit the agent wants to
deploy. Rules:

- An approval is **single-use**: after it is consumed it is gone
- An approval is **sha-bound**: it authorises exactly one commit, not a branch
- To reject: `REJECT <sha8>` — that commit will never deploy
- Approvals have no expiry, but the guard requires a *fresh* one per action

To see all open approvals:

```bash
ls ~/agentic-sdlc/pm/approvals/
```

To force-check a specific operation without deploying:

```bash
node ~/agentic-sdlc/agents/env-guard.mjs check <project> <environment> <write|deploy>
```

### Preventing guard bypass

- The guard is invoked from chokepoints (`deploy-runner.mjs`, drain scripts),
  not from every individual call site
- `four-layer-validate.mjs` flags any agent-authored task description containing
  literal `supabase db push` or `vercel --prod` strings
- If an environment's tier is unknown, unset, or misspelled, the guard denies.
  There is no default tier — every environment must be explicitly declared.

## 11. File map

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
