# Proposal: whatsapp-claude-code-bridge

**Date**: 2026-05-01
**Author**: CTO-Opus (claude-opus-4-7)
**Status**: proposed (pivoted 2026-05-01)

---

## Pivot Note (2026-05-01, post-build)

The original proposal called for `claude --print` (Claude Code headless) as the LLM backend, on the theory that this would reuse Bryce's $100/mo Claude Max subscription at zero marginal cost. **This turned out to be wrong**: Anthropic now bills third-party app invocations of Claude Code (including headless `--print` mode spawned from another process) against "extra usage" / API credits, not the Max plan. Bryce's API balance is $0 and he refuses to pay. So the daemon shell stays as designed but the LLM backend pivots to **Groq `llama-3.3-70b-versatile`** (Meta-owned, free tier, OpenAI-compatible API, fully ToS-clean, aligned with Bryce's no-OpenAI / privacy-first rules). The "remote control via Claude Code tools" feature regresses to "smart chat replies only" — agents that run commands on Bryce's machine via WhatsApp will need a separate v2 design (likely Llama-with-tool-calling or returning to Claude after he funds API).

The unchanged parts: mailbox watcher, sender allowlist, atomic state, retry/backoff, openclaw outbound, systemd unit. Only the LLM call function and the session-storage schema (Groq is stateless API → in-memory message-history per sender) change. See Executor C's task description for the surgical diff.

---

## Problem

Bryce needs WhatsApp ↔ Claude for a week while away from his computer. The current pipeline (`openclaw` → `whatsapp-router` agent → Anthropic API) is doubly broken:
1. OpenRouter account is out of credits (HTTP 402) — fixed by `whatsapp-router-provider-swap`
2. Both Anthropic credentials in OpenClaw's store are also dead — OAuth token expired (401), API key has $0 balance ("credit balance too low")

Bryce will not pay for API credits — he already pays $100/mo for Claude Max, and the messaging pipeline must reuse that subscription rather than billing a separate API account.

Beyond mere replies, Bryce wants WhatsApp to be a **remote control**: while away, he should be able to text "deploy LinguaFlow", "is the certify suite green?", "summarize today's git activity", and have an actual capable agent execute those things on his machine — not just chat.

---

## Discovery

- **Files examined**:
  - `~/.openclaw/openclaw.json` — current `whatsapp-router` agent config and bindings
  - `~/.openclaw/workspace/claude-mailbox.md` — already-existing relay file where OpenClaw writes inbound WhatsApp messages (per `MEMORY.md`: "Bryce's WhatsApp messages are relayed to `/home/bryce/.openclaw/workspace/claude-mailbox.md` by the OpenClaw agent")
  - `journalctl --user -u openclaw-gateway` — gateway is healthy; only the LLM step fails
  - `which claude && claude --version` → `/home/bryce/.local/bin/claude` v2.1.126 (Claude Code) — installed and uses the Claude Max subscription auth automatically
  - `claude --help` — `--print/-p` non-interactive mode, `--resume <session>` for multi-turn, `--max-budget-usd`, `--allowedTools`, `--allow-dangerously-skip-permissions`, `--add-dir` all available
- **Existing patterns**:
  - OpenClaw mailbox relay already writes inbound WhatsApp to a file (no need to invent message capture)
  - `openclaw message send --channel whatsapp -t +<phone> -m "..."` already works and was used in prior `done` checklists (see MEMORY.md)
  - systemd user units already host `openclaw-gateway` — same pattern fits a sibling daemon
- **Existing tests**: None in this surface. Verification is operational.
- **Key findings**:
  - We can completely sidestep OpenClaw's LLM step by intercepting messages at the mailbox file and replying via `openclaw message send`. The OpenClaw `whatsapp-router` agent itself can be left disabled or set to a no-op model — this daemon takes its place.
  - Claude Code's `--print` mode reuses Claude Max auth automatically — zero per-message cost on top of Bryce's $100/mo.
  - Each `claude --print` invocation is a fresh process, so multi-turn requires session persistence (`--continue` or `--resume`). We'll key sessions by WhatsApp thread ID so a back-and-forth feels coherent.

---

## Proposed Solution

A small Node.js daemon (`whatsapp-claude-bridge.mjs`) running as a systemd user service. It:

1. **Watches** `~/.openclaw/workspace/claude-mailbox.md` (filesystem watch + 10s poll fallback)
2. **Parses** new inbound message blocks (timestamp, sender, body)
3. **Allowlists** sender — only `+19184079794` (Bryce) is processed; everyone else is logged and ignored
4. **Resolves a Claude Code session ID** for the thread (one session per sender, persisted in `~/.openclaw/workspace/whatsapp-bridge/sessions.json`)
5. **Invokes** `claude --print --resume <session-id> --max-budget-usd 1.00 --add-dir ~ "<message body>"`
6. **Captures** stdout (the reply)
7. **Sends** the reply back via `openclaw message send --channel whatsapp -t +19184079794 -m "<reply>"`
8. **Records** the exchange in a per-day log file for audit
9. **Notifies** Bryce of unrecoverable errors via the same WhatsApp channel ("bridge is degraded")

Once the daemon is running, the existing OpenClaw `whatsapp-router` agent can be set to a sentinel/null model OR removed from `bindings[]` so OpenClaw doesn't try to LLM-respond on its own.

---

## Value Analysis

### Benefits

- **Zero new ongoing cost.** Reuses Claude Max ($100/mo Bryce already pays). Side-steps both the dead Anthropic API key and the gray-area OAuth-token-as-API-key dance.
- **Full Claude Code power on every text.** Bryce gets bash, file edits, git, web fetches, sub-agents, and MCP tools (including OpenClaw's own MCP) responding to WhatsApp. "Deploy LinguaFlow" actually works.
- **Multi-turn coherence.** Session persistence per sender means a thread of texts feels like a real conversation, not 20 independent prompts.
- **No ToS gray area.** Claude Code is a first-party Anthropic app using Max auth as designed. We're just routing input/output around it.
- **Decouples from OpenClaw's LLM lifecycle.** If OpenClaw upgrades, breaks, or changes its agent runtime, the bridge still works because it only uses OpenClaw's mailbox + `message send` CLI.
- **Auditable.** Every exchange logged. Every command Claude runs is in Claude Code's transcript.

### Costs

- **Effort**: Medium. ~150–250 LOC of Node, plus a systemd unit. ~1.5–2 hours of Sonnet executor time including tests.
- **Risk**:
  - **Security blast radius**: Any text from an allowlisted number triggers Claude Code with full machine access. Mitigated by hard-coded sender allowlist and `--max-budget-usd` cap. Phone-number-based auth is weaker than 2FA — if Bryce's SIM is hijacked, the attacker gets shell. Acceptable for personal use; would not be for production.
  - **Latency**: 5–15s per reply (Claude Code spinup + turn). Fine for SMS-paced use; explicit in the design.
  - **Claude Max rate limits**: Heavy use could hit caps. Mitigated by polling cadence (no spam) and per-message budget.
  - **Race with OpenClaw's own router**: If the existing whatsapp-router agent ever comes back to life, both would reply. Mitigated by setting it to a no-op or removing the binding once the bridge is verified.
- **Dependencies added**: Zero npm. Node builtins only (fs, child_process, path) per agentic-sdlc framework rules.

### Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Refresh OpenClaw's `anthropictoken1` OAuth token | ToS gray area (Max token used by 3rd-party app); no remote-control power-up; doesn't decouple from OpenClaw's LLM lifecycle. Worth doing as a quick fallback (Option 1 above), but not as the strategic answer |
| Add credits to Anthropic API key | Bryce explicitly said no |
| Build a Groq adapter for OpenClaw | Heavier engineering, no Claude-grade tool use; worth doing later for redundancy but not the primary path |
| Use OpenClaw `--auth-choice claude-cli` mode (if it works) | Being investigated in parallel by Sonnet research agent (Task #9). If that mode delivers Claude-Code-as-LLM-with-tools, it could replace this design. If it's just a thin LLM proxy without tool access, this design wins |

### Decision

**Build it.** Even if the OpenClaw `claude-cli` mode investigation succeeds, the bridge daemon's tool-access remote-control feature is unique enough to ship anyway. If `claude-cli` mode covers the basic-reply use case, the bridge can focus on the high-value "Bryce texts a command, machine acts" path.

---

## Scope

### In Scope

- `whatsapp-claude-bridge.mjs` daemon at `~/.openclaw/workspace/whatsapp-bridge/whatsapp-claude-bridge.mjs`
- Sender allowlist: hardcoded `+19184079794` initially, configurable via JSON next to the script
- Session persistence file `sessions.json` with `{ "<sender>": "<claude-session-id>" }`
- Daily exchange log under `~/.openclaw/workspace/whatsapp-bridge/logs/YYYY-MM-DD.log`
- systemd user unit `whatsapp-claude-bridge.service` enabled and started
- README at the daemon's directory documenting start/stop/configure
- One smoke test invocable via `--smoke-test` flag (no real WhatsApp send; uses a fake mailbox entry and prints the would-be reply)
- Disable existing OpenClaw `whatsapp-router` agent or remove its binding so it doesn't double-reply

### Out of Scope

- Web UI / dashboard for the bridge
- Per-message ACL beyond sender allowlist (e.g., "deploy" only allowed during business hours)
- Multimedia (images/voice) — text only for v1
- Group chats — DMs only
- Any change to Claude Code itself
- Claude Max rate-limit discovery / dynamic backoff (basic try/catch with notify-on-fail only)
- Encryption of `sessions.json` or logs (lives in user home, no extra controls)

---

## Next Step

If approved: proceed to design (`design.md`) and tasks (`tasks.md`), then delegate execution to a Sonnet engineering agent. Run in parallel with Task #9 (claude-cli mode research).
