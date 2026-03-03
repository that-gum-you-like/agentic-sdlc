# Iteration Cycles

The agentic SDLC operates across four nested time horizons. Micro cycles run inside daily cycles, which roll up into weekly cycles, which feed into monthly cycles. Each level has its own rhythm and concerns.

---

## Micro Cycle (Minutes)

The atomic unit of work. Every requirement follows this loop.

```
1. Pick Requirement
       |
2. Implement
       |
3. Write Tests
       |
4. Run Tests
      / \
   Pass  Fail
    |      |
5. Commit  Fix and Retry (back to step 2)
    |
6. Next Requirement
```

Rules:
- Never commit without passing tests.
- Write tests before or immediately after implementation — never skip.
- Keep commits atomic: one logical change per commit.
- If fix-and-retry exceeds three attempts, escalate or decompose the requirement further.

---

## Daily Cycle (Hours)

Structures the human-agent collaboration across a full day.

| Time | Phase | Activity |
|------|-------|----------|
| 23:00–06:00 | Overnight Work | Agents run autonomously on queued tasks |
| 06:00 | Morning Review | Human reviews overnight output, merges, flags exceptions |
| 08:00–22:00 | Work Hours | Human + agent collaborative development, new tasks queued |
| 22:00 | Tech Debt | Pay down accumulated debt, clean up incomplete work |

Notes:
- Morning review is the primary human checkpoint. Keep it focused on exceptions and blockers.
- Work hours generate the queue that feeds overnight work.
- Tech debt hour prevents compounding rot — skip it at your own risk.

---

## Weekly Cycle

Higher-order maintenance that keeps the system healthy and improving.

1. **Pattern Review** — What mistakes recurred this week? Name them specifically.
2. **Memory Cleanup (REM Sleep)** — Prune recent memory, promote important items to long-term, archive stale entries.
3. **Checklist Update** — Add new items for patterns found in step 1. Every recurring mistake needs a checklist entry.
4. **Defeat Tests** — Write tests that permanently prevent the patterns identified in step 1.

The weekly cycle is where the system learns. Skipping it means mistakes compound.

---

## Monthly Cycle

Strategic review of the system itself, not just the work.

1. **Behavior Audit** — Check for drift. Are agents still following their character sheets and checklists? Run behavior tests.
2. **Agent Versioning** — Review agent prompts. Increment versions for any significant changes. Update memory migration if needed.
3. **Compost Cleanup** — Review the compost layer of agent memory. Archive truly dead ideas. Delete noise.
4. **Cost Review** — Analyze token usage by agent and task type. Identify optimization opportunities. Adjust budgets.

---

## Cycle Relationships

```
Monthly
  └─ Weekly (x4)
       └─ Daily (x7)
            └─ Micro (x many)
```

Work flows upward: patterns discovered in micro cycles get documented in weekly cycles, validated in monthly cycles, and reflected back as improved agent behavior in the next micro cycle.

---

## Token Budget Reference

As a rough guide for cost estimation during cycle planning:

| Task Type | Model Tier | Token Range |
|-----------|------------|-------------|
| Simple bug fix | Haiku | 2,000–5,000 |
| New feature | Sonnet | 10,000–30,000 |
| Architecture decision | Sonnet / Opus | 20,000–50,000 |
| Research / exploration | Opus | 30,000–100,000 |

Trigger conservation mode at 80% of per-agent budget. Circuit breakers prevent runaway cost from loops or errors.
