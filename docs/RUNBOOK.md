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
  Each task block is screened for prompt injection (`screenExternalInput`);
  flagged tasks are never written — they are skipped with reason
  `injection-screen` and a human task is raised.
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
- **Hard dollar stop: the OpenRouter per-key credit limit — $50/month** (decided
  2026-11-03). Token budgets above are soft; the key limit is what actually stops a
  runaway loop. Set it at openrouter.ai → Keys → the key in `~/.hermes-drain/.env`.
  Check: `curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer ***"`
  (`limit` must not be null).
- **Cross-provider fallback needs `GROQ_API_KEY`** in `~/.hermes/.env` and
  `~/.hermes-drain/.env`. Every ladder ends in a Groq rung; without the key an
  OpenRouter outage leaves no usable rung (model-manager now refuses keyless swaps).
- **Agent identity:** drain PRs are pushed with Bryce's fine-grained PAT and signed
  `Co-Authored-By: hermes-drain`; a separate bot account is optional.
- **Cadence:** drains run 24/7 via `drain-supervisor.mjs` (the five `*-drain` timers
  are `enabled:false` by design). No merge-only window.
- **Claude review lane:** flagged PRs (guardrail surface) wait for an interactive
  Claude Code session; no unattended `claude -p` (subscription-only, opt-in).

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

## 12. Flagged PRs (Claude review lane)

PRs that touch the guardrail surface (`FLAG_PATHS` in `agents/pr-auto-review.mjs`) are
automatically flagged for a human-quality (Claude) review — the cheap drain tier must
never auto-merge them. The system queues them and sends a one-time Telegram notice.

See also §6 (Budget & caps) for the one-line summary of the lane's purpose.

### Where the queue lives

The runtime queue file at `pm/claude-review-queue.json` (gitignored) holds entries with
`{pr, branch, headSha, reasons[], flaggedAt, notifiedAt, status}` where `status` is one
of `open`, `resolved`, or `superseded`. Each entry is keyed by PR number + head SHA;
a force-push marks the old entry `superseded` and creates a new `open` one.

Validate an entry against the schema at `agents/schemas/claude-review-queue.schema.json`.
List all open entries:

```bash
node agents/pr-auto-review.mjs list-flagged
```

### How the notice looks

When a flagged PR is first detected, the system sends a single Telegram message:

```
🔎 PR #70 "Touch drain" needs a Claude review — flagged: agents/hermes-drain.sh.
  Run /sdlc-review-flagged
```

Subsequent passes with the same SHA send nothing. A new head SHA triggers a new notice.

### How to run /sdlc-review-flagged

In an interactive Claude Code session, invoke the skill:

```
/sdlc-review-flagged
```

The skill at `skills/sdlc-review-flagged/SKILL.md` walks you through:

1. **list-flagged** — view open queue entries
2. **scratch worktree** — check out the PR in an isolated `mktemp -d` worktree
3. **merge origin/main** — bring the PR current
4. **npm test** — run the full suite (never merge with failing tests)
5. **read every changed line** of the flagged files — no skimming
6. **decide** — merge / changes-requested / close
7. **gh pr comment** — leave a review with rationale
8. **resolve-flagged** — mark the entry resolved in the queue
9. **clean up** — remove the scratch worktree

**Hard rules:** No LLM API calls (your eyes are the quality gate). Never merge with
failing tests. Never skip a flagged file's diff. Remove the worktree when done.

### How to clear a stuck entry

If the interactive session cannot run (no Claude Code available, or the reviewer is
blocked) and you need to clear a stuck `open` entry:

```bash
node agents/pr-auto-review.mjs resolve-flagged <PR> merged
node agents/pr-auto-review.mjs resolve-flagged <PR> closed
node agents/pr-auto-review.mjs resolve-flagged <PR> changes-requested
```

- `merged` — the PR was already merged outside the lane; marks the entry resolved.
- `closed` — the PR was closed without merging; marks the entry resolved.
- `changes-requested` — creates a `FIX-<PR>` task in the queue for re-drain.

To verify nothing is stuck:

```bash
node agents/pr-auto-review.mjs list-flagged   # should be empty
```

## 13. Hermes sandbox isolation (runtime-state-isolation RS-601..604)

Hermes Docker sandboxes must never mount `/home/bryce`, an ancestor, or a live checkout read-write (a root-run container once did, and left root-owned files in `~/agentic-sdlc`).

- **Config**: `~/.hermes/config.yaml` has `terminal.docker_mount_cwd_to_workspace: false`. With that, `/workspace` in a sandbox is `~/.hermes/sandboxes/docker/<name>/workspace`, a dedicated directory, not the live tree.
- **Guard**: `node agents/hermes-config-guard.mjs [config.yaml] [--cwd dir]` exits 1 naming the offending key, value and fix (flag true with cwd at home/checkout, or an rw `docker_volumes` entry of home/a checkout). Read-only; a missing config passes with a note. Runs in `health-check.mjs` as `hermes-config` (down on exposure).
- **Doctor**: `node agents/checkout-doctor.mjs [--json]` inspects running `hermes-*` containers' Mounts for rw home/ancestor/checkout. `health-check.mjs` reports it as `hermes-containers` and alerts once per exposed container-id set. Fix: stop and recreate the container after correcting the config. Docker unavailable or no containers is a note.
- **Collecting sandbox output**: work leaves a sandbox only through git. Push a feature branch and open a PR from inside the sandbox. For unpushed work use the bundle fallback: `git -C <sandbox workspace> bundle create /tmp/out.bundle <branch>`, then `git fetch /tmp/out.bundle <branch>` in a worktree and `chown` the files to the human user. Never copy files into a live checkout. The live checkout's `git status --porcelain` must be unchanged by sandbox activity (covered by `tests/hermes-config-guard.test.mjs`).

## 14. Guarded update, checkout doctor, no-root drain (runtime-state-isolation RS-1xx..3xx)

- **Archive**: `queue-drainer.mjs archive` stamps `archived_at` in the task file in `tasks/queue/`; nothing moves. `status` hides archived tasks from the Completed line (`--all` shows them). A legacy `tasks/completed/` is read for counts only. Restore it once with `node agents/migrate-task-archive.mjs [--dry-run]` (conflicts go to `<stateDir>/migration/task-archive-conflicts/`; it prints the command a human runs to remove the legacy dir).
- **Daily update**: `agents/sdlc-update.mjs` replaces the bare `git pull --ff-only`. It fast-forwards only when that is guaranteed to succeed, otherwise sends ONE alert per cause (`sdlc-update:<cause>`) naming the colliding paths, and alerts on drift (> 5 commits behind). It never stashes, resets, checks out, cleans or chowns. `--dry-run` classifies without pulling or alerting.
- **Install the unit** (human step, outside the repo): `node agents/sdlc-update.mjs --render-unit > ~/.config/systemd/user/sdlc-update.service && systemctl --user daemon-reload`. The template is `agents/templates/systemd/sdlc-update.service.template`; the timer (04:00) is unchanged. `scheduler-install.mjs` does not manage this unit.
- **Doctor**: `node agents/checkout-doctor.mjs [--json] [--repo <path>]` is read-only; it lists foreign-owned and stray paths and prints the `sudo chown` command for a human. Exit 1 when there are findings.
- **No root**: `hermes-drain.sh` and `drain-supervisor.mjs` exit 98 when run as uid 0 (dry-run included). Use the user-level units.

## 15. Where runtime state lives (runtime-state-isolation)

Agent memory is **not** written into the git checkout. The tracked
`agents/<agent>/memory/*.json` files are frozen **seeds** (read-only fallback); every runtime
read/write goes to the per-project state directory, so the live checkout stays clean and a
drain-clone `reset --hard` can never delete a lesson.

```
~/.local/state/sdlc/<project>/            # default; $XDG_STATE_HOME and $SDLC_STATE_DIR override
├── memory/<agent>/{core,long-term,medium-term,recent,compost,vectors}.json
├── memory/<agent>/.lock/                 # advisory lock (mkdir; stale after 10 min)
├── memory-audit.jsonl                    # one line per save (CV-REQ-072 format)
└── migration/                            # manifest + pre-migration snapshot (one-shot)
```

| Question | Answer |
|---|---|
| Roll everything back | `SDLC_STATE_DIR=legacy` (old in-tree behaviour; state dir and seeds are both kept) |
| Move the state dir | `SDLC_STATE_DIR=/some/path` in the unit env (the dir must be owned by you; a foreign-owned dir is refused) |
| Does the drain worker see it? | Yes: `hermes-drain.sh` exports the HOST `SDLC_STATE_DIR` to the worker; `pr-auto-review` recall reads it too |
| How does memory reach git? | `memory-publish.mjs`, timer `memory-publish-weekly` (Sun 23:45): one PR `chore(memory): weekly memory publish <date>` containing only changed layers |
| Reviewing the publish PR | Read the diff, merge by hand. It is scrubbed (pii-scrub + secrets patterns); a hit refuses the whole publish and alerts once. It is never self-merged and never touches the live checkout |
| Skip / dry run | `node agents/memory-publish.mjs --dry-run` lists the layers that would be published |

### One-shot migration (this host, run once)

```bash
cd ~/agentic-sdlc && git pull --ff-only              # after the PR is merged
node agents/migrate-runtime-state.mjs --dry-run      # prints the plan, writes nothing
node agents/migrate-runtime-state.mjs                # copies, sha256-verifies, writes manifest
```

It copies every seed into the state dir and verifies each sha256, merges the lessons rescued
in `state-archive/2026-11-12/` (PR #164) by entry id (so none is lost), and writes
`migration/runtime-state-manifest.json` only if everything verified. It never deletes or edits
a seed, never overwrites a state file, and is idempotent. Exit code 1 means a verification
failure: nothing was flipped and the seeds are intact.

`vectors.json` is derived: it is gitignored and rebuilt into the state dir by the semantic
indexer; the old tracked copy is simply dropped from git.
