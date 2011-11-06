#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

# 1.0 TODO:
# * DOCUMENTATION!
# * Write a setup.py' with init scripts to stop/start/restart Gate One safely.  Also make sure that .deb and .rpm packages safely restart Gate One without impacting running sessions.  The setup.py should also attempt to minify the .css and .js files.

# Meta
__version__ = '0.9'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
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

 * `Tornado <http://www.tornadoweb.org/>`_ 2.1+ - Non-blocking web server framework that powers FriendFeed.

The following modules are optional and can provide Gate One with additional
functionality:

 * `pyOpenSSL <https://launchpad.net/pyopenssl>`_ 0.10+ - OpenSSL wrapper for Python.  Only used to generate self-signed SSL keys and certificates.
 * `kerberos <http://pypi.python.org/pypi/kerberos>`_ 1.0+ - A high-level Kerberos interface for Python.  Only necessary if you plan to use the Kerberos authentication module.

On most platforms both the required and optional modules can be installed via one of these commands:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m sudo pip install tornado pyopenssl kerberos

...or:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@legacy-host\x1b[1;34m:~ $\x1b[0m sudo easy_install tornado pyopenssl kerberos

.. note:: The use of pip is recommended.  See http://www.pip-installer.org/en/latest/installing.html if you don't have it.

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

.. note:: server.conf is case sensitive for "True", "False" and "None".

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
      --logging=info|warning|error|none Set the Python log level. If 'none', tornado won't touch the logging configuration.
      --address                        Run on the given address.  Default is all addresses (IPv6 included).  Multiple address can be specified using a semicolon as the separator (e.g. --address='127.0.0.1;::1;10.1.1.2;fe70::222:fcff:fc2a:3c2a')
      --auth                           Authentication method to use.  Valid options are: none, kerberos, google
      --certificate                    Path to the SSL certificate.  Will be auto-generated if none is provided.
      --command                        Run the given command when a user connects (e.g. 'nethack').
      --cookie_secret                  Use the given 45-character string for cookie encryption.
      --debug                          Enable debugging features such as auto-restarting when files are modified.
      --disable_ssl                    If enabled, Gate One will run without SSL (generally not a good idea).
      --dtach                          Wrap terminals with dtach.  Allows sessions to be resumed even if Gate One is stopped and started (which is a sweet feature =).
      --embedded                       Run Gate One in Embedded Mode (no toolbar, only one terminal allowed, etc.  See docs).
      --keyfile                        Path to the SSL keyfile.  Will be auto-generated if none is provided.
      --kill                           Kill any running Gate One terminal processes including dtach'd processes.
      --pam_realm                      Basic auth REALM to display when authenticating clients.  Default to hostname.  Only relevant if PAM authentication is enabled.
      --pam_service                    PAM service to use.  Defaults to 'login'. Only relevant if PAM authentication is enabled.
      --port                           Run on the given port.
      --session_dir                    Path to the location where session information will be stored.
      --session_logging                If enabled, logs of user sessions will be saved in <user_dir>/logs.  Default: Enabled
      --session_timeout                Amount of time that a session should be kept alive after the client has logged out.  Accepts <num>X where X could be one of s, m, h, or d for seconds, minutes, hours, and days.  Default is '5d' (5 days).
      --sso_realm                      Kerberos REALM (aka DOMAIN) to use when authenticating clients. Only relevant if Kerberos authentication is enabled.
      --sso_service                    Kerberos service (aka application) to use. Defaults to HTTP. Only relevant if Kerberos authentication is enabled.
      --syslog_facility                Syslog facility to use when logging to syslog (if syslog_session_logging is enabled).  Must be one of: auth, cron, daemon, kern, local0, local1, local2, local3, local4, local5, local6, local7, lpr, mail, news, syslog, user, uucp.  Default: daemon
      --syslog_session_logging         If enabled, logs of user sessions will be written to syslog.
      --user_dir                       Path to the location where user files will be stored.

.. note:: Some of these options (e.g. log_file_prefix) are inherent to the Tornado framework.  You won't find them anywhere in gateone.py.

File Paths
----------
Gate One stores its files, temporary session information, and persistent user
data in the following locations (Note: Many of these are configurable):

================= ==================================================================================
File/Directory      Description
================= ==================================================================================
gateone.py        Gate One's primary executable/script. Also, the file containing this documentation
auth.py           Authentication classes
logviewer.py      A utility to view Gate One session logs
server.conf       Gate One's configuration file
sso.py            A Kerberos Single Sign-on module for Tornado (used by auth.py)
terminal.py       A Pure Python terminal emulator module
termio.py         Terminal input/output control module
utils.py          Various supporting functions
docs/             Gate One documentation
static/           Non-dynamic files that get served to clients (e.g. gateone.js, gateone.css, etc)
templates/        Tornado template files such as index.html
tests/            Gate One-specific automated unit/acceptance tests
plugins/          Plugins go here in the form of ./plugins/<plugin name>/<plugin files|directories>
users/            Persistent user data in the form of ./users/<username>/<user-specific files>
users/<user>/logs This is where session logs get stored if session_logging is set.
/tmp/gateone      Temporary session data in the form of /tmp/gateone/<session ID>/<files>
================= ==================================================================================

Running
-------
Executing Gate One is as simple as:

.. ansi-block::

    \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m ./gateone.py

NOTE: By default Gate One will run on port 443 which requires root on most
systems.  Use --port=<something greater than 1024> for non-root users.

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
template like so:

.. code-block:: html

    <!-- Begin JS files from plugins -->
    {% for jsplugin in jsplugins %}
    <script type="text/javascript" src="{{jsplugin}}"></script>
    {% end %}
    <!-- End JS files from plugins -->

CSS plugins are similar to JavaScript but instead of being appended to the
<body> they are added to the <head>:

.. code-block:: html

    <!-- Begin CSS files from plugins -->
    {% for cssplugin in cssplugins %}
    <link rel="stylesheet" href="{{cssplugin}}" type="text/css" media="screen" />
    {% end %}
    <!-- End CSS files from plugins -->

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
from functools import partial
from datetime import datetime, timedelta
from platform import uname
from commands import getoutput
from multiprocessing import Queue, Process

# Our own modules
import termio, terminal
from auth import NullAuthHandler, KerberosAuthHandler, GoogleAuthHandler, PAMAuthHandler
from utils import noop, str2bool, generate_session_id, cmd_var_swap, mkdir_p
from utils import gen_self_signed_ssl, killall, get_plugins, load_plugins
from utils import create_plugin_static_links, merge_handlers, none_fix
from utils import convert_to_timedelta, kill_dtached_proc, short_hash
from utils import process_opt_esc_sequence, create_data_uri
from utils import FACILITIES, string_to_syslog_facility

# Tornado modules (yeah, we use all this stuff)
import tornado.httpserver
import tornado.ioloop
import tornado.options
import tornado.web
import tornado.auth
import tornado.template
from tornado.websocket import WebSocketHandler
from tornado.escape import json_encode, json_decode
from tornado.options import define, options
from tornado import locale

tornado.options.enable_pretty_logging()

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

def call_callback(queue, identifier, *args):
    """
    Given an *identifier* (string), pushes that string to *queue* as:
        obj = (identifier, args)

    This should result in the associated callback being called by the
    CallbackThread.
    """
    obj = (identifier, args)
    queue.put(obj)

# Globals
SESSIONS = {} # We store the crux of most session info here
CMD = None # Will be overwritten by options.command
TIMEOUT = timedelta(days=5) # Gets overridden by options.session_timeout
GATEONE_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGINS = get_plugins(GATEONE_DIR + '/plugins')
PLUGIN_WS_CMDS = {} # Gives plugins the ability to extend/enhance TerminalWebSocket
PLUGIN_HOOKS = {} # Gives plugins the ability to hook into various things.
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

# Classes
class BaseHandler(tornado.web.RequestHandler):
    """
    A base handler that all Gate One RequestHandlers will inherit methods from.
    """
    # Right now it's just the one...
    def get_current_user(self):
        """Tornado standard method--implemented our way."""
        user_json = self.get_secure_cookie("user")
        if not user_json: return None
        return tornado.escape.json_decode(user_json)

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
    def get(self):
        hostname = uname()[1]
        gateone_js = "/static/gateone.js"
        minified_js_abspath = "%s/static/gateone.min.js" % GATEONE_DIR
        bell = "%s/static/bell.ogg" % GATEONE_DIR
        bell_data_uri = create_data_uri(bell)
        js_init = self.settings['js_init']
        # Use the minified version if it exists
        if os.path.exists(minified_js_abspath):
            gateone_js = "/static/gateone.min.js"
        self.render(
            "templates/index.html",
            hostname=hostname,
            gateone_js=gateone_js,
            jsplugins=PLUGINS['js'],
            cssplugins=PLUGINS['css'],
            js_init=js_init,
            bell_data_uri=bell_data_uri
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
    # Hey, if unauthenticated clients want this they can have it!
    #@tornado.web.authenticated
    def get(self):
        enum = self.get_argument("enumerate", None)
        if enum:
            themes = os.listdir(os.path.join(GATEONE_DIR, 'templates/themes'))
            themes = [a.replace('.css', '') for a in themes]
            colors = os.listdir(
                os.path.join(GATEONE_DIR, 'templates/term_colors'))
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
                colors_256 += "%s %s" % (fg, bg)
            colors_256 += "\n"
            self.set_header ('Content-Type', 'text/css')
            if theme:
                try:
                    self.render(
                        "templates/themes/%s.css" % theme,
                        container=container,
                        prefix=prefix,
                        colors_256=colors_256
                    )
                except IOError:
                    # Given theme was not found
                    logging.error(
                        _("templates/themes/%s.css was not found" % theme))
            elif colors:
                try:
                    self.render(
                        "templates/term_colors/%s.css" % colors,
                        container=container,
                        prefix=prefix
                    )
                except IOError:
                    # Given theme was not found
                    logging.error(_(
                        "templates/term_colors/%s.css was not found" % colors))

class TerminalWebSocket(WebSocketHandler):
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
            #'refresh_test': self.refresh_screen_testing,
            'resize': self.resize,
            'debug_terminal': self.debug_terminal
        }
        self.terms = {}
        # So we can keep track and avoid sending unnecessary messages:
        self.titles = {}

    def get_current_user(self):
        """Identical to the function of the same name in MainHandler."""
        user_json = self.get_secure_cookie("user")
        if not user_json: return None
        return tornado.escape.json_decode(user_json)

    def open(self):
        """Called when a new WebSocket is opened."""
        go_upn = self.get_current_user()
        if go_upn:
            logging.info(
                _("WebSocket opened (%s).") % self.get_current_user()['go_upn'])
        else:
            logging.info(_("WebSocket opened (unknown user)."))

    def on_message(self, message):
        """Called when we receive a message from the client."""
        # This is super useful when debugging:
        logging.debug("message: %s" % repr(message))
        message_obj = None
        try:
            message_obj = json_decode(message) # JSON FTW!
            if not isinstance(message_obj, dict):
                self.write_message(_("'Error: Message bust be a JSON dict.'"))
        except ValueError: # We didn't get JSON
            self.write_message(_("'Error: We only accept JSON here.'"))
        if message_obj:
            for key, value in message_obj.items():
                try: # Plugins first so they can override behavior if they wish
                    PLUGIN_WS_CMDS[key](value, tws=self) # tws==TerminalWebSocket
                except KeyError:
                    try:
                        self.commands[key](value)
                    except KeyError:
                        pass # Ignore commands we don't understand

    def on_close(self):
        """
        Called when the client terminates the connection.

        NOTE: Normally self.refresh_screen() catches the disconnect first and
        this won't be called.
        """
        # Shut down the callbacks associated with this user
        name = "CallbackThread.%s" % self.session
        for t in threading.enumerate():
            if t.getName().startswith(name):
                t.quit()
        go_upn = self.get_current_user()
        if go_upn:
            logging.info(
                _("WebSocket closed (%s).") % self.get_current_user()['go_upn'])
        else:
            logging.info(_("WebSocket closed (unknown user)."))

    def pong(self, timestamp):
        """
        Responds to a client 'ping' request...  Just returns the given
        timestamp back to the client so it can measure round-trip time.
        """
        message = {'pong': timestamp}
        self.write_message(json_encode(message))

# TODO: Change this to encrypt the session ID so that it is stored in encrypted form on the client end.  Just like we do with cookies but for use with localStorage.  The encrypted value should actually be a JSON dict with a uniqe, random ID included to ensure that the encrypted data changes every time it is created (even though the session ID might not).
    def authenticate(self, settings):
        """
        Authenticates the client using the given session (which should be
        settings['session']) and returns a list of all running terminals (if
        any).  If no session is given (null) a new one will be created.
        """
        logging.debug("authenticate(): %s" % settings)
        # Make sure the client is authenticated if authentication is enabled
        if self.settings['auth']:
            try:
                user = self.get_current_user()['go_upn']
                if user == '%anonymous':
                    logging.error(_("Unauthenticated WebSocket attempt."))
                    # In case this is a legitimate client that simply lost its
                    # cookie, tell it to re-auth by calling the appropriate
                    # action on the other side.
                    message = {'reauthenticate': True}
                    self.write_message(json_encode(message))
                    self.close() # Close the WebSocket
            except KeyError:
                # Force them to authenticate
                message = {'reauthenticate': True}
                self.write_message(json_encode(message))
                self.close() # Close the WebSocket
        else:
            # Double-check there isn't a user set in the cookie (i.e. we have
            # recently changed Gate One's settings).  If there is, force it
            # back to %anonymous.
            user = self.get_current_user()
            if user:
                user = user['go_upn']
            if user != '%anonymous':
                message = {'reauthenticate': True}
                self.write_message(json_encode(message))
                self.close() # Close the WebSocket
        if 'session' in settings.keys():
            # Try to use the cookie session first
            try:
                self.session = self.get_current_user()['go_session']
            except:
                # This generates a random 45-character string:
                self.session = generate_session_id()
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
            session_dir = session_dir + "/" + self.session
            if not os.path.exists(session_dir):
                mkdir_p(session_dir)
                os.chmod(session_dir, 0700)
            for item in os.listdir(session_dir):
                if item.startswith('dtach:'):
                    term = int(item.split(':')[1])
                    if term not in terminals:
                        terminals.append(term)
        terminals.sort() # Put them in order so folks don't get confused
        message = {'terminals': terminals}
        # TODO: Add a hook here for plugins to send their own messages when a
        #       given terminal is reconnected.
        self.write_message(json_encode(message))

    def new_terminal(self, settings):
        """
        Starts up a new terminal associated with the user's session using
        *settings* as the parameters.  If a terminal already exists with the
        same number as *settings[term]* self.set_terminal() will be called
        instead of starting a new terminal (so clients can resume their session
        without having to worry about figuring out if a new terminal already
        exists or not).
        """
        logging.debug("%s new_terminal(): %s" % (
            self.get_current_user()['go_upn'], settings))
        self.current_term = term = settings['term']
        self.rows = rows = settings['rows']
        self.cols = cols = settings['cols']
        user_dir = self.settings['user_dir']
        needs_full_refresh = False # Used to track if we need a full screen dump to the client (since TidyThread needs to be running before that)
        if term not in SESSIONS[self.session]:
            # Setup the requisite dict
            SESSIONS[self.session][term] = {}
        if 'multiplex' not in SESSIONS[self.session][term]:
            # Start up a new terminal
            SESSIONS[self.session][term]['created'] = datetime.now()
            # NOTE: Not doing anything with 'created'...  yet!
            now = int(round(time.time() * 1000))
            try:
                user = self.get_current_user()['go_upn']
            except:
                # No auth, use %anonymous (% is there to prevent conflicts)
                user = r'%anonymous' # Don't get on this guy's bad side
            cmd = cmd_var_swap(CMD,   # Swap out variables like %USER% in CMD
                session=self.session, # with their real-world values.
                session_hash=short_hash(self.session),
                user_dir=user_dir,
                user=user,
                time=now
            )
            resumed_dtach = False
            session_dir = self.settings['session_dir']
            session_dir = session_dir + "/" + self.session
            # Create the session dir if not already present
            if not os.path.exists(session_dir):
                mkdir_p(session_dir)
                os.chmod(session_dir, 0700)
            if self.settings['dtach']: # Wrap in dtach (love this tool!)
                dtach_path = "%s/dtach:%s" % (session_dir, term)
                if os.path.exists(dtach_path):
                    # Using 'none' for the refresh because the EVIL termio
                    # likes to manage things like that on his own...
                    cmd = "dtach -a %s -E -z -r none" % dtach_path
                    resumed_dtach = True
                else: # No existing dtach session...  Make a new one
                    cmd = "dtach -c %s -E -z -r none %s" % (dtach_path, cmd)
            log_path = None
            if self.settings['session_logging']:
                log_dir = "%s/%s/logs" % (user_dir, user)
                # Create the log dir if not already present
                if not os.path.exists(log_dir):
                    mkdir_p(log_dir)
                log_path = "%s/%s" % (
                    log_dir, datetime.now().strftime('%Y%m%d%H%M%S%f.golog'))
            facility = string_to_syslog_facility(
                self.settings['syslog_facility'])
            SESSIONS[self.session][term]['multiplex'] = termio.Multiplex(
                cmd,
                tmpdir=session_dir,
                log_path=log_path,
                user=user,
                term_num=term,
                syslog=self.settings['syslog_session_logging'],
                syslog_facility=facility
            )
            # Set some environment variables so the programs we execute can use
            # them (very handy).  Allows for "tight integration" and "synergy"!
            env = {
                'GO_TERM': str(term),
                'GO_SESSION': self.session,
                'GO_SESSION_DIR': session_dir
            }
            SESSIONS[self.session][term]['multiplex'].create(
                rows, cols, env=env)
            if resumed_dtach: # dtach sessions need a little extra love
                SESSIONS[self.session][term]['multiplex'].redraw()
        else:
            # Terminal already exists
            if SESSIONS[self.session][term]['multiplex'].alive: # It's ALIVE!
                SESSIONS[self.session][term]['multiplex'].resize(rows, cols)
                message = {'term_exists': term}
                self.write_message(json_encode(message))
                # This resets the screen diff
                SESSIONS[self.session][term]['multiplex'].prev_output = [
                    None for a in xrange(rows-1)]
            else:
                # Tell the client this terminal is no more
                message = {'term_ended': term}
                self.write_message(json_encode(message))
                return
        # Setup callbacks so that everything gets called when it should
        self.callback_id = callback_id = "%s;%s;%s" % (
            self.session, self.request.host, self.request.remote_ip)
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
        thread_id = 'CallbackThread.%s.%s' % (self.session, term)
        if thread_id not in SESSIONS[self.session]:
            # NOTE: We need this funky thread/queue setup because the
            # multiprocessing module doesn't like to pickle instance methods.
            queue = multiplex.term_manager.Queue()

            SESSIONS[self.session][thread_id] = CallbackThread(
                thread_id, queue)
            SESSIONS[self.session][thread_id].start()
        queue = SESSIONS[self.session][thread_id].queue
        set_title = partial(self.set_title, term)
        callback_name = "set_title.%s" % callback_id
        SESSIONS[self.session][thread_id].register_callback(
            callback_name, set_title)
        safe_callback = partial(call_callback, queue, callback_name)
        term_emulator.add_callback(
            terminal.CALLBACK_TITLE, safe_callback, callback_id)
        set_title() # Set initial title
        bell = partial(self.bell, term)
        callback_name = "bell.%s" % callback_id
        SESSIONS[self.session][thread_id].register_callback(
            callback_name, bell)
        safe_callback = partial(call_callback, queue, callback_name)
        term_emulator.add_callback(
            terminal.CALLBACK_BELL, safe_callback, callback_id)
        callback_name = "esc_opt_handler.%s" % callback_id
        SESSIONS[self.session][thread_id].register_callback(
            callback_name, self.esc_opt_handler)
        safe_callback = partial(call_callback, queue, callback_name)
        term_emulator.add_callback(
            terminal.CALLBACK_OPT, safe_callback, callback_id)
        mode_handler = partial(self.mode_handler, term)
        callback_name = "mode_handler.%s" % callback_id
        SESSIONS[self.session][thread_id].register_callback(
            callback_name, mode_handler)
        safe_callback = partial(call_callback, queue, callback_name)
        term_emulator.add_callback(
            terminal.CALLBACK_MODE, safe_callback, callback_id)
        reset_term = partial(self.reset_terminal, term)
        callback_name = "reset_term.%s" % callback_id
        SESSIONS[self.session][thread_id].register_callback(
            callback_name, reset_term)
        safe_callback = partial(call_callback, queue, callback_name)
        term_emulator.add_callback(
            terminal.CALLBACK_RESET, safe_callback, callback_id)
        if 'tidy_thread' not in SESSIONS[self.session]:
            # Start the keepalive thread so the session will time out if the
            # user disconnects for like a week (by default anyway =)
            SESSIONS[self.session]['tidy_thread'] = TidyThread(self.session)
            SESSIONS[self.session]['tidy_thread'].start()
        if self.settings['debug']:
            tornado.autoreload.add_reload_hook(multiplex.proc_kill)
        # NOTE: refresh_screen will also take care of cleaning things up if
        #       SESSIONS[self.session][term]['multiplex'].alive is False
        self.refresh_screen(term, True) # Send a fresh screen to the client

    def kill_terminal(self, term):
        """Kills *term* and any associated processes"""
        #print("killing terminal: %s" % term)
        term = int(term)
        try:
            SESSIONS[self.session][term]['multiplex'].die()
            SESSIONS[self.session][term]['multiplex'].proc_kill()
            if self.settings['dtach']:
                kill_dtached_proc(self.session, term)
            thread_id = 'CallbackThread.%s.%s' % (self.session, term)
            SESSIONS[self.session][thread_id].quit()
            #name = "CallbackThread-%s" % self.session
            #for t in threading.enumerate():
                #if t.getName() == name:
                    #t.unregister_callbacks(self.callback_id)
            del SESSIONS[self.session][term]
        except KeyError as e:
            pass # The EVIL termio has killed my child!  Wait, that's good...
                 # Because now I don't have to worry about it!

    def set_terminal(self, term):
        """Sets self.current_term = *term*"""
        self.current_term = term

    def reset_terminal(self, term):
        """
        Tells the client to reset the terminal (clear the screen and remove
        scrollback).
        """
        message = {'reset_terminal': term}
        self.write_message(json_encode(message))

    def set_title(self, term):
        """
        Sends a message to the client telling it to set the window title of
        *term* to...
        SESSIONS[self.session][term]['multiplex'].proc[fd]['term'].title.

        Example output:

            {'set_title': {'term': 1, 'title': "user@host"}}
        """
        logging.debug("set_title(%s)" % term)
        #print("Got set_title on term: %s" % term)
        title = SESSIONS[self.session][term]['multiplex'].term.get_title()
        # Only send a title update if it actually changed
        if term not in self.titles: # There's a first time for everything
            self.titles[term] = ""
        if title != self.titles[term]:
            self.titles[term] = title
            title_message = {'set_title': {'term': term, 'title': title}}
            self.write_message(json_encode(title_message))

    def bell(self, term):
        """
        Sends a message to the client indicating that a bell was encountered in
        the given terminal (*term*).  Example output:

        {'bell': {'term': 1}}
        """
        bell_message = {'bell': {'term': term}}
        self.write_message(json_encode(bell_message))

    def mode_handler(self, term, setting, boolean):
        """Handles mode settings that require an action on the client."""
        if setting in ['1']: # Only support this mode right now
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

    def refresh_screen(self, term, full=False):
        """
        Writes the state of the given terminal's screen and scrollback buffer to
        the client.
        If *full*, send the whole screen (not just the difference).
        """
        #logging.debug(
            #"refresh_screen (full=%s) on %s" % (full, self.callback_id))
        try:
            SESSIONS[self.session]['tidy_thread'].keepalive(datetime.now())
            m = multiplexer = SESSIONS[self.session][term]['multiplex']

            if len(m.callbacks[m.CALLBACK_UPDATE].keys()) > 1:
                # The screen diff algorithm won't work if there's more than one
                # client attached to the same multiplexer.
                full = True
            if full:
                scrollback, screen = multiplexer.dumplines(full=True)
            else:
                scrollback, screen = multiplexer.dumplines()
        except KeyError as e: # Session died (i.e. command ended).
            scrollback, screen = None, None
        if screen:
            output_dict = {
                'termupdate': {
                    'term': term,
                    'scrollback': scrollback,
                    'screen' : screen,
                    'ratelimiter': multiplexer.ratelimiter_engaged
                }
            }
            try:
                self.write_message(json_encode(output_dict))
            except IOError: # Socket was just closed, no biggie
                logging.info(
                 _("WebSocket closed (%s)") % self.get_current_user()['go_upn'])
                multiplex = SESSIONS[self.session][term]['multiplex']
                multiplex.remove_callback( # Stop trying to write
                    multiplex.CALLBACK_UPDATE, self.callback_id)

    def resize(self, resize_obj):
        """
        Resize the terminal window to the rows/cols specified in *resize_obj*

        Example *resize_obj*::

            {'rows': 24, 'cols': 80}
        """
        self.rows = resize_obj['rows']
        self.cols = resize_obj['cols']
        term = resize_obj['term']
        if self.rows < 2 or self.cols < 2:
            # Fall back to a standard default:
            self.rows = 24
            self.cols = 80
        # If the user already has a running session, set the new terminal size:
        try: # TODO: Make this only resize a given terminal.  Let the client handle repeating the resize command for each.
            for term in SESSIONS[self.session].keys():
                if isinstance(term, int): # Skip the TidyThread
                    SESSIONS[self.session][term]['multiplex'].resize(
                        self.rows,
                        self.cols
                    )
        except KeyError: # Session doesn't exist yet, no biggie
            pass

    def char_handler(self, chars):
        """Writes *chars* (string) to the currently-selected terminal"""
        if type(chars) != unicode:
            chars = unicode(chars)
        term = self.current_term
        session = self.session
        if session in SESSIONS:
            if SESSIONS[session][term]['multiplex'].alive:
                if chars:
                    SESSIONS[ # Force an update
                        session][term]['multiplex'].ratelimit = time.time()
                    SESSIONS[session][term]['multiplex'].proc_write(chars)

    def esc_opt_handler(self, chars):
        """
        Executes whatever function is registered matching the tuple returned by
        process_opt_esc_sequence().
        """
        plugin_name, text = process_opt_esc_sequence(chars)
        if plugin_name:
            try:
                PLUGIN_ESC_HANDLERS[plugin_name](text, tws=self)
            except Exception as e:
                logging.error(_(
                    "Got exception trying to execute plugin's optional ESC "
                    "sequence handler..."))
                print(e)

    def debug_terminal(self, term):
        """
        Prints the terminal's screen and renditions to stdout so they can be
        examined more closely.

        NOTE: Can only be called from a JavaScript console like so:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({'debug_terminal': *term*}));
        """
        screen = SESSIONS[self.session][term]['multiplex'].term.screen
        renditions = SESSIONS[self.session][term]['multiplex'].term.renditions
        for i, line in enumerate(screen):
            print("%s:%s" % (i, "".join(line)))
            print(renditions[i])

class OpenLogHandler(BaseHandler):
    """
    Handles uploads of user logs and returns them to the client as a basic HTML
    page.  Essentially, this works around the limitation of an HTML page being
    unable to save itself =).
    """
    def post(self):
        log = self.get_argument("log")
        container = self.get_argument("container")
        prefix = self.get_argument("prefix")
        theme = self.get_argument("theme")
        css_file = open('templates/css_%s.css' % theme).read()
        css = tornado.template.Template(css_file)
        self.render(
            "templates/user_log.html",
            log=log,
            container=container,
            prefix=prefix,
            css=css.generate(container=container, prefix=prefix)
        )

# Thread classes
class CallbackThread(threading.Thread):
    """
    Listens for events in a Queue() and calls any matching/registered callbacks.
    """
    # NOTE: I know this CallbackThread/register_callback() stuff seems overly
    # complex and it is...  But this was the simplest thing I could come up with
    # to get callbacks working with multiprocessing.  If you have a better way
    # please submit a patch!
    def __init__(self, name, queue):
        threading.Thread.__init__(
            self,
            name=name
        )
        self.name = name
        self.queue = queue
        self.quitting = False
        self.callbacks = {}

    def register_callback(self, identifier, callback):
        """
        Stores the given *callback* as self.callbacks[*identifier*]
        """
        self.callbacks.update({identifier: callback})

    def unregister_callbacks(self, callback_id):
        """
        Removes all registered callbacks associated with *callback_id*
        """
        for identifier in self.callbacks.keys():
            if callback_id in identifier:
                logging.debug("deleting self.callbacks[%s]" % identifier)
                del self.callbacks[identifier]

    def call_callback(self, identifier, args):
        """
        Calls the callback function associated with *identifier* using the given
        *args* like so::

            self.callbacks[*identifier*](*args*)
        """
        if not args:
            self.callbacks[identifier]()
        else:
            self.callbacks[identifier](*args)

    def quit(self):
        try:
            self.queue.put('quit')
        except IOError:
            # The term emulator has already shut down.  Not a big deal
            pass
        self.quitting = True

    def run(self):
        while not self.quitting:
            try:
                obj = self.queue.get()
                identifier = obj[0]
                args = obj[1]
                if identifier != 'quit':
                    self.call_callback(identifier, args)
            except Exception as e:
                if len("%s" % e): # Throws empty exceptions at quitting time.
                    logging.error("Error in CallbackThread: %s" % e)
                self.quitting = True
        logging.info(_(
            "CallbackThread.{name} received quit()...  ".format(
                name=self.name)
        ))

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
        while not self.quitting:
            try:
                session = self.session
                if datetime.now() > self.last_keepalive + TIMEOUT:
                    logging.info(
                        "{session} timeout.".format(
                            session=session
                        )
                    )
                    self.quitting = True
        # This loops through all the open terminals checking if each is alive
                all_dead = True
                for term in SESSIONS[session].keys():
                    try:
                        if SESSIONS[session][term]['multiplex'].alive:
                            all_dead = False
                            # Added a doublecheck value here because there's a
                            # gap between when the last terminal is closed and
                            # when a new one starts up.  Occasionally this would
                            # cause the user's connection to be killed (due to
                            # there being no active terminal associated with it)
                            self.doublecheck = True
                    except TypeError: # Ignore TidyThread object
                        pass
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
                self.quitting = True
        logging.info(_(
            "TidyThread {session} received quit()...  "
            "Killing termio session.".format(session=self.session)
        ))
        # Clean up:
        for term in SESSIONS[session].keys():
            try:
                SESSIONS[session][term]['multiplex'].die()
                SESSIONS[session][term]['multiplex'].proc_kill()
            except TypeError: # Ignore the TidyThread (i.e. ourselves)
                pass
            except KeyError: # Already killed... Great!
                pass
        del SESSIONS[session]

class Application(tornado.web.Application):
    def __init__(self, settings):
        """
        Setup our Tornado application...  Everything in *settings* will wind up
        in the Tornado settings dict so as to be accessible under self.settings.
        """
        global PLUGIN_WS_CMDS
        global PLUGIN_HOOKS
        global PLUGIN_ESC_HANDLERS
        # Base settings for our Tornado app
        tornado_settings = dict(
            cookie_secret=settings['cookie_secret'],
            static_path=os.path.join(GATEONE_DIR, "static"),
            gzip=True,
            login_url="/auth"
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
                         "be %anonymous"))
        # Setup our URL handlers
        handlers = [
            (r"/", MainHandler),
            (r"/ws", TerminalWebSocket),
            (r"/auth", AuthHandler),
            (r"/style", StyleHandler),
            (r"/openlog", OpenLogHandler),
            (r"/docs/(.*)", tornado.web.StaticFileHandler, {
                "path": GATEONE_DIR + '/docs/build/html/',
                "default_filename": "index.html"
            })
        ]
        # Connect the hooks
        for plugin_name, hooks in PLUGIN_HOOKS.items():
            if 'Web' in hooks:
                # Apply the plugin's Web handlers
                handlers.extend(hooks['Web'])
            if 'WebSocket' in hooks:
                # Apply the plugin's WebSocket commands
                PLUGIN_WS_CMDS.update(hooks['WebSocket'])
            if 'Escape' in hooks:
                # Apply the plugin's Escape handler
                PLUGIN_ESC_HANDLERS.update({plugin_name: hooks['Escape']})
        # This removes duplicate handlers for the same regex, allowing plugins
        # to override defaults:
        handlers = merge_handlers(handlers)
        # Include JS-only and CSS-only plugins (for logging purposes)
        js_plugins = [a.split('/')[2] for a in PLUGINS['js']]
        css_plugins = [a.split('/')[2] for a in PLUGINS['css']]
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
    auths = "none, google"
    if KerberosAuthHandler:
        auths += ", kerberos"
    if PAMAuthHandler:
        auths += ", pam"
    # Simplify the syslog_facility option help message
    facilities = FACILITIES.keys()
    facilities.sort()
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
        default=GATEONE_DIR + "/plugins/ssh/scripts/ssh_connect.py -S "
                r"'/tmp/gateone/%SESSION%/%SHORT_SOCKET%' --sshfp -a "
                "'-oUserKnownHostsFile=%USERDIR%/%USER%/known_hosts'",
        help=_("Run the given command when a user connects (e.g. '/bin/login')."
               ),
        type=str
    )
    define("address",
        default="",
        help=_("Run on the given address.  Default is all addresses (IPv6 "
               "included).  Multiple address can be specified using a semicolon"
               " as the separator (e.g. --address="
               "'127.0.0.1;::1;10.1.1.2;fe70::222:fcff:fc2a:3c2a')"),
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
        default=GATEONE_DIR + "/users",
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
               "<user_dir>/logs.  Default: Enabled")
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
        "session_timeout",
        default="5d",
        help=_("Amount of time that a session should be kept alive after the "
        "client has logged out.  Accepts <num>X where X could be one of s, m, h"
        ", or d for seconds, minutes, hours, and days.  Default is '5d' (5 days"
        ")."),
        type=str
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
        default=uname()[1], # Defaults to hostname
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
    if os.path.exists(GATEONE_DIR + "/server.conf"):
        tornado.options.parse_config_file(GATEONE_DIR + "/server.conf")
    else: # Generate a default server.conf with a random cookie secret
        new_conf = True
        if not os.path.exists(options.user_dir): # Make our user_dir
            mkdir_p(options.user_dir)
            os.chmod(options.user_dir, 0700)
        if not os.path.exists(options.session_dir): # Make our session_dir
            mkdir_p(options.session_dir)
            os.chmod(options.session_dir, 0700)
        config_defaults = {}
        for key, value in options.items():
            config_defaults.update({key: value.default})
        # A few config defaults need special handling
        del config_defaults['kill'] # This shouldn't be in server.conf
        del config_defaults['help'] # Neither should this
        config_defaults.update({'cookie_secret': generate_session_id()})
        # NOTE: The next four options are specific to the Tornado framework
        config_defaults.update({'log_file_max_size': 100 * 1024 * 1024}) # 100MB
        config_defaults.update({'log_file_num_backups': 10})
        config_defaults.update({'log_to_stderr': False})
        config_defaults.update(
            {'log_file_prefix': '/var/log/gateone/webserver.log'})
        config = open(GATEONE_DIR + "/server.conf", "w")
        for key, value in config_defaults.items():
            if isinstance(value, basestring):
                config.write('%s = "%s"\n' % (key, value))
            else:
                config.write('%s = %s\n' % (key, value))
        config.close()
        tornado.options.parse_config_file(GATEONE_DIR + "/server.conf")
    tornado.options.parse_command_line()
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
    if new_conf:
        logging.info(_("No server.conf found.  A new one was generated using "
                     "defaults."))
    if options.kill:
        # Kill all running dtach sessions (associated with Gate One anyway)
        killall(options.session_dir)
        sys.exit(0)
    # Set our CMD variable to tell the multiplexer which command to execute
    global CMD
    CMD = options.command
    # Set our global session timeout
    global TIMEOUT
    TIMEOUT = convert_to_timedelta(options.session_timeout)
    # Make sure dtach is available and if not, set dtach=False
    result = getoutput('which dtach')
    if not result:
        logging.warning(
            _("dtach command not found.  dtach support has been disabled."))
        options.dtach = False
    # Define our Application settings
    app_settings = {
        'gateone_dir': GATEONE_DIR, # Only here so plugins can reference it
        'debug': options.debug,
        'cookie_secret': options.cookie_secret,
        'auth': none_fix(options.auth),
        'embedded': str2bool(options.embedded),
        'js_init': options.js_init,
        'user_dir': options.user_dir,
        'session_dir': options.session_dir,
        'session_logging': options.session_logging,
        'syslog_session_logging': options.syslog_session_logging,
        'syslog_facility': options.syslog_facility,
        'dtach': options.dtach,
        'sso_realm': options.sso_realm,
        'sso_service': options.sso_service,
        'pam_realm': options.pam_realm,
        'pam_service': options.pam_service,
        'locale': options.locale
    }
    # Check to make sure we have a certificate and keyfile and generate fresh
    # ones if not.
    if not os.path.exists(options.keyfile):
        logging.info(_("No SSL private key found.  One will be generated."))
        gen_self_signed_ssl()
    if not os.path.exists(options.certificate):
        logging.info(_("No SSL certificate found.  One will be generated."))
        gen_self_signed_ssl()
    for addr in options.address.split(';'):
        if addr:
            logging.info(_(
                "Listening on https://{address}:{port}/".format(
                    address=addr, port=options.port
                ))
    )
    # Setup static file links for plugins (if any)
    static_dir = os.path.join(GATEONE_DIR, "static")
    plugin_dir = os.path.join(GATEONE_DIR, "plugins")
    create_plugin_static_links(static_dir, plugin_dir)
    # Instantiate our Tornado web server
    ssl_options = {
        "certfile": options.certificate,
        "keyfile": options.keyfile
    }
    if options.disable_ssl:
        ssl_options = None
    http_server = tornado.httpserver.HTTPServer(
        Application(settings=app_settings), ssl_options=ssl_options)
    try: # Start your engines!
        for addr in options.address.split(';'):
            if addr:
                http_server.listen(options.port, addr)
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt: # ctrl-c
        logging.info(_("Caught KeyboardInterrupt.  Killing sessions..."))
        for t in threading.enumerate():
            if t.getName().startswith('TidyThread'):
                t.quit()
            elif t.getName().startswith('CallbackThread'):
                t.quit()

if __name__ == "__main__":
    main()
