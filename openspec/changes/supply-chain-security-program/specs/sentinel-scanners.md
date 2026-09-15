# Spec: supply-chain-security-program — Evidence Scanners

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: specs
**Requirement band**: `SCS-REQ-001` – `SCS-REQ-009`

---

## Overview

Stage 1 of sentinel: the deterministic pass. Nine scanners under `agents/sentinel/` read every repo
in scope and emit normalized `Finding` records plus raw evidence. No model is involved. This stage
must be a working security scanner on its own, because Stage 2 is allowed to fail.

Every scanner exports `scan(ctx)` where every filesystem and subprocess probe arrives through
`ctx`, so the whole suite runs hermetic and offline in tests.

---

## Requirements

### SCS-REQ-001: Lockfile integrity diff

**Statement:** The system shall diff each repo's `package-lock.json` against the last scanned commit
and flag integrity-relevant changes, distinct from ordinary version churn.

**Acceptance Criteria:**
- [ ] An `integrity` hash that changed while its `version` did not → HIGH
- [ ] A `resolved` URL not on `registry.npmjs.org` → HIGH
- [ ] A package newly gaining `hasInstallScript: true` → HIGH
- [ ] A major-version jump with no corresponding `package.json` change → MEDIUM
- [ ] Edge case: a repo with no prior scanned commit records a baseline and reports no findings
- [ ] Edge case: a deleted or newly created lockfile is handled without throwing

**Dependencies:** None
**Complexity:** M
**Value:** CRITICAL
**Notes:** Covers 6 lockfiles / ~3,200 resolved entries. Reads lockfiles as data; never runs `npm install`.

---

### SCS-REQ-002: Slopsquat and typosquat detection

**Statement:** The system shall evaluate every newly added package for signals that it was invented
by a model and registered by an attacker, or named to be mistaken for a real package.

**Acceptance Criteria:**
- [ ] A package whose registry first-publish date is **after** the commit that added it → HIGH
- [ ] A package under a threshold of age, downloads, or maintainer history → MEDIUM
- [ ] A package within Levenshtein distance 1 of a package already in use → HIGH
- [ ] A private-scope name resolvable from the public registry (dependency confusion) → HIGH
- [ ] A package with no `repository` field → MEDIUM
- [ ] Edge case: registry lookup failure yields a MEDIUM "could not verify" finding, never silence
- [ ] Edge case: a legitimately new package from a known-good maintainer can be baselined

**Dependencies:** SCS-REQ-001
**Complexity:** L
**Value:** CRITICAL
**Notes:** The highest-priority novel vector for this setup — agents add dependencies unattended
every 15 minutes across five repos. Registry metadata reads are the one permitted outbound call;
they send only a package name, never source or graph.

---

### SCS-REQ-003: Install-script audit

**Statement:** The system shall enumerate every `preinstall`, `install`, `postinstall`, and
`prepare` script across the resolved dependency tree and flag any not on a reviewed allowlist.

**Acceptance Criteria:**
- [ ] A new unallowlisted install script → HIGH
- [ ] An allowlisted package whose script body hash changed → HIGH
- [ ] The report states the total count of install-capable packages per repo
- [ ] Edge case: an empty allowlist on first run produces a reviewable inventory, not 800 HIGHs

**Dependencies:** SCS-REQ-001
**Complexity:** M
**Value:** CRITICAL
**Notes:** The single most reliable RCE path in npm. Allowlist at `agents/sentinel/install-script-allowlist.json`.

---

### SCS-REQ-004: Secret scanning including git history

**Statement:** The system shall scan every in-scope repo's working tree **and** full git history for
credentials, reporting drift against a per-repo baseline.

**Acceptance Criteria:**
- [ ] Working-tree secrets → HIGH
- [ ] History-resident secrets not in the baseline → HIGH
- [ ] Known credential-bearing locations (`ai-gateway`, `~/.hermes/.env`) report **drift only**
- [ ] No secret value is ever written to a report, a log, or a notification — only location and type
- [ ] Edge case: a repo with no commits is skipped cleanly

**Dependencies:** None
**Complexity:** M
**Value:** CRITICAL
**Notes:** Uses pinned `gitleaks`. The no-value-in-report rule is an invariant: a security report
that quotes the secret becomes the leak.

---

### SCS-REQ-005: SBOM generation and offline CVE matching

**Statement:** The system shall generate a CycloneDX SBOM per repo and match it against a locally
stored OSV database, with no network transmission of the SBOM or dependency graph.

**Acceptance Criteria:**
- [ ] An SBOM is written per repo to `pm/security-reports/sbom/`
- [ ] Known CVEs map to severity: CRITICAL/HIGH → HIGH, MODERATE → MEDIUM, LOW → LOW
- [ ] Severity is adjusted by the repo's blast-radius tier (SCS-REQ-009)
- [ ] The OSV database is read from local disk; a stale database (>7 days) is itself a MEDIUM finding
- [ ] Edge case: a repo with no lockfile is skipped with a recorded reason, not a crash

**Dependencies:** SCS-REQ-009
**Complexity:** M
**Value:** HIGH
**Notes:** `syft` → SBOM → `osv-scanner --offline`. Non-negotiable: nothing uploaded.

---

### SCS-REQ-006: Copied-source provenance

**Statement:** The system shall maintain a provenance ledger for `~/component-library` and any
shadcn-style registry content, and flag components lacking recorded provenance or whose content
changed after being copied downstream.

**Acceptance Criteria:**
- [ ] Every component is content-hashed and recorded with its origin
- [ ] A component with no recorded provenance → MEDIUM
- [ ] A hash change on a component already copied into a downstream repo → HIGH
- [ ] Edge case: a newly authored component is recordable as first-party without firing

**Dependencies:** None
**Complexity:** L
**Value:** HIGH
**Notes:** **No off-the-shelf tool can do this.** Copied source is invisible to every SCA tool by
construction, and this is precisely the surface the proposed shadcn-registry-over-MCP change would
let agents install from unattended.

---

### SCS-REQ-007: MCP server inventory and tool-description integrity

**Statement:** The system shall inventory every configured MCP server and hash its tool
descriptions, flagging additions and description changes.

**Acceptance Criteria:**
- [ ] Servers in `~/.claude.json`, `~/.claude/mcp-servers/`, and `~/.claude/plugins/installed_plugins.json` are all inventoried
- [ ] A newly appearing server → MEDIUM pending review
- [ ] A changed tool description on an existing server → HIGH (tool-poisoning signal)
- [ ] An unpinned or floating server version → MEDIUM
- [ ] Edge case: a malformed or absent config file is reported, not fatal

**Dependencies:** None
**Complexity:** M
**Value:** HIGH
**Notes:** MCP servers are arbitrary code with tool-call reach. Baseline today — `firecrawl`,
`openclaw-bridge`, Vercel — is small enough to enumerate, which is exactly why now is the time.

---

### SCS-REQ-008: CI/CD and SAST checks

**Statement:** The system shall audit GitHub Actions workflows for unpinned actions and excessive
permissions, and run an offline SAST pass including a Supabase RLS-versus-GRANT rule.

**Acceptance Criteria:**
- [ ] An action referenced by tag rather than commit SHA → MEDIUM
- [ ] `permissions: write-all` → HIGH
- [ ] `pull_request_target` combined with checkout of an untrusted ref → HIGH
- [ ] A table with RLS enabled and no reviewed GRANT → HIGH
- [ ] SAST runs with no network access
- [ ] Edge case: a repo with no workflows is skipped cleanly

**Dependencies:** None
**Complexity:** M
**Value:** MEDIUM
**Notes:** The RLS rule encodes a known trap: a policy is not a privilege, and a permissive test
harness hides it.

---

### SCS-REQ-009: Blast-radius severity weighting

**Statement:** The system shall weight finding severity by a per-repo blast-radius tier rather than
by dependency count.

**Acceptance Criteria:**
- [ ] Tiers are declared in `agents/sentinel/scope.json`
- [ ] Tier 1 (`tally`, `agentic-sdlc`, `component-library`) escalates MEDIUM → HIGH
- [ ] Tier 3 may de-escalate HIGH → MEDIUM for non-exploitable classes, never for secrets or RCE
- [ ] `~/languageapp` is read-only and never written to
- [ ] A repo absent from `scope.json` is scanned at tier 3 and reported as unclassified

**Dependencies:** None
**Complexity:** S
**Value:** HIGH
**Notes:** `peach-shaker-5000` has 857 packages and ships to nobody; `agentic-sdlc` has zero and is
executed by agents. Count-ranking sorts this exactly backwards.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: A hallucinated package is caught before it ships
**Verifies:** SCS-REQ-002
**WHEN** an agent-authored commit adds `react-use-async-hook`, and the registry reports its first
publish two days *after* that commit
**THEN** a HIGH finding is raised naming the package, the commit, and both dates
**AND** the finding cites the registry metadata as evidence

### Scenario 2: A silently poisoned lockfile is caught
**Verifies:** SCS-REQ-001
**WHEN** a `package-lock.json` diff shows an `integrity` hash change for a package whose `version`
is unchanged
**THEN** a HIGH finding is raised
**AND** it names the package, both hashes, and the commit that introduced the change

### Scenario 3: A component changes after being copied downstream
**Verifies:** SCS-REQ-006
**WHEN** a `component-library` component's content hash changes and that component is recorded as
already copied into `tally`
**THEN** a HIGH finding names both the component and every downstream repo holding a copy

### Scenario 4: Error Case — the registry is unreachable
**Verifies:** SCS-REQ-002
**WHEN** the slopsquat scanner cannot reach the npm registry
**THEN** it emits a MEDIUM "could not verify N packages" finding naming them
**AND** the run continues, other scanners complete, and no package is silently treated as clean

### Scenario 5: Edge Case — first run on a repo with no baseline
**Verifies:** SCS-REQ-001, SCS-REQ-003
**WHEN** sentinel scans a repo for the first time, with no recorded prior commit and an empty
install-script allowlist
**THEN** it records a baseline and emits a reviewable inventory
**AND** it does not emit hundreds of HIGH findings for pre-existing state

---

## Invariants

- No scanner ever writes outside `~/agentic-sdlc`. Repos under scan are read-only.
- No secret value appears in any report, log, or notification — only location and type.
- No source code, SBOM, or dependency graph is transmitted to any third party. The only permitted
  outbound call is npm registry metadata by package name.
- Every finding carries concrete evidence (`file:line`, lockfile key, or registry URL). A finding
  without evidence is a bug.
- Every scanner probe is injectable; the suite runs with no network.

---

## Out of Scope

- Remediation of any kind.
- Prompt-injection scanning of agent prompts (`red-team-tester.mjs`).
- Network egress restriction (`egress-preflight`).

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/sentinel-slopsquat.test.mjs` | `flags package published after the commit that added it` |
| Scenario 2 | `tests/sentinel-lockfile-diff.test.mjs` | `flags integrity change under unchanged version` |
| Scenario 3 | `tests/sentinel-copied-source.test.mjs` | `flags downstream-copied component whose hash changed` |
| Scenario 4 | `tests/sentinel-slopsquat.test.mjs` | `registry failure yields could-not-verify, not silence` |
| Scenario 5 | `tests/sentinel-baseline.test.mjs` | `first run records baseline without mass HIGH findings` |

---

## Next Step

Proceed to tasks phase using `openspec-continue-change`.
