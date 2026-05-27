## Context

New users come to the agentic-sdlc repo in one of these scenarios:
1. "I saw this on GitHub, I want to try it" — they clone, open in their IDE, ask their AI agent "what is this and how do I use it"
2. "Someone told me to integrate this" — they have an existing project and want to add the framework
3. "I want to understand multi-agent SDLC" — they're learning, not building yet

The AI agent they're using could be Claude Code (has bash, read, write, agent tools), Cursor (has file editing, terminal, chat), Windsurf (similar to Cursor), Copilot (limited to suggestions), or a local agent (varies wildly). The onboarding must work across all of these.

## Goals / Non-Goals

**Goals:**
- Any AI agent that reads the repo can guide a user through integration
- Integration is adaptive — discovers what exists before prescribing
- Users can adopt one level at a time — no all-or-nothing
- Works with zero AI agent capabilities (human can follow the guide manually too)
- Entry points are discoverable (README links, IDE-standard files like .cursorrules)

**Non-Goals:**
- Building a CLI wizard that replaces AI agents — the AI agent IS the wizard
- Supporting non-English documentation
- Video tutorials or interactive websites
- Forcing users to use specific AI tools

## Decisions

### D1: ONBOARDING.md is the primary AI-agent entry point

This file is written AS INSTRUCTIONS FOR AN AI AGENT, not as documentation for a human. It uses second-person imperative ("Read the user's package.json", "Ask the user which agents they want") because the reader IS an AI agent following a protocol.

However, it's also human-readable — a developer can follow the same steps manually.

**Structure:**
```
# Agentic SDLC — Onboarding Guide

## For AI Agents
You are helping a user integrate the Agentic SDLC framework...

## Step 1: Discover the Project
[read files, detect stack, understand current process]

## Step 2: Assess Current Maturity
[map their current practices to maturity levels]

## Step 3: Choose Starting Level
[recommend based on assessment, let user decide]

## Step 4: Integrate Level by Level
[link to progressive guides]

## Step 5: Validate
[run tests, verify setup, confirm working]
```

**Why ONBOARDING.md and not just README.md?** README serves dual duty (GitHub landing page + developer reference). ONBOARDING.md is purely instructional — it's the "playbook" the AI agent follows. README links to it.

### D2: .cursorrules and .windsurfrules mirror ONBOARDING.md

Cursor reads `.cursorrules` automatically when a project is opened. Windsurf reads `.windsurfrules`. By placing these files at the repo root, users of those IDEs get onboarding guidance without being told to read anything.

Content is a condensed version of ONBOARDING.md — focused on what the AI should do first and how to guide the user.

### D3: Discovery before prescription

The biggest integration failure is prescribing a full framework to a project that already has some of these practices. The onboarding guide starts with DISCOVERY:

1. Read `package.json` / `requirements.txt` / `Cargo.toml` — what language and dependencies?
2. Check for test framework (`jest.config`, `pytest.ini`, `cargo test`)
3. Check for CI (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`)
4. Check for existing agent config (`.cursorrules`, `CLAUDE.md`, `agents/`)
5. Check for existing task management (`tasks/`, issue tracker integration)
6. Check git history — how many contributors? How active?

The AI agent uses this to make smart recommendations: "You already have Jest and GitHub Actions, so we'll skip the test setup and CI sections. Let's focus on adding the memory system and task queue."

### D4: Progressive levels are standalone guides

Each `docs/levels/level-N-*.md` is a complete, self-contained guide for that maturity level. A user at Level 2 doesn't need to read Level 1. Each guide has:

- **Prerequisites**: What must already be in place
- **What you'll add**: Specific files, scripts, and practices
- **Step-by-step**: Numbered actions the AI agent (or human) follows
- **Validation**: How to confirm this level is working
- **Next level**: What to consider when ready to advance

### D5: README.md restructured for scanning

The current README is comprehensive but front-loads too much detail. Restructure to:

1. **Hero section** — 3 sentences: what, why, how
2. **Quick start** — "Point your AI agent at this repo" + 3 alternative paths
3. **What's included** — bullet list of key features (not exhaustive)
4. **Maturity model overview** — the 7 levels as a simple list
5. **Detailed reference** — everything else (collapsed or below the fold)

### D6: setup.mjs --discover outputs JSON

The `--discover` flag scans the target directory and outputs a structured JSON report:
```json
{
  "language": "typescript",
  "framework": "react-native",
  "testFramework": "jest",
  "ci": "github-actions",
  "hasExistingAgents": false,
  "hasTaskQueue": false,
  "hasMemory": false,
  "packageManager": "npm",
  "suggestedAgents": ["backend", "frontend", "reviewer"],
  "suggestedLevel": 2
}
```

AI agents can parse this to make integration decisions without re-doing the discovery themselves.

## Risks / Trade-offs

- **[Risk] AI agents ignore ONBOARDING.md and read CLAUDE.md first** → Mitigation: CLAUDE.md's first line will say "If you're helping a user set up this framework, read ONBOARDING.md first." README also links prominently.
- **[Risk] .cursorrules gets out of sync with ONBOARDING.md** → Mitigation: .cursorrules is intentionally minimal — it points to ONBOARDING.md rather than duplicating content.
- **[Risk] Progressive guides create maintenance burden** → Mitigation: Each guide is short (under 100 lines) and references framework docs rather than duplicating them.

## Open Questions

None — design is straightforward.
