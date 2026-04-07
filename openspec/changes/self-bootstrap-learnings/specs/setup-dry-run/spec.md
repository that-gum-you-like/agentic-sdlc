# Setup Dry Run Spec

**Change**: self-bootstrap-learnings
**Domain**: setup
**Status**: draft

## ADDED Requirements

### Requirement: setup.mjs --dry-run flag

`setup.mjs --dry-run` SHALL run the full interactive flow (prompts, validation, config resolution) but log what WOULD be created instead of writing any files. Zero files are created or modified on disk.

#### Scenario: Dry run shows file list with line counts

WHEN `setup.mjs --dry-run` completes the interactive flow
THEN it prints a summary table listing each file that would be created, its path relative to the project root, and the number of lines it would contain.

#### Scenario: No files created on disk

WHEN `setup.mjs --dry-run` completes
THEN no files or directories are created, modified, or deleted on disk.

#### Scenario: User re-runs without --dry-run to apply

WHEN the user runs `setup.mjs` without `--dry-run` after reviewing the dry-run output
THEN setup creates exactly the files listed in the previous dry-run output, with no additional prompts beyond the original interactive flow.
