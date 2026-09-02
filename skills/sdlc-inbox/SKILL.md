---
name: sdlc-inbox
author: Bryce + Claude
version: 1.0.0
license: MIT
platforms: [linux]
description: "Capture a dictated non-code item (chore or note) as a schema-valid task in tasks/queue/ against a named project or the personal lane. Use whenever Bryce tells you a thing to remember, an errand, a thought, or anything that is not code work — one inbox for everything, read back by the daily heartbeat."
metadata:
  hermes:
    tags: [sdlc, inbox, chore, note, personal, telegram, task-queue]
requirements:
  - node >= 18
---

Audience: **you, the Hermes agent on Telegram/CLI.** When Bryce dictates a
non-code item — "remind me to…", "note that…", "chore: buy oat milk", "new
idea: …" — this is your procedure. The queue is a **file ledger**, not your
memory: never answer from recollection, never drop or paraphrase the item,
and never invent a project that is not in the portfolio.

## 1. Recognize what this skill captures

`sdlc-inbox` handles `chore` and `note` items only — life admin, errands,
reminders, and thoughts that belong to no codebase. Code work goes through the
normal change/queue path, never here.

| Dictation | kind | Example task file |
|---|---|---|
| An errand or task to do | `chore` | "buy oat milk and coffee beans" |
| A thought, reminder, or idea to keep | `note` | "note: granary billing question for next tally call" |

If Bryce gives you code work, tell him it belongs in a change proposal, not the
inbox — do not capture it as a chore.

## 2. Resolve the project

- If Bryce names a project, look it up in the REAL roster first:
  `node ~/agentic-sdlc/agents/portfolio.mjs list --json` — a project exists
  only if it is in that file.
- Project is in the roster → capture against it.
- Bryce names **no** project → capture against `personal`.
- Bryce names a project **not** in the roster → capture against `personal`,
  and **preserve the original text verbatim** in the description (including
  the name he used). Never reject the item, never silently drop the name, and
  never invent a portfolio entry. The heartbeat and board will read it from
  `personal`.

## 3. Write the task file

Create `tasks/queue/<id>.json` in `~/agentic-sdlc/`, schema-valid against
`agents/schemas/task.schema.json`. Every capture carries exactly this shape —
**no `files[]`, no `test_status`, no `estimatedTokens`**; a chore/note needs
none of them:

```json
{
  "id": "INBOX-20260902.174512",
  "title": "Buy oat milk and coffee beans",
  "description": "buy oat milk and coffee beans",
  "priority": "MEDIUM",
  "status": "pending",
  "kind": "chore",
  "source": "inbox:personal",
  "tags": ["inbox"],
  "createdAt": "2026-09-02T17:45:12.000Z"
}
```

Rules for the fields:

- `id` — `INBOX-<UTC yyyymmdd.HHMMSS>`; must not collide with an existing
  file in `tasks/queue/` (check before writing).
- `title` — one-line summary of the item.
- `description` — **the original dictated text, verbatim**. Never paraphrase,
  never "fix" Bryce's words.
- `priority` — `MEDIUM` unless Bryce says otherwise (`HIGH`/`LOW` only).
- `status` — always `pending`.
- `kind` — `chore` or `note` as decided in §1. **Never `code`** — the drain
  claims `kind: code` tasks for LLM agents, and a chore captured as code would
  be claimed and then fail the test gate.
- `source` — `inbox:<project>` (e.g. `inbox:personal`, `inbox:tally`). This is
  where the board and heartbeat read the project from.
- `tags` — `["inbox"]`. Add more free-form tags if useful, but keep `inbox`.
- `createdAt` — current UTC ISO 8601 timestamp.

## 4. Confirm

After writing the file, reply to Bryce briefly: `captured as <kind> under
<project>` (e.g. `captured as chore under personal`). If he named an unknown
project, say which name you routed to `personal` — he can register it in the
portfolio later.

## 5. Guardrails (hard rules)

- NEVER capture code work as a chore/note — code belongs in a change proposal.
- NEVER set `kind: code` on an inbox item — the drain would claim it.
- NEVER add `files[]`, `test_status`, or `estimatedTokens` to a captured item.
- NEVER invent a project: it must be in `portfolio.mjs list --json` or the
  item goes to `personal` with the original text preserved.
- NEVER paraphrase or shorten the dictated text in `description`.
- NEVER mark the item complete, claim it, or start doing it — the inbox is
  capture only; Bryce does the work or a future task picks it up.
- NEVER write outside `tasks/queue/`, and never reuse an existing task id.
- If the schema rejects the file, fix the file — do not bypass validation.

## Reference card

| Fact | Value |
|---|---|
| Queue | `~/agentic-sdlc/tasks/queue/<id>.json` |
| Schema | `~/agentic-sdlc/agents/schemas/task.schema.json` |
| Roster | `~/agentic-sdlc/agents/portfolio.mjs list --json` |
| Kinds | `chore` (errand/task) · `note` (thought/reminder) — never `code` |
| Project default | `personal` when unnamed or unknown (text preserved verbatim) |
| Source field | `inbox:<project>` — where the board/heartbeat read the project |
| Required fields | `id`, `title`, `description`, `priority`, `status`, `kind` |
| Explicitly absent | `files[]` · `test_status` · `estimatedTokens` |