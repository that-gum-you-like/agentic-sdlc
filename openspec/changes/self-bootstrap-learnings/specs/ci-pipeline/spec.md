# Spec: GitHub Actions CI Pipeline

**Change**: self-bootstrap-learnings
**Status**: draft
**Created**: 2026-04-07

## ADDED Requirements

### Requirement: GitHub Actions CI pipeline

`.github/workflows/test.yml` SHALL run unit tests and behavior tests (framework mode) on push to `main` and on pull requests. The workflow SHALL use a Node.js version matrix of 18 and 20.

#### Scenario: Push to main triggers tests

WHEN a commit is pushed to the `main` branch
THEN the CI pipeline SHALL execute unit tests and behavior tests
AND the pipeline SHALL run against both Node.js 18 and Node.js 20.

#### Scenario: Pull request triggers tests

WHEN a pull request is opened or updated targeting any branch
THEN the CI pipeline SHALL execute unit tests and behavior tests
AND the pipeline SHALL run against both Node.js 18 and Node.js 20.

#### Scenario: Failing test blocks merge

WHEN the CI pipeline runs on a pull request
AND any unit test or behavior test fails
THEN the CI check SHALL report failure
AND the pull request SHALL be blocked from merging (when branch protection is enabled).

#### Scenario: README badge shows status

WHEN the CI pipeline is configured
THEN the `README.md` SHALL include a status badge reflecting the current CI pass/fail state for the `main` branch.
