# Tasks: provider-health-probe-gaps

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: tasks

---

## Overview

Stop the false "OpenRouter is DOWN / no healthy fallback" Telegram pages by adding the
missing OpenRouter health probe, resolving its key from the Hermes profile `.env`, and
separating "cannot probe this provider" from "this provider is down". Clear the poisoned
health state and add guard tests so the gap cannot reship. Per design.md and
`specs/provider-health.md` (REQ-001..REQ-005).

---

## Prerequisites

- [x] Design is approved
- [x] Specs are written and reviewed
- [x] OpenRouter confirmed reachable (`/models` → 200) and key valid
      (`/auth/key` → 200, `chat/completions` → 200) as of 2026-08-01
- [x] Root cause confirmed: `providerHealth.openrouter.error === 'unknown provider'`,
      `consecutiveFailures: 255`, 7,204 `all-fallbacks-down` ledger events

---

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Probe + key resolution | sdlc-developer | T-101, T-102 | — |
| Unmonitored status | sdlc-developer | T-201 | blocked-by T-102 |
| State reset | sdlc-developer | T-202 | T-201 |
| Tests | sdlc-developer | T-301..T-303 | blocked-by Phase 1, 2 |
| Verify + document | sdlc-documentarian | T-401..T-404, T-501, T-502 | blocked-by Phase 3 |

---

## Implementation Tasks

### Phase 1: Probe and key resolution

- [x] **T-101**: Add the `openrouter` entry to `HEALTH_ENDPOINTS` — `GET`
      `https://openrouter.ai/api/v1/auth/key`, `Authorization: Bearer <key>`, no body,
      `keyEnv: 'OPENROUTER_API_KEY'`, `envFile()` returning `$HERMES_DRAIN_HOME/.env`,
      `~/.hermes-drain/.env`, `~/.hermes/.env` in order
  - Files: `agents/model-manager.mjs`
  - Spec: REQ-001
  - Agent: sdlc-developer
  - Parallel: no
  - Complexity: S
  - Notes: Add the `join`/`homedir` imports if not already present. Do NOT use a
    chat-completion probe — see design Decision 1.

- [x] **T-102**: Add `resolveProviderKey(ep)` and call it from `pingProvider()` in place
      of the direct `process.env[ep.keyEnv]` read. Env first; then each `ep.envFile()`
      path for `^<keyEnv>=(.+)$`, stripping quotes/whitespace; cache into `process.env`;
      skip missing files silently; return `null` → existing `notConfigured` path
  - Files: `agents/model-manager.mjs`
  - Spec: REQ-002
  - Agent: sdlc-developer
  - Parallel: blocked-by T-101
  - Complexity: S
  - Notes: Endpoints without `envFile` must behave bit-identically — preserve the
    env-first order exactly. Never log the key value.

### Phase 2: Unmonitored status and state reset

- [x] **T-201**: Replace `pingProvider`'s unknown-provider guard
      (`{ up: false, error: 'unknown provider' }`) with
      `{ up: null, unmonitored: true, error: 'no health endpoint configured', latencyMs: 0 }`.
      In `checkAllProviderHealth()`, handle `result.unmonitored` in a branch parallel to
      `notConfigured`: record `{ status: 'unmonitored', consecutiveFailures: 0 }`, print a
      `⚠️` config-gap line, append a `provider-unmonitored` ledger event
  - Files: `agents/model-manager.mjs`
  - Spec: REQ-003
  - Agent: sdlc-developer
  - Parallel: blocked-by T-102
  - Complexity: S
  - Notes: Phase 3 keys strictly off `status === 'down'`, so it needs no edit. Leave
    `findHealthyFallback()`'s `!== 'down'` test alone — unmonitored rungs stay eligible
    by design (REQ-003 edge case).

- [x] **T-202**: Delete the `providerHealth.openrouter` key from
      `agents/model-intel.json`, leaving `groq` / `gemini` / `cerebras` untouched
  - Files: `agents/model-intel.json`
  - Spec: REQ-004
  - Agent: sdlc-developer
  - Parallel: T-201
  - Complexity: S
  - Notes: Delete — do not hand-write `status: 'up'` (design Decision 4).

### Phase 3: Tests

- [x] **T-301**: Guard test — derive the provider set from `budget.json` the way
      `checkAllProviderHealth()` does (agent `provider` + every `fallbackChain` model's
      provider) and assert each has a `HEALTH_ENDPOINTS` entry, naming any missing
      provider in the failure message
  - Files: `tests/adapter-and-model-manager.test.mjs`
  - Covers: REQ-005
  - Agent: sdlc-developer
  - Parallel: blocked-by Phase 1, Phase 2
  - Complexity: S

- [x] **T-302**: Unit tests — `HEALTH_ENDPOINTS.openrouter` is `GET` on `/auth/key` with
      `keyEnv: 'OPENROUTER_API_KEY'`; an unknown provider yields `unmonitored: true` and
      never `up: false`; `resolveProviderKey()` prefers `process.env` over the env file
  - Files: `tests/adapter-and-model-manager.test.mjs`
  - Covers: REQ-001, REQ-002, REQ-003
  - Agent: sdlc-developer
  - Parallel: blocked-by Phase 1, Phase 2
  - Complexity: S
  - Notes: Keep these offline — assert on config shape and pure functions, no network.

- [x] **T-303**: Run the full suite and confirm no regressions
  - Command: `cd ~/agentic-sdlc && npm test`
  - Expected: all passing, including the pre-existing
    `openrouter checkAvailability reflects OPENROUTER_API_KEY` at line 130

### Phase 4: Live verification

- [x] **T-401**: Run `node agents/model-manager.mjs check` and confirm
      `providerHealth.openrouter` is `{ status: 'up', consecutiveFailures: 0 }` with a
      real `latencyMs`
  - Spec: REQ-001, REQ-004
  - Agent: sdlc-documentarian

- [x] **T-402**: Confirm all four agents in `budget.json` have a real `activeModel`, not
      `budget-exhausted`; confirm no new `all-fallbacks-down` rows in
      `pm/model-performance.jsonl` after the sweep
  - Spec: Scenario 2
  - Agent: sdlc-documentarian
  - Notes: Guards the design's highest-impact risk — fix lands but agents stay blocked.

- [x] **T-403**: Negative control — run one probe with a deliberately invalid key and
      confirm `401` → `degraded`, then `down` on a second sweep. Restore state afterwards
      (re-delete `providerHealth.openrouter` and re-run T-401)
  - Spec: Scenario 4
  - Agent: sdlc-documentarian
  - Notes: Proves the fix removes false positives without disabling real alerting. Do
    not skip — a check that can no longer fail is worse than the bug.

- [ ] **T-404**: Confirm with Bryce that the CRITICAL Telegram message stops on the next
      scheduler tick
  - Spec: Scenario 1
  - Agent: sdlc-documentarian
  - Notes: Human-in-the-loop; the originating report was a Telegram page, so Telegram
    silence is the real acceptance signal.

### Phase 5: Cleanup and documentation

- [x] **T-501**: Add a backlog entry for cross-provider fallback rungs (a Groq or Gemini
      rung per agent) so a real OpenRouter outage is survivable rather than total
  - Files: `openspec/BACKLOG.md`
  - Agent: sdlc-documentarian
  - Notes: Explicitly out of scope here — it is resilience work, and adding it now would
    have masked this false alarm rather than fixed it.

- [x] **T-502**: Update memory with the change summary
  - Files: `agents/memory/recent.json`, `agents/memory/medium-term.json`
  - Agent: sdlc-documentarian

---

## Completion Criteria

This change is complete when:

- [x] All implementation tasks are checked off (T-404 is human-in-the-loop — pending Bryce)
- [x] All tests pass (`npm test`)
- [x] No regressions in the existing suite
- [x] `providerHealth.openrouter.status === 'up'` from a live probe
- [x] All four agents off `budget-exhausted`
- [x] Negative control (T-403) confirms real outages still latch `down` and page
- [ ] Bryce confirms the false Telegram alerts have stopped
- [x] Memory is updated
- [x] Change is committed and pushed to `~/agentic-sdlc` (NOT `~/languageapp`) — branch `feature/provider-health-probe-gaps`, commit df8e193. NOT yet merged to `main`.

---

## Notes

- `~/agentic-sdlc` is its own repo. Framework changes and openspec artifacts never go
  into `~/languageapp`.
- Zero new npm dependencies — the framework's no-deps rule holds.
- Never print or commit the resolved key. `~/.hermes/.env` is read-only input here.
- The `openai` entry in `HEALTH_ENDPOINTS` violates the no-OpenAI default but is owned by
  queued task **H-002**. Leave it alone — do not expand scope.
- Root-cause lesson worth carrying: `openrouter-provider` changed the default provider
  across `budget.json`, `model-intel.json`, `project.json` and the adapter, but nothing
  checked that the health subsystem had kept up. T-301 is the durable fix for that class
  of omission.
