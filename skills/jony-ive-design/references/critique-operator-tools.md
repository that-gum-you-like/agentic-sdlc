# Critique Checklist — Dense Data and Operator Tools

The rubric in `critique-checklist.md` evaluates a product against the philosophy. It was
built for products in general. This one is sharpened for the class of tool that rubric
handles worst: information-dense screens used daily by an expert.

Use both. This one adds the questions the general rubric does not ask.

---

## Step 0 — Name the register. Everything depends on it.

Before any other question:

> **Is this an operator surface or a client surface?**

If the answer is "both," **that is the finding** — stop here. A screen serving a daily
expert and an occasional visitor is two screens that have not been separated. Applying one
set of standards to a mixed surface will produce a result that fails both audiences.

If operator, ask further: **analytical** (comparison, cross-referencing — Tufte applies) or
**glanceable monitoring** (exception-scanning — Few applies, one screen, rounded values)?

See `dense-and-operator-tools.md`.

---

## Step 1 — Walk a real task with real data volume

Not a mockup, not five seed rows. The failure modes of dense tools appear only at volume.

- Load it with a **realistic number of rows**. Then ten times that.
- Do the thing the operator does **most often**, and count the interactions it costs.
- Do it **again**, the way they would forty times a day. What is now annoying?
- Find the **longest string**, the **zero case**, the **too-many case**, the **stale data**
  case.

**Finding if:** the most frequent task costs more interactions than the rare one. Frequency
should buy shortness.

---

## Step 2 — The gulfs

For each significant action, ask both:

**Gulf of Execution — can they express what they want?**
- Is there an action for the thing they actually need, or only for an approximation?
- Do they have to do it four times because there is no bulk path?
- Do they have to leave the screen to get the value the action needs?

**Gulf of Evaluation — can they tell what happened?**
- After the action, is the new state visible without hunting?
- If the effect is off-screen, does anything say so?
- Can they tell the difference between "saved," "saving," and "failed silently"?

These need opposite fixes. Diagnose before prescribing.

---

## Step 3 — Classify the errors

For every place users get it wrong:

| | **Slip** | **Mistake** |
|---|---|---|
| What | Right goal, wrong execution | Wrong goal or wrong mental model |
| Cause | Attention lapse, similar targets, modes | The system's model isn't legible |
| Fix | Undo, constraints, distinct targets, confirmation on the irreversible | Clearer conceptual model, visible system state, better naming |

**Finding if:** the team's fix for a mistake is a confirmation dialog. That is the slip
remedy. Users will click through it and continue doing the wrong thing.

**Expect:** operator surfaces produce slips at volume; client surfaces produce mistakes.
If you find the opposite, the register may be misidentified.

---

## Step 4 — Density interrogation

- **Is anything here more precise than any decision requires?** Six decimal places, a
  timestamp to the second where the day would do, `$3,848,305.93` where `$3.8M` decides
  the same thing. Precision beyond decision-relevance is pure reading cost.
- **Can the summary be traced to its detail?** A number nobody can drill into is a number
  nobody can trust.
- **Does this monitoring surface fit on one screen?** If it scrolls or tabs, simultaneity
  of vision is lost, which is the thing a dashboard exists for.
- **Is anything hidden that the operator needs every time?** Progressive disclosure applied
  to a daily-use control is a daily tax.
- **Conversely — is anything visible that is needed once a quarter?** That is the real
  clutter.
- **Is Gestalt grouping doing any work?** Proximity, common region and connection are the
  tools that make density legible, and they are usually the least used.

---

## Step 5 — Scanning mechanics

- Can the eye **track a row across wide columns**? (Striping, hover, borders.)
- Are numbers **right-aligned and tabular**, so digits line up for comparison?
- Do **header and body row heights match**, and come from a scale rather than ad hoc values?
- Does the **header freeze** on scroll? The first column?
- Is **sort** available where it would be used, and does clicking again reverse it?
- Are the **four table tasks** all supported — find, compare, view/edit, act?

---

## Step 6 — Repetition costs

Every cost here is multiplied by frequency.

- **Motion on a frequent interaction.** Remove it. Two hundred rows means two hundred
  animations.
- **Confirmation on a routine, reversible action.** Remove it — it trains dismissal and
  disarms the dialogs that matter.
- **Success toasts on expected outcomes.** Remove them. Confirm failure, not success.
- **Latency.** For rapid keyboard-driven work, expert users need sub-100ms feedback; the
  often-cited 400ms threshold is too slow for this case.
- **Bulk operations.** Can they select many and act once? Can they **undo the batch**, not
  just the last row?

---

## Step 7 — Reachability

- **Any action available only on hover?** Broken. Keyboard and touch cannot reach it.
- **Every action reachable by keyboard**, with a visible focus state on `:focus-visible`?
- **Do dialogs behave as dialogs** — semantics exposed, focus moved in and trapped, focus
  restored on close, Escape works?
- **Is a modal blocking a look-up → apply → look-again loop?** That workflow needs a
  non-modal panel.
- **Is colour the only encoding of status anywhere?** Pair it with shape, icon or text.
- **Does anything the operator must act on auto-dismiss?**

---

## Step 8 — Does it teach?

Density alone does not create an expert. Most users of complex applications plateau at
mediocre performance and never discover the faster path unaided.

- Is there any **in-context** hint of the faster method — a shortcut shown next to the
  slow path, a tip at the point of use?
- Or does the tool assume a mastery it never offers to build?

---

## Operator-tool red flags

Name these plainly when found:

- 🚩 **Mixed register** — one screen serving an operator and a client.
- 🚩 **Asks for what it knows** — a field for a value the system already holds.
- 🚩 **False precision** — more digits than any decision needs.
- 🚩 **Untraceable summary** — a number with no path to its detail.
- 🚩 **Hover-only action** — unreachable by keyboard or touch.
- 🚩 **Dismissal training** — confirmations on routine reversible actions, which disarm the
  ones that matter.
- 🚩 **Partial undo** — bulk edit, single-row undo.
- 🚩 **Modal in a loop** — a blocking dialog inside a repeated look-up workflow.
- 🚩 **Colour-only status** — no redundant encoding.
- 🚩 **Animation tax** — motion on a high-frequency interaction.
- 🚩 **Scrolling dashboard** — a monitoring surface that cannot be seen at once.
- 🚩 **Daily control behind disclosure** — progressive disclosure applied to frequent use.
- 🚩 **Quarterly control in prime position** — the actual clutter.
- 🚩 **Demo-only data** — never tested at real volume.
- 🚩 **Slip treated as mistake** — a confirmation dialog deployed against a mental-model
  failure.
- 🚩 **No teaching** — no path from novice to fluent.
- 🚩 **Law-washing** — Hick's or Miller's cited to justify hiding things from an expert.

---

## Review template

```
# Operator Tool Review: <screen / flow>
Reviewer: <name>   Date: <date>

## 0. Register
[ ] Operator — analytical   [ ] Operator — glanceable monitoring   [ ] Client
[ ] MIXED ← if ticked, this is the top finding; stop and split the surface.

## 1. The task, walked at real volume
Most frequent task: <...>
Interactions it costs: <...>     Rows tested: <...>
What broke at volume: <...>

## 2. Gulfs
Execution (can they express intent?):  ✅/🟡/🔴  <note>
Evaluation (can they tell it worked?): ✅/🟡/🔴  <note>

## 3. Errors
Slips found: <...>       → fix: undo / constraints / targets
Mistakes found: <...>    → fix: conceptual model / visible state
Any slip-remedy applied to a mistake? <...>

## 4. Density
Precision beyond decision-relevance: <...>
Summaries without a path to detail: <...>
Monitoring surface fits one screen: yes / no
Hidden-but-frequent: <...>   Visible-but-rare: <...>

## 5. Scanning
Row tracking ✅/🔴 · Tabular numerals ✅/🔴 · Matching row heights ✅/🔴
Frozen header ✅/🔴 · Sort ✅/🔴 · Four table tasks ✅/🔴

## 6. Repetition costs
Motion on frequent actions: <...>
Routine confirmations: <...>
Batch actions + batch undo: ✅/🔴
Latency on rapid input: <...>

## 7. Reachability
Hover-only actions: <...>
Keyboard path to every action ✅/🔴 · Visible focus ✅/🔴
Dialog semantics + focus handling ✅/🔴
Colour-only status: <...>
Reduced motion honoured system-wide ✅/🔴

## 8. Teaching
In-context accelerators: <...>

## 9. Edges
Empty / error / loading / first-run / zero / too-many / stale / offline: <...>

## 10. Verdict
[ ] Ship   [ ] Refine (good, not done)   [ ] Rework (register or model is wrong)
Bravest subtraction available: <...>
Single most important next step: <...>
```

---

## Posture

Same as the general critique: **hard on the work, respectful of the maker.** Point at the
decision, not the person. Trace each flaw to where it entered.

One addition specific to this class of tool: **the operator is usually in the room, and is
often the person who built it.** Their workarounds are data, not embarrassment — a
spreadsheet kept alongside the tool is the sharpest finding available, because it tells you
exactly what the tool failed to do.
