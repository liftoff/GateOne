.. _gateone-embedding1:

How To Embed Gate One - Chapter 1
=================================
This part of the tutorial requires that you start your Gate One server using the following settings:

.. code-block:: javascript

    {
        "*": {
            "gateone": {
                // These are what's important for the tutorial:
                "origins": ["*"], // Disable origin checks (insecure but OK for a tutorial)
                "port": 8000, // The examples all use this port
                "url_prefix": "/",
                "auth": "none" // Note: This can be overridden by 20authentication.conf if you put it in 10server.conf
                // These settings are just to avoid conflics with a regular Gate One installation:
                "cache_dir": "/tmp/gateone_tutorial_cache",
                "user_dir": "/var/lib/gateone/users",
                "session_dir": "/tmp/gateone_tutorial",
                "pid_file": "/tmp/gateone_tutorial.pid"
            }
        }
    }

For convenience a `99tutorial_chapter1.conf <../../embedding_configs/99tutorial_chapter1.conf>`_ file has already been created with these settings.  Just copy it into a temporary :option:`settings_dir` before starting Gate One:

.. ansi-block::
    :string_escape:

    # Assuming you downloaded Gate One to /tmp/GateOne...
    \x1b[1;34muser\x1b[0m@host\x1b[1;34m:/tmp/GateOne $\x1b[0m mkdir /tmp/chapter1 && cp gateone/docs/embedding_configs/99tutorial_chapter1.conf /tmp/chapter1/
    \x1b[1;34muser\x1b[0m@host\x1b[1;34m:/tmp/GateOne $\x1b[0m ./run_gateone.py --settings_dir=/tmp/chapter1

Before we continue please test your Gate One server by loading it in your browser.  This will also ensure that you've accepted the server's SSL certificate (if necessary).

.. warning:: Gate One's SSL certificate must be trusted by clients in order to embed Gate One.  In production you can configure Gate One to use the same SSL certificate as the website that has it embedded to avoid that problem.  Just note, for that to work Gate One must be running at the same domain as the website that's embedding it.  So if your website is https://myapp.company.com/ your Gate One server would need to be running on a different port at myapp.company.com (e.g. https://myapp.company.com:8000/).

Placement
---------
Gate One needs to be placed inside an element on the page in order to work properly.  This element will be where Gate One places ``<script>`` tags, preference panels, the toolbar (if enabled), and similar.  Typically all you need is a div:

.. code-block:: html

    <div id="gateone"></div>

By default Gate One will assume you're placing all applications inside this element (aka 'the goDiv' or ``GateOne.node``) so it will set it's style in such a way as to fill up the entirety of it's parent element.  The idea is to make room for things like workspaces and terminals.  For this part of the tutorial we'll place Gate One inside a div that has a fixed width and height and let it fill up that space:

.. code-block:: html

    <div id="gateone_container" style="width: 60em; height: 30em;">
        <div id="gateone"></div>
    </div>

.. note:: You don't have to place terminals (or other Gate One applications) inside the ``#gateone`` container.  More information about that is covered later in this tutorial.

Include gateone.js
------------------
Before you can initialize Gate One on your web page you'll need to include gateone.js.  You *could* just copy it out of Gate One's 'static' directory and include it in a ``<script>`` tag but it's usually a better idea to let Gate One serve up it's own gateone.js.  This ensures that when you upgrade Gate One clients will automatically get the new file (less work).

.. code-block:: html

    <script src="https://your-gateone-server/static/gateone.js"></script>

.. tip:: You can also load the script on-demand via JS (if you know how).  It doesn't use the ``window.onload`` event or similar.

Call GateOne.init()
-------------------
The :js:func:`GateOne.init` function takes some (optional) arguments but for this example all we need is `url`.

.. code-block:: javascript

    GateOne.init({url: "https://your-gateone-server/"});

Put that somewhere in your ``window.onload`` function and Gate One will automatically connect to the server, synchronize-and-load it's JavaScript/CSS, and open the New Workspace Workspace (aka the application selection screen).

Complete Example
----------------
Here's an example of everything described above:

.. code-block:: html

    <!-- Include gateone.js somewhere on your page -->
    <script src="https://gateone.mycompany.com/static/gateone.js"></script>

    <!-- Decide where you want to put Gate One -->
    <div id="gateone_container" style="position: relative; width: 60em; height: 30em;">
        <div id="gateone"></div>
    </div>

    <!-- Call GateOne.init() at some point after the page is done loading -->
    <script>
    window.onload = function() {
        // Initialize Gate One:
        GateOne.init({url: 'https://gateone.mycompany.com/'});
    }
    </script>
    <!-- That's it! -->

Try It
^^^^^^

.. raw:: html

    <div id="gateone_container" style="position: relative; width: 60em; height: 30em;">
        <div id="gateone">
            <form id="go_embed" style="background-color: #fff; color: #000; text-align: center;">
            <p>Enter the URL for your Gate One server and click 'Go!'</p>
            <p>
                <input name="gourl" id="gourl" size=40 placeholder="https://your-gateone-server:8000/" />
                <input type="submit" value="Go!" style="margin-left: .5em;" />
            </p>
            </form>
        </div>
    </div>
    <script>
    var reauthenticate = function() {
        // This will override the GateOne.Net.reauthenticate function so we can let users know that this tutorial only works with anonymous auth
        alert('Your Gate One server is configured to authenticate users.\nThis part of the tutorial only works if authentication is disabled (aka anonymous auth).\n\nPlease configure your Gate One server for anonymous authentication: "./gateone.py --auth=None" or put "auth = None" in your server.conf).\n\nPress OK to reload this page.');
        window.location.reload();
    }
    document.querySelector('#go_embed').onsubmit = function(e) {
        var gourl = document.querySelector('#gourl').value,
            gateone_js = gourl + '/static/gateone.js',
            script = document.createElement('script'), // Dynamically load gateone.js when the user clicks the Go button
            success = function() { // Show the user a nice message.  Obviously you don't need this in your own code :)
                setTimeout(function() { // Wrap in a timeout for dramatic effect
                    GateOne.Visual.displayMessage("Congratulations!<br> You just embedded Gate One <i>without</i> using an iframe!");
                }, 1000);
                // Override reauthenticate() so users aren't left scratching their heads wondering why the page reloads every time they click on the "Go" button if they forgot to set auth to 'none':
                GateOne.Net.reauthenticate = reauthenticate; // Tutorial-only.  Don't do this in your own code.
            };
        e.preventDefault(); // Don't actually submit the form
        localStorage['gourl'] = gourl; // Save this value for later (a convience for the tutorial)
        script.src = gateone_js;
        script.onload = function() {
            // Load Gate One
            GateOne.init({url: gourl, logLevel: 'DEBUG', prefix: 'go1_',}, success); // GateOne.init() can take a callback as a second arg.  Useful knowledge ;)
        }
        document.body.appendChild(script);
    }
    // Pre-populate the server URL form as a convenience for the user (if they already filled it out once before)
    window.addEventListener("load", function() {
        var gourl = localStorage['gourl'];
        if (gourl) {
            document.querySelector('#gourl').value = gourl;
        }
    });
    </script>
