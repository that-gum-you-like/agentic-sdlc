# Specs — memory-evolution

**Date**: 2026-11-03
**Author**: Claude with Bryce
**Status**: specs

Covers `agents/templates/core.json.template`, `agents/memory-manager.mjs`, `agents/pattern-hunt.mjs teachAgents`,
`agents/version-snapshot.mjs`, `agents/worker.mjs`, `agents/templates/AGENT.md.template`, `framework/agent-lifecycle.md`. Prefix `MEM`. All hermes lane.
Human-to-human learning stays the product rule elsewhere; this is agent-framework memory only.

---

## CV-REQ-070 — Optional character block

**Gaps:** D6-01 | **Curriculum:** w6-agent-memory-evolution.md "Creating Rich Character Sheets"

**Statement:** `core.json.template` shall accept an optional `character` object (`personality`, `communicationStyle`, `quirks[]`, `relationships[]`, `inTheirOwnWords`, `growthJourney[]`); `worker.mjs` and `memory-manager.mjs recall` shall render it when present and emit nothing when absent.

**Acceptance:** exported `renderCharacter(core)` returns `''` for no character; recall output stays within its token budget (character capped at 400 characters); `agents/templates/character-sheet.md` documents each field.

**Scenarios:** WHEN `core.json` lacks `character` THEN recall output is byte-identical to today.

**Complexity:** M | **Value:** LOW | **Dependencies:** none

---

## CV-REQ-071 — Failures carry feeling, impact and what changes

**Gaps:** D6-03 | **Curriculum:** w6-agent-memory-evolution-full.md "Teaching with Emotion", Exercise 6.3

**Statement:** The failure schema shall accept optional `feeling`, `impact`, `whatIDoNow`; `recall` shall render them; `teachAgents` shall fill them deterministically (feeling from severity, impact from recurrence count, `whatIDoNow` from `ruleAdded`).

**Acceptance:** old failures without the fields render exactly as before; mapping critical=embarrassed, major=frustrated, minor=mildly annoyed.

**Scenarios:** WHEN a critical pattern recurs 3 times THEN the taught failure has `feeling: "embarrassed"` and `impact` mentioning 3 occurrences.

**Complexity:** S | **Value:** LOW | **Dependencies:** none

---

## CV-REQ-072 — Memory is snapshotted and every write is audited

**Gaps:** D6-05 | **Curriculum:** w6-agent-memory-evolution-full.md "Audit Logging"; 00-syllabus.md "Versioning"

**Statement:** `version-snapshot.mjs snapshot` shall also copy each agent's `memory/*.json` to `agents/versions/<date>/memory/<agent>/`; `restore <date> --memory` shall put them back; `memory-manager.mjs saveMemory` shall append `{ts,agent,layer,bytesBefore,bytesAfter,sha256}` to `pm/memory-audit.jsonl`.

**Acceptance:** audit write failure never fails the memory write; restore refuses a date with no memory snapshot; AGENT.md snapshot behaviour unchanged.

**Scenarios:** WHEN a memory file is corrupted and `restore <date> --memory` runs THEN the file equals the snapshot copy.

**Complexity:** M | **Value:** MEDIUM | **Dependencies:** none

---

## CV-REQ-073 — Lessons spread across agents in the same domain

**Gaps:** D6-06 | **Curriculum:** w6-agent-memory-evolution-full.md "Cross-Agent Learning"

**Statement:** `teachAgents` shall additionally record a `long-term` entry, tagged `learnedFrom: <agent>`, on every other agent that shares at least one domain with the responsible agent in `agents/domains.json`.

**Acceptance:** idempotent per (pattern category, agent); agents with no shared domain receive nothing; dry-run writes nothing.

**Scenarios:** WHEN agent A is taught pattern P and agent B shares A's domain THEN B has one `learnedFrom: A` entry, and a second run adds none.

**Complexity:** S | **Value:** LOW | **Dependencies:** none

---

## CV-REQ-074 — AGENT.md carries its own version history

**Gaps:** D6-07 | **Curriculum:** 00-syllabus.md "Agent Versioning"; w6 "Evolving Agent Capabilities"

**Statement:** `AGENT.md.template` shall contain `## Version History` and `## Breaking Changes`; `version-snapshot.mjs snapshot` shall append `- <date>: changed (+N/-M lines)` under Version History in each changed agent's AGENT.md when that section exists.

**Acceptance:** idempotent per date; agents without the section are skipped, not edited; the line count is diff-based against the previous snapshot copy.

**Scenarios:** WHEN a snapshot runs and an AGENT.md changed since the last one THEN exactly one dated line is appended.

**Complexity:** S | **Value:** LOW | **Dependencies:** CV-REQ-072

---

## CV-REQ-075 — New-agent proposal template

**Gaps:** D6-08 | **Curriculum:** w6-agent-memory-evolution.md "Recognizing When to Create New Agents"

**Statement:** `agents/templates/agent-proposal.md` shall define observed pattern, proposed agent, evidence (task ids), trial period and exit criterion; `framework/agent-lifecycle.md` shall link to it.

**Acceptance:** all five headings present; the link resolves.

**Scenarios:** WHEN someone proposes an agent THEN the template's five headings are the checklist.

**Complexity:** S | **Value:** LOW | **Dependencies:** none
