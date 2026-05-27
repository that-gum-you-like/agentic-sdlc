# Appendix: Script Reference

**Source**: CLAUDE.md (pre-split 2026-05-27). The slim CLAUDE.md points here instead of embedding the full table.

---

| Script | Purpose |
|--------|---------|
| `agents/queue-drainer.mjs` | Task queue management + human task queue |
| `agents/worker.mjs` | Generate agent prompts for subagent spawning |
| `agents/seed-queue.mjs` | Initialize task queue from seed-tasks.json template |
| `agents/review-hook.mjs` | Post-commit review hook (install/run) |
| `agents/memory-manager.mjs` | 5-layer memory CRUD + maturation tracking |
| `agents/rem-sleep.mjs` | Automated memory consolidation (+ similarity dedup) |
| `agents/migrate-memory.mjs` | Memory migration on prompt upgrades |
| `agents/version-snapshot.mjs` | Agent version snapshots |
| `agents/cost-tracker.mjs` | Token usage, efficiency metrics, session hours |
| `agents/test-behavior.mjs` | Agent prompt quality + maturation regression |
| `agents/four-layer-validate.mjs` | AST anti-pattern scanning |
| `agents/ast-analyzer.mjs` | TypeScript semantic analysis |
| `agents/pattern-hunt.mjs` | Review pattern mining (+ semantic clustering) |
| `agents/cycles/daily-review.mjs` | Daily summary + dashboard + bottleneck detection |
| `agents/cycles/weekly-review.mjs` | Weekly review + REM sleep + maturation metrics |
| `agents/matrix-client/matrix-cli.mjs` | Matrix communication CLI (+ schema validation) |
| `agents/notify.mjs` | Notification, approval, wellness checks |
| `agents/mailbox-sync.mjs` | Sync inbound WhatsApp messages to mailbox |
| `agents/semantic-index.mjs` | Vector embedding index for semantic memory search |
| `agents/embed.py` | Local embedding generation (sentence-transformers) |
| `agents/schema-validator.mjs` | JSON Schema validation for inter-agent data contracts |
| `agents/capability-monitor.mjs` | Capability drift detection, usage reports, health checks |
| `agents/alignment-monitor.mjs` | Unified quality/alignment check, prompt suggestions, self-improving checklist |
| `agents/model-manager.mjs` | Token budget monitoring, predictive swaps, cross-provider recommendations, model intelligence, quality-aware routing |
| `agents/model-intel.json` | Model intelligence database: costs, strengths, limitations for all providers |
| `agents/maturity-assess.mjs` | Platform maturity assessment: 8-dimension scoring, DORA metrics, production readiness |
| `agents/adapters/load-adapter.mjs` | Dynamic adapter loader for orchestration and LLM providers |
| `agents/paperclip-sync.mjs` | Push SDLC agent config (model, role, instructions) → Paperclip |
| `agents/garden-roadmap.mjs` | Archive completed roadmap items, keep roadmap focused |
| `agents/autonomous-launcher.sh` | Headless Claude Code launcher for autonomous operation |
| `agents/voice-intake.sh` | Terminal-based voice input with multiple modes |
| `agents/voice-intake-toggle.sh` | Headless voice-to-clipboard (bind to hotkey) |
| `agents/voice-config.json` | Voice input configuration (model, language, max duration) |
| `agents/cross-feature-analyze.mjs` | OpenSpec backlog conflict analyzer |
| `agents/deploy-rollback.mjs` | Project-defined deploy rollback helper |
| `agents/claude-md-split.mjs` | Reproducible CLAUDE.md split (this file's structure) |
| `docs/comparison.md` | Framework comparison (vs LangGraph, Autogen, CrewAI, etc.) |
| `docs/cursor-setup.md` | Cursor IDE setup guide (OpenAI, OpenSpec without skills) |
| `docs/troubleshooting.md` | Common issues and recovery patterns |
| `docs/voice-intake.md` | Voice input setup and usage guide |
