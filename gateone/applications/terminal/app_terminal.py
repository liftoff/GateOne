# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#

__doc__ = """\
app_terminal.py - A Gate One Application (GOApplication) that provides a
terminal emulator.

Docstrings
----------
"""

# Meta information about the plugin.  Your plugin doesn't *have* to have this
# but it is a good idea.
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# I like to start my files with imports from Python's standard library...
import os, sys, logging, time, io
from datetime import datetime, timedelta
from functools import partial

# Gate One imports
import termio
from gateone import GATEONE_DIR, BaseHandler, GOApplication, StaticHandler
from auth import require, authenticated, applicable_policies, policies
from utils import cmd_var_swap, json_encode, get_settings, short_hash
from utils import mkdir_p, string_to_syslog_facility, get_plugins, load_modules
from utils import process_opt_esc_sequence, bind, MimeTypeFail, create_data_uri
from utils import which, get_translation
import terminal

# 3rd party imports
import tornado.ioloop
import tornado.web
from tornado.options import options, define

# Globals
SESSIONS = {} # This will get replaced with gateone.py's SESSIONS dict
# NOTE: The overwriting of SESSIONS happens inside of gateone.py
# This is in case we have relative imports, templates, or whatever:
APPLICATION_PATH = os.path.split(__file__)[0] # Path to our application
REGISTERED_HANDLERS = [] # So we don't accidentally re-add handlers
web_handlers = [] # Assigned in init()

# Localization support
_ = get_translation()

# Terminal-specific command line options.  These become options you can pass to
# gateone.py (e.g. --session_logging)
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

def kill_session(session, kill_dtach=False):
    """
    Terminates all the terminal processes associated with *session*.  If
    *kill_dtach* is True, the dtach processes associated with the session will
    also be killed.

    .. note:: This function gets appended to the `SESSIONS[session]["terminal_callbacks"]` list inside of :meth:`TerminalApplication.authenticate`.
    """
    logging.debug('kill_session(%s)' % session)
    if kill_dtach:
        from utils import kill_dtached_proc
    for location, apps in list(SESSIONS[session]['locations'].items()):
        loc = SESSIONS[session]['locations'][location]['terminal']
        terms = apps['terminal']
        for term in terms:
            if isinstance(term, int):
                if loc[term]['multiplex'].isalive():
                    loc[term]['multiplex'].terminate()
                if kill_dtach:
                    kill_dtached_proc(session, term)

def policy_new_terminal(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to execute :func:`new_terminal` and applies any configured
    restrictions (e.g. max_dimensions).  Specifically, checks to make sure the
    user is not in violation of their applicable policies (e.g. max_terms).
    """
    instance = cls.instance
    session = instance.ws.session
    try:
        term = cls.f_args[0]['term']
    except (KeyError, IndexError):
        # new_terminal got bad *settings*.  Deny
        return False
    user = instance.current_user
    open_terminals = 0
    locations = SESSIONS[session]['locations']
    if term in instance.loc_terms:
        # Terminal already exists (reattaching) or was shared by someone else
        return True
    for loc in locations.values():
        for t, term_obj in loc['terminal'].items():
            if t in instance.loc_terms:
                if user == term_obj['user']:
                    # Terms shared by others don't count
                    if user['upn'] == 'ANONYMOUS':
                        # ANONYMOUS users are all the same so we have to use
                        # the session ID
                        if session == term_obj['user']['session']:
                            open_terminals += 1
                    else:
                        open_terminals += 1
    # Start by determining the limits
    max_terms = 0 # No limit
    if 'max_terms' in policy:
        max_terms = policy['max_terms']
    max_cols = 0
    max_rows = 0
    if 'max_dimensions' in policy:
        max_cols = policy['max_dimensions']['cols']
        max_rows = policy['max_dimensions']['rows']
    if max_terms:
        if open_terminals >= max_terms:
            logging.error(_(
                "%s denied opening new terminal.  The 'max_terms' policy limit "
                "(%s) has been reached for this user." % (
                user['upn'], max_terms)))
            # Let the client know this term is no more (after a timeout so the
            # can complete its newTerminal stuff beforehand).
            ioloop = tornado.ioloop.IOLoop.instance()
            term_ended = partial(instance.term_ended, term)
            ioloop.add_timeout(
                timedelta(milliseconds=500), term_ended)
            cls.error = _(
                "Server policy dictates that you may only open %s terminal(s) "
                % max_terms)
            return False
    if max_cols:
        if int(cls.f_args['cols']) > max_cols:
            cls.f_args['cols'] = max_cols # Reduce to max size
    if max_rows:
        if int(cls.f_args['rows']) > max_rows:
            cls.f_args['rows'] = max_rows # Reduce to max size
    return True

def policy_share_terminal(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to execute :func:`share_terminal`.
    """
    try:
        cls.f_args[0]['term']
    except (KeyError, IndexError):
        # share_terminal got bad *settings*.  Deny
        return False
    can_share = policy.get('share_terminals', True)
    if not can_share:
        return False
    return True

def policy_char_handler(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to write to the current (or specified) terminal.
    """
    error_msg = _("You do not have permission to write to this terminal.")
    cls.error = error_msg
    instance = cls.instance
    try:
        term = cls.f_args[1]
    except IndexError:
        # char_handler didn't get 'term' as a non-keyword argument.  Try kword:
        try:
            term = cls.f_kwargs['term']
        except KeyError:
            # No 'term' was given at all.  Use current_term
            term = instance.current_term
    # Make sure the term is an int
    term = int(term)
    term_obj = instance.loc_terms[term]
    user = instance.current_user
    if user['upn'] == term_obj['user']['upn']:
        # UPN match...  Double-check ANONYMOUS
        if user['upn'] == 'ANONYMOUS':
            # All users will be ANONYMOUS so we need to check their session ID
            if user['session'] == term_obj['user']['session']:
                return True
        # TODO: Think about adding an administrative lock feature here
        else:
            return True # Users can always write to their own terminals
    if 'share_id' in term_obj:
        # This is a shared terminal.  Check if the user is in the 'write' list
        shared = instance.ws.persist['terminal']['shared']
        share_obj = shared[term_obj['share_id']]
        if user['upn'] in share_obj['write']:
            return True
        elif share_obj['write'] in ['AUTHENTICATED', 'ANONYMOUS']:
            return True
        elif isinstance(share_obj['write'], list):
            # Iterate and check each item
            for allowed in share_obj['write']:
                if allowed == user['upn']:
                    return True
                elif allowed in ['AUTHENTICATED', 'ANONYMOUS']:
                    return True
        # TODO: Handle regexes and lists of regexes here
    return False

def terminal_policies(cls):
    """
    This function gets registered under 'terminal' in the
    :attr:`ApplicationWebSocket.security` dict and is called by the
    :func:`require` decorator by way of the :class:`policies` sub-function. It
    returns True or False depending on what is defined in the settings dir and
    what function is being called.

    This function will keep track of and place limmits on the following:

        * The number of open terminals.
        * How big each terminal may be.
        * Who may view or write to a shared terminal.

    If no 'terminal' policies are defined this function will always return True.
    """
    instance = cls.instance # ApplicationWebSocket instance
    function = cls.function # Wrapped function
    #f_args = cls.f_args     # Wrapped function's arguments
    #f_kwargs = cls.f_kwargs # Wrapped function's keyword arguments
    policy_functions = {
        'new_terminal': policy_new_terminal,
        'share_terminal': policy_share_terminal,
        'char_handler': policy_char_handler
    }
    user = instance.current_user
    policy = applicable_policies('terminal', user, instance.ws.prefs)
    if not policy: # Empty RUDict
        return True # A world without limits!
    # TODO: Move the "allow" logic into gateone.py or auth.py
    # Start by determining if the user can even login to the terminal app
    if 'allow' in policy:
        if not policy['allow']:
            logging.error(_(
                "%s denied access to the Terminal application by policy."
                % user['upn']))
            return False
    if function.__name__ in policy_functions:
        return policy_functions[function.__name__](cls, policy)
    return True # Default to permissive if we made it this far

# NOTE:  THE BELOW IS A WORK IN PROGRESS
class SharedTermHandler(BaseHandler):
    """
    Renders shared.html which allows an anonymous user to view a shared
    terminal.
    """
    def get(self):
        hostname = os.uname()[1]
        prefs = self.get_argument("prefs", None)
        gateone_js = "%sstatic/gateone.js" % self.settings['url_prefix']
        minified_js_abspath = os.path.join(GATEONE_DIR, 'static')
        minified_js_abspath = os.path.join(
            minified_js_abspath, 'gateone.min.js')
        # Use the minified version if it exists
        if os.path.exists(minified_js_abspath):
            gateone_js = "%sstatic/gateone.min.js" % self.settings['url_prefix']
        template_path = os.path.join(APPLICATION_PATH, 'templates')
        index_path = os.path.join(template_path, 'shared.html')
        self.render(
            index_path,
            hostname=hostname,
            gateone_js=gateone_js,
            url_prefix=self.settings['url_prefix'],
            prefs=prefs
        )

class TermStaticFiles(tornado.web.StaticFileHandler):
    """
    Serves static files in the `gateone/applications/terminal/static` directory.
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

class TerminalApplication(GOApplication):
    """
    A Gate One Application (`GOApplication`) that handles creating and
    controlling terminal applications running on the Gate One server.
    """
    name = "Terminal" # A user-friendly name that will be displayed to the user
    icon = os.path.join(APPLICATION_PATH, "static", "icons", "terminal.svg")
    about = "Open terminals running any number of configured applications."
    def __init__(self, ws):
        logging.debug("TerminalApplication.__init__(%s)" % ws)
        self.policy = {} # Gets set in authenticate() below
        self.terms = {}
        # So we can keep track and avoid sending unnecessary messages:
        self.titles = {}
        self.em_dimensions = None
        self.race_check = False
        GOApplication.__init__(self, ws)

    def initialize(self):
        """
        Called when the WebSocket is instantiated, sets up our WebSocket
        actions, security policies, and attaches all of our plugin hooks/events.
        """
        logging.debug("TerminalApplication.initialize()")
        # Register our security policy function
        self.ws.security.update({'terminal': terminal_policies})
        # Register our WebSocket actions
        self.ws.actions.update({
            'terminal:new_terminal': self.new_terminal,
            'terminal:set_terminal': self.set_terminal,
            'terminal:move_terminal': self.move_terminal,
            'terminal:kill_terminal': self.kill_terminal,
            'c': self.char_handler, # Just 'c' to keep the bandwidth down
            'terminal:write_chars': self.write_chars,
            'terminal:refresh': self.refresh_screen,
            'terminal:full_refresh': self.full_refresh,
            'terminal:resize': self.resize,
            'terminal:get_bell': self.get_bell,
            'terminal:manual_title': self.manual_title,
            'terminal:reset_terminal': self.reset_terminal,
            'terminal:get_webworker': self.get_webworker,
            'terminal:get_colors': self.get_colors,
            'terminal:set_encoding': self.set_term_encoding,
            'terminal:set_keyboard_mode': self.set_term_keyboard_mode,
            'terminal:get_locations': self.get_locations,
            'terminal:get_terminals': self.terminals,
            'terminal:share_terminal': self.share_terminal,
            'terminal:share_user_list': self.share_user_list,
            'terminal:unshare_terminal': self.unshare_terminal,
            'terminal:enumerate_colors': self.enumerate_colors,
            'terminal:list_shared_terminals': self.list_shared_terminals,
            'terminal:attach_shared_terminal': self.attach_shared_terminal,
            'terminal:set_sharing_permissions': self.set_sharing_permissions,
            'terminal:debug_terminal': self.debug_terminal
        })
        if 'terminal' not in self.ws.persist:
            self.ws.persist['terminal'] = {}
        # Initialize plugins (every time a connection is established so we can
        # load new plugins with a simple page reload)
        enabled_plugins = self.ws.prefs['*']['terminal'].get(
            'enabled_plugins', [])
        self.plugins = get_plugins(
            os.path.join(APPLICATION_PATH, 'plugins'), enabled_plugins)
        js_plugins = [a.split('/')[2] for a in self.plugins['js']]
        css_plugins = []
        for i in css_plugins:
            if '?' in i: # CSS Template
                css_plugins.append(i.split('plugin=')[1].split('&')[0])
            else: # Static CSS file
                css_plugins.append(i.split('/')[1])
        plugin_list = list(set(self.plugins['py'] + js_plugins + css_plugins))
        plugin_list.sort() # So there's consistent ordering
        logging.info(_("Active Terminal Plugins: %s" % ", ".join(plugin_list)))
        # Attach plugin hooks
        self.plugin_hooks = {}
        # TODO: Keep track of plugins and hooks to determine when they've
        #       changed so we can tell clients to pull updates and whatnot
        imported = load_modules(self.plugins['py'])
        for plugin in imported:
            try:
                self.plugin_hooks.update({plugin.__name__: plugin.hooks})
                if hasattr(plugin, 'initialize'):
                    plugin.initialize(self)
            except AttributeError:
                pass # No hooks--probably just a supporting .py file.
        # Hook up the hooks
        # NOTE:  Most of these will soon be replaced with on() and off() events
        # and maybe some functions related to initialization.
        self.plugin_esc_handlers = {}
        self.plugin_auth_hooks = []
        self.plugin_command_hooks = []
        self.plugin_new_multiplex_hooks = []
        self.plugin_new_term_hooks = {}
        self.plugin_env_hooks = {}
        for plugin_name, hooks in self.plugin_hooks.items():
            if 'WebSocket' in hooks:
                # Apply the plugin's WebSocket actions
                for ws_command, func in hooks['WebSocket'].items():
                    self.ws.actions.update({ws_command: bind(func, self)})
            if 'Escape' in hooks:
                # Apply the plugin's Escape handler
                self.on(
                    "terminal:opt_esc_handler:%s" %
                    plugin_name, bind(hooks['Escape'], self))
            if 'Command' in hooks:
                # Apply the plugin's 'Command' hooks (called by new_multiplex)
                if isinstance(hooks['Command'], (list, tuple)):
                    self.plugin_command_hooks.extend(hooks['Command'])
                else:
                    self.plugin_command_hooks.append(hooks['Command'])
            if 'Multiplex' in hooks:
                # Apply the plugin's Multiplex hooks (called by new_multiplex)
                if isinstance(hooks['Multiplex'], (list, tuple)):
                    self.plugin_new_multiplex_hooks.extend(hooks['Multiplex'])
                else:
                    self.plugin_new_multiplex_hooks.append(hooks['Multiplex'])
            if 'TermInstance' in hooks:
                # Apply the plugin's TermInstance hooks (called by new_terminal)
                if isinstance(hooks['TermInstance'], (list, tuple)):
                    self.plugin_new_term_hooks.extend(hooks['TermInstance'])
                else:
                    self.plugin_new_term_hooks.append(hooks['TermInstance'])
            if 'Environment' in hooks:
                self.plugin_env_hooks.update(hooks['Environment'])
            if 'Events' in hooks:
                for event, callback in hooks['Events'].items():
                    self.on(event, bind(callback, self))

    def open(self):
        """
        This gets called at the end of :meth:`ApplicationWebSocket.open` when
        the WebSocket is opened.
        """
        logging.debug('TerminalApplication.open()')
        self.callback_id = "%s;%s;%s" % (
            self.ws.client_id, self.request.host, self.request.remote_ip)
        self.trigger("terminal:open")

    def authenticate(self):
        """
        This gets called immediately after the user is authenticated
        successfully at the end of :meth:`ApplicationWebSocket.authenticate`.
        Sends all plugin JavaScript files to the client and triggers the
        'terminal:authenticate' event.
        """
        logging.debug('TerminalApplication.authenticate()')
        # Get our user-specific settings/policies for quick reference
        self.policy = applicable_policies(
            'terminal', self.current_user, self.ws.prefs)
        # Start by determining if the user can even login to the terminal app
        if 'allow' in self.policy:
            if not self.policy['allow']:
                # User is not allowed to access the terminal application.  Don't
                # bother sending them any static files and whatnot.
                logging.debug(_(
                    "User is not allowed to use the Terminal application.  "
                    "Skipping post-authentication functions."))
                return
        # Render and send the client our terminal.css
        terminal_css = os.path.join(
            APPLICATION_PATH, 'templates', 'terminal.css')
        self.ws.render_and_send_css(terminal_css)
        # Send the client our JavaScript files
        static_dir = os.path.join(APPLICATION_PATH, 'static')
        js_files = os.listdir(static_dir)
        js_files.sort()
        for fname in js_files:
            if fname.endswith('.js'):
                js_file_path = os.path.join(static_dir, fname)
                if fname == 'terminal.js':
                    self.ws.send_js(js_file_path)
                elif fname == 'terminal_input.js':
                    self.ws.send_js(js_file_path, requires="terminal.js")
                else:
                    self.ws.send_js(js_file_path, requires='terminal_input.js')
        self.ws.send_plugin_static_files(
            os.path.join(APPLICATION_PATH, 'plugins'),
            application="terminal",
            requires="terminal_input.js")
        # Send the client the 256-color style information and our printing CSS
        self.send_256_colors()
        self.send_print_stylesheet()
        sess = SESSIONS[self.ws.session]
        # Create a place to store app-specific stuff related to this session
        # (but not necessarily this 'location')
        if "terminal" not in sess:
            sess['terminal'] = {}
        if "timeout_callbacks" in sess:
            if kill_session not in sess["timeout_callbacks"]:
                sess["timeout_callbacks"].append(kill_session)
        self.terminals() # Tell the client about open terminals
        # NOTE: The user will often be authenticated before terminal.js is
        # loaded.  This means that self.terminals() will be ignored in most
        # cases (only when the connection lost and re-connected without a page
        # reload).  For this reason GateOne.Terminal.init() calls
        # getOpenTerminals().
        self.trigger("terminal:authenticate")

    def on_close(self):
        # Remove all attached callbacks so we're not wasting memory/CPU on
        # disconnected clients
        if not hasattr(self.ws, 'location'):
            return # Connection closed before authentication completed
        session_locs = SESSIONS[self.ws.session]['locations']
        if self.ws.location in session_locs and hasattr(self, 'loc_terms'):
            for term in self.loc_terms:
                if isinstance(term, int):
                    term_obj = self.loc_terms[term]
                    try:
                        multiplex = term_obj['multiplex']
                        multiplex.remove_all_callbacks(self.callback_id)
                        client_dict = term_obj[self.ws.client_id]
                        term_emulator = multiplex.term
                        term_emulator.remove_all_callbacks(self.callback_id)
                        # Remove anything associated with the client_id
                        multiplex.io_loop.remove_timeout(
                            client_dict['refresh_timeout'])
                        del self.loc_terms[term][self.ws.client_id]
                    except (AttributeError, KeyError):
                        # User never completed opening a terminal so
                        # self.callback_id is missing.  Nothing to worry about
                        if self.ws.client_id in term_obj:
                            del term_obj[self.ws.client_id]
        self.trigger("terminal:on_close")

    def enumerate_colors(self):
        """
        Returns a JSON-encoded object containing the installed text color
        schemes.
        """
        colors_path = os.path.join(APPLICATION_PATH, 'templates', 'term_colors')
        colors = os.listdir(colors_path)
        colors = [a.replace('.css', '') for a in colors]
        message = {'terminal:colors_list': {'colors': colors}}
        self.write_message(message)

    def terminals(self):
        """
        Sends a list of the current open terminals to the client using the
        'terminal:get_terminals' WebSocket action.
        """
        logging.debug('terminals()')
        terminals = []
        # Create an application-specific storage space in the locations dict
        if 'terminal' not in self.ws.locations[self.ws.location]:
            self.ws.locations[self.ws.location]['terminal'] = {}
        # Quick reference for our terminals in the current location:
        self.loc_terms = self.ws.locations[self.ws.location]['terminal']
        for term in list(self.loc_terms.keys()):
            if isinstance(term, int): # Only terminals are integers in the dict
                terminals.append(term)
        # Check for any dtach'd terminals we might have missed
        if self.ws.settings['dtach'] and which('dtach'):
            session_dir = self.ws.settings['session_dir']
            session_dir = os.path.join(session_dir, self.ws.session)
            if not os.path.exists(session_dir):
                mkdir_p(session_dir)
                os.chmod(session_dir, 0o770)
            for item in os.listdir(session_dir):
                if item.startswith('dtach_'):
                    split = item.split('_')
                    location = split[1]
                    if location == self.ws.location:
                        term = int(split[2])
                        if term not in terminals:
                            terminals.append(term)
        terminals.sort() # Put them in order so folks don't get confused
        message = {'terminal:terminals': terminals}
        self.write_message(json_encode(message))

    def term_ended(self, term):
        """
        Sends the 'term_ended' message to the client letting it know that the
        given *term* is no more.
        """
        message = {'terminal:term_ended': term}
        if term in self.loc_terms:
            timediff = datetime.now() - self.loc_terms[term]['created']
            if self.race_check:
                race_check_timediff = datetime.now() - self.race_check
                if race_check_timediff < timedelta(seconds=1):
                    # Definitely a race condition (command is failing to run).
                    # Add a delay
                    term_ended = partial(self.term_ended, term)
                    ioloop = tornado.ioloop.IOLoop.instance()
                    ioloop.add_timeout(timedelta(seconds=5), term_ended)
                    self.race_check = False
                    self.ws.send_message(_(
                        "Warning: Terminals are closing too fast.  If you see "
                        "this message multiple times it is likely that the "
                        "configured command is failing to execute.  Please "
                        "check your server settings."
                    ))
                    cmd = self.loc_terms[term]['multiplex'].cmd
                    logging.warning(_(
                        "Terminals are closing too quickly after being opened "
                        "(command: %s).  Please check your 'commands' (usually "
                        "in settings/50terminal.conf)." % repr(cmd)))
                    return
            elif timediff < timedelta(seconds=1):
                # Potential race condition
                # Alow the first one to go through immediately
                self.race_check = datetime.now()
        try:
            self.write_message(json_encode(message))
        except AttributeError:
            # Because this function can be called after a timeout it is possible
            # that the client will have disconnected in the mean time resulting
            # in this exception.  Not a problem; ignore.
            return
        self.trigger("terminal:term_ended", term)

    def add_terminal_callbacks(self, term, multiplex, callback_id):
        """
        Sets up all the callbacks associated with the given *term*, *multiplex*
        instance and *callback_id*.
        """
        refresh = partial(self.refresh_screen, term)
        multiplex.add_callback(multiplex.CALLBACK_UPDATE, refresh, callback_id)
        ended = partial(self.term_ended, term)
        multiplex.add_callback(multiplex.CALLBACK_EXIT, ended, callback_id)
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
            terminal.CALLBACK_OPT, self.opt_esc_handler, callback_id)
        mode_handler = partial(self.mode_handler, term)
        term_emulator.add_callback(
            terminal.CALLBACK_MODE, mode_handler, callback_id)
        reset_term = partial(self.reset_client_terminal, term)
        term_emulator.add_callback(
            terminal.CALLBACK_RESET, reset_term, callback_id)
        dsr = partial(self.dsr, term)
        term_emulator.add_callback(
            terminal.CALLBACK_DSR, dsr, callback_id)
        term_emulator.add_callback(
            terminal.CALLBACK_MESSAGE, self.ws.send_message, callback_id)
        # Call any registered plugin Terminal hooks
        self.trigger(
            "terminal:add_terminal_callbacks", term, multiplex, callback_id)

    def remove_terminal_callbacks(self, multiplex, callback_id):
        """
        Removes all the Multiplex and terminal emulator callbacks attached to
        the given *multiplex* instance and *callback_id*.
        """
        multiplex.remove_callback(multiplex.CALLBACK_UPDATE, callback_id)
        multiplex.remove_callback(multiplex.CALLBACK_EXIT, callback_id)
        term_emulator = multiplex.term
        term_emulator.remove_callback(terminal.CALLBACK_TITLE, callback_id)
        term_emulator.remove_callback(
            terminal.CALLBACK_MESSAGE, callback_id)
        term_emulator.remove_callback(terminal.CALLBACK_DSR, callback_id)
        term_emulator.remove_callback(terminal.CALLBACK_RESET, callback_id)
        term_emulator.remove_callback(terminal.CALLBACK_MODE, callback_id)
        term_emulator.remove_callback(terminal.CALLBACK_OPT, callback_id)
        term_emulator.remove_callback(terminal.CALLBACK_BELL, callback_id)

    def new_multiplex(self,
        cmd, term_id, logging=True, encoding='utf-8', debug=False):
        """
        Returns a new instance of :py:class:`termio.Multiplex` with the proper
        global and client-specific settings.

            * *cmd* - The command to execute inside of Multiplex.
            * *term_id* - The terminal to associate with this Multiplex or a descriptive identifier (it's only used for logging purposes).
            * *logging* - If False, logging will be disabled for this instance of Multiplex (even if it would otherwise be enabled).
            * *encoding* - The default encoding that will be used when reading or writing to the Multiplex instance.
            * *debug* - If True, will enable debugging on the created Multiplex instance.
        """
        policies = applicable_policies(
            'terminal', self.current_user, self.ws.prefs)
        user_dir = self.settings['user_dir']
        try:
            user = self.current_user['upn']
        except:
            # No auth, use ANONYMOUS (% is there to prevent conflicts)
            user = r'ANONYMOUS' # Don't get on this guy's bad side
        session_dir = self.settings['session_dir']
        session_dir = os.path.join(session_dir, self.ws.session)
        log_path = None
        syslog_logging = False
        if logging:
            syslog_logging = policies['syslog_session_logging']
            if policies['session_logging']:
                log_dir = os.path.join(user_dir, user)
                log_dir = os.path.join(log_dir, 'logs')
                # Create the log dir if not already present
                if not os.path.exists(log_dir):
                    mkdir_p(log_dir)
                log_name = datetime.now().strftime('%Y%m%d%H%M%S%f.golog')
                log_path = os.path.join(log_dir, log_name)
        facility = string_to_syslog_facility(self.settings['syslog_facility'])
        # This allows plugins to transform the command however they like
        if self.plugin_command_hooks:
            for func in self.plugin_command_hooks:
                cmd = func(self, cmd)
        m = termio.Multiplex(
            cmd,
            log_path=log_path,
            user=user,
            term_id=term_id,
            debug=debug,
            syslog=syslog_logging,
            syslog_facility=facility,
            syslog_host=self.settings['syslog_host'],
            encoding=encoding
        )
        if self.plugin_new_multiplex_hooks:
            for func in self.plugin_new_multiplex_hooks:
                func(self, m)
        self.trigger("terminal:new_multiplex", m)
        return m

    def highest_term_num(self, location=None):
        """
        Returns the highest terminal number at the given *location* (so we can
        figure out what's next).  If *location* is omitted, uses
        `self.ws.location`.
        """
        if not location:
            location = self.ws.location
        loc = SESSIONS[self.ws.session]['locations'][location]['terminal']
        highest = 0
        for term in list(loc.keys()):
            if isinstance(term, int):
                if term > highest:
                    highest = term
        return highest

    @require(authenticated(), policies('terminal'))
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
            self.current_user['upn'], settings))
        term = int(settings['term'])
        # TODO: Make these specific to each terminal:
        rows = settings['rows']
        cols = settings['cols']
        if rows < 2 or cols < 2: # Something went wrong calculating term size
            # Fall back to a standard default
            rows = 24
            cols = 80
        default_encoding = self.policy.get('default_encoding', 'utf-8')
        encoding = settings.get('encoding', default_encoding)
        # NOTE: 'command' here is actually just the short name of the command.
        #       ...which maps to what's configured the 'commands' part of your
        #       terminal settings.
        if 'command' in settings:
            command = settings['command']
        else:
            try:
                command = self.policy['default_command']
            except KeyError:
                logging.error(_(
                   "You are missing a 'default_command' in your terminal "
                   "settings (usually 50terminal.conf in %s)"
                   % self.ws.settings['settings_dir']))
                return
        # Get the full command
        try:
            full_command = self.policy['commands'][command]
        except KeyError:
            # The given command isn't an option
            logging.error(_("%s: Attempted to execute invalid command (%s)." % (
                self.current_user['upn'], command)))
            self.ws.send_message(_("Terminal: Invalid command: %s" % command))
            return
        if 'em_dimensions' in settings:
            self.em_dimensions = {
                'height': settings['em_dimensions']['h'],
                'width': settings['em_dimensions']['w']
            }
        user_dir = self.settings['user_dir']
        if term not in self.loc_terms:
            # Setup the requisite dict
            self.loc_terms[term] = {
                'last_activity': datetime.now(),
                'title': 'Gate One',
                'manual_title': False,
                # This is needed by the terminal sharing policies:
                'user': self.current_user # So we can determine the owner
            }
        term_obj = self.loc_terms[term]
        if self.ws.client_id not in term_obj:
            term_obj[self.ws.client_id] = {
                # Used by refresh_screen()
                'refresh_timeout': None
            }
        if 'multiplex' not in term_obj:
            # Start up a new terminal
            term_obj['created'] = datetime.now()
            # NOTE: Not doing anything with 'created'...  yet!
            now = int(round(time.time() * 1000))
            try:
                user = self.current_user['upn']
            except:
                # No auth, use ANONYMOUS (% is there to prevent conflicts)
                user = 'ANONYMOUS' # Don't get on this guy's bad side
            cmd = cmd_var_swap(full_command,# Swap out variables like %USER%
                gateone_dir=GATEONE_DIR,
                session=self.ws.session, # with their real-world values.
                session_dir=self.ws.settings['session_dir'],
                session_hash=short_hash(self.ws.session),
                userdir=user_dir,
                user=user,
                time=now
            )
            resumed_dtach = False
            session_dir = self.settings['session_dir']
            session_dir = os.path.join(session_dir, self.ws.session)
            # Create the session dir if not already present
            if not os.path.exists(session_dir):
                mkdir_p(session_dir)
                os.chmod(session_dir, 0o770)
            if self.ws.settings['dtach'] and which('dtach'):
                # Wrap in dtach (love this tool!)
                dtach_path = "{session_dir}/dtach_{location}_{term}".format(
                    session_dir=session_dir,
                    location=self.ws.location,
                    term=term)
                if os.path.exists(dtach_path):
                    # Using 'none' for the refresh because the EVIL termio
                    # likes to manage things like that on his own...
                    cmd = "dtach -a %s -E -z -r none" % dtach_path
                    resumed_dtach = True
                else: # No existing dtach session...  Make a new one
                    cmd = "dtach -c %s -E -z -r none %s" % (dtach_path, cmd)
            logging.debug(_("new_terminal cmd: %s" % cmd))
            m = term_obj['multiplex'] = self.new_multiplex(
                cmd, term, encoding=encoding)
            # Set some environment variables so the programs we execute can use
            # them (very handy).  Allows for "tight integration" and "synergy"!
            env = {
                'GO_DIR': GATEONE_DIR,
                'GO_SETTINGS_DIR': self.ws.settings['settings_dir'],
                'GO_USER_DIR': user_dir,
                'GO_USER': user,
                'GO_TERM': str(term),
                'GO_SESSION': self.ws.session,
                'GO_SESSION_DIR': session_dir
            }
            if self.plugin_env_hooks:
                # This allows plugins to add/override environment variables
                env.update(self.plugin_env_hooks)
            m.spawn(rows, cols, env=env, em_dimensions=self.em_dimensions)
            # Give the terminal emulator a path to store temporary files
            m.term.temppath = os.path.join(session_dir, 'downloads')
            if not os.path.exists(m.term.temppath):
                os.mkdir(m.term.temppath)
            # Tell it how to serve them up (origin ensures correct link)
            m.term.linkpath = "{protocol}://{host}{url_prefix}downloads".format(
                protocol=self.request.protocol,
                host=self.request.host,
                url_prefix=self.settings['url_prefix'])
            # Make sure it can generate pretty icons for file downloads
            m.term.icondir = os.path.join(GATEONE_DIR, 'static', 'icons')
            if resumed_dtach:
                # Send an extra Ctrl-L to refresh the screen and fix the sizing
                # after it has been reattached.
                resize = partial(m.resize, rows, cols, ctrl_l=True,
                                    em_dimensions=self.em_dimensions)
                m.io_loop.add_timeout(
                    timedelta(seconds=2), resize)
        else:
            # Terminal already exists
            m = term_obj['multiplex']
            if m.isalive():
                # It's ALIVE!!!
                m.resize(
                    rows, cols, ctrl_l=False, em_dimensions=self.em_dimensions)
                message = {'terminal:term_exists': term}
                self.write_message(json_encode(message))
                # This resets the screen diff
                m.prev_output[self.ws.client_id] = [None] * rows
                # Remind the client about this terminal's title
                self.set_title(term, force=True)
            else:
                # Tell the client this terminal is no more
                self.term_ended(term)
                return
        # Setup callbacks so that everything gets called when it should
        self.add_terminal_callbacks(
            term, term_obj['multiplex'], self.callback_id)
        # NOTE: refresh_screen will also take care of cleaning things up if
        #       term_obj['multiplex'].isalive() is False
        self.refresh_screen(term, True) # Send a fresh screen to the client
        self.current_term = term
        # Restore expanded modes
        for mode, setting in m.term.expanded_modes.items():
            self.mode_handler(term, mode, setting)
        if self.settings['logging'] == 'debug':
            self.ws.send_message(_(
                "WARNING: Logging is set to DEBUG.  All keystrokes will be "
                "logged!"))
        self.send_term_encoding(term, encoding)
        self.trigger("terminal:new_terminal", term)

    @require(authenticated())
    def set_term_encoding(self, settings):
        """
        Sets the encoding for the given *settings['term']* to
        *settings['encoding']*.
        """
        term = int(settings['term'])
        encoding = settings['encoding']
        try:
            " ".encode(encoding)
        except LookupError:
            # Invalid encoding
            self.ws.send_message(_(
                "Invalid encoding.  For a list of valid encodings see:<br>"
    "<a href='http://docs.python.org/2/library/codecs.html#standard-encodings'"
                " target='new'>Standard Encodings</a>"
            ))
            return
        term_obj = self.loc_terms[term]
        m = term_obj['multiplex']
        m.set_encoding(encoding)
        # Make sure the client is aware that the change was successful

    def send_term_encoding(self, term, encoding):
        """
        Sends a message to the client indicating the *encoding* of *term* (in
        the event that a terminal is reattached or when sharing a terminal).
        """
        message = {'terminal:encoding': {'term': term, 'encoding': encoding}}
        self.write_message(message)

    @require(authenticated())
    def set_term_keyboard_mode(self, settings):
        """
        Sets the keyboard mode (e.g. 'sco') for the given *settings['term']* to
        *settings['mode']*.  This is only so we can inform the client of the
        mode when a terminal is re-attached (the serer-side stuff doesn't use
        keyboard modes).
        """
        valid_modes = ['default', 'sco', 'xterm', 'linux']
        term = int(settings['term'])
        mode = settings['mode']
        if mode not in valid_modes:
            self.ws.send_message(_(
                "Invalid keyboard mode.  Must be one of: %s"
                % ", ".join(valid_modes)))
            return
        term_obj = self.loc_terms[term]
        term_obj['keyboard_mode'] = mode

    def send_term_keyboard_mode(self, term, mode):
        """
        Sends a message to the client indicating the *mode* of *term* (in
        the event that a terminal is reattached or when sharing a terminal).
        """
        message = {'terminal:keyboard_mode': {'term': term, 'mode': mode}}
        self.write_message(message)

    @require(authenticated())
    def move_terminal(self, settings):
        """
        Moves *settings['term']* (terminal number) to
        *SESSIONS[self.ws.session][[settings['location']]['terminal']*.  In
        other words, it moves the given terminal to the given location in the
        *SESSIONS* dict.

        If the given location dict doesn't exist (yet) it will be created.
        """
        logging.debug("move_terminal(%s)" % settings)
        new_location_exists = True
        term = existing_term = int(settings['term'])
        new_location = settings['location']
        session_obj = SESSIONS[self.ws.session]
        existing_term_obj = self.loc_terms[term]
        if new_location not in session_obj:
            term = 1 # Starting anew in the new location
            session_obj['locations'][new_location]['terminal'] = {
                term: existing_term_obj
            }
            new_location_exists = False
        else:
            existing_terms = [
                a for a in session_obj['locations'][
                  new_location]['terminal'].keys()
                    if isinstance(a, int)]
            existing_terms.sort()
            term = existing_terms[-1] + 1
            session_obj['locations'][new_location][
                'terminal'][term] = existing_term_obj
        multiplex = existing_term_obj['multiplex']
        # Remove the existing object's callbacks so we don't end up sending
        # things like screen updates to the wrong place.
        try:
            self.remove_terminal_callbacks(multiplex, self.callback_id)
        except KeyError:
            pass # Already removed callbacks--no biggie
        em_dimensions = {
            'h': multiplex.em_dimensions['height'],
            'w': multiplex.em_dimensions['width']
        }
        if new_location_exists:
            # Already an open window using this 'location'...  Tell it to open
            # a new terminal for the user.
            new_location_instance = None
            for instance in self.instances:
                if instance.location == new_location:
                    new_location_instance = instance
                    break
            new_location_instance.new_terminal({
                'term': term,
                'rows': multiplex.rows,
                'cols': multiplex.cols,
                'em_dimensions': em_dimensions
            })
        #else:
            # Make sure the new location dict is setup properly
            #self.add_terminal_callbacks(term, multiplex, callback_id)
        # Remove old location:
        del self.loc_terms[existing_term]
        details = {
            'term': term,
            'location': new_location
        }
        message = { # Closes the term in the current window/tab
            'terminal:term_moved': details,
        }
        self.write_message(message)
        self.trigger("terminal:move_terminal", details)

    @require(authenticated())
    def kill_terminal(self, term):
        """
        Kills *term* and any associated processes.
        """
        logging.debug("killing terminal: %s" % term)
        term = int(term)
        if term not in self.loc_terms:
            return # Nothing to do
        multiplex = self.loc_terms[term]['multiplex']
        # Remove the EXIT callback so the terminal doesn't restart itself
        multiplex.remove_callback(multiplex.CALLBACK_EXIT, self.callback_id)
        try:
            if self.ws.settings['dtach']: # dtach needs special love
                from utils import kill_dtached_proc
                kill_dtached_proc(self.ws.session, term)
            if multiplex.isalive():
                multiplex.terminate()
        except KeyError:
            pass # The EVIL termio has killed my child!  Wait, that's good...
                    # Because now I don't have to worry about it!
        finally:
            del self.loc_terms[term]
        self.trigger("terminal:kill_terminal", term)

    @require(authenticated())
    def set_terminal(self, term):
        """
        Sets `self.current_term = *term*` so we can determine where to send
        keystrokes.
        """
        try:
            self.current_term = int(term)
            self.trigger("terminal:set_terminal", term)
        except TypeError:
            pass # Bad term given

    def reset_client_terminal(self, term):
        """
        Tells the client to reset the terminal (clear the screen and remove
        scrollback).
        """
        message = {'terminal:reset_client_terminal': term}
        self.write_message(json_encode(message))
        self.trigger("terminal:reset_client_terminal", term)

    @require(authenticated())
    def reset_terminal(self, term):
        """
        Performs the equivalent of the 'reset' command which resets the terminal
        emulator (among other things) to return the terminal to a sane state in
        the event that something went wrong (bad escape sequence).
        """
        logging.debug('reset_terminal(%s)' % term)
        term = int(term)
        # This re-creates all the tabstops:
        tabs = u'\x1bH        ' * 22
        reset_sequence = (
            '\r\x1b[3g        %sr\x1bc\x1b[!p\x1b[?3;4l\x1b[4l\x1b>\r' % tabs)
        multiplex = self.loc_terms[term]['multiplex']
        multiplex.term.write(reset_sequence)
        multiplex.write(u'\x0c') # ctrl-l
        self.full_refresh(term)
        self.trigger("terminal:reset_terminal", term)

    @require(authenticated())
    def set_title(self, term, force=False):
        """
        Sends a message to the client telling it to set the window title of
        *term* to whatever comes out of::

            self.loc_terms[term]['multiplex'].term.get_title() # Whew! Say that three times fast!

        Example message::

            {'set_title': {'term': 1, 'title': "user@host"}}

        If *force* resolves to True the title will be sent to the cleint even if
        it matches the previously-set title.

        .. note:: Why the complexity on something as simple as setting the title?  Many prompts set the title.  This means we'd be sending a 'title' message to the client with nearly every screen update which is a pointless waste of bandwidth if the title hasn't changed.
        """
        logging.debug("set_title(%s, %s)" % (term, force))
        term = int(term)
        term_obj = self.loc_terms[term]
        if term_obj['manual_title']:
            if force:
                title = term_obj['title']
                title_message = {
                    'terminal:set_title': {'term': term, 'title': title}}
                self.write_message(json_encode(title_message))
            return
        title = term_obj['multiplex'].term.get_title()
        # Only send a title update if it actually changed
        if title != term_obj['title'] or force:
            term_obj['title'] = title
            title_message = {
                'terminal:set_title': {'term': term, 'title': title}}
            self.write_message(json_encode(title_message))
        self.trigger("terminal:set_title", title)

    @require(authenticated())
    def manual_title(self, settings):
        """
        Sets the title of *settings['term']* to *settings['title']*.  Differs
        from :func:`set_title` in that this is an action that gets called by the
        client when the user sets a terminal title manually.
        """
        logging.debug("manual_title: %s" % settings)
        term = int(settings['term'])
        title = settings['title']
        term_obj = self.loc_terms[term]
        if not title:
            title = term_obj['multiplex'].term.get_title()
            term_obj['manual_title'] = False
        else:
            term_obj['manual_title'] = True
        term_obj['title'] = title
        title_message = {'terminal:set_title': {'term': term, 'title': title}}
        self.write_message(json_encode(title_message))
        self.trigger("terminal:manual_title", title)

    @require(authenticated())
    def bell(self, term):
        """
        Sends a message to the client indicating that a bell was encountered in
        the given terminal (*term*).  Example message::

            {'bell': {'term': 1}}
        """
        bell_message = {'terminal:bell': {'term': term}}
        self.write_message(json_encode(bell_message))
        self.trigger("terminal:bell", term)

    @require(authenticated())
    def mode_handler(self, term, setting, boolean):
        """
        Handles mode settings that require an action on the client by pasing it
        a message like::

            {
                'terminal:set_mode': {
                    'mode': setting,
                    'bool': True,
                    'term': term
                }
            }
        """
        logging.debug(
            "mode_handler() term: %s, setting: %s, boolean: %s" %
            (term, setting, boolean))
        term_obj = self.loc_terms[term]
        # So we can restore it:
        term_obj['application_mode'] = boolean
        if boolean:
            # Tell client to set this mode
            mode_message = {'terminal:set_mode': {
                'mode': setting,
                'bool': True,
                'term': term
            }}
            self.write_message(json_encode(mode_message))
        else:
            # Tell client to reset this mode
            mode_message = {'terminal:set_mode': {
                'mode': setting,
                'bool': False,
                'term': term
            }}
            self.write_message(json_encode(mode_message))
        self.trigger("terminal:mode_handler", term, setting, boolean)

    def dsr(self, term, response):
        """
        Handles Device Status Report (DSR) calls from the underlying program
        that get caught by the terminal emulator.  *response* is what the
        terminal emulator returns from the CALLBACK_DSR callback.

        .. note:: This also handles the CSI DSR sequence.
        """
        m = self.loc_terms[term]['multiplex']
        m.write(response)

    def _send_refresh(self, term, full=False):
        """Sends a screen update to the client."""
        term_obj = self.loc_terms[term]
        try:
            term_obj['last_activity'] = datetime.now()
        except KeyError:
            # This can happen if the user disconnected in the middle of a screen
            # update.  Nothing to be concerned about.
            return # Ignore
        multiplex = term_obj['multiplex']
        scrollback, screen = multiplex.dump_html(
            full=full, client_id=self.ws.client_id)
        if [a for a in screen if a]: # Checking for non-empty lines here
            output_dict = {
                'terminal:termupdate': {
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
                    _("WebSocket closed (%s)") % self.current_user['upn'])
                multiplex = term_obj['multiplex']
                multiplex.remove_callback( # Stop trying to write
                    multiplex.CALLBACK_UPDATE, self.callback_id)

    @require(authenticated())
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
        term_obj = self.loc_terms[term]
        try:
            msec = timedelta(milliseconds=50) # Keeps things smooth
            # In testing, 150 milliseconds was about as low as I could go and
            # still remain practical.
            force_refresh_threshold = timedelta(milliseconds=150)
            last_activity = term_obj['last_activity']
            timediff = datetime.now() - last_activity
            # Because users can be connected to their session from more than one
            # browser/computer we differentiate between refresh timeouts by
            # tying the timeout to the client_id.
            client_dict = term_obj[self.ws.client_id]
            multiplex = term_obj['multiplex']
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
        self.trigger("terminal:refresh_screen", term)

    @require(authenticated())
    def full_refresh(self, term):
        """Calls `self.refresh_screen(*term*, full=True)`"""
        try:
            term = int(term)
        except ValueError:
            logging.debug(_(
                "Invalid terminal number given to full_refresh(): %s" % term))
        self.refresh_screen(term, full=True)
        self.trigger("terminal:full_refresh", term)

    @require(authenticated(), policies('terminal'))
    def resize(self, resize_obj):
        """
        Resize the terminal window to the rows/cols specified in *resize_obj*

        Example *resize_obj*::

            {'rows': 24, 'cols': 80}
        """
        logging.debug("resize(%s)" % repr(resize_obj))
        term = None
        if 'term' in resize_obj:
            try:
                term = int(resize_obj['term'])
            except ValueError:
                return # Got bad value, skip this resize
        rows = resize_obj['rows']
        cols = resize_obj['cols']
        self.em_dimensions = {
            'height': resize_obj['em_dimensions']['h'],
            'width': resize_obj['em_dimensions']['w']
        }
        ctrl_l = False
        if 'ctrl_l' in resize_obj:
            ctrl_l = resize_obj['ctrl_l']
        if rows < 2 or cols < 2:
            # Fall back to a standard default:
            rows = 24
            cols = 80
        # If the user already has a running session, set the new terminal size:
        try:
            if term:
                m = self.loc_terms[term]['multiplex']
                m.resize(
                    rows,
                    cols,
                    self.em_dimensions,
                    ctrl_l=ctrl_l
                )
            else: # Resize them all
                for term in list(self.loc_terms.keys()):
                    if isinstance(term, int): # Skip the TidyThread
                        self.loc_terms[term]['multiplex'].resize(
                            rows,
                            cols,
                            self.em_dimensions
                        )
        except KeyError: # Session doesn't exist yet, no biggie
            pass
        self.trigger("terminal:resize", term)

    @require(authenticated(), policies('terminal'))
    def char_handler(self, chars, term=None):
        """
        Writes *chars* (string) to *term*.  If *term* is not provided the
        characters will be sent to the currently-selected terminal.
        """
        logging.debug("char_handler(%s, %s)" % (repr(chars), repr(term)))
        if not term:
            term = self.current_term
        term = int(term) # Just in case it was sent as a string
        if self.ws.session in SESSIONS and term in self.loc_terms:
            multiplex = self.loc_terms[term]['multiplex']
            if multiplex.isalive():
                multiplex.write(chars)
                # Handle (gracefully) the situation where a capture is stopped
                if u'\x03' in chars:
                    if not multiplex.term.capture:
                        return # Nothing to do
                    # Make sure the call to abort_capture() comes *after* the
                    # underlying program has itself caught the SIGINT (Ctrl-C)
                    multiplex.io_loop.add_timeout(
                        timedelta(milliseconds=1000),
                        multiplex.term.abort_capture)
                    # Also make sure the client gets a screen update
                    refresh = partial(self.refresh_screen, term)
                    multiplex.io_loop.add_timeout(
                        timedelta(milliseconds=1050), refresh)

    @require(authenticated(), policies('terminal'))
    def write_chars(self, message):
        """
        Writes *message['chars']* to *message['term']*.  If *message['term']*
        is not present, *self.current_term* will be used.
        """
        #logging.debug('write_chars(%s)' % message)
        if 'chars' not in message:
            return # Invalid message
        if 'term' not in message:
            message['term'] = self.current_term
        try:
            self.char_handler(message['chars'], message['term'])
        except Exception as e:
            # Term is closed or invalid
            logging.error(_(
                "Got exception trying to write_chars() to terminal %s"
                % message['term']))
            logging.error(str(e))
            import traceback
            traceback.print_exc(file=sys.stdout)

    @require(authenticated())
    def opt_esc_handler(self, chars):
        """
        Calls whatever function is attached to the
        'terminal:opt_esc_handler:<name>' event; passing it the *text* (second
        item in the tuple) that is returned by
        :func:`utils.process_opt_esc_sequence`.  Such functions are usually
        attached via the 'Escape' plugin hook but may also be registered via
        the usual event method, :meth`self.on`::

            self.on('terminal:opt_esc_handler:somename', some_function)

        The above example would result in :func:`some_function` being called
        whenever a matching optional escape sequence handler is encountered.
        For example:

        .. ansi-block::

            $ echo -e "\033[_;somename|Text passed to some_function()\007"

        Which would result in :func:`some_function` being called like so::

            some_function(self, "Text passed to some_function()")
        """
        logging.debug("opt_esc_handler(%s)" % repr(chars))
        plugin_name, text = process_opt_esc_sequence(chars)
        if plugin_name:
            try:
                self.trigger(
                    "terminal:opt_esc_handler:%s" % plugin_name, text)
            except Exception as e:
                logging.error(_(
                    "Got exception trying to execute plugin's optional ESC "
                    "sequence handler..."))
                logging.error(str(e))

    def get_bell(self):
        """
        Sends the bell sound data to the client in in the form of a data::URI.
        """
        bell_path = os.path.join(APPLICATION_PATH, 'static')
        bell_path = os.path.join(bell_path, 'bell.ogg')
        fallback_path = os.path.join(APPLICATION_PATH, 'fallback_bell.txt')
        if os.path.exists(bell_path):
            try:
                bell_data_uri = create_data_uri(bell_path)
            except MimeTypeFail:
                fallback_bell = open(fallback_path).read()
                bell_data_uri = fallback_bell
        else: # There's always the fallback
            fallback_bell = open(fallback_path).read()
            bell_data_uri = fallback_bell
        mimetype = bell_data_uri.split(';')[0].split(':')[1]
        message = {
            'terminal:load_bell': {
                'data_uri': bell_data_uri, 'mimetype': mimetype
            }
        }
        self.write_message(json_encode(message))

    def get_webworker(self):
        """
        Sends the text of our term_ww.js to the client in order to get
        around the limitations of loading remote Web Worker URLs (for embedding
        Gate One into other apps).
        """
        static_url = os.path.join(APPLICATION_PATH, "static")
        webworker_path = os.path.join(static_url, 'webworkers', 'term_ww.js')
        with open(webworker_path) as f:
            go_process = f.read()
        message = {'terminal:load_webworker': go_process}
        self.write_message(json_encode(message))

    def get_colors(self, settings):
        """
        Sends the text color stylesheet matching the properties specified in
        *settings* to the client.  *settings* must contain the following:

            * **container** - The element Gate One resides in (e.g. 'gateone')
            * **prefix** - The string being used to prefix all elements (e.g. 'go\_')
            * **colors** - The name of the CSS text color scheme to be retrieved.
        """
        logging.debug('get_colors(%s)' % settings)
        send_css = self.ws.prefs['*']['gateone'].get('send_css', True)
        if not send_css:
            if not hasattr('logged_css_message', self):
                logging.info(_(
                    "send_css is false; will not send JavaScript."))
            # So we don't repeat this message a zillion times in the logs:
            self.logged_css_message = True
            return
        templates_path = os.path.join(APPLICATION_PATH, 'templates')
        term_colors_path = os.path.join(templates_path, 'term_colors')
        #printing_path = os.path.join(templates_path, 'printing')
        go_url = settings['go_url'] # Used to prefix the url_prefix
        if not go_url.endswith('/'):
            go_url += '/'
        container = settings["container"]
        prefix = settings["prefix"]
        colors = settings["colors"]
        template_args = dict(
            container=container,
            prefix=prefix,
            url_prefix=go_url
        )
        out_dict = {'files': []}
        colors_filename = "%s.css" % colors
        colors_path = os.path.join(term_colors_path, colors_filename)
        rendered_path = self.ws.render_style(colors_path, **template_args)
        filename = "term_colors.css" # Make sure it's the same every time
        mtime = os.stat(rendered_path).st_mtime
        kind = 'css'
        out_dict['files'].append({
            'filename': filename,
            'mtime': mtime,
            'kind': kind,
            'element_id': 'text_colors' # To ensure the filename isn't used
        })
        self.ws.file_cache[filename] = {
            'filename': filename,
            'kind': kind,
            'path': rendered_path,
            'mtime': mtime,
            'element_id': 'text_colors'
        }
        message = {'go:file_sync': out_dict}
        self.write_message(message)

    @require(authenticated(), policies('terminal'))
    def get_locations(self):
        """
        Attached to the "terminal:get_locations" WebSocket action.  Sends a
        message to the client listing all 'locations' where terminals reside.

        .. note::

            Typically the location mechanism is used to open terminals in
            different windows/tabs.
        """
        term_locations = {}
        session = self.ws.session
        for location, obj in SESSIONS[session]['locations'].items:
            terms = location.get('terminal', [])
            term_locations[location] = terms
        message = {'terminal:term_locations': term_locations}
        self.write_message(json_encode(message))
        self.trigger("terminal:term_locations", term_locations)

# Terminal sharing TODO (not in any particular order or priority):
#   * GUI elements that allow a user to share a terminal:
#       - Share this terminal:
#           > Allow anyone with the right URL to view (requires authorization-on-connect).
#           > Allow only authenticated users.
#           > Allow only specified users.
#       - Sharing controls widget (pause/resume sharing, primarily).
#       - Chat widget (or similar--maybe with audio/video via WebRTC).
#       - A mechanism to invite people (send an email/alert).
#       - A mechanism to approve inbound viewers.
#   * A server-side API to control sharing:
#       DONE (mostly)   - Share X with authorization options (allow anon w/URL and/or password, authenticated users, or a specific list)
#       DONE            - Stop sharing terminal X.
#       - Pause sharing of terminal X (So it can be resumed without having to change the viewers/write list).
#       - Generate sharing URL for terminal X.
#       - Send invitation to view terminal X.  Connected user(s), email, and possibly other mechanisms (Jabber/Google Talk, SMS, etc)
#       - Approve inbound viewer.
#       DONE            - Allow viewer(s) to control terminal X.
#       - A completely separate chat/communications API.
#       DONE            - List shared terminals.
#       DONE            - Must integrate policy support for @require(policies('terminal'))
#   * A client-side API to control sharing:
#       - Notify user of connected viewers.
#       - Notify user of access/control grants.
#       - Control playback history via server-side events (in case a viewer wants to point something out that just happened).
#   * A RequestHandler to handle anonymous connections to shared terminals.  Needs to serve up something specific (not index.html)
#   * A mechanism to generate anonymous sharing URLs.
#   * A way for users to communicate with each other (chat, audio, video).
#   * A mechansim for password-protecting shared terminals.
#   * Logic to detect the optimum terminal size for all viewers.
#   * A data structure of some sort to keep track of shared terminals and who is currently connected to them.
#   * A way to view multiple shared terminals on a single page with the option to break them out into individual windows/tabs.
    @require(authenticated(), policies('terminal'))
    def share_terminal(self, settings):
        """
        Shares the given *settings['term']* using the given *settings*.  The
        *settings* dict **must** contain the following::

            {
                'term': <terminal number>,
                'read': <"ANONYMOUS", "AUTHENTICATED", a user.attr regex like "user.email=.*@liftoffsoftware.com" or a list thereof>,
            }

        Optionally, the *settings* dict may also contain the following::

            {
                'broadcast': <True/False>,
                'password': <string>,
                'write': <"ANONYMOUS", "AUTHENTICATED", a user.attr regex like "user.email=.*@liftoffsoftware.com", or a list thereof>
                # If "write" is omitted the terminal will be shared read-only until write access is granted (on demand)
            }

        If *broadcast* is True, anyone will be able to connect to the shared
        terminal without a password.

        If a *password* is provided, the given password will be required before
        users may connect to the shared terminal.

        Example WebSocket command to share a terminal:

        .. code-block:: javascript

            settings = {
                "term": 1,
                "read": "AUTHENTICATED",
                "password": "foo" // Omit if no password is required
            }
            GateOne.ws.send(JSON.stringify({"terminal:share_terminal": settings}));

        .. note::

            If the server is configured with `auth="none"` and
            *settings['read']* is "AUTHENTICATED" all users will be able to view
            the shared terminal without having to enter a password.
        """
        logging.debug("share_terminal(%s)" % settings)
        from utils import generate_session_id
        out_dict = {'result': 'Success'}
        share_dict = {}
        term = settings.get('term', self.current_term)
        if 'shared' not in self.ws.persist['terminal']:
            self.ws.persist['terminal']['shared'] = {}
        shared_terms = self.ws.persist['terminal']['shared']
        term_obj = self.loc_terms[term]
        read = settings.get('read', 'ANONYMOUS') # List of who to share with
        #write = settings.get('write', list()) # List of who can write
        # "broadcast" mode allows anonymous access without a password
        broadcast = settings.get('broadcast', False)
        # ANONYMOUS (auto-gen URL), user.attr=(regex), and "AUTHENTICATED"
        out_dict.update({
            'term': term,
            'read': read,
            'broadcast': broadcast
        })
        share_dict.update({
            'user': self.current_user,
            'term': term,
            'term_obj': term_obj,
            'read': read,
            'write': [], # Populated on-demand by the sharing user
            'broadcast': broadcast
        })
        password = settings.get('password', False)
        if read == 'ANONYMOUS':
            if not broadcast:
                # This situation *requires* a password
                password = settings.get('password', generate_session_id()[:8])
        out_dict['password'] = password
        share_dict['password'] = password
        url_prefix = self.ws.settings['url_prefix']
        for share_id, val in shared_terms.items():
            if val['term_obj'] == term_obj:
                if share_dict['read'] != shared_terms[share_id]['read']:
                    # User is merely changing the permissions
                    shared_terms[share_id]['read'] = share_dict['read']
                    return
                if share_dict['write'] != shared_terms[share_id]['write']:
                    # User is merely changing the permissions
                    shared_terms[share_id]['write'] = share_dict['write']
                    return
                self.ws.send_message(_("This terminal is already shared."))
                return
        share_id = generate_session_id()
        url = "%sterminal/shared/%s" % (url_prefix, share_id)
        share_dict['url'] = url
        out_dict['url'] = url
        out_dict['share_id'] = share_id
        shared_terms[share_id] = share_dict
        term_obj['share_id'] = share_id # So we can quickly tell it's shared
        # Make a note of this shared terminal in the logs
        logging.info(_(
            "%s shared terminal %s (%s)" % (
                self.current_user['upn'], term, term_obj['title'])))
        message = {'terminal:term_shared': out_dict}
        self.write_message(json_encode(message))
        self.trigger("terminal:share_terminal", settings)

    @require(authenticated(), policies('terminal'))
    def unshare_terminal(self, term):
        """
        Stops sharing the given *term*.  Example JavaScript:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({"terminal:unshare_terminal": 1}));
        """
        out_dict = {'result': 'Success'}
        term_obj = self.loc_terms[term]
        shared_terms = self.ws.persist['terminal']['shared']
        message = {'terminal:unshared_terminal': out_dict}
        self.write_message(json_encode(message))
        # TODO: Write logic here that kills the terminal of each viewer and sends them a message indicating that the sharing has ended.
        message = {'terminal:term_ended': term}
        # TODO: Per the above TODO, this needs to be changed to notify each user:
        self.ws.send_message(message, upn=self.current_user['upn'])
        for share_id, share_dict in shared_terms.items():
            if share_dict['term_obj'] == term_obj:
                del shared_terms[share_id]
                break
        del term_obj['share_id']
        self.trigger("terminal:unshare_terminal", term)

    @require(authenticated(), policies('terminal'))
    def set_sharing_permissions(self, settings):
        """
        Sets the sharing permissions on the given *settings['term']*.  Requires
        *settings['read']* and/or *settings['write']*.  Example JavaScript:

        .. code-block:: javascript

            settings = {
                "term": 1,
                "read": "AUTHENTICATED",
                "write": ['bob@somehost', 'joe@somehost']
            }
            GateOne.ws.send(JSON.stringify({"terminal:set_sharing_permissions": settings}));
        """
        if 'shared' not in self.ws.persist['terminal']:
            error_msg = _("Error: Invalid share ID.")
            self.ws.send_message(error_msg)
            return
        out_dict = {'result': 'Success'}
        term = settings['term']
        term_obj = self.loc_terms[term]
        shared_terms = self.ws.persist['terminal']['shared']
        for share_id, share_dict in shared_terms.items():
            if share_dict['term_obj'] == term_obj:
                if 'read' in settings:
                    share_dict['read'] = settings['read']
                if 'write' in settings:
                    share_dict['write'] = settings['write']
                break
        # TODO: Put some logic here that notifies users if their permissions changed.
        message = {'terminal:sharing_permissions': out_dict}
        self.write_message(json_encode(message))
        self.trigger("terminal:set_sharing_permissions", settings)

    @require(authenticated(), policies('terminal'))
    def share_user_list(self, share_id):
        """
        Sends the client a dict of users that are currently viewing the terminal
        associated with *share_id* using the 'terminal:share_user_list'
        WebSocket action.  The output will indicate which users have write
        access.  Example JavaScript:

        .. code-block:: javascript

            var shareID = "YzUxNzNkNjliMDQ4NDU21DliM3EwZTAwODVhNGY5MjNhM";
            GateOne.ws.send(JSON.stringify({"terminal:share_user_list": shareID}));
        """
        out_dict = {'viewers': [], 'write': []}
        message = {'terminal:share_user_list': out_dict}
        try:
            share_obj = self.ws.persist['terminal']['shared'][share_id]
        except KeyError:
            error_msg = _("No terminal associated with the given share_id.")
            message = {'go:notice': error_msg}
            self.write_message(message)
            return
        if 'viewers' in share_obj:
            for user in share_obj['viewers']:
                # Only let the client know about the UPN and IP Address
                out_dict['viewers'].append({
                    'upn': user['upn'],
                    'ip_address': user['ip_address']
                })
        if isinstance(share_obj['write'], list):
            for allowed in share_obj['write']:
                out_dict['write'].append(allowed)
        else:
            out_dict['write'] = share_obj['write']
        self.write_message(message)
        self.trigger("terminal:share_user_list", share_id)

    @require(authenticated(), policies('terminal'))
    def list_shared_terminals(self):
        """
        Returns a message to the client listing all the shared terminals they
        may access.  Example JavaScript:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({"terminal:list_shared_terminals": null}));
        """
        out_dict = {'terminals': {}, 'result': 'Success'}
        shared_terms = self.ws.persist['terminal'].get('shared', {})
        for share_id, share_dict in shared_terms.items():
            if share_dict['read'] in ['AUTHENTICATED', 'ANONYMOUS']:
                password = share_dict.get('password', False)
                if password: # This would be a string
                    password = True # Don't want to reveal it to the client!
                broadcast = share_dict.get('broadcast', False)
                out_dict['terminals'][share_id] = {
                    'upn': share_dict['user']['upn'],
                    'broadcast': broadcast
                }
                out_dict['terminals'][share_id]['password_required'] = password
        message = {'terminal:shared_terminals': out_dict}
        self.write_message(json_encode(message))
        self.trigger("terminal:list_shared_terminals")

    def attach_shared_terminal(self, settings):
        """
        Attaches callbacks for the terminals associated with
        *settings['share_id']* if the user is authorized to view the share or if
        the given *settings['password']* is correct (if shared anonymously).

        To attach to a shared terminal from the client:

        .. code-block:: javascript

            settings = {
                "share_id": "ZWVjNGRiZTA0OTllNDJiODkwOGZjNDA2ZWNkNGU4Y2UwM",
                "password": "password here" // This line is only necessary if the shared terminal requires a password
            }
            GateOne.ws.send(JSON.stringify({"terminal:attach_shared_terminal": settings}));
        """
        logging.debug("attach_shared_terminal(%s)" % settings)
        shared_terms = self.ws.persist['terminal']['shared']
        if 'share_id' not in settings:
            logging.error(_("Invalid share_id."))
            return
        password = settings.get('password', None)
        share_obj = None
        for share_id, share_dict in shared_terms.items():
            if share_id == settings['share_id']:
                share_obj = share_dict
                break # This is the share_dict we want
        if not share_obj:
            self.ws.send_message(_("Requested shared terminal does not exist."))
            return
        if share_obj['password'] and password != share_obj['password']:
            self.ws.send_message(_("Invalid password."))
            return
        term = self.highest_term_num() + 1
        term_obj = share_obj['term_obj']
        # Add this terminal to our existing SESSION
        self.loc_terms[term] = term_obj
        # We're basically making a new terminal for this client that happens to
        # have been started by someone else.
        multiplex = term_obj['multiplex']
        if self.ws.client_id not in term_obj:
            term_obj[self.ws.client_id] = {
                # Used by refresh_screen()
                'refresh_timeout': None
            }
        if multiplex.isalive():
            message = {'terminal:term_exists': term}
            self.write_message(json_encode(message))
            # This resets the screen diff
            multiplex.prev_output[self.ws.client_id] = [
                None for a in range(multiplex.rows-1)]
            # Remind the client about this terminal's title
            self.set_title(term, force=True)
        # Setup callbacks so that everything gets called when it should
        self.add_terminal_callbacks(
            term, term_obj['multiplex'], self.callback_id)
        # NOTE: refresh_screen will also take care of cleaning things up if
        #       term_obj['multiplex'].isalive() is False
        self.refresh_screen(term, True) # Send a fresh screen to the client
        self.current_term = term
        # Restore expanded modes
        for mode, setting in multiplex.term.expanded_modes.items():
            self.mode_handler(term, mode, setting)
        # Tell the client about this terminal's title
        self.set_title(term, force=True)
        # Make a note of this connection in the logs
        logging.info(_(
            "%s connected to terminal shared by %s " % (
            self.current_user['upn'], term_obj['user']['upn'])))
        # Add this user to the list of viewers
        if 'viewers' not in share_obj:
            share_obj['viewers'] = [self.current_user]
        else:
            share_obj['viewers'].append(self.current_user)
        # Notify the owner of the terminal that this user is now viewing
        message = _("%s (%s) is now viewing terminal %s" % (
            self.current_user['upn'],
            term_obj['user']['ip_address'],
            share_obj['term']))
        # TODO: Use something more specific to sharing than send_message().  Preferably something that opens up a widget that can also display which user is typing.
        if self.current_user['upn'] == 'ANONYMOUS':
            self.ws.send_message(message, session=term_obj['user']['session'])
        else:
            self.ws.send_message(message, upn=term_obj['user']['upn'])
        self.trigger("terminal:attach_shared_terminal", term)

    def render_256_colors(self):
        """
        Renders the CSS for 256 color support and saves the result as
        '256_colors.css' in Gate One's configured `cache_dir`.  If that file
        already exists and has not been modified since the last time it was
        generated rendering will be skipped.

        Returns the path to that file as a string.
        """
        # NOTE:  Why generate this every time?  Presumably these colors can be
        #        changed on-the-fly by terminal programs.  That functionality
        #        has yet to be implemented but this function will enable use to
        #        eventually do that.
        # Use the get_settings() function to import our 256 colors (convenient)
        cache_dir = self.ws.settings['cache_dir']
        cached_256_colors = os.path.join(cache_dir, '256_colors.css')
        if os.path.exists(cached_256_colors):
            return cached_256_colors
        colors_json_path = os.path.join(APPLICATION_PATH, '256colors.json')
        color_map = get_settings(colors_json_path, add_default=False)
        # Setup our 256-color support CSS:
        colors_256 = ""
        for i in xrange(256):
            i = str(i)
            fg = u"#%s span.✈fx%s {color: #%s;}" % (
                self.ws.container, i, color_map[i])
            bg = u"#%s span.✈bx%s {background-color: #%s;} " % (
                self.ws.container, i, color_map[i])
            fg_rev =(
                u"#%s span.✈reverse.fx%s {background-color: #%s; color: "
                u"inherit;}" % (self.ws.container, i, color_map[i]))
            bg_rev =(
                u"#%s span.✈reverse.bx%s {color: #%s; background-color: "
                u"inherit;} " % (self.ws.container, i, color_map[i]))
            colors_256 += "%s %s %s %s\n" % (fg, bg, fg_rev, bg_rev)
        with io.open(cached_256_colors, 'w', encoding="utf-8") as f:
            f.write(colors_256)
        # send_css() will take care of minifiying and caching further
        return cached_256_colors

    def send_256_colors(self):
        """
        Sends the client the CSS to handle 256 color support.
        """
        self.ws.send_css(self.render_256_colors())

    def send_print_stylesheet(self):
        """
        Sends the 'templates/printing/default.css' stylesheet to the client
        using `ApplicationWebSocket.ws.send_css` with the "media" set to
        "print".
        """
        print_css_path = os.path.join(
            APPLICATION_PATH, 'templates', 'printing', 'default.css')
        self.ws.send_css(
            print_css_path, element_id="terminal_print_css", media="print")

    @require(authenticated())
    def debug_terminal(self, term):
        """
        Prints the terminal's screen and renditions to stdout so they can be
        examined more closely.

        .. note:: Can only be called from a JavaScript console like so...

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({'terminal:debug_terminal': *term*}));
        """
        m = self.loc_terms[term]['multiplex']
        term_obj = m.term
        screen = term_obj.screen
        renditions = term_obj.renditions
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
        try:
            from pympler import asizeof
            print("screen size: %s" % asizeof.asizeof(screen))
            print("renditions size: %s" % asizeof.asizeof(renditions))
            print("Total term object size: %s" % asizeof.asizeof(term_obj))
        except ImportError:
            pass # No biggie

def init(settings):
    """
    Checks to make sure 50terminal.conf is created if terminal-specific settings
    are not found in the settings directory.
    """
    if os.path.exists(options.config):
        # Get the old settings from the old config file and use them to generate
        # a new 50terminal.conf
        terminal_options = [ # These are now terminal-app-specific setttings
            'command', 'dtach', 'session_logging', 'session_logs_max_age',
            'syslog_session_logging'
        ]
        if 'terminal' not in settings['*']:
            settings['*']['terminal'] = {}
        with open(options.config) as f:
            for line in f:
                if line.startswith('#'):
                    continue
                key = line.split('=', 1)[0].strip()
                value = eval(line.split('=', 1)[1].strip())
                if key not in terminal_options:
                    continue
                if key == 'command':
                    # Fix the path to ssh_connect.py if present
                    if 'ssh_connect.py' in value:
                        value = value.replace(
                            '/plugins/', '/applications/terminal/plugins/')
                    # Also fix the path to the known_hosts file
                    if '/ssh/known_hosts' in value:
                        value = value.replace(
                            '/ssh/known_hosts', '/.ssh/known_hosts')
                    key = 'commands' # Convert to new name
                    value = {'SSH': value}
                settings['*']['terminal'].update({key: value})
    if 'terminal' not in settings['*']:
        # Create some defaults and save the config as 50terminal.conf
        settings_path = options.settings_dir
        terminal_conf_path = os.path.join(settings_path, '50terminal.conf')
        if not os.path.exists(terminal_conf_path):
            from utils import settings_template
            # TODO: Think about moving 50terminal.conf template into the
            # terminal application's directory.
            template_path = os.path.join(
                GATEONE_DIR, 'templates', 'settings', '50terminal.conf')
            settings['*']['terminal'] = {}
            # Update the settings with defaults
            default_command = (
              GATEONE_DIR +
              "/applications/terminal/plugins/ssh/scripts/ssh_connect.py -S "
              r"'%SESSION_DIR%/%SESSION%/%SHORT_SOCKET%' --sshfp "
              r"-a '-oUserKnownHostsFile=\"%USERDIR%/%USER%/.ssh/known_hosts\"'"
            )
            settings['*']['terminal'].update({
                'dtach': True,
                'session_logging': True,
                'session_logs_max_age': "30d",
                'syslog_session_logging': False,
                'commands': {
                    'SSH': default_command
                },
                'default_command': 'SSH'
            })
            new_term_settings = settings_template(
                template_path, settings=settings['*']['terminal'])
            with open(terminal_conf_path, 'w') as s:
                s.write(_(
                    "// This is Gate One's Terminal application settings "
                    "file.\n"))
                s.write(new_term_settings)
    term_settings = settings['*']['terminal']
    if options.kill:
        from utils import killall
        go_settings = settings['*']['gateone']
        # Kill all running dtach sessions (associated with Gate One anyway)
        killall(go_settings['session_dir'], go_settings['pid_file'])
        # Cleanup the session_dir (it is supposed to only contain temp stuff)
        import shutil
        shutil.rmtree(go_settings['session_dir'], ignore_errors=True)
        sys.exit(0)
    if not which('dtach'):
        logging.warning(
            _("dtach command not found.  dtach support has been disabled."))
    # Fix the path to known_hosts if using the old default command
    for name, command in term_settings['commands'].items():
        if '\"%USERDIR%/%USER%/ssh/known_hosts\"' in command:
            logging.warning(_(
                "The default path to known_hosts has been changed.  Please "
                "update your settings to use '/.ssh/known_hosts' instead of "
                "'/ssh/known_hosts'.  Applying a termporary fix..."))
            term_settings['commands'][name] = command.replace('/ssh/', '/.ssh/')
    # Initialize plugins so we can add their 'Web' handlers
    enabled_plugins = settings['*']['terminal'].get('enabled_plugins', [])
    plugins_path = os.path.join(APPLICATION_PATH, 'plugins')
    plugins = get_plugins(plugins_path, enabled_plugins)
    # Attach plugin hooks
    plugin_hooks = {}
    imported = load_modules(plugins['py'])
    for plugin in imported:
        try:
            plugin_hooks.update({plugin.__name__: plugin.hooks})
        except AttributeError:
            pass # No hooks, no problem
    # Add static handlers for all the JS plugins (primarily for source maps)
    url_prefix = settings['*']['gateone']['url_prefix']
    plugin_dirs = os.listdir(plugins_path)
    # Remove anything that isn't a directory (just in case)
    plugin_dirs = [
        a for a in plugin_dirs
            if os.path.isdir(os.path.join(plugins_path, a))
    ]
    if not enabled_plugins: # Use all of them
        enabled_plugins = plugin_dirs
    for plugin_name in enabled_plugins:
        plugin_static_url = r"{prefix}terminal/{name}/static/(.*)".format(
            prefix=url_prefix, name=plugin_name)
        static_path = os.path.join(
            APPLICATION_PATH, 'plugins', plugin_name, 'static')
        if os.path.exists(static_path):
            handler = (
                plugin_static_url, StaticHandler, {"path": static_path})
            if handler not in REGISTERED_HANDLERS:
                REGISTERED_HANDLERS.append(handler)
                web_handlers.append(handler)
    # Hook up the 'Web' handlers so those URLs are immediately available
    for hooks in plugin_hooks.values():
        if 'Web' in hooks:
            for handler in hooks['Web']:
                if handler in REGISTERED_HANDLERS:
                    continue # Already registered this one
                else:
                    REGISTERED_HANDLERS.append(handler)
                    web_handlers.append(handler)


# Tell Gate One which classes are applications
apps = [TerminalApplication]
# Tell Gate One about our terminal-specific static file handler
web_handlers.append((
    r'terminal/static/(.*)',
    TermStaticFiles,
    {"path": os.path.join(APPLICATION_PATH, 'static')}
))
