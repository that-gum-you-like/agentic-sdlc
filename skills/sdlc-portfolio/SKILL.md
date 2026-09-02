---
name: sdlc-portfolio
author: Bryce + Claude
version: 1.0.0
license: MIT
platforms: [linux]
description: "Answer roster questions (what is Bryce working on, for whom, and in what state) by shelling out to the framework's portfolio.mjs — the single versioned source of truth at portfolio.json. Use for any question about projects, clients, environments, or deploy tiers on this host."
metadata:
  hermes:
    tags: [sdlc, portfolio, roster, client, projects, telegram]
requirements:
  - node >= 18
---

Audience: **you, the Hermes agent on Telegram/CLI.** When Bryce asks anything
about what he works on — "what's the state of tally?", "which projects are
live?", "what environments exist?" — this is your procedure. The roster is a
**file**, not your memory: never answer from recollection, never guess, and
never invent a project that is not in `portfolio.json`.

## 1. Shell out — never answer from memory

The portfolio lives at `~/agentic-sdlc/portfolio.json` (git-versioned, at the
repo root — NOT under the gitignored `pm/`). The interface is
`agents/portfolio.mjs` in the same repo. Always use it; do not hand-parse the
JSON unless a verb is missing.

```bash
node ~/agentic-sdlc/agents/portfolio.mjs list                 # table: name, owner, stage, drain, environments
node ~/agentic-sdlc/agents/portfolio.mjs list --json          # machine-readable rows (name, owner, client, stage, enabled, environments)
node ~/agentic-sdlc/agents/portfolio.mjs show <name>          # one project incl. environments + tiers
node ~/agentic-sdlc/agents/portfolio.mjs status               # counts: projects, byOwner, clients, byTier, untiered
node ~/agentic-sdlc/agents/portfolio.mjs validate             # exit 0 = conforming; names the problem otherwise
```

- `list` and `show` are what you will use for almost every question.
- `status` answers "how many projects / how many customer-production envs".
- If a command exits non-zero, report its `✖` message verbatim — do not
  improvise the roster around a failing script.

## 2. Reading the roster — semantics

| Field | Meaning |
|---|---|
| `owner: self` | Nels Workshop's own project (internal or personal) |
| `owner: client` | Billable client work; `client` names the client (e.g. tally → Texas Olive Ranch) |
| `stage` | `idea` → `design` → `build` → `live` → `maintenance` → `parked` |
| `enabled` | Whether the drain timers are active for it (true = actively worked) |
| `tier` | `scratch` (dev sandbox, agent-writable) · `internal-production` (own prod) · `customer-production` (customer data — **never agent-writable**) |
| `credentialVars` | Variable NAMES only, never values |

Examples of how to phrase answers:

- "what's the state of tally?" → `show tally` and report stage, owner/client,
  and the production tier.
- "which projects are live?" → `list --json`, filter `stage === "live"`.
- "can you deploy to <env>?" → `show <name>`; if the tier is
  `customer-production`, the answer is NO without Bryce's `APPROVE <sha8>` —
  the env-guard denies it.

## 3. Read-only by default; edits only on explicit instruction

The verbs `add` and `set` **mutate** `portfolio.json`. Use them only when
Bryce explicitly asks for a change (new project, stage bump, tier change), and
prefer `set <name> <key> <value>` for a single field. After any edit, run
`validate` and report the result. Never edit the file by hand — the script
enforces the schema and refuses invalid writes.

## 4. Guardrails (hard rules)

- NEVER answer a roster question from memory — shell out to `portfolio.mjs`,
  every time. The file is the truth; a stale recollection is a hallucination.
- NEVER print or paste credential VALUES. `credentialVars` are names only;
  if a value ever appears in output, stop and report it.
- NEVER invent a project, client, environment, or tier that is not in the
  file. If Bryce names something that is not there, say it is not registered.
- NEVER weaken a tier, and never make a `customer-production` environment
  agent-writable — that is the env-guard's fail-closed boundary.
- NEVER edit `portfolio.json` directly (no raw JSON writes, no `sed`). Use the
  script's verbs or report the gap.
- If `portfolio.mjs` errors or the file fails `validate`, report the exact
  error to Bryce instead of working around it.

## Reference card

| Fact | Value |
|---|---|
| Roster file | `~/agentic-sdlc/portfolio.json` (repo root, git-versioned) |
| Interface | `~/agentic-sdlc/agents/portfolio.mjs` |
| Tiers | `scratch` · `internal-production` · `customer-production` |
| Owners | `self` (Nels Workshop) · `client` (billable, named in `client`) |
| Client example | tally → client `Texas Olive Ranch`, prod tier `customer-production`, `agentWritable: false` |
| Schema | `~/agentic-sdlc/agents/schemas/portfolio.schema.json` |