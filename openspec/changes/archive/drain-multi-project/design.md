# Design — drain-multi-project

## The core confusion

`hermes-drain.sh` conflates two different directories under one variable, `REPO`:

- **Where the framework lives** — `queue-drainer.mjs`, `drain-prompt.md`.
- **Which project is being drained** — `tasks/queue/`, `agents/project.json`, the git remote.

For `~/agentic-sdlc` these are the same directory, so the conflation is invisible. Every failure mode in this change is a consequence of it.

The fix names them separately:

```sh
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # where the framework lives
REPO="${SDLC_REPO:-$(dirname "$SCRIPTS_DIR")}"                 # which project to drain
```

`SCRIPTS_DIR` derives from the script's own location, so it is correct no matter what `SDLC_REPO` says and no matter the caller's CWD (the systemd unit's CWD is not guaranteed). `REPO` keeps defaulting to the framework repo, so the installed timer's behavior is unchanged.

## The silent-failure defect

This is the important part of the change. The current gate:

```sh
ready="$(node agents/queue-drainer.mjs status 2>/dev/null | grep -oiE 'Ready \(unblocked\): *[0-9]+' | ... )"
ready="${ready:-0}"
if [ "$ready" -eq 0 ]; then log "no ready tasks — skip (no LLM call)"; exit 0; fi
```

Three separate mechanisms each convert a crash into `0`: `2>/dev/null` discards the error, the `grep` finds no match in empty output, and `${ready:-0}` supplies a plausible number. The result is a confident, wrong, *reassuring* message. A drain that is fundamentally broken looks exactly like a drain with nothing to do — which is the normal, expected state, so nobody investigates.

The fix separates "command failed" from "command said zero":

```sh
status_out="$(node "$SCRIPTS_DIR/queue-drainer.mjs" status --project-dir "$REPO" 2>&1)"; rc=$?
if [ "$rc" -ne 0 ]; then
  log "queue-drainer status FAILED (rc=$rc) for project: $REPO"
  printf '%s\n' "$status_out" | sed 's/^/[hermes-drain]   /' >&2
  exit 1
fi
ready="$(printf '%s' "$status_out" | grep -oiE 'Ready \(unblocked\): *[0-9]+' | grep -oE '[0-9]+' | head -1)"
if [ -z "$ready" ]; then
  log "could not parse ready count — treating as ERROR, not as an empty queue"
  printf '%s\n' "$status_out" | sed 's/^/[hermes-drain]   /' >&2
  exit 1
fi
```

Note `2>&1` rather than `2>/dev/null`: the error text is captured so it can be *shown*. An unparseable count is also an error, not a zero — if the status format changes, the drain must stop loudly rather than quietly idle forever.

Exit code `1` (not `0`) matters: the systemd unit records a failure, so a broken drain surfaces in `systemctl --user list-units --failed` instead of looking like a healthy no-op every 15 minutes.

## Base branch detection

```sh
detect_base_branch() {
  git -C "$1" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##'
}
BASE_BRANCH="${SDLC_BASE_BRANCH:-$(detect_base_branch "$DRAIN_CLONE")}"
BASE_BRANCH="${BASE_BRANCH:-main}"
```

`origin/HEAD` is set by `git clone`, so it is available in the fresh clone without a network call. Order: explicit `SDLC_BASE_BRANCH` → detected → `main`. The literal `main` survives only as a last-resort fallback, which is the right shape — it is a guess, and guesses belong last.

For an existing clone whose `origin/HEAD` is missing (older clones predate this), `git remote set-head origin -a` refreshes it; this needs the network, so it runs only when detection came back empty.

The drain prompt tells the agent to branch off `main` in prose. That prose is now wrong for `master`-default projects, so the prompt is passed the base branch. This is why `drain-prompt.md` gets a variable rather than staying untouched — a correct script plus a prompt that says "branch off main" would still produce a wrong branch.

## Prompt resolution

Project-specific prompt wins; framework prompt is the fallback:

```sh
PROMPT_FILE="${SDLC_DRAIN_PROMPT:-}"
[ -z "$PROMPT_FILE" ] && [ -f "${REPO}/agents/drain-prompt.md" ] && PROMPT_FILE="${REPO}/agents/drain-prompt.md"
[ -z "$PROMPT_FILE" ] && PROMPT_FILE="${SCRIPTS_DIR}/drain-prompt.md"
```

A project *may* specialize its drain contract, but does not have to. `~/tally` will not, initially — the framework contract is what we want to test.

## Per-project state

`DRAIN_CLONE` and the log directory derive from the project directory's basename:

```sh
PROJECT_NAME="$(basename "$REPO")"
DRAIN_CLONE="${SDLC_DRAIN_CLONE:-$HOME/.sdlc-drain-clone-$PROJECT_NAME}"
LOGDIR="${REPO}/pm/drain-logs"
```

This changes the framework repo's own default clone path from `~/.sdlc-drain-clone` to `~/.sdlc-drain-clone-agentic-sdlc`. That is a one-time re-clone, not a data loss — the clone is derived state, recreated on demand, and the script already handles a missing clone. Called out because it will show up as an unexpected `git clone` on the next scheduled run.

The **mutex stays shared and global** (`$SCRIPTS_DIR/../pm/.sdlc-autonomous.lock.d`) — deliberately. Its job is "only one autonomous job at a time on this host" (drain XOR review), which is about host resources and OpenRouter spend, not about a project. Making it per-project would let N projects drain concurrently and quietly multiply cost.

## Testing

`tests/hermes-drain.test.mjs` gains three regressions, one per defect:

1. **Framework resolution** — with `SDLC_REPO` pointed at a fixture project that has no `agents/queue-drainer.mjs`, the gate still runs (asserting the script does not depend on the framework living in the target).
2. **Base branch** — a fixture repo whose `origin/HEAD` is `master` yields `BASE_BRANCH=master`; `SDLC_BASE_BRANCH` overrides; missing `origin/HEAD` falls back to `main`.
3. **Silent failure** — when the status command exits non-zero, the script exits non-zero and does **not** print "no ready tasks". This is the regression that matters most; assert on both the exit code and the absence of the misleading message.

Static assertions (the existing suite's style) over the script text, plus real `git init` fixtures for branch detection. No LLM call in tests.

## Alternatives considered

**Copy the framework scripts into each project.** Rejected outright: it is the exact duplication the framework's cross-directory design exists to avoid, and Bryce's standing rule is that framework scripts live in `~/agentic-sdlc` and never get committed into a product repo.

**Make the drain always `cd` to the framework and pass `--project-dir` everywhere.** Effectively what this does, but wholesale `cd` would break the git operations that must run against the target clone. Naming the two directories separately is clearer than switching CWD and reasoning about which commands run where.

**Symlink `queue-drainer.mjs` into `~/tally/agents/`.** Would make the immediate error disappear while leaving the branch bug and the silent-failure bug in place, and would put framework surface into a product repo. It fixes the symptom that was noticed and leaves the two that were not.
