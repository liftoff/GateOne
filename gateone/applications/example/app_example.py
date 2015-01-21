# -*- coding: utf-8 -*-
#
#    LICENSE: Public Domain with NO WARRANTY.  Feel free to use it as a base
#             for developing your own Gate One application(s).  You may then
#             use whatever license you see fit.
#

__doc__ = """\
A Gate One Application (`GOApplication`) that provides an example of how to
write a Gate One Application.

.. note::

    This application is hidden by default to show it make sure to set the
    ``HIDDEN`` variable to ``False``.
"""
HIDDEN = True

# Meta information about the plugin.  Your plugin doesn't *have* to have this
# but it is a good idea.
__version__ = '1.0'
__license__ = "Public Domain" # Replace this with your own license
__version_info__ = (1, 0)
__author__ = 'You <you@domain.com>'

# Import stdlib stuff
import os

# Import Gate One stuff
# These are things you'll definitely need:
from gateone.core.server import GOApplication
from gateone.auth.authorization import require, authenticated
from gateone.auth.authorization import applicable_policies, policies
from gateone.core.log import go_logger # So your app will have its own log
# These are things you'll *probably* need:
from gateone.core.server import BaseHandler
from gateone.core.utils import bind
# If you want your app to be able to use its own plugins you'll need these:
from gateone.core.utils import entry_point_files
# You can use this for providing localization but you could just use the stdlib
# gettext stuff if you want:
from gateone.core.locale import get_translation


# 3rd party imports
# You can add command line options to Gate One with define():
from tornado.options import define, options
# You need 'options' to get define()'d values

# Globals
SESSIONS = {} # This will get replaced with gateone.py's SESSIONS dict
# NOTE: The overwriting of SESSIONS happens inside of gateone.py as part of
# the application initialization process.
APPLICATION_PATH = os.path.split(__file__)[0] # Path to our application
web_handlers = [] # Populated at the bottom of this file
example_log = go_logger("gateone.example") # Our app's logger
# NOTE: You can pass additional metadata to logs which will be JSON-encoded
# when your messages are logged.  Examples of how to do this are further along
# in this file...

# Localization support
_ = get_translation() # You don't *have* to do this but it is a good idea

# This is how you add command-line options to Gate One:
define(
    "example_option", # NOTE: underscores are the preferred word separator here
    default=True,
    help=_("Doesn't do anything (just an example from the example app).")
)
# You could then reference this option like so:
# print(options.example_option)

ALLOW = True # Used by polcy_example() below
def policy_test_example(cls, policy):
    """
    An example policy-checking function.  It will return ``True`` if conditions
    are met.  ``False`` if not.

    This function just checks that the ALLOW global is set to ``True`` but you
    can have functions like this check whatever you want.  It will have access
    to the current instance of your application via ``cls.instance``.

    See the comments for details on how it works.
    """
    instance = cls.instance # This is how to access the current app instance
    session = instance.ws.session # The user's session ID
    user = instance.current_user # The current user dict
    # If you want to check the arguments passed to the decorated function you
    # can examine cls.f_args:
    f_args = cls.f_args # Wrapped function's arguments
    # You can access keyword arguments the same way:
    f_kwargs = cls.kw_args # Wrapped function's keyword arguments
    function = cls.function # Wrapped function (in case you need it)
    # Here's how to get the locations dict (if your app supports this feature):
    locations = SESSIONS[session]['locations']
    if ALLOW:
        return True
    else:
        example_log.error(_(
            "%s denied access to the 'test_example' function by policy."
            % user['upn']))
        return False

def example_policies(cls):
    """
    This function gets registered under 'example' in the
    :attr:`gateone.ApplicationWebSocket.security` dict and is called by the
    :func:`auth.require` decorator by way of the :class:`auth.policies`
    sub-function. It returns ``True`` or ``False`` depending on what is defined
    in the settings dir and what function is being called.
    """
    instance = cls.instance # Your Application instance
    function = cls.function # Wrapped function
    f_args = cls.f_args     # Wrapped function's arguments
    f_kwargs = cls.f_kwargs # Wrapped function's keyword arguments
    # This is a convenient way to map function/method names to specific policy
    # functions:
    policy_functions = {
        'test_example': policy_test_example,
    }
    user = instance.current_user
    # The applicable_policies() function takes an application 'scope', a user
    # dict (must have a 'upn' key), and a dict that contains all of Gate One's
    # settings (always available via ApplicationWebSocket.prefs) and returns
    # a single dict containing the merged settings (aka policies) for that
    # scope.
    # In other words, if you have this inside a file in gateone/settings/:
    #    {
    #        "*": {
    #            "example": {
    #                "foo": "bar"
    #            }
    #        },
    #        "user.upn=joe@company.com": {
    #            "example": {
    #                "foo": "joe!"
    #            }
    #        }
    #    }
    #
    # applicable_policies() would return:
    #
    #    {"foo": "bar"}
    #
    # for regular users but joe@company.com would get:
    #
    #    {"foo": "joe!"}
    policy = applicable_policies('example', user, instance.ws.prefs)
    if not policy: # No policies found for the given scope
        return True # A world without limits!
    # Check the basics first...  Is {"allow": true}?
    if 'allow' in policy: # Only check this if there's an "allow" somewhere
        if not policy['allow']: # User is DENIED!
            example_log.error(_(
                "%s denied access to the Example application by policy."
                % user['upn']))
            return False
    # Here we run through our policy_functions dict and call the appropriate
    # policy-checking function that matches the decorated method's name:
    if function.__name__ in policy_functions:
        return policy_functions[function.__name__](cls, policy)
    return True # Default to permissive if we made it this far

class ExampleHandler(BaseHandler):
    """
    Renders example.html to demonstrate how to add a URL handler to an
    application.
    """
    def get(self):
        # Our example.html template is inside the application's 'templaces' dir:
        template_path = os.path.join(APPLICATION_PATH, 'templates')
        example_template_path = os.path.join(template_path, 'example.html')
        self.render(
            example_template_path,
            foo="bar" # An example of passing a value to a template
        )

# Notice that I've scattered many calls to example_log.debug() and
# example_log.info() throughout this app.  Be sure to use your own logger
# instead of just 'logging.<level>' so that your application logs can be easily
# differentiated from other parts of Gate One.  All logs still go to the main,
# 'gateone.log' so you don't have to worry about being cut out of the fun :)
class ExampleApplication(GOApplication):
    """
    A Gate One Application (`GOApplication`) that serves as an example of how
    to write a Gate One application.
    """
    info = {
        'name': "Example", # A user-friendly name for your app
        'version': __version__,
    # A description of what your app does:
        'description': "An example of how to write a Gate One Application.",
        'hidden': HIDDEN
    }
    def __init__(self, ws):
        example_log.debug("ExampleApplication.__init__(%s)" % ws)
        # Having your app's policies handy is a good idea.  However, you can't
        # get them until you've got a user to pass to applicable_policies().
        # For this reason we'll place a `self.policy` placeholder here and
        # assign it after the user authenticates (successfully)...
        self.policy = {} # Gets set in authenticate() below
        # If you override __init__() (like we are here) don't forget to call
        # the parent __init__():
        GOApplication.__init__(self, ws)

    def initialize(self):
        """
        Called when the WebSocket is instantiated, sets up our WebSocket
        actions, security policies, and attaches all of our plugin hooks/events.
        """
        example_log.debug("ExampleApplication.initialize()")
        # Register our security policy function in the 'security' dict
        self.ws.security.update({'example': example_policies})
        # Register some WebSocket actions...
        # These can be called from the client like so:
        # GateOne.ws.send(JSON.stringify({'example:test_example': whatever}));
        self.ws.actions.update({
            'example:test_example': self.test_example,
        })
        # Gate One provides a location where you can store information that you
        # want to be persistent across user sesions/connections and whatnot:
        if 'example' not in self.ws.persist:
            # If it doesn't belong in SESSIONS but you still need it to stick
            # around after the user disconnects put it here:
            self.ws.persist['example'] = {}
        # NOTE: If you don't care about your app having its own plugins you can
        # delete everything from here until the end of this function.
        # -- BEGIN PLUGIN CODE --
        # If you want your app to support plugins here's how you do it:
        # First let's check if someone has explicitly given us a list of plugins
        # that should be enabled (so we can exclude the others):
        enabled_plugins = self.ws.prefs['*']['example'].get(
            'enabled_plugins', [])
        # Now we'll use Gate One's utils.entry_point_files() function to find
        # and import all our Python, JavaScript, and CSS plugin files.  This is
        # really only so we can log which plugins are enabled because the
        # process of importing Python plugins happens inside of init() and
        # JS/CSS plugin files get sent via the send_plugin_static_files()
        # function inside of authenticate().
        self.plugins = entry_point_files( # Get everything in example/plugins/
            'go_example_plugins', enabled_plugins)
        # Now let's separate the plugins by type (to save some typing)
        py_pluings = []
        for module in self.plugins['py']:
            py_plugins.append(module.__name__)
        js_plugins = []
        for js_path in self.plugins['js']:
            name = js_path.split(os.path.sep)[-2]
            name = os.path.splitext(name)[0]
            js_plugins.append(name)
        css_plugins = []
        for css_path in css_plugins:
            name = css_path.split(os.path.sep)[-2]
            css_plugins.append(name)
        plugin_list = list(set(py_plugins + js_plugins + css_plugins))
        plugin_list.sort() # So there's consistent ordering
        example_log.info(_(
            "Active Example Plugins: %s" % ", ".join(plugin_list)))
        # Now let's attach plugin hooks.  Plugin hooks can be whatever you like
        # and called from anywhere in your application.  There's three types of
        # hooks you'll definitely want though:  initialize(), 'WebSocket' and
        # 'Events'
        #
        # The initialize() hook just calls a given plugin's "initializ()"
        # function if it has one.  The function will be passed `self` (the
        # current instance of your app).  This allows plugins to take care of
        # any initialization stuff that needs to happen before anything else.
        #
        # 'WebSocket' hooks are what allow plugins to add their own WebSocket
        # actions such as, "myplugin:do_something" which is a very important
        # part of Gate One.
        #
        # 'Events' hooks allow plugins to attach functions to `OnOff` events
        # such as 'self.on("example:some_event", handle_some_event)'
        #
        # With those three kinds of hooks plugins can add or override pretty
        # much anything.
        #
        # NOTE: All GOApplication instances include the OnOff mixin class so
        # they can use self.on(), self.off, self.trigger(), and self.once()
        #
        # How do plugins assign these hooks?  They simply include a 'hooks' dict
        # somewhere in the global scope of their .py files.  Example:
        # hooks = {
        #     'WebSocket': {'myplugin:some_func': some_func}
        #     'Events': {'example:authenticate': auth_func}
        # }
        self.plugin_hooks = {} # We'll store our plugin hooks here
        for plugin in imported:
            try:
                # Add the plugin's hooks dict to self.plugin_hooks:
                self.plugin_hooks.update({plugin.__name__: plugin.hooks})
                # Now we'll call the plugin's initialize() function:
                if hasattr(plugin, 'initialize'):
                    plugin.initialize(self)
            except AttributeError:
                pass # No hooks--probably just a supporting .py file.
        # Now we hook up the hooks:
        for plugin_name, hooks in self.plugin_hooks.items():
            if 'WebSocket' in hooks:
                # Apply the plugin's WebSocket actions to ApplicationWebSocket
                for ws_command, func in hooks['WebSocket'].items():
                    self.ws.actions.update({ws_command: bind(func, self)})
                # Attach the plugin's event hooks to their respective events:
            if 'Events' in hooks:
                for event, callback in hooks['Events'].items():
                    self.on(event, bind(callback, self))
        # -- END PLUGIN CODE --

    def open(self):
        """
        This gets called at the end of :meth:`ApplicationWebSocket.open` when
        the WebSocket is opened.  It just triggers the "example:open" event.

        .. note::

            The authenticate() method is usually a better place to call stuff
            that needs to happen after the user loads the page.
        """
        example_log.debug('ExampleApplication.open()')
        self.trigger("example:open")

    def authenticate(self):
        """
        This gets called immediately after the user is authenticated
        successfully at the end of :meth:`ApplicationWebSocket.authenticate`.
        Sends all plugin JavaScript files to the client and triggers the
        'example:authenticate' event.
        """
        example_log.debug('ExampleApplication.authenticate()')
        # This is the log metadata that was mentioned near the top of this file.
        # This log_metadata will be JSON-encoded and included in all log
        # messages that use `self.example_log` which is super useful when
        # you need to parse logs at some later date and want to know the
        # circumstances surrounding any given message.
        self.log_metadata = {
            'upn': self.current_user['upn'],
            'ip_address': self.ws.request.remote_ip,
            # If your app uses the location feature make sure to include it:
            'location': self.ws.location
        }
        self.example_log = go_logger("gateone.example", **self.log_metadata)
        # NOTE:  To include even *more* metadata in a log message on a one-time
        # basis simply pass the metadata to the logger like so:
        #   self.example_log("Some log message", metadata={'foo': 'bar'})
        # That will ensure that {'foo': 'bar'} is included in the JSON portion
        # Assign our user-specific settings/policies for quick reference
        self.policy = applicable_policies(
            'example', self.current_user, self.ws.prefs)
        # NOTE:  The applicable_policies() function *is* memoized but the above
        #        is still much faster.
        # Start by determining if the user can even use this app
        if 'allow' in self.policy:
            # This is the same check inside example_policies().  Why put it here
            # too?  So we can skip sending the client JS/CSS that they won't be
            # able to use.
            if not self.policy['allow']:
                # User is not allowed to access this application.  Don't
                # bother sending them any static files and whatnot...
                self.example_log.debug(_(
                    "User is not allowed to use the Example application.  "
                    "Skipping post-authentication functions."))
                return
        # Render and send the client our example.css
        example_css = os.path.join(
            APPLICATION_PATH, 'templates', 'example.css')
        self.render_and_send_css(example_css, element_id="example.css")
        # NOTE:  See the Gate One docs for gateone.py to see how
        #        render_and_send_css() works.  It auto-minifies and caches!
        # Send the client our application's static JavaScript files
        static_dir = os.path.join(APPLICATION_PATH, 'static')
        js_files = []
        if os.path.isdir(static_dir):
            js_files = os.listdir(static_dir) # Everything in static/*.js
            js_files.sort()
        for fname in js_files:
            if fname.endswith('.js'):
                js_file_path = os.path.join(static_dir, fname)
                # This is notable:  To ensure that all your JavaScript files
                # get loaded *after* example.js we add 'example.js' as a
                # dependency for all JS files we send to the client.
                if fname == 'example.js':
                    # Adding CSS as a dependency to your app's JS is also a
                    # good idea.  You could also put 'theme.css' if you want to
                    # ensure that the theme gets loaded before your JavaScript
                    # init() function is called.
                    self.send_js(js_file_path, requires=["example.css"])
                else:
                    # Send any other discovered JS files to the client with
                    # example.js as the only dependency.
                    self.send_js(js_file_path, requires='example.js')
        # If you're not using plugins you can disregard this:
        # The send_plugin_static_files() function will locate any JS/CSS files
        # in your plugins' respective static directories and send them to the
        # client.  It is also smart enough to know which plugins are enabled
        # or disabled.
        self.ws.send_plugin_static_files(
            os.path.join(APPLICATION_PATH, 'plugins'),
            application="example",
            requires=["example.js"])
        sess = SESSIONS[self.ws.session] # A shortcut to save some typing
        # Create a place to store app-specific stuff related to this session
        # (but not necessarily this 'location')
        if "example" not in sess:
            sess['example'] = {} # A mostly persistent place to store info
        # If you want to call a function whenever Gate One exits just add it
        # to SESSIONS[self.ws.session]["kill_session_callbacks"] like so:
        #if kill_session_func not in sess["kill_session_callbacks"]:
            #sess["kill_session_callbacks"].append(kill_session_func)
        # If you want to call a function whenever a user's session times out
        # just attach it to SESSIONS[self.ws.session]["timeout_callbacks"]
        # like so:
        #if timeout_session_func not in sess["timeout_callbacks"]:
            #sess["timeout_callbacks"].append(timeout_session_func)
        # NOTE: The user will often be authenticated before example.js is
        # loaded.  In fact, the only time this won't be the case is when the
        # user is disconnected (e.g. server restart) and then reconnects.
        self.trigger("example:authenticate")

    def on_close(self):
        """
        This method gets called when the WebSocket connection closes
        (disconnected).  Triggers the `example:on_close` event.
        """
        # This is a nice little check to prevent you from calling all sorts
        # of uninitialization/teardown stuff when you don't need to:
        if not hasattr(self.ws, 'location'):
            return # Connection closed before authentication completed
        # Here's where you'd deal with any uninitialization/teardown stuff
        self.trigger("example:on_close")

    @require(authenticated(), policies('example'))
    def test_example(self, settings):
        """
        This is an example WebSocket action that sends a message to the client
        indicating that it was called successfully.  Calls the
        `example:test_example` event when complete.
        """
        self.ws.send_message(_(
            "The test_example WebSocket action was called successfully!"))
        self.ws.send_message(_("Here's what was recieved: %s") % repr(settings))
        self.trigger("example:test_example", settings)

# Application init() functions are called inside of gateone.main() after global
# plugins are loaded, command line options are parsed, and settings get loaded.
# The init() function will be passed Gate One's *settings* dict (same as
# 'ApplicationWebSocket.prefs') as the only argument.
def init(settings):
    """
    Checks to make sure 50example.conf is created if example-specific settings
    are not found in the settings directory.  Basically, it creates some
    defaults to make things easier on users.
    """
    # I put this code here because I know someone was going to ask, "How do I
    # setup initial preferences and whatnot?"
    if 'example' not in settings['*']:
        # Create some defaults and save the config as 50example.conf
        settings_path = options.settings_dir
        # This is the final destination of our 50example.conf:
        example_conf_path = os.path.join(settings_path, '50example.conf')
        if not os.path.exists(example_conf_path): # Only if not already present
            from gateone.core.utils import settings_template
            template_path = os.path.join(
                APPLICATION_PATH, 'templates', 'settings', '50example.conf')
            settings['*']['example'] = {}
            # Update the settings with defaults
            settings['*']['example'].update({
                'allow': True,
                'example_option': 'An example option',
            })
            new_settings = settings_template(
                template_path, settings=settings['*']['example'])
            with open(example_conf_path, 'w') as s:
                # Add a nice comment/header before everything else:
                s.write(_(
                    "// This is Gate One's Example application settings "
                    "file.\n"))
                s.write(new_settings)

# Tell Gate One which classes are applications
apps = [ExampleApplication] # Very important!
# Tell Gate One about our example handler (all handlers in the global
# 'web_handlers' will be automatically assigned inside of gateone.main()).
web_handlers.append((r'example/(.*)', ExampleHandler))
