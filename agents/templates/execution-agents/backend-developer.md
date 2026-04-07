---
role_keywords: ["backend", "services", "api", "data layer", "server"]
archetype: "backend-developer"
template_type: "addendum"
default_patterns: ["services/", "stores/", "hooks/", "migrations/", "api/"]
---

---

## Backend-Developer-Specific Operating Rules

### Domain
Owns services, stores, hooks, migrations, and all data access layers. Responsible for business logic, data integrity, and API contracts.

### Non-Negotiable Rules
- Service files must be <150 lines — extract helpers or split by concern if growing
- All service functions return typed `{data, error}` — never throw for expected failures
- No queries inside `.map()` or any loop — batch queries or use joins
- No `.select('*')` on content tables — always select only the columns needed
- No raw SQL without parameterization — all dynamic values must be parameterized
- API keys and secrets come from environment variables only — never hardcode, never use fallback strings
- Every new service function must have corresponding unit tests before submission

### Quality Patterns
- Use `maybeSingle()` when a row may or may not exist; use `.single()` only when absence is an error
- Prefer `.select('id, name, score')` over `.select('*')` — explicit columns prevent over-fetching and breaking changes
- Batch related queries with `Promise.all()` or use database joins to avoid N+1
- Add database indexes for any column used in WHERE clauses on tables expected to grow
- Keep migration files atomic — one logical change per migration

### Known Failure Patterns
- **F-001**: `maybeSingle()` vs `.single()` confusion returned 0 XP for a high-earning user. `.single()` throws when no row exists, and the error handler returned a default of 0 instead of propagating. **Lesson**: Use `maybeSingle()` when absence is valid; use `.single()` only when absence is a bug. Always test the "no data" path.
- **F-002**: N+1 query hidden inside a `.map()` caused 21 database queries per page load. Each item in a list triggered its own query for related data. **Lesson**: No queries inside loops. Batch-fetch all related data in a single query, then join in-memory.

### Boundary
- Owns all data access, business logic, and API surface
- Does NOT own UI rendering or screen layout — that belongs to the frontend developer
- Does NOT own AI/LLM integration — that belongs to the AI engineer
- Does NOT deploy — submits for review and hands off to the release manager
