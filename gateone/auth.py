# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '0.9'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
Authentication
==============
This module contains Gate One's authentication classes.  They map to Gate One's
--auth configuration option like so:

=============== ===================
--auth=none     NullAuthHandler
--auth=kerberos KerberosAuthHandler
--auth=google   GoogleAuthHandler
=============== ===================

None or Anonymous
-----------------
By default Gate One will not authenticate users.  This means that user sessions
will be tied to their browser cookie and users will not be able to resume their
sessions from another computer/browser.  Most useful for situations where
session persistence and logging aren't important.

*All* users will show up as %anonymous using this authentication type.

.. note:: The % is there to avoid name conflicts.

Kerberos
--------
Kerberos authentication utilizes GSSAPI for Single Sign-on (SSO) but will fall
back to HTTP Basic authentication if GSSAPI auth fails.  This authentication
type can be integrated into any Kerberos infrastructure including Windows
Active Directory.

It is great for both transparent authentication and being able to tie sessions
and logs to specific users within your organization (compliance).

.. note:: The sso.py module itself has extensive documentation on this authentication type.

Google Authentication
---------------------
If you want persistent user sessions but don't care to run your own
authentication infrastructure this authentication type is for you.  Assuming,
of course, that your Gate One server and clients will have access to the
Internet.

.. note:: This authentication type is perfect if you're using Chromebooks (Chrome OS devices).

Docstrings
==========
"""

# Import stdlib stuff
import os
import logging

# Import our own stuff
from utils import mkdir_p, generate_session_id
from utils import get_translation

# 3rd party imports
import tornado.web
import tornado.auth
import tornado.escape

# Localization support
_ = get_translation()

class BaseAuthHandler(tornado.web.RequestHandler):
    """The base class for all Gate One authentication handlers."""
    def get_current_user(self):
        """Tornado standard method--implemented our way."""
        user_json = self.get_secure_cookie("user")
        if not user_json: return None
        return tornado.escape.json_decode(user_json)

    def user_login(self, user):
        """
        Called immediately after a user authenticates successfully.  Saves
        session information in the user's directory.  Expects *user* to be a
        string containing the username or userPrincipalName. e.g. 'user@REALM'
        or just 'someuser'.
        """
        # Make a directory to store this user's settings/files/logs/etc
        user_dir = self.settings['user_dir'] + "/" + user
        logging.info(_("Creating user directory: %s" % user_dir))
        mkdir_p(user_dir)
        os.chmod(user_dir, 0700)
        session_file = user_dir + '/session'
        if os.path.exists(session_file):
            session_data = open(session_file).read()
            session_info = tornado.escape.json_decode(session_data)
        else:
            with open(session_file, 'w') as f:
                # Save it so we can keep track across multiple clients
                session_info = {
                    'go_upn': user, # FYI: UPN == userPrincipalName
                    'go_session': generate_session_id()
                }
                session_info_json = tornado.escape.json_encode(session_info)
                f.write(session_info_json)
        self.set_secure_cookie("user", tornado.escape.json_encode(session_info))

    def user_logout(self, user):
        """
        Called immediately after a user logs out.  Doesn't actually do
        anything.  Just potential future use at this point.
        """
        pass # Nothing here yet but someone might want to override it

class NullAuthHandler(BaseAuthHandler):
    """
    A handler for when no authentication method is chosen (i.e. --auth=none).
    """
    def get(self):
        """
        Sets the 'user' cookie with a new random session ID (*go_session*) and
        sets *go_upn* to '%anonymous'.
        """
        # % is valid on the filesystem but invalid for an actual username.
        # This ensures we won't have a conflict at some point with an actual
        # user.
        user = r'%anonymous'
        self.user_login(user) # Takes care of the user's settings dir
        user_cookie = {
            'go_upn': user,
            'go_session': generate_session_id()
        }
        self.set_secure_cookie("user", tornado.escape.json_encode(user_cookie))
        next_url = self.get_argument("next", None)
        if next_url:
            self.redirect(next_url)
        else:
            self.redirect("/")

class GoogleAuthHandler(BaseAuthHandler, tornado.auth.GoogleMixin):
    """
    Google authentication handler.
    """
    @tornado.web.asynchronous
    def get(self):
        """
        Sets the 'user' cookie with an appropriate *go_upn* and *go_session*.
        """
        if self.get_argument("openid.mode", None):
            self.get_authenticated_user(self._on_auth)
            return
        self.authenticate_redirect(
            ax_attrs=["name","email","language","username"])

    def _on_auth(self, user):
        """
        Just a continuation of the get() method (the final step where it
        actually sets the cookie).
        """
        if not user:
            raise tornado.web.HTTPError(500, _("Google auth failed"))
        # NOTE: Google auth 'user' will be a dict like so:
        # user: {
        #     'locale': u'en-us',
        #     'first_name': u'Dan',
        #     'last_name': u'McDougall',
        #     'name': u'Dan McDougall',
        #     'email': u'riskable@gmail.com'}
        # Named these 'go_<whatever>' since that is less likely to conflict with
        # anything in the future (should some auth mechanism start returning
        # session IDs of some sort).
        self.user_login(user['email']) # Takes care of the user's settings dir
        user_cookie = { # Don't need all that other stuff
            'go_session': generate_session_id(),
            'go_upn': user['email'] # Just an equivalent for standardization
        }
        self.set_secure_cookie("user", tornado.escape.json_encode(user_cookie))
        next_url = self.get_argument("next", None)
        if next_url:
            self.redirect(next_url)
        else:
            self.redirect("/")

# Add our KerberosAuthHandler if sso is available
KerberosAuthHandler = None
try:
    from sso import KerberosAuthMixin
    class KerberosAuthHandler(BaseAuthHandler, KerberosAuthMixin):
        """
        Handles authenticating users via Kerberos/GSSAPI/SSO.
        """
        def get(self):
            """
            Checks the user's request header for the proper Authorization data.
            If it checks out the user will be logged in via _on_auth().  If not,
            the browser will be redirected to login.
            """
            auth_header = self.request.headers.get('Authorization')
            if auth_header:
                self.get_authenticated_user(self._on_auth)
                return
            self.authenticate_redirect()

        def _on_auth(self, user):
            if not user:
                raise tornado.web.HTTPError(500, _("Kerberos auth failed"))
            self.user_login(user) # This takes care of the user's settings dir
            # TODO: Add some LDAP or local DB lookups here to add more detail to user objects
            logging.debug(_("KerberosAuthHandler user: %s" % user))
            next_url = self.get_argument("next", None)
            if next_url:
                self.redirect(next_url)
            else:
                self.redirect("/")
except ImportError:
    pass # No SSO available.

# Add our PAMAuthHandler if it's available
PAMAuthHandler = None
try:
    from authpam import PAMAuthMixin
    class PAMAuthHandler(BaseAuthHandler, PAMAuthMixin):
        """
        Handles authenticating users via PAM.
        """
        def get(self):
            """
            Checks the user's request header for the proper Authorization data.
            If it checks out the user will be logged in via _on_auth().  If not,
            the browser will be redirected to login.
            """
            auth_header = self.request.headers.get('Authorization')
            if auth_header:
                self.get_authenticated_user(self._on_auth)
                return
            self.authenticate_redirect()

        def _on_auth(self, user):
            if not user:
                raise tornado.web.HTTPError(500, _("PAM auth failed"))
            self.user_login(user) # This takes care of the user's settings dir
            logging.debug(_("PAMAuthHandler user: %s" % user))
            next_url = self.get_argument("next", None)
            if next_url:
                self.redirect(next_url)
            else:
                self.redirect("/")
except ImportError:
    pass # No PAM auth available.
