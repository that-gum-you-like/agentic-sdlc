# Multi-Agent SDLC — Portability Guide

The agent system is designed to be dropped into any project without modification to the core scripts. All project-specific details live in a single configuration file. This guide covers how to bootstrap the system in a new project, how configuration resolution works, and how to customize the agent roster.

## Bootstrap with setup.mjs

The recommended way to initialize a new project is to run the setup script:

```bash
node agents/setup.mjs
```

`setup.mjs` walks through the required configuration interactively, creates the directory structure, scaffolds empty memory files for each agent, and validates that the resulting setup can be loaded correctly. It is the fastest path from a bare repository to a running agent system.

If you prefer manual setup, follow the steps below.

## Manual Setup

### Step 1: Copy the agents/ directory to your project root

```bash
cp -r /path/to/reference/agents/ /your/project/agents/
```

### Step 2: Edit agents/project.json

```json
{
  "name": "YourProject",
  "projectDir": "/absolute/path/to/your/project",
  "appDir": "your-app-subdirectory",
  "testCmd": "cd your-app-subdirectory && npm test",
  "agents": ["roy", "moss", "jen", "richmond", "denholm", "douglas"],
  "matrixDomain": "yourproject.local",
  "matrixServer": "http://127.0.0.1:6167",
  "credentialsPath": "/path/to/matrix/credentials.json"
}
```

**Field reference:**

| Field | Description |
|-------|-------------|
| `name` | Human-readable project name, used in reports and dashboards |
| `projectDir` | Absolute path to the project root — where `agents/`, `tasks/`, and `pm/` live |
| `appDir` | Subdirectory containing application code (e.g., `src`, `app`, or `.` for flat layouts) |
| `testCmd` | Shell command to run the full test suite |
| `agents` | Array of agent slugs — must match directory names under `agents/` |
| `matrixDomain` | Matrix homeserver domain used for room aliases |
| `matrixServer` | Matrix server URL |
| `credentialsPath` | Absolute path to `credentials.json` containing agent access tokens |

### Step 3: Create agent directories

For each agent slug listed in `project.json`:

```
agents/<name>/
  AGENT.md              # System prompt defining the agent's role and rules
  memory/
    core.json           # Identity, values, non-negotiables, critical failure memories
    long-term.json      # Patterns learned across sprints
    medium-term.json    # Current sprint context and active architecture decisions
    recent.json         # Current session events and immediate learnings
    compost.json        # Deprecated approaches and failed ideas
```

Each memory file should start as an empty array or a minimal JSON object. The memory protocol document describes the expected schema for entries in each layer.

### Step 4: Initialize the task queue

```bash
mkdir -p tasks/queue tasks/completed
```

### Step 5: Create the PM dashboard

```bash
mkdir -p pm
echo "# Project Dashboard" > pm/DASHBOARD.md
```

### Step 6: Verify the setup

```bash
node agents/queue-drainer.mjs status     # Should show an empty queue without errors
node agents/test-behavior.mjs --dry-run  # Check agent prompt quality
node agents/rem-sleep.mjs --dry-run      # Verify memory system can be read
```

## How load-config.mjs Works

Every agent script imports configuration through a shared loader:

```javascript
import { loadConfig } from './load-config.mjs';
const config = loadConfig();
```

`load-config.mjs` is located in the SDLC repo's `agents/` directory and searches multiple locations to find `agents/project.json`. It walks up parent directories from the current working directory, so scripts can be run from subdirectories of a project.

**Resolution order:**

1. `--project-dir` CLI argument (if provided)
2. `SDLC_PROJECT_DIR` environment variable (if set)
3. Current working directory + `agents/project.json`
4. Walk up parent directories until `agents/project.json` is found
5. If not found anywhere, falls back to built-in defaults
6. Resolves all paths to absolute paths using `resolve()` before caching

**What it returns:**

```javascript
{
  name: "YourProject",
  projectDir: "/absolute/path/to/project",
  appDir: "src",
  appPath: "/absolute/path/to/project/src",
  testCmd: "cd src && npm test",
  agents: ["..."],
  agentsDir: "/absolute/path/to/project/agents",
  tasksDir: "/absolute/path/to/project/tasks/queue",
  completedDir: "/absolute/path/to/project/tasks/completed",
  budgetPath: "/absolute/path/to/project/agents/budget.json",
  costLogPath: "/absolute/path/to/project/agents/cost-log.json",
  matrixDomain: "yourproject.local",
  matrixServer: "http://127.0.0.1:6167",
  credentialsPath: "/absolute/path/to/credentials.json",
  dashboardPath: "/absolute/path/to/project/pm/DASHBOARD.md"
}
```

Results are cached for the process lifetime. Calling `loadConfig()` multiple times in the same process is free.

**Fallback behavior:** If `project.json` is absent or contains invalid JSON, `load-config.mjs` falls back to its built-in defaults silently. This ensures backward compatibility with projects that existed before `project.json` was introduced, but it means misconfigured files will not produce an error — they will silently produce wrong paths. Always run `node agents/queue-drainer.mjs status` after editing `project.json` to catch parsing errors early.

## Customizing the Agent Roster

You can add, remove, or rename agents freely. The system does not have a fixed roster requirement.

**To add a new agent:**
1. Add the slug to the `agents` array in `project.json`
2. Create `agents/<name>/AGENT.md` with the agent's system prompt
3. Create `agents/<name>/memory/` with the five memory files
4. Add the agent's domain to `AGENT_DOMAINS` in `queue-drainer.mjs` so the router knows which file patterns to assign to them

**To remove an agent:**
1. Remove the slug from the `agents` array in `project.json`
2. Remove or archive the agent directory
3. Remove their entry from `AGENT_DOMAINS` in `queue-drainer.mjs`

**To rename an agent:**
1. Rename the directory under `agents/`
2. Update the slug in `project.json`
3. Update `AGENT_DOMAINS` in `queue-drainer.mjs`
4. Update Matrix credentials and room memberships if using a live Matrix server

## Budget Configuration

Agent token budgets are defined in `agents/budget.json`:

```json
{
  "conservationMode": false,
  "agents": {
    "agentname": {
      "dailyTokens": 100000,
      "model": "claude-sonnet-4-6"
    }
  }
}
```

Conservation mode (set `"conservationMode": true`) halves all daily token limits automatically. See `docs/safety-mechanisms.md` for the full budget circuit breaker documentation.

## Matrix Server Requirements

The communication layer requires a running Matrix server compatible with the Synapse client API (Conduwuit works well for local deployments). Agents post task updates, blockers, and review handoffs through Matrix rooms.

If you do not need inter-agent communication, you can disable Matrix integration by removing the `send`/`read` calls from agent prompts, but the queue and memory systems will continue to function independently.
