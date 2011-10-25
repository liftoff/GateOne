// Gate One Internationalization plugin.  Adds some keyboard customization options to the settings panel and loads keyboard maps on demand (so the user doesn't have to download them all every time they connect).
(function(window, undefined) { // Sandbox it all
var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;

// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = null;
var logError = null;
var logWarning = null;
var logInfo = null;
var logDebug = null;

// TODO: Add the ability for users to generate/modify their keys via a GUI

// GateOne.i18n (Internationalization methods)
GateOne.Base.module(GateOne, "i18n", "0.9", ['Base']);
GateOne.Base.update(GateOne.i18n, {
    init: function() {
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        logFatal = GateOne.Logging.logFatal || noop;
        logError = GateOne.Logging.logError || noop;
        logWarning = GateOne.Logging.logWarning || noop;
        logInfo = GateOne.Logging.logInfo || noop;
        logDebug = GateOne.Logging.logDebug || noop;
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            prefsTable1 = u.getNode('#'+prefix+'prefs_tablediv1'),
            infoPanel = u.getNode('#'+prefix+'panel_info'),
            h3 = u.createElement('h3'),
            prefsPanelKeyboardLayoutLabel = u.createElement('span', {'id': prefix+'prefs_key_layout_label', 'style': {'display': 'table-cell', 'float': 'left'}}),
            prefsPanelKeyboardLayout = u.createElement('select', {'id': prefix+'prefs_key_layout', 'name': prefix+'prefs_theme', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelRow = u.createElement('div', {'class': prefix+'paneltablerow'}),
            enumerateLayouts = function(jsonObj) {
                // Meant to be called from the xhrGet() below
                logInfo(jsonObj);
                var decoded = JSON.parse(jsonObj),
                    layoutsList = decoded['layouts'],
                    keyboardLayoutSelect = u.getNode('#'+prefix+'prefs_key_layout');
                keyboardLayoutSelect.options.length = 0;
                for (var i in layoutsList) {
                    keyboardLayoutSelect.add(new Option(layoutsList[i], layoutsList[i]), null);
                    if (go.prefs.keyboardLayout == layoutsList[i]) {
                        keyboardLayoutSelect.selectedIndex = i;
                    }
                }
            },
            updateLayoutsfunc = function() { u.xhrGet('/i18n/get_layout?enumerate=True', enumerateLayouts) };
        prefsPanelKeyboardLayoutLabel.innerHTML = "<b>Keyboard Layout:</b> ";
        prefsPanelRow.appendChild(prefsPanelKeyboardLayoutLabel);
        prefsPanelRow.appendChild(prefsPanelKeyboardLayout);
        prefsTable1.appendChild(prefsPanelRow);
        // TODO: Write a registerToggleCallback function to simply this
        // Setup a callback that updates the keyboard layout options whenever the panel is opened.
        if (!go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs']) {
            go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs'] = {};
        }
        go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs']['updateKeyLayout'] = updateLayoutsfunc;
    }
});

})(window);