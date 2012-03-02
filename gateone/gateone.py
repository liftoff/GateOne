#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

# 1.0 TODO:
# * DOCUMENTATION!
# * Write init scripts to stop/start/restart Gate One safely.  Also make sure that .deb and .rpm packages safely restart Gate One without impacting running sessions.  The setup.py should also attempt to minify the .css and .js files.

# Meta
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
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
      --embedded                       Run Gate One in Embedded Mode (no toolbar, only one terminal allowed, etc.  See docs).
      --https_redirect                 If enabled, a separate listener will be started on port 80 that redirects users to the configured port using HTTPS.
      --js_init                        A JavaScript object (string) that will be used when running GateOne.init() inside index.html.  Example: --js_init="{scheme: 'white'}" would result in GateOne.init({scheme: 'white'})
      --keyfile                        Path to the SSL keyfile.  Will be auto-generated if none is provided.
      --kill                           Kill any running Gate One terminal processes including dtach'd processes.
      --locale                         The locale (e.g. pt_PT) Gate One should use for translations.  If not provided, will default to $LANG (which is 'en_US' in your current shell), or en_US if not set.
      --new_api_key                    Generate a new API key that an external application can use toembed Gate One.
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

.. note:: By default Gate One will run on port 443 which requires root on most systems.  Use `--port=(something higher than 1024)` for non-root users.

Plugins
-------
Gate One includes support for any combination of the following types of plugins:

 * Python
 * JavaScript
 * CSS

Python plugins can integrate with Gate One in three ways:

 * Adding or overriding tornado.web.RequestHandlers (with a given regex).
 * Adding or overriding methods (aka "commands") in TerminalWebSocket.
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
 * Creates symbolic links inside ./static/ that point to each plugin's respective /static/ directory and serves them to clients.
 * Serves the index.html that includes plugins' respective .js and .css files.

Class Docstrings
================
'''

# Standard library modules
import os
import sys
import logging
import threading
import time
from functools import partial, wraps
from datetime import datetime, timedelta

# Tornado modules (yeah, we use all this stuff)
try:
    import tornado.httpserver
    import tornado.ioloop
    import tornado.options
    import tornado.web
    import tornado.auth
    import tornado.template
    from tornado.websocket import WebSocketHandler
    from tornado.escape import json_decode
    from tornado.options import define, options
    from tornado import locale
    from tornado import version as tornado_version
    from tornado import version_info as tornado_version_info
except ImportError:
    print("\x1b[31;1mERROR:\x1b[0m Gate One requires the Tornado framework.  "
          "You probably want to run something like, \x1b[1m'pip install "
          "--upgrade tornado'\x1b[0m.")
    sys.exit(1)

if tornado_version_info[0] < 2 and tornado_version_info[1] < 2:
    print("\x1b[31;1mERROR:\x1b[0m Gate One requires version 2.2+ of the "
            "Tornado framework.  The installed version of Tornado is version "
            "%s." % tornado_version)
    sys.exit(1)

# We want this turned on right away
tornado.options.enable_pretty_logging()

# Our own modules
import termio, terminal
from auth import NullAuthHandler, KerberosAuthHandler, GoogleAuthHandler
from auth import PAMAuthHandler
from utils import str2bool, generate_session_id, cmd_var_swap, mkdir_p
from utils import gen_self_signed_ssl, killall, get_plugins, load_plugins
from utils import create_plugin_links, merge_handlers, none_fix, short_hash
from utils import convert_to_timedelta, kill_dtached_proc, FACILITIES, which
from utils import process_opt_esc_sequence, create_data_uri, MimeTypeFail
from utils import string_to_syslog_facility, fallback_bell, json_encode

# Setup the locale functions before anything else
locale.set_default_locale('en_US')
user_locale = None # Replaced with the actual user locale object in __main__
def _(string):
    """
    Wraps user_locale.translate so we can .encode('UTF-8') when writing to
    stdout.  This function will get overridden by the regular translate()
    function in __main__
    """
    return user_locale.translate(string).encode('UTF-8')

# Globals
SESSIONS = {} # We store the crux of most session info here
CMD = None # Will be overwritten by options.command
TIMEOUT = timedelta(days=5) # Gets overridden by options.session_timeout
GATEONE_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGINS = get_plugins(os.path.join(GATEONE_DIR, 'plugins'))
PLUGIN_WS_CMDS = {} # Gives plugins the ability to extend/enhance TerminalWebSocket
PLUGIN_HOOKS = {} # Gives plugins the ability to hook into various things.
PLUGIN_AUTH_HOOKS = [] # For plugins to register functions to be called after a
                       # user successfully authenticates
# Gate One registers a handler for for terminal.py's CALLBACK_OPT special escape
# sequence callback.  Whenever this escape sequence is encountered, Gate One
# will parse the sequence's contained characters looking for the following
# format:
#   <plugin name>|<whatever>
# The <whatever> part will be passed to any plugin matching <plugin name> if the
# plugin has 'Escape': <function> registered in its hooks.
PLUGIN_ESC_HANDLERS = {}

# Secondary locale setup
locale_dir = os.path.join(GATEONE_DIR, 'i18n')
locale.load_gettext_translations(locale_dir, 'gateone')
# NOTE: The locale gets set in __main__

# A HUGE thank you to Micah Elliott (http://MicahElliott.com) for posting these
# values here: https://gist.github.com/719710
# This gets used by StyleHandler to generate the CSS that supports 256-colors:
COLORS_256 = {
    # 8-color equivalents:
     0: "000000",
     1: "800000",
     2: "008000",
     3: "808000",
     4: "000080",
     5: "800080",
     6: "008080",
     7: "c0c0c0",
    # "Bright" (16-color) equivalents:
     8: "808080",
     9: "ff0000",
    10: "00ff00",
    11: "ffff00",
    12: "0000ff",
    13: "ff00ff",
    14: "00ffff",
    15: "ffffff",
    # The rest of the 256-colors:
    16: "000000",
    17: "00005f",
    18: "000087",
    19: "0000af",
    20: "0000d7",
    21: "0000ff",
    22: "005f00",
    23: "005f5f",
    24: "005f87",
    25: "005faf",
    26: "005fd7",
    27: "005fff",
    28: "008700",
    29: "00875f",
    30: "008787",
    31: "0087af",
    32: "0087d7",
    33: "0087ff",
    34: "00af00",
    35: "00af5f",
    36: "00af87",
    37: "00afaf",
    38: "00afd7",
    39: "00afff",
    40: "00d700",
    41: "00d75f",
    42: "00d787",
    43: "00d7af",
    44: "00d7d7",
    45: "00d7ff",
    46: "00ff00",
    47: "00ff5f",
    48: "00ff87",
    49: "00ffaf",
    50: "00ffd7",
    51: "00ffff",
    52: "5f0000",
    53: "5f005f",
    54: "5f0087",
    55: "5f00af",
    56: "5f00d7",
    57: "5f00ff",
    58: "5f5f00",
    59: "5f5f5f",
    60: "5f5f87",
    61: "5f5faf",
    62: "5f5fd7",
    63: "5f5fff",
    64: "5f8700",
    65: "5f875f",
    66: "5f8787",
    67: "5f87af",
    68: "5f87d7",
    69: "5f87ff",
    70: "5faf00",
    71: "5faf5f",
    72: "5faf87",
    73: "5fafaf",
    74: "5fafd7",
    75: "5fafff",
    76: "5fd700",
    77: "5fd75f",
    78: "5fd787",
    79: "5fd7af",
    80: "5fd7d7",
    81: "5fd7ff",
    82: "5fff00",
    83: "5fff5f",
    84: "5fff87",
    85: "5fffaf",
    86: "5fffd7",
    87: "5fffff",
    88: "870000",
    89: "87005f",
    90: "870087",
    91: "8700af",
    92: "8700d7",
    93: "8700ff",
    94: "875f00",
    95: "875f5f",
    96: "875f87",
    97: "875faf",
    98: "875fd7",
    99: "875fff",
    100: "878700",
    101: "87875f",
    102: "878787",
    103: "8787af",
    104: "8787d7",
    105: "8787ff",
    106: "87af00",
    107: "87af5f",
    108: "87af87",
    109: "87afaf",
    110: "87afd7",
    111: "87afff",
    112: "87d700",
    113: "87d75f",
    114: "87d787",
    115: "87d7af",
    116: "87d7d7",
    117: "87d7ff",
    118: "87ff00",
    119: "87ff5f",
    120: "87ff87",
    121: "87ffaf",
    122: "87ffd7",
    123: "87ffff",
    124: "af0000",
    125: "af005f",
    126: "af0087",
    127: "af00af",
    128: "af00d7",
    129: "af00ff",
    130: "af5f00",
    131: "af5f5f",
    132: "af5f87",
    133: "af5faf",
    134: "af5fd7",
    135: "af5fff",
    136: "af8700",
    137: "af875f",
    138: "af8787",
    139: "af87af",
    140: "af87d7",
    141: "af87ff",
    142: "afaf00",
    143: "afaf5f",
    144: "afaf87",
    145: "afafaf",
    146: "afafd7",
    147: "afafff",
    148: "afd700",
    149: "afd75f",
    150: "afd787",
    151: "afd7af",
    152: "afd7d7",
    153: "afd7ff",
    154: "afff00",
    155: "afff5f",
    156: "afff87",
    157: "afffaf",
    158: "afffd7",
    159: "afffff",
    160: "d70000",
    161: "d7005f",
    162: "d70087",
    163: "d700af",
    164: "d700d7",
    165: "d700ff",
    166: "d75f00",
    167: "d75f5f",
    168: "d75f87",
    169: "d75faf",
    170: "d75fd7",
    171: "d75fff",
    172: "d78700",
    173: "d7875f",
    174: "d78787",
    175: "d787af",
    176: "d787d7",
    177: "d787ff",
    178: "d7af00",
    179: "d7af5f",
    180: "d7af87",
    181: "d7afaf",
    182: "d7afd7",
    183: "d7afff",
    184: "d7d700",
    185: "d7d75f",
    186: "d7d787",
    187: "d7d7af",
    188: "d7d7d7",
    189: "d7d7ff",
    190: "d7ff00",
    191: "d7ff5f",
    192: "d7ff87",
    193: "d7ffaf",
    194: "d7ffd7",
    195: "d7ffff",
    196: "ff0000",
    197: "ff005f",
    198: "ff0087",
    199: "ff00af",
    200: "ff00d7",
    201: "ff00ff",
    202: "ff5f00",
    203: "ff5f5f",
    204: "ff5f87",
    205: "ff5faf",
    206: "ff5fd7",
    207: "ff5fff",
    208: "ff8700",
    209: "ff875f",
    210: "ff8787",
    211: "ff87af",
    212: "ff87d7",
    213: "ff87ff",
    214: "ffaf00",
    215: "ffaf5f",
    216: "ffaf87",
    217: "ffafaf",
    218: "ffafd7",
    219: "ffafff",
    220: "ffd700",
    221: "ffd75f",
    222: "ffd787",
    223: "ffd7af",
    224: "ffd7d7",
    225: "ffd7ff",
    226: "ffff00",
    227: "ffff5f",
    228: "ffff87",
    229: "ffffaf",
    230: "ffffd7",
    231: "ffffff",
    # Grayscale:
    232: "080808",
    233: "121212",
    234: "1c1c1c",
    235: "262626",
    236: "303030",
    237: "3a3a3a",
    238: "444444",
    239: "4e4e4e",
    240: "585858",
    241: "626262",
    242: "6c6c6c",
    243: "767676",
    244: "808080",
    245: "8a8a8a",
    246: "949494",
    247: "9e9e9e",
    248: "a8a8a8",
    249: "b2b2b2",
    250: "bcbcbc",
    251: "c6c6c6",
    252: "d0d0d0",
    253: "dadada",
    254: "e4e4e4",
    255: "eeeeee"
}

# Helper functions
def require_auth(method):
    """
    An equivalent to tornado.web.authenticated for WebSockets
    (TerminalWebSocket, specifically).
    """
    @wraps(method)
    def wrapper(self, *args, **kwargs):
        if not self.get_current_user():
            self.write_message(_("Only valid users please.  Thanks!"))
            self.close() # Close the WebSocket
        return method(self, *args, **kwargs)
    return wrapper

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

class BaseHandler(tornado.web.RequestHandler):
    """
    A base handler that all Gate One RequestHandlers will inherit methods from.
    """
    # Right now it's just the one function...
    def get_current_user(self):
        """Tornado standard method--implemented our way."""
        user_json = self.get_secure_cookie("gateone_user")
        if user_json:
            user = json_decode(user_json)
            if user and 'upn' not in user:
                return None
            return user
    # More may be added in the future

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
    # TODO: Add the ability for users to define their own individual bells.
    @tornado.web.authenticated
    @tornado.web.addslash
    def get(self):
        hostname = os.uname()[1]
        gateone_js = "%sstatic/gateone.js" % self.settings['url_prefix']
        minified_js_abspath = os.path.join(GATEONE_DIR, 'static')
        minified_js_abspath = os.path.join(
            minified_js_abspath, 'gateone.min.js')
        bell_path = os.path.join(GATEONE_DIR, 'static')
        bell_path = os.path.join(bell_path, 'bell.ogg')
        if os.path.exists(bell_path):
            try:
                bell_data_uri = create_data_uri(bell_path)
            except MimeTypeFail:
                bell_data_uri = fallback_bell
        else: # There's always the fallback
            bell_data_uri = fallback_bell
        js_init = self.settings['js_init']
        # Use the minified version if it exists
        if os.path.exists(minified_js_abspath):
            gateone_js = "%sstatic/gateone.min.js" % self.settings['url_prefix']
        template_path = os.path.join(GATEONE_DIR, 'templates')
        index_path = os.path.join(template_path, 'index.html')
        self.render(
            index_path,
            hostname=hostname,
            gateone_js=gateone_js,
            jsplugins=PLUGINS['js'],
            cssplugins=PLUGINS['css'],
            js_init=js_init,
            bell_data_uri=bell_data_uri,
            url_prefix=self.settings['url_prefix']
        )

class StyleHandler(BaseHandler):
    """
    Serves up our CSS templates (themes, colors, etc) and enumerates what's
    available depending on the given arguments:

    If 'enumerate' is given, returna  JSON-encoded object containing lists of
    our themes/colors in the form of:

        {'themes': themes, 'colors': colors}

    NOTE: The .css part of filenames will be stripped when sent to the client.

    If 'theme' or 'colors' are provided (along with the requisite 'container'
    and 'prefix' arguments), returns the content of the requested CSS file.
    """
    # Disabled authentication for this so we could get embedding working without
    # requiring a cookie to be set.  Stylesheet enumeration isn't exactly a
    # compelling attack vector.
    def get(self):
        self.set_header ('Access-Control-Allow-Origin', '*')
        enum = self.get_argument("enumerate", None)
        templates_path = os.path.join(GATEONE_DIR, 'templates')
        themes_path = os.path.join(templates_path, 'themes')
        colors_path = os.path.join(templates_path, 'term_colors')
        if enum:
            themes = os.listdir(themes_path)
            themes = [a.replace('.css', '') for a in themes]
            colors = os.listdir(colors_path)
            colors = [a.replace('.css', '') for a in colors]
            self.set_header ('Content-Type', 'application/json')
            message = {'themes': themes, 'colors': colors}
            self.write(json_encode(message))
            self.finish()
        else:
            container = self.get_argument("container")
            prefix = self.get_argument("prefix")
            theme = self.get_argument("theme", None)
            colors = self.get_argument("colors", None)
            # Setup our 256-color support CSS:
            colors_256 = ""
            for i in xrange(256):
                fg = "#%s span.fx%s {color: #%s;}" % (
                    container, i, COLORS_256[i])
                bg = "#%s span.bx%s {background-color: #%s;} " % (
                    container, i, COLORS_256[i])
                fg_rev = "#%s span.reverse.fx%s {background-color: #%s; color: inherit;}" % (
                    container, i, COLORS_256[i])
                bg_rev = "#%s span.reverse.bx%s {color: #%s; background-color: inherit;} " % (
                    container, i, COLORS_256[i])
                colors_256 += "%s %s %s %s" % (fg, bg, fg_rev, bg_rev)
            colors_256 += "\n"
            self.set_header ('Content-Type', 'text/css')
            if theme:
                try:
                    theme_path = os.path.join(themes_path, "%s.css" % theme)
                    self.render(
                        theme_path,
                        container=container,
                        prefix=prefix,
                        colors_256=colors_256,
                        url_prefix=self.settings['url_prefix']
                    )
                except IOError:
                    # Given theme was not found
                    logging.error(_("%s was not found" % theme_path))
            elif colors:
                try:
                    color_path = os.path.join(colors_path, "%s.css" % colors)
                    self.render(
                        color_path,
                        container=container,
                        prefix=prefix,
                        url_prefix=self.settings['url_prefix']
                    )
                except IOError:
                    # Given theme was not found
                    logging.error(_("%s was not found" % color_path))

class PluginCSSTemplateHandler(BaseHandler):
    """
    Renders plugin CSS template files, passing them the same *prefix* and
    *container* variables used by the StyleHandler.  This is so we don't need a
    CSS template rendering function in every plugin that needs to use {{prefix}}
    or {{container}}.

    gateone.js will automatically load all \*.css files in plugin template
    directories using this method.
    """
    # Had to disable authentication for this for the embedded stuff to work.
    # Not a big deal...  Just some stylesheets.  To an attacker it's like
    # peering into a window and seeing the wallpaper.
    def get(self):
        container = self.get_argument("container")
        prefix = self.get_argument("prefix")
        plugin = self.get_argument("plugin")
        template = self.get_argument("template")
        templates_path = os.path.join(GATEONE_DIR, 'templates')
        plugin_templates_path = os.path.join(templates_path, plugin)
        plugin_template = os.path.join(plugin_templates_path, "%s.css" % plugin)
        self.set_header ('Content-Type', 'text/css')
        try:
            self.render(
                plugin_template,
                container=container,
                prefix=prefix,
                url_prefix=self.settings['url_prefix']
            )
        except IOError:
            # The provided plugin/template combination was not found
            logging.error(_("%s.css was not found" % plugin_template))

class JSPluginsHandler(BaseHandler):
    """
    Combines all JavaScript plugins into a single file to keep things simple and
    speedy.
    """
    # No auth for this...  Not really necessary (just serves up a static file).
    def get(self):
        self.set_header ('Content-Type', 'application/javascript')
        plugins = get_plugins(os.path.join(GATEONE_DIR, "plugins"))
        static_dir = os.path.join(GATEONE_DIR, "static")
        combined_plugins = os.path.join(static_dir, "combined_plugins.js")
        if os.path.exists(combined_plugins):
            with open(combined_plugins) as f:
                js_data = f.read()
                if len(js_data) < 100: # Needs to be created
                    self.write(self._combine_plugins())
                    return
                else: # It hasn't changed, send it as-is
                    self.write(js_data)
        else: # File doesn't exist, create it and send it to the client
            self.write(self._combine_plugins())

    def _combine_plugins(self):
        """
        Combines all plugin .js files into one (combined_plugins.js)
        """
        plugins = get_plugins(os.path.join(GATEONE_DIR, "plugins"))
        static_dir = os.path.join(GATEONE_DIR, "static")
        combined_plugins = os.path.join(static_dir, "combined_plugins.js")
        out = ""
        for js_plugin in plugins['js']:
            js_path = os.path.join(GATEONE_DIR, js_plugin.lstrip('/'))
            with open(js_path) as f:
                out += f.read()
        with open(combined_plugins, 'w') as f:
            f.write(out)
        return out

class TerminalWebSocket(WebSocketHandler):
    """
    The main WebSocket interface for Gate One, this class is setup to call
    'commands' which are methods registered in self.commands.  Methods that are
    registered this way will be exposed and directly callable over the
    WebSocket.
    """
    def __init__(self, application, request):
        WebSocketHandler.__init__(self, application, request)
        self.commands = {
            'ping': self.pong,
            'authenticate': self.authenticate,
            'new_terminal': self.new_terminal,
            'set_terminal': self.set_terminal,
            'kill_terminal': self.kill_terminal,
            'c': self.char_handler, # Just 'c' to keep the bandwidth down
            'refresh': self.refresh_screen,
            'full_refresh': self.full_refresh,
            'resize': self.resize,
            'get_webworker': self.get_webworker,
            'debug_terminal': self.debug_terminal
        }
        self.terms = {}
        # So we can keep track and avoid sending unnecessary messages:
        self.titles = {}
        self.api_user = None
        self.em_dimensions = None

    def get_current_user(self):
        """
        Mostly identical to the function of the same name in MainHandler.  The
        difference being that when API authentication is enabled the WebSocket
        will expect and perform its own auth of the client.
        """
        if self.settings['auth'] == 'api':
            return self.api_user
        user_json = self.get_secure_cookie("gateone_user")
        if not user_json:
            return None
        return json_decode(user_json)

    def open(self):
        """Called when a new WebSocket is opened."""
        # TODO: Make it so that idle WebSockets that haven't passed authentication tests get auto-closed within N seconds in order to prevent a DoS scenario where the attacker keeps all possible ports open indefinitely.
        # client_id is unique to the browser/client whereas session_id is unique
        # to the user.  It isn't used much right now but it will be useful in
        # the future once more stuff is running over WebSockets.
        self.client_id = generate_session_id()
        user = self.get_current_user()
        if user and 'upn' in user:
            logging.info(
                _("WebSocket opened (%s).") % user['upn'])
        else:
            logging.info(_("WebSocket opened (unknown user)."))
        if user and 'upn' not in user: # Invalid user info
            logging.error(_("Unauthenticated WebSocket attempt."))
            # In case this is a legitimate client that simply had its auth info
            # expire/go bad, tell it to re-auth by calling the appropriate
            # action on the other side.
            message = {'reauthenticate': True}
            self.write_message(json_encode(message))
            self.close() # Close the WebSocket

    def on_message(self, message):
        """Called when we receive a message from the client."""
        # This is super useful when debugging:
        logging.debug("message: %s" % repr(message))
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
                try: # Plugins first so they can override behavior if they wish
                    PLUGIN_WS_CMDS[key](value, tws=self)# tws==TerminalWebSocket
                except (KeyError, TypeError, AttributeError):
                    try:
                        if value:
                            self.commands[key](value)
                        else:
                            # Try, try again
                            self.commands[key]()
                    except (KeyError, TypeError, AttributeError):
                        pass # Ignore commands we don't understand

    def on_close(self):
        """
        Called when the client terminates the connection.

        .. note:: Normally self.refresh_screen() catches the disconnect first and this method won't end up being called.
        """
        logging.debug("on_close()")
        user = self.get_current_user()
        # Remove all attached callbacks so we're not wasting memory/CPU on
        # disconnected clients
        if user and user['session'] in SESSIONS:
            for term in SESSIONS[user['session']]:
                if isinstance(term, int):
                    try:
                        multiplex = SESSIONS[user['session']][term]['multiplex']
                        multiplex.remove_all_callbacks(self.callback_id)
                        term_emulator = multiplex.term
                        term_emulator.remove_all_callbacks(self.callback_id)
                    except AttributeError:
                        # User never completed opening a terminal so
                        # self.callback_id is missing.  Nothing to worry about
                        pass
        if user and 'upn' in user:
            logging.info(
                _("WebSocket closed (%s).") % user['upn'])
        else:
            logging.info(_("WebSocket closed (unknown user)."))

    def pong(self, timestamp):
        """
        Responds to a client 'ping' request...  Just returns the given
        timestamp back to the client so it can measure round-trip time.
        """
        message = {'pong': timestamp}
        self.write_message(json_encode(message))

    def authenticate(self, settings):
        """
        Authenticates the client by first trying to use the 'gateone_user'
        cookie or if Gate One is configured to use API authentication it will
        use *settings['auth']*.  Additionally, it will accept
        *settings['container']* and *settings['prefix']* to apply those to the
        equivalent properties (self.container and self.prefix).
        """
        logging.debug("authenticate(): %s" % settings)
        # Make sure the client is authenticated if authentication is enabled
        if self.settings['auth'] and self.settings['auth'] != 'api':
            try:
                user = self.get_current_user()
                if not user:
                    logging.error(_("Unauthenticated WebSocket attempt."))
                    # This usually happens when the cookie_secret gets changed
                    # resulting in "Invalid cookie..." errors.  If we tell the
                    # client to re-auth the problem should correct itself.
                    message = {'reauthenticate': True}
                    self.write_message(json_encode(message))
                    self.close() # Close the WebSocket
                elif user and user['upn'] == 'ANONYMOUS':
                    logging.error(_("Unauthenticated WebSocket attempt."))
                    # This can happen when a client logs in with no auth type
                    # configured and then later the server is configured to use
                    # authentication.  The client must be told to re-auth:
                    message = {'reauthenticate': True}
                    self.write_message(json_encode(message))
                    self.close() # Close the WebSocket
            except KeyError: # 'upn' wasn't in user
                # Force them to authenticate
                message = {'reauthenticate': True}
                self.write_message(json_encode(message))
                self.close() # Close the WebSocket
        elif self.settings['auth'] and self.settings['auth'] == 'api':
            if 'auth' in settings.keys():
                # 'auth' message should look like this:
                # {
                #    'api_key': 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
                #    'upn': 'joe@company.com',
                #    'timestamp': 1323391717238,
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
                #   "time since the epoch": var timestamp = new Date().getTime()
                # *signature* is an HMAC signature of the previous three
                #   variables that was created using the given API key's secret.
                # *signature_method* is the HMAC hashing algorithm to use for
                #   the signature.  Only HMAC-SHA1 is supported for now.
                # *api_version* is the auth API version.  Always "1.0" for now.
                auth_obj = settings['auth']
                if 'api_key' in auth_obj:
                    # Assume everything else is present if the api_key is there
                    api_key = auth_obj['api_key']
                    upn = auth_obj['upn']
                    timestamp = auth_obj['timestamp']
                    signature = auth_obj['signature']
                    signature_method = auth_obj['signature_method']
                    api_version = auth_obj['api_version']
                    if signature_method != 'HMAC-SHA1':
                        message = {
                            'notice': _(
                                'AUTHENTICATION ERROR: Unsupported signature '
                                'method: %s' % signature_method)
                        }
                        self.write_message(json_encode(message))
                    secret = self.settings['api_keys'][api_key]
                    # Check the signature against existing API keys
                    sig_check = tornado.web._create_signature(
                        secret, api_key, upn, timestamp)
                    if sig_check == signature:
                        # Auth success!
                        logging.debug(_("WebSocket Authentication Successful"))
                        # TODO: Add timestamp checking as well
                # Make a directory to store this user's settings/files/logs/etc
                        user_dir = os.path.join(self.settings['user_dir'], upn)
                        if not os.path.exists(user_dir):
                            logging.info(
                                _("Creating user directory: %s" % user_dir))
                            mkdir_p(user_dir)
                            os.chmod(user_dir, 0700)
                        session_file = os.path.join(user_dir, 'session')
                        if os.path.exists(session_file):
                            session_data = open(session_file).read()
                            self.api_user = json_decode(session_data)
                        else:
                            with open(session_file, 'w') as f:
                        # Save it so we can keep track across multiple clients
                                self.api_user = {
                                    'upn': upn, # FYI: UPN == userPrincipalName
                                    'session': generate_session_id()
                                }
                                session_info_json = json_encode(self.api_user)
                                f.write(session_info_json)
                    else:
                        logging.error(_(
                            "WebSocket auth failed signature check."))
            else:
                logging.error(_("Missing API Key in authentication object"))
        else:
            # Double-check there isn't a user set in the cookie (i.e. we have
            # recently changed Gate One's settings).  If there is, force it
            # back to ANONYMOUS.
            user = self.get_current_user()
            if user:
                user = user['upn']
            if user != 'ANONYMOUS':
                message = {'reauthenticate': True}
                self.write_message(json_encode(message))
                self.close() # Close the WebSocket
        try:
            self.session = self.get_current_user()['session']
        except Exception as e:
            logging.error("authenticate session exception: %s" % e)
            message = {'notice': _('AUTHENTICATION ERROR: %s' % e)}
            self.write_message(json_encode(message))
            return
        try:
            # Execute any post-authentication hooks that plugins have registered
            if PLUGIN_AUTH_HOOKS:
                for auth_hook in PLUGIN_AUTH_HOOKS:
                    auth_hook(self.get_current_user(), self.settings)
        except Exception as e:
            logging.error(_("Exception in registered Auth hook: %s" % e))
        # Apply the container/prefix settings (if present)
        # NOTE:  Currently these are only used by the logging plugin
        if 'container' in settings:
            self.container = settings['container']
        if 'prefix' in settings:
            self.prefix = settings['prefix']
        # This check is to make sure there's no existing session so we don't
        # accidentally clobber it.
        if self.session not in SESSIONS:
            # Old session is no good, start a new one:
            SESSIONS[self.session] = {}
        terminals = []
        for term in SESSIONS[self.session].keys():
            if isinstance(term, int):  # This skips the TidyThread...
                terminals.append(term) # Only terminals are integers in the dict
        # Check for any dtach'd terminals we might have missed
        if self.settings['dtach']:
            session_dir = self.settings['session_dir']
            session_dir = os.path.join(session_dir, self.session)
            if not os.path.exists(session_dir):
                mkdir_p(session_dir)
                os.chmod(session_dir, 0700)
            for item in os.listdir(session_dir):
                if item.startswith('dtach_'):
                    term = int(item.split('_')[1])
                    if term not in terminals:
                        terminals.append(term)
        terminals.sort() # Put them in order so folks don't get confused
        message = {
            'terminals': terminals,
        # This is just so the client has a human-readable point of reference:
            'set_username': self.get_current_user()['upn']
        }
        # TODO: Add a hook here for plugins to send their own messages when a
        #       given terminal is reconnected.
        self.write_message(json_encode(message))
        # Now we need to tell the client about plugin CSS templates
        plugins = get_plugins(os.path.join(GATEONE_DIR, "plugins"))
        for css_template in plugins['css']:
            self.write_message(json_encode({'load_css': css_template}))

    def new_multiplex(self, cmd, term_id, logging=True):
        """
        Returns a new instance of :py:class:`termio.Multiplex` with the proper global and
        client-specific settings.

            * *cmd* - The command to execute inside of Multiplex.
            * *term_id* - The terminal to associate with this Multiplex or a descriptive identifier (it's only used for logging purposes).
            * *logging* - If False, logging will be disabled for this instance of Multiplex (even if it would otherwise be enabled).
        """
        user_dir = self.settings['user_dir']
        try:
            user = self.get_current_user()['upn']
        except:
            # No auth, use ANONYMOUS (% is there to prevent conflicts)
            user = r'ANONYMOUS' # Don't get on this guy's bad side
        session_dir = self.settings['session_dir']
        session_dir = os.path.join(session_dir, self.session)
        log_path = None
        syslog_logging = False
        if logging:
            syslog_logging = self.settings['syslog_session_logging']
            if self.settings['session_logging']:
                log_dir = os.path.join(user_dir, user)
                log_dir = os.path.join(log_dir, 'logs')
                # Create the log dir if not already present
                if not os.path.exists(log_dir):
                    mkdir_p(log_dir)
                log_name = datetime.now().strftime('%Y%m%d%H%M%S%f.golog')
                log_path = os.path.join(log_dir, log_name)
        facility = string_to_syslog_facility(self.settings['syslog_facility'])
        return termio.Multiplex(
            cmd,
            log_path=log_path,
            user=user,
            term_id=term_id,
            syslog=syslog_logging,
            syslog_facility=facility,
            syslog_host=self.settings['syslog_host']
        )

    @require_auth
    def new_terminal(self, settings):
        """
        Starts up a new terminal associated with the user's session using
        *settings* as the parameters.  If a terminal already exists with the
        same number as *settings[term]*, self.set_terminal() will be called
        instead of starting a new terminal (so clients can resume their session
        without having to worry about figuring out if a new terminal already
        exists or not).
        """
        logging.debug("%s new_terminal(): %s" % (
            self.get_current_user()['upn'], settings))
        if self.session not in SESSIONS:
            # This happens when the TidyThread times out a session
            # Tell the client it timed out:
            message = {'timeout': None}
            self.write_message(json_encode(message))
            return
        self.current_term = term = settings['term']
        self.rows = rows = settings['rows']
        self.cols = cols = settings['cols']
        if 'em_dimensions' in settings:
            self.em_dimensions = {
                'height': settings['em_dimensions']['h'],
                'width': settings['em_dimensions']['w']
            }
        user_dir = self.settings['user_dir']
        needs_full_refresh = False
        if term not in SESSIONS[self.session]:
            # Setup the requisite dict
            SESSIONS[self.session][term] = {}
        if self.client_id not in SESSIONS[self.session][term]:
            SESSIONS[self.session][term][self.client_id] = {
                # Used by refresh_screen()
                'refresh_timeout': None
            }
        if 'multiplex' not in SESSIONS[self.session][term]:
            # Start up a new terminal
            SESSIONS[self.session][term]['created'] = datetime.now()
            # NOTE: Not doing anything with 'created'...  yet!
            now = int(round(time.time() * 1000))
            try:
                user = self.get_current_user()['upn']
            except:
                # No auth, use ANONYMOUS (% is there to prevent conflicts)
                user = r'ANONYMOUS' # Don't get on this guy's bad side
            cmd = cmd_var_swap(CMD,   # Swap out variables like %USER% in CMD
                session=self.session, # with their real-world values.
                session_hash=short_hash(self.session),
                user_dir=user_dir,
                user=user,
                time=now
            )
            resumed_dtach = False
            session_dir = self.settings['session_dir']
            session_dir = os.path.join(session_dir, self.session)
            # Create the session dir if not already present
            if not os.path.exists(session_dir):
                mkdir_p(session_dir)
                os.chmod(session_dir, 0700)
            if self.settings['dtach']: # Wrap in dtach (love this tool!)
                dtach_path = "%s/dtach_%s" % (session_dir, term)
                if os.path.exists(dtach_path):
                    # Using 'none' for the refresh because the EVIL termio
                    # likes to manage things like that on his own...
                    cmd = "dtach -a %s -E -z -r none" % dtach_path
                    resumed_dtach = True
                else: # No existing dtach session...  Make a new one
                    cmd = "dtach -c %s -E -z -r none %s" % (dtach_path, cmd)
            SESSIONS[self.session][term]['multiplex'] = self.new_multiplex(
                cmd, term)
            # Set some environment variables so the programs we execute can use
            # them (very handy).  Allows for "tight integration" and "synergy"!
            env = {
                'GO_USER_DIR': user_dir,
                'GO_USER': user,
                'GO_TERM': str(term),
                'GO_SESSION': self.session,
                'GO_SESSION_DIR': session_dir
            }
            SESSIONS[self.session][term]['multiplex'].spawn(
                rows, cols, env=env, em_dimensions=self.em_dimensions)
        else:
            # Terminal already exists
            if SESSIONS[self.session][term]['multiplex'].isalive():
                # It's ALIVE!!!
                SESSIONS[self.session][term]['multiplex'].resize(
                    rows, cols, ctrl_l=False, em_dimensions=self.em_dimensions)
                message = {'term_exists': term}
                self.write_message(json_encode(message))
                # This resets the screen diff
                SESSIONS[self.session][term]['multiplex'].prev_output[
                    self.client_id] = [None for a in xrange(rows-1)]
                # Remind the client about this terminal's title
                self.set_title(term)
            else:
                # Tell the client this terminal is no more
                message = {'term_ended': term}
                self.write_message(json_encode(message))
                return
        # Setup callbacks so that everything gets called when it should
        self.callback_id = callback_id = "%s;%s;%s" % (
            self.client_id, self.request.host, self.request.remote_ip)
        # NOTE: request.host is the FQDN or IP the user entered to open Gate One
        # so if you want to have multiple browsers open to the same user session
        # from the same IP just use an alternate hostname/IP for the URL.
        # Setup the termio callbacks
        refresh = partial(self.refresh_screen, term)
        multiplex = SESSIONS[self.session][term]['multiplex']
        multiplex.add_callback(multiplex.CALLBACK_UPDATE, refresh, callback_id)
        restart = partial(self.new_terminal, settings)
        multiplex.add_callback(multiplex.CALLBACK_EXIT, restart, callback_id)
        # Setup the terminal emulator callbacks
        term_emulator = multiplex.term
        set_title = partial(self.set_title, term)
        term_emulator.add_callback(
            terminal.CALLBACK_TITLE, set_title, callback_id)
        set_title() # Set initial title
        bell = partial(self.bell, term)
        term_emulator.add_callback(
            terminal.CALLBACK_BELL, bell, callback_id)
        term_emulator.add_callback(
            terminal.CALLBACK_OPT, self.esc_opt_handler, callback_id)
        mode_handler = partial(self.mode_handler, term)
        term_emulator.add_callback(
            terminal.CALLBACK_MODE, mode_handler, callback_id)
        reset_term = partial(self.reset_terminal, term)
        term_emulator.add_callback(
            terminal.CALLBACK_RESET, reset_term, callback_id)
        dsr = partial(self.dsr, term)
        term_emulator.add_callback(
            terminal.CALLBACK_DSR, dsr, callback_id)
        if 'tidy_thread' not in SESSIONS[self.session]:
            # Start the keepalive thread so the session will time out if the
            # user disconnects for like a week (by default anyway =)
            SESSIONS[self.session]['tidy_thread'] = TidyThread(self.session)
            SESSIONS[self.session]['tidy_thread'].start()
        # NOTE: refresh_screen will also take care of cleaning things up if
        #       SESSIONS[self.session][term]['multiplex'].isalive() is False
        self.refresh_screen(term, True) # Send a fresh screen to the client
        # Restore application cursor keys mode if set
        if 'application_mode' in SESSIONS[self.session][term]:
            current_setting = SESSIONS[self.session][term]['application_mode']
            self.mode_handler(term, '1', current_setting)
        if self.settings['logging'] == 'debug':
            message = {
                'notice': _(
                    "WARNING: Logging is set to DEBUG.  All keystrokes will be "
                    "logged!")
            }
            self.write_message(message)

    @require_auth
    def kill_terminal(self, term):
        """
        Kills *term* and any associated processes.
        """
        logging.debug("killing terminal: %s" % term)
        term = int(term)
        multiplex = SESSIONS[self.session][term]['multiplex']
        # Remove the EXIT callback so the terminal doesn't restart itself
        multiplex.remove_callback(multiplex.CALLBACK_EXIT, self.callback_id)
        try:
            if self.settings['dtach']: # dtach needs special love
                kill_dtached_proc(self.session, term)
            if multiplex.isalive():
                multiplex.terminate()
        except KeyError as e:
            pass # The EVIL termio has killed my child!  Wait, that's good...
                 # Because now I don't have to worry about it!
        finally:
            del SESSIONS[self.session][term]

    @require_auth
    def set_terminal(self, term):
        """
        Sets `self.current_term = *term*` so we can determine where to send
        keystrokes.
        """
        self.current_term = term

    @require_auth
    def reset_terminal(self, term):
        """
        Tells the client to reset the terminal (clear the screen and remove
        scrollback).
        """
        message = {'reset_terminal': term}
        self.write_message(json_encode(message))

    @require_auth
    def set_title(self, term):
        """
        Sends a message to the client telling it to set the window title of
        *term* to whatever comes out of::

            SESSIONS[self.session][term]['multiplex'].term.get_title() #(Whew! Say that three times fast!).

        Example message::

            {'set_title': {'term': 1, 'title': "user@host"}}

        .. note:: Why the complexity on something as simple as setting the title?  Many prompts set the title.  This means we'd be sending a 'title' message to the client with nearly every screen update which is a pointless waste of bandwidth if the title hasn't changed.
        """
        logging.debug("set_title(%s)" % term)
        title = SESSIONS[self.session][term]['multiplex'].term.get_title()
        # Only send a title update if it actually changed
        if 'title' not in SESSIONS[self.session][term]:
            # There's a first time for everything
            SESSIONS[self.session][term]['title'] = ''
        if title != SESSIONS[self.session][term]['title']:
            SESSIONS[self.session][term]['title'] = title
            title_message = {'set_title': {'term': term, 'title': title}}
            self.write_message(json_encode(title_message))

    @require_auth
    def bell(self, term):
        """
        Sends a message to the client indicating that a bell was encountered in
        the given terminal (*term*).  Example message::

            {'bell': {'term': 1}}
        """
        bell_message = {'bell': {'term': term}}
        self.write_message(json_encode(bell_message))

    @require_auth
    def mode_handler(self, term, setting, boolean):
        """
        Handles mode settings that require an action on the client by pasing it
        a message like::

            {
                'set_mode': {
                    'mode': setting,
                    'bool': True,
                    'term': term
                }
            }
        """
        logging.debug(
            "mode_handler() term: %s, setting: %s, boolean: %s" %
            (term, setting, boolean))
        if setting in ['1']: # Only support this mode right now
            # So we can restore it:
            SESSIONS[self.session][term]['application_mode'] = boolean
            if boolean:
                # Tell client to enable application cursor mode
                mode_message = {'set_mode': {
                    'mode': setting,
                    'bool': True,
                    'term': term
                }}
                self.write_message(json_encode(mode_message))
            else:
                # Tell client to disable application cursor mode
                mode_message = {'set_mode': {
                    'mode': setting,
                    'bool': False,
                    'term': term
                }}
                self.write_message(json_encode(mode_message))

    def dsr(self, term, response):
        """
        Handles Device Status Report (DSR) calls from the underlying program
        that get caught by the terminal emulator.  *response* is what the
        terminal emulator returns from the CALLBACK_DSR callback.

        .. note:: This also handles the CSI DSR sequence.
        """
        SESSIONS[self.session][term]['multiplex'].write(response)

    def _send_refresh(self, term, full=False):
        """Sends a screen update to the client."""
        try:
            now = datetime.now()
            tidy_thread = SESSIONS[self.session]['tidy_thread']
            tidy_thread.keepalive(now)
            multiplex = SESSIONS[self.session][term]['multiplex']
            scrollback, screen = multiplex.dump_html(
                full=full, client_id=self.client_id)
        except KeyError as e: # Session died (i.e. command ended).
            scrollback, screen = [], []
        if [a for a in screen if a]:
            output_dict = {
                'termupdate': {
                    'term': term,
                    'scrollback': scrollback,
                    'screen' : screen,
                    'ratelimiter': multiplex.ratelimiter_engaged
                }
            }
            try:
                self.write_message(json_encode(output_dict))
            except IOError: # Socket was just closed, no biggie
                logging.info(
                 _("WebSocket closed (%s)") % self.get_current_user()['upn'])
                multiplex = SESSIONS[self.session][term]['multiplex']
                multiplex.remove_callback( # Stop trying to write
                    multiplex.CALLBACK_UPDATE, self.callback_id)

    @require_auth
    def refresh_screen(self, term, full=False):
        """
        Writes the state of the given terminal's screen and scrollback buffer to
        the client using `_send_refresh()`.  Also ensures that screen updates
        don't get sent too fast to the client by instituting a rate limiter that
        also forces a refresh every 150ms.  This keeps things smooth on the
        client side and also reduces the bandwidth used by the application (CPU
        too).

        If *full*, send the whole screen (not just the difference).
        """
        # Commented this out because it was getting annoying.
        # Note to self: add more levels of debugging beyond just "debug".
        #logging.debug(
            #"refresh_screen (full=%s) on %s" % (full, self.callback_id))
        if term:
            term = int(term)
        else:
            return # This just prevents an exception when the cookie is invalid
        try:
            msec = timedelta(milliseconds=50) # Keeps things smooth
            # In testing, 150 milliseconds was about as low as I could go and
            # still remain practical.
            force_refresh_threshold = timedelta(milliseconds=150)
            tidy_thread = SESSIONS[self.session]['tidy_thread']
            last_keepalive = tidy_thread.last_keepalive
            timediff = datetime.now() - last_keepalive
            sess = SESSIONS[self.session][term]
            client_dict = sess[self.client_id]
            multiplex = sess['multiplex']
            refresh = partial(self._send_refresh, term, full)
            # We impose a rate limit of max one screen update every 50ms by
            # wrapping the call to _send_refresh() in an IOLoop timeout that
            # gets cancelled and replaced if screen updates come in faster than
            # once every 50ms.  If screen updates are consistently faster than
            # that (e.g. a key is held down) we also force sending the screen
            # to the client every 150ms.  This ensures that no matter how fast
            # screen updates are happening the user will get at least one
            # update every 150ms.  It works out quite nice, actually.
            if client_dict['refresh_timeout']:
                multiplex.io_loop.remove_timeout(client_dict['refresh_timeout'])
            if timediff > force_refresh_threshold:
                refresh()
            else:
                client_dict['refresh_timeout'] = multiplex.io_loop.add_timeout(
                    msec, refresh)
        except KeyError as e: # Session died (i.e. command ended).
            logging.debug(_("KeyError in refresh_screen: %s" % e))

    @require_auth
    def full_refresh(self, term):
        """Calls `self.refresh_screen(*term*, full=True)`"""
        try:
            term = int(term)
        except ValueError:
            logging.debug(_(
                "Invalid terminal number given to full_refresh(): %s" % term))
        self.refresh_screen(term, full=True)

    @require_auth
    def resize(self, resize_obj):
        """
        Resize the terminal window to the rows/cols specified in *resize_obj*

        Example *resize_obj*::

            {'rows': 24, 'cols': 80}
        """
        logging.debug("resize(%s)" % repr(resize_obj))
        term = None
        if 'term' in resize_obj:
            term = int(resize_obj['term'])
        self.rows = resize_obj['rows']
        self.cols = resize_obj['cols']
        self.em_dimensions = {
            'height': resize_obj['em_dimensions']['h'],
            'width': resize_obj['em_dimensions']['w']
        }
        if self.rows < 2 or self.cols < 2:
            # Fall back to a standard default:
            self.rows = 24
            self.cols = 80
        # If the user already has a running session, set the new terminal size:
        try:
            if term:
                SESSIONS[self.session][term]['multiplex'].resize(
                    self.rows,
                    self.cols,
                    self.em_dimensions
                )
            else: # Resize them all
                for term in SESSIONS[self.session].keys():
                    if isinstance(term, int): # Skip the TidyThread
                        SESSIONS[self.session][term]['multiplex'].resize(
                            self.rows,
                            self.cols,
                            self.em_dimensions
                        )
        except KeyError: # Session doesn't exist yet, no biggie
            pass

    @require_auth
    def char_handler(self, chars):
        """Writes *chars* (string) to the currently-selected terminal"""
        if type(chars) != unicode:
            chars = unicode(chars)
        term = self.current_term
        session = self.session
        if session in SESSIONS and term in SESSIONS[session]:
            if SESSIONS[session][term]['multiplex'].isalive():
                if chars:
                    SESSIONS[ # Force an update
                        session][term]['multiplex'].ratelimit = time.time()
                    SESSIONS[session][term]['multiplex'].write(chars)

    @require_auth
    def esc_opt_handler(self, chars):
        """
        Executes whatever function is registered matching the tuple returned by
        process_opt_esc_sequence().
        """
        logging.debug("esc_opt_handler(%s)" % repr(chars))
        plugin_name, text = process_opt_esc_sequence(chars)
        if plugin_name:
            try:
                PLUGIN_ESC_HANDLERS[plugin_name](text, tws=self)
            except Exception as e:
                logging.error(_(
                    "Got exception trying to execute plugin's optional ESC "
                    "sequence handler..."))
                logging.error(str(e))

    def get_webworker(self):
        """
        Returns the text of our go_process.js to get around the limitations of
        loading remote Web Worker URLs (for embedding Gate One into other apps).
        """
        static_path = os.path.join(GATEONE_DIR, "static")
        webworker_path = os.path.join(static_path, 'go_process.js')
        with open(webworker_path) as f:
            go_process = f.read()
        message = {'load_webworker': go_process}
        self.write_message(json_encode(message))

    @require_auth
    def debug_terminal(self, term):
        """
        Prints the terminal's screen and renditions to stdout so they can be
        examined more closely.

        .. note:: Can only be called from a JavaScript console like so...

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({'debug_terminal': *term*}));
        """
        screen = SESSIONS[self.session][term]['multiplex'].term.screen
        renditions = SESSIONS[self.session][term]['multiplex'].term.renditions
        for i, line in enumerate(screen):
            # This gets rid of images:
            line = [a for a in line if len(a) == 1]
            print("%s:%s" % (i, "".join(line)))
            print(renditions[i])
        # Also check if there's anything that's uncollectable
        import gc
        gc.set_debug(gc.DEBUG_UNCOLLECTABLE|gc.DEBUG_OBJECTS)
        from pprint import pprint
        pprint(gc.garbage)
        print("gc.collect(): %s" % gc.collect())
        pprint(gc.garbage)
        print("SESSIONS...")
        pprint(SESSIONS)

# Thread classes
class TidyThread(threading.Thread):
    """
    Kills a user's termio session if the client hasn't updated the keepalive
    within *TIMEOUT* (global).  Also, tidies up sessions, logs, and whatnot based
    on Gate One's settings (when the time is right).

    NOTE: This is necessary to prevent shells from running eternally in the
    background.

    *session* - 45-character string containing the user's session ID
    """
    # TODO: Get this cleaning up logs according to configured settings
    # TODO: Add the aforementioned log cleanup settings :)
    def __init__(self, session):
        threading.Thread.__init__(
            self,
            name="TidyThread-%s" % session
        )
        self.last_keepalive = datetime.now()
        self.session = session
        self.quitting = False
        self.doublecheck = True
        self.kill_dtach = True

    def keepalive(self, datetime_obj=None):
        """
        Resets the keepalive timer.  Typically called when the user performs a new action.

        *datetime_obj* - A datetime object that will be used to measure *TIMEOUT* against.  Will end up defaulting to datetime.now() (if None) which is what you'd want 99% of the time.
        """
        if datetime_obj:
            self.last_keepalive = datetime_obj
        else:
            self.last_keepalive = datetime.now()

    def quit(self):
        self.quitting = True

    def run(self):
        session = self.session
        while not self.quitting:
            try:
                if datetime.now() > self.last_keepalive + TIMEOUT:
                    logging.info(
                        "{session} timeout.".format(
                            session=session
                        )
                    )
                    self.quitting = True
                    break
        # This loops through all the open terminals checking if each is alive
                all_dead = True
                for term in SESSIONS[session].keys():
                    if isinstance(term, int):
                        if SESSIONS[session][term]['multiplex'].isalive():
                            all_dead = False
                            # Added a doublecheck value here because there's a
                            # gap between when the last terminal is closed and
                            # when a new one starts up.  Occasionally this would
                            # cause the user's connection to be killed (due to
                            # there being no active terminal associated with it)
                            self.doublecheck = True
                if all_dead:
                    if not self.doublecheck:
                        self.quitting = True
                    else:
                        self.doublecheck = False
                # Keep this low or it will take that long for the process to end
                # when we receive a SIGTERM or Ctrl-c
                time.sleep(2)
            except Exception as e:
                logging.info(_(
                    "Exception encountered: {exception}".format(exception=e)
                ))
                import traceback
                traceback.print_exc(file=sys.stdout)
                self.quitting = True
        logging.info(_(
            "TidyThread {session} received quit()...  "
            "Killing termio session.".format(session=self.session)
        ))
        # Clean up:
        for term in SESSIONS[session].keys():
            try:
                if SESSIONS[session][term]['multiplex'].isalive():
                    SESSIONS[session][term]['multiplex'].terminate()
                if self.kill_dtach:
                    kill_dtached_proc(session, term)
                del SESSIONS[session][term]
            except TypeError: # Ignore the TidyThread (i.e. ourselves)
                pass
            except KeyError: # Already killed... Great!
                pass
        del SESSIONS[session]

class ErrorHandler(tornado.web.RequestHandler):
    """
    Generates an error response with status_code for all requests.
    """
    def __init__(self, application, request, status_code):
        tornado.web.RequestHandler.__init__(self, application, request)
        self.set_status(status_code)

    def get_error_html(self, status_code, **kwargs):
        self.require_setting("static_path")
        if status_code in [404, 500, 503, 403]:
            filename = os.path.join(self.settings['static_path'], '%d.html' % status_code)
            if os.path.exists(filename):
                f = open(filename, 'r')
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

class Application(tornado.web.Application):
    def __init__(self, settings):
        """
        Setup our Tornado application...  Everything in *settings* will wind up
        in the Tornado settings dict so as to be accessible under self.settings.
        """
        global PLUGIN_WS_CMDS
        global PLUGIN_HOOKS
        global PLUGIN_ESC_HANDLERS
        global PLUGIN_AUTH_HOOKS
        # Base settings for our Tornado app
        tornado_settings = dict(
            cookie_secret=settings['cookie_secret'],
            static_path=os.path.join(GATEONE_DIR, "static"),
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
                tornado_settings['sso_realm'] = settings["sso_realm"]
                tornado_settings['sso_service'] = settings["sso_service"]
            elif settings['auth'] == 'pam' and PAMAuthHandler:
                AuthHandler = PAMAuthHandler
                tornado_settings['pam_realm'] = settings["pam_realm"]
                tornado_settings['pam_service'] = settings["pam_service"]
            elif settings['auth'] == 'google':
                AuthHandler = GoogleAuthHandler
            logging.info(_("Using %s authentication" % settings['auth']))
        else:
            logging.info(_("No authentication method configured. All users will "
                         "be ANONYMOUS"))
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
            (r"%sws" % url_prefix, TerminalWebSocket),
            (r"%sauth" % url_prefix, AuthHandler),
            (r"%sstyle" % url_prefix, StyleHandler),
            (r"%scssrender" % url_prefix, PluginCSSTemplateHandler),
            (r"%scombined_js" % url_prefix, JSPluginsHandler),
            (r"%sdocs/(.*)" % url_prefix, tornado.web.StaticFileHandler, {
                "path": docs_path,
                "default_filename": "index.html"
            })
        ]
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
                if isinstance(hooks['Auth'], list):
                    PLUGIN_AUTH_HOOKS.extend(hooks['Auth'])
                else:
                    PLUGIN_AUTH_HOOKS.append(hooks['Auth'])
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
        #css_plugins = [a.split('?')[1].split('&')[0].split('=')[1] for a in PLUGINS['css']]
        plugin_list = list(set(PLUGINS['py'] + js_plugins + css_plugins))
        plugin_list.sort() # So there's consistent ordering
        logging.info(_("Loaded plugins: %s" % ", ".join(plugin_list)))
        tornado.web.Application.__init__(self, handlers, **tornado_settings)

def main():
    global _
    global user_locale
    # Default to using the shell's LANG variable as the locale
    try:
        default_locale = os.environ['LANG'].split('.')[0]
    except KeyError: # $LANG isn't set
        default_locale = "en_US"
    user_locale = locale.get(default_locale)
    # NOTE: The locale setting above is only for the --help messages.
    # Simplify the auth option help message
    auths = "none, api, google"
    if KerberosAuthHandler:
        auths += ", kerberos"
    if PAMAuthHandler:
        auths += ", pam"
    # Simplify the syslog_facility option help message
    facilities = FACILITIES.keys()
    facilities.sort()
    config_default = os.path.join(GATEONE_DIR, "server.conf")
    define("config",
        default=config_default,
        help=_(
            "Path to the config file.  Default: %s" % config_default),
        type=str
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
        type=str
    )
    define("command",
        # The default command assumes the SSH plugin is enabled
        default=GATEONE_DIR + "/plugins/ssh/scripts/ssh_connect.py -S "
                r"'/tmp/gateone/%SESSION%/%SHORT_SOCKET%' --sshfp "
                "-a '-oUserKnownHostsFile=%USERDIR%/%USER%/ssh/known_hosts'",
        help=_("Run the given command when a user connects (e.g. '/bin/login')."
               ),
        type=str
    )
    define("address",
        default="",
        help=_("Run on the given address.  Default is all addresses (IPv6 "
               "included).  Multiple address can be specified using a semicolon"
               " as a separator (e.g. '127.0.0.1;::1;10.1.1.100')."),
        type=str)
    define("port", default=443, help=_("Run on the given port."), type=int)
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
        type=str
    )
    define(
        "keyfile",
        default="keyfile.pem",
        help=_("Path to the SSL keyfile.  Will be auto-generated if none is"
               " provided."),
        type=str
    )
    define(
        "user_dir",
        default=os.path.join(GATEONE_DIR, "users"),
        help=_("Path to the location where user files will be stored."),
        type=str
    )
    define(
        "session_dir",
        default="/tmp/gateone",
        help=_("Path to the location where session information will be stored."),
        type=str
    )
    define(
        "session_logging",
        default=True,
        help=_("If enabled, logs of user sessions will be saved in "
               "<user_dir>/<user>/logs.  Default: Enabled")
    )
    define( # This is an easy way to support cetralized logging
        "syslog_session_logging",
        default=False,
        help=_("If enabled, logs of user sessions will be written to syslog.")
    )
    define(
        "syslog_facility",
        default="daemon",
        help=_("Syslog facility to use when logging to syslog (if "
               "syslog_session_logging is enabled).  Must be one of: %s."
               "  Default: daemon" % ", ".join(facilities)),
        type=str
    )
    define(
        "syslog_host",
        default=None,
        help=_("Remote host to send syslog messages to if syslog_logging is "
               "enabled.  Default: None (log to the local syslog daemon "
               "directly).  NOTE:  This setting is required on platforms that "
               "don't include Python's syslog module."),
        type=str
    )
    define(
        "session_timeout",
        default="5d",
        help=_("Amount of time that a session is allowed to idle before it is "
        "killed.  Accepts <num>X where X could be one of s, m, h, or d for "
        "seconds, minutes, hours, and days.  Default is '5d' (5 days)."),
        type=str
    )
    define(
        "new_api_key",
        default=False,
        help=_("Generate a new API key that an external application can use to"
               "embed Gate One."),
    )
    define(
        "auth",
        default=None,
        help=_("Authentication method to use.  Valid options are: %s" % auths),
        type=str
    )
    define(
        "sso_realm",
        default=None,
        help=_("Kerberos REALM (aka DOMAIN) to use when authenticating clients."
               " Only relevant if Kerberos authentication is enabled."),
        type=str
    )
    define(
        "sso_service",
        default='HTTP',
        help=_("Kerberos service (aka application) to use. Defaults to HTTP. "
               "Only relevant if Kerberos authentication is enabled."),
        type=str
    )
    define(
        "pam_realm",
        default=os.uname()[1],
        help=_("Basic auth REALM to display when authenticating clients.  "
        "Default: hostname.  "
        "Only relevant if PAM authentication is enabled."),
        # NOTE: This is only used to show the user a REALM at the basic auth
        #       prompt and as the name in the GATEONE_DIR+'/users' directory
        type=str
    )
    define(
        "pam_service",
        default='login',
        help=_("PAM service to use.  Defaults to 'login'. "
               "Only relevant if PAM authentication is enabled."),
        type=str
    )
    define(
        "embedded",
        default=False,
        help=_("Run Gate One in Embedded Mode (no toolbar, only one terminal "
               "allowed, etc.  See docs).")
    )
    define(
        "dtach",
        default=True,
        help=_("Wrap terminals with dtach. Allows sessions to be resumed even "
               "if Gate One is stopped and started (which is a sweet feature).")
    )
    define(
        "kill",
        default=False,
        help=_("Kill any running Gate One terminal processes including dtach'd "
               "processes.")
    )
    define(
        "locale",
        default=default_locale,
        help=_("The locale (e.g. pt_PT) Gate One should use for translations."
             "  If not provided, will default to $LANG (which is '%s' in your "
             "current shell), or en_US if not set.") % os.environ.get('LANG', 'not set').split('.')[0],
        type=str
    )
    define("js_init",
        default="",
        help=_("A JavaScript object (string) that will be used when running "
               "GateOne.init() inside index.html.  "
               "Example: --js_init=\"{scheme: 'white'}\" would result in "
               "GateOne.init({scheme: 'white'})"),
        type=str
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
        type=str
    )
    # Before we do anythong else, load plugins and assign their hooks.  This
    # allows plugins to add their own define() statements/options.
    imported = load_plugins(PLUGINS['py'])
    new_conf = False # Used below to tell the user that a server.conf was
                     # generated in their chosen language.
    for plugin in imported:
        try:
            PLUGIN_HOOKS.update({plugin.__name__: plugin.hooks})
        except AttributeError:
            pass # No hooks--probably just a supporting .py file.
    # We have to parse the command line options so we can check for a config to
    # load.  The config will then be loaded--overriding command line options but
    # this won't be a problem since we'll re-parse the command line options
    # further down which will subsequently override the config.
    tornado.options.parse_command_line()
    if os.path.exists(options.config):
        tornado.options.parse_config_file(options.config)
    else: # Generate a default server.conf with a random cookie secret
        logging.info(_(
           "%s not found.  A new one will be generated with defaults." %
           options.config))
        config_defaults = {}
        for key, value in options.items():
            config_defaults.update({key: value.default})
        # A few config defaults need special handling
        del config_defaults['kill'] # This shouldn't be in server.conf
        del config_defaults['help'] # Neither should this
        del config_defaults['new_api_key'] # Ditto
        del config_defaults['config'] # Re-ditto
        config_defaults.update({'cookie_secret': generate_session_id()})
        # NOTE: The next four options are specific to the Tornado framework
        config_defaults.update({'log_file_max_size': 100 * 1024 * 1024}) # 100MB
        config_defaults.update({'log_file_num_backups': 10})
        config_defaults.update({'log_to_stderr': False})
        web_log_path = os.path.join(GATEONE_DIR, 'logs')
        if not os.path.exists(web_log_path):
            mkdir_p(web_log_path)
        config_defaults.update(
            {'log_file_prefix': os.path.join(web_log_path, 'webserver.log')})
        config = open(options.config, "w")
        for key, value in config_defaults.items():
            if isinstance(value, basestring):
                config.write('%s = "%s"\n' % (key, value))
            else:
                config.write('%s = %s\n' % (key, value))
        config.close()
        tornado.options.parse_config_file(options.config)
    tornado.options.parse_command_line()
    if not os.path.exists(options.user_dir): # Make our user_dir
        try:
            mkdir_p(options.user_dir)
        except OSError:
            logging.error(_(
                "Error: Gate One could not create %s.  Please ensure that user,"
                " %s has permission to create this directory or create it "
                "yourself and make user, %s its owner." % (options.user_dir,
                repr(os.getlogin()), repr(os.getlogin()))))
            sys.exit(1)
        # If we could create it we should be able to adjust its permissions:
        os.chmod(options.user_dir, 0700)
    if not os.access(options.user_dir, os.W_OK):
        logging.error(_(
            "Error: Gate One does not have permission to write to %s.  Please"
            " ensure that user, %s has write permission to the directory." % (
            options.user_dir, repr(os.getlogin()))))
        sys.exit(1)
    if not os.path.exists(options.session_dir): # Make our session_dir
        try:
            mkdir_p(options.session_dir)
        except OSError:
            logging.error(_(
                "Error: Gate One could not create %s.  Please ensure that user,"
                " %s has permission to create this directory or create it "
                "yourself and make user, %s its owner." % (options.session_dir,
                repr(os.getlogin()), repr(os.getlogin()))))
            sys.exit(1)
        os.chmod(options.session_dir, 0700)
    if not os.access(options.session_dir, os.W_OK):
        logging.error(_(
            "Error: Gate One does not have permission to write to %s.  Please"
            " ensure that user, %s has write permission to the directory." % (
            options.session_dir, os.getlogin())))
        sys.exit(1)
    # Re-do the locale in case the user supplied something as --locale
    user_locale = locale.get(options.locale)
    _ = user_locale.translate # Also replaces our wrapper so no more .encode()
    # Create the log dir if not already present (NOTE: Assumes we're root)
    log_dir = os.path.split(options.log_file_prefix)[0]
    if not os.path.exists(log_dir):
        try:
            mkdir_p(log_dir)
        except OSError:
            logging.error(_("\x1b[1;31mERROR:\x1b[0m Could not create %s for "
                  "log_file_prefix: %s" % (log_dir, options.log_file_prefix)))
            logging.error(_("You probably want to change this option, run Gate "
                  "One as root, or create that directory and give the proper "
                  "user ownership of it."))
            sys.exit(1)
    if not os.access(log_dir, os.W_OK):
        logging.error(_(
            "Error: Gate One does not have permission to write to %s.  Please"
            " ensure that user, %s has write permission to the directory." % (
            log_dir, repr(os.getlogin()))))
        sys.exit(1)
    if options.kill:
        # Kill all running dtach sessions (associated with Gate One anyway)
        killall(options.session_dir)
        sys.exit(0)
    if options.new_api_key:
        # Generate a new API key for an application to use
        api_key = generate_session_id()
        # Generate a new secret
        secret = generate_session_id()
        # Save it
        server_conf = ""
        with open(options.config) as f:
            existing = ""
            for line in f.readlines():
                if line.startswith("api_keys"):
                    existing = line.split('=')[1].strip().strip('"').strip("'")
                    existing += ",%s:%s" % (api_key, secret)
                    line = 'api_keys = "%s"\n' % existing
                server_conf += line
            if not existing:
                server_conf += 'api_keys = "%s:%s"\n' % (api_key, secret)
        open(os.path.join(options.config), 'w').write(server_conf)
        logging.info(_("A new API key has been generated: %s" % api_key))
        logging.info(_("This key can now be used to embed Gate One into other "
                "applications."))
        sys.exit(0)
    # Set our CMD variable to tell the multiplexer which command to execute
    global CMD
    CMD = options.command
    # Set our global session timeout
    global TIMEOUT
    TIMEOUT = convert_to_timedelta(options.session_timeout)
    # Make sure dtach is available and if not, set dtach=False
    if not which('dtach'):
        logging.warning(
            _("dtach command not found.  dtach support has been disabled."))
        options.dtach = False
    # Turn our API keys into a dict
    api_keys = {}
    with open(options.config) as f:
        for line in f.readlines():
            if line.startswith("api_keys"):
                values = line.split('=')[1].strip().strip('"').strip("'")
                pairs = values.split(',')
                for pair in pairs:
                    api_key, secret = pair.split(':')
                    api_keys.update({api_key: secret})
    # Fix the url_prefix if the user forgot the trailing slash
    if not options.url_prefix.endswith('/'):
        options.url_prefix += '/'
    # Define our Application settings
    app_settings = {
        'gateone_dir': GATEONE_DIR, # Only here so plugins can reference it
        'debug': options.debug,
        'cookie_secret': options.cookie_secret,
        'auth': none_fix(options.auth),
        'embedded': str2bool(options.embedded),
        'js_init': options.js_init,
        'user_dir': options.user_dir,
        'logging': options.logging, # For reference, really
        'session_dir': options.session_dir,
        'session_logging': options.session_logging,
        'syslog_session_logging': options.syslog_session_logging,
        'syslog_facility': options.syslog_facility,
        'syslog_host': options.syslog_host,
        'dtach': options.dtach,
        'sso_realm': options.sso_realm,
        'sso_service': options.sso_service,
        'pam_realm': options.pam_realm,
        'pam_service': options.pam_service,
        'locale': options.locale,
        'api_keys': api_keys,
        'url_prefix': options.url_prefix
    }
    # Check to make sure we have a certificate and keyfile and generate fresh
    # ones if not.
    if not os.path.exists(options.keyfile):
        logging.info(_("No SSL private key found.  One will be generated."))
        gen_self_signed_ssl()
    if not os.path.exists(options.certificate):
        logging.info(_("No SSL certificate found.  One will be generated."))
        gen_self_signed_ssl()
    # Setup static file links for plugins (if any)
    static_dir = os.path.join(GATEONE_DIR, "static")
    plugin_dir = os.path.join(GATEONE_DIR, "plugins")
    templates_dir = os.path.join(GATEONE_DIR, "templates")
    combined_plugins = os.path.join(static_dir, "combined_plugins.js")
    # Remove the combined_plugins.js (it will get auto-recreated)
    if os.path.exists(combined_plugins):
        os.remove(combined_plugins)
    create_plugin_links(static_dir, templates_dir, plugin_dir)
    # When options.logging=="debug" it will display all user's keystrokes so
    # make sure we warn about this.
    if options.logging == "debug":
        logging.warning(_(
            "Logging is set to DEBUG.  Be aware that this will record the "
            "keystrokes of all users.  Don't be evil!"))
    # Instantiate our Tornado web server
    ssl_options = {
        "certfile": options.certificate,
        "keyfile": options.keyfile
    }
    if options.disable_ssl:
        ssl_options = None
    https_server = tornado.httpserver.HTTPServer(
        Application(settings=app_settings), ssl_options=ssl_options)
    https_redirect = tornado.web.Application(
        [(r".*", HTTPSRedirectHandler),],
        port=options.port,
        url_prefix=options.url_prefix
    )
    tornado.web.ErrorHandler = ErrorHandler
    try: # Start your engines!
        if options.address:
            for addr in options.address.split(';'):
                if addr: # Listen on all given addresses
                    if options.https_redirect:
                        logging.info(_(
                         "http://{address}:80/ will be redirected to...".format(
                                address=addr)
                        ))
                        https_redirect.listen(port=80, address=addr)
                    logging.info(_(
                        "Listening on https://{address}:{port}/".format(
                            address=addr, port=options.port)
                    ))
                    https_server.listen(port=options.port, address=addr)
        else: # Listen on all addresses (including IPv6)
            if options.https_redirect:
                logging.info(_("http://*:80/ will be redirected to..."))
                https_redirect.listen(port=80, address="")
            logging.info(_(
                "Listening on https://*:{port}/".format(port=options.port)))
            https_server.listen(port=options.port, address="")
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt: # ctrl-c
        logging.info(_("Caught KeyboardInterrupt.  Killing sessions..."))
        tornado.ioloop.IOLoop.instance().stop()
        for t in threading.enumerate():
            if t.getName().startswith('TidyThread'):
                t.kill_dtach = False
                t.quit()

if __name__ == "__main__":
    main()
