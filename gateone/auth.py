# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1.0)
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
--auth=pam      PAMAuthHandler
=============== ===================

None or Anonymous
-----------------
By default Gate One will not authenticate users.  This means that user sessions
will be tied to their browser cookie and users will not be able to resume their
sessions from another computer/browser.  Most useful for situations where
session persistence and logging aren't important.

*All* users will show up as ANONYMOUS using this authentication type.

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
        user_json = self.get_secure_cookie("gateone_user")
        if not user_json: return None
        return tornado.escape.json_decode(user_json)

    def user_login(self, user):
        """
        Called immediately after a user authenticates successfully.  Saves
        session information in the user's directory.  Expects *user* to be a
        string containing the username or userPrincipalName. e.g. 'user@REALM'
        or just 'someuser'.
        """
        logging.debug("user_login(%s)" % user)
        # Make a directory to store this user's settings/files/logs/etc
        user_dir = os.path.join(self.settings['user_dir'], user)
        if not os.path.exists(user_dir):
            logging.info(_("Creating user directory: %s" % user_dir))
            mkdir_p(user_dir)
            os.chmod(user_dir, 0o700)
        session_file = os.path.join(user_dir, 'session')
        session_file_exists = os.path.exists(session_file)
        if session_file_exists:
            session_data = open(session_file).read()
            try:
                session_info = tornado.escape.json_decode(session_data)
            except ValueError: # Something wrong with the file
                session_file_exists = False # Overwrite it below
        if not session_file_exists:
            with open(session_file, 'w') as f:
                # Save it so we can keep track across multiple clients
                session_info = {
                    'upn': user, # FYI: UPN == userPrincipalName
                    'session': generate_session_id()
                }
                session_info_json = tornado.escape.json_encode(session_info)
                f.write(session_info_json)
        self.set_secure_cookie(
            "gateone_user", tornado.escape.json_encode(session_info))

    def user_logout(self, user, redirect=None):
        """
        Called immediately after a user logs out, cleans up the user's session
        information and optionally, redirects them to *redirect* (URL).
        """
        logging.debug("user_logout(%s)" % user)
        url_prefix = self.settings['url_prefix']
        if redirect:
            self.write(redirect)
            self.finish()
        else:
            self.write(url_prefix)
            self.finish()

class NullAuthHandler(BaseAuthHandler):
    """
    A handler for when no authentication method is chosen (i.e. --auth=none).
    With this handler all users will show up as "ANONYMOUS".
    """
    @tornado.web.asynchronous
    def get(self):
        """
        Sets the 'user' cookie with a new random session ID (*go_session*) and
        sets *go_upn* to 'ANONYMOUS'.
        """
        user = 'ANONYMOUS'
        check = self.get_argument("check", None)
        if check:
            # This lets any origin check if the user has been authenticated
            # (necessary to prevent "not allowed ..." XHR errors)
            self.set_header('Access-Control-Allow-Origin', '*')
            self.write('authenticated')
            self.finish()
            return
        logout = self.get_argument("logout", None)
        if logout:
            self.clear_cookie('gateone_user')
            self.user_logout(user)
            return
        # This takes care of the user's settings dir and their session info
        self.user_login(user)
        next_url = self.get_argument("next", None)
        if next_url:
            self.redirect(next_url)
        else:
            self.redirect(self.settings['url_prefix'])

    def user_login(self, user):
        """
        This is an override of BaseAuthHandler since anonymous auth is special.
        Generates a unique session ID for this user and saves it in a browser
        cookie.  This is to ensure that anonymous users can't access each
        other's sessions.
        """
        logging.debug("NullAuthHandler.user_login(%s)" % user)
        # Make a directory to store this user's settings/files/logs/etc
        user_dir = os.path.join(self.settings['user_dir'], user)
        if not os.path.exists(user_dir):
            logging.info(_("Creating user directory: %s" % user_dir))
            mkdir_p(user_dir)
            os.chmod(user_dir, 0o700)
        session_info = {
            'upn': user,
            'session': generate_session_id()
        }
        self.set_secure_cookie(
            "gateone_user", tornado.escape.json_encode(session_info))

class GoogleAuthHandler(BaseAuthHandler, tornado.auth.GoogleMixin):
    """
    Google authentication handler using Tornado's built-in GoogleMixin (fairly
    boilerplate).
    """
    @tornado.web.asynchronous
    def get(self):
        """
        Sets the 'user' cookie with an appropriate *upn* and *session*.
        """
        check = self.get_argument("check", None)
        if check:
            self.set_header ('Access-Control-Allow-Origin', '*')
            user = self.get_current_user()
            if user:
                self.write('authenticated')
            else:
                self.write('unauthenticated')
            self.finish()
            return
        logout_url = "https://accounts.google.com/Logout"
        logout = self.get_argument("logout", None)
        if logout:
            user = self.get_current_user()['upn']
            self.clear_cookie('gateone_user')
            self.user_logout(user, logout_url)
            return
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
        #     'email': u'daniel.mcdougall@liftoffsoftware.com'}
        # Named these 'go_<whatever>' since that is less likely to conflict with
        # anything in the future (should some auth mechanism start returning
        # session IDs of some sort).
        # This takes care of the user's settings dir and their session info
        self.user_login(user['email'])
        next_url = self.get_argument("next", None)
        if next_url:
            self.redirect(next_url)
        else:
            self.redirect(self.settings['url_prefix'])

# Add our KerberosAuthHandler if sso is available
KerberosAuthHandler = None
try:
    from sso import KerberosAuthMixin
    class KerberosAuthHandler(BaseAuthHandler, KerberosAuthMixin):
        """
        Handles authenticating users via Kerberos/GSSAPI/SSO.
        """
        @tornado.web.asynchronous
        def get(self):
            """
            Checks the user's request header for the proper Authorization data.
            If it checks out the user will be logged in via _on_auth().  If not,
            the browser will be redirected to login.
            """
            check = self.get_argument("check", None)
            self.set_header('Access-Control-Allow-Origin', '*')
            if check:
                user = self.get_current_user()
                if user:
                    self.write('authenticated')
                else:
                    self.write('unauthenticated')
                self.finish()
                return
            logout = self.get_argument("logout", None)
            if logout:
                user = self.get_current_user()['upn']
                self.clear_cookie('gateone_user')
                self.user_logout(user)
                return
            auth_header = self.request.headers.get('Authorization')
            if auth_header:
                self.get_authenticated_user(self._on_auth)
                return
            self.authenticate_redirect()

        def _on_auth(self, user):
            if not user:
                raise tornado.web.HTTPError(500, _("Kerberos auth failed"))
            # This takes care of the user's settings dir and their session info
            self.user_login(user)
            # TODO: Add some LDAP or local DB lookups here to add more detail to user objects
            logging.debug(_("KerberosAuthHandler user: %s" % user))
            next_url = self.get_argument("next", None)
            if next_url:
                self.redirect(next_url)
            else:
                self.redirect(self.settings['url_prefix'])
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
        @tornado.web.asynchronous
        def get(self):
            """
            Checks the user's request header for the proper Authorization data.
            If it checks out the user will be logged in via _on_auth().  If not,
            the browser will be redirected to login.
            """
            check = self.get_argument("check", None)
            self.set_header('Access-Control-Allow-Origin', '*')
            if check:
                user = self.get_current_user()
                if user:
                    self.write('authenticated')
                else:
                    self.write('unauthenticated')
                self.finish()
                return
            logout = self.get_argument("logout", None)
            if logout:
                user = self.get_current_user()['upn']
                self.clear_cookie('gateone_user')
                self.user_logout(user)
                return
            auth_header = self.request.headers.get('Authorization')
            if auth_header:
                self.get_authenticated_user(self._on_auth)
                return
            self.authenticate_redirect()

        def _on_auth(self, user):
            if not user:
                raise tornado.web.HTTPError(500, _("PAM auth failed"))
            # This takes care of the user's settings dir and their session info
            self.user_login(user)
            logging.debug(_("PAMAuthHandler user: %s" % user))
            next_url = self.get_argument("next", None)
            if next_url:
                self.redirect(next_url)
            else:
                self.redirect(self.settings['url_prefix'])
except ImportError:
    pass # No PAM auth available.
