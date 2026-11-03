# Specs — planning-templates

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: specs

Covers `openspec/templates/*`, `agents/templates/planning-agents/*`, `agents/templates/execution-agents/*`, `agents/SHARED_PROTOCOL.md(.template)`,
`skills/sdlc-inbox/SKILL.md`, `docs/claude-quickstart.md`, `framework/agent-routing.md`. Prefix `PLAN`. Text and template changes only (hermes lane),
except CV-REQ-086's `pr-auto-review.mjs` prompt line (interactive). Each REQ is verified by a string assertion in `tests/planning-templates.test.mjs`.

---

## CV-REQ-080 — Requirements rubric with a gap-question loop

**Gaps:** D1-12 | **Curriculum:** w1-planning-requirements.md "Requirements Reviewer"; 00-syllabus.md Step 1-4

**Statement:** `requirements-engineer.md` shall define a five-row rubric (purpose/scope, numeric business goals, user stories, technical constraints, NFRs) and a loop: ask gap questions until every row passes or the user stops; `braindump.md.template` shall have `Business Goals (numeric)` and `Technical Constraints` sections.

**Scenarios:** WHEN a brain dump has no numeric goal THEN the rubric row `numeric business goals` is FAIL and a question is required.

**Complexity:** S | **Value:** MEDIUM

---

## CV-REQ-081 — User stories by persona

**Gaps:** D1-13 | **Curriculum:** w1-planning-requirements.md "User Stories"

**Statement:** `proposal.md.template` shall include `User Stories (by persona)` with rows for new, regular, power, admin and payer users in "As a / I want / so that" form; `requirements-engineer.md` shall add a persona-coverage checklist line.

**Scenarios:** WHEN a proposal lists stories for only the regular persona THEN the coverage line prompts for the other four or an explicit "not applicable".

**Complexity:** S | **Value:** MEDIUM

---

## CV-REQ-082 — Value analysis has success metrics

**Gaps:** D1-14 | **Curriculum:** 00-syllabus.md Step 4

**Statement:** `proposal.md.template` Value Analysis shall include `Success Metrics` (metric, baseline, target, how measured) and `Who Benefits`; `value-analyst.md` shall require both and a "what if we do not build this" answer.

**Scenarios:** WHEN a proposal omits success metrics THEN `value-analyst.md` marks the analysis incomplete.

**Complexity:** S | **Value:** MEDIUM

---

## CV-REQ-083 — Agent log protocol

**Gaps:** D3-06, D6-09 (minimal doc form) | **Curriculum:** w3-agent-orchestration.md "Coordination" (CoffeeTalk); w6-agent-memory-evolution-full.md "Coffee Talk"

**Statement:** `SHARED_PROTOCOL.md` and its template shall define an append-only `pm/coffeetalk.md` agent log: line format `- <ISO time> @from -> @to: message`, read the last 20 lines at turn start, never edit or delete lines.

**Scenarios:** WHEN an agent starts a turn THEN the protocol tells it to read the log tail before choosing work.

**Complexity:** S | **Value:** LOW | **Notes:** no code; a notify helper is deliberately deferred.

---

## CV-REQ-084 — Frontend agents search the component library first

**Gaps:** D3-09 | **Curriculum:** w3-agent-orchestration.md "UI Generation"

**Statement:** `frontend-developer.md` shall instruct: run `node ~/component-library/bin/search.mjs <keyword>` first, else shadcn primitives, Tailwind only, no raw CSS.

**Scenarios:** WHEN a UI task starts THEN the template's first step is the library search.

**Complexity:** S | **Value:** LOW

---

## CV-REQ-085 — Project-manager template and idea capture

**Gaps:** D7-10 | **Curriculum:** manic-episode.md "Capture Ideas"

**Statement:** `agents/templates/planning-agents/project-manager.md` shall exist (role, prioritisation by value, "never one more thing"), and `skills/sdlc-inbox/SKILL.md` shall route messages prefixed `idea:` to `openspec/BACKLOG.md` as the next `REQ-xxx` entry and answer "captured, keep current focus".

**Scenarios:** WHEN the inbox receives `idea: add dark mode` THEN BACKLOG.md gains one new REQ line and the reply tells the user to continue the current task.

**Complexity:** M | **Value:** MEDIUM

---

## CV-REQ-086 — Reviewer reasoning framework

**Gaps:** D5-09 | **Curriculum:** w5-anti-pattern-detection.md Cohort 4 (CBT/DBT frameworks)

**Statement:** `code-reviewer.md` and the `buildReviewPrompt` text in `pr-auto-review.mjs` shall scaffold each finding as: name the distortion (the anti-pattern), cite evidence, state the reframe (the fix).

**Scenarios:** WHEN the reviewer prompt is built THEN it contains the three-step framework text.

**Complexity:** S | **Value:** LOW | **Notes:** the `pr-auto-review.mjs` line is Lane: interactive.

---

## CV-REQ-087 — Standardization sweep procedure

**Gaps:** D1-15 | **Curriculum:** w2-autonomous-workers.md "Type Safety and Codebase Standardization", Exercise 2.0b

**Statement:** `code-reviewer.md` shall hold a "Standardization sweep" procedure (naming, error pattern, types, docstrings, typecheck if configured) and `seed-tasks.json.template` shall carry a matching seed task.

**Scenarios:** WHEN a project adopts the templates THEN a standardization task is seeded once.

**Complexity:** S | **Value:** LOW

---

## CV-REQ-088 — Claude quickstart is honest about interactive-only features

**Gaps:** D7-15, D7-17 | **Curriculum:** 00-syllabus.md "Key Tools" (/schedule, /loop, REA)

**Statement:** `docs/claude-quickstart.md` shall state that `/schedule` and `/loop` are interactive-only and that systemd timers installed by `scheduler-install.mjs` are the autonomous equivalent, and shall mention REA as an interactive MCP whose output can feed `browser-user-test.mjs generate`.

**Scenarios:** WHEN a reader looks for scheduling THEN the doc points to `scheduler-install.mjs`, not `/schedule`.

**Complexity:** S | **Value:** LOW

---

## CV-REQ-089 — Git expert persona and "disagreement is the finding"

**Gaps:** D7-18 | **Curriculum:** 00-syllabus.md "Key Tools" (agent personas)

**Statement:** `agents/templates/execution-agents/git-expert.md` shall exist, and `framework/agent-routing.md` shall state that when two reviewing personas disagree, the disagreement is recorded as a finding for a human.

**Scenarios:** WHEN two reviewers return opposite verdicts THEN the routing doc says to record a finding, not average them.

**Complexity:** S | **Value:** LOW
