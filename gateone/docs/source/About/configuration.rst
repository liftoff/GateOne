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
                    "origins": ["localhost", "127.0.0.1", "enterprise.lan", "enterprise", "enterprise.example.com", "10.1.1.100"],
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

.. ansi-block::

    [1;31mroot[0m@host[1;34m:~ $[0m ./gateone.py --help
    Usage: ./gateone.py [OPTIONS]

    Options:
      --help                           show this help information
      --log_file_max_size              max size of log files before rollover
      --log_file_num_backups           number of log files to keep
      --log_file_prefix=PATH           Path prefix for log files. Note that if you are running multiple tornado processes, log_file_prefix must be different for each of them (e.g. include the port number)
      --log_to_stderr                  Send log output to stderr (colorized if possible). By default use stderr if --log_file_prefix is not set and no other logging is configured.
      --logging=debug|info|warning|error|none Set the Python log level. If 'none', tornado won't touch the logging configuration.
    ./gateone.py
      --address                        Run on the given address.  Default is all addresses (IPv6 included).  Multiple address can be specified using a semicolon as a separator (e.g. '127.0.0.1;::1;10.1.1.100').
      --auth                           Authentication method to use.  Valid options are: none, api, google, kerberos, pam
      --certificate                    Path to the SSL certificate.  Will be auto-generated if none is provided.
      --command                        Run the given command when a user connects (e.g. '/bin/login').
      --config                         Path to the config file.  Default: /opt/gateone/server.conf
      --cookie_secret                  Use the given 45-character string for cookie encryption.
      --debug                          Enable debugging features such as auto-restarting when files are modified.
      --disable_ssl                    If enabled, Gate One will run without SSL (generally not a good idea).
      --dtach                          Wrap terminals with dtach. Allows sessions to be resumed even if Gate One is stopped and started (which is a sweet feature).
      --embedded                       Doesn't do anything (yet).
      --enable_unix_socket             Enable Unix socket support use_unix_sockets (if --enable_unix_socket=True).
      --https_redirect                 If enabled, a separate listener will be started on port 80 that redirects users to the configured port using HTTPS.
      --js_init                        A JavaScript object (string) that will be used when running GateOne.init() inside index.html.  Example: --js_init="{scheme: 'white'}" would result in GateOne.init({scheme: 'white'})
      --keyfile                        Path to the SSL keyfile.  Will be auto-generated if none is provided.
      --kill                           Kill any running Gate One terminal processes including dtach'd processes.
      --locale                         The locale (e.g. pt_PT) Gate One should use for translations.  If not provided, will default to $LANG (which is 'en_US' in your current shell), or en_US if not set.
      --new_api_key                    Generate a new API key that an external application can use to embed Gate One.
      --origins                        A semicolon-separated list of origins you wish to allow access to your Gate One server over the WebSocket.  This value must contain the hostnames and FQDNs (e.g. foo;foo.bar;) users will use to connect to your Gate One server as well as the hostnames/FQDNs of any sites that will be embedding Gate One. Here's the default on your system: 'localhost;yourhostname'. Alternatively, '*' may be  specified to allow access from anywhere.
      --pam_realm                      Basic auth REALM to display when authenticating clients.  Default: hostname.  Only relevant if PAM authentication is enabled.
      --pam_service                    PAM service to use.  Defaults to 'login'. Only relevant if PAM authentication is enabled.
      --port                           Run on the given port.
      --session_dir                    Path to the location where session information will be stored.
      --session_logging                If enabled, logs of user sessions will be saved in <user_dir>/<user>/logs.  Default: Enabled
      --session_timeout                Amount of time that a session should be kept alive after the client has logged out.  Accepts <num>X where X could be one of s, m, h, or d for seconds, minutes, hours, and days.  Default is '5d' (5 days).
      --sso_realm                      Kerberos REALM (aka DOMAIN) to use when authenticating clients. Only relevant if Kerberos authentication is enabled.
      --sso_service                    Kerberos service (aka application) to use. Defaults to HTTP. Only relevant if Kerberos authentication is enabled.
      --syslog_facility                Syslog facility to use when logging to syslog (if syslog_session_logging is enabled).  Must be one of: auth, cron, daemon, kern, local0, local1, local2, local3, local4, local5, local6, local7, lpr, mail, news, syslog, user, uucp.  Default: daemon
      --syslog_host                    Remote host to send syslog messages to if syslog_logging is enabled.  Default: None (log to the local syslog daemon directly).  NOTE:  This setting is required on platforms that don't include Python's syslog module.
      --syslog_session_logging         If enabled, logs of user sessions will be written to syslog.
      --unix_socket_path               Run on the given socket file.  Default: /var/run/gateone.sock
      --url_prefix                     An optional prefix to place before all Gate One URLs. e.g. '/gateone/'.  Use this if Gate One will be running behind a reverse proxy where you want it to be located at some sub-URL path.
      --user_dir                       Path to the location where user files will be stored.

These options are detailed below in the format of:

    |   Name

    .. cmdoption:: --command_line_option

    ::

        Default value as it is defined in server.conf

    |   Description

log_file_max_size
-----------------
.. cmdoption:: --log_file_max_size=bytes

::

    log_file_max_size = 104857600 # Which is the result of: 100 * 1024 * 1024

This defines the maximum size of Gate One's web server log file in bytes before it is automatically rotated.

.. note:: Web server log settings don't apply to Gate One's user session logging features.

log_file_num_backups
--------------------
.. cmdoption:: --log_file_num_backups=integer

::

    log_file_max_size = 10

The maximum number of backups to keep of Gate One's web server logs.

log_file_prefix
---------------
.. cmdoption:: --log_file_prefix=string (file path)

::

    log_file_prefix = "/opt/gateone/logs/webserver.log"

This is the path where Gate One's web server logs will be kept.

.. note:: If you get an error like this:

    .. ansi-block::

        IOError: [Errno 13] Permission denied: '/opt/gateone/logs/webserver.log'

    It means you need to change this setting to somewhere your user has write access such as `/var/tmp/gateone_logs/webserver.log`.

log_to_stderr
-------------
.. cmdoption:: --log_to_stderr=boolean

::

    log_to_stderr = False

This option tells Gate One to send web server logs to stderr (instead of to the log file).

logging
-------
.. cmdoption:: --logging=string (info|warning|error|none)

::

    logging = "info"

Specifies the log level of the web server logs.  The default is "info".  Can be one of, "info", "warning", "error", or "none".

address
-------
.. cmdoption:: --address=string (IPv4 or IPv6 address)

::

    address = "" # Empty string means listen on all addresses

Specifies the IP address or hostname that Gate One will listen for incoming connections.  Multiple addresses may provided using a semicolon as the separator.  For example::

    address = "localhost;::1;10.1.1.100" # Listen on localhost, the IPv6 loopback address, and 10.1.1.100

.. seealso:: :option:`--port`

api_timestamp_window
--------------------
.. cmdoption:: --api_timestamp_window=string (special: [0-9]+[smhd])

::

    api_timestamp_window = "30s"

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

::

    auth = None # NOTE: "none" (in quotes) also works.

Specifies how you want Gate One to authenticate clients.  One of, "none", "pam", "google", "kerberos", or "api".

ca_certs
--------
.. cmdoption:: --ca_certs=string (file path)

::

    ca_certs = "/opt/gateone/ca_certs.pem" # Default is None

Path to a file containing any number of concatenated CA certificates in PEM format. They will be used to authenticate clients if the :option:`--ssl_auth` option is set to 'optional' or 'required'.

certificate
-----------
.. cmdoption:: --certificate=string (file path)

::

    certificate = "/opt/gateone/certificate.pem" # NOTE: The actual default is "<path to gateone>/certificate.pem"

The path to the SSL certificate Gate One will use in its web server.

.. note:: The file must be in PEM format.

command
-------
.. cmdoption:: --command=string (program path)

::

    command = "/opt/gateone/plugins/ssh/scripts/ssh_connect.py -S '/tmp/gateone/%SESSION%/%r@%h:%p' -a '-oUserKnownHostsFile=%USERDIR%/%USER%/known_hosts'"
    # NOTE: The actual default is "<path to gateone>/plugins/ssh/scripts/ssh_connect.py ..."

This option specifies the command Gate One will run whenever a new terminal is opened.  The default is for Gate One to run the ssh_connect.py script.  Any interactive terminal application should work (e.g. 'nethack').

Optionally, you may provide any mixture of the following %VALUE% variables which will be automatically replaced with their respective values:

    ==============  =====================   =============================================
    %VALUE%         Replacement             Example Value
    ==============  =====================   =============================================
    %SESSION%       *User's session ID*     MDM1NTQyZmFjZGQzNDE5MGEwN2UxMTY4NmUxYzE3YzI0Z
    %SESSION_HASH%  *short_hash(session)*   ZDmKJQAAAAA
    %USERDIR%       *user_dir setting*      /opt/gateone/users
    %USER%          *user*                  `user@company.com`
    %TIME%          *timestamp (now)*       1346435380577
    ==============  =====================   =============================================

Additionally,the following environment variables will be set before executing the 'command':

    =========================   =============================================
    Variable                    Example Value
    =========================   =============================================
    :envvar:`$GO_SESSION`       MDM1NTQyZmFjZGQzNDE5MGEwN2UxMTY4NmUxYzE3YzI0Z
    :envvar:`$GO_SESSION_DIR`   /tmp/gateone
    :envvar:`$GO_TERM`          1
    :envvar:`$GO_USER`          `user@company.com`
    :envvar:`$GO_USER_DIR`      /opt/gateone/users
    =========================   =============================================

.. tip::  You can write a shell script to wrap whatever program you want to pass it the above variables as command line arguments: ``/path/to/program --user=$GO_USER``

config
------
.. cmdoption:: --config=string (file path)

You may use this option to specify an alternate configuration file (Default: <path to gateone>/server.conf).

cookie_secret
-------------
.. cmdoption:: --cookie_secret=string ([A-Za-z0-9])

::

    cookie_secret = "A45CharacterStringGeneratedAtRandom012345678" # NOTE: Yours will be different ;)

This is a 45-character string that Gate One will use to encrypt the cookie stored at the client.  By default Gate One will generate one at random when it runs for the first time.  Only change this if you know what you're doing.

.. note:: If you change this string in the server.conf you'll need to restart Gate One for the change to take effect.

.. admonition:: What happens if you change it

    All users existing, unexpired sessions will need to be re-authenticated.  When this happens the user will be presented with a dialog box that informs them that the page hosting Gate One will be reloaded automatically when they click "OK".

.. tip:: You may have to change this key at a regular interval throughout the year depending on your compliance needs.  Every few months is probably not a bad idea regardless.

debug
-----
.. cmdoption:: --debug=boolean

::

    debug = False

Turns on Tornado's debug mode:  If a change is made to any Python code while :program:`gateone.py` is running it will automatically restart itself.  Cached templates will also be regenerated.

disable_ssl
-----------
.. cmdoption:: --disable_ssl=boolean

::

    disable_ssl = False

Disables SSL support in Gate One.  Generally not a good idea unless you know what you're doing.  There's really only two reasons why you'd want to do this:

 * Gate One will be running behind a proxy server that handles the SSL encryption.
 * Gate One will only be connected to via localhost (kiosks, console devices, etc).

dtach
-----
.. cmdoption:: --dtach=boolean

::

    dtach = True

This feature is special:  It enables Gate One to be restarted (think: upgraded) without losing user's connected sessions.  This option is enabled by default.

If dtach support is enabled but the dtach command cannot be found Gate One will output a warning message in the log.

.. note:: If you ever need to restart Gate One (and dtach support is enabled) users will be shown a message indicating that they have been disconnected and their browsers should automatically reconnect in 5 seconds.  A 5-second maintenance window ain't bad!

enable_unix_socket
------------------
.. cmdoption:: --enable_unix_socket=boolean

::

    enable_unix_socket = False

Tells Gate One to listen on a `Unix socket <http://en.wikipedia.org/wiki/Unix_domain_socket>`_.  The path to said socket is defined in :option:`--unix_socket_path`.

embedded
--------
.. cmdoption:: --embedded=boolean

::

    embedded = False

This option doesn't do anything at the moment.  In the future it may be used to change the behavior of Gate One's server-side behavior.

.. note:: This isn't the same thing as "embedded mode" in the JavaScript code.  See :ref:`GateOne.prefs.embedded <embedded-mode>` in :ref:`gateone-javascript`.

gid
---
.. cmdoption:: --gid=string

::

    gid = "0" # You could also put "root"

If run as root, Gate One will drop privileges to this group/gid after starting up.  Default: 0 (aka root)

https_redirect
--------------
.. cmdoption:: --https_redirect

::

    https_redirect = False

If https_redirect is enabled, Gate One will listen on port 80 and redirect incoming connections to Gate One's configured port using HTTPS.

js_init
-------
.. cmdoption:: --js_init=string (JavaScript Object)

::

    js_init = ""

This option can be used to pass parameters to the GateOne.init() function whenever Gate One is opened in a browser.  For example::

    js_init = "{'theme': 'white', 'fontSize': '120%'}"

For a list of all the possible options see :attr:`GateOne.prefs` in the :ref:`developer-docs` under :ref:`gateone-properties`.

.. note::  This setting will only apply if you're *not* using embedded mode.

keyfile
-------
.. cmdoption:: --keyfile=string (file path)

::

    keyfile = "/opt/gateone/keyfile.pem" # NOTE: The actual default is "<path to gateone>/keyfile.pem"

The path to the SSL key file Gate One will use in its web server.

.. note:: The file must be in PEM format.

kill
----
.. cmdoption:: --kill

::

    # It would be silly to set this in server.conf--but you could!  Gate One wouldn't start but hey, whatever floats your boat!

If running with dtach support, this will kill all user's running terminal applications.  Giving everyone a fresh start, as it were.

locale
------
.. cmdoption:: --locale=string (locale string)

::

    locale = "en_US"

This option tells Gate One which local translation (native language) to use when rendering strings.  The first time you run Gate One it will attempt to automatically detect your locale using the `$LANG` environment variable.  If this variable is not set it will fall back to using `en_US`.

.. note:: If no translation exists for your local the English strings will be used.

origins
-------
.. cmdoption:: --origins=string (semicolon-separated origins)

::

    origins = "http://localhost;https://localhost;http://127.0.0.1;https://127.0.0.1;https://yourhostname;https://yourhostname:8080"

By default Gate One will only allow connections from web pages that match the configured origins.  If a user is denied access based on a failed origin check a message will be logged like so:

.. ansi-block::
    :string_escape:

    \x1b[1;32m[I 120831 15:32:12 gateone:1043]\x1b[0m WebSocket closed (ANONYMOUS).
    \x1b[1;31m[E 120831 15:32:17 gateone:943]\x1b[0m Access denied for origin: https://somehost.company.com

.. note:: Origins do not contain paths or trailing slashes!

.. warning:: If you see unknown origins the logs it could be an attacker trying to steal your user's sessions!  The origin that appears in the log will be the base URL that was used to connect to the Gate One server.  This information can be used to hunt down the attacker.  Of course, it could just be that a new IP address or hostname has been pointed to your Gate One server and you have yet to add it to the :option:`--origins` setting ☺.

new_api_key
-----------
.. cmdoption:: --new_api_key

This command line option will generate a new, random API key and secret for use with applications that will be embedding Gate One.  Instructions on how to use API-based authentication can be found in the :ref:`gateone-embedding`.

pam_realm
---------
.. cmdoption:: --pam_realm=string (hostname)

::

    sso_realm = "somehost"

If :option:`--auth` is set to "pam" Gate One will present this string in the BASIC auth dialog (essentially, the login dialog will say, "REALM: <pam_realm>").  Also, the user's directory will be created in :option:`--user_dir` as `user@<pam_realm>`.

pam_service
-----------
.. cmdoption:: --pam_service=string

::

    pam_service = "login"

If :option:`--auth` is set to "pam", tells Gate One which PAM service to use when authenticating clients.  Defaults to 'login' which is typically controlled by `/etc/pam.d/login`.

.. tip:: You can change this to "gateone" and create a custom PAM config using whatever authentication back-end you want.  Just set it as such and create `/etc/pam.d/gateone` with whatever PAM settings you like.

pid_file
--------
.. cmdoption:: --pid_file=string

::

    pid_file = "/var/run/gateone.pid"

The path to Gate One's `PID <http://en.wikipedia.org/wiki/Process_identifier>`_ file.

.. note:: If you're not running Gate One as root you'll likely get an error like this:

    .. ansi-block::

        IOError: [Errno 13] Permission denied: '/var/run/gateone.pid'

    This just means you need to change this setting to point somewhere your user has write access such as `/tmp/gateone.pid`.

port
----
.. cmdoption:: --port=integer (1-65535)

::

    port = 443

The port Gate One should listen for connections.

.. note:: Gate One must run as root to utilize ports 1-1024.

.. tip:: If you set :option:`--uid` and/or :option:`--gid` to something other than "0" (aka root) Gate One will drop privileges to that user/group after it starts up.  This will allow the use of ports under 1024 while still maintaining reasonable security by running as a user/group with lesser privileges.

session_dir
-----------
.. cmdoption:: --session_dir=string (file path)

::

    session_dir = "/tmp/gateone"

The path where Gate One should keep temporary user session information.  Defaults to /tmp/gateone (will be auto-created if not present).

session_logging
---------------
.. cmdoption:: --session_logging

::

    session_logging = True

This tells Gate One to enable server-side logging of user terminal sessions.  These logs can be viewed or played back (like a video) using the :ref:`log_viewer` application.

.. note:: Gate One stores logs of user sessions in the location specified in the :option:`--user_dir` option.

session_timeout
---------------
.. cmdoption:: --session_timeout=string (special: [0-9]+[smhd])

::

    session_timeout = "5d"

This setting controls how long Gate One will wait before force-killing a user's disconnected session (i.e. where the user hasn't used Gate One in, say, "5d").  It accepts the following <num><character> types:

    =========   ======= ===================
    Character   Meaning Example
    =========   ======= ===================
    s           Seconds '60s' ➡ 60 Seconds
    m           Minutes '5m'  ➡ 5 Minutes
    h           Hours   '24h' ➡ 24 Hours
    d           Days    '7d'   ➡ 7 Days
    =========   ======= ===================

.. note:: Even if you're using --dtach all programs associated with the user's session will be terminated when it times out.

ssl_auth
---------
.. cmdoption:: --ssl_auth=string (None|optional|required)

::

    ssl_auth = None

If set to 'required' or 'optional' this setting will instruct Gate One to authenticate client-side SSL certificates.  This can be an excellent added layer of security on top of Gate One's other authentication options.  Obviously, only the 'required' setting adds this protection.  If set to 'optional' it merely adds information to the logs.

sso_realm
---------
.. cmdoption:: --sso_realm=string (Kerberos realm or Active Directory domain)

::

    sso_realm = "EXAMPLE.COM"

If :option:`--auth` is set to "kerberos", tells Gate One which Kerberos realm or Active Directory domain to use when authenticating users.  Otherwise this setting will be ignored.

.. note:: SSO stands for Single Sign-On.

sso_service
-----------
.. cmdoption:: --sso_service=string (kerberos service name)

::

    sso_service = "HTTP"

If :option:`--auth` is set to "kerberos", tells Gate One which Kerberos service to use when authenticating clients.  This is the 'service/' part of a servicePrincipalName (e.g. **HTTP**/somehost.example.com).

.. note:: Unless you *really* know what you're doing do not use anything other than HTTP (in all caps).

syslog_facility
---------------
.. cmdoption:: --syslog_facility=string (auth|cron|daemon|kern|local0|local1|local2|local3|local4|local5|local6|local7|lpr|mail|news|syslog|user|uucp)

::

    syslog_facility = "daemon"

if :option:`--syslog_session_logging` is set to `True`, specifies the syslog facility that user session logs will use in outgoing syslog messages.

syslog_host
-----------
.. cmdoption:: --syslog_host=string (IP or FQDN)

::

    syslog_host = "loghost.company.com"

This option will instruct Gate One to send log messages to the specified syslog server, bypassing the local syslog daemon (which could itself be configured to send logs to a syslog host).

.. note:: This option may be used even if there is no syslog daemon available on the host running Gate One.  It makes outbound connections to the specified syslog host directly over UDP.

syslog_session_logging
----------------------
.. cmdoption:: --syslog_session_logging

::

    syslog_session_logging = False

This option tells Gate One to send logs of user sessions to the host's syslog daemon.  Special characters and escape sequences will be sent as-is so it is up to the syslog daemon as to how to handle them.  In most cases you'll wind up with log lines that look like this:

.. ansi-block::

    Oct  1 19:18:22 gohost gateone: ANONYMOUS 1: Connecting to: ssh://user@somehost:22
    Oct  1 19:18:22 gohost gateone: ANONYMOUS 1: #033]0;user@somehost#007
    Oct  1 19:18:22 gohost gateone: ANONYMOUS 1: #033]_;ssh|user@somehost:22#007

.. note:: This option enables centralized logging if your syslog daemon is configurd to use a remote log host.

.. Why must I prepend ".. _user_dir:" before a section title just so I can link to it from within the same document?  There's got to be a better way.

url_prefix
----------------------
.. cmdoption:: --url_prefix

::

    url_prefix = "/"

This specifies the URL path Gate One will live when it is accessed from a browser.  By default Gate One will use "/" as its base URL; this means that you can connect to it using a URL like so:  https://mygateone.company.com/

That "/" at the end of the above URL is what the ``url_prefix`` is specifying.  If you wanted your Gate One server to live at https://gateone.company.com/gateone/ you could set ``url_prefix="/gateone/"``.

.. note:: This feature was added for users running Gate One behind a reverse proxy so that many apps (like Gate One) can all live behind a single base URL.

.. tip:: If you want to place your Gate One server on the Internet but don't want it to be easily discovered/enumerated you can specify a random string as the gateone prefix like ``url_prefix="/fe34b0e0c074f486c353602/"``.  Then only those who have been made aware of your obfuscated URL will be able to access your Gate One server (at https://gateone.company.com/fe34b0e0c074f486c353602/ ☺)

.. _user_dir:

user_dir
--------
.. cmdoption:: --user_dir=string (file path)

::

    user_dir = "/opt/gateone/users" # NOTE: The actual default is "<path to gateone>/users"

Specifies the location where persistent user files will be kept.  Things like session logs, ssh files (known_hosts, keys, etc), and similar are stored here.
