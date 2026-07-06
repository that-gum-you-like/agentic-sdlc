# Spec: auto-review-merge

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW

---

## Overview

An unattended pipeline reviews the autonomous drain's `agent/drain/*` PRs to the clean-checkout standard, merges the safe green ones, marks their queue tasks complete, and leaves everything else open with a reasoned comment — closing the queue → drain → PR → merge loop without a human.

---

### REQ-001: Hard Test Gate in a Clean Worktree

**Statement:** No PR shall merge unless `npm test` and `node agents/four-layer-validate.mjs` pass on the PR head in a freshly created temporary `git worktree`.

**Acceptance Criteria:**
- [ ] The branch head is checked out detached into a temp worktree (never the host tree) and both commands run there with bounded timeouts
- [ ] Any non-zero exit ⇒ no merge; the failing output tail is posted as a PR comment and the PR stays open
- [ ] The worktree is removed after the verdict, pass or fail
- [ ] No configuration flag can skip this gate

**Dependencies:** hermetic test suite (H-001 / PR #7, merged)
**Complexity:** M · **Value:** High

---

### REQ-002: Deterministic Scope & Safety Scan

**Statement:** The pipeline shall hard-reject unsafe diffs and shall flag — never auto-merge — diffs that touch its own guardrail surface.

**Acceptance Criteria:**
- [ ] Hard-reject: `.env`/`.env.*`, secret/credential/key-material paths (`*.pem`, `id_rsa*`, `credentials*`, `secrets*`), `.github` paths containing `deploy`, and any path escaping the repo (`../` or absolute)
- [ ] Flag (leave open for a human/CTO session): `agents/hermes-drain.sh`, `agents/drain-prompt.md`, `agents/pr-auto-review.mjs`, `.github/workflows/*`, `agents/budget.json`, `agents/templates/cron-schedule.json.template`, `agents/scheduler-install.mjs`, `tests/pr-auto-review.test.mjs`, `tests/hermes-drain.test.mjs`
- [ ] The scan is pure and unit-tested; it runs before any LLM call
- [ ] A flagged or rejected PR is never merged by this pipeline in the same or any later run while the condition holds

**Dependencies:** none
**Complexity:** S · **Value:** High

---

### REQ-003: LLM Review via OpenRouter (No OpenAI)

**Statement:** PRs that pass REQ-001 and REQ-002 shall receive an LLM review scoring the diff against the task description and a safety checklist, returning approve/reject with reasons.

**Acceptance Criteria:**
- [ ] Uses `loadLlmAdapter(config, 'openrouter')` with an affordable, capable model (default `deepseek/deepseek-chat-v3.1`) passed via `{ model }`
- [ ] Prompt includes the queue task (when found), PR title/body, the diff (truncated to a bounded size), and an explicit safety checklist
- [ ] Response must parse to strict JSON `{"verdict","reasons"}`; parse failures and adapter errors are treated as *not approved* (soft fail), never as approval
- [ ] LLM approval is necessary but not sufficient; LLM output can never bypass REQ-001/REQ-002
- [ ] `OPENROUTER_API_KEY` resolves from the environment or (read-only) from the drain profile's `.env`

**Dependencies:** REQ-001, REQ-002, `openrouter` adapter
**Complexity:** M · **Value:** High

---

### REQ-004: Merge, Complete, Log — with Back-Pressure

**Statement:** Fully passing PRs shall be squash-merged with branch deletion, their queue task marked complete, and every decision logged; failing PRs shall be commented, not closed.

**Acceptance Criteria:**
- [ ] Merge via `gh pr merge --squash --delete-branch`; at most `MAX_AUTO_MERGES` (default 3) merges per run
- [ ] After merge, `tasks/queue/<task-id>.json` is marked complete and pushed from a clean idle `main`; a reconcile pass at run start self-heals any merged-but-still-pending task
- [ ] Soft failures post one review comment per head SHA (embedded `<!-- pr-auto-review sha:... -->` marker prevents spam and re-billing); PRs are never auto-closed
- [ ] One JSON line per decision appended to `pm/pr-auto-review.log`
- [ ] Single-flight `pm/.pr-auto-review.lock.d` mkdir-lock (stale 2h)

**Dependencies:** REQ-001–REQ-003, queue-drainer
**Complexity:** M · **Value:** High

---

### REQ-005: Scheduled Activation with Working Tool Resolution

**Statement:** The pipeline shall run from a systemd user timer offset from the drain, and scheduled units shall be able to resolve `node`, `gh`, and `hermes`.

**Acceptance Criteria:**
- [ ] `cron-schedule.json.template` includes `pr-auto-review` at `7,27,47 * * * *`; `cronToOnCalendar` renders comma lists to valid `OnCalendar` (test-pinned)
- [ ] `scheduler-install.mjs install` renders `sdlc-sched-pr-auto-review.{service,timer}` with absolute `ExecStart`
- [ ] `buildUnits` renders unit `PATH` including node's bin dir, the installer-resolved `gh` directory, and `~/.local/bin` — fixing the observed rc=127 `hermes: No such file or directory` on timer-run drains
- [ ] Removable via `scheduler-install.mjs uninstall`

**Dependencies:** scheduler-daemon change (merged)
**Complexity:** S · **Value:** High
