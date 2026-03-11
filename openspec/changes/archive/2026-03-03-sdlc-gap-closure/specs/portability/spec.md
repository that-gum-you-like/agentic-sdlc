# Spec: Portability Refactor

## Acceptance Criteria
- `agents/project.json` exists with all project-specific config values
- `agents/load-config.mjs` exports `loadConfig()` that reads project.json
- All 15 .mjs scripts use `loadConfig()` instead of hardcoded paths
- `grep -r "resolve('/home/bryce/languageapp')" agents/*.mjs` returns empty
- All scripts still function: `node agents/queue-drainer.mjs status` works
- `node agents/test-behavior.mjs` passes (30 checks)
- `agents/PORTABILITY.md` template guide exists

## Implementation Notes
- `load-config.mjs` must fall back to hardcoded defaults if project.json is missing
- Agent name lists (`AGENTS` arrays) should come from project.json `agents` field
- AGENT_DOMAINS in queue-drainer.mjs stays in the script (it's behavioral, not config)
- The `appDir` field enables scripts to find LinguaFlow/ without hardcoding

## Files Affected
- NEW: `agents/project.json`, `agents/load-config.mjs`, `agents/PORTABILITY.md`
- MODIFIED: All 15 .mjs scripts in agents/ and agents/cycles/
