# Agentic SDLC Framework

A universal methodology for AI-assisted software development using Claude Code. This framework provides the scripts, templates, and documentation needed to run a multi-agent development team.

## What Is This?

The Agentic SDLC is a structured approach to using AI agents for software development. It provides:

- **Multi-agent orchestration** — Specialist agents with defined roles, memory, and domains
- **Task queue system** — Priority-based task assignment with dependency tracking
- **OpenSpec workflow** — Structured change management: proposal → design → specs → tasks → implement
- **5-layer memory** — Agents learn from mistakes and build institutional knowledge; optional semantic search via sentence-transformers
- **Safety mechanisms** — Budget limits, stale claim detection, test-gated completion
- **Iteration cycles** — Micro (per-task), daily, weekly, and monthly review cadences
- **Agent permission tiers** — Configurable per-agent access from read-only through deploy
- **JSON Schema data contracts** — Validated inter-agent handoffs via `agents/schema-validator.mjs`
- **Human wellness guardrails** — Optional session-hour and night-cutoff advisory alerts
- **Agent maturation tracking** — 6-week evolution timeline for structured agent improvement

## Quick Start

### 1. Clone this repo
```bash
git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
```

### 2. Bootstrap a project
```bash
cd ~/your-project
node ~/agentic-sdlc/setup.mjs
```

### 3. Start working
```bash
claude  # CLAUDE.md auto-loaded with SDLC methodology
```

## How It Works

### Claude Code Integration
When you run `claude` in this repo's directory, the `CLAUDE.md` file is automatically loaded, providing full SDLC guidance. For projects, `setup.mjs` adds SDLC references to the project's own `CLAUDE.md`.

### Cross-Directory Scripts
All scripts in `agents/` can be run from any project directory. The `load-config.mjs` module automatically finds your project's `agents/project.json` by searching the current directory and parent directories.

```bash
cd ~/my-project
node ~/agentic-sdlc/agents/queue-drainer.mjs status
```

### Agent Roster
Each project defines its own agent roster — specialist agents with AGENT.md system prompts, memory files, and domain patterns. The framework provides templates; you customize for your project.

## Directory Structure

```
agentic-sdlc/
├── CLAUDE.md                    # Auto-loaded by Claude Code
├── README.md                    # This file
├── setup.mjs                    # Interactive bootstrap for new projects
├── framework/                   # Methodology documentation
│   ├── maturity-model.md        # 7-level maturity pyramid
│   ├── iteration-cycles.md      # Micro/Daily/Weekly/Monthly
│   ├── validation-patterns.md   # 4-layer validation, defeat tests
│   ├── case-studies.md          # Real failure case studies
│   ├── evolution-timeline.md    # 6-week agent maturation timeline
│   ├── requirements-guide.md    # REQ-xxx format, 5-component structure, anti-patterns
│   ├── parallelization-guide.md # Dependency graphs, interface contracts, work streams
│   └── agent-lifecycle.md       # Create/specialize/terminate, CTO mindset, roadmap discipline
├── agents/                      # Scripts and templates
│   ├── load-config.mjs          # Cross-directory config loader
│   ├── queue-drainer.mjs        # Task queue management
│   ├── worker.mjs               # Agent prompt generator
│   ├── memory-manager.mjs       # 5-layer memory CRUD
│   ├── rem-sleep.mjs            # Memory consolidation
│   ├── cost-tracker.mjs         # Token usage tracking
│   ├── test-behavior.mjs        # Prompt quality validation
│   ├── four-layer-validate.mjs  # AST anti-pattern scanning
│   └── templates/               # Project setup templates
│       └── planning-agents/     # 4 planning-phase agent templates
├── openspec/                    # OpenSpec workflow
│   ├── README.md                # How to use OpenSpec
│   └── templates/               # Artifact templates
├── skills/                      # Claude Code skills
│   └── openspec-*/SKILL.md      # 10 OpenSpec skills
├── docs/                        # Reference documentation
│   ├── safety-mechanisms.md
│   ├── portability-guide.md
│   ├── agent-system.md
│   ├── memory-protocol.md
│   └── comparison.md            # Framework comparison (vs LangGraph, Autogen, CrewAI)
└── .claude/
    └── settings.json            # Recommended Claude Code settings
```

## Maturity Model

The framework defines 7 maturity levels, each building on the previous:

| Level | Name | Key Capability |
|-------|------|---------------|
| 0 | Manual | Human does everything |
| 1 | Assisted | AI helps write code |
| 2 | Automated | AI writes, human reviews |
| 3 | Orchestrated | Multiple AI agents, queue-based |
| 4 | Autonomous | Agents work overnight |
| 5 | Evolving | Agents learn from mistakes |
| 6 | Self-Improving | System improves without intervention |

## Optional Dependencies

The framework works fully without any Python dependencies. These are opt-in:

```bash
pip install -r agents/requirements-nlp.txt
```

Enables:
- **Semantic memory search** — `memory-manager.mjs search` uses vector embeddings instead of full recall
- **NLP code analysis** — `ast-analyzer.mjs` gains additional semantic pattern detection

Without this package, all commands still work; search falls back to full recall.

## Documentation

| Document | Description |
|----------|-------------|
| `framework/maturity-model.md` | 7-level maturity pyramid |
| `framework/iteration-cycles.md` | Micro/Daily/Weekly/Monthly cadences |
| `framework/validation-patterns.md` | 5-layer validation and defeat tests |
| `framework/case-studies.md` | Real failure case studies |
| `framework/evolution-timeline.md` | 6-week agent maturation timeline |
| `docs/agent-system.md` | Agent roster, memory, and domain routing |
| `docs/memory-protocol.md` | 5-layer memory system |
| `docs/safety-mechanisms.md` | Budget, stale claims, test gates |
| `docs/comparison.md` | Framework comparison vs LangGraph, Autogen, CrewAI |
| `docs/portability-guide.md` | Adapting the framework to a new project |

## License

MIT
