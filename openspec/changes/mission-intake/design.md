# Design — mission-intake

## Division of labor: deterministic script vs. LLM agent

The LLM agent is good at turning an idea into specs and tasks; it is bad at
reproducing a 10-step host ceremony. So the bootstrap is a script and the
creative work stays with the agent:

- `mission-bootstrap.mjs` — everything mechanical, idempotent, no LLM.
- The agent (via the `sdlc-mission` skill) — clarify the idea (≤1 question
  round), run the bootstrap, author openspec artifacts + queue tasks in the
  new project, push, report. The existing drain/review/deploy machinery does
  the rest unchanged.

## mission-bootstrap.mjs

`node agents/mission-bootstrap.mjs <kebab-name> [--description "…"] [--no-deploy] [--dry-run]`

Steps (each guarded, re-runnable):
1. Validate name (`^[a-z][a-z0-9-]{1,38}$` — repo, Vercel project, clone dirs
   all reuse it).
2. `gh repo create that-gum-you-like/<name> --private` (skip if exists);
   clone to `~/<name>` (skip if present).
3. `setup.mjs --yes` (its writeIfNotExists semantics make re-runs safe).
4. Budget ladders: copy the framework's OpenRouter chains onto every agent in
   the new project's budget.json; `emergencyFallbackModel` deepseek-v4-flash.
   (Pilot lesson: setup.mjs defaults to Claude models — never again.)
5. project.json patch: provider telegram + desktop true + deploy triggers;
   `deploy` block enabled (unless `--no-deploy`) with
   smokeUrl `https://<name>-that-gum-you-likes-projects.vercel.app`,
   approval telegram, baseBranch main.
6. `.gitignore` additions; initial commit + push -u origin main.
7. `vercel link --yes` (creates/links the Vercel project; .vercel/ is
   git-ignored by the CLI itself).
8. Cron jobs in `agents/cron-schedule.json`: `<name>-drain` every 15 min and
   `<name>-review` every 20 min, minutes offset by `hash(name) % 13 + 1`
   (never :0 — the framework's own jobs run there; pilot lesson #2);
   append `--project-dir ~/<name>` to deploy-reconcile.
9. `scheduler-install.mjs install`.
10. Print a mission summary (paths, URLs, next steps for the agent).

Pure helpers exported for tests: `validateName`, `smokeUrlFor`,
`cronMinutesFor(name)` (deterministic hash), `patchProjectJson(obj, opts)`,
`buildCronJobs(name, home)`.

## MISSION_PLAYBOOK.md (installed as Hermes skill `sdlc-mission`)

Sections: (1) intake rules — restate the idea as scope bullets, ask at most
one round of questions, pick the kebab name; (2) bootstrap command; (3)
authoring — openspec proposal/design/specs/tasks in the project, then 3–8
SMALL queue tasks, each with concrete files + its own test, first task builds
the test harness the testCmd expects, dependency-chained via `blockedBy`; (4)
Supabase (only when the idea needs a DB): `supabase projects create <name>
--org-id pokrglvhuuyufsiuanql --db-password $(openssl rand -base64 18)`,
capture keys → `~/<name>/.env.local` (NEVER committed), reference env names in
tasks; (5) reporting — one Telegram summary: what was created, when the first
drain tick fires, that deploy will ask for APPROVE; (6) guardrails — never
push to main directly, never run vercel/supabase deploy commands yourself,
never modify the framework repo or its guardrail files, never bypass the
approval, escalate to Bryce when blocked.

The skill file at `~/.hermes/skills/sdlc-mission/SKILL.md` is a COPY of the
repo playbook (repo = source of truth; host step documented in tasks).

## Host config: terminal.backend local

The gateway agent must run `gh`/`vercel`/`node` with the host's auth. Docker
sandboxes deliberately do not see host credentials. `terminal.backend: local`
is the same trust level the drain already uses (`TERMINAL_ENV=local`), and
Telegram access is pairing-gated to Bryce's account (approved pairing
V5JXZGE9, chat id 5538331282). Backup of config.yaml taken before the flip.

## Non-goals

Multi-tenant missions (one owner); non-Vercel deploy targets; automatic
Supabase provisioning inside the bootstrap (stays an agent step per playbook);
deleting/archiving finished mission projects.
