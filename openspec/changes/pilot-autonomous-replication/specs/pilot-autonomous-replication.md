# Specs — pilot-autonomous-replication

## REQ-001 — Pilot exists and is drainable

**Statement:** `that-gum-you-like/hermes-pilot` (private) is bootstrapped with
the framework, Vercel-linked, carries PILOT-001 as its only queue task, an
all-OpenRouter budget ladder (zero Claude/Anthropic models), and a full deploy
block (`enabled: true`, approval telegram, smoke URL, `baseBranch: main`).
**Acceptance:** `SDLC_REPO=~/hermes-pilot hermes-drain.sh --dry-run` reports
1 ready task; `grep -c 'claude\|anthropic' agents/budget.json` = 0.

## REQ-002 — Armed only when observable

**Statement:** Pilot drain/review/deploy jobs enter `agents/cron-schedule.json`
(and timers reinstall) only after `notify.mjs status` reports Telegram
configured and a test message arrives.
**Acceptance:** arming checklist ordering in tasks.md; timers show the pilot
jobs after arming.

## REQ-003 — End-to-end success criteria (the actual proof)

**Statement:** Within ~2 h of arming, with Bryce's only action being one
`APPROVE <sha8>` reply: draft PR opened from `agent/drain/PILOT-001` →
auto-review merges → approval requested on Telegram → deploy runs → smoke
verify passes → live URL renders the status page → ≥4 Telegram messages +
desktop popups received → deploy receipt in `~/hermes-outbox` → PILOT-001
`completed`, kanban Done.
**Acceptance:** each item observed and recorded in status.json notes (URLs,
PR number, message list).

## REQ-004 — Real-repo fallback validation

**Statement:** One tally queue task runs through drain → PR → review (deploy
dark) to show the chain on a production repo with a `master` base.
**Acceptance:** tally drain PR opened and reviewed; no deploy attempted.
