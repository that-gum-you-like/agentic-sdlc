# Configurable Done Checklist Spec

**Change**: self-bootstrap-learnings
**Domain**: governance
**Status**: draft

## ADDED Requirements

### Requirement: Per-project done checklist

`project.json` SHALL support a `doneChecklist` array defining which completion steps apply to the project. Default for app-type projects: `["openspec", "tests", "commit", "deploy", "verify", "notify"]`. Default for framework-type projects: `["openspec", "tests", "commit", "push"]`. `CLAUDE.md` and `AGENT.md.template` reference this config to generate the appropriate done checklist for each project context.

#### Scenario: Framework repo done checklist omits deploy/verify/notify

WHEN `project.json` has `"projectType": "framework"` and no explicit `doneChecklist`
THEN the resolved done checklist is `["openspec", "tests", "commit", "push"]` and does not include `deploy`, `verify`, or `notify` steps.

#### Scenario: App repo gets full checklist by default

WHEN `project.json` has `"projectType": "app"` and no explicit `doneChecklist`
THEN the resolved done checklist is `["openspec", "tests", "commit", "deploy", "verify", "notify"]`.

#### Scenario: Missing field uses app defaults for backward compatibility

WHEN `project.json` has no `projectType` field and no `doneChecklist` field
THEN the resolved done checklist defaults to the app checklist `["openspec", "tests", "commit", "deploy", "verify", "notify"]` to maintain backward compatibility with existing projects.
