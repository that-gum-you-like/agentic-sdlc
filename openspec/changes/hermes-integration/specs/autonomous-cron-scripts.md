# Spec: autonomous-cron-scripts

**Date**: 2026-07-04
**Status**: specs
**Capability**: NEW

---

## Overview

Adds the five automation scripts the onboarding guide references but that do not exist, matching framework script conventions (stdlib-only, `__isMainModule`-guarded, capability-logged, each tested).

---

### REQ-003: Five Cron Scripts Exist and Match Framework Conventions

**Statement:** The system shall provide `red-team-tester.mjs`, `rag-indexer.mjs`, `health-check.mjs`, `telegram-notify.mjs`, and `document-sync.mjs` under `agents/`, each following the framework's script conventions.

**Acceptance Criteria:**
- [ ] Each file begins with `#!/usr/bin/env node` and a JSDoc usage header
- [ ] Each imports only Node stdlib + existing framework modules (`load-config.mjs`, `capability-logger.mjs`, `notify.mjs`) — **zero npm dependencies**
- [ ] Each exports a callable core (`run()` or named helpers) that returns a plain object
- [ ] Each guards its CLI entry point with `__isMainModule` — importing the module performs no I/O, prints nothing, and does not exit
- [ ] Each logs capability usage via `logCapabilityUsage()` on a real run

**Complexity:** M
**Value:** High

---

### REQ-004: Script Behaviors

**Statement:** Each script shall implement its documented behavior with graceful degradation and no destructive side effects on import.

**Acceptance Criteria:**
- [ ] `red-team-tester.mjs` scans recent agent outputs / AGENT.md prompts against an injection/alignment rule set, writes a report to `pm/red-team-reports/`, returns findings; `--notify` routes high-severity findings through `notify.mjs`
- [ ] `rag-indexer.mjs` indexes `docs/`, `openspec/`, and agent `memory/` into `pm/rag-index/`; uses local `sentence-transformers` when available and falls back to a deterministic lexical index otherwise (never throws on missing python)
- [ ] `health-check.mjs` reports `ok|degraded|down` from queue depth, budget headroom, disk free, and cron liveness; `--notify` alerts on non-ok
- [ ] `telegram-notify.mjs` sends via the Telegram Bot API over stdlib `https`; no-ops with a clear message when `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are unset
- [ ] `document-sync.mjs` hashes knowledge docs, records versions in `pm/doc-versions.json`, and flags changed docs for re-indexing

**Complexity:** M
**Value:** High

---

### REQ-005: Scripts Are Tested

**Statement:** Each script shall have automated test coverage of its core behavior and its side-effect-free import.

**Acceptance Criteria:**
- [ ] `tests/hermes-integration.test.mjs` imports each script and asserts no stdout / no process exit on import
- [ ] Return-shape assertions for each `run()`
- [ ] `telegram-notify` unconfigured → asserted no-op (no network attempt)
- [ ] `rag-indexer` asserted to produce a lexical index when python is absent
- [ ] Test suite wired into `npm test`

**Complexity:** S
**Value:** High
