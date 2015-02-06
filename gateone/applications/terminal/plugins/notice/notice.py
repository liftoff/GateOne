# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# TODO: Complete this docstring...
__doc__ = """\
notice.py - A plugin for Gate One that adds an escape sequence handler that will
tell the client browser to display a message whenever said escape sequence is
encountered.  Any terminal program can emit the following escape sequence to
display a message in the browser::

    \\x1b]_;notice|<the message>\\x07

.. note that the above example has double slashes...  Don't do that in your actual code.  They're just there to make sure it shows up properly in the HTML documentation.

Very straightforward and also very powerful.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'Escape': notice_esc_seq_handler,
    }

Docstrings
----------
"""

# Meta
__version__ = '1.0'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

from gateone.core.log import go_logger

# Special optional escape sequence handler (see docs on how it works)
def notice_esc_seq_handler(self, message, term=None, multiplex=None):
    """
    Handles text passed from the special optional escape sequance handler to
    display a *message* to the connected client (browser).  It can be invoked
    like so:

    .. ansi-block::

        $ echo -e "\\033]_;notice|Text passed to some_function()\\007"

    .. seealso::

        :class:`app_terminal.TerminalApplication.opt_esc_handler` and
        :func:`terminal.Terminal._opt_handler`
    """
    if not hasattr(self, 'notice_log'):
        self.notice_log = go_logger(
            'gateone.terminal.notice', plugin='notice', **self.log_metadata)
    self.notice_log.info(
        "Notice Plugin: %s" % message, metadata={'term': term, 'text': message})
    message = "Term {term}: {message}".format(term=term, message=message)
    message = {'go:notice': message}
    self.write_message(message)

hooks = {
    'Escape': notice_esc_seq_handler,
}
