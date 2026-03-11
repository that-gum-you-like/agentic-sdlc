## ADDED Requirements

### Requirement: Pattern hunt script
The system SHALL provide `agents/pattern-hunt.mjs` that mines Richmond's review history for recurring issues and proposes new defeat tests.

#### Scenario: Mine review directory
- **WHEN** `node agents/pattern-hunt.mjs` is run
- **THEN** it reads all files in `agents/richmond/reviews/`, extracts flagged issues, and groups by category

#### Scenario: Identify recurring patterns
- **WHEN** the same issue category appears in 3+ reviews
- **THEN** it is flagged as a "recurring pattern" with the file names, dates, and issue descriptions

#### Scenario: Propose defeat tests
- **WHEN** a recurring pattern is identified
- **THEN** the script outputs a proposed defeat test description (pattern name, regex or AST check, files to scan, suggested allowlist strategy)

### Requirement: Output format
The script SHALL output results in both human-readable (default) and JSON (`--json`) formats.

#### Scenario: Human-readable output
- **WHEN** the script runs without flags
- **THEN** it prints a summary: "Found N recurring patterns across M reviews" followed by each pattern with proposed test

#### Scenario: JSON output
- **WHEN** the script runs with `--json`
- **THEN** it outputs `{ patterns: [...], proposedTests: [...] }` suitable for further automation

### Requirement: Supplement with git log analysis
The script SHALL also scan recent git log messages for revert/fix commits that indicate recurring problems.

#### Scenario: Revert pattern detection
- **WHEN** `git log --oneline -100` contains 2+ reverts of similar files
- **THEN** the script flags those files as candidates for additional defeat tests
