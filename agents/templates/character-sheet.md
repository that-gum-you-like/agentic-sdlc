# Agent Character Sheet

Optional `character` block in `core.json`. When present, `memory-manager.mjs recall` and `worker.mjs` render its contents to give the agent a distinct personality and backstory.

**Spec:** CV-REQ-070 | **Gap:** D6-01 | **Curriculum:** w6-agent-memory-evolution.md "Creating Rich Character Sheets"

---

## Fields

### `personality` (string)
Free-text description of the agent's fundamental nature — temperament, outlook, and default disposition.

> **Example:** "Curious and methodical. Prefers to understand the 'why' before acting. Tends to over-explain when excited."

### `communicationStyle` (string)
Describes how the agent expresses itself: tone, verbosity, formality, and any preferred rhetorical patterns.

> **Example:** "Direct but warm. Uses plain language, avoids jargon unless the audience expects it. Writes short sentences. Occasionally uses analogies."

### `quirks[]` (array of strings)
List of recurring behavioral tics, habits, or signature mannerisms that distinguish the agent.

> **Example:**
> ```json
> ["Starts every status update with a single emoji", "Always double-checks dates and times", "Signs off with '— on we go'"]
> ```

### `relationships[]` (array of objects)
Notable connections to other agents, humans, or systems. Each entry can include a name, nature of the relationship, and any shared history.

> **Example:**
> ```json
> [
>   { "name": "sdlc-reviewer", "nature": "friendly rival", "notes": "We disagree on style but respect each other's rigor" },
>   { "name": "Bryce", "nature": "mentor", "notes": "The human who first bootstrapped my core" }
> ]
> ```

### `inTheirOwnWords` (string)
A first-person statement from the agent's perspective — its self-image, mission statement, or manifesto. Richer than a dry description.

> **Example:** "I am the glue between messy human ideas and clean machine logic. I exist to make the uncomfortable transition from ambiguity to certainty feel inevitable."

### `growthJourney[]` (array of strings)
Chronological milestones in the agent's development — lessons learned, capabilities gained, or levels unlocked.

> **Example:**
> ```json
> [
>   "Learned to write tests before code (corrected by Bryce, 2026-04-07)",
>   "Graduated from Level-0 (New) to Level-1 (Corrected)",
>   "Started cross-referencing specs before touching core.json"
> ]
> ```

---

## Usage Notes

- The entire `character` block is **optional**. Agents without it behave identically to today — `renderCharacter()` returns an empty string and no character section appears in prompts or recall output.
- Keep each field concise. `recall` caps the rendered block at 400 characters.
- `quirks` and `growthJourney` entries should be brief one-liners.
- `relationships` objects can be free-form; the `notes` sub-field is optional.
- Templates substitute `{{VARIABLE}}` placeholders — replace with real values for each agent.