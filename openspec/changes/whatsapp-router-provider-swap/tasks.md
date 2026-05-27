# Tasks: whatsapp-router-provider-swap

**Date**: 2026-05-01
**Author**: CTO-Opus (claude-opus-4-7)
**Status**: tasks

---

## Overview

Swap the WhatsApp router agent and OpenClaw's default model from a credit-exhausted OpenRouter to Anthropic Claude. Pure configuration change + service restart + verification. See `proposal.md` and `design.md`.

---

## Prerequisites

- [x] Design is approved
- [x] Bryce authorized gateway restart
- [x] Bryce confirmed he is not actively using WhatsApp during the swap window
- [x] Anthropic auth profile present and known-working (this Claude Code session is itself running on Anthropic)

---

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|-------------|-------|-------|---------------|
| Design + verification | CTO-Opus (this session) | T1, T7 | — |
| Config + restart + smoke test | Sonnet executor (subagent) | T2, T3, T4, T5 | Serial |
| End-to-end round-trip | Bryce (human) | T6 | After T5 |

---

## Implementation Tasks

### Phase 1: Edit + restart (Sonnet executor, serial)

- [ ] **T2**: Backup `~/.openclaw/openclaw.json` to `openclaw.json.bak.5`
  - Files: `~/.openclaw/openclaw.json`
  - Agent: Sonnet executor
  - Parallel: no
  - Complexity: S

- [ ] **T3**: Edit two fields in `~/.openclaw/openclaw.json`
  - Change `agents.defaults.model.primary`: `openrouter/openrouter/auto` → `anthropic/claude-sonnet-4-5`
  - Change `agents.list[id="whatsapp-router"].model`: same swap
  - Validate the file is still valid JSON (`jq . openclaw.json > /dev/null`) before proceeding
  - Files: `~/.openclaw/openclaw.json`
  - Agent: Sonnet executor
  - Parallel: blocked-by T2
  - Complexity: S

- [ ] **T4**: Restart gateway and confirm clean boot
  - Command: `systemctl --user restart openclaw-gateway`
  - Then: `journalctl --user -u openclaw-gateway -n 100 --no-pager` — expect WhatsApp listener line, **no** `error=402`
  - Agent: Sonnet executor
  - Parallel: blocked-by T3
  - Complexity: S

### Phase 2: Verification (Sonnet executor, parallel after T4)

- [ ] **T5a**: Synthetic agent turn against `whatsapp-router`
  - Read `openclaw agent --help` first to confirm exact flag form
  - Invoke a trivial prompt and confirm the response is from Anthropic (not a 402)
  - Agent: Sonnet executor
  - Parallel: blocked-by T4
  - Complexity: S

- [ ] **T5b**: Delivery queue inspection
  - List `~/.openclaw/delivery-queue/` (count + first/last entry timestamps)
  - Re-check after ~60s; report whether the queue drained
  - Do NOT manually delete entries
  - Agent: Sonnet executor
  - Parallel: blocked-by T4 (parallel with T5a)
  - Complexity: S

### Phase 3: Round-trip (Bryce)

- [ ] **T6**: Bryce sends a real WhatsApp message and confirms Claude replies
  - Out of agent control
  - Stays open until Bryce confirms

### Phase 4: Cleanup + memory

- [ ] **T7**: Update auto-memory with the swap
  - File: `~/.claude/projects/-home-bryce/memory/openclaw.md` (the existing OpenClaw guide)
  - One line: model swap date + reason + rollback path
  - Agent: CTO-Opus
  - Parallel: blocked-by T6

- [ ] **T8**: Archive this change
  - Move `~/agentic-sdlc/openspec/changes/whatsapp-router-provider-swap/` → `~/agentic-sdlc/openspec/changes/archive/`
  - Commit + push to `~/agentic-sdlc` GitHub remote
  - Agent: CTO-Opus
  - Parallel: blocked-by T7

---

## Completion Criteria

This change is complete when:

- [ ] Both config fields show `anthropic/claude-sonnet-4-5`
- [ ] Backup file `openclaw.json.bak.5` exists
- [ ] Gateway is running, WhatsApp listener attached, no 402 errors in logs
- [ ] Synthetic agent turn returns a non-error LLM response
- [ ] Bryce has confirmed an end-to-end WhatsApp round-trip
- [ ] Auto-memory updated
- [ ] Change archived and pushed to `~/agentic-sdlc`

---

## Notes

- **Repo discipline**: This change lives in `~/agentic-sdlc/openspec/changes/`, NOT in `~/languageapp/openspec/`. OpenClaw is meta-infrastructure for the multi-agent system, not LinguaFlow product work.
- **Rollback**: `cp ~/.openclaw/openclaw.json.bak.5 ~/.openclaw/openclaw.json && systemctl --user restart openclaw-gateway` — single command.
- **Follow-up parking** (do NOT execute as part of this change):
  - Add a Groq adapter to OpenClaw (separate openspec change if Bryce wants Groq for the router)
  - Upgrade OpenClaw 2026.2.26 → 2026.4.29 (gateway log nags about this)
- **Multi-agent SDLC compliance**: Opus orchestrates + designs + verifies; Sonnet executes the ops steps (T2–T5). Per Bryce's model-tier rule, this is the correct tier split for low-complexity ops on personal infra.
