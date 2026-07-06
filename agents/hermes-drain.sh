#!/usr/bin/env bash
# hermes-drain.sh — autonomous backlog drainer.
#
# Runs ONE ready queue task through an isolated, local-backend Hermes instance
# (HERMES_HOME=~/.hermes-drain, OpenRouter affordable ladder) and opens a PR for
# review. The work happens in a DISPOSABLE git worktree, so the main working tree
# is never touched — an interrupted run can't dirty `main`, and the drain can run
# regardless of what branch the main checkout is on.
#
# Concurrency-safe: a SHARED atomic mutex (pm/.sdlc-autonomous.lock.d, also held
# by pr-auto-review) means only ONE autonomous git-mutating job runs at a time.
# Cost-gated (no LLM call unless a task is ready); caps unreviewed drain PRs.
#
# Usage: bash agents/hermes-drain.sh [--dry-run]
set -uo pipefail

REPO="${SDLC_REPO:-/home/bryce/agentic-sdlc}"
DRAIN_HOME="${HERMES_DRAIN_HOME:-/home/bryce/.hermes-drain}"
PROMPT_FILE="${REPO}/agents/drain-prompt.md"
# Shared mutex — mutually exclusive with pr-auto-review (same path).
LOCKDIR="${REPO}/pm/.sdlc-autonomous.lock.d"
LOGDIR="${REPO}/pm/drain-logs"
WORKTREE="${SDLC_DRAIN_WORKTREE:-/home/bryce/.sdlc-drain-worktree}"
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
cleanup() { git -C "$REPO" worktree remove --force "$WORKTREE" 2>/dev/null; rm -rf "$LOCKDIR"; }
trap cleanup EXIT

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
  log "DRY RUN — would drain: $ready ready task(s), $open_prs open drain PR(s), worktree $WORKTREE"; exit 0
fi

# --- provision a disposable worktree at latest origin/main (never touch main tree) ---
git -C "$REPO" fetch origin --quiet 2>/dev/null || true
git -C "$REPO" worktree remove --force "$WORKTREE" 2>/dev/null || true
git -C "$REPO" worktree prune 2>/dev/null || true
rm -rf "$WORKTREE"
if ! git -C "$REPO" worktree add --detach "$WORKTREE" origin/main 2>/dev/null; then
  log "could not create worktree at $WORKTREE — skip"; exit 1
fi

# --- run the isolated, local-backend, OpenRouter Hermes drain worker IN the worktree ---
ts="$(date +%Y%m%d-%H%M%S)"
logfile="$LOGDIR/drain-$ts.log"
log "$ready ready task(s) — invoking Hermes drain worker in worktree (log: $logfile)"
( cd "$WORKTREE" && HERMES_HOME="$DRAIN_HOME" TERMINAL_ENV=local TERMINAL_CWD="$WORKTREE" \
  timeout 3600 hermes -z "$(cat "$PROMPT_FILE")" --cli --yolo ) > "$logfile" 2>&1
rc=$?
tail -3 "$logfile" 2>/dev/null | sed 's/^/[hermes-drain]   /'
log "drain finished (rc=$rc)"
exit 0
