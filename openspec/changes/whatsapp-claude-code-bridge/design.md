# Design: whatsapp-claude-code-bridge

**Date**: 2026-05-01
**Author**: CTO-Opus (claude-opus-4-7)
**Status**: design

---

## Context

### Current State

- `openclaw-gateway` systemd user service is running and the WhatsApp Web listener is healthy (`Listening for personal WhatsApp inbound messages` in logs).
- Inbound WhatsApp messages are relayed to `~/.openclaw/workspace/claude-mailbox.md` (per MEMORY.md note about the OpenClaw mailbox relay).
- Outbound is sent via `openclaw message send --channel whatsapp --account default -t <number> -m <text>` (also documented in MEMORY.md).
- The OpenClaw `whatsapp-router` agent — which currently calls a (broken) LLM — sits between inbound and outbound. We bypass it with this daemon.
- Claude Code (`claude` v2.1.126) is installed at `/home/bryce/.local/bin/claude` and authenticates against Bryce's Claude Max subscription via its own keychain — invoking it does not consume Anthropic API credits.

### Problem Restatement

Add a long-running daemon that intercepts inbound WhatsApp messages from an allowlisted sender, runs them through Claude Code in headless mode (preserving per-thread session state), and sends the reply back via OpenClaw's outbound CLI — replacing the broken in-OpenClaw LLM step with a free, capable, tool-equipped Claude Code turn.

---

## Goals

- Inbound WhatsApp text from `+19184079794` produces a Claude-Code-generated reply via WhatsApp within ~15s
- Multi-turn threads stay coherent (Claude has memory of prior messages in the same conversation)
- Senders not on the allowlist are silently ignored (logged, not replied to)
- Daemon survives `claude` invocation failures and surfaces them to Bryce via the same channel ("bridge degraded")
- Daemon survives mailbox-file rotation/truncation
- Deploy/start/stop is a single `systemctl --user` command
- No npm dependencies
- Existing OpenClaw `whatsapp-router` is taken out of the loop so Bryce doesn't get two replies per message

## Non-Goals

- Web UI, multi-user, multi-device
- Multimedia (images, voice notes) — text only
- Group chat handling
- Replacing OpenClaw entirely — we still rely on it for WhatsApp Web socket + outbound `message send`
- Cost ceilings beyond `--max-budget-usd` per-message
- Hot reload of allowlist (restart on change)

---

## Design

### Overview

```
WhatsApp app on Bryce's phone
        │
        ▼
WhatsApp Web (linked +19184079794)
        │
        ▼
openclaw-gateway (existing, untouched)
        │
        ▼
~/.openclaw/workspace/claude-mailbox.md  ← appended by OpenClaw
        │  (fs.watch + 10s poll fallback)
        ▼
whatsapp-claude-bridge.mjs  ← new daemon
   │
   ├─ parse new entries since last seen offset (offset stored in state file)
   ├─ filter by sender allowlist
   ├─ resolve claude session id for this sender (sessions.json)
   ├─ spawn: claude --print --resume <sid> --max-budget-usd 1.00 \
   │              --allow-dangerously-skip-permissions \
   │              --add-dir ~ "<message body>"
   │   (capture stdout, capture --output-format json's session_id for next turn)
   ├─ append exchange to logs/YYYY-MM-DD.log
   ├─ on success: openclaw message send --channel whatsapp -t +19184079794 -m "<reply>"
   └─ on failure (3 retries, exponential): notify Bryce via WhatsApp + log error
```

### Components

#### 1. `whatsapp-claude-bridge.mjs`

**Path**: `~/.openclaw/workspace/whatsapp-bridge/whatsapp-claude-bridge.mjs`

**Responsibilities**:
- Boot: read `config.json` (allowlist, mailbox path, claude flags), `sessions.json` (sender → session id), `state.json` (mailbox byte offset last processed)
- Watch loop:
  - `fs.watch(mailboxPath)` for change events
  - Independent 10s `setInterval` poll as fallback
  - On either trigger: read mailbox from `state.offset` to EOF, parse new blocks, process each in order
- Parse: split mailbox by message-block delimiter (per OpenClaw's relay format — to be confirmed by reading the existing file)
- Process one message:
  1. Skip if sender ≠ allowlist
  2. Lookup session id; if absent, leave `--resume` off (Claude Code creates a new session)
  3. Spawn `claude --print --output-format json [--resume <sid>] --max-budget-usd 1.00 --allow-dangerously-skip-permissions --add-dir ~ -- <message>`
  4. Parse JSON output for `result` (reply text) and `session_id` (persist back to `sessions.json`)
  5. Truncate reply to WhatsApp's limit (4096 chars; chunk if longer)
  6. `child_process.spawn('openclaw', ['message', 'send', '--channel', 'whatsapp', '--account', 'default', '-t', '+19184079794', '-m', reply])`
  7. Append exchange to today's log
  8. Update `state.offset`
- Failure handling:
  - `claude` non-zero exit / timeout (60s): retry up to 3 with exponential backoff (5s, 15s, 45s)
  - `openclaw message send` non-zero: log + notify next successful loop
  - Persistent failure: send a "bridge degraded: <error>" via WhatsApp once, then back off

**CLI flags**:
- `--smoke-test`: process one synthetic mailbox entry, print would-be reply, do NOT call `openclaw message send` — for CI / first-run verification
- `--once`: one watch cycle then exit (for cron-style alternative use)
- default: long-running daemon

**No npm deps.** Node builtins only.

#### 2. `config.json`

**Path**: `~/.openclaw/workspace/whatsapp-bridge/config.json`

```json
{
  "mailboxPath": "/home/bryce/.openclaw/workspace/claude-mailbox.md",
  "senderAllowlist": ["+19184079794"],
  "outboundNumber": "+19184079794",
  "claudeBin": "/home/bryce/.local/bin/claude",
  "claudeMaxBudgetUsd": 1.00,
  "claudeAddDir": "/home/bryce",
  "claudeTimeoutSec": 60,
  "pollIntervalSec": 10,
  "openclawBin": "/usr/local/bin/openclaw"
}
```

(Actual `openclawBin` path resolved from `which openclaw` during install.)

#### 3. `sessions.json` and `state.json`

Small JSON state files written atomically (write-tmp-then-rename). `sessions.json` maps sender phone → Claude Code session UUID. `state.json` holds `{ "mailboxOffset": <bytes> }`.

#### 4. systemd user unit

**Path**: `~/.config/systemd/user/whatsapp-claude-bridge.service`

```ini
[Unit]
Description=WhatsApp ↔ Claude Code Bridge
After=openclaw-gateway.service
Wants=openclaw-gateway.service

[Service]
Type=simple
ExecStart=/usr/bin/node /home/bryce/.openclaw/workspace/whatsapp-bridge/whatsapp-claude-bridge.mjs
Restart=on-failure
RestartSec=10
StandardOutput=append:/home/bryce/.openclaw/workspace/whatsapp-bridge/logs/daemon.log
StandardError=append:/home/bryce/.openclaw/workspace/whatsapp-bridge/logs/daemon.err.log

[Install]
WantedBy=default.target
```

Enabled with `systemctl --user enable --now whatsapp-claude-bridge`.

#### 5. Take OpenClaw `whatsapp-router` out of the loop

After the bridge is running and verified, remove the WhatsApp binding for `whatsapp-router`:

In `~/.openclaw/openclaw.json`, change `bindings[]`:

```diff
  "bindings": [
-   {
-     "agentId": "whatsapp-router",
-     "match": { "channel": "whatsapp", "accountId": "default" }
-   }
+
  ]
```

(Or set the agent's model to a sentinel that returns a single space and is rate-limit-zero — but removing the binding is cleaner.) Restart `openclaw-gateway` once.

The OpenClaw mailbox relay is a separate hook (per MEMORY.md, a hook in `openclaw.json` writes inbound to `claude-mailbox.md`) — that hook STAYS so the daemon has input. Confirm during implementation.

---

## Failure Modes & Rollback

| Failure | Detection | Mitigation |
|---|---|---|
| `claude` returns non-zero | Exit code captured | Retry 3× with backoff; if all fail, send WhatsApp "bridge degraded: claude exit N"; continue |
| `claude` hangs | 60s timeout via `setTimeout + child.kill()` | Same retry path |
| Claude Max session limit hit | Specific stderr substring | Notify Bryce; pause processing for 30 min |
| `openclaw message send` fails | Exit code captured | Retry once after 5s; if still failing, log to error file (don't loop) |
| Mailbox file rotated/truncated by OpenClaw | Offset > file size on next read | Reset offset to 0, re-process recent entries (Claude session continuity prevents user-visible repeats since session-aware) — caveat: could send duplicate replies; mitigation = also persist last processed message hash, skip if seen |
| Daemon crashes | systemd `Restart=on-failure` | Auto-restart in 10s |
| Mailbox grows unbounded | Disk space concern | Out of scope; OpenClaw owns the file |
| Hostile sender slips through allowlist (number spoofing) | Telecom-level attack | Out of scope; document caveat |

**Rollback**: `systemctl --user disable --now whatsapp-claude-bridge`, restore the original `bindings[]` block from `openclaw.json.bak.5` or by re-adding it manually. Total revert is two commands.

---

## Open Questions

1. **Mailbox format** — what delimiter does OpenClaw use between message blocks? Sonnet must read the live file before parsing. If format isn't trivially parseable, we may instead poll `openclaw message read` CLI output (less efficient but more reliable).
2. **`claude --print --output-format json` schema** — confirm `session_id` field name during implementation. Fallback: `claude --print` without `--output-format` and persist a synthesized session id via `--session-id` flag if Claude Code supports it.
3. **`openclaw message send` accepts long bodies?** WhatsApp limit ~4096 chars. May need chunking.

All three are answerable by 5 minutes of inspection during implementation. None blocks the design.

---

## Security Considerations

- **Sender allowlist is the ONLY auth.** WhatsApp number spoofing is rare but possible (SIM swap). Acceptable risk for personal-machine use; explicitly NOT acceptable if this design is later reused for shared machines or production.
- **`--allow-dangerously-skip-permissions`** is on so Claude Code can actually act without prompting. This means a single text can run any command. Bryce has full agency over his own machine, but if the device is shared, this assumption breaks.
- **Logs contain message bodies** in plaintext. Acceptable for personal use; rotate / purge manually.
- **`sessions.json` is plaintext.** It contains session UUIDs, not credentials, so leak impact is bounded to "an attacker who already has shell could continue Bryce's Claude conversations" — minor.
