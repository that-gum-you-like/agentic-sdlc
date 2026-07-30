# Specs — maturity-reconciliation

## REQ-001 — The conformance doc matches the filesystem

**Statement:** Every capability row in `docs/curriculum-conformance.md` whose
implementation exists on disk is marked `Solid` and names its real owner file.
The nine rows listed in the proposal move from Missing/Partial to Solid. The
section "Remaining gap list to Level-6 completion (close ONLY these, in this
order)" is removed or replaced, because all nine of its items shipped in
PRs #20–#28 and the section actively instructs a reader to rebuild them.
**Acceptance:** no row in the doc is marked `Missing` while a backticked owner
path in that row exists; the obsolete gap-list section no longer instructs
closure of shipped work; the header's Level-6 claim and the tables agree.
**Dependencies:** none
**Complexity:** S
**Value:** Stops the authoritative rubric from ordering nine redundant
re-implementations.

## REQ-002 — Evidence polarity is recorded, not inferred

**Statement:** `maturity-assess.mjs` records each evidence line's pass/fail
state at the point the check runs, rather than inferring it at render time
from a substring match on `'No '`. The renderer accepts both the explicit
`{ text, ok }` form and a plain string (falling back to the old heuristic) so
existing consumers of `assessProject()` keep working.
**Acceptance:** unit tests assert that a positive finding whose text begins
with "No " (e.g. "No dependency vulnerabilities possible") renders ✅, that a
genuine failure ("No CI/CD pipeline detected") renders ❌, and that a plain
string evidence entry still renders via the legacy heuristic.
**Dependencies:** none
**Complexity:** S
**Value:** The report stops contradicting itself, so its reader stops
discounting it.

## REQ-003 — Deploy detection recognises the framework's own pipeline

**Statement:** The Deployment & Release probe treats
`agents/deploy-runner.mjs` or a `deploy` block in `agents/project.json` as
evidence of a deploy pipeline, alongside the existing `scripts/deploy.sh`,
`deploy.sh`, and `"deploy"` npm-script checks. The Dockerfile check is
deliberately unchanged: absence of a container is a design position, not
deployment maturity, and must not be awarded credit.
**Acceptance:** unit tests assert the probe reports a deploy pipeline for a
tree containing only `agents/deploy-runner.mjs`, and still reports none for a
tree with no deploy evidence at all; the framework's own Deployment & Release
score rises above 2.0/5 without reaching 5.0/5.
**Dependencies:** REQ-002
**Complexity:** S
**Value:** Removes a false negative about a pipeline that demonstrably runs on
this host every hour.

## REQ-004 — Conformance drift cannot recur silently

**Statement:** `tests/curriculum-conformance.test.mjs` parses the doc's
capability tables and fails the suite when a row's claimed status contradicts
the filesystem: `Missing` with an existing owner path, or `Solid` with no
existing owner path. Only backticked tokens that look like repo paths count as
owners; a row passes if any referenced path exists; rows referencing only
`openspec/changes/archive/…` are skipped; `Partial` is not asserted in either
direction.
**Acceptance:** the test passes against the reconciled doc; flipping any
reconciled row back to `Missing` fails it; the parser handles decorated
statuses (`**Solid (new)**`, `Solid (fixed)`).
**Dependencies:** REQ-001
**Complexity:** M
**Value:** Applies the framework's own anti-drift doctrine to the framework's
own rubric — the doc drifted for three weeks because nothing checked it.

## REQ-005 — No credit is invented

**Statement:** This change must not raise any maturity score by tuning
weights, adding artifacts solely to satisfy a probe, or awarding points for
the deliberate absence of something. Score movement comes only from correcting
detection of capabilities that already exist.
**Acceptance:** the diff touches no scoring weights or thresholds; no
Dockerfile, lock file, or `scripts/deploy.sh` is added; Deployment & Release
remains below 5.0/5, honestly reflecting the missing containerized release
artifact.
**Dependencies:** REQ-002, REQ-003
**Complexity:** S
**Value:** Keeps the maturity number worth reading. Bryce rejected the
over-scoped competitive roadmap for the same reason: be the best at what it
is, don't game it.
