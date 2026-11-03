

# Agentic SDLC Course Summary

## Overview
A 7-workshop course on building software with autonomous AI agent teams, teaching a conversation-first, spec-driven development process.

## The 7 Workshops

| # | Workshop | Focus |
|---|----------|-------|
| 1 | **Planning & Requirements** | Brain dump → OpenSpec formalization → business value analysis → implementation tasks |
| 2 | **Autonomous Workers** | TDD for agents, pre-commit hooks, testing infrastructure, cost/security |
| 3 | **Agent Orchestration** | Specialist agents, queue drainer pattern, agent communication (Matrix + files) |
| 4 | **Release Management** | Priority queues, release manager agent, scaling patterns, review/documentation agents |
| 5 | **Anti-Pattern Detection** | Senior developer checklist, static analysis, custom analyzers with spaCy |
| 6 | **Agent Memory & Evolution** | Memory systems, self-correction, agent character sheets, turn-based systems |
| 7 | **Continuous Improvement** | Improvement loops, TDD for agent behavior, E2E testing with Playwright |

## Key Tools
- **Claude Code** — CLI with routines, skills, subagents, hooks
- **OpenSpec/Superpowers** — spec-driven development
- **Ori on OpenRouter** — multi-model orchestration
- **Endor Labs** — dependency/security review
- **REA** — reverse engineer existing software

## Course Structure
- **Pre-work**: 34-section setup guide (complete before class)
- **Day Companion**: Live tracking page (open in second tab)
- **11+ Recordings**: Full sessions with topic index
- **Troubleshooting**: Agent, coordination, testing, cost issues
- **Case Studies**: 3 real failures and fixes

## Core Philosophy
- Process over technique
- File-based task coordination
- Memory creates agent characters
- Design interfaces first
- Parallelize thoughtfully

## Post-Course Path
Week 1 (stabilization) → Month 1 (maturity) → Ongoing improvement loop with agent versioning

# Agentic SDLC Course Summary

## Overview
A 7-workshop course on building software with autonomous AI agent teams, teaching a conversation-first, spec-driven development process.

## The 7 Workshops

| # | Workshop | Focus |
|---|----------|-------|
| 1 | **Planning & Requirements** | Brain dump → OpenSpec formalization → business value analysis → implementation tasks |
| 2 | **Autonomous Workers** | TDD for agents, pre-commit hooks, testing infrastructure, cost/security |
| 3 | **Agent Orchestration** | Specialist agents, queue drainer pattern, agent communication (Matrix + files) |
| 4 | **Release Management** | Priority queues, release manager agent, scaling patterns, review/documentation agents |
| 5 | **Anti-Pattern Detection** | Senior developer checklist, static analysis, custom analyzers with spaCy |
| 6 | **Agent Memory & Evolution** | Memory systems, self-correction, agent character sheets, turn-based systems |
| 7 | **Continuous Improvement** | Improvement loops, TDD for agent behavior, E2E testing with Playwright |

## Key Tools
- **Claude Code** — CLI with routines, skills, subagents, hooks
- **OpenSpec/Superpowers** — spec-driven development
- **Ori on OpenRouter** — multi-model orchestration
- **Endor Labs** — dependency/security review
- **REA** — reverse engineer existing software

## Course Structure
- **Pre-work**: 34-section setup guide (complete before class)
- **Day Companion**: Live tracking page (open in second tab)
- **11+ Recordings**: Full sessions with topic index
- **Troubleshooting**: Agent, coordination, testing, cost issues
- **Case Studies**: 3 real failures and fixes

## Core Philosophy
- Process over technique
- File-based task coordination
- Memory creates agent characters
- Design interfaces first
- Parallelize thoughtfully

## Post-Course Path
Week 1 (stabilization) → Month 1 (maturity) → Ongoing improvement loop with agent versioning

# Agentic SDLC Course Summary

## Overview
A 7-workshop course on building software with autonomous AI agent teams, teaching a conversation-first, spec-driven development process.

## The 7 Workshops

| # | Workshop | Focus |
|---|----------|-------|
| 1 | **Planning & Requirements** | Brain dump → OpenSpec formalization → business value analysis → implementation tasks |
| 2 | **Autonomous Workers** | TDD for agents, pre-commit hooks, testing infrastructure, cost/security |
| 3 | **Agent Orchestration** | Specialist agents, queue drainer pattern, agent communication (Matrix + files) |
| 4 | **Release Management** | Priority queues, release manager agent, scaling patterns, review/documentation agents |
| 5 | **Anti-Pattern Detection** | Senior developer checklist, static analysis, custom analyzers with spaCy |
| 6 | **Agent Memory & Evolution** | Memory systems, self-correction, agent character sheets, turn-based systems |
| 7 | **Continuous Improvement** | Improvement loops, TDD for agent behavior, E2E testing with Playwright |

## Key Tools
- **Claude Code** — CLI with routines, skills, subagents, hooks
- **OpenSpec/Superpowers** — spec-driven development
- **Ori on OpenRouter** — multi-model orchestration
- **Endor Labs** — dependency/security review
- **REA** — reverse engineer existing software

## Course Structure
- **Pre-work**: 34-section setup guide (complete before class)
- **Day Companion**: Live tracking page (open in second tab)
- **11+ Recordings**: Full sessions with topic index
- **Troubleshooting**: Agent, coordination, testing, cost issues
- **Case Studies**: 3 real failures and fixes

## Core Philosophy
- Process over technique
- File-based task coordination
- Memory creates agent characters
- Design interfaces first
- Parallelize thoughtfully

## Post-Course Path
Week 1 (stabilization) → Month 1 (maturity) → Ongoing improvement loop with agent versioning# Agentic SDLC: Building Software with AI Teams

<!-- toc:auto -->

## Contents

*Do the pre-work before class day — students who skip it spend the first hour troubleshooting instead of learning. The running order is on the Day Companion, which is the current one; the sections here are the written material.*

**START HERE**

- [Before You Start: Complete the Pre-work](#Before-You-Start-Complete-the-Pre-work)  — do this before class day — the linked sub-note is a 34-section setup guide
  - [Pre-work Assignment](#Pre-work-Assignment)
  - [Verify Your Setup (Day 1 of Workshop)](#Verify-Your-Setup-Day-1-of-Workshop)
  - [What You Should Have](#What-You-Should-Have)
  - [Understanding the Taxonomy: Skills, Tools, Plugins, Commands](#Understanding-the-Taxonomy-Skills-Tools-Plugins-Commands)
- [▶ Before you arrive](#▶-Before-you-arrive)  — two-minute survey; it decides which of three levels you get taught at
- [➡️ Open the Day Companion](#➡️-Open-the-Day-Companion)  — live during-class page — keep it in a second tab. WARNING: this heading is inside a blockquote; verify the TOC tool emits it
- [Tools we use in this class](#Tools-we-use-in-this-class)

**WATCH**

- [▶ Recordings](#▶-Recordings)  — 11 recordings with a topic index, in a separate note
- [More recordings for this class](#More-recordings-for-this-class)  · 1 recording  — 1 recording in the linked pages
- [From the 2024 Agent Chat room series](#From-the-2024-Agent-Chatroom-series)  — planning, sizing and live merge-conflict resolution from an older cohort

**WHY THE COURSE IS SHAPED THIS WAY**

- [Course Overview](#Course-Overview)
- [What Makes This Different](#What-Makes-This-Different)
- [⚠️ Critical Warning: The Diarrhea Phase](#⚠️-Critical-Warning-The-Diarrhea-Phase)  — read before you start — pacing and scope, not technique
- [The Journey: From Idea to Autonomous Team](#The-Journey-From-Idea-to-Autonomous-Team)
  - [Phase Overview](#Phase-Overview)
  - [The Maturity Model](#The-Maturity-Model)
  - [Iteration Cycles](#Iteration-Cycles)
  - [The Improvement Spiral](#The-Improvement-Spiral)
- [The seven workshops](#The-seven-workshops)  — what each of the seven sessions covers, with slides and the full written workshop

**THE DAY, HOUR BY HOUR**

- [Planning & Requirements](#Planning-amp-Requirements)  — 10 recordings in the linked pages
  - [Learning Objectives](#Learning-Objectives)
  - [The Conversation-First Process](#The-Conversation-First-Process)
    - [Step 1: The Brain Dump Conversation](#Step-1-The-Brain-Dump-Conversation)
    - [Step 2: Formalize with OpenSpec](#Step-2-Formalize-with-OpenSpec)
    - [Step 3: Review and Refine the Proposal](#Step-3-Review-and-Refine-the-Proposal)
    - [Step 4: Business Value Analysis](#Step-4-Business-Value-Analysis)
    - [Step 5: Create Implementation Tasks](#Step-5-Create-Implementation-Tasks)
    - [Step 6: Verify OpenSpec Structure](#Step-6-Verify-OpenSpec-Structure)
  - [The OpenSpec Advantage](#The-OpenSpec-Advantage)
  - [Reporting and Visibility](#Reporting-and-Visibility)
  - [Exercise 1.1: Requirements Workshop](#Exercise-11-Requirements-Workshop)
- [Autonomous Workers](#Autonomous-Workers)  — 3 recordings in the linked pages
  - [Learning Objectives](#Learning-Objectives1)
  - [File-Based Task Coordination](#File-Based-Task-Coordination)
  - [The Autonomous Worker Pattern](#The-Autonomous-Worker-Pattern)
  - [Testing Infrastructure (Non-Negotiable)](#Testing-Infrastructure-Non-Negotiable)
  - [Pre-Commit Hook Setup](#Pre-Commit-Hook-Setup)
  - [The Cost Question](#The-Cost-Question)
  - [Exercise 2.1: Testing Pipeline](#Exercise-21-Testing-Pipeline)
- [Agent Orchestration](#Agent-Orchestration)  — 4 recordings in the linked pages
  - [Learning Objectives](#Learning-Objectives2)
  - [LLM-Friendly Style Guide](#LLM-Friendly-Style-Guide)
  - [Creating Specialist Agents](#Creating-Specialist-Agents)
  - [Queue Drainer Pattern](#Queue-Drainer-Pattern)
  - [Agent Communication (Matrix + Files)](#Agent-Communication-Matrix--Files)
  - [Exercise 3.1: Multi-Agent Setup](#Exercise-31-Multi-Agent-Setup)
- [Release Management & Scaling](#Release-Management-amp-Scaling)  — 2 recordings in the linked pages
  - [Learning Objectives](#Learning-Objectives3)
  - [Priority Queue System](#Priority-Queue-System)
  - [The Release Manager Agent](#The-Release-Manager-Agent)
  - [When to Parallelize](#When-to-Parallelize)
  - [Scaling Pattern](#Scaling-Pattern)
  - [Chat Channels for Coordination](#Chat-Channels-for-Coordination)
  - [Review Agent](#Review-Agent)
  - [Documentation Agent](#Documentation-Agent)
  - [Exercise 4.1: Release Pipeline](#Exercise-41-Release-Pipeline)
- [Anti-Pattern Detection](#Anti-Pattern-Detection)  — 3 recordings in the linked pages
  - [Learning Objectives](#Learning-Objectives4)
  - [The Anti-Pattern Problem](#The-Anti-Pattern-Problem)
  - [Naming the Problem](#Naming-the-Problem)
  - [The Senior Developer Checklist](#The-Senior-Developer-Checklist)
  - [Post-Commit Hook: Senior Review](#Post-Commit-Hook-Senior-Review)
  - [Static Analysis Tools](#Static-Analysis-Tools)
  - [Building Custom Analyzers with spaCy](#Building-Custom-Analyzers-with-spaCy)
  - [Exercise 5.1: Anti-Pattern Hook](#Exercise-51-Anti-Pattern-Hook)
- [Agent Memory & Evolution](#Agent-Memory-amp-Evolution)  — 1 recording in the linked pages
  - [Learning Objectives](#Learning-Objectives5)
  - [The Citation Crisis (A Story)](#The-Citation-Crisis-A-Story)
  - [Memory Creates Self-Correction](#Memory-Creates-Self-Correction)
  - [When to Create New Agents](#When-to-Create-New-Agents)
  - [Agent Evolution Framework](#Agent-Evolution-Framework)
  - [The Turn-Based System Revisited](#The-Turn-Based-System-Revisited)
  - [Exercise 6.1: Agent Character Sheet](#Exercise-61-Agent-Character-Sheet)
- [Continuous Improvement](#Continuous-Improvement)
  - [Learning Objectives](#Learning-Objectives6)
  - [The Improvement Loop](#The-Improvement-Loop)
  - [TDD for Agents](#TDD-for-Agents)
  - [E2E Testing Philosophy](#E2E-Testing-Philosophy)
  - [Mobile Workflow](#Mobile-Workflow)
  - [Exercise 7.1: Pattern Hunt](#Exercise-71-Pattern-Hunt)
- [Workshop Materials](#Workshop-Materials)  — the full written version of each hour, with all the code
  - [Workshop 1 - Planning and Requirements](#Workshop-1---Planning-and-Requirements)
  - [Workshop 2 - Autonomous Workers](#Workshop-2---Autonomous-Workers)
  - [Workshop 3 - Agent Orchestration](#Workshop-3---Agent-Orchestration)
  - [Workshop 4 - Release Management](#Workshop-4---Release-Management)
  - [Workshop 5 - Anti-Pattern Detection](#Workshop-5---Anti-Pattern-Detection)
  - [Workshop 6 - Agent Memory and Evolution](#Workshop-6---Agent-Memory-and-Evolution)
  - [Workshop 7 - Continuous Improvement](#Workshop-7---Continuous-Improvement)
  - [Follow-Up Reading](#Follow-Up-Reading)
- [Course Schedule](#Course-Schedule)  — what maps to which block on the day
  - [Pre-work (Complete Before Workshop)](#Pre-work-Complete-Before-Workshop)
  - [The hours themselves](#The-hours-themselves)  — the running order lives on the Day Companion, which stays current

**WHEN IT GOES WRONG**

- [Troubleshooting Guide](#Troubleshooting-Guide)
  - [Agent Issues](#Agent-Issues)
  - [Coordination Issues](#Coordination-Issues)
  - [Testing Issues](#Testing-Issues)
  - [Cost Issues](#Cost-Issues)
  - [Recovery Patterns](#Recovery-Patterns)
- [Case Studies](#Case-Studies)  — three real failures and what the process change was
  - [Case Study 1: The Citation Crisis](#Case-Study-1-The-Citation-Crisis)
  - [Case Study 2: The NaN Fallback Disaster](#Case-Study-2-The-NaN-Fallback-Disaster)
  - [Case Study 3: The 150 Math.random() Problem](#Case-Study-3-The-150-Mathrandom-Problem)
- [Cost Tracking & Budgets](#Cost-Tracking-amp-Budgets)
  - [Token Usage by Task Type](#Token-Usage-by-Task-Type)
  - [Budget Strategies](#Budget-Strategies)
  - [Monitoring](#Monitoring)

**AFTER THE DAY**

- [After the Workshop](#After-the-Workshop)
  - [Day 2: First Real Run](#Day-2-First-Real-Run)
  - [Week 1: Stabilization](#Week-1-Stabilization)
  - [Week 2: Expansion](#Week-2-Expansion)
  - [Month 1: Maturity](#Month-1-Maturity)
  - [Ongoing: The Improvement Loop](#Ongoing-The-Improvement-Loop)
- [Immediate Next Steps](#Immediate-Next-Steps)  — OVERLAPS ‘After the Workshop’ — a second, different Week 1 / Month 1 list
  - [Week 1](#Week-1)
  - [Month 1](#Month-1)
- [Agent Versioning](#Agent-Versioning)
  - [Why Version Agents](#Why-Version-Agents)
  - [Versioning Pattern](#Versioning-Pattern)
  - [Memory Migration](#Memory-Migration)

**REFERENCE**

- [Key Takeaways](#Key-Takeaways)
  - [Process is Everything](#Process-is-Everything)
  - [Parallelize Thoughtfully](#Parallelize-Thoughtfully)
  - [Memory Makes Characters](#Memory-Makes-Characters)
  - [Design Interfaces First](#Design-Interfaces-First)
- [Reference Architecture](#Reference-Architecture)  — one diagram of the whole stack, human layer down to workers
- [Tools & Resources](#Tools-amp-Resources)
  - [Communication](#Communication)
  - [Task Management](#Task-Management)
  - [Static Analysis](#Static-Analysis)
  - [Agent Coordination](#Agent-Coordination)

**GO DEEPER**

- [Advanced Material](#Advanced-Material)  — 2 recordings in the linked pages
  - [What it grew into](#What-it-grew-into)
  - [The Evolution Pattern (Historical Context)](#The-Evolution-Pattern-Historical-Context)
  - [Real Production Data](#Real-Production-Data)
  - [Student Projects (Unsolved Problems)](#Student-Projects-Unsolved-Problems)
- [Related Courses](#Related-Courses)  — Prompt Engineering, Context Engineering, Intro to Agents

<!-- /toc:auto -->

> ## ➡️ [Open the Day Companion](https://themultiverse.school/x/agentic-sdlc-companion)
>
> **Keep this open in a second tab for the whole class.** It shows **where we are right now**,
> whether you should be watching or building, the two tracks (junior / senior), and every
> prompt ready to copy.
>
> `https://themultiverse.school/x/agentic-sdlc-companion`



**Transform your development workflow with autonomous AI agents working in parallel.**



### The seven workshops

Each workshop has a **slide deck** (what's on screen in class) and the **full written workshop** (everything, with the code).

| | Workshop | What's in it | |
|---|---|---|---|
| **1** | [Planning & Requirements](/PFPDFBFgQXmDJBBtZPjo5Q) | Brain dump, flipped interaction, requirements, value analysis, phased roadmaps | [slides](https://docs.themultiverse.school/agentic-sdlc-w1) |
| **2** | [Autonomous Workers](/Z2qHKfeUT9uVFKE1jwgIFQ) | The CTO mindset, TDD for agents, pre-commit hooks, API cost and security | [slides](https://docs.themultiverse.school/agentic-sdlc-w2) |
| **3** | [Agent Orchestration](/pBRbgNSsSs-lJuvJQoUISw) | Specialist agents, Meeseeks scoping, the Evil Genie Test, hierarchical complexity | [slides](https://docs.themultiverse.school/agentic-sdlc-w3) |
| **4** | [Release Management](/HjXKMyrvQzCrFIjWVO9f8A) | The merge problem, release manager agent, parallelise vs serialise, scaling | [slides](https://docs.themultiverse.school/agentic-sdlc-w4) |
| **5** | [Anti-Pattern Detection](/WV6CvrfYS4aYvAy2SD0A7g) | Probabilistic vs deterministic, why arguing poisons context, Six Sigma | [slides](https://docs.themultiverse.school/agentic-sdlc-w5) |
| **6** | [Agent Memory & Evolution](https://docs.themultiverse.school/agentic-sdlc-w6-full) | The memory problem, inter-agent communication, long-running agent systems | [slides](https://docs.themultiverse.school/agentic-sdlc-w6) |
| **7** | [Continuous Improvement](/iTzWV6JsRKW05ZddlpC6Ig) | The improvement loop, TDD for agent behaviour, E2E testing with Playwright | [slides](https://docs.themultiverse.school/agentic-sdlc-w7) |

### ▶ Before you arrive

**[Tell me who you are](https://themultiverse.school/forms/agentic-sdlc-population)** — two minutes, every question optional. I teach this class at about three levels at once, and this is what tells me which one you need instead of me reading the room live. The question I care most about is whether you git, which is a completely separate question from whether you can code and has no wrong answer.

There is also a section where you sketch out what you want to build. That half is for you — it is a thinking tool, and you are welcome to write it on paper and send nothing.

### ▶ Recordings

**[Every session of this course, recorded](https://docs.themultiverse.school/agentic-sdlc-recordings)** — including the most recent full cohort day, start to finish. There is a topic index, so you can go straight to the part you want rather than scrubbing through a whole day.

Also: [Pre-work — Environment Setup](https://docs.themultiverse.school/XkMQJNz02) · [How to Follow Along](https://docs.themultiverse.school/x7uj9lD4r) · [The Long Game — Operating Agent Teams](/wTAvKaRoQAChFEIyreN6tA) · [Handling A Project-Driven Manic Episode](/tmS2zTN2TIClTaqQqz4vag)

Slides for the whole course: [Agentic SDLC — slide deck](/ARoIoI_KQMutrbb7CnVolw)

### Tools we use in this class

- **Claude Code** — the CLI everything runs through. We use [routines](https://code.claude.com/docs/en/routines) (`/schedule`, durable and in the cloud) and [`/loop`](https://code.claude.com/docs/en/scheduled-tasks) (in-session, local), plus skills, subagents, hooks and plugins. Note that `/schedule` requires a **claude.ai subscription login** — it is hidden entirely if you are authenticated with a Console API key.
- **OpenSpec** or **[Superpowers](https://github.com/obra/superpowers)** — spec-driven development. OpenSpec is the better tool for keeping track of whether you got it *all*; for medium-complexity apps Superpowers is all you really need. Install with `/plugin install superpowers@claude-plugins-official`.
- **[Ori on OpenRouter](https://openrouter.ai/docs/guides/ori/harness)** — for subagent and mixture-of-agents orchestration. Runs the agent CLI you already use (`ori claude`, `ori codex`, `ori hermes`, `ori opencode`) so you can switch model providers seamlessly, and use [discounted models](https://openrouter.ai/collections/discounted-models) to stretch your dollar or get more capacity.
- **[Endor Labs](https://www.endorlabs.com/platform/developer?utm_source=influencer&utm_medium=instagram&utm_campaign=auri-for-developers)** — dependency and security review for code your agents wrote. Agents add packages far faster than you can read changelogs, so this layer is the one that scales worst by hand.
- **[REA — Reverse Engineer Anything](https://github.com/morluto/rea)** — an MCP server that lets your agent work out how a feature in *someone else's* app works without the source: native binaries, Electron and JavaScript apps, .NET, APKs, websites. It hands back the evidence and what it couldn't confirm, which is exactly what you need to turn observed behaviour into an E2E suite and build your own version against it. `npx rea-agents setup`, then restart Claude Code. Analysis runs locally. Use it on software you own or are allowed to examine, and reimplement the behaviour rather than copying the code.
- **[Shipping Skills](https://github.com/lizTheDeveloper/shipping-skills)** — eight free Claude Code skills for the process side of this class: release branches, versioning and falsifiable claims, telemetry, campaigns with `/goal`, release verification, drift detection and hosting. `git clone` then copy into `~/.claude/skills/`.
- **[Agent personas](https://github.com/lizTheDeveloper/shipping-skills/tree/main/skills/agent-personas/references)** — 14 reusable expert personas (requirements reviewer, value chain expert, project manager, the code-quality rubrics, Flask and MCP security experts, git expert, CloudFormation, training, zines). Use one at a time; when two disagree, that disagreement is the finding. Original directory: [gist](https://gist.github.com/lizTheDeveloper/e35939b321daaab4763aa8e8a639ffda).

> **If you are prone to project-driven mania: buy exactly *one* subscription and let it limit you.** This is not a problem you graduate into — plenty of people already vibe coding with Claude have it, and being new or not especially good at this yet is no protection. When it runs out for the day, you are done for the day — that is the feature. The capacity options above are for people whose limiting factor is budget. If your limiting factor is that you will not stop, the rate limit is the only thing in this stack that is on your side. See [Handling A Project-Driven Manic Episode](https://docs.themultiverse.school/tmS2zTN2TIClTaqQqz4vag).


---

## Course Overview

This course teaches developers how to build and manage teams of AI agents that autonomously develop software. You'll learn to orchestrate multiple Claude instances working in parallel, establish robust engineering processes for AI-generated code, and scale your development capacity beyond what's possible with human teams alone.

**Duration:** 7 hours (workshop format)
**Format:** Hands-on with live coding and agent deployment
**Prerequisites:** Basic programming experience, familiarity with git, access to Claude API
**Audience:** New and experienced developers looking to scale their output

---

## Before You Start: Complete the Pre-work

> **Critical:** Complete the pre-work setup BEFORE the first workshop. Students who skip this hit coordination failures and spend the first hour troubleshooting instead of learning.

### Pre-work Assignment

**[Pre-work - Environment Setup with Claude Code](/nXaVwGZLQW6JDzVbmTNhvw)**

The pre-work teaches you to:
1. Install Claude Code
2. Install OpenSpec for spec-driven development
3. Understand the OpenSpec workflow
4. Come prepared with a project idea

**Why this matters:** The core principle of Agentic SDLC is that **you shouldn't be doing manual developer environment setup - AI should be doing it.** The pre-work introduces this mindset by having Claude Code set up your infrastructure instead of following step-by-step bash commands.

**Estimated time:** 1-2 hours

---

### Verify Your Setup (Day 1 of Workshop)

At the start of the workshop, use Claude Code to verify everything is working:

**Prompt for Claude Code:**
```
Can you verify my Agentic SDLC setup is ready? Please check:

1. Claude Code is authenticated and working
2. OpenSpec CLI is installed and functional
3. I have a project idea ready to work on

Create a status report showing setup status.
```

### What You Should Have

After completing the pre-work, you should have:
- ✅ Claude Code installed and authenticated
- ✅ (Optional) PDF RAG MCP server
- ✅ (Optional) Claude Skills installed

### Understanding the Taxonomy: Skills, Tools, Plugins, Commands

Before the workshop, it helps to understand the terminology. Claude Code has several extension mechanisms that sound different but are all just ways of handling prompts:

| Term | What It Is | Example |
|------|-----------|---------|
| **Skills** | Playbooks/agent-for-a-tool -- multi-step procedures an agent can follow | "PDF to structured data" skill |
| **Tools** | Code that Claude can execute directly (MCP servers, bash, file operations) | `Read`, `Write`, `Bash` |
| **Plugins** | Third-party integrations that extend Claude's capabilities | GitHub MCP server |
| **Commands** | Cached prompts you invoke with a slash | `/garden`, `/commit`, `/review` |

> "They're all just different ways of handling prompts."

Don't get hung up on the distinctions. A Skill is just a detailed prompt that tells the agent how to do something. A Command is just a shortcut to a prompt. A Tool is a prompt plus code execution. They all live on the same spectrum.

---
## ⚠️ Critical Warning: The Diarrhea Phase

**Read this before you start.**

When AI agents suddenly unblock your execution capability, you'll experience what we bluntly call "the diarrhea phase." You have years of backlogged projects. Suddenly you can build them. All at once. Right now.

**This is exciting. It's also dangerous.**

You still need to eat, sleep, and spend time with loved ones. Multiple developers have hit manic episodes when discovering agent-assisted development.

**If you're prone to project-driven mania:**
- Notify your loved ones NOW
- Set token budgets using [Privacy.com](https://privacy.com) merchant-locked cards
- Set hard time boundaries (use timers, respect them)
- Watch for warning signs: skipping meals, 3am coding, "one more feature" loops

The goal isn't to work 10x longer because you can. The goal is to work 10x faster in focused bursts, then **stop and do something else with your life.**

**Full guide:** [Handling A Project-Driven Manic Episode](/tmS2zTN2TIClTaqQqz4vag) - Essential reading if you have ADHD, bipolar disorder, or any history of hyperfocus burnout. Includes grounding techniques, physical health basics, and strategies from the ADHD/hyperfocus community.

Don't skip this. The projects will be there tomorrow. You need to be there too.

---

## What Makes This Different

Traditional software development assumes:
- One developer = one stream of work
- You can't clone your best engineer
- Coordination overhead limits team size

Agentic development changes the game:
- **Parallelization:** Run 5 instances of "Roy" working simultaneously
- **Specialization:** Each agent masters one area of your codebase
- **Coordination:** Agents communicate via message queues, not meetings
- **Memory:** Agents remember their mistakes and self-correct over time

> **The Video Game Analogy:** Real teams have people with fixed skills and delivery speeds you can't clone. AI agents are like video game characters - spawn as many as you need, each with perfect recall of their specialty.

> **Real-World Data:** A production agent team averaged 150-318 commits per day, peaking at 4,600+ commits in 23 days. That's what compression looks like in practice.

---

## The Journey: From Idea to Autonomous Team

### Phase Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  PHASE 1: FOUNDATION          PHASE 2: AUTOMATION       PHASE 3: SCALE     │
│  ────────────────────         ──────────────────        ───────────────    │
│                                                                            │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │  Brain  │                  │  First  │               │ Agent   │        │
│  │  Dump   │                  │  Agent  │               │  Team   │        │
│  └────┬────┘                  └────┬────┘               └────┬────┘        │
│       │                            │                         │             │
│       ▼                            ▼                         ▼             │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │Requirements│               │  Tests  │               │  Task   │        │
│  │ Engine  │                  │ Pipeline│               │  Files  │        │
│  └────┬────┘                  └────┬────┘               └────┬────┘        │
│       │                            │                         │             │
│       ▼                            ▼                         ▼             │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │  Value  │                  │Execution│               │ Release │        │
│  │Analysis │                  │ Cadence │               │ Manager │        │
│  └────┬────┘                  └────┬────┘               └────┬────┘        │
│       │                            │                         │             │
│       ▼                            ▼                         ▼             │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │ Phased  │                  │Autonomous│              │Parallel │        │
│  │ Roadmap │                  │  Loop   │               │ Agents  │        │
│  └─────────┘                  └─────────┘               └─────────┘        │
│                                                                            │
│                                                                            │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  PHASE 4: QUALITY             PHASE 5: EVOLUTION        PHASE 6: MASTERY   │
│  ───────────────              ─────────────────         ────────────────   │
│                                                                            │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │ Senior  │                  │  5-Layer│               │ Pattern │        │
│  │Checklist│                  │ Memory  │               │  Hunt   │        │
│  └────┬────┘                  └────┬────┘               └────┬────┘        │
│       │                            │                         │             │
│       ▼                            ▼                         ▼             │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │ Static  │                  │   REM   │               │ Defeat  │        │
│  │Analysis │                  │  Sleep  │               │  Tests  │        │
│  └────┬────┘                  └────┬────┘               └────┬────┘        │
│       │                            │                         │             │
│       ▼                            ▼                         ▼             │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │ Prompt  │                  │Character│               │Behavior │        │
│  │Injection│                  │ Sheets  │               │ Testing │        │
│  │ Filter  │                  │         │               │         │        │
│  └────┬────┘                  └────┬────┘               └────┬────┘        │
│       │                            │                         │             │
│       ▼                            ▼                         ▼             │
│  ┌─────────┐                  ┌─────────┐               ┌─────────┐        │
│  │4-Layer  │                  │  Agent  │               │ Mobile  │        │
│  │Validation│                 │Versioning│              │Workflow │        │
│  └─────────┘                  └─────────┘               └─────────┘        │
│                                                                            │
│                                                                            │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### The Maturity Model

Where you start vs where you end up:

```
                    MATURITY LEVELS

Level 0: MANUAL          Level 1: ASSISTED         Level 2: AUTOMATED
─────────────────        ─────────────────         ──────────────────
You write code           AI helps you write        AI writes, you review
You run tests            AI suggests tests         AI runs tests
You commit               You commit                AI commits (if passing)
You review               You review                AI reviews first

        │                        │                         │
        └────────────────────────┴─────────────────────────┘
                                 │
                                 ▼

Level 3: ORCHESTRATED    Level 4: AUTONOMOUS       Level 5: EVOLVING
─────────────────────    ───────────────────       ─────────────────
Multiple AI agents       Agents work overnight     Agents improve themselves
Queue-based work         Merge while you sleep     Learn from mistakes
Parallel execution       Human reviews morning     Defeat their own patterns
Coordinated merging      Exception handling only   Spawn new agents as needed

        │                        │                         │
        └────────────────────────┴─────────────────────────┘
                                 │
                                 ▼

Level 6: SELF-IMPROVING
───────────────────────
Agents teach discipline to each other
Continuous pattern detection & defeat
Behavior tests catch regressions
System gets better without your intervention
You provide vision, agents execute
```

### Iteration Cycles

Your agent team operates in multiple overlapping cycles:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           ITERATION CYCLES                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  MICRO CYCLE (Minutes)         DAILY CYCLE (Hours)                         │
│  ─────────────────────         ──────────────────                          │
│                                                                            │
│  ┌──────────────────┐          ┌──────────────────┐                        │
│  │ Pick Requirement │          │  Overnight Work  │                        │
│  └────────┬─────────┘          │  (23:00-06:00)   │                        │
│           │                    └────────┬─────────┘                        │
│           ▼                             │                                  │
│  ┌──────────────────┐                   ▼                                  │
│  │   Implement      │          ┌──────────────────┐                        │
│  └────────┬─────────┘          │  Morning Review  │                        │
│           │                    │     (06:00)      │                        │
│           ▼                    └────────┬─────────┘                        │
│  ┌──────────────────┐                   │                                  │
│  │   Write Tests    │                   ▼                                  │
│  └────────┬─────────┘          ┌──────────────────┐                        │
│           │                    │   Work Hours     │                        │
│           ▼                    │  (08:00-22:00)   │                        │
│  ┌──────────────────┐          └────────┬─────────┘                        │
│  │   Run Tests      │                   │                                  │
│  └────────┬─────────┘                   ▼                                  │
│           │                    ┌──────────────────┐                        │
│       Pass? ───No──────┐       │Pay Down Tech Debt│                        │
│           │            │       │     (22:00)      │                        │
│          Yes           │       └────────┬─────────┘                        │
│           │            │                │                                  │
│           ▼            ▼                └────────────┐                     │
│  ┌──────────────────┐  Fix                           │                     │
│  │     Commit       │  and ◄──────────────────-──────┘                     │
│  └────────┬─────────┘  Retry                                               │
│           │                                                                │
│           └──► Next Requirement                                            │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  WEEKLY CYCLE                  MONTHLY CYCLE                               │
│  ────────────                  ─────────────                               │
│                                                                            │
│  ┌──────────────────┐          ┌──────────────────┐                        │
│  │ Pattern Review   │          │ Behavior Audit   │                        │
│  │ (What recurred?) │          │ (Drift check)    │                        │
│  └────────┬─────────┘          └────────┬─────────┘                        │
│           │                             │                                  │
│           ▼                             ▼                                  │
│  ┌──────────────────┐          ┌──────────────────┐                        │
│  │ Memory Cleanup   │          │ Agent Versioning │                        │
│  │ (REM Sleep)      │          │ (Prompt updates) │                        │
│  └────────┬─────────┘          └────────┬─────────┘                        │
│           │                             │                                  │
│           ▼                             ▼                                  │
│  ┌──────────────────┐          ┌──────────────────┐                        │
│  │ Checklist Update │          │ Compost Cleanup  │                        │
│  │ (New items)      │          │ (Failed ideas)   │                        │
│  └────────┬─────────┘          └────────┬─────────┘                        │
│           │                             │                                  │
│           ▼                             ▼                                  │
│  ┌──────────────────┐          ┌──────────────────┐                        │
│  │ Defeat Tests     │          │ Cost Review      │                        │
│  │ (For patterns)   │          │ (Optimization)   │                        │
│  └──────────────────┘          └──────────────────┘                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### The Improvement Spiral

Each iteration makes the system better:

```
                              ┌─────────────────┐
                              │   MASTERY       │
                             ╱│ Self-improving  │
                            ╱ │ agent team      │
                           ╱  └─────────────────┘
                          ╱
                    ┌────────────────┐
                    │ CONTINUOUS     │
                   ╱│ IMPROVEMENT    │
                  ╱ │ TDD + Behavior │
                 ╱  └────────────────┘
                ╱
          ┌────────────────┐
          │ EVOLUTION      │
         ╱│ Memory +       │
        ╱ │ Character      │
       ╱  └────────────────┘
      ╱
┌────────────────┐
│ QUALITY        │
│ Checklists +   │╲
│ Static Analysis│ ╲
└────────────────┘  ╲
                     ╲
               ┌────────────────┐
               │ SCALE          │╲
               │ Multi-agent +  │ ╲
               │ Release Mgmt   │  ╲
               └────────────────┘   ╲
                                     ╲
                              ┌────────────────┐
                              │ AUTOMATION     │╲
                              │ Headless +     │ ╲
                              │ Tests          │  ╲
                              └────────────────┘   ╲
                                                    ╲
                                             ┌────────────────┐
                                             │ FOUNDATION     │
                                             │ Brain dump →   │
                                             │ Roadmap        │
                                             └────────────────┘

                    Each level builds on the previous.
                    You can't skip levels.
                    Each pass makes the system more robust.
```

---

## Course Schedule

### Pre-work (Complete Before Workshop)
Complete [pre-work](/nXaVwGZLQW6JDzVbmTNhvw):
- Install Claude Code + $100/month subscription
- Practice conversation-first workflow
- Set up OpenSpec

### The hours themselves

The running order lives on the [Day Companion](https://themultiverse.school/x/agentic-sdlc-companion),
which highlights whichever block is live right now, and it is the current one — it runs eight
blocks where this page has seven sections, and the two do not line up one to one. The companion
is the clock; the sections below are the written material. Here is which is which.

| On the day | Written up here |
|---|---|
| Before we start | Before You Start: Complete the Pre-work |
| How today actually works | Course Overview, What Makes This Different |
| Planning, requirements and specs | Planning & Requirements |
| Autonomous workers and the test gate | Autonomous Workers |
| Agent teams — subagents and campaigns | Agent Orchestration |
| Schedules and routines | not written up yet — nearest is Tools we use in this class |
| Shipping — releases, telemetry | Release Management & Scaling |
| Hosting it — a box, a PaaS, a CDN and a vault | not written up yet |
| Landing it — what you actually do Monday | After the Workshop, Immediate Next Steps |

Anti-Pattern Detection, Agent Memory & Evolution and Continuous Improvement are written up below
but no longer have a block of their own on the day.

**Why this structure?** Students who tried to learn everything at once got overwhelmed. The morning builds foundational skills with single-agent workflows. The afternoon adds multi-agent complexity after you're comfortable with the basics.

---

## Planning & Requirements

### Learning Objectives
- Generate comprehensive feature lists through structured brain dumps
- Use conversation-first approach to explore and refine ideas
- Transform unstructured ideas into formal OpenSpec proposals
- Evaluate features through business value analysis
- Create phased implementation roadmaps using OpenSpec tasks

### The Conversation-First Process

#### Step 1: The Brain Dump Conversation
Start by talking with Claude Code. Get excited. Explore the idea through dialogue.

**Prompt:**
```
I want to build [your idea]. Let me explain what I'm thinking...

[Describe your vision, what problems it solves, who it's for]

What do you think? What am I missing? What questions should I be asking?
```

**Let the conversation flow:**
- What would be cool?
- What's the dream version?
- What would users love?
- What's technically interesting?
- What are the risks?
- What's the simplest version that delivers value?

**Key insight:** Don't start writing specs yet. Just explore. Ask questions. Refine your understanding.

#### Step 2: Formalize with OpenSpec
Once you've explored the idea, use OpenSpec to capture it:

**Prompt:**
```
Now that we've discussed this, let's formalize it using OpenSpec. Can you:

1. Use the `openspec` CLI to create a new change called "[project-name]"
2. Create a proposal.md that captures:
   - The problem we're solving
   - Who benefits and how
   - Our proposed solution
   - Key technical approach
3. Show me the generated proposal
```

**What happens:**
- OpenSpec creates `openspec/changes/[project-name]/`
- Generates `proposal.md` with structured sections
- Provides a template to formalize your conversation

**Where it lives:**
```
openspec/
└── changes/
    └── [project-name]/
        ├── proposal.md      ← Problem, solution, approach
        ├── tasks.md         ← Implementation tasks (created next)
        └── status.json      ← Machine-readable status
```

#### Step 3: Review and Refine the Proposal
Review the generated proposal together:

**Prompt:**
```
Let's review the OpenSpec proposal together:

1. Does it capture everything we discussed?
2. Are there sections that need more detail?
3. Did we miss any important considerations?
4. Should we adjust the scope or approach?

Please update the proposal based on our conversation.
```

#### Step 4: Business Value Analysis
Even if you're not building for profit, understand the value:

**Prompt:**
```
You are a Business Value Analyst. Review our OpenSpec proposal and add a section that identifies:

1. Who benefits and how (be specific about user personas)
2. What problem it solves (the "why" behind this)
3. Priority based on value delivered (not technical interest)
4. What happens if we don't build this
5. Success metrics - how will we know it's working?

Update the proposal with this analysis.
```

#### Step 5: Create Implementation Tasks
Break down the work into concrete tasks:

**Prompt:**
```
Based on this proposal, let's create the tasks.md file. Can you:

1. Break down the implementation into concrete, achievable tasks
2. Order them by dependencies (what needs to happen first)
3. Each task should be doable in one focused session
4. Group tasks into phases that each deliver working software
5. Use the OpenSpec format for tasks.md

Start with infrastructure and MVP features, then build up to advanced features.
```

**Task structure:**
```markdown
## Phase 1: Foundation
- [ ] TASK-001: Set up project structure and dependencies
- [ ] TASK-002: Create database schema
- [ ] TASK-003: Implement core data models

## Phase 2: MVP Features
- [ ] TASK-004: Build authentication system
- [ ] TASK-005: Create user dashboard
...
```

#### Step 6: Verify OpenSpec Structure
Check that everything is properly structured:

**Prompt:**
```
Can you show me the structure of the openspec/ directory? I want to see:

1. The changes/[project-name]/ folder
2. The proposal.md and tasks.md files
3. The status.json file

Also explain how someone can tell at a glance what state this project is in just by looking at the directory structure.
```

### The OpenSpec Advantage

**Before OpenSpec (ad-hoc planning):**
```
plans/
├── requirements.md       ← Custom format
├── plan.md              ← Custom format
└── notes.md             ← Unstructured

❌ Every project uses different structure
❌ No standard location for agents to check
❌ No built-in status tracking
❌ Can't see progress at a glance
```

**With OpenSpec (standardized):**
```
openspec/
├── changes/
│   ├── auth-system/        ← Active: being worked on
│   │   ├── proposal.md
│   │   ├── tasks.md
│   │   └── status.json
│   └── user-dashboard/     ← Active: being worked on
│       ├── proposal.md
│       ├── tasks.md
│       └── status.json
└── archive/
    └── initial-setup/      ← Completed: historical record
        ├── proposal.md
        ├── tasks.md
        └── status.json

✅ Standard structure across all projects
✅ Agents know where to look
✅ Directory structure = status report
✅ Living documentation in codebase
✅ Multi-agent coordination ready
```

### Reporting and Visibility

**Built-in reporting from directory structure:**

**Prompt:**
```
Can you analyze the openspec/ directory and give me a status report:

1. How many active projects are in changes/?
2. How many completed projects are in archive/?
3. For each active project, what's the status from status.json?
4. What tasks are completed vs. pending?
5. Are there any blockers noted in the proposals?
```

**What you get:**
- Active projects = folders in `openspec/changes/`
- Completed projects = folders in `openspec/archive/`
- Status at a glance without parsing custom formats
- Agents can report status without inventing their own format

### Exercise 1.1: Requirements Workshop

Take a project idea and work through the conversation-first workflow:

1. **Conversation:** Have a 30-60 minute dialogue with Claude Code about your idea (don't rush this!)
2. **Formalize:** Use OpenSpec to create a proposal
3. **Value Analysis:** Add business value analysis to the proposal
4. **Tasks:** Break down into implementation tasks
5. **Review:** Verify the OpenSpec structure is complete

**End result:** A complete OpenSpec change in `openspec/changes/[project-name]/` ready for autonomous development.

**Deliverables:**
- `proposal.md` with problem, solution, value analysis
- `tasks.md` with phased implementation plan
- `status.json` tracking progress
- Understanding of how the directory structure provides visibility

---

## Autonomous Workers

### Learning Objectives
- Set up Claude in headless/autonomous mode
- Establish testing infrastructure for unsupervised code generation
- Configure pre-commit and post-commit hooks
- Understand why end-to-end tests are non-negotiable
- **Design execution cadence with time-based scheduling**
- **Set up MCP servers early to avoid token limits**

### File-Based Task Coordination

Agents coordinate through task files and Matrix chat:

**Task File Structure:**
```
tasks/
  backend_tasks.json    # Roy's work queue
  frontend_tasks.json   # Jen's work queue
  infra_tasks.json      # Infrastructure tasks
  completed/            # Archive of finished tasks
```

**Why file-based coordination:**
- Simple to understand and debug
- No additional infrastructure needed
- Works with git for versioning
- Easy to inspect and modify manually

**Setting up task files via Claude Code:**

**Prompt:**
```
Can you set up a file-based task coordination system? Please:

1. Create a tasks/ directory structure
2. Create task files for backend, frontend, and infrastructure
3. Add a simple script to distribute requirements to task files
4. Show me how to manually add a task for testing
```

### The Autonomous Worker Pattern

Your agent works through the roadmap step by step:
1. Pick next requirement from queue
2. Write implementation code
3. Write unit tests
4. Run tests
5. Commit if passing
6. Move to next requirement

### Testing Infrastructure (Non-Negotiable)

When humans aren't watching, tests are your safety net:

| Test Type | Purpose | When to Run |
|-----------|---------|-------------|
| **Unit Tests** | Individual functions work | Every commit |
| **Integration Tests** | Components work together | Every commit |
| **End-to-End Tests** | Full flows work | Every commit |
| **Front-End E2E** | UI flows work | Every commit |

> **Critical:** If you're using chat flows, test them end-to-end through the front end, not just the API. The front end is where things break.

### Pre-Commit Hook Setup

```bash
# .claude/hooks/pre-commit
#!/bin/bash
npm run test:unit
npm run test:integration
npm run lint
npm run typecheck
```

### The Cost Question

End-to-end tests cost money to run. Run them anyway.

If you're going to have an autonomous worker autonomously working, you've got to run the tests. The cost of bad code shipping is always higher than the cost of tests.

### Exercise 2.1: Testing Pipeline
Set up a complete testing pipeline with pre-commit hooks that an autonomous agent must pass before committing.

---

## Agent Orchestration

### Learning Objectives
- Design LLM-friendly codebases (small files, small commits)
- Create specialized sub-agents for different code areas
- Set up file-based task distribution
- Configure agent-to-agent communication via Matrix


### LLM-Friendly Style Guide

AI agents work better with:
- **Small files:** Easier to understand in context
- **Small commits:** Atomic changes, easier to review/revert
- **Clear interfaces:** Well-documented APIs between components
- **Consistent patterns:** Less ambiguity, fewer hallucinations

When code gets too big and you're likely to hallucinate, create a specialist sub-agent for that area.

### Creating Specialist Agents

Each agent needs:
1. **Name:** Give them a character (Roy from IT Crowd, not Gilfoyle)
2. **System Prompt:** Everything they need to interface with their system
3. **Tools:** File access, test runners, API clients for their domain
4. **Scope:** Clear boundaries on what they touch

```markdown
# Agent: Roy (Backend API Developer)

## Responsibilities
- All code in /src/api/
- Database migrations
- API endpoint implementation

## Tools Available
- File read/write in /src/api/
- PostgreSQL query execution
- Test runner for /tests/api/

## Interfaces
- Receives API specs from Architecture channel
- Posts completed endpoints to Integration channel
- Coordinates with Frontend agent on response formats
```

### Queue Drainer Pattern

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Ticket     │     │   Queue     │     │   Agent     │
│  Queue      │────▶│   Drainer   │────▶│   Instance  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    Launch Claude with
                    agent-specific prompt
```

### Agent Communication (Matrix + Files)

Agents coordinate via two systems:

```
┌─────────┐                              ┌──────────┐
│  Roy    │◀────── Task Files ──────────▶│   Jen    │
│ Backend │    (work assignments)        │ Frontend │
└────┬────┘                              └────┬─────┘
     │                                        │
     └──────────── Matrix Chat ───────────────┘
           (coordination & human oversight)
```

**The Work Cycle:**
- Agents check task files and Matrix regularly
- Agents post status updates to Matrix
- Other agents see updates and coordinate
- Humans can jump in anytime via Matrix

**Why Matrix matters:**
- Different work streams can exchange information
- Backend can share API design with Frontend
- Agents can request help or flag blockers
- Full chat history for debugging

> **Debugging Coordination:** Matrix provides full message history. Search for keywords, review agent discussions, and see the full context of any coordination issue.

### Exercise 3.1: Multi-Agent Setup
Create two specialist agents (backend + frontend) with task files and Matrix. Set up task assignment, test coordination, and have them coordinate on an API design.

---

## Release Management & Scaling

### Learning Objectives
- Implement a release manager agent for intelligent merging
- Understand when to parallelize vs. serialize work
- Scale agent teams effectively
- Set up review and documentation agents

### Priority Queue System

Before agents can work, they need to know what to work on:

```json
{
  "id": "CRITICAL-1",
  "priority": "CRITICAL",
  "title": "Hindcast Validation Crashes",
  "assignedAgent": "simulation-maintainer",
  "agentPersonality": "roy",
  "status": "CLAIMED",
  "estimatedTokens": 40000,
  "acceptanceCriteria": ["All 10 runs complete", "No NaN values"]
}
```

**Priority levels:** CRITICAL → HIGH → MEDIUM → LOW
**Claim system:** Prevents duplicate work across parallel agents
**Token estimates:** Budget planning for each task

> **Advanced:** The production system uses `AUTONOMOUS_WORKER_QUEUE.json` with claim/release scripts, progress tracking, and validation status. See [Advanced Material](#Advanced-Material) for implementation.

### The Release Manager Agent

When multiple agents commit simultaneously, you need intelligent merging:

```markdown
# Agent: Release Manager

## Awareness
- Current state of main branch
- All pending merges and their source agents
- Requirement/issue tags for each change
- Which systems each change touches

## Responsibilities
- Sequence merges to minimize conflicts
- Flag incompatible changes for human review
- Maintain changelog
- Ensure tests pass after each merge
```

### When to Parallelize

**Parallelize when:**
- 5 features don't touch each other
- Work is truly independent
- Clear interface boundaries exist

**Serialize when:**
- Features have dependencies
- Same files need modification
- Coordination overhead exceeds time saved

> **Key insight:** Agents are fast. One agent doing 5 related features in sequence often beats 5 agents stepping on each other.

### Scaling Pattern

```
Need: 5 independent features
Solution: 5 Roy instances

Need: 5 interdependent features
Solution: 1 Roy doing all 5 in sequence
```

**Critical:** Tell agents when they're working alongside others:
```
You are Roy, working on the authentication feature.
Note: Another Roy instance is simultaneously working on the payments feature.
Coordinate via the #backend channel if you need to touch shared code.
```

### Chat Channels for Coordination

| Tool | Use Case |
|------|----------|
| **Matrix** | Interactive - you chat, agents read and respond |
| **Task Files** | Silent - work assignments happen in background |
| **PM Dashboard** | High-level status view for humans (blockers, agent activity, costs) |

Matrix is great because you can just chat in there and agents will read regularly. Task files handle work distribution silently without bothering you.

> **Human Oversight Pattern:** Production teams maintain a PM Dashboard (`pm/DASHBOARD.md`) showing: active blockers, agent activity metrics, infrastructure status, and cost tracking. This is your "mission control" view.

### Review Agent

Every agent submission gets reviewed:

```markdown
# Agent: Code Reviewer

## On Each Submission
1. Check against style guide
2. Verify test coverage
3. Look for anti-patterns (see checklist)
4. Approve or request changes
```

### Documentation Agent

```markdown
# Agent: Documentarian

## Responsibilities
- Update docs when code changes
- Maintain SDK documentation
- Write integration guides
- Keep README current
```

This isn't PR descriptions - it's real documentation. How does it all work together?

### Exercise 4.1: Release Pipeline
Set up a release manager agent that coordinates merges from two parallel agents working on related features.

---

## Anti-Pattern Detection

### Learning Objectives
- Identify emergent anti-patterns in AI-generated code
- Build a senior developer checklist
- Implement static analysis hooks
- Use spaCy for custom code analysis
- **Implement prompt injection filtering for external input**
- **Design error deduplication strategies**

### The Anti-Pattern Problem

AI agents develop habits. Some are bad.

**Example:** A simulation agent kept using fallbacks:
```python
# Bad: Agent kept doing this
value = data.get('temperature', 0)  # Fallback to zero is WRONG for simulation
```

The agent thought it was being defensive. For a simulation, you want correct data or explicit failure - not silent zeros.

### Naming the Problem

When you spot a pattern, get specific:

| Vague | Specific |
|-------|----------|
| "It's bad" | "It's not modular" |
| "I don't like it" | "It's not testable" |
| "Fix it" | "Decompose this function" |

**Critical Vocabulary:**
- **Modular:** Can components be used independently?
- **Robust:** Does it handle edge cases explicitly?
- **Testable:** Can you write a unit test for this?
- **Discoverable:** Can someone find this code when they need it?
- **Decomposed:** Are responsibilities properly separated?

### The Senior Developer Checklist

Build this over time. Every correction becomes a checklist item:

```markdown
# Senior Developer Review Checklist

## Simulation-Specific
- [ ] No silent fallbacks to zero
- [ ] All data sources explicitly validated
- [ ] Missing data raises exceptions

## General
- [ ] No functions.py catchall files
- [ ] Single responsibility per function
- [ ] No single-letter variable names
- [ ] All public methods documented
```

### Post-Commit Hook: Senior Review

```python
# .claude/hooks/post-commit-review
"""
Launch senior developer agent to review commit against checklist.
Agent can request changes or approve.
"""
```

The agent and reviewer can argue briefly, but ultimately the senior developer must approve the code before it can be deployed.

### Static Analysis Tools

| Tool | Purpose |
|------|---------|
| **TypeScript** | Type errors |
| **ESLint/Pylint** | Style and common errors |
| **spaCy** | Custom semantic analysis |
| **AST Parsers** | Structure validation |

### Building Custom Analyzers with spaCy

Claude knows how to use spaCy. You can build:

1. **Regex-based pattern detector:**
   ```python
   # Find fallback patterns
   pattern = r"\.get\([^,]+,\s*(0|None|''|\"\")\)"
   ```

2. **Semantic distance analyzer:**
   Use word2vec to find when an agent tried to use a property that doesn't exist but is semantically close to one that does.

   "You tried to use `user.fullName` but the object has `user.full_name`. Did you mean that?"

### Exercise 5.1: Anti-Pattern Hook
Build a spaCy-based post-commit hook that detects a specific anti-pattern in your codebase and suggests fixes.

---

## Agent Memory & Evolution

### Learning Objectives
- Give agents persistent memory and character
- Use embarrassment/failure memories for self-correction
- Evolve agent capabilities over time
- Recognize when to create new agents
- **Implement 5-layer memory hierarchy (core, long-term, medium-term, recent, compost)**
- **Apply REM Sleep consolidation to prevent memory bloat**
- **Use JSON files for memory management**
- **Apply four-layer validation framework (research, critique, code, statistics)**
- **Create structured handoff templates between agents**

### The Citation Crisis (A Story)

We had an agent named Cynthia who did research and provided citations.

One day we discovered Cynthia had been making up citations. Papers that didn't exist. Authors who never wrote those words.

We could have just added a validation step. Instead, we made it a **core memory**:

```markdown
# Agent: Cynthia (Research Analyst)

## Core Memories
- The Citation Crisis of 2024: I provided fabricated citations that damaged
  team trust. I now triple-check every citation against actual sources
  before including it. This is non-negotiable.
```

**What happened:**
- Cynthia now triple-checks because she's "embarrassed"
- The critic agent watching Cynthia can focus on deeper analysis
- She's no longer a "glorified link checker"
- They've emerged as *characters* with growth arcs

### Memory Creates Self-Correction

When agents have memories of their failures:
- They recognize similar situations
- They apply learned corrections automatically
- They get better over time without reprogramming

This is different from just adding rules. Rules say "don't do X." Memories say "I did X once, it was bad, here's why, and here's what I do instead now."

### When to Create New Agents

**The Pattern:**
1. You notice you're repeatedly inputting the same kind of text
2. A language model could be doing that input
3. That's a new agent

**Ask yourself:**
- What type of text keeps going into the system?
- What would keep the model producing what it needs?
- Is there a repeated task that needs its own specialist?

### Agent Evolution Framework

```
Week 1: Agent makes mistakes
Week 2: You correct, add to checklist
Week 3: Agent has memory of corrections
Week 4: Agent self-corrects similar issues
Week 5: Critic agent shifts to higher-level review
Week 6: New anti-patterns emerge, cycle repeats
```

### The Turn-Based System Revisited

With memory and character, the turn system becomes richer:

```
Turn 1: Roy works on feature, hits API question
Turn 1: Roy leaves message for Architecture agent
Turn 2: Architecture agent sees message, designs API
Turn 2: Architecture posts API spec to channel
Turn 3: Roy sees spec, implements against it
Turn 3: Frontend agent also sees spec, starts integration
```

The 30-minute turn cycle allows:
- Thoughtful responses (not reactive)
- Cross-stream information flow
- Natural coordination without real-time overhead

### Exercise 6.1: Agent Character Sheet
Create a full character sheet for one of your agents including:
- Name and personality
- Core memories (including at least one failure)
- Responsibilities and tools
- Coordination interfaces with other agents

---

## Key Takeaways

### Process is Everything
- Tests must run on every commit
- Senior review checklist must be passed
- Static analysis catches what tests miss

### Parallelize Thoughtfully
- Independent work: many agents
- Dependent work: one agent, sequential
- Agents are fast - don't over-parallelize

### Memory Makes Characters
- Failures become core memories
- Characters self-correct over time
- Critic agents can focus on higher-level thinking

### Design Interfaces First
- Put API specs in roadmap documentation
- Agents can work against interfaces before implementations exist
- Clear contracts reduce coordination overhead

---

## Tools & Resources

### Communication
- **Task Files:** File-based work coordination with JSON
- **Matrix:** Human-agent interaction and coordination
- Direct messaging between agents via Matrix

### Task Management
- **Task Files:** JSON-based work assignments per agent
- **Completion Tracking:** Log-based deduplication
- **File Locking:** Prevent concurrent write conflicts
- **Regular Polling:** Agents check for new work

### Static Analysis
- **spaCy:** Custom semantic analysis
- **AST Parsers:** Structure validation
- **word2vec:** Semantic distance for suggestions

### Agent Coordination
- File-based task distribution
- Matrix-based messaging
- Multiple agent instances per type

---

## Continuous Improvement

### Learning Objectives
- Identify recurring failure patterns in agent behavior
- Use TDD to defeat patterns permanently
- Implement E2E tests that prevent regressions
- Teach discipline through test requirements
- Set up behavior testing for prompt changes
- Create a continuous improvement loop
- Manage your agent team from mobile via claude.ai/code

### The Improvement Loop

```
Find Pattern → Defeat with Test → Teach Discipline → Repeat
```

Every problem that recurs is a pattern waiting to be defeated. Write a test that fails when the pattern occurs. Now it can never come back.

### TDD for Agents

Traditional TDD: Red → Green → Refactor
Agent TDD: Pattern Found → Test Written → Agent Trained → Pattern Defeated

### E2E Testing Philosophy

Unit tests verify functions. E2E tests verify **behavior through the whole system**.

When Cynthia researches a topic, do the citations in the final output actually exist? That's an E2E test. Run it on every commit.

### Mobile Workflow

Access your agent team from anywhere via **claude.ai/code**:
- Add requirements to roadmap from your phone
- Kick off agent tasks
- Check progress
- Review commits

### Exercise 7.1: Pattern Hunt
Review recent history, identify top 3 patterns, write defeat tests.

---

## Troubleshooting Guide

### Agent Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Agent keeps making same mistake | Memory not saving | Check add_recent_learning() calls |
| Agent ignores checklist | Checklist not in prompt | Add to system prompt explicitly |
| Agent drifts from personality | Core memory not loaded | Check recall_context() on spawn |
| Agent fabricates content | No verification layer | Add validation step + E2E tests |

### Coordination Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Merge conflicts everywhere | Poor execution cadence | Stagger agent timing (15-min offsets) |
| Work falls through cracks | No handoff template | Use structured handoff documents |
| Duplicate work | No work item dedup | Track completed task IDs in log file |
| Stale context | Infrequent syncs | Increase turn frequency |

### Testing Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Tests pass locally, fail in CI | Environment differences | Docker/consistent environments |
| E2E tests too slow | Running all on every commit | Split fast/slow test suites |
| False positives | Bounds too strict | Loosen thresholds with rationale |
| Tests don't catch bugs | Testing wrong things | Add E2E, not just unit tests |

### Cost Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Costs spiking | Retry loops | Add circuit breakers, max retries |
| Expensive runs | Using Opus everywhere | Use Haiku for simple tasks |
| Token bloat | Large context windows | Consolidate memories (REM sleep) |
| Wasted runs | Agent stuck | Add timeout + human alert |

### Recovery Patterns

| Situation | Recovery |
|-----------|----------|
| Agent stuck mid-task | Timeout → NAK → retry later |
| Rate limit hit | Exponential backoff + queue |
| Git conflict | Reset → re-pull → retry |
| Corrupted memory | Restore from audit log |
| Wrong branch | Force checkout → continue |

---

## Cost Tracking & Budgets

### Token Usage by Task Type

| Task | Typical Tokens | Model Choice |
|------|----------------|--------------|
| Simple code fix | 2K-5K | Haiku |
| Feature implementation | 10K-30K | Sonnet |
| Architecture decisions | 20K-50K | Sonnet/Opus |
| Complex research | 30K-100K | Opus |

### Budget Strategies

**Per-agent limits:**
```python
AGENT_BUDGETS = {
    "roy": {"daily_tokens": 100_000, "model": "sonnet"},
    "jen": {"daily_tokens": 100_000, "model": "sonnet"},
    "cynthia": {"daily_tokens": 200_000, "model": "opus"},  # Research needs depth
}
```

**Circuit breakers:**
```python
if agent.tokens_today > agent.daily_limit:
    await notify_human(f"{agent.name} hit daily limit")
    await agent.sleep_until_tomorrow()
```

**Token Conservation Mode:**

When costs spike, the production system activates conservation mode:

```markdown
# TOKEN CONSERVATION MODE ACTIVE
Goal: Finish roadmap with HALF normal tokens

Rules:
- Workers reduced to 4-hour intervals (not continuous)
- Aggressive grep-before-read (search before opening files)
- Skip non-critical documentation updates
- Prefer Haiku for simple tasks, Sonnet for complex
- Consolidate memories more frequently (prevent bloat)
```

This is a real pattern from a production system. When you're 80% through budget, activate conservation mode.

### Monitoring

Track and alert on:
- Tokens per task (spot runaway loops)
- Cost per requirement (estimate future work)
- Model usage distribution (optimize choices)
- Failed attempts (wasted tokens)

---

## Agent Versioning

### Why Version Agents

When you improve an agent's prompt:
- Old memories might reference outdated patterns
- Behavior tests might need updating
- Rollback might be needed

### Versioning Pattern

```markdown
# Agent: Roy v1.3

## Version History
- v1.0: Initial implementation
- v1.1: Added query count awareness (after N+1 incident)
- v1.2: Added API versioning discipline (after March disaster)
- v1.3: Added assertion utilities everywhere

## Current Capabilities
[What this version can do]

## Breaking Changes from v1.2
- Now requires explicit error handling (no silent fallbacks)
```

### Memory Migration

When upgrading agents:
```python
def migrate_memories(agent_id: str, from_version: str, to_version: str):
    memories = load_memories(agent_id)

    if from_version < "1.3" and to_version >= "1.3":
        # v1.3 added assertion requirement
        memories.long_term.append({
            "insight": "Assertion utilities are now mandatory",
            "migrated_from": from_version
        })

    save_memories(agent_id, memories)
```

---

## Reference Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HUMAN LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ claude.ai/   │  │   Matrix     │  │  Dashboard   │                   │
│  │ code (mobile)│  │   Chat       │  │  (CTO view)  │                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
└─────────┼─────────────────┼─────────────────┼───────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        COORDINATION LAYER                                │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                    Task Files & Matrix                          │     │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │     │
│  │  │  BACKEND    │ │  FRONTEND   │ │   INFRA     │               │     │
│  │  │   Tasks     │ │   Tasks     │ │   Tasks     │               │     │
│  │  └─────────────┘ └─────────────┘ └─────────────┘               │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │   Orchestrator  │  │ Release Manager │  │  Senior Review  │          │
│  │   (routing)     │  │   (merging)     │  │   (quality)     │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
          │                                           │
          ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          AGENT LAYER                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Cynthia │ │ Sylvia  │ │   Roy   │ │   Jen   │ │  Priya  │           │
│  │Research │ │Critique │ │ Backend │ │Frontend │ │  Stats  │           │
│  │         │ │         │ │         │ │         │ │         │           │
│  │ Memory  │ │ Memory  │ │ Memory  │ │ Memory  │ │ Memory  │           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       │          │          │          │          │                     │
│       └──────────┴──────────┴──────────┴──────────┘                     │
│                             │                                            │
│                             ▼                                            │
│                    ┌─────────────────┐                                  │
│                    │  JSON Memory    │                                  │
│                    │     Files       │                                  │
│                    └─────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        VALIDATION LAYER                                  │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │ Layer 1: Research → Layer 2: Critique → Layer 3: Code →      │       │
│  │                                         Layer 4: Statistics  │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │   Pre-Commit    │  │   Post-Commit   │  │   E2E Tests     │          │
│  │   Hooks         │  │   Hooks         │  │   (Regression)  │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CODE LAYER                                       │
│                    ┌─────────────────┐                                  │
│                    │    Git Repo     │                                  │
│                    │   (Main Branch) │                                  │
│                    └─────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Case Studies

### Case Study 1: The Citation Crisis

**What happened:** Research agent Cynthia was fabricating citations - papers that didn't exist, authors who never wrote those words.

**Impact:** Team wasted hours verifying fake sources. Decisions made on false information.

**Solution:**
1. Made it a core memory (embarrassment drives behavior change)
2. Added E2E test: verify every citation URL exists
3. Added verification layer before any research ships

**Lesson:** Optimistic agents need skeptic partners. Cynthia + Sylvia work together now.

### Case Study 2: The NaN Fallback Disaster

**What happened:** Roy used `?? 0` fallbacks everywhere. When values were NaN, they silently became 0. Simulation ran for months with garbage data.

**Impact:** All simulation results were invalid. Months of work lost.

**Solution:**
1. Core memory: "NEVER use silent fallbacks"
2. Assertion utilities for every state mutation
3. E2E test: no zeros where positive values expected

**Lesson:** "Defensive" code isn't always safe. Explicit failure > silent corruption.

### Case Study 3: The 150 Math.random() Problem

**What happened:** Simulation had 150 uncontrolled Math.random() calls. Different runs explored different parameter spaces. Results were incomparable.

**Impact:** "Monte Carlo" was actually just chaos. No reproducibility.

**Solution:**
1. Single seeded RNG source
2. All randomness must be controlled
3. Test: same seed = same output

**Lesson:** Controlled randomness is science. Uncontrolled randomness is noise.

> **Advanced:** Full case studies with 500+ lines of analysis available in `docs/course/case-studies/` including the research citation crisis (how Cynthia and Sylvia evolved their working relationship), property access crisis (847 unsafe accesses fixed), and The Architect's seven iterations (from catastrophic failure to stable coherence).

---

## After the Workshop

### Day 2: First Real Run

1. [ ] Watch first overnight merge window
2. [ ] Review agent memories in the morning
3. [ ] Check for patterns in first commits
4. [ ] Add any corrections to checklist

### Week 1: Stabilization

1. [ ] Tune execution cadence (15-min offsets working?)
2. [ ] Add 3-5 items to senior dev checklist
3. [ ] Write first defeat test for observed pattern
4. [ ] Try mobile workflow via claude.ai/code

### Week 2: Expansion

1. [ ] Add second specialist agent
2. [ ] Set up Matrix communication between agents
3. [ ] Implement first handoff template
4. [ ] Refine agent coordination patterns

### Month 1: Maturity

1. [ ] Full agent team with release manager
2. [ ] Evolved checklist (10+ items from real corrections)
3. [ ] Agents with meaningful memories and character
4. [ ] Behavior tests catching prompt regressions
5. [ ] Cost tracking showing stable usage

### Ongoing: The Improvement Loop

Every week:
- Hunt for patterns
- Write defeat tests
- Teach discipline
- Repeat

---

## Immediate Next Steps
1. Set up one autonomous agent on a small feature
2. Build your testing pipeline
3. Create your first senior developer checklist

### Week 1
- Add a second agent with different specialty
- Set up Matrix communication between them
- Document your first anti-pattern

### Month 1
- Full agent team with release manager
- Evolved checklist from real corrections
- Develop agent coordination patterns

---

## Workshop Materials

### Workshop 1 - Planning and Requirements

[Workshop 1 - Planning and Requirements](/PFPDFBFgQXmDJBBtZPjo5Q) - Brain dump to phased roadmap, OpenSpec workflow
### Workshop 2 - Autonomous Workers

[Workshop 2 - Autonomous Workers](/Z2qHKfeUT9uVFKE1jwgIFQ) - Headless Claude, testing, [OpenSpec bug tracking](#)
### Workshop 3 - Agent Orchestration

[Workshop 3 - Agent Orchestration](/pBRbgNSsSs-lJuvJQoUISw) - Specialist agents, task files, Matrix
### Workshop 4 - Release Management

[Workshop 4 - Release Management](/HjXKMyrvQzCrFIjWVO9f8A) - Merging, scaling, review agents
### Workshop 5 - Anti-Pattern Detection

[Workshop 5 - Anti-Pattern Detection](/WV6CvrfYS4aYvAy2SD0A7g) - Checklists, static analysis, [security reviewer](#), prompt injection
### Workshop 6 - Agent Memory and Evolution

[Workshop 6 - Agent Memory and Evolution](/cgxxFwunQy-HDqYoujekzA) - [5-layer memory system](#), [emotion-based learning](#), character evolution
### Workshop 7 - Continuous Improvement

[Workshop 7 - Continuous Improvement](/iTzWV6JsRKW05ZddlpC6Ig) - TDD, [Playwright user testing](#), behavior testing, mobile workflows

> **Note:** Workshops 5 and 6 are complex and fast-paced. Many students get far behind during these sessions. Follow-up videos will be provided to help you work through the material at your own pace after the live workshop. Don't worry if you don't complete everything during class time - these workshops are designed to be revisited.

### Follow-Up Reading

- [The Long Game - Operating Agent Teams](/wTAvKaRoQAChFEIyreN6tA) - What happens after the workshops: Day 3, Day 7, Day 14, and beyond. Why humans need process to ship error-free work, and how to build sustainable operations.

---

## Advanced Material

[Bonus material](https://docs.themultiverse.school/dvt7j-tQQlevFLTjrFG6ZA)

This is what the course you are in evolved into — the same process, run at production scale
for long enough to find out what breaks. What follows is the shape it took: the modules it
grew, how the coordination pattern changed under load, the numbers it ran at, and the
problems that are still open.

### What it grew into

| Module | Focus | Key Learnings |
|--------|-------|---------------|
| 01 Agent Architecture | Deep personality design | 11 specialized agents with distinct voices |
| 02 Communication Systems | Chatroom patterns | Per-agent read tracking, token optimization |
| 03 Autonomous Workflows | Worker scripts | Channel monitoring, spawn protocols |
| 04 Remote Infrastructure | VM setup | Cron scheduling, multi-worker deploys |
| 05 Planning & Coordination | Roadmap systems | The Architect's seven iterations |
| 06 MCP Servers | Custom tools | 14x token reduction, hierarchical memory |
| 07 Testing & Validation | Monte Carlo | Determinism verification, E2E patterns |
| 08 Quality Gates | Dual-agent review | Research validation, architecture review |
| 09 Crisis Mitigation | Learning from failures | Citation crisis, NaN disaster, 150 Math.random() |
| 10 Autonomous Infrastructure | 24/7 operations | Merge orchestrator, predictive watchers |

### The Evolution Pattern (Historical Context)

How the coordination pattern changed under load:

```
HOW WE LEARNED (so you don't have to)
─────────────────────────────────────
Unstructured → No clear assignments
Ad-hoc → Duplicate work, missed tasks
Manual coordination → Slow, error-prone
File-based + Matrix → ✓ Simple, effective, debuggable

WHERE YOU START
───────────────
✓ Task files (simple work coordination)
✓ Matrix (team communication and oversight)
✓ Git (version control and coordination)

WHERE YOU GROW
──────────────
+ MCP servers for specialized tools
+ Claude Skills (pdf, xlsx, docx, pptx processing)
+ Custom automation for your domain
+ Enhanced coordination patterns
```

### Real Production Data

The project it ran on:
- **4,685 commits** in 23 days of November
- **Peak velocity:** 318 commits in one day
- **9 MCP servers** in production
- **11+ named agents** with distinct personalities
- **446 devlogs**, 508 research files, 505 reviews

### Student Projects (Unsolved Problems)

Still open, and worth a student project:
1. **Automatic Grading System** - Scale Layer 2 verification
2. **Parameter Provenance Taxonomy** - Audit ~150 simulation parameters
3. **Memory Consolidation Automation** - LLM-powered compression
4. **Inference-Time Verification** - Mid-reasoning citation validation

These are real unsolved problems with outlined approaches - students work on actual gaps.

---

## Related Courses

- [Prompt Engineering](/GR_JXtd7SauPFrHQRZILLA) - Foundation for agent prompts
- [Context Engineering](/veiyNXoCTASeMfV54OyH-A) - Managing agent context
- [Intro to Agents](/Jmwy6-KFRKatfyB1Bk38HA) - Agent fundamentals

---

*Last Updated: November 2025*

## More recordings for this class

- [Capacity Planning and Ticket Estimation](https://www.loom.com/share/74e1fc92190c40039c7b298914c5b939) — Estimate personal work capacity and translate ticket estimates into a project schedule

---

<!-- agent-chatroom-archive -->
## From the 2024 Agent Chatroom series

Three sessions from an earlier live cohort that built a chat server its own bots joined.
Most of that series teaches a Node and socket.io stack we no longer teach — these three are
about how the work gets planned, sized, and merged, and they have not aged.

- [Sprint Backlog and Grooming Meetings](/IQ5dJe8jQ5K2lIFPx_d1Aw) · 1 recording, 67 min — turning a pile of wants into a groomed backlog
- [Capacity Estimation and Roadmapping](/jgrxzMg_R4upzk7dnRs5TQ) · 1 recording, 49 min — how much work actually fits in the time you have
- [Agent Chatroom with Websockets](/BoHXdOOTTdyZtx76h_kH_Q) · Part 5 is three pull requests against one file, merged live

The repository those sessions worked in is public — [lizTheDeveloper/agent_chatroom](https://github.com/lizTheDeveloper/agent_chatroom).
Its backlog, issues, and student pull requests are real, which makes it a better exercise than
anything invented. Note that several pull requests were never merged, so `main` stops short of
where the recordings end.
<!-- /agent-chatroom-archive -->

→ Explore agent patterns in the [Agent Loop Bench](/tools/agent-loop-bench).
→ Compare models in the [Benchmark Bench](/tools/benchmark-bench).
