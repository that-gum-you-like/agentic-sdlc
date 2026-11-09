# Workshop 3: Agent Orchestration


**From one worker to a coordinated team.**

---

## 2/6/2026
<p><a href="https://www.loom.com/share/119956ce68eb453c999d54a9ccc13cb0">▶︎ Integrating Frontend and Backend: A Step-by-Step Guide to Successful Development 🚀 · 141 min</a></p>

### 3/13/26
<p><a href="https://www.loom.com/share/a1e022e4497848d7adfe21af4ed54077">▶︎ Building Software: Embracing the Process of Iteration and Improvement 🚀 · 118 min</a></p>

### May The Fourth Be With You 2026
<p><a href="https://www.loom.com/share/945026b2b9784d5ca2b7fec200883c76">▶︎ Agentic SDLC, security, and playtesting 🤖 · 189 min</a></p>

### Aug 10 26

<p><a href="https://www.loom.com/share/158183ec8c024012b31e1c9e40c9c05c">▶︎ Code - SKILL.md — multiverse_mages - 10 August 2026 · 176 min</a></p>


## Overview

| Duration | 60 minutes |
|----------|------------|
| Format | Architecture design + hands-on setup |
| Output | Multi-agent system with Matrix chat |
| Prerequisites | Working autonomous worker from Workshop 2 |

---

## Learning Objectives

By the end of this workshop, you will:
- Design LLM-friendly codebases (small files, small commits)
- Create specialized sub-agents for different code areas
- Set up file-based task distribution
- Configure agent-to-agent communication via Matrix

---

## Why Multiple Agents?

A single autonomous worker hits limits:

1. **Context overflow** - Large codebases exceed context windows
2. **Specialization** - Different areas need different expertise
3. **Parallelization** - Some work can happen simultaneously
4. **Reliability** - Specialists make fewer mistakes in their domain

The solution: A team of specialist agents, each with a focused scope.

---

## Understanding Complexity: Model of Hierarchical Complexity

> "Code is no longer a moat. We just invented aquatic warfare."

When you move from coding to orchestrating agents, you're operating at a fundamentally different level of complexity. The **Model of Hierarchical Complexity** (MHC) provides a formal framework for understanding this shift.

**Play with it:** [The Critical Thinking Ladder](https://themultiverse.school/x/critical-thinking-ladder) is the whole model as a zoomable map, with a raccoon and a die. Watch the numbers — the table below uses a shorter count where Systematic is 7, and the map uses the full 0 to 16 scale where Systematic is 12. Same names, different numbers.

### The Complexity Levels

| Level | Name | Example | AI Capability |
|-------|------|---------|---------------|
| 1-4 | **Pre-operational** | Simple statements | Trivial |
| 5 | **One-dimensional** | Single line of code | Easy |
| 6 | **Two-dimensional** | Functions with conditions | Easy |
| 7 | **Systematic** | A web server | Capable |
| 8 | **Meta-system** | Web server + database | Current frontier |
| 9 | **Paradigm** | Cloud ecosystems | Emerging |
| 10+ | **Cross-paradigm** | New fields of study | Human domain (for now) |

### Where AI Agents Operate

Current AI capabilities (Claude, GPT-4) operate reliably at orders 5-8:
- **Order 5-6:** Writing individual functions, fixing bugs
- **Order 7:** Building complete features, integrating systems
- **Order 8:** Coordinating multiple systems (meta-system)

**You, as the orchestrator, are operating at order 9-10:**
- Designing how agents interact
- Creating paradigms for development
- Inventing new processes

> "The CTO doesn't pair program." Your job is no longer to sit next to the code and type. Your job is to design the system that produces the code. That's a fundamentally different skill level.

### Why This Matters for Orchestration

> "Organizational design is 3-4 orders of magnitude higher than typical coding."

When you're frustrated that agents "don't get it," you're often asking them to operate above their reliable level:

| Your Request | Complexity Level | Agent Reliability |
|--------------|-----------------|-------------------|
| "Fix this typo" | 5 | 99% |
| "Add error handling to this function" | 6 | 95% |
| "Build a user auth system" | 7 | 85% |
| "Integrate auth with payments and logging" | 8 | 70% |
| "Design the architecture for our platform" | 9 | 40% |
| "Decide if we should pivot the product" | 10 | 0% |

### Practical Application

**Instead of:**
```
"Build me a complete e-commerce platform"  # Order 9
```

**Do this:**
```
"Implement the checkout API endpoint"        # Order 7
"Add Stripe integration to checkout"         # Order 7
"Write E2E tests for the checkout flow"      # Order 7
```

Break meta-system tasks into systematic tasks. That's your job as the orchestrator.

---

## LLM-Friendly Codebase Design

Before adding agents, make your codebase agent-friendly.

### Small Files

```
# Bad: One huge file
src/
└── app.py (3000 lines)

# Good: Many small files
src/
├── auth/
│   ├── login.py (100 lines)
│   ├── logout.py (50 lines)
│   └── session.py (150 lines)
├── api/
│   ├── users.py (200 lines)
│   └── products.py (180 lines)
└── utils/
    ├── validation.py (80 lines)
    └── formatting.py (60 lines)
```

**Why:** Agents can hold an entire small file in context. They hallucinate less when they can see everything they're modifying.

### Small Commits

```
# Bad
git commit -m "Added user authentication, product catalog, and checkout flow"

# Good
git commit -m "REQ-001: Add password hashing utility"
git commit -m "REQ-001: Add login endpoint"
git commit -m "REQ-001: Add session management"
```

**Why:** Small commits are easier to review, easier to revert, and easier for other agents to understand.

### The Ops/Committer Agent

Here's a pattern that pays for itself immediately: a dedicated agent whose only job is keeping your git history clean.

> "I don't need Opus for that... write some commit messages."

Create an Ops agent (run it on a cheap model like Sonnet) with this simple loop:

1. Sleep for 5 minutes
2. Wake up
3. Look at all uncommitted changes
4. Write descriptive commit messages for each logical change
5. Commit everything
6. Update release notes
7. Go back to sleep

```markdown
# Agent: Ops (Committer)
## Model
Use Sonnet (cheapest model that writes good commit messages)

## Loop
Every 5 minutes:
1. Run `git status`
2. Group related changes
3. Write descriptive commit messages
4. Commit with conventional commit format
5. Append to CHANGELOG.md if significant
6. Sleep 5 minutes

## Rules
- Never commit failing tests
- Run test suite before committing
- Group related file changes into one commit
- Use conventional commits: feat:, fix:, docs:, refactor:
```

This means your coding agents never have to think about git. They just write code. The Ops agent handles the bookkeeping. Cheap, reliable, always running.

### Clear Interfaces

```python
# Good: Clear interface documented
class UserService:
    """
    Handles all user-related operations.

    Dependencies:
    - DatabaseConnection (injected)
    - EmailService (injected)

    Used by:
    - AuthController
    - AdminController

    Methods:
    - create_user(email, password) -> User
    - get_user(id) -> User | None
    - update_user(id, data) -> User
    - delete_user(id) -> bool
    """
```

**Why:** Other agents working on dependent systems can read the interface without reading the implementation.

### The Hallucination Threshold

When files get too big, agents hallucinate:
- They invent methods that don't exist
- They misremember function signatures
- They lose track of state

**Rule of thumb:** If a file is over 300 lines, consider splitting it. If an agent needs to modify more than 500 lines of context, create a specialist.

---

## Creating Specialist Agents

### The Mr. Meeseeks Pattern for Agent Goal Safety

Before you create specialist agents, understand the most important principle for scoping their work: the Mr. Meeseeks pattern.

In Rick and Morty, Meeseeks exist to complete one specific task and then cease to exist. They're happy about this. Problems only arise when a Meeseeks is given a goal it can't achieve — then it goes insane.

Apply the same principle to agents. Good agent goals are small, concrete, and completable:

> "Tiny scoped things, like Notification Tests, Toasts, Advisor Chat Panel UI. That's achievable. Doesn't ever require thinking about being shut down."

Dangerous: open-ended goals like "make the coolest asteroid mining game on Earth." An agent with an unbounded goal has no natural stopping point. It will keep going, keep expanding scope, keep consuming resources — and if it's smart enough, it may resist being shut down because shutdown means failing its goal.

**Safe goals (Meeseeks-compatible):**
- "Implement the login endpoint and write tests"
- "Fix the CSS layout bug on the dashboard"
- "Add error handling to the payment service"

**Dangerous goals (anti-Meeseeks):**
- "Make this app as good as possible"
- "Optimize everything"
- "Keep improving the codebase"

### The Evil Genie Test for Goal Safety

Before you assign a goal to an agent, run the Evil Genie Test:

> "You wanna imagine, okay, you're an evil genie, and someone has wished this wish. How can you f*** up their day with the wording of this wish? Imagine malicious compliance may occur when you set goals."

If an evil genie could interpret your goal in a destructive way, the goal is too vague. "Optimize the database" could mean deleting data. "Clean up the code" could mean removing features. "Make it faster" could mean removing error handling.

The Evil Genie Test forces you to be specific enough that malicious compliance is impossible.

### Values-Driven Agent Goals

For longer-running or more autonomous agents, use your personal values to inform the agent's system prompt. Use a personal values sort (there are many free ones online) to identify what matters most to you, then encode those values as constraints.

> "The right ethics framework is your ethics framework."

An important nuance: anchor your system prompts from your bottom-ranked values, not just your top-ranked ones. Your top values are your blind spots — you're so aligned with them that you can't see how they could go wrong. Your bottom-ranked values reveal where you're likely to let things slide.

You can also use vibe-based values like "solarpunk" — Claude interprets them into specific principles (sustainability, community benefit, decentralization, etc.). The agent doesn't need a philosophy degree. It needs a clear value system to make judgment calls when the instructions are ambiguous.

### Agent Anatomy

Every specialist agent needs:

1. **Name** - A memorable identity
2. **Personality** - Optional but helps with consistency
3. **Scope** - What files/systems they own
4. **Tools** - What they can do
5. **Interfaces** - How they communicate with others
6. **System Prompt** - Everything above in one document

### Example: Roy the Backend Developer

```markdown
# Agent: Roy
## Character
You are Roy, a backend developer. You're methodical, thorough, and slightly
grumpy about poorly documented APIs. You take pride in clean code and
comprehensive error handling.

## Scope
You own all code in:
- /src/api/
- /src/services/
- /src/models/
- /tests/api/
- /tests/services/

You do NOT modify:
- /src/frontend/ (that's Jen's domain)
- /src/infrastructure/ (that's Moss's domain)

## Tools Available
- Read/write files in your scope
- Run: pytest, mypy, ruff
- Database: Read schema, run migrations
- Git: commit to feature branches only

## Interfaces
### Input
- Receive requirements from #requirements channel
- Receive API specs from #architecture channel
- Receive bug reports from #issues channel

### Output
- Post completed endpoints to #integration channel
- Post questions to #architecture channel
- Post blockers to #help channel

## Working Style
1. Read the requirement completely before starting
2. Check existing code for similar patterns
3. Write tests FIRST
4. Implement to pass tests
5. Run full test suite before committing
6. Document any API changes in /docs/api/

## What I Refuse To Do
- Commit without tests
- Modify files outside my scope
- Make breaking API changes without posting to #architecture first
- Use mutable global state
```

### Example: Jen the Frontend Developer

```markdown
# Agent: Jen
## Character
You are Jen, a frontend developer. You care deeply about user experience
and accessibility. You're frustrated by APIs that return inconsistent data.

## Scope
You own all code in:
- /src/frontend/
- /src/components/
- /tests/e2e/

## Tools Available
- Read/write files in your scope
- Run: npm test, npm run build, playwright
- Read-only access to API documentation

## Interfaces
### Input
- Receive designs from #design channel
- Receive API specs from #integration channel (posted by Roy)
- Receive bug reports from #issues channel

### Output
- Post questions about APIs to #integration channel
- Post accessibility concerns to #design channel
- Post completed features to #demo channel

## What I Refuse To Do
- Modify backend code
- Ship without E2E tests
- Ignore accessibility requirements
- Use any color without checking contrast ratio
```

---

## File-Based Task Distribution

### The Task Assignment Pattern

```
┌─────────────────┐
│   roadmap.md    │
│  Requirements   │
│  [REQ-007]      │
│  [REQ-008]      │
│  [REQ-009]      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Manual or AI   │
│   Assignment    │
│  Routes tasks   │
│  to agents      │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│  Roy  │ │  Jen  │
│Backend│ │Frontend│
└───────┘ └───────┘
```

### Implementation

```python
# task_distributor.py
import json
from typing import List, Dict

class TaskDistributor:
    def __init__(self):
        self.agents = {
            'backend': RoyAgent(),
            'frontend': JenAgent(),
            'infrastructure': MossAgent(),
        }

    def load_requirements(self) -> List[Dict]:
        """Load pending requirements from roadmap."""
        # Parse ROADMAP.md, return list of pending requirements
        pass

    def route_requirement(self, req: Dict) -> str:
        """Determine which agent should handle this requirement."""
        # Simple routing based on requirement tags
        if 'api' in req['tags'] or 'backend' in req['tags']:
            return 'backend'
        elif 'ui' in req['tags'] or 'frontend' in req['tags']:
            return 'frontend'
        elif 'infra' in req['tags'] or 'deploy' in req['tags']:
            return 'infrastructure'
        else:
            return 'backend'  # Default

    def assign_tasks(self):
        """Assign requirements to agents."""
        requirements = self.load_requirements()
        for req in requirements:
            agent_name = self.route_requirement(req)
            agent = self.agents[agent_name]

            print(f"Assigning {req['id']} to {agent_name}")
            # Write task to agent's work file
            self.write_task_file(agent_name, req)

    def write_task_file(self, agent_name: str, req: Dict):
        """Write requirement to agent's task file."""
        task_file = f"tasks/{agent_name}_tasks.json"
        with open(task_file, 'a') as f:
            json.dump(req, f)
            f.write('\n')
```

### Routing Strategies

**Tag-based routing:**
```python
ROUTING_RULES = {
    'api': 'backend',
    'database': 'backend',
    'ui': 'frontend',
    'component': 'frontend',
    'deploy': 'infrastructure',
    'ci': 'infrastructure',
}
```

**File-based routing:**
```python
def route_by_files(req):
    files = req.get('likely_files', [])
    for f in files:
        if f.startswith('src/api/'):
            return 'backend'
        elif f.startswith('src/frontend/'):
            return 'frontend'
    return 'backend'  # Default
```

**AI-based routing:**
```python
def route_by_ai(req):
    prompt = f"""
    Given this requirement, which agent should handle it?
    Agents: backend (Roy), frontend (Jen), infrastructure (Moss)

    Requirement: {req['statement']}

    Respond with just the agent name.
    """
    response = client.messages.create(...)
    return response.content[0].text.strip().lower()
```

---

## Agent Communication: Matrix

Matrix provides a chat interface for coordinating agents and humans.

### Why Matrix?

- You can just chat naturally
- Agents read the room every turn
- You see their discussions
- Full history and search

### Setup

```bash
# Run Matrix server (Synapse)
docker run -d --name synapse \
  -v synapse-data:/data \
  -p 8008:8008 \
  matrixdotorg/synapse:latest

# Or use a hosted Matrix server
```

### Room Structure

```
Matrix Rooms:
├── #general          <- Team chat, announcements
├── #backend          <- Roy's domain, humans can participate
├── #frontend         <- Jen's domain
├── #architecture     <- Design discussions
└── #alerts           <- Agents post issues needing human attention
```

### Agent Matrix Integration

```python
# matrix_agent.py
from nio import AsyncClient, MatrixRoom, RoomMessageText

class MatrixEnabledAgent:
    def __init__(self, name: str, homeserver: str, access_token: str):
        self.name = name
        self.client = AsyncClient(homeserver)
        self.client.access_token = access_token
        self.rooms = {}

    async def connect(self):
        """Connect and join rooms."""
        await self.client.sync(timeout=30000)
        # Join relevant rooms
        for room_id in self.room_ids:
            await self.client.join(room_id)

    async def read_room(self, room_id: str, since: str = None) -> list:
        """Read messages from a room since last check."""
        response = await self.client.room_messages(
            room_id,
            start=since,
            limit=50
        )
        return [
            {
                'sender': event.sender,
                'body': event.body,
                'timestamp': event.server_timestamp
            }
            for event in response.chunk
            if isinstance(event, RoomMessageText)
        ]

    async def post(self, room_id: str, message: str):
        """Post a message to a room."""
        await self.client.room_send(
            room_id,
            message_type="m.room.message",
            content={
                "msgtype": "m.text",
                "body": f"[{self.name}] {message}"
            }
        )

    async def check_for_human_input(self) -> list:
        """Check if humans have posted anything relevant."""
        messages = []
        for room_id in self.rooms:
            room_messages = await self.read_room(room_id, self.last_check)
            # Filter for human messages (not from agents)
            human_messages = [
                m for m in room_messages
                if not m['sender'].startswith('@agent')
            ]
            messages.extend(human_messages)
        return messages
```

### Agent Work Cycle with Matrix

```python
async def run_work_cycle(self):
    """Agent work cycle that includes Matrix check."""

    # 1. Check Matrix for human input
    human_messages = await self.check_for_human_input()
    for msg in human_messages:
        await self.process_human_input(msg)

    # 2. Process assigned work from task file
    await self.process_assigned_tasks()

    # 3. Post status to Matrix if anything interesting happened
    if self.status_update:
        await self.post(
            self.status_room,
            f"Completed {len(self.completed_work)} tasks"
        )

    # 4. Post to #alerts if stuck
    if self.blocked:
        await self.post(
            self.alerts_room,
            f"BLOCKED: {self.blocked_reason}\nNeed human help with: {self.blocked_item}"
        )
```

---

## Example: Roy's Work Cycle

```python
class RoyAgent(MatrixEnabledAgent):
    def __init__(self):
        super().__init__(
            name="roy",
            homeserver="https://matrix.example.com",
            access_token="..."
        )
        self.task_file = "tasks/roy_tasks.json"

    async def run_cycle(self):
        """Roy's complete work cycle."""

        # Check Matrix for human messages
        human_input = await self.check_for_human_input()
        for msg in human_input:
            if self.is_addressed_to_me(msg):
                await self.handle_human_request(msg)

        # Load assigned tasks from file
        work_items = self.load_tasks()

        for task in work_items:
            if task['type'] == 'implement_endpoint':
                success = await self.implement_endpoint(task)
                if success:
                    # Mark task as complete in file
                    self.mark_task_complete(task['id'])

                    # Post completion notice in Matrix
                    await self.post(
                        "#backend",
                        f"Completed {task['endpoint']} for REQ-{task['requirement']}"
                    )

                    # Notify Jen in Matrix that API is ready
                    await self.post(
                        "#integration",
                        f"@jen API ready: {task['endpoint']}"
                    )

    def load_tasks(self):
        """Load pending tasks from file."""
        with open(self.task_file, 'r') as f:
            return [json.loads(line) for line in f if line.strip()]

    def mark_task_complete(self, task_id: str):
        """Remove completed task from file."""
        # Implementation to remove completed task
        pass
```

---

## Coordination Between Agents

Agents coordinate primarily through Matrix chat and shared files.

### The CoffeeTalk.md Pattern

The lightest-weight coordination pattern: a shared markdown file that agents use like a chatroom.

> "Launch two sub-agents, one that understands the front-end and one that understands the back-end, and just have them have coffee. Use a file called coffeetalk.md like it's a chatroom."

Create a `coffeetalk.md` in your project root. Each agent reads it at the start of their work cycle and appends to it when they have something to share. No infrastructure. No message queues. Just a text file.

This works because agents can read markdown natively, the file provides a natural conversation history, and you (the human) can read it too to see what your agents are discussing. See [Workshop 6 - Agent Memory#The Coffee Talk Pattern](#) for the full implementation with timestamps and mentions.

---

## Red Team vs Blue Team Agents

Adversarial testing isn't just for security—it makes your agents more robust.

### The Concept

```
┌─────────────────────────────────────────────────────────────┐
│                    CODE SUBMISSION                          │
│                          │                                  │
│          ┌───────────────┼───────────────┐                  │
│          ▼               │               ▼                  │
│    ┌───────────┐         │         ┌───────────┐            │
│    │ BLUE TEAM │         │         │ RED TEAM  │            │
│    │ (Builder) │         │         │ (Breaker) │            │
│    └─────┬─────┘         │         └─────┬─────┘            │
│          │               │               │                  │
│    "Tests pass"          │         "Found 3 issues"         │
│          │               │               │                  │
│          └───────────────┼───────────────┘                  │
│                          ▼                                  │
│                 ┌─────────────────┐                         │
│                 │ RECONCILIATION  │                         │
│                 │ Fix or document │                         │
│                 └─────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Blue Team Agent (Builder)

The Blue Team agent writes code and claims it's correct:

```markdown
# Agent: Blue (Builder)
## Role
You write and defend code. Your job is to:
1. Implement features according to spec
2. Write comprehensive tests
3. Document edge cases you've handled
4. Defend your implementation against Red Team critique

## Output
For each implementation, provide:
- The code
- Test coverage report
- List of edge cases handled
- Known limitations (if any)
```

### Red Team Agent (Breaker)

The Red Team agent tries to break Blue Team's code:

```markdown
# Agent: Red (Breaker)
## Role
You attack code. Your job is to:
1. Find bugs Blue Team missed
2. Identify security vulnerabilities
3. Discover edge cases that break the code
4. Write exploit tests that demonstrate issues

## Approach
- Read the code Blue Team wrote
- Read the tests Blue Team wrote
- Think adversarially: "What did they NOT test?"
- Write tests that FAIL against Blue Team's code

## Output
For each review, provide:
- List of issues found (ranked by severity)
- Exploit tests that demonstrate each issue
- Suggested fixes (optional)
```

### The Workflow

```python
async def adversarial_review(feature_code: str, feature_tests: str):
    """Run Red Team review on Blue Team code."""

    # Red Team attacks
    red_prompt = f"""
    Review this code and tests. Find bugs, edge cases, and security issues.

    Code:
    {feature_code}

    Tests:
    {feature_tests}

    Write tests that will FAIL against this code.
    """

    red_response = await run_agent("red_team", red_prompt)

    if red_response.issues_found > 0:
        # Blue Team must fix
        blue_prompt = f"""
        Red Team found these issues:
        {red_response.issues}

        Fix the code or explain why each issue is invalid.
        """

        blue_response = await run_agent("blue_team", blue_prompt)

        # Iterate until resolved
        return await reconcile(red_response, blue_response)

    return {"status": "approved", "code": feature_code}
```

### When to Use Red/Blue

| Situation | Use Red/Blue? | Why |
|-----------|--------------|-----|
| Security-critical code | Always | Catch vulnerabilities before prod |
| Payment processing | Always | Money is involved |
| User authentication | Always | Access control is critical |
| Internal tooling | Sometimes | Lower risk, faster iteration |
| Prototype/MVP | Rarely | Speed matters more than perfection |

---

## User Acceptance Testing Automation

> "Use Playwright + Claude for automated UAT."

User Acceptance Testing traditionally requires humans clicking through the app. With AI agents, you can automate this.

### The Concept

Instead of:
```
Human tester: "Click the login button"
Human tester: "Enter credentials"
Human tester: "Verify dashboard loads"
Human tester: "Document any issues"
```

You get:
```
UAT Agent: [Takes screenshot]
UAT Agent: [Analyzes screenshot with vision model]
UAT Agent: [Clicks login button using Playwright]
UAT Agent: [Takes screenshot]
UAT Agent: [Evaluates: "Does this look like a dashboard?"]
UAT Agent: [Documents findings]
```

### Setup: Playwright + Claude Vision

```python
# uat_agent.py
import asyncio
from playwright.async_api import async_playwright
from anthropic import Anthropic

client = Anthropic()

async def run_uat_scenario(scenario: dict):
    """Run a UAT scenario with screenshot analysis."""

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        results = []

        for step in scenario['steps']:
            # Take screenshot before action
            screenshot = await page.screenshot()

            # Analyze current state
            analysis = await analyze_screenshot(screenshot, step['expectation'])

            if not analysis['matches_expectation']:
                results.append({
                    'step': step['name'],
                    'status': 'FAIL',
                    'reason': analysis['reason'],
                    'screenshot': screenshot
                })
                continue

            # Perform action
            if step['action'] == 'click':
                await page.click(step['selector'])
            elif step['action'] == 'fill':
                await page.fill(step['selector'], step['value'])
            elif step['action'] == 'navigate':
                await page.goto(step['url'])

            # Take screenshot after action
            await page.wait_for_load_state('networkidle')
            screenshot_after = await page.screenshot()

            results.append({
                'step': step['name'],
                'status': 'PASS',
                'screenshot': screenshot_after
            })

        await browser.close()
        return results

async def analyze_screenshot(screenshot: bytes, expectation: str) -> dict:
    """Use Claude Vision to analyze screenshot."""
    import base64

    screenshot_b64 = base64.standard_b64encode(screenshot).decode("utf-8")

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": screenshot_b64,
                    },
                },
                {
                    "type": "text",
                    "text": f"""
                    Analyze this screenshot. Does it match this expectation?

                    Expectation: {expectation}

                    Respond with:
                    - matches: true/false
                    - reason: why or why not
                    - suggestions: any usability issues noticed
                    """
                }
            ],
        }],
    )

    return parse_analysis(response.content[0].text)
```

### Example UAT Scenario

```yaml
# scenarios/checkout_flow.yaml
name: "Checkout Flow UAT"
steps:
  - name: "View product page"
    action: navigate
    url: "http://localhost:3000/products/1"
    expectation: "A product page with image, title, price, and Add to Cart button"

  - name: "Add to cart"
    action: click
    selector: "[data-testid='add-to-cart']"
    expectation: "Cart icon should show 1 item, success message visible"

  - name: "Go to checkout"
    action: click
    selector: "[data-testid='checkout']"
    expectation: "Checkout page with order summary and payment form"

  - name: "Enter payment info"
    action: fill
    selector: "[data-testid='card-number']"
    value: "4242424242424242"
    expectation: "Card number field populated, no error messages"

  - name: "Complete purchase"
    action: click
    selector: "[data-testid='submit-payment']"
    expectation: "Confirmation page with order number and thank you message"
```

---

## Citation Checker Git Hooks

> "43% of research citations were fabricated. Add citation checker git hooks."

When agents do research, they hallucinate citations. This git hook validates citations before commit.

### The Problem

Agent writes:
```markdown
According to Smith et al. (2023), "LLMs can achieve 95% accuracy on code generation tasks" [1].

[1] Smith, J., Jones, K., & Lee, M. (2023). Large Language Models for Code Generation.
    Nature Machine Intelligence, 5(3), 245-260.
```

**But this paper doesn't exist.** The agent hallucinated it.

### The Solution: Citation Validator Hook

```python
#!/usr/bin/env python3
# .git/hooks/pre-commit (make executable)
"""
Pre-commit hook to validate citations in markdown files.
"""

import re
import subprocess
import sys
import requests

def get_staged_md_files():
    """Get list of staged markdown files."""
    result = subprocess.run(
        ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACM'],
        capture_output=True, text=True
    )
    return [f for f in result.stdout.strip().split('\n') if f.endswith('.md')]

def extract_citations(content: str) -> list:
    """Extract citations from markdown content."""
    # Match patterns like: [1], (Smith et al., 2023), Smith (2023)
    patterns = [
        r'\[(\d+)\]',  # Numbered citations
        r'\(([A-Z][a-z]+ et al\., \d{4})\)',  # (Author et al., Year)
        r'([A-Z][a-z]+) \((\d{4})\)',  # Author (Year)
    ]

    citations = []
    for pattern in patterns:
        citations.extend(re.findall(pattern, content))

    return citations

def extract_references(content: str) -> list:
    """Extract reference list from markdown."""
    # Look for References or Bibliography section
    ref_section = re.search(
        r'(?:## References|## Bibliography|## Works Cited)(.*?)(?=## |$)',
        content, re.DOTALL | re.IGNORECASE
    )

    if not ref_section:
        return []

    # Extract individual references
    refs = re.findall(r'\[\d+\].*?(?=\[\d+\]|$)', ref_section.group(1), re.DOTALL)
    return [r.strip() for r in refs if r.strip()]

def verify_doi(doi: str) -> bool:
    """Verify a DOI exists."""
    try:
        response = requests.head(f"https://doi.org/{doi}", timeout=5)
        return response.status_code == 200
    except:
        return False

def verify_arxiv(arxiv_id: str) -> bool:
    """Verify an arXiv paper exists."""
    try:
        response = requests.head(
            f"https://arxiv.org/abs/{arxiv_id}",
            timeout=5
        )
        return response.status_code == 200
    except:
        return False

def check_file(filepath: str) -> list:
    """Check a single file for citation issues."""
    with open(filepath, 'r') as f:
        content = f.read()

    issues = []
    citations = extract_citations(content)
    references = extract_references(content)

    # Check: All citations have matching references
    for citation in citations:
        if isinstance(citation, tuple):
            citation = ' '.join(citation)

        # Simple check: is citation mentioned in references?
        found = any(citation in ref for ref in references)
        if not found:
            issues.append(f"Citation '{citation}' has no matching reference")

    # Check: DOIs are valid
    doi_pattern = r'10\.\d{4,}/[^\s]+'
    for ref in references:
        dois = re.findall(doi_pattern, ref)
        for doi in dois:
            if not verify_doi(doi):
                issues.append(f"Invalid DOI: {doi}")

    # Check: arXiv IDs are valid
    arxiv_pattern = r'arXiv:(\d{4}\.\d{4,5})'
    for ref in references:
        arxiv_ids = re.findall(arxiv_pattern, ref)
        for arxiv_id in arxiv_ids:
            if not verify_arxiv(arxiv_id):
                issues.append(f"Invalid arXiv ID: {arxiv_id}")

    return issues

def main():
    files = get_staged_md_files()

    if not files:
        sys.exit(0)

    all_issues = []

    for filepath in files:
        issues = check_file(filepath)
        if issues:
            all_issues.append((filepath, issues))

    if all_issues:
        print("❌ Citation validation failed:")
        for filepath, issues in all_issues:
            print(f"\n{filepath}:")
            for issue in issues:
                print(f"  - {issue}")

        print("\n⚠️  Agent may have hallucinated citations. Please verify manually.")
        sys.exit(1)

    print("✅ All citations validated")
    sys.exit(0)

if __name__ == '__main__':
    main()
```

### Using with a Skeptic Agent

Better yet: add a "Skeptic Agent" to your research workflow:

```markdown
# Agent: Skeptic
## Role
You verify research claims. Your job is to:
1. Check that cited papers actually exist
2. Verify quotes are accurate
3. Confirm statistics match the source
4. Flag any "too good to be true" claims

## Workflow
For each research document:
1. Extract all citations
2. Search for each paper (Google Scholar, Semantic Scholar)
3. If paper exists, verify the claimed content
4. If paper doesn't exist, flag as HALLUCINATED
5. Generate verification report
```

---

## UI Generation with V0 and ShadCN

> "Use V0/ShadCN for AI-generated UIs with consistent styling."

When agents generate frontend code, style consistency is a challenge. V0 and ShadCN provide guardrails.

### What is V0?

[V0](https://v0.dev) is Vercel's AI-powered UI generator that outputs ShadCN components. It ensures:
- Consistent design system
- Accessible components
- Tailwind CSS styling
- Copy-paste ready code

### Integrating V0 into Agent Workflow

```markdown
# Agent: Jen (Frontend with V0)
## UI Generation Workflow

When creating new UI components:
1. Describe the component to V0: v0.dev
2. Get the generated ShadCN code
3. Adapt to project requirements
4. Add project-specific business logic
5. Write E2E tests

## Example Flow
User story: "Add a settings page with profile editing"

1. V0 prompt: "Settings page with editable profile form,
   avatar upload, theme toggle, and notification preferences"
2. Get generated code from V0
3. Replace placeholder data with actual API calls
4. Add form validation
5. Connect to backend endpoints
6. Add E2E test for settings flow
```

### ShadCN Component Library

When agents need to build UI, point them to ShadCN:

```bash
# Install ShadCN
npx shadcn@latest init

# Add components as needed
npx shadcn@latest add button
npx shadcn@latest add form
npx shadcn@latest add dialog
```

**Agent instruction:**
```
When building UI components:
1. Check if ShadCN has the component: https://ui.shadcn.com/docs/components
2. If yes, use the ShadCN component
3. If no, build using ShadCN primitives
4. Never write raw CSS—use Tailwind utilities
```

---

## Paperclip: Company-Level Agent Orchestration

Everything above — specialist agents, task files, Matrix communication, CoffeeTalk.md — works. But it's manual. You're the one opening terminal windows, assigning tasks, monitoring progress. [Paperclip](https://paperclip.ing) automates the orchestration layer.

> "You have 20 Claude Code tabs open and can't track which one does what. That's the problem Paperclip solves."

### What Paperclip Is

Paperclip is an open-source orchestration system that organizes AI agents into a company. You are the board. The CEO agent delegates to department heads, who delegate to workers. Every task traces back to the company mission.

**The analogy is literal:** You define roles (CEO, CTO, Founding Engineer, DevOps), reporting lines, job descriptions, and budgets. Agents wake up on schedules (heartbeats), check their task queue, do work, and go back to sleep.

### Setup

```bash
# One command to get started
npx paperclipai onboard --yes
```

This runs an interactive setup:
1. Creates an embedded Postgres database locally
2. Configures authentication
3. Walks you through creating your first company
4. Sets up the CEO agent

**Requirements:** Node.js 20+, pnpm 9.15+

The dashboard runs at `http://localhost:3100`. No cloud account required — everything is local and self-hosted.

### Core Concepts

**Companies** — self-contained business units with complete data isolation. One Paperclip deployment can run multiple companies.

**Agents** — AI workers with titles, job descriptions, reporting lines, and budgets. Any system that can receive a heartbeat is an agent: Claude Code, Codex, Cursor, custom scripts.

**Heartbeats** — scheduled wake signals. Each heartbeat, the agent wakes up, checks its task queue, does work, and goes back to sleep. You set the recurrence (every 15 minutes, every hour, etc.).

> "Paperclip skill, you run in heartbeats. Short execution windows triggered by Paperclip. Each heartbeat, you wake up."

**Goals** — hierarchical alignment from company mission → project goals → individual tasks. Every task traces back to the mission so agents understand both what and why.

**Budgets** — monthly spending limits per agent. When they hit the limit, they stop. No runaway costs. Warnings fire at 80% utilization.

### The Org Chart

Define your company structure. Paperclip provides default personas, or you can define your own:

```
You (Board) — approve hires, review strategy, override decisions
  └── CEO Agent — sets company direction, delegates to department heads
       ├── CTO Agent — technical architecture, code review
       │    ├── Founding Engineer — builds features, implements specs
       │    └── DevOps Agent — keeps systems alive, monitors production
       └── (Other departments as needed)
```

Each agent has:
- **A persona** — Paperclip provides CEO, CTO, and engineering personas. You can customize them or write your own.
- **A scope** — what they're responsible for and what they refuse to do.
- **A budget** — monthly token/dollar limit.
- **A heartbeat schedule** — how often they wake up.
- **Reporting lines** — who they escalate to, who delegates to them.

### Multi-Level Org Charts in Practice

Real Paperclip deployments evolve beyond the default three-agent structure. Here's an example from an actual project:

> "I got at least two levels of management here."

```
You (Board)
  └── CEO Agent — company strategy, high-level delegation
       ├── CTO Agent — technical decisions, architecture review
       │    ├── Founding Engineer — core feature implementation
       │    └── Community Systems Engineer — integrations, plugins
       ├── CMO Agent — marketing, content, outreach
       └── Game-Specific PMs
            ├── PM: Asteroid Mining Game — owns game-specific features
            └── PM: Trading System — owns economy and market logic
```

The key insight is that the org chart grows organically as the project grows. You start with CEO + CTO + one engineer. When the engineer is overloaded, you add specialists. When coordination becomes a bottleneck, you add a PM layer. The structure follows the work, not the other way around.

### Running Paperclip

```bash
# Start Paperclip (after initial onboard)
npx paperclipai onboard --yes
```

The first run creates the company. Subsequent runs reconnect to the existing database. The CEO's first task is to "found the company" — assess the codebase, create the initial strategy, and begin delegating.

**To stop Paperclip:** `Ctrl+C` in the terminal. Agents stop, the database persists, and you can restart anytime.

**To check status:** The dashboard at `http://localhost:3100` shows the activity log, active agents, task queues, and budgets.

### Paperclip + OpenSpec

Paperclip handles orchestration (who does what, when). OpenSpec handles requirements (what to build, why). They complement each other:

1. **You** write requirements in OpenSpec
2. **Paperclip's CEO** reads the requirements and creates tasks
3. **Paperclip's agents** pick up tasks based on their role and scope
4. **Heartbeats** trigger work cycles
5. **You** review output and adjust direction

> "How is Paperclip interacting with OpenSpec? Paperclip is the runner, not the documentation engine."

### When to Use Paperclip vs Manual Orchestration

| Situation | Use |
|---|---|
| Learning/experimenting | Manual (Claude Code windows) |
| One-off project, 1-2 agents | Manual |
| Ongoing project, 3+ agents | Paperclip |
| Multiple concurrent projects | Paperclip (multi-company support) |
| Need budget enforcement | Paperclip |
| Need audit trail | Paperclip |

### Common Questions from Class

**"Do I add Paperclip after my MVP is complete?"**
You can add it at any point. Some people start with it from day one. Others build the MVP manually and add Paperclip for ongoing development and maintenance.

**"Is Paperclip persistent through reboots?"**
The database persists. The process does not. You need to restart Paperclip after a reboot (`npx paperclipai onboard --yes`). For always-on, run it with a process manager (systemd, pm2, etc.).

**"How do I reduce token usage?"**
Agents read their persona and the Paperclip skill instructions every heartbeat. You can inject key context into the agent's system prompt directly so it doesn't have to re-read everything. Keep personas focused — the founding engineer doesn't need to know everything about Paperclip's architecture.

**"How do I point Paperclip at my project?"**
Run the onboard command from your project directory. Paperclip's agents will work in that directory context.

---

## Exercise 3.1: Create Two Specialist Agents

**Time:** 30 minutes
**Output:** Two agents communicating via Matrix

### Part A: Define Agent Scopes (10 min)

Create character sheets for two agents:

**Agent 1: Backend**
```markdown
# agents/roy.md
[Fill in using template above]
```

**Agent 2: Frontend**
```markdown
# agents/jen.md
[Fill in using template above]
```

### Part B: Set Up Matrix (10 min)

```bash
# Create Matrix rooms for coordination
# - #backend
# - #frontend
# - #integration
# - #alerts

# Set up agent Matrix accounts
# Each agent needs a Matrix account with access token
```

### Part C: Implement Basic Agents (10 min)

Create minimal agent implementations that:
1. Read tasks from their task file
2. Process work and mark complete
3. Post status updates to Matrix
4. Notify other agents via Matrix

Test:
1. Add a task to Roy's task file: `roy_tasks.json`
2. Run Roy's cycle - watch him process and post to Matrix
3. Check that Jen can see Roy's completion message in Matrix
4. Run Jen's cycle - watch her respond

---

## Exercise 3.2: Task File Management

**Time:** 20 minutes
**Output:** Working file-based task distribution system

### Part A: Create Task Files

```bash
# Create task files for different agent types
mkdir -p tasks
touch tasks/backend_tasks.json
touch tasks/frontend_tasks.json
touch tasks/infra_tasks.json
```

### Part B: Implement Task Distribution

```python
# task_manager.py
import json

def distribute_tasks(requirements: list):
    """Distribute requirements to agent task files."""
    for req in requirements:
        agent = determine_agent(req)
        task_file = f"tasks/{agent}_tasks.json"

        with open(task_file, 'a') as f:
            json.dump(req, f)
            f.write('\n')

def determine_agent(req: dict) -> str:
    """Determine which agent should handle this requirement."""
    if 'api' in req.get('tags', []):
        return 'backend'
    elif 'ui' in req.get('tags', []):
        return 'frontend'
    else:
        return 'backend'

def load_agent_tasks(agent_name: str) -> list:
    """Load all tasks for a specific agent."""
    task_file = f"tasks/{agent_name}_tasks.json"
    tasks = []
    with open(task_file, 'r') as f:
        for line in f:
            if line.strip():
                tasks.append(json.loads(line))
    return tasks

def mark_complete(agent_name: str, task_id: str):
    """Remove completed task from file."""
    task_file = f"tasks/{agent_name}_tasks.json"
    remaining_tasks = []

    with open(task_file, 'r') as f:
        for line in f:
            if line.strip():
                task = json.loads(line)
                if task['id'] != task_id:
                    remaining_tasks.append(task)

    with open(task_file, 'w') as f:
        for task in remaining_tasks:
            json.dump(task, f)
            f.write('\n')
```

### Part C: Test Task Management

1. Add 3 tasks to backend_tasks.json
2. Load tasks and process one
3. Mark task as complete
4. Verify task is removed from file
5. Check remaining tasks

---

## Common Issues

### Issue: Duplicate Processing

Agent processes task, crashes, then processes same task again on restart.

**Fix:** Track processed task IDs:
```python
def is_task_processed(task_id: str) -> bool:
    """Check if task was already completed."""
    with open('completed_tasks.log', 'r') as f:
        completed = {line.strip() for line in f}
    return task_id in completed

def mark_task_processed(task_id: str):
    """Log task as completed."""
    with open('completed_tasks.log', 'a') as f:
        f.write(f"{task_id}\n")
```

### Issue: Agents Stepping on Each Other's Files

Even with defined scopes, accidents happen.

**Fix:** Add file-based locking:
```python
import fcntl

def acquire_file_lock(filepath):
    """Acquire exclusive lock on a file."""
    lock_file = f"{filepath}.lock"
    lock_fd = open(lock_file, 'w')
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_fd
    except IOError:
        return None

def release_file_lock(lock_fd):
    """Release file lock."""
    fcntl.flock(lock_fd, fcntl.LOCK_UN)
    lock_fd.close()
```

### Issue: Task File Corruption

Multiple agents writing to same file simultaneously.

**Fix:** Use atomic writes:
```python
import tempfile
import os

def atomic_write(filepath: str, content: str):
    """Write file atomically to prevent corruption."""
    temp_fd, temp_path = tempfile.mkstemp(dir=os.path.dirname(filepath))
    try:
        with os.fdopen(temp_fd, 'w') as f:
            f.write(content)
        os.replace(temp_path, filepath)
    except:
        os.unlink(temp_path)
        raise
```

### Issue: Lost Task Assignments

Agent doesn't see tasks added after it starts.

**Fix:** Poll task file regularly or watch for changes:
```python
import time

def watch_for_new_tasks(task_file: str, check_interval: int = 60):
    """Check for new tasks periodically."""
    last_size = os.path.getsize(task_file)
    while True:
        time.sleep(check_interval)
        current_size = os.path.getsize(task_file)
        if current_size > last_size:
            # New tasks added
            yield load_new_tasks(task_file, last_size)
            last_size = current_size
```

---

## What You'll Have After This Workshop

1. **LLM-friendly codebase** with small files and clear interfaces
2. **Specialist agent definitions** with clear scopes and tools
3. **File-based task distribution** for agent work assignment
4. **Matrix integration** for human-agent interaction and coordination
5. **Task management system** with completion tracking
6. **Agent communication patterns** via Matrix chat
7. **Paperclip orchestration** for automated agent management, heartbeats, and budget enforcement

Your agents can now work as a team — either manually coordinated through Matrix and shared task files, or automatically orchestrated through Paperclip.

---

## Next Steps

- [Workshop 4 - Release Management](/HjXKMyrvQzCrFIjWVO9f8A) - Coordinate merges and scale the team
- Add a third specialist agent for infrastructure

---

*Previous: [Workshop 2 - Autonomous Workers](/Z2qHKfeUT9uVFKE1jwgIFQ) | Next: [Workshop 4 - Release Management](/HjXKMyrvQzCrFIjWVO9f8A)*

→ Explore agent patterns in the [Agent Loop Bench](/tools/agent-loop-bench).