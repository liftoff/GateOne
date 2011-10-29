/*
COPYRIGHT NOTICE
================

gateone.js and all related original code...

Copyright 2011 Liftoff Software Corporation

Gate One Client - JavaScript
============================

Note: Icons came from the folks at GoSquared.  Thanks guys!
http://www.gosquared.com/liquidicity/archives/122

NOTE regarding plugins:  Only plugins that could feasibly be removed entirely
from Gate One were broken out into their own plugin directories.  Only modules
and functions that are absolutely essential to Gate One should be placed within
this file.
*/

// 1.0 TODO:
// TODO: Add a first-time user splash screen that explains how Gate One works and how special features like copy & paste work.
// TODO: Fix the playback button.
// TODO: Finish the search field in Bookmarks.
// TODO: Fix any remaining ugliness:
//        * fix CSS inside recordings.
// TODO: TEST TEST TEST.

// General TODOs
// TODO: Finish embedded mode stuff.
// TODO: Separate creation of the various panels into their own little functions so we can efficiently neglect to execute them if in embedded mode.

// Everything goes in GateOne
(function(window, undefined) {

var document = window.document; // Have to do this because we're sandboxed

// NOTE: Probably don't need this since none of the browsers that support WebSockets are actually missing these functions.  You never know I guess.
// Polyfills (functions that fix missing features in older browsers)
if (!Array.prototype.forEach) { // Add .forEach to Array if it is missing
    Array.prototype.forEach = function(fun /*, thisp*/) {
        var len = this.length;
        if (typeof fun != "function")
            throw new TypeError();
        var thisp = arguments[1];
        for (var i = 0; i < len; i++) {
            if (i in this)
                fun.call(thisp, this[i], i, this);
        }
    };
}
if (!Array.prototype.indexOf) { // Add .indexOf to Array if it is missing
    Array.prototype.indexOf = function(elt /*, from*/) {
        var len = this.length,
            from = Number(arguments[1]) || 0;
        from = (from < 0) ? Math.ceil(from) : Math.floor(from);
        if (from < 0)
            from += len;
        for (; from < len; from++) {
            if (from in this &&
                this[from] === elt)
                return from;
        }
        return -1;
    };
}

// Sandbox-wide shortcuts
var ESC = String.fromCharCode(27); // Saves a lot of typing and it's easy to read
// Log level shortcuts for each log level (actually assigned in GateOne.init())
var logFatal = null;
var logError = null;
var logWarning = null;
var logInfo = null;
var logDebug = null;

// These can be used to test the performance of various functions and whatnot.
benchmark = null; // Need a global for this to work across the board
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
GateOne.VERSION = "0.9";
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
GateOne.Base.module(GateOne, "Base", "0.9", []);

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

// Choose the appropriate WebSocket
var WebSocket =  window.MozWebSocket || window.WebSocket || window.WebSocketDraft || null;

// GateOne Settings
GateOne.prefs = { // Tunable prefs (things users can change)
    url: null, // URL of the GateOne server.  Will default to whatever is in window.location
    fillContainer: true, // If set to true, #gateone will fill itself out to the full size of its parent element
    style: {}, // Whatever CSS the user wants to apply to #gateone.  NOTE: Width and height will be skipped if fillContainer is true
    goDiv: '#gateone', // Default element to place gateone inside
    scrollback: 500, // Amount of lines to keep in the scrollback buffer
    rows: null, // Override the automatically calculated value (null means fill the window)
    cols: null, // Ditto
    prefix: 'go_', // What to prefix all GateOne elements with (in case you need to avoid a name conflict)
    theme: 'black', // The theme to use by default (e.g. 'black', 'white', etc)
    colors: 'default', // The color scheme to use (e.g. 'default', 'gnome-terminal', etc)
    fontSize: '100%', // The font size that will be applied to the goDiv element (so users can adjust it on-the-fly)
    autoConnectURL: null, // This is a URL that will be automatically connected to whenever a terminal is loaded. TODO: Move this to the ssh plugin.
    embedded: false, // In embedded mode we have no toolbar and only one terminal is allowed
    disableTermTransitions: false // Disabled the sliding animation on terminals to make switching faster
};
// Icons (so we can use them in more than one place or replace them all by applying a theme)
GateOne.Icons = {};
GateOne.Icons['prefs'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient15560" x1="85.834" gradientUnits="userSpaceOnUse" x2="85.834" gradientTransform="translate(288.45271,199.32483)" y1="363.23" y2="388.56"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.71050762,0,0,0.71053566,-256.93092,-399.71681)"><path fill="url(#linearGradient15560)" d="m386.95,573.97c0-0.32-0.264-0.582-0.582-0.582h-1.069c-0.324,0-0.662-0.25-0.751-0.559l-1.455-3.395c-0.155-0.277-0.104-0.69,0.123-0.918l0.723-0.723c0.227-0.228,0.227-0.599,0-0.824l-1.74-1.741c-0.226-0.228-0.597-0.228-0.828,0l-0.783,0.787c-0.23,0.228-0.649,0.289-0.931,0.141l-2.954-1.18c-0.309-0.087-0.561-0.423-0.561-0.742v-1.096c0-0.319-0.264-0.581-0.582-0.581h-2.464c-0.32,0-0.583,0.262-0.583,0.581v1.096c0,0.319-0.252,0.657-0.557,0.752l-3.426,1.467c-0.273,0.161-0.683,0.106-0.912-0.118l-0.769-0.77c-0.226-0.226-0.597-0.226-0.824,0l-1.741,1.742c-0.229,0.228-0.229,0.599,0,0.825l0.835,0.839c0.23,0.228,0.293,0.642,0.145,0.928l-1.165,2.927c-0.085,0.312-0.419,0.562-0.742,0.562h-1.162c-0.319,0-0.579,0.262-0.579,0.582v2.463c0,0.322,0.26,0.585,0.579,0.585h1.162c0.323,0,0.66,0.249,0.753,0.557l1.429,3.369c0.164,0.276,0.107,0.688-0.115,0.916l-0.802,0.797c-0.226,0.227-0.226,0.596,0,0.823l1.744,1.741c0.227,0.228,0.598,0.228,0.821,0l0.856-0.851c0.227-0.228,0.638-0.289,0.925-0.137l2.987,1.192c0.304,0.088,0.557,0.424,0.557,0.742v1.141c0,0.32,0.263,0.582,0.583,0.582h2.464c0.318,0,0.582-0.262,0.582-0.582v-1.141c0-0.318,0.25-0.654,0.561-0.747l3.34-1.418c0.278-0.157,0.686-0.103,0.916,0.122l0.753,0.758c0.227,0.225,0.598,0.225,0.825,0l1.743-1.744c0.227-0.226,0.227-0.597,0-0.822l-0.805-0.802c-0.223-0.228-0.285-0.643-0.134-0.926l1.21-3.013c0.085-0.31,0.423-0.559,0.747-0.562h1.069c0.318,0,0.582-0.262,0.582-0.582v-2.461zm-12.666,5.397c-2.29,0-4.142-1.855-4.142-4.144s1.852-4.142,4.142-4.142c2.286,0,4.142,1.854,4.142,4.142s-1.855,4.144-4.142,4.144z"/></g></svg>';
GateOne.Icons['back_arrow'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient12573" y2="449.59" gradientUnits="userSpaceOnUse" x2="235.79" y1="479.59" x1="235.79"><stop class="panelstop1" offset="0"/><stop class="panelstop2" offset="0.4944"/><stop class="panelstop3" offset="0.5"/><stop class="panelstop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-360.00001,-529.36218)"><g transform="matrix(0.6,0,0,0.6,227.52721,259.60639)"><circle d="m 250.78799,464.59299 c 0,8.28427 -6.71572,15 -15,15 -8.28427,0 -15,-6.71573 -15,-15 0,-8.28427 6.71573,-15 15,-15 8.28428,0 15,6.71573 15,15 z" cy="464.59" cx="235.79" r="15" fill="url(#linearGradient12573)"/><path fill="#FFF" d="m224.38,464.18,11.548,6.667v-3.426h5.003c2.459,0,5.24,3.226,5.24,3.226s-0.758-7.587-3.54-8.852c-2.783-1.265-6.703-0.859-6.703-0.859v-3.425l-11.548,6.669z"/></g></g></svg>';
GateOne.Icons['panelclose'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient3011" y2="252.75" gradientUnits="userSpaceOnUse" y1="232.75" x2="487.8" x1="487.8"><stop class="panelstop1" offset="0"/><stop class="panelstop2" offset="0.4944"/><stop class="panelstop3" offset="0.5"/><stop class="panelstop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" fill="url(#linearGradient3011)"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';

GateOne.Base.update(GateOne, {
    // GateOne internal tracking variables and user functions
    terminals: {}, // For keeping track of running terminals
    doingUpdate: false, // Used to prevent out-of-order character events
    ws: null, // Where our WebSocket gets stored
    // This starts up GateOne using the given settings (*prefs*)
    init: function(prefs) {
        // Before we do anything else, load our prefs
        // Update GateOne.prefs with the settings provided in the calling page
        for (setting in prefs) {
            GateOne.prefs[setting] = prefs[setting];
        }
        // Now override them with the user's settings (if present)
        if (localStorage['prefs']) {
            GateOne.Utils.loadPrefs();
        }
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        logFatal = GateOne.Logging.logFatal || GateOne.Utils.noop;
        logError = GateOne.Logging.logError || GateOne.Utils.noop;
        logWarning = GateOne.Logging.logWarning || GateOne.Utils.noop;
        logInfo = GateOne.Logging.logInfo || GateOne.Utils.noop;
        logDebug = GateOne.Logging.logDebug || GateOne.Utils.noop;
        var go = GateOne,
            u = go.Utils,
            pb = GateOne.Playback,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            prefsPanel = u.createElement('div', {'id': prefix+'panel_prefs', 'class': prefix+'panel'}),
            prefsPanelH2 = u.createElement('h2'),
            prefsPanelForm = u.createElement('form', {'id': prefix+'prefs_form', 'name': prefix+'prefs_form'}),
            prefsPanelStyleRow1 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelStyleRow2 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelStyleRow3 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelStyleRow4 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelRow1 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelRow2 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelRow3 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelRow4 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            prefsPanelRow5 = u.createElement('div', {'class': prefix+'paneltablerow'}),
            hr = u.createElement('hr', {'style': {'width': '100%', 'margin-top': '0.5em', 'margin-bottom': '0.5em'}}),
            tableDiv = u.createElement('div', {'id': prefix+'prefs_tablediv1', 'class': prefix+'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            tableDiv2 = u.createElement('div', {'class': prefix+'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            prefsPanelThemeLabel = u.createElement('span', {'id': prefix+'prefs_theme_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelTheme = u.createElement('select', {'id': prefix+'prefs_theme', 'name': prefix+'prefs_theme', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelColorsLabel = u.createElement('span', {'id': prefix+'prefs_colors_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelColors = u.createElement('select', {'id': prefix+'prefs_colors', 'name': prefix+'prefs_colors', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelFontSizeLabel = u.createElement('span', {'id': prefix+'prefs_fontsize_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelFontSize = u.createElement('input', {'id': prefix+'prefs_fontsize', 'name': prefix+'prefs_fontsize', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelDisableTermTransitionsLabel = u.createElement('span', {'id': prefix+'prefs_disabletermtrans_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelDisableTermTransitions = u.createElement('input', {'id': prefix+'prefs_disabletermtrans', 'name': prefix+'prefs_disabletermtrans', 'value': 'disabletermtrans', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelScrollbackLabel = u.createElement('span', {'id': prefix+'prefs_scrollback_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelScrollback = u.createElement('input', {'id': prefix+'prefs_scrollback', 'name': prefix+'prefs_scrollback', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelLogLinesLabel = u.createElement('span', {'id': prefix+'prefs_loglines_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelLogLines = u.createElement('input', {'id': prefix+'prefs_loglines', 'name': prefix+'prefs_loglines', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelPlaybackLabel = u.createElement('span', {'id': prefix+'prefs_playback_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelPlayback = u.createElement('input', {'id': prefix+'prefs_playback', 'name': prefix+'prefs_playback', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelRowsLabel = u.createElement('span', {'id': prefix+'prefs_rows_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelRows = u.createElement('input', {'id': prefix+'prefs_rows', 'name': prefix+'prefs_rows', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelColsLabel = u.createElement('span', {'id': prefix+'prefs_cols_label', 'class': prefix+'paneltablelabel'}),
            prefsPanelCols = u.createElement('input', {'id': prefix+'prefs_cols', 'name': prefix+'prefs_cols', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelSave = u.createElement('button', {'id': prefix+'prefs_save', 'type': 'submit', 'value': 'Save', 'class': 'button black', 'style': {'float': 'right'}}),
            noticeContainer = u.createElement('div', {'id': prefix+'noticecontainer', 'style': {'margin-right': '2em', 'background': 'transparent'}}),
            toolbar = u.createElement('div', {'id': prefix+'toolbar'}),
            toolbarIconPrefs = u.createElement('div', {'id': prefix+'icon_prefs', 'class': prefix+'toolbar', 'title': "Preferences"}),
            panels = document.getElementsByClassName('panel'),
            sideinfo = u.createElement('div', {'id': prefix+'sideinfo', 'class': prefix+'sideinfo'}),
            themeList = [], // Gets filled out below
            colorsList = [],
            enumerateCSS = function(jsonObj) {
                // Meant to be called from the xhrGet() below
                var decoded = JSON.parse(jsonObj),
                    themesList = decoded['themes'],
                    colorsList = decoded['colors'],
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
            updateCSSfunc = function() { u.xhrGet(go.prefs.url + 'style?enumerate=True', enumerateCSS) };
        // Create our prefs panel
        toolbarIconPrefs.innerHTML = GateOne.Icons.prefs;
        prefsPanelH2.innerHTML = "Preferences";
        prefsPanel.appendChild(prefsPanelH2);
        prefsPanelThemeLabel.innerHTML = "<b>Theme:</b> ";
        prefsPanelColorsLabel.innerHTML = "<b>Color Scheme:</b> ";
        prefsPanelFontSizeLabel.innerHTML = "<b>Font Size:</b> ";
        prefsPanelDisableTermTransitionsLabel.innerHTML = "<b>Disable Terminal Slide Effect:</b> ";
        prefsPanelFontSize.value = go.prefs.fontSize;
        prefsPanelStyleRow1.appendChild(prefsPanelThemeLabel);
        prefsPanelStyleRow1.appendChild(prefsPanelTheme);
        prefsPanelStyleRow2.appendChild(prefsPanelColorsLabel);
        prefsPanelStyleRow2.appendChild(prefsPanelColors);
        prefsPanelStyleRow3.appendChild(prefsPanelFontSizeLabel);
        prefsPanelStyleRow3.appendChild(prefsPanelFontSize);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableTermTransitionsLabel);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableTermTransitions);
        tableDiv.appendChild(prefsPanelStyleRow1);
        tableDiv.appendChild(prefsPanelStyleRow2);
        tableDiv.appendChild(prefsPanelStyleRow3);
        tableDiv.appendChild(prefsPanelStyleRow4);
        prefsPanelScrollbackLabel.innerHTML = "<b>Scrollback Buffer Lines:</b> ";
        prefsPanelScrollback.value = go.prefs.scrollback;
        prefsPanelLogLinesLabel.innerHTML = "<b>Terminal Log Lines:</b> ";
        prefsPanelLogLines.value = go.prefs.logLines;
        prefsPanelPlaybackLabel.innerHTML = "<b>Playback Frames:</b> ";
        prefsPanelPlayback.value = go.prefs.playbackFrames;
        prefsPanelRowsLabel.innerHTML = "<b>Terminal Rows:</b> ";
        prefsPanelRows.value = go.prefs.rows;
        prefsPanelColsLabel.innerHTML = "<b>Terminal Columns:</b> ";
        prefsPanelCols.value = go.prefs.cols;
        prefsPanelRow1.appendChild(prefsPanelScrollbackLabel);
        prefsPanelRow1.appendChild(prefsPanelScrollback);
        prefsPanelRow2.appendChild(prefsPanelLogLinesLabel);
        prefsPanelRow2.appendChild(prefsPanelLogLines);
        prefsPanelRow3.appendChild(prefsPanelPlaybackLabel);
        prefsPanelRow3.appendChild(prefsPanelPlayback);
        prefsPanelRow4.appendChild(prefsPanelRowsLabel);
        prefsPanelRow4.appendChild(prefsPanelRows);
        prefsPanelRow5.appendChild(prefsPanelColsLabel);
        prefsPanelRow5.appendChild(prefsPanelCols);
        tableDiv2.appendChild(prefsPanelRow1);
        tableDiv2.appendChild(prefsPanelRow2);
        tableDiv2.appendChild(prefsPanelRow3);
        tableDiv2.appendChild(prefsPanelRow4);
        tableDiv2.appendChild(prefsPanelRow5);
        prefsPanelForm.appendChild(tableDiv);
        prefsPanelForm.appendChild(tableDiv2);
        prefsPanelSave.innerHTML = "Save";
        prefsPanelForm.appendChild(prefsPanelSave);
        prefsPanel.appendChild(prefsPanelForm);
        prefsPanel.appendChild(hr);
        go.Visual.applyTransform(prefsPanel, 'scale(0)');
        if (!go.prefs.embedded) {
            goDiv.appendChild(prefsPanel); // Doesn't really matter where it goes
        }
        prefsPanelForm.onsubmit = function(e) {
            e.preventDefault(); // Don't actually submit
            var theme = u.getNode('#'+prefix+'prefs_theme').value,
                colors = u.getNode('#'+prefix+'prefs_colors').value,
                fontSize = u.getNode('#'+prefix+'prefs_fontsize').value,
                scrollbackValue = u.getNode('#'+prefix+'prefs_scrollback').value,
                logLinesValue = u.getNode('#'+prefix+'prefs_loglines').value,
                playbackValue = u.getNode('#'+prefix+'prefs_playback').value,
                rowsValue = u.getNode('#'+prefix+'prefs_rows').value,
                colsValue = u.getNode('#'+prefix+'prefs_cols').value,
                disableTermTransitions = u.getNode('#'+prefix+'prefs_disabletermtrans').checked;
            // Grab the form values and set them in prefs
            if (theme != go.prefs.theme || colors != go.prefs.colors) {
                // Start using the new CSS theme and colors
                u.loadCSS({'theme': theme, 'colors': colors});
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
            if (logLinesValue) {
                go.prefs.logLines = parseInt(logLinesValue);
            }
            if (playbackValue) {
                go.prefs.playbackFrames = parseInt(playbackValue);
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
                var newStyle = u.createElement('style', {'id': prefix+'disable_term_transitions'});
                newStyle.innerHTML = "." + prefix + "terminal {-webkit-transition: none; -moz-transition: none; -ms-transition: none; -o-transition: none; transition: none;}";
                u.getNode(goDiv).appendChild(newStyle);
            } else {
                u.removeElement('#'+prefix+'disable_term_transitions');
            }
            u.savePrefs();
            // In case the user changed the rows/cols or the font/size changed:
            setTimeout(function() { // Wrapped in a timeout since it takes a moment for everything to change in the browser
                go.Visual.updateDimensions();
                go.Net.sendDimensions();
            }, 3000);
        }
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
            var newStyle = u.createElement('style', {'id': prefix+'disable_term_transitions'});
            newStyle.innerHTML = "." + prefix + "terminal {-webkit-transition: none; -moz-transition: none; -ms-transition: none; -o-transition: none; transition: none;}";
            u.getNode(goDiv).appendChild(newStyle);
        }
        // Create the (empty) toolbar
        toolbar.appendChild(toolbarIconPrefs); // The only default toolbar icon is the preferences
        goDiv.appendChild(toolbar);
        var showPrefs = function() {
            go.Visual.togglePanel('#'+go.prefs.prefix+'panel_prefs');
        }
        toolbarIconPrefs.onclick = showPrefs;
        // Load our CSS theme
        u.loadCSS({'theme': go.prefs.theme, 'colors': go.prefs.colors});
        go.Visual.updateDimensions();
        var grid = go.Visual.createGrid(go.prefs.prefix+'termwrapper');
        goDiv.appendChild(grid);
        var style = window.getComputedStyle(goDiv, null),
            adjust = 0;
        if (style['padding-right']) {
            adjust = parseInt(style['padding-right'].split('px')[0]);
        }
        var gridWidth = (go.Visual.goDimensions.w+adjust) * 2; // Will likely always be x2
        grid.style.width = gridWidth + 'px';
        // Put our invisible pop-up message container on the page
        document.body.appendChild(noticeContainer); // Notifications can be outside the GateOne area
        // Add the sidebar text
        goDiv.appendChild(sideinfo);
        // Add the the playback controls if the module is loaded
        // TODO: Move this to the playback plugin
        if (pb) {
            pb.addPlaybackControls();
        }
        // Set the tabIndex on our GateOne Div so we can give it focus()
        go.Utils.getNode(go.prefs.goDiv).tabIndex = 1;
        // Firefox doesn't support 'mousewheel'
        var mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel";
        var wheelFunc = function(e) {
            var m = go.Input.mouse(e),
                p = go.Playback,
                cu = p.clockUpdater,
                percent = 0,
                modifiers = go.Input.modifiers(e),
                term = localStorage['selectedTerminal'],
                terminalObj = go.terminals[term],
                selectedFrame = terminalObj['playbackFrames'][p.currentFrame],
                sbT = terminalObj['scrollbackTimer'];
            if (modifiers.shift && go.Playback) { // If shift is held, go back/forth in the recording instead of scrolling up/down
                e.preventDefault();
                clearInterval(cu);
                cu = null;
                if (m.wheel.x > 0) { // Shift + scroll shows up as left/right scroll (x instead of y)
                    if (sbT) {
                        clearTimeout(sbT);
                    }
                    if (p.currentFrame == null) {
                        p.currentFrame = terminalObj['playbackFrames'].length - 1;
                        u.getNode('#'+go.prefs.prefix+'progressBar').style.width = '100%';
                    } else {
                        p.currentFrame = p.currentFrame + 1;
                        percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                        u.getNode('#'+go.prefs.prefix+'progressBar').style.width = (percent) + '%';
                    }
                    if (selectedFrame) {
                        u.getNode('#'+go.prefs.prefix+'term' + term).innerHTML = selectedFrame['screen'];
                        u.getNode('#'+go.prefs.prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                    } else {
                        p.currentFrame = terminalObj['playbackFrames'].length - 1; // Reset
                        u.getNode('#'+go.prefs.prefix+'progressBar').style.width = '100%';
                        if (!cu) { // Get the clock updating again
                            cu = setInterval('GateOne.Playback.updateClock()', 1);
                        }
                    }
                } else {
                    if (sbT) {
                        clearTimeout(sbT);
                    }
                    if (!p.currentFrame) {
                        if (p.currentFrame == null) {
                            p.currentFrame = terminalObj['playbackFrames'].length - 1;
                        }
                    } else {
                        p.currentFrame = p.currentFrame - 1;
                        percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                        u.getNode('#'+go.prefs.prefix+'progressBar').style.width = (percent) + '%';
                    }
                    if (selectedFrame) {
                        u.getNode('#'+go.prefs.prefix+'term' + term).innerHTML = selectedFrame['screen'];
                        u.getNode('#'+go.prefs.prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                    } else {
                        p.currentFrame = terminalObj['playbackFrames'][0]; // First frame
                        u.getNode('#'+go.prefs.prefix+'progressBar').style.width = '0%';
                    }
                }
            } else {
                var screen = terminalObj['screen'],
                    scrollback = terminalObj['scrollback'];
                if (!terminalObj['scrollbackVisible']) {
                    // Immediately re-enable the scrollback buffer
                    go.Visual.enableScrollback(term);
                }
            }
        }
        goDiv.addEventListener(mousewheelevt, wheelFunc, true);
        var onResize = function() {
            // Update the Terminal if it is resized
            if (u.getNode(go.prefs.goDiv).style.display != "none") {
                go.Visual.updateDimensions();
                go.Net.sendDimensions();
            }
        }
        window.onresize = onResize;
        // Check for support for WebSockets. NOTE: (IE with the Websocket add-on calls it "WebSocketDraft")
        if(typeof(WebSocket) != "function") {
            // TODO:  Make this display a helpful message showing users how they can get a browser with WebSocket support.
            logError("No WebSocket support!");
            return;
        }
        if (!go.prefs.url) {
            go.prefs.url = window.location.href;
            go.prefs.url = go.prefs.url.split('#')[0]; // Get rid of any hash at the end
        }
        go.ws = go.Net.connect(go.prefs.url);
        // NOTE: Probably don't need a preInit() since modules can just put stuff inside their main .js for that.  If you can think of a use case let me know and I'll add it.
        // Go through all our loaded modules and run their init functions (if any)
        go.loadedModules.forEach(function(module) {
            var moduleObj = eval(module);
            logDebug('Module Load: ' + moduleObj.NAME + 'init()');
            if (typeof(moduleObj.init) == "function") {
                moduleObj.init();
            }
        })
        // Go through all our loaded modules and run their postInit functions (if any)
        go.loadedModules.forEach(function(module) {
            var moduleObj = eval(module);
            logDebug('Module Load: ' + moduleObj.NAME + 'postInit()');
            if (typeof(moduleObj.postInit) == "function") {
                moduleObj.postInit();
            }
        })
        // Setup a callback that updates the CSS options whenever the panel is opened (so the user doesn't have to refresh the page when the server has new CSS files).
        if (!go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs']) {
            go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs'] = {};
        }
        go.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_prefs']['updateCSS'] = updateCSSfunc;
        // Start capturing keyboard input
        go.Input.capture();
        goDiv.contentEditable = true;
    }
});

// Apply some universal defaults
if (!localStorage['selectedTerminal']) {
    localStorage['selectedTerminal'] = 1;
}

// GateOne.Utils (generic utility functions)
GateOne.Base.module(GateOne, "Utils", "0.9", ['Base']);
GateOne.Base.update(GateOne.Utils, {
    getNode: function(elem) {
        // Given an element name (string) or node (in case we're not sure), lookup the node using document.querySelector and return it.
        // NOTE: The benefit of this over just querySelector() is that if it is given a node it will just return the node as-is (so functions can accept both without having to worry about such things).  See removeElement() below for a good example.
        if (typeof(elem) == 'string') {
            return document.querySelector(elem);
        }
        return elem;
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
        node.parentNode.removeChild(node);
    },
    createElement: function(tagname, properties) {
        // Takes a string, *tagname* and creates a DOM element of that type and applies *properties* to it.
        // Example: createElement('div', {'id': 'foo', 'style': {'opacity': 0.5, 'color': 'black'}});
        var elem = document.createElement(tagname);
        for (var key in properties) {
            var value = properties[key];
            if (key == 'style') {
                // Have to iterate over the styles (it's special)
                for (var style in value) {
                    elem.style[style] = value[style];
                }
            } else if (GateOne.Utils.renames[key]) { // Why JS ended up with different names for things is beyond me
                elem.setAttribute(GateOne.Utils.renames[key] = value);
            } else {
                elem.setAttribute(key, value);
            }
        }
        return elem;
    },
    showElement: function(elem) {
        // Sets the 'display' style of the given element to 'block' (which undoes setting it to 'none')
        GateOne.Utils.getNode(elem).style.display = 'block';
    },
    hideElement: function(elem) {
        // Sets the 'display' style of the given element to 'none'
        GateOne.Utils.getNode(elem).style.display = 'none';
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
        node.scrollTop = node.scrollHeight;
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
        } else if (document.selection) {
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
            sizingDiv = document.createElement("div");
        sizingDiv.innerHTML = "M"; // Fill it with a single character
        // Set the attributes of our copy to reflect a minimal-size block element
        sizingDiv.style.display = 'block';
        sizingDiv.style.position = 'absolute';
        sizingDiv.style.top = '0';
        sizingDiv.style.left = '0';
        sizingDiv.style.width = 'auto';
        sizingDiv.style.height = 'auto';
        // Add in our sizingDiv and grab its height
        node.appendChild(sizingDiv);
        var nodeHeight = sizingDiv.getClientRects()[0].height,
            nodeWidth = sizingDiv.getClientRects()[0].width;
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
            style = window.getComputedStyle(node, null);
        var elementDimensions = {
            h: parseInt(style.height.split('px')[0]),
            w: parseInt(style.width.split('px')[0])
        },
            textDimensions = GateOne.Utils.getEmDimensions(elem);
        // Calculate the rows and columns:
        var rows = Math.floor(elementDimensions.h / textDimensions.h),
            cols = Math.floor(elementDimensions.w / textDimensions.w);
        var dimensionsObj = {'rows': rows, 'cols': cols};
        return dimensionsObj;
    },
    // Thanks to Paul Sowden (http://www.alistapart.com/authors/s/paulsowden) at A List Apart for this function.
    // See: http://www.alistapart.com/articles/alternate/
    setActiveStyleSheet: function(title) {
        var i, a, main;
        for(i=0; (a = document.getElementsByTagName("link")[i]); i++) {
            if(a.getAttribute("rel").indexOf("style") != -1 && a.getAttribute("title")) {
                a.disabled = true;
                if(a.getAttribute("title") == title) a.disabled = false;
            }
        }
    },
    loadCSS: function(schemeObj) {
        // Loads the GateOne CSS for the given *schemeObj* which should be in the form of:
        //     {'theme': 'black'} or {'colors': 'gnome-terminal'} or an object containing both.
        // If *schemeObj* is not provided, will load the defaults.
        if (!schemeObj) {
            schemeObj = {
                'theme': "black",
                'colors': "defaut"
            }
        }
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            container = GateOne.prefs.goDiv.split('#')[1],
            theme = schemeObj['theme'],
            colors = schemeObj['colors'];
        if (theme) {
            var themeNode = document.createElement('link'),
                existing = u.getNode('#'+prefix+'css_theme');
            if (existing) {
                u.removeElement(existing);
            }
            themeNode.type = 'text/css';
            themeNode.rel = 'stylesheet';
            themeNode.href = '/style?theme='+theme+'&container='+container+'&prefix='+prefix;
            themeNode.id = prefix+'css_theme';
            themeNode.media = 'screen';
            document.getElementsByTagName("head")[0].appendChild(themeNode);
        }
        if (colors) {
            var colorsNode = document.createElement('link'),
                existing = u.getNode('#'+prefix+'css_colors');
            if (existing) {
                u.removeElement(existing);
            }
            colorsNode.type = 'text/css';
            colorsNode.rel = 'stylesheet';
            colorsNode.href = '/style?colors='+colors+'&container='+container+'&prefix='+prefix;
            colorsNode.id = prefix+'css_colors';
            colorsNode.media = 'screen';
            document.getElementsByTagName("head")[0].appendChild(colorsNode);
        }
    },
    loadScript: function(url){
        // Imports the given JS URL
        var tag = document.createElement("script");
        tag.type="text/javascript";
        tag.src = url;
        document.body.appendChild(tag);
    },
    savePrefs: function() {
        // Saves all user-specific settings in GateOne.prefs.* to localStorage['prefs']
        // TODO: Add a hook here for plugins to take advantage of.
        var prefs = GateOne.prefs,
            userPrefs = { // These are all the things that are user-specific
                'theme': prefs['theme'],
                'colors': prefs['colors'],
                'fontSize': prefs['fontSize'],
                'logLevel': prefs['logLevel'],
                'logLines': prefs['logLines'],
                'scrollback': prefs['scrollback'],
                'playbackFrames': prefs['playbackFrames'],
                'rows': prefs['rows'],
                'cols': prefs['cols'],
                'disableTermTransitions': prefs['disableTermTransitions']
            };
        localStorage['prefs'] = JSON.stringify(userPrefs);
        GateOne.Visual.displayMessage("Preferences have been saved.");
    },
    loadPrefs: function() {
        // Populates GateOne.prefs.* with values from localStorage['prefs']
        // TODO: Add a hook here for plugins to use too.
        if (localStorage['prefs']) {
            var userPrefs = JSON.parse(localStorage['prefs']);
            for (i in userPrefs) {
                GateOne.prefs[i] = userPrefs[i];
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
        for (var i=2;i<=m;i++) if (n%i==0) return false;
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
    }
});

GateOne.Base.module(GateOne, 'Net', '0.9', ['Base', 'Utils']);
GateOne.Base.update(GateOne.Net, {
    sendChars: function() {
        // pop()s out the current charBuffer and sends it to the server.
        // NOTE: This function is normally called every time a key is pressed.
        var go = GateOne;
        if (!go.doingUpdate) { // Only perform a character push if we're *positive* the last character POST has completed.
            go.doingUpdate = true;
            var cb = go.Input.charBuffer,
                charString = "";
            for (var i=0; i<=cb.length; i++) { charString += cb.pop() }
            if (charString != "undefined") {
                var message = {'c': charString};
                go.ws.send(JSON.stringify(message));
                go.doingUpdate = false;
            } else {
                go.doingUpdate = false;
            }
        } else {
            // We are in the middle of processing the last character
            setTimeout(go.Net.sendChars, 100); // Wait 0.1 seconds and retry.
        }
    },
    testing: function() {
        // Sends a 'ping' to the server over the WebSocket.  The response from the server is handled by 'pong' below.
        var now = new Date(),
            timestamp = now.toISOString();
        GateOne.ws.send(JSON.stringify({'testing': timestamp}));
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
        GateOne.Utils.deleteCookie('user', '/', '');
        window.location.reload(); // This *should* force a re-auth if we simply had our session expire (or similar)
    },
    sendDimensions: function(term) {
        if (!term) {
            var term = localStorage['selectedTerminal'];
        }
        var go = GateOne,
            dimensions = go.Utils.getRowsAndColumns(go.prefs.goDiv),
            prefs = {
                'term': term,
                'rows': dimensions.rows - 1,
                'cols': dimensions.cols - 6 // -6 for the sidebar + scrollbar
            }
        // Apply user-defined rows and cols (if set)
        if (go.prefs.cols) { prefs.cols = go.prefs.cols };
        if (go.prefs.rows) { prefs.rows = go.prefs.rows };
        // Tell the server the new dimensions
        go.ws.send(JSON.stringify({'resize': prefs}));
    },
    connectionError: function() {
        var go = GateOne,
            u = go.Utils,
            terms = document.getElementsByClassName(go.prefs.prefix+'terminal');
        logError("Error communicating with server... ");
        u.toArray(terms).forEach(function(termObj) {
            go.Terminal.closeTerminal(termObj.id.split('term')[1]);
        });
        u.getNode('#'+go.prefs.prefix+'termwrapper').innerHTML = "A communications disruption can mean only one thing...";
        setTimeout(go.Net.connect, 5000);
    },
    connect: function() {
        // Connects to the WebSocket defined in GateOne.prefs.url
        // TODO: Get this appending a / if it isn't provided.  Also get it working with ws:// and wss:// URLs in go.prefs.url
        var go = GateOne,
            u = go.Utils,
            host = "";
        if (u.startsWith("https:", go.prefs.url)) {
            host = go.prefs.url.split('https://')[1]; // e.g. 'localhost:8888/'
            if (u.endsWith(host, '/')) {
                host = host.slice(0, -1); // Remove the trailing /
            }
            go.wsURL = "wss://" + host + "ws";
        } else { // Hopefully no one will be using Gate One without SSL but you never know...
            host = go.prefs.url.split('http://')[1]; // e.g. 'localhost:8888/'
            if (u.endsWith(host, '/')) {
                host = host.slice(0, -1); // Remove the trailing /
            }
            go.wsURL = "ws://" + host + "ws";
        }
        logDebug("GateOne.Net.connect(" + go.wsURL + ")");
        go.ws = new WebSocket(go.wsURL); // For reference, I already tried Socket.IO and custom implementations of long-held HTTP streams...  Only WebSockets provide low enough latency for real-time terminal interaction.  All others were absolutely unacceptable in real-world testing (especially Flash-based...  Wow, really surprised me how bad it was).
        go.ws.onopen = function() {
            // Clear the error message if it's still there
            u.getNode('#'+go.prefs.prefix+'termwrapper').innerHTML = "";
            // Check if there are any existing terminals for the current session ID
            setTimeout(function () {
                var session = localStorage.getItem(go.prefs.prefix+"session"),
                    prefs = {'session': session};
                go.ws.send(JSON.stringify({'authenticate': prefs}));
                // Autoconnect if autoConnectURL is specified
                if (go.prefs.autoConnectURL) {
                    setTimeout(function () {
                        go.Input.queue(go.prefs.autoConnectURL+'\n');
                        GateOne.Net.sendChars();
                    }, 500);
                }
                setTimeout(function() {
                    go.Net.ping(); // Check latency (after things have calmed down a bit =)
                }, 1000);
            }, 1000);
        }
        go.ws.onclose = function() {
            // Connection to the server was lost
            logDebug("WebSocket Closed");
            go.Net.connectionError();
        }
        go.ws.onerror = function(evt) {
            // Something went wrong with the WebSocket (who knows?)
            logError("ERROR on WebSocket: " + evt.data);
        }
        go.ws.onmessage = function (evt) {
            logDebug('message: ' + evt.data);
            messageObj = JSON.parse(evt.data);
            // Execute each respective action
            go.Utils.items(messageObj).forEach(function(item) {
                var key = item[0],
                    val = item[1],
                    getter = go.Utils.itemgetter(key),
                    actionToTake = getter(go.Net.actions);
                if (actionToTake) {
                    actionToTake(val);
                }
            });
        };
        return go.ws;
    },
    addAction: function(name, func) {
        // Adds/overwrites actions in GateOne.Net.actions
        GateOne.Net.actions[name] = func;
    },
    setTerminal: function(term) {
        var term = parseInt(term); // Sometimes it will be a string
        localStorage['selectedTerminal'] = term;
        GateOne.ws.send(JSON.stringify({'set_terminal': term}));
    },
    killTerminal: function(term) {
        // Called when the user closes a terminal
        GateOne.ws.send(JSON.stringify({'kill_terminal': term}));
    },
    refresh: function(term) {
        GateOne.ws.send(JSON.stringify({'refresh': term}));
    }
});
GateOne.Base.module(GateOne, "Input", '0.9', ['Base', 'Utils']);
GateOne.Input.charBuffer = []; // Queue for sending characters to the server
GateOne.Input.metaHeld = false; // Used to emulate the "meta" modifier since some browsers/platforms don't get it right.
// F11 toggles fullscreen mode in most browsers.  If F11 is pressed once it will act as a regular F11 keystroke in the terminal.  If it is pressed twice rapidly in succession (within 0.750 seconds) it will execute the regular browser keystroke (enabling or disabling fullscreen mode).
// Why did I code it this way?  If the user is unaware of this feature when they enter fullscreen mode, they might panic and hit F11 a bunch of times and it's likely they'll break out of fullscreen mode as an instinct :).  The message indicating the behavior will probably help too :D
GateOne.Input.F11 = false;
GateOne.Input.F11timer = null;
GateOne.Input.handledKeystroke = false;
GateOne.Input.shortcuts = {}; // Shortcuts added via registerShortcut() wind up here.  They will end up looking like this:
// 'KEY_N': [{'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Terminal.newTerminal()'}]
GateOne.Base.update(GateOne.Input, {
    // This object holds all of the special key handlers and controls the "escape"/"escape escape" sequences
    capture: function() {
        // Returns focus to goDiv and ensures that it is capturing onkeydown events properly
        var go = GateOne,
            u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv);
        goDiv.tabIndex = 1; // Just in case--this is necessary to set focus
        goDiv.onkeydown = go.Input.onKeyDown;
        goDiv.onkeyup = go.Input.onKeyUp; // Only used to emulate the meta key modifier (if necessary)
        goDiv.onkeypress = go.Input.emulateKeyFallback;
        goDiv.focus();
        goDiv.onpaste = function(e) {
            // TODO: Add a pop-up message that tells Firefox users how to grant Gate One access to the clipboard
            // Grab the text being pasted
            var contents = e.clipboardData.getData('Text');
            // Don't actually paste the text where the user clicked
            e.preventDefault();
            // Queue it up and send the characters as if we typed them in
            GateOne.Input.queue(contents);
            GateOne.Net.sendChars();
        }
        goDiv.onmousedown = function(e) {
            // TODO: Add a shift-click context menu for special operations.  Why shift and not ctrl-click or alt-click?  Some platforms use ctrl-click to emulate right-click and some platforms use alt-click to move windows around.
            var m = go.Input.mouse(e),
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
                }
            } else {
                var panels = document.getElementsByClassName(go.prefs.prefix+'panel'),
                    visiblePanel = false;
                for (var i in u.toArray(panels)) {
                    if (panels[i].style['transform'] != 'scale(0)') {
                        visiblePanel = true;
                    }
                }
                if (!visiblePanel) {
                    goDiv.contentEditable = true;
                }
            }
        }
        goDiv.onmouseup = function(e) {
            // Once the user is done pasting (or clicking), set it back to false for speed
            goDiv.contentEditable = false; // Having this as false makes screen updates faster
        }
    },
    disableCapture: function() {
        // Turns off keyboard input and certain mouse capture events so that other things (e.g. forms) can work properly
        var go = GateOne,
            u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv);
//         goDiv.contentEditable = false; // This needs to be turned off or it might capture paste events (which is really annoying when you're trying to edit a form)
        goDiv.onpaste = null;
        goDiv.tabIndex = null;
        goDiv.onkeydown = null;
        goDiv.onkeyup = null;
        goDiv.onkeypress = null;
        goDiv.onmousedown = null;
        goDiv.onmouseup = null;
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
        if (e.type == 'mousewheel') {
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
        var go = GateOne,
            goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e);
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = false;
        }
    },
    onKeyDown: function(e) {
        // Handles keystroke events by determining which kind of event occurred and how/whether it should be sent to the server as specific characters or escape sequences.
        var go = GateOne,
            goIn = go.Input,
            container = go.Utils.getNode(go.prefs.goDiv),
            key = goIn.key(e),
            modifiers = goIn.modifiers(e);
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = true; // Lets us emulate the "meta" modifier on browsers/platforms that don't get it right.
            return true; // Save some CPU
        }
        if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA") {
            return; // Let the browser handle it if the user is editing something
            // NOTE: Doesn't actually work so well so we have GateOne.Input.disableCapture() as a fallback :)
        }
        if (container) { // This display check prevents an exception when someone presses a key before the document has been fully loaded
            if (container.style.display != "none") {
                // This loops over everything in *shortcuts* and executes actions for any matching keyboard shortcuts that have been defined.
                for (k in goIn.shortcuts) {
                    if (key.string == k) {
                        var matched = false;
                        goIn.shortcuts[k].forEach(function(shortcut) {
                            var match = true; // Have to use some reverse logic here...  Slightly confusing but if you can think of a better way by all means send in a patch!
                            for (mod in modifiers) {
                                if (modifiers[mod] != shortcut.modifiers[mod]) {
                                    match = false;
                                }
                            }
                            if (match) {
                                e.preventDefault();
                                eval(shortcut['action']);
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
        'KEY_BACKSPACE': {'default': String.fromCharCode(127)}, // ^?. Will be changable to ^H eventually.
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
        'KEY_NUM_PAD_ASTERISK': {'alt': ESC+"*", 'appmode': ESC+"Oj"},
        'KEY_NUM_PAD_PLUS_SIGN': {'alt': ESC+"+", 'appmode': ESC+"Ok"},
// NOTE: The regular hyphen key shows up as a num pad hyphen in Firefox 7
        'KEY_NUM_PAD_HYPHEN-MINUS': {'alt': ESC+"-", 'appmode': ESC+"Om"},
        'KEY_NUM_PAD_FULL_STOP': {'alt': ESC+"."},
        'KEY_NUM_PAD_SOLIDUS': {'alt': ESC+"/", 'appmode': ESC+"Oo"},
        'KEY_NUM_LOCK': null, // TODO: Double-check that NumLock isn't supposed to send some sort of wacky ESC sequence
        'KEY_SCROLL_LOCK': {'default': ESC+"[26~", 'xterm': ESC+"O2Q"}, // Same as F14
        'KEY_SEMICOLON': {'alt': ESC+";", 'alt-shift': ESC+":"},
        'KEY_EQUALS_SIGN': {'alt': ESC+"=", 'alt-shift': ESC+"+"},
        'KEY_COMMA': {'alt': ESC+",", 'alt-shift': ESC+"<"},
        'KEY_HYPHEN-MINUS': {'alt': ESC+"-", 'alt-shift': ESC+"_"},
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
        if (GateOne.Input.shortcuts[keyString]) {
            // Already exists, overwrite existing if conflict (and log it) or append it
            var overwrote = false;
            GateOne.Input.shortcuts[keyString].forEach(function(shortcut) {
                var match = true;
                for (mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != shortcut.modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match...  Log and overwrite it
                    logWarning("Overwriting existing shortcut for: " + shortcut);
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
    emulateKey: function(e, skipF11check) {
        // This method handles all regular keys registered via onkeydown events (not onkeypress)
        // If *skipF11check* is not undefined (or null), the F11 (fullscreen check) logic will be skipped.
        // NOTE: Shift+key also winds up being handled by this function.
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            goIn = go.Input,
            noop = u.noop,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e),
            buffer = goIn.bufferEscSeq,
            q = function(char) {e.preventDefault(); goIn.queue(char); goIn.handledKeystroke = true;},
            term = localStorage['selectedTerminal'],
            keyString = String.fromCharCode(key.code);
        logDebug("emulateKey() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + u.items(modifiers) + ", event items: " + u.items(e));
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
    },
    emulateKeyCombo: function(e) {
        // This method translates ctrl/alt/meta key combos such as ctrl-c into their string equivalents.
        // NOTE: This differs from registerShortcut in that it handles sending keystrokes to the server.  registerShortcut is meant for client-side actions that call JavaScript (though, you certainly *could* send keystrokes via registerShortcut via JavaScript =)
        var go = GateOne,
            goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e),
            buffer = goIn.bufferEscSeq,
            q = function(char) {e.preventDefault(); goIn.queue(char); goIn.handledKeystroke = true;};
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
                else if (key.code >= 65 && key.code <= 90) q(String.fromCharCode(key.code - 64)); // More Ctrl-[a-z]
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
    },
    emulateKeyFallback: function(e) {
        // Meant to be attached to (GateOne.prefs.goDiv).onkeypress, will queue the (character) result of a keypress event if an unknown modifier key is held.
        // Without this, 3rd and 5th level keystroke events (i.e. the stuff you get when you hold down various combinations of AltGr+<key>) would not work.
        logDebug("emulateKeyFallback() charCode: " + e.charCode + ", keyCode: " + e.keyCode);
        var go = GateOne,
            goIn = go.Input,
            q = function(char) {e.preventDefault(); goIn.queue(char); goIn.handledKeystroke = false;};
        if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA") {
            return; // Let the browser handle it if the user is editing something
            // NOTE: Doesn't actually work so well so we have GateOne.Input.disableCapture() as a fallback :)
        }
        if (!goIn.handledKeystroke) {
            if (e.charCode != 0) {
                q(String.fromCharCode(e.charCode));
                go.Net.sendChars();
            }
        }
    },
    openPasteArea: function() {
        // Opens up a textarea where users can paste text into the terminal
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            pasteArea = u.createElement('textarea', {'id': prefix+'pastearea', 'rows': '24', 'cols': '80'});
        goDiv.appendChild(pasteArea);
    }
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
    for (i = 65; i <= 90; i++) {
        specialKeys[i] = 'KEY_' + String.fromCharCode(i);
    }

    /* for KEY_NUM_PAD_0 - KEY_NUM_PAD_9 */
    for (i = 96; i <= 105; i++) {
        specialKeys[i] = 'KEY_NUM_PAD_' + (i - 96);
    }

    /* for KEY_F1 - KEY_F12 */
    for (i = 112; i <= 123; i++) {
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

GateOne.Base.module(GateOne, 'Visual', '0.9', ['Base', 'Net', 'Utils']);
GateOne.Visual.scrollbackToggle = false;
GateOne.Visual.gridView = false;
GateOne.Visual.goDimensions = {};
GateOne.Visual.panelToggleCallbacks = {'in': {}, 'out': {}};
GateOne.Base.update(GateOne.Visual, {
    // Functions for manipulating views and displaying things
    init: function() {
        var go = GateOne,
            u = go.Utils,
            toolbarGrid = u.createElement('div', {'id': go.prefs.prefix+'icon_grid', 'class': go.prefs.prefix+'toolbar', 'title': "Grid View"}),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar');
        // Add our grid icon to the icons list
        GateOne.Icons['grid'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient3002" y2="255.75" gradientUnits="userSpaceOnUse" x2="311.03" gradientTransform="matrix(0.70710678,0.70710678,-0.70710678,0.70710678,261.98407,-149.06549)" y1="227.75" x1="311.03"><stop class="stop1" offset="0"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.66103562,-0.67114094,0.66103562,0.67114094,-611.1013,-118.18392)"><g fill="url(#linearGradient3002)" transform="translate(63.353214,322.07725)"><polygon points="311.03,255.22,304.94,249.13,311.03,243.03,317.13,249.13"/><polygon points="318.35,247.91,312.25,241.82,318.35,235.72,324.44,241.82"/><polygon points="303.52,247.71,297.42,241.61,303.52,235.52,309.61,241.61"/><polygon points="310.83,240.39,304.74,234.3,310.83,228.2,316.92,234.3"/></g></g></svg>';
        // Setup our toolbar icons and actions
        toolbarGrid.innerHTML = GateOne.Icons['grid'];
        var gridToggle = function() {
            go.Visual.toggleGridView(true);
        }
        toolbarGrid.onclick = gridToggle;
        // Stick it on the end (can go wherever--unlike GateOne.Terminal's icons)
        toolbar.appendChild(toolbarGrid);
        // Register our keyboard shortcuts (Shift-<arrow keys> to switch terminals, ctrl-alt-G to toggle grid view)
        go.Input.registerShortcut('KEY_ARROW_LEFT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideLeft()'});
        go.Input.registerShortcut('KEY_ARROW_RIGHT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideRight()'});
        go.Input.registerShortcut('KEY_ARROW_UP', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideUp()'});
        go.Input.registerShortcut('KEY_ARROW_DOWN', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideDown()'});
        go.Input.registerShortcut('KEY_G', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Visual.toggleGridView()'});
        go.Net.addAction('bell', go.Visual.bellAction);
        go.Net.addAction('set_title', go.Visual.setTitleAction);
    },
    updateDimensions: function() { // Sets GateOne.Visual.goDimensions to the current width/height of prefs.goDiv
        var go = GateOne,
            u = go.Utils,
            terms = document.getElementsByClassName(go.prefs.prefix+'terminal'),
            goDiv = u.getNode(go.prefs.goDiv),
            wrapperDiv = u.getNode('#'+go.prefs.prefix+'termwrapper'),
            style = window.getComputedStyle(goDiv, null),
            rightAdjust = 0;
        if (style['padding-right']) {
            var rightAdjust = parseInt(style['padding-right'].split('px')[0]);
        }
        go.Visual.goDimensions.w = parseInt(style.width.split('px')[0]);
        go.Visual.goDimensions.h = parseInt(style.height.split('px')[0]);
        if (wrapperDiv) {
            // Update the width of termwrapper in case #gateone has padding
            wrapperDiv.style.width = ((go.Visual.goDimensions.w+rightAdjust)*2) + 'px';
        }
        if (terms.length) {
            u.toArray(terms).forEach(function(termObj) {
                termObj.style.height = go.Visual.goDimensions.h + 'px';
                termObj.style.width = go.Visual.goDimensions.w + 'px';
                termObj.style['margin-right'] = style['padding-right'];
                termObj.style['margin-bottom'] = style['padding-bottom'];
            });
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
        var v = GateOne.Visual,
            u = GateOne.Utils,
            panelID = panel,
            panel = u.getNode(panel),
            origState = panel.style['transform'],
            panels = document.getElementsByClassName(GateOne.prefs.prefix+'panel'),
            term = localStorage['selectedTerminal'],
            title = u.getNode('#'+GateOne.prefs.prefix+'term'+term).title;
        // Start by scaling all panels out
        for (var i in u.toArray(panels)) {
            if (u.getNode(panels[i]).style['transform'] != 'scale(0)') {
                v.applyTransform(panels[i], 'scale(0)');
                // Call any registered callbacks for all of these panels:
                if (v.panelToggleCallbacks['out']['#'+panels[i].id]) {
                    for (var ref in v.panelToggleCallbacks['out']['#'+panels[i].id]) {
                        if (typeof(v.panelToggleCallbacks['out']['#'+panels[i].id][ref]) == "function") {
                            v.panelToggleCallbacks['out']['#'+panels[i].id][ref]();
                        }
                    }
                }
            }
        }
        if (origState != 'scale(1)') {
            v.applyTransform(panel, 'scale(1)');
        } else {
            // Send it away
            v.applyTransform(panel, 'scale(0)');
        }
        // Call any registered callbacks for all of these panels:
        if (v.panelToggleCallbacks['in']['#'+panel.id]) {
            for (var ref in v.panelToggleCallbacks['in']['#'+panel.id]) {
                if (typeof(v.panelToggleCallbacks['in']['#'+panel.id][ref]) == "function") {
                    v.panelToggleCallbacks['in']['#'+panel.id][ref]();
                }
            }
        }
    },
    displayTermInfo: function(term) {
        // Displays the given term's information as a psuedo tooltip that eventually fades away
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            termObj = u.getNode('#'+go.prefs.prefix+'term' + term),
            displayText = termObj.id.split('term')[1] + ": " + termObj.title,
            termInfoDiv = u.createElement('div', {'id': go.prefs.prefix+'terminfo'}),
            marginFix = Math.round(termObj.title.length/2),
            infoContainer = u.createElement('div', {'id': go.prefs.prefix+'infocontainer', 'style': {'margin-right': '-' + marginFix + 'em'}});
        termInfoDiv.innerHTML = displayText;
        if (u.getNode('#'+go.prefs.prefix+'infocontainer')) { u.removeElement('#'+go.prefs.prefix+'infocontainer') }
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
        if (!id) {
            id = 'notice';
        }
        var go = GateOne,
            u = go.Utils,
            notice = u.createElement('div', {'id': go.prefs.prefix+id});
        if (!timeout) {
            timeout = 1000;
        }
        if (!removeTimeout) {
            removeTimeout = 5000;
        }
        notice.innerHTML = message;
        u.getNode('#'+go.prefs.prefix+'noticecontainer').appendChild(notice);
        setTimeout(function() {
            go.Visual.applyStyle(notice, {'opacity': 0});
            setTimeout(function() {
                u.removeElement(notice);
            }, timeout+removeTimeout);
        }, timeout);
    },
    setTitleAction: function(titleObj) {
        // Sets the title of titleObj['term'] to titleObj['title']
        var go = GateOne,
            u = go.Utils,
            term = titleObj['term'],
            title = titleObj['title'],
            sideinfo = u.getNode('#'+go.prefs.prefix+'sideinfo'),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar'),
            termNode = u.getNode('#'+go.prefs.prefix+'term' + term),
            goDiv = u.getNode(go.prefs.goDiv),
            heightDiff = goDiv.clientHeight - toolbar.clientHeight;
        logDebug("Setting term " + term + " to title: " + title);
        termNode.title = title;
        sideinfo.innerHTML = term + ": " + title;
        // Also update the info panel
        u.getNode('#'+go.prefs.prefix+'termtitle').innerHTML = term+': '+title;
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
        GateOne.Visual.playBell();
        GateOne.Visual.displayMessage("Bell in " + term + ": " + GateOne.Utils.getNode('#'+GateOne.prefs.prefix+'term' + term).title);
    },
    playBell: function() {
        // Plays the bell sound without any visual notification.
        var snd = GateOne.Utils.getNode('#bell');
        snd.play();
    },
    enableScrollback: function(/*Optional*/term) {
        // Replaces the contents of the selected terminal with the complete screen + scrollback buffer
        // If *term* is given, only disable scrollback for that terminal
        logDebug('enableScrollback(' + term + ')');
        var go = GateOne,
            u = go.Utils;
        if (term) {
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
            var replacement_html = '<pre id="'+go.prefs.prefix+'term' + term + '_pre" style="height: 100%">' + go.terminals[term]['scrollback'].join('\n') + '\n' + go.terminals[term]['screen'].join('\n') + '\n\n</pre>';
            u.getNode('#' + go.prefs.prefix + 'term' + term).innerHTML = replacement_html;
            if (go.terminals[term]['scrollbackTimer']) {
                clearTimeout(go.terminals[term]['scrollbackTimer']);
            }
            go.terminals[term]['scrollbackVisible'] = true;
            var termPre = u.getNode('#'+go.prefs.prefix+'term' + term + '_pre');
            u.scrollToBottom(termPre);
        } else {
            var terms = u.toArray(document.getElementsByClassName(go.prefs.prefix+'terminal'));
            terms.forEach(function(termObj) {
                var termID = termObj.id.split(go.prefs.prefix+'term')[1],
                    replacement_html = '<pre id="' + termObj.id + '_pre" style="height: 100%">' + go.terminals[termID]['scrollback'].join('\n') + '\n' + go.terminals[termID]['screen'].join('\n') + '\n\n</pre>';
                    u.getNode('#' + go.prefs.prefix + 'term' + term).innerHTML = replacement_html;
                if (go.terminals[termID]['scrollbackTimer']) {
                    clearTimeout(go.terminals[termID]['scrollbackTimer']);
                }
                go.terminals[termID]['scrollbackVisible'] = true;
                var termPre = u.getNode('#'+go.prefs.prefix+'term' + termID + '_pre');
                u.scrollToBottom(termPre);
            });
        }
        go.Visual.scrollbackToggle = true;
    },
    disableScrollback: function(/*Optional*/term) {
        // Replaces the contents of the selected terminal with just the screen (i.e. no scrollback)
        // If *term* is given, only disable scrollback for that terminal
        var go = GateOne,
            u = go.Utils,
            terms = u.toArray(document.getElementsByClassName(go.prefs.prefix+'terminal')),
            textTransforms = go.Terminal.textTransforms;
        if (term) {
            var replacement_html = '<pre id="'+go.prefs.prefix+'term' + term + '_pre">' + go.terminals[term]['screen'].join('\n') + '\n\n</pre>';
            u.getNode('#' + go.prefs.prefix + 'term' + term).innerHTML = replacement_html;
        } else {
            terms.forEach(function(termObj) {
                var termID = termObj.id.split(go.prefs.prefix+'term')[1],
                    replacement_html = '<pre id="' + termObj.id + '_pre">' + go.terminals[termID]['screen'].join('\n') + '\n\n</pre>';
                u.getNode('#' + go.prefs.prefix + 'term' + term).innerHTML = replacement_html;
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
    slideToTerm: function(term, changeSelected) {
        // Slides the view to the given *term*.
        // If *changeSelected* is true, this will also set the current terminal to the one we're sliding to.
        // ...why would we ever want to keep input going to a different terminal than the one we're sliding to?  So we can do some cool stuff in the future ("Spoilers" =)
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            termObj = u.getNode('#'+go.prefs.prefix+'term' + term),
            displayText = "",
            count = 0,
            wPX = 0,
            hPX = 0,
            terms = u.toArray(document.getElementsByClassName(go.prefs.prefix+'terminal')),
            style = window.getComputedStyle(u.getNode(go.prefs.goDiv), null),
            rightAdjust = 0,
            bottomAdjust = 0,
            reScrollback = u.partial(v.enableScrollback, term);
        if (termObj) {
            displayText = termObj.id.split(go.prefs.prefix+'term')[1] + ": " + termObj.title;
        } else {
            return; // This can happen if the terminal closed before a timeout completed.  Not a big deal, ignore
        }
        if (style['padding-right']) {
            rightAdjust = parseInt(style['padding-right'].split('px')[0]);
        }
        if (style['padding-bottom']) {
            bottomAdjust = parseInt(style['padding-bottom'].split('px')[0]);
        }
        if (changeSelected) {
            go.Net.setTerminal(term);
        }
        v.updateDimensions();
        u.getNode('#'+go.prefs.prefix+'sideinfo').innerHTML = displayText;
        // Have to scroll all the way to the top in order for the translate effect to work properly:
        u.getNode(go.prefs.goDiv).scrollTop = 0;
        terms.forEach(function(termObj) {
            // Loop through once to get the correct wPX and hPX values
            count = count + 1;
            if (termObj.id == go.prefs.prefix+'term' + term) {
                if (u.isEven(count)) {
                    wPX = ((v.goDimensions.w+rightAdjust) * 2) - (v.goDimensions.w+rightAdjust);
                    hPX = (((v.goDimensions.h+bottomAdjust) * count)/2) - (v.goDimensions.h+bottomAdjust);
                } else {
                    wPX = 0;
                    hPX = (((v.goDimensions.h+bottomAdjust) * (count+1))/2) - (v.goDimensions.h+bottomAdjust);
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
        var count = 0,
            term = 0,
            terms = GateOne.Utils.toArray(document.getElementsByClassName(GateOne.prefs.prefix+'terminal'));
        terms.forEach(function(termObj) {
            if (termObj.id == GateOne.prefs.prefix+'term' + localStorage['selectedTerminal']) {
                term = count;
            }
            count = count + 1;
        });
        if (GateOne.Utils.isEven(term+1)) {
            var slideTo = terms[term-1].id.split(GateOne.prefs.prefix+'term')[1];
            GateOne.Visual.slideToTerm(slideTo, true);
        }
    },
    slideRight: function() {
        // Slides to the terminal right of the current view
        var terms = GateOne.Utils.toArray(document.getElementsByClassName(GateOne.prefs.prefix+'terminal')),
            count = 0,
            term = 0;
        if (terms.length > 1) {
            terms.forEach(function(termObj) {
                if (termObj.id == GateOne.prefs.prefix+'term' + localStorage['selectedTerminal']) {
                    term = count;
                }
                count = count + 1;
            });
            if (!GateOne.Utils.isEven(term+1)) {
                var slideTo = terms[term+1].id.split(GateOne.prefs.prefix+'term')[1];
                GateOne.Visual.slideToTerm(slideTo, true);
            }
        }
    },
    slideDown: function() {
        // Slides the view downward one terminal by pushing all the others up.
        var terms = GateOne.Utils.toArray(document.getElementsByClassName(GateOne.prefs.prefix+'terminal')),
            count = 0,
            term = 0;
        if (terms.length > 2) {
            terms.forEach(function(termObj) {
                if (termObj.id == GateOne.prefs.prefix+'term' + localStorage['selectedTerminal']) {
                    term = count;
                }
                count = count + 1;
            });
            if (terms[term+2]) {
                var slideTo = terms[term+2].id.split(GateOne.prefs.prefix+'term')[1];
                GateOne.Visual.slideToTerm(slideTo, true);
            }
        }
    },
    slideUp: function() {
        // Slides the view downward one terminal by pushing all the others down.
        var terms = GateOne.Utils.toArray(document.getElementsByClassName(GateOne.prefs.prefix+'terminal')),
            count = 0,
            term = 0;
        if (localStorage['selectedTerminal'] > 1) {
            terms.forEach(function(termObj) {
                if (termObj.id == GateOne.prefs.prefix+'term' + localStorage['selectedTerminal']) {
                    term = count;
                }
                count = count + 1;
            });
            if (terms[term-2]) {
                var slideTo = terms[term-2].id.split(GateOne.prefs.prefix+'term')[1];
                GateOne.Visual.slideToTerm(Math.max(slideTo, 1), true);
            }
        }
    },
    toggleGridView: function(/*optional*/goBack) {
        // Brings up the terminal grid view or returns to full-size
        // If *goBack* is false, don't bother switching back to the previously-selected terminal
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            terms = u.toArray(document.getElementsByClassName(go.prefs.prefix+'terminal'));
        if (goBack == null) {
            goBack == true;
        }
        if (v.gridView) {
            v.gridView = false;
            // Remove the events we added for the grid:
            terms.forEach(function(termObj) {
                termObj.onclick = undefined;
                termObj.onmouseover = undefined;
            });
            u.getNode(go.prefs.goDiv).style.overflow = 'hidden';
            if (goBack) {
                v.slideToTerm(localStorage['selectedTerminal']); // Slide to the intended terminal
            }
        } else {
            v.gridView = true;
            setTimeout(function() {
                u.getNode(go.prefs.goDiv).style.overflowY = 'visible';
                u.getNode('#'+go.prefs.prefix+'termwrapper').style.width = go.Visual.goDimensions.w;
            }, 1000);
            v.disableScrollback();
            v.applyTransform(terms, 'translate(0px, 0px)');
            var odd = true,
                count = 1,
                oddAmount = 0,
                evenAmount = 0,
                transform = "";
            terms.forEach(function(termObj) {
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
                    var termID = termObj.id.split(GateOne.prefs.prefix+'term')[1],
                        termPre = u.getNode('#'+go.prefs.prefix+'term' + termID + '_pre');
                    localStorage['selectedTerminal'] = termID;
                    v.toggleGridView(false);
                    v.slideToTerm(termID, true);
                    u.scrollToBottom(termPre);
                }
                termObj.onmouseover = function(e) {
                    var displayText = termObj.id.split(go.prefs.prefix+'term')[1] + ": " + termObj.title,
                        termInfoDiv = u.createElement('div', {'id': go.prefs.prefix+'terminfo'}),
                        marginFix = Math.round(termObj.title.length/2),
                        infoContainer = u.createElement('div', {'id': go.prefs.prefix+'infocontainer', 'style': {'margin-right': '-' + marginFix + 'em'}});
                    if (u.getNode('#'+go.prefs.prefix+'infocontainer')) { u.removeElement('#'+go.prefs.prefix+'infocontainer') }
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
        var terminal = GateOne.Utils.createElement('div', {'id': squareName, 'class': GateOne.prefs.prefix+'terminal', 'style': {'width': GateOne.Visual.goDimensions.w + 'px', 'height': GateOne.Visual.goDimensions.h + 'px'}});
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
    }
});
GateOne.Base.module(GateOne, "Terminal", "0.9", ['Base', 'Utils', 'Visual']);
// All updateTermCallbacks are executed whenever a terminal is updated like so: callback(<term number>)
// Plugins can register updateTermCallbacks by simply doing a push():  GateOne.Terminal.updateTermCallbacks.push(myFunc);
GateOne.Terminal.updateTermCallbacks = [];
// All defined newTermCallbacks are executed whenever a new terminal is created like so: callback(<term number>)
GateOne.Terminal.newTermCallbacks = [];
// All defined closeTermCallbacks are executed whenever a terminal is closed just like newTermCallbacks:  callback(<term number>)
GateOne.Terminal.closeTermCallbacks = [];
GateOne.Terminal.textTransforms = {}; // Can be used to transform text (e.g. into clickable links).  Use registerTextTransform() to add new ones.
GateOne.Base.update(GateOne.Terminal, {
    init: function() {
        var go = GateOne,
            t = go.Terminal,
            u = go.Utils,
            prefix = go.prefs.prefix,
            p = u.createElement('p', {'id': prefix+'info_actions', 'style': {'padding-bottom': '0.4em'}}),
            tableDiv = u.createElement('div', {'class': prefix+'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            tableDiv2 = u.createElement('div', {'class': prefix+'paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            toolbarClose = u.createElement('div', {'id': prefix+'icon_closeterm', 'class': prefix+'toolbar', 'title': "Close This Terminal"}),
            toolbarNewTerm = u.createElement('div', {'id': prefix+'icon_newterm', 'class': prefix+'toolbar', 'title': "New Terminal"}),
            toolbarInfo = u.createElement('div', {'id': prefix+'icon_info', 'class': prefix+'toolbar', 'title': "Terminal Info"}),
            infoPanel = u.createElement('div', {'id': prefix+'panel_info', 'class': prefix+'panel'}),
            infoPanelRow1 = u.createElement('div', {'class': prefix+'paneltablerow', 'id': prefix+'panel_inforow1'}),
            infoPanelRow2 = u.createElement('div', {'class': prefix+'paneltablerow', 'id': prefix+'panel_inforow2'}),
            infoPanelRow3 = u.createElement('div', {'class': prefix+'paneltablerow', 'id': prefix+'panel_inforow3'}),
            infoPanelRow4 = u.createElement('div', {'class': prefix+'paneltablerow', 'id': prefix+'panel_inforow4'}),
            infoPanelH2 = u.createElement('h2', {'id': prefix+'termtitle'}),
            infoPanelTimeLabel = u.createElement('span', {'id': prefix+'term_time_label', 'style': {'display': 'table-cell'}}),
            infoPanelTime = u.createElement('span', {'id': prefix+'term_time', 'style': {'display': 'table-cell'}}),
            infoPanelRowsLabel = u.createElement('span', {'id': prefix+'rows_label', 'style': {'display': 'table-cell'}}),
            infoPanelRows = u.createElement('span', {'id': prefix+'rows', 'style': {'display': 'table-cell'}}),
            infoPanelColsLabel = u.createElement('span', {'id': prefix+'cols_label', 'style': {'display': 'table-cell'}}),
            infoPanelCols = u.createElement('span', {'id': prefix+'cols', 'style': {'display': 'table-cell'}}),
//             infoPanelViewLog = u.createElement('button', {'id': prefix+'viewlog', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            infoPanelSaveRecording = u.createElement('button', {'id': prefix+'saverecording', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            infoPanelMonitorActivity = u.createElement('input', {'id': prefix+'monitor_activity', 'type': 'checkbox', 'name': 'monitor_activity', 'value': 'monitor_activity', 'style': {'margin-right': '0.5em'}}),
            infoPanelMonitorActivityLabel = u.createElement('span'),
            infoPanelMonitorInactivity = u.createElement('input', {'id': prefix+'monitor_inactivity', 'type': 'checkbox', 'name': 'monitor_inactivity', 'value': 'monitor_inactivity', 'style': {'margin-right': '0.5em'}}),
            infoPanelMonitorInactivityLabel = u.createElement('span'),
            infoPanelInactivityInterval = u.createElement('input', {'id': prefix+'inactivity_interval', 'name': prefix+'inactivity_interval', 'size': 3, 'value': 10, 'style': {'margin-right': '0.5em', 'text-align': 'right', 'width': '4em'}}),
            infoPanelInactivityIntervalLabel = u.createElement('span'),
            goDiv = u.getNode(go.prefs.goDiv),
            toolbarPrefs = u.getNode('#'+prefix+'icon_prefs'),
            toolbar = u.getNode('#'+prefix+'toolbar');
        // Create our info panel
        go.Icons['info'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient12680" y2="294.5" gradientUnits="userSpaceOnUse" x2="253.59" gradientTransform="translate(244.48201,276.279)" y1="276.28" x1="253.59"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-396.60679,-820.39654)"><g transform="translate(152.12479,544.11754)"><path fill="url(#linearGradient12680)" d="m257.6,278.53c-3.001-3-7.865-3-10.867,0-3,3.001-3,7.868,0,10.866,2.587,2.59,6.561,2.939,9.53,1.062l4.038,4.039,2.397-2.397-4.037-4.038c1.878-2.969,1.527-6.943-1.061-9.532zm-1.685,9.18c-2.07,2.069-5.426,2.069-7.494,0-2.071-2.069-2.071-5.425,0-7.494,2.068-2.07,5.424-2.07,7.494,0,2.068,2.069,2.068,5.425,0,7.494z"/></g></g></svg>';
        toolbarInfo.innerHTML = go.Icons['info'];
        go.Icons['close'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient3010" y2="252.75" gradientUnits="userSpaceOnUse" y1="232.75" x2="487.8" x1="487.8"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" fill="url(#linearGradient3010)"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';
        toolbarClose.innerHTML = go.Icons['close'];
        go.Icons['newTerm'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient12259" y2="234.18" gradientUnits="userSpaceOnUse" x2="561.42" y1="252.18" x1="561.42"><stop class="stop1" offset="0"/><stop class="stop2" offset="0.4944"/><stop class="stop3" offset="0.5"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-261.95455,-486.69334)"><g transform="matrix(0.94996733,0,0,0.94996733,-256.96226,264.67838)"><rect height="3.867" width="7.54" y="241.25" x="557.66" fill="url(#linearGradient12259)"/><rect height="3.866" width="7.541" y="241.25" x="546.25" fill="url(#linearGradient12259)"/><rect height="7.541" width="3.867" y="245.12" x="553.79" fill="url(#linearGradient12259)"/><rect height="7.541" width="3.867" y="233.71" x="553.79" fill="url(#linearGradient12259)"/><rect height="3.867" width="3.867" y="241.25" x="553.79" fill="url(#linearGradient12259)"/><rect height="3.867" width="3.867" y="241.25" x="553.79" fill="url(#linearGradient12259)"/></g></g></svg>';
        toolbarNewTerm.innerHTML = go.Icons['newTerm'];
        infoPanelH2.innerHTML = "Gate One";
        infoPanelTimeLabel.innerHTML = "<b>Connected Since:</b> ";
        infoPanelRowsLabel.innerHTML = "<b>Rows:</b> ";
        infoPanelRows.innerHTML = go.prefs.rows; // Will be replaced
        infoPanelColsLabel.innerHTML = "<b>Columns:</b> ";
        infoPanelCols.innerHTML = go.prefs.cols; // Will be replaced
        infoPanel.appendChild(infoPanelH2);
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
            var term = localStorage['selectedTerminal'],
                monitorInactivity = u.getNode('#'+prefix+'monitor_inactivity'),
                monitorActivity = u.getNode('#'+prefix+'monitor_activity'),
                termTitle = u.getNode('#' + prefix + 'term' + term).title;
            if (monitorInactivity.checked) {
                var inactivity = function() {
                    go.Terminal.notifyInactivity(termTitle);
                    // Restart the timer
                    go.terminals[term]['inactivityTimer'] = setTimeout(inactivity, go.terminals[term]['inactivityTimeout']);
                }
//                 logStorage('Monitoring for inactivity in: ' + termTitle);
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
            var term = localStorage['selectedTerminal'],
                monitorInactivity = u.getNode('#'+prefix+'monitor_inactivity'),
                monitorActivity = u.getNode('#'+prefix+'monitor_activity'),
                termTitle = u.getNode('#' + prefix + 'term' + term).title;
            if (monitorActivity.checked) {
//                 logStorage('Monitoring for activity in: ' + termTitle);
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
            var term = localStorage['selectedTerminal'];
            go.terminals[term]['inactivityTimeout'] = parseInt(this.value) * 1000;
        }
        var editTitle =  function(e) {
            var term = localStorage['selectedTerminal'],
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
            go.Terminal.closeTerminal(localStorage['selectedTerminal']);
        }
        toolbarClose.onclick = closeCurrentTerm;
        // TODO: Get showInfo() displaying the proper status of the activity monitory checkboxes
        var showInfo = function() {
            var term = localStorage['selectedTerminal'],
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
        // Setup the text processing web worker
        t.termUpdatesWorker = new Worker('/static/go_process.js');
        var termUpdateFromWorker = function(e) {
            var data = e.data,
                term = data.term,
                screen = data.screen,
                scrollback = data.scrollback,
                screen_html = "",
                consoleLog = data.log, // Only used when debugging
                screenUpdate = false,
                terminalObj = {},
                reScrollback = u.partial(go.Visual.enableScrollback, term);
            if (term) { terminalObj = go.terminals[term] } else { logError("No terminal object?!?") };
            if (screen) {
                try {
                    terminalObj['screen'] = screen;
                    var termContainer = u.getNode('#'+prefix+'term' + term);
                    screen_html = '<pre id="'+prefix+'term' + term + '_pre">' + screen.join('\n') + '\n\n</pre>';
                    termContainer.innerHTML = screen_html;
                    screenUpdate = true;
                } catch (e) { // Likely the terminal just closed
                    u.noop(); // Just ignore it.
                }
            }
            if (scrollback) {
                terminalObj['scrollback'] = scrollback;
                try {
                    // Save the scrollback buffer in localStorage for retrieval if the user reloads
                    localStorage.setItem("scrollback" + term, scrollback.join('\n'));
                } catch (e) {
                    logError(e);
                }
            }
            if (consoleLog) {
                console.log(consoleLog);
            }
            if (screenUpdate) {
                // TODO here:  go.Playback stuff
                // Take care of the activity/inactivity notifications
                if (terminalObj['inactivityTimer']) {
                    clearTimeout(terminalObj['inactivityTimer']);
                    var inactivity = u.partial(t.notifyInactivity, termTitle);
                    terminalObj['inactivityTimer'] = setTimeout(inactivity, terminalObj['inactivityTimeout']);
                }
                if (terminalObj['activityNotify']) {
                    if (!terminalObj['lastNotifyTime']) {
                        // Setup a minimum delay between activity notifications so we're not spamming the user
                        terminalObj['lastNotifyTime'] = new Date();
                        t.notifyActivity(termTitle);
                    } else {
                        var then = new Date(terminalObj['lastNotifyTime']),
                            now = new Date();
                        then.setSeconds(then.getSeconds() + 5); // 5 seconds between notifications
                        if (now > then) {
                            terminalObj['lastNotifyTime'] = new Date(); // Reset
                            t.notifyActivity(termTitle);
                        }
                    }
                }
                if (terminalObj['scrollbackTimer']) {
                    clearTimeout(terminalObj['scrollbackTimer']);
                }
                // This timeout re-adds the scrollback buffer after 3.5 seconds.  If we don't do this it can slow down the responsiveness quite a bit
                terminalObj['scrollbackTimer'] = setTimeout(reScrollback, 3500); // 3.5 seconds is just past the default 'top' refresh rate
                // Excute any registered callbacks
                if (go.Terminal.updateTermCallbacks.length) {
                    go.Terminal.updateTermCallbacks.forEach(function(callback) {
                        callback(term);
                    });
                }
            }
            if (go.Playback) {
                // Add the screen to the session recording
                var frameObj = {'screen': screen_html, 'time': new Date()};
                // Session storage has been disabled because it is too slow to re-parse the JSON every screen update.  I'm hoping that we can use sessionStorage like this in the future with some sort of workaround but it might not be possible.
//                 var existingFrames = sessionStorage.getItem("playbackFrames" + term);
//                 if (existingFrames) {
//                     terminalObj['playbackFrames'] = JSON.parse(existingFrames);
//                 }
                terminalObj['playbackFrames'] = terminalObj['playbackFrames'].concat(frameObj);
                // Trim the array to match the go.prefs['playbackFrames'] setting
                if (terminalObj['playbackFrames'].length > go.prefs['playbackFrames']) {
                    terminalObj['playbackFrames'].reverse();
                    terminalObj['playbackFrames'].length = go.prefs['playbackFrames'];
                    terminalObj['playbackFrames'].reverse(); // Put it back in the proper order
                }
                if (!go.Playback.clockUpdater) { // Get the clock updating
                    go.Playback.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1000);
                }
                // Reset the playback frame to be current
                go.Playback.currentFrame = terminalObj['playbackFrames'].length - 1;
            }
        }
        t.termUpdatesWorker.addEventListener('message', termUpdateFromWorker, false);
        // Register our keyboard shortcuts
        // Ctrl-Alt-N to create a new terminal
        go.Input.registerShortcut('KEY_N', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Terminal.newTerminal()'});
        // Ctrl-Alt-W to close the current terminal
        go.Input.registerShortcut('KEY_W', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'go.Terminal.closeTerminal(localStorage["selectedTerminal"])'});
        // Register our actions
        go.Net.addAction('terminals', go.Terminal.reattachTerminalsAction);
        go.Net.addAction('termupdate', go.Terminal.updateTerminalAction);
        go.Net.addAction('term_ended', go.Terminal.closeTerminal);
        go.Net.addAction('term_exists', go.Terminal.reconnectTerminalAction);
        go.Net.addAction('set_mode', go.Terminal.setModeAction); // For things like application cursor keys
        go.Net.addAction('metadata', go.Terminal.storeMetadata);
    },
    updateTerminalAction: function(termUpdateObj) {
        // Replaces the contents of the terminal div with the lines in *termUpdateObj*.
        var go = GateOne,
            u = go.Utils,
            t = go.Terminal,
            v = go.Visual,
            term = termUpdateObj['term'],
            prevScrollback = localStorage["scrollback" + term],
            terminalObj = go.terminals[term],
            termTitle = u.getNode('#' + go.prefs.prefix + 'term' + term).title,
            textTransforms = go.Terminal.textTransforms;
//         logDebug('GateOne.Utils.updateTerminalActionTest() termUpdateObj: ' + u.items(termUpdateObj));
        if (screen) {
            // Offload processing of the incoming screen to the Web Worker
            t.termUpdatesWorker.postMessage({
                'cmds': ['processScreen'],
                'terminalObj': terminalObj,
                'termUpdateObj': termUpdateObj,
                'prevScrollback': prevScrollback,
                'termTitle': termTitle,
                'prefs': go.prefs,
                'textTransforms': textTransforms
            });
        }
    },
    notifyInactivity: function(term) {
        // Notifies the user of inactivity in *term*
        var message = "Inactivity in terminal: " + term;
        GateOne.Visual.playBell();
        GateOne.Visual.displayMessage(message);
//         logStorage(message);
    },
    notifyActivity: function(term) {
        // Notifies the user of activity in *term*
        var message = "Activity in terminal: " + term;
        GateOne.Visual.playBell();
        GateOne.Visual.displayMessage(message);
//         logStorage(message);
    },
    newTerminal: function(/*Opt:*/term) {
        // Adds a new terminal to the grid and starts updates with the server.
        // If *term* is provided, the created terminal will use that number.
        logDebug("calling newTerminal(" + term + ")");
        var go = GateOne,
            u = go.Utils,
            t = go.Terminal,
            currentTerm = null,
            termUndefined = false,
            dimensions = u.getRowsAndColumns(go.prefs.goDiv),
            prevScrollback = localStorage.getItem("scrollback" + term);
        if (term) {
            currentTerm = go.prefs.prefix+'term' + term;
            t.lastTermNumber = term;
        } else {
            termUndefined = true;
            t.lastTermNumber = t.lastTermNumber + 1;
            term = t.lastTermNumber;
            currentTerm = go.prefs.prefix+'term' + t.lastTermNumber;
        }
        // Create the terminal record scaffold
        go.terminals[term] = {
            created: new Date(), // So we can keep track of how long it has been open
            rows: dimensions.rows,
            columns: dimensions.cols,
            mode: 'default', // e.g. 'appmode', 'xterm', etc
            backspace: String.fromCharCode(127), // ^?
            screen: [],
            prevScreen: [],
            scrollback: [],
            playbackFrames: [],
            scrollbackTimer: null // Controls re-adding scrollback buffer
        };
        for (var i=0; i<dimensions.rows; i++) {
            // Fill out prevScreen with spaces
            go.terminals[term]['prevScreen'].push(' ');
        }
        if (prevScrollback) {
            go.terminals[term]['scrollback'] = prevScrollback.split('\n');
        }
        // Add the terminal div to the grid
        var terminal = u.createElement('div', {'id': currentTerm, 'title': 'New Terminal', 'class': go.prefs.prefix+'terminal'}),
        // Get any previous term's dimensions so we can use them for the new terminal
            termSettings = {
                'term': term,
                'rows': dimensions.rows - 1,
                'cols': dimensions.cols - 6 // -6 for the scrollbar
            },
            slide = u.partial(go.Visual.slideToTerm, term, true);
        u.getNode('#'+go.prefs.prefix+'termwrapper').appendChild(terminal);
        // Apply user-defined rows and cols (if set)
        if (go.prefs.cols) { termSettings.cols = go.prefs.cols };
        if (go.prefs.rows) { termSettings.rows = go.prefs.rows };
        // Tell the server to create a new terminal process
        go.ws.send(JSON.stringify({'new_terminal': termSettings}));
        // Fix the width/height of all terminals (including the one we just created)
        var terms = u.toArray(document.getElementsByClassName(go.prefs.prefix+'terminal'));
        terms.forEach(function(termObj) {
        // Set the dimensions of each terminal to the full width/height of the window
            termObj.style.width = go.Visual.goDimensions.w + 'px';
            termObj.style.height = go.Visual.goDimensions.h + 'px';
        });
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
    },
    closeTerminal: function(term) {
        // Closes the given terminal and tells the server to end its running process
        var go = GateOne,
            u = go.Utils,
            message = "Closed term " + term + ": " + u.getNode('#'+go.prefs.prefix+'term' + term).title,
            lastTerm = null;
        // Tell the server to kill the terminal
        go.Net.killTerminal(term);
        // Delete the associated scrollback buffer (save the world from localStorage pollution)
        delete localStorage['scrollback'+term];
        // Remove the terminal from the page
        u.removeElement('#'+go.prefs.prefix+'term' + term);
        // Also remove it from working memory
        delete go.terminals[term];
        // Now find out what the previous terminal was and move to it
        var terms = u.toArray(document.getElementsByClassName(go.prefs.prefix+'terminal'));
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
            // TODO: Change the usage of slideToTerm everywhere to be something more ambiguous that can be drop-in replaced.
            //       For example, go.Terminal.switchToTerm which would call whatever visualizations the user has loaded/selected
            go.Visual.slideToTerm(termNum, true);
        } else {
            // There are no other terminals.  Open a new one...
            go.Terminal.newTerminal();
        }
    },
//     hideAllButCurrentTerminal: function() { // TODO: Can probably remove this (not presently used)
//         var u = GateOne.Utils,
//             terms = u.toArray(document.getElementsByClassName(GateOne.prefs.prefix+'terminal'));
//         terms.forEach(function(termObj) {
//             if (!u.hasElementClass(termObj, GateOne.prefs.prefix+'currentterm')) {
//                 u.hideElement(termObj);
//             }
//         });
//     },
    reconnectTerminalAction: function(term){
        // Called when the server reports that the terminal number supplied via 'new_terminal' already exists
        // NOTE: Doesn't do anything at the moment
        logDebug('reconnectTerminalAction(' + term + ')');
    },
    reattachTerminalsAction: function(terminals){
        // Called after we authenticate to the server...
        // If we're reconnecting to an existing session, those running terminals will be recreated.
        // If this is a new session, a fresh terminal will be created.
        var go = GateOne,
            u = go.Utils;
        logDebug("reattachTerminalsAction() terminals: " + u.items(terminals));
        if (terminals.length) {
            // Reattach the running terminals
            var selectedMatch = false;
            terminals.forEach(function(termNum) {
                if (termNum == localStorage['selectedTerminal']) {
                    selectedMatch = true;
                    var slide = u.partial(go.Visual.slideToTerm, termNum, true);
                    setTimeout(slide, 1000);
                }
                go.Terminal.newTerminal(termNum);
                go.Terminal.lastTermNumber = termNum;
            });
            if (!selectedMatch) {
                go.Visual.slideToTerm(go.Terminal.lastTermNumber, true);
            }
        } else {
            // Create a new terminal
            go.Terminal.lastTermNumber = 0; // Reset to 0
            go.Terminal.newTerminal();
        }
        // In case the user changed the rows/cols or the font/size changed:
        setTimeout(function() { // Wrapped in a timeout since it takes a moment for everything to change in the browser
            go.Visual.updateDimensions();
            go.Net.sendDimensions();
        }, 1500);
//         go.Net.sendDimensions(); // Sets this globally for the user's session
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
        if (typeof(pattern) == "object") {
            pattern = pattern.toString(); // Have to convert it to a string so we can pass it to the Web Worker so Firefox won't freak out
        }
        GateOne.Terminal.textTransforms[name] = {};
        GateOne.Terminal.textTransforms[name]['pattern'] = pattern;
        GateOne.Terminal.textTransforms[name]['newString'] = newString;
    }
});

// Protocol actions
GateOne.Net.actions = {
// These are what will get called when the server sends us each respective action
    'log': GateOne.Net.log,
    'ping': GateOne.Net.ping,
    'pong': GateOne.Net.pong,
    'reauthenticate': GateOne.Net.reauthenticate,
}

window.GateOne = GateOne; // Make everything usable

})(window);