#!/usr/bin/env bash
# hermes-drain.sh — autonomous backlog drainer.
#
# Runs ONE ready queue task through an isolated, local-backend Hermes instance
# (HERMES_HOME=~/.hermes-drain, OpenRouter affordable ladder) which operates
# directly on the host repo and opens a PR for human review. The main Hermes
# assistant (docker-sandboxed) is untouched.
#
# Safe by construction: acts only when the repo is idle on `main` with a clean
# tree AND a task is actually ready (so idle ticks cost nothing), never touches
# main, caps unreviewed drain PRs. Scheduled by a systemd user timer.
#
# Usage: bash agents/hermes-drain.sh [--dry-run]
set -uo pipefail

REPO="${SDLC_REPO:-/home/bryce/agentic-sdlc}"
DRAIN_HOME="${HERMES_DRAIN_HOME:-/home/bryce/.hermes-drain}"
PROMPT_FILE="${REPO}/agents/drain-prompt.md"
LOCKDIR="${REPO}/pm/.hermes-drain.lock.d"
LOGDIR="${REPO}/pm/drain-logs"
MAX_OPEN_DRAIN_PRS="${MAX_OPEN_DRAIN_PRS:-3}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { echo "[hermes-drain] $*"; }

mkdir -p "$LOGDIR"

# --- ATOMIC single-flight lock (stale after 2h) ---
# mkdir is atomic on POSIX filesystems: exactly one racing process creates the
# dir, the rest fail. A plain `[ -f lock ]` test + write is a TOCTOU race that
# let 3 drains run concurrently on the shared host tree once — never again.
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCKDIR" 2>/dev/null || echo 0) ))
  if [ "$age" -lt 7200 ]; then log "another run holds the lock (age ${age}s) — skip"; exit 0; fi
  log "stale lock (${age}s) — reclaiming"
  rm -rf "$LOCKDIR"
  mkdir "$LOCKDIR" 2>/dev/null || { log "lost the lock race — skip"; exit 0; }
fi
echo "$$" > "$LOCKDIR/pid"
trap 'rm -rf "$LOCKDIR"' EXIT

# --- backstop: never run if another drain worker is already alive ---
# (belt-and-suspenders in case a lock dir was removed while a worker lived)
if pgrep -f 'timeout 3600 hermes' >/dev/null 2>&1; then
  log "a drain worker is already running — skip"; exit 0
fi

cd "$REPO" || { log "repo not found: $REPO"; exit 1; }

# --- only act when the repo is idle on main with a clean tree ---
branch="$(git branch --show-current 2>/dev/null || echo '?')"
if [ "$branch" != "main" ]; then log "repo on '$branch', not main — skip (won't disturb active work)"; exit 0; fi
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then log "working tree dirty — skip"; exit 0; fi

# --- cost gate: only invoke the LLM when a task is actually ready ---
ready="$(node agents/queue-drainer.mjs status 2>/dev/null | grep -oiE 'Ready \(unblocked\): *[0-9]+' | grep -oE '[0-9]+' | head -1)"
ready="${ready:-0}"
if [ "$ready" -eq 0 ]; then log "no ready tasks — skip (no LLM call)"; exit 0; fi

# --- back-pressure: don't pile up unreviewed drain PRs ---
open_prs="$(gh pr list --search 'head:agent/drain/' --state open --json number -q 'length' 2>/dev/null || echo 0)"
if [ "${open_prs:-0}" -ge "$MAX_OPEN_DRAIN_PRS" ]; then
  log "$open_prs drain PR(s) awaiting review (cap $MAX_OPEN_DRAIN_PRS) — skip"; exit 0
fi

if [ ! -f "$DRAIN_HOME/config.yaml" ]; then log "drain profile missing: $DRAIN_HOME — run setup (see openspec/changes/autonomous-drain)"; exit 1; fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "DRY RUN — would drain: $ready ready task(s), $open_prs open drain PR(s), profile $DRAIN_HOME"; exit 0
fi

# --- run the isolated, local-backend, OpenRouter Hermes drain worker ---
ts="$(date +%Y%m%d-%H%M%S)"
logfile="$LOGDIR/drain-$ts.log"
log "$ready ready task(s) — invoking Hermes drain worker (log: $logfile)"
HERMES_HOME="$DRAIN_HOME" TERMINAL_ENV=local TERMINAL_CWD="$REPO" \
  timeout 3600 hermes -z "$(cat "$PROMPT_FILE")" --cli --yolo > "$logfile" 2>&1
rc=$?
tail -3 "$logfile" 2>/dev/null | sed 's/^/[hermes-drain]   /'
log "drain finished (rc=$rc)"
exit 0
