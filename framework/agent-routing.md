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

| Trigger Condition | Agent | Action |
|-------------------|-------|--------|
| Backend task (API, database, services, stores, hooks) | **Backend Developer** | Implement + test |
| AI/ML task (transcription, prompts, AI services) | **AI Pipeline Engineer** | Implement + test |
| Frontend task (screens, components, navigation, styling) | **Frontend Developer** | Implement + test + browser E2E |
| Code submitted for review | **Code Reviewer** | Review against checklist, approve/reject |
| UI/UX quality review (design tokens, a11y, visual polish) | **UI/UX Designer** | Audit design system, accessibility, visual hierarchy, Storybook stories |
| Deploy, release, CI/CD | **Release Manager** | Execute deploy pipeline |
| Documentation needed | **Documentarian** | Write/update docs |

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
└── No → Is this an IMPLEMENTATION task?
    ├── Yes → Route by domain (see domains.json)
    │   ├── Backend files → Backend Developer
    │   ├── AI/ML files → AI Pipeline Engineer
    │   ├── Frontend files → Frontend Developer
    │   ├── Style/design/a11y files → UI/UX Designer
    │   └── Other → Generic agent
    └── No → Is this a REVIEW/RELEASE task?
        ├── Code review → Code Reviewer
        ├── Design/a11y review → UI/UX Designer
        ├── Deploy → Release Manager
        └── Docs → Documentarian
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
