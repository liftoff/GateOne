
GateOne.Base.superSandbox("GateOne.Terminal.Input", ["GateOne.Terminal", "GateOne.User", "GateOne.Input"], function(window, undefined) {
"use strict";

// Sandbox-wide shortcuts
var go = GateOne,
    prefix = go.prefs.prefix,
    t = go.Terminal,
    I = go.Input, // Not the same as GateOne.Terminal.Input!
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    gettext = go.i18n.gettext,
    ESC = String.fromCharCode(27),
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug,
    mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel";

GateOne.Base.module(GateOne.Terminal, "Input", '1.0');
/**:GateOne.Terminal.Input

Terminal-specific keyboard and mouse input stuff.

*/
t.Input.charBuffer = []; // Queue for sending characters to the server
// F11 toggles fullscreen mode in most browsers.  If F11 is pressed once it will act as a regular F11 keystroke in the terminal.  If it is pressed twice rapidly in succession (within 0.750 seconds) it will execute the regular browser keystroke (enabling or disabling fullscreen mode).
// Why did I code it this way?  If the user is unaware of this feature when they enter fullscreen mode, they might panic and hit F11 a bunch of times and it's likely they'll break out of fullscreen mode as an instinct :).  The message indicating the behavior will probably help too :D
t.Input.F11 = false;
t.Input.F11timer = null;
t.Input.handlingPaste = false;
t.Input.automaticBackspace = true; // This controls whether or not we'll try to automatically switch between ^H and ^?
t.Input.commandBuffer = ""; // Used to keep track of all (regular) keys that are pressed before the enter key so we can do our best to keep track of the last command that was entered.
t.Input.lastCommand = ""; // A best-guess as to what command was entered last.
t.Input.commandBufferMax = 8192; // Maximum amount of characters to keep in the command buffer (to keep things reasonable if someone goes a long time without hitting the enter key).
GateOne.Base.update(GateOne.Terminal.Input, {
    // GateOne.Input is in charge of all keyboard input as well as copy & paste stuff
    init: function() {
        /**:GateOne.Terminal.Input.init()

        Creates `GateOne.Terminal.Input.inputNode` to capture keys/IME composition and attaches appropriate events.
        */
        E.on("go:new_workspace", go.Terminal.Input.disableCapture);
        E.on("terminal:new_terminal", go.Terminal.Input.capture);
        E.on("go:visible", function() {
            if (document.activeElement.className == '✈IME') {
                // Pick up where the user left off by re-enabling capture right away
                go.Terminal.Input.capture();
            }
        });
        if (!go.prefs.embedded) {
            E.on("go:panel_toggle:out", go.Terminal.Input.capture);
            E.on("go:panel_toggle:out", function(panel) {
                go.Terminal.Input.capture();
                go.Terminal.setActive();
            });
        }
    },
    sendChars: function() {
        /**:GateOne.Terminal.Input.sendChars()

        pop()s out the current `charBuffer` and sends it to the server.

        .. note: This function is normally called every time a key is pressed.
        */
        var term = localStorage[prefix+'selectedTerminal'],
            termPre = t.terminals[term]['node'];
        if (!t.doingUpdate) { // Only perform a character push if we're *positive* the last character POST has completed.
            t.doingUpdate = true;
            var cb = t.Input.charBuffer,
                charString = "";
            for (var i=0; i<=cb.length; i++) { charString += cb.pop(); }
            if (charString != "undefined") {
                var message = {'c': charString};
                E.trigger("terminal:send_chars", message); // Called before the message is sent so it can be manipulated.
                go.ws.send(JSON.stringify(message));
                t.doingUpdate = false;
            } else {
                t.doingUpdate = false;
            }
        } else {
            // We are in the middle of processing the last character
            setTimeout(t.Input.sendChars, 100); // Wait 0.1 seconds and retry.
        }
    },
    _getLineNo: function(elementUnder) {
        // An internal function that just gets the line number (if any) by recursively moving up the DOM from *elementUnder*
        var className = elementUnder.className + '', // Ensure it's a string for Firefox
            lineno;
        if (className && className.indexOf('✈termline') == -1) {
            while (elementUnder.parentNode) {
                elementUnder = elementUnder.parentNode;
                if (elementUnder.className === undefined) {
                    // User didn't click on a screen line; ignore
                    elementUnder = null;
                    break;
                }
                className = elementUnder.className + ''; // Ensure it's a string for Firefox
                if (className.indexOf('✈termline') != -1) {
                    break;
                }
            }
        }
        lineno = parseInt(u.last(className.split('_')), 10) + 1;
        return lineno;
    },
    onMouseWheel: function(e) {
        /**:GateOne.Terminal.Input.onMouseWheel(e)

        Attached to the mousewheel event on the Terminal application container; calls ``preventDefault()`` if "mouse motion" event tracking mode is enabled and instead sends equivalent xterm escape sequences to the server to emulate mouse scroll events.

        If the ``Alt`` key is held the user will be able to scroll normally.
        */
        var selectedTerm = localStorage[prefix+'selectedTerminal'],
            m = go.Input.mouse(e),
            modifiers = I.modifiers(e),
            button,
            termObj = go.Terminal.terminals[selectedTerm],
            termNode = termObj['node'],
            columns = termObj['columns'],
            width = termObj['screenNode'].offsetWidth,
            x = Math.ceil(e.clientX/(width/(columns))),
            element_under = document.elementFromPoint(e.clientX, e.clientY),
            y = go.Terminal.Input._getLineNo(element_under);
        if (go.Terminal.terminals[selectedTerm]['mouse'] == "mouse_button_motion") {
            if (!modifiers.alt) {
                e.preventDefault();
                if (!isNaN(y)) {
                    go.Terminal.Input.lastGoodY = y;
                }
                if (!isNaN(x)) {
                    go.Terminal.Input.lastGoodX = x;
                }
                x = go.Terminal.xtermEncode(x);
                if (m.wheel.y > 1) {
                    button = go.Terminal.xtermEncode(1+64);
                } else {
                    button = go.Terminal.xtermEncode(0+64);
                }
                if (y) {
                    y = go.Terminal.xtermEncode(y);
                    go.Terminal.sendString(ESC+'[M'+button+x+y);
                }
            }
        }
    },
    onContextMenu: function(e) {
        /**:GateOne.Terminal.Input.onMouseMove(e)

        Attached to the `contextmenu` event on the Terminal application container; calls ``preventDefault()`` if "mouse motion" event tracking mode is enabled to prevent the usual context menu from popping up.

        If the ``Alt`` key is held while right-clicking the normal context menu will appear.
        */
        var selectedTerm = localStorage[prefix+'selectedTerminal'],
            modifiers = I.modifiers(e);
        if (go.Terminal.terminals[selectedTerm]['mouse'] == "mouse_button_motion") {
            if (!modifiers.alt) {
                e.preventDefault();
            }
        }
    },
    onMouseMove: function(e) {
        /**:GateOne.Terminal.Input.onMouseMove(e)

        Attached to the `mousemove` event on the Terminal application container when mouse event tracking is enabled; pre-sets `GateOne.Terminal.mouseUpEscSeq` with the current mouse coordinates.
        */
        var selectedTerm = localStorage[prefix+'selectedTerminal'],
            termObj = go.Terminal.terminals[selectedTerm],
            termNode = termObj['node'],
            columns = termObj['columns'],
            width = termObj['screenNode'].offsetWidth,
            x = Math.ceil(e.clientX/(width/(columns))),
            element_under = document.elementFromPoint(e.clientX, e.clientY),
            y = go.Terminal.Input._getLineNo(element_under);
        if (!isNaN(y)) {
            go.Terminal.Input.lastGoodY = y;
        }
        if (!isNaN(x)) {
            go.Terminal.Input.lastGoodX = x;
        }
        x = go.Terminal.xtermEncode(x);
        if (y) {
            y = go.Terminal.xtermEncode(y);
            go.Terminal.mouseUpEscSeq = ESC+'[M@'+x+y;
        }
    },
    onMouseDown: function(e) {
        /**:GateOne.Terminal.Input.onMouseDown(e)

        Attached to the `mousedown` event on the Terminal application container; performs the following actions based on which mouse button was used:

            * Left-click: Hides the pastearea.
            * Right-click: If no text is highlighted in the terminal, makes sure the pastearea is visible and has focus.
            * Middle-click: Makes sure the pastearea is visible and has focus so that middle-click-to-paste events (X11) will work properly.  Alternatively, if there is highlighted text in the terminal a paste event will be emulated (regardless of platform).
        */
        // TODO: Add a shift-click context menu for special operations.  Why shift and not ctrl-click or alt-click?  Some platforms use ctrl-click to emulate right-click and some platforms use alt-click to move windows around.
        logDebug("GateOne.Terminal.Input.onMouseDown() button: " + e.button + ", which: " + e.which);
        var m = go.Input.mouse(e),
            modifiers = I.modifiers(e),
            X, Y, button, className, // Used by mouse coordinates/tracking stuff
            selectedTerm = localStorage[prefix+'selectedTerminal'],
            selectedPastearea = null,
            selectedText = u.getSelText(),
            elementUnder = document.elementFromPoint(e.clientX, e.clientY);
        t.Input.mouseDown = true;
        if (t.terminals[selectedTerm] && t.terminals[selectedTerm]['pasteNode']) {
            selectedPastearea = t.terminals[selectedTerm]['pasteNode'];
        }
        t.setActive(selectedTerm);
        if (elementUnder.className) {
            className = elementUnder.className + ''; // Ensure it's a string for Firefox
        }
        if (className && className.indexOf('✈termline') == -1) {
            while (elementUnder.parentNode) {
                elementUnder = elementUnder.parentNode;
                if (elementUnder.className === undefined) {
                    // User didn't click on a screen line; ignore
                    elementUnder = null;
                    break;
                }
                className = elementUnder.className + ''; // Ensure it's a string for Firefox
                if (className.indexOf('✈termline') != -1) {
                    break;
                }
            }
        }
        // This is for mouse tracking
        if (elementUnder) {
            // CSI M CbCxCy
            if (go.Terminal.terminals[selectedTerm]['mouse'] == "mouse_button_motion") {
                if (!modifiers.alt) { // Allow selecting text normally if alt is held
                    e.preventDefault(); // Don't let the browser do its own highlighting
                    var termObj = go.Terminal.terminals[selectedTerm],
                        termNode = termObj['node'],
                        columns = termObj['columns'],
                        colAdjust = go.prefs.colAdjust + go.Terminal.colAdjust,
                        width = termObj['screenNode'].offsetWidth;
                    Y = parseInt(u.last(className.split('_')), 10) + 1;
                    X = Math.ceil(e.clientX/(width/(columns)));
                    go.Terminal.Input.startSelection = [X, Y]; // Block selection tracking
                    logDebug("onMouseDown(): Clicked on row/column: "+Y+"/"+X);
                    X = go.Terminal.xtermEncode(X);
                    Y = go.Terminal.xtermEncode(Y);
                    if (m.button.left) {
                        go.Terminal.terminals[selectedTerm]['node'].addEventListener('mousemove', go.Terminal.Input.onMouseMove, false);
                        go.Terminal.mouseUpdater = setInterval(function() {
                            // Send regular mouse escape sequences in case the user is dragging-to-highlight
                            // NOTE:  This interval timer will be cleared automatically in onMouseUp()
                            if (go.Terminal.mouseUpEscSeq != go.Terminal.mouseUpEscSeqLast) {
                                go.Terminal.sendString(go.Terminal.mouseUpEscSeq);
                                go.Terminal.mouseUpEscSeqLast = go.Terminal.mouseUpEscSeq;
                            }
                        }, 100);
                        button = go.Terminal.xtermEncode(0);
                    } else if (m.button.right) {
                        button = go.Terminal.xtermEncode(1);
                    } else if (m.button.middle) {
                        button = go.Terminal.xtermEncode(2);
                    }
                    // Send the initial mouse down escape sequence
                    go.Terminal.sendString(ESC+'[M'+button+X+Y);
                }
            }
        }
        if (m.button.middle) {
            if (selectedPastearea) {
                u.showElement(selectedPastearea);
                selectedPastearea.focus();
            }
            if (selectedText.length) {
                t.Input.handlingPaste = true; // We're emulating a paste so we might as well act like one
                // Only preventDefault if text is selected so we don't muck up X11-style middle-click pasting
                e.preventDefault();
                t.Input.queue(selectedText);
                t.Input.sendChars();
                setTimeout(function() {
                    t.Input.handlingPaste = false;
                }, 250);
            }
        } else if (m.button.right) {
            if (!selectedText.length) {
                // Redisplay the pastearea so we can get a proper context menu in case the user wants to paste
                // NOTE: On Firefox this behavior is broken.  See: https://bugzilla.mozilla.org/show_bug.cgi?id=785773
                if (elementUnder) {
                    var tagName = elementUnder.tagName.toLowerCase();
                    // Allow users to right-click on anchors, audio, video, and images to get properties and whatnot
                    if (tagName != "audio" && tagName != "video" && tagName != "img" && tagName != "a") {
                        u.showElement(selectedPastearea);
                        selectedPastearea.focus();
                    }
                }
            }
        } else {
            t.Input.inputNode.focus();
        }
    },
    onMouseUp: function(e) {
        /**:GateOne.Terminal.Input.onMouseUp(e)

        Attached to the `mouseup` event on the Terminal application container; prevents the pastearea from being shown if text is highlighted in the terminal (so users can right-click to copy).  Also prevents the pastearea from being instantly re-enabled when clicking in order to allow double-click events to pass through to the terminal (to highlight words).

        The last thing this function does every time it is called is to change focus to `GateOne.Terminal.Input.inputNode`.
        */
        var selectedTerm = localStorage[prefix+'selectedTerminal'],
            selectedText = u.getSelText(),
            m = go.Input.mouse(e),
            modifiers = I.modifiers(e),
            X, Y, button, className, // Used by mouse coordinates/tracking stuff
            elementUnder = document.elementFromPoint(e.clientX, e.clientY);
        logDebug("GateOne.Terminal.Input.onMouseUp: e.button: " + e.button + ", e.which: " + e.which);
        // Once the user is done pasting (or clicking), set it back to false for speed
        t.Input.mouseDown = false;
        if (go.Terminal.Input.startSelection) {
            logDebug("Finished selection at: ", go.Terminal.Input.startSelection);
            go.Terminal.Input.startSelection = null;
        }
        if (selectedText) {
            // Highlight the selected text elsewhere in the terminal (if > 3 characters)
            if (go.prefs.highlightSelection && selectedText.length > 3) {
                t.unHighlight(); // Clear any existing highlighted text
                t.highlight(selectedText, selectedTerm);
                E.once("terminal:term_update", t.unHighlight); // Make sure the highlight gets cleared at the next update
            }
            // Don't show the pastearea as it will prevent the user from right-clicking to copy.
            return;
        } else {
            go.Terminal.unHighlight();
        }
        if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA" || document.activeElement.tagName == "SELECT" || document.activeElement.tagName == "BUTTON") {
            if (document.activeElement.classList && !document.activeElement.classList.contains('✈IME')) {
                return; // Don't do anything if the user is editing text in an input/textarea or is using a select element (so the up/down arrows work)
            }
        }
        className = elementUnder.className + ''; // Ensure it's a string for Firefox
        if (className && className.indexOf('✈termline') == -1) {
            while (elementUnder.parentNode) {
                elementUnder = elementUnder.parentNode;
                if (elementUnder.className === undefined) {
                    // User didn't click on a screen line; ignore
                    elementUnder = null;
                    break;
                }
                className = elementUnder.className + ''; // Ensure it's a string for Firefox
                if (className.indexOf('✈termline') != -1) {
                    break;
                }
            }
        }
        // This is for mouse tracking
        if (go.Terminal.mouseUpdater) {
            // CSI M CbCxCy
            logDebug("elementUnder: ", elementUnder);
            if (go.Terminal.terminals[selectedTerm]['mouse'] == "mouse_button_motion") {
                var termObj = go.Terminal.terminals[selectedTerm],
                    termNode = termObj['node'],
                    columns = termObj['columns'],
                    colAdjust = go.prefs.colAdjust + go.Terminal.colAdjust,
                    width = termObj['screenNode'].offsetWidth;
                if (m.button.right) {
                    if (!modifiers.alt) {
                        e.preventDefault();
                    }
                }
                Y = parseInt(u.last(className.split('_')), 10) + 1;
                X = Math.ceil(e.clientX/(width/(columns)));
                logDebug("onMouseUp(): Clicked on row/column: "+Y+"/"+X);
                if (isNaN(Y)) {
                    Y = go.Terminal.Input.lastGoodY;
                }
                if (isNaN(X)) {
                    X = go.Terminal.Input.lastGoodX;
                }
                X = go.Terminal.xtermEncode(X);
                Y = go.Terminal.xtermEncode(Y);
                button = go.Terminal.xtermEncode(3); // 3 is always "release"
                go.Terminal.sendString(ESC+'[M'+button+X+Y);
                clearInterval(go.Terminal.mouseUpdater);
                go.Terminal.mouseUpdater = null;
                // Stop tracking mouse
                go.Terminal.terminals[selectedTerm]['node'].removeEventListener('mousemove', go.Terminal.Input.onMouseMove, false);
            }
        }
        if (!go.Visual.gridView) {
            setTimeout(function() {
                if (!u.getSelText() && t.terminals[selectedTerm]) {
                    u.showElement(t.terminals[selectedTerm]['pasteNode']);
                }
            }, 750); // NOTE: For this to work (to allow users to double-click-to-highlight a word) they must double-click before this timer fires.
        }
        // If the Firefox bug timer hasn't fired by now it wasn't a click-and-drag event
        if (t.Input.firefoxBugTimer) {
            clearTimeout(t.Input.firefoxBugTimer);
            t.Input.firefoxBugTimer = null;
        }
        t.Input.inputNode.focus();
    },
    onCopy: function() {
        /**:GateOne.Terminal.Input.onCopy(e)

        Returns all 'pastearea' elements to a visible state after a copy operation so that the browser's regular context menu will be usable again (for pasting).  Also displays a message to the user letting them know that the text was copied successfully (because having your highlighted text suddenly disappear isn't that intuitive).
        */
        if (go.User.activeApplication == 'Terminal') {
            setTimeout(function() {
                // For some reason we have to remove the current selection for Firefox to bring the pastearea to the foreground (so the user can right-click to paste):
                window.getSelection().removeAllRanges();
                u.showElements('.✈pastearea');
            }, 50);
            v.displayMessage(gettext("Text copied to clipboard."));
        }
    },
    capture: function() {
        /**:GateOne.Terminal.Input.capture()

        Sets focus on the terminal and attaches all the relevant events (mousedown, mouseup, keydown, etc).
        */
        logDebug('go.Terminal.Input.capture()');
        var terms = u.toArray(u.getNodes('.✈terminal')),
            selectedText = u.getSelText();
        if (!t.Input.inputNode) {
            t.Input.inputNode = u.createElement('textarea', {'class': '✈IME', 'style': {'position': 'fixed', 'z-index': 99999, 'top': '0px', 'autocapitalize': 'off', 'autocomplete': 'off', 'autocorrect': 'off', 'spellcheck': 'false'}});
            go.node.appendChild(t.Input.inputNode);
            t.Input.inputNode.addEventListener('compositionstart', t.Input.onCompositionStart, true);
            t.Input.inputNode.addEventListener('compositionupdate', t.Input.onCompositionUpdate, true);
            t.Input.inputNode.addEventListener('compositionend', t.Input.onCompositionEnd, true);
            E.on('go:app_chooser', function(workspace) {
                t.Input.disableCapture(null, true); // Force capture off when bringing up the application chooser
            });
        }
        u.showElement(t.Input.inputNode);
        if (!t.Input.addedEventListeners) {
            t.Input.inputNode.addEventListener('input', t.Input.onInput, false);
            t.Input.inputNode.tabIndex = 1; // Just in case--this is necessary to set focus
            t.Input.inputNode.addEventListener('paste', t.Input.onPaste, false);
            t.Input.inputNode.addEventListener('blur', t.Input.disableCapture, true);
            t.Input.inputNode.addEventListener('keydown', t.Input.onKeyDown, true);
            t.Input.inputNode.addEventListener('keyup', t.Input.onKeyUp, true);
            go.node.addEventListener('copy', t.Input.onCopy, false);
            terms.forEach(function(termNode) {
                termNode.addEventListener('copy', t.Input.onCopy, false);
                termNode.addEventListener('paste', t.Input.onPaste, false);
                termNode.addEventListener('mousedown', t.Input.onMouseDown, false);
                termNode.addEventListener('mouseup', t.Input.onMouseUp, false);
                termNode.addEventListener('contextmenu', t.Input.onContextMenu, false);
                termNode.addEventListener(mousewheelevt, t.Input.onMouseWheel, false);
            });
        }
        t.Input.addedEventListeners = true;
        if (document.activeElement != t.Input.inputNode) {
            if (!selectedText) {
                t.Input.inputNode.focus();
            }
        }
    },
    disableCapture: function(e, /*opt*/force) {
        /**:GateOne.Terminal.Input.disableCapture(e[, force])

        Disables the various input events that capture mouse and keystroke events.  This allows things like input elements and forms to work properly (so keystrokes can pass through without intervention).
        */
        logDebug('go.Terminal.Input.disableCapture()', e);
        var terms = u.toArray(u.getNodes('.✈terminal'));
        if (!force) {
            if (t.switchedWorkspace) {
                logDebug("disableCapture() cancelled due to the GateOne.Terminal.switchedWorkspace being set.");
                return; // User is just switching to a different app
            }
            if (document.activeElement.classList && document.activeElement.classList.contains('✈IME')) {
                logDebug("disableCapture() cancelled due to the IME being the activeElement.");
                return; // User is just switching to a different app
            }
            if (t.Input.mouseDown) {
                logDebug('disableCapture() cancelled due to mouseDown.');
                go.Terminal.Input.mouseDown = false;
                return; // Work around Firefox's occasional inability to properly register mouse events (WTF Firefox!)
            }
            if (t.Input.handlingPaste) {
                logDebug('disableCapture() cancelled due to paste event.');
                // The 'blur' event can be called when focus shifts around for pasting.
                return; // Act as if we were never called to avoid flashing the overlay
            }
        }
        if (t.Input.inputNode) {
            t.Input.inputNode.removeEventListener('input', t.Input.onInput, false);
            t.Input.inputNode.tabIndex = null;
            t.Input.inputNode.removeEventListener('paste', t.Input.onPaste, false);
            t.Input.inputNode.removeEventListener('blur', t.Input.disableCapture, true);
            t.Input.inputNode.removeEventListener('keydown', t.Input.onKeyDown, true);
            t.Input.inputNode.removeEventListener('keyup', t.Input.onKeyUp, true);
            u.hideElement(t.Input.inputNode);
        }
        go.node.removeEventListener('copy', t.Input.onCopy, false);
        terms.forEach(function(termNode) {
            termNode.removeEventListener('copy', t.Input.onCopy, false);
            termNode.removeEventListener('paste', t.Input.onPaste, false);
            termNode.removeEventListener('mousedown', t.Input.onMouseDown, false);
            termNode.removeEventListener('mouseup', t.Input.onMouseUp, false);
            termNode.removeEventListener('contextmenu', t.Input.onContextMenu, false);
            termNode.removeEventListener(mousewheelevt, t.Input.onMouseWheel, false);
            if (!termNode.classList.contains('✈inactive')) {
                termNode.classList.add('✈inactive');
            }
        });
        t.Input.addedEventListeners = false;
        // TODO: Check to see if this should stay in GateOne.Input:
        I.metaHeld = false; // This can get stuck at 'true' if the uses does something like command-tab to switch applications.
    },
    onPaste: function(e) {
        /**:GateOne.Terminal.Input.onPaste(e)

        Attached to the 'paste' event on the terminal application container; converts pasted text to plaintext and sends it to the selected terminal.
        */
        logDebug("go.Terminal.Input.onPaste() registered paste event.");
        if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA" || document.activeElement.tagName == "SELECT" || document.activeElement.tagName == "BUTTON") {
            return; // Don't do anything if the user is editing text in an input/textarea or is using a select element (so the up/down arrows work)
        }
        if (!t.Input.handlingPaste) {
            // Grab the text being pasted
            t.Input.handlingPaste = true;
            var contents = null;
            if (e.clipboardData) {
                // Don't actually paste the text where the user clicked
                e.preventDefault();
                if (/text\/html/.test(e.clipboardData.types)) {
                    contents = e.clipboardData.getData('text/html');
                    contents = u.stripHTML(contents); // Convert to plain text to avoid unwanted cruft
                }
                else if (/text\/plain/.test(e.clipboardData.types)) {
                    contents = e.clipboardData.getData('text/plain');
                }
                logDebug('paste contents: ' + contents);
                // Queue it up and send the characters as if we typed them in
                t.sendString(contents);
            } else {
                // Change focus to the current pastearea and hope for the best
                t.paste();
            }
            // This is wrapped in a timeout so that the paste events that bubble up after the first get ignored
            setTimeout(function() {
                t.Input.handlingPaste = false;
            }, 100);
        } else {
            e.preventDefault(); // Prevent any funny business around queuing up pastes
        }
    },
    queue: function(text) {
        /**:GateOne.Terminal.Input.queue(text)

        Adds 'text' to the `GateOne.Terminal.Input.charBuffer` Array (to be sent to the server when ready via :meth:`GateOne.Terminal.sendChars`).
        */
        t.Input.charBuffer.unshift(text);
        if (t.Input.commandBuffer.length > t.Input.commandBufferMax) {
            t.Input.commandBuffer = ""; // Reset it (someone is using the terminal for something other than command entry)
        }
        t.Input.commandBuffer += text;
    },
    bufferEscSeq: function(chars) {
        /**:GateOne.Terminal.Input.queue(cars)

        Prepends the ESC key string (`String.fromCharCode(27)`) to special character sequences (e.g. PgUp, PgDown, Arrow keys, etc) before adding them to the charBuffer
        */
        t.Input.queue(ESC + chars);
    },
    onCompositionStart: function(e) {
        /**:GateOne.Terminal.Input.onCompositionStart(e)

        Called when we encounter the `compositionstart` event which indicates the use of an `IME <http://en.wikipedia.org/wiki/Input_method>`_.  That would most commonly be a mobile phone software keyboard or foreign language input methods (e.g. Anthy for Japanese, Chinese, etc).

        Ensures that `GateOne.Terminal.Input.inputNode` is visible and as close to the cursor position as possible.
        */
        logDebug('go.Terminal.Input.onCompositionStart()');
        var term = localStorage[go.prefs.prefix+'selectedTerminal'],
            cursor = document.querySelector('#term' + term + 'cursor'),
            offset = u.getOffset(cursor);
        // This tells the other keyboard input events to suspend their actions until the compositionupdate or compositionend event.
        t.Input.composition = true;
        // This makes the IME show up right where the cursor is:
        t.Input.inputNode.style['top'] = offset.top + "px";
        t.Input.inputNode.style['left'] = offset.left + "px";
    },
    onCompositionEnd: function(e) {
        /**:GateOne.Terminal.Input.onCompositionEnd(e)

        Called when we encounter the `compositionend` event which indicates the `IME <http://en.wikipedia.org/wiki/Input_method>`_ has completed a composition.  Sends what was composed to the server and ensures that `GateOne.Terminal.Input.inputNode` is emptied & hidden.
        */
        logDebug('go.Terminal.Input.onCompositionEnd('+e.data+')');
        if (e.data) {
            t.sendString(t.Input.composition);
            t.Input.commandBuffer += t.Input.composition;
        }
        t.Input.inputNode.style['top'] = "0px";
        t.Input.inputNode.style['left'] = null;
        setTimeout(function() {
            // Wrapped in a timeout because Firefox fires the onkeyup event immediately after compositionend and we don't want that to result in double keystrokes
            t.Input.composition = null;
            t.Input.inputNode.value = "";
        }, 250);
    },
    onCompositionUpdate: function(e) {
        /**:GateOne.Terminal.Input.onCompositionUpdate(e)

        Called when we encounter the 'compositionupdate' event which indicates incoming characters; sets `GateOne.Terminal.Input.composition`.
        */
        logDebug('go.Terminal.Input.onCompositionUpdate() data: ' + e.data);
        if (e.data) {
            t.Input.composition = e.data;
        }
    },
    onKeyUp: function(e) {
        /**:GateOne.Terminal.Input.onKeyUp(e)

        Called when the terminal encounters a `keyup` event; just ensures that `GateOne.Terminal.Input.inputNode` is emptied so we don't accidentally send characters we shouldn't.
        */
        // Used in conjunction with GateOne.Input.modifiers() and GateOne.Input.onKeyDown() to emulate the meta key modifier using KEY_WINDOWS_LEFT and KEY_WINDOWS_RIGHT since "meta" doesn't work as an actual modifier on some browsers/platforms.
        var key = I.key(e),
            modifiers = I.modifiers(e);
        logDebug('GateOne.Terminal.Input.onKeyUp()', e);
        if (!t.Input.composition) {
            // If a non-shift modifier was depressed, emulate the given keystroke:
            if (!(modifiers.alt || modifiers.ctrl || modifiers.meta)) {
                // Just send the key if no modifiers
                // The value of the input node is really only necessary for IME-style input
                t.Input.inputNode.value = ""; // Keep it empty until needed
            }
        }
        E.trigger("terminal:keyup:" + I.humanReadableShortcut(key.string, modifiers).toLowerCase(), e);
    },
    onInput: function(e) {
        /**:GateOne.Terminal.Input.onInput(e)

        Attached to the `input` event on `GateOne.Terminal.Input.inputNode`; sends its contents.  If the user is in the middle of composing text via an `IME <http://en.wikipedia.org/wiki/Input_method>`_ it will wait until their composition is complete before sending the characters.
        */
        logDebug("go.Terminal.Input.onInput()", e);
        var inputNode = t.Input.inputNode,
            value = inputNode.value;
        if (!t.Input.composition) {
            t.Input.queue(value);
            t.Input.sendChars();
            inputNode.value = "";
            return false;
        }
    },
    onKeyDown: function(e) {
        /**:GateOne.Terminal.Input.onKeyDown(e)

        Handles keystroke events by determining which kind of event occurred and how/whether it should be sent to the server as specific characters or escape sequences.
        */
        // NOTE:  In order for e.preventDefault() to work in canceling browser keystrokes like Ctrl-C it must be called before keyup.
        var key = I.key(e),
            modifiers = I.modifiers(e),
            term = localStorage[prefix+'selectedTerminal'];
        logDebug("GateOne.Terminal.Input.onKeyDown() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + u.items(modifiers));
        if (I.handledGlobal) {
            // Global shortcuts take precedence
            return;
        }
        E.trigger("terminal:keydown:" + I.humanReadableShortcut(key.string, modifiers).toLowerCase(), e);
        t.Input.execKeystroke(e);
    },
    execKeystroke: function(e) {
        /**:GateOne.Terminal.Input.execKeystroke(e)

        For the Terminal application, executes the keystroke or shortcut associated with the given keydown event (*e*).
        */
        logDebug('GateOne.Terminal.Input.execKeystroke()', e);
        var key = I.key(e),
            modifiers = I.modifiers(e);
        if (key.string == 'KEY_WINDOWS_LEFT' || key.string == 'KEY_WINDOWS_RIGHT') {
            I.metaHeld = true; // Lets us emulate the "meta" modifier on browsers/platforms that don't get it right.
            return true; // Save some CPU
        }
        if (t.Input.composition) {
            return true; // Let the IME handle this keystroke
        }
        // If a non-shift modifier was depressed, emulate the given keystroke:
        if (modifiers.alt || modifiers.ctrl || modifiers.meta) {
            t.Input.emulateKeyCombo(e);
            t.Input.sendChars();
        } else { // Just send the key if no modifiers:
            t.Input.emulateKey(e);
            t.Input.sendChars();
        }
    },
    emulateKey: function(e, skipF11check) {
        /**:GateOne.Terminal.Input.emulateKey(e, skipF11check)

        This method handles all regular keys registered via onkeydown events (not onkeypress)
        If *skipF11check* is true, the F11 (fullscreen check) logic will be skipped.

        .. note:: :kbd:`Shift+key` also winds up being handled by this function.
        */
        var key = I.key(e),
            modifiers = I.modifiers(e),
            buffer = t.Input.bufferEscSeq,
            q = function(c) {
                e.preventDefault();
                t.Input.queue(c);
            },
            term = localStorage[prefix+'selectedTerminal'];
        logDebug("emulateKey() term: " + term + ", key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + u.items(modifiers));
        t.Input.sentBackspace = false;
        // Need some special logic for the F11 key since it controls fullscreen mode and without it, users could get stuck in fullscreen mode.
        if (!modifiers.shift && t.Input.F11 === true && !skipF11check) { // This is the *second* time F11 was pressed within 0.750 seconds.
            t.Input.F11 = false;
            clearTimeout(t.Input.F11timer);
            return; // Don't proceed further
        } else if (key.string == 'KEY_F11' && !skipF11check) { // Start tracking a new F11 event
            t.Input.F11 = true;
            e.preventDefault();
            clearTimeout(t.Input.F11timer);
            t.Input.F11timer = setTimeout(function() {
                t.Input.F11 = false;
                t.Input.emulateKey(e, true); // Pretend this never happened
                t.Input.sendChars();
            }, 750);
            v.displayMessage(gettext("NOTE: Rapidly pressing F11 twice will enable/disable fullscreen mode."));
            return;
        }
        if (key.string == "KEY_UNKNOWN") {
            return; // Without this, unknown keys end up sending a null character which isn't a good idea =)
        }
        if (!t.terminals[term]) {
            return; // Nothing to do
        }
        if (key.string != "KEY_SHIFT" && key.string != "KEY_CTRL" && key.string != "KEY_ALT" && key.string != "KEY_META") {
            // Scroll to bottom (seems like a normal convention for when a key is pressed in a terminal)
            u.scrollToBottom(t.terminals[term]['node']);
        }
        // Try using the keyTable first (so everything can be overridden)
        if (key.string in t.Input.keyTable) {
            if (t.Input.keyTable[key.string]) { // Not null
                var mode = t.terminals[term]['mode'], // Controls Application Cursor Keys (DECCKM)
                    keyboard = t.terminals[term]['keyboard']; // Controls most everything else (FKeys, Numpad, etc)
                if (!modifiers.shift) { // Non-modified keypress
                    if (key.string == 'KEY_BACKSPACE') {
                        // So we can switch between ^? and ^H
                        q(t.terminals[term]['backspace']);
                        if (t.Input.automaticBackspace) {
                            t.Input.sentBackspace = true;
                        }
                    } else if (u.startsWith('KEY_ARROW', key.string)) {
                        // Handle Application Cursor Keys stuff
                        if (t.Input.keyTable[key.string][mode]) {
                            q(t.Input.keyTable[key.string][mode]);
                        } else if (t.Input.keyTable[key.string]["default"]) {
                            // Fall back to using default
                            q(t.Input.keyTable[key.string]["default"]);
                        }
                    } else {
                        if (t.Input.keyTable[key.string][keyboard]) {
                            q(t.Input.keyTable[key.string][keyboard]);
                        } else if (t.Input.keyTable[key.string]["default"]) {
                            // Fall back to using default
                            q(t.Input.keyTable[key.string]["default"]);
                        }
                        if (key.string == 'KEY_ENTER') {
                            // Make a note of the text leading up to pressing of the Enter key so we can (do our best to) keep track of commands
                            E.trigger("terminal:enter_key");
                            t.Input.lastCommand = t.Input.commandBuffer;
                            t.Input.commandBuffer = "";
                        }
                    }
                } else { // Shift was held down
                    if (key.string == 'KEY_INSERT') {
                        t.paste(e);
                    } else if (t.Input.keyTable[key.string]['shift']) {
                        q(t.Input.keyTable[key.string]['shift']);
                    // This allows the browser's native pgup and pgdown to scroll up and down when the shift key is held:
                    } else if (key.string == 'KEY_PAGE_UP') {
                        e.preventDefault();
                        t.scrollPageUp();
                    } else if (key.string == 'KEY_PAGE_DOWN') {
                        e.preventDefault();
                        t.scrollPageDown();
                    } else if (t.Input.keyTable[key.string][keyboard]) { // Fall back to the mode's non-shift value
                        q(t.Input.keyTable[key.string][keyboard]);
                    }
                }
            } else {
                return; // Don't continue (null means null!)
            }
        }
    },
    emulateKeyCombo: function(e) {
        /**:GateOne.Terminal.Input.emulateKeyCombo(e)

        This method translates ctrl/alt/meta key combos such as :kbd:`Ctrl-c` into their string equivalents using `GateOne.Terminal.Input.keyTable` and sends them to the server.
        */
        var key = I.key(e),
            modifiers = I.modifiers(e),
            term = localStorage[prefix+'selectedTerminal'],
            keyboard = t.terminals[term]['keyboard'],
            buffer = t.Input.bufferEscSeq,
            pastearea,
            q = function(c) {
                e.preventDefault();
                t.Input.queue(c);
            };
        if (key.string == "KEY_SHIFT" || key.string == "KEY_ALT" || key.string == "KEY_CTRL" || key.string == "KEY_WINDOWS_LEFT" || key.string == "KEY_WINDOWS_RIGHT" || key.string == "KEY_UNKNOWN") {
            return; // For some reason if you press any combo of these keys at the same time it occasionally will send the keystroke as the second key you press.  It's odd but this ensures we don't act upon such things.
        }
        logDebug("GateOne.Terminal.Input.emulateKeyCombo() key.string: " + key.string + ", key.code: " + key.code + ", modifiers: " + go.Utils.items(modifiers));
        // Handle ctrl-<key> and ctrl-shift-<key> combos
        if (modifiers.ctrl && !modifiers.alt && !modifiers.meta) {
            if (t.Input.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (t.Input.keyTable[key.string][keyboard+'-ctrl']) {
                        q(t.Input.keyTable[key.string][keyboard+'-ctrl']);
                    } else if (t.Input.keyTable[key.string]['ctrl']) {
                        q(t.Input.keyTable[key.string]['ctrl']);
                    }
                } else {
                    if (t.Input.keyTable[key.string][keyboard+'-ctrl-shift']) {
                        q(t.Input.keyTable[key.string][keyboard+'-ctrl-shift']);
                    } else if (t.Input.keyTable[key.string]['ctrl-shift']) {
                        q(t.Input.keyTable[key.string]['ctrl-shift']);
                    }
                }
            } else {
                // Basic ASCII characters are pretty easy to convert to ctrl-<key> sequences...
                if (key.code >= 97 && key.code <= 122) {
                    q(String.fromCharCode(key.code - 96)); // Ctrl-[a-z]
                } else if (key.code >= 65 && key.code <= 90) {
                    if (key.code == 76) { // Ctrl-l gets some extra love
                        go.Terminal.fullRefresh(localStorage[go.prefs.prefix+'selectedTerminal']);
                        q(String.fromCharCode(key.code - 64));
                    } else if (key.string == 'KEY_C') {
                        // Check if the user has something highlighted.  If they do, assume they want to copy the text.
                        // NOTE:  This shouldn't be *too* intrusive on regular Ctrl-C behavior since you can just press it twice if something is selected and it will have the normal effect of sending a SIGINT.  I don't know about YOU but when Ctrl-C doesn't work the first time I instinctively just mash that combo a few times :)
                        if (u.getSelText()) {
                            // Something is slected, let the native keystroke do its thing (it will automatically de-select the text afterwards)
                            v.displayMessage("Text copied to clipboard.");
                            setTimeout(function() { t.Input.inputNode.focus(); }, 10);
                            return;
                        } else {
                            q(String.fromCharCode(key.code - 64)); // Send normal Ctrl-C
                        }
                    } else {
                        q(String.fromCharCode(key.code - 64)); // More Ctrl-[a-z]
                    }
                }
            }
        }
        // Handle alt-<key> and alt-shift-<key> combos
        if (modifiers.alt && !modifiers.ctrl && !modifiers.meta) {
            if (t.Input.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (t.Input.keyTable[key.string][keyboard+'-alt']) {
                        q(t.Input.keyTable[key.string][keyboard+'-alt']);
                    } else if (t.Input.keyTable[key.string]['alt']) {
                        q(t.Input.keyTable[key.string]['alt']);
                    }
                } else {
                    if (t.Input.keyTable[key.string][keyboard+'-alt-shift']) {
                        q(t.Input.keyTable[key.string][keyboard+'-alt-shift']);
                    } else if (t.Input.keyTable[key.string]['alt-shift']) {
                        q(t.Input.keyTable[key.string]['alt-shift']);
                    }
                }
            } else if (key.code >= 65 && key.code <= 90) {
                // Basic Alt-<key> combos are pretty straightforward (upper-case)
                if (!modifiers.shift) {
                    q(ESC+String.fromCharCode(key.code+32));
                } else {
                    q(ESC+String.fromCharCode(key.code));
                }
            }
        }
        // Handle meta-<key> and meta-shift-<key> combos
        if (!modifiers.alt && !modifiers.ctrl && modifiers.meta) {
            if (t.Input.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (t.Input.keyTable[key.string][keyboard+'-meta']) {
                        q(t.Input.keyTable[key.string][keyboard+'-meta']);
                    } else if (t.Input.keyTable[key.string]['meta']) {
                        q(t.Input.keyTable[key.string]['meta']);
                    }
                } else {
                    if (t.Input.keyTable[key.string][keyboard+'-meta-shift']) {
                        q(t.Input.keyTable[key.string][keyboard+'-meta-shift']);
                    } else if (t.Input.keyTable[key.string]['meta-shift']) {
                        q(t.Input.keyTable[key.string]['meta-shift']);
                    } else {
                        // Fall back to just the meta (ignore the shift)
                        if (t.Input.keyTable[key.string]['meta']) {
                            q(t.Input.keyTable[key.string]['meta']);
                        }
                    }
                }
            } else if (key.string == 'KEY_V') {
                // Macs need this to support pasting with ⌘-v (⌘-c doesn't need anything special)
                term = localStorage[go.prefs.prefix+'selectedTerminal'];
                pastearea = go.Terminal.terminals[term]['pasteNode'];
                pastearea.focus(); // So the browser will know to issue a paste event
            }
        }
        // Handle ctrl-alt-<key> and ctrl-alt-shift-<key> combos
        if (modifiers.alt && modifiers.ctrl && !modifiers.meta) {
            if (t.Input.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (t.Input.keyTable[key.string][keyboard+'-ctrl-alt']) {
                        q(t.Input.keyTable[key.string][keyboard+'-ctrl-alt']);
                    } else if (t.Input.keyTable[key.string]['ctrl-alt']) {
                        q(t.Input.keyTable[key.string]['ctrl-alt']);
                    } else if (t.Input.keyTable[key.string]['altgr']) {
                        // According to my research, AltGr is the same as sending ctrl-alt (in browsers anyway).  If this is incorrect please post it as an issue on Github!
                        q(t.Input.keyTable[key.string]['altgr']);
                    }
                } else {
                    if (t.Input.keyTable[key.string][keyboard+'-ctrl-alt-shift']) {
                        q(t.Input.keyTable[key.string][keyboard+'-ctrl-alt-shift']);
                    } else if (t.Input.keyTable[key.string]['ctrl-alt-shift']) {
                        q(t.Input.keyTable[key.string]['ctrl-alt-shift']);
                    } else if (t.Input.keyTable[key.string]['altgr-shift']) {
                        // According to my research, AltGr is the same as sending ctrl-alt (in browsers anyway).  If this is incorrect please post it as an issue on Github!
                        q(t.Input.keyTable[key.string]['altgr-shift']);
                    }
                }
            }
        }
        // Handle ctrl-alt-meta-<key> and ctrl-alt-meta-shift-<key> combos
        if (modifiers.alt && modifiers.ctrl && modifiers.meta) {
            if (t.Input.keyTable[key.string]) {
                if (!modifiers.shift) {
                    if (t.Input.keyTable[key.string][keyboard+'-ctrl-alt-meta']) {
                        q(t.Input.keyTable[key.string][keyboard+'-ctrl-alt-meta']);
                    } else if (t.Input.keyTable[key.string]['ctrl-alt-meta']) {
                        q(t.Input.keyTable[key.string]['ctrl-alt-meta']);
                    } else if (t.Input.keyTable[key.string]['altgr-meta']) {
                        q(t.Input.keyTable[key.string]['altgr-meta']);
                    }
                } else {
                    if (t.Input.keyTable[key.string][keyboard+'-ctrl-alt-meta-shift']) {
                        q(t.Input.keyTable[key.string][keyboard+'-ctrl-alt-meta-shift']);
                    } else if (t.Input.keyTable[key.string]['ctrl-alt-meta-shift']) {
                        q(t.Input.keyTable[key.string]['ctrl-alt-meta-shift']);
                    } else if (t.Input.keyTable[key.string]['altgr-meta-shift']) {
                        q(t.Input.keyTable[key.string]['altgr-meta-shift']);
                    }
                }
            }
        }
    },
    // TODO: Add a GUI for configuring the keyboard.
    // TODO: Remove the 'xterm' values and instead make an xterm-specific keyTable that only contains the difference.  Then change the logic in the keypress functions to first check for overridden values before falling back to the default keyTable.
    keyTable: {
        // Keys that need special handling.  'default' means vt100/vt220 (for the most part).  These can get overridden by plugins or the user (GUI forthcoming)
        // NOTE: If a key is set to null that means it won't send anything to the server onKeyDown (at all).
        'KEY_1': {'alt': ESC+"1", 'ctrl': "1", 'ctrl-shift': "1"},
        'KEY_2': {'alt': ESC+"2", 'ctrl': String.fromCharCode(0), 'ctrl-shift': String.fromCharCode(0)},
        'KEY_3': {'alt': ESC+"3", 'ctrl': ESC, 'ctrl-shift': ESC},
        'KEY_4': {'alt': ESC+"4", 'ctrl': String.fromCharCode(28), 'ctrl-shift': String.fromCharCode(28)},
        'KEY_5': {'alt': ESC+"5", 'ctrl': String.fromCharCode(29), 'ctrl-shift': String.fromCharCode(29)},
        'KEY_6': {'alt': ESC+"6", 'ctrl': String.fromCharCode(30), 'ctrl-shift': String.fromCharCode(30)},
        'KEY_7': {'alt': ESC+"7", 'ctrl': String.fromCharCode(31), 'ctrl-shift': String.fromCharCode(31)},
        'KEY_8': {'alt': ESC+"8", 'ctrl': String.fromCharCode(32), 'ctrl-shift': String.fromCharCode(32)},
        'KEY_9': {'alt': ESC+"9", 'ctrl': "9", 'ctrl-shift': "9"},
        'KEY_0': {'alt': ESC+"0", 'ctrl': "0", 'ctrl-shift': "0"},
        'KEY_G': {'altgr': "@"},
        // NOTE to self: xterm/vt100/vt220, for 'linux' (and possibly others) use [[A, [[B, [[C, [[D, and [[E
        'KEY_F1': {'default': ESC+"OP", 'alt': ESC+"O3P", 'sco': ESC+"[M", 'sco-ctrl': ESC+"[k"},
        'KEY_F2': {'default': ESC+"OQ", 'alt': ESC+"O3Q", 'sco': ESC+"[N", 'sco-ctrl': ESC+"[l"},
        'KEY_F3': {'default': ESC+"OR", 'alt': ESC+"O3R", 'sco': ESC+"[O", 'sco-ctrl': ESC+"[m"},
        'KEY_F4': {'default': ESC+"OS", 'alt': ESC+"O3S", 'sco': ESC+"[P", 'sco-ctrl': ESC+"[n"},
        'KEY_F5': {'default': ESC+"[15~", 'alt': ESC+"[15;3~", 'sco': ESC+"[Q", 'sco-ctrl': ESC+"[o"},
        'KEY_F6': {'default': ESC+"[17~", 'alt': ESC+"[17;3~", 'sco': ESC+"[R", 'sco-ctrl': ESC+"[p"},
        'KEY_F7': {'default': ESC+"[18~", 'alt': ESC+"[18;3~", 'sco': ESC+"[S", 'sco-ctrl': ESC+"[q"},
        'KEY_F8': {'default': ESC+"[19~", 'alt': ESC+"[19;3~", 'sco': ESC+"[T", 'sco-ctrl': ESC+"[r"},
        'KEY_F9': {'default': ESC+"[20~", 'alt': ESC+"[20;3~", 'sco': ESC+"[U", 'sco-ctrl': ESC+"[s"},
        'KEY_F10': {'default': ESC+"[21~", 'alt': ESC+"[21;3~", 'sco': ESC+"[V", 'sco-ctrl': ESC+"[t"},
        'KEY_F11': {'default': ESC+"[23~", 'alt': ESC+"[23;3~", 'sco': ESC+"[W", 'sco-ctrl': ESC+"[u"},
        'KEY_F12': {'default': ESC+"[24~", 'alt': ESC+"[24;3~"},
        'KEY_F13': {'default': ESC+"[25~", 'alt': ESC+"[25;3~", 'sco': ESC+"[X", 'sco-ctrl': ESC+"[v", 'xterm': ESC+"O2P"},
        'KEY_F14': {'default': ESC+"[26~", 'alt': ESC+"[26;3~", 'xterm': ESC+"O2Q"},
        'KEY_F15': {'default': ESC+"[28~", 'alt': ESC+"[28;3~", 'xterm': ESC+"O2R"},
        'KEY_F16': {'default': ESC+"[29~", 'alt': ESC+"[29;3~", 'xterm': ESC+"O2S"},
        'KEY_F17': {'default': ESC+"[31~", 'alt': ESC+"[31;3~", 'xterm': ESC+"[15;2~"},
        'KEY_F18': {'default': ESC+"[32~", 'alt': ESC+"[32;3~", 'xterm': ESC+"[17;2~"},
        'KEY_F19': {'default': ESC+"[33~", 'alt': ESC+"[33;3~", 'xterm': ESC+"[18;2~"},
        'KEY_F20': {'default': ESC+"[34~", 'alt': ESC+"[34;3~", 'xterm': ESC+"[19;2~"},
        'KEY_F21': {'default': ESC+"[20;2~"}, // All F-keys beyond this point are xterm-style (vt220 only goes up to F20)
        'KEY_F22': {'default': ESC+"[21;2~"},
        'KEY_F23': {'default': ESC+"[23;2~"},
        'KEY_F24': {'default': ESC+"[24;2~"},
        'KEY_F25': {'default': ESC+"O5P"},
        'KEY_F26': {'default': ESC+"O5Q"},
        'KEY_F27': {'default': ESC+"O5R"},
        'KEY_F28': {'default': ESC+"O5S"},
        'KEY_F29': {'default': ESC+"[15;5~"},
        'KEY_F30': {'default': ESC+"[17;5~"},
        'KEY_F31': {'default': ESC+"[18;5~"},
        'KEY_F32': {'default': ESC+"[19;5~"},
        'KEY_F33': {'default': ESC+"[20;5~"},
        'KEY_F34': {'default': ESC+"[21;5~"},
        'KEY_F35': {'default': ESC+"[23;5~"},
        'KEY_F36': {'default': ESC+"[24;5~"},
        'KEY_F37': {'default': ESC+"O6P"},
        'KEY_F38': {'default': ESC+"O6Q"},
        'KEY_F39': {'default': ESC+"O6R"},
        'KEY_F40': {'default': ESC+"O6S"},
        'KEY_F41': {'default': ESC+"[15;6~"},
        'KEY_F42': {'default': ESC+"[17;6~"},
        'KEY_F43': {'default': ESC+"[18;6~"},
        'KEY_F44': {'default': ESC+"[19;6~"},
        'KEY_F45': {'default': ESC+"[20;6~"},
        'KEY_F46': {'default': ESC+"[21;6~"},
        'KEY_F47': {'default': ESC+"[23;6~"},
        'KEY_F48': {'default': ESC+"[24;6~"},
        'KEY_ENTER': {'default': String.fromCharCode(13), 'ctrl': String.fromCharCode(13)},
        'KEY_NUM_PAD_ENTER': {'default': String.fromCharCode(13), 'ctrl': String.fromCharCode(13)},
        'KEY_BACKSPACE': {'default': String.fromCharCode(127), 'alt': ESC+String.fromCharCode(8)}, // Default is ^?. Will be changable to ^H eventually.
        'KEY_NUM_PAD_CLEAR': String.fromCharCode(12), // Not sure if this will do anything
        'KEY_SHIFT': null,
        'KEY_CTRL': null,
        'KEY_ALT': null,
        'KEY_PAUSE': {'default': ESC+"[28~", 'xterm': ESC+"O2R"}, // Same as F15
        'KEY_CAPS_LOCK': null,
        'KEY_ESCAPE': {'default': ESC},
        'KEY_TAB': {'default': String.fromCharCode(9), 'shift': ESC+"[Z"},
        'KEY_SPACEBAR': {'ctrl': String.fromCharCode(0)}, // NOTE: Do we *really* need to have an appmode option for this?
        'KEY_PAGE_UP': {'default': ESC+"[5~", 'alt': ESC+"[5;3~", 'sco': ESC+"[I"},
        'KEY_PAGE_DOWN': {'default': ESC+"[6~", 'alt': ESC+"[6;3~", 'sco': ESC+"[G"}, // ^[[6~
        'KEY_END': {'default': ESC+"[F", 'meta': ESC+"[1;1F", 'shift': ESC+"[1;2F", 'alt': ESC+"[1;3F", 'alt-shift': ESC+"[1;4F", 'ctrl': ESC+"[1;5F", 'ctrl-shift': ESC+"[1;6F", 'appmode': ESC+"OF", 'sco': ESC+"[F"},
        'KEY_HOME': {'default': ESC+"[H", 'meta': ESC+"[1;1H", 'shift': ESC+"[1;2H", 'alt': ESC+"[1;3H", 'alt-shift': ESC+"[1;4H", 'ctrl': ESC+"[1;5H", 'ctrl-shift': ESC+"[1;6H", 'appmode': ESC+"OH", 'sco': ESC+"[H"},
        'KEY_ARROW_LEFT': {'default': ESC+"[D", 'alt': ESC+"[1;3D", 'ctrl': ESC+"[1;5D", 'appmode': ESC+"OD"},
        'KEY_ARROW_UP': {'default': ESC+"[A", 'alt': ESC+"[1;3A", 'ctrl': ESC+"[1;5A", 'appmode': ESC+"OA"},
        'KEY_ARROW_RIGHT': {'default': ESC+"[C", 'alt': ESC+"[1;3C", 'ctrl': ESC+"[1;5C", 'appmode': ESC+"OC"},
        'KEY_ARROW_DOWN': {'default': ESC+"[B", 'alt': ESC+"[1;3B", 'ctrl': ESC+"[1;5B", 'appmode': ESC+"OB"},
        'KEY_PRINT_SCREEN': {'default': ESC+"[25~", 'xterm': ESC+"O2P"}, // Same as F13
        'KEY_INSERT': {'default': ESC+"[2~", 'meta': ESC+"[2;1~", 'alt': ESC+"[2;3~", 'alt-shift': ESC+"[2;4~", 'sco': ESC+"[L"},
        'KEY_DELETE': {'default': ESC+"[3~", 'shift': ESC+"[3;2~", 'alt': ESC+"[3;3~", 'alt-shift': ESC+"[3;4~", 'ctrl': ESC+"[3;5~", 'sco': ESC+"?"},
        'KEY_WINDOWS_LEFT': null,
        'KEY_WINDOWS_RIGHT': null,
// Keypad Enter        ^[OM
// Keypad Del          ^[On
// Keypad Ins          ^[Op
// Keypad Home         ^[Ow
// Keypad Pg Up        ^[Oy
// Keypad Pg Dn        ^[Os
// Keypad End          ^[Oq
// Keypad Cursor Down  ^[Or
// Keypad Cursor Left  ^[Ot
// Keypad Center       ^[Ou
// Keypad Cursor Right ^[Ov
// Keypad Cursor Up    ^[Ox
        'KEY_SELECT': String.fromCharCode(93),
        'KEY_NUM_PAD_ASTERISK': {'alt': ESC+"*", 'sco': ESC+"[OR"},
        'KEY_NUM_PAD_PLUS_SIGN': {'alt': ESC+"+", 'sco': ESC+"[Ol"},
// NOTE: The regular hyphen key shows up as a num pad hyphen in Firefox
        'KEY_NUM_PAD_HYPHEN-MINUS': {'shift': "_", 'alt': ESC+"-", 'alt-shift': ESC+"_"},
        'KEY_NUM_PAD_FULL_STOP': {'alt': ESC+"."},
        'KEY_NUM_PAD_SOLIDUS': {'alt': ESC+"/", 'sco': ESC+"[OQ"},
        'KEY_NUM_LOCK': {'sco': ESC+"[OP"}, // TODO: Double-check that NumLock isn't supposed to send some sort of wacky ESC sequence
        'KEY_SCROLL_LOCK': {'default': ESC+"[26~", 'xterm': ESC+"O2Q"}, // Same as F14
        'KEY_SEMICOLON': {'alt': ESC+";", 'alt-shift': ESC+":"},
        'KEY_EQUALS_SIGN': {'alt': ESC+"=", 'alt-shift': ESC+"+"},
        'KEY_COMMA': {'alt': ESC+",", 'alt-shift': ESC+"<"},
        'KEY_HYPHEN-MINUS': {'shift': "_", 'alt': ESC+"-", 'alt-shift': ESC+"_", 'sco': ESC+"[OS"},
        'KEY_FULL_STOP': {'alt': ESC+".", 'alt-shift': ESC+">"},
        'KEY_SOLIDUS': {'alt': ESC+"/", 'alt-shift': ESC+"?", 'ctrl': String.fromCharCode(31), 'ctrl-shift': String.fromCharCode(31)},
        'KEY_GRAVE_ACCENT':  {'alt': ESC+"`", 'alt-shift': ESC+"~", 'ctrl-shift': String.fromCharCode(30)},
        'KEY_LEFT_SQUARE_BRACKET':  {'altgr': "[", 'alt-shift': ESC+"{", 'ctrl': ESC},
        'KEY_REVERSE_SOLIDUS':  {'altgr': "|", 'altgr-shift': "\\"},
        'KEY_RIGHT_SQUARE_BRACKET':  {'altgr': "]", 'alt-shift': ESC+"}", 'ctrl': String.fromCharCode(29)},
        'KEY_APOSTROPHE': {'alt': ESC+"'", 'alt-shift': ESC+'"'}
    }
});

});
