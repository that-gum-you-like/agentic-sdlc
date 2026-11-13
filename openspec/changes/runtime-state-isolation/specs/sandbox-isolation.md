# Specs — sandbox-isolation

**Date**: 2026-11-12
**Author**: Claude with Bryce
**Status**: specs

Covers `~/.hermes/config.yaml` (`terminal.docker_*`, `docker_mount_cwd_to_workspace`), `agents/hermes-cron-guard.mjs` (or a sibling `agents/hermes-config-guard.mjs`), `agents/checkout-doctor.mjs`. Band 060-069.

Prefix `RS` (see `openspec/REQUIREMENT-PREFIXES.md`). Scenarios are Given/When/Then and transcribe directly into the named test files. Node stdlib only; no new dependency; no OpenAI.

**Confirmed root cause (2026-11-12, Bryce):** three running Hermes Docker containers (`hermes-a08d6519`, `hermes-3ea76145`, `hermes-ed0a7fff`; `docker inspect`) bind-mount `/home/bryce` to `/workspace` READ-WRITE and run as root. The mount is produced by `~/.hermes/config.yaml` (`terminal.docker_mount_cwd_to_workspace: true` near line 72, plus the other `terminal.docker_*` keys) when the agent cwd is the human home. Container writes therefore land on the host as root, which explains the root-owned `tasks/completed/` and `agents/secrets.mjs` in the live checkout. `/workspace/agentic-sdlc` inside those containers IS the live checkout (not a separate copy).

---

## RS-REQ-060 — Sandboxes never mount the human home or the live checkout read-write

**Statement:** a Hermes Docker sandbox shall not bind-mount the human home directory, any ancestor of it, or any live project checkout (`~/agentic-sdlc`, `~/tally`, `~/nels-workshop`, ...) with write access.

**Acceptance:** the only read-write host mount into a sandbox is a dedicated per-project worktree. Read-only mounts of the home or a checkout are permitted only when explicitly listed; the default has none.

**Scenario:** GIVEN a freshly started sandbox for project `agentic-sdlc` WHEN its `Mounts` are inspected THEN no mount has `Source` equal to or above `/home/bryce` with `RW: true`.

**Test:** `tests/hermes-config-guard.test.mjs`, `tests/checkout-doctor.test.mjs` | **Complexity:** S | **Value:** HIGH | **Dependencies:** none | **Lane:** interactive

---

## RS-REQ-061 — Dedicated per-project workspace is the only writable mount

**Statement:** Hermes shall mount `~/.hermes/workspaces/<project>` (a git worktree of the project, created off `origin/<base>`) at `/workspace`, and nothing else from the host read-write.

**Acceptance:** `docker_mount_cwd_to_workspace` is `false` (or cwd is the dedicated workspace); an explicit workspace mount is configured through the `terminal.docker_*` volume keys; the workspace is created by `agents/worktree.mjs` conventions and is never the live checkout; the directory is owned by the human user and the container user maps to it, so files written there are not root-owned on the host.

**Scenario:** GIVEN project `agentic-sdlc` WHEN a sandbox starts THEN `/workspace` resolves on the host to `~/.hermes/workspaces/agentic-sdlc` and `git -C` there reports a worktree whose `HEAD` is a feature branch, not the live checkout's branch.
**Scenario:** GIVEN the sandbox writes a file WHEN the host stats it THEN the owner is the human uid, not 0.

**Test:** `tests/hermes-config-guard.test.mjs` ("workspace mount is per project", "mount source is not the live checkout", "file ownership is the human uid") | **Complexity:** M | **Value:** HIGH | **Dependencies:** RS-REQ-060 | **Lane:** interactive

---

## RS-REQ-062 — Output returns through git, never through a shared tree

**Statement:** work produced in a sandbox shall reach the live checkout only as a pushed branch and a pull request (or git bundle for unpushed work), never by the sandbox writing into the live tree.

**Acceptance:** the sandbox workspace is on a feature branch; the existing sandbox-extraction path (git bundle + chown) remains valid for the dedicated workspace only; no sandbox process needs the live checkout path to exist.

**Scenario:** GIVEN a sandbox commit WHEN the drain collects it THEN it arrives as a branch/PR and `git status --porcelain` in the live checkout is unchanged.

**Test:** `tests/hermes-config-guard.test.mjs` ("live checkout status unchanged after sandbox write") | **Complexity:** S | **Value:** HIGH | **Dependencies:** RS-REQ-061 | **Lane:** interactive

---

## RS-REQ-063 — Config guard fails loudly

**Statement:** a config guard (`agents/hermes-cron-guard.mjs` extended, or `agents/hermes-config-guard.mjs`) shall exit non-zero and print the offending key and value when `docker_mount_cwd_to_workspace` is true and the configured cwd is the human home, an ancestor of it, or a live checkout, or when any `terminal.docker_*` volume entry mounts one of those paths read-write.

**Acceptance:** config path and cwd are injectable; the message states the fix (set the key false, mount `~/.hermes/workspaces/<project>`); the guard runs in `health-check.mjs` and before the Hermes gateway is (re)started by `scheduler-install.mjs` when applicable; a missing config file is a pass with a note, not a failure; read-only; it never edits the config.

**Scenario:** GIVEN `docker_mount_cwd_to_workspace: true` and cwd `/home/bryce` WHEN the guard runs THEN rc is 1 and stderr names the key, the value and the fix.
**Scenario:** GIVEN the mount flag false and a dedicated workspace volume WHEN it runs THEN rc is 0.

**Test:** `tests/hermes-config-guard.test.mjs` ("flag true + home cwd -> fail", "flag true + dedicated workspace cwd -> pass", "rw volume of live checkout -> fail", "ro volume permitted only when listed", "missing config -> pass with note", "never writes the config") | **Complexity:** M | **Value:** HIGH | **Dependencies:** none | **Lane:** interactive

---

## RS-REQ-064 — Doctor detects exposed running containers

**Statement:** `checkout-doctor` shall inspect running `hermes-*` containers (`docker inspect`, injectable runner) and report any whose `Mounts` include the human home, an ancestor, or a live checkout with `RW: true`, naming the container, the mount and the fix; `health-check.mjs` shall alert once per container-id set.

**Acceptance:** read-only; docker unavailable or no containers is a note, not a failure; the report is included in `--json`; alerting reuses the deduped notifier.

**Scenario:** GIVEN a container with `/home/bryce -> /workspace` RW WHEN the doctor runs THEN it lists the container id, the mount and "stop and recreate with a dedicated workspace".
**Scenario:** GIVEN no hermes containers WHEN the doctor runs THEN the section reports "none running" and exits 0.

**Test:** `tests/checkout-doctor.test.mjs` ("rw home mount reported", "dedicated workspace mount clean", "docker missing is a note"), `tests/health-check.test.mjs` ("new exposed container alerts once") | **Complexity:** S | **Value:** HIGH | **Dependencies:** RS-REQ-040 | **Lane:** hermes

---

## Invariants

- No sandbox has write access to anything outside its dedicated workspace.
- The guard and the doctor detect and warn; neither repairs, restarts containers or edits the Hermes config.

## Out of Scope

- Hardening the container user (rootless/userns) beyond mapping workspace ownership; a separate change if wanted.
- Re-enabling the Docker Hermes cron lane.
