(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;

// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = noop;
var logError = noop;
var logWarning = noop;
var logInfo = noop;
var logDebug = noop;

// Tunable playback prefs
if (!GateOne.prefs.playbackFrames) {
    GateOne.prefs.playbackFrames = 200; // Maximum number of session recording frames to store (in memory--for now)
}

// GateOne.Playback
GateOne.Base.module(GateOne, 'Playback', '0.9', ['Base', 'Net', 'Logging']);
GateOne.Playback.clockElement = null; // Set with a global scope so we don't have to keep looking it up every time the clock is updated
GateOne.Playback.progressBarElement = null; // Set with a global scope so we don't have to keep looking it up every time we update a terminal
GateOne.Playback.progressBarMouseDown = false;
GateOne.Playback.clockUpdater = null; // Will be a timer
GateOne.Playback.frameUpdater = null; // Ditto
GateOne.Playback.milliseconds = 0;
GateOne.Playback.frameRate = 15; // Approximate
GateOne.Playback.frameInterval = Math.round(1000/GateOne.Playback.frameRate); // Needs to be converted to ms
GateOne.Base.update(GateOne.Playback, {
    init: function() {
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            pTag = u.getNode('#'+prefix+'info_actions'),
            prefsTableDiv2 = u.getNode('#'+prefix+'prefs_tablediv2'),
            prefsPanelRow = u.createElement('div', {'class':'paneltablerow'}),
            prefsPanelPlaybackLabel = u.createElement('span', {'id': prefix+'prefs_playback_label', 'class':'paneltablelabel'}),
            prefsPanelPlayback = u.createElement('input', {'id': prefix+'prefs_playback', 'name': prefix+'prefs_playback', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            infoPanelSaveRecording = u.createElement('button', {'id': prefix+'saverecording', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        if (go.Logging) {
            logFatal = go.Logging.logFatal;
            logError = go.Logging.logError;
            logWarning = go.Logging.logWarning;
            logInfo = go.Logging.logInfo;
            logDebug = go.Logging.logDebug;
        }
        prefsPanelPlaybackLabel.innerHTML = "<b>Playback Frames:</b> ";
        prefsPanelPlayback.value = go.prefs.playbackFrames;
        prefsPanelRow.appendChild(prefsPanelPlaybackLabel);
        prefsPanelRow.appendChild(prefsPanelPlayback);
        prefsTableDiv2.appendChild(prefsPanelRow);
        infoPanelSaveRecording.innerHTML = "View Session Recording";
        infoPanelSaveRecording.onclick = function() {
            p.saveRecording(localStorage[prefix+'selectedTerminal']);
        }
        pTag.appendChild(infoPanelSaveRecording);
        setTimeout(function() {
            p.addPlaybackControls();
        }, 2000);
        // This makes sure our playback frames get added to the terminal object whenever the screen is updated
        go.Terminal.updateTermCallbacks.push(p.pushPlaybackFrame);
        // This makes sure our prefs get saved along with everything else
        go.savePrefsCallbacks.push(p.savePrefsCallback);
    },
    pushPlaybackFrame: function(term) {
        // Adds the current screen in *term* to GateOne.terminals[term]['playbackFrames']
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            frameObj = {'screen': go.terminals[term]['screen'], 'time': new Date()};
        if (!p.progressBarElement) {
            p.progressBarElement = u.getNode('#'+prefix+'progressBar');
        }
        if (!go.terminals[term]['playbackFrames']) {
            go.terminals[term]['playbackFrames'] = [];
        }
        go.terminals[term]['playbackFrames'].push(frameObj);
        if (go.terminals[term]['playbackFrames'].length > go.prefs.playbackFrames) {
            // Reduce it to fit the max
            go.terminals[term]['playbackFrames'].reverse(); // Have to reverse it before we truncate
            go.terminals[term]['playbackFrames'].length = go.prefs.playbackFrames; // Love that length is assignable!
            go.terminals[term]['playbackFrames'].reverse(); // Put it back in the right order
        }
        // Fix the progress bar if it is in a non-default state and stop playback
        if (p.progressBarElement) {
            if (p.progressBarElement.style.width != '0%') {
                clearInterval(p.frameUpdater);
                p.frameUpdater = null;
                p.milliseconds = 0; // Reset this in case the user was in the middle of playing something back when the screen updated
                p.progressBarElement.style.width = '0%';
                // Also make sure the pastearea is put back if missing
                u.showElement('#'+prefix+'pastearea');
            }
        }
    },
    savePrefsCallback: function() {
        // Called when the user clicks the "Save" button in the prefs panel
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix;
        var playbackValue = u.getNode('#'+prefix+'prefs_playback').value;
        if (playbackValue) {
            go.prefs.playbackFrames = parseInt(playbackValue);
        }
    },
    updateClock: function(/*opt:*/dateObj) {
        // Updates the clock with the time in the given *dateObj*.
        // If no *dateObj* is given, the clock will be updated with the current local time
        var go = GateOne,
            u = go.Utils,
            p = go.Playback;
        if (!dateObj) { dateObj = new Date() }
        if (!p.clockElement) {
            p.clockElement = u.getNode('#'+go.prefs.prefix+'clock');
        }
        p.clockElement.innerHTML = dateObj.toLocaleTimeString();
    },
    startPlayback: function(term) {
        // Plays back the given terminal's session in real-time
        var go = GateOne,
            p = go.Playback;
        if (p.clockUpdater) { // Get the clock updating
            clearInterval(p.clockUpdater);
            p.clockUpdater = null;
        }
        p.frameUpdater = setInterval('GateOne.Playback.playbackRealtime('+term+')', p.frameInterval);
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
        frameTime.setMilliseconds(frameTime.getMilliseconds() + go.Playback.milliseconds);
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
            selectedFrame = go.terminals[term]['playbackFrames'][p.selectFrame(term, p.milliseconds)],
            frameTime = new Date(go.terminals[term]['playbackFrames'][0]['time']),
            lastFrame = go.terminals[term]['playbackFrames'].length - 1,
            lastDateTime = new Date(go.terminals[term]['playbackFrames'][lastFrame]['time']);
        frameTime.setMilliseconds(frameTime.getMilliseconds() + p.milliseconds);
        if (!selectedFrame) { // All done
            var playPause = u.getNode('#'+prefix+'playPause');
            playPause.innerHTML = '▶';
            go.Visual.applyTransform(playPause, ''); // Set it back to normal
            u.getNode('#'+prefix+'term'+term+'_pre').innerHTML = go.terminals[term]['playbackFrames'][lastFrame]['screen'].join('\n');
            u.getNode('#'+prefix+'clock').innerHTML = lastDateTime.toLocaleTimeString();
            u.getNode('#'+prefix+'sideinfo').innerHTML = lastDateTime.toLocaleDateString();
            u.getNode('#'+prefix+'progressBar').style.width = '100%';
            clearInterval(p.frameUpdater);
            p.frameUpdater = null;
            p.milliseconds = 0;
            // Restart the clock
            p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1000);
            return
        }
        u.getNode('#'+prefix+'clock').innerHTML = frameTime.toLocaleTimeString();
        u.getNode('#'+prefix+'sideinfo').innerHTML = frameTime.toLocaleDateString();
        u.getNode('#'+prefix+'term'+term+'_pre').innerHTML = selectedFrame['screen'].join('\n');
        // Update progress bar
        var firstDateTime = new Date(go.terminals[term]['playbackFrames'][0]['time']);
        var percent = Math.abs((lastDateTime.getTime() - frameTime.getTime())/(lastDateTime.getTime() - firstDateTime.getTime()) - 1);
        if (percent > 1) {
            percent = 1; // Last frame might be > 100% due to timing...  No biggie
        }
        u.getNode('#'+prefix+'progressBar').style.width = (percent*100) + '%';
        p.milliseconds += p.frameInterval; // Increment determines our framerate
    },
    playPauseControl: function(e) {
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            playPause = u.getNode('#'+prefix+'playPause');
        if (playPause.innerHTML == '▶') {
            p.startPlayback(localStorage[prefix+'selectedTerminal']);
            playPause.innerHTML = '=';
            go.Visual.applyTransform(playPause, 'rotate(90deg)');
        } else {
            playPause.innerHTML = '▶';
            clearInterval(p.frameUpdater);
            p.frameUpdater = null;
            go.Visual.applyTransform(playPause, ''); // Set it back to normal
        }
    },
    addPlaybackControls: function() {
        // Add the session playback controls to Gate One
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            prefix = go.prefs.prefix,
            playPause = u.createElement('div', {'id': prefix+'playPause'}),
            progressBar = u.createElement('div', {'id': prefix+'progressBar'}),
            progressBarContainer = u.createElement('div', {
                'id': prefix+'progressBarContainer', 'onmouseover': 'this.style.cursor = "col-resize"'}),
            clock = u.createElement('div', {'id': prefix+'clock'}),
            playbackControls = u.createElement('div', {'id': prefix+'playbackControls'}),
            controlsContainer = u.createElement('div', {'id': prefix+'controlsContainer'}),
            goDiv = u.getNode(go.prefs.goDiv),
            style = window.getComputedStyle(goDiv, null),
            emDimensions = u.getEmDimensions(goDiv),
            controlsWidth = parseInt(style.width.split('px')[0]) - (emDimensions.w * 3),
            // Firefox doesn't support 'mousewheel'
            mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel";
        playPause.innerHTML = '▶';
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
                    currentFrame = frame - 1,
                    selectedFrame = go.terminals[term]['playbackFrames'][currentFrame];
                var dateTime = new Date(selectedFrame['time']);
                if (p.clockUpdater) {
                    clearInterval(p.clockUpdater);
                    p.clockUpdater = null;
                }
                if (go.terminals[term]['scrollbackTimer']) {
                    clearTimeout(go.terminals[term]['scrollbackTimer']);
                }
                pB.style.width = (percent*100) + '%'; // Update the progress bar to reflect the user's click
                // Now update the terminal window to reflect the (approximate) selected frame
                u.getNode('#'+prefix+'term' + term + '_pre').innerHTML = selectedFrame['screen'].join('\n');
                u.getNode('#'+prefix+'clock').innerHTML = dateTime.toLocaleTimeString();
            }
        }
        progressBarContainer.onmousedown = function(e) {
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
                terminalObj = go.terminals[term],
                selectedFrame = terminalObj['playbackFrames'][p.currentFrame],
                sbT = terminalObj['scrollbackTimer'];
            if (modifiers.shift) { // If shift is held, go back/forth in the recording instead of scrolling up/down
                e.preventDefault();
                // Stop updating the clock
                clearInterval(p.clockUpdater);
                p.clockUpdater = null;
                // Prevent the pastearea from re-enabling itself
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
                if (m.wheel.x > 0) { // Shift + scroll shows up as left/right scroll (x instead of y)
                    p.currentFrame = p.currentFrame + 1;
                    if (p.currentFrame >= terminalObj['playbackFrames'].length) {
                        p.currentFrame = terminalObj['playbackFrames'].length - 1; // Reset
                        p.progressBarElement.style.width = '100%';
                        u.getNode('#'+prefix+'term' + term + '_pre').innerHTML = terminalObj['screen'].join('\n');
                        if (!p.clockUpdater) { // Get the clock updating again
                            p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1);
                        }
                        terminalObj['scrollbackTimer'] = setTimeout(function() { // Get the scrollback timer going again
                            go.Visual.enableScrollback(term);
                        }, 3500);
                        // Add back the pastearea
                        u.showElement('#'+prefix+'pastearea');
                    } else {
                        percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                        p.progressBarElement.style.width = percent + '%';
                        if (selectedFrame) {
                            u.getNode('#'+prefix+'term' + term + '_pre').innerHTML = selectedFrame['screen'].join('\n');
                            u.getNode('#'+prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                        }
                    }
                } else {
                    p.currentFrame = p.currentFrame - 1;
                    percent = (p.currentFrame / terminalObj['playbackFrames'].length) * 100;
                    p.progressBarElement.style.width = percent + '%';
                    if (selectedFrame) {
                        u.getNode('#'+prefix+'term' + term + '_pre').innerHTML = selectedFrame['screen'].join('\n');
                        u.getNode('#'+prefix+'clock').innerHTML = selectedFrame['time'].toLocaleTimeString();
                    } else {
                        p.currentFrame = 0; // First frame
                        p.progressBarElement.style.width = '0%';
                    }
                }
            }
        }
        goDiv.addEventListener(mousewheelevt, wheelFunc, true);
    },
    saveRecording: function(term) {
        // Saves the session playback recording
        var go = GateOne,
            recording = JSON.stringify(go.terminals[term]['playbackFrames']),
        // This creates a form to POST our saved session to /recording on the server
        // NOTE: The server just returns the same data wrapped in a easy-to-use template
            form = go.Utils.createElement('form', {
                'method': 'post',
                'action': go.prefs.url + 'recording?r=' + new Date().getTime(),
                'target': '_blank'
            }),
            recordingField = go.Utils.createElement('textarea', {'name': 'recording'}),
            themeField = go.Utils.createElement('input', {'name': 'theme'}),
            colorsField = go.Utils.createElement('input', {'name': 'colors'}),
            containerField = go.Utils.createElement('input', {'name': 'container'}),
            prefixField = go.Utils.createElement('input', {'name': 'prefix'});
        recordingField.value = recording;
        form.appendChild(recordingField);
        themeField.value = go.prefs.theme;
        form.appendChild(themeField);
        colorsField.value = go.prefs.colors;
        form.appendChild(colorsField);
        containerField.value = go.prefs.goDiv.split('#')[1];
        form.appendChild(containerField);
        prefixField.value = go.prefs.prefix;
        form.appendChild(prefixField);
        document.body.appendChild(form);
        form.submit();
        setTimeout(function() {
            // No reason to keep this around
            document.body.removeChild(form);
        }, 1000);
    }
});

})(window);