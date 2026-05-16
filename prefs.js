import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CustomPreferences extends ExtensionPreferences {
    /**
     * This class is constructed once when your extension preferences are
     * about to be opened. This is a good time to setup translations or anything
     * else you only do once.
     *
     * @param {ExtensionMeta} metadata - An extension meta object
     */
    constructor(metadata) {
        super(metadata);
    }

    _init_settings(builder) {
        const settings = this.getSettings();

        //Bind your settings
        settings.bind('hours', builder.get_object('spinbutton_hours'), 'value', 0);
        settings.bind('minutes', builder.get_object('spinbutton_minutes'), 'value', 0);
        settings.bind('seconds', builder.get_object('spinbutton_seconds'), 'value', 0);


        const folderButtonLight = builder.get_object('button_light')
        const folderLightSubtitle = builder.get_object('folder_light')
        const folderButtonDark = builder.get_object('button_dark')
        const folderDarkSubtitle = builder.get_object('folder_dark')
        const sameSwitch = builder.get_object('same_switch')

        settings.bind('same-folder', sameSwitch, "active", 0);;
        settings.bind('folder-light', folderLightSubtitle, 'subtitle', 0)
        settings.bind('folder-dark', folderDarkSubtitle, 'subtitle', 0)

        folderDarkSubtitle.set_sensitive(!sameSwitch.active)
        sameSwitch.connect("notify::active", (owner, params) => {
            if (sameSwitch.active) {
                const light = settings.get_string('folder-light')
                settings.set_string('folder-dark', light)
            }
            folderDarkSubtitle.set_sensitive(!sameSwitch.active)
        })

        folderLightSubtitle.connect("activated", () => {
            const dialog = new Gtk.FileDialog({ title: 'Select Wallpaper Folder' });

            try {
                dialog.select_folder(null, null, (source, res, data) => {
                    const file = source.select_folder_finish(res)
                    if (file) {
                        const path = file.get_path()
                        console.log('selection', path);
                        settings.set_string('folder-light', path);
                        if (sameSwitch.active)
                            settings.set_string('folder-dark', path);
                    }

                });

            } catch (err) {
                // Handle cancellation or errors (e.g., Gtk.DialogError.CANCELLED)
                console.log('Folder selection cancelled or failed', err);
            }
        })


        folderDarkSubtitle.connect('activated', () => {
            const dialog = new Gtk.FileDialog({ title: 'Select Wallpaper Folder' });

            try {
                dialog.select_folder(null, null, (source, res, data) => {
                    const file = source.select_folder_finish(res)
                    if (file) {
                        const path = file.get_path()
                        console.log('selection', path);
                        settings.set_string('folder-dark', path);
                    }
                });

            } catch (err) {
                console.log('Folder selection cancelled or failed', err);
            }
        })
    }

    /**
     * Fill the preferences window with preferences.
     *
     * If this method is overridden, `getPreferencesWidget()` will NOT be called.
     *
     * @param {Adw.PreferencesWindow} window - the preferences window
     */
    fillPreferencesWindow(window) {

        const settingsbuilder = Gtk.Builder.new_from_file(`${this.path}/layouts/prefs.xml`);
        //const donationsbuilder = Gtk.Builder.new_from_file(`${this.path}/layouts/donations.xml`);

        const prefs_page = settingsbuilder.get_object("prefs_page")
        prefs_page["icon-name"] = 'emblem-system-symbolic'
        this._init_settings(settingsbuilder)
        window.add(prefs_page)
        
    }

    openLink(url) {
        const launcher = new Gtk.UriLauncher({ uri: url });
        launcher.launch(null, null, (source, result) => {
            try {
                source.launch_finish(result);
                console.log(`Successfully opened: ${url}`);
            } catch (e) {
                console.error(`Failed to open link: ${e.message}`);
            }
        });
    }
}