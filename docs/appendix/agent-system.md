# Appendix: Agent System

**Source**: CLAUDE.md (pre-split 2026-05-27). This is the full detail for the Agent System section, which the slim CLAUDE.md summarizes in one paragraph.

---

## Roster Concept

Projects use specialist agents, each with:
- **AGENT.md** — System prompt with identity, role, operating rules
- **memory/** — 5-layer memory (core, long-term, medium-term, recent, compost)
- **Domain patterns** — File patterns and keywords that route tasks

## Planning Agents (run before execution)

Projects should include planning-phase agents that produce standardized artifacts:

| Role | Produces | Receives From |
|------|----------|---------------|
| Requirements Engineer | `requirements.md` (REQ-xxx) | Brain dump |
| Business Value Analyst | `priorities.md` (value/complexity scores) | Requirements |
| Technical Product Manager | `roadmap.md` (phased plan) | Requirements + Priorities |
| Parallelization Analyst | `parallelization.md` (work streams) | Roadmap |
| Quality Alignment Monitor | Alignment reports, prompt suggestions | All agent outputs |

Pipeline: `Brain dump → Requirements → Priorities → Roadmap → Parallelization → Execution agents build`

## Execution Agent Templates

The framework provides 15 execution agent templates in `agents/templates/execution-agents/`. During `setup.mjs`, role keywords are matched to templates which auto-configure domain patterns, capabilities, and operating rules.

| Template | Domain | Pattern |
|----------|--------|---------|
| `cto-orchestrator` | Decompose, delegate, monitor, unblock | Replacement (different micro cycle) |
| `code-reviewer` | Universal review checklist, verdicts | Addendum |
| `release-manager` | Merge sequencing, deploy pipeline | Addendum |
| `backend-developer` | Services, stores, data layer | Addendum |
| `frontend-developer` | Screens, components, accessibility | Addendum |
| `ai-engineer` | LLM integration, prompts, transcription | Addendum |
| `documentarian` | API docs, guides, README | Addendum |
| `security-engineer` | OWASP, CVE audit, auth/RLS | Addendum |
| `qa-engineer` | E2E, smoke tests, visual regression | Addendum |
| `integration-tester` | Contract tests, boundary validation | Addendum |
| `ethics-advisor` | Bias, privacy, user impact | Addendum |
| `architect` | ADRs, system design, API contracts | Addendum |
| `dependency-auditor` | CVE scanning, license compliance (cron) | Addendum |
| `performance-sentinel` | Benchmarks, regression detection (cron) | Addendum |
| `platform-maturity-sentinel` | Maturity assessment, production readiness, DORA metrics | Addendum |
| `research-agent` | Context gathering before execution | Addendum |

See `docs/execution-agents.md` for full guide. Templates use YAML frontmatter for `role_keywords`, `default_patterns`, and `capabilities` — `setup.mjs` reads this automatically.

## Documentation Mode (Micro Cycle Variant)

For tasks producing templates, documentation, or configuration (not testable code), the per-task test requirement doesn't apply. Instead: **implement batch → validate batch → commit batch**.

- Apply when: tasks produce non-testable artifacts (templates, docs, config, guides)
- Validate by: reviewing content for accuracy, checking required sections exist, verifying links/references
- Batch size: group related doc tasks into a single commit with a single validation pass
- Standard micro cycle still applies to all testable code tasks

## Task Queue Commands

```bash
node ~/agentic-sdlc/agents/queue-drainer.mjs status                  # See queue
node ~/agentic-sdlc/agents/queue-drainer.mjs run                     # Assign next task
node ~/agentic-sdlc/agents/queue-drainer.mjs run --parallel           # Assign all independent
node ~/agentic-sdlc/agents/queue-drainer.mjs claim <id> <agent>       # Claim a task
node ~/agentic-sdlc/agents/queue-drainer.mjs release <id>             # Release a claimed task
node ~/agentic-sdlc/agents/queue-drainer.mjs complete <id> passing    # Mark done
node ~/agentic-sdlc/agents/queue-drainer.mjs archive                  # Archive completed
node ~/agentic-sdlc/agents/queue-drainer.mjs reset <id>               # Reset stuck task
```

**Token Estimate Reference (use for `estimatedTokens` field in task JSON):**
| Task Type | estimatedTokens | When to Use |
|-----------|----------------|-------------|
| simple fix | 3500 | Single-file change, config update, minor bug fix |
| feature | 20000 | New screen, service, or component |
| architecture | 35000 | Multi-file refactor, schema design |
| research | 65000 | Investigation spike, design exploration |

## Worker Launcher

```bash
node ~/agentic-sdlc/agents/worker.mjs --agent <name> --task <task-id>
```
