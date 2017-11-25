# -*- coding: utf-8 -*-

__doc__ = """\
A Gate One Terminal plugin that doesn't do anything in particular.  It simply
gets installed as part of the example package to demonstrate how to install a
plugin.

Installation
------------
Just run ``sudo python setup.py install`` in the 'example_package' directory:

.. ansi-block::

    \x1b[1;34muser\x1b[0m@host\x1b[1;34m:~ $\x1b[0m sudo python setup.py install

Including JavaScript or CSS
---------------------------
You can use this package to have your own JavaScript or CSS files automatically
loaded by Gate One.  Just place the files in the ``static`` directory and as
long as their filenames end in .css or .js they will be loaded automatically
by Gate One when the user connects.


Source Code Documentation
-------------------------

Python
^^^^^^
"""

# Meta - Change these to reflect your own info:
__version__ = '1.0'
__license__ = "AGPLv3"
__version_info__ = (1, 0)
__author__ = 'Some Person <some.person@example.com>'

import os, logging

# Globals
PLUGIN_PATH = os.path.split(__file__)[0]

def initialize(self):
    """
    Called inside of :meth:`TerminalApplication.initialize` shortly after the
    WebSocket is instantiated.  Put whatever code you want here that should be
    called whenever a user connects to Gate One.

    .. note::

        You don't actually have to put anything inside this plugin if you're
        just loading JavaScript/CSS.  It can still be useful to know that your
        plugin got loaded successfully by Gate One though so it's best to have
        at least a simple logging.info() call indicating that your plugin was
        installed/loaded correctly.
    """
    logging.info("Example Package Plugin loaded")
    pass

hooks = {}

# NOTE: If you wanted to make a Gate One application instead of a plugin you'd
# have something like this in this file instead of hooks:

#apps = [ExampleApplication]
