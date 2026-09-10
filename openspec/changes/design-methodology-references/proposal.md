# Proposal: design-methodology-references

**Date**: 2026-09-10
**Author**: Claude Opus 5 (1M context) with Bryce
**Status**: proposed

---

## Problem

The `jony-ive-design` skill is 574 lines across `SKILL.md` and four references. It is
coherent, it is well written, and it has two structural weaknesses that show up the
moment it is pointed at the work Bryce actually does.

**1. It gives adjectives where it needs to give rules.**

The skill says "reduce cognitive load," "bring order to complexity," "care in the
unseen." Every one of those is true and none of them settles an argument. Two people
who disagree about a screen can both claim the principle. A methodology that cannot
be used to *decide* is a mood, not a method.

Bryce's requirement, stated directly: *"Decision rules, not adjectives. 'Reduce
cognitive load' is not a rule. 'If a screen asks for something the system already
knows, it's wrong' is."*

**2. Its evidence base is Apple consumer hardware, and the target is neither.**

The case studies are iMac, iPod, iPhone, unibody MacBook, MacBook Air, Mac mini —
six physical consumer products. The design language file says *"default to roomy;
increase density only where the task genuinely demands it."*

The work this skill is being pointed at is **Nels Workshop OS**: a consulting
operating system for a one-person workshop whose clients are small and medium
businesses. Per `~/nels-workshop/plans/`, it has two audiences with opposite needs:

- **Operator screens** — one expert user, daily, scanning engagements, deliverables,
  needs, agent queues, expenses. Density is a *feature*. "Default to roomy" is
  actively wrong here.
- **Client screens** — an occasional visitor with no context, who must not feel
  stupid. Calm is the requirement.

Nothing in the current skill distinguishes these. Applied literally, it would make
the operator console worse.

**3. It has no stated boundary, so it will be misused.**

The skill declares itself "NOT UI/visual styling" in its description and then ships
`references/design-language.md`, which specifies color, type, spacing, motion, radii
and density. That file is good, but it means the skill *does* contain surface-level
guidance while claiming not to. The boundary is asserted, not enforced, and there is
nothing telling a reader what the methodology explicitly does **not** decide. It will
end up being quoted in an argument about a shade of blue.

---

## Discovery

- **The skill lives in this repo.** `~/.claude/skills/jony-ive-design` is a symlink to
  `~/agentic-sdlc/skills/jony-ive-design`. Editing it is a change to *this* repo and
  follows this repo's OpenSpec workflow. The component library is a separate repo with
  its own change (`design-system-and-when-to-use`) — the two must not bleed.
- **Existing references are worth keeping.** `philosophy-and-quotes.md` already flags
  unverified quotes as unverified — the right instinct, and the pattern the new
  material should follow.
- **A research inbox exists** at `~/component-library/_research/inbox/`. Bryce supplied
  a "20 UX Laws" cheatsheet (Hick, Fitts, Miller, Doherty, Zeigarnik, the Gestalt
  grouping laws, and others). That list is *already shaped like decision rules*, which
  makes it the most directly useful input — and the most dangerous, because several of
  those "laws" are folklore, misattributed, or stretched far past their evidence.
- **Miller's Law and Hick's Law are routinely weaponised** to justify hiding
  functionality from expert users. On a daily-use operator console that is the wrong
  call. Boundary conditions matter more than the laws themselves.

---

## Proposed Solution

Add five focused references. Touch `SKILL.md` in two places only.

| File | What it is for |
|---|---|
| `references/decision-rules.md` | The core deliverable. Rules with a testable trigger and a stated consequence. Each rule is falsifiable — you can look at a screen and say whether it is violated. Organised by decision type, not by phase. |
| `references/dense-and-operator-tools.md` | The gap Apple material does not cover. Information density, data tables, expert-vs-novice users, and the operator/client two-register split as an explicit rule set. |
| `references/ux-laws-and-evidence.md` | All 20 laws from the inbox, each traced to primary research, converted into a rule, and given an explicit **"does not apply when."** Folklore marked as folklore. Contested findings shown as contested. |
| `references/critique-operator-tools.md` | The critique checklist sharpened for dense data and operator screens, with red flags specific to this class of tool. |
| `references/boundaries.md` | What this methodology does **not** decide, and where those decisions actually live. The guard against the skill being used to argue about colours. |

**Editorial standards, binding on all five files:**

1. **Every rule has a trigger and a consequence.** "If X, then it is wrong / then do Y."
   No rule may consist of an adjective.
2. **Every factual claim carries a source URL.** Primary sources preferred.
3. **Where sources disagree, both positions are stated with attribution.** Tufte vs
   Few on data-ink, Norman vs Ive-era Apple on aesthetics-over-usability. No averaging.
4. **Folklore is labelled FOLKLORE.** Unverified attributions are labelled UNVERIFIED.
5. **Every rule that has a boundary states it.** A rule that always applies is suspect.

**`SKILL.md` changes — minimal and justified:**
- Add the five new files to the `## References` list.
- Add a short pointer to `boundaries.md` in the section that currently asserts the
  product-vs-visual distinction, so the boundary is *enforced by a document* rather
  than asserted in a sentence.

Nothing else in `SKILL.md` changes. The five phases, the principles and the critique
process are sound and are not being rewritten.

---

## Non-Goals

- **Rewriting the existing four references.** They stay. `design-language.md` keeps its
  scope; `boundaries.md` will state where it hands off to the component library rather
  than duplicating or replacing it.
- **Making this skill into a visual design system.** That is the component library's
  job, in its own repo, under its own change. This skill will point at it and stop.
- **Turning the skill into a UX-law encyclopedia.** The laws file exists to *filter*
  the 20 laws down to the few that survive scrutiny and to say plainly where each one
  stops applying.
- **Hagiography.** Documented criticism of Ive-era Apple design (the Norman &
  Tognazzini critique among others) is included, because a methodology that cannot
  hear criticism of its namesake is not usable.

---

## Value Analysis

The skill becomes able to settle an argument. Today, two people disagreeing about an
operator screen can each quote it. After this change, the rule either fires or it does
not — and where it does not apply, the file says so instead of leaving the reader to
over-apply a consumer-hardware instinct to a dense B2B tool.

It also becomes safe to point at Nels Workshop OS, which is the immediate consumer:
`plans/discovery-answers.md` records that design principles are a **blocking
dependency** — *"Requirements may be drafted now; nothing is built until both arrive."*

---

## Risks

- **Rule sprawl.** Fifty rules is a document nobody reads. Mitigation: rules must earn
  their place; prefer a smaller set with sharp boundaries over completeness.
- **False precision.** Converting a soft principle into a hard rule can invent
  authority the evidence does not support. Mitigation: the evidence-grade labels
  (EMPIRICAL / HEURISTIC / FOLKLORE) are mandatory, and a heuristic must never be
  written as though it were a finding.
- **Boundary erosion.** `boundaries.md` only works if it is actually read. Mitigation:
  it is linked from `SKILL.md` at the point the distinction is claimed, not buried at
  the bottom of a reference list.
