# Spec: replay-regression-suite

**Date**: 2026-05-27
**Status**: specs
**Capability**: NEW

---

## Overview

Defines a corpus-driven replay regression suite that runs on every PR, blocking merge on behavioral regression from prompt or adapter changes.

---

## Requirements

### REQ-001: Corpus Schema Defined

**Statement:** The system shall define a JSON schema for replay corpus entries covering agent, scenario, input, expected output, tolerance config, and critical substrings.

**Acceptance Criteria:**
- [ ] `tests/replay-corpus/SCHEMA.md` exists with field-by-field documentation
- [ ] Fields: `agent`, `scenario`, `capturedAt`, `input{system, messages, model}`, `expected{content, toolCalls}`, `tolerance{type, threshold}`, `criticalSubstrings[]`
- [ ] Schema permits both deterministic (substring) and fuzzy (embedding/LLM-judge) checks

**Complexity:** S
**Value:** Medium

---

### REQ-002: Seed Corpus With 5 Traces

**Statement:** The system shall ship with 5 seed replay traces covering distinct agent roles to bootstrap the suite.

**Acceptance Criteria:**
- [ ] At least 5 `tests/replay-corpus/*.json` files exist
- [ ] Each represents a different agent role (e.g. backend, frontend, reviewer, release, docs)
- [ ] Each conforms to REQ-001 schema

**Complexity:** M
**Value:** High

---

### REQ-003: Replay Harness Runs Offline

**Statement:** The replay harness shall execute without any live LLM calls, using captured responses as the transport layer.

**Acceptance Criteria:**
- [ ] `tests/replay.test.mjs` exists
- [ ] Adapter transport is stubbed via dependency injection or env-flagged mock
- [ ] Running `npm run test:replay` with no network access succeeds
- [ ] Zero LLM API charges during a replay run

**Complexity:** L
**Value:** Critical

---

### REQ-004: Failure Diff Is Actionable

**Statement:** On a replay failure, the harness shall emit a diff file at `pm/replay-diff/<scenario>.diff` showing expected vs. actual, similarity score (if applicable), and a recommended next step.

**Acceptance Criteria:**
- [ ] Diff file is created on every failure
- [ ] Side-by-side or unified-diff format (human-readable)
- [ ] Includes tolerance score if a fuzzy comparator was used
- [ ] Includes a "recommended next step" line ("re-capture if intentional, otherwise revert")

**Complexity:** M
**Value:** High

---

### REQ-005: CI Job Required on main

**Statement:** The replay suite shall run as a required CI check on every PR targeting `main`.

**Acceptance Criteria:**
- [ ] `.github/workflows/test.yml` contains a `replay-regression` job
- [ ] Job runs `npm run test:replay`
- [ ] `main` branch protection lists `replay-regression` as a required status check

**Complexity:** S
**Value:** Critical

---

### REQ-006: Corpus Curation Documented

**Statement:** The system shall document how to capture new corpus entries from live OTel spans (post `cost-tracker-otel`) or manual runs.

**Acceptance Criteria:**
- [ ] `docs/replay-regression.md` exists
- [ ] Step-by-step workflow for capturing a new trace from `pm/otel-spans.jsonl`
- [ ] Guidance on tolerance selection (when to use substring vs. embedding vs. LLM judge)
- [ ] Guidance on diagnosing a replay failure

**Complexity:** S
**Value:** Medium
