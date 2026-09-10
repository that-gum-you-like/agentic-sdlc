# Decision Rules

Rules, not adjectives. Every rule below states a **trigger** you can check against a real
artifact, a **consequence**, a **boundary** where it stops applying, an **evidence grade**,
and a **source**.

A rule with no boundary is a slogan. If you cannot say when a rule does *not* fire, you do
not understand it well enough to apply it.

**Evidence grades**

| Grade | Meaning |
|---|---|
| `EMPIRICAL` | Real research, replicated, correctly applied |
| `EMPIRICAL / MISAPPLIED` | Real research routinely stretched past its evidence |
| `CONTESTED` | Real research, but replication or meta-analysis undercuts it |
| `HEURISTIC` | A useful rule of thumb; never was an experimental finding |
| `FOLKLORE` | Attribution wrong, or invented by the design blogosphere |
| `REVERSED` | Was sound; its own field has since argued against it |
| `PRACTICE` | Derived from working practice with a named, citable advocate |

---

## A. Whether to build it at all

### A1 — The one-sentence test
**Trigger:** Ask three people on the team what this is for. They give different sentences,
or hedge.
**Consequence:** It is not a product yet, it is a pile of features. Stop and resolve the
essence before any further design work. This is the finding — do not proceed past it.
**Boundary:** Does not apply to deliberately exploratory prototypes whose stated purpose
is to *find* the essence. Those are allowed to be vague; shipping things is not.
**Grade:** `HEURISTIC`
**Source:** The skill's Phase 1. Consistent with Rams's Principle 4 (understandable) —
https://www.vitsoe.com/gb/about/good-design

### A2 — Appetite, not estimate
**Trigger:** Someone asks "how long will this take?" before anyone has said how much time
it is *worth*.
**Consequence:** Wrong question. Set the appetite first — the amount of time this is worth
— then fix that and vary the scope to fit. An estimate makes scope fixed and time
variable, which is how six-week projects become six-month projects.
**Boundary:** Does not apply to genuine external deadlines (a regulatory date, a client
launch), where the time is set for you and the only variable is scope. That is still fixed
time / variable scope; you just did not choose the number.
**Grade:** `PRACTICE`
**Source:** Shape Up, ch. 2 — https://basecamp.com/shapeup/1.1-chapter-02

### A3 — The tenth
**Trigger:** A feature is named with a noun everyone thinks they understand — "a calendar,"
"reporting," "a dashboard."
**Consequence:** You cannot build what that noun means to them. Ask which tenth of it
matters, and build that. Basecamp's own example: past versions had calendars, ~10% of
customers used them, and six weeks buys about a tenth of what people picture when they say
"calendar" — so the question becomes *which* tenth.
**Boundary:** Does not apply where the noun is a genuine standard with an
interoperability requirement (a real iCal feed, a real CSV export). There, partial is
broken.
**Grade:** `PRACTICE`
**Source:** Shape Up, ch. 2 — https://basecamp.com/shapeup/1.1-chapter-02

### A4 — Say no by default
**Trigger:** A feature request arrives from a client or a user.
**Consequence:** The default answer is "not now." Record it. Build it only if the same
underlying problem recurs from multiple directions — the recurrence is the signal, not the
first ask.
**Boundary:** Does not apply when the request reveals the thing is *broken* for its stated
purpose. A bug dressed as a feature request is a bug.
**Grade:** `PRACTICE`
**Source:** 37signals, "Say No by Default" — https://37signals.com/podcast/say-no-by-default/

### A5 — Half a product, not a half-assed product
**Trigger:** The scope list has everything on it and the plan is to build all of it
shallowly.
**Consequence:** Cut the list in half, then cut it again, and build what remains properly.
A narrow thing that works completely beats a wide thing that works partially.
**Boundary:** Does not apply where a minimum set is genuinely interdependent — an auth
system without a password reset is not "half a product," it is a support burden.
**Grade:** `PRACTICE`
**Source:** Getting Real, "Half, Not Half-Assed" —
https://basecamp.com/gettingreal/05.1-half-not-half-assed

---

## B. What the system should already know

### B1 — The already-known rule
**Trigger:** A screen asks the user for a value the system already holds, can derive, or
asked for earlier in the same flow.
**Consequence:** It is wrong. Remove the field and supply the value. If it must be
confirmable, show it and let them correct it — do not make them type it.
**Boundary:** Does not apply where re-entry is the *point*: a deliberate confirmation of a
destructive or legally-binding action, or a security re-authentication. Those are asking
for intent, not for data.
**Grade:** `HEURISTIC`
**Source:** Apple HIG, Entering data — "Get information from the system whenever possible"
— https://developer.apple.com/design/human-interface-guidelines/entering-data

### B2 — Choose, don't type
**Trigger:** A field accepts free text but the set of valid answers is known and bounded.
**Consequence:** Offer the choices. Free text where a constrained set exists produces
inconsistent data, and the cleanup lands on the operator later.
**Boundary:** Does not apply where the bounded set is long *and* the user knows their
answer — then a combo box (type to filter against the set) beats both a raw text field and
a long picker.
**Grade:** `HEURISTIC`
**Source:** Apple HIG, Entering data —
https://developer.apple.com/design/human-interface-guidelines/entering-data

### B3 — Validate on entry, not on submit
**Trigger:** A form reports its errors only after the user presses the submit button.
**Consequence:** Validate each value as it is entered. Batch-at-submit turns one mistake
into a hunt.
**Boundary:** Does not apply to cross-field validation that genuinely cannot be evaluated
until several fields exist ("end date must follow start date" cannot fire before both are
set).
**Grade:** `HEURISTIC`
**Source:** Apple HIG, Entering data —
https://developer.apple.com/design/human-interface-guidelines/entering-data

### B4 — Never clear the user's work on error
**Trigger:** A form returns an error and the fields come back empty, or the offending
field has been reset.
**Consequence:** It is wrong. Return everything the user typed, including the wrong value,
so they can see and correct it. Clearing fields on error is a compounding punishment for a
mistake the design failed to prevent.
**Boundary:** Password fields, where returning the value is a security decision, not a
usability one. Say so explicitly rather than silently clearing.
**Grade:** `EMPIRICAL`
**Source:** GOV.UK Design System, error message component — guidance tested with users in
live services — https://design-system.service.gov.uk/components/error-message/

---

## C. Reduction

### C1 — Remove until it breaks, then add back the last thing
**Trigger:** You are deciding whether something is essential.
**Consequence:** Remove it and see what actually fails. Argument about necessity is
cheaper to settle by deletion than by discussion.
**Boundary:** Does not apply to anything whose failure mode is invisible in a demo —
audit trails, error recovery, permission checks, backups. These look removable and are
not. Test them by asking what happens in six months, not what happens on the happy path.
**Grade:** `HEURISTIC`
**Source:** The skill's Phase 2; Rams's Principle 10 —
https://www.vitsoe.com/gb/about/good-design

### C2 — Reduction is not unconditionally good
**Trigger:** The argument for removing something is "simplicity," with no named beneficiary.
**Consequence:** Not sufficient. Name who benefits and how. Norman's standing objection is
that pure logic-driven minimalism is "the engineer's fallacy" — users reward apparent
capability, and stripping features can lose the product rather than clarify it. Removal
still needs to be argued on its merits.
**Boundary:** Does not license feature creep. The rule is that "simpler" is not
self-justifying, not that "more" is better.
**Grade:** `PRACTICE` — and a genuine, live disagreement with Rams's Principle 10 and
Maeda's Law 1, both of which treat subtraction as close to unconditionally good. Do not
resolve this; know which side you are arguing.
**Source:** Norman, "Simplicity Is Highly Overrated" (2007) —
https://web.archive.org/web/20210119204011/https://jnd.org/simplicity_is_highly_overrated/

### C3 — Can one part do the job of four?
**Trigger:** Several components, screens or steps each do a piece of one job.
**Consequence:** Try to collapse them. Collapsing is usually a better move than deleting,
because it preserves capability while removing surface.
**Boundary:** Does not apply where collapsing produces a mode — one control that means
different things in different states. A mode is not a collapse; it is a hidden branch, and
it generates slips (see D3).
**Grade:** `HEURISTIC`
**Source:** The skill's Phase 2 (unibody lesson)

### C4 — Hick's Law does not license hiding things from experts
**Trigger:** Someone cites Hick's Law or Miller's "7±2" to justify reducing the options
visible to a daily expert user.
**Consequence:** Reject the argument. Hick's Law models reaction time for *novel,
undifferentiated* choice; an expert who knows which control they want is not choosing in
Hick's sense. Miller's 7±2 describes *recall from working memory*; a toolbar is a
re-scannable visual array, which is a different process. Neither supports the claim.
**Boundary:** Both laws *do* apply to genuinely first-encounter, novel choices —
onboarding, an unfamiliar client portal, a one-time flow.
**Grade:** `EMPIRICAL / MISAPPLIED` (both). Miller himself said there is nothing magical
about seven; Cowan (2001) revises capacity to ~4 chunks anyway.
**Source:** Hick 1952 — https://doi.org/10.1080/17470215208416600 · Miller 1956 —
https://psychclassics.yorku.ca/Miller/ · Cowan 2001 —
https://doi.org/10.1017/S0140525X01003922 · boundary conditions incl. Landauer & Nachbar
1985 — https://en.wikipedia.org/wiki/Hick%27s_law

---

## D. Errors, edges and the unseen

### D1 — The user is never the problem
**Trigger:** A defect report says "user error," or someone explains a failure by saying
the user should have known.
**Consequence:** Reclassify it as a design defect and fix the design. When people struggle
they blame themselves, which means self-blame is a *symptom of your failure*, not evidence
of theirs.
**Boundary:** Deliberate misuse and adversarial behaviour are a security problem, not a
usability one. Different response, and do not confuse them.
**Grade:** `EMPIRICAL`
**Source:** Norman, DOET ch. 5, "Human Error? No, Bad Design" — "The system is usually so
badly designed as to amplify the common tendency of all of us to err" —
https://library.ucsd.edu/dc/object/bb90798342/_2.pdf

### D2 — Diagnose the gulf before designing the fix
**Trigger:** Something "feels bad" and nobody can say why.
**Consequence:** Determine which gulf it is. **Gulf of Execution** — the user cannot
express what they want; the actions available do not match their intent. **Gulf of
Evaluation** — the user cannot tell whether it worked; the system's state is not legible.
They need opposite fixes: more expressive actions vs clearer feedback.
**Boundary:** None known. This is a diagnostic, not a prescription — it always applies,
and it always yields a different answer.
**Grade:** `EMPIRICAL`
**Source:** Norman, *User Centered System Design* (1986), DOET —
https://en.wikipedia.org/wiki/The_Design_of_Everyday_Things

### D3 — Slips and mistakes need different fixes
**Trigger:** Users are getting something wrong repeatedly.
**Consequence:** Classify first. A **slip** is the right goal, wrong execution — an
attention lapse. Fix with undo, constraints, confirmation on the irreversible, and better
targets. A **mistake** is the wrong goal or a wrong mental model. Fix with a clearer
conceptual model and more visible system state. Applying the slip fix to a mistake
produces a confirmation dialog that users click through while still doing the wrong thing.
**Boundary:** None. But note that operator tools generate slips at volume and mistakes
rarely, while first-time client screens generate mistakes and few slips — so the register
predicts which you are looking at.
**Grade:** `EMPIRICAL`
**Source:** Norman's taxonomy; NN/g summary —
https://www.nngroup.com/articles/user-mistakes/

### D4 — Signifiers, not affordances
**Trigger:** A control is technically available but nothing on screen says so — a
gesture, a hover-reveal, a clickable region that does not look clickable.
**Consequence:** It does not exist for most users. Add the signifier — the perceivable
cue that announces the action. Norman's own correction of his own term is direct:
*"Forget affordances: what people need, and what design must provide, are signifiers."*
**Boundary:** A deliberate power-user accelerator is allowed to be invisible **if** the
same action is reachable by a visible path. The keyboard shortcut may be hidden; the
action may not be the only way.
**Grade:** `EMPIRICAL`
**Source:** Norman, "Signifiers, not affordances" (2008) —
https://web.archive.org/web/20231209191033/https://jnd.org/signifiers-not-affordances/

### D5 — No action reachable only by hover
**Trigger:** An action appears on `:hover` and has no keyboard-reachable equivalent.
**Consequence:** It is broken. Keyboard and touch users cannot reach it. Add
`:focus-within` or make the action persistently visible.
**Boundary:** None. This is an accessibility floor, not a preference.
**Grade:** `HEURISTIC` (as a rule); the underlying requirement is `EMPIRICAL` via WCAG
keyboard-operability
**Source:** Apple HIG accessibility —
https://developer.apple.com/design/human-interface-guidelines/accessibility

### D6 — Warn on unexpected and irreversible; stay silent otherwise
**Trigger:** A confirmation dialog guards a routine, expected, reversible action.
**Consequence:** Remove it. Warnings are a budget — spend them only where data loss is
both unexpected and irreversible. Confirmations on routine actions train users to dismiss
dialogs reflexively, which disarms the ones that matter. Apple is explicit that even
destructive actions do not warrant an alert if they are common and undoable.
**Boundary:** Applies with more force in operator tools (high repetition) than in client
screens (low repetition, high anxiety), where one extra confirmation is cheap.
**Grade:** `HEURISTIC`
**Source:** Apple HIG, Feedback and Alerts —
https://developer.apple.com/design/human-interface-guidelines/alerts

### D7 — Success is silent; failure is loud
**Trigger:** The interface confirms every successful routine action with a toast or dialog.
**Consequence:** Stop confirming the expected. People assume their action worked; they
only need telling when it did not. Reserve success confirmation for actions important
enough that the user is genuinely uncertain.
**Boundary:** Does not apply where success is otherwise invisible — a background job, an
email sent, something whose effect is off-screen. Then confirmation *is* the feedback
(see D2, Gulf of Evaluation).
**Grade:** `HEURISTIC`
**Source:** Apple HIG, Feedback —
https://developer.apple.com/design/human-interface-guidelines/feedback

### D8 — Nothing important auto-dismisses
**Trigger:** A message the user must read or act on disappears on a timer.
**Consequence:** Make it persist until dismissed. Time-boxed elements fail anyone who
reads slowly, is interrupted, or is using assistive technology.
**Boundary:** Purely decorative or redundant confirmations may auto-dismiss, because
missing them costs nothing.
**Grade:** `HEURISTIC`
**Source:** Apple HIG accessibility, "Minimize use of time-boxed interface elements" —
https://developer.apple.com/design/human-interface-guidelines/accessibility

### D9 — The edges are part of the product
**Trigger:** A design review covers the happy path only. Empty, error, loading, first-run,
offline, zero, and too-many have not been drawn.
**Consequence:** The design is not done. These states are where care is actually visible,
and they are the majority of a real user's bad days.
**Boundary:** None for anything shipped. Throwaway prototypes are exempt — and must be
labelled throwaway, or they will ship.
**Grade:** `HEURISTIC`
**Source:** The skill's Phase 4; Rams's Principle 8 (thorough down to the last detail) —
https://www.vitsoe.com/gb/about/good-design

---

## E. Motion

### E1 — Motion explains or it goes
**Trigger:** An animation does not clarify a relationship — where something came from,
where it went, what changed.
**Consequence:** Remove it. Motion that only entertains costs time on every repetition.
**Boundary:** Marketing and first-run surfaces, where delight is a legitimate goal and
repetition is low. State which surface you are on before applying this.
**Grade:** `HEURISTIC`
**Source:** Apple HIG, Motion — "Don't add motion for the sake of adding motion" —
https://developer.apple.com/design/human-interface-guidelines/motion

### E2 — Never animate the frequent interaction
**Trigger:** An interaction that happens dozens of times per session carries a transition.
**Consequence:** Remove the motion from it. Apple's own guidance: *"In apps, generally
avoid adding motion to UI interactions that occur frequently."* An operator opening 200
rows pays your animation cost 200 times.
**Boundary:** Does not apply to the rare, orienting transition — entering a different
context, opening a modal — even in a dense tool.
**Grade:** `HEURISTIC`
**Source:** Apple HIG, Motion —
https://developer.apple.com/design/human-interface-guidelines/motion

### E3 — Reduced motion is honoured system-wide or not at all
**Trigger:** `prefers-reduced-motion` is handled in some parts of the product and not
others.
**Consequence:** That is a bug, not partial credit. The user asked once, globally. Honour
it everywhere — replace transitions with fades, tighten springs, drop z-axis animation.
**Boundary:** None.
**Grade:** `HEURISTIC` (rule); underlying accessibility requirement is a standard
**Source:** Apple HIG accessibility, Reduce Motion techniques —
https://developer.apple.com/design/human-interface-guidelines/accessibility

---

## F. Honesty

### F1 — No fake urgency, no dark patterns, no feature theater
**Trigger:** The interface creates pressure that does not correspond to a real constraint,
or presents a capability more impressively than it works.
**Consequence:** Remove it. Rams's Principle 6: honest design *"does not make a product
more innovative, powerful or valuable than it really is."*
**Boundary:** None.
**Grade:** `HEURISTIC`
**Source:** Rams, Principle 6 — https://www.vitsoe.com/gb/about/good-design

### F2 — Beauty makes people misjudge usability — guard against it
**Trigger:** A design is being approved because it looks good, or usability testing is
being run on a polished mockup.
**Consequence:** Discount the result. The aesthetic-usability effect is real and
replicated: people rate attractive interfaces as more usable than they are. This means
polish *contaminates your evidence*, and it means a beautiful broken thing will pass
review.
**Boundary:** It is a real effect on real users, so it is not fraudulent to make things
well — the rule is about not mistaking it for usability, and not exploiting it to paper
over defects.
**Grade:** `EMPIRICAL` — Kurosu & Kashimura 1995; replicated by Tractinsky (1997, 2000)
and Sonderegger & Sauer (2010)
**Source:** https://doi.org/10.1145/223355.223680 ·
https://en.wikipedia.org/wiki/Aesthetic-usability_effect

### F3 — Do not cite a law you have not checked
**Trigger:** A design argument rests on a named "law."
**Consequence:** Check its grade in `ux-laws-and-evidence.md` first. Several in common
circulation are satire (Parkinson), anecdote (Tesler), philosophy (Occam), or actively
disowned by their own field (Postel). Citing folklore as evidence weakens every other
argument you make.
**Boundary:** None.
**Grade:** `HEURISTIC`
**Source:** `ux-laws-and-evidence.md`

---

## G. Done

### G1 — Try to remove one more thing
**Trigger:** You believe the design is finished.
**Consequence:** Remove one more thing. If you can, it was not finished. If removing
anything breaks it, it is done.
**Boundary:** Do not apply this to the edges (D9) — they always look removable and never
are.
**Grade:** `HEURISTIC`
**Source:** The skill's Phase 4 self-critique

### G2 — Scope hammer, don't extend
**Trigger:** The appetite is nearly spent and the work is not finished.
**Consequence:** Cut scope to fit the time. Ask of each remaining item: is this a
must-have? Could we ship without it? Is this a new problem, or one the user already lives
with? Extending the deadline should be rare and should require that all remaining work is
genuinely must-have and has no open questions.
**Boundary:** Does not apply where the un-built remainder makes the whole unusable — see
A5. Cutting to a non-functional core is not scope hammering, it is failing.
**Grade:** `PRACTICE`
**Source:** Shape Up, ch. 14, "Decide When to Stop" —
https://basecamp.com/shapeup/3.5-chapter-14

### G3 — Inevitability is a test, not a feeling to wait for
**Trigger:** You are asking whether it is good enough.
**Consequence:** Look at it fresh and ask whether any part feels *contrived* — forced,
bolted-on, negotiated. Trace each contrivance back to the decision that caused it and fix
it there. "Inevitable" is the absence of traceable contrivance, which is checkable;
it is not a mood.
**Boundary:** Can be over-applied into paralysis. Pair it with G2 — the appetite bounds
how long you get to chase it.
**Grade:** `HEURISTIC`
**Source:** The skill's Phase 5

---

## What is not here

Colour, type, spacing, radii, component APIs, icon sets, breakpoints, animation values.
Those are not decided by this methodology — see `boundaries.md`.
