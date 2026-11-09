---
role_keywords: ["new agent", "agent proposal", "specialize"]
archetype: "agent-proposal"
template_type: "proposal"
---

# Agent Proposal Template

Use this template to propose a new specialized agent when you observe a recurring pattern in the codebase that warrants dedicated expertise. Every field is required — incomplete proposals return to the requester.

---

## Observed Pattern

Describe the recurring task, error, or domain pattern that motivates a new agent. Be specific: cite file paths, repeated anti-patterns, or frequently requested capabilities that a generic agent handles poorly today.

> **Example:** "Three times in the last sprint a developer needed to audit a Pull Request for security-sensitive patterns (hardcoded credentials, SQL injection vectors, overly permissive CORS) and each time the reviewer agent lacked the security-specific checklist to catch them consistently."

---

## Proposed Agent

Define the agent's role, responsibilities, and boundary.

| Field | Description |
|-------|-------------|
| **Name** | Short identifier, lower-kebab-case (e.g. `security-auditor`) |
| **Role** | One-line role title (e.g. "Security Auditor") |
| **Domain** | Files, patterns, and decision areas this agent owns |
| **Reports To** | Existing agent or `board` |
| **Delegates To** | Existing agents this one can delegate work to |
| **Template Source** | Execution agent template in `agents/templates/execution-agents/` this derives from (or `new`) |

---

## Evidence (task ids)

List the concrete task IDs or PR numbers that demonstrate the pattern. Each entry should include the task ID, a one-line summary of the task, and the specific gap it exposed.

| Task ID | Summary | Gap |
|---------|---------|-----|
| `OS-curriculum-v2-conformance-NNN` | *e.g. Secret scanning was missed by code-reviewer* | Dx-xx |
| | | |

---

## Trial Period

Define the trial parameters. A proposal without a trial period is not actionable.

- **Duration:** e.g. 2 sprints / 7 days / 5 tasks
- **Scope:** Which file types, domains, or lanes the trial agent covers
- **Metrics:** How success will be measured (first-attempt pass rate, tasks completed, human corrections received)
- **Constraints:** Any guardrails (e.g. "must pair with reviewer agent", "no deploy permissions")

---

## Exit Criterion

Specify the conditions that determine the outcome at the end of the trial.

- **Promote** (permanent agent): metric thresholds met, fewer than N human corrections, demonstrable value added
- **Modify** (iterate): partial success with clear improvement areas — list each gap
- **Retire** (revert to generic): pattern proved insufficiently frequent, or generic agent improved enough to handle it

Record the decision in `pm/agent-decisions.md` with a cross-reference to this proposal.

---

> **After the proposal is accepted:** Create the agent's `AGENT.md` from `agents/templates/AGENT.md.template`, set up `agents/<name>/memory/` with the five-layer structure, register the agent in `agents/project.json` and `framework/agent-routing.md`, then link this proposal from `framework/agent-lifecycle.md`.
