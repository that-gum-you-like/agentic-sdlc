# Design: spec-kit-cross-feature-analysis

**Date**: 2026-05-27
**Status**: design

---

## Context

Spec Kit's cross-feature analyzer reads all per-feature spec files in parallel and detects:
- Shared file mentions
- Conflicting invariants in adjacent specs
- Ordering dependencies that aren't declared

Borrowing only the first capability (shared-file detection) is the 80/20 win. Conflicting-invariant detection requires LLM judgment — defer.

OpenSpec's per-change folder structure (proposal/design/tasks/specs) is well-suited to this analysis. Every file mention is grep-able.

---

## Goals

- A report at `pm/cross-feature-report.md` flagging any two active changes that touch the same files or same capability
- New `openspec-cross-feature` skill for on-demand runs
- Zero new dependencies
- Output is concrete: "changes A and B both touch `agents/memory-manager.mjs` — review before merging"

## Non-Goals

- Auto-resolving conflicts
- LLM-based invariant analysis (deferred)
- Cross-repo analysis

---

## Design

### Extraction

```javascript
// agents/cross-feature-analyze.mjs
import { readdir, readFile } from 'node:fs/promises';

async function extractTouchedFiles(changeDir) {
  const sources = ['proposal.md', 'design.md', 'tasks.md'];
  const touched = new Set();
  for (const src of sources) {
    const text = await readFile(`${changeDir}/${src}`, 'utf8').catch(() => '');
    // Match: agents/foo.mjs, .cursor/rules/bar.mdc, docs/baz.md, etc.
    for (const m of text.matchAll(/(?:^|\s|`)([\w.-]+\/[\w./-]+\.(mjs|md|json|sh|mdc|ts|tsx|js))(?=`|\s|$)/gm)) {
      touched.add(m[1]);
    }
  }
  return [...touched];
}
```

### Conflict detection

For every pair of active changes, intersect their touched-file sets. Non-empty intersection = potential conflict.

Also intersect "capabilities touched" — extract from `specs/*.md` filenames (each is a capability name).

### Report format

```markdown
# Cross-Feature Report (generated 2026-05-27 14:00)

## High-severity (same file, both MODIFIED)

- **change-A** ↔ **change-B**: both modify `agents/memory-manager.mjs`
  - change-A: introduces async write path
  - change-B: assumes synchronous reads
  - Action: align before either merges

## Medium-severity (same capability, different changes)

- **change-C** ↔ **change-D**: both touch capability `memory-tiers`

## Low-severity (shared file but additive)

- ...
```

### Skill integration

`.claude/skills/openspec-cross-feature/SKILL.md` — invokes `agents/cross-feature-analyze.mjs`, opens the report.

### Optional: gate at proposal time

After `openspec-new-change` writes a new proposal, run the analyzer and warn if the new change conflicts with an active one.
