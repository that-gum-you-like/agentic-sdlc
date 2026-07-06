# Tasks: self-healing-review-loop

**Date**: 2026-07-06

- [x] **T-1**: `buildFixTask` pure builder + `upsertFixTaskInClone` in
      `pr-auto-review.mjs`; wire at `gate-failed` + `llm-rejected` — M — REQ-SH-1
- [x] **T-2**: `reconcileMerged` completes `FIX-<pr>` tasks — S — REQ-SH-3
- [x] **T-3**: drain-prompt.md fix-task procedure + open-PR-skip exemption — S — REQ-SH-2
- [x] **T-4**: hermes-drain.sh cap bypass when pending `FIX-*` exists — S — REQ-SH-2
- [x] **T-5**: tests: builder create/refresh/exclusions; source pins for wiring,
      reconcile, prompt content, cap bypass — M — REQ-SH-1/2/3
- [x] **T-6**: clean-checkout gate + owner-reviewed merge (guardrail surface) — S
