
// An example of how to add Google Analytics to your plugin:
var _gaq = _gaq || []; // We'll actually make our plugin-specific Google Analytics call inside of init()
(function() { // Load the GA script the Gate One way (you can include this in your own plugin without having to worry about duplicates/conflicts)
    var u = GateOne.Utils,
        ga = u.createElement('script', {'id': 'ga', 'type': 'text/javascript', 'async': true, 'src': ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js'}), // Note that GateOne.prefs.prefix is automatically prepended before the 'id' when using createElement()
        existing = u.getNode('#'+GateOne.prefs.prefix+'ga'), // This is why we need to use the prefix here
        s = u.getNodes('script')[0];
    if (!existing) { s.parentNode.insertBefore(ga, s) }
})();
// Note that in order for Google Analytics to work properly the _gaq variable needs to be in the global scope which means you can't wrap it in the sandbox like everything else below.

(function(window, undefined) { // Sandbox everything
var document = window.document; // Have to do this because we're sandboxed

// GateOne.Example Plugin:   "Name", "version", ['dependency1', 'dependency2', etc]
GateOne.Base.module(GateOne, "Example", "1.0", ['Base']); // We require 'Base'
GateOne.Example.line1 = new TimeSeries();
GateOne.Example.line2 = new TimeSeries();
GateOne.Example.line3 = new TimeSeries();
GateOne.Example.graphUpdateTimer = null; // Used to track the setTimout() that updates the load graph
GateOne.Example.topUpdateTimer = null; // Used to track the setTimeout() that updates the topTop output

GateOne.Base.update(GateOne.Example, { // Everything that we want to be available under GateOne.Example goes in here
    init: function() { // The init() function of every JavaScript plugin attached to GateOne gets called automatically after the page loads
        var go = GateOne, // Adding a shortcut like this at the top of your plugin saves a lot of typing
            u = go.Utils, // Ditto
            prefix = go.prefs.prefix, // Ditto again
            infoPanel = u.getNode('#'+prefix+'panel_info'), // Need this since we're going to be adding a button here
            h3 = u.createElement('h3'), // We'll add an "Example Plugin" header to the info panel just like the SSH plugin has
            infoPanelLoadGraph = u.createElement('button', {'id': 'load_g', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            infoPanelTopButton = u.createElement('button', {'id': 'load_top', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
        // Assign our logging function shortcuts if the (JS) Logging plugin is available with a safe fallback
        if (go.Logging) { // You can ignore this if you don't care about Gate One's fancy JavaScript logging plugin =)
            logFatal = go.Logging.logFatal; // If you actually have a legitimate use for logFatal in your plugin...  Awesome!
            logError = go.Logging.logError;
            logWarning = go.Logging.logWarning;
            logInfo = go.Logging.logInfo;
            logDebug = go.Logging.logDebug;
        }
        h3.innerHTML = "Example Plugin"; // Sing it with me: My plugin has a first name, it's E X A M P L E
        infoPanelLoadGraph.innerHTML = "Load Graph"; // My plugin has a button name, it's...  Yeah, you get the idea
        infoPanelLoadGraph.onclick = function(e) { // Make it do something when clicked
            e.preventDefault();
            go.Example.toggleLoadGraph();
            go.Visual.togglePanel(); // Hide the panel while we're at so the widget isn't hidden underneath
            setTimeout(function() {
                go.Input.capture();
            }, 100);
        }
        // Let's attach the load graph toggle to a keyboard shortcut too:
        if (!go.prefs.embedded) { // Only enable if not in embedded mode (best practices)
            go.Input.registerShortcut('KEY_L', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.Example.toggleLoadGraph()'}); // L for 'load'
        }
        // Add the 'top top' button (not going to bother with a keyboard shortcut on this one)
        infoPanelTopButton.innerHTML = "Top Widget";
        infoPanelTopButton.onclick = function(e) {
            e.preventDefault();
            GateOne.Example.topTop();
            GateOne.Visual.togglePanel(); // Hide the panel while we're at so the widget isn't hidden underneath
            setTimeout(function() {
                go.Input.capture();
            }, 100);
        }
        // Now add these elements to the info panel:
        infoPanel.appendChild(h3);
        infoPanel.appendChild(infoPanelLoadGraph);
        infoPanel.appendChild(infoPanelTopButton);
        // This sets a Google Analytics custom variable so you can tell what version of your plugin is in use out in the wild.
        _gaq.push(
            ['_setAccount', 'UA-30421535-1'], // Replace this with your own UA
            ['_setCustomVar', 1, 'Version', GateOne.VERSION], // You could replace GateOne.VERSION with GateOne.YourPlugin.VERSION
            ['_trackPageview'],
            ['_trackEvent','Plugin Loaded', 'Example']
        );
    },
    stopGraph: function(result) {
        // Clears the GateOne.Example.graphUpdateTimer, removes the canvas element, and stops the smoothie streaming.
        clearInterval(GateOne.Example.graphUpdateTimer);
        GateOne.Example.graphUpdateTimer = null;
        GateOne.Example.loadGraph.stop();
        GateOne.Utils.removeElement(GateOne.Example.canvas);
    },
    updateGraph: function(output) {
        // Updates GateOne.Example.line1 through line3 by parsing the output of the 'uptime' command
        // ' 16:23:07 up 13 days, 23:22, 10 users,  load average: 1.47, 0.56, 0.38'
        var fivemin = parseFloat(output.split('average:')[1].split(',')[0].trim()),
            tenmin = parseFloat(output.split('average:')[1].split(',')[1].trim()),
            fifteenmin = parseFloat(output.split('average:')[1].split(',')[2].trim());
        // The smoothie charts library will watch these and update the chart automatically as the new data is added
        GateOne.Example.line1.append(new Date().getTime(), fivemin);
        GateOne.Example.line2.append(new Date().getTime(), tenmin);
        GateOne.Example.line3.append(new Date().getTime(), fifteenmin);
    },
    toggleLoadGraph: function(term) {
        // Displays a real-time load graph of the given terminal (inside of it as a widget)
        if (!term) {
            term = localStorage[GateOne.prefs.prefix+'selectedTerminal'];
        }
        var go = GateOne,
            u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv),
            prefix = go.prefs.prefix,
            canvas = u.createElement('canvas', {'id': 'load_graph', 'width': 300, 'height': 40}), // <canvas id="mycanvas" width="400" height="100"></canvas>
            smoothie = new SmoothieChart({
                grid: {strokeStyle:'rgba(125, 0, 0, 0.7)', fillStyle:'transparent', lineWidth: 1, millisPerLine: 3000, verticalSections: 6},
                labels: {fillStyle:'#ffffff'}
            }),
            configure = function() {
                alert('it works!');
            };
        if (go.Example.graphUpdateTimer) {
            // Graph already present/running.  Turn it off
            go.Example.stopGraph();
            return;
        }
        if (!go.terminals[term]['sshConnectString']) {
            // FYI: This doesn't always work because the sshConnectString might be present even if the terminal isn't connected...  Working on fixing that :)
            go.Visual.displayMessage("Error: Can't display load graph because terminal " + term + " is not connected via SSH.");
            return;
        }
        go.Visual.widget('Load Graph', canvas, {'onclose': go.Example.stopGraph, 'onconfig': configure});
        // Update the graph every three seconds
        go.Example.graphUpdateTimer = setInterval(function() {
            go.SSH.execRemoteCmd(term, 'uptime', go.Example.updateGraph, go.Example.stopGraph);
        }, 3000);
        // Add to SmoothieChart
        smoothie.addTimeSeries(go.Example.line1, {strokeStyle:'rgb(25, 255, 0)', fillStyle:'rgba(0, 255, 0, 0.4)', lineWidth:3});
        smoothie.addTimeSeries(go.Example.line2, {strokeStyle:'rgb(0, 0, 255)', fillStyle:'rgba(0, 0, 255, 0.3)', lineWidth:3});
        smoothie.addTimeSeries(go.Example.line3, {strokeStyle:'rgb(255, 0, 0)', fillStyle:'rgba(255, 0, 0, 0.2)', lineWidth:3});
        smoothie.streamTo(canvas, 3000);
        go.Example.canvas = canvas; // So we can easily remove it later.
        go.Example.loadGraph = smoothie; // So we can stop it later.
        go.Visual.displayMessage("Example Plugin: Real-time Load Graph!", 5000);
        go.Visual.displayMessage("Green: 5 minute, Blue: 10 minute, Red: 15 minute", 5000);
    },
    updateTop: function(output) {
        // Updates the topTop() output on the screen when we receive output from the Gate One server
        // Here's what the output should look like:
        //   PID USER      PR  NI  VIRT  RES  SHR S %CPU %MEM    TIME+  COMMAND
        //     1 root      20   0 24052 2132 1316 S  0.0  0.4   0:00.35 /sbin/init
        //     2 root      20   0     0    0    0 S  0.0  0.0   0:00.00 [kthreadd]
        //     3 root      20   0     0    0    0 S  0.0  0.0   0:00.08 [ksoftirqd/0]
        GateOne.Example.toptop.innerHTML = output;
    },
    stopTop: function(result) {
        // Clears the GateOne.Example.topUpdateTimer and removes the 'toptop' element
        clearInterval(GateOne.Example.topUpdateTimer);
        GateOne.Example.topUpdateTimer = null;
        GateOne.Utils.removeElement(GateOne.Example.toptop);
    },
    topTop: function(term) {
        /**GateOne.Exampe.topTop(term)

        Displays the top three CPU-hogging processes on the server in real-time (updating every three seconds just like top).
        */
        if (!term) {
            term = localStorage[GateOne.prefs.prefix+'selectedTerminal'];
        }
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix;
        go.Example.toptop = u.getNode('#'+prefix+'toptop');
        if (!go.Example.toptop) {
            // NOTE: Have to set position:static below since GateOne's default CSS says that '<goDiv> .terminal pre' should be position:absolute
            go.Example.toptop = u.createElement('pre', {'id': 'toptop', 'style': {'width': '40em', 'height': '4em', 'position': 'static', 'border': '1px #ccc solid'}});
            go.Example.toptop.innerHTML = 'Loading...';
            go.Visual.widget('Top Top', go.Example.toptop, {'onclose': go.Example.stopTop});
        }
        if (go.Example.topUpdateTimer) {
            // Toptop already present/running.  Stop it
            go.Example.stopTop();
            return;
        }
        // Update the 'top' output every three seconds
        go.Example.topUpdateTimer = setInterval(function() {
            go.SSH.execRemoteCmd(term, 'top -bcn1 | head | tail -n4', go.Example.updateTop, go.Example.stopTop);
        }, 3000);
    },
    generateAuthObject: function(api_key, secret, upn) {
        /**GateOne.Example.generateAuthObject(api_key, secret, upn)

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

})(window);
