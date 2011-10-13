(function(window, undefined) { // Sandbox it all
var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;

// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = null;
var logError = null;
var logWarning = null;
var logInfo = null;
var logDebug = null;

// TODO: Add the ability for users to generate/modify their keys

// GateOne.SSH (ssh client functions)
GateOne.Base.module(GateOne, "SSH", "0.9", ['Base']);
GateOne.Base.update(GateOne.SSH, {
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
            prefsPanel = u.getNode('#'+prefix+'panel_prefs'),
            infoPanel = u.getNode('#'+prefix+'panel_info'),
            h3 = u.createElement('h3'),
            infoPanelDuplicateSession = u.createElement('button', {'id': prefix+'duplicate_session', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            prefsPanelKnownHosts = u.createElement('button', {'id': prefix+'edit_kh', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
        prefsPanelKnownHosts.innerHTML = "Edit Known Hosts";
        prefsPanelKnownHosts.onclick = function() {
            u.xhrGet('/ssh?known_hosts=True', go.SSH.updateKH);
        }
        infoPanelDuplicateSession.innerHTML = "Duplicate Session";
        infoPanelDuplicateSession.onclick = function() {
            var term = localStorage['selectedTerminal'];
            go.SSH.duplicateSession(term);
        }
        h3.innerHTML = "SSH Plugin";
        prefsPanel.appendChild(h3);
        prefsPanel.appendChild(prefsPanelKnownHosts);
        infoPanel.appendChild(h3);
        infoPanel.appendChild(infoPanelDuplicateSession);
        go.SSH.createKHPanel();
        go.Net.addAction('sshjs_connect', go.SSH.handleConnect);
        go.Net.addAction('sshjs_reconnect', go.SSH.handleReconnect);
        go.Terminal.newTermCallbacks.push(go.SSH.getConnectString);
    },
    getConnectString: function(term) {
        // Asks the SSH plugin on the Gate One server what the SSH connection string is for the given *term*.
        GateOne.ws.send(JSON.stringify({'sshjs_get_connect_string': term}));
    },
    handleConnect: function(connectString) {
        // Handles the 'sshjs_connect' action which should provide an SSH *connectString* in the form of user@host:port
        // The *connectString* will be stored in GateOne.terminals[term]['sshConnectString'] which is meant to be used in duplicating terminals (because you can't rely on the title).
        logInfo('sshjs_connect: ' + connectString);
        var term = localStorage['selectedTerminal'];
        GateOne.terminals[term]['sshConnectString'] = connectString;
    },
    handleReconnect: function(jsonDoc) {
        // Handles the 'sshjs_reconnect' action which should provide a JSON-encoded dictionary containing each terminal's SSH connection string.
        // Example *jsonDoc*: "{1: 'user@host1:22', 2: 'user@host2:22'}"
        var dict = JSON.parse(jsonDoc);
        for (var term in dict) {
            GateOne.terminals[term]['sshConnectString'] = dict[term];
            // Also fix the title while we're at it
            GateOne.Visual.setTitleAction({'term': term, 'title': dict[term]});
        }
    },
    duplicateSession: function(term) {
        // Duplicates the SSH session at *term* in a new terminal
        var go = GateOne,
            connectString = GateOne.terminals[term]['sshConnectString'];
        if (!connectString.length) {
            return; // Can't do anything without a connection string!
        }
        go.Terminal.newTerminal()
        setTimeout(function() {
            // Give the browser a moment to get the new terminal open
            go.Input.queue('ssh://' + connectString + '\n');
            go.Net.sendChars();
        }, 250);
        go.Visual.togglePanel('#'+go.prefs.prefix+'panel_info');
    },
    updateKH: function(known_hosts) {
        // Updates the sshKHTextArea with the given *known_hosts* file.
        // NOTE: Meant to be used as the callback function passed to GateOne.Utils.xhrGet()
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            sshKHTextArea = u.getNode('#'+prefix+'ssh_kh_textarea');
        sshKHTextArea.value = known_hosts;
        // Now show the panel
        go.Visual.togglePanel('#'+prefix+'panel_known_hosts');
    },
    createKHPanel: function() {
        // Creates a panel where the user can edit their known_hosts file and appends it to #gateone
        // If the panel already exists, leave it but recreate the contents
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_known_hosts'),
            sshPanel = u.createElement('div', {'id': prefix+'panel_known_hosts', 'class': prefix+'panel sectrans'}),
            sshHeader = u.createElement('div', {'id': prefix+'ssh_header', 'class': 'sectrans'}),
            sshHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            sshKHTextArea = u.createElement('textarea', {'id': prefix+'ssh_kh_textarea', 'rows': 30, 'cols': 100}),
            save = u.createElement('button', {'id': prefix+'ssh_save', 'class': 'button black', 'type': 'submit'}),
            cancel = u.createElement('button', {'id': prefix+'ssh_cancel', 'class': 'button black'}),
            form = u.createElement('form', {
                'method': 'post',
                'action': '/ssh?known_hosts=True'
            });
        sshHeader.innerHTML = '<h2>SSH Plugin: Edit Known Hosts</h2>';
        sshHeader.appendChild(sshHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        save.innerHTML = "Save";
        cancel.innerHTML = "Cancel";
        cancel.onclick = function(e) {
            e.preventDefault(); // Don't submit the form
            go.Visual.togglePanel('#'+prefix+'panel_known_hosts'); // Hide the panel
        }
        sshKHTextArea.onfocus = function(e) {
            sshKHTextArea.focus();
            go.Input.disableCapture(); // So users can paste into it
        }
        sshKHTextArea.onblur = function(e) {
            go.Input.capture(); // Go back to normal
        }
        form.onsubmit = function(e) {
            // Submit the modified known_hosts file to the server and notify when complete
            e.preventDefault(); // Don't actually submit
            var kh = u.getNode('#'+prefix+'ssh_kh_textarea').value,
                xhr = new XMLHttpRequest(),
                handleStateChange = function(e) {
                    var status = null;
                    try {
                        status = parseInt(e.target.status);
                    } catch(e) {
                        return;
                    }
                    if (e.target.readyState == 4 && status == 200 && e.target.responseText) {
                        go.Visual.displayMessage("SSH Plugin: known_hosts saved.");
                        // Hide the panel
                        go.Visual.togglePanel('#'+prefix+'panel_known_hosts');
                    }
                };
            if (xhr.addEventListener) {
                xhr.addEventListener('readystatechange', handleStateChange, false);
            } else {
                xhr.onreadystatechange = handleStateChange;
            }
            xhr.open('POST', '/ssh?known_hosts=True', true);
            xhr.send(kh);
        }
        form.appendChild(sshHeader);
        form.appendChild(sshKHTextArea);
        form.appendChild(sshHRFix);
        form.appendChild(save);
        form.appendChild(cancel);
        if (existingPanel) {
            // Remove everything first
            while (existingPanel.childNodes.length >= 1 ) {
                existingPanel.removeChild(existingPanel.firstChild);   
            }
            sshHeader.style.opacity = 0;
            existingPanel.appendChild(form);
        } else {
            sshPanel.appendChild(form);
            u.getNode(go.prefs.goDiv).appendChild(sshPanel);
        }
    }
});

})(window);