.. _release-notes:

Release Notes / Changelog
=========================

0.9
---
Release Date
^^^^^^^^^^^^
October 13th, 2011

Summary of Changes
^^^^^^^^^^^^^^^^^^
This was the initial release of Gate One.  It is also known as "the beta".  There's no comparison.

.. note:: Gate One 0.9 was written by Dan McDougall in his spare time over the course of ~9 months starting in January, 2011.

1.0
---
Release Date
^^^^^^^^^^^^
March 6th, 2012

Summary of Changes
^^^^^^^^^^^^^^^^^^
This was the first packaged release of Gate One with commercial support available from `Liftoff Software <http://liftoffsoftware.com/>`_.  Highlights of changes since the beta:

    * **MAJOR performance enhancements:**  Gate One is now much, much faster than the beta (server-side).
    * **New Feature:** Added the ability to display PNG and JPEG images in terminals (e.g. `cat someimage.png`).  Images output to stdout will be automatically resized to fit and displayed inline in a given terminal.
    * **New Feature:** Added support for 256-color and aixterm (16-bit or 'bright') color modes.
    * **New Feature:** Added support for PAM authentication.
    * **New Feature:** Added IPv6 support.
    * **New Feature:** Added the ability to duplicate SSH sessions without having to re-enter your password (OpenSSH Master mode with slaves aka session multiplexing).
    * **New Feature:** Added the ability to redirect incoming HTTP connections on port 80 to HTTPS (whatever port is configured).
    * **New Feature:** Added a command line log viewer (playback or flat view).
    * The bookmarks manager is now feature-complete with sophisticated server synchronization.  Bookmarks will say in sync no matter what client you're connecting from.
    * User sessions are now associated with the user account rather than the browser session.  This means you can move from one desktop to another and go back to preciesely what you were working on.  You can even view both sessions simultaneously (live updates) if both browsers are logged in as the same user.
    * Improved internationalization support.  This includes support for translations and foreign language keyboards.
    * Much improved terminal emulation.  Display bugs with programs like midnight commander have been fixed.
    * API-based authentication has been added to allow applications embedding Gate One to use their pre-authenticated users as-is without requiring the use of iframes or having to autheticate twice.
    * Copy & Paste works in Windows now (it always worked fine in Linux).
    * There are now dozens of hooks throughout the code for plugins to take advantage of.  For example, you can now intercept the screen before it is displayed in the terminal to apply regular expressions and/or transformations to the text.
    * A new "dark black" CSS theme has been added.
    * Users can now select their CSS theme separate from their text color scheme.
    * Added lots of helpful error messages in the event that a user is missing a dependency or doesn't have permission to, say, write to the user directory.
    * Zillions of bugs have been fixed.

See the git commit log for full details on all changes.

1.1
---
Release Date
^^^^^^^^^^^^
November 1st, 2012

Summary of Changes
^^^^^^^^^^^^^^^^^^

    * Now tracking changes in more detail.
    * **MAJOR Performance Enhancement:**  The terminal emulator now caches pre-rendered lines to provide significantly improved performance when rendering terminals into HTML (i.e. whenever there's a screen update).  Example:  In testing, the (localhost) round-trip time for keystroke→server→SSH→server→browser has been reduced from 70-150ms to 10-30ms.
    * **MAC USERS REJOICE:** ⌘-c and ⌘-v now work to copy & paste!
    * **Performance Enhancement:**  The terminal emulator's data structures have been changed to significantly reduce memory utilization.  Lists of lists of strings (:py:attr:`Terminal.screen`) and lists of lists of lists (:py:attr:`Terminal.renditions`) have been replaced with lists of unicode arrays (`array.array('u')` to be precise).
    * **Performance Enhancement:**  In the client JavaScript (:ref:`gateone-javascript`) terminal updates are handled much more efficiently:  Instead of replacing the entire terminal `<pre>` with each update, individual lines are kept track of and updated independently of each other.  This makes using full-screen interactive programs like vim much more responsive and natural.  Especially with large browser window/terminal sizes.
    * **Security Enhancement:**  An `origins` setting has been added that will restrict which URLs client web browsers are allowed to connect to Gate One's WebSocket.  This is to prevent an attacker from being able to control user's sessions via a (sophisticated) spear phishing attack.
    * **Security Enhancement:**  Logic has been added to prevent authentication replay attacks when Gate One is configured to use API authentication.  Previous authentication signatures and timestamps will be checked before any provided credentials will be allowed.
    * **Security Enhancement:**  Gate One can now drop privileges to run as a different user and group.  Continually running as root is no longer required--even if using a privileged port (<=1024).
    * **Security Enhancement:**  You can now require the use of client-side SSL certificates as an extra layer of security as part of the authentication process.
    * **Embedding Enhancement:**  Embedding Gate One into other applications is now much easier and there is an extensive tutorial available.  To find out more see the `gateone/tests/hello_embedded` directory.
    * **Plugin Enhancement:**  Hooks have been added to allow plugins to modify Gate One's `index.html`.  Arbitrary code can be added to the header and the body through simple variable declarations.
    * **Plugin Enhancement:**  Hooks have been added to allow plugins to modify the instances of :class:`termio.Multiplex` and :class:`terminal.Terminal` immediately after they are created (at runtime).  This will allow plugin authors to, say, change how various file types are displayed or to add support for different kinds of terminal emulation.
    * **New Plugin:**  Mobile.  This plugin allows Gate One to be used on mobile browsers that support WebSockets (Note: Only Mobile Firefox and Chrome for Android have been tested).  Works best with devices that have a hardware keyboard.
    * **New Plugin:**  Example.  It is heavily commented and provides examples of how to write your own Gate One plugin.  Included are examples of how to use the new widget() function and how to track the deployment of your plugin.  Try out the real-time load graph!
    * **New Plugin:**  Convenience.  It contains a number of text transformations that make life in a terminal more convenient.  Examples:  Click on the bytes value in the output of 'ls -l' and it will display a message indicating how much that value is in kilobytes, megabytes, gigabytes, terabytes, etc--whatever is appropriate (aka "human readable").  Click on a username in the output of 'ls -l' and it will perform a lookup telling you all about that user.  Ditto for group names; it even tells you which users have that group listed as their primary GID!  It will also give you the 'chmod equivalent' of values like '-rw-r--r--' when that's clicked as well.  Lastly, it makes IPv4 and IPv6 addresses clickable:  It will tell you what hostname they resolve to.
    * **New Feature:**  Added support for Python 3.  NOTE:  Gate One also runs on `pypy <http://pypy.org/>`_ and it's very speedy!
    * **New Feature:**  Gate One now works in Internet Explorer!  Well, IE 10 anyway.
    * **New Feature:**  Gate One can now detect and intelligently display PDF files just like it does for JPEG and PNG files.
    * **New Feature:**  Support for capturing the output of different kinds of files can now be added via a plugin.  You can also override existing file types this way.
    * **New Feature:**  Gate One now includes init scripts for Debian/Ubuntu, Red Hat/CentOS, and Gentoo.  These will be automatically installed via setup.py, the deb, or the rpm.
    * **New Feature:**  Gate One now keeps track of its own pid with the new `pid_file` option.
    * **New Feature:**  CSS/Styles are now downloaded over the WebSocket directly instead of merely being placed in the <head> of the current HTML page.  This simplifies embedding.
    * **New Feature:**  Two new functions have been added to the SSH plugin that make it much easier to call and report on commands executed in a background session:  execRemoteCmd() and commandCompleted().  See the documentation and the Example plugin for details.
    * **New Feature:**  A widget() function has been added to :ref:`gateone-javascript` that allows plugins to create elements that float above terminals.  See the the documentation and the Example plugin (example.js) itself for details.
    * **New Feature:**  The bell sound is now downloaded over the WebSocket and cached locally in the user's browser so it won't need to be downloaded every time the user connects.
    * **New Feature:**  Users can now set a custom bell sound.
    * **New Feature:**  Most usage of the threading module in Gate One has been replaced with Tornado's PeriodicCallback feature and multiprocessing (where appropriate).  This is both more performant and reduces memory utilization considerably.  Especially when there are a large number of open terminals.
    * **New Feature:**  Gate One can now be configured to listen on a Unix socket (as opposed to just TCP/IP addresses).  Thanks to Tamer Mohammed Abdul-Radi of `Cloud9ers <http://cloud9ers.com/>`_ for this contribution.
    * **New Feature:**  Old user session logs are now automatically removed after a configurable time period.  See the `session_logs_max_age` option.
    * **New Feature:**  If you've set the number of rows/columns Gate One will now scale the size of each terminal in an attempt to fit it within the window.  Looks much nicer than having a tiny-sized terminal in the upper left corner of the browser window.
    * **New Feature:**  Bookmarks can now be navigated via the keyboard.  Ctrl-Alt-B will bring up the Bookmarks panel and you can then tab around to choose a bookmark.
    * **New Feature:**  Gate One now includes a ``print`` stylesheet so if you print out a terminal it will actually look nice and readable.  This works wonderfully in conjunction with the "Printable" log view.
    * **New Feature:**  When copying text from a terminal it will now automatically be converted to plaintext (HTML formatting will be removed).  It will also have trailing whitespace removed.
    * **New Feature:**  Added a new theme/text color scheme:  Solarized.  Thanks to Jakub Woyke for this contribution.
    * **Themes:**  Loads and loads of tweaks to improve Gate One's overall appearance in varying situations.
    * **Documentation:**  Many pages of documentation have been added and its overall usefulness has been improved.  For example, this changelog (╴‿╶).

Notable Bugs Fixes
^^^^^^^^^^^^^^^^^^
    * **gateone.js:**  You can now double-click to highlight a word in terminals in a very natural fashion.  This is filed under bugs instead of new features because it was something that should've been working from the get-go but browsers are finicky beasts.
    * **gateone.js:**  No more crazy scrolling:  The browser bug that would scroll text uncontrollably in terminals that had been moved down the page via a CSS3 transform has been worked around.
    * **gateone.js:**  Loads of bug fixes regarding embedding Gate One and the possibilities thereof.  The hello_embedded tutorial is more than just a HOWTO; it's a test case.
    * **gateone.js:**  The logic that detects the number of rows/columns that can fit within the browser window has been enhanced to be more accurate.  This should fix the issue where the tops of terminals could get cut off under just the right circumstances.
    * **gateone.js:**  Fixed a bug where if you tried to drag a dialog in Firefox it would mysteriously get moved to the far left of the window (after which it would drag just fine).  Now dialogs drag in a natural fashion.
    * **gateone.js:**  Fixed a bug where if you disabled terminal slide effects you couldn't turn them back on.
    * **gateone.js:**  Fixed a bug with GateOne.Input.mouse() where it wasn't detecting/assigning Firefox scroll wheel events properly.
    * **gateone.js:**  Fixed the bug with the - (hyphen-minus) key when using vim from inside 'screen'.  Note that this only seemed to happen on RHEL-based Linux distributions.
    * **gateone.js:**  Fixed the issue where you had to click twice on a terminal to move to it when in Grid view (only need to click once now).
    * **gateone.js:**  Fixed the bug where you could wind up with all sorts of HTML formatting when pasting in Mac OS X (and a few other paste methods).  Pastes will now automatically be converted to plaintext if they're registered by the browser as containing formatting.
    * **gateone.py:**  Terminal titles will now be set correctly when resuming a session.
    * **gateone.py:**  Generated self-signed SSL keys and certificates will now be stored in GATEONE_DIR instead of the current working directory unless absolute paths are provided via the --keyfile and --certificate options.
    * **gateone.py:**  When dtach=True and Gate One is stopped & started, resumed terminals will no longer be blank with incorrect values in $ROWS and $COLUMNS until you type ctr=l.  They should now appear properly and have the correct size set without having to do anything at all.
    * **terminal.py:**  Corrected the handling of unicode diacritics (accent marks that modify the proceding character) inside of escape sequences.
    * **termio.py:**  Fixed a bug where multi-regex patterns weren't working with preprocess().
    * **Logging Plugin:**  The "View Log (Flat)" option (now renamed to "Printable Log") works reliably and looks nicer.
    * **Playback Plugin:**  Fixed the bug where a browser's memory utilization could slowly increase over time (only happened with Webkit-based browsers).
    * **Playback plugin:**  Fixed a bug where it was possible to get UnicodeDecodeErrors when exporting the current session's recording to HTML.
    * **Playback Plugin:**  Shift+scroll now works to go forwards/backwards in the playback history in Firefox.  Previously this only worked in Chrome.
    * **SSH Plugin:**  Fixed a bug where the SSH Identity upload dialog wasn't working in Firefox (apparently Firefox uses 'name' instead of 'fileName' for file objects).
    * **SSH Plugin:**  In ssh_connect.py, fixed a bug with telnet connections where the port wasn't being properly converted to a string.

Other Notable Changes
^^^^^^^^^^^^^^^^^^^^^

    * **EMBEDDED MODE CHANGES:**  Embedded mode now requires manual invokation of many things that were previously automatic.  For example, if you've set `embedded: true` when calling :js:func:`GateOne.init` you must now manually invoke :js:func:`GateOne.Terminal.newTerminal` at the appropriate time in your code (e.g. when a user clicks a button or when the page loads).  See the hello_embedded tutorial for examples on how to use Embedded Mode.
    * **gateone.py:**  Added a new configuration option:  `api_timestamp_window`.  This setting controls how long to wait before an API authentication timestamp is no longer accepted.  The default is 30 seconds.
    * **gateone.py:**  The dict that tracks things unique to individual browser sessions (i.e. where the 'refresh_timeout' gets stored) now gets cleaned up automatically when the user disconnects.
    * **gateone.py:**  You can now provide a *partial* server.conf before running Gate One for the first time (e.g. in packaging) and it will be used to set the provided values as defaults.  After which it will overwrite your server.conf with the existing settings in addition to what was missing.
    * **gateone.py:**  If dtach support isn't enabled Gate One will now empty out the `session_dir` at exit.
    * **gateone.py:**  You may now designate which plugins are enabled by creating a plugins.conf file in GATEONE_DIR.  The format of the file is, "one plugin name per line."  Previously, to disable plugins you had to remove them from GATEONE_DIR/plugins/.
    * **gateone.js:**  From now on, when Gate One doesn't have focus (and isn't accepting keyboard input) a graphical overlay will "grey out" the terminal slightly indicating that it is no longer active.  This should make it so that you always know when Gate One is ready to accept your keyboard input.
    * **gateone.js:**  From now on when you paste multiple lines into Gate One trailing whitespace will be removed from those lines.  In 99% of cases this is what you want.
    * **gateone.js:**  Removed the Web Worker bug workaround specific to Firefox 8.  Firefox has moved on.
    * **gateone.js:**  The timeout that calls enableScrollback() with each screen update has been modified to run after 500ms instead of 3500.
    * **gatoene.js:**  Instead of emptying the scrollback buffer, disableScrollback() now just sets its style to "display: none;" and resets this when enableScrollback() is called.
    * **gateone.js:**  The "Info and Tools" and Preferences panels now have a close X icon in the upper right-hand corner like everything else.
    * **gateone.js:**  Added some capabilities checks so that people using inept browsers will at least be given a clear message as to what the problem is.
    * **gateone.js:**  From now on if you set the title of a terminal by hand it will not be overwritten by the :js:func:`~GateOne.Visual.setTitleAction` (aka the X11 title).
    * **gateone.js:**  The toolbar (icons) will now take the width of the scrollbar into account and be adjusted accordingly to make sure it isn't too far to the left or overlapping the scrollbar.
    * **gateone.js:**  The toolbar will now scale in size proportially to the fontSize setting.  So if you are visually impaired and need a larger font size the toolbar icons will get bigger too to help you out.
    * **gateone.js:**  Added :js:attr:`GateOne.prefs.skipChecks` as an option that can be passed to GateOne.init().  If set to true it will skip all the capabilities checks/alerts that Gate One throws up if the browser doesn't support something like WebSockets.
    * **gateone.js:**  You can now close panels and dialogs by pressing the ESC key.
    * **gateone.js:**  When Gate One is loaded from a different origin than where the server lives (i.e. when embedded) and the user has yet to accept the SSL certificate for said origin they will be presented with a dialog where they can accept it and continue.  This should work around the problem of having to buy SSL certificates for all your Gate One servers.
    * **gateone.js:**  Added a :js:attr:`~GateOne.prefs.webWorker` option to :js:attr:`GateOne.prefs`.  By default it will only be used when Gate One is unable to load the Web Worker via the WebSocket (i.e. via a Blob()).  This usually only happens on older versions of Firefox and IE 10, specifically.  Also, it will *actually* only need to be set if you're embedding Gate One into another application that is listening on a different port than the Gate One server (I know, right?).  It is a very, very specific situation in which it would be required.
    * **gateone.js:**  Lots of minor API additions and changes.  Too many to list; you'll just have to look at the docs.  See: :ref:`gateone-javascript`.
    * **gateone.js:**  When the screen updates while viewing the scrollback buffer it will no longer automatically scroll to the bottom of the view.  If a keystroke is pressed *that* will scroll to the bottom.  This should allow one to scroll up while something is outputting lines to the terminal without having the scrolling behavior interrupt what you're looking at.
    * **gateone.js:**  When <script> tags are included in the incoming terminal screen they will be executed automatically.  Very convenient for plugins that override HTML output of FileType magic in terminal.py
    * **go_process.js:**  Before loading lines on the screen the Web Worker will now strip trailing whitespace.  This should make copying & pasting easier.
    * **index.html:**  Changed {{js_init}} to be {% raw js_init %} so people don't have to worry about Tornado's template engine turning things like quotes into HTML entities.
    * **logviewer.py:**  The functions that play back and display .golog files have been modified to read log data in chunks to save huge amounts of memory.  Playing back or displaying a gigantic log should now use as much memory as a small one (i.e. very little).
    * **terminal.py:**  Improved the ability of :py:meth:`Terminal.write` to detect and capture images by switching from using :py:func:`re.match` to using :py:func:`re.search`.
    * **terminal.py:**  The mechanism that detects certain files being output to the terminal has been reworked:  It is now much easier to add support for new file types by subclassing the new FileType class and calling Terminal.add_magic().
    * **terminal.py:**  Added a new global function:  css_colors().  It just dumps the CSS style information for all the text colors that Terminal.dump_html() supports.  The point is to make it easier for 3rd party apps to use dump_html().
    * **terminal.py:**  Added a new global at the bottom of the file:  CSS_COLORS.  It holds all the CSS classes used by the new css_colors() function.
    * **termio.py:**  Lots of improvements to the way .golog files are generated.  Logging to these files now requires less resources and happens with less CPU overhead.
    * **termio.py:**  Added the IUTF-8 setting (and similar) via termios when the "command" is forked/executed.  This should ensure that multi-byte Unicode characters are kept track of properly in various erasure scenarios (e.g. backspace key, up/down arrow history, etc).  Note that this doesn't work over SSH connections (it's an OpenSSH bug).
    * **termio.py:**  Instances of `Multiplex()` may now attach an `exitfunc` that does exactly what you'd expect:  It gets called when the spawned program is terminated.
    * **termio.py:**  You can now pass a string as the 'callback' argument to Multiplex.expect() and it will automatically be converted into a function that writes said string to the child process.
    * **termio.py:**  Changed `Multiplex.writeline()` and `Multiplex.writelines()` so they write `\\r\\n` instead of just `\\n`.  This should fix an issue with terminal programs that expect keystrokes instead of just newlines.
    * **termio.py:** The rate limiter will no longer truncate the output of terminal applications.  Instead it simply suspends their output for ten seconds at a time.  This suspension can be immediately interrupted by the user pressing a key (e.g. Ctrl-C).
    * **termio.py:**  The functions that handle how logs are finalized have been modified to reduce memory consumption by orders of magnitude.  For example, when finalizing a humongous .golog, the `get_or_update_metadata()` function will now read the file in chunks and be very conservative about the whole process instead of reading the entire log into memory before performing operations.
    * **utils.py:**  Increased the timeout value on the openssl commands since the default 5-second timeout wasn't long enough on slower systems.
    * **Playback Plugin:**  The logic that adds the playback controls has been modified to use the new :js:attr:`GateOne.prefs.rowAdjust` property (JavaScript).
    * **Playback plugin:**  Whether or not the playback controls will appear can now be configured via the `GateOne.prefs.showPlaybackControls` option.  So if you're embedding Gate One and don't want the playback controls just pass `showPlaybackControls: false` to :js:func:`GateOne.init`.
    * **SSH Plugin:**  In ssh_connect.py, added a check to make sure that the user's 'ssh' directory is created before it starts trying to use it.
    * **SSH Plugin:**  `execRemoteCmd()` now supports an errorback function as a fourth argument that will get called in the event that the remote command exeution isn't successful.
    * **SSH Plugin:**  Generating the public key using the private key is now handled asynchronously (so it won't block on a slow or bogged-down system).
    * **SSH Plugin:**  Private keys will now be validated before they're saved.  If a key does not pass (basic) validation an error will be presented to the user and nothing will be saved.
    * **SSH Plugin:**  The user will now be asked for the passphrase of the private key if they do not provide a public key when submitting the identity upload form.  This is so the public key can be generated from the private one (and it sure beats a silent failure).
    * **Help Plugin:**  When viewing "About Gate One" it will now show which version you're running (based on the version string of the GateOne object in :ref:`gateone-javascript`).

See the git commit log for full details on all changes.