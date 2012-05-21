/*
COPYRIGHT NOTICE
================

gateone.js and all related original code...

Copyright 2012 Liftoff Software Corporation

Gate One Client - JavaScript
============================

Note: Icons came from the folks at GoSquared.  Thanks guys!
http://www.gosquared.com/liquidicity/archives/122

NOTE regarding plugins:  Only plugins that could feasibly be removed entirely
from Gate One were broken out into their own plugin directories.  Only modules
and functions that are absolutely essential to Gate One should be placed within
this file.
*/

// General TODOs
// TODO: Separate creation of the various panels into their own little functions so we can efficiently neglect to execute them if in embedded mode.
// TODO: Add a nice tooltip function to GateOne.Visual that all plugins can use that is integrated with the base themes.

// Everything goes in GateOne
(function(window, undefined) {
"use strict";

var document = window.document; // Have to do this because we're sandboxed

//  Capabilities checks go before everything else so we don't waste time
// Choose the appropriate WebSocket
var WebSocket =  window.MozWebSocket || window.WebSocket || window.WebSocketDraft || null;
if (!WebSocket) {
    alert("Sorry but your web browser does not appear to support WebSockets.  Gate One requires WebSockets in order to (efficiently) communicate with the server.");
    return;
}
// Choose the appropriate BlobBuilder and URL
var BlobBuilder = (window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder),
    urlObj = (window.URL || window.webkitURL);

if (!BlobBuilder) {
    alert("Sorry but your browser does not appear to support the HTML5 File API (specifically, BlobBuilder).  Gate One requires this in order to download its Web Worker over the WebSocket.");
    return;
}

// Sandbox-wide shortcuts
var noop = function(a) { return a }; // Let's us reference functions that may or may not be available (see logging shortcuts below).
var ESC = String.fromCharCode(27); // Saves a lot of typing and it's easy to read
// Log level shortcuts for each log level (these get properly assigned in GateOne.initialize() if GateOne.Logging is available)
var logFatal = noop;
var logError = noop;
var logWarning = noop;
var logInfo = noop;
var logDebug = noop;

// These can be used to test the performance of various functions and whatnot.
var benchmark = null; // Need a global for this to work across the board
function startBenchmark() {
    var date1 = new Date();
    benchmark = date1.getTime();
}
function stopBenchmark(msg) {
    var date2 = new Date(),
        diff =  date2.getTime() - benchmark;
    logInfo(msg + ": " + diff + "ms");
}

// Define GateOne
var GateOne = GateOne || {};
GateOne.NAME = "GateOne";
GateOne.VERSION = "1.0";
GateOne.__repr__ = function () {
    return "[" + this.NAME + " " + this.VERSION + "]";
};
GateOne.toString = function () {
    return this.__repr__();
};

// Define our internal token seed storage (inaccessible outside this sandbox)
var seed1 = null, seed2 = null; // NOTE: Not used yet.

// NOTE: This module loading/updating code was copied from the *excellent* MochiKit JS library (http://mochikit.com).
//       ...which is MIT licensed: http://www.opensource.org/licenses/mit-license.php
//      Other functions copied from MochiKit are indicated individually
GateOne.Base = GateOne.Base || {}; // "Base" just contains things like prefs and essential functions
/**
 * Creates a new module in a parent namespace. This function will
 * create a new empty module object with "NAME", "VERSION",
 * "toString" and "__repr__" properties. This object will be inserted into the parent object
 * using the specified name (i.e. parent[name] = module). It will
 * also verify that all the dependency modules are defined in the
 * parent, or an error will be thrown.
 *
 * @param {Object} parent the parent module (use "this" or "window" for
 *            a global module)
 * @param {String} name the module name, e.g. "Base"
 * @param {String} version the module version, e.g. "1.0"
 * @param {Array} [deps] the array of module dependencies (as strings)
 */
GateOne.loadedModules = [];
GateOne.Base.module = function (parent, name, version, deps) {
    var module = parent[name] = parent[name] || {},
        prefix = (parent.NAME ? parent.NAME + "." : "");
    module.NAME = prefix + name;
    module.VERSION = version;
    module.__repr__ = function () {
        return "[" + this.NAME + " " + this.VERSION + "]";
    };
    module.toString = function () {
        return this.__repr__();
    };
    for (var i = 0; deps != null && i < deps.length; i++) {
        if (!(deps[i] in parent)) {
            throw module.NAME + ' depends on ' + prefix + deps[i] + '!';
        }
    }
    GateOne.loadedModules.push(module.NAME);
    return module;
};
GateOne.Base.module(GateOne, "Base", "1.0", []);

GateOne.Base.update = function (self, obj/*, ... */) {
    if (self === null || self === undefined) {
        self = {};
    }
    for (var i = 1; i < arguments.length; i++) {
        var o = arguments[i];
        if (typeof(o) != 'undefined' && o !== null) {
            for (var k in o) {
                self[k] = o[k];
            }
        }
    }
    return self;
};

// GateOne Settings
GateOne.prefs = { // Tunable prefs (things users can change)
    url: null, // URL of the GateOne server.  Will default to whatever is in window.location
    fillContainer: true, // If set to true, #gateone will fill itself out to the full size of its parent element
    style: {}, // Whatever CSS the user wants to apply to #gateone.  NOTE: Width and height will be skipped if fillContainer is true
    goDiv: '#gateone', // Default element to place gateone inside
    scrollback: 500, // Amount of lines to keep in the scrollback buffer
    rows: null, // Override the automatically calculated value (null means fill the window)
    cols: null, // Ditto
    prefix: 'go_', // What to prefix element IDs with (in case you need to avoid a name conflict).  NOTE: There are a few classes that use the prefix too.
    theme: 'black', // The theme to use by default (e.g. 'black', 'white', etc)
    colors: 'default', // The color scheme to use (e.g. 'default', 'gnome-terminal', etc)
    fontSize: '100%', // The font size that will be applied to the goDiv element (so users can adjust it on-the-fly)
    autoConnectURL: null, // This is a URL that will be automatically connected to whenever a terminal is loaded. TODO: Move this to the ssh plugin.
    embedded: false, // Equivalent to {showTitle: false, showToolbar: false} and certain keyboard shortcuts won't be registered
    disableTermTransitions: false, // Disabled the sliding animation on terminals to make switching faster
    auth: null, // If using API authentication, this value will hold the user's auth object (see docs for the format).
    showTitle: true, // If false, the terminal title will not be shown in the sidebar.
    showToolbar: true, // If false, the toolbar will now be shown in the sidebar.
    audibleBell: true, // If false, the bell sound will not be played (visual notification will still occur),
    bellSound: '', // Stores the bell sound data::URI (cached).
    bellSoundType: '' // Stores the mimetype of the bell sound.
};
// Properties in this object will get ignored when GateOne.prefs is saved to localStorage
GateOne.noSavePrefs = {
    // Plugin authors:  If you want to have your own property in GateOne.prefs but it isn't a per-user setting, add your property here
    url: null,
    fillContainer: null,
    style: null,
    goDiv: null, // Why an object and not an array?  So the logic is simpler:  "for (var objName in noSavePrefs) ..."
    prefix: null,
    autoConnectURL: null,
    embedded: null,
    auth: null,
    showTitle: null,
    showToolbar: null
}
// Example 'auth' object:
// {
//     'api_key': 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
//     'upn': 'joe@company.com',
//     'timestamp': 1323391717238, // Can be created via: new Date().getTime();
//     'signature': <gibberish>,
//     'signature_method': 'HMAC-SHA1',
//     'api_version': '1.0'
// }
// Icons (so we can use them in more than one place or replace them all by applying a theme)
GateOne.Icons = {}; // NOTE: The built-in icons are actually at the bottom of this file.
var go = GateOne.Base.update(GateOne, {
    // GateOne internal tracking variables and user functions
    terminals: {}, // For keeping track of running terminals
    doingUpdate: false, // Used to prevent out-of-order character events
    ws: null, // Where our WebSocket gets stored
    savePrefsCallbacks: [], // For plugins to use so they can have their own preferences saved when the user clicks "Save" in the Gate One prefs panel
    // This starts up GateOne using the given *prefs*
    init: function(prefs) {
        // Before we do anything else, load our prefs
        var go = GateOne,
            u = go.Utils,
            parseResponse = function(response) {
                if (response == 'authenticated') {
                    // Load Plugins (GateOne.initialize is passed as a callback)
                    go.initialize();
                } else {
                    if (go.prefs.auth) {
                        // API authentication
                        logDebug("Using API authentiation object: " + go.prefs.auth);
                        go.initialize();
                    } else {
                        // Regular auth.  Clear the cookie and redirect the user...
                        GateOne.Net.reauthenticate();
                    }
                }
            };
        // Update GateOne.prefs with the settings provided in the calling page
        for (var setting in prefs) {
            go.prefs[setting] = prefs[setting];
        }
        // Now override them with the user's settings (if present)
        if (localStorage[go.prefs.prefix+'prefs']) {
            u.loadPrefs();
        }
        // Apply embedded mode settings
        if (go.prefs.embedded) {
            go.prefs.showToolbar = false;
            go.prefs.showTitle = false;
        }
        if (!go.prefs.url) {
            go.prefs.url = window.location.href;
            if (go.prefs.url.indexOf('?') != -1) {
                // Gotta get rid of the query string
                go.prefs.url = go.prefs.url.split('?')[0];
            }
            go.prefs.url = go.prefs.url.split('#')[0]; // Get rid of any hash at the end (just in case)
        }
        if (!u.endsWith('/', go.prefs.url)) {
            go.prefs.url = go.prefs.url + '/';
        }
        var combined_js = go.prefs.url + 'combined_js',
            authCheck = go.prefs.url + 'auth?check=True';
        // Load our JS Plugins
        u.loadScript(combined_js, function() {
            // Check if we're authenticated after all the scripts are done loading
            u.xhrGet(authCheck, parseResponse);
        });
        // Empty out anything that might be already-existing in goDiv
        u.getNode(go.prefs.goDiv).innerHTML = '';
    },
    initialize: function() {
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        if (GateOne.Logging) {
            logFatal = GateOne.Logging.logFatal;
            logError = GateOne.Logging.logError;
            logWarning = GateOne.Logging.logWarning;
            logInfo = GateOne.Logging.logInfo;
            logDebug = GateOne.Logging.logDebug;
        }
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': 'panel_close_icon', 'title': "Close This Panel"}),
            prefsPanel = u.createElement('div', {'id': 'panel_prefs', 'class':'panel'}),
            prefsPanelH2 = u.createElement('h2'),
            prefsPanelForm = u.createElement('form', {'id': 'prefs_form', 'name': prefix+'prefs_form'}),
            prefsPanelStyleRow1 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelStyleRow2 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelStyleRow3 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelStyleRow4 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelStyleRow5 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelStyleRow6 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelRow1 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelRow2 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelRow4 = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelRow5 = u.createElement('div', {'class':'paneltablerow'}),
            tableDiv = u.createElement('div', {'id': 'prefs_tablediv1', 'class':'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            tableDiv2 = u.createElement('div', {'id': 'prefs_tablediv2', 'class':'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            prefsPanelThemeLabel = u.createElement('span', {'id': 'prefs_theme_label', 'class':'paneltablelabel'}),
            prefsPanelTheme = u.createElement('select', {'id': 'prefs_theme', 'name': prefix+'prefs_theme', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelColorsLabel = u.createElement('span', {'id': 'prefs_colors_label', 'class':'paneltablelabel'}),
            prefsPanelColors = u.createElement('select', {'id': 'prefs_colors', 'name':'prefs_colors', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelFontSizeLabel = u.createElement('span', {'id': 'prefs_fontsize_label', 'class':'paneltablelabel'}),
            prefsPanelFontSize = u.createElement('input', {'id': 'prefs_fontsize', 'name': prefix+'prefs_fontsize', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelDisableTermTransitionsLabel = u.createElement('span', {'id': 'prefs_disabletermtrans_label', 'class':'paneltablelabel'}),
            prefsPanelDisableTermTransitions = u.createElement('input', {'id': 'prefs_disabletermtrans', 'name': prefix+'prefs_disabletermtrans', 'value': 'disabletermtrans', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelDisableAudibleBellLabel = u.createElement('span', {'id': 'prefs_disableaudiblebell_label', 'class':'paneltablelabel'}),
            prefsPanelDisableAudibleBell = u.createElement('input', {'id': 'prefs_disableaudiblebell', 'name': prefix+'prefs_disableaudiblebell', 'value': 'disableaudiblebell', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelBellLabel = u.createElement('span', {'id': 'prefs_bell_label', 'class':'paneltablelabel'}),
            prefsPanelBell = u.createElement('button', {'id': 'prefs_bell', 'value': 'bell', 'class': 'button black', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelScrollbackLabel = u.createElement('span', {'id': 'prefs_scrollback_label', 'class':'paneltablelabel'}),
            prefsPanelScrollback = u.createElement('input', {'id': 'prefs_scrollback', 'name': prefix+'prefs_scrollback', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelRowsLabel = u.createElement('span', {'id': 'prefs_rows_label', 'class':'paneltablelabel'}),
            prefsPanelRows = u.createElement('input', {'id': 'prefs_rows', 'name': prefix+'prefs_rows', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelColsLabel = u.createElement('span', {'id': 'prefs_cols_label', 'class':'paneltablelabel'}),
            prefsPanelCols = u.createElement('input', {'id': 'prefs_cols', 'name': prefix+'prefs_cols', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelSave = u.createElement('button', {'id': 'prefs_save', 'type': 'submit', 'value': 'Save', 'class': 'button black', 'style': {'float': 'right'}}),
            noticeContainer = u.createElement('div', {'id': 'noticecontainer'}),
            toolbar = u.createElement('div', {'id': 'toolbar'}),
            toolbarIconPrefs = u.createElement('div', {'id': 'icon_prefs', 'class':'toolbar', 'title': "Preferences"}),
            panels = u.getNodes(go.prefs.goDiv + ' .panel'),
            // Firefox doesn't support 'mousewheel'
            mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel",
            sideinfo = u.createElement('div', {'id': 'sideinfo', 'class':'sideinfo'}),
            themeList = [], // Gets filled out below
            colorsList = [],
            updateCSSfunc = function() { go.ws.send(JSON.stringify({'enumerate_themes': null})) };
        // Create our prefs panel
        go.Visual.applyTransform(prefsPanel, 'scale(0)');
        toolbarIconPrefs.innerHTML = go.Icons.prefs;
        prefsPanelH2.innerHTML = "Preferences";
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            go.Visual.togglePanel('#'+prefix+'panel_prefs'); // Scale away, scale away, scale away.
        }
        prefsPanelBell.onclick = function(e) {
            e.preventDefault(); // Just in case
            go.User.uploadBellDialog();
        }
        prefsPanel.appendChild(prefsPanelH2);
        prefsPanel.appendChild(panelClose);
        prefsPanelThemeLabel.innerHTML = "<b>Theme:</b> ";
        prefsPanelColorsLabel.innerHTML = "<b>Color Scheme:</b> ";
        prefsPanelFontSizeLabel.innerHTML = "<b>Font Size:</b> ";
        prefsPanelDisableTermTransitionsLabel.innerHTML = "<b>Disable Terminal Slide Effect:</b> ";
        prefsPanelDisableAudibleBellLabel.innerHTML = "<b>Disable Bell Sound:</b> ";
        prefsPanelBell.innerHTML = "Configure";
        prefsPanelBellLabel.innerHTML = "<b>Bell Sound:</b> ";
        prefsPanelFontSize.value = go.prefs.fontSize;
        prefsPanelStyleRow1.appendChild(prefsPanelThemeLabel);
        prefsPanelStyleRow1.appendChild(prefsPanelTheme);
        prefsPanelStyleRow2.appendChild(prefsPanelColorsLabel);
        prefsPanelStyleRow2.appendChild(prefsPanelColors);
        prefsPanelStyleRow3.appendChild(prefsPanelFontSizeLabel);
        prefsPanelStyleRow3.appendChild(prefsPanelFontSize);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableTermTransitionsLabel);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableTermTransitions);
        prefsPanelStyleRow5.appendChild(prefsPanelDisableAudibleBellLabel);
        prefsPanelStyleRow5.appendChild(prefsPanelDisableAudibleBell);
        prefsPanelStyleRow6.appendChild(prefsPanelBellLabel);
        prefsPanelStyleRow6.appendChild(prefsPanelBell);
        tableDiv.appendChild(prefsPanelStyleRow1);
        tableDiv.appendChild(prefsPanelStyleRow2);
        tableDiv.appendChild(prefsPanelStyleRow3);
        tableDiv.appendChild(prefsPanelStyleRow4);
        tableDiv.appendChild(prefsPanelStyleRow5);
        tableDiv.appendChild(prefsPanelStyleRow6);
        prefsPanelScrollbackLabel.innerHTML = "<b>Scrollback Buffer Lines:</b> ";
        prefsPanelScrollback.value = go.prefs.scrollback;
        prefsPanelRowsLabel.innerHTML = "<b>Terminal Rows:</b> ";
        prefsPanelRows.value = go.prefs.rows;
        prefsPanelColsLabel.innerHTML = "<b>Terminal Columns:</b> ";
        prefsPanelCols.value = go.prefs.cols;
        prefsPanelRow1.appendChild(prefsPanelScrollbackLabel);
        prefsPanelRow1.appendChild(prefsPanelScrollback);
        prefsPanelRow4.appendChild(prefsPanelRowsLabel);
        prefsPanelRow4.appendChild(prefsPanelRows);
        prefsPanelRow5.appendChild(prefsPanelColsLabel);
        prefsPanelRow5.appendChild(prefsPanelCols);
        tableDiv2.appendChild(prefsPanelRow1);
        tableDiv2.appendChild(prefsPanelRow2);
        tableDiv2.appendChild(prefsPanelRow4);
        tableDiv2.appendChild(prefsPanelRow5);
        prefsPanelForm.appendChild(tableDiv);
        prefsPanelForm.appendChild(tableDiv2);
        prefsPanelSave.innerHTML = "Save";
        prefsPanelForm.appendChild(prefsPanelSave);
        prefsPanel.appendChild(prefsPanelForm);
        if (!go.prefs.embedded) {
            goDiv.appendChild(prefsPanel); // Doesn't really matter where it goes
        }
        prefsPanelForm.onsubmit = function(e) {
            e.preventDefault(); // Don't actually submit
            var theme = u.getNode('#'+prefix+'prefs_theme').value,
                colors = u.getNode('#'+prefix+'prefs_colors').value,
                fontSize = u.getNode('#'+prefix+'prefs_fontsize').value,
                scrollbackValue = u.getNode('#'+prefix+'prefs_scrollback').value,
                rowsValue = u.getNode('#'+prefix+'prefs_rows').value,
                colsValue = u.getNode('#'+prefix+'prefs_cols').value,
                disableTermTransitions = u.getNode('#'+prefix+'prefs_disabletermtrans').checked,
                disableAudibleBell = u.getNode('#'+prefix+'prefs_disableaudiblebell').checked;
            // Grab the form values and set them in prefs
            if (theme != go.prefs.theme || colors != go.prefs.colors) {
                // Start using the new CSS theme and colors
                u.loadThemeCSS({'theme': theme, 'colors': colors});
                // Save the user's choice
                go.prefs.theme = theme;
                go.prefs.colors = colors;
            }
            if (fontSize) {
                go.prefs.fontSize = fontSize;
                goDiv.style['fontSize'] = fontSize;
            }
            if (scrollbackValue) {
                go.prefs.scrollback = parseInt(scrollbackValue);
            }
            if (rowsValue) {
                go.prefs.rows = parseInt(rowsValue);
            } else {
                go.prefs.rows = null;
            }
            if (colsValue) {
                go.prefs.cols = parseInt(colsValue);
            } else {
                go.prefs.cols = null;
            }
            if (disableTermTransitions) {
                var newStyle = u.createElement('style', {'id': 'disable_term_transitions'});
                newStyle.innerHTML = ".terminal {-webkit-transition: none; -moz-transition: none; -ms-transition: none; -o-transition: none; transition: none;}";
                u.getNode(goDiv).appendChild(newStyle);
            } else {
                var existing = u.getNode('#'+prefix+'disable_term_transitions');
                if (existing) {
                    u.removeElement(existing);
                }
            }
            if (disableAudibleBell) {
                go.prefs.audibleBell = false;
            } else {
                go.prefs.audibleBell = true;
            }
            if (go.savePrefsCallbacks.length) {
                // Call any registered prefs callbacks
                for (var i in go.savePrefsCallbacks) {
                    go.savePrefsCallbacks[i]();
                }
            }
            u.savePrefs();
            // In case the user changed the rows/cols or the font/size changed:
            setTimeout(function() { // Wrapped in a timeout since it takes a moment for everything to change in the browser
                go.Visual.updateDimensions();
                go.Net.sendDimensions();
            }, 3000);
        }
        // Connect to the server
        go.Net.connect(go.prefs.url);
        // Apply user-specified dimension styles and settings
        go.Visual.applyStyle(goDiv, go.prefs.style);
        if (go.prefs.fillContainer) {
            go.Visual.applyStyle(goDiv, { // Undo width and height so they don't mess with the settings below
                'width': 'auto',
                'height': 'auto'
            });
            // This causes #gateone to fill the entire container:
            go.Visual.applyStyle(goDiv, {
                'position': 'absolute',
                'top': 0,
                'bottom': 0,
                'left': 0,
                'right': 0
            });
        }
        // Set the font according to the user's prefs
        if (go.prefs.fontSize) {
            goDiv.style['fontSize'] = go.prefs.fontSize;
        }
        // Disable terminal transitions if the user wants
        if (go.prefs.disableTermTransitions) {
            var newStyle = u.createElement('style', {'id': 'disable_term_transitions'});
            newStyle.innerHTML = ".terminal {-webkit-transition: none; -moz-transition: none; -ms-transition: none; -o-transition: none; transition: none;}";
            u.getNode(goDiv).appendChild(newStyle);
        }
        // Create the (empty) toolbar
        if (!go.prefs.showToolbar) {
            // We just keep it hidden so that plugins don't have to worry about whether or not it is there (avoids exceptions)
            toolbar.style['display'] = 'none';
        }
        toolbar.appendChild(toolbarIconPrefs); // The only default toolbar icon is the preferences
        goDiv.appendChild(toolbar);
        var showPrefs = function() {
            go.Visual.togglePanel('#'+prefix+'panel_prefs');
        }
        toolbarIconPrefs.onclick = showPrefs;
        // Put our invisible pop-up message container on the page
        document.body.appendChild(noticeContainer); // Notifications can be outside the GateOne area
        // Add the sidebar text (if set to do so)
        if (!go.prefs.showTitle) {
            // Just keep it hidden so plugins don't have to worry about whether or not it is present (to avoid exceptions)
            sideinfo.style['display'] = 'none';
        }
        goDiv.appendChild(sideinfo);
        // Set the tabIndex on our GateOne Div so we can give it focus()
        goDiv.tabIndex = 1;
        // This re-enables the scrollback buffer immediately if the user starts scrolling (even if the timeout hasn't expired yet)
        var wheelFunc = function(e) {
            var m = go.Input.mouse(e),
                modifiers = go.Input.modifiers(e);
            if (!modifiers.shift && !modifiers.ctrl && !modifiers.alt) { // Only for basic scrolling
                var term = localStorage[prefix+'selectedTerminal'],
                    terminalObj = go.terminals[term],
                    screen = terminalObj['screen'],
                    scrollback = terminalObj['scrollback'],
                    sbT = terminalObj['scrollbackTimer'];
                if (sbT) {
                    clearTimeout(sbT);
                    sbT = null;
                }
                if (!terminalObj['scrollbackVisible']) {
                    // Immediately re-enable the scrollback buffer
                    go.Visual.enableScrollback(term);
                }
            } else {
                e.preventDefault();
            }
        }
        goDiv.addEventListener(mousewheelevt, wheelFunc, true);
        var onResizeEvent = function(e) {
            // Update the Terminal if it is resized
            if (go.resizeEventTimer) {
                clearTimeout(go.resizeEventTimer);
                go.resizeEventTimer = null;
            }
            go.resizeEventTimer = setTimeout(function() {
                // Wrapped in a timeout to de-bounce
                if (u.getNode(go.prefs.goDiv).style.display != "none") {
                    go.Visual.updateDimensions();
                    go.Net.sendDimensions();
                }
            }, 500);
        }
        window.onresize = onResizeEvent;
        // Check for support for WebSockets. NOTE: (IE with the Websocket add-on calls it "WebSocketDraft")
        if(typeof(WebSocket) != "function") {
            // TODO:  Make this display a helpful message showing users how they can get a browser with WebSocket support.
            logError("No WebSocket support!");
            return;
        }
        // Setup a callback that updates the CSS options whenever the panel is opened (so the user doesn't have to reload the page when the server has new CSS files).
        if (!go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs']) {
            go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs'] = {};
        }
        go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs']['updateCSS'] = updateCSSfunc;
        // Make sure the termwrapper is the proper width for 2 columns
        go.Visual.updateDimensions();
        // This calls plugins init() and postInit() functions:
        u.postOnLoad();
        // Start capturing keyboard input
        go.Input.capture();
    }
});

// Apply some universal defaults
if (!localStorage[GateOne.prefs.prefix+'selectedTerminal']) {
    localStorage[GateOne.prefs.prefix+'selectedTerminal'] = 1;
}

// GateOne.Utils (generic utility functions)
GateOne.Base.module(GateOne, "Utils", "1.0", ['Base']);
GateOne.Base.update(GateOne.Utils, {
    init: function() {
        go.Net.addAction('save_file', go.Utils.saveAsAction);
        go.Net.addAction('load_style', go.Utils.loadStyle);
//         go.Net.addAction('load_js', go.Utils.loadJS);
        go.Net.addAction('themes_list', go.Utils.enumerateThemes);
    },
    getNode: function(nodeOrSelector) {
        // Given a CSS query selector (string, e.g. '#someid') or node (in case we're not sure), lookup the node using document.querySelector() and return it.
        // NOTE: The benefit of this over just querySelector() is that if it is given a node it will just return the node as-is (so functions can accept both without having to worry about such things).  See removeElement() below for a good example.
        if (typeof(nodeOrSelector) == 'string') {
            return document.querySelector(nodeOrSelector);
        }
        return nodeOrSelector;
    },
    getNodes: function(nodeListOrSelector) {
        // Given a CSS query selector (string, e.g. 'input[name="foo"]') or nodeList (in case we're not sure), lookup the node using document.querySelectorAll() and return the result (which will be a nodeList).
        // NOTE: The benefit of this over just querySelectorAll() is that if it is given a nodeList it will just return the nodeList as-is (so functions can accept both without having to worry about such things).
        if (typeof(nodeListOrSelector) == 'string') {
            return document.querySelectorAll(nodeListOrSelector);
        }
        return nodeListOrSelector;
    },
    partial: function(fn) {
        var args = Array.prototype.slice.call(arguments);
        args.shift();
        return function() {
            var new_args = Array.prototype.slice.call(arguments);
            args = args.concat(new_args);
            return fn.apply(window, args);
        }
    },
     /** @id MochiKit.Base.items */
    items: function (obj) {
        var rval = [],
            e;
        for (var prop in obj) {
            var v;
            try {
                v = obj[prop];
            } catch (e) {
                continue;
            }
            rval.push([prop, v]);
        }
        return rval;
    },
    /** @id MochiKit.Base.itemgetter */
    itemgetter: function (name) {
        return function (arg) {
            return arg[name];
        };
    },
    /** @id MochiKit.DOM.hasElementClass */
    hasElementClass: function (element, className/*...*/) {
        var obj = GateOne.Utils.getNode(element);
        if (obj == null) {
            return false;
        }
        var cls = obj.className;
        if (typeof(cls) != "string" && typeof(obj.getAttribute) == "function") {
            cls = obj.getAttribute("class");
        }
        if (typeof(cls) != "string") {
            return false;
        }
        var classes = cls.split(" ");
        for (var i = 1; i < arguments.length; i++) {
            var good = false;
            for (var j = 0; j < classes.length; j++) {
                if (classes[j] == arguments[i]) {
                    good = true;
                    break;
                }
            }
            if (!good) {
                return false;
            }
        }
        return true;
    },
    startsWith: function (substr, str) {
        return str != null && substr != null && str.indexOf(substr) == 0;
    },
    endsWith: function (substr, str) {
        return str != null && substr != null &&
            str.lastIndexOf(substr) == Math.max(str.length - substr.length, 0);
    },
    isArray: function(obj) {
        return obj.constructor == Array;
    },
    isNodeList: function(obj) {
        return obj instanceof NodeList;
    },
    isHTMLCollection: function(obj) {
        return obj instanceof HTMLCollection;
    },
    isElement: function(obj) {
        return obj instanceof HTMLElement;
    },
    renames: {
//         "class": "className",
        "checked": "defaultChecked",
        "usemap": "useMap",
        "for": "htmlFor",
        "readonly": "readOnly",
        "colspan": "colSpan",
        "rowspan": "rowSpan",
        "bgcolor": "bgColor",
        "cellspacing": "cellSpacing",
        "cellpadding": "cellPadding"
    },
    removeElement: function(elem) {
        // Removes the given element.  Works with node objects and CSS selectors.
        var node = GateOne.Utils.getNode(elem);
        if (node.parentNode) { // This check ensures that we don't throw an exception if the element has already been removed.
            node.parentNode.removeChild(node);
        }
    },
    createElement: function(tagname, properties, noprefix) {
        // Takes a string, *tagname* and creates a DOM element of that type and applies *properties* to it.  If an 'id' is given as a property it will automatically be prepended with GateOne.prefs.prefix.
        // If *noprefix* is false, the prefix will not be prepended to the 'id' of the created element.
        // Example: createElement('div', {'id': 'foo', 'style': {'opacity': 0.5, 'color': 'black'}});
        var u = go.Utils,
            elem = document.createElement(tagname);
        for (var key in properties) {
            var value = properties[key];
            if (key == 'style') {
                // Have to iterate over the styles (it's special)
                for (var style in value) {
                    elem.style[style] = value[style];
                }
            } else if (key == 'id') {
                // Prepend GateOne.prefs.prefix so we don't have to include it a million times everywhere.
                if (!noprefix) {
                    if (!u.startsWith(go.prefs.prefix, value)) {
                        // Only prepend if it doesn't already start with the prefix
                        value = go.prefs.prefix + value;
                    }
                }
                elem.setAttribute(key, value);
            } else if (u.renames[key]) { // Why JS ended up with different names for things is beyond me
                elem.setAttribute(u.renames[key] = value);
            } else {
                elem.setAttribute(key, value);
            }
        }
        return elem;
    },
    showElement: function(elem) {
        // Sets the 'display' style of the given element to 'block' (which undoes setting it to 'none')
        var u = GateOne.Utils;
        u.getNode(elem).style.display = 'block';
        u.getNode(elem).className = u.getNode(elem).className.replace(/(?:^|\s)go_none(?!\S)/, '');
    },
    hideElement: function(elem) {
        // Sets the 'display' style of the given element to 'none'
        var u = GateOne.Utils;
        u.getNode(elem).style.display = 'none';
        if (elem.className.indexOf('go_none') == -1) {
            u.getNode(elem).className += " go_none";
        }
    },
    showElements: function(elems) {
        // Sets the 'display' style of the given elements to 'block' (which undoes setting it to 'none').
        // Elements must be an iterable (or a querySelectorAll string) such as an HTMLCollection or an Array of DOM nodes
        var u = GateOne.Utils,
            elems = u.toArray(u.getNodes(elems));
        elems.forEach(function(elem) {
            u.getNode(elem).style.display = 'block';
            u.getNode(elem).className = u.getNode(elem).className.replace(/(?:^|\s)go_none(?!\S)/, '');
        });
    },
    hideElements: function(elems) {
        // Sets the 'display' style of the given element to 'none'
        // Elements must be an iterable such as an HTMLCollection or an Array of DOM nodes
        var u = GateOne.Utils,
            elems = u.toArray(u.getNodes(elems));
        elems.forEach(function(elem) {
            u.getNode(elem).style.display = 'none';
            if (elem.className.indexOf('go_none') == -1) {
                u.getNode(elem).className += " go_none";
            }
        });
    },
    getOffset: function(el) {
        // Returns {top: <offsetTop>, left: <offsetLeft>}
        var _x = 0;
        var _y = 0;
        while( el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop ) ) {
            _x += el.offsetLeft - el.scrollLeft;
            _y += el.offsetTop - el.scrollTop;
            el = el.offsetParent;
        }
        return { top: _y, left: _x };
    },
    noop: function(a) { return a },
    toArray: function (obj) {
        var array = [];
        // iterate backwards ensuring that length is an UInt32
        for (var i = obj.length >>> 0; i--;) {
            array[i] = obj[i];
        }
        return array;
    },
    scrollLines: function(elem, lines) {
        // Scrolls the given element by *lines* (positive or negative)
        // Lines are calculated based on the EM height of text in the element.
        logDebug('scrollLines(' + elem + ', ' + lines + ')');
        var node = GateOne.Utils.getNode(elem),
            emDimensions = GateOne.Utils.getEmDimensions(elem);
        node.scrollTop = node.scrollTop + (emDimensions.h * lines);
    },
    scrollToBottom: function(elem) {
        var node = GateOne.Utils.getNode(elem);
        try {
            if (node.scrollTop != node.scrollHeight) {
                node.scrollTop = node.scrollHeight;
            }
        } finally {
            node = null;
        }
    },
    replaceURLWithHTMLLinks: function(text) {
        var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(exp,"<a href='$1'>$1</a>");
    },
    isEven: function(someNumber){
        return (someNumber%2 == 0) ? true : false;
    },
    getSelText: function() {
        var txt = '';
        if (window.getSelection) {
            txt = window.getSelection();
        } else if (document.getSelection) {
            txt = document.getSelection();
        } else if (document.selection) {
            txt = document.selection.createRange().text;
        } else {
            return;
        }
        return txt.toString();
    },
    getEmDimensions: function(elem) {
        // Returns the height and width of 1em inside the given elem (e.g. 'term1_pre')
        // The returned object will be in the form of:
        //      {'w': <width in px>, 'h': <height in px>}
        var node = GateOne.Utils.getNode(elem),
            sizingDiv = document.createElement("div"),
            sizingPre = document.createElement("pre"),
            fillerX = '', fillerY = [],
            lineCounter = 0;
//         sizingDiv.innerHTML = "\u2588"; // Fill it with a single character (this is a unicode "full block": █).  Using the \u syntax because minifiers don't seem to like unicode characters to be in the source as-is.
        // We need two lines so we can factor in the line height and character spacing (if it has been messed with).
        sizingDiv.className = "terminal";
        for (var i=0; i <= 63; i++) {
            fillerX += "\u2588";
        }
        for (var i=0; i <= 63; i++) {
            fillerY.push(fillerX);
        }
        sizingPre.innerHTML = fillerY.join('\n');
        // Set the attributes of our copy to reflect a minimal-size block element
        sizingPre.style.width = 'auto';
        sizingPre.style.height = 'auto';
        // Add in our sizingDiv and grab its height
        sizingDiv.appendChild(sizingPre);
        node.appendChild(sizingDiv);
        var nodeHeight = sizingPre.getClientRects()[0].height,
            nodeWidth = sizingPre.getClientRects()[0].width;
        nodeHeight = parseInt(nodeHeight)/64;
        nodeWidth = parseInt(nodeWidth)/64;
        node.removeChild(sizingDiv);
        return {'w': nodeWidth, 'h': nodeHeight};
    },
    getRowsAndColumns: function(elem) {
    /*  Calculates and returns the number of text rows and colunmns that will fit in the given element ID (elem).
        Important:  elem must be a basic block element such as DIV, SPAN, P, PRE, etc.
                    Elements that require sub-elements such as TABLE (requires TRs and TDs) probably won't work.
        Note:  This function only works properly with monospaced fonts but it does work with high-resolution displays.
            (so users with properly-configured high-DPI displays will be happy =).
            Other similar functions I've found on the web had hard-coded pixel widths for known fonts
            at certain point sizes.  These break on any display with a resolution higher than 96dpi.
    */
        var node = GateOne.Utils.getNode(elem),
            style = window.getComputedStyle(node, ':line-marker');
        var elementDimensions = {
            h: parseInt(style.height.split('px')[0]),
            w: parseInt(style.width.split('px')[0])
        },
            textDimensions = GateOne.Utils.getEmDimensions(elem);
        // Calculate the rows and columns:
        var rows = (elementDimensions.h / textDimensions.h),
            cols = (elementDimensions.w / textDimensions.w);
        var dimensionsObj = {'rows': rows, 'cols': cols};
        return dimensionsObj;
    },
    // Thanks to Paul Sowden (http://www.alistapart.com/authors/s/paulsowden) at A List Apart for this function.
    // See: http://www.alistapart.com/articles/alternate/
    setActiveStyleSheet: function(title) {
        var i, a, main;
        for (var i=0; (a = document.getElementsByTagName("link")[i]); i++) {
            if (a.getAttribute("rel").indexOf("style") != -1 && a.getAttribute("title")) {
                a.disabled = true;
                if (a.getAttribute("title") == title) a.disabled = false;
            }
        }
    },
    postOnLoad: function() {
        // Called after all the plugins have been loaded.
        // NOTE: Probably don't need a preInit() since modules can just put stuff inside their main .js for that.  If you can think of a use case let me know and I'll add it.
        // Go through all our loaded modules and run their init functions (if any)
        go.loadedModules.forEach(function(module) {
            var moduleObj = eval(module);
            logDebug('Running: ' + moduleObj.NAME + '.init()');
            if (typeof(moduleObj.init) == "function") {
                moduleObj.init();
            }
        });
        // Go through all our loaded modules and run their postInit functions (if any)
        go.loadedModules.forEach(function(module) {
            var moduleObj = eval(module);
            logDebug('Running: ' + moduleObj.NAME + '.postInit()');
            if (typeof(moduleObj.postInit) == "function") {
                moduleObj.postInit();
            }
        });
    },
    // This may be used in the future...  Loads JS over the WebSocket but some stuff in plugins needs to load before the WebSocket is connected.  Might make use of it in the future for something--not sure yet.
//     loadJS: function(message) {
//         // Loads the JavaScript files sent via the 'load_js' WebSocket command into <script> tags inside of GateOne.prefs.goDiv (not that it matters where they go but at least this way they're logically attached to what they belong to)
//         // NOTE: Also loads the web worker
//         var go = GateOne,
//             u = go.Utils,
//             prefix = go.prefs.prefix,
//             goDiv = u.getNode(go.prefs.goDiv);
//         if (message['result'] == 'Success') {
//             for (var plugin in message['plugins']) {
//                 if (!message['plugins'][plugin].length) {
//                     continue; // Nothing to load
//                 }
//                 for (var js_name in message['plugins'][plugin]) {
//                     var existing = u.getNode('#'+prefix+plugin+js_name),
//                         s = u.createElement('script', {'id': plugin+js_name});
//                     s.innerHTML = message['plugins'][plugin][js_name];
//                     if (existing) {
//                         existing.innerHTML = message['plugins'][plugin][js_name];
//                     } else {
//                         goDiv.appendChild(s);
//                     }
//                 }
//             }
//         }
//     },
    loadStyle: function(message) {
        // Loads the stylesheet sent via the 'load_style' WebSocket command
        logDebug("loadStyle()");
        var u = go.Utils,
            prefix = go.prefs.prefix;
        if (message['result'] == 'Success') {
            if (message['theme']) {
                var existing = u.getNode('#'+prefix+'theme'),
                    stylesheet = u.createElement('style', {'id': 'theme'});
                stylesheet.textContent = message['theme'];
                if (existing) {
                    existing.textContent = message['theme'];
                } else {
                    u.getNode("head").appendChild(stylesheet);
                }
            }
            if (message['colors']) {
                var existing = u.getNode('#'+prefix+'colors'),
                    stylesheet = u.createElement('style', {'id': 'colors'}),
                    themeStyle = u.getNode('#'+prefix+'theme'); // Theme should always be last so it can override defaults and plugins
                stylesheet.textContent = message['colors'];
                if (existing) {
                    existing.textContent = message['colors'];
                } else {
                    u.getNode("head").insertBefore(stylesheet, themeStyle);
                }
            }
            if (message['plugins']) {
                // For plugins we have to walk through the object
                for (var plugin in message['plugins']) {
                    if (!message['plugins'][plugin].length) {
                        continue; // Nothing to load
                    }
                    var existing = u.getNode('#'+prefix+plugin+"_css"),
                        stylesheet = u.createElement('style', {'id': plugin+"_css"}),
                        themeStyle = u.getNode('#'+prefix+'theme'); // Theme should always be last so it can override defaults and plugins
                    stylesheet.textContent = message['plugins'][plugin];
                    if (existing) {
                        existing.textContent = message['plugins'][plugin];
                    } else {
                        u.getNode("head").insertBefore(stylesheet, themeStyle);
                    }
                }
            }
            // Force the terminals to be re-drawn by the browser to ensure the text stays visible
//             setTimeout(function() {
//                 var terminals = u.toArray(u.getNodes(go.prefs.goDiv+' .terminal pre'));
//                 terminals.forEach(function(termPre) {
//                     var term = termPre.id.split('_')[1].split('term')[1]; // go_term1_pre
//                     termPre.innerHTML = GateOne.terminals[term]['screen'].join('\n') + '\n\n';
//                 });
//             }, 500);
        }
        go.Visual.updateDimensions(); // In case the styles changed things
    },
    loadCSS: function(url, id){
        // Imports the given CSS *URL* and applies the stylesheet to the current document.
        // When the <link> element is created it will use *id* like so: {'id': GateOne.prefs.prefix + id}.
        // If an existing <link> element already exists with the same *id* it will be overridden.
        if (!id) {
            id = 'css_file';
        }
        var u = go.Utils,
            prefix = go.prefs.prefix,
            goURL = go.prefs.url,
            container = go.prefs.goDiv.split('#')[1],
            cssNode = u.createElement('link', {'id': prefix+id, 'type': 'text/css', 'rel': 'stylesheet', 'href': url, 'media': 'screen'}),
            styleNode = u.createElement('style', {'id': prefix+id}),
            existing = u.getNode('#'+prefix+id);
        if (existing) {
            u.removeElement(existing);
        }
        var themeCSS = u.getNode('#'+prefix+'go_css_theme'); // Theme should always be last so it can override defaults and plugins
        if (themeCSS) {
            u.getNode("head").insertBefore(cssNode, themeCSS);
        } else {
            u.getNode("head").appendChild(cssNode);
        }
    },
    loadThemeCSS: function(schemeObj) {
        // Loads the GateOne CSS for the given *schemeObj* which should be in the form of:
        //     {'theme': 'black'} or {'colors': 'gnome-terminal'} or an object containing both.
        // If *schemeObj* is not provided, will load the defaults.
        if (!schemeObj) {
            schemeObj = {
                'theme': "black",
                'colors': "defaut"
            }
        }
        var u = go.Utils,
            container = go.prefs.goDiv.split('#')[1],
            theme = schemeObj['theme'],
            colors = schemeObj['colors'];
        go.ws.send(JSON.stringify({'get_style': {'go_url': go.prefs.url, 'container': container, 'prefix': go.prefs.prefix, 'theme': schemeObj['theme'], 'colors': schemeObj['colors']}}));
    },
    loadPluginCSS: function() {
        // Tells the Gate One server to send all the plugin CSS files to the client.
        var u = go.Utils,
            container = go.prefs.goDiv.split('#')[1];
        go.ws.send(JSON.stringify({'get_style': {'go_url': go.prefs.url, 'container': container, 'prefix': go.prefs.prefix, 'plugins': true}}));
    },
    loadScript: function(url, callback){
        // Imports the given JS *url*
        // If *callback* is given, it will be called in the onload() event handler for the script
        var tag = document.createElement("script");
        tag.type="text/javascript";
        tag.src = url;
        if (callback) {
            tag.onload = function() {
                callback();
            }
        }
        document.body.appendChild(tag);
    },
    enumerateThemes: function(messageObj) {
        // Meant to be called from the xhrGet() below
        var u = go.Utils,
            prefix = go.prefs.prefix,
            themesList = messageObj['themes'],
            colorsList = messageObj['colors'],
            prefsThemeSelect = u.getNode('#'+prefix+'prefs_theme'),
            prefsColorsSelect = u.getNode('#'+prefix+'prefs_colors');
        prefsThemeSelect.options.length = 0;
        prefsColorsSelect.options.length = 0;
        for (var i in themesList) {
            prefsThemeSelect.add(new Option(themesList[i], themesList[i]), null);
            if (go.prefs.theme == themesList[i]) {
                prefsThemeSelect.selectedIndex = i;
            }
        }
        for (var i in colorsList) {
            prefsColorsSelect.add(new Option(colorsList[i], colorsList[i]), null);
            if (go.prefs.colors == colorsList[i]) {
                prefsColorsSelect.selectedIndex = i;
            }
        }
    },
    savePrefs: function(skipNotification) {
        // Saves all user-specific settings in GateOne.prefs.* to localStorage[prefix+'prefs']
        // if *skipNotification* is True, no message will be displayed to the user.
        var prefs = GateOne.prefs,
            userPrefs = {};
        for (var pref in prefs) {
            if (pref in GateOne.noSavePrefs) {
                ;;
            } else {
                userPrefs[pref] = prefs[pref];
            }
        }
        localStorage[prefs.prefix+'prefs'] = JSON.stringify(userPrefs);
        if (!skipNotification) {
            GateOne.Visual.displayMessage("Preferences have been saved.");
        }
    },
    loadPrefs: function() {
        // Populates GateOne.prefs.* with values from localStorage['prefs']
        if (localStorage[GateOne.prefs.prefix+'prefs']) {
            var userPrefs = JSON.parse(localStorage[GateOne.prefs.prefix+'prefs']);
            for (var i in userPrefs) {
                if (userPrefs[i] != null) {
                    GateOne.prefs[i] = userPrefs[i];
                }
            }
        }
    },
    xhrGet: function(url, callback) {
        // Performs a GET on the given *url* and calls *callback* with the responseText as the only argument.
        // If *callback* is given, it will be called with the result as the only argument.
        var http = new XMLHttpRequest(); // We don't support older browsers anyway so no need to worry about ActiveX garbage
        http.open("GET", url);
        http.onreadystatechange = function() {
            if(http.readyState == 4) {
                callback(http.responseText);
            }
        }
        http.send(null); // All done
    },
    deleteCookie: function(name, path, domain) {
        document.cookie = name + "=" + ((path) ? ";path=" + path : "") + ((domain) ? ";domain=" + domain : "") + ";expires=Thu, 01-Jan-1970 00:00:01 GMT";
    },
    isPrime: function(n) {
        // Copied from http://www.javascripter.net/faq/numberisprime.htm (thanks for making the Internet a better place!)
        if (isNaN(n) || !isFinite(n) || n%1 || n<2) return false;
        var m=Math.sqrt(n);
        for (var i=2; i<=m; i++) if (n%i==0) return false;
        return true;
    },
    randomPrime: function() {
        // Returns a random prime number <= 9 digits
        var i = 10;
        while (!GateOne.Utils.isPrime(i)) {
            i = Math.floor(Math.random()*1000000000);
        }
        return i;
    },
    saveAs: function(blob, filename) {
        // Saves the given *blob* (which must be a proper Blob object with data inside of it) as *filename* (as a file) in the browser.  Just as if you clicked on a link to download it.
        // For reference, this is how to construct a "proper" Blob:
        //      var bb = new BlobBuilder();
        //      bb.append(<your data here>);
        //      var blob = bb.getBlob("text/plain;charset=" + document.characterSet);
        // NOTE:  Replace 'text/plain' with the actual mimetype of the file.
        var u = go.Utils,
            clickEvent = document.createEvent('MouseEvents'),
            blobURL = urlObj.createObjectURL(blob),
            save_link = u.createElement('a', {'href': blobURL, 'name': filename, 'download': filename});
        clickEvent.initMouseEvent('click', true, true, document.defaultView, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
        save_link.dispatchEvent(clickEvent);
    },
    saveAsAction: function(message) {
        // Meant to be called as one of our WebSocket 'actions', saves the file to disk contained in *message*.
        // *message* should contain the following:
        //      *message['result']* - Either 'Success' or a descriptive error message.
        //      *message['filename']* - The name we'll give to the file when we save it.
        //      *message['data']* - The content of the file we're saving.
        //      *message['mimetype']* - Optional:  The mimetype we'll be instructing the browser to associate with the file (so it will handle it appropriately).  Will default to 'text/plain' if not given.
        var u = go.Utils,
            result = message['result'],
            data = message['data'],
            filename = message['filename'],
            mimetype = 'text/plain';
        if (result == 'Success') {
            if (message['mimetype']) {
                mimetype = message['mimetype'];
            }
            var bb = new BlobBuilder();
            bb.append(message['data']);
            var blob = bb.getBlob(mimetype);
            u.saveAs(blob, message['filename']);
        } else {
            go.Visual.displayMessage('An error was encountered trying to save a file...');
            go.Visual.displayMessage(message['result']);
        }
    },
    // NOTE: The token-based approach prevents an attacker from copying a user's session ID to another host and using it to login but it has the disadvantage of requiring that the user re-login if they reload the page or close their tab.
    // NOTE: If we save the seed in sessionStorage, the user can see it but their session could persist as long as they didn't close the tab (saving them from the reload problem).  This would leave the seeds visible to attackers that had access to the JavaScript console on the client though.  So we would need to change the seeds on a fairly regular basis (say, every minute) to mitigate this.
    getToken: function() {
        // Generates a token using the global, *seed* based on the current date/time that can be used to validate the client
        // NOTE: *seed* must be a 9-digit (or less) integer
        //  In order for this to prevent session hijacking the seed must be re-used every single time and cannot be stored in a way that is easily retrievable from regular web development tools (make the attacker dump memory and find the seed before it expires).
        var time = new Date().getTime(),
            downToTenSecond = Math.round(time/10000);
        // NOTE: On the server we should check forward/backward in time 10 seconds to provide the client with a 30-second window of drift.
        if (!seed1) { // Seeds haven't been defined yet.  Set them.
            seed1 = Math.floor(Math.random()*1000000000);
            seed2 = Math.floor(Math.random()*1000000000);
        }
        var digest = Crypto.MD5(seed1*seed2*downToTenSecond+'');
        return digest.slice(2,11); // Only need a subset of the md5
    },
    isPageHidden: function() {
        // Returns true if the page (browser tab) is hidden (e.g. inactive).  Returns false otherwise.
        return document.hidden || document.msHidden || document.webkitHidden;
    }
});

GateOne.Base.module(GateOne, 'Net', '1.0', ['Base', 'Utils']);
GateOne.Net.charSendTimer = null; // Just a place to keep track of the scrollToBottom timer in sendChars()
GateOne.Base.update(GateOne.Net, {
    sendChars: function() {
        // pop()s out the current charBuffer and sends it to the server.
        // NOTE: This function is normally called every time a key is pressed.
        var u = go.Utils,
            term = localStorage[go.prefs.prefix+'selectedTerminal'],
            termPre = GateOne.terminals[term]['node'];
        if (!go.doingUpdate) { // Only perform a character push if we're *positive* the last character POST has completed.
            go.doingUpdate = true;
            var cb = go.Input.charBuffer,
                charString = "";
            for (var i=0; i<=cb.length; i++) { charString += cb.pop() }
            if (charString != "undefined") {
                var message = {'c': charString};
                go.ws.send(JSON.stringify(message));
                if (go.Net.charSendTimer) {
                    clearTimeout(go.Net.charSendTimer);
                    go.Net.charSendTimer = null;
                }
                go.Net.charSendTimer = setTimeout(function() {
                    // Wrapped in a timeout since it can take a moment for images to process sometimes
                    u.scrollToBottom(termPre);
                }, 350);
                go.doingUpdate = false;
            } else {
                go.doingUpdate = false;
            }
        } else {
            // We are in the middle of processing the last character
            setTimeout(go.Net.sendChars, 100); // Wait 0.1 seconds and retry.
        }
    },
    sendString: function(chars, term) {
        // Like sendChars() but for programmatic use.  *chars* will be sent to *term* on the server.
        var u = go.Utils,
            term = term || localStorage[go.prefs.prefix+'selectedTerminal'],
            message = {'chars': chars, 'term': term};
        go.ws.send(JSON.stringify({'write_chars': message}));
    },
    log: function(msg) {
        // Just logs the message (use for debugging plugins and whatnot)
        GateOne.Logging.logInfo(msg);
    },
    ping: function() {
        // Sends a 'ping' to the server over the WebSocket.  The response from the server is handled by 'pong' below.
        var now = new Date(),
            timestamp = now.toISOString();
        logDebug("PING...");
        GateOne.ws.send(JSON.stringify({'ping': timestamp}));
    },
    pong: function(timestamp) {
        // Called when the server and responds to a 'ping' with a 'pong'.  Returns the latency in ms.
        var dateObj = new Date(timestamp), // Convert the string back into a Date() object
            now = new Date(),
            latency = now.getMilliseconds() - dateObj.getMilliseconds();
        logInfo('PONG: Gate One server round-trip latency: ' + latency + 'ms');
        return latency;
    },
    reauthenticate: function() {
        // This is a courtesy from the Gate One server telling us to re-auth since it is about to close the WebSocket.
        // Delete our session ID as it obviously isn't valid
        // Also delete our 'user' cookie
        GateOne.Utils.deleteCookie('gateone_user', '/', '');
        window.location.reload(); // This *should* force a re-auth if we simply had our session expire (or similar)
    },
    sendDimensions: function(term, /*opt*/ctrl_l) {
        if (!term) {
            var term = localStorage[GateOne.prefs.prefix+'selectedTerminal'];
        }
        var rowAdjust = 2;
        if (!GateOne.Playback) {
            rowAdjust = 1; //  Don't waste that bottom row if no playback plugin
        }
        if (typeof(ctrl_l) == 'undefined') {
            ctrl_l = true;
        }
        var u = go.Utils,
            emDimensions = u.getEmDimensions(go.prefs.goDiv),
            dimensions = u.getRowsAndColumns(go.prefs.goDiv),
            prefs = {
                'term': term,
                'rows': Math.ceil(dimensions.rows - rowAdjust), // -1 for the playback controls and -1 because we're using Math.ceil
                'cols': Math.ceil(dimensions.cols - 7), // -6 for the sidebar + scrollbar and -1 because we're using Math.ceil
                'em_dimensions': emDimensions
            }
        if (!go.prefs.showToolbar && !go.prefs.showTitle) {
            prefs['cols'] = dimensions.cols - 1; // If there's no toolbar and no title there's no reason to have empty space on the right.
        }
        // Apply user-defined rows and cols (if set)
        if (go.prefs.cols) { prefs.cols = go.prefs.cols };
        if (go.prefs.rows) { prefs.rows = go.prefs.rows };
        // Tell the server the new dimensions
        go.ws.send(JSON.stringify({'resize': prefs}));
    },
    connectionError: function(msg) {
        // Displays an error in the browser indicating that there was a problem with the connection.
        // if *msg* is given, it will be added to the standard error.
        var u = go.Utils,
            errorElem = u.createElement('div', {'id': 'error_message'}),
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal')),
            message = "<p>The WebSocket connection was closed.  Will attempt to reconnect every 5 seconds...</p><p>NOTE: Some web proxies do not work properly with WebSockets.</p>";
        logError("Error communicating with server... ");
        terms.forEach(function(termObj) {
            // Passing 'true' here to keep the stuff in localStorage for this term.
            go.Terminal.closeTerminal(termObj.id.split('term')[1], true);
        });
        if (msg) {
            message = "<p>" + msg + "</p>";
        }
        errorElem.innerHTML = message;
        u.getNode(go.prefs.goDiv).appendChild(errorElem);
        setTimeout(go.Net.connect, 5000);
    },
    connect: function() {
        // Connects to the WebSocket defined in GateOne.prefs.url
        // TODO: Get this appending a / if it isn't provided.  Also get it working with ws:// and wss:// URLs in go.prefs.url
        var u = go.Utils,
            errorElem = u.getNode('#'+go.prefs.prefix+'error_message'),
            host = "";
        if (errorElem) {
            // Clean up any errors that might be present
            u.removeElement(errorElem);
        }
        if (u.startsWith("https:", go.prefs.url)) {
            host = go.prefs.url.split('https://')[1]; // e.g. 'localhost:8888/'
            if (u.endsWith('/', host)) {
                host = host.slice(0, -1); // Remove the trailing /
            }
            go.wsURL = "wss://" + host + "/ws";
        } else { // Hopefully no one will be using Gate One without SSL but you never know...
            host = go.prefs.url.split('http://')[1]; // e.g. 'localhost:8888/'
            if (u.endsWith('/', host)) {
                host = host.slice(0, -1); // Remove the trailing /
            }
            go.wsURL = "ws://" + host + "/ws";
        }
        logDebug("GateOne.Net.connect(" + go.wsURL + ")");
        go.ws = new WebSocket(go.wsURL); // For reference, I already tried Socket.IO and custom implementations of long-held HTTP streams...  Only WebSockets provide low enough latency for real-time terminal interaction.  All others were absolutely unacceptable in real-world testing (especially Flash-based...  Wow, really surprised me how bad it was).
        go.ws.onopen = go.Net.onOpen;
        go.ws.onclose = function(evt) {
            // Connection to the server was lost
            logDebug("WebSocket Closed");
            go.Net.connectionError();
        }
        go.ws.onerror = function(evt) {
            // Something went wrong with the WebSocket (who knows?)
            logError("ERROR on WebSocket: " + evt.data);
        }
        go.ws.onmessage = go.Net.onMessage;
        return go.ws;
    },
    onOpen: function() {
        logDebug("onOpen()");
        var u = go.Utils,
            prefix = go.prefs.prefix,
            termwrapper = u.getNode('#'+prefix+'termwrapper'),
            settings = {'auth': go.prefs.auth, 'container': go.prefs.goDiv.split('#')[1], 'prefix': prefix};
        // Load our CSS right away so the dimensions/placement of things is correct.
        u.loadThemeCSS({'theme': go.prefs.theme, 'colors': go.prefs.colors});
        u.loadPluginCSS();
        // Clear the error message if it's still there
        if (termwrapper) {
            termwrapper.innerHTML = "";
        }
        // Load the Web Worker
        logDebug("Attempting to download our WebWorker...");
        go.ws.send(JSON.stringify({'get_webworker': null}));
        // Load the bell sound
        if (go.prefs.bellSound.length) {
            go.User.loadBell({'mimetype': go.prefs.bellSoundType, 'data_uri': go.prefs.bellSound});
        } else {
            logDebug("Attempting to download our bell sound...");
            go.ws.send(JSON.stringify({'get_bell': null}));
        }
        // Check if there are any existing terminals for the current session ID
        go.ws.send(JSON.stringify({'authenticate': settings}));
        setTimeout(function() {
            go.Net.ping(); // Check latency (after things have calmed down a bit =)
        }, 3000);
    },
    onMessage: function (evt) {
        logDebug('message: ' + evt.data);
        var prefix = GateOne.prefs.prefix,
            v = GateOne.Visual,
            n = GateOne.Net,
            u = GateOne.Utils,
            messageObj = null;
        try {
            messageObj = JSON.parse(evt.data);
        } catch (e) {
            // Non-JSON messages coming over the WebSocket are assumed to be errors, display them as-is (could be handy shortcut to display a message instead of using the 'notice' action).
            var noticeContainer = u.getNode('#'+prefix+'noticecontainer'),
                msg = 'Message From Server: ' + evt.data;
            if (noticeContainer) {
                // This only works if Gate One loaded successfuly
                v.displayMessage(msg, 5000, 5000);
            } else {
                // Fallback to this:
                var msgContainer = u.createElement('div', {'id': 'messagecontainer', 'style': {'font-size': '4em', 'background-color': '#000', 'color': '#fff', 'display': 'block', 'position': 'fixed', 'bottom': '2em', 'right': '3em', 'z-index': 9999}}); // Have to use 'style' since CSS may not have been loaded
                msgContainer.innerHTML = msg;
                document.body.appendChild(msgContainer);
                setTimeout(function() {
                    u.removeElement(msgContainer);
                }, 5000);
            }
        }
        // Execute each respective action
        for (var key in messageObj) {
            var val = messageObj[key];
            if (n.actions[key]) {
                n.actions[key](val);
            }
        }
    },
    addAction: function(name, func) {
        // Adds/overwrites actions in GateOne.Net.actions
        GateOne.Net.actions[name] = func;
    },
    setTerminal: function(term) {
        var term = parseInt(term); // Sometimes it will be a string
        localStorage[GateOne.prefs.prefix+'selectedTerminal'] = term;
        GateOne.ws.send(JSON.stringify({'set_terminal': term}));
    },
    killTerminal: function(term) {
        // Called when the user closes a terminal
        GateOne.ws.send(JSON.stringify({'kill_terminal': term}));
    },
    refresh: function(term) {
        // Refreshes the screen (diff method)
        GateOne.ws.send(JSON.stringify({'refresh': term}));
    },
    fullRefresh: function(term) {
        // Performs a full screen refresh (Ctrl-l)
        GateOne.ws.send(JSON.stringify({'full_refresh': term}));
    }
});
GateOne.Base.module(GateOne, "Input", '1.0', ['Base', 'Utils']);
GateOne.Input.charBuffer = []; // Queue for sending characters to the server
GateOne.Input.metaHeld = false; // Used to emulate the "meta" modifier since some browsers/platforms don't get it right.
// F11 toggles fullscreen mode in most browsers.  If F11 is pressed once it will act as a regular F11 keystroke in the terminal.  If it is pressed twice rapidly in succession (within 0.750 seconds) it will execute the regular browser keystroke (enabling or disabling fullscreen mode).
// Why did I code it this way?  If the user is unaware of this feature when they enter fullscreen mode, they might panic and hit F11 a bunch of times and it's likely they'll break out of fullscreen mode as an instinct :).  The message indicating the behavior will probably help too :D
GateOne.Input.F11 = false;
GateOne.Input.F11timer = null;
GateOne.Input.handledKeystroke = false;
GateOne.Input.handledPaste = false;
GateOne.Input.shortcuts = {}; // Shortcuts added via registerShortcut() wind up here.  They will end up looking like this:
// 'KEY_N': [{'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Terminal.newTerminal()'}]
GateOne.Base.update(GateOne.Input, {
    // This object holds all of the special key handlers and controls the "escape"/"escape escape" sequences
    goDivMouseDown: function(e) {
        // TODO: Add a shift-click context menu for special operations.  Why shift and not ctrl-click or alt-click?  Some platforms use ctrl-click to emulate right-click and some platforms use alt-click to move windows around.
        var u = go.Utils,
            m = go.Input.mouse(e),
            selectedText = u.getSelText();
        // This is kinda neat:  By setting "contentEditable = true" we can right-click to paste.
        // However, we only want this when the user is actually bringing up the context menu because
        // having it enabled slows down screen updates by a non-trivial amount.
        if (m.button.middle) {
            if (selectedText.length) {
                // Only preventDefault if text is selected so we don't muck up X11-style middle-click pasting
                e.preventDefault();
                go.Input.queue(selectedText);
                go.Net.sendChars();
                go.Input.handledPaste = true;
            }
        } /*else {*/
//             var panels = u.getNodes(go.prefs.goDiv + ' .panel'),
//                 visiblePanel = false;
//                 u.getNode(go.prefs.goDiv).focus();
            // Hide all the panels
//             for (var i in u.toArray(panels)) {
//                 if (v.getTransform(panel) != 'scale(0)') {
//                     visiblePanel = true;
//                 }
//             }
//                 if (!visiblePanel) {
//                     goDiv.contentEditable = true;
//                 }
//         }
    },
    capture: function() {
        // Returns focus to goDiv and ensures that it is capturing onkeydown events properly
        var u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv);
        goDiv.tabIndex = 1; // Just in case--this is necessary to set focus
        goDiv.onkeydown = go.Input.onKeyDown;
        goDiv.onkeyup = go.Input.onKeyUp; // Only used to emulate the meta key modifier (if necessary)
        goDiv.onkeypress = go.Input.emulateKeyFallback;
        goDiv.focus();
        // NOTE: This might not be necessary anymore with the pastearea:
        goDiv.onpaste = function(e) {
            if (!go.Input.handledPaste) {
                // Grab the text being pasted
                var contents = e.clipboardData.getData('Text');
                // Don't actually paste the text where the user clicked
                e.preventDefault();
                // Queue it up and send the characters as if we typed them in
                GateOne.Input.queue(contents);
                GateOne.Net.sendChars();
            }
            go.Input.handledPaste = false;
        }
        goDiv.onmousedown = go.Input.goDivMouseDown;
        goDiv.onmouseup = function(e) {
            // Once the user is done pasting (or clicking), set it back to false for speed
//             goDiv.contentEditable = false; // Having this as false makes screen updates faster
            var selectedText = u.getSelText();
            if (selectedText) {
                // Don't show the pastearea as it will prevent the user from right-clicking to copy.
                return;
            }
            if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA" || document.activeElement.tagName == "SELECT" || document.activeElement.tagName == "BUTTON") {
                return; // Don't do anything if the user is editing text in an input/textarea or is using a select element (so the up/down arrows work)
            }
            if (!go.Visual.gridView) {
                u.showElements('.pastearea');
            }
            goDiv.focus();
        }
        // This is necessary because sometimes the timer to re-show the pastearea finishes before the user does something that would otherwise re-show the pastearea (if that makes sense).
        try {
            u.showElements('.pastearea');
        } catch (e) {
            u.noop();
        }
    },
    disableCapture: function() {
        // Turns off keyboard input and certain mouse capture events so that other things (e.g. forms) can work properly
        var u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv);
//         goDiv.contentEditable = false; // This needs to be turned off or it might capture paste events (which is really annoying when you're trying to edit a form)
        goDiv.onpaste = null;
        goDiv.tabIndex = null;
        goDiv.onkeydown = null;
        goDiv.onkeyup = null;
        goDiv.onkeypress = null;
        goDiv.onmousedown = null;
        goDiv.onmouseup = null;
        try {
            u.hideElements('.pastearea');
        } catch (e) {
            u.noop();
        }
    },
    queue: function(text) {
        // Adds 'text' to the charBuffer Array
        GateOne.Input.charBuffer.unshift(text);
    },
    bufferEscSeq: function(chars) {
        // Prepends ESC to special character sequences (e.g. PgUp, PgDown, Arrow keys, etc) before adding them to the charBuffer
        GateOne.Input.queue(ESC + chars);
    },
    modifiers: function(e) {
        // Given an event object, returns an object with booleans for each modifier key (shift, alt, ctrl, meta)
        var out = {
            shift: false,
            alt: false,
            ctrl: false,
            meta: false
        }
        if (e.altKey) out.alt = true;
        if (e.shiftKey) out.shift = true;
        if (e.ctrlKey) out.ctrl = true;
        if (e.metaKey) out.meta = true;
        // Only emulate the meta modifier if it isn't working
        if (out.meta == false && GateOne.Input.metaHeld) {
            // Gotta emulate it
            out.meta = true;
        }
        return out;
    },
    specialKeys: { // Note: Copied from MochiKit.Signal
        // Also note:  This lookup table is expanded further on in the code
        8: 'KEY_BACKSPACE',
        9: 'KEY_TAB',
        12: 'KEY_NUM_PAD_CLEAR', // weird, for Safari and Mac FF only
        13: 'KEY_ENTER',
        16: 'KEY_SHIFT',
        17: 'KEY_CTRL',
        18: 'KEY_ALT',
        19: 'KEY_PAUSE',
        20: 'KEY_CAPS_LOCK',
        27: 'KEY_ESCAPE',
        32: 'KEY_SPACEBAR',
        33: 'KEY_PAGE_UP',
        34: 'KEY_PAGE_DOWN',
        35: 'KEY_END',
        36: 'KEY_HOME',
        37: 'KEY_ARROW_LEFT',
        38: 'KEY_ARROW_UP',
        39: 'KEY_ARROW_RIGHT',
        40: 'KEY_ARROW_DOWN',
        42: 'KEY_PRINT_SCREEN', // Might actually be the code for F13
        44: 'KEY_PRINT_SCREEN',
        45: 'KEY_INSERT',
        46: 'KEY_DELETE',
        59: 'KEY_SEMICOLON', // weird, for Safari and IE only
        61: 'KEY_EQUALS_SIGN', // Strange: In Firefox this is 61, in Chrome it is 187
        91: 'KEY_WINDOWS_LEFT',
        92: 'KEY_WINDOWS_RIGHT',
        93: 'KEY_SELECT',
        106: 'KEY_NUM_PAD_ASTERISK',
        107: 'KEY_NUM_PAD_PLUS_SIGN',
        109: 'KEY_NUM_PAD_HYPHEN-MINUS', // Strange: Firefox has this the regular hyphen key (i.e. not the one on the num pad)
        110: 'KEY_NUM_PAD_FULL_STOP',
        111: 'KEY_NUM_PAD_SOLIDUS',
        144: 'KEY_NUM_LOCK',
        145: 'KEY_SCROLL_LOCK',
        186: 'KEY_SEMICOLON',
        187: 'KEY_EQUALS_SIGN',
        188: 'KEY_COMMA',
        189: 'KEY_HYPHEN-MINUS',
        190: 'KEY_FULL_STOP',
        191: 'KEY_SOLIDUS',
        192: 'KEY_GRAVE_ACCENT',
        219: 'KEY_LEFT_SQUARE_BRACKET',
        220: 'KEY_REVERSE_SOLIDUS',
        221: 'KEY_RIGHT_SQUARE_BRACKET',
        222: 'KEY_APOSTROPHE',
        229: 'KEY_COMPOSE' // NOTE: Firefox doesn't register a key code for the compose key!
        // undefined: 'KEY_UNKNOWN'
    },
    specialMacKeys: { // Note: Copied from MochiKit.Signal
        3: 'KEY_ENTER',
        63289: 'KEY_NUM_PAD_CLEAR',
        63276: 'KEY_PAGE_UP',
        63277: 'KEY_PAGE_DOWN',
        63275: 'KEY_END',
        63273: 'KEY_HOME',
        63234: 'KEY_ARROW_LEFT',
        63232: 'KEY_ARROW_UP',
        63235: 'KEY_ARROW_RIGHT',
        63233: 'KEY_ARROW_DOWN',
        63302: 'KEY_INSERT',
        63272: 'KEY_DELETE'
    },
    key: function(e) {
        // Given an event object, returns an object:
        // {
        //    type: <event type>, // Just preserves it
        //    code: <the key code>,
        //    string: 'KEY_<key string>'
        // }
        var goIn = GateOne.Input,
            k = { type: e.type };
        if (e.type == 'keydown' || e.type == 'keyup') {
            k.code = e.keyCode;
            k.string = (goIn.specialKeys[k.code] || goIn.specialMacKeys[k.code] || 'KEY_UNKNOWN');
            return k;
        } else if (typeof(e.charCode) != 'undefined' && e.charCode !== 0 && !goIn.specialMacKeys[e.charCode]) {
            k.code = e.charCode;
            k.string = String.fromCharCode(k.code);
            return k;
        } else if (e.keyCode && typeof(e.charCode) == 'undefined') { // IE
            k.code = e.keyCode;
            k.string = String.fromCharCode(k.code);
            return k;
        }
        return undefined;
    },
    mouse: function(e) {
        // Given an event object, returns an object:
        // {
        //    type:   <event type>, // Just preserves it
        //    left:   <true/false>,
        //    right:  <true/false>,
        //    middle: <true/false>,
        // }
        // Note: Based on functions from MochiKit.Signal
        var m = { type: e.type, button: {} };
        if (e.type != 'mousemove' && e.type != 'mousewheel') {
            if (e.which) { // Use 'which' if possible (modern and consistent)
                m.button.left = (e.which == 1);
                m.button.middle = (e.which == 2);
                m.button.right = (e.which == 3);
            } else { // Have to use button
                m.button.left = !!(e.button & 1);
                m.button.right = !!(e.button & 2);
                m.button.middle = !!(e.button & 4);
            }
        }
        if (e.type == 'mousewheel' || e.type == 'DOMMouseScroll') {
            m.wheel = { x: 0, y: 0 };
            if (e.wheelDeltaX || e.wheelDeltaY) {
                m.wheel.x = e.wheelDeltaX / -40 || 0;
                m.wheel.y = e.wheelDeltaY / -40 || 0;
            } else if (e.wheelDelta) {
                m.wheel.y = e.wheelDelta / -40;
            } else {
                m.wheel.y = e.detail || 0;
            }
        }
        return m;
    },
    onKeyUp: function(e) {
        // Used in conjunction with GateOne.Input.modifiers() and GateOne.Input.onKeyDown() to emulate the meta key modifier using KEY_WINDOWS_LEFT and KEY_WINDOWS_RIGHT since "meta" doesn't work as an actual modifier on some browsers/platforms.
        var goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e);
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = false;
        }
    },
    onKeyDown: function(e) {
        // Handles keystroke events by determining which kind of event occurred and how/whether it should be sent to the server as specific characters or escape sequences.
        var goIn = go.Input,
            container = go.Utils.getNode(go.prefs.goDiv),
            key = goIn.key(e),
            modifiers = goIn.modifiers(e),
            goDivStyle = document.defaultView.getComputedStyle(container, null);
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = true; // Lets us emulate the "meta" modifier on browsers/platforms that don't get it right.
            return true; // Save some CPU
        }
        if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA" || document.activeElement.tagName == "SELECT" || document.activeElement.tagName == "BUTTON") {
            return; // Let the browser handle it if the user is editing something
            // NOTE: Doesn't actually work so well so we have GateOne.Input.disableCapture() as a fallback :)
        }
        if (container) { // This display check prevents an exception when someone presses a key before the document has been fully loaded
            if (goDivStyle.display != "none" && goDivStyle.opacity != "0") {
                // This loops over everything in *shortcuts* and executes actions for any matching keyboard shortcuts that have been defined.
                for (var k in goIn.shortcuts) {
                    if (key.string == k) {
                        var matched = false;
                        goIn.shortcuts[k].forEach(function(shortcut) {
                            var match = true; // Have to use some reverse logic here...  Slightly confusing but if you can think of a better way by all means send in a patch!
                            for (var mod in modifiers) {
                                if (modifiers[mod] != shortcut.modifiers[mod]) {
                                    match = false;
                                }
                            }
                            if (match) {
                                if (typeof(shortcut.preventDefault) == 'undefined') {
                                    // if not set in the shortcut object assume preventDefault() is desired.
                                    e.preventDefault();
                                } else if (shortcut.preventDefault == true) {
                                    // Explicitly set
                                    e.preventDefault();
                                }
                                if (typeof(shortcut['action']) == 'string') {
                                    eval(shortcut['action']);
                                } else if (typeof(shortcut['action']) == 'function') {
                                    shortcut['action'](e); // Pass it the event
                                }
                                matched = true;
                            }
                        });
                        if (matched) {
                            // Stop further processing of this keystroke
                            return;
                        }
                    }
                }
                // If a non-shift modifier was depressed, emulate the given keystroke:
                if (modifiers.alt || modifiers.ctrl || modifiers.meta) {
                    goIn.emulateKeyCombo(e);
                    go.Net.sendChars();
                } else { // Just send the key if no modifiers:
                    goIn.emulateKey(e);
                    go.Net.sendChars();
                }
            }
        }
    },
    // TODO: Add a GUI for configuring the keyboard.
    // TODO: Remove the 'xterm' values and instead make an xterm-specific keyTable that only contains the difference.  Then change the logic in the keypress functions to first check for overridden values before falling back to the default keyTable.
    keyTable: {
        // Keys that need special handling.  'default' means vt100/vt220 (for the most part).  These can get overridden by plugins or the user (GUI forthcoming)
        // NOTE: If a key is set to null that means it won't send anything to the server onKeyDown (at all).
        'KEY_1': {'alt': ESC+"1", 'ctrl': "1"},
        'KEY_2': {'alt': ESC+"2", 'ctrl': String.fromCharCode(0)},
        'KEY_3': {'alt': ESC+"3", 'ctrl': ESC},
        'KEY_4': {'alt': ESC+"4", 'ctrl': String.fromCharCode(28)},
        'KEY_5': {'alt': ESC+"5", 'ctrl': String.fromCharCode(29)},
        'KEY_6': {'alt': ESC+"6", 'ctrl': String.fromCharCode(30)},
        'KEY_7': {'alt': ESC+"7", 'ctrl': String.fromCharCode(31)},
        'KEY_8': {'alt': ESC+"8", 'ctrl': String.fromCharCode(32)},
        'KEY_9': {'alt': ESC+"9", 'ctrl': "9"},
        'KEY_0': {'alt': ESC+"0", 'ctrl': "0"},
        'KEY_F1': {'default': ESC+"OP", 'alt': ESC+"O3P"}, // NOTE to self: xterm/vt100/vt220, for 'linux' (and possibly others) use [[A, [[B, [[C, [[D, and [[E
        'KEY_F2': {'default': ESC+"OQ", 'alt': ESC+"O3Q"},
        'KEY_F3': {'default': ESC+"OR", 'alt': ESC+"O3R"},
        'KEY_F4': {'default': ESC+"OS", 'alt': ESC+"O3S"},
        'KEY_F5': {'default': ESC+"[15~", 'alt': ESC+"[15;3~"},
        'KEY_F6': {'default': ESC+"[17~", 'alt': ESC+"[17;3~"},
        'KEY_F7': {'default': ESC+"[18~", 'alt': ESC+"[18;3~"},
        'KEY_F8': {'default': ESC+"[19~", 'alt': ESC+"[19;3~"},
        'KEY_F9': {'default': ESC+"[20~", 'alt': ESC+"[20;3~"},
        'KEY_F10': {'default': ESC+"[21~", 'alt': ESC+"[21;3~"},
        'KEY_F11': {'default': ESC+"[23~", 'alt': ESC+"[23;3~"},
        'KEY_F12': {'default': ESC+"[24~", 'alt': ESC+"[24;3~"},
        'KEY_F13': {'default': ESC+"[25~", 'alt': ESC+"[25;3~", 'xterm': ESC+"O2P"},
        'KEY_F14': {'default': ESC+"[26~", 'alt': ESC+"[26;3~", 'xterm': ESC+"O2Q"},
        'KEY_F15': {'default': ESC+"[28~", 'alt': ESC+"[28;3~", 'xterm': ESC+"O2R"},
        'KEY_F16': {'default': ESC+"[29~", 'alt': ESC+"[29;3~", 'xterm': ESC+"O2S"},
        'KEY_F17': {'default': ESC+"[31~", 'alt': ESC+"[31;3~", 'xterm': ESC+"[15;2~"},
        'KEY_F18': {'default': ESC+"[32~", 'alt': ESC+"[32;3~", 'xterm': ESC+"[17;2~"},
        'KEY_F19': {'default': ESC+"[33~", 'alt': ESC+"[33;3~", 'xterm': ESC+"[18;2~"},
        'KEY_F20': {'default': ESC+"[34~", 'alt': ESC+"[34;3~", 'xterm': ESC+"[19;2~"},
        'KEY_F21': {'default': ESC+"[20;2~"}, // All F-keys beyond this point are xterm-style (vt220 only goes up to F20)
        'KEY_F22': {'default': ESC+"[21;2~"},
        'KEY_F23': {'default': ESC+"[23;2~"},
        'KEY_F24': {'default': ESC+"[24;2~"},
        'KEY_F25': {'default': ESC+"O5P"},
        'KEY_F26': {'default': ESC+"O5Q"},
        'KEY_F27': {'default': ESC+"O5R"},
        'KEY_F28': {'default': ESC+"O5S"},
        'KEY_F29': {'default': ESC+"[15;5~"},
        'KEY_F30': {'default': ESC+"[17;5~"},
        'KEY_F31': {'default': ESC+"[18;5~"},
        'KEY_F32': {'default': ESC+"[19;5~"},
        'KEY_F33': {'default': ESC+"[20;5~"},
        'KEY_F34': {'default': ESC+"[21;5~"},
        'KEY_F35': {'default': ESC+"[23;5~"},
        'KEY_F36': {'default': ESC+"[24;5~"},
        'KEY_F37': {'default': ESC+"O6P"},
        'KEY_F38': {'default': ESC+"O6Q"},
        'KEY_F39': {'default': ESC+"O6R"},
        'KEY_F40': {'default': ESC+"O6S"},
        'KEY_F41': {'default': ESC+"[15;6~"},
        'KEY_F42': {'default': ESC+"[17;6~"},
        'KEY_F43': {'default': ESC+"[18;6~"},
        'KEY_F44': {'default': ESC+"[19;6~"},
        'KEY_F45': {'default': ESC+"[20;6~"},
        'KEY_F46': {'default': ESC+"[21;6~"},
        'KEY_F47': {'default': ESC+"[23;6~"},
        'KEY_F48': {'default': ESC+"[24;6~"},
        'KEY_ENTER': {'default': String.fromCharCode(13), 'ctrl': String.fromCharCode(13)},
        'KEY_BACKSPACE': {'default': String.fromCharCode(127), 'alt': ESC+String.fromCharCode(8)}, // Default is ^?. Will be changable to ^H eventually.
        'KEY_NUM_PAD_CLEAR': String.fromCharCode(12), // Not sure if this will do anything
        'KEY_SHIFT': null,
        'KEY_CTRL': null,
        'KEY_ALT': null,
        'KEY_PAUSE': {'default': ESC+"[28~", 'xterm': ESC+"O2R"}, // Same as F15
        'KEY_CAPS_LOCK': null,
        'KEY_ESCAPE': {'default': ESC},
        'KEY_TAB': {'default': String.fromCharCode(9), 'shift': ESC+"[Z"},
        'KEY_SPACEBAR': {'ctrl': String.fromCharCode(0)}, // NOTE: Do we *really* need to have an appmode option for this?
        'KEY_PAGE_UP': {'default': ESC+"[5~", 'alt': ESC+"[5;3~"}, // ^[[5~
        'KEY_PAGE_DOWN': {'default': ESC+"[6~", 'alt': ESC+"[6;3~"}, // ^[[6~
        'KEY_END': {'default': ESC+"[F", 'meta': ESC+"[1;1F", 'shift': ESC+"[1;2F", 'alt': ESC+"[1;3F", 'alt-shift': ESC+"[1;4F", 'ctrl': ESC+"[1;5F", 'ctrl-shift': ESC+"[1;6F", 'appmode': ESC+"OF"},
        'KEY_HOME': {'default': ESC+"[H", 'meta': ESC+"[1;1H", 'shift': ESC+"[1;2H", 'alt': ESC+"[1;3H", 'alt-shift': ESC+"[1;4H", 'ctrl': ESC+"[1;5H", 'ctrl-shift': ESC+"[1;6H", 'appmode': ESC+"OH"},
        'KEY_ARROW_LEFT': {'default': ESC+"[D", 'alt': ESC+"[1;3D", 'ctrl': ESC+"[1;5D", 'appmode': ESC+"OD"},
        'KEY_ARROW_UP': {'default': ESC+"[A", 'alt': ESC+"[1;3A", 'ctrl': ESC+"[1;5A", 'appmode': ESC+"OA"},
        'KEY_ARROW_RIGHT': {'default': ESC+"[C", 'alt': ESC+"[1;3C", 'ctrl': ESC+"[1;5C", 'appmode': ESC+"OC"},
        'KEY_ARROW_DOWN': {'default': ESC+"[B", 'alt': ESC+"[1;3B", 'ctrl': ESC+"[1;5B", 'appmode': ESC+"OB"},
        'KEY_PRINT_SCREEN': {'default': ESC+"[25~", 'xterm': ESC+"O2P"}, // Same as F13
        'KEY_INSERT': {'default': ESC+"[2~", 'meta': ESC+"[2;1~", 'alt': ESC+"[2;3~", 'alt-shift': ESC+"[2;4~"},
        'KEY_DELETE': {'default': ESC+"[3~", 'shift': ESC+"[3;2~", 'alt': ESC+"[3;3~", 'alt-shift': ESC+"[3;4~", 'ctrl': ESC+"[3;5~"},
        'KEY_WINDOWS_LEFT': null,
        'KEY_WINDOWS_RIGHT': null,
        'KEY_SELECT': String.fromCharCode(93),
        'KEY_NUM_PAD_ASTERISK': {'alt': ESC+"*"},
        'KEY_NUM_PAD_PLUS_SIGN': {'alt': ESC+"+"},
// NOTE: The regular hyphen key shows up as a num pad hyphen in Firefox 7
        'KEY_NUM_PAD_HYPHEN-MINUS': {'shift': "_", 'alt': ESC+"-", 'alt-shift': ESC+"_"},
        'KEY_NUM_PAD_FULL_STOP': {'alt': ESC+"."},
        'KEY_NUM_PAD_SOLIDUS': {'alt': ESC+"/"},
        'KEY_NUM_LOCK': null, // TODO: Double-check that NumLock isn't supposed to send some sort of wacky ESC sequence
        'KEY_SCROLL_LOCK': {'default': ESC+"[26~", 'xterm': ESC+"O2Q"}, // Same as F14
        'KEY_SEMICOLON': {'alt': ESC+";", 'alt-shift': ESC+":"},
        'KEY_EQUALS_SIGN': {'alt': ESC+"=", 'alt-shift': ESC+"+"},
        'KEY_COMMA': {'alt': ESC+",", 'alt-shift': ESC+"<"},
        'KEY_HYPHEN-MINUS': {'shift': "_", 'alt': ESC+"-", 'alt-shift': ESC+"_"},
        'KEY_FULL_STOP': {'alt': ESC+".", 'alt-shift': ESC+">"},
        'KEY_SOLIDUS': {'alt': ESC+"/", 'alt-shift': ESC+"?", 'ctrl': String.fromCharCode(31), 'ctrl-shift': String.fromCharCode(31)},
        'KEY_GRAVE_ACCENT':  {'alt': ESC+"`", 'alt-shift': ESC+"~", 'ctrl-shift': String.fromCharCode(30)},
        'KEY_LEFT_SQUARE_BRACKET':  {'alt': ESC+"[", 'alt-shift': ESC+"{", 'ctrl': ESC},
        'KEY_REVERSE_SOLIDUS':  {'alt': ESC+"\\", 'alt-shift': ESC+"|", 'ctrl': String.fromCharCode(28)},
        'KEY_RIGHT_SQUARE_BRACKET':  {'alt': ESC+"]", 'alt-shift': ESC+"}", 'ctrl': String.fromCharCode(29)},
        'KEY_APOSTROPHE': {'alt': ESC+"'", 'alt-shift': ESC+'"'}
    },
    registerShortcut: function (keyString, shortcutObj) {
        // Used to register a shortcut.  The point being to prevent one shortcut being clobbered by another if they happen have the same base key.
        // Example usage:  GateOne.Input.registerShortcut('KEY_G', {
        //     'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false},
        //     'action': 'GateOne.Visual.toggleGridView()',
        //     'preventDefault': true
        // });
        // NOTE:  If preventDefault is not given in the shortcutObj it is assumed to be true
        if (GateOne.Input.shortcuts[keyString]) {
            // Already exists, overwrite existing if conflict (and log it) or append it
            var overwrote = false;
            GateOne.Input.shortcuts[keyString].forEach(function(shortcut) {
                var match = true;
                for (var mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != shortcut.modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match...  Log and overwrite it
                    logWarning("Overwriting existing shortcut for: " + keyString);
                    shortcut = shortcutObj;
                    overwrote = true;
                }
            });
            if (!overwrote) {
                // No existing shortcut matches, append the new one
                GateOne.Input.shortcuts[keyString].push(shortcutObj);
            }
        } else {
            // Create a new shortcut with the given parameters
            GateOne.Input.shortcuts[keyString] = [shortcutObj];
        }
    },
    humanReadableShortcuts: function() {
        // Returns a human-readable string representing the objects inside of GateOne.Input.shortcuts. Each string will be in the form of:
        //  <modifiers>-<key>
        // Example:
        //  Ctrl-Alt-Delete
        var goIn = GateOne.Input,
            out = [];
        for (var i in goIn.shortcuts) {
            console.log('i: ' + i);
            var splitKey = i.split('_'),
                keyName = '',
                outStr = '';
            splitKey.splice(0,1); // Get rid of the KEY part
            for (var j in splitKey) {
                keyName += splitKey[j].toLowerCase() + ' ';
            }
            keyName.trim();
            for (var j in goIn.shortcuts[i]) {
                if (goIn.shortcuts[i][j].modifiers) {
                    outStr += j + '-';
                }
            }
            outStr += keyName;
            out.push(outStr);
        }
        return out;
    },
    // NOTE:  Work-in-progress
    moveCursorUp: function() {
        // Moves the cursor up one row
        var u = GateOne.Utils,
            cursor = u.getNode(GateOne.prefs.goDiv + ' cursor')
    },
    emulateKey: function(e, skipF11check) {
        // This method handles all regular keys registered via onkeydown events (not onkeypress)
        // If *skipF11check* is not undefined (or null), the F11 (fullscreen check) logic will be skipped.
        // NOTE: Shift+key also winds up being handled by this function.
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e),
            buffer = goIn.bufferEscSeq,
            q = function(c) {
                e.preventDefault();
                goIn.queue(c);
                goIn.handledKeystroke = true;
            },
            term = localStorage[prefix+'selectedTerminal'],
            keyString = String.fromCharCode(key.code);
        logDebug("emulateKey() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + u.items(modifiers));
        goIn.handledKeystroke = false;
        // Need some special logic for the F11 key since it controls fullscreen mode and without it, users could get stuck in fullscreen mode.
        if (!modifiers.shift && goIn.F11 == true && !skipF11check) { // This is the *second* time F11 was pressed within 0.750 seconds.
            goIn.F11 = false;
            clearTimeout(goIn.F11timer);
            return; // Don't proceed further
        } else if (key.string == 'KEY_F11' && !skipF11check) { // Start tracking a new F11 event
            goIn.F11 = true;
            e.preventDefault();
            clearTimeout(goIn.F11timer);
            goIn.F11timer = setTimeout(function() {
                goIn.F11 = false;
                goIn.emulateKey(e, true); // Pretend this never happened
                go.Net.sendChars();
            }, 750);
            GateOne.Visual.displayMessage("NOTE: Rapidly pressing F11 twice will enable/disable fullscreen mode.");
            return;
        }
        if (key.string == "KEY_UNKNOWN") {
            return; // Without this, unknown keys end up sending a null character which isn't a good idea =)
        }
        // Try using the keyTable first (so everything can be overridden)
        if (key.string in goIn.keyTable) {
            if (goIn.keyTable[key.string]) { // Not null
                var mode = go.terminals[term]['mode'];
                if (!modifiers.shift) { // Non-modified keypress
                    if (key.string == 'KEY_BACKSPACE') {
                        // So we can switch between ^? and ^H
                        q(go.terminals[term]['backspace']);
                    } else {
                        if (goIn.keyTable[key.string][mode]) {
                            q(goIn.keyTable[key.string][mode]);
                        } else if (goIn.keyTable[key.string]["default"]) {
                            // Fall back to using default
                            q(goIn.keyTable[key.string]["default"]);
                        }
                    }
                } else { // Shift was held down
                    if (goIn.keyTable[key.string]['shift']) {
                        q(goIn.keyTable[key.string]['shift']);
                    } else if (goIn.keyTable[key.string][mode]) { // Fall back to the mode's non-shift value
                        q(goIn.keyTable[key.string][mode]);
                    }
                }
            } else {
                return; // Don't continue (null means null!)
            }
        }
        q = null;
    },
    emulateKeyCombo: function(e) {
        // This method translates ctrl/alt/meta key combos such as ctrl-c into their string equivalents.
        // NOTE: This differs from registerShortcut in that it handles sending keystrokes to the server.  registerShortcut is meant for client-side actions that call JavaScript (though, you certainly *could* send keystrokes via registerShortcut via JavaScript =)
        var goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e),
            buffer = goIn.bufferEscSeq,
            q = function(c) {
                e.preventDefault();
                goIn.queue(c);
                goIn.handledKeystroke = true;
            };
        if (key.string == "KEY_SHIFT" || key.string == "KEY_ALT" || key.string == "KEY_CTRL" || key.string == "KEY_WINDOWS_LEFT" || key.string == "KEY_WINDOWS_RIGHT" || key.string == "KEY_UNKNOWN") {
            return; // For some reason if you press any combo of these keys at the same time it occasionally will send the keystroke as the second key you press.  It's odd but this ensures we don't act upon such things.
        }
        logDebug("emulateKeyCombo() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        goIn.handledKeystroke = false;
        // Handle ctrl-<key> and ctrl-shift-<key> combos
        if (modifiers.ctrl && !modifiers.alt && !modifiers.meta) {
            if (goIn.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (goIn.keyTable[key.string]['ctrl']) {
                        q(goIn.keyTable[key.string]['ctrl']);
                    }
                } else {
                    if (goIn.keyTable[key.string]['ctrl-shift']) {
                        q(goIn.keyTable[key.string]['ctrl-shift']);
                    }
                }
            } else {
                // Basic ASCII characters are pretty easy to convert to ctrl-<key> sequences...
                if (key.code >= 97 && key.code <= 122) q(String.fromCharCode(key.code - 96)); // Ctrl-[a-z]
                else if (key.code >= 65 && key.code <= 90) {
                    if (key.code == 76) { // Ctrl-l gets some extra love
                        go.Net.fullRefresh(localStorage[go.prefs.prefix+'selectedTerminal']);
                        q(String.fromCharCode(key.code - 64));
                    } else {
                        q(String.fromCharCode(key.code - 64)); // More Ctrl-[a-z]
                    }
                }
            }
        }
        // Handle alt-<key> and alt-shift-<key> combos
        if (modifiers.alt && !modifiers.ctrl && !modifiers.meta) {
            if (goIn.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (goIn.keyTable[key.string]['alt']) {
                        q(goIn.keyTable[key.string]['alt']);
                    }
                } else {
                    if (goIn.keyTable[key.string]['alt-shift']) {
                        q(goIn.keyTable[key.string]['alt-shift']);
                    }
                }
            } else if (key.code >= 65 && key.code <= 90) {
                // Basic Alt-<key> combos are pretty straightforward (upper-case)
                if (!modifiers.shift) {
                    q(ESC+String.fromCharCode(key.code+32));
                } else {
                    q(ESC+String.fromCharCode(key.code));
                }
            }
        }
        // Handle meta-<key> and meta-shift-<key> combos
        if (!modifiers.alt && !modifiers.ctrl && modifiers.meta) {
            if (goIn.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (goIn.keyTable[key.string]['meta']) {
                        q(goIn.keyTable[key.string]['meta']);
                    }
                } else {
                    if (goIn.keyTable[key.string]['meta-shift']) {
                        q(goIn.keyTable[key.string]['meta-shift']);
                    } else {
                        // Fall back to just the meta (ignore the shift)
                        if (goIn.keyTable[key.string]['shift']) {
                            q(goIn.keyTable[key.string]['shift']);
                        }
                    }
                }
            }
        }
        // Handle ctrl-alt-<key> and ctrl-alt-shift-<key> combos
        if (modifiers.alt && modifiers.ctrl && !modifiers.meta) {
            if (goIn.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (goIn.keyTable[key.string]['ctrl-alt']) {
                        q(goIn.keyTable[key.string]['ctrl-alt']);
                    }
                    // According to my research, AltGr is the same as sending ctrl-alt (in browsers anyway).  If this is incorrect please post it as an issue on Github!
                    if (goIn.keyTable[key.string]['altgr']) {
                        q(goIn.keyTable[key.string]['altgr']);
                    }
                } else {
                    if (goIn.keyTable[key.string]['ctrl-alt-shift']) {
                        q(goIn.keyTable[key.string]['ctrl-alt-shift']);
                    }
                    if (goIn.keyTable[key.string]['altgr-shift']) {
                        q(goIn.keyTable[key.string]['altgr-shift']);
                    }
                }
            }
        }
        // Handle ctrl-alt-meta-<key> and ctrl-alt-meta-shift-<key> combos
        if (modifiers.alt && modifiers.ctrl && modifiers.meta) {
            if (goIn.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (goIn.keyTable[key.string]['ctrl-alt-meta']) {
                        q(goIn.keyTable[key.string]['ctrl-alt-meta']);
                    }
                    if (goIn.keyTable[key.string]['altgr-meta']) {
                        q(goIn.keyTable[key.string]['altgr-meta']);
                    }
                } else {
                    if (goIn.keyTable[key.string]['ctrl-alt-meta-shift']) {
                        q(goIn.keyTable[key.string]['ctrl-alt-meta-shift']);
                    }
                    if (goIn.keyTable[key.string]['altgr-meta-shift']) {
                        q(goIn.keyTable[key.string]['altgr-meta-shift']);
                    }
                }
            }
        }
        q = null;
    },
    emulateKeyFallback: function(e) {
        // Meant to be attached to (GateOne.prefs.goDiv).onkeypress, will queue the (character) result of a keypress event if an unknown modifier key is held.
        // Without this, 3rd and 5th level keystroke events (i.e. the stuff you get when you hold down various combinations of AltGr+<key>) would not work.
        logDebug("emulateKeyFallback() charCode: " + e.charCode + ", keyCode: " + e.keyCode);
        var goIn = go.Input,
            q = function(c) {
                e.preventDefault();
                goIn.queue(c);
                goIn.handledKeystroke = false;
            };
        if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA" || document.activeElement.tagName == "SELECT" || document.activeElement.tagName == "BUTTON") {
            return; // Let the browser handle it if the user is editing something
            // NOTE: Doesn't actually work so well so we have GateOne.Input.disableCapture() as a fallback :)
        }
        if (!goIn.handledKeystroke) {
            if (e.charCode != 0) {
                q(String.fromCharCode(e.charCode));
                go.Net.sendChars();
            }
        }
        q = null;
    },
});
// Expand GateOne.Input.specialKeys to be more complete:
(function () { // Note:  Copied from MochiKit.Signal.
// Jonathan Gardner, Beau Hartshorne, and Bob Ippolito are JavaScript heroes!
    /* for KEY_0 - KEY_9 */
    var specialKeys = GateOne.Input.specialKeys;
    for (var i = 48; i <= 57; i++) {
        specialKeys[i] = 'KEY_' + (i - 48);
    }

    /* for KEY_A - KEY_Z */
    for (var i = 65; i <= 90; i++) {
        specialKeys[i] = 'KEY_' + String.fromCharCode(i);
    }

    /* for KEY_NUM_PAD_0 - KEY_NUM_PAD_9 */
    for (var i = 96; i <= 105; i++) {
        specialKeys[i] = 'KEY_NUM_PAD_' + (i - 96);
    }

    /* for KEY_F1 - KEY_F12 */
    for (var i = 112; i <= 123; i++) {
        // no F0
        specialKeys[i] = 'KEY_F' + (i - 112 + 1);
    }
})();
// Fill out the special Mac keys:
(function () {
    var specialMacKeys = GateOne.Input.specialMacKeys;
    for (var i = 63236; i <= 63242; i++) {
        // no F0
        specialMacKeys[i] = 'KEY_F' + (i - 63236 + 1);
    }
})();

GateOne.Base.module(GateOne, 'Visual', '1.0', ['Base', 'Net', 'Utils']);
GateOne.Visual.scrollbackToggle = false;
GateOne.Visual.gridView = false;
GateOne.Visual.goDimensions = {};
GateOne.Visual.panelToggleCallbacks = {'in': {}, 'out': {}};
GateOne.Visual.lastMessage = '';
GateOne.Visual.sinceLastMessage = new Date();
GateOne.Base.update(GateOne.Visual, {
    // Functions for manipulating views and displaying things
    init: function() {
        var u = go.Utils,
            toolbarGrid = u.createElement('div', {'id': go.prefs.prefix+'icon_grid', 'class': 'toolbar', 'title': "Grid View"}),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar');
        // Add our grid icon to the icons list
        GateOne.Icons['grid'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient3002" y2="255.75" gradientUnits="userSpaceOnUse" x2="311.03" gradientTransform="matrix(0.70710678,0.70710678,-0.70710678,0.70710678,261.98407,-149.06549)" y1="227.75" x1="311.03"><stop class="stop1" offset="0"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.66103562,-0.67114094,0.66103562,0.67114094,-611.1013,-118.18392)"><g fill="url(#linearGradient3002)" transform="translate(63.353214,322.07725)"><polygon points="311.03,255.22,304.94,249.13,311.03,243.03,317.13,249.13"/><polygon points="318.35,247.91,312.25,241.82,318.35,235.72,324.44,241.82"/><polygon points="303.52,247.71,297.42,241.61,303.52,235.52,309.61,241.61"/><polygon points="310.83,240.39,304.74,234.3,310.83,228.2,316.92,234.3"/></g></g></svg>';
        // Setup our toolbar icons and actions
        toolbarGrid.innerHTML = GateOne.Icons['grid'];
        var gridToggle = function() {
            go.Visual.toggleGridView(true);
        }
        try {
            toolbarGrid.onclick = gridToggle;
        } finally {
            gridToggle = null;
        }
        // Stick it on the end (can go wherever--unlike GateOne.Terminal's icons)
        toolbar.appendChild(toolbarGrid);
        // Register our keyboard shortcuts (Shift-<arrow keys> to switch terminals, ctrl-alt-G to toggle grid view)
        if (!go.prefs.embedded) {
            go.Input.registerShortcut('KEY_ARROW_LEFT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideLeft()'});
            go.Input.registerShortcut('KEY_ARROW_RIGHT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideRight()'});
            go.Input.registerShortcut('KEY_ARROW_UP', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideUp()'});
            go.Input.registerShortcut('KEY_ARROW_DOWN', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideDown()'});
            go.Input.registerShortcut('KEY_G', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Visual.toggleGridView()'});
        }
        go.Net.addAction('bell', go.Visual.bellAction);
        go.Net.addAction('set_title', go.Visual.setTitleAction);
        go.Net.addAction('notice', go.Visual.serverMessageAction);
        go.Net.addAction('load_css', go.Visual.CSSPluginAction);
    },
    updateDimensions: function() { // Sets GateOne.Visual.goDimensions to the current width/height of prefs.goDiv
        var u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv),
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal')),
            wrapperDiv = u.getNode('#'+go.prefs.prefix+'termwrapper'),
            style = window.getComputedStyle(goDiv, null),
            rightAdjust = 0;
        if (style['padding-right']) {
            var rightAdjust = parseInt(style['padding-right'].split('px')[0]);
        }
        go.Visual.goDimensions.w = parseInt(style.width.split('px')[0]);
        go.Visual.goDimensions.h = parseInt(style.height.split('px')[0]);
        if (wrapperDiv) { // Explicit check here in case we're embedded into something that isn't using the grid (aka the wrapperDiv here).
            // Update the width of termwrapper in case #gateone has padding
            wrapperDiv.style.width = ((go.Visual.goDimensions.w+rightAdjust)*2) + 'px';
            if (terms.length) {
                terms.forEach(function(termObj) {
                    termObj.style.height = go.Visual.goDimensions.h + 'px';
                    termObj.style.width = go.Visual.goDimensions.w + 'px';
    //                 termObj.style['margin-right'] = style['padding-right'];
    //                 termObj.style['margin-bottom'] = style['padding-bottom'];
                });
            }
        }

    },
    applyTransform: function (obj, transform) {
        // Applys the given CSS3 *transform* to *obj* for all known vendor prefixes (e.g. -<whatever>-transform)
        // *obj* can be a string, a node, an array of nodes, or a NodeList.  In the case that *obj* is a string,
        // GateOne.Utils.getNode(*obj*) will be performed under the assumption that the string represents a CSS selector.
//         log('applyTransform(' + typeof(obj) + ', ' + transform + ')');
        var transforms = {
            '-webkit-transform': '', // Chrome/Safari/Webkit-based stuff
            '-moz-transform': '', // Mozilla/Firefox/Gecko-based stuff
            '-o-transform': '', // Opera
            '-ms-transform': '', // IE9+
            '-khtml-transform': '', // Konqueror
            'transform': '' // Some day this will be all that is necessary
        };
        if (GateOne.Utils.isNodeList(obj) || GateOne.Utils.isHTMLCollection(obj) || GateOne.Utils.isArray(obj)) {
            GateOne.Utils.toArray(obj).forEach(function(node) {
                node = GateOne.Utils.getNode(node);
                for (var prefix in transforms) {
                    node.style[prefix] = transform;
                }
                if (node.style.MozTransform != undefined) {
                    node.style.MozTransform = transform; // Firefox doesn't like node.style['-moz-transform'] for some reason
                }
            });
        } else if (typeof(obj) == 'string' || GateOne.Utils.isElement(obj)) {
            var node = GateOne.Utils.getNode(obj); // Doesn't hurt to pass a node to getNode
            for (var prefix in transforms) {
                node.style[prefix] = transform;
            }
            if (node.style.MozTransform != undefined) {
                node.style.MozTransform = transform; // Firefox doesn't like node.style['-moz-transform'] for some reason
            }
        }
    },
    applyStyle: function (elem, style) {
        // A convenience function that allows us to apply multiple style changes in one function
        // Example: applyStyle('somediv', {'opacity': 0.5, 'color': 'black'})
        var node = GateOne.Utils.getNode(elem);
        for (var name in style) {
            node.style[name] = style[name];
        }
    },
    getTransform: function(elem) {
        // Returns the transform string applied to the style of the given *elem*
        var node = GateOne.Utils.getNode(elem);
        if (node.style['transform']) {
            return node.style['transform'];
        } else if (node.style.MozTransform) {
            return node.style.MozTransform;
        } else if (node.style['-khtml-transform']) {
            return node.style['-khtml-transform'];
        } else if (node.style['-ms-transform']) {
            return node.style['-ms-transform'];
        } else if (node.style['-o-transform']) {
            return node.style['-o-transform'];
        }
    },
    togglePanel: function(panel) {
        // Toggles the given *panel* in or out of view.
        // If other panels are open at the time, they will be closed.
        // If *panel* evaluates to false, close all open panels
        // This function also has some callbacks that can be hooked into:
        //      * When the panel is toggled out of view: GateOne.Visual.panelToggleCallbacks['out']['panelName'] = {'myreference': somefunc()}
        //      * When the panel is toggled into view: GateOne.Visual.panelToggleCallbacks['in']['panelName'] = {'myreference': somefunc()}
        //
        // Say you wanted to call a function whenever the preferences panel was toggled into view:
        //      GateOne.Visual.panelToggleCallbacks['in']['#'+go.prefs.prefix+'panel_prefs']['updateOptions'] = myFunction;
        // Then whenever the preferences panel was toggled into view, myfunction() would be called.
        var v = go.Visual,
            u = go.Utils,
            panelID = panel,
            panel = u.getNode(panel),
            origState = null,
            panels = u.getNodes(go.prefs.goDiv + ' .panel');
        if (panel) {
            origState = v.getTransform(panel);
        }
        // Start by scaling all panels out
        for (var i in u.toArray(panels)) {
            if (panels[i] && go.Visual.getTransform(panels[i]) == "scale(1)") {
                v.applyTransform(panels[i], 'scale(0)');
                // Call any registered 'out' callbacks for all of these panels
                if (v.panelToggleCallbacks['out']['#'+panels[i].id]) {
                    for (var ref in v.panelToggleCallbacks['out']['#'+panels[i].id]) {
                        if (typeof(v.panelToggleCallbacks['out']['#'+panels[i].id][ref]) == "function") {
                            v.panelToggleCallbacks['out']['#'+panels[i].id][ref]();
                        }
                    }
                }
            }
        }
        if (!panel) {
            // All done
            return;
        }
        if (origState != 'scale(1)') {
            v.applyTransform(panel, 'scale(1)');
            // Call any registered 'in' callbacks for all of these panels
            if (v.panelToggleCallbacks['in']['#'+panel.id]) {
                for (var ref in v.panelToggleCallbacks['in']['#'+panel.id]) {
                    if (typeof(v.panelToggleCallbacks['in']['#'+panel.id][ref]) == "function") {
                        v.panelToggleCallbacks['in']['#'+panel.id][ref]();
                    }
                }
            }
        } else {
            // Send it away
            v.applyTransform(panel, 'scale(0)');
            // Call any registered 'out' callbacks for all of these panels
            if (v.panelToggleCallbacks['out']['#'+panel.id]) {
                for (var ref in v.panelToggleCallbacks['out']['#'+panel.id]) {
                    if (typeof(v.panelToggleCallbacks['out']['#'+panel.id][ref]) == "function") {
                        v.panelToggleCallbacks['out']['#'+panel.id][ref]();
                    }
                }
            }
        }

    },
    displayTermInfo: function(term) {
        // Displays the given term's information as a psuedo tooltip that eventually fades away
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            termObj = u.getNode('#'+prefix+'term' + term),
            displayText = termObj.id.split('term')[1] + ": " + termObj.title,
            termInfoDiv = u.createElement('div', {'id': 'terminfo'}),
            marginFix = Math.round(termObj.title.length/2),
            infoContainer = u.createElement('div', {'id': 'infocontainer', 'style': {'margin-right': '-' + marginFix + 'em'}});
        termInfoDiv.innerHTML = displayText;
        if (u.getNode('#'+prefix+'infocontainer')) { u.removeElement('#'+prefix+'infocontainer') }
        infoContainer.appendChild(termInfoDiv);
        u.getNode(go.prefs.goDiv).appendChild(infoContainer);
        if (v.infoTimer) {
            clearTimeout(v.infoTimer);
            v.infoTimer = null;
        }
        v.infoTimer = setTimeout(function() {
            v.applyStyle(infoContainer, {'opacity': 0});
        }, 1000);
    },
    displayMessage: function(message, /*opt*/timeout, /*opt*/removeTimeout, /*opt*/id) {
        /* Displays a message to the user that sticks around for *timeout* (milliseconds) after which a *removeTimeout* (milliseconds) timer will be started after which the element will be removed (*removeTimeout* is meant to allow for a CSS3 effect to finish).
        If *timeout* is not given it will default to 1000 milliseconds.
        If *removeTimeout* is not given it will default to 5000 milliseconds.
        If *id* not is given, the DIV that is created to contain the message will have its ID set to "GateOne.prefs.prefix+'notice'".
        If multiple messages appear at the same time they will be stacked.
        NOTE: The show/hide effect is expected to be controlled via CSS based on the DIV ID.
        */
        logInfo('displayMessage(): ' + message); // Useful for looking at previous messages
        if (!id) {
            id = 'notice';
        }
        var u = go.Utils,
            prefix = go.prefs.prefix,
            now = new Date(),
            timeDiff = now - go.Visual.sinceLastMessage,
            noticeContainer = u.getNode('#'+prefix+'noticecontainer'),
            notice = u.createElement('div', {'id': prefix+id});
        if (message == go.Visual.lastMessage) {
            // Only display messages every two seconds if they repeat so we don't spam the user.
            if (timeDiff < 2000) {
                return;
            }
        }
        if (!timeout) {
            timeout = 1000;
        }
        if (!removeTimeout) {
            removeTimeout = 5000;
        }
        notice.innerHTML = message;
        noticeContainer.appendChild(notice);
        setTimeout(function() {
            go.Visual.applyStyle(notice, {'opacity': 0});
            setTimeout(function() {
                u.removeElement(notice);
            }, timeout+removeTimeout);
        }, timeout);
        go.Visual.lastMessage = message;
        go.Visual.sinceLastMessage = new Date();
    },
    setTitleAction: function(titleObj) {
        // Sets the title of titleObj['term'] to titleObj['title']
        var u = go.Utils,
            prefix = go.prefs.prefix,
            term = titleObj['term'],
            title = titleObj['title'],
            sideinfo = u.getNode('#'+prefix+'sideinfo'),
            toolbar = u.getNode('#'+prefix+'toolbar'),
            termNode = u.getNode('#'+prefix+'term' + term),
            goDiv = u.getNode(go.prefs.goDiv),
            heightDiff = goDiv.clientHeight - toolbar.clientHeight;
        logDebug("Setting term " + term + " to title: " + title);
        termNode.title = title;
        sideinfo.innerHTML = term + ": " + title;
        // Also update the info panel
        u.getNode('#'+prefix+'termtitle').innerHTML = term+': '+title;
        // Now scale sideinfo so that it looks as nice as possible without overlapping the icons
        go.Visual.applyTransform(sideinfo, "rotate(90deg) scale(1)"); // Have to reset it first
        if (sideinfo.clientWidth > heightDiff) { // We have overlap
            var scaleDown = heightDiff / (sideinfo.clientWidth + 10); // +10 to give us some space between
            go.Visual.applyTransform(sideinfo, "rotate(90deg) scale(" + scaleDown + ")");
        }
        // NOTE: Commented this out since with term type, 'xterm' it can result in the title being set every time you hit the enter key...  Having the title pop up constantly gets annoying real fast!
//         GateOne.Visual.displayTermInfo(term);
    },
    bellAction: function(bellObj) {
        // Plays a bell sound and pops up a message indiciating which terminal issued a bell
        var term = bellObj['term'];
        go.Visual.playBell();
        go.Visual.displayMessage("Bell in " + term + ": " + go.Utils.getNode('#'+go.prefs.prefix+'term' + term).title);
    },
    playBell: function() {
        // Plays the bell sound without any visual notification.
        var snd = GateOne.Utils.getNode('#'+GateOne.prefs.prefix+'bell');
        if (snd) {
            if (GateOne.prefs.audibleBell) {
                snd.play();
            }
        }
    },
    enableScrollback: function(/*Optional*/term) {
        // Replaces the contents of the selected terminal with the complete screen + scrollback buffer
        // If *term* is given, only disable scrollback for that terminal
        logDebug('enableScrollback(' + term + ')');
        var u = go.Utils,
            prefix = go.prefs.prefix;
        if (term && term in GateOne.terminals) {
            var termPreNode = GateOne.terminals[term]['node'],
                termScreen = GateOne.terminals[term]['screenNode'],
                termScrollback = GateOne.terminals[term]['scrollbackNode'];
            if (!go.terminals[term]) { // The terminal was just closed
                return; // We're done here
            }
            if (u.getSelText()) {
                // Don't re-enable the scrollback buffer if the user is selecting text (so we don't clobber their highlight)
                // Retry again in 3.5 seconds
                clearTimeout(go.terminals[term]['scrollbackTimer']);
                go.terminals[term]['scrollbackTimer'] = setTimeout(function() {
                    go.Visual.enableScrollback(term);
                }, 3500);
                return;
            }
            termPreNode.style.height = '100%';
            if (termScrollback) {
                var scrollbackHTML = go.terminals[term]['scrollback'].join('\n') + '\n';
                if (termScrollback.innerHTML != scrollbackHTML) {
                    termScrollback.innerHTML = scrollbackHTML;
                }
            } else {
                // Create the span that holds the scrollback buffer
                termScrollback = u.createElement('span', {'id': 'term'+term+'scrollback'});
                termScrollback.innerHTML = go.terminals[term]['scrollback'].join('\n') + '\n';
                termPreNode.insertBefore(termScrollback, termScreen);
                GateOne.terminals[term]['scrollbackNode'] = termScrollback;
                termScrollback.style.display == null; // Reset
                u.scrollToBottom(termPreNode); // Since we just created it for the first time we have to get to the bottom of things, so to speak =)
            }
            if (go.terminals[term]['scrollbackTimer']) {
                clearTimeout(go.terminals[term]['scrollbackTimer']);
            }
            go.terminals[term]['scrollbackVisible'] = true;
        } else {
            var terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal'));
            terms.forEach(function(termObj) {
                var termID = termObj.id.split(prefix+'term')[1];
                if (termID in GateOne.terminals) {
                    var termPreNode = go.terminals[termID]['node'],
                        termScreen = go.terminals[termID]['screenNode'],
                        termScrollback = go.terminals[termID]['scrollbackNode'];
                    termScrollback.innerHTML = go.terminals[termID]['scrollback'].join('\n') + '\n';
                    termScrollback.style.display == null; // Reset
                    if (go.terminals[termID]['scrollbackTimer']) {
                        clearTimeout(go.terminals[termID]['scrollbackTimer']);
                    }
                    go.terminals[termID]['scrollbackVisible'] = true;
                    u.scrollToBottom(termPreNode);
                }
            });
        }
        go.Visual.scrollbackToggle = true;
    },
    disableScrollback: function(/*Optional*/term) {
        // Replaces the contents of the selected terminal with just the screen (i.e. no scrollback)
        // If *term* is given, only disable scrollback for that terminal
        var u = go.Utils,
            prefix = go.prefs.prefix,
            textTransforms = go.Terminal.textTransforms;
        if (term) {
            var termPreNode = GateOne.terminals[term]['node'],
                termScrollback = go.terminals[term]['scrollbackNode'];
//             termScrollback.innerHTML = "";
                if (termScrollback) {
                    termScrollback.style.display = "none";
                }
            go.terminals[term]['scrollbackVisible'] = false;
        } else {
            var terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal'));
            terms.forEach(function(termObj) {
                var termID = termObj.id.split(prefix+'term')[1],
                    termScrollback = go.terminals[termID]['scrollbackNode'];
//                 termScrollback.innerHTML = "";
                if (termScrollback) {
                    termScrollback.style.display = "none";
                }
                go.terminals[termID]['scrollbackVisible'] = false;
            });
        }
        go.Visual.scrollbackToggle = false;
    },
    toggleScrollback: function() {
        // Enables or disables the scrollback buffer (to hide or show the scrollbars)
        // Why bother?  The translate() effect is a _lot_ smoother without scrollbars.  Also, full-screen applications that regularly update the screen can really slow down if the entirety of the scrollback buffer must be updated along with the current view.
        var v = GateOne.Visual;
        if (v.scrollbackToggle) {
            v.enableScrollback();
            v.scrollbackToggle = false;
        } else {
            v.disableScrollback();
            v.scrollbackToggle = true;
        }
    },
    slideToTerm: function(term) {
        // Slides the view to the given *term*.
        var u = go.Utils,
            v = go.Visual,
            termObj = u.getNode('#'+go.prefs.prefix+'term' + term),
            displayText = "",
            count = 0,
            wPX = 0,
            hPX = 0,
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal')),
            style = window.getComputedStyle(u.getNode(go.prefs.goDiv), null),
            rightAdjust = 0,
            bottomAdjust = 0,
            reScrollback = u.partial(v.enableScrollback, term);
        if (termObj) {
            displayText = termObj.id.split(go.prefs.prefix+'term')[1] + ": " + termObj.title;
        } else {
            return; // This can happen if the terminal closed before a timeout completed.  Not a big deal, ignore
        }
        if (style['padding-right'] != "0px") {
            rightAdjust = parseInt(style['padding-right'].split('px')[0]);
        }
        if (style['padding-bottom'] != "0px") {
            bottomAdjust = parseInt(style['padding-bottom'].split('px')[0]);
        }
        go.Net.setTerminal(term);
        u.getNode('#'+go.prefs.prefix+'sideinfo').innerHTML = displayText;
        // Have to scroll all the way to the top in order for the translate effect to work properly:
        u.getNode(go.prefs.goDiv).scrollTop = 0;
        terms.forEach(function(termObj) {
            // Loop through once to get the correct wPX and hPX values
            count = count + 1;
            if (termObj.id == go.prefs.prefix+'term' + term) {
                if (u.isEven(count)) {
                    wPX = ((v.goDimensions.w+rightAdjust) * 2) - (v.goDimensions.w+rightAdjust);
                    hPX = (((v.goDimensions.h+bottomAdjust) * count)/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                } else {
                    wPX = 0;
                    hPX = (((v.goDimensions.h+bottomAdjust) * (count+1))/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                }
            }
        });
        v.applyTransform(terms, 'translate(-' + wPX + 'px, -' + hPX + 'px)');
        v.displayTermInfo(term);
        if (!v.scrollbackToggle) {
            // Cancel any pending scrollback timers to keep the user experience smooth
            if (go.terminals[term]['scrollbackTimer']) {
                clearTimeout(go.terminals[term]['scrollbackTimer']);
            }
            go.terminals[term]['scrollbackTimer'] = setTimeout(reScrollback, 3500);
        }
    },
    slideLeft: function() {
        // Slides to the terminal left of the current view
        var u = go.Utils,
            prefix = go.prefs.prefix,
            count = 0,
            term = 0,
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal'));
        terms.forEach(function(termObj) {
            if (termObj.id == prefix+'term' + localStorage[prefix+'selectedTerminal']) {
                term = count;
            }
            count = count + 1;
        });
        if (u.isEven(term+1)) {
            var slideTo = terms[term-1].id.split(prefix+'term')[1];
            go.Terminal.switchTerminal(slideTo);
        }
    },
    slideRight: function() {
        // Slides to the terminal right of the current view
        var u = go.Utils,
            prefix = go.prefs.prefix,
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal')),
            count = 0,
            term = 0;
        if (terms.length > 1) {
            terms.forEach(function(termObj) {
                if (termObj.id == prefix+'term' + localStorage[prefix+'selectedTerminal']) {
                    term = count;
                }
                count = count + 1;
            });
            if (!u.isEven(term+1)) {
                var slideTo = terms[term+1].id.split(prefix+'term')[1];
                go.Terminal.switchTerminal(slideTo);
            }
        }
    },
    slideDown: function() {
        // Slides the view downward one terminal by pushing all the others up.
        var u = go.Utils,
            prefix = go.prefs.prefix,
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal')),
            count = 0,
            term = 0;
        if (terms.length > 2) {
            terms.forEach(function(termObj) {
                if (termObj.id == prefix+'term' + localStorage[prefix+'selectedTerminal']) {
                    term = count;
                }
                count = count + 1;
            });
            if (terms[term+2]) {
                var slideTo = terms[term+2].id.split(prefix+'term')[1];
                go.Terminal.switchTerminal(slideTo);
            }
        }
    },
    slideUp: function() {
        // Slides the view downward one terminal by pushing all the others down.
        var u = go.Utils,
            prefix = go.prefs.prefix,
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal')),
            count = 0,
            term = 0;
        if (localStorage[prefix+'selectedTerminal'] > 1) {
            terms.forEach(function(termObj) {
                if (termObj.id == prefix+'term' + localStorage[prefix+'selectedTerminal']) {
                    term = count;
                }
                count = count + 1;
            });
            if (terms[term-2]) {
                var slideTo = terms[term-2].id.split(prefix+'term')[1];
                go.Terminal.switchTerminal(Math.max(slideTo, 1));
            }
        }
    },
    toggleGridView: function(/*optional*/goBack) {
        // Brings up the terminal grid view or returns to full-size
        // If *goBack* is false, don't bother switching back to the previously-selected terminal
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            controlsContainer = u.getNode('#'+prefix+'controlsContainer'),
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal'));
        if (goBack == null) {
            goBack == true;
        }
        if (v.gridView) {
            v.gridView = false;
            // Remove the events we added for the grid:
            terms.forEach(function(termObj) {
                var termID = termObj.id.split(prefix+'term')[1],
                    pastearea = go.terminals[termID]['pasteNode'];
                if (pastearea) {
                    u.showElement(pastearea);
                }
                termObj.onclick = undefined;
                termObj.onmouseover = undefined;
            });
            u.getNode(go.prefs.goDiv).style.overflow = 'hidden';
            if (goBack) {
                go.Terminal.switchTerminal(localStorage[prefix+'selectedTerminal']); // Slide to the intended terminal
            }
            if (controlsContainer) {
                u.showElement(controlsContainer);
            }
        } else {
            v.gridView = true;
            setTimeout(function() {
                u.getNode(go.prefs.goDiv).style.overflowY = 'visible';
                u.getNode('#'+prefix+'termwrapper').style.width = go.Visual.goDimensions.w;
            }, 1000);
            if (controlsContainer) {
                u.hideElement(controlsContainer);
            }
            v.disableScrollback();
            v.applyTransform(terms, 'translate(0px, 0px)');
            var odd = true,
                count = 1,
                oddAmount = 0,
                evenAmount = 0,
                transform = "";
            terms.forEach(function(termObj) {
                var termID = termObj.id.split(prefix+'term')[1],
                    pastearea = go.terminals[termID]['pasteNode'];
                if (pastearea) {
                    u.hideElement(pastearea);
                }
                if (odd) {
                    if (count == 1) {
                        oddAmount = 50;
                    } else {
                        oddAmount += 100;
                    }
                    transform = "scale(0.5, 0.5) translate(-50%, -" + oddAmount + "%)";
                    v.applyTransform(termObj, transform);
                    odd = false;
                } else {
                    if (count == 2) {
                        evenAmount = 50;
                    } else {
                        evenAmount += 100;
                    }
                    transform = "scale(0.5, 0.5) translate(-150%, -" + evenAmount + "%)";
                    v.applyTransform(termObj, transform);
                    odd = true;
                }
                count += 1;
                termObj.onclick = function(e) {
                    var termPre = GateOne.terminals[termID]['node'];
                    localStorage[prefix+'selectedTerminal'] = termID;
                    v.toggleGridView(false);
                    go.Terminal.switchTerminal(termID);
                    u.scrollToBottom(termPre);
                }
                termObj.onmouseover = function(e) {
                    var displayText = termObj.id.split(prefix+'term')[1] + ": " + termObj.title,
                        termInfoDiv = u.createElement('div', {'id': 'terminfo'}),
                        marginFix = Math.round(termObj.title.length/2),
                        infoContainer = u.createElement('div', {'id': 'infocontainer', 'style': {'margin-right': '-' + marginFix + 'em'}});
                    if (u.getNode('#'+prefix+'infocontainer')) { u.removeElement('#'+prefix+'infocontainer') }
                    termInfoDiv.innerHTML = displayText;
                    infoContainer.appendChild(termInfoDiv);
                    v.applyTransform(infoContainer, 'scale(2)');
                    termObj.appendChild(infoContainer);
                    setTimeout(function() {
                        infoContainer.style.opacity = 0;
                    }, 1000);
                }
            });
        }
    },
    addSquare: function(squareName) {
        // Only called by createGrid; creates a terminal div and appends it to go.Visual.squares
        logDebug('creating: ' + squareName);
        var terminal = GateOne.Utils.createElement('div', {'id': squareName, 'class': 'terminal', 'style': {'width': GateOne.Visual.goDimensions.w + 'px', 'height': GateOne.Visual.goDimensions.h + 'px'}});
        GateOne.Visual.squares.push(terminal);
    },
    createGrid: function(id, terminalNames) {
        // Creates a container for all the terminals and optionally pre-creates terminals using *terminalNames*.
        // *id* will be the ID of the resulting grid (e.g. "termwrapper")
        // *terminalNames* is expected to be a list of DOM IDs.
        var u = GateOne.Utils,
            v = GateOne.Visual,
            grid = null;
        v.squares = [];
        if (terminalNames) {
            terminalNames.forEach(addSquare);
            grid = u.createElement('div', {'id': id});
            v.squares.forEach(function(square) {
                grid.appendChild(square);
            });
        } else {
            grid = u.createElement('div', {'id': id});
        }
        v.squares = null; // Cleanup
        return grid;
    },
    serverMessageAction: function(message) {
        // Displays a *message* sent from the server
        GateOne.Visual.displayMessage(message);
    },
    CSSPluginAction: function(url) {
        // Loads the CSS for a given plugin by adding a <link> tag to the <head>
        var queries = url.split('?')[1].split('&'), // So we can parse out the plugin name and the template
            plugin = queries[0].split('=')[1],
            file = queries[1].split('=')[1].split('.')[0];
        // The /cssrender method needs the prefix and the container
        url = url + '&container=' + GateOne.prefs.goDiv.substring(1);
        url = url + '&prefix=' + GateOne.prefs.prefix;
        url = GateOne.prefs.url + url.substring(1);
        GateOne.Utils.loadCSS(url, plugin+'_'+file);
    },
    dialog: function(title, content, /*opt*/options) {
        // Creates a dialog with the given *title* and *content*.  Returns a function that will close the dialog when called.
        // *title* - string: Will appear at the top of the dialog.
        // *content* - HTML string or JavaScript DOM node:  The content of the dialog.
        // *options* doesn't do anything for now.
        var prefix = go.prefs.prefix,
            u = go.Utils,
            v = go.Visual,
            goDiv = u.getNode(go.prefs.goDiv),
            unique = u.randomPrime(), // Need something unique to enable having more than one dialog on the same page.
            dialogContainer = u.createElement('div', {'id': 'dialogcontainer_' + unique, 'class': 'halfsectrans dialogcontainer', 'title': title}),
            // dialogContent is wrapped by dialogDiv with "float: left; position: relative; left: 50%" and "float: left; position: relative; left: -50%" to ensure the content stays centered (see the theme CSS).
            dialogDiv = u.createElement('div', {'id': 'dialogdiv'}),
            dialogConent = u.createElement('div', {'id': 'dialogcontent'}),
            dialogTitle = u.createElement('h3', {'id': 'dialogtitle'}),
            close = u.createElement('div', {'id': 'dialog_close'}),
            dialogToForeground = function(e) {
                // Move this dialog to the front of our array and fix all the z-index of all the dialogs
                for (var i in v.dialogs) {
                    if (dialogContainer == v.dialogs[i]) {
                        v.dialogs.splice(i, 1); // Remove it
                        v.dialogs.unshift(dialogContainer); // Add it to the front
                        dialogContainer.style.opacity = 1; // Make sure it is visible
                    }
                }
                // Set the z-index of each dialog to be its original z-index - its position in the array (should ensure the first item in the array has the highest z-index and so on)
                for (var i in v.dialogs) {
                    if (i != 0) {
                        // Set all non-foreground dialogs opacity to be slightly less than 1 to make the active dialog more obvious
                        v.dialogs[i].style.opacity = 0.75;
                    }
                    v.dialogs[i].style.zIndex = v.dialogZIndex - i;
                }
                // Remove the event that called us so we're not constantly looping over the dialogs array
                dialogContainer.removeEventListener("mousedown", dialogToForeground, true);
            },
            containerMouseUp = function(e) {
                // Reattach our mousedown function since it auto-removes itself the first time it runs (so we're not wasting cycles constantly looping over the dialogs array)
                dialogContainer.addEventListener("mousedown", dialogToForeground, true);
                dialogContainer.style.opacity = 1;
            },
            titleMouseDown = function(e) {
                var m = go.Input.mouse(e); // Get the properties of the mouse event
                if (m.button.left) { // Only if left button is depressed
                    var left = window.getComputedStyle(dialogContainer, null)['left'],
                        top = window.getComputedStyle(dialogContainer, null)['top'];
                    dialogContainer.dragging = true;
                    e.preventDefault();
                    v.dragOrigin.X = e.clientX + window.scrollX;
                    v.dragOrigin.Y = e.clientY + window.scrollY;
                    if (left.indexOf('%') != -1) {
                        // Have to convert a percent to an actual pixel value
                        var percent = parseInt(left.substring(0, left.length-1)),
                            bodyWidth = window.getComputedStyle(document.body, null)['width'],
                            bodyWidth = parseInt(bodyWidth.substring(0, bodyWidth.length-2));
                        v.dragOrigin.dialogX = Math.floor(bodyWidth * (percent*.01));
                    } else {
                        v.dragOrigin.dialogX = parseInt(left.substring(0, left.length-2)); // Remove the 'px'
                    }
                    if (top.indexOf('%') != -1) {
                        // Have to convert a percent to an actual pixel value
                        var percent = parseInt(top.substring(0, top.length-1)),
                            bodyHeight = document.body.scrollHeight;
                        v.dragOrigin.dialogY = Math.floor(bodyHeight * (percent*.01));
                    } else {
                        v.dragOrigin.dialogY = parseInt(top.substring(0, top.length-2));
                    }
                    dialogContainer.style.opacity = 0.75; // Make it see-through to make it possible to see things behind it for a quick glance.
                }
            },
            moveDialog = function(e) {
                // Called when the title bar of a dialog is dragged
                if (dialogContainer.dragging) {
                    dialogContainer.className = 'dialogcontainer'; // Have to get rid of the halfsectrans so it will drag smoothly.
                    var X = e.clientX + window.scrollX,
                        Y = e.clientY + window.scrollY,
                        xMoved = X - v.dragOrigin.X,
                        yMoved = Y - v.dragOrigin.Y,
                        newX = 0,
                        newY = 0;
                    if (isNaN(v.dragOrigin.dialogX)) {
                        v.dragOrigin.dialogX = 0;
                    }
                    if (isNaN(v.dragOrigin.dialogY)) {
                        v.dragOrigin.dialogY = 0;
                    }
                    newX = v.dragOrigin.dialogX + xMoved;
                    newY = v.dragOrigin.dialogY + yMoved;
                    if (dialogContainer.dragging) {
                        dialogContainer.style.left = newX + 'px';
                        dialogContainer.style.top = newY + 'px';
                    }
                }
            },
            closeDialog = function(e) {
                if (e) { e.preventDefault() }
                dialogContainer.className = 'halfsectrans dialogcontainer';
                dialogContainer.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(dialogContainer);
                }, 1000);
                document.body.removeEventListener("mousemove", moveDialog, true);
                document.body.removeEventListener("mouseup", function(e) {dialogContainer.dragging = false;}, true);
                dialogContainer.removeEventListener("mousedown", dialogToForeground, true); // Just in case--to ensure garbage collection
                dialogTitle.removeEventListener("mousedown", titleMouseDown, true); // Ditto
                for (var i in v.dialogs) {
                    if (dialogContainer == v.dialogs[i]) {
                        v.dialogs.splice(i, 1);
                    }
                }
                if (v.dialogs.length) {
                    v.dialogs[0].style.opacity = 1; // Set the new-first dialog back to fully visible
                }
            };
        // Keep track of all open dialogs so we can determine the foreground order
        if (!v.dialogs) {
            v.dialogs = [];
        }
        v.dialogs.push(dialogContainer);
        dialogDiv.appendChild(dialogConent);
        // Enable drag-to-move on the dialog title
        if (!dialogContainer.dragging) {
            dialogContainer.dragging = false;
            v.dragOrigin = {};
        }
        dialogTitle.addEventListener("mousedown", titleMouseDown, true);
        // These have to be attached to document.body otherwise the dialogs will be constrained within #gateone which could just be a small portion of a larger web page.
        document.body.addEventListener("mousemove", moveDialog, true);
        document.body.addEventListener("mouseup", function(e) {dialogContainer.dragging = false;}, true);
        dialogContainer.addEventListener("mousedown", dialogToForeground, true); // Ensure that clicking on a dialog brings it to the foreground
        dialogContainer.addEventListener("mouseup", containerMouseUp, true);
        dialogContainer.style.opacity = 0;
        setTimeout(function() {
            // This fades the dialog in with a nice and smooth CSS3 transition (thanks to the 'halfsectrans' class)
            dialogContainer.style.opacity = 1;
        }, 50);
        close.innerHTML = go.Icons['panelclose'];
        close.onclick = closeDialog;
        dialogTitle.innerHTML = title;
        dialogContainer.appendChild(dialogTitle);
        dialogTitle.appendChild(close);
        if (typeof(content) == "string") {
            dialogConent.innerHTML = content;
        } else {
            dialogConent.appendChild(content);
        }
        dialogContainer.appendChild(dialogDiv);
        goDiv.appendChild(dialogContainer);
        v.dialogZIndex = parseInt(getComputedStyle(dialogContainer).zIndex); // Right now this is 750 in the themes but that could change in the future so I didn't want to hard-code that value
        dialogToForeground();
        return closeDialog;
    },
    widget: function(title, content, /*opt*/options) {
        // Creates an on-screen widget with the given *title* and *content*.  Returns a function that will remove the widget when called.
        // Widgets differ from dialogs in that they don't have a visible title and are meant to be persistent on the screen without getting in the way.  They are transparent by default and the user can move them at-will by clicking and dragging anywhere within the widget (not just the title).
        // Widgets can be attached to a specific terminal by specifying the terminal number in *options*['term'].  Otherwise the widget will be attached to the currently-selected terminal.
        // Widgets can be 'global' (attached to GateOne.prefs.goDiv) by setting *options*['term'] to 'global'.
        // By default widgets will appear in the upper-right corner of a given terminal.
        // *title* - string: Will appear at the top of the widget when the mouse cursor is hovering over it for more than 2 seconds.
        // *content* - HTML string or JavaScript DOM node:  The content of the widget.
        // *options* - An associative array of parameters that change the look and/or behavior of the widget.  Here's the possibilities:
        //      options['onopen'] - Assign a function to this option and it will be called when the widget is opened with the widget parent element (widgetContainer) being passed in as the only argument.
        //      options['onclose'] - Assign a function to this option and it will be called when the widget is closed.
        //      options['onconfig'] - If a function is assigned to this parameter a gear icon will be visible in the title bar that when clicked will call this function.
        //      options['term'] - The terminal number to attach this widget to or 'global' to make the widget hover above all terminals.
        options = options || {};
        // Here are all the options
        options.onopen = options.onopen || null;
        options.onclose = options.onclose || null;
        options.onconfig = options.onconfig || null;
        options.term = options.term || localStorage[GateOne.prefs.prefix+'selectedTerminal'];
        var prefix = go.prefs.prefix,
            u = go.Utils,
            v = go.Visual,
            goDiv = u.getNode(go.prefs.goDiv),
            unique = u.randomPrime(), // Need something unique to enable having more than one widget on the same page.
            widgetContainer = u.createElement('div', {'id': 'widgetcontainer_' + unique, 'class': 'halfsectrans widgetcontainer', 'name': 'widget', 'title': title}),
            widgetDiv = u.createElement('div', {'id': 'widgetdiv'}),
            widgetConent = u.createElement('div', {'id': 'widgetcontent'}),
            termDiv = u.getNode('#'+prefix+'term'+options['term']), // Assigned below
            widgetTitle = u.createElement('h3', {'id': 'widgettitle', 'class': 'halfsectrans originbottommiddle'}),
            close = u.createElement('div', {'id': 'widget_close'}),
            configure = u.createElement('div', {'id': 'widget_configure'}),
            widgetToForeground = function(e) {
                // Move this widget to the front of our array and fix all the z-index of all the widgets
                for (var i in v.widgets) {
                    if (widgetContainer == v.widgets[i]) {
                        v.widgets.splice(i, 1); // Remove it
                        v.widgets.unshift(widgetContainer); // Add it to the front
                        widgetContainer.style.opacity = 1; // Make sure it is visible
                    }
                }
                // Set the z-index of each widget to be its original z-index - its position in the array (should ensure the first item in the array has the highest z-index and so on)
                for (var i in v.widgets) {
                    if (i != 0) {
                        // Set all non-foreground widgets opacity to be slightly less than 1 to make the active widget more obvious
                        v.widgets[i].style.opacity = 0.75;
                    }
                    v.widgets[i].style.zIndex = v.widgetZIndex - i;
                }
                // Remove the event that called us so we're not constantly looping over the widgets array
                widgetContainer.removeEventListener("mousedown", widgetToForeground, true);
            },
            containerMouseUp = function(e) {
                // Reattach our mousedown function since it auto-removes itself the first time it runs (so we're not wasting cycles constantly looping over the widgets array)
                widgetContainer.addEventListener("mousedown", widgetToForeground, true);
                widgetContainer.style.opacity = 1;
            },
            widgetMouseOver = function(e) {
                // Show the border and titlebar after a timeout
                var v = go.Visual;
                if (v.widgetHoverTimeout) {
                    clearTimeout(v.widgetHoverTimeout);
                    v.widgetHoverTimeout = null;
                }
                v.widgetHoverTimeout = setTimeout(function() {
                    // De-bounce
                    widgetTitle.style.opacity = 1;
                    v.widgetHoverTimeout = null;
                }, 1000);
            },
            widgetMouseOut = function(e) {
                // Hide the border and titlebar
                var v = go.Visual;
                if (!widgetContainer.dragging) {
                    if (v.widgetHoverTimeout) {
                        clearTimeout(v.widgetHoverTimeout);
                        v.widgetHoverTimeout = null;
                    }
                    v.widgetHoverTimeout = setTimeout(function() {
                        // De-bounce
                        widgetTitle.style.opacity = 0;
                        v.widgetHoverTimeout = null;
                    }, 500);
                }
            },
            widgetMouseDown = function(e) {
                var m = go.Input.mouse(e); // Get the properties of the mouse event
                if (m.button.left) { // Only if left button is depressed
                    var left = window.getComputedStyle(widgetContainer, null)['left'],
                        top = window.getComputedStyle(widgetContainer, null)['top'];
                    widgetContainer.dragging = true;
                    e.preventDefault();
                    v.dragOrigin.X = e.clientX + window.scrollX;
                    v.dragOrigin.Y = e.clientY + window.scrollY;
                    if (left.indexOf('%') != -1) {
                        // Have to convert a percent to an actual pixel value
                        var percent = parseInt(left.substring(0, left.length-1)),
                            bodyWidth = window.getComputedStyle(document.body, null)['width'],
                            bodyWidth = parseInt(bodyWidth.substring(0, bodyWidth.length-2));
                        v.dragOrigin.widgetX = Math.floor(bodyWidth * (percent*.01));
                    } else {
                        v.dragOrigin.widgetX = parseInt(left.substring(0, left.length-2)); // Remove the 'px'
                    }
                    if (top.indexOf('%') != -1) {
                        // Have to convert a percent to an actual pixel value
                        var percent = parseInt(top.substring(0, top.length-1)),
                            bodyHeight = document.body.scrollHeight;
                        v.dragOrigin.widgetY = Math.floor(bodyHeight * (percent*.01));
                    } else {
                        v.dragOrigin.widgetY = parseInt(top.substring(0, top.length-2));
                    }
                    widgetContainer.style.opacity = 0.75; // Make it see-through to make it possible to see things behind it for a quick glance.
                }
            },
            moveWidget = function(e) {
                // Called when the widget is dragged
                if (widgetContainer.dragging) {
                    widgetContainer.className = 'widgetcontainer'; // Have to get rid of the halfsectrans so it will drag smoothly.
                    var X = e.clientX + window.scrollX,
                        Y = e.clientY + window.scrollY,
                        xMoved = X - v.dragOrigin.X,
                        yMoved = Y - v.dragOrigin.Y,
                        newX = 0,
                        newY = 0;
                    if (isNaN(v.dragOrigin.widgetX)) {
                        v.dragOrigin.widgetX = 0;
                    }
                    if (isNaN(v.dragOrigin.widgetY)) {
                        v.dragOrigin.widgetY = 0;
                    }
                    newX = v.dragOrigin.widgetX + xMoved;
                    newY = v.dragOrigin.widgetY + yMoved;
                    if (widgetContainer.dragging) {
                        widgetContainer.style.left = newX + 'px';
                        widgetContainer.style.top = newY + 'px';
                    }
                }
            },
            closeWidget = function(e) {
                if (e) { e.preventDefault() }
                widgetContainer.className = 'halfsectrans widgetcontainer';
                widgetContainer.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(widgetContainer);
                }, 1000);
                document.body.removeEventListener("mousemove", moveWidget, true);
                document.body.removeEventListener("mouseup", function(e) {widgetContainer.dragging = false;}, true);
                widgetContainer.removeEventListener("mousedown", widgetToForeground, true); // Just in case--to ensure garbage collection
                widgetTitle.removeEventListener("mousedown", widgetMouseDown, true); // Ditto
                for (var i in v.widgets) {
                    if (widgetContainer == v.widgets[i]) {
                        v.widgets.splice(i, 1);
                    }
                }
                if (v.widgets.length) {
                    v.widgets[0].style.opacity = 1; // Set the new-first widget back to fully visible
                }
                // Call the onclose function
                if ('onclose' in options) {
                    options['onclose']();
                }
            };
        // Keep track of all open widgets so we can determine the foreground order
        if (!v.widgets) {
            v.widgets = [];
        }
        v.widgets.push(widgetContainer);
        widgetDiv.appendChild(widgetConent);
        // Enable drag-to-move on the widget title
        if (!widgetContainer.dragging) {
            widgetContainer.dragging = false;
            v.dragOrigin = {};
        }
        widgetContainer.addEventListener("mousedown", widgetMouseDown, true);
        widgetContainer.addEventListener("mouseover", widgetMouseOver, true);
        widgetContainer.addEventListener("mouseout", widgetMouseOut, true);
        // These have to be attached to document.body otherwise the widgets will be constrained within #gateone which could just be a small portion of a larger web page.
        document.body.addEventListener("mousemove", moveWidget, true);
        document.body.addEventListener("mouseup", function(e) {widgetContainer.dragging = false;}, true);
        widgetContainer.addEventListener("mousedown", widgetToForeground, true); // Ensure that clicking on a widget brings it to the foreground
        widgetContainer.addEventListener("mouseup", containerMouseUp, true);
        widgetContainer.style.opacity = 0;
        setTimeout(function() {
            // This fades the widget in with a nice and smooth CSS3 transition (thanks to the 'halfsectrans' class)
            widgetContainer.style.opacity = 1;
        }, 50);
        close.innerHTML = go.Icons['panelclose'];
        close.onclick = closeWidget;
        configure.innerHTML = go.Icons['prefs'];
        widgetTitle.innerHTML = title;
        if (options.onconfig) {
            configure.onclick = options.onconfig;
            widgetTitle.appendChild(configure);
        }
        widgetContainer.appendChild(widgetTitle);
        widgetTitle.appendChild(close);
        if (typeof(content) == "string") {
            widgetConent.innerHTML = content;
        } else {
            widgetConent.appendChild(content);
        }
        widgetContainer.appendChild(widgetDiv);
        // Determine where we should put this widget (a terminal or global?)
        if (options['term'] == 'global') {
            // global widgets are fixed to the page--not the terminal.
            goDiv.appendChild(widgetContainer);
        } else {
            termDiv.appendChild(widgetContainer);
        }
        v.widgetZIndex = parseInt(getComputedStyle(widgetContainer).zIndex); // Right now this is 750 in the themes but that could change in the future so I didn't want to hard-code that value
        widgetToForeground();
        if (options.onopen) {
            options.onopen(widgetContainer);
        }
        return closeWidget;
    },
    // NOTE: Below is a work in progress.  Not used by anything yet.
    fitWindow: function(termPre, screenSpan) {
        // Scales the terminal <pre> (*termPre*) to fit within the browser window based on the size of the screen <span> (*screenSpan*) if rows/cols has been explicitly set.
        // If rows/cols are not set it will simply move all terminals to the top of the view so that the scrollback stays hidden while screen updates are happening.
        if (GateOne.prefs.rows) { // If someone explicitly set rows/cols, scale the term to fit the screen
            var nodeHeight = screenSpan.offsetHeight;
            if (nodeHeight < document.documentElement.clientHeight) { // Grow to fit
                var scale = document.documentElement.clientHeight / (document.documentElement.clientHeight - nodeHeight),
                    transform = "scale(" + scale + ", " + scale + ")";
                GateOne.Visual.applyTransform(termPre, transform);
            } else if (nodeHeight > document.documentElement.clientHeight) { // Shrink to fit

            }
        }
    }
});

window.GateOne = GateOne; // Make everything usable

})(window);

// GateOne.Terminal gets its own sandbox to avoid a constant barrage of circular references on the garbage collector
(function(window, undefined) {
"use strict";

var go = GateOne;

// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = go.Utils.noop,
    logError = go.Utils.noop,
    logWarning = go.Utils.noop,
    logInfo = go.Utils.noop,
    logDebug = go.Utils.noop;

// Choose the appropriate BlobBuilder and URL
var BlobBuilder = (window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder),
    urlObj = (window.URL || window.webkitURL);

go.Base.module(GateOne, "Terminal", "1.0", ['Base', 'Utils', 'Visual']);
// All updateTermCallbacks are executed whenever a terminal is updated like so: callback(<term number>)
// Plugins can register updateTermCallbacks by simply doing a push():  GateOne.Terminal.updateTermCallbacks.push(myFunc);
go.Terminal.updateTermCallbacks = [];
// All defined newTermCallbacks are executed whenever a new terminal is created like so: callback(<term number>)
go.Terminal.newTermCallbacks = [];
// All defined closeTermCallbacks are executed whenever a terminal is closed just like newTermCallbacks:  callback(<term number>)
go.Terminal.closeTermCallbacks = [];
// All defined reattachTerminalsCallbacks are executed whenever the reattachTerminalsAction is called.  It is important to register a callback here when in embedded mode (if you want to place terminals in a specific location).
go.Terminal.reattachTerminalsCallbacks = [];
go.Terminal.termSelectCallback = null; // Gets assigned in switchTerminal if not already.  Can be used to override the default termimnal switching animation function (GateOne.Visual.slideToTerm)
go.Terminal.textTransforms = {}; // Can be used to transform text (e.g. into clickable links).  Use registerTextTransform() to add new ones.
go.Terminal.lastTermNumber = 0; // Starts at 0 since newTerminal() increments it by 1
go.Base.update(GateOne.Terminal, {
    init: function() {
        var t = go.Terminal,
            u = go.Utils,
            prefix = go.prefs.prefix,
            p = u.createElement('p', {'id': 'info_actions', 'style': {'padding-bottom': '0.4em'}}),
            tableDiv = u.createElement('div', {'class': 'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            tableDiv2 = u.createElement('div', {'class': 'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            toolbarClose = u.createElement('div', {'id': 'icon_closeterm', 'class': 'toolbar', 'title': "Close This Terminal"}),
            toolbarNewTerm = u.createElement('div', {'id': 'icon_newterm', 'class': 'toolbar', 'title': "New Terminal"}),
            toolbarInfo = u.createElement('div', {'id': 'icon_info', 'class': 'toolbar', 'title': "Info and Tools"}),
            infoPanel = u.createElement('div', {'id': 'panel_info', 'class': 'panel'}),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': 'panel_close_icon', 'title': "Close This Panel"}),
            infoPanelRow1 = u.createElement('div', {'class': 'paneltablerow', 'id': 'panel_inforow1'}),
            infoPanelRow2 = u.createElement('div', {'class': 'paneltablerow', 'id': 'panel_inforow2'}),
            infoPanelRow3 = u.createElement('div', {'class': 'paneltablerow', 'id': 'panel_inforow3'}),
            infoPanelRow4 = u.createElement('div', {'class': 'paneltablerow', 'id': 'panel_inforow4'}),
            infoPanelH2 = u.createElement('h2', {'id': 'termtitle'}),
            infoPanelTimeLabel = u.createElement('span', {'id': 'term_time_label', 'style': {'display': 'table-cell'}}),
            infoPanelTime = u.createElement('span', {'id': 'term_time', 'style': {'display': 'table-cell'}}),
            infoPanelRowsLabel = u.createElement('span', {'id': 'rows_label', 'style': {'display': 'table-cell'}}),
            infoPanelRows = u.createElement('span', {'id': 'rows', 'style': {'display': 'table-cell'}}),
            infoPanelColsLabel = u.createElement('span', {'id': 'cols_label', 'style': {'display': 'table-cell'}}),
            infoPanelCols = u.createElement('span', {'id': 'cols', 'style': {'display': 'table-cell'}}),
//             infoPanelViewLog = u.createElement('button', {'id': 'viewlog', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            infoPanelSaveRecording = u.createElement('button', {'id': 'saverecording', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            infoPanelMonitorActivity = u.createElement('input', {'id': 'monitor_activity', 'type': 'checkbox', 'name': 'monitor_activity', 'value': 'monitor_activity', 'style': {'margin-right': '0.5em'}}),
            infoPanelMonitorActivityLabel = u.createElement('span'),
            infoPanelMonitorInactivity = u.createElement('input', {'id': 'monitor_inactivity', 'type': 'checkbox', 'name': 'monitor_inactivity', 'value': 'monitor_inactivity', 'style': {'margin-right': '0.5em'}}),
            infoPanelMonitorInactivityLabel = u.createElement('span'),
            infoPanelInactivityInterval = u.createElement('input', {'id': 'inactivity_interval', 'name': prefix+'inactivity_interval', 'size': 3, 'value': 10, 'style': {'margin-right': '0.5em', 'text-align': 'right', 'width': '4em'}}),
            infoPanelInactivityIntervalLabel = u.createElement('span'),
            goDiv = u.getNode(go.prefs.goDiv),
            toolbarPrefs = u.getNode('#'+prefix+'icon_prefs'),
            toolbar = u.getNode('#'+prefix+'toolbar');
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        if (GateOne.Logging) {
            logFatal = GateOne.Logging.logFatal;
            logError = GateOne.Logging.logError;
            logWarning = GateOne.Logging.logWarning;
            logInfo = GateOne.Logging.logInfo;
            logDebug = GateOne.Logging.logDebug;
        }
        // Create our info panel
        go.Icons['info'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient12680" y2="294.5" gradientUnits="userSpaceOnUse" x2="253.59" gradientTransform="translate(244.48201,276.279)" y1="276.28" x1="253.59"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-396.60679,-820.39654)"><g transform="translate(152.12479,544.11754)"><path fill="url(#linearGradient12680)" d="m257.6,278.53c-3.001-3-7.865-3-10.867,0-3,3.001-3,7.868,0,10.866,2.587,2.59,6.561,2.939,9.53,1.062l4.038,4.039,2.397-2.397-4.037-4.038c1.878-2.969,1.527-6.943-1.061-9.532zm-1.685,9.18c-2.07,2.069-5.426,2.069-7.494,0-2.071-2.069-2.071-5.425,0-7.494,2.068-2.07,5.424-2.07,7.494,0,2.068,2.069,2.068,5.425,0,7.494z"/></g></g></svg>';
        toolbarInfo.innerHTML = go.Icons['info'];
        go.Icons['close'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient3010" y2="252.75" gradientUnits="userSpaceOnUse" y1="232.75" x2="487.8" x1="487.8"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" fill="url(#linearGradient3010)"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';
        toolbarClose.innerHTML = go.Icons['close'];
        go.Icons['newTerm'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient12259" y2="234.18" gradientUnits="userSpaceOnUse" x2="561.42" y1="252.18" x1="561.42"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-261.95455,-486.69334)"><g transform="matrix(0.94996733,0,0,0.94996733,-256.96226,264.67838)"><rect height="3.867" width="7.54" y="241.25" x="557.66" fill="url(#linearGradient12259)"/><rect height="3.866" width="7.541" y="241.25" x="546.25" fill="url(#linearGradient12259)"/><rect height="7.541" width="3.867" y="245.12" x="553.79" fill="url(#linearGradient12259)"/><rect height="7.541" width="3.867" y="233.71" x="553.79" fill="url(#linearGradient12259)"/><rect height="3.867" width="3.867" y="241.25" x="553.79" fill="url(#linearGradient12259)"/><rect height="3.867" width="3.867" y="241.25" x="553.79" fill="url(#linearGradient12259)"/></g></g></svg>';
        toolbarNewTerm.innerHTML = go.Icons['newTerm'];
        infoPanelH2.innerHTML = "Gate One";
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            go.Visual.togglePanel('#'+prefix+'panel_info'); // Scale away, scale away, scale away.
        }
        infoPanelTimeLabel.innerHTML = "<b>Connected Since:</b> ";
        infoPanelRowsLabel.innerHTML = "<b>Rows:</b> ";
        infoPanelRows.innerHTML = go.prefs.rows; // Will be replaced
        infoPanelColsLabel.innerHTML = "<b>Columns:</b> ";
        infoPanelCols.innerHTML = go.prefs.cols; // Will be replaced
        infoPanel.appendChild(infoPanelH2);
        infoPanel.appendChild(panelClose);
        infoPanel.appendChild(p);
        infoPanel.appendChild(tableDiv);
        infoPanel.appendChild(tableDiv2);
        infoPanelRow1.appendChild(infoPanelTimeLabel);
        infoPanelRow1.appendChild(infoPanelTime);
        infoPanelRow2.appendChild(infoPanelRowsLabel);
        infoPanelRow2.appendChild(infoPanelRows);
        infoPanelRow3.appendChild(infoPanelColsLabel);
        infoPanelRow3.appendChild(infoPanelCols);
        tableDiv.appendChild(infoPanelRow1);
        tableDiv.appendChild(infoPanelRow2);
        tableDiv.appendChild(infoPanelRow3);
        infoPanelMonitorActivityLabel.innerHTML = "Monitor for Activity<br />";
        infoPanelMonitorInactivityLabel.innerHTML = "Monitor for ";
        infoPanelInactivityIntervalLabel.innerHTML = "Seconds of Inactivity";
        infoPanelRow4.appendChild(infoPanelMonitorActivity);
        infoPanelRow4.appendChild(infoPanelMonitorActivityLabel);
        infoPanelRow4.appendChild(infoPanelMonitorInactivity);
        infoPanelRow4.appendChild(infoPanelMonitorInactivityLabel);
        infoPanelRow4.appendChild(infoPanelInactivityInterval);
        infoPanelRow4.appendChild(infoPanelInactivityIntervalLabel);
        tableDiv2.appendChild(infoPanelRow4);
        go.Visual.applyTransform(infoPanel, 'scale(0)');
        goDiv.appendChild(infoPanel); // Doesn't really matter where it goes
        infoPanelMonitorInactivity.onclick = function(e) {
            // Turn on/off inactivity monitoring
            var term = localStorage[prefix+'selectedTerminal'],
                monitorInactivity = u.getNode('#'+prefix+'monitor_inactivity'),
                monitorActivity = u.getNode('#'+prefix+'monitor_activity'),
                termTitle = u.getNode('#'+prefix+'term'+term).title;
            if (monitorInactivity.checked) {
                var inactivity = function() {
                    go.Terminal.notifyInactivity(termTitle);
                    // Restart the timer
                    go.terminals[term]['inactivityTimer'] = setTimeout(inactivity, go.terminals[term]['inactivityTimeout']);
                }
                go.terminals[term]['inactivityTimeout'] = 10000; // Ten second default--might want to make user-modifiable
                go.terminals[term]['inactivityTimer'] = setTimeout(inactivity, go.terminals[term]['inactivityTimeout']);
                if (go.terminals[term]['activityNotify']) {
                    // Turn off monitoring for activity if we're now going to monitor for inactivity
                    go.terminals[term]['activityNotify'] = false;
                    monitorActivity.checked = false;
                }
            } else {
                monitorInactivity.checked = false;
                clearTimeout(go.terminals[term]['inactivityTimer']);
                go.terminals[term]['inactivityTimer'] = false;
            }
        }
        infoPanelMonitorActivity.onclick = function() {
            // Turn on/off activity monitoring
            var term = localStorage[prefix+'selectedTerminal'],
                monitorInactivity = u.getNode('#'+prefix+'monitor_inactivity'),
                monitorActivity = u.getNode('#'+prefix+'monitor_activity'),
                termTitle = u.getNode('#'+prefix+'term'+term).title;
            if (monitorActivity.checked) {
                go.terminals[term]['activityNotify'] = true;
                if (go.terminals[term]['inactivityTimer']) {
                    // Turn off monitoring for activity if we're now going to monitor for inactivity
                    clearTimeout(go.terminals[term]['inactivityTimer']);
                    go.terminals[term]['inactivityTimer'] = false;
                    monitorInactivity.checked = false;
                }
            } else {
                monitorActivity.checked = false;
                GateOne.terminals[term]['activityNotify'] = false;
            }
        }
        infoPanelInactivityInterval.onblur = function(e) {
            // Update go.terminals[term]['inactivityTimeout'] with the this.value
            var term = localStorage[prefix+'selectedTerminal'];
            go.terminals[term]['inactivityTimeout'] = parseInt(this.value) * 1000;
        }
        var editTitle =  function(e) {
            var term = localStorage[prefix+'selectedTerminal'],
                title = u.getNode('#'+prefix+'term'+term).title,
                titleEdit = u.createElement('input', {'type': 'text', 'name': 'title', 'value': title, 'id': go.prefs.prefix + 'title_edit'}),
                finishEditing = function(e) {
                    var newTitle = titleEdit.value;
                    if (newTitle) {
                        u.getNode('#'+prefix+'term' + term).title = newTitle;
                        u.getNode('#'+prefix+'sideinfo').innerHTML = term + ": " + newTitle;
                        go.Visual.displayTermInfo(term);
                        infoPanelH2.onclick = editTitle;
                        setTimeout(function() {infoPanelH2.innerHTML = term + ': ' + newTitle;}, 100);
                        go.Input.capture();
                    }
                };
            go.Input.disableCapture();
            titleEdit.onblur = finishEditing;
            titleEdit.onkeypress = function(e) {
                if (go.Input.key(e).code == 13) { // Enter key
                    finishEditing(e);
                }
            }
            this.onclick = null;
            this.innerHTML = "";
            this.appendChild(titleEdit);
            titleEdit.focus();
            titleEdit.select();
        }
        infoPanelH2.onclick = editTitle;
        toolbarNewTerm.onclick = function(e) {go.Terminal.newTerminal()};
        var closeCurrentTerm = function() {
            go.Terminal.closeTerminal(localStorage[prefix+'selectedTerminal']);
        }
        toolbarClose.onclick = closeCurrentTerm;
        // TODO: Get showInfo() displaying the proper status of the activity monitor checkboxes
        var showInfo = function() {
            var term = localStorage[prefix+'selectedTerminal'],
                termObj = go.terminals[term];
            u.getNode('#'+prefix+'term_time').innerHTML = termObj['created'].toLocaleString() + "<br />";
            u.getNode('#'+prefix+'rows').innerHTML = termObj['rows'] + "<br />";
            u.getNode('#'+prefix+'cols').innerHTML = termObj['columns'] + "<br />";
            go.Visual.togglePanel('#'+prefix+'panel_info');
        }
        toolbarInfo.onclick = showInfo;
        toolbar.insertBefore(toolbarInfo, toolbarPrefs);
        toolbar.insertBefore(toolbarNewTerm, toolbarInfo);
        toolbar.insertBefore(toolbarClose, toolbarNewTerm);
        // Assign our visual terminal switching function (if not already assigned)
        if (!go.Terminal.termSelectCallback) {
            go.Terminal.termSelectCallback = go.Visual.slideToTerm;
        }
        // Register our keyboard shortcuts
        // Ctrl-Alt-N to create a new terminal
        if (!go.prefs.embedded) {
            go.Input.registerShortcut('KEY_N', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Terminal.newTerminal()'});
            // Ctrl-Alt-W to close the current terminal
            go.Input.registerShortcut('KEY_W', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'go.Terminal.closeTerminal(localStorage["'+prefix+'selectedTerminal"], false)'});
        }
        // Get shift-Insert working in a natural way
        go.Input.registerShortcut('KEY_INSERT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': go.Terminal.paste, 'preventDefault': false});
        // Register our actions
        go.Net.addAction('terminals', go.Terminal.reattachTerminalsAction);
        go.Net.addAction('termupdate', go.Terminal.updateTerminalAction);
        go.Net.addAction('term_ended', go.Terminal.closeTerminal);
        go.Net.addAction('timeout', go.Terminal.timeoutAction);
        go.Net.addAction('term_exists', go.Terminal.reconnectTerminalAction);
        go.Net.addAction('set_mode', go.Terminal.setModeAction); // For things like application cursor keys
        go.Net.addAction('metadata', go.Terminal.storeMetadata);
        go.Net.addAction('load_webworker', go.Terminal.loadWebWorkerAction);
    },
    paste: function(e) {
        // This gets attached to Shift-Insert (KEY_INSERT) as a shortcut in order to support pasting
        GateOne.Utils.getNode('#' + GateOne.prefs.prefix + 'pastearea').focus();
        // Since we're not calling preventDefault() on this event, by shifting focus to the pastearea (which is a textarea) the browser will execute the regular shift-Inert event (which is pasting =)
    },
    timeoutAction: function() {
        // Write a message to the screen indicating a timeout has occurred and close the WebSocket
        var u = go.Utils,
            terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal'));
        logError("Session timed out.");
        terms.forEach(function(termObj) {
            // Passing 'true' here to keep the stuff in localStorage for this term.
            go.Terminal.closeTerminal(termObj.id.split('term')[1], true);
        });
        u.getNode(go.prefs.goDiv).innerHTML = "Your session has timed out.  Reload the page to reconnect to Gate One.";
        go.ws.onclose = function() { // Have to replace the existing onclose() function so we don't end up auto-reconnecting.
            // Connection to the server was lost
            logDebug("WebSocket Closed");
        }
        go.ws.close(); // No reason to leave it open taking up resources on the server.
    },
    writeScrollback: function(term, scrollback) {
        try { // Save the scrollback buffer in localStorage for retrieval if the user reloads
            localStorage.setItem(GateOne.prefs.prefix+"scrollback" + term, scrollback.join('\n'));
        } catch (e) {
            logError(e);
        }
        return null;
    },
    applyScreen: function(screen, term) {
        // Uses *screen* (array of HTML-formatted lines) to update *term*
        // If *term* isn't given, will use localStorage[prefix+selectedTerminal]
        // NOTE:  Lines in *screen* that are empty strings or null will be ignored (so it is safe to pass a full array with only a single updated line)
        var u = GateOne.Utils,
            prefix = GateOne.prefs.prefix,
            existingPre = GateOne.terminals[term]['node'];
        if (!term) {
            term = localStorage[prefix+'selectedTerminal'];
        }
        for (var i=0; i < screen.length; i++) {
            if (screen[i].length) {
                // TODO: Get this using pre-cached line nodes
                if (GateOne.terminals[term]['screen'][i] != screen[i]) {
                    var existingLine = existingPre.querySelector(GateOne.prefs.goDiv + ' .' + prefix + 'line_' + i);
                    if (existingLine) {
                        existingLine.innerHTML = screen[i] + '\n';
                    } else { // Size of the terminal increased
                        var lineSpan = u.createElement('span', {'class': 'line_' + i});
                        lineSpan.innerHTML = screen[i] + '\n';
                        existingPre.appendChild(lineSpan);
                    }
                    // Update the existing screen array in-place to cut down on GC
                    GateOne.terminals[term]['screen'][i] = screen[i];
                }
            }
        }
    },
    termUpdateFromWorker: function(e) {
        var u = GateOne.Utils,
            prefix = GateOne.prefs.prefix + "",
            data = e.data,
            term = data.term,
            screen = data.screen,
            scrollback = data.scrollback,
            screen_html = "",
            consoleLog = data.log, // Only used when debugging
            screenUpdate = false,
            termTitle = "Gate One", // Will be replaced down below
            goDiv = u.getNode(GateOne.prefs.goDiv),
            termContainer = u.getNode('#'+prefix+'term'+term),
            existingPre = GateOne.terminals[term]['node'],
            existingScreen = GateOne.terminals[term]['screenNode'],
            reScrollback = u.partial(GateOne.Visual.enableScrollback, term),
            writeScrollback = u.partial(GateOne.Terminal.writeScrollback, term, scrollback);
        if (term && GateOne.terminals[term]) {
            termTitle = u.getNode('#'+prefix+'term'+term).title;
        } else {
            // Terminal was likely just closed.
            return;
        };
        if (screen) {
            try {
                if (existingScreen && GateOne.terminals[term]['screen'].length != screen.length) {
                    // Resized
                    GateOne.terminals[term]['screen'].length = screen.length; // Resize the array to match
                    u.removeElement(existingScreen); // Force it to be re-created
                    existingScreen = null;
                }
                if (existingScreen) { // Update the terminal display
                    GateOne.Terminal.applyScreen(screen, term);
                } else { // Create the elements necessary to display the screen
                    var screenSpan = u.createElement('span', {'id': 'term'+term+'screen'});
                    for (var i=0; i < screen.length; i++) {
                        var lineSpan = u.createElement('span', {'class': prefix + 'line_' + i});
                        lineSpan.innerHTML = screen[i] + '\n';
                        screenSpan.appendChild(lineSpan);
                        // Update the existing screen array in-place to cut down on GC
                        GateOne.terminals[term]['screen'][i] = screen[i];
                    }
                    GateOne.terminals[term]['screenNode'] = screenSpan;
                    if (existingPre) {
                        existingPre.appendChild(screenSpan);
                        u.scrollToBottom(existingPre);
                    } else {
                        var termPre = u.createElement('pre', {'id': 'term'+term+'_pre'});
                        termPre.appendChild(screenSpan);
                        termContainer.appendChild(termPre);
                        u.scrollToBottom(termPre);
                        if (GateOne.prefs.rows) { // If someone explicitly set rows/cols, scale the term to fit the screen
                            var nodeHeight = screenSpan.getClientRects()[0].top;
                            if (nodeHeight < goDiv.clientHeight) { // Resize to fit
                                var scale = goDiv.clientHeight / (goDiv.clientHeight - nodeHeight),
                                    transform = "scale(" + scale + ", " + scale + ")";
                                GateOne.Visual.applyTransform(termPre, transform);
                            }
                        } else {
                            var distance = goDiv.clientHeight - screenSpan.offsetHeight,
                            transform = "translateY(-" + distance + "px)";
                            GateOne.Visual.applyTransform(termPre, transform); // Move it to the top
                        }
                        GateOne.terminals[term]['node'] = termPre; // For faster access
                    }
                }
                screenUpdate = true;
                GateOne.terminals[term]['scrollbackVisible'] = false;
            } catch (e) { // Likely the terminal just closed
                console.log(e);
                u.noop(); // Just ignore it.
            } finally { // Instant GC
                termContainer = null;
                screen = null;
            }
        }
        if (scrollback) {
            GateOne.terminals[term]['scrollback'] = scrollback;
            // We wrap the logic that stores the scrollback buffer in a timer so we're not writing to localStorage (aka "to disk") every nth of a second for fast screen refreshes (e.g. fast typers).  Writing to localStorage is a blocking operation so this could speed things up considerable for larger terminal sizes.
            clearTimeout(GateOne.terminals[term]['scrollbackWriteTimer']);
            GateOne.terminals[term]['scrollbackWriteTimer'] = null;
            // This will save the scrollback buffer after 2 seconds of terminal inactivity (idle)
            try {
                GateOne.terminals[term]['scrollbackWriteTimer'] = setTimeout(writeScrollback, 2000); // 3.5 seconds is just past the default 'top' refresh rate
            } finally {
                writeScrollback = null;
                scrollback = null;
            }
        }
        if (consoleLog) {
            try {
                logInfo(consoleLog);
            } finally {
                consoleLog = null;
            }
        }
        if (screenUpdate) {
            // Take care of the activity/inactivity notifications
            if (GateOne.terminals[term]['inactivityTimer']) {
                clearTimeout(GateOne.terminals[term]['inactivityTimer']);
                var inactivity = u.partial(GateOne.Terminal.notifyInactivity, termTitle);
                try {
                    GateOne.terminals[term]['inactivityTimer'] = setTimeout(inactivity, GateOne.terminals[term]['inactivityTimeout']);
                } finally {
                    inactivity = null;
                }
            }
            if (GateOne.terminals[term]['activityNotify']) {
                if (!GateOne.terminals[term]['lastNotifyTime']) {
                    // Setup a minimum delay between activity notifications so we're not spamming the user
                    GateOne.terminals[term]['lastNotifyTime'] = new Date();
                    GateOne.Terminal.notifyActivity(termTitle);
                } else {
                    var then = new Date(GateOne.terminals[term]['lastNotifyTime']),
                        now = new Date();
                    try {
                        then.setSeconds(then.getSeconds() + 5); // 5 seconds between notifications
                        if (now > then) {
                            GateOne.terminals[term]['lastNotifyTime'] = new Date(); // Reset
                            GateOne.Terminal.notifyActivity(termTitle);
                        }
                    } finally {
                        then = null;
                        now = null;
                    }
                }
            }
            try {
                clearTimeout(GateOne.terminals[term]['scrollbackTimer']);
                GateOne.terminals[term]['scrollbackTimer'] = null;
                // This timeout re-adds the scrollback buffer after .5 seconds.  If we don't do this it can slow down the responsiveness quite a bit
                GateOne.terminals[term]['scrollbackTimer'] = setTimeout(reScrollback, 500); // Just enough to de-bounce (to keep things smooth)
            } finally {
                reScrollback = null; // Prevent memory leak
                screenUpdate = null;
            }
            // Excute any registered callbacks
            if (GateOne.Terminal.updateTermCallbacks.length) {
                for (var i=0; i<GateOne.Terminal.updateTermCallbacks.length; i++) {
                    GateOne.Terminal.updateTermCallbacks[i](term);
                }
            }
        }
        return null;
    },
    loadWebWorkerAction: function(source) {
        // Loads our Web Worker given it's *source* (which is sent to us over the WebSocket which is a clever workaround to the origin limitations of Web Workers =).
        var u = go.Utils,
            t = go.Terminal,
            prefix = go.prefs.prefix,
            bb = new BlobBuilder();
        bb.append(source); // Add the Web Worker source code
        // Obtain a blob URL reference to our worker 'file'.
        if (urlObj.createObjectURL) {
            var blobURL = urlObj.createObjectURL(bb.getBlob());
            t.termUpdatesWorker = new Worker(blobURL);
        } else {
            // Fall back to the old way
            t.termUpdatesWorker = new Worker(go.prefs.url+'static/go_process.js');
            // Why bother with Blobs?  Because you can't load Web Workers from a different origin *type*.  What?!?
            // The origin type would be, say, HTTPS on port 443.  So if I wanted to load a Web Worker from such a page where the Worker's URL is from an HTTPS server on port 10443 it would throw errors.  Even if it is from the same domain.  The same holds true for loading a Worker from an HTTP URL.  What's odd is that you can load a Worker from HTTPS on a completely *different* domain as long as it's the same origin *type*!  Who comes up with this stuff?!?
            // So by loading the Web Worker code via the WebSocket we can get around all that nonsense since WebSockets can be anywhere and on any port without silly restrictions.
            // In other words, the old way should still work as long as Gate One is listening on the same protocol (HTTPS) and port (443) as the app that's embedding it.
        }
        t.termUpdatesWorker.onmessage = t.termUpdateFromWorker;
    },
    updateTerminalAction: function(termUpdateObj) {
        // Replaces the contents of the terminal div with the lines in *termUpdateObj*.
        var go = GateOne,
            u = go.Utils,
            t = go.Terminal,
            v = go.Visual,
            prefix = go.prefs.prefix,
            term = termUpdateObj['term'],
            ratelimiter = termUpdateObj['ratelimiter'],
            prevScrollback = localStorage[prefix+"scrollback" + term],
            scrollback = go.terminals[term]['scrollback'],
            textTransforms = go.Terminal.textTransforms,
            message = null;
//         logDebug('GateOne.Utils.updateTerminalActionTest() termUpdateObj: ' + u.items(termUpdateObj));
        if (ratelimiter) {
            v.displayMessage("WARNING: The rate limiter was engaged on terminal " + term + ".  Output will be truncated for ten seconds.");
        }
        try {
            if (!scrollback) {
                // Terminal was just closed, ignore
                return;
            }
            // Remove all DOM nodes from the terminalObj since they can't be passed to a Web Worker
            if (screen) {
                message = {
                    'cmds': ['processScreen'],
                    'scrollback': scrollback,
                    'termUpdateObj': termUpdateObj,
                    'prevScrollback': prevScrollback,
                    'prefs': go.prefs,
                    'textTransforms': textTransforms
                };
                // Offload processing of the incoming screen to the Web Worker
                t.termUpdatesWorker.postMessage(message);
            }
        } finally {
            // Force GC
            message = null;
            textTransforms = null;
            prevScrollback = null;
            v = null;
            t = null;
            u = null;
            go = null;
        }
    },
    notifyInactivity: function(term) {
        // Notifies the user of inactivity in *term*
        var message = "Inactivity in terminal: " + term;
        GateOne.Visual.playBell();
        GateOne.Visual.displayMessage(message);
    },
    notifyActivity: function(term) {
        // Notifies the user of activity in *term*
        var message = "Activity in terminal: " + term;
        GateOne.Visual.playBell();
        GateOne.Visual.displayMessage(message);
    },
    newTerminal: function(/*Opt:*/term, /*Opt:*/type, /*Opt*/where) {
        // Adds a new terminal to the grid and starts updates with the server.
        // If *term* is provided, the created terminal will use that number.
        // If *type* is provided, the new terminal that is created will be of the given *type*.  Otherwise the default will be used.
        // If *where* is provided, the new terminal element will be appeded like so:  where.appendChild(<new terminal element>);  Otherwise the terminal will be added to the grid.
        // Terminal types are sent from the server via the 'terminal_types' action which sets up GateOne.terminalTypes.  This variable is an associative array in the form of:  {'term type': {'description': 'Description of terminal type', 'default': true/false, <other, yet-to-be-determined metadata>}}.
        // TODO: Finish supporting terminal types.
        logDebug("calling newTerminal(" + term + ")");
        var rowAdjust = 2;
        if (!GateOne.Playback) {
            rowAdjust = 1; //  Don't waste that bottom row if no playback plugin
        }
        var u = go.Utils,
            t = go.Terminal,
            prefix = go.prefs.prefix,
            currentTerm = null,
            terminal = null,
            termUndefined = false,
            termwrapper = u.getNode('#'+prefix+'termwrapper'),
            emDimensions = u.getEmDimensions(go.prefs.goDiv),
            dimensions = u.getRowsAndColumns(go.prefs.goDiv),
            rows = Math.ceil(dimensions.rows - rowAdjust),
            cols = Math.ceil(dimensions.cols - 7),
            prevScrollback = localStorage.getItem(prefix+"scrollback" + term);
        if (!go.prefs.embedded) { // Only create the grid if we're not in embedded mode (where everything must be explicit)
            // Create the grid if it isn't already present
            if (!termwrapper) {
                var goDiv = u.getNode(go.prefs.goDiv);
                termwrapper = go.Visual.createGrid('termwrapper');
                goDiv.appendChild(termwrapper);
                var style = window.getComputedStyle(goDiv, null),
                    adjust = 0;
                if (style['padding-right']) {
                    adjust = parseInt(style['padding-right'].split('px')[0]);
                }
                var gridWidth = (go.Visual.goDimensions.w+adjust) * 2; // Will likely always be x2
                termwrapper.style.width = gridWidth + 'px';
            }
        }
        if (term) {
            currentTerm = prefix+'term' + term;
            t.lastTermNumber = term;
        } else {
            termUndefined = true;
            if (!t.lastTermNumber) {
                t.lastTermNumber = 0; // Start at 0 so the first increment will be 1
            }
            t.lastTermNumber = t.lastTermNumber + 1;
            term = t.lastTermNumber;
            currentTerm = prefix+'term' + t.lastTermNumber;
        }
        if (!where) {
            if (termwrapper) {
                where = termwrapper; // Use the termwrapper (grid) by default
            } else {
                where = go.prefs.goDiv;
            }
        }
        // Create the terminal record scaffold
        go.terminals[term] = {
            created: new Date(), // So we can keep track of how long it has been open
            rows: rows,
            columns: cols,
            mode: 'default', // e.g. 'appmode', 'xterm', etc
            backspace: String.fromCharCode(127), // ^?
            screen: [],
            prevScreen: [],
            scrollback: [],
            scrollbackTimer: null // Controls re-adding scrollback buffer
        };
        for (var i=0; i<dimensions.rows; i++) {
            // Fill out prevScreen with spaces
            go.terminals[term]['prevScreen'].push(' ');
        }
        if (prevScrollback) {
            go.terminals[term]['scrollback'] = prevScrollback.split('\n');
        } else { // No previous scrollback buffer
            // Fill it with empty strings so that the current line stays at the bottom of the screen when scrollback is re-enabled after screen updates.
            var blankLines = [];
            for (var i=0; i<go.prefs.scrollback; i++) {
                blankLines.push("");
            }
            go.terminals[term]['scrollback'] = blankLines;
        }
        if (!go.prefs.embedded) {
            // Add the terminal div to the grid
            terminal = u.createElement('div', {'id': currentTerm, 'title': 'New Terminal', 'class': 'terminal', 'style': {'width': go.Visual.goDimensions.w + 'px', 'height': go.Visual.goDimensions.h + 'px'}});
        } else {
            terminal = u.createElement('div', {'id': currentTerm, 'title': 'New Terminal', 'class': 'terminal'});
        }
        // Get any previous term's dimensions so we can use them for the new terminal
        var termSettings = {
                'term': term,
                'rows': rows,
                'cols': cols,
                'em_dimensions': emDimensions
            },
            mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel",
            slide = u.partial(go.Terminal.switchTerminal, term),
            pastearea = u.createElement('textarea', {'id': 'pastearea'+term, 'class': 'pastearea'}),
        // The following functions control the copy & paste capability
            pasteareaOnInput = function(e) {
                var go = GateOne,
                    pasted = pastearea.value,
                    lines = pasted.split('\n');
                if (lines.length > 1) {
                    // If we're pasting stuff with newlines we should strip trailing whitespace so the lines show up correctly.  In all but a few cases this is what the user expects.
                    for (var i=0; i < lines.length; i++) {
                        lines[i] = lines[i].replace(/\s*$/g, ""); // Remove trailing whitespace
                    }
                    pasted = lines.join('\n');
                }
                go.Input.queue(pasted);
                pastearea.value = "";
                go.Net.sendChars();
            },
            pasteareaScroll = function(e) {
                // We have to hide the pastearea so we can scroll the terminal underneath
                e.preventDefault();
                var go = GateOne,
                    pasteArea = u.getNode('#'+prefix+'pastearea');
//                     selectedTerm = localStorage[prefix+'selectedTerminal'];
                u.hideElement(pastearea);
//                 if (!go.terminals[selectedTerm]['scrollbackVisible']) {
//                     // Immediately re-enable the scrollback buffer if it isn't already there
//                     go.Visual.enableScrollback(selectedTerm);
//                 }
                if (go.scrollTimeout) {
                    clearTimeout(go.scrollTimeout);
                    go.scrollTimeout = null;
                }
                go.scrollTimeout = setTimeout(function() {
                    u.showElement(pastearea);
                }, 1000);
            };
        pastearea.oninput = pasteareaOnInput;
        pastearea.addEventListener(mousewheelevt, pasteareaScroll, true);
        pastearea.onpaste = function(e) {
            // Start capturing input again
            setTimeout(function() { GateOne.Input.capture(); }, 150);
        }
        pastearea.onmousedown = function(e) {
            // When the user left-clicks assume they're trying to highlight text
            // so bring the terminal to the front and try to emulate normal
            // cursor-text action as much as possible.
            // NOTE: There's one caveat with this method:  If text is highlighted
            //       right-click to paste won't work.  So the user has to just click
            //       somewhere (to deselect the text) before they can use the Paste
            //       context menu.  As a convenient shortcut/workaround, the user
            //       can middle-click to paste the current selection.
            logDebug('pastearea.onmousedown button: ' + e.button + ', which: ' + e.which);
            var go = GateOne,
                u = go.Utils,
                prefix = go.prefs.prefix,
                m = go.Input.mouse(e), // Get the properties of the mouse event
                X = e.clientX,
                Y = e.clientY,
                selectedTerm = localStorage[prefix+'selectedTerminal'];
            if (m.button.left) { // Left button depressed
                u.hideElement(pastearea);
                // This lets users click on links underneath the pastearea
                if (document.elementFromPoint(X, Y).tagName == "A") {
                    window.open(document.elementFromPoint(X, Y).href);
                }
                // Don't add the scrollback if the user is highlighting text--it will mess it up
                if (go.terminals[selectedTerm]) {
                    if (go.terminals[selectedTerm]['scrollbackTimer']) {
                        clearTimeout(go.terminals[selectedTerm]['scrollbackTimer']);
                    }
                }
                u.getNode(go.prefs.goDiv).focus();
            }
        }
        terminal.appendChild(pastearea);
        go.terminals[term]['pasteNode'] = pastearea;
        u.getNode(where).appendChild(terminal);
        // Apply user-defined rows and cols (if set)
        if (go.prefs.cols) { termSettings.cols = go.prefs.cols };
        if (go.prefs.rows) { termSettings.rows = go.prefs.rows };
        // Tell the server to create a new terminal process
        go.ws.send(JSON.stringify({'new_terminal': termSettings}));
        // Autoconnect if autoConnectURL is specified
        if (go.prefs.autoConnectURL) {
            setTimeout(function () {
                go.Input.queue(go.prefs.autoConnectURL+'\n');
                go.Net.sendChars();
            }, 500);
        }
        // Switch to our new terminal if *term* is set (no matter where it is)
        if (termUndefined) {
            // Only slide for terminals that are actually *new* (as opposed to ones that we're re-attaching to)
            setTimeout(slide, 100);
        }
        // Excute any registered callbacks
        if (go.Terminal.newTermCallbacks.length) {
            go.Terminal.newTermCallbacks.forEach(function(callback) {
                callback(term);
            });
        }
        return term; // So you can call it from your own code and know what terminal number you wound up with
    },
    closeTerminal: function(term, /*opt*/noCleanup) {
        // Closes the given terminal and tells the server to end its running process.
        // If noCleanup resolves to true, stored data will be left hanging around for this terminal (e.g. the scrollback buffer in localStorage).  Otherwise it will be deleted.
        var u = GateOne.Utils,
            prefix = go.prefs.prefix,
            message = "Closed term " + term + ": " + u.getNode('#'+prefix+'term' + term).title,
            lastTerm = null;
        // Tell the server to kill the terminal
        go.Net.killTerminal(term);
        if (!noCleanup) {
            // Delete the associated scrollback buffer (save the world from localStorage pollution)
            delete localStorage[prefix+'scrollback'+term];
        }
        // Remove the terminal from the page
        u.removeElement('#'+prefix+'term' + term);
        // Also remove it from working memory
        delete go.terminals[term];
        // Now find out what the previous terminal was and move to it
        var terms = u.toArray(u.getNodes(go.prefs.goDiv + ' .terminal'));
        go.Visual.displayMessage(message);
        terms.forEach(function(termObj) {
            lastTerm = termObj;
        });
        // Excute any registered callbacks
        if (go.Terminal.closeTermCallbacks.length) {
            go.Terminal.closeTermCallbacks.forEach(function(callback) {
                callback(term);
            });
        }
        if (lastTerm) {
            var termNum = lastTerm.id.split('term')[1];
            go.Terminal.switchTerminal(termNum);
        } else {
            // Only open a new terminal if we're not in embedded mode.  When you embed you have more explicit control but that also means taking care of stuff like this on your own.
            if (!go.prefs.embedded) {
                if (go.ws.readyState == 1) {
                    // There are no other terminals and we're still connected.  Open a new one...
                    go.Terminal.newTerminal();
                }
            }
        }
    },
    switchTerminal: function(term) {
        // Calls GateOne.Net.setTerminal(*term*) then calls whatever function is assigned to GateOne.Terminal.termSelectCallback(*term*) (default is GateOne.Terminal.switchTerminal())
        // So if you want to write your own animation/function for switching terminals you can make it happen by simply assigning your function to GateOne.Terminal.termSelectCallback
        go.Net.setTerminal(term);
        go.Terminal.termSelectCallback(term);
    },
    reconnectTerminalAction: function(term) {
        // Called when the server reports that the terminal number supplied via 'new_terminal' already exists
        // NOTE: Doesn't do anything at the moment...  May never do anything.  You never know.
        logDebug('reconnectTerminalAction(' + term + ')');
    },
    reattachTerminalsAction: function(terminals){
        // Called after we authenticate to the server...
        // If we're reconnecting to an existing session, running terminals will be recreated/reattached.
        // If this is a new session, a new terminal will be created.
        var u = go.Utils,
            prefix = go.prefs.prefix;
        logDebug("reattachTerminalsAction() terminals: " + terminals);
        // Clean up localStorage
        for (var key in localStorage) {
            // Clean up old scrollback buffers that aren't attached to terminals anymore:
            if (key.indexOf(prefix+'scrollback') == 0) { // This is a scrollback buffer
                var termNum = parseInt(key.split(prefix+'scrollback')[1]);
                if (terminals.indexOf(termNum) == -1) { // Terminal for this buffer no longer exists
                    logDebug("Deleting scollback buffer for non-existent terminal " + key);
                    delete localStorage[key];
                }
            }
        }
        if (!go.prefs.embedded && go.Terminal.reattachTerminalsCallbacks.length == 0) { // Only perform the default action if not in embedded mode and there are no registered reattachTerminalsCallbacks callbacks.
            if (terminals.length) {
                // Reattach the running terminals
                var selectedMatch = false;
                terminals.forEach(function(termNum) {
                    if (termNum == localStorage[prefix+'selectedTerminal']) {
                        selectedMatch = true;
                        var slide = u.partial(go.Terminal.switchTerminal, termNum);
                        setTimeout(slide, 500);
                    }
                    go.Terminal.newTerminal(termNum);
                    go.Terminal.lastTermNumber = termNum;
                });
                if (!selectedMatch) {
                    go.Terminal.switchTerminal(go.Terminal.lastTermNumber);
                }
            } else {
                // Create a new terminal
                go.Terminal.lastTermNumber = 0; // Reset to 0
                setTimeout(function() {
                    go.Terminal.newTerminal();
                }, 1000); // Give everything a moment to settle so the dimensions are set properly
            }
        }
        if (go.Terminal.reattachTerminalsCallbacks.length) {
            // Call any registered callbacks
            go.Terminal.reattachTerminalsCallbacks.forEach(function(callback) {
                callback(terminals);
            });
        }
    },
    modes: {
        // Various functions that will be called when a matching mode is set.
        // NOTE: Most mode settings only apply on the server side of things (which is why this is so short).
        '1': function(term, bool) {
            // Application Cursor Mode
            logDebug("Setting Application Cursor Mode to: " + bool + " on term: " + term);
            if (bool) {
                // Turn on Application Cursor Keys mode
                GateOne.terminals[term]['mode'] = 'appmode';
            } else {
                // Turn off Application Cursor Keys mode
                GateOne.terminals[term]['mode'] = 'default';
            }
        }
    },
    setModeAction: function(modeObj) {
        // Set the given terminal mode (e.g. application cursor mode aka appmode)
        // *modeObj* is expected to be something like this:
        //     {'mode': '1', 'term': '1', 'bool': true}
        logDebug("setModeAction modeObj: " + GateOne.Utils.items(modeObj));
        GateOne.Terminal.modes[modeObj.mode](modeObj.term, modeObj.bool);
    },
    registerTextTransform: function(name, pattern, newString) {
        // Adds a new or replaces an existing text transformation to GateOne.Terminal.textTransforms using *pattern* and *newString* with the given *name*.  Example:
        //      var pattern = /(\bIM\d{9,10}\b)/g,
        //          newString = "<a href='https://support.company.com/tracker?ticket=$1' target='new'>$1</a>";
        //      GateOne.Terminal.registerTextTransform("ticketIDs", pattern, newString);
        // Would linkify text matching that pattern in the terminal.
        // For example, if you typed "Ticket number: IM123456789" into a terminal it would be transformed thusly:
        //      "Ticket number: <a href='https://support.company.com/tracker?ticket=IM123456789' target='new'>IM123456789</a>"
        //
        // NOTE: *name* is only used for reference purposes in the textTransforms object.
        var go = GateOne;
        if (typeof(pattern) == "object") {
            pattern = pattern.toString(); // Have to convert it to a string so we can pass it to the Web Worker so Firefox won't freak out
        }
        go.Terminal.textTransforms[name] = {};
        go.Terminal.textTransforms[name]['pattern'] = pattern;
        go.Terminal.textTransforms[name]['newString'] = newString;
    },
    resetTerminalAction: function(term) {
        // Clears the screen and the scrollback buffer (in memory and in localStorage)
        var prefix = go.prefs.prefix;
        logDebug("resetTerminalAction term: " + term);
        go.terminals[term]['scrollback'] = [];
        go.terminals[term]['screen'] = [];
        localStorage[prefix+"scrollback" + term] = '';
    }
});

GateOne.Base.module(GateOne, "User", "1.0", ['Base', 'Utils', 'Visual']);
GateOne.User.userLoginCallbacks = []; // Each of these will get called after the server sends us the user's username, providing the username as the only argument.
GateOne.Base.update(GateOne.User, {
    // The User module is for things like logging out, synchronizing preferences with the server, and it is also meant to provide hooks for plugins to tie into so that actions can be taken when user-specific events occur.
    init: function() {
        var u = go.Utils,
            prefix = go.prefs.prefix,
            prefsPanel = u.getNode('#'+prefix+'panel_prefs'),
            prefsPanelForm = u.getNode('#'+prefix+'prefs_form'),
            prefsPanelUserInfo = u.createElement('div', {'id': 'user_info'}),
            prefsPanelUserID = u.createElement('span', {'id': 'user_info_id'}),
            prefsPanelUserLogout = u.createElement('a', {'id': 'user_info_logout'});
        if (prefsPanelForm) { // Only add to the prefs panel if it actually exists (i.e. not in embedded mode)
            prefsPanelUserLogout.innerHTML = "Sign Out";
            prefsPanelUserLogout.onclick = function(e) {
                e.preventDefault();
                go.User.logout();
            }
            prefsPanelUserInfo.appendChild(prefsPanelUserID);
            prefsPanelUserInfo.appendChild(prefsPanelUserLogout);
            prefsPanel.insertBefore(prefsPanelUserInfo, prefsPanelForm);
            // Surround "Sign Out" with parens (looks nicer this way)
            prefsPanelUserLogout.insertAdjacentHTML("beforeBegin", "(");
            prefsPanelUserLogout.insertAdjacentHTML("afterEnd", ")");
        }
        // Register our actions
        go.Net.addAction('set_username', go.User.setUsername);
        go.Net.addAction('load_bell', go.User.loadBell);
    },
    setUsername: function(username) {
        // Sets GateOne.User.username using *username*.  Also provides hooks that plugins can have called after a user has logged in successfully.
        // NOTE:  Primarily here to present something more easy to understand than the session ID :)
        var u = go.Utils,
            prefix = go.prefs.prefix,
            prefsPanelUserID = u.getNode('#'+prefix+'user_info_id');
        logDebug("setUsername(" + username + ")");
        GateOne.User.username = username;
        if (prefsPanelUserID) {
            prefsPanelUserID.innerHTML = username + " ";
        }
        if (go.User.userLoginCallbacks.length) {
            // Call any registered callbacks
            go.User.userLoginCallbacks.forEach(function(callback) {
                callback(username);
            });
        }
    },
    logout: function() {
        // Logs the user out of Gate One by deleting the "user" cookie and everything related to Gate One in localStorage
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix;
        // Remove all Gate One-specific items from localStorage by deleting everything that starts with GateOne.prefs.prefix.
        for (var key in localStorage) {
            if (u.startsWith(prefix, key)) {
                delete localStorage[key];
            }
        }
        // NOTE: This takes care of deleting the "user" cookie
        u.xhrGet(go.prefs.url+'auth?logout=True', function(response) {
            logDebug("Logout Response: " + response);
            var url = response;
            v.displayMessage("You have been logged out.  Redirecting to: " + url);
            setTimeout(function() {
                window.location.href = url;
            }, 2000);
        });
    },
    loadBell: function(message) {
        // Loads the bell sound into the page as an <audio> element using the given *audioDataURI*.
        var u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv),
            audioDataURI = message['data_uri'],
            mimetype = message['mimetype'],
            existing = u.getNode('#'+go.prefs.prefix+'bell'),
            audioElem = u.createElement('audio', {'id': 'bell', 'preload': 'auto'}),
            sourceElem = u.createElement('source', {'id': 'bell_source', 'type': mimetype});
        if (existing) {
            u.removeElement(existing);
        }
        sourceElem.src = audioDataURI;
        audioElem.appendChild(sourceElem);
        goDiv.appendChild(audioElem);
        // Cache it so we don't have to re-download it every time.
        go.prefs.bellSound = audioDataURI;
        go.prefs.bellSoundType = mimetype;
        u.savePrefs(true);
    },
    uploadBellDialog: function() {
        // Displays a dialog/form where the user can upload a replacement bell sound or use the default
        var u = go.Utils,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            playBell = u.createElement('button', {'id': 'play_bell', 'value': 'play_bell', 'class': 'button black'}),
            defaultBell = u.createElement('button', {'id': 'default_bell', 'value': 'default_bell', 'class': 'button black', 'style': {'float': 'right', 'margin-right': '1.5em'}}),
            uploadBellForm = u.createElement('form', {'name': prefix+'upload_bell_form', 'style': {'width': '25em'}}),
            bellFile = u.createElement('input', {'type': 'file', 'id': 'upload_bell', 'name': prefix+'upload_bell'}),
            bellFileLabel = u.createElement('label'),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': 'Submit', 'class': 'button black', 'style': {'float': 'right', 'margin-right': '1.5em'}}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': 'Cancel', 'class': 'button black', 'style': {'float': 'right'}});
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        defaultBell.innerHTML = "Reset Bell to Default";
        playBell.innerHTML = "Play Current Bell";
        playBell.onclick = function(e) {
            e.preventDefault();
            go.Visual.playBell();
        }
        bellFileLabel.innerHTML = "Select a Sound File";
        bellFileLabel.htmlFor = prefix+'upload_bell';
        uploadBellForm.appendChild(playBell);
        uploadBellForm.appendChild(defaultBell);
        uploadBellForm.appendChild(bellFileLabel);
        uploadBellForm.appendChild(bellFile);
        uploadBellForm.appendChild(submit);
        uploadBellForm.appendChild(cancel);
        var closeDialog = go.Visual.dialog('Upload Bell Sound', uploadBellForm);
        cancel.onclick = closeDialog;
        defaultBell.onclick = function(e) {
            e.preventDefault();
            go.ws.send(JSON.stringify({'get_bell': null}));
            closeDialog();
        }
        uploadBellForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var bellFile = u.getNode('#'+prefix+'upload_bell').files[0],
                bellReader = new FileReader(),
                saveBell = function(evt) {
                    var dataURI = evt.target.result,
                        mimetype = bellFile.type;
                    go.User.loadBell({'mimetype': mimetype, 'data_uri': dataURI});
                };
            // Get the data out of the files
            bellReader.onload = saveBell;
            bellReader.readAsDataURL(bellFile);
            closeDialog();
        }
    },
});

// Protocol actions
GateOne.Net.actions = {
// These are what will get called when the server sends us each respective action
    'log': GateOne.Net.log,
    'ping': GateOne.Net.ping,
    'pong': GateOne.Net.pong,
    'reauthenticate': GateOne.Net.reauthenticate,
}

GateOne.Icons['prefs'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient15560" x1="85.834" gradientUnits="userSpaceOnUse" x2="85.834" gradientTransform="translate(288.45271,199.32483)" y1="363.23" y2="388.56"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.71050762,0,0,0.71053566,-256.93092,-399.71681)"><path fill="url(#linearGradient15560)" d="m386.95,573.97c0-0.32-0.264-0.582-0.582-0.582h-1.069c-0.324,0-0.662-0.25-0.751-0.559l-1.455-3.395c-0.155-0.277-0.104-0.69,0.123-0.918l0.723-0.723c0.227-0.228,0.227-0.599,0-0.824l-1.74-1.741c-0.226-0.228-0.597-0.228-0.828,0l-0.783,0.787c-0.23,0.228-0.649,0.289-0.931,0.141l-2.954-1.18c-0.309-0.087-0.561-0.423-0.561-0.742v-1.096c0-0.319-0.264-0.581-0.582-0.581h-2.464c-0.32,0-0.583,0.262-0.583,0.581v1.096c0,0.319-0.252,0.657-0.557,0.752l-3.426,1.467c-0.273,0.161-0.683,0.106-0.912-0.118l-0.769-0.77c-0.226-0.226-0.597-0.226-0.824,0l-1.741,1.742c-0.229,0.228-0.229,0.599,0,0.825l0.835,0.839c0.23,0.228,0.293,0.642,0.145,0.928l-1.165,2.927c-0.085,0.312-0.419,0.562-0.742,0.562h-1.162c-0.319,0-0.579,0.262-0.579,0.582v2.463c0,0.322,0.26,0.585,0.579,0.585h1.162c0.323,0,0.66,0.249,0.753,0.557l1.429,3.369c0.164,0.276,0.107,0.688-0.115,0.916l-0.802,0.797c-0.226,0.227-0.226,0.596,0,0.823l1.744,1.741c0.227,0.228,0.598,0.228,0.821,0l0.856-0.851c0.227-0.228,0.638-0.289,0.925-0.137l2.987,1.192c0.304,0.088,0.557,0.424,0.557,0.742v1.141c0,0.32,0.263,0.582,0.583,0.582h2.464c0.318,0,0.582-0.262,0.582-0.582v-1.141c0-0.318,0.25-0.654,0.561-0.747l3.34-1.418c0.278-0.157,0.686-0.103,0.916,0.122l0.753,0.758c0.227,0.225,0.598,0.225,0.825,0l1.743-1.744c0.227-0.226,0.227-0.597,0-0.822l-0.805-0.802c-0.223-0.228-0.285-0.643-0.134-0.926l1.21-3.013c0.085-0.31,0.423-0.559,0.747-0.562h1.069c0.318,0,0.582-0.262,0.582-0.582v-2.461zm-12.666,5.397c-2.29,0-4.142-1.855-4.142-4.144s1.852-4.142,4.142-4.142c2.286,0,4.142,1.854,4.142,4.142s-1.855,4.144-4.142,4.144z"/></g></svg>';
GateOne.Icons['back_arrow'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient12573" y2="449.59" gradientUnits="userSpaceOnUse" x2="235.79" y1="479.59" x1="235.79"><stop class="panelstop1" offset="0"/><stop class="panelstop2" offset="0.4944"/><stop class="panelstop3" offset="0.5"/><stop class="panelstop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-360.00001,-529.36218)"><g transform="matrix(0.6,0,0,0.6,227.52721,259.60639)"><circle d="m 250.78799,464.59299 c 0,8.28427 -6.71572,15 -15,15 -8.28427,0 -15,-6.71573 -15,-15 0,-8.28427 6.71573,-15 15,-15 8.28428,0 15,6.71573 15,15 z" cy="464.59" cx="235.79" r="15" fill="url(#linearGradient12573)"/><path fill="#FFF" d="m224.38,464.18,11.548,6.667v-3.426h5.003c2.459,0,5.24,3.226,5.24,3.226s-0.758-7.587-3.54-8.852c-2.783-1.265-6.703-0.859-6.703-0.859v-3.425l-11.548,6.669z"/></g></g></svg>';
GateOne.Icons['panelclose'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient3011" y2="252.75" gradientUnits="userSpaceOnUse" y1="232.75" x2="487.8" x1="487.8"><stop class="panelstop1" offset="0"/><stop class="panelstop2" offset="0.4944"/><stop class="panelstop3" offset="0.5"/><stop class="panelstop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" fill="url(#linearGradient3011)"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';

window.GateOne = GateOne; // Make everything usable

})(window);
