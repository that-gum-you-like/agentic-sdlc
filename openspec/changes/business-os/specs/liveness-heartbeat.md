# Specs — liveness-heartbeat

**Date**: 2026-09-02
**Author**: Claude (Opus 5) with Bryce
**Status**: specs

Covers `agents/heartbeat.mjs`, its timer, and the `daily-review.mjs` dashboard
defect. **Governing principle: silence must never be ambiguous.** The system was
off for 32 days and nothing said so.

---

## REQ-001 — A daily heartbeat is delivered even when nothing is wrong

**Statement:** `agents/heartbeat.mjs` composes and sends one Telegram message
per day via `notify.mjs`, reporting: timers running vs expected, drain ticks in
the last 24h, PRs merged, open deploy approvals, blocked tasks, open
`chore`/`note` items, today's spend, and any health-check degradation. It is
sent on nominal days too.

**Acceptance:**
- A fixture with everything nominal still produces a message
- Anything abnormal appears first in the message body, before nominal counts
- The message is a single Telegram message, not one per section
- Unit test composes the message from fixtures without network access

**Dependencies:** `portfolio-registry/REQ-001`
**Complexity:** M
**Value:** CRITICAL

---

## REQ-002 — A failed heartbeat is itself visible

**Statement:** `heartbeat.mjs` exits non-zero when it cannot deliver, so a
delivery failure surfaces in `systemctl --user --failed` rather than vanishing.

**Acceptance:**
- Delivery failure → non-zero exit and a message on stderr naming the provider
  error
- Successful delivery → exit 0
- The unit has no `Restart=` loop that would mask repeated failure
- Edge case: a partial data-collection failure (e.g. `gh` unavailable) still
  sends a message, degraded, marking the unavailable section rather than
  aborting the send

**Dependencies:** REQ-001
**Complexity:** S
**Value:** CRITICAL — a liveness signal that fails silently reproduces the
original defect one level up.

---

## REQ-003 — The heartbeat reconciles the portfolio against reality

**Statement:** The heartbeat flags portfolio entries that have drifted: a `path`
that no longer exists, a repo whose git HEAD has not moved in a configurable
number of days while `stage` is `build`, or `enabled: true` on a project with no
drain activity.

**Acceptance:**
- Each drift condition is unit-tested against a fixture portfolio
- Drift findings appear in the message, capped to a readable number with an
  overflow count
- A clean portfolio produces no drift section at all

**Dependencies:** REQ-001, `portfolio-registry/REQ-005`
**Complexity:** M
**Value:** HIGH — the design rates "the portfolio becomes another lying
dashboard" as the highest-likelihood risk in the change, on the direct evidence
of `pm/DASHBOARD.md`. This requirement is that risk's mitigation.

---

## REQ-004 — The daily review actually updates the dashboard

**Statement:** `agents/cycles/daily-review.mjs` updates `pm/DASHBOARD.md`'s
last-updated date and records an activity entry. The current implementation
replaces `/\*\*Last Updated:\*\* .*/` (capital U) while the file contains
`**Last updated:**`, so the date has read 2026-04-07 since April; its activity
insert targets a `## Recent Activity` heading the file does not have.

**Acceptance:**
- After a daily-review run, `pm/DASHBOARD.md` contains today's date
- Regression test asserts the written content — not merely that the file was
  written, which is what passed while the bug was live
- The activity entry lands in a heading that exists in the file
- A dashboard missing the expected headings is reported on stderr rather than
  silently no-op'd

**Dependencies:** None
**Complexity:** S
**Value:** HIGH

---

## REQ-005 — The heartbeat timer is installed through the existing generator

**Statement:** A `heartbeat` entry is added to `agents/cron-schedule.json` and
installed by `agents/scheduler-install.mjs`, producing
`sdlc-sched-heartbeat.{service,timer}` consistent with the existing 19 units,
including `EnvironmentFile=-%h/.hermes/.env`.

**Acceptance:**
- `scheduler-install.mjs install` generates the unit with the same PATH,
  `WorkingDirectory`, and `EnvironmentFile` shape as its siblings
- Its `OnCalendar` minute avoids `{0,15,30,45}` per the collision rule
  established in `mission-intake/REQ-002`
- `scheduler-install.mjs` tests still pass

**Dependencies:** REQ-001
**Complexity:** S
**Value:** MEDIUM

---

## Invariants

- Exactly one heartbeat message per day; the heartbeat never becomes a stream.
- The heartbeat reports observed state, never state read back from a file the
  heartbeat itself wrote.
- No secret value ever appears in a heartbeat message.

## Out of Scope

- Alerting escalation, paging, or on-call rotation.
- A second "everything is fine" channel (desktop popups already exist).
- Replacing `health-check.mjs`; the heartbeat consumes its result.
