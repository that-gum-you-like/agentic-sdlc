# Design — pilot-autonomous-replication

## Why a throwaway project

Bryce chose the pilot-first path: prove pick→build→test→PR→merge→approve→
deploy→verify→notify on something with zero users before flipping
`deploy.enabled` on tally or willtopaint. The deliverable (a status page) is
intentionally trivial; every interesting property lives in the pipeline.

## Setup (scripted, done 2026-07-26)

- `gh repo create that-gum-you-like/hermes-pilot --private` → cloned to
  `~/hermes-pilot`, bootstrapped via `setup.mjs --yes`.
- `vercel link --yes` → project `hermes-pilot`
  (team that-gum-you-likes-projects). Production alias used as smoke URL:
  `https://hermes-pilot-that-gum-you-likes-projects.vercel.app` (the bare
  `hermes-pilot.vercel.app` is owned by a third party — verified 200 with no
  deployment of ours).
- `agents/project.json`: testCmd `node tests/smoke.test.mjs`, telegram+desktop
  notifications, deploy block enabled with approval telegram.
- `agents/budget.json`: rewritten to the framework's OpenRouter ladders
  (backend←sdlc-developer, reviewer←sdlc-reviewer); zero Anthropic models.
- Seed `tasks/queue/PILOT-001.json` — the full page+test+vercel.json build,
  explicit "Do NOT deploy" (the pipeline owns deploys).
- Initial commit pushed to `main` (drain clones and PRs need a base).

## Arming (gated on Telegram being live)

1. Tokens in `~/.hermes/.env`, gateway restarted, `notify.mjs status` ✅,
   test message received.
2. Add to `agents/cron-schedule.json`:
   - `pilot-drain`: `*/15 * * * *` → `/usr/bin/env SDLC_REPO=/home/bryce/hermes-pilot /home/bryce/agentic-sdlc/agents/hermes-drain.sh`
   - `pilot-review`: `9,29,49 * * * *` → `/usr/bin/env SDLC_PROJECT_DIR=/home/bryce/hermes-pilot node /home/bryce/agentic-sdlc/agents/pr-auto-review.mjs`
   - extend `deploy-reconcile` script with `--project-dir /home/bryce/hermes-pilot`
3. `node agents/scheduler-install.mjs install`
4. Watch (RUNBOOK §3) and record evidence in status.json.

Offsets: pilot-review at :9/:29/:49 avoids colliding with the framework review
(:7/:27/:47) for the shared host-global mutex — they'd serialize anyway, but
staggering wastes fewer ticks.

## Observation protocol

Expected Telegram sequence: ①"✅ drain hermes-pilot finished… 1 task(s)" →
②"✅ auto-merged PR #1…" → ③"🚀 Deploy hermes-pilot? …APPROVE <sha8>" →
(Bryce taps) → ④"✅ Deployed hermes-pilot <sha8> and verified (HTTP 200)".
Plus receipt in `~/hermes-outbox` and the page live at the smoke URL.

Failure playbook = RUNBOOK §5/§8 (failed-sha token, clone reset, notify
status). If the drain worker underdelivers (weak model output), that is itself
a finding — record it, file a FIX task, let the loop retry.

## Non-goals

Keeping hermes-pilot alive after the proof (archive or delete at will);
onboarding tally/willtopaint deploys (separate one-flag decision + their own
smoke URLs); browser-E2E verification.
