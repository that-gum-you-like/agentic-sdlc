# Tasks: openrouter-provider

**Date**: 2026-07-05
**Status**: implemented

---

## Prerequisites

- [x] proposal.md approved (incl. Value Analysis)
- [x] design.md written
- [x] specs written (openrouter-routing)
- [x] `OPENROUTER_API_KEY` present (`~/.hermes/.env`)
- [x] Affordable non-OpenAI model ids verified against the live OpenRouter catalog

---

## Implementation Tasks

- [x] **T-101**: `agents/adapters/llm/openrouter.mjs` — 5-method interface, `models` passthrough, curated no-OpenAI catalog
  - Complexity: M · Spec: REQ-001, REQ-002
- [x] **T-102**: Register `openrouter` in `agents/adapters/load-adapter.mjs`
  - Complexity: S · Spec: REQ-001
- [x] **T-103**: `project.json` `llm.defaultProvider: "openrouter"`
  - Complexity: S · Spec: REQ-002
- [x] **T-104**: Rewrite `budget.json` — affordable ladders per agent, remove OpenAI + Claude-API deps, free emergency fallback
  - Complexity: S · Spec: REQ-002
- [x] **T-105**: Add OpenRouter model entries to `model-intel.json`
  - Complexity: S · Spec: REQ-002
- [x] **T-106**: Configure Hermes `~/.hermes/config.yaml` — free primary coder + 5-rung `fallback_providers` ladder (backup saved)
  - Complexity: S · Spec: REQ-003
- [x] **T-107**: Tests — adapter count 8→9, openrouter interface + no-OpenAI catalog + checkAvailability; wired into `npm test`
  - Complexity: M · Spec: REQ-001, REQ-002
- [x] **T-108**: Docs — `docs/appendix/adapters.md` OpenRouter section + affordable-ladder note
  - Complexity: S · Spec: REQ-002

## Verification

- [x] **T-201**: `npm test` green — 49 + 9 + 6 + 5, 0 failures
- [x] **T-202**: `hermes fallback list` shows primary `qwen/qwen3-coder:free` + 5 fallbacks in order
- [x] **T-203**: Headless Hermes run on the free coder returns correctly (`hermes -z`)
- [x] **T-204**: Live adapter call — free model 429 → OpenRouter auto-served `deepseek/deepseek-v4-flash` (routing proven)
- [x] **T-205**: `model-manager models` lists the OpenRouter ladder ranked by cost; `four-layer-validate` CLI-guard clean

---

## Notes

- The shipped `openai`/`anthropic` adapters and their `model-intel.json` entries remain for other users; this change stops *this* install's routing from using them (no OpenAI in any ladder).
- Automated unsupervised drain cron is deferred (docker-persistence of Hermes' sandbox + autonomy decision) — see BACKLOG.
- If Paperclip is later used, run `node agents/paperclip-sync.mjs` to push the new model config (SDLC is source of truth).
