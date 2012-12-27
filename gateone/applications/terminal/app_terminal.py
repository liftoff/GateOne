# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
app_terminal.py - A Gate One "application" that provides a terminal emulator.

Hooks
-----
This application implements the following hooks::

    hooks = {
        'WebSocket': {
            'example_action': example_websocket_action
        }
    }

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
import os, logging, time
from datetime import datetime, timedelta
from functools import partial

# Gate One imports
import termio
from gateone import GATEONE_DIR, BaseHandler, GOApplication
from auth import require, authenticated, applicable_policies
from utils import cmd_var_swap, RUDict, json_encode, get_settings, short_hash
from utils import mkdir_p, string_to_syslog_facility, get_plugins, load_modules
from utils import process_opt_esc_sequence, bind, MimeTypeFail, create_data_uri

# 3rd party imports
from tornado.escape import json_decode

# Globals
SESSIONS = {} # This will get replaced with gateone.py's SESSIONS dict
# This is in case we have relative imports, templates, or whatever:
APPLICATION_PATH = os.path.split(__file__)[0] # Path to our application
REGISTERED_HANDLERS = [] # So we don't accidentally re-add handlers
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

def policy_new_terminal(instance, function):
    """
    Called by :func:`terminal_policies`, returns True if the user is authorized
    to execute :func:`new_terminal`.  Specifically, checks to make sure the user
    is not in violation of their applicable 'max_terms' policy.
    """
    policies = applicable_policies('terminal', user, instance.policies)
    if not hasattr(instance, 'open_terminals'):
        # Make an attribute we can use to count open terminals
        instance.open_terminals = 0
    # Start by determining the limits
    max_terms = 0 # No limit
    if 'max_terms' in policies:
        max_terms = policies['max_terms']
    if max_terms:
        if instance.open_terminals >= max_terms:
            return False
    instance.open_terminals += 1
    return True

def terminal_policies(instance, function):
    """
    This function gets registered under 'terminal' in the
    :attr:`GOApplication.security` dict and is called by the :func:`require`
    decorator by way of the :class:`policies` sub-function. It returns True or
    False depending on what is defined in security.conf and what function is
    being called.

    This function will keep track of and place limmits on the following:

        * The number of open terminals.
        * The number of shared terminals.
        * How many users are connected to a shared terminal.
        * How many locations a user is currently using.
        * The number of terminals in each location.

    If no 'terminal' policies are defined this function will always return True.
    """
    policy_functions = {
        'new_terminal': policy_new_terminal
    }
    user = instance.current_user
    policies = applicable_policies('terminal', user, instance.policies)
    if not policies: # Empty RUDict
        return True # A world without limits!
    # Start by determining if the user can even login to the terminal app
    if 'allow' in policies:
        if not policies['allow']:
            logging.error(_(
                "%s denied access to the Terminal application by policy."
                % user['upn']))
            return False
    if function.__name__ in policy_functions:
        return policy_functions[function.__name__](instance, function)
    return True # Default to permissive if we made it this far

class TerminalApplication(GOApplication):
    def initialize(self):
        """
        Called when the WebSocket is instantiated, sets up our WebSocket
        actions, security policies, and sets up all of our plugin hooks/events.
        """
        # Register our security policy function
        self.ws.security.update({'terminal': terminal_policies})
        self.ws.commands.update({
            'new_terminal': self.new_terminal,
            'set_terminal': self.set_terminal,
            'move_terminal': self.move_terminal,
            'kill_terminal': self.kill_terminal,
            'c': self.char_handler, # Just 'c' to keep the bandwidth down
            'write_chars': self.write_chars,
            'refresh': self.refresh_screen,
            'full_refresh': self.full_refresh,
            'resize': self.resize,
            'get_bell': self.get_bell,
            'manual_title': self.manual_title,
            'reset_terminal': self.reset_terminal,
            'get_webworker': self.get_webworker,
            'debug_terminal': self.debug_terminal
        })
        self.terminal_policies = {} # Gets set in authenticate() below
        self.terms = {}
        # So we can keep track and avoid sending unnecessary messages:
        self.titles = {}
        self.em_dimensions = None
        # Initialize plugins (every time a connection is established so we can
        # load new plugins with a simple page reload)
        self.plugins = get_plugins(os.path.join(APPLICATION_PATH, 'plugins'))
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
        # NOTE:  Most of these will soon be replaced with on() and off() events and maybe some functions related to initialization.
        self.plugin_esc_handlers = {}
        self.plugin_auth_hooks = []
        self.plugin_command_hooks = []
        self.plugin_new_multiplex_hooks = []
        self.plugin_new_term_hooks = {}
        self.plugin_env_hooks = {}
        for plugin_name, hooks in self.plugin_hooks.items():
            if 'Web' in hooks:
                for handler in hooks['Web']:
                    if handler in REGISTERED_HANDLERS:
                        continue # Already registered this one
                    else:
                        REGISTERED_HANDLERS.append(handler)
                        self.add_handler(handler[0], handler[1])
            if 'WebSocket' in hooks:
                # Apply the plugin's WebSocket commands
                for ws_command, func in hooks['WebSocket'].items():
                    self.ws.commands.update({ws_command: bind(func, self)})
            if 'Escape' in hooks:
                # Apply the plugin's Escape handler
                self.on(
                    "terminal:opt_esc_handler:%s" % plugin_name,
                    hooks['Escape'])
            if 'Auth' in hooks:
                # Apply the plugin's post-authentication functions
                if isinstance(hooks['Auth'], (list, tuple)):
                    self.plugin_auth_hooks.extend(hooks['Auth'])
                else:
                    self.plugin_auth_hooks.append(hooks['Auth'])
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
        self.ws.send_static_files(os.path.join(APPLICATION_PATH, 'plugins'))
        terminals = []
        for term in list(SESSIONS[self.ws.session][self.ws.location].keys()):
            if isinstance(term, int): # Only terminals are integers in the dict
                terminals.append(term)
        # Check for any dtach'd terminals we might have missed
        if self.ws.settings['dtach']:
            session_dir = self.ws.settings['session_dir']
            session_dir = os.path.join(session_dir, self.ws.session)
            if not os.path.exists(session_dir):
                mkdir_p(session_dir)
                os.chmod(session_dir, 0o770)
            for item in os.listdir(session_dir):
                if item.startswith('dtach_'):
                    term = int(item.split('_')[1])
                    if term not in terminals:
                        terminals.append(term)
        terminals.sort() # Put them in order so folks don't get confused
        message = {'terminals': terminals}
        self.write_message(json_encode(message))
        self.trigger("terminal:authenticate")

    def on_close(self):
        # Remove all attached callbacks so we're not wasting memory/CPU on
        # disconnected clients
        user = self.current_user
        if self.ws.location in SESSIONS[user['session']]:
            for term in SESSIONS[user['session']][self.ws.location]:
                if isinstance(term, int):
                    term_obj = SESSIONS[user['session']][self.ws.location][term]
                    try:
                        multiplex = term_obj['multiplex']
                        multiplex.remove_all_callbacks(self.callback_id)
                        client_dict = term_obj[self.ws.client_id]
                        term_emulator = multiplex.term
                        term_emulator.remove_all_callbacks(self.callback_id)
                        # Remove anything associated with the client_id
                        multiplex.io_loop.remove_timeout(
                            client_dict['refresh_timeout'])
                        del SESSIONS[user['session']][self.ws.location][
                            term][self.ws.client_id]
                    except (AttributeError, KeyError):
                        # User never completed opening a terminal so
                        # self.callback_id is missing.  Nothing to worry about
                        if self.ws.client_id in term_obj:
                            del term_obj[self.ws.client_id]
        self.trigger("terminal:on_close")

    def term_ended(self, term):
        """
        Sends the 'term_ended' message to the client letting it know that the
        given *term* is no more.
        """
        message = {'term_ended': term}
        self.write_message(json_encode(message))
        self.trigger("terminal:term_ended", term)

    def add_terminal_callbacks(self, term, multiplex, callback_id):
        """
        Sets up all the callbacks associated with the given *term*, *multiplex*
        instance and *callback_id*.
        """
        import terminal
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

    def new_multiplex(self, cmd, term_id, logging=True):
        """
        Returns a new instance of :py:class:`termio.Multiplex` with the proper
        global and client-specific settings.

            * *cmd* - The command to execute inside of Multiplex.
            * *term_id* - The terminal to associate with this Multiplex or a descriptive identifier (it's only used for logging purposes).
            * *logging* - If False, logging will be disabled for this instance of Multiplex (even if it would otherwise be enabled).
        """
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
        # This allows plugins to transform the command however they like
        if self.plugin_command_hooks:
            for func in self.plugin_command_hooks:
                cmd = func(cmd)
        m = termio.Multiplex(
            cmd,
            log_path=log_path,
            user=user,
            term_id=term_id,
            syslog=syslog_logging,
            syslog_facility=facility,
            syslog_host=self.settings['syslog_host']
        )
        if self.plugin_new_multiplex_hooks:
            for func in self.plugin_new_multiplex_hooks:
                func(self, m)
        self.trigger("terminal:new_multiplex", m)
        return m

    @require(authenticated())
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
        # TODO: Move this logic back into gateone.py somewhere
        #if self.ws.session not in SESSIONS:
            ## This happens when timeout_sessions() times out a session
            ## Tell the client it timed out:
            #message = {'timeout': None}
            #self.write_message(json_encode(message))
            #return
        term = settings['term']
        self.rows = rows = settings['rows']
        self.cols = cols = settings['cols']
        policies = applicable_policies(
            'terminal', self.current_user, self.ws.policies)
        # NOTE: 'command' here is actually just the short name of the command.
        #       ...which maps to what's configured in commands.conf
        if 'command' in settings:
            command = settings['command']
        else:
            try:
                command = policies['default_command']
            except KeyError:
                logging.error(_(
                   "You are missing a 'default_command' in your commands.conf"))
                return
        # Get the full command
        try:
            full_command = policies['commands'][command]
        except KeyError:
            # The given command isn't an option
            logging.error(_("%s: Attempted to execute invalid command (%s)." % (
                self.current_user['upn'], command)))
            self.ws.send_message(_("Terminal: Invalid command: %s" % command))
            self.term_ended(term)
            return
        if 'em_dimensions' in settings:
            self.em_dimensions = {
                'height': settings['em_dimensions']['h'],
                'width': settings['em_dimensions']['w']
            }
        user_dir = self.settings['user_dir']
        needs_full_refresh = False
        if term not in SESSIONS[self.ws.session][self.ws.location]:
            # Setup the requisite dict
            SESSIONS[self.ws.session][self.ws.location][term] = {
                'last_activity': datetime.now(),
                'title': 'Gate One',
                'manual_title': False
            }
        term_obj = SESSIONS[self.ws.session][self.ws.location][term]
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
                session=self.ws.session, # with their real-world values.
                session_hash=short_hash(self.ws.session),
                user_dir=user_dir,
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
            if self.settings['dtach']: # Wrap in dtach (love this tool!)
                dtach_path = "%s/dtach_%s" % (session_dir, term)
                if os.path.exists(dtach_path):
                    # Using 'none' for the refresh because the EVIL termio
                    # likes to manage things like that on his own...
                    cmd = "dtach -a %s -E -z -r none" % dtach_path
                    resumed_dtach = True
                else: # No existing dtach session...  Make a new one
                    cmd = "dtach -c %s -E -z -r none %s" % (dtach_path, cmd)
            m = term_obj['multiplex'] = self.new_multiplex(cmd, term)
            # Set some environment variables so the programs we execute can use
            # them (very handy).  Allows for "tight integration" and "synergy"!
            env = {
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
            # Tell it how to serve them up
            m.term.linkpath = "%sdownloads" % self.settings['url_prefix']
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
            multiplex = term_obj['multiplex']
            if multiplex.isalive():
                # It's ALIVE!!!
                multiplex.resize(
                    rows, cols, ctrl_l=False, em_dimensions=self.em_dimensions)
                message = {'term_exists': term}
                self.write_message(json_encode(message))
                # This resets the screen diff
                multiplex.prev_output[self.ws.client_id] = [
                    None for a in xrange(rows-1)]
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
        # Restore application cursor keys mode if set
        if 'application_mode' in term_obj:
            current_setting = term_obj['application_mode']
            self.mode_handler(term, '1', current_setting)
        if self.settings['logging'] == 'debug':
            self.ws.send_message(_(
                "WARNING: Logging is set to DEBUG.  All keystrokes will be "
                "logged!"))
        self.trigger("terminal:new_terminal", term)

    @require(authenticated())
    def move_terminal(self, settings):
        """
        Moves *settings['term']* (terminal number) to
        *SESSIONS[self.ws.session][[settings['location']]*.  In other words, it
        moves the given terminal to the given location in the *SESSIONS* dict.

        If the given location dict doesn't exist (yet) it will be created.
        """
        logging.debug("move_terminal(%s)" % settings)
        new_location_exists = True
        term = existing_term = int(settings['term'])
        new_location = settings['location']
        session_obj = SESSIONS[self.ws.session]
        existing_term_obj = session_obj[self.ws.location][term]
        if new_location not in session_obj:
            term = 1 # Starting anew in the new location
            session_obj[new_location] = {term: existing_term_obj}
            new_location_exists = False
        else:
            existing_terms = [a for a in session_obj[new_location].keys()
                                if isinstance(a, int)]
            existing_terms.sort()
            term = existing_terms[-1] + 1
            session_obj[new_location][term] = existing_term_obj
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
        del session_obj[self.ws.location][existing_term] # Remove old location
        details = {
            'term': term,
            'location': new_location
        }
        message = {
            'term_moved': details, # Closes the term in the current window/tab
        }
        self.write_message(json_encode(message))
        self.trigger("terminal:move_terminal", details)

    @require(authenticated())
    def kill_terminal(self, term):
        """
        Kills *term* and any associated processes.
        """
        logging.debug("killing terminal: %s" % term)
        term = int(term)
        if term not in SESSIONS[self.ws.session][self.ws.location]:
            return # Nothing to do
        multiplex = SESSIONS[self.ws.session][self.ws.location][term]['multiplex']
        # Remove the EXIT callback so the terminal doesn't restart itself
        multiplex.remove_callback(multiplex.CALLBACK_EXIT, self.callback_id)
        try:
            if self.settings['dtach']: # dtach needs special love
                kill_dtached_proc(self.ws.session, term)
            if multiplex.isalive():
                multiplex.terminate()
        except KeyError as e:
            pass # The EVIL termio has killed my child!  Wait, that's good...
                    # Because now I don't have to worry about it!
        finally:
            del SESSIONS[self.ws.session][self.ws.location][term]
        self.trigger("terminal:kill_terminal", term)

    @require(authenticated())
    def set_terminal(self, term):
        """
        Sets `self.current_term = *term*` so we can determine where to send
        keystrokes.
        """
        self.current_term = term
        self.trigger("terminal:set_terminal", term)

    def reset_client_terminal(self, term):
        """
        Tells the client to reset the terminal (clear the screen and remove
        scrollback).
        """
        message = {'reset_client_terminal': term}
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
        multiplex = SESSIONS[self.ws.session][self.ws.location][term]['multiplex']
        multiplex.term.write(reset_sequence)
        multiplex.write(u'\x0c') # ctrl-l
        self.full_refresh(term)
        self.trigger("terminal:reset_terminal", term)

    @require(authenticated())
    def set_title(self, term, force=False):
        """
        Sends a message to the client telling it to set the window title of
        *term* to whatever comes out of::

            SESSIONS[self.ws.session][self.ws.location][term]['multiplex'].term.get_title() # Whew! Say that three times fast!

        Example message::

            {'set_title': {'term': 1, 'title': "user@host"}}

        If *force* resolves to True the title will be sent to the cleint even if
        it matches the previously-set title.

        .. note:: Why the complexity on something as simple as setting the title?  Many prompts set the title.  This means we'd be sending a 'title' message to the client with nearly every screen update which is a pointless waste of bandwidth if the title hasn't changed.
        """
        logging.debug("set_title(%s, %s)" % (term, force))
        term_obj = SESSIONS[self.ws.session][self.ws.location][term]
        if term_obj['manual_title']:
            if force:
                title = term_obj['title']
                title_message = {'set_title': {'term': term, 'title': title}}
                self.write_message(json_encode(title_message))
            return
        title = term_obj['multiplex'].term.get_title()
        # Only send a title update if it actually changed
        if title != term_obj['title'] or force:
            term_obj['title'] = title
            title_message = {'set_title': {'term': term, 'title': title}}
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
        term_obj = SESSIONS[self.ws.session][self.ws.location][term]
        if not title:
            title = term_obj['multiplex'].term.get_title()
            term_obj['manual_title'] = False
        else:
            term_obj['manual_title'] = True
        term_obj['title'] = title
        title_message = {'set_title': {'term': term, 'title': title}}
        self.write_message(json_encode(title_message))
        self.trigger("terminal:manual_title", title)

    @require(authenticated())
    def bell(self, term):
        """
        Sends a message to the client indicating that a bell was encountered in
        the given terminal (*term*).  Example message::

            {'bell': {'term': 1}}
        """
        bell_message = {'bell': {'term': term}}
        self.write_message(json_encode(bell_message))
        self.trigger("terminal:bell", term)

    @require(authenticated())
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
        term_obj = SESSIONS[self.ws.session][self.ws.location][term]
        if setting in ['1']: # Only support this mode right now
            # So we can restore it:
            term_obj['application_mode'] = boolean
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
        self.trigger("terminal:mode_handler", term, setting, boolean)

    def dsr(self, term, response):
        """
        Handles Device Status Report (DSR) calls from the underlying program
        that get caught by the terminal emulator.  *response* is what the
        terminal emulator returns from the CALLBACK_DSR callback.

        .. note:: This also handles the CSI DSR sequence.
        """
        m = SESSIONS[self.ws.session][self.ws.location][term]['multiplex']
        m.write(response)

    def _send_refresh(self, term, full=False):
        """Sends a screen update to the client."""
        term_obj = SESSIONS[self.ws.session][self.ws.location][term]
        try:
            term_obj['last_activity'] = datetime.now()
        except KeyError:
            # This can happen if the user disconnected in the middle of a screen
            # update.  Nothing to be concerned about.
            return # Ignore
        multiplex = term_obj['multiplex']
        scrollback, screen = multiplex.dump_html(
            full=full, client_id=self.ws.client_id)
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
        term_obj = SESSIONS[self.ws.session][self.ws.location][term]
        try:
            msec = timedelta(milliseconds=50) # Keeps things smooth
            # In testing, 150 milliseconds was about as low as I could go and
            # still remain practical.
            force_refresh_threshold = timedelta(milliseconds=150)
            last_activity = term_obj['last_activity']
            timediff = datetime.now() - last_activity
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

    @require(authenticated())
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
        ctrl_l = False
        if 'ctrl_l' in resize_obj:
            ctrl_l = resize_obj['ctrl_l']
        if self.rows < 2 or self.cols < 2:
            # Fall back to a standard default:
            self.rows = 24
            self.cols = 80
        # If the user already has a running session, set the new terminal size:
        try:
            if term:
                loc = SESSIONS[self.ws.session][self.ws.location]
                m = loc[term]['multiplex']
                m.resize(
                    self.rows,
                    self.cols,
                    self.em_dimensions,
                    ctrl_l=ctrl_l
                )
            else: # Resize them all
                for term in list(loc.keys()):
                    if isinstance(term, int): # Skip the TidyThread
                        loc[term]['multiplex'].resize(
                            self.rows,
                            self.cols,
                            self.em_dimensions
                        )
        except KeyError: # Session doesn't exist yet, no biggie
            pass
        self.trigger("terminal:resize", term)

    @require(authenticated())
    def char_handler(self, chars, term=None):
        """
        Writes *chars* (string) to *term*.  If *term* is not provided the
        characters will be sent to the currently-selected terminal.
        """
        #logging.debug("char_handler(%s, %s)" % (repr(chars), repr(term)))
        if not term:
            term = self.current_term
        term = int(term) # Just in case it was sent as a string
        session = self.ws.session
        if session in SESSIONS and term in SESSIONS[session][self.ws.location]:
            multiplex = SESSIONS[session][self.ws.location][term]['multiplex']
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

    @require(authenticated())
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

    @require(authenticated())
    def opt_esc_handler(self, chars):
        """
        Executes whatever function is registered matching the tuple returned by
        :func:`utils.process_opt_esc_sequence`.
        """
        logging.debug("opt_esc_handler(%s)" % repr(chars))
        plugin_name, text = process_opt_esc_sequence(chars)
        if plugin_name:
            try:
                self.trigger(
                    "terminal:opt_esc_handler:%s" % plugin_name, self, text)
            except Exception as e:
                logging.error(_(
                    "Got exception trying to execute plugin's optional ESC "
                    "sequence handler..."))
                logging.error(str(e))

    def get_bell(self):
        """
        Sends the bell sound data to the client in in the form of a data::URI.
        """
        bell_path = os.path.join(GATEONE_DIR, 'static')
        bell_path = os.path.join(bell_path, 'bell.ogg')
        if os.path.exists(bell_path):
            try:
                bell_data_uri = create_data_uri(bell_path)
            except MimeTypeFail:
                bell_data_uri = fallback_bell
        else: # There's always the fallback
            bell_data_uri = fallback_bell
        mimetype = bell_data_uri.split(';')[0].split(':')[1]
        message = {
            'load_bell': {
                'data_uri': bell_data_uri, 'mimetype': mimetype
            }
        }
        self.write_message(json_encode(message))

    def get_webworker(self):
        """
        Sends the text of our go_process.js to the client in order to get around
        the limitations of loading remote Web Worker URLs (for embedding Gate
        One into other apps).
        """
        static_url = os.path.join(GATEONE_DIR, "static")
        webworker_path = os.path.join(static_url, 'go_process.js')
        with open(webworker_path) as f:
            go_process = f.read()
        message = {'load_webworker': go_process}
        self.write_message(json_encode(message))

    @require(authenticated())
    def debug_terminal(self, term):
        """
        Prints the terminal's screen and renditions to stdout so they can be
        examined more closely.

        .. note:: Can only be called from a JavaScript console like so...

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({'debug_terminal': *term*}));
        """
        m = SESSIONS[self.ws.session][self.ws.location][term]['multiplex']
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

# Tell Gate One which classes are applications
apps = [TerminalApplication]
