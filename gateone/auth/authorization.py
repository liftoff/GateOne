# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
.. _authorization.py:

Authorization
==============
This module contains Gate One's authorization helpers.

Docstrings
==========
"""

# Import stdlib stuff
import os, logging, re

# Import our own stuff
from gateone.core.utils import noop
from gateone.core.utils import memoize
from gateone.core.configuration import RUDict
from gateone.core.locale import get_translation
from gateone.core.log import go_logger

# Localization support
_ = get_translation()

# Globals
auth_log = go_logger('gateone.auth')

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
                            auth_log.error(_(
                                '{"ip_address": "%s"} %s -> %s '
                                'failed requirement: %s' % (
                                self.request.remote_ip,
                                self.current_user['upn'],
                                f.__name__, str(condition))))
                    else:
                        auth_log.error(_(
                            '{"ip_address": "%s"} unknown user -> %s '
                            'failed requirement: %s' % (
                            self.request.remote_ip, f.__name__, str(condition))
                        ))
                    # Try to notify the client of their failings
                    msg = _("ERROR: %s" % condition.error)
                    try:
                        if hasattr(self, 'send_message'):
                            self.send_message(msg)
                        elif hasattr(self, 'ws'): # Inside an app, use ws
                            self.ws.send_message(msg)
                    except AttributeError:
                        # This can happen if the client disconnects in the
                        # middle of this operation.  Ignore.
                        pass
                    return noop
            return f(self, *args, **kwargs)
        return wrapped_f

class authenticated(object):
    """
    A condition class to be used with the @require decorator that returns True
    if the user is authenticated.

    .. note::

        Only meant to be used with WebSockets.  `tornado.web.RequestHandler`
        instances can use `@tornado.web.authenticated`
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

class policies(object):
    """
    A condition class to be used with the @require decorator that returns True
    if all the given conditions are within the limits specified in Gate One's
    settings (e.g. 50limits.conf).  Here's an example::

        @require(authenticated(), policies('terminal'))
        def new_terminal(self, settings):
            # Actual function would be here
            pass

    That would apply all policies that are configured for the 'terminal'
    application.  It works like this:

    The :class:`~app_terminal.TerminalApplication` application registers its
    name and policy-checking function inside of
    :meth:`~app_terminal.TerminalApplication.initialize` like so::

        self.ws.security.update({'terminal': terminal_policies})

    Whenever a function decorated with ``@require(policies('terminal'))`` is
    called the registered policy-checking function (e.g.
    :func:`app_terminal.terminal_policies`) will be called, passing the current
    instance of :class:`policies` as the only argument.

    It is then up to the policy-checking function to make a determination as to
    whether or not the user is allowed to execute the decorated function and
    must return `True` if allowed.  Also note that the policy-checking function
    will be able to make modifications to the function and its arguments if the
    security policies warrant it.

    .. note::

        If you write your own policy-checking function (like
        :func:`terminal_policies`) it is often a good idea to send a
        notification to the user indicating why they've been denied.  You can
        do this with the :meth:`instance.send_message` method.
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
