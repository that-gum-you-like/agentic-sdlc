# Memory Scaling Spec

**Change**: self-bootstrap-learnings
**Domain**: memory
**Status**: draft

## ADDED Requirements

### Requirement: Token-budget-aware memory recall

`memory-manager.mjs recall` SHALL auto-summarize when total memory exceeds `memoryTokenBudget` (default 4000 tokens, configurable in `project.json`). Priority order: `core.json` failures always returned in full, `long-term.json` returned in full up to budget, `medium-term.json` summarized, `recent.json` limited to latest 5 entries only. Full memory is always preserved on disk regardless of recall truncation.

#### Scenario: Memory under budget returns full content

WHEN total token count across all memory files is at or below `memoryTokenBudget`
THEN `recall` returns the full contents of all memory files with no summarization or truncation applied.

#### Scenario: Memory over budget returns summarized content with core failures intact

WHEN total token count across all memory files exceeds `memoryTokenBudget`
THEN `recall` returns `core.json` failure entries in full, `long-term.json` entries in full up to remaining budget, `medium-term.json` entries as one-line summaries, and `recent.json` limited to the latest 5 entries only.

#### Scenario: Semantic search still preferred when available

WHEN a semantic search backend is configured and the caller provides a query
THEN `recall` uses semantic search to select the most relevant entries before applying the token budget, preferring relevant content over recency.
