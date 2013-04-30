
(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var go = GateOne,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    t = go.Terminal,
    prefix = go.prefs.prefix,
    noop = u.noop;

// Tunable playback prefs
if (!go.prefs.playbackFrames) {
    go.prefs.playbackFrames = 75; // Maximum number of session recording frames to store (in memory--for now)
}
// Let folks embedding Gate One skip loading the playback controls
if (typeof(go.prefs.showPlaybackControls) == "undefined") {
    go.prefs.showPlaybackControls = true;
}
// Don't want the client saving this
go.noSavePrefs['showPlaybackControls'] = null;

// GateOne.Playback
go.Base.module(GateOne, 'Playback', '1.1', ['Base', 'Net', 'Logging']);
go.Playback.clockElement = null; // Set with a global scope so we don't have to keep looking it up every time the clock is updated
go.Playback.progressBarElement = null; // Set with a global scope so we don't have to keep looking it up every time we update a terminal
go.Playback.progressBarMouseDown = false;
go.Playback.clockUpdater = null; // Will be a timer
go.Playback.frameUpdater = null; // Ditto
go.Playback.milliseconds = 0;
go.Playback.frameRate = 15; // Approximate
go.Playback.frameInterval = Math.round(1000/go.Playback.frameRate); // Needs to be converted to ms
go.Playback.frameObj = {'screen': null, 'time': null}; // Used to prevent garbage from building up
go.Base.update(GateOne.Playback, {
    init: function() {
        /**:GateOne.Playback.init()

        Adds the playback controls to Gate One and adds some GUI elements to the Tools & Info panel.  Also attaches the following events/functions::

            // Add our callback that adds an extra newline to all terminals
            GateOne.Events.on("terminal:new_terminal", GateOne.Playback.newTerminalCallback);
            // This makes sure our playback frames get added to the terminal object whenever the screen is updated
            GateOne.Events.on("terminal:term_updated", GateOne.Playback.pushPlaybackFrame);
            // This makes sure our prefs get saved along with everything else
            GateOne.Events.on("go:save_prefs", GateOne.Playback.savePrefsCallback)
            // Hide the playback controls when in grid view
            GateOne.Events.on("go:grid_view:open", p.hideControls);
            // Show the playback controls when no longer in grid view
            GateOne.Events.on("go:grid_view:close", p.showControls);
        */
        var p = go.Playback,
            pTag = u.getNode('#'+prefix+'info_actions'),
            prefsTableDiv2 = u.getNode('#'+prefix+'prefs_tablediv2'),
            prefsPanelRow = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelPlaybackLabel = u.createElement('span', {'id': 'prefs_playback_label', 'class': 'paneltablelabel'}),
            prefsPanelPlayback = u.createElement('input', {'id': 'prefs_playback', 'name': prefix+'prefs_playback', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            infoPanelSaveRecording = u.createElement('button', {'id': 'saverecording', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
        if (prefsTableDiv2) { // Only add to the prefs panel if it actually exists (i.e. not in embedded mode)
            prefsPanelPlaybackLabel.innerHTML = "<b>Playback Frames:</b> ";
            prefsPanelPlayback.value = go.prefs.playbackFrames;
            prefsPanelRow.appendChild(prefsPanelPlaybackLabel);
            prefsPanelRow.appendChild(prefsPanelPlayback);
            prefsTableDiv2.appendChild(prefsPanelRow);
            infoPanelSaveRecording.innerHTML = "Export Current Session";
            infoPanelSaveRecording.title = "Open the current terminal's playback history in a new window (which you can save to a file)."
            infoPanelSaveRecording.onclick = function() {
                p.saveRecording(localStorage[prefix+'selectedTerminal']);
            }
            if (pTag) {
                pTag.appendChild(infoPanelSaveRecording);
            }
        }
        if (go.prefs.showPlaybackControls) {
            // Make room for the playback controls by increasing rowAdjust (the number of rows in the terminal will be reduced by this amount)
            go.prefs.rowAdjust += 1;
        }
        // Add our callback that adds an extra newline to all terminals
        E.on("terminal:new_terminal", p.newTerminalCallback);
        // This makes sure our playback frames get added to the terminal object whenever the screen is updated
        E.on("terminal:term_updated", p.pushPlaybackFrame);
        // This makes sure our prefs get saved along with everything else
        E.on("go:save_prefs", p.savePrefsCallback)
        // Hide the playback controls when in grid view
        E.on("go:grid_view:open", p.hideControls);
        // Show the playback controls when no longer in grid view
        E.on("go:grid_view:close", p.showControls);
    },
    hideControls: function() {
        /**:GateOne.Playback.hideControls()

        Hides the playback controls.
        */
        u.hideElement('#'+prefix+'controlsContainer');
    },
    showControls: function() {
        /**:GateOne.Playback.showsControls()

        Shows the playback controls again after they've been hidden via :js:meth:`GateOne.Playback.hideControls`.
        */
        u.showElement('#'+prefix+'controlsContainer');
    },
    newTerminalCallback: function(term, calledTwice) {
        /**:GateOne.Playback.newTerminalCallback(term, calledTwice)

        This gets added to the 'terminal:new_terminal' event to ensure that there's some extra space at the bottom of each terminal to make room for the playback controls.

        It also calls :js:meth:`GateOne.Playback.addPlaybackControls` to make sure they're present only after a new terminal is open.
        */
        logDebug("GateOne.Playback.newTerminalCallback("+term+")");
        var p = go.Playback,
            termPre, screenSpan,
            emDimensions = u.getEmDimensions(go.prefs.goDiv),
            extraSpace = u.createElement('span', {'class': 'playback_spacer'}); // This goes at the bottom of terminals to fill the space where the playback controls go
        if (t.terminals[term]) {
            termPre = t.terminals[term]['node'];
            screenSpan = t.terminals[term]['screenNode'];
        } else {
            return; // Terminal was closed before the new_terminal event finished firing
        }
        if (go.prefs.showPlaybackControls) {
            extraSpace.innerHTML = ' \n'; // The playback controls should only have a height of 1em so a single newline should be fine
            if (termPre) {
                if (!termPre.querySelector('.playback_spacer')) {
                    termPre.appendChild(extraSpace);
                    if (u.isVisible(termPre)) {
                        if (go.prefs.rows) {
                            // Have to reset the current transform in order to take an accurate measurement:
                            v.applyTransform(termPre, '');
                            // Now we can proceed to measure and adjust the size of the terminal accordingly
                            var nodeHeight = screenSpan.getClientRects()[0].top,
                                transform = null;
                            if (nodeHeight < go.node.clientHeight) { // Resize to fit
                                var scale = go.node.clientHeight / (go.node.clientHeight - nodeHeight);
                                transform = "scale(" + scale + ", " + scale + ")";
                                v.applyTransform(termPre, transform);
                            }
                        }
                    }
                }
                // This is necessary because we add the extraSpace:
                u.scrollToBottom(termPre);
            } else {
                if (!calledTwice) {
                    // Try again...  It can take a moment for the server to respond and the terminal PRE to be created the first time
                    setTimeout(function() {
                        p.newTerminalCallback(term, true);
                    }, 1000);
                }
            }
            p.addPlaybackControls();
        }
    },
    pushPlaybackFrame: function(term) {
        /**:GateOne.Playback.pushPlaybackFrame(term)

        Adds the current screen of *term* to `GateOne.Terminal.terminals[term]['playbackFrames']`.
        */
        var p = go.Playback,
            playbackFrames = null;
        if (!p.progressBarElement) {
            p.progressBarElement = u.getNode('#'+prefix+'progressBar');
        }
        if (!t.terminals[term]['playbackFrames']) {
            t.terminals[term]['playbackFrames'] = [];
        }
        playbackFrames = t.terminals[term]['playbackFrames'];
        // Add the new playback frame to the terminal object
        if (playbackFrames.length < go.prefs.playbackFrames) {
            playbackFrames.push({'screen': t.terminals[term]['screen'].slice(0), 'time': new Date()});
        } else {
            // Preserve the existing objects in the array but override their values to avoid garbage collection
            for (var i = 0, len = playbackFrames.length - 1; i < len; i++) {
                playbackFrames[i] = playbackFrames[i + 1];
            }
            playbackFrames[playbackFrames.length - 1]['screen'] = t.terminals[term]['screen'].slice(0);
            playbackFrames[playbackFrames.length - 1]['time'] = new Date();
        }
        // Fix the progress bar if it is in a non-default state and stop playback
        if (p.progressBarElement) {
            if (p.progressBarElement.style.width != '0%') {
                clearInterval(p.frameUpdater);
                p.frameUpdater = null;
                p.milliseconds = 0; // Reset this in case the user was in the middle of playing something back when the screen updated
                p.progressBarElement.style.width = '0%';
            }
        }
    },
    savePrefsCallback: function() {
        /**:GateOne.Playback.savePrefsCallback()

        Called when the user clicks the "Save" button in the prefs panel.  Makes sure the 'playbackFrames' setting gets updated according to what the user entered into the form.
        */
        var playbackValue = u.getNode('#'+prefix+'prefs_playback').value;
        // Reset playbackFrames in case the user increased or decreased the value
        for (var termObj in t.terminals) {
            termObj['playbackFrames'] = [];
        }
        try {
            if (playbackValue) {
                go.prefs.playbackFrames = parseInt(playbackValue);
            }
        } finally {
            playbackValue = null;
        }
    },
    updateClock: function(/*opt:*/dateObj) {
        /**:GateOne.Playback.updateClock([dateObj])

        Updates the clock with the time in the given *dateObj*.

        If no *dateObj* is given, the clock will be updated with the current local time.
        */
        var p = go.Playback;
        if (!dateObj) { dateObj = new Date() }
        if (!p.clockElement) {
            p.clockElement = u.getNode('#'+prefix+'clock');
        }
        p.clockElement.innerHTML = dateObj.toLocaleTimeString();
    },
    startPlayback: function(term) {
        /**:GateOne.Playback.startPlayback(term)

        Plays back the given terminal's session in real-time.
        */
        var p = go.Playback;
        if (p.clockUpdater) { // Get the clock updating
            clearInterval(p.clockUpdater);
            p.clockUpdater = null;
        }
        p.frameUpdater = setInterval('GateOne.Playback.playbackRealtime('+term+')', p.frameInterval);
        E.trigger('playback:start_playback', term);
    },
    selectFrame: function(term, ms) {
        /**:GateOne.Playback.selectFrame(term, ms)

        For the given *term*, returns the last frame # with a 'time' less than the first frame's time + *ms*.
        */
        var firstFrameObj = t.terminals[term]['playbackFrames'][0],
            // Get a Date() that reflects the current position:
            frameTime = new Date(firstFrameObj['time']),
            frameObj = null,
            dateTime = null,
            framesLength = t.terminals[term]['playbackFrames'].length - 1,
            frame = 0;
        frameTime.setMilliseconds(frameTime.getMilliseconds() + ms);
        for (var i in t.terminals[term]['playbackFrames']) {
            frameObj = t.terminals[term]['playbackFrames'][i];
            dateTime = new Date(frameObj['time']);
            if (dateTime.getTime() > frameTime.getTime()) {
                frame = i;
                break
            }
        }
        return frame - 1;
    },
    playbackRealtime: function(term) {
        /**:GateOne.Playback.playbackRealtime(term)

        Plays back the given terminal's session one frame at a time.  Meant to be used inside of an interval timer.
        */
        var p = go.Playback,
            sideinfo = u.getNode('#'+prefix+'sideinfo'),
            progressBar = u.getNode('#'+prefix+'progressBar'),
            selectedFrame = t.terminals[term]['playbackFrames'][p.selectFrame(term, p.milliseconds)],
            frameTime = new Date(t.terminals[term]['playbackFrames'][0]['time']),
            lastFrame = t.terminals[term]['playbackFrames'].length - 1,
            lastDateTime = new Date(t.terminals[term]['playbackFrames'][lastFrame]['time']);
        frameTime.setMilliseconds(frameTime.getMilliseconds() + p.milliseconds);
        if (!selectedFrame) { // All done
            var playPause = u.getNode('#'+prefix+'playPause');
            playPause.innerHTML = '\u25B8';
            v.applyTransform(playPause, 'scale(1.5) translateY(-5%)'); // Needs to be resized a bit
            t.applyScreen(t.terminals[term]['playbackFrames'][lastFrame]['screen'], term);
            p.clockElement.innerHTML = lastDateTime.toLocaleTimeString();
            sideinfo.innerHTML = lastDateTime.toLocaleDateString();
            progressBar.style.width = '100%';
            clearInterval(p.frameUpdater);
            p.frameUpdater = null;
            p.milliseconds = 0;
            // Restart the clock
            p.clockUpdater = setInterval(p.updateClock, 1000);
            return
        }
        p.clockElement.innerHTML = frameTime.toLocaleTimeString();
        sideinfo.innerHTML = frameTime.toLocaleDateString();
        t.applyScreen(selectedFrame['screen'], term);
        // Update progress bar
        var firstDateTime = new Date(t.terminals[term]['playbackFrames'][0]['time']);
        var percent = Math.abs((lastDateTime.getTime() - frameTime.getTime())/(lastDateTime.getTime() - firstDateTime.getTime()) - 1);
        if (percent > 1) {
            percent = 1; // Last frame might be > 100% due to timing...  No biggie
        }
        progressBar.style.width = (percent*100) + '%';
        p.milliseconds += p.frameInterval; // Increment determines our framerate
    },
    // TODO: Figure out why this is breaking sometimes
    playPauseControl: function(e) {
        /**:GateOne.Playback.playPauseControl(e)

        Toggles play/pause inside the current terminal.  Meant to be attached to the Play/Pause icon's onclick event.
        */
        var p = go.Playback,
            playPause = u.getNode('#'+prefix+'playPause');
        if (playPause.innerHTML == '\u25B8') { // Using the \u form since minifiers don't like UTF-8 encoded characters like ▶
            p.startPlayback(localStorage[prefix+'selectedTerminal']);
            playPause.innerHTML = '=';
            // NOTE:  Using a transform here to increase the size and move the element because these changes are *relative* to the current state.
            v.applyTransform(playPause, 'rotate(90deg) scale(1.7) translate(5%, -15%)');
            E.trigger("playback:play");
        } else {
            playPause.innerHTML = '\u25B8';
            clearInterval(p.frameUpdater);
            p.frameUpdater = null;
            v.applyTransform(playPause, 'scale(1.5) translate(15%, -5%)'); // Set it back to normal
            E.trigger("playback:pause");
        }
    },
    addPlaybackControls: function() {
        /**:GateOne.Playback.addPlaybackControls()

        Adds the session playback controls to Gate One's element (:js:attr:`GateOne.prefs.goDiv`).

        .. note:: Will not add playback controls if they're already present.
        */
        var p = go.Playback,
            existingControls = u.getNode('#'+prefix+'playbackControls'),
            playPause = u.createElement('div', {'id': 'playPause', 'class': '✈playPause'}),
            progressBar = u.createElement('div', {'id': 'progressBar', 'class': '✈progressBar'}),
            progressBarContainer = u.createElement('div', {
                'id': 'progressBarContainer', 'class': '✈progressBarContainer', 'onmouseover': 'this.style.cursor = "col-resize"'}),
            clock = u.createElement('div', {'id': 'clock', 'class': '✈clock'}),
            playbackControls = u.createElement('div', {'id': 'playbackControls', 'class': '✈playbackControls'}),
            controlsContainer = u.createElement('div', {'id': 'controlsContainer', 'class': 'centertrans ✈controlsContainer'}),
            // Firefox doesn't support 'mousewheel'
            mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel";
        if (existingControls) {
            return; // Controls have already been added; Nothing to do
        }
        playPause.innerHTML = '\u25B8';
        v.applyTransform(playPause, 'scale(1.5) translateY(-5%)');
        playPause.onclick = p.playPauseControl;
        progressBarContainer.appendChild(progressBar);
        clock.innerHTML = '00:00:00';
        var updateProgress = function(e) {
            e.preventDefault();
            if (p.progressBarMouseDown) {
                var term = localStorage[prefix+'selectedTerminal'],
                    lX = e.layerX,
                    pB = u.getNode('#'+prefix+'progressBar'),
                    pBC = u.getNode('#'+prefix+'progressBarContainer'),
                    percent = (lX / pBC.offsetWidth),
                    frame = Math.round(t.terminals[term]['playbackFrames'].length * percent),
                    firstFrameTime = new Date(t.terminals[term]['playbackFrames'][0]['time']),
                    lastFrame = t.terminals[term]['playbackFrames'].length - 1,
                    lastFrameTime = new Date(t.terminals[term]['playbackFrames'][lastFrame]['time']);
                    totalMilliseconds = lastFrameTime.getTime() - firstFrameTime.getTime(),
                    currentFrame = frame - 1,
                    selectedFrame = t.terminals[term]['playbackFrames'][currentFrame],
                    frameTime = new Date(selectedFrame['time']);
                p.milliseconds = Math.round(totalMilliseconds * percent); // In case there's something being played back, this will skip forward
                if (p.clockUpdater) {
                    clearInterval(p.clockUpdater);
                    p.clockUpdater = null;
                }
                if (t.terminals[term]['scrollbackTimer']) {
                    clearTimeout(t.terminals[term]['scrollbackTimer']);
                }
                pB.style.width = (percent*100) + '%'; // Update the progress bar to reflect the user's click
                // Now update the terminal window to reflect the (approximate) selected frame
                t.applyScreen(selectedFrame['screen'], term);
                p.clockElement.innerHTML = frameTime.toLocaleTimeString();
            }
        }
        progressBarContainer.onmousedown = function(e) {
            var m = go.Input.mouse(e);
            if (!m.button.left) {
                return; // Don't do anything when someone right-clicks or middle-clicks on the progess bar
            }
            p.progressBarMouseDown = true;
            this.style.cursor = "col-resize";
            updateProgress(e);
        }
        progressBarContainer.onmouseup = function(e) {
            p.progressBarMouseDown = false;
        }
        progressBarContainer.onmousemove = function(e) {
            // First figure out where the user clicked and what % that represents in the playback buffer
            updateProgress(e);
        };
        playbackControls.appendChild(playPause);
        playbackControls.appendChild(progressBarContainer);
        playbackControls.appendChild(clock);
        controlsContainer.appendChild(playbackControls);
        go.node.appendChild(controlsContainer);
        if (!p.clockUpdater) { // Get the clock updating
            p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1000);
        }
        var wheelFunc = function(e) {
            var m = go.Input.mouse(e),
                percent = 0,
                modifiers = go.Input.modifiers(e),
                term = localStorage[prefix+'selectedTerminal'],
                firstFrameTime = new Date(t.terminals[term]['playbackFrames'][0]['time']),
                lastFrame = t.terminals[term]['playbackFrames'].length - 1,
                lastFrameTime = new Date(t.terminals[term]['playbackFrames'][lastFrame]['time']);
                totalMilliseconds = lastFrameTime.getTime() - firstFrameTime.getTime();
            if (t.terminals[term]) { // Only do this if there's an actual terminal present
                var terminalObj = t.terminals[term],
                    selectedFrame = terminalObj['playbackFrames'][p.currentFrame],
                    sbT = terminalObj['scrollbackTimer'];
                if (modifiers.shift) { // If shift is held, go back/forth in the recording instead of scrolling up/down
                    e.preventDefault();
                    // Stop updating the clock
                    clearInterval(p.clockUpdater);
                    p.clockUpdater = null;
                    clearInterval(go.scrollTimeout);
                    go.scrollTimeout = null;
                    if (sbT) {
                        clearTimeout(sbT);
                        sbT = null;
                    }
                    if (terminalObj['scrollbackVisible']) {
                        // This just ensures that we're keeping states set properly
                        terminalObj['scrollbackVisible'] = false;
                    }
                    if (typeof(p.currentFrame) == "undefined") {
                        p.currentFrame = terminalObj['playbackFrames'].length - 1; // Reset
                        selectedFrame = terminalObj['playbackFrames'][p.currentFrame]
                        p.progressBarElement.style.width = '100%';
                    }
                    if (m.wheel.x > 0 || (e.type == 'DOMMouseScroll' && m.wheel.y > 0)) { // Shift + scroll shows up as left/right scroll (x instead of y)
                        p.currentFrame = p.currentFrame + 1;
                        if (p.currentFrame >= terminalObj['playbackFrames'].length) {
                            p.currentFrame = terminalObj['playbackFrames'].length - 1; // Reset
                            p.progressBarElement.style.width = '100%';
                            t.applyScreen(terminalObj['screen'], term);
                            if (!p.clockUpdater) { // Get the clock updating again
                                p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1);
                            }
                            terminalObj['scrollbackTimer'] = setTimeout(function() { // Get the scrollback timer going again
                                v.enableScrollback(term);
                            }, 3500);
                        } else {
                            percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                            p.progressBarElement.style.width = percent + '%';
                            p.milliseconds = Math.round(totalMilliseconds * percent); // In case there's something being played back, this will skip forward
                            if (selectedFrame) {
                                t.applyScreen(selectedFrame['screen'], term);
                                u.getNode('#'+prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                            }
                        }
                    } else {
                        p.currentFrame = p.currentFrame - 1;
                        percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                        p.progressBarElement.style.width = percent + '%';
                        p.milliseconds = Math.round(totalMilliseconds * percent); // In case there's something being played back, this will skip forward
                        if (selectedFrame) {
                            t.applyScreen(selectedFrame['screen'], term);
                            u.getNode('#'+prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                        } else {
                            p.currentFrame = 0; // First frame
                            p.progressBarElement.style.width = '0%';
                        }
                    }
                }
            }
        }
        go.node.addEventListener(mousewheelevt, wheelFunc, true);
    },
    saveRecording: function(term) {
        /**:GateOne.Playback.saveRecording(term)

        Saves the session playback recording by sending the given *term*'s 'playbackFrames' to the server to have them rendered.

        When the server is done rendering the recording it will be sent back to the client via the 'save_file' WebSocket action.
        */
        var recording = JSON.stringify(go.Terminal.terminals[term]['playbackFrames']),
            settings = {
                'recording': recording,
                'prefix': prefix,
                'container': go.prefs.goDiv.split('#')[1],
                'theme_css': u.getNode('#'+prefix+'theme').innerHTML,
                'colors_css': u.getNode('#'+prefix+'text_colors').innerHTML
            };
        go.ws.send(JSON.stringify({'terminal:playback_save_recording': settings}));
    }
});

})(window);
