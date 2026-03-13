## ADDED Requirements

### Requirement: NLP analyzer script
The system SHALL provide `agents/nlp-analyzer.mjs` that shells out to `agents/nlp-analyze.py` to perform semantic code analysis on changed files. The Python script SHALL use spaCy (local, CPU-only) to detect property/API near-misses.

#### Scenario: NLP analyzer finds near-miss property access
- **WHEN** a changed file accesses `user.fullName` AND the type definition has `user.full_name`
- **THEN** the analyzer returns a warning: "Possible near-miss: `user.fullName` — did you mean `user.full_name`? (edit distance: 1, semantic similarity: 0.94)"

#### Scenario: NLP analyzer not available
- **WHEN** nlp-analyzer.mjs is called AND spaCy is not installed
- **THEN** the script logs "NLP analysis skipped — spaCy not available" AND exits with code 0 (success, not failure)

### Requirement: Integration with four-layer-validate
`four-layer-validate.mjs` SHALL include NLP analysis as an optional Layer 2.5 (between Critique and Code). It SHALL only run if spaCy is detected as installed.

#### Scenario: NLP layer runs when available
- **WHEN** `four-layer-validate.mjs` runs AND spaCy is installed
- **THEN** the NLP layer executes between Layer 2 (Critique) and Layer 3 (Code) AND its findings are included in the validation report

#### Scenario: NLP layer skipped gracefully
- **WHEN** `four-layer-validate.mjs` runs AND spaCy is not installed
- **THEN** validation runs Layers 1, 2, 3, 4 normally AND reports "Layer 2.5 (NLP): skipped (spaCy not available)"

### Requirement: Semantic distance threshold
The NLP analyzer SHALL flag property accesses and method calls where the edit distance is <= 3 AND semantic similarity is >= 0.80. Exact matches SHALL NOT be flagged. Completely dissimilar names (similarity < 0.80) SHALL NOT be flagged.

#### Scenario: Close but not exact flagged
- **WHEN** code calls `api.getUsers()` AND the actual method is `api.fetchUsers()`
- **THEN** the analyzer flags it with similarity score and suggestion

#### Scenario: Exact match not flagged
- **WHEN** code calls `api.getUsers()` AND the actual method is `api.getUsers()`
- **THEN** no flag is raised

#### Scenario: Completely different not flagged
- **WHEN** code accesses `config.timeout` AND no similar property exists
- **THEN** no flag is raised (dissimilar names are not near-misses)

### Requirement: Privacy — local only
All NLP analysis SHALL run locally via spaCy. No code, property names, or method signatures SHALL be sent to any cloud API. The nlp-analyze.py script SHALL NOT import or use any cloud SDK.

#### Scenario: No network calls during analysis
- **WHEN** nlp-analyze.py runs
- **THEN** zero network requests are made (verifiable by running with network disabled)
