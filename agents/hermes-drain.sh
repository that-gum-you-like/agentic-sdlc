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
if pgrep -f 'timeout 3600 hermes' >/dev/null 2>&1; then
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

if [ ! -f "$DRAIN_HOME/config.yaml" ]; then log "drain profile missing: $DRAIN_HOME"; exit 1; fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY RUN — project: $PROJECT_NAME ($REPO)"
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
DRAINER="node \"$SCRIPTS_DIR/queue-drainer.mjs\""

prompt_text="$(cat "$PROMPT_FILE")"
prompt_text="${prompt_text//\{\{BASE_BRANCH\}\}/$BASE_BRANCH}"
prompt_text="${prompt_text//\{\{PROJECT_NAME\}\}/$PROJECT_NAME}"
prompt_text="${prompt_text//\{\{PROJECT_REMOTE\}\}/$PROJECT_REMOTE}"
prompt_text="${prompt_text//\{\{TEST_CMD\}\}/$TEST_CMD}"
prompt_text="${prompt_text//\{\{DRAINER\}\}/$DRAINER}"

# --- run the isolated, local-backend, OpenRouter Hermes drain worker IN the clone ---
ts="$(date +%Y%m%d-%H%M%S)"
logfile="$LOGDIR/drain-$ts.log"
log "$ready ready task(s) — invoking Hermes drain worker in clone (log: $logfile)"
# SDLC_PROJECT_DIR is pinned to the CLONE: the systemd unit exports it pointing
# at the main repo, and load-config.mjs prefers it over CWD — without this
# override the worker's queue-drainer claim/complete calls DIRTY THE MAIN TREE
# (observed live 2026-07-06: timer-fired workers wrote task state into main).
( cd "$DRAIN_CLONE" && HERMES_HOME="$DRAIN_HOME" TERMINAL_ENV=local TERMINAL_CWD="$DRAIN_CLONE" \
  SDLC_PROJECT_DIR="$DRAIN_CLONE" \
  timeout 3600 hermes -z "$prompt_text" --cli --yolo ) > "$logfile" 2>&1
rc=$?
tail -3 "$logfile" 2>/dev/null | sed 's/^/[hermes-drain]   /'
log "drain finished (rc=$rc)"
exit 0
