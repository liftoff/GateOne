About Gate One
==============
`Gate One <http://liftoffsoftware.com/Products/GateOne>`_ is an HTML5 web-based terminal emulator and SSH client.  Top features:

    * No browser plugins are required!
    * Supports multiple simultaneous terminal sessions.
    * Advanced terminal emulation including support for 256 colors, fancy text styles, and more.
    * Supports displaying PNG and JPEG images inline within terminals (see screenshots).
    * Type in your native language!  Gate One supports Unicode, non-English keyboard layouts, and localized strings (internationalization or i18n).
    * Natural copy & paste:  Highlight text and use your browser's native context menu.  On Linux desktops you can also middle-click-to-paste.
    * Terminal sessions can be resumed even if the browser is closed or disconnected.  They can also be resumed from a completely different computer.
    * Supports server-side logging of user sessions via any combination of syslog, remote syslog, or directly to disk.
    * Gate One can be embedded into--and completely controlled by--other applications.  A few lines of JavaScript is all it takes!
    * Many authentication mechanisms are supported:  Anonymous, Kerberos (Single Sign-On with Active Directory!), PAM, Google Auth, and there's an OpenID-like WebSocket API for applications embedding Gate One (see the chat app in the tests directory for an example of how it works).
    * Gate One is easy to customize:  Themes and plugins can add features or override just about anything.  In fact, Gate One's SSH functionality is implemented entirely via a plugin.
    * Plugins can be written in any combination of Python, JavaScript, or CSS.
    * The Gate One server can be stopped & started without users losing their running terminal applications (even SSH sessions stay connected!).
    * The SSH plugin allows users to duplicate sessions without having to re-enter their username and password (it re-uses the existing SSH tunnel).  It also supports key-based authentication and includes an SSH identity manager that supports RSA, DSA, ECDSA, and even X.509 certificates.
    * The Logging plugin includes a Log Viewer that allows users to sort, view, and even export recordings of their terminal sessions to self-contained HTML files that can be shared.  Demonstrating anything on the command line can be as simple as performing the task and exporting the log!
    * The Playback plugin allows users to "rewind" and play back their connected terminal sessions in real-time, just like a video!  This can be done via the playback controls or by holding the shift key while scrolling.

License
-------
Gate One is dual licensed:  `AGPLv3 <http://www.gnu.org/licenses/agpl.html>`_ or `Commercial Licensing <http://liftoffsoftware.com/Pricing>`_.  More information can be found at http://liftoffsoftware.com/

Screenshots
-----------
.. figure:: http://i.imgur.com/T5gOz.png
    :align: center

    The Grid View showing multiple terminals

.. figure:: http://i.imgur.com/hrsSE.png
    :align: center

    Displaying images inline in a terminal

Documentation
-------------
The documentation for Gate One can be found hee:  http://liftoff.github.com/GateOne/

Also, all (this) documentation is in the "gateone/docs" directory.  The HTML form is pre-built and ready-to-read.

Demo
----
Just press the ESC key on any page at http://liftoffsoftware.com/ to have Gate One drop down into view, Quake-style!
