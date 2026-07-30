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

## REQ-005 — Missions ship on brycewadley.com subdomains

**Statement:** With the wildcard `*.brycewadley.com → cname.vercel-dns.com`
Cloudflare record in place, `mission-bootstrap.mjs` attaches
`<name>.brycewadley.com` to the Vercel project and promotes it to the
project's `deploy.verify.smokeUrl`, widening `verify.timeoutSeconds` to at
least 180 to absorb first-deploy certificate issuance. The attach is
**best-effort**: if it fails, the team-scoped `vercel.app` alias from REQ-001
stays authoritative and the mission still ships. `--domain <base>` overrides
the base domain; `--no-domain` keeps a mission off it entirely.
**Acceptance:** unit tests on `missionDomainFor` (default base, override) and
`MISSION_BASE_DOMAIN`; a failed `vercel domains add` leaves the mission
bootstrapping to completion on the vercel.app smoke URL.
**Dependencies:** REQ-001
**Complexity:** S
**Value:** Missions get a real, memorable home instead of an opaque
`<name>-that-gum-you-likes-projects.vercel.app` string.

## REQ-006 — The playbook encodes the 2026-07-27 incidents as hard rules

**Statement:** `docs/MISSION_PLAYBOOK.md` forbids, in the guardrails section:
creating any scheduler entry (`hermes cron` or otherwise — bootstrap already
installs every timer a mission needs); working anywhere but `~/<project>`
(confirm with `pwd` before any scaffold/bootstrap/git command; never scaffold
`$HOME` or `/workspace`); using `sudo` or `docker` (a permission error means
stop and report, never escalate); and referencing any script path not verified
to exist.
**Acceptance:** the playbook contains all four prohibitions with their
incident citations; the installed Hermes skill copy matches.
**Dependencies:** REQ-003
**Complexity:** S
**Value:** Three live incidents in one day — a self-scheduling loop pointed at
nonexistent scripts, `$HOME` scaffolded as a project by root — each now has a
named rule instead of relying on the agent's judgment.
