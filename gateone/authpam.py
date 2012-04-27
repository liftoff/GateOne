# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
#   Thanks to Alan Schmitz for contributing this module!

# Meta
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__doc__ = """
This authentication module is built on top of python-pam (or PAM).  The latest
version of which can be found here:  ftp://ftp.pangalactic.org/pub/tummy/ or if
that doesn't work try:  http://packages.debian.org/lenny/python-pam

It was originally written by Alan Schmitz.

The only non-obvious aspect of this module is that the pam_realm setting is only
used when the user is asked to authenticate and when the user's information is
stored in the 'users' directory.  It isn't actually used in any part of the
authentication (PAM doesn't take a "realm" setting).
"""

# Standard library modules
import base64

# 3rd party modules
import PAM
import tornado.httpserver
import tornado.ioloop
import tornado.web


class PAMAuthMixin(tornado.web.RequestHandler):
    """
    This is used by PAMAuthHandler in auth.py to authenticate users via PAM.
    """
    def initialize(self):
        """
        Print out helpful error messages if the requisite settings aren't
        configured.
        """
        self.require_setting("pam_realm", "PAM Single Sign-On")
        self.require_setting("pam_service", "PAM Single Sign-On")

    def get_authenticated_user(self, callback):
        """
        Processes the client's Authorization header and call self.auth_basic()
        """
        auth_header = self.request.headers.get('Authorization')
        if auth_header.startswith('Basic '):
            self.auth_basic(auth_header, callback)

    def auth_basic(self, auth_header, callback):
        """
        Perform Basic authentication using self.settings['pam_realm'].
        """
        auth_decoded = base64.decodestring(auth_header[6:])
        username, password = auth_decoded.split(':', 2)

        def _pam_conv(auth, query_list, user_data=None):
            resp = []
            for i in range(len(query_list)):
                query, qtype = query_list[i]
                if qtype == PAM.PAM_PROMPT_ECHO_ON:
                    resp.append((username, 0))
                elif qtype == PAM.PAM_PROMPT_ECHO_OFF:
                    resp.append((password, 0))
                else:
                    return None
            return resp

        pam_auth = PAM.pam()
        pam_auth.start(self.settings['pam_service'])
        pam_auth.set_item(PAM.PAM_USER, username)
        pam_auth.set_item(PAM.PAM_TTY, 'console')
        pam_auth.set_item(PAM.PAM_CONV, _pam_conv)
        try:
            pam_auth.authenticate()
            pam_auth.acct_mgmt()
        except Exception as e: # Basic auth failed
            if self.settings['debug']:
                print(e) # Very useful for debugging Kerberos errors
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
