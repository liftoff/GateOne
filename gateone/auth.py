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

Docstrings
==========
"""

# TODO: Need authorization stuff for the following:
#   * Access (you are/are not allowed to do this, etc)
#   * Limits (max terms, you may only do this X times, etc)
#   *

# Import stdlib stuff
import os
import logging
import shlex

# Import our own stuff
from utils import mkdir_p, generate_session_id, noop
from utils import get_translation

# 3rd party imports
import tornado.web
import tornado.auth
import tornado.escape

# Localization support
_ = get_translation()

# Globals
# This is modeled after /etc/security/limits.conf which is common on Linux
# If it ain't broke...
LIMITS_DEFAULTS = """\
# /opt/gateone/security.conf
#
# Each line describes a limit for a user or group in the form:
#
# <domain>     <application>     <item>     <value>
#
# <domain> can be:
#   - The wildcard *, for default entry
#   - A user name or userPrincipalName (aka UPN)
#   - A group name, with @group syntax (if configured auth type supports groups).
#   - %user.attribute, to specify all users with a given attribute (if auth type supports it)
#   - %group.attribute, to specify all groups with a given attribute (if auth type supports it)
#
# <application> can be:
#   - terminal
#   - A name specified by any plugin's 'application' hook (if it sets one).
#
# <item> can be one of the following:
#   - login - User may authenticate and use Gate One.
#   - max_terminals - Maximum number of open terminals.
#   - session_timeout - Length of time before the user's session times out.
#   - max_sessions - max number of simultaneous (browser) sessions for this user.
#   - Any value specified by a plugin's 'application' hook.
#
# <value> can be:
#   - A numeric value (will be converted to a float).
#   - The wildcard:  *
#   - Empty; if not applicable (e.g. 'login' doesn't need a value).
#
# NOTES:
#   * Values may be surrounded by single or double quotes.
#   * White space or tabs between fields (doesn't matter).
#
#<domain>       <application>   <item>          <value>
#
*               terminal        login
*               terminal        max_terminals   *

"""
# NOTE about the above:
#   * I MAY CHANGE ALL OF IT!  Still a work in progress ;)
#   * That config file format was chosen to be user-friendly.  JSON may be easier to parse but it isn't ideal from a, "user can grok this" standpoint.
#   * The <domain> options were chosen so that Role-Based Access Controls (RBAC) and Attribute-Based Access Controls (ABAC) can be supported simultaneously.
#   * Only Google auth supports additional attributes at the moment but LDAP support is forthcoming.  Probably going to add the ability to define arbitrary attributes and user profiles as well at some point.  Need a post-authentication information-gathering process.
#   *
GATEONE_DIR = os.path.dirname(os.path.abspath(__file__))
# The limit stuff below is a work-in-progress.  Likely to change all around.
#LIMITS_PATH = os.path.join(GATEONE_DIR, 'security.conf')
#LIMITS = {}
#if not os.path.exists(LIMITS_PATH):
    #open(LIMITS_PATH, 'w').write(LIMITS_DEFAULTS)
# Populate the LIMITS dict with all the settings
#with open(LIMITS_PATH) as limits_conf:
    #for line in limits_conf:
        #if not line.strip():
            #continue # Skip blank lines
        #elif line.startswith('#'):
            #continue # Ignore comments
        #else:
            #fields = shlex.split(line, comments=True)
            #domain = fields[0]
            #application = fields[1]
            #item = fields[2]
            #try:
                #value = fields[3]
            #except IndexError: # Not all items need values
                #value = True
            #if domain not in LIMITS:
                #LIMITS[domain] = {}
            #if application not in LIMITS[domain]:
                #LIMITS[domain][application] = {}
            #if item not in LIMITS[domain][application]:
                #LIMITS[domain][application][item] = value

# Authorization stuff
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
                if not condition.check():
                    logging.error(_(
                        "%s -> %s failed condition: %s" % (
                        self._current_user['upn'], f.__name__, str(condition))))
                    self.send_message(_(
                        "ERROR: %s (%s)" % (condition.error, f.__name__)))
                    return noop
            return f(self, *args, **kwargs)
        return wrapped_f

class authenticated(object):
    """
    A condition class to be used with the @require decorator that returns true
    if the user is authenticated.

    .. note:: Only meant to be used with WebSockets.  tornado.web.RequestHandler instances can use tornado.web.authenticated
    """
    error = _("Only valid users may access this function")
    def __str__(self):
        return "authenticated"

    def __init__(self, instance={}):
        self.instance = instance

    def check(self):
        if not self.instance.get_current_user():
            self.instance.close() # Close the WebSocket for this level of fail
            return False
        return True

class is_user(object):
    """
    A condition class to be used with the @require decorator that returns true
    if the given username/UPN matches what's in `self._current_user`.
    """
    error = _("You are not authorized to perform this action")
    def __str__(self):
        return "is_user: %s" % self.upn

    def __init__(self, upn, instance={}):
        self.upn = upn
        self.instance = instance

    def check(self):
        user = self.instance.get_current_user()
        if user and 'upn' in user:
            logging.debug("Checking if %s == %s" % (user['upn'], self.upn))
            return self.upn == user['upn']
        else:
            return False

# Still experimenting on how various security limits will be handled...  This is likely to change:
#class limit(object):
    #"""
    #A condition class to be used with the @require decorator that returns true
    #if all the specified conditions are within the limits specified in
    #security.conf.
    #"""
    #error = _("Your ability to perform this action has been restricted")
    #def __str__(self):
        #return "limits: %s" % self.upn

    #def __init__(self, application, item, instance={}):
        #self.application = application
        #self.item = item
        #self.instance = instance

    #def check(self):
        #user = self.instance.get_current_user()
        #if user and 'upn' in user:
            #upn = user['upn']
            #try:
                #value = LIMITS[upn][self.application][self.item]
            #except ValueError:
                #value = None
            ## Try number values first (must be less than)
            #if value != None:

                #try:
                    #value = float(value)
                    #return value
                #except ValueError:
                    #pass
                ##logging.debug("Checking condition: %s" % )
            #return self.upn == user['upn']
        #else:
            #return False

# Authentication stuff
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
        dict containing a 'upn' value representing the username or
        userPrincipalName. e.g. 'user@REALM' or just 'someuser'.  Any additional
        values will be attached to the user object/cookie.
        """
        logging.debug("user_login(%s)" % user['upn'])
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
                    'session': generate_session_id()
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
        Sets the 'user' cookie with a new random session ID (*go_session*) and
        sets *go_upn* to 'ANONYMOUS'.
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
            user = {'upn': user} # Convert to dict
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
