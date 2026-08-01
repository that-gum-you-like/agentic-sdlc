# Proposal: cross-provider-fallback-rungs

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: proposed

---

## Problem

Every rung of every agent's `fallbackChain` in `agents/budget.json` is an OpenRouter
model. A genuine OpenRouter outage therefore stops **all four agents at once** —
`findHealthyFallback()` has nowhere healthy to go, so `model-manager.mjs` correctly
reports `all-fallbacks-down` and blocks the work. Single provider, total stoppage.

```
sdlc-developer      qwen/qwen3-coder → qwen3-coder-30b → deepseek-v4-flash → deepseek-chat-v3.1 → qwen3-coder:free
jony-aive           deepseek-chat-v3.1 → deepseek-v4-flash → qwen3-next-80b:free
sdlc-reviewer       deepseek-chat-v3.1 → deepseek-v4-flash → llama-3.3-70b-instruct:free
sdlc-documentarian  deepseek-v4-flash → deepseek-chat-v3.1 → qwen3-next-80b:free
```

All 15 rungs are `provider: openrouter`.

This was surfaced by `provider-health-probe-gaps` (2026-08-01), where a *false*
OpenRouter outage produced 7,204 CRITICAL pages. The alarm was wrong; the single point
of failure it revealed is real. CLAUDE.md already states the intended rule —
"Free-tier fallbacks (Groq, Gemini, Cerebras) should end every fallback chain" — and no
chain follows it.

**A second, blocking defect was found while scoping this.** Groq is the only
non-OpenRouter provider with a key on this host, but `GROQ_API_KEY` is defined in
`~/.bashrc` only. Systemd user units do not inherit an interactive shell's environment,
and `sdlc-sched-model-manager-check.service` loads just `EnvironmentFile=-%h/.hermes/.env`
plus `PATH`. Confirmed from the live journal:

```
Aug 01 17:30:08  ⚪ groq: not configured (no API key)
Aug 01 17:30:08  ⚪ gemini: not configured (no API key)
Aug 01 17:30:08  ⚪ cerebras: not configured (no API key)
Aug 01 17:30:09  🟢 openrouter: up (526ms)
```

`systemctl --user show-environment` contains no `GROQ_API_KEY`. So under the scheduler —
the only place fallback actually matters — Groq is unusable. Adding a Groq rung without
fixing this would produce a chain that looks resilient and is not: exactly the kind of
false assurance the previous change existed to eliminate.

---

## Discovery

- **Files examined**:
  - `agents/budget.json` — all 4 agents, all 15 fallback rungs, every one `openrouter`
  - `agents/model-intel.json` — `llama-3.3-70b-versatile` (groq) has a complete entry:
    `costPer1MInput` 0.59, `contextWindow` 128000, all five `strengths` at 3
  - `agents/model-manager.mjs:247-262` — `findHealthyFallback()` scans rungs *after* the
    current model and skips only `status === 'down'`
  - `~/.config/systemd/user/sdlc-sched-model-manager-check.service` — `EnvironmentFile=-%h/.hermes/.env`
  - `~/.hermes/.env` — mode `0600`, already holds `OPENROUTER_API_KEY` and both Telegram
    tokens; **no** `GROQ_API_KEY`
  - `~/.bashrc` — the only definition of `GROQ_API_KEY`
  - CLAUDE.md, *Adapters* — "Free-tier fallbacks (Groq, Gemini, Cerebras) should end
    every fallback chain"
- **Existing patterns**:
  - `HEALTH_ENDPOINTS.groq` already exists and probes correctly when the key is present
  - `~/.hermes/.env` is the established home for scheduler-visible secrets, loaded by
    every `sdlc-sched-*` unit via `EnvironmentFile=`
  - `not-configured` never latches `down`, so an unkeyed Groq rung stays *eligible* in
    `findHealthyFallback()` — it would be selected and then fail at call time
- **Existing tests**: `tests/adapter-and-model-manager.test.mjs` now asserts every
  `budget.json` provider has a health endpoint (added by `provider-health-probe-gaps`).
  Nothing asserts that a chain spans more than one provider.
- **Key findings**:
  1. Gemini and Cerebras have no key anywhere on this host — Groq is the only viable
     cross-provider rung today.
  2. Because `findHealthyFallback()` skips only `down`, a `not-configured` Groq rung is
     *worse than absent*: it would be chosen during an outage and then fail on the call.
     The key fix is a hard prerequisite, not a nice-to-have.
  3. `llama-3.3-70b-versatile` scores 3/5 across all strengths versus 5/5 coding for
     `qwen/qwen3-coder` — a real quality drop, appropriate only as a last rung.

---

## Proposed Solution

Add `GROQ_API_KEY` to `~/.hermes/.env` so the scheduler can see it, then append
`llama-3.3-70b-versatile` as the final rung of all four agents' `fallbackChain`. Add a
guard test asserting every chain ends on a provider different from the agent's primary,
so the CLAUDE.md rule is enforced rather than merely documented.

---

## Value Analysis

### Benefits

- Converts a total work stoppage during an OpenRouter outage into a graceful degradation
  to a slower, lower-quality model — the agents keep working
- Makes the scheduler's Groq health probe meaningful; it currently reports
  `not-configured` on every tick despite a valid key existing on the host
- Enforces a CLAUDE.md rule that is currently documented and universally violated
- Restores the emergency rung that free-tier providers exist to supply

### Costs

- **Effort**: S — one `.env` line, four one-line `budget.json` edits, one test
- **Risk**: Low. The new rung is *last*, so it is reached only when every OpenRouter rung
  is unavailable. Normal operation is byte-identical.
- **Quality trade-off**: `llama-3.3-70b-versatile` is 3/5 on coding versus 5/5 for
  `qwen/qwen3-coder`. Accepted deliberately — degraded output during an outage beats no
  output, and the test gate still governs what can land.
- **Dependencies**: a valid `GROQ_API_KEY` (present in `~/.bashrc`). No new npm deps.

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Add the Groq rung without fixing the key | Actively harmful. `not-configured` does not latch `down`, so `findHealthyFallback()` would select an unusable rung during an outage and fail at call time — a chain that reads as resilient but is not. |
| Add Gemini/Cerebras rungs too | No API key exists for either on this host, so both would be the same false-assurance trap. Revisit if keys are ever added. |
| Export `GROQ_API_KEY` in the systemd units directly | Copies a live secret into `~/.config/systemd/user/`, a second location to keep in sync on rotation. `~/.hermes/.env` is already the established, `0600`, unit-loaded home for these secrets. |
| Add `systemctl --user set-environment` | Not persistent across a systemd user-instance restart; would silently revert. |
| Put the Groq rung earlier in the chain | Would route normal traffic to a 3/5 model while better rungs are healthy. The point is emergency capacity, not cost. |
| Do nothing | An OpenRouter outage halts all four agents, and the just-fixed monitoring would correctly page CRITICAL with nothing to fall back to. |

### Decision

**Yes.** The previous change made outage detection truthful; this makes an outage
survivable. Small, last-rung-only, and it closes a gap CLAUDE.md already called for.

---

## Scope

### In Scope

- `GROQ_API_KEY` added to `~/.hermes/.env` (mode preserved at `0600`)
- `llama-3.3-70b-versatile` appended as the final rung for all four agents
- Guard test: every agent's chain ends on a provider other than its primary
- Verification that the scheduler reports `groq: up`

### Out of Scope

- Gemini and Cerebras rungs — no keys on this host
- Reordering or re-pricing existing OpenRouter rungs
- `modelPreferences` maps
- Changing `findHealthyFallback()` selection logic
- Rotating or re-issuing any key

---

## Next Step

If approved: proceed to design phase.
