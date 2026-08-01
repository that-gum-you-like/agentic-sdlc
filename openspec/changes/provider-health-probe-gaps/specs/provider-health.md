# Spec: provider-health

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: specs

---

## Overview

Covers the provider health-check subsystem in `agents/model-manager.mjs`: how a
provider's reachability is probed, how the result is classified, and which
classifications are permitted to swap an agent's model or send a `highSeverityFailure`
notification. Implements the design's three edits — the OpenRouter probe, env-file key
resolution, and the `unmonitored` status — plus the state reset and guard test.

The governing principle: **a health check may only report what it actually measured.**
Absence of a probe is not evidence of an outage.

---

## Requirements

### REQ-001: OpenRouter health probe

**Statement:** The system shall probe OpenRouter reachability via an authenticated
`GET` to `https://openrouter.ai/api/v1/auth/key`, classifying the provider `up` on
HTTP `200`.

**Acceptance Criteria:**
- [ ] `HEALTH_ENDPOINTS.openrouter` exists with `method: 'GET'`, `url` ending
      `/api/v1/auth/key`, and `keyEnv: 'OPENROUTER_API_KEY'`
- [ ] `headers(key)` produces `{ Authorization: 'Bearer <key>' }`
- [ ] The probe sends no request body and no model id
- [ ] With a valid key, `pingProvider('openrouter')` resolves `{ up: true }` with a
      numeric `latencyMs`
- [ ] Edge case: with an invalid or revoked key the endpoint returns `401`, which is not
      in the up-set (`200`/`429`/`402`/`403`), so the result is `up: false` — a real
      credential failure still latches `down` after 2 sweeps

**Dependencies:** None

**Complexity:** S

**Value:** CRITICAL

**Notes:** `/auth/key` is chosen over a chat-completion probe so the check spends zero
model tokens and does not break when a pinned model id is retired. Verified 2026-08-01:
`200` with the live key, `401` without.

---

### REQ-002: Provider key resolution from the Hermes profile

**Statement:** The system shall resolve a provider's API key from `process.env` first
and, when absent and the endpoint declares `envFile`, from the first declared `.env`
path that contains the variable.

**Acceptance Criteria:**
- [ ] `resolveProviderKey(ep)` returns `process.env[ep.keyEnv]` when it is set and
      non-empty, without reading any file
- [ ] When unset, each path from `ep.envFile()` is tried in order for a
      `^<keyEnv>=(.+)$` match; surrounding quotes and whitespace are stripped
- [ ] `HEALTH_ENDPOINTS.openrouter.envFile()` yields, in order:
      `$HERMES_DRAIN_HOME/.env` (when set), `~/.hermes-drain/.env`, `~/.hermes/.env`
- [ ] A resolved key is cached into `process.env[ep.keyEnv]` for the remainder of the run
- [ ] Edge case: a missing or unreadable `.env` path is skipped without throwing
- [ ] Edge case: when no path yields the key, the existing `notConfigured` result is
      returned unchanged — never a failure
- [ ] Endpoints without an `envFile` field behave exactly as before

**Dependencies:** None

**Complexity:** S

**Value:** HIGH

**Notes:** Mirrors `ensureOpenRouterKey()` at `agents/pr-auto-review.mjs:160-169`.
Required because the systemd scheduler does not carry `OPENROUTER_API_KEY` in its
environment; without it REQ-001 would report a permanent false `not-configured`.

---

### REQ-003: Unprobeable providers are `unmonitored`, never `down`

**Statement:** The system shall classify a provider with no `HEALTH_ENDPOINTS` entry as
`unmonitored`, and shall never let that classification latch `down`, swap an agent's
model, or send a `highSeverityFailure` notification.

**Acceptance Criteria:**
- [ ] `pingProvider(p)` for unknown `p` resolves
      `{ up: null, unmonitored: true, error: 'no health endpoint configured' }`
- [ ] `pingProvider` never returns `up: false` for an unknown provider
- [ ] `checkAllProviderHealth()` records `{ status: 'unmonitored', consecutiveFailures: 0 }`
- [ ] `consecutiveFailures` stays `0` across repeated sweeps — the status cannot latch
      `down` no matter how many times it is observed
- [ ] A `⚠️` console line names the provider as a framework configuration gap
- [ ] A `provider-unmonitored` event is appended to the ledger
- [ ] No `highSeverityFailure` notification is sent for an `unmonitored` provider
- [ ] Edge case: an `unmonitored` provider remains an eligible fallback rung, since
      `findHealthyFallback()` tests `status !== 'down'` — an unprobed rung is not a
      known-bad rung

**Dependencies:** None

**Complexity:** S

**Value:** CRITICAL

**Notes:** This is the systemic fix. The prior `{ up: false, error: 'unknown provider' }`
made a framework config gap indistinguishable from a provider outage, and no
provider-side recovery could ever clear it — the failure class named in
`egress-preflight` REQ-006.

---

### REQ-004: Poisoned OpenRouter health state is cleared

**Statement:** The system shall carry no pre-existing `down` latch for OpenRouter, so
that the first sweep after this change reports a freshly measured status.

**Acceptance Criteria:**
- [ ] `providerHealth.openrouter` is absent from `agents/model-intel.json` at the time
      the fix lands
- [ ] After one `node agents/model-manager.mjs check`, the key exists with
      `status: 'up'` and `consecutiveFailures: 0`
- [ ] Other `providerHealth` entries (`groq`, `gemini`, `cerebras`) are unmodified
- [ ] Edge case: a missing key is read as `{ status: 'unknown', consecutiveFailures: 0 }`
      by `checkAllProviderHealth()`, so no migration code is needed

**Dependencies:** REQ-001, REQ-002

**Complexity:** S

**Value:** HIGH

**Notes:** Deleting rather than hand-writing `status: 'up'` — writing a health result no
probe produced would repeat the error this change exists to fix.

---

### REQ-005: Health-endpoint coverage is enforced by tests

**Statement:** The system shall fail its test suite when any provider referenced by
`agents/budget.json` has no corresponding `HEALTH_ENDPOINTS` entry.

**Acceptance Criteria:**
- [ ] A test derives the provider set the same way `checkAllProviderHealth()` does:
      each agent's `provider`, plus the provider of every model in every `fallbackChain`
- [ ] The test asserts a `HEALTH_ENDPOINTS` entry exists for each, naming the missing
      provider in the failure message
- [ ] The test fails if `HEALTH_ENDPOINTS.openrouter` is removed
- [ ] A separate test asserts an unknown provider yields `unmonitored`, never `up: false`
- [ ] Both run under the `project.json` `testCmd`
      (`node tests/adapter-and-model-manager.test.mjs`)
- [ ] Edge case: the guard reads `budget.json` at runtime, so a provider added later is
      covered without editing the test

**Dependencies:** REQ-001, REQ-003

**Complexity:** S

**Value:** HIGH

**Notes:** The absence of this guard is why the gap shipped with `openrouter-provider`
and went unnoticed for 27 days and 7,204 false alerts.

---

## Acceptance Criteria (Scenarios)

---

### Scenario 1: Healthy OpenRouter reports up

**Verifies:** REQ-001, REQ-002

**WHEN** `node agents/model-manager.mjs check` runs with a valid key in `~/.hermes/.env`
and `OPENROUTER_API_KEY` absent from the environment

**THEN** `providerHealth.openrouter.status` is `up` with a numeric `latencyMs` and
`consecutiveFailures: 0`

**AND** no `all-fallbacks-down` event is appended and no CRITICAL notification is sent

---

### Scenario 2: Agents are restored to real models

**Verifies:** REQ-001, REQ-004

**WHEN** the health sweep runs after the fix

**THEN** `sdlc-developer`, `jony-aive`, `sdlc-reviewer` and `sdlc-documentarian` each
have an `activeModel` that is either unset (falling through to their configured `model`)
or a real model id — never `budget-exhausted`

**AND** no `provider-down-swap` event is recorded, because no provider is down

---

### Scenario 3: Unknown provider does not page

**Verifies:** REQ-003

**WHEN** `checkAllProviderHealth()` encounters a provider with no `HEALTH_ENDPOINTS`
entry, on this sweep and every subsequent one

**THEN** its status is `unmonitored` with `consecutiveFailures` pinned at `0`, and a
`⚠️` line plus a `provider-unmonitored` ledger event record the configuration gap

**AND** no agent is swapped and no `highSeverityFailure` notification is sent, however
many sweeps observe it

---

### Scenario 4: Error Case — real OpenRouter outage still pages

**Verifies:** REQ-001, REQ-003

**WHEN** the OpenRouter probe returns a non-up status (e.g. `401` from a revoked key, a
`5xx`, or a timeout) on two consecutive sweeps

**THEN** `providerHealth.openrouter.status` latches `down` and Phase 3 sends the
existing CRITICAL "no healthy fallback" notification

**AND** the `unmonitored` path is not taken — a measured failure is still a failure, and
alerting on genuine outages is fully preserved

---

### Scenario 5: Edge Case — key absent everywhere

**Verifies:** REQ-002

**WHEN** `OPENROUTER_API_KEY` is in neither the environment nor any `envFile()` path

**THEN** the status is `not-configured` with `consecutiveFailures: 0`

**AND** no swap, no page, and no `down` latch — identical to the existing behaviour for
unconfigured `gemini` and `cerebras`

---

## Invariants

- A provider is only reported `down` on the basis of an actual probe response or a
  genuine transport error — never on the absence of a probe definition
- A health status that no provider-side recovery could ever clear must never trigger a
  `highSeverityFailure` notification
- The health probe spends zero model tokens and references no model id
- `notConfigured` and `unmonitored` never increment `consecutiveFailures`
- Providers with no `envFile` field resolve keys exactly as before this change
- Real outage detection and alerting are preserved in full; this change removes false
  positives only

---

## Out of Scope

- Cross-provider fallback rungs for agent chains (backlogged)
- Removal of the `openai` `HEALTH_ENDPOINTS` entry (task H-002)
- Notification throttling behaviour in `agents/notify.mjs`
- Pruning historical ledger rows
- Per-model liveness probing

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/adapter-and-model-manager.test.mjs` | `openrouter health endpoint is defined and probes /auth/key` |
| Scenario 2 | manual / T-402 | post-fix `budget.json` `activeModel` inspection |
| Scenario 3 | `tests/adapter-and-model-manager.test.mjs` | `unknown provider yields unmonitored, never down` |
| Scenario 4 | manual / T-403 | invalid-key negative control |
| Scenario 5 | `tests/adapter-and-model-manager.test.mjs` | `resolveProviderKey prefers env over env file` |
| REQ-005 guard | `tests/adapter-and-model-manager.test.mjs` | `every budget.json provider has a health endpoint` |

---

## Next Step

Proceed to tasks phase.
