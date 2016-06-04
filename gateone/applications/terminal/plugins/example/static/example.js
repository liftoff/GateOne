
// An example of how to add Google Analytics to your plugin:
var _gaq = _gaq || []; // We'll actually make our plugin-specific Google Analytics call inside of init()
(function() { // Load the GA script the Gate One way (you can include this in your own plugin without having to worry about duplicates/conflicts)
    var u = GateOne.Utils,
        ga = u.createElement('script', {'id': 'ga', 'type': 'text/javascript', 'async': true, 'src': ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js'}), // Note that prefix is automatically prepended before the 'id' when using createElement()
        existing = u.getNode('#'+GateOne.prefs.prefix+'ga'), // This is why we need to use the prefix here
        s = u.getNodes('script')[0];
    if (!existing) { s.parentNode.insertBefore(ga, s) }
})();
// Note that in order for Google Analytics to work properly the _gaq variable needs to be in the global scope which means you can't wrap it in the sandbox like everything else below.

// This is Gate One's special sandboxing mechanism...  It will wait to load the contained JavaScript until the dependencies are done loading:
GateOne.Base.superSandbox("GateOne.Terminal.Example", /* Dependencies -->*/["GateOne.Terminal", "GateOne.User"], function(window, undefined) {
"use strict"; // Always use this in your JavaScript (best practices)

// Useful sandbox-wide stuff
var document = window.document, // Have to do this because we're sandboxed
    go = GateOne, // Things like this save a lot of typing
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    Example, // Set below
    prefix = go.prefs.prefix,
    noop = u.noop,
    logFatal = GateOne.Logging.logFatal, // If you actually have a legitimate use for logFatal in your plugin...  Awesome!
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

// GateOne.Terminal.Example Plugin:   "Name", "version", ['dependency1', 'dependency2', etc]
Example = go.Base.module(GateOne.Terminal, "Example", "1.2");
Example.graphUpdateTimer = null; // Used to track the setTimout() that updates the load graph
Example.topUpdateTimer = null; // Used to track the setTimeout() that updates the topTop output

go.Base.update(GateOne.Terminal.Example, { // Everything that we want to be available under GateOne.Terminal.Example goes in here
    init: function() {
        /**:GateOne.Terminal.Example.init()

        The init() function of every JavaScript plugin gets called automatically after the WebSocket is connected is authenticated.

        The Example plugin's `init()` function sets up some internal variables, keyboard shortcuts (:kbd:`Control-Alt-L` to open the load graph), and adds some buttons to the Info & Tools menu.
        */
        var infoPanel = u.getNode('#'+prefix+'panel_info'), // Need this since we're going to be adding a button here
            h3 = u.createElement('h3'), // We'll add an "Example Plugin" header to the info panel just like the SSH plugin has
            infoPanelLoadGraph = u.createElement('button', {'id': 'load_g', 'type': 'submit', 'value': 'Submit', 'class': '✈button ✈black'}),
            infoPanelTopButton = u.createElement('button', {'id': 'load_top', 'type': 'submit', 'value': 'Submit', 'class': '✈button ✈black'});
        h3.innerHTML = "Example Plugin"; // Sing it with me: My plugin has a first name, it's E X A M P L E
        infoPanelLoadGraph.innerHTML = "Load Graph"; // My plugin has a button name, it's...  Yeah, you get the idea
        infoPanelLoadGraph.onclick = function(e) { // Make it do something when clicked
            e.preventDefault();
            Example.toggleLoadGraph();
            v.togglePanel(); // Hide the panel while we're at so the widget isn't hidden underneath
            setTimeout(function() {
                go.Terminal.Input.capture();
            }, 100);
        }
        // Let's attach the load graph toggle to a keyboard shortcut too:
        if (!go.prefs.embedded) { // Only enable if not in embedded mode (best practices)
            E.on("terminal:keydown:ctrl-alt-l", function() { Example.toggleLoadGraph(); }); // L for 'load'
        }
        // Add the 'top top' button (not going to bother with a keyboard shortcut on this one)
        infoPanelTopButton.innerHTML = "Top Widget";
        infoPanelTopButton.onclick = function(e) {
            e.preventDefault();
            Example.topTop();
            GateOne.Visual.togglePanel(); // Hide the panel while we're at so the widget isn't hidden underneath
            setTimeout(function() {
                go.Terminal.Input.capture();
            }, 100);
        }
        // Now add these elements to the info panel:
        infoPanel.appendChild(h3);
        infoPanel.appendChild(infoPanelLoadGraph);
        infoPanel.appendChild(infoPanelTopButton);
        // This sets a Google Analytics custom variable so you can tell what version of your plugin is in use out in the wild.
        _gaq.push(
            ['_setAccount', 'UA-30421535-1'], // Replace this with your own UA
            ['_setCustomVar', 1, 'Version', go.VERSION], // You could replace GateOne.VERSION with GateOne.YourPlugin.VERSION
            ['_trackPageview'],
            ['_trackEvent','Plugin Loaded', 'Example']
        );
    },
    stopGraph: function(result) {
        /**:GateOne.Terminal.Example.stopGraph(result)

        Clears the `GateOne.Terminal.Example.graphUpdateTimer`, removes the canvas element, and stops the smoothie graph streaming.  *result* is unused.
        */
        clearInterval(Example.graphUpdateTimer);
        Example.graphUpdateTimer = null;
        Example.loadGraph.stop();
        u.removeElement(Example.canvas);
    },
    updateGraph: function(output) {
        /**:GateOne.Terminal.Example.updateGraph(output)

        Updates ``GateOne.Terminal.Example.line1`` through ``line3`` by parsing the *output* of the 'uptime' command.
        */
        // ' 16:23:07 up 13 days, 23:22, 10 users,  load average: 1.47, 0.56, 0.38'
        var fivemin = parseFloat(output.split('average:')[1].split(',')[0].trim()),
            tenmin = parseFloat(output.split('average:')[1].split(',')[1].trim()),
            fifteenmin = parseFloat(output.split('average:')[1].split(',')[2].trim());
        // The smoothie charts library will watch these and update the chart automatically as the new data is added
        Example.line1.append(new Date().getTime(), fivemin);
        Example.line2.append(new Date().getTime(), tenmin);
        Example.line3.append(new Date().getTime(), fifteenmin);
    },
    toggleLoadGraph: function(term) {
        /**:GateOne.Terminal.Example.toggleLoadGraph(term)

        Displays a real-time load graph of the given terminal (inside of it as a :js:meth:`GateOne.Visual.widget`).
        */
        if (!term) {
            term = localStorage[prefix+'selectedTerminal'];
        }
        if (!Example.line1) {
            // These are part of smoothie charts; they represent each load graph line.
            Example.line1 = new TimeSeries();
            Example.line2 = new TimeSeries();
            Example.line3 = new TimeSeries();
        }
        var canvas = u.createElement('canvas', {'id': 'load_graph', 'width': 300, 'height': 40}), // <canvas id="mycanvas" width="400" height="100"></canvas>
            smoothie = new SmoothieChart({
                grid: {strokeStyle:'rgba(125, 0, 0, 0.7)', fillStyle:'transparent', lineWidth: 1, millisPerLine: 3000, verticalSections: 6},
                labels: {fillStyle:'#ffffff'}
            }),
            configure = function() {
                alert('it works!');
            };
        if (Example.graphUpdateTimer) {
            // Graph already present/running.  Turn it off
            Example.stopGraph();
            Example.line1 = null;
            Example.line2 = null;
            Example.line3 = null;
            return;
        }
        if (!go.Terminal.terminals[term]['sshConnectString']) {
            // FYI: This doesn't always work because the sshConnectString might be present even if the terminal isn't connected...  Working on fixing that :)
            v.displayMessage("Error: Can't display load graph because terminal " + term + " is not connected via SSH.");
            return;
        }
        v.widget('Load Graph', canvas, {'onclose': Example.stopGraph, 'onconfig': configure});
        // Update the graph every three seconds
        Example.graphUpdateTimer = setInterval(function() {
            go.SSH.execRemoteCmd(term, 'uptime', Example.updateGraph, Example.stopGraph);
        }, 3000);
        // Add to SmoothieChart
        smoothie.addTimeSeries(Example.line1, {strokeStyle:'rgb(25, 255, 0)', fillStyle:'rgba(0, 255, 0, 0.4)', lineWidth:3});
        smoothie.addTimeSeries(Example.line2, {strokeStyle:'rgb(0, 0, 255)', fillStyle:'rgba(0, 0, 255, 0.3)', lineWidth:3});
        smoothie.addTimeSeries(Example.line3, {strokeStyle:'rgb(255, 0, 0)', fillStyle:'rgba(255, 0, 0, 0.2)', lineWidth:3});
        smoothie.streamTo(canvas, 3000);
        Example.canvas = canvas; // So we can easily remove it later.
        Example.loadGraph = smoothie; // So we can stop it later.
        v.displayMessage("Example Plugin: Real-time Load Graph!", 5000);
        v.displayMessage("Green: 5 minute, Blue: 10 minute, Red: 15 minute", 5000);
    },
    updateTop: function(output) {
        /**:GateOne.Terminal.Example.updateTop(output)

        Updates the :js:meth:`GateOne.Terminal.Example.topTop` output on the screen when we receive *output* from the Gate One server. Here's what the output should look like::

            PID USER      PR  NI  VIRT  RES  SHR S %CPU %MEM    TIME+  COMMAND
              1 root      20   0 24052 2132 1316 S  0.0  0.4   0:00.35 /sbin/init
              2 root      20   0     0    0    0 S  0.0  0.0   0:00.00 [kthreadd]
              3 root      20   0     0    0    0 S  0.0  0.0   0:00.08 [ksoftirqd/0]
        */
        Example.toptop.innerHTML = output;
    },
    stopTop: function(result) {
        /**:GateOne.Terminal.Terminal.Example.stopTop(result)

        Clears the `GateOne.Terminal.Example.topUpdateTimer` and removes the 'toptop' element.  *result* is unused.
        */
        clearInterval(Example.topUpdateTimer);
        Example.topUpdateTimer = null;
        u.removeElement(Example.toptop);
    },
    topTop: function(term) {
        /**:GateOne.Terminal.Example.topTop(term)

        Displays the top three CPU-hogging processes on the server in real-time (updating every three seconds just like top).
        */
        if (!term) {
            term = localStorage[prefix+'selectedTerminal'];
        }
        Example.toptop = u.getNode('#'+prefix+'toptop');
        if (!Example.toptop) {
            // NOTE: Have to set position:static below since GateOne's default CSS says that '<goDiv> .terminal pre' should be position:absolute
            Example.toptop = u.createElement('pre', {'class': '✈toptop', 'style': {'background-color': 'rgba(0, 0, 0, 0.25)', 'margin': 0}});
            Example.toptop.innerHTML = 'Loading...';
            v.widget('Top Top', Example.toptop, {'onclose': Example.stopTop});
        }
        if (Example.topUpdateTimer) {
            // Toptop already present/running.  Stop it
            Example.stopTop();
            return;
        }
        // Update the 'top' output every three seconds
        Example.topUpdateTimer = setInterval(function() {
            go.SSH.execRemoteCmd(term, 'top -bcn1 | head | tail -n4', Example.updateTop, Example.stopTop);
        }, 3000);
    },
    generateAuthObject: function(api_key, secret, upn) {
        /**:GateOne.Terminal.Example.generateAuthObject(api_key, secret, upn)

        Returns a properly-constructed authentication object that can be used with Gate One's API authentication mode.  The timestamp, signature, signature_method, and api_version values will be created automatically.

        :param string api_key: The API key to use when generating the authentication object.  Must match Gate One's api_keys setting (e.g. in server.conf).
        :param string secret: The secret attached to the given *api_key*.
        :param string upn: The userPrincipalName (aka UPN or username) you'll be authenticating.

        .. note:: This will also attach an 'example_attibute' that will be automatically assigned to the 'user' dict on the server so it can be used for other purposes (e.g. authorization checks and inside of plugins).
        */
        var timestamp = new Date().getTime(),
            auth_obj = {
            'api_key': api_key,
            'upn': upn,
            'timestamp': timestamp,
            'api_version': '1.0',
            'signature_method': 'HMAC-SHA1',
            'example_attribute': "This will be attached to the user's identity on the server",
            'signature': CryptoJS.HmacSHA1(api_key + upn + timestamp, secret).toString()
        };
        return auth_obj;
    }
});

});
