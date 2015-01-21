
GateOne.Base.superSandbox("GateOne.Editor", ["GateOne.Visual", "GateOne.User", "GateOne.Input", "GateOne.Storage", "CodeMirror"], function(window, undefined) {
"use strict";

var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var go = GateOne,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    I = go.Input,
    prefix = go.prefs.prefix,
    gettext = GateOne.i18n.gettext,
    noop = u.noop,
    Editor,
    maxRetries = 200, // Amounts to about 10 seconds
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

Editor = GateOne.Base.module(GateOne, "Editor", "1.0", ['Base']);
/**:GateOne.Editor

A global Gate One plugin for providing a code/text editor component.  At the moment it just wraps CodeMirror but may support more JS editors in the future.
*/
GateOne.Base.update(GateOne.Editor, {
    _retryCount: 0, // Tracks number of retries when loading modes
    invalidModes: [], // Keeps track of modes that could not be found on the server
    _requestedModes: {},
    init: function() {
        /**:GateOne.Editor.init()

        Registers the "go:editor_invalid_mode" WebSocket action which is called when an editor "mode" file cannot be found.
        */
        go.Net.addAction('go:editor_invalid_mode', Editor.invalidModeAction);
    },
    invalidModeAction: function(mode) {
        /**:GateOne.Editor.invalidModeAction(mode)

        Called when an invalid mode was requested by the client.  Cancels any waiting editor callbacks and logs an error.
        */
        logError(gettext("CodeMirror editor mode could not be found: ") + mode);
        Editor.invalidModes.push(mode);
    },
    newEditor: function(place, options, callback) {
        /**:GateOne.Editor.newEditor(place[, options[, callback]])

        A wrapper around the :js:meth:`CodeMirror` function.  The given *place* may be a querySelector-like string or DOM node.

        This function will automatically load the JavaScript required for any given *options['mode']* using Gate One's file synchronization and compression feature.

        If a *callback* is given it will be called with the new instance of CodeMirror as the only argument.
        */
        var mode = options.mode, cm;
        place = u.getNode(place);
        if (mode && !CodeMirror.modes[mode]) {
            if (!Editor._requestedModes[mode]) {
                go.ws.send(JSON.stringify({'go:get_editor_mode': mode}));
                Editor._requestedModes[mode] = true;
            }
        } else {
            if (callback) {
                callback(CodeMirror(place, options));
            } else {
                CodeMirror(place, options);
            }
            return;
        }
        clearTimeout(Editor._pending);
        if (CodeMirror[mode]) {
            cm = CodeMirror(place, options);
            Editor._retryCount = 0;
            if (callback) { callback(cm); }
        } else if (Editor.invalidModes[mode]) {
            logError(gettext("Specified CodeMirror mode is invalid: ") + mode);
            options.mode = null;
            cm = CodeMirror(place, options); // Load it anyway--just without that mode enabled
            Editor._retryCount = 0;
            if (callback) { callback(cm); }
        } else {
            if (Editor._retryCount > maxRetries) {
                logError(gettext("Took too long waiting for the given CodeMirror mode."));
                options.mode = null;
                cm = CodeMirror(place, options);
                Editor._retryCount = 0;
                if (callback) { callback(cm); }
            } else {
                Editor._pending = setTimeout(function() {
                    Editor._retryCount += 1;
                    Editor.newEditor(place, options, callback);
                }, 50);
            }
        }
    },
    fromTextArea: function(textarea, options, callback) {
        /**:GateOne.Editor.fromTextArea(textarea[, options[, callback]])

        Executes :js:meth:`CodeMirror.fromTextArea` on the given *textarea* (which can be a querySelector-like string or DOM node) using the given CodeMirror *options*.

        This function will automatically load the JavaScript required for any given *options['mode']* using Gate One's file synchronization and compression feature.

        If a *callback* is given it will be called with the new instance of CodeMirror as the only argument.
        */
        var mode = options.mode, cm;
        textarea = u.getNode(textarea);
        if (mode && !CodeMirror.modes[mode]) {
            if (!Editor._requestedModes[mode]) {
                go.ws.send(JSON.stringify({'go:get_editor_mode': mode}));
                Editor._requestedModes[mode] = true;
            }
        } else {
            if (callback) {
                callback(CodeMirror.fromTextArea(textarea, options));
            } else {
                CodeMirror.fromTextArea(textarea, options);
            }
            return;
        }
        clearTimeout(Editor._pending);
        if (CodeMirror[mode]) {
            cm = CodeMirror.fromTextArea(textarea, options);
            Editor._retryCount = 0;
            if (callback) { callback(cm); }
        } else if (Editor.invalidModes[mode]) {
            logError(gettext("Specified CodeMirror mode is invalid: ") + mode);
            options.mode = null;
            cm = CodeMirror.fromTextArea(textarea, options); // Load it anyway--just without that mode enabled
            Editor._retryCount = 0;
            if (callback) { callback(cm); }
        } else {
            if (Editor._retryCount > maxRetries) {
                logError(gettext("Took too long waiting for the given CodeMirror mode."));
                options.mode = null;
                cm = CodeMirror.fromTextArea(textarea, options);
                Editor._retryCount = 0;
                if (callback) { callback(cm); }
            } else {
                Editor._pending = setTimeout(function() {
                    Editor._retryCount += 1;
                    Editor.fromTextArea(textarea, options, callback);
                }, 50);
            }
        }
    }
});

});
