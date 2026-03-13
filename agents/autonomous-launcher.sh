#!/usr/bin/env bash
#
# Autonomous Agent Launcher
#
# Spawns a Claude Code instance in headless mode to:
# 1. Check the roadmap for the next unblocked workstream
# 2. Claim it and mark as in progress
# 3. Execute the micro cycle (implement → test → commit)
# 4. Update the roadmap and dev log
# 5. Auto-commit if working tree is dirty
#
# Usage:
#   bash ~/agentic-sdlc/agents/autonomous-launcher.sh [options]
#
# Options:
#   --agent <name>       Agent to use (default: auto-detect from queue)
#   --task <id>          Specific task ID (skip roadmap scan)
#   --dry-run            Print the prompt without executing
#   --project <path>     Project directory (default: current dir)
#
# Examples:
#   bash ~/agentic-sdlc/agents/autonomous-launcher.sh --agent roy
#   bash ~/agentic-sdlc/agents/autonomous-launcher.sh --task T-042
#   bash ~/agentic-sdlc/agents/autonomous-launcher.sh --dry-run

set -euo pipefail

SDLC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT=""
TASK_ID=""
DRY_RUN=false
PROJECT_DIR="$(pwd)"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="$2"; shift 2 ;;
    --task) TASK_ID="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --project) PROJECT_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Verify Claude Code is available
if ! command -v claude &>/dev/null; then
  echo "Error: claude CLI not found. Install Claude Code first."
  exit 1
fi

# Verify project has SDLC setup
if [[ ! -f "$PROJECT_DIR/agents/project.json" ]]; then
  echo "Error: No agents/project.json in $PROJECT_DIR. Run setup.mjs first."
  exit 1
fi

# Build the autonomous prompt
PROMPT="You are an autonomous agent. Follow these instructions exactly:

1. Read CLAUDE.md for project context.
2. Check task queue: node $SDLC_DIR/agents/queue-drainer.mjs status"

if [[ -n "$TASK_ID" ]]; then
  PROMPT="$PROMPT
3. Claim task $TASK_ID: node $SDLC_DIR/agents/queue-drainer.mjs claim $TASK_ID ${AGENT:-auto}"
elif [[ -n "$AGENT" ]]; then
  PROMPT="$PROMPT
3. Find and claim the next unblocked task for agent '$AGENT': node $SDLC_DIR/agents/queue-drainer.mjs run"
else
  PROMPT="$PROMPT
3. Find and claim the next unblocked task: node $SDLC_DIR/agents/queue-drainer.mjs run"
fi

if [[ -n "$AGENT" ]]; then
  PROMPT="$PROMPT
4. Read the agent system prompt: agents/$AGENT/AGENT.md
5. Read agent memory: agents/$AGENT/memory/core.json, agents/$AGENT/memory/recent.json"
fi

PROMPT="$PROMPT
6. Execute the micro cycle:
   a. Read the task specification
   b. Implement the changes
   c. Write tests (TDD — tests first when possible)
   d. Run the project test suite
   e. If tests fail, fix and re-run (max 3 attempts)
   f. If tests pass, commit with a descriptive message
7. Mark the task complete: node $SDLC_DIR/agents/queue-drainer.mjs complete <task-id> passing
8. Update agent memory with what was done
9. Append a dev log entry to plans/devlog.md:
   - Date, agent name, task ID
   - What was implemented
   - Tests added/modified
   - Any issues encountered
10. Check if there's another unblocked task. If yes, repeat from step 3.
11. When done (no more tasks), check if working tree is dirty.
    If dirty, stage and commit with a descriptive message.
12. Run: node $SDLC_DIR/agents/cost-tracker.mjs record <agent> <task-id> 0 0

IMPORTANT:
- Do NOT ask for human input. Make decisions autonomously.
- Do NOT skip tests. Every change must be tested.
- Do NOT commit failing tests.
- If blocked, mark the task as blocked with a reason and move to the next one.
- Keep commits atomic — one logical change per commit."

if $DRY_RUN; then
  echo "=== DRY RUN — Prompt that would be sent ==="
  echo "$PROMPT"
  echo "=== END ==="
  exit 0
fi

echo "🤖 Launching autonomous agent..."
echo "   Project: $PROJECT_DIR"
[[ -n "$AGENT" ]] && echo "   Agent: $AGENT"
[[ -n "$TASK_ID" ]] && echo "   Task: $TASK_ID"
echo "   Time: $(date)"
echo ""

# Launch Claude Code headlessly
cd "$PROJECT_DIR"
claude -p "$PROMPT" --dangerously-skip-permissions 2>&1 | tee -a "plans/devlog-$(date +%Y-%m-%d).log"

EXIT_CODE=$?

# Post-run: auto-commit if dirty
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo ""
  echo "⚠️  Working tree is dirty after agent run. Auto-committing..."
  claude -p "Check git status. Stage all changed files (except .env and secrets). Commit with a descriptive message summarizing the changes." --dangerously-skip-permissions 2>&1
fi

echo ""
echo "✅ Autonomous agent session complete at $(date)"
exit $EXIT_CODE
