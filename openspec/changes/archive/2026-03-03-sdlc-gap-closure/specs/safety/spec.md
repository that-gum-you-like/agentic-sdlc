# Spec: Safety Net Validation

## Acceptance Criteria
- Conservation mode: toggling `conservationMode: true` in budget.json halves limits
- Budget circuit breaker: exhausted-budget agent gets refused assignment
- Stale claim: old claimedAt shows "STALE CLAIM" warning in status
- REM sleep: `--dry-run` runs for all 6 agents without error
- `agents/SAFETY.md` documents all safety mechanisms

## Test Cases
- Toggle conservation → verify → restore
- Inject fake budget exhaustion → verify refusal → clean up
- Create fake stale task → verify warning → clean up
