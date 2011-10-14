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

    address = "0.0.0.0" # Strings are surrounded by quotes
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
      --address                        Run on the given address.
      --auth                           Authentication method to use.  Valid options are: none, kerberos, google
      --certificate                    Path to the SSL certificate.  Will be auto-generated if none is provided.
      --command                        Run the given command when a user connects (e.g. 'nethack').
      --cookie_secret                  Use the given 45-character string for cookie encryption.
      --debug                          Enable debugging features such as auto-restarting when files are modified.
      --disable_ssl                    If enabled, Gate One will run without SSL (generally not a good idea).
      --dtach                          Wrap terminals with dtach. Allows sessions to be resumed even if Gate One is stopped and started (which is a sweet feature =).
      --embedded                       Run Gate One in Embedded Mode (no toolbar, only one terminal allowed, etc.  See docs).
      --keyfile                        Path to the SSL keyfile.  Will be auto-generated if none is provided.
      --kill                           Kill any running Gate One terminal processes including dtach'd processes.
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

# Our own modules
import termio
from auth import NullAuthHandler, KerberosAuthHandler, GoogleAuthHandler
from utils import noop, str2bool, generate_session_id, cmd_var_swap, mkdir_p
from utils import gen_self_signed_ssl, killall, get_plugins, load_plugins
from utils import create_plugin_static_links, merge_handlers, none_fix
from utils import convert_to_timedelta, kill_dtached_proc
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
        # Use the minified version if it exists
        if os.path.exists(minified_js_abspath):
            gateone_js = "/static/gateone.min.js"
        self.render(
            "templates/index.html",
            hostname=hostname,
            gateone_js=gateone_js,
            jsplugins=PLUGINS['js'],
            cssplugins=PLUGINS['css'],
            bell_data_uri=bell_data_uri
        )

class StyleHandler(BaseHandler):
    """
    Serves up our CSS templates (e.g. the 'black' or 'white' schemes)
    """
    # Hey, if unauthenticated clients want this they can have it!
    #@tornado.web.authenticated
    def get(self):
        container = self.get_argument("container")
        prefix = self.get_argument("prefix")
        scheme = self.get_argument("scheme", None)
        self.set_header ('Content-Type', 'text/css')
        self.render(
            "templates/css_%s.css" % scheme, container=container, prefix=prefix)

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
        logging.info(
            "WebSocket opened (%s)" % self.get_current_user()['go_upn'])

    def on_message(self, message):
        """Called when we receive a message from the client."""
        # This is super useful when debugging:
        logging.debug("message: %s" % repr(message))
        message_obj = None
        try:
            message_obj = json_decode(message) # JSON FTW!
            if not isinstance(message_obj, dict):
                self.write_message("'Error: Message bust be a JSON dict.'")
        except ValueError: # We didn't get JSON
            self.write_message("'Error: We only accept JSON here.'")
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
        if 'go_upn' in self.get_current_user():
            logging.info(
                "WebSocket closed (%s)" % self.get_current_user()['go_upn'])
        else:
            logging.info("WebSocket closed")

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
                    logging.error("Unauthenticated WebSocket attempt.")
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
            user = self.get_current_user()['go_upn']
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
                'GO_SESSION_DIR': session_dir,
            }
            fd = SESSIONS[self.session][term]['multiplex'].create(
                rows, cols, env=env)
            refresh = partial(self.refresh_screen, term)
            SESSIONS[self.session][term][ # 1 is CALLBACK_UPDATE
                'multiplex'].callbacks[1] = refresh
            restart = partial(self.new_terminal, settings)
            SESSIONS[self.session][term][ # 2 is CALLBACK_EXIT
                'multiplex'].callbacks[2] = restart
            termio_write = SESSIONS[ # Write responses directly to the prog
                self.session][term]['multiplex'].proc_write
            SESSIONS[self.session][term][ # 5 is CALLBACK_DSR
                'multiplex'].term.callbacks[5] = termio_write
            set_title = partial(self.set_title, term)
            SESSIONS[self.session][term][ # 6 is CALLBACK_TITLE
                'multiplex'].term.callbacks[6] = set_title
            set_title() # Set initial title
            bell = partial(self.bell, term)
            SESSIONS[self.session][term][ # 7 is CALLBACK_BELL
                'multiplex'].term.callbacks[7] = bell
            SESSIONS[self.session][term][ # 8 is CALLBACK_OPT
                    'multiplex'].term.callbacks[8] = self.esc_opt_handler
            mode_handler = partial(self.mode_handler, term)
            SESSIONS[self.session][term][ # 9 is CALLBACK_MODE
                    'multiplex'].term.callbacks[9] = mode_handler
            if self.settings['dtach']: # dtach sessions need a little extra love
                SESSIONS[self.session][term]['multiplex'].redraw()
        else:
            # Terminal already exists
            if SESSIONS[self.session][term]['multiplex'].alive: # It's ALIVE!
                message = {'term_exists': term}
                self.write_message(json_encode(message))
                # This resets the diff
                SESSIONS[self.session][term]['multiplex'].prev_output = [
                    None for a in xrange(rows-1)]
                # TODO: Right here we need to change how the callbacks are handled so we can have multiple screen update callbacks for the same session (so a user could have two browsers open to the same session).  Not exactly a common use case but you never know!
                restart = partial(self.new_terminal, settings)
                SESSIONS[self.session][term][ # 2 is CALLBACK_EXIT
                    'multiplex'].callbacks[2] = restart
                refresh = partial(self.refresh_screen, term)
                SESSIONS[self.session][term][ # 1 is CALLBACK_UPDATE
                    'multiplex'].callbacks[1] = refresh
                set_title = partial(self.set_title, term)
                termio_write = SESSIONS[ # Write responses directly to the prog
                    self.session][term]['multiplex'].proc_write
                SESSIONS[self.session][term][ # 5 is CALLBACK_DSR
                'multiplex'].term.callbacks[5] = termio_write
                SESSIONS[self.session][term][ # 6 is CALLBACK_TITLE
                    'multiplex'].term.callbacks[6] = set_title
                set_title() # Set the title
                bell = partial(self.bell, term)
                SESSIONS[self.session][term][ # 7 is CALLBACK_BELL
                    'multiplex'].term.callbacks[7] = bell
                SESSIONS[self.session][term][ # 8 is CALLBACK_OPT
                    'multiplex'].term.callbacks[8] = self.esc_opt_handler
                mode_handler = partial(self.mode_handler, term)
                SESSIONS[self.session][term][ # 9 is CALLBACK_MODE
                    'multiplex'].term.callbacks[9] = mode_handler
            else:
                # Tell the client this terminal is no more
                message = {'term_ended': term}
                self.write_message(json_encode(message))
            self.refresh_screen(term) # Send a fresh screen to the client
            # NOTE: refresh_screen will also take care of cleaning things up if
            #       SESSIONS[self.session][term]['multiplex'].alive is False
        if 'tidy_thread' not in SESSIONS[self.session]:
            # Start the keepalive thread so the session will time out if the
            # user disconnects for like a week (by default anyway =)
            SESSIONS[self.session]['tidy_thread'] = TidyThread(self.session)
            SESSIONS[self.session]['tidy_thread'].start()

    def kill_terminal(self, term):
        """Kills *term* and any associated processes"""
        #print("killing terminal: %s" % term)
        term = int(term)
        try:
            SESSIONS[self.session][term]['multiplex'].die()
            SESSIONS[self.session][term]['multiplex'].proc_kill()
            if self.settings['dtach']:
                kill_dtached_proc(self.session, term)
            del SESSIONS[self.session][term]
        except KeyError as e:
            pass # The EVIL termio has killed my child!  Wait, that's good...
                 # Because now I don't have to worry about it!

    def set_terminal(self, term):
        """Sets self.current_term = *term*"""
        self.current_term = term

    def set_title(self, term):
        """
        Sends a message to the client telling it to set the window title of
        *term* to...
        SESSIONS[self.session][term]['multiplex'].proc[fd]['term'].title.

        Example output:

            {'set_title': {'term': 1, 'title': "user@host"}}
        """
        #print("Got set_title on term: %s" % term)
        title = SESSIONS[self.session][term]['multiplex'].term.title
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

    def refresh_screen(self, term):
        """Returns the whole terminal screen."""
        try:
            SESSIONS[self.session]['tidy_thread'].keepalive(datetime.now())
            scrollback, screen = SESSIONS[
                self.session][term]['multiplex'].dumplines()
        except KeyError: # Session died (i.e. command ended).
            scrollback, screen = None, None
        if screen:
            multiplexer = SESSIONS[self.session][term]['multiplex']
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
                    "WebSocket closed (%s)" % self.get_current_user()['go_upn'])
                SESSIONS[self.session][term][ # 1 is CALLBACK_UPDATE
                    'multiplex'].callbacks[1] = noop # Stop trying to write

    def resize(self, resize_obj):
        """
        Resize the terminal window to the rows/cols specified in *resize_obj*

        Example *resize_obj*:
            {'rows': 24, 'cols': 80}
        """
        self.rows = resize_obj['rows']
        self.cols = resize_obj['cols']
        term = resize_obj['term']
        if self.rows < 2 or self.cols < 2: # 0 or negative numbers will crash
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
                print("Got exception trying to execute plugin's optional ESC "
                      "sequence handler...")
                print(e)

    def debug_terminal(self, term):
        """
        Prints the terminal's screen and renditions to stdout so they can be
        examined more closely.

        NOTE: Can only be called from a JavaScript console like so:
                GateOne.ws.send(JSON.stringify({'debug_terminal': *term*}));
        """
        screen = SESSIONS[self.session][term]['multiplex'].term.screen
        renditions = SESSIONS[self.session][term]['multiplex'].term.renditions
        for i, line in enumerate(screen):
            print("%s:%s" % (i, "".join(line)))
            print(renditions[i])

class RecordingHandler(BaseHandler):
    """
    Handles uploads of session recordings and returns them to the client in a
    self-contained HTML file that will auto-start playback.

    NOTE: The real crux of the code that handles this is in the template.
    """
    def post(self):
        recording = self.get_argument("recording")
        container = self.get_argument("container")
        prefix = self.get_argument("prefix")
        scheme = self.get_argument("scheme")
        css_file = open('templates/css_%s.css' % scheme).read()
        css = tornado.template.Template(css_file)
        self.render(
            "templates/self_contained_recording.html",
            recording=recording,
            container=container,
            prefix=prefix,
            css=css.generate(container=container, prefix=prefix)
        )

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
        scheme = self.get_argument("scheme")
        css_file = open('templates/css_%s.css' % scheme).read()
        css = tornado.template.Template(css_file)
        self.render(
            "templates/user_log.html",
            log=log,
            container=container,
            prefix=prefix,
            css=css.generate(container=container, prefix=prefix)
        )

class TidyThread(threading.Thread):
    """
    Kills a user's termio session if the client hasn't updated the keepalive
    within *TIMEOUT* (global).  Also, tidies up sessions, logs, and whatnot based
    on Gate One's settings (when the time is right).

    NOTE: This is necessary to prevent shells from running eternally in the
    background.

    *session* - 45-character string containing the user's session ID
    """
    # TODO: Get this cleaning up logs according to the user's settings
    # TODO: Add the aforementioned log cleanup settings :)
    def __init__(self, session):
        threading.Thread.__init__(
            self,
            name="TidyThread-%s" % session
        )
        self.last_keepalive = datetime.now()
        self.session = session
        self.quitting = False

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
                    except TypeError: # Ignore TidyThread object
                        pass
                if all_dead:
                    self.quitting = True
                # Keep this low or it will take that long for the process to end
                # when it receives a SIGTERM or Ctrl-c
                time.sleep(2)
            except Exception as e:
                logging.info(
                    "Exception encountered: {exception}".format(exception=e)
                )
                self.quitting = True
        logging.info(
            "{session} received quit()...  "
            "Killing termio session.".format(session=self.session)
        )
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
            elif settings['auth'] == 'google':
                AuthHandler = GoogleAuthHandler
            logging.info("Using %s authentication" % settings['auth'])
        else:
            logging.info("No authentication method configure. All users will be"
                         " %anonymous")
        # Setup our URL handlers
        handlers = [
            (r"/", MainHandler),
            (r"/ws", TerminalWebSocket),
            (r"/auth", AuthHandler),
            (r"/style", StyleHandler),
            (r"/recording", RecordingHandler),
            (r"/openlog", OpenLogHandler),
            (r"/docs/(.*)", tornado.web.StaticFileHandler, {
                "path": GATEONE_DIR + '/docs/build/html/',
                "default_filename": "index.html"
            })
        ]
        # Load plugins and grab their hooks
        imported = load_plugins(PLUGINS['py'])
        for plugin in imported:
            try:
                PLUGIN_HOOKS.update({plugin.__name__: plugin.hooks})
            except AttributeError:
                pass # No hooks--probably just a supporting .py file.
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
        logging.info("Loaded plugins: %s" % ", ".join(plugin_list))
        tornado.web.Application.__init__(self, handlers, **tornado_settings)

def main():
    # Simplify the auth option help message
    auths = "none, google"
    if KerberosAuthHandler:
        auths += ", kerberos"
    # Simplify the syslog_facility option help message
    facilities = FACILITIES.keys()
    facilities.sort()
    define(
        "debug",
        default=False,
        help="Enable debugging features such as auto-restarting when files are "
             "modified."
    )
    define("cookie_secret", # 45 chars is, "Good enough for me" (cookie joke =)
        default=None,
        help="Use the given 45-character string for cookie encryption.",
        type=str
    )
    define("command",
        default=GATEONE_DIR + "plugins/ssh/scripts/ssh_connect.py",
        help="Run the given command when a user connects (e.g. 'nethack').",
        type=str
    )
    define("address",
        default="0.0.0.0",
        help="Run on the given address.",
        type=str)
    define("port", default=443, help="Run on the given port.", type=int)
    # Please only use this if Gate One is running behind something with SSL:
    define(
        "disable_ssl",
        default=False,
        help="If enabled, Gate One will run without SSL (generally not a good "
             "idea)."
    )
    define(
        "certificate",
        default="certificate.pem",
        help="Path to the SSL certificate.  Will be auto-generated if none is"
             " provided.",
        type=str
    )
    define(
        "keyfile",
        default="keyfile.pem",
        help="Path to the SSL keyfile.  Will be auto-generated if none is"
             " provided.",
        type=str
    )
    define(
        "user_dir",
        default=GATEONE_DIR + "/users",
        help="Path to the location where user files will be stored.",
        type=str
    )
    define(
        "session_dir",
        default="/tmp/gateone",
        help="Path to the location where session information will be stored.",
        type=str
    )
    define(
        "session_logging",
        default=True,
        help="If enabled, logs of user sessions will be saved in "
             "<user_dir>/logs.  Default: Enabled"
    )
    define( # This is an easy way to support cetralized logging
        "syslog_session_logging",
        default=False,
        help="If enabled, logs of user sessions will be written to syslog."
    )
    define(
        "syslog_facility",
        default="daemon",
        help="Syslog facility to use when logging to syslog (if "
             "syslog_session_logging is enabled).  Must be one of: %s."
             "  Default: daemon" % ", ".join(facilities),
        type=str
    )
    define(
        "session_timeout",
        default="5d",
        help="Amount of time that a session should be kept alive after the "
        "client has logged out.  Accepts <num>X where X could be one of s, m, h"
        ", or d for seconds, minutes, hours, and days.  Default is '5d' (5 days"
        ").",
        type=str
    )
    define(
        "auth",
        default=None,
        help="Authentication method to use.  Valid options are: %s" % auths,
        type=str
    )
    define(
        "sso_realm",
        default=None,
        help="Kerberos REALM (aka DOMAIN) to use when authenticating clients."
             " Only relevant if Kerberos authentication is enabled.",
        type=str
    )
    define(
        "sso_service",
        default='HTTP',
        help="Kerberos service (aka application) to use. Defaults to HTTP. "
             "Only relevant if Kerberos authentication is enabled.",
        type=str
    )
    define(
        "embedded",
        default=False,
        help="Run Gate One in Embedded Mode (no toolbar, only one terminal "
             "allowed, etc.  See docs)."
    )
    define(
        "dtach",
        default=True,
        help="Wrap terminals with dtach. Allows sessions to be resumed even if "
             "Gate One is stopped and started (which is a sweet feature =)."
    )
    define(
        "kill",
        default=False,
        help="Kill any running Gate One terminal processes including dtach'd "
             "processes."
    )
    # TODO: Give plugins the ability to add their own define()s
    # TODO: Use the arguments passed to gateone.py to generate server.conf if it
    #       isn't already present.
    if os.path.exists(GATEONE_DIR + "/server.conf"):
        tornado.options.parse_config_file(GATEONE_DIR + "/server.conf")
    else: # Generate a default server.conf with a random cookie secret
        logging.info("No server.conf found.  A new one will be generated using "
                     "defaults.")
        if not os.path.exists(options.user_dir): # Make our user_dir
            mkdir_p(options.user_dir)
            os.chmod(options.user_dir, 0700)
        if not os.path.exists(options.session_dir): # Make our session_dir
            mkdir_p(options.session_dir)
            os.chmod(options.session_dir, 0700)
        config_defaults = {
            'debug': False,
            'cookie_secret': generate_session_id(), # Works for so many things!
            'port': 443,
            'address': '0.0.0.0', # All addresses
            'embedded': False,
            'auth': None,
            'dtach': True,
            # NOTE: The next four options are specific to the Tornado framework
            'log_file_max_size': 100 * 1024 * 1024, # 100MB
            'log_file_num_backups': 10, # 1GB total max
            'log_file_prefix': '/var/log/gateone/webserver.log',
            'logging': 'info', # One of: info, warning, error, none
            'user_dir': options.user_dir,
            'session_dir': options.session_dir,
            'session_logging': options.session_logging,
            'syslog_session_logging': options.syslog_session_logging,
            'syslog_facility': options.syslog_facility,
            'session_timeout': options.session_timeout,
            'keyfile': GATEONE_DIR + "/keyfile.pem",
            'certificate': GATEONE_DIR + "/certificate.pem",
            'command': (
                GATEONE_DIR + "/plugins/ssh/scripts/ssh_connect.py -S "
                r"'/tmp/gateone/%SESSION%/%r@%h:%p' -a "
                "'-oUserKnownHostsFile=%USERDIR%/%USER%/known_hosts'"
            ),
            'sso_realm': 'EXAMPLE.COM',
            'sso_service': 'HTTP'
        }
        config = open(GATEONE_DIR + "/server.conf", "w")
        for key, value in config_defaults.items():
            if isinstance(value, basestring):
                config.write('%s = "%s"\n' % (key, value))
            else:
                config.write('%s = %s\n' % (key, value))
        config.close()
        tornado.options.parse_config_file(GATEONE_DIR + "/server.conf")
    # Create the log dir if not already present (NOTE: Assumes we're root)
    log_dir = os.path.split(options.log_file_prefix)[0]
    if not os.path.exists(log_dir):
        try:
            mkdir_p(log_dir)
        except OSError:
            print("\x1b[1;31mERROR:\x1b[0m Could not create %s for "
                  "log_file_prefix: %s" % (log_dir, options.log_file_prefix))
            print("You probably want to change this option, run Gate One as "
                  "root, or create that directory and give the proper user "
                  "ownership of it.")
            sys.exit(1)
    tornado.options.parse_command_line()
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
    # Define our Application settings
    app_settings = {
        'gateone_dir': GATEONE_DIR, # Only here so plugins can reference it
        'debug': options.debug,
        'cookie_secret': options.cookie_secret,
        'auth': none_fix(options.auth),
        'embedded': str2bool(options.embedded),
        'user_dir': options.user_dir,
        'session_dir': options.session_dir,
        'session_logging': options.session_logging,
        'syslog_session_logging': options.syslog_session_logging,
        'syslog_facility': options.syslog_facility,
        'dtach': options.dtach,
        'sso_realm': options.sso_realm,
        'sso_service': options.sso_service
    }
    # Check to make sure we have a certificate and keyfile and generate fresh
    # ones if not.
    if not os.path.exists(options.keyfile):
        logging.info("No SSL private key found.  One will be generated.")
        gen_self_signed_ssl()
    if not os.path.exists(options.certificate):
        logging.info("No SSL certificate found.  One will be generated.")
        gen_self_signed_ssl()
    logging.info(
        "Listening on https://{address}:{port}/".format(
            address=options.address, port=options.port
        )
    )
    # Setup static file links for plugins (if any)
    static_dir = os.path.join(GATEONE_DIR, "static")
    plugin_dir = os.path.join(GATEONE_DIR, "plugins")
    create_plugin_static_links(static_dir, plugin_dir)
    # Instantiate our Tornado web server
    ssl_options = {
        "certfile": os.path.join(os.getcwd(), "certificate.pem"),
        "keyfile": os.path.join(os.getcwd(), "keyfile.pem"),
    }
    if options.disable_ssl:
        ssl_options = None
    http_server = tornado.httpserver.HTTPServer(
        Application(settings=app_settings), ssl_options=ssl_options)
    try: # Start your engines!
        http_server.listen(options.port, options.address)
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt: # ctrl-c
        logging.info("Caught KeyboardInterrupt.  Killing sessions...")
        for t in threading.enumerate():
            if t.getName().startswith('TidyThread'):
                t.quit()

if __name__ == "__main__":
    main()