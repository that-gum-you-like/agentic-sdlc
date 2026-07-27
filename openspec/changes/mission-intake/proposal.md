# Proposal: mission-intake

**Date**: 2026-07-27
**Author**: Claude (Fable 5) with Bryce
**Status**: proposed

---

## Problem

Bryce wants to describe a project idea to the Hermes Telegram agent and have
the system take it **from idea through deploy** without further help. Today
that fails on three counts:

1. **Project bootstrap is a 10-step manual ceremony** (repo create, clone,
   setup.mjs, budget-ladder rewrite, project.json patch, vercel link, cron
   jobs, timer reinstall…) — performed by hand for hermes-pilot, and two of
   those steps (Claude-model ladders, timer minute collisions) already bit us
   once each. An LLM agent re-deriving this each time will misstep.
2. **The gateway agent has no mission knowledge** — nothing tells it the
   workflow, the Supabase org id, the Vercel team, or the guardrails.
3. **The gateway agent's terminal is a Docker sandbox** — it cannot reach the
   host's authenticated `gh`/`vercel`/`supabase`/framework scripts at all.

## Proposed Solution

1. **`agents/mission-bootstrap.mjs`** — one command turns an idea into a
   drain-ready project: `gh repo create` + clone → `setup.mjs --yes` →
   OpenRouter-only budget ladders (pilot lesson) → project.json patch
   (telegram+desktop notifications, deploy block with computed
   `https://<name>-that-gum-you-likes-projects.vercel.app` smoke URL, telegram
   approval) → `vercel link` → initial commit+push → per-project drain/review
   cron jobs on a **name-hashed minute offset** (no timer collisions) +
   deploy-reconcile registration → `scheduler-install install`. `--dry-run`
   prints the plan; every step idempotent.
2. **`docs/MISSION_PLAYBOOK.md`** — the agent-facing procedure: intake →
   bootstrap → write openspec artifacts + seed small test-gated queue tasks →
   push → report; Supabase provisioning commands (org id, key handling,
   .env.local never committed); guardrails (never deploy manually, never touch
   the guardrail surface, approvals stay on).
3. **Host wiring (documented here, executed on the host):** install the
   playbook as Hermes skill `sdlc-mission`; set `terminal.backend: local` in
   `~/.hermes/config.yaml` so the paired agent operates the host toolchain
   (access is pairing-gated to Bryce's Telegram account only).

## Value Analysis

- **Completes the actual vision**: "describe it to my Telegram agent → it
  ships" becomes a one-command path with the error-prone parts deterministic.
- **Encodes both live incidents as code** (Claude-ladder default, timer
  collision) so no future mission can repeat them.
- **Bounded risk**: the bootstrap only creates NEW private repos/projects;
  deploys stay behind the sha-bound Telegram approval; the host terminal is
  reachable only by the paired owner.
- **Cost:** M — one script + tests + playbook + host config.

## Companion Changes

pilot-autonomous-replication (the proven chain this feeds),
autonomous-deploy-pipeline, operator-desktop-launcher (RUNBOOK).
