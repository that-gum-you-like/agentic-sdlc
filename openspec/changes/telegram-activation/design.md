# Design — telegram-activation

## Bot topology (why two bots)

Telegram allows exactly **one `getUpdates` consumer per bot**. The Hermes
gateway's Telegram adapter long-polls the chat bot, so nothing else may read
that bot's stream — but outbound `sendMessage` calls from other processes are
fine. Therefore:

- **Bot A — `TELEGRAM_BOT_TOKEN`**: Hermes gateway chat (Bryce ⇄ agent) AND all
  outbound notifications from `telegram-notify.mjs` (send-only, no conflict).
- **Bot B — `TELEGRAM_DEPLOY_BOT_TOKEN`**: reserved for the deterministic
  deploy-approval poller (openspec: `autonomous-deploy-pipeline`), which needs
  its own `getUpdates` stream with no LLM and no gateway in the path. Created
  now so the BotFather ceremony happens once.

`TELEGRAM_CHAT_ID` identifies Bryce's private chat; both the notifier and the
future approval poller hard-filter on it.

## Secrets path

`~/.hermes/.env` is the single secrets file (already holds OPENROUTER/GITHUB
tokens). The generated systemd units gain `EnvironmentFile=-%h/.hermes/.env`
(`%h` = user home in user units; leading `-` = skip if missing). Secrets never
enter the repo; `telegram-notify.mjs` already prefers env over project.json.

## Desktop popups

`notification.desktop: true` (project.json) makes `sendNotification()` fire a
best-effort `notify-send` popup **in addition to** the primary provider.
Timer-run units reach the session bus via
`DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID/bus` (set as a fallback in
the helper when the env lacks it). Failures are swallowed by design: a popup is
a courtesy, not a delivery guarantee — the provider result is what's returned.

## Notify hooks

- `hermes-drain.sh` (end of run): `SDLC_PROJECT_DIR="$REPO" node
  "$SCRIPTS_DIR/notify.mjs" send … || true` — uses the DRAINED project's
  notification config, so a project with provider `none` stays silent. Message:
  project name, rc, ready-count, last log line. `|| true`: a notify failure
  must never fail a successful drain.
- `pr-auto-review.mjs` (after `gh pr merge`): `sendNotification()` in
  try/catch. Merge already happened — notification failure must not mark the
  run failed.

## Host activation (one-time, with Bryce)

1. @BotFather: `/newbot` ×2 → tokens for Bot A + Bot B.
2. Bryce messages Bot A once; `getUpdates` on Bot A yields the chat id.
3. Append the 3 vars to `~/.hermes/.env`.
4. `~/.hermes/auth.json`: `active_provider` `nous` → `openrouter` (config.yaml
   already routes all inference through OpenRouter; this only stops the
   keepalive warning loop).
5. `~/.hermes/config.yaml`: remove `chronos` from `plugins.enabled` (fails
   load: PluginContext API mismatch; systemd owns scheduling on this host).
6. `systemctl --user restart hermes-gateway.service`; then
   `node agents/scheduler-install.mjs install` to regenerate units with
   EnvironmentFile.

## Kanban decision (recorded, no code)

The file queue `tasks/queue/*.json` remains the source of truth for autonomous
work. `kanban.db task_runs` rows frozen at "scheduled" since 2026-07-07 are
cosmetic fallout of the dead chronos scheduler; the kanban-sync timer keeps
cards moving off task JSON status. Revisit only if the dashboard misleads.

## Non-goals

Inbound message → task creation (gateway chat already covers ad-hoc asks);
WhatsApp/Matrix providers; deploy approvals (next change); media attachments in
telegram-notify (text-only until needed).
