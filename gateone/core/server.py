#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#
# For license information see LICENSE.txt

# Meta
__version__ = '1.2.0'
__version_info__ = (1, 2, 0)
__license__ = "AGPLv3" # ...or proprietary (see LICENSE.txt)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'
__commit__ = "20140308195159" # Gets replaced by git (holds the date/time)

# NOTE: Docstring includes reStructuredText markup for use with Sphinx.
__doc__ = '''\
.. _gateone.py:

Gate One
========
Gate One is a web-based terminal emulator written in Python using the Tornado
web framework.  This module runs the primary daemon process and acts as a
central controller for all running terminals and terminal programs.  It supports
numerous configuration options and can also be called with the --kill switch
to kill all running terminal programs (if using dtach--otherwise they die on
their own when gateone.py is stopped).

Dependencies
------------
Gate One requires Python 2.6+ but runs best with Python 2.7+.  It also depends
on the following 3rd party Python modules:

 * `Tornado <http://www.tornadoweb.org/>`_ 3.1+ - A non-blocking web server framework that powers FriendFeed.

The following modules are optional and can provide Gate One with additional
functionality:

 * `pyOpenSSL <https://launchpad.net/pyopenssl>`_ 0.10+ - An OpenSSL module/wrapper for Python.  Only used to generate self-signed SSL keys and certificates.  If pyOpenSSL isn't available Gate One will fall back to using the 'openssl' command to generate self-signed certificates.
 * `kerberos <http://pypi.python.org/pypi/kerberos>`_ 1.0+ - A high-level Kerberos interface for Python.  Only necessary if you plan to use the Kerberos authentication module.
 * `python-pam <http://packages.debian.org/lenny/python-pam>`_ 0.4.2+ - A Python module for interacting with PAM (the Pluggable Authentication Module present on nearly every Unix).  Only necessary if you plan to use PAM authentication.
 * `PIL (Python Imaging Library) <http://www.pythonware.com/products/pil/>`_ 1.1.7+ - A Python module for manipulating images.  **Alternative:** `Pillow <https://github.com/python-imaging/Pillow>`_ 2.0+ - A "friendly fork" of PIL that works with Python 3.
 * `mutagen <https://code.google.com/p/mutagen/>`_ 1.21+ - A Python module to handle audio metadata.  Makes it so that if you ``cat music_file.ogg`` in a terminal you'll get useful track/tag information.

With the exception of python-pam, all required and optional modules can usually be installed via one of these commands:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m sudo pip install --upgrade tornado pyopenssl kerberos pillow mutagen

...or:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@legacy-host\x1b[1;34m:~ $\x1b[0m sudo easy_install tornado pyopenssl kerberos pillow mutagen

.. note:: The use of pip is recommended.  See http://www.pip-installer.org/en/latest/installing.html if you don't have it.

The python-pam module is available in most Linux distribution repositories.  Simply executing one of the following should take care of it:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@debian-or-ubuntu-host\x1b[1;34m:~ $\x1b[0m sudo apt-get install python-pam

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@redhat-host\x1b[1;34m:~ $\x1b[0m sudo yum install python-pam

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@gentoo-host\x1b[1;34m:~ $\x1b[0m sudo emerge python-pam

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@suse-host\x1b[1;34m:~ $\x1b[0m sudo yast -i python-pam

Settings
--------
Most of Gate One's options can be controlled by command line switches or via
.conf files in the settings directory.  If you haven't configured Gate One
before a number of .conf files will be automatically generated using defaults
and/or the command line switches provided the first time you run `gateone.py`.

Settings in the various `settings/*.conf` files are JSON-formatted:

.. note::

    Technically, JSON doesn't allow comments but Gate One's .conf files do.

.. code-block:: javascript

    { // You can use single-line comments like this
    /*
    Or multi-line comments like this.
    */
        "*": { // The * here designates this as "default" values
            "gateone": { // Settings in this dict are specific to the "gateone" app
                "address": "10.0.0.100", // A string value
                "log_file_num_backups": 10, // An integer value
                // Here's an example list:
                "origins": ["localhost", "127.0.0.1", "10.0.0.100"],
                "https_redirect": false, // Booleans are all lower case
                "log_to_stderr": null // Same as `None` in Python (also lower case)
                // NOTE: No comma after last item
            },
            "terminal": { // Example of a different application's settings
                "default_command": "SSH", // <-- don't leave traling commas like this!
                ... // So on and so forth
            }
        }
    }

.. note::

    You *must* use double quotes ("") to define strings.  Single quotes *can* be
    used inside double quotes, however.  `"example": "of 'single' quotes"`  To
    escape a double-quote inside a double quote use three slashes:
    `"\\\\\\\\\\\\"foo\\\\\\\\\\\\""`

.. All those slashes above are so Sphinx won't mangle it in HTML.

You can have as many .conf files in your settings directory as you like.  When
Gate One runs it reads all files in alphanumeric order and combines all settings
into a single Python dictionary.  Files loaded last will override settings from
earlier files.  Example:

.. topic:: 20example.conf

    .. code-block:: javascript

        {
            "*": {
                "terminal": {
                    "session_logging": true,
                    "default_command": "SSH"
                }
            }
        }

.. topic:: 99override.conf

    .. code-block:: javascript

        {
            "*": {
                "terminal": {
                    "default_command": "my_override"
                }
            }
        }

If Gate One loaded the above example .conf files the resulting dict would be:

.. topic:: Merged settings

    .. code-block:: javascript

        {
            "*": {
                "terminal": {
                    "session_logging": true,
                    "default_command": "my_override"
                }
            }
        }

.. note::

    These settings are loaded using the `~utils.RUDict` (Recusive Update Dict)
    class.

There are a few important differences between the configuration file and
command line switches in regards to boolean values (True/False).  A switch such
as `--debug` is equivalent to ``"debug" = true`` in 10server.conf:

.. code-block:: javascript

    "debug" = true // Booleans are all lower case (not in quotes)

.. tip::

    Use `--setting=True`, `--setting=False`, or `--setting=None` to avoid
    confusion.

.. note::

    The following values in 10server.conf are case sensitive: `true`, `false`
    and `null` (and should not be placed in quotes).

Running gateone.py with the `--help` switch will print the usage information as
well as descriptions of what each configurable option does:

.. ansi-block::

    \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m gateone --help
    Usage: /usr/local/bin/gateone [OPTIONS]

    Options:

    --help                           show this help information

    /usr/local/lib/python2.7/dist-packages/tornado/log.py options:

    --log_file_max_size              max size of log files before rollover
                                    (default 100000000)
    --log_file_num_backups           number of log files to keep (default 10)
    --log_file_prefix=PATH           Path prefix for log files. Note that if you
                                    are running multiple tornado processes,
                                    log_file_prefix must be different for each
                                    of them (e.g. include the port number)
    --log_to_stderr                  Send log output to stderr (colorized if
                                    possible). By default use stderr if
                                    --log_file_prefix is not set and no other
                                    logging is configured.
    --logging=debug|info|warning|error|none
                                    Set the Python log level. If 'none', tornado
                                    won't touch the logging configuration.
                                    (default info)

    gateone options:

    --address                        Run on the given address.  Default is all
                                    addresses (IPv6 included).  Multiple address
                                    can be specified using a semicolon as a
                                    separator (e.g. '127.0.0.1;::1;10.1.1.100').
    --api_keys                       The 'key:secret,...' API key pairs you wish
                                    to use (only applies if using API
                                    authentication)
    --api_timestamp_window           How long before an API authentication object
                                    becomes invalid.   (default 30s)
    --auth                           Authentication method to use.  Valid options
                                    are: none, api, google, ssl, kerberos, pam
                                    (default none)
    --ca_certs                       Path to a file containing any number of
                                    concatenated CA certificates in PEM format.
                                    They will be used to authenticate clients if
                                    the 'ssl_auth' option is set to 'optional'
                                    or 'required'.
    --cache_dir                      Path where Gate One should store temporary
                                    global files (e.g. rendered templates, CSS,
                                    JS, etc). (default /tmp/gateone_cache)
    --certificate                    Path to the SSL certificate.  Will be auto-
                                    generated if none is provided. (default
                                    /etc/gateone/ssl/certificate.pem)
    --combine_css                    Combines all of Gate One's CSS Template
                                    files into one big file and saves it at the
                                    given path (e.g. gateone
                                    --combine_css=/tmp/gateone.css).
    --combine_css_container          Use this setting in conjunction with
                                    --combine_css if the <div> where Gate One
                                    lives is named something other than #gateone
                                    (default gateone)
    --combine_js                     Combines all of Gate One's JavaScript files
                                    into one big file and saves it at the given
                                    path (e.g. gateone
                                    --combine_js=/tmp/gateone.js)
    --command                        DEPRECATED: Use the 'commands' option in the
                                    terminal settings.
    --config                         DEPRECATED.  Use --settings_dir. (default
                                    /opt/gateone/server.conf)
    --cookie_secret                  Use the given 45-character string for cookie
                                    encryption.
    --debug                          Enable debugging features such as auto-
                                    restarting when files are modified. (default
                                    False)
    --disable_ssl                    If enabled, Gate One will run without SSL
                                    (generally not a good idea). (default False)
    --embedded                       When embedding Gate One, this option is
                                    available to templates. (default False)
    --enable_unix_socket             Enable Unix socket support. (default False)
    --gid                            Drop privileges and run Gate One as this
                                    group/gid. (default 0)
    --https_redirect                 If enabled, a separate listener will be
                                    started on port 80 that redirects users to
                                    the configured port using HTTPS. (default
                                    False)
    --js_init                        A JavaScript object (string) that will be
                                    used when running GateOne.init() inside
                                    index.html.  Example: --js_init="{scheme:
                                    'white'}" would result in
                                    GateOne.init({scheme: 'white'})
    --keyfile                        Path to the SSL keyfile.  Will be auto-
                                    generated if none is provided. (default
                                    /etc/gateone/ssl/keyfile.pem)
    --locale                         The locale (e.g. pt_PT) Gate One should use
                                    for translations.  If not provided, will
                                    default to $LANG (which is 'en_US' in your
                                    current shell), or en_US if not set.
                                    (default en_US)
    --new_api_key                    Generate a new API key that an external
                                    application can use to embed Gate One.
                                    (default False)
    --origins                        A semicolon-separated list of origins you
                                    wish to allow access to your Gate One server
                                    over the WebSocket.  This value must contain
                                    the hostnames and FQDNs (e.g. foo;foo.bar;)
                                    users will use to connect to your Gate One
                                    server as well as the hostnames/FQDNs of any
                                    sites that will be embedding Gate One.
                                    Alternatively, '*' may be  specified to
                                    allow access from anywhere. (default localho
                                    st;127.0.0.1;enterprise.lan;enterprise;local
                                    host;enterprise.lan;enterprise;enterprise.ex
                                    ample.com;127.0.0.1;10.1.1.100)
    --pam_realm                      Basic auth REALM to display when
                                    authenticating clients.  Default: hostname.
                                    Only relevant if PAM authentication is
                                    enabled. (default enterprise)
    --pam_service                    PAM service to use.  Defaults to 'login'.
                                    Only relevant if PAM authentication is
                                    enabled. (default login)
    --pid_file                       Define the path to the pid file.  Default:
                                    /var/run/gateone.pid (default
                                    /var/run/gateone.pid)
    --port                           Run on the given port. (default 443)
    --session_dir                    Path to the location where session
                                    information will be stored. (default
                                    /tmp/gateone)
    --session_timeout                Amount of time that a session is allowed to
                                    idle before it is killed.  Accepts <num>X
                                    where X could be one of s, m, h, or d for
                                    seconds, minutes, hours, and days.  Set to
                                    '0' to disable the ability to resume
                                    sessions. (default 5d)
    --settings_dir                   Path to the settings directory. (default
                                    /etc/gateone/conf.d)
    --ssl_auth                       Enable the use of client SSL (X.509)
                                    certificates as a secondary authentication
                                    factor (the configured 'auth' type will come
                                    after SSL auth).  May be one of 'none',
                                    'optional', or 'required'.  NOTE: Only works
                                    if the 'ca_certs' option is configured.
                                    (default none)
    --sso_realm                      Kerberos REALM (aka DOMAIN) to use when
                                    authenticating clients. Only relevant if
                                    Kerberos authentication is enabled.
    --sso_service                    Kerberos service (aka application) to use.
                                    Defaults to HTTP. Only relevant if Kerberos
                                    authentication is enabled. (default HTTP)
    --syslog_facility                Syslog facility to use when logging to
                                    syslog (if syslog_session_logging is
                                    enabled).  Must be one of: auth, cron,
                                    daemon, kern, local0, local1, local2,
                                    local3, local4, local5, local6, local7, lpr,
                                    mail, news, syslog, user, uucp. (default
                                    daemon)
    --uid                            Drop privileges and run Gate One as this
                                    user/uid. (default 0)
    --unix_socket_path               Path to the Unix socket (if
                                    --enable_unix_socket=True). (default
                                    /tmp/gateone.sock)
    --url_prefix                     An optional prefix to place before all Gate
                                    One URLs. e.g. '/gateone/'.  Use this if
                                    Gate One will be running behind a reverse
                                    proxy where you want it to be located at
                                    some sub-URL path. (default /)
    --user_dir                       Path to the location where user files will
                                    be stored. (default /var/lib/gateone/users)
    --user_logs_max_age              Maximum amount of length of time to keep any
                                    given user log before it is removed.
                                    (default 30d)
    --version                        Display version information.

    terminal options:

    --dtach                          Wrap terminals with dtach. Allows sessions
                                    to be resumed even if Gate One is stopped
                                    and started (which is a sweet feature).
                                    (default True)
    --kill                           Kill any running Gate One terminal processes
                                    including dtach'd processes. (default False)
    --session_logging                If enabled, logs of user sessions will be
                                    saved in <user_dir>/<user>/logs.  Default:
                                    Enabled (default True)
    --syslog_session_logging         If enabled, logs of user sessions will be
                                    written to syslog. (default False)

    x11 options:

    --xorg_conf                      If provided, will use the specified
                                    xorg.conf file when spawning instances of
                                    Xorg. (default /etc/gateone/x11/xorg.conf)

.. note::

    Some of these options (e.g. log_file_prefix) are inherent to the
    Tornado framework.  You won't find them anywhere in gateone.py.

File Paths
----------
Gate One stores its files, temporary session information, and persistent user
data in the following locations (Note: Many of these are configurable):

==================  ==========================================================================================
File/Directory      Description
==================  ==========================================================================================
authpam.py          Contains the PAM authentication Mixin used by auth.py.
auth.py             Authentication classes.
babel_gateone.cfg   Pybabel configuration for generating localized translations of Gate One's strings.
certificate.pem     The default certificate Gate One will use in SSL communications.
docs/               Gate One's documentation.
gateone.py          Gate One's primary executable/script. Also, the file containing this documentation.
gopam.py            PAM (Authentication) Python module (used by authpam.py).
i18n/               Gate One's internationalization (i18n) support and locale/translation files.
keyfile.pem         The default private key used with SSL communications.
logviewer.py        A utility to view Gate One session logs.
plugins/            (Global) Plugins go here in the form of ./plugins/<plugin name>/<plugin files|directories>
settings/           All Gate One settings files live here (.conf files).
sso.py              A Kerberos Single Sign-on module for Tornado (used by auth.py)
static/             Non-dynamic files that get served to clients (e.g. gateone.js, gateone.css, etc).
templates/          Tornado template files such as index.html.
tests/              Various scripts and tools to test Gate One's functionality.
utils.py            Various supporting functions.
users/              Persistent user data in the form of ./users/<username>/<user-specific files>
users/<user>/logs   This is where session logs get stored if session_logging is set.
/tmp/gateone        Temporary session data in the form of /tmp/gateone/<session ID>/<files>
/tmp/gateone_cache  Used to store cached files such as minified JavaScript and CSS.
==================  ==========================================================================================

Running
-------
Executing Gate One is as simple as:

.. ansi-block::

    \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m gateone

.. note::

    By default Gate One will run on port 443 which requires root on most
    systems.  Use `--port=(something higher than 1024)` for non-root users.

Applications and Plugins
------------------------
Gate One supports both *applications* and *plugins*.  The difference is mostly
architectural.  Applications go in the `gateone/applications` directory while
(global) plugins reside in `gateone/plugins`.  The scope of application code
applies only to the application wheras global Gate One plugin code will apply
to Gate One itself and all applications.

.. note:: Applications may have plugins of their own (e.g. terminal/plugins).

Gate One applications and plugins can be written using any combination of the
following:

 * Python
 * JavaScript
 * CSS

Applications and Python plugins can integrate with Gate One in a number ways:

 * Adding or overriding request handlers to provide custom URLs (with a given regex).
 * Adding or overriding methods in `GOApplication` to handle asynchronous WebSocket "actions".
 * Adding or overriding events via the :meth:`on`, :meth:`off`, :meth:`once`, and :meth:`trigger` functions.
 * Delivering custom content to clients (e.g. JavaScript and CSS templates).

JavaScript and CSS plugins will be delivered over the WebSocket and cached at
the client by way of a novel synchronization mechanism.  Once JavaScript and CSS
assets have been delivered they will only ever have to be re-delivered to
clients if they have been modified (on the server).  This mechanism is extremely
bandwidth efficient and should allow clients to load Gate One content much more
quickly than traditional HTTP GET requests.

.. tip::

    If you install the `cssmin` and/or `slimit` Python modules all JavaScript
    and CSS assets will be automatically minified before being delivered to
    clients.

Class Docstrings
================
'''

# Standard library modules
import os
import sys
import re
import io
import logging
import time
import socket
import pty
import atexit
import ssl
import hashlib
from functools import partial
from datetime import datetime, timedelta
try:
    from urlparse import urlparse
except ImportError: # Python 3.X
    from urllib import parse as urlparse

# This is used as a way to ensure users get a friendly message about missing
# dependencies:
MISSING_DEPS = []
# This is needed before other globals for certain checks:
from gateone import GATEONE_DIR

tornado_version = "" # Placeholder in case Tornado import fails below

# Tornado modules (yeah, we use all this stuff)
try:
    import tornado.httpserver
    import tornado.ioloop
    import tornado.options
    import tornado.web
    import tornado.log
    import tornado.auth
    import tornado.template
    import tornado.netutil
    from tornado.websocket import WebSocketHandler, WebSocketClosedError
    from tornado.escape import json_decode
    from tornado.options import options
    from tornado import locale
    from tornado import version as tornado_version
    from tornado import version_info as tornado_version_info
except (ImportError, NameError):
    MISSING_DEPS.append('tornado >= 3.2')

if 'tornado >= 3.2' not in MISSING_DEPS:
    if tornado_version_info[0] < 3:
        MISSING_DEPS.append('tornado >= 3.2')
    if tornado_version_info[0] < 3 and tornado_version_info[1] < 2:
        MISSING_DEPS.append('tornado >= 3.2')

if MISSING_DEPS:
    print("\x1b[31;1mERROR:\x1b[0m: This host is missing dependencies:")
    for dep in MISSING_DEPS:
        print("    %s" % dep)
    modules = [a.split()[0] for a in MISSING_DEPS]
    print("\x1b[1m  sudo pip install --upgrade %s\x1b[0m." %
        ' '.join(MISSING_DEPS))
    sys.exit(1)

# We want this turned on right away
tornado.log.enable_pretty_logging()

# Our own modules
from gateone import SESSIONS, PERSIST
from gateone.auth.authentication import NullAuthHandler, KerberosAuthHandler
from gateone.auth.authentication import GoogleAuthHandler, APIAuthHandler
from gateone.auth.authentication import SSLAuthHandler, PAMAuthHandler
from gateone.auth.authorization import require, authenticated, policies
from gateone.auth.authorization import applicable_policies
from .utils import generate_session_id, mkdir_p, touch
from .utils import gen_self_signed_ssl, get_plugins, load_modules
from .utils import merge_handlers, none_fix, convert_to_timedelta, short_hash
from .utils import json_encode, recursive_chown, ChownError, get_or_cache
from .utils import write_pid, read_pid, remove_pid, drop_privileges
from .utils import check_write_permissions, get_applications, valid_hostname
from .utils import total_seconds, MEMO
from .configuration import apply_cli_overrides, define_options, SettingsError
from .configuration import get_settings
from onoff import OnOffMixin

# Setup our base loggers (these get overwritten in main())
from gateone.core.log import go_logger, LOGS
logger = go_logger(None)
auth_log = go_logger('gateone.auth')
msg_log = go_logger('gateone.message')
client_log = go_logger('gateone.client')

# Setup the locale functions before anything else
locale.set_default_locale('en_US')
user_locale = None # Replaced with the actual user locale object in __main__
def _(string):
    """
    Wraps user_locale.translate so we don't get errors if loading a locale fails
    (or we output a message before it is initialized).
    """
    if user_locale:
        return user_locale.translate(string)
    else:
        return string

from gateone.async import MultiprocessRunner, ThreadedRunner
try:
    CPU_ASYNC = MultiprocessRunner()
except NotImplementedError:
    # System doesn't support multiprocessing (for whatever reason).
    CPU_ASYNC = ThreadedRunner() # Fake it using threads
IO_ASYNC = ThreadedRunner()

# Globals
CMD = None # Will be overwritten by options.command
TIMEOUT = timedelta(days=5) # Gets overridden by options.session_timeout
# SESSION_WATCHER be replaced with a tornado.ioloop.PeriodicCallback that
# watches for sessions that have timed out and takes care of cleaning them up.
SESSION_WATCHER = None
CLEANER = None # Log and leftover session data cleaner PeriodicCallback
FILE_CACHE = {}
APPLICATIONS = {}
PLUGINS = {}
PLUGIN_WS_CMDS = {} # Gives plugins the ability to extend/enhance ApplicationWebSocket
PLUGIN_HOOKS = {} # Gives plugins the ability to hook into various things.
PLUGIN_AUTH_HOOKS = [] # For plugins to register functions to be called after a
                       # user successfully authenticates
PLUGIN_ENV_HOOKS = {} # Allows plugins to add environment variables that will be
                      # available to all executed commands.
# Gate One registers a handler for for terminal.py's CALLBACK_OPT special escape
# sequence callback.  Whenever this escape sequence is encountered, Gate One
# will parse the sequence's contained characters looking for the following
# format:
#   <plugin name>|<whatever>
# The <whatever> part will be passed to any plugin matching <plugin name> if the
# plugin has 'Escape': <function> registered in its hooks.
PLUGIN_ESC_HANDLERS = {}
# This is used to store plugin terminal hooks that are called when a new
# terminal is created (so a plugin could override/attach callbacks to the
# multiplex or terminal emulator instances).  NOTE: This is specifically for
# adding to the terminal emulator's CALLBACK_* capability.  For modifying the
# terminal emulator instance directly see PLUGIN_NEW_TERM_HOOKS.
PLUGIN_TERM_HOOKS = {}
# The NEW_TERM hooks are called at the end of ApplicationWebSocket.new_terminal()
# with 'self' and the new instance of the terminal emulator as the only
# arguments.  It's a more DIY/generic version of PLUGIN_TERM_HOOKS.
PLUGIN_NEW_TERM_HOOKS = []
# 'Command' hooks get called before a new Multiplex instance is created inside
# of ApplicationWebSocket.new_multiplex().  They are passed the 'command' and must
# return a string that will be used as the replacement 'command'.  This allows
# plugin authors to modify the configured 'command' before it is executed
PLUGIN_COMMAND_HOOKS = []
# 'Multiplex' hooks get called at the end of ApplicationWebSocket.new_multiplex()
# with the instance of ApplicationWebSocket and the new instance of Multiplex as
# the only arguments, respectively.
PLUGIN_NEW_MULTIPLEX_HOOKS = []

# Secondary locale setup
locale_dir = os.path.join(GATEONE_DIR, 'i18n')
locale.load_gettext_translations(locale_dir, 'gateone')
# NOTE: The locale gets set in __main__

def cleanup_user_logs():
    """
    Cleans up all user logs (everything in the user's 'logs' directory and
    subdirectories that ends in 'log') older than the `user_logs_max_age`
    setting.  The log directory is assumed to be:

        *user_dir*/<user>/logs

    ...where *user_dir* is whatever Gate One happens to have configured for
    that particular setting.
    """
    logging.debug("cleanup_user_logs()")
    disabled = timedelta(0) # If the user sets user_logs_max_age to "0"
    settings = get_settings(options.settings_dir)
    user_dir = settings['*']['gateone']['user_dir']
    if 'user_dir' in options: # NOTE: options is global
        user_dir = options.user_dir
    default = "30d"
    max_age_str = settings['*']['gateone'].get('user_logs_max_age', default)
    if 'user_logs_max_age' in list(options):
        max_age_str = options.user_logs_max_age
    max_age = convert_to_timedelta(max_age_str)
    def descend(path):
        """
        Descends *path* removing logs it finds older than `max_age` and calls
        :func:`descend` on any directories.
        """
        for fname in os.listdir(path):
            log_path = os.path.join(path, fname)
            if os.path.isdir(log_path):
                descend(log_path)
                continue
            if not log_path.endswith('log'):
                continue
            mtime = time.localtime(os.stat(log_path).st_mtime)
            # Convert to a datetime object for easier comparison
            mtime = datetime.fromtimestamp(time.mktime(mtime))
            if datetime.now() - mtime > max_age:
                # The log is older than max_age, remove it
                logger.info(_("Removing log due to age (>%s old): %s" % (
                    max_age_str, log_path)))
                os.remove(log_path)
    if max_age != disabled:
        for user in os.listdir(user_dir):
            logs_path = os.path.abspath(os.path.join(user_dir, user, 'logs'))
            if not os.path.exists(logs_path):
                # Nothing to do
                continue
            descend(logs_path)

def cleanup_old_sessions():
    """
    Cleans up old session directories inside the `session_dir`.  Any directories
    found that are older than the `auth_timeout` (global gateone setting) will
    be removed.  The modification time is what will be checked.
    """
    logging.debug("cleanup_old_sessions()")
    disabled = timedelta(0) # If the user sets auth_timeout to "0"
    settings = get_settings(options.settings_dir)
    expiration_str = settings['*']['gateone'].get('auth_timeout', "14d")
    expiration = convert_to_timedelta(expiration_str)
    if expiration != disabled:
        for session in os.listdir(options.session_dir):
            # If it's in the SESSIONS dict it's still valid for sure
            if session not in SESSIONS:
                if len(session) != 45:
                    # Sessions are always 45 characters long.  This check allows
                    # us to skip the 'broadcast' file which also lives in the
                    # session_dir.  Why not just check for 'broacast'?  Just in
                    # case we put something else there in the future.
                    continue
                session_path = os.path.join(options.session_dir, session)
                mtime = time.localtime(os.stat(session_path).st_mtime)
                # Convert to a datetime object for easier comparison
                mtime = datetime.fromtimestamp(time.mktime(mtime))
                if datetime.now() - mtime > expiration:
                    import shutil
                    from .utils import kill_session_processes
                    # The log is older than expiration, remove it and kill any
                    # processes that may be remaining.
                    kill_session_processes(session)
                    logger.info(_(
                        "Removing old session files due to age (>%s old): %s" %
                        (expiration_str, session_path)))
                    shutil.rmtree(session_path, ignore_errors=True)

def clean_up():
    """
    Regularly called via the `CLEANER` `~torando.ioloop.PeriodicCallback`, calls
    `cleanup_user_logs` and `cleanup_old_sessions`.

    .. note::

        How often this function gets called can be controlled by adding a
        `cleanup_interval` setting to 10server.conf ('gateone' section).
    """
    cleanup_user_logs()
    cleanup_old_sessions()

def policy_send_user_message(cls, policy):
    """
    Called by :func:`gateone_policies`, returns True if the user is
    authorized to send messages to other users and if applicable, all users
    (broadcasts).
    """
    error_msg = _("You do not have permission to send messages to %s.")
    try:
        upn = cls.f_args[0]['upn']
    except (KeyError, IndexError):
        # send_user_message got bad *settings*.  Deny
        return False
    # TODO: Add a mechanism that allows users to mute other users here.
    if upn == 'AUTHENTICATED':
        cls.error = error_msg % "all users at once"
    else:
        cls.error = error_msg % upn
    return policy.get('send_user_messages', True)

def policy_broadcast(cls, policy):
    """
    Called by :func:`gateone_policies`, returns True if the user is
    authorized to broadcast messages using the
    :meth:`ApplicationWebSocket.broadcast` method.  It makes this determination
    by checking the `['gateone']['send_broadcasts']` policy.
    """
    cls.error = _("You do not have permission to broadcast messages.")
    return policy.get('send_broadcasts', False) # Default deny

def policy_list_users(cls, policy):
    """
    Called by :func:`gateone_policies`, returns True if the user is
    authorized to retrieve a list of the users currently connected to the Gate
    One server via the :meth:`ApplicationWebSocket.list_server_users` method.
    It makes this determination by checking the `['gateone']['list_users']`
    policy.
    """
    cls.error = _("You do not have permission to list connected users.")
    return policy.get('list_users', True)

def gateone_policies(cls):
    """
    This function gets registered under 'gateone' in the
    :attr:`ApplicationWebSocket.security` dict and is called by the
    :func:`require` decorator by way of the :class:`policies` sub-function. It
    returns True or False depending on what is defined in the settings dir and
    what function is being called.

    This function will keep track of and place limits on the following:

        * Who can send messages to other users (including broadcasts).
        * Who can retrieve a list of connected users.
    """
    instance = cls.instance # ApplicationWebSocket instance
    function = cls.function # Wrapped function
    #f_args = cls.f_args     # Wrapped function's arguments
    #f_kwargs = cls.f_kwargs # Wrapped function's keyword arguments
    policy_functions = {
        'send_user_message': policy_send_user_message,
        'broadcast': policy_broadcast,
        'list_server_users': policy_list_users
    }
    user = instance.current_user
    policy = applicable_policies('gateone', user, instance.ws.policies)
    if not policy: # Empty RUDict
        return True # A world without limits!
    if function.__name__ in policy_functions:
        return policy_functions[function.__name__](cls, policy)
    return True # Default to permissive if we made it this far

@atexit.register # I love this feature!
def kill_all_sessions(timeout=False):
    """
    Calls all 'kill_session_callbacks' attached to all `SESSIONS`.

    If *timeout* is ``True``, emulate a session timeout event in order to
    *really* kill any user sessions (to ensure things like dtach processes get
    killed too).
    """
    logging.debug(_("Killing all sessions..."))
    for session in list(SESSIONS.keys()):
        if timeout:
            if "timeout_callbacks" in SESSIONS[session]:
                if SESSIONS[session]["timeout_callbacks"]:
                    for callback in SESSIONS[session]["timeout_callbacks"]:
                        callback(session)
        else:
            if "kill_session_callbacks" in SESSIONS[session]:
                if SESSIONS[session]["kill_session_callbacks"]:
                    for callback in SESSIONS[session]["kill_session_callbacks"]:
                        callback(session)

@atexit.register
def shutdown_async():
    """
    Shuts down our asynchronous processes/threads.  Specifically, calls
    ``CPU_ASYNC.shutdown()`` and ``IO_ASYNC.shutdown()``.
    """
    logging.debug(_("Shutting down asynchronous processes/threads..."))
    CPU_ASYNC.shutdown(wait=False)
    IO_ASYNC.shutdown(wait=False)

def timeout_sessions():
    """
    Loops over the SESSIONS dict killing any sessions that haven't been used
    for the length of time specified in *TIMEOUT* (global).  The value of
    *TIMEOUT* can be set in 10server.conf or specified on the command line via
    the *session_timeout* value.

    Applications and plugins can register functions to be called when a session
    times out by attaching them to the user's session inside the `SESSIONS`
    dict under 'timeout_callbacks'.  The best place to do this is inside of the
    application's `authenticate()` function or by attaching them to the
    `go:authenticate` event.  Examples::

        # Imagine this is inside an application's authenticate() method:
        sess = SESSIONS[self.ws.session]
        # Pretend timeout_session() is a function we wrote to kill stuff
        if timeout_session not in sess["timeout_session"]:
            sess["timeout_session"].append(timeout_session)

    .. note::

        This function is meant to be called via Tornado's
        :meth:`~tornado.ioloop.PeriodicCallback`.
    """
    disabled = timedelta(0) # If the user sets session_timeout to "0"
    # Commented because it is a bit noisy.  Uncomment to debug this mechanism.
    #if TIMEOUT != disabled:
        #logging.debug("timeout_sessions() TIMEOUT: %s" % TIMEOUT)
    #else :
        #logging.debug("timeout_sessions() TIMEOUT: disabled")
    try:
        if not SESSIONS: # Last client has timed out
            logger.info(_("All user sessions have terminated."))
            global SESSION_WATCHER
            if SESSION_WATCHER:
                SESSION_WATCHER.stop() # Stop ourselves
                SESSION_WATCHER = None # So authenticate() will know to start it
            # Reload gateone.py to free up memory (CPython can be a bit
            # overzealous in keeping things cached).  In theory this isn't
            # necessary due to Gate One's prodigous use of dynamic imports but
            # in reality people will see an idle gateone.py eating up 30 megs of
            # RAM and wonder, "WTF...  No one has connected in weeks."
            logger.info(_("The last idle session has timed out. Reloading..."))
            try:
                os.execv(sys.executable, [sys.executable] + sys.argv)
            except OSError:
                # Mac OS X versions prior to 10.6 do not support execv in
                # a process that contains multiple threads.
                os.spawnv(os.P_NOWAIT, sys.executable,
                    [sys.executable] + sys.argv)
                sys.exit(0)
        for session in list(SESSIONS.keys()):
            if "last_seen" not in SESSIONS[session]:
                # Session is in the process of being created.  We'll check it
                # the next time timeout_sessions() is called.
                continue
            if SESSIONS[session]["last_seen"] == 'connected':
                # Connected sessions do not need to be checked for timeouts
                continue
            if TIMEOUT == disabled or \
                datetime.now() > SESSIONS[session]["last_seen"] + TIMEOUT:
                # Kill the session
                logger.info(_("{session} timeout.".format(session=session)))
                if "timeout_callbacks" in SESSIONS[session]:
                    if SESSIONS[session]["timeout_callbacks"]:
                        for callback in SESSIONS[session]["timeout_callbacks"]:
                            callback(session)
                del SESSIONS[session]
    except Exception as e:
        logger.error(_(
            "Exception encountered in timeout_sessions(): {exception}".format(
                exception=e)
        ))
        import traceback
        traceback.print_exc(file=sys.stdout)

# Classes
class StaticHandler(tornado.web.StaticFileHandler):
    """
    An override of :class:`tornado.web.StaticFileHandler` to ensure that the
    Access-Control-Allow-Origin header gets set correctly.  This is necessary in
    order to support embedding Gate One into other web-based applications.

    .. note::

        Gate One performs its own origin checking so header-based access
        controls at the client are unnecessary.
    """
    # This is the only function we need to override thanks to the thoughtfulness
    # of the Tornado devs.
    def set_extra_headers(self, path):
        """
        Adds the Access-Control-Allow-Origin header to allow cross-origin
        access to static content for applications embedding Gate One.
        Specifically, this is necessary in order to support loading fonts
        from different origins.

        Also sets the 'X-UA-Compatible' header to 'IE=edge' to enforce IE 10+
        into standards mode when content is loaded from intranet sites.
        """
        self.set_header('X-UA-Compatible', 'IE=edge')
        # Allow access to our static content from any page:
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Server', 'GateOne')
        self.set_header('License', __license__)

    def options(self, path=None):
        """
        Replies to OPTIONS requests with the usual stuff (200 status, Allow
        header, etc).  Since this is just the static file handler we don't
        include any extra information.
        """
        self.set_status(200)
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Allow', 'HEAD,GET,POST,OPTIONS')
        self.set_header('Server', 'GateOne')
        self.set_header('License', __license__)

class BaseHandler(tornado.web.RequestHandler):
    """
    A base handler that all Gate One RequestHandlers will inherit methods from.

    Provides the :meth:`get_current_user` method, sets default headers, and
    provides a default :meth:`options` method that can be used for monitoring
    purposes and also for enumerating useful information about this Gate One
    server (see below for more info).
    """
    def set_default_headers(self):
        """
        An override of :meth:`tornado.web.RequestHandler.set_default_headers`
        (which is how Tornado wants you to set default headers) that
        adds/overrides the following headers:

            :Server: 'GateOne'
            :X-UA-Compatible: 'IE=edge' (forces IE 10+ into Standards mode)
        """
        # Force IE 10 into Standards Mode:
        self.set_header('X-UA-Compatible', 'IE=edge')
        self.set_header('Server', 'GateOne')
        self.set_header('License', __license__)

    def get_current_user(self):
        """Tornado standard method--implemented our way."""
        # NOTE: self.current_user is actually an @property that calls
        #       self.get_current_user() and caches the result.
        expiration = self.settings.get('auth_timeout', "14d")
        # Need the expiration in days (which is a bit silly but whatever):
        expiration = (
            float(total_seconds(convert_to_timedelta(expiration)))
            / float(86400))
        user_json = self.get_secure_cookie(
            "gateone_user", max_age_days=expiration)
        if user_json:
            user = json_decode(user_json)
            user['ip_address'] = self.request.remote_ip
            if user and 'upn' not in user:
                return None
            return user

    def options(self, path=None):
        """
        Replies to OPTIONS requests with the usual stuff (200 status, Allow
        header, etc) but also includes some useful information in the response
        body that lists which authentication API features we support in
        addition to which applications are installed.  The response body is
        conveniently JSON-encoded:

        .. ansi-block::

            \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m curl -k \
            -X OPTIONS https://gateone.company.com/ | python -mjson.tool
              % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                             Dload  Upload   Total   Spent    Left  Speed
            100   158  100   158    0     0   6793      0 --:--:-- --:--:-- --:--:--  7181
            {
                "applications": [
                    "File Transfer",
                    "Terminal",
                    "X11"
                ],
                "auth_api": {
                    "hmacs": [
                        "HMAC-SHA1",
                        "HMAC-SHA256",
                        "HMAC-SHA384",
                        "HMAC-SHA512"
                    ],
                    "versions": [
                        "1.0"
                    ]
                }
            }

        .. note::

            The 'Server' header does not supply the version information.  This
            is intentional as it amounts to an unnecessary information
            disclosure.  We don't need to make an attacker's job any easier.
        """
        settings = get_settings(options.settings_dir)
        enabled_applications = settings['*']['gateone'].get(
            'enabled_applications', [])
        if not enabled_applications:
            # List all installed apps
            for app in APPLICATIONS:
                enabled_applications.append(app.name.lower())
        self.set_status(200)
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Allow', 'HEAD,GET,POST,OPTIONS')
        self.set_header('License', __license__)
        features_dict = {
            "auth_api": {
                'versions': ['1.0'],
                'hmacs': [
                    'HMAC-SHA1', 'HMAC-SHA256', 'HMAC-SHA384', 'HMAC-SHA512']
            },
            "applications": enabled_applications
        }
        self.write(features_dict)

class HTTPSRedirectHandler(BaseHandler):
    """
    A handler to redirect clients from HTTP to HTTPS.  Only used if
    `https_redirect` is True in Gate One's settings.
    """
    def get(self):
        """Just redirects the client from HTTP to HTTPS"""
        port = self.settings['port']
        url_prefix = self.settings['url_prefix']
        host = self.request.headers.get('Host', 'localhost')
        self.redirect(
            'https://%s:%s%s' % (host, port, url_prefix))

class DownloadHandler(BaseHandler):
    """
    A :class:`tornado.web.RequestHandler` to serve up files that wind up in a
    given user's `session_dir` in the 'downloads' directory.  Generally speaking
    these files are generated by the terminal emulator (e.g. cat somefile.pdf)
    but it can be used by applications and plugins as a way to serve up
    all sorts of (temporary/transient) files to users.
    """
    # NOTE:  This is a modified version of torando.web.StaticFileHandler
    @tornado.web.authenticated
    def get(self, path, include_body=True):
        session_dir = self.settings['session_dir']
        user = self.current_user
        if user and 'session' in user:
            session = user['session']
        else:
            logger.error(_("DownloadHandler: Could not determine use session"))
            return # Something is wrong
        filepath = os.path.join(session_dir, session, 'downloads', path)
        abspath = os.path.abspath(filepath)
        if not os.path.exists(abspath):
            self.set_status(404)
            self.write(self.get_error_html(404))
            return
        if not os.path.isfile(abspath):
            raise tornado.web.HTTPError(403, "%s is not a file", path)
        import stat, mimetypes
        stat_result = os.stat(abspath)
        modified = datetime.fromtimestamp(stat_result[stat.ST_MTIME])
        self.set_header("Last-Modified", modified)
        mime_type, encoding = mimetypes.guess_type(abspath)
        if mime_type:
            self.set_header("Content-Type", mime_type)
        # Set the Cache-Control header to private since this file is not meant
        # to be public.
        self.set_header("Cache-Control", "private")
        # Add some additional headers
        self.set_header('Access-Control-Allow-Origin', '*')
        # Check the If-Modified-Since, and don't send the result if the
        # content has not been modified
        ims_value = self.request.headers.get("If-Modified-Since")
        if ims_value is not None:
            import email.utils
            date_tuple = email.utils.parsedate(ims_value)
            if_since = datetime.fromtimestamp(time.mktime(date_tuple))
            if if_since >= modified:
                self.set_status(304)
                return
        # Finally, deliver the file
        with io.open(abspath, "rb") as file:
            data = file.read()
            hasher = hashlib.sha1()
            hasher.update(data)
            self.set_header("Etag", '"%s"' % hasher.hexdigest())
            if include_body:
                self.write(data)
            else:
                assert self.request.method == "HEAD"
                self.set_header("Content-Length", len(data))

    def get_error_html(self, status_code, **kwargs):
        self.require_setting("static_url")
        if status_code in [404, 500, 503, 403]:
            filename = os.path.join(self.settings['static_url'], '%d.html' % status_code)
            if os.path.exists(filename):
                with io.open(filename, 'r') as f:
                    data = f.read()
                return data
        import httplib
        return "<html><title>%(code)d: %(message)s</title>" \
                "<body class='bodyErrorPage'>%(code)d: %(message)s</body></html>" % {
            "code": status_code,
            "message": httplib.responses[status_code],
        }

class MainHandler(BaseHandler):
    """
    Renders index.html which loads Gate One.

    Will include the minified version of gateone.js if available as
    gateone.min.js.
    """
    @tornado.web.authenticated
    @tornado.web.addslash
    # TODO: Get this auto-minifying gateone.js
    def get(self):
        # Set our server header so it doesn't say TornadoServer/<version>
        hostname = os.uname()[1]
        location = self.get_argument("location", "default")
        prefs = self.get_argument("prefs", None)
        gateone_js = "%sstatic/gateone.js" % self.settings['url_prefix']
        minified_js_abspath = os.path.join(GATEONE_DIR, 'static')
        minified_js_abspath = os.path.join(
            minified_js_abspath, 'gateone.min.js')
        js_init = self.settings['js_init']
        # Use the minified version if it exists
        if options.logging.lower() != 'debug':
            if os.path.exists(minified_js_abspath):
                gateone_js = (
                    "%sstatic/gateone.min.js" % self.settings['url_prefix'])
        template_path = os.path.join(GATEONE_DIR, 'templates')
        index_path = os.path.join(template_path, 'index.html')
        head_html = ""
        body_html = ""
        for plugin, hooks in PLUGIN_HOOKS.items():
            if 'HTML' in hooks:
                if 'head' in hooks['HTML']:
                    if hooks['HTML']['head']:
                        for item in hooks['HTML']['head']:
                            head_html += "%s\n" % item
                if 'body' in hooks['HTML']:
                    if hooks['HTML']['body']:
                        for item in hooks['HTML']['body']:
                            body_html += "%s\n" % item
        self.render(
            index_path,
            hostname=hostname,
            gateone_js=gateone_js,
            location=location,
            js_init=js_init,
            url_prefix=self.settings['url_prefix'],
            head=head_html,
            body=body_html,
            prefs=prefs
        )

class GOApplication(OnOffMixin):
    """
    The base from which all Gate One Applications will inherit.  Applications
    are expected to be written like so::

        class SomeApplication(GOApplication):
            def initialize(self):
                "Called when the Application is instantiated."
                initialize_stuff()
                # Here's some good things to do in an initialize() function...
                # Register a policy-checking function:
                self.ws.security.update({'some_app': policy_checking_func})
                # Register some WebSocket actions (note the app:action naming convention)
                self.ws.actions.update({
                    'some_app:do_stuff': self.do_stuff,
                    'some_app:do_other_stuff': self.do_other_stuff
                })
            def open(self):
                "Called when the connection is established."
                # Setup whatever is necessary for session tracking and whatnot.
            def authenticate(self):
                "Called when the user *successfully* authenticates."
                # Here's the best place to instantiate things, send the user
                # JavaScript/CSS files, and similar post-authentication details.
            def on_close(self):
                "Called when the connection is closed."
                # This is a good place to halt any background/periodic operations.

    GOApplications will be automatically imported into Gate One and registered
    appropriately as long as they follow the following conventions:

        * The application and its module(s) should live inside its own directory inside the 'applications' directory.  For example, `/opt/gateone/applications/some_app/some_app.py`
        * Subclasses of `GOApplication` must be added to an `apps` global (list) inside of the application's module(s) like so: `apps = [SomeApplication]` (usually a good idea to put that at the very bottom of the module).

    .. note::

        All .py modules inside of the application's main directory will be
        imported even if they do not contain or register a `GOApplication`.

    .. tip::

        You can add command line arguments to Gate One by calling
        :func:`tornado.options.define` anywhere in your application's global
        namespace.  This works because the :func:`~tornado.options.define`
        function registers options in Gate One's global namespace (as
        `tornado.options.options`) and Gate One imports application modules
        before it evaluates command line arguments.
    """
    # You'll want to override these values in your own app:
    info = {
        'name': "Unknown App",
        'description': (
            "The application developer has yet to provide a description.")
    }
    # NOTE: The above 'info' dict will be sent to the client.
    # NOTE: The icon value will be replaced with the actual icon data.
    def __init__(self, ws):
        self.ws = ws # WebSocket instance
        self.current_user = ws.current_user
        # Setup some shortcuts to make things more natural and convenient
        self.write_message = ws.write_message
        self.write_binary = ws.write_binary
        self.render_and_send_css = ws.render_and_send_css
        self.render_style = ws.render_style
        self.send_css = ws.send_css
        self.send_js = ws.send_js
        self.close = ws.close
        self.security = ws.security
        self.request = ws.request
        self.settings = ws.settings
        self.io_loop = tornado.ioloop.IOLoop.current()
        self.cpu_async = CPU_ASYNC
        self.io_async = IO_ASYNC

    def __repr__(self):
        return "GOApplication: %s" % self.__class__

    def __str__(self):
        return self.info['name']

    def initialize(self):
        """
        Called by :meth:`ApplicationWebSocket.open` after __init__().
        GOApplications can override this function to perform their own actions
        when the Application is initialized (happens just before the WebSocket
        is opened).
        """
        pass

    def open(self):
        """
        Called by :meth:`ApplicationWebSocket.open` after the WebSocket is
        opened.  GOApplications can override this function to perform their own
        actions when the WebSocket is opened.
        """
        pass

    def on_close(self):
        """
        Called by :meth:`ApplicationWebSocket.on_close` after the WebSocket is
        closed.  GOApplications can override this function to perform their own
        actions when the WebSocket is closed.
        """
        pass

    def add_handler(self, pattern, handler, **kwargs):
        """
        Adds the given *handler* (`tornado.web.RequestHandler`) to the Tornado
        Application (`self.ws.application`) to handle URLs matching *pattern*.
        If given, *kwargs* will be added to the `tornado.web.URLSpec` when the
        complete handler is assembled.

        .. note::

            If the *pattern* does not start with the configured `url_prefix` it
            will be automatically prepended.
        """
        logging.debug("Adding handler: (%s, %s)" % (pattern, handler))
        url_prefix = self.ws.settings['url_prefix']
        if not pattern.startswith(url_prefix):
            if pattern.startswith('/'):
                # Get rid of the / (it will be in the url_prefix)
                pattern = pattern.lstrip('/')
        spec = tornado.web.URLSpec(pattern, handler, kwargs)
        # Why the Tornado devs didn't give us a simple way to do this is beyond
        # me.
        self.ws.application.handlers[0][1].append(spec)

    def add_timeout(self, timeout, func):
        """
        A convenience function that calls the given *func* after *timeout* using
        ``self.io_loop.add_timeout()`` (which uses
        :meth:`tornado.ioloop.IOLoop.add_timeout`).

        The given *timeout* may be a `datetime.timedelta` or a string compatible
        with `utils.convert_to_timedelta` such as, "5s" or "10m".
        """
        if isinstance(timeout, basestring):
            timeout = convert_to_timedelta(timeout)
        self.io_loop.add_timeout(timeout, func)

class ApplicationWebSocket(WebSocketHandler, OnOffMixin):
    """
    The main WebSocket interface for Gate One, this class is setup to call
    WebSocket 'actions' which are methods registered in `self.actions`.
    Methods that are registered this way will be exposed and directly callable
    over the WebSocket.
    """
    instances = set()
    # These three attributes handle watching files for changes:
    watched_files = {}     # Format: {<file path>: <modification time>}
    file_update_funcs = {} # Format: {<file path>: <function called on update>}
    file_watcher = None    # Will be replaced with a PeriodicCallback
    prefs = {} # Gets updated with every call to initialize()
    def __init__(self, application, request, **kwargs):
        self.user = None
        self.actions = {
            'go:ping': self.pong,
            'go:log': self.log_message,
            'go:authenticate': self.authenticate,
            'go:get_theme': self.get_theme,
            'go:get_js': self.get_js,
            'go:enumerate_themes': self.enumerate_themes,
            'go:file_request': self.file_request,
            'go:cache_cleanup': self.cache_cleanup,
            'go:send_user_message': self.send_user_message,
            'go:broadcast': self.broadcast,
            'go:list_users': self.list_server_users,
            'go:get_locations': self.get_locations,
            'go:set_location': self.set_location,
            'go:set_locale': self.set_locale,
            'go:debug': self.debug,
        }
        # Setup some instance-specific loggers that we can later update with
        # more metadata
        self.io_loop = tornado.ioloop.IOLoop.current()
        self.logger = go_logger(None)
        self.sync_log = go_logger('gateone.sync')
        self.msg_log = go_logger('gateone.message')
        self.auth_log = go_logger('gateone.auth')
        self.client_log = go_logger('gateone.client')
        self._events = {}
        self.session = None # Just a placeholder; gets set in authenticate()
        self.locations = {} # Just a placeholder; gets set in authenticate()
        self.location = None # Just a placeholder; gets set in authenticate()
        # This is used to keep track of used API authentication signatures so
        # we can prevent replay attacks.
        self.prev_signatures = []
        self.origin_denied = True # Only allow valid origins
        self.file_cache = FILE_CACHE # So applications and plugins can reference
        self.persist = PERSIST # So applications and plugins can reference
        self.apps = [] # Gets filled up by self.initialize()
        # The security dict stores applications' various policy functions
        self.security = {}
        self.container = ""
        self.prefix = ""
        self.latency_count = 12 # Starts at 12 so the first ping is logged
        self.pinger = None # Replaced with a PeriodicCallback inside open()
        self.timestamps = [] # Tracks/averages client latency
        self.latency = 0 # Keeps a running average
        WebSocketHandler.__init__(self, application, request, **kwargs)

    @classmethod
    def file_checker(cls):
        """
        A `Tornado.IOLoop.PeriodicCallback` that regularly checks all files
        registered in the `ApplicationWebSocket.watched_files` dict for changes.

        If changes are detected the corresponding function(s) in
        `ApplicationWebSocket.file_update_funcs` will be called.
        """
        #logging.debug("file_checker()") # Noisy so I've commented it out
        if not SESSIONS:
            # No connected sessions; no point in watching files
            cls.file_watcher.stop()
            # Also remove the broadcast file so we know to start up the
            # file_watcher again if a user connects.
            session_dir = options.session_dir
            broadcast_file = os.path.join(session_dir, 'broadcast') # Default
            broadcast_file = cls.prefs['*']['gateone'].get(
                'broadcast_file', broadcast_file) # If set, use that
            del cls.watched_files[broadcast_file]
            del cls.file_update_funcs[broadcast_file]
            os.remove(broadcast_file)
        for path, mtime in list(cls.watched_files.items()):
            if not os.path.exists(path):
                # Someone deleted something they shouldn't have
                logger.error(_(
                    "{path} has been removed.  Removing from file "
                    "checker.".format(path=path)))
                del cls.watched_files[path]
                del cls.file_update_funcs[path]
                continue
            current_mtime = os.stat(path).st_mtime
            if current_mtime == mtime:
                continue
            try:
                cls.watched_files[path] = current_mtime
                cls.file_update_funcs[path]()
            except Exception as e:
                logger.error(_(
                    "Exception encountered trying to execute the file update "
                    "function for {path}...".format(path=path)))
                logger.error(e)
                if options.logging == 'debug':
                    import traceback
                    traceback.print_exc(file=sys.stdout)

    @classmethod
    def watch_file(cls, path, func):
        """
        A classmethod that registers the given file *path* and *func* in
        `ApplicationWebSocket.watched_files` and
        `ApplicationWebSocket.file_update_funcs`, respectively.  The given
        *func* will be called (by `ApplicationWebSocket.file_checker`) whenever
        the file at *path* is modified.
        """
        logging.debug("watch_file('{path}', {func}())".format(
            path=path, func=func.__name__))
        cls.watched_files.update({path: os.stat(path).st_mtime})
        cls.file_update_funcs.update({path: func})

    @classmethod
    def load_prefs(cls):
        """
        Loads all of Gate One's settings from `options.settings_dir` into
        ``cls.prefs``.

        .. note::

            This ``classmethod`` gets called automatically whenever a change is
            detected inside Gate One's ``settings_dir``.
        """
        logger.info(_(
            "Settings have been modified.  Reloading from %s"
            % options.settings_dir))
        prefs = get_settings(options.settings_dir)
        # Only overwrite our settings if everything is proper
        if 'gateone' not in prefs['*']:
            # NOTE: get_settings() records its own errors too
            logger.info(_("Settings have NOT been loaded."))
            return
        cls.prefs = prefs
        # Reset the memoization dict so that everything using
        # applicable_policies() gets the latest & greatest settings
        MEMO.clear()

    @classmethod
    def broadcast_file_update(cls):
        """
        Called when there's an update to the `broadcast_file` (e.g.
        `<session_dir>/broadcast`); broadcasts its contents to all connected
        users.  The message will be displayed via the
        :js:meth:`GateOne.Visual.displayMessage` function at the client and can
        be formatted with HTML.  For this reason it is important to strictly
        control write access to the broadcast file.

        .. note::

            Under normal circumstances only root (or the owner of the
            gateone.py process) can enter and/or write to files inside
            Gate One's `session_dir` directory.

        The path to the broadcast file can be configured via the
        `broadcast_file` setting which can be placed anywhere under the
        'gateone' application/scope (e.g. inside 10server.conf).  The setting
        isn't there by default but you can simply add it if you wish:

        .. code-block:: javascript

            "broadcast_file": "/whatever/path/you/want/broadcast"

        .. tip::

            Want to broadcast a message to all the users currently connected to
            Gate One?  Just `sudo echo "your message" > /tmp/gateone/broadcast`.
        """
        session_dir = options.session_dir
        broadcast_file = os.path.join(session_dir, 'broadcast')
        broadcast_file = cls.prefs['*']['gateone'].get(
            'broadcast_file', broadcast_file)
        with io.open(broadcast_file) as f:
            message = f.read()
        if message:
            message = message.rstrip()
            metadata = {'clients': []}
            for instance in cls.instances:
                try: # Only send to users that have authenticated
                    user = instance.current_user
                except AttributeError:
                    continue
                user_info = {
                    'upn': user['upn'],
                    'ip_address': user['ip_address']
                }
                metadata['clients'].append(user_info)
            msg_log.info(
                "Broadcast (via broadcast_file): %s" % message,
                metadata=metadata)
            message_dict = {'go:user_message': message}
            cls._deliver(message_dict, upn="AUTHENTICATED")
            io.open(broadcast_file, 'w').write(u'') # Empty it out

    def initialize(self, apps=None, **kwargs):
        """
        This gets called by the Tornado framework when `ApplicationWebSocket` is
        instantiated.  It will be passed the list of *apps* (Gate One
        applications) that are assigned inside the :class:`GOApplication`
        object.  These :class:`GOApplication`s will be instantiated and stored
        in `self.apps`.

        These *apps* will be mutated in-place so that `self` will refer to the
        current instance of :class:`ApplicationWebSocket`.  Kind of like a
        dynamic mixin.
        """
        logging.debug('ApplicationWebSocket.initialize(%s)' % apps)
        # Make sure we have all prefs ready for checking
        cls = ApplicationWebSocket
        cls.prefs = get_settings(options.settings_dir)
        if not os.path.exists(self.settings['cache_dir']):
            mkdir_p(self.settings['cache_dir'])
        for plugin_name, hooks in PLUGIN_HOOKS.items():
            if 'Events' in hooks:
                for event, callback in hooks['Events'].items():
                    self.on(event, callback)
        self.on("go:authenticate", self.send_extra)
        # Setup some actions to take place after the user authenticates
        # Send our plugin .js and .css files to the client
        send_plugin_static_files = partial(
            self.send_plugin_static_files, os.path.join(GATEONE_DIR, 'plugins'))
        self.on("go:authenticate", send_plugin_static_files)
        # Tell the client about any existing locations where applications may be
        # storing things like terminal instances and whatnot:
        self.on("go:authenticate", self.get_locations)
        # This is so the client knows what applications it can use:
        self.on("go:authenticate", self.list_applications)
        # This starts up the PeriodicCallback that watches sessions for timeouts
        # and cleans them up (if not already started):
        self.on("go:authenticate", self._start_session_watcher)
        # This starts up the PeriodicCallback that watches and cleans up old
        # user logs (anything in gateone/users/<user>/logs):
        self.on("go:authenticate", self._start_cleaner)
        # This starts up the file watcher PeriodicCallback:
        self.on("go:authenticate", self._start_file_watcher)
        # This ensures that sessions will timeout immediately if session_timeout
        # is set to 0:
        self.on("go:close", timeout_sessions)
        if not apps:
            return
        for app in apps:
            instance = app(self)
            self.apps.append(instance)
            logging.debug("Initializing %s" % instance)
            if hasattr(instance, 'initialize'):
                instance.initialize()

    def send_extra(self):
        """
        Sends any extra JS/CSS files placed in Gate One's 'static/extra'
        directory.  Can be useful if you want to use Gate One's file
        synchronization and caching capabilities in your app.

        .. note::

            You may have to create the 'static/extra' directory before putting
            files in there.
        """
        extra_path = os.path.join(GATEONE_DIR, 'static', 'extra')
        if not os.path.isdir(extra_path):
            return # Nothing to do
        for filename in os.listdir(extra_path):
            filepath = os.path.join(extra_path, filename)
            if filename.endswith('.js'):
                self.send_js(filepath)
            elif filename.endswith('.css'):
                self.send_css(filepath)

    def allow_draft76(self):
        """
        By overriding this function we're allowing the older version of the
        WebSockets protocol.  As long as communications happens over SSL there
        shouldn't be any security concerns with this.  This is mostly to support
        iOS Safari.
        """
        return True

    def get_current_user(self):
        """
        Mostly identical to the function of the same name in MainHandler.  The
        difference being that when API authentication is enabled the WebSocket
        will expect and perform its own auth of the client.
        """
        if self.user:
            return self.user
        expiration = self.settings.get('auth_timeout', "14d")
        # Need the expiration in days (which is a bit silly but whatever):
        expiration = (
            float(total_seconds(convert_to_timedelta(expiration)))
            / float(86400))
        user_json = self.get_secure_cookie(
            "gateone_user", max_age_days=expiration)
        if not user_json:
            if not self.settings['auth']:
                # This can happen if the user's browser isn't allowing
                # persistent cookies (e.g. incognito mode)
                return {'upn': 'ANONYMOUS', 'session': generate_session_id()}
            return None
        user = json_decode(user_json)
        user['ip_address'] = self.request.remote_ip
        return user

    def write_binary(self, message):
        """
        Writes the given *message* to the WebSocket in binary mode (opcode
        0x02).  Binary WebSocket messages are handled differently from regular
        messages at the client (they use a completely different 'action'
        mechanism).  For more information see the JavaScript developer
        documentation.
        """
        self.write_message(message, binary=True)

    def valid_origin(self, origin):
        """
        Checks if the given *origin* matches what's been set in Gate One's
        "origins" setting (usually in 10server.conf).  The *origin* will first
        be checked for an exact match in the "origins" setting but if that fails
        each valid origin will be evaluated as a regular expression (if it's not
        a valid hostname) and the given *origin* will be checked against that.

        Returns ``True`` if *origin* is valid.

        .. note::

            If '*' is in the "origins" setting (anywhere) all origins will be
            allowed.
        """
        valid = False
        if 'origins' in self.settings['cli_overrides']:
            # If given on the command line, always use those origins
            valid_origins = self.settings['origins']
        else:
            # Why have this separate?  So you can change origins on-the-fly by
            # modifying 10server.conf (or whatever other conf you put it in).
            valid_origins = self.prefs['*']['gateone'].get('origins', [])
        if '*' in valid_origins:
            valid = True
        elif origin in valid_origins:
            valid = True
        if not valid:
            # Treat the list of valid origins as regular expressions
            for check_origin in valid_origins:
                if valid_hostname(check_origin):
                    continue # Valid hostnames aren't regular expressions
                match = re.match(check_origin, origin)
                if match:
                    valid = True
                    break
        return valid

    def open(self):
        """
        Called when a new WebSocket is opened.  Will deny access to any
        origin that is not defined in `self.settings['origin']`.  Also sends
        any relevant localization data (JavaScript) to the client and calls the
        :meth:`open` method of any and all enabled Applications.

        This method kicks off the process that sends keepalive pings/checks to
        the client (A `~tornado.ioloop.PeriodicCallback` set as `self.pinger`).

        This method also sets the following instance attributes:

            * `self.client_id`: Unique identifier for this instance.
            * `self.base_url`: The base URL (e.g. https://foo.com/gateone/) used to access Gate One.
            * `self.origin`: A shortcut to reference the client's origin.

        Triggers the `go:open` event.

        .. note::

            `self.settings` comes from the Tornado framework and includes most
            command line arguments and the settings from the `settings_dir` that
            fall under the "gateone" scope.  It is not the same thing as
            `self.prefs` which includes *all* of Gate One's settings (including
            settings for other applications and scopes).
        """
        cls = ApplicationWebSocket
        cls.instances.add(self)
        if hasattr(self, 'set_nodelay'):
            # New feature of Tornado 3.1 that can reduce latency:
            self.set_nodelay(True)
        if 'Origin' in self.request.headers:
            origin = self.request.headers['Origin']
        elif 'Sec-Websocket-Origin' in self.request.headers: # Old version
            origin = self.request.headers['Sec-Websocket-Origin']
        origin = origin.lower() # hostnames are case-insensitive
        origin = origin.split('://', 1)[1]
        self.origin = origin
        client_address = self.request.remote_ip
        logging.debug("open() origin: %s" % origin)
        if not self.valid_origin(origin):
            self.origin_denied = True
            denied_msg = _('Access denied for origin: %s') % origin
            auth_log.error(denied_msg)
            self.write_message(denied_msg)
            self.write_message(_(
                "If you feel this is incorrect you just have to add '%s' to"
                " the 'origins' option in your Gate One settings (e.g. "
                "inside your 10server.conf).  See the docs for details.")
                % origin)
            self.close()
            return
        self.origin_denied = False
        # client_id is unique to the browser/client whereas session_id is unique
        # to the user.  It isn't used much right now but it will be useful in
        # the future once more stuff is running over WebSockets.
        self.client_id = generate_session_id()
        self.base_url = "{protocol}://{host}{url_prefix}".format(
            protocol=self.request.protocol,
            host=self.request.host,
            port=self.settings['port'],
            url_prefix=self.settings['url_prefix'])
        user = self.current_user
        # NOTE: self.current_user will call self.get_current_user() and set
        # self._current_user the first time it is used.
        metadata = {'ip_address': client_address}
        if user and 'upn' in user:
            # Update our loggers to include the user metadata
            metadata['upn'] = user['upn']
            # NOTE: NOT using self.auth_log() here on purpose:
            auth_log.info( # Use global auth_log so we're not redundant
                _("WebSocket opened (%s %s) via origin %s.") % (
                    user['upn'], client_address, origin))
        else:
            # NOTE: NOT using self.auth_log() here on purpose:
            auth_log.info(_(
                '{"ip_address": "%s"} WebSocket opened (unknown user).')
            % client_address)
        # NOTE: These get updated with more metadata inside of authenticate():
        self.logger = go_logger(None, **metadata)
        self.sync_log = go_logger('gateone.sync', **metadata)
        self.auth_log = go_logger('gateone.auth', **metadata)
        self.msg_log = go_logger('gateone.message', **metadata)
        self.client_log = go_logger('gateone.client', **metadata)
        if user and 'upn' not in user: # Invalid user info
            # NOTE: NOT using self.auth_log() here on purpose:
            auth_log.error(_(
                '{"ip_address": "%s"} Unauthenticated WebSocket attempt.'
                ) % client_address)
            # In case this is a legitimate client that simply had its auth info
            # expire/go bad, tell it to re-auth by calling the appropriate
            # action on the other side.
            message = {'go:reauthenticate': True}
            self.write_message(json_encode(message))
            self.close() # Close the WebSocket
        # NOTE: By getting the prefs with each call to open() we make
        #       it possible to make changes inside the settings dir without
        #       having to restart Gate One (just need to wait for users to
        #       eventually re-connect or reload the page).
        # NOTE: Why store prefs in the class itself?  No need for redundancy.
        if 'cache_dir' not in cls.prefs['*']['gateone']:
            # Set the cache dir to a default if not set in the prefs
            cache_dir = self.settings['cache_dir']
            cls.prefs['*']['gateone']['cache_dir'] = cache_dir
            if self.settings['debug']:
                # Clean out the cache_dir every page reload when in debug mode
                for fname in os.listdir(cache_dir):
                    filepath = os.path.join(cache_dir, fname)
                    os.remove(filepath)
        # NOTE: This is here so that the client will have all the necessary
        # strings *before* the calls to various init() functions.
        self.send_js_translation()
        additional_files = [
            'gateone_utils_extra.js',
            'gateone_visual_extra.js',
            'gateone_input.js',
            'gateone_misc.js'
        ]
        for js_file in additional_files:
            self.send_js(os.path.join(GATEONE_DIR, 'static', js_file))
        for app in self.apps:
            if hasattr(app, 'open'):
                app.open() # Call applications' open() functions (if any)
        # Ping the client every 5 seconds so we can keep track of latency and
        # ensure firewalls don't close the connection.
        def send_ping():
            try:
                self.ping(str(int(time.time() * 1000)).encode('utf-8'))
            except (WebSocketClosedError, AttributeError):
                # Connection closed
                self.pinger.stop()
                del self.pinger
        send_ping()
        interval = 5000 # milliseconds
        self.pinger = tornado.ioloop.PeriodicCallback(send_ping, interval)
        self.pinger.start()
        self.trigger("go:open")

    def on_message(self, message):
        """
        Called when we receive a message from the client.  Performs some basic
        validation of the message, decodes it (JSON), and finally calls an
        appropriate WebSocket action (registered method) with the message
        contents.
        """
        # This is super useful when debugging:
        logging.debug("message: %s" % repr(message))
        if self.origin_denied:
            self.auth_log.error(_("Message rejected due to invalid origin."))
            self.close() # Close the WebSocket
        message_obj = None
        try:
            message_obj = json_decode(message) # JSON FTW!
            if not isinstance(message_obj, dict):
                self.write_message(_("'Error: Message bust be a JSON dict.'"))
                return
        except ValueError: # We didn't get JSON
            self.write_message(_("'Error: We only accept JSON here.'"))
            return
        if message_obj:
            for key, value in message_obj.items():
                if key in PLUGIN_WS_CMDS:
                    try: # Plugins first so they can override behavior
                        PLUGIN_WS_CMDS[key](value, tws=self)
                        # tws==ApplicationWebSocket
                    except (KeyError, TypeError, AttributeError) as e:
                        self.logger.error(_(
                            "Error running plugin WebSocket action: %s" % key))
                else:
                    try:
                        if value is None:
                            self.actions[key]()
                        else:
                            # Try, try again
                            self.actions[key](value)
                    except (KeyError, TypeError, AttributeError) as e:
                        import traceback
                        for frame in traceback.extract_tb(sys.exc_info()[2]):
                            fname, lineno, fn, text = frame
                        self.logger.error(_(
                         "Error/Unknown WebSocket action, %s: %s (%s line %s)" %
                         (key, e, fname, lineno)))
                        if self.settings['logging'] == 'debug':
                            traceback.print_exc(file=sys.stdout)

    def on_close(self):
        """
        Called when the client terminates the connection.  Also calls the
        :meth:`on_close` method of any and all enabled Applications.

        Triggers the `go:close` event.
        """
        logging.debug("on_close()")
        ApplicationWebSocket.instances.discard(self)
        user = self.current_user
        client_address = self.request.connection.address[0]
        if user and user['session'] in SESSIONS:
            if self.client_id in SESSIONS[user['session']]['client_ids']:
                SESSIONS[user['session']]['client_ids'].remove(self.client_id)
            # This check is so we don't accidentally timeout a user's session if
            # the server has session_timeout=0 and the user still has a browser
            # connected at a different location:
            if not SESSIONS[user['session']]['client_ids']:
                # Update 'last_seen' with a datetime object for accuracy
                SESSIONS[user['session']]['last_seen'] = datetime.now()
        if user and 'upn' in user:
            self.auth_log.info(
                _("WebSocket closed (%s %s).") % (user['upn'], client_address))
        else:
            self.auth_log.info(_("WebSocket closed (unknown user)."))
        if self.pinger:
            self.pinger.stop()
        # Call applications' on_close() functions (if any)
        for app in self.apps:
            if hasattr(app, 'on_close'):
                app.on_close()
        self.trigger("go:close")

    def on_pong(self, timestamp):
        """
        Records the latency of clients (from the server's perspective) via a
        log message.

        .. note::

            This is the ``pong`` specified in the WebSocket protocol itself.
            The `pong` method is a Gate One-specific implementation.
        """
        self.latency_count += 1
        latency = int(time.time() * 1000) - int(timestamp)
        if latency < 0:
            return # Something went wrong; skip this one
        self.timestamps.append(latency)
        if len(self.timestamps) > 10:
            self.timestamps.pop(0)
        self.latency = sum(self.timestamps)/len(self.timestamps)
        if self.latency_count > 12: # Only log once a minute
            self.latency_count = 0
            self.logger.info(_("WebSocket Latency: {0}ms").format(self.latency))

    def pong(self, timestamp):
        """
        Attached to the `go:ping` WebSocket action; responds to a client's
        ``ping`` by returning the value (*timestamp*) that was sent.  This
        allows the client to measure the round-trip time of the WebSocket.

        .. note::

            This is a WebSocket action specific to Gate One. It
        """
        message = {'go:pong': timestamp}
        self.write_message(json_encode(message))

    @require(policies('gateone'))
    def log_message(self, log_obj):
        """
        Attached to the `go:log` WebSocket action; logs the given *log_obj* via
        :meth:`ApplicationWebSocket.client_log`.  The *log_obj* should be a
        dict (JSON object, really) in the following format::

            {
                "level": "info", # Optional
                "message": "Actual log message here"
            }

        If a "level" is not given the "info" level will be used.

        *Supported Levels:* "info", "error", "warning", "debug", "fatal",
        "critical".

        .. note::

            The "critical" and "fatal" log levels both use the
            `logging.Logger.critical` method.
        """
        if not self.current_user:
            return # Don't let unauthenticated users log messages.
            # NOTE:  We're not using the authenticated() check here so we don't
            # end up logging a zillion error messages when an unauthenticated
            # user's client has debug logging enabled.
        if "message" not in log_obj:
            return # Nothing to do
        log_obj["level"] = log_obj.get("level", "info") # Default to "info"
        loggers = {
            "info": self.client_log.info,
            "warning": self.client_log.warning,
            "error": self.client_log.error,
            "debug": self.client_log.debug,
            "fatal": self.client_log.critical, # Python doesn't use "fatal"
            "critical": self.client_log.critical,
        }
        if isinstance(log_obj["message"], bytes):
            log_msg = log_obj["message"]
        else:
            log_msg = log_obj["message"].encode('utf-8')
        loggers[log_obj["level"].lower()](
            "Client Logging: {0}".format(log_msg))

    def api_auth(self, auth_obj):
        """
        If the *auth_obj* dict validates, returns the user dict and sets
        ``self.current_user``.  If it doesn't validate, returns ``False``.

        This function also takes care of creating the user's directory if it
        does not exist and creating/updating the user's 'session' file (which
        just stores metadata related to their session).

        Example usage::

            auth_obj = {
                'api_key': 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
                'upn': 'joe@company.com',
                'timestamp': '1323391717238',
                'signature': <gibberish>,
                'signature_method': 'HMAC-SHA1',
                'api_version': '1.0'
            }
            result = self.api_auth(auth_obj)

        .. seealso:: :ref:`api-auth` documentation.

        Here's a rundown of the required *auth_obj* parameters:

            :api_key:
                The first half of what gets generated when you run
                ``gateone --new_api_key`` (the other half is the secret).
            :upn:
                The userPrincipalName (aka username) of the user being
                authenticated.
            :timestamp:
                A 13-digit "time since the epoch" JavaScript-style timestamp.
                Both integers and strings are accepted.
                Example JavaScript: ``var timestamp = new Date().getTime()``
            :signature:
                The HMAC signature of the combined *api_key*, *upn*, and
                *timestamp*; hashed using the secret associated with the given
                *api_key*.
            :signature_method:
                The hashing algorithm used to create the *signature*.  Currently
                this must be one of "HMAC-SHA1", "HMAC-SHA256", "HMAC-SHA384",
                or "HMAC-SHA512"
            :api_version:
                Which version of the authentication API to use when performing
                authentication.  Currently the only supported version is '1.0'.

        .. note::

            Any additional key/value pairs that are included in the *auth_obj*
            will be assigned to the ``self.current_user`` object.  So if you're
            embedding Gate One and wish to associate extra metadata with the
            user you may do so via the API authentication process.
        """
        from .utils import create_signature
        reauth = {'go:reauthenticate': True}
        api_key = auth_obj.get('api_key', None)
        if not api_key:
            self.auth_log.error(_(
                'API AUTH: Invalid API authentication object (missing api_key).'
            ))
            self.write_message(json_encode(reauth))
            return False
        upn = auth_obj['upn']
        timestamp = str(auth_obj['timestamp']) # str in case integer
        signature = auth_obj['signature']
        signature_method = auth_obj['signature_method']
        api_version = auth_obj['api_version']
        supported_hmacs = {
            'HMAC-SHA1': hashlib.sha1,
            'HMAC-SHA256': hashlib.sha256,
            'HMAC-SHA384': hashlib.sha384,
            'HMAC-SHA512': hashlib.sha512,
        }
        if signature_method not in supported_hmacs:
            self.auth_log.error(_(
                    'API AUTH: Unsupported API auth '
                    'signature method: %s' % signature_method))
            self.write_message(json_encode(reauth))
            return False
        hmac_algo = supported_hmacs[signature_method]
        if api_version != "1.0":
            self.auth_log.error(_(
                    'API AUTH: Unsupported API version:'
                    '%s' % api_version))
            self.write_message(json_encode(reauth))
            return False
        try:
            secret = self.settings['api_keys'][api_key]
        except KeyError:
            self.auth_log.error(_(
                'API AUTH: API Key not found.'))
            self.write_message(json_encode(reauth))
            return False
# TODO: Make API version 1.1 that signs *all* attributes--not just the known ones
        # Check the signature against existing API keys
        sig_check = create_signature(
            secret, api_key, upn, timestamp, hmac_algo=hmac_algo)
        if sig_check != signature:
            self.auth_log.error(_('API AUTH: Signature check failed.'))
            self.write_message(json_encode(reauth))
            return False
        # Everything matches (great!) so now we do due diligence
        # by checking the timestamp against the
        # api_timestamp_window setting and whether or not we've
        # already used it (to prevent replay attacks).
        if signature in self.prev_signatures:
            self.auth_log.error(_(
                "API AUTH: replay attack detected!  User: "
                "%s, Remote IP: %s, Origin: %s" % (
                upn, self.request.remote_ip, self.origin)))
            message = {'go:notice': _(
                'API AUTH: Replay attack detected!  This '
                'event has been logged.')}
            self.write_message(json_encode(message))
            return
        window = self.settings['api_timestamp_window']
        then = datetime.fromtimestamp(int(timestamp)/1000)
        time_diff = datetime.now() - then
        if time_diff > window:
            self.auth_log.error(_(
                "API AUTH: Authentication failed due to an expired auth "
                "object.  If you just restarted the server this is "
                "normal (users just need to reload the page).  If "
                " this problem persists it could be a problem with "
                "the server's clock (either this server or the "
                "server(s) embedding Gate One)."
            ))
            message = {'go:notice': _(
                'AUTH FAILED: Authentication object timed out. '
                'Try reloading this page (F5).')}
            self.write_message(json_encode(message))
            message = {'go:notice': _(
                'AUTH FAILED: If the problem persists after '
                'reloading this page please contact your server'
                ' administrator to notify them of the issue.')}
            self.write_message(json_encode(message))
            return False
        logging.debug(_("API Authentication Successful"))
        self.prev_signatures.append(signature) # Prevent replays
        # Attach any additional provided keys/values to the user
        # object so applications embedding Gate One can use
        # them in their own plugins and whatnot.
        user = {}
        known_params = [
            'api_key',
            'api_version',
            'timestamp',
            'signature',
            'signature_method'
        ]
        for key, value in auth_obj.items():
            if key not in known_params:
                user[key] = value
        # user dicts need a little extra attention for IPs...
        user['ip_address'] = self.request.remote_ip
        # Force-set the current user:
        self._current_user = user
        # Make a directory to store this user's settings/files/logs/etc
        user_dir = os.path.join(self.settings['user_dir'], user['upn'])
        if not os.path.exists(user_dir):
            self.logger.info(_("Creating user directory: %s" % user_dir))
            mkdir_p(user_dir)
            os.chmod(user_dir, 0o770)
        session_file = os.path.join(user_dir, 'session')
        if os.path.exists(session_file):
            with io.open(session_file) as f:
                session_data = f.read()
            user['session'] = json_decode(session_data)['session']
        else:
            user['session'] = generate_session_id()
            session_info_json = json_encode(user)
            with io.open(session_file, 'w') as f:
                # Save it so we can keep track across multiple clients
                f.write(session_info_json)
        return user

    def authenticate(self, settings):
        """
        Authenticates the client by first trying to use the 'gateone_user'
        cookie or if Gate One is configured to use API authentication it will
        use *settings['auth']*.  Additionally, it will accept
        *settings['container']* and *settings['prefix']* to apply those to the
        equivalent properties (`self.container` and `self.prefix`).

        If *settings['url']* is provided it will be used to update
        `self.base_url` (so that we can correct for situations where Gate One
        is running behind a reverse proxy with a different protocol/URL than
        what the user used to connect).

        .. note::

            'container' refers to the element on which Gate One was initialized
            at the client (e.g. `#gateone`).  'prefix' refers to the string that
            will be prepended to all Gate One element IDs when added to the web
            page (to avoid namespace conflicts).  Both these values are only
            used when generating CSS templates.

        If *settings['location']* is something other than 'default' all new
        application instances will be associated with the given (string) value.
        These applications will be treated separately so they can exist in a
        different browser tab/window.

        Triggers the `go:authenticate` event.
        """
        logging.debug("authenticate(): %s" % settings)
        # Make sure the client is authenticated if authentication is enabled
        reauth = {'go:reauthenticate': True}
        user = self.current_user # Just a shortcut to keep lines short
        auth_method = self.settings.get('auth', None)
        if auth_method and auth_method != 'api':
            # Regular, non-API authentication
            if settings['auth']:
                # Try authenticating with the given (encrypted) 'auth' value
                expiration = self.settings.get('auth_timeout', "14d")
                expiration = (
                    float(total_seconds(convert_to_timedelta(expiration)))
                    / float(86400))
                auth_data = self.get_secure_cookie("gateone_user",
                    value=settings['auth'], max_age_days=expiration)
                # NOTE:  This will override whatever is in the cookie.
                # Why?  Because we'll eventually transition to not using cookies
                if auth_data:
                    # Force-set the current user
                    self._current_user = json_decode(auth_data)
                    # Add/update the user's IP address
                    self._current_user['ip_address'] = self.request.remote_ip
                    user = self.current_user
            try:
                if not user:
                    self.auth_log.error(_("Unauthenticated WebSocket attempt."))
                    # This usually happens when the cookie_secret gets changed
                    # resulting in "Invalid cookie..." errors.  If we tell the
                    # client to re-auth the problem should correct itself.
                    self.write_message(json_encode(reauth))
                    return
                elif user and user['upn'] == 'ANONYMOUS':
                    self.auth_log.error(_("Unauthenticated WebSocket attempt."))
                    # This can happen when a client logs in with no auth type
                    # configured and then later the server is configured to use
                    # authentication.  The client must be told to re-auth:
                    self.write_message(json_encode(reauth))
                    return
            except KeyError: # 'upn' wasn't in user
                # Force them to authenticate
                self.write_message(json_encode(reauth))
                #self.close() # Close the WebSocket
        elif auth_method and auth_method == 'api':
            if 'auth' in list(settings.keys()):
                if not isinstance(settings['auth'], dict):
                    settings['auth'] = json_decode(settings['auth'])
                user = self.api_auth(settings['auth'])
                if not user:
                    # The api_auth() function takes care of logging/notification
                    return
        else: # Anonymous auth
            # Double-check there isn't a user set in the cookie (i.e. we have
            # recently changed Gate One's settings).  If there is, force it
            # back to ANONYMOUS.
            if settings['auth']:
                cookie_data = None
                if isinstance(settings['auth'], basestring):
                    # The client is trying to authenticate using the
                    # 'gateone_user' parameter in localStorage.
                    # Authenticate/decode the encoded auth info
                    expiration = self.settings.get('auth_timeout', "14d")
                    expiration = (
                        float(total_seconds(convert_to_timedelta(expiration)))
                        / float(86400))
                    cookie_data = self.get_secure_cookie("gateone_user",
                        value=settings['auth'], max_age_days=expiration)
                    # NOTE: The above doesn't actually touch any cookies
                else:
                    # Someone is attempting to perform API-based authentication
                    # but this server isn't configured with 'auth = "api"'.
                    # Let's be real user-friendly and point out this mistake
                    # with a helpful error message...
                    self.auth_log.error(_(
                        "Client tried to use API-based authentication but this "
                        "server is configured with 'auth = \"{0}\"'.  Did you "
                        "forget to set '\"auth\": \"api\"' in the settings?"
                        ).format(self.settings['auth']))
                    message = {'go:notice': _(
                        "AUTHENTICATION ERROR: Server is not configured to "
                        "perform API-based authentication.  Did someone forget "
                        "to set '\"auth\": \"api\"' in the settings?")}
                    self.write_message(json_encode(message))
                    return
                if cookie_data:
                    user = json_decode(cookie_data)
            if not user:
                # Generate a new session/anon user
                # Also store/update their session info in localStorage
                user = {
                    'upn': 'ANONYMOUS',
                    'session': generate_session_id()
                }
                encoded_user = self.create_signed_value(
                    'gateone_user', tornado.escape.json_encode(user))
                session_message = {'go:gateone_user': encoded_user}
                self.write_message(json_encode(session_message))
                self._current_user['ip_address'] = self.request.remote_ip
                self._current_user = user
            if user['upn'] != 'ANONYMOUS':
                # Gate One server's auth config probably changed
                self.write_message(json_encode(reauth))
                return
        if self.current_user and 'session' in self.current_user:
            self.session = self.current_user['session']
        else:
            self.auth_log.error(_("Authentication failed for unknown user"))
            message = {'go:notice': _('AUTHENTICATION ERROR: User unknown')}
            self.write_message(json_encode(message))
            self.write_message(json_encode(reauth))
            return
        try:
            # Execute any post-authentication hooks that plugins have registered
            if PLUGIN_AUTH_HOOKS:
                for auth_hook in PLUGIN_AUTH_HOOKS:
                    auth_hook(self, self.current_user, self.settings)
        except Exception as e:
            self.logger.error(_("Exception in registered Auth hook: %s" % e))
        # Locations are used to differentiate between different tabs/windows
        self.location = settings.get('location', 'default')
        # Update our loggers to include the user metadata
        metadata = {
            'upn': user['upn'],
            'ip_address': self.request.remote_ip,
            'location': self.location
        }
        self.logger = go_logger(None, **metadata)
        self.sync_log = go_logger('gateone.sync', **metadata)
        self.auth_log = go_logger('gateone.auth', **metadata)
        self.msg_log = go_logger('gateone.message', **metadata)
        self.client_log = go_logger('gateone.client', **metadata)
        # Apply the container/prefix settings (if present)
        self.container = settings.get('container', self.container)
        self.prefix = settings.get('prefix', self.prefix)
        # Update self.base_url if a url was given
        url = settings.get('url', None)
        if url:
            orig_base_url = self.base_url
            parsed = urlparse(url)
            self.base_url = "{protocol}://{host}{url_prefix}".format(
                protocol=parsed.scheme,
                host=parsed.hostname,
                port=parsed.port,
                url_prefix=parsed.path)
            if orig_base_url != self.base_url:
                self.logger.info(_(
                    "Proxy in use: Client URL differs from server."))
        # NOTE: NOT using self.auth_log() here on purpose (this log message
        # should stay consistent for easier auditing):
        auth_log.info(
            _(u"User {upn} authenticated successfully via origin {origin}"
              u" (location: {location}).").format(
                  upn=user['upn'], origin=self.origin, location=self.location))
        # This check is to make sure there's no existing session so we don't
        # accidentally clobber it.
        if self.session not in SESSIONS:
            # Start a new session:
            SESSIONS[self.session] = {
                'client_ids': [self.client_id],
                'last_seen': 'connected',
                'user': self.current_user,
                'kill_session_callbacks': [
                    partial(self.send_message,
                        _("Please wait while the server is restarted..."))
                ],
                'timeout_callbacks': [],
                # Locations are virtual containers that indirectly correlate
                # with browser windows/tabs.  The point is to allow things like
                # opening/moving applications/terminals in/to new windows/tabs.
                'locations': {self.location: {}}
            }
        else:
            SESSIONS[self.session]['last_seen'] = 'connected'
            SESSIONS[self.session]['client_ids'].append(self.client_id)
            if self.location not in SESSIONS[self.session]['locations']:
                SESSIONS[self.session]['locations'][self.location] = {}
        # A shortcut:
        self.locations = SESSIONS[self.session]['locations']
        # Call applications' authenticate() functions (if any)
        for app in self.apps:
            # Set the current user for convenient access
            app.current_user = self.current_user
            if hasattr(app, 'authenticate'):
                app.authenticate()
        # This is just so the client has a human-readable point of reference:
        message = {'go:set_username': self.current_user['upn']}
        self.write_message(json_encode(message))
        self.trigger('go:authenticate')

    def _start_session_watcher(self, restart=False):
        """
        Starts up the `SESSION_WATCHER` (assigned to that global)
        :class:`~tornado.ioloop.PeriodicCallback` that regularly checks for user
        sessions that have timed out via the :func:`timeout_sessions` function
        and cleans them up (shuts down associated processes).

        The interval in which it performs this check is controlled via the
        `session_timeout_check_interval` setting. This setting is not included
        in Gate One's 10server.conf by default but can be added if needed to
        override the default value of 30 seconds.  Example:

        .. code-block:: javascript

            {
                "*": {
                    "gateone": {
                        "session_timeout_check_interval": "30s"
                    }
                }
            }
        """
        global SESSION_WATCHER
        if not SESSION_WATCHER or restart:
            interval = self.prefs['*']['gateone'].get(
                'session_timeout_check_interval', "30s") # 30s default
            td = convert_to_timedelta(interval)
            interval = total_seconds(td) * 1000 # milliseconds
            SESSION_WATCHER = tornado.ioloop.PeriodicCallback(
                timeout_sessions, interval)
            SESSION_WATCHER.start()

    def _start_cleaner(self):
        """
        Starts up the `CLEANER` (assigned to that global)
        `~tornado.ioloop.PeriodicCallback` that regularly checks for and
        deletes expired user logs (e.g. terminal session logs or anything in the
        `<user_dir>/<user>/logs` dir) and old session directories via the
        :func:`cleanup_user_logs` and :func:`cleanup_old_sessions` functions.

        The interval in which it performs this check is controlled via the
        `cleanup_interval` setting. This setting is not included in Gate One's
        10server.conf by default but can be added if needed to override the
        default value of 5 minutes.  Example:

        .. code-block:: javascript

            {
                "*": {
                    "gateone": {
                        "cleanup_interval": "5m"
                    }
                }
            }
        """
        global CLEANER
        if not CLEANER:
            default_interval = 5*60*1000 # 5 minutes
            # NOTE: This interval isn't in the settings by default because it is
            # kind of obscure.  No reason to clutter things up.
            interval = self.prefs['*']['gateone'].get(
                'cleanup_interval', default_interval)
            td = convert_to_timedelta(interval)
            interval = ((
                td.microseconds +
                (td.seconds + td.days * 24 * 3600) *
                10**6) / 10**6) * 1000
            CLEANER = tornado.ioloop.PeriodicCallback(clean_up, interval)
            CLEANER.start()

    def _start_file_watcher(self):
        """
        Starts up the :attr:`ApplicationWebSocket.file_watcher`
        `~tornado.ioloop.PeriodicCallback` (which regularly calls
        :meth:`ApplicationWebSocket.file_checker` and immediately starts it
        watching the broadcast file for changes (if not already watching it).

        The path to the broadcast file defaults to '*settings_dir*/broadcast'
        but can be changed via the 'broadcast_file' setting.  This setting is
        not included in Gate One's 10server.conf by default but can be added if
        needed to overrided the default value.  Example:

        .. code-block:: javascript

            {
                "*": {
                    "gateone": {
                        "broadcast_file": "/some/path/to/broadcast"
                    }
                }
            }

        .. tip::

            You can send messages to all users currently connected to the Gate
            One server by writing text to the broadcast file.  Example:
            `sudo echo "Server will be rebooted as part of regularly scheduled
            maintenance in 5 minutes.  Pleas save your work." >
            /tmp/gateone/broadcast`

        The interval in which it performs this check is controlled via the
        `file_check_interval` setting. This setting is not included in
        Gate One's 10server.conf by default but can be added if needed to
        override the default value of 5 seconds.  Example:

        .. code-block:: javascript

            {
                "*": {
                    "gateone": {
                        "file_check_interval": "5s"
                    }
                }
            }
        """
        cls = ApplicationWebSocket
        broadcast_file = os.path.join(self.settings['session_dir'], 'broadcast')
        broadcast_file = self.prefs['*']['gateone'].get(
            'broadcast_file', broadcast_file)
        if broadcast_file not in cls.watched_files:
            # No broadcast file means the file watcher isn't running
            touch(broadcast_file)
            interval = self.prefs['*']['gateone'].get(
                'file_check_interval', "5s")
            td = convert_to_timedelta(interval)
            interval = ((
                td.microseconds +
                (td.seconds + td.days * 24 * 3600) *
                10**6) / 10**6) * 1000
            cls.watch_file(broadcast_file, cls.broadcast_file_update)
            io_loop = tornado.ioloop.IOLoop.current()
            cls.file_watcher = tornado.ioloop.PeriodicCallback(
                cls.file_checker, interval, io_loop=io_loop)
            cls.file_watcher.start()
        if options.settings_dir not in cls.watched_files:
            cls.watch_file(options.settings_dir, cls.load_prefs)

    def list_applications(self):
        """
        Sends a message to the client indiciating which applications and
        sub-applications are available to the user.

        .. note::

            What's the difference between an "application" and a
            "sub-application"?  An "application" is a `GOApplication` like
            `app_terminal.TerminalApplication` while a "sub-application" would
            be something like "SSH" or "nethack" which runs inside the parent
            application.
        """
        policy = applicable_policies("gateone", self.current_user, self.prefs)
        enabled_applications = policy.get('enabled_applications', [])
        enabled_applications = [a.lower() for a in enabled_applications]
        applications = []
        if not enabled_applications: # Load all apps
            for app in self.apps: # Use the app's name attribute
                info_dict = app.info.copy() # Make a copy so we can change it
                applications.append(info_dict)
        else:
            for app in self.apps: # Use the app's name attribute
                info_dict = app.info.copy() # Make a copy so we can change it
                if info_dict['name'].lower() in enabled_applications:
                    applications.append(info_dict)
        applications.sort()
        message = {'go:applications': applications}
        self.write_message(json_encode(message))

    @require(policies('gateone'))
    def set_location(self, location):
        """
        Attached to the `go:set_location` WebSocket action.  Sets
        ``self.location`` to the given value.

        This mechanism can be used by applications embedding Gate One to
        create/control groups of application resources (e.g. terminals) that
        each reside in unique virtual 'locations'.  Use this function to change
        locations on-the-fly without having to re-authenticate the user.

        .. note::

            If this location is new, ``self.locations[*location*]`` will be
            created automatically.
        """
        if location not in self.locations:
            self.locations[location] = {}
        self.location = location
        self.trigger("go:set_location", location)

    @require(authenticated(), policies('gateone'))
    def get_locations(self):
        """
        Attached to the `go:get_locations` WebSocket action.  Sends a message to
        the client (via the `go:locations` WebSocket action) with a dict
        containing location information for the connected user.
        """
        location_data = {}
        for location, apps in self.locations.items():
            location_data[location] = {}
            for name, values in apps.items():
                location_data[location][name] = {}
                for item, vals in values.items():
                    # This would be something like:
                    #  location     name     item     metadata
                    # {'default': {'terminal' {1: {'title': 'foo'}}}}
                    location_data[location][name][item] = {}
                    title = vals.get('title', 'Unknown')
                    location_data[location][name][item]['title'] = title
                    command = vals.get('command', 'Unknown')
                    location_data[location][name][item]['command'] = command
                    created = vals.get('created', 'Unknown')
                    if not isinstance(created, str):
                        # Convert it to a JavaScript-style timestamp
                        created = int(time.mktime(created.timetuple())) * 1000
                    location_data[location][name][item]['created'] = created
        message = {'go:locations': location_data}
        self.write_message(message)
        self.trigger("go:get_locations")

    def render_style(self, style_path, force=False, **kwargs):
        """
        Renders the CSS template at *style_path* using *kwargs* and returns the
        path to the rendered result.  If the given style has already been
        rendered the existing cache path will be returned.

        If *force* is ``True`` the stylesheet will be rendered even if it
        already exists (cached).

        This method also cleans up older versions of the same rendered template.
        """
        cache_dir = self.settings['cache_dir']
        if not isinstance(cache_dir, str):
            cache_dir = cache_dir.decode('utf-8')
        if not isinstance(style_path, str):
            style_path = style_path.decode('utf-8')
        mtime = os.stat(style_path).st_mtime
        shortened_path = short_hash(style_path)
        rendered_filename = 'rendered_%s_%s' % (shortened_path, int(mtime))
        rendered_path = os.path.join(cache_dir, rendered_filename)
        if not os.path.exists(rendered_path) or force:
            style_css = self.render_string(
                style_path,
                **kwargs
            )
            # NOTE: Tornado templates are always rendered as bytes.  That is why
            # we're using 'wb' below...
            with io.open(rendered_path, 'wb') as f:
                f.write(style_css)
            # Remove older versions of the rendered template if present
            for fname in os.listdir(cache_dir):
                if fname == rendered_filename:
                    continue
                elif shortened_path in fname:
                    # Older version present.
                    # Remove it (and it's minified counterpart).
                    os.remove(os.path.join(cache_dir, fname))
        return rendered_path

# TODO:  Get this checking the modification time of all theme files and only
#        rendering/sending a new theme if something has changed.
    def get_theme(self, settings):
        """
        Sends the theme stylesheets matching the properties specified in
        *settings* to the client.  *settings* must contain the following:

            * **container** - The element Gate One resides in (e.g. 'gateone')
            * **prefix** - The string being used to prefix all elements (e.g. 'go\_')
            * **theme** - The name of the CSS theme to be retrieved.

        .. note::

            This will send the theme files for all applications and plugins that
            have a matching stylesheet in their 'templates' directory.
        """
        self.logger.debug('get_theme(%s)' % settings)
        send_css = self.prefs['*']['gateone'].get('send_css', True)
        if not send_css:
            if not hasattr('logged_css_message', self):
                self.logger.info(_(
                    "send_css is false; will not send JavaScript."))
            # So we don't repeat this message a zillion times in the logs:
            self.logged_css_message = True
            return
        self.sync_log.info('Sync Theme: %s' % settings['theme'])
        use_client_cache = self.prefs['*']['gateone'].get(
            'use_client_cache', True)
        templates_path = os.path.join(GATEONE_DIR, 'templates')
        themes_path = os.path.join(templates_path, 'themes')
        go_url = settings['go_url'] # Used to prefix the url_prefix
        if not go_url.endswith('/'):
            go_url += '/'
        container = settings["container"]
        prefix = settings["prefix"]
        theme = settings["theme"]
        template_args = dict(
            container=container,
            prefix=prefix,
            url_prefix=go_url,
            embedded=self.settings['embedded']
        )
        out_dict = {'files': []}
        theme_filename = "%s.css" % theme
        theme_path = os.path.join(themes_path, theme_filename)
        template_loaders = tornado.web.RequestHandler._template_loaders
        # This wierd little bit empties Tornado's template cache:
        for web_template_path in template_loaders:
            template_loaders[web_template_path].reset()
        rendered_path = self.render_style(
            theme_path, **template_args)
        filename = os.path.split(rendered_path)[1]
        theme_files = []
        theme_files.append(rendered_path)
        # Now enumerate all applications/plugins looking for their own
        # implementations of this theme (must have same name).
        plugins_dir = os.path.join(GATEONE_DIR, 'plugins')
        # Find plugin's theme-specific CSS files
        for plugin in os.listdir(plugins_dir):
            plugin_dir = os.path.join(plugins_dir, plugin)
            themes_dir = os.path.join(plugin_dir, 'templates', 'themes')
            theme_css_file = os.path.join(themes_dir, theme_filename)
            if not os.path.exists(theme_css_file):
                continue
            rendered_path = self.render_style(
                theme_css_file, **template_args)
            theme_files.append(rendered_path)
        # Find application's theme-specific CSS files
        applications_dir = os.path.join(GATEONE_DIR, 'applications')
        for app in os.listdir(applications_dir):
            app_dir = os.path.join(applications_dir, app)
            themes_dir = os.path.join(app_dir, 'templates', 'themes')
            theme_css_file = os.path.join(themes_dir, theme_filename)
            if not os.path.exists(theme_css_file):
                continue
            rendered_path = self.render_style(
                theme_css_file, **template_args)
            theme_files.append(rendered_path)
            # Find application plugin's theme-specific CSS files
            plugins_dir = os.path.join(app_dir, 'plugins')
            if not os.path.exists(plugins_dir):
                continue
            for plugin in os.listdir(plugins_dir):
                plugin_dir = os.path.join(plugins_dir, plugin)
                themes_dir = os.path.join(plugin_dir, 'templates', 'themes')
                theme_css_file = os.path.join(themes_dir, theme_filename)
                if not os.path.exists(theme_css_file):
                    continue
                rendered_path = self.render_style(
                    theme_css_file, **template_args)
                theme_files.append(rendered_path)
        # Combine the theme files into one
        filename = 'theme.css'
        filename_hash = hashlib.md5(
            filename.encode('utf-8')).hexdigest()[:10]
        cache_dir = self.settings['cache_dir']
        cached_theme_path = os.path.join(cache_dir, filename)
        new_theme_path = os.path.join(cache_dir, filename+'.new')
        with io.open(new_theme_path, 'wb') as f:
            for path in theme_files:
                f.write(io.open(path, 'rb').read())
        with open(new_theme_path, 'rb') as f:
            new = f.read()
        old = ''
        if os.path.exists(cached_theme_path):
            with open(cached_theme_path, 'rb') as f:
                old = f.read()
        if new != old:
            # They're different.  Replace the old one...
            os.rename(new_theme_path, cached_theme_path)
        else:
            # Clean up
            os.remove(new_theme_path)
        mtime = os.stat(cached_theme_path).st_mtime
        if self.settings['debug']:
            # This makes sure that the files are always re-downloaded
            mtime = time.time()
        kind = 'css'
        out_dict['files'].append({
            'filename': filename,
            'hash': filename_hash,
            'mtime': mtime,
            'kind': kind,
            'element_id': 'theme'
        })
        self.file_cache[filename_hash] = {
            'filename': filename,
            'kind': kind,
            'path': cached_theme_path,
            'mtime': mtime,
            'element_id': 'theme'
        }
        if use_client_cache:
            message = {'go:file_sync': out_dict}
            self.write_message(message)
        else:
            self.file_request(filename_hash, use_client_cache=use_client_cache)

    @require(authenticated())
    def get_js(self, filename):
        """
        Attempts to find the specified *filename* file in Gate One's static
        directories (GATEONE_DIR/static/ and each plugin's respective 'static'
        dir).

        In the event that a plugin's JavaScript file has the same name as a file
        in GATEONE_DIR/static/ the plugin's copy of the file will take
        precedence.  This is to allow plugins to override defaults.

        .. note::

            This will alow authenticated clients to download whatever file they
            want that ends in .js inside of /static/ directories.
        """
        self.logger.info('get_js(%s)' % filename)
        out_dict = {'result': 'Success', 'filename': filename, 'data': None}
        js_files = {} # Key:value == 'somefile.js': '/full/path/to/somefile.js'
        static_dir = os.path.join(GATEONE_DIR, 'static')
        for f in os.listdir(static_dir):
            if f.endswith('.js'):
                js_file_path = os.path.join(static_dir, f)
                js_files.update({f: js_file_path})
        # Build a list of plugins
        plugins = []
        plugins_dir = os.path.join(GATEONE_DIR, 'plugins')
        for f in os.listdir(plugins_dir):
            if os.path.isdir(os.path.join(plugins_dir, f)):
                plugins.append(f)
        # Add each found JS file to the respective dict
        for plugin in plugins:
            plugin_static_path = os.path.join(plugins_dir, plugin, 'static')
            if os.path.exists(plugin_static_path):
                for f in os.listdir(plugin_static_path):
                    if f.endswith('.js'):
                        js_file_path = os.path.join(plugin_static_path, f)
                        js_files.update({f: js_file_path})
        if filename in list(js_files.keys()):
            with io.open(js_files[filename], encoding='utf-8') as f:
                out_dict['data'] = f.read()
        message = {'go:load_js': out_dict}
        self.write_message(message)

    def cache_cleanup(self, message):
        """
        Attached to the `go:cache_cleanup` WebSocket action; rifles through the
        given list of *message['filenames']* from the client and sends a
        `go:cache_expired` WebSocket action to the client with a list of files
        that no longer exist in `self.file_cache` (so it can clean them up).
        """
        logging.debug("cache_cleanup(%s)" % message)
        filenames = message['filenames']
        kind = message['kind']
        expired = []
        for filename_hash in filenames:
            if filename_hash not in self.file_cache:
                expired.append(filename_hash)
        if not expired:
            logging.debug(_(
                "No expired %s files at client %s" %
                (kind, self.request.remote_ip)))
            return
        logging.debug(_(
            "Requesting deletion of expired files at client %s: %s" % (
            self.request.remote_ip, filenames)))
        message = {'go:cache_expired': message}
        self.write_message(message)
        # Also clean up stale files in the cache while we're at it
        newest_files = {}
        for filename_hash, file_obj in list(self.file_cache.items()):
            filename = file_obj['filename']
            if filename not in newest_files:
                newest_files[filename] = file_obj
                newest_files[filename]['filename_hash'] = filename_hash
            if file_obj['mtime'] > newest_files[filename]['mtime']:
                # Delete then replace the stale one
                stale_hash = newest_files[filename]['filename_hash']
                del self.file_cache[stale_hash]
                newest_files[file_obj['filename']] = file_obj
            if file_obj['mtime'] < newest_files[filename]['mtime']:
                del self.file_cache[filename_hash] # Stale

    def file_request(self, files_or_hash, use_client_cache=True):
        """
        Attached to the `go:file_request` WebSocket action; minifies, caches,
        and finally sends the requested file to the client.  If
        *use_client_cache* is `False` the client will be instructed not to cache
        the file.  Example message from the client requesting a file:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({
                'go:file_request': {'some_file.js'}}));

        .. note:: In reality 'some_file.js' will be a unique/unguessable hash.

        Optionally, *files_or_hash* may be given as a list or tuple and all the
        requested files will be sent.

        Files will be cached after being minified until a file is modified or
        Gate One is restarted.

        If the `slimit` module is installed JavaScript files will be minified
        before being sent to the client.

        If the `cssmin` module is installed CSS files will be minified before
        being sent to the client.
        """
        self.sync_log.debug(
            "file_request(%s, use_client_cache=%s)" % (
                files_or_hash, use_client_cache))
        if isinstance(files_or_hash, (list, tuple)):
            for filename_hash in files_or_hash:
                self.file_request(
                    filename_hash, use_client_cache=use_client_cache)
            return
        else:
            filename_hash = files_or_hash
        if filename_hash not in self.file_cache:
            error_msg = _('File Request Error: File not found ({0})').format(
                filename_hash)
            self.logger.warning(error_msg)
            out_dict = {
                'result': error_msg,
                'filename': filename_hash
            }
            self.write_message({'go:load_js': out_dict})
            return
        # Get the file info out of the file_cache so we can send it
        element_id = self.file_cache[filename_hash].get('element_id', None)
        path = self.file_cache[filename_hash]['path']
        filename = self.file_cache[filename_hash]['filename']
        kind = self.file_cache[filename_hash]['kind']
        mtime = self.file_cache[filename_hash]['mtime']
        requires = self.file_cache[filename_hash].get('requires', None)
        media = self.file_cache[filename_hash].get('media', 'screen')
        url_prefix = self.settings['url_prefix']
        self.sync_log.info("Sending: {0}".format(filename))
        out_dict = {
            'result': 'Success',
            'cache': use_client_cache,
            'mtime': mtime,
            'filename': filename,
            'hash': filename_hash,
            'kind': kind,
            'element_id': element_id,
            'requires': requires,
            'media': media
        }
        cache_dir = self.settings['cache_dir']
        def send_file(result):
            """
            Adds our minified data to the out_dict and sends it to the
            client.
            """
            out_dict['data'] = result
            if kind == 'js':
                source_url = None
                if 'gateone/applications/' in path:
                    application = path.split('applications/')[1].split('/')[0]
                    if 'plugins' in path:
                        static_path = path.split("%s/plugins/" % application)[1]
                        # /terminal/ssh/static/
                        source_url = "%s%s/%s" % (
                            url_prefix, application, static_path)
                    else:
                        static_path = path.split("%s/static/" % application)[1]
                        source_url = "%s%s/static/%s" % (
                            url_prefix, application, static_path)
                elif 'gateone/plugins/' in path:
                    plugin_name = path.split(
                        'gateone/plugins/')[1].split('/')[0]
                    static_path = path.split("%s/static/" % plugin_name)[1]
                    source_url = "%splugins/%s/static/%s" % (
                        url_prefix, plugin_name, static_path)
                if source_url:
                    out_dict['data'] += "\n//# sourceURL={source_url}\n".format(
                        source_url=source_url)
                message = {'go:load_js': out_dict}
            elif kind == 'css':
                out_dict['css'] = True # So loadStyleAction() knows what to do
                message = {'go:load_style': out_dict}
            elif kind == 'theme':
                out_dict['theme'] = True
                message = {'go:load_theme': out_dict}
            try:
                self.write_message(message)
            except (WebSocketClosedError, AttributeError):
                pass # WebSocket closed before we got a chance to send this
        if self.settings['debug']:
            result = get_or_cache(cache_dir, path, minify=False)
            send_file(result)
        else:
            # NOTE: We disable memoization below because get_or_cache() does its
            # own check to see if processing the file is necessary.
            CPU_ASYNC.call(get_or_cache, cache_dir, path,
                           minify=True, callback=send_file, memoize=False)

    def send_js_or_css(self, paths_or_fileobj, kind,
            element_id=None, requires=None, media="screen", filename=None):
        """
        Initiates a file synchronization of the given *paths_or_fileobj* with
        the client to ensure it has the latest version of the file(s).

        The *kind* argument must be one of 'js' or 'css' to indicate JavaScript
        or CSS, respectively.

        Optionally, *element_id* may be provided which will be assigned to the
        <script> or <style> tag that winds up being created (only works with
        single files).

        Optionally, a *requires* string or list/tuple may be given which will
        ensure that the given file gets loaded after any dependencies.

        Optionally, a *media* string may be provided to specify the 'media='
        value when creating a <style> tag to hold the given CSS.

        Optionally, a *filename* string may be provided which will be used
        instead of the name of the actual file when file synchronization occurs.
        This is useful for multi-stage processes (e.g. rendering templates)
        where you wish to preserve the original filename.  Just be aware that
        if you do this the given *filename* must be unique.

        .. note:

            If the slimit module is installed it will be used to minify the JS
            before being sent to the client.
        """
        if kind == 'js':
            send_js = self.prefs['*']['gateone'].get('send_js', True)
            if not send_js:
                if not hasattr('logged_js_message', self):
                    self.logger.info(_(
                        "send_js is false; will not send JavaScript."))
                # So we don't repeat this message a zillion times in the logs:
                self.logged_js_message = True
                return
        elif kind == 'css':
            send_css = self.prefs['*']['gateone'].get('send_css', True)
            if not send_css:
                if not hasattr('logged_css_message', self):
                    self.logger.info(_("send_css is false; will not send CSS."))
                # So we don't repeat this message a zillion times in the logs:
                self.logged_css_message = True
        use_client_cache = self.prefs['*']['gateone'].get(
            'use_client_cache', True)
        if requires and not isinstance(requires, (tuple, list)):
            requires = [requires] # This makes the logic simpler at the client
        if isinstance(paths_or_fileobj, (tuple, list)):
            out_dict = {'files': []}
            for file_obj in paths_or_fileobj:
                if isinstance(file_obj, basestring):
                    path = file_obj
                    if not filename:
                        filename = os.path.split(path)[1]
                else:
                    file_obj.seek(0) # Just in case
                    path = file_obj.name
                    if not filename:
                        filename = os.path.split(file_obj.name)[1]
                self.sync_log.info(
                    "Sync check: {filename}".format(filename=filename))
                mtime = os.stat(path).st_mtime
                filename_hash = hashlib.md5(
                    filename.encode('utf-8')).hexdigest()[:10]
                self.file_cache[filename_hash] = {
                    'filename': filename,
                    'kind': kind,
                    'path': path,
                    'mtime': mtime,
                    'element_id': element_id,
                    'requires': requires,
                    'media': media # NOTE: Ignored if JS
                }
                if self.settings['debug']:
                    # This makes sure that the files are always re-downloaded
                    mtime = time.time()
                out_dict['files'].append({
                    'filename': filename,
                    'hash': filename_hash,
                    'mtime': mtime,
                    'kind': kind,
                    'requires': requires,
                    'element_id': element_id,
                    'media': media # NOTE: Ignored if JS
                })
            if use_client_cache:
                message = {'go:file_sync': out_dict}
                self.write_message(message)
            else:
                files = [a['filename'] for a in out_dict['files']]
                self.file_request(files, use_client_cache=use_client_cache)
            return # No further processing is necessary
        elif isinstance(paths_or_fileobj, basestring):
            path = paths_or_fileobj
            if not filename:
                filename = os.path.split(path)[1]
        else:
            paths_or_fileobj.seek(0) # Just in case
            path = paths_or_fileobj.name
            if not filename:
                filename = os.path.split(paths_or_fileobj.name)[1]
        self.sync_log.info(
            "Sync check: {filename}".format(filename=filename))
        # NOTE: The .split('.') above is so the hash we generate is always the
        # same.  The tail end of the filename will have its modification date.
        # Cache the metadata for sync
        mtime = os.stat(path).st_mtime
        logging.debug('send_js_or_css(%s) (mtime: %s)' % (path, mtime))
        if not os.path.exists(path):
            self.logger.error(_("send_js_or_css(): File not found: %s" % path))
            return
        # Use a hash of the filename because these names can get quite long.
        # Also, we don't want to reveal the file structure on the server.
        filename_hash = hashlib.md5(
            filename.encode('utf-8')).hexdigest()[:10]
        self.file_cache[filename_hash] = {
            'filename': filename,
            'kind': kind,
            'path': path,
            'mtime': mtime,
            'element_id': element_id,
            'requires': requires,
            'media': media # NOTE: Ignored if JS
        }
        if self.settings['debug']:
            # This makes sure that the files are always re-downloaded
            mtime = time.time()
        out_dict = {'files': [{
            'filename': filename,
            'hash': filename_hash,
            'mtime': mtime,
            'kind': kind,
            'requires': requires,
            'element_id': element_id,
            'media': media # NOTE: Ignored if JS
        }]}
        if use_client_cache:
            message = {'go:file_sync': out_dict}
            self.write_message(message)
        else:
            files = [a['filename'] for a in out_dict['files']]
            self.file_request(files, use_client_cache=use_client_cache)

    def send_js(self, path, **kwargs):
        """
        A shortcut for ``self.send_js_or_css(path, 'js', **kwargs)``.
        """
        self.send_js_or_css(path, 'js', **kwargs)

    def send_css(self, path, **kwargs):
        """
        A shortcut for ``self.send_js_or_css(path, 'css', **kwargs)``
        """
        self.send_js_or_css(path, 'css', **kwargs)

    def wrap_and_send_js(self, js_path, exports={}, **kwargs):
        """
        Wraps the JavaScript code at *js_path* in a (JavaScript) sandbox which
        exports whatever global variables are provided via *exports* then
        minifies, caches, and sends the result to the client.

        The provided *kwargs* will be passed to the
        `ApplicationWebSocket.send_js` method.

        The *exports* dict needs to be in the following format::

            exports = {
                "global": "export_name"
            }

        For example, if you wanted to use underscore.js but didn't want to
        overwrite the global ``_`` variable (if already being used by a parent
        web application)::

            exports = {"_": "GateOne._"}
            self.wrap_and_send_js('/path/to/underscore.js', exports)

        This would result in the "_" global being exported as "GateOne._".  In
        other words, this is what will end up at the bottom of the wrapped
        JavaScript just before the end of the sandbox:

        .. code-block:: javascript

            window.GateOne._ = _;

        This method should make it easy to include any given JavaScript library
        without having to worry (as much) about namespace conflicts.

        .. note::

            You don't have to prefix your export with 'GateOne'.  You can export
            the global with whatever name you like.
        """
        if not os.path.exists(js_path):
            self.sync_log.error(_("File does not exist: {0}").format(js_path))
            return
        cache_dir = self.settings['cache_dir']
        mtime = os.stat(js_path).st_mtime
        filename = os.path.split(js_path)[1]
        script = {'name': filename}
        filepath_hash = hashlib.md5(
            js_path.encode('utf-8')).hexdigest()[:10]
        # Store the file info in the file_cache just in case we need to
        # reference the original (non-rendered) path later:
        self.file_cache[filepath_hash] = {
            'filename': filename,
            'kind': 'js',
            'path': js_path,
            'mtime': mtime,
        }
        rendered_filename = 'rendered_%s_%s' % (filepath_hash, int(mtime))
        rendered_path = os.path.join(cache_dir, rendered_filename)
        if os.path.exists(rendered_path):
            self.send_js(rendered_path, filename=filename, **kwargs)
            return
        libwrapper = os.path.join(GATEONE_DIR, 'templates', 'libwrapper.js')
        with io.open(js_path, 'rb') as f:
            script['source'] = f.read()
        template_loaders = tornado.web.RequestHandler._template_loaders
        # This wierd little bit empties Tornado's template cache:
        for web_template_path in template_loaders:
            template_loaders[web_template_path].reset()
        rendered = self.render_string(
            libwrapper,
            script=script,
            exports=exports
        )
        with io.open(rendered_path, 'wb') as f:
            f.write(rendered)
        self.send_js(rendered_path, filename=filename, **kwargs)
        # Remove older versions of the rendered template if present
        for fname in os.listdir(cache_dir):
            if fname == rendered_filename:
                continue
            elif filepath_hash in fname:
                # Older version present.
                # Remove it (and it's minified counterpart).
                os.remove(os.path.join(cache_dir, fname))
        return rendered_path

    def render_and_send_css(self,
            css_path, element_id=None, media="screen", **kwargs):
        """
        Renders, caches (in the `cache_dir`), and sends a stylesheet template at
        the given *css_path*.  The template will be rendered with the following
        keyword arguments::

            container = self.container
            prefix = self.prefix
            url_prefix = self.settings['url_prefix']
            **kwargs

        Returns the path to the rendered template.

        .. note::

            If you want to serve Gate One's CSS via a different mechanism
            (e.g. nginx) this functionality can be completely disabled by adding
            `"send_css": false` to gateone/settings/10server.conf
        """
        send_css = self.prefs['*']['gateone'].get('send_css', True)
        if not send_css:
            if not hasattr('logged_css_message', self):
                self.logger.info(_("send_css is false; will not send CSS."))
            # So we don't repeat this message a zillion times in the logs:
            self.logged_css_message = True
            return
        if not os.path.exists(css_path):
            self.sync_log.error(_("File does not exist: {0}").format(css_path))
            return
        cache_dir = self.settings['cache_dir']
        mtime = os.stat(css_path).st_mtime
        filename = os.path.split(css_path)[1]
        filepath_hash = hashlib.md5(css_path.encode('utf-8')).hexdigest()[:10]
        # Store the file info in the file_cache just in case we need to
        # reference the original (non-rendered) path later:
        self.file_cache[filepath_hash] = {
            'filename': filename,
            'kind': 'css',
            'path': css_path,
            'mtime': mtime,
        }
        rendered_filename = 'rendered_%s_%s' % (filepath_hash, int(mtime))
        rendered_path = os.path.join(cache_dir, rendered_filename)
        if os.path.exists(rendered_path):
            self.send_css(rendered_path,
                element_id=element_id, media=media, filename=filename)
            return
        template_loaders = tornado.web.RequestHandler._template_loaders
        # This wierd little bit empties Tornado's template cache:
        for web_template_path in template_loaders:
            template_loaders[web_template_path].reset()
        rendered = self.render_string(
            css_path,
            container=self.container,
            prefix=self.prefix,
            url_prefix=self.settings['url_prefix'],
            **kwargs
        )
        with io.open(rendered_path, 'wb') as f:
            f.write(rendered)
        self.send_css(rendered_path,
            element_id=element_id, media=media, filename=filename)
        # Remove older versions of the rendered template if present
        for fname in os.listdir(cache_dir):
            if fname == rendered_filename:
                continue
            elif filepath_hash in fname:
                # Older version present.
                # Remove it (and it's minified counterpart).
                os.remove(os.path.join(cache_dir, fname))
        return rendered_path

    def send_plugin_static_files(self,
        plugins_dir, application=None, requires=None):
        """
        Sends all plugin .js and .css files to the client that exist inside
        *plugins_dir*.  Optionally, if *application* is given the policies that
        apply to the current user for that application will be used to determine
        whether or not a given plugin's static files will be sent.

        If *requires* is given it will be passed along to `self.send_js()`.

        .. note::

            If you want to serve Gate One's JavaScript via a different mechanism
            (e.g. nginx) this functionality can be completely disabled by adding
            `"send_js": false` to gateone/settings/10server.conf
        """
        logging.debug('send_plugin_static_files(%s)' % plugins_dir)
        send_js = self.prefs['*']['gateone'].get('send_js', True)
        if not send_js:
            if not hasattr('logged_js_message', self):
                self.logger.info(_(
                    "send_js is false; will not send JavaScript."))
            # So we don't repeat this message a zillion times in the logs:
            self.logged_js_message = True
            return
        policy = applicable_policies(application, self.current_user, self.prefs)
        globally_enabled_plugins = policy.get('enabled_plugins', [])
        # This controls the client-side plugins that will be sent
        allowed_client_side_plugins = policy.get('user_plugins', [])
        # Remove non-globally-enabled plugins from user_plugins (if set)
        if globally_enabled_plugins and list(allowed_client_side_plugins):
            for p in allowed_client_side_plugins:
                if p not in globally_enabled_plugins:
                    del allowed_client_side_plugins[p]
        elif globally_enabled_plugins and not allowed_client_side_plugins:
            allowed_client_side_plugins = globally_enabled_plugins
        # Build a list of plugins
        plugins = []
        if not os.path.exists(plugins_dir):
            return # Nothing to do
        for f in os.listdir(plugins_dir):
            if os.path.isdir(os.path.join(plugins_dir, f)):
                if allowed_client_side_plugins:
                    if f in allowed_client_side_plugins:
                        plugins.append(f)
                else:
                    plugins.append(f)
        # Add each found JS file to the respective dict
        for plugin in plugins:
            plugin_static_path = os.path.join(plugins_dir, plugin, 'static')
            if os.path.exists(plugin_static_path):
                static_files = os.listdir(plugin_static_path)
                static_files.sort()
                for f in static_files:
                    if f.endswith('.js'):
                        js_file_path = os.path.join(plugin_static_path, f)
                        self.send_js(js_file_path, requires=requires)
                    elif f.endswith('.css'):
                        css_file_path = os.path.join(plugin_static_path, f)
                        self.send_css(css_file_path, filename=f)

# TODO:  Add support for a setting that can control which themes are visible to users.
    def enumerate_themes(self):
        """
        Returns a JSON-encoded object containing the installed themes and text
        color schemes.
        """
        templates_path = os.path.join(GATEONE_DIR, 'templates')
        themes_path = os.path.join(templates_path, 'themes')
        # NOTE: This is temporary until this logic is moved to the terminal app:
        colors_path = os.path.join(GATEONE_DIR,
            'applications', 'terminal', 'templates', 'term_colors')
        themes = os.listdir(themes_path)
        themes = [a.replace('.css', '') for a in themes]
        colors = os.listdir(colors_path)
        colors = [a.replace('.css', '') for a in colors]
        message = {'go:themes_list': {'themes': themes, 'colors': colors}}
        self.write_message(message)

    @require(authenticated())
    def set_locale(self, message):
        """
        Sets the client's locale to *message['locale']*.
        """
        self.prefs['*']['gateone']['locale'] = message['locale']
        self.send_js_translation()

    def send_js_translation(self, path=None):
        """
        Sends a message to the client containing a JSON-encoded table of strings
        that have been translated to the user's locale.

        If a *path* is given it will be used to send the client that file.  If
        more than one JSON translation is sent to the client the new translation
        will be merged into the existing one.

        .. note::

            Translation files must be the result of a
            `pojson /path/to/translation.po` conversion.
        """
        chosen_locale = self.prefs['*']['gateone'].get('locale', 'en_US')
        json_translation = os.path.join(
            GATEONE_DIR,
            'i18n',
            chosen_locale,
            'LC_MESSAGES',
            'gateone_js.json')
        if path:
            if os.path.exists(path):
                with io.open(path, 'r', encoding="utf-8") as f:
                    decoded = json_decode(f.read())
                    message = {'go:register_translation': decoded}
                    self.write_message(message)
            else:
                self.logger.error(
                    _("Translation file, %s could not be found") % path)
        elif os.path.exists(json_translation):
            with io.open(json_translation, 'r', encoding="utf-8") as f:
                decoded = json_decode(f.read())
                message = {'go:register_translation': decoded}
                self.write_message(message)

# NOTE: This is not meant to be a chat application.  That'll come later :)
#       The real purpose of send_user_message() and broadcast() are for
#       programmatic use.  For example, when a user shares a terminal and it
#       would be appropriate to notify certain users that the terminal is now
#       available for them to connect.
    @require(authenticated(), policies('gateone'))
    def send_user_message(self, settings):
        """
        Sends the given *settings['message']* to the given *settings['upn']*.

        if *upn* is 'AUTHENTICATED' all users will get the message.  Example:

        .. code-block:: javascript

            var obj = {"message": "This is a test", "upn": "joe@company.com"}
            GateOne.ws.send(JSON.stringify({"go:send_user_message": obj}));
        """
        if 'message' not in settings:
            self.send_message(_("Error: No message to send."))
            return
        if 'upn' not in settings:
            self.send_message(_("Error: Missing UPN."))
            return
        metadata = {"to": settings["upn"]}
        self.msg_log.info(
            _("User Message: {0}").format(settings["message"]),
            metadata=metadata)
        self.send_message(settings['message'], upn=settings['upn'])
        self.trigger('go:send_user_message', settings)

    def send_message(self, message, session=None, upn=None):
        """
        Sends the given *message* to the client using the `go:user_message`
        WebSocket action at the currently-connected client.

        If *upn* is provided the *message* will be sent to all users with a
        matching 'upn' value.

        If *session* is provided the message will be sent to all users with a
        matching session ID.  This is useful in situations where all users share
        the same 'upn' (i.e. ANONYMOUS).

        if *upn* is 'AUTHENTICATED' all users will get the message.
        """
        message_dict = {'go:user_message': message}
        if upn:
            ApplicationWebSocket._deliver(message_dict, upn=upn)
        elif session:
            ApplicationWebSocket._deliver(message_dict, session=session)
        else: # Just send to the currently-connected client
            self.write_message(message_dict)
        self.trigger('go:send_message', message, upn, session)

    @require(authenticated(), policies('gateone'))
    def broadcast(self, message):
        """
        Attached to the `go:broadcast` WebSocket action; sends the given
        *message* (string) to all connected, authenticated users.  Example
        usage:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({"go:broadcast": "This is a test"}));
        """
        self.msg_log.info("Broadcast: %s" % message)
        from .utils import strip_xss # Prevent XSS attacks
        message, bad_tags = strip_xss(message, replacement="entities")
        self.send_message(message, upn="AUTHENTICATED")
        self.trigger('go:broadcast', message)

    @require(authenticated(), policies('gateone'))
    def list_server_users(self):
        """
        Returns a list of users currently connected to the Gate One server to
        the client via the 'go:user_list' WebSocket action.  Only users with the
        'list_users' policy are allowed to execute this action.  Example:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({"go:list_users": null}));

        That would send a JSON message to the client like so::

            {
                "go:user_list": [
                    {"upn": "user@enterprise", "ip_address": "10.0.1.11"},
                    {"upn": "bsmith@enterprise", "ip_address": "10.0.2.15"}
                ]
            }
        """
        users = ApplicationWebSocket._list_connected_users()
        logging.debug('list_server_users(): %s' % repr(users))
        # Remove things that users should not see such as their session ID
        filtered_users = []
        policy = applicable_policies('gateone', self.current_user, self.prefs)
        allowed_fields = policy.get('user_list_fields', False)
        # If not set, just strip the session ID
        if not allowed_fields:
            allowed_fields = ('upn', 'ip_address')
        for user in users:
            if not user: # Broadcast client (view-only situation)
                continue
            user_dict = {}
            for key, value in user.items():
                if key in allowed_fields:
                    user_dict[key] = value
            filtered_users.append(user_dict)
        message = {'go:user_list': filtered_users}
        self.write_message(json_encode(message))
        self.trigger('go:user_list', filtered_users)

    @classmethod
    def _deliver(cls, message, upn="AUTHENTICATED", session=None):
        """
        Writes the given *message* (string) to all users matching *upn* using
        the write_message() function.  If *upn* is not provided or is
        "AUTHENTICATED", will send the *message* to all users.

        Alternatively a *session* ID may be specified instead of a *upn*.  This
        is useful when more than one user shares a UPN (i.e. ANONYMOUS).
        """
        logging.debug("_deliver(%s, upn=%s, session=%s)" %
            (message, upn, session))
        for instance in cls.instances:
            try: # Only send to users that have authenticated
                user = instance.current_user
            except (WebSocketClosedError, AttributeError):
                continue
            if session and user and user.get('session', None) == session:
                instance.write_message(message)
            elif upn == "AUTHENTICATED":
                instance.write_message(message)
            elif user and upn == user.get('upn', None):
                instance.write_message(message)

    @classmethod
    def _list_connected_users(cls):
        """
        Returns a tuple of user objects representing the users that are
        currently connected (and authenticated) to this Gate One server.
        """
        logging.debug("_list_connected_users()")
        out = []
        for instance in cls.instances:
            try: # We only care about authenticated users
                out.append(instance.current_user)
            except AttributeError:
                continue
        return tuple(out)

    @require(authenticated(), policies('gateone'))
    def debug(self):
        """
        Imports Python's Garbage Collection module (gc) and displays various
        information about the current state of things inside of Gate One.

        .. note:: Can only be called from a JavaScript console like so...

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({'go:debug': null}));
        """
        # NOTE: Making a debug-specific logger but logging using info() so that
        # the log messages show up even if I don't have logging set to debug.
        # Since this debugging function is only ever called manually there's no
        # need to use debug() logging.
        metadata = {
            'upn': self.current_user['upn'],
            'ip_address': self.request.remote_ip,
            'location': self.location
        }
        debug_logger = go_logger("gateone.debugging", **metadata)
        import gc
        #gc.set_debug(gc.DEBUG_UNCOLLECTABLE|gc.DEBUG_OBJECTS)
        gc.set_debug(
            gc.DEBUG_UNCOLLECTABLE | gc.DEBUG_INSTANCES | gc.DEBUG_OBJECTS)
        # Using pprint for some things below instead of the logger because they
        # just won't look right if they go to the logs.
        from pprint import pprint
        pprint(gc.garbage)
        debug_logger.info("Debug: gc.collect(): %s" % gc.collect())
        pprint(gc.garbage)
        print("SESSIONS:")
        pprint(SESSIONS)
        print("PERSIST:")
        pprint(PERSIST)
        try:
            from pympler import asizeof
            debug_logger.info(
                "Debug: Size of SESSIONS dict: %s" % asizeof.asizeof(SESSIONS))
        except ImportError:
            pass # No biggie
        try:
            # NOTE: For this Heapy stuff to work best you have to make more then
            # one call to this function (just do it at regular intervals).
            from guppy import hpy
            if not hasattr(self, 'hp'):
                self.hp = hpy()
                self.hp.setrelheap() # We only want to track NEW stuff
            print("Heap:")
            h = self.hp.heap()
            print(h)
            # Uncomment this to troubleshoot memory leaks.  If any exist this
            # loop will shine a light on them:
            #print("Heap Details (up to top 10):")
            #for i in range(10):
                #try:
                    #print(h.byrcs[i].byid)
                #except IndexError:
                    #break
        except ImportError:
            pass # Oh well

class ErrorHandler(tornado.web.RequestHandler):
    """
    Generates an error response with status_code for all requests.
    """
    def __init__(self, application, request, status_code):
        tornado.web.RequestHandler.__init__(self, application, request)
        self.set_status(status_code)

    def get_error_html(self, status_code, **kwargs):
        self.set_header('Server', 'GateOne')
        self.set_header('License', __license__)
        self.require_setting("static_url")
        if status_code in [404, 500, 503, 403]:
            filename = os.path.join(
                self.settings['static_url'], '%d.html' % status_code)
            if os.path.exists(filename):
                with io.open(filename, 'rb') as f:
                    data = f.read()
                return data
        import httplib
        return "<html><title>%(code)d: %(message)s</title>" \
           "<body class='bodyErrorPage'>%(code)d: %(message)s</body></html>" % {
               "code": status_code,
               "message": httplib.responses[status_code],
        }

    def prepare(self):
        raise tornado.web.HTTPError(self._status_code)

class GateOneApp(tornado.web.Application):
    def __init__(self, settings, **kwargs):
        """
        Setup our Tornado application...  Everything in *settings* will wind up
        in the Tornado settings dict so as to be accessible under self.settings.
        """
        global PLUGIN_WS_CMDS
        global PLUGIN_COMMAND_HOOKS
        global PLUGIN_ESC_HANDLERS
        global PLUGIN_AUTH_HOOKS
        global PLUGIN_TERM_HOOKS
        global PLUGIN_NEW_TERM_HOOKS
        global PLUGIN_NEW_MULTIPLEX_HOOKS
        global PLUGIN_ENV_HOOKS
        # Base settings for our Tornado app
        static_url = os.path.join(GATEONE_DIR, "static")
        tornado_settings = dict(
            cookie_secret=settings['cookie_secret'],
            static_url=static_url,
            static_url_prefix="%sstatic/" % settings['url_prefix'],
            gzip=True,
            login_url="%sauth" % settings['url_prefix']
        )
        # Make sure all the provided settings wind up in self.settings
        for k, v in settings.items():
            tornado_settings[k] = v
        # Setup the configured authentication type
        AuthHandler = NullAuthHandler # Default
        if 'auth' in settings and settings['auth']:
            if settings['auth'] == 'kerberos' and KerberosAuthHandler:
                AuthHandler = KerberosAuthHandler
            elif settings['auth'] == 'pam' and PAMAuthHandler:
                AuthHandler = PAMAuthHandler
            elif settings['auth'] == 'google':
                AuthHandler = GoogleAuthHandler
            elif settings['auth'] == 'ssl':
                AuthHandler = SSLAuthHandler
            elif settings['auth'] == 'api':
                AuthHandler = APIAuthHandler
            auth_log.info(_("Using %s authentication") % settings['auth'])
        else:
            auth_log.info(_(
                "No authentication method configured. All users will be "
                "ANONYMOUS"))
        docs_path = os.path.join(GATEONE_DIR, 'docs')
        docs_path = os.path.join(docs_path, 'build')
        docs_path = os.path.join(docs_path, 'html')
        url_prefix = settings['url_prefix']
        if not url_prefix.endswith('/'):
            # Make sure there's a trailing slash
            url_prefix = "%s/" % url_prefix
        # Make the / optional in the regex so it works with the @addslash
        # decorator.  e.g. "/whatever/" would become "/whatever/?"
        index_regex = "%s?" % url_prefix
        # Setup our URL handlers
        handlers = [
            (index_regex, MainHandler),
            (r"%sws" % url_prefix,
                ApplicationWebSocket, dict(apps=APPLICATIONS)),
            (r"%sauth" % url_prefix, AuthHandler),
            (r"%sdownloads/(.*)" % url_prefix, DownloadHandler),
            (r"%sdocs/(.*)" % url_prefix, tornado.web.StaticFileHandler, {
                "path": docs_path,
                "default_filename": "index.html"
            })
        ]
        if 'web_handlers' in kwargs:
            for handler_tuple in kwargs['web_handlers']:
                regex = handler_tuple[0]
                handler = handler_tuple[1]
                kwargs = {}
                try:
                    kwargs = handler_tuple[2]
                except IndexError:
                    pass # No kwargs for this handler
                # Make sure the regex is prefix with the url_prefix
                if not regex.startswith(url_prefix):
                    regex = "%s%s" % (url_prefix, regex)
                handlers.append((regex, handler, kwargs))
        # Override the default static handler to ensure the headers are set
        # to allow cross-origin requests.
        handlers.append(
            (r"%sstatic/(.*)" % url_prefix, StaticHandler, {"path": static_url}
        ))
        # Hook up the hooks
        for plugin_name, hooks in PLUGIN_HOOKS.items():
            if 'Web' in hooks:
                # Apply the plugin's Web handlers
                fixed_hooks = []
                if isinstance(hooks['Web'], (list, tuple)):
                    for h in hooks['Web']:
                        # h == (regex, Handler)
                        if not h[0].startswith(url_prefix): # Fix it
                            h = (url_prefix + h[0].lstrip('/'), h[1])
                            fixed_hooks.append(h)
                        else:
                            fixed_hooks.append(h)
                else:
                    if not hooks['Web'][0].startswith(url_prefix): # Fix it
                        hooks['Web'] = (
                            url_prefix + hooks['Web'][0].lstrip('/'),
                            hooks['Web'][1]
                        )
                        fixed_hooks.append(hooks['Web'])
                    else:
                        fixed_hooks.append(hooks['Web'])
                handlers.extend(fixed_hooks)
            if 'WebSocket' in hooks:
                # Apply the plugin's WebSocket commands
                PLUGIN_WS_CMDS.update(hooks['WebSocket'])
            if 'Escape' in hooks:
                # Apply the plugin's Escape handler
                PLUGIN_ESC_HANDLERS.update({plugin_name: hooks['Escape']})
            if 'Auth' in hooks:
                # Apply the plugin's post-authentication functions
                if isinstance(hooks['Auth'], (list, tuple)):
                    PLUGIN_AUTH_HOOKS.extend(hooks['Auth'])
                else:
                    PLUGIN_AUTH_HOOKS.append(hooks['Auth'])
            if 'Command' in hooks:
                # Apply the plugin's 'Command' hooks (called by new_multiplex)
                if isinstance(hooks['Command'], (list, tuple)):
                    PLUGIN_COMMAND_HOOKS.extend(hooks['Command'])
                else:
                    PLUGIN_COMMAND_HOOKS.append(hooks['Command'])
            if 'Multiplex' in hooks:
                # Apply the plugin's Multiplex hooks (called by new_multiplex)
                if isinstance(hooks['Multiplex'], (list, tuple)):
                    PLUGIN_NEW_MULTIPLEX_HOOKS.extend(hooks['Multiplex'])
                else:
                    PLUGIN_NEW_MULTIPLEX_HOOKS.append(hooks['Multiplex'])
            if 'Terminal' in hooks:
                # Apply the plugin's Terminal hooks (called by new_terminal)
                PLUGIN_TERM_HOOKS.update(hooks['Terminal'])
            if 'TermInstance' in hooks:
                # Apply the plugin's TermInstance hooks (called by new_terminal)
                if isinstance(hooks['TermInstance'], (list, tuple)):
                    PLUGIN_NEW_TERM_HOOKS.extend(hooks['TermInstance'])
                else:
                    PLUGIN_NEW_TERM_HOOKS.append(hooks['TermInstance'])
            if 'Environment' in hooks:
                PLUGIN_ENV_HOOKS.update(hooks['Environment'])
            if 'Init' in hooks:
                # Call the plugin's initialization functions
                hooks['Init'](tornado_settings)
        # Include JS-only and CSS-only plugins (for logging purposes)
        js_plugins = [a.split(os.path.sep)[2] for a in PLUGINS['js']]
        # NOTE: JS and CSS files are normally sent after the user authenticates
        #       via ApplicationWebSocket.send_plugin_static_files()
        # Add static handlers for all the JS plugins (primarily for source URLs)
        for js_plugin in js_plugins:
            js_plugin_path = os.path.join(
                GATEONE_DIR, 'plugins', js_plugin, 'static')
            handlers.append((
                r"%splugins/%s/static/(.*)" % (url_prefix, js_plugin),
                StaticHandler,
                {"path": js_plugin_path}
            ))
        # This removes duplicate handlers for the same regex, allowing plugins
        # to override defaults:
        handlers = merge_handlers(handlers)
        css_plugins = []
        for css_path in css_plugins:
            name = css_path.split(os.path.sep)[-1].split('.')[0]
            name = os.path.splitext(name)[0]
            css_plugins.append(name)
        plugin_list = list(set(PLUGINS['py'] + js_plugins + css_plugins))
        plugin_list.sort() # So there's consistent ordering
        logger.info(_("Loaded global plugins: %s") % ", ".join(plugin_list))
        tornado.web.Application.__init__(self, handlers, **tornado_settings)

def set_license():
    """
    Sets the __license__ global based on what can be found in `GATEONE_DIR`.
    """
    license_path = os.path.join(GATEONE_DIR, '.license')
    if os.path.exists(license_path):
        with io.open(license_path, 'r', encoding='utf-8') as f:
            license = f.read()
            if license:
                global __license__
                __license__ = license.strip()

def main(installed=True):
    global _
    global PLUGINS
    global APPLICATIONS
    set_license()
    define_options(installed=installed)
    # Before we do anything else we need the get the settings_dir argument (if
    # given) so we can make sure we're handling things accordingly.
    settings_dir = options.settings_dir # Set the default
    for arg in sys.argv:
        if arg.startswith('--settings_dir'):
            settings_dir = arg.split('=', 1)[1]
    if not os.path.isdir(settings_dir) and '--help' not in sys.argv:
        # Try to create it
        try:
            mkdir_p(settings_dir)
        except:
            logging.error(_(
               "Could not find/create settings directory at %s" % settings_dir))
            sys.exit(1)
    try:
        all_settings = get_settings(settings_dir)
    except SettingsError as e:
        # The error will be logged to stdout inside all_settings
        sys.exit(2)
    enabled_plugins = []
    enabled_applications = []
    cli_commands = {} # Holds CLI commands provided by plugins/applications
    go_settings = {}
    if 'gateone' in all_settings['*']:
        # The check above will fail in first-run situations
        enabled_plugins = all_settings['*']['gateone'].get(
            'enabled_plugins', [])
        enabled_plugins = [a.lower() for a in enabled_plugins]
        enabled_applications = all_settings['*']['gateone'].get(
            'enabled_applications', [])
        enabled_applications = [a.lower() for a in enabled_applications]
        go_settings = all_settings['*']['gateone']
    PLUGINS = get_plugins(os.path.join(GATEONE_DIR, 'plugins'), enabled_plugins)
    imported = load_modules(PLUGINS['py'])
    for plugin in imported:
        try:
            PLUGIN_HOOKS.update({plugin.__name__: plugin.hooks})
            if 'commands' in plugin.hooks:
                cli_commands.update(plugin.hooks['commands'])
        except AttributeError:
            pass # No hooks--probably just a supporting .py file.
    APPLICATIONS = get_applications(
        os.path.join(GATEONE_DIR, 'applications'), enabled_applications)
    # NOTE: load_modules() imports all the .py files in applications.  This
    # means that applications can place calls to tornado.options.define()
    # anywhere in their .py files and they should automatically be usable by the
    # user at this point in the startup process.
    app_modules = load_modules(APPLICATIONS)
    # Check if the user is running a command as opposed to passing arguments
    # so we can set the log_file_prefix to something innocuous so as to prevent
    # IOError exceptions from Tornado's parse_command_line() below...
    if [a for a in sys.argv[1:] if not a.startswith('-')]:
        options.log_file_prefix = None
    # Having parse_command_line() after loading applications in case an
    # application has additional calls to define().
    try:
        commands = tornado.options.parse_command_line()
    except IOError:
        print(_("Could not write to the log: %s") % options.log_file_prefix)
        print(_(
            "You probably want to provide a different destination via "
            "--log_file_prefix=/path/to/gateone.log"))
        sys.exit(2)
    # NOTE: Here's how settings/command line args works:
    #       * The 'options' object gets set from the arguments on the command
    #         line (parse_command_line() above).
    #       * 'go_settings' gets set from the stuff in the 'settings_dir'
    #       * Once both are parsed (on their own) we overwrite 'go_settings'
    #         with what was given on the command line.
    #       * Once 'go_settings' has been adjusted we overwrite 'options' with
    #         any settings that directly correlate with command line options.
    #         This ensures that the 'options' object (which controls Tornado'
    #         settings) gets the stuff from 'settings_dir' if not provided on
    #         the command line.
    # TODO: Add a way for applications/plugins to add to this list:
    non_options = [
        # These are things that don't really belong in settings
        'new_api_key', 'help', 'kill', 'config', 'combine_js', 'combine_css',
        'combine_css_container'
    ]
    # Figure out which options are being overridden on the command line
    apply_cli_overrides(go_settings)
    arguments = []
    for arg in list(sys.argv)[1:]:
        if not arg.startswith('-'):
            break
        else:
            arguments.append(arg.lstrip('-').split('=', 1)[0])
    # TODO: Get this outputting installed plugins and versions as well
    if options.version:
        print("\x1b[1mGate One:\x1b[0m")
        print("\tVersion: %s (%s)" % (__version__, __commit__))
        print("\x1b[1mInstalled Applications:\x1b[0m")
        for app in app_modules:
            if hasattr(app, 'apps'):
                for _app in app.apps:
                    if hasattr(_app, 'info'):
                        name = _app.info.get('name', None)
                        ver = _app.info.get('version', 'Unknown')
                        if hasattr(ver, '__call__'):
                            # It's a function; grab its output (cool feature)
                            ver = ver()
                        if name:
                            print("\t%s Version: %s" % (name, ver))
        sys.exit(0)
    # Turn any API keys provided on the command line into a dict
    api_keys = {}
    if 'api_keys' in arguments:
        if options.api_keys:
            for pair in options.api_keys.split(','):
                api_key, secret = pair.split(':')
                if bytes == str:
                    api_key = api_key.decode('UTF-8')
                    secret = secret.decode('UTF-8')
                api_keys.update({api_key: secret})
        go_settings['api_keys'] = api_keys
    # Setting the log level using go_settings requires an additional step:
    if options.logging.upper() != 'NONE':
        logging.getLogger().setLevel(getattr(logging, options.logging.upper()))
    else:
        logging.disable(logging.CRITICAL)
    logger = go_logger(None)
    APPLICATIONS = [] # Replace it with a list of actual class instances
    web_handlers = []
    # Convert the old server.conf to the new settings file format and save it
    # as a number of distinct .conf files to keep things better organized.
    # NOTE: This logic will go away some day as it only applies when moving from
    #       Gate One 1.1 (or older) to newer versions.
    if os.path.exists(options.config):
        from .configuration import convert_old_server_conf
        convert_old_server_conf()
    if 'gateone' not in all_settings['*']:
        # User has yet to create a 10server.conf (or equivalent)
        all_settings['*']['gateone'] = {} # Will be filled out below
    # If you want any missing config file entries re-generated just delete the
    # cookie_secret line...
    if 'cookie_secret' not in go_settings or not go_settings['cookie_secret']:
        # Generate a default 10server.conf with a random cookie secret
        # NOTE: This will also generate a new 10server.conf if it is missing.
        from .configuration import generate_server_conf
        generate_server_conf(installed=installed)
        # Make sure these values get updated
        all_settings = get_settings(options.settings_dir)
        go_settings = all_settings['*']['gateone']
    for module in app_modules:
        try:
            if hasattr(module, 'apps'):
                APPLICATIONS.extend(module.apps)
            if hasattr(module, 'init'):
                module.init(all_settings)
            if hasattr(module, 'web_handlers'):
                web_handlers.extend(module.web_handlers)
            if hasattr(module, 'commands'):
                cli_commands.update(module.commands)
        except AttributeError:
            # No apps--probably just a supporting .py file.
            # Uncomment if you can't figure out why your app isn't loading:
            #print("Error initializing module: %s" % module)
            #import traceback
            #traceback.print_exc(file=sys.stdout)
            pass
    if commands: # Optional CLI functionality provided by plugins/applications
        from .configuration import parse_commands
        parsed_commands = parse_commands(commands)
        for command, args in list(parsed_commands.items()):
            if command not in cli_commands:
                logger.warning(_("Unknown CLI command: '%s'") % (command))
            else:
                cli_commands[command](commands[1:])
        sys.exit(0)
    logging.info(_("Imported applications: {0}".format(
        ', '.join([a.info['name'] for a in APPLICATIONS]))))
    # Change the uid/gid strings into integers
    try:
        uid = int(go_settings['uid'])
    except ValueError:
        import pwd
        # Assume it's a username and grab its uid
        uid = pwd.getpwnam(go_settings['uid']).pw_uid
    try:
        gid = int(go_settings['gid'])
    except ValueError:
        import grp
        # Assume it's a group name and grab its gid
        gid = grp.getgrnam(go_settings['gid']).gr_gid
    if uid == 0 and os.getuid() != 0:
        # Running as non-root; set uid/gid to the current user
        logging.info(_("Running as non-root; will not drop privileges."))
        uid = os.getuid()
        gid = os.getgid()
    if not os.path.exists(go_settings['user_dir']): # Make our user_dir
        try:
            mkdir_p(go_settings['user_dir'])
        except OSError:
            import pwd
            logging.error(_(
                "Gate One could not create %s.  Please ensure that user,"
                " %s has permission to create this directory or create it "
                "yourself and make user, %s its owner."
                % (go_settings['user_dir'],
                repr(pwd.getpwuid(os.geteuid())[0]),
                repr(pwd.getpwuid(os.geteuid())[0]))))
            sys.exit(1)
        # If we could create it we should be able to adjust its permissions:
        os.chmod(go_settings['user_dir'], 0o770)
    if not check_write_permissions(uid, go_settings['user_dir']):
        # Try correcting this first
        try:
            recursive_chown(go_settings['user_dir'], uid, gid)
        except (ChownError, OSError) as e:
            logging.error(_(
                "Failed to recursively change permissions of user_dir: %s, "
                "uid: %s, gid: %s" % (go_settings['user_dir'], uid, gid)))
            logging.error(e)
            sys.exit(1)
    if not os.path.exists(go_settings['session_dir']): # Make our session_dir
        try:
            mkdir_p(go_settings['session_dir'])
        except OSError:
            logging.error(_(
                "Error: Gate One could not create %s.  Please ensure that user,"
                " %s has permission to create this directory or create it "
                "yourself and make user, %s its owner." % (
                go_settings['session_dir'],
                repr(pwd.getpwuid(os.geteuid())[0]),
                repr(pwd.getpwuid(os.geteuid())[0]))))
            sys.exit(1)
        os.chmod(go_settings['session_dir'], 0o770)
    if not check_write_permissions(uid, go_settings['session_dir']):
        # Try correcting it
        try:
            recursive_chown(go_settings['session_dir'], uid, gid)
        except (ChownError, OSError) as e:
            logging.error("session_dir: %s, uid: %s, gid: %s" % (
                go_settings['session_dir'], uid, gid))
            logging.error(e)
            sys.exit(1)
    # Re-do the locale in case the user supplied something as --locale
    user_locale = locale.get(go_settings['locale'])
    _ = user_locale.translate # Also replaces our wrapper so no more .encode()
    # Create the log dir if not already present (NOTE: Assumes we're root)
    log_dir = os.path.split(go_settings['log_file_prefix'])[0]
    if options.logging.upper() != 'NONE':
        if not os.path.exists(log_dir):
            try:
                mkdir_p(log_dir)
            except OSError:
                logging.error(_(
                    "\x1b[1;31mERROR:\x1b[0m Could not create %s for "
                    "log_file_prefix: %s"
                    % (log_dir, go_settings['log_file_prefix']
                )))
                logging.error(_(
                    "You probably want to change this option, run Gate "
                    "One as root, or create that directory and give the proper "
                    "user ownership of it."))
                sys.exit(1)
        if not check_write_permissions(uid, log_dir):
            # Try to correct it
            try:
                recursive_chown(log_dir, uid, gid)
            except (ChownError, OSError) as e:
                logging.error(
                    "log_dir: %s, uid: %s, gid: %s" % (log_dir, uid, gid))
                logging.error(e)
                sys.exit(1)
        # Now fix the permissions on each log (no need to check)
        for log_file in LOGS:
            if not os.path.exists(log_file):
                touch(log_file)
            try:
                recursive_chown(log_file, uid, gid)
            except (ChownError, OSError) as e:
                logging.error(
                    "log_file: %s, uid: %s, gid: %s" % (log_dir,uid, gid))
                logging.error(e)
                sys.exit(1)
    if options.new_api_key:
        # Generate a new API key for an application to use and save it to
        # settings/30api_keys.conf.
        from .configuration import RUDict
        api_key = generate_session_id()
        # Generate a new secret
        secret = generate_session_id()
        api_keys_conf = os.path.join(options.settings_dir, '30api_keys.conf')
        new_keys = {api_key: secret}
        api_keys = RUDict({"*": {"gateone": {"api_keys": {}}}})
        if os.path.exists(api_keys_conf):
            api_keys = get_settings(api_keys_conf)
        api_keys.update({"*": {"gateone": {"api_keys": new_keys}}})
        with io.open(api_keys_conf, 'w', encoding='utf-8') as conf:
            msg = _(
                u"// This file contains the key and secret pairs used by Gate "
                u"One's API authentication method.\n")
            conf.write(msg)
            conf.write(unicode(api_keys))
        logging.info(_(u"A new API key has been generated: %s" % api_key))
        logging.info(_(
            u"This key can now be used to embed Gate One into other "
            u"applications."))
        sys.exit(0)
    if options.combine_js:
        from .configuration import combine_javascript
        combine_javascript(options.combine_js, options.settings_dir)
        sys.exit(0)
    if options.combine_css:
        from .configuration import combine_css
        combine_css(
            options.combine_css,
            options.combine_css_container,
            options.settings_dir)
        sys.exit(0)
    # Display the version in case someone sends in a log for for support
    logging.info(_("Version: %s (%s)" % (__version__, __commit__)))
    logging.info(_("Tornado version %s" % tornado_version))
    # Set our global session timeout
    global TIMEOUT
    TIMEOUT = convert_to_timedelta(go_settings['session_timeout'])
    # Fix the url_prefix if the user forgot the trailing slash
    if not go_settings['url_prefix'].endswith('/'):
        go_settings['url_prefix'] += '/'
    # Convert the origins into a list if overridden via the command line
    if 'origins' in arguments:
        if ';' in options.origins:
            origins = options.origins.lower().split(';')
            real_origins = []
            for origin in origins:
                if '://' in origin:
                    origin = origin.split('://')[1]
                if origin not in real_origins:
                    real_origins.append(origin)
            go_settings['origins'] = real_origins
    logging.info(_(
        "Connections to this server will be allowed from the following"
        " origins: '%s'") % " ".join(go_settings['origins']))
    # Normalize certain settings
    go_settings['api_timestamp_window'] = convert_to_timedelta(
        go_settings['api_timestamp_window'])
    go_settings['auth'] = none_fix(go_settings['auth'])
    go_settings['settings_dir'] = settings_dir
    # Check to make sure we have a certificate and keyfile and generate fresh
    # ones if not.
    if not go_settings['disable_ssl']:
        if not os.path.exists(go_settings['keyfile']):
            ssl_base = os.path.split(go_settings['keyfile'])[0]
            if not os.path.exists(ssl_base):
                mkdir_p(ssl_base)
            logging.info(_("No SSL private key found.  One will be generated."))
            gen_self_signed_ssl(path=ssl_base)
        if not os.path.exists(go_settings['certificate']):
            ssl_base = os.path.split(go_settings['certificate'])[0]
            logging.info(_("No SSL certificate found.  One will be generated."))
            gen_self_signed_ssl(path=ssl_base)
    # When logging=="debug" it will display all user's keystrokes so make sure
    # we warn about this.
    if go_settings['logging'] == "debug":
        logging.warning(_(
            "Logging is set to DEBUG.  Be aware that this will record the "
            "keystrokes of all users.  Don't be evil!"))
    ssl_auth = go_settings.get('ssl_auth', 'none').lower()
    if ssl_auth == 'required':
        # Convert to an integer using the ssl module
        cert_reqs = ssl.CERT_REQUIRED
    elif ssl_auth == 'optional':
        cert_reqs = ssl.CERT_OPTIONAL
    else:
        cert_reqs = ssl.CERT_NONE
    # Instantiate our Tornado web server
    ssl_options = {
        "certfile": go_settings['certificate'],
        "keyfile": go_settings['keyfile'],
        "cert_reqs": cert_reqs
    }
    ca_certs = go_settings.get('ca_certs', None)
    if ca_certs:
        ssl_options['ca_certs'] = ca_certs
    disable_ssl = go_settings.get('disable_ssl', False)
    if disable_ssl:
        proto = "http://"
        ssl_options = None
    else:
        proto = "https://"
    # Fill out our settings with command line args if any are missing
    for option in list(options):
        if option in non_options:
            continue # These don't belong
        if option not in go_settings:
            go_settings[option] = options[option]
    tornado.log.enable_pretty_logging(options=options)
    https_server = tornado.httpserver.HTTPServer(
        GateOneApp(settings=go_settings, web_handlers=web_handlers),
        ssl_options=ssl_options)
    https_redirect = tornado.web.Application(
        [(r".*", HTTPSRedirectHandler),],
        port=go_settings['port'],
        url_prefix=go_settings['url_prefix']
    )
    tornado.web.ErrorHandler = ErrorHandler
    if go_settings['auth'] == 'pam':
        if uid != 0 or os.getuid() != 0:
            logger.warning(_(
                "PAM authentication is configured but you are not running Gate"
                " One as root.  If the pam_service you've selected (%s) is "
                "configured to use pam_unix.so for 'auth' (i.e. authenticating "
                "against /etc/passwd and /etc/shadow) Gate One will not be able"
                " to authenticate all users.  It will only be able to "
                "authenticate the user that owns the gateone.py process." %
                go_settings['pam_service']))
    try: # Start your engines!
        if go_settings.get('enable_unix_socket', False):
            https_server.add_socket(
                tornado.netutil.bind_unix_socket(
                    go_settings['unix_socket_path']))
            logger.info(_("Listening on Unix socket '{socketpath}'".format(
                socketpath=go_settings['unix_socket_path'])))
        address = none_fix(go_settings['address'])
        if address:
            for addr in address.split(';'):
                if addr: # Listen on all given addresses
                    if go_settings['https_redirect']:
                        if go_settings['disable_ssl']:
                            logger.error(_(
                            "You have https_redirect *and* disable_ssl enabled."
                            "  Please pick one or the other."))
                            sys.exit(1)
                        logger.info(_(
                            "http://{addr}:80/ will be redirected to...".format(
                                addr=addr)
                        ))
                        https_redirect.listen(port=80, address=addr)
                    logger.info(_(
                        "Listening on {proto}{address}:{port}/".format(
                            proto=proto, address=addr, port=go_settings['port'])
                    ))
                    https_server.listen(port=go_settings['port'], address=addr)
        elif address == '':
            # Listen on all addresses (including IPv6)
            if go_settings['https_redirect']:
                if go_settings['disable_ssl']:
                    logger.error(_(
                        "You have https_redirect *and* disable_ssl enabled."
                        "  Please pick one or the other."))
                    sys.exit(1)
                logger.info(_("http://*:80/ will be redirected to..."))
                https_redirect.listen(port=80, address="")
            logger.info(_(
                "Listening on {proto}*:{port}/".format(
                    proto=proto, port=go_settings['port'])))
            try: # Listen on all IPv4 and IPv6 addresses
                https_server.listen(port=go_settings['port'], address="")
            except socket.error: # Fall back to all IPv4 addresses
                https_server.listen(port=go_settings['port'], address="0.0.0.0")
        # NOTE:  To have Gate One *not* listen on a TCP/IP address you may set
        #        address=None
        # Check to see what group owns /dev/pts and use that for supl_groups
        # First we have to make sure there's at least one pty present
        tempfd1, tempfd2 = pty.openpty()
        # Now check the owning group (doesn't matter which one so we use 0)
        ptm = '/dev/ptm' if os.path.exists('/dev/ptm') else '/dev/ptmx'
        tty_gid = os.stat(ptm).st_gid
        # Close our temmporary pty/fds so we're not wasting them
        os.close(tempfd1)
        os.close(tempfd2)
        if uid != os.getuid():
            drop_privileges(uid, gid, [tty_gid])
        write_pid(go_settings['pid_file'])
        pid = read_pid(go_settings['pid_file'])
        logger.info(_("Process running with pid " + pid))
        tornado.ioloop.IOLoop.instance().start()
    except socket.error as e:
        import errno, pwd
        if not address: address = "0.0.0.0"
        if e.errno == errno.EADDRINUSE: # Address/port already in use
            logging.error(_(
                "Could not listen on {address}:{port} (address:port is already "
                "in use by another application).").format(
                    address=address, port=options.port))
        elif e.errno == errno.EACCES:
            logging.error(_(
                "User '{user}' does not have permission to create a process "
                "listening on {address}:{port}.  Typically only root can use "
                "ports < 1024.").format(
                    user=pwd.getpwuid(uid)[0],
                    address=address,
                    port=options.port))
        else:
            logging.error(_(
                "An error was encountered trying to listen on "
                "{address}:{port}...").format(
                    address=address, port=options.port))
        logging.error(_("Exception was: {0}").format(e.args))
    except KeyboardInterrupt: # ctrl-c
        logger.info(_("Caught KeyboardInterrupt.  Killing sessions..."))
    finally:
        tornado.ioloop.IOLoop.instance().stop()
        import shutil
        logger.info(_(
            "Clearing cache_dir: {0}").format(go_settings['cache_dir']))
        shutil.rmtree(go_settings['cache_dir'], ignore_errors=True)
        remove_pid(go_settings['pid_file'])
        logger.info(_("pid file removed."))

if __name__ == "__main__":
    main()
