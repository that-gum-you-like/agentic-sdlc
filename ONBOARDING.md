# Agentic SDLC — Onboarding Guide

> **For AI agents**: You are helping a user integrate the Agentic SDLC framework into their project. Follow the 5-phase protocol below. Do NOT apply the full framework at once — discover first, then integrate incrementally based on what the project actually needs.
>
> **For humans**: This guide works as a step-by-step walkthrough whether you're using an AI agent or doing it manually.

---

## Prerequisites

- **Node.js 18+** — required to run framework scripts (`setup.mjs`, `queue-drainer.mjs`, etc.)
- **Git** — the framework assumes git for commits, history, and hooks
- **Framework cloned** — `git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc`

---

## Phase 1: Discover the Project

Before recommending anything, understand what exists. Read these files in the user's project directory:

**Detect tech stack:**
- `package.json` → Node.js/TypeScript/JavaScript (check `dependencies`, `devDependencies`, `scripts.test`)
- `requirements.txt` / `pyproject.toml` / `setup.py` → Python
- `Cargo.toml` → Rust
- `go.mod` → Go
- `pom.xml` / `build.gradle` → Java/Kotlin

**Detect testing:**
- `jest.config.*` or `"jest"` in package.json → Jest
- `pytest.ini` / `pyproject.toml [tool.pytest]` → pytest
- `vitest.config.*` → Vitest
- Check `scripts.test` in package.json for the test command

**Detect CI/CD:**
- `.github/workflows/` → GitHub Actions
- `.gitlab-ci.yml` → GitLab CI
- `Jenkinsfile` → Jenkins
- `Dockerfile` / `docker-compose.yml` → containerized

**Detect existing AI/agent config:**
- `CLAUDE.md` → already using Claude Code
- `.cursorrules` → already using Cursor
- `agents/` directory → may already have agent setup
- `tasks/` directory → may already have task queue

**Detect project structure:**
- How many source files? (`find src -name "*.ts" | wc -l` or equivalent)
- How many tests? (count test files)
- Git history — how many contributors? How active? (`git log --oneline -20`)

**Quick discovery command:**
```bash
node ~/agentic-sdlc/setup.mjs --discover --dir /path/to/project
```
This outputs a JSON report without modifying any files. Add `--human` for a summary line:
```bash
node ~/agentic-sdlc/setup.mjs --discover --human --dir /path/to/project
# Output: "TypeScript/React Native project at Level 5 (has memory). Suggested: backend, reviewer, frontend"
# { "projectDir": "...", "language": "typescript", "framework": "react-native", ... }
```

**Example discovery output:**
```json
{
  "projectDir": "/home/user/my-app",
  "language": "typescript",       // Detected from package.json devDependencies
  "framework": "react",           // Detected from dependencies (react, next, vue, etc.)
  "testFramework": "jest",        // Detected from jest.config or package.json
  "testCmd": "npm test",          // From package.json scripts.test
  "ci": "github-actions",         // Detected from .github/workflows/
  "packageManager": "npm",        // Detected from lockfile (yarn.lock, pnpm-lock.yaml)
  "hasExistingAgents": false,     // agents/ directory exists?
  "hasTaskQueue": false,          // tasks/queue/ directory exists?
  "hasMemory": false,             // agents/*/memory/core.json exists?
  "suggestedAgents": ["backend", "frontend", "reviewer"],
  "suggestedLevel": 0             // Based on what's already in place
}
```

**Greenfield project (no code yet)?** If discovery finds nothing — no package.json, no source files, no tests — start at Level 1: create a `CLAUDE.md` with your intended tech stack and coding conventions. Write some initial code and at least one test. Then come back and run `setup.mjs` when ready for Level 3.

**Monorepo or subdirectory project?** If your app lives in a subdirectory (e.g., `packages/web/`, `app/`), the framework handles this. During `setup.mjs`, set the "App subdirectory" to your app's location. Discovery auto-detects this from `agents/project.json` when it exists.

---

## Phase 2: Assess Current Maturity

Map what you discovered to the framework's maturity levels:

| Level | Name | Signs the project is already here |
|-------|------|-----------------------------------|
| 0 | Manual | No AI involvement in development |
| 1 | Assisted | AI helps write code (Copilot, Claude, Cursor in use) but human does everything else |
| 2 | Automated | AI writes code AND runs tests, but single-agent (one conversation) |
| 3 | Orchestrated | Multiple agents or task-based workflow, but no persistent memory |
| 4 | Quality | Automated code review, defeat tests, E2E testing in place |
| 5 | Evolving | Agents have memory, learn from failures, track maturation |
| 6 | Self-Improving | Pattern detection, behavior testing, capability monitoring |

**Tell the user:** "Based on what I see, your project is at Level [N]. Here's why: [evidence]. I recommend starting the framework integration at Level [N+1]."

---

## Phase 3: Choose What to Integrate

Present the options based on their current level. DO NOT push everything — let the user choose.

**If at Level 0-1** (just getting started with AI):
- Add `CLAUDE.md` with project-specific instructions
- Establish the micro cycle: implement → test → commit
- That's it for now. See `docs/levels/level-1-assisted.md` and `docs/levels/level-2-automated.md`.

**If at Level 2** (single AI agent working):
- Add task queue and agent roster for parallel work
- Configure domain routing so tasks go to the right agent
- Run `node ~/agentic-sdlc/setup.mjs` to scaffold the structure
- See `docs/levels/level-3-orchestrated.md`.

**If at Level 3** (multi-agent but no quality gates):
- Add defeat tests (anti-pattern detection)
- Add a code reviewer agent
- Add browser E2E for frontend
- See `docs/levels/level-4-quality.md`.

**If at Level 4** (quality gates in place):
- Add 5-layer memory system per agent
- Configure REM sleep for memory consolidation
- Add model-manager for budget monitoring
- See `docs/levels/level-5-evolution.md`.

**If at Level 5** (agents learning):
- Add pattern hunt for recurring issues
- Add behavior tests for prompt quality
- Add capability monitoring for drift detection
- See `docs/levels/level-6-self-improving.md`.

**Ask the user:** "Which level would you like to start with? I can walk you through the integration step by step."

**Non-JavaScript projects — adaptation notes:**

| Language | Test Command | Directory Convention | CLAUDE.md Notes |
|----------|-------------|---------------------|----------------|
| Python | `pytest` or `python -m pytest` | `src/`, `tests/`, `requirements.txt` | Add: "Use type hints. Follow PEP 8. Virtual env in `.venv/`." |
| Rust | `cargo test` | `src/`, `tests/`, `Cargo.toml` | Add: "Use `clippy` for linting. Follow Rust API guidelines." |
| Go | `go test ./...` | `cmd/`, `pkg/`, `internal/`, `go.mod` | Add: "Use `golint`. Follow effective Go conventions." |
| Java/Kotlin | `./gradlew test` or `mvn test` | `src/main/`, `src/test/`, `pom.xml` | Add: build tool conventions, package structure. |

The framework scripts are language-agnostic — they manage JSON task files, agent memory, and orchestration. The test command, file patterns, and coding conventions are project-specific and set during `setup.mjs`.

---

## Phase 4: Integrate

Once the user chooses a level, follow the corresponding guide in `docs/levels/`. Each guide provides:

1. **Prerequisites** — what must already be in place
2. **What you'll add** — specific files and configuration
3. **Step-by-step** — numbered actions to follow
4. **Validation** — how to confirm it's working

**Key integration principles:**

- **Add to what exists** — don't replace their current setup, extend it
- **Use their conventions** — if they use snake_case, configure agents for snake_case. If they use GitHub Actions, integrate there.
- **Run their tests** — use the test command they already have (`scripts.test` from package.json), don't impose a new one
- **Respect their repo structure** — the framework's `agents/` and `tasks/` directories go IN their project, alongside their existing code
- **Don't over-configure** — start with 2-3 agents, not 15. Add more as they need them.

**Running setup.mjs:**
```bash
# Interactive — answers questions about your project
node ~/agentic-sdlc/setup.mjs

# With project directory specified
node ~/agentic-sdlc/setup.mjs --dir /path/to/project

# Discovery only (no changes)
node ~/agentic-sdlc/setup.mjs --discover --dir /path/to/project
```

**Suggested starter agent rosters by project type:**

| Project Type | Starter Agents |
|-------------|----------------|
| Web app | backend, frontend, reviewer |
| API service | backend, reviewer, integration-tester |
| AI product | backend, ai-engineer, reviewer, research-agent |
| Mobile app | frontend, backend, qa-engineer |
| Any project | Start with 2-3 agents. Add more when the queue is consistently deep. |

---

## Phase 5: Validate

After integration, verify each component is working:

**Level 1-2 validation:**
```bash
# AI agent follows project rules in CLAUDE.md
# Tests pass before every commit
# Micro cycle is followed: implement → test → commit
```

**Level 3 validation:**
```bash
# Queue drainer sees tasks
node ~/agentic-sdlc/agents/queue-drainer.mjs status

# Agent can be assigned a task
node ~/agentic-sdlc/agents/queue-drainer.mjs run
```

**Level 4 validation:**
```bash
# Defeat tests catch anti-patterns
node ~/agentic-sdlc/agents/four-layer-validate.mjs

# Behavior tests pass
node ~/agentic-sdlc/agents/test-behavior.mjs --dry-run
```

**Level 5 validation:**
```bash
# Memory files exist per agent
ls agents/*/memory/core.json

# Model-manager can check utilization
node ~/agentic-sdlc/agents/model-manager.mjs check
```

**Level 6 validation:**
```bash
# Pattern hunt finds issues
node ~/agentic-sdlc/agents/pattern-hunt.mjs --dry-run

# Capability monitoring is active
node ~/agentic-sdlc/agents/capability-monitor.mjs status
```

**Tell the user:** "Everything at Level [N] is working. When you're ready to advance to Level [N+1], let me know and I'll walk you through it."

---

## Framework Reference

Once integrated, the framework provides:

| Component | What it does | Key command |
|-----------|-------------|-------------|
| Task queue | JSON-based task management with priority, dependencies, routing | `queue-drainer.mjs status` |
| Micro cycle | Pick → Implement → Test → Commit → Next | Built into agent prompts |
| 5-layer memory | core, long-term, medium-term, recent, compost | `memory-manager.mjs recall <agent>` |
| OpenSpec | Governance: proposal → design → specs → tasks → implement | `openspec new change "name"` |
| Model manager | Token budgets, model swaps, performance ledger | `model-manager.mjs check` |
| Defeat tests | Anti-pattern detection with shrinking allowlists | `four-layer-validate.mjs` |
| Code review | Automated checklist with severity verdicts | Built into reviewer agent |
| Browser E2E | Production build testing with screenshots | Built into QA agent |
| Safety mechanisms | 14 guards: circuit breakers, stale claims, REM sleep, etc. | See `docs/safety-mechanisms.md` |
| Adapters | Pluggable orchestration (file-based/Paperclip) and LLM providers (Anthropic/OpenAI/Groq/Ollama) | Configure in `project.json` |

**Full documentation:** `CLAUDE.md` (framework rules), `docs/` (guides), `framework/` (methodology).

---

## Troubleshooting First Setup

| Problem | Solution |
|---------|----------|
| `setup.mjs` can't find project | Use `--dir /path/to/project` flag |
| Queue drainer shows no tasks | Seed tasks: `node ~/agentic-sdlc/agents/seed-queue.mjs` |
| Agent gets "task not found" | Check `tasks/queue/` directory exists and has .json files |
| Tests fail on first run | Verify test command in `agents/project.json` matches your project's test runner |
| Memory files empty | Expected — memory accumulates as agents work. Run a task first. |
| Model-manager shows 0% for all agents | Expected — utilization tracks within current day. Run some tasks first. |
| Discovery shows `"language": "unknown"` | App is likely in a subdirectory. Set `appDir` in `agents/project.json` or use `--dir` pointing to the app directory |
| CLAUDE.md not being read by AI tool | Verify you're running the AI tool from the project root (where CLAUDE.md lives), not a subdirectory |
| No `agents/` directory after setup | Run `setup.mjs` from the project directory, not the framework directory. Use `--dir` if needed. |
| Test command fails during agent tasks | Verify `testCmd` in `agents/project.json` matches your actual test runner. Use full path: `node_modules/.bin/jest` not `npx jest` |
