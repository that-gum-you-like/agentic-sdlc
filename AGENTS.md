# Agent Bootstrap Guide

**You are an AI agent. The human user pointed you at this repo and asked you to integrate it into their project. This file tells you the exact sequence — read it first.**

If you are a human reading this, you probably want [README.md](README.md) instead.

---

## What this repo is

A methodology for running a multi-agent AI development team on the user's existing project. It provides scripts, templates, agent personas, an OpenSpec workflow, and quality gates. Zero npm dependencies. Pure Node.js stdlib.

The framework is **invoked from** the user's project, not installed into your global tools. It lives at `~/agentic-sdlc` (or wherever the user cloned it) and is consumed by other projects via `node ~/agentic-sdlc/setup.mjs --dir <user-project>`.

---

## Build / test / verify commands

```bash
node ~/agentic-sdlc/setup.mjs --discover --dir <path>   # Read-only project scan
node ~/agentic-sdlc/setup.mjs --yes --dir <path>        # Non-interactive setup
npm test                                                 # Framework's own test suite
node ~/agentic-sdlc/agents/queue-drainer.mjs status      # Queue state
node ~/agentic-sdlc/agents/four-layer-validate.mjs       # AST anti-pattern scan
node ~/agentic-sdlc/agents/cross-feature-analyze.mjs     # OpenSpec conflict scan
```

---

## Definition of done

"Wrote the code" is NOT "shipped the fix." Every step in the project's `doneChecklist` (configured in `agents/project.json`) must complete before reporting done. Default for framework repos: `openspec, tests, commit, push`. Default for apps: `openspec, tests, commit, deploy, verify, notify`.

---

## Exact bootstrap sequence

### Step 1 — Verify clone location

```bash
ls ~/agentic-sdlc/setup.mjs
```

If missing:

```bash
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
```

### Step 2 — Discover the user's project

```bash
node ~/agentic-sdlc/setup.mjs --discover --dir <user-project-path>
```

JSON report: language, framework, test command, suggested agents, maturity level. Read-only.

### Step 3 — Run setup non-interactively

**Critical:** `setup.mjs` is interactive by default. Use `--yes` to accept all defaults:

```bash
node ~/agentic-sdlc/setup.mjs --yes --dir <user-project-path>
```

This creates: `agents/`, `tasks/queue/`, `openspec/`, `pm/`, `plans/`, `.cursor/rules/*.mdc`, `.claude/skills/`, `CLAUDE.md`. Preview without writing: `--yes --dry-run`.

### Step 4 — Read the binding files

After Step 3, in the **user's project directory** (not in `~/agentic-sdlc`):

- `<user-project>/CLAUDE.md` — operating rules (~300 lines core, appendix on-demand)
- `<user-project>/.cursor/rules/*.mdc` — Cursor IDE rules (7 glob-scoped files)
- `<user-project>/agents/project.json` — test command, agent roster, adapters
- `<user-project>/agents/domains.json` — file-pattern → agent routing

These are binding on you.

### Step 5 — Start the first task

```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs status
```

Empty queue (first run): work with the user to create the first OpenSpec change. Workflow: `proposal → design → specs → tasks → implement → archive`. Templates in `openspec/templates/`.

Queue has tasks: pick highest-priority unblocked, run micro cycle (read memory → implement → write tests → run tests → commit).

---

## Tier-specific guidance

### Cursor Pro+ (Background Agents + Automations)
After Step 4, point the user at `docs/cursor-automations-playbook.md` for the 7 recommended Automations. For ad-hoc background work see `docs/cursor-background-agents.md`. The `.cursor/rules/sdlc-task-claim.mdc` + `sdlc-task-implement.mdc` files (auto-installed) constrain spawned Background Agents to the SDLC.

### Cursor (free / Pro, no Automations)
`.cursor/rules/*.mdc` are still loaded — full framework rules apply. No background/scheduled agents — user or you runs scripts manually. See `docs/cursor-setup.md`.

### Claude Code
`CLAUDE.md` is loaded automatically every turn. Skills in `.claude/skills/` provide OpenSpec workflow shortcuts (`/openspec-new-change`, etc.).

### Windsurf
`.windsurfrules` is the consolidated equivalent of the Cursor rules — same framework, single root-level file.

### Copilot, Aider, other tools
Point them at this `AGENTS.md` or at `ONBOARDING.md`. The framework is tool-agnostic.

---

## Things you must NOT do during bootstrap

- ❌ Don't install npm packages globally. Framework is zero-dep.
- ❌ Don't run `setup.mjs` without `--yes` if you're invoked non-interactively. You will hang on the first readline prompt.
- ❌ Don't modify files in `~/agentic-sdlc` itself. Only modify files in the user's target project.
- ❌ Don't skip the OpenSpec workflow on the first change.
- ❌ Don't fabricate test results. Real tests, real outputs.

---

## Escalation

- `setup.mjs --discover` failed → check `<path>` exists and is readable
- `setup.mjs --yes` failed → check stderr; common causes are missing parent dir, missing Node 18+, insufficient write permissions
- Cursor not picking up rules → verify `.cursor/rules/*.mdc` exist in the user's project after setup; if missing, setup didn't finish — re-run with `--yes`
- See `docs/troubleshooting.md` for more

---

## What to read next

1. `<user-project>/CLAUDE.md` — operating manual (slim; appendix linked from there)
2. `<user-project>/ONBOARDING.md` (if present) — 5-phase integration protocol
3. `~/agentic-sdlc/docs/cursor-background-agents.md` — Cursor Pro+ patterns + deployment-modes decision table
4. `~/agentic-sdlc/docs/appendix/agent-system.md` — full agent roster, template catalog, task-queue commands
5. `~/agentic-sdlc/framework/maturity-model.md` — 7-level maturity strategy

---

## Where to find current state

- **In-flight changes**: `~/agentic-sdlc/openspec/changes/`
- **Future work / rejected ideas**: `~/agentic-sdlc/openspec/BACKLOG.md`
- **Backlog conflict report**: `node ~/agentic-sdlc/agents/cross-feature-analyze.mjs` → `pm/cross-feature-report.md`
- **PM dashboard for any project**: `<project>/pm/DASHBOARD.md`
- **Queue status**: `node ~/agentic-sdlc/agents/queue-drainer.mjs status`

---

## License — MIT (see `LICENSE`)
