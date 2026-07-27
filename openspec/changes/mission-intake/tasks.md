# Tasks — mission-intake

## Implementation

- [x] **T1**: `agents/mission-bootstrap.mjs` — steps 1–10 per design; exported pure helpers; `--dry-run`, `--no-deploy`
  - Complexity: M · Spec: REQ-001, REQ-002
- [x] **T2**: `docs/MISSION_PLAYBOOK.md` — intake → bootstrap → authoring → Supabase → reporting → guardrails
  - Complexity: S · Spec: REQ-003
- [x] **T3**: Host: install playbook as `~/.hermes/skills/sdlc-mission/SKILL.md`
  - Complexity: S · Spec: REQ-003
- [x] **T4**: Host: `terminal.backend: local` (backup first) + gateway restart
  - Complexity: S · Spec: REQ-004

## Verification

- [x] **T5**: `tests/mission-bootstrap.test.mjs` — name validation, smoke URL, cron minute policy, project.json patch, ladder rewrite, dry-run no-writes
  - Complexity: M · Spec: REQ-001, REQ-002
- [x] **T6**: `npm test` green; `mission-bootstrap.mjs demo-mission --dry-run` prints a full plan with zero side effects
  - Complexity: S · Spec: REQ-001
- [x] **T7**: Gateway restarted clean; agent terminal probe reaches host (gh/vercel resolvable)
  - Complexity: S · Spec: REQ-004
