# Tasks — hermes-model-ladder-hardening

Retroactive record: applied live 2026-07-06, verified 2026-07-26.

- [x] **T1**: `~/.hermes/config.yaml` — primary → `deepseek/deepseek-chat-v3.1`; ladder deepseek-v4-flash → qwen3-coder → qwen3-coder-30b → qwen3-coder:free; remove `cohere/north-mini-code:free`
- [x] **T2**: `~/.hermes-drain/config.yaml` — drain profile leads `deepseek/deepseek-v4-flash`; no `:free` primaries
- [x] **T3**: `agents/budget.json` — per-agent primaries per proposal; `emergencyFallbackModel` → `deepseek/deepseek-v4-flash`; `:free` chain-end only
- [x] **T4**: Verify all model IDs live on OpenRouter; budget.json valid JSON; adapter/model-manager suite passes; gateway restarts clean
- [x] **T5**: Verify no `north-mini` reference remains in any config (grep = 0, 2026-07-26)
