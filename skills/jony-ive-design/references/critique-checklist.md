# Critique Checklist & Evaluation Rubric

A rigorous, repeatable way to evaluate any design — a concept, a feature, a shipped product, your own work or someone else's. Use it for design reviews, go/no-go decisions, and self-critique before declaring something done.

Posture: **hard on the work, respectful of the maker.** Critique evaluates the design against the philosophy; it is not opinion or taste. Always point at the *decision*, never the person. Always trace a flaw back to where it entered the process.

---

## The evaluation rubric

Score each dimension honestly: **✅ resolved · 🟡 unresolved · 🔴 failing.** A design isn't done while anything essential is 🟡 or 🔴.

| # | Dimension | The question it answers | ✅ looks like |
|---|-----------|--------------------------|----------------|
| 1 | **Essence** | Can we state in one sentence what this is and why it exists? | Everyone gives the same crisp sentence. |
| 2 | **Function fit** | Does every part serve the essence? | Nothing is there "just because." |
| 3 | **Reduction** | Has everything inessential been removed? | Removing anything more would break it. |
| 4 | **Honesty** | Is it true to its material and function, free of fakery/dark patterns? | Nothing pretends to be what it isn't. |
| 5 | **Deference** | Does it serve the user and get out of the way? | The task/content is the star, not the UI. |
| 6 | **Simplicity-as-clarity** | Is complexity *ordered*, not hidden? | Clear on the happy path *and* off it. |
| 7 | **Care in the unseen** | Are edges, errors, empties, first-run designed? | The 2am/zero/too-many cases are graceful. |
| 8 | **Coherence** | Does it feel like one thing from one point of view? | No committee seams; one intent throughout. |
| 9 | **Family resemblance** | Does it feel like ours, regardless of stack? | Passes the `design-language.md` checklist. |
| 10 | **Inevitability** | Does it feel "of course," not contrived? | Fresh eyes feel calm, not friction. |
| 11 | **Genuinely better** | Is it better, not just different/new? | Improvement is real for the user, not novelty. |

---

## Red-flag catalog (name them plainly when found)

- 🚩 **No essence** — a pile of features; nobody can state the one sentence.
- 🚩 **Feature creep / "and also"** — added because easy, because a competitor has it, or because no one was brave enough to cut it.
- 🚩 **Decoration over purpose** — ornament/animation that serves ego, not understanding.
- 🚩 **Tail-wagging** — the design performing for attention instead of serving the task.
- 🚩 **Dishonest material** — fakery, gratuitous skeuomorphism, dark patterns, fake urgency.
- 🚩 **User self-blame** — people struggle and assume *they're* the problem.
- 🚩 **Careless edges** — broken/empty/error/first-run states left to chance.
- 🚩 **Superficially different** — flashy but not actually better for anyone.
- 🚩 **Negotiated incoherence** — committee compromise; no single point of view.
- 🚩 **Contrivance** — feels forced; the opposite of inevitable.
- 🚩 **Hidden, not ordered, complexity** — mess swept under a clean surface; leaks off the happy path.
- 🚩 **Started at the surface** — the team designed the look before resolving how it works.

---

## How to trace a flaw to its cause
Every visible problem was caused upstream. Match symptom → likely phase that failed:

- *Feels cluttered / too many features* → Phase 2 (reduction) skipped, or Phase 1 essence unclear.
- *Feels contrived / forced* → a wrong turn in Phase 3 (form), or essence never nailed.
- *Beautiful but doesn't work* → started at the surface; Phase 1/2 underdone.
- *Inconsistent, committee feel* → Phase 5 (integration) not done; no single point of view held.
- *Sloppy edges* → Phase 4 (refinement) stopped early.
- *Users blame themselves* → deference failure; re-walk the whole experience from the user's view.

Fix the cause, not the symptom.

---

## Copy-paste design review template

```
# Design Review: <product / feature>
Reviewer: <name>   Date: <date>

## 1. Essence (in one sentence)
<What is this and why does it exist? If unclear, that's the top finding.>

## 2. Rubric
| Dimension            | Score | Note |
|----------------------|-------|------|
| Essence              | ✅/🟡/🔴 | |
| Function fit         |       | |
| Reduction            |       | |
| Honesty              |       | |
| Deference            |       | |
| Simplicity-as-clarity|       | |
| Care in the unseen   |       | |
| Coherence            |       | |
| Family resemblance   |       | |
| Inevitability        |       | |
| Genuinely better     |       | |

## 3. What's working (name it specifically)
-

## 4. Red flags found (point at the decision, + which phase to revisit)
-

## 5. The bravest subtraction available
<The one thing that, if removed/collapsed, would most clarify the essence.>

## 6. Verdict
[ ] Ship  [ ] Refine (it's good but not done)  [ ] Rework (essence/form is wrong)
Single most important next step: <...>
```

---

## Self-critique discipline
Before you call your own work done:
1. Walk away, come back with fresh eyes — does it feel **inevitable** or **contrived**?
2. Try to remove one more thing. If you can, you weren't done.
3. Open the parts no one is supposed to see. Are they cared for?
4. Read your microcopy aloud. Does it shout, beg, or stay calm?
5. Ask the hardest question: *is this genuinely better, or just different?*
