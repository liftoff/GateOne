# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#
from __future__ import unicode_literals

__doc__ = """\
policy.py - A module containing the Terminal application's policy functions.
"""

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

from functools import partial
from gateone import SESSIONS
from gateone.core.locale import get_translation
from gateone.core.log import go_logger
from gateone.auth.authorization import applicable_policies

# Localization support
_ = get_translation()

def policy_new_terminal(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to execute :func:`new_terminal` and applies any configured
    restrictions (e.g. max_dimensions).  Specifically, checks to make sure the
    user is not in violation of their applicable policies (e.g. max_terms).
    """
    instance = cls.instance
    session = instance.ws.session
    auth_log = instance.ws.auth_log
    if not session:
        return False
    try:
        term = cls.f_args[0]['term']
    except (KeyError, IndexError):
        # new_terminal got bad *settings*.  Deny
        return False
    user = instance.current_user
    open_terminals = 0
    locations = SESSIONS[session]['locations']
    if term in instance.loc_terms:
        # Terminal already exists (reattaching) or was shared by someone else
        return True
    for loc in locations.values():
        for t, term_obj in loc['terminal'].items():
            if t in instance.loc_terms:
                if user == term_obj['user']:
                    # Terms shared by others don't count
                    if user['upn'] == 'ANONYMOUS':
                        # ANONYMOUS users are all the same so we have to use
                        # the session ID
                        if session == term_obj['user']['session']:
                            open_terminals += 1
                    else:
                        open_terminals += 1
    # Start by determining the limits
    max_terms = 0 # No limit
    if 'max_terms' in policy:
        max_terms = policy['max_terms']
    max_cols = 0
    max_rows = 0
    if 'max_dimensions' in policy:
        max_cols = policy['max_dimensions']['columns']
        max_rows = policy['max_dimensions']['rows']
    if max_terms:
        if open_terminals >= max_terms:
            auth_log.error(_(
                "%s denied opening new terminal.  The 'max_terms' policy limit "
                "(%s) has been reached for this user." % (
                user['upn'], max_terms)))
            # Let the client know this term is no more (after a timeout so the
            # can complete its newTerminal stuff beforehand).
            term_ended = partial(instance.term_ended, term)
            instance.add_timeout("500", term_ended)
            cls.error = _(
                "Server policy dictates that you may only open %s terminal(s) "
                % max_terms)
            return False
    if max_cols:
        if int(cls.f_args['columns']) > max_cols:
            cls.f_args['columns'] = max_cols # Reduce to max size
    if max_rows:
        if int(cls.f_args['rows']) > max_rows:
            cls.f_args['rows'] = max_rows # Reduce to max size
    return True

def policy_has_write_permission(cls, policy, term):
    """
    Returns True if the user has write access to the given *term*.
    """
    instance = cls.instance
    function_name = cls.function.__name__
    auth_log = instance.ws.auth_log
    user = instance.current_user
    if not user:
        return False # Broadcast viewers can't write to anything
    term_obj = instance.loc_terms.get(term, None)
    if not term_obj:
        return True # Term doesn't exist anymore--just let it fall through
    if 'share_id' in term_obj:
        # This is a shared terminal.  Check if the user is in the 'write' list
        shared = instance.ws.persist['terminal']['shared']
        share_obj = shared[term_obj['share_id']]
        if user['upn'] in share_obj['write']:
            return True
        elif share_obj['write'] in ['AUTHENTICATED', 'ANONYMOUS']:
            return True
        elif isinstance(share_obj['write'], list):
            # Iterate and check each item
            for allowed in share_obj['write']:
                if allowed == user['upn']:
                    return True
                elif allowed in ['AUTHENTICATED', 'ANONYMOUS']:
                    return True
        auth_log.error(
            _("{upn} denied executing {function_name} by policy (not owner "
              "of terminal or does not have write access).").format(
                  upn=user['upn'], function_name=function_name))
        return False
    return True

def policy_write_check_dict(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to resize the terminal in question.  This version of the write
    check expects that the *term* be provided in a dictionary that's provided
    as the first argument to the decorated function.
    """
    try:
        term = int(cls.f_args[0]['term'])
    except (KeyError, IndexError):
        # Function got bad args.  Deny
        return False
    return policy_has_write_permission(cls, policy, term)

def policy_write_check_arg(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to resize the terminal in question.  This version of the write
    check expects that the *term* be provided as the first argument passed to
    the decorated function.
    """
    try:
        term = int(cls.f_args[0])
    except (KeyError, IndexError):
        # Function got bad args.  Deny
        return False
    return policy_has_write_permission(cls, policy, term)

def policy_share_terminal(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to execute :func:`share_terminal`.
    """
    auth_log = cls.instance.ws.auth_log
    user = cls.instance.current_user
    try:
        cls.f_args[0]['term']
    except (KeyError, IndexError):
        # share_terminal got bad *settings*.  Deny
        return False
    can_share = policy.get('share_terminals', True)
    if not can_share:
        auth_log.error(_(
            "%s denied sharing terminal by policy." % user['upn']))
        return False
    return True

def policy_char_handler(cls, policy):
    """
    Called by :func:`terminal_policies`, returns True if the user is
    authorized to write to the current (or specified) terminal.
    """
    error_msg = _("You do not have permission to write to this terminal.")
    cls.error = error_msg
    instance = cls.instance
    try:
        term = cls.f_args[1]
    except IndexError:
        # char_handler didn't get 'term' as a non-keyword argument.  Try kword:
        try:
            term = cls.f_kwargs['term']
        except KeyError:
            # No 'term' was given at all.  Use current_term
            if not hasattr(instance, 'current_term'):
                return False
            term = instance.current_term
    # Make sure the term is an int
    term = int(term)
    if term not in instance.loc_terms:
        return True # Terminal was probably just closed
    term_obj = instance.loc_terms[term]
    user = instance.current_user
    if user['upn'] == term_obj['user']['upn']:
        # UPN match...  Double-check ANONYMOUS
        if user['upn'] == 'ANONYMOUS':
            # All users will be ANONYMOUS so we need to check their session ID
            if user['session'] == term_obj['user']['session']:
                return True
        # TODO: Think about adding an administrative lock feature here
        else:
            return True # Users can always write to their own terminals
    if 'share_id' in term_obj:
        # This is a shared terminal.  Check if the user is in the 'write' list
        shared = instance.ws.persist['terminal']['shared']
        share_obj = shared[term_obj['share_id']]
        if user['upn'] in share_obj['write']:
            return True
        elif share_obj['write'] in ['AUTHENTICATED', 'ANONYMOUS']:
            return True
        elif isinstance(share_obj['write'], list):
            # Iterate and check each item
            for allowed in share_obj['write']:
                if allowed == user['upn']:
                    return True
                elif allowed in ['AUTHENTICATED', 'ANONYMOUS']:
                    return True
        # TODO: Handle regexes and lists of regexes here
    return False

def terminal_policies(cls):
    """
    This function gets registered under 'terminal' in the
    :attr:`ApplicationWebSocket.security` dict and is called by the
    :func:`require` decorator by way of the :class:`policies` sub-function. It
    returns True or False depending on what is defined in the settings dir and
    what function is being called.

    This function will keep track of and place limmits on the following:

        * The number of open terminals.
        * How big each terminal may be.
        * Who may view or write to a shared terminal.

    If no 'terminal' policies are defined this function will always return True.
    """
    instance = cls.instance # TerminalApplication instance
    function = cls.function # Wrapped function
    #f_args = cls.f_args     # Wrapped function's arguments
    #f_kwargs = cls.f_kwargs # Wrapped function's keyword arguments
    policy_functions = {
        'new_terminal': policy_new_terminal,
        'resize': policy_write_check_dict,
        'set_term_encoding': policy_write_check_dict,
        'set_term_keyboard_mode': policy_write_check_dict,
        'move_terminal': policy_write_check_dict,
        'kill_terminal': policy_write_check_arg,
        'reset_terminal': policy_write_check_arg,
        'manual_title': policy_write_check_dict,
        'share_terminal': policy_share_terminal,
        'char_handler': policy_char_handler
    }
    auth_log = instance.ws.auth_log
    user = instance.current_user
    policy = applicable_policies('terminal', user, instance.ws.prefs)
    if not policy: # Empty RUDict
        return True # A world without limits!
    # Start by determining if the user can even login to the terminal app
    if 'allow' in policy:
        if not policy['allow']:
            auth_log.error(_(
                "%s denied access to the Terminal application by policy."
                % user['upn']))
            return False
    if function.__name__ in policy_functions:
        return policy_functions[function.__name__](cls, policy)
    return True # Default to permissive if we made it this far
