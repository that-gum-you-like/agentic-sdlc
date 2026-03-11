## ADDED Requirements

### Requirement: Error fingerprinting
The `crashReportService.ts` SHALL compute a fingerprint for each error using a hash of `error.message` concatenated with the first 3 stack frames.

#### Scenario: Identical errors produce same fingerprint
- **WHEN** two errors have the same message and top 3 stack frames
- **THEN** they produce the same fingerprint string

#### Scenario: Different errors produce different fingerprints
- **WHEN** two errors have different messages or different stack frames
- **THEN** they produce different fingerprint strings

### Requirement: Duplicate counting
The system SHALL increment a counter on existing entries rather than appending duplicates.

#### Scenario: First occurrence stored
- **WHEN** an error with a new fingerprint is reported
- **THEN** it is stored with `count: 1` and `firstSeen` / `lastSeen` timestamps

#### Scenario: Duplicate increments counter
- **WHEN** an error with an existing fingerprint is reported
- **THEN** the existing entry's `count` is incremented and `lastSeen` is updated

#### Scenario: Report shows top errors by count
- **WHEN** the error report is read
- **THEN** entries are sorted by `count` descending, showing unique errors with their occurrence counts
