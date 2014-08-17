/**:GateOne.ExampleApp

*/


// Load our app using the superSandbox so that it automatically loads dependencies...
// We only require GateOne.Terminal--for no other reason than we needed to put *something* there to show how it works:
GateOne.Base.superSandbox("GateOne.ExampleApp", ["GateOne.Terminal"], function(window, undefined) {
    // By wrapping our code in the superSandbox we ensure that GateOne.Terminal is loaded before the code below.

"use strict"; // Ensure best practices and that our variables don't leak into the global namespace

// Some useful, sandbox-wide shortcuts
var go = GateOne,
    prefix = go.prefs.prefix,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    I = go.Input,
    S = go.Storage,
    gettext = GateOne.i18n.gettext,
    urlObj = (window.URL || window.webkitURL),
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

// Setup some defaults for our example app's prefs (not actually used)
go.prefs['example'] = go.prefs['example'] || 'Hello, world!';
// The example above allows the pref to be set before GateOne.init() is called while also providing a default as a fallback

// This ensures that our example pref doesn't get saved to localStorage when GateOne.Utils.savePrefs() is called:
go.noSavePrefs['example'] = null;

// Application JavaScript isn't much different than a plugin's JavaScript
go.Base.module(GateOne, "ExampleApp", "1.0"); // Create our GateOne.ExampleApp module

// Now add some attributes to it:
go.Base.update(GateOne.ExampleApp, {
    // __appinfo__ is one of *two* things that you need in your application's JavaScript.
    // You need it in order for your app to show up on the New Workspace Workspace.
    __appinfo__: {
        'name': 'Example', // This is how we match the server-side name of your app with the JS so make sure they match.
        'module': 'GateOne.ExampleApp', // Just some metadata (not currently used but please don't skip this)
        'icon': null // This is the icon that will appear in the New Workspace Workspace
    },
    // Here's the other thing your application will need:
    __new__: function(settings, /*opt*/where) {
        /**:GateOne.ExampleApp.__new__(settings[, where])

        Called when a user clicks on your application in the New Workspace Workspace (or anything that happens to call __new__()).

        :settings: An object containing the settings that will control how the application is created.  Typically contains the application's 'info' data from the server.
        :where: An optional querySelector-like string or DOM node where the new application should be placed.  If not given a new workspace will be created to contain the application.
        */
        // Let's open up a new example in the new workspace:
        go.ExampleApp.newExample(where, settings);
        // NOTE: When __new__() is called there's no need to create a new workspace as the workspace that's given will be empty.
    },
    init: function() {
        /**:GateOne.ExampleApp.init()

        If you use this style of inline documentation you can have your code docs automatically generated
        by running "make html" inside Gate One's docs directory.  See the 'example/docs/README.rst' for
        more details about how that works.
        */
        // We don't actually have anything that needs to be initilized.
        logDebug("I just ran GateOne.ExampleApp.init()");
    },
    postInit: function() {
        logDebug("I just ran GateOne.ExampleApp.postInit()");
    },
    newExample: function(where, /*opt*/appObj) {
        /**:GateOne.ExampleApp.newExample(where[, appObj])

        Creates a DOM node where the user can ping a host.  The created DOM node will be placed inside *where*.

        If *appObj* is given, all metadata included will be displayed to the user.
        */
        // IMPORTANT:  It is *highly* recommended that you prefix all your class names with '✈' to avoid namespace conflicts!
        // Remember:  Gate One can be embedded into *any* web page.  That page might already be using any given name
        // but what is the likelihood that they'll have prefixed their stuff with an airplane too?  Very slim :)
        var div = u.createElement('div', {'class': '✈example_container'}),
        // NOTE:  You don't have to prefix 'id' with anything when using GateOne.Utils.createElement().
        //        That function will automatically prefix the id with GateOne.prefs.prefix.
            form = u.createElement('form'),
            input = u.createElement('input', {'type': 'text', 'name': 'IP', 'placeholder': 'IP Address'}),
            go = u.createElement('button', {'type': 'submit'});
//         go.onclick = function(e) {
//             e.preventDefault(); // Don't actually submit the form
//         }
//         go.innerHTML = "Go";
//         form.appendChild(input);
//         form.appendChild(go)
//         div.appendChild(form);
        div.innerHTML = "<p>Nothing to see here (yet).</p><p>If you don't want to see the Example app in your New Workspace Workspace just disable it by adding an 'enabled_applications' setting in your gateone/conf.d/*.conf settings.  For example, <code>\"enabled_applications\": [\"terminal\"]</code></p><p><b>NOTE:</b> You can close this example app by clicking on the X in the toolbar.</p>";
        where.appendChild(div);
    }
});

});
