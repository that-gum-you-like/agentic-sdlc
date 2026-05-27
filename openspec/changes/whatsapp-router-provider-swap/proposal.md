# Proposal: whatsapp-router-provider-swap

**Date**: 2026-05-01
**Author**: CTO-Opus (claude-opus-4-7)
**Status**: proposed

---

## Problem

Bryce's `whatsapp-router` OpenClaw agent stopped replying to inbound WhatsApp messages. Gateway logs show every embedded agent turn failing with HTTP 402 from OpenRouter:

```
embedded run agent end: ... isError=true error=402
This request requires more credits, or fewer max_tokens.
You requested up to 4096 tokens, but can only afford 1717.
```

The OpenRouter account is out of credits. 16 inbound messages are stuck in `delivery-recovery` retry. Bryce is leaving for a week and needs WhatsApp ↔ Claude as his primary communication channel during that window.

---

## Discovery

- **Files examined**:
  - `~/.openclaw/openclaw.json` — `agents.list[whatsapp-router].model = openrouter/openrouter/auto`; `agents.defaults.model.primary = openrouter/openrouter/auto`
  - `journalctl --user -u openclaw-gateway` — confirmed the 402 above; WhatsApp Web listener is otherwise healthy (`Listening for personal WhatsApp inbound messages`)
  - `openclaw models list` — three configured models: `openrouter/openrouter/auto` (dead), `anthropic/claude-sonnet-4-5` (configured + auth'd), `openrouter/anthropic/claude-sonnet-4-5` (same dead OR account)
  - `~/.openclaw/credentials/whatsapp/default/` — pairing intact, no relink needed
- **Existing patterns**: OpenClaw's per-agent override mechanism — `agents.list[*].model` overrides the global `agents.defaults.model.primary`. Both currently point at OpenRouter.
- **Existing tests**: None — OpenClaw is third-party infra, not in our test surface. Verification is operational (gateway logs + a synthetic agent turn + a real round-trip from Bryce's phone).
- **Key findings**: This is a one-line config swap, not an integration project. Anthropic auth profile (`anthropic:anthropictoken1`, `anthropic:manual`) is already wired and matches the user's privacy rules (no OpenAI; Anthropic acceptable). `GROQ_API_KEY` exists in env but OpenClaw 2026.2.26 has no Groq adapter — that would be a separate, larger change.

---

## Proposed Solution

Swap both the `whatsapp-router` agent's model and the global default from `openrouter/openrouter/auto` to `anthropic/claude-sonnet-4-5`. Restart the gateway, verify a synthetic agent turn returns a real LLM response, and let the existing delivery-recovery retry sweep flush the 16 stuck messages. Bryce confirms end-to-end with a real phone test.

---

## Value Analysis

### Benefits

- Restores WhatsApp ↔ Claude during Bryce's week-long away period (primary motivation)
- Eliminates a single-provider dependency on OpenRouter (single point of failure that just failed)
- Aligns the runtime model with the user's stated provider policy (Anthropic acceptable; no OpenAI; Groq preferred but adapter unavailable)
- Stuck inbound messages get processed automatically by existing retry sweep — no manual replay logic needed

### Costs

- **Effort**: Small — one config edit (~2 fields), one service restart, three verification steps
- **Risk**: Low. Gateway restart kicks the active WhatsApp Web socket for a few seconds. Bryce confirmed it's fine (he's not actively using WhatsApp during the swap). Anthropic profile is already known-working (this very Claude Code session is on Anthropic).
- **Dependencies**: None added. We're removing a runtime dependency on OpenRouter, not adding one.

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Top up OpenRouter credits | Doesn't address the single-provider risk; user explicitly asked for a different provider |
| Add Groq adapter to OpenClaw | Larger change — OpenClaw 2026.2.26 has no Groq plugin shipped; would need plugin authoring + auth wiring + model registration + testing. Worth a separate openspec change if Bryce wants it; not on the critical path for this week |
| Switch only whatsapp-router, leave defaults pointed at OR | Other embedded agents (boot hooks, cron jobs) would keep hitting 402. Cleaner to swap both surfaces |
| Do nothing | WhatsApp stays broken for the week — unacceptable |

### Decision

**Yes.** Smallest, safest, fastest path to a working pipeline within the deadline. Groq adapter work is parked as a follow-up.

---

## Scope

### In Scope

- Edit `agents.list[whatsapp-router].model` and `agents.defaults.model.primary` in `~/.openclaw/openclaw.json`
- Backup the config file before editing (add `openclaw.json.bak.5`)
- Restart `openclaw-gateway` systemd user unit
- Verify gateway boots clean, listener re-attaches, synthetic agent turn succeeds
- Confirm stuck delivery queue drains via existing retry mechanism

### Out of Scope

- Adding a Groq model adapter to OpenClaw (separate openspec change)
- Refilling OpenRouter credits
- Upgrading OpenClaw from 2026.2.26 → 2026.4.29 (a `gateway log` line nags about this; orthogonal to the bug)
- Changing the whatsapp-router agent prompt or behavior — only its model
- Re-pairing WhatsApp Web (credentials are intact)

---

## Next Step

If approved: proceed to design (`design.md`) and tasks (`tasks.md`), then delegate execution to a Sonnet executor agent per the multi-agent SDLC.
