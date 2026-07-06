# Design: auto-review-merge

**Date**: 2026-07-05
**Status**: design

---

## Context

The drain produces `agent/drain/<task-id>` PRs on cheap OpenRouter models; a reviewer must hold them to the same standard a careful human did for PR #7: *green in a clean checkout*, in-scope, and safe. The reviewer itself runs unattended, so its judgment must be layered — deterministic gates first, an LLM only as the last, weakest voice — and it must be structurally unable to approve changes to its own guardrails.

## Goals

- Unattended review + merge of safe, green drain PRs; the loop needs no human.
- The clean-worktree test gate is absolute: no pass, no merge, no exceptions.
- Guardrail-touching PRs (drain, this pipeline, CI, budget) are surfaced, never auto-merged.
- Merged work marks its queue task complete so the drain moves on.
- Idle runs are free; reviews are cheap; every decision is auditable.

## Non-Goals

- Auto-closing PRs on soft failures (a human may want to salvage them; only hard-unsafe diffs get a rejecting comment, and even those stay open).
- Reviewing non-drain PRs (feature branches from humans/CTO sessions are out of scope).
- Fixing PRs in place (that's a CTO-session job; the pipeline only gates, comments, merges).

## Design

### Pipeline (`agents/pr-auto-review.mjs`, Node stdlib only)

Per run, under a `pm/.pr-auto-review.lock.d` mkdir-lock (stale 2h):

1. **Reconcile** — for recently *merged* `agent/drain/*` PRs whose queue task is still pending, mark it complete on a clean `main` and push. Self-heals a crash between merge and queue-update, and stops the drain from re-picking done work.
2. **List** open `agent/drain/*` PRs (`gh pr list --search 'head:agent/drain/'`).
3. Per PR, newest last, stopping after `MAX_AUTO_MERGES` (default 3) merges:
   - **Skip if already reviewed at this head SHA** — the pipeline's PR comments embed `<!-- pr-auto-review sha:<oid> -->`; an unchanged PR is not re-gated or re-billed every 20 minutes.
   - **Scope scan** (deterministic, first): changed paths from `gh pr view --json files` + diff text.
     - *Hard-reject:* `.env`/`.env.*`, secret/credential/key files (`*.pem`, `id_rsa*`, `credentials*`, `secrets*`), any `.github` path containing `deploy`, any path escaping the repo (`../`, absolute).
     - *Flag (no auto-merge, comment for CTO/Bryce):* `agents/hermes-drain.sh`, `agents/drain-prompt.md`, `agents/pr-auto-review.mjs`, `.github/workflows/*`, `agents/budget.json`, `agents/templates/cron-schedule.json.template`, `agents/scheduler-install.mjs`, `tests/pr-auto-review.test.mjs`, `tests/hermes-drain.test.mjs` — the guardrail surface.
   - **HARD GATE**: `git fetch origin <branch>` → `git worktree add --detach <tmpdir> FETCH_HEAD` → `npm test` then `node agents/four-layer-validate.mjs` with `cwd=<tmpdir>` (bounded timeouts) → worktree removed. Fail ⇒ comment with the tail of the failing output; leave open.
   - **LLM review**: prompt = task JSON (from `tasks/queue/<id>.json` if present) + PR title/body + truncated diff (≤ 60k chars) + safety checklist; strict-JSON `{"verdict":"approve"|"reject","reasons":[...]}` via `loadLlmAdapter(config, 'openrouter').complete(prompt, { model: 'deepseek/deepseek-chat-v3.1', temperature: 0 })`. Unparseable/errored responses are soft failures (leave open), never approvals.
   - **Act**: gate + scope + approve ⇒ `gh pr merge <n> --squash --delete-branch`, then complete the task (`node agents/queue-drainer.mjs complete <id> passing`, commit `tasks/queue/<id>.json`, push) — only when the host repo is idle on a clean `main`; otherwise the reconcile pass picks it up next run. Anything else ⇒ post the review comment (marker + verdict + reasons), leave open.
4. Append one JSON line per decision to `pm/pr-auto-review.log`.

The LLM is the *last* gate and can only turn a merge into a non-merge. Nothing it says can bypass the hard gate or the scope scan, and the files defining the gates are themselves on the flag list.

### Credentials

`OPENROUTER_API_KEY` from the environment, else parsed (read-only) from `~/.hermes-drain/.env` — the same account the drain uses. `gh` is already authed on the host.

### Scheduler PATH fix (`scheduler-install.mjs`)

`buildUnits` renders `Environment=PATH=` from: node's bin dir, the *installer-resolved* `gh` directory (`which gh` at install time), `~/.local/bin` (hermes), then `/usr/local/bin:/usr/bin:/bin`. This fixes the observed rc=127 (`hermes: No such file or directory`) on timer-run drains and gives this pipeline `gh` under systemd.

### Scheduling

`cron-schedule.json.template` gains `pr-auto-review` at `7,27,47 * * * *` (drain is `*/15` = :00/:15/:30/:45; review runs 7 minutes after each tick, never concurrent with a fresh drain *start*). `cronToOnCalendar` already passes comma lists through (`7,27,47` → `*-*-* *:7,27,47:00`, valid systemd) — a test now pins that.

### Testing (`tests/pr-auto-review.test.mjs`)

Pure-function coverage, no network, no `gh`: scope scan (rejects, flags, escapes, clean paths), verdict parsing (strict JSON, fenced JSON, garbage ⇒ null, missing fields ⇒ null), review-prompt construction (task + checklist + diff present), task-id extraction from branch names, merge rate-limit config, and the structural guards (script exports, `__isMainModule` guard so importing is side-effect-free, lock + marker + hard-gate commands present in source). The scheduler test gains the comma-list OnCalendar case.

## Risks

- **Cheap-model rubber-stamping:** mitigated by ordering — the LLM only sees PRs that already passed the deterministic gates, and its rejection is honored while its approval is necessary-but-not-sufficient.
- **Self-modification:** a drain PR editing the reviewer/drain/CI/budget is flagged and never auto-merged; a human (or an interactive CTO session) must merge those.
- **Race with a running drain worker:** merges are remote-only; the queue-completion commit requires an idle clean `main` and otherwise defers to the next run's reconcile pass.
