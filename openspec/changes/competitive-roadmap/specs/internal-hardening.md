# Spec: internal-hardening (Phase 0)

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW · Track 5 (do first)

Make our own claims true before the autonomous drain self-serves. These fix defects the internal audit found and give the quality gates *teeth* — a precondition for trusting affordable-model PRs.

---

### REQ-H1: Quality Gates That Enforce  · Complexity M

**Acceptance Criteria:**
- [ ] `review-hook.mjs` can return a **fail** that blocks a commit (not only `warn`); the "reviewer agent" it references either exists or the claim is removed
- [ ] `pattern-hunt.mjs` generic path (`:776` TODO) emits a **real** detector or nothing — never an always-passing generated test
- [ ] `alignment-monitor.mjs` score derives from real signals, not hand-tuned magic numbers over stdout-scraping
- [ ] `schema-validator.mjs` fails closed (does not silently pass) when Ajv is unavailable

### REQ-H2: CI Runs the Whole Suite  · Complexity S

**Acceptance Criteria:**
- [ ] `.github/workflows` + `npm test` run all `tests/` **and** the ~17 `agents/__tests__/*.test.mjs`, plus `four-layer-validate` and `test-behavior --framework`
- [ ] A regression in any script is caught by CI (today only 2 files run)

### REQ-H3: Exact-Accounting Groundwork  · Complexity S/M

**Acceptance Criteria:**
- [ ] Realized provider usage replaces `chars/4` in the ledger (see also P4); `$` computed from `model-intel.json`

### REQ-H4: Latent-Bug Sweep  · Complexity M

**Acceptance Criteria:**
- [ ] `autonomous-launcher.sh` captures the **agent's** exit code, not `tee`'s
- [ ] `daily-review.mjs` "OpenSpec Hygiene" + "Model Health" blocks import `fs`/`path` (no silent `ReferenceError`)
- [ ] `logCapabilityUsage` called with the positional signature in `garden-roadmap.mjs` + `alignment-monitor.mjs`
- [ ] `__isMainModule` guards added to `ast-analyzer`, `version-snapshot`, `migrate-memory`, `rem-sleep`, `garden-roadmap`, `alignment-monitor`
- [ ] `semantic-index.mjs` stdin invocation (E2BIG-safe, matching the `rag-indexer` fix) + real JS cosine fallback (not `return null`)

### REQ-H5: No-OpenAI Default Catalog  · Complexity S

**Acceptance Criteria:**
- [ ] `model-intel.default.json` rebuilt around the OpenRouter/qwen/deepseek affordable ladder (matches `budget.json`; no Anthropic/OpenAI-centric default)
- [ ] `openai`/`azure-openai` adapters gated behind explicit opt-in, or clearly marked non-default, to end the policy inconsistency

### REQ-H6: Doc & Model Drift Reconciliation  · Complexity S

**Acceptance Criteria:**
- [ ] The 6-level (`docs/levels/`) and 7-level (`framework/maturity-model.md`/CLAUDE.md) ladders unified to one canonical model
- [ ] `validation-patterns.md` updated to **5** layers (browser verification)
- [ ] A single competitive matrix added to `docs/comparison.md` (Cursor/Devin/Spec-Kit/OpenHands included)

### REQ-H7: De-couple Hardcoded Project Bindings  · Complexity S

**Acceptance Criteria:**
- [ ] `seed-queue-from-openspec.mjs` reads agent routing from `domains.json` (drop hardcoded LinguaFlow names; use the discarded `loadDomains()` result)
- [ ] `paperclip-sync.mjs` reads model IDs from config, not stale literals

### REQ-H8: Cover the Untested  · Complexity S

**Acceptance Criteria:**
- [ ] `capability-monitor.mjs` (shipped untested) gets unit tests
- [ ] Every new roadmap module ships tests wired into CI (per H2)
