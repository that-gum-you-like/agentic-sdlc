# Design: onboarding-and-context-diet

**Date**: 2026-05-27
**Status**: design

---

## Context

Merges the design intent of two previously-separate proposals (`onboarding-maturity` + `claude-md-token-diet`). Both archived in favor of this unified scope; their original proposals/designs remain in `openspec/changes/archive/` for historical reference.

---

## Goals

- `CLAUDE.md` ≤500 lines; rest in `docs/appendix/<topic>.md`
- `AGENTS.md` ≤150 lines
- Single maturity-level numbering (0-6) used everywhere
- README has a 5-minute quickstart; reading order documented; glossary added
- Zero content lost; every moved section reachable via a pointer
- Agent behavior unchanged on a battery of standard tasks
- `setup.mjs --help` works; unknown flags rejected

## Non-Goals

- Rewriting framework rules or the OpenSpec workflow
- Adding npm dependencies
- Touching cursor rules (handled by `cursor-rules-modernization`, already shipped)

---

## Design

### Workstream A — Context slim

**CLAUDE.md target structure (~500 lines):**

```
## Non-Negotiable Rules                          [~30 lines, verbatim]
## Done Checklist                                [~25 lines, verbatim]
## OpenSpec Workflow                             [~50 lines summary + link]
## Micro Cycle                                   [~30 lines verbatim]
## Testing Requirements (Tier 1-5)               [~40 lines summary + link]
## Safety Mechanisms                             [~30 lines summary + link]
## Memory System (5-layer summary)               [~30 lines summary + link]
## Agent Roster (1-line per agent)               [~30 lines summary + link]
## Permission Tiers                              [~25 lines verbatim]
## Git Conventions                               [~25 lines verbatim]
## Session Protocols                             [~30 lines summary + link]
## Pointers
  - docs/appendix/iteration-cycles.md
  - docs/appendix/capability-monitoring.md
  - docs/appendix/performance-feedback.md
  - docs/appendix/prompt-playbook.md
  - docs/appendix/voice-input.md
  - docs/appendix/glossary.md
  - docs/appendix/maturity-model.md
  - docs/appendix/agent-system-full.md
```

**Migration script `agents/claude-md-split.mjs`:**
1. Parse `CLAUDE.md` by `##` headers
2. For each "move to appendix" section: write content to `docs/appendix/<slug>.md` with `**Source**: CLAUDE.md (pre-split)` header
3. Replace the section body in `CLAUDE.md` with a 3-line summary + `→ See docs/appendix/<slug>.md`
4. Verify total `CLAUDE.md` ≤500 lines
5. Reproducible — commit the script.

**AGENTS.md slim:** in-place edit, prioritize per ASDLC 2026 (build/test commands → definition of done → escalation rules → monorepo scoping → other).

### Workstream B — Onboarding paths

**Maturity numbering unification:**
- Canonical: 0-6 (matches ONBOARDING.md)
- Update README (currently 1-6), maturity-model.md (1-7), level-* doc filenames if needed
- Single grep proves consistency: `grep -rE "Level [0-9]" README.md ONBOARDING.md framework/maturity-model.md docs/levels/` should return only 0-6 references

**README "Try It in 5 minutes" quickstart** — new section at the very top, before "About":

```markdown
## Try it (5 minutes)

```bash
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
cd ~/your-existing-project   # or: mkdir my-project && cd my-project
node ~/agentic-sdlc/setup.mjs --discover    # preview what setup will do (no changes)
node ~/agentic-sdlc/setup.mjs               # actual setup
```

After setup: `node ~/agentic-sdlc/agents/queue-drainer.mjs status` should print an empty queue. You're ready to add tasks.
```

**Reading order section** in README:
```markdown
## Read these in order
1. README.md (you are here) — 5-min overview
2. ONBOARDING.md — 5-phase integration protocol
3. CLAUDE.md — core operating rules (concise; appendix is on-demand)
4. docs/cursor-setup.md OR docs/cursor-background-agents.md — pick your client
5. framework/maturity-model.md — where you fit on the 0-6 ladder
6. docs/appendix/ — load as needed
```

**Glossary** at `docs/glossary.md`: roughly 30 terms (micro cycle, REM sleep, four-layer validate, defeat test, capability checklist, etc.).

**ONBOARDING.md additions:**
- Prerequisites section: Node 18+, `openspec` CLI, at least one LLM API key (table per provider)
- API key setup section: per provider, where to get the key + env var name

**Stale-reference audit:** grep README/ONBOARDING/docs for `.cursorrules` (we deleted it), specific line counts, etc. Fix any drift.

### Workstream C — Code polish

**`setup.mjs --help`:**
- Print usage, all flags (`--discover`, `--dry-run`, `--dir`, `--help`), 3 example invocations
- Unknown flag → print "Unknown flag: X. See --help" + exit 2

**`agents/test-behavior.mjs`:**
- First line printed after parse: `Summary: N suites, M passed, K failed (will detail below).` Then full detail. (Currently summary is at the end.)

### Sequencing within the change

A.1 (script) → A.2 (run) → A.3 (verify cap) → B (docs in parallel) → C (small flags) → Battery test → Archive.

Workstream B largely depends on A having shipped (the "appendix" links in B's reading-order section assume A's structure exists).

### Verification

Battery: 3 standard tasks (backend bug fix, frontend component edit, new openspec change). All must complete with no "I don't know where X lives" failures.
