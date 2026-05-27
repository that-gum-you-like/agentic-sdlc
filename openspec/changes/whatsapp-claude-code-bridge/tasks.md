# Tasks: whatsapp-claude-code-bridge

**Date**: 2026-05-01
**Author**: CTO-Opus (claude-opus-4-7)
**Status**: tasks

---

## Overview

Build a polling daemon that bridges OpenClaw's WhatsApp mailbox to Claude Code (`claude --print`) and sends replies back via `openclaw message send`. See `proposal.md` and `design.md`.

---

## Prerequisites

- [x] `whatsapp-router-provider-swap` complete (gateway healthy, listener attached)
- [x] Bryce authorized full machine access for the daemon (`--allow-dangerously-skip-permissions`)
- [x] `claude` CLI installed and authenticated against Claude Max
- [x] `openclaw message send` known-working

---

## Work Stream Summary

| Work Stream | Agent | Tasks | Parallel With |
|---|---|---|---|
| Daemon implementation | Sonnet executor B | T1–T7 | Sonnet executor A (Task #9, claude-cli investigation) |
| OpenClaw binding removal | Sonnet executor B (after T8 verification) | T8 | Serial |
| End-to-end round-trip | Bryce | T9 | After T8 |

---

## Implementation Tasks

### Phase 1: Discover real shape of inputs (Sonnet executor B, serial start)

- [ ] **T1**: Read live `~/.openclaw/workspace/claude-mailbox.md` end-to-end
  - Determine the message-block delimiter, sender field format (e.g. `+1...` vs `whatsapp:+1...`), timestamp format
  - Document findings inline as a comment block at the top of `whatsapp-claude-bridge.mjs`
  - Files: `~/.openclaw/workspace/claude-mailbox.md` (read-only)
  - Complexity: S
  - Notes: If the file is empty, send a test message from another device or check OpenClaw's hook config in `openclaw.json` (`hooks.internal.entries`) to discover the format from source

- [ ] **T2**: Verify `claude --print --output-format json` returns `session_id`
  - Run a one-shot test: `claude --print --output-format json "say hi"` and inspect JSON shape
  - Confirm a follow-up `claude --print --resume <session_id> --output-format json "remember anything?"` recalls the prior turn
  - Document the exact field name in the daemon source
  - Complexity: S
  - Notes: If `--resume` semantics differ from expected, document and use whatever Claude Code actually supports

### Phase 2: Daemon implementation (Sonnet executor B)

- [ ] **T3**: Write `whatsapp-claude-bridge.mjs`
  - Path: `~/.openclaw/workspace/whatsapp-bridge/whatsapp-claude-bridge.mjs`
  - Implement: config load, mailbox watch (fs.watch + 10s poll), parser (per T1 findings), allowlist filter, claude spawn (per T2 findings), session persistence, openclaw send, logging, retry/backoff per design
  - Node builtins only — NO npm install
  - Atomic writes for state files (write-tmp-then-rename)
  - Files: new file
  - Complexity: M
  - Notes: Implement `--smoke-test` and `--once` modes per design

- [ ] **T4**: Write `config.json` and ensure `sessions.json`/`state.json` initialize on first boot
  - Path: `~/.openclaw/workspace/whatsapp-bridge/{config,sessions,state}.json`
  - Resolve `openclawBin` path from `which openclaw`
  - Files: new files
  - Complexity: S

- [ ] **T5**: Write systemd user unit
  - Path: `~/.config/systemd/user/whatsapp-claude-bridge.service`
  - Per design — `After=openclaw-gateway.service`, `Restart=on-failure`, log to files under the workspace
  - Files: new file
  - Complexity: S

- [ ] **T6**: Smoke test
  - Run `node whatsapp-claude-bridge.mjs --smoke-test` with a fake mailbox entry
  - Confirm Claude Code is invoked, reply text is captured, would-be `openclaw message send` command is logged but NOT executed
  - Complexity: S

- [ ] **T7**: Enable + start systemd unit
  - `systemctl --user daemon-reload`
  - `systemctl --user enable --now whatsapp-claude-bridge`
  - Tail `journalctl --user -u whatsapp-claude-bridge -n 50` and confirm clean boot, no errors
  - Files: none
  - Complexity: S

### Phase 3: Take OpenClaw out of the LLM loop (Sonnet executor B, after T7)

- [ ] **T8**: Remove `whatsapp-router` from `bindings[]` in `~/.openclaw/openclaw.json`
  - Backup first: `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak.6`
  - Edit `bindings[]` to remove the entry whose `agentId` is `whatsapp-router`
  - Validate JSON: `jq . openclaw.json > /dev/null`
  - Restart gateway: `systemctl --user restart openclaw-gateway`
  - Confirm WhatsApp listener still attaches and **no** embedded agent boot tries to LLM-respond
  - Files: `~/.openclaw/openclaw.json`
  - Complexity: S
  - Notes: Coordinate with Sonnet executor A (Task #9) — if A's claude-cli mode investigation succeeds and they want to keep `whatsapp-router` working, T8 may be skipped or modified. CTO will reconcile.

### Phase 4: User round-trip (Bryce)

- [ ] **T9**: Bryce sends a real WhatsApp message and confirms a Claude reply
  - Try a basic message ("hi") and a tool-using message ("what's the current git status of ~/agentic-sdlc?")
  - Confirms multi-turn coherence with a follow-up
  - Out of agent control
  - Stays open until Bryce confirms

### Phase 5: Cleanup + memory

- [ ] **T10**: Update `~/.claude/projects/-home-bryce/memory/openclaw.md` (or create new memory entry)
  - Document: bridge daemon location, how to start/stop/disable, allowlist edit instructions, rollback steps
  - Update MEMORY.md index pointer
  - Agent: CTO-Opus
  - Parallel: blocked-by T9

- [ ] **T11**: Archive this change
  - Move `~/agentic-sdlc/openspec/changes/whatsapp-claude-code-bridge/` → `archive/`
  - Commit + push to `~/agentic-sdlc` GitHub
  - Agent: CTO-Opus
  - Parallel: blocked-by T10

---

## Completion Criteria

- [ ] Daemon running under systemd, restarts on failure
- [ ] Smoke test passes
- [ ] `whatsapp-router` no longer answers (binding removed) — confirmed by Bryce sending a test and getting exactly ONE reply
- [ ] Bryce confirms end-to-end round-trip with both a basic and a tool-using message
- [ ] Multi-turn session persistence verified
- [ ] Memory updated, change archived

---

## Notes

- **Sender allowlist is hardcoded to `+19184079794` initially.** If Bryce's traveling number changes (Skype number, eSIM), edit `config.json` and `systemctl --user restart whatsapp-claude-bridge`.
- **Coordination with Task #9 (Sonnet executor A)**: Both executors run in parallel. They touch independent surfaces (A configures OpenClaw auth/agents; B builds an external daemon). After both report, CTO decides whether to keep one, both, or layer them. The default position is to ship the bridge (Option 2) regardless because the tool-access feature is unique.
- **No npm deps**: per agentic-sdlc rule #9, scripts must be zero-dependency.
- **Repo discipline**: the openspec lives in `~/agentic-sdlc/openspec/`. The daemon code lives under `~/.openclaw/workspace/whatsapp-bridge/` (it's runtime infra, not framework code). It does NOT go in `~/agentic-sdlc/agents/` and definitely not in `~/languageapp/`.
