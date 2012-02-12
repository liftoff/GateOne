.. _gateone-javascript:

gateone.js
==========
Gate One's JavaScript is made up of several modules (aka plugins), each pertaining to a specific type of activity.  These modules are laid out like so:

* `GateOne.Base`_
* `GateOne`_
* `GateOne.Utils`_
* `GateOne.Net`_
* `GateOne.Input`_
* `GateOne.Visual`_
* `GateOne.Terminal`_

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

GateOne is the base object for all of GateOne's client-side JavaScript.  Besides the aforementioned modules (:js:attr:`~GateOne.Utils`, :js:attr:`~GateOne.Net`, :js:attr:`~GateOne.Input`, :js:attr:`~GateOne.Visual`, and :js:attr:`~GateOne.Terminal`), it contains the following properties, objects, and methods:

.. _gateone-properties:

GateOne JavaScript Properties
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
.. note:: These are ordered by importance/usefulness.

.. js:attribute:: GateOne.prefs

    This is where all of Gate One's client-side preferences are kept.  If the client changes them they will be saved in ``localStorage['prefs']``.  Also, these settings can be passed to :js:func:`GateOne.init` as an object in the first argument like so:

        .. code-block:: javascript

            GateOne.init({fillContainer: false, style: {'width': '50em', 'height': '32em'}, scheme: 'white'});

    Each individual setting is outlined below:

    .. js:attribute:: GateOne.prefs.url

        .. code-block:: javascript

            GateOne.prefs.url = window.location.href;

        URL of the Gate One server.  Gate One will open a WebSocket to this URL, converting 'http://' and 'https://' to 'ws://' and 'wss://'.

    .. js:attribute:: GateOne.prefs.fillContainer

        .. code-block:: javascript

            GateOne.prefs.fillContainer = true;

        If set to true, :js:attr:`GateOne.prefs.goDiv` (e.g. ``#gateone``) will fill itself out to the full size of its parent element.

    .. js:attribute:: GateOne.prefs.style

        .. code-block:: javascript

            GateOne.prefs.style = {};

        An object that will be used to apply styles to :js:attr:`GateOne.prefs.goDiv` element (``#gateone`` by default).  Example:

        .. code-block:: javascript

            GateOne.prefs.style = {'padding': '1em', 'margin': '0.5em'};

        .. note:: ``width`` and ``height`` will be ignored if :js:attr:`GateOne.prefs.fillContainer` is true.

    .. js:attribute:: GateOne.prefs.goDiv

        .. code-block:: javascript

            GateOne.prefs.goDiv = '#gateone';

        The element to place Gate One inside of.  It can be any block element (or element set with ``display: block`` or ``display: inline-block``) on the page embedding Gate One.

        .. note:: To keep things simple it is recommended that a ``<div>`` be used (hence the name).

    .. js:attribute:: GateOne.prefs.scrollback

        .. code-block:: javascript

            GateOne.prefs.scrollback = 500;

        The default number of lines of scrollback that clients will be instructed to use.  The higher the number the longer it will take for the browser to re-enable the scrollback buffer after the 3.5-second screen update timeout is reached.  500 lines should only take a few milliseconds even on a slow computer (very high resolutions notwithstanding).

        .. note:: Clients will still be able to change this value in the preferences panel even if you pass it to :js:func:`GateOne.init`.

    .. js:attribute:: GateOne.prefs.rows

        .. code-block:: javascript

            GateOne.prefs.rows = null;

        This will force the number of rows in the terminal.  If null, Gate One will automatically figure out how many will fit within :js:attr:`GateOne.prefs.goDiv`.

    .. js:attribute:: GateOne.prefs.cols

        .. code-block:: javascript

            GateOne.prefs.cols = null;

        This will force the number of columns in the terminal.  If null, Gate One will automatically figure out how many will fit within :js:attr:`GateOne.prefs.goDiv`.

    .. js:attribute:: GateOne.prefs.prefix

        .. code-block:: javascript

            GateOne.prefs.prefix = 'go_';

        Instructs Gate One to prefix the 'id' of all elements it creates with this string (except :js:attr:`GateOne.prefs.goDiv` itself).  You usually won't want to change this unless you're embedding Gate One into a page where a name conflict exists (e.g. you already have an element named ``#go_notice``).  The Gate One server will be made aware of this setting when the client connects so it can apply it to all generated templates where necessary.

    .. js:attribute:: GateOne.prefs.theme

        .. code-block:: javascript

            GateOne.prefs.theme = 'black';

        This sets the default CSS theme.  Clients will still be able to change it in the preferences if they wish.

    .. js:attribute:: GateOne.prefs.colors

        .. code-block:: javascript

            GateOne.prefs.colors = 'default'; // 'gnome-terminal' is another text color scheme that comes with Gate One.

        This sets the CSS text color scheme.  These are the colors that text *renditions* will use (i.e. when the terminal text is bold, red, etc).

    .. js:attribute:: GateOne.prefs.fontSize

        .. code-block:: javascript

            GateOne.prefs.fontSize = '100%'; // Alternatives: '1em', '12pt', '15px', etc.

        This sets the base font size for everything in :js:attr:`GateOne.prefs.goDiv` (e.g. #gateone).

        .. tip:: If you're embedding Gate One into something else this can be really useful for matching up Gate One's font size with the rest of your app.

    .. js:attribute:: GateOne.prefs.autoConnectURL

        .. code-block:: javascript

            GateOne.prefs.autoConnectURL = null;

        If the SSH plugin is installed, this setting can be used to ensure that whenever a client connects it will automatically connect to the given SSH URL.  Here's an example where Gate One would auto-connect as a guest user to localhost (hypothetical terminal program demo):

        .. code-block:: javascript

            GateOne.prefs.autoConnectURL = 'ssh://guest:guest@localhost:22';

        .. warning:: If you provide a password in the ssh:// URL clients will be able to see it.

    .. js:attribute:: GateOne.prefs.embedded

        .. code-block:: javascript

            GateOne.prefs.embedded = false;

        This instructs Gate One to run without any interface elements, strictly applying what was provided to :js:func:`GateOne.init`.  It also prevents opening more than one terminal and certain keyboard shortcuts from being registered (e.g. to switch between terminals).  In terms of the interface, it is equivalent to calling :js:func:`GateOne.init` like so:

        .. code-block:: javascript

            GateOne.init({showTitle: false, showToolbar: false});

    .. js:attribute:: GateOne.prefs.showTitle

        .. code-block:: javascript

            GateOne.prefs.showTitle = true;

        If this is set to ``false`` Gate One will not show the terminal title in the sidebar.

    .. js:attribute:: GateOne.prefs.showToolbar

        .. code-block:: javascript

            GateOne.prefs.showToolbar = true;

        If this is set to ``false`` Gate One will not show the toolbar (no icons on the right).

    .. js:attribute:: GateOne.prefs.bellSound

        .. code-block:: javascript

            GateOne.prefs.bellSound = true;

        If this is set to ``false`` Gate One will not play a sound when a bell is encountered in any given terminal.

        .. note:: A visual bell indiciator will still be displayed even if this is set to ``false``.

    .. js:attribute:: GateOne.prefs.disableTermTransitions

        .. code-block:: javascript

            GateOne.prefs.disableTermTransitions = false;

        With this enabled Gate One won't use fancy CSS3 transitions when switching between open terminals.  Such switching will be instantaneous (i.e. not smooth/pretty).

    .. js:attribute:: GateOne.prefs.auth

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

    Properties in this object that match the names of objects in :js:attr:`GateOne.prefs` will get ignored when they are saved to localStorage.

    .. note:: **Plugin Authors:** If you want to have your own property in :js:attr:`GateOne.prefs` but it isn't a per-user setting, add your property here (e.g. ``GateOne.prefs['myPref'] = 'foo'; GateOne.noSavePrefs['myPref'] = null;``).

    Here's what this object contains by default:

    .. code-block:: javascript

        GateOne.noSavePrefs = {
            url: null, // These are all things that shouldn't be modified by the user.
            fillContainer: null,
            style: null,
            goDiv: null,
            prefix: null,
            autoConnectURL: null,
            embedded: null,
            auth: null,
            showTitle: null,
            showToolbar: null
        }

.. js:attribute:: GateOne.terminals

    Terminal-specific settings and information are stored within this object like so:

        .. code-block:: javascript

            GateOne.terminals['1'] = {
                backspace: String.fromCharCode(127),
                columns: 165,
                created: Date(),
                mode: "default",
                playbackFrames: Array(),
                prevScreen: Array(),
                rows: 45,
                screen: Array(),
                scrollback: Array(),
                scrollbackTimer: 2311,
                scrollbackVisible: true,
                sshConnectString: "user@localhost:22"
            };

    Each terminal in Gate One has its own object--referenced by terminal number--attached to :js:attr:`~GateOne.terminals` that gets created when a new terminal is opened (in :js:func:`GateOne.Terminal.newTerminal`).  Theses values and what they mean are outlined below:

    .. js:attribute:: GateOne.terminals[num].backspace <character>

        .. code-block:: javascript

            GateOne.terminals[num].backspace = String.fromCharCode(127);

        The backspace key used by this terminal.  One of ^? (String.fromCharCode(127)) or ^H (String.fromCharCode(8)).

        .. note:: Not configurable yet.  Should be soon.

    .. js:attribute:: GateOne.terminals[num].columns <number>

        .. code-block:: javascript

            GateOne.terminals[num].columns = GateOne.prefs.cols;

        The number of columns this terminal is configured to use.  Unless the user changed it, it will match whatever is in :js:attr:`GateOne.prefs.cols`.

    .. js:attribute:: GateOne.terminals[num].created <Date()>

        .. code-block:: javascript

            GateOne.terminals[num].created = new Date();

        The date and time a terminal was originally created.

    .. js:attribute:: GateOne.terminals[num].mode <string>

        .. code-block:: javascript

            GateOne.terminals[num].mode = "default";

        The current keyboard input mode of the terminal.  One of "default" or "appmode" representing whether or not the terminal is in standard or "application cursor keys" mode (which changes what certain keystrokes send to the Gate One server).

    .. js:attribute:: GateOne.terminals[num].playbackFrames <Array()>

        .. code-block:: javascript

            GateOne.terminals[num].playbackFrames = Array();

        This is where Gate One stores the frames of your session so they can be played back on-the-fly.

        .. note:: playbackFrames only gets used if the playback plugin is available.

    .. js:attribute:: GateOne.terminals[num].prevScreen <Array()>

        .. code-block:: javascript

            GateOne.terminals[num].prevScreen = Array(); // Whatever was last in GateOne.terminals[num].screen

        This stores the previous screen array from the last time the terminal was updated.  Gate One's terminal update protocol only sends lines that changed since the last screen was sent.  This variable allows us to create an updated screen from just the line that changed.

    .. js:attribute:: GateOne.terminals[num].rows <number>

        .. code-block:: javascript

            GateOne.terminals[num].rows = GateOne.prefs.rows;

        The number of rows this terminal is configured to use.  Unless the user changed it, it will match whatever is in :js:attr:`GateOne.prefs.rows`.

    .. js:attribute:: GateOne.terminals[num].screen <Array()>

        .. code-block:: javascript

            GateOne.terminals[num].screen = Array();

        This stores the current terminal's screen as an array of lines.

    .. js:attribute:: GateOne.terminals[num].scrollback <Array()>

        .. code-block:: javascript

            GateOne.terminals[num].scrollback = Array();

        Stores the given terminal's scrollback buffer (so we can remove/replace it at-will).

    .. js:attribute:: GateOne.terminals[num].scrollbackVisible <boolean>

        .. code-block:: javascript

            GateOne.terminals[num].scrollbackVisible = true;

        Kept up to date on the current status of whether or not the scrollback buffer is visible in the terminal (so we don't end up replacing it or removing it when we don't have to).

    .. js:attribute:: GateOne.terminals[num].sshConnectString <string>

        .. code-block:: javascript

            GateOne.terminals[num].sshConnectString = "ssh://user@somehost:22"; // Will actually be whatever the user connected to

        If the SSH plugin is enabled, this variable contains the connection string used by the SSH client to connect to the server.

        .. note:: This is a good example of a plugin using :js:attr:`GateOne.terminals` to great effect.

.. js:attribute:: GateOne.Icons

    This is where Gate One stores all of its (inline) SVG icons.  If your plugin has its own icons they can be kept in here.  Here's a (severely shortened) example from the Bookmarks plugin:

    .. code-block:: javascript

        GateOne.Icons['bookmark'] = '<svg xmlns:rdf="blah blah">svg stuff here</svg>';

    For reference, using an existing icon is as easy as:

    .. code-block:: javascript

        someElement.appendChild(GateOne.Icons['close']);

    .. note:: All of Gate One's icons use a linearGradient that has stop points--stop1, stop2, stop3, and stop4--defined in CSS.  This allows the SVG icons to change color with the CSS theme.  If you're writing your own plugin with it's own icon(s) it would be best to use the same stop points.

.. js:attribute:: GateOne.loadedModules

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
            "GateOne.Bookmarks",
            "GateOne.Help",
            "GateOne.Logging",
            "GateOne.Playback",
            "GateOne.SSH"
        ]

.. js:attribute:: GateOne.ws

    Holds Gate One's open WebSocket object.  It can be used to send messages to WebSocket hooks like so:

    .. code-block:: javascript

        GateOne.ws.send(JSON.stringify({'my_plugin_function': {'someparam': true, 'whatever': [1,2,3]}}));

.. _gateone-functions:

Functions
^^^^^^^^^
:js:data:`GateOne` contains two functions: :js:func:`~GateOne.init` and :js:func:`~GateOne.initialize`.  These functions are responsible for setting up Gate One's interface, authenticating the user (if necessary), connecting to the server, (re)loading user preferences, and calling the init() function of each module/plugin:

    .. js:function:: GateOne.init(prefs)

        Sets up preferences, loads the CSS theme/colors, loads JavaScript plugins, and calls :js:func:`~GateOne.initialize`.  Additionally, it will check if the user is authenticated and will force a re-auth if the credentials stored in the encrypted cookie don't check out.

        :param object prefs: An object containing the settings that will be used by Gate One.  See :js:attr:`GateOne.prefs` under :ref:`gateone-properties` for details on what can be set.

        Example:

        .. code-block:: javascript

            GateOne.init({url: 'https://console12.serialconcentrators.mycompany.com/', scheme: 'black'});

    .. js:function:: GateOne.initialize

        Sets up Gate One's graphical elements, connects the WebSocket, and starts Gate One capturing keyboard input.

.. _GateOne.Utils:

GateOne.Utils
-------------
.. js:attribute:: GateOne.Utils

This module consists of a collection of utility functions used throughout Gate One.  Think of it like a mini JavaScript library of useful tools.

Functions
^^^^^^^^^

.. js:function:: GateOne.Utils.init

    Like all plugin init() functions this gets called from :js:func:`GateOne.Utils.postOnLoad` which itself is called at the end of :js:func:`GateOne.initialize`.  It simply attaches the 'save_file' (WebSocket) action to :js:func:`GateOne.Utils.saveAsAction` (in :js:attr:`GateOne.Net.actions`).

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

.. js:function:: GateOne.Utils.getEmDimensions(elem)

    Returns the height and width of 1em inside the given elem (e.g. '#term1_pre').  The returned object will be in the form of:

    .. code-block:: javascript

        {'w': <width in px>, 'h': <height in px>}

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.
    :returns: An object containing the width and height as obj.w and obj.h.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.getEmDimensions('#gateone');
        {'w': 8, 'h': 15}

.. js:function:: GateOne.Utils.getNode(nodeOrSelector)

    Returns a DOM node if given a querySelector-style string or an existing DOM node (will return the node as-is).

    .. note:: The benefit of this over just ``document.querySelector()`` is that if it is given a node it will return the node as-is (so functions can accept both without having to worry about such things).  See :js:func:`~GateOne.Utils.removeElement` below for a good example.

    :param nodeOrSelector: A querySelector string like ``#some_element_id`` or a DOM node.
    :returns: A DOM node or ``null`` if not found.

    Example:

    .. code-block:: javascript

        goDivNode = GateOne.Utils.getNode('#gateone');

        > GateOne.Utils.getEmDimensions('#gateone');
        {'w': 8, 'h': 15}

.. js:function:: GateOne.Utils.getNodes(nodeListOrSelector)

    Given a CSS querySelectorAll-like string (e.g. '.some_class') or `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ (in case we're not sure), lookup the node using ``document.querySelectorAll()`` and return the result (which will be a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_).

    .. note:: The benefit of this over just ``document.querySelectorAll()`` is that if it is given a nodeList it will just return the nodeList as-is (so functions can accept both without having to worry about such things).

    :param nodeListOrSelector: A querySelectorAll string like ``.some_class`` or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.
    :returns: A `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_ or ``[]`` (an empty Array) if not found.

    Example:

    .. code-block:: javascript

        panels = GateOne.Utils.getNodes('#gateone .panel');

.. js:function:: GateOne.Utils.getRowsAndColumns(elem)

    Calculates and returns the number of text rows and colunmns that will fit in the given element (*elem*) as an object like so:

    .. code-block:: javascript

        {'cols': 165, 'rows': 45}

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.
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

.. js:function:: GateOne.Utils.getSelText()

    :returns: The text that is currently highlighted in the browser.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.getSelText();
        "localhost" // Assuming the user had highlighted the word, "localhost"

.. js:function:: GateOne.Utils.getToken()

    This function is a work in progress...  Doesn't do anything right now, but will (likely) eventually return time-based token (based on a random seed provided by the Gate One server) for use in an anti-session-hijacking mechanism.

.. js:function:: GateOne.Utils.hasElementClass(element, className)

    Almost a direct copy of `MochiKit.DOM.hasElementClass <http://mochi.github.com/mochikit/doc/html/MochiKit/DOM.html#fn-haselementclass>`_...  Returns true if *className* is found on *element*. *element* is looked up with :js:func:`~GateOne.Utils.getNode` so querySelector-style identifiers or DOM nodes are acceptable.

    :param element: A querySelector string like ``#some_element_id`` or a DOM node.
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

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.hideElement('#go_icon_newterm');

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

.. js:function:: GateOne.Utils.loadThemeCSS(schemeObj)

    Loads the GateOne CSS theme(s) for the given *schemeObj* which should be in the form of:

    .. code-block:: javascript

        {'theme': 'black'}
        // or:
        {'colors': 'gnome-terminal'}
        // ...or an object containing both:
        {'theme': 'black', 'colors': 'gnome-terminal'}

    If *schemeObj* is not provided, will load the defaults.

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

.. js:function:: GateOne.Utils.postOnLoad

    Called by :js:func:`GateOne.init()`, iterates over the list of plugins in :js:attr:`GateOne.loadedModules` calling the ``init()`` function of each (if present).  When that's done it does the same thing with each respective plugin's ``postInit()`` function.

.. js:function:: GateOne.Utils.randomPrime()

    :returns: A random prime number <= 9 digits.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.randomPrime();
        618690239

.. js:function:: GateOne.Utils.removeElement(elem)

    Removes the given *elem* from the DOM.

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.

    Example:

    .. code-block:: javascript

        GateOne.Utils.removeElement('#go_infocontainer');

.. js:function:: GateOne.Utils.replaceURLWithHTMLLinks(text)

    :returns: *text* with URLs transformed into links.

    Turns textual URLs like 'http://whatever.com/' into links.

    :param string text: Any text with or without links in it (no URLs == no changes)

    Example:

    .. code-block:: javascript

        > GateOne.Utils.replaceURLWithHTMLLinks('Downloading http://foo.bar.com/some/file.zip');
        "Downloading <a href='http://foo.bar.com/some/file.zip'>http://foo.bar.com/some/file.zip</a>"

.. js:function:: GateOne.Utils.saveAs(blob, filename)

    Saves the given *blob* (which must be a proper `Blob <https://developer.mozilla.org/en/DOM/Blob>`_ object with data inside of it) as *filename* (as a file) in the browser.  Just as if you clicked on a link to download it.

    .. note:: This is amazingly handy for downloading files over the WebSocket.

    For reference, this is how to construct a "proper" Blob (assming the file you're saving is just text):

    .. code-block:: javascript

        var bb = new BlobBuilder();
        bb.append(<your data here>);
        var blob = bb.getBlob("text/plain;charset=" + document.characterSet);

.. js:function:: GateOne.Utils.saveAsAction(message)

    .. note:: This function is attached to the 'save_file' WebSocket action (in :js:attr:`GateOne.Net.actions`) via :js:func:`GateOne.Utils.init`.

    Saves to disk the file contained in *message*.  *message* should contain the following:

        * *message['result']* - Either 'Success' or a descriptive error message.
        * *message['filename']* - The name we'll give to the file when we save it.
        * *message['data']* - The content of the file we're saving.
        * *message['mimetype']* - Optional:  The mimetype we'll be instructing the browser to associate with the file (so it will handle it appropriately).  Will default to 'text/plain' if not given.

.. js:function:: GateOne.Utils.savePrefs

    Saves what's set in :js:attr:`GateOne.prefs` to ``localStorage['GateOne.prefs.prefix+prefs']`` as JSON; skipping anything that's set in :js:attr:`GateOne.noSavePrefs`.

.. js:function:: GateOne.Utils.scrollLines(elem, lines)

    Scrolls the given element (*elem*) by the number given in *lines*.  It will automatically determine the line height using :js:func:`~GateOne.Utils.getEmDimensions`.  *lines* can be a positive or negative integer (to scroll down or up, respectively).

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.
    :param number lines: The number of lines to scroll *elem* by.  Can be positive or negative.

    Example:

    .. code-block:: javascript

        GateOne.Utils.scrollLines('#go_term1_pre', -3);

    .. note:: There must be a scrollbar visible (and ``overflow-y = "auto"`` or equivalent) for this to work.

.. js:function:: GateOne.Utils.scrollToBottom(elem)

    Scrolls the given element (*elem*) to the very bottom (all the way down).

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.

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

.. js:function:: GateOne.Utils.showElement(elem)

    Shows the given element (if previously hidden via :js:func:`~GateOne.Utils.hideElement`) by setting ``elem.style.display = 'block'``.

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.

    Example:

    .. code-block:: javascript

        > GateOne.Utils.showElement('#go_icon_newterm');

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

This is where all of Gate One's WebSocket protocol actions are assigned to functions.  This is how they are defined by default:

.. code-block:: javascript

    GateOne.Net.actions = {
    // These are what will get called when the server sends us each respective action
        'log': GateOne.Net.log,
        'ping': GateOne.Net.ping,
        'pong': GateOne.Net.pong,
        'reauthenticate': GateOne.Net.reauthenticate,
        'set_mode': GateOne.Terminal.setMode,
        'terminals': GateOne.Terminal.reattachTerminals,
        'termupdate': GateOne.Terminal.updateTerminal,
        'scroll_up': GateOne.Terminal.scrollUp,
        'term_exists': GateOne.Terminal.reconnectTerminalAction,
        'set_title': GateOne.Visual.setTitle, // NOTE: This actually gets assigned via GateOne.Visual.init()
        'bell': GateOne.Visual.bellAction, // NOTE: Ditto
        'metadata': GateOne.Terminal.storeMetadata
    }

.. note:: Most of the above is added via :js:func:`~GateOne.Net.addAction` inside of each respective plugin's ``init()`` function.

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
.. js:function:: GateOne.Net.addAction(name, func)

    Adds an action to the :js:attr:`GateOne.Net.actions` object.

    :param string name: The name of the action we're going to attach *func* to.
    :param function func: The function to be called when an action arrives over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ matching *name*.

    Example:

    .. code-block:: javascript

        GateOne.Net.addAction('sshjs_connect', GateOne.SSH.handleConnect);

.. js:function:: GateOne.Net.connect()

    Opens a connection to the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_ defined in ``GateOne.prefs.url`` and stores it as :js:attr:`GateOne.ws`.  This function gets called by :js:func:`GateOne.init` and there's really no reason why it should be called directly by anything else.

.. js:function:: GateOne.Net.connectionError()

    Called when there's an error communicating over the `WebSocket <https://developer.mozilla.org/en/WebSockets/WebSockets_reference/WebSocket>`_...  Displays a message to the user indicating there's a problem, logs the error (using ``logError()``), and sets a five-second timeout to attempt reconnecting.

    This function is attached to the WebSocket's ``onclose`` event and shouldn't be called directly.

.. js:function:: GateOne.Net.fullRefresh

    Sends a message to the Gate One server telling it to perform a full screen refresh (i.e. send us the whole thing as opposed to just the difference from the last screen).

.. js:function:: GateOne.Net.killTerminal(term)

    Normally called when the user closes a terminal, it sends a message to the GateOne server telling it to end the process associated with *term*.  Normally this function would not be called directly.  To close a terminal cleanly, plugins should use ``GateOne.Terminal.closeTerminal(term)`` (which calls this function).

    :param number term: The termimal number that should be killed on the server side of things.

.. js:function:: GateOne.Net.log(msg)

    This function can be used in debugging `~GateOne.Net.actions`; it logs whatever message is received from the Gate One server: ``GateOne.Logging.logInfo(msg)`` (which would equate to console.log under most circumstances).

    :param string msg: The message received from the Gate One server.

    When developing a new action, you can test out or debug your server-side messages by attaching the respective action to :js:func:`GateOne.Net.log` like so:

    .. code-block:: javascript

        GateOne.Net.addAction('my_action', GateOne.Net.log);

    Then you can view the exact messages received by the client in the JavaScript console in your browser.

.. js:function:: GateOne.Net.onOpen

    This gets attached to :js:attr:`GateOne.ws.onopen` inside of :js:func:`~GateOne.Net.connect`.  It clears any error message that might be displayed to the user, loads the go_process.js Web Worker, and sends an authentication message to the server along with the dimensions of the terminal(s).

    Also, if :js:attr:`GateOne.prefs.autoConnectURL` is set :js:func:`~GateOne.Net.onOpen` will send that value to the server immediately after the connection is established.

.. js:function:: GateOne.Net.onMessage(event)

    This gets attached to :js:attr:`GateOne.ws.onmessage` inside of :js:func:`~GateOne.Net.connect`.  It takes care of decoding (`JSON <https://developer.mozilla.org/en/JSON>`_) messages sent from the server and calling any matching :js:attr:`~GateOne.Net.actions`.  If no matching action can be found inside ``event.data`` it will fall back to passing the message directly to :js:func:`GateOne.Visual.displayMessage`.

.. js:function:: GateOne.Net.ping

    Sends a ping to the server with a client-generated timestamp attached. The expectation is that the server will return a 'pong' respose with the timestamp as-is so we can measure the round-trip time.

    .. code-block:: javascript

        > GateOne.Net.ping();
        2011-10-09 21:13:08 INFO PONG: Gate One server round-trip latency: 2ms

    .. note:: That response was actually logged by :js:func:`~GateOne.Net.pong` below.

.. js:function:: GateOne.Net.pong(timestamp)

    Simply logs *timestamp* using :js:func:`GateOne.Logging.logInfo` and includes a measurement of the round-trip time in milliseconds.

    :param timestamp: Expected to be the output of ``new Date().toISOString()`` (as generated by :js:func:`~GateOne.Net.ping`).

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

    Sends the current dimensions of *term* to the Gate One server.  Typically used when the user resizes their browser window.

    .. code-block:: javascript

        GateOne.Net.sendDimensions();

    .. note:: Right now the optional *term* argument isn't used but it will be once we start supporting individual terminal dimensions (as opposed to a global rows/cols setting).

.. _GateOne.Net.setTerminal:
.. js:function:: GateOne.Net.setTerminal(term)

    Tells the Gate One server which is our active terminal and sets ``localStorage['selectedTerminal'] = *term*``.

    .. code-block:: javascript

        GateOne.Net.setTerminal(1);

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
.. js:function:: GateOne.Input.bufferEscSeq(chars)

    Prepends an ESC character to *chars* and adds it to the :js:attr:`~GateOne.Input.charBuffer`

    .. code-block:: javascript

        // This would send the same as the up arrow key:
        GateOne.Input.bufferEscSeq("[A") // Would end up as ^[[A

.. js:function:: GateOne.Input.capture()

    Sets the browser's focus to :js:attr:`GateOne.prefs.goDiv` and enables the capture of keyboard and mouse events.

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

    Typically called by :js:func:`GateOne.prefs.onKeyDown`, converts a keyboard event (*e*) into a string.  The difference between this function and :js:func:`emulateKey` is that this funcion handles key combinations that include non-shift modifiers (Ctrl, Alt, and Meta).

    :param event e: The JavaScript event that the function is handling (coming from :js:attr:`GateOne.prefs.goDiv.onkeydown`).

.. js:function:: GateOne.Input.key(e)

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

    :param event e: A JavaScript key event.

.. js:function:: GateOne.Input.modifiers(e)

    Like :js:func:`GateOne.Input.key`, this function returns a well-formed object for a fairly standard JavaScript event.  This object looks like so:

    .. code-block:: javascript

        {
            shift: false,
            alt: false,
            ctrl: false,
            meta: false
        }

    Since some browsers (i.e. Chrome) don't register the 'meta' key (aka "the Windows key") as a proper modifier, :js:func:`~GateOne.Input.modifiers` will emulate it by examining the :js:attr:`GateOne.Input.metaHeld` property.  The state of the meta key is tracked via :js:attr:`GateOne.Input.metaHeld` by way of the :js:func:`GateOne.Input.onKeyDown` and :js:func:`GateOne.Input.onKeyUp` functions.

    :param event e: A JavaScript key event.

.. js:function:: GateOne.Input.mouse(e)

    Just like :js:func:`GateOne.Input.key` and :js:func:`GateOne.Input.modifiers`, this function returns a well-formed object for a fairly standard JavaScript event:

    .. code-block:: javascript

        {
            type:   <event type>, // Just preserves it
            left:   <true/false>,
            right:  <true/false>,
            middle: <true/false>,
        }

    Very convient for figuring out which mouse button was pressed on any given mouse event.

    :param event e: A JavaScript mouse event.

.. js:function:: GateOne.Input.onKeyDown(e)

    This function gets attached to :js:attr:`GateOne.prefs.goDiv.onkeydown` by way of :js:func:`GateOne.Input.capture`.  It keeps track of the state of the meta key (see :js:func:`~GateOne.Input.modifiers` above), executes any matching keyboard shortcuts defined in :js:attr:`GateOne.Input.shortcuts`, and calls :js:func:`GateOne.Input.emulateKey` or :js:func:`GateOne.Input.emulateKeyCombo` depending on which (if any) modifiers were held during the keystroke event.

    :param event e: A JavaScript key event.

.. js:function:: GateOne.Input.onKeyUp(e)

    This function gets attached to :js:attr:`GateOne.prefs.goDiv.onkeyup` by way of :js:func:`GateOne.Input.capture`.  It is used in conjunction with :js:func:`GateOne.Input.modifiers` and :js:func:`GateOne.Input.onKeyDown` to emulate the meta key modifier using KEY_WINDOWS_LEFT and KEY_WINDOWS_RIGHT since "meta" doesn't work as an actual modifier on some browsers/platforms.

    :param event e: A JavaScript key event.

.. js:function:: GateOne.Input.queue(text)

    Adds *text* to :js:attr:`GateOne.Input.charBuffer`.

    :param string text: The text to be added to the :attr:`~GateOne.Input.charBuffer`.

.. js:function:: GateOne.Input.registerShortcut(keyString, shortcutObj)

    Registers the given *shortcutObj* for the given *keyString* by adding a new object to :js:attr:`GateOne.Input.shortcuts`.  Here's an example:

    .. code-block:: javascript

        GateOne.Input.registerShortcut('KEY_ARROW_LEFT', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Visual.slideLeft()'});

    .. note:: The 'action' is a string that gets invoked via eval().  This allows plugin authors to register shortcuts that call objects and functions that may not have been available at the time they were registered.

    :param string keyString: The KEY_<key> that will invoke this shortcut.
    :param object shortcutObj: A JavaScript object containing two properties:  'modifiers' and 'action'.  See above for their format.

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
.. tip:: In most of Gate One's JavaScript, *term* refers to the terminal number (e.g. 1).

.. js:function:: GateOne.Visual.addSquare(squareName)

    Called by :js:func:`~GateOne.Visual.createGrid()`; creates a terminal div and appends it to ``GateOne.Visual.squares`` (which is just a temporary holding space).  Probably not useful for anything else.

    .. note:: In fact, this function would only ever get called if you were debugging the grid...  You'd call :js:func:`~GateOne.Visual.createGrid()` with, say, an Array containing a dozen pre-determined terminal names as the second argument.  This would save you the trouble of opening a dozen terminals by hand.

    :param string squareName: The name of the "square" to be added to the grid.

.. js:function:: GateOne.Visual.applyStyle(elem, style)

    A convenience function that allows us to apply multiple style changes in one go.  For example:

    .. code-block:: javascript

        GateOne.Visual.applyStyle('#somediv', {'opacity': 0.5, 'color': 'black'});

    :param elem: A querySelector string like ``#some_element_id`` or a DOM node.
    :param style: A JavaScript object holding the style that will be applied to *elem*.

.. js:function:: GateOne.Visual.applyTransform(obj, transform)

    This function is Gate One's bread and butter:  It applies the given CSS3 *transform* to *obj*.  *obj* can be one of the following:

        * A querySelector-like string (e.g. "#some_element_id").
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

    :param obj: A querySelector string like ``#some_element_id``, a DOM node, an `Array <https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array>`_ of DOM nodes, an `HTMLCollection <https://developer.mozilla.org/en/DOM/HTMLCollection>`_, or a `NodeList <https://developer.mozilla.org/En/DOM/NodeList>`_.
    :param transform: A `CSS3 transform <http://www.w3schools.com/cssref/css3_pr_transform.asp>`_ function such as ``scale()`` or ``translate()``.

.. js:function:: GateOne.Visual.bellAction(bellObj)

    .. figure:: screenshots/gateone_bellaction.png
        :class: portional-screenshot
        :align: right

    Plays a bell sound and pops up a message indiciating which terminal the bell came from (visual bell is always enabled).  If ``GateOne.prefs.bellSound == false`` only thwe visual indicator will be displayed.

    .. note:: This takes a JavaScript object (*bellObj*) as an argument because it is meant to be registered as an action in :js:attr:`GateOne.Net.actions` as it is the Gate One server that tells us when a bell has been encountered.

    The format of *bellObj* is as simple as can be: ``{'term': 1}``.
    The bell sound will be whatever ``<source>`` is attached to an ``<audio>`` tag with ID ``#bell``.  By default, Gate One's index.html template includes a such an ``<audio>`` tag with a `data:URI <http://en.wikipedia.org/wiki/Data_URI_scheme>`_ as the ``<source>`` that gets created from '<gateone dir>/static/bell.ogg'.

    .. code-block:: javascript

        GateOne.Visual.bellAction({'term': 1}); // This is how it is called

    :param object bellObj: A JavaScript object containing one attribute: {'term': <num>}.

    .. note:: Why is the visual bell always enabled?  Without a visual indicator, if you had more than one terminal open it would be impossible to tell which terminal the bell came from.

.. js:function:: GateOne.Visual.createGrid(id[, terminalNames])

    Creates a container for housing terminals and optionally, pre-creates them using *terminalNames* (useful in debugging).  The container will be laid out in a 2x2 grid.

    .. code-block:: javascript

        GateOne.Visual.createGrid("#"+GateOne.prefs.prefix+"termwrapper");

    :param id: The name that will be given to the resulting grid.  e.g. <div id="*id*"></div>
    :param style: An array of DOM IDs (e.g. ["term1", "term2"]).

    .. note:: Work is being done to replace the usage of the grid with more abiguous functions in order to make it possible for plugins to override the default behavior to, say, have a 4x4 grid.  Or use some other terminal-switching mechanism/layout altogether (cube, anyone? =).  Will probably be available in Gate One v1.5 since it is merely time consuming to replace a zillion function calls with a wrapper.

.. js:function:: GateOne.Visual.disableScrollback([term])

    Replaces the contents of *term* with just the visible screen (i.e. no scrollback buffer).  This makes terminal manipulations considerably faster since the browser doesn't have to reflow as much text.  If no *term* is given, replace the contents of *all* terminals with just their visible screens.

    While this function itself causes a reflow, it is still a good idea to call it just before performing a manipulation of the DOM since the presence of scrollbars really slows down certain CSS3 transformations.  Just don't forget to cancel :js:data:`GateOne.terminals[term]['scrollbackTimer']` or any effects underway might get very choppy right in the middle of execution.

    .. code-block:: javascript

        GateOne.Visual.disableScrollback(1);

    :param number term: The terminal number to disable scrollback.

    .. note:: A convenience function for enabling/disabling the scrollback buffer is available: :js:func:`GateOne.Visual.toggleScrollback()` (detailed below).

.. js:function:: GateOne.Visual.displayMessage(message[, timeout[, removeTimeout[, id]]])

    .. figure:: screenshots/gateone_displaymessage.png
        :class: portional-screenshot
        :align: right

    Displays *message* to the user via a transient pop-up DIV that will appear inside :js:attr:`GateOne.prefs.goDiv`.  How long the message lasts can be controlled via *timeout* and *removeTimeout* (which default to 1000 and 5000, respectively).

    If *id* is given, it will be prefixed with :js:attr:`GateOne.prefs.prefix` and used as the DIV ID for the pop-up.  i.e. ``GateOne.prefs.prefix+id``.  The default is ``GateOne.prefs.prefix+"notice"``.

    .. code-block:: javascript

        GateOne.Visual.displayMessage('This is a test.');

    :param string message: The message to display.
    :param integer timeout: Milliseconds; How long to display the message before starting the *removeTimeout* timer.  **Default:** 1000.
    :param integer removeTimeout: Milliseconds; How long to delay before calling :js:func:`GateOne.Utils.removeElement` on the message DIV.  **Default:** 5000.
    :param string id: The ID to assign the message DIV.  **Default:** "notice".

    .. note:: The default is to display the message in the lower-right corner of :js:attr:`GateOne.prefs.goDiv` but this can be controlled via CSS.

.. js:function:: GateOne.Visual.displayTermInfo(term)

    .. figure:: screenshots/gateone_displayterminfo.png
        :class: portional-screenshot
        :align: right

    Displays the terminal number and terminal title of the given *term* via a transient pop-up DIV that starts fading away after one second.

    .. code-block:: javascript

        GateOne.Visual.displayTermInfo(1);

    :param number term: The terminal number to display info for.

    .. note:: Like :js:func:`~GateOne.Visual.displayMessage()`, the location and effect of the pop-up can be controlled via CSS.  The DIV ID will be ``GateOne.prefs.prefix+'infocontainer'``.

.. js:function:: GateOne.Visual.enableScrollback([term])

    Replaces the contents of *term* with the visible scren + scrollback buffer.  Use this to restore scrollback after calling :js:func:`~GateOne.Visual.disableScrollback()`.  If no *term* is given, re-enable the scrollback buffer in *all* terminals.

    .. code-block:: javascript

        GateOne.Visual.enableScrollback(1);

    :param number term: The terminal number to enable scrollback.

    .. note:: A convenience function for enabling/disabling the scrollback buffer is available: :js:func:`GateOne.Visual.toggleScrollback()` (detailed below).

.. js:function:: GateOne.Visual.init()

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

.. js:function:: GateOne.Visual.setTitleAction(titleObj)

    Given that *titleObj* is a JavaScript object such as, ``{'term': 1, 'title': "user@host:~"}``, sets the title of the terminal provided by *titleObj['term']* to *titleObj['title']*.  This function is meant to be attached to :js:attr:`GateOne.Net.actions` (which gets taken care of in :js:func:`GateOne.Visual.init()`).

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

    Grid specific: Slides the view to *term*.  If *changeSelected* is true, this will also set the current terminal to the one we're sliding to.

    .. code-block:: javascript

        GateOne.Visual.slideToTerm(1, true);

    :param number term: The terminal number to slide to.
    :param boolean changeSelected: If true, set the current terminal to *term*.

    .. note:: Generally speaking, you'll want *changeSelected* to always be true.

.. js:function:: GateOne.Visual.slideUp()

    Grid specific: Slides the view upward one terminal by pushing all the others down.

    .. code-block:: javascript

        GateOne.Visual.slideUp();

.. js:function:: GateOne.Visual.toggleGridView([goBack])

    Brings up the terminal grid view (by scaling all the terminals to 50%) or returns to a single, full-size terminal.
    If *goBack* is true (the default), go back to the previously-selected terminal when un-toggling the grid view.  This argument is primarily meant for use internally within the function when assigning onclick events to each downsized terminal.

    .. code-block:: javascript

        GateOne.Visual.toggleGridView();

    :param boolean goBack: If false, will not switch to the previously-selected terminal when un-toggling the grid view (i.e. sliding to a specific terminal will be taken care of via other means).

.. js:function:: GateOne.Visual.togglePanel([panel])

    Toggles the given *panel* in or out of view.  *panel* is expected to be the ID of an element with the `GateOne.prefs.prefix+"panel"` class.
    If *panel* is null or false, all open panels will be toggled out of view.

    .. code-block:: javascript

        GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_bookmarks');

    :param string panel: A querySelector-like string ID or the DOM node of the panel we're toggling.

.. js:function:: GateOne.Visual.toggleScrollback()

    Toggles the scrollback buffer for all terminals by calling :js:func:`GateOne.Visual.disableScrollback` or :js:func:`GateOne.Visual.enableScrollback` depending on the state of the toggle.

    .. code-block:: javascript

        GateOne.Visual.toggleScrollback();

.. js:function:: GateOne.Visual.updateDimensions()

    Sets :js:attr:`GateOne.Visual.goDimensions` to the current width/height of :js:attr:`GateOne.prefs.goDiv`.  Typically called when the browser window is resized.

    .. code-block:: javascript

        GateOne.Visual.updateDimensions();

GateOne.Terminal
----------------
.. js:attribute:: GateOne.Terminal

GateOne.Terminal contains terminal-specific properties and functions.  Really, there's not much more to it than that :)

Properties
^^^^^^^^^^
.. js:attribute:: GateOne.Terminal.closeTermCallbacks

    If a plugin wants to perform an action whenever a terminal is closed it can register a callback here like so:

    .. code-block:: javascript

        GateOne.Terminal.closeTermCallbacks.push(GateOne.MyPlugin.termClosed);

    All callbacks in :js:attr:`~GateOne.Terminal.closeTermCallbacks` will be called whenever a terminal is closed with the terminal number as the only argument.

.. js:attribute:: GateOne.Terminal.modes

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

    If a plugin wants to perform an action whenever a terminal is opened it can register a callback here like so:

    .. code-block:: javascript

        GateOne.Terminal.closeTermCallbacks.push(GateOne.MyPlugin.termOpened);

    All callbacks in :js:attr:`~GateOne.Terminal.newTermCallbacks` will be called whenever a new terminal is opened with the terminal number as the only argument.

.. js:attribute:: GateOne.Terminal.termUpdatesWorker

    This is a Web Worker (go_process.js) that is used by :js:func:`GateOne.Terminal.updateTerminalAction` to process the text received from the Gate One server.  This allows things like linkifying text to take place asynchronously so it doesn't lock or slow down your browser while the CPU does its work.

Functions
^^^^^^^^^
.. js:function:: GateOne.Terminal.closeTerminal(term)

    Closes the given *term* and tells the Gate One server to end its running process.

    .. code-block:: javascript

        GateOne.Terminal.closeTerm(2);

    :param number term: The terminal that will be closed.

.. js:function:: GateOne.Terminal.init()

    Creates the terminal information panel, initializes the terminal updates Web Worker (which is contained in go_process.js), and registers two keyboard shortcuts:

    ================================================================ ====================
    Function                                                         Shortcut
    ================================================================ ====================
    GateOne.Terminal.newTerminal()                                   :kbd:`Control-Alt-N`
    GateOne.Terminal.closeTerminal(localStorage["selectedTerminal"]) :kbd:`Control-Alt-W`
    ================================================================ ====================

.. js:function:: GateOne.Terminal.newTerminal(term)

    Creates a new terminal and gets it updating itself by way of the Gate One server.

    .. code-block:: javascript

        GateOne.Terminal.newTerminal();

    :param number term: Optional: When the new terminal is created, it will be assigned this number.

.. js:function:: GateOne.Terminal.notifyActivity(term)

    Notifies the user when there's activity in *term* by displaying a message and playing the bell.

    .. code-block:: javascript

        GateOne.Terminal.notifyActivity(1);

    :param number term: The terminal that activity was detected in.

    .. note:: You wouldn't normally call this function directly.  It is meant to be called from :js:func:`GateOne.Terminal.updateTerminal` when the right conditions are met.

.. js:function:: GateOne.Terminal.notifyInactivity(term)

    Notifies the user when the inactivity timeout in *term* has been reached by displaying a message and playing the bell.

    .. code-block:: javascript

        GateOne.Terminal.notifyInactivity(1);

    :param number term: The terminal that inactivity was detected in.

    .. note:: You wouldn't normally call this function directly.  It is meant to be called from :js:func:`GateOne.Terminal.updateTerminal` when the right conditions are met.

.. js:function:: GateOne.Terminal.reattachTerminalsAction(terminals)

    This function gets attached to the 'terminals' action in :js:attr:`GateOne.Net.actions` and gets called after we authenticate with the Gate One server (the server is what tells us to call this function).  The *terminals* argument is expected to be an Array (aka Python list) of terminal numbers that are currently running on the Gate One server.

    If no terminals currently exist (we received an empty Array), :js:func:`GateOne.Terminal.newTerminal()` will be called to create a new one.

    :param array terminals: An Array of terminal numbers we're reattaching.

.. js:function:: GateOne.Terminal.reconnectTerminalAction(term)

    This function gets attached to the 'term_exists' action in :js:attr:`GateOne.Net.actions` and gets called when the server reports that the terminal number supplied via 'new_terminal' already exists.  It doesn't actually do anything right now but there might be use case for catching this condition in the future.

    :param number term: The terminal number that already exists on the server.

.. js:function:: GateOne.Terminal.setModeAction(modeObj)

    This function gets attached to the 'set_mode' action in :js:attr:`GateOne.Net.actions` and gets called when the server encounters either a "set expanded mode" or "reset expanded mode" escape sequence.  Essentially, it uses the values provided by *modeObj* to call ``GateOne.Net.actions[modeObj['mode']](modeObj['term'], modeObj['boolean'])``.

    :param object modeObj: An object in the form of ``{'mode': setting, 'boolean': True, 'term': term}``

    .. seealso:: :js:attr:`GateOne.Terminal.modes`.

.. js:function:: GateOne.Terminal.updateTerminalAction(termObj)

    This function gets attached to the 'termupdate' action in :js:attr:`GateOne.Net.actions` and gets called when a terminal has been modified on the server.  The *termObj* that the this function will receive from the Gate One server will look like this:

    .. code-block:: javascript

        {
            'term': term,
            'scrollback': scrollback,
            'screen' : screen,
            'ratelimiter': multiplexer.ratelimiter_engaged
        }

    *term* will be the number of the terminal that is being updated.
    *scrollback* will be an Array of lines of scrollback that the server has preserved for us (in the event that the screen scrolled text faster than we could send it to the client).
    *screen* will be an Array of HTML-formatted lines representing the updated terminal.
    *ratelimiter* will be a boolean value representing whether or not the rate limiter has been engaged (if the program running on this terminal is updating the screen too fast).

    :param object termObj: An object that contains the terminal number ('term'), the 'scrollback' buffer, the terminal 'screen', and a boolean idicating whether or not the rate limiter has been engaged ('ratelimiter').