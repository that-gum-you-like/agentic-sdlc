# Level 2: Automated -- AI Writes, Tests, and Commits

At Level 1, the AI follows your conventions. At Level 2, it earns the right
to commit by proving every change passes tests first. This is the micro cycle:
implement, test, commit.

## Prerequisites

- Level 1 complete (CLAUDE.md exists with project conventions)
- A test framework configured and working (Jest, pytest, Go test, etc.)
- At least some existing tests to validate against

## What You'll Add

- Micro cycle discipline: implement -> test -> commit
- Test command in your project configuration
- Rules that prevent commits with failing tests

## Steps

1. **Verify your test command works.** Run it manually and confirm it exits
   with code 0 on success, non-zero on failure:

   ```bash
   npm test          # Node/JS
   pytest            # Python
   go test ./...     # Go
   cargo test        # Rust
   ```

   If this fails, fix your test setup before proceeding.

2. **Add testing rules to CLAUDE.md.** Be explicit:

   ```
   ## Testing Rules
   - Every change must include tests. No exceptions.
   - Never commit without running the full test suite.
   - Never commit if any test is failing.
   - Test command: npm test
   - If a test fails, fix the code (not the test) unless the test is wrong.
   ```

3. **Establish the micro cycle.** Each unit of work follows this sequence:

   - **Implement** the change (new feature, bug fix, refactor).
   - **Write tests** that cover the change.
   - **Run the full test suite** -- not just the new tests.
   - **Commit only if all tests pass.** If they fail, fix and re-run.
   - **Move to the next task.** One commit per logical change.

4. **Optional: add a pre-commit hook.** This catches mistakes even when
   the agent forgets:

   ```bash
   # .git/hooks/pre-commit
   #!/bin/sh
   npm test || exit 1
   ```

   Make it executable: `chmod +x .git/hooks/pre-commit`

5. **Optional: add commit message conventions.** Standardize what the
   agent writes:

   ```
   ## Commit Messages
   - Format: "<type>: <description>" (e.g., "fix: resolve null check in auth")
   - Types: feat, fix, refactor, test, docs, chore
   - Keep the first line under 72 characters
   ```

## Validation

Your setup is working when:

- The AI never commits with failing tests.
- Every commit includes both implementation and test changes.
- Running `git log --oneline` shows a clean history of passing commits.
- A pre-commit hook (if added) catches any slip-ups.

Test it: ask the agent to implement a feature. Verify the commit includes
tests and that the full suite passed before the commit was created.

## Next Level

When a single agent is not enough -- you have a queue of tasks, multiple
domains, or want parallel work -- move to Level 3 for multi-agent
orchestration. See `docs/levels/level-3-orchestrated.md`.
