# Proposal: SDLC Gap Closure

## Problem We're Solving

The Agentic SDLC framework scores "Advanced" in design but "Nascent" in actual operation. An assessment revealed 7 critical gaps:

1. **Autonomy gap** — Queue drainer has never launched an agent. Zero autonomous runs completed.
2. **Portability gap** — All 15 scripts hardcode `/home/bryce/languageapp`. Cannot be used on any other project.
3. **Matrix gap** — Matrix server exists but has never carried a real agent message.
4. **Documentation gap** — `docs/` contains only 1 file. Douglas has never generated documentation.
5. **Safety net gap** — Circuit breakers, conservation mode, stale claim detection have never fired.
6. **Cost tracking gap** — `cost-log.json` is empty. No usage data has ever been recorded.
7. **Accuracy gap** — Dashboard and CLAUDE.md contain stale counts that don't match the codebase.

## Who Benefits and How

- **Bryce (project owner):** Gets a working, portable SDLC framework that can be applied to any project.
- **All agents:** Get verified safety nets, real communication channels, and accurate documentation.
- **Future projects:** Can adopt the multi-agent system by editing `project.json` instead of forking and patching 15 scripts.

## Proposed Solution

9-phase remediation:
1. OpenSpec artifacts (this change)
2. Portability refactor (`project.json` + `load-config.mjs`)
3. First autonomous run (queue drainer → worker → Roy subagent)
4. Matrix communication verification
5. Safety net validation (conservation, budget, stale claims, REM sleep)
6. Douglas documentation generation (3 real docs)
7. Test expansion (integration + E2E)
8. Accuracy pass (update stale numbers)
9. Close and re-assess

## What's Already Built

- 15 agent scripts (queue-drainer, worker, cost-tracker, etc.)
- 6 IT Crowd-themed agents with AGENT.md + 5-layer memory
- Matrix server (conduwuit) configured with rooms and credentials
- OpenSpec workflow, task queue, behavior tests (30 checks)

## Success Criteria

- `grep -r "resolve('/home/bryce/languageapp')" agents/*.mjs` returns nothing
- `ls tasks/completed/SDLC-001.json` exists
- Matrix rooms contain real agent messages
- `docs/` contains architecture.md, api/services.md, agents/agent-system.md
- `cost-log.json` has at least 1 entry
- All safety mechanisms verified working
- No "Nascent" ratings in final assessment

## Value Analysis

- **Who benefits:** Bryce (portable framework), all agents (verified infrastructure), future projects (reusable system)
- **What happens if we don't build this:** The SDLC remains impressive on paper but non-functional in practice. No agent has ever run autonomously. No safety net has ever been tested. The framework cannot be used on any project other than LinguaFlow.
- **Success metrics:** 0 hardcoded paths, 1+ autonomous runs, 3+ docs generated, all safety nets verified, no Nascent ratings
