#!/usr/bin/env bash
# voice-intake-toggle.sh — Headless push-to-talk voice-to-clipboard
#
# Bind this to a hotkey (e.g. F6) in your desktop environment.
# Press once to start recording, press again to stop.
# Audio is transcribed via Groq Whisper and copied to your clipboard.
# Paste anywhere with Ctrl+V.
#
# Requirements: curl, jq, arecord (alsa-utils) or rec (sox)
# Clipboard:    xclip, xsel (X11), or wl-copy (Wayland)
# Notifications: notify-send (libnotify)
# API key:      export GROQ_API_KEY="gsk_..." in ~/.bashrc
#
# Setup:
#   bash voice-intake-toggle.sh setup    # Interactive setup guide
#   bash voice-intake-toggle.sh check    # Verify dependencies

set -euo pipefail

# Ensure system tools are found first (Homebrew sox can't reach PipeWire)
export PATH="/usr/bin:/bin:/usr/local/bin:${PATH}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/voice-config.json"
PID_FILE="/tmp/voice-intake.pid"
WAV_FILE="/tmp/voice-intake-rec.wav"
LOG_FILE="/tmp/voice-intake.log"
LOCK_FILE="/tmp/voice-intake-launch.lock"

# ─── Load GROQ_API_KEY ───────────────────────────────────────────────────
# When launched from a desktop keybinding, the shell is non-interactive and
# ~/.bashrc is not sourced. Extract the key directly as a fallback.
if [[ -z "${GROQ_API_KEY:-}" ]]; then
  for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile" "$HOME/.bash_profile"; do
    if [[ -f "$rc" ]]; then
      GROQ_API_KEY=$(grep -oP 'export GROQ_API_KEY="\K[^"]+' "$rc" 2>/dev/null || true)
      [[ -n "$GROQ_API_KEY" ]] && break
    fi
  done
  export GROQ_API_KEY="${GROQ_API_KEY:-}"
fi

# ─── Load config ──────────────────────────────────────────────────────────
load_config() {
  if [[ -f "$CONFIG_FILE" ]] && command -v jq &>/dev/null; then
    MODEL=$(jq -r '.model // "whisper-large-v3-turbo"' "$CONFIG_FILE" 2>/dev/null)
    LANGUAGE=$(jq -r '.language // "en"' "$CONFIG_FILE" 2>/dev/null)
    MAX_SECONDS=$(jq -r '.maxSeconds // 120' "$CONFIG_FILE" 2>/dev/null)
    SAMPLE_RATE=$(jq -r '.sampleRate // 16000' "$CONFIG_FILE" 2>/dev/null)
    GROQ_KEY_ENV=$(jq -r '.groqApiKeyEnv // "GROQ_API_KEY"' "$CONFIG_FILE" 2>/dev/null)
  else
    MODEL="whisper-large-v3-turbo"
    LANGUAGE="en"
    MAX_SECONDS=120
    SAMPLE_RATE=16000
    GROQ_KEY_ENV="GROQ_API_KEY"
  fi
}

# ─── Helpers ──────────────────────────────────────────────────────────────
notify() {
  local msg="$1" timeout="${2:-3000}"
  if command -v notify-send &>/dev/null; then
    notify-send -a "Voice Intake" -t "$timeout" "$msg" 2>/dev/null || true
  fi
}

has_cmd() { command -v "$1" &>/dev/null; }

# ─── Commands ─────────────────────────────────────────────────────────────
cmd_check() {
  echo "🔍 Voice Intake — Dependency Check"
  echo "─────────────────────────────────────"
  local ok=true

  for cmd in curl jq; do
    if has_cmd "$cmd"; then
      echo "  ✅ $cmd"
    else
      echo "  ❌ $cmd — Install: sudo apt install $cmd (or brew install $cmd)"
      ok=false
    fi
  done

  if [[ -x /usr/bin/arecord ]] || has_cmd arecord; then
    echo "  ✅ arecord — audio capture"
  elif has_cmd rec; then
    echo "  ✅ rec (sox) — audio capture"
  else
    echo "  ❌ No audio capture tool — Install: sudo apt install alsa-utils"
    ok=false
  fi

  if has_cmd xclip; then
    echo "  ✅ xclip — clipboard"
  elif has_cmd xsel; then
    echo "  ✅ xsel — clipboard"
  elif has_cmd wl-copy; then
    echo "  ✅ wl-copy — clipboard (Wayland)"
  else
    echo "  ❌ No clipboard tool — Install: sudo apt install xclip"
    ok=false
  fi

  if has_cmd notify-send; then
    echo "  ✅ notify-send — desktop notifications"
  else
    echo "  ⚠️  notify-send missing — no visual feedback (Install: sudo apt install libnotify-bin)"
  fi

  if [[ -n "${!GROQ_KEY_ENV:-}" ]]; then
    echo "  ✅ \$$GROQ_KEY_ENV is set"
  elif [[ -n "${GROQ_API_KEY:-}" ]]; then
    echo "  ✅ \$GROQ_API_KEY found in shell config"
  else
    echo "  ❌ GROQ_API_KEY not set — Get one at https://console.groq.com/keys"
    ok=false
  fi

  echo ""
  if $ok; then
    echo "  ✅ All good! Bind this script to a hotkey to start using it."
  else
    echo "  ❌ Fix the items above, then run this check again."
  fi
}

cmd_setup() {
  local script_path
  script_path="$(realpath "${BASH_SOURCE[0]}")"

  echo "🎙 Voice Intake — Setup"
  echo "─────────────────────────────────────"
  echo ""
  echo "This tool lets you press a hotkey, speak, and get your words"
  echo "copied to clipboard. Paste anywhere with Ctrl+V."
  echo ""
  echo "Step 1: Install dependencies"
  echo ""
  echo "  # Ubuntu/Debian:"
  echo "  sudo apt install alsa-utils curl jq xclip libnotify-bin"
  echo ""
  echo "  # Fedora:"
  echo "  sudo dnf install alsa-utils curl jq xclip libnotify"
  echo ""
  echo "  # Arch:"
  echo "  sudo pacman -S alsa-utils curl jq xclip libnotify"
  echo ""
  echo "  # macOS (Homebrew):"
  echo "  brew install sox curl jq"
  echo "  # macOS uses pbcopy for clipboard (built-in, no install needed)"
  echo ""
  echo "Step 2: Get a Groq API key (free)"
  echo ""
  echo "  1. Go to https://console.groq.com/keys"
  echo "  2. Create an API key"
  echo "  3. Add to your shell config:"
  echo ""
  echo "     echo 'export GROQ_API_KEY=\"gsk_your_key\"' >> ~/.bashrc"
  echo ""
  echo "Step 3: Bind to a hotkey"
  echo ""
  echo "  GNOME: Settings → Keyboard → Custom Shortcuts"
  echo "    Name:    Voice Intake"
  echo "    Command: bash $script_path"
  echo "    Key:     F6 (or any key you prefer)"
  echo ""
  echo "  KDE: System Settings → Shortcuts → Custom Shortcuts"
  echo "    Command: bash $script_path"
  echo ""
  echo "  Or bind via dconf (GNOME, scriptable):"
  echo ""
  echo "    dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings \"['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/']\""
  echo "    dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/name \"'Voice Intake'\""
  echo "    dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/binding \"'F6'\""
  echo "    dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/command \"'bash $script_path'\""
  echo ""
  echo "Step 4: Verify"
  echo ""
  echo "  bash $script_path check"
  echo ""
  echo "Step 5: Use it!"
  echo ""
  echo "  Press F6 → speak → press F6 → Ctrl+V to paste"
}

# ─── Key repeat guard ────────────────────────────────────────────────────
guard_key_repeat() {
  if [[ -f "$LOCK_FILE" ]]; then
    local lock_mtime now lock_age
    lock_mtime=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    lock_age=$(( now - lock_mtime ))
    if [[ $lock_age -lt 2 ]]; then
      exit 0
    fi
  fi
  touch "$LOCK_FILE"
}

# ─── Stop recording ──────────────────────────────────────────────────────
stop_recording() {
  local rec_pid
  rec_pid=$(cat "$PID_FILE" 2>/dev/null || true)
  if [[ -n "$rec_pid" ]] && kill -0 "$rec_pid" 2>/dev/null; then
    kill "$rec_pid" 2>/dev/null || true
    sleep 0.3
    rm -f "$PID_FILE"
    notify "⏹ Processing..."
    transcribe_and_copy
  else
    rm -f "$PID_FILE"
  fi
}

# ─── Start recording ─────────────────────────────────────────────────────
start_recording() {
  rm -f "$WAV_FILE" "$PID_FILE"

  # Prefer system arecord (works with PipeWire/PulseAudio natively)
  if [[ -x /usr/bin/arecord ]]; then
    /usr/bin/arecord -q -f S16_LE -r "$SAMPLE_RATE" -c 1 -t wav "$WAV_FILE" >> "$LOG_FILE" 2>&1 &
  elif has_cmd arecord; then
    arecord -q -f S16_LE -r "$SAMPLE_RATE" -c 1 -t wav "$WAV_FILE" >> "$LOG_FILE" 2>&1 &
  elif has_cmd rec; then
    rec -q -r "$SAMPLE_RATE" -c 1 -t wav "$WAV_FILE" >> "$LOG_FILE" 2>&1 &
  else
    notify "❌ No audio recorder (install alsa-utils or sox)"
    exit 1
  fi
  local rec_pid=$!
  echo "$rec_pid" > "$PID_FILE"

  notify "🎙 Recording... (press hotkey to stop)" 60000

  # Auto-stop timer
  (
    sleep "$MAX_SECONDS"
    if kill -0 "$rec_pid" 2>/dev/null; then
      kill "$rec_pid" 2>/dev/null || true
      sleep 0.3
      rm -f "$PID_FILE"
      notify "⏱ Max ${MAX_SECONDS}s reached"
      transcribe_and_copy
    fi
  ) >> "$LOG_FILE" 2>&1 &
}

# ─── Transcribe and copy to clipboard ────────────────────────────────────
transcribe_and_copy() {
  local api_key="${!GROQ_KEY_ENV:-}"

  if [[ -z "$api_key" ]]; then
    notify "❌ GROQ_API_KEY not set — run: bash $0 setup"
    return 1
  fi

  if [[ ! -f "$WAV_FILE" ]] || [[ ! -s "$WAV_FILE" ]]; then
    notify "❌ No audio recorded"
    return 1
  fi

  local response
  response=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.groq.com/openai/v1/audio/transcriptions" \
    -H "Authorization: Bearer $api_key" \
    -F "file=@$WAV_FILE" \
    -F "model=$MODEL" \
    -F "language=$LANGUAGE" \
    -F "response_format=json" \
    2>/dev/null) || true

  local http_code body
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" != "200" ]]; then
    local error_msg
    error_msg=$(echo "$body" | jq -r '.error.message // empty' 2>/dev/null)
    notify "❌ Groq error ($http_code): ${error_msg:-transcription failed}"
    echo "$(date): Groq error $http_code — $body" >> "$LOG_FILE"
    rm -f "$WAV_FILE"
    return 1
  fi

  local text
  text=$(echo "$body" | jq -r '.text // empty' 2>/dev/null)

  if [[ -z "$text" ]]; then
    notify "❌ Empty transcription"
    rm -f "$WAV_FILE"
    return 1
  fi

  # Copy to clipboard
  if has_cmd xclip; then
    echo -n "$text" | xclip -selection clipboard
  elif has_cmd xsel; then
    echo -n "$text" | xsel --clipboard --input
  elif has_cmd wl-copy; then
    echo -n "$text" | wl-copy
  elif has_cmd pbcopy; then
    echo -n "$text" | pbcopy
  else
    notify "⚠️ No clipboard tool — $text" 10000
    rm -f "$WAV_FILE"
    return 1
  fi

  notify "📋 Voice copied — Ctrl+V to paste" 3000
  rm -f "$WAV_FILE"
  echo "$(date): Transcribed: $text" >> "$LOG_FILE"
}

# ─── Main ─────────────────────────────────────────────────────────────────
load_config

case "${1:-}" in
  check)  cmd_check; exit 0 ;;
  setup)  cmd_setup; exit 0 ;;
esac

guard_key_repeat

if [[ -f "$PID_FILE" ]]; then
  stop_recording
else
  start_recording
fi
