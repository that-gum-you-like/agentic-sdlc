# Cross-Feature Analysis

Static analyzer that reads every active OpenSpec change and reports pairwise conflicts: shared file mentions and shared capability names.

Pattern borrowed from GitHub Spec Kit's cross-feature interaction analysis. OpenSpec's per-change folder structure makes this analysis straightforward — every file mention is grep-able.

## When to run

- **Before merging a change** — confirm nothing else in flight touches the same files.
- **Backlog triage** — find changes that appear in many flags (they're the biggest merge-contention risks).
- **After authoring a new proposal** — early sanity check that you're not stepping on parallel work.
- **Periodically** (weekly) — the flag count is a backlog-health signal.

## Run it

```bash
# Writes report to pm/cross-feature-report.md
node ~/agentic-sdlc/agents/cross-feature-analyze.mjs

# Or print to stdout
node ~/agentic-sdlc/agents/cross-feature-analyze.mjs --stdout

# Analyze a different repo root
node ~/agentic-sdlc/agents/cross-feature-analyze.mjs --root=/path/to/repo
```

Via the skill: `/openspec-cross-feature` (Claude Code).

## Reading the report

The report has three severity tiers:

| Severity | Meaning | What to do |
|---|---|---|
| **High** | Two changes touch the same source/config file (`.mjs`, `.json`, `.sh`, `.mdc`, `.ts`, etc.) | Real edit-conflict risk. Sync on the contract before either merges. Order the merges or rebase one onto the other. |
| **Medium** | Two changes touch the same capability (same spec filename) | Semantics may conflict even without file overlap. Confirm the spec deltas compose. |
| **Low** | Two changes touch the same markdown/doc | Typically additive. Glance for ordering — last write wins, but you'll usually want to merge the more-evolved version. |

### Example walkthrough

```
- **anthropic-native-compaction** ↔ **curriculum-maturity-advancement** — files: `agents/rem-sleep.mjs`, `agents/memory-manager.mjs`
  - Action: align before either merges. Owners should sync on the contract.
```

What this means:
- The compaction proposal extends `memory-manager.mjs` with `buildCallParams()` and queries adapter features.
- The curriculum advancement work also edits `memory-manager.mjs` (likely for tier transitions).
- If both merge independently, the second one to land has to rebase and may discover unexpected semantic conflicts.
- Fix: read both `design.md`s, agree on a single integration point in `memory-manager.mjs`, sequence the merges.

## Acting on a flag

For each high-severity flag, three options:

1. **Resolve** — refactor one of the changes so the file overlap goes away (e.g., one change moves its logic to a sibling file).
2. **Sequence** — agree which change merges first; the second author rebases and updates affected references.
3. **Coordinate** — both changes converge on a shared contract; both `design.md`s reference the same interface.

## Known characteristics

- **File-mention regex captures referenced paths**, not strictly modified paths. A change that mentions `node ~/agentic-sdlc/agents/queue-drainer.mjs` in a CLI example will be flagged as "touching" that file. Intent: surface candidates for human review, not block merges.
- **Capability detection uses spec filename only** — does not parse REQ-xxx semantics. A capability rename across two changes will surface as two distinct capabilities; a real semantic conflict between two REQs in the same capability will appear as a medium-severity flag.
- **Single-repo only** — no cross-repo analysis.
- **Archived changes excluded** — only directories directly under `openspec/changes/` are scanned; `openspec/changes/archive/` is skipped.

## What it does NOT do

- LLM-based invariant-conflict analysis (deferred).
- Auto-resolve flags or auto-rebase.
- Block merges (no CI integration by default).
- Track historical flag counts.

## Optional: post-proposal hook

You can wire the analyzer to run automatically after a new proposal is written. In your shell or a git hook:

```bash
openspec new change "<name>" && \
  node ~/agentic-sdlc/agents/cross-feature-analyze.mjs --stdout | head -30
```

Opt out per-run with `OPENSPEC_SKIP_CROSS_FEATURE=true` (currently unused — implement when wiring becomes worthwhile).
