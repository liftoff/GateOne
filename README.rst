About Gate One
==============
`Gate One <http://liftoffsoftware.com/Products/GateOne>`_ is an HTML5 web-based terminal emulator and SSH client.  Top features:

* No browser plugins required!  Say goodbye to the security problems of Java, Flash, and ActiveX.
* Multi-user and multi-terminal:  Hundreds of simultaneous users and terminals can be served from ho-hum hardware.
* Advanced terminal emulation including support for 256 colors, fancy text styles, and more.
* Supports capturing and displaying images and PDFs inline within terminals (see screenshots).
* Type in your native language!  Gate One supports Unicode, international keyboard layouts, and localized strings (internationalization or i18n).
* Natural copy & paste:  Highlight text and use your browser's native context menu.  On Macs you can use ⌘-c and ⌘-v and on Linux desktops you can middle-click-to-paste.  Shift-Insert works too!
* Terminal sessions can be resumed even if the browser is closed or disconnected.  They can also be resumed from a completely different computer.  You'll never have to worry about the office VPN disconnecting again!
* Supports server-side logging of user sessions via any combination of syslog, remote syslog, or directly to disk.
* Gate One can be embedded into any web application.  A few lines of JavaScript is all it takes!  There's an interactive tutorial covering how to embed available in the `tests` directory (hello_embedded).
* Many authentication mechanisms are supported:  Anonymous, Kerberos (Single Sign-On with Active Directory!), PAM, Google Auth, and there's an OpenID-like WebSocket API for applications embedding Gate One (see the chat app in the tests directory for an example of how it works).
* Gate One is easy to customize:  Themes and plugins can add features or override just about anything.  In fact, Gate One's SSH functionality is implemented entirely via a plugin.
* Plugins can be written in any combination of Python, JavaScript, and CSS.
* The Gate One server can be stopped & started without users losing their running terminal applications (even SSH sessions stay connected!).
* The SSH plugin allows users to duplicate sessions without having to re-enter their username and password (it re-uses the existing SSH tunnel).  It also supports key-based authentication and includes an SSH identity manager that supports RSA, DSA, ECDSA, and even X.509 certificates.
* The SSH plugin also provides a library of functions that *other* plugins can use to seamlessly execute background operations on the currently-connected terminal.  You can capture this output from JavaScript and do whatever you want with it.
* The Bookmarks plugin lets you keep track of *all* of your hosts with support for tagging, sorting, and includes a super fast search.  It was built to handle thousands of bookmarks and can be used with whatever URLs you want--it isn't limited to SSH!
* The Logging plugin includes a Log Viewer that allows users to sort, view, and even export recordings of their terminal sessions to self-contained HTML files that can be shared.  Demonstrating anything on the command line can be as simple as performing the task and clicking a button!
* The Playback plugin allows users to rewind and play back their connected terminal sessions in real-time, just like a video!  This can be done via the playback controls or by holding the shift key while scrolling.
* The Convenience plugin adds many convenient capabilities:
    * IPv4 and IPv6 addresses become clickable elements that can perform a reverse DNS lookup.
    * The output of 'ls -l' is transformed into clickable elements that can perform user and group lookups, convert bytes into human-readable strings, and even tell you what the 'chmod equivalent' is of the permissions field (e.g. clicking on 'crw-rw-rw-' would tell you, "(Character Device) with permissions equivalent to 'chmod 0666'").
    * Automatic syntax highlighting of syslog messages.
* The Example plugin demonstrates how to write your own plugins and shows off the SSH plugin's exec_remote_command() functionality.
* Gate One works with Python 2.6+, Python 3, and even pypy!
* The daemon that acts as the web server for Gate One is small and light enough to be included in `embedded devices <http://beagleboard.org/bone>`_.

License
-------
Gate One is dual licensed:  `AGPLv3 <http://www.gnu.org/licenses/agpl.html>`_ or `Commercial Licensing <http://liftoffsoftware.com/Products/GateOne>`_.  More information can be found at http://liftoffsoftware.com/

Screenshots
-----------
.. figure:: http://i.imgur.com/fb32a.png
    :align: center

    The Grid View showing multiple terminals

.. figure:: http://i.imgur.com/5P6wy.png
    :align: center

    Displaying images inline in a terminal

.. figure:: http://i.imgur.com/zRLn3.png
    :align: center

    A demonstration of some of the Convenience plugin's capabilities

.. figure:: http://i.imgur.com/97CYx.png
    :align: center

    The Example plugin showing off the real-time load graph and the 'top' widget

Documentation
-------------
The documentation for Gate One can be found here:  http://liftoff.github.com/GateOne/

Also, all (this) documentation is in the "gateone/docs" directory.  The HTML form is pre-built and ready-to-read.

Demo
----
Just press the ESC key on any page at http://liftoffsoftware.com/ to have Gate One drop down into view, Quake-style!

Other Notable Bits
------------------
Gate One's `termio` and `terminal` Python modules can be used together to automate, screen-scrape, and completely control terminal applications.  The `expect() <http://liftoff.github.com/GateOne/Developer/termio.html#termio.BaseMultiplex.expect>`_ function can be used as a replacement for `pexpect <http://pexpect.readthedocs.org/en/latest/>`_ that has some additional features and benefits:

* It can be used asynchronously:  It won't block which means it is perfect for executing commands from a web application.
* It supports sophisticated decision trees and callbacks:  You can completely re-define all patterns and callbacks on-the-fly based on whatever conditions you want.
