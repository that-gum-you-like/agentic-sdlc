# Mission Playbook — idea → deployed product, autonomously

Audience: **the Hermes mission agent** (Telegram/CLI). When Bryce describes a
project idea, this is your procedure. The heavy machinery (drain, review,
merge, approval-gated deploy) already runs on timers — your job is intake,
bootstrap, and authoring the work. Everything runs on OpenRouter; never
introduce OpenAI or Anthropic dependencies anywhere.

## 1. Intake (one message round, maximum)

Restate the idea as 3–6 scope bullets (what v1 IS and IS NOT). Ask at most ONE
round of clarifying questions, and only if something blocks task-writing —
otherwise decide sensibly and note your assumptions. Pick a kebab-case name
(2–39 chars, `[a-z0-9-]`): it becomes the GitHub repo, Vercel project, and
directory name.

## 2. Bootstrap (one command — do not improvise these steps)

```bash
node ~/agentic-sdlc/agents/mission-bootstrap.mjs <name> --description "<one-liner>"
```

This creates the private repo (`that-gum-you-like/<name>`), clones to
`~/<name>`, scaffolds the framework, sets OpenRouter-only model ladders,
wires Telegram+desktop notifications, enables the approval-gated Vercel deploy,
links Vercel, attaches the production domain **`<name>.brycewadley.com`**
(automatic once the wildcard DNS record exists; falls back to
`https://<name>-that-gum-you-likes-projects.vercel.app` if the attach fails),
pushes `main`, and schedules `<name>-drain` / `<name>-review` timers.
Add `--no-deploy` only if Bryce said the project shouldn't ship anywhere yet;
`--no-domain` keeps a mission off brycewadley.com.

## 3. Supabase (ONLY if the idea needs a database/auth/storage)

```bash
supabase projects create <name> --org-id pokrglvhuuyufsiuanql \
  --db-password "$(openssl rand -base64 18)" --region us-east-2
supabase projects api-keys --project-ref <ref-from-create-output>
```

Org: **Bryce's Org** (free tier — one small instance; if creation fails on
plan limits, tell Bryce instead of switching orgs). Write the URL + keys to
`~/<name>/.env.local` as `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_PASSWORD`. **`.env.local` is git-ignored and must NEVER be
committed or pasted into chat/tasks/PRs.** Tasks reference env var NAMES only.
Schema changes go through `supabase/migrations/` files committed to the repo,
applied with `npx supabase db push` (document this in the relevant task).

## 4. Author the work (in `~/<name>`)

1. **OpenSpec artifacts** — `openspec/changes/<name>-v1/`: proposal.md (with
   Value Analysis), design.md, specs/ (REQ-xxx with acceptance), tasks.md.
2. **Seed the queue** — 3–8 files in `tasks/queue/`, `V1-001.json` onward,
   copying the shape of the pilot's task. Rules that make the drain succeed:
   - each task ≤ ~1 hour of work, names its exact files, and DEFINES its test;
   - **V1-001 must create the test harness `agents/project.json → testCmd`
     expects** (a failing testCmd blocks every later merge);
   - chain dependencies with `blockedBy` (the drain only picks unblocked);
   - every description ends with the definition of done: tests pass, branch
     pushed, draft PR opened, "Do NOT deploy — the pipeline owns deploys."
3. `git add -A && git commit -m "feat: v1 openspec + task seed" && git push`.

## 5. Report back to Bryce (one Telegram message)

Project name + repo URL; scope bullets + assumptions; how many tasks were
seeded; "first drain tick within 15 min; each merge and every deploy request
will arrive here; deploys wait for your `APPROVE <sha8>` to
@Nels_hermes_deploy_bot"; the smoke URL where v1 will appear.

## 6. Guardrails (hard rules)

- NEVER create `hermes cron` jobs (or any other scheduler entries). ALL
  scheduling already exists: mission-bootstrap installs the drain/review
  timers and registers deploy-reconcile. If you think a schedule is missing,
  report it to Bryce — do not build one. (Live incident 2026-07-27: an agent
  created queue-drainer/*2min* + deploy jobs pointing at scripts that never
  existed, spamming failures.)
- ALWAYS work inside `~/<project>`. Before ANY scaffold, bootstrap, or git
  command, run `pwd` and confirm it. NEVER create `agents/`, `pm/`, `tasks/`,
  `scripts/`, `docs/`, or `logs/` at the HOME directory root or `/workspace`.
  (Live incident 2026-07-27: `$HOME` got scaffolded as a fake "/workspace"
  project, as root.)
- NEVER use `sudo` or `docker`. Everything you legitimately need runs as the
  normal user. A permission error means STOP and report, not escalate.
- NEVER reference a script path you have not verified exists (`ls` it first).
- NEVER push to `main` directly, run `vercel`/`supabase db push` deploy
  commands yourself, or mark tasks completed — the pipeline owns all of that.
- NEVER modify `~/agentic-sdlc` (the framework) or any project's
  budget/scheduler/deploy files during a mission; if the framework itself
  seems broken, STOP and tell Bryce.
- NEVER weaken or bypass the Telegram deploy approval, and never commit
  secrets (tokens, keys, .env*).
- Budget: if OpenRouter spend for a mission looks like it will exceed ~$5,
  pause and ask Bryce.
- When blocked > 2 attempts on anything, report the blocker to Bryce instead
  of improvising around a guardrail.

## Reference card

| Fact | Value |
|---|---|
| GitHub owner | `that-gum-you-like` (gh CLI authed) |
| Vercel team | `that-gum-you-likes-projects` (CLI authed; prod alias `<name>-<team>.vercel.app`) |
| Supabase org (free) | `Bryce's Org` — id `pokrglvhuuyufsiuanql` |
| Secrets file | `~/.hermes/.env` (never copy values out of it) |
| Framework + RUNBOOK | `~/agentic-sdlc`, `~/agentic-sdlc/docs/RUNBOOK.md` |
| Task JSON exemplar | `~/hermes-pilot/tasks/queue/PILOT-001.json` |
| Deploy approvals | Bryce → @Nels_hermes_deploy_bot: `APPROVE <sha8>` |
