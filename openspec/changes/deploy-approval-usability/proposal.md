# Proposal: deploy-approval-usability

**Date**: 2026-08-01
**Author**: Claude (CTO agent), reported by Bryce
**Status**: proposed

---

## Problem

The approval-gated deploy pipeline works, but **no deploy has ever been approved**, because
the approval request does not say which Telegram bot to reply to.

Two bots are in play:

| Token | Bot | Role |
|-------|-----|------|
| `TELEGRAM_BOT_TOKEN` | `@Nels_hermes_bot` | Sends **all** notifications — including the approval request |
| `TELEGRAM_DEPLOY_BOT_TOKEN` | `@Nels_hermes_deploy_bot` | The **only** bot whose `getUpdates` the runner polls for `APPROVE`/`REJECT` |

The request text (`agents/deploy-runner.mjs:363-365`) reads:

> 🚀 Deploy personal-website? origin/main@db255a7c — "<subject>"
> Reply to the DEPLOY bot: APPROVE db255a7c  (or REJECT db255a7c)

It arrives from `@Nels_hermes_bot`. "the DEPLOY bot" is never named, there is no link, and
replying in the chat the message came from is a no-op — `pollApprovals()` only reads
`@Nels_hermes_deploy_bot`. The natural user action silently does nothing.

Evidence, verified 2026-08-01:

- `~/personal-website/pm/.deploy-pending-db255a7c` — an approval requested **2026-07-31 16:30**
- `~/personal-website/pm/.last-deployed` — **does not exist**: nothing has ever deployed
- `deploy-runner --dry-run` → `personal-website: origin/main@db255a7c — wait-approval`
- Deploy bot `getWebhookInfo` → `{"url":"","pending_update_count":0}` — no webhook blocking
  `getUpdates`, and **zero messages ever sent to it**

So `brycewadley.com` has been a commit behind for over a day, waiting on a reply that could
not have worked. Everything else in the chain is healthy: the Vercel CLI is logged in as
`that-gum-you-like`, both bot tokens authenticate, and the 30-minute
`sdlc-sched-deploy-reconcile.timer` is running.

Bryce's decision (2026-08-01): **keep the approval gate on every deploy** — "I can approve a
deploy, all deploys i should approve." So the gate stays; it just has to be usable.

---

## Discovery

- **Files examined**:
  - `agents/deploy-runner.mjs:360-367` — the `request-approval` branch and its message text
  - `agents/deploy-runner.mjs:142-179` — `pollApprovals()`, polls `TELEGRAM_DEPLOY_BOT_TOKEN`
    only, hard-filters on `TELEGRAM_CHAT_ID`
  - `agents/deploy-runner.mjs:92-96` — `parseApprovalCommand()`, strict
    `/^\s*(APPROVE|REJECT)\s+([0-9a-f]{8})\s*$/i`
  - `agents/deploy-runner.mjs:271-278` — `notify()`, shells out to `notify.mjs send`
    (the **notify** bot)
  - `agents/deploy-runner.mjs:104-115` — `decide()`, the pure state machine
  - `~/.hermes/.env` — both tokens present and valid; `TELEGRAM_CHAT_ID=5538331282`
  - `~/.config/systemd/user/sdlc-sched-deploy-reconcile.service` — 3 project dirs, every 30 min
- **Existing patterns**:
  - Approval tokens are sha-bound, single-use files in each project's `pm/`, so a reply is
    meaningless unless `.deploy-pending-<sha8>` names that exact sha
  - The two-bot split is **deliberate**, per the module header: "No LLM, no gateway in the
    approval path." The notify bot is agent-writable; the deploy bot is not. That boundary
    stops a prompt-injected agent from approving its own deploy.
  - `notify()` is best-effort by design — a notification failure never changes deploy state
- **Existing tests**: `tests/deploy-runner.test.mjs` covers `decide()` and
  `parseApprovalCommand()` — the state machine and the parser. Nothing asserts anything about
  the **request message**, which is why an unactionable instruction shipped.
- **Key findings**:
  1. The pipeline is not broken — it is unusable. Every component works in isolation.
  2. `pending_update_count: 0` is proof the deploy bot has never received a message, not that
     Bryce ignored the request.
  3. The bot username is only discoverable via a `getMe` call — it is nowhere in config, so
     the message physically cannot name it today.

---

## Proposed Solution

Make the approval request self-contained and one-tap. Resolve the deploy bot's `@username`
via a `getMe` call at request time, and include both the username and a `https://t.me/<bot>`
link in the message, alongside the exact command to send. Cache the username so the extra API
call happens at most once per run. When `getMe` fails, fall back to explicit generic wording
that still tells the reader a *different, dedicated* bot is required. Keep the two-bot
security boundary exactly as it is. Add a test asserting the request message names a concrete
bot handle, so this cannot regress into vague wording again.

---

## Value Analysis

### Benefits

- Unblocks the entire deploy pipeline: it has produced zero deploys since it was built
- One tap from the request to the right chat, instead of a dead-end reply
- Keeps the approval gate Bryce explicitly asked to keep, and keeps the security boundary that
  makes it meaningful
- The regression test converts "the instruction is unactionable" from an invisible UX failure
  into a failing build

### Costs

- **Effort**: S — one message-construction change, one cached `getMe`, one test
- **Risk**: Very low. Message text only; the state machine, the parser, the token protocol and
  the poll are untouched. A `getMe` failure degrades to today's wording, so the worst case is
  the current behaviour.
- **Dependencies**: `TELEGRAM_DEPLOY_BOT_TOKEN` (present, valid). No new npm deps.

### Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Also poll the notify bot for approvals, so replying where the message arrived works | Destroys the security boundary: the notify bot is agent-writable, so a prompt-injected Hermes could approve its own deploy. It also risks a second `getUpdates` consumer on that token — two pollers steal each other's updates and 409. |
| Send the approval request *from* the deploy bot instead | The deploy bot cannot message a user who has never started it, so the very first request would silently vanish — strictly worse than today. |
| Hardcode `@Nels_hermes_deploy_bot` in the message | Breaks for any other install of the framework, and silently lies if the token is rotated to a different bot. `getMe` is authoritative. |
| Add `TELEGRAM_DEPLOY_BOT_USERNAME` to `.env` | Another hand-maintained value that can drift out of sync with the token. `getMe` derives it from the token itself. |
| Set `approval: 'none'` for direct unattended deploys | Explicitly rejected by Bryce — he wants to approve every deploy. |
| Do nothing | The pipeline stays at zero deploys and every site drifts behind `main`. |

### Decision

**Yes.** A working, scheduled, credentialed pipeline is producing nothing solely because one
message omits a bot handle. Smallest possible change, highest possible leverage.

---

## Scope

### In Scope

- Resolve the deploy bot `@username` via cached `getMe`
- Include the username + `t.me` link + exact command in the approval request
- Graceful fallback wording when `getMe` fails
- Test asserting the request names a concrete bot handle

### Out of Scope

- Changing the two-bot split, the token protocol, `decide()`, or `parseApprovalCommand()`
- Turning off the approval gate for any project (explicitly rejected)
- Enabling deploys for `tally` (`deploy.enabled: false`) — separate decision, customer-facing
- Telegram inline keyboards / callback buttons — a larger change to the approval transport
- Retroactively approving `db255a7c` — that is Bryce's call to make, by design

---

## Next Step

If approved: proceed to design phase.
