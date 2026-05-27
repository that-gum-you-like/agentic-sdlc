---
name: openspec-cross-feature
description: Detect shared-file and shared-capability conflicts across all active OpenSpec changes. Use when the user asks about cross-feature interactions, "do any of my changes conflict", backlog triage, or "what's safe to ship in parallel".
license: MIT
compatibility: Requires Node 18+. No npm dependencies.
metadata:
  author: agentic-sdlc
  version: "1.0"
---

Run the cross-feature analyzer against the project's OpenSpec corpus, then surface the report.

**Input**: None required. Optional: a specific change name the user wants to focus on (filter the report after generation).

**Steps**

1. **Run the analyzer**

   ```bash
   node ~/agentic-sdlc/agents/cross-feature-analyze.mjs
   ```

   This scans every directory under `openspec/changes/` (excluding `archive/`), extracts file mentions from `proposal.md` / `design.md` / `tasks.md`, extracts capability names from `specs/*.md`, and writes a report to `pm/cross-feature-report.md`.

2. **Read the report**

   ```bash
   cat pm/cross-feature-report.md
   ```

   The report has three sections:
   - **High-severity**: two changes touch the same source/config file (`.mjs`, `.json`, `.sh`, `.mdc`, `.ts`, etc.) — real risk of conflicting edits or semantic divergence.
   - **Medium-severity**: two changes touch the same capability (same spec filename) — semantics may conflict even without file overlap.
   - **Low-severity**: two changes touch the same markdown/doc — typically additive but worth a glance for ordering.

3. **Surface findings to the user**

   Lead with the high-severity count. For each high-severity pair, list the conflicting files and a one-sentence "what could go wrong" note. Don't dump the whole report unless the user asks — pick the top 3-5 highest-value flags.

4. **Known characteristics** (mention if the user asks why a flag seems wrong)

   - The file-mention regex captures any path that looks like a file (including paths in `node ~/agentic-sdlc/agents/foo.mjs` CLI examples). This produces some false positives where the change merely *references* a file rather than *modifying* it. The intent: surface candidates for human review, not auto-block merges.
   - Capability detection uses spec filename only — does not parse REQ-xxx semantics yet.
   - Cross-repo analysis is out of scope (single-repo only).

5. **Optional next steps**

   - If the user wants to act on a flag: ask which pair to dig into; read both changes' `design.md` / `tasks.md` side-by-side and report concrete conflict points.
   - If the user wants to triage the whole backlog: group flags by change-name frequency — the changes that appear in many flags are the biggest "merge contention" risks.

**Output**: A focused summary highlighting the top flags. The full report is at `pm/cross-feature-report.md` for the user to read directly.
