/*
  Description:
    Place this JavaScript on your website to have your own secret Gate One
    terminal drop into view when you press the ESC key!  Just update the goURL
    variable below to point to your Gate One server and add your web site's
    URL to the 'origins' setting in Gate One's server.conf.

    NOTE:  The 'origins' setting protects you...  Don't just put '*'!

    Author:  Dan McDougall <daniel.mcdougall@liftoffsoftware.com>
*/
// Wrapped so we don't poison the global namespace
(function(window, undefined) {
"use strict";

// This is used to check for browser compatibility
var WebSocket =  window.MozWebSocket || window.WebSocket || window.WebSocketDraft || null;

// URL of your Gate One server
var goURL = "https://localhost/";
// var goURLs = [ // Pick one at random (load balance like liftoffsoftware.com)
//     "http://gateone9.rs.liftoffsoftware.com/",
//     "http://gateone10.rs.liftoffsoftware.com/"
// ];
// var randomIndex = Math.floor(Math.random() * goURLs.length);
// var goURL = goURLs[randomIndex];
var goJSPath = goURL + "static/gateone.js";
// var goJSPath = "http://c306286.r86.cf1.rackcdn.com/gateone.min.js";
var escTimer = null; // Will be assigned below
var ESC = String.fromCharCode(27); // Just a shortcut
var gateone_js = null; // Gets set below

// Create an element where we can place Gate One
var goDiv = document.createElement('div');
goDiv.id = 'gateone';
goDiv.style.opacity = 0; // Keep it hidden for now
goDiv.style.zIndex = -999; // This ensures it isn't invisibly hovering over everything causing input issues
document.body.appendChild(goDiv);

var showGateOne = function() {
    // Slide Gate One into view
    goDiv.style.zIndex = 9999;
    setTimeout(function() {
        GateOne.Visual.displayMessage('Press ESC twice in rapid succession to send Gate One away.');
    }, 1000);
    setTimeout(function() {
        // Need a short delay for the transform to apply to goDiv before we change it
        GateOne.Visual.applyTransform(goDiv, 'translateY(0)'); // Scale it into view
        document.body.removeEventListener("keydown", toggleGateOne, true); // Gate One will call toggleGateOne() on its own now
        GateOne.Input.capture(); // Start capturing keystrokes
        GateOne.Visual.updateDimensions(); // Re-send the dimensions in case the browser got resized
        GateOne.Net.sendDimensions();
    }, 10);
}

var hideGateOne = function() {
    if (escTimer) {
        clearTimeout(escTimer);
        escTimer = null;
        // This is a double-tap.  Hide Gate One
        GateOne.Input.disableCapture(); // Stop capturing keystrokes
        GateOne.Visual.applyTransform(goDiv, 'translateY(-100%)');
        setTimeout(function() {
            goDiv.style.zIndex = -9999;
        }, 1100);
        document.body.addEventListener("keydown", toggleGateOne, true); // So the user can bring back Gate One
    } else {
        // Start the escTimer
        escTimer = setTimeout(function(e) {
            sendESC(); // Send the regular ESC key
        }, 750); // Most people can press a key twice under 750 ms
    }
}

var sendESC = function() {
    // Sends the regular ESC keystroke to the Gate One server
    GateOne.Visual.displayMessage('Press ESC twice in rapid succession to send Gate One away.');
    GateOne.Input.queue(ESC);
    GateOne.Net.sendChars();
    escTimer = null;
}

var loadGateOne = function() {
    // Load Gate One's JavaScript
    gateone_js = document.createElement('script');
    gateone_js.setAttribute('src', goJSPath);
    gateone_js.setAttribute('type', 'text/javascript');
    gateone_js.onload = function(e) {
        GateOne.init({'url': goURL, 'goDiv': '#gateone', 'fillContainer': false, 'theme': 'black', 'style': {'top': 0, 'bottom': 0, 'left': 0, 'right': 0, 'height': '100%', 'width': '100%', 'position': 'fixed', 'background-color': 'rgba(34, 34, 34, 0.85)'}});
        GateOne.Input.registerShortcut('KEY_ESCAPE', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': false}, 'action': toggleGateOne});
        // Have to give the browser a moment to complete the init process before we disableCapture()
        GateOne.Input.disableCapture();
        goDiv.style.opacity = 1; // No need to keep it like this once everything is done loading
        document.activeElement.blur();
        GateOne.Terminal.newTermCallbacks.push(showGateOne);
    }
    setTimeout(function() {
        // For some reason, if I don't wrap this in a timeout Firefox won't load the script
        document.body.appendChild(gateone_js);
    }, 10);
}

var toggleGateOne = function(e) {
    // Press ESC to show Gate One.  Quake-style!
    // Press ESC twice in rapid succession to hide Gate One.
    if (!gateone_js) {
        // Not loaded yet...  Load it
        if (e.keyCode == 27) { // ESC key
            if (!WebSocket) {
                alert("Sorry, your browser doesn't support WebSockets so Gate One won't work.  Gate One is known to work wonderfully in Chrome and Firefox and should also work in Opera and IE 10+.");
                return;
            }
            loadGateOne();
        }
        return;
    }
    var key = GateOne.Input.key(e);
    if (goDiv.style.zIndex == "-999") {
        if (key.string == 'KEY_ESCAPE') {
            e.preventDefault();
            showGateOne();
        }
    } else {
        // Gate One is already visible.  Either start the ESC timer (so we can detect the double-tap) or send the ESC key
        if (key.string == 'KEY_ESCAPE') {
            hideGateOne();
        }
    }
}
// Add our ESC key event listener to document.body since Gate One won't be capturing events until it is brought into view
document.body.addEventListener("keydown", toggleGateOne, true);
})(window);