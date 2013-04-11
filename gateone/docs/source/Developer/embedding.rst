.. _gateone-embedding:

Embedding Gate One Into Other Applications
==========================================

.. note:: A *much better* interactive tutorial is available in Gate One's 'tests' directory: <gateone dir>/tests/hello_embedded/.  The future of the documentation you're reading is uncertain.

This tutorial will walk you through embedding Gate One into a completely different web application.  It is divided into two parts:

    #. Basics: Embedding Gate One into any web page.
    #. Advanced: API-based authentication, "embedded mode", and customizing *everything*.

We'll assume you have Gate One installed and running with the following settings (in your 10server.conf)::

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

The :js:func:`GateOne.init` function takes a number of optional arguments but for this example all we need is `url`.

.. code-block:: javascript

    GateOne.init({url: "https://your-gateone-server/"});

Put that somewhere in your `window.onload` function and you should see something like this:

.. todo:: Put an example image here and finish this tutorial to be like hello_embedded

API Authentication
------------------
Gate One includes an authentication API that can be used when embedded into other applications.  It allows the application embedding Gate One to pre-authenticate users so they won't have to re-authenticate when their browser connects to the Gate One server.  Here's how it works:

Enable API Authentication
^^^^^^^^^^^^^^^^^^^^^^^^^
Set ``auth = "api"`` in your server.conf:

.. ansi-block::
    :string_escape:

    \x1b[1;34m#\x1b[0m grep "^auth" server.conf
    auth = "api"

Generate an API Key/Secret
^^^^^^^^^^^^^^^^^^^^^^^^^^
.. ansi-block::
    :string_escape:

    \x1b[1;34m#\x1b[0m ./gateone.py --new_api_key
    \x1b[32m[I 120905 14:00:07 gateone:2679]\x1b[0m A new API key has been generated: NDEzMWEwYTdlZTAzNDkxMWIwMDI4YzJmZTk4YzI4OWJjM
    \x1b[32m[I 120905 14:00:07 gateone:2680]\x1b[0m This key can now be used to embed Gate One into other applications.

.. note:: The secret is not output to the terminal to avoid it being captured in session logs.

API keys and secrets are stored in your 20api_keys.conf like so::

    {
        "*": {
            "gateone": {
                "api_keys": {
                    "<API Key>": "<Secret>",
                    "<API Key 2>": "<Secret 2>"
                }
            }
        }
    }

You'll need to have a look at your 20api_keys.conf to see what the 'secret' is:

.. ansi-block::
    :string_escape:

    \x1b[1;34m#\x1b[0m cat settings/20api_keys.conf
    {
        "*": {
            "gateone": {
                "api_keys": {
                    "NDEzMWEwYTdlZTAzNDkxMWIwMDI4YzJmZTk4YzI4OWJjM": "M2U5YTMxMGQ3OWNlNDJlMTg5NmY0NmUyOTk5MWYwYWFiN"
                }
            }
        }
    }

In the above example our API key would be, ``"NDEzMWEwYTdlZTAzNDkxMWIwMDI4YzJmZTk4YzI4OWJjM"`` and our API secret would be, ``"M2U5YTMxMGQ3OWNlNDJlMTg5NmY0NmUyOTk5MWYwYWFiN"``.

.. tip:: You can set the API Key and secret to whatever you like by editing your 20api_keys.conf.  By default they're random, 45-character strings but they can be any combination of characters other than colons and commas--even `Unicode <http://en.wikipedia.org/wiki/Unicode>`_!.  The following is a perfectly valid API key and secret:

    ``"ʕ•ᴥ•ʔ ／人 ◕ ‿‿ ◕ 人＼": "↑ ↑ ↓ ↓ ← → ← → Ⓑ Ⓐ ♥‿♥"``

Generate An Auth Object
^^^^^^^^^^^^^^^^^^^^^^^
The next step is to generate a `JSON <http://en.wikipedia.org/wiki/JSON>`_ object (auth) from your application and pass it to :js:func:`GateOne.init`.  The 'auth' object must contain the following information:

    api_key
        The key that was generated when you ran ``./gateone.py --new_api_key``

    upn
        The username or userPrincipalName (aka UPN) of the user you wish to preauthenticate.

    timestamp
        A JavaScript-style timestamp:  13 characters representing the amount of seconds since the epoch (January 1, 1970)

    signature
        A valid `HMAC <http://en.wikipedia.org/wiki/Hash-based_message_authentication_code>`_ signature that is generated from the api_key, upn, and timestamp (in that order).

    signature_method
        The HMAC signature method that was used to sign the authentication object.  Currently, only HMAC-SHA1 is supported.

    api_version
        The version of Gate One's API authentication to use.  Currently, only '1.0' is valid.

Here's an example 'auth' object:

.. code-block:: javascript

    authobj = {
        'api_key': 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
        'upn': 'joe@company.com',
        'timestamp': '1323391717238',
        'signature': "f6c6c82281f8d56797599aeee01a5e3efab05a63",
        'signature_method': 'HMAC-SHA1',
        'api_version': '1.0'
    }

This object would then be passed to :js:func:`GateOne.init` like so:

.. code-block:: javascript

    GateOne.init({auth: authobj})

Assuming the signature is valid Gate One would then inherently trust that the user connecting over the WebSocket is joe@company.com.

.. note:: Authentication objects (aka "authentication tokens") are only valid within the time frame specified in the :option:`--api_timestamp_window` setting.  They also can't be used more than once (to negate replay attacks).

Example API Authentication Code
-------------------------------
The following are examples demonstrating how to generate valid 'auth' objects in various programming languages.

Python
^^^^^^
.. code-block:: python

    import time, hmac, hashlib, json
    secret = "secret"
    authobj = {
        'api_key': "MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M",
        'upn': "joe@company.com",
        'timestamp': str(int(time.time() * 1000)),
        'signature_method': 'HMAC-SHA1',
        'api_version': '1.0'
    }
    hash = hmac.new(secret, digestmod=hashlib.sha1)
    hash.update(authobj['api_key'] + authobj['upn'] + authobj['timestamp'])
    authobj['signature'] = hash.hexdigest()
    valid_json_auth_object = json.dumps(authobj)

Here's a create_signature() function that can be used as a shortcut to those hash calls above::

    def create_signature(secret, *parts):
        import hmac, hashlib
        hash = hmac.new(secret, digestmod=hashlib.sha1)
        for part in parts:
            hash.update(str(part))
        return hash.hexdigest()

...which could be used like so::

    >>> create_signature(secret, api_key, upn, timestamp)
    'f6c6c82281f8d56797599aeee01a5e3efab05a63'

PHP
^^^
.. code-block:: php

    $secret = 'secret';
    $authobj = array(
        'api_key' => 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
        'upn' => $_SERVER['REMOTE_USER'],
        'timestamp' => time() * 1000,
        'signature_method' => 'HMAC-SHA1',
        'api_version' => '1.0'
    );
    $authobj['signature'] = hash_hmac('sha1', $authobj['api_key'] . $authobj['upn'] . $authobj['timestamp'], $secret);
    $valid_json_auth_object = json_encode($authobj);

Ruby
^^^^
.. code-block:: ruby

    require 'cgi'
    require 'openssl'
    require 'json'
    secret = 'secret'
    authobj = {
        'api_key' => 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
        'upn' => 'joe@company.com',
        'timestamp' => (Time.now.getutc.to_i * 1000).inspect,
        'signature_method' => 'HMAC-SHA1',
        'api_version' => '1.0'
    }
    authobj['signature' = OpenSSL::HMAC.hexdigest('sha1', secret, authobj['api_key'] + authobj['upn'] + authobj['timestamp'])
    valid_json_auth_object = JSON.generate(authobj)

