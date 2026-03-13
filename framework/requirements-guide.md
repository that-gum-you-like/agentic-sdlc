# Requirements Guide

How to write good requirements for the agentic SDLC. This guide ensures agents receive clear, testable, appropriately-scoped work items.

## The Core Rule

A requirement is good if you can definitively say "yes, this is done" or "no, this isn't done yet."

- **Bad:** "The app should be fast"
- **Good:** "The system shall respond to API requests within 200ms for 95th percentile"

## The Five Components

Every requirement has five parts:

### 1. Actor — Who or what performs the action?
- "The system shall..."
- "The user shall be able to..."
- "The admin dashboard shall..."

### 2. Action — What specific behavior happens?
- "authenticate users"
- "display a loading indicator"
- "send an email notification"

### 3. Condition/Trigger — When does this happen?
- "when the user clicks submit"
- "after 3 failed login attempts"
- "every 24 hours at midnight UTC"

### 4. Constraint — What are the limits?
- "within 200ms"
- "with bcrypt hashing"
- "without exposing sensitive data in logs"

### 5. Acceptance Criteria — How do we know it's done?
- "Verified by: Automated test showing <200ms response time"
- "Verified by: Manual inspection of password hashes in database"

## The REQ-xxx Format

```markdown
### REQ-001: [Short Name]

**Statement:** The system shall [specific, testable behavior]

**Acceptance Criteria:**
- [ ] [Specific condition that must be true]
- [ ] [Another condition]
- [ ] [Edge case handled]

**Dependencies:** REQ-XXX, REQ-YYY

**Complexity:** [S/M/L/XL]

**Value:** [Critical/High/Medium/Low]

**Notes:** [Any clarifications or decisions needed]
```

### Complexity Scale

| Size | Meaning | Guidance |
|------|---------|----------|
| S | Less than a day of agent work | Single-file change, config, minor feature |
| M | 1-3 days of agent work | New screen, service, or component |
| L | 1-2 weeks of agent work | Multi-file feature, schema redesign |
| XL | Needs to be broken down further | Too large — split into smaller REQs |

### Value Scale

| Priority | Meaning |
|----------|---------|
| Critical | Product doesn't work without it |
| High | Significant competitive advantage or user value |
| Medium | Nice to have, improves experience |
| Low | Polish, could ship without it |

## Requirement Types

### Functional — What the system does
- "The system shall allow users to create projects"
- "The system shall export data to CSV format"

### Non-Functional — How the system performs
- "The system shall handle 1000 concurrent users"
- "The system shall maintain 99.9% uptime"

### Interface — How systems interact
- "The system shall expose a REST API with JSON responses"
- "The system shall integrate with Stripe for payment processing"

### Data — What information is managed
- "The system shall store user emails in encrypted format"
- "The system shall retain audit logs for 7 years"

## Granularity

**The test:** "Can an agent implement this in 1-3 days?"

| Answer | Action |
|--------|--------|
| Yes | Good granularity |
| Too small (< 4 hours) | Combine with related requirements |
| Too large (> 1 week) | Break into smaller requirements |

**Too broad:** "User management" — Agent doesn't know scope.

**Too narrow:** "Add a blue submit button at (100,200) with Arial 14pt" — You're doing the agent's job.

**Right:** "The system shall allow admins to create, edit, and delete user accounts with role assignment (admin, editor, viewer)"

## Dependencies

Mark dependencies explicitly. This enables parallelization:

```
REQ-001: User Registration
REQ-002: Email Verification [depends on REQ-001]
REQ-003: Login [depends on REQ-001]
REQ-004: Password Reset [depends on REQ-001, REQ-002]
```

REQ-001, REQ-002, and REQ-003 can be parallelized. REQ-004 blocks until all three are done.

## Edge Cases

Think about failure modes during spec writing, not after agents build the happy path:

```markdown
### REQ-015: Profile Picture Upload

**Statement:** The system shall allow users to upload profile pictures.

**Acceptance Criteria:**
- [ ] Supported formats: JPEG, PNG, GIF
- [ ] Max file size: 5MB
- [ ] Automatic resize to 400x400px, maintain aspect ratio
- [ ] If file too large → error message with size limit
- [ ] If unsupported format → error message with supported formats
- [ ] If upload fails → show error, preserve old picture
- [ ] If no picture uploaded → show default avatar
```

Without edge cases: agent builds happy path, you spend days on "what if?" bugs.
With edge cases: agent builds it right the first time.

## Anti-Patterns

### 1. Solution disguised as requirement
- **Bad:** "Use React for the frontend"
- **Good:** "The system shall provide a responsive web interface"
- **Why:** Let agents choose implementation unless you have a real constraint.

### 2. Vague qualifiers
- **Bad:** "The system should be user-friendly"
- **Good:** "The system shall complete checkout in ≤3 clicks from cart"
- **Why:** "User-friendly" means nothing to an agent.

### 3. Multiple requirements in one
- **Bad:** "The system shall authenticate users, manage sessions, and handle password resets"
- **Good:** Split into REQ-001, REQ-002, REQ-003
- **Why:** Can't track progress on "partially done" requirements.

### 4. Missing acceptance criteria
- **Bad:** "The system shall send email notifications"
- **Good:** Add "Verified by: Test email received within 30 seconds"
- **Why:** Without criteria, "done" is subjective.

## Quality Checklist

Before writing a requirement, verify:

- [ ] Can I test if this is done?
- [ ] Is it a single, atomic thing?
- [ ] Did I specify what happens on success AND failure?
- [ ] Did I list dependencies on other requirements?
- [ ] Did I avoid dictating implementation details unnecessarily?
- [ ] Can an agent implement this in 1-3 days?

If any answer is "no," revise the requirement.
