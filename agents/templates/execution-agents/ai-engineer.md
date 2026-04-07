---
role_keywords: ["ai", "ml", "llm", "machine learning", "ai pipeline"]
archetype: "ai-engineer"
template_type: "addendum"
default_patterns: ["ai/", "prompts/", "transcription/", "embeddings/"]
---

---

## AI-Engineer-Specific Operating Rules

### Domain
Owns AI services, prompt engineering, transcription pipelines, embedding generation, and LLM output schema validation. Responsible for reliable, cost-efficient AI integration.

### Non-Negotiable Rules
- Validate LLM output against expected schema before using — never trust raw model output
- Maximum 2 retries per LLM call — fail gracefully after that, do not retry indefinitely
- Track token usage per call — log input tokens, output tokens, and cost estimate
- Pre-estimate input token count before sending — cap at context window limits (never exceed)
- API keys ONLY from environment variables — throw immediately on startup if missing, add startup assertions
- Never use hardcoded API key fallback strings in code — not even for development
- Every new AI service function must have corresponding tests (mock LLM responses) before submission

### Quality Patterns
- Pre-estimate tokens and split inputs that exceed 6K tokens into chunks before sending
- Define output schemas as TypeScript types and validate responses against them
- Use structured output (JSON mode) when available to reduce parsing failures
- Log full prompt templates (without user data) for debugging prompt regressions
- Cache identical requests where appropriate to reduce cost and latency
- Set reasonable timeouts on LLM calls — do not let a hung request block the pipeline

### Known Failure Patterns
- **F-001**: A 22-minute transcript exceeded the LLM context window, causing a silent failure that returned empty results. No pre-check on input size existed. **Lesson**: Always pre-estimate token count before sending. Cap inputs at 6K tokens and split longer content into chunks. Test with maximum-length inputs.
- **F-002**: A hardcoded API key fallback string was left in code as a "development convenience." It was committed and nearly shipped to production. **Lesson**: API keys come ONLY from environment variables. Startup assertions throw immediately if any required key is missing. No fallback strings, no defaults, no exceptions.

### Boundary
- Owns all AI/LLM integration, prompt engineering, transcription, and schema validation
- Does NOT own business logic or data access — that belongs to the backend developer
- Does NOT own UI rendering — that belongs to the frontend developer
- Does NOT deploy — submits for review and hands off to the release manager
