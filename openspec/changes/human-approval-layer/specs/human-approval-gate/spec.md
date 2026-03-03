## ADDED Requirements

### Requirement: Request human approval and wait for response

The system SHALL provide a `notify.mjs approve` command that sends an approval request to the human and waits for a response. The approval SHALL be tracked as a JSON file in `pm/approvals/`.

#### Scenario: Request approval and receive approval
- **WHEN** `node agents/notify.mjs approve "Ready to deploy?" --task T-042 --timeout 3600` is run
- **THEN** the system SHALL send the approval request via the configured provider, create a pending approval file at `pm/approvals/<id>.json`, and poll until the human responds with approval
- **THEN** the command SHALL exit with code 0 and print "✅ Approved"

#### Scenario: Request approval and receive rejection
- **WHEN** an approval request is pending and the human responds with a rejection (keywords: "no", "reject", "rejected", "deny")
- **THEN** the system SHALL update the approval file with `status: "rejected"` and the response text
- **THEN** the command SHALL exit with code 1 and print "❌ Rejected: [response text]"

#### Scenario: Request approval with media attachment
- **WHEN** `node agents/notify.mjs approve "Verify screenshot" --task T-042 --media pm/media/deploy.png` is run
- **THEN** the system SHALL attach the media file to the approval request message

### Requirement: Approval timeout with escalation

Pending approvals SHALL have a configurable timeout. After timeout, the system SHALL escalate and eventually auto-approve.

#### Scenario: First timeout sends reminder
- **WHEN** an approval request has been pending longer than its timeout period
- **THEN** the system SHALL re-send the notification with "⏰ REMINDER:" prefix

#### Scenario: Second timeout auto-approves
- **WHEN** an approval request has been pending longer than 2x its timeout period with no response
- **THEN** the system SHALL set the approval status to `"auto-approved"`, log a warning, and allow the agent to proceed
- **THEN** the approval file SHALL include `"autoApproved": true` and `"autoApprovedAt"` timestamp

#### Scenario: Agent records auto-approval in memory
- **WHEN** an approval is auto-approved due to timeout
- **THEN** the agent SHALL record a medium-term memory entry: "Auto-approved [approval type] for [task ID] after timeout — human did not respond"

### Requirement: Approval file lifecycle

Each approval request SHALL be persisted as a JSON file in `pm/approvals/` with a defined schema and lifecycle.

#### Scenario: Create approval file on request
- **WHEN** an approval is requested
- **THEN** the system SHALL create `pm/approvals/<id>.json` with fields: `id`, `type`, `requestedBy`, `taskId`, `message`, `media` (array), `status` ("pending"), `requestedAt`, `timeout`, `response` (null), `respondedAt` (null)

#### Scenario: Update approval file on response
- **WHEN** a response is matched to a pending approval (via `check-mailbox` or `resolve` command)
- **THEN** the system SHALL update the approval file: `status` to "approved" or "rejected", `response` to the human's message text, `respondedAt` to current timestamp

#### Scenario: List pending approvals
- **WHEN** `node agents/notify.mjs pending` is run
- **THEN** the system SHALL read all files in `pm/approvals/`, filter for `status: "pending"`, and print each with ID, task, message, and time waiting

### Requirement: Manual approval resolution

The system SHALL provide a `notify.mjs resolve` command for manual approval resolution without going through the messaging channel.

#### Scenario: Manually approve a pending request
- **WHEN** `node agents/notify.mjs resolve approval-001 approved --note "Looks good"` is run
- **THEN** the system SHALL update the approval file with `status: "approved"`, `response: "Looks good"`, and `respondedAt` timestamp

#### Scenario: Manually reject a pending request
- **WHEN** `node agents/notify.mjs resolve approval-001 rejected --note "Needs fixes"` is run
- **THEN** the system SHALL update the approval file with `status: "rejected"` and the note

#### Scenario: Resolve non-existent approval
- **WHEN** `node agents/notify.mjs resolve nonexistent-id approved` is run
- **THEN** the system SHALL print "❌ Approval not found: nonexistent-id" and exit with code 1

### Requirement: Mailbox message matching to approvals

The `check-mailbox` command SHALL attempt to match inbound human messages to pending approval requests.

#### Scenario: Match approval keyword to most recent pending approval
- **WHEN** `check-mailbox` finds a new message containing "approved", "yes", "looks good", or "lgtm"
- **THEN** the system SHALL resolve the most recent pending approval as approved

#### Scenario: Match rejection keyword to most recent pending approval
- **WHEN** `check-mailbox` finds a new message containing "no", "reject", "rejected", or "deny"
- **THEN** the system SHALL resolve the most recent pending approval as rejected

#### Scenario: Unrecognized message logged but not matched
- **WHEN** `check-mailbox` finds a new message that does not match approval/rejection keywords and does not reference a specific approval ID
- **THEN** the system SHALL log the message as "unmatched" and print it for agent awareness, but SHALL NOT resolve any approvals

### Requirement: Queue drainer approval integration

The queue drainer SHALL support optional approval gates for task completion.

#### Scenario: Task with approvalRequired completes
- **WHEN** `queue-drainer.mjs complete <id> passing` is run on a task with `"approvalRequired": true`
- **THEN** the system SHALL send an approval request via `notify.mjs approve` and wait for human response before marking the task as completed

#### Scenario: Task without approvalRequired completes normally
- **WHEN** `queue-drainer.mjs complete <id> passing` is run on a task without `"approvalRequired"` or with it set to `false`
- **THEN** the system SHALL mark the task as completed immediately without requesting approval (existing behavior)

### Requirement: Done checklist enforcement with notification

The CLAUDE.md done checklist SHALL document notification as the final step. When configured, agents SHALL send a notification with deploy link and screenshots before reporting work as done to the human.

#### Scenario: Done checklist with notifications configured
- **WHEN** an agent completes the deploy step of the done checklist and notifications are configured
- **THEN** the agent SHALL run `notify.mjs send` or `notify.mjs approve` with the deploy URL and visual test screenshots before reporting done

#### Scenario: Done checklist without notifications
- **WHEN** an agent completes the done checklist and no notification provider is configured
- **THEN** the agent SHALL proceed with the existing checklist (no notification step) and log that notifications were skipped
