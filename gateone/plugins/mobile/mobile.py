# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# TODO: Complete this docstring...
__doc__ = """\
mobile.py - A plugin to enable the use of Gate One on mobile devices.

The Python code of this plugin only does one thing:  It adds a single line to
the `<head>` of Gate One's index.html page by way of the 'head' hook.  Quite
literally, this is everything::

    header_hooks = [
        '<meta name="viewport" content="target-densitydpi=device-dpi, width=device-width, initial-scale=1.0, minimum-scale=1.0, user-scalable=0">',
    ]

    hooks = {
        'HTML': {
            'head': header_hooks,
        }
    }

.. seealso:: https://developer.mozilla.org/en-US/docs/Mobile/Viewport_meta_tag

.. note:: 'head' hooks don't work in embedded mode.
"""

# Meta
__version__ = '0.9'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

header_hooks = [
    '<meta name="viewport" content="target-densitydpi=device-dpi, width=device-width, initial-scale=1.0, minimum-scale=1.0, user-scalable=0">',
]

hooks = {
    'HTML': {
        'head': header_hooks,
    }
}