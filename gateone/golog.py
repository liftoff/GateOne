# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation

# Meta
__version__ = '1.0'
__version_info__ = (1, 0)
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__doc__ = """
.. _golog.py:

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

import os, logging, json
from tornado.log import LogFormatter

class JSONAdapter(logging.LoggerAdapter):
    """
    A `logging.LoggerAdapter` that prepends keyword argument information to log
    entries.  Expects the passed in dict-like object which will be included.
    """
    def process(self, msg, kwargs):
        return ('{json_data} {msg}'.format(
            json_data=json.dumps(self.extra, sort_keys=True), msg=msg),
            kwargs)

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
    from tornado.options import options
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, options.logging.upper()))
    if name == None:
        # root logger; leave it alone
        return logger
    # Remove any existing handlers on the logger
    logger.handlers = []
    if options.log_file_prefix:
        if name:
            basepath = os.path.split(options.log_file_prefix)[0]
            filename = name.replace('.', '-') + '.log'
            path = os.path.join(basepath, filename)
        else:
            path = options.log_file_prefix
        channel = logging.handlers.RotatingFileHandler(
            filename=path,
            maxBytes=options.log_file_max_size,
            backupCount=options.log_file_num_backups)
        channel.setFormatter(LogFormatter(color=False))
        logger.addHandler(channel)
    if kwargs:
        logger = JSONAdapter(logger, kwargs)
    return logger

go_log = go_logger('gateone')
app_log = logging.getLogger("gateone.app") # Not used--just defines the parent
auth_log = logging.getLogger("gateone.auth")
msg_log = logging.getLogger("gateone.messaging")
