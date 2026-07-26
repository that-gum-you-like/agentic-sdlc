# Proposal: hermes-model-ladder-hardening

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

An autonomous Hermes drain running on **free-tier OpenRouter models** produced a
stale-fork of the framework and then **confidently hallucinated** a false
"Docker containers cannot share files with the host" explanation to Bryce (see
`hermes-sandbox-salvage`). Root-cause investigation traced the bad output to the
model routing:

- **`~/.hermes/config.yaml`** primary was `qwen/qwen3-coder:free`; on its
  frequent free-tier rate-limits it fell to **`cohere/north-mini-code:free`** —
  the model that produced the hallucinated Docker report (confirmed in the
  `request_dump_20260706_*` session), while agents ran `budget-exhausted`.
- **`agents/budget.json`** assigned a `:free` model as the **primary** for every
  agent (`sdlc-developer` on `qwen/qwen3-coder:free`, `jony-aive` &
  `sdlc-documentarian` on `qwen/qwen3-next-80b:free`, `sdlc-reviewer` on
  `llama-3.3-70b:free`) and used `qwen/qwen3-coder:free` as
  `emergencyFallbackModel`. This contradicts CLAUDE.md's own rule that
  *"free-tier fallbacks should end every fallback chain."*

Free models are a false economy here: they rate-limit into weaker models, and
weak models doing judgment-heavy orchestration burned whole cycles producing
work that had to be discarded.

## Discovery

- All candidate model IDs verified **live on OpenRouter** (2026-07-06):
  `deepseek/deepseek-chat-v3.1`, `deepseek/deepseek-v4-flash`,
  `qwen/qwen3-coder`, `qwen/qwen3-coder-30b-a3b-instruct`, `qwen/qwen3-coder:free`.
- `model-manager.mjs` quality intel: `qwen/qwen3-coder` = 5/5 code · 4/5 arch;
  `deepseek/deepseek-chat-v3.1` = 4/5 code · 4/5 arch (1M-class context, cheap);
  `deepseek/deepseek-v4-flash` = 4/5 · 4/5 at $0.09/1M.
- Bryce's directive: DeepSeek as the reliable primary for reasoning/general work;
  `qwen/qwen3-coder` (full) for code; keep `qwen/qwen3-coder:free` **only** for
  simple coding it can do reliably (chain-end); **remove**
  `cohere/north-mini-code:free` entirely; ensure OpenRouter config is current.

## Proposed Solution

Reliability-first routing, free models demoted to chain-end last-resort:

1. **Hermes `~/.hermes/config.yaml` (operational).** Primary →
   `deepseek/deepseek-chat-v3.1`. Fallback ladder →
   `deepseek/deepseek-v4-flash` → `qwen/qwen3-coder` →
   `qwen/qwen3-coder-30b-a3b-instruct` → `qwen/qwen3-coder:free` (last resort).
   **`cohere/north-mini-code:free` removed.** Gateway reloaded.
2. **Framework `agents/budget.json` (source of truth).**
   - `sdlc-developer` (code) → primary `qwen/qwen3-coder`; free coder only as
     the `"simple fix"` preference and chain-end fallback; architecture pref →
     `deepseek/deepseek-chat-v3.1`.
   - `jony-aive`, `sdlc-reviewer` (reasoning/review) → primary
     `deepseek/deepseek-chat-v3.1`; free model chain-end only.
   - `sdlc-documentarian` (docs) → primary `deepseek/deepseek-v4-flash`
     (cheap+reliable); free model chain-end only.
   - `emergencyFallbackModel` → `deepseek/deepseek-v4-flash` (was a `:free`).
3. **Verification.** All IDs confirmed live; `budget.json` valid JSON;
   `model-manager models` resolves; the adapter/model-manager test suite passes
   (40/40); gateway restarts clean.

## Value Analysis

- **Directly prevents the failure that caused this incident** — no free model is
  a primary or an emergency fallback; the hallucinating `north-mini` model is
  gone.
- **Higher-quality autonomous output at trivially higher cost** — DeepSeek V3.1
  (~$0.21/1M in) and qwen3-coder (~$0.22/1M) are cents-scale but far more
  reliable than free models that rate-limit into weaker ones.
- **Compliance:** satisfies CLAUDE.md's "free-tier fallbacks end every chain"
  rule; no OpenAI; no new deps.
- **Cost:** S. Two config files + verification. Already applied and live;
  autonomous drain and Hermes both read the edited files directly.

## Companion Changes

- `hermes-sandbox-salvage` — recover the useful output the free-model cycle
  produced before this hardening.
- `hermes-github-write-access` — ensure future cycles land on GitHub behind PR
  review instead of rotting in a sandbox.
