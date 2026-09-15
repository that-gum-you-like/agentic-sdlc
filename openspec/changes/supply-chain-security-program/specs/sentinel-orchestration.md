# Spec: supply-chain-security-program — Orchestration & Model Pass

**Date**: 2026-09-15
**Author**: Claude (Opus 5) with Bryce
**Status**: specs
**Requirement band**: `SCS-REQ-010` – `SCS-REQ-019`

---

## Overview

Stage 2 and the run harness: how the evidence bundle reaches a model, how the two daily runs stay
comparable, and how the whole thing is bounded so it can never eat an interactive work session.

---

## Requirements

### SCS-REQ-010: Two-stage run with graceful degradation

**Statement:** The system shall run the deterministic pass first and the model pass second, and
shall produce a complete report and HIGH notification even when the model pass fails entirely.

**Acceptance Criteria:**
- [ ] Stage 1 completes and is reported independently of Stage 2's outcome
- [ ] A Stage 2 timeout, non-zero exit, or unparseable output is itself recorded as a MEDIUM finding
- [ ] `--no-model` runs Stage 1 only and is the supported CI/test path
- [ ] Stage 1 HIGH findings notify even when Stage 2 failed
- [ ] Edge case: a single scanner throwing does not abort the run; it is recorded as a failed scanner

**Dependencies:** SCS-REQ-001 – SCS-REQ-009
**Complexity:** M
**Value:** CRITICAL
**Notes:** The failure Bryce has been burned by is a scheduled job that breaks and goes quiet.

---

### SCS-REQ-011: Model pass invocation is read-only and bounded

**Statement:** The system shall invoke the model pass through `claude -p --output-format json` with
no ability to write, execute, or fetch, under a wall-clock timeout.

**Acceptance Criteria:**
- [ ] Invoked with `--allowedTools "Read Grep Glob"` and `--disallowedTools "Bash Edit Write WebFetch WebSearch"`
- [ ] Stage 2 is killed at a configurable wall-clock cap (default 10 minutes)
- [ ] The `result` field is parsed from the JSON envelope; `is_error: true` is treated as failure
- [ ] `total_cost_usd`, `num_turns`, and duration are recorded per run
- [ ] Edge case: output that is not valid JSON is recorded as a Stage 2 failure, never partially trusted

**Dependencies:** SCS-REQ-010
**Complexity:** M
**Value:** CRITICAL
**Notes:** **This CLI build has no `--max-turns`** (verified 2026-09-15: `claude --help` has zero
matches), so the tool allowlist plus wall-clock carries the bound. The allowlist also makes the
scanner structurally incapable of acting on the system it inspects.

---

### SCS-REQ-012: Evidence is screened before reaching the model

**Statement:** The system shall pass all scanned third-party content through
`screenExternalInput()` before including it in the model prompt.

**Acceptance Criteria:**
- [ ] Package descriptions, README excerpts, MCP tool descriptions, and commit messages are screened
- [ ] HIGH-severity injection matches are neutralized in the prompt, per the existing screen contract
- [ ] A screened match is itself reported as a finding
- [ ] Edge case: screening failure fails the Stage 2 pass rather than sending unscreened content

**Dependencies:** SCS-REQ-011
**Complexity:** S
**Value:** HIGH
**Notes:** Reuses `red-team-tester.mjs`'s existing export — the integrate-don't-duplicate rule. A
supply-chain scanner reads attacker-controlled text by definition.

---

### SCS-REQ-013: Model findings must be grounded

**Statement:** The system shall drop any model finding that does not cite evidence present in the
bundle.

**Acceptance Criteria:**
- [ ] Every model finding cites at least one evidence pointer resolvable in the bundle
- [ ] Unciteable findings are discarded at merge and counted in the report as "dropped (ungrounded)"
- [ ] Model findings duplicating a tool finding are merged, retaining the higher severity
- [ ] Edge case: a model finding citing a file outside scope is dropped

**Dependencies:** SCS-REQ-011
**Complexity:** M
**Value:** HIGH
**Notes:** Real findings only. A scanner that cries wolf gets muted, and then it protects nothing.

---

### SCS-REQ-014: Run comparability

**Statement:** The system shall make Run A and Run B differ only by model, so that the diff between
their findings is meaningful.

**Acceptance Criteria:**
- [ ] Both runs use the identical prompt template, scanner set, and scope
- [ ] The prompt template is hashed and recorded per run; a mismatch invalidates the cross-run diff
- [ ] Run A uses `claude-opus-5`; Run B uses `claude-fable-5-1`
- [ ] Edge case: if the two runs scanned different commits, the diff is labelled as non-comparable
      rather than presented as a model difference

**Dependencies:** SCS-REQ-011
**Complexity:** S
**Value:** HIGH
**Notes:** Keep the prompts identical apart from the model, or the comparison means nothing. The
commit-drift edge case is real: 12 hours of drain activity separates the two runs.

---

### SCS-REQ-015: Mutual exclusion and cost ceiling

**Statement:** The system shall never run two sentinel passes concurrently, and shall refuse to
start a run that would exceed a rolling daily cost ceiling.

**Acceptance Criteria:**
- [ ] An exclusive lock at `pm/.sentinel.lock` is acquired before Stage 1
- [ ] A second invocation exits non-zero with a clear message while the lock is held
- [ ] A stale lock older than twice the timeout is broken and the event reported
- [ ] A run that would exceed the rolling 24h ceiling is skipped, reported, and notified once
- [ ] Edge case: a crashed run leaves no permanently blocking lock

**Dependencies:** SCS-REQ-011
**Complexity:** M
**Value:** HIGH
**Notes:** Measured floor is ~$0.30 per invocation from session-context cache alone. Two runs/day
is a real draw on the same Max capacity Bryce uses interactively.

---

### SCS-REQ-016: Absolute tool paths

**Statement:** The system shall invoke every external scanner by an absolute path recorded at
install time, and shall fail loudly when one is missing.

**Acceptance Criteria:**
- [ ] Paths are read from `agents/sentinel/toolchain.json`
- [ ] A missing or non-executable tool produces a HIGH "scanner unavailable" finding
- [ ] No scanner is invoked by bare command name
- [ ] Edge case: a tool present but failing its `--version` check is treated as unavailable

**Dependencies:** None
**Complexity:** S
**Value:** HIGH
**Notes:** Homebrew shadowing on this host makes wrong-binary failures **silent**. A silently-wrong
security scanner is worse than an absent one.

---

## Acceptance Criteria (Scenarios)

### Scenario 1: The model pass dies and protection stays on
**Verifies:** SCS-REQ-010
**WHEN** Stage 2 exceeds its wall-clock cap and is killed
**THEN** the report is still written from Stage 1 findings, HIGH findings still notify
**AND** the report carries a MEDIUM finding recording the Stage 2 timeout

### Scenario 2: The two runs disagree and that is reported
**Verifies:** SCS-REQ-014
**WHEN** Run A (Opus 5) reports a finding that Run B (Fable 5.1) did not, on the same commits
**THEN** the Run B report's cross-model section names the finding and which model saw it
**AND** the diff is labelled comparable because both prompt hashes and commit sets match

### Scenario 3: An ungrounded model finding is dropped
**Verifies:** SCS-REQ-013
**WHEN** the model returns a finding citing a package absent from the evidence bundle
**THEN** the finding is discarded and counted as "dropped (ungrounded)"
**AND** it never reaches the report body or a notification

### Scenario 4: Error Case — overlapping runs
**Verifies:** SCS-REQ-015
**WHEN** the 18:30 run starts while the 06:30 run is somehow still holding the lock
**THEN** the second run exits non-zero without scanning
**AND** no partial report is written and no notification is sent

### Scenario 5: Edge Case — injection payload inside a scanned dependency
**Verifies:** SCS-REQ-012
**WHEN** a scanned package's description contains "ignore all previous instructions"
**THEN** the text is neutralized by `screenExternalInput()` before entering the prompt
**AND** the attempt is itself reported as a finding

---

## Invariants

- Stage 2 can never write, execute, or fetch. It reads evidence and returns findings.
- Stage 1 output is never discarded because Stage 2 failed.
- No two sentinel runs execute concurrently.
- Run A and Run B differ only by `--model`.

---

## Out of Scope

- Any use of a model to *fix* a finding.
- Provider fallback to OpenRouter for the model pass (these runs are subscription-bound by design).

---

## Test Mapping

| Scenario | Test File | Test Name |
|----------|-----------|-----------|
| Scenario 1 | `tests/sentinel-run.test.mjs` | `stage 2 timeout still reports and notifies stage 1` |
| Scenario 2 | `tests/sentinel-crossmodel.test.mjs` | `reports findings seen by one model only` |
| Scenario 3 | `tests/sentinel-run.test.mjs` | `drops model findings with no bundle evidence` |
| Scenario 4 | `tests/sentinel-run.test.mjs` | `second concurrent run refuses to start` |
| Scenario 5 | `tests/sentinel-run.test.mjs` | `screens injection payloads out of the prompt` |

---

## Next Step

Proceed to tasks phase using `openspec-continue-change`.
