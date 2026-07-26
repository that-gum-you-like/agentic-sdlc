# Spec: drain-multi-project

**Date**: 2026-07-20
**Status**: specs
**Capability**: MODIFIED (`autonomous-drain`)

---

## Overview

The autonomous drain runner targets any SDLC-bootstrapped project, not only the framework repo — resolving framework scripts independently of the drain target, detecting the base branch rather than assuming `main`, and reporting gate failures as failures instead of as an empty queue.

---

### REQ-005: Framework Location Independent of Drain Target

**Statement:** The runner shall locate framework scripts and the drain prompt independently of which project it is draining.

**Acceptance Criteria:**
- [ ] `SCRIPTS_DIR` derives from the drain script's own location, correct regardless of `SDLC_REPO` and of the caller's working directory
- [ ] The cost gate invokes `queue-drainer.mjs` from `SCRIPTS_DIR`, passing the drain target via `--project-dir`, rather than as a path relative to the target repo
- [ ] Draining a project whose `agents/` holds only project config (no framework `.mjs` scripts) succeeds
- [ ] The drain prompt resolves as: `SDLC_DRAIN_PROMPT` → the target project's `agents/drain-prompt.md` if present → the framework's `agents/drain-prompt.md`
- [ ] `SDLC_REPO` continues to default to the framework repo, so the installed timer's behavior is unchanged

**Complexity:** M · **Value:** High

---

### REQ-006: Gate Failures Are Never Reported As An Empty Queue

**Statement:** The cost gate shall distinguish a failing status command from a status command reporting zero ready tasks.

**Acceptance Criteria:**
- [ ] The status command's stderr is captured rather than discarded, and is printed when it fails
- [ ] A non-zero exit from the status command causes the run to log the failure and exit non-zero — never to log "no ready tasks"
- [ ] Output from which no ready count can be parsed is treated as an error, not as zero
- [ ] Only a successfully parsed count of zero produces the "no ready tasks — skip (no LLM call)" path
- [ ] A regression test asserts both the non-zero exit **and** the absence of the misleading "no ready tasks" message when the status command fails

**Complexity:** S · **Value:** High

---

### REQ-007: Base Branch Detected, Not Assumed

**Statement:** The runner shall determine the drain target's base branch rather than hardcoding `main`.

**Acceptance Criteria:**
- [ ] The base branch is read from the clone's `origin/HEAD`
- [ ] `SDLC_BASE_BRANCH` overrides detection; `main` remains only as a last-resort fallback
- [ ] Clone checkout and reset use the resolved base branch, so a `master`-default project clones and drains successfully
- [ ] A clone lacking `origin/HEAD` has it refreshed before falling back
- [ ] The resolved base branch is passed to the drain prompt, so the agent branches off the correct base rather than a prose-hardcoded `main`

**Complexity:** M · **Value:** High

---

### REQ-008: Per-Project Drain State, Shared Autonomy Mutex

**Statement:** Drain working state shall be per-project while the autonomy mutex remains host-global.

**Acceptance Criteria:**
- [ ] The dedicated clone path derives from the drain target's name, so two projects do not share a clone
- [ ] Drain logs are written under the drain target's `pm/drain-logs/`
- [ ] The single-flight mutex remains shared across all projects and with `pr-auto-review` — one autonomous job at a time per host, bounding cost
- [ ] The open-PR back-pressure cap and the `FIX-*` bypass are evaluated against the drain target's remote
- [ ] The safe-autonomy contract of `REQ-003` is unchanged: one task per run, branch + PR, never merge, main never touched

**Complexity:** S · **Value:** Medium
