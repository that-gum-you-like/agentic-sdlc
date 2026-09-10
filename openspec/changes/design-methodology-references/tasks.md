# Tasks: design-methodology-references

**Date**: 2026-09-10
**Status**: tasks

---

## 1. Research consolidation

- [x] 1.1 Consolidate the research into a citations table: claim → source → URL → evidence grade
- [x] 1.2 Reconcile the 20-laws verification against the supplied cheatsheet; list which laws survive, which are demoted, and why
- [x] 1.3 List the boundary conditions that disqualify Hick's and Miller's Laws as arguments for hiding functionality from expert users
- [x] 1.4 Extract the register-assignment mapping: Tufte → analytical operator surfaces, Few → glanceable monitoring, GOV.UK → client register
- [x] 1.5 Collect the concrete published numbers worth citing (Carbon row heights and toolbar cap; macOS 13pt body / 20×20pt minimum control size; contrast thresholds)

## 2. `references/decision-rules.md`

- [x] 2.1 Draft rules in the mandated form: trigger → consequence → boundary → grade → source
- [x] 2.2 Cover the decision types: whether to build it, what to remove, what the system should already know, which register, error and edge behaviour, and when it is done
- [x] 2.3 Fold in Norman's Gulf of Execution / Gulf of Evaluation as rules with observable triggers
- [x] 2.4 Fold in the slips-vs-mistakes distinction with a different prescribed response for each
- [x] 2.5 Fold in signifiers — whether a control announces itself
- [x] 2.6 Fold in Shape Up's appetite, scope hammering and circuit breaker as scope rules
- [x] 2.7 Cut every rule whose trigger is not checkable against an artifact
- [x] 2.8 Verify no rule consists of an adjective; verify every rule states a boundary

## 3. `references/dense-and-operator-tools.md`

- [x] 3.1 Define the operator and client registers by audience and task
- [x] 3.2 State register selection as the first decision, ahead of density and layout
- [x] 3.3 Write the Tufte / Few / GOV.UK assignment, preserving rather than averaging the conflicts
- [x] 3.4 Record the Tufte vs Bateman et al. chartjunk disagreement with both findings and their differing outcome measures
- [x] 3.5 Include the concrete numbers with sources
- [x] 3.6 Include NN/g's satisficing finding as a counterweight to density enthusiasm
- [x] 3.7 Record where the HIG is non-authoritative for this use case, and where macOS and iOS guidance disagree
- [x] 3.8 Add the cross-reference from `design-language.md`'s "default to roomy" line to this file's exception

## 4. `references/ux-laws-and-evidence.md`

- [x] 4.1 One section per law: primary source, what it actually claimed, verdict, boundary, criticism
- [x] 4.2 Apply the controlled grade vocabulary to all twenty
- [x] 4.3 Write the Miller's Law correction: Miller's own scepticism, Cowan's ~4-chunk revision, recall vs visual re-scanning
- [x] 4.4 Write the Zeigarnik correction, naming the Ovsiankina resumption effect as the actual mechanism
- [x] 4.5 Write the Postel reversal, citing RFC 9413
- [x] 4.6 Mark Parkinson's and Tesler's as FOLKLORE with reasons
- [x] 4.7 State the aesthetic-usability effect's ethical edge and its contamination of usability testing
- [x] 4.8 Note that the Gestalt laws are under-applied for dense screens, and that two of the five are Palmer & Rock 1994, not Wertheimer
- [x] 4.9 Add a summary table so the file is usable at a glance

## 5. `references/critique-operator-tools.md`

- [x] 5.1 Write the critique questions for dense and operator screens
- [x] 5.2 Write the operator-specific red flags, including hover-only actions, asking for what is already known, precision beyond decision-relevance, and untraceable summaries
- [x] 5.3 Add the gulfs and the slips/mistakes taxonomy as critique steps
- [x] 5.4 Preserve the existing distinction between "unresolved" and "wrong"
- [x] 5.5 Provide a copy-paste review template consistent with the existing one

## 6. `references/boundaries.md`

- [x] 6.1 Enumerate what the methodology does NOT decide
- [x] 6.2 Enumerate what it DOES decide
- [x] 6.3 Name the misuse explicitly — that it cannot settle an argument about a shade of blue
- [x] 6.4 Scope `design-language.md`: felt through-line and medium-agnostic defaults, not a project's token values, not a design system
- [x] 6.5 Point at `~/component-library` as where visual decisions live

## 7. Accuracy corrections to existing files

- [x] 7.1 Mark quotes in `philosophy-and-quotes.md` that no longer stand up: "designers wagging their tails", "deeply understand the essence", "personally work with a material with your hands"
- [x] 7.2 Confirm and keep what verified: Jobs's "design is how it works" (NYT Magazine 2003); Ive's "80% of the stuff in the studio is not going to work"; the self-blame observation (Time, 2007)
- [x] 7.3 Record that "Deciding what not to do..." comes from Isaacson's biography, not a contemporaneous interview
- [x] 7.4 Add the Norman & Tognazzini critique of Ive-era design as a counterweight, with its argument stated
- [x] 7.5 Add Rams's own hedge that the ten principles are "not... incontrovertible", and note their 1976 physical-product origin
- [x] 7.6 Add Norman's "Simplicity Is Highly Overrated" as the standing objection to unconditional reduction

## 8. `SKILL.md` — two edits only

- [x] 8.1 Add the five new references to the `## References` list
- [x] 8.2 Add the pointer to `boundaries.md` where the product-vs-visual distinction is claimed
- [x] 8.3 Verify nothing else changed: five phases, philosophy, principles, critique process, application sections, closing posture
- [x] 8.4 Check whether the header quote is among the unverified set and, if so, mark or replace it

## 9. Verification

- [x] 9.1 Every factual claim carries a source URL
- [x] 9.2 Every rule has a trigger, a consequence, a boundary and a grade
- [x] 9.3 No rule consists of an adjective
- [x] 9.4 Folklore is labelled; unverified attributions are labelled
- [x] 9.5 Conflicting sources are presented as conflicting
- [ ] 9.6 Dry-run the skill against a Nels Workshop OS operator screen and a client portal screen; confirm it produces different, defensible guidance for each
- [ ] 9.7 Confirm the skill still behaves correctly on a task unrelated to operator tools
- [ ] 9.8 Commit to `~/agentic-sdlc` — never to `~/languageapp`
