# Specs — portfolio-registry

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: specs

Covers `portfolio.json` (repo root) and `agents/portfolio.mjs` — the single
versioned answer to "what am I working on, for whom, and what state is it in."
Supersedes `level-6-autonomous-activation` T-103/T-104.

---

## REQ-001 — The roster is one versioned file at the repo root

**Statement:** The portfolio lives at `portfolio.json` in the repo root, tracked
in git, conforming to `agents/schemas/portfolio.schema.json`. It contains
business facts (name, description, owner, client, repo, path, liveUrl, stage,
enabled, cadence) and an `environments` array. It contains **no credential
values** — environments name credential *variables* only.

**Acceptance:**
- `git ls-files portfolio.json` returns the file (it is NOT under the gitignored
  `pm/`)
- Schema validation rejects: a missing `name`, a duplicate `name`, `owner`
  outside `{self, client}`, `owner: "client"` without a `client` value, a
  `stage` outside `{idea, design, build, live, maintenance, parked}`
- A test asserts no value in the file matches the framework's secret-shaped
  patterns (long base64/hex runs, `sk-`/`eyJ` prefixes); only `credentialVars`
  name-strings are permitted to look key-adjacent
- Edge case: a file that parses as JSON but is not an object, or has no
  `projects` array, is rejected with a named error rather than a stack trace

**Dependencies:** None
**Complexity:** S
**Value:** CRITICAL — every other capability in this change reads this file.

**Notes — business semantics (confirmed 2026-09-02):** **Nels Workshop is the
umbrella business for all client dev work.** Therefore `owner: "self"` means
Nels Workshop's own project (internal or personal), and `owner: "client"` means
billable client work, with `client` naming the client. Tally is a client
engagement for Texas Olive Ranch under Nels Workshop, not a personal project.
`client` stays a flat string in v1 — grouping by client is a rendering concern,
and a `clients` table is not earned until there is something to attach to it
(money, contracts, contacts), all of which are out of scope here.

---

## REQ-002 — `portfolio.mjs` exposes the full verb set

**Statement:** `agents/portfolio.mjs` provides `list`, `show <name>`,
`add`, `set <name> <key> <value>`, `status`, and `validate`. It is Node-stdlib
only, guards its CLI entry with `__isMainModule`, and exports each verb's
implementation for tests.

**Acceptance:**
- `list` prints every project with owner, stage, and enabled state; `--json`
  emits machine-readable output
- `show <name>` prints one project including its environments and their tiers
- `add` refuses a duplicate name and refuses an invalid schema, writing nothing
  in either case
- `set` rejects an unknown key and rejects a value that would fail schema
  validation, writing nothing
- `status` is read-only: a test asserts file mtime is unchanged after `status`
- `validate` exits 0 on a conforming file, non-zero with a specific message
  naming the offending project and field otherwise
- Importing the module executes no CLI side effects (rule #9, enforced by
  `four-layer-validate.mjs` Layer 5)

**Dependencies:** REQ-001
**Complexity:** M
**Value:** HIGH

---

## REQ-003 — Malformed portfolio fails validation, not runtime

**Statement:** `portfolio.mjs validate` is wired into
`agents/four-layer-validate.mjs` so a malformed or incomplete `portfolio.json`
fails the standard validation gate before it can reach a consumer.

**Acceptance:**
- `four-layer-validate.mjs` fails on a fixture portfolio with an environment
  missing its `tier`
- `four-layer-validate.mjs` passes on the real `portfolio.json`
- The failure message names the project and the missing field

**Dependencies:** REQ-002
**Complexity:** S
**Value:** CRITICAL — this is the commit-time half of the fail-closed guarantee
in `environment-tiering/REQ-002`. Without it, the only defense against a
forgotten `tier` is a runtime denial nobody sees until an agent is blocked.

---

## REQ-004 — The roster reaches the board idempotently

**Statement:** `agents/command-center-sync.mjs` projects portfolio entries onto
the Hermes kanban through the existing bridge, keyed for dedupe on the project
name, without changing the established lane mapping or the links-file format.

**Acceptance:**
- First sync creates one card per project; a second immediate sync reports zero
  created and zero moved
- A project whose `stage` is `parked` lands in the parked lane, consistent with
  `command-center-parked-lane`
- Sync failure for one project does not abort the remaining sync steps

**Dependencies:** REQ-001
**Complexity:** S
**Value:** MEDIUM

---

## REQ-005 — The real portfolio is registered, with tiers set deliberately

**Statement:** `portfolio.json` is seeded with Bryce's actual projects, each
with an explicit `stage` and `owner`, and each environment with an explicit
`tier`. `tally` is registered `owner: client`, client `Texas Olive Ranch`, with
its production environment `tier: customer-production` and
`agentWritable: false`.

**Acceptance:**
- The file contains entries for at least: agentic-sdlc, tally, linguaflow,
  willtopaint, personal-website, personal-tools, component-library, ai-gateway,
  peach-shaker-5000, cyberdeck, hermes-pilot, and `personal`
- No entry has an environment without a `tier`
- Exactly the environments Bryce confirms as holding customer data are
  `customer-production`; a test asserts tally production is among them
- Each entry's `path` exists on disk, or the entry is marked `stage: parked`

**Dependencies:** REQ-001, REQ-002
**Complexity:** M
**Value:** CRITICAL — an empty registry satisfies every other spec while
delivering nothing.

---

## Invariants

- `portfolio.json` never contains a credential value.
- A project name is unique and is the primary key used by every consumer.
- Reading the portfolio never mutates it.

## Out of Scope

- Any UI that a client logs into.
- Per-project financials, invoicing, or time tracking.
- Automatic discovery of projects by scanning `~` (the roster is curated).
