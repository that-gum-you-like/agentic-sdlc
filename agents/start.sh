#!/bin/bash
# LinguaFlow Agent System — Startup Script
# Starts Matrix server and verifies all systems are ready.

set -e

echo "🚀 Starting LinguaFlow Agent System..."
echo ""

# 1. Start Matrix homeserver if not running
if ! ss -tlnp 2>/dev/null | grep -q ':6167'; then
  echo "Starting Matrix homeserver (conduwuit)..."
  ~/bin/conduwuit -c /home/bryce/matrix/conduit/conduwuit.toml &
  sleep 3
else
  echo "✓ Matrix homeserver already running on :6167"
fi

# 2. Verify Matrix is responding
if curl -s http://127.0.0.1:6167/_matrix/client/versions > /dev/null 2>&1; then
  echo "✓ Matrix server responding"
else
  echo "✗ Matrix server not responding — check conduwuit logs"
  exit 1
fi

# 3. Load nvm for node
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 4. Show queue status
echo ""
echo "📋 Task Queue:"
node /home/bryce/languageapp/agents/queue-drainer.mjs status

# 5. Show agent roster
echo ""
echo "👥 Agent Roster:"
echo "  Roy (Backend)      — @roy:linguaflow.local"
echo "  Moss (AI Pipeline) — @moss:linguaflow.local"
echo "  Jen (Frontend)     — @jen:linguaflow.local"
echo "  Richmond (Reviews) — @richmond:linguaflow.local"
echo "  Denholm (Releases) — @denholm:linguaflow.local"
echo "  Douglas (Docs)     — @douglas:linguaflow.local"

echo ""
echo "📡 Matrix Channels: #general #backend #frontend #ai-pipeline #releases #reviews #docs"
echo ""
echo "Ready. Use the queue-drainer to assign tasks, or invoke agents directly."
