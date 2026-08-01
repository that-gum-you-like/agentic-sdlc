# Tasks: cross-provider-fallback-rungs

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: tasks

---

## Overview

Make an OpenRouter outage survivable: give the scheduler a usable `GROQ_API_KEY`, then
append `llama-3.3-70b-versatile` as the final rung of all four agents' fallback chains.
Per design.md and `specs/fallback-resilience.md` (REQ-001..REQ-004). Closes BACKLOG #28.

---

## Prerequisites

- [x] Design is approved
- [x] Specs are written and reviewed
- [x] Confirmed all 15 rungs across 4 agents are `provider: openrouter`
- [x] Confirmed the scheduler journal reports `⚪ groq: not configured` on every tick
      while an interactive run reports `🟢 groq: up`
- [x] Confirmed `llama-3.3-70b-versatile` has a complete `model-intel.json` entry
- [x] `provider-health-probe-gaps` merged — outage detection is truthful, so a fallback
      is now meaningful

---

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Key visibility | sdlc-developer | T-101 | — |
| Chain extension | sdlc-developer | T-102 | **blocked-by T-101** |
| Tests | sdlc-developer | T-201, T-202 | blocked-by T-102 |
| Verify | sdlc-documentarian | T-301..T-303 | blocked-by T-201 |

---

## Implementation Tasks

### Phase 1: Key visibility (must land first)

- [x] **T-101**: Append `GROQ_API_KEY` to `~/.hermes/.env`, copying the value from
      `~/.bashrc`. Preserve mode `0600`. Leave `~/.bashrc` untouched.
  - Files: `~/.hermes/.env` (outside the repo)
  - Spec: REQ-001
  - Agent: sdlc-developer
  - Complexity: S
  - Notes: **Never print the key value.** Never stage it — it lives outside the repo, but
    confirm with `git status` before committing.

### Phase 2: Chain extension

- [x] **T-102**: Append `llama-3.3-70b-versatile` as the **last** rung of
      `fallbackChain` for `sdlc-developer`, `jony-aive`, `sdlc-reviewer` and
      `sdlc-documentarian`. Change nothing else.
  - Files: `agents/budget.json`
  - Spec: REQ-002, REQ-003
  - Agent: sdlc-developer
  - Parallel: **blocked-by T-101** — see design "Ordering constraint"
  - Complexity: S
  - Notes: Last position is a correctness requirement. `findHealthyFallback()` returns the
    first non-`down` rung after the current model, so any earlier placement diverts healthy
    traffic to a 3/5 model. Do not touch `model`, `provider`, or `modelPreferences`.

### Phase 3: Tests

- [x] **T-201**: Guard test — every agent has ≥1 rung whose provider differs from its
      primary, naming the offending agent on failure. Derive providers from
      `model-intel.json`; do not hardcode `groq`.
  - Files: `tests/adapter-and-model-manager.test.mjs`
  - Covers: REQ-002, REQ-004
  - Agent: sdlc-developer
  - Complexity: S

- [x] **T-202**: Guard test — every rung in every chain resolves to a known
      `model-intel.json` entry, naming the agent and model on failure
  - Files: `tests/adapter-and-model-manager.test.mjs`
  - Covers: REQ-004
  - Agent: sdlc-developer
  - Complexity: S

- [x] **T-203**: Run the full suite and confirm no regressions
  - Command: `cd ~/agentic-sdlc && npm test`
  - Expected: all passing

### Phase 4: Verification

- [x] **T-301**: Trigger `sdlc-sched-model-manager-check.service` and confirm from the
      **journal** that it reports `🟢 groq: up`
  - Spec: Scenario 1
  - Agent: sdlc-documentarian
  - Notes: Journal only. An interactive run is exactly what hid this problem — my shell
    has the key, the scheduler did not.

- [x] **T-302**: Confirm `model-manager.mjs check` performs no swap while OpenRouter is
      healthy, and that each agent keeps its configured model
  - Spec: Scenario 3, REQ-003
  - Agent: sdlc-documentarian

- [x] **T-303**: Confirm no secret is staged (`git status`, `git diff --cached`)
  - Spec: REQ-001
  - Agent: sdlc-documentarian

---

## Completion Criteria

- [x] All implementation tasks are checked off
- [x] All tests pass (`npm test`)
- [x] Scheduler journal reports `groq: up`
- [x] No swap occurs while OpenRouter is healthy
- [x] No secret staged or committed
- [x] BACKLOG #28 marked promoted
- [ ] Change is committed and pushed to `~/agentic-sdlc`

---

## Notes

- T-101 **must** precede T-102. An unkeyed Groq rung is `not-configured`, which does not
  latch `down`, so `findHealthyFallback()` would select it during an outage and fail at
  call time — converting a loud correct page into a silent mid-task failure.
- Gemini and Cerebras stay out: no keys on this host, so rungs for them would be the same
  false-assurance trap.
- This change does not suppress alerting. With both providers down, the existing
  `all-fallbacks-down` CRITICAL still fires — correctly.
