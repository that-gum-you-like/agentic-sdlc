# Sourced by hermes-drain.sh. The drain worker must never touch a human checkout:
# on 2026-11-03 a worker `cd`'d into ~/agentic-sdlc, committed on main and switched
# its branch. Snapshot branch + HEAD before the run; after it, report any change,
# switch a moved branch back when that tree is clean, and keep a backup ref for
# drain-authored commits. Commits are NEVER reset automatically: a human may have
# committed in the same window. Only unpushed commits count (`--not --remotes`),
# so pulling squash-merged drain PRs is not a trespass.
declare -A guard_branch guard_head

guard_snapshot() { # <checkout>...
  local hc
  for hc in "$@"; do
    guard_branch[$hc]="$(git -C "$hc" symbolic-ref --short -q HEAD || echo DETACHED)"
    guard_head[$hc]="$(git -C "$hc" rev-parse -q HEAD)"
  done
}

guard_check() { # <backup-ref-name> → prints a one-line report, empty when clean
  local backup="$1" hc now out=""
  for hc in "${!guard_branch[@]}"; do
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
