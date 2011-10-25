# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
ssh.py - A plugin for Gate One that adds additional SSH-specific features.
"""

# Meta
__version__ = '0.9'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os
import logging

# Our stuff
from gateone import BaseHandler
from utils import get_translation

_ = get_translation()

# Tornado stuff
import tornado.web
from tornado.escape import json_encode, json_decode
from tornado.options import define

# Helper functions
# TODO: make execute_command() a user-configurable option...  So it will automatically run whatever command(s) the user likes via a back-end channel whenever they connect to a given server.  Maybe even differentiate between when they connect and when they start up a master or slave channel.
def execute_command(session, term, cmd):
    """
    Execute the given command (*cmd*) on the given *term* using the existing
    SSH tunnel (taking advantage of Master mode) and return the result.
    """

# Handlers
class KnownHostsHandler(BaseHandler):
    """
    This handler allows the client to view, edit, and upload the known_hosts
    file associated with their user account.
    """
    @tornado.web.authenticated
    def get(self):
        """
        Determine what the user is asking for and call the appropriate method.
        """ # NOTE: Just dealing with known_hosts for now but keys are next
        get_kh = self.get_argument('known_hosts', None)
        if get_kh:
            self._return_known_hosts()

    @tornado.web.authenticated
    def post(self):
        """
        Determine what the user is updating by checking the given arguments and
        proceed with the update.
        """
        known_hosts = self.get_argument('known_hosts', None)
        if known_hosts:
            kh = self.request.body
            self._save_known_hosts(kh)

    def _return_known_hosts(self):
        """Returns the user's known_hosts file in text/plain format."""
        user = self.get_current_user()['go_upn']
        logging.debug("known_hosts requested by %s" % user)
        kh_path = "%s/%s/known_hosts" % (self.settings['user_dir'], user)
        known_hosts = ""
        if os.path.exists(kh_path):
            known_hosts = open(kh_path).read()
        self.set_header ('Content-Type', 'text/plain')
        self.write(known_hosts)

    def _save_known_hosts(self, known_hosts):
        """Save the given *known_hosts* file."""
        user = self.get_current_user()['go_upn']
        kh_path = "%s/%s/known_hosts" % (self.settings['user_dir'], user)
        # Letting Tornado's exception handler deal with errors here
        f = open(kh_path, 'w')
        f.write(known_hosts)
        f.close()
        self.write("success")

# WebSocket commands (not the same as handlers)
def get_connect_string(term, tws):
    """
    Writes the connection string associated with *term* to the websocket like
    so:
        {'sshjs_reconnect': json_encode({*term*: <connection string>})}

    In ssh.js we attach an action (aka handler) to GateOne.Net.actions for
    'sshjs_reconnect' messages that attaches the connection string to
    GateOne.terminals[*term*]['sshConnectString']
    """
    session = tws.session
    session_dir = tws.settings['session_dir']
    for f in os.listdir(session_dir + '/' + session):
        if f.startswith('ssh:'):
            terminal, a_colon, connect_string = f[4:].partition(':')
            terminal = int(terminal)
            if terminal == term:
                message = {
                    'sshjs_reconnect': json_encode({term: connect_string})
                }
                tws.write_message(json_encode(message))
                return # All done

# Special optional escape sequence handler (see docs on how it works)
def opt_esc_handler(text, tws):
    """
    Handles text passed from the special optional escape sequance handler.  We
    use it to tell ssh.js what the SSH connection string is so it can use that
    information to duplicate sessions (if the user so desires).  For reference,
    the specific string which will call this function from a terminal app is:
        \x1b]_;ssh|<whatever>\x07
    """
    message = {'sshjs_connect': text}
    tws.write_message(json_encode(message))

hooks = {
    'Web': [(r"/ssh", KnownHostsHandler)],
    'WebSocket': {
        'sshjs_get_connect_string': get_connect_string
    },
    'Escape': opt_esc_handler,
}