# Spec: design-methodology

**Date**: 2026-09-10
**Status**: specs
**Capability**: NEW

---

## Overview

Extends the `jony-ive-design` skill with researched methodology, decision rules and
critique heuristics sharpened for information-dense operator tools — and with an
explicit statement of what the methodology does **not** decide, so it cannot be used to
argue about visual styling.

The skill remains PRODUCT THINKING. That boundary is the point of REQ-005 and must
survive this change.

---

### REQ-001: Rules Are Falsifiable, Bounded and Graded

**Statement:** Every rule the skill adds shall be stated so that a reader can look at a
design and determine whether the rule fires, and shall state where it stops applying.

**Acceptance Criteria:**
- [ ] Every rule states an observable **trigger** — a condition checkable against an
      artifact, not a quality to aspire to
- [ ] Every rule states a **consequence** — what is therefore true, or what to do
- [ ] Every rule states a **boundary** — the conditions under which it does NOT apply
- [ ] Every rule carries an **evidence grade** from the controlled set: `EMPIRICAL`,
      `EMPIRICAL / MISAPPLIED`, `CONTESTED`, `HEURISTIC`, `FOLKLORE`, `REVERSED`
- [ ] No rule consists of an adjective or an exhortation. "Reduce cognitive load" fails;
      "if a screen asks for something the system already knows, it's wrong" passes
- [ ] Every factual claim carries a source URL

#### Scenario: A rule is applied to a screen
- **WHEN** a reviewer holds a specific screen against a rule in `decision-rules.md`
- **THEN** the rule's trigger can be evaluated as fired or not fired without appeal to taste
- **AND** if the screen falls inside the rule's stated boundary, the rule does not fire

#### Scenario: An unbounded rule is rejected
- **WHEN** a candidate rule cannot state any condition under which it does not apply
- **THEN** it is treated as suspect and either given a boundary or cut

---

### REQ-002: Evidence Is Reported Honestly, Including Against the Source Material

**Statement:** The skill shall classify the design "laws" it cites by evidence grade,
mark folklore as folklore, mark unverified attributions as unverified, and present
disagreements between sources as disagreements.

**Acceptance Criteria:**
- [ ] All 20 laws from the supplied cheatsheet are graded, including those that grade badly
- [ ] `Parkinson's Law` and `Tesler's Law` are graded FOLKLORE, with the reason stated
      (satire by its own author; an interview quote with no underlying study)
- [ ] `Postel's Law` is graded REVERSED, citing RFC 9413 (2023), in which the IETF argues
      the robustness principle causes fragility
- [ ] `Zeigarnik Effect` is graded CONTESTED, citing the 2025 Ghibellini & Meier
      meta-analysis finding no memory advantage, and naming the **Ovsiankina resumption
      effect** as the mechanism actually behind progress-nudge patterns
- [ ] `Miller's Law` is graded EMPIRICAL / MISAPPLIED, recording that Miller himself
      called the number unmagical, that Cowan (2001) revises capacity to ~4 chunks, and
      that chunking describes recall rather than visual re-scanning
- [ ] Where sources conflict, both positions are stated with attribution and neither is
      averaged away — at minimum Tufte vs Bateman et al. on chartjunk, and
      Norman vs Rams/Maeda on whether reduction is unconditionally good
- [ ] Quotes that could not be traced to a primary source are marked `UNVERIFIED`

#### Scenario: Folklore is not laundered into fact
- **WHEN** a reader looks up a law used to justify a design decision
- **THEN** its evidence grade is visible alongside it
- **AND** a satirical or anecdotal origin is stated plainly rather than omitted

#### Scenario: Existing unverified quotes are corrected
- **WHEN** the skill's existing quote material is checked against the research
- **THEN** quotes with no traceable primary source are marked UNVERIFIED rather than
      left presented as verbatim

---

### REQ-003: The Operator/Client Register Split Is Explicit

**Statement:** The skill shall distinguish information-dense operator surfaces from calm
client-facing surfaces, and shall state which source governs which, rather than issuing
one density instruction for all screens.

**Acceptance Criteria:**
- [ ] The two registers are defined by **audience and task**, not by preference
- [ ] Determining the register is stated as the FIRST decision, preceding density,
      layout and component choices
- [ ] Tufte's density argument is scoped to analytical/comparative operator surfaces
- [ ] Few's one-screen and precision rules are scoped to glanceable monitoring surfaces,
      including the rule that precision beyond decision-relevance is interaction cost
- [ ] GOV.UK's reduce-and-split table guidance is scoped to the client register
- [ ] Concrete published numbers are included rather than adjectives — at minimum
      Carbon's row-height scale (24/32/40/48/64px) and its 5-action toolbar cap
- [ ] NN/g's satisficing finding is included as a counterweight, recording that most
      users of complex applications plateau rather than becoming experts unaided
- [ ] Rules that are commonly misused to hide functionality from expert users
      (Hick's, Miller's) are explicitly disqualified for that argument

#### Scenario: Density guidance is register-dependent
- **WHEN** a designer asks how dense a screen should be
- **THEN** the skill first requires the register to be named
- **AND** the guidance given for an operator console differs from that for a client portal

#### Scenario: The existing roomy-by-default guidance is reconciled
- **WHEN** a reader follows `design-language.md`'s "default to roomy" guidance
- **THEN** a cross-reference points to the operator-tools exception
- **AND** the disagreement is recorded rather than silently resolved

---

### REQ-004: Critique Is Usable on Dense Data and Operator Screens

**Statement:** The skill shall provide a critique checklist sharpened for operator tools,
covering the failure modes that consumer-product critique does not reach.

**Acceptance Criteria:**
- [ ] Norman's **Gulf of Execution** and **Gulf of Evaluation** are usable as critique
      questions against a specific screen
- [ ] Norman's **slips vs mistakes** distinction is present, with the design response for
      each stated separately (undo/constraints for slips; conceptual model and system
      state for mistakes)
- [ ] **Signifiers** are covered — whether a control announces itself — not only form
- [ ] Red flags specific to this class of tool are named, including: an action reachable
      only by hover; a screen that asks for something the system already knows;
      precision beyond decision-relevance; a summary that cannot be traced to its detail
- [ ] The checklist distinguishes "unresolved" from "wrong", consistent with the
      existing critique process

#### Scenario: Critiquing an operator console
- **WHEN** the checklist is applied to a dense internal screen
- **THEN** it surfaces findings that the consumer-product rubric does not reach

---

### REQ-005: The Methodology States What It Does Not Decide

**Statement:** The skill shall carry an explicit boundary document naming the decisions it
does not make and where those decisions live, so it cannot be invoked to settle a visual
styling argument.

**Acceptance Criteria:**
- [ ] `references/boundaries.md` exists and enumerates what is out of scope: colour
      values and palettes, type families and scales, spacing values, radii, shadows,
      elevation, component APIs, framework and library choice, icon sets, breakpoints,
      and animation values
- [ ] It enumerates what IS in scope: whether the thing should exist, what it is for,
      what gets removed, which register a surface belongs to, whether a flow asks for
      what is already known, whether edges are designed, whether it is honest, whether
      it is done
- [ ] It names the misuse explicitly — that this skill cannot settle an argument about a
      shade of blue, and that quoting it in one is a misuse
- [ ] It scopes `design-language.md`: that file defines the felt through-line and
      medium-agnostic defaults; it does not define a project's token values and is not a
      design system
- [ ] It points at `~/component-library` as where visual decisions actually live
- [ ] `SKILL.md` links to it at the point where the product-vs-visual distinction is claimed

#### Scenario: The skill is invoked in a styling argument
- **WHEN** someone cites the methodology to justify a specific colour or spacing value
- **THEN** `boundaries.md` states plainly that the methodology does not decide it
- **AND** points to where that decision belongs

---

### REQ-006: Existing Skill Material Is Preserved

**Statement:** This change shall add references and make minimal, justified edits to
`SKILL.md`. It shall not rewrite the existing methodology.

**Acceptance Criteria:**
- [ ] The five phases, core philosophy, eight principles and critique process in
      `SKILL.md` are unchanged
- [ ] `SKILL.md` edits are limited to: the `## References` list, and one pointer to
      `boundaries.md`
- [ ] `philosophy-and-quotes.md`, `design-language.md`, `critique-checklist.md` and
      `case-studies.md` are retained; changes to them are limited to accuracy corrections
      (unverified quote marking) and cross-references
- [ ] The skill's frontmatter `description` continues to state that this is product
      thinking, not UI/visual styling

#### Scenario: The skill still loads and behaves as before
- **WHEN** the skill is invoked for a product-design task unrelated to operator tools
- **THEN** the original methodology is intact and unchanged in behaviour
