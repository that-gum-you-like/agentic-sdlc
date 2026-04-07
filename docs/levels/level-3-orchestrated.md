# Level 3: Orchestrated -- Multi-Agent Task Queue

At Level 2, one agent handles everything. At Level 3, you split work across
specialized agents that pull from a shared task queue, each responsible for
a domain of your codebase.

## Prerequisites

- Level 2 complete (tests working, micro cycle established)
- A project large enough to benefit from domain separation (e.g., backend
  vs. frontend, or multiple services)

## What You'll Add

- Agent roster with named agents and domain ownership
- Task queue for work items
- Domain routing so tasks reach the right agent
- Budget configuration to control costs

## Steps

1. **Clone the agentic-sdlc framework** (if you have not already):

   ```bash
   git clone https://github.com/that-gum-you-like/agentic-sdlc.git ~/agentic-sdlc
   ```

2. **Run setup for your project:**

   ```bash
   node ~/agentic-sdlc/setup.mjs --dir /path/to/your/project
   ```

3. **Answer the setup prompts.** You will be asked for:

   - **Project name**: A short identifier (e.g., "myapp").
   - **App directory**: Where the source code lives relative to project root.
   - **Test command**: The command from Level 2 (e.g., `npm test`).
   - **Agent names**: Start with 2-3 agents. For example: `backend`,
     `frontend`, `reviewer`.
   - **Roles**: What each agent does (e.g., "backend API and database logic").
   - **File patterns**: Glob patterns for domain routing (e.g.,
     `src/api/**` for backend, `src/components/**` for frontend).

4. **Verify setup created the expected files:**

   - `agents/project.json` -- project-wide configuration
   - `agents/budget.json` -- cost limits per agent
   - `agents/domains.json` -- domain-to-agent routing rules
   - `agents/<name>/AGENT.md` -- system prompt for each agent
   - `agents/<name>/memory/` -- per-agent memory files
   - `tasks/queue/` -- directory for task JSON files

5. **Create your first task.** Write a JSON file in `tasks/queue/`:

   ```json
   {
     "id": "task-001",
     "title": "Add input validation to signup endpoint",
     "description": "Validate email format and password length in POST /auth/signup",
     "priority": 2,
     "status": "pending"
   }
   ```

6. **Run the queue drainer** to see status and execute tasks:

   ```bash
   node ~/agentic-sdlc/agents/queue-drainer.mjs status
   node ~/agentic-sdlc/agents/queue-drainer.mjs run
   ```

7. **Verify domain routing.** Check that the task was assigned to the
   correct agent based on the file patterns in `domains.json`. The queue
   drainer logs which agent picks up each task.

## Validation

Your setup is working when:

- `queue-drainer.mjs status` shows pending, in-progress, and completed tasks.
- Tasks are assigned to the correct agent based on domain patterns.
- Each agent follows the micro cycle from Level 2 (implement, test, commit).
- Budget limits in `budget.json` are respected.

See `docs/safety-mechanisms.md` for details on budget enforcement and
guardrails.

## Next Level

When you want automated quality gates — anti-pattern detection, mandatory
code review, and statistical validation — see [Level 4: Automated Quality Gates](level-4-quality.md).
