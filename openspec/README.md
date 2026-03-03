# OpenSpec Workflow

OpenSpec is the mandatory change management workflow for this project. Every non-trivial change — new features, significant refactors, architecture decisions — must go through OpenSpec before implementation begins.

The workflow exists to prevent two failure modes: (1) building the wrong thing, and (2) building the right thing in the wrong way. Spending 30 minutes on a proposal and design saves hours of rework.

---

## Phases

### 1. Proposal

Start here. Answer: what are we doing, why, and is it worth doing?

The proposal captures the problem, the proposed solution, and a value analysis. If the value does not justify the cost, the change does not proceed.

**Skill**: `openspec-new-change`

Template: `openspec/templates/proposal.md.template`

---

### 2. Design

Expand the proposal into a technical design. Answer: how will we build it?

The design documents context (what exists today), goals and non-goals (what this change will and will not do), and key decisions (the technical choices made and why). This is the document that prevents architecture regret.

**Skill**: `openspec-continue-change` (phase: design)

Template: `openspec/templates/design.md.template`

---

### 3. Specs

Write acceptance criteria. Answer: how will we know it works?

Specs are written in WHEN/THEN/AND format — scenario-based, behavior-driven, implementation-agnostic. These become the basis for tests. If you cannot write a spec for a behavior, you do not fully understand the requirement yet.

**Skill**: `openspec-continue-change` (phase: specs)

Template: `openspec/templates/spec.md.template`

---

### 4. Tasks

Break the design into discrete, implementable tasks. Answer: what work needs to happen?

Tasks are small enough that each one can be completed, tested, and committed in a single session. Each task references the spec it satisfies. Tasks are written as a checkbox list so progress is visible.

**Skill**: `openspec-continue-change` (phase: tasks)

Template: `openspec/templates/tasks.md.template`

---

### 5. Implement

Execute the tasks. Agents pick up tasks from the queue, implement them, write tests, and commit. The status file tracks progress.

**Skill**: `openspec-apply-change`

---

### 6. Archive

When all tasks are complete and the change is deployed, move the change directory to `openspec/archive/`. Keep the history — the reasoning in these documents is worth preserving.

---

## File Structure

Each change lives in its own directory under `openspec/changes/<change-name>/`:

```
openspec/changes/<change-name>/
  proposal.md      # Why and what
  design.md        # How
  spec.md          # Acceptance criteria
  tasks.md         # Implementation checklist
  status.json      # Current phase and status
```

---

## Rules

- **Never skip phases.** A proposal without a design has no plan. A design without specs has no definition of done. Tasks without specs produce untestable work.
- **Never implement without a task.** If work is not in the task list, it is not authorized. Add a task first.
- **Status must reflect reality.** Update `status.json` as phases complete. Stale status is misleading.
- **Proposals can be rejected.** Not every idea should be built. The value analysis exists to catch low-value changes before they consume time.
