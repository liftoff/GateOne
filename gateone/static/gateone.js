// -*- coding: utf-8 -*-
/*
COPYRIGHT NOTICE
================

gateone.js and all related original code...

Copyright 2013 Liftoff Software Corporation

Note: Icons came from the folks at GoSquared.  Thanks guys!
http://www.gosquared.com/liquidicity/archives/122

*/

// General TODOs
// TODO: Separate creation of the various panels into their own little functions so we can efficiently neglect to execute them if in embedded mode.
// TODO: Add a nice tooltip function to GateOne.Visual that all plugins can use that is integrated with the base themes.
// TODO: Make it so that variables like GateOne.Terminal.terminals use GateOne.prefs.prefix so you can have more than one instance of Gate One embedded on the same page without conflicts.
// TODO: This is a big one:  Support multiple simultaneous Gate One server connections/instances.

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
if (!window.IDBTransaction && window.webkitIDBTransaction) {
    window.IDBTransaction = window.webkitIDBTransaction;
}
if (!window.IDBKeyRange && window.webkitIDBKeyRange) {
    window.IDBKeyRange = window.webkitIDBKeyRange;
}

// getUserMedia check
var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || null);

// Sandbox-wide shortcuts
var noop = function(a) { return a }, // Let's us reference functions that may or may not be available (see logging shortcuts below).
    ESC = String.fromCharCode(27), // Saves a lot of typing and it's easy to read
// Log level shortcuts for each log level (these get properly assigned in GateOne.initialize() if GateOne.Logging is available)
    logFatal = noop,
    logError = noop,
    logWarning = noop,
    logInfo = noop,
    logDebug = noop,
    deprecated = noop,
    hidden, visibilityChange,
    mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel";

// Choose appropriate Page Visibility API attribute
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

// Define GateOne
var GateOne = GateOne || function() {};
/**:GateOne

The base object for all Gate One modules/plugins.
*/
GateOne.__name__ = "GateOne";
GateOne.__version__ = "1.2";
GateOne.__commit__ = "20170623083842";
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
/**:GateOne.Base

The Base module is mostly copied from `MochiKit <http://mochikit.com/>`_.
*/
GateOne.loadedModules = [];
GateOne.loadedApplications = {};
GateOne.initializedModules = []; // So we don't accidentally call a plugin's init() or postInit() functions twice

GateOne.Base.module = function(parent, name, version, deps) {
    /**:GateOne.Base.module(parent, name, version[, deps])

    Creates a new *name* module in a *parent* namespace. This function will create a new empty module object with *__name__*, *__version__*, *toString* and *__repr__* properties. It will also verify that all the strings in deps are defined in parent, or an error will be thrown.

    :param parent: The parent module or namespace (object).
    :param name: A string representing the new module name.
    :param version: The version string for this module (e.g. "1.0").
    :param deps: An array of module dependencies, as strings.

    The following example would create a new object named, "Net", attach it to the :js:data:`GateOne` object, at version "1.0", with :js:attr:`GateOne.Base` and :js:attr:`GateOne.Utils` as dependencies:

        >>> GateOne.Base.module(GateOne, 'Net', '1.0', ['Base', 'Utils']);
        >>> GateOne.Net.__repr__();
        "[GateOne.Net 1.0]"
        >>> GateOne.Net.NAME;
        "GateOne.Net"
    */
    var module = parent[name] = parent[name] || {},
        prefix = (parent.__name__ ? parent.__name__ + "." : "");
    module.__name__ = prefix + name;
    module.__version__ = version;
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
GateOne.Base.dependencyTimeout = 30000; // 30 seconds
GateOne.Base.dependencyRetries = {};
GateOne.Base.superSandbox = function(name, dependencies, func) {
    /**:GateOne.Base.superSandbox(name, dependencies, func)

    A sandbox to wrap JavaScript which will delay-repeat loading itself if *dependencies* are not met.  If dependencies cannot be found by the time specified in `GateOne.Base.dependencyTimeout` an exception will be thrown.  Here's an example of how to use this function:

    .. code-block:: javascript

        GateOne.Base.superSandbox("GateOne.ExampleApp", ["GateOne.Terminal"], function(window, undefined) {
            "use strict"; // Don't forget this!

            var stuff = "Put your code here".

        });

    The above example would ensure that `GateOne.Terminal` is loaded before the contents of the superSandboxed function are loaded.

    .. note:: Sandboxed functions are always passed the ``window`` object as the first argument.

    You can put whatever globals you like in the dependencies; they don't have to be GateOne modules.  Here's another example:

    .. code-block:: javascript

        // Require underscore.js and jQuery:
        GateOne.Base.superSandbox("GateOne.ExampleApp", ["_", "jQuery"], function(window, undefined) {
            "use strict";

            var stuff = "Put your code here".

        });

    :name: Name of the wrapped function.  It will be used to call any `init()` or `postInit()` functions.  If you just want dependencies checked you can just pass any unique string.
    :dependencies: An array of strings containing the JavaScript objects that must be present in the global namespace before we load the contained JavaScript.
    :func: A function containing the JavaScript code to execute as soon as the dependencies are available.
    */
//     console.log('superSandbox('+name+')');
    var missingDependency = false,
        exceptionMsg = "Exception calling dependency function",
        getType = {}, // Only used to check if an object is a function
        getParent = function(parent, depArray) {
            // Returns the final parent object if it can be found in `window`.  Otherwise returns `false`.
            // *depArray* should be the result of `"Some.Dependency".split('.')`
            var dep = depArray.shift();
            if (dep !== undefined) {
                if (!(dep in parent)) {
                    return false;
                }
                return getParent(parent[dep], depArray);
            }
            return parent;
        },
        dependencyFailure = function() {
            if (!GateOne.Base.dependencyRetries[name]) {
                GateOne.Base.dependencyRetries[name] = 1; // 1 instead of 0 so the negative conditional above works
            } else {
                GateOne.Base.dependencyRetries[name] += 50;
            }
            if (GateOne.Base.dependencyRetries[name] > GateOne.Base.dependencyTimeout) {
                throw 'Failed to load ' + name + ' due to missing dependencies: ' + dependencies;
            }
            missingDependency = true;
        };
    dependencies.forEach(function(dependency) {
        if (dependency.substring) {
            // It's a string; treat it as a global variable we need to be present
            var deps = dependency.split('.');
            if (!getParent(window, deps)) {
                // Retry again in 50ms and start the counter
                dependencyFailure();
            }
        } else if (getType.toString.call(dependency) === '[object Function]') {
            // It's a function; it must return true to continue
            try {
                if (!dependency()) {
                    dependencyFailure();
                } else {
                    if (GateOne.Logging && GateOne.Logging.logDebug) {
                        GateOne.Logging.logDebug("Dependency check function for "+dependency+" succeeded!");
                    } else {
                        // Only uncomment this if you need to debug this functionality (noisy!)
//                         console.log("Dependency check function for "+dependency+" succeeded!");
                    }
                }
            } catch (e) {
                if (GateOne.Logging && GateOne.Logging.logError) {
                    GateOne.Logging.logError(exceptionMsg, e);
                } else {
                    console.log(exceptionMsg, e);
                }
                dependencyFailure();
            }
        }
    });
    if (!GateOne.initialized || missingDependency) {
        setTimeout(function() {
            GateOne.Base.superSandbox(name, dependencies, func);
        }, 50); // 50ms increments
    } else {
        // Load 'er up!
        func(window);
        // Now try loading init() and postInit() functions
        var moduleObj = getParent(window, name.split('.'));
        if (go.initializedModules.indexOf(name) == -1) {
            if (typeof(moduleObj.init) == "function") {
                moduleObj.init();
            }
            if (moduleObj.__appinfo__) {
                // This is an application
                go.loadedApplications[moduleObj.__appinfo__.name] = moduleObj;
            }
            go.initializedModules.push(name);
        }
        if (go.Utils._ranPostInit.indexOf(name) == -1) {
            if (typeof(moduleObj.postInit) == "function") {
                moduleObj.postInit();
            }
            go.Utils._ranPostInit.push(name);
        }
        if (moduleObj) { moduleObj.__initialized__ = true; }
    }
}
GateOne.Base.module(GateOne, "Base", "1.2", []);
GateOne.Base.update = function(self, obj/*, ... */) {
    /**:GateOne.Base.update(self, obj[, obj2[, objN]])

    Mutate self by replacing its key:value pairs with those from other object(s). Key:value pairs from later objects will overwrite those from earlier objects.

    If *self* is `null`, a new Object instance will be created and returned.

    .. warning:: This mutates *and* returns *self*.

    :param object self: The object you wish to mutate with *obj*.
    :param obj: Any given JavaScript object (e.g. {}).
    :returns: *self*
    */
    if (self === null || self === undefined) {
        self = {};
    }
    for (var i = 1; i < arguments.length; i++) {
        var o = arguments[i];
        if (typeof(o) != 'undefined' && o !== null) {
            for (var k in o) {
                self[k] = o[k];
                if (self[k]) {
                    if (!self[k].__name__) {
                        try {
                            self[k].__name__ = k;
                        } catch (e) {}; // Just ignore these errors
                    }
                }
            }
        }
    }
    return self;
};
GateOne.Base.module(GateOne, "i18n", "1.0");
/**:GateOne.i18n

A module to store and retrieve localized translations of strings.
*/
GateOne.i18n.translations = {}; // Stores the localized translation of various strings
GateOne.Base.update(GateOne.i18n, {
    gettext: function(stringOrArray) {
        /**:GateOne.i18n.gettext(stringOrArray)

        Returns a localized translation of *stringOrArray* if available.  If *stringOrArray* is an array it will be joined into a single string via ``join('')``.

        If no translation of *stringOrArray* is available the text will be returned as-is (or joined, in the case of an Array).
        */
        if (GateOne.Utils.isArray(stringOrArray)) {
            stringOrArray = stringOrArray.join('');
        }
        if (GateOne.i18n.translations[stringOrArray]) {
            return GateOne.i18n.translations[stringOrArray][1];
        }
        return stringOrArray;
    },
    registerTranslationAction: function(table) {
        /**:GateOne.i18n.registerTranslationAction(table)

        Attached to the `go:register_translation` WebSocket action; stores the translation *table* in `GateOne.i18n.translations`.
        */
        GateOne.i18n.translations = table;
    },
    setLocales: function(locales) {
        /**:GateOne.i18n.setLocales(locales)

        Tells the Gate One server to set the user's locale to *locale*.  Example:

            >>> GateOne.i18n.setLocales(['fr_FR', 'en-US', 'en']);

        .. note:: Typically you'd pass `navigator.languages` to this function.
        */
        GateOne.ws.send(JSON.stringify({'go:set_locales': locales}));
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
    authenticate: true, // If false, do not attempt to authenticate the user.  Only set to false if doing something like "read only" or "broadcast only" stuff.
    embedded: false, // Equivalent to {showTitle: false, showToolbar: false} and certain keyboard shortcuts won't be registered.
    fillContainer: true, // If set to true, #gateone will fill itself out to the full size of its parent element
    fontSize: '100%', // The font size that will be applied to the goDiv element (so users can adjust it on-the-fly)
    goDiv: '#gateone', // Default element to place gateone inside.
    keepaliveInterval: 60000, // How often we try to ping the Gate One server to check for a connection problem.
    prefix: 'go_', // What to prefix element IDs with (in case you need to avoid a name conflict).  NOTE: There are a few classes that use the prefix too.
    showAppChooser: true, // Whether or not to show the application chooser
    showTitle: true, // If false, the title will not be shown in the sidebar.
    showToolbar: true, // If false, the toolbar will now be shown in the sidebar.
    skipChecks: false, // Tells GateOne.init() to skip capabilities checks (in case you have your own or are happy with silent failures).
    style: {}, // Whatever CSS the user wants to apply to #gateone.  NOTE: Width and height will be skipped if fillContainer is true.
    theme: 'black', // The theme to use by default (e.g. 'black', 'white', etc).
    pingTimeout: 10000, // How long to wait before we declare that the connection with the Gate One server has timed out (via a ping/pong response).
    url: null // URL of the GateOne server.  Will default to whatever is in window.location.
}
GateOne.noSavePrefs = {
/**:GateOne.noSavePrefs

Properties in this object will get ignored when :js:attr:`GateOne.prefs` is saved to ``localStorage``
*/
    // Plugin authors:  If you want to have your own property in GateOne.prefs but it isn't a per-user setting, add your property here
    auth: null,
    embedded: null,
    fillContainer: null,
    goDiv: null, // Why an object and not an array?  So the logic is simpler:  "for (var objName in noSavePrefs) ..."
    prefix: null,
    showAppChooser: null,
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
/**:GateOne.Icons

All of Gate One's SVG icons are stored in here (nothing really special about it).
*/
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
        /**:GateOne.restoreDefaults()

        Restores all of Gate One's user-specific prefs to default values.  Primarily used in debugging Gate One.
        */
        var go = GateOne;
        go.prefs = {
            auth: go.prefs.auth, // Preserve
            authenticate: true,
            embedded: go.prefs.embedded, // Preserve
            fillContainer: go.prefs.fillContainer, // Preserve
            fontSize: '100%',
            goDiv: go.prefs.goDiv, // Preserve
            keepaliveInterval: 60000,
            prefix: go.prefs.prefix, // Preserve
            showTitle: go.prefs.showTitle, // Preserve
            showToolbar: go.prefs.showToolbar, // Preserve
            skipChecks: go.prefs.skipChecks, // Preserve
            style: go.prefs.style, // Preserve
            theme: 'black',
            pingTimeout: 10000,
            url: go.prefs.url // Preserve
        }
        go.Events.trigger('go:restore_defaults');
        go.Utils.savePrefs(true); // 'true' here skips the notification
    },
    // This starts up GateOne using the given *prefs*
    init: function(prefs, /*opt*/callback) {
        /**:GateOne.init(prefs[, callback])

        Initializes Gate One using the provided *prefs*.  Also performs the initial authentication, performs compatibility checks, and sets up basic preferences.

        If *callback* is provided it will be called after :js:meth:`GateOne.Net.connect` completes.
        */
        var go = GateOne,
            u = go.Utils,
            criticalFailure = false,
            missingCapabilities = [], setting,
            queryPrefs = JSON.parse(u.getQueryVariable('go_prefs') || '{}'),
            parseResponse = function(response) {
                if (response == 'authenticated') {
                    // Connect (GateOne.initialize() will be called after the connection is made)
                    logDebug("GateOne.init() calling GateOne.Net.connect()");
                    go.Net.connect(callback);
                } else {
                    // Regular auth.  Clear the cookie and redirect the user...
                    go.Net.reauthenticate();
                }
            };
        // Update GateOne.prefs with the settings provided in the calling page
        for (setting in prefs) {
            go.prefs[setting] = prefs[setting];
        }
        // Now apply any settings given via query string params
        for (setting in queryPrefs) {
            go.prefs[setting] = queryPrefs[setting];
        }
        // Make our prefix unique to our location
        go.prefs.prefix += go.location + '_';
        // Capabilities Notifications
        if (!go.prefs.skipChecks) {
            if (!WebSocket) {
                logError(gettext('Browser failed WebSocket support check.'));
                missingCapabilities.push(gettext("Sorry but your web browser does not appear to support WebSockets.  Gate One requires WebSockets in order to (efficiently) communicate with the server."));
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
                    logError(gettext('Browser failed Blob support check.'));
                    missingCapabilities.push(gettext("Your browser does not appear to support the HTML5 File API (<a href='https://developer.mozilla.org/en-US/docs/DOM/Blob'>Blob objects</a>, specifically).  Some features related to saving files will not work."));
                }
            }
            // Warn about window.URL or window.webkitURL
            if (!urlObj) {
                logError(gettext('Browser failed window.URL object support check.'));
                missingCapabilities.push(gettext("Your browser does not appear to support the <a href='https://developer.mozilla.org/en-US/docs/DOM/window.URL.createObjectURL'>window.URL</a> object.  Some features related to saving files will not work."));
            }
            if (missingCapabilities.length) {
                // Notify the user of the problems and cancel the init() process
                if (criticalFailure) {
                    alert(gettext("Sorry but your browser is missing the following capabilities which are required to run Gate One: \n" + missingCapabilities.join('\n') + "\n\nGate One will not be loaded."));
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
                        disableWarningLabel.innerHTML = gettext("Don't display this warning again");
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
            if (prefs.showToolbar === undefined) {
                go.prefs.showToolbar = false;
            }
            if (prefs.showTitle === undefined) {
                go.prefs.showTitle = false;
            }
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
            logDebug(gettext("Using API authentiation object: ") + go.prefs.auth);
            go.Net.connect(callback);
        } else if (go.prefs.authenticate) {
            // Check if we're authenticated after all the scripts are done loading
            u.xhrGet(authCheck, parseResponse); // The point of this function is to let the server verify the cookie for us
        } else {
            // Fallback to connecting without authentication
            go.Net.connect(callback);
        }
        // Cache our node for easy reference
        go.node = u.getNode(go.prefs.goDiv);
        // Empty out anything that might be already-existing in goDiv
        go.node.innerHTML = '';
        // Open our cache database
        go.Storage.openDB('fileCache', go.Storage.cacheReady, go.Storage.fileCacheModel, go.Storage.dbVersion);
    },
    initialize: function() {
        /**:GateOne.initialize()

        Called after :js:meth:`GateOne.init`, Sets up Gate One's graphical elements (panels and whatnot) and attaches events related to visuals (browser resize and whatnot).
        */
//         console.log("GateOne.initialize()");
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
            v = go.Visual,
            E = go.Events,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            gridwrapper, style, gridWidth, adjust, paddingRight,
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
            toolbar = u.createElement('div', {'id': 'toolbar', 'class': '✈toolbar'}),
            toolbarIconClose = u.createElement('div', {'id': 'icon_close', 'class': '✈toolbar_icon', 'title': "Close This Workspace"}),
            toolbarIconNewWorkspace = u.createElement('div', {'id': 'icon_newws', 'class': '✈toolbar_icon', 'title': "New Workspace"}),
            toolbarIconPrefs = u.createElement('div', {'id': 'icon_prefs', 'class':'✈toolbar_icon', 'title': gettext("Preferences")}),
            panels = u.getNodes('.✈panel'),
            sideinfo = u.createElement('div', {'id': 'sideinfo', 'class':'✈sideinfo'}),
            updateCSSfunc = function(panelNode) {
                if (panelNode.id == prefix+'panel_prefs') {
                    go.ws.send(JSON.stringify({'go:enumerate_themes': null}));
                }
            };
        // Create our prefs panel
        u.hideElement(prefsPanel); // Start out hidden
        v.applyTransform(prefsPanel, 'scale(0)'); // So it scales back in real nice
        toolbarIconClose.innerHTML = go.Icons.close;
        toolbarIconNewWorkspace.innerHTML = go.Icons['newWS'];
        toolbarIconPrefs.innerHTML = go.Icons['prefs'];
        prefsPanelH2.innerHTML = gettext("Preferences");
        panelClose.innerHTML = go.Icons.panelclose;
        panelClose.onclick = function(e) {
            v.togglePanel('#'+prefix+'panel_prefs'); // Scale away, scale away, scale away.
        }
        prefsPanel.appendChild(prefsPanelH2);
        prefsPanel.appendChild(panelClose);
        prefsPanelThemeLabel.innerHTML = gettext("<b>Theme:</b> ");
        prefsPanelFontSizeLabel.innerHTML = gettext("<b>Font Size:</b> ");
        prefsPanelDisableTransitionsLabel.innerHTML = gettext("<b>Disable CSS3 Transitions:</b> ");
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
                    v.applyTransform(toolbar, 'translateY('+translateY+'%) scale('+scale+')');
                }
            }
            if (disableTransitions) {
                var newStyle = u.createElement('style', {'id': 'disable_transitions'}),
                    classes = ['✈workspace', '✈ws_stop', '✈notice', '✈'],
                    disabledCSS = " {-webkit-transition: none !important; -moz-transition: none !important; -ms-transition: none !important; -o-transition: none !important; transition: none !important;} ",
                    finalCSS = "";
                classes.forEach(function(className) {
                    finalCSS += ("." + className + disabledCSS + '\n');
                });
                newStyle.innerHTML = finalCSS;
                u.getNode("head").appendChild(newStyle);
                go.prefs.disableTransitions = true;
            } else {
                var existing = u.getNode('#'+prefix+'disable_transitions');
                if (existing) {
                    u.removeElement(existing);
                }
                go.prefs.disableTransitions = false;
            }
            v.updateDimensions();
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
        v.applyStyle(goDiv, go.prefs.style);
        if (go.prefs.fillContainer) {
            v.applyStyle(goDiv, { // Undo width and height so they don't mess with the settings below
                'width': 'auto',
                'height': 'auto'
            });
            // This causes #gateone to fill the entire container:
            v.applyStyle(goDiv, {
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
                v.applyTransform(toolbar, 'translateY('+translateY+'%) scale('+scale+')');
            }
        }
        // Create the (empty) toolbar
        if (!go.prefs.showToolbar) {
            // We just keep it hidden so that plugins don't have to worry about whether or not it is there (avoids exceptions)
            toolbar.style['display'] = 'none';
        }
        toolbar.appendChild(toolbarIconClose);
        toolbar.appendChild(toolbarIconNewWorkspace);
        toolbar.appendChild(toolbarIconPrefs);
        go.toolbar = toolbar;
        goDiv.appendChild(toolbar);
        var showPrefs = function() {
            v.togglePanel('#'+prefix+'panel_prefs');
        }
        toolbarIconNewWorkspace.onclick = v.appChooser;
        toolbarIconClose.onclick = function(e) {
            var workspace = localStorage[prefix+'selectedWorkspace'];
            v.closeWorkspace(workspace);
        }
        toolbarIconPrefs.onclick = showPrefs;
        // Put our invisible pop-up message container on the page
        document.body.appendChild(noticeContainer); // Notifications can be outside the GateOne area
        // Add the sidebar text (if set to do so)
        if (!go.prefs.showTitle) {
            // Just keep it hidden so plugins don't have to worry about whether or not it is present (to avoid exceptions)
            sideinfo.style['display'] = 'none';
        }
        go.sideinfo = sideinfo;
        goDiv.appendChild(sideinfo);
        // Set the tabIndex on our GateOne Div so we can give it focus()
        goDiv.tabIndex = 1;
        if (go.prefs.disableTransitions) {
            var newStyle = u.createElement('style', {'id': 'disable_transitions'}),
                classes = ['✈workspace', '✈ws_stop', '✈notice', '✈panel'],
                disabledCSS = " {-webkit-transition: none !important; -moz-transition: none !important; -ms-transition: none !important; -o-transition: none !important; transition: none !important;} ",
                finalCSS = "";
            classes.forEach(function(className) {
                finalCSS += ("." + className + disabledCSS + '\n');
            });
            newStyle.innerHTML = finalCSS;
            u.getNode("head").appendChild(newStyle);
        }
        // Create the workspace grid if not in embedded mode
        if (!go.prefs.embedded) { // Only create the grid if we're not in embedded mode (where everything must be explicit)
            gridwrapper = u.getNode('#'+prefix+'gridwrapper');
            // Create the grid if it isn't already present
            if (!gridwrapper) {
                gridwrapper = v.createGrid('gridwrapper');
                goDiv.appendChild(gridwrapper);
                style = getComputedStyle(goDiv, null);
                adjust = 0;
                paddingRight = (style['padding-right'] || style['paddingRight']);
                if (paddingRight) {
                    adjust = parseInt(paddingRight.split('px')[0]);
                }
                gridWidth = (parseInt(style.width.split('px')[0]) + adjust) * 2;
                gridwrapper.style.width = gridWidth + 'px';
            }
        }
        // Setup a callback that updates the CSS options whenever the panel is opened (so the user doesn't have to reload the page when the server has new CSS files).
        E.on("go:panel_toggle:in", updateCSSfunc);
        // NOTE:  Application and plugin init() and postInit() functions will get called as part of the file sync process.
        // Even though panels may start out at 'scale(0)' this makes sure they're all display:none as well to prevent them from messing with people's ability to tab between fields
        v.togglePanel(); // Scales them all away
        if (!go.prefs.embedded) {
            E.on("go:connection_established", function() {
                // This is really for reconnect events (resume after being disconnected)
                // If there's no workspaces make the application chooser
                if (!u.getNodes('.✈workspace').length) {
                    v.appChooser();
                }
                v.updateDimensions(); // In case the window size changed while disconnected
            });
            E.on("go:js_loaded", function(apps) {
                if (!u.getNodes('.✈workspace').length) {
                    v.appChooser();
                    v.updateDimensions();
                }
            });
        }
        go.initialized = true; // Don't use this to determine if everything is loaded yet.  Use the "go:js_loaded" event for that.
        E.trigger("go:initialized");
        setTimeout(function() {
            // Make sure all the panels have their style set to 'display:none' to prevent their form elements from gaining focus when the user presses the tab key (only matters when a dialog or other panel is open)
            u.hideElements('.✈panel');
        }, 500); // The delay here is just in case some plugin left a panel open
    },
    openApplication: function(app, /*opt*/settings, /*opt*/where) {
        /**:GateOne.openApplication(app[, settings[, where]])

        Opens the given *app* using its ``__new__()`` method.

        If *where* is provided the application will be placed there.  Otherwise a new workspace will be created and the app placed inside.

        :app: The name of the application to open.
        :settings:  Optional settings which will be passed to the application's ``__new__()`` method.
        :where:  A querySelector-like string or DOM node where you wish to place the application.
        */
        if (!go.loadedApplications[app]) {
            logError(gettext("Application could not be found: " + app));
            return;
        }
        var appObj = go.loadedApplications[app],
            where = go.Utils.getNode(where) || go.Visual.newWorkspace();
        if (!appObj.__new__) {
            logError(gettext("Application does not have a __new__() method:" + app));
            return;
        }
        appObj.__new__(settings, where);
    }
});

// Apply some universal defaults
if (!localStorage[GateOne.prefs.prefix+GateOne.location+'_selectedWorkspace']) {
    localStorage[GateOne.prefs.prefix+GateOne.location+'_selectedWorkspace'] = 1;
}

// GateOne.Utils (generic utility functions)
GateOne.Base.module(GateOne, "Utils", "1.2", ['Base']);
/**:GateOne.Utils

This module consists of a collection of utility functions used throughout Gate One.  Think of it like a mini JavaScript library of useful tools.
*/
GateOne.Utils.benchmark = null; // Used in conjunction with the startBenchmark and stopBenchmark functions
GateOne.Utils.benchmarkCount = 0; // Ditto
GateOne.Utils.benchmarkTotal = 0; // Ditto
GateOne.Utils.benchmarkAvg = 0; // Ditto
GateOne.Utils.failedRequirementsCounter = {}; // Used by loadJSAction() to keep track of how long a JS file has been waiting for a dependency
GateOne.Base.update(GateOne.Utils, {
    init: function() {
        /**:GateOne.Utils.init()

        Registers the following WebSocket actions:

            * `go:save_file` -> :js:meth:`GateOne.Utils.saveAsAction`
            * `go:load_style` -> :js:meth:`GateOne.Utils.loadStyleAction`
            * `go:load_js` -> :js:meth:`GateOne.Utils.loadJSAction`
            * `go:themes_list` -> :js:meth:`GateOne.Utils.enumerateThemes`
        */
        go.Net.addAction('go:save_file', go.Utils.saveAsAction);
        go.Net.addAction('go:themes_list', go.Utils.enumerateThemes);
    },
    // startBenchmark and stopBenchmark can be used to test the performance of various functions and code...
    startBenchmark: function() {
        /**:GateOne.Utils.startBenchmark()

        Put :js:meth:`GateOne.Utils.startBenchmark` at the beginning of any code you wish to benchmark (to see how long it takes) and call :js:meth:`GateOne.Utils.stopBenchmark` when complete.
        */
        GateOne.Utils.benchmark = new Date().getTime();
    },
    stopBenchmark: function(msg) {
        /**:GateOne.Utils.stopBenchmark([msg])

        Put ``GateOne.Utils.stopBenchmark('optional descriptive message')`` at the end of any code where you've called :js:meth:`GateOne.Utils.startBenchmark`.

        It will report how long it took to run the code (in the JS console) between :js:meth:`~GateOne.Utils.startBenchmark` and :js:meth:`~GateOne.Utils.stopBenchmark` along with a running total of all benchmarks.
        */
        var u = GateOne.Utils,
            date2 = new Date(),
            diff =  date2.getTime() - u.benchmark;
        if (!u.benchmark) {
            logInfo(msg + gettext(": Nothing to report: startBenchmark() has yet to be run."));
            return;
        }
        u.benchmarkCount += 1;
        u.benchmarkTotal += diff;
        u.benchmarkAvg = Math.round(u.benchmarkTotal/u.benchmarkCount);
        logInfo(msg + ": " + diff + "ms" + gettext(", total: ") + u.benchmarkTotal + gettext("ms, Average: ") + u.benchmarkAvg);
    },
    getNode: function(nodeOrSelector) {
        /**:GateOne.Utils.getNode(nodeOrSelector)

        Returns a DOM node if given a `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_-style string or an existing DOM node (will return the node as-is).

        .. note:: The benefit of this over just ``document.querySelector()`` is that if it is given a node it will return the node as-is (so functions can accept both without having to worry about such things).  See :js:func:`~GateOne.Utils.removeElement` below for a good example.

        :param nodeOrSelector: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
        :returns: A DOM node or ``null`` if not found.

        Example:

            >>> var goDivNode = GateOne.Utils.getNode('#gateone'); // Cache it for future lookups
            >>> GateOne.Utils.getEmDimensions('#gateone'); // This won't use the cached node
            {'w': 8, 'h': 15}
            >>> GateOne.Utils.getEmDimensions(goDivNode); // This uses the cached node
            {'w': 8, 'h': 15}

        Both code examples above work because :js:meth:`~GateOne.Utils.getEmDimensions` uses :js:meth:`~GateOne.Utils.getNode` to return the node of a given argument.  Because of this, :js:meth:`~GateOne.Utils.getEmDimensions` doesn't require strict string or node arguments (one or the other) and can support both selector strings and nodes at the same time.
        */
        var u = GateOne.Utils;
        if (typeof(nodeOrSelector) == 'string') {
            var result = document.querySelector(nodeOrSelector);
            return result;
        }
        return nodeOrSelector;
    },
    getNodes: function(nodeListOrSelector) {
        /**:GateOne.Utils.getNodes(nodeListOrSelector)

        Given a CSS `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string (e.g. '.some_class') or `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ (in case we're not sure), lookup the node using ``document.querySelectorAll()`` and return the result (which will be a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_).

        .. note:: The benefit of this over just ``document.querySelectorAll()`` is that if it is given a nodeList it will just return the nodeList as-is (so functions can accept both without having to worry about such things).

        :param nodeListOrSelector: A `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string like ``.some_class`` or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.
        :returns: A `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ or ``[]`` (an empty Array) if not found.

        Example:

            >>> var panels = GateOne.Utils.getNodes('#gateone .panel');

        .. note:: The *nodeListOrSelector* argument will be returned as-is if it is not a string.  It will not actually be checked to ensure it is a proper `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.
        */
        if (typeof(nodeListOrSelector) == 'string') {
            return document.querySelectorAll(nodeListOrSelector);
        }
        return nodeListOrSelector;
    },
    partial: function(fn) {
        /**:GateOne.Utils.partial(fn)

        :returns: A partially-applied function.

        Similar to `MochiKit.Base.partial <http://mochi.github.com/mochikit/doc/html/MochiKit/Base.html#fn-partial>`_.  Returns partially applied function.

        :param function fn: The function to ultimately be executed.
        :param arguments arguments: Whatever arguments you want to be pre-applied to *fn*.

        Example:

            >>> var addNumbers = function(a, b) {
                return a + b;
            }
            >>> var addOne = GateOne.Utils.partial(addNumbers, 1);
            >>> addOne(3);
            4

        .. note:: This function can also be useful to simply save yourself a lot of typing.  If you're planning on calling a function with the same parameters a number of times it is a good idea to use :js:meth:`~GateOne.Utils.partial` to create a new function with all the parameters pre-applied.  Can make code easier to read too.
        */
        var args = Array.prototype.slice.call(arguments, 1);
        return function() {
            return fn.apply(this, args.concat(Array.prototype.slice.call(arguments)));
        };
    },
    keys: function (obj) {
        /**:GateOne.Utils.keys(obj)

        Returns an Array containing the keys (attributes) of the given *obj*
        */
        var keyList = [];
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) { keyList.push(i); }
        }
        return keyList;
    },
    items: function(obj) {
        /**:GateOne.Utils.items(obj)

        .. note:: Copied from `MochiKit.Base.items <http://mochi.github.com/mochikit/doc/html/MochiKit/Base.html#fn-items>`_.

        Returns an Array of ``[propertyName, propertyValue]`` pairs for the given *obj*.

        :param object obj: Any given JavaScript object.
        :returns: Array

        Example:

            >>> GateOne.Utils.items(GateOne.terminals).forEach(function(item) { console.log(item) });
            ["1", Object]
            ["2", Object]

        .. note:: Can be very useful for debugging.
        */
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
    startsWith: function(substr, str) {
        /**:GateOne.Utils.startsWith(substr, str)

        Returns true if *str* starts with *substr*.

        :param string substr: The string that you want to see if *str* starts with.
        :param string str: The string you're checking *substr* against.
        :returns: true/false

        Examples:

            >>> GateOne.Utils.startsWith('some', 'somefile.txt');
            true
            >>> GateOne.Utils.startsWith('foo', 'somefile.txt');
            false
        */
        return str != null && substr != null && str.indexOf(substr) == 0;
    },
    endsWith: function(substr, str) {
        /**:GateOne.Utils.endsWith(substr, str)

        Returns true if *str* ends with *substr*.

        :param string substr: The string that you want to see if *str* ends with.
        :param string str: The string you're checking *substr* against.
        :returns: true/false

        Examples:

            >>> GateOne.Utils.endsWith('.txt', 'somefile.txt');
            true
            >>> GateOne.Utils.endsWith('.txt', 'somefile.svg');
            false
        */
        return str != null && substr != null &&
            str.lastIndexOf(substr) == Math.max(str.length - substr.length, 0);
    },
    isArray: function(obj) {
        /**:GateOne.Utils.isArray(obj)

        Returns true if *obj* is an Array.

        :param object obj: A JavaScript object.
        :returns: true/false

        Example:

            >>> GateOne.Utils.isArray(GateOne.terminals['1'].screen);
            true
        */
        return obj.constructor == Array;
    },
    isNodeList: function(obj) {
        /**:GateOne.Utils.isNodeList(obj)

        Returns ``true`` if *obj* is a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.  NodeList objects come from DOM level 3 and are what is returned by some browsers when you execute functions like `document.getElementsByTagName <https://developer.mozilla.org/en/DOM/element.getElementsByTagName>`_.  This function lets us know if the Array-like object we've got is an actual `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ (as opposed to an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_ or something else like an `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_) or generic ``object``.

        :param object obj: A JavaScript object.
        :returns: true/false

        Example:

            >>> GateOne.Utils.isNodeList(document.querySelectorAll('.✈termline'));
            true
        */
        return obj instanceof NodeList;
    },
    isHTMLCollection: function(obj) {
        /**:GateOne.Utils.isHTMLCollection(obj)

        Returns true if *obj* is an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_.  HTMLCollection objects come from DOM level 1 and are what is returned by some browsers when you execute functions like `document.getElementsByTagName <https://developer.mozilla.org/en/DOM/element.getElementsByTagName>`_.  This function lets us know if the Array-like object we've got is an actual HTMLCollection (as opposed to a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ or just an `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_).

        :param object obj: A JavaScript object.
        :returns: true/false

        Example:

            >>> GateOne.Utils.isHTMLCollection(document.getElementsByTagName('pre'));
            true // Assuming Firefox here

        .. note:: The result returned by this function will vary from browser to browser.  Sigh.
        */
        return obj instanceof HTMLCollection;
    },
    isElement: function(obj) {
        /**:GateOne.Utils.isElement(obj)

        Returns true if *obj* is an `HTMLElement <https://developer.mozilla.org/en/Document_Object_Model_(DOM)/HTMLElement>`_.

        :param object obj: A JavaScript object.
        :returns: true/false

        Example:

            >>> GateOne.Utils.isElement(GateOne.Utils.getNode('#gateone'));
            true
        */
        return obj instanceof HTMLElement;
    },
    renames: {
        "checked": "defaultChecked",
        "usemap": "useMap",
        "for": "htmlFor",
        "float": "cssFloat", // Only Firefox seems to need this
        "readonly": "readOnly",
        "colspan": "colSpan",
        "rowspan": "rowSpan",
        "bgcolor": "bgColor",
        "cellspacing": "cellSpacing",
        "cellpadding": "cellPadding",
    },
    removeElement: function(elem) {
        /**:GateOne.Utils.removeElement(elem)

        Removes the given *elem* from the DOM.

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

        Example:

            >>> GateOne.Utils.removeElement('#go_infocontainer');
        */
        var node = GateOne.Utils.getNode(elem);
        if (node && node.parentNode) { // This check ensures that we don't throw an exception if the element has already been removed.
            node.parentNode.removeChild(node);
        }
        return node;
    },
    createElement: function(tagname, properties, noprefix) {
        /**:GateOne.Utils.createElement(tagname, [, properties[, noprefix]])

        A simplified version of MochiKit's `createDOM <http://mochi.github.com/mochikit/doc/html/MochiKit/DOM.html#fn-createdom>`_ function, it creates a *tagname* (e.g. "div") element using the given *properties*.

        :param string tagname: The type of element to create ("a", "table", "div", etc)
        :param object properties: An object containing the properties which will be pre-attached to the created element.
        :param boolean noprefix: If `true`, will not prefix the created element ID with :js:attr:`GateOne.prefs.prefix`.
        :returns: A node suitable for adding to the DOM.

        Examples:

            >>> myDiv = GateOne.Utils.createElement('div', {'id': 'foo', 'style': {'opacity': 0.5, 'color': 'black'}});
            >>> myAnchor = GateOne.Utils.createElement('a', {'id': 'liftoff', 'href': 'http://liftoffsoftware.com/'});
            >>> myParagraph = GateOne.Utils.createElement('p', {'id': 'some_paragraph'});

        .. note:: ``createElement`` will automatically apply :js:attr:`GateOne.prefs.prefix` to the 'id' of the created elements (if an 'id' was given).
        */
        var u = go.Utils,
            elem = document.createElement(tagname);
        for (var key in properties) {
            var value = properties[key];
            if (key == 'style') {
                // Have to iterate over the styles (it's special)
                for (var style in value) {
                    if (u.renames[style]) {
                        elem.style[u.renames[style]] = value[style];
                    } else {
                        elem.style.setProperty(style, value[style]);
                    }
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
        /**:GateOne.Utils.showElement(elem)

        Shows the given element (if previously hidden via :js:func:`~GateOne.Utils.hideElement`) by setting ``elem.style.display = 'block'``.

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

        Example:

            >>> GateOne.Utils.showElement('#go_icon_newterm');
        */
        var u = GateOne.Utils,
            display,
            node = u.getNode(elem);
        if (node) {
            display = node.getAttribute('data-original-display');
            if (display && display != 'none') {
                node.style.display = display;
                node.removeAttribute('data-original-display');
            } else {
                // Fall back to using 'block'
                node.style.display = 'block';
            }
            node.classList.remove('✈go_none');
        }
    },
    hideElement: function(elem) {
        /**:GateOne.Utils.hideElement(elem)

        Hides the given element by setting ``elem.style.display = 'none'``.

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

        Example:

            >>> GateOne.Utils.hideElement('#go_icon_newterm');
        */
        // Sets the 'display' style of the given element to 'none'
        var u = GateOne.Utils,
            display,
            node = u.getNode(elem);
        if (node) {
            display = node.getAttribute('data-original-display');
            if (!display) {
                display = getComputedStyle(node).display;
                node.setAttribute('data-original-display', display);
            }
            if (!node.classList.contains('✈go_none')) {
                node.classList.add("✈go_none");
            }
            // NOTE: You'd *think* we don't need to set 'display: none;' since the ✈go_none class has 'display: none;' but if we don't set it explicitly like this the browser will still act as if the element is there when the user presses the tab key.
            node.style.display = 'none';
        }
    },
    showElements: function(elems) {
        /**:GateOne.Utils.showElements(elems)

        Shows the given elements (if previously hidden via :js:meth:`~GateOne.Utils.hideElement` or :js:meth:`~GateOne.Utils.hideElements`) by setting ``elem.style.display = 'block'``.

        :param elems: A `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string like ``.some_element_class``, a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_, or an array.

        Example:

            >>> GateOne.Utils.showElements('.pastearea');
        */
        // Sets the 'display' style of the given elements to 'block' (which undoes setting it to 'none').
        // Elements must be an iterable (or a querySelectorAll string) such as an HTMLCollection or an Array of DOM nodes
        var u = GateOne.Utils,
            elems = u.toArray(u.getNodes(elems));
        elems.forEach(function(elem) {
            u.showElement(elem);
        });
    },
    hideElements: function(elems) {
        /**:GateOne.Utils.hideElements(elems)

        Hides the given elements by setting ``elem.style.display = 'none'`` on all of them.

        :param elems: A `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string like ``.some_element_class``, a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_, or an array.

        Example:

            >>> GateOne.Utils.hideElements('.pastearea');
        */
        var u = GateOne.Utils,
            elems = u.toArray(u.getNodes(elems));
        elems.forEach(function(elem) {
            u.hideElement(elem);
        });
    },
    getSelText: function() {
        /**:GateOne.Utils.getSelText()

        :returns: The text that is currently highlighted in the browser.

        Example:

            >>> GateOne.Utils.getSelText();
            "localhost" // Assuming the user had highlighted the word, "localhost"
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
    noop: function(a) {
        /**:GateOne.Utils.noop(a)

        AKA "No Operation".  Returns whatever is given to it (if anything at all).  In other words, this function doesn't do anything and that's exactly what it is supposed to do!

        :param a: Anything you want.
        :returns: a

        Example:

            >>> var functionList = {'1': GateOne.Utils.noop, '2': GateOne.Utils.noop};

        .. note:: This function is most useful as a placeholder for when you plan to update *something* in-place later.  In the event that *something* never gets replaced, you can be assured that nothing bad will happen if it gets called (no exceptions).
        */
        return a;
    },
    toArray: function (obj) {
        /**:GateOne.Utils.toArray(obj)

        Returns an actual Array() given an Array-like *obj* such as an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_ or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.

        :param object obj: An Array-like object.
        :returns: Array

        Example:

            >>> var terms = document.getElementsByClassName(GateOne.prefs.prefix+'terminal');
            >>> GateOne.Utils.toArray(terms).forEach(function(termObj) {
                GateOne.Terminal.closeTerminal(termObj.id.split('term')[1]);
            });
        */
        var array = [];
        // Iterate backwards ensuring that length is an UInt32
        for (var i = obj.length >>> 0; i--;) {
            array[i] = obj[i];
        }
        return array;
    },
    isEven: function(someNumber){
        /**:GateOne.Utils.isEven(someNumber)

        Returns true if *someNumber* is even.

        :param number someNumber: A JavaScript object.
        :returns: true/false

        Example:

            >>> GateOne.Utils.isEven(2);
            true
            >>> GateOne.Utils.isEven(3);
            false
        */
        return (someNumber%2 == 0) ? true : false;
    },
    _ranPostInit: [], // So we know which modules had their postInit() functions called already
    runPostInit: function() {
        /**:GateOne.Utils.runPostInit()

        Called by :js:meth:`GateOne.runPostInit`, iterates over the list of plugins in :js:attr:`GateOne.loadedModules` calling the ``init()`` function of each (if present).  When that's done it does the same thing with each respective plugin's ``postInit()`` function.
        */
        // NOTE: Probably don't need a preInit() since modules can just put stuff inside their main .js for that.  If you can think of a use case let me know and I'll add it.
        // Go through all our loaded modules and run their init functions (if any)
        logDebug("Running runPostInit()");
        if (!GateOne.initialized) {
            // Retry in a moment
            setTimeout(function() {
                go.Utils.runPostInit();
            }, 50);
            return;
        }
        go.loadedModules.forEach(function(module) {
            var moduleObj = eval(module);
            if (go.initializedModules.indexOf(moduleObj.__name__) == -1) {
//                 console.log('Running: ' + moduleObj.__name__ + '.init()');
                if (typeof(moduleObj.init) == "function") {
                    moduleObj.init();
                }
                if (moduleObj.__appinfo__) {
                    // This is an application
                    go.loadedApplications[moduleObj.__appinfo__.name] = moduleObj;
                }
                go.initializedModules.push(moduleObj.__name__);
            }
            if (moduleObj) { moduleObj.__initialized__ = true; }
        });
        if (go.Utils.postInitDebounce) {
            clearTimeout(go.Utils.postInitDebounce);
            go.Utils.postInitDebounce = null;
        }
        go.Utils.postInitDebounce = setTimeout(function() {
            // Go through all our loaded modules and run their postInit functions (if any)
            go.loadedModules.forEach(function(module) {
                var moduleObj = eval(module);
                if (go.Utils._ranPostInit.indexOf(moduleObj.__name__) == -1) {
//                     console.log('Running: ' + moduleObj.__name__ + '.postInit()');
                    if (typeof(moduleObj.postInit) == "function") {
                        moduleObj.postInit();
                    }
                    go.Utils._ranPostInit.push(moduleObj.__name__);
                }
            });
            go.Events.trigger("go:js_loaded");
        }, 250); // postInit() functions need to de-bounced separately from init() functions
    },
    cacheFileAction: function(fileObj, /*opt*/callback) {
        /**:GateOne.Utils.cacheFileAction(fileObj[, callback])

        Attached to the 'go:cache_file' WebSocket action; stores the given *fileObj* in the 'fileCache' database and calls *callback* when complete.

        If *fileObj['kind']* is 'html' the file will be stored in the 'html' table otherwise the file will be stored in the 'other' table.
        */
        var fileCache = go.Storage.dbObject('fileCache');
        if (!fileObj.filename) {
            logError(gettext("Could not cache file due to missing 'filename' attribute: "), fileObj);
        }
        if (fileObj.html) {
            fileCache.put('html', fileObj, callback);
        } else {
            fileCache.put('misc', fileObj, callback);
        }
    },
    loadJSAction: function(message, /*opt*/noCache) {
        /**:GateOne.Utils.loadJSAction(message)

        Loads a JavaScript file sent via the `go:load_js` WebSocket action into a <script> tag inside of ``GateOne.prefs.goDiv`` (not that it matters where it goes).

        If *message.cache* is `false` or *noCache* is true, will not update the fileCache database with this incoming file.
        */
        logDebug('loadJSAction()', message);
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            requires = false,
            existing, s;
        if (message.result == 'Success') {
            if (message['requires']) {
                message['requires'].forEach(function(requiredFile) {
                    if (!go.Storage.loadedFiles[requiredFile]) {
                        requires = true;
                    }
                });
            }
            if (requires) {
                setTimeout(function() {
                    if (u.failedRequirementsCounter[message.filename] >= 40) { // ~2 seconds
                        // Give up
                        logError(gettext("Failed to load: ") + message.filename + ".  " + gettext("Took too long waiting for: ") + message['requires']);
                        return;
                    }
                    // Try again in a moment or so
                    u.loadJSAction(message, noCache);
                    u.failedRequirementsCounter[message.filename] += 1;
                }, 50);
                return;
            } else {
                logDebug(gettext("Dependency loaded!"));
            }
            if (message.element_id) {
                existing = u.getNode('#'+prefix+message.element_id);
                s = u.createElement('script', {'id': message.element_id});
            } else {
                var elementID = message.filename.replace(/\./g, '_'); // Element IDs with dots are a no-no.
                existing = u.getNode('#'+prefix+elementID);
                s = u.createElement('script', {'id': elementID});
            }
            if (existing) {
                existing.innerHTML = message.data;
            } else {
                s.innerHTML = message.data;
                go.node.appendChild(s);
            }
            delete message.result;
            if (noCache === undefined && message.cache != false) {
                go.Storage.cacheJS(message);
            } else if (message.cache == false) {
                // Cleanup the existing entry if present
                go.Storage.uncacheJS(message);
            }
            go.Storage.loadedFiles[message.filename] = true;
            // Don't call runPostInit() until we're done loading all JavaScript
            if (u.initDebounce) {
                clearTimeout(u.initDebounce);
                u.initDebounce = null;
            }
            u.initDebounce = setTimeout(function() {
                u.runPostInit(); // Calls any init() and postInit() functions in the loaded JS.
            }, 250); // This is hopefully fast enough to be nearly instantaneous to the user but also long enough for the biggest script to be loaded.
            // NOTE:  runPostInit() will *not* re-run init() and postInit() functions if they've already been run once.  Even if the script is being replaced/updated.
        }
    },
    loadStyleAction: function(message, /*opt*/noCache) {
        /**:GateOne.Utils.loadStyleAction(message[, noCache])

        Loads the stylesheet sent via the `go:load_style` WebSocket action.  The *message* is expected to be a JSON object that contains the following objects:

            :result: Must be "Success" if delivering actual CSS.  Anything else will be reported as an error in the JS console.
            :css:    Must be ``true``.
            :data:   The actual stylesheet (the CSS).
            :cache:  If ``false`` the stylesheet will not be cached at the client (stored in the fileCache database).
            :media:  *Optional:* If provided this value will be used as the "media" attribute inside the created ``<style>`` tag.

        Example message object:

        .. code-block:: javascript

            {
                "result": "Success",
                "css": true,
                "data": ".someclass:hover {cursor: pointer;}",
                "media": "screen",
                "cache": true
            }

        If called directly (as opposed to via the WebSocket action) the *noCache*
        */
        logDebug("loadStyleAction()");
        var u = go.Utils,
            prefix = go.prefs.prefix,
            transitionEndFunc = function(e) {
                if (go.Utils.loadStyleTimer) {
                    clearTimeout(go.Utils.loadStyleTimer);
                    go.Utils.loadStyleTimer = null;
                }
                go.Visual.updateDimensions(); // In case the styles changed the size of text
                go.node.removeEventListener(go.Visual.transitionEndName, transitionEndFunc, false);
                go.Events.trigger("go:css_loaded", message);
            };
        if (message.result == 'Success') {
            // This is for handling any given CSS file
            if (message['css']) {
                if (message.data.length) {
                    var stylesheet, existing, themeStyle = u.getNode('#'+prefix+'theme'),
                        media = message.media || 'screen';
                    if (message.element_id) {
                        // Use the element ID that was provided
                        message.element_id = message.element_id.replace(/\./g, '_'); // IDs with dots are a no-no
                        existing = u.getNode('#'+prefix+message.element_id);
                        stylesheet = u.createElement('style', {'id': message.element_id, 'rel': 'stylesheet', 'type': 'text/css', 'media': media});
                    } else {
                        existing = u.getNode('#'+prefix+message.filename);
                        stylesheet = u.createElement('style', {'id': message.filename.replace(/\./g, '_'), 'rel': 'stylesheet', 'type': 'text/css', 'media': media});
                    }
                    stylesheet.textContent = message.data;
                    if (existing) {
                        existing.textContent = message.data;
                    } else {
                        u.getNode("head").insertBefore(stylesheet, themeStyle);
                    }
                }
            }
        } else {
            logError(gettext("Error loading stylesheet: " + JSON.stringify(message)));
            return;
        }
        delete message.result;
        if (noCache === undefined && message.cache != false) {
            go.Storage.cacheStyle(message, message.kind);
        } else if (message.cache == false) {
            // Cleanup the existing entry if present
            go.Storage.uncacheStyle(message, message.kind);
        }
        go.Storage.loadedFiles[message.filename] = true;
        // Don't trigger the "go:css_loaded" event until everything is done loading
        if (u.cssLoadedDebounce) {
            clearTimeout(u.cssLoadedDebounce);
            u.cssLoadedDebounce = null;
        }
        u.cssLoadedDebounce = setTimeout(function() {
            go.node.removeEventListener(go.Visual.transitionEndName, transitionEndFunc, false);
            go.node.addEventListener(go.Visual.transitionEndName, transitionEndFunc, false);
            clearTimeout(go.Utils.loadStyleTimer);
            go.Utils.loadStyleTimer = setTimeout(function() {
                // This should only get called if the transitionend event never fires
                transitionEndFunc();
            }, 1000);
        }, 100);
    },
    loadTheme: function(theme) {
        /**:GateOne.Utils.loadTheme(theme)

        Sends the `go:get_theme` WebSocket action to the server asking it to send/sync/load the given *theme*.

        :param string theme: The theme you wish to load.

        Example:

            >>> GateOne.Utils.loadTheme("white");
        */
        var u = go.Utils,
            container = go.prefs.goDiv.split('#')[1];
        go.ws.send(JSON.stringify({'go:get_theme': {'go_url': go.prefs.url, 'container': container, 'prefix': go.prefs.prefix, 'theme': theme}}));
    },
    enumerateThemes: function(messageObj) {
        /**:GateOne.Utils.enumerateThemes(messageObj)

        Attached to the `go:themes_list` WebSocket action; updates the preferences panel with the list of themes stored on the server.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            themesList = messageObj.themes,
            prefsThemeSelect = u.getNode('#'+prefix+'prefs_theme');
        // Save the themes list so other things (plugins, embedded situations, etc) can reference it without having to examine the select tag
        go.themesList = themesList;
        prefsThemeSelect.options.length = 0;
        for (var i in themesList) {
            prefsThemeSelect.add(new Option(themesList[i], themesList[i]), null);
            if (go.prefs.theme == themesList[i]) {
                prefsThemeSelect.selectedIndex = i;
            }
        }
    },
    savePrefs: function(skipNotification) {
        /**:GateOne.Utils.savePrefs(skipNotification)

        Saves what's set in :js:attr:`GateOne.prefs` to ``localStorage[GateOne.prefs.prefix+'prefs']`` as JSON; skipping anything that's set in :js:attr:`GateOne.noSavePrefs`.

        Displays a notification to the user that preferences have been saved.

        :param boolean skipNotification:  If ``true``, don't notify the user that prefs were just saved.
        */
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
            GateOne.Visual.displayMessage(gettext("Preferences have been saved."));
        }
    },
    loadPrefs: function() {
        /**:GateOne.Utils.loadPrefs

        Populates :js:attr:`GateOne.prefs` with values from ``localStorage[GateOne.prefs.prefix+'prefs']``.
        */
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
        /**:GateOne.Utils.xhrGet(url[, callback])

        Performs a GET on the given *url* and if given, calls *callback* with the responseText as the only argument.

        :param string url: The URL to GET.
        :param function callback: A function to call like so: ``callback(responseText)``

        Example:

            >>> var mycallback = function(responseText) { console.log("It worked: " + responseText) };
            >>> GateOne.Utils.xhrGet('https://demo.example.com/static/about.html', mycallback);
            It worked: <!DOCTYPE html>
            <html>
            <head>
            ...
        */
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
    isVisible: function(elem) {
        /**:GateOne.Utils.isVisible(elem)

        Returns true if *node* is visible (checks parent nodes recursively too).  *node* may be a DOM node or a selector string.

        Example:

            >>> GateOne.Utils.isVisible('#'+GateOne.prefs.prefix+'pastearea1');
            true

        .. note:: Relies on checking elem.style.opacity and elem.style.display.  Does *not* check transforms.
        */
        var node = GateOne.Utils.getNode(elem), style;
        if (!node) {
            return false;
        }
        if (node === document) {
            return true;
        }
        style = getComputedStyle(node, null);
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
    getCookie: function(name) {
        /**:GateOne.Utils.getCookie(name)

        Returns the given cookie (*name*).

        :param string name: The name of the cookie to retrieve.

        Examples:

            >>> GateOne.Utils.getCookie(GateOne.prefs.prefix + 'gateone_user'); // Returns the 'gateone_user' cookie
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

        :param string name: The name of the cookie to retrieve.
        :param string value: The value to set.
        :param number days: The number of days the cookie will be allowed to last before expiring.

        Examples:

            >>> GateOne.Utils.setCookie('test', 'some value', 30); // Sets the 'test' cookie to 'some value' with an expiration of 30 days
        */
        var exdate=new Date();
        exdate.setDate(exdate.getDate() + days);
        var c_value=escape(value) + ((days==null) ? "" : "; expires=" + exdate.toUTCString());
        document.cookie=name + "=" + c_value;
    },
    deleteCookie: function(name, path, domain) {
        /**:GateOne.Utils.deleteCookie(name, path, domain)

        Deletes the given cookie (*name*) from *path* for the given *domain*.

        :param string name: The name of the cookie to delete.
        :param string path: The path of the cookie to delete (typically '/' but could be '/some/path/on/the/webserver' =).
        :param string path: The domain where this cookie is from (an empty string means "the current domain in window.location.href").

        Example:

            >>> GateOne.Utils.deleteCookie('gateone_user', '/', ''); // Deletes the 'gateone_user' cookie
        */
        document.cookie = name + "=" + ((path) ? ";path=" + path : "") + ((domain) ? ";domain=" + domain : "") + ";expires=Thu, 01-Jan-1970 00:00:01 GMT";
    },
    randomString: function(length, chars) {
        /**:GateOne.Utils.randomString(length[, chars])

        :returns: A random string of the given *length* using the given *chars*.

        If *chars* is omitted the returned string will consist of lower-case ASCII alphanumerics.

        :param int length: The length of the random string to be returned.
        :param string chars: *Optional:* a string containing the characters to use when generating the random string.

        Example:

            >>> GateOne.Utils.randomString(8);
            "oa2f9txf"
            >>> GateOne.Utils.randomString(8, '123abc');
            "1b3ac12b"
        */
        var result = '';
        if (!chars) {
            chars = "1234567890abcdefghijklmnopqrstuvwxyz";
        }
        for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
        return result;
    },
    saveAs: function(blob, filename) {
        /**:GateOne.Utils.saveAs(blob, filename)

        Saves the given *blob* (which must be a proper `Blob <https://developer.mozilla.org/en/DOM/Blob>`_ object with data inside of it) as *filename* (as a file) in the browser.  Just as if you clicked on a link to download it.

        .. note:: This is amazingly handy for downloading files over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_.
        */
        var u = go.Utils,
            clickEvent = document.createEvent('MouseEvents'),
            blobURL = urlObj.createObjectURL(blob),
            save_link = u.createElement('a', {'href': blobURL, 'name': filename, 'download': filename});
        clickEvent.initMouseEvent('click', true, true, document.defaultView, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
        save_link.dispatchEvent(clickEvent);
    },
    saveAsAction: function(message) {
        /**:GateOne.Utils.saveAsAction(message)

        .. note:: This function is attached to the 'save_file' `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ action (in :js:attr:`GateOne.Net.actions`) via :js:func:`GateOne.Utils.init`.

        Saves to disk the file contained in *message*.  The *message* object should contain the following:

            :result: Either 'Success' or a descriptive error message.
            :filename: The name we'll give to the file when we save it.
            :data: The content of the file we're saving.
            :mimetype: *Optional:*  The mimetype we'll be instructing the browser to associate with the file (so it will handle it appropriately).  Will default to 'text/plain' if not given.
        */
        var u = go.Utils,
            result = message.result,
            data = message.data,
            filename = message.filename,
            mimetype = 'text/plain';
        if (result == 'Success') {
            if (message.mimetype) {
                mimetype = message.mimetype;
            }
            var blob = u.createBlob(message.data, mimetype);
            u.saveAs(blob, message.filename);
        } else {
            go.Visual.displayMessage(gettext('An error was encountered trying to save a file...'));
            go.Visual.displayMessage(message.result);
        }
    },
    isPageHidden: function() {
        /**:GateOne.Utils.isPageHidden()

        Returns ``true`` if the page (browser tab) is hidden (e.g. inactive).  Returns ``false`` otherwise.

        Example:

            >>> GateOne.Utils.isPageHidden();
            false
        */
        // Returns true if the page (browser tab) is hidden (e.g. inactive).  Returns false otherwise.
        return document.hidden || document.msHidden || document.webkitHidden || document.mozHidden;
    },
    createBlob: function(array, mimetype) {
        /**:GateOne.Utils.createBlob(array, mimetype)

        Returns a Blob() object using the given *array* and *mimetype*.  If *mimetype* is omitted it will default to 'text/plain'.  Optionally, *array* may be given as a string in which case it will be automatically wrapped in an array.

        :param array array: A string or array containing the data that the Blob will contain.
        :param string mimetype: A string representing the mimetype of the data (e.g. 'application/javascript').
        :returns: A Blob()

        .. note:: The point of this function is favor the :js:func:`Blob` function while maintaining backwards-compatibility with the deprecated :js:attr:`BlobBuilder` interface (for browsers that don't support Blob() yet).

        Example:

            >>> var blob = GateOne.Utils.createBlob('some data here', 'text/plain);
        */
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
    getQueryVariable: function(variable, /*opt*/url) {
        /**:GateOne.Utils.getQueryVariable(variable[, url])

        Returns the value of a query string variable from :js:attr:`window.location`.

        If no matching variable is found, returns undefined.  Example:

            >>> // Assume window.location.href = 'https://gateone/?foo=bar,bar,bar'
            >>> GateOne.Utils.getQueryVariable('foo');
            'bar,bar,bar'

        Optionally, a *url* may be specified to perform the same evaluation on *url* insead of :js:attr:`window.location`.
        */
        var query = window.location.search.substring(1), vars, result;
        if (url) {
            query = url.split('?').slice(1).join('?'); // Removes the leading URL up to the first question mark (preserving extra question marks)
        }
        vars = query.split('&');
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split('=');
            if (decodeURIComponent(pair[0]) == variable) {
                if (!result) {
                    result = decodeURIComponent(pair[1]);
                } else {
                    // Multiple parameters with the same name; return an array containing all of the values
                    if (!GateOne.Utils.isArray(result)) {
                        result = [result];
                    }
                    result.push(decodeURIComponent(pair[1]));
                }
            }
        }
        return result;
    },
    removeQueryVariable: function(variable) {
        /**:GateOne.Utils.removeQueryVariable(variable)

        Removes the given query string variable from :js:attr:`window.location.href` using :js:meth:`window.history.replaceState`.  Leaving all other query string variables alone.

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
    insertAfter: function(newElement, targetElement) {
        /**:GateOne.Utils.insertAfter(newElement, targetElement)

        The opposite of the DOM's built in ``insertBefore()`` function; inserts the given *newElement* after *targetElement*.

        *targetElement* may be given as a pre-constructed node object or a querySelector-like string.
        */
        var targetElement = GateOne.Utils.getNode(targetElement),
            parent = targetElement.parentNode;
        if (parent.lastchild == targetElement) {
            parent.appendChild(newElement);
        } else {
            parent.insertBefore(newElement, targetElement.nextSibling);
        }
    },
    debounce: function(func, wait, immediate) {
        /**:GateOne.Utils.debounce(func, wait, immediate)

        A copy of `the debounce function <http://underscorejs.org/#debounce>`_ from the excellent underscore.js.
        */
        var timeout, result;
        return function() {
            var context = this,
                args = arguments,
                later = function() {
                    timeout = null;
                    if (!immediate) result = func.apply(context, args);
                },
                callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) result = func.apply(context, args);
            return result;
        };
    }
});

GateOne.Base.module(GateOne, "Logging", '1.2', ['Base']);
/**:GateOne.Logging

Gate One's Logging module provides functions for logging to the console (or whatever destination you like) and supports multiple log levels:

    =====       ======= ========================
    Level       Name    Default Console Function
    =====       ======= ========================
    10          DEBUG   ``console.debug()``
    20          INFO    ``console.log()``
    30          WARNING ``console.warn()``
    40          ERROR   ``console.error()``
    50          FATAL   ``console.error()``
    =====       ======= ========================

If a particular console function is unavailable the ``console.log()`` function will be used as a fallback.

.. tip:: You can add your own destinations; whatever you like!  See the :js:meth:`GateOne.Logging.addDestination` function for details.

**Shortcuts:**

There are various shortcut functions available to save some typing:

* :js:meth:`GateOne.Logging.logDebug`
* :js:meth:`GateOne.Logging.logInfo`
* :js:meth:`GateOne.Logging.logWarning`
* :js:meth:`GateOne.Logging.logError`
* :js:meth:`GateOne.Logging.logFatal`

It is recommended that you assign these shortcuts at the top of your code like so:

.. code-block:: javascript

    var logFatal = GateOne.Logging.logFatal,
        logError = GateOne.Logging.logError,
        logWarning = GateOne.Logging.logWarning,
        logInfo = GateOne.Logging.logInfo,
        logDebug = GateOne.Logging.logDebug;

That way you can just add "logDebug()" anywhere in your code and it will get logged appropriately to the default destinations (with a nice timestamp and whatnot).
*/
GateOne.Logging.levels = {
    // Forward and backward for ease of use
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
GateOne.prefs.logToServer = true; // Log to the server by default
GateOne.noSavePrefs.logLevel = null; // This ensures that the logging level isn't saved along with everything else if the user clicks "Save" in the settings panel
GateOne.noSavePrefs.logToServer = null; // This isn't a user pref
GateOne.Base.update(GateOne.Logging, {
    init: function() {
        /**:GateOne.Logging.init()

        Initializes logging by setting :js:attr:`GateOne.Logging.level` using the value provided by :js:attr:`GateOne.prefs.logLevel`.  :js:attr:`GateOne.prefs.logLevel` may be given as a case-insensitive string or an integer.

        Also, if :js:attr:`GateOne.prefs.logToServer` is ``false`` :js:meth:`GateOne.Logging.logToConsole` will be removed from :js:attr:`GateOne.Logging.destinations`.
        */
        // The default is to send all client-side log messages to the server but this can be disabled by setting `GateOne.prefs.logToServer = false`
        if (!go.prefs.logToServer) {
            // Remove the logToServer destination
            go.Logging.removeDestination('server');
        }
        go.prefs.logLevel = go.prefs.logLevel || 'INFO';
        // Initialize the logger
        go.Logging.setLevel(go.prefs.logLevel);
        go.Logging.ready = true; // So apps and plugins can know when they can use things like logInfo()
    },
    setLevel: function(level) {
        /**:GateOne.Logging.setLevel(level)

        Sets the log *level* to an integer if the given a string (e.g. "DEBUG").  Sets it as-is if it's already a number.  Examples:

            >>> GateOne.Logging.setLevel(10); // Set log level to DEBUG
            >>> GateOne.Logging.setLevel("debug") // Same thing; they both work!
        */
        var l = GateOne.Logging,
            levelStr = null;
        if (level === parseInt(level, 10)) { // It's an integer, set it as-is
            l.level = level;
        } else { // It's a string, convert it first
            levelStr = level.toUpperCase();
            level = l.levels[levelStr]; // Get integer
            l.level = level;
        }
    },
    log: function(msg, level, destination) {
        /**:GateOne.Logging.log(msg[, level[, destination]])

        Logs the given *msg* using all of the functions in `GateOne.Logging.destinations` after being prepended with the date and a string indicating the log level (e.g. "692011-10-25 10:04:28 INFO <msg>") if *level* is determined to be greater than the value of `GateOne.Logging.level`.  If the given *level* is not greater than `GateOne.Logging.level` *msg* will be discarded (noop).

        *level* can be provided as a string, an integer, null, or be left undefined:

            * If an integer, an attempt will be made to convert it to a string using `GateOne.Logging.levels` but if this fails it will use "lvl:<integer>" as the level string.
            * If a string, an attempt will be made to obtain an integer value using `GateOne.Logging.levels` otherwise `GateOne.Logging.level` will be used (to determine whether or not the message should actually be logged).
            * If undefined, the level will be set to `GateOne.Logging.level`.
            * If ``null`` (as opposed to undefined), level info will not be included in the log message.

        If *destination* is given (must be a function) it will be used to log messages like so: ``destination(message, levelStr)``.  The usual conversion of *msg* to *message* will apply.

        Any additional arguments after *destination* will be passed directly to that function.
        */
        var l = GateOne.Logging,
            args = Array.prototype.slice.call(arguments, 3), // All args after the first three (preset ones)
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
                    l.destinations[dest](message, levelStr, args);
                }
            } else {
                destination(message, levelStr, args);
            }
        }
    },
    logToConsole: function (msg, /*opt*/level) {
        /**:GateOne.Logging.logToConsole(msg, level)

        Logs the given *msg* to the browser's JavaScript console.  If *level* is provided it will attempt to use the appropriate console logger (e.g. console.warn()).

        .. note:: The original version of this function is from: `MochiKit.Logging.Logger.prototype.logToConsole`.
        */
        var args = Array.prototype.slice.call(arguments, 2)[0]; // All args after the first two (if any)
        if (args[0] === undefined) {
            args = [];
        }
        if (typeof(window) != "undefined" && window.console && window.console.log) {
            // Safari and FireBug 0.4
            // Percent replacement is a workaround for cute Safari crashing bug
            msg = msg.replace(/%/g, '\uFF05');
            if (args.length) {
                args.unshift(msg);
            } else {
                args = [msg];
            }
            if (!level) {
                window.console.log.apply(window.console, args);
                return;
            } else if (level == 'ERROR' || level == 'FATAL') {
                if (typeof(window.console.error) == "function") {
                    window.console.error.apply(window.console, args);
                    return;
                }
            } else if (level == 'WARN') {
                if (typeof(window.console.warn) == "function") {
                    window.console.warn.apply(window.console, args);
                    return;
                }
            } else if (level == 'DEBUG') {
                if (typeof(window.console.debug) == "function") {
                    window.console.debug.apply(window.console, args);
                    return;
                }
            } else if (level == 'INFO') {
                if (typeof(window.console.info) == "function") {
                    window.console.info.apply(window.console, args);
                    return;
                }
            }
            // Fallback to default
            window.console.log.apply(window.console, args);
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
    logToServer: function(msg, /*opt*/level) {
        /**:GateOne.Logging.logToServer(msg[, level])

        Sends the given log *msg* to the Gate One server.  Such messages will end up in 'logs/gateone-client.log'.
        */
        var message = {
            "message": msg,
            "level": level || "info"
        };
        if (GateOne.ws.readyState == 1) {
            GateOne.ws.send(JSON.stringify({"go:log": message}));
        }
    },
    // Shortcuts for each log level
    logFatal: function(msg) { GateOne.Logging.log(msg, 'FATAL', null, Array.prototype.slice.call(arguments, 1)[0]); },
    logError: function(msg) { GateOne.Logging.log(msg, 'ERROR', null, Array.prototype.slice.call(arguments, 1)[0]); },
    logWarning: function(msg) { GateOne.Logging.log(msg, 'WARNING', null, Array.prototype.slice.call(arguments, 1)[0]); },
    logInfo: function(msg) { GateOne.Logging.log(msg, 'INFO', null, Array.prototype.slice.call(arguments, 1)[0]); },
    logDebug: function(msg) { GateOne.Logging.log(msg, 'DEBUG', null, Array.prototype.slice.call(arguments, 1)[0]); },
    deprecated: function(whatever, moreInfo) { GateOne.Logging.log(whatever + " is deprecated.  " + moreInfo, 'WARNING') },
    addDestination: function(name, dest) {
        /**:GateOne.Logging.addDestination(name, dest)

        Creates a new log destination named, *name* that calls function *dest* like so:

            >>> dest(message);

        Example usage:

            >>> GateOne.Logging.addDestination('screen', GateOne.Visual.displayMessage);

        .. note:: The above example is kind of fun.  Try it in your JavaScript console!

        .. tip:: With the right function you can send client log messages *anywhere*.
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
            GateOne.Logging.logError(gettext("No log destination named: ") + name);
        }
    },
    dateFormatter: function(dateObj) {
        /**:GateOne.Logging.dateFormatter(dateObj)

        Converts a Date() object into string suitable for logging.  Example:

            >>> GateOne.Logging.dateFormatter(new Date());
            "2013-08-15 08:45:41"
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
    'console': GateOne.Logging.logToConsole, // Can be added to or replaced/removed
    'server': GateOne.Logging.logToServer // Sends log messages to the server to be saved/recored in logs/gateone-client.log
    // If anyone has any cool ideas for log destinations please let us know!
}

GateOne.Base.module(GateOne, 'Net', '1.1', ['Base', 'Utils']);
/**:GateOne.Net

Just about all of Gate One's communications with the server are handled inside this module.  It contains all the functions and properties to deal with setting up the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ and issuing/receiving commands over it.  The most important facet of :js:attr:`GateOne.Net` is :js:attr:`GateOne.Net.actions` which holds the mapping of what function maps to which command.  More info on :js:attr:`GateOne.Net.actions` is below.
*/
// NOTE:  The actual default actions are assigned at the end of the module.  I put this all the way up here because it flows better in the documentation.
/**:GateOne.Net.actions

This is where all of Gate One's `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ protocol actions are assigned to functions.  Here's how they are defined by default:

    ===================  ====================================================
    Action               Function
    ===================  ====================================================
    `go:gateone_user`    :js:func:`GateOne.User.storeSessionAction`
    `go:load_css`        :js:func:`GateOne.Visual.CSSPluginAction`
    `go:load_style`      :js:func:`GateOne.Utils.loadStyleAction`
    `go:log`             :js:func:`GateOne.Net.log`
    `go:notice`          :js:func:`GateOne.Visual.serverMessageAction`
    `go:user_message`    :js:func:`GateOne.Visual.userMessageAction`
    `go:ping`            :js:func:`GateOne.Net.ping`
    `go:pong`            :js:func:`GateOne.Net.pong`
    `go:reauthenticate`  :js:func:`GateOne.Net.reauthenticate`
    `go:save_file`       :js:func:`GateOne.Utils.saveAsAction`
    `go:set_username`    :js:func:`GateOne.User.setUsernameAction`
    `go:timeout`         :js:func:`GateOne.Terminal.timeoutAction`
    ===================  ====================================================


.. note:: Most of the above is added via :js:func:`~GateOne.Net.addAction` inside of each respective module's ``init()`` function.

For example, if we execute :js:func:`GateOne.Net.ping`, this will send a message over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ like so:

.. code-block:: javascript

    GateOne.ws.send(JSON.stringify({'ping': timestamp}));

The GateOne server will receive this message and respond with a ``pong`` message that looks like this (Note: Python code below):

.. code-block:: python

    message = {'pong': timestamp} # The very same timestamp we just sent via GateOne.Net.ping()
    self.write_message(json_encode(message))

When GateOne.Net receives a message from the server over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ it will evaluate the object it receives as ``{action: message}`` and call the matching action in :js:attr:`GateOne.Net.actions`.  In this case, our action "pong" matches  :js:attr:`GateOne.Net.actions['pong']` so it will be called like so:

.. code-block:: javascript

    GateOne.Net.actions['pong'](message);

Plugin authors can add their own arbitrary actions using :js:func:`GateOne.Net.addAction`.  Here's an example taken from the SSH plugin:

.. code-block:: javascript

    GateOne.Net.addAction('sshjs_connect', GateOne.SSH.handleConnect);
    GateOne.Net.addAction('sshjs_reconnect', GateOne.SSH.handleReconnect);

If no action can be found for a message it will be passed to :js:func:`GateOne.Visual.displayMessage` and displayed to the user like so:

.. code-block:: javascript

    GateOne.Visual.displayMessage('Message From Server: ' + <message>);
*/
GateOne.Net.sslErrorTimeout = null; // A timer gets assigned to this that opens a dialog when we have an SSL problem (user needs to accept the certificate)
GateOne.Net.connectionSuccess = false; // Gets set after we connect successfully at least once
GateOne.Net.sendDimensionsCallbacks = []; // DEPRECATED: A hook plugins can use if they want to call something whenever the terminal dimensions change
GateOne.Net.reauthForceReload = true;
GateOne.Net.binaryBuffer = {}; // Incoming binary data messages get stored here like so:
// GateOne.Net.binaryBuffer[<ident>] = <binary message>
// ...where <ident> is the data inside the binary message leading up to a semicolon
GateOne.Base.update(GateOne.Net, {
    init: function() {
        /**:GateOne.Net.init()

        Assigns the `go:ping_timeout` event (which just displays a message to the user indicating as such).
        */
        go.Events.on("go:ping_timeout", function() {
            go.Visual.displayMessage(gettext("A keepalive ping has timed out.  Attempting to reconnect..."));
        });
    },
    sendChars: function() {
        /**:GateOne.Net.sendChars()

        .. deprecated:: 1.2
            Use :js:meth:`GateOne.Terminal.sendChars` instead.
        */
        go.Logging.deprecated("GateOne.Net.sendChars", gettext("Use GateOne.Terminal.Input.sendChars() instead."));
        go.Terminal.sendChars();
    },
    sendString: function(chars, term) {
        /**:GateOne.Net.sendString()

        .. deprecated:: 1.2
            Use :js:meth:`GateOne.Terminal.sendString` instead.
        */
        go.Logging.deprecated("GateOne.Net.sendString", gettext("Use GateOne.Terminal.sendString() instead."));
        go.Terminal.sendString(chars, term);
    },
    log: function(message) {
        /**:GateOne.Net.log(message)

        :param string message: The message received from the Gate One server.

        This function can be used in debugging :js:attr:`GateOne.Net.actions`; it logs whatever message is received from the Gate One server: ``GateOne.Logging.logInfo(message)`` (which would equate to console.log under most circumstances).

        When developing a new action, you can test out or debug your server-side messages by attaching the respective action to :js:func:`GateOne.Net.log` like so:

        .. code-block:: javascript

            GateOne.Net.addAction('my_action', GateOne.Net.log);

        Then you can view the exact messages received by the client in the JavaScript console in your browser.

        .. tip:: Executing ``GateOne.Logging.setLevel('DEBUG')`` in your JS console will also log all incoming messages from the server (though it can be a bit noisy).
        */
        go.Logging.logInfo(message);
    },
    ping: function(/*opt*/logLatency) {
        /**:GateOne.Net.ping([logLatency])

        Sends a 'ping' to the server over the WebSocket.  The response from the server is handled by :js:meth:`GateOne.Net.pong`.

        If a response is not received within a certain amount of time (milliseconds, controlled via `GateOne.prefs.pingTimeout`) the WebSocket will be closed and a `go:ping_timeout` event will be triggered.

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
        if (go.ws.readyState == 1) {
            go.ws.send(JSON.stringify({'go:ping': timestamp}));
        } else {
            go.Net.connectionProblem = true;
            go.Net.disconnect();
            go.Net.connectionError();
        }
        if (go.Net.pingTimeout) {
            clearTimeout(go.Net.pingTimeout);
            go.Net.pingTimeout = null;
        }
        if (timeout && timeout > 1000) { // minimum of a 1s timeout
            go.Net.pingTimeout = setTimeout(function() {
                logError(gettext("Pinging Gate One server took longer than ") + timeout + gettext("ms.  Attempting to reconnect..."));
                if (go.ws.readyState == 1) { go.ws.close(); }
                go.Net.connectionProblem = true;
                go.Events.trigger('go:ping_timeout');
            }, timeout);
        }
    },
    pong: function(timestamp) {
        /**:GateOne.Net.pong(timestamp)

        :param string timestamp: Expected to be the output of ``new Date().toISOString()`` (as generated by :js:func:`~GateOne.Net.ping`).

        Simply logs *timestamp* using :js:func:`GateOne.Logging.logInfo` and includes a measurement of the round-trip time in milliseconds.
        */
        var dateObj = new Date(timestamp), // Convert the string back into a Date() object
            now = new Date(),
            latency = now.getMilliseconds() - dateObj.getMilliseconds();
        if (go.Net.logLatency) {
            logInfo(gettext('PONG: Gate One server round-trip latency: ') + latency + 'ms');
        }
        if (go.Net.pingTimeout) {
            clearTimeout(go.Net.pingTimeout);
            go.Net.pingTimeout = null;
        }
        return latency;
    },
    reauthenticate: function() {
        /**:GateOne.Net.reauthenticate()

        Called when the Gate One server wants us to re-authenticate our session (e.g. our cookie expired).  Deletes the 'gateone_user' cookie and reloads the current page.

        This will force the client to re-authenticate with the Gate One server.

        To disable the automatic reload set `GateOne.Net.reauthForceReload = false`.
        */
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
            },
            takeAction = function() {
                v.alert(gettext('Authentication Failure'), gettext("The authentication object was denied by the server.  Click OK to reload the page."), redirect);
            };
        u.deleteCookie('gateone_user', '/', '');
        delete localStorage[prefix+'gateone_user']; // Also clear this if it is set
        // This is wrapped in a timeout because the 'reauthenticate' message comes just before the WebSocket is closed
        setTimeout(function() {
            if (go.Net.reconnectTimeout) {
                clearTimeout(go.Net.reconnectTimeout);
            }
        }, 500);
        go.Events.trigger("go:reauthenticate");
        if (go.Net.reauthForceReload) {
            takeAction();
        }
    },
    sendDimensions: function(term, /*opt*/ctrl_l) {
        /**:GateOne.Net.sendDimensions()

        .. deprecated:: 1.2
            Use :js:meth:`GateOne.Terminal.sendDimensions` instead.
        */
        GateOne.Logging.deprecated("GateOne.Net.sendDimensions", gettext("Use GateOne.Terminal.sendDimensions() instead."));
        GateOne.Terminal.sendDimensions(term, ctrl_l);
    },
    blacklisted: function(msg) {
        /**:GateOne.Net.blacklisted(msg)

        Called when the server tells us the client has been blacklisted (i.e for abuse).  Sets ``GateOne.Net.connect = GateOne.Utils.noop;`` so a new connection won't be attempted after being disconnected.  It also displays a message to the user from the server.
        */
        GateOne.Net.connect = GateOne.Utils.noop;
        GateOne.Net.connectionError = GateOne.Utils.noop;
        GateOne.node.innerHTML = msg;
    },
    connectionError: function(msg) {
        /**:GateOne.Net.connectionError(msg)

        Called when there's an error communicating over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_...  Displays a message to the user indicating there's a problem, logs the error (using ``logError()``), and sets a five-second timeout to attempt reconnecting.

        This function is attached to the WebSocket's ``onclose`` event and shouldn't be called directly.
        */
        go.Net.connectionProblem = true;
        // Stop trying to ping the server since we're no longer connected
        clearInterval(go.Net.keepalivePing);
        go.Net.keepalivePing = null;
        clearTimeout(go.Net.pingTimeout);
        go.Net.pingTimeout = null;
        var u = go.Utils,
            v = go.Visual,
            message = gettext("Attempting to connect to the Gate One server...");
        v.enableOverlay(); // So it is obvious that we're disconnected
        if (msg) {
            message = "<p>" + msg + "</p>";
        }
        go.Visual.displayMessage(message);
        // Fire a connection_error event.  DEVELOPERS: It's a good event to attach to in order to grab a new/valid API authentication object.
        // For reference, to reset the auth object just assign it:  GateOne.prefs.auth = <your auth object>
        go.Events.trigger("go:connection_error");
        go.Net.reconnectTimeout = setTimeout(go.Net.connect, 5000);
    },
    sslError: function() {
        /**:GateOne.Net.sslError()

        Called when we fail to connect due to an SSL error (user must accept the SSL certificate).  It displays a message to the user that gives them the option to open up a new page where they can accept the SSL certificate (it automatically redirects them back to the current page).
        */
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
        /**:GateOne.Net.connect([callback])

        Opens a connection to the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ defined in ``GateOne.prefs.url`` and stores it as :js:attr:`GateOne.ws`.  Once connected :js:func:`GateOne.initialize` will be called.

        If an error is encountered while trying to connect to the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_, :js:func:`GateOne.Net.connectionError` will be called to notify the user as such.  After five seconds, if a connection has yet to be connected successfully it will be assumed that the user needs to accept the Gate One server's SSL certificate.  This will invoke call to :js:func:`GateOne.Net.sslError` which will redirect the user to the ``accept_certificate.html`` page on the Gate One server.  Once that page has loaded successfully (after the user has clicked through the interstitial page) the user will be redirected back to the page they were viewing that contained Gate One.

        .. note:: This function gets called by :js:func:`GateOne.init` and there's really no reason why it should be called directly by anything else.
        */
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
        if (go.ws && go.ws.close) {
            go.ws.close();
        }
        go.ws = new WebSocket(go.wsURL); // For reference, I already tried Socket.IO and custom implementations of long-held HTTP streams...  Only WebSockets provide low enough latency for real-time terminal interaction.  All others were absolutely unacceptable in real-world testing (especially Flash-based...  Wow, really surprised me how bad it was).
        go.ws.binaryType = 'arraybuffer'; // In case binary data comes over the wire it is much easier to deal with it in arrayBuffer form.
        go.ws.onopen = function(evt) {
            go.Net.onOpen(callback);
        }
        go.ws.onclose = go.Net.onClose;
        // TODO: Get this figuring out if the origin was denied and displaying a helpful error message if that's the case.
        go.ws.onerror = function(evt) {
            // Something went wrong with the WebSocket (who knows?)
            go.Net.connectionProblem = true;
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
    onClose: function(evt) {
        /**:GateOne.Net.onClose(evt)

        Attached to :js:meth:`GateOne.ws.onclose`; called when the WebSocket is closed.

        If :js:attr:`GateOne.Net.connectionProblem` is ``true`` :js:meth:`GateOne.Net.connectionError` will be called.
        */
        logDebug(gettext("WebSocket Closed"));
        if (go.connectedTimeout) {
            go.Net.connectionProblem = true;
            // This prevents initialize() from being called if we were disconnected right away (e.g. due to blocked origin)
            clearTimeout(go.connectedTimeout);
            go.connectedTimeout = null;
        }
        if (go.Net.connectionProblem) {
            go.Net.connectionError();
        }
        go.Events.trigger("go:disconnected");
    },
    disconnect: function(/*opt*/reason) {
        /**:GateOne.Net.disconnect([reason])

        Closes the WebSocket and clears all processes (timeouts/keepalives) that watch the state of the connection.

        If a *reason* is given it will be passed to the WebSocket's ``close()`` function as the only argument.

        .. note:: The *reason* feature of WebSockets does not appear to be implemented in any browsers (yet).
        */
        clearTimeout(go.Net.sslErrorTimeout);
        go.Net.sslErrorTimeout = null;
        // Stop trying to ping the server since we're no longer connected
        clearInterval(go.Net.keepalivePing);
        go.Net.keepalivePing = null;
        clearTimeout(go.Net.pingTimeout);
        go.Net.pingTimeout = null;
        // Close the WebSocket
        go.ws.close(3000, reason); // Why 3000?  Why not!
        go.Visual.displayMessage(gettext("The WebSocket has been disconnected."));
    },
    onOpen: function(/*opt*/callback) {
        /**:GateOne.Net.onOpen([callback])

        This gets attached to :js:attr:`GateOne.ws.onopen` inside of :js:func:`~GateOne.Net.connect`.  It clears any error message that might be displayed to the user and asks the server to send us the (currently-selected) theme CSS and all plugin JS/CSS.  It then sends an authentication message (the `go:authenticate` WebSocket action) and calls :js:func:`GateOne.Net.ping` after a short timeout (to let things settle down lest they interfere with the ping time calculation).

        Lastly, it fires the `go:connnection_established` event.
        */
        logDebug("onOpen()");
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            gridwrapper = u.getNode('#'+prefix+'gridwrapper'),
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            settings = {
                'auth': go.prefs.auth,
                'container': go.prefs.goDiv.split('#')[1],
                'prefix': prefix,
                'location': go.location,
                'url': go.prefs.url
            };
        // Cancel our SSL error timeout since everything is working fine.
        clearTimeout(go.Net.sslErrorTimeout);
        // Close any open workspaces/apps (they'll be immediately re-created with the latest & greatest data from the server)
        workspaces.forEach(function(wsObj) {
            v.closeWorkspace(wsObj.id.split('workspace')[1]);
        });
        v.lastWorkspaceNumber = 0; // Reset it (applications will create their own workspaces)
        // Set connectionSuccess so we don't do an SSL check if the server goes down for a while.
        go.Net.connectionSuccess = true;
        v.disableOverlay(); // Just in case we're re-connecting
        // When we fail an origin check we'll get an error within a split second of onOpen() being called so we need to check for that and stop loading stuff if we're not truly connected.
        if (!go.Net.connectionProblem) {
            if (navigator.languages) { // Get locale strings ASAP
                go.i18n.setLocales(navigator.languages);
            } else if (navigator.language) {
                go.i18n.setLocales([navigator.language]);
            }
            if (go.connectedTimeout) {
                clearTimeout(go.connectedTimeout);
                go.connectedTimeout = null;
            }
            go.connectedTimeout = setTimeout(function() {
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
                        settings.auth = go.prefs.auth;
                    } else if (localStorage[prefix+'gateone_user']) {
                        logDebug("Using localStorage for auth");
                        go.prefs.auth = localStorage[prefix+'gateone_user'];
                        settings.auth = go.prefs.auth;
                    }
                }
                if (go.prefs.authenticate) {
                    go.ws.send(JSON.stringify({'go:authenticate': settings}));
                }
                // NOTE: The "go:connection_established" event is only useful to plugins/applications in *reconnect* situations.
                // Why?  Because it gets fired before plugin/application JS gets downloaded on initial page load.
                // So the only time a plugin/application can use it is when the connection to the server is re-established.
                go.Events.trigger("go:connection_established");
                go.initialize();
                if (callback) {
                    callback();
                }
                // Log the latency of the Gate One server after everything has settled down
                setTimeout(function() {go.Net.ping(true);}, 4000);
                // Start our keepalive process to check for timeouts
                if (go.prefs.keepaliveInterval) {
                    go.Net.keepalivePing = setInterval(function() {
                        go.Net.ping(false);
                    }, go.prefs.keepaliveInterval);
                }
            }, 100);
        }
    },
    onMessage: function(evt) {
        /**:GateOne.Net.onMessage(evt)

        :param event event: A `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ event object as passed by the 'message' event.

        This gets attached to :js:attr:`GateOne.ws.onmessage` inside of :js:func:`~GateOne.Net.connect`.  It takes care of decoding (`JSON <https://developer.mozilla.org/en/JSON>`_) messages sent from the server and calling any matching :js:attr:`~GateOne.Net.actions`.  If no matching action can be found inside ``event.data`` it will fall back to passing the message directly to :js:func:`GateOne.Visual.displayMessage`.
        */
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
        if (evt.data[0] == '{') {
            // This is a JSON-encoded WebSocket action
            messageObj = JSON.parse(evt.data);
        } else {
            // Non-JSON messages coming over the WebSocket are assumed to be errors, display them as-is (could be handy shortcut to display a message instead of using the 'notice' action).
            var noticeContainer = u.getNode('#'+prefix+'noticecontainer'),
                msg = gettext('<b>Message From Gate One Server:</b> ') + evt.data;
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
        u.getNode(go.prefs.goDiv).innerHTML = gettext("Your session has timed out.  Reload the page to reconnect to Gate One.");
        go.ws.onclose = function() { // Have to replace the existing onclose() function so we don't end up auto-reconnecting.
            // Connection to the server was lost
            logDebug("WebSocket Closed");
        }
        go.ws.close(); // No reason to leave it open taking up resources on the server.
        E.trigger('go:timeout');
    },
    addAction: function(name, func) {
        /**:GateOne.Net.addAction(name, func)

        :param string name: The name of the action we're going to attach *func* to.
        :param function func: The function to be called when an action arrives over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ matching *name*.

        Adds an action to the :js:attr:`GateOne.Net.actions` object.

        Example:

            >>> GateOne.Net.addAction('sshjs_connect', GateOne.SSH.handleConnect);
        */
        // Adds/overwrites actions in GateOne.Net.actions
        go.Net.actions[name] = func;
    },
    setTerminal: function(term) {
        /**:GateOne.Net.setTerminal()

        .. deprecated:: 1.2
            Use :js:meth:`GateOne.Terminal.setTerminal` instead.
        */
        go.Logging.deprecated("GateOne.Net.setTerminal", gettext("Use GateOne.Terminal.setTerminal() instead."));
        go.Terminal.setTerminal(term);
    },
    killTerminal: function(term) {
        /**:GateOne.Net.killTerminal()

        .. deprecated:: 1.2
            Use :js:meth:`GateOne.Terminal.killTerminal` instead.
        */
        go.Logging.deprecated("GateOne.Net.killTerminal", gettext("Use GateOne.Terminal.killTerminal() instead."));
        go.Terminal.killTerminal(term);
    },
    refresh: function(term) {
        /**:GateOne.Net.refresh()

        .. deprecated:: 1.2
            Use :js:meth:`GateOne.Terminal.refresh` instead.
        */
        go.Logging.deprecated("GateOne.Net.refresh", gettext("Use GateOne.Terminal.refresh() instead."));
        go.Terminal.refresh(term);
    },
    fullRefresh: function(term) {
        /**:GateOne.Net.fullRefresh()

        .. deprecated:: 1.2
            Use :js:meth:`GateOne.Terminal.fullRefresh` instead.
        */
        go.Logging.deprecated("GateOne.Net.fullRefresh", gettext("Use GateOne.Terminal.fullRefresh() instead."));
        go.Terminal.fullRefresh(term);
    },
    getLocations: function() {
        /**:GateOne.Net.getLocations()

        Asks the server to send us a list of locations via the `go:get_locations` WebSocket action.  Literally:

            >>> GateOne.ws.send(JSON.stringify({'go:get_locations': null}));

        This will ultimately result in :js:meth:`GateOne.Net.locationsAction` being called.
        */
        go.ws.send(JSON.stringify({'go:get_locations': null}));
    },
    locationsAction: function(locations) {
        /**:GateOne.Net.locationsAction()

        Attached to the `go:locations` WebSocket action.  Sets :js:attr:`GateOne.locations` to *locations* which should be an object that looks something like this:

        .. code-block:: javascript

            {"default":
                {"terminal":{
                    "1":{
                        "created":1380590438000,
                        "command":"SSH",
                        "title":"user@enterprise: ~"
                    },
                    "2":{
                        "created":1380590633000,
                        "command":"login",
                        "title":"root@enterprise: /var/log"
                    },
                "x11":{
                    "1":{
                        "created":1380590132000,
                        "command":"google-chrome-unstable",
                        "title":"Liftoff Software | Next stop, innovation - Google Chrome"
                    },
                    "2":{
                        "created":1380591192000,
                        "command":"subl",
                        "title":"~/workspace/SuperSandbox/SuperSandbox.js - Sublime Text (UNREGISTERED)"
                    },
                },
                "transfer":{
                    "1":{
                        "created":1380590132000,
                        "command":"Unknown",
                        "title":"From: bittorrent://kubuntu-13.04-desktop-armhf+omap4.img.torrent To: sftp://user@enterprise/home/user/downloads/ To: sftp://upload@ec2inst22/ubuntu-isos/ To: user@enterprise (client)"
                    },
                }
            }
        */
        go.locations = locations;
        go.Events.trigger('go:locations', locations);
    },
    setLocation: function(location) {
        /**:GateOne.Net.setLocation(location)

        :param string location: A string containing no spaces.

        Sets :js:attr:`GateOne.location` to *location* and sends a message (the `go:set_location` WebSocket action) to the Gate One server telling it to change the current location to *location*.
        */
        go.location = location;
        if (!go.prefs.embedded) {
            // Set the URL to reflect the proper location in case the user reloads the page
            history.pushState({}, document.title, "?location=" + location);
        }
        go.ws.send(JSON.stringify({'go:set_location': location}));
        go.Events.trigger("go:set_location", location);
    }
});
// Protocol actions
go.Net.actions = {
// These are what will get called when the server sends us each respective action
    'go:log': go.Net.log,
    'go:ping': go.Net.ping,
    'go:pong': go.Net.pong,
    'go:timeout': go.Net.timeoutAction,
    'go:blacklisted': go.Net.blacklisted,
    'go:locations': go.Net.locationsAction,
    'go:reauthenticate': go.Net.reauthenticate,
 // This is here because it needs to happen before most calls to init():
    'go:register_translation': go.i18n.registerTranslationAction
}

GateOne.Base.module(GateOne, 'Visual', '1.1', ['Base', 'Net', 'Utils']);
/**:GateOne.Visual

This module contains all of Gate One's visual effect functions.  It is just like :js:attr:`GateOne.Utils` but specific to visual effects and DOM manipulations.
*/

// NOTE:  Only adding docstrings for properties that are important/significant.
GateOne.Visual.gridView = false;
GateOne.Visual.goDimensions = {};
/**:GateOne.Visual.goDimensions

    Stores the dimensions of the :js:attr:`GateOne.prefs.goDiv` element in the form of ``{w: '800', h: '600'}`` where 'w' and 'h' represent the width and height in pixels.  It is used by several functions in order to calculate how far to slide terminals, how many rows and columns will fit, etc.

    Registers the following WebSocket actions:

        ===================  ==============================================
        Action               Function
        ===================  ==============================================
        `go:notice`          :js:meth:`GateOne.Visual.serverMessageAction`
        `go:user_message`    :js:meth:`GateOne.Visual.userMessageAction`
        ===================  ==============================================
*/
GateOne.Visual.lastMessage = '';
GateOne.Visual.sinceLastMessage = new Date();
GateOne.Visual.hidePanelsTimeout = {}; // Used by togglePanel() to keep track of which panels have timeouts
GateOne.Visual.togglingPanel = false;
GateOne.Visual.visible = true;
GateOne.Base.update(GateOne.Visual, {
    // Functions for manipulating views and displaying things
    init: function() {
        /**:GateOne.Visual.init()

        Adds the 'grid' icon to the toolbar for users to click on to bring up/down the grid view.

        Registers the following Gate One events:

            =======================     ============================================
            Event                       Function
            =======================     ============================================
            `go:switch_workspace`       :js:meth:`GateOne.Visual.slideToWorkspace`
            `go:switch_workspace`       :js:meth:`GateOne.Visual.locationsCheck`
            `go:cleanup_workspaces`     :js:meth:`GateOne.Visual.cleanupWorkspaces`
            =======================     ============================================

        Registers the following DOM events:

            ========    =========     ============================================
            Element     Event         Function
            ========    =========     ============================================
            `window`    `resize`      :js:meth:`GateOne.Visual.updateDimensions`
            ========    =========     ============================================
        */
//         console.log("GateOne.Visual.init()");
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            toolbarIconGrid = u.createElement('div', {'id': 'icon_grid', 'class': '✈toolbar_icon ✈icon_grid', 'title': "Grid View"}),
            debouncedUpdateDimensions = u.debounce(go.Visual.updateDimensions, 250),
            gridToggle = function() {
                v.toggleGridView(true);
            };
        // Setup our toolbar icons and actions
        toolbarIconGrid.innerHTML = GateOne.Icons.grid;
        toolbarIconGrid.onclick = gridToggle;
        // Stick it on the end (can go wherever--unlike GateOne.Terminal's icons)
        go.toolbar.appendChild(toolbarIconGrid);
        go.Events.on('go:switch_workspace', v.slideToWorkspace);
        go.Events.on('go:switch_workspace', v.locationsCheck);
        go.Events.on('go:cleanup_workspaces', v.cleanupWorkspaces);
        window.addEventListener('resize', debouncedUpdateDimensions, false);
        document.addEventListener(visibilityChange, go.Visual.handleVisibility, false);
    },
    postInit: function() {
        /**:GateOne.Visual.postInit()

        Sets up our default keyboard shortcuts and opens the application chooser if no other applications have opened themselves after a short timeout (500ms).

        Registers the following keyboard shortcuts:

            ====================================  =======================
            Function                              Shortcut
            ====================================  =======================
            New Workspace                         :kbd:`Control-Alt-N`
            Close Workspace                       :kbd:`Control-Alt-W`
            Show Grid                             :kbd:`Control-Alt-G`
            Switch to the workspace on the left   :kbd:`Shift-LeftArrow`
            Switch to the workspace on the right  :kbd:`Shift-RightArrow`
            Switch to the workspace above         :kbd:`Shift-UpArrow`
            Switch to the workspace below         :kbd:`Shift-DownArrow`
            ====================================  =======================
        */
        logDebug("GateOne.Visual.postInit()");
        var V = go.Visual,
            E = go.Events;
        if (!go.prefs.embedded) {
            go.Base.superSandbox("GateOne.Visual.postInitStuff", ["GateOne.Input"], function(window, undefined) {
                E.on("go:keydown:ctrl-alt-n", function() { V.appChooser(); });
                E.on("go:keydown:ctrl-alt-w", function() { V.closeWorkspace(localStorage[go.prefs.prefix+"selectedWorkspace"]); });
                E.on("go:keydown:ctrl-shift-arrow_left", function() { V.slideLeft(); });
                E.on("go:keydown:ctrl-shift-arrow_right", function() { V.slideRight(); });
                E.on("go:keydown:ctrl-shift-arrow_up", function() { V.slideUp(); });
                E.on("go:keydown:ctrl-shift-arrow_down", function() { V.slideDown(); });
                E.on("go:keydown:ctrl-alt-g", function() { V.toggleGridView(); });
            });
        }
    },
    // NOTE: Work-in-progress:
    locationsPanel: function() {
        /**:GateOne.Visual.locationsPanel()

        Creates the locations panel and adds it to `GateOne.node` (hidden by default).
        */
        var u = go.Utils,
            v = go.Visual,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': '✈panel_close_icon', 'title': "Close This Panel"}),
            locationsPanel = u.createElement('div', {'id': 'panel_locations', 'class':'✈panel ✈locations_panel'}),
            locationsPanelH2 = u.createElement('h2'),
            locationsList = u.createElement('div', {'id': 'locations_list', 'class': '✈locations_list'}),
            locationsListUL = u.createElement('ul', {'id': 'locations_list_ul'}),
            locationsContent = u.createElement('div', {'id': 'locations_content', 'class': '✈locations_content'}),
            locationsPanelRow1 = u.createElement('div', {'class':'✈paneltablerow'}),
            tableSettings = {
                'id': "locations_table",
                'header': [
                    gettext("Location"),
                    gettext("Application(s)"),
                    gettext("ID"),
                    gettext("Title")
                ]
            },
            tableData = [],
            table;
        locationsPanelH2.innerHTML = gettext("Locations");
        for (var loc in go.locations) {
            for (var app in go.locations[loc]) {
                for (var item in go.locations[loc][app]) {
                    tableData.push([loc, u.capitalizeFirstLetter(app), item, go.locations[loc][app][item].title]);
                }
            }
        }
        table = v.table(tableSettings, tableData);
        locationsContent.appendChild(table);
        locationsPanel.appendChild(locationsPanelH2);
        locationsPanel.appendChild(locationsContent);
        return locationsPanel;
    },
    showLocationsIcon: function() {
        /**:GateOne.Visual.showLocationsIcon()

        Creates then adds the location panel icon to the toolbar.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            existing = u.getNode('#'+prefix+'icon_locations'),
            newWSIcon = u.getNode('#'+prefix+'icon_newws'),
            toolbarIconLocations = u.createElement('div', {'id': 'icon_locations', 'class':'✈toolbar_icon', 'title': gettext("Locations")});
        // This is temporarily commented out while I work on the locations panel:
//         if (!existing) {
//             toolbarIconLocations.innerHTML = go.Icons['locations'];
//             // Add it immediately after the close workspace icon:
//             u.insertAfter(toolbarIconLocations, newWSIcon);
//         }
    },
    hideLocationsIcon: function() {
        /**:GateOne.Visual.showLocationsIcon()

        Removes the locations panel icon from the toolbar.
        */
        var u = go.Utils,
            existing = u.getNode('#'+go.prefs.prefix+'icon_locations');
        if (existing) {
            u.removeElement(existing);
        }
    },
    locationsCheck: function(workspaceNum) {
        /**:GateOne.Visual.locationsCheck(workspaceNum)

        Will add or remove the locations panel icon to/from the toolbar if the application residing in the current workspace supports locations.
        */
        var app = go.User.activeApplication;
        if (app && go.loadedApplications[app] && go.loadedApplications[app].__appinfo__.relocatable) {
            // Temporarily disabled while I complete the locations panel
            go.Visual.showLocationsIcon();
        } else {
            go.Visual.hideLocationsIcon();
        }
    },
    lastAppPosition: 0, // Used by appChooser() below
    appChooserRequirementsTimer: {}, // Ditto
    appChooser: function(/*opt*/where) {
        /**:GateOne.Visual.appChooser([where])

        Creates a new application chooser (akin to a browser's "new tab tab") that displays the application selection screen (and possibly other things in the future).

        If *where* is undefined a new workspace will be created and the application chooser will be placed there.  If *where* is ``false`` the new application chooser element will be returned without placing it anywhere.

        .. note:: The application chooser can be disabled by setting ``GateOne.prefs.showAppChooser = false`` or by passing 'go_prefs={"showAppChooser":false}' via the URL query string.  If ``GateOne.prefs.showAppChooser`` is an integer the application chooser will be prevented from being shown that many times before resuming the default behavior (shown).
        */
        logDebug("GateOne.Visual.appChooser()");
        if (!go.prefs.showAppChooser) {
            return;
        }
        if (!(isNaN(go.prefs.showAppChooser))) { // It's a number
            go.prefs.showAppChooser -= 1;
            if (go.prefs.showAppChooser <= 0) {
                go.prefs.showAppChooser = true; // Reset to default (show)
            }
        }
        var u = go.Utils,
            v = go.Visual,
            E = go.Events,
            prefix = go.prefs.prefix,
            apps = go.User.applications || [],
            selectedApp,
            spacers = 0,
            filteredApps = [],
            failedDepCheck,
            numWorkspaces = 0,
            appIcons,
            titleH2 = u.createElement('h2', {'class': '✈appchooser_title'}),
            acContainer = u.createElement('div', {'class': '✈centertrans ✈halfsectrans ✈appchooser'}),
            acAppGrid = u.createElement('div', {'class': '✈app_grid'}),
            workspace, // Set below
            workspaceNum, // Ditto
            currentApp,
            callFunc = function(settings, parentApp, e) {
                var subAppName = name = settings.name;
                if (parentApp !== undefined) {
                    name = parentApp.name;
                    settings = parentApp;
                    settings.sub_application = subAppName;
                }
                if (!where) {
                    where = acContainer.parentNode;
                }
                u.removeElement(acContainer);
                where.setAttribute('data-application', name);
                go.openApplication(name, settings, where);
            },
            addIcon = function(settings, parentApp, spacer) {
                if (settings.sub_applications) {
                    settings.sub_applications.forEach(function(subApp) {
                        addIcon(subApp, settings)
                    });
                    return;
                }
                if (settings['hidden']) {
                    return; // Don't show this one
                }
                var name = settings.name,
                    combinedName,
                    appSquare = u.createElement('div', {'class': '✈superfasttrans ✈application', 'data-appname': name}),
                    appIcon = u.createElement('div', {'class': '✈appicon'}),
                    appText = u.createElement('span', {'class': '✈application_text'});
                appText.innerHTML = name;
                appSquare.title = settings.description || "Opens the " + name + " application.";
                if (parentApp !== undefined) {
                    combinedName = parentApp.name + ": " + name;
                    appText.innerHTML = combinedName;
                    appSquare.title = settings.description || "Opens the " + combinedName + " sub-application.";
                    name = parentApp.name;
                }
                if (spacer) {
                    appSquare.style.opacity = 0;
                    appSquare.setAttribute('data-spacer', true);
                    appIcon.innerHTML = go.Icons.application;
                } else {
                    if (u.isFunction(go.loadedApplications[name].__appinfo__.icon)) {
                        // Use whatever the function returns as the icon
                        appIcon.innerHTML = go.loadedApplications[name].__appinfo__.icon(settings);
                    } else {
                        appIcon.innerHTML = go.loadedApplications[name].__appinfo__.icon || go.Icons.application;
                    }
                    // Add a viewBox property to the SVG if missing.  This makes the icon appear centered and the right size (most of the time).
                    var svgElem = appIcon.querySelector('svg');
                    if (!svgElem.getAttribute('viewBox')) {
                        svgElem.setAttribute('viewBox', '0 0 ' + svgElem.getAttribute('width') + ' ' + svgElem.getAttribute('height'));
                    }
                    appSquare.tabIndex = 0;
                    appSquare.addEventListener('click', u.partial(callFunc, settings, parentApp), false);
                }
                appSquare.appendChild(appIcon);
                appSquare.appendChild(appText);
                acAppGrid.appendChild(appSquare);
            },
            createAppGrid = function() {
                var appIcons = u.toArray(u.getNodes('.✈application')),
                    appTops = [],
                    rows = 0,
                    rowLength = 0;
                acContainer.style.opacity = 1;
                // Figure out how many spacers we need and add them
                for (var i=0; i<appIcons.length; i++) {
                    var top = appIcons[i].offsetTop;
                    if (appTops.indexOf(top) == -1) {
                        appTops.push(top);
                    }
                }
                rows = appTops.length;
                rowLength = Math.ceil(appIcons.length/rows);
                spacers = (rowLength * rows) % appIcons.length;
                for (var i=0; i<spacers; i++) {
                    var appObj = {'name': 'spacer'};
                    addIcon(appObj, undefined, true);
                }
                // This little timeout prevents all sorts of graphic nonsense (apparently if you focus() during a transition browsers get all sorts of confused!)
                setTimeout(function() {
                    if (appIcons[go.Visual.lastAppPosition]) {
                        appIcons[go.Visual.lastAppPosition].focus();
                    }
                }, 500);
            };
        if (v.debounceNewWSWS) {
            clearTimeout(v.debounceNewWSWS);
            v.debounceNewWSWS = null;
        }
        // Remove any apps that are missing the __appinfo__ object
        apps.forEach(function(appObj) {
            if (appObj.dependencies) {
                // Check that the dependencies are loaded before we create the appChooser
                if (!v.appChooserRequirementsTimer[appObj.name]) {
                    v.appChooserRequirementsTimer[appObj.name] = 1;
                }
                if (v.appChooserRequirementsTimer[appObj.name] < GateOne.Base.dependencyTimeout) {
                    for (var i=0; i < appObj.dependencies.length; i++) {
                        if (!(appObj.dependencies[i] in go.Storage.loadedFiles)) {
                            logDebug(appObj.name + " failed dependency check.  Will retry until " + appObj.dependencies[i] + ' is loaded');
                            // Retry in a moment or so
                            v.appChooserRequirementsTimer[appObj.name] += 50;
                            v.debounceNewWSWS = setTimeout(v.appChooser, 50);
                            failedDepCheck = true;
                            break;
                        }
                    }
                } else {
                    logError(gettext("Skipping adding the icon for ") + appObj.name + gettext(".  Took too long to load dependencies."));
                    failedDepCheck = true;
                }
            }
            if (!failedDepCheck && !appObj.hidden) {
                var name = appObj.name;
                if (go.loadedApplications[name] && go.loadedApplications[name].__appinfo__) {
                    filteredApps.push(Object.create(appObj)); // Use a copy so we don't clobber the original when we make modifications
                }
            }
        });
        if (failedDepCheck) {
            return; // Don't do anything more
        }
        where = u.getNode(where);
//         if (filteredApps.length == 1) {
//             // No workspace created yet; check if we should launch the default app (if only one)
//             // Check for sub-applications
//             var subApps = [];
//             if (filteredApps[0].sub_applications) {
//                 filteredApps[0].sub_applications.forEach(function(settings) {
//                     if (!settings['hidden']) {
//                         subApps.push(settings);
//                     }
//                 });
//             }
//             if (!subApps.length) {
//                 // If there's only one app don't bother making a listing; just launch the app
//                 setTimeout(function() {
//                     workspace = v.newWorkspace();
//                     workspace.setAttribute('data-application', filteredApps[0].name);
//                     go.loadedApplications[filteredApps[0].name].__new__(filteredApps[0], workspace);
//                 }, 5); // Need a tiny delay here so we don't end up in a new workspace/close workspace loop
//                 return;
//             } else if (subApps.length == 1){
//                 // There's only one sub-application in one app; launch it
//                 var settings = subApps[0];
//                 setTimeout(function() {
//                     workspace = v.newWorkspace();
//                     workspace.setAttribute('data-application', filteredApps[0].name);
//                     go.loadedApplications[filteredApps[0].name].__new__(settings, workspace);
//                 }, 5);
//                 return;
//             }
//         }
        titleH2.innerHTML = gettext("Gate One - Applications");
        acContainer.style.opacity = 0;
        acContainer.appendChild(titleH2);
        acContainer.appendChild(acAppGrid);
        // Enable using the keyboard to navigate the application icons:
        acContainer.addEventListener('keyup', function(e) {
            var key = go.Input.key(e),
                modifiers = go.Input.modifiers(e),
                numIcons = appIcons.length - spacers,
                rows = 0,
                rowLength = 0,
                appGrid = [],
                appTops = [],
                clickEvent = document.createEvent('MouseEvents');
            if (!modifiers.shift) {
                clickEvent.initEvent('click', true, true);
                if (!selectedApp) {
                    selectedApp = u.getNode('.✈application');
                    selectedApp.focus();
                }
                for (var i=0; i<numIcons; i++) {
                    var top = appIcons[i].offsetTop;
                    if (appTops.indexOf(top) == -1) {
                        appTops.push(top);
                    }
                }
                rows = appTops.length;
                rowLength = Math.ceil(numIcons/rows);
                if (key.string == "KEY_ARROW_UP") {
                    go.Visual.lastAppPosition -= rowLength;
                    if (go.Visual.lastAppPosition < 0) {
                        go.Visual.lastAppPosition = numIcons + go.Visual.lastAppPosition - 1;
                    }
                    appIcons[go.Visual.lastAppPosition].focus();
                    selectedApp = appIcons[go.Visual.lastAppPosition];
                } else if (key.string == "KEY_ARROW_DOWN") {
                    go.Visual.lastAppPosition += rowLength;
                    if (go.Visual.lastAppPosition > (numIcons-1)) {
                        go.Visual.lastAppPosition = Math.abs(numIcons - go.Visual.lastAppPosition);
                    }
                    appIcons[go.Visual.lastAppPosition].focus();
                    selectedApp = appIcons[go.Visual.lastAppPosition];
                } else if (key.string == "KEY_ARROW_LEFT") {
                    go.Visual.lastAppPosition -= 1;
                    if (go.Visual.lastAppPosition < 0) {
                        go.Visual.lastAppPosition = numIcons - 1;
                    }
                    appIcons[go.Visual.lastAppPosition].focus();
                    selectedApp = appIcons[go.Visual.lastAppPosition];
                } else if (key.string == "KEY_ARROW_RIGHT") {
                    go.Visual.lastAppPosition += 1;
                    if (go.Visual.lastAppPosition > (numIcons - 1)) {
                        go.Visual.lastAppPosition = 0;
                    }
                    appIcons[go.Visual.lastAppPosition].focus();
                    selectedApp = appIcons[go.Visual.lastAppPosition];
                } else if (key.string == "KEY_ENTER") {
                    if (document.activeElement.classList.contains('✈application')) {
                        document.activeElement.dispatchEvent(clickEvent);
                    }
                }
            }
        }, true);
        filteredApps.forEach(function(appObj) {
            if (appObj.sub_applications) {
                appObj.sub_applications.sort();
            }
            addIcon(appObj);
        });
        if (where !== false) {
            if (where === undefined || !u.isElement(where)) {
                where = v.newWorkspace();
                workspaceNum = where.getAttribute('data-workspace');
                currentApp = where.getAttribute('data-application');
                where.setAttribute('data-application', gettext("Application Chooser"));
            }
            where.appendChild(acContainer);
        } else {
            acContainer.style.opacity = 1;
        }
        appIcons = u.toArray(u.getNodes('.✈application'));
        selectedApp = appIcons[go.Visual.lastAppPosition];
        // Bring it back into view
        if (currentApp == gettext("Application Chooser")) { // Current workspace is already an app chooser; just redraw it
            createAppGrid();
        } else {
            if (workspaceNum == 1) {
                // No other apps open; create the app grid immediately
                setTimeout(createAppGrid, 1); // Wrapped in a super short timeout to make the fade in effect work
            } else {
                E.once("go:ws_transitionend", createAppGrid);
            }
        }
        v.setTitle(gettext("Applications Chooser"));
        if (workspaceNum) {
            v.switchWorkspace(workspaceNum);
        }
        E.trigger('go:app_chooser', where);
        return acContainer;
    },
    setTitle: function(title) {
        /**:GateOne.Visual.setTitle(title)

        Sets the innerHTML of the '✈sideinfo' element to *title*.

        .. note:: The location of the '✈sideinfo' is controlled by the theme but it is typically on the right-hand side of the window.
        */
        var u = go.Utils,
            v = go.Visual,
            scaleDown,
            sideinfo = go.sideinfo,
            heightDiff = go.node.clientHeight - go.toolbar.clientHeight,
            scrollbarAdjust = (go.Visual.scrollbarWidth || 15); // Fallback to 15px if this hasn't been set yet (a common width)
        logDebug("setTitle(" + title + ")");
        if (sideinfo) {
            sideinfo.innerHTML = title;
            // Now scale sideinfo so that it looks as nice as possible without overlapping the icons
            v.applyTransform(sideinfo, "rotate(90deg)"); // This removes the 'scale()' and 'translateY()' portions (if present)
            if (sideinfo.clientWidth > heightDiff) { // We have overlap
                scaleDown = heightDiff / (sideinfo.clientWidth + 10); // +10 to give us some space between
                scrollbarAdjust = Math.ceil(scrollbarAdjust * (1-scaleDown));
                v.applyTransform(sideinfo, "rotate(90deg) scale(" + scaleDown + ")" + "translateY(" + scrollbarAdjust + "px)");
            }
        }
        go.Events.trigger('go:set_title_action', title);
    },
    updateDimensions: function(/*opt*/force) {
        /**:GateOne.Visual.updateDimensions([force])

        Sets :js:attr:`GateOne.Visual.goDimensions` to the current width/height of :js:attr:`GateOne.prefs.goDiv`.  Typically called when the browser window is resized.

            >>> GateOne.Visual.updateDimensions();

        Also sends the "go:set_dimensions" WebSocket action to the server so that it has a reference of the client's width/height as well as information about the size of the goDiv (usually #gateone) element and the size of workspaces.

        If *force* is `true` then the 'go:set_dimensions' WebSocket action will be sent to the server with the current dimensions and the 'go:update_dimensions' event will be triggered with the current dimensions *even if the dimensions have not changed*.
        */
        logDebug('updateDimensions()');
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            prevWidth, prevHeight,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            wrapperDiv = u.getNode('#'+prefix+'gridwrapper'),
            rightAdjust = 0,
            style = getComputedStyle(go.node, null),
            sidebarWidth = 0,
            paddingRight = (style['padding-right'] || style['paddingRight']);
        if (style['padding-right']) {
            var rightAdjust = parseInt(paddingRight.split('px')[0]);
        }
        if (v.goDimensions && v.goDimensions.w) {
            prevWidth = v.goDimensions.w;
            prevHeight = v.goDimensions.h;
        }
        v.goDimensions.w = parseInt(style.width.split('px')[0]);
        v.goDimensions.h = parseInt(style.height.split('px')[0]);
        if (!go.sideinfo.innerHTML.length) {
            go.sideinfo.innerHTML = "Gate One";
        }
        if (u.isVisible(go.toolbar)) {
            sidebarWidth = go.toolbar.clientWidth;
        }
        if (u.isVisible(go.sideinfo)) {
            // Use whichever is wider
            sidebarWidth = Math.max(sidebarWidth, go.sideinfo.clientHeight);
            // NOTE: We use the clientHeight on the sideinfo because it is rotated sideways 90°
        }
        if (!force) {
            if (prevWidth == v.goDimensions.w && prevHeight == v.goDimensions.h) {
                // Nothing changed so we don't need to proceed further
                return;
            }
        }
        if (wrapperDiv) { // Explicit check here in case we're embedded into something that isn't using the grid (aka the wrapperDiv here).
            // Update the width of gridwrapper in case #gateone has padding
            wrapperDiv.style.width = ((v.goDimensions.w+rightAdjust)*2) + 'px';
            if (workspaces.length) {
                workspaces.forEach(function(wsNode) {
                    wsNode.style.height = v.goDimensions.h + 'px';
                    wsNode.style.width = (v.goDimensions.w - sidebarWidth) + 'px';
                });
            }
        }
        go.ws.send(JSON.stringify({
            "go:set_dimensions": {
                "gateone": {"width": v.goDimensions.w, "height": v.goDimensions.h},
                "workspace": {"width": v.goDimensions.w - sidebarWidth, "height": v.goDimensions.h},
                "window": {"width": window.innerWidth, "height": window.innerHeight},
                "screen": {"width": screen.width, "height": screen.height}
            }
        }));
        go.Events.trigger("go:update_dimensions", v.goDimensions);
    },
    transitionEvent: function() {
        /**:GateOne.Visual.transitionEvent()

        Returns the correct name of the 'transitionend' event for the current browser.  Example:

            >>> console.log(GateOne.Visual.transitionEvent()); // Pretend we're using Chrome
            'webkitTransitionEnd'
            >>> console.log(GateOne.Visual.transitionEvent()); // Pretend we're using Firefox
            'transitionend'
        */
        var t, el = document.createElement('fakeelement'),
            transitions = {
                'transition':'transitionend',
                'OTransition':'oTransitionEnd',
                'MozTransition':'transitionend',
                'WebkitTransition':'webkitTransitionEnd'
            };
        for (t in transitions){
            if(el.style[t] !== undefined) {
                return transitions[t];
            }
        }
    },
    applyTransform: function(obj, transform) {
        /**:GateOne.Visual.applyTransform(obj, transform[, callback1[, callbackN]])

        :param obj: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id``, a DOM node, an `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_ of DOM nodes, an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_, or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.
        :param transform: A `CSS3 transform <http://www.w3schools.com/cssref/css3_pr_transform.asp>`_ function such as ``scale()`` or ``translate()``.
        :param callbacks: Any number of functions can be supplied to be called back after the transform is applied.  Each callback will be called after the previous one has completed.  This allows the callbacks to be chained one after the other to create animations. (see below)

        This function is Gate One's bread and butter:  It applies the given CSS3 *transform* to *obj*.  *obj* can be one of the following:

        * A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ -like string (e.g. "#some_element_id").
        * A DOM node.
        * An `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_ or an Array-like object containing DOM nodes such as `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_ or `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ (it will apply the transform to all of them).

        The *transform* should be *just* the actual transform function (e.g. ``scale(0.5)``).  :js:func:`~GateOne.Visual.applyTransform` will take care of applying the transform according to how each browser implements it.  For example:

            >>> GateOne.Visual.applyTransform('#somediv', 'translateX(500%)');

        ...would result in ``#somediv`` getting styles applied to it like this:

        .. code-block:: css

            #somediv {
                -webkit-transform: translateX(500%); // Chrome/Safari/Webkit-based stuff
                -moz-transform: translateX(500%);    // Mozilla/Firefox/Gecko-based stuff
                -o-transform: translateX(500%);      // Opera
                -ms-transform: translateX(500%);     // IE9+
                -khtml-transform: translateX(500%);  // Konqueror
                transform: translateX(500%);         // Some day this will be all that is necessary
            }

        Optionally, any amount of callback functions may be provided which will be called after each transform (aka transition) completes.  These callbacks will be called in a chain with the next callback being called after the previous one is complete.  Example:

            >>> // Chain three moves of #gateone; each waiting for the previous transition to complete before continuing in the chain:
            >>> GateOne.Visual.applyTransform(GateOne.node, 'translateX(-2%)', function() { GateOne.Visual.applyTransform(GateOne.node, 'translateX(2%)') }, function() { GateOne.Visual.applyTransform(GateOne.node, ''); }, function() { console.log('transition chain complete'); });
        */
//         logDebug('applyTransform(' + typeof(obj) + ', ' + transform + ')');
        var u = go.Utils,
            transforms = {
                '-webkit-transform': '', // Chrome/Safari/Webkit-based stuff
                '-moz-transform': '', // Mozilla/Firefox/Gecko-based stuff
                '-o-transform': '', // Opera
                '-ms-transform': '', // IE9+
                '-khtml-transform': '', // Konqueror
                'transform': '' // Some day this will be all that is necessary
            },
            callbacks = Array.prototype.slice.call(arguments, 2).reverse(), // All arguments after the first two
            chain = function(node) {
                var callback = callbacks.pop(),
                    next = function() {
                        callback();
                        node.removeEventListener(go.Visual.transitionEvent(), next, false); // Clean up
                        if (callbacks.length) {
                            // To iterate is human; to recur, divine.
                            chain(node);
                        }
                    };
                node.addEventListener(go.Visual.transitionEvent(), next, false);
            };
        if (u.isNodeList(obj) || u.isHTMLCollection(obj) || u.isArray(obj)) {
            u.toArray(obj).forEach(function(node) {
                node = u.getNode(node);
                for (var prefix in transforms) {
                    node.style[prefix] = transform;
                }
                if (node.style.MozTransform != undefined) {
                    node.style.MozTransform = transform; // Firefox doesn't like node.style['-moz-transform'] for some reason
                }
                if (callbacks.length) {
                    chain(node);
                }
            });
        } else if (typeof(obj) == 'string' || u.isElement(obj)) {
            var node = u.getNode(obj); // Doesn't hurt to pass a node to getNode
            for (var prefix in transforms) {
                node.style[prefix] = transform;
            }
            if (node.style.MozTransform != undefined) {
                node.style.MozTransform = transform; // Firefox doesn't like node.style['-moz-transform'] for some reason
            }
            if (callbacks.length) {
                chain(node);
            }
        }
    },
    applyStyle: function(elem, style) {
        /**:GateOne.Visual.applyStyle(elem, style)

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
        :param style: A JavaScript object holding the style that will be applied to *elem*.

        A convenience function that allows us to apply multiple style changes in one go.  For example:

            >>> GateOne.Visual.applyStyle('#somediv', {'opacity': 0.5, 'color': 'black'});
        */
        var node = GateOne.Utils.getNode(elem);
        for (var name in style) {
            node.style[name] = style[name];
        }
    },
    getTransform: function(elem) {
        /**:GateOne.Visual.getTransform(elem)

        :param number elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string ID or a DOM node.

        Returns the transform string applied to the style of the given *elem*

            >>> GateOne.Visual.getTransform('#go_term1_pre');
            "translateY(-3px)"
        */
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
    togglePanel: function(panel, callback) {
        /**:GateOne.Visual.togglePanel(panel[, callback])

        Toggles the given *panel* in or out of view.  If other panels are open at the time, they will be closed. If *panel* evaluates to false, all open panels will be closed.

        This function also has some events that can be hooked into:

            * When the panel is toggled out of view: ``GateOne.Events.trigger("go:panel_toggle:out", panelElement)``
            * When the panel is toggled into view: ``GateOne.Events.trigger("go:panel_toggle:in", panelElement)``

        You can hook into these events like so:

            >>> GateOne.Events.on("go:panel_toggle:in", myFunc); // When panel is toggled into view
            >>> GateOne.Events.on("go:panel_toggle:out", myFunc); // When panel is toggled out of view

        If a *callback* is given it will be called after the panel has *completed* being toggled *in* (i.e. after animations have completed).
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
            },
            removeEvent = function() {
                panel.removeEventListener(v.transitionEndName, callback, false);
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
                E.trigger("go:panel_toggle:out", panels[i]);
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
                if (callback) {
                    if (go.prefs.disableTransitions) {
                        setTimeout(callback, 100); // Emulate the transitionend event (slightly)
                    } else {
                        panel.addEventListener(v.transitionEndName, callback, false);
                        panel.addEventListener(v.transitionEndName, removeEvent, false);
                    }
                }
                v.applyTransform(panel, 'scale(1)');
            }, 10);
            // Call any registered 'in' callbacks for all of these panels
            E.trigger("go:panel_toggle:in", panel)
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
            v.applyTransform(panel, 'scale(0)');
            // Call any registered 'out' callbacks for all of these panels
            E.trigger("go:panel_toggle:out", panel);
            setTimeout(function() {
                // Hide the panel completely now that it has been scaled out to avoid tabIndex issues
                u.hideElement(panel);
                v.togglingPanel = false;
            }, 1100);
        }
    },
    // TODO: Add support for 0 removeTimeout for messaged that need to be confirmed
    // TODO: Change this from using all these arguments to using an object: {'timeout': 5000, 'removeTimeout': 5000}
    displayMessage: function(message, /*opt*/timeout, /*opt*/removeTimeout, /*opt*/id, /*opt*/noLog) {
        /**:GateOne.Visual.displayMessage(message[, timeout[, removeTimeout[, id]]])

        :param string message: The message to display.
        :param integer timeout: Milliseconds; How long to display the message before starting the *removeTimeout* timer.  **Default:** 1000.
        :param integer removeTimeout: Milliseconds; How long to delay before calling :js:func:`GateOne.Utils.removeElement` on the message DIV.  **Default:** 5000.
        :param string id: The ID to assign the message DIV.  **Default:** `GateOne.prefs.prefix+"notice"`.
        :param boolean noLog: If set to ``true`` the message will not be logged.

        .. figure:: screenshots/gateone_displaymessage.png
            :class: portional-screenshot
            :align: right

        Displays *message* to the user via a transient pop-up DIV that will appear inside :js:attr:`GateOne.prefs.goDiv`.  How long the message lasts can be controlled via *timeout* and *removeTimeout* (which default to 1000 and 5000, respectively).

        If *id* is given, it will be prefixed with :js:attr:`GateOne.prefs.prefix` and used as the DIV ID for the pop-up.  i.e. ``GateOne.prefs.prefix+id``.  The default is ``GateOne.prefs.prefix+"notice"``.

            >>> GateOne.Visual.displayMessage('This is a test.');

        .. note:: The default is to display the message in the lower-right corner of :js:attr:`GateOne.prefs.goDiv` but this can be controlled via CSS.
        */
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
            unique = u.randomString(8, 'abcdefghijklmnopqrstuvwxyz'),
            logTemp = u.createElement('div'), // Used to strip HTML from messages before we log them (because they're hard to read otherwise)
            removeFunc = function(now) {
                v.noticeTimers[unique] = setTimeout(function() {
                    if (!go.prefs.disableTransitions) {
                        go.Visual.applyStyle(notice, {'opacity': 0});
                    }
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
        if (!noLog) {
            logTemp.innerHTML = message; // So we can strip the HTML
            logInfo('Message: ' + logTemp.textContent); // Useful for looking at previous messages
        }
        timeout = timeout || 1000;
        removeTimeout = removeTimeout || 5000;
        if (!noticeContainer) {
            // Use a fallback (Gate One probably hasn't loaded yet; error situation)
            var msgContainer = u.createElement('div', {'id': 'noticecontainer' + unique, 'style': {'font-size': '1.5em', 'background-color': '#000', 'margin': '.5em', 'color': '#fff', 'display': 'block', 'z-index': 999999}}); // Have to use 'style' since CSS may not have been loaded
            msgContainer.innerHTML = message;
            document.body.appendChild(msgContainer);
            setTimeout(function() {
                u.removeElement(msgContainer);
            }, removeTimeout);
            return;
        }
        messageSpan.innerHTML = message;
        closeX.innerHTML = go.Icons.close.replace('closeGradient', 'miniClose'); // replace() here works around a browser bug where SVGs will disappear if you remove one that has the same gradient name as another.
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
        /**:GateOne.Visual.disableTransitions(elem[, elem2[, ...]])

        Sets the 'noanimate' class on *elem* and any additional elements passed as arguments which can be a node or querySelector-like string (e.g. #someid).  This class sets all CSS3 transformations to happen instantly without delay (which would animate).
        */
        for (var i=0; i<arguments.length; i++) {
            var node = go.Utils.getNode(arguments[i]);
            if (node.classList) {
                if (!node.classList.contains('✈noanimate')) {
                    node.classList.add("✈noanimate");
                }
            }
        }
    },
    enableTransitions: function(elem) {
        /**:GateOne.Visual.enableTransitions(elem[, elem2[, ...]])

        Removes the 'noanimate' class from *elem* and any additional elements passed as arguments (if set) which can be a node or querySelector-like string (e.g. #someid).
        */
        for (var i=0; i<arguments.length; i++) {
            var node = go.Utils.getNode(arguments[i]);
            if (node.classList) {
                if (node.classList.contains('✈noanimate')) {
                    node.classList.remove("✈noanimate");
                }
            }
        }
    },
    handleVisibility: function(e) {
        /**:GateOne.Visual.handleVisibility(e)

        This function gets called whenever a tab connected to Gate One becomes visible or invisible.  Triggers the `go:visible` and `go:invisible` events.
        */
        if (!go.Utils.isPageHidden()) {
            // Page has become visibile again
            logDebug(gettext("Ninja Mode disabled."));
            go.Visual.visible = true;
            go.Events.trigger("go:visible");
        } else {
            logDebug(gettext("Ninja Mode!  Gate One has become hidden."));
            go.Visual.visible = false;
            go.Events.trigger("go:invisible");
        }
    },
    newWorkspace: function() {
        /**:GateOne.Visual.newWorkspace()

        Creates a new workspace on the grid and returns the DOM node that is the new workspace.

        If the currently-selected workspace happens to be the application chooser it will be emptied and returned instead of creating a new one.
        */
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            workspaceNum = 0,
            workspaceNode,
            sidebarWidth,
            appChooser,
            currentWorkspace = localStorage[prefix+'selectedWorkspace'],
            existingWorkspace = u.getNode('#'+prefix+'workspace'+currentWorkspace),
            gridwrapper = u.getNode('#'+prefix+'gridwrapper'),
            workspaceObj = {created: new Date()};
        if (existingWorkspace) {
            appChooser = existingWorkspace.querySelector('.✈appchooser');
            if (appChooser) {
                existingWorkspace.innerHTML = ''; // Empty it out
                return existingWorkspace; // Use it
            }
        }
        if (!v.lastWorkspaceNumber) {
            v.lastWorkspaceNumber = 0; // Start at 0 so the first increment will be 1
        }
        v.lastWorkspaceNumber = v.lastWorkspaceNumber + 1;
        workspaceNum = v.lastWorkspaceNumber;
        currentWorkspace = prefix+'workspace'+workspaceNum;
        if (!go.sideinfo.innerHTML.length) {
            go.sideinfo.innerHTML = 'Gate One'; // So we can measure how tall the text is
        }
        sidebarWidth = go.toolbar.clientWidth || go.sideinfo.clientHeight; // clientHeight is used on the sideinfo because it is rotated 90 degrees
        // Prepare the workspace div for the grid
        if (go.prefs.showTitle || go.prefs.showToolbar) {
            // If there's a sidebar of some sort then we need to take that into account when making the workspace:
            workspaceNode = u.createElement('div', {'id': currentWorkspace, 'class': '✈workspace', 'style': {'width': (v.goDimensions.w - sidebarWidth) + 'px', 'height': v.goDimensions.h + 'px'}});
        } else {
            workspaceNode = u.createElement('div', {'id': currentWorkspace, 'class': '✈workspace', 'style': {'width': v.goDimensions.w + 'px', 'height': v.goDimensions.h + 'px'}});
        }
        workspaceNode.setAttribute('data-workspace', workspaceNum);
        workspaceObj['node'] = workspaceNode;
        go.workspaces[workspaceNum] = workspaceObj;
        gridwrapper.appendChild(workspaceNode);
        workspaceNode.focus();
        go.Events.trigger('go:new_workspace', workspaceNum);
        return workspaceNode;
    },
    closeWorkspace: function(workspace, /*opt*/message) {
        /**:GateOne.Visual.closeWorkspace(workspace)

        Removes the given *workspace* from the 'gridwrapper' element and triggers the `go:close_workspace` event.

        If *message* (string) is given it will be displayed to the user when the workspace is closed.

        .. note:: If you're writing an application for Gate One you'll definitely want to attach a function to the `go:close_workspace` event to close your application.
        */
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            workspaces;
        u.removeElement('#'+prefix+'workspace' + workspace);
        // Now find out what the previous workspace was and move to it
        workspaces = u.toArray(u.getNodes('.✈workspace'));
        if (message) { v.displayMessage(message); }
        if (!workspaces.length) {
            v.lastWorkspaceNumber = 0;
        } else {
            workspaces.forEach(function(wsObj) {
                v.lastWorkspaceNumber = parseInt(wsObj.id.split('workspace')[1]);
            });
        }
        if (v.lastWorkspaceNumber) {
            v.switchWorkspace(v.lastWorkspaceNumber);
        }
        // Only open a new workspace if we're not in embedded mode.  When you embed you have more explicit control but that also means taking care of stuff like this on your own.
        if (!go.prefs.embedded) {
            if (go.ws.readyState == 1) {
                if (u.getNodes('.✈workspace').length < 1) {
                    // There are no other workspaces and we're still connected.  Open a new one...
                    v.appChooser();
                }
            }
        }
        go.Events.trigger('go:close_workspace', workspace);
    },
    switchWorkspace: function(workspace) {
        /**:GateOne.Visual.switchWorkspace(workspace)

        Triggers the `go:switch_workspace` event which by default calls :js:meth:`GateOne.Visual.slideToWorkspace`.

        .. tip:: If you wish to use your own workspace-switching animation just write your own function to handle it and call `GateOne.Events.off('go:switch_workspace', GateOne.Visual.slideToWorkspace); GateOne.Events.on('go:switch_workspace', yourFunction);`
        */
        var activeWS = localStorage[go.prefs.prefix+'selectedWorkspace'];
        logDebug('switchWorkspace(' + workspace + '), active workspace: ' + activeWS);
        go.Events.trigger('go:switch_workspace', workspace);
        // NOTE: The following *must* come after the tiggered event above!
        localStorage[go.prefs.prefix+'selectedWorkspace'] = workspace;
    },
    cleanupWorkspaces: function() {
        /**:GateOne.Visual.cleanupWorkspaces()

        This gets attached to the 'go:cleanup_workspaces' event which should be triggered by any function that may leave a workspace empty.  It walks through all the workspaces and removes any that are empty.

        For example, let's say your app just removed itself from the workspace as a result of a server-controlled action (perhaps a BOFH killed the user's process).  At the end of your `closeMyApp()` function you want to put this:

        .. code-block:: javascript

            GateOne.Events.trigger("go:cleanup_workspaces");

        .. note:: Make sure you trigger the event instead of calling this function directly so that other attached functions can do their part.

        .. container:: explanation

            Why is this mechanism the opposite of everything else where you call the function and that function triggers its associated event?  Embedded mode, of course!  In embedded mode the parent web page may use something other than workspaces (e.g. tabs).  In embedded mode this function never gets attached to the `go:cleanup_workspaces` event so this function will never get called.  This allows the page embedding Gate One to attach its own function to this event to perform an equivalent action (for whatever workspace-like mechanism it is using).
        */
        logDebug("cleanupWorkspaces()");
        var u = go.Utils,
            v = go.Visual,
            workspaces = u.toArray(u.getNodes('.✈workspace'));
        workspaces.forEach(function(wsNode) {
            var workspaceNum = wsNode.id.split(go.prefs.prefix+'workspace')[1];
            if (!wsNode.innerHTML.length) {
                v.closeWorkspace(workspaceNum);
            }
        });
    },
    relocateWorkspace: function(workspace, location) {
        /**:GateOne.Visual.relocateWorkspace(workspace, location)

        Relocates the given *workspace* (number) to the given *location* by firing the `go:relocate_workspace` event and *then* closing the workspace (if not already closed).  The given *workspace* and *location* will be passed to the event as the only arguments.

        The 'data-application' attribute of the DOM node associated with the given *workspace* will be used to determine whether or not the application running on the workspace is relocatable.  It does this by checking the matching application's '__appinfo__.relocatable' attribute.

        Applications that support relocation must ensure that they set the appropriate 'data-application' attribute on the workspace if they create workspaces on their own.
        */
        var workspaceNode = go.Utils.getNode('#'+go.prefs.prefix+'workspace'+workspace),
            app = workspaceNode.getAttribute('data-application');
        if (app && go.loadedApplications[app].__appinfo__.relocatable) {
            go.Events.trigger("go:relocate_workspace", workspace, location);
            if (workspaceNode) { // Some apps will close the workspace on their own
                go.Visual.closeWorkspace(workspace);
            }
        }
    },
    _slideEndForeground: function(e) {
        var v = go.Visual;
        e.target.removeEventListener(v.transitionEndName, v._slideEndForeground, false);
        v.disableTransitions(e.target);
        v.applyTransform(e.target, 'translate(0px, 0px)');
        e.target.style.display = ''; // Reset
        v.transitioning = false;
        go.Events.trigger("go:ws_transitionend", e.target);
    },
    _slideEndBackground: function(e) {
        var v = GateOne.Visual;
        e.target.removeEventListener(v.transitionEndName, v._slideEndBackground, false);
        v.disableTransitions(e.target);
        e.target.style.display = 'none';
    },
    slideToWorkspace: function(workspace) {
        /**:GateOne.Visual.slideToWorkspace(workspace)

        Slides the view to the given *workspace*.  If `GateOne.Visual.noReset` is true, don't reset the grid before switching.
        */
        logDebug('slideToWorkspace(' + workspace + ')');
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            activeWS = localStorage[go.prefs.prefix+'selectedWorkspace'],
            count = 0,
            wPX = 0,
            hPX = 0,
            animation = go.prefs.wsAnimation,
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            rightAdjust = 0,
            bottomAdjust = 0,
            timeToSwitch = 1000;
        // Reset the grid so that all workspace are in their default positions before we do the switch
        if (!v.noReset) {
            v.resetGrid(true);
        } else {
            v.noReset = false; // Reset the reset :)
        }
        setTimeout(function() { // This is wrapped in a 1ms timeout to ensure the browser applies it AFTER the first set of transforms are applied.  Otherewise it will happen so fast that the animation won't take place.
            v.transitioning = true;
            workspaces.forEach(function(wsNode) {
                v.enableTransitions(wsNode);  // Turn animations back on in preparation for the next step
                // Calculate all the width and height adjustments so we know where to move them
                count = count + 1;
                if (wsNode.id == prefix + 'workspace' + workspace) { // Use the workspace we're switching to this time
                    if (u.isEven(count)) {
                        wPX = ((wsNode.clientWidth+rightAdjust) * 2) - (wsNode.clientWidth+rightAdjust);
                        hPX = (((v.goDimensions.h+bottomAdjust) * count)/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                    } else {
                        wPX = 0;
                        hPX = (((v.goDimensions.h+bottomAdjust) * (count+1))/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                    }
                }
            });
            workspaces.forEach(function(wsNode) {
                wsNode.removeEventListener(v.transitionEndName, v._slideEndBackground, false); // In case already attached
                wsNode.removeEventListener(v.transitionEndName, v._slideEndForeground, false); // In case already attached
                // Move each workspace into position
                if (wsNode.id == prefix + 'workspace' + workspace) { // Apply to the workspace we're switching to
                    if (!go.prefs.disableTransitions) {
                        if (activeWS != workspace) {
                            wsNode.addEventListener(v.transitionEndName, v._slideEndForeground, false);
                        } else {
                            // This will not result in a transition so no transitionEnd event.  We have to force/fake it:
                            setTimeout(function(e) {
                                v.disableTransitions(wsNode);
                                v.applyTransform(wsNode, 'translate(0px, 0px)');
                                wsNode.style.display = ''; // Reset
                                v.transitioning = false;
                                go.Events.trigger("go:ws_transitionend", wsNode);
                            }, 1050);
                        }
                    }
                    v.applyTransform(wsNode, 'translate(-' + wPX + 'px, -' + hPX + 'px)');
                    if (go.prefs.disableTransitions) {
                        v._slideEndForeground({'target': wsNode}); // Emulate an event (slightly)
                    }
                } else {
                    if (!go.prefs.disableTransitions) {
                        wsNode.addEventListener(v.transitionEndName, v._slideEndBackground, false);
                    }
                    v.applyTransform(wsNode, 'translate(-' + wPX + 'px, -' + hPX + 'px) scale(0.9)');
                    if (go.prefs.disableTransitions) {
                        v._slideEndBackground({'target': wsNode});
                    }
                }
            });
        }, 10);
    },
    stopIndicator: function(direction) {
        /**:GateOne.Visual.stopIndicator(direction)

        Displays a visual indicator (appearance determined by theme) that the user cannot slide in given *direction*.  Example:

            >>> GateOne.Visual.stopIndicator('left');

        The given *direction* may be one of:  **left**, **right**, **up**, **down**.
        */
        var u = go.Utils,
            prefix = go.prefs.prefix,
            timeout = 250,
            stopIndicator = u.createElement('div', {'class': '✈ws_stop ✈ws_stop_'+direction}),
            gridwrapper = u.getNode('#'+prefix+'gridwrapper'),
            transitionEndFunc = function(e) {
                u.removeElement(stopIndicator);
            };
        if (!go.prefs.disableTransitions) {
            timeout = 1000;
            setTimeout(function() {
                stopIndicator.style.opacity = 0;
            }, 10);
        }
        stopIndicator.addEventListener(go.Visual.transitionEndName, transitionEndFunc, false);
        setTimeout(function() {
            // This is only fired if the transitionend event doesn't work (e.g. Firefox, I'm looking at you)
            transitionEndFunc();
        }, timeout);
        gridwrapper.appendChild(stopIndicator);
    },
    slideLeft: function() {
        /**:GateOne.Visual.slideLeft()

        Slides to the workspace left of the current view.
        */
        var u = go.Utils,
            v = go.Visual,
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
            if (u.isEven(workspace+1) && workspaces[workspace-1]) {
                var slideTo = workspaces[workspace-1].id.split(prefix+'workspace')[1];
                v.switchWorkspace(slideTo);
            } else {
                v.stopIndicator('left');
            }
        } else {
            v.stopIndicator('left');
        }
    },
    slideRight: function() {
        /**:GateOne.Visual.slideRight()

        Slides to the workspace right of the current view.
        */
        var u = go.Utils,
            v = go.Visual,
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
            if (!u.isEven(workspace+1) && workspaces[workspace+1]) {
                var slideTo = workspaces[workspace+1].id.split(prefix+'workspace')[1];
                v.switchWorkspace(slideTo);
            } else {
                v.stopIndicator('right');
            }
        } else {
            v.stopIndicator('right');
        }
    },
    slideDown: function() {
        /**:GateOne.Visual.slideDown()

        Slides the view downward one workspace by pushing all the others up.
        */
        var u = go.Utils,
            v = go.Visual,
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
                v.switchWorkspace(slideTo);
            } else {
                v.stopIndicator('down');
            }
        } else {
            v.stopIndicator('down');
        }
    },
    slideUp: function() {
        /**:GateOne.Visual.slideUp()

        Slides the view downward one workspace by pushing all the others down.
        */
        var u = go.Utils,
            v = go.Visual,
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
                v.switchWorkspace(Math.max(slideTo, 1));
            } else {
                v.stopIndicator('up');
            }
        } else {
            v.stopIndicator('up');
        }
    },
    resetGrid: function(animate) {
        /**:GateOne.Visual.resetGrid(animate)

        Places all workspaces in their proper position in the grid.  By default this happens instantly with no animations but if *animate* is ``true`` CSS3 transitions will take effect.
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
            style = getComputedStyle(go.node, null),
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
                    wPX = ((wsNode.clientWidth+rightAdjust) * 2) - (wsNode.clientWidth+rightAdjust);
                    hPX = (((v.goDimensions.h+bottomAdjust) * count)/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                } else {
                    wPX = 0;
                    hPX = (((v.goDimensions.h+bottomAdjust) * (count+1))/2) - (v.goDimensions.h+(bottomAdjust*Math.floor(count/2)));
                }
            }
            if (!animate) {
                v.disableTransitions(wsNode);
            }
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
    gridWorkspaceDragStart: function(e) {
        /**:GateOne.Visual.gridWorkspaceDragStart(e)

        Called when the user starts dragging a workspace in grid view; creates drop targets above each workspace and sets up the 'dragover', 'dragleave', and 'drop' events.

        This function is also responsible for creating the thumbnail of the workspace being dragged.
        */
        var u = go.Utils,
            v = go.Visual,
            self = this, // Explicit is better than implicit
            workspaces = u.toArray(u.getNodes('.✈workspace')),
            existingDT = u.getNode('.✈wsdroptarget'), // Only need to know if one is present; the rest are assumed
            dropTarget = u.createElement('div', {'class': '✈wsdroptarget', 'style': {'position': 'absolute', 'top': 0, 'bottom': 0, 'left': 0, 'width': '100%', 'height': '100%', 'z-index': 200, 'background-color': 'transparent'}}),
            thumb = v.nodeThumb(self, 0.25),
            computedStyle = getComputedStyle(thumb, null),
            thumbHeight = parseInt(computedStyle['height'].split('px')[0]),
            thumbWidth = parseInt(computedStyle['width'].split('px')[0]),
            newThumbHeight = thumbHeight * 0.25,
            newThumbWidth = thumbWidth * 0.25;
        if (!existingDT) {
            workspaces.forEach(function(wsNode) {
                if (wsNode.id != e.target.getAttribute('id')) {
                    var dt = dropTarget.cloneNode();
                    dt.setAttribute('data-workspace', wsNode.getAttribute('data-workspace'));
                    dt.addEventListener('dragover', v.gridWorkspaceDragOver, false);
                    dt.addEventListener('dragleave', v.gridWorkspaceDragLeave, false);
                    dt.addEventListener('drop', v.gridWorkspaceDrop, false);
                    wsNode.appendChild(dt);
                }
            });
        }
        // NOTE: The thumbnail needs to be visible on the page when we call setDragImage().
        //       Once setDragImage() is called we send it off-screen so it doesn't get in the way of the drop target.
        v.applyStyle(thumb, {'position': 'absolute', 'top': 0, 'left': 0, 'background': 'black'});
        // NOTE: This has been commented out because it doesn't appear to work (the drag image is still huge).
//         v.applyStyle(thumb, {'position': 'absolute', 'top': 0, 'left': 0, 'background': 'transparent', 'width': newThumbWidth + 'px', 'height': newThumbHeight + 'px'});
        v.applyTransform(thumb, 'translate(-40%, -40%) scale(0.25)');
        setTimeout(function() {
            v.applyTransform(thumb, 'translate(1000%, 1000%) scale(0.25)');
        }, 10);
        thumb.className = '✈wsthumb';
        document.body.appendChild(thumb);
        go.Visual.gridTemp = self; // Temporary holding space
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', self.getAttribute('data-workspace'));
        e.dataTransfer.setDragImage(thumb, 0, 0);
        return true;
    },
    gridWorkspaceDragOver: function(e) {
        /**:GateOne.Visual.gridWorkspaceDragOver(e)

        Attached to the various drop targets while a workspace is being dragged in grid view; sets the style of the drop target to indicate to the user that the workspace can be dropped there.
        */
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        this.style.backgroundColor = 'white';
        this.style.opacity = 0.2;
        return false;
    },
    gridWorkspaceDragLeave: function(e) {
        /**:GateOne.Visual.gridWorkspaceDragLeave(e)

        Attached to the various drop targets while a workspace is being dragged in grid view; sets the background color of the drop target back to 'transparent' to give the user a clear visual indiciation that the drag is no longer above the drop target.
        */
        e.target.style.backgroundColor = 'transparent';
    },
    gridWorkspaceDrop: function(e) {
        /**:GateOne.Visual.gridWorkspaceDrop(e)

        Attached to the various drop targets while a workspace is being dragged in grid view; handles the 'drop' of a workspace on to another.  Will swap the dragged workspace with the one to which it was dropped by calling :js:meth:`GateOne.Visual.swapWorkspaces`
        */
        var u = go.Utils,
            v = go.Visual;
        if (e.stopPropagation) {
            e.stopPropagation(); // stops the browser from redirecting.
        }
        // Don't do anything if dropping the same workspace we're dragging.
        if (v.gridTemp != this) {
            var draggedWS = e.dataTransfer.getData('text/html'),
                thisWS = this.parentNode.getAttribute('data-workspace');
            v.swapWorkspaces(draggedWS, thisWS);
            u.toArray(u.getNodes('.✈wsdroptarget')).forEach(function(dt) {
                u.removeElement(dt);
            });
        }
        u.removeElement('.✈wsthumb');
        v.gridTemp = null;
        return false;
    },
    swapWorkspaces: function(ws1, ws2) {
        /**:GateOne.Visual.swapWorkspaces(ws1, ws2)

        Swaps the location of the given workspaces in the grid and fires the `go:swapped_workspaces` event with *ws1* and *ws2* as the arguments.

        :ws1 number: The workspace number.
        :ws2 number: The other workspace number.
        */
        // Get all the nodes we need
        var v = go.Visual,
            u = go.Utils,
            justSwap,
            temp = u.createElement("div"),
            ws1Obj = go.workspaces[ws1],
            ws2Obj = go.workspaces[ws2],
            ws1node = ws1Obj.node,
            ws2node = ws2Obj.node,
            id1 = ws1node.id,
            id2 = ws2node.id,
            wsNum1 = ws1node.getAttribute('data-workspace'),
            wsNum2 = ws2node.getAttribute('data-workspace'),
            ws1transform = v.getTransform(ws1node),
            ws2transform = v.getTransform(ws2node),
            ws1title = ws1node.getAttribute('data-title'),
            ws2title = ws2node.getAttribute('data-title');
        // Fix their CSS3 transition positions
        v.disableTransitions(ws1node, ws2node);
        v.applyTransform(ws1node, ws2transform);
        v.applyTransform(ws2node, ws1transform);
        // Perform the moves
        ws1node.parentNode.insertBefore(temp, ws1node);
        ws2node.parentNode.insertBefore(ws1node, ws2node);
        temp.parentNode.insertBefore(ws2node, temp);
        temp.parentNode.removeChild(temp);
        // Turn transitions back on for these workspaces so things get pretty again
        setTimeout(function() {
            v.enableTransitions(ws1node, ws2node);
        }, 10);
        // Update the numbers/references for these workspaces
        ws1node.id = id2;
        ws2node.id = id1;
        ws1node.setAttribute('data-workspace', wsNum2);
        ws2node.setAttribute('data-workspace', wsNum1);
        go.workspaces[ws1].node = ws2node;
        go.workspaces[ws2].node = ws1node;
        ws1node.setAttribute('data-title', ws2title);
        ws2node.setAttribute('data-title', ws1title);
        go.Events.trigger('go:swapped_workspaces', ws1, ws2);
    },
    _selectWorkspace: function(e) {
        // Internal function for toggleGridView() so we can remove it after calling addEventListener()
        var u = go.Utils,
            v = go.Visual,
            wsInfoDiv = u.getNode('.✈wsinfo'),
            infoContainer = u.getNode('.✈infocontainer'),
            workspaceNum = this.getAttribute('data-workspace');
        infoContainer.removeEventListener('mouseup', v._selectWorkspace, false);
        wsInfoDiv.removeEventListener('mouseup', v._selectWorkspace, false);
        localStorage[go.prefs.prefix+'selectedWorkspace'] = workspaceNum;
        v.gridView = true;
        v.toggleGridView(false);
        v.noReset = true; // Make sure slideToWorkspace doesn't reset the grid before applying transitions
        v.switchWorkspace(workspaceNum);
    },
    toggleGridView: function(/*optional*/goBack) {
        /**:GateOne.Visual.toggleGridView([goBack])

        Brings up the workspace grid view or returns to full-size.

        If *goBack* is false, don't bother switching back to the previously-selected workspace
        */
        var u = go.Utils,
            v = go.Visual,
            prefix = go.prefs.prefix,
            sideinfo = u.getNode('.✈sideinfo'),
            workspaces = u.toArray(u.getNodes('.✈workspace'));
        goBack = goBack || true;
        if (v.gridView) {
            // Switch to the selected workspace and undo the grid
            v.gridView = false;
            // Remove the events we added for the grid:
            workspaces.forEach(function(wsNode) {
                wsNode.removeEventListener('mouseup', v._selectWorkspace, false);
                wsNode.onmouseover = undefined;
                wsNode.classList.remove('✈wsshadow');
                wsNode.removeAttribute('draggable');
                wsNode.removeEventListener('dragstart', v.gridWorkspaceDragStart, false);
                wsNode.removeEventListener('dragend', v.gridWorkspaceDragEnd, false);
            });
            u.toArray(u.getNodes('.✈wsdroptarget')).forEach(function(dt) {
                u.removeElement(dt);
            });
            go.node.style.overflow = 'hidden';
            v.noReset = true; // Make sure slideToWorkspace doesn't reset the grid before applying transitions
            if (goBack) {
                v.switchWorkspace(localStorage[prefix+'selectedWorkspace']); // Return to where we were before
            }
            // This fixes the visual bug that makes the toolbar/title a bit 'off' (to the left) after the grid view is done
            setTimeout(function() {
                sideinfo.innerHTML = sideinfo.innerHTML + ' ';
                u.toArray(u.getNodes('.✈toolbar_icon')).forEach(function(icon) {
                    if (!icon.classList.contains('✈icon_grid')) {
                        u.showElement(icon);
                    }
                });
                u.showElement(sideinfo);
            }, 1100);
            go.Events.trigger('go:grid_view:close');
        } else {
            // Bring up the grid
            v.gridView = true;
            u.hideElement(sideinfo);
            go.Events.trigger('go:grid_view:open');
            setTimeout(function() {
                // We call go:grid_view:open here because it is important that it happens after everything has settled down
                go.node.style.overflowY = 'visible';
            }, 1000);
            v.resetGrid(true);
            setTimeout(function() {
                workspaces.forEach(function(wsNode) {
                    wsNode.style.display = ''; // Make sure they're all visible
                    wsNode.classList.add('✈wsshadow');
                    v.enableTransitions(wsNode);
                    wsNode.setAttribute('draggable', true);
                    wsNode.addEventListener('dragstart', v.gridWorkspaceDragStart, false);
                    wsNode.addEventListener('dragend', v.gridWorkspaceDragEnd, false);
                });
                v.applyTransform(workspaces, 'translate(0px, 0px)');
                u.toArray(u.getNodes('.✈toolbar_icon')).forEach(function(icon) {
                    if (!icon.classList.contains('✈icon_grid')) {
                        u.hideElement(icon);
                    }
                });
                var odd = true,
                    count = 1,
                    oddAmount = 0,
                    evenAmount = 0,
                    transform = "";
                workspaces.forEach(function(wsNode) {
                    var workspaceNum = wsNode.id.split(prefix+'workspace')[1];
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
                    wsNode.addEventListener('mouseup', v._selectWorkspace, false);
                    wsNode.onmouseover = function(e) {
                        var displayText = wsNode.getAttribute('data-title'),
                            wsInfoDiv = u.createElement('div', {'class': '✈wsinfo'}),
                            infoContainer = u.createElement('div', {'class': '✈infocontainer ✈halfsectrans'}),
                            existing = u.getNode('.✈infocontainer');
                        if (existing) { u.removeElement(existing); }
                        if (!displayText) {
                            displayText = 'Workspace ' + wsNode.getAttribute('data-workspace');
                        }
                        wsInfoDiv.innerHTML = displayText;
                        // The data-workspace stuff is necessary for _selectWorkspace to work:
                        wsInfoDiv.setAttribute('data-workspace', wsNode.getAttribute('data-workspace'));
                        infoContainer.setAttribute('data-workspace', wsNode.getAttribute('data-workspace'));
                        infoContainer.appendChild(wsInfoDiv);
                        infoContainer.addEventListener('mouseup', v._selectWorkspace, false);
                        wsInfoDiv.addEventListener('mouseup', v._selectWorkspace, false);
                        v.applyTransform(wsInfoDiv, 'scale(2)');
                        wsNode.appendChild(infoContainer);
                        if (v.infoContainerTimeout) {
                            clearTimeout(v.infoContainerTimeout);
                            v.infoContainerTimeout = null;
                        }
                        v.infoContainerTimeout = setTimeout(function() {
                            u.removeElement(infoContainer);
                        }, 1500);
                    }
                });
            }, 10);
        }
    },
    addSquare: function(squareName) {
        // Only called by createGrid; creates a workspace div and appends it to go.Visual.squares
        logDebug('creating: ' + squareName);
        var workspace = GateOne.Utils.createElement('div', {'id': squareName, 'class': '✈workspace', 'style': {'width': GateOne.Visual.goDimensions.w + 'px', 'height': GateOne.Visual.goDimensions.h + 'px'}});
        GateOne.Visual.squares.push(workspace);
    },
    createGrid: function(id, workspaceNames) {
        /**:GateOne.Visual.createGrid(id, workspaceNames)

        Creates a container for all the workspaces and optionally pre-creates workspaces using *workspaceNames*.

        *id* will be the ID of the resulting grid (e.g. "gridwrapper").

        *workspaceNames* is expected to be a list of DOM IDs.
        */
        var u = GateOne.Utils,
            v = GateOne.Visual,
            grid = u.createElement('div', {'id': id, 'class': '✈grid'});
        v.squares = [];
        if (workspaceNames) {
            workspaceNames.forEach(addSquare);
            v.squares.forEach(function(square) {
                grid.appendChild(square);
            });
        }
        v.squares = null; // Cleanup
        return grid;
    },
    serverMessageAction: function(message) {
        /**:GateOne.Visual.serverMessageAction(message)

        Attached to the `go:notice` WebSocket action; displays a given *message* from the Gate One server as a transient pop-up using :js:meth:`GateOne.Visual.displayMessage`.
        */
        GateOne.Visual.displayMessage(message);
    },
    userMessageAction: function(message) {
        /**:GateOne.Visual.userMessageAction(message)

        Attached to the `go:user_message` WebSocket action; displays a given *message* as a transient pop-up using :js:meth:`GateOne.Visual.displayMessage`.

        .. note:: This will likely change to include/use additional metadata in the future (such as: from, to, etc)
        */
        GateOne.Visual.displayMessage(message);
    },
    // TODO: Get this returning an object with various functions and attributes instead of just the function that closes the dialog
    dialog: function(title, content, /*opt*/options) {
        /**:GateOne.Visual.dialog(title, content[, options])

        Creates an in-page dialog with the given *title* and *content*.  Returns a function that will close the dialog when called.

        Dialogs can be moved around and closed at-will by the user with a clearly visible title bar that is always present.

        All dialogs are placed within the `GateOne.prefs.goDiv` container but have their position set to 'fixed' so they can be moved anywhere on the page (even outside of the container where Gate One resides).

        :param string title:  Will appear at the top of the dialog.
        :param stringOrNode content:  String or JavaScript DOM node - The content of the dialog.
        :param object options: An associative array of parameters that change the look and/or behavior of the dialog.  See below.

        **Options**

            :events: An object containing DOM events that will be attached to the dialog node.  Example: ``{'mousedown': someFunction}``.  There are a few special/simulated events of which you may also attach: 'focused', 'closed', 'opened', 'resized', and 'moved'.  Except for 'close', these special event functions will be passed the dialog node as the only argument.
            :resizable: If set to ``false`` the dialog will not be resizable (all dialogs are resizable by default).  Note that if a dialog may not be resized it will also not be maximizable.
            :maximizable: If set to ``false`` the dialog will not have a maximize icon.
            :minimizable: If set to ``false`` the dialog will not have a minimize icon.
            :maximize: Open the dialog maximized.
            :above: If set to ``true`` the dialog will be kept above others.
            :data: (object) If given, any contained properties will be set as 'data-\*' attributes on the dialogContainer.
            :where: If given, the dialog will be placed here (DOM node or querySelector-like string) and will only be able to movable within the parent element.  Otherwise the dialog will be appended to the Gate One container (`GateOne.node`) and will be movable anywhere on the page.
            :noEsc: If ``true`` the dialog will not watch for the ESC key to close itself.
            :noTransitions: If ``true`` CSS3 transitions will not be enabled for this dialog.
            :class: Any additional CSS classes you wish to add to the dialog (space-separated).
            :style: Any CSS you wish to apply to the dialog.  Example:  ``{'style': {'width': '50%', 'height': '25%'}}``

        .. warning:  Do not use elements with top/bottom margins inside dialogs or the size calculations will be off (it won't look as nice).  Use `padding-top` and `padding-bottom` instead.
        */
        var prefix = go.prefs.prefix,
            u = go.Utils,
            v = go.Visual,
            prevActiveElement = document.activeElement,
            unique = u.randomString(8), // Need something unique to enable having more than one dialog on the same page.
            style = {},
            _class = '',
            resizable = true,
            maximizable = true,
            minimizable = true,
            where = go.node,
            dialogContainer, dialogContainerStyle, top, left, width, height,
            dialogDiv = u.createElement('div', {'class': '✈dialogdiv'}),
            dialogContent = u.createElement('div', {'class': '✈dialogcontent'}),
            dialogTitle = u.createElement('h3', {'class': '✈dialogtitle'}),
            dragHandle = u.createElement('div', {'class': '✈draghandle'}),
            icons = u.createElement('div', {'class': '✈dialog_icons'}),
            minimize = u.createElement('div', {'class': '✈dialog_icon ✈dialog_minimize', 'title': 'Minimize'}),
            maximize = u.createElement('div', {'class': '✈dialog_icon ✈dialog_maximize', 'title': 'Toggle Maximize'}),
            close = u.createElement('div', {'class': '✈dialog_icon ✈dialog_close', 'title': 'Close'}),
            specialEvents = {'focused': true, 'opened': true, 'closed': true, 'moved': true, 'resized': true},
            dialogToForeground = function(e) {
                // Move this dialog to the front of our array and fix all the z-index of all the dialogs
                var i, origIndex = v.dialogs.indexOf(dialogContainer);
                for (i in v.dialogs) {
                    if (dialogContainer == v.dialogs[i]) {
                        v.dialogs.splice(i, 1); // Remove it
                        i--; // Fix the index since we just changed it
                        v.dialogs.unshift(dialogContainer); // Bring to front
                        if (options && options.noEsc) {
                            ;;
                        } else {
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
                }
                // Set the z-index of each dialog to be its original z-index - its position in the array (should ensure the first item in the array has the highest z-index and so on)
                for (i in v.dialogs) {
                    if (i == 0) {
                        dialogContainer.style.opacity = 1; // Make sure it is visible
                        dialogContainer.classList.add('✈dialogactive');
                        if (i != origIndex) {
                            if (options && options.events && options.events.focused) {
                                options.events.focused(dialogContainer);
                            }
                        }
                    } else {
                        // Set all non-foreground dialogs opacity to be slightly less than 1 to make the active dialog more obvious
                        v.dialogs[i].classList.remove('✈dialogactive');
                    }
                    if (v.dialogs[i].above) { // Dialogs above everything else get an extra 100 to z-index
                        v.dialogs[i].style.zIndex = v.dialogZIndex + 100 - i;
                    } else {
                        v.dialogs[i].style.zIndex = v.dialogZIndex - i;
                    }
                }
                // Remove the event that called us so we're not constantly looping over the dialogs array
                dialogContainer.removeEventListener("mousedown", dialogToForeground, true);
                go.Events.trigger('go:dialog_to_foreground', dialogContainer);
            },
            containerMouseUp = function(e) {
                // Reattach our mousedown function since it auto-removes itself the first time it runs (so we're not wasting cycles constantly looping over the dialogs array)
                dialogContainer.addEventListener("mousedown", dialogToForeground, true);
                dialogContainer.style.opacity = dialogContainer.opacityTemp;
                v.resizeOrigin = {};
                dialogToForeground(e);
            },
            setTitle = function(title) {
                // This gets attached to the dialogContainer as an attribute that can be used to set the title
                dialogTitle.querySelector('.✈titletext').innerHTML = title;
            },
            titleMouseDown = function(e) {
                var m = go.Input.mouse(e); // Get the properties of the mouse event
                if (m.button.left) { // Only if left button is depressed
                    var computedStyle = getComputedStyle(dialogContainer, null),
                        left = computedStyle['left'],
                        top = computedStyle['top'];
                    dialogContainer.dragging = true;
                    e.preventDefault();
                    v.dragOrigin.X = e.clientX + window.scrollX;
                    v.dragOrigin.Y = e.clientY + window.scrollY;
                    if (left.indexOf('%') != -1) {
                        // Have to convert a percent to an actual pixel value
                        var percent = parseInt(left.substring(0, left.length-1)),
                            bodyWidth = getComputedStyle(document.body, null)['width'],
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
            dragHandleMouseDown = function(e) {
                var m = go.Input.mouse(e),
                    computedStyle = getComputedStyle(dialogContainer, null);
                if (m.button.left) { // Only if left button is depressed
                    if (!v.resizeOrigin.X) {
                        v.resizeOrigin.X = e.clientX;
                        v.resizeOrigin.Y = e.clientY;
                        v.resizeOrigin.width = parseInt(computedStyle['width'].split('px')[0]);
                        v.resizeOrigin.height = parseInt(computedStyle['height'].split('px')[0]);
                    }
                    dialogContainer.resizing = true;
                    e.preventDefault();
                }
            },
            moveResizeDialog = function(e) {
                /* This gets attached to the document.body 'mousemove' event.
                   Handles two situations:
                       * When the user moves a dialog via click-and-drag on the title bar.
                       * When the user resizes a dialog.
                   It won't do anything at all unless dialogContainer.dragging or
                   dialogContainer.resizing is true.
                */
                var X, Y, xMoved, yMoved, newX, newY, computedStyle, newWidth, newHeight;
                if (dialogContainer.dragging) {
                    v.disableTransitions(dialogContainer); // Have to get rid of the halfsectrans so it will drag smoothly.
                    X = e.clientX + window.scrollX;
                    Y = e.clientY + window.scrollY;
                    xMoved = X - v.dragOrigin.X;
                    yMoved = Y - v.dragOrigin.Y;
                    newX = 0;
                    newY = 0;
                    if (isNaN(v.dragOrigin.dialogX)) {
                        v.dragOrigin.dialogX = 0;
                    }
                    if (isNaN(v.dragOrigin.dialogY)) {
                        v.dragOrigin.dialogY = 0;
                    }
                    newX = v.dragOrigin.dialogX + xMoved;
                    newY = v.dragOrigin.dialogY + yMoved;
                    dialogContainer.style.left = newX + 'px';
                    dialogContainer.style.top = newY + 'px';
                    dialogToForeground(e);
                } else if (dialogContainer.resizing) {
//                     dialogContainer.className = '✈dialogcontainer';
                    X = e.clientX + window.scrollX;
                    Y = e.clientY + window.scrollY;
                    xMoved = X - v.resizeOrigin.X;
                    yMoved = Y - v.resizeOrigin.Y;
                    newWidth = v.resizeOrigin.width + xMoved;
                    newHeight = v.resizeOrigin.height + yMoved;
                    dialogContainer.style.overflow = "hidden";
                    dialogContainer.style.width = newWidth + 'px';
                    dialogContainer.style.height = newHeight + 'px';
                    dialogToForeground(e);
                }
            },
            opacityControl = function(e) {
                var m = go.Input.mouse(e),
                    modifiers = go.Input.modifiers(e);
                if (modifiers.alt || modifiers.meta) {
                    return;
                }
                if (modifiers.ctrl && modifiers.shift) {
                    e.preventDefault();
                    v.disableTransitions(dialogContainer); // So it changes quick
                    if (m.wheel.x > 1) {
                        dialogContainer.opacityTemp = Math.max(parseFloat(dialogContainer.style.opacity) - 0.05, 0.1);
                    } else {
                        dialogContainer.opacityTemp = Math.min(parseFloat(dialogContainer.style.opacity) + 0.05, 1.0);
                    }
                    dialogContainer.style.opacity = dialogContainer.opacityTemp;
                    if (options && !options.noTransitions) {
                        setTimeout(function() {
                            v.enableTransitions(dialogContainer); // Turn them back on
                        }, 10);
                    }
                }
            },
            toggleMaximize = function(e) {
                dialogContainerStyle = getComputedStyle(dialogContainer, null); // Update with the latest info
                var dialogDivStyle = getComputedStyle(dialogDiv, null);
//                 if (options && !options.noTransitions) {
//                     if (!dialogContainer.classList.contains('✈halfsectrans')) {
//                         dialogContainer.classList.add('✈halfsectrans');
//                     }
//                 }
                if (options && !options.noTransitions) {
                    v.enableTransitions(dialogContainer);
                }
                if (!dialogContainer.origWidth) {
                    dialogContainer.origTop = dialogContainerStyle.top;
                    dialogContainer.origLeft = dialogContainerStyle.left;
                    dialogContainer.origWidth = dialogContainerStyle.width;
                    dialogContainer.origHeight = dialogContainerStyle.height;
                    dialogDiv.orgHeight = dialogDivStyle.height;
                }
                if (dialogContainerStyle.width == dialogContainer.parentNode.clientWidth + 'px') {
                    // We're already maximized.  Restore original height/width/position
                    dialogContainer.style.width = dialogContainer.origWidth;
                    dialogContainer.style.height = dialogContainer.origHeight;
                    dialogContainer.style.top = dialogContainer.origTop;
                    dialogContainer.style.left = dialogContainer.origLeft;
                    // Don't need these anymore
                    dialogContainer.origTop = null;
                    dialogContainer.origLeft = null;
                    dialogContainer.origWidth = null;
                    dialogContainer.origHeight = null;
                    dialogDiv.orgHeight = null;
                } else {
                    dialogContainer.style.top = 0;
                    dialogContainer.style.left = 0;
                    dialogContainer.style.width = dialogContainer.parentNode.offsetWidth + 'px';
                    dialogContainer.style.height = dialogContainer.parentNode.offsetHeight + 'px';
                    dialogDiv.style.height = '';
                }
                dialogToForeground(e);
                // Maximizing counts as both moving *and* resizing
                setTimeout(function() {
                    if (options.events['moved']) {
                        options.events['moved'](dialogContainer);
                    };
                    if (options.events['resized']) {
                        options.events['resized'](dialogContainer);
                    };
                }, 550);
            },
            toggleMinimize = function(e) {
                // TODO
            },
            closeDialog = function(e) {
                if (e) { e.preventDefault() }
                if (options && !options.noTransitions) {
                    v.enableTransitions(dialogContainer);
                }
                dialogContainer.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(dialogContainer);
                }, 1000);
                document.body.removeEventListener("mousemove", moveResizeDialog, true);
                document.body.removeEventListener("mouseup", function(e) {dialogContainer.dragging = false;}, true);
                dialogContainer.removeEventListener("mousedown", dialogToForeground, true); // Just in case--to encourage garbage collection
                dialogTitle.removeEventListener("mousedown", titleMouseDown, true); // Ditto
                dragHandle.removeEventListener("mousedown", dragHandleMouseDown, true); // Yep
                dialogContainer.removeEventListener(mousewheelevt, opacityControl, false); // More of the same
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
                if (options && options.events && options.events['closed']) {
                    options.events['closed'](dialogContainer);
                }
            };
        // Keep track of all open dialogs so we can determine the foreground order
        if (!v.dialogs) {
            v.dialogs = [];
        }
        if (options) {
            if (options['resizable'] === false) {
                resizable = false;
            }
            if (options['maximizable'] === false) {
                maximizable = false;
            }
            if (options['minimizable'] === false) {
                minimizable = false;
            }
            if (!resizable) {
                // Disable maximization if not resizable
                maximizable = false;
            }
            if (options['style']) {
                style = options['style'];
            }
            if (options['class']) {
                _class = options['class'];
            }
            if (options['where']) {
                where = u.getNode(options['where']);
                if (!style['position']) {
                    style['position'] = 'absolute';
                }
            }
        }
        dialogContainer = u.createElement('div', {'id': 'dialogcontainer_' + unique, 'class': '✈dialogcontainer ' + _class, 'style': style});
        dialogContainer.setAttribute('data-title', title);
        if (options && options.noTransitions) {
            v.disableTransitions(dialogContainer);
        }
        v.dialogs.push(dialogContainer);
        if (options && options['above']) {
            dialogContainer.above = true;
        }
        dialogDiv.appendChild(dialogContent);
        // Enable drag-to-move on the dialog title
        if (!dialogContainer.dragging) {
            dialogContainer.dragging = false;
            v.dragOrigin = {};
        }
        // Enable resizing the dialog via the drag handle
        if (!dialogContainer.resizing) {
            dialogContainer.resizing = false;
        }
        v.resizeOrigin = {};
        dialogTitle.addEventListener("mousedown", titleMouseDown, true);
        dragHandle.addEventListener("mousedown", dragHandleMouseDown, true);
        // These have to be attached to document.body otherwise the dialogs will be constrained within #gateone which could just be a small portion of a larger web page.
        document.body.addEventListener("mousemove", moveResizeDialog, true);
        document.body.addEventListener("mouseup", function(e) {
            if (options && options.events) {
                if (dialogContainer.dragging && options.events['moved']) {
                    // Fire the 'move' event
                    options.events['moved'](dialogContainer);
                }
                if (dialogContainer.resizing && options.events['resized']) {
                    // Fire the 'resize' event
                    options.events['resized'](dialogContainer);
                }
            }
            dialogContainer.dragging = false;
            dialogContainer.resizing = false;
            setTimeout(function() {
                dialogContainer.style.overflow = ''; // reset it
            }, 500);
        }, true);
        dialogContainer.addEventListener("mousedown", dialogToForeground, true); // Ensure that clicking on a dialog brings it to the foreground
        dialogContainer.addEventListener("mouseup", containerMouseUp, true);
        dialogContainer.addEventListener(mousewheelevt, opacityControl, false);
        dialogContainer.dialogToForeground = dialogToForeground;
        dialogContainer.setTitle = setTitle;
        dialogContainer.dialogTitle = dialogTitle; // So the height/width can be checked
        dialogContainer.style.opacity = 0;
        dialogContainer.opacityTemp = 1;
        setTimeout(function() {
            // This fades the dialog in with a nice and smooth CSS3 transition (thanks to the 'halfsectrans' class)
            dialogContainer.style.opacity = dialogContainer.opacityTemp;
        }, 50);
        minimize.innerHTML = go.Icons.minimize;
//         minimize.onclick = minimizeDialog;
        maximize.innerHTML = go.Icons.maximize;
        maximize.onclick = toggleMaximize;
        close.innerHTML = go.Icons.panelclose;
        close.onclick = closeDialog;
        dialogTitle.innerHTML = '<span class="✈titletext">' + title + '</span>';
        if (title) {
            dialogContainer.appendChild(dialogTitle);
        }
        icons.appendChild(close);
        if (maximizable) {
            icons.appendChild(maximize);
        }
        if (minimizable) {
            icons.appendChild(minimize);
        }
        dialogTitle.appendChild(icons);
        if (typeof(content) == "string") {
            dialogContent.innerHTML = content;
        } else {
            dialogContent.appendChild(content);
        }
        dialogContainer.appendChild(dialogDiv);
        if (resizable) {
            dialogContainer.appendChild(dragHandle);
        }
        if (options && options.events) {
            // Attach any given regular DOM events
            for (var event in options.events) {
                if (!specialEvents[event]) {
                    dialogContainer.addEventListener(event, options.events[event], false);
                }
            }
        }
        if (options && options.data) {
            for (var attr in options.data) {
                dialogContainer.setAttribute('data-'+attr, options.data[attr]);
            }
        }
        where.appendChild(dialogContainer);
        dialogDiv.style.height = "calc(100% - " + (dialogTitle.offsetHeight + 1) + 'px)';
        // Assign the calculated styles to the actual style so that the browser can perform a clean CSS3 transition
        dialogContainerStyle = getComputedStyle(dialogContainer, null);
        // These top and left values position the dialog in the absolute center of whatever element it was placed in:
        if (style) {
            if (!style.top) {
                top = (where.offsetHeight - dialogContainer.offsetHeight) / 4;
                dialogContainer.style.top = top + 'px';
            }
            if (!style.left) {
                left = (where.offsetWidth - dialogContainer.offsetWidth) / 2;
                dialogContainer.style.left = left + 'px';
            }
        }
        width = dialogContainer.offsetWidth;
        height = dialogContainer.offsetHeight;
        v.dialogZIndex = parseInt(dialogContainerStyle.zIndex); // Right now this is 850 in the themes but that could change in the future so I didn't want to hard-code that value
        setTimeout(function() {
            // A short timeout on this just in case the dialog content is being updated after it's created
            v.disableTransitions(dialogContainer); // Temporary while we assign the height/width
            var heightMargins = parseInt(dialogContainerStyle.getPropertyValue('margin-top').split('px')[0]) + parseInt(dialogContainerStyle.getPropertyValue('margin-bottom').split('px')[0]),
                widthMargins = parseInt(dialogContainerStyle.getPropertyValue('margin-left').split('px')[0]) + parseInt(dialogContainerStyle.getPropertyValue('margin-right').split('px')[0]),
                calculatedWidth = (width + widthMargins),
                calculatedHeight = (height + heightMargins);
            if (calculatedHeight > 100) {
                dialogContainer.style.height = calculatedHeight + 'px';
            }
            dialogContainer.style.width = calculatedWidth + 'px';
            setTimeout(function() {
                v.enableTransitions(dialogContainer);
            }, 10);
        }, 1010);
        dialogToForeground();
        if (options && options.events && options.events.opened) {
            options.events.opened(dialogContainer);
        }
        if (options && options.maximize) {
            toggleMaximize(); // Open maximized
        }
        return closeDialog;
    },
    alert: function(title, message, /*opt*/callback) {
        /**:GateOne.Visual.alert(title, message[, callback])

        :param string title: Title of the dialog that will be displayed.
        :param message: An HTML-formatted string or a DOM node; Main content of the alert dialog.
        :param function callback: A function that will be called after the user clicks "OK".

        .. figure:: screenshots/gateone_alert.png
            :class: portional-screenshot
            :align: right

        Displays a dialog using the given *title* containing the given *message* along with an OK button.  When the OK button is clicked, *callback* will be called.

            >>> GateOne.Visual.alert('Test Alert', 'This is an alert box.');

        .. note:: This function is meant to be a less-intrusive form of JavaScript's alert().
        */
        var go = GateOne,
            u = GateOne.Utils,
            v = GateOne.Visual,
            centeringDiv = u.createElement('div', {'class': '✈centered_text'}),
            OKButton = u.createElement('button', {'id': 'ok_button', 'type': 'reset', 'value': 'OK', 'class': '✈button', 'style': {'margin-top': '1em', 'margin-left': 'auto', 'margin-right': 'auto', 'width': '4em'}}), // NOTE: Using a width here because I felt the regular button styling didn't make it wide enough when innerHTML is only two characters
            messageContainer = u.createElement('p', {'id': 'ok_message'});
        OKButton.innerHTML = "OK";
        if (message instanceof HTMLElement) {
            messageContainer.appendChild(message);
        } else {
            messageContainer.innerHTML = "<p>" + message + "</p>";
        }
        centeringDiv.appendChild(OKButton);
        messageContainer.appendChild(centeringDiv);
        var closeDialog = go.Visual.dialog(title, messageContainer, {'class': '✈alertdialog'});
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
    showDock: function(name) {
        /**:GateOne.Visual.showDock(name)

        Opens up the given *name* for the user to view.  If the dock does not already exist it will be created and added to the toolbar.
        */
        var u = go.Utils,
            existing = u.getNode('.✈dock_'+name),
            dock = u.createNode('div', {'class': '✈dock_'+name, 'title': "Dock " + name});
    },
    toggleOverlay: function() {
        /**:GateOne.Visual.toggleOverlay()

        Toggles the overlay that visually indicates whether or not Gate One is ready for input.  Normally this function gets called automatically by :js:func:`GateOne.Input.capture` and :js:func:`GateOne.Input.disableCapture` which are attached to ``mousedown`` and ``blur`` events, respectively.
        */
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
//             overlay.onmousedown = function(e) {
//                 // NOTE: Do not set 'onmousedown = go.Input.capture' as this will trigger capture() into thinking it was called via an onblur event.
//                 u.removeElement(overlay);
//                 v.overlay = false;
//             }
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
    }
});

// Set our transitionend name right away
go.Visual.transitionEndName = go.Visual.transitionEvent();

// These two are here just in case the server needs to send us a message before everything has completed loading:
go.Net.actions['go:notice'] = go.Visual.serverMessageAction;
go.Net.actions['go:user_message'] = go.Visual.userMessageAction;
// There's no need for these to load late so why load late?

// GateOne.Storage (for storing/synchronizing stuff at the client)
GateOne.Base.module(GateOne, "Storage", "1.0", ['Base']);
/**:GateOne.Storage

An object for opening and manipulating `IndexedDB <https://developer.mozilla.org/en-US/docs/IndexedDB>`_ databases with fallback to `localStorage <https://developer.mozilla.org/en-US/docs/Web/Guide/DOM/Storage#localStorage>`_.
*/
GateOne.Storage.databases = {};
GateOne.Storage._models = {}; // Stores the model of a given DB in the form of {'<db name>', {'<object store name>': {<object store options (if any)}, ...}}
// Example model: {'JavaScript': {keyPath: 'path'}, 'CSS': {keyPath: 'path'}}
// In the above model you could assign whatever attributes to your objects that you want but a 'path' attribute *must* be included.
GateOne.Storage.failCount = {};
GateOne.Storage.dbObject = function(DB) {
    /**:GateOne.Storage.dbObject

    :param string DB: A string representing the name of the database you want to open.

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
            if (!go.Storage.databases[DB]) {
                // Database hasn't finished initializing yet.  Wait just a moment and retry...
                if (!go.Storage.failCount[DB]) {
                    go.Storage.failCount[DB] = 0;
                }
                if (go.Storage.failCount[DB] > 500) { // 5 seconds
                    logError(gettext("Failed to load database: ") + DB);
                    return;
                }
                setTimeout(function() {
                    self.get(storeName, key, callback);
                }, 10);
                go.Storage.failCount[DB] += 1;
                return;
            }
            var db = GateOne.Storage.databases[self.DB],
                trans = db.transaction(storeName, 'readonly'),
                store = trans.objectStore(storeName),
                transaction = store.get(key);
            trans.oncomplete = function(e) {
                callback(transaction.result); // If not found result will be undefined
            }
        } else {
            var store = JSON.parse(localStorage[go.prefs.prefix+self.DB])[storeName],
                result = store.data[key]; // If not found result will be undefined (which is OK)
            callback(result);
        }
    }
    self.put = function(storeName, value, callback) {
        /**:GateOne.Storage.dbObject.put(storeName, value[, callback])

        Adds *value* to the given object store (*storeName*).  If given, calls *callback* with *value* as the only argument.
        */
        if (indexedDB) {
            if (!go.Storage.databases[DB]) {
                // Database hasn't finished initializing yet.  Wait just a moment and retry...
                if (!go.Storage.failCount[DB]) {
                    go.Storage.failCount[DB] = 0;
                }
                if (go.Storage.failCount[DB] > 500) { // 5 seconds
                    logError(gettext("Failed to load database: ") + DB);
                    return;
                }
                setTimeout(function() {
                    go.Storage.put(storeName, value, callback);
                }, 10);
                go.Storage.failCount[DB] += 1;
                return;
            }
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
                store = db[storeName],
                newData = {};
            for (var key in value) {
                newData[key] = value[key];
            }
            store.data[newData.filename] = newData;
            localStorage[go.prefs.prefix+self.DB] = JSON.stringify(db);
            if (callback) {
                callback(value);
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
                logDebug(key + gettext(" does not exist in: ") + storeName);
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
GateOne.Storage.dbVersion = 4; // NOTE: Must be an integer (no floats!)
GateOne.Storage.fileCacheModel = {
    'js': {keyPath: 'filename'},
    'css': {keyPath: 'filename'},
    'html': {keyPath: 'filename'}, // NOTE: Mainly for templates
    'misc': {keyPath: 'filename'} // For other odds & ends where it may be a good idea to keep them cached at the client
}
GateOne.Storage.deferLoadingTimers = {}; // Used to make sure we don't duplicate our efforts in retries
GateOne.Storage.loadedFiles = {}; // This is used to queue up JavaScript files to ensure they load in the proper order.
GateOne.Storage.failedRequirementsCounter = {}; // Used to detect when we've waited too long for a dependency.
GateOne.Storage.fileCacheReady = false;
GateOne.Base.update(GateOne.Storage, {
    init: function() {
        /**:GateOne.Storage.init()

        Doesn't do anything (most init stuff for this module needs to happen before everything else loads).
        */
    },
    cacheReady: function() {
        /**:GateOne.Storage.cacheReady()

        Called when the fileCache DB has completed openining/initialization.  Just sets :js:attr:`GateOne.Storage.fileCacheReady` to ``true``.
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
        logDebug('cacheJS caching ' + fileObj.filename);
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
        fileCache.del('js', fileObj.filename);
    },
    cacheStyle: function(fileObj, kind) {
        /**:GateOne.Storage.cacheStyle(fileObj, kind)

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
        logDebug('cacheStyle caching ' + fileObj.filename);
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
        fileCache.del(kind, fileObj.filename);
    },
    cacheExpiredAction: function(message) {
        /**:GateOne.Storage.cacheExpiredAction(message)

        Attached to the `go:cache_expired` WebSocket action; given a list of *message['filenames']*, removes them from the file cache.
        */
        var fileCache = GateOne.Storage.dbObject('fileCache'),
            filenames = message['filenames'],
            kind = message.kind;
        filenames.forEach(function(filename) {
            logDebug(gettext("Deleting expired file: ") + filename);
            fileCache.del(kind, filename);
        });
    },
    // TODO: Get this using an updateSequenceNum instead of modification times (it's more efficient)
    fileSyncAction: function(message) {
        /**:GateOne.Storage.fileCheckAction(message)

        This gets attached to the `go:file_sync` WebSocket action; given a list of file objects which includes their modification times (*message['files']*) it will either load the file from the 'fileCache' database or request the file be delivered via the (server-side) 'go:file_request' WebSocket action.

        .. note:: Expects the 'fileCache' database be open and ready (normally it gets opened/initialized in :js:meth:`GateOne.initialize`).
        */
        // Example incoming message:
        //  {'files': [{'filename': 'foo.js', 'mtime': 1234567890123}]}
        var S = go.Storage,
            u = go.Utils,
            fileCache = S.dbObject('fileCache');
        if (!go.Storage.fileCacheReady) {
            // Database hasn't finished initializing yet.  Wait just a moment and retry...
            if (S.deferLoadingTimers[message['files'][0].filename]) {
                clearTimeout(S.deferLoadingTimers[message['files'][0].filename]);
                S.deferLoadingTimers[message['files'][0].filename] = null;
            }
            S.deferLoadingTimers[message['files'][0].filename] = setTimeout(function() {
                S.fileSyncAction(message);
                S.deferLoadingTimers[message['files'][0].filename] = null;
            }, 10);
            return;
        }
        var remoteFiles = message['files'],
            fileCache = S.dbObject('fileCache'),
            callback = function(remoteFileObj, localFileObj) {
                if (localFileObj) {
                    // NOTE:  Using "!=" below instead of ">" so that debugging works properly
                    if (remoteFileObj['mtime'] != localFileObj['mtime']) {
                        logDebug(remoteFileObj.filename + gettext(" is cached but is older than what's on the server.  Requesting an updated version..."));
                        go.ws.send(JSON.stringify({'go:file_request': remoteFileObj['hash']}));
                        // Even though filenames are hashes they will always remain the same.  The new file will overwrite the old entry in the cache.
                    } else {
                        // Load the local copy
                        logDebug("Loading " + remoteFileObj.filename + " from the cache...");
                        if (remoteFileObj.kind == 'js') {
                            if (remoteFileObj['requires']) {
                                logDebug(gettext("This file requires a certain script be loaded first: ") + remoteFileObj['requires']);
                                if (!S.failedRequirementsCounter[remoteFileObj.filename]) {
                                    S.failedRequirementsCounter[remoteFileObj.filename] = 0;
                                }
                                if (!S.loadedFiles[remoteFileObj['requires']]) {
                                    setTimeout(function() {
                                        if (S.failedRequirementsCounter[remoteFileObj.filename] >= 50) { // ~5 seconds
                                            // Give up
                                            logError(gettext("Failed to load ") + remoteFileObj.filename + gettext(".  Took too long waiting for: ") + remoteFileObj['requires']);
                                            return;
                                        }
                                        // Try again in a moment or so
                                        S.fileSyncAction(message);
                                        S.failedRequirementsCounter[remoteFileObj.filename] += 1;
                                    }, 100);
                                    return;
                                } else {
                                    logDebug("Dependency loaded!");
                                    // Emulate an incoming message from the server to load this JS
                                    var messageObj = {'result': 'Success', 'filename': localFileObj.filename, 'hash': localFileObj['hash'], 'data': localFileObj.data, 'element_id': remoteFileObj.element_id};
                                    u.loadJSAction(messageObj, true); // true here indicates "don't cache" (already cached)
                                }
                            } else {
                                // Emulate an incoming message from the server to load this JS
                                var messageObj = {'result': 'Success', 'filename': localFileObj.filename, 'hash': localFileObj['hash'], 'data': localFileObj.data, 'element_id': remoteFileObj.element_id};
                                u.loadJSAction(messageObj, true); // true here indicates "don't cache" (already cached)
                            }
                        } else if (remoteFileObj.kind == 'css') {
                            // Emulate an incoming message from the server to load this CSS
                            var messageObj = {'result': 'Success', 'css': true, 'kind': localFileObj.kind, 'filename': localFileObj.filename, 'hash': localFileObj['hash'], 'data': localFileObj.data,  'element_id': remoteFileObj.element_id, 'media': localFileObj.media};
                            u.loadStyleAction(messageObj, true); // true here indicates "don't cache" (already cached)
                        } else if (remoteFileObj.kind == 'html') {
                            // Nothing to do; HTML templates are loaded on-demand
                        }
                    }
                } else {
                    // File isn't cached; tell the server to send it
                    logDebug(remoteFileObj.filename + gettext(" is not cached.  Requesting..."));
                    go.ws.send(JSON.stringify({'go:file_request': remoteFileObj['hash']}));
                }
            };
        remoteFiles.forEach(function(file) {
            logDebug("fileSyncAction() checking: " + file.filename);
            var callbackWrap = u.partial(callback, file);
            fileCache.get(file.kind, file.filename, callbackWrap);
        });
        // Now create a list of all our cached filenames and ask the server if any of these no longer exist so we can keep things neat & tidy
        // The server's response will be handled by :js:meth:`GateOne.Storage.cacheExpiredAction`.
        var cleanupFiles = function(kind, objects) {
            logDebug('cleanupFiles()');
            var filenames = [];
            u.toArray(objects).forEach(function(jsObj) {
                filenames.push(jsObj['hash']); // The filenames are actually the hashes of their names
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
        var eventElem = e.srcElement || e.target,
            errorMsg = eventElem.error.message,
            errorName = eventElem.error.name;
        logError("in GateOne.Storage: " + errorName + ": " + errorMsg);
        console.log(e);
    },
    _upgradeDB: function(DB, trans, callback) {
        /**:GateOne.Storage._upgradeDB(trans[, callback])

        DB version upgrade function attached to the `onupgradeneeded` event.  It creates our object store(s).

        If *callback* is given it will be called when the transaction is complete.
        */
        logDebug('upgradeDB('+DB+')');
        var S = go.Storage;
        try {
            var model = S._models[DB],
                storeNames = {},
                objectCreationMsg = "Creating new object store: ";
            if (!model) {
                logError(gettext("You must create a database model before creating a new database."));
                return false;
            }
            for (var storeName in model) {
                if (!S.databases[DB].objectStoreNames.contains(storeName)) {
                    logInfo(objectCreationMsg + storeName);
                    var store = S.databases[DB].createObjectStore(storeName, model[storeName]);
                }
            }
            // Create a temporary object with all the store names so we can iterate over them without having to worry about the delete-in-place-breaks-index problem:
            for (var storeNum in S.databases[DB].objectStoreNames) {
                if (storeNum % 1 === 0) { // Only want the integers
                    storeNames[S.databases[DB].objectStoreNames[storeNum]] = true;
                }
            }
            // Now delete any object stores no longer in use
            for (var storeName in storeNames) {
                if (!(storeName in model)) {
                    // Delete it (no longer part of the model)
                    logInfo(gettext('Removing obsolete object store (self-cleanup): ') + storeName);
                    S.databases[DB].deleteObjectStore(storeName);
                    storeNum -= 1; // The objectStoreNames will now have one less entry
                }
            }
            // TODO: Investigate using indexes to speed things up.  Example (must happen inside a setVersion transaction):
//             S.indexes[DB] = store.createIndex("urls", "url");
        } catch (e) {
            S.onerror(e);
        }
        trans.oncomplete = function(e) {
            logInfo(DB + gettext(" database creation/upgrade complete"));
            if (callback) { callback(S.dbObject(DB)); }
        }
    },
    openDB: function(DB, callback, model, /*opt*/version) {
        /**:GateOne.Storage.openDB(DB[, callback[, model[, version]]])

        Opens the given database (*DB*) for use and stores a reference to it as `GateOne.Storage.databases[DB]`.

        If *callback* is given, will execute it after the database has been opened successfuly.

        If this is the first time we're opening this database a *model* must be given.  Also, if the database already exists, the *model* argument will be ignored so it is safe to pass it with every call to this function.

        If provided, the *version* of the database will be set.  Otherwise it will be set to 1.

        Example usage:

        .. code-block:: javascript

            var model = {'BookmarksDB': {'bookmarks': {keyPath: "url"}, 'tags': {keyPath: "name"}}};
            GateOne.Storage.openDB('somedb', function(dbObj) {console.log(dbObj);}, model);
            // Note that after this DB is opened the IDBDatabase object will be available via GateOne.Storage.databases['somedb']
        */
        var S = go.Storage;
        if (S._models[DB]) {
            // Existing model, check if there's a difference
            if (S._models[DB] != model) {
                logDebug("Model difference!");
                logDebug(model);
                logDebug(S._models[DB]);
            }
        } else {
            S._models[DB] = model;
        }
        if (indexedDB) {
            logDebug('GateOne.Storage.openDB(): Opening indexedDB: ' + DB);
            var openRequest,
                upgradeMsg = DB + gettext(": The database needs to be created or updated.  Creating/upgrading database...");
            if (version) {
                openRequest = indexedDB.open(DB, version);
            } else {
                openRequest = indexedDB.open(DB);
            }
            openRequest.onblocked = function(e) {
                go.Visual.alert(gettext("Please close other tabs connected to this server and reload this page so we may upgrade the IndexedDB database."));
            }
            openRequest.onsuccess = function(e) {
                logDebug('GateOne.Storage.openDB(): openRequest.onsuccess');
                S.databases[DB] = e.target.result;
                // We can only create/delete Object stores inside of a setVersion transaction;
                var needsUpdate;
                if (version && version != S.databases[DB].version) {
                    needsUpdate = true;
                }
                if (needsUpdate) {
                    logInfo(upgradeMsg);
                    // This is the old way of doing upgrades.  It should only ever be called in (much) older browsers...
                    if (typeof S.databases[DB].setVersion === "function") {
                        logDebug("GateOne.Storage.openDB(): Using db.setVersion()");
                        var setVrequest = S.databases[DB].setVersion(version);
                        // onsuccess is the only place we can create Object Stores
                        setVrequest.onfailure = S.onerror;
                        setVrequest.onsuccess = function(evt) {
                            logDebug('GateOne.Storage.openDB(): setVrequest success');
                            S._upgradeDB(DB, setVrequest.transaction, callback);
                        }
                    }
                } else {
                    if (callback) {
                        logDebug(gettext('GateOne.Storage.openDB(): No database upgrade necessary.  Calling callback...'));
                        callback(S.dbObject(DB));
                    }
                }
            };
            openRequest.onupgradeneeded = function(e) { // New (mostly standard) way
                logInfo(upgradeMsg);
                S.databases[DB] = e.target.result;
                S._upgradeDB(DB, openRequest.transaction, callback);
            }
            openRequest.onfailure = S.onerror; // Older version of IndexedDB (I think?  I can't remember)
            openRequest.onerror = S.onerror;
        } else { // Fallback to localStorage if the browser doesn't support IndexedDB
            logDebug(gettext("GateOne.Storage.openDB(): IndexedDB is unavailable.  Falling back to localStorage..."));
            if (!localStorage[go.prefs.prefix+DB]) {
                // Start out with an empty object
                var o = {};
                for (var storeName in model) {
                    o[storeName] = {autoIncrement: 0, data: {}};
                }
                localStorage[go.prefs.prefix+DB] = JSON.stringify(o);
            }
            S.databases[DB] = true; // Just so we know it's available
            if (callback) { callback(S.dbObject(DB)); }
        }
    },
    clearDatabase: function(DB, /*opt*/storeName) {
        /**:GateOne.Storage.clearDatabase(DB[, storeName])

        Clears the contents of the given *storeName* in the given database (*DB*).  AKA "the nuclear option."

        If a *storeName* is not given the whole database will be deleted.
        */
        logDebug('clearDatabase()');
        if (indexedDB) {
            if (!storeName) {
                logDebug(gettext('Clearing entire indexedDB: ') + DB);
                indexedDB.deleteDatabase(DB);
            } else {
                logDebug(gettext('Clearing indexedDB store: ') + DB + '[' + storeName + ']');
                var db = GateOne.Storage.databases[DB],
                    trans = db.transaction(storeName, 'readwrite'),
                    store = trans.objectStore(storeName),
                    request = store.clear();
                trans.oncomplete = function(e) {
                    logDebug(gettext('store deleted'));
                    var dbreq = indexedDB.deleteDatabase(DB);
                    dbreq.onsuccess = function(e) {
                        logDebug(gettext('database deleted'));
                    }
                    dbreq.onerror = GateOne.Storage.onerror;
                }
            }
        } else {
            delete localStorage[go.prefs.prefix+DB];
        }
    }
});

// Load some early-stage required WebSocket actions
go.Net.addAction('go:file_sync', go.Storage.fileSyncAction);
go.Net.addAction('go:cache_expired', go.Storage.cacheExpiredAction);
go.Net.addAction('go:cache_file', go.Utils.cacheFileAction);
go.Net.addAction('go:load_style', go.Utils.loadStyleAction);
go.Net.addAction('go:load_js', go.Utils.loadJSAction);

window.GateOne = GateOne; // Make everything usable

})(window);

// Define a new sandbox to make garbage collection more efficient
(function(window, undefined) {
"use strict";

// Sandbox-wide shortcuts
var go = GateOne,
    u = go.Utils,
    v = go.Visual,
    U, // Set below
    prefix = go.prefs.prefix,
    gettext = go.i18n.gettext;

// Shortcuts for each log level
var logFatal = go.Logging.logFatal,
    logError = go.Logging.logError,
    logWarning = go.Logging.logWarning,
    logInfo = go.Logging.logInfo,
    logDebug = go.Logging.logDebug;

U = GateOne.Base.module(GateOne, "User", "1.2", ['Base', 'Utils', 'Visual']);
/**:GateOne.User

The User module is for things like logging out, synchronizing preferences with the server, and it is also meant to provide hooks for plugins to tie into so that actions can be taken when user-specific events occur.

The following WebSocket actions are attached to functions provided by `GateOne.User`:

    ===================  ==========================================
    Action               Function
    ===================  ==========================================
    `go:gateone_user`    :js:func:`GateOne.User.storeSessionAction`
    `go:set_username`    :js:func:`GateOne.User.setUsernameAction`
    `go:applications`    :js:func:`GateOne.User.applicationsAction`
    `go:user_list`       :js:func:`GateOne.User.userListAction`
    ===================  ==========================================
*/
U.applications = [];
U.userLoginCallbacks = []; // Each of these will get called after the server sends us the user's username, providing the username as the only argument.
GateOne.Base.update(GateOne.User, {
    init: function() {
        /**:GateOne.User.init()

        Adds the user's ID (aka UPN) to the prefs panel along with a logout link.
        */
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
        go.Events.on('go:switch_workspace', U.workspaceApp);
    },
    workspaceApp: function(workspace) {
        /**:GateOne.User.workspaceApp(workspace)

        Attached to the 'go:switch_workspace' event; sets :js:attr:`GateOne.User.activeApplication` to whatever application is attached to the ``data-application`` attribute on the provided *workspace*.
        */
        var workspaceNode = u.getNode('#'+prefix+'workspace'+workspace),
            app;
        if (workspaceNode) {
            app = workspaceNode.getAttribute('data-application');
            if (app) {
                U.setActiveApp(app);
            } else {
                U.setActiveApp(null);
            }
        }
    },
    setActiveApp: function(app) {
        /**:GateOne.User.setActiveApp(app)

        Sets :js:attr:`GateOne.User.activeApplication` the given *app*.

        .. note:: The *app* argument is case-insensitive.  For example, if you pass 'terminal' it will set the active application to 'Terminal' (which is the name inside `GateOne.User.applications`).
        */
        logDebug('setActiveApp(): ' + app);
        if (app) {
            U.applications.forEach(function(appObj) {
                if (appObj.name.toLowerCase() == app.toLowerCase()) {
                    app = appObj.name;
                }
            });
        }
        U.activeApplication = app;
    },
    setUsernameAction: function(username) {
        /**:GateOne.User.setUsernameAction(username)

        Sets :js:attr:`GateOne.User.username` to *username*.  Also triggers the `go:user_login` event with the username as the only argument.

        .. tip:: If you want to call a function after the user has successfully loaded Gate One and authenticated attach it to the `go:user_login` event.
        */
        // NOTE: This will normally get run before Gate One's logger is initialized so uncomment below to debug
//         console.log("setUsernameAction(" + username + ")");
        go.User.username = username;
        go.Events.once("go:js_loaded", function() { // Needs to run after everything is loaded; this action should always get called before post-gateone.js JavaScript is loaded
            var prefsPanelUserID = u.getNode('#'+prefix+'user_info_id');
            if (prefsPanelUserID) {
                prefsPanelUserID.innerHTML = username + " ";
            }
            go.Events.trigger("go:user_login", username);
            if (go.User.userLoginCallbacks.length) {
                // Call any registered callbacks
                go.Logging.deprecated("userLoginCallbacks", gettext("Use GateOne.Events.on('go:user_login', func) instead."));
                go.User.userLoginCallbacks.forEach(function(callback) {
                    callback(username);
                });
            }
        });
    },
    logout: function(redirectURL) {
        /**:GateOne.User.logout(redirectURL)

        This function will log the user out by deleting all Gate One cookies and forcing them to re-authenticate.  By default this is what is attached to the 'logout' link in the preferences panel.

        If provided, *redirectURL* will be used to automatically redirect the user to the given URL after they are logged out (as opposed to just reloading the main Gate One page).

        Triggers the `go:user_logout` event with the username as the only argument.
        */
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
        // This only works in IE but fortunately only IE needs it:
        document.execCommand("ClearAuthenticationCache");
        go.Events.trigger("go:user_logout", go.User.username);
        // NOTE: This takes care of deleting the "user" cookie
        u.xhrGet(go.prefs.url+'auth?logout=True&redirect='+redirectURL, function(response) {
            logDebug(gettext("Logout Response: ") + response);
            // Need to modify the URL to include a random username so that when a user logs out with PAM authentication enabled they will be asked for their username/password again
            var url = response.replace(/:\/\/(.*@)?/g, '://'+u.randomString(8)+'@');
            v.displayMessage(gettext("You have been logged out.  Redirecting to: ") + url);
            setTimeout(function() {
                window.location.href = url;
            }, 2000);
        });
    },
    storeSessionAction: function(message) {
        /**:GateOne.User.storeSessionAction(message)

        This gets attached to the `go:gateone_user` `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ action in :js:attr:`GateOne.Net.actions`.  It stores the incoming (encrypted) 'gateone_user' session data in localStorage in a nearly identical fashion to how it gets stored in the 'gateone_user' cookie.

        .. note:: The reason for storing data in localStorage instead of in the cookie is so that applications embedding Gate One can remain authenticated to the user without having to deal with the cross-origin limitations of cookies.
        */
        localStorage[GateOne.prefs.prefix+'gateone_user'] = message;
    },
    applicationsAction: function(apps) {
        /**:GateOne.User.applicationsAction()

        Sets `GateOne.User.applications` to the given list of *apps* (which is the list of applications the user is allowed to run).
        */
        var newWSWS = u.getNode('.✈appchooser');
        // NOTE: Unlike GateOne.loadedApplications--which may hold applications this user may not have access to--this tells us which applications the user can actually use.  That way we can show/hide just those things that the user has access on the server.
        GateOne.User.applications = apps;
        if (!GateOne.prefs.embedded && newWSWS) {
            // Reload the application chooser with this new list of apps
            v.appChooser();
        }
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
        if (!prefsContent.childNodes.length) {
            // Make sure the very first preference is visible
            contentContainer.style.display = '';
            prefsItem.classList.add('✈active');
        }
        prefsContent.appendChild(contentContainer);
        if (callback) {
            E.on("go:save_prefs", callback);
        }
    },
    listUsers: function(/*opt*/callback) {
        /**:GateOne.User.listUsers([callback])

        Sends the `terminal:list_users` WebSocket action to the server which will reply with the `go:user_list` WebSocket action containing a list of all users that are currently connected.  Only users which are allowed to list users via the "list_users" policy will be able to perform this action.

        If a *callback* is given it will be called with the list of users (once it arrives from the server).
        */
        if (callback) {
            E.once("go:user_list", callback);
        }
        go.ws.send(JSON.stringify({"go:list_users": null}));
    },
    userListAction: function(userList) {
        /**:GateOne.User.userListAction()

        Attached to the `go:user_list` WebSocket action; sets `GateOne.User.userList` and triggers the `go:user_list` event passing the list of users as the only argument.
        */
        go.User.userList = userList;
        go.Events.trigger("go:user_list", userList);
    }
});
// Register our GateOne.User actions (needs to be called immediately; before init() functions)
go.Net.addAction('go:gateone_user', go.User.storeSessionAction);
go.Net.addAction('go:set_username', go.User.setUsernameAction);
go.Net.addAction('go:applications', go.User.applicationsAction);
go.Net.addAction('go:user_list', go.User.userListAction);

var E = GateOne.Base.module(GateOne, "Events", '1.0', ['Base', 'Utils']);
/**:GateOne.Events

An object for event-specific stuff.  Inspired by Backbone.js Events.
*/
E.callbacks = {};
GateOne.Base.update(GateOne.Events, {
    on: function(events, callback, context, times) {
        /**:GateOne.Events.on(events, callback[, context[, times]])

        Adds the given *callback* / *context* combination to the given *events*; to be called when the given *events* are triggered.

        :param string events: A space-separated list of events that will have the given *callback* / *context* attached.
        :param function callback: The function to be called when the given *event* is triggered.
        :param object context: An object that will be bound to *callback* as `this` when it is called.
        :param integer times: The number of times this callback will be called before it is removed from the given *event*.

        Examples:

            >>> // A little test function
            >>> var testFunc = function(args) { console.log('args: ' + args + ', this.foo: ' + this.foo) };
            >>> // Call testFunc whenever the "test_event" event is triggered
            >>> GateOne.Events.on("test_event", testFunc);
            >>> // Fire the test_event with 'an argument' as the only argument
            >>> GateOne.Events.trigger("test_event", 'an argument');
            args: an argument, this.foo: undefined
            >>> // Remove the event so we can change it
            >>> GateOne.Events.off("test_event", testFunc);
            >>> // Now let's pass in a context object
            >>> GateOne.Events.on("test_event", testFunc, {'foo': 'bar'});
            >>> // Now fire it just like before
            >>> GateOne.Events.trigger("test_event", 'an argument');
            args: an argument, this.foo: bar
        */
        // Commented out because it's super noisy.  Uncomment to debug
//         logDebug("on("+events+")", callback);
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
        /**:GateOne.Events.off(events, callback[, context])

        Removes the given *callback* / *context* combination from the given *events*

        :param string events: A space-separated list of events.
        :param function callback: The function that's attached to the given events to be removed.
        :param object context: The context attached to the given event/callback to be removed.

        Example:

            >>> GateOne.Events.off("new_terminal", someFunction);
        */
        var eventList, i, n;
        if (!arguments.length) {
            E.callbacks = {}; // Clear all events/callbacks
        } else {
            eventList = events ? events.split(/\s+/) : u.keys(E.callbacks);
            for (var i in eventList) {
                var event = eventList[i],
                    callList = E.callbacks[event];
                if (callList) { // There's a matching event
                    var newList = [];
                    for (var n in callList) {
                        if (callback) {
                             if (callList[n].callback && callList[n].callback.toString() == callback.toString()) {
                                if (context && callList[n].context != context) {
                                    newList.push(callList[n]);
                                } else if (context === null && callList[n].context) {
// If the context is undefined assume the dev wants to remove all matching callbacks for this event
// However, if the context was set to null assume they only want to match callbacks that have no context.
                                    newList.push(callList[n]);
                                }
                             } else {
                                newList.push(callList[n]);
                             }
                        } else if (context && callList[n].context != context) {
                            newList.push(callList[n]);
                        }
                    }
                    E.callbacks[event] = newList;
                }
            }
        }
        return this;
    },
    once: function(events, callback, context) {
        /**:GateOne.Events.once(events, callback[, context])

        A shortcut that performs the equivalent of ``GateOne.Events.on(events, callback, context, 1)``.
        */
        return E.on(events, callback, context, 1);
    },
    trigger: function(events) {
        /**:GateOne.Events.trigger(events)

        Triggers the given *events*.  Any additional provided arguments will be passed to the callbacks attached to the given events.

        :param string events: A space-separated list of events to trigger

        Example:

            >>> // The '1' below will be passed to each callback as the only argument
            >>> GateOne.Events.trigger("new_terminal", 1);
        */
        var args = Array.prototype.slice.call(arguments, 1); // Everything after *events*
        logDebug("Triggering: " + events, args);
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
                    go.Logging.deprecated("Event: " + event, gettext("Events now use prefixes such as 'go:' or 'terminal:'."));
                }
            }
            if (callList) {
                callList.forEach(function(callObj) {
                    var context = callObj.context || this;
                    if (callObj.callback) {
//                         logDebug("trigger(): Calling ", callObj);
                        callObj.callback.apply(context, args);
                        if (callObj.times) {
                            callObj.times -= 1;
                            if (callObj.times == 0) {
                                E.off(event, callObj.callback, callObj.context);
                            }
                        }
                    }
                });
            }
        });
        return this;
    }
});
go.Icons.grid = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="gridGradient" y2="255.75" gradientUnits="userSpaceOnUse" x2="311.03" gradientTransform="matrix(0.70710678,0.70710678,-0.70710678,0.70710678,261.98407,-149.06549)" y1="227.75" x1="311.03"><stop class="✈stop1" offset="0"/><stop class="✈stop4" offset="1"/></linearGradient></defs><g transform="matrix(0.66103562,-0.67114094,0.66103562,0.67114094,-611.1013,-118.18392)"><g fill="url(#gridGradient)" transform="translate(63.353214,322.07725)"><polygon points="311.03,255.22,304.94,249.13,311.03,243.03,317.13,249.13"/><polygon points="318.35,247.91,312.25,241.82,318.35,235.72,324.44,241.82"/><polygon points="303.52,247.71,297.42,241.61,303.52,235.52,309.61,241.61"/><polygon points="310.83,240.39,304.74,234.3,310.83,228.2,316.92,234.3"/></g></g></svg>';
go.Icons.close = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="closeGradient" y2="252.75" gradientUnits="userSpaceOnUse" y1="232.75" x2="487.8" x1="487.8"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" fill="url(#closeGradient)"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';
go.Icons.minimize = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 18 4.6829" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="minGradient" y2="245.02" gradientUnits="userSpaceOnUse" y1="241.02" gradientTransform="matrix(1.1707317,0,0,1.1707317,-337.25215,261.80107)" x2="611.33" x1="611.33"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><g transform="translate(-369.45535,-543.96497)"><rect height="4.6829" width="18" y="543.96" x="369.46" fill="url(#minGradient)"/></g></svg>';
go.Icons.maximize = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" width="18" height="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 17.942 18" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="maxGradient" y2="293.03" gradientUnits="userSpaceOnUse" x2="133.21" y1="276.85" x1="133.21"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><g transform="translate(-358.77284,-570.86761)"><g fill="url(#maxGradient)" transform="matrix(0.61905467,0,0,0.61905467,133.52978,206.80145)"><polygon points="132.75,276.85,132.75,281.97,123.14,281.97,123.14,287.91,132.75,287.91,132.75,293.03,143.27,284.94" transform="matrix(0.70710678,-0.70710678,0.70710678,0.70710678,90.041125,487.92719)"/><polygon points="132.75,287.91,132.75,293.03,143.27,284.94,132.75,276.85,132.75,281.97,123.14,281.97,123.14,287.91" transform="matrix(-0.70710678,0.70710678,-0.70710678,-0.70710678,666.64163,717.34976)"/></g></g></svg>';
go.Icons['newWS'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="newwsg" y2="234.18" gradientUnits="userSpaceOnUse" x2="561.42" y1="252.18" x1="561.42"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><g transform="translate(-261.95455,-486.69334)"><g transform="matrix(0.94996733,0,0,0.94996733,-256.96226,264.67838)"><rect height="3.867" width="7.54" y="241.25" x="557.66" fill="url(#newwsg)"/><rect height="3.866" width="7.541" y="241.25" x="546.25" fill="url(#newwsg)"/><rect height="7.541" width="3.867" y="245.12" x="553.79" fill="url(#newwsg)"/><rect height="7.541" width="3.867" y="233.71" x="553.79" fill="url(#newwsg)"/><rect height="3.867" width="3.867" y="241.25" x="553.79" fill="url(#newwsg)"/><rect height="3.867" width="3.867" y="241.25" x="553.79" fill="url(#newwsg)"/></g></g></svg>';
go.Icons.application = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="infoGradient" y2="294.5" gradientUnits="userSpaceOnUse" x2="253.59" gradientTransform="translate(244.48201,276.279)" y1="276.28" x1="253.59"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><g transform="translate(-396.60679,-820.39654)"><g transform="translate(152.12479,544.11754)"><path fill="url(#infoGradient)" d="m257.6,278.53c-3.001-3-7.865-3-10.867,0-3,3.001-3,7.868,0,10.866,2.587,2.59,6.561,2.939,9.53,1.062l4.038,4.039,2.397-2.397-4.037-4.038c1.878-2.969,1.527-6.943-1.061-9.532zm-1.685,9.18c-2.07,2.069-5.426,2.069-7.494,0-2.071-2.069-2.071-5.425,0-7.494,2.068-2.07,5.424-2.07,7.494,0,2.068,2.069,2.068,5.425,0,7.494z"/></g></g></svg>';
GateOne.Icons['prefs'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="prefsGradient" x1="85.834" gradientUnits="userSpaceOnUse" x2="85.834" gradientTransform="translate(288.45271,199.32483)" y1="363.23" y2="388.56"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><g transform="matrix(0.71050762,0,0,0.71053566,-256.93092,-399.71681)"><path fill="url(#prefsGradient)" d="m386.95,573.97c0-0.32-0.264-0.582-0.582-0.582h-1.069c-0.324,0-0.662-0.25-0.751-0.559l-1.455-3.395c-0.155-0.277-0.104-0.69,0.123-0.918l0.723-0.723c0.227-0.228,0.227-0.599,0-0.824l-1.74-1.741c-0.226-0.228-0.597-0.228-0.828,0l-0.783,0.787c-0.23,0.228-0.649,0.289-0.931,0.141l-2.954-1.18c-0.309-0.087-0.561-0.423-0.561-0.742v-1.096c0-0.319-0.264-0.581-0.582-0.581h-2.464c-0.32,0-0.583,0.262-0.583,0.581v1.096c0,0.319-0.252,0.657-0.557,0.752l-3.426,1.467c-0.273,0.161-0.683,0.106-0.912-0.118l-0.769-0.77c-0.226-0.226-0.597-0.226-0.824,0l-1.741,1.742c-0.229,0.228-0.229,0.599,0,0.825l0.835,0.839c0.23,0.228,0.293,0.642,0.145,0.928l-1.165,2.927c-0.085,0.312-0.419,0.562-0.742,0.562h-1.162c-0.319,0-0.579,0.262-0.579,0.582v2.463c0,0.322,0.26,0.585,0.579,0.585h1.162c0.323,0,0.66,0.249,0.753,0.557l1.429,3.369c0.164,0.276,0.107,0.688-0.115,0.916l-0.802,0.797c-0.226,0.227-0.226,0.596,0,0.823l1.744,1.741c0.227,0.228,0.598,0.228,0.821,0l0.856-0.851c0.227-0.228,0.638-0.289,0.925-0.137l2.987,1.192c0.304,0.088,0.557,0.424,0.557,0.742v1.141c0,0.32,0.263,0.582,0.583,0.582h2.464c0.318,0,0.582-0.262,0.582-0.582v-1.141c0-0.318,0.25-0.654,0.561-0.747l3.34-1.418c0.278-0.157,0.686-0.103,0.916,0.122l0.753,0.758c0.227,0.225,0.598,0.225,0.825,0l1.743-1.744c0.227-0.226,0.227-0.597,0-0.822l-0.805-0.802c-0.223-0.228-0.285-0.643-0.134-0.926l1.21-3.013c0.085-0.31,0.423-0.559,0.747-0.562h1.069c0.318,0,0.582-0.262,0.582-0.582v-2.461zm-12.666,5.397c-2.29,0-4.142-1.855-4.142-4.144s1.852-4.142,4.142-4.142c2.286,0,4.142,1.854,4.142,4.142s-1.855,4.144-4.142,4.144z"/></g></svg>';
GateOne.Icons['back_arrow'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="backGradient" y2="449.59" gradientUnits="userSpaceOnUse" x2="235.79" y1="479.59" x1="235.79"><stop class="✈panelstop1" offset="0"/><stop class="✈panelstop2" offset="0.4944"/><stop class="✈panelstop3" offset="0.5"/><stop class="✈panelstop4" offset="1"/></linearGradient></defs><g transform="translate(-360.00001,-529.36218)"><g transform="matrix(0.6,0,0,0.6,227.52721,259.60639)"><circle d="m 250.78799,464.59299 c 0,8.28427 -6.71572,15 -15,15 -8.28427,0 -15,-6.71573 -15,-15 0,-8.28427 6.71573,-15 15,-15 8.28428,0 15,6.71573 15,15 z" cy="464.59" cx="235.79" r="15" fill="url(#backGradient)"/><path fill="#FFF" d="m224.38,464.18,11.548,6.667v-3.426h5.003c2.459,0,5.24,3.226,5.24,3.226s-0.758-7.587-3.54-8.852c-2.783-1.265-6.703-0.859-6.703-0.859v-3.425l-11.548,6.669z"/></g></g></svg>';
GateOne.Icons.panelclose = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/"><g transform="matrix(1.115933,0,0,1.1152416,-461.92317,-695.12248)"><g transform="translate(-61.7655,388.61318)" class="✈svgplain"><polygon points="483.76,240.02,486.5,242.75,491.83,237.42,489.1,234.68"/><polygon points="478.43,250.82,483.77,245.48,481.03,242.75,475.7,248.08"/><polygon points="491.83,248.08,486.5,242.75,483.77,245.48,489.1,250.82"/><polygon points="475.7,237.42,481.03,242.75,483.76,240.02,478.43,234.68"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/><polygon points="483.77,245.48,486.5,242.75,483.76,240.02,481.03,242.75"/></g></g></svg>';
GateOne.Icons['locations'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" height="16.017" width="18" viewBox="0 0 18 16.017" xmlns:dc="http://purl.org/dc/elements/1.1/" class="✈svg"><defs><linearGradient id="locGradient1"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="1"/></linearGradient><linearGradient id="locGradient2" y2="27.906" xlink:href="#locGradient1" gradientUnits="userSpaceOnUse" x2="16.259" gradientTransform="scale(0.5625,0.57203391)" y1="0.091391" x1="16.259"/><linearGradient id="linearGradient4397" y2="69.636" xlink:href="#locGradient1" x2="121.74" y1="69.636" x1="19.989"/></defs><g transform="translate(0,-15.983051)"><rect height="32" width="32" y="0" x="0" fill="none"/></g><path fill="url(#locGradient2)" d="m0,0,0,16.017,17.999,0l0.001-16.017zm12.375,1.1441,0,1.1441-6.75,0,0-1.1441zm-7.875,0,0,1.1441-1.125,0,0-1.1441zm-3.375,0,1.125,0,0,1.1441-1.125,0zm15.749,13.729-15.749,0,0-11.441,15.749,0zm-17.998-28.602h-2.25v-1.1441h2.25z"/><g fill="url(#linearGradient4397)" transform="matrix(0.06546268,0,0,0.06546268,4.3485575,4.7137821)"><path fill="url(#linearGradient4397)" d="m95.35,50.645c0,13.98-11.389,25.322-25.438,25.322-14.051,0-25.438-11.342-25.438-25.322,0-13.984,11.389-25.322,25.438-25.322,14.052-0.001,25.438,11.337,25.438,25.322m26.393,0c0-27.971-22.774-50.645-50.874-50.645-28.098,0-50.877,22.674-50.877,50.645,0,12.298,4.408,23.574,11.733,32.345l39.188,56.283,39.761-57.104c1.428-1.779,2.736-3.654,3.916-5.625l0.402-0.574h-0.066c4.33-7.454,6.82-16.096,6.82-25.325"/></g></svg>';

})(window);

//# sourceURL=/static/gateone.js
