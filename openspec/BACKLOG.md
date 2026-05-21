# OpenSpec Backlog

Potential ideas and future proposals for the agentic SDLC framework. Items here are candidates for `openspec-new-change` — they have not yet been proposed, designed, or specced. When an idea is promoted to a full openspec change, remove it from this list and link to the change directory.

---

## Promoted to Changes

The following ideas from the 2026-03-13 curriculum review have been implemented:

| # | Idea | Change |
|---|------|--------|
| 1 | Semantic Memory Retrieval | `curriculum-maturity-advancement` (tasks 4.1-4.7, 5.1-5.3, 6.1-6.3) |
| 2 | Formalized Permission Tiers | `curriculum-maturity-advancement` (tasks 2.1-2.6) |
| 3 | Structured Data Contracts | `curriculum-maturity-advancement` (tasks 1.1-1.6) |
| 4 | Framework Comparison Matrix | `curriculum-maturity-advancement` (tasks 3.1-3.5) |
| 5 | Human Wellness Guardrails | `curriculum-maturity-advancement` (tasks 13.1-13.7) |
| 6 | Human Task Assignment | `curriculum-maturity-advancement` (tasks 12.1-12.8) |
| 7 | Instance Scaling | `curriculum-maturity-advancement` (tasks 9.1-9.7) |
| 8 | Execution Cadence | `curriculum-maturity-advancement` (tasks 10.1-10.4) |
| 9 | NLP Code Analysis | `curriculum-maturity-advancement` (tasks 14.1-14.5) — partially implemented |
| 10 | Agent Evolution Timeline | `curriculum-maturity-advancement` (tasks 7.1-7.6) |
| — | Capability Monitoring | `agent-capability-checklist` (31 tasks) — 29/31 complete, system instrumentation + monitor + docs done (2026-03-13) |
| 17 | Cursor Automations Worker Integration | `cursor-automations-worker-integration` (shipped 2026-05-21) — 2 `.cursor/rules/*.mdc` files + `docs/cursor-automations-playbook.md` for the 7-Automation UI setup |

---

## Remaining Ideas

### 11. Agent-to-Agent Direct Communication Protocol

**Problem:** Agents currently communicate through task handoffs and Matrix messages, but there's no structured protocol for agents to request specific information from each other in real-time (e.g., Roy asking Moss "what embedding model did you use?").

**Idea:** Define a request-response protocol between agents via Matrix, with schema validation on both sides.

**Complexity:** Medium.

---

### 12. Automated Rollback on Deploy Failure

**Problem:** When a deploy fails smoke tests, the rollback is manual. The framework should auto-revert and notify.

**Idea:** Add rollback logic to the deploy pipeline template and notify.mjs.

**Complexity:** Low-medium.

---

### 13. Agent Specialization Branching

**Problem:** As the framework matures, a single backend agent (Roy) may need to specialize into sub-roles (Roy-API, Roy-DB, Roy-Queue). The framework doesn't support role splitting.

**Idea:** Add agent specialization templates and a "split" command that forks an agent's memory and AGENT.md.

**Complexity:** Medium.

---

## Backlog Management

- **To promote an idea**: Run `openspec-new-change` with the idea as the basis for the proposal
- **To reject an idea**: Move it to the "Rejected" section below with a reason
- **To defer an idea**: Leave it here — backlog items have no deadline

### 14. Paperclip Upgrade and Security Patch

**Problem:** Local Paperclip clone at `~/paperclip` is v0.3.0 (last commit 2026-03-13, ~70 days old). Upstream is on `v2026.517.0`. Missing critical security advisory **GHSA-68qg-g8mg-6pr7** (auth-bypass on scoped routes), patched in `v2026.416.0`. Also missing multi-user auth, MCP server beta, and ~7 minor releases of features. Currently the local instance is offline (last log entry 2026-04-15).

**Idea:** Upgrade to latest stable, run `pnpm paperclipai doctor --repair`, validate breaking changes (sandbox plugin now external, secrets enforcement), reconfigure adapters (codex-local currently erroring on missing `codex` CLI).

**Complexity:** Medium-high (breaking changes in v2026.427.0 require validation).

**Priority:** HIGH — security advisory active. **Defer until after `level-6-autonomous-activation` ships on Day 7** unless Paperclip is exposed beyond localhost.

---

### 15. Paperclip Prompt-Caching Contribution

**Problem:** Paperclip's Claude adapter has **zero prompt caching** (verified by inspection of `~/paperclip/packages/adapters/claude-local/`). Every heartbeat re-reads instructions from disk and re-sends the full prompt uncached. For 10 agents with 2K-token instruction files on hourly heartbeats, ~20K uncached tokens/hour are burned on redundant re-sends. Anthropic cache reads cost 0.1× base price — fix would cut effective per-call cost by 85-92%.

**Idea:** Implement three fixes in `~/paperclip`:
1. Add `cache_control: { type: "ephemeral", ttl: "1h" }` to system + tool blocks in the Claude adapter
2. Cache instructions file content by SHA256+mtime in `execute.ts`
3. In-memory agent record cache (60s TTL) in `heartbeat.ts`

Open a PR upstream to `paperclipai/paperclip`. High career-signal value — a merged upstream PR is a stronger demo than a personal framework.

**Complexity:** Medium (refactor stdin→SDK structured messages required for #1; #2 and #3 are tight scoped).

**Priority:** Medium-high. Run AFTER Level 6 ships (Day 7+). Coordinate with #14 upgrade.

---

### 16. Memory System ACE Patterns Adoption

**Problem:** Our 5-layer memory consolidates via REM sleep using LLM judgment to decide what to promote/prune. Without quality counters per entry, we can't measure whether consolidation is improving or degrading memory quality. ACE (ace-agent/ace, MIT 1.1k stars, Nov 2025) demonstrates that incremental delta updates with helpful/harmful counters prevent "context collapse" — where wholesale rewrites lose accumulated knowledge.

**Idea:** Port three ACE patterns into our memory system (do NOT integrate the Python code; we are zero-dep Node):
1. **Helpful/harmful counters per memory entry** — each entry gets `{id, helpful: N, harmful: N, text}`. Each task outcome increments the relevant counters of memories the agent consulted. REM sleep prunes high-harmful, promotes high-helpful.
2. **Reflector / Curator role split** — REM sleep becomes two passes: Reflector (mark recent outcomes against memories consulted) and Curator (apply promote/demote/dedup deltas).
3. **Append-only delta updates** — REM sleep emits a delta log instead of rewriting `core.json` / `long-term.json` in place. Prior knowledge is always recoverable.

**Complexity:** Medium.

**Priority:** Low-Medium. Wait until Level 6 has run ~30 days so we have memory-quality data to validate against.

**Sources:** [ace-agent/ace](https://github.com/ace-agent/ace), [ACE paper](https://arxiv.org/abs/2510.04618)

---

## Rejected

(none yet)
