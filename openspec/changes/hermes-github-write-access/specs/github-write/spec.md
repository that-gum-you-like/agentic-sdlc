# Spec: hermes-github-write-access

**Date**: 2026-07-06
**Author**: Fable (claude-fable-5) with Bryce
**Status**: specs
**Capability**: NEW

---

## Overview

A two-gate, least-privilege GitHub push helper so autonomous Hermes cycles land
on a namespaced branch + draft PR in Bryce-designated repos only — never a
direct push to a protected branch.

---

### REQ-001: Repo allowlist gate

**Statement:** The system shall refuse to push unless the working repo's
`origin` owner/name appears in `repos` of
`~/.hermes/github-write-allowlist.json`; a missing or unparseable allowlist
shall allow nothing.

**Acceptance Criteria:**
- [ ] Origin parsed from both `https://github.com/o/r(.git)` and `git@github.com:o/r(.git)` forms
- [ ] Repo not in `repos` → exit 1 with a clear message, zero pushes
- [ ] Missing allowlist file → refuse (fail closed)
- [ ] `HERMES_ALLOWLIST_PATH` overrides the location (tests)

**Dependencies:** none · **Complexity:** S · **Value:** Critical

---

### REQ-002: Protected-branch guard

**Statement:** The system shall only push to `refs/heads/<branchPrefix><id>`
where `id` is the sanitized `--id` argument, and shall refuse any target listed
in `protectedBranches`; no force-push flag shall exist.

**Acceptance Criteria:**
- [ ] Branch name is always `<branchPrefix><sanitized-id>`; no CLI flag can name an arbitrary branch
- [ ] A branch in `protectedBranches` (or one that doesn't start with the prefix) is refused
- [ ] `--id` is sanitized to `[A-Za-z0-9._-]`; an id that sanitizes to empty is refused
- [ ] The git push invocation never includes `--force`/`-f`

**Dependencies:** REQ-001 · **Complexity:** S · **Value:** Critical

---

### REQ-003: Token handling

**Statement:** The system shall read `GITHUB_WRITE_TOKEN` (preferred) or
`GITHUB_TOKEN` from the environment or `~/.hermes/.env`, and shall never emit
the token to stdout, stderr, or error messages.

**Acceptance Criteria:**
- [ ] Env var wins over `.env` file; `GITHUB_WRITE_TOKEN` wins over `GITHUB_TOKEN`
- [ ] No token found → exit 1 before any git call
- [ ] Error paths scrub `x-access-token:...@` from surfaced text
- [ ] `HERMES_ENV_PATH` overrides the .env location (tests)

**Dependencies:** none · **Complexity:** S · **Value:** Critical

---

### REQ-004: Commit + push + draft PR

**Statement:** The system shall commit a dirty working tree, push `HEAD` to the
computed branch on the token remote, and open a draft PR against `--base`
(default `main`) via the GitHub REST API, treating an already-existing PR (422)
as success.

**Acceptance Criteria:**
- [ ] Dirty tree → single commit (`hermes auto cycle <id>` unless `--title` given)
- [ ] Clean tree with nothing ahead of the remote branch → exit 0 no-op
- [ ] PR created with `draft: true`, head `<branchPrefix><id>`, base `--base`
- [ ] HTTP 422 duplicate → exit 0 with notice; other API failures → exit 1 (push already landed, reported)
- [ ] Zero npm dependencies (git subprocess + global fetch); rule #9 CLI guard

**Dependencies:** REQ-001, REQ-002, REQ-003 · **Complexity:** M · **Value:** High

---

### REQ-005: Allowlist scaffold

**Statement:** The system shall provide an `init` mode that writes a seeded
allowlist (`that-gum-you-like/agentic-sdlc`, prefix `hermes/auto/`, protected
`main`+`master`) with file mode 600, never overwriting an existing file.

**Acceptance Criteria:**
- [ ] `init` creates the file when absent; second `init` leaves it untouched
- [ ] Created file parses and passes the REQ-001 gate for the seeded repo

**Dependencies:** none · **Complexity:** S · **Value:** Medium
