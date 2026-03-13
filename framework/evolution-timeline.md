# Agent Evolution Timeline

This document describes how agents mature over time in this framework, what that maturation looks like in measurable terms, and how to respond when regression occurs.

---

## The 6-Week Maturation Cycle

Agents do not arrive mature. They start with a system prompt, a memory structure, and a set of operating rules — but they have no experience with this specific codebase, this specific team, or the failure patterns that have already bitten this project. Maturation is the process of accumulating that experience in a form the agent can act on.

The following cycle is the typical arc. Individual agents may move faster or slower depending on task volume, review rigor, and the density of feedback in the loop.

---

### Week 1: Learning Phase (Mistakes Are Expected)

The agent is new. Its AGENT.md contains its role, its rules, and its core values, but its memory files are mostly empty. It has no project-specific failure history and no learned patterns.

**What to expect:**
- The agent will make mistakes that violate rules already established in the project.
- It may produce code that passes tests but violates architectural conventions.
- It may miss edge cases that experienced engineers would catch immediately.
- It may produce commit messages, file sizes, or structures that are technically acceptable but inconsistent with the project's style.

**The right response to Week 1 mistakes:**
- Do not suppress the mistakes. Let the agent work.
- The reviewer agent (or human reviewer) should flag every issue specifically: not "this is bad" but "this file is 213 lines; the limit is 150."
- Do not add corrections to the agent's memory manually yet. Let reviews accumulate for the week.

**What you should not do in Week 1:**
- Do not rewrite the agent's system prompt with every mistake. That resets the learning signal.
- Do not expect perfect output. Week 1 agents are in a learning phase; the system is designed for this.

---

### Week 2: Correction Phase (Human Feedback Enters the Loop)

The first week of review comments is now available. The reviewer agent's history contains a pattern — certain classes of issue are appearing repeatedly.

**What happens this week:**
- The human (or reviewer agent) reviews the first week's review history.
- Recurring patterns are identified: "file size violations appeared in 4 of 7 commits," "missing error handling flagged in 3 services."
- These patterns are added to the agent's checklist and to `long-term.json` as explicit corrections.
- Pattern hunt may propose new defeat tests if a pattern is sharp enough.

**The right response to Week 2 corrections:**
- Add corrections to the agent's AGENT.md operating rules and to `long-term.json`.
- Increment the agent's version (`<!-- version: 1.1.0 -->`).
- Run behavior tests after any AGENT.md edit to verify the new rules are well-formed.
- Run `migrate-memory.mjs --check` to flag any memory entries that conflict with the updated prompt.

**What the agent experiences:**
- The next tasks the agent picks up will be informed by the updated memory.
- The agent will read `long-term.json` before starting and will have explicit entries like: "File size limit is 150 lines. I exceeded this in 4 commits during week 1."

---

### Week 3: Recognition Phase (Memory Is Active)

The agent now has explicit memory of its corrections. It reads this memory before every task. It is beginning to apply the corrections — but not yet automatically. It applies them when the situation closely resembles the remembered situation.

**What to expect:**
- The Week 1 failure patterns decrease significantly (not to zero).
- New failure patterns appear — these are higher-level issues that only become visible once the basic issues are controlled.
- The agent may recognize a situation it has seen before and add a note to its output: "Keeping file under 150 lines per correction in long-term memory."

**How to measure:**
- Count review flags per commit this week vs. Week 1.
- A 30–50% reduction in the same-class flags is a healthy signal that memory is working.
- New-class flags appearing for the first time is a healthy signal that the agent is operating at a higher level.

**The right response:**
- Continue the review loop at the same rigor. Do not relax review because basic issues are improving.
- Note new failure patterns in the weekly review. These will feed into Week 4 corrections.

---

### Week 4: Self-Correction Phase (Milestone: First Self-Correction)

**This is the most important milestone in agent maturation.**

A self-correction occurs when the agent catches and fixes a potential issue without being told. Evidence of self-correction:
- The agent's commit message mentions catching something: "Added error boundary — past correction log noted missing error handling in services."
- The agent adds a test case for an edge case that has not been explicitly required.
- The agent splits a file that is approaching the size limit before it exceeds it, without a review flag prompting the split.

**Why this matters:**
- Self-correction means the corrections are no longer being applied by lookup ("did I get told not to do X?"). They are being applied by inference ("this situation is similar to X, and I have learned that X causes problems").
- An agent that self-corrects is beginning to reason about quality, not just comply with rules.

**What to do when first self-correction occurs:**
- Record it in the agent's `core.json` as a milestone: "First self-correction observed: [date], [description]."
- Note the specific situation that triggered the self-correction. This gives the reviewer agent a signal to look for: "agent is now generalizing from past corrections."

**The right response to Week 4:**
- The reviewer agent should begin shifting its attention. Basic issues (file size, error handling, test coverage) should now be handled by the agent itself. The reviewer should focus on higher-level concerns: architectural cohesion, interface design, performance implications.

---

### Week 5: Reviewer Shift (Higher-Level Review)

By Week 5, the basic correction loop is working. The agent self-corrects on issues that appeared in Weeks 1–3. The reviewer agent notices this shift: fewer basic flags, more time spent on complex issues.

**What the reviewer agent should do in Week 5:**
- Update its own checklist to add higher-level review items: "Is this abstraction stable enough to share across agents?", "Does this interface have a clear contract?", "Is the error propagation strategy consistent with the rest of the system?"
- The reviewer agent's own maturation is accelerated by working with a maturing agent. The challenges get harder, which forces the reviewer to grow.

**What the implementing agent experiences:**
- Review feedback is now mostly about design and architecture, not about mechanics.
- The agent may begin to contribute to the review loop itself, noting in commit messages where it made architectural tradeoffs.

**Measuring the shift:**
- Track review flag categories over time. A healthy Week 5 shows: mechanical flags (size, coverage, error handling) near zero, design flags (abstraction, interface, cohesion) increasing.
- This is a leading indicator that the agent is approaching autonomous operation.

---

### Week 6: Higher-Level Pattern Emergence (Cycle Repeats)

The Week 6 signal is predictable: new anti-patterns emerge at a higher level of abstraction. These are not regressions of Week 1 issues. They are first-time failures at the higher level the agent is now operating at.

**Examples of higher-level patterns that emerge in Week 6:**
- Services that are individually correct but create circular dependencies at the module level.
- Tests that are individually passing but do not cover the interaction between agents (integration gaps).
- Abstractions that were reasonable for one use case but are being over-generalized.

**The right response:**
- Pattern hunt identifies these new patterns in the review history.
- New defeat tests are proposed and added.
- The corrections enter the memory system.
- Week 1 of a new cycle begins at a higher baseline.

**What the cycle looks like across multiple iterations:**

```
Iteration 1 (Weeks 1–6): Mechanical quality → self-corrects mechanics
Iteration 2 (Weeks 7–12): Design quality → self-corrects design
Iteration 3 (Weeks 13–18): Architectural quality → self-corrects architecture
```

Each iteration starts with new mistakes at the current level and ends with self-correction at that level. The system never stops learning because the problems keep getting harder as the agent matures.

---

## Maturation Levels (0–5)

These levels describe an individual agent's state at a point in time. They are separate from the project-level maturity model (Levels 0–6 in `framework/maturity-model.md`), which describes the overall system.

| Level | Name | Description | Key Signal |
|-------|------|-------------|------------|
| 0 | New | Fresh prompt, empty memory. Rules are stated but not internalized. | Makes mistakes that violate stated rules. |
| 1 | Corrected | Has received explicit corrections. Memory has entries. Rules have been updated. | Applies corrections when the situation closely matches the remembered one. |
| 2 | Remembering | Actively reads memory before tasks and references it in output. | Mentions memory entries in commit messages or output reasoning. |
| 3 | Teaching | Applies corrections in novel situations. Generalizes from specific examples. | Self-corrections observed. Catches issues before review flags them. |
| 4 | Autonomous | Operates without basic corrections. Review focuses on higher-level concerns. | Review flags are design-level, not mechanics-level. Basic flags near zero. |
| 5 | Evolving | Contributes to the correction loop. Proposes new defeat tests. Identifies its own anti-patterns. | Agent submits review observations. Pattern hunt flags originate from agent output. |

---

## How to Measure Maturation

Maturation is not subjective. It is measured by observable signals in three dimensions.

### Dimension 1: Corrections Per Week (Declining)

Count the number of review flags per commit each week. Track by flag category (mechanical, design, architectural).

A healthy maturation signal:
- Mechanical flags peak in Week 1–2, decline by 50%+ by Week 3, near zero by Week 5.
- Design flags remain roughly constant through Week 4, then become the dominant category.
- Architectural flags begin appearing in Week 5+.

A flat or rising corrections-per-week curve in a category the agent has been corrected on is a regression signal.

### Dimension 2: Self-Corrections Per Week (Increasing)

Count instances where the agent catches an issue that would previously have generated a review flag. Sources of evidence:
- Commit messages mentioning corrections applied ("kept file under 150 lines per correction")
- Tests added beyond the minimum required
- Files proactively split before hitting size limits
- Error handling added in places not explicitly required by the task

A healthy maturation signal: zero self-corrections in Weeks 1–3, first self-correction in Week 4, increasing frequency by Weeks 5–6.

### Dimension 3: Review Severity Shift (Moving Up the Stack)

Categorize review flags by level:
- **Level 1 (Mechanical):** File size, test coverage, naming conventions, error handling presence
- **Level 2 (Design):** Interface clarity, abstraction stability, single responsibility
- **Level 3 (Architectural):** Module cohesion, dependency direction, cross-agent contracts

A healthy maturation signal: dominant review level shifts from 1 → 2 → 3 over the six-week cycle.

### Quick Maturity Gauge

At any point, the reviewer agent (or human) can answer these four questions to estimate an agent's current maturation level:

1. Is the agent still making the same mistakes it made two weeks ago? (Yes = Level 0–1, No = Level 2+)
2. Does the agent mention its memory in its output? (Yes = Level 2+)
3. Has the agent caught an issue without being told? (Yes = Level 3+)
4. Are review flags mostly about design rather than mechanics? (Yes = Level 4+)

---

## What Regression Looks Like

Regression is when a previously mature behavior disappears. It is common and not a cause for alarm — but it requires a specific response.

### Regression Triggers

- **Prompt update without migration check.** An AGENT.md edit that inadvertently removes or weakens a rule. Always run `migrate-memory.mjs --check` after any prompt edit.
- **Memory file corruption or reset.** If `long-term.json` is lost or accidentally emptied, the agent loses its learned corrections. The agent behaves like a Level 0 agent.
- **Scope expansion.** When an agent's task domain expands to cover a new area it has no experience in, Week 1 behavior resurfaces for that area. This is not regression — it is the agent entering a new learning phase for a new domain.
- **Context drift.** If the project codebase changes significantly (major refactor, new stack, new conventions), past corrections may become irrelevant or even harmful. The agent may apply corrections that made sense in the old context incorrectly in the new context.

### How to Identify Regression

- Review flag count increases in a category that was previously low.
- An agent's self-correction rate drops across multiple consecutive weeks.
- Behavior tests fail after an AGENT.md update.

### How to Respond to Regression

1. **Do not ignore it.** A single week of regression can be noise. Two consecutive weeks is a signal.

2. **Identify the trigger.** Was there a recent prompt edit? Memory file change? Scope expansion? The trigger determines the response.

3. **If prompt edit caused it:** Review the diff. Re-add the removed rule. Run `migrate-memory.mjs --check` and `test-behavior.mjs`.

4. **If memory was lost:** Restore from version control if possible. If not, treat the agent as Level 0 for the affected domain and run the correction cycle again with higher frequency.

5. **If scope expansion caused it:** Label the new domain explicitly. Add a memory entry: "Domain X is new as of [date]. Expect corrections during initial phase." Run the six-week cycle for the new domain in parallel with the existing domain.

6. **If context drift caused it:** Audit `long-term.json` and `core.json` for corrections that reference deprecated patterns. Compost them explicitly via `memory-manager.mjs compost`. Do not delete — compost preserves the reasoning history while marking entries as no longer active.

7. **After responding:** Add the regression event to `core.json` as a failure memory: what happened, what triggered it, how it was resolved. This ensures the next regression of the same type is caught faster.

---

## The Meta-Cycle: How the System Learns About Itself

The six-week agent maturation cycle operates inside a larger system-level learning cycle. As agents mature, they generate signals that feed back into the framework itself:

- **Defeat tests grow** — each iteration adds tests for newly discovered anti-patterns
- **Reviewer checklists grow** — each iteration adds review criteria at a higher level
- **Pattern hunt improves** — as more review history accumulates, pattern detection becomes more accurate
- **The framework documents update** — case studies, lessons, and maturity indicators are refined based on real agent history

The end state is not a fully mature agent. It is a fully mature system — one where the agents, the review loop, the memory system, and the defeat tests are all calibrated to the specific failure modes and quality standards of this project.

That state is never final. New agents join. The codebase evolves. New failure modes appear. The cycle begins again at a higher baseline.
