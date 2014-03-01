# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#
#   Thanks to Alan Schmitz for contributing the original version of this module!

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__doc__ = """
.. _pam.py:

PAM Authentication Module for Gate One
======================================

This authentication module is built on top of :ref:`ctypes-pam` which is
included with Gate One.

It was originally written by Alan Schmitz (but has changed quite a bit).

The only non-obvious aspect of this module is that the pam_realm setting is only
used when the user is asked to authenticate and when the user's information is
stored in the 'users' directory.  It isn't actually used in any part of the
authentication (PAM doesn't take a "realm" setting).
"""

# Standard library modules
import base64, logging

# Our modules
try:
    from .ctypes_pam import authenticate
except Exception as e:
    raise ImportError(
        "Failed to import ctypes_pam module. PAM auth support will be disabled."
        "  Exception: %s" % e)

# 3rd party modules
import tornado.httpserver
import tornado.ioloop
import tornado.web


class PAMAuthMixin(tornado.web.RequestHandler):
    """
    This is used by `PAMAuthHandler` in :ref:`auth.py` to authenticate users via
    PAM.
    """
    def initialize(self):
        """
        Print out helpful error messages if the requisite settings aren't
        configured.
        """
        self.require_setting("pam_realm", "PAM Realm")
        self.require_setting("pam_service", "PAM Service")

    def get_authenticated_user(self, callback):
        """
        Processes the client's Authorization header and call
        ``self.auth_basic()``
        """
        auth_header = self.request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Basic '):
            self.auth_basic(auth_header, callback)

    def auth_basic(self, auth_header, callback):
        """
        Perform Basic authentication using ``self.settings['pam_realm']``.
        """
        auth_decoded = base64.decodestring(auth_header[6:].encode('ascii'))
        username, password = auth_decoded.decode('utf-8').split(':', 1)
        try:
            result = authenticate(
                username,
                password,
                service=self.settings['pam_service'],
                tty=b"console",
                PAM_RHOST=self.request.remote_ip) # RHOST so it shows up in logs
            if not result:
                return self.authenticate_redirect()
        except Exception as e: # Basic auth failed
            if self.settings['debug']:
                logging.debug(e)
            return self.authenticate_redirect()
        # NOTE: Basic auth just gives us the username without the @REALM part
        #       so we have to add it:
        user = "%s@%s" % (username, self.settings['pam_realm'])
        callback(user)

    def authenticate_redirect(self):
        """
        Informs the browser that this resource requires authentication (status
        code 401) which should prompt the browser to reply with credentials.

        The browser will be informed that we support Basic auth.
        """
        if self._headers_written:
            raise Exception('Headers have already been written')
        self.set_status(401)
        self.add_header(
            "WWW-Authenticate",
            'Basic realm="%s"' % self.settings['pam_realm']
        )
        self.finish()
        return False
