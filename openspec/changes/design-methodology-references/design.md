# Design: design-methodology-references

**Date**: 2026-09-10
**Status**: design

---

## D1 — A rule has a trigger, a consequence, and a boundary

**Decision.** Every rule in `decision-rules.md` is written in the form:

> **Trigger** (an observable condition) → **Consequence** (what is therefore true, or what to do) → **Boundary** (when this rule does not fire) → **Grade** (evidence class) → **Source**.

A rule that cannot state its trigger as something you can *look at a screen and check* is not a rule and does not land. This is the difference between "reduce cognitive load" and "if a screen asks for something the system already knows, it's wrong."

**Why the boundary is mandatory.** The research is unambiguous that unbounded rules are how good findings become bad practice. Hick's Law and Miller's Law are the two most frequently cited to justify hiding functionality from expert users, and both have documented boundary conditions that make them inapplicable to trained, repetitive, daily use. A rule stated without its boundary will be over-applied — and the specific over-application here would damage the operator console this skill is being pointed at.

**Why the grade is mandatory.** The 20-laws list mixes three genuinely different epistemic categories under one label. Presenting a satirical essay (Parkinson) and a replicated 1954 motor-control experiment (Fitts) with the same authority is dishonest, and it makes the whole document easier to dismiss.

Grades used throughout:

| Grade | Meaning |
|---|---|
| **EMPIRICAL** | Real research, replicated, correctly applied |
| **EMPIRICAL / MISAPPLIED** | Real research routinely stretched past its evidence |
| **CONTESTED** | Real research, but replication or meta-analysis undercuts it |
| **HEURISTIC** | A useful rule of thumb; never was an experimental finding |
| **FOLKLORE** | Attribution wrong, or invented by the design blogosphere |
| **REVERSED** | Was sound, and its own field has since argued against it |

---

## D2 — The 20 laws are filtered, not transcribed

**Decision.** `ux-laws-and-evidence.md` reports the verification honestly, including where it is unflattering to the source Bryce supplied. The cheatsheet is an input, not an authority.

Findings that change what the file says:

- **Miller's Law ("7±2")** — the single most misused item. Miller documented a *coincidence* between two unrelated limits and said in the paper that there is nothing magical about seven. Cowan (2001) puts working memory at ~4 chunks. More fundamentally, chunking describes *recall from memory*; a toolbar is a **re-scannable visual array**, not something held in working memory. Graded EMPIRICAL / MISAPPLIED, and explicitly disqualified as an argument for limiting an operator's controls.
- **Zeigarnik Effect** — a 2025 systematic review and meta-analysis (Ghibellini & Meier) found **no memory advantage for unfinished tasks**. The real, supported phenomenon behind progress-nudge patterns is the **Ovsiankina resumption effect**, which is a different thing. Graded CONTESTED, with the correct mechanism named.
- **Postel's Law** — graded REVERSED. The IETF itself published RFC 9413 (2023) arguing the robustness principle *causes* fragility. Citing it approvingly in a design context, borrowed from a domain that has since disowned it, needs the caveat attached.
- **Parkinson's Law** — graded FOLKLORE. Written as satire by its own author, complete with a deliberately tongue-in-cheek formula.
- **Tesler's Law** — graded FOLKLORE. No primary study; it traces to an interview quote in a 2006 book, decades after the fact. Useful as an engineering maxim, and labelled as exactly that.
- **Occam's Razor, Pareto, Jakob's Law** — graded HEURISTIC. None is an empirical UX finding.
- **The Gestalt grouping laws** — graded EMPIRICAL, and flagged as **under-applied rather than over-applied**. They are the laws that actually help make dense screens legible, which is precisely the problem this skill needs to solve. Two of the five (Common Region, Uniform Connectedness) are Palmer & Rock 1994, not Wertheimer — the cheatsheet flattens seventy years.
- **Aesthetic-Usability Effect** — graded EMPIRICAL, with its ethical edge stated: it is a *perception* effect. Polishing a surface makes users misjudge how usable a thing is, and it contaminates usability testing. It is a bias to guard against, not a reward to farm.

**Why report the unflattering findings.** Bryce asked for folklore to be marked as folklore. A file that quietly dropped the weak laws would be less useful than one that says which of the twenty survive scrutiny and why — the filtering *is* the value.

---

## D3 — The operator/client split is the organising axis of the dense-tools file

**Decision.** `dense-and-operator-tools.md` is built around two registers with opposite optima, and states which source governs which.

The research supports a sharper distinction than "dense vs roomy":

- **Tufte** governs **analytical** operator surfaces — cross-referencing, comparison, pattern-finding. Density here is genuinely good: small multiples and sparklines exist to raise what a trained eye extracts per glance. "Above all else show the data."
- **Few** governs **glanceable monitoring** surfaces — checked repeatedly for exceptions. His hard rule is one screen, no scrolling, no tabs, because "simultaneity of vision" is the entire value; and precision beyond decision-relevance is pure interaction cost (`$3.8M`, not `$3,848,305.93`).
- **GOV.UK** governs the **client** register — its table guidance is, remarkably, *"you should aim to have less data in your tables... try to organise it into multiple tables or multiple pages."* That is the opposite of Tufte, and correct for its audience: low-context, first-time, often anxious users.

**These three are not averaged.** They are assigned to surfaces. The file states which register a screen is in *first*, because that determines which source applies. Getting the register wrong is the root error; picking a row height is downstream.

**Documented conflict, preserved:** Tufte's data-ink ratio was never built on comprehension experiments. Bateman et al. (CHI 2010, "Useful Junk?") found embellished charts were recalled significantly better after two to three weeks, with no accuracy penalty. That is a real challenge to the minimalist premise — but it measured *memorability in one-time viewing*, not speed for an operator checking a dashboard fifty times a day. Both findings are stated; neither is resolved into mush.

**Concrete numbers are included** rather than left as adjectives — Carbon publishes a real row-height scale (24/32/40/48/64px), a 5-action toolbar cap before overflow, and a rule that header and body row heights must match. A design methodology that says "dense" and stops has not helped anyone.

**NN/g's satisficing finding is included as a counterweight to density enthusiasm:** most users of complex applications *plateau at mediocre performance* and never become true experts unaided. Density alone does not produce an expert; in-context accelerators do. This prevents the file from becoming a licence to make everything dense and call it respect for the user.

---

## D4 — Norman is the counterweight, and the disagreement is kept

**Decision.** `decision-rules.md` and `critique-operator-tools.md` carry Norman's positions as live constraints, including where he directly contradicts the skill's own philosophy.

**The genuine conflict, kept rather than smoothed:** Rams's Principle 10 ("as little design as possible") and Maeda's Law 1 ("Reduce") treat subtraction as close to unconditionally good. Norman's essay **"Simplicity Is Highly Overrated"** (2007) argues the opposite in the market: users reward apparent capability, and pure logic-driven minimalism is "the engineer's fallacy." Norman is not pro-clutter — he argues designers must solve for both. The current skill inherits the Rams/Maeda axiom without ever meeting this objection.

**What Norman contributes that the skill currently lacks entirely:**

- **Signifiers, not affordances** — Norman's own public correction of his own term: *"Forget affordances: what people need, and what design must provide, are signifiers."* The skill talks about form and honesty but has no vocabulary for *how a control announces itself*, which is a daily operator-tool failure mode.
- **Gulf of Execution / Gulf of Evaluation** — the two gaps that make a tool feel bad: not being able to express an intent, and not being able to tell whether it worked. Both are directly testable on a screen.
- **Slips vs mistakes** — a slip is right goal, wrong execution; a mistake is a wrong goal or a wrong mental model. **They need different fixes** — undo and constraints for slips, better conceptual models and clearer system state for mistakes. Operator tools generate slips at volume, and treating them as mistakes produces the wrong design every time.
- **"Human error? No, bad design"** — which the skill already believes ("when they struggle, the design failed") but states as a value rather than as an actionable error taxonomy.

**Rams's own hedge is included**, because it is the best defence against dogmatism and it comes from Rams: the principles are *"not intended to be, nor can they be, regarded as incontrovertible."* Also noted: they were authored in 1976 for physical consumer objects, and "long-lasting" and "environmentally friendly" do not map cleanly onto software.

---

## D5 — `boundaries.md` names the handoff, and names the failure mode

**Decision.** The file states, in plain terms, what this methodology does **not** decide, and where each of those decisions actually lives.

Explicitly **not** decided here: colour values, palettes, hex codes · type families and type scales · spacing values · radii, shadows, elevation · component APIs and props · framework and library choice · icon sets · breakpoints · animation curves and durations as *values*.

Those live in `~/component-library` (the `design-system-and-when-to-use` change), which is a separate repo with its own workflow.

**What it does decide:** whether the thing should exist · what it is for, in one sentence · what gets removed · which register a surface belongs to (operator or client) · whether a flow asks for something already known · whether the edges are designed · whether it is honest · whether it is done.

**The named failure mode.** The file states the misuse directly: *this skill cannot settle an argument about a shade of blue, and quoting it in one is a misuse of it.* The current `SKILL.md` asserts the product-vs-visual boundary in prose and then ships `design-language.md`, which specifies colour, type, spacing, motion, radii and density — so the boundary is currently contradicted by the skill's own contents. `boundaries.md` resolves this by scoping `design-language.md` explicitly: it defines the *felt* through-line and the medium-agnostic defaults; it does not define a project's actual token values, and it is not the design system.

**Why this needs a file rather than a sentence.** A sentence in a 213-line `SKILL.md` will not survive contact with someone who wants the skill to back their position. A file that can be linked to, and that names the misuse explicitly, will.

---

## D6 — `SKILL.md` changes are two edits, and no more

**Decision.** Add the five files to `## References`. Add one pointer to `boundaries.md` where the product-vs-visual distinction is claimed.

**Not changing:** the five phases, the core philosophy, the eight principles, the critique process, the application sections, the closing posture. They are sound, Bryce did not ask for them to be rewritten, and the brief was explicit — *"Touch SKILL.md only where the new material genuinely changes it."*

**The one thing that genuinely changes:** the skill currently says *"default to roomy; increase density only where the task genuinely demands it"* (in `design-language.md`). For operator screens that is wrong. Rather than editing that line in place — it is correct for the client register and for most of what the file covers — `dense-and-operator-tools.md` states the exception explicitly and `design-language.md` gains a single cross-reference at that line. The disagreement is recorded rather than silently resolved, consistent with how the rest of this work handles conflicting sources.

---

## Open questions

- **How many rules is the right number.** The risk is a document nobody reads. The intent is a small set with sharp boundaries over a comprehensive catalogue; if `decision-rules.md` runs long during implementation, the fix is to cut rules that lack a crisp trigger, not to shorten the boundaries.
- **Whether the Ive criticism sits in the new files or in `philosophy-and-quotes.md`.** The Norman & Tognazzini critique of Ive-era Apple is a counterweight to the skill's namesake. It plausibly belongs beside the quotes it complicates. Resolved during implementation once the Ive-primary research lands, since the answer depends on how much of the existing quote file turns out to be unverifiable.
