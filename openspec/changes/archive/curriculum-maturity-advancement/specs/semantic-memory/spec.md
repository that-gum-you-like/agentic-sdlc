## ADDED Requirements

### Requirement: Embedding generation for memory entries
The system SHALL generate vector embeddings for every memory entry when it is recorded via `memory-manager.mjs record`. Embeddings MUST be generated using a local model (sentence-transformers `all-MiniLM-L6-v2`) with no cloud API calls. Embeddings SHALL be stored in `agents/<agent>/memory/vectors.json` alongside the entry ID.

#### Scenario: New memory entry gets embedded
- **WHEN** `memory-manager.mjs record <agent> recent "Fixed silent fallback in auth service"` is executed
- **THEN** the entry is written to `recent.json` AND an embedding vector is generated and stored in `vectors.json` keyed by the entry ID

#### Scenario: Embedding model not installed
- **WHEN** `memory-manager.mjs record` is called AND sentence-transformers is not installed
- **THEN** the entry is written to the memory layer normally AND a warning is logged "Semantic indexing unavailable — install sentence-transformers for semantic memory search" AND no embedding is generated AND the system continues without error

### Requirement: Semantic memory search
The system SHALL provide a `memory-manager.mjs search <agent> "<query>"` command that returns the top-K most relevant memory entries across all layers (excluding compost) ranked by cosine similarity to the query embedding. Default K SHALL be 5.

#### Scenario: Semantic search returns relevant results
- **WHEN** `memory-manager.mjs search roy "silent fallback patterns"` is executed
- **AND** Roy's memory contains entries about NaN fallbacks, zero defaults, and silent error swallowing
- **THEN** those entries are returned ranked by relevance, with similarity score and source layer for each

#### Scenario: No embeddings available
- **WHEN** `memory-manager.mjs search` is called AND `vectors.json` does not exist or is empty
- **THEN** the system falls back to full `recall` behavior AND logs "No embeddings found — falling back to full recall"

### Requirement: Worker prompt injection uses semantic search
The `worker.mjs` prompt generator SHALL use semantic search (when available) to inject only the most relevant memory entries into the agent's context, instead of loading entire memory files. The search query SHALL be derived from the task title and description.

#### Scenario: Worker uses semantic context
- **WHEN** worker.mjs generates a prompt for task "Fix silent NaN fallback in temperature service"
- **AND** semantic search is available
- **THEN** the prompt includes only the top-5 most relevant memory entries (not the full memory dump) AND the prompt is shorter than it would be with full recall

### Requirement: REM sleep uses similarity-based deduplication
`rem-sleep.mjs` SHALL use cosine similarity (threshold >= 0.92) to identify near-duplicate entries during consolidation, instead of exact string matching only.

#### Scenario: Near-duplicate entries are merged
- **WHEN** REM sleep runs AND long-term memory contains "Never use silent fallbacks to zero" and "Avoid silent fallback patterns that default to 0"
- **THEN** these are identified as near-duplicates AND the newer entry is kept AND the older is moved to compost

### Requirement: Pattern-hunt uses semantic clustering
`pattern-hunt.mjs` SHALL cluster review issues by embedding similarity instead of keyword-only categorization. Issues with cosine similarity >= 0.85 SHALL be grouped together even if they use different terminology.

#### Scenario: Differently-worded same issue clustered together
- **WHEN** pattern-hunt analyzes reviews containing "missing null check", "no undefined guard", and "unhandled nullable access"
- **THEN** all three are grouped into the same cluster AND the cluster is labeled with the most representative term
