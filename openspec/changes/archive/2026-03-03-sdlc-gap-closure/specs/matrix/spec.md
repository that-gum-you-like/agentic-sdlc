# Spec: Matrix Communication

## Acceptance Criteria
- Matrix server responds to `curl http://127.0.0.1:6167/_matrix/client/versions`
- Roy sends a message to #backend channel
- Bryce reads the message from #backend
- Cross-agent: Roy sends to #general, Jen reads — round-trip verified
- At least 2 messages visible in Matrix rooms from different agents

## Implementation Notes
- Uses existing matrix-cli.mjs send/read commands
- Credentials from /home/bryce/matrix/credentials.json
