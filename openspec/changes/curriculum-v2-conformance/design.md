# Design: curriculum-v2-conformance

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: design

---

## Context

### Current State

Seven curriculum workshops are mirrored in `docs/curriculum/`. The framework implements most capabilities as scripts with tests, but many are not reached from any
scheduled or autonomous entry point (see proposal.md Problem). Two execution lanes exist in practice: the Hermes drain (cheap OpenRouter models, dedicated clone, systemd timers) and interactive Claude Code
sessions (Bryce's subscription; there is no Anthropic API key).

### Problem Restatement

Wire existing, tested capabilities onto the autonomous path without letting the autonomous path rewrite itself, and give guardrail-surface PRs a reviewer that is not the cheap tier.

---

## Goals

- Every REQ is satisfied by an *invocation* proven by a test, not by a file existing.
- Each task extends a named existing file; new files are limited to templates, tests, one schema, one skill.
- Hermes-lane tasks are small, single-purpose, literal (named function, exact file, concrete test).
- Interactive-lane tasks are the only ones that edit drain/review machinery.

## Non-Goals

- No new npm dependencies, no OpenAI, no Anthropic API, no Docker, no eslint, no new daemons.
- No decision is made for Bryce (see tasks.md Decisions). No exclusion in proposal.md is built.

---

## Design

### Self-modification rule (governs everything)

The drain never modifies the machinery executing it. Files whose edit changes how the drain runs, commits, reviews or is scheduled are **Lane: interactive**:
`agents/hermes-drain.sh`, `agents/drain-prompt.md`, `agents/pr-auto-review.mjs`, `agents/queue-drainer.mjs`, `agents/review-hook.mjs` (gate logic), `agents/cron-schedule.json`,
`agents/scheduler-install.mjs`, `agents/budget.json`, `agents/model-manager.mjs`, `agents/seed-queue-from-openspec.mjs` lane check (CV-006). Enforcement is mechanical: CV-006 makes the
seeder skip `Lane: interactive` tasks (fail closed on unknown values), so an interactive task can never be claimed and left `blocked` like OS-business-os-1/-2.
Every other file is hermes lane. Pure helper functions that the machinery will later call (e.g. `scanFunctionMetrics`, `scaffoldBugChange`, `detectBlockedByCycle`) live in hermes-lane files and land first; the interactive wiring task follows.

### Capability notes (exact files and functions)

**cycles-wired.** `agents/cycles/weekly-review.mjs`: add `buildWeeklySteps`, `runWeeklySteps`, `capacityForecast`, `groomingReport`, `computePrRejectRate`, `prRejectTarget`, `architectureCheck`,
`agentMdChangedSinceSnapshot`; reuse `runStep` exported from `monthly-review.mjs` (CV-101). `daily-review.mjs`: `upsertDashboardSection` (shared by weekly), `openspecStatusTable`, `bugMetrics`, `runUserTests`.
`monthly-review.mjs`: extract `buildMonthlySteps`; add baseline re-record (only after drift passes) and `maturity-assess.mjs --report`. `health-check.mjs`: `evaluateCycleCadence` + `checkCycles` in `runHealthCheck`.
`test-behavior.mjs`: `BASELINES_PATH` moves from gitignored `pm/` to tracked `agents/behavior-baselines.json`. `scheduler-install.mjs` gains `supersededBy` and `enabled:false`; `cron-schedule.json` declares the unmanaged timers
(legacy pattern-hunt/rem-sleep timers are superseded, not duplicated, because weekly-review now runs both). `package.json` `test` script gains `test-behavior.mjs --drift`.

**autonomous-path-gates.** `review-hook.mjs install --pre-only`; `hermes-drain.sh` installs it in the clone after sync; `drain-prompt.md` calls `check-staged`, `memory-manager.mjs recall/record`, states tests-first / never-modify-committed-tests /
ambiguous-verb rules and the 3-attempt cap. New checks are advisory (fn-length, param-count) or opt-in (`allowedExtensions`), except the empty-catch regex fix, which closes a hole. `queue-drainer.mjs`: `registerFailure` (retryCount, `blocked`+human task),
`complete <id> failing` calls `scaffoldBugChange` (hermes-lane helper in `seed-queue.mjs`, readiness `draft` so it is triaged, never auto-run). `pr-auto-review.mjs`: `writeReviewRecord` -> `agents/sdlc-reviewer/reviews/<pr>.md` (gitignored runtime data) with severity tags,
read by `pattern-hunt.mjs findReviewsDir()`.

**release-manager.** `pr-auto-review.mjs`: `hardGate` merges `origin/<base>` into the temp worktree; `classifyDomain`, `orderPrs` replace the number sort; `findOverlaps` + marker comment; `formatChangelogEntry`/`appendChangelog` reuse the `completeTaskInClone` commit/push path
so no new push path to `main` appears. `detectBlockedByCycle` is in `seed-queue-from-openspec.mjs`; `queue-drainer.mjs showStatus` calls it.

**input-safety.** `red-team-tester.mjs`: extend `RULES`, `imperativeCount`, `--screen`, `findingsToTasks`, `--tasks`. `seed-queue.mjs` and `seed-queue-from-openspec.mjs` call `screenExternalInput` before writing a queue file. `goalSafetyFindings` in the openspec seeder.

**memory-evolution.** `core.json.template` (`character`, failure fields), `memory-manager.mjs` (`renderCharacter`, recall rendering, audit line in `saveMemory`), `pattern-hunt.mjs teachAgents` (emotion fields, `learnedFrom`), `version-snapshot.mjs`
(memory copy, `restore --memory`, Version History line). Optional fields only; absence renders byte-identically to today.

**planning-templates.** Text and template edits; one new test file `tests/planning-templates.test.mjs` asserts markers so cheap models cannot silently drop them. Only the `buildReviewPrompt` line is interactive.

**claude-review-lane.** See the decision below.

### Claude review lane (new design)

```
pr-auto-review pass
   |-- PR touches FLAG_PATHS ---> action "flagged"
   |        |-- enqueueClaudeReview(): pm/claude-review-queue.json  (key: pr + headSha)
   |        |-- Telegram notice, once (notifiedAt)
   |        '-- later passes: skip-awaiting-claude (no LLM, no worktree, one log line)
   '-- otherwise: existing gate + LLM verdict + merge
interactive Claude Code session (Bryce's subscription)
   '-- skill sdlc-review-flagged:
         list-flagged -> worktree -> merge origin/main -> npm test -> read FLAG_PATHS diffs
         -> merge | changes-requested (FIX task via buildFixTask) | close -> gh pr comment
         -> resolve-flagged <pr> <outcome>
```

Queue entries are keyed by head SHA so a force-push re-queues exactly once. External merge or close marks the entry `resolved` (no stale rows). `changes-requested` reuses the existing FIX-task path and the retry cap.

### Decision: optional headless `claude -p` timer (CV-REQ-104)

**Chosen**: specify it, default OFF, behind `claudeReview.headless.enabled` in `agents/project.json` and `enabled:false` in the schedule; cap `maxPerDay` (default 2); comment-only (never merges).
**Considered**: (a) no automation, only the interactive skill: zero token spend, latency = whenever Bryce opens a session; (b) headless per flagged PR: lower latency, but each review is a multi-turn session reading diffs and running tests and spends subscription tokens that Bryce's small plan needs for interactive work;
(c) cheap-model second opinion: no cost problem but is the tier the lane exists to supplement.
**Rationale**: default (a); (b) is a toggle Bryce can flip once the notification volume is known. Needs Bryce's decision (tasks.md #7). Not on the critical path.

### Phasing and parallelism

Phase 1 is HIGH priority and mostly hermes; once CV-012 lands the drain can pick its tasks. Phase 2's three groups touch disjoint files. Phase 3 interactive edits to `drain-prompt.md` (CV-315, CV-316, CV-317, CV-319) and Phase 4/5 edits to `pr-auto-review.mjs` are chained so only one session edits a file at a time.

---

## Decisions

### Decision 1: baselines move to a tracked path

**Chosen**: `agents/behavior-baselines.json`, legacy `pm/` read-only fallback. **Considered**: un-ignoring one file in `pm/`. **Rationale**: `pm/` is runtime state; a tracked file in `agents/` is reviewable and CI-visible.

### Decision 2: new gates are advisory unless they close a hole

**Chosen**: fn-length/param-count advisory; empty-catch regex blocking; `allowedExtensions` opt-in. **Considered**: block all. **Rationale**: existing code would fail `npm test` and the drain would loop on unrelated violations.

### Decision 3: bug scaffolds are drafts

**Chosen**: `bug-<id>` created with readiness `draft` plus a triage human task. **Considered**: auto-seed. **Rationale**: auto-seeding a failing task's bug re-enters the same loop the retry cap exists to stop.

### Decision 4: legacy timers superseded, not duplicated

**Chosen**: declare `pattern-hunt-weekly`/`rem-sleep-weekly` with `supersededBy`; weekly-review owns the work. **Considered**: keep both. **Rationale**: double runs mutate memory twice.

### Decision 5: `agents/versions/` is ignored

**Chosen**: gitignore new snapshots (CV-604). **Considered**: commit them. **Rationale**: git history already records tracked files; snapshots are local backups and memory copies may contain data not meant for the repo.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cheap model edits a hermes task wrongly | Medium | Low | Tasks name function, file and test; pr-auto-review gates; replay corpus |
| Interactive task seeded and claimed by the drain | Medium without CV-006 | High | CV-006 first, fail-closed lane parse, CV-012 dry-run check |
| Re-recording baselines hides drift | Low | Medium | Re-record only after the drift step passes (CV-109) |
| `check-staged` blocks the drain on legacy code | Medium | Medium | New checks advisory; allowlist; two retries then `failing` |
| Weekly cycle steps mutate memory in dry-run | Low | Medium | `--dry-run` propagated to each step (CV-102 test) |
| Version History line dirties the working tree on the primary box | Medium | Low | Idempotent per date; noted in RUNBOOK; surfaces in `git status` for a human |
| `claude -p` spends the subscription | n/a while OFF | Medium | Default OFF, daily cap, decision #7 |
| OpenRouter `openai/*` model slugs remain in ladders (open-weight, routed via OpenRouter) | Low | Policy | Hygiene CV-601 removes the adapters only; slugs are a separate review |
| Importing `four-layer-validate.mjs` or `queue-drainer.mjs` runs their CLI | Medium | Medium | Tasks CV-303 and CV-410 require an `__isMainModule` guard first |
| Telegram notice fails during a network outage | Medium | Low | `notifiedAt` set only on success; retried next pass |

---

## Testing Approach

- **Unit tests**: each pure helper has a node:test case (named in every task's `Test:` line); temp dirs and injected runners, no network.
- **Integration tests**: `tests/pr-auto-review.test.mjs` with temp git repos and stubbed `gh`; `tests/hermes-drain.test.mjs` for prompt/script text; scheduler tests with an injected systemctl runner.
- **Manual verification**: CV-608 (dry-runs of weekly review, health-check, scheduler) and CV-609 (a real drain pass and a forced flagged PR).

---

## Next Step

Specs are written; proceed with the tasks phase and the orchestrator's readiness review.

## Decisions 2026-11-03 (CV-REQ-110..114)

- **Org chart** extends `agent-registry.mjs` and AGENT.md front matter; no new store. Workshop OS will later generate these fields (memory: Paperclip retired, Workshop OS owns roster).
- **Error intake** reuses `notify.errorSignature()` and the queue writer in `seed-queue.mjs`; adapters shell out to CLIs already installed (`journalctl`, `vercel`, `supabase`). Screening (CV-REQ-06x) and scrubbing (CV-REQ-113) are mandatory on the path.
- **VaultWarden** runs on the home server or this box (Bryce installs it; that is the interactive part). `secrets.mjs` is a thin resolver in front of the existing key resolution in `model-manager.mjs` (`resolveProviderKey`).
- **PII scrubbing** reuses the `.venv` already used by `embed.py`. Hermes calls OpenRouter itself, so covering the drain needs a localhost scrubbing proxy set as Hermes's base URL — a machinery change, interactive lane, decided after the adapter path is proven.
- **Voices** use Piper (local, offline). Hermes's current `tts.provider: edge` is Microsoft's cloud TTS; switching it to local is part of CV-705.
