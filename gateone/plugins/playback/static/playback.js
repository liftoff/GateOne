(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// This is so we can copy a whole function so there's no circular references
Function.prototype.clone = function() {
    var fct = this;
    var clone = function() {
        return fct.apply(this, arguments);
    };
    clone.prototype = fct.prototype;
    for (property in fct) {
        if (fct.hasOwnProperty(property) && property !== 'prototype') {
            clone[property] = fct[property];
        }
    }
    return clone;
};

// Tunable playback prefs
if (!GateOne.prefs.playbackFrames) {
    GateOne.prefs.playbackFrames = 75; // Maximum number of session recording frames to store (in memory--for now)
}
// Let folks embedding Gate One skip loading the playback controls
if (typeof(GateOne.prefs.showPlaybackControls) == "undefined") {
    GateOne.prefs.showPlaybackControls = true;
}
// Don't want the client saving this
GateOne.noSavePrefs['showPlaybackControls'] = null;

// GateOne.Playback
GateOne.Base.module(GateOne, 'Playback', '1.1', ['Base', 'Net', 'Logging']);
GateOne.Playback.clockElement = null; // Set with a global scope so we don't have to keep looking it up every time the clock is updated
GateOne.Playback.progressBarElement = null; // Set with a global scope so we don't have to keep looking it up every time we update a terminal
GateOne.Playback.progressBarMouseDown = false;
GateOne.Playback.clockUpdater = null; // Will be a timer
GateOne.Playback.frameUpdater = null; // Ditto
GateOne.Playback.milliseconds = 0;
GateOne.Playback.frameRate = 15; // Approximate
GateOne.Playback.frameInterval = Math.round(1000/GateOne.Playback.frameRate); // Needs to be converted to ms
GateOne.Playback.frameObj = {'screen': null, 'time': null}; // Used to prevent garbage from building up
GateOne.Base.update(GateOne.Playback, {
    init: function() {
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            pTag = u.getNode('#'+prefix+'info_actions'),
            prefsTableDiv2 = u.getNode('#'+prefix+'prefs_tablediv2'),
            prefsPanelRow = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelPlaybackLabel = u.createElement('span', {'id': 'prefs_playback_label', 'class':'paneltablelabel'}),
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
                GateOne.Playback.saveRecording(localStorage[GateOne.prefs.prefix+'selectedTerminal']);
            }
            pTag.appendChild(infoPanelSaveRecording);
        }
        if (go.prefs.showPlaybackControls) {
            // Make room for the playback controls by increasing rowAdjust (the number of rows in the terminal will be reduced by this amount)
            go.prefs.rowAdjust += 1;
            go.Net.sendDimensionsCallbacks.push(p.termAdjust);
        }
        // Add our callback that adds an extra newline to all terminals
        go.Terminal.newTermCallbacks.push(p.newTerminalCallback);
        // This makes sure our playback frames get added to the terminal object whenever the screen is updated
        go.Terminal.updateTermCallbacks.push(p.pushPlaybackFrame);
        // This makes sure our prefs get saved along with everything else
        go.savePrefsCallbacks.push(p.savePrefsCallback);
    },
    termAdjust: function(term) {
        // Moves the terminal screen up a little bit using CSS transforms to ensure that the scrollback buffer is only visible if you scroll
        // This function gets added to GateOne.Net.sendDimensionsCallbacks
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            terminals = u.getNodes(go.prefs.goDiv + ' .terminal');
        // Wrapped in a timeout since it can take a moment for all the dimensions to settle down
        setTimeout(function() {
            u.toArray(terminals).forEach(function(termNode) {
                var term = termNode.id.split('term')[1],
                    termPre = u.getNode('#'+prefix+'term'+term+'_pre'),
                    distance = goDiv.clientHeight - termPre.offsetHeight;
                transform = "translateY(-" + distance + "px)";
                if (u.isVisible(termPre)) {
                    go.Visual.applyTransform(termPre, transform);
                }
                u.scrollToBottom(termPre);
            });
        }, 2000);
    },
    newTerminalCallback: function(term, calledTwice) {
        // This gets added to GateOne.Terminal.newTermCallbacks to ensure that there's some extra space at the bottom of each terminal to make room for the playback controls
        // It also calls addPlaybackControls() to make sure they're present only after a new terminal is open
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            termPre = u.getNode('#'+prefix+'term'+term+'_pre'),
            emDimensions = u.getEmDimensions(go.prefs.goDiv),
            extraSpace = u.createElement('span'); // This goes at the bottom of terminals to fill the space where the playback controls go
        if (go.prefs.showPlaybackControls) {
            extraSpace.innerHTML = ' \n'; // The playback controls should only have a height of 1em so a single newline should be fine
            if (termPre) {
                termPre.appendChild(extraSpace);
                if (u.isVisible(termPre)) {
                    if (go.prefs.rows) {
                        // Have to reset the current transform in order to take an accurate measurement:
                        go.Visual.applyTransform(termPre, '');
                        // Now we can proceed to measure and adjust the size of the terminal accordingly
                        var screenSpan = go.terminals[term]['screenNode'],
                            nodeHeight = screenSpan.getClientRects()[0].top,
                            transform = null;
                        if (nodeHeight < goDiv.clientHeight) { // Resize to fit
                            var scale = goDiv.clientHeight / (goDiv.clientHeight - nodeHeight);
                            transform = "scale(" + scale + ", " + scale + ")";
                            go.Visual.applyTransform(termPre, transform);
                        }
                    } else {
                        var distance = goDiv.clientHeight - termPre.offsetHeight;
                        transform = "translateY(-" + distance + "px)";
                        go.Visual.applyTransform(termPre, transform); // Move it to the top so the scrollback isn't visible unless you actually scroll
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
        // Adds the current screen in *term* to GateOne.terminals[term]['playbackFrames']
        var prefix = GateOne.prefs.prefix,
            playbackFrames = null;
        if (!GateOne.Playback.progressBarElement) {
            GateOne.Playback.progressBarElement = GateOne.Utils.getNode('#'+prefix+'progressBar');
        }
        if (!GateOne.terminals[term]['playbackFrames']) {
            GateOne.terminals[term]['playbackFrames'] = [];
        }
        playbackFrames = GateOne.terminals[term]['playbackFrames'];
        // Add the new playback frame to the terminal object
        if (playbackFrames.length < GateOne.prefs.playbackFrames) {
            playbackFrames.push({'screen': GateOne.terminals[term]['screen'].slice(0), 'time': new Date()});
        } else {
            // Preserve the existing objects in the array but override their values to avoid garbage collection
            for (var i = 0, len = playbackFrames.length - 1; i < len; i++) {
                playbackFrames[i] = playbackFrames[i + 1];
            }
            playbackFrames[playbackFrames.length - 1]['screen'] = GateOne.terminals[term]['screen'].slice(0);
            playbackFrames[playbackFrames.length - 1]['time'] = new Date();
        }
        // Fix the progress bar if it is in a non-default state and stop playback
        if (GateOne.Playback.progressBarElement) {
            if (GateOne.Playback.progressBarElement.style.width != '0%') {
                clearInterval(GateOne.Playback.frameUpdater);
                GateOne.Playback.frameUpdater = null;
                GateOne.Playback.milliseconds = 0; // Reset this in case the user was in the middle of playing something back when the screen updated
                GateOne.Playback.progressBarElement.style.width = '0%';
            }
        }
    },
    savePrefsCallback: function() {
        // Called when the user clicks the "Save" button in the prefs panel
        var prefix = GateOne.prefs.prefix,
            playbackValue = GateOne.Utils.getNode('#'+prefix+'prefs_playback').value;
        // Reset playbackFrames in case the user increased or decreased the value
        for (var termObj in GateOne.terminals) {
            termObj['playbackFrames'] = [];
        }
        try {
            if (playbackValue) {
                GateOne.prefs.playbackFrames = parseInt(playbackValue);
            }
        } finally {
            playbackValue = null;
        }
    },
    updateClock: function(/*opt:*/dateObj) {
        // Updates the clock with the time in the given *dateObj*.
        var go = GateOne,
            u = go.Utils
            p = go.Playback;
        // If no *dateObj* is given, the clock will be updated with the current local time
        if (!dateObj) { dateObj = new Date() }
        if (!p.clockElement) {
            p.clockElement = u.getNode('#'+go.prefs.prefix+'clock');
        }
        p.clockElement.innerHTML = dateObj.toLocaleTimeString();
    },
    startPlayback: function(term) {
        // Plays back the given terminal's session in real-time
        if (GateOne.Playback.clockUpdater) { // Get the clock updating
            clearInterval(GateOne.Playback.clockUpdater);
            GateOne.Playback.clockUpdater = null;
        }
        GateOne.Playback.frameUpdater = setInterval('GateOne.Playback.playbackRealtime('+term+')', GateOne.Playback.frameInterval);
    },
    selectFrame: function(term, ms) {
        // For the given terminal, returns the last frame # with a 'time' less than (first frame's time + *ms*)
        var go = GateOne,
            firstFrameObj = go.terminals[term]['playbackFrames'][0],
            // Get a Date() that reflects the current position:
            frameTime = new Date(firstFrameObj['time']),
            frameObj = null,
            dateTime = null,
            framesLength = go.terminals[term]['playbackFrames'].length - 1,
            frame = 0;
        frameTime.setMilliseconds(frameTime.getMilliseconds() + ms);
        for (var i in go.terminals[term]['playbackFrames']) {
            frameObj = go.terminals[term]['playbackFrames'][i];
            dateTime = new Date(frameObj['time']);
            if (dateTime.getTime() > frameTime.getTime()) {
                frame = i;
                break
            }
        }
        return frame - 1;
    },
    playbackRealtime: function(term) {
        // Plays back the given terminal's session one frame at a time.  Meant to be used inside of an interval timer.
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            sideinfo = u.getNode('#'+prefix+'sideinfo'),
            progressBar = u.getNode('#'+prefix+'progressBar'),
            selectedFrame = go.terminals[term]['playbackFrames'][p.selectFrame(term, p.milliseconds)],
            frameTime = new Date(go.terminals[term]['playbackFrames'][0]['time']),
            lastFrame = go.terminals[term]['playbackFrames'].length - 1,
            lastDateTime = new Date(go.terminals[term]['playbackFrames'][lastFrame]['time']);
        frameTime.setMilliseconds(frameTime.getMilliseconds() + p.milliseconds);
        if (!selectedFrame) { // All done
            var playPause = u.getNode('#'+prefix+'playPause');
            playPause.innerHTML = '\u25B8';
            go.Visual.applyTransform(playPause, 'scale(1.5) translateY(-5%)'); // Needs to be resized a bit
            go.Terminal.applyScreen(go.terminals[term]['playbackFrames'][lastFrame]['screen'], term);
            p.clockElement.innerHTML = lastDateTime.toLocaleTimeString();
            sideinfo.innerHTML = lastDateTime.toLocaleDateString();
            progressBar.style.width = '100%';
            clearInterval(p.frameUpdater);
            p.frameUpdater = null;
            p.milliseconds = 0;
            // Restart the clock
            p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1000);
            return
        }
        p.clockElement.innerHTML = frameTime.toLocaleTimeString();
        sideinfo.innerHTML = frameTime.toLocaleDateString();
        go.Terminal.applyScreen(selectedFrame['screen'], term);
        // Update progress bar
        var firstDateTime = new Date(go.terminals[term]['playbackFrames'][0]['time']);
        var percent = Math.abs((lastDateTime.getTime() - frameTime.getTime())/(lastDateTime.getTime() - firstDateTime.getTime()) - 1);
        if (percent > 1) {
            percent = 1; // Last frame might be > 100% due to timing...  No biggie
        }
        progressBar.style.width = (percent*100) + '%';
        p.milliseconds += p.frameInterval; // Increment determines our framerate
    },
    // TODO: Figure out why this is breaking sometimes
    playPauseControl: function(e) {
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            playPause = u.getNode('#'+prefix+'playPause');
        if (playPause.innerHTML == '\u25B8') { // Using the \u form since minifiers don't like UTF-8 encoded characters like ▶
            p.startPlayback(localStorage[prefix+'selectedTerminal']);
            playPause.innerHTML = '=';
            // NOTE:  Using a transform here to increase the size and move the element because these changes are *relative* to the current state.
            go.Visual.applyTransform(playPause, 'rotate(90deg) scale(1.7) translate(5%, -15%)');
        } else {
            playPause.innerHTML = '\u25B8';
            clearInterval(p.frameUpdater);
            p.frameUpdater = null;
            go.Visual.applyTransform(playPause, 'scale(1.5) translate(15%, -5%)'); // Set it back to normal
        }
    },
    addPlaybackControls: function() {
        // Add the session playback controls to Gate One
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            existingControls = u.getNode('#'+prefix+'playbackControls'),
            playPause = u.createElement('div', {'id': 'playPause'}),
            progressBar = u.createElement('div', {'id': 'progressBar'}),
            progressBarContainer = u.createElement('div', {
                'id': 'progressBarContainer', 'onmouseover': 'this.style.cursor = "col-resize"'}),
            clock = u.createElement('div', {'id': 'clock'}),
            playbackControls = u.createElement('div', {'id': 'playbackControls'}),
            controlsContainer = u.createElement('div', {'id': 'controlsContainer', 'class': 'centertrans'}),
            goDiv = u.getNode(go.prefs.goDiv),
            style = window.getComputedStyle(goDiv, null),
            emDimensions = u.getEmDimensions(goDiv),
            controlsWidth = parseInt(style.width.split('px')[0]) - (emDimensions.w * 3),
            // Firefox doesn't support 'mousewheel'
            mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel";
        if (existingControls) {
            return; // Controls have already been added; Nothing to do
        }
        playPause.innerHTML = '\u25B8';
        go.Visual.applyTransform(playPause, 'scale(1.5) translateY(-5%)');
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
                    frame = Math.round(go.terminals[term]['playbackFrames'].length * percent),
                    firstFrameTime = new Date(go.terminals[term]['playbackFrames'][0]['time']),
                    lastFrame = go.terminals[term]['playbackFrames'].length - 1,
                    lastFrameTime = new Date(go.terminals[term]['playbackFrames'][lastFrame]['time']);
                    totalMilliseconds = lastFrameTime.getTime() - firstFrameTime.getTime(),
                    currentFrame = frame - 1,
                    selectedFrame = go.terminals[term]['playbackFrames'][currentFrame],
                    frameTime = new Date(selectedFrame['time']);
                p.milliseconds = Math.round(totalMilliseconds * percent); // In case there's something being played back, this will skip forward
                if (p.clockUpdater) {
                    clearInterval(p.clockUpdater);
                    p.clockUpdater = null;
                }
                if (go.terminals[term]['scrollbackTimer']) {
                    clearTimeout(go.terminals[term]['scrollbackTimer']);
                }
                pB.style.width = (percent*100) + '%'; // Update the progress bar to reflect the user's click
                // Now update the terminal window to reflect the (approximate) selected frame
                go.Terminal.applyScreen(selectedFrame['screen'], term);
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
        goDiv.appendChild(controlsContainer);
        if (!p.clockUpdater) { // Get the clock updating
            p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1000);
        }
        var wheelFunc = function(e) {
            var m = go.Input.mouse(e),
                percent = 0,
                modifiers = go.Input.modifiers(e),
                term = localStorage[prefix+'selectedTerminal'],
                firstFrameTime = new Date(go.terminals[term]['playbackFrames'][0]['time']),
                lastFrame = go.terminals[term]['playbackFrames'].length - 1,
                lastFrameTime = new Date(go.terminals[term]['playbackFrames'][lastFrame]['time']);
                totalMilliseconds = lastFrameTime.getTime() - firstFrameTime.getTime();
            if (go.terminals[term]) { // Only do this if there's an actual terminal present
                var terminalObj = go.terminals[term],
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
                            go.Terminal.applyScreen(terminalObj['screen'], term);
                            if (!p.clockUpdater) { // Get the clock updating again
                                p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1);
                            }
                            terminalObj['scrollbackTimer'] = setTimeout(function() { // Get the scrollback timer going again
                                go.Visual.enableScrollback(term);
                            }, 3500);
                        } else {
                            percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                            p.progressBarElement.style.width = percent + '%';
                            p.milliseconds = Math.round(totalMilliseconds * percent); // In case there's something being played back, this will skip forward
                            if (selectedFrame) {
                                go.Terminal.applyScreen(selectedFrame['screen'], term);
                                u.getNode('#'+prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                            }
                        }
                    } else {
                        p.currentFrame = p.currentFrame - 1;
                        percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                        p.progressBarElement.style.width = percent + '%';
                        p.milliseconds = Math.round(totalMilliseconds * percent); // In case there's something being played back, this will skip forward
                        if (selectedFrame) {
                            go.Terminal.applyScreen(selectedFrame['screen'], term);
                            u.getNode('#'+prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                        } else {
                            p.currentFrame = 0; // First frame
                            p.progressBarElement.style.width = '0%';
                        }
                    }
                }
            }
        }
        goDiv.addEventListener(mousewheelevt, wheelFunc, true);
    },
    saveRecording: function(term) {
        // Saves the session playback recording by sending the playbackFrames to the server to have them rendered.
        // When the server is done rendering the recording it will be sent back to the client via the save_file action.
        var go = GateOne,
            u = go.Utils,
            recording = JSON.stringify(go.terminals[term]['playbackFrames']),
            settings = {'recording': recording, 'prefix': go.prefs.prefix, 'container': go.prefs.goDiv.split('#')[1], 'theme': go.prefs.theme, 'colors': go.prefs.colors};
        go.ws.send(JSON.stringify({'playback_save_recording': settings}));
    }
});

})(window);
