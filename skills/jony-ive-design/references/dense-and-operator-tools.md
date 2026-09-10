# Dense Interfaces and Operator Tools

Most design writing — including most of this skill — is about consumer products used
occasionally and casually. This file covers what that literature does not: screens an
expert stares at for hours, where density is a feature and "default to roomy" is wrong.

---

## The first decision: which register is this?

**Name the register before deciding anything else.** It determines density, which sources
apply, and what "good" means. Getting it wrong is the root error; row heights are
downstream.

| | **Operator** | **Client** |
|---|---|---|
| Who | One expert, or a few | An occasional visitor |
| How often | Daily, for hours | Rarely, briefly |
| Context carried in | High — knows the domain and the data | None — may not know the vocabulary |
| Optimised for | Scanning, comparison, throughput | Comprehension, reassurance |
| Errors they make | **Slips** (right goal, wrong execution) | **Mistakes** (wrong model) |
| Density is | A feature | A threat |
| Motion is | Overhead | Sometimes worth it |
| Confirmation dialogs | Expensive — they train dismissal | Cheap — repetition is low |
| Failure mode | Too sparse: endless navigation to see one thing | Too dense: intimidation, abandonment |

**The rule:** a surface belongs to exactly one register. A screen serving both audiences
is two screens that have not been separated yet.

**The most expensive mistake is applying operator density to a client surface.** An
intimidated client disengages, and you rarely find out why.

---

## Which source governs which surface

These three disagree. They are **not averaged** — they are assigned.

### Tufte governs analytical operator surfaces
Cross-referencing, comparison, pattern-finding. Density here is genuinely good: a trained
eye extracts more per glance from a dense, well-structured display than from a sparse one.
The core claim — *"Above all else show the data"* — and the devices that serve it (small
multiples, sparklines embedded in tables) exist to raise information per unit of attention.
The instinct to summarise-and-hide is usually a failure of nerve.
Source: Tufte, *The Visual Display of Quantitative Information* (1983/2001);
https://www.edwardtufte.com/notebook/chartjunk/

### Few governs glanceable monitoring surfaces
Checked repeatedly for exceptions. Two hard rules:
1. **One screen. No scrolling, no tabs.** *"Something critical is sacrificed when the
   viewer must lose sight of some data in order to scroll down or over... One of the
   great benefits of a dashboard is the simultaneity of vision."*
2. **Precision beyond decision-relevance is pure cost.** `$3.8M`, not `$3,848,305.93` —
   *"[extra precision] just slow[s] them down without benefit."*
Source: Few, "Common Pitfalls in Dashboard Design" —
https://perceptualedge.com/articles/Whitepapers/Common_Pitfalls.pdf

### GOV.UK governs the client register
Its table guidance is the direct opposite of Tufte, and correct for its audience:
*"If possible, you should aim to have less data in your tables. If you have a lot of data,
try to organise it into multiple tables or multiple pages."* GOV.UK is unusually
evidence-driven — its error-message patterns were tested with users in live services.
Source: https://design-system.service.gov.uk/components/table/

**Tufte and Few are both pro-density relative to naive minimalism** — Few wants everything
on one screen rather than spread across tabs. They diverge on *precision*, not on
information. Tufte's context is analysis; Few's is monitoring.

---

## The chartjunk disagreement, unresolved

Tufte's data-ink ratio says maximise the proportion of ink that encodes data; erase the
rest. It is a design-critic's argument, not an experimental finding — it was never built
on comprehension studies.

**Bateman et al. (CHI 2010), "Useful Junk?"** tested it. Findings: accuracy in describing
embellished charts was *no worse* than plain charts, and **recall after two to three weeks
was significantly better**. Participants preferred the embellished versions.
https://sites.stat.columbia.edu/gelman/communication/Bateman2010.pdf

**Do not resolve this.** They measured different things:
- Tufte's claim concerns analytical rigour and truthfulness of encoding.
- Bateman measured *memorability in one-time viewing* — closer to journalism than to a
  dashboard checked fifty times a day.
- Neither measured speed of interpretation for a repeat expert user, which is the outcome
  that actually matters for an operator tool.

The honest position: for an operator surface, follow Tufte, because the user does not need
to *remember* the chart — they will look again in an hour. For a client-facing one-time
report, Bateman's finding is live evidence that embellishment may help.

**A mild point in Tufte's favour, from NN/g:** making information salient does not always
mean adding emphasis — their dashboard example found plain numerals read faster than the
same numbers paired with decorative icons.
https://www.nngroup.com/articles/complex-application-design/

---

## Density is not a substitute for teaching

**NN/g's satisficing finding, which density enthusiasts should sit with:** *"even users of
complex applications tend to plateau at mediocre performance... the majority of users do
not transition to true expert usage with the systems they use when left to their own
devices."*

**Consequence:** density alone does not produce an expert. In-context accelerators and
tips do. A dense screen with no teaching produces a user who has memorised three of its
forty capabilities and works slowly forever.
Source: https://www.nngroup.com/articles/complex-application-design/

This is also why the "power user" justification for hiding nothing is incomplete: your
power user is probably not one yet.

---

## Concrete numbers

Adjectives are not specifications. These are published values from systems built for
density.

**IBM Carbon data table row heights** —
https://carbondesignsystem.com/components/data-table/style/

| Size | Height |
|---|---|
| Extra small | 24px / 1.5rem |
| Small | 32px / 2rem |
| Medium | 40px / 2.5rem |
| Large | 48px / 3rem |
| Extra large | 64px / 4rem |

Also from Carbon: header row height **must match** body row height — never mix. Column
headers 14px semibold; row text 14px regular; column padding 16px. Toolbar caps at **5
actions** before requiring overflow. Row hover should *always* be enabled, because it helps
the eye track across columns even when the row is not interactive.

**Apple macOS — the density endorsement hiding in the HIG** —
https://developer.apple.com/design/human-interface-guidelines/typography

| | macOS | iOS |
|---|---|---|
| Default body text | **13pt / 16pt line height** | 17pt / 22pt |
| Default control size | **28×28pt** | 44×44pt |
| Minimum control size | **20×20pt** | 28×28pt |
| Dynamic Type | **Not supported** | Supported |

macOS body text is ~24% smaller than iOS by design, and its control targets are ~35–45%
smaller, because it assumes pointer precision rather than finger contact. This is the
strongest primary-source justification for building denser than mobile convention
suggests. **But 20×20pt is Apple's own accessibility floor** — going below it fails their
bar, and "dense" is not a licence for unlimited shrinking.

**Contrast** — 4.5:1 minimum for text up to 17pt; 3:1 for 18pt+ or bold. Apple's own
aspirational bar for custom colours is **7:1, especially in small text** — worth adopting
for dense tables, where small text is the norm.
https://developer.apple.com/design/human-interface-guidelines/accessibility

---

## Patterns that scale up with density

These get *better* as data volume grows, rather than needing to be discarded:

- **Alternating row colours.** Apple's macOS guidance explicitly endorses zebra striping:
  *"Alternating colors can help people track row values across columns, especially in a
  wide table."*
- **Click-to-sort, click-again-to-reverse**, and resizable columns.
- **Outline views** for hierarchical data, rather than flattening a tree into a table.
- **Scope bars and filter tokens** — a removable pill per active filter (`customer: Acme ×`).
  Compound filtering is more valuable in a dense tool than in a consumer app, not less.
- **Freeze the header row and first column** on large tables; use borders, striping and
  hover to help users keep their place. (NN/g)
- **Batch actions via checkbox selection plus an action bar**, rather than crowding
  per-row icon buttons into every row. (NN/g)
- **Batch undo.** Operator tools mass-edit; undoing forty individual changes one at a time
  is not undo. Apple: *"consider giving people the option to revert multiple changes at
  once."*
- **A non-modal panel, not a modal sheet**, for any look-up → apply → look-again workflow.
  Apple is explicit: use a panel *"if people need to repeatedly provide input and observe
  results."*
- **Mid-string truncation** for IDs and filenames, which preserves both ends.

**NN/g's four table tasks** — every dense table must support all four: find records
matching criteria; compare data; view/edit/add a single row; take action on records.
https://www.nngroup.com/articles/data-tables/

---

## Where the Apple HIG is not authoritative here

The HIG's consistent bias is toward *reducing* on-screen information — progressive
disclosure, "avoid overcrowding," a maximum of three toolbar groups, a two-level sidebar
cap. That bias is correct for consumer apps and wrong for an operator scanning maximum
information per screen.

**Specifically not transferable:**
- **"Apply colour sparingly... one primary action."** A dense tool legitimately needs many
  simultaneous colour-coded status indicators; colour is the fastest scanning signal in a
  200-row table. Apple's one-accent norm would hurt scannability here.
- **Translucent chrome (Liquid Glass).** A legibility risk over scrolling data. Note that
  Apple itself reaches for the more opaque variant *"when components have a significant
  amount of text"* — tacit confirmation that density wants opacity.
- **The two-level sidebar cap.** If the domain genuinely has Client → Engagement →
  Deliverable → Task, a searchable tree may serve the operator better. This rule is
  navigation aesthetics, not a usability finding for experts who have memorised their
  hierarchy.
- **"Avoid offering an app-specific appearance setting."** Native-only advice. Web apps
  need their own theme control.
- **watchOS list guidance** ("limit the number of rows") — the exact opposite of what a
  dense tool needs. Ignore it.

**Where macOS and iOS HIG disagree, take macOS** for a desktop-class operator tool: the
control sizes, the body text size, the split-view guidance, the modal-sheet model. Do not
split the difference — the numbers differ because the input device differs.

**What the HIG has no answer for at all:** dense data-grid interaction mechanics
(virtualisation, column pinning, shift-click multi-select, inline cell editing, keyboard
navigation between cells), row-density presets, forms as compositions, inspector panels,
command palettes, keyboard-shortcut systems, multi-tenancy, permissions, audit trails, and
bulk operations at scale. These are the core of an operator tool and Apple is silent on
every one.

---

## The disagreement with this skill's own design language

`design-language.md` says: *"default to roomy; increase density only where the task
genuinely demands it."*

For the **client register**, that is right. For the **operator register**, it is wrong —
the task demands density as a matter of course, and treating density as the exception
produces a tool that requires constant navigation to see what should be visible at once.

This is recorded as a disagreement rather than resolved. The register decides which
applies.

---

## Operator-tool red flags

- A summary with no path to the detail behind it.
- Precision beyond what any decision needs.
- An action reachable only by hover.
- A confirmation dialog on a routine, reversible action — it trains dismissal and disarms
  the dialogs that matter.
- Auto-dismissing anything the operator must act on.
- A dashboard that requires scrolling to see the thing it exists to monitor.
- Undo that only reverses one row after a bulk edit.
- A modal blocking a look-up → apply → look-again loop.
- Colour as the only encoding of status.
- Animation on an interaction that happens hundreds of times a session.
- A screen serving both an operator and a client — that is two screens.
