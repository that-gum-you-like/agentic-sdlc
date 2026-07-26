# Design — hermes-model-ladder-hardening

**Status:** retroactive formalization. The config changes described in the
proposal were applied live on 2026-07-06 (with Bryce) immediately after the
free-model incident; this artifact records the as-built state so the change can
be verified and archived instead of dangling as "proposed."

## As-built configuration

1. **`~/.hermes/config.yaml`** — primary `deepseek/deepseek-chat-v3.1`
   (openrouter, chat_completions); `fallback_providers` in order:
   `deepseek/deepseek-v4-flash` → `qwen/qwen3-coder` →
   `qwen/qwen3-coder-30b-a3b-instruct` → `qwen/qwen3-coder:free` (chain-end
   only). `cohere/north-mini-code:free` removed. Backups retained:
   `config.yaml.bak.pre-deepseek-primary`, `config.yaml.bak.pre-openrouter-ladder`.
2. **`~/.hermes-drain/config.yaml`** (autonomous drain profile) — leads with
   `deepseek/deepseek-v4-flash` (reliable tool-caller) → `deepseek-chat-v3.1`
   → `qwen/qwen3-coder`. No `:free` primaries.
3. **`agents/budget.json`** — per-agent primaries per proposal
   (`sdlc-developer`→qwen3-coder, reasoning/review→deepseek-chat-v3.1,
   docs→deepseek-v4-flash); `emergencyFallbackModel` →
   `deepseek/deepseek-v4-flash`; `:free` models appear only at chain ends
   (5 chain-end references remain, per CLAUDE.md's "free-tier fallbacks end
   every chain" rule).

## Verification (2026-07-26)

- `grep -c north-mini` = 0 across `~/.hermes/config.yaml`,
  `~/.hermes-drain/config.yaml`, `agents/budget.json`.
- `emergencyFallbackModel` = `deepseek/deepseek-v4-flash` (paid, reliable).
- Downstream proof: every autonomous drain since 2026-07-07 has run on this
  ladder; the drain-multi-project live check (2026-07-26) invoked the drain
  profile without free-model fallback incidents.

## Non-goals

Dynamic model scoring / automatic ladder reordering (model-manager.mjs quality
intel stays advisory); provider changes beyond OpenRouter.
