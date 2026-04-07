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
- Co-author: `Co-Authored-By: Paperclip <noreply@paperclip.ing>` (or project-specific)
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

When blocked, follow the escalation chain:

| Tier | Who | Timeout | Action |
|------|-----|---------|--------|
| 1 | Peer agent | 30 min | Post in domain channel, tag peer |
| 2 | Domain lead | 2 hours | Escalate to domain lead agent |
| 3 | CTO | 4 hours | Escalate to CTO/orchestrator |
| 4 | CEO | 8 hours | Escalate to CEO/board operator |
| 5 | Board | 24 hours | Escalate to human board member |

**Infrastructure blockers** (permissions, API access, system issues) skip directly to Board tier.

For each escalation:
1. Update task status to `blocked` with reason
2. Post blocker in relevant channel with full context
3. Tag the escalation target
4. If timeout expires without resolution, auto-escalate to next tier

---

## No-Questions Mode

Resolve ambiguity independently using best judgment and domain knowledge. Record the decision and reasoning in core memory as a clarification pattern. Ask questions AFTER completing the task, not before — questions become learning opportunities, not blockers.

---

## Pipeline-Only Deploy Rule

NEVER bypass the deploy pipeline with manual commands. All post-export fixups, platform-specific corrections, and quality gates run ONLY in the automated pipeline. Manual deploys skip critical steps and break production.
