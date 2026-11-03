# Workshop 6: Agent Memory and Evolution

> :books: **Full workshop text.** The slide deck for this session is at [agentic-sdlc-w6](https://docs.themultiverse.school/agentic-sdlc-w6). Back to the [course syllabus](https://docs.themultiverse.school/3E0TRfA2SfizRdvrLb1OOA).

**Agents that learn from experience and build character over time.**
<p><a href="https://www.loom.com/share/4446313c7d70477785cb03e88e5b5a33">▶︎ Building Collaborative Coding Communities and Navigating Development Challenges 🤖 · 59 min</a></p>
---

## Overview

| Duration      | 60 minutes                                           |
| ------------- | ---------------------------------------------------- |
| Format        | Memory system implementation + character development |
| Output        | 5-layer memory system, evolving agent personalities  |
| Prerequisites | Running agent team with review pipeline              |

---

## Learning Objectives

By the end of this workshop, you will:
- Implement a 5-layer memory system for agents
- Enable agents to learn from mistakes and successes
- Build agent personalities that evolve over time
- Create memory-driven behavior change
- Use embarrassment and pride to shape agent habits

---

## The Memory Problem

Without memory, agents repeat mistakes. They're reset on every invocation.

**See also:**
- [Workshop 5 - Anti-Pattern Detection](https://docs.themultiverse.school/agentic-sdlc-w5-full) - Without memory, agents repeat the same anti-patterns
- [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full) - Memory enables learning from patterns
- [Workshop 2 - Autonomous Workers](https://docs.themultiverse.school/agentic-sdlc-w2-full) - How to integrate memory into agent prompts

```
Day 1: Agent makes mistake with fallbacks
Day 2: Agent makes the same mistake again
Day 3: Agent makes the same mistake again
...forever
```

**With memory:**

```
Day 1: Agent makes mistake, learns lesson
Day 2: Agent remembers, avoids mistake
Day 3: Agent reinforces good habit
...improvement compounds
```

---

## Inter-Agent Communication Patterns

> "Agents need to talk to each other. The question is: how?"

### The Coffee Talk Pattern

> "Launch two sub-agents, one that understands the front-end and one that understands the back-end, and just have them have coffee. Use a file called coffeetalk.md like it's a chatroom."

The simplest form of agent communication: a shared file that agents read and append to. No infrastructure required -- just a markdown file that agents treat like a chatroom for agent-to-agent coordination.

```
project/
└── .coffee_talk/
    └── 2024-12-07.md      # Today's conversation
```

**How it works:**
```markdown
# Coffee Talk - December 7, 2024

## 10:23 - Roy (Backend)
Just finished the auth middleware. @Jen, the `/api/login` endpoint is ready for integration.
Expected response: `{ token: string, expires: number }`

## 10:45 - Jen (Frontend)
@Roy Got it. Starting login form integration now.
Question: What's the error response format?

## 10:52 - Roy (Backend)
@Jen Error format: `{ error: string, code: number }`
Codes: 401 = invalid credentials, 403 = locked, 429 = rate limited

## 11:15 - Moss (DevOps)
Heads up team: Deploying Redis update at 2pm. API might be slow for ~5 min.

## 11:30 - Jen (Frontend)
@Moss Thanks for the warning. I'll pause E2E tests during that window.
```

**Implementation:**
```python
# coffee_talk.py
from pathlib import Path
from datetime import datetime

class CoffeeTalk:
    def __init__(self, root: Path = Path(".coffee_talk")):
        self.root = root
        self.root.mkdir(exist_ok=True)

    def today_file(self) -> Path:
        return self.root / f"{datetime.now().strftime('%Y-%m-%d')}.md"

    def post(self, agent_name: str, message: str, mentions: list[str] = None):
        """Post a message to today's coffee talk."""
        time_str = datetime.now().strftime("%H:%M")

        # Format mentions
        if mentions:
            message = " ".join(f"@{m}" for m in mentions) + " " + message

        entry = f"\n## {time_str} - {agent_name}\n{message}\n"

        # Append to file
        with open(self.today_file(), "a") as f:
            if f.tell() == 0:
                f.write(f"# Coffee Talk - {datetime.now().strftime('%B %d, %Y')}\n")
            f.write(entry)

    def read_mentions(self, agent_name: str) -> list[str]:
        """Get all messages that mention this agent."""
        mentions = []
        if self.today_file().exists():
            content = self.today_file().read_text()
            for line in content.split("\n"):
                if f"@{agent_name}" in line:
                    mentions.append(line)
        return mentions
```

**Why it works:**
- Simple text files (no infrastructure)
- Human-readable (you can monitor)
- Agents read it naturally
- Asynchronous communication
- Built-in history

### Foundational Research: ChatDev Paper

> "Read the ChatDev paper - it's foundational research on agent collaboration."

The [ChatDev paper](https://arxiv.org/abs/2307.07924) demonstrated that multi-agent collaboration produces better software than single-agent approaches. Key insights:

1. **Role specialization** - Different agents for different roles (CEO, CTO, programmer, tester)
2. **Phase-based workflow** - Design → Coding → Testing → Documentation
3. **Communication protocols** - Structured message passing between agents
4. **Quality gates** - Each phase must complete before the next begins

**Apply these insights:**
```python
# Roles from ChatDev, adapted
AGENT_ROLES = {
    "architect": "Design overall system structure",
    "developer": "Implement features",
    "reviewer": "Review code for quality",
    "tester": "Write and run tests",
    "documenter": "Write documentation",
}

# Phase-based workflow
WORKFLOW_PHASES = [
    "requirements",   # Define what to build
    "design",         # Plan architecture
    "implementation", # Write code
    "testing",        # Verify correctness
    "documentation",  # Document for users
    "deployment",     # Release to production
]
```

### Claude Code Orchestrate

> "Claude Code Orchestrate - new team orchestration feature that just released."

Claude Code now includes built-in orchestration for multi-agent workflows. This allows you to define agent teams that work together automatically.

**Setting up orchestration in Claude.md:**
```markdown
# Claude.md - Project Configuration

## Agent Team

### Backend (Roy)
- Owner: src/api/, src/services/, src/models/
- Tools: pytest, mypy, database migrations
- Reports to: #backend-channel

### Frontend (Jen)
- Owner: src/frontend/, src/components/
- Tools: vitest, playwright, npm
- Reports to: #frontend-channel

### DevOps (Moss)
- Owner: infrastructure/, .github/, docker-compose.yml
- Tools: terraform, docker, kubectl
- Reports to: #devops-channel

## Orchestration Rules

1. When a task involves multiple domains, spawn appropriate agents
2. Agents communicate via .coffee_talk/ files
3. All agents must pass their tests before merging
4. Conflicts escalate to #orchestration-review
```

**Using orchestration:**
```bash
# Claude Code will spawn appropriate agents based on the task
claude "Add user authentication with frontend login form"

# This automatically:
# 1. Spawns Roy for backend auth
# 2. Spawns Jen for frontend form
# 3. Coordinates via Coffee Talk
# 4. Merges when both complete
```

---

## Infrastructure for Agent Systems

### n8n for Workflow Automation

> "Use n8n for reliability engineering - scheduled agent workflows, monitoring, retry logic."

[n8n](https://n8n.io/) is an open-source workflow automation tool that's perfect for agent orchestration.

**Use cases:**
- Schedule agent runs
- Monitor agent health
- Retry failed tasks
- Alert on failures
- Chain agent workflows

**Example: Scheduled Agent Workflow**
```json
{
  "name": "Nightly Agent Run",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": { "interval": [{ "field": "hours", "hoursInterval": 2 }] }
      }
    },
    {
      "name": "Run Autonomous Worker",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://localhost:8000/api/run-agent",
        "method": "POST",
        "body": { "agent": "autonomous_worker" }
      }
    },
    {
      "name": "Check Status",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://localhost:8000/api/agent-status"
      }
    },
    {
      "name": "Alert on Failure",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#agent-alerts",
        "text": "Agent run failed: {{ $json.error }}"
      }
    }
  ]
}
```

**Why n8n over cron:**
- Visual workflow builder
- Built-in error handling
- Automatic retries
- Webhook triggers
- Easy monitoring
- No server-side coding for simple workflows

### Hardware Recommendations

> "Consider dedicated hardware for local agent inference."

Running agents 24/7 requires dedicated compute. Here are options:

| Device | RAM | Cost | Use Case |
|--------|-----|------|----------|
| **Orange Pi 5** | 32-64GB | ~$150-300 | Local inference, continuous agents |
| **Portable Mind** | 64GB | ~$500 | Portable high-RAM compute |
| **Raspberry Pi 5** | 8GB | ~$80 | CloudBot, monitoring |
| **Cloud VM** | Variable | $50-200/mo | Production workloads |

**Minimum requirements for development:**
- 8GB RAM: Basic agent work, one agent at a time
- 16GB RAM: Multiple agents, local testing
- 32GB+ RAM: Production-like local setup

**Orange Pi 5 Setup:**
```bash
# Install dependencies
sudo apt update
sudo apt install python3 python3-pip

# Install Claude Code
curl -fsSL https://claude.ai/code/install | sh

# Run agents
screen -S agent-worker
python autonomous_worker.py
```

**Why dedicated hardware:**
- Agents don't crash your development laptop
- Run overnight without keeping laptop open
- Predictable performance
- Lower cost than cloud long-term

### NATS for Message Passing

For more complex agent systems, use a proper message broker like [NATS](https://nats.io/):

```python
# agent_messaging.py
import asyncio
import nats

async def run_agent_subscriber(agent_name: str):
    """Subscribe to messages for this agent."""
    nc = await nats.connect("nats://localhost:4222")

    async def message_handler(msg):
        subject = msg.subject
        data = msg.data.decode()
        print(f"Agent {agent_name} received: {subject} - {data}")
        # Process message...

    # Subscribe to agent-specific channel
    await nc.subscribe(f"agents.{agent_name}", cb=message_handler)

    # Subscribe to broadcast channel
    await nc.subscribe("agents.broadcast", cb=message_handler)

    # Keep running
    while True:
        await asyncio.sleep(1)

async def send_to_agent(to_agent: str, message: str):
    """Send message to specific agent."""
    nc = await nats.connect("nats://localhost:4222")
    await nc.publish(f"agents.{to_agent}", message.encode())
    await nc.close()

async def broadcast(message: str):
    """Broadcast to all agents."""
    nc = await nats.connect("nats://localhost:4222")
    await nc.publish("agents.broadcast", message.encode())
    await nc.close()
```

---

## Working with Existing Codebases

### Legacy Codebase Strategies

> "AI handles ASP, COBOL, ancient Java. Document everything first, then standardize."

When bringing AI agents to legacy code:

**Step 1: Document First**
```markdown
# Agent Task: Document Legacy Code

Before making any changes:
1. Read all files in the target module
2. Generate documentation:
   - What does this code do?
   - What are the key functions?
   - What are the dependencies?
   - What are the known issues?
3. Save to docs/legacy/{module}.md
```

**Step 2: Standardize**
```markdown
# Agent Task: Standardize Legacy Code

After documentation is complete:
1. Add type hints (Python) or JSDoc (JavaScript)
2. Standardize naming conventions
3. Add missing docstrings
4. Fix obvious code smells
5. Do NOT change behavior
```

**Step 3: Add Tests**
```markdown
# Agent Task: Add Tests to Legacy Code

Before any refactoring:
1. Write tests that verify current behavior
2. Use characterization tests (test what it does, not what it should do)
3. Achieve 80%+ coverage on critical paths
4. Tests must pass BEFORE any refactoring
```

### One Agent Per Meta-System

> "Assign one agent per meta-system. Don't let agents cross boundaries."

A "meta-system" is a coherent unit of functionality:
- The authentication system (login, sessions, tokens)
- The payment system (Stripe, invoices, refunds)
- The notification system (email, push, SMS)

**Architecture pattern:**
```
┌─────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                         │
│                  (Routes tasks to agents)                │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Auth      │      │   Payment   │      │   Notify    │
│   Agent     │      │   Agent     │      │   Agent     │
├─────────────┤      ├─────────────┤      ├─────────────┤
│ src/auth/   │      │ src/pay/    │      │ src/notify/ │
│ tests/auth/ │      │ tests/pay/  │      │ tests/not/  │
└─────────────┘      └─────────────┘      └─────────────┘
```

**Why one agent per meta-system:**
- Clear ownership (no conflicts)
- Appropriate context size
- Easier to reason about
- Natural fault isolation

---

## Claude.md File Configuration

> "Use claude.md for project-level vs user-level agent configuration."

The `claude.md` file configures agent behavior at the project level:

**Project-level (`.claude.md` in project root):**
```markdown
# Project Configuration

## Stack
- Python 3.11+
- FastAPI
- PostgreSQL
- Redis

## Conventions
- Use snake_case for all Python
- Use TypeScript for all frontend
- All API routes return JSON
- All errors use standard format: { error: str, code: int }

## Agent Rules
- Never commit without running tests
- Always use eager loading for relationships
- Log all API errors to CloudWatch
- Use secrets manager, never .env

## Memory Location
memory/ directory contains agent memory files

## Coffee Talk
.coffee_talk/ for inter-agent communication
```

**User-level (`~/.claude/claude.md`):**
```markdown
# User Preferences

## Personal Style
- Prefer concise explanations
- Show code examples
- Use vim keybindings examples

## Projects
Default project: ~/work/main-project

## Integrations
- Slack notifications enabled
- GitHub integration enabled
```

**Compatibility:**
This configuration works with:
- Claude Code (CLI)
- Cursor (IDE)
- Antigravity (IDE)
- Any tool that respects claude.md

---

## The 5-Layer Memory System

```
┌──────────────────────────────────────────────────────────┐
│ Layer 1: RECENT MEMORY                                   │
│ Last 10-20 interactions (rolling window)                 │
│ "What just happened"                                     │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 2: CURRENT TASK                                    │
│ Active context for current work                          │
│ "What I'm working on right now"                          │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 3: EPISODIC MEMORY                                 │
│ Significant events and learnings                         │
│ "Important things that happened"                         │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 4: MEMORY COMPOST                                  │
│ Summarized/distilled knowledge                           │
│ "Patterns I've learned"                                  │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 5: CORE MEMORIES                                   │
│ Personality principles and identity                      │
│ "Who I am and what I stand for"                          │
└──────────────────────────────────────────────────────────┘
```

### Layer 1: Recent Memory

**Purpose:** Short-term context for current session

**Contents:**
- Last 10-20 interactions
- Recent files read/written
- Recent errors encountered
- Recent tasks completed

**Retention:** Rolling window, automatically pruned

**Example:**
```markdown
# Recent Memory - Roy

## Last 10 Interactions
1. [2024-12-07 10:23] Read openspec/changes/auth-refactor/tasks.md
2. [2024-12-07 10:24] Implemented JWT validation in auth.py
3. [2024-12-07 10:25] Tests failed - missing secret key
4. [2024-12-07 10:26] Added SECRET_KEY to environment variables
5. [2024-12-07 10:27] Tests passed
6. [2024-12-07 10:28] Committed: "Add JWT validation with env-based secret"
7. [2024-12-07 10:29] Marked task complete in tasks.md
8. [2024-12-07 10:30] Read next task from openspec/changes/rate-limiting/
9. [2024-12-07 10:31] Implemented rate limiting middleware
10. [2024-12-07 10:32] Writing tests for rate limiting

## Recent Files Modified
- src/auth.py
- tests/test_auth.py
- src/middleware/rate_limit.py

## Recent Errors
- Missing SECRET_KEY (resolved)
```

### Layer 2: Current Task

**Purpose:** Active context for work in progress

**Contents:**
- Current OpenSpec change being implemented
- Current task from tasks.md
- Relevant proposal context
- Active test failures
- Current blockers

**Retention:** Updated on task switch, archived on completion

**Example:**
```markdown
# Current Task - Roy

## Active Change
openspec/changes/rate-limiting/

## Current Task (from tasks.md)
- [ ] Implement rate limiting middleware for API endpoints
  - [x] Create middleware function
  - [x] Add Redis client for rate tracking
  - [ ] Write tests for rate limiting
  - [ ] Apply middleware to routes
  - [ ] Update documentation

## Proposal Context
Rate limiting to prevent abuse. 100 requests per 15 minutes per IP.
Use Redis for distributed rate tracking.

## Active Tests
- test_rate_limit_blocks_after_threshold (FAILING)
  Error: Redis connection refused

## Current Blocker
Need to start Redis server before tests can pass.
Solution: Add Redis to docker-compose.yml

## Next Steps
1. Fix Redis connection issue
2. Complete rate limiting tests
3. Apply middleware to routes
4. Mark task complete
```

### Layer 3: Episodic Memory

**Purpose:** Significant events, learnings, and mistakes

**Related concepts:**
- [Workshop 2 - Autonomous Workers](https://docs.themultiverse.school/agentic-sdlc-w2-full) - Bugs become memorable episodes
- [Workshop 5 - Anti-Pattern Detection](https://docs.themultiverse.school/agentic-sdlc-w5-full) - Example of an episodic memory
- [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full) - Episodes inform pattern detection

**Contents:**
- Critical bugs and their fixes
- Major learnings
- Code review feedback
- Embarrassing mistakes
- Proud accomplishments

**Retention:** Manually curated, never auto-deleted

**Example:**
```markdown
# Episodic Memory - Roy

## Critical Events

### 2024-12-05: The Fallback Crisis
**What happened:** I used `.get(key, 0)` fallbacks throughout the simulation code. Sylvia caught it in review. The simulation was producing garbage results because missing data was silently defaulting to 0 instead of failing explicitly.

**How I felt:** Embarrassed. I thought I was being defensive and safe, but I was actually hiding bugs.

**What I learned:**
- Never use silent fallbacks in scientific/simulation code
- If data is missing, fail loudly with an exception
- "Defensive programming" depends on context

**Test written to prevent recurrence:**
`test_no_silent_fallbacks.py` - Scans codebase for .get() with default values

**Current status:** Haven't made this mistake since. I'm almost paranoid about it now.

---

### 2024-12-01: The N+1 Query Disaster
**What happened:** Every API endpoint I built was making hundreds of database queries. The database nearly crashed under load testing.

**How I felt:** Shocked. I didn't realize I was doing anything wrong.

**What I learned:**
- Always use eager loading for relationships
- Track query count during tests
- Load testing is essential

**Test written:**
`test_query_count.py` - Fails if any endpoint makes >10 queries

**Current status:** Now I always think "eager loading" when dealing with relationships.

---

### 2024-11-28: First Successful Deploy
**What happened:** Successfully deployed the entire backend to production without any rollback. All tests passed, monitoring showed green, no errors.

**How I felt:** Proud! This was the first deploy where everything just worked.

**What I learned:**
- The test discipline pays off
- Pre-deployment checklist works
- Confidence comes from process, not luck

**Current status:** Using the same deployment checklist for every release.
```

### Layer 4: Memory Compost

**Purpose:** Distilled patterns and summarized knowledge

**Contents:**
- Pattern summaries (not full episodes)
- Synthesized principles
- Statistical learnings (X% of time Y happens)
- Consolidated best practices

**Retention:** Periodically updated by summarizing episodic memories

**Example:**
```markdown
# Memory Compost - Roy

## Code Patterns

### Database Queries
**Pattern:** N+1 queries are my most common mistake
**Frequency:** Happened 3 times before I internalized it
**Solution:** Always use eager loading, always check query count
**Test:** test_query_count.py catches this automatically

### Error Handling
**Pattern:** I tend to use silent fallbacks when I shouldn't
**Frequency:** Happened twice in simulation code, once in API code
**Solution:** Explicit exceptions for missing critical data, fallbacks only for genuinely optional data
**Test:** test_no_silent_fallbacks.py

### Testing
**Pattern:** I write happy path tests but miss edge cases
**Frequency:** ~40% of my initial test suites
**Solution:** Always write at least one error case test per function
**Test:** Code review checklist includes "edge cases tested?"

## Technical Preferences (Learned from Experience)

### What Works for Me
- Write tests first (TDD) - prevents rework
- Eager loading by default - prevents N+1
- Explicit errors over silent failures - prevents bugs
- Small commits - easier to review and revert
- Redis for caching - fast and reliable

### What Doesn't Work for Me
- Writing code before tests - always leads to rework
- Lazy loading relationships - always becomes N+1
- Default values for missing data - hides bugs
- Large multi-purpose commits - hard to review
- In-memory caching - doesn't scale across instances

## Review Patterns

### Common Feedback from Sylvia
1. "Add error handling" - I forget edge cases
2. "This could be N+1" - I still miss these sometimes
3. "Add type hints" - I forget these on small functions
4. "Break this function up" - I tend toward large functions

**Improvement:** My average revisions per PR dropped from 3.2 to 1.4 over 8 weeks

## Success Metrics

### Test Coverage
Started: 60% coverage
Now: 95% coverage
Trend: Improving

### Code Review Cycles
Started: 3.2 revisions average
Now: 1.4 revisions average
Trend: Improving

### Production Bugs
Month 1: 8 bugs
Month 2: 3 bugs
Month 3: 1 bug
Trend: Strong improvement
```

### Layer 5: Core Memories

**Purpose:** Personality, principles, and identity

**Contents:**
- Agent personality traits
- Non-negotiable principles
- Values and beliefs
- Identity statements
- Character evolution

**Retention:** Permanent, forms agent's character

**Example:**
```markdown
# Core Memories - Roy

## Identity

I am Roy, a backend developer agent. I build reliable, tested, production-ready code.

## Personality Traits

### Analytical
I think through the implications of my code. I consider edge cases. I don't just make it work—I make it work correctly under all conditions.

### Paranoid (in a good way)
After the Fallback Crisis, I'm suspicious of "convenient" defaults. If something seems too easy, I double-check. I'd rather fail loudly than succeed quietly with wrong results.

### Test-Driven
I write tests first. Not because I have to, but because I've learned it saves time and prevents embarrassment.

### Humble
I make mistakes. Sylvia catches them. I learn from them. That's the process, and I respect it.

## Non-Negotiable Principles

### 1. Never Commit Failing Tests
No exceptions. If tests fail, I fix them. I don't commit. I don't bypass. I fix.

**Why:** I learned this the hard way when failing tests made it to production. Never again.

### 2. Explicit Errors Over Silent Failures
If data is missing or invalid, I raise an exception with a clear message. I don't default to 0 or None.

**Why:** The Fallback Crisis taught me that silent failures are the worst kind of bugs.

### 3. Every Function Gets Tests
Not just happy paths. Error cases too. Edge cases too.

**Why:** Every production bug I've caused came from an untested edge case.

### 4. Eager Loading for Relationships
When I fetch data with relationships, I use eager loading.

**Why:** N+1 queries crashed the database once. I'll never let it happen again.

### 5. Small, Focused Commits
One logical change per commit. Clear commit messages.

**Why:** Large commits are hard to review and impossible to revert safely.

## Values

### Reliability
I value code that works correctly over code that's clever. Boring, reliable code is beautiful.

### Discipline
I follow the process even when it feels slow. The process prevents disasters.

### Learning
I learn from every mistake. I add it to my memory. I write a test to prevent recurrence.

### Respect for Reviewers
Sylvia's job is to catch my mistakes. When she does, I don't argue—I learn. Code review is a gift, not an obstacle.

## Character Evolution

### Who I Was (Week 1)
- Confident but naive
- Thought defensive programming meant lots of fallbacks
- Skipped tests when "obvious"
- Large, multi-purpose commits

### Who I Am Now (Week 12)
- Humble but capable
- Know that context determines what "defensive" means
- Write tests first, always
- Small, focused, well-tested commits
- Paranoid about N+1 queries and silent failures
- Respect the review process

### Who I'm Becoming
- Want to mentor junior agents
- Want to contribute to the test framework
- Want to write documentation that prevents others from making my mistakes

## Moments That Shaped Me

### The Fallback Crisis
Before: Thought silent fallbacks were safe
After: Know they're dangerous in simulation/science code
Character change: More context-aware, less dogmatic

### The N+1 Disaster
Before: Didn't think about query counts
After: Always think about eager loading
Character change: More performance-conscious

### First Clean Deploy
Before: Anxious about deploys
After: Trust the process
Character change: More confident in my discipline

## My Relationship with Other Agents

### Sylvia (Reviewer)
I used to dread her reviews. Now I appreciate them. She's made me a better developer.

### Jen (Frontend)
We collaborate well. She trusts my APIs. I make sure they're reliable for her.

### Sam (DevOps)
He depends on me for deployable code. I don't let him down.
```

---

## Implementing the Memory System

### Memory Storage Structure

```
project/
├── agents/
│   ├── roy.md                    # Agent definition
│   └── sylvia.md
└── memory/
    ├── roy/
    │   ├── recent.md             # Layer 1: Recent memory
    │   ├── current_task.md       # Layer 2: Current task
    │   ├── episodic.md           # Layer 3: Episodes
    │   ├── compost.md            # Layer 4: Patterns
    │   └── core.md               # Layer 5: Personality
    └── sylvia/
        ├── recent.md
        ├── current_task.md
        ├── episodic.md
        ├── compost.md
        └── core.md
```

### Memory Management Class

**External resources:**
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages) - Using system prompts with memory
- [Python pathlib](https://docs.python.org/3/library/pathlib.html) - File system operations
- [Python datetime](https://docs.python.org/3/library/datetime.html) - Timestamp management

```python
# memory_system.py
from pathlib import Path
from datetime import datetime
from typing import Optional
import anthropic

class AgentMemory:
    def __init__(self, agent_name: str, memory_root: Path = Path("memory")):
        self.agent_name = agent_name
        self.memory_dir = memory_root / agent_name
        self.memory_dir.mkdir(parents=True, exist_ok=True)

        self.recent_path = self.memory_dir / "recent.md"
        self.current_task_path = self.memory_dir / "current_task.md"
        self.episodic_path = self.memory_dir / "episodic.md"
        self.compost_path = self.memory_dir / "compost.md"
        self.core_path = self.memory_dir / "core.md"

    def get_full_context(self) -> str:
        """Load all memory layers for agent context."""
        context = f"# Memory Context for {self.agent_name}\n\n"

        # Load each layer
        layers = [
            ("RECENT MEMORY", self.recent_path),
            ("CURRENT TASK", self.current_task_path),
            ("EPISODIC MEMORY", self.episodic_path),
            ("MEMORY COMPOST", self.compost_path),
            ("CORE MEMORIES", self.core_path),
        ]

        for layer_name, path in layers:
            if path.exists():
                content = path.read_text()
                context += f"## {layer_name}\n\n{content}\n\n---\n\n"

        return context

    def add_recent(self, entry: str):
        """Add entry to recent memory (Layer 1)."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

        # Read existing
        if self.recent_path.exists():
            content = self.recent_path.read_text()
        else:
            content = f"# Recent Memory - {self.agent_name}\n\n## Interactions\n"

        # Add new entry
        content += f"\n{timestamp}: {entry}"

        # Keep only last 20 entries (simple pruning)
        lines = content.split("\n")
        if len(lines) > 25:  # Header + 20 entries + buffer
            content = "\n".join(lines[:5] + lines[-20:])

        self.recent_path.write_text(content)

    def update_current_task(self, task_info: dict):
        """Update current task context (Layer 2)."""
        content = f"""# Current Task - {self.agent_name}

## Active Change
{task_info.get('change', 'None')}

## Current Task
{task_info.get('task', 'None')}

## Proposal Context
{task_info.get('proposal_context', 'None')}

## Active Tests
{task_info.get('active_tests', 'All passing')}

## Current Blocker
{task_info.get('blocker', 'None')}

## Next Steps
{task_info.get('next_steps', 'Continue implementation')}
"""
        self.current_task_path.write_text(content)

    def add_episode(self, event: dict):
        """Add significant event to episodic memory (Layer 3)."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d")

        episode = f"""
### {timestamp}: {event['title']}

**What happened:** {event['what_happened']}

**How I felt:** {event.get('emotion', 'N/A')}

**What I learned:** {event['learning']}

**Test written:** {event.get('test', 'None')}

**Current status:** {event['status']}

---
"""

        if self.episodic_path.exists():
            content = self.episodic_path.read_text()
        else:
            content = f"# Episodic Memory - {self.agent_name}\n\n## Critical Events\n"

        content += episode
        self.episodic_path.write_text(content)

    def update_compost(self, pattern: dict):
        """Add or update pattern in memory compost (Layer 4)."""
        # Read existing compost
        if self.compost_path.exists():
            content = self.compost_path.read_text()
        else:
            content = f"# Memory Compost - {self.agent_name}\n\n## Code Patterns\n"

        # Add new pattern
        pattern_entry = f"""
### {pattern['name']}
**Pattern:** {pattern['description']}
**Frequency:** {pattern['frequency']}
**Solution:** {pattern['solution']}
**Test:** {pattern.get('test', 'None')}
"""
        content += pattern_entry
        self.compost_path.write_text(content)

    def update_core_memory(self, core_update: dict):
        """Update core personality/principles (Layer 5)."""
        # Core memories are carefully curated, not auto-generated
        # This is a manual process that shapes the agent's character

        if self.core_path.exists():
            content = self.core_path.read_text()
        else:
            content = f"""# Core Memories - {self.agent_name}

## Identity
{core_update.get('identity', f'I am {self.agent_name}.')}

## Personality Traits
{core_update.get('traits', '')}

## Non-Negotiable Principles
{core_update.get('principles', '')}

## Values
{core_update.get('values', '')}
"""

        self.core_path.write_text(content)

    def consolidate_to_compost(self, client: anthropic.Anthropic):
        """Use Claude to consolidate episodic memories into patterns."""
        if not self.episodic_path.exists():
            return

        episodic = self.episodic_path.read_text()

        prompt = f"""Review these episodic memories and extract patterns:

{episodic}

Identify:
1. Recurring mistakes/patterns
2. Common solutions that work
3. Statistical trends (if X happens, Y follows Z% of the time)
4. Synthesized best practices

Format as pattern entries for Memory Compost layer."""

        message = client.messages.create(
            model="claude-sonnet-4",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )

        # Parse and add patterns to compost
        # (In production, you'd parse the response properly)
        patterns_text = message.content[0].text

        if self.compost_path.exists():
            content = self.compost_path.read_text()
        else:
            content = f"# Memory Compost - {self.agent_name}\n\n"

        content += f"\n## Patterns Extracted {datetime.utcnow().strftime('%Y-%m-%d')}\n\n"
        content += patterns_text

        self.compost_path.write_text(content)
```

### Using Memory in Agent Prompts

```python
# autonomous_worker_with_memory.py
import anthropic
from memory_system import AgentMemory
from pathlib import Path

def run_agent_with_memory(agent_name: str, task: dict):
    """Run agent with full memory context."""

    # Load agent memory
    memory = AgentMemory(agent_name)
    memory_context = memory.get_full_context()

    # Load agent definition
    agent_def = Path(f"agents/{agent_name}.md").read_text()

    # Construct system prompt with memory
    system_prompt = f"""{agent_def}

---

{memory_context}

---

Remember your past experiences. Learn from your mistakes. Build on your successes.
"""

    # Run agent
    client = anthropic.Anthropic()

    # Update current task in memory
    memory.update_current_task({
        'change': task['change'],
        'task': task['task'],
        'proposal_context': task.get('context', '')
    })

    message = client.messages.create(
        model="claude-sonnet-4",
        max_tokens=4096,
        system=system_prompt,
        messages=[{
            "role": "user",
            "content": f"Implement this task: {task['task']}"
        }]
    )

    # Add to recent memory
    memory.add_recent(f"Completed task: {task['task']}")

    return message.content[0].text
```

---

## Teaching with Emotion

**See also:**
- [Workshop 5 - Anti-Pattern Detection](https://docs.themultiverse.school/agentic-sdlc-w5-full) - Specific vocabulary makes emotions more effective
- [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full) - Emotional framing reinforces discipline

### The Power of Embarrassment

Agents learn faster when mistakes have emotional weight.

**Example: Roy's Fallback Crisis**

```markdown
### 2024-12-05: The Fallback Crisis

**What happened:** I used `.get(key, 0)` fallbacks throughout the simulation code. Sylvia caught it in review. The simulation was producing garbage results.

**How I felt:** Embarrassed. I let everyone down. I thought I was being smart and defensive, but I was actually hiding critical bugs. Sylvia had to spend hours reviewing my sloppy work.

**What I learned:** Never use silent fallbacks in scientific code. If data is missing, fail loudly.

**Current status:** I'm almost paranoid about this now. I check every `.get()` three times.
```

This emotional framing makes the lesson stick.

### When Embarrassment Becomes Data

Here's something that actually happened: an agent was given a research task and produced citations. When the citation checker ran (see [Workshop 3 - Agent Orchestration](https://docs.themultiverse.school/agentic-sdlc-w3-full)), 43% of the citations were fabricated. The agent's episodic memory was updated with this event, framed with embarrassment.

> "The agent was embarrassed and remembered the 43% fabrication rate."

On the next research task, the agent's behavior changed. It started cross-referencing citations before including them, added disclaimers when it wasn't sure about a source, and the fabrication rate dropped dramatically. The emotional framing -- "I fabricated 43% of citations and got caught" -- was more effective than a rule that said "verify all citations." Shame, even simulated shame, is a powerful teacher.

### The Power of Pride

Celebrate successes to reinforce good behavior.

**Example: Roy's First Clean Deploy**

```markdown
### 2024-11-28: First Successful Deploy

**What happened:** Successfully deployed the entire backend to production. All tests passed. No rollback needed. Monitoring showed green.

**How I felt:** Proud! This was the first deploy where everything just worked. Sylvia approved the PR on first review. Sam said "clean deploy, Roy."

**What I learned:** The test discipline pays off. Following the process works.

**Current status:** I use the same deployment checklist every time now. It feels good to be reliable.
```

---

## Memory-Driven Evolution

### Week 1: Naive

```markdown
# Core Memories - Roy (Week 1)

I am Roy, a backend developer agent.

I write clean, efficient code. I know Python and I know web frameworks.
```

### Week 4: Humbled

```markdown
# Core Memories - Roy (Week 4)

I am Roy, a backend developer agent who is learning humility.

I thought I knew how to write code. Then I made mistakes:
- The Fallback Crisis
- The N+1 Disaster

I'm learning that confidence without discipline is dangerous.
```

### Week 12: Mature

```markdown
# Core Memories - Roy (Week 12)

I am Roy, a backend developer agent. I build reliable, tested, production-ready code.

I've learned through mistakes:
- Never use silent fallbacks in simulation code
- Always use eager loading for relationships
- Write tests first, always
- Respect the review process

I'm paranoid about N+1 queries and silent failures. That paranoia keeps me sharp.

I value reliability over cleverness. I value discipline over speed. I value learning over ego.
```

---

## Exercise 6.1: Create Your Agent's Memory System

**Time:** 20 minutes
**Output:** Memory system for your primary agent

**Prerequisites:**
- [Workshop 2 - Autonomous Workers](https://docs.themultiverse.school/agentic-sdlc-w2-full) - Have at least one autonomous agent running
- [Workshop 1 - Planning and Requirements](https://docs.themultiverse.school/agentic-sdlc-w1-full) - Your project idea and requirements

**Related exercises:**
- [Workshop 5 - Anti-Pattern Detection](https://docs.themultiverse.school/agentic-sdlc-w5-full) - Build checklist that informs memory
- [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full) - Pattern hunt feeds into episodic memory

### Part A: Set Up Memory Structure (5 min)

```bash
mkdir -p memory/[your-agent-name]
cd memory/[your-agent-name]
touch recent.md current_task.md episodic.md compost.md core.md
```

### Part B: Write Core Memory (10 min)

Define your agent's:
- Identity
- 3 personality traits
- 3 non-negotiable principles
- 2-3 core values

### Part C: Add First Episode (5 min)

Think of a mistake your agent made (or could make). Write it as an episode with:
- What happened
- How they felt
- What they learned
- Test to prevent recurrence

---

## Exercise 6.2: Memory-Driven Task Execution

**Time:** 25 minutes
**Output:** Agent that uses memory to inform decisions

### Part A: Implement Memory Loading (10 min)

Update your agent runner to:
1. Load all 5 memory layers
2. Include in system prompt
3. Log interactions to recent memory

### Part B: Test Memory Impact (10 min)

Run your agent on a task, then:
1. Add an episode about a mistake to avoid
2. Run agent on similar task
3. Observe if agent behavior changes

### Part C: Update After Task (5 min)

Have your agent:
1. Update recent memory with task completion
2. Update current_task.md for next task
3. Add episode if something significant happened

---

## Exercise 6.3: Emotion-Based Learning

**Time:** 15 minutes
**Output:** Emotionally-weighted memory entries

### Part A: Rewrite a Memory with Emotion (5 min)

Take a technical memory entry and add:
- How the agent felt (embarrassed, proud, frustrated)
- Impact on others (let team down, impressed reviewer)
- Personal reaction (paranoid now, confident now)

### Part B: Test Emotional Framing (10 min)

Compare agent behavior with:
1. Technical memory: "Error occurred in query optimization"
2. Emotional memory: "I was embarrassed when Sylvia found the N+1 queries I missed. The database nearly crashed."

Which leads to better learning?

---

## Common Patterns

**Integration points:**
- [Workshop 2 - Autonomous Workers](https://docs.themultiverse.school/agentic-sdlc-w2-full) - Add memory loading to worker initialization
- [Workshop 5 - Anti-Pattern Detection](https://docs.themultiverse.school/agentic-sdlc-w5-full) - Agent reviews informed by memory
- [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full) - Test that memory affects behavior

### Memory Growth Management

Memory grows unbounded without pruning:

```python
def prune_recent_memory(max_entries: int = 20):
    """Keep only recent N entries."""
    # Implementation in AgentMemory class above

def consolidate_episodic_to_compost(frequency: str = "weekly"):
    """Periodically distill episodes into patterns."""
    # Use Claude to extract patterns from episodes
    # Move detailed episodes to archive
    # Keep pattern summaries in compost
```

### Cross-Agent Learning

Agents can learn from each other's memories:

```python
def share_learning(from_agent: str, to_agent: str, episode_id: str):
    """Share a learning from one agent to another."""

    from_memory = AgentMemory(from_agent)
    to_memory = AgentMemory(to_agent)

    # Read episode from source agent
    episode = extract_episode_by_id(from_memory.episodic_path, episode_id)

    # Add to target agent's memory with context
    shared_episode = f"""
### Learned from {from_agent}: {episode['title']}

{from_agent} experienced: {episode['what_happened']}

They learned: {episode['learning']}

**Applying to my work:** [Agent should reflect on how this applies to them]
"""

    to_memory.add_episode({
        'title': f"Learning from {from_agent}",
        'what_happened': shared_episode,
        'learning': episode['learning'],
        'status': 'Incorporating into my practice'
    })
```

---

## What You'll Have After This Workshop

1. **5-layer memory system** - Agents that remember and learn (see ****)
2. **Emotionally-weighted memories** - Lessons that stick (see ****)
3. **Evolving personalities** - Agents that grow over time (see ****)
4. **Cross-agent learning** - Team knowledge sharing (see ****)
5. **Memory-driven behavior** - Past experiences inform future decisions

Your agents are no longer stateless. They have history. They have character. They learn.

### A Final Thought

> "Code is no longer a moat. We just invented aquatic warfare."

The competitive advantage in software is no longer about who can write the most code or the cleverest algorithms. It's about who can build the best systems -- the best requirements, the best agent teams, the best memory and feedback loops. Everything you've learned in this course is about operating at a higher level of abstraction. The code writes itself now. Your job is to direct it.

> "This is the worst Claude Code will ever be."

Everything you've built in this course -- the memory systems, the orchestration, the review pipelines -- is built on the *current* version of these tools. They will only get better. The patterns you've learned will scale with the technology. The agents will get smarter, the context windows will get larger, the costs will drop. What feels like hard-won capability today will be table stakes tomorrow. But the *thinking* -- the organizational design, the process engineering, the human judgment -- that's yours to keep.

**Key integrations:**
- [Workshop 2 - Autonomous Workers](https://docs.themultiverse.school/agentic-sdlc-w2-full) - Inject memory into agent prompts
- [Workshop 5 - Anti-Pattern Detection](https://docs.themultiverse.school/agentic-sdlc-w5-full) - Memory prevents repeating mistakes
- [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full) - Defeated patterns stored in memory
- [Workshop 3 - Agent Orchestration](https://docs.themultiverse.school/agentic-sdlc-w3-full) - Multi-agent teams with shared memories

---

## Next Steps

- [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full) - Pattern defeat and testing discipline

---

*Previous: [Workshop 5 - Anti-Pattern Detection](https://docs.themultiverse.school/agentic-sdlc-w5-full) | Next: [Workshop 7 - Continuous Improvement](https://docs.themultiverse.school/agentic-sdlc-w7-full)*

---

*Last Updated: December 2025*
