(function(window, undefined) { // Sandbox it all
var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;

// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = noop;
var logError = noop;
var logWarning = noop;
var logInfo = noop;
var logDebug = noop;

// TODO: Add the ability for users to generate/modify their keys

// GateOne.SSH (ssh client functions)
GateOne.Base.module(GateOne, "SSH", "0.9", ['Base']);
GateOne.Base.update(GateOne.SSH, {
    init: function() {
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            prefsPanel = u.getNode('#'+prefix+'panel_prefs'),
            infoPanel = u.getNode('#'+prefix+'panel_info'),
            h3 = u.createElement('h3'),
            infoPanelDuplicateSession = u.createElement('button', {'id': prefix+'duplicate_session', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            prefsPanelKnownHosts = u.createElement('button', {'id': prefix+'edit_kh', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        if (go.Logging) {
            logFatal = go.Logging.logFatal;
            logError = go.Logging.logError;
            logWarning = go.Logging.logWarning;
            logInfo = go.Logging.logInfo;
            logDebug = go.Logging.logDebug;
        }
        prefsPanelKnownHosts.innerHTML = "Edit Known Hosts";
        prefsPanelKnownHosts.onclick = function() {
            u.xhrGet(go.prefs.url+'ssh?known_hosts=True', go.SSH.updateKH);
        }
        infoPanelDuplicateSession.innerHTML = "Duplicate Session";
        infoPanelDuplicateSession.onclick = function() {
            var term = localStorage[prefix+'selectedTerminal'];
            go.SSH.duplicateSession(term);
        }
        h3.innerHTML = "SSH Plugin";
        if (prefsPanel) {// Only add to the prefs panel if it actually exists (i.e. not in embedded mode) = u.getNode('#'+prefix+'panel_prefs'),
            prefsPanel.appendChild(h3);
            prefsPanel.appendChild(prefsPanelKnownHosts);
            infoPanel.appendChild(h3);
            infoPanel.appendChild(infoPanelDuplicateSession);
            go.SSH.createKHPanel();
        }
        go.Net.addAction('sshjs_connect', go.SSH.handleConnect);
        go.Net.addAction('sshjs_reconnect', go.SSH.handleReconnect);
        go.Net.addAction('sshjs_keygen_complete', go.SSH.keygenComplete);
        go.Net.addAction('sshjs_display_fingerprint', go.SSH.displayHostFingerprint);
        go.Terminal.newTermCallbacks.push(go.SSH.getConnectString);
    },
    getConnectString: function(term) {
        // Asks the SSH plugin on the Gate One server what the SSH connection string is for the given *term*.
        GateOne.ws.send(JSON.stringify({'ssh_get_connect_string': term}));
    },
    handleConnect: function(connectString) {
        // Handles the 'sshjs_connect' action which should provide an SSH *connectString* in the form of user@host:port
        // The *connectString* will be stored in GateOne.terminals[term]['sshConnectString'] which is meant to be used in duplicating terminals (because you can't rely on the title).
        logDebug('sshjs_connect: ' + connectString);
        var go = GateOne,
            host = connectString.split('@')[1].split(':')[0],
            port = connectString.split('@')[1].split(':')[1],
            message = {'host': host, 'port': port},
            term = localStorage[go.prefs.prefix+'selectedTerminal'];
        go.terminals[term]['sshConnectString'] = connectString;
        go.ws.send(JSON.stringify({'ssh_get_host_fingerprint': message}));
    },
    handleReconnect: function(jsonDoc) {
        // Handles the 'sshjs_reconnect' action which should provide a JSON-encoded dictionary containing each terminal's SSH connection string.
        // Example *jsonDoc*: "{1: 'user@host1:22', 2: 'user@host2:22'}"
        var go = GateOne,
            dict = JSON.parse(jsonDoc);
        for (var term in dict) {
            go.terminals[term]['sshConnectString'] = dict[term];
            // Also fix the title while we're at it
            go.Visual.setTitleAction({'term': term, 'title': dict[term]});
        }
    },
    keygenComplete: function(message) {
        // Called when we receive a message from the server indicating a keypair was generated successfully
        if (message['result'] == 'Success') {
            GateOne.Visual.displayMessage('Keypair generation complete.');
            GateOne.Visual.displayMessage('The fingerprint of the new key is: ' + message['fingerprint']);
        } else {
            GateOne.Visual.displayMessage(message['result']);
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
            sshPanel = u.createElement('div', {'id': prefix+'panel_known_hosts', 'class': 'panel sectrans'}),
            sshHeader = u.createElement('div', {'id': prefix+'ssh_header', 'class': 'sectrans'}),
            sshHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            sshKHTextArea = u.createElement('textarea', {'id': prefix+'ssh_kh_textarea', 'rows': 30, 'cols': 100}),
            save = u.createElement('button', {'id': prefix+'ssh_save', 'class': 'button black', 'type': 'submit'}),
            cancel = u.createElement('button', {'id': prefix+'ssh_cancel', 'class': 'button black'}),
            form = u.createElement('form', {
                'method': 'post',
                'action': go.prefs.url+'ssh?known_hosts=True'
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
            xhr.open('POST', go.prefs.url+'ssh?known_hosts=True', true);
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
    },
    displayUserKeysAction: function(message) {
        // Opens a panel displaying a list of the user's SSH keys (aka identities) which should be contained within *message*:
        // *message['keys']* - A list of the public and private SSH keys the user has stored in their user directory.
        // *message['keys'][0]* (hypothetical) - An associative array conaining the key's metadata.  For example:
        //      {'fingerprint': <key fingerprint>, 'public': <contents of the key if it's not a private key>, 'comment': <key comment (may be empty)>, 'certinfo': <certificate info (empty if it isn't a certificate)>, 'bubblebabble': <the bubblebabble hash of the key>}

    },
    displayHostFingerprint: function(message) {
        // Displays the host's key as sent by the server via the sshjs_display_fingerprint action.
        // The fingerprint will be colorized using the hex values of the fingerprint as the color code with the last value highlighted in bold.
        // {"sshjs_display_fingerprint": {"result": "Success", "fingerprint": "cc:2f:b9:4f:f6:c0:e5:1d:1b:7a:86:7b:ff:86:97:5b"}}
        var go = GateOne,
            v = go.Visual;
        if (message['result'] == 'Success') {
            var fingerprint = message['fingerprint'],
                hexes = fingerprint.split(':'),
                text = '',
                colorized = '',
                count = 0;
            colorized += '<span style="color: #';
            hexes.forEach(function(hex) {
                if (count == 3 || count == 6 || count == 9 || count == 12) {
                    colorized += '">' + text + '</span><span style="color: #' + hex;
                    text = hex;
                } else if (count == 15) {
                    colorized += '">' + text + '</span><span style="text-decoration: underline">' + hex + '</span>';
                } else {
                    colorized += hex;
                    text += hex;
                }
                count += 1;
            });
            console.log('colorized: ' + colorized);
            v.displayMessage('Fingerprint of <i>' + message['host'] + '</i>: ' + colorized);
        }
    }
});

})(window);