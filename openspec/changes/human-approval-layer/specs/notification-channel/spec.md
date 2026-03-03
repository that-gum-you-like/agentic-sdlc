## ADDED Requirements

### Requirement: Send notification to human via configured provider

The system SHALL provide a `notify.mjs send` command that sends a text message to the human project owner through the configured notification provider. The message SHALL be delivered to the channel specified in `project.json`'s `notification.channel` field.

#### Scenario: Send a plain text notification via OpenClaw provider
- **WHEN** `node agents/notify.mjs send "Deploy complete for T-042"` is run with `notification.provider` set to `"openclaw"` in project.json
- **THEN** the system SHALL execute the OpenClaw CLI to send the message to the configured channel and print a confirmation to stdout

#### Scenario: Send a notification with media attachment
- **WHEN** `node agents/notify.mjs send "Screenshot attached" --media pm/media/screenshot.png` is run
- **THEN** the system SHALL send the message with the media file attached via the configured provider

#### Scenario: Send notification with file provider
- **WHEN** `notification.provider` is set to `"file"` in project.json
- **THEN** the system SHALL append the message with a timestamp to the file at `notification.mailboxPath` (default: `pm/notifications.md`)

#### Scenario: Send notification with no provider configured
- **WHEN** `notification.provider` is not set or is set to `"none"`
- **THEN** the system SHALL print the message to stdout with a note that no notification provider is configured and exit with code 0 (no error)

### Requirement: Notification config in project.json

The `loadConfig()` function SHALL resolve a `notification` section from `project.json` containing: `provider` (string), `channel` (string), `mailboxPath` (string, default `"pm/mailbox.md"`), `mediaDir` (string, default `"pm/media"`), and `triggers` (object with boolean flags).

#### Scenario: Config with full notification section
- **WHEN** project.json contains a `notification` object with all fields
- **THEN** `loadConfig()` SHALL return a `notification` property with all values resolved to absolute paths where applicable

#### Scenario: Config with no notification section
- **WHEN** project.json does not contain a `notification` object
- **THEN** `loadConfig()` SHALL return a `notification` property with defaults: `provider: "none"`, `mailboxPath: "pm/mailbox.md"`, `mediaDir: "pm/media"`, `triggers: {}`, `channel: ""`

### Requirement: Check inbound mailbox for human messages

The system SHALL provide a `notify.mjs check-mailbox` command that reads the mailbox file and parses inbound messages from the human.

#### Scenario: Parse new messages from mailbox file
- **WHEN** `node agents/notify.mjs check-mailbox` is run and the mailbox file contains new entries since the last check
- **THEN** the system SHALL print each new message with its timestamp and return them as structured output

#### Scenario: No new messages
- **WHEN** `node agents/notify.mjs check-mailbox` is run and there are no new entries
- **THEN** the system SHALL print "No new messages" and exit with code 0

### Requirement: Automatic notification triggers

The system SHALL fire notifications automatically when configured trigger events occur. Each trigger SHALL be individually enabled/disabled via `notification.triggers` in project.json.

#### Scenario: Blocker trigger fires when task is blocked
- **WHEN** a task is flagged as blocked (status set to `"blocked"` or agent retries exhausted) AND `notification.triggers.blocker` is `true`
- **THEN** the system SHALL send a notification: "🚫 Task [ID] blocked: [reason]"

#### Scenario: Budget alert trigger fires at threshold
- **WHEN** an agent's daily token usage reaches 80% of their budget AND `notification.triggers.budgetAlert` is `true`
- **THEN** the system SHALL send a notification: "⚠️ Agent [name] at [X]% of daily budget"

#### Scenario: Daily summary trigger fires at end of session
- **WHEN** `daily-review.mjs` completes its summary AND `notification.triggers.dailySummary` is `true`
- **THEN** the system SHALL send a notification with the summary: tasks completed, tasks blocked, total tokens used

#### Scenario: Trigger disabled
- **WHEN** a triggerable event occurs but the corresponding trigger is set to `false` or not present in config
- **THEN** the system SHALL NOT send a notification for that event

### Requirement: Provider health check

The system SHALL provide a `notify.mjs status` command that checks whether the configured notification provider is reachable and functional.

#### Scenario: OpenClaw provider healthy
- **WHEN** `node agents/notify.mjs status` is run with provider `"openclaw"` and the OpenClaw CLI is available
- **THEN** the system SHALL print "✅ Notification channel: openclaw (healthy)" and exit with code 0

#### Scenario: Provider unavailable
- **WHEN** `node agents/notify.mjs status` is run and the configured provider is not reachable
- **THEN** the system SHALL print "❌ Notification channel: [provider] (unavailable)" and exit with code 1
