# Spec: registry-integration

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW

---

## Overview

The six ported execution-agent templates and five cron scripts are only useful if the framework's own registries know they exist. A template that is not in the roster/routing tables is unroutable; a script that is not in the script reference or cron schedule is undiscoverable. This capability closes the *integration* half of the change: it registers every new artifact in the canonical registries so the framework's self-description matches reality (the outcome the proposal's Value Analysis already promised), and it wires the Telegram provider into `notify.mjs` so it is a first-class notification channel rather than a standalone script.

This supersedes two of the original design Non-Goals ("Telegram registered as a `notify.mjs` channel later" and leaving the templates/scripts merely present-on-disk). It does **not** stand up a live scheduler daemon — cron cadence is expressed as OpenClaw cron one-liners and `cron-schedule.json.template` entries, exactly as every other automated cycle in the repo is.

---

### REQ-008: Ported Templates Registered in Every Roster

**Statement:** The system shall list all six new execution-agent templates (`constitutional-ai-engineer`, `context-engineering-master`, `memory-architect`, `twelve-factor-agent`, `rag-specialist`, `token-embedding-analyzer`) in every registry that enumerates the execution-template roster, with counts kept consistent.

**Acceptance Criteria:**
- [ ] `CLAUDE.md` §Agent System lists the six new archetypes and updates the "15" count to "21"
- [ ] `docs/appendix/agent-system.md` execution-template table gains a row (Template · Domain · Pattern) for each of the six, and its "15" count is updated
- [ ] `docs/execution-agents.md` Overview count, "Available Templates" table (Template · Role Keywords · Domain · Key Rules), and "Full Team" roster include the six
- [ ] `framework/agent-routing.md` "Task-Driven Agents" (or a Cron-Based Agents) table gains a routing trigger row for each of the six
- [ ] `README.md` template counts updated (execution roles 15 → 21; total templates 20 → 26)
- [ ] Role keywords / domains quoted in the registries match each template's actual `role_keywords` frontmatter

**Complexity:** M
**Value:** High

---

### REQ-009: Cron Scripts Registered in Script & Schedule Registries

**Statement:** The system shall list the new automation scripts in the script reference and express a recommended run cadence for the four schedule-driven ones, without standing up a live daemon.

**Acceptance Criteria:**
- [ ] `docs/appendix/script-reference.md` has a row for each of `red-team-tester.mjs`, `rag-indexer.mjs`, `health-check.mjs`, `telegram-notify.mjs`, `document-sync.mjs`
- [ ] `docs/appendix/iteration-cycles.md` documents a cadence + OpenClaw cron one-liner for `health-check`, `red-team-tester`, `rag-indexer`, and `document-sync`
- [ ] `agents/templates/cron-schedule.json.template` gains a schedule entry for each of those four cron scripts (stdlib fields: `name`, `cron`, `script`, `description`, `session`)
- [ ] `telegram-notify` is documented as a notification channel, not a scheduled job

**Complexity:** S
**Value:** Medium

---

### REQ-010: Telegram Registered as a notify.mjs Channel

**Statement:** The system shall make Telegram a selectable `notification.provider` in `notify.mjs`, reusing the already-tested `telegram-notify.mjs` sender, without breaking the existing synchronous provider contract.

**Acceptance Criteria:**
- [ ] `notify.mjs` `sendNotification()` switch handles `case 'telegram'` via a `sendViaTelegram()` that mirrors `sendViaOpenclaw` (synchronous, returns boolean)
- [ ] `notify.mjs status` reports Telegram provider health (configured vs. not) like the other providers
- [ ] An unconfigured Telegram provider degrades gracefully (clear message, no crash, no network call)
- [ ] `CLAUDE.md` §Notification & Approval Layer lists `telegram` among the available providers
- [ ] A test asserts the `telegram` provider dispatches to the Telegram sender and no-ops cleanly when unconfigured

**Complexity:** M
**Value:** Medium
