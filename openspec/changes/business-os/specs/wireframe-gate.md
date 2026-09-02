# Specs — wireframe-gate

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: specs

Covers the design step inserted into `docs/MISSION_PLAYBOOK.md` between
requirements and build-task seeding, and the environment-pair changes to
`mission-bootstrap.mjs`.

**Governing principle: reuse is decided at the moment the UI is chosen**, not
audited afterward — and a client should see the shape of the thing before it is
built.

---

## REQ-001 — Component-library search runs before any UI is designed

**Statement:** The mission agent runs
`node ~/component-library/bin/search.mjs <keywords>` before producing a
wireframe, and records hits and misses in the mission's design artifact.

**Acceptance:**
- The playbook makes the search a numbered, non-optional step preceding the
  wireframe
- The recorded artifact names each searched keyword and the component ids found
- On a hit, the wireframe references the existing component by id rather than
  inventing an equivalent
- On a miss, the artifact says so explicitly, so the contribute-back path in the
  `component-library` skill is reachable
- Edge case: the library being unreachable is recorded as "not consulted" and
  the mission continues — it never silently reads as "no matches"

**Dependencies:** None
**Complexity:** S
**Value:** HIGH

---

## REQ-002 — A wireframe exists and is delivered before build tasks are seeded

**Statement:** The mission agent produces a wireframe committed to the new repo
under `design/`, delivers it to Telegram as an image via
`telegram-notify.mjs sendDocument`, and **stops**. Build tasks are seeded only
after Bryce replies affirmatively.

**Acceptance:**
- `tasks/queue/` is empty until the wireframe artifact exists in the repo
- The playbook's numbering is updated: the design step becomes §4, task seeding
  §5, report §6
- The wireframe reaches Telegram as a viewable image, not a raw file path
- Edge case: if delivery fails, the mission halts with a reported error rather
  than proceeding to seed tasks unreviewed
- Edge case: an ambiguous or absent reply is not treated as approval

**Dependencies:** REQ-001
**Complexity:** M
**Value:** CRITICAL — this is the step that makes the pipeline sellable to
someone other than Bryce.

---

## REQ-003 — Missions provision a staging + production pair

**Statement:** `agents/mission-bootstrap.mjs` provisions two environments rather
than one, and registers both in `portfolio.json` with explicit tiers: staging
`scratch`, production `internal-production`.

**Acceptance:**
- A bootstrapped mission appears in `portfolio.json` with exactly two
  environments, each with a tier
- No bootstrap path can produce a `customer-production` environment
- `--dry-run` prints the two environments and writes nothing
- Bootstrap remains idempotent: a second run neither duplicates the portfolio
  entry nor re-provisions the databases
- Existing `mission-bootstrap` tests pass unmodified

**Dependencies:** `environment-tiering/REQ-001`, `portfolio-registry/REQ-002`
**Complexity:** M
**Value:** CRITICAL

---

## REQ-004 — Client ownership is explicit, promotion is a reviewed commit

**Statement:** `mission-bootstrap.mjs --client <name>` marks the portfolio entry
`owner: client`. Promotion of any environment to `customer-production` is a hand
edit to `portfolio.json`, never a bootstrap flag and never inferred from
`--client`.

**Acceptance:**
- `--client "Acme"` produces `owner: "client"`, `client: "Acme"`, and still
  provisions `scratch` + `internal-production`
- No code path writes the string `customer-production` into `portfolio.json`
- A test asserts that `--client` alone does not change any tier

**Dependencies:** REQ-003
**Complexity:** S
**Value:** CRITICAL — the moment a project starts holding someone else's data is
a business decision, and it should leave a diff with a date and a message.

---

## REQ-005 — The playbook's existing guardrails survive the rewrite

**Statement:** Rewriting `MISSION_PLAYBOOK.md` preserves every hard rule it
already encodes, including the 2026-07-27 incident rules (never create scheduler
entries; always `pwd` before scaffolding; never commit `.env.local`; never
deploy manually).

**Acceptance:**
- A test or checklist asserts each pre-existing guardrail string is still
  present after the rewrite
- Section renumbering does not orphan any cross-reference from
  `mission-intake/REQ-003` or `REQ-006`

**Dependencies:** REQ-002
**Complexity:** S
**Value:** HIGH — those rules exist because each one already went wrong once.

---

## Invariants

- No build task is seeded for a mission with no approved wireframe.
- The component library is searched before UI is authored, every time.
- A mission is never born `customer-production`.

## Out of Scope

- Building the wireframe editor (the `/design` workspace already exists).
- Client review workflows, comment threads, or approval UIs beyond Telegram.
- Design-system or visual-identity work for client brands.
