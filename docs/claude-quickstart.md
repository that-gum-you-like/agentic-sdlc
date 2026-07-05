# Claude Code Quickstart

How to operate this repo (`agentic-sdlc`) with **Claude Code** alongside the **Hermes** agent CLI and the autonomous launcher. This replaces the older hand-off guide, which contained two incorrect steps — see [What the old guide got wrong](#what-the-old-guide-got-wrong).

---

## Reality check (read this first)

- **You own this repo.** `that-gum-you-like/agentic-sdlc` is yours, cloned at `~/agentic-sdlc` with `origin` already pointing at it. **There is no fork step** — forking your own repo just creates a confusing second copy.
- **GitHub auth is already done.** `gh auth status` shows you logged in as `that-gum-you-like` with `repo` + `workflow` scopes. **Do not create a PAT** and **do not `export GH_TOKEN` to an agent.** `git push` and `gh pr create` already work through the existing OAuth login; no token is ever exposed to the model.
- **Hermes ≠ this repo.** Hermes (`~/.hermes/`) is a separate agent runtime that carries the advanced capability skills. Those skills are now mirrored here as execution-agent templates (see [the bridge doc](hermes-backlog-bridge.md)).

---

## The one non-negotiable: OpenSpec first

Every change — no matter how small — goes through the OpenSpec workflow before any code is written:

```
proposal → design → specs → tasks → implement → archive
```

- Start a change: `/openspec-new-change` (auto-runs the cross-feature conflict check)
- Advance artifacts: `/openspec-continue-change` (or `/openspec-ff-change` to draft them all at once)
- Implement tasks: `/openspec-apply-change`
- Every `proposal.md` MUST include a `## Value Analysis` section.
- Specs use the repo house style: `REQ-xxx` requirements with **Statement / Acceptance Criteria / Complexity (S/M/L/XL) / Value**.

Changes live in `openspec/changes/<change-name>/`. See `openspec/changes/hermes-integration/` for a worked multi-capability example.

> Note on validation: this repo uses its own spec style, not OpenSpec's canonical `## ADDED Requirements` / `#### Scenario:` delta format, so `openspec validate --strict` is **not** a gate here. Consistency with the existing changes is what matters.

---

## Where work comes from

1. **`openspec/BACKLOG.md`** — candidate ideas not yet promoted to a change. Pull from here when planning.
2. **`tasks/queue/*.json`** — the active task queue (may be empty). Check depth with:
   ```bash
   node ~/agentic-sdlc/agents/queue-drainer.mjs status
   ```
3. **A direct request** from Bryce.

The **"Never One More Thing" rule**: when an idea strikes mid-task, capture it in `BACKLOG.md` and keep working — don't derail the current task.

---

## The micro cycle (every task)

1. Read this file + `CLAUDE.md`.
2. Recall memory: `node ~/agentic-sdlc/agents/memory-manager.mjs recall <agent>`
3. Implement code changes (small files: services < 150 lines, screens < 200).
4. Write tests (happy path + at least one error case). **Commits without tests are blocked.**
5. Run tests: `npm test`.
6. Scripts that export functions MUST guard the CLI entry with `__isMainModule` — importing must never trigger CLI side effects. Enforced by:
   ```bash
   node ~/agentic-sdlc/agents/four-layer-validate.mjs --files 'agents/*.mjs'
   ```
7. If you touched any `AGENT.md`: `node ~/agentic-sdlc/agents/test-behavior.mjs` (must pass before commit).
8. Tests green → commit (atomic, one logical change) → record learnings in memory.
9. Branch naming: `feature/<short-description>` or `agent/<agent-name>/<task-id>`.

**Done checklist for this framework repo** (`project.json` → `doneChecklist`): `["openspec", "tests", "commit", "push"]`. No deploy/browser step — this is a framework, not an app.

---

## New automation scripts (from the hermes-integration change)

All are stdlib-only, import-safe, and dry-runnable:

```bash
node ~/agentic-sdlc/agents/health-check.mjs            # queue / budget / disk / cron → ok|degraded|down
node ~/agentic-sdlc/agents/health-check.mjs --notify   # alert if not ok
node ~/agentic-sdlc/agents/red-team-tester.mjs --dry-run   # scan agent prompts/outputs for injection & jailbreaks
node ~/agentic-sdlc/agents/rag-indexer.mjs             # build local semantic index (docs/ openspec/ memory/)
node ~/agentic-sdlc/agents/document-sync.mjs --dry-run # version knowledge docs, flag changes for re-index
node ~/agentic-sdlc/agents/telegram-notify.mjs "msg"   # opt-in Telegram channel (no-ops if unconfigured)
```

Embeddings are **local sentence-transformers only** (privacy-first, no OpenAI); everything degrades gracefully to a lexical fallback when python isn't installed.

---

## Working with Hermes and the autonomous launcher

- **Hermes** can run its own skills (`hermes skills list`) and its builtin GitHub skills (`github-pr-workflow`, `github-repo-management`, …). It reads/writes the same repo.
- **Autonomous launcher**: `bash ~/agentic-sdlc/agents/autonomous-launcher.sh --agent <name>` claims work from the roadmap/queue and runs the micro cycle headless.
- The three runtimes coordinate through repo artifacts (backlog, queue, `pm/` reports), not a shared process. See [hermes-backlog-bridge.md](hermes-backlog-bridge.md).

---

## What the old guide got wrong

The earlier "Connecting Hermes ↔ GitHub" hand-off guide told you to:

1. **Fork `that-gum-you-like/agentic-sdlc`** — unnecessary and confusing; you already own it and `origin` is correct.
2. **Create a PAT and expose it to the agent** (`export GH_TOKEN=…`) — unnecessary and less safe; `gh` is already OAuth-authenticated with the right scopes, and no token should ever be handed to the model.

It also described the advanced capabilities as repo files that didn't exist yet. Those now exist — as the execution-agent templates and cron scripts created by the `hermes-integration` OpenSpec change.
