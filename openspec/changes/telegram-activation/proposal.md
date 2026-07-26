# Proposal: telegram-activation

**Date**: 2026-07-26
**Author**: Claude (Fable 5) with Bryce
**Status**: proposed

---

## Problem

The autonomous loop (drain → PR → auto-merge) runs headless every 15 minutes,
but the human owner cannot see or steer it without SSHing in:

1. **Notifications are dark.** `notify.mjs` + `telegram-notify.mjs` shipped with
   full Telegram support (tested), but `project.json` has
   `notification.provider: "none"` and no bot token exists anywhere — every
   notification prints to a log nobody reads.
2. **The Hermes gateway runs zero messaging platforms.** It logs
   `No messaging platforms enabled` on every start; the Telegram adapter in
   hermes-agent is unused for lack of a `TELEGRAM_BOT_TOKEN`.
3. **The drain and auto-merge never announce their results** — nothing in
   `hermes-drain.sh` or `pr-auto-review.mjs` calls the notification layer, so
   even with a provider configured Bryce would hear nothing.
4. **Hygiene noise obscures real failures:** the gateway warns about a stale
   Nous login on every start (config points at OpenRouter; `auth.json` still
   says `nous`), and the `chronos` plugin fails to load on every start
   (API mismatch: `PluginContext` has no `register_cron_scheduler`).
5. **Timer-run scripts can't read secrets:** the generated systemd units only
   set `PATH` + `SDLC_PROJECT_DIR`, so a token added to `~/.hermes/.env` would
   be invisible to every scheduled job.

## Proposed Solution

Activate the existing Telegram machinery end-to-end and clean the two config
mismatches. Repo changes ride existing rails — no new subsystem:

1. `scheduler-install.mjs`: generated `[Service]` blocks gain
   `EnvironmentFile=-%h/.hermes/.env` so scheduled jobs see the bot token
   (leading `-` = optional; systems without the file are unaffected).
2. `project.json`: `notification.provider` → `"telegram"`; new
   `notification.desktop: true` flag.
3. `notify.mjs`: best-effort GNOME desktop popups (`notify-send`) alongside the
   primary provider when `notification.desktop` is true — never fatal, never a
   substitute for the provider.
4. `hermes-drain.sh`: best-effort notify on drain completion (project, rc, log
   tail) via `notify.mjs` with the drained project's own config.
5. `pr-auto-review.mjs`: best-effort notify after a successful squash-merge.
6. Host (documented in design.md, executed with Bryce): create 2 bots via
   @BotFather (chat/notify bot + future deploy-approval bot), add
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEPLOY_BOT_TOKEN`, `TELEGRAM_CHAT_ID` to
   `~/.hermes/.env`; fix `auth.json` active_provider → `openrouter`; drop
   `chronos` from the Hermes plugin list; restart `hermes-gateway.service`.

## Value Analysis

- **Unlocks solo operation** — Bryce can watch and steer the autonomous system
  from his phone with zero terminal access; this is the prerequisite for every
  later phase (deploy approvals ride the same bots).
- **Turns silent failure into signal**: drain crashes and merges become push
  notifications instead of log lines.
- **Zero new dependencies** — stdlib https (already shipped), `notify-send`
  (present on GNOME), existing provider plumbing.
- **Privacy-aligned**: opt-in bot the user creates himself; no always-on
  listening added by this change (the gateway's chat adapter is Hermes
  upstream, activated deliberately).
- **Cost:** S. One-line unit template change, one provider flip, two
  best-effort hooks, small desktop helper + tests.

## Companion Changes

- `autonomous-deploy-pipeline` (next) — consumes the same env vars and adds the
  deploy-approval poller on the second bot.
- `operator-desktop-launcher` — RUNBOOK documents the operating procedures.
