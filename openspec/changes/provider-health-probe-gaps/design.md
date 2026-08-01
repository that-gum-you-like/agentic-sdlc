# Design: provider-health-probe-gaps

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: design

---

## Context

### Current State

`agents/model-manager.mjs` runs a provider health sweep on every scheduler tick
(`sdlc-sched-*` systemd user timers). The flow is:

1. `checkAllProviderHealth()` collects the provider set from `budget.json` — each
   agent's `provider` plus the provider of every model in its `fallbackChain` — then
   unconditionally adds `groq`, `gemini` and `cerebras` as universal free-tier fallbacks.
2. Each provider is passed to `pingProvider()`, which looks the provider up in the
   module-level `HEALTH_ENDPOINTS` map, reads its API key from `process.env[keyEnv]`,
   and issues one minimal request with a 10s timeout.
3. Results are folded into `intel.providerHealth` and persisted to `model-intel.json`.
   `up` resets `consecutiveFailures` to 0; a failure increments it and latches
   `status: 'down'` once it reaches 2. `notConfigured` (missing key) is a separate,
   benign status that never latches.
4. Phase 3 walks every agent. If its provider is `down`, `findHealthyFallback()` scans
   the rest of the chain for a model whose provider is not `down`. On a hit it swaps
   `activeModel` and sends a `highSeverityFailure`. On a miss it sets
   `activeModel = 'budget-exhausted'` and sends the CRITICAL "no healthy fallback" page.

`HEALTH_ENDPOINTS` currently covers `anthropic`, `openai`, `groq`, `gemini`, `cerebras`.
It does **not** cover `openrouter`, which the `openrouter-provider` change (2026-07-05)
made the framework's `defaultProvider` and the sole provider for all four agents.

`pingProvider()` opens with:

```js
const ep = HEALTH_ENDPOINTS[provider];
if (!ep) return { up: false, error: 'unknown provider', latencyMs: 0 };
```

So OpenRouter fails every sweep with a constant, un-clearable error, latches `down`,
and — because every rung of every fallback chain is also an OpenRouter model —
`findHealthyFallback()` returns `null` for all four agents, firing four CRITICAL pages
per tick. Observed state: `consecutiveFailures: 255`, 7,204 `all-fallbacks-down`
ledger events.

Note on blast radius: the `activeModel = 'budget-exhausted'` assignment on the miss path
never reached disk, because Phase 3's `saveBudget()` is gated on `swapCount > 0` and
`swapCount` is always 0 when no fallback is healthy (verified — `budget-exhausted` never
appears in the tracked `agents/budget.json` history). The durable damage is therefore
false paging plus blind outage detection, not stopped agents. That is luck, not design:
`saveBudget()` is also called later in the same run at lines ~554 and ~706, so a
different execution path would have persisted the block.

Two independent defects are in play:

- **D1 (instance)**: no `openrouter` entry in `HEALTH_ENDPOINTS`.
- **D2 (class)**: an unknown provider is reported as a *failure*. A framework
  configuration gap is rendered as a provider outage, and no provider-side recovery can
  ever clear it — the same trap `egress-preflight` REQ-006 called out.

A third issue surfaces once D1 is fixed: `model-manager.mjs` resolves keys purely from
`process.env`. Under the systemd scheduler `OPENROUTER_API_KEY` is not in the
environment — it lives in `~/.hermes/.env`. Fixing D1 alone would convert a false `down`
into a false `not-configured`: no longer a page, but OpenRouter outages would remain
permanently undetectable. `agents/pr-auto-review.mjs:160-169` already solved exactly
this with `ensureOpenRouterKey()`.

### Problem Restatement

Provider health checks must report OpenRouter's true reachability, and an unprobeable
provider must never be reported as a provider outage.

---

## Goals

- A healthy, correctly-keyed OpenRouter reports `status: 'up'` — verifiable by running
  `node agents/model-manager.mjs check` and reading the persisted `providerHealth`
- A genuinely unreachable OpenRouter still latches `down` after 2 sweeps, so real
  outages continue to page
- The probe costs zero model tokens and does not depend on any single model id
- A provider present in `budget.json` with no `HEALTH_ENDPOINTS` entry is reported as
  `unmonitored`: loud in console and ledger, but never latching `down`, never swapping
  an agent, never sending `highSeverityFailure`
- `providerHealth.openrouter` is cleared of its 255-failure latch
- `npm test` fails if a provider referenced by `budget.json` has no health endpoint

## Non-Goals

- Adding cross-provider rungs to agent fallback chains (backlogged)
- Removing the `openai` `HEALTH_ENDPOINTS` entry (task H-002 owns it)
- Rewriting notification throttling in `agents/notify.mjs`
- Rewriting or pruning historical ledger rows
- Any general-purpose `.env` loader for the framework — key resolution stays narrowly
  scoped to the providers that need it

---

## Design

### Overview

Three surgical edits to `agents/model-manager.mjs`, one state reset, two tests.

1. **Add the probe.** An `openrouter` entry in `HEALTH_ENDPOINTS` hitting
   `GET https://openrouter.ai/api/v1/auth/key`. Verified 2026-08-01 to return `200`
   with the live key and `401` with none. It is free, spends no model tokens, and is
   model-agnostic — unlike the chat-completion probes used for the other providers,
   which would burn tokens on every one of 16 timers and break whenever a pinned model
   id is retired.

2. **Resolve the key from the Hermes profile.** A `resolveProviderKey()` helper checks
   `process.env[keyEnv]` first, then falls back to reading the variable out of a known
   `.env` file for providers that declare an `envFile`. Only `openrouter` declares one,
   pointing at `$HERMES_DRAIN_HOME/.env` then `~/.hermes/.env` — mirroring
   `pr-auto-review.mjs`. The value is cached in `process.env` for the rest of the run.

3. **Separate "cannot probe" from "down".** `pingProvider()` returns
   `{ up: null, unmonitored: true, error: 'no health endpoint configured' }` for an
   unknown provider. `checkAllProviderHealth()` gains a branch — parallel to the
   existing `notConfigured` branch — that records `status: 'unmonitored'` with
   `consecutiveFailures: 0`, prints a `⚠️` config-gap line, and appends a
   `provider-unmonitored` ledger event. Because Phase 3 keys strictly off
   `status === 'down'`, `unmonitored` providers are inert to swaps and pages with no
   change to Phase 3 itself.

`findHealthyFallback()` already tests `status !== 'down'`, so `unmonitored` and
`not-configured` rungs stay eligible. That is correct: an unprobeable rung is not a
known-bad rung, and blocking on it would reintroduce the same false-negative.

### Components

#### OpenRouter health endpoint

**File(s)**: `agents/model-manager.mjs` (`HEALTH_ENDPOINTS`, ~line 98)

```js
openrouter: {
  url: 'https://openrouter.ai/api/v1/auth/key',
  method: 'GET',
  headers: (key) => ({ 'Authorization': `Bearer ${key}` }),
  body: undefined,
  keyEnv: 'OPENROUTER_API_KEY',
  envFile: () => [
    process.env.HERMES_DRAIN_HOME && join(process.env.HERMES_DRAIN_HOME, '.env'),
    join(homedir(), '.hermes-drain', '.env'),
    join(homedir(), '.hermes', '.env'),
  ].filter(Boolean),
},
```

`fetch` already receives `body: ep.body`; `undefined` is valid for `GET`.

#### Key resolution helper

**File(s)**: `agents/model-manager.mjs` (new function above `pingProvider`)

Returns the key or `null`. Reads `process.env` first; otherwise walks `ep.envFile()`
paths in order, matching `/^OPENROUTER_API_KEY=(.+)$/m` (generalised to `ep.keyEnv`),
stripping surrounding quotes and whitespace, and caching into `process.env[keyEnv]`.
Missing files are skipped silently — an absent profile is the existing
`not-configured` case, not an error.

#### Unmonitored status

**File(s)**: `agents/model-manager.mjs` (`pingProvider` line ~144, `checkAllProviderHealth` line ~205)

`pingProvider`'s unknown-provider guard changes from `{ up: false, error: 'unknown
provider' }` to `{ up: null, unmonitored: true, error: 'no health endpoint configured' }`.
`checkAllProviderHealth` handles `result.unmonitored` before the `up`/failure branches.

#### State reset

**File(s)**: `agents/model-intel.json`

Delete the `providerHealth.openrouter` key. The next sweep writes a truthful entry.
`checkAllProviderHealth()` rebuilds `results` from scratch each run, so a missing key is
simply `prev.status === 'unknown'` — no migration logic required.

#### Tests

**File(s)**: `tests/adapter-and-model-manager.test.mjs`

- **Guard**: derive the provider set from `budget.json` exactly as
  `checkAllProviderHealth()` does; assert each has a `HEALTH_ENDPOINTS` entry. Fails
  loudly the next time a provider is adopted without a probe.
- **Regression**: `pingProvider('nonexistent-provider')` resolves `unmonitored: true`
  and never `up: false`.

### Data Flow

```
scheduler tick
  └─ checkAllProviderHealth()
       ├─ provider set ← budget.json providers + fallbackChain model providers + {groq,gemini,cerebras}
       └─ for each provider → pingProvider(provider)
            ├─ HEALTH_ENDPOINTS[provider] missing
            │    └─ { up: null, unmonitored: true }
            │         → status 'unmonitored', failures 0, ⚠️ logged, ledger event
            │           (Phase 3 inert — no swap, no page)
            ├─ key unresolved (env, then ep.envFile() paths)
            │    └─ { up: null, notConfigured: true }
            │         → status 'not-configured', failures 0   (unchanged)
            └─ probe sent
                 ├─ 200 / 429 / 402 / 403 → up   → failures 0
                 └─ other / throw        → fail  → failures+1; >= 2 latches 'down'
                                                    → Phase 3 swap or CRITICAL page
```

### Schema / Interface Changes

```typescript
// HEALTH_ENDPOINTS entry — new optional field
type HealthEndpoint = {
  url: string;
  method: 'GET' | 'POST';
  headers: (key: string) => Record<string, string>;
  body?: string;
  keyEnv: string;
  urlSuffix?: (key: string) => string;
  envFile?: () => string[];   // NEW: ordered .env fallback paths for keyEnv
};

// pingProvider result — new variant
type PingResult = {
  up: boolean | null;
  error: string | null;
  latencyMs: number;
  notConfigured?: boolean;
  unmonitored?: boolean;      // NEW: no probe defined; never counts as a failure
};

// providerHealth status — new member
type ProviderStatus = 'up' | 'degraded' | 'down' | 'not-configured' | 'unmonitored';
```

---

## Decisions

### Decision 1: Probe `/api/v1/auth/key` rather than a chat completion

**Chosen**: `GET https://openrouter.ai/api/v1/auth/key`

**Considered**: (a) `POST /api/v1/chat/completions` with `max_tokens: 1`, matching the
other five providers; (b) unauthenticated `GET /api/v1/models`.

**Rationale**: (a) spends real tokens on every tick across 16 timers and pins liveness
to one model id — when that id is retired the probe reports a false outage, recreating
this same bug. (b) returns `200` even with a revoked or absent key, so it cannot
distinguish "OpenRouter is up" from "we can actually use OpenRouter" — the failure it
would miss is precisely the one that blocks agents. `/auth/key` is free, model-agnostic,
and returns `200` only for a genuinely valid key. Verified both directions on
2026-08-01: `200` with the key, `401` without.

### Decision 2: `unmonitored` as a distinct status, not `up`

**Chosen**: A new `unmonitored` status that is inert to swaps and pages.

**Considered**: (a) treat unknown providers as `up` (optimistic); (b) keep them as a
failure but exempt them from notifications; (c) hard-fail the sweep on an unknown
provider.

**Rationale**: (a) is silently wrong — it claims knowledge the framework does not have
and hides the config gap. (b) leaves the provider latched `down`, which still blocks
agents via Phase 3 even in silence. (c) turns a monitoring gap into a total scheduler
outage. A distinct status states the truth — *we did not check* — while the console
`⚠️` line, the `provider-unmonitored` ledger event, and the guard test make sure the gap
is visible rather than quietly tolerated. This mirrors the existing `notConfigured`
precedent, so it adds a case to a pattern already in the file rather than a new concept.

### Decision 3: Reuse the `pr-auto-review.mjs` env-file pattern instead of a global loader

**Chosen**: A per-endpoint `envFile()` list, consulted only when `process.env` misses.

**Considered**: (a) a framework-wide dotenv loader at `model-manager.mjs` startup;
(b) inject `OPENROUTER_API_KEY` into the systemd unit files.

**Rationale**: (a) would silently change key resolution for every provider and every
consumer of the module — far more blast radius than this fix warrants, and it risks
shadowing intentionally-set environment values. (b) copies a live secret into
`~/.config/systemd/user/`, spreading it across a second location that then has to be
kept in sync on rotation. The per-endpoint list keeps the change scoped to the one
provider that needs it, and matches code Bryce already has in the repo.

### Decision 4: Delete the poisoned key rather than write a corrected one

**Chosen**: Remove `providerHealth.openrouter` from `model-intel.json`.

**Considered**: Hand-write `{ status: 'up', consecutiveFailures: 0 }`.

**Rationale**: Hand-writing `up` asserts a health result no probe produced — the same
category error as Decision 2(a). `checkAllProviderHealth()` rebuilds `results` from
scratch every sweep and treats a missing key as `{ status: 'unknown',
consecutiveFailures: 0 }`, so deletion is sufficient and self-correcting on the next tick.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `unmonitored` masks a provider that genuinely needs monitoring | Medium | Medium | Guard test fails the build when a `budget.json` provider lacks a probe; `⚠️` console line and `provider-unmonitored` ledger event on every sweep |
| `/auth/key` stays `200` while inference is actually failing | Low | Medium | Accepted and narrowly scoped: a per-model liveness probe is what Decision 1 rejects. Inference failures already surface through the adapter's own error path and the existing `highSeverityFailure` trigger. |
| Env-file read picks up a stale or rotated key | Low | Low | Same file the adapter and `pr-auto-review.mjs` already read — a stale key there is a pre-existing condition, not one this change introduces. A revoked key yields `401` → correctly `down`. |
| Fix lands but an agent is left on a persisted `budget-exhausted` `activeModel` | Low | High | T-402 re-runs `model-manager.mjs check` and inspects `activeModel` for all four agents post-fix. Verified unset today, but the assignment is one `saveBudget()` call away from persisting. |
| Regression in the 5 existing providers' probes | Low | High | `resolveProviderKey()` preserves `process.env`-first order exactly; providers without `envFile` behave bit-identically. Full suite run in T-303. |

---

## Testing Approach

- **Unit tests** (`tests/adapter-and-model-manager.test.mjs`):
  - every provider derived from `budget.json` has a `HEALTH_ENDPOINTS` entry
  - `HEALTH_ENDPOINTS.openrouter` exists, is `GET`, targets `/auth/key`, and declares
    `keyEnv: 'OPENROUTER_API_KEY'`
  - an unknown provider yields `unmonitored: true` and never `up: false`
  - `resolveProviderKey()` prefers `process.env` over the env file
- **Integration tests**: `node agents/model-manager.mjs check` against live OpenRouter —
  assert `providerHealth.openrouter.status === 'up'` and `consecutiveFailures === 0`
- **Manual verification**:
  - `providerHealth.openrouter` shows `up` with a real `latencyMs`
  - no new `all-fallbacks-down` rows in `pm/model-performance.jsonl` after the sweep
  - all four agents' `activeModel` is a real model, not `budget-exhausted`
  - no CRITICAL Telegram message on the following scheduler tick (Bryce confirms)
  - negative control: probe with a deliberately invalid key → `401` → `degraded` then
    `down`, proving real outages still page

---

## Next Step

Proceed to specs phase.
