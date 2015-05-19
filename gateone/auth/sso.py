# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
.. _sso.py:

About The SSO Module
====================
sso.py is a Tornado Single Sign-On (SSO) authentication module that implements
GSSAPI authentication via python-kerberos (import kerberos).  If "Negotiate"
authentication (GSSAPI SSO) fails it will gracefully fall back to "Basic" auth
(authenticating a given username/password against your Kerberos realm).

For this module to work you must add 'sso_realm' and 'sso_service' to your
Tornado application's settings.  See the docstring of the KerberosAuthMixin for
how to do this.

This module should work with regular MIT Kerberos implementations as well as
Active Directory (Heimdal is untested but should work fine).  If you're
experiencing trouble it is recommended that you set debug=True in your
application settings.  This will enable printing of Kerberos exception messages.

Troubleshooting
---------------

If your browser asks you for a password (i.e. SSO failed) there's probably
something wrong with your Kerberos configuration on either the client or the
server (usually it's a problem with forward/reverse DNS resolution or an
incorrect or missing service principal in your keytab).

If you're using Active Directory, make sure that there's an HTTP
servicePrincipalName (SPN) matching the FQDN of the host running your Tornado
server.  For example:  HTTP/somehost.somedomain.com@CORP.MYCOMPANY.COM
You may also want a short hostname SPN: HTTP/somehost@CORP.MYCOMPANY.COM

Also make sure that the service principal is in upper case as most clients (
web browsers) will auto-capitalize the principal when verifying the server.

Here's some things to test in order to find problems with your Kerberos config:

Try these from both the client and the server (NOTE: Assuming both are Unix):
kinit -p <user@REALM> # To verify you can authenticate via Kerberos (at all)
nslookup <server FQDN> # To verify the IP address reverse maps properly (below)
nslookup <IP address that 'server FQDN' resolves to>
kvno HTTP/somehost.somedomain.com # To verify your service principal

Remember: Kerberos is heavily dependent on DNS to verify the server and client
are who they claim to be.

I find that it is useful to get GSSAPI authentication working with OpenSSH first
before I attempt to get a custom service principal working with other
applications.  This is because SSH uses the HOST/ prinicipal which is often
taken care of automatically via most Kerberos management tools (including AD).
If you can get SSO working with SSH you can get SSO working with anything else.

Class Docstrings
================
"""

# Standard library modules
import os, logging, base64

# Import our own stuff
from gateone.core.locale import get_translation
# Enable localization support
_ = get_translation()

# 3rd party modules
import tornado.httpserver
import tornado.ioloop
import tornado.web
import kerberos

# NOTE: For some reason if I set this as just an 'object' it doesn't work.
class KerberosAuthMixin(tornado.web.RequestHandler):
    """
    Authenticates users via Kerberos-based Single Sign-On.  Requires that you
    define 'sso_realm' and 'sso_service' in your Tornado Application settings.
    For example::

        settings = dict(
            cookie_secret="iYR123qg4UUdsgf4CRung6BFUBhizAciid8oq1YfJR3gN",
            static_path=os.path.join(os.path.dirname(__file__), "static"),
            gzip=True,
            login_url="/auth",
            debug=True,
            sso_realm="EXAMPLE.COM",
            sso_service="HTTP" # Should pretty much always be HTTP
        )

    NOTE: If you're using 'HTTP' as the service it must be in all caps or it
    might not work with some browsers/clients (which auto-capitalize all
    services).

    To implement this mixin::

        from sso import KerberosAuthMixin
        class KerberosAuthHandler(tornado.web.RequestHandler, KerberosAuthMixin):

            def get(self):
                auth_header = self.request.headers.get('Authorization')
                if auth_header:
                    self.get_authenticated_user(self._on_auth)
                    return
                self.authenticate_redirect()

            def _on_auth(self, user):
                if not user:
                    raise tornado.web.HTTPError(500, "Kerberos auth failed")
                self.set_secure_cookie("user", tornado.escape.json_encode(user))
                print("KerberosAuthHandler user: %s" % user) # To see what you get
                next_url = self.get_argument("next", None) # To redirect properly
                if next_url:
                    self.redirect(next_url)
                else:
                    self.redirect("/")
    """
    def initialize(self):
        """
        Print out helpful error messages if the requisite settings aren't
        configured.

        NOTE: It won't hurt anything to override this method in your
        RequestHandler.
        """
        self.require_setting("sso_realm", _("Kerberos/GSSAPI Single Sign-On"))
        self.require_setting("sso_service", _("Kerberos/GSSAPI Single Sign-On"))

    def get_authenticated_user(self, callback):
        """
        Processes the client's Authorization header and calls
        self.auth_negotiate() or self.auth_basic() depending on what headers
        were provided by the client.
        """
        keytab = self.settings.get('sso_keytab', None)
        if keytab:
            # The kerberos module does not take a keytab as a parameter when
            # performing authentication but you can still specify it via an
            # environment variable:
            os.environ['KRB5_KTNAME'] = keytab
        auth_header = self.request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Negotiate'):
            self.auth_negotiate(auth_header, callback)
        elif auth_header and auth_header.startswith('Basic '):
            self.auth_basic(auth_header, callback)

    def auth_negotiate(self, auth_header, callback):
        """
        Perform Negotiate (GSSAPI/SSO) authentication via Kerberos.
        """
        auth_str = auth_header.split()[1]
        # Initialize Kerberos Context
        context = None
        try:
            result, context = kerberos.authGSSServerInit(
                self.settings['sso_service'])
            if result != 1:
                raise tornado.web.HTTPError(500, _("Kerberos Init failed"))
            result = kerberos.authGSSServerStep(context, auth_str)
            if result == 1:
                gssstring = kerberos.authGSSServerResponse(context)
            else: # Fall back to Basic auth
                self.auth_basic(auth_header, callback)
            # NOTE: The user we get from Negotiate is a full UPN (user@REALM)
            user = kerberos.authGSSServerUserName(context)
        except kerberos.GSSError as e:
            logging.error(_("Kerberos Error: %s" % e))
            raise tornado.web.HTTPError(500, _("Kerberos Init failed"))
        finally:
            if context:
                kerberos.authGSSServerClean(context)
        self.set_header('WWW-Authenticate', "Negotiate %s" % gssstring)
        callback(user)

    def auth_basic(self, auth_header, callback):
        """
        Perform Basic authentication using Kerberos against
        `self.settings['sso_realm']`.
        """
        auth_decoded = base64.decodestring(auth_header[6:])
        username, password = auth_decoded.split(':', 1)
        try:
            kerberos.checkPassword(
                username,
                password,
                self.settings['sso_service'],
                self.settings['sso_realm'])
        except Exception as e: # Basic auth failed
            if self.settings['debug']:
                print(e) # Very useful for debugging Kerberos errors
            return self.authenticate_redirect()
        # NOTE: Basic auth just gives us the username without the @REALM part
        #       so we have to add it:
        user = "%s@%s" % (username, self.settings['sso_realm'])
        callback(user)

    def authenticate_redirect(self):
        """
        Informs the browser that this resource requires authentication (status
        code 401) which should prompt the browser to reply with credentials.

        The browser will be informed that we support both Negotiate (GSSAPI/SSO)
        and Basic auth.
        """
        # NOTE: I know this isn't technically a redirect but I wanted to make
        # this process as close as possible to how things work in tornado.auth.
        if self._headers_written:
            raise Exception(_('Headers have already been written'))
        self.set_status(401)
        self.add_header("WWW-Authenticate", "Negotiate")
        self.add_header(
            "WWW-Authenticate",
            'Basic realm="%s"' % self.settings['sso_realm']
        )
        self.finish()
        return False
