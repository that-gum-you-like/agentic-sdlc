# Workshop 1: Planning and Requirements

Before you write any code, you need to know what you're building. Not in the vague "I want an app" way — in the "here are the user stories, here are the success metrics, here is what happens when someone opens it for the first time" way.

The whole trick of agentic development is: **text to text to text to text to code.** It's not idea to app. It's idea to brain dump to requirements document to spec to implementation plan to code. Each stage is text that an AI can help you write, and each stage catches problems that would be expensive to find later.

## Install Claude Code

You need Claude Code for this course. The $20/month Max plan works; the $100 or $200/month plans give you more usage if you're coding all day.

```bash
npm install -g @anthropic-ai/claude-code
cd your-project
claude
```

> **Note:** The video references older Claude Code setup steps. The install is simpler now. See [claude.ai/code](https://claude.ai/code) for current docs.

## The Brain Dump

Before you organize anything, you need to get everything out of your head. Set a timer for 30 minutes. Talk or type — dictation is usually better because you think faster than you type.

Describe what you want to build like you're explaining it to a friend:
- What does it do?
- Who is it for?
- What's the first thing someone sees when they open it?
- What problem does it solve that nothing else solves?
- What existing thing is it most like, and how is it different?

Don't edit yourself. Don't organize. Just dump. The requirements reviewer agent will help you turn this mess into structure.

## The Requirements Reviewer Agent

There's a prompt template that turns your brain dump into a real requirements document. It's a rubric — it checks your dump against a checklist:

- **Purpose and scope** — what is this, who is it for
- **Business goals** — what does success look like (numbers, not feelings)
- **User stories** — "As a [type of user], I want to [action] so that [outcome]"
- **Technical constraints** — what does it need to run on, what can't it use
- **Non-functional requirements** — performance, security, accessibility

The agent reads your brain dump and asks you questions about everything you forgot. It's better at finding gaps than you are because it has a checklist and you have enthusiasm.

## User Stories

A user story is a tiny narrative: *"As a new user, I want to see a help experience that explains how to use the app."* Or: *"As a power user, I want a year-end report of all my usage."*

Write these for every type of person who will touch your system:
- New users (onboarding)
- Regular users (daily workflow)
- Power users (advanced features)
- Admins (management tools)
- The person paying for it (ROI visibility)

Each story becomes a testable requirement. If you can't write user stories for it, you don't understand it well enough to build it.

## OpenSpec

[OpenSpec](https://github.com/openspec-ai/openspec) is the format we use for requirements documents. It's markdown — readable by humans, parseable by AI agents.

Your brain dump goes to the requirements reviewer, which becomes an OpenSpec document, which becomes an implementation plan. Each step is a conversation with Claude where you refine what you started.

**Do this now:**
1. Open Claude Code in a new project directory
2. Brain dump for 30 minutes (talk or type)
3. Paste the requirements reviewer prompt and feed it your dump
4. Keep answering its questions until it stops asking

→ Explore agent patterns in the [Agent Loop Bench](/tools/agent-loop-bench).
