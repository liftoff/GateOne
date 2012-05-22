.. _gateone-embedding:

Embedding Gate One Into Other Applications, Part 1
==================================================

This tutorial will walk you through embedding Gate One into a completely different web application.  It is divided into two parts:

    #. Basics: Embedding Gate One into any web page.
    #. Advanced: API-based authentication, "embedded mode", and customizing *everything*.

We'll assume you have Gate One installed and running with the following settings (in your server.conf)::

    auth = None # Anonymous authentication
    port = 443
    disable_ssl = False
    origins = "*" # Disable origin checking for now (this will be covered in Part 2)
    url_prefix = "/" # Keep it simple for the tutorial

.. note:: 'origins' is the only setting above that is differs from defaults.

Before we continue please test your Gate One server by loading it in your browser.  This will also ensure that you've accepted the server's SSL certificate (if necessary).

.. warning:: Gate One's SSL certificate must be trusted by clients in order to embed Gate One.  This usually means purchasing an SSL certificate when you move to production.

Placement
---------

You must decide where you want Gate One to appear in your application.  The simplest way to do this is to create a DIV element like so:

.. code-block:: html

    <div id="gateone"></div>

By default `#gateone` will fill itself out to the full size of its parent element.  So it is usually a good idea to wrap it inside of a container which has some explicit dimensions set:

.. code-block:: html

    <div style="width: 60em; height: 30em;">
        <div id="gateone"></div>
    </div>

Include gateone.js
------------------

Before you can initialize Gate One you need to include gateone.js in the web page.  You can, of course, just copy it out of `/opt/gateone/static` and include it in a `<script>` tag somewhere in your web page.  However, to ensure that you're always running the latest version of gateone.js it is recommended that you source the script from the Gate One server itself:

.. code-block:: html

    <script src="https://your-gateone-server/static/gateone.js"></script>

.. tip:: You can also load the script dynamically via JS (if you know how).

Call GateOne.init()
-------------------

The `GateOne.init()` function takes a number of optional arguments but for this example all we need is `goURL`.

.. code-block:: javascript

    GateOne.init({goURL: "https://your-gateone-server/"});

Put that somewhere in your `window.onload` function and you should see something like this:

