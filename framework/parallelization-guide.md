# Parallelization Guide

How to identify parallel work, define interface contracts, and organize work streams for multi-agent execution.

## Dependency Graphs

Map requirement dependencies before assigning work:

```
REQ-001: Database schema
    ↓
REQ-002: User model ←─────────────┐
    ↓                              │
REQ-003: Auth endpoints            │
    ↓                              │
REQ-004: Login UI ─────────────────┤
                                   │
REQ-005: Product model ←───────────┘
    ↓
REQ-006: Product API
    ↓
REQ-007: Product listing UI
```

**Critical Path:** The longest chain of dependent requirements. This determines the minimum time to completion regardless of parallelization.

## Identifying Parallel Tracks

Requirements can run in parallel when they:
- Don't share files
- Don't share database tables or schemas
- Have clear interface boundaries
- Can be tested independently

**Example:**
```
Track A: REQ-002, REQ-003 (User/Auth backend)    ← parallel
Track B: REQ-005, REQ-006 (Product backend)       ← parallel
Track C: REQ-010, REQ-011 (Infrastructure/CI)     ← parallel
```

These touch different files and different tables — all three can run simultaneously.

**Sequential within a track:**
```
REQ-003 (Auth API) → REQ-004 (Login UI)
```
The UI needs the API to exist.

## Interface Contracts

**Critical:** If you define interfaces before agents start working, they can build against contracts instead of waiting for implementations.

Define contracts for every interaction between parallel streams:

```typescript
// Defined BEFORE either agent starts working.
// Both backend and frontend agents receive this.

interface AuthAPI {
  // POST /api/v1/auth/login
  login(credentials: {
    email: string;
    password: string;
  }): Promise<{
    token: string;
    user: { id: string; email: string; name: string };
    expiresAt: string;
  }>;

  // POST /api/v1/auth/logout
  logout(token: string): Promise<{ success: boolean }>;
}

// Error format (all endpoints)
interface APIError {
  code: string;
  message: string;
  details?: Record<string, string>;
}
```

Now the backend agent implements the contract and the frontend agent builds against it — in parallel.

### What to specify in a contract

**For API interactions:**
1. Endpoint path and method
2. Request payload schema (with examples)
3. Response payload schema (with examples)
4. Error response format
5. Authentication requirements

**For service interactions:**
1. Function/method signatures
2. Input/output types
3. Error handling approach

## Work Streams

Organize requirements into streams by domain:

```markdown
## Work Stream Assignments

### Backend Stream (Agent: Roy)
- REQ-001, REQ-002, REQ-005
- API implementation
- Database schema

### Frontend Stream (Agent: Jen)
- REQ-004, REQ-007, REQ-008
- UI components
- Forms and validation

### Infrastructure Stream (Agent: Moss)
- REQ-010, REQ-011
- CI/CD setup
- Environment configuration
```

Each agent gets:
- Their work items (specific REQs)
- Interface contracts they implement
- Relevant portions of roadmap
- CLAUDE.md context (automatic)

## Decision Matrix

| Situation | Strategy |
|-----------|----------|
| 5 features, no shared files | 5 agents in parallel |
| 5 features, all touch same file | 1 agent, sequential |
| 3 backend + 2 frontend, clear API | 2 tracks in parallel |
| Feature needs API that doesn't exist | Define interface → parallel |
| Unclear dependencies | Analyze first → then decide |

## Handoffs Between Streams

When one stream produces output another needs:

1. **Define the contract upfront** (in roadmap or design doc)
2. **Build against the contract** (both sides, simultaneously)
3. **Integration test at merge** (verify both sides match the contract)

The handoff point is the interface contract. Both agents agree on it before starting.

## In the Tasks Template

Mark parallelization explicitly:

```markdown
- [ ] **T-001**: Build auth API
  - Agent: Roy
  - Parallel: yes

- [ ] **T-002**: Build product API
  - Agent: Roy
  - Parallel: yes (with T-001 — different files)

- [ ] **T-003**: Build login UI
  - Agent: Jen
  - Parallel: blocked-by T-001
```

The Work Stream Summary table in `tasks.md` should show which streams run simultaneously.
