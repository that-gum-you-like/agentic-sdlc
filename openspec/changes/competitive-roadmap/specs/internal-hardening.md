# Spec: internal-hardening (Phase 0)

**Date**: 2026-07-05
**Status**: specs
**Capability**: NEW · Track 5 (do first)

Make our own claims true before the autonomous drain self-serves. These fix defects the internal audit found and give the quality gates *teeth* — a precondition for trusting affordable-model PRs. REQs are keyed `REQ-H<n>` (program numbering); each carries the house-mandated Statement / Acceptance Criteria / Dependencies / Complexity / Value.

---

### REQ-H1: Quality Gates That Enforce

**Statement:** The quality gates shall be able to *block* bad work, not merely warn, and shall derive verdicts from real signals.

**Acceptance Criteria:**
- [ ] A pre-merge gate that can actually **fail** exists. NOTE: `review-hook.mjs` installs as a **post-commit** hook (`.git/hooks/post-commit`) whose exit code *cannot* block the commit it runs after — its checklist only ever sets `warn`. So H1 must move the enforcing check to a mechanism that can gate: a **pre-commit/pre-push hook** and/or a **required CI check** (ties to H2). Reword the docs so nothing claims a post-commit hook blocks a commit.
- [ ] `pattern-hunt.mjs` generic path (the `:776`-area TODO whose generated test asserts an unpopulated `newViolations` array → always passes) emits a **real** detector or **no test at all** — never an always-passing one
- [ ] `alignment-monitor.mjs` score derives from real signals, not hand-tuned magic numbers over stdout-scraping
- [ ] `schema-validator.mjs` fails **closed** (it currently returns `{valid:true}` when Ajv is absent — fail-open)

**Dependencies:** H2 (CI is the reliable enforcement surface). **Complexity:** M. **Value:** Critical.

### REQ-H2: CI Runs the Whole Suite

**Statement:** CI and `npm test` shall run the entire test suite plus the validators.

**Acceptance Criteria:**
- [ ] `.github/workflows/test.yml` today runs **one** unit-test file (`tests/adapter-and-model-manager.test.mjs`) plus the `test-behavior --framework` runner. Extend it to run all `tests/*.test.mjs` **and** the ~17 `agents/__tests__/*.test.mjs`, plus `four-layer-validate`
- [ ] A regression in any script is caught by CI (today most of the ~23 test files never run in CI)

**Dependencies:** none. **Complexity:** S. **Value:** Critical.

### REQ-H3: Capture Realized Token Usage

**Statement:** The ledger shall record provider-**reported** token usage, replacing `chars/4` estimates. (The `$` math + rollups live in P4 — H3 is only the capture groundwork so the two don't overlap.)

**Acceptance Criteria:**
- [ ] Realized `inputTokens`/`outputTokens` (already returned by the LLM adapters) are written to the cost ledger; `estimateTokens` (`chars/4`) remains a pre-flight estimate only
- [ ] Explicitly scoped to *capture*; dollar computation, per-agent/model rollups and circuit-breaker feedback are P4

**Dependencies:** none (feeds P4). **Complexity:** S/M. **Value:** High.

### REQ-H4: Latent-Bug Sweep

**Statement:** The framework shall fix the concrete defects the audit verified.

**Acceptance Criteria:**
- [ ] `autonomous-launcher.sh:123-125` captures the **agent's** exit code, not `tee`'s (currently `$?` after a pipe)
- [ ] `agents/cycles/daily-review.mjs` "OpenSpec Hygiene"/"Model Health" blocks (lines ~322-349) reference `fs.`/`path.` namespaces though only named members are imported → guaranteed `ReferenceError`; import correctly or namespace-import
- [ ] `logCapabilityUsage` called with the positional signature in `garden-roadmap.mjs` + `alignment-monitor.mjs`
- [ ] `__isMainModule` guards added to `ast-analyzer`, `version-snapshot`, `migrate-memory`, `rem-sleep`, `garden-roadmap`, `alignment-monitor` (they run at import today)
- [ ] `semantic-index.mjs`: stdin invocation (E2BIG-safe, matching the shipped `rag-indexer` fix) + a real JS cosine fallback (currently `return null`)

**Dependencies:** none. **Complexity:** M. **Value:** High.

### REQ-H5: No-OpenAI Default Catalog

**Statement:** The shipped default model catalog shall not violate the no-OpenAI posture.

**Acceptance Criteria:**
- [ ] `model-intel.default.json` **contains OpenAI (×6) and Anthropic (×4) entries** alongside the free-tier providers — the OpenAI entries violate the no-OpenAI default. Remove/gate them; align the default around the OpenRouter/qwen/deepseek ladder
- [ ] The `openai`/`azure-openai` adapters are gated behind explicit opt-in (or clearly marked non-default)
- [ ] `model-manager.mjs` `research()` stops fetching `openai.com` pricing (a no-OpenAI-policy leak the audit found)

**Dependencies:** Fold in the in-flight **`openrouter-provider`** change, which already removes `gpt-4o-mini` from `budget.json` and builds the affordable ladder — H5 covers only what it leaves undone (chiefly `model-intel.default.json` + adapter gating + the `research()` leak). **Complexity:** S. **Value:** High.

### REQ-H6: Doc, Model & Matrix Reconciliation

**Statement:** The maturity/validation ladders shall be unified and a numbered competitive matrix shall exist (so other specs can reference matrix rows by number).

**Acceptance Criteria:**
- [ ] The three ladders are unified to one canonical model: `framework/maturity-model.md` (7 levels 0–6, Manual…Self-Improving), `docs/levels/` (6 files 1–6), and CLAUDE.md (7 levels Foundation…Mastery) currently disagree on **both count and names**
- [ ] `validation-patterns.md` updated to **5** layers (its intro still says "four-layer" while documenting Layer 5 Browser Verification)
- [ ] `docs/comparison.md` gains a **single numbered capability matrix** (Cursor/Devin/Spec-Kit/OpenHands included) with ✅/🟡/❌ cells — this defines the row numbers the other specs' "closes the ⟨capability⟩ gap" notes refer to (today comparison.md has no numbered rows)

**Dependencies:** none (do early so matrix rows exist for reference). **Complexity:** S/M. **Value:** Medium.

### REQ-H7: De-couple Hardcoded Project Bindings

**Statement:** Framework scripts shall read project bindings from config, not literals.

**Acceptance Criteria:**
- [ ] `seed-queue-from-openspec.mjs` reads agent routing from `domains.json` (drop hardcoded LinguaFlow names; use the currently-discarded `loadDomains()` result)
- [ ] `paperclip-sync.mjs` reads model IDs from config, not stale literals

**Dependencies:** none (unblocks queue-seeding for the drain). **Complexity:** S. **Value:** Medium.

### REQ-H8: Extend Test Coverage of Uncovered Paths

**Statement:** New roadmap modules ship with CI-wired tests; existing thin coverage is extended where it matters.

**Acceptance Criteria:**
- [ ] Every new roadmap module ships tests wired into CI (per H2)
- [ ] `capability-monitor.mjs` **already has** `agents/__tests__/capability-monitor.test.mjs` (pure-function cases: `detectDrift`/`detectDiscrepancies`/`computeUsageRates`). Extend it only for genuinely uncovered paths (file-I/O / report emission), if any — do **not** treat it as untested

**Dependencies:** H2. **Complexity:** S. **Value:** Medium.
