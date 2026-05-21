# Agent Bootstrap Guide

**You are an AI agent. The human user pointed you at this repo and asked you to integrate it into their project. This file tells you the exact sequence — read it first.**

If you are a human reading this, you probably want [README.md](README.md) instead.

---

## What this repo is

A methodology for running a multi-agent AI development team on the user's existing project. It provides scripts, templates, agent personas, an OpenSpec workflow, and quality gates. Zero npm dependencies. Pure Node.js stdlib.

The framework is INVOKED FROM the user's project, not installed into your global tools. It lives at `~/agentic-sdlc` (or wherever the user cloned it) and is consumed by other projects via `node ~/agentic-sdlc/setup.mjs --dir <user-project>`.

---

## Exact bootstrap sequence (do these in order)

### Step 1 — Verify clone location

Check whether the framework is already cloned at `~/agentic-sdlc`:

```bash
ls ~/agentic-sdlc/setup.mjs
```

If it exists, skip to Step 2. Otherwise clone it:

```bash
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
```

### Step 2 — Discover the user's project

Run discovery (non-destructive — only reads files, never writes):

```bash
node ~/agentic-sdlc/setup.mjs --discover --dir <user-project-path>
```

This outputs a JSON report: language, framework, test command, suggested agents, current maturity level. Use the report to decide whether anything in Step 3 needs override flags.

### Step 3 — Run setup non-interactively

**Critical:** `setup.mjs` is interactive by default (readline prompts). Use `--yes` to accept all defaults — this is what an AI agent should always do:

```bash
node ~/agentic-sdlc/setup.mjs --yes --dir <user-project-path>
```

This creates:
- `agents/` — agent personas, memory, budget, domain routing
- `tasks/queue/` — task queue
- `openspec/` — OpenSpec workflow templates + change directory
- `pm/` — project management dashboard, mailbox, approvals
- `plans/` — planning artifacts
- `.cursorrules` and `.cursor/rules/*.mdc` — Cursor IDE rule files
- `.claude/skills/` — Claude Code skill files (OpenSpec workflow)
- `CLAUDE.md` — the rules file (also valid for Cursor via `.cursorrules`)
- `package.json` is left alone (zero npm deps)

If you want to preview without writing, use `--yes --dry-run` instead.

### Step 4 — Read the rules file the user's tool will pick up

After Step 3 completes, read these files **in the user's project directory** (not in `~/agentic-sdlc`):

- `<user-project>/CLAUDE.md` — full rules. ~600 lines. This is the canonical operating manual: micro cycle, OpenSpec workflow, agent system, memory protocol, quality gates, all of it.
- `<user-project>/.cursorrules` — condensed Cursor version of the same rules.
- `<user-project>/agents/project.json` — project config (test command, agent roster, adapters).
- `<user-project>/agents/domains.json` — file-pattern → agent routing.

**These files are now binding on you.** Every change you make follows the rules they define.

### Step 5 — Start the first task

Ask the user what they want to build. Then start the OpenSpec workflow:

```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs status   # see if any tasks exist
```

If the queue is empty (it will be on first run): work with the user to create the first OpenSpec change.
- The OpenSpec workflow is: `proposal → design → specs → tasks → implement → archive`
- Create `openspec/changes/<change-name>/proposal.md` using the template at `openspec/templates/proposal.md.template`
- Follow the rules in `CLAUDE.md` for the rest

If the queue has tasks: pick the highest-priority unblocked task and run the micro cycle (read memory → implement → write tests → run tests → commit).

---

## Tier-specific guidance

### If user is on Cursor Pro+ (has Background Agents + Automations)
- After Step 4, point them at `docs/cursor-automations-playbook.md` — it walks them through creating 7 recommended Automations (queue drain, daily review, weekly review, REM sleep, pattern hunt, cost tracker, alignment monitor) in cursor.com/automations
- For ad-hoc Background Agents (not scheduled), see `docs/cursor-background-agents.md`
- The `.cursor/rules/sdlc-task-execution.mdc` and `.cursor/rules/sdlc-housekeeping.mdc` files (auto-installed by setup.mjs) constrain the spawned Background Agents to the SDLC — they're the contract between your framework and Cursor's cloud agents

### If user is on Cursor (free or Pro, no Automations)
- The `.cursorrules` and `.cursor/rules/*.mdc` files are still loaded — full framework rules apply
- Background Agents and Automations are not available — user runs scripts manually or you do
- See `docs/cursor-setup.md`

### If user is on Claude Code
- The `CLAUDE.md` file is loaded automatically every turn — no further action needed
- Skills in `.claude/skills/` provide OpenSpec workflow shortcuts (`/openspec-new-change`, etc.)
- See main `CLAUDE.md` at the repo root for the full operating manual

### If user is on Windsurf
- `.windsurfrules` is loaded automatically
- Same framework, different rule file pathway

### If user is on Copilot, Aider, or another tool
- Point them at this `AGENTS.md` or at `ONBOARDING.md`
- The framework is tool-agnostic; the rules apply to any agent that reads them

---

## Things you must NOT do during bootstrap

- ❌ Don't install npm packages globally. The framework is zero-dep by design.
- ❌ Don't run `setup.mjs` without `--yes` if you're invoked non-interactively. You will hang on the first readline prompt.
- ❌ Don't modify files in `~/agentic-sdlc` itself. Only modify files in the user's target project.
- ❌ Don't skip the OpenSpec workflow on the first change. Every change goes proposal → design → specs → tasks → implement.
- ❌ Don't fabricate test results. The framework has explicit anti-patterns documented (see `four-layer-validate.mjs`). Real tests, real outputs.

---

## If something fails

- `node ~/agentic-sdlc/setup.mjs --discover --dir <path>` failed → check that `<path>` exists and you have read access
- `node ~/agentic-sdlc/setup.mjs --yes --dir <path>` failed → check stderr; common causes are missing parent directory, no Node 18+, or insufficient write permissions
- Cursor not picking up rules → verify `.cursorrules` exists in the user's project after setup completed; if missing, the setup didn't finish — re-run with `--yes`
- See `docs/troubleshooting.md` for more

---

## What to read next, in order

After bootstrap is complete, read these to deepen your understanding:

1. `<user-project>/CLAUDE.md` — the binding operating manual
2. `<user-project>/ONBOARDING.md` (if present) — 5-phase integration protocol
3. `~/agentic-sdlc/docs/cursor-background-agents.md` — Cursor Pro+ patterns
4. `~/agentic-sdlc/docs/execution-agents.md` — agent template reference
5. `~/agentic-sdlc/framework/maturity-model.md` — 7-level maturity strategy

---

## Where to find current state

- **Recent changes / what's in flight**: `~/agentic-sdlc/openspec/changes/`
- **Future work**: `~/agentic-sdlc/openspec/BACKLOG.md`
- **PM dashboard for any project**: `<project>/pm/DASHBOARD.md`
- **Queue status**: `node ~/agentic-sdlc/agents/queue-drainer.mjs status`

---

## License

MIT. See `LICENSE`.
