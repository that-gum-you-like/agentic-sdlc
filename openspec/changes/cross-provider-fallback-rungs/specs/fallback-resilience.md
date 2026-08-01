# Spec: fallback-resilience

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: specs

---

## Overview

Covers agent fallback-chain composition in `agents/budget.json` and the environment
visibility required for a fallback rung to be usable by the scheduler.

Governing principle: **a fallback rung must be callable in the environment where the
fallback happens.** A rung that only works in an interactive shell is false assurance.

---

## Requirements

### REQ-001: Groq key is visible to the scheduler

**Statement:** The system shall make `GROQ_API_KEY` available to every `sdlc-sched-*`
systemd user unit.

**Acceptance Criteria:**
- [ ] `GROQ_API_KEY` is present in `~/.hermes/.env`
- [ ] `~/.hermes/.env` retains mode `0600`
- [ ] After a real timer-driven run, the journal for
      `sdlc-sched-model-manager-check.service` reports `groq: up` — not `not configured`
- [ ] Verification is taken from the journal, never from an interactive shell run
- [ ] Edge case: `~/.bashrc` is unchanged, so interactive use is unaffected
- [ ] Edge case: the key value never appears in repo files, stdout, or a commit

**Dependencies:** None

**Complexity:** S

**Value:** CRITICAL

**Notes:** Systemd user units do not inherit an interactive shell's environment. The live
journal showed `⚪ groq: not configured` on every tick while an interactive check showed
`🟢 groq: up` — that divergence is what made this invisible.

---

### REQ-002: Every agent has a cross-provider fallback rung

**Statement:** The system shall give every agent in `budget.json` at least one
`fallbackChain` rung whose provider differs from the agent's primary provider.

**Acceptance Criteria:**
- [ ] `sdlc-developer`, `jony-aive`, `sdlc-reviewer` and `sdlc-documentarian` each end
      their chain with `llama-3.3-70b-versatile`
- [ ] That model resolves to `provider: groq` in `model-intel.json`
- [ ] Every rung in every chain resolves to a known model in `model-intel.json`
- [ ] Edge case: the rung is **last**, so it is selected only when every preceding rung's
      provider is `down`

**Dependencies:** REQ-001

**Complexity:** S

**Value:** HIGH

**Notes:** REQ-001 is a hard prerequisite. `findHealthyFallback()` skips only
`status === 'down'`, so an unkeyed rung is `not-configured`, still eligible, and would be
selected during an outage and then fail at call time.

---

### REQ-003: Normal operation is unchanged

**Statement:** The system shall not alter model selection while the primary provider is
healthy.

**Acceptance Criteria:**
- [ ] Each agent's `model` and `provider` fields are unchanged
- [ ] Each agent's `modelPreferences` map is unchanged
- [ ] The relative order of all pre-existing rungs is unchanged
- [ ] The new rung appears only at the end of each chain
- [ ] Edge case: with `openrouter` healthy, `model-manager.mjs check` performs no swap

**Dependencies:** REQ-002

**Complexity:** S

**Value:** HIGH

**Notes:** Being provably inert in normal operation is what makes this safe to ship
without a staged rollout.

---

### REQ-004: Chain composition is enforced by tests

**Statement:** The system shall fail its test suite when any agent's `fallbackChain` lacks
a cross-provider rung or references an unknown model.

**Acceptance Criteria:**
- [ ] A test asserts each agent has ≥1 rung whose provider differs from its primary,
      naming the offending agent on failure
- [ ] A test asserts every rung resolves to a `model-intel.json` entry
- [ ] The provider comparison is derived from `model-intel.json`, not hardcoded to `groq`,
      so adding Gemini/Cerebras rungs later needs no test change
- [ ] Both run under the `project.json` `testCmd`

**Dependencies:** REQ-002

**Complexity:** S

**Value:** HIGH

**Notes:** CLAUDE.md already stated the free-tier-tail rule; all 15 rungs violated it.
Documentation without enforcement is how that happened.

---

## Acceptance Criteria (Scenarios)

---

### Scenario 1: Scheduler sees a healthy Groq

**Verifies:** REQ-001

**WHEN** `sdlc-sched-model-manager-check.service` runs from its timer after the key is added

**THEN** its journal output reports `🟢 groq: up` with a latency

**AND** `openrouter` continues to report `up`, unaffected

---

### Scenario 2: OpenRouter outage degrades instead of stopping

**Verifies:** REQ-002

**WHEN** `providerHealth.openrouter` is `down` and every OpenRouter rung is therefore skipped

**THEN** `findHealthyFallback()` returns `llama-3.3-70b-versatile` for each agent

**AND** a `provider-down-swap` event is recorded rather than `all-fallbacks-down`, and the
agents keep working on the fallback

---

### Scenario 3: Healthy day is a no-op

**Verifies:** REQ-003

**WHEN** `model-manager.mjs check` runs with `openrouter` healthy

**THEN** no swap occurs and every agent keeps its configured model

**AND** the Groq rung is never selected

---

### Scenario 4: Error Case — chain references an unknown model

**Verifies:** REQ-004

**WHEN** a `fallbackChain` names a model absent from `model-intel.json`

**THEN** the test suite fails and names the offending agent and model

**AND** the failure is attributable without reading the diff

---

### Scenario 5: Edge Case — Groq itself is down

**Verifies:** REQ-002

**WHEN** both `openrouter` and `groq` are `down`

**THEN** `findHealthyFallback()` returns `null` and the existing `all-fallbacks-down`
CRITICAL page fires

**AND** that is correct behaviour — this change adds a rung, it does not promise
unconditional availability

---

## Invariants

- A fallback rung is only counted as resilience if its provider is configured in the
  environment where the fallback executes
- The cross-provider rung is always last, so healthy traffic never reaches it
- Secrets live only in `~/.hermes/.env` (mode `0600`), never in the repo
- This change never suppresses an alert: with all providers down, the CRITICAL page still
  fires
- Existing rung order and `modelPreferences` are untouched

---

## Out of Scope

- Gemini and Cerebras rungs (no keys on this host)
- Reordering or re-pricing existing rungs
- Changes to `findHealthyFallback()` selection logic
- Key rotation or re-issuance

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | manual / T-301 | journal check after a real timer run |
| Scenario 2 | `tests/adapter-and-model-manager.test.mjs` | `every agent has a cross-provider fallback rung` |
| Scenario 3 | manual / T-302 | `model-manager.mjs check` shows no swap |
| Scenario 4 | `tests/adapter-and-model-manager.test.mjs` | `every fallback rung resolves to a known model` |
| Scenario 5 | covered by existing `all-fallbacks-down` path | unchanged behaviour |

---

## Next Step

Proceed to tasks phase.
