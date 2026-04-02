import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const STATE_FILE = '/tmp/tts-state';
const PID_FILE   = '/tmp/tts-pid';

const ICONS = { idle: '🔇', thinking: '🤔', speaking: '🔊' };

// ─── Indicator ───────────────────────────────────────────────────────────────

const TTSIndicator = GObject.registerClass(
class TTSIndicator extends PanelMenu.Button {
    _init(settings, extensionPath) {
        super._init(0.0, 'Piper TTS', false);
        this._settings = settings;
        this._extensionPath = extensionPath;
        this._state = 'idle';
        this._spokenText = '';

        this._label = new St.Label({
            text: ICONS.idle,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 16px; padding: 0 4px;',
        });
        this.add_child(this._label);

        // ── Menu ──
        this._statusItem = new PopupMenu.PopupMenuItem(_('TTS: Idle'), { reactive: false });
        this.menu.addMenuItem(this._statusItem);

        this._textItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._textItem.visible = false;
        this.menu.addMenuItem(this._textItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const stopItem = new PopupMenu.PopupMenuItem(_('⏹ Stop speaking'));
        stopItem.connect('activate', () => this._stop());
        this.menu.addMenuItem(stopItem);

        const prefsItem = new PopupMenu.PopupMenuItem(_('⚙ Settings…'));
        prefsItem.connect('activate', () => this._openPrefs());
        this.menu.addMenuItem(prefsItem);

        this._startPolling();
    }

    _startPolling() {
        this._pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _poll() {
        try {
            const file = Gio.File.new_for_path(STATE_FILE);
            const [ok, contents] = file.load_contents(null);
            if (!ok) { this._setState('idle', ''); return; }

            const raw = new TextDecoder().decode(contents).trim();
            let state = raw, text = '';
            if (raw.startsWith('speaking:')) { state = 'speaking'; text = raw.slice(9); }

            if (state !== this._state || text !== this._spokenText)
                this._setState(state, text);
        } catch (_e) {
            if (this._state !== 'idle') this._setState('idle', '');
        }
    }

    _setState(state, text) {
        this._state = state;
        this._spokenText = text;
        this._label.set_text(ICONS[state] ?? ICONS.idle);
        const labels = { idle: _('TTS: Idle'), thinking: _('TTS: Thinking…'), speaking: _('TTS: Speaking') };
        this._statusItem.label.set_text(labels[state] ?? labels.idle);
        if (state === 'speaking' && text) {
            this._textItem.label.set_text(`"${text}${text.length >= 80 ? '…' : ''}"`);
            this._textItem.visible = true;
        } else {
            this._textItem.visible = false;
        }
    }

    _stop() {
        GLib.spawn_command_line_async(
            `bash -c "kill $(cat ${PID_FILE} 2>/dev/null) 2>/dev/null; echo idle > ${STATE_FILE}"`
        );
    }

    _openPrefs() {
        // Use the extension object's openPreferences
        try {
            GLib.spawn_command_line_async(
                `gnome-extensions prefs piper-tts@gchiqo`
            );
        } catch(e) { logError(e); }
    }

    destroy() {
        if (this._pollSource) { GLib.Source.remove(this._pollSource); this._pollSource = null; }
        super.destroy();
    }
});

// ─── Extension ───────────────────────────────────────────────────────────────

export default class TTSExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new TTSIndicator(this._settings, this.path);
        Main.panel.addToStatusArea('tts-indicator', this._indicator, 1, 'right');
        this._bindShortcut();
        this._settings.connect('changed::shortcut', () => {
            this._unbindShortcut();
            this._bindShortcut();
        });
    }

    disable() {
        this._unbindShortcut();
        if (this._indicator) { this._indicator.destroy(); this._indicator = null; }
        this._settings = null;
    }

    _bindShortcut() {
        Main.wm.addKeybinding(
            'shortcut',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._speak()
        );
    }

    _unbindShortcut() {
        Main.wm.removeKeybinding('shortcut');
    }

    _speak() {
        const s = this._settings;

        // resolve ~ paths
        const expand = p => p.replace(/^~/, GLib.get_home_dir());

        const engine     = s.get_string('engine');
        const piperBin   = expand(s.get_string('piper-bin'));
        const voicePath  = expand(s.get_string('voice-path'));
        const speed      = s.get_double('speed');
        const noise      = s.get_double('noise-scale');
        const noiseW     = s.get_double('noise-w');
        const espVoice   = s.get_string('espeak-voice');
        const espSpeed   = s.get_int('espeak-speed');
        const espPitch   = s.get_int('espeak-pitch');

        // length-scale = 1/speed
        const lengthScale = (1.0 / speed).toFixed(3);

        const script = `
set -e
STATE=/tmp/tts-state
PID_FILE=/tmp/tts-pid

# kill existing
[ -f "$PID_FILE" ] && kill "$(cat $PID_FILE)" 2>/dev/null; rm -f "$PID_FILE"

echo thinking > "$STATE"

# get primary selection
TEXT="$(wl-paste --primary --no-newline 2>/dev/null)"
if [ -z "$TEXT" ]; then
  notify-send "TTS" "No text selected" --icon=audio-volume-muted
  echo idle > "$STATE"
  exit 0
fi

SHORT="$(echo "$TEXT" | head -c 80)"
echo "speaking:$SHORT" > "$STATE"

ENGINE="${engine}"
if [ "$ENGINE" = "piper" ] && [ -x "${piperBin}" ] && [ -f "${voicePath}" ]; then
  echo "$TEXT" | "${piperBin}" \\
    --model "${voicePath}" \\
    --length-scale ${lengthScale} \\
    --noise-scale ${noise} \\
    --noise-w ${noiseW} \\
    --output-raw 2>/dev/null \\
  | aplay -r 22050 -f S16_LE -t raw - 2>/dev/null &
else
  espeak-ng -v "${espVoice}" -s ${espSpeed} -p ${espPitch} -- "$TEXT" &
fi

echo $! > "$PID_FILE"
wait $!
rm -f "$PID_FILE"
echo idle > "$STATE"
`.trim();

        try {
            GLib.spawn_command_line_async(`bash -c '${script.replace(/'/g, `'"'"'`)}'`);
        } catch(e) {
            logError(e, 'TTS speak failed');
        }
    }
}
