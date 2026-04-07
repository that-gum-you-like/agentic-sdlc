# Agent Routing — When to Use Which Agent

Quick reference for which agent handles which situation. Use this when you're unsure who should do what.

## Planning Phase Agents

| Trigger Condition | Agent | Action |
|-------------------|-------|--------|
| New project or feature brain dump | **Requirements Engineer** | Transform into REQ-xxx requirements |
| Requirements need prioritization | **Business Value Analyst** | Score value/complexity, create priority matrix |
| Need phased delivery plan | **Technical Product Manager** | Create roadmap with phases, demo sentences, handoffs |
| Roadmap ready for execution | **Parallelization Analyst** | Map dependencies, assign work streams, define contracts |
| Process quality check needed | **Quality Alignment Monitor** | Run alignment check, detect drift, suggest prompt adjustments |

### Planning Pipeline (Sequential)
```
Brain dump → Requirements Engineer → Value Analyst → Product Manager → Parallelization Analyst → Execution
```

## Execution Phase Agents

### Task-Driven Agents

These agents are assigned work from the task queue during normal execution cycles.

| Trigger Condition | Agent | Action |
|-------------------|-------|--------|
| Planning/delegation tasks, monitoring, unblocking | **CTO Orchestrator** | Delegate to specialists, resolve blockers, monitor progress |
| Backend task (API, database, services, stores, hooks, migrations) | **Backend Developer** | Implement + test |
| Frontend task (screens, components, navigation, styling) | **Frontend Developer** | Implement + test + browser E2E |
| AI/ML task (LLM integration, transcription, prompts) | **AI/ML Engineer** | Implement + test |
| Code submitted for review | **Code Reviewer** | Review all submissions against quality checklist, approve/reject |
| UI/UX quality review (design tokens, a11y, visual polish) | **UI/UX Designer** | Audit design system, accessibility, visual hierarchy, Storybook stories |
| Deploy, release, CI/CD | **Release Manager** | Merge sequencing, execute deploy pipeline |
| Documentation needed | **Documentarian** | Write/update docs, README, guides, API docs |
| Security review, dependency audit, RLS/auth | **Security Engineer** | Security review, auth policy validation, RLS audit |
| E2E testing, smoke tests, module certification | **QA Engineer** | End-to-end test plans, smoke tests, module certification |
| Contract tests, service boundary validation | **Integration Tester** | Contract tests, service boundary validation, API compatibility |
| Ethical review, bias detection, privacy audit | **Ethics Advisor** | Ethical review, bias detection, privacy compliance audit |
| System design, ADRs, API contract design | **Architect** | System design decisions, ADRs, API contract definitions |
| Context gathering before execution tasks | **Research Agent** | Investigation spikes, gather context for other agents |

### Cron-Based Agents

These agents run on a schedule (via OpenClaw cron or similar), not from the task queue.

| Schedule | Agent | Action |
|----------|-------|--------|
| Daily / on-demand | **Dependency Auditor** | CVE scanning, license compliance, dependency freshness |
| Daily / on-demand | **Performance Sentinel** | Benchmarks, regression detection, bundle size tracking |
| Daily / on-demand | **Model Manager** | Token budget monitoring, model swap recommendations, performance ledger |

## Operational Triggers

| Trigger Condition | Agent/Script | Action |
|-------------------|-------------|--------|
| Task queue has unblocked items | `queue-drainer.mjs run` | Assign next task |
| Multiple independent tasks ready | `queue-drainer.mjs run --parallel` | Assign all independent |
| Agent needs full prompt with memory | `worker.mjs --agent <name> --task <id>` | Generate prompt |
| End of work session | `cycles/daily-review.mjs` | Dashboard update |
| Weekly maintenance | `cycles/weekly-review.mjs` | REM sleep + metrics |
| Code quality check | `four-layer-validate.mjs` | AST anti-pattern scan |
| Agent prompt changed | `test-behavior.mjs` | Validate prompt quality |
| Capability drift suspected | `capability-monitor.mjs check` | Drift detection |
| Roadmap cluttered with completed items | `garden-roadmap.mjs` | Archive completed items |
| Want autonomous operation | `autonomous-launcher.sh` | Headless Claude session |
| Process alignment check | `alignment-monitor.mjs` | Unified quality + alignment report |

## Decision Flowchart

```
Is this a PLANNING task?
├── Yes → Is it about WHAT to build?
│   ├── Yes → Requirements Engineer
│   └── No → Is it about PRIORITY?
│       ├── Yes → Value Analyst
│       └── No → Is it about WHEN/ORDER?
│           ├── Yes → Product Manager
│           └── No → Parallelization Analyst
└── No → Is this an ORCHESTRATION task?
    ├── Yes → (delegation, unblocking, monitoring) → CTO Orchestrator
    └── No → Is this an IMPLEMENTATION task?
        ├── Yes → Route by domain (see domains.json)
        │   ├── Backend files (services, stores, hooks, migrations, API) → Backend Developer
        │   ├── AI/ML files (LLM, transcription, prompts) → AI/ML Engineer
        │   ├── Frontend files (screens, components, navigation, styling) → Frontend Developer
        │   ├── Style/design/a11y files → UI/UX Designer
        │   ├── System design / ADR / API contracts → Architect
        │   └── Need context first? → Research Agent → then route to specialist
        └── No → Is this a QUALITY task?
            ├── Code review → Code Reviewer
            ├── Security review / auth / RLS → Security Engineer
            ├── E2E / smoke tests / certification → QA Engineer
            ├── Contract tests / service boundaries → Integration Tester
            ├── Ethical review / bias / privacy → Ethics Advisor
            ├── Design/a11y review → UI/UX Designer
            └── No → Is this a RELEASE/DOCS task?
                ├── Deploy / merge sequencing → Release Manager
                ├── Docs / README / guides → Documentarian
                └── No → Is this a SCHEDULED task?
                    ├── CVE / license scan → Dependency Auditor (cron)
                    ├── Benchmarks / perf regression → Performance Sentinel (cron)
                    └── Token budget / model swap → Model Manager (cron)
```

## Parallel vs Sequential

| Situation | Strategy |
|-----------|----------|
| Planning pipeline | Sequential (each step feeds the next) |
| Multiple backend tasks, no shared files | Parallel backend agents |
| Backend + frontend with defined API contract | Parallel (2 streams) |
| Code change + review | Sequential (implement then review) |
| Multiple independent roadmap phases | Parallel (one agent per phase) |
| Same file needs multiple changes | Sequential (one agent) |
| Research + implementation | Sequential (Research Agent gathers context first) |
| Security review + ethical review | Parallel (independent quality gates) |
| QA + integration testing | Parallel if testing different boundaries |
| Cron agents (auditor, sentinel, model-manager) | Parallel (independent scheduled runs) |
| Architect designs API contract + devs implement | Sequential (Architect first, then parallel Backend + Frontend) |
