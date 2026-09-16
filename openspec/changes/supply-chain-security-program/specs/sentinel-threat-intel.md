# Spec: supply-chain-security-program — Live Threat Intelligence

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: specs
**Requirement band**: `SCS-REQ-040` – `SCS-REQ-049`

---

## Overview

Added at Bryce's direction on 2026-09-15: *"make sure that we are searching the internet in each of
those scans to find compromises in the libraries or open source or languages we use in all of our
tech stacks."*

The original design was offline-only. That was right about **not uploading our data** and wrong
about **not fetching theirs**. A bulk vulnerability database answers "is there a known CVE" well and
"was this package compromised this week" not at all — and that gap is exactly the window in which
the malicious version is still installable. A scanner that is confidently silent during an active
npm incident is worse than no scanner.

This capability reconciles the two. The privacy rule was never "no network"; it was **never send our
dependency graph to a third party**. So advisories are pulled **by ecosystem** — "every npm advisory
since this date" — and matched against our inventory **locally, on this machine**. We learn what the
world knows without telling it anything about us. That is a strictly stronger position than a
commercial SCA service, which works by uploading precisely the graph we refuse to send.

---

## Requirements

### SCS-REQ-040: Pull live advisories by ecosystem

**Statement:** The system shall fetch security advisories for each ecosystem in the portfolio and
match them against the local inventory, without transmitting any package, version, or repository
name.

**Acceptance Criteria:**
- [ ] Advisories are fetched per ecosystem (`npm`, `pip`, `actions`) and incrementally by publish date
- [ ] Outbound requests carry only an ecosystem and a date — asserted by test
- [ ] Matching happens locally against the inventory
- [ ] A matched advisory cites its GHSA id, affected range, fixed version, and publish date
- [ ] Edge case: a feed that returns an HTTP error is a finding, never silence
- [ ] Edge case: an advisory for a package we do not use is ignored

**Dependencies:** SCS-REQ-001
**Complexity:** M
**Value:** CRITICAL
**Notes:** Same-day intelligence. Verified 2026-09-15: the feed returned advisories published that
same day, while the bulk offline database did not yet carry them.

---

### SCS-REQ-041: Version-range evaluation is fail-loud

**Statement:** The system shall evaluate advisory version ranges against installed versions, and
shall treat any range it cannot parse as unknown rather than as unaffected.

**Acceptance Criteria:**
- [ ] Comparators `<`, `<=`, `>`, `>=`, `=` and comma-separated AND ranges are supported
- [ ] Prerelease versions sort below their release
- [ ] An unparseable range yields **no** finding **and** an explicit "could not evaluate" record
- [ ] Unevaluated ranges are reported so a human can check them by hand
- [ ] Edge case: a 16.x version must not match a 15.x range

**Dependencies:** SCS-REQ-040
**Complexity:** M
**Value:** CRITICAL
**Notes:** Implemented dependency-free — adding an npm dependency to the supply-chain scanner would
be self-defeating. The real Next.js advisory (GHSA-2xp9-vwfh-vxw4, ranges `>= 10.0.0, < 15.5.24`
and `>= 16.0.0, < 16.3.3`) is a permanent regression fixture, including the patched version that
must **not** match.

---

### SCS-REQ-042: Known-exploited vulnerabilities escalate

**Statement:** The system shall cross-reference matched advisories against the CISA
known-exploited-vulnerabilities catalogue and escalate any match to HIGH regardless of its score.

**Acceptance Criteria:**
- [ ] The KEV catalogue is fetched each run
- [ ] A matched CVE on the KEV list is HIGH even when the advisory is rated low
- [ ] The finding says plainly that it is being actively exploited
- [ ] KEV fetch failure is a finding, and advisory matching still proceeds without it

**Dependencies:** SCS-REQ-040
**Complexity:** S
**Value:** HIGH
**Notes:** A CVSS score estimates how bad it could be; KEV membership is evidence that someone is
already doing it. The second fact should outrank the first.

---

### SCS-REQ-043: Ecosystem and runtime coverage

**Statement:** The system shall cover every ecosystem and language runtime the portfolio actually
uses, and shall report any ecosystem it could not check.

**Acceptance Criteria:**
- [ ] npm (all JS/TS projects), pip (the framework's Python tooling), GitHub Actions are covered
- [ ] Runtime-level advisories (Node.js itself) are checked, not only libraries
- [ ] An ecosystem present in the portfolio but absent from the configured list is reported
- [ ] Per-ecosystem fetch results are recorded in the evidence bundle

**Dependencies:** SCS-REQ-040
**Complexity:** M
**Value:** HIGH
**Notes:** "Languages we use", per Bryce's ask — not just npm packages.

---

### SCS-REQ-044: Model-pass web search for unindexed incidents

**Statement:** The system shall allow the model pass read-only web access to investigate incidents
that have not yet reached a structured advisory feed, under guardrails that keep it a reader.

**Acceptance Criteria:**
- [ ] Stage 2 may use read-only web search/fetch; it still cannot write, edit, or execute
- [ ] Search queries are ecosystem- and incident-shaped, not enumerations of our private packages
- [ ] Any finding from web content must still cite evidence and survive the grounding filter
- [ ] Retrieved web content passes through `screenExternalInput()` before reaching the model
- [ ] Search failure degrades the run to feed-only and is recorded, never silent

**Dependencies:** SCS-REQ-011, SCS-REQ-012, SCS-REQ-013
**Complexity:** M
**Value:** HIGH
**Notes:** This relaxes the original read-only-and-offline stance for Stage 2, deliberately. The
guardrail that actually matters is retained: the model can **read** but never **act**. Retrieved
content is attacker-influenceable by definition, which is why screening and grounding are
prerequisites rather than nice-to-haves.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: A same-day advisory is caught
**Verifies:** SCS-REQ-040
**WHEN** an advisory affecting an installed package is published today
**THEN** the run reports it with its GHSA id, range, and fixed version
**AND** no package or repository name appeared in any outbound request

### Scenario 2: A patched version is not reported
**Verifies:** SCS-REQ-041
**WHEN** a repo runs a version at or above the first patched version
**THEN** no finding is produced for that repo

### Scenario 3: Actively-exploited outranks the score
**Verifies:** SCS-REQ-042
**WHEN** a matched advisory is rated low but its CVE is on the KEV list
**THEN** the finding is HIGH and says it is being actively exploited

### Scenario 4: Error Case — the feed is unreachable
**Verifies:** SCS-REQ-040
**WHEN** the advisory feed cannot be reached
**THEN** a finding records which ecosystems went unchecked
**AND** the run continues with the offline database and the other scanners

### Scenario 5: Edge Case — an unparseable range
**Verifies:** SCS-REQ-041
**WHEN** an advisory carries a version range the evaluator cannot parse
**THEN** no confident finding is emitted
**AND** the package is listed as "could not evaluate" for manual review

---

## Invariants

- No package name, version, repository name, or dependency graph is ever transmitted. Outbound
  requests carry an ecosystem and a date.
- An unparseable range means unknown, never safe.
- A feed failure is always visible in the report.
- The model pass may read the web; it may never write, edit, or execute.

---

## Out of Scope

- Paid or account-bound threat-intelligence services.
- Any service that requires uploading an SBOM or dependency graph.
- Automatic remediation of a matched advisory.

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/sentinel-advisory-feed.test.mjs` | `matches an affected package and cites the advisory` |
| Scenario 2 | `tests/sentinel-advisory-feed.test.mjs` | `an unaffected version produces nothing` |
| Scenario 3 | `tests/sentinel-advisory-feed.test.mjs` | `a KEV-listed CVE escalates above its CVSS severity` |
| Scenario 4 | `tests/sentinel-advisory-feed.test.mjs` | `a feed failure becomes a finding, not silence` |
| Scenario 5 | `tests/sentinel-advisory-feed.test.mjs` | `an unparseable range is UNKNOWN, never "not affected"` |
| Privacy   | `tests/sentinel-advisory-feed.test.mjs` | `outbound requests never carry our package names` |

---

## Next Step

Proceed to tasks phase using `openspec-continue-change`.
