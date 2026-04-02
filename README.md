# Piper TTS — GNOME Shell Extension

Speak selected text using [Piper](https://github.com/rhasspy/piper) neural TTS.  
Press **Shift+Super+A** (configurable) to speak whatever text you have selected.  
Panel icon shows state: 🔇 idle · 🤔 thinking · 🔊 speaking.

## Features

- Neural TTS via Piper (sounds human, works offline)
- eSpeak-ng fallback (no setup needed)
- Panel indicator with state icons
- Click indicator → see what's being spoken, stop playback
- Full preferences window: voice picker, speed/expressiveness sliders, shortcut editor
- Auto-scans your voices folder — drop in any `.onnx` voice and it appears in settings

## Requirements

- GNOME Shell 45–48
- `wl-clipboard` (Wayland clipboard)
- `aplay` (ALSA, usually pre-installed)
- Piper binary + at least one voice model (see setup below)
- OR `espeak-ng` (fallback, no extra setup)

## Quick Setup

### 1. Install system deps
```bash
sudo apt install espeak-ng wl-clipboard  # Debian/Ubuntu
# or: sudo dnf install espeak-ng wl-clipboard
```

### 2. Install Piper binary
```bash
mkdir -p ~/piper && cd ~/piper
wget https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
tar xzf piper_linux_x86_64.tar.gz
```

### 3. Download a voice
```bash
mkdir -p ~/piper/voices && cd ~/piper/voices

# US English female (recommended)
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx.json
```

More voices: https://huggingface.co/rhasspy/piper-voices

### 4. Enable the extension
```bash
gnome-extensions enable piper-tts@gchiqo
```

Then open **Settings → Extensions → Piper TTS → ⚙** to pick your voice and tune speed.

## Available Voices (English)

| Voice | Gender | Accent | Quality | Size |
|-------|--------|--------|---------|------|
| en_US-lessac-high | Female | American | High | 109M |
| en_US-ryan-high | Male | American | High | 116M |
| en_GB-alba-medium | Female | Scottish | Medium | 63M |
| en_GB-cori-high | Female | British RP | High | 109M |

Full list: https://rhasspy.github.io/piper-samples/

## License

MIT
