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

    \x1b]_;notice|<the message>\x07

Very straightforward and also very powerful.
"""

# Meta
__version__ = '1.0'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Special optional escape sequence handler (see docs on how it works)
def notice_esc_seq_handler(message, tws):
    """
    Handles text passed from the special optional escape sequance handler to
    display a *message* to the connected client (browser).
    """
    message = {'notice': message}
    tws.write_message(message)

hooks = {
    'Escape': notice_esc_seq_handler,
}