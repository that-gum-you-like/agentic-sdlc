# Agent Handoff Report

## Task ID and Status

- **Task ID:** T-XXX
- **Title:** [Task title from queue JSON]
- **Status:** completed | blocked | needs-review
- **Agent:** [Your agent name]
- **Started:** [ISO timestamp]
- **Completed:** [ISO timestamp]

---

## What Was Done

Describe the changes made, with specific file paths and line numbers.

- `path/to/file.ts` (lines 42-68): [What changed and why]
- `path/to/other-file.ts` (lines 10-25): [What changed and why]
- `path/to/new-file.test.ts` (new): [What this test covers]

---

## What's Left

List any remaining work. If the task is fully complete, write "Nothing — task is complete."

- [ ] [Remaining item 1]
- [ ] [Remaining item 2]

---

## Blockers / Risks

List anything that blocks progress or poses a risk. If none, write "None."

- **Blocker:** [Description, e.g., "Depends on T-YYY which is not yet complete"]
- **Risk:** [Description, e.g., "API contract may change when backend task lands"]

---

## Test Results

Summarize test outcomes. Include counts and specifics.

- **Total suites:** [N]
- **Passing:** [N]
- **Failing:** [N]
- **New tests added:** [N]
- **Tests that were passing before and still pass:** Yes / No

### New Tests
| Test Name | File | Status |
|-----------|------|--------|
| [test name] | `path/to/test.ts` | passing |

### Failed Tests (if any)
| Test Name | File | Failure Reason |
|-----------|------|----------------|
| [test name] | `path/to/test.ts` | [reason] |

---

## Memory Updates

What was written to the agent's memory files after this task.

- **recent.json:** [Summary of what was recorded]
- **medium-term.json:** [If updated, what was added — otherwise "No change"]
- **long-term.json:** [If updated, what was added — otherwise "No change"]
- **core.json:** [If a failure memory was added, describe it — otherwise "No change"]
- **compost.json:** [If a deprecated approach was recorded — otherwise "No change"]

---

## Self-Assessment Checklist

Every item must be checked before handing off. If an item cannot be checked, explain why.

- [ ] **Tests pass** — Full test suite runs green after my changes
- [ ] **Defeat tests pass** — Anti-pattern scans show no new violations
- [ ] **No regressions** — Tests that passed before still pass
- [ ] **Code reviewed** — I re-read my own diff and it is clean
- [ ] **Memory updated** — recent.json (and other layers if needed) reflect this work
- [ ] **Docs updated** — Any affected documentation or comments are current
- [ ] **Commit atomic** — One logical change per commit, clear message
- [ ] **Ready for next agent** — No loose ends, no silent failures, no TODO hacks

---

## Next Agent Recommendation

Which agent should pick up the next related task, and why.

- **Recommended agent:** [agent name or role, e.g., "frontend" or "reviewer"]
- **Suggested next task:** [T-XXX or description]
- **Reason:** [Why this agent is the right next step]
- **Context they need:** [Any critical context the next agent should read before starting]
