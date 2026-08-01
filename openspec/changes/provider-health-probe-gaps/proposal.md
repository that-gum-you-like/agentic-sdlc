# Proposal: provider-health-probe-gaps

**Date**: 2026-08-01
**Author**: Claude (CTO agent), reported by Bryce
**Status**: proposed

---

## Problem

Hermes repeatedly sends Bryce a Telegram alert reading:

> CRITICAL: Provider openrouter is DOWN and sdlc-developer has no healthy fallback. Agent is fully blocked.

**The alert is false.** OpenRouter is up and the account key is valid. Verified 2026-08-01:

- `GET https://openrouter.ai/api/v1/models` → `200` in 0.13s
- `GET https://openrouter.ai/api/v1/auth/key` with the key from `~/.hermes/.env` → `200`
- `POST https://openrouter.ai/api/v1/chat/completions` (`qwen/qwen3-coder`, 1 token) → `200`

The root cause is a gap in the framework, not an outage. `HEALTH_ENDPOINTS` in
`agents/model-manager.mjs:98-134` defines probes for `anthropic`, `openai`, `groq`,
`gemini` and `cerebras` — but **not `openrouter`**, even though the
`openrouter-provider` change (2026-07-05) made OpenRouter the `defaultProvider` and
moved all four agents onto it. `pingProvider()` handles an unrecognised provider with
`return { up: false, error: 'unknown provider' }` (line 144), which is indistinguishable
from a real outage. Two consecutive "failures" then latch the provider to `down`.

The blast radius is total, because every configured agent is on OpenRouter and every
rung of every `fallbackChain` is also an OpenRouter model. `findHealthyFallback()`
therefore returns `null` for all of them, so each run takes the `else` branch at
`model-manager.mjs:382-388`: sets `activeModel = 'budget-exhausted'` and fires a
`highSeverityFailure` notification.

Current damage:

- `agents/model-intel.json` → `providerHealth.openrouter` = `{ status: "down",
  consecutiveFailures: 255, error: "unknown provider" }`
- `pm/model-performance.jsonl` → **7,204** `all-fallbacks-down` events and 1,851
  `provider-down` events
- All four agents (`sdlc-developer`, `jony-aive`, `sdlc-reviewer`,
  `sdlc-documentarian`) have `activeModel` set to `budget-exhausted` in memory on every
  tick. This did **not** persist: `saveBudget()` in Phase 3 runs only when
  `swapCount > 0`, and `swapCount` is always 0 here because no healthy fallback is ever
  found. Confirmed — `git log -S'budget-exhausted' -- agents/budget.json` on the tracked
  file returns nothing, and `activeModel` is unset for all four agents today.
- Bryce is paged on a healthy system, which trains him to ignore the channel
- Real OpenRouter outages are **undetectable**: the provider has been latched `down` on
  a constant, un-clearable error since 2026-07-05, so a genuine outage would change
  nothing observable. This is the most serious consequence — the alert is not merely
  noisy, the monitoring is blind.

This is the same failure class as `egress-preflight` REQ-006: **a health check whose
own failure mode can never be cleared by the remedy it recommends.** No amount of
OpenRouter recovery clears `error: "unknown provider"`.

---

## Discovery

- **Files examined**:
  - `agents/model-manager.mjs:98-134` — `HEALTH_ENDPOINTS`, no `openrouter` key
  - `agents/model-manager.mjs:142-172` — `pingProvider()`, `'unknown provider'` → `up: false`
  - `agents/model-manager.mjs:178-243` — `checkAllProviderHealth()`, latches `down` at 2 failures
  - `agents/model-manager.mjs:247-262` — `findHealthyFallback()`, skips `status === 'down'`
  - `agents/model-manager.mjs:356-395` — Phase 3 provider-down swaps, fires the CRITICAL alert
  - `agents/pr-auto-review.mjs:160-169` — `ensureOpenRouterKey()`, the existing env-file key-load pattern
  - `agents/adapters/llm/openrouter.mjs:32-33` — adapter reads `process.env.OPENROUTER_API_KEY`
  - `agents/budget.json` — all 4 agents `provider: openrouter`, all-OpenRouter fallback chains
  - `agents/model-intel.json` — poisoned `providerHealth` state
  - `openspec/changes/openrouter-provider/tasks.md` — T-101..T-108; no health-endpoint task
- **Existing patterns**:
  - Every `HEALTH_ENDPOINTS` entry is `{ url, method, headers, body, keyEnv }` with an
    optional `urlSuffix(key)`; `gemini` already uses `urlSuffix` for query-param auth
  - `pingProvider()` already treats `429` as up-but-busy and `402`/`403` as
    up-with-account-issue — reachability is deliberately separated from entitlement
  - `notConfigured` (missing key) is already a first-class non-failure status that does
    not latch `down` or trigger swaps — the precedent for "unknown ≠ down"
  - `agents/pr-auto-review.mjs` already reads `OPENROUTER_API_KEY` out of a Hermes
    profile `.env` when the variable is absent from the environment
- **Existing tests**: `tests/adapter-and-model-manager.test.mjs` (the `project.json`
  `testCmd`) covers the adapter surface and model-manager basics; line 130 asserts
  `openrouter checkAvailability reflects OPENROUTER_API_KEY`. It has **no** coverage of
  `HEALTH_ENDPOINTS` completeness or of the unknown-provider branch — which is why this
  shipped.
- **Key findings**:
  1. The `openrouter-provider` change wired the adapter, `budget.json`, `model-intel.json`,
     `project.json` and Hermes config, but never `HEALTH_ENDPOINTS`. A pure omission.
  2. `model-manager.mjs` reads only `process.env[keyEnv]`. It never loads
     `~/.hermes/.env`, so under the systemd scheduler the key is absent from the
     environment. Adding the endpoint alone would flip the false `down` to a false
     `not-configured` — quieter, but still wrong, and it would leave real outages undetected.
  3. `'unknown provider'` returning `up: false` is the systemic defect. Any future
     provider added to `budget.json` without a matching `HEALTH_ENDPOINTS` entry
     reproduces this exact page-storm.

---

## Proposed Solution

Fix the specific gap and the class of gap it belongs to. Add an `openrouter` entry to
`HEALTH_ENDPOINTS` that probes the free, token-free `GET /api/v1/auth/key` endpoint.
Teach `pingProvider()` to resolve `OPENROUTER_API_KEY` from the Hermes profile `.env`
when it is absent from the process environment, reusing the `pr-auto-review.mjs`
pattern. Separately, stop conflating "the framework does not know how to probe this
provider" with "this provider is down": introduce an `unmonitored` status that is
logged loudly at config level but never latches `down`, never triggers a
provider-down swap, and never fires a `highSeverityFailure` page. Finally, clear the
poisoned `providerHealth.openrouter` state and add a guard test that fails whenever a
provider referenced by `budget.json` has no health endpoint.

---

## Value Analysis

### Benefits

- Stops a recurring false CRITICAL page to Bryce's Telegram on a fully healthy system
- Restores *real* OpenRouter outage detection, which has been impossible since the
  provider was latched `down` on a constant, un-clearable error — the highest-value
  benefit, since the system is currently blind to the failure it claims to be reporting
- Removes the per-tick in-memory `budget-exhausted` assignment, closing a latent trap:
  it never persisted only because `swapCount` happened to be 0: any later `saveBudget()`
  in the same run would have written it and genuinely blocked all four agents
- Ends the ledger flood — 7,204 junk events are actively burying real signal in
  `pm/model-performance.jsonl`
- The guard test makes this class of omission impossible to ship again: adding a
  provider to `budget.json` without a probe now fails `npm test`
- `unmonitored` closes the whole family of "unknown probe latches down" bugs, not just
  the OpenRouter instance

### Costs

- **Effort**: S — one endpoint entry, one key-resolution helper, one status branch, one
  state reset, two tests
- **Risk**: Low. The change makes the health checker *less* trigger-happy, so the
  failure mode of a mistake is a missed alert rather than a false one. Mitigated by
  keeping `unmonitored` loud in console output and in the ledger, and by the guard test
  which turns a silent gap into a red build.
- **Dependencies**: `OPENROUTER_API_KEY` in `~/.hermes/.env` (confirmed present and
  valid). No new npm packages — the framework's zero-dependency rule holds.

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Add the `openrouter` endpoint only | Fixes this instance, leaves the systemic `'unknown provider' → down` trap for the next provider. Also still reports `not-configured` under systemd, where the key is not in the environment. |
| Probe with a 1-token chat completion, matching the other providers | Spends tokens on every scheduler tick across 16 timers, and couples provider liveness to one model id staying available. `/auth/key` is free, model-agnostic, and returns `200` only when the key is genuinely valid. |
| Give each agent a cross-provider fallback chain (e.g. a Groq rung) | Worth doing on its merits, but it is resilience work, not a fix — it would have masked this false alarm by silently downgrading every agent to a fallback model during a non-existent outage. Routed to `openspec/BACKLOG.md`. |
| Raise the `down` threshold above 2 failures | Only delays a permanent false positive; 255 consecutive failures would still latch. |
| Suppress/mute the `highSeverityFailure` trigger | Silences a real alerting channel to hide a bug. Directly against the "no silent caps" principle. |
| Do nothing | Bryce keeps getting paged on a healthy system, real OpenRouter outages remain undetectable, and the unpersisted `budget-exhausted` assignment stays one code path away from actually blocking all four agents. |

### Decision

**Yes.** A monitoring system that pages on a healthy provider and cannot detect a real
outage is worse than no monitoring. Effort is small, risk is low, and the guard test
converts a recurring class of defect into a build failure.

---

## Scope

### In Scope

- `openrouter` entry in `HEALTH_ENDPOINTS` using `GET /api/v1/auth/key`
- Env-file fallback for `OPENROUTER_API_KEY` resolution inside `model-manager.mjs`
- New `unmonitored` health status replacing `up: false` for unknown providers, excluded
  from `down` latching, swaps, and `highSeverityFailure` notifications
- One-time reset of the poisoned `providerHealth.openrouter` state in `model-intel.json`
- Guard test: every provider referenced in `budget.json` has a `HEALTH_ENDPOINTS` entry
- Regression test: an unknown provider yields `unmonitored`, never `down`

### Out of Scope

- Adding cross-provider (Groq/Gemini) rungs to agent fallback chains — backlogged
- Removing the `openai` entry from `HEALTH_ENDPOINTS` — owned by queued task **H-002**
- Pruning the 7,204 junk ledger rows — append-only ledger; historical rows stay
- Changing notification throttling in `agents/notify.mjs`
- Any change to Hermes' own `~/.hermes/config.yaml` fallback ladder

---

## Next Step

If approved: proceed to design phase.
