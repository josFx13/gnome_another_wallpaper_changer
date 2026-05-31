import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const TIMER = {
    seconds: 0,
    minutes: 0,
    hours: 1,
    running: true,
    toSeconds() {
        return (this.minutes * 60) + (this.hours * 3600) + this.seconds;
    }
};


const WallpaperChangerEntry = GObject.registerClass(
    { GTypeName: 'WallpaperChangerEntry' },
    class WallpaperChangerEntry extends PanelMenu.Button {
        _init(extension) {
            super._init(0.0, 'Wallpaper Changer');

            this._extension = extension;
            const settings = this._settings = extension.getSettings();
            this._uisettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' })

            const icon = new St.Icon({ icon_name: 'preferences-desktop-wallpaper-symbolic', style_class: 'system-status-icon' });
            this.add_child(icon);

            const prevtItem = new PopupMenu.PopupImageMenuItem('Previous Wallpaper', "media-seek-backward-symbolic", {})
            const nextItem = new PopupMenu.PopupImageMenuItem('Next Wallpaper', "media-seek-forward-symbolic", {})
            const pauseItem = new PopupMenu.PopupImageMenuItem('Pause', "media-playback-pause-symbolic", {});
            const settingsItem = new PopupMenu.PopupImageMenuItem('Settings', "preferences-system-symbolic", {});

            this.menu.addMenuItem(prevtItem);
            this.menu.addMenuItem(pauseItem);
            this.menu.addMenuItem(nextItem);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(settingsItem);

            settingsItem.connect('activate', () => {
                try { this._extension.openPreferences() } catch (error) {
                    //log(error)
                }
            })
            prevtItem.connect('activate', () => this._prevWallpaper());
            nextItem.connect('activate', () => this._nextWallpaper());
            pauseItem.connect('activate', () => this._pauseToggle(pauseItem));

            this.settingsIds = [
                settings.connect('changed::minutes', () => this._applyTimer()),
                settings.connect('changed::hours', () => this._applyTimer()),
                settings.connect('changed::seconds', () => this._applyTimer()),
                //settings.connect('changed::same-folder', () => { this.provider._applySettings() }),
                settings.connect('changed::folder-light', (setts, callerEv) => { this._reload_provider(callerEv) }),
                settings.connect('changed::folder-dark', (setts, callerEv) => { this._reload_provider(callerEv) })
            ]

            this.settingsIdsExtra = [
                this._uisettings.connect('changed::color-scheme', (setts, callerEv) => { this._reload_provider(callerEv) }),
            ]

            this.provider = new FxWallpaper({ 'settings-path': this._getThemeFolderSelected(), 'extension': extension })
            this._applyProvider();

        }
        _getThemeFolderSelected() {
            return this._uisettings.get_string("color-scheme") == "default" ? 'folder-light' : 'folder-dark'
        }

        _reload_provider(caller) {
            let currentThemeFolder = this._getThemeFolderSelected()
            // console.log('Event', caller)
            //if (this.provider.foldersource == caller) return
            switch (caller) {
                case "folder-light":
                    if (this.provider.foldersource != currentThemeFolder && TIMER.running)
                        return

                    this.provider._applySettings()
                    this._nextWallpaper()

                    break
                case "folder-dark":
                    if (this.provider.foldersource != currentThemeFolder && TIMER.running)
                        return

                    this.provider._applySettings()
                    this._nextWallpaper()
                    break
                case "color-scheme":
                    const light = this._settings.get_string("folder-light")
                    const dark = this._settings.get_string("folder-dark")
                    if (light == dark) return

                    this.provider._applySettings(currentThemeFolder)
                    this._nextWallpaper()
                    break
            }
        }

        _prevWallpaper() {
            // console.log('Fetching previuos wallpaper...');
            this._resetTimer();
            this.provider.previous((p) => { this._setWallpaper(p) });
        }

        _nextWallpaper() {
            // console.log('Fetching next wallpaper...');
            this.provider.next((p) => { this._setWallpaper(p) });

        }

        _pauseToggle(pauseItem) {
            TIMER.running = !TIMER.running;
            pauseItem.label.set_text(TIMER.running ? "Pause" : "Play");
            pauseItem._icon.icon_name = TIMER.running ? "media-playback-pause-symbolic" : "media-playback-start-symbolic"
            this._resetTimer();
        }

        _applyProvider() {
            this._applyTimer()
            this._nextWallpaper()
            this._resetTimer()

        }

        _applyTimer() {
            TIMER.hours = this._extension.getSettings().get_int('hours')
            TIMER.minutes = this._extension.getSettings().get_int('minutes')
            TIMER.seconds = this._extension.getSettings().get_int('seconds')
            this._resetTimer();
        }

        _resetTimer() {
            if (this._timerId) {
                GLib.Source.remove(this._timerId);
                this._timerId = null;
            }

            if (TIMER.running && TIMER.toSeconds() > 0 && this.provider.wallpapers.length > 0) {
                this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TIMER.toSeconds(), () => {
                    this._nextWallpaper();
                    return GLib.SOURCE_CONTINUE; // Keep timer running
                });
            }
        }

        _setWallpaper(path) {

            const background_setting = new Gio.Settings({ schema: 'org.gnome.desktop.background' });

            let written = false
            if (background_setting.is_writable('picture-uri'))
                written |= background_setting.set_string('picture-uri', 'file://' + path)

            if (background_setting.is_writable('picture-uri-dark'))
                written |= background_setting.set_string('picture-uri-dark', 'file://' + path)

            Gio.Settings.sync();
        }

        destroy() {
            if (this.provider) this.provider.destroyMonitor()
            if (this._timerId) GLib.Source.remove(this._timerId)
            if (this.settingsIds) this.settingsIds.forEach(e => this._settings.disconnect(e))
            if (this.settingsIdsExtra) this.settingsIdsExtra.forEach(e => this._uisettings.disconnect(e))
            super.destroy();
        }
    }
);

export default class WallpaperExtension extends Extension {
    enable() {
        this._indicator = new WallpaperChangerEntry(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}

class FxWallpaper {

    constructor({ ...props }) {

        this.wallpapers = []
        this.imagepath = ''
        this['current-wallpaper'] = ''

        this.foldersource = props["settings-path"];
        this.extension = props.extension; // context
        this.monitor = null

        this._applySettings();
    }

    _applySettings(themeFolderSource) { // Only needed if more calls
        if (themeFolderSource)
            this.foldersource = themeFolderSource
        this._setupWallpaperDir()
    }

    _setRandomStart() {

        let max = this.wallpapers.length
        let min = 0
        let randomStart = Math.floor(Math.random() * (max - min + 1)) + min
        this.set(this.wallpapers[randomStart])
        //console.log("============",randomStart, this.get())
    }

    _setupWallpaperDir() {
        this.imagepath = this.extension.getSettings().get_string(this.foldersource)
        this.destroyMonitor()
        const sfolder = Gio.File.new_for_path(this.imagepath)
        // console.log('setup wallpaper dir path', this.imagepath)

        if (sfolder.query_exists(null)) {
            this.monitor = sfolder.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null)

            this.monitorEvId = this.monitor.connect('changed', (_fileMonitor, file, otherFile, eventType) => {
                // log({ _fileMonitor, file, otherFile, eventType })
                // log(Gio.FileMonitorEvent.CHANGED, Gio.FileMonitorEvent.MOVED_OUT, Gio.FileMonitorEvent.MOVED_IN, Gio.FileMonitorEvent.)

                switch (eventType) {
                    case Gio.FileMonitorEvent.DELETED:
                        this.destroyMonitor()
                        this.wallpapers = []

                        break;
                    case Gio.FileMonitorEvent.CREATED:

                        break;

                    case Gio.FileMonitorEvent.CHANGED:
                    case Gio.FileMonitorEvent.MOVED_IN:
                    case Gio.FileMonitorEvent.MOVED_OUT:
                        //console.log(`${otherFile.get_basename()} was moved of the directory`);
                        this.wallpapers = this._listImageFiles(this.imagepath)
                        break;
                }
            });
            this.wallpapers = this._listImageFiles(this.imagepath)
            this._setRandomStart()
            // console.log(this.wallpapers)
        }

    }


    _listImageFiles(xpath) {
        let images = []
        let file = Gio.File.new_for_path(xpath);

        let enumerator = file.enumerate_children('standard::name,standard::type,standard::content-type', Gio.FileQueryInfoFlags.NONE, null);

        let info;
        while ((info = enumerator.next_file(null))) {
            let fileType = info.get_file_type();
            let contentType = info.get_content_type();
            let fileName = info.get_name();

            if (fileType === Gio.FileType.REGULAR && contentType.startsWith('image/')) {
                images.push(fileName)
            }
        }
        return images
    }

    next(callback) {
        let ci = this.wallpapers.indexOf(this.get())
        let ni = ci + 1
        if (ni >= this.wallpapers.length)
            ni = 0

        this.set(this.wallpapers[ni]);
        callback(this.imagepath + '/' + this.get())
    }

    previous(callback) {
        let ci = this.wallpapers.indexOf(this.get())
        let ni = ci - 1
        if (ni <= 0)
            ni = this.wallpapers.length - 1

        this.set(this.wallpapers[ni]);
        callback(this.imagepath + '/' + this.get())
    }


    get() {
        return this["current-wallpaper"]
    }
    set(value) {
        this["current-wallpaper"] = value
    }


    destroyMonitor() {
        if (this.monitor) {
            if (!!this.monitorEvId) {
                this.monitor.disconnect(this.monitorEvId)
                this.monitorEvId = null
            }
            this.monitor.cancel()
        }

    }

}
