# Validation Patterns

Validation in an agentic SDLC is not a single gate — it is a layered system that catches different failure modes at different stages. This document covers the four-layer validation architecture, behavior testing, defeat tests, and agent TDD.

---

## The Four-Layer Validation Architecture

Each layer catches failures the previous layers miss.

```
Layer 1: Research
Layer 2: Critique
Layer 3: Code
Layer 4: Statistics
```

### Layer 1: Research

Before implementation begins, a research agent (or research phase) validates the approach.

- Are the referenced sources real?
- Is the proposed solution known to work for this class of problem?
- Are there known failure modes for this approach?

This layer catches hallucinated citations, misapplied patterns, and approaches that are theoretically sound but empirically known to fail.

### Layer 2: Critique

A separate agent (or adversarial review pass) critiques the proposed design before any code is written.

- What could go wrong with this approach?
- What edge cases are not addressed?
- Does this introduce new failure modes?

The critique layer is deliberately adversarial. It exists to surface objections, not to approve work.

### Layer 3: Code

Standard code validation: tests, linting, type checking, and static analysis.

- Unit tests verify individual functions.
- Integration tests verify component interactions.
- E2E tests verify behavior through the entire system.
- Pre-commit hooks enforce linting, type checking, and test passage before any commit lands.
- Post-commit hooks trigger senior review against a checklist.

This layer catches implementation errors, regressions, and style violations.

### Layer 4: Statistics

After deployment or after a batch of work, statistical validation checks whether outcomes match expectations.

- Did the change improve the metric it was supposed to improve?
- Are there unexpected side effects visible in usage data?
- Did silent failures occur that passed functional tests (for example, values silently defaulting to zero)?

This layer catches failures that are invisible to functional tests: silent fallbacks, degraded-but-passing behavior, and drift over time.

### Layer 5: Browser Verification

Tests the system from the user's perspective in a real browser. This layer catches failures that are invisible to code-level tests: broken rendering after refresh, dead navigation links, lost state across page transitions, and runtime errors that only manifest in a real browser environment.

**Principles:**
- User journey tests express user intent, not implementation details
- Tests run against the built artifact (production build), not the dev server
- Every deployable frontend feature has a corresponding browser test
- Screenshot proof is captured and reviewed before reporting done

**Required Scenarios:**
- **Refresh resilience**: Every route group tested for hard refresh survival — navigate to route, reload browser, verify content still renders correctly
- **Demo/seed mode**: Full login → browse → interact flow verified end-to-end in a real browser
- **Navigation completeness**: Every UI link and button navigates to a screen with actual content (not blank, not error)
- **State persistence**: User interactions (likes, comments, bookmarks, form entries) survive navigation and reload
- **Error states**: Network failures, empty states, and edge cases produce graceful UI — no blank screens, no unhandled TypeErrors

**When to Run:**
- After any change to screens, navigation, or state management
- As a deploy pipeline gate (after build, before production deploy)
- Post-deploy against production URL as smoke verification

---

## Pre-Commit and Post-Commit Validation

These hooks are the minimum viable validation floor. No commit should land without them.

**Pre-commit:**
- Run test suite (unit + integration at minimum)
- Run linter
- Run type checker

**Post-commit:**
- Senior review agent checks the diff against a senior developer checklist
- Any violation creates a task to address it
- Pattern violations increment a counter that triggers defeat test creation

---

## E2E Behavioral Validation

End-to-end tests verify behavior through the entire system, not just individual functions. They are the highest-confidence test type.

- E2E tests should express user intent, not implementation details.
- A passing E2E test means the system does what users expect, regardless of internal changes.
- Front-end E2E tests (browser automation) verify the full stack including rendering.

E2E tests are expensive to write and maintain. Prioritize them for critical user flows and for scenarios where lower-level tests have repeatedly failed to catch regressions.

---

## Defeat Tests

A defeat test is a test written specifically to prevent a known anti-pattern from recurring. It is the final step in the pattern-defeat loop.

**Pattern-defeat loop:**
```
1. Find Pattern (recurring mistake identified in review or weekly cycle)
2. Name It (give the anti-pattern a specific, memorable name)
3. Write Defeat Test (test that fails when the pattern is present)
4. Teach Discipline (add pattern to checklist, memory, and static analysis)
5. Repeat (weekly cycle monitors for new patterns)
```

**Properties of a good defeat test:**
- Fails when the anti-pattern is present.
- Passes when the code is correct.
- Has a clear failure message that names the anti-pattern.
- Requires no understanding of internal implementation to read and understand.

**Examples of defeat-testable anti-patterns:**
- Silent numeric fallbacks (NaN → 0 with no error)
- Uncontrolled randomness in logic that should be deterministic
- Fabricated or unverified external references
- Hardcoded magic numbers with no named constant
- Functions that silently swallow exceptions

---

## Behavior Testing

Behavior tests verify agent decision-making quality, not just code correctness. They are used to validate that a change to an agent prompt or memory did not cause unintended behavioral drift.

**What behavior tests verify:**
- Given a known input, does the agent produce output that meets quality criteria?
- Did a prompt change cause regressions in output quality?
- Are agents still following their character sheets after memory updates?

**Structure of a behavior test:**
```
Input:    A realistic scenario or task description
Expected: A set of criteria the output must satisfy (not exact match)
Actual:   The agent's output given the input
Assert:   Output satisfies all criteria
```

Behavior tests use criteria-based assertions rather than exact-match assertions, because LLM output is non-deterministic. Test that the output contains required elements, not that it matches a fixed string.

---

## Agent TDD (Test-Driven Development for Agent Behavior)

Agent TDD applies the TDD discipline to agent prompt development.

```
1. Pattern Found      — A recurring failure mode is identified
2. Test Written       — A behavior test is written that fails given current agent behavior
3. Agent Trained      — The agent's prompt, memory, or checklist is updated
4. Test Passes        — The behavior test now passes
5. Pattern Defeated   — The anti-pattern is defeated and regression-protected
```

Key difference from traditional TDD: the "code" being tested is the agent's behavior, and the "implementation" is the agent's prompt, memory, and checklist — not executable source code.

Agent TDD encourages treating agent prompts as first-class artifacts with the same rigor applied to source code: versioned, tested, reviewed, and improved iteratively.

---

## Reference Architecture

```
Human Layer
    |
Coordination Layer  (task queue, release manager, PM dashboard)
    |
Agent Layer         (specialist agents: backend, frontend, AI, review, release, docs)
    |
Validation Layer    (research → critique → code → statistics → browser verification)
    |
Code Layer          (source code, tests, build artifacts)
```

Validation sits between agents and code. No agent output reaches the code layer without passing through validation. For projects with a frontend, the browser verification layer is the final gate before deploy.

---

## Anti-Pattern Naming Vocabulary

When identifying anti-patterns, use specific vocabulary. Vague feedback ("it's bad", "clean this up") does not teach agents or humans. Name the violation precisely using these terms:

| Term | Meaning | Example Violation |
|------|---------|-------------------|
| **Modular** | Code is organized into independent, interchangeable units with clear boundaries. Each module has a single responsibility and communicates through well-defined interfaces. | A 500-line function that handles parsing, validation, and database writes. |
| **Robust** | Code handles errors, edge cases, and unexpected input gracefully. It does not silently swallow exceptions or fall back to incorrect defaults. | A function that catches all exceptions and returns `0` instead of propagating the error. |
| **Testable** | Code can be verified in isolation. Dependencies are injectable, side effects are contained, and behavior is deterministic. | A function that reads directly from the filesystem and calls an external API with no way to mock either dependency. |
| **Discoverable** | Code is organized so that its purpose and location are predictable from the project structure. Names, paths, and conventions make it possible to find what you need without searching. | A utility function buried inside an unrelated component file with a generic name like `helper`. |
| **Decomposed** | Complex logic is broken into small, named steps. Each step is independently understandable. Long chains of logic are replaced with a sequence of well-named operations. | A single expression with 6 nested ternaries and 4 chained method calls. |

**Usage in reviews and checklists:**
- Not "this code is messy" → "this is not **modular** — the parsing logic should be a separate function"
- Not "fix the error handling" → "this is not **robust** — NaN falls back to 0 silently"
- Not "I can't find this" → "this is not **discoverable** — move it to `utils/` with a descriptive name"
- Not "this is too complex" → "this is not **decomposed** — extract the validation step into its own function"
- Not "we can't test this" → "this is not **testable** — inject the database client instead of importing it directly"

These terms form the shared vocabulary for review checklists, defeat tests, and agent feedback. Every anti-pattern should be nameable with at least one of these terms.
