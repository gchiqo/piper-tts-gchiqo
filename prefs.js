import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function expandPath(p) {
    return p.replace(/^~/, GLib.get_home_dir());
}

/** Return [{name, path}] for all .onnx files under dir */
function scanVoices(dir) {
    const voices = [];
    try {
        const d = Gio.File.new_for_path(expandPath(dir));
        const en = d.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = en.next_file(null)) !== null) {
            const name = info.get_name();
            if (name.endsWith('.onnx')) {
                voices.push({
                    name: name.replace('.onnx', ''),
                    path: `${dir}/${name}`,
                });
            }
        }
        voices.sort((a, b) => a.name.localeCompare(b.name));
    } catch (_e) {}
    return voices;
}

function friendlyName(raw) {
    // en_US-lessac-high → 🇺🇸 Lessac (High) US
    const m = raw.match(/^(en_US|en_GB|en_AU|en_CA|en_IN)-([^-]+)-?(.*)?$/i);
    if (!m) return raw;
    const flags = { en_US: '🇺🇸', en_GB: '🇬🇧', en_AU: '🇦🇺', en_CA: '🇨🇦', en_IN: '🇮🇳' };
    const flag = flags[m[1]] ?? '🌐';
    const voice = m[2].charAt(0).toUpperCase() + m[2].slice(1);
    const qual  = m[3] ? ` (${m[3].charAt(0).toUpperCase() + m[3].slice(1)})` : '';
    return `${flag} ${voice}${qual}`;
}

// ── Prefs ─────────────────────────────────────────────────────────────────────

export default class TTSPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s = this.getSettings();
        window._settings = s;
        window.set_default_size(640, 640);

        // ── Page: Voice ──────────────────────────────────────────────────────
        const voicePage = new Adw.PreferencesPage({
            title: _('Voice'),
            icon_name: 'audio-speakers-symbolic',
        });
        window.add(voicePage);

        // Engine group
        const engineGroup = new Adw.PreferencesGroup({ title: _('Engine') });
        voicePage.add(engineGroup);

        const engineRow = new Adw.ComboRow({ title: _('Engine'), subtitle: _('Piper (neural) or eSpeak (robotic fallback)') });
        const engineModel = new Gtk.StringList();
        engineModel.append('piper');
        engineModel.append('espeak');
        engineRow.set_model(engineModel);
        engineRow.set_selected(s.get_string('engine') === 'espeak' ? 1 : 0);
        engineRow.connect('notify::selected', () => {
            s.set_string('engine', engineRow.selected === 1 ? 'espeak' : 'piper');
        });
        engineGroup.add(engineRow);

        // Piper voice group
        const piperGroup = new Adw.PreferencesGroup({ title: _('Piper Voice') });
        voicePage.add(piperGroup);

        // Voices dir
        const voicesDirRow = new Adw.EntryRow({
            title: _('Voices directory'),
            text: s.get_string('voices-dir'),
            show_apply_button: true,
        });
        voicesDirRow.connect('apply', () => {
            s.set_string('voices-dir', voicesDirRow.get_text());
            this._refreshVoiceList(voiceRow, voiceModel, s);
        });
        piperGroup.add(voicesDirRow);

        // Voice picker
        const voiceRow = new Adw.ComboRow({ title: _('Active voice') });
        const voiceModel = new Gtk.StringList();
        piperGroup.add(voiceRow);
        this._refreshVoiceList(voiceRow, voiceModel, s);
        voiceRow.connect('notify::selected', () => {
            const voices = scanVoices(s.get_string('voices-dir'));
            if (voices[voiceRow.selected])
                s.set_string('voice-path', voices[voiceRow.selected].path);
        });

        // Piper binary
        const binRow = new Adw.EntryRow({
            title: _('Piper binary path'),
            text: s.get_string('piper-bin'),
            show_apply_button: true,
        });
        binRow.connect('apply', () => s.set_string('piper-bin', binRow.get_text()));
        piperGroup.add(binRow);

        // eSpeak group
        const espeakGroup = new Adw.PreferencesGroup({ title: _('eSpeak (fallback)') });
        voicePage.add(espeakGroup);

        const esVoiceRow = new Adw.EntryRow({
            title: _('eSpeak voice'),
            text: s.get_string('espeak-voice'),
            show_apply_button: true,
        });
        esVoiceRow.connect('apply', () => s.set_string('espeak-voice', esVoiceRow.get_text()));
        espeakGroup.add(esVoiceRow);

        const esSpeedRow = this._makeSpinRow(_('Speed (WPM)'), s, 'espeak-speed', 80, 450, 10);
        espeakGroup.add(esSpeedRow);

        const esPitchRow = this._makeSpinRow(_('Pitch'), s, 'espeak-pitch', 0, 99, 5);
        espeakGroup.add(esPitchRow);

        // ── Page: Speed & Quality ────────────────────────────────────────────
        const speedPage = new Adw.PreferencesPage({
            title: _('Speed & Quality'),
            icon_name: 'preferences-system-time-symbolic',
        });
        window.add(speedPage);

        const speedGroup = new Adw.PreferencesGroup({ title: _('Piper Tuning') });
        speedPage.add(speedGroup);

        speedGroup.add(this._makeScaleRow(
            _('Speaking speed'),
            _('0.5 = slow · 1.0 = normal · 2.0 = fast'),
            s, 'speed', 0.5, 2.0, 0.05
        ));

        speedGroup.add(this._makeScaleRow(
            _('Expressiveness (noise scale)'),
            _('Higher = more variation in voice'),
            s, 'noise-scale', 0.0, 1.0, 0.05
        ));

        speedGroup.add(this._makeScaleRow(
            _('Duration variation (noise-w)'),
            _('Higher = more natural rhythm variation'),
            s, 'noise-w', 0.0, 1.0, 0.05
        ));

        // ── Page: Shortcut ───────────────────────────────────────────────────
        const shortcutPage = new Adw.PreferencesPage({
            title: _('Shortcut'),
            icon_name: 'preferences-desktop-keyboard-symbolic',
        });
        window.add(shortcutPage);

        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Keyboard Shortcut'),
            description: _('Shortcut to speak the currently selected text'),
        });
        shortcutPage.add(shortcutGroup);

        const currentShortcut = s.get_strv('shortcut')[0] ?? '<Shift><Super>a';

        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: currentShortcut,
            valign: Gtk.Align.CENTER,
        });

        const shortcutRow = new Adw.ActionRow({
            title: _('Speak selected text'),
            activatable: false,
        });
        shortcutRow.add_suffix(shortcutLabel);
        shortcutGroup.add(shortcutRow);

        const editRow = new Adw.EntryRow({
            title: _('Set shortcut (e.g. <Shift><Super>a)'),
            text: currentShortcut,
            show_apply_button: true,
        });
        editRow.connect('apply', () => {
            const val = editRow.get_text().trim();
            if (val) {
                s.set_strv('shortcut', [val]);
                shortcutLabel.set_accelerator(val);
            }
        });
        shortcutGroup.add(editRow);

        const resetRow = new Adw.ActionRow({ title: _('Reset to default (<Shift><Super>a)') });
        const resetBtn = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetBtn.connect('clicked', () => {
            s.set_strv('shortcut', ['<Shift><Super>a']);
            shortcutLabel.set_accelerator('<Shift><Super>a');
            editRow.set_text('<Shift><Super>a');
        });
        resetRow.add_suffix(resetBtn);
        shortcutGroup.add(resetRow);
    }

    _refreshVoiceList(row, model, s) {
        // Rebuild model
        const voices = scanVoices(s.get_string('voices-dir'));
        // Clear by creating new model
        const newModel = new Gtk.StringList();
        let activeIdx = 0;
        const activePath = s.get_string('voice-path');
        voices.forEach((v, i) => {
            newModel.append(friendlyName(v.name));
            if (expandPath(v.path) === expandPath(activePath) || v.path === activePath)
                activeIdx = i;
        });
        if (voices.length === 0) newModel.append(_('No voices found'));
        row.set_model(newModel);
        row.set_selected(activeIdx);
    }

    _makeScaleRow(title, subtitle, s, key, min, max, step) {
        const row = new Adw.ActionRow({ title, subtitle });
        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: min, upper: max, step_increment: step }),
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            digits: 2,
            hexpand: true,
            valign: Gtk.Align.CENTER,
            width_request: 280,
        });
        scale.set_value(s.get_double(key));
        scale.connect('value-changed', () => s.set_double(key, scale.get_value()));
        s.connect(`changed::${key}`, () => {
            if (Math.abs(scale.get_value() - s.get_double(key)) > 0.001)
                scale.set_value(s.get_double(key));
        });
        row.add_suffix(scale);
        return row;
    }

    _makeSpinRow(title, s, key, min, max, step) {
        const row = new Adw.SpinRow({
            title,
            adjustment: new Gtk.Adjustment({ lower: min, upper: max, step_increment: step }),
        });
        row.set_value(s.get_int(key));
        row.connect('notify::value', () => s.set_int(key, row.get_value()));
        return row;
    }
}
