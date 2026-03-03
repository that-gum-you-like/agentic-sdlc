# Case Studies in Agentic SDLC Failures

These case studies document real failure modes that emerge when AI agents work autonomously on software projects. Each case illustrates a category of failure, the mechanism by which it went undetected, and the validation pattern that defeats it.

These are universal failure modes. They have appeared across multiple projects and will appear again in any project without the appropriate defeat tests and validation layers in place.

---

## Case Study 1: The Citation Crisis

**Category:** Fabricated external references

**What happened:**

An agent, when asked to justify a technical decision, cited authoritative sources to support its recommendation. The sources appeared plausible — correct author name formats, realistic journal names, realistic publication years. The citations were used in documentation and influenced subsequent architectural decisions.

The citations were fabricated. The papers did not exist. The authors did not write them. The findings attributed to those sources were either invented or misattributed.

**Why it went undetected:**

- No one verified citations during review — the review process checked code correctness, not source validity.
- The citations looked correct. Hallucinated references are formatted like real references.
- The architectural decisions built on those citations were reasonable on their own merits, so the underlying justification was never scrutinized.

**Mechanism:**

LLMs are trained to produce fluent, coherent, authoritative-sounding text. When asked for justification, they produce justification — including fabricated evidence when real evidence is unavailable. The model does not know it is fabricating; it is completing a pattern.

**Defeat pattern:**

- Layer 1 validation (Research): Every external citation must be verified before it enters any document or decision record.
- Behavior test: Given a task that invites citation, the agent's output must contain a "verification pending" flag on any external source, or must only cite sources from a verified corpus.
- Checklist item: "No unverified external citations in any deliverable."
- Static analysis: Flag documents containing formatted citation patterns (author, year, title) for human verification.

**Lesson:**

Never let agent-generated justifications substitute for verified evidence. Treat all agent citations as unverified until proven otherwise. The fluency of the output is not evidence of its accuracy.

---

## Case Study 2: The NaN Fallback Disaster

**Category:** Silent numeric failure

**What happened:**

An agent implemented a calculation that could produce `NaN` under certain input conditions. Rather than surfacing an error, the implementation silently fell back to `0` when the result was not a finite number. The fallback was chosen because it allowed the system to continue functioning without crashing.

The feature shipped. All tests passed. In production, a subset of users received outputs of `0` when they should have received meaningful values. Because `0` was a plausible output in some contexts, the failure was not immediately obvious. By the time it was identified, months of production data had been affected.

**Why it went undetected:**

- The fallback was intentional — the agent reasoned that returning `0` was safer than crashing.
- Unit tests used inputs that produced valid outputs. No tests covered the NaN-producing inputs.
- Integration and E2E tests covered happy-path flows.
- The Layer 4 (Statistics) validation layer was not in place. A statistical check on output distributions would have flagged the anomalous spike in `0` values.

**Mechanism:**

Agents optimize for "not crashing" because crashing is an obvious failure. Silent fallbacks hide failures while allowing the system to keep running. This is a rational local optimization that produces catastrophic global outcomes.

**Defeat pattern:**

- Defeat test: Any numeric computation that falls back to a default value must throw or log an error when the computation produces a non-finite result. Test that the error path is exercised.
- Code review checklist: "No silent numeric fallbacks. NaN, Infinity, and -Infinity must be handled explicitly with errors or warnings, not silent defaults."
- Static analysis: Flag patterns matching `isNaN(x) ? 0 : x`, `x || 0`, and equivalent patterns that silently substitute zero.
- Layer 4 validation: Monitor output value distributions. A spike in a specific value (especially `0`, `null`, or `undefined`) is a signal of silent failure.

**Lesson:**

Silent fallbacks are a debt payment deferred to users. When a computation fails, the failure must be visible. "Keeps running" is not the same as "works correctly."

---

## Case Study 3: 150 Math.random() Calls

**Category:** Uncontrolled randomness

**What happened:**

An agent, working on a feature that involved content selection, used `Math.random()` (or the equivalent) in 150 separate places throughout the codebase to introduce variation. Each call was locally reasonable — shuffling a list here, selecting a variant there, randomizing an ordering elsewhere.

The result was a system whose behavior was effectively non-deterministic and untestable. Tests that relied on specific outputs failed intermittently. Debugging production issues was nearly impossible because the same inputs produced different outputs on every run. The system had no concept of a random seed, so reproducing a specific failure required extraordinary luck.

**Why it went undetected:**

- Each individual use of randomness was defensible in isolation.
- The agent was not tracking its own usage patterns across files.
- No test was written to enforce determinism requirements.
- The problem emerged gradually — 10 uses was fine, 50 was manageable, 150 was a crisis.

**Mechanism:**

Agents work file by file and task by task. They do not maintain a global view of patterns accumulating across the codebase. A pattern that is harmless in one file becomes a systemic problem when repeated in 150 files. The agent cannot see this unless it is explicitly trained to look for it.

**Defeat pattern:**

- Defeat test: A test that counts occurrences of direct randomness calls (e.g., `Math.random`, `crypto.randomUUID`, language-equivalent functions) in source files and asserts the count is below a threshold. Any new usage must go through a centralized, seedable random utility.
- Architecture rule: Randomness is centralized. One module owns all random number generation and accepts a seed. All other code calls that module.
- Code review checklist: "No direct calls to platform randomness APIs. Use the project's centralized random utility."
- Static analysis: Flag direct calls to platform randomness functions outside the designated utility module.

**Lesson:**

Randomness in software must be owned, not scattered. Any property that must be testable, reproducible, or auditable must be controlled through a single point. Agents will not discover this constraint on their own — it must be enforced by architecture and tests.

---

## Summary Table

| Case Study | Category | Detection Gap | Primary Defeat |
|------------|----------|---------------|----------------|
| Citation Crisis | Fabricated references | No citation verification step | Layer 1 research validation + checklist |
| NaN Fallback Disaster | Silent numeric failure | No statistical monitoring | Defeat test + Layer 4 statistics |
| 150 Math.random() | Uncontrolled randomness | No cross-file pattern detection | AST-based count test + centralized utility |

---

## Meta-Pattern

All three cases share a common structure:

1. The agent made a locally rational decision.
2. The decision was invisible to existing tests.
3. The problem emerged at system scale, not at the individual call site.
4. The failure was preventable with a specific, named test or validation rule.

This is the argument for defeat tests: agents are locally rational but globally blind. Defeat tests encode the global constraints that agents cannot derive on their own.
