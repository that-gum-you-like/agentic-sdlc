# Specs — update-safety

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/sdlc-update.mjs`, `agents/templates/systemd/sdlc-update.service.template`, `agents/notify.mjs` reuse. Band 030-039.

Prefix `RS` (see `openspec/REQUIREMENT-PREFIXES.md`). Scenarios are Given/When/Then and transcribe directly into the named test files. Node stdlib only; no new dependency; no OpenAI.

---

## RS-REQ-030 — `sdlc-update` pulls only when the pull is safe

**Statement:** `sdlc-update.mjs` shall fetch, classify the tree, and fast-forward only when `git merge --ff-only` is guaranteed to succeed: clean tree, or dirty files disjoint from the incoming diff.

**Acceptance:** classification covers clean+behind, dirty-disjoint, dirty-overlap, ahead, wrong branch, mid-merge/rebase, fetch failure; the script never runs stash, reset, checkout, clean or chown (asserted by an injectable git runner recording argv); exit code is 0 unless the script crashes.

**Scenario:** GIVEN a clean tree 4 commits behind WHEN it runs THEN the tree fast-forwards and no notification is sent.
**Scenario:** GIVEN dirty `a.json` and incoming changes only to `b.json` WHEN it runs THEN it fast-forwards and `a.json` is untouched.
**Scenario:** GIVEN dirty `agents/x.mjs` and incoming changes to `agents/x.mjs` WHEN it runs THEN nothing is pulled and one alert names `agents/x.mjs`.

**Test:** `tests/sdlc-update.test.mjs` | **Complexity:** M | **Value:** CRITICAL | **Dependencies:** none

---

## RS-REQ-031 — Failures are announced once per cause

**Statement:** each non-pull outcome shall alert through `triggerNotificationOnce('sdlc-update:<cause>', ...)` with the cause and the specific paths or counts, at most once per dedupe window per cause.

**Acceptance:** the same cause twice inside the window sends one message; a different cause sends its own; messages state the next action in one line; a notifier failure never changes the exit code.

**Scenario:** GIVEN a dirty-overlap tick followed by another 6 h later WHEN both run THEN exactly one alert is sent.
**Scenario:** GIVEN the notifier throws WHEN it runs THEN the script still exits 0.

**Test:** `tests/sdlc-update.test.mjs` | **Complexity:** S | **Value:** HIGH | **Dependencies:** RS-REQ-030

---

## RS-REQ-032 — Drift is reported even when pulls are impossible

**Statement:** when `behind > 5` after the attempt and no pull happened, `sdlc-update.mjs` shall alert a `drift` cause with the commit count and oldest unpulled commit date.

**Acceptance:** threshold constant (default 5) is an overridable default, not a required setting; drift alert is deduped like any other cause.

**Scenario:** GIVEN 31 commits behind and an overlapping dirty file WHEN it runs THEN the alert reports 31 and the date.

**Test:** `tests/sdlc-update.test.mjs` | **Complexity:** S | **Value:** MEDIUM | **Dependencies:** RS-REQ-031

---

## RS-REQ-033 — The update unit is described by the repo

**Statement:** the repo shall ship `agents/templates/systemd/sdlc-update.service.template` whose `ExecStart` runs `sdlc-update.mjs`, and `docs/RUNBOOK.md` shall document installing it into `~/.config/systemd/user/`.

**Acceptance:** a test asserts the template invokes `sdlc-update.mjs` and does not contain `git pull`; `scheduler-install.mjs` still manages only `sdlc-sched-*` units.

**Scenario:** GIVEN the template WHEN parsed THEN `ExecStart` references `agents/sdlc-update.mjs`.

**Test:** `tests/sdlc-update.test.mjs` | **Complexity:** S | **Value:** MEDIUM | **Dependencies:** RS-REQ-030

---

## Invariants

- No automatic mutation of a human working tree other than a safe fast-forward.
- Success is silent; only exceptions notify.

## Out of Scope

- Auto-resolving conflicts; updating other projects' checkouts.
