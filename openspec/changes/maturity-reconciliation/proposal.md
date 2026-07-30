# Proposal: maturity-reconciliation

**Date**: 2026-07-30
**Author**: Claude (Opus 5) with Bryce
**Status**: proposed

---

## Problem

Asked to take the framework to 100% maturity, the honest finding is that the
capability work is already done — and that **our own instruments say
otherwise**. Two of them lie, in opposite directions:

1. **`docs/curriculum-conformance.md` contradicts itself.** Its header states
   Level-6 (Self-Improving) was reached on 2026-07-06 with all nine gaps
   merged via PRs #20–#28. Its capability tables — and an entire section
   titled "Remaining gap list to Level-6 completion (close ONLY these, in this
   order)" — still mark those same nine as **Missing** or **Partial**. Every
   one was verified present on disk:

   | Claimed | Actually |
   |---|---|
   | Behavior baselines + drift — *Missing* | `test-behavior.mjs --baseline/--drift`, >20% threshold |
   | Injection screening of external input — *Missing* | `red-team-tester.screenExternalInput()`, wired into `mailbox-sync.mjs` |
   | Error dedup by signature hash — *Missing* | `notify.mjs errorSignature()` → `pm/error-signatures.json` |
   | Semantic near-miss analyzer — *Missing* | `nlp-analyzer.mjs` + four-layer Layer 2.5 |
   | Silent-default fallback scan — *Partial* | four-layer Layer 3 `[silent-fallback]` detectors |
   | Playwright user-test runner — *Missing* | `browser-user-test.mjs` |
   | TEACH wiring — *Partial* | `pattern-hunt.teachAgents()` → agent memory |
   | Monthly cycle completeness — *Partial* | `cycles/monthly-review.mjs` (compost, cost, versioning) |
   | Assume-compromise posture — *Partial* | `safety-mechanisms.md` §15 |

   This is the document memory names as the framework's **authoritative
   rubric**. A rubric that under-reports its own completion is worse than no
   rubric: it invites re-implementing nine things that already exist, which is
   exactly the duplicated-parallel-system failure the doc itself warns against.

2. **`maturity-assess.mjs` under-reports via two detection bugs**, not real
   deficiencies:
   - **Rendering**: line 514 marks any evidence line containing the substring
     `'No '` as ❌. So the *positive* findings "No dependency vulnerabilities
     possible (zero attack surface)" and "No lock file needed (nothing to
     lock)" render as failures in the report Bryce reads.
   - **Deploy detection**: it looks only for `scripts/deploy.sh`, `deploy.sh`,
     or a `"deploy"` npm script. The framework's actual deploy machinery is
     `agents/deploy-runner.mjs` (approval-gated, reconciling) plus
     `agents/deploy-rollback.mjs` and the `deploy-reconcile` timer. Scoring
     "Deployment & Release" at 2.0/5 with "❌ No deploy script found" is a
     false negative about a pipeline that demonstrably runs.

## Proposed Solution

1. **Reconcile the conformance doc to the verified filesystem state** — the
   nine rows move to Solid with their real owners, and the obsolete
   "Remaining gap list to Level-6 completion" section is replaced by an honest
   statement of what remains (nothing, at Level 6) plus the genuinely open
   non-curriculum items.
2. **Fix the two `maturity-assess.mjs` detection bugs.** Mark evidence
   polarity explicitly at the point it is created rather than inferring it
   from a substring after the fact, and teach deploy detection to recognise a
   framework-owned deploy runner and a `project.json` `deploy` block.
3. **Add `tests/curriculum-conformance.test.mjs`** — parse the conformance
   tables and fail when a claimed status contradicts the filesystem: a row
   marked Missing whose owner file exists, or a row marked Solid whose owner
   file does not. The doc drifted for three weeks precisely because nothing
   checked it; a self-improving framework should catch that itself.

Explicitly **not** in scope: tuning rubric weights, adding a Dockerfile, or
inventing credit to reach 5.0/5. The instruments get fixed where they
misreport; the score lands where it honestly lands.

## Value Analysis

- **Prevents nine wasted re-implementations.** The single most expensive
  outcome here is an agent (or a future session) reading "Remaining gap list —
  close ONLY these" and rebuilding what already ships. The doc is loaded as
  the authoritative rubric, so that risk is live.
- **Makes the maturity signal trustworthy.** A report that renders positives
  as ❌ and misses a running deploy pipeline trains the reader to discount it,
  which defeats the purpose of measuring at all.
- **Closes the loop the framework claims to own.** "Documentation that drifts
  from reality" is exactly the anti-pattern class the framework detects
  everywhere else. A drift guard applies its own doctrine to itself.
- **Cheap and bounded.** One doc pass, two small detection fixes, one test.
- **Cost:** S.

## Companion Changes

`curriculum-l4-naming` (prior reconciliation of the same doc family),
`egress-preflight` (the other instrument that was reporting `ok` while the
system was failing).
