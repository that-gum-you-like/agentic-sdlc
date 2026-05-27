# Appendix: Capability Monitoring

**Source**: CLAUDE.md (pre-split 2026-05-27). The slim CLAUDE.md has a one-line pointer; full configuration and trigger detail lives here.

---

## Overview

Tracks which capabilities (memory, tests, notifications, etc.) agents actually use per task. Uses dual-layer tracking:

- **System-instrumented logs (primary):** Each capability script (`memory-manager.mjs`, `cost-tracker.mjs`, `notify.mjs`, etc.) appends a JSONL line to `pm/capability-log.jsonl` as a side effect of running. Agents cannot skip or falsify these entries.
- **Agent self-report (secondary):** Agents output a `<!-- CAPABILITY_CHECKLIST -->` JSON block at task completion with `skipReason` for unused capabilities. Provides context the system log can't infer.

Drift is detected when a `required` capability has zero system-log entries for 3+ consecutive tasks without a valid `skipReason`. The monitor cross-references both sources: if an agent claims it used memory but the system log has no matching entry, that discrepancy is flagged.

## Commands

```bash
node ~/agentic-sdlc/agents/capability-monitor.mjs check    # Scan recent tasks for drift
node ~/agentic-sdlc/agents/capability-monitor.mjs report   # Full per-agent usage rate table
node ~/agentic-sdlc/agents/capability-monitor.mjs status   # Quick health check
```

## Config

Add to `project.json`:

```json
{
  "capabilityMonitoring": {
    "enabled": true,
    "driftThreshold": 3,
    "windowSize": 10
  }
}
```

Per-agent expected capabilities are defined in `agents/capabilities.json` (scaffolded by `setup.mjs`). Each agent entry has `required`, `conditional`, and `notExpected` capability lists. Using a `notExpected` capability triggers a scope creep alert.

## UIX Agent Capabilities

| Capability | Description |
|------------|-------------|
| `designSystemAudit` | Checks design token consistency (color, spacing, typography, border-radius, shadow) |
| `accessibilityAudit` | Validates WCAG 2.1 AA compliance (contrast, semantic HTML, ARIA, focus, touch targets) |
| `visualReview` | Screenshot-based visual hierarchy, responsive behavior, and interaction state evaluation |
| `storybookGovernance` | Story coverage, state coverage, and prop sync enforcement (conditional on Storybook presence) |

Enable drift notifications by adding `"capabilityDrift": true` to `notification.triggers` in `project.json`.
