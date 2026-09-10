# Boundaries — What This Methodology Does Not Decide

Read this before invoking the skill in an argument.

This methodology answers **what should this be, what is it for, and how should it work.**
It does not answer **what should it look like.** Those are different questions with
different evidence, and conflating them is how design discussions become unwinnable.

---

## The misuse, named plainly

> **This skill cannot settle an argument about a shade of blue. Quoting it in one is a
> misuse of it.**

If someone cites "quiet confidence," "restraint," "honesty" or "inevitability" to justify
a specific hex value, type size, radius or animation duration — they are using a product
methodology to win a visual argument it has no standing to decide. The correct response
is not to out-quote them. It is to move the decision to where it belongs.

---

## Not decided here

| Decision | Where it lives |
|---|---|
| Colour values, palettes, hex codes | The design system |
| Type families and type scales | The design system |
| Spacing values | The design system |
| Radii, shadows, elevation | The design system |
| Component APIs and props | The design system / the codebase |
| Framework and library choice | Engineering |
| Icon sets | The design system |
| Breakpoints | The design system |
| Animation curves and durations *as values* | The design system |
| Which of two acceptable layouts is prettier | Nobody. Ship one. |

**Where the design system lives:** `~/component-library`. Search it before building
anything: `node ~/component-library/bin/search.mjs <keywords>`.

---

## Decided here

- **Whether the thing should exist at all.**
- **What it is for**, stated in one sentence.
- **What gets removed** — and what the defended "no"s are.
- **Which register a surface belongs to** — operator or client. See
  `dense-and-operator-tools.md`. This is upstream of every visual decision and is the one
  most often skipped.
- **Whether a flow asks for something the system already knows.**
- **Whether the edges are designed** — empty, error, first-run, offline, zero, too-many.
- **Whether it is honest** — no fakery, no dark patterns, no feature theater.
- **Whether it is done**, or merely workable.

---

## The one genuine overlap: `design-language.md`

`references/design-language.md` is the exception that causes the confusion, so its scope
is stated here explicitly.

**What it is:** the portable, medium-agnostic through-line — the *felt* family
resemblance that persists across a native app, a web app, a CLI and a piece of hardware
that share no code. Plus a set of starting-point defaults.

**What it is not:**
- It is **not a design system.** It has no tokens, no scale, no values you can apply.
- It does **not define a project's colours, type or spacing.** Its "concrete defaults"
  are direction, not specification.
- It is **not an argument-settler for a specific value.** "Restrained palette + one
  accent" does not tell you which accent.

**One known conflict, recorded rather than hidden:** `design-language.md` says *"default
to roomy; increase density only where the task genuinely demands it."* For operator
screens — one expert user, daily, scanning — that is wrong. See
`dense-and-operator-tools.md`, which states the exception and the evidence. The two files
disagree, deliberately, and the register determines which one applies.

---

## The honest limit of this methodology

It is derived largely from Apple consumer hardware, refined by a designer working on
physical objects for a mass market. Much of it transfers. Some of it does not.

Where it is weakest:
- **Information-dense professional tools.** The source material is about products people
  use occasionally and casually, not screens an expert stares at for eight hours.
  `dense-and-operator-tools.md` exists because of this gap.
- **Multi-tenant, permission-aware, audit-trailed software.** No guidance at all.
- **Reduction as an unconditional good.** Don Norman's *"Simplicity Is Highly
  Overrated"* (2007) is a standing objection from someone who has thought about it
  seriously. The methodology does not have a good answer to it, and pretending otherwise
  would be dishonest.
- **Its own namesake's record.** Ive-era Apple shipped the butterfly keyboard, a mouse
  that cannot be used while charging, and an iOS 7 that removed the visual affordances
  telling users what was tappable. Norman & Tognazzini's *"How Apple Is Giving Design A
  Bad Name"* (Fast Company, 2015) argues the flat-design turn sacrificed
  discoverability, feedback and recovery for appearance. That critique is not an attack
  on the methodology — it is evidence for what happens when the visual instinct
  overrules the product one, which is precisely what this file guards against.

A methodology that cannot hear criticism of its namesake is not a methodology. It is a
fan club.

---

## If you are here to settle a disagreement

1. **Is it a question about what the thing does, or what it looks like?** Only the first
   is in scope.
2. **If it is about looks:** go to the design system. If the design system does not
   answer it, that is a gap in the design system — fix it there, not by escalating to
   philosophy.
3. **If both parties agree on function and disagree on surface:** the disagreement is
   taste. Pick one, ship it, and spend the argument budget on something that matters.
4. **If the disagreement keeps recurring:** it is usually not really about the surface.
   Go back to the essence. Two people who disagree persistently about how a thing should
   look often disagree about what it is for and have not noticed.
