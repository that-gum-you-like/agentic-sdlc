# Spec: Accuracy Pass

## Acceptance Criteria
- pm/DASHBOARD.md has current screen count, service count, test totals
- CLAUDE.md has no stale counts
- `node agents/test-behavior.mjs` passes all 30 checks
- All numbers verified against actual `find`/`wc` counts from codebase
