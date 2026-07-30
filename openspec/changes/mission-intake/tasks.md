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

- [x] **T8**: `mission-bootstrap.mjs` — attach `<name>.brycewadley.com`
  (best-effort), promote it to `deploy.verify.smokeUrl`, widen the verify
  timeout for first-deploy cert issuance; `--domain` / `--no-domain` flags
  - Complexity: S · Spec: REQ-005
- [x] **T9**: `docs/MISSION_PLAYBOOK.md` — domain documentation + the four
  guardrails from the 2026-07-27 incidents (no scheduler entries, always work
  in `~/<project>`, never sudo/docker, never cite an unverified script path)
  - Complexity: S · Spec: REQ-005, REQ-006

## Verification

- [x] **T5**: `tests/mission-bootstrap.test.mjs` — name validation, smoke URL, cron minute policy, project.json patch, ladder rewrite, dry-run no-writes
  - Complexity: M · Spec: REQ-001, REQ-002
- [x] **T10**: `tests/mission-bootstrap.test.mjs` — `missionDomainFor` default
  and override, `MISSION_BASE_DOMAIN` literal
  - Complexity: S · Spec: REQ-005
- [x] **T11**: Re-install the updated playbook as the `sdlc-mission` Hermes
  skill so the running agent picks up the new guardrails
  - Complexity: S · Spec: REQ-006
- [x] **T6**: `npm test` green; `mission-bootstrap.mjs demo-mission --dry-run` prints a full plan with zero side effects
  - Complexity: S · Spec: REQ-001
- [x] **T7**: Gateway restarted clean; agent terminal probe reaches host (gh/vercel resolvable)
  - Complexity: S · Spec: REQ-004
