# The Interaction Doctrine — manual is the floor, never the default

*A reference for `jony-ive-design`. Load when critiquing or designing any screen a person does work
on. The short form lives in `SKILL.md` § **The labour question** and is enough on its own; this file
is the long form, the evidence, and the review template.*

---

## The distinction, in the operator's words

Bryce Wadley, on `/clients/wadley-brothers/discovery/<id>`, 2026-09-14:

> "This is an old school form. There's quite a few areas on this site that are 'old school' and by
> that I mean — a human doing a lot of clicking and manual typing. For discovery, I will use this
> page, and i like that I can answer individual questions. But most often I will not go and click
> and manually type in each question. That is a huge manual labor and nothing a human would want to
> do. What I will do instead is upload a recording of the discovery session and use these questions
> as guides and maybe manually enter the occasional question. **Let's also have Johny AIves agent
> take note of this design distinction. We should always have the ability to do things manually but
> where a user can talk to an agent or talk out loud with their voice and the system process that,
> is a better more future-oriented user experience.**"

And on `/action-items`, the same day:

> "these pages need another review by johny aives under the new ui requirements and methodologies.
> they are messy and not efficient — fewest clicks. we will also be able to use the voice feature.
> ensure the pages are friendly for that."

The second half of the first note is the standing rule. It was addressed to this skill by name.

---

## Why this belongs in *this* methodology, and not in a style guide

The skill already says, in Phase 3, that in software the **material** is *"interaction, time,
attention, data, motion, the platform's native behaviors"*, and that honest form follows the honest
nature of the material. Speech is now part of that material. It transcribes reliably, it costs
fractions of a cent, and it is already wired into this estate.

So a screen that makes a person hand-type forty answers it could have heard is not merely
inconvenient. It is **dishonest about its medium** — it is designing in 2011's material while
standing in 2026's. That is a Phase 3 failure, which is why it is recorded here rather than in a
stylesheet or a lint rule.

It is also a **deference** failure, which is the skill's fifth belief. Labour the machine could have
taken is labour taken from the person, and the person does not experience it as a technical
limitation. They experience it as the product not respecting their afternoon.

---

## The doctrine, stated

1. **The manual path is always available.** Every state a spoken or agent path can reach, a person
   can reach by hand, on the same screen, with a keyboard and a pointer. This is unconditional. It
   does not weaken because the spoken path is faster, more accurate or more used.
2. **The manual path is not the default labour.** Where speaking can do the work, speaking is what
   the page leads with. The fields stay — in their real role, which is *guides*, and the occasional
   hand-entered exception.
3. **Fewest clicks to make the required update is the measure.** Counted, against a rendered page,
   twice: manual and spoken.
4. **Pages are voice-friendly at field level.** Not "there is a microphone somewhere on this screen"
   — every updatable unit is individually addressable, with a stable id and the label a person
   actually reads.
5. **A bulk path proposes; it never overwrites in silence.** A transcript is evidence, not authority.

The binding version, with acceptance criteria, is `openspec/specs/console-shell/spec.md`
§ *Interaction doctrine*, `IX-REQ-001` … `IX-REQ-008`. The mechanical check is
`docs/design/the-labour-test.md` (Q8–Q10, appended to the Page Test's seven).

---

## The two over-corrections, and how to recognise them

**Over-correction one: deleting the form.** "Voice covers it now." This is reduction as amputation —
the thing the skill's Phase 2 already warns about — and it is the more seductive of the two, because
it makes a screenshot look better and a scorecard look cleaner. It fails IX-REQ-001 outright.
Reduction is removing what obscures the essence. A hand-path is not obscuring anything; it is the
floor.

**Over-correction two: a microphone on everything.** A spoken affordance added to a Gate, a
Statement, or a one-button transition is decoration — the skill's own red flag *"decoration over
purpose"* wearing a modern costume. If the required update is one click, the page has already won.

Both over-corrections come from the same mistake: treating the doctrine as a component to install
rather than a question to answer. The question is *what does this page cost the person*, and it has
two right answers — "very little already" and "too much, and here is the cheaper path."

---

## Three red flags to add to the critique

- 🚩 **Manual labour as the default path.** The screen's cheapest route to its required update runs
  through repeated typing, and a bulk or spoken route exists — or could — and is not what the page
  leads with.
- 🚩 **Capability shipped and not surfaced.** The estate can already do the cheap thing somewhere
  else. This happened here: an upload-and-transcribe path was live at
  `/engagements/[id]/discovery` while `/clients/[slug]/discovery/[rid]` offered only the form.
  Nothing was broken; nothing pointed.
- 🚩 **Voice-friendly in prose only.** The documents say a page is ready for spoken updates and the
  page declares nothing a resolver can address. The claim is unsupported until a test can read it.

---

## Running the review

When asked to review an operator screen, report the Page Test's Q1–Q7 **and** the Labour Test's
Q8–Q10. The labour half of the report is three lines:

```
Required update   ____________________
Labour count      manual ___ clicks · ___ typed    spoken ___ clicks · ___ typed / —
Paths             spoken: ____________  manual: ____________ / REMOVED ← finding
```

A finding on Q10 is a **finding**, not a ticket. This doctrine states what a page owes once it
exists; it does not schedule the work, does not decide which verbs become speakable, and does not
order a roadmap. Those are changes with their own proposals.

---

## What this doctrine does not decide

- Which transcription service runs. That is settled, permanently: **Groq**
  (`lib/transcribe.ts`, `whisper-large-v3-turbo`). **Never OpenAI**, on ethical grounds that are not
  up for re-litigation in a design review.
- Which of the console's verbs the assistant can understand. That is the verb registry
  (`nels-os-voice-console`) and its risk classes.
- Whether an act should be made cheaper at all. Where the console has deliberately priced one act
  above its neighbour — *done* versus *skip*, kept as separate controls *"because making them the
  same control would make the second as cheap as the first"* — fewest clicks does not repeal it.
  Deliberate friction is a design decision, and this doctrine is not a licence to flatten it.
- Anything on a client surface. The portal and the public prototype are a different register, and
  `console-shell` already separates them.
