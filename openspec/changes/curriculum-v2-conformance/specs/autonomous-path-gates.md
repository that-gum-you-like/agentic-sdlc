# Specs — autonomous-path-gates

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: specs

Covers the Hermes drain path: `agents/hermes-drain.sh`, `agents/drain-prompt.md`, `agents/queue-drainer.mjs`,
`agents/review-hook.mjs`, `agents/pr-auto-review.mjs`, plus `SHARED_PROTOCOL.md`, `checklist.md.template`, `project.json(.template)`.
Prefix `GATE`.

**Principle: a gate that exists in the repo but not on the path the agents actually run is documentation.**
`review-hook.mjs` is coded and tested, yet `.git/hooks/` contains only samples and `hermes-drain.sh` never calls it (D5-01).
**Self-modification rule:** every task touching these files is Lane: interactive; the drain never edits the machinery that runs it.

---

## CV-REQ-030 — The drain checks staged changes before every commit

**Gaps:** D5-01 | **Curriculum:** w5-anti-pattern-detection.md "Senior Review Agent"; 00-syllabus.md "Post-Commit Hook"

**Statement:** `drain-prompt.md` shall instruct `node agents/review-hook.mjs check-staged` before `git commit`,
and `hermes-drain.sh` shall install the enforcing pre-commit hook in the drain clone on every pass.

**Acceptance:**
- `review-hook.mjs install --pre-only` installs only the pre-commit hook (idempotent)
- `hermes-drain.sh` calls it after clone sync; a failure to install aborts the pass with a logged reason
- `drain-prompt.md` step before commit: on exit 1, fix the named violations and retry at most twice, then mark the task `failing`
- The hook is installed once on `~/agentic-sdlc` itself

**Scenarios:**
- WHEN the drain stages a file containing `catch (e) {}` THEN `git commit` is rejected by the hook
- WHEN install runs twice THEN `.git/hooks/pre-commit` is unchanged on the second run

**Complexity:** M | **Value:** HIGH | **Dependencies:** none

---

## CV-REQ-031 — Checklist content catches the common anti-patterns

**Gaps:** D5-02 | **Curriculum:** w5-anti-pattern-detection.md "Senior Developer Checklist", "Common Anti-Patterns"

**Statement:** `review-hook.mjs` DEFAULT_CHECKLIST shall block empty catch blocks with or without a binding, and shall warn on functions over 50 lines or with more than 4 parameters in staged additions.

**Acceptance:**
- Empty-catch detection matches `catch {}`, `catch () {}` and `catch (e) {}`; does not match `catch (e) { log(e) }`
- Function-length and param-count items are advisory (exit 0, printed) and apply only to functions touched by the staged diff
- `scanFunctionMetrics(source)` exported from `four-layer-validate.mjs`, reused by the hook and by Layer 3
- `checklist.md.template` gains `Security` and `Simulation` sections

**Scenarios:**
- WHEN a staged diff adds `catch (err) {}` THEN `check-staged` exits 1 naming the line
- WHEN a staged diff touches a 60-line function THEN `check-staged` exits 0 and prints a `fn-length` warning

**Complexity:** M | **Value:** HIGH | **Dependencies:** CV-REQ-030

---

## CV-REQ-032 — Language drift guard

**Gaps:** D5-07 | **Curriculum:** w5-anti-pattern-detection.md "Language Drift"

**Statement:** When `agents/project.json` defines a non-empty `allowedExtensions`, `check-staged` shall block newly added files whose extension is not listed.

**Acceptance:** empty or absent list disables the check; only added files (`--diff-filter=A`) are checked; dotfiles and extensionless files are exempt; `project.json.template` documents the key.

**Scenarios:** WHEN `allowedExtensions` is `[".mjs",".md",".json"]` and a `.py` file is added THEN the commit is blocked.

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** CV-REQ-030

---

## CV-REQ-033 — The drain reads memory before work and writes it after

**Gaps:** D6-02 | **Curriculum:** w6-agent-memory-evolution-full.md "Memory Discipline"

**Statement:** `drain-prompt.md` shall have the drain run `node agents/memory-manager.mjs recall <agent>` (agent = the task's assigned agent) before implementing, and `record <agent> recent "<learning>"` after, including a record on every `failing` outcome.

**Acceptance:** both steps appear in the prompt in order; the recall step is skipped without error when the agent has no memory dir; `tests/hermes-drain.test.mjs` asserts the prompt contains both commands.

**Scenarios:** WHEN a task ends `failing` THEN a `recent` memory entry naming the task id and cause is recorded before the drain stops.

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-034 — Tests first, and committed tests are never edited

**Gaps:** D1-07 | **Curriculum:** w2-autonomous-workers.md TDD sections, Exercise 2.0a

**Statement:** `drain-prompt.md`, the `worker.mjs` micro-cycle text and `AGENT.md.template` shall require writing failing tests derived from the task's spec before implementation, and forbid modifying any test file already committed on the base branch (flag for a human instead).

**Acceptance:** the exact phrase `never modify a committed test` appears in all three; `tests/hermes-drain.test.mjs` asserts it in the prompt.

**Scenarios:** WHEN implementation would require changing an existing test THEN the drain marks the task `needs-human` with the test path.

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-035 — Per-task retry cap

**Gaps:** D7-05 | **Curriculum:** long-game-operating-agent-teams.md "FM5 Runaway Loop"

**Statement:** A task that fails or whose PR is rejected three times shall become `blocked` with `blockedReason: "retry-cap"` and a human task, and shall not be re-drained.

**Acceptance:**
- `queue-drainer.mjs` increments `retryCount` on `complete <id> failing` and on stale-claim release
- `pr-auto-review.mjs` counts rejections per FIX task (`attempts`) and, at the third, creates a human task instead of another FIX task
- `drain-prompt.md` retry wording says 3 (it said 2 while `worker.mjs` said 3)

**Scenarios:** WHEN a task is released as failing the third time THEN its status is `blocked` AND `notifyHumanTask` fired once.

**Complexity:** M | **Value:** HIGH | **Dependencies:** none

---

## CV-REQ-036 — A failing task scaffolds a bug change

**Gaps:** D1-03 | **Curriculum:** w2-autonomous-workers.md "Bug Tracking with OpenSpec"

**Statement:** `complete <id> failing` shall scaffold `openspec/changes/bug-<id>/{proposal.md,tasks.md,status.json}` from `openspec/templates`, with `readiness: "draft"`, and raise a triage human task.

**Acceptance:**
- Pure `scaffoldBugChange(task, {templatesDir, changesDir})` in `seed-queue.mjs`; idempotent (existing dir is left untouched)
- `status.json` readiness `draft` so the seeder does not auto-queue it; proposal embeds task id, title, last failure text
- `queue-drainer.mjs` calls it on `failing`

**Scenarios:** WHEN CC-003 fails THEN `bug-CC-003/` exists with readiness `draft` AND a second failure does not overwrite it.

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** CV-REQ-035

---

## CV-REQ-037 — Reviews become files the improvement loop can read

**Gaps:** D5-03 | **Curriculum:** w5-anti-pattern-detection.md "Evolving Your Checklist"

**Statement:** `pr-auto-review.mjs` shall write each verdict to `agents/sdlc-reviewer/reviews/<pr>.md` with issues tagged `[critical]`, `[major]` or `[minor]`, and `agents/sdlc-reviewer/checklist.md` shall exist, seeded from `checklist.md.template`.

**Acceptance:**
- `buildReviewPrompt` asks the model to tag each issue; `parseVerdict` tolerates missing tags (default `[minor]`)
- Re-reviewing the same PR overwrites its file
- `.gitignore` ignores `agents/*/reviews/`
- `pattern-hunt.mjs findReviewsDir()` resolves to this directory

**Scenarios:** WHEN PR 70 is rejected with two issues THEN `reviews/70.md` exists with one `[major]` and one `[minor]` line.

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-038 — Ambiguous destructive verbs require a named scope

**Gaps:** D1-10 | **Curriculum:** w2-autonomous-workers.md "Database Deletion Incident"

**Statement:** `SHARED_PROTOCOL.md` (and its template) and `drain-prompt.md` shall state: verbs such as optimize, clean up, simplify or tidy require a named file or table scope and never authorise deleting or rewriting data; absent a scope the task becomes `needs-human`.

**Acceptance:** rule text present in all three files; `tests/hermes-drain.test.mjs` asserts the drain-prompt line.

**Scenarios:** WHEN a task says "optimize the database" with no Files line THEN the drain marks it `needs-human`.

**Complexity:** S | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-039 — The drain never claims interactive-lane tasks; dependencies are real

**Gaps:** loop-health §8 (OS-business-os-1/-2 blocked forever) | **Curriculum:** n/a (self-modification rule, design.md)

**Statement:** `seed-queue-from-openspec.mjs` shall queue any task whose block contains a non-`hermes` `Lane:` line with `status: blocked` and `blockedReason: interactive-lane …` (visible on the board, never claimed: the drain claims only `pending`), and shall translate `blocked-by <ids>` into `blockedBy` queue ids so a hermes task waits for its prerequisites — including interactive ones, which a human marks `completed`. Dependencies on checked-off (`[x]`) tasks are already satisfied.

**Acceptance:** interactive tasks are created `blocked` with the reason; hermes-lane tasks seed unchanged; an unknown lane value is treated as interactive (fail closed); a task with no Lane line seeds as before.

**Scenarios:** WHEN tasks.md has one `Lane: interactive` and one `Lane: hermes` task THEN the first is created `blocked` and only the second is `pending`. WHEN CV-102 says `blocked-by CV-101` THEN CV-102's queue entry has `blockedBy: [<CV-101's queue id>]`. WHEN the dependency is checked off THEN `blockedBy` omits it.

**Complexity:** S | **Value:** CRITICAL | **Dependencies:** none
