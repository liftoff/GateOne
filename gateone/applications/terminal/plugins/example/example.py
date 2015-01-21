# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
example.py - A plugin to demonstrate how to write a Python plugin for Gate One.
Specifically, how to write your own web handlers, WebSocket actions, and take
advantage of all the available hooks and built-in functions.

.. tip:: This plugin is heavily commented with useful information.  Click on the `[source]` links to the right of any given class or function to see the actual code.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'Web': [(r"/example", ExampleHandler)],
        'WebSocket': {
            'example_action': example_websocket_action
        },
        'Escape': example_opt_esc_handler,
    }

Docstrings
----------
"""

# Meta information about the plugin.  Your plugin doesn't *have* to have this
# but it is a good idea.
__version__ = '1.0'
__license__ = "Apache 2.0" # The "just don't sue me" license
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# I like to start my files with imports from Python's standard library...
import os

# Then I like to import things from Gate One itself or my own stuff...
from gateone.core.server import BaseHandler
#from gateone import GATEONE_DIR # <--if you need that path it's here

# This is where I'd typically put 3rd party imports such as Tornado...
import tornado.escape
import tornado.web

# Globals
# This is in case we have relative imports, templates, or whatever:
PLUGIN_PATH = os.path.split(__file__)[0] # Path to our plugin's directory

# Traditional web handler
class ExampleHandler(BaseHandler):
    """
    This is how you add a URL handler to Gate One...  This example attaches
    itslef to https://<your Gate One server>/example in the 'Web' hook at the
    bottom of this file.  It works just like any Tornado
    :class:`~tornado.web.RequestHandler`.  See:

    http://www.tornadoweb.org/documentation/web.html

    ...for documentation on how to write a :class:`tornado.web.RequestHandler` for
    the Tornado framework.  Fairly boilerplate stuff.

    .. note:: The only reason we use :class:`gateone.BaseHandler` instead of a vanilla :class:`tornado.web.RequestHandler` is so we have access to Gate One's :func:`gateone.BaseHandler.get_current_user` function.
    """
    @tornado.web.authenticated # Require the user be authenticated
    def get(self):
        """
        Handle an HTTP GET request to this :class:`~tornado.web.RequestHandler`.
        Connect to:

        https://<your Gate One server>/example

        ...to try it out.
        """
        # This is all that's in example_template.html (so you don't have to open
        # it separately):
        #   <html><head><title>{{bygolly}}, it works!</title></head>
        #   <body>
        #   <p>You're logged in as: {{user}}.</p>
        #   <p>Your session ID ends with {{session}}.</p>
        #   </body>
        #   </html>
        #
        # NOTE: I highly recommend using os.path.join() instead of just using
        # '/' everywhere...  You never know; Gate One might run on Windows one
        # day!
        templates_path = os.path.join(PLUGIN_PATH, "templates")
        example_template =  os.path.join(templates_path, "example_template.html")
        bygolly = "By golly"
        # The get_current_user() function returns a whole dict of information.
        # What's available in there is dependent on which authentication type
        # you're using but you can be assured that 'upn' and 'session' will
        # always be present.
        user_dict = self.get_current_user()
        # Gate One refers to the username as a userPrincipalName (like Kerberos)
        # or 'upn' for short.  Why?  Because it might actually be a username
        # plus a realm or domain name.  e.g. user@REALM or user@company.com
        username = user_dict['upn']
        session = user_dict['session'][:3] # Just the last three (for security)
        self.render(
            example_template, # The path to a template file
            bygolly=bygolly, # Just match up your template's {{whatever}} with
            user=username,   # the keyword arguments passed to self.render()
            session=session)

    def post(self):
        """
        Example Handler for an `HTTP POST <http://en.wikipedia.org/wiki/POST_(HTTP)>`_
        request.  Doesn't actually do anything.
        """
        # If data is POSTed to this handler via an XMLHTTPRequest send() it
        # will show up like this:
        #posted_as_a_whole = self.request.body # xhr.send()
        # If data was POSTed as arguments (i.e. traditional form) it will show
        # up as individual arguments like this:
        #posted_as_argument = self.get_argument("arg") # Form elem 'name="arg"'
        # This is how you can parse JSON:
        #parsed = tornado.escape.json_decode(posted_as_an_argument)
        json_output = {'result': 'Success!'}
        self.write(json_output)
        # You'd put self.finish() here if post() was wrapped with tornado's
        # asynchronous decorator.

# WebSocket actions (aka commands or "functions that are exposed")
def example_websocket_action(self, message):
    """
    This `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_
    action gets exposed to the client automatically by way of the 'WebSocket'
    hook at the bottom of this file.  The way it works is like this:

    .. rubric:: How The WebSocket Hook Works

    Whenever a message is received via the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_
    Gate One will automatically
    decode it into a Python :class:`dict` (only JSON-encoded messages are accepted).
    Any and all keys in that :class:`dict` will be assumed to be 'actions' (just
    like :js:attr:`GateOne.Net.actions` but on the server) such as this one.  If
    the incoming key matches a registered action that action will be called
    like so::

        key(value)
        # ...or just:
        key() # If the value is None ('null' in JavaScript)

    ...where *key* is the action and *value* is what will be passed to said
    action as an argument.  Since Gate One will automatically decode the message
    as JSON the *value* will typically be passed to actions as a single :class:`dict`.
    You can provide different kinds of arguments of course but be aware that
    their ordering is unpredictable so always be sure to either pass *one*
    argument to your function (assuming it is a :class:`dict`) or 100% keyword
    arguments.

    The *self* argument here is automatically assigned by
    :class:`TerminalApplication` using the `utils.bind` method.

    The typical naming convention for `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_
    actions is: `<plugin name>_<action>`.  Whether or not your action names
    match your function names is up to you.  All that matters is that you line
    up an *action* (string) with a *function* in `hooks['WebSocket']` (see below).

    This `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_
    *action* duplicates the functionality of Gate One's built-in
    :func:`gateone.TerminalWebSocket.pong` function.  You can see how it is
    called by the client (browser) inside of example.js (which is in this
    plugin's 'static' dir).
    """
    timestamp = "just pretend"
    message = {'terminal:example_pong': timestamp}
    self.write_message(message)
    # WebSockets are asynchronous so you can send as many messages as you want
    message2 = {'go:notice': 'You just executed the "example_action" action.'}
    self.write_message(message2)
    # Alternatively, you can combine multiple messages/actions into one message:
    combined = {
        'go:notice': 'Hurray!',
        'terminal:bell': {'term': self.current_term}
    }
    self.write_message(combined)

# Now for some special sauce...  The Special Optional Escape Sequence Handler!
def example_opt_esc_handler(self, message, term=None, multiplex=None):
    """
    Gate One includes a mechanism for plugins to send messages from terminal
    programs directly to plugins written in Python.  It's called the "Special
    Optional Escape Sequence Handler" or SOESH for short.  Here's how it works:
    Whenever a terminal program emits, "\\x1b]_;" it gets detected by Gate One's
    :class:`~terminal.Terminal` class (which lives in `terminal.py`) and it will
    execute whatever callback is registered for SOESH.  Inside of Gate One this
    callback will always be :func:`gateone.TerminalWebSocket.esc_opt_handler`.
    """
    message = {'go:notice':
     "You just executed the Example plugin's optional escape sequence handler!"}
    self.write_message(message)

def example_command_hook(self, command, term=None):
    """
    This demonstrates how to modify Gate One's configured 'command' before it is
    executed.  It will replace any occurrance of %EXAMPLE% with 'foo'.  So if
    'command = "some_script.sh %EXAMPLE%"' in your server.conf it would be
    transformed to "some_script.sh foo" before being executed when a user opens
    a new terminal.
    """
    return command.replace(r'%EXAMPLE%', 'foo')

# SOESH allows plugins to attach actions that will be called whenever a terminal
# encounters the

# Without this 'hooks' dict your plugin might as well not exist from Gate One's
# perspective.
hooks = {
    'Web': [(r"/example", ExampleHandler)],
    'WebSocket': {
        'terminal:example_action': example_websocket_action
    },
    'Command': example_command_hook,
    'Escape': example_opt_esc_handler,
    'Environment': {
        'EXAMPLE_VAR': 'This was set via the Example plugin'
    }
}
