# The Standard Look & Feel — A Portable Design Language

This is the "standard look" the skill protects: a recognizable family resemblance that makes every product feel like it came from the same hand — **even when the implementation, stack, or CSS is completely different.**

It is deliberately **not** a stylesheet, a color hex, or a component library. Those change per platform. What persists is a set of *experiential values made concrete*. A native iOS app, a Next.js site, a CLI, and a piece of hardware can share none of their code and still feel unmistakably like family. That shared feeling is the asset.

Apply this in **Phase 5 (Integration)** of the process, and again whenever you start a new product so it's born into the family.

---

## The feeling we're going for, in one breath
> **Calm, honest, inevitable, and quietly crafted.** It trusts the user. It never shows off. Nothing is arbitrary. It feels like it has always been this way.

If a product evokes that, it's family — regardless of how it's built. If it feels loud, busy, gimmicky, or apologetic, it isn't, no matter how on-brand the colors are.

---

## The nine through-lines

These translate the philosophy into a consistent felt experience. Each is medium-agnostic — there's a note on what it means for software, hardware, and writing/CLI.

1. **Restraint over decoration.** Remove until it breaks, then add back the last thing. Default to less. Whitespace, silence, and stillness are features. *Software:* generous spacing, few colors, one accent, type doing the work. *Hardware:* clean surfaces, no superfluous lines, hidden seams. *Words/CLI:* terse, no filler, no exclamation marks.

2. **One clear focal point per moment.** At any instant the user should know the one thing that matters. Hierarchy is brutal and obvious. Don't make people hunt. *Everywhere:* one primary action, one headline, one job per screen/step/state.

3. **Honest materials.** Let the medium be itself. Don't fake physicality without reason; don't disguise structure as ornament; no dark patterns; no fake urgency. *Software:* native platform behaviors, real data in prototypes, truthful loading/empty states. *Hardware:* the metal looks like metal. *Words:* say what's true, including limits.

4. **Calm, purposeful motion.** Motion explains, it never entertains. Every transition clarifies a relationship (where did this come from, where did it go). Nothing bounces for fun. Fast, smooth, then still. *Software:* short, eased, meaningful transitions; no gratuitous animation. *Hardware:* satisfying, damped mechanical action. *CLI:* minimal, legible progress; no spinner theater.

5. **Typographic discipline.** Type is the primary material of most digital products. A tight type scale, excellent default font, careful measure and rhythm, real hierarchy. Let typography carry the design before any graphic does. *Everywhere words appear, including CLIs and docs.*

6. **Deference to content and task.** The interface recedes; the user's content and goal take the stage. Chrome is minimal and gets out of the way. The product is a stagehand, not the star.

7. **Inevitable, obvious structure.** Layouts, flows, and information architecture feel like the only sensible arrangement. Predictable in the best way. If a user has to think about *where* something is, the structure failed.

8. **Cared-for edges.** Empty states, errors, first-run, offline, the long-name case, the zero case, the too-many case — all designed, never defaulted. This is the strongest family signal because almost no one does it. A product that handles its edges with grace *feels* premium even when plain.

9. **Quiet confidence in voice & detail.** No shouting, no jargon, no begging. Microcopy is plain, warm, and brief. Details are precise (alignment, rhythm, naming, defaults). Confidence is shown by what's left out.

---

## The concrete defaults (adapt per platform, keep the spirit)
When you do reach implementation, these defaults express the language. They are starting points, not rules — the *feeling* above governs.

- **Space:** generous and consistent; use a single spacing scale; let things breathe.
- **Color:** a restrained, mostly neutral palette + one accent used sparingly for the single most important action. Color earns its place; it is not decoration.
- **Type:** one excellent typeface (two at most), a small modular scale, comfortable line length, strong hierarchy.
- **Motion:** short durations, natural easing, reduced-motion respected; motion only where it clarifies.
- **Contrast & accessibility:** high legibility, AA+ contrast, keyboard/screen-reader honesty — accessibility *is* respect for the user, a core value, not a checkbox.
- **Shape & depth:** subtle, consistent radii and elevation; no heavy skeuomorphism without a functional reason.
- **Density:** default to roomy; increase density only where the task genuinely demands it (and then deliberately).

---

## The family-resemblance checklist
Run this in Phase 5 and before shipping. If you can't answer yes, you have integration work to do — not restyling, but resolving.

- [ ] In one breath, does it feel **calm, honest, inevitable, quietly crafted**?
- [ ] Could someone who's used another of our products tell this is **family** — without seeing a logo?
- [ ] Is there **one obvious focal point** in each moment/screen/step?
- [ ] Is every animation **explaining something**, or just performing?
- [ ] Are the **edges** (empty, error, first-run, extremes) designed, not defaulted?
- [ ] Is the **voice** plain, warm, brief, and free of shouting and dark patterns?
- [ ] Have we **removed** everything that doesn't serve the essence?
- [ ] Does the interface **defer** to the user's content and task?
- [ ] Would we be comfortable if the user inspected the **parts no one is supposed to see**?
- [ ] Does it feel **inevitable** — "of course" — rather than styled?

---

## Anti-patterns that break the family feel
- Trendy effects that will look dated in a year (chasing novelty over timelessness).
- Multiple competing accent colors / no clear hierarchy.
- Animation as entertainment; motion that delays the user.
- Marketing voice leaking into the product (hype, urgency, exclamation marks).
- Inconsistent spacing and type across screens — the tell of no single hand.
- Neglected empty/error states — the tell of no care.
- Borrowing another product's distinctive look — family resemblance comes from *values*, not imitation.
