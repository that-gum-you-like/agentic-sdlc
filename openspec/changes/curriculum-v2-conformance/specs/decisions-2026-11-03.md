# Spec: decisions-2026-11-03

Capabilities Bryce brought into scope on 2026-11-03 (proposal § Decisions recorded). Band 110-119.
All local / self-hosted. Zero new npm dependencies; Python only inside the existing `.venv`.

## CV-REQ-110 — Native org chart (the Paperclip concept, not the tool)
Each agent declares `reportsTo` (an agent name or `board` = Bryce) and optional `delegatesTo[]` in
`agents/<name>/AGENT.md` front matter / `agents/templates/AGENT.md.template`; `agents/agent-registry.mjs`
exposes the tree; escalation in `agents/SHARED_PROTOCOL.md` routes to `reportsTo` before the board.
- WHEN `agent-registry.mjs org` runs THEN it prints the tree rooted at `board`, and exits 1 on a cycle or an unknown `reportsTo`.
- WHEN an agent has no `reportsTo` THEN it reports to `board` (default, never an error).
- WHEN a task escalates THEN the human-task names the `reportsTo` chain it walked.

## CV-REQ-111 — Production error intake from all sources
`node agents/seed-queue.mjs report-error` accepts error events from any source (stdin JSON lines,
a log file path, or a source adapter), dedups by `notify.errorSignature()`, and writes/updates one
`prod-error-<hash>` task whose priority rises with frequency. Source adapters: generic JSONL/stdin,
journalctl, Vercel runtime logs (`vercel logs`), Supabase logs; each project lists its sources in
`portfolio.json` (`errorSources[]`).
- WHEN the same error arrives 50 times THEN exactly one task exists, with `occurrences: 50`.
- WHEN occurrences cross 10 / 100 THEN priority rises to HIGH / CRITICAL.
- WHEN error text contains an injection pattern THEN it is screened by `screenExternalInput` before it reaches any task (CV-REQ-06x).
- WHEN error text contains personal data THEN it is scrubbed (CV-REQ-113) before it is written.

## CV-REQ-112 — VaultWarden for agent credentials
`agents/secrets.mjs get <NAME>` resolves a credential from a self-hosted VaultWarden via the `bw` CLI
using a short-lived session (default 60 min), falling back to the current env/.env resolution so
nothing breaks before the vault exists. Values are never logged or written to disk.
- WHEN the vault is unreachable or `bw` is absent THEN the env fallback is used and a warning names the source, never the value.
- WHEN the session is older than its TTL THEN it is re-unlocked, not reused.

## CV-REQ-113 — Personal data stripped before model calls
`agents/pii-scrub.py` (Presidio, local, in `.venv`) with a Node wrapper `agents/pii-scrub.mjs`
replaces names, emails, phones, addresses, government ids and card numbers with typed placeholders
before any prompt leaves the machine through `agents/adapters/llm/*.mjs`. The Hermes drain's own
calls are covered by the design decision in design.md (local proxy) — interactive lane.
- WHEN a prompt contains `jane@example.com` THEN the outbound text contains `<EMAIL>` and not the address.
- WHEN Presidio is unavailable THEN the call is refused for projects tiered `customer-production` and warned (not refused) for `scratch`.

## CV-REQ-114 — A voice per agent (output only)
`core.json` `character.voice` names a local TTS voice (Piper); `agents/speak.mjs <agent> <text>` renders
audio locally and plays it or attaches it to a Telegram message. Output only: no microphone,
no wake word (hardware kill-switch rule).
- WHEN an agent has no `character.voice` THEN a default voice is used.
- WHEN `speak.mjs` runs THEN no network call is made for synthesis.
