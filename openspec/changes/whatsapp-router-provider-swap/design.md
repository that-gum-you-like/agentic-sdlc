# Design: whatsapp-router-provider-swap

**Date**: 2026-05-01
**Author**: CTO-Opus (claude-opus-4-7)
**Status**: design

---

## Context

### Current State

OpenClaw 2026.2.26 runs as a systemd user service (`openclaw-gateway.service`, PID 1614 at design time). The gateway:

- Owns the WhatsApp Web socket (`whatsapp:default` listener — healthy)
- Hosts an embedded agent runtime that boots agents from `~/.openclaw/openclaw.json`
- Routes inbound WhatsApp messages → `whatsapp-router` agent (per `bindings[]` config) → LLM → outbound reply
- Persists failed deliveries in `~/.openclaw/delivery-queue/` with retry sweeps

Both the global default model and the `whatsapp-router` override are set to `openrouter/openrouter/auto`. The OpenRouter account is dead (HTTP 402, balance affords ~1717 of the 4096 max_tokens requested).

### Problem Restatement

Replace the dead OpenRouter model with the working `anthropic/claude-sonnet-4-5` so the `whatsapp-router` agent can answer inbound WhatsApp messages.

---

## Goals

- `whatsapp-router` agent successfully completes an LLM turn against Anthropic (verifiable via `openclaw agent` CLI invocation returning a non-error response)
- `agents.defaults.model.primary` points to the Anthropic model so other embedded agents don't keep hitting 402
- Gateway restart leaves the WhatsApp Web listener attached and healthy
- The 16 stuck deliveries either drain or are clearly accounted for (counted, status logged)
- Original config preserved as `openclaw.json.bak.5` so revert is one `cp` away

## Non-Goals

- Add a Groq adapter
- Change agent prompts, tool allowances, or workspace layout
- Upgrade OpenClaw
- Re-pair WhatsApp

---

## Design

### Overview

Two-line JSON edit + systemd restart + three verification probes. No code is shipped — only configuration.

### Components

#### 1. Config edit

**File**: `~/.openclaw/openclaw.json`

Two fields change:

```diff
  "agents": {
    "defaults": {
      "model": {
-       "primary": "openrouter/openrouter/auto"
+       "primary": "anthropic/claude-sonnet-4-5"
      },
      ...
    },
    "list": [
      { "id": "main" },
      {
        "id": "whatsapp-router",
        ...
-       "model": "openrouter/openrouter/auto"
+       "model": "anthropic/claude-sonnet-4-5"
      }
    ]
  }
```

The model `anthropic/claude-sonnet-4-5` is already present in `agents.defaults.models` (configured), so no auth/registration work is needed.

#### 2. Backup

Before editing: `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak.5`

Four backups already exist (`.bak`, `.bak.1`, `.bak.2`, `.bak.3`, `.bak.4`); `.bak.5` is the next free slot.

#### 3. Gateway restart

`systemctl --user restart openclaw-gateway`

The unit is enabled and was last started 2026-05-01 13:32:45 MDT. Restart is a clean operation — the gateway has its own delivery-queue persistence, so in-flight messages are durable across a restart.

#### 4. Verification

Three checks, in order:

1. **Boot health**: `journalctl --user -u openclaw-gateway -n 100 --no-pager` — expect the WhatsApp listener line and **no** `error=402` lines from the embedded agent boot.
2. **Synthetic agent turn**: invoke `openclaw agent` against `whatsapp-router` with a trivial prompt and confirm a non-error response. (Exact CLI form to be confirmed by the executor via `openclaw agent --help`.)
3. **Delivery drain**: read `~/.openclaw/delivery-queue/` count before and after; expect the 16 retry-failed entries to either flush or, at minimum, stop generating new 402s.

#### 5. Round-trip (user-side)

Bryce sends a real WhatsApp message to `+19184079794` and confirms a Claude reply. Closes Task #6.

---

## Failure Modes & Rollback

| Failure | Detection | Rollback |
|---|---|---|
| Anthropic profile turns out to be unauthenticated | Gateway log shows 401/403 instead of 402 | `cp ~/.openclaw/openclaw.json.bak.5 ~/.openclaw/openclaw.json && systemctl --user restart openclaw-gateway`, then escalate to Bryce to refresh anthropic token |
| Model name mismatch (typo, registry change) | Gateway log shows "unknown model" | Same rollback; recheck `openclaw models list` for exact ID |
| WhatsApp listener fails to re-attach after restart | `openclaw doctor` reports inactive listener | `openclaw channels login --channel whatsapp --account default` (requires Bryce's phone for QR) — escalate |
| Anthropic returns 429 rate-limit under WhatsApp load | Sustained 429s in logs | Switch model to a less-loaded tier or back to topped-up OpenRouter; document for follow-up |

---

## Open Questions

None blocking. Confirmation of exact `openclaw agent` CLI form is left to the Sonnet executor (read `openclaw agent --help` first).
