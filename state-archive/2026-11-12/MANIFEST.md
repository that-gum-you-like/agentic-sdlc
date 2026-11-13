# Dirty-tree preservation manifest (2026-11-12)

Source: live checkout `~/agentic-sdlc` at HEAD `9c8711e` (36 commits behind `origin/main`).
Full byte-level backup (read-only, outside git): `~/sdlc-dirty-backup-20261112`
(status.txt, tracked-changes.patch, modified-files-full.tgz, untracked.tgz, deleted-head/, deleted-files.txt).
The live tree was stashed as `dirty-tree-2026-11-12` (`git stash list`) after this archive was made.

## Disposition per path group

| Path(s) | Count | What it is | Disposition |
|---|---|---|---|
| `agents/command-center-sync.mjs`, `agents/kanban-bridge.mjs` | 2 M | Real code fixes (quiet skip for queue-less projects; `maxBuffer` + `HERMES_BIN` for `hermes kanban`) | Already upstream, byte-identical to `origin/main`. Nothing to preserve. |
| `agents/*/memory/{compost,medium-term,recent}.json` | 9 M | Memory consolidation: entries moved/trimmed | Subset of HEAD content (HEAD = origin/main still has the old entries). Patch kept here: `agent-memory-working-tree.patch`. |
| `agents/sdlc-developer/memory/long-term.json` | 1 M | 4 entries promoted into long-term: provider-health-probe-gaps, "unmonitored" health-check rule, systemd-env lesson, BACKLOG #29 unblock. NOT in `origin/main` long-term. | PRESERVED: `agent-memory-local-state/sdlc-developer/long-term.json` (full copy of all 4 agents' memory dirs also kept). |
| `agents/*/memory/core.json` | 4 M | Adds an empty `2026-W45` metrics bucket | Trivial; in patch and local-state copies. |
| `agents/versions/2026-10-08/`, `2026-11-03/` | 8 untracked | Snapshots of AGENT.md. All 8 are byte-identical to `agents/versions/2026-09-02/*` (tracked). | Duplicates, no new information. Not committed (in backup tgz). |
| `tasks/queue/*.json` (146 deleted) -> `tasks/completed/*.json` (146 untracked) | 146 D + 1 ?? | `queue-drainer.mjs archive` moves finished tasks. 144 are identical to the copy still tracked in `origin/main` `tasks/queue/`. | The 2 that differ from origin are preserved in `tasks-completed-divergent/` (OS-curriculum-v2-conformance-130: status completed + claim data; -63: claimed 2026-11-12). All 146 ids in `tasks-completed-ids.txt`; originals in backup. |
| `tasks/queue/` 43 remaining | 43 | Local copies of queue tasks, some stale vs origin (upstream edited statuses since HEAD) | Superseded by `origin/main`. Not preserved separately. |
| `agents/secrets.mjs` | 1 ?? root-owned | VaultWarden credential resolver (`resolveSecret`, `resolveSecrets`, `main`); no hardcoded key-like strings found. Written by a root-run drain on 2026-11-11 from unmerged drain branch `agent/drain/OS-curriculum-v2-conformance-130` (commit 7dc50b9); local variant differs from the branch. | NOT committed (credential-adjacent). Left in place in the live tree. Copy in backup (mode 0400). |

## Root-cause notes
- `tasks/queue` is tracked but `tasks/completed` is not and not ignored, so every `archive` run shows as 146 deletions + 1 untracked dir.
- Agent memory is tracked and rewritten by the drain/memory-manager inside the live checkout, so the tree is permanently dirty and blocks `git pull --ff-only`.
- Drains write directly in the live checkout (Docker/root writers also produce root-owned files).
