## 1. Free Emergency Fallback Adapters

- [ ] 1.1 Create `agents/adapters/llm/gemini.mjs` — Google Gemini via generativelanguage.googleapis.com. Support gemini-2.5-flash, gemini-2.5-flash-lite. Uses GEMINI_API_KEY env var. Same 5-function interface.
- [ ] 1.2 Create `agents/adapters/llm/cerebras.mjs` — Cerebras via api.cerebras.ai (OpenAI-compatible). Support llama3.1-8b, llama-4-scout-17b. Uses CEREBRAS_API_KEY env var.
- [ ] 1.3 Register both in `agents/adapters/load-adapter.mjs`
- [ ] 1.4 Add all new models to `agents/model-intel.json` with costs ($0 for free tier), quality ratings, and limitations

## 2. Active Health Check

- [ ] 2.1 Add `checkProviderHealth(provider)` function to model-manager.mjs — sends 1-token ping to each provider's API, returns up/down/error
- [ ] 2.2 Add `providerHealth` tracking to model-intel.json — status (up/down/unknown), lastChecked, consecutiveFailures
- [ ] 2.3 Integrate into check(): before budget checks, ping all providers used by configured agents. If a provider is down (2+ consecutive failures), swap all agents on that provider to the next healthy model in their fallback chain
- [ ] 2.4 Log provider-down and provider-recovered events to performance ledger

## 3. Auto-Reset Stale Tasks

- [ ] 3.1 In model-manager check(): load task queue, find tasks with status=in_progress and started_at > 30 min ago
- [ ] 3.2 Reset stale tasks to pending, clear assignee/claimedBy, log stale-reset event to ledger
- [ ] 3.3 Trigger notification for each stale task reset

## 4. Crash Notification

- [ ] 4.1 On provider-down: send WhatsApp notification with which provider, which agents affected, what they swapped to
- [ ] 4.2 On all-fallbacks-exhausted: send CRITICAL WhatsApp with instructions to fix (add API key for another provider, or wait for daily reset)
- [ ] 4.3 On provider-recovered: send recovery notification

## 5. Cross-Provider Default Fallback Chains

- [ ] 5.1 In setup.mjs agent configuration: generate fallback chains that span providers. Primary provider model → secondary provider cheap model → free tier model. Ask user which providers they have API keys for.
- [ ] 5.2 Document the three-tier strategy in CLAUDE.md and .cursorrules
- [ ] 5.3 Add `emergencyFallbackModel` to project.json config — the free-tier model to always append to every chain (default: llama-3.3-70b-versatile on Groq)

## 6. Tests + Docs

- [ ] 6.1 Test: health check returns up/down correctly for available/unavailable providers
- [ ] 6.2 Test: provider-down triggers swap to cross-provider fallback
- [ ] 6.3 Test: stale task detection and reset logic
- [ ] 6.4 Test: Gemini and Cerebras adapters have all 5 required functions
- [ ] 6.5 Update CLAUDE.md, README, model-intel.json, adapter docs
