# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
.. _auth.py:

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

.. note::

    The sso.py module itself has extensive documentation on this authentication
    type.

Google Authentication
---------------------
If you want persistent user sessions but don't care to run your own
authentication infrastructure this authentication type is for you.  Assuming,
of course, that your Gate One server and clients will have access to the
Internet.

.. note::

    This authentication type is perfect if you're using Chromebooks (Chrome OS
    devices).

API Authentication
------------------
API-based authentication is actually handled in gateone.py but we still need
*something* to exist at the /auth URL that will always return the
'unauthenticated' response.  This ensures that no one can authenticate
themselves by visiting that URL manually.

Docstrings
==========
"""

# Import stdlib stuff
import os, re, logging, json
try:
    from urllib import quote
except ImportError: # Python 3
    from urllib.parse import quote

# Import our own stuff
from gateone.core.utils import mkdir_p, generate_session_id
from gateone.core.utils import convert_to_timedelta
from gateone.core.utils import total_seconds
from gateone.core.locale import get_translation
from gateone.core.log import go_logger

# 3rd party imports
import tornado.web
import tornado.auth
import tornado.escape
import tornado.httpclient
import tornado.gen
from tornado.options import options

# Localization support
_ = get_translation()

# Globals
SETTINGS_CACHE = {} # Lists of settings files and their modification times
# The security stuff below is a work-in-progress.  Likely to change all around.

auth_log = go_logger('gateone.auth')

# Helper functions
def additional_attributes(user, settings_dir=None):
    """
    Given a *user* dict, return a dict containing any additional attributes
    defined in Gate One's attribute repositories.

    .. note::

        This function doesn't actually work yet (support for attribute repos
        like LDAP is forthcoming).
    """
    # Doesn't do anything yet
    if not settings_dir:
        settings_dir = options.settings_dir
    return user


# Authentication classes
class BaseAuthHandler(tornado.web.RequestHandler):
    """The base class for all Gate One authentication handlers."""
    def set_default_headers(self):
        self.set_header('Server', 'GateOne')

    def get_current_user(self):
        """Tornado standard method--implemented our way."""
        expiration = self.settings.get('auth_timeout', "14d")
        # Need the expiration in days (which is a bit silly but whatever):
        expiration = (
            float(total_seconds(convert_to_timedelta(expiration)))
            / float(86400))
        user_json = self.get_secure_cookie(
            "gateone_user", max_age_days=expiration)
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
        try:
            # NOTE: These bytes checks are for Python 2 (not needed in Python 3)
            upn = user['upn']
            if isinstance(user['upn'], bytes):
                upn = user['upn'].decode('utf-8')
            user_dir = os.path.join(self.settings['user_dir'], upn)
            if isinstance(user_dir, bytes):
                user_dir = user_dir.decode('utf-8')
            if not os.path.exists(user_dir):
                logging.info(_("Creating user directory: %s" % user_dir))
                mkdir_p(user_dir)
                os.chmod(user_dir, 0o700)
        except UnicodeEncodeError:
            logging.error(_(
                "You're trying to use non-ASCII user information on a system "
                "that has the locale set to ASCII (or similar).  Please change"
                "your system's locale to something that supports Unicode "
                "characters. "))
            return
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


class GoogleAuthHandler(BaseAuthHandler, tornado.auth.GoogleOAuth2Mixin):
    """
    Google authentication handler using Tornado's built-in GoogleOAuth2Mixin
    (fairly boilerplate).
    """
    @tornado.gen.coroutine
    def get(self):
        """
        Sets the 'user' cookie with an appropriate *upn* and *session* and any
        other values that might be attached to the user object given to us by
        Google.
        """
        self.base_url = "{protocol}://{host}:{port}{url_prefix}".format(
            protocol=self.request.protocol,
            host=self.request.host,
            port=self.settings['port'],
            url_prefix=self.settings['url_prefix'])
        uri_port = ':{0}/'.format(self.settings['port'])
        if uri_port in self.base_url:
            # Get rid of the port (will be added automatically)
            self.base_url = self.base_url.replace(uri_port, '/', 1)
        redirect_uri = "{base_url}auth".format(base_url=self.base_url)
        check = self.get_argument("check", None)
        if check:
            self.set_header('Access-Control-Allow-Origin', '*')
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
        if self.get_argument('code', False):
            user = yield self.get_authenticated_user(
                redirect_uri=redirect_uri,
                code=self.get_argument('code'))
            if not user:
                self.clear_all_cookies()
                raise tornado.web.HTTPError(500, 'Google auth failed')
            access_token = str(user['access_token'])
            http_client = self.get_auth_http_client()
            response =  yield http_client.fetch(
                'https://www.googleapis.com/oauth2/v1/userinfo?access_token='
                +access_token)
            if not response:
                self.clear_all_cookies()
                raise tornado.web.HTTPError(500, 'Google auth failed')
            user = json.loads(response.body.decode('utf-8'))
            self._on_auth(user)
        else:
            yield self.authorize_redirect(
                redirect_uri=redirect_uri,
                client_id=self.settings['google_oauth']['key'],
                scope=['email'],
                response_type='code',
                extra_params={'approval_prompt': 'auto'})

    def _on_auth(self, user):
        """
        Just a continuation of the get() method (the final step where it
        actually sets the cookie).
        """
        logging.debug("GoogleAuthHandler.on_auth(%s)" % user)
        if not user:
            raise tornado.web.HTTPError(500, _("Google auth failed"))
        # NOTE: Google auth 'user' will be a dict like so:
        # user = {'given_name': 'Joe',
        #    'verified_email': True,
        #    'hd': 'example.com',
        #    'gender': 'male',
        #    'email': 'joe.schmoe@example.com',
        #    'name': 'Joe Schmoe',
        #    'picture': 'https://lh6.googleusercontent.com/path/to/some.jpg',
        #    'id': '999999999999999999999',
        #    'family_name': 'Schmoe',
        #    'link': 'https://plus.google.com/999999999999999999999'}
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
    ``ca_certs`` option is set along with ``ssl_auth=required`` or
    ``ssl_auth=optional``.
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
    from gateone.auth.sso import KerberosAuthMixin
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
    from gateone.auth.pam import PAMAuthMixin
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

class CASAuthHandler(BaseAuthHandler):
    """
    CAS authentication handler.
    """
    cas_user_regex = re.compile(r'<cas:user>(.*)</cas:user>')
    def initialize(self):
        """
        Print out helpful error messages if the requisite settings aren't
        configured.

        NOTE: It won't hurt anything to override this method in your
        RequestHandler.
        """
        self.require_setting("cas_server", _("CAS Server URL"))
        # The cas_version is optional

    @tornado.web.asynchronous
    def get(self):
        """
        Sets the 'user' cookie with an appropriate *upn* and *session* and any
        other values that might be attached to the user object given to us by
        Google.
        """
        self.base_url = "{protocol}://{host}:{port}{url_prefix}".format(
            protocol=self.request.protocol,
            host=self.request.host,
            port=self.settings['port'],
            url_prefix=self.settings['url_prefix'])
        check = self.get_argument("check", None)
        if check:
            self.set_header ('Access-Control-Allow-Origin', '*')
            user = self.get_current_user()
            if user:
                logging.debug('CASAuthHandler: user is authenticated')
                self.write('authenticated')
            else:
                logging.debug('CASAuthHandler: user is NOT authenticated')
                self.write('unauthenticated')
            self.finish()
            return
        logout_url = "%s/logout" % self.settings.get('cas_server')
        logout = self.get_argument("logout", None)
        if logout:
            user = self.get_current_user()['upn']
            self.clear_cookie('gateone_user')
            self.user_logout(user, logout_url)
            return
        server_ticket = self.get_argument('ticket', None)
        if server_ticket:
            return self.get_authenticated_user(server_ticket)
        return self.authenticate_redirect()

    def authenticate_redirect(self, callback=None):
        """
        Redirects to the authentication URL for this CAS service.

        After authentication, the service will redirect back to the given
        callback URI with additional parameters.

        We request the given attributes for the authenticated user by
        default (name, email, language, and username). If you don't need
        all those attributes for your app, you can request fewer with
        the ax_attrs keyword argument.
        """
        cas_server = self.settings.get('cas_server')
        if not cas_server.endswith('/'):
            cas_server += '/'
        service_url = "%sauth" % self.base_url
        next_url = self.get_argument('next', None)
	next_param = ""
	if next_url:
		next_param = "?next=" + quote(next_url)
        redirect_url = '%slogin?service=%s%s' % (cas_server, quote(service_url), quote(next_param))
        logging.debug("Redirecting to CAS URL: %s" % redirect_url)
        self.redirect(redirect_url)
        if callback:
            callback()

    def get_authenticated_user(self, server_ticket):
        """
        Requests the user's information from the CAS server using the given
        *server_ticket* and calls ``self._on_auth`` with the resulting user
        dict.
        """
        cas_version = self.settings.get('cas_version', 2)
        cas_server = self.settings.get('cas_server')
        ca_certs = self.settings.get('cas_ca_certs', None)
        if not cas_server.endswith('/'):
            cas_server += '/'
        service_url = "%sauth" % self.base_url
        #validate the ST
        validate_suffix = 'proxyValidate'
        if cas_version == 1:
            validate_suffix = 'validate'
        next_url = self.get_argument('next', None)
	next_param = ""
	if next_url:
		next_param = "?next=" + quote(next_url)
        validate_url = (
            cas_server +
            validate_suffix +
            '?service=' +
            quote(service_url) +
	    quote(next_param) +
            '&ticket=' +
            quote(server_ticket)
        )
        logging.debug("Fetching CAS URL: %s" % validate_url)
        validate_cert = False
        if ca_certs:
            validate_cert = True
        http_client = tornado.httpclient.AsyncHTTPClient()
        http_client.fetch(
            validate_url, validate_cert=validate_cert, callback=self._on_auth)

    def _on_auth(self, response):
        """
        Just a continuation of the get() method (the final step where it
        actually sets the cookie).
        """
        userid = None
        match = self.cas_user_regex.search(response.body)
        if match:
            userid = match.groups()[0]
        if not userid:
            raise tornado.web.HTTPError(500, _("CAS authentication failed"))
        # NOTE: Do we ever get anything more than the userid from a CAS server?
        # Needs more research and probably proper XML parsing...
        user = {'upn': userid}
        self.user_login(user)
        next_url = self.get_argument("next", None)
        if next_url:
            self.redirect(next_url)
        else:
            self.redirect(self.settings['url_prefix'])
