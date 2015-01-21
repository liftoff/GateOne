# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__doc__ = """
.. _log.py:

Logging Module for Gate One
===========================

This module contains a number of pre-defined loggers for use within Gate One:

    ==========  =============================================================
    Name        Description
    ==========  =============================================================
    go_log      Used for logging internal Gate One events.
    auth_log    Used for logging authentication and authorization events.
    msg_log     Used for logging messages sent to/from users.
    ==========  =============================================================

Applications may also use their own loggers for differentiation purposes.  Such
loggers should be prefixed with 'gateone.app.' like so::

    >>> import logging
    >>> logger = logging.getLogger("gateone.app.myapp")

Additional loggers may be defined within a `GOApplication` with additional
prefixing::

    >>> xfer_log = logging.getLogger("gateone.app.myapp.xfer")
    >>> lookup_log = logging.getLogger("gateone.app.myapp.lookup")

.. note::

    This module does not cover session logging within the Terminal application.
    That is a built-in feature of the `termio` module.
"""

import os.path, sys, logging, json
from .utils import mkdir_p
from tornado.options import options
from tornado.log import LogFormatter

LOGS = set() # Holds a list of all our log paths so we can fix permissions
# These should match what's in the syslog module (hopefully not platform-dependent)
FACILITIES = {
    'auth': 32,
    'cron': 72,
    'daemon': 24,
    'kern': 0,
    'local0': 128,
    'local1': 136,
    'local2': 144,
    'local3': 152,
    'local4': 160,
    'local5': 168,
    'local6': 176,
    'local7': 184,
    'lpr': 48,
    'mail': 16,
    'news': 56,
    'syslog': 40,
    'user': 8,
    'uucp': 64
}

# Exceptions
class UnknownFacility(Exception):
    """
    Raised if `string_to_syslog_facility` is given a string that doesn't match
    a known syslog facility.
    """
    pass

class JSONAdapter(logging.LoggerAdapter):
    """
    A `logging.LoggerAdapter` that prepends keyword argument information to log
    entries.  Expects the passed in dict-like object which will be included.
    """
    def process(self, msg, kwargs):
        extra = self.extra.copy()
        if 'metadata' in kwargs:
            extra.update(kwargs.pop('metadata'))
        if extra:
            json_data = json.dumps(extra, sort_keys=True, ensure_ascii=False)
            try:
                line = u'{json_data} {msg}'.format(json_data=json_data, msg=msg)
            except UnicodeDecodeError:
                line = u'{json_data} {msg}'.format(
                    json_data=json_data, msg=repr(msg))
        else:
            line = msg
        return (line, kwargs)

def string_to_syslog_facility(facility):
    """
    Given a string (*facility*) such as, "daemon" returns the numeric
    syslog.LOG_* equivalent.
    """
    if facility.lower() in FACILITIES:
        return FACILITIES[facility.lower()]
    else:
        raise UnknownFacility(
            "%s does not match a known syslog facility" % repr(facility))

def go_logger(name, **kwargs):
    """
    Returns a new `logging.Logger` instance using the given *name*
    pre-configured to match Gate One's usual logging output.  The given *name*
    will automatically be prefixed with 'gateone.' if it is not already.  So if
    *name* is 'app.foo' the `~logging.Logger` would end up named
    'gateone.app.foo'.  If the given *name* is already prefixed with 'gateone.'
    it will be left as-is.

    The log will be saved in the same location as Gate One's configured
    `log_file_prefix` using the given *name* with the following convention:

        ``gateone/logs/<modified *name*>.log``

    The file name will be modified like so:

        * It will have the 'gateone' portion removed (since it's redundant).
        * Dots will be replaced with dashes (-).

    Examples::

        >>> auth_logger = go_logger('gateone.auth.terminal')
        >>> auth_logger.info('test1')
        >>> app_logger = go_logger('gateone.app.terminal')
        >>> app_logger.info('test2')
        >>> import os
        >>> os.lisdir('/opt/gateone/logs')
        ['auth.log', 'auth-terminal.log', 'app-terminal.log' 'webserver.log']

    If any *kwargs* are given they will be JSON-encoded and included in the log
    message after the date/metadata like so::

        >>> auth_logger.info('test3', {"user": "bob", "ip": "10.1.1.100"})
        [I 130828 15:00:56 app.py:10] {"user": "bob", "ip": "10.1.1.100"} test3
    """
    logger = logging.getLogger(name)
    if '--help' in sys.argv:
        # Skip log file creation if the user is just getting help on the CLI
        return logger
    if not options.log_file_prefix or options.logging.upper() == 'NONE':
        # Logging is disabled but we still have to return the adapter so that
        # passing metadata to the logger won't throw exceptions
        return JSONAdapter(logger, kwargs)
    preserve = None # Save the stdout handler (because it looks nice =)
    if name == None:
        # root logger; make sure we save the pretty-printing stdout handler...
        for handler in logger.handlers:
            if not isinstance(handler, logging.handlers.RotatingFileHandler):
                preserve = handler
    # Remove any existing handlers on the logger
    logger.handlers = []
    if preserve: # Add back the one we preserved (if any)
        logger.handlers.append(preserve)
    logger.setLevel(getattr(logging, options.logging.upper()))
    if options.log_file_prefix:
        if name:
            basepath = os.path.split(options.log_file_prefix)[0]
            filename = name.replace('.', '-') + '.log'
            path = os.path.join(basepath, filename)
        else:
            path = options.log_file_prefix
            basepath = os.path.split(options.log_file_prefix)[0]
        if not os.path.isdir(basepath):
            mkdir_p(basepath)
        LOGS.add(path)
        channel = logging.handlers.RotatingFileHandler(
            filename=path,
            maxBytes=options.log_file_max_size,
            backupCount=options.log_file_num_backups)
        channel.setFormatter(LogFormatter(color=False))
        logger.addHandler(channel)
    logger = JSONAdapter(logger, kwargs)
    return logger
