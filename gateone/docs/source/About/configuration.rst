.. _configuration:

Configuration
=============
The first time you execute gateone.py it will create a default configuration file as /opt/gateone/settings/10server.conf:

.. topic:: 10server.conf

    .. code-block:: javascript

        // This is Gate One's main settings file.
        {
            // "gateone" server-wide settings fall under "*"
            "*": {
                "gateone": { // These settings apply to all of Gate One
                    "address": "",
                    "ca_certs": null,
                    "cache_dir": "/tmp/gateone_cache",
                    "certificate": "certificate.pem",
                    "combine_css": "",
                    "combine_css_container": "#gateone",
                    "combine_js": "",
                    "cookie_secret": "Yjg3YmUzOGUxM2Q2NDg3YWI1MTI1YTU3MzVmZTI3YmUzZ",
                    "debug": false,
                    "disable_ssl": false,
                    "embedded": false,
                    "enable_unix_socket": false,
                    "gid": "0",
                    "https_redirect": false,
                    "js_init": "",
                    "keyfile": "keyfile.pem",
                    "locale": "en_US",
                    "log_file_max_size": 100000000,
                    "log_file_num_backups": 10,
                    "log_file_prefix": "/opt/gateone/logs/webserver.log",
                    "log_to_stderr": null,
                    "logging": "info",
                    "origins": [
                        "localhost", "127.0.0.1", "enterprise",
                        "enterprise.example.com", "10.1.1.100"],
                    "pid_file": "/tmp/gateone.pid",
                    "port": 443,
                    "session_dir": "/tmp/gateone",
                    "session_timeout": "5d",
                    "syslog_facility": "daemon",
                    "syslog_host": null,
                    "uid": "0",
                    "unix_socket_path": "/tmp/gateone.sock",
                    "url_prefix": "/",
                    "user_dir": "/opt/gateone/users",
                    "user_logs_max_age": "30d"
                }
            }
        }

.. note:: The settings under "gateone" can appear in any order.

These options match up directly with Gate One's command line options which you can view at any time by executing "gateone.py --help":

.. I had to use actual escape characters below because the :string-escape: option to ansi-block would break on those non-breaking-spaces (non-breaking, get it?  Hah!  I kill me).

.. command-output:: gateone --help

These options are detailed below in the format of:

    |   Name

    .. cmdoption:: --command_line_option

    ::

        Default value as it is defined in the .conf files in the `settings_dir`.

    |   Description

Tornado Framework Options
^^^^^^^^^^^^^^^^^^^^^^^^^
The options below are built-in to the Tornado framework.  Since Gate One uses
Tornado they'll always be present.

log_file_max_size
-----------------
.. cmdoption:: --log_file_max_size=bytes

.. code-block:: javascript

    "log_file_max_size": 104857600 // Which is the result of: 100 * 1024 * 1024

This defines the maximum size of Gate One's web server log file in bytes before it is automatically rotated.

.. note:: Web server log settings don't apply to Gate One's user session logging features.

log_file_num_backups
--------------------
.. cmdoption:: --log_file_num_backups=integer

.. code-block:: javascript

    "log_file_max_size": 10

The maximum number of backups to keep of Gate One's web server logs.

log_file_prefix
---------------
.. cmdoption:: --log_file_prefix=string (file path)

.. code-block:: javascript

    "log_file_prefix": "/opt/gateone/logs/webserver.log"

This is the path where Gate One's web server logs will be kept.

.. note:: If you get an error like this:

    .. ansi-block::

        IOError: [Errno 13] Permission denied: '/opt/gateone/logs/webserver.log'

    It means you need to change this setting to somewhere your user has write access such as `/var/tmp/gateone_logs/webserver.log`.

log_to_stderr
-------------
.. cmdoption:: --log_to_stderr=boolean

.. code-block:: javascript

    "log_to_stderr": False

This option tells Gate One to send web server logs to stderr (instead of to the log file).

logging
-------
.. cmdoption:: --logging=string (info|warning|error|none)

.. code-block:: javascript

    "logging": "info"

Specifies the log level of the web server logs.  The default is "info".  Can be one of, "info", "warning", "error", or "none".

Global Gate One Options
^^^^^^^^^^^^^^^^^^^^^^^
The options below represent settings that are specific to Gate One, globally.
Meaning, they're not tied to specific applications or plugins.

address
-------
.. cmdoption:: --address=string (IPv4 or IPv6 address)

.. code-block:: javascript

    "address": "" // Empty string means listen on all addresses

Specifies the IP address or hostname that Gate One will listen for incoming connections.  Multiple addresses may provided using a semicolon as the separator.  For example::

    "address": "localhost;::1;10.1.1.100" // Listen on localhost, the IPv6 loopback address, and 10.1.1.100

.. seealso:: :option:`--port`

api_keys
--------
.. cmdoption:: --api_keys=string (key1:secret1,key2:secret2,...)

.. code-block:: javascript

    "api_keys": {
        "ZWVkOWJjZ23yNjNlNDQ1YWE3MThiYmI0M72sujFhODFiZ": "NTg5NTllOTIyMD1lNGU1MzkzZDM4NjVkZWNGNDdlN2RmO"
    }

Specifies a list of API keys (key:value pairs) that can be used when performing using Gate One's authentication API.

api_timestamp_window
--------------------
.. cmdoption:: --api_timestamp_window=string (special: [0-9]+[smhd])

.. code-block:: javascript

    "api_timestamp_window": "30s"

This setting controls how long API authentication objects will last before they expire if :option:`--auth` is set to 'api' (default is 30 seconds).  It accepts the following <num><character> types:

    =========   ======= ===================
    Character   Meaning Example
    =========   ======= ===================
    s           Seconds '60s' ➡ 60 Seconds
    m           Minutes '5m'  ➡ 5 Minutes
    h           Hours   '24h' ➡ 24 Hours
    d           Days    '7d'   ➡ 7 Days
    =========   ======= ===================

.. note:: If the value is too small clock drift between the Gate One server and the web server embedding it can cause API authentication to fail.  If the setting is too high it provides a greater time window in which an attacker can re-use that token in the event the Gate One server is restarted.  **Important:** Gate One keeps track of used authentication objects but only in memory.  If the server is restarted there is a window in which an API authentication object can be re-used (aka an authentication replay attack).  That is why you want the api_timestamp_window to be something short but not too short as to cause problems if a clock gets a little out of sync.

auth
----
.. cmdoption:: --auth=string (none|pam|google|kerberos|api)

.. code-block:: javascript

    "auth": "none"

Specifies how you want Gate One to authenticate clients.  One of, "none", "pam", "google", "kerberos", or "api".

ca_certs
--------
.. cmdoption:: --ca_certs=string (file path)

.. code-block:: javascript

    "ca_certs": "/opt/gateone/ca_certs.pem" // Default is None

Path to a file containing any number of concatenated CA certificates in PEM format. They will be used to authenticate clients if the :option:`--ssl_auth` option is set to 'optional' or 'required'.

cache_dir
---------
.. cmdoption:: --cache_dir=string (directory path)

.. code-block:: javascript

    "cache_dir": "/tmp/gateone_cache"

Path to a directory where Gate One will cache temporary information (for performance/memory reasons).  Mostly for things like templates, JavaScript, and CSS files that have been rendered and/or minified.

certificate
-----------
.. cmdoption:: --certificate=string (file path)

.. code-block:: javascript

    "certificate": "/etc/gateone/ssl/certificate.pem"

The path to the SSL certificate Gate One will use in its web server.

.. note:: The file must be in PEM format.

combine_css
-----------
.. cmdoption:: --combine_css=string (file path)

This option tells Gate One to render and combine all its CSS files into a single file (i.e. so you can deliver it via some other web server/web cache/CDN).  The file will be saved at the provided path.

combine_css_container
---------------------
.. cmdoption:: --combine_css_container=string (e.g. 'gateone')

When combining CSS into a single file, this option specifies the name of the '#gateone' container element (if something else).  It is used when rendering CSS templates.

combine_js
----------
.. cmdoption:: --combine_js=string (file path)

This option tells Gate One to combine all its JavaScript files into a single file (i.e. so you can deliver it via some other web server/web cache/CDN).  The file will be saved at the provided path.

command
-------
.. cmdoption:: --command=string (program path)

.. deprecated:: 1.2

    This option has been replaced by the Terminal application's 'commands' option which supports multiple.  See :ref:`terminal-configuration`.

config
------
.. cmdoption:: --config=string (file path)

.. deprecated:: 1.2

    This option has been replaced by the :option:`--settings_dir` option.

cookie_secret
-------------
.. cmdoption:: --cookie_secret=string ([A-Za-z0-9])

.. code-block:: javascript

    "cookie_secret": "A45CharacterStringGeneratedAtRandom012345678" // NOTE: Yours will be different ;)

This is a 45-character string that Gate One will use to encrypt the cookie stored at the client.  By default Gate One will generate one at random when it runs for the first time.  Only change this if you know what you're doing.

.. note:: If you change this string in the 10server.conf you'll need to restart Gate One for the change to take effect.

.. admonition:: What happens if you change it

    All users existing, unexpired sessions will need to be re-authenticated.  When this happens the user will be presented with a dialog box that informs them that the page hosting Gate One will be reloaded automatically when they click "OK".

.. tip:: You may have to change this key at a regular interval throughout the year depending on your compliance needs.  Every few months is probably not a bad idea regardless.

debug
-----
.. cmdoption:: --debug=boolean

.. code-block:: javascript

    "debug": false

Turns on Tornado's debug mode:  If a change is made to any Python code while :program:`gateone.py` is running it will automatically restart itself.  Cached templates will also be regenerated.

disable_ssl
-----------
.. cmdoption:: --disable_ssl=boolean

.. code-block:: javascript

    "disable_ssl": false

Disables SSL support in Gate One.  Generally not a good idea unless you know what you're doing.  There's really only two reasons why you'd want to do this:

 * Gate One will be running behind a proxy server that handles the SSL encryption.
 * Gate One will only be connected to via localhost (kiosks, console devices, etc).

embedded
--------
.. cmdoption:: --embedded=boolean

.. code-block:: javascript

    "embedded": false

This option is available to applications, plugins, and CSS themes/templates (if desired).  It is unused by Gate One proper but can be used at your discretion when embedding Gate One.

.. note:: This isn't the same thing as "embedded mode" in the JavaScript code.  See :ref:`GateOne.prefs.embedded <gateone-embedding>` in :ref:`gateone-javascript`.

enable_unix_socket
------------------
.. cmdoption:: --enable_unix_socket=boolean

.. code-block:: javascript

    "enable_unix_socket": false

Tells Gate One to listen on a `Unix socket <http://en.wikipedia.org/wiki/Unix_domain_socket>`_.  The path to said socket is defined in :option:`--unix_socket_path`.

gid
---
.. cmdoption:: --gid=string

.. code-block:: javascript

    "gid": "0" // You could also put "root", "somegroup", etc

If run as root, Gate One will drop privileges to this group/gid after starting up.  Default: 0 (aka root)

https_redirect
--------------
.. cmdoption:: --https_redirect

.. code-block:: javascript

    "https_redirect": false

If https_redirect is enabled, Gate One will listen on port 80 and redirect incoming connections to Gate One's configured port using HTTPS.

js_init
-------
.. cmdoption:: --js_init=string (JavaScript Object)

.. code-block:: javascript

    "js_init": ""

This option can be used to pass parameters to the GateOne.init() function whenever Gate One is opened in a browser.  For example:

.. code-block:: javascript

    "js_init": "{'theme': 'white', 'fontSize': '120%'}"

For a list of all the possible options see :attr:`GateOne.prefs` in the :ref:`developer-docs` under :ref:`gateone-javascript`.

.. note::  This setting will only apply if you're *not* using embedded mode.

keyfile
-------
.. cmdoption:: --keyfile=string (file path)

.. code-block:: javascript

    "keyfile": "/etc/gateone/ssl/keyfile.pem"

The path to the SSL key file Gate One will use in its web server.

.. note:: The file must be in PEM format.

locale
------
.. cmdoption:: --locale=string (locale string)

.. code-block:: javascript

    "locale": "en_US"

This option tells Gate One which local translation (native language) to use when rendering strings.  The first time you run Gate One it will attempt to automatically detect your locale using the `$LANG` environment variable.  If this variable is not set it will fall back to using `en_US`.

.. note:: If no translation exists for your local the English strings will be used.

new_api_key
-----------
.. cmdoption:: --new_api_key

This command line option will generate a new, random API key and secret for use with applications that will be embedding Gate One.  Instructions on how to use API-based authentication can be found in the :ref:`gateone-embedding`.

.. note:: By default generated API keys are placed in ``<settings_dir>/20api_keys.conf``.

origins
-------
.. cmdoption:: --origins=string (semicolon-separated origins)

.. code-block:: javascript

    "origins": ["localhost", "127.0.0.1", "enterprise", "enterprise\\..*.com", "10.1.1.100"]

.. note:: The way you pass origins on the command line is very different from how they are stored in 10server.conf.  The CLI option uses semicolons to delineate origins whereas the 10server.conf contains an actual JSON array.

By default Gate One will only allow connections from web pages that match the configured origins.  If a user is denied access based on a failed origin check a message will be logged like so:

.. ansi-block::
    :string_escape:

    \x1b[1;32m[I 120831 15:32:12 gateone:1043]\x1b[0m WebSocket closed (ANONYMOUS).
    \x1b[1;31m[E 120831 15:32:17 gateone:943]\x1b[0m Access denied for origin: https://somehost.company.com

.. note:: Origins do not contain protocols/schemes, paths, or trailing slashes!

.. warning:: If you see unknown origins the logs it could be an attacker trying to steal your user's sessions!  The origin that appears in the log will be the hostname that was used to connect to the Gate One server.  This information can be used to hunt down the attacker.  Of course, it could just be that a new IP address or hostname has been pointed to your Gate One server and you have yet to add it to the :option:`--origins` setting ☺.

pam_realm
---------
.. cmdoption:: --pam_realm=string (hostname)

.. code-block:: javascript

    "pam_realm": "somehost"

If :option:`--auth` is set to "pam" Gate One will present this string in the BASIC auth dialog (essentially, the login dialog will say, "REALM: <pam_realm>").  Also, the user's directory will be created in :option:`--user_dir` as `user@<pam_realm>`.  Make sure to use path-safe characters!

pam_service
-----------
.. cmdoption:: --pam_service=string

.. code-block:: javascript

    "pam_service": "login"

If :option:`--auth` is set to "pam", tells Gate One which PAM service to use when authenticating clients.  Defaults to 'login' which is typically configured via `/etc/pam.d/login`.

.. tip:: You can change this to "gateone" and create a custom PAM config using whatever authentication back-end you want.  Just set it as such and create `/etc/pam.d/gateone` with whatever PAM settings you like.

pid_file
--------
.. cmdoption:: --pid_file=string

.. code-block:: javascript

    "pid_file": "/var/run/gateone.pid"

The path to Gate One's `PID <http://en.wikipedia.org/wiki/Process_identifier>`_ file.

.. note:: If you're not running Gate One as root it's possible to get an error like this:

    .. ansi-block::

        IOError: [Errno 13] Permission denied: '/var/run/gateone.pid'

    This just means you need to change this setting to point somewhere your user has write access such as `/tmp/gateone.pid`.

port
----
.. cmdoption:: --port=integer (1-65535)

.. code-block:: javascript

    "port": 443

The port Gate One should listen for connections.

.. note:: Gate One must started as root to utilize ports 1-1024.

.. tip:: If you set :option:`--uid` and/or :option:`--gid` to something other than "0" (aka root) Gate One will drop privileges to that user/group after it starts.  This will allow the use of ports under 1024 while maintaining security best practices by running as a user/group with lesser privileges.

session_dir
-----------
.. cmdoption:: --session_dir=string (file path)

.. code-block:: javascript

    "session_dir": "/tmp/gateone"

The path where Gate One should keep temporary user session information.  Defaults to ``/tmp/gateone`` (will be auto-created if not present).

session_timeout
---------------
.. cmdoption:: --session_timeout=string (special: [0-9]+[smhd])

.. code-block:: javascript

    "session_timeout": "5d"

This setting controls how long Gate One will wait before force-killing a user's disconnected session (i.e. where the user hasn't used Gate One in, say, "5d").  It accepts the following <num><character> types:

    =========   ======= ===================
    Character   Meaning Example
    =========   ======= ===================
    s           Seconds '60s' ➡ 60 Seconds
    m           Minutes '5m'  ➡ 5 Minutes
    h           Hours   '24h' ➡ 24 Hours
    d           Days    '7d'   ➡ 7 Days
    =========   ======= ===================

.. note:: Even if you're using :option:`--dtach` all programs associated with the user's session will be terminated when the timeout is reached.

ssl_auth
---------
.. cmdoption:: --ssl_auth=string (None|optional|required)

.. code-block:: javascript

    "ssl_auth": "none"

If set to 'required' or 'optional' this setting will instruct Gate One to authenticate client-side SSL certificates.  This can be an excellent added layer of security on top of Gate One's other authentication options.  Obviously, only the 'required' setting adds this protection.  If set to 'optional' it merely adds information to the logs.

.. note:: This option must be set to 'required' if :option:`--auth` is set to "ssl".  The two together allow you to use SSL certificates as a single authentication method.

sso_realm
---------
.. cmdoption:: --sso_realm=string (Kerberos realm or Active Directory domain)

.. code-block:: javascript

    "sso_realm": "EXAMPLE.COM"

If :option:`--auth` is set to "kerberos", tells Gate One which Kerberos realm or Active Directory domain to use when authenticating users.  Otherwise this setting will be ignored.

.. note:: SSO stands for Single Sign-On.

sso_service
-----------
.. cmdoption:: --sso_service=string (kerberos service name)

.. code-block:: javascript

    "sso_service": "HTTP"

If :option:`--auth` is set to "kerberos", tells Gate One which Kerberos service to use when authenticating clients.  This is the 'service/' part of a principal or servicePrincipalName (e.g. **HTTP**/somehost.example.com).

.. note:: Unless you *really* know what you're doing do not use anything other than HTTP (in all caps).

syslog_facility
---------------
.. cmdoption:: --syslog_facility=string (auth|cron|daemon|kern|local0|local1|local2|local3|local4|local5|local6|local7|lpr|mail|news|syslog|user|uucp)

.. code-block:: javascript

    "syslog_facility": "daemon"

if :option:`--syslog_session_logging` is set to `True`, specifies the syslog facility that user session logs will use in outgoing syslog messages.

uid
---
.. cmdoption:: --uid=string

.. code-block:: javascript

    "uid": "0" // You could also put "root", "someuser", etc

If run as root, Gate One will drop privileges to this user/uid after starting up.  Default: 0 (aka root)

unix_socket_path
----------------
.. cmdoption:: --unix_socket_path=string (file path)

.. code-block:: javascript

    "unix_socket_path": "/tmp/gateone.sock"

Path to the Unix socket (if :option:`--enable_unix_socket` is "true").

url_prefix
----------
.. cmdoption:: --url_prefix=string (e.g. "/ssh/")

.. code-block:: javascript

    "url_prefix": "/"

This specifies the URL path Gate One will live when it is accessed from a browser.  By default Gate One will use "/" as its base URL; this means that you can connect to it using a URL like so:  https://mygateone.company.com/

That "/" at the end of the above URL is what the ``url_prefix`` is specifying.  If you wanted your Gate One server to live at https://mygateone.company.com/gateone/ you could set ``url_prefix="/gateone/"``.

.. note:: This feature was added for users running Gate One behind a reverse proxy so that many apps (like Gate One) can all live behind a single base URL.

.. tip:: If you want to place your Gate One server on the Internet but don't want it to be easily discovered/enumerated you can specify a random string as the gateone prefix like ``url_prefix="/fe34b0e0c074f486c353602/"``.  Then only those who have been made aware of your obfuscated URL will be able to access your Gate One server (at https://gateone.company.com/fe34b0e0c074f486c353602/ ☺)

.. _user_dir:

user_dir
--------
.. cmdoption:: --user_dir=string (file path)

.. code-block:: javascript

    "user_dir": "/var/lib/gateone/users"

Specifies the location where persistent user files will be kept.  Things like session logs, ssh files (known_hosts, keys, etc), and similar are stored here.

user_logs_max_age
-----------------
.. cmdoption:: --user_logs_max_age=string (special: [0-9]+[smhd])

.. code-block:: javascript

    "user_dir": "30d"

This setting controls how long Gate One will wait before old user session logs are cleaned up.  It accepts the following <num><character> types:

    =========   ======= ===================
    Character   Meaning Example
    =========   ======= ===================
    s           Seconds '60s' ➡ 60 Seconds
    m           Minutes '5m'  ➡ 5 Minutes
    h           Hours   '24h' ➡ 24 Hours
    d           Days    '7d'   ➡ 7 Days
    =========   ======= ===================

.. note:: This is *not* a Terminal-specific setting.  Other applications can and will use user session logs directory (``<user_dir>/logs``).

version
-------
.. cmdoption:: --version

Displays the current Gate One version as well as the version information of any installed applications.  Example:

.. ansi-block::

    [1;31mroot[0m@host[1;34m:~ $[0m gateone --version
    [1mGate One:[0m
         Version: 1.2.0 (20140226213756)
    [1mInstalled Applications:[0m
         Terminal Version: 1.2
         X11 Version: 1.0

Terminal Application Options
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The options below are specific (and supplied by) the Terminal application.

dtach
-----
.. cmdoption:: --dtach=boolean

.. code-block:: javascript

    "dtach": true

This feature is special:  It enables Gate One to be restarted (think: upgraded) without losing user's connected sessions.  This option is enabled by default.

If dtach support is enabled but the dtach command cannot be found Gate One will output a warning message in the log.

.. note:: If you ever need to restart Gate One (and dtach support is enabled) users will be shown a message indicating that they have been disconnected and their browsers should automatically reconnect in 5 seconds.  A 5-second maintenance window ain't bad!

kill
----
.. cmdoption:: --kill

If running with dtach support, this will kill all user's running terminal applications.  Giving everyone a fresh start, as it were.

session_logging
---------------
.. cmdoption:: --session_logging

.. code-block:: javascript

    session_logging = True

This tells Gate One to enable server-side logging of user terminal sessions.  These logs can be viewed or played back (like a video) using the :ref:`log_viewer` application.

.. note:: Gate One stores logs of user sessions in the location specified in the :option:`--user_dir` option.

syslog_session_logging
----------------------
.. cmdoption:: --syslog_session_logging

.. code-block:: javascript

    "syslog_session_logging": false

This option tells Gate One to send logs of user sessions to the host's syslog daemon.  Special characters and escape sequences will be sent as-is so it is up to the syslog daemon as to how to handle them.  In most cases you'll wind up with log lines that look like this:

.. ansi-block::

    Oct  1 19:18:22 gohost gateone: ANONYMOUS 1: Connecting to: ssh://user@somehost:22
    Oct  1 19:18:22 gohost gateone: ANONYMOUS 1: #033]0;user@somehost#007
    Oct  1 19:18:22 gohost gateone: ANONYMOUS 1: #033]_;ssh|user@somehost:22#007

.. note:: This option enables centralized logging if your syslog daemon is configurd to use a remote log host.
