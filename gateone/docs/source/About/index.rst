**************
About Gate One
**************
Gate One is an open source, web-based terminal emulator with a powerful plugin system.  It comes bundled with a plugin that turns Gate One into an amazing SSH client but Gate One can actually be used to run *any* terminal application.  You can even embed Gate One into other applications to provide an interface into serial consoles, virtual servers, or anything you like.  It's a great supplement to any web-based administration interface.

Gate One works in any browser that supports WebSockets.  No browser plugins required!

Licensing
=========
Gate One is released under a dual-license model.  You are free to choose the license that best meets your requirements:

    * The `GNU Affero General Public License version 3 (AGPLv3) <http://www.gnu.org/licenses/agpl.html>`_.
    * Gate One Commercial licensing.

Open Source License Requirements
--------------------------------
The :abbr:`AGPLv3 (GNU Affero General Public License version 3)` is similar to the :abbr:`GPLv3 (GNU General Public License version 3)` in that it requires that you publicly release the source code of your application if you distribute binaries that use Gate One.  However, it has an additional obligation:  You must make your source code available to everyone if your application is provided as Software-as-a-Service (SaaS) or it's part of an Application Service Provider solution.

For example, if you're running Gate One on your server as part of a SaaS solution you must give away all of your source code.

Here are some examples where Open Source licensing makes sense:

 * Pre-installing Gate One as part of an open source Linux distribution.
 * Embedding Gate One into an open source application that is licensed under the AGPLv3 *or* the GPLv3 [#f1]_.
 * Bundling Gate One with an open source appliance.
 * Making Gate One available as part of an open source software repository.

**Considerations:** Unless you want your source code to be freely available to everyone you should opt for Gate One's Commercial License.

Gate One Commercial Licensing
-----------------------------
The Commercial License offerings for Gate One are very flexible and afford businesses the opportunity to include Gate One as part of their products and services without any source code obligations.  It also provides licensees with a fully-supported solution and assurances.

Here are some examples where commercial licensing is typically necessary:

 * Including Gate One in software sold to customers who install it on their own equipment.
 * Selling software that requires the installation of Gate One.
 * Selling hardware that comes with Gate One pre-installed.
 * Bundling with or including Gate One in any product protected by patents.

Even if you don't plan to embed Gate One into one of your own products, enterprise support options available.

For more information on Gate One Commercial Licensing and support please visit our `website <http://liftoffsoftware.com>`_.

Prerequisites
=============
Before installing Gate One your system must meet the following requirements:

=================================================   =================================================
Requirement                                         Version
=================================================   =================================================
Python                                              2.6+ (3.x support is forthcoming)
`Tornado Framework <http://www.tornadoweb.org/>`_   2.2+
=================================================   =================================================

The following commands can be used to verify which version of each are installed:

.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m python -V
    Python 2.7.2+
    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m python -c "import tornado; print(tornado.version)"
    2.2
    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m

Addditionally, if you wish to use Kerberos/Active Directory authentication you'll need the `python-kerberos <http://pypi.python.org/pypi/kerberos>`_ module.  On most systems both Tornado and the Kerberos module can be installed with via a single command:

.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m sudo pip install tornado kerberos

...or if you have an older operating system:

.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@legacy-host\x1b[1;34m:~ $\x1b[0m sudo easy_install tornado kerberos

.. note:: The use of pip is recommended.  See http://www.pip-installer.org/en/latest/installing.html if you don't have it.

Installation
============
Gate One can be installed via a number of methods, depending on which package you've got.  Assuming you've downloaded the appropriate Gate One package for your operating system to your home directory...

RPM-based Linux Distributions
-----------------------------
.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@redhat\x1b[1;34m:~ $\x1b[0m sudo rpm -Uvh gateone*.rpm

Debian-based Linux Distributions
--------------------------------
.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@ubuntu\x1b[1;34m:~ $\x1b[0m sudo dpkg -i gateone*.deb

From Source
-----------
.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@whatever\x1b[1;34m:~ $\x1b[0m tar zxvf gateone*.tar.gz; cd gateone*; sudo python setup.py install

This translates to:  Extract; Change into the gateone* directory; Install.

Configuration
=============
The first time you execute gateone.py it will create a default configuration file as /opt/gateone/server.conf::

    sso_service = "HTTP"
    locale = "en_US"
    https_redirect = False
    pam_service = "login"
    syslog_facility = "daemon"
    disable_ssl = False
    session_logging = True
    syslog_host = None
    cookie_secret = "NzZiNzVhYzA4M2JkNDNjNDliOGy0jjlkMGVkYMniZTcwz"
    syslog_session_logging = False
    address = ""
    auth = None
    port = 443
    user_dir = "/opt/gateone/users"
    log_file_num_backups = 10
    logging = "info"
    dtach = True
    certificate = "certificate.pem"
    command = "/opt/gateone/plugins/ssh/scripts/ssh_connect.py -S '/tmp/gateone/%SESSION%/%SHORT_SOCKET%' --sshfp -a '-oUserKnownHostsFile=%USERDIR%/%USER%/ssh/known_hosts'"
    log_to_stderr = False
    session_timeout = "5d"
    log_file_max_size = 104857600
    session_dir = "/tmp/gateone"
    sso_realm = None
    embedded = False
    keyfile = "keyfile.pem"
    debug = False
    js_init = ""
    log_file_prefix = "/opt/gateone/logs/webserver.log"
    pam_realm = "portarisk"

.. note:: These settings can appear in any order.

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
      --embedded                       Run Gate One in Embedded Mode (no toolbar, only one terminal allowed, etc.  See docs).
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
      --url_prefix                     An optional prefix to place before all Gate One URLs. e.g. '/gateone/'.  Use this if Gate One will be running behind a reverse proxy where you want it to be located at some sub-URL path.
      --user_dir                       Path to the location where user files will be stored.

These options are detailed below in the format of:

    |   Name

    .. option:: --command_line_option

    ::

        Default value as it is defined in server.conf

    |   Description

log_file_max_size
-----------------
.. option:: --log_file_max_size=bytes

::

    log_file_max_size = 104857600 # Which is the result of: 100 * 1024 * 1024

This defines the maximum size of Gate One's web server log file in bytes before it is automatically rotated.

.. note:: Web server log settings don't apply to Gate One's user session logging features.

log_file_num_backups
--------------------
.. option:: --log_file_num_backups=integer

::

    log_file_max_size = 10

The maximum number of backups to keep of Gate One's web server logs.

log_file_prefix
---------------
.. option:: --log_file_prefix=string (file path)

::

    log_file_prefix = "/var/log/gateone/webserver.log"

This is the path where Gate One's web server logs will be kept.  You'll get an error message if Gate One doesn't have permission to create the parent directory (if it doesn't exist) or if it can't write to files there.

log_to_stderr
-------------
.. option:: --log_to_stderr

::

    log_file_prefix = False

This option tells Gate One to send web server logs to stderr (instead of to the log file).

logging
-------
.. option:: --logging

::

    logging = "info"

Specifies the log level of the web server logs.  The default is "info".  Can be one of, "info", "warning", "error", or "none".

address
-------
.. option:: --address=string (IPv4 or IPv6 address)

::

    address = ""

The address that Gate One will listen for connections.  Default is "" (all addresses including IPv6).

.. note:: Multiple addresses can be specified by giving multiple `--address` arguments to gateone.py or by adding multiple `address = "<address>"` lines to the server.conf.

auth
----
.. option:: --auth=string (none|google|kerberos)

::

    auth = None # NOTE: "none" (in quotes) also works.

Specifies how you want Gate One to authenticate clients.  One of, "none", "google", or "kerberos".

certificate
-----------
.. option:: --certificate=string (file path)

::

    certificate = "/opt/gateone/certificate.pem" # NOTE: The actual default is "<path to gateone>/certificate.pem"

The path to the SSL certificate Gate One will use in its web server.

.. note:: The file must be in PEM format.

command
-------
.. option:: --command=string (program path)

::

    command = "/opt/gateone/plugins/ssh/scripts/ssh_connect.py -S '/tmp/gateone/%SESSION%/%r@%h:%p' -a '-oUserKnownHostsFile=%USERDIR%/%USER%/known_hosts'"
     # NOTE: The actual default is "<path to gateone>/plugins/ssh/scripts/ssh_connect.py ..."

This option specifies the command Gate One will run when a user connects or opens a new terminal.  The default is for Gate One to run the ssh_connect.py script.  Any interactive terminal application should work (e.g. 'nethack').

config
------
.. option:: --config=string (file path)

You may use this option to specify an alternate configuration file (e.g. something other than /opt/gateone/server.conf).

cookie_secret
-------------
.. option:: --cookie_secret=string ([A-Za-z0-9])

::

    cookie_secret = "A45CharacterStringGeneratedAtRandom012345678" # NOTE: Yours will be different ;)

This is a 45-character string that Gate One will use to encrypt the cookie stored at the client.  By default Gate One will generate one at random when it runs for the first time.  Only change this if you know what you're doing.

.. note:: If you change this string in the server.conf you'll need to restart Gate One for the change to take effect.

*What happens if you change it?*  All users existing, unexpired sessions will need to be re-authenticated.  Not really a big deal since Gate One will restore everything the user was doing after the re-auth.  In most cases changing the cookie secret will be completely transparent to the user.

.. tip:: You may have to change this key at a regular interval throughout the year depending on your compliance needs.  Every few months is probably not a bad idea regardless.

debug
-----
.. option:: --debug

::

    debug = False

Turns on debugging:  Runs Gate One in the foreground and logs all sorts of extra messages to stdout.

disable_ssl
-----------
.. option:: --disable_ssl

::

    disable_ssl = False

Disables SSL support in Gate One.  Generally not a good idea unless you know what you're doing.  There's really only two reasons why you'd want to do this:

 * Gate One will be running behind a proxy server that handles the SSL encryption.
 * Gate One will only be connected to via localhost (kiosks, console devices, etc).

dtach
-----
.. option:: --dtach

::

    dtach = True

This feature is special:  It enables Gate One to be restarted (think: upgraded) without losing user's connected sessions.  This option is enabled by default.

.. note:: If you ever need to restart Gate One (and dtach support is enabled) users will be shown a message indicating that they have been disconnected and their browsers should automatically reconnect in 5 seconds.  A 5-second maintenance window ain't bad!

embedded
--------
.. option:: --embedded

::

    embedded = False

This option tells Gate One to run in embedded mode:  No interface icons will be displayed and the ability to open additional terminals will be disabled.

https_redirect
--------------
.. option:: --https_redirect

::

    https_redirect = False

If https_redirect is enabled, Gate One will listen on port 80 and redirect incoming connections to Gate One's configured port using HTTPS.

js_init
-------
.. option:: --js_init=string (JavaScript Object)

::

    js_init = ""

This option can be used to provide options to pass to the GateOne.init() function inside gateone.js whenever Gate One is opened in a browser.  For example::

    js_init = "{'theme': 'white', 'fontSize': '120%'}"

For a list of all the possible options see :attr:`GateOne.prefs` in the :ref:`developer-docs` under :ref:`gateone-properties`.

keyfile
-------
.. option:: --keyfile=string (file path)

::

    keyfile = "/opt/gateone/keyfile.pem" # NOTE: The actual default is "<path to gateone>/keyfile.pem"

The path to the SSL key file Gate One will use in its web server.

.. note:: The file must be in PEM format.

kill
----
.. option:: --kill

::

    # It would be silly to set this in server.conf--but you could!  Gate One wouldn't start but hey, whatever floats your boat!

If running with dtach support, this will kill all user's running terminal applications.  Giving everyone a fresh start, as it were.

locale
------
.. option:: --locale=string (locale string)

::

    locale = "en_US"

This option tells Gate One which local translation (native language) to use when rendering strings.  The first time you run Gate One it will attempt to automatically detect your locale using the `$LANG` environment variable.  If this variable is not set it will fall back to using `en_US`.

new_api_key
-----------
.. option:: --new_api_key

This command line option will generate a new, random API key and secret for use with applications that will be embedding Gate One.  Instructions on how to use API-based authentication can be found in the :ref:`embedded-docs`.

pam_realm
---------
.. option:: --pam_realm=string (hostname)

::

    sso_realm = "somehost"

If `auth = "pam"`, tells Gate One which how to present BASIC auth to the user (essentially, the login dialog will say, "REALM: <pam_realm>").  Also, the user's directory will be created in `user_dir` as user@<pam_realm>.

pam_service
-----------
.. option:: --pam_service=string

::

    pam_service = "login"

If `auth = "pam"`, tells Gate One which PAM service to use when authenticating clients.  Defaults to 'login' which is typically controlled by `/etc/pam.d/login`.

port
----
.. option:: --port=integer (1-65535)

::

    port = 443

The port Gate One should listen for connections.

.. note:: Gate One must run as root to utilize ports 1-1024.

session_dir
-----------
.. option:: --session_dir=string (file path)

::

    session_dir = "/tmp/gateone"

The path where Gate One should keep temporary user session information.  Defaults to /tmp/gateone (will be auto-created if not present).

session_logging
---------------
.. option:: --session_logging

::

    session_logging = True

This tells Gate One to enable server-side logging of user sessions.  These logs can be viewed or played back (like a video) using the :ref:`log_viewer` application.

.. note:: Gate One stores logs of user sessions in the location specified in the :ref:`user_dir` option.

session_timeout
---------------
.. option:: --session_timeout=string (special: [0-9]+[smhd])

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

sso_realm
---------
.. option:: --sso_realm=string (Kerberos realm or Active Directory domain)

::

    sso_realm = "EXAMPLE.COM"

If `auth = "kerberos"`, tells Gate One which Kerberos realm or Active Directory domain to use when authenticating users.  Otherwise this setting will be ignored.

sso_service
-----------
.. option:: --sso_service=string (kerberos service name)

::

    sso_realm = "HTTP"

If `auth = "kerberos"`, tells Gate One which Kerberos service to use when authenticating clients.  This is the 'service/' part of a servicePrincipalName (e.g. **HTTP**/somehost.example.com).

.. note:: Unless you *really* know what you're doing do not use anything other than HTTP (in all caps).

syslog_facility
---------------
.. option:: --syslog_facility=string (auth|cron|daemon|kern|local0|local1|local2|local3|local4|local5|local6|local7|lpr|mail|news|syslog|user|uucp)

::

    syslog_facility = "daemon"

if `syslog_session_logging = True`, specifies the syslog facility that user session logs will use when syslog_session_logging is enabled.

syslog_host
-----------
.. option:: --syslog_host=string (IP or FQDN)

::

    syslog_host = "loghost.company.com"

This option will instruct Gate One to send log messages to the specified syslog server, bypassing the local syslog daemon (which could itself be configured to send logs to a syslog host).

.. note:: This option may be used even if there is no syslog daemon available on the host running Gate One.  It makes outbound connections to the specified syslog host directly over UDP.

syslog_session_logging
----------------------
.. option:: --syslog_session_logging

::

    syslog_session_logging = False

This option tells Gate One to send logs of user sessions to the host's syslog daemon.  Special characters and escape sequences will be sent as-is so it is up to the syslog daemon as to how to handle them.  In most cases you'll wind up with log lines that look like this::

    Oct  1 19:18:22 gohost gateone: %anonymous 1: Connecting to: ssh://user@somehost:22
    Oct  1 19:18:22 gohost gateone: %anonymous 1: #033]0;user@somehost#007
    Oct  1 19:18:22 gohost gateone: %anonymous 1: #033]_;ssh|user@somehost:22#007

.. note:: This option enables centralized logging if your syslog daemon is configurd to use a remote log host.

.. Why must I prepend ".. _user_dir:" before a section title just so I can link to it from within the same document?  There's got to be a better way.

url_prefix
----------------------
.. option:: --url_prefix

::

    url_prefix = "/"

This specifies the URL path Gate One will live when it is accessed from a browser.  By default Gate One will use "/" as its base URL; this means that you can connect to it using a URL like so:  https://mygateone.company.com/

That "/" at the end of the above URL is what the ``url_prefix`` is specifying.  If you wanted your Gate One server to live at https://mygateone.company.com/gateone/ you could set ``url_prefix="/gateone/"``.

.. note:: This feature was added for users running Gate One behind a reverse proxy so that many apps (like Gate One) can all live behind a single base URL.

.. _user_dir:

user_dir
--------
.. option:: --user_dir=string (file path)

::

    user_dir = "/opt/gateone/users" # NOTE: The actual default is "<path to gateone>/users"

Specifies the location where persistent user files will be kept.  Things like session logs, ssh files (known_hosts, keys, etc), and similar are stored here.

.. rubric:: Footnotes

.. [#f1] The GPLv3 and AGPLv3 each include clauses (in section 13 of each license) that together achieve a form of mutual compatibility.  See `AGPLv3 Section 13 <http://www.gnu.org/licenses/agpl.html#section13>`_ and `GPLv3 Section 13 <http://www.gnu.org/licenses/gpl.html#section13>`_