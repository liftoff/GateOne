#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

# Meta
__version__ = '1.2.0'
__version_info__ = (1, 2, 0)
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

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

 * `Tornado <http://www.tornadoweb.org/>`_ 2.2+ - A non-blocking web server framework that powers FriendFeed.

The following modules are optional and can provide Gate One with additional
functionality:

 * `pyOpenSSL <https://launchpad.net/pyopenssl>`_ 0.10+ - An OpenSSL module/wrapper for Python.  Only used to generate self-signed SSL keys and certificates.  If pyOpenSSL isn't available Gate One will fall back to using the 'openssl' command to generate self-signed certificates.
 * `kerberos <http://pypi.python.org/pypi/kerberos>`_ 1.0+ - A high-level Kerberos interface for Python.  Only necessary if you plan to use the Kerberos authentication module.
 * `python-pam <http://packages.debian.org/lenny/python-pam>`_ 0.4.2+ - A Python module for interacting with PAM (the Pluggable Authentication Module present on nearly every Unix).  Only necessary if you plan to use PAM authentication.

With the exception of python-pam, both the required and optional modules can usually be installed via one of these commands:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m sudo pip install tornado pyopenssl kerberos

...or:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@legacy-host\x1b[1;34m:~ $\x1b[0m sudo easy_install tornado pyopenssl kerberos

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
All of Gate One's configurable options can be controlled either via command line
switches or by settings in the server.conf file (they match up 1-to-1).  If no
server.conf exists one will be created using defaults (i.e. when Gate One is run
for the first time).  Settings in the server.conf file use the following format::

    <setting> = <value>

Here's an example::

    address = "127.0.0.1;::1;10.1.1.4" # Strings are surrounded by quotes
    port = 443 # Numbers don't need quotes

There are a few important differences between the configuration file and
command line switches in regards to boolean values (True/False).  A switch such
as --debug evaluates to "debug = True" and this is exactly how it would be
configured in server.conf::

    debug = True # Booleans don't need quotes either

.. note:: The following values in server.conf are case sensitive: True, False and None (and should not be placed in quotes).

Running gateone.py with the --help switch will print the usage information as
well as descriptions of what each configurable option does:

.. ansi-block::

    \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m ./gateone.py --help
    Usage: ./gateone.py [OPTIONS]

    Options:
      --help                           show this help information
      --log_file_max_size              max size of log files before rollover
      --log_file_num_backups           number of log files to keep
      --log_file_prefix=PATH           Path prefix for log files. Note that if you are running multiple tornado processes, log_file_prefix must be different for each of them (e.g. include the port number)
      --log_to_stderr                  Send log output to stderr (colorized if possible). By default use stderr if --log_file_prefix is not set and no other logging is configured.
      --logging=debug|info|warning|error|none Set the Python log level. If 'none', tornado won't touch the logging configuration.
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
      --origins                        A semicolon-separated list of origins you wish to allow access to your Gate One server over the WebSocket.  This value must contain the hostnames and FQDNs (e.g. https://foo;https://foo.bar;) users will use to connect to your Gate One server as well as the hostnames/FQDNs of any sites that will be embedding Gate One. Here's the default on your system: 'https://localhost;https://yourhostname'. Alternatively, '*' may be  specified to allow access from anywhere.
      --pam_realm                      Basic auth REALM to display when authenticating clients.  Default: hostname.  Only relevant if PAM authentication is enabled.
      --pam_service                    PAM service to use.  Defaults to 'login'. Only relevant if PAM authentication is enabled.
      --pid_file                       Path of the pid file.   Default: /tmp/gateone.pid
      --port                           Run on the given port.
      --session_dir                    Path to the location where session information will be stored.
      --session_logging                If enabled, logs of user sessions will be saved in <user_dir>/<user>/logs.  Default: Enabled
      --session_timeout                Amount of time that a session should be kept alive after the client has logged out.  Accepts <num>X where X could be one of s, m, h, or d for seconds, minutes, hours, and days.  Default is '5d' (5 days).
      --sso_realm                      Kerberos REALM (aka DOMAIN) to use when authenticating clients. Only relevant if Kerberos authentication is enabled.
      --sso_service                    Kerberos service (aka application) to use. Defaults to HTTP. Only relevant if Kerberos authentication is enabled.
      --syslog_facility                Syslog facility to use when logging to syslog (if syslog_session_logging is enabled).  Must be one of: auth, cron, daemon, kern, local0, local1, local2, local3, local4, local5, local6, local7, lpr, mail, news, syslog, user, uucp.  Default: daemon
      --syslog_host                    Remote host to send syslog messages to if syslog_logging is enabled.  Default: None (log to the local syslog daemon directly).  NOTE:  This setting is required on platforms that don't include Python's syslog module.
      --syslog_session_logging         If enabled, logs of user sessions will be written to syslog.
      --unix_socket_path               Run on the given socket file.  Default: /tmp/gateone.sock
      --url_prefix                     An optional prefix to place before all Gate One URLs. e.g. '/gateone/'.  Use this if Gate One will be running behind a reverse proxy where you want it to be located at some sub-URL path.
      --user_dir                       Path to the location where user files will be stored.

.. note:: Some of these options (e.g. log_file_prefix) are inherent to the Tornado framework.  You won't find them anywhere in gateone.py.

File Paths
----------
Gate One stores its files, temporary session information, and persistent user
data in the following locations (Note: Many of these are configurable):

================= ==================================================================================
File/Directory      Description
================= ==================================================================================
authpam.py        Contains the PAM authentication Mixin used by auth.py.
auth.py           Authentication classes.
certificate.pem   The default certificate Gate One will use in SSL communications.
docs/             Gate One's documentation.
gateone.py        Gate One's primary executable/script. Also, the file containing this documentation
i18n/             Gate One's internationalization (i18n) support and locale/translation files.
keyfile.pem       The default private key used with SSL communications.
logviewer.py      A utility to view Gate One session logs.
plugins/          Plugins go here in the form of ./plugins/<plugin name>/<plugin files|directories>
remote_syslog.py  A module that supports sending syslog messages over UDP to a remote syslog host.
server.conf       Gate One's configuration file.
sso.py            A Kerberos Single Sign-on module for Tornado (used by auth.py)
static/           Non-dynamic files that get served to clients (e.g. gateone.js, gateone.css, etc).
templates/        Tornado template files such as index.html.
terminal.py       A Pure Python terminal emulator module.
termio.py         Terminal input/output control module.
tests/            Various scripts and tools to test Gate One's functionality.
utils.py          Various supporting functions.
users/            Persistent user data in the form of ./users/<username>/<user-specific files>
users/<user>/logs This is where session logs get stored if session_logging is set.
/tmp/gateone      Temporary session data in the form of /tmp/gateone/<session ID>/<files>
================= ==================================================================================

Running
-------
Executing Gate One is as simple as:

.. ansi-block::

    \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m ./gateone.py

.. note::

    By default Gate One will run on port 443 which requires root on most
    systems.  Use `--port=(something higher than 1024)` for non-root users.

Plugins
-------
Gate One includes support for any combination of the following types of plugins:

 * Python
 * JavaScript
 * CSS

Python plugins can integrate with Gate One in three ways:

 * Adding or overriding tornado.web.RequestHandlers (with a given regex).
 * Adding or overriding methods (aka "commands") in ApplicationWebSocket.
 * Adding special plugin-specific escape sequence handlers (see the plugin development documentation for details on what/how these are/work).

JavaScript plugins will be added to the <body> tag of Gate One's base index.html
template by way of a single file (`{{gateone_js}}` below) that is the
concatenation of all plugins' JS templates:

.. code-block:: html

    <script type="text/javascript" src="{{gateone_js}}"></script>

CSS plugins are similar to JavaScript but instead of being appended to the
<body> they are added to the <head> by way of a WebSocket download and some
fancy JavaScript inside of gateone.js:

.. code-block:: javascript

    CSSPluginAction: function(url) {
        // Loads the CSS for a given plugin by adding a <link> tag to the <head>
        var queries = url.split('?')[1].split('&'), // So we can parse out the plugin name and the template
            plugin = queries[0].split('=')[1],
            file = queries[1].split('=')[1].split('.')[0];
        // The /cssrender method needs the prefix and the container
        url = url + '&container=' + GateOne.prefs.goDiv.substring(1);
        url = url + '&prefix=' + GateOne.prefs.prefix;
        url = GateOne.prefs.url + url.substring(1);
        GateOne.Utils.loadCSS(url, plugin+'_'+file);
    }

There are also hooks throughout Gate One's code for plugins to add or override
Gate One's functionality.  Documentation on how to write plugins can be found in
the Plugin Development docs.  From the perspective of gateone.py, it performs
the following tasks in relation to plugins:

 * Imports Python plugins and connects their hooks.
 * Serves the index.html that includes plugins' respective .js and .css files.

Class Docstrings
================
'''

# Standard library modules
import os
import sys
import io
import logging
import time
import socket
import pty
import atexit
import ssl
import hashlib
import tempfile
from functools import wraps
from datetime import datetime, timedelta

# This is used as a way to ensure users get a friendly message about missing
# dependencies:
MISSING_DEPS = []
# This is needed before other globals for certain checks:
GATEONE_DIR = os.path.dirname(os.path.abspath(__file__))

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
    from tornado.websocket import WebSocketHandler
    from tornado.escape import json_decode
    from tornado.options import define, options
    from tornado import locale
    from tornado import version as tornado_version
except ImportError:
    MISSING_DEPS.append('tornado >= 3.0')

if not tornado_version.startswith('3'):
    if 'tornado >= 3.0' not in MISSING_DEPS:
        MISSING_DEPS.append('tornado >= 3.0')

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

# If Gate One was not installed (via setup.py) it won't have access to some
# modules that get installed along with it.  We'll add them to sys.path if they
# are missing.  This way users can use Gate One without *having* to install it.
setup_path = os.path.abspath(os.path.join(GATEONE_DIR, '../'))
if os.path.exists(os.path.join(setup_path, 'onoff')):
    sys.path.append(setup_path)
del setup_path # Don't need this for anything else

# Our own modules
from auth import NullAuthHandler, KerberosAuthHandler, GoogleAuthHandler
from auth import APIAuthHandler, SSLAuthHandler, PAMAuthHandler
from auth import require, authenticated, policies, applicable_policies
from utils import generate_session_id, mkdir_p, SettingsError
from utils import gen_self_signed_ssl, killall, get_plugins, load_modules
from utils import merge_handlers, none_fix, convert_to_timedelta, short_hash
from utils import FACILITIES, json_encode, recursive_chown, ChownError
from utils import write_pid, read_pid, remove_pid, drop_privileges
from utils import check_write_permissions, get_applications, get_settings
from onoff import OnOffMixin

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

# Globals
SESSIONS = {} # We store the crux of most session info here
CMD = None # Will be overwritten by options.command
TIMEOUT = timedelta(days=5) # Gets overridden by options.session_timeout
# SESSION_WATCHER be replaced with a tornado.ioloop.PeriodicCallback that watches for
# sessions that have timed out and takes care of cleaning them up.
SESSION_WATCHER = None
CLEANER = None # Log cleaner PeriodicCallback
FILE_CACHE = {}
# PERSIST is a generic place for applications and plugins to store stuff in a
# way that lasts between page loads.  USE RESPONSIBLY.
PERSIST = {}
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

# Helper functions
def require_auth(method):
    """
    An equivalent to tornado.web.authenticated for WebSockets
    (ApplicationWebSocket, specifically).
    """
    @wraps(method)
    def wrapper(self, *args, **kwargs):
        if not self.current_user:
            self.write_message(_("Only valid users please.  Thanks!"))
            self.close() # Close the WebSocket
        return method(self, *args, **kwargs)
    return wrapper

def cleanup_user_logs():
    """
    Cleans up all user logs (everything in the user's 'logs' directory and
    subdirectories that ends in 'log') older than the `user_logs_max_age`
    setting.  The log directory is assumed to be:

        *user_dir*/<user>/logs

    ...where *user_dir* is whatever Gate One happens to have configured for
    that particular setting.
    """
    logging.debug("cleanup_session_logs()")
    settings = get_settings(options.settings_dir)
    user_dir = settings['*']['gateone']['user_dir']
    if 'user_dir' in options._options.keys(): # NOTE: options is global
        user_dir = options.user_dir
    default = "30d"
    max_age_str = settings['*']['gateone'].get('user_logs_max_age', default)
    if 'user_logs_max_age' in options._options.keys():
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
                logging.info(_("Removing log due to age (>%s old): %s" % (
                    max_age_str, log_path)))
                os.remove(log_path)
    for user in os.listdir(user_dir):
        logs_path = os.path.abspath(os.path.join(user_dir, user, 'logs'))
        if not os.path.exists(logs_path):
            # Nothing to do
            continue
        descend(logs_path)

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

    This function will keep track of and place limmits on the following:

        * Who can send messages to other users (including broadcasts).
        * Who can retrieve a list of connected users.

    If no 'terminal' policies are defined this function will always return True.
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
def kill_all_sessions():
    """
    Calls all 'timeout_callbacks' attached to all `SESSIONS`.
    """
    logging.debug(_("Killing all sessions..."))
    for session in SESSIONS.keys():
        if "timeout_callbacks" in SESSIONS[session]:
            if SESSIONS[session]["timeout_callbacks"]:
                for callback in SESSIONS[session]["timeout_callbacks"]:
                    callback(session)

def timeout_sessions():
    """
    Loops over the SESSIONS dict killing any sessions that haven't been used
    for the length of time specified in *TIMEOUT* (global).  The value of
    *TIMEOUT* can be set in server.conf or specified on the command line via the
    *session_timeout* value.  Arguments:

    .. note:: This function is meant to be called via Tornado's :meth:`~tornado.ioloop.PeriodicCallback`.
    """
    # Commented because it is a bit noisy.  Uncomment to debug this mechanism.
    #logging.debug("timeout_sessions() TIMEOUT: %s" % TIMEOUT)
    try:
        if not SESSIONS: # Last client has timed out
            logging.info(_("All user sessions have terminated."))
            global SESSION_WATCHER
            if SESSION_WATCHER:
                SESSION_WATCHER.stop() # Stop ourselves
                SESSION_WATCHER = None # So authenticate() will know to start it
            # Reload gateone.py to free up memory (CPython can be a bit
            # overzealous in keeping things cached).  In theory this isn't
            # necessary due to Gate One's prodigous use of dynamic imports but
            # in reality people will see an idle gateone.py eating up 30 megs of
            # RAM and wonder, "WTF...  No one has connected in weeks."
            logging.info(_("The last idle session has timed out. Reloading..."))
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
            if datetime.now() > SESSIONS[session]["last_seen"] + TIMEOUT:
                # Kill the session
                logging.info(_("{session} timeout.".format(session=session)))
                if "timeout_callbacks" in SESSIONS[session]:
                    if SESSIONS[session]["timeout_callbacks"]:
                        for callback in SESSIONS[session]["timeout_callbacks"]:
                            callback(session)
                del SESSIONS[session]
    except Exception as e:
        logging.info(_(
            "Exception encountered in timeout_sessions(): {exception}".format(
                exception=e)
        ))
        import traceback
        traceback.print_exc(file=sys.stdout)

# Classes
class HTTPSRedirectHandler(tornado.web.RequestHandler):
    """
    A handler to redirect clients from HTTP to HTTPS.
    """
    def get(self):
        """Just redirects the client from HTTP to HTTPS"""
        port = self.settings['port']
        url_prefix = self.settings['url_prefix']
        host = self.request.headers.get('Host', 'localhost')
        self.redirect(
            'https://%s:%s%s' % (host, port, url_prefix))

class StaticHandler(tornado.web.StaticFileHandler):
    """
    An override of :class:`tornado.web.StaticFileHandler` to ensure that the
    Access-Control-Allow-Origin header gets set correctly.
    """
    # This is the only function we need to override thanks to the thoughtfulness
    # of the Tornado devs.
    def set_extra_headers(self, path):
        """
        Adds the Access-Control-Allow-Origin header to allow cross-origin
        access to static content for applications embedding Gate One.
        Specifically, this is necessary in order to support loading fonts
        from different origins.
        """
        self.set_header('Access-Control-Allow-Origin', '*')

class BaseHandler(tornado.web.RequestHandler):
    """
    A base handler that all Gate One RequestHandlers will inherit methods from.
    """
    # Right now it's just the one function...
    def get_current_user(self):
        """Tornado standard method--implemented our way."""
        # NOTE: self.current_user is actually an @property that calls
        #       self.get_current_user() and caches the result.
        user_json = self.get_secure_cookie("gateone_user")
        if user_json:
            user = json_decode(user_json)
            user['ip_address'] = self.request.remote_ip
            if user and 'upn' not in user:
                return None
            return user
    # More may be added in the future

class DownloadHandler(BaseHandler):
    """
    A :class:`tornado.web.RequestHandler` to serve up files that wind up in a
    given user's `session_dir` in the 'downloads' directory.  Generally speaking
    these files are generated by the terminal emulator (e.g. cat somefile.pdf)
    but it could be used by plugins as a way to serve up temporary files as
    well.
    """
    # NOTE:  This is a modified version of torando.web.StaticFileHandler
    @tornado.web.authenticated
    def get(self, path, include_body=True):
        session_dir = self.settings['session_dir']
        user = self.current_user
        if user and 'session' in user:
            session = user['session']
        else:
            logging.error(_("DownloadHandler: Could not determine use session"))
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
                f = io.open(filename, 'r')
                data = f.read()
                f.close()
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

    Will encode GATEONE_DIR/static/bell.ogg as a data:URI and put it as the
    <source> of the <audio> tag inside the index.html template.  Gate One
    administrators can replace bell.ogg with whatever they like but the file
    size should be less than 32k when encoded to Base64.
    """
    @tornado.web.authenticated
    @tornado.web.addslash
    # TODO: Get this auto-minifying gateone.js
    def get(self):
        hostname = os.uname()[1]
        location = self.get_argument("location", "default")
        prefs = self.get_argument("prefs", None)
        gateone_js = "%sstatic/gateone.js" % self.settings['url_prefix']
        minified_js_abspath = os.path.join(GATEONE_DIR, 'static')
        minified_js_abspath = os.path.join(
            minified_js_abspath, 'gateone.min.js')
        js_init = self.settings['js_init']
        # Use the minified version if it exists
        if os.path.exists(minified_js_abspath):
            gateone_js = "%sstatic/gateone.min.js" % self.settings['url_prefix']
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
            jsplugins=PLUGINS['js'],
            cssplugins=PLUGINS['css'],
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

    .. note:: All .py modules inside of the application's main directory will be imported even if they do not contain or register a `GOApplication`.

    .. tip:: You can add command line arguments to Gate One by calling :func:`tornado.options.define` anywhere in your application's global namespace.  This works because the :func:`~tornado.options.define` function registers options in Gate One's global namespace (as `tornado.options.options`) and Gate One imports application modules before it evaluates command line arguments.
    """
    def __init__(self, ws):
        self.ws = ws # WebSocket instance
        # Setup some shortcuts to make things more natural and convenient
        self.write_message = ws.write_message
        self.write_binary = ws.write_binary
        self.render_and_send_css = ws.render_and_send_css
        self.send_css = ws.send_css
        self.send_js = ws.send_js
        self.close = ws.close
        self.security = ws.security
        self.request = ws.request
        self.settings = ws.settings

    def __repr__(self):
        return "GOApplication: %s" % self.__class__

    def initialize(self):
        """
        Called by :meth:`ApplicationWebSocket.open` after __init__().
        GOApplications can override this function to perform their own actions
        when the WebSocket is initialized.
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

        .. note:: If the *pattern* does not start with the configured `url_prefix` it will be automatically prepended.
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

class ApplicationWebSocket(WebSocketHandler, OnOffMixin):
    """
    The main WebSocket interface for Gate One, this class is setup to call
    'commands' (aka WebSocket Actions) which are methods registered in
    `self.actions`.  Methods that are registered this way will be exposed and
    directly callable over the WebSocket.
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
            'go:authenticate': self.authenticate,
            'go:get_theme': self.get_theme,
            'go:get_js': self.get_js,
            'go:enumerate_themes': self.enumerate_themes,
            'go:file_request': self.file_request,
            'go:cache_cleanup': self.cache_cleanup,
            'go:send_user_message': self.send_user_message,
            'go:broadcast': self.broadcast,
            'go:list_users': self.list_server_users,
            'go:set_locale': self.set_locale,
        }
        self._events = {}
        # This is used to keep track of used API authentication signatures so
        # we can prevent replay attacks.
        self.prev_signatures = []
        self.origin_denied = True # Only allow valid origins
        self.file_cache = FILE_CACHE # So applications and plugins can reference
        self.persist = PERSIST # So applications and plugins can reference
        self.apps = [] # Gets filled up by self.initialize()
        # The security dict stores applications' various policy functions
        self.security = {}
        WebSocketHandler.__init__(self, application, request, **kwargs)

    @classmethod
    def file_checker(cls):
        #logging.debug("file_checker()") # Kinda noisy so I've commented it out
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
                logging.error(_(
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
                logging.error(_(
                    "Exception encountered trying to execute the file update "
                    "function for {path}...".format(path=path)))
                logging.error(e)
                if options.logging == 'debug':
                    import traceback
                    traceback.print_exc(file=sys.stdout)

    @classmethod
    def watch_file(cls, path, func):
        """
        Registers the given file *path* and *func* in
        `ApplicationWebSocket.watched_files`.  The *func* will be called if the
        file at *path* is modified.
        """
        logging.debug("watch_file('{path}', {func}())".format(
            path=path, func=func.__name__))
        cls.watched_files.update({path: os.stat(path).st_mtime})
        cls.file_update_funcs.update({path: func})

    @classmethod
    def broadcast_file_update(cls):
        """
        Called when there's an update to the 'broadcast_file', broadcasts its
        contents to all connected users.
        """
        session_dir = options.session_dir
        broadcast_file = os.path.join(session_dir, 'broadcast')
        broadcast_file = cls.prefs['*']['gateone'].get(
            'broadcast_file', broadcast_file)
        with io.open(broadcast_file) as f:
            message = f.read()
        if message:
            message = message.rstrip()
            logging.info("Broadcast (via broadcast_file): %s" % message)
            message_dict = {'go:notice': message}
            cls._deliver(message_dict, upn="AUTHENTICATED")
            io.open(broadcast_file, 'w').write(u'') # Empty it out

    def initialize(self, apps=None, **kwargs):
        """
        This gets called by the Tornado framework when ApplicationWebSocket is
        instantiated.  It will be passed the list of *apps* (Gate One
        applications) that are assigned inside the :class:`Application` object.
        These *apps* will be mutated in-place so that `self` will refer to the
        current instance of :class:`ApplicationWebSocket`.  Kind of like a
        dynamic mixin.
        """
        logging.debug('ApplicationWebSocket.initialize(%s)' % apps)
        # Make sure we have all prefs ready for checking
        cls = ApplicationWebSocket
        cls.prefs = get_settings(options.settings_dir)
        for plugin_name, hooks in PLUGIN_HOOKS.items():
            if 'Events' in hooks:
                for event, callback in hooks['Events'].items():
                    self.on(event, callback)
        if not apps:
            return
        for app in apps:
            instance = app(self)
            self.apps.append(instance)
            logging.debug("Initializing %s" % instance)
            if hasattr(instance, 'initialize'):
                instance.initialize()

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
        user_json = self.get_secure_cookie("gateone_user")
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
        0x02).
        """
        self.write_message(message, binary=True)

    def open(self):
        """
        Called when a new WebSocket is opened.  Will deny access to any
        origin that is not defined in self.settings['origin'].
        """

        cls = ApplicationWebSocket
        cls.instances.add(self)
        valid_origins = self.settings['origins']
        if 'Origin' in self.request.headers:
            origin = self.request.headers['Origin']
        elif 'Sec-Websocket-Origin' in self.request.headers: # Old version
            origin = self.request.headers['Sec-Websocket-Origin']
        origin = origin.lower() # hostnames are case-insensitive
        origin = origin.split('://', 1)[1]
        self.origin = origin
        logging.debug("open() origin: %s" % origin)
        if '*' not in valid_origins:
            if origin not in valid_origins:
                self.origin_denied = True
                denied_msg = _("Access denied for origin: %s" % origin)
                logging.error(denied_msg)
                self.write_message(denied_msg)
                self.write_message(_(
                    "If you feel this is incorrect you just have to add '%s' to"
                    " the 'origin' option in your settings.  See the docs "
                    "for details." % origin
                ))
                self.close()
        self.origin_denied = False
        # client_id is unique to the browser/client whereas session_id is unique
        # to the user.  It isn't used much right now but it will be useful in
        # the future once more stuff is running over WebSockets.
        self.client_id = generate_session_id()
        client_address = self.request.connection.address[0]
        user = self.current_user
        # NOTE: self.current_user will call self.get_current_user() the first
        # time it is used.
        if user and 'upn' in user:
            logging.info(
                _("WebSocket opened (%s %s) via origin %s.") % (
                    user['upn'], client_address, origin))
        else:
            logging.info(_("WebSocket opened (unknown user)."))
        if user and 'upn' not in user: # Invalid user info
            logging.error(_("Unauthenticated WebSocket attempt."))
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
            #cache_dir = os.path.join(tempfile.gettempdir(), 'gateone_cache')
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
        for app in self.apps: # Call applications' open() functions (if any)
            if hasattr(app, 'open'):
                app.open()

    def on_message(self, message):
        """Called when we receive a message from the client."""
        # This is super useful when debugging:
        logging.debug("message: %s" % repr(message))
        if self.origin_denied:
            logging.error(_("Message rejected due to invalid origin."))
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
                        logging.error(_(
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
                        logging.error(_(
                         "Error/Unknown WebSocket action, %s: %s (%s line %s)" %
                         (key, e, fname, lineno)))
                        if self.settings['logging'] == 'debug':
                            traceback.print_exc(file=sys.stdout)

    def on_close(self):
        """
        Called when the client terminates the connection.
        """
        logging.debug("on_close()")
        ApplicationWebSocket.instances.discard(self)
        user = self.current_user
        client_address = self.request.connection.address[0]
        if user and user['session'] in SESSIONS:
            # Update 'last_seen' with a datetime object for accuracy
            SESSIONS[user['session']]['last_seen'] = datetime.now()
        if user and 'upn' in user:
            logging.info(
                _("WebSocket closed (%s %s).") % (user['upn'], client_address))
        else:
            logging.info(_("WebSocket closed (unknown user)."))
        # Call applications' on_close() functions (if any)
        for app in self.apps:
            if hasattr(app, 'on_close'):
                app.on_close()

    def pong(self, timestamp):
        """
        Responds to a client 'ping' request...  Just returns the given
        timestamp back to the client so it can measure round-trip time.
        """
        message = {'go:pong': timestamp}
        self.write_message(json_encode(message))

    def authenticate(self, settings):
        """
        Authenticates the client by first trying to use the 'gateone_user'
        cookie or if Gate One is configured to use API authentication it will
        use *settings['auth']*.  Additionally, it will accept
        *settings['container']* and *settings['prefix']* to apply those to the
        equivalent properties (self.container and self.prefix).

        If *settings['location']* is something other than 'default' all new
        application instances will be associated with the given (string) value.
        These applications will be treated separately so they can exist in a
        different browser tab/window.
        """
        logging.debug("authenticate(): %s" % settings)
        # Make sure the client is authenticated if authentication is enabled
        reauth = {'go:reauthenticate': True}
        if self.settings['auth'] and self.settings['auth'] != 'api':
            try:
                user = self.current_user
                if not user:
                    logging.error(_("Unauthenticated WebSocket attempt."))
                    # This usually happens when the cookie_secret gets changed
                    # resulting in "Invalid cookie..." errors.  If we tell the
                    # client to re-auth the problem should correct itself.
                    self.write_message(json_encode(reauth))
                    return
                elif user and user['upn'] == 'ANONYMOUS':
                    logging.error(_("Unauthenticated WebSocket attempt."))
                    # This can happen when a client logs in with no auth type
                    # configured and then later the server is configured to use
                    # authentication.  The client must be told to re-auth:
                    self.write_message(json_encode(reauth))
                    return
            except KeyError: # 'upn' wasn't in user
                # Force them to authenticate
                self.write_message(json_encode(reauth))
                self.close() # Close the WebSocket
        elif self.settings['auth'] and self.settings['auth'] == 'api':
            if 'auth' in settings.keys():
                # 'auth' message should look like this:
                # {
                #    'api_key': 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
                #    'upn': 'joe@company.com',
                #    'timestamp': '1323391717238',
                #    'signature': <gibberish>,
                #    'signature_method': 'HMAC-SHA1',
                #    'api_version': '1.0'
                # }
                #
                # *api_key* is the first half of what gets generated when you
                #   run ./gateone --new_api_key.
                # *upn* is the User Principal Name of the user.  This is
                #   typically something like "joe@company.com".
                # *timestamp* is a JavaScript Date() object converted into an
                #   "time since the epoch" (int or string is OK):
                #       var timestamp = new Date().getTime()
                # *signature* is an HMAC signature of the previous three
                #   variables that was created using the given API key's secret.
                # *signature_method* is the HMAC hashing algorithm to use for
                #   the signature.  Only HMAC-SHA1 is supported for now.
                # *api_version* is the auth API version.  Always "1.0" for now.
                #
                # For reference, here's how to make a signature using PHP:
                # $authobj = array('api_key' => 'M2I1MzJmZjk4MTEwNDk2Zjk4MjMwNmMwMTVkODQzMTEyO', 'upn' => $_SERVER['REMOTE_USER'], 'timestamp' => time() . '0000', 'signature_method' => 'HMAC-SHA1', 'api_version' => '1.0');
                # $authobj['signature'] = hash_hmac('sha1', $authobj['api_key'] . $authobj['upn'] . $authobj['timestamp'], '<secret>');
                # Note that the order matters:  api_key -> upn -> timestamp
                auth_obj = settings['auth']
                from utils import create_signature
                if 'api_key' in auth_obj:
                    # Assume everything else is present if the api_key is there
                    api_key = auth_obj['api_key']
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
                        logging.error(_(
                                'AUTHENTICATION ERROR: Unsupported API auth '
                                'signature method: %s' % signature_method))
                        self.write_message(json_encode(reauth))
                        return
                    hmac_algo = supported_hmacs[signature_method]
                    if api_version != "1.0":
                        logging.error(_(
                                'AUTHENTICATION ERROR: Unsupported API version:'
                                '%s' % api_version))
                        self.write_message(json_encode(reauth))
                        return
                    try:
                        secret = self.settings['api_keys'][api_key]
                    except KeyError:
                        logging.error(_(
                            'AUTHENTICATION ERROR: API Key not found.'))
                        self.write_message(json_encode(reauth))
                        return
                    # TODO: Make API version 1.1 that signs *all* attributes--not just the known ones
                    # Check the signature against existing API keys
                    sig_check = create_signature(
                        secret, api_key, upn, timestamp, hmac_algo=hmac_algo)
                    if sig_check == signature:
                        # Everything matches (great!) so now we do due diligence
                        # by checking the timestamp against the
                        # api_timestamp_window setting and whether or not we've
                        # already used it (to prevent replay attacks).
                        if signature in self.prev_signatures:
                            logging.error(_(
                            "API authentication replay attack detected!  User: "
                            "%s, Remote IP: %s, Origin: %s" % (
                                upn, self.request.remote_ip, self.origin)))
                            message = {'go:notice': _(
                                'AUTH FAILED: Replay attack detected!  This '
                                'event has been logged.')}
                            self.write_message(json_encode(message))
                            self.close()
                            return
                        window = self.settings['api_timestamp_window']
                        then = datetime.fromtimestamp(int(timestamp)/1000)
                        time_diff = datetime.now() - then
                        if time_diff > window:
                            logging.error(_(
                            "API authentication failed due to an expired auth "
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
                            self.close()
                            return
                        logging.debug(_("API Authentication Successful"))
                        self.prev_signatures.append(signature) # Prevent replays
                # Make a directory to store this user's settings/files/logs/etc
                        user_dir = os.path.join(self.settings['user_dir'], upn)
                        if not os.path.exists(user_dir):
                            logging.info(
                                _("Creating user directory: %s" % user_dir))
                            mkdir_p(user_dir)
                            os.chmod(user_dir, 0o770)
                        session_file = os.path.join(user_dir, 'session')
                        if os.path.exists(session_file):
                            session_data = io.open(session_file).read()
                            self.user = json_decode(session_data)
                        else:
                            with io.open(session_file, 'w') as f:
                        # Save it so we can keep track across multiple clients
                                self.user = {
                                    'upn': upn, # FYI: UPN == userPrincipalName
                                    'session': generate_session_id()
                                }
                                session_info_json = json_encode(self.user)
                                f.write(session_info_json)
                        # Attach any additional provided keys/values to the user
                        # object so applications embedding Gate One can use
                        # them in their own plugins and whatnot.
                        known_params = [
                            'api_key',
                            'api_version',
                            'timestamp',
                            'upn',
                            'signature',
                            'signature_method'
                        ]
                        for key, value in auth_obj.items():
                            if key not in known_params:
                                self.user[key] = value
                        # user dicts need a little extra attention for IPs...
                        self.user['ip_address'] = self.request.remote_ip
                        # Force-set the current user:
                        self._current_user = self.user
                    else:
                        logging.error(_(
                            "WebSocket auth failed signature check."))
                        message = {'go:reauthenticate': True}
                        self.write_message(json_encode(message))
                        return
            else:
                logging.error(_("Missing API Key in authentication object"))
                message = {'go:reauthenticate': True}
                self.write_message(json_encode(message))
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
                    cookie_data = self.get_secure_cookie(
                        'gateone_user', value=settings['auth'])
                    # NOTE: The above doesn't actually touch any cookies
                else:
                    # Someone is attempting to perform API-based authentication
                    # but this server isn't configured with 'auth = "api"'.
                    # Let's be real user-friendly and point out this mistake
                    # with a helpful error message...
                    logging.error(_(
                        "Client tried to use API-based authentication but this "
                        "server is configured with 'auth = \"{0}\"'.  Did you "
                        "forget to set 'auth = \"api\" in your settings?"
                        ).format(self.settings['auth']))
                    message = {'go:notice': _(
                        "AUTHENTICATION ERROR: Server is not configured to "
                        "perform API-based authentication.  Did someone forget "
                        "to set 'auth = \"api\" in the settings?")}
                    self.write_message(json_encode(message))
                    return
                if cookie_data:
                    self.user = json_decode(cookie_data)
            if not self.user:
                # Generate a new session/anon user
                self.user = self.current_user
                # Also store/update their session info in localStorage
                encoded_user = self.create_signed_value(
                    'gateone_user', tornado.escape.json_encode(self.user))
                session_message = {'go:gateone_user': encoded_user}
                self.write_message(json_encode(session_message))
            if self.user['upn'] != 'ANONYMOUS':
                # Gate One server's auth config probably changed
                message = {'go:reauthenticate': True}
                self.write_message(json_encode(message))
                #self.close() # Close the WebSocket
                return
        try:
            user = self.current_user
            if user and 'session' in user:
                self.session = user['session']
            else:
                logging.error(_("Authentication failed for unknown user"))
                message = {'go:notice': _('AUTHENTICATION ERROR: User unknown')}
                self.write_message(json_encode(message))
                return
        except Exception as e:
            logging.error(_(
                "Exception encountered trying to authenticate: %s" % e))
            return
        try:
            # Execute any post-authentication hooks that plugins have registered
            if PLUGIN_AUTH_HOOKS:
                for auth_hook in PLUGIN_AUTH_HOOKS:
                    auth_hook(self, self.current_user, self.settings)
        except Exception as e:
            logging.error(_("Exception in registered Auth hook: %s" % e))
        # Apply the container/prefix settings (if present)
        if 'container' in settings:
            self.container = settings['container']
        if 'prefix' in settings:
            self.prefix = settings['prefix']
        # Locations are used to differentiate between different tabs/windows
        self.location = 'default'
        if 'location' in settings:
            self.location = settings['location']
        logging.info(
            _("User {upn} authenticated successfully via origin {origin}"
              " (location: {location}).").format(
                  upn=user['upn'], origin=self.origin, location=self.location))
        # This check is to make sure there's no existing session so we don't
        # accidentally clobber it.
        if self.session not in SESSIONS:
            # Start a new session:
            SESSIONS[self.session] = {
                'last_seen': 'connected',
                'user': self.current_user,
                'timeout_callbacks': [],
                # Locations are virtual containers that indirectly correlate
                # with browser windows/tabs.  The point is to allow things like
                # opening/moving applications/terminals in/to new windows/tabs.
                'locations': {self.location: {}}
            }
        else:
            SESSIONS[self.session]['last_seen'] = 'connected'
            if self.location not in SESSIONS[self.session]['locations']:
                SESSIONS[self.session]['locations'][self.location] = {}
        # A shortcut for SESSIONS[self.session]['locations']:
        self.locations = SESSIONS[self.session]['locations']
        # Send our plugin .js and .css files to the client
        self.send_plugin_static_files(os.path.join(GATEONE_DIR, 'plugins'))
        # Call applications' authenticate() functions (if any)
        for app in self.apps:
            # Set the current user for convenient access
            app.current_user = self.current_user
            if hasattr(app, 'authenticate'):
                app.authenticate()
        # This is just so the client has a human-readable point of reference:
        message = {'go:set_username': self.current_user['upn']}
        self.write_message(json_encode(message))
        # Tell the client which applications are available
        self.list_applications()
        # Startup the session watcher if it isn't already running
        global SESSION_WATCHER
        if not SESSION_WATCHER:
            interval = self.prefs['*']['gateone'].get(
                'session_timeout_check_interval', 30*1000) # 30s default
            SESSION_WATCHER = tornado.ioloop.PeriodicCallback(
                timeout_sessions, interval)
            SESSION_WATCHER.start()
        # Startup the log cleaner so that old user logs get cleaned up
        global CLEANER
        if not CLEANER:
            default_interval = 5*60*1000 # 5 minutes
            # NOTE: This interval isn't in the settings by default because it is
            # kind of obscure.  No reason to clutter things up.
            interval = self.prefs['*']['gateone'].get(
                'user_logs_cleanup_interval', default_interval)
            CLEANER = tornado.ioloop.PeriodicCallback(
                cleanup_user_logs, interval)
            CLEANER.start()
        # Startup the file watcher if it isn't already running and get it
        # watching the broadcast file.
        cls = ApplicationWebSocket
        broadcast_file = os.path.join(self.settings['session_dir'], 'broadcast')
        broadcast_file = self.prefs['*']['gateone'].get(
            'broadcast_file', broadcast_file)
        if broadcast_file not in cls.watched_files:
            # No broadcast file means the file watcher isn't running
            io.open(broadcast_file, 'w').write(u'') # Touch file
            check_time = self.prefs['*']['gateone'].get(
                'file_check_interval', 5000)
            cls.watch_file(broadcast_file, cls.broadcast_file_update)
            io_loop = tornado.ioloop.IOLoop.instance()
            cls.file_watcher = tornado.ioloop.PeriodicCallback(
                cls.file_checker, check_time, io_loop=io_loop)
            cls.file_watcher.start()
        self.trigger('go:authenticate')

    def list_applications(self):
        """
        Sends a message to the client indiciating which applications are
        available to the user.
        """
        policy = applicable_policies("gateone", self.current_user, self.prefs)
        enabled_applications = policy.get('enabled_applications', [])
        if not enabled_applications:
            for app in self.apps: # Use the app's name attribute
                name = str(app)
                if hasattr(app, 'name'):
                    name = app.name
                enabled_applications.append(name)
        # I've been using these for testing stuff...  Ignore
        enabled_applications.append("Bookmarks")
        enabled_applications.append("Terminal: Nethack")
        enabled_applications.append("Terminal: Login")
        enabled_applications.append("Admin")
        enabled_applications.append("IRC")
        enabled_applications.append("Log Viewer")
        enabled_applications.append("Help")
        enabled_applications.append("RDP")
        enabled_applications.append("VNC")
        enabled_applications.sort()
        # Use this user's specific allowed list of applications if possible:
        user_apps = policy.get('user_applications', enabled_applications)
        message = {'go:applications': user_apps}
        self.write_message(json_encode(message))

    def render_style(self, style_path, **kwargs):
        """
        Renders the CSS template at *style_path* using *kwargs* and returns the
        path to the rendered result.  If the given style has already been
        rendered the existing cache path will be returned.

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
        if not os.path.exists(rendered_path):
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

        .. note:: This will send the theme files for all applications and plugins that have a matching stylesheet in their 'templates' directory.
        """
        logging.debug('get_theme(%s)' % settings)
        send_css = self.prefs['*']['gateone'].get('send_css', True)
        if not send_css:
            if not hasattr('logged_css_message', self):
                logging.info(_(
                    "send_css is false; will not send JavaScript."))
            # So we don't repeat this message a zillion times in the logs:
            self.logged_css_message = True
            return
        use_client_cache = self.prefs['*']['gateone'].get(
            'use_client_cache', True)
        cache_dir = self.settings['cache_dir']
        if not os.path.exists(cache_dir):
            mkdir_p(cache_dir)
        templates_path = os.path.join(GATEONE_DIR, 'templates')
        themes_path = os.path.join(templates_path, 'themes')
        #printing_path = os.path.join(templates_path, 'printing')
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
        mtime = os.stat(rendered_path).st_mtime
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
        filename = 'theme.css' # Don't need a hashed name for the theme
        cached_theme_path = os.path.join(cache_dir, filename)
        new_theme_path = os.path.join(cache_dir, filename+'.new')
        with io.open(new_theme_path, 'wb') as f:
            for path in theme_files:
                f.write(io.open(path, 'rb').read())
        new = open(new_theme_path, 'rb').read()
        old = ''
        if os.path.exists(cached_theme_path):
            old = open(cached_theme_path, 'rb').read()
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
            'mtime': mtime,
            'kind': kind,
            'element_id': 'theme'
        })
        self.file_cache[filename] = {
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
            files = [a['filename'] for a in out_dict['files']]
            self.file_request(files, use_client_cache=use_client_cache)

    @require(authenticated())
    def get_js(self, filename):
        """
        Attempts to find the specified *filename* file in Gate One's static
        directories (GATEONE_DIR/static/ and each plugin's respective 'static'
        dir).

        In the event that a plugin's JavaScript file has the same name as a file
        in GATEONE_DIR/static/ the plugin's copy of the file will take
        precedence.  This is to allow plugins to override defaults.

        .. note:: This will alow authenticated clients to download whatever file they want that ends in .js inside of /static/ directories.
        """
        logging.debug('get_js(%s)' % filename)
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
        if filename in js_files.keys():
            with io.open(js_files[filename]) as f:
                out_dict['data'] = f.read()
        message = {'go:load_js': out_dict}
        self.write_message(message)

    def cache_cleanup(self, message):
        """
        Attached to the 'go:cache_cleanup' WebSocket action; rifles through the
        given list of *message['filenames']* from the client and sends a
        'go:cache_expired' WebSocket action to the client with a list of files
        that no longer exist in `self.file_cache` (so it can clean them up).
        """
        logging.debug("cache_cleanup(%s)" % message)
        from hashlib import md5
        filenames = message['filenames']
        kind = message['kind']
        expired = []
        for filename in filenames:
            if filename.endswith('.js'):
                # The file_cache uses hashes; convert it
                filename = md5(
                    filename.split('.')[0].encode('utf-8')).hexdigest()[:10]
            if filename not in self.file_cache:
                expired.append(filename)
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
        Attached to the 'go:file_request' WebSocket action; minifies, caches,
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
        from utils import get_or_cache
        from hashlib import md5
        if isinstance(files_or_hash, (list, tuple)):
            for filename_hash in files_or_hash:
                self.file_request(
                    filename_hash, use_client_cache=use_client_cache)
            return
        else:
            filename_hash = files_or_hash
        if filename_hash.endswith('.js'):
            # The file_cache uses hashes; convert it
            filename_hash = md5(
                filename_hash.split('.')[0].encode('utf-8')).hexdigest()[:10]
        # Get the file info out of the file_cache so we can send it
        element_id = self.file_cache[filename_hash].get('element_id', None)
        path = self.file_cache[filename_hash]['path']
        filename = self.file_cache[filename_hash]['filename']
        kind = self.file_cache[filename_hash]['kind']
        mtime = self.file_cache[filename_hash]['mtime']
        requires = self.file_cache[filename_hash].get('requires', None)
        media = self.file_cache[filename_hash].get('media', 'screen')
        out_dict = {
            'result': 'Success',
            'cache': use_client_cache,
            'mtime': mtime,
            'filename': filename_hash,
            'kind': kind,
            'element_id': element_id,
            'requires': requires,
            'media': media
        }
        if filename.endswith('.js'):
            # JavaScript files can have dependencies which require that the
            # client knows the filename.  The path-is-information-disclosure
            # problem really only applies to rendered CSS template files anyway
            out_dict['filename'] = filename
        cache_dir = self.settings['cache_dir']
        if self.settings['debug']:
            out_dict['data'] = get_or_cache(cache_dir, path, minify=False)
        else:
            out_dict['data'] = get_or_cache(cache_dir, path, minify=True)
        if kind == 'js':
            message = {'go:load_js': out_dict}
        elif kind == 'css':
            out_dict['css'] = True # So loadStyleAction() knows what to do
            message = {'go:load_style': out_dict}
        elif kind == 'theme':
            out_dict['theme'] = True
            message = {'go:load_theme': out_dict}
        self.write_message(message)

    def send_js_or_css(self,
        paths_or_fileobj, kind, element_id=None, requires=None, media="screen"):
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

        .. note: If the slimit module is installed it will be used to minify the JS before being sent to the client.
        """
        if kind == 'js':
            send_js = self.prefs['*']['gateone'].get('send_js', True)
            if not send_js:
                if not hasattr('logged_js_message', self):
                    logging.info(_(
                        "send_js is false; will not send JavaScript."))
                # So we don't repeat this message a zillion times in the logs:
                self.logged_js_message = True
                return
        elif kind == 'css':
            send_css = self.prefs['*']['gateone'].get('send_css', True)
            if not send_css:
                if not hasattr('logged_css_message', self):
                    logging.info(_("send_css is false; will not send CSS."))
                # So we don't repeat this message a zillion times in the logs:
                self.logged_css_message = True
        use_client_cache = self.prefs['*']['gateone'].get(
            'use_client_cache', True)
        if requires and not isinstance(requires, (tuple, list)):
            requires = [requires] # This makes the logic simpler at the client
        from hashlib import md5
        if isinstance(paths_or_fileobj, (tuple, list)):
            out_dict = {'files': []}
            for file_obj in paths_or_fileobj:
                if isinstance(file_obj, basestring):
                    path = file_obj
                    filename = os.path.split(path)[1]
                else:
                    file_obj.seek(0) # Just in case
                    path = file_obj.name
                    filename = os.path.split(file_obj.name)[1]
                mtime = os.stat(path).st_mtime
                filename_hash = md5(
                    filename.split('.')[0].encode('utf-8')).hexdigest()[:10]
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
                if not filename.endswith('.js'):
                    # JavaScript files don't need a hashed filename
                    filename = filename_hash
                out_dict['files'].append({
                    'filename': filename,
                    'mtime': mtime,
                    'kind': kind,
                    'requires': requires,
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
            filename = os.path.split(path)[1]
        else:
            paths_or_fileobj.seek(0) # Just in case
            path = paths_or_fileobj.name
            filename = os.path.split(paths_or_fileobj.name)[1]
        mtime = os.stat(path).st_mtime
        logging.debug('send_js_or_css(%s) (mtime: %s)' % (path, mtime))
        if not os.path.exists(path):
            logging.error(_("send_js_or_css(): File not found: %s" % path))
            return
        # Use a hash of the filename because these names can get quite long.
        # Also, we don't want to reveal the file structure on the server.
        filename_hash = md5(
            filename.split('.')[0].encode('utf-8')).hexdigest()[:10]
        # NOTE: The .split('.') above is so the hash we generate is always the
        # same.  The tail end of the filename will have its modification date.
        # Cache the metadata for sync
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
        if not filename.endswith('.js'):
            # JavaScript files don't need a hashed filename
            filename = filename_hash
        out_dict = {'files': [{
            'filename': filename,
            'mtime': mtime,
            'kind': kind,
            'requires': requires,
            'media': media # NOTE: Ignored if JS
        }]}
        if use_client_cache:
            message = {'go:file_sync': out_dict}
            self.write_message(message)
        else:
            files = [a['filename'] for a in out_dict['files']]
            self.file_request(files, use_client_cache=use_client_cache)

    def send_js(self, path, element_id=None, requires=None):
        """
        A shortcut for `self.send_js_or_css(path, 'js', requires=requires)`.
        """
        self.send_js_or_css(
            path, 'js', element_id=element_id, requires=requires)

    def send_css(self, path, element_id=None, media="screen"):
        """
        A shortcut for
        `self.send_js_or_css(path, 'css', element_id=element_id, media=media)`
        """
        self.send_js_or_css(path, 'css', element_id=element_id, media=media)

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
            `'send_css': false` to gateone/settings/10server.conf
        """
        send_css = self.prefs['*']['gateone'].get('send_css', True)
        if not send_css:
            if not hasattr('logged_css_message', self):
                logging.info(_("send_css is false; will not send CSS."))
            # So we don't repeat this message a zillion times in the logs:
            self.logged_css_message = True
            return
        cache_dir = self.settings['cache_dir']
        mtime = os.stat(css_path).st_mtime
        safe_path = css_path.replace('/', '_') # So we can name the file safely
        rendered_filename = 'rendered_%s_%s' % (safe_path, int(mtime))
        rendered_path = os.path.join(cache_dir, rendered_filename)
        if os.path.exists(rendered_path):
            self.send_css(rendered_path)
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
        self.send_css(rendered_path)
        # Remove older versions of the rendered template if present
        for fname in os.listdir(cache_dir):
            if fname == rendered_filename:
                continue
            elif safe_path in fname:
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

        .. note:: If you want to serve Gate One's JavaScript via a different mechanism (e.g. nginx) this functionality can be completely disabled by adding `'send_js': false` to gateone/settings/10server.conf
        """
        logging.debug('send_plugin_static_files(%s)' % plugins_dir)
        send_js = self.prefs['*']['gateone'].get('send_js', True)
        if not send_js:
            if not hasattr('logged_js_message', self):
                logging.info(_("send_js is false; will not send JavaScript."))
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
                        self.send_css(css_file_path)

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

        .. note:: Translation files must be the result of a `pojson /path/to/translation.po` conversion.
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
                logging.error(
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
#       available for them to connect.  This may use something other than the
#       'notice' WebSocket action in the future to avoid confusion (if need be).
    @require(authenticated(), policies('gateone'))
    def send_user_message(self, settings):
        """
        Sends the given *settings['message']* to the given *settings['upn']*.

        if *upn* is 'AUTHENTICATED' all users will get the message.
        """
        if 'message' not in settings:
            self.send_message(_("Error: No message to send."))
            return
        if 'upn' not in settings:
            self.send_message(_("Error: Missing UPN."))
            return
        self.send_message(settings['message'], upn=settings['upn'])
        self.trigger('go:send_user_message', settings)

    def send_message(self, message, upn=None, session=None):
        """
        Sends the given *message* to the client using the 'notice' WebSocket
        action at the currently-connected client.

        If *upn* is provided the *message* will be sent to all users with a
        matching 'upn' value.

        If *session* is provided the message will be sent to all users with a
        matching session ID.  This is useful in situations where all users share
        the same 'upn' (i.e. ANONYMOUS).

        if *upn* is 'AUTHENTICATED' all users will get the message.
        """
        message_dict = {'go:notice': message}
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
        Sends the given *message* (string) to all connected, authenticated
        users.
        """
        logging.info("Broadcast: %s" % message)
        from utils import strip_xss # Prevent XSS attacks
        message, bad_tags = strip_xss(message, replacement="entities")
        self.send_message(message, upn="AUTHENTICATED")
        self.trigger('go:broadcast', message)

    @require(authenticated(), policies('gateone'))
    def list_server_users(self):
        """
        Returns a list of users currently connected to the Gate One server to
        the client via the 'go:user_list' WebSocket action.  Only users with the
        'list_users' policy are allowed to execute this action.
        """
        users = ApplicationWebSocket._list_connected_users()
        logging.debug('list_server_users(): %s' % users)
        # Remove things that users should not see such as their session ID
        filtered_users = []
        policy = applicable_policies('gateone', self.current_user, self.prefs)
        allowed_fields = policy.get('user_list_fields', False)
        # If not set, just strip the session ID
        if not allowed_fields:
            allowed_fields = ('upn', 'ip_address')
        for user in users:
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
            except AttributeError:
                continue
            if session and user['session'] == session:
                instance.write_message(message)
            elif upn == "AUTHENTICATED":
                instance.write_message(message)
            elif upn == user['upn']:
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

class ErrorHandler(tornado.web.RequestHandler):
    """
    Generates an error response with status_code for all requests.
    """
    def __init__(self, application, request, status_code):
        tornado.web.RequestHandler.__init__(self, application, request)
        self.set_status(status_code)

    def get_error_html(self, status_code, **kwargs):
        self.require_setting("static_url")
        if status_code in [404, 500, 503, 403]:
            filename = os.path.join(
                self.settings['static_url'], '%d.html' % status_code)
            if os.path.exists(filename):
                f = io.open(filename, 'r')
                data = f.read()
                f.close()
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
            logging.info(_("Using %s authentication") % settings['auth'])
        else:
            logging.info(_(
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
        # This removes duplicate handlers for the same regex, allowing plugins
        # to override defaults:
        handlers = merge_handlers(handlers)
        # Include JS-only and CSS-only plugins (for logging purposes)
        js_plugins = [a.split('/')[2] for a in PLUGINS['js']]
        css_plugins = []
        for i in css_plugins:
            if '?' in i: # CSS Template
                css_plugins.append(i.split('plugin=')[1].split('&')[0])
            else: # Static CSS file
                css_plugins.append(i.split('/')[1])
        plugin_list = list(set(PLUGINS['py'] + js_plugins + css_plugins))
        plugin_list.sort() # So there's consistent ordering
        logging.info(_("Loaded plugins: %s") % ", ".join(plugin_list))
        tornado.web.Application.__init__(self, handlers, **tornado_settings)

def define_options():
    """
    Calls `tornado.options.define` for all of Gate One's command-line options.
    """
    # NOTE: To test this function interactively you must import tornado.options
    # and call tornado.options.parse_config_file(*some_config_path*).  After you
    # do that the options will wind up in tornado.options.options
    global user_locale
    # Default to using the shell's LANG variable as the locale
    try:
        default_locale = os.environ['LANG'].split('.')[0]
    except KeyError: # $LANG isn't set
        default_locale = "en_US"
    user_locale = locale.get(default_locale)
    # NOTE: The locale setting above is only for the --help messages.
    # Simplify the auth option help message
    auths = "none, api, google, ssl"
    if KerberosAuthHandler:
        auths += ", kerberos"
    if PAMAuthHandler:
        auths += ", pam"
    # Simplify the syslog_facility option help message
    facilities = list(FACILITIES.keys())
    facilities.sort()
    # Figure out the default origins
    default_origins = [
        'localhost',
        '127.0.0.1',
    ]
    # Used both http and https above to demonstrate that both are acceptable
    try:
        additional_origins = socket.gethostbyname_ex(socket.gethostname())
    except socket.gaierror:
        # Couldn't get any IPs from the hostname
        additional_origins = []
    for host in additional_origins:
        if isinstance(host, str):
            default_origins.append('%s' % host)
        else: # It's a list
            for _host in host:
                default_origins.append('%s' % _host)
    default_origins = ";".join(default_origins)
    config_default = os.path.join(GATEONE_DIR, "server.conf")
    # NOTE: --settings_dir deprecates --config
    settings_default = os.path.join(GATEONE_DIR, "settings")
    define("config",
        default=config_default,
        help=_("DEPRECATED.  Use --settings_dir."),
        type=basestring
    )
    define("settings_dir",
        default=settings_default,
        help=_(
            "Path to the settings directory.  Default: %s" % settings_default),
        type=basestring
    )
    define(
        "cache_dir",
        default=os.path.join(tempfile.gettempdir(), 'gateone_cache'),
        help=_(
            "Path where Gate One should store temporary global files (e.g. "
            "rendered templates, CSS, JS, etc)."),
        type=basestring
    )
    define(
        "debug",
        default=False,
        help=_("Enable debugging features such as auto-restarting when files "
               "are modified.")
    )
    define("cookie_secret", # 45 chars is, "Good enough for me" (cookie joke =)
        default=None,
        help=_("Use the given 45-character string for cookie encryption."),
        type=basestring
    )
    define("command",
        default=None,
        help=_(
            "DEPRECATED: Use the 'commands' option in the terminal settings."),
        type=basestring
    )
    define("address",
        default="",
        help=_("Run on the given address.  Default is all addresses (IPv6 "
               "included).  Multiple address can be specified using a semicolon"
               " as a separator (e.g. '127.0.0.1;::1;10.1.1.100')."),
        type=basestring)
    define("port", default=443, help=_("Run on the given port."), type=int)
    define(
        "enable_unix_socket",
        default=False,
        help=_("Enable Unix socket support."),
        type=bool)
    define(
        "unix_socket_path",
        default="/tmp/gateone.sock",
        help=_("Path to the Unix socket (if --enable_unix_socket=True)."),
        type=basestring)
    # Please only use this if Gate One is running behind something with SSL:
    define(
        "disable_ssl",
        default=False,
        help=_("If enabled, Gate One will run without SSL (generally not a "
               "good idea).")
    )
    define(
        "certificate",
        default="certificate.pem",
        help=_("Path to the SSL certificate.  Will be auto-generated if none is"
               " provided."),
        type=basestring
    )
    define(
        "keyfile",
        default="keyfile.pem",
        help=_("Path to the SSL keyfile.  Will be auto-generated if none is"
               " provided."),
        type=basestring
    )
    define(
        "ca_certs",
        default=None,
        help=_("Path to a file containing any number of concatenated CA "
               "certificates in PEM format.  They will be used to authenticate "
               "clients if the 'ssl_auth' option is set to 'optional' or "
               "'required'."),
        type=basestring
    )
    define(
        "ssl_auth",
        default='none',
        help=_("Enable the use of client SSL (X.509) certificates as a "
               "secondary authentication factor (the configured 'auth' type "
               "will come after SSL auth).  May be one of 'none', 'optional', "
               "or 'required'.  NOTE: Only works if the 'ca_certs' option is "
               "configured."),
        type=basestring
    )
    define(
        "user_dir",
        default=os.path.join(GATEONE_DIR, "users"),
        help=_("Path to the location where user files will be stored."),
        type=basestring
    )
    define(
        "user_logs_max_age",
        default="30d",
        help=_("Maximum amount of length of time to keep any given user log "
                "before it is removed."),
        type=basestring
    )
    define(
        "session_dir",
        default="/tmp/gateone",
        help=_(
            "Path to the location where session information will be stored."),
        type=basestring
    )
    define(
        "syslog_facility",
        default="daemon",
        help=_("Syslog facility to use when logging to syslog (if "
               "syslog_session_logging is enabled).  Must be one of: %s."
               "  Default: daemon" % ", ".join(facilities)),
        type=basestring
    )
    define(
        "syslog_host",
        default=None,
        help=_("Remote host to send syslog messages to if syslog_logging is "
               "enabled.  Default: None (log to the local syslog daemon "
               "directly).  NOTE:  This setting is required on platforms that "
               "don't include Python's syslog module."),
        type=basestring
    )
    define(
        "session_timeout",
        default="5d",
        help=_("Amount of time that a session is allowed to idle before it is "
        "killed.  Accepts <num>X where X could be one of s, m, h, or d for "
        "seconds, minutes, hours, and days.  Default is '5d' (5 days)."),
        type=basestring
    )
    define(
        "new_api_key",
        default=False,
        help=_("Generate a new API key that an external application can use to "
               "embed Gate One."),
    )
    define(
        "auth",
        default="none",
        help=_("Authentication method to use.  Valid options are: %s" % auths),
        type=basestring
    )
    # This is to prevent replay attacks.  Gate One only keeps a "working memory"
    # of API auth objects for this amount of time.  So if the Gate One server is
    # restarted we don't have to write them to disk as anything older than this
    # setting will be invalid (no need to check if it has already been used).
    define(
        "api_timestamp_window",
        default="30s", # 30 seconds
        help=_(
            "How long before an API authentication object becomes invalid.  "
            "Default is '30s' (30 seconds)."),
        type=basestring
    )
    define(
        "sso_realm",
        default=None,
        help=_("Kerberos REALM (aka DOMAIN) to use when authenticating clients."
               " Only relevant if Kerberos authentication is enabled."),
        type=basestring
    )
    define(
        "sso_service",
        default='HTTP',
        help=_("Kerberos service (aka application) to use. Defaults to HTTP. "
               "Only relevant if Kerberos authentication is enabled."),
        type=basestring
    )
    define(
        "pam_realm",
        default=os.uname()[1],
        help=_("Basic auth REALM to display when authenticating clients.  "
        "Default: hostname.  "
        "Only relevant if PAM authentication is enabled."),
        # NOTE: This is only used to show the user a REALM at the basic auth
        #       prompt and as the name in the GATEONE_DIR+'/users' directory
        type=basestring
    )
    define(
        "pam_service",
        default='login',
        help=_("PAM service to use.  Defaults to 'login'. "
               "Only relevant if PAM authentication is enabled."),
        type=basestring
    )
    define(
        "embedded",
        default=False,
        help=_(
            "When embedding Gate One, this option is available to templates.")
    )
    define(
        "locale",
        default=default_locale,
        help=_("The locale (e.g. pt_PT) Gate One should use for translations."
             "  If not provided, will default to $LANG (which is '%s' in your "
             "current shell), or en_US if not set."
             % os.environ.get('LANG', 'not set').split('.')[0]),
        type=basestring
    )
    define("js_init",
        default="",
        help=_("A JavaScript object (string) that will be used when running "
               "GateOne.init() inside index.html.  "
               "Example: --js_init=\"{scheme: 'white'}\" would result in "
               "GateOne.init({scheme: 'white'})"),
        type=basestring
    )
    define(
        "https_redirect",
        default=False,
        help=_("If enabled, a separate listener will be started on port 80 that"
               " redirects users to the configured port using HTTPS.")
    )
    define(
        "url_prefix",
        default="/",
        help=_("An optional prefix to place before all Gate One URLs. e.g. "
               "'/gateone/'.  Use this if Gate One will be running behind a "
               "reverse proxy where you want it to be located at some sub-"
               "URL path."),
        type=basestring
    )
    define(
        "origins",
        default=default_origins,
        help=_("A semicolon-separated list of origins you wish to allow access "
               "to your Gate One server over the WebSocket.  This value must "
               "contain the hostnames and FQDNs (e.g. foo;foo.bar;) users will"
               " use to connect to your Gate One server as well as the "
               "hostnames/FQDNs of any sites that will be embedding Gate One. "
               "Here's the default on your system: '%s'. "
               "Alternatively, '*' may be  specified to allow access from "
               "anywhere." % default_origins),
        type=basestring
    )
    define(
        "pid_file",
        default="/tmp/gateone.pid",
        help=_(
            "Define the path to the pid file.  Default: /tmp/gateone.pid"),
        type=basestring
    )
    define(
        "uid",
        default=str(os.getuid()),
        help=_(
            "Drop privileges and run Gate One as this user/uid."),
        type=basestring
    )
    define(
        "gid",
        default=str(os.getgid()),
        help=_(
            "Drop privileges and run Gate One as this group/gid."),
        type=basestring
    )
    define(
        "api_keys",
        default="",
        help=_("The 'key:secret,...' API key pairs you wish to use (only "
               "applies if using API authentication)"),
        type=basestring
    )
    define(
        "combine_js",
        default="",
        help=_(
            "Combines all of Gate One's JavaScript files into one big file and "
            "saves it at the given path (e.g. ./gateone.py "
            "--combine_js=/tmp/gateone.js)"),
        type=basestring
    )
    define(
        "combine_css",
        default="",
        help=_(
            "Combines all of Gate One's CSS Template files into one big file "
            "and saves it at the given path (e.g. ./gateone.py "
            "--combine_css=/tmp/gateone.css)."),
        type=basestring
    )
    define(
        "combine_css_container",
        default="#gateone",
        help=_(
            "Use this setting in conjunction with --combine_css if the <div> "
            "where Gate One lives is named something other than #gateone"),
        type=basestring
    )

def generate_server_conf():
    """
    Generates a fresh settings/10server.conf file using the arguments provided
    on the command line to override defaults.
    """
    logging.info(_(
        u"Gate One settings are incomplete.  A new settings/10server.conf"
        u" will be generated."))
    from utils import options_to_settings
    auth_settings = {} # Auth stuff goes in 20authentication.conf
    all_setttings = options_to_settings(options) # NOTE: options is global
    settings_path = options.settings_dir
    server_conf_path = os.path.join(settings_path, '10server.conf')
    if os.path.exists(server_conf_path):
        logging.error(_(
            "You have a 10server.conf but it is either invalid (syntax "
            "error) or missing essential settings."))
        sys.exit(1)
    config_defaults = all_setttings['*']['gateone']
    # Don't need this in the actual settings file:
    del config_defaults['settings_dir']
    non_options = [
        # These are things that don't really belong in settings
        'new_api_key', 'help', 'kill', 'config'
    ]
    # Don't need non-options in there either:
    for non_option in non_options:
        if non_option in config_defaults:
            del config_defaults[non_option]
    # Generate a new cookie_secret
    config_defaults['cookie_secret'] = generate_session_id()
    # Separate out the authentication settings
    authentication_options = [
        # These are here only for logical separation in the .conf files
        'api_timestamp_window', 'auth', 'pam_realm', 'pam_service',
        'sso_realm', 'sso_service', 'ssl_auth'
    ]
    for key, value in list(config_defaults.items()):
        if key in authentication_options:
            auth_settings.update({key: value})
            del config_defaults[key]
    # Make sure we have a valid log_file_prefix
    if config_defaults['log_file_prefix'] == None:
        web_log_dir = os.path.join(GATEONE_DIR, 'logs')
        web_log_path = os.path.join(web_log_dir, 'webserver.log')
        config_defaults['log_file_prefix'] = web_log_path
    else:
        web_log_dir = os.path.split(config_defaults['log_file_prefix'])[0]
    if not os.path.exists(web_log_dir):
        # Make sure the directory exists
        mkdir_p(web_log_dir)
    if not os.path.exists(config_defaults['log_file_prefix']):
        # Make sure the file is present
        io.open(
            config_defaults['log_file_prefix'],
            mode='w', encoding='utf-8').write(u'')
    auth_conf_path = os.path.join(settings_path, '20authentication.conf')
    template_path = os.path.join(
        GATEONE_DIR, 'templates', 'settings', '10server.conf')
    from utils import settings_template
    new_settings = settings_template(
        template_path, settings=config_defaults)
    template_path = os.path.join(
        GATEONE_DIR, 'templates', 'settings', '10server.conf')
    with io.open(server_conf_path, mode='w') as s:
        s.write(u"// This is Gate One's main settings file.\n")
        s.write(new_settings)
    new_auth_settings = settings_template(
        template_path, settings=auth_settings)
    with io.open(auth_conf_path, mode='w') as s:
        s.write(u"// This is Gate One's authentication settings file.\n")
        s.write(new_auth_settings)

def convert_old_server_conf():
    """
    Converts old-style server.conf files to the new settings/10server.conf
    format.
    """
    from utils import settings_template, RUDict
    settings = RUDict()
    auth_settings = RUDict()
    terminal_settings = RUDict()
    api_keys = RUDict({"*": {"gateone": {"api_keys": {}}}})
    terminal_options = [ # These are now terminal-app-specific setttings
        'command', 'dtach', 'session_logging', 'session_logs_max_age',
        'syslog_session_logging'
    ]
    authentication_options = [
        # These are here only for logical separation in the .conf files
        'api_timestamp_window', 'auth', 'pam_realm', 'pam_service',
        'sso_realm', 'sso_service', 'ssl_auth'
    ]
    with io.open(options.config) as f:
        # Regular server-wide settings will go in 10server.conf by default.
        # These settings can actually be spread out into any number of .conf
        # files in the settings directory using whatever naming convention
        # you want.
        settings_path = options.settings_dir
        server_conf_path = os.path.join(settings_path, '10server.conf')
        # Using 20authentication.conf for authentication settings
        auth_conf_path = os.path.join(
            settings_path, '20authentication.conf')
        terminal_conf_path = os.path.join(settings_path, '50terminal.conf')
        api_keys_conf = os.path.join(settings_path, '20api_keys.conf')
        # NOTE: Using a separate file for authentication stuff for no other
        #       reason than it seems like a good idea.  Don't want one
        #       gigantic config file for everything (by default, anyway).
        logging.info(_(
            "Old server.conf file found.  Converting to the new format as "
            "%s, %s, and %s" % (
                server_conf_path, auth_conf_path, terminal_conf_path)))
        for line in f:
            if line.startswith('#'):
                continue
            key = line.split('=', 1)[0].strip()
            value = eval(line.split('=', 1)[1].strip())
            if key in terminal_options:
                if key == 'command':
                    # Fix the path to ssh_connect.py if present
                    if 'ssh_connect.py' in value:
                        value = value.replace(
                            '/plugins/', '/applications/terminal/plugins/')
                if key == 'session_logs_max_age':
                    # This is now user_logs_max_age.  Put it in 'gateone'
                    settings.update({'user_logs_max_age': value})
                terminal_settings.update({key: value})
            elif key in authentication_options:
                auth_settings.update({key: value})
            elif key == 'origins':
                # Convert to the new format (a list with no http://)
                origins = value.split(';')
                converted_origins = []
                for origin in origins:
                    # The new format doesn't bother with http:// or https://
                    if origin == '*':
                        converted_origins.append(origin)
                        continue
                    origin = origin.split('://')[1]
                    if origin not in converted_origins:
                        converted_origins.append(origin)
                settings.update({key: converted_origins})
            elif key == 'api_keys':
                # Move these to the new location/format (20api_keys.conf)
                for pair in value.split(','):
                    api_key, secret = pair.split(':')
                    if bytes == str:
                        api_key = api_key.decode('UTF-8')
                        secret = secret.decode('UTF-8')
                    api_keys['*']['gateone']['api_keys'].update(
                        {api_key: secret})
                # API keys can be written right away
                with io.open(api_keys_conf, 'w') as conf:
                    msg = _(
                        u"// This file contains the key and secret pairs "
                        u"used by Gate One's API authentication method.\n")
                    conf.write(msg)
                    conf.write(unicode(api_keys))
            else:
                settings.update({key: value})
        template_path = os.path.join(
            GATEONE_DIR, 'templates', 'settings', '10server.conf')
        new_settings = settings_template(template_path, settings=settings)
        if not os.path.exists(server_conf_path):
            with io.open(server_conf_path, 'w') as s:
                s.write(_(u"// This is Gate One's main settings file.\n"))
                s.write(new_settings)
        new_auth_settings = settings_template(
            template_path, settings=auth_settings)
        if not os.path.exists(auth_conf_path):
            with io.open(auth_conf_path, 'w') as s:
                s.write(_(
                    u"// This is Gate One's authentication settings file.\n"))
                s.write(new_auth_settings)
        # Terminal uses a slightly different template; it converts 'command'
        # to the new 'commands' format.
        template_path = os.path.join(
            GATEONE_DIR, 'templates', 'settings', '50terminal.conf')
        new_term_settings = settings_template(
            template_path, settings=terminal_settings)
        if not os.path.exists(terminal_conf_path):
            with io.open(terminal_conf_path, 'w') as s:
                s.write(_(
                    u"// This is Gate One's Terminal application settings "
                    u"file.\n"))
                s.write(new_term_settings)
    # Rename the old server.conf so this logic doesn't happen again
    os.rename(options.config, "%s.old" % options.config)

def apply_cli_overrides(go_settings):
    """
    Updates *go_settings* in-place with values given on the command line.
    """
    # Figure out which options are being overridden on the command line
    arguments = []
    non_options = [
        # These are things that don't really belong in settings
        'new_api_key', 'help', 'kill', 'config', 'combine_js', 'combine_css',
        'combine_css_container'
    ]
    for arg in list(sys.argv)[1:]:
        if not arg.startswith('-'):
            break
        else:
            arguments.append(arg.lstrip('-').split('=', 1)[0])
    for argument in arguments:
        if argument in non_options:
            continue
        if argument in options._options.keys():
            go_settings[argument] = options._options[argument].value()
    # Update Tornado's options from our settings.
    # NOTE: For options given on the command line this step should be redundant.
    for key, value in go_settings.items():
        if key in non_options:
            continue
        if key in options._options:
            if str == bytes: # Python 2
                if isinstance(value, unicode):
                    # For whatever reason Tornado doesn't like unicode values
                    # for its own settings unless you're using Python 3...
                    value = str(value)
            if key in ['origins', 'api_keys']:
                # These two settings are special and taken care of further down.
                continue
            options._options[key].set(value)

def main():
    global _
    global PLUGINS
    global APPLICATIONS
    define_options()
    # Before we do anything else we need the get the settings_dir argument (if
    # given) so we can make sure we're handling things accordingly.
    settings_dir = os.path.join(GATEONE_DIR, 'settings')
    for arg in sys.argv:
        if arg.startswith('--settings_dir'):
            settings_dir = arg.split('=', 1)[1]
    if not os.path.exists(settings_dir):
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
    go_settings = {}
    if 'gateone' in all_settings['*']:
        # The check above will fail in first-run situations
        enabled_plugins = all_settings['*']['gateone'].get(
            'enabled_plugins', [])
        enabled_applications = all_settings['*']['gateone'].get(
            'enabled_applications', [])
        go_settings = all_settings['*']['gateone']
    PLUGINS = get_plugins(os.path.join(GATEONE_DIR, 'plugins'), enabled_plugins)
    imported = load_modules(PLUGINS['py'])
    for plugin in imported:
        try:
            PLUGIN_HOOKS.update({plugin.__name__: plugin.hooks})
        except AttributeError:
            pass # No hooks--probably just a supporting .py file.
    APPLICATIONS = get_applications(
        os.path.join(GATEONE_DIR, 'applications'), enabled_applications)
    # NOTE: load_modules() imports all the .py files in applications.  This
    # means that applications can place calls to tornado.options.define()
    # anywhere in their .py files and they should automatically be usable by the
    # user at this point in the startup process.
    app_modules = load_modules(APPLICATIONS)
    # Having parse_command_line() after loading applications in case an
    # application has additional calls to define().
    tornado.options.parse_command_line()
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
    logging.getLogger().setLevel(getattr(logging, options.logging.upper()))
    APPLICATIONS = [] # Replace it with a list of actual class instances
    web_handlers = []
    for module in app_modules:
        module.SESSIONS = SESSIONS
        try:
            APPLICATIONS.extend(module.apps)
            if hasattr(module, 'init'):
                module.init(all_settings)
            if hasattr(module, 'web_handlers'):
                web_handlers.extend(module.web_handlers)
        except AttributeError:
            pass # No apps--probably just a supporting .py file.
    logging.debug(_("Imported applications: {0}".format(str(APPLICATIONS))))
    # Convert the old server.conf to the new settings file format and save it
    # as a number of distinct .conf files to keep things better organized.
    # NOTE: This logic will go away some day as it only applies when moving from
    #       Gate One 1.1 (or older) to newer versions.
    if os.path.exists(options.config):
        convert_old_server_conf()
    if 'gateone' not in all_settings['*']:
        # User has yet to create a 10server.conf (or equivalent)
        all_settings['*']['gateone'] = {} # Will be filled out below
    # If you want any missing config file entries re-generated just delete the
    # cookie_secret line...
    if 'cookie_secret' not in go_settings or not go_settings['cookie_secret']:
        # Generate a default 10server.conf with a random cookie secret
        # NOTE: This will also generate a new 10server.conf if it is missing.
        generate_server_conf()
        # Make sure these values get updated
        all_settings = get_settings(options.settings_dir)
        go_settings = all_settings['*']['gateone']
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
    if not os.path.exists(go_settings['user_dir']): # Make our user_dir
        try:
            mkdir_p(go_settings['user_dir'])
        except OSError:
            import pwd
            logging.error(_(
                "Gate One could not create %s.  Please ensure that user,"
                " %s has permission to create this directory or create it "
                "yourself and make user, %s its owner." % (go_settings['user_dir'],
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
    if not os.path.exists(log_dir):
        try:
            mkdir_p(log_dir)
        except OSError:
            logging.error(_("\x1b[1;31mERROR:\x1b[0m Could not create %s for "
                "log_file_prefix: %s" % (log_dir, go_settings['log_file_prefix']
            )))
            logging.error(_("You probably want to change this option, run Gate "
                  "One as root, or create that directory and give the proper "
                  "user ownership of it."))
            sys.exit(1)
    if not check_write_permissions(uid, log_dir):
        # Try to correct it
        try:
            recursive_chown(log_dir, uid, gid)
        except (ChownError, OSError) as e:
            logging.error("log_dir: %s, uid: %s, gid: %s" % (log_dir, uid, gid))
            logging.error(e)
            sys.exit(1)
    if options.new_api_key:
        # Generate a new API key for an application to use and save it to
        # settings/20api_keys.conf.
        from utils import RUDict
        api_key = generate_session_id()
        # Generate a new secret
        secret = generate_session_id()
        api_keys_conf = os.path.join(GATEONE_DIR, 'settings', '20api_keys.conf')
        new_keys = {api_key: secret}
        api_keys = RUDict({"*": {"gateone": {"api_keys": {}}}})
        if os.path.exists(api_keys_conf):
            api_keys = get_settings(api_keys_conf)
        api_keys.update({"*": {"gateone": {"api_keys": new_keys}}})
        with io.open(api_keys_conf, 'w') as conf:
            msg = _(
                u"// This file contains the key and secret pairs used by Gate "
                u"One's API authentication method.\n")
            conf.write(msg)
            conf.write(unicode(api_keys))
        logging.info(_(u"A new API key has been generated: %s" % api_key))
        logging.info(_(u"This key can now be used to embed Gate One into other "
                u"applications."))
        sys.exit(0)
    if options.combine_js:
        from utils import combine_javascript
        combine_javascript(options.combine_js, options.settings_dir)
        sys.exit(0)
    if options.combine_css:
        from utils import combine_css
        combine_css(
            options.combine_css,
            options.combine_css_container,
            options.settings_dir)
        sys.exit(0)
    # Display the version in case someone sends in a log for for support
    logging.info(_("Gate One %s" % __version__))
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
            origins = options.origins.value().lower().split(';')
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
    if go_settings['keyfile'] == "keyfile.pem":
        # If set to the default we'll assume they want to use the one in the
        # gateone_dir
        go_settings['keyfile'] = "%s/keyfile.pem" % GATEONE_DIR
    if go_settings['certificate'] == "certificate.pem":
        # Just like the keyfile, assume they want to use the one in the
        # gateone_dir
        go_settings['certificate'] = "%s/certificate.pem" % GATEONE_DIR
    if not go_settings['disable_ssl']:
        if not os.path.exists(go_settings['keyfile']):
            logging.info(_("No SSL private key found.  One will be generated."))
            gen_self_signed_ssl(path=GATEONE_DIR)
        if not os.path.exists(go_settings['certificate']):
            logging.info(_("No SSL certificate found.  One will be generated."))
            gen_self_signed_ssl(path=GATEONE_DIR)
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
    for option in options._options.keys():
        if option in non_options:
            continue # These don't belong
        if option not in go_settings:
            go_settings[option] = options._options[option].value()
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
            logging.warning(_(
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
            logging.info(_("Listening on Unix socket '{socketpath}'".format(
                socketpath=go_settings['unix_socket_path'])))
        address = none_fix(go_settings['address'])
        if address:
            for addr in address.split(';'):
                if addr: # Listen on all given addresses
                    if go_settings['https_redirect']:
                        if go_settings['disable_ssl']:
                            logging.error(_(
                            "You have https_redirect *and* disable_ssl enabled."
                            "  Please pick one or the other."))
                            sys.exit(1)
                        logging.info(_(
                            "http://{addr}:80/ will be redirected to...".format(
                                addr=addr)
                        ))
                        https_redirect.listen(port=80, address=addr)
                    logging.info(_(
                        "Listening on {proto}{address}:{port}/".format(
                            proto=proto, address=addr, port=go_settings['port'])
                    ))
                    https_server.listen(port=go_settings['port'], address=addr)
        elif address == '':
            # Listen on all addresses (including IPv6)
            if go_settings['https_redirect']:
                if go_settings['disable_ssl']:
                    logging.error(_(
                        "You have https_redirect *and* disable_ssl enabled."
                        "  Please pick one or the other."))
                    sys.exit(1)
                logging.info(_("http://*:80/ will be redirected to..."))
                https_redirect.listen(port=80, address="")
            logging.info(_(
                "Listening on {proto}*:{port}/".format(
                    proto=proto, port=go_settings['port'])))
            https_server.listen(port=go_settings['port'], address="")
        # NOTE:  To have Gate One *not* listen on a TCP/IP address you may set
        #        address=None
        write_pid(go_settings['pid_file'])
        pid = read_pid(go_settings['pid_file'])
        logging.info(_("Process running with pid " + pid))
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
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt: # ctrl-c
        logging.info(_("Caught KeyboardInterrupt.  Killing sessions..."))
    finally:
        tornado.ioloop.IOLoop.instance().stop()
        remove_pid(go_settings['pid_file'])
        logging.info(_("pid file removed."))
        # TODO: Move this dtach stuff to app_terminal.py
        if not all_settings['*']['terminal']['dtach']:
            # If we're not using dtach play it safe by cleaning up any leftover
            # processes.  When passwords are used with the ssh_conenct.py script
            # it runs os.setsid() on the child process which means it won't die
            # when Gate One is closed.  This is primarily to handle that
            # specific situation.
            killall(go_settings['session_dir'], go_settings['pid_file'])
            # Cleanup the session_dir (it's supposed to only contain temp stuff)
            import shutil
            shutil.rmtree(go_settings['session_dir'], ignore_errors=True)

if __name__ == "__main__":
    main()
