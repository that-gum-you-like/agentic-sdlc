# Specs — mission-intake

## REQ-001 — One-command project bootstrap

**Statement:** `mission-bootstrap.mjs <name>` produces a drain-ready project:
private repo, framework scaffold, OpenRouter-only ladders, telegram+desktop
notifications, deploy block (telegram approval, computed team-scoped smoke
URL), Vercel link, initial push, scheduled drain/review jobs, deploy-reconcile
registration. Idempotent; `--dry-run` prints the plan without side effects.
**Acceptance:** unit tests on validateName / smokeUrlFor / patchProjectJson /
buildCronJobs; dry-run executes on a real name with zero writes.

## REQ-002 — No repeat of the two live incidents

**Statement:** Bootstrapped budget.json contains zero Claude/Anthropic models;
generated cron jobs never fire at minutes 0/15/30/45 and are deterministic per
name.
**Acceptance:** unit tests: ladder rewrite output; `cronMinutesFor` avoids
{0,15,30,45}, stable across calls, differs across names (spot check).

## REQ-003 — Agent-facing playbook

**Statement:** `docs/MISSION_PLAYBOOK.md` gives the gateway agent the full
idea→deploy procedure including the Supabase org id
(`pokrglvhuuyufsiuanql`, "Bryce's Org"), Vercel team
(`that-gum-you-likes-projects`), secret-handling rules (.env.local, never
committed), and guardrails (no manual deploys, no framework edits, approvals
stay on). Installed as Hermes skill `sdlc-mission` (host copy of the repo
file).
**Acceptance:** playbook exists with those literals; skill file present under
`~/.hermes/skills/sdlc-mission/`.

## REQ-004 — Gateway agent can operate the host toolchain

**Statement:** The Hermes terminal backend is `local` so the paired agent
reaches host `gh`/`vercel`/`supabase`/framework scripts; gateway restarts
clean afterward.
**Acceptance:** config flip applied with backup; `hermes` shell probe shows a
host path; gateway service active with no new errors.
