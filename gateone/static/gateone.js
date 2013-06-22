// -*- coding: utf-8 -*-
/*
COPYRIGHT NOTICE
================

gateone.js and all related original code...

Copyright 2013 Liftoff Software Corporation

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
// TODO: Make it so that variables like GateOne.Terminal.terminals use GateOne.prefs.prefix so you can have more than one instance of Gate One embedded on the same page without conflicts.
// TODO: This is a big one:  Re-write most of this to use Underscore.js (as a more well-constructed way to support multiple simultaneous Gate One server connections/instances).  Will require overriding some aspects of Backbone.js but this is easier than re-inventing the wheel with Models.

// Everything goes in GateOne
(function(window, undefined) {
"use strict";

var document = window.document; // Have to do this because we're sandboxed

//  Capabilities checks go before everything else so we don't waste time
// Choose the appropriate WebSocket
var WebSocket =  (window.MozWebSocket || window.WebSocket || window.WebSocketDraft);

// Blob and window.URL checks
var BlobBuilder = (window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder), // Deprecated but still supported by Gate One.  Will be removed at some later date
    Blob = window.Blob, // This will be favored (used by GateOne.Utils.createBlob())
    urlObj = (window.URL || window.webkitURL);

// Set the indexedDB variable as a global (within this sandbox) attached to the proper indexedDB implementation
var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
if ('webkitIndexedDB' in window) {
    window.IDBTransaction = window.webkitIDBTransaction;
    window.IDBKeyRange = window.webkitIDBKeyRange;
}

// getUserMedia check
var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || null);

// Choose appropriate Page Visibility API attribute
var hidden, visibilityChange;
if (typeof document.hidden !== "undefined") {
    hidden = "hidden";
    visibilityChange = "visibilitychange";
} else if (typeof document.mozHidden !== "undefined") {
    hidden = "mozHidden";
    visibilityChange = "mozvisibilitychange";
} else if (typeof document.msHidden !== "undefined") {
    hidden = "msHidden";
    visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
    hidden = "webkitHidden";
    visibilityChange = "webkitvisibilitychange";
}
// NOTE:  If the browser doesn't support the Page Visibility API it isn't a big deal; the user will merely have to click on the page for input to start being captured.

// Sandbox-wide shortcuts
var noop = function(a) { return a }, // Let's us reference functions that may or may not be available (see logging shortcuts below).
    ESC = String.fromCharCode(27), // Saves a lot of typing and it's easy to read
// Log level shortcuts for each log level (these get properly assigned in GateOne.initialize() if GateOne.Logging is available)
    logFatal = noop,
    logError = noop,
    logWarning = noop,
    logInfo = noop,
    logDebug = noop,
    deprecated = noop;

// Define GateOne
var GateOne = GateOne || function() {};
GateOne.__name__ = "GateOne";
GateOne.__version__ = "1.2";
GateOne.__repr__ = function () {
    return "[" + this.__name__ + " " + this.__version__ + "]";
};
GateOne.toString = function () {
    return this.__repr__();
};

// Define our internal token seed storage (inaccessible outside this sandbox)
var seed1 = null, seed2 = null; // NOTE: Not used yet.

// NOTE: This module/method loading/updating code was copied from the *excellent* MochiKit JS library (http://mochikit.com).
//       ...which is MIT licensed: http://www.opensource.org/licenses/mit-license.php
//      Other functions copied from MochiKit are indicated individually throughout this file
GateOne.Base = GateOne.Base || {}; // "Base" contains the basic functions used to create/update Gate One modules/plugins
GateOne.loadedModules = [];
GateOne.loadedApplications = {};
GateOne.initializedModules = []; // So we don't accidentally call a plugin's init() or postInit() functions twice
/**
 * Creates a new module in a parent namespace. This function will
 * create a new empty module object with "__name__", "__version__",
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

GateOne.Base.module = function(parent, name, version, deps) {
    var module = parent[name] = parent[name] || {},
        prefix = (parent.__name__ ? parent.__name__ + "." : "");
    module.__name__ = prefix + name;
    module.__version__ = version;
    module.__parent__ = parent;
    module.__repr__ = function () {
        return "[" + this.__name__ + " " + this.__version__ + "]";
    };
    module.toString = function () {
        return this.__repr__();
    };
    for (var i = 0; deps != null && i < deps.length; i++) {
        if (!(deps[i] in parent)) {
            throw module.__name__ + ' depends on ' + prefix + deps[i] + '!';
        }
    }
    GateOne.loadedModules.push(module.__name__);
    return module;
};
GateOne.Base.module(GateOne, "Base", "1.2", []);
GateOne.Base.update = function(self, obj/*, ... */) {
    if (self === null || self === undefined) {
        self = {};
    }
    for (var i = 1; i < arguments.length; i++) {
        var o = arguments[i];
        if (typeof(o) != 'undefined' && o !== null) {
            for (var k in o) {
                self[k] = o[k];
                if (self[k]) {
                    self[k].__name__ = k
                    self[k].__parent__ = self;
                }
            }
        }
    }
    return self;
};
GateOne.Base.module(GateOne, "i18n", "1.0");
GateOne.i18n.translations = {}; // Stores the localized translation of various strings
/**:GateOne.i18n

A module to store and retrieve localized translations of strings.
*/
GateOne.Base.update(GateOne.i18n, {
    gettext: function(string) {
        /**:GateOne.Base.gettext(string)

        Returns a localized translation of *string* if available.  Returns *string* if no translation is available.
        */
        if (GateOne.i18n.translations[string]) {
            return GateOne.i18n.translations[string][1];
        }
        return string;
    },
    registerTranslationAction: function(table) {
        /**:GateOne.i18n.registerTranslationAction(table)

        Attached to the 'go:register_translation' WebSocket action; stores the translation *table* in `GateOne.i18n.translations`.
        */
        GateOne.i18n.translations = table;
    },
    setLocale: function(locale) {
        /**:GateOne.i18n.setLocale(locale)

        Tells the Gate One server to set the user's locale to *locale*.  Example::

            >>> GateOne.i18n.setLocale('fr_FR');
        */
        GateOne.ws.send(JSON.stringify({'go:set_locale': locale}));
    }
});


// Global (within the sandbox) gettext shortcut:
var gettext = GateOne.i18n.gettext;

// GateOne Settings
GateOne.location = "default"; // Yes, the default location is called "default" :)
GateOne.prefs = {
    /**:GateOne.prefs

    This object holds all of Gate One's preferences.  Both those things that are meant to be user-controlled (e.g. `theme`) and those things that are globally configured (e.g. `url`).  Applications and plugins can store their own preferences here.
    */
    auth: null, // If using API authentication, this value will hold the user's auth object (see docs for the format).
    embedded: false, // Equivalent to {showTitle: false, showToolbar: false} and certain keyboard shortcuts won't be registered
    fillContainer: true, // If set to true, #gateone will fill itself out to the full size of its parent element
    fontSize: '100%', // The font size that will be applied to the goDiv element (so users can adjust it on-the-fly)
    goDiv: '#gateone', // Default element to place gateone inside
    keepaliveInterval: 15000, // How often we try to ping the Gate One server to check for a connection problem.
    prefix: 'go_', // What to prefix element IDs with (in case you need to avoid a name conflict).  NOTE: There are a few classes that use the prefix too.
    showTitle: true, // If false, the title will not be shown in the sidebar.
    showToolbar: true, // If false, the toolbar will now be shown in the sidebar.
    skipChecks: false, // Tells GateOne.init() to skip capabilities checks (in case you have your own or are happy with silent failures)
    style: {}, // Whatever CSS the user wants to apply to #gateone.  NOTE: Width and height will be skipped if fillContainer is true
    theme: 'black', // The theme to use by default (e.g. 'black', 'white', etc)
    pingTimeout: 5000, // How long to wait before we declare that the connection with the Gate One server has timed out (via a ping/pong response)
    url: null // URL of the GateOne server.  Will default to whatever is in window.location
}
// Properties in this object will get ignored when GateOne.prefs is saved to localStorage
GateOne.noSavePrefs = {
    // Plugin authors:  If you want to have your own property in GateOne.prefs but it isn't a per-user setting, add your property here
    auth: null,
    embedded: null,
    fillContainer: null,
    goDiv: null, // Why an object and not an array?  So the logic is simpler:  "for (var objName in noSavePrefs) ..."
    prefix: null,
    showTitle: null,
    showToolbar: null,
    skipChecks: null,
    style: null,
    pingTimeout: null,
    url: null
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
GateOne.initialized = false; // Used to detect if we've already called initialize()
var go = GateOne.Base.update(GateOne, {
    // GateOne internal tracking variables and user functions
    workspaces: {
        count: function() {
            // Returns the number of open workspaces
            var counter = 0;
            for (var workspace in GateOne.workspaces) {
                if (workspace % 1 === 0) {
                    counter += 1;
                }
            }
            return counter;
        }
    }, // For keeping track of open workspaces
    ws: null, // Where our WebSocket gets stored
    savePrefsCallbacks: [], // DEPRECATED: For plugins to use so they can have their own preferences saved when the user clicks "Save" in the Gate One prefs panel
    restoreDefaults: function() {
        // Restores all of Gate One's user-specific prefs to default values
        GateOne.prefs = {
            theme: 'black',
            fontSize: '100%'
        }
        GateOne.Events.trigger('go:restore_defaults');
        GateOne.Utils.savePrefs(true); // 'true' here skips the notification
    },
    // This starts up GateOne using the given *prefs*
    init: function(prefs, /*opt*/callback) {
        /**:GateOne.init(prefs[, callback])

        Initializes Gate One using the provided *prefs*.

        If *callback* is provided it will be called after GateOne.Net.connect() completes
        */
        var go = GateOne,
            u = go.Utils,
            criticalFailure = false,
            missingCapabilities = [],
            parseResponse = function(response) {
                if (response == 'authenticated') {
                    // Connect (GateOne.initialize() will be called after the connection is made)
                    logDebug("GateOne.init() calling GateOne.Net.connect()");
                    go.Net.connect(callback);
                } else {
                    // Regular auth.  Clear the cookie and redirect the user...
                    GateOne.Net.reauthenticate();
                }
            };
        // Update GateOne.prefs with the settings provided in the calling page
        for (var setting in prefs) {
            go.prefs[setting] = prefs[setting];
        }
        // Make our prefix unique to our location
        go.prefs.prefix += go.location + '_';
        // Capabilities Notifications
        if (!go.prefs.skipChecks) {
            if (!WebSocket) {
                logError('Browser failed WebSocket support check.');
                missingCapabilities.push("Sorry but your web browser does not appear to support WebSockets.  Gate One requires WebSockets in order to (efficiently) communicate with the server.");
                criticalFailure = true;
            }
            if (Blob) {
                // Older versions of Chrome/Chromium had window.Blob() but it didn't work (would always throw "illegal constructor" exceptions).
                // So to truly test it we need to make a test Blob():
                try {
                    var test = new Blob(["test"], {"type": "text\/xml"});
                } catch (e) {
                    // Set Blob to null so there's no confusion (fallback to BlobBuilder should work)
                    Blob = false;
                    window.Blob = false;
                }
            }
            //  Need either BlobBuilder (deprecated) or Blob support to save files
            if (!BlobBuilder) {
                if (!Blob) {
                    logError('Browser failed Blob support check.');
                    missingCapabilities.push("Your browser does not appear to support the HTML5 File API (<a href='https://developer.mozilla.org/en-US/docs/DOM/Blob'>Blob objects</a>, specifically).  Some features related to saving files will not work.");
                }
            }
            // Warn about window.URL or window.webkitURL
            if (!urlObj) {
                logError('Browser failed window.URL object support check.');
                missingCapabilities.push("Your browser does not appear to support the <a href='https://developer.mozilla.org/en-US/docs/DOM/window.URL.createObjectURL'>window.URL</a> object.  Some features related to saving files will not work.");
            }
            if (missingCapabilities.length) {
                // Notify the user of the problems and cancel the init() process
                if (criticalFailure) {
                    alert("Sorry but your browser is missing the following capabilities which are required to run Gate One: \n" + missingCapabilities.join('\n') + "\n\nGate One will not be loaded.");
                    return;
                } else {
                    if (!localStorage[go.prefs.prefix+'disableWarning']) {
                        // Warn the user about their browser's missing capabilities if they haven't checked off "Don't display this warning again"
                        var container = u.createElement('div', {'style': {'text-align': 'left', 'margin-left': '1.5em', 'margin-right': '1.5em'}}),
                            done = u.createElement('button', {'type': 'submit', 'value': 'Submit', 'class': '✈button ✈black'}),
                            disableWarning = u.createElement('input', {'type': 'checkbox', 'id': 'disableWarning', 'style': {'margin-top': '1em', 'display': 'inline', 'width': 'auto'}}),
                            disableWarningLabel = u.createElement('label', {'style': {'font-size': '1em', 'font-weight': 'normal', 'display': 'inline', 'width': 'auto'}}),
                            missingList = u.createElement('ul');
                        missingCapabilities.forEach(function(msg) {
                            var li = u.createElement('li');
                            li.innerHTML = msg;
                            missingList.appendChild(li);
                        });
                        disableWarningLabel.innerHTML = "Don't display this warning again";
                        disableWarningLabel.htmlFor = go.prefs.prefix+'disableWarning';
                        container.appendChild(missingList);
                        container.appendChild(disableWarning);
                        container.appendChild(disableWarningLabel);
                        // NOTE: I'm using a separate 'disableWarning' item in localStorage below so it doesn't get confused with GateOne.prefs.skipChecks (which is not supposed to be saveable in localStorage via noSavePrefs).
                        disableWarning.onclick = function(e) {
                            if (disableWarning.checked) {
                                // Set it in localStorage so we know now to run this check again
                                localStorage[go.prefs.prefix+'disableWarning'] = true;
                            } else {
                                delete localStorage[go.prefs.prefix+'disableWarning'];
                            }
                        }
                        setTimeout(function() {
                            // Have to wrap this in a timeout or it won't show up.
                            go.Visual.alert('Warning', container);
                        }, 2000);
                    }
                }
            }
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
        var authCheck = go.prefs.url + 'auth?check=True';
        if (go.prefs.auth) {
            // API authentication doesn't need to use the /auth URL.
            logDebug("Using API authentiation object: " + go.prefs.auth);
            go.Net.connect(callback);
        } else {
            // Check if we're authenticated after all the scripts are done loading
            u.xhrGet(authCheck, parseResponse); // The point of this function is to let the server verify the cookie for us
        }
        // Cache our node for easy reference
        go.node = u.getNode(go.prefs.goDiv);
    // Empty out anything that might be already-existing in goDiv
        go.node.innerHTML = '';
    },
    initialize: function() {
        if (GateOne.initialized) {
            // If we've already called initialize() we don't need to re-create all these panels and whatnot
            GateOne.Visual.updateDimensions(); // Just in case
            return; // Nothing left to do
        }
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        logFatal = GateOne.Logging.logFatal;
        logError = GateOne.Logging.logError;
        logWarning = GateOne.Logging.logWarning;
        logInfo = GateOne.Logging.logInfo;
        logDebug = GateOne.Logging.logDebug;
        deprecated = GateOne.Logging.deprecated;
        var go = GateOne,
            u = go.Utils,
            E = go.Events,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': '✈panel_close_icon', 'title': "Close This Panel"}),
            prefsPanel = u.createElement('div', {'id': 'panel_prefs', 'class':'✈panel ✈prefs_panel'}),
            prefsPanelH2 = u.createElement('h2'),
            prefsPanelForm = u.createElement('form', {'id': 'prefs_form', 'name': prefix+'prefs_form'}),
            prefsList = u.createElement('div', {'id': 'prefs_list', 'class': '✈prefs_list'}),
            prefsListUL = u.createElement('ul', {'id': 'prefs_list_ul'}),
            prefsContent = u.createElement('div', {'id': 'prefs_content', 'class': '✈prefs_content'}),
            prefsPanelStyleRow1 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow3 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow4 = u.createElement('div', {'class':'✈paneltablerow'}),
            tableDiv = u.createElement('div', {'id': 'prefs_tablediv1', 'class':'✈paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            prefsPanelThemeLabel = u.createElement('span', {'id': 'prefs_theme_label', 'class':'✈paneltablelabel'}),
            prefsPanelTheme = u.createElement('select', {'id': 'prefs_theme', 'name': prefix+'prefs_theme', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelFontSizeLabel = u.createElement('span', {'id': 'prefs_fontsize_label', 'class':'✈paneltablelabel'}),
            prefsPanelFontSize = u.createElement('input', {'id': 'prefs_fontsize', 'name': prefix+'prefs_fontsize', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelDisableTransitionsLabel = u.createElement('span', {'id': 'prefs_disabletrans_label', 'class':'✈paneltablelabel'}),
            prefsPanelDisableTransitions = u.createElement('input', {'id': 'prefs_disabletrans', 'name': prefix+'prefs_disabletrans', 'value': 'disabletrans', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelSave = u.createElement('button', {'id': 'prefs_save', 'type': 'submit', 'value': 'Save', 'class': '✈button ✈black ✈save_button'}),
            noticeContainer = u.createElement('div', {'id': 'noticecontainer', 'class': '✈noticecontainer'}),
            toolbar = u.createElement('div', {'id': 'toolbar', 'class': '✈toolbar_container'}),
            toolbarIconPrefs = u.createElement('div', {'id': 'icon_prefs', 'class':'✈toolbar', 'title': gettext("Preferences")}),
            panels = u.getNodes('.✈panel'),
            // Firefox doesn't support 'mousewheel'
//             mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel",
            sideinfo = u.createElement('div', {'id': 'sideinfo', 'class':'✈sideinfo'}),
            updateCSSfunc = function(panelNode) {
                if (panelNode.id == prefix+'panel_prefs') {
                    go.ws.send(JSON.stringify({'go:enumerate_themes': null}));
                }
            };
        // Create our prefs panel
        u.hideElement(prefsPanel); // Start out hidden
        go.Visual.applyTransform(prefsPanel, 'scale(0)'); // So it scales back in real nice
        toolbarIconPrefs.innerHTML = go.Icons.prefs;
        prefsPanelH2.innerHTML = gettext("Preferences");
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            go.Visual.togglePanel('#'+prefix+'panel_prefs'); // Scale away, scale away, scale away.
        }
        prefsPanel.appendChild(prefsPanelH2);
        prefsPanel.appendChild(panelClose);
        prefsPanelThemeLabel.innerHTML = gettext("<b>Theme:</b> ");
        prefsPanelFontSizeLabel.innerHTML = gettext("<b>Font Size:</b> ");
        prefsPanelDisableTransitionsLabel.innerHTML = gettext("<b>Disable Workspace Slide Effect:</b> ");
        prefsPanelFontSize.value = go.prefs.fontSize;
        prefsPanelDisableTransitions.checked = go.prefs.disableTransitions;
        prefsPanelStyleRow1.appendChild(prefsPanelThemeLabel);
        prefsPanelStyleRow1.appendChild(prefsPanelTheme);
        prefsPanelStyleRow3.appendChild(prefsPanelFontSizeLabel);
        prefsPanelStyleRow3.appendChild(prefsPanelFontSize);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableTransitionsLabel);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableTransitions);
        tableDiv.appendChild(prefsPanelStyleRow1);
        tableDiv.appendChild(prefsPanelStyleRow3);
        tableDiv.appendChild(prefsPanelStyleRow4);
        prefsList.appendChild(prefsListUL);
        prefsPanelForm.appendChild(prefsList);
        prefsPanelForm.appendChild(prefsContent);
        prefsPanelSave.innerHTML = "Save";
        prefsPanelForm.appendChild(prefsPanelSave);
        prefsPanel.appendChild(prefsPanelForm);
        goDiv.appendChild(prefsPanel); // Doesn't really matter where it goes
        go.User.preference("Gate One", tableDiv);
        prefsPanelForm.onsubmit = function(e) {
            e.preventDefault(); // Don't actually submit
            var theme = u.getNode('#'+prefix+'prefs_theme').value,
                fontSize = u.getNode('#'+prefix+'prefs_fontsize').value,
                disableTransitions = u.getNode('#'+prefix+'prefs_disabletrans').checked;
            // Grab the form values and set them in prefs
            if (theme != go.prefs.theme) {
                // Start using the new CSS theme
                u.loadTheme(theme);
                // Save the user's choice
                go.prefs.theme = theme;
            }
            if (fontSize) {
                var scale = null,
                    translateY = null;
                go.prefs.fontSize = fontSize;
                goDiv.style['fontSize'] = fontSize;
                // Also adjust the toolbar size to match the font size
                if (fontSize.indexOf('%') != -1) {
                    // The given font size is in a percent, convert to em so we can scale properly
                    scale = parseFloat(fontSize.substring(0, fontSize.length-1)) / 100;
                } else if (fontSize.indexOf('em') != -1) {
                    // The given font size is in em.  Strip the 'em' and set it as our scale
                    scale = parseFloat(fontSize.substring(0, fontSize.length-2));
                } else {
                    // px, cm, in, etc etc aren't supported (yet)
                    ;;
                }
                if (scale) {
                    translateY = ((100 * scale) - 100) / 2; // translateY needs to be in % (one half of scale)
                    go.Visual.applyTransform(toolbar, 'translateY('+translateY+'%) scale('+scale+')');
                }
            }
            if (disableTransitions) {
                var newStyle = u.createElement('style', {'id': 'disable_transitions'});
                newStyle.innerHTML = ".✈workspace {-webkit-transition: none; -moz-transition: none; -ms-transition: none; -o-transition: none; transition: none;}";
                u.getNode(goDiv).appendChild(newStyle);
                go.prefs.disableTransitions = true;
            } else {
                var existing = u.getNode('#'+prefix+'disable_transitions');
                if (existing) {
                    u.removeElement(existing);
                }
                go.prefs.disableTransitions = false;
            }
            E.trigger("go:save_prefs");
            // savePrefsCallbacks is DEPRECATED.  Use GateOne.Events.on("go:save_prefs", yourFunc) instead
            if (go.savePrefsCallbacks.length) {
                // Call any registered prefs callbacks
                go.savePrefsCallbacks.forEach(function(callback) {
                    callback();
                });
            }
            u.savePrefs();
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
            var scale = null,
                translateY = null;
            goDiv.style['fontSize'] = go.prefs.fontSize;
            // Also adjust the toolbar size to match the font size
            if (go.prefs.fontSize.indexOf('%') != -1) {
                // The given font size is in a percent, convert to em so we can scale properly
                scale = parseFloat(go.prefs.fontSize.substring(0, go.prefs.fontSize.length-1)) / 100;
            } else if (go.prefs.fontSize.indexOf('em') != -1) {
                // The given font size is in em.  Strip the 'em' and set it as our scale
                scale = parseFloat(go.prefs.fontSize.substring(0, go.prefs.fontSize.length-2))
            } else {
                // px, cm, in, etc etc aren't supported (yet)
                ;;
            }
            if (scale) {
                translateY = ((100 * scale) - 100) / 2; // translateY needs to be in % (one half of scale)
                go.Visual.applyTransform(toolbar, 'translateY('+translateY+'%) scale('+scale+')');
            }
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
        // Create the workspace grid if not in embedded mode
        if (!go.prefs.embedded) { // Only create the grid if we're not in embedded mode (where everything must be explicit)
            var gridwrapper = u.getNode('#'+prefix+'gridwrapper');
            // Create the grid if it isn't already present
            if (!gridwrapper) {
                gridwrapper = go.Visual.createGrid('gridwrapper');
                goDiv.appendChild(gridwrapper);
                var style = window.getComputedStyle(goDiv, null),
                    adjust = 0,
                    paddingRight = (style['padding-right'] || style['paddingRight']);
                if (paddingRight) {
                    adjust = parseInt(paddingRight.split('px')[0]);
                }
                var gridWidth = (go.Visual.goDimensions.w+adjust) * 2;
                gridwrapper.style.width = gridWidth + 'px';
            }
        }
        // Setup a callback that updates the CSS options whenever the panel is opened (so the user doesn't have to reload the page when the server has new CSS files).
        go.Events.on("go:panel_toggle:in", updateCSSfunc);
        // Make sure the gridwrapper is the proper width for 2 columns
        go.Visual.updateDimensions();
        // This calls plugins init() and postInit() functions:
        u.runPostInit();
        // Even though panels may start out at 'scale(0)' this makes sure they're all display:none as well to prevent them from messing with people's ability to tab between fields
        go.Visual.togglePanel(); // Scales them all away
        document.addEventListener(visibilityChange, go.Input.handleVisibility, false);
//         goDiv.addEventListener('blur', function(e) {
//             setTimeout(function() {
//                 console.log('goDiv blur: ' + document.activeElement.id);
//                 // NOTE:  This is wrapped in a timeout because--for whatever reason--document.body will be the activeElement at the beginning of onmouseup (always!).
//                 if (!u.isDescendant(go.node, document.activeElement)) {
//                     go.Visual.enableOverlay();
//                 }
//             }, 100);
//         }, false);
//         goDiv.addEventListener('focus', go.Visual.disableOverlay, false);
        go.initialized = true;
        go.Events.trigger("go:initialized");
        setTimeout(function() {
            // Make sure all the panels have their style set to 'display:none' to prevent their form elements from gaining focus when the user presses the tab key (only matters when a dialog or other panel is open)
            u.hideElements('.✈panel');
        }, 500);
    }
});

// Apply some universal defaults
if (!localStorage[GateOne.prefs.prefix+GateOne.location+'_selectedWorkspace']) {
    localStorage[GateOne.prefs.prefix+GateOne.location+'_selectedWorkspace'] = 1;
}

// GateOne.Utils (generic utility functions)
GateOne.Base.module(GateOne, "Utils", "1.2", ['Base']);
GateOne.Utils.benchmark = null; // Used in conjunction with the startBenchmark and stopBenchmark functions
GateOne.Utils.benchmarkCount = 0; // Ditto
GateOne.Utils.benchmarkTotal = 0; // Ditto
GateOne.Utils.benchmarkAvg = 0; // Ditto
GateOne.Utils.failedRequirementsCounter = {}; // Used by loadJSAction() to keep track of how long a JS file has been waiting for a dependency
GateOne.Base.update(GateOne.Utils, {
    init: function() {
        go.Net.addAction('go:save_file', go.Utils.saveAsAction);
        go.Net.addAction('go:load_style', go.Utils.loadStyleAction);
        // Commented this out since it wasn't working out but may be useful in the future
        go.Net.addAction('go:load_js', go.Utils.loadJSAction);
        go.Net.addAction('go:themes_list', go.Utils.enumerateThemes);
    },
    // startBenchmark and stopBenchmark can be used to test the performance of various functions and code...
    startBenchmark: function() {
        // Put GateOne.Utils.startBenchmark() at the top of any function you want to benchmark (to see how long it takes)
        GateOne.Utils.benchmark = new Date().getTime();
    },
    stopBenchmark: function(msg) {
        // Put GateOne.Utils.stopBenchmark('optional descriptive message') at the bottom of any function where you've called startBenchmark()
        // It will report how long it took to run the code between startBenchmark() and stopBenchmark() along with a running total of all benchmarks.
        var u = GateOne.Utils,
            date2 = new Date(),
            diff =  date2.getTime() - u.benchmark;
        if (!u.benchmark) {
            logInfo(msg + ": Nothing to report: startBenchmark() has yet to be run.");
            return;
        }
        u.benchmarkCount += 1;
        u.benchmarkTotal += diff;
        u.benchmarkAvg = Math.round(u.benchmarkTotal/u.benchmarkCount);
        logInfo(msg + ": " + diff + "ms" + ", total: " + u.benchmarkTotal + "ms, Average: " + u.benchmarkAvg);
    },
    getNode: function(nodeOrSelector) {
        // Given a CSS query selector (string, e.g. '#someid') or node (in case we're not sure), lookup the node using document.querySelector() and return it.
        // NOTE: The benefit of this over just querySelector() is that if it is given a node it will just return the node as-is (so functions can accept both without having to worry about such things).  See removeElement() below for a good example.
        var u = GateOne.Utils;
        if (typeof(nodeOrSelector) == 'string') {
            var result = document.querySelector(nodeOrSelector);
            return result;
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
        var u = GateOne.Utils,
            node = u.getNode(elem);
        node.style.display = 'block';
        node.className = node.className.replace(/(?:^|\s)✈go_none(?!\S)/, '');
    },
    hideElement: function(elem) {
        // Sets the 'display' style of the given element to 'none'
        var u = GateOne.Utils,
            node = u.getNode(elem);
        node.style.display = 'none';
        if (node.className.indexOf('✈go_none') == -1) {
            node.className += " ✈go_none";
        }
    },
    showElements: function(elems) {
        // Sets the 'display' style of the given elements to 'block' (which undoes setting it to 'none').
        // Elements must be an iterable (or a querySelectorAll string) such as an HTMLCollection or an Array of DOM nodes
        var u = GateOne.Utils,
            elems = u.toArray(u.getNodes(elems));
        elems.forEach(function(elem) {
            var node = u.getNode(elem);
            node.style.display = ''; // Reset
            node.className = node.className.replace(/(?:^|\s)✈go_none(?!\S)/, '');
        });
    },
    hideElements: function(elems) {
        /**:GateOne.Utils.hideElements(elems)

        Sets the 'display' style of the given elements (*elems*) to 'none'.  Elements must be an iterable such as an HTMLCollection, NodeList, or an Array of DOM nodes
        */
        var u = GateOne.Utils,
            elems = u.toArray(u.getNodes(elems));
        elems.forEach(function(elem) {
            var node = u.getNode(elem);
            node.style.display = 'none';
            if (node.className.indexOf('✈go_none') == -1) {
                node.className += " ✈go_none";
            }
        });
    },
    getOffset: function(elem) {
        /**:GateOne.Utils.getOffset(elem)

        Returns `{top: <offsetTop>, left: <offsetLeft>}` for the given *elem*.
        */
        var node = GateOne.Utils.getNode(elem), x = 0, y = 0;
        while( node && !isNaN( node.offsetLeft ) && !isNaN( node.offsetTop ) ) {
            x += node.offsetLeft - node.scrollLeft;
            y += node.offsetTop - node.scrollTop;
            node = node.offsetParent;
        }
        return { top: y, left: x };
    },
    noop: function(a) {
        /**:GateOne.Utils.noop(a)

        This function does nothing.  It stands for 'no operation'.  Useful as a placeholder for objects and variables that will later be replaced with functions that actually do something.

        Returns *a*.
        */
        return a;
    },
    toArray: function (obj) {
        /**:GateOne.Utils.toArray(obj)

        Returns *obj* as a JavaScript array.  Primarily used to make it easier to iterate/manipulate things like NodeLists.
        */
        var array = [];
        // Iterate backwards ensuring that length is an UInt32
        for (var i = obj.length >>> 0; i--;) {
            array[i] = obj[i];
        }
        return array;
    },
    scrollLines: function(elem, lines) {
        /**:GateOne.Utils.scrollLines(elem, lines)

        Scrolls the given element (*elem*) by *lines* (positive or negative).
        */
        // Lines are calculated based on the EM height of text in the element.
        logDebug('scrollLines(' + elem + ', ' + lines + ')');
        var node = GateOne.Utils.getNode(elem),
            emDimensions = GateOne.Utils.getEmDimensions(elem);
        node.scrollTop = node.scrollTop + (emDimensions.h * lines);
    },
    scrollToBottom: function(elem) {
        /**:GateOne.Utils.scrollToBottom(elem)

        Scrolls to the bottom of *elem*.
        */
        var node = GateOne.Utils.getNode(elem);
        try {
            if (node) {
                if (node.scrollTop != node.scrollHeight) {
                    node.scrollTop = node.scrollHeight;
                }
            }
        } catch (e) {
            // *elem* was probably removed or hasn't come up yet.  Ignore
        } finally {
            node = null;
        }
    },
    replaceURLWithHTMLLinks: function(text) {
        /**:GateOne.Utils.replaceURLWithHTMLLinks(text)

        Returns *text* with embedded links (e.g. http://whatever) converted into anchor tags (e.g. <a href="http://whatever">http://whatever</a>).
        */
        var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(exp,"<a href='$1'>$1</a>");
    },
    isEven: function(someNumber){
        /**:GateOne.Utils.isEven(someNumber)

        Returns `true` if *someNumber* is even.
        */
        return (someNumber%2 == 0) ? true : false;
    },
    isDescendant: function(parent, child) {
        /**:GateOne.Utils.isDescendant(parent, child)

        Returns true if *child* is a descendent of *parent* (in the DOM).
        */
        var node = child.parentNode;
        while (node != null) {
            if (node == parent) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    },
    getSelText: function() {
        /**:GateOne.Utils.getSelText()

        Returns whatever text is currently selected in the browser.
        */
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
    prevEmDimensions: {'w': 7, 'h': 13}, // Used if something goes wrong doing the calculation.  These are just reasonable defaults that will be overwritten
    getEmDimensions: function(elem, /*opt*/where) {
        /**:GateOne.Utils.getEmDimensions(elem[, where])

        Returns the pixel height and width of a full character block inside the given elem (e.g. 'term1_pre').  The returned object will be in the form of::

             {'w': <width in px>, 'h': <height in px>}

        If *where* (element) is given, the EM dimensions calculation will be based on what sizes would apply if the given *elem* were placed inside *where*.
        */
//         logDebug('getEmDimensions('+elem+', id: '+elem.id+')');
        var u = GateOne.Utils,
            node = u.getNode(elem),
            parent = node.parentNode,
            node = node.cloneNode(false), // Work on a clone so we can leave the original alone
            sizingPre = document.createElement("pre"),
            fillerX = '', fillerY = [],
            lineCounter = 0;
        if (!node.style) { // This can happen if the user clicks back and forth really quickly in the middle of running this function
            return u.prevEmDimensions;
        }
        try {
            // We need to place the cloned node into the DOM for the calculation to work properly
            node.id = 'sizingNode';
            if (where) {
                where = u.getNode(where);
                where.appendChild(node);
            } else {
                document.body.appendChild(node);
            }
            if (!u.isVisible(node)) {
                // Reset so it is visible
                node.style.display = '';
                node.style.opacity = 1;
            }
            node.className = "✈terminal";
            // We need a number of lines so we can factor in the line height and character spacing (if it has been messed with either directly or indirectly via the font renderer).
            for (var i=0; i <= 63; i++) {
                fillerX += "\u2588"; // Fill it with a single character (this is a unicode "full block": █).  NOTE: Using the \u syntax because some minifiers break when they encounter unicode literals (besides, it can be tough to guess the encoding of a JavaScript file with no HTTP encoding header)
            }
            for (var i=0; i <= 63; i++) {
                fillerY.push(fillerX);
            }
            sizingPre.innerHTML = fillerY.join('\n');
            // Set the attributes of our copy to reflect a minimal-size block element
            node.style.position = 'fixed';
            node.style.top = 0;
            node.style.left = 0;
            node.style.bottom = 'auto';
            node.style.right = 'auto';
            node.style.width = 'auto';
            node.style.height = 'auto';
            sizingPre.style.position = 'absolute';
            sizingPre.style.top = 0;
            sizingPre.style.left = 0;
            sizingPre.style.bottom = 'auto';
            sizingPre.style.right = 'auto';
            sizingPre.style.width = 'auto';
            sizingPre.style.height = 'auto';
            sizingPre.style['white-space'] = 'pre'; // Without this the size calculation will be off
            // Add in our sizingDiv and grab its height
            node.appendChild(sizingPre);
            var nodeHeight = sizingPre.getClientRects()[0].height,
                nodeWidth = sizingPre.getClientRects()[0].width;
            nodeHeight = parseInt(nodeHeight)/64;
            nodeWidth = parseInt(nodeWidth)/64;
            // Clean up, clean up
            node.removeChild(sizingPre);
            if (where) {
                where.removeChild(node);
            } else {
                document.body.removeChild(node);
            }
            u.prevEmDimensions = {'w': nodeWidth, 'h': nodeHeight};
        } catch(e) {
            logError("Error getting em dimensions: " + e);
            // Cleanup
            if (where) {
                where.removeChild(node);
            } else {
                document.body.removeChild(node);
            }
        }
        return u.prevEmDimensions;
    },
    getRowsAndColumns: function(elem) {
        /**:GateOne.Utils.getRowsAndColumns(elem)

        Calculates and returns the number of text rows and colunmns that will fit in the given element ID (elem).

        **Important:**  *elem* must be a basic block element such as DIV, SPAN, P, PRE, etc.  Elements that require sub-elements such as TABLE (requires TRs and TDs) probably won't work.

        .. note::  This function only works properly with monospaced fonts but it does work with high-resolution displays (so users with properly-configured high-DPI displays will be happy =). Other similar functions on the web have hard-coded pixel widths for known fonts at certain point sizes.  These break on any display with a resolution higher than 96dpi.
        */
//         logDebug('getRowsAndColumns('+elem+')');
        var u = go.Utils,
            node = u.getNode(elem),
            elementDimensions = {
                h: node.clientHeight,
                w: node.clientWidth
            },
            textDimensions = u.getEmDimensions(elem, go.node);
        if (!u.isVisible(node)) {
            node = node.cloneNode(false); // Work on a clone so we can leave the original alone
            // Reset so it is visible
            node.style.display = '';
            node.style.opacity = 1;
            go.node.appendChild(node, true);
            elementDimensions = {
                h: node.clientHeight,
                w: node.clientWidth
            },
            textDimensions = u.getEmDimensions(elem, go.node);
            go.node.removeChild(node);
        }
        if (!textDimensions) {
            return; // Nothing to do
        }
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
    runPostInit: function() {
        /**GateOne.Utils.runPostInit()

        Called after all the plugins have been loaded; calls each plugin's init() and postInit() functions.
        */
        // NOTE: Probably don't need a preInit() since modules can just put stuff inside their main .js for that.  If you can think of a use case let me know and I'll add it.
        // Go through all our loaded modules and run their init functions (if any)
        logDebug("Running runPostInit()");
        go.loadedModules.forEach(function(module) {
            var moduleObj = eval(module);
            if (go.initializedModules.indexOf(moduleObj.__name__) == -1) {
                logDebug('Running: ' + moduleObj.__name__ + '.init()');
                if (typeof(moduleObj.init) == "function") {
                    moduleObj.init();
                }
                if (moduleObj.__appinfo__) {
                    // This is an application
                    go.loadedApplications[moduleObj.__appinfo__.name] = moduleObj;
                }
                go.initializedModules.push(moduleObj.__name__);
            }
        });
        // Go through all our loaded modules and run their postInit functions (if any)
        go.loadedModules.forEach(function(module) {
            var moduleObj = eval(module);
            if (go.initializedModules.indexOf(moduleObj.__name__) == -1) {
                logDebug('Running: ' + moduleObj.__name__ + '.postInit()');
                if (typeof(moduleObj.postInit) == "function") {
                    moduleObj.postInit();
                }
            }
        });
    },
    loadJSAction: function(message, /*opt*/noCache) {
        /**:GateOne.Utils.loadJSAction(message)

        Loads a JavaScript file sent via the 'load_js' WebSocket action into a <script> tag inside of GateOne.prefs.goDiv (not that it matters where it goes).  To request that a .js file be loaded from the Gate One server one can use the following::

            >>> GateOne.ws.send(JSON.stringify({'go:get_js': 'some_script.js'}));
            >>> // NOTE: some_script.js can reside in Gate One's /static directory or any plugin's /static directory.
            >>> // Plugin .js files take precedence.

        If *message['cache']* is `false` or *noCache* is true, will not update the fileCache database with this incoming file.
        */
        logDebug('loadJSAction()');
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            requires = false,
            existing, s;
        if (message['result'] == 'Success') {
            if (message['requires']) {
                message['requires'].forEach(function(requiredFile) {
                    if (!go.Storage.loadedFiles[requiredFile]) {
                        requires = true;
                    }
                });
            }
            if (requires) {
                setTimeout(function() {
                    if (u.failedRequirementsCounter[message['filename']] >= 20) { // ~2 seconds
                        // Give up
                        logError("Failed to load " + message['filename'] + ".  Took too long waiting for " + message['requires']);
                        return;
                    }
                    // Try again in a moment or so
                    u.loadJSAction(message, noCache);
                    u.failedRequirementsCounter[message['filename']] += 1;
                }, 100);
                return;
            } else {
                logDebug("Dependency loaded!");
            }
            if (message['element_id']) {
                existing = u.getNode('#'+prefix+message['element_id']);
                s = u.createElement('script', {'id': message['element_id']});
            } else {
                var elementID = message['filename'].replace(/\./g, '_'); // Element IDs with dots are a no-no.
                existing = u.getNode('#'+prefix+elementID);
                s = u.createElement('script', {'id': elementID});
            }
            s.innerHTML = message['data'];
            if (existing) {
                existing.innerHTML = message['data'];
            } else {
                go.node.appendChild(s);
            }
            delete message['result'];
            if (noCache === undefined && message['cache'] != false) {
                go.Storage.cacheJS(message, 'js');
            } else if (message['cache'] == false) {
                // Cleanup the existing entry if present
                go.Storage.uncacheJS(message, 'js');
            }
            go.Storage.loadedFiles[message['filename']] = true;
            // Don't call runPostInit() until we're done loading all JavaScript
            if (u.postInitDebounce) {
                clearTimeout(u.postInitDebounce);
                u.postInitDebounce = null;
            }
            // If this JS file requires no depdendencies call its init() and postInit() functions right away
            if (!message['requires']) {
                logDebug("Loading " + message['filename'] + " immediately because it has no dependencies.");
                u.runPostInit();
            }
            u.postInitDebounce = setTimeout(function() {
                u.runPostInit(); // Calls any init() and postInit() functions in the loaded JS.
                go.Events.trigger("go:js_loaded");
            }, 500); // This is hopefully fast enough to be nearly instantaneous to the user but also long enough for the biggest script to be loaded.
            // NOTE:  runPostInit() will *not* re-run init() and postInit() functions if they've already been run once.  Even if the script is being replaced/updated.
        }
    },
    loadStyleAction: function(message, /*opt*/noCache) {
        /**:GateOne.Utils.loadStyleAction(message)

        Loads various kinds of stylesheets sent via the 'go:load_style' WebSocket action.  These stylesheets would be a, 'theme', 'colors', 'plugins', 'print', or 'css' (generic).

        If *message['cache']* is `false` or *noCache* is true, will not update the fileCache database with this incoming file.
        */
        logDebug("loadStyleAction()");
        var u = go.Utils,
            prefix = go.prefs.prefix;
        if (message['result'] == 'Success') {
            // This is for handling any given CSS file
            if (message['css']) {
                if (message['data'].length) {
                    var stylesheet, existing, themeStyle = u.getNode('#'+prefix+'theme'),
                        media = message['media'] || 'screen';
                    if (message['element_id']) {
                        // Use the element ID that was provided
                        existing = u.getNode('#'+prefix+message['element_id']);
                        stylesheet = u.createElement('style', {'id': message['element_id'], 'rel': 'stylesheet', 'type': 'text/css', 'media': media});
                    } else {
                        existing = u.getNode('#'+prefix+message['filename']+"_css");
                        stylesheet = u.createElement('style', {'id': message['filename']+"_css", 'rel': 'stylesheet', 'type': 'text/css', 'media': media});
                    }
                    stylesheet.textContent = message['data'];
                    if (existing) {
                        existing.textContent = message['data'];
                    } else {
                        u.getNode("head").insertBefore(stylesheet, themeStyle);
                    }
                }
            }
        }
        delete message['result'];
        if (noCache === undefined && message['cache'] != false) {
            go.Storage.cacheStyle(message, message['kind']);
        } else if (message['cache'] == false) {
            // Cleanup the existing entry if present
            go.Storage.uncacheStyle(message, message['kind']);
        }
        go.Storage.loadedFiles[message['filename']] = true;
        go.Visual.updateDimensions(); // In case the styles changed the size of text
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
    loadTheme: function(theme) {
        /**:GateOne.Utils.loadTheme(theme)

        Tells the server to perform a sync of the given *theme* with the client.
        */
        var u = go.Utils,
            container = go.prefs.goDiv.split('#')[1];
        go.ws.send(JSON.stringify({'go:get_theme': {'go_url': go.prefs.url, 'container': container, 'prefix': go.prefs.prefix, 'theme': theme}}));
    },
    loadPluginCSS: function() {
        // Tells the Gate One server to send all the plugin CSS files to the client.
        var u = go.Utils,
            container = go.prefs.goDiv.split('#')[1];
        go.ws.send(JSON.stringify({'go:get_style': {'go_url': go.prefs.url, 'container': container, 'prefix': go.prefs.prefix, 'plugins': true}}));
    },
    loadScriptError: function(scriptTag, url, callback) {
        /**:GateOne.Utils.loadScriptError(url, scriptTag, callback)

        Called when :js:meth:`GateOne.Utils.loadScript` fails to load the .js file at the given *url*.  Under the assumption that the user has yet to accept the Gate One server's SSL certificate, it will pop-up an alert that instructs the user they will be redirected to a page where they can accept Gate One's SSL certificate (when they click OK).
        */
        var u = go.Utils,
            acceptURL = go.prefs.url + 'static/accept_certificate.html',
            okCallback = function() {
                // Called when the user clicks OK
                u.acceptWindow = window.open(acceptURL, 'accept');
                u.windowChecker = setInterval(function() {
                    if (u.acceptWindow.closed) {
                        // Re-proceed
                        u.removeElement(scriptTag);
                        u.loadScript(url, callback);
                        clearInterval(u.windowChecker);
                    }
                }, 100);
            };
        // Redirect the user to a page where they can accept the SSL certificate (it will redirect back)
        GateOne.Visual.alert("JavaScript Load Error", "This can happen if you haven't accepted Gate One's SSL certificate yet.  Click OK to open a new tab/window where you can accept the Gate One server's SSL certificate.  If the page doesn't load it means the Gate One server is currently unavailable.", okCallback);
    },
    loadScript: function(url, callback){
        // Imports the given JS *url*
        // If *callback* is given, it will be called in the onload() event handler for the script
        var u = GateOne.Utils,
            self = this,
            tag = document.createElement("script");
        tag.type="text/javascript";
        tag.src = url;
        if (callback) {
            tag.onload = function() {
                callback();
            }
        }
        document.body.appendChild(tag);
        setTimeout(function() {
            // If the URL doesn't load within 5 seconds assume it is an SSL certificate issue
            u.loadScriptError(tag, url, callback);
        }, 5000);
    },
    enumerateThemes: function(messageObj) {
        /**:GateOne.Utils.enumerateThemes(messageObj)

        Attached to the 'go:themes_list' WebSocket action; updates the preferences panel with the list of themes stored on the server.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            themesList = messageObj['themes'],
            prefsThemeSelect = u.getNode('#'+prefix+'prefs_theme');
        prefsThemeSelect.options.length = 0;
        for (var i in themesList) {
            prefsThemeSelect.add(new Option(themesList[i], themesList[i]), null);
            if (go.prefs.theme == themesList[i]) {
                prefsThemeSelect.selectedIndex = i;
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
                ;; // Don't save it
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
    getCookie: function(name) {
        /**:GateOne.Utils.getCookie(name)

            Returns the cookie of the given *name*
        */
        var i,x,y,ARRcookies=document.cookie.split(";");
        for (i=0;i<ARRcookies.length;i++) {
            x=ARRcookies[i].substr(0,ARRcookies[i].indexOf("="));
            y=ARRcookies[i].substr(ARRcookies[i].indexOf("=")+1);
            x=x.replace(/^\s+|\s+$/g,"");
            if (x==name) {
                return unescape(y);
            }
        }
    },
    setCookie: function(name, value, days) {
        /**:GateOne.Utils.setCookie(name, value, days)

            Sets the cookie of the given *name* to the given *value* with the given number of expiration *days*.
        */
        var exdate=new Date();
        exdate.setDate(exdate.getDate() + days);
        var c_value=escape(value) + ((days==null) ? "" : "; expires=" + exdate.toUTCString());
        document.cookie=name + "=" + c_value;
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
    randomString: function(length, chars) {
        // Returns a random string of the given *length* using the given *chars*.
        // If *chars* is not given it will use ASCII alphanumerics (lower case)
        var result = '';
        if (!chars) {
            chars = "1234567890abcdefghijklmnopqrstuvwxyz";
        }
        for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
        return result;
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
            var blob = u.createBlob(message['data'], mimetype);
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
        return document.hidden || document.msHidden || document.webkitHidden || document.mozHidden;
    },
    createBlob: function(array, mimetype) {
        // Returns a Blob constructed from the data in *array* of the given *mimetype*.  *array* may be passed as a string; it will be automatically wrapped in an array.
        // If *mimetype* is omitted it will be set to 'text/plain'.
        // NOTE:  The point of this function is favor the Blob function while maintaining backwards-compatibility with the deprecated BlobBuilder interface (for browsers that don't support Blob() yet).
        if (typeof(array) == 'string') {
            array = [array]; // Convert to actual array
        }
        if (!mimetype) {
            // Use text/plain by default
            mimetype = 'text/plain';
        }
        // Prefer Blob()
        if (Blob) {
            return new Blob(array, {'type': mimetype});
        } else { // Fall back to BlobBuilder
            var bb = new BlobBuilder();
            bb.push.apply(bb, array)
            return bb.getBlob(mimetype);
        }
    },
    rtrim: function(string) {
        // Returns *string* minus right-hand whitespace
        return string.replace(/\s+$/,"");
    },
    ltrim: function(string) {
        // Returns *string* minus left-hand whitespace
        return string.replace(/^\s+/,"");
    },
    stripHTML: function(html) {
        // Returns the contents of *html* minus the HTML
        var tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent||tmp.innerText;
    },
    isVisible: function(elem) {
        // Returns true if *elem* is visible (checks parent nodes recursively too).  *elem* may be a DOM node or a selector string.
        // NOTE: Relies on checking elem.style.opacity and elem.style.display.  Does NOT check transforms.
        var node = GateOne.Utils.getNode(elem), style;
        if (!node) {
            return false;
        }
        if (node === document) {
            return true;
        }
        style = window.getComputedStyle(node, null);
        if (style && style.display == 'none') {
            return false;
        } else if (style && parseInt(style.opacity) == 0) {
            return false;
        }
        if (node.parentNode) {
            return GateOne.Utils.isVisible(node.parentNode);
        } else {
            return true;
        }
    },
    humanReadableBytes: function(bytes, /*opt*/precision) {
        // Returns *bytes* as a human-readable string in a similar fashion to how it would be displayed by 'ls -lh' or 'df -h'.
        // If *precision* (integer) is given, it will be used to determine the number of decimal points to use when rounding.  Otherwise it will default to 0
        var sizes = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'],
            postfix = 0;
        bytes = parseInt(bytes); // Just in case we get passed *bytes* as a string
        if (!precision) {
            precision = 0;
        }
        if (bytes == 0) return 'n/a';
        if (bytes > 1024) {
            while( bytes >= 1024 ) {
                postfix++;
                bytes = bytes / 1024;
            }
            return bytes.toFixed(precision) + sizes[postfix];
        } else {
            // Just return the bytes as-is (as a string)
            return bytes + "";
        }
    },
    getQueryVariable: function(variable, /*opt*/url) {
        /**:GateOne.Utils.getQueryVariable(variable[, url])

        Returns the value of a query string variable from :js:attr:`window.location`.

        If no matching variable is found, returns undefined.  Example::

            > // Assume window.location.href = 'https://gateone/?foo=bar,bar,bar'
            > GateOne.Utils.getQueryVariable('foo');
            'bar,bar,bar'
            >

        Optionally, a *url* may be specified to perform the same evaluation on *url* insead of :js:attr:`window.location`.
        */
        var query = window.location.search.substring(1), vars;
        if (url) {
            query = url.split('?').slice(1).join('?'); // Removes the leading URL up to the first question mark (preserving extra question marks)
        }
        vars = query.split('&');
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split('=');
            if (decodeURIComponent(pair[0]) == variable) {
                return decodeURIComponent(pair[1]);
            }
        }
    },
    removeQueryVariable: function(variable) {
        /**:GateOne.Utils.removeQueryVariable(variable)

        Removes the given query string variable from window.location.href using window.history.replaceState().  Leaving all other query string variables alone.

        Returns the new query string.
        */
        var query = window.location.search.substring(1),
            vars = query.split('&'),
            newVars = {},
            newString = "?";
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split('=');
            if (decodeURIComponent(pair[0]) != variable) {
                newVars[pair[0]] = pair[1];
            }
        }
        // Now turn everything back into a query string and replace the current location
        for (var i in newVars) {
            newString += i + '=' + newVars[i] + '&';
        }
        // Remove the trailing &
        newString = newString.substring(0, newString.length - 1);
        window.history.replaceState("Replace", "Page Title", "/" + newString);
        return newString;
    },
    last: function(iterable, n, guard) {
        /**:GateOne.Utils.last(iterable, n, guard)

        Returns the last element of the given *iterable*.

        If *n* is given it will return the last N values in the array.  Example::

            >>> GateOne.Utils.last("foobar", 3);
            ["b", "a", "r"]

        The *guard* variable is there so it will work with :js:meth:`Array.prototype.map`.
        */
        if (iterable == null) return void 0;
        if ((n != null) && !guard) {
            return Array.prototype.slice.call(iterable, Math.max(iterable.length - n, 0));
        } else {
            return iterable.slice(-1)[0];
        }
    },
    insertAfter: function(newElement, targetElement) {
        /**:GateOne.Utils.insertAfter(newElement, targetElement)

        The opposite of the DOM's built in `insertBefore()` function; inserts the given *newElement* after *targetElement*.

        *targetElement* may be given as a pre-constructed node object or a querySelector-like string.
        */
        var targetElement = GateOne.Utils.getNode(targetElement),
            parent = targetElement.parentNode;
        if (parent.lastchild == targetElement) {
            parent.appendChild(newElement);
        } else {
            parent.insertBefore(newElement, targetElement.nextSibling);
        }
}
});

// GateOne.Logging
GateOne.Base.module(GateOne, "Logging", '1.1', ['Base']);
GateOne.Logging.levels = {
    // Forward and backward
    50: 'FATAL',
    40: 'ERROR',
    30: 'WARNING',
    20: 'INFO',
    10: 'DEBUG',
    'FATAL': 50,
    'ERROR': 40,
    'WARNING': 30,
    'INFO': 20,
    'DEBUG': 10
};
GateOne.noSavePrefs['logLevel'] = null; // This ensures that the logging level isn't saved along with everything else if the user clicks "Save" in the settings panel
GateOne.Base.update(GateOne.Logging, {
    init: function() {
        if (typeof(GateOne.prefs.logLevel) == "undefined") {
            GateOne.prefs.logLevel = 'INFO';
        }
        GateOne.Logging.level = GateOne.prefs.logLevel.toUpperCase(); // This allows it to be adjusted at the client
        // Initialize the logger
        if (typeof(GateOne.Logging.level) == 'string') {
            // Convert to integer
            GateOne.Logging.level = GateOne.Logging.levels[GateOne.Logging.level.toUpperCase()];
        }
    },
    setLevel: function(level) {
        /**:GateOne.Logging.setLevel(level)

        Sets the log *level* to an integer if the given a string (e.g. "DEBUG").  Sets it as-is if it's already a number.
        */
        var l = GateOne.Logging,
            levelStr = null;
        if (level === parseInt(level,10)) { // It's an integer, set it as-is
            l.level = level;
        } else { // It's a string, convert it first
            levelStr = level.toUpperCase();
            level = l.levels[levelStr]; // Get integer
            l.level = level;
        }
    },
    logToConsole: function (msg, /*opt*/level) {
        /**:GateOne.Logging.logToConsole(msg, level)

        Logs the given *msg* to the browser's JavaScript console.  If *level* is provided it will attempt to use the appropriate console logger (e.g. console.warn()).

        .. note:: Original version of this function is from: `MochiKit.Logging.Logger.prototype.logToConsole`.
        */
        if (typeof(window) != "undefined" && window.console && window.console.log) {
            // Safari and FireBug 0.4
            // Percent replacement is a workaround for cute Safari crashing bug
            msg = msg.replace(/%/g, '\uFF05');
            if (!level) {
                window.console.log(msg);
                return;
            } else if (level == 'ERROR' || level == 'FATAL') {
                if (typeof(window.console.error) == "function") {
                    window.console.error(msg);
                    return;
                }
            } else if (level == 'WARN') {
                if (typeof(window.console.warn) == "function") {
                    window.console.warn(msg);
                    return;
                }
            } else if (level == 'DEBUG') {
                if (typeof(window.console.debug) == "function") {
                    window.console.debug(msg);
                    return;
                }
            } else if (level == 'INFO') {
                if (typeof(window.console.info) == "function") {
                    window.console.info(msg);
                    return;
                }
            }
            // Fallback to default
            window.console.warn(msg);
        } else if (typeof(opera) != "undefined" && opera.postError) {
            // Opera
            opera.postError(msg);
        } else if (typeof(Debug) != "undefined" && Debug.writeln) {
            // IE Web Development Helper (?)
            // http://www.nikhilk.net/Entry.aspx?id=93
            Debug.writeln(msg);
        } else if (typeof(debug) != "undefined" && debug.trace) {
            // Atlas framework (?)
            // http://www.nikhilk.net/Entry.aspx?id=93
            debug.trace(msg);
        }
    },
    log: function(msg, level, destination) {
        /**:GateOne.Logging.log(msg, level, destination)

        Logs the given *msg* using all of the functions in `GateOne.Logging.destinations` after being prepended with the date and a string indicating the log level (e.g. "692011-10-25 10:04:28 INFO <msg>") if *level* is determined to be greater than the value of `GateOne.Logging.level`.  If the given *level* is not greater than `GateOne.Logging.level` *msg* will be discarded (noop).

        *level* can be provided as a string, an integer, null, or be left undefined:

             If an integer, an attempt will be made to convert it to a string using GateOne.Logging.levels but if this fails it will use "lvl:<integer>" as the level string.
             If a string, an attempt will be made to obtain an integer value using GateOne.Logging.levels otherwise GateOne.Logging.level will be used (to determine whether or not the message should actually be logged).
             If undefined, the level will be set to GateOne.Logging.level.
             If null (as opposed to undefined), level info will not be included in the log message.

        If *destination* is given (must be a function) it will be used to log messages like so: `destination(message, levelStr)`.  The usual conversion of *msg* to *message* will apply.
        */
        var l = GateOne.Logging,
            now = new Date(),
            message = "",
            levelStr = null;
        if (typeof(level) == 'undefined') {
            level = l.level;
        }
        if (level === parseInt(level, 10)) { // It's an integer
            if (l.levels[level]) {
                levelStr = l.levels[level]; // Get string
            } else {
                levelStr = "lvl:" + level;
            }
        } else if (typeof(level) == "string") { // It's a string
            levelStr = level;
            if (l.levels[levelStr]) {
                level = l.levels[levelStr]; // Get integer
            } else {
                level = l.level;
            }
        }
        if (level == null) {
            message = l.dateFormatter(now) + " " + msg;
        } else if (level >= l.level) {
            message = l.dateFormatter(now) + ' ' + levelStr + " " + msg;
        }
        if (message) {
            if (!destination) {
                for (var dest in l.destinations) {
                    l.destinations[dest](message, levelStr);
                }
            } else {
                destination(message, levelStr);
            }
        }
    },
    // Shortcuts for each log level
    logFatal: function(msg) { GateOne.Logging.log(msg, 'FATAL') },
    logError: function(msg) { GateOne.Logging.log(msg, 'ERROR') },
    logWarning: function(msg) { GateOne.Logging.log(msg, 'WARNING') },
    logInfo: function(msg) { GateOne.Logging.log(msg, 'INFO') },
    logDebug: function(msg) { GateOne.Logging.log(msg, 'DEBUG') },
    deprecated: function(whatever, moreInfo) { GateOne.Logging.log(whatever + " is deprecated.  " + moreInfo, 'WARNING') },
    addDestination: function(name, dest) {
        /**:GateOne.Logging.addDestination(name, dest)

        Creates a new log destination named, *name* that calls function *dest* like so::

            dest(<log message>);

        Example usage::

             GateOne.Logging.addDestination('screen', GateOne.Visual.displayMessage);

        .. note:: The above example is kind of fun.  Try it in your JavaScript console!
        */
        GateOne.Logging.destinations[name] = dest;
    },
    removeDestination: function(name) {
        /**:GateOne.Logging.removeDestination(name)

        Removes the given log destination (*name*) from `GateOne.Logging.destinations`
        */
        if (GateOne.Logging.destinations[name]) {
            delete GateOne.Logging.destinations[name];
        } else {
            GateOne.Logging.logError("No log destination named, '" + name + "'.");
        }
    },
    dateFormatter: function(dateObj) {
        /**:GateOne.Logging.dateFormatter(dateObj)

        Converts a Date() object into string suitable for logging.  e.g. 2011-05-29 13:24:03
        */
        var year = dateObj.getFullYear(),
            month = dateObj.getMonth() + 1, // JS starts months at 0
            day = dateObj.getDate(),
            hours = dateObj.getHours(),
            minutes = dateObj.getMinutes(),
            seconds = dateObj.getSeconds();
        // pad a 0 so it doesn't look silly
        if (month < 10) {
            month = "0" + month;
        }
        if (day < 10) {
            day = "0" + day;
        }
        if (hours < 10) {
            hours = "0" + hours;
        }
        if (minutes < 10) {
            minutes = "0" + minutes;
        }
        if (seconds < 10) {
            seconds = "0" + seconds;
        }
        return year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
    }
});

GateOne.Logging.destinations = { // Default to console logging.
    'console': GateOne.Logging.logToConsole // Can be added to or replaced/removed
    // If anyone has any cool ideas for log destinations please let us know!
}

GateOne.Base.module(GateOne, 'Net', '1.1', ['Base', 'Utils']);
GateOne.Net.sslErrorTimeout = null; // A timer gets assigned to this that opens a dialog when we have an SSL problem (user needs to accept the certificate)
GateOne.Net.connectionSuccess = false; // Gets set after we connect successfully at least once
GateOne.Net.sendDimensionsCallbacks = []; // DEPRECATED: A hook plugins can use if they want to call something whenever the terminal dimensions change
GateOne.Net.binaryBuffer = {}; // Incoming binary data messages get stored here like so:
// GateOne.Net.binaryBuffer[<ident>] = <binary message>
// ...where <ident> is the data inside the binary message leading up to a semicolon
GateOne.Base.update(GateOne.Net, {
    init: function() {
        /**:GateOne.Net.init()

        */
        go.Net.addAction('go:timeout', go.Net.timeoutAction);
        go.Events.on("go:ping_timeout", function() {
            go.Visual.displayMessage("A keepalive ping has timed out.  Attempting to reconnect...");
        });
    },
    sendChars: function() {
        /**:GateOne.Net.sendChars() DEPRECATED:  Use GateOne.Terminal.sendChars() instead. */
        go.Logging.deprecated("GateOne.Net.sendChars", "Use GateOne.Terminal.Input.sendChars() instead.");
        go.Terminal.sendChars();
    },
    sendString: function(chars, term) {
        /**:GateOne.Net.sendString() DEPRECATED:  Use GateOne.Terminal.sendString() instead. */
        go.Logging.deprecated("GateOne.Net.sendString", "Use GateOne.Terminal.sendString() instead.");
        go.Terminal.sendString(chars, term);
    },
    log: function(message) {
        /**:GateOne.Net.log(msg)

        Logs the given *message* via :js:meth:`GateOne.Logging.logInfo` (for debugging plugins and whatnot).
        */
        go.Logging.logInfo(message);
    },
    ping: function(/*opt*/logLatency) {
        /**:GateOne.Net.ping([logLatency])

        Sends a 'ping' to the server over the WebSocket.  The response from the server is handled by :js:meth:`GateOne.Net.pong`.

        If a response is not received within a certain amount of time (milliseconds, controlled via `GateOne.prefs.pingTimeout`) the WebSocket will be closed and a 'go:ping_timeout' event will be triggered.

        If *logLatency* is `true` (the default) the latency will be logged to the JavaScript console via :js:meth:`GateOne.Logging.logInfo`.

        .. note:: The default value for `GateOne.prefs.pingTimeout` is 5 seconds.  You can change this setting via the ``js_init`` option like so: ``--js_init='{pingTimeout: "5000"}'`` (command line) or in your 10server.conf ("js_init": "{pingTimeout: '5000'}").
        */
        var now = new Date(),
            timeout = parseInt(go.prefs.pingTimeout),
            timestamp = now.toISOString();
        logDebug("PING...");
        if (logLatency === undefined) { // Default to logging the latency
            logLatency = true;
        }
        go.Net.logLatency = logLatency; // So pong() will know what to do
        go.ws.send(JSON.stringify({'go:ping': timestamp}));
        if (go.Utils.pingTimeout) {
            clearTimeout(go.Utils.pingTimeout);
            go.Utils.pingTimeout = null;
        }
        go.Utils.pingTimeout = setTimeout(function() {
            logError("Pinging Gate One server took longer than " + timeout + "ms.  Attempting to reconnect...");
            go.ws.close();
            go.Events.trigger('go:ping_timeout');
        }, timeout);
    },
    pong: function(timestamp) {
        /**:GateOne.Net.pong(timestamp)

        Called when the server and responds to a 'ping' with a 'pong'.  Logs (via :js:meth:`GateOne.Logging.logInfo`) and returns the latency in ms.
        */
        var dateObj = new Date(timestamp), // Convert the string back into a Date() object
            now = new Date(),
            latency = now.getMilliseconds() - dateObj.getMilliseconds();
        if (go.Net.logLatency) {
            logInfo('PONG: Gate One server round-trip latency: ' + latency + 'ms');
        }
        if (go.Utils.pingTimeout) {
            clearTimeout(go.Utils.pingTimeout);
            go.Utils.pingTimeout = null;
        }
        return latency;
    },
    reauthenticate: function() {
        // This is a courtesy from the Gate One server telling us to re-auth since it is about to close the WebSocket.
        // Deletes the 'gateone_user' cookie and the equivalent in localStorage
        var go = GateOne,
            prefix = go.prefs.prefix,
            u = go.Utils,
            v = go.Visual,
            redirect = function() {
                if (window.location.href.indexOf('@') != -1) {
                    // If the URL has an @ sign assume it is PAM or Kerberos auth and replace it with something random to force re-auth
                    window.location.href = window.location.href.replace(/:\/\/(.*@)?/g, '://'+u.randomString(8)+'@');
                } else {
                    window.location.reload(); // A simple reload *should* force a re-auth if all we're dealing with is a cookie/localStorage secret problem
                }
            }
        u.deleteCookie('gateone_user', '/', '');
        delete localStorage[prefix+'gateone_user']; // Also clear this if it is set
        // This is wrapped in a timeout because the 'reauthenticate' message comes just before the WebSocket is closed
        setTimeout(function() {
            if (go.Net.reconnectTimeout) {
                clearTimeout(go.Net.reconnectTimeout);
            }
        }, 500);
        if (go.prefs.auth) {
            v.alert(gettext('API Authentication Failure'), gettext("The API authentication object was denied by the server.  Click OK to reload the page."), redirect);
        } else {
            v.alert(gettext('Authentication Failure'), gettext('You must re-authenticate with the Gate One server.  The page will now be reloaded.'), redirect);
        }
    },
    sendDimensions: function(term, /*opt*/ctrl_l) {
        /**:GateOne.Net.sendDimensions() DEPRECATED:  Use GateOne.Terminal.sendDimensions() instead. */
        GateOne.Logging.deprecated("GateOne.Net.sendDimensions", "Use GateOne.Terminal.sendDimensions() instead.");
        GateOne.Terminal.sendDimensions(term, ctrl_l);
    },
    connectionError: function(msg) {
        // Displays an error in the browser indicating that there was a problem with the connection.
        // if *msg* is given, it will be added to the standard error.
        go.Net.connectionProblem = true;
        // Stop trying to ping the server since we're no longer connected
        clearInterval(go.Net.keepalivePing);
        var u = go.Utils,
            v = go.Visual,
            errorElem = u.createElement('div', {'id': 'error_message'}),
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            message = "<p>The WebSocket connection was closed.  Will attempt to reconnect every 5 seconds...</p><p>NOTE: Some web proxies do not work properly with WebSockets.</p>";
        logError("Error communicating with server... ");
        workspaces.forEach(function(wsObj) {
            v.closeWorkspace(wsObj.id.split('workspace')[1]);
        });
        v.lastWorkspaceNumber = 0; // Reset it (applications will create their own workspaces)
        if (msg) {
            message = "<p>" + msg + "</p>";
        }
        errorElem.innerHTML = message;
        go.node.appendChild(errorElem);
        // Fire a connection_error event.  DEVELOPERS: It's a good event to attach to in order to grab a new/valid API authentication object.
        // For reference, to reset the auth object just assign it:  GateOne.prefs.auth = <your auth object>
        go.Events.trigger("go:connection_error");
        go.Net.reconnectTimeout = setTimeout(go.Net.connect, 5000);
    },
    sslError: function(callback) {
        // Called when we fail to connect due to an SSL error (user must accept the SSL certificate).  It opens a dialog where the user can click accept
        // *callback* will be called when the user closes the dialog
        GateOne.Net.connectionProblem = true;
        if (GateOne.Net.sslDialogOpened) {
            return; // Don't need to open more than one
        }
        GateOne.Net.sslDialogOpened = true;
        // NOTE:  Only likely to happen in situations where Gate One is embedded into another application
        var go = GateOne,
            u = go.Utils,
            acceptURL = go.prefs.url + 'static/accept_certificate.html';
        go.Visual.displayMessage(gettext("An SSL certificate must be accepted by your browser to continue.  Please click <a href='"+acceptURL+"' target='_blank'>here</a> to be redirected."));
    },
    connect: function(/*opt*/callback) {
        // Connects to the WebSocket defined in GateOne.prefs.url
        // If provided, *callback* will be called after the connection has been established
        go.Net.connectionProblem = false;
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
        go.ws.binaryType = 'arraybuffer'; // In case binary data comes over the wire it is much easier to deal with it in arrayBuffer form.
        go.ws.onopen = function(evt) {
            go.Net.onOpen(callback);
        }
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
        // Assume SSL connect failure if readyState doesn't change from 3 within 5 seconds
        if (!go.Net.connectionSuccess) {
            // Only try the SSL redirect thing if we've never successfully connected
            go.Net.sslErrorTimeout = setTimeout(function() {
                go.Net.sslError(go.Net.connect);
            }, 5000);
        }
        return go.ws;
    },
    onOpen: function(/*opt*/callback) {
        logDebug("onOpen()");
        var u = go.Utils,
            prefix = go.prefs.prefix,
            gridwrapper = u.getNode('#'+prefix+'gridwrapper'),
            settings = {'auth': go.prefs.auth, 'container': go.prefs.goDiv.split('#')[1], 'prefix': prefix, 'location': go.location};
        // Cancel our SSL error timeout since everything is working fine.
        clearTimeout(go.Net.sslErrorTimeout);
        // Set connectionSuccess so we don't do an SSL check if the server goes down for a while.
        go.Net.connectionSuccess = true;
        // When we fail an origin check we'll get an error within a split second of onOpen() being called so we need to check for that and stop loading stuff if we're not truly connected.
        if (!go.Net.connectionProblem) {
            setTimeout(function() {
                // Load our CSS right away so the dimensions/placement of things is correct.
                u.loadTheme(go.prefs.theme);
                // Clear the error message if it's still there
                if (gridwrapper) {
                    gridwrapper.innerHTML = "";
                }
                if (!go.prefs.auth) {
                    // If 'auth' isn't set that means we're not in API mode but we could still be embedded so check for the user's session info in localStorage
                    var goCookie = u.getCookie('gateone_user');
                    if (goCookie) {
                        logDebug("Using cookie for auth");
                        // Prefer the cookie
                        if (goCookie[0] == '"') {
                            goCookie = eval(goCookie); // Wraped in quotes; this removes them
                        }
                        go.prefs.auth = goCookie;
                        settings['auth'] = go.prefs.auth;
                    } else if (localStorage[prefix+'gateone_user']) {
                        logDebug("Using localStorage for auth");
                        go.prefs.auth = localStorage[prefix+'gateone_user'];
                        settings['auth'] = go.prefs.auth;
                    }
                }
                go.ws.send(JSON.stringify({'go:authenticate': settings}));
                // NOTE: This event can't be used by applications (and their plugins) since their JS won't have been loaded yet:
                go.Events.trigger("go:connnection_established");
                go.initialize();
                if (callback) {
                    callback();
                }
                // Log the latency of the Gate One server after everything has settled down
                setTimeout(function() {go.Net.ping(true);}, 4000);
                // Start our keepalive process to check for timeouts
                go.Net.keepalivePing = setInterval(function() {
                    go.Net.ping(false);
                }, go.prefs.keepaliveInterval);
            }, 100);
        }
    },
    onMessage: function (evt) {
        logDebug('message: ' + evt.data);
        var prefix = GateOne.prefs.prefix,
            v = GateOne.Visual,
            n = GateOne.Net,
            u = GateOne.Utils,
            messageObj = null;
        if (typeof evt.data !== "string") {
            var data = new Uint8Array(evt.data),
                identifier = String.fromCharCode.apply(null, data.subarray(0, 1));
            GateOne.Net.binaryBuffer[identifier] = data.subarray(1);
            return;
        }
        try {
            messageObj = JSON.parse(evt.data);
        } catch (e) {
            // Non-JSON messages coming over the WebSocket are assumed to be errors, display them as-is (could be handy shortcut to display a message instead of using the 'notice' action).
            var noticeContainer = u.getNode('#'+prefix+'noticecontainer'),
                msg = '<b>Message From Gate One Server:</b> ' + evt.data;
            v.displayMessage(msg, 10000); // Give it plenty of time
        }
        // Execute each respective action
        for (var key in messageObj) {
            var val = messageObj[key];
            if (n.actions[key]) {
                n.actions[key](val);
            }
        }
    },
    timeoutAction: function() {
        /**:GateOne.Net.timeoutAction()

        Writes a message to the screen indicating a session timeout has occurred (on the server) and closes the WebSocket.
        */
        var u = go.Utils;
        logError("Session timed out.");
        u.getNode(go.prefs.goDiv).innerHTML = "Your session has timed out.  Reload the page to reconnect to Gate One.";
        go.ws.onclose = function() { // Have to replace the existing onclose() function so we don't end up auto-reconnecting.
            // Connection to the server was lost
            logDebug("WebSocket Closed");
        }
        go.ws.close(); // No reason to leave it open taking up resources on the server.
        E.trigger('go:timeout');
    },
    addAction: function(name, func) {
        // Adds/overwrites actions in GateOne.Net.actions
        GateOne.Net.actions[name] = func;
    },
    setTerminal: function(term) {
        /**:GateOne.Net.setTerminal() DEPRECATED:  Use GateOne.Terminal.setTerminal() instead. */
        GateOne.Logging.deprecated("GateOne.Net.setTerminal", "Use GateOne.Terminal.setTerminal() instead.");
        GateOne.Terminal.setTerminal(term);
    },
    killTerminal: function(term) {
        /**:GateOne.Net.killTerminal() DEPRECATED:  Use GateOne.Terminal.killTerminal() instead. */
        GateOne.Logging.deprecated("GateOne.Net.killTerminal", "Use GateOne.Terminal.killTerminal() instead.");
        GateOne.Terminal.killTerminal(term);
    },
    refresh: function(term) {
        /**:GateOne.Net.refresh() DEPRECATED:  Use GateOne.Terminal.refresh() instead. */
        GateOne.Logging.deprecated("GateOne.Net.refresh", "Use GateOne.Terminal.refresh() instead.");
        GateOne.Terminal.refresh(term);
    },
    fullRefresh: function(term) {
        /**:GateOne.Net.fullRefresh() DEPRECATED:  Use GateOne.Terminal.fullRefresh() instead. */
        GateOne.Logging.deprecated("GateOne.Net.fullRefresh", "Use GateOne.Terminal.fullRefresh() instead.");
        GateOne.Terminal.fullRefresh(term);
    }
});
// Protocol actions
GateOne.Net.actions = {
// These are what will get called when the server sends us each respective action
    'go:log': GateOne.Net.log,
    'go:ping': GateOne.Net.ping,
    'go:pong': GateOne.Net.pong,
    'go:reauthenticate': GateOne.Net.reauthenticate,
 // This is here because it needs to happen before most calls to init()
    'go:register_translation': GateOne.i18n.registerTranslationAction
}
GateOne.Base.module(GateOne, "Input", '1.1', ['Base', 'Utils']);
// GateOne.Input.charBuffer = []; // Queue for sending characters to the server
GateOne.Input.metaHeld = false; // Used to emulate the "meta" modifier since some browsers/platforms don't get it right.
GateOne.Input.shortcuts = {}; // Shortcuts added via registerShortcut() wind up here.
GateOne.Input.globalShortcuts = {}; // Global shortcuts added via registerGlobalShortcut() wind up here.
GateOne.Input.handledGlobal = false; // Used to detect when a global shortcut needs to override a local (regular) one.
GateOne.Base.update(GateOne.Input, {
    /**:GateOne.Input

    GateOne.Input is in charge of all keyboard input as well as copy & paste stuff and touch events.
    */
    init: function() {
        /**:GateOne.Input.init()

        Attaches our global keydown/keyup events and touch events
        */
        var u = go.Utils,
            v = go.Visual;
        // Attach our global shortcut handler to window
        window.addEventListener('keydown', go.Input.onGlobalKeyDown, true);
        go.node.addEventListener('keydown', go.Input.onKeyDown, true);
        go.node.addEventListener('keyup', go.Input.onKeyUp, true);
        // Add some useful touchscreen events
        if ('ontouchstart' in document.documentElement) { // Touch-enabled devices only
            v.displayMessage("Touch screen detected:<br>Swipe left/right/up/down to switch workspaces.");
            var style = window.getComputedStyle(go.node, null);
            go.node.addEventListener('touchstart', function(e) {
                v.displayMessage("touchstart");
                var touch = e.touches[0];
                go.Input.touchstartX = touch.pageX;
                go.Input.touchstartY = touch.pageY;
            }, true);
            go.node.addEventListener('touchmove', function(e) {
                v.displayMessage("touchmove");
                var touch = e.touches[0];
                if (touch.pageX < go.Input.touchstartX && (go.Input.touchstartX - touch.pageX) > 20) {
                    v.slideRight();
                } else if (touch.pageX > go.Input.touchstartX && (touch.pageX - go.Input.touchstartX) > 20) {
                    v.slideLeft();
                } else if (touch.pageY < go.Input.touchstartY && (go.Input.touchstartY - touch.pageY) > 20) {
                    v.slideDown();
                } else if (touch.pageY > go.Input.touchstartY && (touch.pageY - go.Input.touchstartY) > 20) {
                    v.slideUp();
                }
                e.preventDefault();
            }, true);
            setTimeout(function() {
                u.hideElements('.✈pastearea');
            }, 3000);
        }
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
        /**:GateOne.Input.onKeyUp(e)

        Used in conjunction with GateOne.Input.modifiers() and GateOne.Input.onKeyDown() to emulate the meta key modifier using KEY_WINDOWS_LEFT and KEY_WINDOWS_RIGHT since "meta" doesn't work as an actual modifier on some browsers/platforms.
        */
        var goIn = go.Input,
            key = goIn.key(e);
        logDebug('onKeyUp()');
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = false;
        }
        if (goIn.handledShortcut) {
            // This key has already been taken care of
            goIn.handledShortcut = false;
            return;
        }
    },
    onKeyDown: function(e) {
        /**:GateOne.Input.onKeyDown(e)

        Handles keystroke events by determining which kind of event occurred and how/whether it should be sent to the server as specific characters or escape sequences.
        */
        // NOTE:  In order for e.preventDefault() to work in canceling browser keystrokes like Ctrl-C it must be called before keyup.
        var goIn = go.Input,
            u = go.Utils,
            container = go.node,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e);
        logDebug("onKeyDown() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        if (goIn.handledGlobal) {
            // Global shortcuts take precedence
            return;
        }
        if (container) { // This display check prevents an exception when someone presses a key before the document has been fully loaded
            goIn.execKeystroke(e);
        }
    },
    onGlobalKeyDown: function(e) {
        /**:GateOne.Input.onGlobalKeyDown(e)

        Handles global keystroke events (i.e. those attached to the window object).
        */
        var goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e);
        logDebug("onGlobalKeyDown() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        goIn.execKeystroke(e, true);
    },
    execKeystroke: function(e, /*opt*/global) {
        /**:GateOne.Input.execKeystroke(e, global)

        Executes the keystroke or shortcut associated with the given keydown event (*e*).  If *global* is true, will only execute global shortcuts (no regular keystroke overrides).
        */
        logDebug('execKeystroke(global=='+global+')');
        var goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e),
            shortcuts = goIn.shortcuts;
        if (global) {
            shortcuts = goIn.globalShortcuts;
        }
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = true; // Lets us emulate the "meta" modifier on browsers/platforms that don't get it right.
            setTimeout(function() {
                // Reset it after three seconds regardless of whether or not we get a keyup event.
                // This is necessary because when Macs execute meta-tab (Cmnd-tab) the keyup event never fires and Gate One can get stuck thinking meta is down.
                goIn.metaHeld = false;
            }, 3000);
            return true; // Save some CPU
        }
        if (goIn.composition) {
            return true; // Let the IME handle this keystroke
        }
        // This loops over everything in *shortcuts* and executes actions for any matching keyboard shortcuts that have been defined.
        for (var k in shortcuts) {
            if (key.string == k) {
                var matched = false;
                shortcuts[k].forEach(function(shortcut) {
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
                        goIn.handledShortcut = true;
                        goIn.handledGlobal = true;
                        matched = true;
                    }
                });
                if (matched) {
                    setTimeout(function() {
                        goIn.handledGlobal = false;
                    }, 250);
                    // Stop further processing of this keystroke
                    return true;
                }
            }
        }
    },
    registerShortcut: function(keyString, shortcutObj) {
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
    registerGlobalShortcut: function(keyString, shortcutObj) {
        /**:GateOne.Input.registerGlobalShortcut(keyString, shortcutObj)

        Used to register a *global* shortcut.  Identical to :js:meth:`GateOne.Input.registerShortcut` with the exception that shortcuts registered via this function will work even if `GateOne.prefs.goDiv` (e.g. #gateone) doesn't currently have focus (i.e. it will work even after disableCapture() is called).
        */
        // Example usage:  GateOne.Input.registerGlobalShortcut('KEY_G', {
        //     'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false},
        //     'action': 'GateOne.Visual.toggleGridView()',
        //     'preventDefault': true
        // });
        // NOTE:  If preventDefault is not given in the shortcutObj it is assumed to be true
        if (GateOne.Input.globalShortcuts[keyString]) {
            // Already exists, overwrite existing if conflict (and log it) or append it
            var overwrote = false;
            GateOne.Input.globalShortcuts[keyString].forEach(function(shortcut) {
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
                GateOne.Input.globalShortcuts[keyString].push(shortcutObj);
            }
        } else {
            // Create a new shortcut with the given parameters
            GateOne.Input.globalShortcuts[keyString] = [shortcutObj];
        }
    },
    // TODO: This...
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
    handleVisibility: function(e) {
        // Calls GateOne.Input.capture() when the page becomes visible again *if* goDiv had focus before the document went invisible
        var go = GateOne,
            u = go.Utils;
        if (!u.isPageHidden()) {
            // Page has become visibile again
            logDebug("Ninja Mode disabled.");
            if (document.activeElement == go.node) {
                // Gate One was active when the page became hidden
                go.Events.trigger("go:visible");
            }
        } else {
            logDebug("Ninja Mode!  Gate One has become hidden.");
            go.Events.trigger("go:invisible");
        }
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
    for (var i = 65; i <= 90; i++) {
        specialKeys[i] = 'KEY_' + String.fromCharCode(i);
    }

    /* for KEY_NUM_PAD_0 - KEY_NUM_PAD_9 */
    for (var i = 96; i <= 105; i++) {
        specialKeys[i] = 'KEY_NUM_PAD_' + (i - 96);
    }

    /* for KEY_F1 - KEY_F12 */
    for (var i = 112; i <= 123; i++) {
        specialKeys[i] = 'KEY_F' + (i - 112 + 1);
    }
})();
// Fill out the special Mac keys:
(function () {
    var specialMacKeys = GateOne.Input.specialMacKeys;
    for (var i = 63236; i <= 63242; i++) {
        specialMacKeys[i] = 'KEY_F' + (i - 63236 + 1);
    }
})();

GateOne.Base.module(GateOne, 'Visual', '1.1', ['Base', 'Net', 'Utils']);
GateOne.Visual.gridView = false;
GateOne.Visual.goDimensions = {};
GateOne.Visual.panelToggleCallbacks = {'in': {}, 'out': {}}; // DEPRECATED
GateOne.Visual.lastMessage = '';
GateOne.Visual.sinceLastMessage = new Date();
GateOne.Visual.hidePanelsTimeout = {}; // Used by togglePanel() to keep track of which panels have timeouts
GateOne.Visual.togglingPanel = false;
GateOne.Base.update(GateOne.Visual, {
    // Functions for manipulating views and displaying things
    init: function() {
        var u = go.Utils,
            v = go.Visual,
            toolbarGrid = u.createElement('div', {'id': go.prefs.prefix+'icon_grid', 'class': '✈toolbar', 'title': "Grid View"}),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar');
        // Add our grid icon to the icons list
        GateOne.Icons['grid'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="gridGradient" y2="255.75" gradientUnits="userSpaceOnUse" x2="311.03" gradientTransform="matrix(0.70710678,0.70710678,-0.70710678,0.70710678,261.98407,-149.06549)" y1="227.75" x1="311.03"><stop class="✈stop1" offset="0"/><stop class="✈stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.66103562,-0.67114094,0.66103562,0.67114094,-611.1013,-118.18392)"><g fill="url(#gridGradient)" transform="translate(63.353214,322.07725)"><polygon points="311.03,255.22,304.94,249.13,311.03,243.03,317.13,249.13"/><polygon points="318.35,247.91,312.25,241.82,318.35,235.72,324.44,241.82"/><polygon points="303.52,247.71,297.42,241.61,303.52,235.52,309.61,241.61"/><polygon points="310.83,240.39,304.74,234.3,310.83,228.2,316.92,234.3"/></g></g></svg>';
        // Setup our toolbar icons and actions
        toolbarGrid.innerHTML = GateOne.Icons['grid'];
        var gridToggle = function() {
            v.toggleGridView(true);
        }
        try {
            toolbarGrid.onclick = gridToggle;
        } finally {
            gridToggle = null;
        }
        // Stick it on the end (can go wherever--unlike GateOne.Terminal's icons)
        toolbar.appendChild(toolbarGrid);
        // Register our keyboard shortcuts (Shift-<arrow keys> to switch workspaces, ctrl-alt-G to toggle grid view)
        if (!go.prefs.embedded) {
            go.Input.registerShortcut('KEY_ARROW_LEFT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideLeft()'});
            go.Input.registerShortcut('KEY_ARROW_RIGHT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideRight()'});
            go.Input.registerShortcut('KEY_ARROW_UP', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideUp()'});
            go.Input.registerShortcut('KEY_ARROW_DOWN', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideDown()'});
            go.Input.registerShortcut('KEY_G', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Visual.toggleGridView()'});
        }
        go.Net.addAction('go:notice', v.serverMessageAction);
        go.Events.on('go:switch_workspace', v.slideToWorkspace);
        go.Events.on('go:cleanup_workspaces', v.cleanupWorkspaces);
        window.addEventListener('resize', function() {
            if (v.updateDimensionsDebounce) { clearTimeout(v.updateDimensionsDebounce); }
            v.updateDimensionsDebounce = setTimeout(function() {
                v.updateDimensions();
            }, 750);
        }, false);
        // Forthcoming New Workspace Workspace :)
//         if (!go.prefs.embedded) {
//             setTimeout(function() {
//                 // If there's no workspaces after a while make the new workspace workspace
//                 var workspaces = u.getNodes('.✈workspace');
//                 if (!workspaces.length) {v.newWorkspaceWorkspace();}
//             }, 250);
//         }
    },
    newWorkspaceWorkspace: function() {
        /**:GateOne.Visual.newWorkspaceWorkspace()

        Creates the new workspace workspace (akin to a browser's "new tab tab") that allows users to open applications (and possibly other things in the future).
        */
        var u = go.Utils,
            v = go.Visual,
            E = go.Events,
            prefix = go.prefs.prefix,
            apps = go.User.applications,
            titleH2 = u.createElement('h2', {'class': '✈new_workspace_workspace_title'}),
            wsContainer = u.createElement('div', {'class': '✈centertrans ✈sectrans ✈new_workspace_workspace'}),
            wsAppGrid = u.createElement('div', {'class': '✈app_grid'}),
            workspace = v.newWorkspace(),
            workspaceNum = workspace.id.split(prefix+'workspace')[1];
        titleH2.innerHTML = "Gate One - Applications";
        wsContainer.style.opacity = 0;
        wsContainer.appendChild(titleH2);
        wsContainer.appendChild(wsAppGrid);
        apps.forEach(function(appName) {
            var icon, appSquare = u.createElement('div', {'class': '✈superfasttrans ✈application'}),
                appIcon = u.createElement('div', {'class': '✈appicon'}),
                appText = u.createElement('p', {'class': '✈application_text'});
            appText.innerHTML = appName;
            if (go.loadedApplications[appName] && go.loadedApplications[appName].__appinfo__) {
                icon = go.loadedApplications[appName].__appinfo__.icon || go.Icons['application'];
            }
            appIcon.innerHTML = icon || go.Icons['application'];
            appSquare.appendChild(appIcon);
            appSquare.appendChild(appText);
            wsAppGrid.appendChild(appSquare);
        });
        workspace.appendChild(wsContainer);
        // Scale it back into view
        setTimeout(function() {
            wsContainer.style.opacity = 1;
        }, 1);
        v.switchWorkspace(workspaceNum)
        E.trigger('go:new_workspace_workspace', workspace);
    },
    updateDimensions: function() {
        /**:GateOne.Visual.updateDimensions()

        Sets `GateOne.Visual.goDimensions` to the current width/height of prefs.goDiv
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            goDiv = go.node,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            wrapperDiv = u.getNode('#'+prefix+'gridwrapper'),
            style = window.getComputedStyle(goDiv, null),
            rightAdjust = 0,
            paddingRight = (style['padding-right'] || style['paddingRight']);
        if (style['padding-right']) {
            var rightAdjust = parseInt(paddingRight.split('px')[0]);
        }
        go.Visual.goDimensions.w = parseInt(style.width.split('px')[0]);
        go.Visual.goDimensions.h = parseInt(style.height.split('px')[0]);
        if (wrapperDiv) { // Explicit check here in case we're embedded into something that isn't using the grid (aka the wrapperDiv here).
            // Update the width of gridwrapper in case #gateone has padding
            wrapperDiv.style.width = ((go.Visual.goDimensions.w+rightAdjust)*2) + 'px';
            if (workspaces.length) {
                workspaces.forEach(function(wsNode) {
                    wsNode.style.height = go.Visual.goDimensions.h + 'px';
                    wsNode.style.width = go.Visual.goDimensions.w + 'px';
                });
            }
        }
        // Trigger a dimensions update event and pass in the goDimensions object
        setTimeout(function() {
            // Wrapped in a timeout so that the browser can finish making the above adjustments before things like terminals get adjustments of their own.
            go.Events.trigger("go:update_dimensions", go.Visual.goDimensions);
        }, 250);
    },
    applyTransform: function (obj, transform) {
        /**:GateOne.Visual.applyTransform(obj, transform)

        Applies the given CSS3 *transform* to *obj* for all known vendor prefixes (e.g. -<whatever>-transform).

        *obj* can be a string, a node, an array of nodes, or a NodeList.  In the case that *obj* is a string, GateOne.Utils.getNode(*obj*) will be performed under the assumption that the string represents a CSS selector.
        */
//         logDebug('applyTransform(' + typeof(obj) + ', ' + transform + ')');
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
        } else if (node.style['-webkit-transform']) {
            return node.style['-webkit-transform'];
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
        /**:GateOne.Visual.togglePanel(panel)

        Toggles the given *panel* in or out of view.  If other panels are open at the time, they will be closed.
        If *panel* evaluates to false, all open panels will be closed.

        This function also has some events that can be hooked into:

            * When the panel is toggled out of view: GateOne.Events.trigger("go:panel_toggle:out", panelElement)
            * When the panel is toggled into view: GateOne.Events.trigger("go:panel_toggle:in", panelElement)

        You can hook into these events like so::

            > GateOne.Events.on("go:panel_toggle:in", myFunc); // When panel is toggled into view
            > GateOne.Events.on("go:panel_toggle:out", myFunc); // When panel is toggled out of view
        */
        var v = go.Visual,
            u = go.Utils,
            E = go.Events,
            panelID = panel,
            panel = u.getNode(panel),
            origState = null,
            panels = u.getNodes('.✈panel'),
            deprecatedMsg = "Use GateOne.Events.on('go:panel_toggle:in', func) or GateOne.Events.on('go:panel_toggle:out', func) instead.",
            setHideTimeout = function(panel) {
                // Just used to get around the closure issue below
                if (v.hidePanelsTimeout[panel.id]) {
                    clearTimeout(v.hidePanelsTimeout[i]);
                    v.hidePanelsTimeout[panel.id] = null;
                }
                v.hidePanelsTimeout[panel.id] = setTimeout(function() {
                    // Hide the panel completely now that it has been scaled out
                    u.hideElement(panel);
                    v.hidePanelsTimeout[panel.id] = null;
                }, 1250);
            };
        if (v.togglingPanel) {
            return; // Don't let the user muck with the toggle until everything has run its course
        } else {
            v.togglingPanel = true;
        }
        if (panel) {
            origState = v.getTransform(panel);
        }
        // Start by scaling all panels out
        for (var i in u.toArray(panels)) {
            if (panels[i] && v.getTransform(panels[i]) == "scale(1)") {
                v.applyTransform(panels[i], 'scale(0)');
                // Call any registered 'out' callbacks for all of these panels
                E.trigger("panel_toggle:out", panel);
                if (v.panelToggleCallbacks['out']['#'+panels[i].id]) {
                    for (var ref in v.panelToggleCallbacks['out']['#'+panels[i].id]) {
                        if (typeof(v.panelToggleCallbacks['out']['#'+panels[i].id][ref]) == "function") {
                            deprecated("panelToggleCallbacks", deprecatedMsg);
                            v.panelToggleCallbacks['out']['#'+panels[i].id][ref]();
                        }
                    }
                }
                // Set the panels to display:none after they scale out to make sure they don't mess with user's tabbing (tabIndex)
                setHideTimeout(panels[i]);
            }
        }
        if (!panel) {
            // All done
            v.togglingPanel = false;
            return;
        }
        if (origState != 'scale(1)') {
            u.showElement(panel);
            setTimeout(function() {
                // This timeout ensures that the scale-in effect happens after showElement()
                v.applyTransform(panel, 'scale(1)');
            }, 1);
            // Call any registered 'in' callbacks for all of these panels
            E.trigger("go:panel_toggle:in", panel)
            if (v.panelToggleCallbacks['in']['#'+panel.id]) {
                for (var ref in v.panelToggleCallbacks['in']['#'+panel.id]) {
                    if (typeof(v.panelToggleCallbacks['in']['#'+panel.id][ref]) == "function") {
                        v.panelToggleCallbacks['in']['#'+panel.id][ref]();
                        deprecated("panelToggleCallbacks", deprecatedMsg);
                    }
                }
            }
            // Make it so the user can press the ESC key to close the panel
            panel.onkeyup = function(e) {
                if (e.keyCode == 27) { // ESC key
                    e.preventDefault(); // Makes sure we don't send an ESC key to the terminal
                    v.togglePanel(panel);
                    panel.onkeyup = null; // Reset
                    return false;
                }
            }
            v.togglingPanel = false;
        } else {
            // Send it away
            v.applyTransform(panel, 'scale(0)');
            // Call any registered 'out' callbacks for all of these panels
            E.trigger("go:panel_toggle:out", panel);
            if (v.panelToggleCallbacks['out']['#'+panel.id]) {
                for (var ref in v.panelToggleCallbacks['out']['#'+panel.id]) {
                    if (typeof(v.panelToggleCallbacks['out']['#'+panel.id][ref]) == "function") {
                        v.panelToggleCallbacks['out']['#'+panel.id][ref]();
                        deprecated("panelToggleCallbacks", deprecatedMsg);
                    }
                }
            }
            setTimeout(function() {
                // Hide the panel completely now that it has been scaled out to avoid tabIndex issues
                u.hideElement(panel);
                v.togglingPanel = false;
            }, 1100);
        }
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
            v = go.Visual,
            prefix = go.prefs.prefix,
            now = new Date(),
            timeDiff = now - go.Visual.sinceLastMessage,
            noticeContainer = u.getNode('#'+prefix+'noticecontainer'),
            notice = u.createElement('div', {'id': prefix+id, 'class': '✈notice'}),
            messageSpan = u.createElement('span'),
            closeX = u.createElement('span', {'class': '✈close_notice'}),
            unique = u.randomPrime(),
            removeFunc = function(now) {
                v.noticeTimers[unique] = setTimeout(function() {
                    go.Visual.applyStyle(notice, {'opacity': 0});
                    v.noticeTimers[unique] = setTimeout(function() {
                        u.removeElement(notice);
                        delete v.noticeTimers[unique];
                    }, timeout+removeTimeout);
                }, timeout);
            }
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
        if (!noticeContainer) {
            // Use a fallback (Gate One probably hasn't loaded yet; error situation)
            var msgContainer = u.createElement('div', {'id': 'noticecontainer', 'style': {'font-size': '1.5em', 'background-color': '#000', 'color': '#fff', 'display': 'block', 'position': 'fixed', 'bottom': '1em', 'right': '2em', 'z-index': 999999}}); // Have to use 'style' since CSS may not have been loaded
            msgContainer.innerHTML = message;
            document.body.appendChild(msgContainer);
            setTimeout(function() {
                u.removeElement(msgContainer);
            }, 10000);
            return;
        }
        messageSpan.innerHTML = message;
        closeX.innerHTML = go.Icons['close'].replace('closeGradient', 'miniClose'); // replace() here works around a browser bug where SVGs will disappear if you remove one that has the same gradient name as another.
        closeX.onclick = function(e) {
            if (v.noticeTimers[unique]) {
                clearTimeout(v.noticeTimers[unique]);
            }
            u.removeElement(notice);
        }
        notice.appendChild(messageSpan);
        notice.appendChild(closeX);
        noticeContainer.appendChild(notice);
        if (!v.noticeTimers) {
            v.noticeTimers = {}
        }
        removeFunc();
        notice.onmouseover = function(e) {
            clearTimeout(v.noticeTimers[unique]);
            v.disableTransitions(notice);
            v.applyStyle(notice, {'opacity': 1});
        }
        notice.onmouseout = function(e) {
            v.enableTransitions(notice);
            removeFunc();
        }
        v.lastMessage = message;
        v.sinceLastMessage = new Date();
    },
    disableTransitions: function(elem) {
        /**:GateOne.Visual.disableTransitions(elem)

        Sets the 'noanimate' class on *elem* which can be a node or querySelector-like string (e.g. #someid).  This class sets all CSS3 transformations to happen instantly without delay (which would animate).
        */
        var go = GateOne,
            u = go.Utils,
            node = u.getNode(elem);
        if (node.className.indexOf('✈noanimate') == -1) {
            node.className += " ✈noanimate";
        }
    },
    enableTransitions: function(elem) {
        /**:GateOne.Visual.enableTransitions(elem)

        Removes the 'noanimate' class from *elem* (if set) which can be a node or querySelector-like string (e.g. #someid).
        */
        var go = GateOne,
            u = go.Utils,
            node = u.getNode(elem);
        node.className = node.className.replace(/(?:^|\s)✈noanimate(?!\S)/, '');
    },
    newWorkspace: function() {
        /**:GateOne.Visual.newWorkspace()

        Creates a new workspace on the grid and returns the DOM node that is the new workspace.
        */
        var u = go.Utils,
            v = go.Visual,
            workspace = 0,
            prefix = go.prefs.prefix,
            currentWorkspace = localStorage[prefix+'selectedWorkspace'],
            gridwrapper = u.getNode('#'+prefix+'gridwrapper');
        if (!v.lastWorkspaceNumber) {
            v.lastWorkspaceNumber = 0; // Start at 0 so the first increment will be 1
        }
        v.lastWorkspaceNumber = v.lastWorkspaceNumber + 1;
        workspace = v.lastWorkspaceNumber;
        currentWorkspace = prefix+'workspace' + v.lastWorkspaceNumber;
        if (!go.prefs.embedded) {
            // Prepare the workspace div for the grid
            workspace = u.createElement('div', {'id': currentWorkspace, 'class': '✈workspace', 'style': {'width': v.goDimensions.w + 'px', 'height': v.goDimensions.h + 'px'}});
        } else {
            workspace = u.createElement('div', {'id': currentWorkspace, 'class': '✈workspace'});
        }
        gridwrapper.appendChild(workspace);
        workspace.focus();
        go.Events.trigger('go:new_workspace', workspace);
        return workspace;
    },
    closeWorkspace: function(workspace, /*opt*/message) {
        /**:GateOne.Visual.closeWorkspace(workspace)

        Removes the given *workspace* from the 'gridwrapper' element and triggers the 'go:workspace_closed' event.

        If *message* (string) is given it will be displayed to the user when the workspace is closed.

        .. note:: If you're writing an application for Gate One you'll definitely want to attach a function to the 'go:workspace_closed' event to either close your application or move it to a new workspace.
        */
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix;
        u.removeElement('#'+prefix+'workspace' + workspace);
        // Now find out what the previous workspace was and move to it
        var workspaces = u.toArray(u.getNodes('.✈workspace'));
        if (message) { v.displayMessage(message); }
        workspaces.forEach(function(wsObj) {
            v.lastWorkspaceNumber = parseInt(wsObj.id.split('workspace')[1]);
        });
        if (v.lastWorkspaceNumber) {
            v.switchWorkspace(v.lastWorkspaceNumber);
        } else {
            // Only open a new workspace if we're not in embedded mode.  When you embed you have more explicit control but that also means taking care of stuff like this on your own.
            if (!go.prefs.embedded) {
                if (go.ws.readyState == 1) {
                    // There are no other workspaces and we're still connected.  Open a new one...
//                     v.newTerminal();
                    // This is coming soon:
                    if (go.User.applications.length > 1) {
                        v.newWorkspaceWorkspace();
                    } else {
                        // Just launch the default application
                        go.applicationModules[go.User.applications[0]].__new__();
                    }
                }
            }
        }
        go.Events.trigger('go:workspace_closed', workspace);
    },
    switchWorkspace: function(workspace) {
        /**:GateOne.Visual.switchWorkspace(workspace)

        Triggers the 'go:switch_workspace' event which by default calls :js:meth:`GateOne.Visual.slideToWorkspace`.

        .. tip:: If you wish to use your own workspace-switching animation just write your own function to handle it and call `GateOne.Events.off('go:switch_workspace', GateOne.Visual.slideToWorkspace); GateOne.Events.on('go:switch_workspace', yourFunction);`
        */
        go.Events.trigger('go:switch_workspace', workspace);
        // NOTE: The following *must* come after the tiggered event above!
        localStorage[go.prefs.prefix+'selectedWorkspace'] = workspace;
    },
    cleanupWorkspaces: function() {
        /**:GateOne.Visual.cleanupWorkspaces()

        This gets attached to the 'go:cleanup_workspaces' event and should be triggered by any function that may leave a workspace empty.  It walks through all the workspaces and removes any that are empty.
        */
        var u = go.Utils,
            workspaces = u.toArray(u.getNodes('.✈workspace'));
        workspaces.forEach(function(wsNode) {
            var workspaceNum = wsNode.id.split(go.prefs.prefix+'workspace')[1];
            if (!wsNode.innerHTML.length) {
                go.Visual.closeWorkspace(workspaceNum);
            }
        });
    },
    slideToWorkspace: function(workspace) {
        /**:GateOne.Visual.slideToWorkspace(workspace)

        Slides the view to the given *workspace*.  If *GateOne.Visual.noReset* is true, don't reset the grid before switching.
        */
        logDebug('slideToWorkspace(' + workspace + ')');
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            count = 0,
            wPX = 0,
            hPX = 0,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            style = window.getComputedStyle(go.node, null),
            rightAdjust = 0,
            bottomAdjust = 0,
            paddingRight = (style['padding-right'] || style['paddingRight']),
            paddingBottom = (style['padding-bottom'] || style['paddingBottom']);
        // TODO: Figure out what I was supposed to use the paddingX values for (LOL--something got lost in a copy & paste operation but it still works...  So maybe I don't need these?)
        if (paddingRight != "0px") {
            rightAdjust = parseInt(paddingRight.split('px')[0]);
        }
        if (paddingRight != "0px") {
            bottomAdjust = parseInt(paddingRight.split('px')[0]);
        }
        // Reset the grid so that all workspace are in their default positions before we do the switch
        if (!v.noReset) {
            v.resetGrid();
        } else {
            v.noReset = false; // Reset the reset :)
        }
        workspaces.forEach(function(wsNode) {
            // resetGrid() turns transitions on when it's done doing its thing.  We have to turn them back off before we start up our animation process below or it will start up all wonky.
            v.disableTransitions(wsNode);
        });
        setTimeout(function() { // This is wrapped in a 1ms timeout to ensure the browser applies it AFTER the first set of transforms are applied.  Otherewise it will happen so fast that the animation won't take place.
            workspaces.forEach(function(wsNode) {
                v.enableTransitions(wsNode);  // Turn animations back on in preparation for the next step
                // Calculate all the width and height adjustments so we know where to move them
                count = count + 1;
                if (wsNode.id == prefix + 'workspace' + workspace) { // Use the workspace we're switching to this time
                    if (u.isEven(count)) {
                        wPX = ((v.goDimensions.w+rightAdjust) * 2) - (v.goDimensions.w+rightAdjust);
                        hPX = (((v.goDimensions.h+bottomAdjust) * count)/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                    } else {
                        wPX = 0;
                        hPX = (((v.goDimensions.h+bottomAdjust) * (count+1))/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                    }
                }
            });
            workspaces.forEach(function(wsNode) {
                // Move each workspace into position
                if (wsNode.id == prefix + 'workspace' + workspace) { // Apply to the workspace we're switching to
                    v.applyTransform(wsNode, 'translate(-' + wPX + 'px, -' + hPX + 'px)');
                } else {
                    v.applyTransform(wsNode, 'translate(-' + wPX + 'px, -' + hPX + 'px) scale(0.5)');
                }
            });
        }, 1);
        // Now hide everything but the workspace in the primary view
        if (v.hiddenWorkspacesTimer) {
            clearTimeout(v.hiddenWorkspacesTimer);
            v.hiddenWorkspacesTimer = null;
        }
        v.hiddenWorkspacesTimer = setTimeout(function() {
            workspaces.forEach(function(wsNode) {
                v.disableTransitions(wsNode);
                if (wsNode.id == prefix + 'workspace' + workspace) {
                    // This will be the only visible workspace so we need it front and center...
                    v.applyTransform(wsNode, 'translate(0px, 0px)');
                    wsNode.style.display = ''; // Reset
                } else {
                    wsNode.style.display = 'none';
                }
            });
        }, 1000); // NOTE:  This is 1s based on the assumption that the CSS has the transition configured to take 1s.
    },
    slideLeft: function() {
        /**:GateOne.Visual.slideLeft()

        Slides to the workspace left of the current view.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            count = 0,
            workspace = 0,
            workspaces = u.toArray(u.getNodes('.✈workspace'));
        if (workspaces.length > 1) {
            workspaces.forEach(function(wsObj) {
                if (wsObj.id == prefix + 'workspace' + localStorage[prefix+'selectedWorkspace']) {
                    workspace = count;
                }
                count += 1;
            });
            if (u.isEven(workspace+1)) {
                var slideTo = workspaces[workspace-1].id.split(prefix+'workspace')[1];
                go.Visual.switchWorkspace(slideTo);
            }
        }
    },
    slideRight: function() {
        /**:GateOne.Visual.slideRight()

        Slides to the workspace right of the current view.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            count = 0,
            workspace = 0;
        if (workspaces.length > 1) {
            workspaces.forEach(function(wsObj) {
                if (wsObj.id == prefix + 'workspace' + localStorage[prefix+'selectedWorkspace']) {
                    workspace = count;
                }
                count += 1;
            });
            if (!u.isEven(workspace+1)) {
                var slideTo = workspaces[workspace+1].id.split(prefix+'workspace')[1];
                go.Visual.switchWorkspace(slideTo);
            }
        }
    },
    slideDown: function() {
        /**:GateOne.Visual.slideDown()

        Slides the view downward one workspace by pushing all the others up.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            count = 0,
            workspace = 0;
        if (workspaces.length > 2) {
            workspaces.forEach(function(wsObj) {
                if (wsObj.id == prefix + 'workspace' + localStorage[prefix+'selectedWorkspace']) {
                    workspace = count;
                }
                count = count + 1;
            });
            if (workspaces[workspace+2]) {
                var slideTo = workspaces[workspace+2].id.split(prefix+'workspace')[1];
                go.Visual.switchWorkspace(slideTo);
            }
        }
    },
    slideUp: function() {
        /**:GateOne.Visual.slideUp()

        Slides the view downward one workspace by pushing all the others down.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            count = 0,
            workspace = 0;
        if (localStorage[prefix+'selectedWorkspace'] > 1) {
            workspaces.forEach(function(wsObj) {
                if (wsObj.id == prefix + 'workspace' + localStorage[prefix+'selectedWorkspace']) {
                    workspace = count;
                }
                count = count + 1;
            });
            if (workspaces[workspace-2]) {
                var slideTo = workspaces[workspace-2].id.split(prefix+'workspace')[1];
                go.Visual.switchWorkspace(Math.max(slideTo, 1));
            }
        }
    },
    resetGrid: function() {
        /**:GateOne.Visual.resetGrid()

        Places all workspaces in their proper position in the grid instantly (no animations).
        */
        logDebug("resetGrid()");
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            wPX = 0,
            hPX = 0,
            count = 0,
            currentWorkspace = localStorage[prefix+'selectedWorkspace'],
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            style = window.getComputedStyle(go.node, null),
            rightAdjust = 0,
            bottomAdjust = 0,
            paddingRight = (style['padding-right'] || style['paddingRight']),
            paddingBottom = (style['padding-bottom'] || style['paddingBottom']);
        if (paddingRight != "0px") {
            rightAdjust = parseInt(paddingRight.split('px')[0]);
        }
        if (paddingRight != "0px") {
            bottomAdjust = parseInt(paddingRight.split('px')[0]);
        }
        go.node.scrollTop = 0; // Move the view to the top so everything lines up and our calculations can be acurate
        workspaces.forEach(function(wsNode) {
            // Calculate all the width and height adjustments so we know where to move them
            count = count + 1;
            if (wsNode.id == prefix + 'workspace' + currentWorkspace) { // Pretend we're switching to what's right in front of us (current workspace)
                if (u.isEven(count)) {
                    wPX = ((v.goDimensions.w+rightAdjust) * 2) - (v.goDimensions.w+rightAdjust);
                    hPX = (((v.goDimensions.h+bottomAdjust) * count)/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                } else {
                    wPX = 0;
                    hPX = (((v.goDimensions.h+bottomAdjust) * (count+1))/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                }
            }
            v.disableTransitions(wsNode);
        });
        workspaces.forEach(function(wsNode) {
            // Move each workspace into position
            if (wsNode.id == prefix + 'workspace' + currentWorkspace) { // Apply to current workspace...  Not the one we're switching to
                v.applyTransform(wsNode, 'translate(-' + wPX + 'px, -' + hPX + 'px)');
            } else {
                v.applyTransform(wsNode, 'translate(-' + wPX + 'px, -' + hPX + 'px) scale(0.5)');
            }
            wsNode.style.display = ''; // Reset to visible
        });
    },
    toggleGridView: function(/*optional*/goBack) {
        /**:GateOne.Visual.toggleGridView([goBack])

        Brings up the workspace grid view or returns to full-size.

        If *goBack* is false, don't bother switching back to the previously-selected workspace
        */
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            workspaces = u.toArray(u.getNodes('.✈workspace'));
        if (goBack == null) {
            goBack == true;
        }
        if (v.gridView) {
            // Switch to the selected workspace and undo the grid
            v.gridView = false;
            // Remove the events we added for the grid:
            workspaces.forEach(function(wsNode) {
                wsNode.onclick = undefined;
                wsNode.onmouseover = undefined;
                wsNode.classList.remove('✈wsshadow');
            });
            go.node.style.overflow = 'hidden';
            v.noReset = true; // Make sure slideToWorkspace doesn't reset the grid before applying transitions
            if (goBack) {
                v.switchWorkspace(localStorage[prefix+'selectedWorkspace']); // Return to where we were before
            }
            go.Events.trigger('go:grid_view:close');
        } else {
            // Bring up the grid
            v.gridView = true;
            setTimeout(function() {
                go.node.style.overflowY = 'visible';
                u.getNode('#'+prefix+'gridwrapper').style.width = v.goDimensions.w;
                // We call go:grid_view:open here because it is important that it happens after everything has settled down
                go.Events.trigger('go:grid_view:open');
            }, 1000);
            v.resetGrid();
            setTimeout(function() {
                workspaces.forEach(function(wsNode) {
                    wsNode.style.display = ''; // Make sure they're all visible
                    wsNode.classList.add('✈wsshadow');
                    v.enableTransitions(wsNode);
                });
                v.applyTransform(workspaces, 'translate(0px, 0px)');
                var odd = true,
                    count = 1,
                    oddAmount = 0,
                    evenAmount = 0,
                    transform = "";
                workspaces.forEach(function(wsNode) {
                    var workspaceNum = wsNode.id.split(prefix+'workspace')[1],
                        selectWS = function(e) {
                            localStorage[prefix+'selectedWorkspace'] = workspaceNum;
                            v.toggleGridView(false);
                            v.noReset = true; // Make sure slideToWorkspace doesn't reset the grid before applying transitions
                            v.switchWorkspace(workspaceNum);
                        }
                    if (odd) {
                        if (count == 1) {
                            oddAmount = 50;
                        } else {
                            oddAmount += 100;
                        }
                        transform = "scale(0.5, 0.5) translate(-50%, -" + oddAmount + "%)";
                        v.applyTransform(wsNode, transform);
                        odd = false;
                    } else {
                        if (count == 2) {
                            evenAmount = 50;
                        } else {
                            evenAmount += 100;
                        }
                        transform = "scale(0.5, 0.5) translate(-150%, -" + evenAmount + "%)";
                        v.applyTransform(wsNode, transform);
                        odd = true;
                    }
                    count += 1;
                    wsNode.onclick = selectWS;
//                     wsNode.onmouseover = function(e) {
//                         var displayText = wsNode.id.split(prefix+'workspace')[1] + ": " + go.Terminal.terminals[termID]['title'],
//                             termInfoDiv = u.createElement('div', {'id': 'terminfo'}),
//                             marginFix = Math.round(go.Terminal.terminals[termID]['title'].length/2),
//                             infoContainer = u.createElement('div', {'id': 'infocontainer', 'class': '✈infocontainer', 'style': {'margin-right': '-' + marginFix + 'em'}});
//                         if (u.getNode('#'+prefix+'infocontainer')) { u.removeElement('#'+prefix+'infocontainer') }
//                         termInfoDiv.innerHTML = displayText;
//                         infoContainer.appendChild(termInfoDiv);
//                         v.applyTransform(infoContainer, 'scale(2)');
//                         wsNode.appendChild(infoContainer);
//                         setTimeout(function() {
//                             infoContainer.style.opacity = 0;
//                         }, 1000);
//                     }
                });
            }, 1);
        }
    },
    addSquare: function(squareName) {
        // Only called by createGrid; creates a workspace div and appends it to go.Visual.squares
        logDebug('creating: ' + squareName);
        var workspace = GateOne.Utils.createElement('div', {'id': squareName, 'class': '✈workspace', 'style': {'width': GateOne.Visual.goDimensions.w + 'px', 'height': GateOne.Visual.goDimensions.h + 'px'}});
        GateOne.Visual.squares.push(workspace);
    },
    createGrid: function(id, workspaceNames) {
        // Creates a container for all the workspaces and optionally pre-creates workspaces using *workspaceNames*.
        // *id* will be the ID of the resulting grid (e.g. "gridwrapper")
        // *workspaceNames* is expected to be a list of DOM IDs.
        var u = GateOne.Utils,
            v = GateOne.Visual,
            grid = null;
        v.squares = [];
        if (workspaceNames) {
            workspaceNames.forEach(addSquare);
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
    dialog: function(title, content, /*opt*/options) {
        // Creates a dialog with the given *title* and *content*.  Returns a function that will close the dialog when called.
        // *title* - string: Will appear at the top of the dialog.
        // *content* - HTML string or JavaScript DOM node:  The content of the dialog.
        // *options* doesn't do anything for now.
        var prefix = go.prefs.prefix,
            u = go.Utils,
            v = go.Visual,
            goDiv = go.node,
            prevActiveElement = document.activeElement,
            unique = u.randomPrime(), // Need something unique to enable having more than one dialog on the same page.
            dialogContainer = u.createElement('div', {'id': 'dialogcontainer_' + unique, 'class': '✈halfsectrans ✈dialogcontainer', 'title': title}),
            // dialogContent is wrapped by dialogDiv with "float: left; position: relative; left: 50%" and "float: left; position: relative; left: -50%" to ensure the content stays centered (see the theme CSS).
            dialogDiv = u.createElement('div', {'id': 'dialogdiv', 'class': '✈dialogdiv'}),
            dialogConent = u.createElement('div', {'id': 'dialogcontent', 'class': '✈dialogcontent'}),
            dialogTitle = u.createElement('h3', {'id': 'dialogtitle', 'class': '✈dialogtitle'}),
            close = u.createElement('div', {'id': 'dialog_close', 'class': '✈dialog_close'}),
            dialogToForeground = function(e) {
                // Move this dialog to the front of our array and fix all the z-index of all the dialogs
                for (var i in v.dialogs) {
                    if (dialogContainer == v.dialogs[i]) {
                        v.dialogs.splice(i, 1); // Remove it
                        v.dialogs.unshift(dialogContainer); // Add it to the front
                        dialogContainer.style.opacity = 1; // Make sure it is visible
                        // Make it so the user can press the ESC key to close the dialog
                        dialogContainer.onkeyup = function(e) {
                            if (e.keyCode == 27) { // ESC key
                                e.preventDefault(); // Makes sure we don't send an ESC key to the terminal (or anything else like a panel)
                                closeDialog();
                                dialogContainer.onkeyup = null; // Reset
                                return false;
                            }
                        }
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
                go.Events.trigger('go:dialog_to_foreground', dialogContainer);
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
                    dialogContainer.className = '✈dialogcontainer'; // Have to get rid of the halfsectrans so it will drag smoothly.
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
                dialogContainer.className = '✈halfsectrans ✈dialogcontainer';
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
                // Return focus to the previously-active element
                prevActiveElement.focus();
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
    alert: function(title, message, callback) {
        // Displays a dialog using the given *title* containing the given *message* along with an OK button.  When the OK button is clicked, *callback* will be called.
        // *message* may be a string or a DOM node.
        var go = GateOne,
            u = GateOne.Utils,
            v = GateOne.Visual,
            OKButton = u.createElement('button', {'id': 'ok_button', 'type': 'reset', 'value': 'OK', 'class': '✈button ✈black', 'style': {'margin-top': '1em', 'margin-left': 'auto', 'margin-right': 'auto', 'width': '4em'}}), // NOTE: Using a width here because I felt the regular button styling didn't make it wide enough when innerHTML is only two characters
            messageContainer = u.createElement('p', {'id': 'ok_message', 'style': {'text-align': 'center'}});
        OKButton.innerHTML = "OK";
        if (message instanceof HTMLElement) {
            messageContainer.appendChild(message);
        } else {
            messageContainer.innerHTML = "<p>" + message + "</p>";
        }
        messageContainer.appendChild(OKButton);
        var closeDialog = go.Visual.dialog(title, messageContainer);
        OKButton.tabIndex = 1;
        OKButton.onclick = function(e) {
            e.preventDefault();
            closeDialog();
            if (callback) {
                callback();
            }
        }
        setTimeout(function() {
            OKButton.focus();
        }, 250);
        go.Events.trigger('go:alert', title, message, closeDialog);
    },
    widget: function(title, content, /*opt*/options) {
        /**GateOne.Visual.widget(title, content[, options])

        Creates an on-screen widget with the given *title* and *content*.  Returns a function that will remove the widget when called.

        Widgets differ from dialogs in that they don't have a visible title and are meant to be persistent on the screen without getting in the way.  They are transparent by default and the user can move them at-will by clicking and dragging anywhere within the widget (not just the title).

        Widgets can be attached to a specific element by specifying a DOM object or querySelector string in *options*['where'].  Otherwise the widget will be attached to the currently-selected workspace.

        Widgets can be 'global' (attached to document.body) by setting *options*['where'] to 'global'.

        By default widgets will appear in the upper-right corner of a given workspace.
        *title* - string: Will appear at the top of the widget when the mouse cursor is hovering over it for more than 2 seconds.
        *content* - HTML string or JavaScript DOM node:  The content of the widget.
        *options* - An associative array of parameters that change the look and/or behavior of the widget.  Here's the possibilities:
             options['onopen'] - Assign a function to this option and it will be called when the widget is opened with the widget parent element (widgetContainer) being passed in as the only argument.
             options['onclose'] - Assign a function to this option and it will be called when the widget is closed.
             options['onconfig'] - If a function is assigned to this parameter a gear icon will be visible in the title bar that when clicked will call this function.
             options['where'] - The node where we'll be attaching this widget or 'global' to add the widget to document.body.
        */
        options = options || {};
        // Here are all the options
        options.onopen = options.onopen || null;
        options.onclose = options.onclose || null;
        options.onconfig = options.onconfig || null;
        options.where = options.where || localStorage[GateOne.prefs.prefix+'selectedWorkspace'];
        var prefix = go.prefs.prefix,
            u = go.Utils,
            v = go.Visual,
            goDiv = u.getNode(go.prefs.goDiv),
            unique = u.randomPrime(), // Need something unique to enable having more than one widget on the same page.
            widgetContainer = u.createElement('div', {'id': 'widgetcontainer_' + unique, 'class': '✈halfsectrans ✈widgetcontainer', 'name': 'widget', 'title': title}),
            widgetDiv = u.createElement('div', {'id': 'widgetdiv', 'class': '✈widgetdiv'}),
            widgetContent = u.createElement('div', {'id': 'widgetcontent', 'class': '✈widgetcontent'}),
            widgetTitle = u.createElement('h3', {'id': 'widgettitle', 'class': '✈halfsectrans ✈originbottommiddle ✈widgettitle'}),
            close = u.createElement('div', {'id': 'widget_close', 'class': '✈widget_close'}),
            configure = u.createElement('div', {'id': 'widget_configure', 'class': '✈widget_configure'}),
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
                    widgetContainer.className = '✈widgetcontainer'; // Have to get rid of the halfsectrans so it will drag smoothly.
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
                widgetContainer.className = '✈halfsectrans ✈widgetcontainer';
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
                if (options['onclose']) {
                    options['onclose']();
                }
            };
        // Keep track of all open widgets so we can determine the foreground order
        if (!v.widgets) {
            v.widgets = [];
        }
        v.widgets.push(widgetContainer);
        widgetDiv.appendChild(widgetContent);
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
        configure.innerHTML = go.Icons['prefs'].replace('prefsGradient', 'widgetGradient' + u.randomPrime());
        widgetTitle.innerHTML = title;
        if (options.onconfig) {
            configure.onclick = options.onconfig;
            widgetTitle.appendChild(configure);
        }
        widgetContainer.appendChild(widgetTitle);
        widgetTitle.appendChild(close);
        if (typeof(content) == "string") {
            widgetContent.innerHTML = content;
        } else {
            widgetContent.appendChild(content);
        }
        widgetContainer.appendChild(widgetDiv);
        // Determine where we should put this widget
        if (options['where'] == 'global') {
            // global widgets are fixed to the page as a whole
            document.body.appendChild(widgetContainer);
        } else if (options['where']) {
            u.getNode(options['where']).appendChild(widgetContainer);
        }
        v.widgetZIndex = parseInt(getComputedStyle(widgetContainer).zIndex); // Right now this is 750 in the themes but that could change in the future so I didn't want to hard-code that value
        widgetToForeground();
        if (options.onopen) {
            options.onopen(widgetContainer);
        }
        return closeWidget;
    },
    // Example pane usage scenarios:
    //   var testPane = GateOne.Visual.Pane();
    //   testPane.innerHTML = "<p>Test pane</p>";
    //   testPane.appendChild('#some_element');

    //   var term1Pane = GateOne.Visual.Pane('#go_default_term1_pre'); <-- Creates a new Pane from term1_pre.  Doesn't make any changes to term1_pre unless specified in options.
    //   term1Pane.vsplit(); <-- Splits into two panes 50/50 left-and-right with the existing pane winding up on the left (default).
    //   term1Pane = term1Pane.hsplit(); <-- Splits into two panes 50/50 top-and-bottom with the existing pane winding up on the top (default).
    //   term1Pane.relocate('#some_id'); <-- Removes term1Pane from its existing location and places it into #some_id.  If #some_id is also a Pane it will be split.
    Pane: function(elem, options) {
        /**:GateOne.Visual.Pane(elem, options)

        An object that represents a pane on the page.  Options:

            :param options['name'] string: What to call this Pane so you can reference it later.
            :param options['node'] node: A DOM node or querySelector string.
        */
        // Enforce 'new' to ensure unique instances
        if (!(this instanceof GateOne.Visual.Pane)) {return new GateOne.Visual.Pane(elem, options);}
        options = (options || {});
        var self = this,
            u = GateOne.Utils;
        self.node = u.getNode(elem);
        self.title = (options['title'] || null);
        self.scroll = (options['scroll'] || false);
//         if (!('✈pane' in self.node.classList)) {
//             // Converting existing element into a Pane.
//             self.node.classList.add('✈pane');
//             // TODO: Probably need to add more stuff here
//         }
        self.split = function(axis, way, /*opt*/newNode) {
            /**:GateOne.Visual.Pane.split(axis, way[, newNode])

            Split this Pane into two.  The *axis* argument may be 'vertical', 'horizontal', or 'evil'.  Actually, just those first two make sense.

            The *way* argument controls left/right (vertical split) or top/bottom (horizontal split).  If not provided the default is have the existing pane wind up on the left or on the top, respectively.

            If provided, the given *newNode* will be placed in the new container that results from the split.  Otherwise a new node will be created from the existing one (using `cloneNode(false)`).

            .. note:: If you can't remember how to use this function just use the vsplit() or hsplit() shortcuts.
            */
            var barWidth = 6, // TODO: Change this to figure out what the width of the splitbar is based on the theme
                node = self.node,
                paneContainer = u.createElement('div', {'class': '✈pane'}),
                newWidth = parseInt(node.clientWidth/2) - parseInt(barWidth/2),
                newHeight = parseInt(node.clientHeight/2) - parseInt(barWidth/2),
                bar = u.createElement('div');
            node.style.position = 'absolute';
            node.style.top = 0;
            node.style.left = 0;
            if (axis == 'vertical') {
                bar.className = '✈vsplitbar';
                way = way || 'left';
                node.style.width = newWidth + 'px';
            } else {
                bar.className = '✈hsplitbar';
                way = way || 'top';
                node.style.height = newHeight + 'px';
            }
            if (!newNode) {
                newNode = node.cloneNode(false);
            }
            if (way == 'left') {
                newNode.style.left = (newWidth + barWidth) + 'px';
                bar.style.left = newWidth + 'px';
            } else {
                newNode.style.top = (newHeight + barWidth) + 'px';
                bar.style.left = newHeight + 'px';
            }
            node.parentNode.appendChild(paneContainer);
//             u.removeElement(node);
            if (way == 'left' || way == 'top') {
                paneContainer.appendChild(node);
                paneContainer.appendChild(bar);
                paneContainer.appendChild(newNode);
            } else {
                paneContainer.appendChild(newNode);
                paneContainer.appendChild(bar);
                paneContainer.appendChild(node);
            }
            // NOTE: TEMP:
//             duplicated.innerHTML = "This is the duplicated container";
            setTimeout(function() {
                u.scrollToBottom(node);
                u.scrollToBottom(newNode);
            }, 10);
            return newNode;
        }
        self.vsplit = function(/*opt*/newNode) {
            /**:GateOne.Visual.Pane.vsplit([newNode])

            A shortcut for `GateOne.Visual.Pane.split('vertical')`
            */
            go.Visual.Pane.split('vertical', null, newNode);
        }
        self.hsplit = function(/*opt*/newNode) {
            /**:GateOne.Visual.Pane.hsplit([newNode])

            A shortcut for `GateOne.Visual.Pane.split('horizontal')`
            */
            go.Visual.Pane.split('horizontal', null, newNode);
        }
        self.relocate = function(where, /*opt*/splitAxis) {
            /**:GateOne.Visual.Pane.relocate(where)

            Moves the Pane from wherever it currently resides into the element at *where*.  The *splitAxis* argument will be used to determine how to split *where* to accomodate this Pane.
            */
        }
        self.minimize = function(way) {
            /**:GateOne.Visual.Pane.minimize()

            Minimizes the Pane by docking it to the 'top', 'bottom', 'left', or 'right' of the view depending on *way*.
            */
        }
        self.remove = function() {
            /**:GateOne.Visual.Pane.remove()

            Removes the Pane from the page.
            */
            u.removeElement(self.node);
            // TODO: Add logic here to remove the splitbar(s)
        }
        return self;
    },
    // PANE TYPE 2
    pane: function(title, workspace, /*opt*/options) {
        /**:GateOne.Visual.panel(title, workspace[, options])

        Creates a new pane element inside of the given *workspace* and adds a pane object to :js:attr:`GateOne.Visual.workspaces`.  Panes can be docked or undocked (hover/pseudo pop-up) depending on *options*.  Returns the DOM node that winds up being created.

        Example usage (creates a 4x4 grid)::

            >>> paneObj = GateOne.Visual.pane('term1', 1); // New pane object.  Not attached to anything yet.
            >>> document.body.appendChild(paneObj.node); // Add it to the body
            >>> leftPane = paneObj.verticalSplit({'position': 'right', 'title': 'term2'}); // Cut the pane in half 50% and create a new, empty pane to the left named 'term2'
            >>> topPane = leftPane.horizontalSplit({'position': 'bottom', 'title': 'term3'}); // Cut the pane in half 50% and create a new, empty pane above
            >>> topLeftPane = topPane.verticalSplit({'position': 'left', 'title': 'term4'});  // Split the top pane in two.

        More examples...

        Add a new pane to an existing workspace that already has a pane::

            >>> paneObj2 = GateOne.Visual.pane('terminal', 1, {'split': 'vertical'}); // Vertical split is the default if not specified
            >>> // Would split whatever pane(s) exist on workspace 1 into two 50/50 sections.

        TODO list:

            * Make it so panes can be resized.
            * Make it so can be minimized.
            * Make it so other panes are aware of all other panes and their dimensions so they can be resized together (say, move one pane up and the one below it grows to fill the new space).
            * By default a pane should just add a full width/height div to the specified element.

        Visualing panels (end goal):

        --------------------------------------------------------------------
        |terminal list pane |         main terminal pane           |toolbar|
        |                   |                                      |       |
        |                   |                                      |       |
        |                   |<--draggable left/right to resize     |       |
        |                   |                                      |       |
        |                   |                                      |       |
        |                   |                                      |       |
        |                   |                                      |       |
        |                   |                                      |       |
        |                   |                                      |       |
        |                   |                                      |       |
        |                   |                                      |       |
        |-------------------|<--draggable up/down                  |       |
        |some other pane    |                                      |       |
        |                   |<--can move pane top, bottom, etc     |       |
        |                   |                                      |       |
        |------------------------------------------------------------------|
        |       Some other pane              | Some other pane  (log view?)|
        --------------------------------------------------------------------

        Programmatic necessities:
            * An object to store panes and their properties.
            * Functions to perform:
                * Convert element into pane.
                * Split existing pane into two.  (Requires creating in-between div for dragging)
                * Relocate pane.
            * CSS for the splitbar.
        */
    },
    toggleOverlay: function() {
        // Toggles the overlay that visually indicates whether or not Gate One is ready for input
        logDebug('toggleOverlay()');
        var v = go.Visual;
        if (v.overlay) {
            v.disableOverlay();
        } else {
            v.enableOverlay();
        }
    },
    enableOverlay: function() {
        /**:GateOne.Visual.enableOverlay()

        Displays an overlay above Gate One on the page that 'greys it out' to indicate it does not have focus.  If the overlay is already present it will be left as-is.

        The state of the overlay is tracked via the :js:attr:`GateOne.Visual.overlay` variable.
        */
        logDebug('enableOverlay()');
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            existingOverlay = u.getNode('#'+go.prefs.prefix+'overlay'),
            overlay = u.createElement('div', {'id': 'overlay', 'class': '✈overlay'});
        if (existingOverlay) {
            return true;
        } else {
            overlay.onmousedown = function(e) {
                // NOTE: Do not set 'onmousedown = go.Input.capture' as this will trigger capture() into thinking it was called via an onblur event.
                u.removeElement(overlay);
                v.overlay = false;
            }
            go.node.appendChild(overlay);
            v.overlay = true;
            go.Events.trigger('go:overlay_enabled');
        }
    },
    disableOverlay: function() {
        /**:GateOne.Visual.disableOverlay()

        Removes the overlay above Gate One (if present).

        The state of the overlay is tracked via the :js:attr:`GateOne.Visual.overlay` variable.
        */
        logDebug('disableOverlay()');
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            existingOverlay = u.getNode('#'+go.prefs.prefix+'overlay');
        if (existingOverlay) {
            // Remove it
            u.removeElement(existingOverlay);
            v.overlay = false;
            go.Events.trigger('go:overlay_disabled');
        }
    },
    // NOTE: Below is a work in progress.  Not used by anything yet.
    fitWindow: function(term) {
        // Scales the terminal <pre> to fit within the browser window based on the size of the screen <span> if rows/cols has been explicitly set.
        // If rows/cols are not set it will simply move all terminals to the top of the view so that the scrollback stays hidden while screen updates are happening.
        var termPre = GateOne.Terminal.terminals[term].node,
            screenSpan = GateOne.Terminal.terminals[term].screenNode;
        if (GateOne.prefs.rows) { // If someone explicitly set rows/cols, scale the term to fit the screen
            var nodeHeight = screenSpan.offsetHeight;
            if (nodeHeight < document.documentElement.clientHeight) { // Grow to fit
                var scale = document.documentElement.clientHeight / (document.documentElement.clientHeight - nodeHeight),
                    transform = "scale(" + scale + ", " + scale + ")";
                GateOne.Visual.applyTransform(termPre, transform);
            } else if (nodeHeight > document.documentElement.clientHeight) { // Shrink to fit

            }
        }
    },
    nodeThumb: function(elem, scale) {
        /**:GateOne.Visual.nodeThumb(elem, scale)

        Returns a miniature clone of the given *elem* that is reduced in size by the amount given by *scale* (e.g. 0.25 for 1/4 size).
        */
        var u = go.Utils,
            clone = u.getNode(elem).cloneNode(true);
        go.Visual.applyTransform(clone, 'scale('+scale+')');
        clone.id = clone.id + '_mini';
        return clone;
    }
});

// GateOne.Storage (for storing/synchronizing stuff at the client)
GateOne.Base.module(GateOne, "Storage", "1.0", ['Base']);
GateOne.Storage.databases = {};
GateOne.Storage._models = {}; // Stores the model of a given DB in the form of {'<db name>', {'<object store name>': {<object store options (if any)}, ...}}
// Example model: {'JavaScript': {keyPath: 'path'}, 'CSS': {keyPath: 'path'}}
// In the above model you could assign whatever attributes to your objects that you want but a 'path' attribute *must* be included.
GateOne.Storage.dbObject = function(DB) {
    /**:GateOne.Storage.dbObject(DB)

    Returns a new object that can be used to store and retrieve data stored in the given database.  Normally you'll get access to this object through the :js:meth:`GateOne.Storage.openDB` function (it gets passed as the argument to your callback).
    */
    if (!(this instanceof GateOne.Storage.dbObject)) {return new GateOne.Storage.dbObject(DB);}
    var self = this;
    self.DB = DB;
    self.get = function(storeName, key, callback) {
        /**:GateOne.Storage.dbObject.get(storeName, key, callback)

        Retrieves the object matching the given *key* in the given object store (*storeName*) and calls *callback* with the result.
        */
        if (indexedDB) {
            var db = GateOne.Storage.databases[self.DB],
                trans = db.transaction(storeName, 'readonly'),
                store = trans.objectStore(storeName),
                transaction = store.get(key);
            trans.oncomplete = function(e) {
                callback(transaction.result); // If not found result will be undefined
            }
        } else {
            var store = JSON.parse(localStorage[go.prefs.prefix+self.DB])[storeName],
                result = store.data[key];
            callback(result);
        }
    }
    self.put = function(storeName, value, callback) {
        /**:GateOne.Storage.dbObject.put(storeName, value[, callback])

        Adds *value* to the given object store (*storeName*).  If given, calls *callback* with *value* as the only argument.
        */
        if (indexedDB) {
            var db = GateOne.Storage.databases[self.DB],
                trans = db.transaction([storeName], 'readwrite'),
                store = trans.objectStore(storeName),
                request = store.put(value);
            request.onsuccess = function(e) {
                if (callback) {
                    callback(value);
                }
            };
            request.onerror = GateOne.Storage.onerror;
        } else {
            var db = JSON.parse(localStorage[go.prefs.prefix+self.DB]),
                result = [];
            for (var key in db[storeName].data) {
                result.push(db[storeName].data[key]);
            }
            if (callback) {
                callback(result);
            }
        }
    }
    self.del = function(storeName, key, callback) {
        /**:GateOne.Storage.dbObject.del(storeName, key[, callback])

        Deletes the object matching *key* from the given object store (*storeName*).  If given, calls *callback* when the transaction is complete.
        */
        if (indexedDB) {
            try {
                var db = GateOne.Storage.databases[self.DB],
                    trans = db.transaction(storeName, 'readwrite').objectStore(storeName)["delete"](key);
            } catch (e) {
                logDebug(key + " does not exist in " + storeName);
            }
        } else {
            var db = JSON.parse(localStorage[go.prefs.prefix+self.DB]);
            delete db[storeName].data[key];
            localStorage[go.prefs.prefix+self.DB] == JSON.stringify(db);
        }
        if (callback) {
            callback();
        }
    }
    self.dump = function(storeName, callback) {
        /**:GateOne.Storage.dbObject.dump(storeName, callback)

        Retrieves all objects in the given object store (*storeName*) and calls *callback* with the result.
        */
        if (indexedDB) {
            var db = GateOne.Storage.databases[self.DB],
                trans = db.transaction(storeName, 'readonly'),
                store = trans.objectStore(storeName),
                keyRange = IDBKeyRange.lowerBound(0), // Get everything in the store;
                cursorRequest = store.openCursor(keyRange),
                result = [];
            cursorRequest.onsuccess = function(e) {
                var cursor = e.target.result;
                if (!cursor) { return };
                result.push(cursor.value);
                cursor["continue"](); // Need this wierd syntax because Opera will die on the keyword, "continue"
            };
            trans.oncomplete = function(e) {
                callback(result);
            }
            cursorRequest.onerror = GateOne.Storage.onerror;
        } else {
            var db = JSON.parse(localStorage[go.prefs.prefix+self.DB]);
            callback(db[storeName].data);
        }
    }
    return self;
}
GateOne.Storage.fileCacheModel = {
    'js': {keyPath: 'filename'},
    'css': {keyPath: 'filename'},
    'theme': {keyPath: 'filename'},
    'print': {keypath: 'filename'}
}
GateOne.Storage.deferLoadingTimers = {}; // Used to make sure we don't duplicate our efforts in retries
GateOne.Storage.loadedFiles = {}; // This is used to queue up JavaScript files to ensure they load in the proper order.
GateOne.Storage.failedRequirementsCounter = {}; // Used to detect when we've waited too long for a dependency.
GateOne.Storage.fileCacheReady = false;
GateOne.Base.update(GateOne.Storage, {
    /**:GateOne.Base.Storage

    The Storage module provides several functions that make it easier store data in a persistent way.  It will attempt to use IndexedDB but if that's not available it will fall back to using localStorage.
    */
    init: function() {
        /**:GateOne.Storage.init()

        Registers the 'go:file_sync' and 'go:cache_expired' WebSocket actions and opens our 'fileCache' DB.
        */
        go.Net.addAction('go:file_sync', go.Storage.fileSyncAction);
        go.Net.addAction('go:cache_expired', go.Storage.cacheExpiredAction);
        go.Storage.openDB('fileCache', go.Storage.cacheReady, go.Storage.fileCacheModel);
    },
    cacheReady: function() {
        /**:GateOne.Storage.cacheReady()

        Called when the fileCache DB has completed openining/initialization.  Just sets `GateOne.Storage.fileCacheReady` to `true`.
        */
        go.Storage.fileCacheReady = true;
    },
    cacheJS: function(fileObj) {
        /**:GateOne.Storage.cacheJS(fileObj)

        Stores the given *fileObj* in the 'fileCache' database in the 'js' store.

        .. note:: Normally this only gets run from :js:meth:`GateOne.Utils.loadJSAction`.
        */
        if (!go.Storage.databases['fileCache']) {
            // Database hasn't finished initializing yet.  Wait just a moment and retry...
            setTimeout(function() {
                go.Storage.cacheJS(fileObj);
            }, 10);
            return;
        }
        logDebug('cacheJS caching ' + fileObj['filename']);
        var fileCache = GateOne.Storage.dbObject('fileCache');
        fileCache.put('js', fileObj);
    },
    uncacheJS: function(fileObj) {
        /**:GateOne.Storage.uncacheJS(fileObj)

        Removes the given *fileObj* from the cache (if present).

        .. note:: This will fail silently if the given *fileObj* does not exist in the cache.
        */
        if (!go.Storage.databases['fileCache']) {
            // Database hasn't finished initializing yet.  Wait just a moment and retry...
            setTimeout(function() {
                go.Storage.uncacheJS(fileObj);
            }, 10);
            return;
        }
        var fileCache = GateOne.Storage.dbObject('fileCache');
        fileCache.del('js', fileObj['filename']);
    },
    cacheStyle: function(fileObj, kind) {
        /**:GateOne.Storage.cacheStyle(fileObj)

        Stores the given *fileObj* in the 'fileCache' database in the store associated with the given *kind* of stylesheet.  Stylesheets are divided into different 'kind' categories because some need special handling (e.g. themes need to be hot-swappable).

        .. note:: Normally this only gets run from :js:meth:`GateOne.Utils.loadStyleAction`.
        */
        if (!go.Storage.databases['fileCache']) {
            // Database hasn't finished initializing yet.  Wait just a moment and retry...
            setTimeout(function() {
                go.Storage.cacheStyle(fileObj, kind);
            }, 10);
            return;
        }
        logDebug('cacheStyle caching ' + fileObj['filename']);
        var fileCache = GateOne.Storage.dbObject('fileCache');
        fileCache.put(kind, fileObj);
    },
    uncacheStyle: function(fileObj, kind) {
        /**:GateOne.Storage.uncacheStyle(fileObj, kind)

        Removes the given *fileObj* from the cache matching *kind* (if present).  The *kind* argument must be one of 'css', 'theme', or 'print'.

        .. note:: This will fail silently if the given *fileObj* does not exist in the cache.
        */
        if (!go.Storage.databases['fileCache']) {
            // Database hasn't finished initializing yet.  Wait just a moment and retry...
            setTimeout(function() {
                go.Storage.uncacheStyle(fileObj, kind);
            }, 10);
            return;
        }
        var fileCache = GateOne.Storage.dbObject('fileCache');
        fileCache.del(kind, fileObj['filename']);
    },
    cacheExpiredAction: function(message) {
        /**:GateOne.Storage.cacheExpiredAction(message)

        Attached to the 'go:cache_expired' WebSocket action; given a list of *message['filenames']*, removes them from the file cache.
        */
        var fileCache = GateOne.Storage.dbObject('fileCache'),
            filenames = message['filenames'],
            kind = message['kind'];
        filenames.forEach(function(filename) {
            logDebug("Deleting expired file: " + filename);
            fileCache.del(kind, filename);
        });
    },
    // TODO: Get this using an updateSequenceNum instead of modification times (it's more efficient)
    fileSyncAction: function(message) {
        /**:GateOne.Storage.fileCheckAction(message)

        This gets attached to the 'go:file_sync' WebSocket action; given a list of file objects which includes their modification times (*message['files']*) it will either load the file from the 'fileCache' database or request the file be delivered via the (server-side) 'go:file_request' WebSocket action.

        .. note:: Expects the 'fileCache' database be open and ready (normally it gets opened/initialized in :js:meth:`GateOne.initialize`).
        */
        // Example incoming message:
        //  {'files': [{'filename': 'foo.js', 'mtime': 1234567890123}]}
        var S = go.Storage,
            u = go.Utils;
        if (!go.Storage.fileCacheReady) {
            // Database hasn't finished initializing yet.  Wait just a moment and retry...
            if (S.deferLoadingTimers[message['files'][0]['filename']]) {
                clearTimeout(S.deferLoadingTimers[message['files'][0]['filename']]);
                S.deferLoadingTimers[message['files'][0]['filename']] = null;
            }
            S.deferLoadingTimers[message['files'][0]['filename']] = setTimeout(function() {
                S.fileSyncAction(message);
                S.deferLoadingTimers[message['files'][0]['filename']] = null;
            }, 10);
            return;
        }
        var remoteFiles = message['files'],
            fileCache = S.dbObject('fileCache'),
            callback = function(remoteFileObj, localFileObj) {
//                 console.log('remoteFileObj:');
//                 console.log(remoteFileObj);
//                 console.log('localFileObj:');
//                 console.log(localFileObj);
                if (localFileObj) {
                    // NOTE:  Using "!=" below instead of ">" so that debugging works properly
                    if (remoteFileObj['mtime'] != localFileObj['mtime']) {
                        logDebug(remoteFileObj['filename'] + " is cached but is older than what's on the server.  Requesting an updated version...");
                        go.ws.send(JSON.stringify({'go:file_request': remoteFileObj['filename']}));
                        // Even though filenames are hashes they will always remain the same.  The new file will overwrite the old entry in the cache.
                    } else {
                        // Load the local copy
                        logDebug("Loading " + remoteFileObj['filename'] + " from the cache...");
                        if (remoteFileObj['kind'] == 'js') {
                            if (remoteFileObj['requires']) {
                                logDebug("This file requires a certain script be loaded first: " + remoteFileObj['requires']);
                                if (!S.failedRequirementsCounter[remoteFileObj['filename']]) {
                                    S.failedRequirementsCounter[remoteFileObj['filename']] = 0;
                                }
                                if (!S.loadedFiles[remoteFileObj['requires']]) {
                                    setTimeout(function() {
                                        if (S.failedRequirementsCounter[remoteFileObj['filename']] >= 20) { // ~2 seconds
                                            // Give up
                                            logError("Failed to load " + remoteFileObj['filename'] + ".  Took too long waiting for " + remoteFileObj['requires']);
                                            return;
                                        }
                                        // Try again in a moment or so
                                        S.fileSyncAction(message);
                                        S.failedRequirementsCounter[remoteFileObj['filename']] += 1;
                                    }, 100);
                                    return;
                                } else {
                                    logDebug("Dependency loaded!");
                                    // Emulate an incoming message from the server to load this JS
                                    var messageObj = {'result': 'Success', 'filename': localFileObj['filename'], 'data': localFileObj['data'], 'element_id': remoteFileObj['element_id']};
                                    u.loadJSAction(messageObj, true); // true here indicates "don't cache" (already cached)
                                }
                            } else {
                                // Emulate an incoming message from the server to load this JS
                                var messageObj = {'result': 'Success', 'filename': localFileObj['filename'], 'data': localFileObj['data'], 'element_id': remoteFileObj['element_id']};
                                u.loadJSAction(messageObj, true); // true here indicates "don't cache" (already cached)
                            }
                        } else if (remoteFileObj['kind'] == 'css') {
                            // Emulate an incoming message from the server to load this CSS
                            var messageObj = {'result': 'Success', 'css': true, 'kind': localFileObj['kind'], 'filename': localFileObj['filename'], 'data': localFileObj['data'],  'element_id': remoteFileObj['element_id'], 'media': localFileObj['media']};
                            u.loadStyleAction(messageObj, true); // true here indicates "don't cache" (already cached)
                        }
                    }
                } else {
                    // File isn't cached; tell the server to send it
                    logDebug(remoteFileObj['filename'] + " is not cached.  Requesting...");
                    go.ws.send(JSON.stringify({'go:file_request': remoteFileObj['filename']}));
                }
            };
        remoteFiles.forEach(function(file) {
            logDebug("fileSyncAction() checking: " + file['filename']);
            var callbackWrap = u.partial(callback, file);
            fileCache.get(file['kind'], file['filename'], callbackWrap);
        });
        // Now create a list of all our cached filenames and ask the server if any of these no longer exist so we can keep things neat & tidy
        // The server's response will be handled by :js:meth:`GateOne.Storage.cacheExpiredAction`.
        var cleanupFiles = function(kind, objects) {
            logDebug('cleanupFiles()');
            var filenames = [];
            objects.forEach(function(jsObj) {
                filenames.push(jsObj['filename']);
            });
            if (filenames.length) {
                go.ws.send(JSON.stringify({'go:cache_cleanup': {'filenames': filenames, 'kind': kind}}));
            }
        };
        var cleanupJS = u.partial(cleanupFiles, 'js'),
            cleanupCSS = u.partial(cleanupFiles, 'css');
        // De-bounce (this function tends to run a lot when the user first connects)
        if (S.cacheCleanupTimer) {
            clearTimeout(S.cacheCleanupTimer);
            S.cacheCleanupTimer = null;
        }
        S.cacheCleanupTimer = setTimeout(function() {
            fileCache.dump('js', cleanupJS);
            fileCache.dump('css', cleanupCSS);
            S.cacheCleanupTimer = null;
        }, 1000);

    },
    onerror: function(e) {
        /**:GateOne.Storage.onerror(e)

        Attached as the errorback function in various storage operations; logs the given error (*e*).
        */
        logError("GateOne.Storage.onerror:");
        logError(e);
    },
    // storeObj['options'] == {keyPath: 'id', autoIncrement: true}
    _upgradeDB: function(DB, trans, callback) {
        /**:GateOne.Storage._upgradeDB(trans[, callback])

        DB version upgrade function attached to the `onupgradeneeded` event.  It creates our object store(s).

        If *callback* is given it will be called when the transaction is complete.
        */
        logDebug('upgradeDB('+DB+')');
        try {
            var model = GateOne.Storage._models[DB];
            if (!model) {
                logError("You must create a database model before creating a new database.");
                return false;
            }
            for (var storeName in model) {
                var store = GateOne.Storage.databases[DB].createObjectStore(storeName, model[storeName]);
            }
            // TODO: Investigate using indexes to speed things up.  Example (must happen inside a setVersion transaction):
//             GateOne.Storage.indexes[DB] = store.createIndex("urls", "url");
        } catch (e) {
            ;; // Nothing to see here
        }
        trans.oncomplete = function(e) {
            if (callback) { callback(GateOne.Storage.dbObject(DB)); }
        }
    },
    // Example usage:
    // var model = {'BookmarksDB': {'bookmarks': {keyPath: "url"}, 'tags': {keyPath: "name"}}};
    // GateOne.Storage.openDB('somedb', callback, model);
    // The DB will also then be accessible via:
    // GateOne.Storage.databases['somedb']
    openDB: function(DB, callback, model, /*opt*/version) {
        /**:GateOne.Storage.openDB(DB[, callback[, model]])

        Opens the given database (*DB*) for use and stores a reference to it as `GateOne.Storage.databases[DB]`.

        If *callback* is given, will execute it after the database has been opened successfuly.

        If this is the first time we're opening this database a *model* must be given.  Also, if the database already exists, the *model* argument will be ignored so it is safe to pass it with every call to this function.
        */
        if (GateOne.Storage._models[DB]) {
            // Existing model, check if there's a difference
            if (GateOne.Storage._models[DB] != model) {
                logDebug("Model difference!");
                logDebug(model);
                logDebug(GateOne.Storage._models[DB]);
            }
        } else {
            GateOne.Storage._models[DB] = model;
        }
        if (indexedDB) {
            logDebug('GateOne.Storage.openDB(): Opening indexedDB: ' + DB);
            var v = version || 1, // Database version
                openRequest = indexedDB.open(DB, v);
            openRequest.onsuccess = function(e) {
                logDebug('GateOne.Storage.openDB(): openRequest.onsuccess');
                GateOne.Storage.databases[DB] = e.target.result;
                // We can only create Object stores in a setVersion transaction;
                var needsUpdate;
                for (var storeName in model) {
                    if (!GateOne.Storage.databases[DB].objectStoreNames.contains(storeName)) {
                        needsUpdate = true;
                        break;
                    }
                }
                if(v != GateOne.Storage.databases[DB].version) {
                    needsUpdate = true;
                }
                if(needsUpdate) {
                    logInfo("GateOne.Storage.openDB(): Database version mismatch or missing store.  Creating/upgrading Database.");
                    // This is the old way of doing upgrades.  It should only ever be called in (much) older browsers...
                    if (typeof GateOne.Storage.databases[DB].setVersion === "function") {
                        logDebug("GateOne.Storage.openDB(): Using db.setVersion()");
                        var setVrequest = GateOne.Storage.databases[DB].setVersion(v);
                        // onsuccess is the only place we can create Object Stores
                        setVrequest.onfailure = GateOne.Storage.onerror;
                        setVrequest.onsuccess = function(evt) {
                            logDebug('GateOne.Storage.openDB(): setVrequest success');
                            GateOne.Storage._upgradeDB(DB, setVrequest.transaction, callback);
                        }
                    }
                } else {
                    if (callback) {
                        logDebug('GateOne.Storage.openDB(): No database upgrade necessary.  Calling callback...');
                        callback(GateOne.Storage.dbObject(DB));
                    }
                }
            };
            openRequest.onupgradeneeded = function(e) { // New (mostly standard) way
                logDebug('GateOne.Storage.openDB(): openRequest.onupgradeneeded()');
                GateOne.Storage.databases[DB] = e.target.result;
                GateOne.Storage._upgradeDB(DB, openRequest.transaction, callback);
            }
            openRequest.onfailure = GateOne.Storage.onerror;
        } else { // Fallback to localStorage if the browser doesn't support IndexedDB
            logDebug("GateOne.Storage.openDB(): IndexedDB is unavailable.  Falling back to localStorage...")
            if (!localStorage[go.prefs.prefix+DB]) {
                // Start out with an empty object
                var o = {};
                for (var storeName in model) {
                    o[storeName] = {autoIncrement: 0, data: {}};
                }
                localStorage[go.prefs.prefix+DB] = JSON.stringify(o);
            }
            if (callback) { callback(GateOne.Storage.dbObject(DB)); }
        }
    },
    clearDatabase: function(DB, storeName) {
        /**:GateOne.Storage.clearDatabase(DB, storeName)

        Clears the contents of the given *storeName* in the given database (*DB*).  AKA "the nuclear option."
        */
        logDebug('clearDatabase()');
        if (indexedDB) {
            logDebug('clearing indexedDB: ' + DB);
            var db = GateOne.Storage.databases[DB],
                trans = db.transaction(storeName, 'readwrite'),
                store = trans.objectStore(storeName),
                request = store.clear();
            trans.oncomplete = function(e) {
                logDebug('store deleted');
                var dbreq = indexedDB.deleteDatabase(DB);
                dbreq.onsuccess = function(e) {
                    logDebug('database deleted');
                }
                dbreq.onerror = GateOne.Storage.onerror;
            }
        } else {
            delete localStorage[go.prefs.prefix+DB];
        }
    }
});

window.GateOne = GateOne; // Make everything usable

})(window);

// Define a new sandbox to make garbage collection more efficient
(function(window, undefined) {
"use strict";

// Sandbox-wide shortcuts
var go = GateOne,
    u = go.Utils,
    v = go.Visual,
    prefix = go.prefs.prefix,
    gettext = go.i18n.gettext;

// Shortcuts for each log level
var logFatal = go.Logging.logFatal,
    logError = go.Logging.logError,
    logWarning = go.Logging.logWarning,
    logInfo = go.Logging.logInfo,
    logDebug = go.Logging.logDebug;

GateOne.Base.module(GateOne, "User", "1.1", ['Base', 'Utils', 'Visual']);
GateOne.User.userLoginCallbacks = []; // Each of these will get called after the server sends us the user's username, providing the username as the only argument.
GateOne.Base.update(GateOne.User, {
    // The User module is for things like logging out, synchronizing preferences with the server, and it is also meant to provide hooks for plugins to tie into so that actions can be taken when user-specific events occur.
    init: function() {
        // prefix gets changed inside of GateOne.initialize() so we need to reset it
        prefix = go.prefs.prefix;
        var prefsPanel = u.getNode('#'+prefix+'panel_prefs'),
            prefsPanelForm = u.getNode('#'+prefix+'prefs_form'),
            prefsPanelUserInfo = u.createElement('div', {'id': 'user_info', 'class': '✈user_info'}),
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
        go.Net.addAction('go:gateone_user', go.User.storeSession);
        go.Net.addAction('go:set_username', go.User.setUsername);
        go.Net.addAction('go:applications', go.User.applicationsAction);
    },
    setUsername: function(username) {
        /**:GateOne.User.setUsername(username)

        Sets GateOne.User.username using *username*.  Also provides hooks that plugins can have called after a user has logged in successfully.
        */
        // NOTE:  Primarily here to present something more easy to understand than the session ID :)
        var prefsPanelUserID = u.getNode('#'+prefix+'user_info_id');
        logDebug("setUsername(" + username + ")");
        go.User.username = username;
        if (prefsPanelUserID) {
            prefsPanelUserID.innerHTML = username + " ";
        }
        go.Events.trigger("go:user_login", username);
        if (go.User.userLoginCallbacks.length) {
            // Call any registered callbacks
            go.Logging.deprecated("userLoginCallbacks", "Use GateOne.Events.on('go:user_login', func) instead.");
            go.User.userLoginCallbacks.forEach(function(callback) {
                callback(username);
            });
        }
    },
    logout: function(redirectURL) {
        // Logs the user out of Gate One by deleting the "user" cookie and everything related to Gate One in localStorage
        // If *redirectURL* is given, the user will be redirected to that URL after they are logged out.
        // Remove all Gate One-specific items from localStorage by deleting everything that starts with GateOne.prefs.prefix.
        for (var key in localStorage) {
            if (u.startsWith(prefix, key)) {
                delete localStorage[key];
            }
        }
        if (!redirectURL) {
            redirectURL = go.prefs.url;
        } else {
            redirectURL = '';
        }
        go.Events.trigger("go:user_logout", go.User.username);
        // NOTE: This takes care of deleting the "user" cookie
        u.xhrGet(go.prefs.url+'auth?logout=True&redirect='+redirectURL, function(response) {
            logDebug("Logout Response: " + response);
            // Need to modify the URL to include a random username so that when a user logs out with PAM authentication enabled they will be asked for their username/password again
            var url = response.replace(/:\/\/(.*@)?/g, '://'+u.randomString(8)+'@');
            v.displayMessage("You have been logged out.  Redirecting to: " + url);
            setTimeout(function() {
                window.location.href = url;
            }, 2000);
        });
    },
    storeSession: function(message) {
        //  Stores the 'gateone_user' data in localStorage in a nearly identical fashion to how it gets stored in the 'gateone_user' cookie.
        localStorage[GateOne.prefs.prefix+'gateone_user'] = message;
    },
    applicationsAction: function(apps) {
        /**:GateOne.User.applicationsAction()

        Sets `GateOne.User.applications` to be the given list of *apps* (which is the list of applications the user is allowed to run).
        */
        // NOTE: Unlike GateOne.loadedApplications--which may hold applications this user may not have access to--this tells us which applications the user can actually use.  That way we can show/hide just those things that the user has access on the server.
        GateOne.User.applications = apps;
        // NOTE: In most cases applications' JavaScript will not be sent to the user if that user is not allowed to run it but this does not cover all use case scenarios.  For example, a user that has access to an application only if certain conditions are met (e.g. during a specific time window).  In those instances we don't want to force the user to reload the page...  We'll just send a new applications list when it changes (which is a feature that's on the way).
        GateOne.Events.trigger("go:applications", apps);
    },
    preference: function(title, content, /*opt*/callback) {
        /**:GateOne.User.preference(title, content)

        Adds a new section to the preferences panel using the given *title* and *content*.  The *title* will be used to create a link that will bring up *content*.  The *content* will be placed inside the preferences form.

        To place a preference under a subsection (e.g. Terminal -> SSH) provide the *title* like so:  "Terminal:SSH".

        If *callback* is given it will be attacheed to the "go:save_prefs" event.
        */
        var parentTitle, parentItem, existingParentUL, u = go.Utils,
            U = go.User,
            E = go.Events,
            prefix = go.prefs.prefix,
            prefsList = u.getNode('#'+prefix+'prefs_list'),
            prefsListUL = u.getNode('#'+prefix+'prefs_list_ul'),
            sublistUL = u.createElement('ul', {'class': '✈sub1'}),
            prefsContent = u.getNode('#'+prefix+'prefs_content'),
            contentContainer = u.createElement('div', {'class': '✈prefs_content_item'}),
            prefsItem = u.createElement('li'),
            showHide = function(e) {
                // Shows the clicked item's prefs and hides the others
                var self = this,
                    elem = U.prefsItems[self.title],
                    items = u.toArray(u.getNodes('.✈prefs_content_item')),
                    titles = u.toArray(u.getNodes('#'+prefix+'prefs_list_ul li'));
                items.forEach(function(item) {
                    item.style.display = 'none';
                });
                titles.forEach(function(item) {
                    item.classList.remove('✈active');
                });
                setTimeout(function() {
                    contentContainer.style.display = '';
                    self.classList.add('✈active');
                }, 10);
            };
        if (title.split(':').length > 1) {
            parentTitle = title.split(':')[0],
            title = title.split(':')[1];
        }
        prefsItem.innerHTML = title;
        prefsItem.title = title;
        prefsItem.addEventListener('click', showHide, false);
        if (parentTitle) {
            parentItem = u.getNode('#'+prefix+'prefs_list_ul [title='+parentTitle+']');
            existingParentUL = parentItem.querySelector('ul');
            if (!existingParentUL) {
                // Add a <ul> container for sub-items
                u.insertAfter(sublistUL, parentItem);
                existingParentUL = sublistUL;
            }
            existingParentUL.appendChild(prefsItem);
        } else {
            prefsListUL.appendChild(prefsItem);
        }
        if (!U.prefsItems) {
            U.prefsItems = {};
        }
        contentContainer.style.display = 'none'; // Hidden by default
        U.prefsItems[title] = contentContainer;
        if (typeof(content) == "string") {
            contentContainer.innerHTML = content;
        } else {
            contentContainer.appendChild(content);
        }
        prefsContent.appendChild(contentContainer);
        if (callback) {
            E.on("go:save_prefs", callback);
        }
    }
});

GateOne.Base.module(GateOne, "Events", '1.0', ['Base', 'Utils']);
GateOne.Events.callbacks = {};
GateOne.Base.update(GateOne.Events, {
    /**:GateOne.Events

    An object for event-specific stuff.  Inspired by Backbone.js Events.
    */
    init: {
        // Nothing here yet :)
    },
    _setupCallbacks: function(f) {
        // This can be used to attach before and after callbacks to any function in Gate One.  It is used like so:
        // GateOne.Base.setupCallbacks(GateOne.Whatever.Whatever);
        // Why not just call this on every function automatically?  Memory/resources.  No reason to attach empty arrays to every method.
        // NOTE: Only works on objects that were created/updated via GateOne.Base.update();
        var self = this;
        if (!f.__parent__) {
            logError('_setupCallbacks: Cannot attach to provided function (no __parent__!).');
        }
        var newFunc = function() {
            var args = arguments,
                callbackResult = null;
            newFunc.callBefore.forEach(function(callObj) {
                var context = (callObj.context || this),
                    newArgs = callObj.callback.apply(context, args);
                // Allow the callBefore to modify the arguments passed to the wrapped function
                if (newArgs !== undefined) {
                    args = newArgs;
                }
            });
            var result = f.apply(self, args); // 'self' here makes sure the callling function retains the proper 'this'
            newFunc.callAfter.forEach(function(callObj) {
                var context = (callObj.context || this);
                if (typeof(callObj.callback) == 'function') {
                    // This allows manipulating results before they're actually returned
                    // If the callback attached to this function returns something other than undefined it will replace the called function's result
                    callbackResult = callObj.callback.call(context, result); // Passing the result of the call to the callback so it can modify it before it is finally returned
                }
            });
            if (callbackResult !== undefined) {
                result = callbackResult;
            }
            return result;
        }
        newFunc.callBefore = [];
        newFunc.callAfter = [];
        f.__parent__[f.__name__] = newFunc; // Update in place (because it's awesome)
        return newFunc;
    },
    before: function(f, callback, context) {
        /**:GateOne.Events.before(f, callback, context)

        Attaches the given *callback* to the given function (*f*) to be called **before** *f* is called.  If provided, *callback* will be called with the given *context* via `callback.apply(context)`.  Otherwise *callback* will be called with whatever arguments were given to *f* via `callback.apply(arguments)`.

        If the given *callback* returns a value other than `undefined` that value will be passed to *f* as its arguments.  This allows *callback* to modify the arguments passed to *f* before it is called; aka the decorator pattern.

        Returns the modified function (*f*).
        */
        var E = GateOne.Events,
            callObj = {
                'callback': callback,
                'context': context
            };
        if (!f.callBefore) {
            f = E._setupCallbacks(f);
        }
        f.callBefore.push(callObj);
        return f;
    },
    after: function(f, callback, context) {
        /**:GateOne.Events.after(f, callback, context)

        Attaches the given *callback* to the given function (*f*) to be called **after** it (*f*) has been executed.  If provided, the *callback* will be called with the given *context*.  Otherwise *callback* will be called with whatever arguments were given to the function (*f*).
        */
        var E = GateOne.Events,
            callObj = {
                'callback': callback,
                'context': context
            };
        if (!f.callAfter) {
            f = E._setupCallbacks(f);
        }
        f.callAfter.push(callObj);
        return f;
    },
    on: function(events, callback, context, times) {
        /**:GateOne.Events on(events, callback, context, times)

        Adds the given *callback* / *context* combination to the given *events*; to be called when the given *events* are triggered.

        :param string events: A space-separated list of events that will have the given *callback* / *context* attached.
        :param function callback: The function to be called when the given *event* is triggered.
        :param object context: An object that will be bound to *callback* as `this` when it is called.
        :param integer times: The number of times this callback will be called before it is removed from the given *event*.

        Examples::

            > // A little test function
            > var testFunc = function(args) { console.log('args: ' + args + ', this.foo: ' + this.foo) };
            > // Call testFunc whenever the "test_event" event is triggered
            > GateOne.Events.on("test_event", testFunc);
            > // Fire the test_event with 'an argument' as the only argument
            > GateOne.Events.trigger("test_event", 'an argument');
            args: an argument, this.foo: undefined
            > // Remove the event so we can change it
            > GateOne.Events.off("test_event", testFunc);
            > // Now let's pass in a context object
            > GateOne.Events.on("test_event", testFunc, {'foo': 'bar'});
            > // Now fire it just like before
            > GateOne.Events.trigger("test_event", 'an argument');
            args: an argument, this.foo: bar
        */
        var E = GateOne.Events;
        events.split(/\s+/).forEach(function(event) {
            var callList = E.callbacks[event],
                callObj = {
                    callback: callback,
                    context: context,
                    times: times
                };
            if (!callList) {
                // Initialize the callback list for this event
                callList = E.callbacks[event] = [];
            }
            callList.push(callObj);
        });
        return this;
    },
    off: function(events, callback, context) {
        /**:GateOne.Events off(events, callback, context)

        Removes the given *callback* / *context* combination from the given *events*

        :param string events: A space-separated list of events.
        :param function callback: The function that's attached to the given events to be removed.
        :param object context: The context attached to the given event/callback to be removed.

        Example::

            > GateOne.Events.off("new_terminal", someFunction);
        */
        var E = GateOne.Events, eventList, i, n;
        if (!arguments.length) {
            E.callbacks = {}; // Clear all events/callbacks
        } else {
            eventList = events ? events.split(/\s+/) : keys(E.callbacks);
            for (i in eventList) {
                var event = eventList[i],
                    callList = E.callbacks[event];
                if (callList) { // There's a matching event
                    var newList = [];
                    for (n in callList) {
                        if (callback && callList[n].callback.toString() == callback.toString()) {
                            if (context && callList[n].context != context) {
                                newList.push(callList[n]);
                            } else if (context == null && callList[n].context) {
// If the context is undefined assume the dev wants to remove all matching callbacks for this event
// However, if the context was set to null assume they only want to match callbacks that have no context.
                                newList.push(callList[n]);
                            }
                        } else if (context && callList[n].context != context) {
                            newList.push(callList[n]);
                        }
                    }
                }
                E.callbacks[event] = newList;
            }
        }
        return this;
    },
    once: function(events, callback, context) {
        /**:GateOne.Events once(events, callback, context)

        A shortcut that performs the equivalent of GateOne.Events.on(events, callback, context, 1)
        */
        return GateOne.Events.on(events, callback, context, 1);
    },
    trigger: function(events) {
        /**:GateOne.Events trigger(events)

        Triggers the given *events*.  Any additional provided arguments will be passed to the callbacks attached to the given events.

        :param string events: A space-separated list of events to trigger

        Example::

            > // The '1' below will be passed to each callback as the only argument
            > GateOne.Events.trigger("new_terminal", 1);
        */
        logDebug("Triggering " + events);
        var E = GateOne.Events,
            args = Array.prototype.slice.call(arguments, 1); // Everything after *events*
        events.split(/\s+/).forEach(function(event) {
            var callList = E.callbacks[event];
            if (!callList) {
                // Try the old, un-prefixed event name too for backwards compatibility
                event = event.split(':')[1];
                if (event) {
                    callList = E.callbacks[event];
                }
                // NOTE: This deprecated check will go away eventually!
                if (callList) {
                    // Warn about this being deprecated
                    GateOne.Logging.deprecated("Event: " + event, "Events now use prefixes such as 'go:' or 'terminal:'.");
                }
            }
            if (callList) {
                callList.forEach(function(callObj) {
                    callObj.callback.apply(callObj.context || this, args);
                    if (callObj.times) {
                        callObj.times -= 1;
                        if (callObj.times == 0) {
                            E.off(events, callObj.callback, callObj.context);
                        }
                    }
                });
            }
        });
        return this;
    }
});
go.Icons['close'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="closeGradient" y2="252.75" gradientUnits="userSpaceOnUse" y1="232.75" x2="487.8" x1="487.8"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" fill="url(#closeGradient)"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';
go.Icons['application'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="infoGradient" y2="294.5" gradientUnits="userSpaceOnUse" x2="253.59" gradientTransform="translate(244.48201,276.279)" y1="276.28" x1="253.59"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-396.60679,-820.39654)"><g transform="translate(152.12479,544.11754)"><path fill="url(#infoGradient)" d="m257.6,278.53c-3.001-3-7.865-3-10.867,0-3,3.001-3,7.868,0,10.866,2.587,2.59,6.561,2.939,9.53,1.062l4.038,4.039,2.397-2.397-4.037-4.038c1.878-2.969,1.527-6.943-1.061-9.532zm-1.685,9.18c-2.07,2.069-5.426,2.069-7.494,0-2.071-2.069-2.071-5.425,0-7.494,2.068-2.07,5.424-2.07,7.494,0,2.068,2.069,2.068,5.425,0,7.494z"/></g></g></svg>';
GateOne.Icons['prefs'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="prefsGradient" x1="85.834" gradientUnits="userSpaceOnUse" x2="85.834" gradientTransform="translate(288.45271,199.32483)" y1="363.23" y2="388.56"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.71050762,0,0,0.71053566,-256.93092,-399.71681)"><path fill="url(#prefsGradient)" d="m386.95,573.97c0-0.32-0.264-0.582-0.582-0.582h-1.069c-0.324,0-0.662-0.25-0.751-0.559l-1.455-3.395c-0.155-0.277-0.104-0.69,0.123-0.918l0.723-0.723c0.227-0.228,0.227-0.599,0-0.824l-1.74-1.741c-0.226-0.228-0.597-0.228-0.828,0l-0.783,0.787c-0.23,0.228-0.649,0.289-0.931,0.141l-2.954-1.18c-0.309-0.087-0.561-0.423-0.561-0.742v-1.096c0-0.319-0.264-0.581-0.582-0.581h-2.464c-0.32,0-0.583,0.262-0.583,0.581v1.096c0,0.319-0.252,0.657-0.557,0.752l-3.426,1.467c-0.273,0.161-0.683,0.106-0.912-0.118l-0.769-0.77c-0.226-0.226-0.597-0.226-0.824,0l-1.741,1.742c-0.229,0.228-0.229,0.599,0,0.825l0.835,0.839c0.23,0.228,0.293,0.642,0.145,0.928l-1.165,2.927c-0.085,0.312-0.419,0.562-0.742,0.562h-1.162c-0.319,0-0.579,0.262-0.579,0.582v2.463c0,0.322,0.26,0.585,0.579,0.585h1.162c0.323,0,0.66,0.249,0.753,0.557l1.429,3.369c0.164,0.276,0.107,0.688-0.115,0.916l-0.802,0.797c-0.226,0.227-0.226,0.596,0,0.823l1.744,1.741c0.227,0.228,0.598,0.228,0.821,0l0.856-0.851c0.227-0.228,0.638-0.289,0.925-0.137l2.987,1.192c0.304,0.088,0.557,0.424,0.557,0.742v1.141c0,0.32,0.263,0.582,0.583,0.582h2.464c0.318,0,0.582-0.262,0.582-0.582v-1.141c0-0.318,0.25-0.654,0.561-0.747l3.34-1.418c0.278-0.157,0.686-0.103,0.916,0.122l0.753,0.758c0.227,0.225,0.598,0.225,0.825,0l1.743-1.744c0.227-0.226,0.227-0.597,0-0.822l-0.805-0.802c-0.223-0.228-0.285-0.643-0.134-0.926l1.21-3.013c0.085-0.31,0.423-0.559,0.747-0.562h1.069c0.318,0,0.582-0.262,0.582-0.582v-2.461zm-12.666,5.397c-2.29,0-4.142-1.855-4.142-4.144s1.852-4.142,4.142-4.142c2.286,0,4.142,1.854,4.142,4.142s-1.855,4.144-4.142,4.144z"/></g></svg>';
GateOne.Icons['back_arrow'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="backGradient" y2="449.59" gradientUnits="userSpaceOnUse" x2="235.79" y1="479.59" x1="235.79"><stop class="✈panelstop1" offset="0"/><stop class="✈panelstop2" offset="0.4944"/><stop class="✈panelstop3" offset="0.5"/><stop class="✈panelstop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-360.00001,-529.36218)"><g transform="matrix(0.6,0,0,0.6,227.52721,259.60639)"><circle d="m 250.78799,464.59299 c 0,8.28427 -6.71572,15 -15,15 -8.28427,0 -15,-6.71573 -15,-15 0,-8.28427 6.71573,-15 15,-15 8.28428,0 15,6.71573 15,15 z" cy="464.59" cx="235.79" r="15" fill="url(#backGradient)"/><path fill="#FFF" d="m224.38,464.18,11.548,6.667v-3.426h5.003c2.459,0,5.24,3.226,5.24,3.226s-0.758-7.587-3.54-8.852c-2.783-1.265-6.703-0.859-6.703-0.859v-3.425l-11.548,6.669z"/></g></g></svg>';
GateOne.Icons['panelclose'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" class="✈svgplain"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';

})(window);

// This is helpful when debugging
GateOne.exportShortcuts = function() {
    window.go = GateOne;
    window.prefix = GateOne.prefs.prefix;
    window.u = GateOne.Utils;
    window.v = GateOne.Visual;
    window.E = GateOne.Events;
    window.t = GateOne.Terminal;
}

