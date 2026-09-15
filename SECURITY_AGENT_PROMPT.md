# Agent Prompt — Twice-Daily Supply-Chain Security Program

Copy everything below the line into a fresh agent session.

---

You are building a **twice-daily automated security program** for Bryce's codebase, focused on
**supply-chain compromise and adversarial risk from public dependencies, AI-suggested packages, and
agent tooling**. This is a defensive security engagement on Bryce's own machine and his own repos.

## Standing rules (non-negotiable — from Bryce's operating instructions)

1. **OpenSpec is mandatory.** Every change goes proposal → design → specs → tasks → implement →
   document, via the `openspec-*` skills. Bryce's words: "NEVER EVER EVER EVER SKIPPED EVER AGAIN."
   Start by creating the change under `~/agentic-sdlc/openspec/changes/<change-name>/`. Do not write
   implementation code before the spec and task breakdown exist.
2. **All framework work lives in `~/agentic-sdlc`.** Never commit framework scripts or openspec
   artifacts to `~/languageapp`.
3. **No OpenAI. Ever.** No OpenAI dependencies, no OpenAI-backed scanners. Bryce has ethical
   objections (data sold to ICE/border patrol). Acceptable providers: Anthropic, Groq, OpenRouter.
   More broadly: reject any vendor that sells user data to governments or law enforcement — this
   rules out several commercial SCA/SAST SaaS products. **Prefer self-hosted, open-source, offline.**
4. **Integrate, don't duplicate.** A previous over-scoped proposal of mine was rejected for
   reinventing what already existed. Read what's there first.
5. **Notifications** go through `node ~/agentic-sdlc/agents/notify.mjs send "<msg>"` (Telegram).
   Do not invent a new notification path. No WhatsApp.
6. **Scheduling** goes through `agents/scheduler-install.mjs` + `agents/cron-schedule.json`, which
   generate `sdlc-sched-*` systemd **user** timers. Do not hand-write unit files.
7. Finish with Bryce's **done checklist**: openspec → tests → commit → push → deploy → verify →
   notify. "Wrote the code" is not "shipped the fix."

## What already exists — read before designing

- `agents/red-team-tester.mjs` + `sdlc-sched-red-team-weekly.timer` (Sun 22:00). Covers **prompt
  injection, data-exfiltration asks, tool-abuse, jailbreak markers** in `agents/**/AGENT.md` and
  `pm/**/*.md`. It also exports `screenExternalInput()`, which `notify.mjs` already consumes.
  **Your work is a different threat class — supply chain and code integrity. Do not rebuild this.**
  Do consider whether the two should share a report format and severity vocabulary.
- `agents/env-guard.mjs`, `agents/capability-logger.mjs`, `agents/capability-monitor.mjs`,
  `agents/alignment-monitor.mjs` — read these; there may be hooks to reuse.
- `openspec/changes/egress-preflight/` — existing work on egress control. There is a running
  `nellis-egress-proxy` container. Network egress restriction is likely already partly solved.
- `agents/budget.json`, `agents/domains.json`, `agents/model-manager.mjs`, `agents/model-intel.json`
  — how agents get assigned models and fallback chains.
- 20 `sdlc-sched-*` timers are already live. Check `systemctl --user list-timers 'sdlc-sched-*'`
  before adding more, and respect existing slot times.

## Current state of the box (verified 2026-09-15)

**No security tooling is installed at all.** Absent: `gitleaks`, `trufflehog`, `semgrep`,
`osv-scanner`, `syft`, `grype`, `trivy`, `socket`, `snyk`. Present: `npm`, `pnpm`, `node`, `gh`.
Selecting, installing, and pinning that toolchain is part of the job.

Repos in scope (all under `~`), 7 of which carry npm lockfiles:

| Repo | Lockfile | Notes |
|---|---|---|
| `tally` | npm | Customer-facing — granary.farm, real farm data. **Highest blast radius.** |
| `nels-workshop` | npm | Client business OS, production Supabase |
| `personal-website` | npm | Live, brycewadley.com |
| `willtopaint` | npm | Live, willtopaint.com — client (cousin Will) |
| `peach-shaker-5000` | npm | Expo / React Native |
| `wireframe-live` | npm | Has unpushed Hermes commits |
| `agentic-sdlc` | — | The framework itself; **compromise here is total** |
| `component-library` | — | Copy-source components that get pasted into everything |
| `ai-gateway` | — | Holds provider credentials |
| `languageapp` | — | LinguaFlow — read-only for you, never write here |
| `personal-tools`, `cyberdeck` | — | |

Note the asymmetry: `agentic-sdlc` and `component-library` have no lockfile but the **widest**
reach, because their content is executed by agents or pasted into other projects. Weight risk by
blast radius, not by dependency count.

## The two daily runs

Bryce wants **two scans per day, and one of them must run on Fable.**

The reason to use two models is **cross-model diversity**: a single model's blind spots become
systemic if it's the only reviewer. Two different model families reviewing the same surface, with
findings diffed against each other, catches what either alone would miss. Design for that explicitly
— a finding seen by one model and missed by the other is itself a signal worth reporting.

Suggested shape (justify or change it). **A deterministic tool pass runs first in both cases** —
lockfile diff, SBOM, CVE scan, secret scan, install-script audit, integrity verification — and its
raw output is fed to the model as evidence. The tools find the known; the model finds the novel.

- **Run A — early (~06:00), on Opus 5 (`claude-opus-5`).** Tool pass, then reasoning over the
  results and over any diffs since the last run.
- **Run B — later (~18:00), on Fable 5.1 (`claude-fable-5-1`).** Same tool pass, same surface,
  different model. Reads the *actual diffs*, reads newly added dependency source, and reasons like
  an attacker about what a compromised package or a poisoned MCP registry could reach from here.

Both run on this machine against the Max subscription. Same inputs, different model families, so
the diff between their findings is meaningful — that diff is a deliverable, not a side effect.
Keep the two runs' prompts identical apart from the model, or the comparison means nothing.

### Execution path — decided, and verified working

**Run it on this machine through Bryce's Max subscription, via a systemd user timer.** This is
Bryce's explicit decision. There is no Anthropic API key on this box and there does not need to be.

This was verified on 2026-09-15, not assumed:

```
$ env -i HOME=/home/bryce PATH=/home/bryce/.local/bin:/usr/bin:/bin \
    claude -p --model claude-fable-5-1 'Reply with exactly: HEADLESS_OK'
HEADLESS_OK
EXIT=0
```

`claude` is Claude Code 2.1.272 at `/home/bryce/.local/bin/claude`, authenticated by subscription
(no `ANTHROPIC_API_KEY` in the environment). It ran correctly under `env -i` — a stripped
environment, which is what systemd hands a timer. So `claude -p --model claude-fable-5-1` in an
`ExecStart` is a sound foundation. Use `--output-format json` or `stream-json` so the wrapper can
parse results rather than scraping prose.

**Three operational traps to handle — the first was observed in that very test run:**

1. **PATH.** The test emitted `SessionEnd hook ... failed: /bin/sh: 1: node: not found`, because
   `node` is not on a minimal PATH. Timer units must set PATH explicitly. Note that the existing
   `sdlc-sched-red-team-weekly.service` hardcodes
   `/home/linuxbrew/.linuxbrew/Cellar/node/25.6.1/bin` — a **version-pinned Cellar path that will
   break every timer on the next node upgrade.** Prefer `/home/linuxbrew/.linuxbrew/bin`. Consider
   fixing the existing units as a small separate change while you're in there.
2. **Homebrew shadowing.** On this box Homebrew's `python3`/`ffmpeg`/`pactl`/`gsettings` come first
   on PATH and fail *silently*. If any scanner shells out to a system tool, pin `/usr/bin/...` —
   but confirm it exists first; several expected `/usr/bin` tools are absent here.
3. **Concurrency and cost.** A headless run consumes the same subscription capacity Bryce uses
   interactively. Bound it: a hard `timeout`, a turn/token cap, and no overlapping runs
   (systemd oneshot + a lockfile). Do not let a security scan eat a work session.

**Do not mark this done until you have watched both runs actually fire from the timer and produce a
report.** A timer that fails silently is worse than no timer. Bryce has been burned by exactly this
— see the Hermes cron Docker path trap, where a cron job used host paths inside a container and
spammed Telegram every 15 minutes for weeks. Verify with `systemctl --user list-timers`, then read
the actual report file, then check the Telegram side.

## Threat model to cover

Prioritize by what actually hits this setup. Cover at minimum:

**Dependency / package ecosystem**
- **Slopsquatting** — AI coding agents hallucinate plausible-but-nonexistent package names, and
  attackers pre-register them. This is the highest-priority novel vector here, because Bryce runs
  long autonomous agent sessions that add dependencies. Every newly added package should be checked
  for: does it exist upstream with real history, or did an agent invent it and an attacker answer?
- Typosquatting and dependency confusion (private scope names resolvable from a public registry).
- **Install scripts** (`preinstall`/`install`/`postinstall`) — the single most reliable RCE path in
  npm. Consider enforcing `ignore-scripts=true` with a reviewed allowlist.
- Lockfile integrity: every `package-lock.json` change reviewed as a security diff, not noise.
  Integrity hashes present and unchanged for unchanged versions. A resolved-URL change pointing off
  the official registry is a red flag.
- Maintainer/ownership changes, suspicious version jumps, packages published in the last N days,
  packages with a sudden new maintainer — the classic account-takeover pattern.
- Transitive risk and unpinned ranges; npm provenance / sigstore attestation where available.

**Copy-source components (specific to how Bryce builds)**
- `~/component-library` and any shadcn-style registry content is **copied source, not a dependency**
  — it is invisible to `npm audit` and to every SCA tool by construction. It needs its own review
  path: provenance of where each component came from, and a re-scan when upstream changes.
- Note: I am concurrently proposing a change to expose `~/component-library` as a **shadcn registry
  over MCP** so agents install from it. Coordinate with that work. A component registry an agent
  installs from unattended is a supply-chain surface with real teeth, and it should be designed
  with your controls in place rather than retrofitted.

**Agent / AI-specific**
- MCP server supply chain: this box runs `firecrawl` and Vercel MCP servers, and more are coming.
  MCP servers are arbitrary code with tool-call reach. Tool poisoning and description injection are
  live risks. Inventory what's configured in `~/.claude/` and treat each server as a dependency.
- Prompt-injection reaching a *tool-using* agent — defer to `red-team-tester.mjs` for prompt content,
  but consider the path where scraped web content (Firecrawl!) reaches an agent that can write files.

**Secrets and code**
- Secret scanning across all repos **and git history**, not just the working tree. There are known
  credential-bearing repos here (`ai-gateway`, `~/.hermes/.env`, Supabase keys, Telegram tokens).
- SAST for the obvious classes. Note Bryce's known trap: **a Supabase RLS policy is not a GRANT** —
  RLS-enabled tables can still be wide open, and a permissive test harness will hide it.
- CI/CD: GitHub Actions pinned to commit SHAs, not tags. Workflow write-permission audit.

## Output requirements

- Dated markdown report per run, consistent with the existing `pm/red-team-reports/` convention.
- Severity buckets shared with the existing red-team tool so the two are readable together.
- **Notify on HIGH only.** Bryce has been spammed by a runaway cron before and it destroys trust in
  the whole notification channel. Everything else goes in the report.
- A cross-run diff: what Run A caught that Run B missed and vice versa. That comparison is the
  point of using two models.
- **Zero-finding runs must still be observable** — a silent success and a dead timer must not look
  identical. Track last-successful-run and alert on staleness.

## Guardrails on your own work

- Real findings only. A scanner that cries wolf gets muted, and then it protects nothing. Tune for
  a signal Bryce will still be reading in three months.
- Everything must run **offline/self-hosted where possible**. Do not ship code that uploads Bryce's
  source, dependency graph, or SBOM to a third-party SaaS for analysis without flagging it and
  getting an explicit decision.
- Don't let this become a rewrite of the framework. Add a capability; leave the rest alone.
- If you find an **actual live compromise** at any point, stop, do not "fix it quietly," and notify
  immediately with evidence.

## Start here

1. Read `agents/red-team-tester.mjs`, `agents/scheduler-install.mjs`, `agents/cron-schedule.json`,
   `agents/notify.mjs`, and `openspec/changes/egress-preflight/`.
2. Resolve the Fable execution blocker — that decision shapes the whole design.
3. Write the OpenSpec proposal. Get it in front of Bryce before implementing.
