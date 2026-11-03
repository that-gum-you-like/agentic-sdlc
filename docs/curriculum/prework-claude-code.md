# Pre-work: Environment Setup with Claude Code

**Complete this AT LEAST 2 DAYS BEFORE the workshop session.**

⏱️ **Time Required:** 20-30 minutes

## What's Required

**REQUIRED (Do this 2+ days before class):**
- Install Claude Code with $100/month subscription
- Install OpenSpec for spec-driven development
- Come prepared with a project idea (see below)
- Watch the 10-minute course overview video (link below)

**If you complete early:** Try the optional OpenSpec practice exercise at the end.

---

## Course Overview: What You'll Build Today

**Watch this 10-minute overview before class:** [Overview Video - Coming Soon]

### The Big Picture

```
Morning: Planning & Single Agent        Afternoon: Multi-Agent Teams
┌─────────────────────────────────┐    ┌──────────────────────────────┐
│                                 │    │                              │
│  Your Idea                      │    │   Specialist Agents          │
│      ↓                          │    │   ┌──────┐  ┌──────┐        │
│  Requirements.md                │    │   │Backend│  │Frontend│      │
│      ↓                          │    │   └───┬──┘  └───┬──┘        │
│  Roadmap with OpenSpec          │    │       │         │            │
│      ↓                          │    │       └────┬────┘            │
│  Autonomous Worker              │    │            │                 │
│  (builds while you sleep)       │    │      Task Files              │
│                                 │    │         Matrix               │
│                                 │    │                              │
└─────────────────────────────────┘    └──────────────────────────────┘
```

### What You'll Learn

**Morning (Hours 1-3):**
1. Turn your idea into structured requirements
2. Generate implementation roadmap with OpenSpec
3. Set up autonomous worker with testing pipeline

**Afternoon (Hours 4-7):**
4. Add specialist agents (backend, frontend, etc.)
5. Coordinate agents with task files and Matrix
6. Merge strategies and continuous improvement

### What You'll Have at the End

- ✅ Working autonomous agent that implements features while you're offline
- ✅ Multi-agent system with specialist roles
- ✅ Full testing pipeline (no code ships without passing tests)
- ✅ Infrastructure you can use on real projects Monday morning

---

## Bring a Project Idea

**You MUST come to class with a project idea.** This can be:
- A side project you've been wanting to build
- A work project you need to implement
- An improvement to existing software
- A learning project (e.g., "build a clone of X")

**Good examples:**
- "Build a personal finance tracker"
- "Add real-time notifications to my SaaS app"
- "Create a CLI tool for managing my dotfiles"

**Bad examples:**
- "Learn to code" (too vague)
- "Build the next Facebook" (too ambitious for one day)

**Don't have an idea?** Use this template: "Build a [CRUD app] for [domain I know]"
- Example: "Build a recipe manager for my cooking blog"
- Example: "Build a workout tracker for my gym routine"

---

## Recommended Tech Stack

**Use whatever you're most comfortable with.** The concepts work with any stack.

### Our Recommendations

**If you're choosing between options:**
- **Language:** TypeScript or Python
- **Backend:** FastAPI (Python) or Express (TypeScript/Node)
- **Frontend:** React (TypeScript) or htmx (any backend)
- **Database:** PostgreSQL or SQLite
- **Testing:** pytest (Python) or Vitest (TypeScript)

**But seriously:** Use your favorite stack. The agents work with anything.

### Tech Stack Decision Rule

**Choose based on:**
1. **What you already know** - Don't learn a new stack today
2. **What your project needs** - If it's a CLI tool, you don't need React
3. **What you want to learn** - If you're here to learn, pick something new

**Avoid choosing based on:**
- ❌ "What's most popular"
- ❌ "What the instructor uses"
- ❌ "What seems most impressive"

Your agents will be equally effective with any choice.

---

## Part 1: Install Claude Code and Subscribe

### Step 1: Install Claude Code CLI

Visit the Claude Code installation page and follow the instructions for your operating system:
- **Installation Guide:** https://docs.anthropic.com/claude-code/installation

After installation, verify it works:
```bash
claude --version
```

### Step 2: Get the Claude Code Subscription

> **CRITICAL: You MUST subscribe to Claude Code Pro ($100/month) for this course.**

**Why the subscription is required:**
- **API tokens run out in ~30 minutes** of active development
- The workshop involves substantial code generation and iteration
- Students using API credits consistently run out during the first session
- The subscription provides unlimited usage for focused development work

**To subscribe:**
1. Visit https://claude.ai/code
2. Sign in with your Anthropic account
3. Subscribe to Claude Code Pro ($100/month)
4. Authenticate your local CLI with your subscription

**Verify subscription:**
```bash
claude auth status
```

You should see your subscription status showing "Pro" or "Unlimited" usage.

**Budget Note:** If $100/month is outside your budget, talk to the instructor about:
- Student discounts or waivers
- Shared accounts for the workshop duration
- Alternative arrangements

**Do NOT proceed without a subscription** - you will run out of tokens in the first 30 minutes and fall behind.

---

## Part 2: Install OpenSpec

**What is OpenSpec?**

[OpenSpec](https://openspec.dev) is a lightweight, open-source CLI framework for spec-driven development with AI coding assistants. It serves as a universal planning layer that maintains functional specifications alongside your code.

Instead of relying on chat-based planning that disappears after each session, OpenSpec creates persistent, shareable specifications that live in your codebase. This is what you'll use throughout the workshop to structure requirements and implementation plans.

**Learn more:** [OpenSpec.dev](https://openspec.dev) | [GitHub](https://github.com/Fission-AI/OpenSpec)

### Step 1: Install OpenSpec CLI

Ask Claude Code to install OpenSpec:

```bash
claude
```

Then:
```
I need to install OpenSpec for spec-driven development. Can you:

1. Install OpenSpec globally: npm install -g @fission-ai/openspec@latest
2. Verify it installed with: openspec --version
3. Explain what OpenSpec does
```

**Checkpoint:** You should see a version number when you run `openspec --version`

### Step 2: Create a Test Project Directory

Create a directory for testing OpenSpec:

```bash
mkdir ~/agentic-sdlc-test
cd ~/agentic-sdlc-test
```

### Step 3: Initialize OpenSpec

```
Now let's initialize OpenSpec in this project:

1. Run: openspec init
2. When prompted, select "Claude Code" as the AI tool
3. Show me the generated directory structure
4. Explain what files were created
```

**What gets created:**
```
openspec/
├── specs/          # Source of truth specs
├── changes/        # Proposed changes (empty for now)
├── archive/        # Completed changes (empty for now)
├── project.md      # Project context
└── AGENTS.md       # Workflow instructions
```

**Checkpoint:** You should have an `openspec/` directory and `openspec/AGENTS.md` file

---

## Part 3: Understand the OpenSpec Workflow

The OpenSpec workflow is what you'll use all day in the workshop:

```
┌─────────────────────────────────────────────┐
│  1. PROPOSAL                                │
│  Describe what you want to build            │
│  "I need to add user authentication"        │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  2. PLAN                                    │
│  Generate:                                  │
│  - Technical design decisions               │
│  - Implementation tasks (broken down)       │
│  - What will change (spec deltas)           │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  3. REVIEW                                  │
│  Refine the plan BEFORE coding              │
│  Catch misalignment early                   │
│  Ask: Did we miss anything?                 │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  4. IMPLEMENT                               │
│  Execute the tasks with full context        │
│  Build what you planned                     │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  5. VERIFY & ARCHIVE                        │
│  Test it works                              │
│  Archive the change (living documentation)  │
└──────────────┬──────────────────────────────┘
               │
               └──────► Loop back for next feature
```

### Why This Process?

**Without it:**
- Start coding immediately without understanding requirements
- Realize halfway through you misunderstood the goal
- Rewrite everything
- Waste tokens and time

**With it:**
- Spend 20% of time in proposal + planning
- Catch misalignment before coding
- Implement once, correctly
- Specs survive as living documentation

---

## Part 4: Optional Practice Exercise

**If you have extra time**, practice the OpenSpec workflow with a simple example.

### Create a Simple Feature Proposal

Ask Claude Code:
```
Create an OpenSpec change proposal for adding a "hello world" CLI tool.

The change should:
- Create a simple Python/Node.js CLI that prints "Hello, [name]!"
- Accept name as a command-line argument
- Have basic error handling

Create the proposal in OpenSpec format:
- openspec/changes/hello-cli/proposal.md
- openspec/changes/hello-cli/tasks.md
```

### Review the Generated Files

```
Let's review what was generated:

1. Run: openspec show hello-cli
2. Read through proposal.md - does it make sense?
3. Check tasks.md - are tasks well broken down?
4. Could we improve the plan?
```

### Implement (Optional)

If you want to complete the loop:
```
Let's implement following the tasks in openspec/changes/hello-cli/tasks.md
```

### Archive (Optional)

```
Once implemented and tested:
openspec archive hello-cli --yes
```

**This is just practice** - we'll do this workflow many times in the workshop!

---

## What You Should Have When Done

**Required:**
- ✅ Claude Code Pro subscription ($100/month) installed and verified
- ✅ OpenSpec CLI installed (`openspec --version` works)
- ✅ Test project with OpenSpec initialized
- ✅ Project idea ready for the workshop

**Optional (if you did the practice):**
- ✅ Understanding of Proposal → Plan → Implement → Verify loop
- ✅ Example change archived in `openspec/archive/`

---

## Common Issues and Solutions

### Issue: Subscription not recognized

**Solution:**
```
Can you check my Claude Code subscription status?
If it's not showing Pro/Unlimited, help me troubleshoot authentication.
```

### Issue: Claude Code can't install packages

**Solution:** Ask Claude Code to check if you have the necessary permissions and suggest alternatives.

### Issue: OpenSpec CLI not found

**Solution:** Ask Claude Code:
```
OpenSpec CLI isn't found. Can you:
1. Check if npm is installed
2. Install OpenSpec globally
3. Verify the installation
```

### Issue: "I don't know what to prompt"

**Solution:** Start with: "I'm trying to [goal]. What do you need to know to help me with this?"

---

## Why This Matters for the Course

### You'll Use OpenSpec All Day

In the workshop, we'll use OpenSpec for every feature:
- Proposal → review → implement → verify (over and over)
- Structured proposals + tasks in standard format
- Everything organized in `openspec/changes/[project]/`
- Repeatable workflow across all projects

### The Core Mindset Shift

You've just experienced **the mindset of Agentic SDLC:**

> **You shouldn't be doing manual setup. AI should be doing it.**

> **Start with conversation, not specs. Then formalize your understanding.**

Instead of following step-by-step technical instructions, you describe what you need and let Claude Code figure out the implementation.

This works because:
1. **Conversation is cheaper** - Iterate in natural language before committing to structure
2. **AI asks clarifying questions** - You discover gaps through dialogue
3. **Formalization captures agreement** - OpenSpec locks down what you decided
4. **Implementation references specs** - AI builds what you formalized

---

## Getting Help

If you get stuck:

1. **Ask Claude Code for help** - Seriously. Describe the problem and ask for debugging steps.
2. **Check the Claude Code documentation** - https://docs.anthropic.com/claude-code
3. **Bring questions to the workshop** - We'll start by reviewing setups

---

## Next Steps

Once you've completed this pre-work, you're ready for:

- **Workshop 1: Planning & Requirements** - Brain dump to implementation roadmap
- **Workshop 2: Autonomous Workers** - Your first unsupervised agent
- **Workshop 3: Agent Orchestration** - Multi-agent coordination

See you in the workshop!

---

*Estimated time: 20-30 minutes*
*Prerequisites: Basic command line familiarity*
