# Sourced by hermes-drain.sh. The drain worker must never touch a human checkout:
# on 2026-11-03 a worker `cd`'d into ~/agentic-sdlc, committed on main and switched
# its branch. Snapshot branch + HEAD before the run; after it, report any change,
# switch a moved branch back when that tree is clean, and keep a backup ref for
# drain-authored commits. Commits are NEVER reset automatically: a human may have
# committed in the same window. Only unpushed commits count (`--not --remotes`),
# so pulling squash-merged drain PRs is not a trespass.
#
# Strictness is deliberate (runtime-state-isolation RS-REQ-051): this guard has NO allowlist.
# Scheduled writers (REM sleep, memory, snapshots, baselines) that used to dirty the tracked
# tree were moved to the state dir (~/.local/state/sdlc/<project>/) and task archiving now
# stamps in place; timer writers were removed rather than tolerated. Any tracked file that
# changes during a drain is therefore a real trespass (or a human edit, which the pre-run
# snapshot already exempts) and is restored with its patch saved first.
declare -A guard_branch guard_head guard_dirty

guard_snapshot() { # <checkout>...
  local hc
  for hc in "$@"; do
    guard_branch[$hc]="$(git -C "$hc" symbolic-ref --short -q HEAD || echo DETACHED)"
    guard_head[$hc]="$(git -C "$hc" rev-parse -q HEAD)"
    # Tracked files already modified before the run belong to the human: never touched.
    guard_dirty[$hc]="$(git -C "$hc" diff --name-only HEAD 2>/dev/null)"
  done
}

guard_check() { # <backup-ref-name> → prints a one-line report, empty when clean
  local backup="$1" hc now out=""
  for hc in "${!guard_branch[@]}"; do
    # Tracked files the run modified (e.g. a worker running `queue-drainer run` against the
    # human checkout, 2026-11-03) are restored — only files that were clean before the run.
    # The guard cannot tell a worker's edit from a human's or a timer's (2026-11-09: it
    # reverted an interactive session's edits and the weekly REM-sleep memory writes),
    # so every restored change is saved as a patch FIRST — nothing is ever lost.
    local f restored="" patch
    patch="${GUARD_BACKUP_DIR:-${HERMES_OUTBOX:-$HOME/hermes-outbox}}/${backup}-$(basename "$hc").patch"
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      printf '%s\n' "${guard_dirty[$hc]}" | grep -qxF -- "$f" && continue
      mkdir -p "$(dirname "$patch")" && git -C "$hc" diff HEAD -- "$f" >> "$patch" 2>/dev/null || continue
      git -C "$hc" checkout -q -- "$f" 2>/dev/null && restored="$restored $f"
    done < <(git -C "$hc" diff --name-only HEAD 2>/dev/null)
    [ -n "$restored" ] && out="$out $hc: modified tracked files restored:$restored (saved: git apply $patch);"
    now="$(git -C "$hc" symbolic-ref --short -q HEAD || echo DETACHED)"
    if [ "$now" != "${guard_branch[$hc]}" ]; then
      out="$out $hc: branch ${guard_branch[$hc]} -> $now;"
      if [ "${guard_branch[$hc]}" != DETACHED ] && [ -z "$(git -C "$hc" status --porcelain --untracked-files=no)" ]; then
        git -C "$hc" checkout -q "${guard_branch[$hc]}" && out="$out restored;"
      fi
    fi
    if [ "${guard_branch[$hc]}" != DETACHED ] && git -C "$hc" log --format=%B "${guard_head[$hc]}..${guard_branch[$hc]}" --not --remotes 2>/dev/null | grep -q 'Co-Authored-By: hermes-drain'; then
      git -C "$hc" branch -f "$backup" "${guard_branch[$hc]}" 2>/dev/null
      out="$out $hc: drain-authored commit(s) on ${guard_branch[$hc]} (backup ref $backup, NOT reset);"
    fi
  done
  printf '%s' "$out"
}
