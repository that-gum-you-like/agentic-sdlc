# Adapter Migration Spec

**Change**: self-bootstrap-learnings
**Domain**: orchestration
**Status**: draft

## ADDED Requirements

### Requirement: Queue-drainer uses orchestration adapter

`queue-drainer.mjs` SHALL call adapter methods (`loadTasks`, `saveTask`, `archiveTask`) instead of direct file I/O. A file-based adapter produces identical behavior to the current implementation. An integration test proves equivalence between the adapter path and the legacy direct-I/O path.

#### Scenario: File-based adapter produces identical output

WHEN queue-drainer runs with the file-based adapter configured in `project.json`
THEN it loads, saves, and archives tasks with identical file contents and directory structure as the current direct file I/O implementation.

#### Scenario: Paperclip adapter routes correctly

WHEN `project.json` specifies `"orchestrationAdapter": "paperclip"`
THEN queue-drainer routes all task operations (`loadTasks`, `saveTask`, `archiveTask`) through the paperclip adapter module.

#### Scenario: Unknown adapter throws clear error

WHEN `project.json` specifies an unrecognized adapter name
THEN queue-drainer throws a descriptive error including the unknown adapter name and the list of supported adapters, and exits with a non-zero code.
