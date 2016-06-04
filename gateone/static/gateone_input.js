GateOne.Base.superSandbox("GateOne.Input", /* Dependencies -->*/["GateOne.Visual"], function(window, undefined) {
"use strict";

var document = window.document,
    hidden, visibilityChange,
    go = GateOne,
    prefix = go.prefs.prefix,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    I, // Will become GateOne.Input
    S = go.Storage,
    gettext = GateOne.i18n.gettext,
    urlObj = (window.URL || window.webkitURL),
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

I = GateOne.Base.module(GateOne, "Input", '1.2', ['Base', 'Utils']);
// GateOne.Input.charBuffer = []; // Queue for sending characters to the server
I.metaHeld = false; // Used to emulate the "meta" modifier since some browsers/platforms don't get it right.
I.shortcuts = {}; // Shortcuts added via registerShortcut() wind up here.
I.globalShortcuts = {}; // Global shortcuts added via registerGlobalShortcut() wind up here.
I.handledGlobal = false; // Used to detect when a global shortcut needs to override a local (regular) one.
GateOne.Base.update(GateOne.Input, {
    /**:GateOne.Input

    GateOne.Input is in charge of all keyboard input as well as copy & paste stuff and touch events.
    */
    init: function() {
        /**:GateOne.Input.init()
        Attaches our global keydown/keyup events and touch events
        */
        // Attach our global shortcut handler to window
        window.addEventListener('keydown', go.Input.onGlobalKeyDown, true);
        window.addEventListener('keyup', go.Input.onGlobalKeyUp, true);
        go.node.addEventListener('keydown', go.Input.onKeyDown, true);
        go.node.addEventListener('keyup', go.Input.onKeyUp, true);
        // Add some useful touchscreen events (temporarily disabled since they aren't working in all situations yet)
//         if ('ontouchstart' in document.documentElement) { // Touch-enabled devices only
//             v.displayMessage("Touch screen detected:<br>Swipe left/right/up/down to switch workspaces.");
// //             var style = window.getComputedStyle(go.node, null);
//             go.node.addEventListener('touchstart', function(e) {
// //                 v.displayMessage("touchstart");
//                 var touch = e.touches[0];
//                 go.Input.touchstartX = touch.pageX;
//                 go.Input.touchstartY = touch.pageY;
//             }, true);
//             go.node.addEventListener('touchmove', function(e) {
// //                 v.displayMessage("touchmove");
//                 var touch = e.touches[0];
//                 if (touch.pageX < go.Input.touchstartX && (go.Input.touchstartX - touch.pageX) > 20) {
//                     v.slideRight();
//                 } else if (touch.pageX > go.Input.touchstartX && (touch.pageX - go.Input.touchstartX) > 20) {
//                     v.slideLeft();
//                 } else if (touch.pageY < go.Input.touchstartY && (go.Input.touchstartY - touch.pageY) > 20) {
//                     v.slideDown();
//                 } else if (touch.pageY > go.Input.touchstartY && (touch.pageY - go.Input.touchstartY) > 20) {
//                     v.slideUp();
//                 }
//                 e.preventDefault();
//             }, true);
//         }
    },
    modifiers: function(e) {
        /**:GateOne.Input.modifiers(e)

        Given an event object, returns an object representing the state of all modifier keys that were held during the event:

        .. code-block:: javascript

            {
                altgr: boolean,
                shift: boolean,
                alt:   boolean,
                ctrl:  boolean,
                meta:  boolean
            }
        */
        var out = {
            altgr: false,
            shift: false,
            alt: false,
            ctrl: false,
            meta: false
        };
        if (e.altGraph) out.altgr = true;
        if (e.altKey) out.alt = true;
        if (e.shiftKey) out.shift = true;
        if (e.ctrlKey) out.ctrl = true;
        if (e.metaKey) out.meta = true;
        // Only emulate the meta modifier if it isn't working
        if (out.meta == false && I.metaHeld) {
            // Gotta emulate it
            out.meta = true;
        }
        return out;
    },
    // TODO: See if we can better differentiate between the left and right versions of modifiers
    specialKeysCode: { // Note: Copied from MochiKit.Signal
    // Also note:  This lookup table is expanded further on in the code
        0: { // DOM_KEY_LOCATION_STANDARD
            8: 'KEY_BACKSPACE',
            9: 'KEY_TAB',
            12: 'KEY_NUM_PAD_CLEAR', // weird, for Safari and Mac FF only
            13: 'KEY_ENTER',
            16: 'KEY_SHIFT',
            17: 'KEY_CTRL',
            18: 'KEY_ALT',
            19: 'KEY_PAUSE',
            20: 'KEY_CAPS_LOCK',
            27: 'KEY_ESCAPE',
            32: 'KEY_SPACEBAR',
            33: 'KEY_PAGE_UP',
            34: 'KEY_PAGE_DOWN',
            35: 'KEY_END',
            36: 'KEY_HOME',
            37: 'KEY_ARROW_LEFT',
            38: 'KEY_ARROW_UP',
            39: 'KEY_ARROW_RIGHT',
            40: 'KEY_ARROW_DOWN',
            42: 'KEY_PRINT_SCREEN', // Might actually be the code for F13
            44: 'KEY_PRINT_SCREEN',
            45: 'KEY_INSERT',
            46: 'KEY_DELETE',
            59: 'KEY_SEMICOLON', // weird, for Safari and IE only
            61: 'KEY_EQUALS_SIGN', // Strange: In Firefox this is 61, in Chrome it is 187
            91: 'KEY_WINDOWS_LEFT',
            92: 'KEY_WINDOWS_RIGHT',
            93: 'KEY_SELECT',
            106: 'KEY_NUM_PAD_ASTERISK',
            107: 'KEY_NUM_PAD_PLUS_SIGN',
            109: 'KEY_NUM_PAD_HYPHEN-MINUS', // Strange: Firefox has this the regular hyphen key (i.e. not the one on the num pad)
            110: 'KEY_NUM_PAD_FULL_STOP',
            111: 'KEY_NUM_PAD_SOLIDUS',
            123: 'KEY_LEFT_CURLY_BRACKET',
            125: 'KEY_RIGHT_CURLY_BRACKET',
            144: 'KEY_NUM_LOCK',
            145: 'KEY_SCROLL_LOCK',
            173: 'KEY_HYPHEN-MINUS', // No idea why Firefox uses this keycode instead of 189
            174: 'KEY_MEDIA_VOLUME_DOWN',
            175: 'KEY_MEDIA_VOLUME_UP',
            177: 'KEY_MEDIA_PREVIOUS_TRACK',
            179: 'KEY_MEDIA_PLAY_PAUSE',
            186: 'KEY_SEMICOLON',
            187: 'KEY_EQUALS_SIGN',
            188: 'KEY_COMMA',
            189: 'KEY_HYPHEN-MINUS',
            190: 'KEY_FULL_STOP',
            191: 'KEY_SOLIDUS',
            192: 'KEY_GRAVE_ACCENT',
            219: 'KEY_LEFT_SQUARE_BRACKET',
            220: 'KEY_REVERSE_SOLIDUS',
            221: 'KEY_RIGHT_SQUARE_BRACKET',
            222: 'KEY_APOSTROPHE',
            225: 'KEY_ALT_GRAPH',
            229: 'KEY_COMPOSE', // NOTE: Firefox doesn't register a key code for the compose key!
        // undefined: 'KEY_UNKNOWN'
        },
        // Sigh, I wish browsers actually implemented these two:
//         1: {}, // DOM_KEY_LOCATION_LEFT
//         2: {}, // DOM_KEY_LOCATION_RIGHT
        3: { // DOM_KEY_LOCATION_NUMPAD
            12: 'KEY_NUM_PAD_CLEAR',
            13: 'KEY_NUM_PAD_ENTER',
            33: 'KEY_NUM_PAD_PAGE_UP',
            34: 'KEY_NUM_PAD_PAGE_DOWN',
            35: 'KEY_NUM_PAD_END',
            36: 'KEY_NUM_PAD_HOME',
            37: 'KEY_NUM_PAD_LEFT',
            38: 'KEY_NUM_PAD_UP',
            39: 'KEY_NUM_PAD_RIGHT',
            40: 'KEY_NUM_PAD_DOWN',
            45: 'KEY_NUM_PAD_INSERT',
            46: 'KEY_NUM_PAD_DECIMAL',
            96: 'KEY_NUM_PAD_0',
            97: 'KEY_NUM_PAD_1',
            98: 'KEY_NUM_PAD_2',
            99: 'KEY_NUM_PAD_3',
            100: 'KEY_NUM_PAD_4',
            101: 'KEY_NUM_PAD_5',
            102: 'KEY_NUM_PAD_6',
            103: 'KEY_NUM_PAD_7',
            104: 'KEY_NUM_PAD_8',
            105: 'KEY_NUM_PAD_9',
            109: 'KEY_NUM_PAD_HYPHEN-MINUS',
            106: 'KEY_NUM_PAD_ASTERISK',
            111: 'KEY_NUM_PAD_SLASH',
        }
    },
    specialKeys: {
        0: { // DOM_KEY_LOCATION_STANDARD
            'Backspace': 'KEY_BACKSPACE',
            'Tab': 'KEY_TAB',
            'Enter': 'KEY_ENTER',
            'ShiftLeft': 'KEY_SHIFT',
            'ShiftRight': 'KEY_SHIFT',
            'Shift': 'KEY_SHIFT',
            'ControlLeft': 'KEY_CTRL',
            'ControlRight': 'KEY_CTRL',
            'Control': 'KEY_CTRL',
            'AltLeft': 'KEY_ALT',
            'AltRight': 'KEY_ALT',
            'Alt': 'KEY_ALT',
            'Pause': 'KEY_PAUSE',
            'CapsLock': 'KEY_CAPS_LOCK',
            'Escape': 'KEY_ESCAPE',
            'Space': 'KEY_SPACEBAR',
            'PageUp': 'KEY_PAGE_UP',
            'PageDown': 'KEY_PAGE_DOWN',
            'End': 'KEY_END',
            'Home': 'KEY_HOME',
            'ArrowLeft': 'KEY_ARROW_LEFT',
            'Left': 'KEY_ARROW_LEFT',
            'ArrowUp': 'KEY_ARROW_UP',
            'Up': 'KEY_ARROW_UP',
            'ArrowRight': 'KEY_ARROW_RIGHT',
            'Right': 'KEY_ARROW_RIGHT',
            'ArrowDown': 'KEY_ARROW_DOWN',
            'Down' : 'KEY_ARROW_DOWN',
            'PrintScreen': 'KEY_PRINT_SCREEN',
            'Insert': 'KEY_INSERT',
            'Delete': 'KEY_DELETE',
            'Semicolon': 'KEY_SEMICOLON', // weird, for Safari and IE only
            'Equal': 'KEY_EQUALS_SIGN', // Strange: In Firefox this is 61, in Chrome it is 187
            'OSLeft': 'KEY_WINDOWS_LEFT',
            'OSRight': 'KEY_WINDOWS_RIGHT',
            'OS': 'KEY_WINDOWS_LEFT',
            'Select': 'KEY_SELECT',
            'NumLock': 'KEY_NUM_LOCK',
            'ScrollLock': 'KEY_SCROLL_LOCK',
            'VolumeDown': 'KEY_MEDIA_VOLUME_DOWN',
            'VolumeUp': 'KEY_MEDIA_VOLUME_UP',
            'MediaTrackPrevious': 'KEY_MEDIA_PREVIOUS_TRACK',
            'MediaPlayPause': 'KEY_MEDIA_PLAY_PAUSE',
            'Comma': 'KEY_COMMA',
            'Subtract': 'KEY_HYPHEN-MINUS',
            'Period': 'KEY_FULL_STOP',
            'Slash': 'KEY_SOLIDUS',
            'Backquote': 'KEY_GRAVE_ACCENT',
            'BracketLeft': 'KEY_LEFT_SQUARE_BRACKET',
            // For some reason Firefox doesn't provide special names for the brackets:
            '[': 'KEY_LEFT_SQUARE_BRACKET',
            'Backslash': 'KEY_REVERSE_SOLIDUS',
            'BracketRight': 'KEY_RIGHT_SQUARE_BRACKET',
            ']': 'KEY_RIGHT_SQUARE_BRACKET',
            'Quote': 'KEY_APOSTROPHE',
            'AltGraph': 'KEY_ALT_GRAPH',
            'Compose': 'KEY_COMPOSE'
        },
        // Sigh, I wish browsers actually implemented these two:
        3: { // DOM_KEY_LOCATION_NUMPAD
            'NumpadMultiply': 'KEY_NUM_PAD_ASTERISK',
            'NumpadAdd': 'KEY_NUM_PAD_PLUS_SIGN',
            'NumpadSubtract': 'KEY_NUM_PAD_HYPHEN-MINUS', // Strange: Firefox has this the regular hyphen key (i.e. not the one on the num pad)
            'NumpadDecimal': 'KEY_NUM_PAD_FULL_STOP',
            'Slash': 'KEY_NUM_PAD_SOLIDUS',
        }
    },
    specialMacKeysCode: { // Note: Copied from MochiKit.Signal
        3: 'KEY_ENTER',
        63289: 'KEY_NUM_PAD_CLEAR',
        63276: 'KEY_PAGE_UP',
        63277: 'KEY_PAGE_DOWN',
        63275: 'KEY_END',
        63273: 'KEY_HOME',
        63234: 'KEY_ARROW_LEFT',
        63232: 'KEY_ARROW_UP',
        63235: 'KEY_ARROW_RIGHT',
        63233: 'KEY_ARROW_DOWN',
        63302: 'KEY_INSERT',
        63272: 'KEY_DELETE'
    },
    // TODO: Get this returning the new KeyboardEvent.code instead of the charCode (for key.code)
    key: function(e) {
        /**:GateOne.Input.key(e)

        Given an event object, returns an object:

        .. code-block:: javascript

            {
                type: e.type, // Just preserves it
                location: e.location, // Also preserves it
                code: key_code, // Tries event.code before falling back to event.keyCode
                string: 'KEY_<key string>'
            }
        */
        var specialKeys,
            k = {
                type: e.type,
                location: (e.location || e.keyLocation || 0)
            };
        specialKeys = I.specialKeys[k.location] || I.specialKeys[0];
        if (e.key) { // DOM3 FTW!  This works regardless of the event type.  How awesome is that?!?  :)
            k.code = e.key.charCodeAt(0);
            k.string = specialKeys[e.key] || e.key || 'KEY_UNKNOWN';
            return k;
        }
        specialKeys = I.specialKeysCode[k.location] || I.specialKeysCode[0];
        if (e.type == 'keydown' || e.type == 'keyup') {
            k.code = e.charCode || e.keyCode;
            // Try the location-specific key string first, then the default location (0), then the Mac version, then finally give up
            k.string = specialKeys[k.code] || I.specialMacKeysCode[k.code] || String.fromCharCode(k.code) || 'KEY_UNKNOWN';
            return k;
        } else if (typeof(e.charCode) != 'undefined' && e.charCode !== 0 && !I.specialMacKeysCode[e.charCode]) {
            k.code = e.charCode;
            k.string = String.fromCharCode(k.code);
            return k;
        } else if (e.keyCode && typeof(e.charCode) == 'undefined') { // IE
            k.code = e.code || e.keyCode;
            k.string = String.fromCharCode(k.code);
            return k;
        }
        return undefined;
    },
    mouse: function(e) {
        /**:GateOne.Input.mouse(e)

        Given an event object, returns an object:

        .. code-block:: javascript

            {
                type:   e.type, // Just preserves it
                left:   boolean,
                right:  boolean,
                middle: boolean,
            }
        */
        // Note: Based on functions from MochiKit.Signal
        var m = { type: e.type, button: {} };
        if (e.type != 'mousemove' && e.type != 'mousewheel') {
            if (e.which) { // Use 'which' if possible (modern and consistent)
                m.button.left = (e.which == 1);
                m.button.middle = (e.which == 2);
                m.button.right = (e.which == 3);
            } else { // Have to use button
                m.button.left = !!(e.button & 1);
                m.button.right = !!(e.button & 2);
                m.button.middle = !!(e.button & 4);
            }
        }
        if (e.type == 'mousewheel' || e.type == 'DOMMouseScroll') {
            m.wheel = { x: 0, y: 0 };
            if (e.wheelDeltaX || e.wheelDeltaY) {
                m.wheel.x = e.wheelDeltaX / -40 || 0;
                m.wheel.y = e.wheelDeltaY / -40 || 0;
            } else if (e.wheelDelta) {
                m.wheel.y = e.wheelDelta / -40;
            } else {
                m.wheel.y = e.detail || 0;
            }
        }
        return m;
    },
    onKeyUp: function(e) {
        /**:GateOne.Input.onKeyUp(e)

        Used in conjunction with GateOne.Input.modifiers() and GateOne.Input.onKeyDown() to emulate the meta key modifier using KEY_WINDOWS_LEFT and KEY_WINDOWS_RIGHT since "meta" doesn't work as an actual modifier on some browsers/platforms.
        */
        var key = I.key(e),
            modifiers = I.modifiers(e);
        logDebug('onKeyUp()', e);
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            I.metaHeld = false;
        }
        if (I.handledShortcut) {
            // This key has already been taken care of
            I.handledShortcut = false;
        }
        E.trigger("go:keyup:" + I.humanReadableShortcut(key.string, modifiers).toLowerCase(), e);
    },
    onKeyDown: function(e) {
        /**:GateOne.Input.onKeyDown(e)

        Handles keystroke events by determining which kind of event occurred and how/whether it should be sent to the server as specific characters or escape sequences.

        Triggers the `go:keydown` event with keystroke appended to the end of the event (in lower case).
        */
        // NOTE:  In order for e.preventDefault() to work in canceling browser keystrokes like Ctrl-C it must be called before keyup.
        var container = go.node,
            key = I.key(e),
            modifiers = I.modifiers(e);
        logDebug("onKeyDown() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        E.trigger("go:keydown:" + I.humanReadableShortcut(key.string, modifiers).toLowerCase(), e);
        if (I.handledGlobal) {
            // Global shortcuts take precedence
            return;
        }
        if (container) { // This display check prevents an exception when someone presses a key before the document has been fully loaded
            I.execKeystroke(e);
        }
    },
    onGlobalKeyUp: function(e) {
        /**:GateOne.Input.onGlobalKeyUp(e)

        This gets attached to the 'keyup' event on `document.body`.  Triggers the `global:keyup` event with keystroke appended to the end of the event (in lower case).
        */
        var key = I.key(e),
            modifiers = I.modifiers(e);
        logDebug('onGlobalKeyUp()', key, modifiers);
        E.trigger("global:keyup:" + I.humanReadableShortcut(key.string, modifiers).toLowerCase(), e);
    },
    onGlobalKeyDown: function(e) {
        /**:GateOne.Input.onGlobalKeyDown(e)

        Handles global keystroke events (i.e. those attached to the window object).
        */
        var key = I.key(e),
            modifiers = I.modifiers(e);
        logDebug("onGlobalKeyDown() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        E.trigger("global:keydown:" + I.humanReadableShortcut(key.string, modifiers).toLowerCase(), e);
        I.execKeystroke(e, true);
    },
    execKeystroke: function(e, /*opt*/global) {
        /**:GateOne.Input.execKeystroke(e, global)

        Executes the keystroke or shortcut associated with the given keydown event (*e*).  If *global* is true, will only execute global shortcuts (no regular keystroke overrides).
        */
        logDebug('execKeystroke(global=='+global+')');
        var key = I.key(e),
            modifiers = I.modifiers(e),
            shortcuts = I.shortcuts;
        if (global) {
            shortcuts = I.globalShortcuts;
        }
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            I.metaHeld = true; // Lets us emulate the "meta" modifier on browsers/platforms that don't get it right.
            setTimeout(function() {
                // Reset it after three seconds regardless of whether or not we get a keyup event.
                // This is necessary because when Macs execute meta-tab (Cmnd-tab) the keyup event never fires and Gate One can get stuck thinking meta is down.
                I.metaHeld = false;
            }, 3000);
            return true; // Save some CPU
        }
        if (I.composition) {
            return true; // Let the IME handle this keystroke
        }
        if (modifiers.shift) {
            // Reset go.Utils.scrollTopTemp if something other than PgUp or PgDown was pressed
            if (key.string != 'KEY_PAGE_UP' && key.string != 'KEY_PAGE_DOWN') {
                delete go.Utils.scrollTopTemp;
            }
        } else {
            delete go.Utils.scrollTopTemp; // Reset it for everything else
        }
        // This loops over everything in *shortcuts* and executes actions for any matching keyboard shortcuts that have been defined.
        for (var k in shortcuts) {
            if (key.string == k) {
                var matched = false;
                shortcuts[k].forEach(function(shortcut) {
                    var match = true, // Have to use some reverse logic here...  Slightly confusing but if you can think of a better way by all means send in a patch!
                        conditionFailure,
                        condition;
                    for (var mod in modifiers) {
                        if (modifiers[mod] != shortcut.modifiers[mod]) {
                            match = false;
                        }
                    }
                    if (match) {
                        if (typeof(shortcut.preventDefault) == 'undefined') {
                            // if not set in the shortcut object assume preventDefault() is desired.
                            e.preventDefault();
                        } else if (shortcut.preventDefault == true) {
                            // Explicitly set
                            e.preventDefault();
                        }
                        if (shortcut['conditions']) {
                            // Each condition must return true or don't execute
                            if (u.isArray(shortcut['conditions'])) {
                                shortcut['conditions'].forEach(function(condition) {
                                    if (u.isString(condition)) {
                                        condition = eval(condition);
                                    }
                                    if (u.isFunction(condition)) {
                                        if (!condition()) {
                                            conditionFailure = true;
                                        }
                                    } else if (!condition) {
                                        conditionFailure = true;
                                    }
                                });
                            } else {
                                if (u.isString(shortcut['conditions'])) {
                                    condition = eval(shortcut['conditions']);
                                }
                                if (u.isFunction(condition)) {
                                    if (!condition()) {
                                        conditionFailure = true;
                                    }
                                } else if (!condition) {
                                    conditionFailure = true;
                                }
                            }
                        }
                        if (conditionFailure) {
                            logDebug("Condition not met for " + I.humanReadableShortcut(shortcut));
                        } else {
                            if (typeof(shortcut['action']) == 'string') {
                                eval(shortcut['action']);
                            } else if (typeof(shortcut['action']) == 'function') {
                                shortcut['action'](e); // Pass it the event
                            }
                            I.handledShortcut = true;
                            I.handledGlobal = true;
                            matched = true;
                            setTimeout(function() {
                                I.handledGlobal = false;
                            }, 250);
                        }
                    }
                });
                if (matched) {
                    // Stop further processing of this keystroke
                    return true;
                }
            }
        }
    },
    registerShortcut: function(keyString, shortcutObj) {
        /**:GateOne.Input.registerShortcut(keyString, shortcutObj)

        :param string keyString: The KEY_<key> that will invoke this shortcut.
        :param object shortcutObj: A JavaScript object containing two properties:  'modifiers' and 'action'.  See above for their format.
        **shortcutObj**
        :param action: A string to be eval()'d or a function to be executed when the provided key combination is pressed.
        :param modifiers: An object containing the modifier keys that must be pressed for the shortcut to be called.  Example: `{"ctrl": true, "alt": true, "meta": false, "shift": false}`.

        Registers the given *shortcutObj* for the given *keyString* by adding a new object to :js:attr:`GateOne.Input.shortcuts`.  Here's an example:

        .. code-block:: javascript

            GateOne.Input.registerShortcut('KEY_ARROW_LEFT', {
                'modifiers': {
                    'ctrl': true,
                    'alt': false,
                    'altgr': false,
                    'meta': false,
                    'shift': true
                },
                'action': 'GateOne.Visual.slideLeft()' // Can be an eval() string or a function
            });

        You don't have to provide *all* modifiers when registering a shortcut.  The following would be equivalent to the above:

        .. code-block:: javascript

            GateOne.Input.registerShortcut('KEY_ARROW_LEFT', {
                'modifiers': {
                    'ctrl': true,
                    'shift': true
                },
                'action': GateOne.Visual.slideLeft // Also demonstrating that you can pass a function instead of a string
            });

        Shortcuts registered via this function will only be usable when Gate One is active on the web page in which it is embedded.  For shortcuts that need to *always* be usable see :js:meth:`GateOne.Input.registerGlobalShortcut`.

        Optionally, you may also specify a condition or Array of conditions to be met for the shortcut to be executed.  For example:

        .. code-block:: javascript

            GateOne.Input.registerShortcut('KEY_ARROW_LEFT', {
                'modifiers': {
                    'ctrl': true,
                    'shift': true
                },
                'conditions': [myCheckFunction, 'GateOne.Terminal.MyPlugin.isAlive'],
                'action': GateOne.Visual.slideLeft
            });

        In the example above the ``GateOne.Visual.slideLeft`` function would only be executed if ``myCheckFunction()`` returned ``true`` and if 'GateOne.Terminal.MyPlugin.isAlive' existed and also evaluated to ``true``.
        */
        go.Logging.deprecated("GateOne.Input.registerShortcut", gettext("Use GateOne.Events.on() with keydown or keyup events like 'go:keydown:<key/keystroke>' instead."));
        var match, conditionsMatch, overwrote;
        // Add any missing modifiers so we can perform easy true/false checks
        shortcutObj.modifiers.altgr = shortcutObj.modifiers.altgr || false;
        shortcutObj.modifiers.alt = shortcutObj.modifiers.alt || false;
        shortcutObj.modifiers.ctrl = shortcutObj.modifiers.ctrl || false;
        shortcutObj.modifiers.meta = shortcutObj.modifiers.meta || false;
        shortcutObj.modifiers.shift = shortcutObj.modifiers.shift || false;
        if (I.shortcuts[keyString]) {
            // Already exists, overwrite existing if conflict (and log it) or append it
            I.shortcuts[keyString].forEach(function(shortcut) {
                match = true;
                for (var mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != shortcut.modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match in terms of modifiers; check conditions next
                    if (!shortcutObj['conditions']) {
                        // Only assume we're overriding an existing shortcut if there's no conditions
                        logWarning(gettext("Overwriting existing shortcut for: ") + keyString);
                        shortcut = shortcutObj;
                        overwrote = true;
                    }
                }
            });
            if (!overwrote) {
                // No existing shortcut matches; append the new one
                I.shortcuts[keyString].push(shortcutObj);
            }
        } else {
            // Create a new shortcut with the given parameters
            I.shortcuts[keyString] = [shortcutObj];
        }
    },
    unregisterShortcut: function(keyString, shortcutObj) {
        /**:GateOne.Input.unregisterShortcut(keyString, shortcutObj)

        Removes the shortcut associated with the given *keyString* and *shortcutObj*.
        */
        var match;
        if (I.shortcuts[keyString]) {
            for (var i=0; i < I.shortcuts[keyString].length; i++) {
                match = true;
                for (var mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != I.shortcuts[keyString][i].modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match...  Remove it
                    I.shortcuts[keyString].splice(i, 1);
                }
            }
            if (!I.shortcuts[keyString].length) {
                delete I.shortcuts[keyString];
            }
        } // else: Nothing to do
    },
    registerGlobalShortcut: function(keyString, shortcutObj) {
        /**:GateOne.Input.registerGlobalShortcut(keyString, shortcutObj)

        Used to register a *global* shortcut.  Identical to :js:meth:`GateOne.Input.registerShortcut` with the exception that shortcuts registered via this function will work even if `GateOne.prefs.goDiv` (e.g. #gateone) doesn't currently have focus.

        .. note:: This function only matters when Gate One is embedded into another application.
        */
        go.Logging.deprecated("GateOne.Input.registerGlobalShortcut", gettext("Use GateOne.Events.on() with keydown or keyup events like 'go:keydown:<key/keystroke>' instead."));
        var match, overwrote;
        // Add any missing modifiers so we can perform easy true/false checks
        shortcutObj.modifiers.altgr = shortcutObj.modifiers.altgr || false;
        shortcutObj.modifiers.alt = shortcutObj.modifiers.alt || false;
        shortcutObj.modifiers.ctrl = shortcutObj.modifiers.ctrl || false;
        shortcutObj.modifiers.meta = shortcutObj.modifiers.meta || false;
        shortcutObj.modifiers.shift = shortcutObj.modifiers.shift || false;
        if (I.globalShortcuts[keyString]) {
            // Already exists, overwrite existing if conflict (and log it) or append it
            overwrote = false;
            I.globalShortcuts[keyString].forEach(function(shortcut) {
                match = true;
                for (var mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != shortcut.modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match...  Log and overwrite it
                    logWarning(gettext("Overwriting existing shortcut for: ") + keyString);
                    shortcut = shortcutObj;
                    overwrote = true;
                }
            });
            if (!overwrote) {
                // No existing shortcut matches, append the new one
                I.globalShortcuts[keyString].push(shortcutObj);
            }
        } else {
            // Create a new shortcut with the given parameters
            I.globalShortcuts[keyString] = [shortcutObj];
        }
    },
    unregisterGlobalShortcut: function(keyString, shortcutObj) {
        /**:GateOne.Input.unregisterGlobalShortcut(keyString, shortcutObj)

        Removes the shortcut associated with the given *keyString* and *shortcutObj*.
        */
        var match;
        if (I.globalShortcuts[keyString]) {
            for (var i=0; i < I.globalShortcuts[keyString].length; i++) {
                match = true;
                for (var mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != I.globalShortcuts[keyString][i].modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match...  Remove it
                    I.globalShortcuts[keyString].splice(i, 1);
                }
            }
            if (!I.globalShortcuts[keyString].length) {
                delete I.globalShortcuts[keyString];
            }
        } // else: Nothing to do
    },
    humanReadableShortcut: function(name, modifiers) {
        /**:GateOne.Input.humanReadableShortcut(name, modifiers)

        Given a key *name* such as 'KEY_DELETE' (or just 'G') and a *modifiers* object, returns a human-readable string.  Example:

            >>> GateOne.Input.humanReadableShortcut('KEY_DELETE', {"ctrl": true, "alt": true, "meta": false, "shift": false});
            Ctrl-Alt-Delete
        */
        var out = "";
        if (name.indexOf('KEY_') != -1) {
            // Remove the KEY_ part
            name = name.split(/KEY_/)[1];
        }
        name = u.capitalizeFirstLetter(name.toLowerCase());
        out += modifiers.ctrl ? 'Ctrl-' : '';
        out += modifiers.alt ? 'Alt-' : '';
        out += modifiers.meta ? 'Meta-' : '';
        out += modifiers.shift ? 'Shift-' : '';
        out += name;
        return out;
    },
    humanReadableShortcutList: function(shortcuts) {
        /**:GateOne.Input.humanReadableShortcutList(shortcuts)

        Given a list of *shortcuts* (e.g. `GateOne.Input.shortcuts`), returns an Array of keyboard shortcuts suitable for inclusion in a table.  Example:

            >>> GateOne.Input.humanReadableShortcutList(GateOne.Input.shortcuts);
            [['Ctrl-Alt-G', 'Grid View'], ['Ctrl-Alt-N', 'New Workspace']]
        */
        for (var shortcut in I.shortcuts) {
            if (shortcut.indexOf('KEY_') == -1) {
                continue; // Only interested in proper key shortcuts
            }
            console.log('shortcut: ' + shortcut);
            var splitKey = i.split('_'),
                keyName = '',
                outStr = '';
            splitKey.splice(0,1); // Get rid of the KEY part
            for (var j in splitKey) {
                keyName += splitKey[j].toLowerCase() + ' ';
            }
            keyName.trim();
            for (var j in I.shortcuts[i]) {
                if (I.shortcuts[i][j].modifiers) {
                    outStr += j + '-';
                }
            }
            outStr += keyName;
            out.push(outStr);
        }
        return out;
    }
});

// Expand GateOne.Input.specialKeys to be more complete:
(function () { // Note:  Copied from MochiKit.Signal.
// Jonathan Gardner, Beau Hartshorne, and Bob Ippolito are JavaScript heroes!
    /* for KEY_0 - KEY_9 */
    var specialKeys = I.specialKeysCode;
    for (var i = 48; i <= 57; i++) {
        specialKeys[0][i] = 'KEY_' + (i - 48);
    }
    /* for KEY_A - KEY_Z */
    for (var i = 65; i <= 90; i++) {
        specialKeys[0][i] = 'KEY_' + String.fromCharCode(i);
    }
    /* for KEY_NUM_PAD_0 - KEY_NUM_PAD_9 */
    for (var i = 96; i <= 105; i++) {
        specialKeys[0][i] = 'KEY_NUM_PAD_' + (i - 96);
    }
    /* for KEY_F1 - KEY_F12 */
    for (var i = 112; i <= 123; i++) {
        specialKeys[0][i] = 'KEY_F' + (i - 112 + 1);
    }
})();
// Fill out the special Mac keys:
(function () {
    var specialMacKeysCode = I.specialMacKeysCode;
    for (var i = 63236; i <= 63242; i++) {
        specialMacKeysCode[i] = 'KEY_F' + (i - 63236 + 1);
    }
})();

});
