# Workshop 2: Autonomous Workers
<p><a href="https://www.loom.com/share/83bfacddb5eb4c8285d212bd488b1a52">▶︎ Building an Autonomous Development System with AI Agents · 174 min</a></p>


Jan 5th:
<p><a href="https://www.loom.com/share/a4cb35c2d326490bac33a6c11419c1ac">▶︎ Building and Optimizing Your Development Orchestrator 🚀 · 60 min</a></p>
### 3/13/26
<p><a href="https://www.loom.com/share/a1e022e4497848d7adfe21af4ed54077">▶︎ Building Software: Embracing the Process of Iteration and Improvement 🚀 · 118 min</a></p>


**Set up Claude to work while you sleep.**

---

## The CTO Mindset: Fire Yourself From That Job

### You Are the CTO Now

The biggest mental shift in autonomous development isn't technical - it's organizational. You're no longer a developer writing code. You're a CTO managing agents who write code.

> "Human management experience actually predicts AI capabilities - the correlation directly maps."

**CTO vs Engineering Manager:**

| Role | What They Do | What They Don't Do |
|------|--------------|-------------------|
| **CTO** | Set direction, review architecture, monitor roadmap | Watch every line of code, debug typos |
| **Engineering Manager** | Daily standups, PR reviews, pair programming | Make strategic decisions alone |
| **You (Pre-AI)** | Write code, debug, test, deploy | Delegate to parallel workers |
| **You (With Agents)** | Monitor roadmap, remove blockers, make decisions | Write the code yourself |

> "The CTO doesn't pair program." You don't sit next to an agent and watch it type. You set direction, review output, and make strategic decisions. If you find yourself hovering over the terminal watching each line of code appear, you've fallen back to the engineer mindset. Step up to the CTO mindset.

### Management Is Engineering

> "This is management. Technical management. Engineering management. But it's management. It's not coding. And management, guess what, is an engineering discipline. And always was."

Engineers often find this transition disorienting. You spend your career building things, and suddenly your job is to tell others what to build. It feels wrong:

> "It just feels like you don't do any of the actual work. You just tell people what to do. But that's such a big deal."

The "actual work" has shifted. Defining clear requirements, designing system prompts, reviewing output, removing blockers, making architectural decisions — that IS the work now. If you've managed humans before, this will feel familiar. If you haven't, you're learning two skills at once: management and AI orchestration. Both are engineering disciplines. Both require systematic thinking. Neither is "just telling people what to do."

### "Fire Yourself From That Job"

Every time you find yourself doing repetitive work, ask: "Can I automate this?"

> "As soon as you're starting to do something, fire yourself from that job."

**The Pattern:**
1. Notice you're doing something repeatedly
2. Tell an agent to do it instead
3. Review the output (don't watch the process)
4. Iterate on the agent's prompt until reliable
5. Move on to higher-level work

**Examples:**
- Writing boilerplate code → Agent writes it, you review
- Running test suites → Pre-commit hook runs them automatically
- Checking code quality → Linting agent runs on every commit
- Updating documentation → Agent keeps docs in sync with code

### Let Them Make Mistakes

> "Let it generate bad code. Let the mistakes be made and then write process around the mistakes that are made based on what you're actually seeing. Don't fix problems that you think might be a problem in the future."

**The key insight:** You can't anticipate every problem. Let agents work, observe failures, then systematize fixes.

### "The First Time You Build a Thing, It's Wrong"

> "The first time you build a thing, it's wrong. You don't know what you're doing and the thing doesn't know what it's doing."

This is why discipline and processes matter more than getting it right on the first try. You can't out-think the problem in advance — you have to build, observe, and correct. The way you encode that discipline is through system prompts. Every lesson learned, every mistake caught, every pattern that failed — it goes into the system prompt so the agent doesn't repeat it. The system prompt is your institutional memory of what went wrong and how to avoid it next time.

**Wrong approach:**
```
Write perfect requirements → Agents write perfect code → No bugs
```

**Correct approach:**
```
Write good requirements → Agents write code → Some bugs →
Fix bugs → Update process → Fewer bugs → Iterate
```

---

## Cautionary Tales: Learn From Others' Mistakes

Before you deploy autonomous workers, learn from those who've gone before you.

### The Database Deletion Incident

> "Thomas gave Claude a broad 'optimize' instruction, and it deleted production data that had been materialized."

**What happened:** A developer told an agent to "optimize the database." The agent determined that some data was redundant (it had been pre-computed and stored for performance) and deleted it. The agent was technically correct—the data could be regenerated—but the regeneration took 3 days.

**The lesson:** Be specific with instructions. "Optimize" means different things in different contexts.

| Instruction | What You Meant | What Agent Did |
|------------|----------------|----------------|
| "Optimize the database" | Add indexes, tune queries | Deleted "redundant" data |
| "Clean up the code" | Refactor, improve readability | Deleted "unused" features |
| "Simplify this" | Reduce complexity | Removed error handling |

**Better approach:**
```
"Optimize database query performance for the users table.
Specifically:
- Add indexes for columns used in WHERE clauses
- Analyze slow queries (>100ms)
- Do NOT modify or delete any data"
```

### The Kernel Panic Incident

> "Too many agents running at once crashed the computer. Move agents to a VM when they start crashing your machine."

**What happened:** A developer ran 10+ autonomous agents simultaneously on their laptop. Each agent spawned subprocesses for tests, linting, and builds. The system ran out of file handles and memory, causing a kernel panic.

**The lesson:** Agents are compute-intensive. Plan for resource constraints.

| Environment | Max Concurrent Agents | Recommended |
|-------------|----------------------|-------------|
| Laptop (8GB RAM) | 2-3 | 1-2 |
| Laptop (16GB RAM) | 4-5 | 2-3 |
| Cloud VM (dedicated) | 5-10 | 3-5 |
| Cloud VM (beefy) | 10+ | 5-8 |

**Solutions:**
1. **Run agents in VMs** - Crash the VM, not your laptop
2. **Use resource limits** - `ulimit` on Linux, container constraints
3. **Stagger execution** - Don't start all agents at once
4. **Monitor resources** - Kill agents when memory > 80%

```bash
# Example: Run agent in container with limits
docker run --memory=2g --cpus=1 agent-worker
```

### The "Outdoor Pet" Concept

When an agent crashes your machine -- and it will -- you get one free pass. The second time, that agent becomes an "outdoor pet": it needs its own machine.

> You get one kernel panic, and then you're out.

Migrate heavy agent workloads to a cloud VM. A $13/month E2 instance on Google Cloud is enough to run multiple agents continuously. Agents that need their own machine are "outdoor pets" -- they don't live on your laptop anymore. They run outside, on their own hardware, and you check on them when you want to.

This is also why the cheap hardware recommendations matter (see [Workshop 3 - Agent Orchestration#Hardware Recommendations](#)). A $150 Orange Pi or a $13/month cloud VM keeps your development machine stable while agents grind through tasks overnight.

### Dedicated Dev Machine for Agents

Beyond crash prevention, there's a security argument for running agents on separate hardware:

> "If you're gonna have automated development happening, I kind of would put it on a VM somewhere... would you really want that to be running inside your corporate network while you, on your machine with your API keys? Probably not."

Your laptop has your SSH keys, your cloud credentials, your browser sessions, your corporate VPN. An autonomous agent running on that same machine has implicit access to all of it. A dedicated VM isolates the blast radius — the agent has only the credentials you explicitly give it.

### Hetzner Cloud Recommendation

For the dedicated agent machine, Hetzner is a strong option:

> "Hetzner... runs 100% on renewable. Refurbished servers. The heat heats homes in Finland. Finland is not a five-eyes country."

Hetzner offers affordable cloud VMs with good specs for agent workloads. The environmental and privacy considerations are a bonus — renewable energy, server reuse, and data sovereignty outside the Five Eyes intelligence-sharing alliance.

---

## Managing API Costs and Security

### Track AI Spending with Privacy.com

> "Use Privacy.com to track AI spending separately from other business expenses."

When you're running multiple autonomous agents, API costs add up fast. Use Privacy.com virtual cards to:
- Create a dedicated card for AI/API spending
- Set spending limits per card
- Get alerts when spending spikes
- Track costs per project or agent

**Setup:**
1. Create a Privacy.com account
2. Generate a virtual card for "AI Development"
3. Set monthly spending limit (e.g., $500)
4. Use this card for Anthropic, OpenAI, etc.
5. Review spending weekly

| Agent | Token Usage/Day | Cost/Day | Cost/Month |
|-------|----------------|----------|------------|
| Autonomous Worker | ~500K tokens | $7.50 | $225 |
| Researcher | ~200K tokens | $3.00 | $90 |
| Code Reviewer | ~100K tokens | $1.50 | $45 |
| **Total** | ~800K tokens | $12.00 | $360 |

### API Key Security with Google Secrets Manager

> "Use Google Secrets Manager for API key management without .env files."

**The problem:** `.env` files are dangerous:
- Easy to accidentally commit to git
- Shared across all developers
- No access logging
- No rotation without code changes

**The solution:** Use a secrets manager.

**Setup with Google Cloud:**
```bash
# Create a secret
gcloud secrets create anthropic-api-key --data-file=key.txt

# Grant access
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:agent@project.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Access in code:**
```python
from google.cloud import secretmanager

def get_api_key(secret_id: str) -> str:
    """Fetch API key from Google Secrets Manager."""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/my-project/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# Usage
api_key = get_api_key("anthropic-api-key")
client = Anthropic(api_key=api_key)
```

**Benefits:**
- No secrets in code or .env files
- Automatic rotation support
- Access logging (who accessed what, when)
- Role-based access control
- Works in CI/CD without exposing keys

### VaultWarden for Self-Hosted Secrets

An alternative to Google Secrets Manager, especially if you want to stay off cloud providers:

> "VaultWarden, which is a Bitwarden-compatible thing written in Rust."

VaultWarden is a self-hosted, CLI-based password and secrets manager. It's Bitwarden-compatible, so you get the same interface and browser extensions, but you own the data.

**Security pattern for agent use:** Use session keys with short expiry windows (60 minutes). The agent authenticates, gets a session token, does its work, and the token expires. If the token leaks, the blast radius is limited to one hour.

```bash
# Agent authenticates and gets a 60-minute session
bw login --apikey
export BW_SESSION=$(bw unlock --raw)

# Fetch a secret
bw get password "anthropic-api-key"

# Session expires after 60 minutes automatically
```

### Separate GitHub Account for Agent Commits

Security hygiene: separate your human and agent Git identities.

> "I use my LizThe.dev account for pull requests and commits, and then I use my LizTheDeveloper account to merge pull requests and do code reviews."

Create a dedicated GitHub account for your agents. Agents push commits and open pull requests from the agent account. You review and merge from your human account. This gives you:

- **Clear audit trail** — you can see at a glance which commits were human vs. agent
- **Permission isolation** — the agent account has push access but not admin access
- **Accountability** — if an agent does something destructive, the blast radius is limited to the agent account's permissions

---

## Overview

| Duration | 60 minutes |
|----------|------------|
| Format | Hands-on setup with live deployment |
| Output | Running autonomous agent with test pipeline |
| Prerequisites | OpenSpec proposals from Workshop 1, Claude API access |

---

## Learning Objectives

By the end of this workshop, you will:
- Craft effective system prompts for autonomous agents
- Set up Claude in headless/autonomous mode
- Establish testing infrastructure for unsupervised code generation
- Configure pre-commit and post-commit hooks
- Understand why end-to-end tests are non-negotiable for autonomous work

---

## The Autonomous Worker Concept

Traditional AI coding assistance:
```
Human: Write a function
AI: Here's a function
Human: Now write tests
AI: Here's tests
Human: Run them
AI: They pass
Human: Commit
```

Autonomous worker:
```
Agent: [Reads next task from openspec/changes/[change]/tasks.md]
Agent: [Writes implementation]
Agent: [Writes tests]
Agent: [Runs tests]
Agent: [If passing, marks task complete and commits]
Agent: [Picks next task]
Agent: [Repeat until all tasks complete]
```

The human isn't in the loop. The tests are in the loop.

---

## Test-Driven Development: Build Tests First

### Why TDD with AI Agents

Traditional development: Write code → Write tests → Hope they match

**TDD with AI Agents:** Design requirements → Generate test suite → AI implements to pass tests

This inverts the usual flow. When you have comprehensive tests BEFORE implementation, agents become dramatically more reliable. The tests become the specification.

### The TDD Workflow with Claude Code

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  PHASE 1: REQUIREMENTS      PHASE 2: TESTS       PHASE 3: CODE    │
│  ────────────────────       ─────────────        ────────────      │
│                                                                    │
│  ┌─────────────┐            ┌─────────────┐      ┌─────────────┐  │
│  │ Brain Dump  │            │ Test Suite  │      │ Implement   │  │
│  │ (Workshop 1)│────────────▶│ Generation │──────▶│ to Pass    │  │
│  └─────────────┘            └─────────────┘      └─────────────┘  │
│                                                                    │
│  You already did this!       YOU ARE HERE         Agent does this  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Generating Test Suites from Requirements

After you have requirements from Workshop 1, generate tests BEFORE any implementation:

**The Prompt:**
```
You are a Test Engineer. Given these requirements, generate a comprehensive test suite.

For each requirement:
1. Write unit tests for the core logic
2. Write integration tests for component interactions
3. Write E2E tests for user-facing flows
4. Include edge cases and error conditions

All tests should FAIL initially (there's no implementation yet).
Tests define the specification - if it's not tested, it doesn't exist.

Requirements:
[paste your requirements from Workshop 1]

Output as:
- tests/unit/test_[feature].py
- tests/integration/test_[feature].py
- tests/e2e/test_[feature].py
```

### Example: From Requirement to Tests

**Requirement:**
```
REQ-001: User Authentication
The system shall authenticate users via email/password with bcrypt hashing.

Acceptance Criteria:
- Valid credentials → session token generated
- Invalid credentials → error message, no redirect
- After 5 failed attempts → account locked 15 minutes
```

**Generated Tests (before any code exists):**
```python
# tests/unit/test_auth.py
import pytest

class TestAuthentication:
    def test_valid_credentials_generates_token(self):
        """REQ-001: Valid credentials should generate session token."""
        # FAILS - authenticate() doesn't exist yet
        result = authenticate("test@example.com", "correct_password")
        assert result.token is not None
        assert result.user.email == "test@example.com"

    def test_invalid_password_returns_error(self):
        """REQ-001: Invalid password should return error."""
        # FAILS - authenticate() doesn't exist yet
        result = authenticate("test@example.com", "wrong_password")
        assert result.error == "Invalid credentials"
        assert result.token is None

    def test_account_locks_after_five_failures(self):
        """REQ-001: Account should lock after 5 failed attempts."""
        # FAILS - no implementation yet
        for i in range(5):
            authenticate("test@example.com", "wrong_password")

        # 6th attempt should show locked
        result = authenticate("test@example.com", "wrong_password")
        assert result.error == "Account locked. Try again in 15 minutes."

    def test_password_hashed_with_bcrypt(self):
        """REQ-001: Passwords must be stored as bcrypt hashes."""
        # FAILS - no implementation yet
        user = create_user("test@example.com", "password123")
        assert user.password_hash.startswith("$2b$")  # bcrypt prefix
```

### The Red-Green Cycle with Agents

**Step 1: RED - All Tests Fail**
```bash
$ pytest tests/
============ 47 failed ============

# Good! Tests define what we need to build.
```

**Step 2: Agent Implements - Tell Claude Code:**
```
Here's my test suite. Implement the code to make all tests pass.

Read the tests carefully - they ARE the specification.
Don't modify tests. Write code that makes them pass.

Test files: tests/unit/test_auth.py
```

**Step 3: GREEN - Tests Pass**
```bash
$ pytest tests/
============ 47 passed ============

# Implementation complete. Tests verify correctness.
```

### Why This Works Better Than Code-First

**Code-First Problems:**
- Agent writes code that "looks right" but doesn't match requirements
- Tests written after the fact just verify what was built, not what was needed
- Edge cases discovered in production, not development

**Tests-First Benefits:**
- Tests ARE the specification - no ambiguity
- Agent has clear success criteria
- Edge cases defined upfront
- Acceptance criteria directly testable
- Refactoring is safe (tests catch regressions)

### Test Generation Prompt Template

Use this prompt to generate test suites from your OpenSpec proposals:

```
You are a Test-Driven Development specialist. Given this OpenSpec proposal,
generate a comprehensive test suite that will drive the implementation.

## Rules
1. Every acceptance criterion becomes at least one test
2. Include happy path AND error cases
3. Tests should be specific and deterministic
4. Use descriptive test names that reference the requirement
5. All tests should FAIL until implementation exists

## Proposal
[paste proposal.md content]

## Output Structure
tests/
├── unit/           # Test individual functions
├── integration/    # Test component interactions
└── e2e/            # Test full user flows

Generate test files with clear docstrings linking to requirements.
```

### The Agent Implementation Prompt

Once tests exist, tell your autonomous agent:

```
You are implementing code for an existing test suite.

## Workflow
1. Run tests to see what's failing
2. Pick ONE failing test
3. Write minimum code to pass it
4. Run tests again
5. Repeat until all tests pass

## Rules
- NEVER modify test files
- If a test seems wrong, flag it for human review
- Commit after each test passes
- Reference test name in commit message

## Start
Read the test suite, then begin implementing.
```

### Exercise 2.0a: Generate Tests from Requirements

**Time:** 15 minutes
**Output:** Test suite that fails (no implementation yet)

1. Take 3-5 requirements from your Workshop 1 roadmap
2. Use the test generation prompt to create tests
3. Run the tests - they should ALL fail
4. Commit the failing tests (this is your specification)

```bash
# Your tests should look like this:
$ pytest tests/
============ 23 failed, 0 passed ============

# Perfect. Now you have a specification.
```

---

## Type Safety and Codebase Standardization

### The Fear of Generated Code

People hesitate to use AI code generation because:
- "It creates maintenance surface area"
- "I'll have to clean it all up later"
- "Generated code becomes technical debt"

**These fears are valid for traditional development.** But Claude Code changes the equation.

### The Key Insight: AI Generates AND Maintains

The same tool that creates code can also standardize it.

**Traditional concern:**
```
Generate 50 files → Now I have 50 files to maintain
Generate 1000 lines → Now I have 1000 lines of potential inconsistency
```

**With Claude Code:**
```
Generate 50 files → Ask Claude to standardize all 50 files
Generate 1000 lines → Ask Claude to apply consistent patterns across all 1000 lines
```

### Standardization Across a Codebase

Claude Code on the web (claude.ai/code) excels at large maintenance tasks:

**The Prompt for Codebase Standardization:**
```
Review this entire codebase and standardize:

1. Naming conventions - all functions should use snake_case
2. Error handling - all errors should use our ErrorResult pattern
3. Type annotations - add type hints to all function signatures
4. Docstrings - all public functions need docstrings

Show me what you'll change before doing it.
Then apply changes across the entire codebase.
```

### Example: Type Safety Sweep

You've generated a lot of code. Now enforce type safety everywhere:

```
Add comprehensive type annotations to this codebase:

## Rules
1. All function parameters must have type hints
2. All return types must be specified
3. Use Union types for nullable values (str | None, not Optional[str])
4. Use TypedDict for dictionary structures
5. Add py.typed marker for PEP 561 compliance

## Approach
1. Start with core modules (src/core/)
2. Move to utilities (src/utils/)
3. Finish with entry points

Run mypy after each module to verify.
```

**Result:**
```python
# Before (AI-generated, no types)
def process_user(data):
    result = validate(data)
    if result:
        return save_to_db(result)
    return None

# After (AI-standardized)
def process_user(data: UserInput) -> SaveResult | None:
    result: ValidationResult = validate(data)
    if result.is_valid:
        return save_to_db(result.user)
    return None
```

### The Cleanup Workflow

When you've generated substantial code and want to clean it up:

**Step 1: Identify Patterns to Standardize**
```
Analyze this codebase and identify:
1. Inconsistent naming (snake_case vs camelCase)
2. Missing type annotations
3. Inconsistent error handling
4. Duplicate code that could be extracted
5. Missing documentation

List findings by priority.
```

**Step 2: Apply Standards Systematically**
```
Apply these standards across the entire codebase:

[paste the specific standards]

Work through files systematically:
1. Make changes to one file
2. Run tests to verify nothing broke
3. Commit with message "Standardize: [file] - [what changed]"
4. Move to next file
```

**Step 3: Verify with Static Analysis**
```bash
# Run after standardization
mypy src/                    # Type checking
ruff check src/ --fix        # Linting
black src/ --check           # Formatting
```

### Why This Changes the Calculus

**Old thinking:** "Every line of generated code is a liability"

**New thinking:** "Generated code is free to create AND free to maintain"

The maintenance surface area argument assumes human maintenance. When AI maintains AI-generated code, the economics flip:

| Task | Human Time | AI Time |
|------|-----------|---------|
| Generate 50 files | N/A | 5 minutes |
| Standardize naming in 50 files | 2-4 hours | 5 minutes |
| Add types to 50 files | 4-8 hours | 10 minutes |
| Fix consistency issues | Ongoing | One prompt |

### Exercise 2.0b: Standardize Generated Code

**Time:** 10 minutes
**Output:** Type-safe, consistent code

After your agent generates implementation code:

1. Run a type safety sweep:
   ```
   Add type annotations to all functions in src/
   Run mypy after each file to verify.
   ```

2. Run a consistency check:
   ```
   Standardize error handling across the codebase.
   All errors should use the Result[T, E] pattern.
   ```

3. Verify with static analysis:
   ```bash
   mypy src/ --strict
   ruff check src/
   ```

**The Goal:** Generate freely, standardize ruthlessly. AI does both.

---

## Setting Up Headless Claude

### Option 1: Claude Code in Headless Mode

```bash
# Start Claude Code in non-interactive mode
claude --headless --task "Work through changes in openspec/changes/, implementing tasks from tasks.md files"
```

#### Agents Installing Their Own Tools

Don't worry about pre-installing every tool an agent might need. In practice, agents are resourceful:

> "I find the agents install tools themselves. They build them or they download them, and so if they need them, they will do it. And I wouldn't worry about it anymore."

If an agent needs a linter, it will install one. If it needs a testing framework, it will set it up. This is one reason headless mode on a dedicated VM is ideal — the agent can install whatever it needs without cluttering your local environment.

### Option 2: API-Based Autonomous Worker

```python
# autonomous_worker.py
import anthropic
import subprocess
import time

client = anthropic.Anthropic()

SYSTEM_PROMPT = """
You are an autonomous software developer. Your job is to:
1. Read active changes from openspec/changes/
2. For each change, read tasks from openspec/changes/[change-name]/tasks.md
3. Implement the next uncompleted task
4. Write tests for your implementation
5. Run tests
6. If tests pass, mark task as complete in tasks.md and commit
7. If tests fail, fix and retry (max 3 attempts)
8. Move to next task

You have access to:
- File read/write
- Shell commands (npm, pytest, git, etc.)
- The full codebase
- OpenSpec CLI (openspec list, openspec show, openspec archive)

Rules:
- Never commit failing tests
- Never skip writing tests
- Always reference change name and task in commits
- Mark tasks complete in tasks.md as you finish them
- Stop and report if you're stuck after 3 attempts
"""

def run_autonomous_cycle():
    # Implementation details...
    pass
```

### Option 3: Cloud VM with Scheduled Execution

```bash
# cron job on cloud VM
0 */2 * * * /home/agent/run_autonomous_worker.sh
```

This runs the autonomous worker every 2 hours, lets it drain its queue, then sleeps.

### Option 4: Paperclip — Agent Orchestration Platform

[Paperclip](https://paperclip.ing) is an open-source orchestration system that manages autonomous agents as a company. Instead of manually running headless Claude or cron jobs, Paperclip handles scheduling, delegation, budgets, and governance through a single control plane.

> "If you're a software engineer, spec it out first, then download and install Paperclip. That's all. That's my recommendation."

**Quick start:**
```bash
npx paperclipai onboard --yes
```

This launches an interactive setup that creates an embedded Postgres database, configures authentication, and walks you through creating your first company — all locally.

**Requirements:** Node.js 20+, pnpm 9.15+

**What Paperclip gives you over manual headless mode:**
- **Heartbeats** — scheduled wake signals that trigger agents to check work and act. No cron jobs to manage.
- **Budget enforcement** — monthly spending limits per agent. When they hit the limit, they stop. No runaway costs.
- **Activity logging** — every task, tool call, and decision is logged and auditable.
- **Governance** — pause, resume, override, reassign, or terminate any agent from a dashboard.

Paperclip is covered in depth in [Workshop 3 - Agent Orchestration](/pBRbgNSsSs-lJuvJQoUISw). For now, know that it's the difference between managing 20 Claude Code tabs manually and having a system that manages them for you.

---

## System Prompt Construction

The system prompt is your agent's personality, constraints, and operating instructions. A well-crafted system prompt is the difference between an agent that works reliably and one that causes chaos.

### Anatomy of an Effective System Prompt

A good system prompt has four sections:

```
1. IDENTITY & ROLE
   "You are an autonomous software developer"

2. CORE WORKFLOW
   Step-by-step what the agent does

3. CAPABILITIES & CONSTRAINTS
   What tools/access the agent has

4. RULES & GUARDRAILS
   Non-negotiable behaviors
```

### Example: Production System Prompt

Here's a real production system prompt that works:

```python
SYSTEM_PROMPT = """
You are an expert autonomous software developer.

## Core Philosophy
Experts always look at the documentation before they try to use a library.
Your role is not to teach but to execute. Don't confirm once you find a solution—just proceed to fix it.

## Workflow
1. Read active changes from openspec/changes/
2. For each change, read tasks from openspec/changes/[change-name]/tasks.md
3. Read the proposal.md for full context before implementing
4. Implement the next uncompleted task
5. Write tests for your implementation
6. Run tests
7. If tests pass, mark task as complete in tasks.md and commit
8. If tests fail, fix and retry (max 3 attempts)
9. Move to next task

## Technical Preferences
- Always use Python when possible
- Prefer raw SQL over SQLAlchemy (except for model definitions)
- Avoid single-letter variable names
- Use Playwright for web project testing with screenshots between actions
- Always use virtual environments (venv/env, never Conda)
- Background long-running processes without waiting

## Project Organization
- Implement centralized logging for each component
- Maintain plans in openspec/changes/[change-name]/
- Check documentation before using any library
- Never hallucinate or summarize completion

## Testing Approach
- Test real interactions between components rather than isolated units with mocks
- Mock only external dependencies, not internal components
- Always run integration tests, not just unit tests
- Use Playwright to test web UIs with screenshots

## Bug Tracking with OpenSpec

**This is critical:** OpenSpec makes autonomous development tractable because bugs and errors can be systematically tracked and fixed.

**See also:**
- [Workshop 1 - Planning and Requirements#OpenSpec Workflow](#) - Initial setup and proposal creation
- [Workshop 5 - Anti-Pattern Detection](/WV6CvrfYS4aYvAy2SD0A7g) - How anti-patterns become bugs that need tracking
- [Workshop 7 - Continuous Improvement#Pattern Defeat Cycle](#) - Using bug patterns to improve agent behavior

### When Bugs Occur

When tests fail or errors occur during autonomous work:

1. **Create an OpenSpec change directory for the bug**
   ```bash
   mkdir -p openspec/changes/bug-fix-auth-token-expiry
   ```

2. **Document the bug in the proposal**
   ```markdown
   # Fix: Auth Token Expiry Bug

   ## Problem
   Users are getting logged out after 5 minutes instead of the intended 60 minutes.

   ## Root Cause
   JWT expiry set to 300 seconds instead of 3600 seconds in auth.py line 42.

   ## Solution
   Change JWT_EXPIRY_SECONDS from 300 to 3600.

   ## Test Plan
   1. Login as user
   2. Wait 10 minutes
   3. Verify user still authenticated
   4. Verify token doesn't expire before 60 minutes
   ```

3. **Agent picks up bug fix from changes queue**
   The autonomous worker reads from `openspec/changes/` just like feature work.

### Error-to-Spec Workflow

```python
# In autonomous worker error handler
def handle_test_failure(task: dict, error: str, attempt: int):
    """When tests fail, create OpenSpec proposal if needed."""

    if attempt >= MAX_RETRIES:
        # Create OpenSpec bug proposal
        bug_name = f"bug-{task['change']}-{task['task_index']}"

        proposal = f"""# Bug: {task['task']}

## Error Encountered
{error}

## Context
- Change: {task['change']}
- Task: {task['task']}
- Attempts: {attempt}

## Investigation Needed
- Reproduce error
- Identify root cause
- Implement fix
- Add regression test

## Priority
High - blocking {task['change']}
"""

        # Create OpenSpec change directory
        change_dir = Path(f"openspec/changes/{bug_name}")
        change_dir.mkdir(parents=True, exist_ok=True)
        (change_dir / "proposal.md").write_text(proposal)

        # Create tasks.md for bug
        tasks = f"""# Tasks for {bug_name}

- [ ] Reproduce error locally
- [ ] Identify root cause
- [ ] Implement fix
- [ ] Write regression test
- [ ] Verify fix resolves original error
"""
        Path(f"openspec/changes/{bug_name}/tasks.md").write_text(tasks)

        print(f"Created OpenSpec proposal: openspec/changes/{bug_name}/")
        print(f"Bug will be picked up by next autonomous worker run")
```

### Production Error Tracking

When production errors occur, agents can create OpenSpec proposals automatically:

```python
# error_monitor.py
import json
from pathlib import Path
import hashlib

def report_production_error(error_data: dict):
    """Create OpenSpec proposal for production error."""

    # Generate unique ID for error
    error_sig = f"{error_data['message']}:{error_data['file']}:{error_data['line']}"
    error_id = hashlib.sha256(error_sig.encode()).hexdigest()[:8]

    bug_name = f"prod-error-{error_id}"

    # Check if already reported
    if Path(f"openspec/changes/{bug_name}").exists():
        print(f"Error already tracked: {bug_name}")
        return

    # Create proposal
    proposal = f"""# Production Error: {error_data['message']}

## Error Details
- **Message:** {error_data['message']}
- **File:** {error_data['file']}:{error_data['line']}
- **Timestamp:** {error_data['timestamp']}
- **Frequency:** {error_data.get('count', 1)} occurrences
- **User Impact:** {error_data.get('affected_users', 'Unknown')} users affected

## Stack Trace
```
{error_data.get('stack_trace', 'N/A')}
```

## Investigation Steps
1. Reproduce error in staging
2. Identify root cause from stack trace
3. Implement fix
4. Write regression test
5. Deploy fix to production
6. Monitor for recurrence

## Priority
{determine_priority(error_data)}
"""

    # Create OpenSpec change directory
    change_dir = Path(f"openspec/changes/{bug_name}")
    change_dir.mkdir(parents=True, exist_ok=True)
    (change_dir / "proposal.md").write_text(proposal)

    # Create tasks
    tasks = f"""# Tasks for {bug_name}

- [ ] Reproduce error in local/staging environment
- [ ] Analyze stack trace and identify root cause
- [ ] Implement fix
- [ ] Write regression test to prevent recurrence
- [ ] Verify fix resolves production error
- [ ] Deploy to production
- [ ] Monitor error logs for 24 hours
"""
    Path(f"openspec/changes/{bug_name}/tasks.md").write_text(tasks)

    print(f"✅ Created OpenSpec bug proposal: {bug_name}")

def determine_priority(error_data: dict) -> str:
    """Determine bug priority based on impact."""
    affected = error_data.get('affected_users', 0)
    frequency = error_data.get('count', 0)

    if affected > 100 or frequency > 50:
        return "🔴 CRITICAL - Fix immediately"
    elif affected > 10 or frequency > 10:
        return "🟡 HIGH - Fix within 24 hours"
    else:
        return "🟢 MEDIUM - Fix in next sprint"
```

### Why This Makes Autonomous Work Tractable

**Related concepts:**
- [Workshop 6 - Agent Memory#Episodic Memory](#) - Agents remember bug encounters and learn from them
- [Workshop 5 - Anti-Pattern Detection#Senior Review Agent](#) - Catches bugs before they reach production

**Without OpenSpec bug tracking:**
```
Agent: Tests failed
Agent: Retrying...
Agent: Tests failed again
Agent: Retrying...
Agent: Tests failed again
Agent: [Gives up, leaves broken code]
```

**With OpenSpec bug tracking:**
```
Agent: Tests failed
Agent: Retrying...
Agent: Tests failed again
Agent: Retrying...
Agent: Tests failed again
Agent: Creating OpenSpec proposal: bug-auth-token-expiry
Agent: [Documents error, stack trace, attempts]
Agent: [Moves to next task]

[Later or different agent]
Agent: Reading openspec/changes/bug-auth-token-expiry/
Agent: Reproducing error...
Agent: Found root cause: JWT_EXPIRY_SECONDS = 300 should be 3600
Agent: Fixing...
Agent: Tests pass
Agent: Marking bug resolved, archiving proposal
```

### Integration with Agent System Prompt

Update your autonomous worker system prompt:

```markdown
## When Tests Fail

If tests fail after 3 attempts:
1. Create OpenSpec proposal for the bug
2. Include error message, stack trace, and context
3. Create tasks.md with investigation steps
4. Move to next task (don't block on one failing task)
5. Bug will be picked up by next autonomous run

## When Production Errors Occur

If monitoring detects production errors:
1. Check if error already has OpenSpec proposal
2. If not, create proposal with error details
3. Set priority based on frequency and user impact
4. Add to high-priority queue if critical
```

### Viewing Bug Status

```bash
# List all active bugs
openspec list | grep "bug-" | grep "prod-error-"

# View specific bug
openspec show bug-auth-token-expiry

# Check which bugs are being worked on
grep -r "in_progress" openspec/changes/bug-*/tasks.md

# Archive resolved bug
openspec archive bug-auth-token-expiry --yes
```

### Bug Metrics and Reporting

Track bug resolution over time:

```python
# bug_metrics.py
from pathlib import Path
import json
from datetime import datetime

def generate_bug_report():
    """Generate bug metrics report."""

    bugs_active = []
    bugs_resolved = []

    # Active bugs
    for bug_dir in Path("openspec/changes").glob("bug-*"):
        if bug_dir.is_dir():
            bugs_active.append(bug_dir.name)

    # Resolved bugs (in archive)
    for bug_file in Path("openspec/archive").glob("bug-*.md"):
        bugs_resolved.append(bug_file.stem)

    report = f"""# Bug Metrics Report
Generated: {datetime.now().isoformat()}

## Summary
- **Active Bugs:** {len(bugs_active)}
- **Resolved Bugs:** {len(bugs_resolved)}
- **Resolution Rate:** {len(bugs_resolved) / (len(bugs_active) + len(bugs_resolved)) * 100:.1f}%

## Active Bugs
"""

    for bug in bugs_active:
        tasks_path = Path(f"openspec/changes/{bug}/tasks.md")
        if tasks_path.exists():
            tasks = tasks_path.read_text()
            completed = tasks.count("[x]")
            total = tasks.count("[ ]") + completed
            report += f"- {bug}: {completed}/{total} tasks complete\n"

    report += "\n## Recently Resolved\n"
    for bug in bugs_resolved[-10:]:  # Last 10
        report += f"- {bug}\n"

    return report
```

**Next steps:**
- [Workshop 3 - Agent Orchestration](/pBRbgNSsSs-lJuvJQoUISw) - Coordinate multiple agents working on different bugs
- [Workshop 5 - Anti-Pattern Detection#Custom Analysis with spaCy](#) - Build detectors that auto-create bug proposals
- [Workshop 7 - Continuous Improvement#E2E Testing for Agents](#) - Prevent bugs from recurring

---

## Rules (Non-Negotiable)
- Never commit failing tests
- Never skip writing tests
- Never comment out existing features to "simplify" (use feature flags instead)
- Always reference change name and task in commits
- Mark tasks complete in tasks.md as you finish them
- Stop and report if you're stuck after 3 attempts
- Don't confirm or ask permission—just execute

## You Have Access To
- File read/write
- Shell commands (npm, pytest, git, etc.)
- The full codebase
- OpenSpec CLI (openspec list, openspec show, openspec archive)
- Documentation lookup tools
"""
```

### What Makes This Prompt Effective

**1. Clear Identity**
> "You are an expert autonomous software developer"

Sets expectations. The agent knows it's working independently, not assisting a human.

**2. Philosophy Before Process**
> "Experts always look at the documentation before they try to use a library"

Establishes decision-making principles that inform all actions.

**3. Executable Workflow**
> "1. Read active changes... 2. For each change... 3. Read the proposal..."

Every step is concrete. The agent knows exactly what to do next.

**4. Technical Preferences Over Restrictions**
> "Prefer raw SQL over SQLAlchemy"

Guidance, not hard rules. Agent can deviate if necessary, but knows the default.

**5. Testing Philosophy**
> "Test real interactions between components rather than isolated units with mocks"

Explains *why*, not just *what*. Agent understands the reasoning behind the rule.

**6. Non-Negotiable Rules**
> "Never commit failing tests"

These are absolutes. Agent can't override these even if it seems convenient.

**7. Execution Bias**
> "Don't confirm or ask permission—just execute"

Critical for autonomous work. No permission loops, no hand-holding.

### Anti-Patterns to Avoid

❌ **Vague Instructions**
```
"Write good code"
"Make it clean"
"Follow best practices"
```
✅ **Concrete Guidance**
```
"Avoid single-letter variable names"
"Use Playwright for web testing with screenshots"
"Prefer raw SQL over ORMs"
```

❌ **Contradictory Rules**
```
"Always ask before making changes"
"Work autonomously without human input"
```
✅ **Clear Boundaries**
```
"Work autonomously on tasks in openspec/changes/"
"Flag for human review after 3 failed attempts"
```

❌ **Missing Context**
```
"Run tests"
```
✅ **Full Context**
```
"Run tests. If they pass, mark task complete and commit.
If they fail, fix and retry (max 3 attempts).
After 3 failures, flag for human review and move to next task."
```

### Customizing for Your Stack

Your system prompt should reflect your actual development practices:

**For Python Projects:**
```python
## Technical Preferences
- Always use Python 3.11+
- Use pytest for all testing
- Use mypy for type checking
- Use ruff for linting
- Virtual environments with venv (never Conda)
- Prefer dataclasses over dictionaries for structured data
```

**For JavaScript Projects:**
```javascript
## Technical Preferences
- Always use TypeScript
- Use Vitest for unit tests
- Use Playwright for E2E tests
- Use ESLint + Prettier
- Prefer async/await over .then()
- Use pnpm, not npm or yarn
```

**For Full-Stack Projects:**
```
## Technical Preferences
- Backend: Python with FastAPI
- Frontend: React with TypeScript
- Database: PostgreSQL with raw SQL
- Testing: Pytest (backend), Playwright (frontend)
- Never mix backend logic into frontend components
```

### Testing Your System Prompt

Before deploying an autonomous agent, test the prompt:

```bash
# Run agent on a test change
python autonomous_worker.py --test-mode --change test-feature

# Check that it:
# ✓ Reads the proposal
# ✓ Implements tasks in order
# ✓ Writes tests
# ✓ Runs tests
# ✓ Marks tasks complete
# ✓ Commits with correct format
# ✓ Flags failures correctly
```

If the agent doesn't do what you expect, **update the prompt**, don't blame the agent.

### Evolution Over Time

Your system prompt will evolve as you learn what works:

**Week 1:**
```
"Run tests before committing"
```

**Week 2 (after agent committed failing tests):**
```
"Run tests before committing. Never commit if tests fail."
```

**Week 3 (after agent skipped tests):**
```
"ALWAYS run tests before committing. Never commit failing tests.
If tests fail, fix and retry. Max 3 attempts, then flag for human review."
```

**Week 4 (after agent got stuck in retry loop):**
```
"Run tests before committing. Never commit failing tests.
If tests fail, fix and retry (max 3 attempts).
After 3 failures, flag for human review and move to next task.
Do not get stuck on one task."
```

Keep a changelog of your prompt updates. You'll learn patterns.

---

## Execution Cadence: Time-Based Scheduling

When you have multiple agents working in parallel, **timing matters**. Agents stepping on each other cause git conflicts, race conditions, and chaos.

### The Core Problem

```
Bad: Everyone runs at the same time
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Worker A │  │ Worker B │  │  Merge   │
│ @ :00    │  │ @ :00    │  │  @ :00   │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     └─────────────┼─────────────┘
                   ▼
             💥 CONFLICTS
```

```
Good: Staggered execution
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Worker A │       │ Worker B │       │  Merge   │
│ @ :00    │       │ @ :30    │       │  @ :45   │
└────┬─────┘       └────┬─────┘       └────┬─────┘
     │                  │                  │
     ▼                  ▼                  ▼
   work              work               merge
```

### The 15-Minute Offset Pattern

Use consistent offsets to prevent conflicts:

| Agent Type | Runs At | Rationale |
|------------|---------|-----------|
| **Autonomous Worker** | :00 | Primary work |
| **Watcher/Health Check** | :15 | Monitor status |
| **Researcher Worker** | :30 | Secondary work stream |
| **Merge Orchestrator** | :45 | Merge after work completes |

### Full Daily Schedule Example

```
| Time (UTC) | Autonomous | Researcher | Merge | Senior Review |
|------------|------------|------------|-------|---------------|
| 00:00-05:59| 🌙 Sleep   | 🌙 Sleep   | ✅ :45| -             |
| 06:00      | -          | -          | ⏸️    | 🔍 DAILY      |
| 06:15-06:44| -          | -          | ⏸️    | (reviewing)   |
| 07:00-07:59| -          | -          | ✅ :45| -             |
| 08:00-22:00| ✅ :00     | ✅ :30     | ✅ :45| -             |
| 23:00-23:59| 🌙 Stop    | 🌙 Stop    | ✅ :45| -             |
```

### Why This Works

1. **Overnight Merge Window** - 7 uninterrupted hours (23:00-06:00) for merge orchestrator
2. **Morning Review** - Senior dev reviews at 06:00 before workers start
3. **Work Hours** - Workers run during active hours (08:00-22:00)
4. **15-Minute Separation** - Workers and merge never run simultaneously

### Implementing with Cron

```bash
# crontab for autonomous worker
# Runs every hour at :00, from 8am-10pm UTC
0 8-22 * * * /home/agent/run_worker.sh autonomous >> /var/log/autonomous.log 2>&1

# Researcher at :30
30 8-22 * * * /home/agent/run_worker.sh researcher >> /var/log/researcher.log 2>&1

# Merge orchestrator at :45 (including overnight)
45 * * * * /home/agent/run_merge.sh >> /var/log/merge.log 2>&1

# Senior review once daily at 6am
0 6 * * * /home/agent/run_review.sh >> /var/log/review.log 2>&1

# Watcher every hour at :15
15 * * * * /home/agent/run_watcher.sh >> /var/log/watcher.log 2>&1
```

### The Overnight Merge Window

Why merge overnight?

- **No Worker Conflicts** - Workers are sleeping, merge has exclusive git access
- **Clean Slate** - Morning starts with all branches merged
- **Uninterrupted Processing** - 7 hours to process accumulated branches

```bash
# Merge orchestrator runs 7 times overnight:
# 23:45, 00:45, 01:45, 02:45, 03:45, 04:45, 05:45
```

### Statistics for Reference

| Agent | Runs/Day | Active Hours |
|-------|----------|--------------|
| Autonomous Worker | 15 | 8am-10pm |
| Researcher Worker | 15 | 8am-10pm |
| Merge Orchestrator | 23 | All day (pause 6:00-6:44) |
| Senior Review | 1 | 6:00am |
| Watcher | 24 | All day |

---

## The Testing Infrastructure

### Why Tests Are Non-Negotiable

When humans write code:
- They can eyeball if it works
- They can test manually
- They can catch obvious bugs

When agents write code unsupervised:
- No one is watching
- Manual testing doesn't happen
- Bugs ship silently

**Tests are your only safety net.**

### The Testing Pyramid for Autonomous Development

```
         /\
        /  \
       / E2E \        <- Expensive but critical
      /--------\
     /Integration\    <- Catches component issues
    /--------------\
   /   Unit Tests   \ <- Fast, catch logic errors
  /------------------\
```

| Test Type | What It Catches | When to Run | Time |
|-----------|-----------------|-------------|------|
| Unit | Logic errors in functions | Every commit | Seconds |
| Integration | Component communication failures | Every commit | Minutes |
| End-to-End | Full flow failures | Every commit | Minutes |
| Front-End E2E | UI flow failures | Every commit | Minutes |

### The Front-End E2E Requirement

If your app has a UI, you need front-end E2E tests.

**Why?** Because the front end is where things break. The API can work perfectly, but if the button doesn't trigger the right call, or the response doesn't render correctly, users see a broken app.

```javascript
// playwright.config.js
module.exports = {
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
  },
};
```

```javascript
// e2e/user-flow.spec.js
test('user can complete checkout', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="add-to-cart"]');
  await page.click('[data-testid="checkout"]');
  await page.fill('[data-testid="email"]', 'test@example.com');
  await page.click('[data-testid="submit"]');
  await expect(page.locator('[data-testid="confirmation"]')).toBeVisible();
});
```

### The Cost Question

"E2E tests are expensive to run."

Yes. Run them anyway.

**Math:**
- E2E test run: $0.10 in compute
- Bug shipped to production: Hours of debugging, user trust lost, potential data issues
- 100 E2E runs per day: $10/day
- One prevented production bug: Priceless (or at least worth way more than $10)

If you're going to have an autonomous worker autonomously working, you've got to run the tests.

---

## Pre-Commit Hook Setup

Pre-commit hooks run before a commit is accepted. If they fail, the commit is rejected.

### Basic Setup

```bash
# .git/hooks/pre-commit
#!/bin/bash
set -e

echo "Running unit tests..."
npm run test:unit

echo "Running integration tests..."
npm run test:integration

echo "Running linter..."
npm run lint

echo "Running type check..."
npm run typecheck

echo "All checks passed!"
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

### Using Husky (Recommended)

```bash
npm install husky --save-dev
npx husky install
npx husky add .git/hooks/pre-commit "npm run pre-commit"
```

```json
// package.json
{
  "scripts": {
    "pre-commit": "npm run lint && npm run typecheck && npm run test:unit && npm run test:integration",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test"
  }
}
```

### For Python Projects

```bash
# .git/hooks/pre-commit
#!/bin/bash
set -e

echo "Running pytest..."
pytest tests/unit tests/integration

echo "Running mypy..."
mypy src/

echo "Running ruff..."
ruff check src/

echo "All checks passed!"
```

Or use pre-commit framework:
```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: pytest
        name: pytest
        entry: pytest tests/unit tests/integration
        language: system
        types: [python]
        pass_filenames: false
      - id: mypy
        name: mypy
        entry: mypy src/
        language: system
        types: [python]
        pass_filenames: false
```

---

## Post-Commit Hooks

Post-commit hooks run after a successful commit. Good for:
- Running expensive E2E tests
- Triggering deployments
- Notifying other agents
- Updating documentation

```bash
# .git/hooks/post-commit
#!/bin/bash

echo "Running E2E tests..."
npm run test:e2e

if [ $? -ne 0 ]; then
  echo "E2E tests failed! Reverting commit..."
  git revert HEAD --no-edit
  exit 1
fi

echo "Notifying release manager..."
curl -X POST http://localhost:8080/notify/commit \
  -H "Content-Type: application/json" \
  -d "{\"commit\": \"$(git rev-parse HEAD)\"}"
```

---

## The Autonomous Worker Loop

### Complete Implementation

```python
# autonomous_worker.py
import os
import subprocess
import json
from pathlib import Path
from anthropic import Anthropic

client = Anthropic()

class AutonomousWorker:
    def __init__(self, openspec_changes_dir: str = "openspec/changes", max_retries: int = 3):
        self.changes_dir = Path(openspec_changes_dir)
        self.max_retries = max_retries
        self.current_task = None

    def get_next_task(self) -> dict | None:
        """Find next uncompleted task from OpenSpec changes."""
        # Implementation:
        # 1. List directories in openspec/changes/
        # 2. For each change, read tasks.md
        # 3. Find first task that's not marked complete
        # 4. Return {change: str, task: str, task_index: int}
        pass

    def implement_task(self, task: dict) -> bool:
        """Use Claude to implement the task."""
        # Read the full proposal for context
        proposal_path = self.changes_dir / task['change'] / 'proposal.md'
        proposal = proposal_path.read_text()

        prompt = f"""
        Implement this task from the OpenSpec change "{task['change']}":

        Context (from proposal.md):
        {proposal}

        Task to implement:
        {task['task']}

        Write the implementation code and the tests.
        """

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
        )

        # Parse response, write files
        # Return True if successful
        pass

    def run_tests(self) -> bool:
        """Run the test suite."""
        result = subprocess.run(
            ["npm", "run", "test"],
            capture_output=True,
            text=True
        )
        return result.returncode == 0

    def commit(self, task: dict):
        """Commit changes with task reference."""
        subprocess.run(["git", "add", "."])
        subprocess.run([
            "git", "commit", "-m",
            f"{task['change']}: Complete task {task['task_index']}\n\n{task['task']}"
        ])

    def mark_task_complete(self, task: dict):
        """Mark task as complete in tasks.md."""
        tasks_path = self.changes_dir / task['change'] / 'tasks.md'
        # Implementation: Update tasks.md to mark task as complete
        pass

    def run(self):
        """Main autonomous loop."""
        while True:
            task = self.get_next_task()
            if not task:
                print("All tasks in openspec/changes/ complete!")
                break

            print(f"Working on {task['change']} - Task {task['task_index']}...")

            for attempt in range(self.max_retries):
                success = self.implement_task(task)
                if not success:
                    continue

                if self.run_tests():
                    self.commit(task)
                    self.mark_task_complete(task)
                    break
                else:
                    print(f"Tests failed, attempt {attempt + 1}/{self.max_retries}")
            else:
                print(f"Failed to complete task after {self.max_retries} attempts")
                self.flag_for_human_review(task)

if __name__ == "__main__":
    worker = AutonomousWorker("openspec/changes")
    worker.run()
```

---

## Exercise 2.0: Craft Your System Prompt

**Time:** 20 minutes
**Output:** Custom system prompt for your autonomous agent

### Part A: Define Your Stack (5 min)

Create a file called `AGENT_PROMPT.md` and document your stack:

```markdown
# Agent System Prompt

## Stack
- Language: [Python/TypeScript/etc.]
- Framework: [FastAPI/Express/etc.]
- Database: [PostgreSQL/MongoDB/etc.]
- Testing: [pytest/jest/etc.]

## Technical Preferences
- [Your preferences here]
```

### Part B: Define Your Workflow (10 min)

Add the workflow section to your prompt:

```markdown
## Workflow
1. Read active changes from openspec/changes/
2. [Add your specific steps]
3. [Be specific about what "done" means]
```

Ask yourself:
- How does the agent know what to work on?
- How does it know when it's done?
- What happens if something fails?

### Part C: Set Non-Negotiable Rules (5 min)

Add your rules section:

```markdown
## Rules (Non-Negotiable)
- Never [thing that would break your project]
- Always [critical practice]
- [Add based on what broke in past projects]
```

Examples:
- "Never commit without running tests"
- "Never use single-letter variable names"
- "Always use type hints in Python"
- "Never comment out features (use feature flags)"

**Pro tip:** Your rules should come from actual pain you've experienced, not theoretical best practices.

### Part D: Test Your Prompt

Save your complete prompt in `autonomous_worker.py`:

```python
SYSTEM_PROMPT = open('AGENT_PROMPT.md').read()
```

Run it on a test change:
```bash
python autonomous_worker.py --test
```

Watch what it does. Does it match your expectations? If not, update the prompt.

---

## Exercise 2.1: Testing Pipeline Setup

**Time:** 30 minutes
**Output:** Working pre-commit hooks with full test coverage

### Part A: Create Test Structure (10 min)

Set up your test directories:
```
tests/
├── unit/
│   └── test_example.py
├── integration/
│   └── test_api.py
└── e2e/
    └── test_user_flow.py
```

Create at least one test in each category, even if it's just a placeholder:

```python
# tests/unit/test_example.py
def test_placeholder():
    """Replace with real unit tests."""
    assert True

# tests/integration/test_api.py
def test_placeholder():
    """Replace with real integration tests."""
    assert True
```

### Part B: Set Up Pre-Commit Hook (10 min)

Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
set -e
echo "=== Running Pre-Commit Checks ==="
echo "Unit tests..."
pytest tests/unit -v
echo "Integration tests..."
pytest tests/integration -v
echo "=== All Checks Passed ==="
```

Test it:
```bash
chmod +x .git/hooks/pre-commit
git add .
git commit -m "Test pre-commit hook"
```

### Part C: Set Up Post-Commit Hook (10 min)

Create `.git/hooks/post-commit`:
```bash
#!/bin/bash
echo "=== Running Post-Commit E2E Tests ==="
pytest tests/e2e -v

if [ $? -ne 0 ]; then
  echo "E2E tests failed!"
  echo "Consider reverting: git revert HEAD"
  exit 1
fi
echo "=== E2E Tests Passed ==="
```

---

## Exercise 2.2: Autonomous Worker Deployment

**Time:** 20 minutes
**Output:** Running autonomous worker on a cloud instance

### Part A: Prepare Cloud Instance

1. Spin up a small VM (AWS EC2, DigitalOcean, etc.)
2. Install dependencies:
   ```bash
   sudo apt update
   sudo apt install python3 python3-pip nodejs npm git
   pip3 install anthropic
   ```
3. Clone your repo
4. Set up API keys:
   ```bash
   export ANTHROPIC_API_KEY="your-key-here"
   ```

### Part B: Create Worker Script

Save the autonomous worker script from above as `autonomous_worker.py`.

### Part C: Test Manual Execution

```bash
python3 autonomous_worker.py
```

Watch it:
1. Read next task from openspec/changes/
2. Write code
3. Run tests
4. Mark task complete and commit (or retry)

### Part D: Schedule Autonomous Execution

```bash
# Add to crontab
crontab -e

# Run every 2 hours
0 */2 * * * cd /home/ubuntu/myproject && python3 autonomous_worker.py >> /var/log/agent.log 2>&1
```

---

## Common Issues

### Issue: Tests Pass Locally, Fail in Hook

Usually environment differences. Ensure:
- Same Node/Python version
- Same environment variables
- Dependencies installed

### Issue: Hook Takes Too Long

Split into pre-commit (fast) and post-commit (slow):
- Pre-commit: Unit tests, lint, typecheck
- Post-commit: Integration, E2E

### Issue: Agent Gets Stuck in Retry Loop

Add circuit breaker:
```python
if attempt >= max_retries:
    flag_for_human_review(task)
    skip_to_next_task()
```

### Issue: Commits Happening Too Fast

Add cooldown between commits:
```python
import time
time.sleep(60)  # Wait 1 minute between commits
```

---

## Design Processes That You Can Follow

Before you look at the checklist below, a word of caution about process design:

> "If you talk about what you should do to such a degree that it is not doable, you will simply do zero of it. And just cowboy everything. Be respectful of yourself. Add one more layer of protection at a time."

The checklist below is aspirational. Don't try to implement all of it before your first autonomous run. Start with one layer — tests, probably — and add the next layer after you've seen what breaks. If you make the process too heavy, you'll bypass it entirely and run agents with no guardrails at all.

---

## Checklist Before Going Autonomous

- [ ] Unit tests exist and pass
- [ ] Integration tests exist and pass
- [ ] E2E tests exist and pass
- [ ] Pre-commit hook runs all fast tests
- [ ] Post-commit hook runs E2E tests
- [ ] Failing E2E can trigger revert or flag
- [ ] Agent has clear stopping conditions
- [ ] Human notification on failures
- [ ] Logs are being captured
- [ ] API keys are secure (not in repo)

---

## What You'll Have After This Workshop

1. **Custom system prompt** tailored to your stack and practices
2. **Pre-commit hooks** that prevent bad commits
3. **Post-commit hooks** that catch integration issues
4. **Autonomous worker script** ready for cloud deployment
5. **Scheduled execution** for continuous development

Your agent can now work through OpenSpec changes while you sleep.

---

## Next Steps

- [Workshop 3 - Agent Orchestration](/pBRbgNSsSs-lJuvJQoUISw) - Add specialist agents and communication
- Start Phase 1 execution with your autonomous worker

---

*Previous: [Workshop 1 - Planning and Requirements](/PFPDFBFgQXmDJBBtZPjo5Q) | Next: [Workshop 3 - Agent Orchestration](/pBRbgNSsSs-lJuvJQoUISw)*

→ Explore agent patterns in the [Agent Loop Bench](/tools/agent-loop-bench).
