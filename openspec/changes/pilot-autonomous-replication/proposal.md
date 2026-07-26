# Proposal: pilot-autonomous-replication

**Date**: 2026-07-26
**Author**: Claude (Fable 5) with Bryce
**Status**: proposed

---

## Problem

Every link of the autonomous chain now exists — drain, review, merge
(shipped previously), Telegram notifications (`telegram-activation`), deploy +
approval + verify (`autonomous-deploy-pipeline`), operator UX
(`operator-desktop-launcher`) — but the **whole chain has never run end-to-end
on OpenRouter with zero Claude involvement**. The framework's own queue is
empty of actionable work, so nothing will exercise it. "Production ready" is a
claim until one task travels the full distance.

## Proposed Solution

A throwaway pilot project, `hermes-pilot` (private GitHub repo, Vercel-linked,
bootstrapped with `setup.mjs`), seeded with exactly one task — **PILOT-001:
build a static "Hermes Autonomous SDLC — online" status page with its own
smoke test**. `deploy.enabled: true`, Telegram approval required.

Success = Bryce touches nothing except one `APPROVE <sha8>` Telegram reply:

1. drain tick picks PILOT-001 in `~/.sdlc-drain-clone-hermes-pilot`, opens a
   draft PR on `agent/drain/PILOT-001`;
2. pr-auto-review test-gates in a clean worktree and squash-merges;
3. deploy-runner requests approval on Telegram; Bryce replies APPROVE;
4. deploy → smoke verify passes → the live URL renders;
5. ≥4 Telegram messages received (drain done, merged, approval request, deploy
   complete) + desktop popups + a deploy receipt in `~/hermes-outbox`;
6. PILOT-001 is `completed` and the kanban card is Done.

Fallback validation: run one of tally's queued tasks through the drain (deploy
stays dark) to prove the chain on a real repo.

Arming is deliberately LAST and gated on the Telegram tokens being live —
otherwise the approval request fires into an unconfigured notifier and the
pilot stalls silently.

## Value Analysis

- **Converts "production ready" from claim to evidence** — the exact loop
  Bryce wants ("replicate things we have built and build things on its own"),
  demonstrated smallest-first with zero risk to granary.farm/willtopaint.
- **Exercises every new guardrail under fire**: approval binding, test gate,
  smoke verify, receipts, notifications.
- **Cheap**: one static page, one OpenRouter drain cycle (~cents), one Vercel
  hobby deploy.
- **Cost:** S setup (done via scripts) + autonomous runtime.

## Companion Changes

Consumes: telegram-activation, autonomous-deploy-pipeline,
operator-desktop-launcher, drain-multi-project.
