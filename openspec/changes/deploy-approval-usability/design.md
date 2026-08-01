# Design: deploy-approval-usability

**Date**: 2026-08-01
**Author**: Claude (CTO agent)
**Status**: design

---

## Context

### Current State

`agents/deploy-runner.mjs` runs every 30 minutes via
`sdlc-sched-deploy-reconcile.timer` against `tally`, `hermes-pilot` and
`personal-website`. Per project it compares `origin/<base>` against
`pm/.last-deployed` and drives the delta through
approval → test → deploy → smoke-verify → notify.

On a new sha with no pending token, `decide()` returns `request-approval`. The
runner then writes `pm/.deploy-pending-<sha8>` and sends (line 363-365):

```
🚀 Deploy <project>? origin/<base>@<sha8> — "<subject>"
Reply to the DEPLOY bot: APPROVE <sha8>  (or REJECT <sha8>)
```

That message goes out through `notify()` → `notify.mjs send`, i.e. the **notify**
bot `@Nels_hermes_bot`. But `pollApprovals()` reads `getUpdates` on
`TELEGRAM_DEPLOY_BOT_TOKEN` — `@Nels_hermes_deploy_bot` — and hard-filters
`msg.chat.id === TELEGRAM_CHAT_ID`. Replying in the chat where the request
arrived is therefore a silent no-op.

The bot's `@username` appears in no config file. It is only obtainable from
`getMe` on the token, so the message *cannot* name it as written today.

Verified 2026-08-01: deploy bot `getWebhookInfo` →
`{"url":"","pending_update_count":0}`. No webhook is blocking `getUpdates`, and
the deploy bot has never received a single message. `~/personal-website/pm/`
holds `.deploy-pending-db255a7c` from 2026-07-31 16:30 and **no**
`.last-deployed` — the pipeline has never completed a deploy.

Everything else is healthy: Vercel CLI logged in as `that-gum-you-like`, both
tokens authenticate, timer active, `deploy.enabled: true` for `personal-website`
and `hermes-pilot`.

### Problem Restatement

The approval request does not name the bot that can accept it, so the only
action a reader can take does nothing.

---

## Goals

- The approval request names a concrete, tappable bot handle
- One tap from the notification opens the correct chat
- The exact command to send is unambiguous and copy-pasteable
- A `getMe` failure never blocks or changes deploy state
- At most one extra Telegram API call per runner invocation
- Regression test prevents a return to vague wording

## Non-Goals

- Merging the notify and deploy bots, or polling the notify bot for approvals
- Changing `decide()`, `parseApprovalCommand()`, or the sha-bound token protocol
- Disabling the approval gate for any project
- Enabling deploys for `tally`
- Inline keyboards / callback buttons
- Approving the pending `db255a7c` on Bryce's behalf

---

## Design

### Overview

One new helper, `deployBotHandle()`, resolves the deploy bot's `@username` from
`getMe` and memoises it in a module-level variable. The `request-approval`
branch calls it and builds a message that names the bot, links to it, and states
the command on its own line. On any failure the helper returns `null` and the
message falls back to wording that still makes the "different, dedicated bot"
requirement explicit.

The two-bot split is preserved deliberately. Per the module header — "No LLM, no
gateway in the approval path" — the notify bot is agent-writable, so an agent
that could post there could approve its own deploy. Naming the deploy bot fixes
the usability failure without weakening that boundary.

### Components

#### `deployBotHandle()`

**File(s)**: `agents/deploy-runner.mjs` (new, near `pollApprovals`)

```js
let _deployBotHandle;   // undefined = unresolved, null = failed, string = '@name'

async function deployBotHandle(token) {
  if (_deployBotHandle !== undefined) return _deployBotHandle;
  _deployBotHandle = null;
  try {
    const resp = await telegramGet(token, 'getMe', {});
    const u = resp?.ok && resp.result?.username;
    if (u) _deployBotHandle = `@${u}`;
  } catch { /* fall through to null */ }
  return _deployBotHandle;
}
```

Reuses the existing `telegramGet` helper — no new transport. Memoised on the
first call, so a runner invocation makes at most one `getMe`, and only when a
project actually needs an approval request.

#### Approval request message

**File(s)**: `agents/deploy-runner.mjs` (`request-approval` branch, ~line 360)

With a resolved handle:

```
🚀 Deploy personal-website? origin/main@db255a7c — "<subject>"

Approve in the deploy bot @Nels_hermes_deploy_bot — https://t.me/Nels_hermes_deploy_bot
Send exactly:  APPROVE db255a7c
(or: REJECT db255a7c)

Note: this is a DIFFERENT bot from the one sending this message. Replying here does nothing.
```

Without one (fallback):

```
🚀 Deploy personal-website? origin/main@db255a7c — "<subject>"

Approve in the dedicated DEPLOY bot (TELEGRAM_DEPLOY_BOT_TOKEN) — NOT this chat.
Send exactly:  APPROVE db255a7c
(or: REJECT db255a7c)
```

The explicit "replying here does nothing" line is the part that actually fixes
the reported failure — naming the bot is necessary but a reader still has to
learn that their instinct is wrong.

A plain `https://t.me/<username>` link is used rather than a `?text=` prefill:
prefill is unreliable for bot chats across Telegram clients, and a link that
opens the right chat plus a copyable command is robust everywhere.

### Data Flow

```
reconcile tick (every 30 min)
  └─ pollApprovals()  ← getUpdates on DEPLOY bot, filtered to TELEGRAM_CHAT_ID
  └─ per project → decide()
       └─ 'request-approval'
            ├─ write pm/.deploy-pending-<sha8>
            ├─ deployBotHandle(TELEGRAM_DEPLOY_BOT_TOKEN)   ← cached getMe
            └─ notify() via NOTIFY bot, message names the DEPLOY bot + t.me link

Bryce taps the link → sends "APPROVE <sha8>" to the DEPLOY bot
  └─ next tick: pollApprovals() sees it, writes pm/.deploy-approved-<sha8>
       └─ decide() → 'deploy' → tests → vercel --prod → smoke verify → rollback on failure
```

### Schema / Interface Changes

```typescript
// New internal helper. No config, no env, no persisted state.
function deployBotHandle(token: string): Promise<string | null>;  // '@username' | null
```

No change to `decide()`, `parseApprovalCommand()`, token file names, or config schema.

---

## Decisions

### Decision 1: Resolve the handle from `getMe`, not config

**Chosen**: Derive `@username` from the token via `getMe`, memoised per run.

**Considered**: (a) hardcode `@Nels_hermes_deploy_bot`; (b) add
`TELEGRAM_DEPLOY_BOT_USERNAME` to `.env`.

**Rationale**: (a) is wrong for every other install of the framework and becomes
a silent lie the moment the token is rotated to a different bot — the message
would confidently name a bot that cannot approve anything. (b) adds a second
hand-maintained value that can drift out of sync with the token it describes,
reproducing this same class of bug. `getMe` is authoritative *because* it is
derived from the token itself: the named bot is, by construction, the bot being
polled.

### Decision 2: Keep the two-bot boundary

**Chosen**: Continue polling only `TELEGRAM_DEPLOY_BOT_TOKEN`.

**Considered**: Also poll the notify bot so replying in-place works.

**Rationale**: The notify bot is written to by agents. If approvals were
accepted there, an agent that could post a message could approve its own
deploy to production — and prompt injection makes that a realistic path, not a
theoretical one. The isolation is the entire point of a separate token. There is
also a mechanical hazard: `getUpdates` is single-consumer, so a second poller on
that token would steal updates from the existing consumer and 409. The usability
problem is solved by naming the bot, which costs nothing.

### Decision 3: Fail soft on `getMe`

**Chosen**: `null` handle → fallback wording; never block, never retry.

**Considered**: Treat a `getMe` failure as an error and skip the request.

**Rationale**: `notify()` is best-effort by design — "a notify failure never
changes deploy state." Making message construction able to block a deploy
request would invert that and let a cosmetic API hiccup stall the pipeline. The
fallback text is still strictly better than today's, so the degraded path is an
improvement rather than a regression.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `getMe` adds latency to every tick | Low | Low | Memoised per run and only called on the `request-approval` path, which is rare (once per new sha) |
| Bryce still replies to the notify bot out of habit | Medium | Medium | Explicit "this is a DIFFERENT bot… replying here does nothing" line plus a tap-through link |
| Telegram rejects the message on formatting | Low | Medium | Plain text only — no Markdown/HTML parse mode, so no escaping hazard from commit subjects |
| Commit subject contains characters that break the message | Low | Low | Plain text, no parse mode; subject is already interpolated the same way today |
| Fallback wording ships unnoticed because `getMe` always fails | Low | Medium | T-401 verifies the resolved handle appears in a real dry-run message |

---

## Testing Approach

- **Unit tests** (`tests/deploy-runner.test.mjs`):
  - the message builder includes a concrete `@handle` and a `t.me` link when a
    handle resolves
  - it includes the exact `APPROVE <sha8>` command in both branches
  - the fallback branch still warns that a different, dedicated bot is required
  - `deployBotHandle()` returns `null` and does not throw when `getMe` fails
- **Integration tests**: none — the state machine is untouched; full
  `npm test` guards regressions.
- **Manual verification**:
  - message construction produces the real `@Nels_hermes_deploy_bot` handle
  - Bryce receives an actionable request and can approve `db255a7c`
  - after approval, the next tick deploys and smoke-verifies
    `https://brycewadley.com/design`, and `pm/.last-deployed` finally appears

---

## Next Step

Proceed to specs phase.
