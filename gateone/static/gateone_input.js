GateOne.Base.superSandbox("GateOne.Input", /* Dependencies -->*/["GateOne.Visual"], function(window, undefined) {
"use strict";

var document = window.document,
    hidden, visibilityChange,
    go = GateOne,
    prefix = go.prefs.prefix,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    I = go.Input,
    S = go.Storage,
    gettext = GateOne.i18n.gettext,
    urlObj = (window.URL || window.webkitURL),
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

// Choose appropriate Page Visibility API attribute
if (typeof document.hidden !== "undefined") {
    hidden = "hidden";
    visibilityChange = "visibilitychange";
} else if (typeof document.mozHidden !== "undefined") {
    hidden = "mozHidden";
    visibilityChange = "mozvisibilitychange";
} else if (typeof document.msHidden !== "undefined") {
    hidden = "msHidden";
    visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
    hidden = "webkitHidden";
    visibilityChange = "webkitvisibilitychange";
}
// NOTE:  If the browser doesn't support the Page Visibility API it isn't a big deal; the user will merely have to click on the page for input to start being captured.

GateOne.Base.module(GateOne, "Input", '1.2', ['Base', 'Utils']);
// GateOne.Input.charBuffer = []; // Queue for sending characters to the server
GateOne.Input.metaHeld = false; // Used to emulate the "meta" modifier since some browsers/platforms don't get it right.
GateOne.Input.shortcuts = {}; // Shortcuts added via registerShortcut() wind up here.
GateOne.Input.globalShortcuts = {}; // Global shortcuts added via registerGlobalShortcut() wind up here.
GateOne.Input.handledGlobal = false; // Used to detect when a global shortcut needs to override a local (regular) one.
GateOne.Base.update(GateOne.Input, {
    /**:GateOne.Input

    GateOne.Input is in charge of all keyboard input as well as copy & paste stuff and touch events.
    */
    init: function() {
        /**:GateOne.Input.init()

        Attaches our global keydown/keyup events and touch events
        */
        var u = go.Utils,
            v = go.Visual;
        document.addEventListener(visibilityChange, go.Input.handleVisibility, false);
        // Attach our global shortcut handler to window
        window.addEventListener('keydown', go.Input.onGlobalKeyDown, true);
        go.node.addEventListener('keydown', go.Input.onKeyDown, true);
        go.node.addEventListener('keyup', go.Input.onKeyUp, true);
        // Add some useful touchscreen events
        if ('ontouchstart' in document.documentElement) { // Touch-enabled devices only
            v.displayMessage("Touch screen detected:<br>Swipe left/right/up/down to switch workspaces.");
            var style = window.getComputedStyle(go.node, null);
            go.node.addEventListener('touchstart', function(e) {
                v.displayMessage("touchstart");
                var touch = e.touches[0];
                go.Input.touchstartX = touch.pageX;
                go.Input.touchstartY = touch.pageY;
            }, true);
            go.node.addEventListener('touchmove', function(e) {
                v.displayMessage("touchmove");
                var touch = e.touches[0];
                if (touch.pageX < go.Input.touchstartX && (go.Input.touchstartX - touch.pageX) > 20) {
                    v.slideRight();
                } else if (touch.pageX > go.Input.touchstartX && (touch.pageX - go.Input.touchstartX) > 20) {
                    v.slideLeft();
                } else if (touch.pageY < go.Input.touchstartY && (go.Input.touchstartY - touch.pageY) > 20) {
                    v.slideDown();
                } else if (touch.pageY > go.Input.touchstartY && (touch.pageY - go.Input.touchstartY) > 20) {
                    v.slideUp();
                }
                e.preventDefault();
            }, true);
            setTimeout(function() {
                u.hideElements('.✈pastearea');
            }, 3000);
        }
    },
    modifiers: function(e) {
        // Given an event object, returns an object with booleans for each modifier key (shift, alt, ctrl, meta)
        var out = {
            shift: false,
            alt: false,
            ctrl: false,
            meta: false
        }
        if (e.altKey) out.alt = true;
        if (e.shiftKey) out.shift = true;
        if (e.ctrlKey) out.ctrl = true;
        if (e.metaKey) out.meta = true;
        // Only emulate the meta modifier if it isn't working
        if (out.meta == false && GateOne.Input.metaHeld) {
            // Gotta emulate it
            out.meta = true;
        }
        return out;
    },
    specialKeys: { // Note: Copied from MochiKit.Signal
        // Also note:  This lookup table is expanded further on in the code
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
        144: 'KEY_NUM_LOCK',
        145: 'KEY_SCROLL_LOCK',
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
        229: 'KEY_COMPOSE' // NOTE: Firefox doesn't register a key code for the compose key!
        // undefined: 'KEY_UNKNOWN'
    },
    specialMacKeys: { // Note: Copied from MochiKit.Signal
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
    key: function(e) {
        // Given an event object, returns an object:
        // {
        //    type: <event type>, // Just preserves it
        //    code: <the key code>,
        //    string: 'KEY_<key string>'
        // }
        var goIn = GateOne.Input,
            k = { type: e.type };
        if (e.type == 'keydown' || e.type == 'keyup') {
            k.code = e.keyCode;
            k.string = (goIn.specialKeys[k.code] || goIn.specialMacKeys[k.code] || 'KEY_UNKNOWN');
            return k;
        } else if (typeof(e.charCode) != 'undefined' && e.charCode !== 0 && !goIn.specialMacKeys[e.charCode]) {
            k.code = e.charCode;
            k.string = String.fromCharCode(k.code);
            return k;
        } else if (e.keyCode && typeof(e.charCode) == 'undefined') { // IE
            k.code = e.keyCode;
            k.string = String.fromCharCode(k.code);
            return k;
        }
        return undefined;
    },
    mouse: function(e) {
        // Given an event object, returns an object:
        // {
        //    type:   <event type>, // Just preserves it
        //    left:   <true/false>,
        //    right:  <true/false>,
        //    middle: <true/false>,
        // }
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
        var goIn = go.Input,
            key = goIn.key(e);
        logDebug('onKeyUp()');
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = false;
        }
        if (goIn.handledShortcut) {
            // This key has already been taken care of
            goIn.handledShortcut = false;
            return;
        }
    },
    onKeyDown: function(e) {
        /**:GateOne.Input.onKeyDown(e)

        Handles keystroke events by determining which kind of event occurred and how/whether it should be sent to the server as specific characters or escape sequences.
        */
        // NOTE:  In order for e.preventDefault() to work in canceling browser keystrokes like Ctrl-C it must be called before keyup.
        var goIn = go.Input,
            u = go.Utils,
            container = go.node,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e);
        logDebug("onKeyDown() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        if (goIn.handledGlobal) {
            // Global shortcuts take precedence
            return;
        }
        if (container) { // This display check prevents an exception when someone presses a key before the document has been fully loaded
            goIn.execKeystroke(e);
        }
    },
    onGlobalKeyDown: function(e) {
        /**:GateOne.Input.onGlobalKeyDown(e)

        Handles global keystroke events (i.e. those attached to the window object).
        */
        var goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e);
        logDebug("onGlobalKeyDown() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        goIn.execKeystroke(e, true);
    },
    execKeystroke: function(e, /*opt*/global) {
        /**:GateOne.Input.execKeystroke(e, global)

        Executes the keystroke or shortcut associated with the given keydown event (*e*).  If *global* is true, will only execute global shortcuts (no regular keystroke overrides).
        */
        logDebug('execKeystroke(global=='+global+')');
        var goIn = go.Input,
            key = goIn.key(e),
            modifiers = goIn.modifiers(e),
            shortcuts = goIn.shortcuts;
        if (global) {
            shortcuts = goIn.globalShortcuts;
        }
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            goIn.metaHeld = true; // Lets us emulate the "meta" modifier on browsers/platforms that don't get it right.
            setTimeout(function() {
                // Reset it after three seconds regardless of whether or not we get a keyup event.
                // This is necessary because when Macs execute meta-tab (Cmnd-tab) the keyup event never fires and Gate One can get stuck thinking meta is down.
                goIn.metaHeld = false;
            }, 3000);
            return true; // Save some CPU
        }
        if (goIn.composition) {
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
                    var match = true; // Have to use some reverse logic here...  Slightly confusing but if you can think of a better way by all means send in a patch!
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
                        if (typeof(shortcut['action']) == 'string') {
                            eval(shortcut['action']);
                        } else if (typeof(shortcut['action']) == 'function') {
                            shortcut['action'](e); // Pass it the event
                        }
                        goIn.handledShortcut = true;
                        goIn.handledGlobal = true;
                        matched = true;
                    }
                });
                if (matched) {
                    setTimeout(function() {
                        goIn.handledGlobal = false;
                    }, 250);
                    // Stop further processing of this keystroke
                    return true;
                }
            }
        }
    },
    registerShortcut: function(keyString, shortcutObj) {
        // Used to register a shortcut.  The point being to prevent one shortcut being clobbered by another if they happen have the same base key.
        // Example usage:  GateOne.Input.registerShortcut('KEY_G', {
        //     'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false},
        //     'action': 'GateOne.Visual.toggleGridView()',
        //     'preventDefault': true
        // });
        // NOTE:  If preventDefault is not given in the shortcutObj it is assumed to be true
        if (GateOne.Input.shortcuts[keyString]) {
            // Already exists, overwrite existing if conflict (and log it) or append it
            var overwrote = false;
            GateOne.Input.shortcuts[keyString].forEach(function(shortcut) {
                var match = true;
                for (var mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != shortcut.modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match...  Log and overwrite it
                    logWarning("Overwriting existing shortcut for: " + keyString);
                    shortcut = shortcutObj;
                    overwrote = true;
                }
            });
            if (!overwrote) {
                // No existing shortcut matches, append the new one
                GateOne.Input.shortcuts[keyString].push(shortcutObj);
            }
        } else {
            // Create a new shortcut with the given parameters
            GateOne.Input.shortcuts[keyString] = [shortcutObj];
        }
    },
    registerGlobalShortcut: function(keyString, shortcutObj) {
        /**:GateOne.Input.registerGlobalShortcut(keyString, shortcutObj)

        Used to register a *global* shortcut.  Identical to :js:meth:`GateOne.Input.registerShortcut` with the exception that shortcuts registered via this function will work even if `GateOne.prefs.goDiv` (e.g. #gateone) doesn't currently have focus (i.e. it will work even after disableCapture() is called).
        */
        // Example usage:  GateOne.Input.registerGlobalShortcut('KEY_G', {
        //     'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false},
        //     'action': 'GateOne.Visual.toggleGridView()',
        //     'preventDefault': true
        // });
        // NOTE:  If preventDefault is not given in the shortcutObj it is assumed to be true
        if (GateOne.Input.globalShortcuts[keyString]) {
            // Already exists, overwrite existing if conflict (and log it) or append it
            var overwrote = false;
            GateOne.Input.globalShortcuts[keyString].forEach(function(shortcut) {
                var match = true;
                for (var mod in shortcutObj.modifiers) {
                    if (shortcutObj.modifiers[mod] != shortcut.modifiers[mod]) {
                        match = false;
                    }
                }
                if (match) {
                    // There's a match...  Log and overwrite it
                    logWarning("Overwriting existing shortcut for: " + keyString);
                    shortcut = shortcutObj;
                    overwrote = true;
                }
            });
            if (!overwrote) {
                // No existing shortcut matches, append the new one
                GateOne.Input.globalShortcuts[keyString].push(shortcutObj);
            }
        } else {
            // Create a new shortcut with the given parameters
            GateOne.Input.globalShortcuts[keyString] = [shortcutObj];
        }
    },
    // TODO: This...
    humanReadableShortcuts: function() {
        // Returns a human-readable string representing the objects inside of GateOne.Input.shortcuts. Each string will be in the form of:
        //  <modifiers>-<key>
        // Example:
        //  Ctrl-Alt-Delete
        var goIn = GateOne.Input,
            out = [];
        for (var i in goIn.shortcuts) {
            console.log('i: ' + i);
            var splitKey = i.split('_'),
                keyName = '',
                outStr = '';
            splitKey.splice(0,1); // Get rid of the KEY part
            for (var j in splitKey) {
                keyName += splitKey[j].toLowerCase() + ' ';
            }
            keyName.trim();
            for (var j in goIn.shortcuts[i]) {
                if (goIn.shortcuts[i][j].modifiers) {
                    outStr += j + '-';
                }
            }
            outStr += keyName;
            out.push(outStr);
        }
        return out;
    },
    handleVisibility: function(e) {
        // Calls GateOne.Input.capture() when the page becomes visible again *if* goDiv had focus before the document went invisible
        var go = GateOne,
            u = go.Utils;
        if (!u.isPageHidden()) {
            // Page has become visibile again
            logDebug("Ninja Mode disabled.");
            if (document.activeElement == go.node) {
                // Gate One was active when the page became hidden
                go.Events.trigger("go:visible");
            }
        } else {
            logDebug("Ninja Mode!  Gate One has become hidden.");
            go.Events.trigger("go:invisible");
        }
    }
});
});

// Expand GateOne.Input.specialKeys to be more complete:
(function () { // Note:  Copied from MochiKit.Signal.
// Jonathan Gardner, Beau Hartshorne, and Bob Ippolito are JavaScript heroes!
    /* for KEY_0 - KEY_9 */
    var specialKeys = GateOne.Input.specialKeys;
    for (var i = 48; i <= 57; i++) {
        specialKeys[i] = 'KEY_' + (i - 48);
    }

    /* for KEY_A - KEY_Z */
    for (var i = 65; i <= 90; i++) {
        specialKeys[i] = 'KEY_' + String.fromCharCode(i);
    }

    /* for KEY_NUM_PAD_0 - KEY_NUM_PAD_9 */
    for (var i = 96; i <= 105; i++) {
        specialKeys[i] = 'KEY_NUM_PAD_' + (i - 96);
    }

    /* for KEY_F1 - KEY_F12 */
    for (var i = 112; i <= 123; i++) {
        specialKeys[i] = 'KEY_F' + (i - 112 + 1);
    }
})();
// Fill out the special Mac keys:
(function () {
    var specialMacKeys = GateOne.Input.specialMacKeys;
    for (var i = 63236; i <= 63242; i++) {
        specialMacKeys[i] = 'KEY_F' + (i - 63236 + 1);
    }
})();
