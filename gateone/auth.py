# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '1.2'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1.2)
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
--auth=api      APIAuthHandler
=============== ===================

.. note:: API authentication is handled inside of :ref:`gateone.py`

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

API Authentication
------------------
API-based authentication is actually handled in gateone.py but we still need
*something* to exist at the /auth URL that will always return the
'unauthenticated' response.  This ensures that no one can authenticate
themselves by visiting that URL manually.

Docstrings
==========
"""

# TODO: Need authorization stuff for the following:
#   * Access (you are/are not allowed to do this, etc)
#   * Limits (max terms, you may only do this X times, etc)
#   *

# Import stdlib stuff
import os, logging, re

# Import our own stuff
from utils import mkdir_p, generate_session_id, noop, RUDict
from utils import get_translation, memoize, get_settings

# 3rd party imports
import tornado.web
import tornado.auth
import tornado.escape

# Localization support
_ = get_translation()

# Globals
GATEONE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_CACHE = {} # Lists of settings files and their modification times
# The security stuff below is a work-in-progress.  Likely to change all around.

# Authorization stuff
@memoize
def applicable_policies(application, user, policies):
    """
    Given an *application* and a *user* object, returns the merged/resolved
    policies from the given *policies* :class:`RUDict`.

    .. note:: Policy settings always start with '*', 'user', or 'group'.
    """
    # Start with the default policy
    try:
        policy = RUDict(policies['*'][application].copy())
    except KeyError:
        # No default policy--not good but not mandatory
        policy = RUDict()
    for key, value in policies.items():
        if key == '*':
            continue # Default policy was already handled
        if application not in value:
            continue # No sense processing inapplicable stuff
        # Handle users and their properties first
        if key.startswith('user=') or key.startswith('user.upn='):
            # UPNs are very straightforward
            upn = key.split('=', 1)[1]
            if re.match(upn, user['upn']):
                policy.update(value[application])
        elif key.startswith('user.'):
            # An attribute check (e.g. 'user.ip_address=10.1.1.1')
            attribute = key.split('.', 1)[1] # Get rid of the 'user.' part
            attribute, must_match = attribute.split('=', 1)
            if attribute in user:
                if re.match(must_match, user[attribute]):
                    policy.update(value[application])
        # TODO: Group stuff here (need attribute repo stuff first)
    return policy

class require(object):
    """
    A decorator to add authorization requirements to any given function or
    method using condition classes. Condition classes are classes with check()
    methods that return True if the condition is met.

    Example of using @require with is_user()::

        @require(is_user('administrator'))
        def admin_index(self):
            return 'Hello, Administrator!'

    This would only allow the user, 'administrator' access to the index page.
    In this example the *condition* is the `is_user` function which checks that
    the logged-in user's username (aka UPN) is 'administrator'.
    """
    def __init__(self, *conditions):
        self.conditions = conditions

    def __call__(self, f):
        conditions = self.conditions
        # The following only gets run when the wrapped method is called
        def wrapped_f(self, *args, **kwargs):
            # Now check the conditions
            for condition in conditions:
                # Conditions don't have access to self directly so we use the
                # 'self' associated with the user's open connection to update
                # the condition's 'instance' attribute
                condition.instance = self
                # This lets the condition know what it is being applied to:
                condition.function = f
                condition.f_args = args
                condition.f_kwargs = kwargs
                if not condition.check():
                    if hasattr(self, 'current_user') and self.current_user:
                        if 'upn' in self.current_user:
                            logging.error(_(
                                "%s -> %s failed requirement: %s" % (
                                self.current_user['upn'],
                                f.__name__, str(condition))))
                    else:
                        logging.error(_(
                            "unknown user -> %s failed requirement: %s" % (
                            f.__name__, str(condition))))
                    msg = _("ERROR: %s" % condition.error)
                    if hasattr(self, 'send_message'):
                        self.send_message(msg)
                    elif hasattr(self, 'ws'):
                        self.ws.send_message(msg)
                    return noop
            return f(self, *args, **kwargs)
        return wrapped_f

class authenticated(object):
    """
    A condition class to be used with the @require decorator that returns True
    if the user is authenticated.

    .. note:: Only meant to be used with WebSockets.  tornado.web.RequestHandler instances can use @tornado.web.authenticated
    """
    error = _("Only valid users may access this function")
    def __str__(self):
        return "authenticated"

    def __init__(self):
        # These are just here as reminders that (they will be set when called)
        self.instance = None
        self.function = None
        self.f_args = None
        self.f_kwargs = None

    def check(self):
        if not self.instance.current_user:
            self.instance.close() # Close the WebSocket for this level of fail
            return False
        return True

class is_user(object):
    """
    A condition class to be used with the @require decorator that returns True
    if the given username/UPN matches what's in `self._current_user`.
    """
    error = _("You are not authorized to perform this action")
    def __str__(self):
        return "is_user: %s" % self.upn

    def __init__(self, upn): # NOTE: upn is the username (aka userPrincipalName)
        self.upn = upn
        self.instance = None
        self.function = None
        self.f_args = None
        self.f_kwargs = None

    def check(self):
        user = self.instance.current_user
        if user and 'upn' in user:
            logging.debug("Checking if %s == %s" % (user['upn'], self.upn))
            return self.upn == user['upn']
        else:
            return False

# Still experimenting on how various security limits will be handled...  Many aspects of this function may change:
class policies(object):
    """
    A condition class to be used with the @require decorator that returns True
    if all the given conditions are within the limits specified in Gate One's
    settings (e.g. 50limits.conf).  Here's an example::

        @require(authenticated(), policies('terminal'))
        def new_terminal(self, settings):
            # Actual function would be here

    That would apply all policies that are configured for the 'terminal'
    application.  It works like this:

        # The :class:`~app_terminal.TerminalApplication` application registers its name and policy-checking function inside of :meth:`~app_terminal.TerminalApplication.initialize` like so::

            self.ws.security.update({'terminal': terminal_policies})

        # Whenever a function decorated with `@require(policies('terminal'))` is called the registered policy-checking function (e.g. :func:`app_terminal.terminal_policies`) will be called, passing the current instance of :class:`policies` as the only argument.
        # It is then up to the policy-checking function to make a determination as to whether or not the user is allowed to execute the decorated function and must return `True` if allowed.  Also note that the policy-checking function will be able to make modifications to the function and its arguments if the security policies warrant it.

    .. note:: If you write your own policy-checking function (like :func:`terminal_policies`) it is often a good idea to send a notification to the user indicating why they've been denied.  You can do this with the :meth:`instance.send_message` method.
    """
    # NOTE:  In the future if we wish to use this function with Gate One itself
    # (as opposed to just a GOApplication) the 'app' will need to be 'gateone'.
    error = _("Your ability to perform this action has been restricted")
    def __str__(self):
        return "policies: %s" % self.app

    def __init__(self, app):
        self.app = app
        self.instance = None
        self.function = None
        self.f_args = None
        self.f_kwargs = None

    def check(self):
        security = self.instance.security
        if self.app in security:
            # Let the application's registered 'security' function make its own
            # determination.
            return security[self.app](self)
        return True # Nothing is registered for this application so it's OK

def additional_attributes(user, settings_dir=None):
    """
    Given a *user* dict, return a dict containing any additional attributes
    defined in Gate One's attribute repositories.
    """
    # Doesn't do anything yet
    if not settings_dir:
        settings_dir = os.path.join(GATEONE_DIR, 'settings')
    settings = get_settings(settings_dir)
    return user

# Authentication stuff
class BaseAuthHandler(tornado.web.RequestHandler):
    """The base class for all Gate One authentication handlers."""
    def get_current_user(self):
        """Tornado standard method--implemented our way."""
        user_json = self.get_secure_cookie("gateone_user")
        if not user_json: return None
        user = tornado.escape.json_decode(user_json)
        # Add the IP attribute
        user['ip_address'] = self.request.remote_ip
        return user

    def user_login(self, user):
        """
        Called immediately after a user authenticates successfully.  Saves
        session information in the user's directory.  Expects *user* to be a
        dict containing a 'upn' value representing the username or
        userPrincipalName. e.g. 'user@REALM' or just 'someuser'.  Any additional
        values will be attached to the user object/cookie.
        """
        logging.debug("user_login(%s)" % user['upn'])
        user.update(additional_attributes(user))
        # Make a directory to store this user's settings/files/logs/etc
        user_dir = os.path.join(self.settings['user_dir'], user['upn'])
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
                    'session': generate_session_id(),
                }
                session_info.update(user)
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
        if not redirect:
            # Try getting it from the query string
            redirect = self.get_argument("redirect", None)
        if redirect:
            self.write(redirect)
            self.finish()
        else:
            self.write(self.settings['url_prefix'])
            self.finish()

class NullAuthHandler(BaseAuthHandler):
    """
    A handler for when no authentication method is chosen (i.e. --auth=none).
    With this handler all users will show up as "ANONYMOUS".
    """
    @tornado.web.asynchronous
    def get(self):
        """
        Sets the 'gateone_user' cookie with a new random session ID
        (*go_session*) and sets *go_upn* to 'ANONYMOUS'.
        """
        user = {'upn': 'ANONYMOUS'}
        check = self.get_argument("check", None)
        if check:
            # This lets any origin check if the user has been authenticated
            # (necessary to prevent "not allowed ..." XHR errors)
            self.set_header('Access-Control-Allow-Origin', '*')
            if not self.get_current_user():
                self.user_login(user)
            self.write('authenticated')
            self.finish()
            return
        logout = self.get_argument("logout", None)
        if logout:
            self.clear_cookie('gateone_user')
            self.user_logout(user['upn'])
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
        logging.debug("NullAuthHandler.user_login(%s)" % user['upn'])
        # Make a directory to store this user's settings/files/logs/etc
        user_dir = os.path.join(self.settings['user_dir'], user['upn'])
        if not os.path.exists(user_dir):
            logging.info(_("Creating user directory: %s" % user_dir))
            mkdir_p(user_dir)
            os.chmod(user_dir, 0o700)
        session_info = {
            'session': generate_session_id()
        }
        session_info.update(user)
        self.set_secure_cookie(
            "gateone_user", tornado.escape.json_encode(session_info))

class APIAuthHandler(BaseAuthHandler):
    """
    A handler that always reports 'unauthenticated' since API-based auth doesn't
    use auth handlers.
    """
    @tornado.web.asynchronous
    def get(self):
        """
        Deletes the 'gateone_user' cookie and handles some other situations for
        backwards compatibility.
        """
        # Get rid of the cookie no matter what (API auth doesn't use cookies)
        user = self.current_user
        self.clear_cookie('gateone_user')
        check = self.get_argument("check", None)
        if check:
            # This lets any origin check if the user has been authenticated
            # (necessary to prevent "not allowed ..." XHR errors)
            self.set_header('Access-Control-Allow-Origin', '*')
            logout = self.get_argument("logout", None)
            if logout:
                self.user_logout(user['upn'])
                return
        logging.debug('APIAuthHandler: user is NOT authenticated')
        self.write('unauthenticated')
        self.finish()

class GoogleAuthHandler(BaseAuthHandler, tornado.auth.GoogleMixin):
    """
    Google authentication handler using Tornado's built-in GoogleMixin (fairly
    boilerplate).
    """
    @tornado.web.asynchronous
    def get(self):
        """
        Sets the 'user' cookie with an appropriate *upn* and *session* and any
        other values that might be attached to the user object given to us by
        Google.
        """
        check = self.get_argument("check", None)
        if check:
            self.set_header ('Access-Control-Allow-Origin', '*')
            user = self.get_current_user()
            if user:
                logging.debug('GoogleAuthHandler: user is authenticated')
                self.write('authenticated')
            else:
                logging.debug('GoogleAuthHandler: user is NOT authenticated')
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
            ax_attrs=["name", "email", "language", "username"])

    def _on_auth(self, user):
        """
        Just a continuation of the get() method (the final step where it
        actually sets the cookie).
        """
        if not user:
            raise tornado.web.HTTPError(500, _("Google auth failed"))
        # NOTE: Google auth 'user' will be a dict like so:
        # user = {
        #     'locale': u'en-us',
        #     'first_name': u'Dan',
        #     'last_name': u'McDougall',
        #     'name': u'Dan McDougall',
        #     'email': u'daniel.mcdougall@liftoffsoftware.com'}
        user['upn'] = user['email'] # Use the email for the upn
        self.user_login(user)
        next_url = self.get_argument("next", None)
        if next_url:
            self.redirect(next_url)
        else:
            self.redirect(self.settings['url_prefix'])

class SSLAuthHandler(BaseAuthHandler):
    """
    SSL Certificate-based  authentication handler.  Can only be used if the
    `ca_certs` is set and `ssl_auth=required` or `ssl_auth=optional`.
    """
    def initialize(self):
        """
        Print out helpful error messages if the requisite settings aren't
        configured.
        """
        self.require_setting("ca_certs", "CA Certificates File")
        self.require_setting("ssl_auth", "SSL Authentication ('required')")

    def _convert_certificate(self, cert):
        """
        Converts the certificate format returned by get_ssl_certificate() into
        a format more suitable for a user dict.
        """
        import re
        # Can't have any of these in the upn because we name a directory with it
        bad_chars = re.compile(r'[\/\\\$\;&`\!\*\?\|<>\n]')
        user = {'notAfter': cert['notAfter']} # This one is the most direct
        for item in cert['subject']:
            for key, value in item:
                user.update({key: value})
        cn = user['commonName'] # Use the commonName as the UPN
        cn = bad_chars.sub('.', cn) # Replace bad chars with dots
        # Try to use the 'issuer' to add more depth to the CN
        if 'issuer' in cert: # This will only be there if you're using Python 3
            for item in cert['issuer']:
                for key, value in item:
                    if key == 'organizationName':
                        # Yeah this can get long but that's OK (it's better than
                        # conflicts)
                        cn = "%s@%s" % (cn, value)
                        break
                        # Should wind up as something like this:
                        #   John William Smith-Doe@ACME Widget Corporation, LLC
                        # So that would be used in the users dir like so:
                        #   /opt/gateone/users/John William Smith-Doe... etc
        user['upn'] = cn
        return user

    @tornado.web.asynchronous
    def get(self):
        """
        Sets the 'user' cookie with an appropriate *upn* and *session* and any
        other values that might be attached to the user's client SSL
        certificate.
        """
        check = self.get_argument("check", None)
        if check:
            self.set_header ('Access-Control-Allow-Origin', '*')
            user = self.get_current_user()
            if user:
                logging.debug('SSLAuthHandler: user is authenticated')
                self.write('authenticated')
            else:
                logging.debug('SSLAuthHandler: user is NOT authenticated')
                self.write('unauthenticated')
            self.finish()
            return
        logout = self.get_argument("logout", None)
        if logout:
            user = self.get_current_user()['upn']
            self.clear_cookie('gateone_user')
            self.user_logout(user)
            return
        # Extract the user's information from their certificate
        cert = self.request.get_ssl_certificate()
        bincert = self.request.get_ssl_certificate(binary_form=True)
        open('/tmp/cert.der', 'w').write(bincert)
        user = self._convert_certificate(cert)
        # This takes care of the user's settings dir and their session info
        self.user_login(user)
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
                    logging.debug('KerberosAuthHandler: user is authenticated')
                    self.write('authenticated')
                else:
                    logging.debug('KerberosAuthHandler: user is NOT authenticated')
                    self.write('unauthenticated')
                self.finish()
                return
            logout = self.get_argument("logout", None)
            if logout:
                user = self.get_current_user()
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
            logging.debug(_("KerberosAuthHandler user: %s" % user))
            user = {'upn': user}
            # This takes care of the user's settings dir and their session info
            self.user_login(user)
            # TODO: Add some LDAP or local DB lookups here to add more detail to user objects
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
                    logging.debug('PAMAuthHandler: user is authenticated')
                    self.write('authenticated')
                else:
                    logging.debug('PAMAuthHandler: user is NOT authenticated')
                    self.write('unauthenticated')
                    self.get_authenticated_user(self._on_auth)
                self.finish()
                return
            logout = self.get_argument("logout", None)
            if logout:
                user = self.get_current_user()
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
            user = {'upn': user}
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
