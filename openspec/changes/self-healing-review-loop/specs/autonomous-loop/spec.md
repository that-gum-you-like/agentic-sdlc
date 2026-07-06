# Spec Delta: autonomous-loop (self-healing-review-loop)

## REQ-SH-1 — Rejections become queue work automatically

**Statement:** When `pr-auto-review` declines to merge an `agent/drain/*` PR
for an actionable reason (`gate-failed` or `llm-rejected`), it MUST upsert a
`FIX-<pr>` queue task on main (via the review clone) carrying the PR number,
branch, head SHA, source task id, and the verbatim rejection reasons, at
CRITICAL priority. `reject-unsafe`, `flagged`, and `llm-unavailable` MUST NOT
produce fix tasks.

**Acceptance:** unit tests cover the builder (create + refresh), the
wiring points, and the exclusions; `tests/pr-auto-review.test.mjs` pins them.

## REQ-SH-2 — The drain repairs instead of duplicating

**Statement:** A `FIX-*` task MUST be worked on the EXISTING PR branch (fetch,
checkout, fix every listed reason, test, push) — never a new branch or second
PR. The drain's open-PR skip rule MUST exempt `FIX-*` tasks, and the
unreviewed-PR cap MUST NOT block a run when a pending `FIX-*` task exists.

**Acceptance:** `tests/hermes-drain.test.mjs` pins the cap bypass;
drain-prompt content pins verified in the same suite.

## REQ-SH-3 — Fix tasks close with their PR

**Statement:** When a drain PR merges, its `FIX-<pr>` task (if any) MUST be
marked completed by the reconcile pass.

**Acceptance:** reconcile logic covered by source-pin test.

**Complexity:** M. **Value:** removes the final human step for non-guardrail
rejections — the Level-6 "system gets better without human intervention" loop.
