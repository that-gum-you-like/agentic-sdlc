#!/usr/bin/env bash
# hermes-drain.sh — autonomous backlog drainer.
#
# Runs ONE ready queue task through an isolated, local-backend Hermes instance
# (HERMES_HOME=~/.hermes-drain, OpenRouter affordable ladder) working inside a
# DEDICATED CLONE of the repo (~/.sdlc-drain-clone) — a fully separate .git and
# working tree. The main repo is NEVER touched: no worktree, no branch switch,
# no dirtying main, even if the run is interrupted. Hermes branches/commits/
# pushes/opens-a-PR from the clone against the same origin.
#
# Concurrency-safe: a SHARED atomic mutex (pm/.sdlc-autonomous.lock.d, also held
# by pr-auto-review) means only ONE autonomous job runs at a time (drain XOR
# review). Cost-gated (no LLM call unless a task is ready); caps unreviewed PRs.
#
# Usage: bash agents/hermes-drain.sh [--dry-run]
set -uo pipefail

REPO="${SDLC_REPO:-/home/bryce/agentic-sdlc}"
DRAIN_HOME="${HERMES_DRAIN_HOME:-/home/bryce/.hermes-drain}"
DRAIN_CLONE="${SDLC_DRAIN_CLONE:-/home/bryce/.sdlc-drain-clone}"
PROMPT_FILE="${REPO}/agents/drain-prompt.md"
LOCKDIR="${REPO}/pm/.sdlc-autonomous.lock.d"   # shared mutex (drain XOR review)
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
ready="$(node agents/queue-drainer.mjs status 2>/dev/null | grep -oiE 'Ready \(unblocked\): *[0-9]+' | grep -oE '[0-9]+' | head -1)"
ready="${ready:-0}"
if [ "$ready" -eq 0 ]; then log "no ready tasks — skip (no LLM call)"; exit 0; fi

# --- back-pressure: don't pile up unreviewed drain PRs ---
open_prs="$(gh pr list --search 'head:agent/drain/' --state open --json number -q 'length' 2>/dev/null || echo 0)"
if [ "${open_prs:-0}" -ge "$MAX_OPEN_DRAIN_PRS" ]; then
  log "$open_prs drain PR(s) awaiting review (cap $MAX_OPEN_DRAIN_PRS) — skip"; exit 0
fi

if [ ! -f "$DRAIN_HOME/config.yaml" ]; then log "drain profile missing: $DRAIN_HOME"; exit 1; fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY RUN — would drain: $ready ready task(s), $open_prs open drain PR(s), clone $DRAIN_CLONE"; exit 0
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
# -f: the previous worker legitimately leaves the clone dirty (queue claim/
# complete edits on its drain branch); the refresh must always win.
git -C "$DRAIN_CLONE" checkout -q -f -B main origin/main 2>/dev/null || { log "clone checkout failed"; exit 1; }
git -C "$DRAIN_CLONE" reset --hard origin/main --quiet 2>/dev/null || true
git -C "$DRAIN_CLONE" clean -fdq 2>/dev/null || true

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
  timeout 3600 hermes -z "$(cat "$PROMPT_FILE")" --cli --yolo ) > "$logfile" 2>&1
rc=$?
tail -3 "$logfile" 2>/dev/null | sed 's/^/[hermes-drain]   /'
log "drain finished (rc=$rc)"
exit 0
