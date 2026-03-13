#!/usr/bin/env bash
# voice-intake.sh — Push-to-talk voice input via Groq Whisper API
#
# Usage:
#   voice-intake.sh                    # Record → transcribe → type into active window
#   voice-intake.sh --mode clip        # Record → transcribe → clipboard
#   voice-intake.sh --mode mailbox     # Record → transcribe → pm/voice-inbox.md
#   voice-intake.sh --mode stdout      # Record → transcribe → print
#   voice-intake.sh check              # Verify dependencies
#   voice-intake.sh install-key        # Set up F6 key binding
#
# Requires: curl, jq, arecord or rec (sox)
# Optional: xdotool (X11), wtype (Wayland), xclip/xsel/wl-copy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/voice-config.json"
TMPFILE="/tmp/voice-intake-$$.wav"
PID_FILE="/tmp/voice-intake.pid"

# ─── Defaults ───────────────────────────────────────────────────────────────
DEFAULT_KEY="F6"
DEFAULT_MODE="type"
DEFAULT_MODEL="whisper-large-v3-turbo"
DEFAULT_LANGUAGE="en"
DEFAULT_MAX_SECONDS=120
DEFAULT_AUTO_SUBMIT=true
DEFAULT_SAMPLE_RATE=16000
DEFAULT_MAILBOX="pm/voice-inbox.md"

# ─── Load config ────────────────────────────────────────────────────────────
load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    KEY=$(jq -r '.key // empty' "$CONFIG_FILE" 2>/dev/null || true)
    MODE=$(jq -r '.mode // empty' "$CONFIG_FILE" 2>/dev/null || true)
    MODEL=$(jq -r '.model // empty' "$CONFIG_FILE" 2>/dev/null || true)
    LANGUAGE=$(jq -r '.language // empty' "$CONFIG_FILE" 2>/dev/null || true)
    MAX_SECONDS=$(jq -r '.maxSeconds // empty' "$CONFIG_FILE" 2>/dev/null || true)
    AUTO_SUBMIT=$(jq -r '.autoSubmit // empty' "$CONFIG_FILE" 2>/dev/null || true)
    SAMPLE_RATE=$(jq -r '.sampleRate // empty' "$CONFIG_FILE" 2>/dev/null || true)
    MAILBOX_PATH=$(jq -r '.mailboxPath // empty' "$CONFIG_FILE" 2>/dev/null || true)
    GROQ_KEY_ENV=$(jq -r '.groqApiKeyEnv // empty' "$CONFIG_FILE" 2>/dev/null || true)
  fi

  # Apply defaults for anything not set
  KEY="${KEY:-$DEFAULT_KEY}"
  MODE="${MODE:-$DEFAULT_MODE}"
  MODEL="${MODEL:-$DEFAULT_MODEL}"
  LANGUAGE="${LANGUAGE:-$DEFAULT_LANGUAGE}"
  MAX_SECONDS="${MAX_SECONDS:-$DEFAULT_MAX_SECONDS}"
  AUTO_SUBMIT="${AUTO_SUBMIT:-$DEFAULT_AUTO_SUBMIT}"
  SAMPLE_RATE="${SAMPLE_RATE:-$DEFAULT_SAMPLE_RATE}"
  MAILBOX_PATH="${MAILBOX_PATH:-$DEFAULT_MAILBOX}"
  GROQ_KEY_ENV="${GROQ_KEY_ENV:-GROQ_API_KEY}"
}

# ─── CLI flag overrides ─────────────────────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)   MODE="$2"; shift 2 ;;
      --key)    KEY="$2"; shift 2 ;;
      --config) CONFIG_FILE="$2"; shift 2 ;;
      --no-submit) AUTO_SUBMIT=false; shift ;;
      check)    cmd_check; exit 0 ;;
      install-key) cmd_install_key; exit 0 ;;
      *)        shift ;;
    esac
  done
}

# ─── Dependency check ───────────────────────────────────────────────────────
has_cmd() { command -v "$1" &>/dev/null; }

cmd_check() {
  echo "🔍 Voice Intake — Dependency Check"
  echo "─────────────────────────────────────"

  local ok=true

  # Required
  for cmd in curl jq; do
    if has_cmd "$cmd"; then
      echo "  ✅ $cmd"
    else
      echo "  ❌ $cmd — required. Install: sudo apt install $cmd"
      ok=false
    fi
  done

  # Audio capture
  if has_cmd rec; then
    echo "  ✅ rec (sox) — audio capture"
  elif has_cmd arecord; then
    echo "  ✅ arecord (alsa-utils) — audio capture"
  else
    echo "  ❌ No audio capture tool. Install: sudo apt install sox OR alsa-utils"
    ok=false
  fi

  # Text injection
  local session_type="${XDG_SESSION_TYPE:-x11}"
  if [[ "$session_type" == "wayland" ]]; then
    if has_cmd wtype; then
      echo "  ✅ wtype — Wayland text injection"
    elif has_cmd xdotool && [[ -n "${DISPLAY:-}" ]]; then
      echo "  ⚠️  xdotool — works via XWayland (wtype preferred)"
    else
      echo "  ⚠️  No text injection tool (wtype/xdotool). Will fall back to clipboard/stdout."
    fi
    if has_cmd wl-copy; then
      echo "  ✅ wl-copy — Wayland clipboard"
    fi
  else
    if has_cmd xdotool; then
      echo "  ✅ xdotool — X11 text injection"
    else
      echo "  ⚠️  xdotool not found. Will fall back to clipboard/stdout."
    fi
    if has_cmd xclip; then
      echo "  ✅ xclip — X11 clipboard"
    elif has_cmd xsel; then
      echo "  ✅ xsel — X11 clipboard"
    fi
  fi

  # Groq API key
  local api_key_var="${GROQ_KEY_ENV:-GROQ_API_KEY}"
  if [[ -n "${!api_key_var:-}" ]]; then
    echo "  ✅ \$$api_key_var is set"
  else
    echo "  ❌ \$$api_key_var is not set. Export your Groq API key."
    ok=false
  fi

  echo ""
  if $ok; then
    echo "  ✅ All required dependencies present."
  else
    echo "  ❌ Missing required dependencies. Fix the items above."
  fi
}

# ─── Audio capture ──────────────────────────────────────────────────────────
record_audio() {
  echo -e "\033[1;31m🎙 Recording... (press Ctrl+C to stop)\033[0m" >&2

  # Set up auto-stop timer
  (
    sleep "$MAX_SECONDS"
    if [[ -f "$PID_FILE" ]]; then
      local rec_pid
      rec_pid=$(cat "$PID_FILE" 2>/dev/null || true)
      if [[ -n "$rec_pid" ]] && kill -0 "$rec_pid" 2>/dev/null; then
        kill "$rec_pid" 2>/dev/null || true
        echo -e "\n\033[1;33m⏱ Max duration (${MAX_SECONDS}s) reached.\033[0m" >&2
      fi
    fi
  ) &
  local timer_pid=$!

  # Record
  if has_cmd rec; then
    rec -q -r "$SAMPLE_RATE" -c 1 -t wav "$TMPFILE" &
  else
    arecord -q -f S16_LE -r "$SAMPLE_RATE" -c 1 -t wav "$TMPFILE" &
  fi
  local rec_pid=$!
  echo "$rec_pid" > "$PID_FILE"

  # Wait for recording to finish (user Ctrl+C or timer)
  trap "kill $rec_pid 2>/dev/null; kill $timer_pid 2>/dev/null; rm -f '$PID_FILE'" INT TERM
  wait "$rec_pid" 2>/dev/null || true
  kill "$timer_pid" 2>/dev/null || true
  rm -f "$PID_FILE"

  echo -e "\033[1;33m⏹ Processing...\033[0m" >&2
}

# ─── Toggle support (for key binding) ──────────────────────────────────────
toggle_recording() {
  if [[ -f "$PID_FILE" ]]; then
    local rec_pid
    rec_pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "$rec_pid" ]] && kill -0 "$rec_pid" 2>/dev/null; then
      # Recording is active — stop it
      kill "$rec_pid" 2>/dev/null || true
      echo "Stopped recording" >&2
      return 0
    fi
  fi
  # No active recording — this is handled by the normal flow
  return 1
}

# ─── Groq transcription ────────────────────────────────────────────────────
transcribe() {
  local api_key_var="${GROQ_KEY_ENV:-GROQ_API_KEY}"
  local api_key="${!api_key_var:-}"

  if [[ -z "$api_key" ]]; then
    echo "❌ \$$api_key_var is not set. Export your Groq API key." >&2
    return 1
  fi

  if [[ ! -f "$TMPFILE" ]] || [[ ! -s "$TMPFILE" ]]; then
    echo "❌ No audio recorded." >&2
    return 1
  fi

  local response
  local attempt=0
  local max_attempts=2

  while (( attempt < max_attempts )); do
    response=$(curl -s -w "\n%{http_code}" -X POST \
      "https://api.groq.com/openai/v1/audio/transcriptions" \
      -H "Authorization: Bearer $api_key" \
      -F "file=@$TMPFILE" \
      -F "model=$MODEL" \
      -F "language=$LANGUAGE" \
      -F "response_format=json" \
      2>/dev/null) || true

    local http_code
    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" == "200" ]]; then
      local text
      text=$(echo "$body" | jq -r '.text // empty' 2>/dev/null)
      if [[ -n "$text" ]]; then
        echo "$text"
        return 0
      else
        echo "❌ Empty transcription returned." >&2
        return 1
      fi
    elif [[ "$http_code" =~ ^5 ]]; then
      # Server error — retry once
      attempt=$((attempt + 1))
      if (( attempt < max_attempts )); then
        echo "⚠️  Groq API returned $http_code, retrying..." >&2
        sleep 1
      fi
    elif [[ "$http_code" == "429" ]]; then
      echo "❌ Groq API rate limit hit. Wait a moment and try again." >&2
      return 1
    else
      local error_msg
      error_msg=$(echo "$body" | jq -r '.error.message // empty' 2>/dev/null)
      echo "❌ Groq API error ($http_code): ${error_msg:-$body}" >&2
      return 1
    fi
  done

  echo "❌ Groq API failed after $max_attempts attempts." >&2
  return 1
}

# ─── Text routing ───────────────────────────────────────────────────────────
route_text() {
  local text="$1"
  local session_type="${XDG_SESSION_TYPE:-x11}"

  case "$MODE" in
    type)
      if [[ "$session_type" == "wayland" ]]; then
        if has_cmd wtype; then
          wtype -- "$text"
          if [[ "$AUTO_SUBMIT" == "true" ]]; then
            wtype -k Return
          fi
          echo -e "\033[1;32m✅ Typed into active window.\033[0m" >&2
          return 0
        elif has_cmd xdotool && [[ -n "${DISPLAY:-}" ]]; then
          # XWayland fallback
          xdotool type --delay 12 -- "$text"
          if [[ "$AUTO_SUBMIT" == "true" ]]; then
            xdotool key Return
          fi
          echo -e "\033[1;32m✅ Typed into active window (XWayland).\033[0m" >&2
          return 0
        fi
      else
        if has_cmd xdotool; then
          xdotool type --delay 12 -- "$text"
          if [[ "$AUTO_SUBMIT" == "true" ]]; then
            xdotool key Return
          fi
          echo -e "\033[1;32m✅ Typed into active window.\033[0m" >&2
          return 0
        fi
      fi
      # Fall through to clipboard
      echo "⚠️  No typing tool available, falling back to clipboard..." >&2
      MODE="clip"
      route_text "$text"
      ;;

    clip)
      if [[ "$session_type" == "wayland" ]] && has_cmd wl-copy; then
        echo -n "$text" | wl-copy
        echo -e "\033[1;32m📋 Copied to clipboard. Paste with Ctrl+V.\033[0m" >&2
      elif has_cmd xclip; then
        echo -n "$text" | xclip -selection clipboard
        echo -e "\033[1;32m📋 Copied to clipboard. Paste with Ctrl+V.\033[0m" >&2
      elif has_cmd xsel; then
        echo -n "$text" | xsel --clipboard --input
        echo -e "\033[1;32m📋 Copied to clipboard. Paste with Ctrl+V.\033[0m" >&2
      else
        echo "⚠️  No clipboard tool available, falling back to stdout..." >&2
        MODE="stdout"
        route_text "$text"
      fi
      ;;

    mailbox)
      local mailbox_dir
      mailbox_dir=$(dirname "$MAILBOX_PATH")
      mkdir -p "$mailbox_dir"
      local timestamp
      timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      {
        echo ""
        echo "## $timestamp"
        echo ""
        echo "$text"
        echo ""
        echo "---"
      } >> "$MAILBOX_PATH"
      echo -e "\033[1;32m📬 Appended to $MAILBOX_PATH\033[0m" >&2
      ;;

    stdout)
      echo "$text"
      ;;

    *)
      echo "❌ Unknown mode: $MODE" >&2
      return 1
      ;;
  esac
}

# ─── Key binding install ────────────────────────────────────────────────────
cmd_install_key() {
  local script_path
  script_path="$(realpath "${BASH_SOURCE[0]}")"

  echo "🔑 Voice Intake — Key Binding Setup"
  echo "─────────────────────────────────────"
  echo ""
  echo "Binding: $KEY → $script_path"
  echo ""

  # Try keyd first (needs sudo)
  if has_cmd keyd; then
    echo "📝 keyd config (requires sudo):"
    echo ""
    echo "  Add to /etc/keyd/default.conf:"
    echo ""
    echo "  [main]"
    echo "  ${KEY,,} = command($script_path)"
    echo ""
    echo "  Then: sudo keyd reload"
    echo ""
  fi

  # xbindkeys (X11, no sudo)
  if has_cmd xbindkeys || [[ "${XDG_SESSION_TYPE:-}" != "wayland" ]]; then
    local xbrc="$HOME/.xbindkeysrc"
    echo "📝 xbindkeys config (X11, no sudo):"
    echo ""
    echo "  Add to $xbrc:"
    echo ""
    echo "  \"$script_path\""
    echo "    $KEY"
    echo ""

    read -rp "  Write to $xbrc now? [y/N] " answer
    if [[ "${answer,,}" == "y" ]]; then
      {
        echo ""
        echo "# Voice intake — push to talk"
        echo "\"$script_path\""
        echo "  $KEY"
      } >> "$xbrc"
      echo "  ✅ Written to $xbrc"
      echo "  Run: xbindkeys (or restart it if already running)"
    fi
  fi

  # Generic instructions
  echo ""
  echo "📝 Manual / Desktop Environment:"
  echo "  Map $KEY to run: $script_path"
  echo "  In GNOME: Settings → Keyboard → Custom Shortcuts"
  echo "  In KDE: System Settings → Shortcuts → Custom Shortcuts"
  echo ""
  echo "📝 Terminal-only (no key binding):"
  echo "  Just run: $script_path"
  echo "  Or add a bash alias: alias voice='$script_path'"
}

# ─── Cleanup ────────────────────────────────────────────────────────────────
cleanup() {
  rm -f "$TMPFILE" "$PID_FILE"
}
trap cleanup EXIT

# ─── Main ───────────────────────────────────────────────────────────────────
main() {
  load_config
  parse_args "$@"

  # Toggle support: if invoked while already recording, stop the recording
  if toggle_recording 2>/dev/null; then
    exit 0
  fi

  record_audio

  local text
  text=$(transcribe)

  if [[ -z "$text" ]]; then
    echo "❌ No transcription returned." >&2
    exit 1
  fi

  route_text "$text"
}

main "$@"
