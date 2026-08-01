# Design: cross-provider-fallback-rungs

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: design

---

## Context

### Current State

`model-manager.mjs` Phase 3 walks each agent in `budget.json`. If the agent's provider is
`down`, `findHealthyFallback(chain, currentModel, providerHealth)` scans the rungs *after*
the current model and returns the first whose provider is not `down`. On a miss it sets
`activeModel = 'budget-exhausted'` and fires the CRITICAL page.

All 15 rungs across all four agents are `provider: openrouter`, so an OpenRouter outage
guarantees the miss branch for every agent simultaneously.

`HEALTH_ENDPOINTS.groq` exists and works, and `model-intel.json` already carries a
complete `llama-3.3-70b-versatile` entry (`provider: groq`, 128k context, all strengths
3/5). What is missing is the key, in the one environment that matters.

`GROQ_API_KEY` is exported from `~/.bashrc`. Systemd user services do not inherit an
interactive shell's environment, and the scheduler units specify only
`Environment=PATH=…`, `Environment=SDLC_PROJECT_DIR=…`, and
`EnvironmentFile=-%h/.hermes/.env`. The live journal confirms the consequence — every
tick logs `⚪ groq: not configured (no API key)` — while an interactive
`node agents/model-manager.mjs check` shows `🟢 groq: up`, because my shell has the key.
That divergence is exactly why this was invisible.

### Problem Restatement

Give every agent a working non-OpenRouter rung, which requires first making Groq's key
visible to the scheduler.

---

## Goals

- Each of the four agents has a final rung whose provider differs from its primary
- The scheduler (not just an interactive shell) reports `groq: up`
- Normal operation is unchanged — the new rung is reached only when every OpenRouter rung
  is unavailable
- The CLAUDE.md free-tier-tail rule is enforced by a test, not just documented

## Non-Goals

- Gemini or Cerebras rungs (no keys on this host)
- Reordering existing rungs or changing `modelPreferences`
- Changing `findHealthyFallback()` or `decide()` logic
- Making the fallback model's quality equal to the primary's

---

## Design

### Overview

Two edits and a test.

1. **Key visibility.** Append `GROQ_API_KEY=<value>` to `~/.hermes/.env`, the `0600` file
   every `sdlc-sched-*` unit already loads via `EnvironmentFile=`. The value is copied
   from `~/.bashrc`; `~/.bashrc` is left alone so interactive use is unaffected. No secret
   enters the repo — `~/.hermes/.env` lives outside it.

2. **Chain extension.** Append `llama-3.3-70b-versatile` as the **last** rung of all four
   `fallbackChain` arrays. Last position is essential: `findHealthyFallback()` returns the
   first non-`down` rung after the current model, so any earlier placement would route
   normal traffic to a 3/5 model while 5/5 rungs are healthy.

3. **Guard test.** Assert every agent's chain contains at least one rung whose provider
   differs from the agent's primary provider — derived from `model-intel.json`, so it
   keeps working as models change.

### Ordering constraint

The key edit must land **before** the chain edit. `not-configured` does not latch `down`,
and `findHealthyFallback()` skips only `down` — so an unkeyed Groq rung would be *selected*
during an outage and then fail at call time. A chain that reads resilient but is not is
worse than no rung at all, and is the same class of false assurance that
`provider-health-probe-gaps` existed to remove.

### Components

#### Scheduler-visible Groq key

**File(s)**: `~/.hermes/.env` (outside the repo)

```
GROQ_API_KEY=<copied from ~/.bashrc>
```

Mode stays `0600`. Verified afterwards by re-running the timer and reading the journal —
not by an interactive run, which is what masked the problem originally.

#### Fallback chains

**File(s)**: `agents/budget.json`

| Agent | New final rung |
|-------|----------------|
| `sdlc-developer` | `llama-3.3-70b-versatile` |
| `jony-aive` | `llama-3.3-70b-versatile` |
| `sdlc-reviewer` | `llama-3.3-70b-versatile` |
| `sdlc-documentarian` | `llama-3.3-70b-versatile` |

#### Guard test

**File(s)**: `tests/adapter-and-model-manager.test.mjs`

Complements the health-endpoint guard added by `provider-health-probe-gaps`: that one
asserts every provider can be *probed*, this one asserts every agent can *escape* its
primary provider.

### Data Flow

```
OpenRouter outage (real, 2 consecutive failed probes)
  └─ providerHealth.openrouter = down
       └─ per agent: findHealthyFallback(chain, activeModel, health)
            ├─ scans rungs after current: all openrouter → skipped (down)
            └─ reaches llama-3.3-70b-versatile → provider groq → status up
                 └─ swap + 'provider-down-swap' ledger event + highSeverityFailure notice
                    ("work continues on fallback") instead of 'all-fallbacks-down'
```

### Schema / Interface Changes

None. `fallbackChain` is already `string[]`; only its contents change.

---

## Decisions

### Decision 1: Fix the key before adding the rung

**Chosen**: `~/.hermes/.env` first, `budget.json` second.

**Considered**: Add the rung now and fix the key later.

**Rationale**: `findHealthyFallback()` skips only `down`, and an unkeyed provider is
`not-configured`. So the rung would be picked during an outage and fail at call time —
converting a loud, correct `all-fallbacks-down` page into a silent mid-task failure. The
ordering is a correctness requirement, not tidiness.

### Decision 2: `~/.hermes/.env`, not the unit files

**Chosen**: Add the key to the existing `EnvironmentFile`.

**Considered**: (a) `Environment=GROQ_API_KEY=…` in each unit; (b)
`systemctl --user set-environment`.

**Rationale**: (a) copies a live secret into `~/.config/systemd/user/` — a second location
to update on rotation, and one that is easy to forget. (b) does not survive a systemd
user-instance restart, so it would silently revert and reintroduce this exact bug.
`~/.hermes/.env` is already `0600`, already loaded by every `sdlc-sched-*` unit, and
already holds `OPENROUTER_API_KEY` and both Telegram tokens.

### Decision 3: Groq only

**Chosen**: One cross-provider rung, Groq.

**Considered**: Also append Gemini and Cerebras rungs per the CLAUDE.md wording.

**Rationale**: Neither has a key anywhere on this host, so both would be `not-configured`
— the precise trap Decision 1 rejects, repeated twice. One *working* rung beats three
where two are decorative. The guard test is written against "a different provider", not
"Groq", so adding them later requires no test change.

### Decision 4: Last rung, accepting the quality drop

**Chosen**: Append at the end; accept 3/5 versus 5/5 coding.

**Considered**: Place Groq above the `:free` OpenRouter rungs, since a paid Groq model may
beat a free Qwen one.

**Rationale**: Those `:free` rungs are still OpenRouter, so in the outage this exists for
they are unavailable anyway — placing Groq above them changes nothing during an outage and
only risks diverting healthy traffic. Keeping it strictly last makes the change provably
inert in normal operation, which is the property that makes it safe to ship without a
staged rollout.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Groq quality degrades output during an outage | High (during outage) | Low | Deliberate trade: degraded work beats stopped work, and the test gate still governs what can land |
| Groq rate limits under load (noted in `model-intel.json`) | Medium | Medium | Last rung only, reached rarely; a Groq failure surfaces through the normal failure path |
| Key added to `.env` but scheduler still unkeyed | Low | High | T-301 verifies from the **journal** after a real timer run, never from an interactive shell — an interactive check is what hid this originally |
| Secret accidentally committed | Low | High | `~/.hermes/.env` is outside the repo; `git status` checked before commit; the key value is never printed to stdout |
| Chain edit breaks `budget.json` parsing | Low | High | Full `npm test` plus a live `model-manager.mjs models` run |

---

## Testing Approach

- **Unit tests** (`tests/adapter-and-model-manager.test.mjs`): every agent's
  `fallbackChain` contains at least one rung whose provider differs from the agent's
  primary; every rung resolves to a known model in `model-intel.json`
- **Integration tests**: `node agents/model-manager.mjs check` parses `budget.json` and
  reports health for both providers
- **Manual verification**:
  - `journalctl --user -u sdlc-sched-model-manager-check.service` shows `🟢 groq: up`
    after a real timer run
  - `node agents/model-manager.mjs models` lists the Groq rung for each agent
  - `git status` confirms no secret is staged

---

## Next Step

Proceed to specs phase.
