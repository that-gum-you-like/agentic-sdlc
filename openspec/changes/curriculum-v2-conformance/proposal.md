# Proposal: curriculum-v2-conformance

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: proposed

---

## Problem

The Multiverse School Agentic SDLC curriculum is the authoritative specification for this framework (memory: `project_sdlc_curriculum_rubric`).
It was mirrored into `docs/curriculum/` on 2026-11-03 and has grown to **v2: seven workshops** (W1 planning, W2 autonomous workers, W3 orchestration,
W4 release management, W5 anti-pattern detection, W6 agent memory and evolution, W7 continuous improvement) plus the long-game, manic-episode,
capacity and grooming sessions. A gap analysis verified against the repo on 2026-11-03 found that the framework **already contains most of the parts**
and that the failure is wiring: capabilities are coded and tested but not on the path the autonomous loop actually runs.

Concrete examples (each verified on disk):

- `weekly-review.mjs` claims in `cron-schedule.json` to run pattern-hunt, REM sleep and behavior tests. It runs none of them (D5-04, D7-03). `pattern-hunt-output.json` was last written 2026-04-07.
- `test-behavior.mjs --drift` has no baseline file, and the baseline path is in gitignored `pm/`, so it can never be committed: the guard passes every month (D7-01).
- `review-hook.mjs check-staged` is tested but `.git/hooks/` holds only samples and the Hermes drain never calls it (D5-01). The empty-catch regex misses `catch (e) {}` (D5-02).
- `pr-auto-review.mjs` flags PRs that touch the guardrail surface and then re-reviews them as `skip` every 20 minutes. PRs #63, #64 and #66 sat open for 8 weeks (loop-health §3). The drain itself has produced no PR since 2026-09-21 and its timer is disabled.
- `docs/curriculum-conformance.md` rates these capabilities Solid; its guard test checks only that owner paths exist, not that anything is scheduled.

## Discovery

- **Files examined**: `docs/curriculum/*` (19 files), the four gap analyses (D1/D2, D3/D4, D5/D6, D7) and the loop-health audit of 2026-11-03; `agents/cycles/*.mjs`, `agents/health-check.mjs`, `agents/pr-auto-review.mjs` (exports, `hardGate`, merge sort), `agents/review-hook.mjs`, `agents/queue-drainer.mjs`, `agents/seed-queue*.mjs`, `agents/red-team-tester.mjs`, `agents/pattern-hunt.mjs`, `agents/memory-manager.mjs`, `agents/version-snapshot.mjs`, `agents/cron-schedule.json`, `tests/curriculum-conformance.test.mjs`, `openspec/changes/business-os/` (format exemplar).
- **Existing patterns**: pure exported helper + `__isMainModule` guard + node:test file per script; `runStep` helper in `monthly-review.mjs`; `readiness` gate on the seeder (business-os); human-task escalation via `notify.mjs notifyHumanTask`; `skills/<name>/SKILL.md` with a `tests/*-skill.test.mjs`.
- **Existing tests**: `tests/pr-auto-review.test.mjs`, `tests/health-check.test.mjs`, `tests/scheduler-install.test.mjs`, `tests/hermes-drain.test.mjs`, `agents/__tests__/{gates-enforce,behavior-baselines,teach-wiring,monthly-review,daily-review,injection-screening}.test.mjs`.
- **Key findings**: `pm/` is gitignored (baselines and review records need tracked or explicitly-ignored homes); the seeder has no notion of a lane, so interactive-only tasks would be claimed by the drain and block forever (the OS-business-os-1/-2 pattern); the weekly cron description over-promises.

## Proposed Solution

One change, seven capabilities, built from existing parts. **Integrate, never duplicate:** every task extends a named existing file. The work is split into two lanes. The *hermes lane*
(small, single-purpose tasks, concrete tests) is executed by the cheap OpenRouter drain. The *interactive lane* (anything that edits the machinery the drain runs on, plus decisions) is done in a
Claude Code session. A new capability, the **Claude review lane**, closes the loop for guardrail-surface PRs: cheap agents do the volume, queue what they must not merge alone, and an interactive
Claude session (Bryce's subscription, never the API) is the high-quality reviewer.

| Capability (spec) | One line |
|---|---|
| `cycles-wired` | weekly/monthly/daily cycles actually run the steps they describe; baselines tracked; erosion surfaced |
| `autonomous-path-gates` | the drain runs the commit gate, memory, tests-first, retry cap, bug scaffold; reviews feed the checklist loop |
| `release-manager` | merge order, head-merged-with-main gate, overlap deferral, CHANGELOG, dependency cycles |
| `input-safety` | injection rules and screening at every seed path; unbounded goals not seeded; red-team findings become tasks |
| `memory-evolution` | character block, emotional failure fields, memory snapshots and audit log, cross-agent learning, version history |
| `planning-templates` | rubric, personas, success metrics, agent log, project-manager, reasoning framework, quickstart honesty |
| `claude-review-lane` | flagged PRs queue once, notify once, and an interactive skill works them |

## Value Analysis

### Benefits

- The loop becomes productive again: the drain's guards (gate, memory, retry cap) exist where it runs, and flagged PRs stop wedging.
- The self-improvement loop (Find, Defeat, Teach) gets its inputs (review files) and its schedule, so lessons reach agents.
- Conformance claims become checkable: "scheduled" rows must point at a schedule.
- All of it at near-zero marginal cost: hermes-lane tasks run on free/cheap models; Claude subscription tokens are spent only on guardrail-surface PRs.

### Costs

- **Effort**: 135 tasks (5 already done), 86 hermes-lane (mostly S), 49 interactive-lane. Roughly 3 to 5 interactive sessions plus drain time.
- **Risk**: editing the review/drain machinery (mitigated by the self-modification rule and test-first interactive tasks); advisory-only new gates to avoid breaking existing repo code.
- **Dependencies**: CV-006 (lane skip in the seeder) before readiness flips; the loop-restore items CV-007..CV-010.

### Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Build to the curriculum literally (Matrix, Docker, Anthropic SDK worker, Endor) | Conflicts with standing rules (zero-dep, no OpenAI, no Anthropic API, privacy-first) |
| New standalone services for each capability | Duplicates parts that exist; the gap is wiring |
| Let the drain do all of it, including machinery | The drain would edit the code that runs it; failures are unrecoverable without a human |
| Run Claude headless for every flagged PR | Subscription is small; kept as optional, default-off CV-REQ-104 |
| Do nothing | The loop stays unproductive (0 PRs in 6 weeks), conformance doc keeps over-claiming |

### Success Metrics

| Metric | Baseline (2026-11-03) | Target | How measured |
|---|---|---|---|
| Weekly cycle steps executed | 0 of 3 (pattern-hunt, REM, behavior) | 3 of 3 each Sunday | `weekly-review` output; `pattern-hunt-output.json` mtime within 8 days |
| Behavior drift guard active | inert (no baseline) | baseline tracked, `--drift` in `npm test` | `agents/behavior-baselines.json` committed; package.json test script |
| Overdue cycle detection | none | health-check reports `process-erosion` within 1 day of a missed weekly | `tests/health-check.test.mjs` fixture + live `health-check.mjs` |
| Flagged PR time-to-resolution | 8 weeks, unresolved | under 3 days, 1 Telegram notice per PR | `pm/claude-review-queue.json` timestamps; pr-auto-review.log |
| Redundant re-review log lines per flagged PR | 1 every 20 minutes | 1 total | pr-auto-review.log |
| Drain PRs per week | 0 (last 2026-09-21) | at least 1 | `gh pr list` |
| Commit gate on autonomous path | not invoked | invoked on every drain commit | drain log contains `check-staged` |
| Conformance rows marked scheduled with schedule evidence | not checked | 100% | `tests/curriculum-conformance.test.mjs` |

### Who Benefits

Bryce (the only operator: fewer silent failures, a review queue instead of a wedge); Hermes and the cheap-model agents (gates, memory and bounded tasks reduce rework);
future Workshop OS clients (the framework they inherit is what it claims to be).

### Decision

Yes. The parts are built and tested; wiring them is the cheapest path to a productive loop and an honest conformance doc.

---

## Scope

### In Scope

- The seven capabilities, the hygiene set (dead OpenAI/Azure-OpenAI adapters, retired Paperclip code, `agents/versions/` churn) and the conformance doc/test correction.
- Phase 0 loop-restore items that gate everything (model-manager recovery, boot network ordering, PR #66, drain timer).

### Out of Scope

- Everything in "Explicitly excluded" below. Decisions listed in `tasks.md` are not decided here.

---

## Traceability

Gap ids come from the verified delta analyses (D1/D2 = W1-W2, D3/D4 = W3-W4, D5/D6 = W5-W6, D7 = W7 and syllabus). Curriculum paths are under `docs/curriculum/`.
Tasks CV-001..CV-012 and the claude-review-lane (REV) have no D-gap: they trace to `loop-health §N` and the design decision in `design.md`.

| Gap | Curriculum ref (docs/curriculum/) | REQ | Tasks |
|---|---|---|---|
| D1-03 | w2-autonomous-workers.md "Bug Tracking with OpenSpec" | CV-REQ-036, CV-REQ-035 | CV-308, CV-319 |
| D1-05 | w2-autonomous-workers.md "Bug Tracking with OpenSpec" (metrics) | CV-REQ-020 | CV-118, CV-120, CV-121 |
| D1-06 | 00-syllabus.md "Reporting and Visibility" | CV-REQ-020 | CV-118, CV-119, CV-121 |
| D1-07 | w2-autonomous-workers.md TDD, Exercise 2.0a | CV-REQ-034, CV-REQ-038 | CV-302, CV-317 |
| D1-10 | w2-autonomous-workers.md "Database Deletion Incident" | CV-REQ-038, CV-REQ-034 | CV-301, CV-317 |
| D1-12 | w1-planning-requirements.md "Requirements Reviewer" | CV-REQ-080 | CV-221, CV-222, CV-223 |
| D1-13 | w1-planning-requirements.md "User Stories" | CV-REQ-081 | CV-224, CV-225 |
| D1-14 | 00-syllabus.md Step 4 (Value Analysis) | CV-REQ-082 | CV-226, CV-227 |
| D1-15 | w2-autonomous-workers.md "Type Safety and Codebase Standardization" | CV-REQ-087 | CV-234, CV-235 |
| D3-02 | w3-agent-orchestration.md "Creating Specialist Agents" | CV-REQ-062 | CV-207, CV-208, CV-209 |
| D3-06 | w3-agent-orchestration.md "Coordination" (CoffeeTalk) | CV-REQ-083 | CV-228 |
| D3-09 | w3-agent-orchestration.md "UI Generation" | CV-REQ-084 | CV-229 |
| D3-10 | w3-agent-orchestration.md "Paperclip: Company-Level Agent Orchestration" — the Paperclip TOOL is retired (2026-09-07), its CONCEPT (org chart, reporting lines, per-agent budget + heartbeat, audit trail) is built natively | decisions-2026-11-03 CV-REQ-110 + hygiene | CV-602, CV-603, CV-701, CV-702 |
| D4-01 | w4-release-management.md "Release Manager" | CV-REQ-051 | CV-402, CV-403 |
| D4-02 | w4-release-management.md "Conflict Detection" | CV-REQ-052 | CV-404, CV-405 |
| D4-03 | w4-release-management.md "Responsibilities" | CV-REQ-050 | CV-401 |
| D4-04 | w4-release-management.md "Responsibilities" (changelog) | CV-REQ-053 | CV-406, CV-407 |
| D4-05 | w4-release-management.md "Common Issues" | CV-REQ-054 | CV-408, CV-409, CV-410 |
| D4-08 | capacity-estimation-roadmapping.md | CV-REQ-017 | CV-122 |
| D4-09 | sprint-backlog-grooming.md | CV-REQ-018 | CV-123 |
| D5-01 | w5-anti-pattern-detection.md "Senior Review Agent" | CV-REQ-030 | CV-309, CV-313, CV-314, CV-315, CV-605 |
| D5-02 | w5-anti-pattern-detection.md "Senior Developer Checklist" | CV-REQ-031, CV-REQ-037 | CV-303, CV-304, CV-305, CV-310, CV-311 |
| D5-03 | w5-anti-pattern-detection.md "Evolving Your Checklist" | CV-REQ-010, CV-REQ-031, CV-REQ-037 | CV-104, CV-305, CV-306, CV-321, CV-322 |
| D5-04 | w6-agent-memory-evolution.md "Scheduled Maintenance" | CV-REQ-010 | CV-101, CV-102, CV-103, CV-104, CV-605 |
| D5-05 | w5-anti-pattern-detection.md "Scheduling Security Reviews" (runner) | CV-REQ-063 | CV-210, CV-211 |
| D5-06 | w5-anti-pattern-detection.md "Filter All External Input" | CV-REQ-060, CV-REQ-061 | CV-201, CV-202, CV-203, CV-204, CV-205, CV-206 |
| D5-07 | w5-anti-pattern-detection.md "Language Drift" | CV-REQ-032 | CV-307, CV-312 |
| D5-08 | w5-anti-pattern-detection.md "Six Sigma for AI" | CV-REQ-019 | CV-124 |
| D5-09 | w5-anti-pattern-detection.md Cohort 4 (CBT/DBT) | CV-REQ-086 | CV-232, CV-233 |
| D6-01 | w6-agent-memory-evolution.md "Creating Rich Character Sheets" | CV-REQ-070 | CV-241, CV-242, CV-243 |
| D6-02 | w6-agent-memory-evolution-full.md "Memory Discipline" | CV-REQ-033 | CV-316 |
| D6-03 | w6-agent-memory-evolution-full.md "Teaching with Emotion" | CV-REQ-071 | CV-244, CV-245 |
| D6-05 | w6-agent-memory-evolution-full.md "Audit Logging" | CV-REQ-072 | CV-247, CV-248, CV-249 |
| D6-06 | w6-agent-memory-evolution-full.md "Cross-Agent Learning" | CV-REQ-073 | CV-246 |
| D6-07 | 00-syllabus.md "Agent Versioning" | CV-REQ-074 | CV-250, CV-251 |
| D6-08 | w6-agent-memory-evolution.md "Recognizing When to Create New Agents" | CV-REQ-075 | CV-252, CV-253 |
| D6-09 | w6-agent-memory-evolution-full.md "Coffee Talk" | CV-REQ-083 | CV-228 |
| D7-01 | w7-continuous-improvement.md "Behavior Baselines" | CV-REQ-011, CV-REQ-013 | CV-105, CV-106, CV-108, CV-109 |
| D7-02 | w7-continuous-improvement.md "Running Behavior Tests on Prompt Changes" | CV-REQ-011 | CV-107 |
| D7-03 | long-game-operating-agent-teams.md "Weekly Refactor" | CV-REQ-010, CV-REQ-014 | CV-101, CV-102, CV-103, CV-114, CV-115 |
| D7-04 | w7-continuous-improvement.md "Playwright: Automated User Testing" | CV-REQ-015 | CV-116, CV-117 |
| D7-05 | long-game-operating-agent-teams.md "FM5 Runaway Loop" | CV-REQ-035, CV-REQ-036 | CV-318, CV-319, CV-320 |
| D7-06 | long-game-operating-agent-teams.md "FM4 Process Erosion" | CV-REQ-012 | CV-110, CV-111 |
| D7-07 | long-game-operating-agent-teams.md "Weekly Refactor" 3/5/6 | CV-REQ-016 | CV-125, CV-126 |
| D7-10 | manic-episode.md "Capture Ideas" | CV-REQ-085 | CV-230, CV-231 |
| D7-11 | 00-syllabus.md "Key Tools" (discounted models) | CV-REQ-014 | CV-114, CV-115 |
| D7-15 | 00-syllabus.md "Key Tools" (/schedule, /loop) | CV-REQ-088 | CV-236 |
| D7-17 | 00-syllabus.md "Key Tools" (REA) | CV-REQ-088 | CV-236 |
| D7-18 | 00-syllabus.md "Key Tools" (personas) | CV-REQ-089 | CV-237, CV-238 |
| D7-20 | 00-syllabus.md "Maturity Model" | CV-REQ-011, CV-REQ-013 | CV-108, CV-112, CV-113, CV-604 |
| D7-21 | (framework) docs/curriculum-conformance.md honesty | hygiene | CV-605, CV-606, CV-607, CV-610 |

## Explicitly excluded

| Gap(s) | Reason |
|---|---|
| D1-01, D1-02, D3-07, D3-08, D4-07 | Would add gate logic to `review-hook.mjs` / `pr-auto-review.mjs` beyond this change (project test runs, post-commit E2E, red/blue breaker, citation checker, doc triggers). Tests already run in the drain prompt and CI. Follow-up change. |
| D1-08, D1-11, D1-19, D7-12, D3-03, D3-05, D7-09 | Need a Bryce decision, not code. Listed in `tasks.md` "Decisions needed". |
| D1-09 | Memory/load gate in `drain-supervisor.mjs`; single-drain mutex already bounds load. Deferred. |
| D1-16, D1-18, D1-20, D3-11, D5-13, D7-14, D7-15 (feature itself) | Conflict with standing rules: Google Secrets Manager, Docker/VM, Anthropic SDK/API, the Paperclip tool, Ori, `/schedule` are third-party, paid or API-key based. Only the doc note (CV-REQ-088) is kept. |
| D3-01 | Ops/committer agent superseded by drain self-commits plus CV-REQ-053 changelog. |
| D3-04 | AI-based routing tiebreak puts an LLM call in the seeding path for little value. |
| D3-12, D5-10, D5-15, D6-10 | Conceptual, cosmetic or organisational; no software artifact worth building. |
| D4-06 | Per-instance test env vars; the single-drain mutex means no parallel test collision today. |
| D5-05 (rest), D7-13 | Registering `security-engineer`/`dependency-auditor` agents and a vendor dependency review; agents absent on this host, framework is zero-dep. Only the runner part (CV-REQ-063) is in. |
| D5-12, D5-14, D7-16, D7-19 | ESLint/ZAP tooling, Escape-Escape UI feature, Superpowers (duplicates OpenSpec), claude.ai mobile (Telegram exists). |
| D6-04 | LLM summarisation inside REM sleep mutates memory; subtle, deferred. |
| D6-11 | n8n/NATS add daemons and deps. |
| D7-08 | Responsibility-boundary defeat tests; follow-up (the function-metrics helper from CV-REQ-031 is reusable). |

## Roadmap

| Phase | Name | Lane | Notes |
|---|---|---|---|
| 0 | Loop restored | prerequisites done; 7 interactive items | gates the rest; CV-006 lane skip first, then flip readiness (CV-012), enable the drain timer (CV-010) |
| 1 | Cycles wired (HIGH) | mostly hermes | the drain can start here as soon as CV-012 lands; CV-106/CV-114/CV-115 interactive |
| 2 | Input safety, Planning templates, Memory evolution | hermes, parallel by group | disjoint files; one chained test file for the template group |
| 3 | Autonomous-path gates | interactive core + hermes helpers | after Phase 1; helpers (CV-301..CV-308) can run during Phase 2 |
| 4 | Release manager | interactive (pr-auto-review) | after CV-321, serializes edits to `pr-auto-review.mjs` |
| 5 | Claude review lane | interactive core | CV-509 needs the retry cap (CV-320); CV-511/CV-512 optional and decision-gated |
| 6 | Hygiene, conformance, verification | mixed, LOW | conformance rows are downgraded first and re-upgraded only after verification |

Sequencing rule: all edits to `pr-auto-review.mjs` and `drain-prompt.md` are chained with blocked-by so two sessions never edit them at once.

## Next Step

Orchestrator review, then flip `readiness` to `ready-for-dev` (CV-012) and use `openspec-continue-change`.

## Decisions recorded 2026-11-03 (Bryce)

Moved from "excluded / needs decision" into scope — see `specs/decisions-2026-11-03.md`, tasks Phase 7:

| Gap | Decision | REQ |
|---|---|---|
| D3-10 | The Paperclip tool stays retired; its org-chart concept is built natively (reporting lines on top of existing budget.json / heartbeat timers / agent-registry / portfolio) so Workshop OS can own the roster later | CV-REQ-110 |
| D1-04 | Production error intake from **any and all** sources | CV-REQ-111 |
| D1-17 | Self-hosted VaultWarden for agent credentials, short-lived sessions | CV-REQ-112 |
| D5-11 | Strip personal data locally (Presidio in the existing `.venv`) before model calls | CV-REQ-113 |
| D6-12 | A voice per agent — output only, local TTS, respects the hardware kill-switch rule | CV-REQ-114 |

## Added 2026-11-03: agent identity on the autonomous path

Architecture review (Bryce: "look at their architecture"): the drain ran every task as one
generic worker, ignoring the queue's `agent`, each AGENT.md, agent memory and budget.json
models; the reviewer likewise ran without `sdlc-reviewer`'s identity. That is the curriculum's
W3/W6 core, present only in interactive sessions. → `specs/agent-identity.md` (CV-REQ-120..123),
tasks Phase 8. Per-agent models are opt-in after a tool-call trial (Hermes + coder-model incident).
