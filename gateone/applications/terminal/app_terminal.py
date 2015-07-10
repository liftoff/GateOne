# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#
from __future__ import unicode_literals

__doc__ = """\
A Gate One Application (`GOApplication`) that provides a terminal emulator.
"""

# Meta
__version__ = '1.2'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 2)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Standard library imports
import os, sys, time, io, atexit, logging
from datetime import datetime, timedelta
from functools import partial
# Pseudo stdlib
from pkg_resources import resource_filename, resource_listdir, resource_string

# Gate One imports
from gateone import GATEONE_DIR, SESSIONS
from gateone.core.server import StaticHandler, BaseHandler, GOApplication
from gateone.core.server import ApplicationWebSocket
from gateone.auth.authorization import require, authenticated
from gateone.auth.authorization import applicable_policies, policies
from gateone.core.configuration import get_settings, RUDict
from gateone.core.utils import cmd_var_swap, json_encode, generate_session_id
from gateone.core.utils import mkdir_p, entry_point_files
from gateone.core.utils import process_opt_esc_sequence, bind, MimeTypeFail
from gateone.core.utils import short_hash, create_data_uri, which
from gateone.core.locale import get_translation
from gateone.core.log import go_logger, string_to_syslog_facility
from gateone.applications.terminal.logviewer import main as logviewer_main
from gateone.applications.terminal.policy import terminal_policies

# 3rd party imports
from tornado.escape import json_decode
from tornado.options import options, define, Error

# Globals
REGISTERED_HANDLERS = [] # So we don't accidentally re-add handlers
web_handlers = [] # Assigned in init()

# Localization support
_ = get_translation()

# Terminal-specific command line options.  These become options you can pass to
# gateone.py (e.g. --session_logging)
if not hasattr(options, 'session_logging'):
    define(
        "session_logging",
        default=True,
        group='terminal',
        help=_("If enabled, logs of user sessions will be saved in "
                "<user_dir>/<user>/logs.  Default: Enabled")
    )
    define( # This is an easy way to support cetralized logging
        "syslog_session_logging",
        default=False,
        group='terminal',
        help=_("If enabled, logs of user sessions will be written to syslog.")
    )
    define(
        "dtach",
        default=True,
        group='terminal',
        help=_("Wrap terminals with dtach. Allows sessions to be resumed even "
                "if Gate One is stopped and started (which is a sweet feature).")
    )
    define(
        "kill",
        default=False,
        group='terminal',
        help=_("Kill any running Gate One terminal processes including dtach'd "
                "processes.")
    )

def kill_session(session, kill_dtach=False):
    """
    Terminates all the terminal processes associated with *session*.  If
    *kill_dtach* is True, the dtach processes associated with the session will
    also be killed.

    .. note::

        This function gets appended to the
        `SESSIONS[session]["kill_session_callbacks"]` list inside of
        :meth:`TerminalApplication.authenticate`.
    """
    term_log = go_logger("gateone.terminal")
    term_log.debug('kill_session(%s)' % session)
    if kill_dtach:
        from gateone.core.utils import kill_dtached_proc
    for location, apps in list(SESSIONS[session]['locations'].items()):
        loc = SESSIONS[session]['locations'][location]['terminal']
        terms = apps['terminal']
        for term in terms:
            if isinstance(term, int):
                if loc[term]['multiplex'].isalive():
                    loc[term]['multiplex'].terminate()
                if kill_dtach:
                    kill_dtached_proc(session, location, term)

def timeout_session(session):
    """
    Attached to Gate One's 'timeout_callbacks'; kills the given session.

    If 'dtach' support is enabled the dtach processes associated with the
    session will also be killed.
    """
    kill_session(session, kill_dtach=True)

@atexit.register
def quit():
    from gateone.core.utils import killall
    try:
        commands = options.parse_command_line()
    except Error: # options.Error
        return # Bad command line options provided--let the parent handle it
    if commands or options.help:
        # Don't call killall() if the user is invoking gateone --help or a
        # CLI command like 'broadcast' or 'termlog'
        return
    if not options.dtach:
        # If we're not using dtach play it safe by cleaning up any leftover
        # processes.  When passwords are used with the ssh_conenct.py script
        # it runs os.setsid() on the child process which means it won't die
        # when Gate One is closed.  This is primarily to handle that
        # specific situation.
        killall(options.session_dir, options.pid_file)

# NOTE:  THE BELOW IS A WORK IN PROGRESS
class SharedTermHandler(BaseHandler):
    """
    Renders shared.html which allows an anonymous user to view a shared
    terminal.
    """
    def get(self, share_id):
        hostname = os.uname()[1]
        prefs = self.get_argument("prefs", None)
        gateone_js = "%sstatic/gateone.js" % self.settings['url_prefix']
        minified_js_abspath = resource_filename(
            'gateone', '/static/gateone.min.js')
        # Use the minified version if it exists
        if os.path.exists(minified_js_abspath):
            gateone_js = "%sstatic/gateone.min.js" % self.settings['url_prefix']
        index_path = resource_filename(
            'gateone.applications.terminal', '/templates/index.html')
        self.render(
            index_path,
            share_id=share_id,
            hostname=hostname,
            gateone_js=gateone_js,
            url_prefix=self.settings['url_prefix'],
            prefs=prefs
        )

class TermStaticFiles(StaticHandler):
    """
    Serves static files in the `gateone/applications/terminal/static` directory.

    .. note::

        This is configured via the `web_handlers` global (a feature inherent to
        Gate One applications).
    """
    pass

class TerminalApplication(GOApplication):
    """
    A Gate One Application (`GOApplication`) that handles creating and
    controlling terminal applications running on the Gate One server.
    """
    info = {
        'name': "Terminal",
        'version': __version__,
        'description': (
            "Open terminals running any number of configured applications."),
        'dependencies': ['terminal.js', 'terminal_input.js']
    }
    name = "Terminal" # A user-friendly name that will be displayed to the user
    def __init__(self, ws):
        logging.debug("TerminalApplication.__init__(%s)" % ws)
        self.policy = {} # Gets set in authenticate() below
        self.terms = {}
        self.loc_terms = {}
        # So we can keep track and avoid sending unnecessary messages:
        self.titles = {}
        self.em_dimensions = None
        self.race_check = False
        self.log_metadata = {'application': 'terminal'}
        GOApplication.__init__(self, ws)

    def initialize(self):
        """
        Called when the WebSocket is instantiated, sets up our WebSocket
        actions, security policies, and attaches all of our plugin hooks/events.
        """
        self.log_metadata = {
            'application': 'terminal',
            'ip_address': self.ws.request.remote_ip,
            'location': self.ws.location
        }
        self.term_log = go_logger("gateone.terminal")
        self.term_log.debug("TerminalApplication.initialize()")
        # Register our security policy function
        self.ws.security.update({'terminal': terminal_policies})
        # Register our WebSocket actions
        self.ws.actions.update({
            'terminal:new_terminal': self.new_terminal,
            'terminal:set_terminal': self.set_terminal,
            'terminal:move_terminal': self.move_terminal,
            'terminal:swap_terminals': self.swap_terminals,
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
            'terminal:get_font': self.get_font,
            'terminal:get_colors': self.get_colors,
            'terminal:set_encoding': self.set_term_encoding,
            'terminal:set_keyboard_mode': self.set_term_keyboard_mode,
            'terminal:get_locations': self.get_locations,
            'terminal:get_terminals': self.terminals,
            'terminal:get_client_files': self.send_client_files,
            'terminal:permissions': self.permissions,
            'terminal:new_share_id': self.new_share_id,
            'terminal:share_user_list': self.share_user_list,
            'terminal:enumerate_commands': self.enumerate_commands,
            'terminal:enumerate_fonts': self.enumerate_fonts,
            'terminal:enumerate_colors': self.enumerate_colors,
            'terminal:list_shared_terminals': self.list_shared_terminals,
            'terminal:attach_shared_terminal': self.attach_shared_terminal,
            'terminal:detach_shared_terminal': self.detach_shared_terminal,
            'terminal:start_capture': self.start_capture,
            'terminal:stop_capture': self.stop_capture,
            'terminal:debug_terminal': self.debug_terminal
        })
        if 'terminal' not in self.ws.persist:
            self.ws.persist['terminal'] = {}
        # Initialize plugins (every time a connection is established so we can
        # load new plugins with a simple page reload)
        enabled_plugins = self.ws.prefs['*']['terminal'].get(
            'enabled_plugins', [])
        self.plugins = entry_point_files('go_terminal_plugins', enabled_plugins)
        plugin_list = set()
        for plugin in list(
            self.plugins['py'].keys() +
            self.plugins['js'].keys() +
            self.plugins['css'].keys()):
            if '.' in plugin:
                plugin = plugin.split('.')[-1]
            plugin_list.add(plugin)
        plugin_list = sorted(plugin_list) # So there's consistent ordering
        self.term_log.info(_(
            "Active Terminal Plugins: %s" % ", ".join(plugin_list)))
        # Setup some events
        terminals_func = partial(self.terminals, self)
        self.ws.on("go:set_location", terminals_func)
        # Attach plugin hooks
        self.plugin_hooks = {}
        # TODO: Keep track of plugins and hooks to determine when they've
        #       changed so we can tell clients to pull updates and whatnot
        for name, plugin in self.plugins['py'].items():
            try:
                if hasattr(plugin, 'hooks'):
                    self.plugin_hooks.update({plugin.__name__: plugin.hooks})
                if hasattr(plugin, 'initialize'):
                    plugin.initialize(self)
            except AttributeError as e:
                if options.logging.lower() == 'debug':
                    self.term_log.error(
                        _("Got exception trying to initialize the {0} plugin:"
                         ).format(plugin))
                    self.term_log.error(e)
                    import traceback
                    traceback.print_exc(file=sys.stdout)
                pass # No hooks--probably just a supporting .py file.
        # Hook up the hooks
        # NOTE:  Most of these will soon be replaced with on() and off() events
        # and maybe some functions related to initialization.
        self.plugin_esc_handlers = {}
        self.plugin_auth_hooks = []
        self.plugin_command_hooks = []
        self.plugin_log_metadata_hooks = []
        self.plugin_new_multiplex_hooks = []
        self.plugin_new_term_hooks = {}
        self.plugin_env_hooks = {}
        for plugin_name, hooks in self.plugin_hooks.items():
            plugin_name = plugin_name.split('.')[-1]
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
            if 'Metadata' in hooks:
                # Apply the plugin's 'Metadata' hooks (called by new_multiplex)
                if isinstance(hooks['Metadata'], (list, tuple)):
                    self.plugin_log_metadata_hooks.extend(hooks['Metadata'])
                else:
                    self.plugin_log_metadata_hooks.append(hooks['Metadata'])
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
        self.term_log.debug('TerminalApplication.open()')
        self.callback_id = "%s;%s;%s" % (
            self.ws.client_id, self.request.host, self.request.remote_ip)
        self.trigger("terminal:open")

    def send_client_files(self):
        """
        Sends the client our standard CSS and JS.
        """
        # Render and send the client our terminal.css
        terminal_css = resource_filename(
            'gateone.applications.terminal', '/templates/terminal.css')
        self.render_and_send_css(terminal_css, element_id="terminal.css")
        # Send the client our JavaScript files
        js_files = resource_listdir('gateone.applications.terminal', '/static/')
        js_files.sort()
        for fname in js_files:
            if fname.endswith('.js'):
                js_file_path = resource_filename(
                    'gateone.applications.terminal', '/static/%s' % fname)
                if fname == 'terminal.js':
                    self.ws.send_js(js_file_path, requires=["terminal.css"])
                elif fname == 'terminal_input.js':
                    self.ws.send_js(js_file_path, requires="terminal.js")
                else:
                    self.ws.send_js(js_file_path, requires='terminal_input.js')
        self.ws.send_plugin_static_files(
            'go_terminal_plugins',
            requires=["terminal_input.js"])
        # Send the client the 256-color style information and our printing CSS
        self.send_256_colors()
        self.send_print_stylesheet()

    def authenticate(self):
        """
        This gets called immediately after the user is authenticated
        successfully at the end of :meth:`ApplicationWebSocket.authenticate`.
        Sends all plugin JavaScript files to the client and triggers the
        'terminal:authenticate' event.
        """
        self.term_log.debug('TerminalApplication.authenticate()')
        self.log_metadata = {
            'application': 'terminal',
            'upn': self.current_user['upn'],
            'ip_address': self.ws.request.remote_ip,
            'location': self.ws.location
        }
        self.term_log = go_logger("gateone.terminal", **self.log_metadata)
        # Get our user-specific settings/policies for quick reference
        self.policy = applicable_policies(
            'terminal', self.current_user, self.ws.prefs)
        # NOTE: If you want to be able to check policies on-the-fly without
        # requiring the user reload the page when a change is made make sure
        # call applicable_policies() on your own using self.ws.prefs every time
        # you want to check them.  This will ensure it's always up-to-date.
        # NOTE:  applicable_policies() is memoized so calling it over and over
        # again shouldn't slow anything down.
        # Start by determining if the user can even login to the terminal app
        if 'allow' in self.policy:
            if not self.policy['allow']:
                # User is not allowed to access the terminal application.  Don't
                # bother sending them any static files and whatnot.
                self.term_log.debug(_(
                    "User is not allowed to use the Terminal application.  "
                    "Skipping post-authentication functions."))
                return
        self.send_client_files()
        sess = SESSIONS[self.ws.session]
        # Create a place to store app-specific stuff related to this session
        # (but not necessarily this 'location')
        if "terminal" not in sess:
            sess['terminal'] = {}
        # When Gate One exits...
        if kill_session not in sess["kill_session_callbacks"]:
            sess["kill_session_callbacks"].append(kill_session)
        # When a session actually times out (kill dtach'd processes too)...
        if timeout_session not in sess["timeout_callbacks"]:
            sess["timeout_callbacks"].append(timeout_session)
        # Set the sub-applications list to our commands
        commands = list(self.policy['commands'].keys())
        sub_apps = []
        for command in commands:
            if isinstance(self.policy['commands'][command], dict):
                sub_app = self.policy['commands'][command].copy()
                del sub_app['command'] # Don't want clients to know this
                sub_app['name'] = command # Let them have the short name
                if 'icon' in sub_app:
                    if sub_app['icon'].startswith(os.path.sep):
                        # This is a path to the icon instead of the actual
                        # icon (has to be SVG, after all).  Replace it with
                        # the actual icon data (should start with <svg>)
                        if os.path.exists(sub_app['icon']):
                            with io.open(
                                sub_app['icon'], encoding='utf-8') as f:
                                sub_app['icon'] = f.read()
                        else:
                            self.term_log.error(_(
                                "Path to icon ({icon}) for command, "
                                "'{cmd}' could not be found.").format(
                                    cmd=sub_app['name'],
                                    icon=sub_app['icon']))
                            del sub_app['icon']
            else:
                sub_app = {'name': command}
            if 'icon' not in sub_app:
                # Use the generic one
                icon_path = resource_filename(
                    'gateone.applications.terminal',
                    '/templates/command_icon.svg')
                sub_app_icon = resource_string(
                    'gateone.applications.terminal',
                    '/templates/command_icon.svg').decode('utf-8')
                sub_app['icon'] = sub_app_icon.format(cmd=sub_app['name'])
            sub_apps.append(sub_app)
        self.info['sub_applications'] = sorted(
            sub_apps, key=lambda k: k['name'])
        # NOTE: The user will often be authenticated before terminal.js is
        # loaded.  This means that self.terminals() will be ignored in most
        # cases (only when the connection lost and re-connected without a page
        # reload).  For this reason GateOne.Terminal.init() calls
        # getOpenTerminals().
        self.terminals() # Tell the client about open terminals
        self.list_shared_terminals() # Also tell them about any shared terms
        self.trigger("terminal:authenticate")

    def on_close(self):
        """
        Removes all attached callbacks and triggers the `terminal:on_close`
        event.
        """
        # Remove all attached callbacks so we're not wasting memory/CPU on
        # disconnected clients
        if not hasattr(self.ws, 'location'):
            return # Connection closed before authentication completed
        if not self.ws.session: # Broadcast terminal
            self.trigger("terminal:on_close")
            return
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

    @require(authenticated(), policies('terminal'))
    def enumerate_commands(self):
        """
        Tell the client which 'commands' (from settings/policy) that are
        available via the `terminal:commands_list` WebSocket action.
        """
        # Get the current settings in case they've changed:
        policy = applicable_policies(
            'terminal', self.current_user, self.ws.prefs)
        commands = list(policy.get('commands', {}).keys())
        if not commands:
            self.term_log.error(_("You're missing the 'commands' setting!"))
            return
        message = {'terminal:commands_list': {'commands': commands}}
        self.write_message(message)

    def enumerate_fonts(self):
        """
        Returns a JSON-encoded object containing the installed fonts.
        """
        from .woff_info import woff_info
        fonts = resource_listdir(
            'gateone.applications.terminal', '/static/fonts')
        font_list = []
        for font in fonts:
            if not font.endswith('.woff'):
                continue
            font_path = resource_filename(
                'gateone.applications.terminal', '/static/fonts/%s' % font)
            font_info = woff_info(font_path)
            if "Font Family" not in font_info:
                self.ws.logger.error(_(
                    "Bad font in fonts dir (missing Font Family in name "
                    "table): %s" % font))
                continue # Bad font
            if font_info["Font Family"] not in font_list:
                font_list.append(font_info["Font Family"])
        message = {'terminal:fonts_list': {'fonts': font_list}}
        self.write_message(message)

    @require(policies('terminal'))
    def get_font(self, settings):
        """
        Attached to the `terminal:get_font` WebSocket action; sends the client
        CSS that includes a complete set of fonts associated with
        *settings["font_family"]*.  Optionally, the following additional
        *settings* may be provided:

            :font_size:

                Assigns the 'font-size' property according to the given value.
        """
        font_family = settings['font_family']
        font_size = settings.get('font_size', '90%')
        filename = 'font.css'
        font_css_path = resource_filename(
            'gateone.applications.terminal', '/templates/%s' % filename)
        if font_family == 'monospace':
            # User wants the browser to control the font; real simple:
            rendered_path = self.render_style(
                font_css_path,
                force=True,
                font_family=font_family,
                font_size=font_size)
            self.send_css(
                rendered_path, element_id="terminal_font", filename=filename)
            return
        from .woff_info import woff_info
        fonts = resource_listdir(
            'gateone.applications.terminal', '/static/fonts')
        woffs = {}
        for font in fonts:
            if not font.endswith('.woff'):
                continue
            font_path = resource_filename(
                'gateone.applications.terminal', '/static/fonts/%s' % font)
            font_info = woff_info(font_path)
            if "Font Family" not in font_info:
                self.ws.logger.error(_(
                    "Bad font in fonts dir (missing Font Family in name "
                    "table): %s" % font))
                continue # Bad font
            if font_info["Font Family"] == font_family:
                font_dict = {
                    "subfamily": font_info["Font Subfamily"],
                    "font_style": "normal", # Overwritten below (if warranted)
                    "font_weight": "normal", # Ditto
                    "locals": "",
                    "url": (
                        "{server_url}terminal/static/fonts/{font}".format(
                            server_url=self.ws.base_url,
                            font=font)
                    )
                }
                if "Full Name" in font_info:
                    font_dict["locals"] += (
                        "local('{0}')".format(font_info["Full Name"]))
                if "Postscript Name" in font_info:
                    font_dict["locals"] += (
                        ", local('{0}')".format(font_info["Postscript Name"]))
                if 'italic' in font_info["Font Subfamily"].lower():
                    font_dict["font_style"] = "italic"
                if 'oblique' in font_info["Font Subfamily"].lower():
                    font_dict["font_style"] = "oblique"
                if 'bold' in font_info["Font Subfamily"].lower():
                    font_dict["font_weight"] = "bold"
                woffs.update({font: font_dict})
        # NOTE: Not using render_and_send_css() because the source CSS file will
        # never change but the output will.
        rendered_path = self.render_style(
            font_css_path,
            force=True,
            woffs=woffs,
            font_family=font_family,
            font_size=font_size)
        self.send_css(
            rendered_path, element_id="terminal_font", filename=filename)

    def enumerate_colors(self):
        """
        Returns a JSON-encoded object containing the installed text color
        schemes.
        """
        colors = resource_listdir(
            'gateone.applications.terminal', '/templates/term_colors')
        colors = [a for a in colors if a.endswith('.css')]
        colors = [a.replace('.css', '') for a in colors]
        message = {'terminal:colors_list': {'colors': colors}}
        self.write_message(message)

    def save_term_settings(self, term, settings):
        """
        Saves whatever *settings* (must be JSON-encodable) are provided in the
        user's session directory; associated with the given *term*.

        The `restore_term_settings` function can be used to restore the provided
        settings.

        .. note:: This method is primarily to aid dtach support.
        """
        self.term_log.debug("save_term_settings(%s, %s)" % (term, settings))
        from .term_utils import save_term_settings as _save
        term = str(term) # JSON wants strings as keys
        def saved(result): # NOTE: result will always be None
            """
            Called when we're done JSON-decoding and re-encoding the given
            settings.  Just triggers the `terminal:save_term_settings` event.
            """
            self.trigger("terminal:save_term_settings", term, settings)
        # Why bother with an async call for something so small?  Well, we can't
        # be sure it will *always* be a tiny amount of data.  What if some app
        # embedding Gate One wants to pass in some huge amount of metadata when
        # they open new terminals?  Don't want to block while the read, JSON
        # decode, JSON encode, and write operations take place.
        # Also note that this function gets called whenever a new terminal is
        # opened or resumed.  So if you have 100 users each with a dozen or so
        # terminals it could slow things down quite a bit in the event that a
        # number of users lose connectivity and reconnect at once (or the server
        # is restarted with dtach support enabled).
        self.cpu_async.call_singleton( # Singleton since we're writing async
            _save,
            'save_term_settings_%s' % self.ws.session,
            term,
            self.ws.location,
            self.ws.session,
            settings,
            callback=saved)

    def restore_term_settings(self, term):
        """
        Reads the settings associated with the given *term* that are stored in
        the user's session directory and applies them to
        ``self.loc_terms[term]``
        """
        term = str(term) # JSON wants strings as keys
        self.term_log.debug("restore_term_settings(%s)" % term)
        from .term_utils import restore_term_settings as _restore
        def restore(settings):
            """
            Saves the *settings* returned by :func:`restore_term_settings`
            in `self.loc_terms[term]` and triggers the
            `terminal:restore_term_settings` event.
            """
            if self.ws.location in settings:
                if term in settings[self.ws.location]:
                    termNum = int(term)
                    self.loc_terms[termNum].update(
                        settings[self.ws.location][term])
                    # The terminal title needs some special love
                    self.loc_terms[termNum]['multiplex'].term.title = (
                        self.loc_terms[termNum]['title'])
            self.trigger("terminal:restore_term_settings", term, settings)
        future = self.cpu_async.call(
            _restore,
            self.ws.location,
            self.ws.session,
            memoize=False,
            callback=restore)
        return future

    def clear_term_settings(self, term):
        """
        Removes any settings associated with the given *term* in the user's
        term_settings.json file (in their session directory).
        """
        term = str(term)
        self.term_log.debug("clear_term_settings(%s)" % term)
        term_settings = RUDict()
        term_settings[self.ws.location] = {term: {}}
        session_dir = options.session_dir
        session_dir = os.path.join(session_dir, self.ws.session)
        settings_path = os.path.join(session_dir, 'term_settings.json')
        if not os.path.exists(settings_path):
            return # Nothing to do
        # First we read in the existing settings and then update them.
        if os.path.exists(settings_path):
            with io.open(settings_path, encoding='utf-8') as f:
                term_settings.update(json_decode(f.read()))
        del term_settings[self.ws.location][term]
        with io.open(settings_path, 'w', encoding='utf-8') as f:
            f.write(json_encode(term_settings))
        self.trigger("terminal:clear_term_settings", term)

    @require(authenticated(), policies('terminal'))
    def terminals(self, *args, **kwargs):
        """
        Sends a list of the current open terminals to the client using the
        `terminal:terminals` WebSocket action.
        """
        # Note: *args and **kwargs are present so we can attach this to a go:
        # event and just ignore the provided arguments.
        self.term_log.debug('terminals()')
        terminals = {}
        # Create an application-specific storage space in the locations dict
        if 'terminal' not in self.ws.locations[self.ws.location]:
            self.ws.locations[self.ws.location]['terminal'] = {}
        # Quick reference for our terminals in the current location:
        if not self.ws.location:
            return # WebSocket disconnected or not-yet-authenticated
        self.loc_terms = self.ws.locations[self.ws.location]['terminal']
        for term in list(self.loc_terms.keys()):
            if isinstance(term, int): # Only terminals are integers in the dict
                terminals.update({
                    term: {
                        'metadata': self.loc_terms[term]['metadata'],
                        'title': self.loc_terms[term]['title']
                    }})
                share_id = self.loc_terms[term].get('share_id', None)
                if share_id:
                    terminals[term].update({'share_id': share_id})
        if not self.ws.session:
            return # Just a broadcast terminal viewer
        # Check for any dtach'd terminals we might have missed
        if options.dtach and which('dtach'):
            from .term_utils import restore_term_settings
            term_settings = restore_term_settings(
                self.ws.location, self.ws.session)
            session_dir = options.session_dir
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
                            if self.ws.location not in term_settings:
                                continue
                            # NOTE: str() below because the dict comes from JSON
                            if str(term) not in term_settings[self.ws.location]:
                                continue
                            data = term_settings[self.ws.location][str(term)]
                            metadata = data.get('metadata', {})
                            title = data.get('title', 'Gate One')
                            terminals.update({term: {
                                'metadata': metadata,
                                'title': title
                            }})
        self.trigger('terminal:terminals', terminals)
        message = {'terminal:terminals': terminals}
        self.write_message(json_encode(message))

    def term_ended(self, term):
        """
        Sends the 'term_ended' message to the client letting it know that the
        given *term* is no more.
        """
        metadata = {"term": term}
        if term in self.loc_terms:
            metadata["command"] = self.loc_terms[term].get("command", None)
        self.term_log.info(
            "Terminal Closed: %s" % term, metadata=metadata)
        message = {'terminal:term_ended': term}
        if term in self.loc_terms:
            timediff = datetime.now() - self.loc_terms[term]['created']
            if self.race_check:
                race_check_timediff = datetime.now() - self.race_check
                if race_check_timediff < timedelta(milliseconds=500):
                    # Definitely a race condition (command is failing to run).
                    # Add a delay
                    self.add_timeout("5s", partial(self.term_ended, term))
                    self.race_check = False
                    self.ws.send_message(_(
                        "Warning: Terminals are closing too fast.  If you see "
                        "this message multiple times it is likely that the "
                        "configured command is failing to execute.  Please "
                        "check your server settings."
                    ))
                    cmd = self.loc_terms[term]['multiplex'].cmd
                    self.term_log.warning(_(
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
        #set_title() # Set initial title
        bell = partial(self.bell, term)
        term_emulator.add_callback(
            terminal.CALLBACK_BELL, bell, callback_id)
        opt_esc_handler = partial(self.opt_esc_handler, term, multiplex)
        term_emulator.add_callback(
            terminal.CALLBACK_OPT, opt_esc_handler, callback_id)
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
        import terminal
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

            :cmd:
                The command to execute inside of Multiplex.
            :term_id:
                The terminal to associate with this Multiplex or a descriptive
                identifier (it's only used for logging purposes).
            :logging:
                If ``False``, logging will be disabled for this instance of
                Multiplex (even if it would otherwise be enabled).
            :encoding:
                The default encoding that will be used when reading or writing
                to the Multiplex instance.
            :debug:
                If ``True``, will enable debugging on the created Multiplex
                instance.
        """
        import termio
        cls = TerminalApplication
        policies = applicable_policies(
            'terminal', self.current_user, self.ws.prefs)
        shell_command = policies.get('shell_command', None)
        enabled_filetypes = policies.get('enabled_filetypes', 'all')
        use_shell = policies.get('use_shell', True)
        user_dir = self.settings['user_dir']
        try:
            user = self.current_user['upn']
        except:
            # No auth, use ANONYMOUS (% is there to prevent conflicts)
            user = r'ANONYMOUS' # Don't get on this guy's bad side
        session_dir = options.session_dir
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
                log_suffix = "-{0}.golog".format(
                    self.current_user.get('ip_address', "0.0.0.0"))
                log_name = datetime.now().strftime(
                    '%Y%m%d%H%M%S%f') + log_suffix
                log_path = os.path.join(log_dir, log_name)
        facility = string_to_syslog_facility(self.settings['syslog_facility'])
        # This allows plugins to transform the command however they like
        if self.plugin_command_hooks:
            for func in self.plugin_command_hooks:
                cmd = func(self, cmd, term=term_id)
        additional_log_metadata = {
            'ip_address': self.current_user.get('ip_address', "0.0.0.0")
        }
        # This allows plugins to add their own metadata to .golog files:
        if self.plugin_log_metadata_hooks:
            for func in self.plugin_log_metadata_hooks:
                metadata = func(self, term=term_id)
                additional_log_metadata.update(metadata)
        terminal_emulator_kwargs = {}
        if enabled_filetypes != 'all':
            # Only need to bother if it is something other than the default
            terminal_emulator_kwargs = {'enabled_filetypes': enabled_filetypes}
        m = termio.Multiplex(
            cmd,
            terminal_emulator_kwargs=terminal_emulator_kwargs,
            log_path=log_path,
            user=user,
            term_id=term_id,
            debug=debug,
            syslog=syslog_logging,
            syslog_facility=facility,
            additional_metadata=additional_log_metadata,
            encoding=encoding
        )
        if use_shell:
            m.use_shell = True # This is the default anyway
            if shell_command:
                m.shell_command = shell_command
        else:
            m.use_shell = False
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
        if not self.ws.session:
            return 1 # Broadcast terminal viewer
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
        term = int(settings.get('term', self.highest_term_num() + 1))
        # TODO: Make these specific to each terminal:
        rows = settings.get('rows', 24)
        if not isinstance(rows, int):
            rows = 24
        cols = settings.get('columns', 80)
        if not isinstance(cols, int):
            cols = 80
        if rows < 2 or cols < 2: # Something went wrong calculating term size
            # Fall back to a standard default
            rows = 24
            cols = 80
        default_env = {"TERM": 'xterm-256color'} # Only one default
        policy = applicable_policies(
            'terminal', self.current_user, self.ws.prefs)
        environment_vars = policy.get('environment_vars', default_env)
        default_encoding = policy.get('default_encoding', 'utf-8')
        encoding = settings.get('encoding', default_encoding)
        if not encoding: # Was passed as None or 'null'
            encoding = default_encoding
        term_metadata = settings.get('metadata', {})
        settings_dir = self.settings['settings_dir']
        user_session_dir = os.path.join(options.session_dir, self.ws.session)
        # NOTE: 'command' here is actually just the short name of the command.
        #       ...which maps to what's configured the 'commands' part of your
        #       terminal settings.
        if 'command' in settings and settings['command']:
            command = settings['command']
        else:
            try:
                command = policy['default_command']
            except KeyError:
                self.term_log.error(_(
                   "You are missing a 'default_command' in your terminal "
                   "settings (usually 50terminal.conf in %s)"
                   % settings_dir))
                return
        cmd_dtach_enabled = True
        # Get the full command
        try:
            full_command = policy['commands'][command]
        except KeyError:
            # The given command isn't an option
            self.term_log.error(_(
                "%s: Attempted to execute invalid command (%s)." % (
                self.current_user['upn'], command)))
            self.ws.send_message(_("Terminal: Invalid command: %s" % command))
            self.term_ended(term)
            return
        if isinstance(full_command, dict): # Extended command definition
            # This lets you disable dtach on a per-command basis:
            cmd_dtach_enabled = full_command.get('dtach', True)
            full_command = full_command['command']
        # Make a nice, useful logging line with extra metadata
        log_metadata = {
            "rows": settings["rows"],
            "columns": settings["columns"],
            "term": term,
            "command": command
        }
        self.term_log.info("New Terminal: %s" % term, metadata=log_metadata)
        # Now remove the new-term-specific metadata
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
                'command': command,
                'manual_title': False,
                'metadata': term_metadata, # Any extra info the client gave us
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
            cmd = cmd_var_swap(full_command, # Swap out variables like %USER%
                gateone_dir=GATEONE_DIR,
                session=self.ws.session, # with their real-world values.
                session_dir=options.session_dir,
                session_hash=short_hash(self.ws.session),
                userdir=user_dir,
                user=user,
                time=now
            )
            # Now swap out any variables like $PATH, $HOME, $USER, etc
            cmd = os.path.expandvars(cmd)
            resumed_dtach = False
            # Create the user's session dir if not already present
            if not os.path.exists(user_session_dir):
                mkdir_p(user_session_dir)
                os.chmod(user_session_dir, 0o770)
            if options.dtach and which('dtach') and cmd_dtach_enabled:
                # Wrap in dtach (love this tool!)
                dtach_path = "{session_dir}/dtach_{location}_{term}".format(
                    session_dir=user_session_dir,
                    location=self.ws.location,
                    term=term)
                if os.path.exists(dtach_path):
                    # Using 'none' for the refresh because termio
                    # likes to manage things like that on his own...
                    cmd = "dtach -a %s -E -z -r none" % dtach_path
                    resumed_dtach = True
                else: # No existing dtach session...  Make a new one
                    cmd = "dtach -c %s -E -z -r none %s" % (dtach_path, cmd)
            self.term_log.debug(_("new_terminal cmd: %s" % repr(cmd)))
            m = term_obj['multiplex'] = self.new_multiplex(
                cmd, term, encoding=encoding)
            # Set some environment variables so the programs we execute can use
            # them (very handy).  Allows for "tight integration" and "synergy"!
            env = {
                'GO_DIR': GATEONE_DIR,
                'GO_SETTINGS_DIR': settings_dir,
                'GO_USER_DIR': user_dir,
                'GO_USER': user,
                'GO_TERM': str(term),
                'GO_LOCATION': self.ws.location,
                'GO_SESSION': self.ws.session,
                'GO_SESSION_DIR': options.session_dir,
                'GO_USER_SESSION_DIR': user_session_dir,
            }
            env.update(os.environ) # Add the defaults for this system
            env.update(environment_vars) # Apply policy-based environment
            if self.plugin_env_hooks:
                # This allows plugins to add/override environment variables
                env.update(self.plugin_env_hooks)
            m.spawn(rows, cols, env=env, em_dimensions=self.em_dimensions)
            # Give the terminal emulator a path to store temporary files
            m.term.temppath = os.path.join(user_session_dir, 'downloads')
            if not os.path.exists(m.term.temppath):
                os.mkdir(m.term.temppath)
            # Tell it how to serve them up (origin ensures correct link)
            m.term.linkpath = "{server_url}downloads".format(
                server_url=self.ws.base_url)
            # Make sure it can generate pretty icons for file downloads
            m.term.icondir = resource_filename('gateone', '/static/icons')
            if resumed_dtach:
                # Send an extra Ctrl-L to refresh the screen and fix the sizing
                # after it has been reattached.
                m.write('\x0c')
        else:
            # Terminal already exists
            m = term_obj['multiplex']
            if m.isalive():
                # It's ALIVE!!!
                if term_obj['user'] == self.current_user:
                    m.resize(
                        rows, cols,
                        ctrl_l=False,
                        em_dimensions=self.em_dimensions)
                message = {'terminal:term_exists': {'term': term}}
                self.write_message(json_encode(message))
                # This resets the screen diff
                m.prev_output[self.ws.client_id] = [None] * rows
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
        if self.loc_terms[term]['multiplex'].cmd.startswith('dtach -a'):
            # This dtach session was resumed; restore terminal settings
            m_term = term_obj['multiplex'].term
            future = self.restore_term_settings(term)
            self.io_loop.add_future(
                future, lambda f: self.set_title(term, force=True, save=False))
            # The multiplex instance needs the title set by hand (it's special)
            self.io_loop.add_future(
                future, lambda f: m_term.set_title(
                    self.loc_terms[term]['title']))
        self.trigger("terminal:new_terminal", term)
        # Calling save_term_settings() after the event is fired so that plugins
        # can modify the metadata before it gets saved.
        self.save_term_settings(
            term, {'metadata': self.loc_terms[term]['metadata']})

    @require(authenticated(), policies('terminal'))
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

    @require(authenticated(), policies('terminal'))
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

    @require(authenticated(), policies('terminal'))
    def start_capture(self, term=None):
        """
        Starts capturing output for the terminal given via *term*.
        The output will be saved to a temporary file and delivered to the client
        when `TerminalApplication.stop_capture` is called.

        If no *term* is given the currently-selected terminal will be used.
        """
        self.term_log.debug("start_capture(%s)" % repr(term))
        from tempfile import NamedTemporaryFile
        from .term_utils import capture_stream
        if not term:
            term = self.current_term
        # Make a temporary file to save the terminal's output
        capture_file = NamedTemporaryFile(prefix="go_term_cap", delete=False)
        capture_path = capture_file.name
        # Don't need the object anymore since we'll be using io.open():
        capture_file.close() # Will get deleted in stop_capture()
        capture_func = partial(capture_stream, self)
        term_obj = self.loc_terms[term]
        term_obj["capture"] = {
            "output": io.open(capture_path, 'a', encoding="utf-8"),
            "capture_func": capture_func # So we can call self.off() with it
        }
        self.on("terminal:refresh_screen", capture_func)

    def stop_capture(self, term):
        """
        Stops capturing output for the given *term* by closing the open file
        object and deleting the "capture" dict from the current instance of
        `TerminalApplication.loc_terms[term]`.  The captured data will be sent
        to the client via the 'terminal:captured_data' WebSocket action which
        will included a dict like so::

            {
                "term": 1,
                "data": "$ ls\nfile1 file2\n$ "
            }
        """
        self.term_log.debug("stop_capture(%s)" % term)
        if term not in self.loc_terms:
            return # Nothing to do
        term_obj = self.loc_terms[term]
        if 'capture' not in term_obj:
            return # Nothing to do
        capture = term_obj["capture"]["output"]
        capture_path = capture.name
        capture.flush()
        capture.close()
        capture_func = term_obj["capture"]["capture_func"]
        self.off("terminal:refresh_screen", capture_func)
        capture_data = open(capture_path, 'rb').read()
        capture_dict = {
            'term': term,
            'data': capture_data
        }
        # Cleanup
        os.remove(capture_path)
        del term_obj["capture"]
        message = {'terminal:captured_data': capture_dict}
        self.write_message(message)

    @require(authenticated(), policies('terminal'))
    def swap_terminals(self, settings):
        """
        Swaps the numbers of *settings['term1']* and *settings['term2']*.
        """
        term1 = int(settings.get('term1', 0))
        term2 = int(settings.get('term2', 0))
        if not term1 or not term2:
            return # Nothing to do
        missing_msg = _("Error: Terminal {term} does not exist.")
        if term1 not in self.loc_terms:
            self.ws.send_message(missing_msg.format(term=term1))
            return
        if term2 not in self.loc_terms:
            self.ws.send_message(missing_msg.format(term=term2))
            return
        term1_dict = self.loc_terms.pop(term1)
        term2_dict = self.loc_terms.pop(term2)
        self.remove_terminal_callbacks(
            term1_dict['multiplex'], self.callback_id)
        self.remove_terminal_callbacks(
            term2_dict['multiplex'], self.callback_id)
        self.loc_terms.update({term1: term2_dict})
        self.loc_terms.update({term2: term1_dict})
        self.add_terminal_callbacks(
            term1, term2_dict['multiplex'], self.callback_id)
        self.add_terminal_callbacks(
            term2, term1_dict['multiplex'], self.callback_id)
        self.trigger("terminal:swap_terminals", term1, term2)

    @require(authenticated(), policies('terminal'))
    def move_terminal(self, settings):
        """
        Attached to the `terminal:move_terminal` WebSocket action. Moves
        *settings['term']* (terminal number) to
        ``SESSIONS[self.ws.session][[*settings['location']*]['terminal']``.  In
        other words, it moves the given terminal to the given location in the
        *SESSIONS* dict.

        If the given location dict doesn't exist (yet) it will be created.
        """
        self.term_log.debug("move_terminal(%s)" % settings)
        new_location_exists = True
        term = existing_term = int(settings['term'])
        new_location = settings['location']
        if term not in self.loc_terms:
            self.ws.send_message(_(
                "Error: Terminal {term} does not exist at the current location"
                " ({location})".format(term=term, location=self.ws.location)))
            return
        existing_term_obj = self.loc_terms[term]
        if new_location not in self.ws.locations:
            term = 1 # Starting anew in the new location
            self.ws.locations[new_location] = {}
            self.ws.locations[new_location]['terminal'] = {
                term: existing_term_obj
            }
            new_location_exists = False
        else:
            existing_terms = [
                a for a in self.ws.locations[
                  new_location]['terminal'].keys()
                    if isinstance(a, int)]
            existing_terms.sort()
            new_term_num = 1
            if existing_terms:
                new_term_num = existing_terms[-1] + 1
            self.ws.locations[new_location][
                'terminal'][new_term_num] = existing_term_obj
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
            # Find the ApplicationWebSocket instance using the given 'location':
            for instance in self.ws.instances:
                if instance.location == new_location:
                    ws_instance = instance
                    break
            # Find the TerminalApplication inside the ws_instance:
            for app in ws_instance.apps:
                if isinstance(app, TerminalApplication):
                    new_location_instance = app
            new_location_instance.new_terminal({
                'term': new_term_num,
                'rows': multiplex.rows,
                'columns': multiplex.cols,
                'em_dimensions': em_dimensions
            })
            ws_instance.send_message(_(
                "Incoming terminal from location: %s" % self.ws.location))
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

    @require(authenticated(), policies('terminal'))
    def kill_terminal(self, term):
        """
        Kills *term* and any associated processes.
        """
        term = int(term)
        if term not in self.loc_terms:
            return # Nothing to do
        metadata = {
            "term": term,
            "command": self.loc_terms[term]["command"]
        }
        self.term_log.info(
            "Terminal Killed: %s" % term, metadata=metadata)
        multiplex = self.loc_terms[term]['multiplex']
        # Remove the EXIT callback so the terminal doesn't restart itself
        multiplex.remove_callback(multiplex.CALLBACK_EXIT, self.callback_id)
        try:
            if options.dtach: # dtach needs special love
                from gateone.core.utils import kill_dtached_proc
                kill_dtached_proc(self.ws.session, self.ws.location, term)
            if multiplex.isalive():
                multiplex.terminate()
        except KeyError:
            pass # The EVIL termio has killed my child!  Wait, that's good...
                 # Because now I don't have to worry about it!
        finally:
            del self.loc_terms[term]
            self.clear_term_settings(term)
        self.trigger("terminal:kill_terminal", term)

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

    @require(authenticated(), policies('terminal'))
    def reset_terminal(self, term):
        """
        Performs the equivalent of the 'reset' command which resets the terminal
        emulator (among other things) to return the terminal to a sane state in
        the event that something went wrong (bad escape sequence).
        """
        self.term_log.debug('reset_terminal(%s)' % term)
        term = int(term)
        # This re-creates all the tabstops:
        tabs = '\x1bH        ' * 22
        reset_sequence = (
            '\r\x1b[3g        %sr\x1bc\x1b[!p\x1b[?3;4l\x1b[4l\x1b>\r' % tabs)
        multiplex = self.loc_terms[term]['multiplex']
        multiplex.term.write(reset_sequence)
        multiplex.write('\x0c') # ctrl-l
        self.full_refresh(term)
        self.trigger("terminal:reset_terminal", term)

    def set_title(self, term, force=False, save=True):
        """
        Sends a message to the client telling it to set the window title of
        *term* to whatever comes out of::

            self.loc_terms[term]['multiplex'].term.get_title() # Whew! Say that three times fast!

        Example message::

            {'set_title': {'term': 1, 'title': "user@host"}}

        If *force* resolves to True the title will be sent to the cleint even if
        it matches the previously-set title.

        if *save* is ``True`` (the default) the title will be saved via the
        `TerminalApplication.save_term_settings` function so that it may be
        restored later (in the event of a server restart--if you've got dtach
        support enabled).

        .. note:: Why the complexity on something as simple as setting the title?  Many prompts set the title.  This means we'd be sending a 'title' message to the client with nearly every screen update which is a pointless waste of bandwidth if the title hasn't changed.
        """
        self.term_log.debug("set_title(%s, %s, %s)" % (term, force, save))
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
            # Save it in case we're restarted (only matters for dtach)
            if save:
                self.save_term_settings(term, {'title': title})
        self.trigger("terminal:set_title", term, title)

    @require(authenticated(), policies('terminal'))
    def manual_title(self, settings):
        """
        Sets the title of *settings['term']* to *settings['title']*.  Differs
        from :func:`set_title` in that this is an action that gets called by the
        client when the user sets a terminal title manually.
        """
        self.term_log.debug("manual_title: %s" % settings)
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
        # Save it in case we're restarted (only matters for dtach)
        self.save_term_settings(term, {'title': title})
        self.trigger("terminal:manual_title", title)

    def bell(self, term):
        """
        Sends a message to the client indicating that a bell was encountered in
        the given terminal (*term*).  Example message::

            {'bell': {'term': 1}}
        """
        bell_message = {'terminal:bell': {'term': term}}
        self.write_message(json_encode(bell_message))
        self.trigger("terminal:bell", term)

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
        self.term_log.debug(
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
        try:
            term_obj = self.loc_terms[term]
            term_obj['last_activity'] = datetime.now()
        except KeyError:
            # This can happen if the user disconnected in the middle of a screen
            # update or if the terminal was closed really quickly before the
            # Tornado framework got a chance to call this function.  Nothing to
            # be concerned about.
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
                self.term_log.info(
                    _("WebSocket closed (%s)") % self.current_user['upn'])
                multiplex = term_obj['multiplex']
                multiplex.remove_callback( # Stop trying to write
                    multiplex.CALLBACK_UPDATE, self.callback_id)

    def refresh_screen(self, term, full=False, stream=None):
        """
        Writes the state of the given terminal's screen and scrollback buffer to
        the client using `_send_refresh()`.  Also ensures that screen updates
        don't get sent too fast to the client by instituting a rate limiter that
        also forces a refresh every 150ms.  This keeps things smooth on the
        client side and also reduces the bandwidth used by the application (CPU
        too).

        If *full*, send the whole screen (not just the difference).

        The *stream* argument is meant to contain the raw character stream that
        resulted in the terminal screen being updated.  It is only used to pass
        the data through to the 'terminal:refresh_screen' event.  This event is
        and that raw data is used by the `TerminalApplication.start_capture` and
        `TerminalApplication.stop_capture` methods.
        """
        # Commented this out because it was getting annoying.
        # Note to self: add more levels of debugging beyond just "debug".
        #self.term_log.debug(
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
            self.term_log.debug(_("KeyError in refresh_screen: %s" % e))
        self.trigger("terminal:refresh_screen", term, stream=stream)

    def full_refresh(self, term):
        """Calls `self.refresh_screen(*term*, full=True)`"""
        try:
            term = int(term)
        except ValueError:
            self.term_log.debug(_(
                "Invalid terminal number given to full_refresh(): %s" % term))
        self.refresh_screen(term, full=True)
        self.trigger("terminal:full_refresh", term)

    @require(authenticated(), policies('terminal'))
    def resize(self, resize_obj):
        """
        Resize the terminal window to the rows/columns specified in *resize_obj*

        Example *resize_obj*::

            {'rows': 24, 'columns': 80}
        """
        term = None
        if 'term' in resize_obj:
            try:
                term = int(resize_obj['term'])
            except ValueError:
                return # Got bad value, skip this resize
        self.term_log.info("Resizing Terminal: %s" % term, metadata=resize_obj)
        rows = resize_obj['rows']
        cols = resize_obj['columns']
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
                    em_dimensions=self.em_dimensions,
                    ctrl_l=ctrl_l
                )
            else: # Resize them all
                for term in list(self.loc_terms.keys()):
                    if isinstance(term, int): # Skip the TidyThread
                        self.loc_terms[term]['multiplex'].resize(
                            rows,
                            cols,
                            em_dimensions=self.em_dimensions,
                            ctrl_l=ctrl_l
                        )
        except KeyError: # Session doesn't exist yet, no biggie
            pass
        self.write_message(
            {"terminal:resize": {"term": term, "rows": rows, "columns": cols}})
        self.trigger("terminal:resize", term)

    @require(authenticated(), policies('terminal'))
    def char_handler(self, chars, term=None):
        """
        Writes *chars* (string) to *term*.  If *term* is not provided the
        characters will be sent to the currently-selected terminal.
        """
        self.term_log.debug("char_handler(%s, %s)" % (repr(chars), repr(term)))
        if not term:
            term = self.current_term
        term = int(term) # Just in case it was sent as a string
        if self.ws.session in SESSIONS and term in self.loc_terms:
            multiplex = self.loc_terms[term]['multiplex']
            if multiplex.isalive():
                multiplex.write(chars)
                # Handle (gracefully) the situation where a capture is stopped
                if '\x03' in chars:
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
        #self.term_log.debug('write_chars(%s)' % message)
        if 'chars' not in message:
            return # Invalid message
        if 'term' not in message:
            message['term'] = self.current_term
        try:
            self.char_handler(message['chars'], message['term'])
        except Exception as e:
            # Term is closed or invalid
            self.term_log.error(_(
                "Got exception trying to write_chars() to terminal %s"
                % message['term']))
            self.term_log.error(str(e))
            import traceback
            traceback.print_exc(file=sys.stdout)

    def opt_esc_handler(self, term, multiplex, chars):
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

            $ echo -e "\\033]_;somename|Text passed to some_function()\\007"

        Which would result in :func:`some_function` being called like so::

            some_function(
                self, "Text passed to some_function()", term, multiplex)

        In the above example, *term* will be the terminal number that emitted
        the event and *multiplex* will be the `termio.Multiplex` instance that
        controls the terminal.
        """
        self.term_log.debug("opt_esc_handler(%s)" % repr(chars))
        plugin_name, text = process_opt_esc_sequence(chars)
        if plugin_name:
            try:
                event = "terminal:opt_esc_handler:%s" % plugin_name
                self.trigger(event, text, term=term, multiplex=multiplex)
            except Exception as e:
                self.term_log.error(_(
                    "Got exception trying to execute plugin's optional ESC "
                    "sequence handler..."))
                self.term_log.error(str(e))
                import traceback
                traceback.print_exc(file=sys.stdout)

    def get_bell(self):
        """
        Sends the bell sound data to the client in in the form of a data::URI.
        """
        bell_path = resource_filename(
            'gateone.applications.terminal', '/static/bell.ogg')
        try:
            bell_data_uri = create_data_uri(bell_path)
        except (IOError, MimeTypeFail): # There's always the fallback
            self.term_log.error(_("Could not load bell: %s") % bell_path)
            bell_data_uri = resource_string(
                'gateone.applications.terminal', '/static/fallback_bell.txt')
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
        go_process = resource_string(
            'gateone.applications.terminal', '/static/webworkers/term_ww.js')
        message = {'terminal:load_webworker': go_process.decode('utf-8')}
        self.write_message(json_encode(message))

    def get_colors(self, settings):
        """
        Sends the text color stylesheet matching the properties specified in
        *settings* to the client.  *settings* must contain the following:

           :colors: The name of the CSS text color scheme to be retrieved.
        """
        self.term_log.debug('get_colors(%s)' % settings)
        send_css = self.ws.prefs['*']['gateone'].get('send_css', True)
        if not send_css:
            if not hasattr('logged_css_message', self):
                self.term_log.info(_(
                    "send_css is false; will not send JavaScript."))
            # So we don't repeat this message a zillion times in the logs:
            self.logged_css_message = True
            return
        colors_filename = "%s.css" % settings["colors"]
        colors_path = resource_filename(
            'gateone.applications.terminal',
            '/templates/term_colors/%s' % colors_filename)
        filename = "term_colors.css" # Make sure it's the same every time
        self.render_and_send_css(colors_path,
            element_id="text_colors", filename=filename)

    @require(policies('terminal'))
    def get_locations(self):
        """
        Attached to the `terminal:get_locations` WebSocket action.  Sends a
        message to the client (via the `terminal:term_locations` WebSocket
        action) listing all 'locations' where terminals reside.

        .. note::

            Typically the location mechanism is used to open terminals in
            different windows/tabs.
        """
        term_locations = {}
        for location, obj in self.ws.locations.items():
            terms = obj.get('terminal', None)
            if terms:
                term_locations[location] = terms.keys()
        message = {'terminal:term_locations': term_locations}
        self.write_message(json_encode(message))
        self.trigger("terminal:term_locations", term_locations)

# Terminal sharing TODO (not in any particular order or priority):
#   * GUI elements that allow a user to share a terminal:
#       DONE Share this terminal:
#           DONE - Allow anyone with the right URL to view (requires authorization-on-connect).
#           DONE - Allow only authenticated users.
#           DONE - Allow only specified users.
#       - Sharing controls widget (pause/resume sharing, primarily).
#       - Chat widget (or similar--maybe with audio/video via WebRTC).
#       - A mechanism to invite people (send an email/alert).
#       - A mechanism to approve inbound viewers (for "allow AUTHENTICATED" situations).
#   * A server-side API to control sharing:
#       DONE - Share X with authorization options (allow anon w/URL and/or password, authenticated users, or a specific list)
#       DONE            - Stop sharing terminal X.
#       - Pause sharing of terminal X (So it can be resumed without having to change the viewers/write list).
#       DONE - Generate sharing URL for terminal X.
#       - Send invitation to view terminal X.  Connected user(s), email, and possibly other mechanisms (Jabber/Google Talk, SMS, etc)
#       - Approve inbound viewer.
#       DONE            - Allow viewer(s) to control terminal X.
#       - A completely separate chat/communications API.
#       DONE            - List shared terminals.
#       DONE            - Must integrate policy support for @require(policies('terminal'))
#   * A client-side API to control sharing:
#       DONE - Notify user of connected viewers.
#       - Notify user of access/control grants.
#       - Control playback history via server-side events (in case a viewer wants to point something out that just happened).
#   * DONE - A RequestHandler to handle anonymous connections to shared terminals.  Needs to serve up something specific (not index.html).
#   * DONE - A mechanism to generate anonymous sharing URLs.
#   * A way for users to communicate with each other (chat, audio, video).
#   * DONE - A mechansim for password-protecting shared terminals.
#   * Logic to detect the optimum terminal size for all viewers.
#   * DONE - A data structure of some sort to keep track of shared terminals and who is currently connected to them.
#   * A way to view multiple shared terminals on a single page with the option to break them out into individual windows/tabs.
    @require(authenticated(), policies('terminal'))
    def permissions(self, settings):
        """
        Attached to the `terminal:permissions` WebSocket action; controls the
        sharing permissions on a given *settings['term']*.  Specifically, who
        may view or write to a given terminal.

        The *settings* dict **must** contain the following::

            {
                'term': <terminal number>,
                'read': <"ANONYMOUS", "AUTHENTICATED", or a list of UPNs>
            }

        Optionally, the *settings* dict may also contain the following::

            {
                'broadcast': <True/False>, # Default: False
                'password': <string>, # Default: No password
                'write': <"ANONYMOUS", "AUTHENTICATED",  or a list of UPNs>
                # If "write" is omitted the terminal will be shared read-only
            }

        If *broadcast* is True, anyone will be able to connect to the shared
        terminal without a password.  A URL where users can access the shared
        terminal will be automatically generated.

        If a *password* is provided, the given password will be required before
        users may connect to the shared terminal.

        Example WebSocket command to share a terminal:

        .. code-block:: javascript

            settings = {
                "term": 1,
                "read": "AUTHENTICATED",
                "password": "foo" // Omit if no password is required
            }
            GateOne.ws.send(JSON.stringify({"terminal:permissions": settings}));

        .. note::

            If the server is configured with `"auth": "none"` and
            *settings['read']* is "AUTHENTICATED" all users will be able to view
            the shared terminal without having to enter a password.
        """
        self.term_log.debug("permissions(%s)" % settings)
        from gateone.core.utils import random_words
        share_dict = {}
        term = int(settings.get('term', self.current_term))
        # Share permissions get stored in the PERSIST global
        if 'shared' not in self.ws.persist['terminal']:
            self.ws.persist['terminal']['shared'] = {}
        shared_terms = self.ws.persist['terminal']['shared']
        term_obj = self.loc_terms.get(term, None)
        if not term_obj:
            return # Terminal does not exist (anymore)
        read = settings.get('read', []) # List of who to share with
        if not isinstance(read, (list, tuple)):
            read = [read] # Must be a list even if only one permission
        write = settings.get('write', []) # Who can write (implies read access)
        if not isinstance(write, (list, tuple)):
            write = [write]
        password = settings.get('password', None)
        # "broadcast" mode allows anonymous access without a password
        broadcast_url_template = "{base_url}terminal/shared/{share_id}"
        broadcast = settings.get('broadcast', False)
        for share_id, val in shared_terms.items():
            if val['term_obj'] == term_obj:
                # Save the original read permissions for access check/revoke
                orig_read = shared_terms[share_id]['read']
                # Update existing permissions
                shared_terms[share_id]['read'] = read
                shared_terms[share_id]['write'] = write
                shared_terms[share_id]['password'] = password
                if broadcast == True: # Generate a new broadcast URL
                    broadcast = broadcast_url_template.format(
                        base_url=self.ws.base_url,
                        share_id=share_id)
                shared_terms[share_id]['broadcast'] = broadcast
                # Perform an access check and revoke access for existing viewers
                # if they have been removed from the 'read' list
                for upn in orig_read:
                    if upn not in shared_terms[share_id]['read']:
                        self.remove_viewer(term, upn)
                # Check if nothing is shared anymore so we can remove it
                if not read and not write and not broadcast:
                    self.remove_viewer(term) # Remove all viewers
                    del self.ws.persist['terminal']['shared'][share_id]
                self.get_permissions(term)
                self.notify_permissions()
                return
        if not read and not write and not broadcast:
            return # Nothing to do
        share_id = '-'.join(random_words(2))
        if broadcast == True: # Generate a broadcast URL
            broadcast = broadcast_url_template.format(
                base_url=self.ws.base_url,
                share_id=share_id)
        share_dict.update({
            'user': self.current_user,
            'term': term,
            'term_obj': term_obj,
            'read': read,
            'write': write, # Populated on-demand by the sharing user
            'broadcast': broadcast,
            'password': settings.get('password', None),
            'viewers': []
        })
        shared_terms[share_id] = share_dict
        term_obj['share_id'] = share_id # So we can quickly tell it's shared
        # Make a note of this shared terminal and its permissions in the logs
        self.term_log.info(
            _("{upn} updated sharing permissions on terminal {term} ({title}))")
            .format(
                upn=self.current_user['upn'],
                term=term,
                title=term_obj['title']),
                metadata={'permissions': settings, 'share_id': share_id})
        self.trigger("terminal:permissions", settings)
        # Send the client the permissions information now that it's changed
        self.get_permissions(term)
        self.notify_permissions()

    def remove_viewer(self, term, upn=None):
        """
        Disconnects all callbacks attached to the given *term* for the given
        *upn* and notifies that user that the terminal is no longer shared (so
        it can be shown to be disconnected at the client).

        If *upn* is `None` all users (broadcast viewers included) will have the
        given *term* disconnected.
        """
        cls = ApplicationWebSocket
        term_obj = self.loc_terms[term]
        share_id = term_obj['share_id']
        shared_terms = self.ws.persist['terminal']['shared']
        share_obj = shared_terms[share_id]
        term_app_instance = None
        def disconnect(term_instance, term):
            message = {'terminal:share_disconnected': {'term': term}}
            #self.write_message(json_encode(message))
            if user['upn'] == 'ANONYMOUS':
                cls._deliver(message, session=user['session'])
            else:
                cls._deliver(message, upn=user['upn'])
        for instance in cls.instances:
            try:
                user = instance.current_user
            except AttributeError:
                continue
            if upn and user.get('upn', None) != upn:
                continue
            if share_obj['user'] == user:
                continue # Don't need to "remove" the owner
            for app in instance.apps:
                if isinstance(app, TerminalApplication):
                    # This is that user's instance of the Terminal app
                    term_app_instance = app
                    break
            for u_term_obj in list(term_app_instance.loc_terms.values()):
                if term_obj == u_term_obj:
                    multiplex = u_term_obj['multiplex']
                    self.remove_terminal_callbacks(
                        multiplex, term_app_instance.callback_id)
                    del term_app_instance.loc_terms[term]
                    term_app_instance.clear_term_settings(term)
                    term_app_instance.term_ended(term)
            for i, viewer in enumerate(list(share_obj['viewers'])):
                if viewer['upn'] == user['upn']:
                    share_obj['viewers'].pop(i)
                    break
            if upn and user.get('upn', None) == upn:
                break
        if not term_app_instance:
            return # User is no longer viewing the terminal

    def notify_permissions(self):
        """
        Sends clients the list of shared terminals if they have been granted
        access to any shared terminal.

        .. note::

            Normally this only gets called from
            `~TerminalApplication.permissions` after something changed.
        """
        self.term_log.debug("notify_permissions()")
        cls = ApplicationWebSocket
        users = cls._list_connected_users()
        shared_terms = self.ws.persist['terminal']['shared']
        def send_message(user):
            out_dict = self._shared_terminals_dict(user=user)
            message = {'terminal:shared_terminals': {'terminals': out_dict}}
            if user['upn'] == 'ANONYMOUS':
                cls._deliver(message, session=user['session'])
            else:
                cls._deliver(message, upn=user['upn'])
        for user in users:
            upn = user.get('upn', None)
            if not upn:
                continue
            for share_id, share_dict in shared_terms.items():
                try:
                    if share_dict['user'] == user: # Owner
                        send_message(user)
                        break
                    if 'AUTHENTICATED' in share_dict['read']:
                        send_message(user)
                        break
                    if upn in share_dict['read']:
                        send_message(user)
                        break
                except AttributeError:
                    pass # User disconnected in the middle of this operation

    @require(authenticated(), policies('terminal'))
    def new_share_id(self, settings):
        """
        Generates a new pair of words to act as the share/broadcast ID for a
        given *settings['term']*.  If a 'term' is not provided the currently
        selected terminal will be used.

        Optionally, *settings['share_id'] may be provied to explicitly set it to
        the given value.

        .. note:: The terminal must already be shared with broadcast enabled.
        """
        from gateone.core.utils import random_words
        if 'term' not in settings:
            return # Invalid
        if 'shared' not in self.ws.persist['terminal']:
            return # Nothing to do
        term = int(settings.get('term', self.current_term))
        random_share_id = '-'.join(random_words(2))
        new_share_id = settings.get('share_id', random_share_id)
        shared_terms = self.ws.persist['terminal']['shared']
        term_obj = self.loc_terms[term]
        broadcast_url_template = "{base_url}terminal/shared/{share_id}"
        old_share_id = None
        if new_share_id in shared_terms: # Already exists
            self.write_message(
                _("Share ID '%s' is already in use") % new_share_id)
            return
        for share_id, val in list(shared_terms.items()):
            if val['term_obj'] == term_obj:
                old_share_id = share_id
                broadcast = broadcast_url_template.format(
                    base_url=self.ws.base_url,
                    share_id=new_share_id)
                shared_terms[new_share_id] = shared_terms[share_id]
                shared_terms[new_share_id]['broadcast'] = broadcast
                del shared_terms[share_id]
                self.get_permissions(term)
        self.term_log.info(
            _("{upn} changed share ID of terminal {term} from '{old}'' to "
              "'{new}'").format(
                upn=self.current_user['upn'],
                term=term,
                old=old_share_id,
                new=new_share_id))

    @require(authenticated(), policies('terminal'))
    def get_permissions(self, term):
        """
        Sends the client an object representing the permissions of the given
        *term*.  Example JavaScript:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({
                "terminal:get_permissions": 1
            }));
        """
        if 'shared' not in self.ws.persist['terminal']:
            error_msg = _("Error: Invalid share ID.")
            self.ws.send_message(error_msg)
            return
        out_dict = {'result': 'Success'}
        term_obj = self.loc_terms.get(term, None)
        if not term_obj:
            return # Term doesn't exist
        shared_terms = self.ws.persist['terminal']['shared']
        for share_id, share_dict in shared_terms.items():
            if share_dict['term_obj'] == term_obj:
                out_dict['write'] = share_dict['write']
                out_dict['read'] = share_dict['read']
                out_dict['share_id'] = share_id
                break
        message = {'terminal:sharing_permissions': out_dict}
        self.write_message(json_encode(message))
        self.trigger("terminal:get_sharing_permissions", term)

    @require(authenticated(), policies('terminal'))
    def share_user_list(self, share_id):
        """
        Sends the client a dict of users that are currently viewing the terminal
        associated with *share_id* using the 'terminal:share_user_list'
        WebSocket action.  The output will indicate which users have write
        access.  Example JavaScript:

        .. code-block:: javascript

            var shareID = "notification-chicken";
            GateOne.ws.send(JSON.stringify({
                "terminal:share_user_list": shareID
            }));
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
                user_dict = {
                    'upn': user['upn'],
                    'ip_address': user['ip_address']
                }
                if 'email' in user:
                    user_dict.update({'email': user['email']})
                out_dict['viewers'].append(user_dict)
        if isinstance(share_obj['write'], list):
            for allowed in share_obj['write']:
                out_dict['write'].append(allowed)
        else:
            out_dict['write'] = share_obj['write']
        self.write_message(message)
        self.trigger("terminal:share_user_list", share_id)

    def _shared_terminals_dict(self, user=None):
        """
        Returns a dict containing information about all shared terminals that
        the given *user* has access to.  If no *user* is given
        `self.current_user` will be used.
        """
        out_dict = {}
        if not user:
            user = self.current_user
        shared_terms = self.ws.persist['terminal'].get('shared', {})
        for share_id, share_dict in shared_terms.items():
            owner = False
            auth_or_anon = False
            explicit_user = False
            for read_perm in share_dict['read']:
                if read_perm in ['AUTHENTICATED', 'ANONYMOUS']:
                    auth_or_anon = True
            if user['upn'] in share_dict['read']:
                explicit_user = True
            if share_dict['user']['upn'] == user['upn']:
                owner = True
            if owner or auth_or_anon or explicit_user:
                password = share_dict.get('password', False)
                if password == None:
                    password = False # Looks better at the client this way
                elif password and not owner: # This would be a string
                    password = True # Don't want to reveal it to the client!
                broadcast = share_dict.get('broadcast', False)
                out_dict[share_id] = {
                    'owner': share_dict['user']['upn'],
                    'term': share_dict['term'], # Only useful for the owner
                    'title': share_dict['term_obj']['title'],
                    'read': share_dict['read'],
                    'write': share_dict['write'],
                    'viewers': share_dict['viewers'],
                    'password_protected': password,
                    'broadcast': broadcast
                }
        return out_dict

    @require(authenticated(), policies('terminal'))
    def list_shared_terminals(self):
        """
        Returns a message to the client listing all the shared terminals they
        may access.  Example JavaScript:

        .. code-block:: javascript

            GateOne.ws.send(JSON.stringify({
                "terminal:list_shared_terminals": null
            }));

        The client will be sent the list of shared terminals via the
        `terminal:shared_terminals` WebSocket action.
        """
        out_dict = self._shared_terminals_dict()
        message = {'terminal:shared_terminals': {'terminals': out_dict}}
        self.write_message(json_encode(message))
        self.trigger("terminal:list_shared_terminals")

    # NOTE: This doesn't require authenticated() so anonymous sharing can work
    @require(policies('terminal'))
    def attach_shared_terminal(self, settings):
        """
        Attaches callbacks for the terminals associated with
        *settings['share_id']* if the user is authorized to view the share or if
        the given *settings['password']* is correct (if shared anonymously).

        To attach to a shared terminal from the client:

        .. code-block:: javascript

            settings = {
                "share_id": "ZWVjNGRiZTA0OTllNDJiODkwOGZjNDA2ZWNkNGU4Y2UwM",
                "password": "password here",
                "metadata": {"optional metadata": "would go here"}
            }
            GateOne.ws.send(JSON.stringify({
                "terminal:attach_shared_terminal": settings
            }));

        .. note::

            Providing a password is only necessary if the shared terminal
            requires it.
        """
        cls = ApplicationWebSocket
        self.term_log.debug("attach_shared_terminal(%s)" % settings)
        if 'share_id' not in settings:
            self.term_log.error(_("Invalid share_id."))
            return
        shared_terms = self.ws.persist['terminal'].get('shared', {})
        password = settings.get('password', None)
        share_obj = None
        for share_id, share_dict in shared_terms.items():
            if share_id == settings['share_id']:
                share_obj = share_dict
                break # This is the share_dict we want
        if not share_obj:
            self.ws.send_message(_("Requested shared terminal does not exist."))
            return
        if not share_obj['broadcast']:
            if 'AUTHENTICATED' not in share_obj['read']:
                if self.current_user['upn'] not in share_obj['read']:
                    self.ws.send_message(_(
                        "You are not authorized to view this terminal"))
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
            message = {
                'terminal:term_exists': {
                    'term': term, 'share_id': settings['share_id']
                }
            }
            self.write_message(json_encode(message))
            # This resets the screen diff
            multiplex.prev_output[self.ws.client_id] = [
                None for a in range(multiplex.rows-1)]
        # Setup callbacks so that everything gets called when it should
        self.add_terminal_callbacks(
            term, term_obj['multiplex'], self.callback_id)
        # NOTE: refresh_screen will also take care of cleaning things up if
        #       term_obj['multiplex'].isalive() is False
        self.refresh_screen(term, True) # Send a fresh screen to the client
        self.current_term = term
        # Restore expanded modes (at the client)
        for mode, setting in multiplex.term.expanded_modes.items():
            self.mode_handler(term, mode, setting)
        # Tell the client about this terminal's title
        self.set_title(term, force=True, save=False)
        # TODO: Get this performing lookups in an attribute repository
        metadata = settings.get('metadata', {})
        if not metadata:
            metadata = {} # In case it's null/None
        email = metadata.get('email', None)
        upn = metadata.get('upn', email)
        broadcast_viewer = True
        if self.current_user:
            upn = self.current_user['upn']
            broadcast_viewer = False
        # Add this user to the list of viewers
        current_viewer = self.current_user
        if not current_viewer: # Anonymous broadcast viewer
            current_viewer = {
                'upn': upn,
                'email': email,
                'ip_address': self.ws.request.remote_ip,
                'broadcast': True,
                'client_id': self.ws.client_id
            }
        viewer_dict = { # Limit it so we don't give away sensitive info
            'upn': current_viewer['upn'],
            'email': current_viewer.get('email', email),
            'ip_address': current_viewer['ip_address'],
            'broadcast': current_viewer.get('broadcast', False),
            'client_id': self.ws.client_id
        }
        if 'viewers' not in share_obj:
            share_obj['viewers'] = [viewer_dict]
        else:
            share_obj['viewers'].append(viewer_dict)
        # Make a note of this connection in the logs
        self.term_log.info(
            _("{upn} connected to terminal shared by {owner}").format(
                upn=upn,
                owner=share_obj['user']['upn']),
            metadata=current_viewer)
        out_dict = self._shared_terminals_dict(user=share_obj['user'])
        message = {'terminal:shared_terminals': {'terminals': out_dict}}
        self.write_message(json_encode(message))
        # Notify the owner of the terminal that this user is now viewing:
        notice = _("%s (%s) is now viewing terminal %s" % (
            current_viewer['upn'],
            current_viewer['ip_address'],
            share_obj['term']))
        if upn == 'ANONYMOUS':
            self.ws.send_message(notice, session=share_obj['user']['session'])
            # Also send them an updated shared_terminals list:
            cls._deliver(message, session=share_obj['user']['session'])
        else:
            self.ws.send_message(notice, upn=share_obj['user']['upn'])
            cls._deliver(message, upn=share_obj['user']['upn'])
        def remove_callbacks():
            try:
                self.remove_terminal_callbacks(multiplex, self.callback_id)
            except KeyError:
                pass # Already removed callbacks--no biggie
        if broadcast_viewer:
            detach = partial(self.detach_shared_terminal, {'term': term})
            self.on('terminal:on_close', detach)
        else: # This lets regular users resume
            self.on('terminal:on_close', remove_callbacks)
        self.trigger("terminal:attach_shared_terminal", term)

    @require(policies('terminal'))
    def detach_shared_terminal(self, settings):
        """
        Stops watching the terminal specified via *settings['term']*.
        """
        self.term_log.debug("detach_shared_terminal(%s)" % settings)
        term = settings.get('term', None)
        if not term:
            return # bad settings
        term = int(term)
        if term not in self.loc_terms:
            return # Already detached
        term_obj = self.loc_terms[term]
        multiplex = term_obj['multiplex']
        shared_terms = self.ws.persist['terminal'].get('shared', {})
        if not shared_terms:
            return # Nothing to do
        share_obj = []
        for share_id, share_dict in shared_terms.items():
            if term_obj == share_dict['term_obj']:
                share_obj = share_dict
                break # This is the share dict we want
        # Remove ourselves from the list of viewers for this terminal
        for viewer in list(share_dict['viewers']):
            if viewer['client_id'] == self.ws.client_id:
                share_obj['viewers'].remove(viewer)
        try:
            self.remove_terminal_callbacks(multiplex, self.callback_id)
            del self.loc_terms[term]
            if self.ws.session:
                self.clear_term_settings(term)
        except KeyError:
            pass # Already removed callbacks--no biggie
        finally:
            self.notify_permissions()

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
        colors_json_path = resource_filename(
            'gateone.applications.terminal', '/static/256colors.json')
        color_map = get_settings(colors_json_path, add_default=False)
        # Setup our 256-color support CSS:
        colors_256 = ""
        for i in xrange(256):
            i = str(i)
            fg = "#%s span.✈fx%s {color: #%s;}" % (
                self.ws.container, i, color_map[i])
            bg = "#%s span.✈bx%s {background-color: #%s;} " % (
                self.ws.container, i, color_map[i])
            fg_rev =(
                "#%s span.✈reverse.✈fx%s {background-color: #%s; color: "
                "inherit;}" % (self.ws.container, i, color_map[i]))
            bg_rev =(
                "#%s span.✈reverse.✈bx%s {color: #%s; background-color: "
                "inherit;} " % (self.ws.container, i, color_map[i]))
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
        Sends the 'templates/printing/printing.css' stylesheet to the client
        using `ApplicationWebSocket.ws.send_css` with the "media" set to
        "print".
        """
        print_css_path = resource_filename(
            'gateone.applications.terminal', '/templates/printing/printing.css')
        self.render_and_send_css(
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
            logging.info("%s:%s" % (i, "".join(line)))
            logging.info(renditions[i])
        try:
            from pympler import asizeof
            logging.info("screen size: %s" % asizeof.asizeof(screen))
            logging.info("renditions size: %s" % asizeof.asizeof(renditions))
            logging.info(
                "Total term object size: %s" % asizeof.asizeof(term_obj))
        except ImportError:
            pass # No biggie
        self.ws.debug() # Do regular debugging as well

def apply_cli_overrides(settings):
    """
    Updates *settings* in-place with values given on the command line and
    updates the `options` global with the values from *settings* if not provided
    on the command line.
    """
    # Figure out which options are being overridden on the command line
    arguments = []
    terminal_options = ('dtach', 'syslog_session_logging', 'session_logging')
    for arg in list(sys.argv)[1:]:
        if not arg.startswith('-'):
            break
        else:
            arguments.append(arg.lstrip('-').split('=', 1)[0])
    for argument in arguments:
        if argument not in terminal_options:
            continue
        if argument in options:
            settings[argument] = options[argument]
    for key, value in settings.items():
        if key in options:
            if str == bytes: # Python 2
                if isinstance(value, unicode):
                    # For whatever reason Tornado doesn't like unicode values
                    # for its own settings unless you're using Python 3...
                    value = str(value)
            setattr(options, key, value)

def init(settings):
    """
    Checks to make sure 50terminal.conf is created if terminal-specific settings
    are not found in the settings directory.

    Also checks to make sure that the logviewer.py script is executable.
    """
    term_log = go_logger("gateone.terminal")
    logviewer_path = resource_filename(
        'gateone.applications.terminal', '/logviewer.py')
    import stat
    st = os.stat(logviewer_path)
    if not bool(st.st_mode & stat.S_IXOTH):
        try:
            os.chmod(logviewer_path, 0o755)
        except OSError:
            # We don't have permission to change it.  Not a big deal.
            pass
    terminal_options = ( # These are now terminal-app-specific setttings
        'command', 'dtach', 'session_logging', 'syslog_session_logging'
    )
    if os.path.exists(options.config):
        # Get the old settings from the old config file and use them to generate
        # a new 50terminal.conf
        if 'terminal' not in settings['*']:
            settings['*']['terminal'] = {}
        with io.open(options.config, encoding='utf-8') as f:
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
    required_settings = ('commands', 'default_command', 'session_logging')
    term_settings = settings['*'].get('terminal', {})
    generate_terminal_config = False
    for setting in required_settings:
        if setting not in term_settings:
            generate_terminal_config = True
    if not term_settings or generate_terminal_config:
        # Create some defaults and save the config as 50terminal.conf
        settings_path = options.settings_dir
        terminal_conf_path = os.path.join(settings_path, '50terminal.conf')
        if not os.path.exists(terminal_conf_path):
            from gateone.core.configuration import settings_template
            template_path = resource_filename(
                'gateone.applications.terminal',
                '/templates/settings/50terminal.conf')
            settings['*']['terminal'] = {}
            # Update the settings with defaults
            ssh_connect_path = resource_filename(
                'gateone.applications.terminal',
                '/plugins/ssh/scripts/ssh_connect.py')
            default_command = (
              "{0} -S "
              r"'%SESSION_DIR%/%SESSION%/%SHORT_SOCKET%' --sshfp "
              r"-a '-oUserKnownHostsFile=\"%USERDIR%/%USER%/.ssh/known_hosts\"'"
            ).format(ssh_connect_path)
            settings['*']['terminal'].update({
                'dtach': True,
                'session_logging': True,
                'syslog_session_logging': False,
                'commands': {
                    'SSH': {
                        "command": default_command,
                        "description": "Connect to hosts via SSH."
                    }
                },
                'default_command': 'SSH',
                'environment_vars': {
                    'TERM': 'xterm-256color'
                },
                'enabled_filetypes': 'all'
            })
            new_term_settings = settings_template(
                template_path, settings=settings['*']['terminal'])
            with io.open(terminal_conf_path, 'w', encoding='utf-8') as s:
                s.write(_(
                    "// This is Gate One's Terminal application settings "
                    "file.\n"))
                s.write(new_term_settings)
    term_settings = settings['*']['terminal']
    if options.kill:
        from gateone.core.utils import killall
        go_settings = settings['*']['gateone']
        # Kill all running dtach sessions (associated with Gate One anyway)
        killall(go_settings['session_dir'], go_settings['pid_file'])
        # Cleanup the session_dir (it is supposed to only contain temp stuff)
        import shutil
        shutil.rmtree(go_settings['session_dir'], ignore_errors=True)
        sys.exit(0)
    if not which('dtach'):
        term_log.warning(
            _("dtach command not found.  dtach support has been disabled."))
    apply_cli_overrides(term_settings)
    # Fix the path to known_hosts if using the old default command
    for name, command in term_settings['commands'].items():
        if '\"%USERDIR%/%USER%/ssh/known_hosts\"' in command:
            term_log.warning(_(
                "The default path to known_hosts has been changed.  Please "
                "update your settings to use '/.ssh/known_hosts' instead of "
                "'/ssh/known_hosts'.  Applying a termporary fix..."))
            term_settings['commands'][name] = command.replace('/ssh/', '/.ssh/')
    # Initialize plugins so we can add their 'Web' handlers
    enabled_plugins = settings['*']['terminal'].get('enabled_plugins', [])
    plugins = entry_point_files('go_terminal_plugins', enabled_plugins)
    # Attach plugin hooks
    plugin_hooks = {}
    for name, plugin in plugins['py'].items():
        try:
            plugin_hooks.update({plugin.__name__: plugin.hooks})
        except AttributeError:
            pass # No hooks, no problem
    # Add static handlers for all the JS plugins (primarily for source maps)
    url_prefix = settings['*']['gateone']['url_prefix']
    plugins = set(
        plugins['py'].keys() + plugins['js'].keys() + plugins['css'].keys())
    for plugin in plugins:
        name = plugin.split('.')[-1]
        plugin_static_url = r"{prefix}terminal/{name}/static/(.*)".format(
            prefix=url_prefix, name=name)
        handler = (plugin_static_url, StaticHandler, {
            "path": '/static/',
            'use_pkg': plugin
        })
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
    {"path": resource_filename('gateone.applications.terminal', '/static')}
))
web_handlers.append((r'terminal/shared/(.*)', SharedTermHandler))

# Command line argument commands
commands = {
    'termlog': {
        'function': logviewer_main,
        'description': _("View terminal session logs.")
    }
}
