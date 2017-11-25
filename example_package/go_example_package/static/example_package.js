
// Everything gets wrapped inside the superSandbox() function to ensure this code will only get called after all the dependencies are loaded.

GateOne.Base.superSandbox("GateOne.Terminal.ExamplePackage", /* Dependencies -->*/["GateOne.Terminal", "GateOne.User", "GateOne.Terminal.Input", "GateOne.TermLogging"], function(window, undefined) {
"use strict";

/**:GateOne.Terminal.ExamplePackage

The code below is just boilerplate, "best practices" for running JavaScript in Gate One.  You can replace this file with one of your own making or remove it entirely.  Just note that it's all wrapped in the superSandbox() function and you should do that in your code as well.  That will ensure that all dependencies get loaded before your code gets run.

Also note that Gate One will take care of minifying this JavaScript code before it gets delivered to clients.  There's no need to do that ahead of time.

*/

// Useful sandbox-wide shortcuts
var go = GateOne, // Things like this save a lot of typing
    EP, // Will be a reference to this GateOne.Terminal.ExamplePackage
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    prefix = go.prefs.prefix,
    gettext = go.i18n.gettext,
    logFatal = go.Logging.logFatal,
    logError = go.Logging.logError,
    logWarning = go.Logging.logWarning,
    logInfo = go.Logging.logInfo,
    logDebug = go.Logging.logDebug;

// Make a shortcut/quick reference to our ExamplePackage object:
EP = go.Base.module(go.Terminal, "ExamplePackage", "1.0");

go.Base.update(go.Terminal.ExamplePackage, {
    init: function() {
        /**:GateOne.Terminal.ExamplePackage.init()

        This function gets called when the plugin is initialized (after all the superSandbox dependencies have been loaded).
        */
        logInfo("GateOne.Terminal.ExamplePackage loaded successfully."); // Note that GateOne.Logging.<whatever> messages get sent to the server for super duper debugging convenience!

        // Examples of potentially useful things you might want to put in your plugin are commented out below:

        // Override a keyboard shortcut or add some new ones:
//         E.off("go:keyup:ctrl-alt-w"); // Remove Gate One's "close workspace" keyboard shortcut
//         E.off("go:keyup:ctrl-alt-n"); // Remove Gate One's "new workspace" keyboard shortcut
//         // Add a keyboard shortcuts for sending the equivalent of ctrl-w and ctrl-n using ctrl-alt:
//         E.on("terminal:keyup:ctrl-alt-w", function(e) { GateOne.Terminal.sendString("\u0017"); }); // Send ctrl-w to the active terminal
//         E.on("terminal:keyup:ctrl-alt-n", function(e) { GateOne.Terminal.sendString("\u000e"); }); // Send ctrl-n to the active terminal
    }
});

}); // end superSandbox wrapper
