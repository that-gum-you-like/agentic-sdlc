# Design: hermes-github-write-access

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: design

---

## Architecture

```
sandboxed / autonomous cycle (dirty repo clone)
  └─ node agents/hermes-git-push.mjs push --repo <dir> --id <cycle-id>
       ├─ Gate 0: token       GITHUB_WRITE_TOKEN (preferred) or GITHUB_TOKEN
       │                      from env / ~/.hermes/.env — never printed
       ├─ Gate 1 (GitHub):    fine-grained PAT scope = only Bryce-selected repos
       ├─ Gate 2 (client):    ~/.hermes/github-write-allowlist.json
       │                      { repos[], branchPrefix, protectedBranches[] }
       ├─ commit              commit -A if dirty (no-op when clean + not ahead)
       ├─ push                https://x-access-token:<tok>@github.com/<o>/<r>
       │                      HEAD -> refs/heads/hermes/auto/<cycle-id>
       │                      (no force, never a protected branch)
       └─ draft PR            POST /repos/<o>/<r>/pulls (base main, draft)
                              422 "already exists" -> treated as success
```

## Key decisions

**D1 — Two independent gates, fail closed.** The push URL is only ever built
after (a) origin `owner/name` ∈ allowlist `repos` AND (b) target branch starts
with `branchPrefix` AND ∉ `protectedBranches`. A missing/unparseable allowlist
means REFUSE (empty `repos` allows nothing). The fine-grained PAT's own repo
selection is the server-side gate — the helper works with any token but can
never widen its scope.

**D2 — Token discovery.** `GITHUB_WRITE_TOKEN` env → `GITHUB_TOKEN` env →
same keys parsed from `~/.hermes/.env` (mode 600, already exists). The token
never appears in stdout/stderr/errors: the push remote is passed to git as an
argument and every error path scrubs `x-access-token:[^@]*@` before rethrow.

**D3 — Branch naming is not caller-controlled.** The caller supplies only
`--id <cycle-id>` (sanitized to `[A-Za-z0-9._-]`); the branch is always
`<branchPrefix><cycle-id>`. There is no flag to name an arbitrary branch, so
"never push to main" holds by construction, and `protectedBranches` is a
belt-and-suspenders check on top.

**D4 — Draft PR via REST, stdlib only.** Global `fetch` (Node ≥ 18) against
`https://api.github.com/repos/<o>/<r>/pulls` with the same token. `--base`
defaults to `main` — that is the PR *target*, reviewed by a human or
pr-auto-review; it is never a push target. Duplicate-PR (422) is success.

**D5 — Testability.** All effects go through injectable seams:
`runGit(args, {cwd})` shells out to `git` (fake `git` shim on PATH in tests),
`fetchImpl` parameter for the API call, `HERMES_ALLOWLIST_PATH` env overrides
the allowlist location, `HERMES_ENV_PATH` overrides the .env location. Pure
functions (`parseOrigin`, `guard`, `sanitizeId`, `redact`) are exported.

**D6 — Cycle wiring deferred (opt-in).** `hermes-drain.sh` already pushes via
the host `gh` auth; the helper's consumers are sandboxed Hermes runs that lack
that auth. Wiring the drain to the helper is deferred until Bryce creates the
fine-grained PAT (the proposal's blocking dependency) — the helper is shipped,
tested, and documented so wiring is a one-line change.

**D7 — Allowlist scaffold.** `hermes-git-push.mjs init` writes
`~/.hermes/github-write-allowlist.json` (mode 600) seeded with
`that-gum-you-like/agentic-sdlc`, `branchPrefix: "hermes/auto/"`,
`protectedBranches: ["main", "master"]` — never overwriting an existing file.
Editing this file is how Bryce designates/revokes projects (Gate 2); the PAT's
repo selection is Gate 1.

## Failure modes

| Condition | Behavior |
|---|---|
| No token found | exit 1, names both env keys, no git calls |
| Repo not in allowlist | exit 1 `repo not allowlisted`, nothing pushed |
| Branch protected / wrong prefix | exit 1, nothing pushed |
| Clean tree, nothing ahead | exit 0 `nothing to push` (no-op) |
| Push rejected (server) | exit 1 with scrubbed stderr |
| PR already exists (422) | exit 0, prints existing-PR notice |
