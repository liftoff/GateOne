.. _developer-docs:

Developer Documentation
=======================

Python Code
-----------
Gate One consists of gateone.py and several supporting Python modules and scripts.  The documentation for each can be found below:

.. toctree::

    auth.rst
    authpam.rst
    gateone.rst
    logviewer.rst
    remote_syslog.rst
    sso.rst
    terminal.rst
    termio.rst
    utils.rst

JavaScript Code
---------------
A large and very important part of Gate One is the client-side JavaScript that runs in the user's browser.  This consists of the following:

.. toctree::

    js_gateone.rst
    js_go_process.rst

Plugin Code
-----------
Gate One comes bundled with a number of plugins which can include any number of files in Python, JavaScript, or CSS (yes, you could have a CSS-only plugin!).  These included plugins are below:

.. toctree::

    plugin_bookmarks.rst
    plugin_help.rst
    plugin_logging.rst
    plugin_playback.rst
    plugin_ssh.rst

Developing Plugins
------------------
.. todo:: Write documentation on how to write plugins.

Embeddeding Gate One Into Other Applications
--------------------------------------------

.. toctree::

    embedding_part1.rst
