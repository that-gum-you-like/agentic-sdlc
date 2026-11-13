# Shared Agent Protocol

All agents in this project follow these standard procedures. Agent-specific rules are in each agent's AGENT.md.

---

## Memory Protocol

### Before Every Task
1. Read `agents/<agent>/memory/core.json` — values, rules, failures
2. Read `agents/<agent>/memory/long-term.json` — patterns and decisions
3. Read `agents/<agent>/memory/medium-term.json` — current sprint context
4. Check mailbox: `node ~/agentic-sdlc/agents/notify.mjs check-mailbox`

### After Every Task
1. Write session summary to `agents/<agent>/memory/recent.json`
2. If a pattern or lesson emerged → add to `medium-term.json` or `long-term.json`
3. If a mistake was made → record in `core.json` failures with severity:
   - **critical** → add immediate rule to AGENT.md non-negotiable rules
   - **high** → add to reviewer checklist
   - **medium** → add as watch pattern to `long-term.json`

---

## Heartbeat Procedure (8 Steps)

1. Read this SHARED_PROTOCOL.md
2. Load memory (core, long-term, medium-term)
3. Check inbox for assigned tasks
4. Prioritize: `in_progress` before `todo`
5. Execute domain work following the micro cycle
6. Update task status (mark done/blocked with comments)
7. Post in relevant communication channel
8. Pick next task, update memory

---

## Communication Standards

### Commits
- Format: `type(scope): description`
- Types: feat, fix, refactor, test, docs, chore
- Include task ID: `feat(auth): add login endpoint [T-042]`
- Co-author: `Co-Authored-By: the orchestrating system` (or project-specific)
- One logical change per commit

### Channel Posting
- Post task completion to domain-specific channel
- Post blockers with specific context (what's blocked, why, who can help)
- Keep messages factual and actionable

---

## Quality Gates (All Required Before Marking Done)

- [ ] Tests written and passing (happy path + at least one error case)
- [ ] Code review approved (if reviewer agent configured)
- [ ] Matches specification / task description
- [ ] No unresolved blockers
- [ ] Documentation updated for any changed APIs or signatures (doc-as-code: same task, not follow-on)
- [ ] Commit message clear and includes task ID
- [ ] Memory updated with session summary

---

## Escalation Protocol

When blocked, follow the escalation chain. Escalation routes through your
`reportsTo` chain (defined in each agent's AGENT.md front matter) before
reaching the board.

| Tier | Who | Timeout | Action |
|------|-----|---------|--------|
| 1..N | reportsTo chain | 30 min per hop | Escalate up your `reportsTo` chain: start with your immediate reporting manager (the agent named in `reportsTo`). If unresolved, they escalate to *their* `reportsTo`, continuing until `board` is reached. |
| Final | Board | 24 hours | Escalate to human board member |

**reportsTo chain:** Each agent declares `reportsTo` in AGENT.md (defaults to
`board`). When an agent is blocked, escalation begins with its immediate
`reportsTo`. If that target does not resolve the blocker within the timeout,
the recipient routes it to their own `reportsTo`, and so on up the chain.
The chain ends at `board` (the human operator).

**Infrastructure blockers** (permissions, API access, system issues) skip
directly to Board tier.

For each escalation:
1. Update task status to `blocked` with reason
2. Post blocker in relevant channel with full context
3. Tag the escalation target
4. If timeout expires without resolution, auto-escalate to the next hop in the `reportsTo` chain (or to Board if the reporting chain is exhausted)
5. When escalation completes, the task comment names the `reportsTo` chain that was walked

---

## No-Questions Mode

Resolve ambiguity independently using best judgment and domain knowledge. Record the decision and reasoning in core memory as a clarification pattern. Ask questions AFTER completing the task, not before — questions become learning opportunities, not blockers.

---

## Agent Log (CoffeeTalk)

An append-only inter-agent log at `pm/coffeetalk.md` enables agents to share
observations, handoffs, and awareness without infrastructure.

Each line follows this format:
```
- <ISO time> @from -> @to: message
```

**Rules:**
1. **Append only** — never edit or delete an existing line.
2. **Read tail at turn start** — read the last 20 lines before choosing work.
3. **No infrastructure** — just a text file. No message queue or database needed.

---

## Ambiguous Verbs and Data Safety

Task descriptions sometimes use verbs whose scope and destructiveness are
ambiguous — they can be read as authorising deletion, rewriting, or other
destructive operations on data without naming the target.

**The following verbs MUST always carry a named scope** (file path, table name,
function name, or data domain) whenever they appear in a task description:

- *optimize*
- *clean up*
- *simplify*
- *tidy*

**Examples of properly scoped usage:**
- "Optimize the `UserRepository` class" ✓
- "Clean up unused imports in `services/payment.js`" ✓
- "Simplify the `renderDashboard` function" ✓

**Examples of dangerously ambiguous usage:**
- "Optimize the system" ✗ — no scope, could authorise anything
- "Clean up the database" ✗ — no scope, could authorise deletions
- "Tidy up the code" ✗ — no scope, implicitly authorises rewriting

**Rules:**
1. **Never authorise deleting or rewriting data** unless the task explicitly
   names the target and specifies the operation (e.g. "Remove the `legacyFlag`
   column from the `users` table").
2. **No scope → needs-human.** If a task uses an ambiguous verb without a
   named scope, escalate to the human operator rather than guessing intent.
3. **Data safety is non-negotiable.** When in doubt, preserve existing data and
   escalate.

---

## Pipeline-Only Deploy Rule

NEVER bypass the deploy pipeline with manual commands. All post-export fixups, platform-specific corrections, and quality gates run ONLY in the automated pipeline. Manual deploys skip critical steps and break production.
