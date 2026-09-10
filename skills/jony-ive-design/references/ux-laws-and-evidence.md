# The "20 UX Laws" — What Survives Scrutiny

A cheatsheet of twenty "laws" circulates widely and is often handed to AI assistants as
design guidance. It mixes three genuinely different things under one word:

1. Real, replicated experimental psychology.
2. Real research stretched far past what it tested.
3. Practitioner aphorisms, satire, and philosophy with no study behind them.

Presenting a satirical essay and a 1954 motor-control experiment with the same authority
is dishonest and makes the whole set easy to dismiss. This file grades each one.

**Before citing any law in a design argument, check its grade here.**

---

## Summary

| # | Law | Grade | The correction that matters |
|---|---|---|---|
| 1 | Hick's Law | `EMPIRICAL / MISAPPLIED` | Doesn't apply to list search or trained recognition |
| 2 | Fitts's Law | `EMPIRICAL` | Models pointing time only — not whether it's the right target |
| 3 | Jakob's Law | `HEURISTIC` | A practitioner maxim; no primary study |
| 4 | Miller's Law (7±2) | `EMPIRICAL / MISAPPLIED` | Miller himself was sceptical; Cowan says ~4; chunking ≠ visual scanning |
| 5 | Aesthetic-Usability Effect | `EMPIRICAL` | Real — and it contaminates your usability testing |
| 6 | Pareto Principle | `HEURISTIC` | Economics, not UX; the ratio isn't fixed |
| 7 | Occam's Razor | `HEURISTIC` | Philosophy of explanation, not interface complexity |
| 8 | Parkinson's Law | `FOLKLORE` | Written as satire by its own author |
| 9 | Postel's Law | `REVERSED` | The IETF published RFC 9413 arguing it causes fragility |
| 10 | Peak-End Rule | `EMPIRICAL` | Fails for day-long and multi-day experiences |
| 11 | Von Restorff Effect | `EMPIRICAL` | Self-defeating if you highlight everything |
| 12 | Zeigarnik Effect | `CONTESTED` | 2025 meta-analysis found no memory effect; you mean Ovsiankina |
| 13 | Tesler's Law | `FOLKLORE` | No study; an interview quote decades after the fact |
| 14 | Doherty Threshold | `EMPIRICAL` | Real, but built on Miller (1968); 400ms is too slow for experts |
| 15 | Goal-Gradient Effect | `EMPIRICAL` | Well-sourced; needs an actual goal to gradient toward |
| 16–19 | Gestalt grouping laws | `EMPIRICAL` | The best of the set — and *under*-applied |
| 20 | Uniform Connectedness | `EMPIRICAL` | Palmer & Rock 1994, not Wertheimer |

**The single most consequential finding:** Hick's and Miller's are the two most frequently
cited to justify hiding functionality from expert daily users, and **both have documented
boundary conditions that make them inapplicable to that argument.**

---

## 1. Hick's Law — `EMPIRICAL / MISAPPLIED`

**Source:** Hick, W.E. (1952), *Quarterly Journal of Experimental Psychology* 4(1):11–26 —
https://doi.org/10.1080/17470215208416600 · Hyman, R. (1953), *J. Exp. Psychology*
45(3):188–96 — https://pubmed.ncbi.nlm.nih.gov/13052851

**What it claimed:** For *n* equally probable, discrete choices, reaction time
T = b·log₂(n+1). Logarithmic, not linear. Hick's apparatus was ten lamps and Morse keys.

**Where it does not apply:**
- **Randomly ordered lists.** Scanning each word is linear, so the law does not apply.
  If the list is ordered *and* the user knows what they want, subdivision works
  logarithmically (Landauer & Nachbar 1985).
- **Trained, familiar choices.** Exceptions documented for verbal responses to familiar
  stimuli (Longstreth et al. 1985), saccadic eye movements (Kveraga et al. 2002; Lawrence
  et al. 2008 found an *anti*-Hick effect), and sequence learning (Pavão et al. 2016).
- **Expert operator screens.** An expert who knows which control they want is not
  "choosing" in Hick's sense — they are executing a learned visual-motor pattern, a
  different and often faster process. Citing Hick's Law to hide functionality from a daily
  user applies a first-encounter latency finding to a population that has automated the
  decision.

https://en.wikipedia.org/wiki/Hick%27s_law

---

## 2. Fitts's Law — `EMPIRICAL`

**Source:** Fitts, P.M. (1954), *J. Exp. Psychology* 47(6):381–91. Imported into HCI by
Card, Moran & Newell (1983). One of the most robustly replicated findings on this list.

**What it claimed:** Movement time to a target is a function of distance and target width
(ID = log₂(2D/W)).

**Where it does not apply:** It models the *motor* act of pointing. It says nothing about
cognitive load, decision time, or whether the target is the right one. Over-extended, it
becomes "make everything huge," which trades directly against information density — on a
dense operator screen, giant targets cost at-a-glance information, and Fitts's Law has
nothing to say about that trade.

https://en.wikipedia.org/wiki/Fitts%27s_law

---

## 3. Jakob's Law — `HEURISTIC`

**Source:** Coined by Jakob Nielsen. No controlled experiment; a practitioner observation.

**What it says:** Users spend most of their time on other sites, so they expect yours to
work like those.

**Where it does not apply:** Dogmatically followed, it forbids improvement. It is also
weak for specialist professional tools, where users are trained on a domain interface and
density and shortcuts serve them better than consumer-web familiarity. Label it a
professional heuristic, not a law.

https://lawsofux.com/jakobs-law/

---

## 4. Miller's Law (7±2) — `EMPIRICAL / MISAPPLIED`

**The most misused item on the list.**

**Source:** Miller, G.A. (1956), "The Magical Number Seven, Plus or Minus Two,"
*Psychological Review* 63(2):81–97 — https://psychclassics.yorku.ca/Miller/

**What it actually claimed:** Miller documented a **coincidence** between two unrelated
limits — one-dimensional absolute-judgment channel capacity (~2–3 bits) and short-term
memory span (~7 items). **He said in the paper that there is nothing magical about seven
and used the expression rhetorically.** He was sceptical of his own headline number.

**The revision:** Cowan, N. (2001) puts true working-memory capacity at **~4 chunks** once
rehearsal and chunking are controlled — https://doi.org/10.1017/S0140525X01003922 . Gobet
& Clarkson (2004) found over half of recall conditions yielded ~2 chunks.

**Does it apply to visual UI at all?** Largely no. Chunking describes recoding sequential
information held in working memory during active *recall* — remembering a phone number. A
row of tabs or menu items is a **perceptually available, re-scannable visual array**. The
user is not recalling it from memory; they can look again. "7±2 items in a navbar"
conflates memory-span with visual search, for which the real constraints are Gestalt
grouping and clutter — not chunk capacity.

**Where it does not apply:** as an argument for limiting an expert's controls. Experts
build spatial and procedural memory through repetition — a different learning system.
Citing 7±2 there is a category error.

https://en.wikipedia.org/wiki/The_Magical_Number_Seven,_Plus_or_Minus_Two

---

## 5. Aesthetic-Usability Effect — `EMPIRICAL`

**Source:** Kurosu, M. & Kashimura, K. (1995), *CHI '95* — https://doi.org/10.1145/223355.223680 .
Replicated by Tractinsky (1997, 2000) cross-culturally, and Sonderegger & Sauer (2010),
who found an attractive phone was rated more usable *and* produced faster task completion
than a functionally identical unattractive one.

**The ethical edge — state it whenever you cite this.** It is a **perception effect, not a
usability improvement.** Two consequences:
1. Exploiting it to paper over real defects deceives users about product quality.
2. **It contaminates usability testing.** A polished prototype will test better than it
   deserves. Discount accordingly.

**Where it does not apply:** it fades with repeated high-stakes use — Sonderegger & Sauer's
own data show first-use ratings diverging from usage-based ratings over time. For a daily
operator tool, real friction reasserts itself regardless of polish.

https://en.wikipedia.org/wiki/Aesthetic-usability_effect

---

## 6. Pareto Principle — `HEURISTIC`

**Source:** Pareto (1896) on Italian land ownership; popularised as management practice by
Juran (1941). **Not a UX finding at all** — economics retrofitted into design discourse.

Wikipedia is explicit: *"it is a convenient rule of thumb and is not, nor should it be
considered, an immutable law of nature."* Real ratios vary — 70:30, 90:10.

**Where it does not apply:** software feature usage often does not follow 80/20. For
professional tools, usage is frequently much flatter, with different subsets of experts
each depending on different features. "20% of features drive 80% of usage" is routinely
used to justify cutting features that a minority depend on daily.

https://en.wikipedia.org/wiki/Pareto_principle

---

## 7. Occam's Razor — `HEURISTIC`

A principle of logic and scientific method — do not multiply entities beyond necessity —
attributed to William of Ockham, though the phrasing postdates him by centuries. It has
**zero standing as a psychological or HCI finding.**

**Where it does not apply:** it is about choosing between competing *explanations* of equal
predictive power. It says nothing about interface complexity. Its casual use ("simplest
design wins") also ignores the genuine point behind Tesler's aphorism — some complexity is
irreducible, and relocating it is not eliminating it.

https://en.wikipedia.org/wiki/Occam%27s_razor

---

## 8. Parkinson's Law — `FOLKLORE`

**Source:** C. Northcote Parkinson, *The Economist*, 19 Nov 1955 — **written as satire**,
complete with a deliberately tongue-in-cheek formula. Expanded into a 1957 book.

Two distinct claims: "work expands to fill the time available" (the popularly cited
version) and a claim that bureaucracies grow 5–7% annually regardless of workload. There
is **no controlled study** behind the version cited in UX contexts.

**Where it does not apply:** it is usually invoked to justify artificial time pressure or
countdown UI — using an essay about bureaucratic growth to justify individual interface
decisions. It is an astute aphorism, not evidence.

https://en.wikipedia.org/wiki/Parkinson%27s_law

---

## 9. Postel's Law (Robustness Principle) — `REVERSED`

**Source:** Jon Postel, IEN 111 (1979) and RFC 761 (1980): *"be conservative in what you
do, be liberal in what you accept."* A real, correctly attributed protocol-design
principle.

**And its own field has since argued against it.** This is a documented reversal, from
inside the IETF:

- **RFC 3117** (Rose, 2001) — documented deployment failures: non-conforming senders get
  tolerated for years until a stricter implementation appears, at which point the flaw is
  undiagnosable. https://www.rfc-editor.org/rfc/rfc3117
- **Rochet & Pereira (2018)**, *PoPETs* — the principle inside Tor's routing could be
  exploited to de-anonymise onion services. https://doi.org/10.1515/popets-2018-0011
- **RFC 9413** (Thomson & Schinazi, IAB, June 2023), "Maintaining Robust Protocols" —
  argues the principle *causes* fragility: *"A flaw can become entrenched as a de facto
  standard. Any implementation of the protocol is required to replicate the aberrant
  behavior, or it is not interoperable."* https://www.rfc-editor.org/rfc/rfc9413

**How to cite it:** its UX use ("accept messy input, be strict in your output") borrows a
metaphor from a domain that has formally disowned it. B4 in `decision-rules.md` gets the
same practical result — never destroy the user's input on error — from evidence that has
not been reversed. Prefer that.

---

## 10. Peak-End Rule — `EMPIRICAL`

**Source:** Fredrickson & Kahneman (1993); Kahneman et al. (1993), *Psychological Science*
4(6):401–405 — https://doi.org/10.1111/j.1467-9280.1993.tb00589.x ; Redelmeier & Kahneman
(1996) colonoscopy study, *Pain* 66(1):3–8. Genuinely replicated.

**Boundary conditions, documented:**
- **Miron-Shatz (2009)**, *Emotion* 9(2):206–13 — retrospective evaluations of **day-long
  experiences do not follow the rule** — https://doi.org/10.1037/a0015295 . So it applies
  to short, bounded episodes, not to onboarding spread over days or a multi-week project.
- Kemp, Burt & Furneaux (2008) found the *most memorable* moment predicted recalled
  happiness better than peak or end specifically.
- Restrained eaters showed no effect at all (Robinson et al. 2011).

**Where it does not apply:** a continuous, always-on daily tool has no "end." Real-time
efficiency matters, not the remembered shape of a session.

https://en.wikipedia.org/wiki/Peak%E2%80%93end_rule

---

## 11. Von Restorff Effect — `EMPIRICAL`

**Source:** von Restorff, H. (1933), *Psychologische Forschung* 18(1):299–342 —
https://doi.org/10.1007/BF02409636 . Replicated behaviourally and at the neural level
(Karis, Fabiani & Donchin 1984, ERP/P300).

**Where it does not apply:** the effect **requires isolation against a homogeneous field.**
On a dense operator screen with many competing elements, highlighting everything important
is self-defeating — if everything stands out, nothing does. It is a tool for one or two
genuinely critical alerts, not a general strategy.

Also documented: large individual differences (people using mnemonic strategies show
little effect), and a smaller effect in older adults (Cimbalo & Brink 1982; Bireta et al.
2008).

https://en.wikipedia.org/wiki/Von_Restorff_effect

---

## 12. Zeigarnik Effect — `CONTESTED`

**This is the most important correction in the set.**

**Source:** Zeigarnik, B. (1927), *Psychologische Forschung* 9:1–85 —
https://interruptions.net/literature/Zeigarnik-PsychologischeForschung27.pdf

**The claim:** unfinished tasks are remembered better than finished ones.

**The current evidence:** replication has been contested for decades (Van Bergen 1968
failed to replicate; Einstein et al. 2003 note ongoing controversy). **Ghibellini & Meier
(2025)**, a systematic review and meta-analysis in *Humanities and Social Sciences
Communications*, **found no memory advantage for unfinished tasks at all.** What they did
find is a general *tendency to resume* interrupted tasks — which is the separate
**Ovsiankina effect (1928)**, routinely conflated with Zeigarnik's. Their conclusion: *"the
Ovsiankina effect represents a general tendency, whereas the Zeigarnik effect lacks
universal validity."* https://doi.org/10.1057/s41599-025-05000-w

**What this means practically:** progress bars and "profile 64% complete" nudges do work.
But the mechanism is Ovsiankina resumption, not Zeigarnik memory. **The cheatsheet names
the wrong effect** — and the one it names is the one that failed meta-analysis.

**Where it does not apply:** for a daily expert user, engineered incompleteness reads as
nagging. They already have an internal task model.

https://en.wikipedia.org/wiki/Zeigarnik_effect

---

## 13. Tesler's Law (Conservation of Complexity) — `FOLKLORE`

**There is no primary study.** The trail ends at an interview with Larry Tesler in Dan
Saffer's *Designing for Interaction* (2006/2009) — a secondary source, decades after the
fact, with no data or publication by Tesler establishing it as a measured phenomenon.
Wikipedia's entry is a stub, not a research article.

**The idea is genuinely useful** — some complexity is irreducible; you choose whether the
user or the system absorbs it. Cite it as an experienced practitioner's maxim, which is
what it is. Do not call it a law or imply evidence.

Note that even the folklore has a rebuttal: Bruce Tognazzini argues people re-introduce
complexity through more ambitious use once a tool is simplified.

https://en.wikipedia.org/wiki/Law_of_conservation_of_complexity

---

## 14. Doherty Threshold — `EMPIRICAL`

**Source:** Doherty, W.J. & Thadani, A.J. (1982), "The Economic Value of Rapid Response
Time," *IBM Systems Journal* — real, and correctly attributed. But the foundational
response-time research is earlier: **Miller, R.B. (1968)**, which proposed the categorical
thresholds still in use (0.1s feels instantaneous; 1s maintains flow; 10s is the attention
limit) — http://yusufarslan.net/sites/yusufarslan.net/files/upload/content/Miller1968.pdf

**Where the 400ms figure does not apply:** it was derived for general interactive response
in an early-1980s mainframe-terminal context. **For expert users doing rapid repetitive
operations — keyboard-driven data entry in an operator tool — 400ms is far too slow;
they need sub-100ms feedback.** Conversely, background and batch operations tolerate much
longer if progress is communicated honestly. Treating 400ms as a universal cutoff
oversimplifies in both directions.

https://lawsofux.com/doherty-threshold/

---

## 15. Goal-Gradient Effect — `EMPIRICAL`

**Source:** Hull, C.L. (1932/1934), rat-maze studies. Human/consumer confirmation: **Kivetz,
Urminsky & Zheng (2006)**, *Journal of Marketing Research* —
http://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf . One of the
better-sourced items here; the popular citation correctly traces the chain.

**What it claims:** effort accelerates as a goal approaches.

**Where it does not apply:** it is a motivational effect for goal-directed, reward-seeking
behaviour — loyalty cards, onboarding checklists. It says nothing about routine operational
work with no completion reward. Gamified progress bars on an always-on monitoring
dashboard are a category mismatch and read as patronising to a professional.

---

## 16–20. The Gestalt Grouping Laws — `EMPIRICAL`

**Proximity · Similarity · Closure · Common Region · Uniform Connectedness**

**Source:** Max Wertheimer and the Berlin School (1910s–20s); Wertheimer (1923),
*Psychologische Forschung*. Foundational and heavily replicated.

**An attribution correction the cheatsheet flattens:** Wertheimer's classical set is
Proximity, Similarity, Continuity, Closure and Prägnanz. **Common Region and Uniform
Connectedness are later additions — Palmer, S. & Rock, I. (1994)**, *Psychonomic Bulletin
& Review*. Legitimate, peer-reviewed, and roughly seventy years apart from the rest.
Presenting all five as one undifferentiated "Gestalt package" obscures that.

**A naming collision worth knowing:** the perceptual "Law of Closure" (visual completion of
incomplete shapes) is unrelated to the social-psychological "need for cognitive closure"
(Kruglanski & Webster 1996), an ambiguity-tolerance construct. Same word, different things.

**Where they do not apply: essentially nowhere relevant here — these are the best of the
set for dense screens, and they are *under*-applied.** They describe how humans parse
visual density itself: grouping, boundaries, connectors. That is exactly the problem a
crowded operator screen poses. The popular discourse fixates on Hick's and Miller's to
argue for *removing* content, while the laws that would make dense content *legible* get
ignored.

https://en.wikipedia.org/wiki/Principles_of_grouping

---

## How to use this file

1. **Before citing a law, look up its grade.** Citing folklore as evidence weakens every
   other argument in the room.
2. **Quote the boundary alongside the law.** An unbounded law will be over-applied.
3. **If a law is being used to justify hiding functionality from an expert** — check #1 and
   #4 first. That argument is usually unsupported.
4. **If the design goal is making dense information legible** — reach for #16–20, which are
   the strongest and least used.
