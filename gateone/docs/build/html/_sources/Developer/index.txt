.. _developer-docs:

Developer Documentation
=======================

Python Code
-----------
Gate One consists of gateone.py and several supporting Python modules and scripts.  The documentation for each can be found below:

.. toctree::

    authentication.rst
    authorization.rst
    ctypes_pam.rst
    pam.rst
    sso.rst
    log.rst
    logviewer.rst
    server.rst
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

    plugin_help.rst

.. note:: The Terminal application has its own plugins.

Developing Plugins
------------------
Developing plugins for Gate One is easy and fun.  See :ref:`example-plugin` for how it's done.

Embeddeding Gate One Into Other Applications
--------------------------------------------

.. toctree::

    embedding.rst
