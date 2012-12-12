.. _gateone-javascript:

gateone.js
==========
Gate One's JavaScript (`source <https://github.com/liftoff/GateOne/blob/master/gateone/static/gateone.js>`_) is made up of several modules (aka plugins), each pertaining to a specific type of activity.  These modules are laid out like so:

* `GateOne.Base`_
* `GateOne`_
* `GateOne.Utils`_
* `GateOne.Net`_
* `GateOne.Input`_
* `GateOne.Visual`_
* `GateOne.Terminal`_
* `GateOne.User`_

The properties and functions of each respective module are outlined below.

GateOne.Base
------------
.. js:attribute:: GateOne.Base

.. note:: Why is GateOne.Base before GateOne?  Two reasons:  1) Because that's how it is laid out in the code.  2) The module-loading functions are all inside GateOne.Base.

The Base module is mostly copied from `MochiKit <http://mochikit.com/>`_ and consists of the following:

    .. js:function:: GateOne.Base.module(parent, name, version, deps)

        Creates a new *name* module in a *parent* namespace. This function will create a new empty module object with *NAME*, *VERSION*, *toString* and *__repr__* properties. It will also verify that all the strings in deps are defined in parent, or an error will be thrown.

        :param object parent: The parent module or namespace (object).
        :param name: A string representing the new module name.
        :param version: The version string for this module (e.g. "1.0").
        :param deps: An array of module dependencies, as strings.

    The following example would create a new object named, "Net", attach it to the :js:data:`GateOne` object, at version "0.9", with :js:attr:`GateOne.Base` and :js:attr:`GateOne.Utils` as dependencies:

        .. code-block:: javascript

            > GateOne.Base.module(GateOne, 'Net', '1.0', ['Base', 'Utils']);
            > GateOne.Net.__repr__();
            "[GateOne.Net 1.0]"
            > GateOne.Net.NAME;
            "GateOne.Net"

    .. js:function:: GateOne.Base.update(self, obj[, obj2,...])

        Mutate self by replacing its key:value pairs with those from other object(s). Key:value pairs from later objects will overwrite those from earlier objects.

        If *self* is null, a new Object instance will be created and returned.

        .. warning:: This mutates *and* returns *self*.

        :param object self: The object you wish to mutate with *obj*.
        :param obj: Any given JavaScript object (e.g. {}).
        :returns: *self*

    The following example would mutate GateOne.Net with a new function, "someFunc()".

        .. code-block:: javascript

            > GateOne.Base.update(GateOne.Net, {someFunc: function(i) { return "someFunc() was just executed with " + i + "."; }});
            > GateOne.Net.someFunc('1234');
            "someFunc() was just executed with 1234."

    .. note:: In this example, if GateOne.Net.someFunc() already existed, it would be overridden.

    :js:func:`GateOne.Base.update` can be used to combine multiple sets of objects into one single object with latter objects taking precedence.  Essentially, it's a way to emulate Python-style class mixins with JavaScript objects.

GateOne
-------
.. js:data:: GateOne

GateOne is the base object for all of GateOne's client-side JavaScript.  Besides the aforementioned modules (:js:attr:`~GateOne.Utils`, :js:attr:`~GateOne.Net`, :js:attr:`~GateOne.Input`, :js:attr:`~GateOne.Visual`, :js:attr:`~GateOne.Terminal`, and :js:attr:`~GateOne.User`), it contains the following properties, objects, and methods:

.. _gateone-properties:

Properties
^^^^^^^^^^
.. container:: collapseindex

    .. hlist::

        * :js:attr:`GateOne.initialized`
        * :js:attr:`GateOne.prefs`
        * :js:attr:`GateOne.prefs.url`
        * :js:attr:`GateOne.prefs.fillContainer`
        * :js:attr:`GateOne.prefs.style`
        * :js:attr:`GateOne.prefs.goDiv`
        * :js:attr:`GateOne.prefs.scrollback`
        * :js:attr:`GateOne.prefs.rows`
        * :js:attr:`GateOne.prefs.cols`
        * :js:attr:`GateOne.prefs.prefix`
        * :js:attr:`GateOne.prefs.theme`
        * :js:attr:`GateOne.prefs.colors`
        * :js:attr:`GateOne.prefs.fontSize`
        * :js:attr:`GateOne.prefs.autoConnectURL`
        * :js:attr:`GateOne.prefs.embedded`
        * :js:attr:`GateOne.prefs.skipChecks`
        * :js:attr:`GateOne.prefs.showTitle`
        * :js:attr:`GateOne.prefs.showToolbar`
        * :js:attr:`GateOne.prefs.audibleBell`
        * :js:attr:`GateOne.prefs.bellSound`
        * :js:attr:`GateOne.prefs.bellSoundType`
        * :js:attr:`GateOne.prefs.disableTermTransitions`
        * :js:attr:`GateOne.prefs.colAdjust`
        * :js:attr:`GateOne.prefs.rowAdjust`
        * :js:attr:`GateOne.prefs.webWorker`
        * :js:attr:`GateOne.prefs.auth`
        * :js:attr:`GateOne.noSavePrefs`
        * :js:attr:`GateOne.savePrefsCallbacks`
        * :js:attr:`GateOne.terminals`
        * :js:attr:`GateOne.terminals[num].backspace`
        * :js:attr:`GateOne.terminals[num].columns`
        * :js:attr:`GateOne.terminals[num].created`
        * :js:attr:`GateOne.terminals[num].mode`
        * :js:attr:`GateOne.terminals[num].playbackFrames`
        * :js:attr:`GateOne.terminals[num].prevScreen`
        * :js:attr:`GateOne.terminals[num].rows`
        * :js:attr:`GateOne.terminals[num].screen`
        * :js:attr:`GateOne.terminals[num].scrollback`
        * :js:attr:`GateOne.terminals[num].scrollbackVisible`
        * :js:attr:`GateOne.terminals[num].sshConnectString`
        * :js:attr:`GateOne.terminals[num].title`
        * :js:attr:`GateOne.Icons`
        * :js:attr:`GateOne.loadedModules`
        * :js:attr:`GateOne.ws`

.. note:: These are ordered by importance/usefulness.

prefs
"""""

.. js:attribute:: GateOne.initialized

    :type: Boolean

    This gets set to ``true`` after :js:func:`GateOne.initialize` has completed all of its tasks.

.. js:attribute:: GateOne.prefs

    :type: Object

    This is where all of Gate One's client-side preferences are kept.  If the client changes them they will be saved in ``localStorage['prefs']``.  Also, these settings can be passed to :js:func:`GateOne.init` as an object in the first argument like so:

        .. code-block:: javascript

            GateOne.init({fillContainer: false, style: {'width': '50em', 'height': '32em'}, theme: 'white'});

    Each individual setting is outlined below:

    .. js:attribute:: GateOne.prefs.url

        :type: String

        .. code-block:: javascript

            GateOne.prefs.url = window.location.href;

        URL of the Gate One server.  Gate One will open a `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ to this URL, converting 'http://' and 'https://' to 'ws://' and 'wss://'.

    .. js:attribute:: GateOne.prefs.fillContainer

        :type: Boolean

        .. code-block:: javascript

            GateOne.prefs.fillContainer = true;

        If set to true, :js:attr:`GateOne.prefs.goDiv` (e.g. ``#gateone``) will fill itself out to the full size of its parent element.

    .. js:attribute:: GateOne.prefs.style

        :type: Object

        .. code-block:: javascript

            GateOne.prefs.style = {};

        An object that will be used to apply styles to :js:attr:`GateOne.prefs.goDiv` element (``#gateone`` by default).  Example:

        .. code-block:: javascript

            GateOne.prefs.style = {'padding': '1em', 'margin': '0.5em'};

        .. note:: ``width`` and ``height`` will be ignored if :js:attr:`GateOne.prefs.fillContainer` is true.

    .. js:attribute:: GateOne.prefs.goDiv

        :type: String

        .. code-block:: javascript

            GateOne.prefs.goDiv = '#gateone';

        The element to place Gate One inside of.  It can be any block element (or element set with ``display: block`` or ``display: inline-block``) on the page embedding Gate One.

        .. note:: To keep things simple it is recommended that a ``<div>`` be used (hence the name).

    .. js:attribute:: GateOne.prefs.scrollback

        :type: Integer

        .. code-block:: javascript

            GateOne.prefs.scrollback = 500;

        The default number of lines of scrollback that clients will be instructed to use.  The higher the number the longer it will take for the browser to re-enable the scrollback buffer after the 3.5-second screen update timeout is reached.  500 lines should only take a few milliseconds even on a slow computer (very high resolutions notwithstanding).

        .. note:: Clients will still be able to change this value in the preferences panel even if you pass it to :js:func:`GateOne.init`.

    .. js:attribute:: GateOne.prefs.rows

        :type: Integer

        .. code-block:: javascript

            GateOne.prefs.rows = null;

        This will force the number of rows in the terminal.  If null, Gate One will automatically figure out how many will fit within :js:attr:`GateOne.prefs.goDiv`.

    .. js:attribute:: GateOne.prefs.cols

        :type: Integer

        .. code-block:: javascript

            GateOne.prefs.cols = null;

        This will force the number of columns in the terminal.  If null, Gate One will automatically figure out how many will fit within :js:attr:`GateOne.prefs.goDiv`.

    .. js:attribute:: GateOne.prefs.prefix

        :type: String

        .. code-block:: javascript

            GateOne.prefs.prefix = 'go_';

        Instructs Gate One to prefix the 'id' of all elements it creates with this string (except :js:attr:`GateOne.prefs.goDiv` itself).  You usually won't want to change this unless you're embedding Gate One into a page where a name conflict exists (e.g. you already have an element named ``#go_notice``).  The Gate One server will be made aware of this setting when the client connects so it can apply it to all generated templates where necessary.

    .. js:attribute:: GateOne.prefs.theme

        :type: String

        .. code-block:: javascript

            GateOne.prefs.theme = 'black';

        This sets the default CSS theme.  Clients will still be able to change it in the preferences if they wish.

    .. js:attribute:: GateOne.prefs.colors

        :type: String

        .. code-block:: javascript

            GateOne.prefs.colors = 'default'; // 'gnome-terminal' is another text color scheme that comes with Gate One.

        This sets the CSS text color scheme.  These are the colors that text *renditions* will use (i.e. when the terminal text is bold, red, etc).

    .. js:attribute:: GateOne.prefs.fontSize

        :type: String

        .. code-block:: javascript

            GateOne.prefs.fontSize = '100%'; // Alternatives: '1em', '12pt', '15px', etc.

        This sets the base font size for everything in :js:attr:`GateOne.prefs.goDiv` (e.g. #gateone).

        .. tip:: If you're embedding Gate One into something else this can be really useful for matching up Gate One's font size with the rest of your app.

    .. js:attribute:: GateOne.prefs.autoConnectURL

        :type: String

        .. code-block:: javascript

            GateOne.prefs.autoConnectURL = null;

        If the SSH plugin is installed, this setting can be used to ensure that whenever a client connects it will automatically connect to the given SSH URL.  Here's an example where Gate One would auto-connect as a guest user to localhost (hypothetical terminal program demo):

        .. code-block:: javascript

            GateOne.prefs.autoConnectURL = 'ssh://guest:guest@localhost:22';

        .. warning:: If you provide a password in the ssh:// URL clients will be able to see it.

    .. _embedded-mode:

    .. js:attribute:: GateOne.prefs.embedded

        :type: Boolean

        .. code-block:: javascript

            GateOne.prefs.embedded = false;

        This option tells Gate One (at the client) to run in embedded mode.  In embedded mode there will be no toolbar, no side information panel, and new terminals will not be opened automatically.  In essence, it just connects to the Gate One server, downloads additional JavaScript/CSS (plugins/themes), and calls each plugin's init() and postInit() functions (which may also behave differently in embedded mode).  The point is to provide developers with the flexibility to control every aspect of Gate One's look and feel.

        In GateOne's 'tests' directory there is a walkthrough/tutorial of embedded mode called "hello_embedded".  To run it simply execute ./hello_embedded.py and connect to https://localhost/ in your browser.

        .. note:: Why is the hello_embedded tutorial separate from this documentation?  It needs to be run on a different address/port than the Gate One server itself in order to properly demonstrate how Gate One would be embedded "in the wild."  Also note that the documentation you're reading is meant to be viewable offline (e.g. file:///path/to/the/docs in your browser) but web browsers don't allow `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ connections from documents loaded via file:// URLs.

    .. js:attribute:: GateOne.prefs.skipChecks

        :type: Boolean

        .. code-block:: javascript

            GateOne.prefs.skipChecks = false;

        If this is set to ``true`` Gate One will skip performing browser capabilities checks/alerts when :js:func:`GateOne.init` is called.

    .. js:attribute:: GateOne.prefs.showTitle

        :type: Boolean

        .. code-block:: javascript

            GateOne.prefs.showTitle = true;

        If this is set to ``false`` Gate One will not show the terminal title in the sidebar.

    .. js:attribute:: GateOne.prefs.showToolbar

        :type: Boolean

        .. code-block:: javascript

            GateOne.prefs.showToolbar = true;

        If this is set to ``false`` Gate One will not show the toolbar (no icons on the right).

    .. js:attribute:: GateOne.prefs.audibleBell

        :type: Boolean

        .. code-block:: javascript

            GateOne.prefs.audibleBell = true;

        If this is set to ``false`` Gate One will not play a sound when a bell is encountered in any given terminal.

        .. note:: A visual bell indiciator will still be displayed even if this is set to ``false``.

    .. js:attribute:: GateOne.prefs.bellSound

        :type: String

        .. code-block:: javascript

            GateOne.prefs.bellSound = "data:audio/ogg;base64,T2dnUwACAAAAAAAAA...";

        Stores the user's chosen (or the default) bell sound as a data URI.

        .. note:: This is much more efficient than having to download this file from the server every time Gate One is loaded!

    .. js:attribute:: GateOne.prefs.bellSoundType

        :type: String

        .. code-block:: javascript

            GateOne.prefs.bellSound = "audio/ogg";

        Stores the mimetype associated with :js:attr:`GateOne.prefs.bellSound`.

    .. js:attribute:: GateOne.prefs.disableTermTransitions

        :type: Boolean

        .. code-block:: javascript

            GateOne.prefs.disableTermTransitions = false;

        With this enabled Gate One won't use fancy CSS3 transitions when switching between open terminals.  Such switching will be instantaneous (i.e. not smooth/pretty).

    .. js:attribute:: GateOne.prefs.colAdjust

        :type: Integer

        .. code-block:: javascript

            GateOne.prefs.colAdjust = 0;

        When the terminal size is calculated the number of columns will be decreased by this amount (e.g. to make room for an extra toolbar).

    .. js:attribute:: GateOne.prefs.rowAdjust

        :type: Integer

        .. code-block:: javascript

            GateOne.prefs.rowAdjust = 0;

        When the terminal size is calculated the number of rows will be decreased by this amount (e.g. to make room for the playback controls).

    .. js:attribute:: GateOne.prefs.webWorker

        :type: String

        .. code-block:: javascript

            GateOne.prefs.webWorker = "https://gateone.company.com/static/go_process.js";

        This is the fallback path to Gate One's `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_.  You should only ever have to change this when embedding Gate One into another application *and* your Gate One server is listening on a different port than your app's web server.  Otherwise Gate One will just use the `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ located at :js:attr:`GateOne.prefs.url`/static/go_process.js.

    .. js:attribute:: GateOne.prefs.auth

        :type: Object

        .. code-block:: javascript

            GateOne.prefs.auth = { // This is just an example--not a default
                'api_key': 'MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M',
                'upn': 'joe@company.com',
                'timestamp': 1323391717238,
                'signature': <encrypted gibberish>,
                'signature_method': 'HMAC-SHA1',
                'api_version': '1.0'
            };

        This is used to pre-authenticate users when Gate One is embedded into another application.  It works like this:  You enroll your app by creating an API key and secret via "./gateone.py --new_api_key".  Then you use those generated values to sign the combined values of *upn*, *timestamp*, and *api_key* via HMAC-SHA1 using the secret that was created when you generated your API key.  When Gate One sees these values it will verify them against the API keys/secrets it knows about and if everything lines up it will inherently trust the 'upn' (aka username) it has been given via this mechanism.

        This process allows parent applications (embedding Gate One) to authenticate a user just *once* instead of having users authenticate once for their own app and then once again for Gate One.

        .. note:: If your app doesn't authenticate users you can still embed Gate One using the default (anonymous) authentication method.  In these instances there's no need to pass an 'auth' parameter to :js:func:`GateOne.init`.

        More information about API-based authentication can be found in the "Embedding Gate One" documentation.

.. js:attribute:: GateOne.noSavePrefs

    :type: Object

    Properties in this object that match the names of objects in :js:attr:`GateOne.prefs` will get ignored when they are saved to localStorage.

    .. note:: **Plugin Authors:** If you want to have your own property in :js:attr:`GateOne.prefs` but it isn't a per-user setting, add your property here (e.g. ``GateOne.prefs['myPref'] = 'foo'; GateOne.noSavePrefs['myPref'] = null;``).

    Here's what this object contains by default:

    .. code-block:: javascript

        GateOne.noSavePrefs = {
            url: null, // These are all things that shouldn't be modified by the user.
            webWorker: null,
            fillContainer: null,
            style: null,
            goDiv: null,
            prefix: null,
            autoConnectURL: null,
            embedded: null,
            auth: null,
            showTitle: null,
            showToolbar: null,
            rowAdjust: null,
            colAdjust: null
        }

.. js:attribute:: GateOne.savePrefsCallbacks

    :type: Array

    Functions placed in this array will be called immediately after :js:func:`GateOne.Utils.savePrefs` is called.  This gives plugins the ability to save their own preferences (in their own way) when the user clicks the "Save" button in the preferences panel.

.. js:attribute:: GateOne.terminals

    :type: Object

    Terminal-specific settings and information are stored within this object like so:

        .. code-block:: javascript

            GateOne.terminals[1] = {
                X11Title = "Gate One",
                backspace: String.fromCharCode(127),
                columns: 165,
                created: Date(),
                mode: "default",
                node: <pre>,
                pasteNode: <textarea>,
                playbackFrames: Array(),
                prevScreen: Array(),
                rows: 45,
                screen: Array(),
                screenNode: <span>,
                scrollback: Array(),
                scrollbackNode: <span>,
                scrollbackTimer: 2311,
                scrollbackVisible: true,
                scrollbackWriteTimer: 2649
                sshConnectString: "user@localhost:22"
            };

    Each terminal in Gate One has its own object--referenced by terminal number--attached to :js:attr:`~GateOne.terminals` that gets created when a new terminal is opened (in :js:func:`GateOne.Terminal.newTerminal`).  Theses values and what they mean are outlined below:

    .. js:attribute:: GateOne.terminals[num].X11Title

        :type: String

        .. code-block:: javascript

            GateOne.terminals[num].X11Title = "New Terminal";

        When the server detects an X11 title escape sequence it sends it to the client and that value gets stored in this variable.  This is separated from the terminal node's ``title`` attribute so that the user can restore the X11 title after they have overridden it.

    .. js:attribute:: GateOne.terminals[num].backspace

        :type: String

        .. code-block:: javascript

            GateOne.terminals[num].backspace = String.fromCharCode(127);

        The backspace key used by this terminal.  One of ^? (String.fromCharCode(127)) or ^H (String.fromCharCode(8)).

        .. note:: Not configurable yet.  Should be soon.

    .. js:attribute:: GateOne.terminals[num].columns

        :type: Integer

        .. code-block:: javascript

            GateOne.terminals[num].columns = GateOne.prefs.cols;

        The number of columns this terminal is configured to use.  Unless the user changed it, it will match whatever is in :js:attr:`GateOne.prefs.cols`.

    .. js:attribute:: GateOne.terminals[num].created

        :type: Date()

        .. code-block:: javascript

            GateOne.terminals[num].created = new Date();

        The date and time a terminal was originally created.

    .. js:attribute:: GateOne.terminals[num].mode

        :type: String

        .. code-block:: javascript

            GateOne.terminals[num].mode = "default";

        The current keyboard input mode of the terminal.  One of "default" or "appmode" representing whether or not the terminal is in standard or "application cursor keys" mode (which changes what certain keystrokes send to the Gate One server).

    .. js:attribute:: GateOne.terminals[num].node

        :type: DOM Node

        .. code-block:: javascript

            GateOne.terminals[num].node = <pre node object>

        Used as a quick reference to the terminal's <pre> node so we don't have to call :js:func:`GateOne.Utils.getNode` every time we need it.

    .. js:attribute:: GateOne.terminals[num].pasteNode

        :type: DOM Node

        .. code-block:: javascript

            GateOne.terminals[num].node = <textarea node object>

        Used as a quick reference to the terminal's pastearea node (which hovers above all terminals so you can paste in a natural fashion).

    .. js:attribute:: GateOne.terminals[num].playbackFrames

        :type: Array

        .. code-block:: javascript

            GateOne.terminals[num].playbackFrames = Array();

        This is where Gate One stores the frames of your session so they can be played back on-the-fly.

        .. note:: playbackFrames only gets used if the playback plugin is available.

    .. js:attribute:: GateOne.terminals[num].prevScreen

        :type: Array

        .. code-block:: javascript

            GateOne.terminals[num].prevScreen = Array(); // Whatever was last in GateOne.terminals[num].screen

        This stores the previous screen array from the last time the terminal was updated.  Gate One's terminal update protocol only sends lines that changed since the last screen was sent.  This variable allows us to create an updated screen from just the line that changed.

    .. js:attribute:: GateOne.terminals[num].rows

        :type: Integer

        .. code-block:: javascript

            GateOne.terminals[num].rows = GateOne.prefs.rows;

        The number of rows this terminal is configured to use.  Unless the user changed it, it will match whatever is in :js:attr:`GateOne.prefs.rows`.

    .. js:attribute:: GateOne.terminals[num].screen

        :type: Array

        .. code-block:: javascript

            GateOne.terminals[num].screen = Array();

        This stores the current terminal's screen as an array of lines.

    .. js:attribute:: GateOne.terminals[num].screenNode

        :type: DOM Node

        .. code-block:: javascript

            GateOne.terminals[num].node = <span node object>

        Used as a quick reference to the terminal's screen node (which is a span).

    .. js:attribute:: GateOne.terminals[num].scrollback

        :type: Array

        .. code-block:: javascript

            GateOne.terminals[num].scrollback = Array();

        Stores the given terminal's scrollback buffer (so we can remove/replace it at-will).

    .. js:attribute:: GateOne.terminals[num].scrollbackNode

        :type: DOM Node

        .. code-block:: javascript

            GateOne.terminals[num].scrollbackNode = <span node object>

        Used as a quick reference to the terminal's scrollback node (which is a span).

    .. js:attribute:: GateOne.terminals[num].scrollbackVisible

        :type: Boolean

        .. code-block:: javascript

            GateOne.terminals[num].scrollbackVisible = true;

        Kept up to date on the current status of whether or not the scrollback buffer is visible in the terminal (so we don't end up replacing it or removing it when we don't have to).

    .. js:attribute:: GateOne.terminals[num].scrollbackWriteTimer

        :type: String

        .. code-block:: javascript

            GateOne.terminals[num].scrollbackWriteTimer = <timeout object>;

        Whenever the scrollback buffer is updated a timer is set to write that scrollback to localStorage.  If an update comes in before that timer finishes the existing timer will be cancelled and replaced.  The idea is to prevent queueing up timers for scrollback that will just end up getting overwritten.  The ``scrollbackWriteTimer`` attribute holds the reference to this timer.

    .. js:attribute:: GateOne.terminals[num].sshConnectString

        :type: String

        .. code-block:: javascript

            GateOne.terminals[num].sshConnectString = "ssh://user@somehost:22"; // Will actually be whatever the user connected to

        If the SSH plugin is enabled, this variable contains the connection string used by the SSH client to connect to the server.

        .. note:: This is a good example of a plugin using :js:attr:`GateOne.terminals` to great effect.

    .. js:attribute:: GateOne.terminals[num].title

        :type: String

        .. code-block:: javascript

            GateOne.terminals[num].title = "user@somehost:~";

        Stores the title of the terminal.  Unless the user has set it manually this will be the same value as :js:attr:`GateOne.terminals[num].X11Title`.

.. js:attribute:: GateOne.Icons

    :type: Array

    This is where Gate One stores all of its (inline) SVG icons.  If your plugin has its own icons they can be kept in here.  Here's a (severely shortened) example from the Bookmarks plugin:

    .. code-block:: javascript

        GateOne.Icons['bookmark'] = '<svg xmlns:rdf="blah blah">svg stuff here</svg>';

    For reference, using an existing icon is as easy as:

    .. code-block:: javascript

        someElement.appendChild(GateOne.Icons['close']);

    .. note:: All of Gate One's icons use a linearGradient that has stop points--stop1, stop2, stop3, and stop4--defined in CSS.  This allows the SVG icons to change color with the CSS theme.  If you're writing your own plugin with it's own icon(s) it would be best to use the same stop points.

.. js:attribute:: GateOne.loadedModules

    :type: Array

    All modules (aka plugins) loaded via :js:func:`GateOne.Base.module` are kept here as a quick reference.  For example:

    .. code-block:: javascript

        > GateOne.loadedModules;
        [
            "GateOne.Base",
            "GateOne.Utils",
            "GateOne.Net",
            "GateOne.Input",
            "GateOne.Visual",
            "GateOne.Terminal",
            "GateOne.User",
            "GateOne.Bookmarks",
            "GateOne.Help",
            "GateOne.Logging",
            "GateOne.Mobile",
            "GateOne.Playback",
            "GateOne.SSH"
        ]

.. js:attribute:: GateOne.ws

    :type: `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_

    Holds Gate One's open `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ object.  It can be used to send messages to `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ 'actions' (aka hooks) on the server like so:

    .. code-block:: javascript

        GateOne.ws.send(JSON.stringify({'my_plugin_function': {'someparam': true, 'whatever': [1,2,3]}}));

.. _gateone-functions:

Functions
^^^^^^^^^
.. container:: collapseindex

    * :js:func:`GateOne.init`
    * :js:func:`GateOne.initialize`

:js:data:`GateOne` contains two functions: :js:func:`~GateOne.init` and :js:func:`~GateOne.initialize`.  These functions are responsible for setting up Gate One's interface, authenticating the user (if necessary), connecting to the server, (re)loading user preferences, and calling the init() function of each module/plugin:

    .. js:function:: GateOne.init(prefs)

        Sets up preferences, loads the CSS theme/colors, loads JavaScript plugins, and calls :js:func:`GateOne.Net.connect` (which calls :js:func:`~GateOne.initialize` after the successfully connecting).  Additionally, it will check if the user is authenticated and will force a re-auth if the credentials stored in the encrypted cookie don't check out.

        :param object prefs: An object containing the settings that will be used by Gate One.  See :js:attr:`GateOne.prefs` under :ref:`gateone-properties` for details on what can be set.

        Example:

        .. code-block:: javascript

            GateOne.init({url: 'https://console12.serialconcentrators.mycompany.com/', theme: 'black'});

    .. js:function:: GateOne.initialize

        Sets up Gate One's graphical elements and starts Gate One capturing keyboard input.

.. _GateOne.Utils:

GateOne.Utils
-------------
.. js:attribute:: GateOne.Utils

This module consists of a collection of utility functions used throughout Gate One.  Think of it like a mini JavaScript library of useful tools.

Functions
^^^^^^^^^
.. container:: collapseindex

    .. hlist::

        * :js:attr:`GateOne.Utils.init`
        * :js:attr:`GateOne.Utils.createBlob`
        * :js:attr:`GateOne.Utils.createElement`
        * :js:attr:`GateOne.Utils.deleteCookie`
        * :js:attr:`GateOne.Utils.endsWith`
        * :js:attr:`GateOne.Utils.enumerateThemes` ###
        * :js:attr:`GateOne.Utils.getCookie`
        * :js:attr:`GateOne.Utils.getEmDimensions`
        * :js:attr:`GateOne.Utils.getNode`
        * :js:attr:`GateOne.Utils.getNodes`
        * :js:attr:`GateOne.Utils.getOffset`
        * :js:attr:`GateOne.Utils.getRowsAndColumns`
        * :js:attr:`GateOne.Utils.getSelText`
        * :js:attr:`GateOne.Utils.getToken`
        * :js:attr:`GateOne.Utils.hasElementClass`
        * :js:attr:`GateOne.Utils.hideElement`
        * :js:attr:`GateOne.Utils.hideElements` ###
        * :js:attr:`GateOne.Utils.init` ###
        * :js:attr:`GateOne.Utils.isArray`
        * :js:attr:`GateOne.Utils.isElement`
        * :js:attr:`GateOne.Utils.isEven`
        * :js:attr:`GateOne.Utils.isHTMLCollection`
        * :js:attr:`GateOne.Utils.isNodeList`
        * :js:attr:`GateOne.Utils.isPageHidden` ###
        * :js:attr:`GateOne.Utils.isPrime`
        * :js:attr:`GateOne.Utils.isVisible` ###
        * :js:attr:`GateOne.Utils.itemgetter`
        * :js:attr:`GateOne.Utils.items`
        * :js:attr:`GateOne.Utils.loadCSS`
        * :js:attr:`GateOne.Utils.loadPluginCSS`
        * :js:attr:`GateOne.Utils.loadPrefs`
        * :js:attr:`GateOne.Utils.loadScript`
        * :js:attr:`GateOne.Utils.loadStyleAction` ###
        * :js:attr:`GateOne.Utils.loadThemeCSS`
        * :js:attr:`GateOne.Utils.ltrim` ###
        * :js:attr:`GateOne.Utils.noop`
        * :js:attr:`GateOne.Utils.partial`
        * :js:attr:`GateOne.Utils.postInit` ###
        * :js:attr:`GateOne.Utils.randomPrime`
        * :js:attr:`GateOne.Utils.randomString`
        * :js:attr:`GateOne.Utils.removeElement`
        * :js:attr:`GateOne.Utils.replaceURLWithHTMLLinks`
        * :js:attr:`GateOne.Utils.rtrim` ###
        * :js:attr:`GateOne.Utils.runPostInit` ###
        * :js:attr:`GateOne.Utils.saveAs`
        * :js:attr:`GateOne.Utils.saveAsAction`
        * :js:attr:`GateOne.Utils.savePrefs`
        * :js:attr:`GateOne.Utils.scrollLines`
        * :js:attr:`GateOne.Utils.scrollToBottom`
        * :js:attr:`GateOne.Utils.setActiveStyleSheet`
        * :js:attr:`GateOne.Utils.showElement`
        * :js:attr:`GateOne.Utils.showElements` ###
        * :js:attr:`GateOne.Utils.startsWith`
        * :js:attr:`GateOne.Utils.stripHTML`
        * :js:attr:`GateOne.Utils.toArray`
        * :js:attr:`GateOne.Utils.xhrGet`

.. js:function:: GateOne.Utils.init

    Like all plugin init() functions this gets called from :js:func:`GateOne.Utils.runPostInit` which itself is called at the end of :js:func:`GateOne.initialize`.  It simply attaches a few actions like, 'save_file' to their respective functions in :js:attr:`GateOne.Net.actions`.  Literally:

    .. code-block:: javascript

        GateOne.Net.addAction('save_file', GateOne.Utils.saveAsAction);
        GateOne.Net.addAction('load_style', GateOne.Utils.loadStyleAction);
        GateOne.Net.addAction('themes_list', GateOne.Utils.enumerateThemes);


.. js:function:: GateOne.Utils.createBlob(array, mimetype)

    Returns a Blob() object using the given *array* and *mimetype*.  If *mimetype* is omitted it will default to 'text/plain'.  Optionally, *array* may be given as a string in which case it will be automatically wrapped in an array.

    :param array array: A string or array containing the data that the Blob will contain.
    :param string mimetype: A string representing the mimetype of the data (e.g. 'application/javascript').
    :returns: A Blob()

    Examples:

    .. code-block:: javascript

        blob = GateOne.Utils.createBlob('some data here', 'text/plain);

.. js:function:: GateOne.Utils.createElement(tagname, properties)

    A simplified version of MochiKit's `createDOM <http://mochi.github.com/mochikit/doc/html/MochiKit/DOM.html#fn-createdom>`_ function, it creates a *tagname* (e.g. "div") element using the given *properties*.

    :param string tagname: The type of element to create ("a", "table", "div", etc)
    :param object properties: An object containing the properties which will be pre-attached to the created element.
    :returns: A node suitable for adding to the DOM.

    Examples:

    .. code-block:: javascript

        myDiv = GateOne.Utils.createElement('div', {'id': 'foo', 'style': {'opacity': 0.5, 'color': 'black'}});
        myAnchor = GateOne.Utils.createElement('a', {'id': 'liftoff', 'href': 'http://liftoffsoftware.com/'});
        myParagraph = GateOne.Utils.createElement('p', {'id': 'some_paragraph'});

    .. note:: ``createElement`` will automatically apply :js:attr:`GateOne.prefs.prefix` to the 'id' of the created elements (if an 'id' was given).

.. js:function:: GateOne.Utils.deleteCookie(name, path, domain)

    Deletes the given cookie (*name*) from *path* for the given *domain*.

    :param string name: The name of the cookie to delete.
    :param string path: The path of the cookie to delete (typically '/' but could be '/some/path/on/the/webserver' =).
    :param string path: The domain where this cookie is from (an empty string means "the current domain in window.location.href").

    Examples:

    .. code-block:: javascript

        GateOne.Utils.deleteCookie('gateone_user', '/', ''); // Deletes the 'gateone_user' cookie

.. js:function:: GateOne.Utils.endsWith(substr, str)

    Returns true if *str* ends with *substr*.

    :param string substr: The string that you want to see if *str* ends with.
    :param string str: The string you're checking *substr* against.
    :returns: true/false

    Examples:

    .. code-block:: javascript

        > GateOne.Utils.endsWith('.txt', 'somefile.txt');
        true
        > GateOne.Utils.endsWith('.txt', 'somefile.svg');
        false

.. js:function:: GateOne.Utils.enumerateThemes(messageObj)

    Attached to the 'themes_list' action, updates the preferences panel with the list of themes stored on the server.

.. js:function:: GateOne.Utils.deleteCookie(name)

    Returns the given cookie (*name*).

    :param string name: The name of the cookie to retrieve.

    Examples:

    .. code-block:: javascript

        GateOne.Utils.getCookie(GateOne.prefs.prefix + 'gateone_user'); // Returns the 'gateone_user' cookie

.. js:function:: GateOne.Utils.getEmDimensions(elem)

    Returns the height and width of 1em inside the given elem (e.g. '#term1_pre').  The returned object will be in the form of:

    .. code-block:: javascript

        {'w': <width in px>, 'h': <height in px>}

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
    :returns: An object containing the width and height as obj.w and obj.h.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.getEmDimensions('#gateone');
        {'w': 8, 'h': 15}

.. js:function:: GateOne.Utils.getNode(nodeOrSelector)

    Returns a DOM node if given a `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_-style string or an existing DOM node (will return the node as-is).

    .. note:: The benefit of this over just ``document.querySelector()`` is that if it is given a node it will return the node as-is (so functions can accept both without having to worry about such things).  See :js:func:`~GateOne.Utils.removeElement` below for a good example.

    :param nodeOrSelector: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
    :returns: A DOM node or ``null`` if not found.

    Example:

    .. code-block:: javascript

        goDivNode = GateOne.Utils.getNode('#gateone');

        > GateOne.Utils.getEmDimensions('#gateone');
        {'w': 8, 'h': 15}

.. js:function:: GateOne.Utils.getNodes(nodeListOrSelector)

    Given a CSS `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string (e.g. '.some_class') or `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ (in case we're not sure), lookup the node using ``document.querySelectorAll()`` and return the result (which will be a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_).

    .. note:: The benefit of this over just ``document.querySelectorAll()`` is that if it is given a nodeList it will just return the nodeList as-is (so functions can accept both without having to worry about such things).

    :param nodeListOrSelector: A `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string like ``.some_class`` or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.
    :returns: A `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ or ``[]`` (an empty Array) if not found.

    Example:

    .. code-block:: javascript

        panels = GateOne.Utils.getNodes('#gateone .panel');

.. js:function:: GateOne.Utils.getRowsAndColumns(elem)

    Calculates and returns the number of text rows and colunmns that will fit in the given element (*elem*) as an object like so:

    .. code-block:: javascript

        {'cols': 165, 'rows': 45}

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
    :returns: An object with obj.cols and obj.rows representing the maximum number of columns and rows of text that will fit inside *elem*.

    .. warning:: *elem* must be a basic block element such as DIV, SPAN, P, PRE, etc.  Elements that require sub-elements such as TABLE (requires TRs and TDs) probably won't work.

    .. note::  This function only works properly with monospaced fonts but it does work with high-resolution displays (so users with properly-configured high-DPI displays will be happy =).  Other similar functions I've found on the web had hard-coded pixel widths for known fonts at certain point sizes.  These break on any display with a resolution higher than 96dpi.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.getRowsAndColumns('#gateone');
        {'cols': 165, 'rows': 45}

.. js:function:: GateOne.Utils.getOffset(elem)

    :returns: An object representing ``elem.offsetTop`` and ``elem.offsetLeft``.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.getOffset(someNode);
        {"top":130, "left":50}

.. js:function:: GateOne.Utils.getQueryVariable(variable)

    :returns: The value of the given query string *variable* from :js:attr:`window.location.href`.

    Example:

    .. code-block:: javascript

        > // Assume window.location.href = 'https://gateone/?foo=bar,bar,bar'
        > GateOne.Utils.getQueryVariable('foo');
        'bar,bar,bar'

.. js:function:: GateOne.Utils.getSelText()

    :returns: The text that is currently highlighted in the browser.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.getSelText();
        "localhost" // Assuming the user had highlighted the word, "localhost"

.. js:function:: GateOne.Utils.getToken()

    This function is a work in progress...  Doesn't do anything right now, but will (likely) eventually return time-based token (based on a random seed provided by the Gate One server) for use in an anti-session-hijacking mechanism.

.. js:function:: GateOne.Utils.hasElementClass(element, className)

    Almost a direct copy of `MochiKit.DOM.hasElementClass <http://mochi.github.com/mochikit/doc/html/MochiKit/DOM.html#fn-haselementclass>`_...  Returns true if *className* is found on *element*. *element* is looked up with :js:func:`~GateOne.Utils.getNode` so `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_-style identifiers or DOM nodes are acceptable.

    :param element: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
    :param className: The name of the class you're checking is applied to *element*.
    :returns: true/false

    Example:

    .. code-block:: javascript

        > GateOne.Utils.hasElementClass('#go_panel_info', 'panel');
        true
        > GateOne.Utils.hasElementClass('#go_panel_info', 'foo');
        false

.. js:function:: GateOne.Utils.hideElement(elem)

    Hides the given element by setting ``elem.style.display = 'none'``.

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.hideElement('#go_icon_newterm');

.. js:function:: GateOne.Utils.hideElements(elems)

    Hides the given elements by setting ``elem.style.display = 'none'`` on all of them.

    :param elems: A `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string like ``.some_element_class``, a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_, or an array.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.hideElements('.pastearea');

.. js:function:: GateOne.Utils.isArray(obj)

    Returns true if *obj* is an Array.

    :param object obj: A JavaScript object.
    :returns: true/false

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isArray(GateOne.terminals['1'].screen);
        true

.. js:function:: GateOne.Utils.isElement(obj)

    Returns true if *obj* is an `HTMLElement <https://developer.mozilla.org/en/Document_Object_Model_(DOM)/HTMLElement>`_.

    :param object obj: A JavaScript object.
    :returns: true/false

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isElement(GateOne.Utils.getNode('#gateone'));
        true

.. js:function:: GateOne.Utils.isEven(someNumber)

    Returns true if *someNumber* is even.

    :param number someNumber: A JavaScript object.
    :returns: true/false

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isEven(2);
        true
        > GateOne.Utils.isEven(3);
        false

.. js:function:: GateOne.Utils.isHTMLCollection(obj)

    Returns true if *obj* is an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_.  HTMLCollection objects come from DOM level 1 and are what is returned by some browsers when you execute functions like `document.getElementsByTagName <https://developer.mozilla.org/en/DOM/element.getElementsByTagName>`_.  This function lets us know if the Array-like object we've got is an actual HTMLCollection (as opposed to a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ or just an `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_).

    :param object obj: A JavaScript object.
    :returns: true/false

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isHTMLCollection(document.getElementsByTagName('pre'));
        true // Will vary from browser to browser.  Don't you just love JavaScript programming?  Sigh.

.. js:function:: GateOne.Utils.isNodeList(obj)

    Returns true if *obj* is a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.  NodeList objects come from DOM level 3 and are what is returned by some browsers when you execute functions like `document.getElementsByTagName <https://developer.mozilla.org/en/DOM/element.getElementsByTagName>`_.  This function lets us know if the Array-like object we've got is an actual `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ (as opposed to an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_ or just an `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_).

    :param object obj: A JavaScript object.
    :returns: true/false

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isHTMLCollection(document.getElementsByTagName('pre'));
        true // Just like isHTMLCollection this will vary

.. js:function:: GateOne.Utils.isPageHidden()

    Returns true if the page (browser tab) is hidden (e.g. inactive).  Returns false otherwise.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isPageHidden();
        false

.. js:function:: GateOne.Utils.isPrime(n)

    Returns true if *n* is a prime number.

    :param number n: The number we're checking to see if it is prime or not.
    :returns: true/false

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isPrime(13);
        true
        > GateOne.Utils.isPrime(14);
        false

.. js:function:: GateOne.Utils.isVisible(elem)

    Returns true if *node* is visible (checks parent nodes recursively too).  *node* may be a DOM node or a selector string.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.isVisible('#'+GateOne.prefs.prefix+'pastearea1');
        true

    .. note:: Relies on checking elem.style.opacity and elem.style.display.  Does *not* check transforms.

.. js:function:: GateOne.Utils.itemgetter(name)

    Copied from `MochiKit.Base.itemgetter <http://mochi.github.com/mochikit/doc/html/MochiKit/Base.html#fn-itemgetter>`_.  Returns a ``function(obj)`` that returns ``obj[name]``.

    :param value name: The value that will be used as the key when the returned function is called to retrieve an item.
    :returns: A function.

    To better understand what this function does it is probably best to simply provide the code:

    .. code-block:: javascript

        itemgetter: function (name) {
            return function (arg) {
                return arg[name];
            }
        }

    Here's an example of how to use it:

    .. code-block:: javascript

        > var object1 = {};
        > var object2 = {};
        > object1.someNumber = 12;
        > object2.someNumber = 37;
        > var numberGetter = GateOne.Utils.itemgetter("someNumber");
        > numberGetter(object1);
        12
        > numberGetter(object2);
        37

    .. note:: Yes, it can be confusing.  Especially when thinking up use cases but it actually is incredibly useful when the need arises!

.. js:function:: GateOne.Utils.items(obj)

    Copied from `MochiKit.Base.items <http://mochi.github.com/mochikit/doc/html/MochiKit/Base.html#fn-items>`_.  Returns an Array of [propertyName, propertyValue] pairs for the given *obj*.

    :param object obj: Any given JavaScript object.
    :returns: Array

    Example:

    .. code-block:: javascript

        > GateOne.Utils.items(GateOne.terminals).forEach(function(item) { console.log(item) });
        ["1", Object]
        ["2", Object]

    .. note:: Can be very useful for debugging.

.. js:function:: GateOne.Utils.loadCSS(url, id)

    Loads and applies the CSS at *url*.  When the ``<link>`` element is created it will use *id* like so:

    .. code-block:: javascript

        {'id': GateOne.prefs.prefix + id}

    :param string url: The URL path to the style sheet.
    :param string id: The 'id' that will be applied to the ``<link>`` element when it is created.

    .. note:: If an existing ``<link>`` element already exists with the same *id* it will be overridden.

    Example:

    .. code-block:: javascript

        GateOne.Utils.loadCSS("static/themes/black.css", "black_theme");

.. js:function:: GateOne.Utils.loadPrefs

    Populates :js:attr:`GateOne.prefs` with values from ``localStorage[GateOne.prefs.prefix+'prefs']``.

.. js:function:: GateOne.Utils.loadScript(URL, callback)

    Loads the JavaScript (.js) file at *URL* and appends it to `document.body <https://developer.mozilla.org/en/DOM/document.body>`_.  If *callback* is given, it will be called after the script has been loaded.

    :param string URL: The URL of a JavaScript file.
    :param function callback:  A function to call after the script has been loaded.

    Example:

    .. code-block:: javascript

        var myfunc = function() { console.log("finished loading whatever.js"); };
        GateOne.Utils.loadScript("/static/someplugin/whatever.js", myfunc);

.. js:function:: GateOne.Utils.loadStyleAction(message)

    Loads the stylesheet sent by the server via the 'load_style' `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ action.

.. js:function:: GateOne.Utils.loadThemeCSS(themeObj)

    Loads the GateOne CSS theme(s) for the given *themeObj* which should be in the form of:

    .. code-block:: javascript

        {'theme': 'black'}
        // or:
        {'colors': 'gnome-terminal'}
        // ...or an object containing both:
        {'theme': 'black', 'colors': 'gnome-terminal'}

    If *themeObj* is not provided, will load the defaults.

.. js:function:: GateOne.Utils.ltrim(string)

    Returns *string* minus left-hand whitespace

.. js:function:: GateOne.Utils.noop(a)

    AKA "No Operation".  Returns whatever is given to it (if anything at all).  In other words, this function doesn't do anything and that's exactly what it is supposed to do!

    :param a: Anything you want.
    :returns: a

    Example:

    .. code-block:: javascript

        var functionList = {'1': GateOne.Utils.noop, '2': GateOne.Utils.noop};

    .. note:: This function is most useful as a placeholder for when you plan to update *something* in-place later.  In the event that *something* never gets replaced, you can be assured that nothing bad will happen if it gets called (no exceptions).

.. js:function:: GateOne.Utils.partial(fn, arguments)

    :returns: A partially-applied function.

    Similar to `MochiKit.Base.partial <http://mochi.github.com/mochikit/doc/html/MochiKit/Base.html#fn-partial>`_.  Returns partially applied function.

    :param function fn: The function to ultimately be executed.
    :param arguments arguments: Whatever arguments you want to be pre-applied to *fn*.

    Example:

    .. code-block:: javascript

        > addNumbers = function (a, b) {
            return a + b;
        }
        > addOne = GateOne.Utils.partial(addNumbers, 1);
        > addOne(3);
        4

    .. note:: This function can also be useful to simply save yourself a lot of typing.  If you're planning on calling a function with the same parameters a number of times it is a good idea to use partial() to create a new function with all the parameters pre-applied.  Can make code easier to read too.

.. js:function:: GateOne.Utils.postInit

    Called by :js:func:`GateOne.runPostInit()`, iterates over the list of plugins in :js:attr:`GateOne.loadedModules` calling the ``init()`` function of each (if present).  When that's done it does the same thing with each respective plugin's ``postInit()`` function.

.. js:function:: GateOne.Utils.randomPrime()

    :returns: A random prime number <= 9 digits.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.randomPrime();
        618690239

.. js:function:: GateOne.Utils.randomString(length, chars)

    :returns: A random string of the given *length* using the given *chars*.

    If *chars* is omitted the returned string will consist of lower-case ASCII alphanumerics.

    :param int length: The length of the random string to be returned.
    :param string chars: Optional; a string containing the characters to use when generating the random string.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.randomString(8);
        "oa2f9txf"
        > GateOne.Utils.randomString(8, '123abc');
        "1b3ac12b"

.. js:function:: GateOne.Utils.removeElement(elem)

    Removes the given *elem* from the DOM.

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

    Example:

    .. code-block:: javascript

        GateOne.Utils.removeElement('#go_infocontainer');

.. js:function:: GateOne.Utils.removeQueryVariable(variable)

    Removes the given query string *variable* from window.location.href using window.history.replaceState().  Leaving all other query string variables alone.

    :returns: The current query string (after being modified) from :js:attr:`window.location.href`.

    Example:

    .. code-block:: javascript

        > // Assume window.location.href = 'https://gateone/?location=window2&foo=bar,bar,bar'
        > GateOne.Utils.removeQueryVariable('foo');
        '?location=window2'
        > // ...and the URL in the addres bar would become 'https://gateone/?location=window2'

.. js:function:: GateOne.Utils.replaceURLWithHTMLLinks(text)

    :returns: *text* with URLs transformed into links.

    Turns textual URLs like 'http://whatever.com/' into links.

    :param string text: Any text with or without links in it (no URLs == no changes)

    Example:

    .. code-block:: javascript

        > GateOne.Utils.replaceURLWithHTMLLinks('Downloading http://foo.bar.com/some/file.zip');
        "Downloading <a href='http://foo.bar.com/some/file.zip'>http://foo.bar.com/some/file.zip</a>"

.. js:function:: GateOne.Utils.rtrim(string)

    Returns *string* minus right-hand whitespace

.. js:function:: GateOne.Utils.runPostInit()

    Calls all module/plugin ``init()`` functions followed by all ``postInit()`` functions after the page is loaded and the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ has been connected.  Specifically it is called right near the end of :js:func:`GateOne.initialize` just before keyboard input is enabled.

.. js:function:: GateOne.Utils.saveAs(blob, filename)

    Saves the given *blob* (which must be a proper `Blob <https://developer.mozilla.org/en/DOM/Blob>`_ object with data inside of it) as *filename* (as a file) in the browser.  Just as if you clicked on a link to download it.

    .. note:: This is amazingly handy for downloading files over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_.

.. js:function:: GateOne.Utils.saveAsAction(message)

    .. note:: This function is attached to the 'save_file' `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ action (in :js:attr:`GateOne.Net.actions`) via :js:func:`GateOne.Utils.init`.

    Saves to disk the file contained in *message*.  *message* should contain the following:

        * *message['result']* - Either 'Success' or a descriptive error message.
        * *message['filename']* - The name we'll give to the file when we save it.
        * *message['data']* - The content of the file we're saving.
        * *message['mimetype']* - Optional:  The mimetype we'll be instructing the browser to associate with the file (so it will handle it appropriately).  Will default to 'text/plain' if not given.

.. js:function:: GateOne.Utils.savePrefs

    Saves what's set in :js:attr:`GateOne.prefs` to ``localStorage['GateOne.prefs.prefix+prefs']`` as JSON; skipping anything that's set in :js:attr:`GateOne.noSavePrefs`.

.. js:function:: GateOne.Utils.scrollLines(elem, lines)

    Scrolls the given element (*elem*) by the number given in *lines*.  It will automatically determine the line height using :js:func:`~GateOne.Utils.getEmDimensions`.  *lines* can be a positive or negative integer (to scroll down or up, respectively).

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
    :param number lines: The number of lines to scroll *elem* by.  Can be positive or negative.

    Example:

    .. code-block:: javascript

        GateOne.Utils.scrollLines('#go_term1_pre', -3);

    .. note:: There must be a scrollbar visible (and ``overflow-y = "auto"`` or equivalent) for this to work.

.. js:function:: GateOne.Utils.scrollToBottom(elem)

    Scrolls the given element (*elem*) to the very bottom (all the way down).

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

    Example:

    .. code-block:: javascript

        GateOne.Utils.scrollLines('#term1_pre');

.. js:function:: GateOne.Utils.setActiveStyleSheet(title)

    Sets the stylesheet matching *title* to be active.

    Thanks to `Paul Sowden <http://www.alistapart.com/authors/s/paulsowden>`_ at `A List Apart <http://www.alistapart.com/>`_ for this function.
    See: http://www.alistapart.com/articles/alternate/ for a great article on how to control active/alternate stylesheets in JavaScript.

    :param string title: The title of the stylesheet to set active.

    Example:

    .. code-block:: javascript

        GateOne.Utils.setActiveStyleSheet("myplugin_stylesheet");

.. js:function:: GateOne.Utils.setCookie(name, value, days)

    Sets the cookie of the given *name* to the given *value* with the given number of expiration *days*.

    :param string name: The name of the cookie to retrieve.
    :param string value: The value to set.
    :param number days: The number of days the cookie will be allowed to last before expiring.

    Examples:

    .. code-block:: javascript

        GateOne.Utils.setCookie('test', 'some value', 30); // Sets the 'test' cookie to 'some value' with an expiration of 30 days

.. js:function:: GateOne.Utils.showElement(elem)

    Shows the given element (if previously hidden via :js:func:`~GateOne.Utils.hideElement`) by setting ``elem.style.display = 'block'``.

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.showElement('#go_icon_newterm');

.. js:function:: GateOne.Utils.showElements(elems)

    Shows the given elements (if previously hidden via :js:func:`~GateOne.Utils.hideElement` or :js:func:`~GateOne.Utils.hideElements`) by setting ``elem.style.display = 'block'``.

    :param elems: A `querySelectorAll <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelectorAll>`_ string like ``.some_element_class``, a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_, or an array.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.showElements('.pastearea');

.. js:function:: GateOne.Utils.startsWith(substr, str)

    Returns true if *str* starts with *substr*.

    :param string substr: The string that you want to see if *str* starts with.
    :param string str: The string you're checking *substr* against.
    :returns: true/false

    Examples:

    .. code-block:: javascript

        > GateOne.Utils.startsWith('some', 'somefile.txt');
        true
        > GateOne.Utils.startsWith('foo', 'somefile.txt');
        false

.. js:function:: GateOne.Utils.stripHTML(html)

    Returns the contents of *html* minus the HTML.

    :param string html: The string that you wish to strip HTML from.
    :returns: The string with all HTML formatting removed.

    Examples:

    .. code-block:: javascript

        > GateOne.Utils.stripHTML('<span>This <b>is</b> a test</span>');
        "This is a test"

.. js:function:: GateOne.Utils.toArray(obj)

    Returns an actual Array() given an Array-like *obj* such as an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_ or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.

    :param object obj: An Array-like object.
    :returns: Array

    Example:

    .. code-block:: javascript

        > var terms = document.getElementsByClassName(GateOne.prefs.prefix+'terminal');
        > GateOne.Utils.toArray(terms).forEach(function(termObj) {
            GateOne.Terminal.closeTerminal(termObj.id.split('term')[1]);
        });

.. js:function:: GateOne.Utils.xhrGet(url[, callback])

    Performs a GET on the given *url* and if given, calls *callback* with the responseText as the only argument.

    :param string url: The URL to GET.
    :param function callback: A function to call like so: ``callback(responseText)``

    Example:

    .. code-block:: javascript

        > var mycallback = function(responseText) { console.log("It worked: " + responseText) };
        > GateOne.Utils.xhrGet('https://demo.example.com/static/about.html', mycallback);
        It worked: <!DOCTYPE html>
        <html>
        <head>
        ...

GateOne.Net
-----------
.. js:attribute:: GateOne.Net

Just about all of Gate One's communications with the server are handled inside this module.  It contains all the functions and properties to deal with setting up the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ and issuing/receiving commands over it.  The most important facet of :js:attr:`GateOne.Net` is :js:attr:`GateOne.Net.actions` which holds the mapping of what function maps to which command.  More info on :js:attr:`GateOne.Net.actions` is below.

Properties
^^^^^^^^^^
.. js:attribute:: GateOne.Net.actions

    :type: Object

This is where all of Gate One's `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ protocol actions are assigned to functions.  Here's how they are defined by default:

    ================  ====================================================
    Action            Function
    ================  ====================================================
    bell              :js:func:`GateOne.Visual.bellAction`
    gateone_user      :js:func:`GateOne.User.storeSession`
    load_bell         :js:func:`GateOne.User.loadBell`
    load_css          :js:func:`GateOne.Visual.CSSPluginAction`
    load_style        :js:func:`GateOne.Utils.loadStyleAction`
    load_webworker    :js:func:`GateOne.Terminal.loadWebWorkerAction`
    log               :js:func:`GateOne.Net.log`
    notice            :js:func:`GateOne.Visual.serverMessageAction`
    ping              :js:func:`GateOne.Net.ping`
    pong              :js:func:`GateOne.Net.pong`
    reauthenticate    :js:func:`GateOne.Net.reauthenticate`
    save_file         :js:func:`GateOne.Utils.saveAsAction`
    set_mode          :js:func:`GateOne.Terminal.setModeAction`
    set_title         :js:func:`GateOne.Visual.setTitleAction`
    set_username      :js:func:`GateOne.User.setUsername`
    term_ended        :js:func:`GateOne.Terminal.closeTerminal`
    term_exists       :js:func:`GateOne.Terminal.reconnectTerminalAction`
    terminals         :js:func:`GateOne.Terminal.reattachTerminalsAction`
    termupdate        :js:func:`GateOne.Terminal.updateTerminalAction`
    timeout           :js:func:`GateOne.Terminal.timeoutAction`
    ================  ====================================================


.. note:: Most of the above is added via :js:func:`~GateOne.Net.addAction` inside of each respective module's ``init()`` function.

For example, if we execute :js:func:`GateOne.Net.ping`, this will send a message over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ like so:

.. code-block:: javascript

    GateOne.ws.send(JSON.stringify({'ping': timestamp}));

The GateOne server will receive this message and respond with a ``pong`` message that looks like this (Note: Python code below):

.. code-block:: python

    message = {'pong': timestamp} # The very same timestamp we just sent via GateOne.Net.ping()
    self.write_message(json_encode(message))

When GateOne.Net receives a message from the server over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ it will evaluate the object it receives as ``{action: message}`` and call the matching action in :js:attr:`GateOne.Net.actions`.  In this case, our action "pong" matches  :js:attr:`GateOne.Net.actions['pong']` so it will be called like so:

.. code-block:: javascript

    GateOne.Net.actions['pong'](message);

Plugin authors can add their own arbitrary actions using :js:func:`GateOne.Net.addAction`.  Here's an example taken from the SSH plugin:

.. code-block:: javascript

    GateOne.Net.addAction('sshjs_connect', GateOne.SSH.handleConnect);
    GateOne.Net.addAction('sshjs_reconnect', GateOne.SSH.handleReconnect);

If no action can be found for a message it will be passed to :js:func:`GateOne.Visual.displayMessage` and displayed to the user like so:

.. code-block:: javascript

    GateOne.Visual.displayMessage('Message From Server: ' + <message>);

Functions
^^^^^^^^^
.. container:: collapseindex

    .. hlist::

        * :js:attr:`GateOne.Net.addAction`
        * :js:attr:`GateOne.Net.connect`
        * :js:attr:`GateOne.Net.connectionError`
        * :js:attr:`GateOne.Net.fullRefresh`
        * :js:attr:`GateOne.Net.killTerminal`
        * :js:attr:`GateOne.Net.log`
        * :js:attr:`GateOne.Net.onMessage`
        * :js:attr:`GateOne.Net.onOpen`
        * :js:attr:`GateOne.Net.ping`
        * :js:attr:`GateOne.Net.pong`
        * :js:attr:`GateOne.Net.reauthenticate`
        * :js:attr:`GateOne.Net.refresh`
        * :js:attr:`GateOne.Net.sendChars`
        * :js:attr:`GateOne.Net.sendDimensions`
        * :js:attr:`GateOne.Net.sendString`
        * :js:attr:`GateOne.Net.setTerminal`
        * :js:attr:`GateOne.Net.sslError`

.. js:function:: GateOne.Net.addAction(name, func)

    :param string name: The name of the action we're going to attach *func* to.
    :param function func: The function to be called when an action arrives over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ matching *name*.

    Adds an action to the :js:attr:`GateOne.Net.actions` object.

    Example:

    .. code-block:: javascript

        GateOne.Net.addAction('sshjs_connect', GateOne.SSH.handleConnect);

.. js:function:: GateOne.Net.connect()

    Opens a connection to the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ defined in ``GateOne.prefs.url`` and stores it as :js:attr:`GateOne.ws`.  Once connected :js:func:`GateOne.initialize` will be called.

    If an error is encountered while trying to connect to the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_, :js:func:`~GateOne.Net.connectionError` will be called to notify the user as such.  After five seconds, if a connection has yet to be connected successfully it will be assumed that the user needs to accept the Gate One server's SSL certificate.  This will invoke call to :js:func:`~GateOne.Net.sslError` which will redirect the user to the ``accept_certificate.html`` page on the Gate One server.  Once that page has loaded successfully (after the user has clicked through the interstitial page) the user will be redirected back to the page they were viewing that contained Gate One.

    .. note:: This function gets called by :js:func:`GateOne.init` and there's really no reason why it should be called directly by anything else.

.. js:function:: GateOne.Net.connectionError()

    Called when there's an error communicating over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_...  Displays a message to the user indicating there's a problem, logs the error (using ``logError()``), and sets a five-second timeout to attempt reconnecting.

    This function is attached to the WebSocket's ``onclose`` event and shouldn't be called directly.

.. js:function:: GateOne.Net.fullRefresh()

    Sends a message to the Gate One server asking it to send a full screen refresh (i.e. send us the whole thing as opposed to just the difference from the last screen).

.. js:function:: GateOne.Net.killTerminal(term)

    :param number term: The termimal number that should be killed on the server side of things.

    Normally called when the user closes a terminal, it sends a message to the server telling it to end the process associated with *term*.  Normally this function would not be called directly.  To close a terminal cleanly, plugins should use ``GateOne.Terminal.closeTerminal(term)`` (which calls this function).

.. js:function:: GateOne.Net.log(msg)

    :param string msg: The message received from the Gate One server.

    This function can be used in debugging :js:attr:`~GateOne.Net.actions`; it logs whatever message is received from the Gate One server: ``GateOne.Logging.logInfo(msg)`` (which would equate to console.log under most circumstances).

    When developing a new action, you can test out or debug your server-side messages by attaching the respective action to :js:func:`GateOne.Net.log` like so:

    .. code-block:: javascript

        GateOne.Net.addAction('my_action', GateOne.Net.log);

    Then you can view the exact messages received by the client in the JavaScript console in your browser.

    .. tip:: Setting ``GateOne.Logging.level = 'DEBUG'`` in your JS console will also log all incoming messages from the server (though it can be a bit noisy).

.. js:function:: GateOne.Net.onMessage(event)

    :param event event: A `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ event object as passed by the 'message' event.

    This gets attached to :js:attr:`GateOne.ws.onmessage` inside of :js:func:`~GateOne.Net.connect`.  It takes care of decoding (`JSON <https://developer.mozilla.org/en/JSON>`_) messages sent from the server and calling any matching :js:attr:`~GateOne.Net.actions`.  If no matching action can be found inside ``event.data`` it will fall back to passing the message directly to :js:func:`GateOne.Visual.displayMessage`.

.. js:function:: GateOne.Net.onOpen

    This gets attached to :js:attr:`GateOne.ws.onopen` inside of :js:func:`~GateOne.Net.connect`.  It clears any error message that might be displayed to the user and asks the server to send us the (currently-selected) theme CSS, all plugin CSS, the bell sound (if not already stored in :js:attr:`GateOne.prefs.bellSound`), and the go_process.js `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ (``go.ws.send(JSON.stringify({'get_webworker': null}));``).  Lastly, it sends an authentication message and calls :js:func:`~GateOne.Net.ping` after a short timeout (to let things settle down lest they interfere with the ping time calculation).

.. js:function:: GateOne.Net.ping

    Sends a ping to the server with a client-generated timestamp attached. The expectation is that the server will return a 'pong' respose with the timestamp as-is so we can measure the round-trip time.

    .. code-block:: javascript

        > GateOne.Net.ping();
        2011-10-09 21:13:08 INFO PONG: Gate One server round-trip latency: 2ms

    .. note:: That response was actually logged by :js:func:`~GateOne.Net.pong` below.

.. js:function:: GateOne.Net.pong(timestamp)

    :param string timestamp: Expected to be the output of ``new Date().toISOString()`` (as generated by :js:func:`~GateOne.Net.ping`).

    Simply logs *timestamp* using :js:func:`GateOne.Logging.logInfo` and includes a measurement of the round-trip time in milliseconds.

.. js:function:: GateOne.Net.reauthenticate()

    Called when the Gate One server wants us to re-authenticate our session (e.g. our cookie expired).  Deletes the 'gateone_user' cookie and reloads the current page with the following code:

    .. code-block:: javascript

        GateOne.Utils.deleteCookie('gateone_user', '/', '');
        window.location.reload();

    This will force the client to re-authenticate with the Gate One server.

    .. note:: This function will likely change in the future as a reload shoud not be necessary to force a re-auth.

.. js:function:: GateOne.Net.refresh

    Sends a message to the Gate One server telling it to perform a screen refresh with just the difference from the last refresh.

.. js:function:: GateOne.Net.sendChars

    Sends the current character queue to the Gate One server and empties it out.  Typically it would be used like this:

    .. code-block:: javascript

        GateOne.Input.queue("echo 'This text will be sent to the server'\n");
        GateOne.Net.sendChars(); // Send it off and empty the queue

.. js:function:: GateOne.Net.sendDimensions([term])

    :param number term: Not currently used but in the future this will allow setting the dimensions of individual terminals.

    Sends the current dimensions of *term* to the Gate One server.  Typically used when the user resizes their browser window.

    .. code-block:: javascript

        GateOne.Net.sendDimensions();


.. js:function:: GateOne.Net.sendString(chars, [term])

    :param string chars: The characters to be sent to the terminal.
    :param number term: *Optional* - The terminal to send the characters to.

    Sends *chars* to *term*.  If *term* is omitted the currently-selected terminal will be used.

    .. code-block:: javascript

        GateOne.Input.sendString("echo 'This text will be sent to terminal 1'\n", 1);

.. _GateOne.Net.setTerminal:
.. js:function:: GateOne.Net.setTerminal(term)

    :param number term: The terminal we wish to become active.

    Tells the Gate One server which is our active terminal and sets ``localStorage['selectedTerminal'] = *term*``.

    .. code-block:: javascript

        GateOne.Net.setTerminal(1);

.. js:function:: GateOne.Net.sslError(callback)

    Called when we fail to connect due to an SSL error (user must accept the SSL certificate).  It opens a dialog where the user can accept the Gate One server's SSL certificate (via an iframe).

    :param function callback: Will be called after the user clicks "OK" to the dialog.

GateOne.Input
-------------
.. js:attribute:: GateOne.Input

This module handles mouse and keyboard input for Gate One.  It consists of a few tables of information that tell Gate One how to act upon a given keystroke as well as functions that make working with keyboard and mouse events a bit easier.

Properties
^^^^^^^^^^
.. note:: Properties that have to do with temporary, internal states (e.g. :js:attr:`GateOne.Input.metaHeld`) were purposefully left out of this documentation since there's really no reason to ever reference them.

.. js:attribute:: GateOne.Input.charBuffer

    This is an Array that temporarily stores characters before sending them to the Gate One server.  The :js:attr:`~GateOne.Net.charBuffer` gets sent to the server and emptied when ``GateOne.Net.sendChars()`` is called.

    Typically, characters wind up in the buffer by way of :js:func:`GateOne.Input.queue()`.

.. js:attribute:: GateOne.Input.keyTable

    This is an object that houses all of Gate One's special key mappings.  Here's an example from the default keyTable:

    .. code-block:: javascript

        'KEY_2': {'default': "2", 'shift': "@", 'ctrl': String.fromCharCode(0)}

    This entry tells Gate One how to respond when the '2' key is pressed; by default, when the shift key is held, or when the Ctrl key is held.  If no entry existed for the '2' key, Gate One would simply use the standard keyboard defaults (for the key itself and when shift is held).

    .. note:: This property is used by both :js:func:`GateOne.Input.emulateKey` and :js:func:`GateOne.Input.emulateKeyCombo`.

    .. warning:: Entries in :js:attr:`GateOne.Input.shortcuts` will supersede anything in :js:attr:`GateOne.Input.keyTable`.  So if you use :js:func:`GateOne.Input.registerShortcut()` to bind the '2' key to some JavaScript action, that action will need to ALSO send the proper character or the user will wind up dazed and confused as to why their '2' key doesn't work.

.. js:attribute:: GateOne.Input.shortcuts

    Keyboard shortcuts that get added using :js:func:`GateOne.Input.registerShortcut()` are stored here like so:

    .. code-block:: javascript

        > GateOne.Input.shortcuts;
        {'KEY_N': [
            {
                'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false},
                'action': 'GateOne.Terminal.newTerminal()'
            }
        ]}

    .. note:: A single key can have multiple entries depending on which modifier is held.

Functions
^^^^^^^^^
.. container:: collapseindex

    .. hlist::

        * :js:attr:`GateOne.Input.bufferEscSeq`
        * :js:attr:`GateOne.Input.capture`
        * :js:attr:`GateOne.Input.disableCapture`
        * :js:attr:`GateOne.Input.emulateKey`
        * :js:attr:`GateOne.Input.emulateKeyCombo`
        * :js:attr:`GateOne.Input.emulateKeyFallback`
        * :js:attr:`GateOne.Input.key`
        * :js:attr:`GateOne.Input.modifiers`
        * :js:attr:`GateOne.Input.mouse`
        * :js:attr:`GateOne.Input.onKeyDown`
        * :js:attr:`GateOne.Input.onKeyUp`
        * :js:attr:`GateOne.Input.queue`
        * :js:attr:`GateOne.Input.registerShortcut`

.. js:function:: GateOne.Input.bufferEscSeq(chars)

    :param string chars: A string that will have the ESC character prepended to it.

    Prepends an ESC character to *chars* and adds it to the :js:attr:`~GateOne.Input.charBuffer`

    .. code-block:: javascript

        // This would send the same as the up arrow key:
        GateOne.Input.bufferEscSeq("[A") // Would end up as ^[[A

.. js:function:: GateOne.Input.capture()

    Sets the browser's focus to :js:attr:`GateOne.prefs.goDiv` and enables the capture of keyboard and mouse events.  It also a very important part of Gate One's ability to support copy & paste without requiring the use of browser plugins.

.. js:function:: GateOne.Input.disableCapture

    Disables the capture of keyboard and mouse events by setting all of the relevant events tied to :js:attr:`GateOne.prefs.goDiv` to null like so:

    .. code-block:: javascript

        GateOne.prefs.goDiv.onpaste = null;
        GateOne.prefs.goDiv.tabIndex = null;
        GateOne.prefs.goDiv.onkeydown = null;
        GateOne.prefs.goDiv.onkeyup = null;
        GateOne.prefs.goDiv.onmousedown = null;
        GateOne.prefs.goDiv.onmouseup = null;

    Typically you would call this function if a user needed to fill out a form or use a non-terminal portion of the web page.  :js:func:`GateOne.prefs.capture()` can be called to turn it all back on.

.. js:function:: GateOne.Input.emulateKey(e, skipF11check)

    Typically called by :js:func:`GateOne.Input.onKeyDown`, converts a keyboard event (*e*) into a string (using :js:attr:`GateOne.Input.keyTable`) and appends it to the :js:attr:`~GateOne.Net.charBuffer` using :js:func:`GateOne.Input.queue`.  This function also has logic that allows the user to double-tap the F11 key to send the browser's native keystroke (enable/disable fullscreen).  This is to prevent the user from getting stuck in fullscreen mode (since we call ``e.preventDefault()`` for nearly all events).

    :param event e: The JavaScript event that the function is handling (coming from :js:attr:`GateOne.prefs.goDiv.onkeydown`).
    :param boolean skipF11check: Used internally by the function as part of the logic surrounding the F11 (fullscreen) key.

.. js:function:: GateOne.Input.emulateKeyCombo(e)

    :param event e: The JavaScript event that the function is handling (coming from :js:attr:`GateOne.prefs.goDiv.onkeydown`).

    Typically called by :js:func:`GateOne.prefs.onKeyDown`, converts a keyboard event (*e*) into a string.  The difference between this function and :js:func:`emulateKey` is that this funcion handles key combinations that include non-shift modifiers (Ctrl, Alt, and Meta).

.. js:function:: GateOne.Input.emulateKeyFallback(e)

    :param event e: The JavaScript event that the function is handling (coming from :js:attr:`GateOne.prefs.goDiv.onkeypress`).

    This gets attached to the goDiv.onkeypress event...  It Queues the (character) result of a keypress event if an unknown modifier key is held.  Without this, 3rd and 5th level keystroke events (i.e. the stuff you get when you hold down various combinations of AltGr+<key>) would not work.

.. js:function:: GateOne.Input.key(e)

    :param event e: A JavaScript key event.

    Given an event (*e*), returns a very straightforward (e.g. easy to read/understand) object representing any keystrokes contained within it.  The object will look like this:

    .. code-block:: javascript

        {
            type: <event type>, // Just preserves it.
            code: <the key code>, // e.g. 27
            string: 'KEY_<key string>' // e.g. KEY_N or KEY_F11
        }

    This makes keystroke-handling code a lot easier to read and more consistent across browsers and platforms.  For example, here's a hypothetical function that gets passed a keystroke event:

    .. code-block:: javascript

        var keystrokeHandler(e) {
            var key = GateOne.Input.key(e);
            console.log('key.code: ' + key.code + ', key.string: ' + key.string);
        }

    The key.string comes from :js:attr:`GateOne.Input.specialKeys`, :js:attr:`GateOne.Input.specialMacKeys`, and the key event itself (onkeydown events provide an upper-case string for most keys).

.. js:function:: GateOne.Input.modifiers(e)

    :param event e: A JavaScript key event.

    Like :js:func:`GateOne.Input.key`, this function returns a well-formed object for a fairly standard JavaScript event.  This object looks like so:

    .. code-block:: javascript

        {
            shift: false,
            alt: false,
            ctrl: false,
            meta: false
        }

    Since some browsers (i.e. Chrome) don't register the 'meta' key (aka "the Windows key") as a proper modifier, :js:func:`~GateOne.Input.modifiers` will emulate it by examining the :js:attr:`GateOne.Input.metaHeld` property.  The state of the meta key is tracked via :js:attr:`GateOne.Input.metaHeld` by way of the :js:func:`GateOne.Input.onKeyDown` and :js:func:`GateOne.Input.onKeyUp` functions.

.. js:function:: GateOne.Input.mouse(e)

    :param event e: A JavaScript mouse event.

    Just like :js:func:`GateOne.Input.key` and :js:func:`GateOne.Input.modifiers`, this function returns a well-formed object for a fairly standard JavaScript event:

    .. code-block:: javascript

        {
            type:   <event type>, // Just preserves it
            left:   <true/false>,
            right:  <true/false>,
            middle: <true/false>,
        }

    Very convient for figuring out which mouse button was pressed on any given mouse event.

.. js:function:: GateOne.Input.onKeyDown(e)

    :param event e: A JavaScript key event.

    This function gets attached to :js:attr:`GateOne.prefs.goDiv.onkeydown` by way of :js:func:`GateOne.Input.capture`.  It keeps track of the state of the meta key (see :js:func:`~GateOne.Input.modifiers` above), executes any matching keyboard shortcuts defined in :js:attr:`GateOne.Input.shortcuts`, and calls :js:func:`GateOne.Input.emulateKey` or :js:func:`GateOne.Input.emulateKeyCombo` depending on which (if any) modifiers were held during the keystroke event.

.. js:function:: GateOne.Input.onKeyUp(e)

    :param event e: A JavaScript key event.

    This function gets attached to :js:attr:`GateOne.prefs.goDiv.onkeyup` by way of :js:func:`GateOne.Input.capture`.  It is used in conjunction with :js:func:`GateOne.Input.modifiers` and :js:func:`GateOne.Input.onKeyDown` to emulate the meta key modifier using KEY_WINDOWS_LEFT and KEY_WINDOWS_RIGHT since "meta" doesn't work as an actual modifier on some browsers/platforms.

.. js:function:: GateOne.Input.queue(text)

    :param string text: The text to be added to the :attr:`~GateOne.Input.charBuffer`.

    Adds *text* to :js:attr:`GateOne.Input.charBuffer`.

.. js:function:: GateOne.Input.registerShortcut(keyString, shortcutObj, action)

    :param string keyString: The KEY_<key> that will invoke this shortcut.
    :param object shortcutObj: A JavaScript object containing two properties:  'modifiers' and 'action'.  See above for their format.
    :param action: A string to be eval()'d or a function to be executed when the provided key combination is pressed.

    Registers the given *shortcutObj* for the given *keyString* by adding a new object to :js:attr:`GateOne.Input.shortcuts`.  Here's an example:

    .. code-block:: javascript

        GateOne.Input.registerShortcut('KEY_ARROW_LEFT', {
            'modifiers': {
                'ctrl': false,
                'alt': false,
                'meta': false,
                'shift': true
            },
            'action': 'GateOne.Visual.slideLeft()'
        });

    .. note:: The 'action' may be a string that gets invoked via eval().  This allows plugin authors to register shortcuts that call objects and functions that may not have been available at the time they were registered.


GateOne.Visual
--------------
.. js:attribute:: GateOne.Visual

This module contains all of Gate One's visual effect functions.  It is just like :js:attr:`GateOne.Utils` but specific to visual effects and DOM manipulations.

Properties
^^^^^^^^^^
.. js:attribute:: GateOne.Visual.goDimensions

    Stores the dimensions of the :js:attr:`GateOne.prefs.goDiv` element in the form of ``{w: '800', h: '600'}`` where 'w' and 'h' represent the width and height in pixels.  It is used by several functions in order to calculate how far to slide terminals, how many rows and columns will fit, etc.

Functions
^^^^^^^^^
.. container:: collapseindex

    .. hlist::

        * :js:attr:`GateOne.Visual.addSquare`
        * :js:attr:`GateOne.Visual.alert`
        * :js:attr:`GateOne.Visual.applyStyle`
        * :js:attr:`GateOne.Visual.applyTransform`
        * :js:attr:`GateOne.Visual.bellAction`
        * :js:attr:`GateOne.Visual.createGrid`
        * :js:attr:`GateOne.Visual.CSSPluginAction`
        * :js:attr:`GateOne.Visual.dialog`
        * :js:attr:`GateOne.Visual.disableScrollback`
        * :js:attr:`GateOne.Visual.displayMessage`
        * :js:attr:`GateOne.Visual.displayTermInfo`
        * :js:attr:`GateOne.Visual.enableScrollback`
        * :js:attr:`GateOne.Visual.getTransform`
        * :js:attr:`GateOne.Visual.init`
        * :js:attr:`GateOne.Visual.playBell`
        * :js:attr:`GateOne.Visual.serverMessageAction`
        * :js:attr:`GateOne.Visual.setTitleAction`
        * :js:attr:`GateOne.Visual.slideDown`
        * :js:attr:`GateOne.Visual.slideLeft`
        * :js:attr:`GateOne.Visual.slideRight`
        * :js:attr:`GateOne.Visual.slideToTerm`
        * :js:attr:`GateOne.Visual.slideUp`
        * :js:attr:`GateOne.Visual.toggleGridView`
        * :js:attr:`GateOne.Visual.toggleOverlay`
        * :js:attr:`GateOne.Visual.togglePanel`
        * :js:attr:`GateOne.Visual.toggleScrollback`
        * :js:attr:`GateOne.Visual.updateDimensions`
        * :js:attr:`GateOne.Visual.widget`

.. tip:: In most of Gate One's JavaScript, *term* refers to the terminal number (e.g. 1).

.. js:function:: GateOne.Visual.addSquare(squareName)

    :param string squareName: The name of the "square" to be added to the grid.

    Called by :js:func:`~GateOne.Visual.createGrid()`; creates a terminal div and appends it to ``GateOne.Visual.squares`` (which is just a temporary holding space).  Probably not useful for anything else.

    .. note:: In fact, this function would only ever get called if you were debugging the grid...  You'd call :js:func:`~GateOne.Visual.createGrid()` with, say, an Array containing a dozen pre-determined terminal names as the second argument.  This would save you the trouble of opening a dozen terminals by hand.

.. js:function:: GateOne.Visual.alert(title, message, callback)

    :param string title: Title of the dialog that will be displayed.
    :param message: An HTML-formatted string or a DOM node; Main content of the alert dialog.
    :param function callback: A function that will be called after the user clicks "OK".

    .. figure:: screenshots/gateone_alert.png
        :class: portional-screenshot
        :align: right

    Displays a dialog using the given *title* containing the given *message* along with an OK button.  When the OK button is clicked, *callback* will be called.

    .. code-block:: javascript

        GateOne.Visual.alert('Test Alert', 'This is an alert box.');

    .. note:: This function is meant to be a less-intrusive form of JavaScript's alert().

.. js:function:: GateOne.Visual.applyStyle(elem, style)

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
    :param style: A JavaScript object holding the style that will be applied to *elem*.

    A convenience function that allows us to apply multiple style changes in one go.  For example:

    .. code-block:: javascript

        GateOne.Visual.applyStyle('#somediv', {'opacity': 0.5, 'color': 'black'});

.. js:function:: GateOne.Visual.applyTransform(obj, transform)

    :param obj: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id``, a DOM node, an `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_ of DOM nodes, an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_, or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.
    :param transform: A `CSS3 transform <http://www.w3schools.com/cssref/css3_pr_transform.asp>`_ function such as ``scale()`` or ``translate()``.

    This function is Gate One's bread and butter:  It applies the given CSS3 *transform* to *obj*.  *obj* can be one of the following:

        * A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_-like string (e.g. "#some_element_id").
        * A DOM node.
        * An `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_ or an Array-like object containing DOM nodes such as `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_ or `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ (it will apply the transform to all of them).

    The *transform* should be *just* the actual transform function (e.g. ``scale(0.5)``).  :js:func:`~GateOne.Visual.applyTransform` will take care of applying the transform according to how each browser implements it.  For example:

    .. code-block:: javascript

        GateOne.Visual.applyTransform('#somediv', 'translateX(500%)');

    ...would result in ``#somediv`` getting styles applied to it like this:

    .. code-block:: css

        #somediv {
            -webkit-transform: translateX(500%); /* Chrome/Safari/Webkit-based stuff */
            -moz-transform: translateX(500%);    /* Mozilla/Firefox/Gecko-based stuff */
            -o-transform: translateX(500%);      /* Opera */
            -ms-transform: translateX(500%);     /* IE9+ */
            -khtml-transform: translateX(500%);  /* Konqueror */
            transform: translateX(500%);         /* Some day this will be all that is necessary */
        }

.. js:function:: GateOne.Visual.bellAction(bellObj)

    :param object bellObj: A JavaScript object containing one attribute: {'term': <num>}.

    .. figure:: screenshots/gateone_bellaction.png
        :class: portional-screenshot
        :align: right

    Plays a bell sound and pops up a message indiciating which terminal the bell came from (visual bell is always enabled).  If ``GateOne.prefs.bellSound == false`` only thwe visual indicator will be displayed.

    .. note:: This takes a JavaScript object (*bellObj*) as an argument because it is meant to be registered as an action in :js:attr:`GateOne.Net.actions` as it is the Gate One server that tells us when a bell has been encountered.

    The format of *bellObj* is as simple as can be: ``{'term': 1}``.
    The bell sound will be whatever ``<source>`` is attached to an ``<audio>`` tag with ID ``#bell``.  By default, Gate One's index.html template includes a such an ``<audio>`` tag with a `data:URI <http://en.wikipedia.org/wiki/Data_URI_scheme>`_ as the ``<source>`` that gets created from '<gateone dir>/static/bell.ogg'.

    .. code-block:: javascript

        GateOne.Visual.bellAction({'term': 1}); // This is how it is called

    .. note:: Why is the visual bell always enabled?  Without a visual indicator, if you had more than one terminal open it would be impossible to tell which terminal the bell came from.

.. js:function:: GateOne.Visual.createGrid(id[, terminalNames])

    :param id: The name that will be given to the resulting grid.  e.g. <div id="*id*"></div>
    :param style: An array of DOM IDs (e.g. ["term1", "term2"]).

    Creates a container for housing terminals and optionally, pre-creates them using *terminalNames* (useful in debugging).  The container will be laid out in a 2x2 grid.

    .. code-block:: javascript

        GateOne.Visual.createGrid("#"+GateOne.prefs.prefix+"termwrapper");

    .. note:: Work is being done to replace the usage of the grid with more abiguous functions in order to make it possible for plugins to override the default behavior to, say, have a 4x4 grid.  Or use some other terminal-switching mechanism/layout altogether (cube, anyone? =).  Will probably be available in Gate One v1.5 since it is merely time consuming to replace a zillion function calls with a wrapper.

.. js:function:: GateOne.Visual.CSSPluginAction(message)

    :param object message: The name that will be given to the resulting grid.  e.g. <div id="*id*"></div>

    .. note:: This function gets attached to the 'load_css' action in :js:attr:`GateOne.Net.actions`.

    Loads the CSS for a given plugin by adding a <link> tag to the <head>.

.. js:function:: GateOne.Visual.dialog(title, content, [options])

    :param string title: The title of the dialog.
    :param string content: The content of the dialog.
    :param object options: Doesn't do anything yet.
    :returns: A function that will close the dialog.

    .. figure:: screenshots/gateone_dialog.png
        :class: portional-screenshot
        :align: right

    Creates a dialog with the given *title* and *content*.  Returns a function that will close the dialog when called.  Example:

    .. code-block:: javascript

        var closeDialog = GateOne.Visual.dialog("Test Dialog", "Dialog content goes here.");

.. js:function:: GateOne.Visual.disableTransitions(elem)

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

    Disables CSS3 transform transitions on the given element.

    .. code-block:: javascript

        GateOne.Visual.disableTransitions(someNode);

.. js:function:: GateOne.Visual.disableScrollback([term])

    :param number term: The terminal number to disable scrollback.

    Replaces the contents of *term* with just the visible screen (i.e. no scrollback buffer).  This makes terminal manipulations considerably faster since the browser doesn't have to reflow as much text.  If no *term* is given, replace the contents of *all* terminals with just their visible screens.

    While this function itself causes a reflow, it is still a good idea to call it just before performing a manipulation of the DOM since the presence of scrollbars really slows down certain CSS3 transformations.  Just don't forget to cancel :js:data:`GateOne.terminals[term]['scrollbackTimer']` or any effects underway might get very choppy right in the middle of execution.

    .. code-block:: javascript

        GateOne.Visual.disableScrollback(1);

    .. note:: A convenience function for enabling/disabling the scrollback buffer is available: :js:func:`GateOne.Visual.toggleScrollback()` (detailed below).

.. js:function:: GateOne.Visual.displayMessage(message[, timeout[, removeTimeout[, id]]])

    :param string message: The message to display.
    :param integer timeout: Milliseconds; How long to display the message before starting the *removeTimeout* timer.  **Default:** 1000.
    :param integer removeTimeout: Milliseconds; How long to delay before calling :js:func:`GateOne.Utils.removeElement` on the message DIV.  **Default:** 5000.
    :param string id: The ID to assign the message DIV.  **Default:** "notice".

    .. figure:: screenshots/gateone_displaymessage.png
        :class: portional-screenshot
        :align: right

    Displays *message* to the user via a transient pop-up DIV that will appear inside :js:attr:`GateOne.prefs.goDiv`.  How long the message lasts can be controlled via *timeout* and *removeTimeout* (which default to 1000 and 5000, respectively).

    If *id* is given, it will be prefixed with :js:attr:`GateOne.prefs.prefix` and used as the DIV ID for the pop-up.  i.e. ``GateOne.prefs.prefix+id``.  The default is ``GateOne.prefs.prefix+"notice"``.

    .. code-block:: javascript

        GateOne.Visual.displayMessage('This is a test.');

    .. note:: The default is to display the message in the lower-right corner of :js:attr:`GateOne.prefs.goDiv` but this can be controlled via CSS.

.. js:function:: GateOne.Visual.displayTermInfo(term)

    :param number term: The terminal number to display info for.

    .. figure:: screenshots/gateone_displayterminfo.png
        :class: portional-screenshot
        :align: right

    Displays the terminal number and terminal title of the given *term* via a transient pop-up DIV that starts fading away after one second.

    .. code-block:: javascript

        GateOne.Visual.displayTermInfo(1);

    .. note:: Like :js:func:`~GateOne.Visual.displayMessage()`, the location and effect of the pop-up can be controlled via CSS.  The DIV ID will be ``GateOne.prefs.prefix+'infocontainer'``.

.. js:function:: GateOne.Visual.enableScrollback([term])

    :param number term: The terminal number to enable scrollback.

    Replaces the contents of *term* with the visible scren + scrollback buffer.  Use this to restore scrollback after calling :js:func:`~GateOne.Visual.disableScrollback()`.  If no *term* is given, re-enable the scrollback buffer in *all* terminals.

    .. code-block:: javascript

        GateOne.Visual.enableScrollback(1);

    .. note:: A convenience function for enabling/disabling the scrollback buffer is available: :js:func:`GateOne.Visual.toggleScrollback()` (detailed below).

.. js:function:: GateOne.Visual.enableTransitions(elem)

    :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

    Enables CSS3 transform transitions on the given element.

    .. code-block:: javascript

        GateOne.Visual.enableTransitions(someNode);

.. js:function:: GateOne.Visual.getTransform(elem)

    :param number elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string ID or a DOM node.

    Returns the transform string applied to the style of the given *elem*

    .. code-block:: javascript

        > GateOne.Visual.getTransform('#go_term1_pre');
        "translateY(-3px)"

.. js:function:: GateOne.Visual.init

    Called by :js:func:`GateOne.init()`, performs the following:

        * Adds an icon to the panel for toggling the grid.
        * Adds :js:func:`GateOne.Visual.bellAction` as the 'bell' action in :js:attr:`GateOne.Net.actions`.
        * Adds :js:func:`GateOne.Visual.setTitleAction` as the 'set_title' action in :js:attr:`GateOne.Net.actions`.
        * Registers the following keyboard shortcuts:

            =================================== =======================
            Function                            Shortcut
            =================================== =======================
            GateOne.Visual.toggleGridView()     :kbd:`Control-Alt-G`
            GateOne.Visual.slideLeft()          :kbd:`Shift-LeftArrow`
            GateOne.Visual.slideRight()         :kbd:`Shift-RightArrow`
            GateOne.Visual.slideUp()            :kbd:`Shift-UpArrow`
            GateOne.Visual.slideDown()          :kbd:`Shift-DownArrow`
            =================================== =======================

.. js:function:: GateOne.Visual.playBell

    Plays the bell sound attached to the ``<audio>`` tag with ID ``#bell`` *without* any visual notification.

    .. code-block:: javascript

        GateOne.Visual.playBell();

.. js:function:: GateOne.Visual.resetGrid

    Resets the grid to its default state where all terminals are visible but have CSS3 transforms applied that make the currently-selected terminal visible on the page.

    .. note:: This turns off all terminal transitions so they will need to be reset after running this function if you want to move terminals around with a fancy animation.

    .. code-block:: javascript

        GateOne.Visual.resetGrid();

.. js:function:: GateOne.Visual.serverMessageAction(message)

    :param string message: A message from the Gate One server.

    .. note:: This function gets attached to the 'notice' action in :js:attr:`GateOne.Net.actions`.

    Displays an incoming message from the Gate One server.  As simple as can be.  This is the entire function:

    .. code-block:: javascript

        serverMessageAction: function(message) {
            // Displays a *message* sent from the server
            GateOne.Visual.displayMessage(message);
        },

    Why not just attach :js:func:`~GateOne.Visual.displayMessage` to the 'notice' action?  Two reasons:

        1. So plugins can override this method.
        2. We might want to apply extra formatting or perform additional functions in the future.

.. js:function:: GateOne.Visual.setTitleAction(titleObj)

    :param object titleObj: A JavaScript object as decoded from the message from the server.

    .. note:: This function gets attached to the 'set_title' action in :js:attr:`GateOne.Net.actions`.

    Given that *titleObj* is a JavaScript object such as, ``{'term': 1, 'title': "user@host:~"}``, sets the title of the terminal provided by *titleObj['term']* to *titleObj['title']*.

    .. code-block:: javascript

        GateOne.Visual.setTitleAction({'term': 1, 'title': "user@host:~"});

.. js:function:: GateOne.Visual.slideDown

    Grid specific: Slides the view downward one terminal by pushing all the others up.

    .. code-block:: javascript

        GateOne.Visual.slideDown();

.. js:function:: GateOne.Visual.slideLeft

    Grid specific: Slides the view left one terminal by pushing all the others to the right.

    .. code-block:: javascript

        GateOne.Visual.slideLeft();

.. js:function:: GateOne.Visual.slideRight

    Grid specific: Slides the view right one terminal by pushing all the others to the left.

    .. code-block:: javascript

        GateOne.Visual.slideRight();

.. js:function:: GateOne.Visual.slideToTerm(term, changeSelected)

    :param number term: The terminal number to slide to.
    :param boolean changeSelected: If true, set the current terminal to *term*.

    Grid specific: Slides the view to *term*.  If *changeSelected* is true, this will also set the current terminal to the one we're sliding to.

    .. code-block:: javascript

        GateOne.Visual.slideToTerm(1, true);

    .. note:: Generally speaking, you'll want *changeSelected* to always be true.

.. js:function:: GateOne.Visual.slideUp()

    Grid specific: Slides the view upward one terminal by pushing all the others down.

    .. code-block:: javascript

        GateOne.Visual.slideUp();

.. js:function:: GateOne.Visual.toggleGridView([goBack])

    :param boolean goBack: If false, will not switch to the previously-selected terminal when un-toggling the grid view (i.e. sliding to a specific terminal will be taken care of via other means).

    Brings up the terminal grid view (by scaling all the terminals to 50%) or returns to a single, full-size terminal.
    If *goBack* is true (the default), go back to the previously-selected terminal when un-toggling the grid view.  This argument is primarily meant for use internally within the function when assigning onclick events to each downsized terminal.

    .. code-block:: javascript

        GateOne.Visual.toggleGridView();

.. js:function:: GateOne.Visual.toggleOverlay

    Toggles the overlay that visually indicates whether or not Gate One is ready for input.  Normally this function gets called automatically by :js:func:`GateOne.Input.capture` and :js:func:`GateOne.Input.disableCapture` which are attached to ``mousedown`` and ``blur`` events, respectively.

.. js:function:: GateOne.Visual.togglePanel([panel])

    :param string panel: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string ID or the DOM node of the panel we're toggling.

    Toggles the given *panel* in or out of view.  *panel* is expected to be the ID of an element with the `GateOne.prefs.prefix+"panel"` class.
    If *panel* is null or false, all open panels will be toggled out of view.

    .. code-block:: javascript

        GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_bookmarks');

.. js:function:: GateOne.Visual.toggleScrollback

    Toggles the scrollback buffer for all terminals by calling :js:func:`GateOne.Visual.disableScrollback` or :js:func:`GateOne.Visual.enableScrollback` depending on the state of the toggle.

    .. code-block:: javascript

        GateOne.Visual.toggleScrollback();

.. js:function:: GateOne.Visual.updateDimensions

    Sets :js:attr:`GateOne.Visual.goDimensions` to the current width/height of :js:attr:`GateOne.prefs.goDiv`.  Typically called when the browser window is resized.

    .. code-block:: javascript

        GateOne.Visual.updateDimensions();

.. js:function:: GateOne.Visual.widget(title, content, [options])

    :param string title: A title that will appear above the widget when the mouse hovers over it for longer than a second.
    :param content: An HTML string or DOM node that will be the content of the widget.
    :param object options: A JavaScript object containing a number of optional parameters.

    Creates an on-screen widget with the given *title* and *content* that hovers above Gate One's terminals or a specific terminal (depending on *options*).  Returns a function that will remove the widget when called.  Options:

    .. js:attribute:: options.onopen

        A function that will be called with the parent widget node as an argument when the widget is opened.

    .. js:attribute:: options.onclose

        A function that will be called with the parent widget node as an argument when the widget is closed.

    .. js:attribute:: options.onconfig

        If a function is assigned to this parameter a gear icon will be visible in the title bar of the widget that when clicked will call this function.

    .. js:attribute:: options.term

        If provided the widget will be attached to this specific terminal (as opposed to floating above *all* terminals).

    By default widgets are transparent and have no border:

    .. figure:: screenshots/gateone_widget2.png
        :class: portional-screenshot
        :align: center

    .. code-block:: javascript

        GateOne.Visual.widget("Example Widget", "This is the content of the widget.");

    However, if the user holds their mouse over the widget a title will be drawn and they will be able to move it around:

    .. figure:: screenshots/gateone_widget.png
        :class: portional-screenshot
        :align: center

    When an ``onconfig`` function is set a configuration icon (gear) will appear to the left of the widget title that when clicked calls that function:

    .. code-block:: javascript

        GateOne.Visual.widget("Configurable Widget", "This widget can be configured.", {'onconfig': configFunc});

    .. figure:: screenshots/gateone_widget3.png
        :class: portional-screenshot
        :align: center


GateOne.Terminal
----------------
.. js:attribute:: GateOne.Terminal

GateOne.Terminal contains terminal-specific properties and functions.  Really, there's not much more to it than that :)

Properties
^^^^^^^^^^
.. js:attribute:: GateOne.Terminal.closeTermCallbacks

    :type: Array

    If a plugin wants to perform an action whenever a terminal is closed it can register a callback here like so:

    .. code-block:: javascript

        GateOne.Terminal.closeTermCallbacks.push(GateOne.MyPlugin.termClosed);

    All callbacks in :js:attr:`~GateOne.Terminal.closeTermCallbacks` will be called whenever a terminal is closed with the terminal number as the only argument.

.. js:attribute:: GateOne.Terminal.modes

    :type: Object

    An object containing a collection of functions that will be called whenever a matching terminal (expanded) mode is encountered.  For example, terminal mode '1' (which maps to escape sequences '[?1h' and '[?1l') controls "application cursor keys" mode.  In this mode, the cursor keys are meant to send different escape sequences than they normally do.

    Functions inside :js:attr:`GateOne.Terminal.modes` are called with a boolean as their only argument; ``true`` meaning 'set this mode' and ``false`` meaning 'reset this mode'.  These translate back to `terminal.Terminal` which calls whatever is assigned to ``Terminal.callbacks[CALLBACK_MODE]`` with the mode number and a boolean as the only two arguments.

    ``Terminal.callbacks[CALLBACK_MODE]`` is assigned inside of `gateone.py <gateone.html>`_ to ``TerminalWebSocket.mode_handler`` which sends a message to the Gate One client containing a JSON-encoded object like so:

    .. code-block:: python

        {'set_mode': {
            'mode': setting, # Would be '1' for application cursor keys mode
            'boolean': True, # Set this mode
            'term': term     # On this terminal
        }}

    This maps directly to the 'set_mode' action in :js:attr:`GateOne.Net.actions` which calls :js:attr:`GateOne.Terminal.modes`.

.. js:attribute:: GateOne.Terminal.newTermCallbacks

    :type: Array

    If a plugin wants to perform an action whenever a terminal is opened it can register a callback here like so:

    .. code-block:: javascript

        GateOne.Terminal.newTermCallbacks.push(GateOne.MyPlugin.termOpened);

    All callbacks in :js:attr:`~GateOne.Terminal.newTermCallbacks` will be called whenever a new terminal is opened with the terminal number as the only argument.

.. js:attribute:: GateOne.Terminal.scrollbackWidth

    :type: Integer

    The first time :js:func:`GateOne.Terminal.termUpdateFromWorker` is executed it calculates the width of the scrollbar inside of the terminal it is updating (in order to make sure the toolbar doesn't overlap).  The result of this calculation is stored in this attribute.

.. js:attribute:: GateOne.Terminal.termUpdatesWorker

    :type: `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_

    This is a `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ (go_process.js) that is used by :js:func:`GateOne.Terminal.updateTerminalAction` to process the text received from the Gate One server.  This allows things like linkifying text to take place asynchronously so it doesn't lock or slow down your browser while the CPU does its work.

.. js:attribute:: GateOne.Terminal.updateTermCallbacks

    :type: Arrray

    If a plugin wants to perform an action whenever a terminal screen is updated it can register a callback here like so:

    .. code-block:: javascript

        GateOne.Terminal.updateTermCallbacks.push(GateOne.MyPlugin.termUpdated);

    All callbacks in :js:attr:`~GateOne.Terminal.updateTermCallbacks` will be called whenever a new terminal is opened with the terminal number as the only argument.

Functions
^^^^^^^^^
.. container:: collapseindex

    .. hlist::

        * :js:attr:`GateOne.Terminal.applyScreen`
        * :js:attr:`GateOne.Terminal.closeTerminal`
        * :js:attr:`GateOne.Terminal.init`
        * :js:attr:`GateOne.Terminal.loadWebWorkerAction`
        * :js:attr:`GateOne.Terminal.newTerminal`
        * :js:attr:`GateOne.Terminal.notifyActivity`
        * :js:attr:`GateOne.Terminal.notifyInactivity`
        * :js:attr:`GateOne.Terminal.paste`
        * :js:attr:`GateOne.Terminal.reattachTerminalsAction`
        * :js:attr:`GateOne.Terminal.reconnectTerminalAction`
        * :js:attr:`GateOne.Terminal.registerTextTransform`
        * :js:attr:`GateOne.Terminal.resetTerminalAction`
        * :js:attr:`GateOne.Terminal.setModeAction`
        * :js:attr:`GateOne.Terminal.switchTerminal`
        * :js:attr:`GateOne.Terminal.termUpdateFromWorker`
        * :js:attr:`GateOne.Terminal.timeoutAction`
        * :js:attr:`GateOne.Terminal.unregisterTextTransform`
        * :js:attr:`GateOne.Terminal.updateTerminalAction`
        * :js:attr:`GateOne.Terminal.writeScrollback`

.. js:function:: GateOne.Terminal.applyScreen(screen, [term])

    :param array screen: An array of HTML-formatted strings representing the lines of a terminal screen.
    :param number term: The terminal that have the screen applied.

    Uses *screen* (an array of HTML-formatted lines) to update *term*.  If *term* is not provided, the currently-selected terminal will be updated.

    .. code-block:: javascript

        // Pretend screenArray is an array of lines we want to place in terminal 1:
        GateOne.Terminal.applyScreen(screenArray, 1);

.. js:function:: GateOne.Terminal.closeTerminal(term)

    :param number term: The terminal that will be closed.

    Closes the given *term* and tells the Gate One server to end the process associated with it.

    .. code-block:: javascript

        GateOne.Terminal.closeTerm(2);

.. js:function:: GateOne.Terminal.init()

    Creates the terminal information panel, initializes the terminal updates `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ (which is contained in go_process.js), and registers the following keyboard shortcuts and `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ actions:

    .. admonition:: Keyboard Shortcuts

        ================================================================ ==================== =========================
        Function                                                         Shortcut             Enabled in Embedded Mode?
        ================================================================ ==================== =========================
        GateOne.Terminal.newTerminal()                                   :kbd:`Control-Alt-N` No
        GateOne.Terminal.closeTerminal(localStorage["selectedTerminal"]) :kbd:`Control-Alt-W` No
        GateOne.Terminal.paste()                                         :kbd:`Shift-INS`     Yes
        ================================================================ ==================== =========================

    .. admonition:: WebSocket Actions

        ================  ====================================================
        Action            Function
        ================  ====================================================
        load_webworker    :js:func:`GateOne.Terminal.loadWebWorkerAction`
        set_mode          :js:func:`GateOne.Terminal.setModeAction`
        term_ended        :js:func:`GateOne.Terminal.closeTerminal`
        terminals         :js:func:`GateOne.Terminal.reattachTerminalsAction`
        termupdate        :js:func:`GateOne.Terminal.updateTerminalAction`
        term_exists       :js:func:`GateOne.Terminal.reconnectTerminalAction`
        timeout           :js:func:`GateOne.Terminal.timeoutAction`
        ================  ====================================================

.. js:function:: GateOne.Terminal.loadWebWorkerAction(source)

    :param string source: The source code of the `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ (go_process.js).

    This function gets attached to the 'load_webworker' action in :js:attr:`GateOne.Net.actions` and gets called by the server in response to a 'get_webworker' request.  The 'get_webworker' request is sent by :js:func:`GateOne.Net.onOpen` after the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ is opened.  It loads our `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ (go_process.js) given it's *source*.

    .. note:: This is a clever way to work around the origin limiations of `Web Workers <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_.  Something that is necessary when Gate One is embedded into another application and being served up from a completely different domain.

.. js:function:: GateOne.Terminal.newTerminal([term], [type], [where])

    :param number term: Optional: When the new terminal is created, it will be assigned this number.
    :param number type: Optional: Not currently used.  In the future it will be used to tell the server which kind of terminal to create.
    :param number where: Optional: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node where the new terminal will be created.

    Creates a new terminal and gets it updating itself by way of the Gate One server.  Also, if :js:attr:`GateOne.prefs.autoConnectURL` is set :js:func:`GateOne.Net.onOpen` will send that value to the server 500ms after the terminal is opened.

    If *where* is provided the new terminal elements will be placed inside that container...  Which doesn't *have* to be inside :js:attr:`GateOne.prefs.goDiv` but it's a good idea since that will ensure everything lines up and has the correct formatting.

    .. code-block:: javascript

        GateOne.Terminal.newTerminal();

.. js:function:: GateOne.Terminal.notifyActivity(term)

    :param number term: The terminal that activity was detected in.

    Notifies the user when there's activity in *term* by displaying a message and playing the bell.

    .. code-block:: javascript

        GateOne.Terminal.notifyActivity(1);

    .. note:: You wouldn't normally call this function directly.  It is meant to be called from :js:func:`GateOne.Terminal.updateTerminal` when the right conditions are met.

.. js:function:: GateOne.Terminal.notifyInactivity(term)

    :param number term: The terminal that inactivity was detected in.

    Notifies the user when the inactivity timeout in *term* has been reached by displaying a message and playing the bell.

    .. code-block:: javascript

        GateOne.Terminal.notifyInactivity(1);

    .. note:: You wouldn't normally call this function directly.  It is meant to be called from :js:func:`GateOne.Terminal.updateTerminal` when the right conditions are met.

.. js:function:: GateOne.Terminal.paste(e)

    :param event e: A JavaScript event as received from a 'paste' event or the shift-INS keyboard shortcut.

    This gets attached to Shift-Insert (KEY_INSERT) as a shortcut and the 'paste' event attached to :js:attr:`GateOne.prefs.goDiv` in order to support pasting text into a terminal via those mechanisms.  It shifts focus to the pastearea just before the actual paste event takes place in order for the input to be captured.  Also, if the browser allows it will perform a ``commandExec('paste')`` into the pastearea as part of the process (with logic to prevent double pastes).

.. js:function:: GateOne.Terminal.reattachTerminalsAction(terminals)

    :param array terminals: An Array of terminal numbers we're reattaching.

    This function gets attached to the 'terminals' action in :js:attr:`GateOne.Net.actions` and gets called after we authenticate with the Gate One server (the server is what tells us to call this function).  The *terminals* argument is expected to be an Array of terminal numbers that are currently running on the Gate One server.

    If no terminals currently exist (we received an empty Array), :js:func:`GateOne.Terminal.newTerminal()` will be called to create a new one (if embedded mode is not enabled).

.. js:function:: GateOne.Terminal.reconnectTerminalAction(term)

    :param number term: The terminal number that already exists on the server.

    This function gets attached to the 'term_exists' action in :js:attr:`GateOne.Net.actions` and gets called when the server reports that the terminal number supplied via 'new_terminal' already exists.  It doesn't actually do anything right now but there might be use case for handling this condition in the future.

.. js:function:: GateOne.Terminal.registerTextTransform(name, pattern, newString)

    :param string name: The name of this pattern (so we can reference it later).
    :param pattern: A regular expression or function that will be used to process incoming terminal screen updates.
    :param string newString: An HTML string with regular expression placement indicators (e.g. $1) that will replace what was matched in *pattern* (if *pattern* is a regular expression).

    Adds to or replaces existing text transformations in :js:attr:`GateOne.Terminal.textTransforms` using *pattern* and *newString* with the given *name*.  Example:

    .. code-block:: javascript

        // If your company's ticket system uses the following format: IM123456789 the code
        // below will turn it into a clickable link in the user's terminal!
        var pattern = /(\bIM\d{9,10}\b)/g,
            newString = "<a href='https://support.company.com/tracker?ticket=$1' target='new'>$1</a>";
        GateOne.Terminal.registerTextTransform("ticketIDs", pattern, newString);
        // If you typed "Ticket: IM123456789" into a terminal it would be transformed thusly:
        //      "Ticket number: <a href='https://support.company.com/tracker?ticket=IM123456789' target='new'>IM123456789</a>"

    .. rubric:: What is a text transformation?  Why should I care?

    Text transformations allow one to arbitrarily replace any single-line strings in the incoming terminal screen with one of your choosing.  In the example code above it turns ticket numbers like IM0123456789 into clickable links but you can also match things like credit card numbers, man page commands, etc and do what you want with them.

    .. tip:: A single .js file in ``gateone/plugins/yourplugin/static/`` is all it takes to use your own text transformations on a Gate One server!

    .. note:: To keep things smooth and prevent blocking the interactivity of the browser all text transformations are processed within Gate One's `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ (go_process.js).  In fact, this is exactly how Gate One transforms URLs into clickable links.

    .. note:: Text transformations only apply to the terminal's screen; not the scrollback buffer.

    Instead of providing a regular expression and replacement string, a function may be given as the second parameter.  Example:

    .. code-block:: javascript

        var replaceFoo = function(line) {
            return line.replace('foo', 'bar');
        }
        GateOne.Terminal.registerTextTransform("foo", replaceFoo);

    This would result in the `replacefoo()` function being called for each line of the incoming screen like so:

    .. code-block:: javascript

        line = replaceFoo(line);

    .. note:: Why is it called on each line individually and not on the text as a whole?  Because Gate One uses a line-based difference protocol to communicate between the client and server.  So when the only thing that changes is a single line, only a single line will be sent to the client.

.. js:function:: GateOne.Terminal.resetTerminalAction(term)

    :param number term: The terminal number you wish to reset.

    Clears the screen and the scrollback buffer (in memory and in localStorage) of the given *term*.

.. js:function:: GateOne.Terminal.setModeAction(modeObj)

    :param object modeObj: An object in the form of ``{'mode': setting, 'boolean': True, 'term': term}``

    This function gets attached to the 'set_mode' action in :js:attr:`GateOne.Net.actions` and gets called when the server encounters either a "set expanded mode" or "reset expanded mode" escape sequence.  Essentially, it uses the values provided by *modeObj* to call ``GateOne.Net.actions[modeObj['mode']](modeObj['term'], modeObj['boolean'])``.

    .. seealso:: :js:attr:`GateOne.Terminal.modes`.

.. js:function:: GateOne.Terminal.switchTerminal(term)

    :param number term: The number of the terminal you wish to switch to.

    Calls :js:func:`GateOne.Net.setTerminal` then calls whatever function is assigned to :js:attr:`GateOne.Terminal.termSelectCallback` (default is :js:func:`GateOne.Visual.slideToTerm`) with the given *term* as the only argument.

    .. tip:: If you want to write your own animation/function for switching terminals you can make it happen by assigning your function to :js:attr:`GateOne.Terminal.termSelectCallback`.

.. js:function:: GateOne.Terminal.termUpdateFromWorker(e)

    :param object e: A JavaScript event incoming from the go_process.js `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_.

    When the go_process.js `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ has completed processing the incoming terminal screen it pushes the resulting data back to the main page via this function which performs the following:

        * Sets the terminal title if it changed.
        * Creates the screen and scrollback buffer nodes if they don't already exist.
        * Applies the incoming screen and scrollback buffer updates (using :js:func:`GateOne.Terminal.applyScreen`).
        * Automatically increases or decreases the size of the screen node if it has changed since the last update.
        * Only Once: Adjusts the position of the toolbar so that it lines up properly next to the the scrollbar.
        * Schedules writing the scrollback buffer to localStorage making sure that there's only ever one such write going on at once.
        * Generates log messages sent from the `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ (only used when debugging).
        * Notifies the user of activity/inactivity in terminals and keeps track of those timers.
        * Calls :js:attr:`GateOne.Terminal.updateTermCallbacks` when all of the aformentioned activities are complete.

.. js:function:: GateOne.Terminal.timeoutAction

    This function gets attached to the 'timeout' action in :js:attr:`GateOne.Net.actions` and gets called when the user's session has timed out on the Gate One server.  It writes a message to the screen indicating a timeout has occurred and closes the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_.

.. js:function:: GateOne.Terminal.unregisterTextTransform(name)

    :param string name: The name of the text transform to remove.

    Removes the text transform of the given name from :js:attr:`GateOne.Terminal.textTransforms`.

.. js:function:: GateOne.Terminal.updateTerminalAction(termUpdateObj)

    :param object termUpdateObj: An object that contains the terminal number ('term'), the 'scrollback' buffer, the terminal 'screen', and a boolean idicating whether or not the rate limiter has been engaged ('ratelimiter').

    Takes the updated screen information from *termUpdateObj* and posts it to the go_process.js `Web Worker <https://developer.mozilla.org/en-US/docs/DOM/Worker>`_ for processing.

    This function gets attached to the 'termupdate' action in :js:attr:`GateOne.Net.actions` and gets called when a terminal has been modified on the server.  The *termObj* that the this function will receive from the Gate One server will look like this:

    .. code-block:: javascript

        {
            'term': term,
            'scrollback': scrollback,
            'screen' : screen,
            'ratelimiter': false
        }

    .. js:attribute:: options.term

        The number of the terminal that is being updated.

    .. js:attribute:: options.scrollback

        An Array of lines of scrollback that the server has preserved for us (in the event that the screen scrolled text faster than we could send it to the client).

    .. js:attribute:: options.screen

        An Array of HTML-formatted lines representing the updated terminal.

    .. js:attribute:: options.ratelimiter

        A boolean value representing whether or not the rate limiter has been engaged (if the program running on this terminal is updating the screen too fast).

.. js:function:: GateOne.Terminal.writeScrollback(term, scrollback)

    :param number term: The number of the terminal we're saving the scrollback buffer.
    :param array scrollback: The number of the terminal you wish to switch to.

    Saves the scrollback buffer in localStorage for retrieval later if the user reloads the page.

    .. note:: Normally this function would only get called by :js:func:`~GateOne.Terminal.termUpdateFromWorker`

GateOne.User
------------
.. js:attribute:: GateOne.User

GateOne.User is for things like logging out, synchronizing preferences with the server (not implemented yet), and it is also meant to provide hooks for plugins to tie into so that actions can be taken when user-specific events occur.  It also provides the UI elements necessary for the user to change their bell sound.

Properties
^^^^^^^^^^
.. js:attribute:: GateOne.User.userLoginCallbacks

    If a plugin wants to perform an action immediately after the user is authenticated a callback may be appended to this array like so:

    .. code-block:: javascript

        GateOne.User.userLoginCallbacks.push(GateOne.MyPlugin.userAuthenticated);

    This is very useful if you want to ensure that a function does not get executed until after :js:attr:`~GateOne.User.username` has been set.

    All callbacks in :js:attr:`~GateOne.User.userLoginCallbacks` will be called with the authenticated user's username as the only argument like so:

    .. code-block:: javascript

        myCallback(username);

.. js:attribute:: GateOne.User.username

    Stores the authenticated user's username.  If Gate One is configured with anonymous authenticationn ( `auth = none` in server.conf) the username will be set to 'ANONYMOUS'.

Functions
^^^^^^^^^
.. container:: collapseindex

    .. hlist::

        * :js:attr:`GateOne.User.init`
        * :js:attr:`GateOne.User.setUsername`
        * :js:attr:`GateOne.User.logout`
        * :js:attr:`GateOne.User.loadBell`
        * :js:attr:`GateOne.User.uploadBellDialog`
        * :js:attr:`GateOne.User.storeSession`

.. js:function:: GateOne.User.init

    Like all plugin init() functions this gets called from :js:func:`GateOne.Utils.postInit` which itself is called at the end of :js:func:`GateOne.initialize`.  It adds the username to the preferences panel as well as a link that allows the user to logout.  It also attaches the 'set_username', 'load_bell', and 'gateone_user' actions to :js:attr:`GateOne.Net.actions`.

.. js:function:: GateOne.User.setUsername

    This is what gets attached to the 'set_username' `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ action in :js:attr:`GateOne.Net.actions` and gets called immediately after the user is successfully authenticated.

.. js:function:: GateOne.User.logout(redirectURL)

    This function will log the user out by deleting all Gate One cookies and forcing them to re-authenticate.  By default this is what is attached to the 'logout' link in the preferences panel.

    *redirectURL* if provided, will be used to automatically redirect the user to the given URL after they are logged out (as opposed to just reloading the main Gate One page).

.. js:function:: GateOne.User.loadBell

    This gets attached to the 'load_bell' `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ action in :js:attr:`GateOne.Net.actions` and gets called by the server whenever it is asked to perform the 'get_bell' action.  The server-side 'get_bell' action is normally called by :js:func:`GateOne.Net.onOpen` if a bell sound doesn't already exist in :js:attr:`GateOne.Prefs.bellSound`.  This will download the default bell sound from the server and store it in :js:attr:`GateOne.Prefs.bellSound`.

.. js:function:: GateOne.User.uploadBellDialog

    Displays a dialog/form where the user can set a replacement bell sound or reset it to the default (which is whatever is at '<gateone>/static/bell.ogg' on the server).

    .. note:: When the user sets a custom bell sound it doesn't involve the server at all (no network traffic).  It is set locally using the HTML5 File API; the FileReader() function, specifically.

.. js:function:: GateOne.User.storeSession

    This gets attached to the 'gateone_user' `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ action in :js:attr:`GateOne.Net.actions`.  It stores the incoming (encrypted) 'gateone_user' session data in localStorage in a nearly identical fashion to how it gets stored in the 'gateone_user' cookie.

    .. note:: The reason for storing data in localStorage instead of in the cookie is so that applications embedding Gate One can remain authenticated to the user without having to deal with the cross-origin limitations of cookies.
