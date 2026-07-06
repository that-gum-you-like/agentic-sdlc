# Proposal: hermes-github-write-access

**Date**: 2026-07-06
**Author**: CTO-Opus (claude-opus-4-8[1m]) with Bryce
**Status**: proposed

---

## Problem

Autonomous Hermes drain work is produced inside per-sandbox Docker home
directories (`~/.hermes/sandboxes/docker/<name>/home`) and **never leaves**.
There is no step that pushes a cycle's output to GitHub, so the only copy lives
in a throwaway sandbox — which is how an entire body of work came to be
(wrongly) reported as "trapped in Docker," and how it silently drifted 75
commits behind `main` on a stale fork before anyone noticed
(see `hermes-sandbox-salvage`).

The fix Bryce chose: **Hermes should be able to write to GitHub — for any
project Bryce explicitly designates — so every cycle lands on a branch and
opens a PR, behind review, instead of rotting in a sandbox.**

Two constraints make this non-trivial:
1. **Scope must be Bryce-controlled per project.** Not "all repos the account
   can touch" — only the repos Bryce names. The mechanism must make it
   impossible for Hermes to push to a repo Bryce did not designate.
2. **`main` must never be a direct push target.** Autonomous work lands on a
   namespaced branch and a PR; a human (or the existing `pr-auto-review` gate)
   merges. This preserves the review discipline that the stale-fork incident
   bypassed.

## Discovery

- The Hermes containers run as root with `/root` bind-mounted rw to the host, so
  a credential file placed on the host is visible inside the container.
- `~/.hermes/.env` already exists (host-only `600`) and already holds
  `OPENROUTER_API_KEY`; it is the natural home for a GitHub token.
- The host `gh` is authed as `that-gum-you-like` with broad `repo` scope — **too
  broad** to hand to an autonomous free-tier model. A **fine-grained PAT** lets
  Bryce select the *exact* repositories the token may touch and cap permission
  at `contents: read/write` + `pull_requests: read/write`, directly implementing
  "projects I determine."
- GitHub **branch protection** on `main` (require PR, block direct pushes)
  provides a server-side guarantee independent of any client-side allowlist.
- The framework already has a `pr-auto-review.mjs` gate and an autonomous-loop
  concept of "dedicated clones" — a push+PR step slots into the existing cycle.

## Proposed Solution

A **two-gate, least-privilege** GitHub write capability for Hermes:

1. **Credential (Gate 1 — GitHub-side scope).** Bryce creates a **fine-grained
   PAT** selecting only the designated repositories, permissions
   `Contents: Read and write` + `Pull requests: Read and write` (+ `Workflows:
   Read and write` only if CI files must change). Stored as
   `GITHUB_WRITE_TOKEN` in `~/.hermes/.env` (mode `600`). Rotatable; expiry set
   by Bryce.
2. **Allowlist (Gate 2 — client-side, Bryce-editable).** A host file
   `~/.hermes/github-write-allowlist.json` — `{ "repos": ["owner/name", ...],
   "branchPrefix": "hermes/auto/", "protectedBranches": ["main"] }`. The push
   helper refuses any repo not in `repos` and any push whose target is a
   protected branch. Editing this file is how Bryce adds/removes projects.
3. **Push helper** (`agents/hermes-git-push.mjs`, tested) — given a working repo
   it: verifies `origin` owner/name ∈ allowlist; verifies target branch starts
   with `branchPrefix` and ∉ `protectedBranches`; commits staged work; pushes to
   `https://x-access-token:${GITHUB_WRITE_TOKEN}@github.com/<owner>/<name>` on a
   `hermes/auto/<cycle-id>` branch; opens a draft PR via the GitHub API. Never
   force-pushes; never targets `main`.
4. **Cycle wiring** — the autonomous drain calls the push helper at end of cycle
   so output always reaches GitHub. On allowlist/branch-guard rejection it logs
   and leaves the sandbox commit intact (no data loss) rather than failing hard.
5. **Server-side backstop** — document + (where Bryce grants admin) enable branch
   protection on `main` for each designated repo, so the PR requirement holds
   even if the client guards are bypassed.

## Value Analysis

- **Eliminates the "stuck in a sandbox / silent stale fork" failure class** at
  the root: work is on GitHub every cycle, diffable and reviewable.
- **Bryce keeps precise control** — the fine-grained PAT's repo selection *is*
  the "projects I determine" list; the allowlist file is a second, instantly
  editable gate.
- **Safe by construction** — least-privilege token, no direct `main` pushes,
  draft PRs into the existing review gate, no force-push.
- **Privacy/compliance clean** — GitHub only; no new third parties; token
  host-only and rotatable.
- **Cost:** M. One tested helper + one config file + cycle wiring + docs.
  Blocking dependency: Bryce generates the fine-grained PAT and names the repos.

## Blocking Dependency (Bryce)

Create a fine-grained PAT (GitHub → Settings → Developer settings → Fine-grained
tokens) with **Resource owner = that-gum-you-like**, **Repository access =
Only select repositories** (choose the projects to designate), **Permissions =
Contents R/W + Pull requests R/W**, then paste it once so it can be written to
`~/.hermes/.env` as `GITHUB_WRITE_TOKEN`. Nothing else is blocked on this.
