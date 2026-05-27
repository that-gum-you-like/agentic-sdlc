# Appendix: Plans Directory + Autonomous Operation

**Source**: CLAUDE.md (pre-split 2026-05-27). Combines the Plans Directory Convention and Autonomous Operation sections.

---

## Plans Directory Convention

Projects use a `plans/` directory for persistent planning artifacts:

```
plans/
├── requirements.md          # REQ-xxx numbered requirements
├── priorities.md            # Value/complexity scores, priority matrix
├── roadmap.md               # Phased delivery plan (active work only)
├── parallelization.md       # Dependency graphs, work streams, contracts
├── devlog.md                # Append-only narrative progress journal
├── [feature]-plan.md        # Complex feature plans (linked from roadmap)
└── completed/
    └── roadmap-archive.md   # Completed roadmap items with dates
```

`setup.mjs` creates `plans/` and `plans/completed/` automatically.

### Dev Log Convention

Agents append entries to `plans/devlog.md` after completing tasks:

```markdown
### 2026-03-13 — Roy — T-042
- Implemented user auth endpoints
- Added 12 unit tests (all passing)
- Fixed edge case: empty email validation
```

### Roadmap Gardening

Periodically archive completed roadmap items to keep the active roadmap focused:

```bash
node ~/agentic-sdlc/agents/garden-roadmap.mjs              # Execute
node ~/agentic-sdlc/agents/garden-roadmap.mjs --dry-run     # Preview
node ~/agentic-sdlc/agents/garden-roadmap.mjs --status       # Stats
```

---

## Autonomous Operation

Launch agents headlessly for autonomous work:

```bash
bash ~/agentic-sdlc/agents/autonomous-launcher.sh --agent roy        # Specific agent
bash ~/agentic-sdlc/agents/autonomous-launcher.sh --task T-042       # Specific task
bash ~/agentic-sdlc/agents/autonomous-launcher.sh --dry-run          # Preview prompt
```

The launcher checks the roadmap/queue, claims work, executes the micro cycle, updates the dev log, and auto-commits. See `framework/prompt-playbook.md` for scheduling patterns.
