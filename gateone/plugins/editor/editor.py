# -*- coding: utf-8 -*-
#
#       Copyright 2014 Liftoff Software Corporation
#

__doc__ = """\
editor.py - A plugin for Gate One that provides a nice code/text editor
component.  This server-side plugin merely provides a mechanism for the
client-side code to download editor "modes"

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'WebSocket': {
            'go:get_editor_mode': get_editor_mode,
        }
    }

Docstrings
----------
"""

# Meta
__version__ = '1.0'
__version_info__ = (1, 0)
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

import os
from gateone.core.locale import get_translation

_ = get_translation()

def get_editor_mode(self, mode):
    """
    Sends the requested *mode* file(s) to the client via
    `ApplicationWebSocket.send_js`.  If the specified *mode* file cannot be
    found the 'go:editor_invalid_mode' WebSocket action will be sent to the
    client so it can know to stop waiting for something that doesn't exist.
    """
    #print("get_editor_mode: %s" % mode)
    plugin_path = os.path.split(__file__)[0]
    mode_file = '%s.js' % mode
    mode_path = os.path.join(plugin_path, 'static', 'mode', mode, mode_file)
    if os.path.exists(mode_path):
        self.send_js(mode_path, force=True)
    else:
        self.write_message({"go:editor_invalid_mode": mode})

hooks = {
    'WebSocket': {
        'go:get_editor_mode': get_editor_mode,
    }
}
