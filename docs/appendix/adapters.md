# Appendix: Adapters (LLM + Orchestration)

**Source**: CLAUDE.md (pre-split 2026-05-27). The slim CLAUDE.md notes "adapters live here"; full provider list and Paperclip integration detail in this file.

---

## Configuration

Configure orchestration and LLM providers in `project.json`:

```json
{
  "orchestration": { "adapter": "file-based" },
  "llm": { "defaultProvider": "anthropic" }
}
```

## Orchestration adapters (how tasks are managed)

- `file-based` (default) — local JSON task files, zero external dependencies
- `paperclip` — Paperclip control plane (requires `.paperclip.env`)
- `claude-code-native` — Claude Code Agent tool subagents

## LLM provider adapters (which models agents use)

- `anthropic` (default) — Claude models via `ANTHROPIC_API_KEY`
- `groq` — Groq-hosted models via `GROQ_API_KEY`
- `openai` — OpenAI GPT models via `OPENAI_API_KEY`
- `gemini` — Google Gemini models via `GEMINI_API_KEY` (free tier: 250 req/day, no CC)
- `cerebras` — Cerebras Inference via `CEREBRAS_API_KEY` (free tier: 1M tokens/day, no CC)
- `ollama` — Local models via Ollama at `http://localhost:11434`
- `azure-openai` — GPT-4o/o-series deployed in Azure OpenAI / Foundry via `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY`
- `azure-foundry-claude` — Claude deployed in Foundry (Anthropic Messages API) via `AZURE_FOUNDRY_ENDPOINT` + `AZURE_FOUNDRY_API_KEY`. Enterprise/MCA-E only.

**Free emergency fallbacks:** Groq, Gemini, and Cerebras all offer free tiers with no credit card. Every agent's fallback chain should end with a free-tier model to guarantee zero downtime.

Adapters live in `agents/adapters/orchestration/` and `agents/adapters/llm/`. See `docs/adapter-guide.md` for writing custom adapters.

---

## SDLC as Source of Truth

**The Agentic SDLC controls agent configuration.** Orchestration platforms (Paperclip, etc.) are execution layers. Change agent config in SDLC files, then sync to the platform.

**SDLC files that define agents:**
- `agents/budget.json` — model, provider, daily token limits, permissions, maxInstances, fallbackChain, modelPreferences
- `agents/domains.json` — agent names, roles, domain routing patterns
- `agents/<name>/AGENT.md` — system prompts (identity, operating rules, memory protocol)
- `agents/project.json` — agent roster, adapter config, notification config

**To change an agent's model or role:** Edit `budget.json` or `domains.json`, then sync to your orchestration platform if applicable.

---

## Paperclip Adapter (Optional)

When using the Paperclip orchestration adapter:

- Source `.paperclip.env` to connect to the dashboard
- Use the `/paperclip` skill for assignments, status updates, and coordination
- Sync command: `node ~/agentic-sdlc/agents/paperclip-sync.mjs`
- SDLC → Paperclip: model, role, instructions path. Paperclip-only: budgetMonthlyCents, heartbeat config.
- Paperclip adds: heartbeat execution, issue tracking, approval gates, run audit trails.

```bash
node ~/agentic-sdlc/agents/paperclip-sync.mjs              # Push SDLC → Paperclip
node ~/agentic-sdlc/agents/paperclip-sync.mjs --status      # Compare SDLC vs Paperclip
node ~/agentic-sdlc/agents/paperclip-sync.mjs --dry-run     # Preview changes
node ~/agentic-sdlc/agents/paperclip-sync.mjs --pull-spent  # Pull spend data from Paperclip
```
