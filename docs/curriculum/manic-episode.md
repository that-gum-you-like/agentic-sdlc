# Handling A Project-Driven Manic Episode

**Or: How to avoid the colon blowout**

---

## The Diarrhea Phase

Look, I'm going to be crude here because this is important: The experience most people have when AI suddenly unblocks their execution capability is what I call "diarrhea."

Here's what happens:

You're a senior developer (or even a junior one with big ideas). You've got a million projects you've always wanted to build but never had time to do. Then you learn agents. Suddenly, you CAN build them. All of them. Right now. At once.

It's like someone removed a blockage, and everything comes rushing out.

This is an intense experience. Sometimes overwhelming. People fall into manic energy because suddenly you can execute on years of backlogged ideas in weeks.

**But listen to me carefully:**

**You still have to eat and sleep every day.**

**You still have to spend time with your loved ones.**

I'm saying this bluntly because I've seen it happen multiple times. The excitement is real. The capability is real. The danger of burning out is also very real.

---

## If You're Prone to Project-Driven Mania

Some people know themselves well enough to recognize they go through project-driven manic episodes. If that's you, **prepare your loved ones now.**

Have the conversation:

> "Hey, I just learned a new skill and my teacher said to notify you that sometimes it can trigger a manic episode because I can suddenly build a lot faster with this AI agent system. If you notice me coding at 3am for the fifth night in a row, please check on me."

Watch for signs of constant mania:
- Skipping meals regularly
- Sleep schedule disintegrating
- Neglecting relationships
- "One more feature" at 2am, 3am, 4am
- Inability to stop thinking about the project
- Ignoring physical discomfort (sore wrists, back pain, eye strain)
- Defaulting to "I'll sleep when it's done" (spoiler: it's never done)

---

## Set Limits. No, Really. Set Them.

"But I could just sign up for a second Claude Pro account..."

Stop.

Set yourself a token limit and a budget. Here's why:

1. **Financial guardrails prevent executive dysfunction**: When you're in hyperfocus mode, rational spending decisions go out the window.
2. **Limits force prioritization**: If you only have $X to spend this month, you'll think harder about what actually matters.
3. **Scarcity creates focus**: Infinite tokens means infinite rabbit holes.

### Recommended Setup: Privacy.com Virtual Cards

Create a merchant-locked card specifically for Claude/OpenAI/Anthropic:
- Set a monthly spending limit (e.g., $200/month)
- Card auto-declines when you hit the limit
- No way to override it at 3am when you're in a manic coding state
- You can't "just quickly add more" in the moment

Or use your bank's spending category caps if they offer them.

**The goal is to make it impossible for Manic You to override the budget Rational You set.**

I've seen people spend $800+ in a month on tokens during a manic episode. Don't be that person.

---

## Capture Ideas, Don't Execute Them

Here's the thing about the overflow state: Your brain is generating ideas faster than you can build them. That's good! But executing on every idea the moment it arrives is how you end up in the "one more thing" death spiral.

**The solution: Capture, don't execute.**

### Never "One More Thing" - Add It to the Roadmap

When you're coding and suddenly think "oh, I should also add dark mode!" or "what if we had real-time notifications?" - **don't do it right now.**

Add it to the roadmap.

The roadmap is your backlog. The roadmap is your queue. The roadmap is the single source of truth for what needs to happen.

**Not:**
- "Let me just quickly add this feature..."
- "This will only take 10 minutes..."
- "I'll forget if I don't do it now..."

**Instead:**
- Open your roadmap file
- Add: `REQ-XXX: Dark mode toggle in settings`
- Close the roadmap file
- **Keep working on what you were already doing**

The idea is captured. It's not lost. It will be prioritized. But it's not hijacking your current focus.

### The Project Manager Agent: Your Discipline System

Here's the real game-changer: **Have an agent whose job is to manage your backlog.**

When you're overflowing with ideas, talk to your Project Manager Agent instead of executing on the ideas directly.

**The three agents you need:**
1. **Project Manager Agent** - Prioritizes work, manages roadmaps
2. **Business Analyst Agent** - Evaluates ideas for value and feasibility
3. **Product Manager Agent** - Shapes features and user stories

All your great ideas get:
- **Captured** (so you don't forget)
- **Evaluated** (so you know what matters)
- **Prioritized** (so you work on the right things)

**Example conversation:**
```
You: "I just thought of 5 new features I want to add."

Project Manager Agent: "Great! Let's capture them first. Tell me about each one."

You: [Lists features]

PM Agent: "I've added them to the roadmap as REQ-047 through REQ-051.
Based on your current sprint goals, REQ-049 has high alignment but
REQ-047 and REQ-048 should wait until Phase 3. Would you like me to
re-prioritize your current work, or should we table these for the
next planning session?"

You: "Table them for next planning."

PM Agent: "Done. Your current focus remains REQ-023. Estimated 2 hours
remaining on this requirement."
```

**See what happened there?**
- Ideas captured ✓
- Evaluated against current goals ✓
- Prioritized ✓
- You stayed focused on current work ✓

### Why In-Repo Roadmaps, Not GitHub Issues

You might be thinking: "Why not just use GitHub Issues? Or GitHub Projects?"

**Short answer:** Issues are too easy to poison.

**Long answer:**
- GitHub Issues are great for public collaboration
- But they're also a surface area for noise
- Comments pile up, context gets muddled
- Agents can get confused by conflicting information in threads
- External contributors can derail your agent team's focus

**GitHub Projects and PRs are fine.** But for your backlog - the thing your agents work from - keep it in the repo as a structured roadmap file.

**Benefits of in-repo roadmaps:**
1. **Agents can read them directly** - They're just markdown files
2. **Version controlled** - You can see how priorities changed over time
3. **You control the signal** - No comment threads to parse
4. **Structured format** - Agents know exactly where to find requirements
5. **Interactable** - Agents can update status, mark things complete

If you interact with your work queues **only through a Project Manager Agent**, you get better discipline. The agent enforces the process. The agent keeps you from "just one more thing."

### Setting Up Your PM Agent

**Agent definitions and examples:**
[AI Agent Personas Directory](https://gist.github.com/lizTheDeveloper/e35939b321daaab4763aa8e8a639ffda)

**Basic setup:**
1. Create a `.claude/agents/` directory in your repo
2. Add `project-manager.md`, `business-analyst.md`, `product-manager.md`
3. Define their responsibilities and how they interact with your roadmap
4. When ideas strike, open a chat with the PM agent instead of your dev agent

**The PM agent's job:**
- Capture new ideas as requirements
- Evaluate them with the BA agent
- Prioritize them in the roadmap
- Keep you focused on current work
- Tell you "no" when you try to do "just one more thing"

**The discipline loop:**
1. Idea arrives → Talk to PM agent
2. PM agent captures it → Adds to roadmap
3. PM agent evaluates it → Assigns priority
4. PM agent tells you → "Keep working on REQ-023, we'll review new ideas in planning"
5. You keep working → On the thing you're supposed to be working on

### Your Roadmap as Your Anchor

When you feel the "one more thing" urge:
1. Check the roadmap
2. See what you're supposed to be working on
3. See what's next in priority
4. Add your new idea to the backlog
5. **Get back to work**

The roadmap becomes your anchor. Your grounding point. Your external brain that remembers everything so you don't have to.

And when you start to spiral into "I could build all of this tonight," the PM agent is there to say:

> "That's 23 requirements totaling approximately 40 hours of work. You've been coding for 6 hours today. Let's finish REQ-023, commit it, and revisit this list tomorrow after you've slept and eaten."

**That's the discipline you need.**

---

## Grounding Techniques for Hyperfocus Burnout

When you notice yourself slipping into unsustainable patterns, use these techniques to pull yourself back:

### The 5-4-3-2-1 Technique

When you realize you've been coding for 6 hours straight:

1. **Name 5 things you can see** around you (not on your screen)
2. **Name 4 things you can touch** (your desk, your chair, the floor)
3. **Name 3 things you can hear** (traffic, HVAC, birds)
4. **Name 2 things you can smell** (coffee, outside air)
5. **Name 1 thing you can taste** (when's the last time you drank water?)

This forces your brain to exit hyperfocus and reconnect with your physical environment.

### Breathing Reset

Sit back from the keyboard.
Close your eyes.
Count 4 seconds breathing in.
Hold for 4 seconds.
Count 4 seconds breathing out.
Hold for 4 seconds.
Repeat 4 times.

Your nervous system will thank you.

### Body Scan Check-In

Starting at your head, mentally scan downward:
- Is your jaw clenched?
- Are your shoulders up by your ears?
- Is your back hunched?
- Are your wrists aching?
- When did you last move your legs?

If the answer to any of these is "uh oh," take a break. Stand up. Stretch. Walk.

### The Cold Shock

Go outside if you can. If it's cold, feel the cold.
Or: Run cold water over your wrists for 30 seconds.
Or: Hold an ice cube.

Temperature shock breaks hyperfocus loops. Some people in the bipolar community swear by the cold shower technique—start warm, slowly go colder until you feel "awakened."

### Set Timers (And Actually Respect Them)

- **Pomodoro timers**: 25 min work, 5 min break
- **Meeting with yourself**: Block "1:1 with me" on your calendar to eat lunch
- **Hard stops**: "I will stop coding at 10pm no matter what"
- **Context switch alarms**: Every 90 minutes, alarm goes off, you stand up

The timer doesn't care if you're "almost done." That's the point.

---

## The "One More Thing" Loop

This is the trap:

"I'll just fix this one bug..."
→ Bug reveals another issue
→ That issue needs refactoring
→ Refactoring breaks tests
→ Tests need updating
→ While updating tests, you notice another optimization
→ It's 4am and you haven't eaten since noon

**Sound familiar?**

### Breaking the Loop

**Use the 5-minute rule:**
Before starting "just one more thing," set a 5-minute timer and ask:
- Have I eaten in the last 4 hours?
- Have I had water in the last 2 hours?
- What time is it actually?
- Is this an emergency or does it feel like one because I'm in flow?
- Will this matter tomorrow if I stop now?

If the answer is "it can wait," close the laptop. Literally close it.

**Use Git as a stopping point:**
Make commits your break triggers. After every commit, stand up and walk away for 5 minutes minimum. The code will be there when you get back.

---

## Physical Health Basics (That You're Probably Ignoring)

### You Actually Need to Eat

Not coffee. Not energy drinks. Food.

Set phone alarms:
- **12:00pm - LUNCH**
- **6:00pm - DINNER**
- **9:00pm - SNACK IF YOU FORGOT DINNER**

Keep easy food nearby:
- Protein bars
- Nuts
- Pre-cut fruit
- Anything you can eat without stopping work (not ideal, but better than nothing)

### You Actually Need to Sleep

"I'll just finish this phase" is a lie you tell yourself.

The phase will still be there tomorrow. You, however, will be worse at debugging if you're running on 4 hours of sleep.

Studies show that after 24 hours without sleep, your cognitive function is equivalent to being drunk. You wouldn't debug drunk. Don't debug sleep-deprived.

**Sleep hygiene for hyperfocus coders:**
- Set a bedtime alarm (1 hour before you want to sleep)
- When it goes off, commit your code and close the laptop
- No "let me just check the logs"
- Put your laptop in another room if you have to

### You Actually Need to Move

Sitting for 8+ hours straight will destroy your body.

Every 90 minutes:
- Stand up
- Walk around your space
- Touch your toes
- Roll your shoulders
- Look at something far away (eye strain is real)

Yes, this interrupts flow. That's okay. Flow at the cost of your spine is a bad trade.

---

## Warning Signs You're Overdoing It

Your body will tell you. Listen to it:

- **Typing hurts** → RSI is starting, stop immediately
- **Eyes burning** → Screen time break, look outside for 5 minutes
- **Headache** → Dehydrated, hungry, or both
- **Can't focus anymore** → Brain is tired, rest
- **Making stupid mistakes** → Cognitive fatigue, walk away
- **Irritable/snappy** → Hunger, fatigue, or overstimulation
- **Heart racing** → Too much caffeine or stress response
- **Insomnia** → Brain won't shut down from overstimulation

If you hit 3+ of these, you're in burnout territory. Stop coding. Go do something else.

---

## The Sustainable Pace

Here's the thing: Agents give you 10x velocity. That doesn't mean you should work 10x longer.

It means you can:
- Build in 2 hours what used to take 20 hours
- Then **stop and do something else with your life**

The goal isn't to fill all your time with more work. The goal is to reclaim your time.

**Sustainable agent-assisted development looks like:**
- 2-4 hour focused work blocks
- Clear stopping points
- Breaks between phases
- Time away from the screen
- Room for life outside of code

**Unsustainable agent-assisted development looks like:**
- 12-hour coding marathons
- "I'll sleep when the sprint is done"
- Ignoring hunger/thirst/fatigue
- Every thought is about the project
- Relationships suffering
- Physical pain from sitting too long

One of these builds great software. The other builds great software and then burns you out so hard you can't look at code for a month.

---

## Strategies from the ADHD/Hyperfocus Community

People who live with ADHD have been managing hyperfocus for years. Here's what works for them:

### End-of-Day Reflection
Keep a log of how much time you spent in hyperfocus today. If you see multiple 8+ hour days in a row, schedule rest days.

### Iterative Development
Don't code a massive feature without compiling/testing. Break it into chunks. Compile. Test. Break. Repeat.

This gives you natural stopping points and prevents the "I wrote 3000 lines and none of it works" despair.

### Include Routine Tasks
Alternate challenging work with easy wins:
- Write a hard feature → Then clean up comments
- Debug complex issue → Then update variable names
- Refactor architecture → Then write documentation

Small completions release dopamine, which helps you feel satisfied enough to stop.

### External Accountability
Tell someone what you're doing and when you'll check in:
- "I'm coding until 8pm, text me then to make sure I stopped"
- Join a coding stream where people take breaks together
- Work sessions with friends where you all stop at the same time

It's easier to stop when someone else is watching.

### Mindful Transitions
Create rituals for ending hyperfocus:
- Close laptop → Stretch → Drink water → Walk around → Then decide if you're really done
- Don't just snap the laptop shut and immediately do the next thing
- Give your brain time to shift gears

### Most Importantly: Don't Beat Yourself Up

If you lose track of time and code for 10 hours straight, berating yourself won't help you start the next task.

Acknowledge it: "I got caught in hyperfocus again."
Learn from it: "What sign did I miss that I could catch next time?"
Move on: "Tomorrow I'll set a timer."

---

## This Is Not a Substitute for Professional Help

These strategies are **tools to complement treatment, not replace it.**

If you have bipolar disorder, ADHD, or any condition that affects your focus and energy regulation, keep working with your mental health providers.

Agents are powerful tools. They can also trigger manic episodes if you're prone to them. That's not a reason to avoid agents—it's a reason to have a plan.

**Talk to your therapist about:**
- How to recognize when excitement becomes mania
- What boundaries to set before starting high-stimulation projects
- Who to notify if you notice yourself spiraling
- What to do if you can't stop working

These grounding techniques let you delay processing an emotion until a more practical time—like your next therapy session. They don't fix underlying conditions.

---

## Remember

**You are not your productivity.**

Agents let you build faster. That's exciting. It should be exciting.

But you are still a human who needs food, sleep, movement, and connection.

The projects will be there tomorrow.
The agents will be there tomorrow.
**You need to be there tomorrow too.**

Take care of yourself. Set your limits now, before Manic You tries to override them.

And if you catch yourself thinking "I'll just sign up for another account to get around the limit..."

No. That's the diarrhea talking. Close the laptop. Go outside. Touch grass.

The code will still be there when you get back.

---

## Sources & Further Reading

**Grounding Techniques:**
- [How to Stop a Manic Episode Immediately - Talkspace](https://www.talkspace.com/mental-health/conditions/articles/how-to-stop-a-manic-episode-immediately/)
- [16 Grounding Exercises for Bipolar Disorder - The Mighty](https://themighty.com/topic/bipolar-disorder/16-grounding-exercises-for-people-living-with-bipolar-disorder/)
- [Coping Skills for Bipolar Disorder - Modern Recovery Services](https://modernrecoveryservices.com/wellness/coping/conditions/bipolar-disorder/)
- [Grounding Techniques - Medical News Today](https://www.medicalnewstoday.com/articles/grounding-techniques)

**Hyperfocus & Burnout:**
- [Between Hyper-focus and Burnout: Developing with ADHD - Stack Overflow](https://stackoverflow.blog/2024/05/10/between-hyper-focus-and-burnout-developing-with-adhd/)
- [The Neuroscience of Hyperfocus - ADHDer](https://www.adhder.net/p/the-neuroscience-of-hyperfocus-harnessing)
- [Coding and ADHD - Can't Stop - DEV Community](https://dev.to/abbeyperini/coding-and-adhd-cant-stop-10mf)
- [Preventing Burnout for Programmers - Medium](https://medium.com/@karolisram/preventing-burnout-for-programmers-12b4968adbaa)

---

*Next: Get back to [Workshop 1 - Planning and Requirements](/PFPDFBFgQXmDJBBtZPjo5Q) (after you've eaten something)*
