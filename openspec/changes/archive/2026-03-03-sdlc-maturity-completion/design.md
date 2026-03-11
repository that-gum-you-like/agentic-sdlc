## Context

LinguaFlow's Agentic SDLC is at Phase 4: 75%, Phase 5: 85%, Phase 6: 40%. A thorough audit against the lesson plan (Hours 1–6) identified 13 remaining gaps. This design covers closing all of them to reach 100% across every phase.

Current state of the gaps:
- **e2e tests**: `__tests__/e2e/` directory exists but is empty. Playwright is not installed.
- **Prompt injection**: `sanitize.ts` strips control chars and truncates but has no injection-pattern detection.
- **Four-layer validation**: Reviews happen informally via Richmond's post-commit hook. No structured pipeline.
- **Error dedup**: `crashReportService.ts` appends to an in-memory array with no fingerprinting.
- **Semantic analysis**: ESLint + defeat tests cover patterns but no AST-based analysis for dead code/unused exports.
- **Pattern hunt**: Richmond's reviews accumulate in `agents/richmond/reviews/` but are never mined for patterns.
- **Handoff templates**: Agents post to #reviews informally with no required format.
- **Cron jobs**: REM sleep and cost reports exist as manual scripts, not scheduled.
- **Mobile workflow**: Undocumented.
- **estimatedTokens**: Field exists in all task files, always null.

## Goals / Non-Goals

**Goals:**
- Bring all 6 maturity phases to 100%
- Every new system has tests proving it works
- All tooling integrates with existing scripts (queue-drainer, cost-tracker, etc.)
- No app feature changes — infrastructure/tooling only

**Non-Goals:**
- Full Detox/native mobile e2e (web export via Playwright is sufficient for now)
- Real spaCy/Python NLP (TypeScript AST analysis achieves the same goals without a Python dependency)
- Real-time prompt injection ML classifier (pattern-matching is sufficient for the current threat model)
- Automated agent spawning based on pattern detection (pattern-hunt produces suggestions, humans decide)

## Decisions

### D1: Playwright for e2e tests (not Detox)
**Choice**: Playwright against the Next.js web export at localhost:8081
**Why**: The app already has `npx expo start --web` and a deploy pipeline that builds a web export. Playwright is lighter than Detox (no Android/iOS emulator), runs in CI, and tests the same React components. The lesson plan says "test through the front end" — Playwright does this.
**Alternative**: Detox for native mobile — rejected because it requires iOS/Android build infrastructure that doesn't exist yet.

### D2: Pattern-matching injection filter (not ML classifier)
**Choice**: Extend `sanitize.ts` with a `detectPromptInjection()` function that checks for known patterns: "ignore previous instructions", "you are now", system/user/assistant delimiters, base64-encoded instructions.
**Why**: The AI calls go through Supabase Edge Functions where the system prompt is server-side. Client-side sanitization is a defense-in-depth layer. Pattern matching catches the most common attack vectors without adding dependencies.
**Alternative**: ML-based classifier — rejected as overkill for a sanitization utility; adds latency and a model dependency.

### D3: TypeScript AST analyzer (not spaCy)
**Choice**: Build `agents/ast-analyzer.mjs` using TypeScript's compiler API (`ts.createProgram`) to detect: unused exports, dead code paths, circular dependencies, and files that import but don't use specific symbols.
**Why**: The lesson plan suggests spaCy for "custom semantic analysis." In a TypeScript project, the TypeScript compiler API provides richer analysis than regex + word2vec. No Python dependency needed.
**Alternative**: spaCy with Python — rejected because the entire toolchain is Node.js/TypeScript; adding Python creates a runtime dependency mismatch.

### D4: Four-layer validation as a script (not a pipeline service)
**Choice**: Create `agents/four-layer-validate.mjs` that runs four sequential checks on a diff or set of files: (1) research — verify imports exist and types match, (2) critique — check against Richmond's checklist, (3) code — run defeat tests + AST analysis, (4) statistics — report file sizes, test coverage delta, token counts. Output: a structured validation report.
**Why**: The lesson plan describes research/critique/code/statistics as a validation framework. Making it a CLI script means any agent or hook can invoke it. It wraps existing tools (TypeScript compiler, defeat tests, behavior tests) into a single pass.
**Alternative**: Microservice architecture — rejected; a single script is simpler and matches the existing tooling pattern.

### D5: Pattern hunt mines Richmond's reviews directory
**Choice**: Create `agents/pattern-hunt.mjs` that reads `agents/richmond/reviews/*.json`, extracts recurring issues (same file flagged multiple times, same rule violated), and outputs suggested defeat test additions.
**Why**: Richmond already reviews every commit. The data exists — it just needs mining. This closes the "Find Pattern → Defeat with Test → Teach → Repeat" loop from the lesson plan.
**Alternative**: Mine git log directly — considered as a supplement, but Richmond's reviews are already structured with categories.

### D6: Handoff template as a Markdown file agents reference
**Choice**: Create `agents/handoff-template.md` defining required sections for a submission to #reviews: files changed, tests added/modified, self-assessment against Richmond's checklist, known risks. Reference it from all AGENT.md files.
**Why**: Standardizes what Richmond receives. Currently submissions are informal, making reviews inconsistent.

### D7: Error dedup via content hash fingerprinting
**Choice**: Add a `fingerprint()` function to `crashReportService.ts` that hashes `error.message + error.stack` (first 3 frames). Duplicate fingerprints increment a counter instead of creating new entries.
**Why**: Simple, no external dependencies, covers the common case of repeated errors from the same source.

### D8: estimatedTokens from historical cost data
**Choice**: Populate token estimates in task template files based on the task type ranges from the lesson plan: simple fix (2-5K), feature (10-30K), architecture (20-50K), research (30-100K). Apply to task templates for future tasks.
**Why**: The cost data in cost-log.json is empty (no historical data yet), so we use the lesson plan's reference ranges.

## Risks / Trade-offs

- **Playwright requires a running dev server**: e2e tests need `expo start --web` on port 8081. CI must start the server before running tests. → Mitigation: Use Playwright's `webServer` config to auto-start.
- **Pattern-matching injection filter has false positives**: Legitimate content about AI (e.g., a video transcript discussing "system prompts") could be flagged. → Mitigation: Filter returns a warning score, not a hard block. The AI service logs the warning but proceeds if score < threshold.
- **AST analyzer may be slow on large codebases**: TypeScript's compiler API loads the full program. → Mitigation: Use `--files` flag to limit scope; cache program between runs.
- **Four-layer validation adds time to reviews**: Running all 4 layers takes 10-30 seconds. → Mitigation: Only run on request or pre-merge, not on every commit.

## Open Questions

None — all technical decisions are scoped and the implementation approach is clear.
