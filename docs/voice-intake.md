# Voice Intake — Push-to-Talk Voice Input

Two ways to use voice in the agentic SDLC:

| Tool | Best for | How |
|------|----------|-----|
| **Claude Code `/voice`** | Talking directly to Claude | Type `/voice`, hold spacebar, speak, release |
| **`voice-intake-toggle.sh`** | Voice-to-clipboard for **any app** (Paperclip, browser, editor, Slack, etc.) | Bind to F6, press to record, press again to stop, Ctrl+V to paste |

## Voice-to-Clipboard Tool

### How It Works

```
Press F6 → 🎙 recording → Press F6 → ⏹ transcribes via Groq → 📋 copied to clipboard → Ctrl+V anywhere
```

No terminal window opens. Desktop notifications show recording state. The transcribed text lands on your clipboard ready to paste into any application.

### Quick Start

```bash
# 1. Install dependencies
sudo apt install alsa-utils curl jq xclip libnotify-bin   # Ubuntu/Debian
sudo dnf install alsa-utils curl jq xclip libnotify        # Fedora
sudo pacman -S alsa-utils curl jq xclip libnotify          # Arch

# 2. Get a free Groq API key at https://console.groq.com/keys
echo 'export GROQ_API_KEY="gsk_your_key"' >> ~/.bashrc
source ~/.bashrc

# 3. Verify everything works
bash agents/voice-intake-toggle.sh check

# 4. Bind to F6 (or run the interactive setup)
bash agents/voice-intake-toggle.sh setup
```

### Keybinding Setup

#### GNOME (recommended)
```bash
# One-liner via dconf:
SCRIPT="bash $(realpath agents/voice-intake-toggle.sh)"
dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings \
  "['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/']"
dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/name "'Voice Intake'"
dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/binding "'F6'"
dconf write /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/command "'$SCRIPT'"
```

Or: Settings → Keyboard → Custom Shortcuts → Add:
- **Name:** Voice Intake
- **Command:** `bash ~/agentic-sdlc/agents/voice-intake-toggle.sh`
- **Key:** F6

#### KDE
System Settings → Shortcuts → Custom Shortcuts → Add:
- **Command:** `bash ~/agentic-sdlc/agents/voice-intake-toggle.sh`

### Configuration

Edit `agents/voice-config.json`:
```json
{
  "model": "whisper-large-v3-turbo",
  "language": "en",
  "maxSeconds": 120,
  "sampleRate": 16000,
  "groqApiKeyEnv": "GROQ_API_KEY"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `model` | `whisper-large-v3-turbo` | Groq Whisper model (fast, accurate) |
| `language` | `en` | Language code for transcription |
| `maxSeconds` | `120` | Auto-stop recording after this many seconds |
| `sampleRate` | `16000` | Audio sample rate (16kHz optimal for Whisper) |
| `groqApiKeyEnv` | `GROQ_API_KEY` | Environment variable name for API key |

### Commands

```bash
voice-intake-toggle.sh          # Toggle recording (bind to hotkey)
voice-intake-toggle.sh check    # Verify all dependencies
voice-intake-toggle.sh setup    # Interactive setup guide
```

### Privacy

- **Groq Whisper** runs the model on Groq's infrastructure — audio is sent to Groq's API for transcription
- Groq does not use customer data for training ([Groq privacy policy](https://groq.com/privacy-policy/))
- No OpenAI dependency — this project avoids OpenAI services entirely
- Audio files are deleted immediately after transcription

## Claude Code Native Voice

If you're already in Claude Code, use the built-in voice mode:

```
/voice
```

Then hold **spacebar** to talk, release to send. Transcription tokens are free and don't count against rate limits. This is the simplest option when you're already in a Claude Code session.

## Troubleshooting

### No microphone detected
- Check `arecord -l` for capture devices
- Ensure PulseAudio/PipeWire is running: `systemctl --user status pipewire`
- Try `pavucontrol` to configure input device

### GROQ_API_KEY not set
- Get a key at https://console.groq.com/keys
- Add to shell config: `echo 'export GROQ_API_KEY="gsk_..."' >> ~/.bashrc`
- The script reads from `~/.bashrc`, `~/.zshrc`, `~/.profile`, or `~/.bash_profile`

### F6 doesn't do anything
- Verify binding exists: `dconf dump /org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/`
- Check the log: `cat /tmp/voice-intake.log`
- Test manually: `bash ~/agentic-sdlc/agents/voice-intake-toggle.sh check`

### Homebrew sox doesn't record
- Homebrew's sox/rec can't find PipeWire ALSA plugins
- The script prefers system `arecord` for this reason
- Install system package: `sudo apt install alsa-utils`

### Transcription quality
- Speak clearly, close to the mic
- Reduce background noise
- Whisper handles accents well but may struggle with very technical jargon
- For coding terms, consider using Claude Code's `/voice` which is tuned for programming vocabulary
