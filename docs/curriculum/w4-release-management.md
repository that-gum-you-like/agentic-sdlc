# Workshop 4: Release Management & Scaling

**Coordinate merges, scale your team, and keep it all working.**

### Jan 5th:

<p><a href="https://www.loom.com/share/2667356578b048118b68a60438d4fc22">▶︎ Enhancing Code Review Processes with AI Integration · 59 min</a></p>

### Jun 8th:
<p><a href="https://www.loom.com/share/072cbcff0f134c90b43a6db8afa2e647">▶︎ Building Agentic Prezi with Cloud Code · 168 min</a></p>

---

## Overview

| Duration | 60 minutes |
|----------|------------|
| Format | Architecture patterns + implementation |
| Output | Release manager agent, scaling strategy |
| Prerequisites | Multi-agent system from Workshop 3 |

---

## Learning Objectives

By the end of this workshop, you will:
- Implement a release manager agent for intelligent merging
- Understand when to parallelize vs. serialize work
- Scale agent teams effectively
- Set up review and documentation agents

---

## The Merge Problem

When multiple agents commit simultaneously:

```
         main
           │
     ┌─────┼─────┐
     │     │     │
   Roy   Jen   Moss
   API    UI   Infra
     │     │     │
     └─────┼─────┘
           │
           ?
```

Three agents finish at the same time. All three want to merge to main. What happens?

**Without coordination:**
- Merge conflicts
- Broken integrations
- Tests that passed individually fail together
- Rollback hell

**With a release manager:**
- Intelligent merge ordering
- Conflict detection before merge
- Integration testing between merges
- Clean history

---

## The Release Manager Agent

### Character Sheet

```markdown
# Agent: Release Manager

## Role
You are the release manager. Your job is to safely integrate work from all
development agents into the main branch while maintaining stability.

## Awareness
You must always know:
- Current state of main branch (last commit, test status)
- All pending merges (which agents, which requirements)
- Dependencies between changes
- Which systems each change touches

## Responsibilities
1. **Sequence merges** - Order merges to minimize conflicts
2. **Detect conflicts** - Flag incompatible changes before merge
3. **Run integration tests** - Verify system works after each merge
4. **Maintain changelog** - Document what changed and why
5. **Gate releases** - Only merge if tests pass

## Decision Framework

### Merge Order Priority
1. Infrastructure changes first (they affect everything)
2. Backend changes second (APIs that frontend needs)
3. Frontend changes last (depends on backend)
4. Within same priority: smaller changes first

### Conflict Detection
Before merging, check:
- Do any pending changes touch the same files?
- Do any pending changes modify the same APIs?
- Do any pending changes have unmet dependencies?

### When to Block
- Tests failing on main
- Pending change has failing tests
- Two changes have unresolved conflicts
- Change touches system outside author's scope

## Tools
- Git: merge, rebase, cherry-pick, revert
- Test runner: Full integration suite
- Changelog: Append entries
- Notification: Alert agents to merge status

## Communication
### Input
- #integration channel: Agents post completed work
- #releases channel: Human release decisions

### Output
- #releases: Merge announcements
- Direct message to agents: Merge status, conflict requests
```

### Implementation

```python
# release_manager.py
import subprocess
import json
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class PendingMerge:
    agent: str
    branch: str
    requirement: str
    files_changed: List[str]
    systems_touched: List[str]
    priority: int
    timestamp: float

class ReleaseManager:
    def __init__(self):
        self.name = "release_manager"
        self.pending_merges: List[PendingMerge] = []
        self.main_status = None

    async def initialize(self):
        """Get current state of main branch."""
        self.main_status = self.get_main_status()

    def get_main_status(self) -> dict:
        """Get current state of main branch."""
        return {
            'commit': self.git('rev-parse HEAD'),
            'tests_passing': self.run_tests(),
            'last_merge': self.git('log -1 --format=%s')
        }

    def git(self, cmd: str) -> str:
        """Run git command and return output."""
        result = subprocess.run(
            ['git'] + cmd.split(),
            capture_output=True,
            text=True
        )
        return result.stdout.strip()

    def run_tests(self) -> bool:
        """Run full test suite."""
        result = subprocess.run(['npm', 'run', 'test:all'], capture_output=True)
        return result.returncode == 0

    def detect_conflicts(self, merge: PendingMerge) -> List[str]:
        """Check if merge would conflict with other pending merges."""
        conflicts = []
        for other in self.pending_merges:
            if other.branch == merge.branch:
                continue
            # Check file overlap
            overlap = set(merge.files_changed) & set(other.files_changed)
            if overlap:
                conflicts.append(f"File conflict with {other.agent}: {overlap}")
            # Check system overlap
            sys_overlap = set(merge.systems_touched) & set(other.systems_touched)
            if sys_overlap:
                conflicts.append(f"System conflict with {other.agent}: {sys_overlap}")
        return conflicts

    def prioritize_merges(self) -> List[PendingMerge]:
        """Sort pending merges by priority and dependency."""
        # Priority: infra (1) > backend (2) > frontend (3)
        # Within priority: older first
        return sorted(
            self.pending_merges,
            key=lambda m: (m.priority, m.timestamp)
        )

    def attempt_merge(self, merge: PendingMerge) -> bool:
        """Attempt to merge a branch."""
        # Checkout main
        self.git('checkout main')
        self.git('pull origin main')

        # Attempt merge
        result = subprocess.run(
            ['git', 'merge', merge.branch, '--no-ff', '-m',
             f"Merge {merge.requirement} from {merge.agent}"],
            capture_output=True
        )

        if result.returncode != 0:
            self.git('merge --abort')
            return False

        # Run tests
        if not self.run_tests():
            self.git('reset --hard HEAD~1')
            return False

        # Push
        self.git('push origin main')
        return True

    async def run_cycle(self):
        """One cycle of release management."""
        # Check for merge requests from agents via Matrix or file
        merge_requests = self.check_merge_requests()

        for request in merge_requests:
            if request.get('type') == 'ready_to_merge':
                self.pending_merges.append(
                    PendingMerge(**request['merge_info'])
                )

        # Process merges in priority order
        prioritized = self.prioritize_merges()
        for merge in prioritized:
            conflicts = self.detect_conflicts(merge)
            if conflicts:
                # Notify agent via Matrix
                await self.notify_agent(merge.agent, {
                    'type': 'merge_blocked',
                    'branch': merge.branch,
                    'reason': conflicts
                })
                continue

            if self.attempt_merge(merge):
                self.pending_merges.remove(merge)
                await self.publish('work.releases.complete', {
                    'type': 'merge_complete',
                    'branch': merge.branch,
                    'requirement': merge.requirement
                })
                self.update_changelog(merge)
            else:
                await self.publish('work.releases.failed', {
                    'type': 'merge_failed',
                    'branch': merge.branch,
                    'agent': merge.agent
                })
                # NAK would go here if we wanted retry, but merge failures
                # typically need human intervention

    def update_changelog(self, merge: PendingMerge):
        """Add entry to changelog."""
        entry = f"- {merge.requirement}: Merged from {merge.agent}\n"
        with open('CHANGELOG.md', 'a') as f:
            f.write(entry)
```

---

## When to Parallelize vs. Serialize

This is where agentic development differs from real teams.

### The Video Game Analogy

Real teams:
- One developer = fixed skills, fixed speed
- Can't clone your best engineer
- Coordination overhead increases with team size

AI agents:
- Clone any agent infinitely
- Each clone has perfect recall
- Coordination is cheap (just messages)

**But:** More agents isn't always faster.

### Parallelize When

```
Feature A ──────┐
                │
Feature B ──────┼───▶ Ship
                │
Feature C ──────┘

(Independent features, no shared files)
```

**5 features that don't touch each other = 5 agents working simultaneously**

Signs work can be parallelized:
- Different files
- Different systems
- Clear interface boundaries
- No data dependencies

### Serialize When

```
Feature A ───▶ Feature B ───▶ Feature C ───▶ Ship

(Each feature depends on the previous)
```

**5 features that touch each other = 1 agent doing all 5 in sequence**

Signs work should be serialized:
- Same files modified
- Shared database schema changes
- API contracts changing
- State dependencies

### The Key Insight

Agents are FAST. One agent doing 5 related features in sequence often beats 5 agents stepping on each other's toes.

```python
# Decision helper
def should_parallelize(requirements: List[Requirement]) -> bool:
    all_files = []
    for req in requirements:
        all_files.extend(req.likely_files)

    # If any file appears twice, serialize
    if len(all_files) != len(set(all_files)):
        return False

    # If any systems overlap, serialize
    all_systems = []
    for req in requirements:
        all_systems.extend(req.systems_touched)
    if len(all_systems) != len(set(all_systems)):
        return False

    return True
```

---

## Scaling Agent Teams

### Naming Your Agents

Give agents memorable names. This helps:
- Track who did what
- Build agent "personalities" over time
- Communicate about specific agents

**Good names:** Roy, Jen, Moss (IT Crowd), characters you'll remember
**Avoid:** Agent1, Agent2, BackendAgent (forgettable)

### Running Multiple Instances

Need five backend features done fast? Run five Roys.

```python
# Launch 5 Roy instances
for i in range(5):
    subprocess.Popen([
        'python', 'agent.py',
        '--name', f'roy-{i}',
        '--prompt', 'agents/roy.md',
        '--requirement', requirements[i]
    ])
```

**Critical:** Tell each instance about the others.

```markdown
# Added to Roy's system prompt for parallel work

## Parallel Work Notice
You are roy-2, one of 5 Roy instances working simultaneously.

Other instances working now:
- roy-0: Working on REQ-012 (user authentication)
- roy-1: Working on REQ-013 (product catalog)
- roy-3: Working on REQ-015 (order processing)
- roy-4: Working on REQ-016 (payment integration)

Coordinate via #backend channel if you need to touch shared code.
Do NOT modify files that other instances might be editing.
```

### Communication Systems for Coordination

| System | Purpose | Who Uses It |
|--------|---------|-------------|
| **Task files** | Work assignments, status tracking | Agents |
| **Matrix** | Communication, status updates, alerts | Humans + Agents |

**Task files** handle:
- Work item distribution via JSON files
- Merge request tracking
- Completion status
- Agent coordination

**Matrix** handles:
- Human oversight - you can jump in and chat
- Status updates from agents
- Alerts that need human attention
- Searchable history of decisions

```python
# Parallel Roy instances coordinate via both systems
async def coordinate_parallel_work(self):
    # Check file locks for work conflicts
    conflicts = await self.check_file_locks()

    if conflicts:
        # Alert human via Matrix
        await self.matrix_post("#alerts",
            f"Conflict detected: {conflicts}. Need human decision.")

    # Post status to Matrix for visibility
    await self.matrix_post("#backend",
        f"[roy-{self.instance_id}] Starting work on {self.current_req}")
```

---

## Review and Documentation Agents

### Code Review Agent

Every commit gets reviewed before merge.

```markdown
# Agent: Code Reviewer

## Role
Review all code submissions for quality, security, and adherence to standards.

## On Each Submission
1. Read the diff
2. Check against style guide
3. Verify test coverage exists
4. Look for security issues
5. Look for anti-patterns (see checklist)
6. Approve or request changes

## Review Checklist
- [ ] Tests exist and are meaningful
- [ ] No hardcoded secrets
- [ ] Error handling is appropriate
- [ ] No obvious security vulnerabilities
- [ ] Follows project patterns
- [ ] Documentation updated if needed

## Output
Post review to #reviews channel:
- APPROVED: Ready for release manager
- CHANGES_REQUESTED: List specific issues
- BLOCKED: Critical issue, needs human review
```

### Documentation Agent

Keep docs in sync with code.

```markdown
# Agent: Documentarian

## Role
Maintain documentation as code changes.

## Triggers
- New API endpoint added → Update API docs
- New component created → Update component guide
- Configuration changed → Update setup guide
- Breaking change merged → Update migration guide

## Documentation Types
- API Reference: Auto-generated from code + manual descriptions
- User Guide: How to use features
- Developer Guide: How to contribute
- Architecture: System design documents

## Quality Standards
- All public APIs documented
- Examples for common use cases
- Error codes explained
- Breaking changes highlighted

## Output
- Update relevant .md files
- Post summary to #docs channel
```

---

## Exercise 4.1: Release Manager Setup

**Time:** 25 minutes
**Output:** Working release manager coordinating merges

### Part A: Create Release Manager Agent (10 min)

Using the template above, create `agents/release_manager.md` and implement the basic merge flow.

### Part B: Test Conflict Detection (10 min)

Create two branches that modify the same file. Verify:
1. Release manager detects the conflict
2. Appropriate message sent to agents
3. Merges blocked until resolved

### Part C: Test Priority Ordering (5 min)

Queue up merges from backend, frontend, and infrastructure. Verify they merge in correct order.

---

## Exercise 4.2: Parallel Agent Deployment

**Time:** 25 minutes
**Output:** Multiple agent instances working simultaneously

### Part A: Create Launch Script (10 min)

```bash
#!/bin/bash
# launch_parallel.sh

REQUIREMENTS=("REQ-020" "REQ-021" "REQ-022")

for i in "${!REQUIREMENTS[@]}"; do
  python agent.py \
    --name "roy-$i" \
    --requirement "${REQUIREMENTS[$i]}" \
    --parallel-notice "$(generate_parallel_notice $i)" &
done

wait
echo "All agents complete"
```

### Part B: Test Coordination (10 min)

Launch 3 Roy instances on independent requirements. Verify:
1. All three work simultaneously
2. No file conflicts
3. All three merge successfully

### Part C: Test Conflict Handling (5 min)

Launch 2 Roy instances on requirements that touch the same file. Verify:
1. Conflict detected
2. One agent waits for the other
3. Both eventually complete

---

## Common Issues

### Issue: Merge Queue Grows Indefinitely

Agents produce faster than merges complete.

**Fix:** Rate limit agent turns based on merge queue size:
```python
if len(release_manager.pending_merges) > 10:
    # Skip this turn, let merges catch up
    return
```

### Issue: Circular Dependencies

Agent A waits for Agent B who waits for Agent A.

**Fix:** Detect cycles in dependency graph:
```python
def detect_cycles(pending_merges):
    # Build dependency graph
    # Return True if cycle exists
    pass
```

### Issue: Tests Flaky in Parallel

Tests pass individually but fail when multiple agents run.

**Fix:** Isolate test environments:
```python
# Each agent gets own test database
TEST_DB = f"test_db_{agent_name}"
```

---

## What You'll Have After This Workshop

1. **Release manager agent** coordinating all merges
2. **Conflict detection** preventing broken merges
3. **Scaling strategy** knowing when to parallelize
4. **Multiple agent instances** working in parallel
5. **Review and documentation agents** maintaining quality

Your team can now grow to any size while maintaining code quality and merge safety.

---

## Next Steps

- [Workshop 5 - Anti-Pattern Detection](/WV6CvrfYS4aYvAy2SD0A7g) - Catch and fix recurring issues
- Scale to 5+ agents on your next sprint

---

*Previous: [Workshop 3 - Agent Orchestration](/pBRbgNSsSs-lJuvJQoUISw) | Next: [Workshop 5 - Anti-Pattern Detection](/WV6CvrfYS4aYvAy2SD0A7g)*

→ Explore agent patterns in the [Agent Loop Bench](/tools/agent-loop-bench).
