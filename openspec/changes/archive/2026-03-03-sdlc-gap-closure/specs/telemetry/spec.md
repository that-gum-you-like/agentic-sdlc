# Spec: Cost Tracking & Telemetry

## Acceptance Criteria
- `cost-log.json` has at least 1 entry after Phase 3
- `node agents/cost-tracker.mjs report` shows non-empty report
- Conservation mode correctly halves reported limits

## Implementation Notes
- Cost entry recorded after Roy's autonomous run in Phase 3
- Report format verified against budget.json agent definitions
