#!/usr/bin/env bash
# hermes-drain.sh — autonomous backlog drainer.
#
# Runs ONE ready queue task through an isolated, local-backend Hermes instance
# (HERMES_HOME=~/.hermes-drain, OpenRouter affordable ladder) working inside a
# DEDICATED CLONE of the repo — a fully separate .git and working tree. The main
# repo is NEVER touched: no worktree, no branch switch, no dirtying the base
# branch, even if the run is interrupted. Hermes branches/commits/pushes/
# opens-a-PR from the clone against the same origin.
#
# Drains ANY SDLC-bootstrapped project, not just this repo (openspec:
# drain-multi-project). Two directories that used to be conflated:
#   SCRIPTS_DIR — where the FRAMEWORK lives (queue-drainer.mjs, drain-prompt.md)
#   REPO        — which PROJECT is being drained (tasks/queue, git remote)
# For ~/agentic-sdlc they are the same dir, which is why the conflation was
# invisible until a real product backlog (~/tally) was queued.
#
# Concurrency-safe: a SHARED atomic mutex (pm/.sdlc-autonomous.lock.d, also held
# by pr-auto-review) means only ONE autonomous job runs at a time (drain XOR
# review) HOST-WIDE across all projects — it bounds host resources and spend, so
# it is deliberately NOT per-project. Cost-gated (no LLM call unless a task is
# ready); caps unreviewed PRs.
#
# Usage: bash agents/hermes-drain.sh [--dry-run]
#   SDLC_REPO=~/tally bash agents/hermes-drain.sh      # drain another project
# Env: SDLC_REPO, SDLC_BASE_BRANCH, SDLC_DRAIN_PROMPT, SDLC_DRAIN_CLONE,
#      HERMES_DRAIN_HOME, MAX_OPEN_DRAIN_PRS
set -uo pipefail

# Where the framework lives — derived from THIS script's own location, so it is
# correct regardless of SDLC_REPO and of the caller's CWD (the systemd unit's
# working directory is not guaranteed).
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_REPO="$(dirname "$SCRIPTS_DIR")"

# Which project to drain. Default unchanged, so the installed timer is unaffected.
REPO="${SDLC_REPO:-$FRAMEWORK_REPO}"
PROJECT_NAME="$(basename "$REPO")"

DRAIN_HOME="${HERMES_DRAIN_HOME:-/home/bryce/.hermes-drain}"
DRAIN_CLONE="${SDLC_DRAIN_CLONE:-$HOME/.sdlc-drain-clone-$PROJECT_NAME}"

# Prompt: explicit override → the project's own contract → the framework's.
PROMPT_FILE="${SDLC_DRAIN_PROMPT:-}"
[ -z "$PROMPT_FILE" ] && [ -f "${REPO}/agents/drain-prompt.md" ] && PROMPT_FILE="${REPO}/agents/drain-prompt.md"
[ -z "$PROMPT_FILE" ] && PROMPT_FILE="${SCRIPTS_DIR}/drain-prompt.md"

# Mutex is HOST-GLOBAL (framework repo), shared with pr-auto-review — one
# autonomous job at a time across every project. Logs are per-project.
LOCKDIR="${SDLC_LOCK_DIR:-${FRAMEWORK_REPO}/pm/.sdlc-autonomous.lock.d}"
LOGDIR="${REPO}/pm/drain-logs"
MAX_OPEN_DRAIN_PRS="${MAX_OPEN_DRAIN_PRS:-3}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { echo "[hermes-drain] $*"; }

mkdir -p "$LOGDIR"

# --- SHARED atomic mutex (mkdir is atomic; stale after 2h) ---
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCKDIR" 2>/dev/null || echo 0) ))
  if [ "$age" -lt 7200 ]; then log "autonomous mutex held (age ${age}s) — skip"; exit 0; fi
  log "stale mutex (${age}s) — reclaiming"
  rm -rf "$LOCKDIR"
  mkdir "$LOCKDIR" 2>/dev/null || { log "lost the mutex race — skip"; exit 0; }
fi
echo "drain $$" > "$LOCKDIR/holder"
trap 'rm -rf "$LOCKDIR"' EXIT   # clone persists (reused); nothing on main to clean

# --- backstop: never run if another drain worker is already alive ---
# A --dry-run probe is exempt: it never invokes the LLM and never touches the
# clone, so it cannot collide with a live worker's clone writes. It still takes
# the shared mutex above, so two dry-runs still exclude each other (PR #63).
if [ "$DRY_RUN" -eq 0 ] && pgrep -f '^timeout 3600 hermes' >/dev/null 2>&1; then
  log "a drain worker is already running — skip"; exit 0
fi

cd "$REPO" || { log "repo not found: $REPO"; exit 1; }

# --- cost gate: only invoke the LLM when a task is actually ready (read-only) ---
# The framework script is invoked from SCRIPTS_DIR (NOT as a path relative to
# REPO): a bootstrapped project's agents/ holds only project config, never the
# framework .mjs scripts. load-config.mjs already supports --project-dir.
#
# stderr is CAPTURED, not discarded. The previous version piped it to /dev/null
# and defaulted the count to 0, so a crashing status command was laundered into
# "no ready tasks — skip" — indistinguishable from a genuinely empty queue, and
# therefore invisible for as long as you cared to look. Failure must exit
# NON-ZERO so systemd records it instead of reporting a healthy no-op forever.
status_out="$(node "$SCRIPTS_DIR/queue-drainer.mjs" status --project-dir "$REPO" 2>&1)"; status_rc=$?
if [ "$status_rc" -ne 0 ]; then
  log "queue-drainer status FAILED (rc=$status_rc) for project: $REPO"
  printf '%s\n' "$status_out" | sed 's/^/[hermes-drain]   /' >&2
  exit 1
fi
ready="$(printf '%s' "$status_out" | grep -oiE 'Ready \(unblocked\): *[0-9]+' | grep -oE '[0-9]+' | head -1)"
if [ -z "$ready" ]; then
  log "could not parse a ready count from queue-drainer status — treating as ERROR, not as an empty queue"
  printf '%s\n' "$status_out" | sed 's/^/[hermes-drain]   /' >&2
  exit 1
fi
if [ "$ready" -eq 0 ]; then log "no ready tasks — skip (no LLM call)"; exit 0; fi

# --- back-pressure: don't pile up unreviewed drain PRs ---
# EXCEPTION: pending FIX-* tasks (self-healing repairs of rejected PRs) bypass
# the cap — fix work REDUCES the unreviewed pile the cap protects against.
open_prs="$(gh pr list --search 'head:agent/drain/' --state open --json number -q 'length' 2>/dev/null || echo 0)"
pending_fixes="$(node -e 'const fs=require("fs");let n=0;try{for(const f of fs.readdirSync("tasks/queue")){if(/^FIX-.*\.json$/.test(f)){try{if(JSON.parse(fs.readFileSync("tasks/queue/"+f,"utf8")).status==="pending")n++;}catch{}}}}catch{}console.log(n)' 2>/dev/null || echo 0)"
if [ "${open_prs:-0}" -ge "$MAX_OPEN_DRAIN_PRS" ] && [ "${pending_fixes:-0}" -eq 0 ]; then
  log "$open_prs drain PR(s) awaiting review (cap $MAX_OPEN_DRAIN_PRS) — skip"; exit 0
fi
[ "${pending_fixes:-0}" -gt 0 ] && log "$pending_fixes pending FIX task(s) — cap bypass allowed"

PROMPT_SCRIPTS_DIR="$SCRIPTS_DIR"
[ "$(cd "$REPO" && pwd)" = "$FRAMEWORK_REPO" ] && PROMPT_SCRIPTS_DIR="$DRAIN_CLONE/agents"

# --- the SCRIPT selects the task, not the model (openspec: curriculum-v2-conformance CV-REQ-120) ---
# Exclude NON-FIX tasks whose agent/drain/<id> PR is already open (a task stays
# `pending` on the base branch until its PR merges). FIX-* tasks are never excluded.
open_heads="$(gh pr list --search 'head:agent/drain/' --state open --json headRefName -q '.[].headRefName' 2>/dev/null || true)"
# Skip ledger: a task the worker gave up on ("DRAIN: skipped <id>" / "DRAIN: blocked <id>")
# only records that in the CLONE's queue, which the next reset wipes — and selection is
# deterministic, so without this the same task is re-picked every run, forever.
SKIP_LEDGER="${SDLC_DRAIN_SKIPS:-$FRAMEWORK_REPO/pm/drain-skips-$PROJECT_NAME.txt}"
skipped_ids="$(cat "$SKIP_LEDGER" 2>/dev/null | paste -sd, -)"
exclude_ids="$(printf '%s\n' "$open_heads" | sed -n 's#^agent/drain/##p' | grep -v '^FIX-' | paste -sd, -)"
exclude_ids="$(printf '%s,%s' "$exclude_ids" "$skipped_ids" | tr ',' '\n' | grep -v '^$' | sort -u | paste -sd, -)"

# select_task <project-dir> — sets TASK_ID and AGENT (empty TASK_ID = nothing selectable).
select_task() {   # $1 = project dir, $2 = dir holding queue-drainer.mjs
  local out parsed
  TASK_ID=""; AGENT=""
  if [ -n "$exclude_ids" ]; then
    out="$(SDLC_PROJECT_DIR="$1" node "$2/queue-drainer.mjs" next --exclude "$exclude_ids" 2>/dev/null)" || out=""
  else
    out="$(SDLC_PROJECT_DIR="$1" node "$2/queue-drainer.mjs" next 2>/dev/null)" || out=""
  fi
  [ -z "$out" ] && return 0
  # agent = task.agent || task.assignee || sdlc-developer, restricted to a safe path component
  parsed="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s);let a=t.agent||t.assignee||"sdlc-developer";if(!/^[A-Za-z0-9._-]+$/.test(a))a="sdlc-developer";console.log(t.id+" "+a)}catch(e){process.exitCode=1}})' 2>/dev/null)"
  [ -z "$parsed" ] && return 0
  TASK_ID="${parsed%% *}"; AGENT="${parsed#* }"
}

if [ ! -f "$DRAIN_HOME/config.yaml" ]; then log "drain profile missing: $DRAIN_HOME"; exit 1; fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY RUN — project: $PROJECT_NAME ($REPO)"
  select_task "$REPO" "$SCRIPTS_DIR"
  if [ -z "$TASK_ID" ]; then log "DRY RUN — nothing selectable — skip (no LLM call)"; exit 0; fi
  log "DRY RUN — selected task: $TASK_ID (agent $AGENT)"
  log "DRY RUN — would drain: $ready ready task(s), $open_prs open drain PR(s), clone $DRAIN_CLONE"
  log "DRY RUN — prompt: $PROMPT_FILE"; exit 0
fi

# --- provision/refresh the DEDICATED clone (total isolation from the main repo) ---
remote_url="$(git -C "$REPO" remote get-url origin 2>/dev/null)"
if [ -z "$remote_url" ]; then log "no origin remote on $REPO — skip"; exit 1; fi
if [ ! -d "$DRAIN_CLONE/.git" ]; then
  log "creating dedicated drain clone at $DRAIN_CLONE (one-time)…"
  rm -rf "$DRAIN_CLONE"
  git clone --quiet "$remote_url" "$DRAIN_CLONE" || { log "clone failed"; exit 1; }
fi
git -C "$DRAIN_CLONE" fetch origin --quiet 2>/dev/null || true

# --- base branch: DETECTED, not assumed ---
# `main` was hardcoded here, which silently aborted every project defaulting to
# `master` (e.g. ~/tally) AFTER the cost gate had already passed. origin/HEAD is
# written by git clone, so detection needs no network on a fresh clone; older
# clones may lack it, hence the one-shot refresh.
detect_base_branch() {
  git -C "$1" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##'
}
BASE_BRANCH="${SDLC_BASE_BRANCH:-$(detect_base_branch "$DRAIN_CLONE")}"
if [ -z "$BASE_BRANCH" ]; then
  git -C "$DRAIN_CLONE" remote set-head origin -a >/dev/null 2>&1 || true
  BASE_BRANCH="$(detect_base_branch "$DRAIN_CLONE")"
fi
BASE_BRANCH="${BASE_BRANCH:-main}"   # last-resort guess; guesses belong last
log "base branch: $BASE_BRANCH (project: $PROJECT_NAME)"

# -f: the previous worker legitimately leaves the clone dirty (queue claim/
# complete edits on its drain branch); the refresh must always win.
git -C "$DRAIN_CLONE" checkout -q -f -B "$BASE_BRANCH" "origin/$BASE_BRANCH" 2>/dev/null \
  || { log "clone checkout failed for origin/$BASE_BRANCH"; exit 1; }
git -C "$DRAIN_CLONE" reset --hard "origin/$BASE_BRANCH" --quiet 2>/dev/null || true
git -C "$DRAIN_CLONE" clean -fdq 2>/dev/null || true

# --- select the task from the FRESH clone; nothing selectable = no LLM call ---
select_task "$DRAIN_CLONE" "$PROMPT_SCRIPTS_DIR"
if [ -z "$TASK_ID" ]; then log "nothing selectable — skip (no LLM call)"; exit 0; fi
log "selected task: $TASK_ID (agent $AGENT)"

# --- the agent's identity: its AGENT.md from the clone (CV-REQ-121) ---
AGENT_IDENTITY=""
if [ -f "$DRAIN_CLONE/agents/$AGENT/AGENT.md" ]; then
  AGENT_IDENTITY="$(cat "$DRAIN_CLONE/agents/$AGENT/AGENT.md")"
elif [ -f "$DRAIN_CLONE/agents/sdlc-developer/AGENT.md" ]; then
  log "no AGENT.md for $AGENT — falling back to sdlc-developer identity"
  AGENT_IDENTITY="$(cat "$DRAIN_CLONE/agents/sdlc-developer/AGENT.md")"
else
  log "no AGENT.md for $AGENT or sdlc-developer — empty identity"
fi

# --- optional per-agent drain model (CV-REQ-122): opt-in; absent = the profile's own ladder ---
DRAIN_MODEL="$(node -e 'try{const b=JSON.parse(require("fs").readFileSync(process.argv[1]+"/agents/budget.json","utf8"));const m=(b.agents||{})[process.argv[2]];process.stdout.write((m&&typeof m.drainModel==="string"?m.drainModel:"").trim())}catch(e){process.stdout.write("")}' "$DRAIN_CLONE" "$AGENT" 2>/dev/null)"
MODEL_ARGS=()
if [ -n "$DRAIN_MODEL" ]; then MODEL_ARGS=(-m "$DRAIN_MODEL"); log "drainModel for $AGENT: $DRAIN_MODEL"; fi

# --- enforcing pre-commit gate in the clone (openspec: curriculum-v2-conformance CV-313) ---
# The drain commits unattended; the pre-commit hook is what refuses secrets and
# silent error swallowing. Installed from the FRAMEWORK script into the clone.
# If it cannot be installed, abort the pass rather than commit ungated.
if ! ( cd "$DRAIN_CLONE" && node "$SCRIPTS_DIR/review-hook.mjs" install --pre-only ) >/dev/null 2>&1; then
  log "pre-commit hook install FAILED in $DRAIN_CLONE — aborting pass (would commit ungated)"
  exit 1
fi

# --- dependencies: a FRESH clone has no node_modules, so the drain prompt's
# test step would fail for every task on a project that needs them. Install once
# per clone (and after a lockfile change), before the LLM is invoked.
if [ -f "$DRAIN_CLONE/package.json" ]; then
  lockhash=""
  [ -f "$DRAIN_CLONE/package-lock.json" ] && lockhash="$(md5sum "$DRAIN_CLONE/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
  stamp="$DRAIN_CLONE/node_modules/.sdlc-drain-deps"
  if [ ! -d "$DRAIN_CLONE/node_modules" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$lockhash" ]; then
    log "installing dependencies in clone (first run or lockfile changed)…"
    if [ -f "$DRAIN_CLONE/package-lock.json" ]; then
      ( cd "$DRAIN_CLONE" && npm ci --silent ) || ( cd "$DRAIN_CLONE" && npm install --silent )
    else
      ( cd "$DRAIN_CLONE" && npm install --silent )
    fi || { log "dependency install failed — skip (tests could not pass)"; exit 1; }
    mkdir -p "$DRAIN_CLONE/node_modules" && printf '%s' "$lockhash" > "$stamp"
  fi
fi

# --- resolve prompt placeholders for THIS project (openspec: drain-multi-project) ---
# The prompt is prose: a correct script paired with a prompt that says "branch
# off main" and "run npm test" still produces the wrong branch and a failed run.
PROJECT_REMOTE="$(git -C "$DRAIN_CLONE" remote get-url origin 2>/dev/null || echo unknown)"
TEST_CMD="$(node -e 'try{const c=require(process.argv[1]+"/agents/project.json");process.stdout.write(c.testCmd||"npm test")}catch{process.stdout.write("npm test")}' "$REPO" 2>/dev/null)"
TEST_CMD="${TEST_CMD:-npm test}"
# The prompt must never name the HUMAN's checkout ($FRAMEWORK_REPO): cheap models
# `cd` into any absolute path they are shown, and on 2026-11-03 a worker committed on
# the human's main and switched its branch. When draining the framework itself,
# point the prompt at the clone's own identical scripts instead.
DRAINER="node \"$PROMPT_SCRIPTS_DIR/queue-drainer.mjs\""

prompt_text="$(cat "$PROMPT_FILE")"
prompt_text="${prompt_text//\{\{BASE_BRANCH\}\}/$BASE_BRANCH}"
prompt_text="${prompt_text//\{\{PROJECT_NAME\}\}/$PROJECT_NAME}"
prompt_text="${prompt_text//\{\{PROJECT_REMOTE\}\}/$PROJECT_REMOTE}"
prompt_text="${prompt_text//\{\{TEST_CMD\}\}/$TEST_CMD}"
prompt_text="${prompt_text//\{\{DRAINER\}\}/$DRAINER}"
prompt_text="${prompt_text//\{\{SCRIPTS_DIR\}\}/$PROMPT_SCRIPTS_DIR}"
# AGENT.md is free text: bash 5.2 treats & in a ${var//pat/repl} replacement as the
# matched text — turn that off so &, \ and / in the identity survive verbatim.
shopt -u patsub_replacement 2>/dev/null || true
prompt_text="${prompt_text//\{\{TASK_ID\}\}/$TASK_ID}"
prompt_text="${prompt_text//\{\{AGENT_IDENTITY\}\}/$AGENT_IDENTITY}"
prompt_text="${prompt_text//\{\{AGENT\}\}/$AGENT}"
prompt_text="${prompt_text//\{\{HUMAN_CHECKOUTS\}\}/$FRAMEWORK_REPO$( [ "$REPO" != "$FRAMEWORK_REPO" ] && echo " and $REPO")}"

# --- run the isolated, local-backend, OpenRouter Hermes drain worker IN the clone ---
ts="$(date +%Y%m%d-%H%M%S)"
logfile="$LOGDIR/drain-$ts.log"
log "$ready ready task(s) — invoking Hermes drain worker in clone (log: $logfile)"
# SDLC_PROJECT_DIR is pinned to the CLONE: the systemd unit exports it pointing
# at the main repo, and load-config.mjs prefers it over CWD — without this
# override the worker's queue-drainer claim/complete calls DIRTY THE MAIN TREE
# (observed live 2026-07-06: timer-fired workers wrote task state into main).
# --- trespass guard: the worker must never touch a human checkout (drain-trespass-guard.sh) ---
. "$SCRIPTS_DIR/drain-trespass-guard.sh"
guard_snapshot "$FRAMEWORK_REPO" "$REPO"

( cd "$DRAIN_CLONE" && HERMES_HOME="$DRAIN_HOME" TERMINAL_ENV=local TERMINAL_CWD="$DRAIN_CLONE" \
  SDLC_PROJECT_DIR="$DRAIN_CLONE" \
  timeout 3600 hermes -z "$prompt_text" --cli --yolo ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} ) > "$logfile" 2>&1
rc=$?
tail -3 "$logfile" 2>/dev/null | sed 's/^/[hermes-drain]   /'

if grep -qE "DRAIN: (skipped|blocked) $TASK_ID\b" "$logfile" 2>/dev/null; then
  mkdir -p "$(dirname "$SKIP_LEDGER")" && echo "$TASK_ID" >> "$SKIP_LEDGER"
  log "worker gave up on $TASK_ID — added to skip ledger $SKIP_LEDGER (remove the line to retry)"
  [ "$rc" -eq 0 ] && rc=96   # surface it: the failure path notifies once with the log tail
fi

trespass="$(guard_check "drain-trespass-$ts")"
if [ -n "$trespass" ]; then
  log "TRESPASS — worker touched a human checkout:$trespass"
  echo "TRESPASS — worker touched a human checkout:$trespass" >> "$logfile"
  rc=97   # non-zero: the failure path below copies the log to the outbox and notifies
fi
log "drain finished (rc=$rc)"

# --- failed runs land in the outbox for inspection (openspec: operator-desktop-launcher) ---
if [ "$rc" -ne 0 ]; then
  outbox="${HERMES_OUTBOX:-$HOME/hermes-outbox}"
  mkdir -p "$outbox" 2>/dev/null || true
  cp "$logfile" "$outbox/$(date +%Y%m%d-%H%M%S)-drain-$PROJECT_NAME-failed.log" 2>/dev/null || true
fi

# --- best-effort FAILURE notify (openspec: telegram-activation, business-os) ---
# Routed through the DRAINED project's own notification config (a project with
# provider "none" stays silent). MUST NOT change the drain's exit code: a
# successful drain with a failed notification is still a successful drain.
#
# Success is DELIBERATELY silent. The drain fires every 15 minutes; a message
# per tick trains the reader to ignore the channel, which costs you the one
# message that mattered. Routine success belongs in the daily heartbeat;
# this channel carries deploys and failures only (Bryce, 2026-09-02).
if [ "$rc" -ne 0 ]; then
  last_line="$(tail -1 "$logfile" 2>/dev/null | cut -c1-200)"
  SDLC_PROJECT_DIR="$REPO" node "$SCRIPTS_DIR/notify.mjs" send \
    "❌ drain $PROJECT_NAME FAILED (rc=$rc) — $ready task(s) were ready. Last: $last_line" \
    >/dev/null 2>&1 || true
fi

exit 0
