# Level 1: Assisted -- Adding AI to Your Workflow

Your AI coding agent is only as good as the context you give it. At Level 1,
you create a project knowledge file so the agent follows your conventions
from the first prompt.

## Prerequisites

- A project with source code in a git repository
- An AI coding agent (Claude Code, Cursor, etc.)

## What You'll Add

A `CLAUDE.md` file (or `.cursorrules`) in your project root containing
project-specific instructions that persist across sessions.

## Steps

1. **Create CLAUDE.md in your project root.** Include the following sections:

   - **Project description**: One paragraph explaining what the project does.
   - **Tech stack**: Languages, frameworks, databases, key libraries.
   - **Coding conventions**: Naming, file organization, import style.
   - **Test command**: The exact command to run tests (e.g., `npm test`).
   - **Important file paths**: Entry points, config files, shared utilities.
   - **Things to avoid**: Anti-patterns, deprecated APIs, forbidden dependencies.

2. **Add project-specific rules.** Be explicit about standards:

   ```
   - Use TypeScript strict mode. No `any` types.
   - Follow REST conventions for API endpoints.
   - All database access goes through repository classes, never direct queries.
   - Components use CSS modules, not inline styles.
   ```

3. **Document existing patterns.** Tell the agent how your codebase works:

   ```
   - We use the service/repository pattern for backend logic.
   - Tests live next to source files (e.g., user.service.ts / user.service.test.ts).
   - Shared types are in src/types/. Import from there, don't redeclare.
   - Environment variables are accessed through src/config.ts, never process.env directly.
   ```

4. **Commit the file.** CLAUDE.md is part of your project -- version it.

   ```bash
   git add CLAUDE.md
   git commit -m "Add CLAUDE.md with project conventions for AI agents"
   ```

## Validation

Your setup is working when:

- The AI agent follows your coding conventions without being reminded each session.
- Generated code matches your project's naming and file organization patterns.
- The agent uses the correct test command and knows where key files live.

Test it: ask the agent to add a small feature. Check that the output matches
your conventions without any manual correction.

## Next Level

When you are comfortable with AI writing code that matches your standards, move to [Level 2: AI Writes, Tests, and Commits](level-2-automated.md).
