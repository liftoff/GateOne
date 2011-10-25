(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;

// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = null;
var logError = null;
var logWarning = null;
var logInfo = null;
var logDebug = null;

// Tunable playback prefs
GateOne.prefs.playbackFrames = 200; // Maximum number of session recording frames to store (in memory--for now)

// GateOne.Playback
GateOne.Base.module(GateOne, 'Playback', '0.9', ['Base', 'Net', 'Logging']);
GateOne.Playback.progressBarMouseDown = false;
GateOne.Playback.clockUpdater = null; // Will be a timer
GateOne.Playback.frameUpdater = null; // Ditto
GateOne.Playback.milliseconds = 0;
GateOne.Playback.frameRate = 15; // Approximate
GateOne.Playback.frameInterval = Math.round(1000/GateOne.Playback.frameRate); // Needs to be converted to ms
GateOne.Base.update(GateOne.Playback, {
    init: function() {
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        logFatal = GateOne.Logging.logFatal || noop;
        logError = GateOne.Logging.logError || noop;
        logWarning = GateOne.Logging.logWarning || noop;
        logInfo = GateOne.Logging.logInfo || noop;
        logDebug = GateOne.Logging.logDebug || noop;
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            p = u.getNode('#'+prefix+'info_actions'),
            infoPanelSaveRecording = u.createElement('button', {'id': prefix+'saverecording', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
        infoPanelSaveRecording.innerHTML = "View Session Recording";
        infoPanelSaveRecording.onclick = function() {
            go.Playback.saveRecording(localStorage['selectedTerminal']);
        }
        p.appendChild(infoPanelSaveRecording);
    },
    updateClock: function(/*opt:*/dateObj) {
        // Updates the clock with the time in the given *dateObj*.
        // If no *dateObj* is given, the clock will be updated with the current local time
        if (!dateObj) { dateObj = new Date() }
        GateOne.Utils.getNode('#'+GateOne.prefs.prefix+'clock').innerHTML = dateObj.toLocaleTimeString();
    },
    startPlayback: function() {
        GateOne.Playback.frameUpdater = setInterval('playbackRealtime()', GateOne.Playback.frameInterval);
    },
    selectFrame: function(term, ms) {
        // For the given terminal, returns the last frame # with a 'time' less than (first frame's time + *ms*)
        var firstFrameObj = terminals[term]['playbackFrames'][0],
            // Get a Date() that reflects the current position:
            frameTime = new Date(firstFrameObj['time']),
            frameObj = null,
            dateTime = null,
            framesLength = terminals[term]['playbackFrames'].length - 1,
            frame = 0;
        frameTime.setMilliseconds(frameTime.getMilliseconds() + milliseconds);
        for (i in terminals[term]['playbackFrames']) {
            frameObj = terminals[term]['playbackFrames'][i];
            dateTime = new Date(frameObj['time']);
            if (dateTime.getTime() > frameTime.getTime()) {
                frame = i;
                break
            }
        }
        return frame - 1;
    },
    playbackRealtime: function(term) {
        // Plays back the given terminal's session recording in real-time
        var go = GateOne,
            selectedFrame = go.terminals[term]['playbackFrames'][selectFrame(term, GateOne.Playback.milliseconds)],
            frameTime = new Date(go.terminals[term]['playbackFrames'][0]['time']),
            lastFrame = go.terminals[term]['playbackFrames'].length - 1,
            lastDateTime = new Date(go.terminals[term]['playbackFrames'][lastFrame]['time']);
        frameTime.setMilliseconds(frameTime.getMilliseconds() + GateOne.Playback.milliseconds);
        if (!selectedFrame) { // All done
            document.getElementById('term1').innerHTML = go.terminals[term]['playbackFrames'][lastFrame]['screen'];
            document.getElementById('clock').innerHTML = lastDateTime.toLocaleTimeString();
            document.getElementById('sideinfo').innerHTML = lastDateTime.toLocaleDateString();
            document.getElementById('progressBar').style.width = '100%';
            clearInterval(GateOne.Playback.frameUpdater);
            GateOne.Playback.milliseconds = 0;
            return
        }
        document.getElementById('clock').innerHTML = frameTime.toLocaleTimeString();
        document.getElementById('sideinfo').innerHTML = frameTime.toLocaleDateString();
        document.getElementById('term1').innerHTML = selectedFrame['screen'];
        // Update progress bar
        var firstDateTime = new Date(go.terminals[term]['playbackFrames'][0]['time']);
        var percent = Math.abs((lastDateTime.getTime() - frameTime.getTime())/(lastDateTime.getTime() - firstDateTime.getTime()) - 1);
        if (percent > 1) {
            percent = 1; // Last frame might be > 100% due to timing...  No biggie
        }
        document.getElementById('progressBar').style.width = (percent*100) + '%';
        milliseconds += frameInterval; // Increment determines our framerate
    },
    addPlaybackControls: function() {
        // Add the session playback controls to the given terminal
        GateOne.Logging.logDebug('GateOne.Playback.addPlaybackControls()');
        var go = GateOne,
            u = go.Utils,
            p = go.Playback,
            playPause = u.createElement('div', {'id': go.prefs.prefix+'playPause'}),
            progressBar = u.createElement('div', {'id': go.prefs.prefix+'progressBar'}),
            progressBarContainer = u.createElement('div', {
                'id': go.prefs.prefix+'progressBarContainer', 'onmouseover': 'this.style.cursor = "col-resize"'}),
            clock = u.createElement('div', {'id': go.prefs.prefix+'clock'}),
            playbackControls = u.createElement('div', {'id': go.prefs.prefix+'playbackControls'}),
            controlsContainer = u.createElement('div', {'id': go.prefs.prefix+'controlsContainer'}),
            goDiv = u.getNode(go.prefs.goDiv),
            style = window.getComputedStyle(goDiv, null),
            emDimensions = u.getEmDimensions(goDiv),
            controlsWidth = parseInt(style.width.split('px')[0]) - (emDimensions.w * 3);
//             playPause = u.createElement('div', {'id': go.prefs.prefix+'playPause'}),
//             progressBar = u.createElement('div', {'id': go.prefs.prefix+'progressBar', 'style': {'background': 'blue', 'padding': 0, 'margin': '0.1em', 'border': 0, 'width': '0%', 'height': '0.4em'}}),
//             progressBarContainer = u.createElement('div', {'id': go.prefs.prefix+'progressBarContainer', 'style': {'position': 'absolute', 'bottom': 0, 'right': '1em', 'background': 'white', 'left': '1em', 'margin-bottom': '0.2em', 'border': 0, 'opacity': '0.33'}, 'onmouseover': 'this.style.cursor = "col-resize"'}),
//             clock = u.createElement('div', {'id': go.prefs.prefix+'clock', 'style': {'float': 'right', 'color': 'white', 'opacity': '0.7', 'font-size': '0.7em', 'margin-right': '1.7em', 'margin-top': '-0.5em'}}),
//             playbackControls = u.createElement('div', {'id': go.prefs.prefix+'playbackControls', 'style': {'padding': 0, 'border': 0}}),
//             controlsContainer = u.createElement('div', {
//                 'id': go.prefs.prefix+'controlsContainer', 'style': {'display': 'block', 'position': 'absolute', 'z-index': 100, 'bottom': 0, 'white-space': 'normal', 'padding': 0, 'border': 0, 'width': '100%'}}
//             );
        playPause.innerHTML = '▶';
        progressBarContainer.appendChild(progressBar);
        clock.innerHTML = '00:00:00';
        var updateProgress = function(e) {
            e.preventDefault();
            if (p.progressBarMouseDown) {
                var term = localStorage['selectedTerminal'],
                    lX = e.layerX,
                    pB = u.getNode('#'+go.prefs.prefix+'progressBar'),
                    pBC = u.getNode('#'+go.prefs.prefix+'progressBarContainer'),
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
                u.getNode('#'+go.prefs.prefix+'term' + term).innerHTML = selectedFrame['screen'];
                u.getNode('#'+go.prefs.prefix+'clock').innerHTML = dateTime.toLocaleTimeString();
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
//         controlsContainer.style.width = controlsWidth + 'px';
        controlsContainer.appendChild(playbackControls);
        u.getNode(go.prefs.goDiv).appendChild(controlsContainer);
        if (!p.clockUpdater) { // Get the clock updating
            p.clockUpdater = setInterval('GateOne.Playback.updateClock()', 1000);
        }
    },
    saveRecording: function(term) {
        // Saves the session playback recording
        var go = GateOne,
            recording = JSON.stringify(go.terminals[term]['playbackFrames']),
        // This creates a form to POST our saved session to /recording on the server
        // NOTE: The server just returns the same data wrapped in a easy-to-use template
            form = go.Utils.createElement('form', {
                'method': 'post',
                'action': go.prefs.url + 'recording',
                'target': '_blank'
            }),
            recordingField = go.Utils.createElement('textarea', {'name': 'recording'}),
            schemeField = go.Utils.createElement('input', {'name': 'scheme'}),
            containerField = go.Utils.createElement('input', {'name': 'container'}),
            prefixField = go.Utils.createElement('input', {'name': 'prefix'});
        recordingField.value = recording;
        form.appendChild(recordingField);
        schemeField.value = go.prefs.scheme;
        form.appendChild(schemeField);
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