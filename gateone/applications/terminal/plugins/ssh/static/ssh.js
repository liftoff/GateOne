
GateOne.Base.superSandbox("GateOne.SSH", ["GateOne.Bookmarks", "GateOne.Terminal", "GateOne.Terminal.Input", "GateOne.Editor"], function(window, undefined) {
"use strict";

// Sandbox-wide shortcuts
var document = window.document, // Have to do this because we're sandboxed
    go = GateOne,
    prefix = go.prefs.prefix,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    t = go.Terminal,
    gettext = go.i18n.gettext,
    urlObj = (window.URL || window.webkitURL),
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

// GateOne.SSH (ssh client functions)
go.Base.module(GateOne, "SSH", "1.1", ['Base']);
go.SSH.identities = []; // SSH identity objects end up in here
go.SSH.remoteCmdCallbacks = {};
go.SSH.remoteCmdErrorbacks = {};
go.noSavePrefs['autoConnectURL'] = null; // So it doesn't get saved in localStorage
go.Base.update(go.SSH, {
    init: function() {
        /**:GateOne.SSH.init()

        Creates the SSH Identity Manager panel, adds some buttons to the Info & Tools panel, and registers the following WebSocket actions & events::

            GateOne.Net.addAction('terminal:sshjs_connect', GateOne.SSH.handleConnect);
            GateOne.Net.addAction('terminal:sshjs_reconnect', GateOne.SSH.handleReconnect);
            GateOne.Net.addAction('terminal:sshjs_keygen_complete', GateOne.SSH.keygenComplete);
            GateOne.Net.addAction('terminal:sshjs_save_id_complete', GateOne.SSH.saveComplete);
            GateOne.Net.addAction('terminal:sshjs_display_fingerprint', GateOne.SSH.displayHostFingerprint);
            GateOne.Net.addAction('terminal:sshjs_identities_list', GateOne.SSH.incomingIDsAction);
            GateOne.Net.addAction('terminal:sshjs_delete_identity_complete', GateOne.SSH.deleteCompleteAction);
            GateOne.Net.addAction('terminal:sshjs_cmd_output', GateOne.SSH.commandCompleted);
            GateOne.Net.addAction('terminal:sshjs_ask_passphrase', GateOne.SSH.enterPassphraseAction);
            GateOne.Net.addAction('terminal:sshjs_known_hosts', GateOne.SSH.handleKnownHosts);
            GateOne.Events.on("terminal:new_terminal", GateOne.SSH.getConnectString);
        */
        var prefsPanel = u.getNode('#'+prefix+'panel_prefs'),
            infoPanel = u.getNode('#'+prefix+'panel_info'),
            h3 = u.createElement('h3'),
            sshQueryString = u.getQueryVariable('ssh'),
            sshOnce = u.getQueryVariable('ssh_once'),
            infoPanelDuplicateSession = u.createElement('button', {'id': 'duplicate_session', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            infoPanelManageIdentities = u.createElement('button', {'id': 'manage_identities', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            prefsPanelKnownHosts = u.createElement('button', {'id': 'edit_kh', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            handleQueryString = function(str) {
                var termNum;
                // Perform a bit of validation so someone can't be tricked into going to a malicious URL
                if (!str.match(/[\$\n\!\;&` |<>]/)) { // Check for bad characters
                    if (u.startsWith('ssh://', str) || u.startsWith('telnet://', str)) {
                        var connect = function(term) {
                            // Wrap in a short timeout to give the server/client time to establish a new terminal connection
                            setTimeout(function() {
                                // This ensures that we only send this string if it's a new terminal
                                if (go.Terminal.terminals[term]['title'] == gettext('SSH Connect')) {
                                    go.Terminal.sendString(str + '\n', term);
                                }
                            }, 500);
                        }
                        if (sshOnce && sshOnce.toLowerCase() == 'true') {
                            u.removeQueryVariable('ssh'); // Clean up the URL
                            u.removeQueryVariable('ssh_once');
                            termNum = go.Terminal.newTerminal();
                            connect(termNum);
                        } else {
                            go.Events.on("terminal:new_terminal", connect);
                            termNum = go.Terminal.newTerminal();
                        }
                    } else {
                        logError(gettext("SSH Plugin:  ssh query string must start with ssh:// or telnet:// (e.g. ssh=ssh://)"));
                    }
                } else {
                    logError(gettext("Bad characters in ssh query string: ") + str.match(/[\$\n\!\;&` |<>]/));
                }
            };
        prefsPanelKnownHosts.innerHTML = gettext("Edit Known Hosts");
        prefsPanelKnownHosts.onclick = function() {
            // Ask the server to send us the known_hosts file:
            go.ws.send(JSON.stringify({"terminal:ssh_get_known_hosts": null}));
        }
        infoPanelManageIdentities.innerHTML = gettext("Manage Identities");
        infoPanelManageIdentities.onclick = function() {
            go.SSH.loadIDs();
        }
        infoPanelDuplicateSession.innerHTML = gettext("Duplicate Session");
        infoPanelDuplicateSession.onclick = function() {
            var term = localStorage[prefix+'selectedTerminal'];
            go.SSH.duplicateSession(term);
        }
        h3.innerHTML = gettext("SSH Plugin");
        if (infoPanel) {// Only add to the prefs panel if it actually exists (i.e. not in embedded mode) = u.getNode('#'+prefix+'panel_prefs'),
            infoPanel.appendChild(h3);
            infoPanel.appendChild(infoPanelDuplicateSession);
            infoPanel.appendChild(infoPanelManageIdentities);
            infoPanel.appendChild(prefsPanelKnownHosts);
            go.SSH.createKHPanel();
        }
        // Connect to the given ssh:// URL if we were given an 'ssh' query string variable (e.g. https://gateone/?ssh=ssh://whatever:22)
        if (sshQueryString) {
            if (u.isArray(sshQueryString)) {
                // Assume it's all one-time only if multiple ssh:// URLs were provided
                sshOnce = 'true';
                sshQueryString.forEach(function(str) {
                    handleQueryString(str);
                });
            } else {
                handleQueryString(sshQueryString);
            }
        }
        // Setup a callback that runs disableCapture() whenever the panel is opened
        E.on('go:panel_toggle:in', function(panel) {
            if (panel && panel.id == prefix+'panel_ssh_ids') {
                go.Terminal.Input.disableCapture();
            }
        });
        // Setup a callback that runs capture() whenever the panel is closed
        E.on('go:panel_toggle:out', function(panel) {
            if (panel && panel.id == prefix+'panel_ssh_ids') {
                go.Terminal.Input.capture();
            }
        });
        go.SSH.createPanel();
        go.Net.addAction('terminal:sshjs_connect', go.SSH.handleConnect);
        go.Net.addAction('terminal:sshjs_reconnect', go.SSH.handleReconnect);
        go.Net.addAction('terminal:sshjs_keygen_complete', go.SSH.keygenComplete);
        go.Net.addAction('terminal:sshjs_save_id_complete', go.SSH.saveComplete);
        go.Net.addAction('terminal:sshjs_display_fingerprint', go.SSH.displayHostFingerprint);
        go.Net.addAction('terminal:sshjs_identities_list', go.SSH.incomingIDsAction);
        go.Net.addAction('terminal:sshjs_delete_identity_complete', go.SSH.deleteCompleteAction);
        go.Net.addAction('terminal:sshjs_cmd_output', go.SSH.commandCompleted);
        go.Net.addAction('terminal:sshjs_ask_passphrase', go.SSH.enterPassphraseAction);
        go.Net.addAction('terminal:sshjs_known_hosts', go.SSH.handleKnownHosts);
        if (!go.prefs.broadcastTerminal) {
            E.on("terminal:new_terminal", go.SSH.autoConnect);
            E.on("terminal:new_terminal", go.SSH.getConnectString);
        }
        if (!go.prefs.embedded) {
            E.on("terminal:keydown:ctrl-alt-d", function() { go.SSH.duplicateSession(localStorage[prefix+"selectedTerminal"]); });
        }
    },
    postInit: function() {
        /**:GateOne.SSH.postInit()

        Registers our 'ssh' and 'telnet' protocol handlers with the Bookmarks plugin.

        .. note:: These things are run inside of the ``postInit()`` function in order to ensure that `GateOne.Bookmarks` is loaded (and ready-to-go) first.
        */
        go.Bookmarks.registerURLHandler('ssh', go.SSH.connect);
        go.Bookmarks.registerIconHandler('ssh', go.SSH.bookmarkIconHandler);
        go.Bookmarks.registerURLHandler('telnet', go.SSH.connect);
        go.Bookmarks.registerIconHandler('telnet', go.SSH.bookmarkIconHandler);
    },
    bookmarkIconHandler: function(bookmark) {
        /**:GateOne.SSH.bookmarkIconHandler(bookmark)

        Saves the `GateOne.Icons.SSH` icon in the given bookmark using `GateOne.Bookmarks.storeFavicon()`.

        .. note:: This gets registered for the 'ssh' and 'telnet' inside of `GateOne.SSH.postInit()`.
        */
        go.Bookmarks.storeFavicon(bookmark, go.Icons['ssh']);
    },
    connect: function(URL) {
        /**:GateOne.SSH.connect(URL)

        Connects to the given SSH *URL*.

        If the current terminal is sitting at the SSH Connect prompt it will be used to make the connection.  Otherwise a new terminal will be opened.
        */
        logDebug("GateOne.SSH.connect: " + URL);
        var term = localStorage[prefix+'selectedTerminal'],
            unconnectedTermTitle = gettext('SSH Connect'), // NOTE: This MUST be equal to the title set by ssh_connect.py or it will send the ssh:// URL to the active terminal
            openNewTerminal = function() {
                E.once("terminal:new_terminal", u.partial(t.sendString, URL+'\n'));
                t.newTerminal(); // This will automatically open a new workspace
            };
        if (!t.terminals[term]) {
            // No terminal opened yet...  Open one and take us to the URL
            openNewTerminal();
        } else if (t.terminals[term]['title'] == unconnectedTermTitle) {
            // Foreground terminal has yet to be connected, use it
            t.sendString(URL+'\n')
        } else {
            // A terminal is open but it is already connected to something else
            openNewTerminal();
        }
    },
    autoConnect: function(term, termUndefined) {
        /**:GateOne.SSH.autoConnect()

        Automatically connects to `GateOne.prefs.autoConnectURL` if it set.
        */
        if (go.prefs.autoConnectURL) {
            // Only execute the autoConnectURL if this is a *new* terminal so resumed terminals don't get spammed with the autoConnectURL
            if (termUndefined) {
                setTimeout(function () {
                    go.Terminal.sendString(go.prefs.autoConnectURL+'\n');
                }, 500);
            }
        }
    },
    createPanel: function() {
        /**:GateOne.SSH.createPanel()

        Creates the SSH identity management panel (the shell of it anyway).
        */
        var ssh = go.SSH,
            existingPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            sshIDPanel = u.createElement('div', {'id': 'panel_ssh_ids', 'class': '✈panel ✈sectrans ✈panel_ssh_ids'}),
            sshIDHeader = u.createElement('div', {'id': 'ssh_ids_header', 'class': '✈sectrans'}),
            sshIDHeaderH2 = u.createElement('h2', {'id': 'ssh_ids_title', 'class': '✈sectrans'}),
            sshNewID = u.createElement('a', {'id': 'ssh_new_id', 'class': '✈halfsectrans ✈ssh_panel_link'}),
            sshUploadID = u.createElement('a', {'id': 'ssh_upload_id', 'class': '✈halfsectrans ✈ssh_panel_link'}),
            sshIDHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': '✈panel_close_icon', 'title': "Close This Panel"}),
            sshIDContent = u.createElement('div', {'id': 'ssh_ids_container', 'class': '✈sectrans ✈ssh_ids_container'}),
            sshIDInfoContainer = u.createElement('div', {'id': 'ssh_id_info', 'class': '✈sectrans ✈ssh_id_info'}),
            sshIDListContainer = u.createElement('div', {'id': 'ssh_ids_listcontainer', 'class': '✈sectrans ✈ssh_ids_listcontainer'}),
            sshIDElemHeader = u.createElement('div', {'id': 'ssh_id_header', 'class':'✈table_header_row ✈sectrans'}),
            defaultSpan = u.createElement('span', {'id': 'ssh_id_defaultspan', 'class':'✈table_cell ✈table_header_cell'}),
            nameSpan = u.createElement('span', {'id': 'ssh_id_namespan', 'class':'✈table_cell ✈table_header_cell'}),
            keytypeSpan = u.createElement('span', {'id': 'ssh_id_keytypespan', 'class':'✈table_cell ✈table_header_cell'}),
            commentSpan = u.createElement('span', {'id': 'ssh_id_commentspan', 'class':'✈table_cell ✈table_header_cell'}),
            bitsSpan = u.createElement('span', {'id': 'ssh_id_bitsspan', 'class':'✈table_cell ✈table_header_cell'}),
            certSpan = u.createElement('span', {'id': 'ssh_id_certspan', 'class':'✈table_cell ✈table_header_cell'}),
            sortOrder = u.createElement('span', {'id': 'ssh_ids_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
            sshIDMetadataDiv = u.createElement('div', {'id': 'ssh_id_metadata', 'class': '✈sectrans ✈ssh_id_metadata'});
        sshIDHeaderH2.innerHTML = gettext('SSH Identity Manager: Loading...');
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            v.togglePanel('#'+prefix+'panel_ssh_ids'); // Scale away, scale away, scale away.
        }
        sshIDHeader.appendChild(sshIDHeaderH2);
        sshIDHeader.appendChild(panelClose);
        sshIDHeader.appendChild(sshIDHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        sshNewID.innerHTML = gettext("+ New Identity");
        sshNewID.onclick = function(e) {
            // Show the new identity dialog/form
            ssh.newIDForm();
        }
        sshUploadID.innerHTML = gettext("+ Upload");
        sshUploadID.onclick = function(e) {
            // Show the upload identity dialog/form
            ssh.uploadIDForm();
        }
        v.applyTransform(sshIDMetadataDiv, 'translate(300%)'); // It gets translated back in showIDs
        sshIDInfoContainer.appendChild(sshIDMetadataDiv);
        sshIDContent.appendChild(sshIDInfoContainer);
        if (ssh.sortToggle) {
            sortOrder.innerHTML = "▴";
        } else {
            sortOrder.innerHTML = "▾";
        }
        nameSpan.onclick = function(e) {
            var order = u.createElement('span', {'id': 'ssh_ids_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
                existingOrder = u.getNode('#'+prefix+'ssh_ids_sort_order');
            ssh.sortfunc = ssh.sortFunctions.alphabetical;
            if (localStorage[prefix+'ssh_ids_sort'] != 'alpha') {
                localStorage[prefix+'ssh_ids_sort'] = 'alpha';
            }
            if (this.childNodes.length > 1) {
                // Means the 'order' span is present.  Reverse the list
                if (ssh.sortToggle) {
                    ssh.sortToggle = false;
                } else {
                    ssh.sortToggle = true;
                }
            }
            if (existingOrder) {
                u.removeElement(existingOrder);
            }
            u.toArray(sshIDElemHeader.getElementsByClassName('✈table_header_cell')).forEach(function(item) {
                item.className = '✈table_cell ✈table_header_cell';
            });
            this.className = '✈table_cell ✈table_header_cell ✈active';
            if (ssh.sortToggle) {
                order.innerHTML = "▴";
            } else {
                order.innerHTML = "▾";
            }
            this.appendChild(order);
            ssh.loadIDs();
        }
        bitsSpan.onclick = function(e) {
            var order = u.createElement('span', {'id': 'ssh_ids_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
                existingOrder = u.getNode('#'+prefix+'ssh_ids_sort_order');
            ssh.sortfunc = ssh.sortFunctions.bits;
            if (localStorage[prefix+'ssh_ids_sort'] != 'bits') {
                localStorage[prefix+'ssh_ids_sort'] = 'bits';
            }
            if (this.childNodes.length > 1) {
                // Means the 'order' span is present.  Reverse the list
                if (ssh.sortToggle) {
                    ssh.sortToggle = false;
                } else {
                    ssh.sortToggle = true;
                }
            }
            if (existingOrder) {
                u.removeElement(existingOrder);
            }
            u.toArray(sshIDElemHeader.getElementsByClassName('✈table_header_cell')).forEach(function(item) {
                item.className = '✈table_cell ✈table_header_cell';
            });
            this.className = '✈table_cell ✈table_header_cell ✈active';
            if (ssh.sortToggle) {
                order.innerHTML = "▴";
            } else {
                order.innerHTML = "▾";
            }
            this.appendChild(order);
            ssh.loadIDs();
        }
        keytypeSpan.onclick = function(e) {
            var order = u.createElement('span', {'id': 'ssh_ids_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
                existingOrder = u.getNode('#'+prefix+'ssh_ids_sort_order');
            ssh.sortfunc = ssh.sortFunctions.size;
            if (localStorage[prefix+'ssh_ids_sort'] != 'size') {
                localStorage[prefix+'ssh_ids_sort'] = 'size';
            }
            if (this.childNodes.length > 1) {
                // Means the 'order' span is present.  Reverse the list
                if (ssh.sortToggle) {
                    ssh.sortToggle = false;
                } else {
                    ssh.sortToggle = true;
                }
            }
            if (existingOrder) {
                u.removeElement(existingOrder);
            }
            u.toArray(sshIDElemHeader.getElementsByClassName('✈table_header_cell')).forEach(function(item) {
                item.className = '✈table_cell ✈table_header_cell';
            });
            this.className = '✈table_cell ✈table_header_cell ✈active';
            if (ssh.sortToggle) {
                order.innerHTML = "▴";
            } else {
                order.innerHTML = "▾";
            }
            this.appendChild(order);
            ssh.loadIDs();
        }
        defaultSpan.innerHTML = gettext("Default");
        defaultSpan.title = gettext("This field indicates whether or not this identity should be used by default for all connections.  NOTE: If an identity isn't set as default it can still be used for individual servers by using bookmarks or passing it as a query string parameter to the ssh:// URL when opening a new terminal.  For example:  ssh://user@host:22/?identity=*name*");
        nameSpan.innerHTML = gettext("Name");
        nameSpan.title = gettext("The *name* of this identity.  NOTE: The name represented here actually encompasses two or three files:  '*name*', '*name*.pub', and if there's an associated X.509 certificate, '*name*-cert.pub'.");
        bitsSpan.innerHTML = gettext("Bits");
        bitsSpan.title = gettext("The cryptographic key size.  NOTE:  RSA keys can have a value from 768 to 4096 (with 2048 being the most common), DSA keys must have a value of 1024, and ECDSA (that is, Elliptic Curve DSA) keys must be one of 256, 384, or 521 (that's not a typo: five hundred twenty one)");
        keytypeSpan.innerHTML = gettext("Keytype");
        keytypeSpan.title = gettext("Indicates the type of key used by this identity.  One of RSA, DSA, or ECDSA.");
        certSpan.innerHTML = gettext("Cert");
        certSpan.title = gettext("This field indicates whether or not there's an X.509 certificate associated with this identity (i.e. a '*name*-cert.pub' file).  X.509 certificates (for use with SSH) are created by signing a public key using a Certificate Authority (CA).  NOTE: In order to use X.509 certificates for authentication with SSH the servers you're connecting to must be configured to trust keys signed by a given CA.");
        commentSpan.innerHTML = gettext("Comment");
        commentSpan.title = gettext("This field will contain the comment from the identity's public key.  It comes after the key itself inside its .pub file and if the key was generated by OpenSSH it will typically be something like, 'user@host'.");
        if (localStorage[prefix+'ssh_ids_sort'] == 'alpha') {
            nameSpan.className = '✈table_cell ✈table_header_cell ✈active';
            nameSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'ssh_ids_sort'] == 'date') {
            bitsSpan.className = '✈table_cell ✈table_header_cell ✈active';
            bitsSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'ssh_ids_sort'] == 'size') {
            keytypeSpan.className = '✈table_cell ✈table_header_cell ✈active';
            keytypeSpan.appendChild(sortOrder);
        }
        sshIDElemHeader.appendChild(defaultSpan);
        sshIDElemHeader.appendChild(nameSpan);
        sshIDElemHeader.appendChild(keytypeSpan);
        sshIDElemHeader.appendChild(bitsSpan);
        sshIDElemHeader.appendChild(commentSpan);
        sshIDElemHeader.appendChild(certSpan);
        sshIDListContainer.appendChild(sshIDElemHeader);
        sshIDContent.appendChild(sshIDListContainer);
        if (existingPanel) {
            // Remove everything first
            while (existingPanel.childNodes.length >= 1 ) {
                existingPanel.removeChild(existingPanel.firstChild);
            }
            existingPanel.appendChild(sshIDHeader);
            existingPanel.appendChild(sshNewID);
            existingPanel.appendChild(sshUploadID);
            existingPanel.appendChild(sshIDContent);
        } else {
            sshIDPanel.appendChild(sshIDHeader);
            sshIDPanel.appendChild(sshNewID);
            sshIDPanel.appendChild(sshUploadID);
            sshIDPanel.appendChild(sshIDContent);
            u.hideElement(sshIDPanel);
            u.getNode(go.prefs.goDiv).appendChild(sshIDPanel);
        }
    },
    loadIDs: function() {
        /**:GateOne.SSH.loadIDs()

        Toggles the SSH Identity Manager into view (if not already visible) and asks the server to send us our list of identities.
        */
        var ssh = go.SSH,
            existingPanel = u.getNode('#'+prefix+'panel_ssh_ids');
        ssh.delay = 500; // Reset it
        // Make sure the panel is visible
        if (v.getTransform(existingPanel) != "scale(1)") {
            v.togglePanel('#'+prefix+'panel_ssh_ids');
        }
        // Kick off the process to list them
        go.ws.send(JSON.stringify({'terminal:ssh_get_identities': true}));
    },
    incomingIDsAction: function(message) {
        /**:GateOne.SSH.incomingIDsAction(message)

        This gets attached to the 'sshjs_identities_list' WebSocket action.  Adds *message['identities']* to `GateOne.SSH.identities` and places them into the Identity Manager.
        */
        var ssh = go.SSH,
            existingPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            sshIDHeaderH2 = u.getNode('#'+prefix+'ssh_ids_title'),
            sshIDMetadataDiv = u.getNode('#'+prefix+'ssh_id_metadata'),
            sshIDListContainer = u.getNode('#'+prefix+'ssh_ids_listcontainer'),
            IDElements = u.toArray(u.getNodes('.✈ssh_id'));
        if (message['identities']) {
            ssh.identities = message['identities'];
        }
        existingPanel.style['overflow-y'] = "hidden"; // Only temporary while we're loading
        setTimeout(function() {
            existingPanel.style['overflow-y'] = "auto"; // Set it back after everything is loaded
        }, 750);
        if (IDElements) { // Remove any existing elements from the list
            IDElements.forEach(function(identity) {
                identity.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(identity);
                }, 1000);
            });
        }
        // Clear any leftover metadata
        while (sshIDMetadataDiv.childNodes.length >= 1 ) {
            sshIDMetadataDiv.removeChild(sshIDMetadataDiv.firstChild);
        }
        sshIDMetadataDiv.innerHTML = '<p id="' + prefix + 'ssh_id_tip"><i><b>' + gettext('Tip:') + '</b> ' + gettext('Click on an identity to see its information.') + '</i></p>';
        setTimeout(function() {
            v.applyTransform(sshIDMetadataDiv, '');
            setTimeout(function() {
                var tip = u.getNode('#'+prefix+'ssh_id_tip');
                if (tip) {
                    tip.style.opacity = 0;
                }
            }, 10000);
        }, ssh.delay);
        // Apply the sort function
        ssh.identities.sort(ssh.sortfunc);
        if (ssh.sortToggle) {
            ssh.identities.reverse();
        }
        // This just makes sure they slide in one at a time (because it looks nice)
        ssh.identities.forEach(function(identity) {
            ssh.createIDItem(sshIDListContainer, identity, ssh.delay);
            ssh.delay += 50;
        });
        ssh.delay = 500;
        sshIDHeaderH2.innerHTML = gettext("SSH Identity Manager");
    },
    displayMetadata: function(identity) {
        /**:GateOne.SSH.displayMetadata(identity)

        Displays the information about the given *identity* (its name) in the SSH identities metadata area (on the right).  Also displays the buttons that allow the user to delete the identity or upload a certificate.
        */
        var ssh = go.SSH,
            downloadButton = u.createElement('button', {'id': 'ssh_id_download', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            deleteIDButton = u.createElement('button', {'id': 'ssh_id_delete', 'class': '✈ssh_id_delete ✈button ✈black', 'type': 'submit', 'value': gettext('Submit')}),
            uploadCertificateButton = u.createElement('button', {'id': 'ssh_id_upload_cert', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            sshIDMetadataDiv = u.getNode('#'+prefix+'ssh_id_metadata'),
            IDObj, metadataNames = {},
            confirmDeletion = function(e) {
                go.ws.send(JSON.stringify({'terminal:ssh_delete_identity': IDObj['name']}));
            };
        // Retreive the metadata on the log in question
        for (var i in ssh.identities) {
            if (ssh.identities[i]['name'] == identity) {
                IDObj = ssh.identities[i];
            }
        }
        if (!IDObj) {
            // Not found, nothing to display
            return;
        }
        downloadButton.innerHTML = gettext("Download");
        downloadButton.onclick = function(e) {
            go.ws.send(JSON.stringify({'terminal:ssh_get_private_key': IDObj['name']}));
            go.ws.send(JSON.stringify({'terminal:ssh_get_public_key': IDObj['name']}));
        };
        deleteIDButton.innerHTML = gettext("Delete ") + IDObj['name'];
        deleteIDButton.title = gettext("Delete this identity");
        deleteIDButton.onclick = function(e) {
            v.confirm(gettext('Delete identity ') + IDObj['name'] + '?', gettext("Are you sure you wish to delete this identity?"), confirmDeletion);
        };
        uploadCertificateButton.title = gettext("An X.509 certificate may be uploaded to add to this identity.  If one already exists, the existing certificate will be overwritten.");
        uploadCertificateButton.onclick = function(e) {
            ssh.uploadCertificateForm(identity);
        };
        metadataNames[gettext('Identity Name')] = IDObj.name;
        metadataNames[gettext('Keytype')] = IDObj.keytype;
        metadataNames[gettext('Bits')] = IDObj.bits;
        metadataNames[gettext('Fingerprint')] = IDObj.fingerprint;
        metadataNames[gettext('Comment')] = IDObj.comment;
        metadataNames['Bubble Babble'] = IDObj.bubblebabble;
        if (IDObj['certinfo']) {
            // Only display cert info if there's actually cert info to display
            metadataNames[gettext('Certificate Info')] = IDObj['certinfo'];
            uploadCertificateButton.innerHTML = gettext("Replace Certificate");
        } else {
            // Only display randomart if there's no cert info because otherwise it takes up too much space
            metadataNames['Randomart'] = IDObj['randomart'];
            uploadCertificateButton.innerHTML = gettext("Upload Certificate");
        }
        // Remove existing content first
        while (sshIDMetadataDiv.childNodes.length >= 1 ) {
            sshIDMetadataDiv.removeChild(sshIDMetadataDiv.firstChild);
        }
        var actionsrow = u.createElement('div', {'class': '✈metadata_row'}),
            actionstitle = u.createElement('div', {'class':'✈ssh_id_metadata_title'});
        actionstitle.innerHTML = gettext('Actions');
        actionsrow.appendChild(actionstitle);
        actionsrow.appendChild(downloadButton);
        actionsrow.appendChild(deleteIDButton);
        actionsrow.appendChild(uploadCertificateButton);
        sshIDMetadataDiv.appendChild(actionsrow);
        var pubkeyrow = u.createElement('div', {'class': '✈metadata_row'}),
            pubkeytitle = u.createElement('div', {'class':'✈ssh_id_metadata_title'}),
            pubkeyvalue = u.createElement('textarea', {'class':'✈ssh_id_pubkey_value'});
        pubkeytitle.innerHTML = gettext('Public Key');
        pubkeyvalue.innerHTML = IDObj['public'];
        pubkeyvalue.title = gettext("Click me to select all");
        pubkeyvalue.onclick = function(e) {
            // Select all in the textarea when it is clicked
            this.focus();
            this.select();
        }
        pubkeyrow.appendChild(pubkeytitle);
        pubkeyrow.appendChild(pubkeyvalue);
        sshIDMetadataDiv.appendChild(pubkeyrow);
        for (var i in metadataNames) {
            var row = u.createElement('div', {'class': '✈metadata_row'}),
                title = u.createElement('div', {'class':'✈ssh_id_metadata_title'}),
                value = u.createElement('div', {'class':'✈ssh_id_metadata_value'});
            title.innerHTML = i;
            value.innerHTML = metadataNames[i];
            row.appendChild(title);
            row.appendChild(value);
            sshIDMetadataDiv.appendChild(row);
        }
    },
    createIDItem: function(container, IDObj, delay) {
        /**:GateOne.SSH.displayMetadata(container, IDObj, delay)

        Creates an SSH identity element using *IDObj* and places it into *container*.

        *delay* controls how long it will wait before using a CSS3 effect to move it into view.
        */
        var ssh = go.SSH,
            objName = IDObj['name'],
            elem = u.createElement('div', {'class':'✈sectrans ✈ssh_id', 'name': '✈ssh_id'}),
            IDViewOptions = u.createElement('span', {'class': '✈ssh_id_options'}),
            viewPubKey = u.createElement('a'),
            defaultSpan = u.createElement('span', {'class':'✈table_cell ✈ssh_id_default'}),
            defaultCheckbox = u.createElement('input', {'type': 'checkbox', 'name': 'ssh_id_default', 'value': IDObj['name']}),
            nameSpan = u.createElement('span', {'class':'✈table_cell ✈ssh_id_name'}),
            keytypeSpan = u.createElement('span', {'class':'✈table_cell'}),
            certSpan = u.createElement('span', {'class':'✈table_cell'}),
            bitsSpan = u.createElement('span', {'class':'✈table_cell'}),
            commentSpan = u.createElement('span', {'class':'✈table_cell'}),
            isCertificate = gettext("No");
        defaultCheckbox.checked = IDObj['default'];
        defaultCheckbox.onchange = function(e) {
            // Post the update to the server
            var newDefaults = [],
                defaultIDs = u.toArray(u.getNodes('input[name="ssh_id_default"]')); // I love CSS selectors!
            defaultIDs.forEach(function(idNode){ // I also love forEach!
                if (idNode.checked) {
                    newDefaults.push(idNode.value);
                }
            });
            go.ws.send(JSON.stringify({'terminal:ssh_set_default_identities': newDefaults}));
        }
        defaultSpan.appendChild(defaultCheckbox);
        nameSpan.innerHTML = "<b>" + IDObj['name'] + "</b>";
        keytypeSpan.innerHTML = IDObj['keytype'];
        commentSpan.innerHTML = IDObj['comment'];
        bitsSpan.innerHTML = IDObj['bits'];
        if (IDObj['certinfo'].length) {
            isCertificate = gettext("Yes");
        }
        certSpan.innerHTML = isCertificate;
        elem.appendChild(defaultSpan);
        elem.appendChild(nameSpan);
        elem.appendChild(keytypeSpan);
        elem.appendChild(bitsSpan);
        elem.appendChild(commentSpan);
        elem.appendChild(certSpan);
        elem.onclick = function(e) {
            // Highlight the selected row and show the metadata
            u.toArray(u.getNodes('.✈ssh_id')).forEach(function(node) {
                // Reset them all before we apply the 'active' class to just the one
                node.className = '✈halfsectrans ✈ssh_id';
            });
            this.className = '✈halfsectrans ✈ssh_id ✈active';
            ssh.displayMetadata(objName);
        };
        elem.style.opacity = 0;
        v.applyTransform(elem, 'translateX(-300%)');
        setTimeout(function() {
            // Fade it in
            elem.style.opacity = 1;
        }, delay);
        try {
            container.appendChild(elem);
        } catch(e) {
            u.noop(); // Sometimes the container will be missing between page loads--no biggie
        }
        setTimeout(function() {
            try {
                v.applyTransform(elem, '');
            } catch(e) {
                u.noop(); // Element was removed already.  No biggie.
            }
        }, delay);
        return elem;
    },
    getMaxIDs: function(elem) {
        /**:GateOne.SSH.getMaxIDs(elem)

        Calculates and returns the number of SSH identities that will fit in the given element ID (elem).
        */
        try {
            var ssh = go.SSH,
                node = u.getNode(elem),
                tempID = {
                    'bits': '2048',
                    'bubblebabble': 'xilek-suneb-konon-ruzem-fehis-mobut-hohud-dupul-bafoc-vepur-lixux',
                    'certinfo': '/opt/gateone/users/riskable@gmail.com/ssh/id_rsa-cert.pub:\n        Type: ssh-rsa-cert-v01@openssh.com user certificate\n        Public key: RSA-CERT 80:57:2c:18:f9:86:ab:8b:64:27:db:6f:5e:03:3f:d9\n        Signing CA: RSA 86:25:b0:73:67:0f:51:2e:a7:96:63:08:fb:d6:69:94\n        Key ID: "user_riskable"\n        Serial: 0\n        Valid: from 2012-01-08T13:38:00 to 2013-01-06T13:39:27\n        Principals: \n                riskable\n        Critical Options: (none)\n        Extensions: \n                permit-agent-forwarding\n                permit-port-forwarding\n                permit-pty\n                permit-user-rc\n                permit-X11-forwarding',
                    'comment': 'riskable@portarisk\n',
                    'fingerprint': '80:57:2c:18:f9:86:ab:8b:64:27:db:6f:5e:03:3f:d9',
                    'keytype': 'RSA',
                    'name': 'id_rsa',
                    'public': 'ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEA5NB/jsYcTkixGsQZGx1zdS9dUPmuQNFdu5QtPv2TLLwSc3k1xjnVchUsH4iHSnasqFNk6pUPlFQrX94MXaLUrp/tkR11bjmReIT2Kl2IrzKdsq6XVAek5EfqwjqIZYUPsDGZ8BpoHC3bM2f+3Ba+6ahlecfyYcfjy/XggZow6vBQEgGKBfMCjRfS0pMshpgwFGBTL+zrxicpljNRm0Km8YjgMEnsBeJN5Vi+qJ1Tbw0SpM/z50p5qkoxV7N/lmKzTh8HOQqs8HJZT5WBMk4xRQqI36c6CsR0VBizKnVkdDPN6eWM2TdkQN7cWXzasWKSfonFF/A1UyZv4vKo3EKRhQ== riskable@portarisk\n',
                    'randomart': '+--[ RSA 2048]----+\n|    .+ ..        |\n|    o....        |\n|    .oo.         |\n|    ..o.         |\n|     +  S        |\n|    . o o        |\n| + o   * E       |\n|o.*  .. o        |\n|...o+o           |\n+-----------------+'
                },
                IDElement = l.createIDItem(node, tempID, 500);
                nodeStyle = window.getComputedStyle(node, null),
                elemStyle = window.getComputedStyle(IDElement, null),
                nodeHeight = parseInt(nodeStyle['height'].split('px')[0]),
                height = parseInt(elemStyle['height'].split('px')[0]),
                marginBottom = parseInt(elemStyle['marginBottom'].split('px')[0]),
                paddingBottom = parseInt(elemStyle['paddingBottom'].split('px')[0]),
                borderBottomWidth = parseInt(elemStyle['borderBottomWidth'].split('px')[0]),
                borderTopWidth = parseInt(elemStyle['borderTopWidth'].split('px')[0]),
                elemHeight = height+marginBottom+paddingBottom+borderBottomWidth+borderTopWidth,
                max = Math.floor(nodeHeight/ elemHeight);
        } catch(e) {
            return 1;
        }
        u.removeElement(IDElement); // Don't want this hanging around
        return max;
    },
    newIDForm: function() {
        /**:GateOne.SSH.newIDForm()

        Displays the dialog/form where the user can create or edit an SSH identity.
        */
        var ssh = go.SSH,
            goDiv = u.getNode(go.prefs.goDiv),
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            identityForm = u.createElement('form', {'name': prefix+'ssh_id_form', 'class': '✈ssh_id_form'}),
            nameInput = u.createElement('input', {'type': 'text', 'id': 'ssh_new_id_name', 'name': prefix+'ssh_new_id_name', 'placeholder': gettext('<letters, numbers, underscore>'), 'tabindex': 1, 'required': 'required', 'pattern': '[A-Za-z0-9_]+'}),
            nameLabel = u.createElement('label'),
            keyBitsRow = u.createElement('div', {'class': '✈ssh_keybits_row'}),
            keytypeLabel = u.createElement('label'),
            keytypeSelect = u.createElement('select', {'id': 'ssh_new_id_keytype', 'name': prefix+'ssh_new_id_keytype'}),
            rsaType = u.createElement('option', {'value': 'rsa'}),
            dsaType = u.createElement('option', {'value': 'dsa'}),
            ecdsaType = u.createElement('option', {'value': 'ecdsa'}),
            bitsLabel = u.createElement('label'),
            bitsSelect = u.createElement('select', {'id': 'ssh_new_id_bits', 'name': prefix+'ssh_new_id_bits'}),
            bits256 = u.createElement('option', {'value': '256'}),
            bits384 = u.createElement('option', {'value': '384'}),
            bits521 = u.createElement('option', {'value': '521', 'selected': 'selected'}),
            bits768 = u.createElement('option', {'value': '768'}),
            bits1024 = u.createElement('option', {'value': '1024'}),
            bits2048 = u.createElement('option', {'value': '2048'}),
            bits4096 = u.createElement('option', {'value': '4096', 'selected': 'selected'}),
            ecdsaBits = [bits256, bits384, bits521],
            dsaBits = [bits1024],
            rsaBits = [bits768, bits1024, bits2048, bits4096],
            passphraseInput = u.createElement('input', {'type': 'password', 'id': 'ssh_new_id_passphrase', 'name': prefix+'ssh_new_id_passphrase', 'class': '✈ssh_new_id_passphrase', 'placeholder': gettext('<Optional>'), 'pattern': '.{4}.+'}), // That pattern means > 4 characters
            verifyPassphraseInput = u.createElement('input', {'type': 'password', 'id': 'ssh_new_id_passphrase_verify', 'name': prefix+'ssh_new_id_passphrase_verify', 'placeholder': gettext('<Optional>'), 'pattern': '.{4}.+'}),
            passphraseLabel = u.createElement('label'),
            commentInput = u.createElement('input', {'type': 'text', 'id': 'ssh_new_id_comment', 'name': prefix+'ssh_new_id_comment', 'placeholder': gettext('<Optional>')}),
            commentLabel = u.createElement('label'),
            buttonContainer = u.createElement('div', {'class': '✈centered_buttons'}),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black'}),
            nameValidate = function(e) {
                var nameNode = u.getNode('#'+prefix+'ssh_new_id_name'),
                    text = nameNode.value;
                if (text != text.match(/[A-Za-z0-9_]+/)) {
                    nameNode.setCustomValidity(gettext("Valid characters: Numbers, Letters, Underscores"));
                } else {
                    nameNode.setCustomValidity("");
                }
            },
            passphraseValidate = function(e) {
                var passphraseNode = u.getNode('#'+prefix+'ssh_new_id_passphrase'),
                    verifyNode = u.getNode('#'+prefix+'ssh_new_id_passphrase_verify');
                if (passphraseNode.value != verifyNode.value) {
                    verifyNode.setCustomValidity("Error: Passwords do not match.");
                } else if (passphraseNode.value.length < 5) {
                    verifyNode.setCustomValidity(gettext("Error: Must be longer than four characters."));
                } else {
                    verifyNode.setCustomValidity("");
                }
            };
        submit.innerHTML = gettext("Submit");
        cancel.innerHTML = gettext("Cancel");
        nameLabel.innerHTML = gettext("Name");
        nameLabel.htmlFor = prefix+'ssh_new_id_name';
        nameInput.oninput = nameValidate;
        passphraseInput.oninput = passphraseValidate;
        verifyPassphraseInput.oninput = passphraseValidate;
        keytypeLabel.innerHTML = gettext("Keytype");
        keytypeLabel.htmlFor = prefix+'ssh_new_id_keytype';
        rsaType.innerHTML = "RSA";
        dsaType.innerHTML = "DSA";
        ecdsaType.innerHTML = "ECDSA";
        keytypeSelect.appendChild(ecdsaType);
        keytypeSelect.appendChild(dsaType);
        keytypeSelect.appendChild(rsaType);
        bitsLabel.innerHTML = "Bits";
        bitsLabel.htmlFor = prefix+'ssh_new_id_bits';
        bits521.innerHTML = "521";
        bits384.innerHTML = "384";
        bits256.innerHTML = "256";
        bits768.innerHTML = "768";
        bits1024.innerHTML = "1024"; // NOTE: Only valid option for DSA
        bits2048.innerHTML = "2048";
        bits4096.innerHTML = "4096";
        // Start with ECDSA options by default
        bitsSelect.appendChild(bits521);
        bitsSelect.appendChild(bits384);
        bitsSelect.appendChild(bits256);
        keytypeSelect.onchange = function(e) {
            // Change the bits to reflect the valid options based on the keytype
            u.toArray(bitsSelect.childNodes).forEach(function(node) {
                // Remove all bits options
                u.removeElement(node);
            });
            // Now add in the valid options
            if (keytypeSelect.selectedIndex == 0) { // ecdsa
                ecdsaBits.forEach(function(option) {
                    bitsSelect.appendChild(option);
                });
            } else if (keytypeSelect.selectedIndex == 1) { // dsa
                dsaBits.forEach(function(option) {
                    bitsSelect.appendChild(option);
                });
            } else if (keytypeSelect.selectedIndex == 2) { // rsa
                rsaBits.forEach(function(option) {
                    bitsSelect.appendChild(option);
                });
            }
        };
        passphraseLabel.innerHTML = gettext("Passphrase");
        passphraseLabel.htmlFor = prefix+'ssh_new_id_passphrase';
        commentLabel.innerHTML = gettext("Comment");
        commentLabel.htmlFor = prefix+'ssh_new_id_comment';
        identityForm.appendChild(nameLabel);
        identityForm.appendChild(nameInput);
        keyBitsRow.appendChild(keytypeLabel);
        keyBitsRow.appendChild(keytypeSelect);
        keyBitsRow.appendChild(bitsLabel);
        keyBitsRow.appendChild(bitsSelect);
        identityForm.appendChild(keyBitsRow);
        identityForm.appendChild(passphraseLabel);
        identityForm.appendChild(passphraseInput);
        identityForm.appendChild(verifyPassphraseInput);
        identityForm.appendChild(commentLabel);
        identityForm.appendChild(commentInput);
        buttonContainer.appendChild(submit);
        buttonContainer.appendChild(cancel);
        identityForm.appendChild(buttonContainer);
        var closeDialog = go.Visual.dialog(gettext('New SSH Identity'), identityForm, {'class': '✈prefsdialog', 'style': {'width': '20em'}}); // Just an initial width
        cancel.onclick = closeDialog;
        setTimeout(function() {
            setTimeout(function() {
                u.getNode('#'+prefix+'ssh_new_id_name').focus();
            }, 1000);
        }, 500);
        identityForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var name = u.getNode('#'+prefix+'ssh_new_id_name').value,
                keytype = u.getNode('#'+prefix+'ssh_new_id_keytype').value,
                bits = u.getNode('#'+prefix+'ssh_new_id_bits').value,
                passphrase = u.getNode('#'+prefix+'ssh_new_id_passphrase').value,
                comment = u.getNode('#'+prefix+'ssh_new_id_comment').value,
                settings = {'name': name, 'keytype': keytype, 'bits': bits};
            if (passphrase) {
                settings['passphrase'] = passphrase;
            }
            if (comment) {
                settings['comment'] = comment;
            }
            go.ws.send(JSON.stringify({'terminal:ssh_gen_new_keypair': settings}));
            closeDialog();
            ssh.loadIDs();
        }
    },
    uploadIDForm: function() {
        /**:GateOne.SSH.uploadIDForm()

        Displays the dialog/form where a user can upload an SSH identity (that's already been created).
        */
        var ssh = go.SSH,
            goDiv = go.node,
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            uploadIDForm = u.createElement('form', {'name': prefix+'ssh_upload_id_form', 'class': '✈ssh_id_form'}),
            privateKeyFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_privatekey', 'name': prefix+'ssh_upload_id_privatekey', 'required': 'required'}),
            privateKeyFileLabel = u.createElement('label'),
            publicKeyFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_publickey', 'name': prefix+'ssh_upload_id_publickey'}),
            publicKeyFileLabel = u.createElement('label'),
            certificateFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_cert', 'name': prefix+'ssh_upload_id_cert'}),
            certificateFileLabel = u.createElement('label'),
            note = u.createElement('p', {'style': {'font-size': '80%', 'margin-top': '1em', 'margin-bottom': '1em'}}),
            buttonContainer = u.createElement('div', {'class': '✈centered_buttons'}),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black'});
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        note.innerHTML = "<b>" + gettext("NOTE:") + "</b> " + gettext("If a public key is not provided one will be automatically generated using the private key.  You may be asked for the passphrase to perform this operation.");
        privateKeyFileLabel.innerHTML = gettext("Private Key");
        privateKeyFileLabel.htmlFor = prefix+'ssh_upload_id_privatekey';
        publicKeyFileLabel.innerHTML = gettext("Optional: Public Key");
        publicKeyFileLabel.htmlFor = prefix+'ssh_upload_id_publickey';
        certificateFileLabel.innerHTML = gettext("Optional: Certificate");
        certificateFileLabel.htmlFor = prefix+'ssh_upload_id_cert';
        uploadIDForm.appendChild(privateKeyFileLabel);
        uploadIDForm.appendChild(privateKeyFile);
        uploadIDForm.appendChild(publicKeyFileLabel);
        uploadIDForm.appendChild(publicKeyFile);
        uploadIDForm.appendChild(certificateFileLabel);
        uploadIDForm.appendChild(certificateFile);
        uploadIDForm.appendChild(note);
        buttonContainer.appendChild(submit);
        buttonContainer.appendChild(cancel);
        uploadIDForm.appendChild(buttonContainer);
        var closeDialog = go.Visual.dialog(gettext('Upload SSH Identity'), uploadIDForm, {'class': '✈prefsdialog', 'style': {'width': '20em'}});
        cancel.onclick = closeDialog;
        uploadIDForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var privFile = u.getNode('#'+prefix+'ssh_upload_id_privatekey').files[0],
                pubFile = u.getNode('#'+prefix+'ssh_upload_id_publickey').files[0],
                certFile = u.getNode('#'+prefix+'ssh_upload_id_cert').files[0],
                privateKeyReader = new FileReader(),
                sendPrivateKey = function(evt) {
                    var data = evt.target.result,
                        fileName = null;
                    if (privFile.fileName) {
                        fileName = privFile.fileName;
                    } else {
                        fileName = privFile.name;
                    }
                    var settings = {
                        'name': fileName, // The 'name' here represents the name of the identity, not the file, specifically
                        'private': data,
                    };
                    go.ws.send(JSON.stringify({'terminal:ssh_store_id_file': settings}));
                },
                publicKeyReader = new FileReader(),
                sendPublicKey = function(evt) {
                    var data = evt.target.result,
                        fileName = null;
                    if (pubFile.fileName) {
                        fileName = pubFile.fileName;
                    } else {
                        fileName = pubFile.name;
                    }
                    var settings = {
                        'name': fileName,
                        'public': data,
                    };
                    go.ws.send(JSON.stringify({'terminal:ssh_store_id_file': settings}));
                },
                certificateReader = new FileReader(),
                sendCertificate = function(evt) {
                    var data = evt.target.result,
                        fileName = null;
                    if (certFile.fileName) {
                        fileName = certFile.fileName;
                    } else {
                        fileName = certFile.name;
                    }
                    var settings = {
                        'name': fileName,
                        'certificate': data,
                    };
                    go.ws.send(JSON.stringify({'terminal:ssh_store_id_file': settings}));
                };
            // Get the data out of the files
            privateKeyReader.onload = sendPrivateKey;
            privateKeyReader.readAsText(privFile);
            publicKeyReader.onload = sendPublicKey;
            if (pubFile) {
                publicKeyReader.readAsText(pubFile);
            }
            certificateReader.onload = sendCertificate;
            if (certFile) {
                certificateReader.readAsText(certFile);
            }
            closeDialog();
        }
    },
    uploadCertificateForm: function(identity) {
        /**:GateOne.SSH.uploadCertificateForm(identity)

        Displays the dialog/form where a user can add or replace a certificate associated with their identity.

        *identity* should be the name of the identity associated with this certificate.
        */
        var goDiv = go.node,
            closeDialog,
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            uploadCertForm = u.createElement('form', {'name': prefix+'ssh_upload_cert_form', 'class': '✈ssh_id_form ✈centered_text'}),
            certificateFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_cert', 'name': prefix+'ssh_upload_id_cert'}),
            certificateFileLabel = u.createElement('label'),
            buttonContainer = u.createElement('div', {'class': '✈centered_buttons'}),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black'});
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        certificateFileLabel.innerHTML = gettext("Optional Certificate");
        certificateFileLabel.htmlFor = prefix+'ssh_upload_id_cert';
        uploadCertForm.appendChild(certificateFileLabel);
        uploadCertForm.appendChild(certificateFile);
        buttonContainer.appendChild(submit);
        buttonContainer.appendChild(cancel);
        uploadCertForm.appendChild(buttonContainer);
        closeDialog = go.Visual.dialog(gettext('Upload X.509 Certificate'), uploadCertForm, {'class': '✈prefsdialog', 'style': {'width': '20em'}});
        cancel.onclick = closeDialog;
        uploadCertForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var certFile = u.getNode('#'+prefix+'ssh_upload_id_cert').files[0],
                certificateReader = new FileReader(),
                sendCertificate = function(evt) {
                    var data = evt.target.result,
                        settings = {
                            'name': identity,
                            'certificate': data,
                        };
                    go.ws.send(JSON.stringify({'terminal:ssh_store_id_file': settings}));
                };
            // Get the data out of the files
            certificateReader.onload = sendCertificate;
            certificateReader.readAsText(certFile);
            closeDialog();
        };
    },
    enterPassphraseAction: function(settings) {
        /**:GateOne.SSH.enterPassphraseAction(settings)

        Displays the dialog/form where a user can enter a passphrase for a given identity (called by the server if something requires it).
        */
        var goDiv = go.node,
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            passphraseForm = u.createElement('form', {'name': prefix+'ssh_passphrase_form', 'class': '✈ssh_id_form'}),
            passphrase = u.createElement('input', {'type': 'password', 'id': 'ssh_passphrase', 'name': prefix+'ssh_passphrase'}),
            passphraseLabel = u.createElement('label'),
            explanation = u.createElement('p', {'style': {'margin-top': '0.5em'}}),
            safetyNote = u.createElement('p', {'style': {'font-size': '80%'}}),
            buttonContainer = u.createElement('div', {'class': '✈centered_buttons'}),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black'});
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        passphrase.autofocus = "autofocus";
        explanation.innerHTML = gettext("The private key for this SSH identity is protected by a passphrase.  Please enter the passphrase so a public key can be generated.");
        safetyNote.innerHTML = "<b>" + gettext("NOTE:") + "</b> " + gettext("This passphrase will only be used to extract the public key and will not be stored.");
        passphraseLabel.innerHTML = gettext("Passphrase");
        passphraseLabel.htmlFor = prefix+'ssh_passphrase';
        passphraseForm.appendChild(explanation);
        passphraseForm.appendChild(passphraseLabel);
        passphraseForm.appendChild(passphrase);
        passphraseForm.appendChild(safetyNote);
        buttonContainer.appendChild(submit);
        buttonContainer.appendChild(cancel);
        passphraseForm.appendChild(buttonContainer);
        var closeDialog = go.Visual.dialog(gettext('Passphrase for') + '"' + settings['name'] + '"', passphraseForm, {'class': '✈prefsdialog', 'style': {'width': '23em'}});
        // TODO: Make it so that the identity in question gets deleted if the user cancels out trying to enter the correct passphrase
        // TODO: Alternatively, hang on to the identity but provide a button to re-try the passphrase (will require some server-side detection too I think)
        if (settings['bad']) {
            delete settings['bad'];
            explanation.innerHTML = "<span style='color: red;'>" + gettext("Invalid passphrase.") + "</span> " + gettext("Please try again.");
        }
        cancel.onclick = closeDialog;
        passphraseForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            settings['passphrase'] = passphrase.value;
            go.ws.send(JSON.stringify({'terminal:ssh_store_id_file': settings}));
            closeDialog();
        }
    },
    getConnectString: function(term) {
        /**:GateOne.SSH.getConnectString(term)

        Asks the SSH plugin on the Gate One server what the SSH connection string is for the given *term*.
        */
        logDebug('getConnectString: ' + term);
        go.ws.send(JSON.stringify({'terminal:ssh_get_connect_string': term}));
    },
    deleteCompleteAction: function(message) {
        /**:GateOne.SSH.deleteCompleteAction(message)

        Called when an identity is deleted, calls :js:meth:`GateOne.SSH.loadIDs`
        */
        go.SSH.loadIDs();
    },
    handleConnect: function(connectString) {
        /**:GateOne.SSH.handleConnect(connectString)

        Handles the `terminal:sshjs_connect` WebSocket action which should provide an SSH *connectString* in the form of 'user@host:port'.

        The *connectString* will be stored in `GateOne.Terminal.terminals[term]['sshConnectString']` which is meant to be used in duplicating terminals (because you can't rely on the title).

        Also requests the host's public SSH key so it can be displayed to the user.
        */
        logDebug('sshjs_connect: ' + connectString);
        var host = connectString.split('@')[1].split(':')[0],
            port = connectString.split('@')[1].split(':')[1],
            message = {'host': host, 'port': port},
            term = localStorage[prefix+'selectedTerminal'];
        t.terminals[term]['sshConnectString'] = connectString;
        go.ws.send(JSON.stringify({'terminal:ssh_get_host_fingerprint': message}));
    },
    handleReconnect: function(message) {
        /**:GateOne.SSH.handleReconnect(message)

        Handles the `terminal:sshjs_reconnect` WebSocket action which should provide an object containing each terminal's SSH connection string.  Example *message*::

            {"term": 1, "connect_string": "user@host1:22"}
        */
        var term = message['term'];
        if (t.terminals[term]) {
            t.terminals[term]['sshConnectString'] = message['connect_string'];
        }
    },
    keygenComplete: function(message) {
        /**:GateOne.SSH.keygenComplete(message)

        Called when we receive a message from the server indicating a keypair was generated successfully.
        */
        var ssh = go.SSH;
        if (message['result'] == 'Success') {
            v.displayMessage(gettext('Keypair generation complete.'));
        } else {
            v.displayMessage(message['result']);
        }
        ssh.loadIDs();
    },
    saveComplete: function(message) {
        /**:GateOne.SSH.saveComplete(message)

        Called when we receive a message from the server indicating the uploaded identity was saved.
        */
        var ssh = go.SSH;
        if (message['result'] == 'Success') {
            v.displayMessage(gettext('Identity saved successfully.'));
        } else {
            v.displayMessage(message['result']);
        }
        ssh.loadIDs();
    },
    duplicateSession: function(term) {
        /**:GateOne.SSH.duplicateSession(term)

        Duplicates the SSH session at *term* in a new terminal.
        */
        var connectString = go.Terminal.terminals[term]['sshConnectString'],
            connectFunc = function(term) {
                // This gets attached to the "new_terminal" event
                go.Terminal.sendString('ssh://' + connectString + '\n', term);
            }
        if (!connectString) {
            return; // Can't do anything without a connection string!
        }
        if (!go.prefs.autoConnectURL) {
            // Only send the connection string if autoConnectURL isn't set
            E.once("terminal:new_terminal", connectFunc);
        }
        go.Terminal.newTerminal();
    },
    handleKnownHosts: function(message) {
        /**:GateOne.SSH.handleKnownHosts(message)

        Updates the sshKHTextArea with the contents of *message['known_hosts']*.
        */
        var sshKHTextArea = u.getNode('#'+prefix+'ssh_kh_textarea'),
            storeEditor = function(cm) {
                // Stores the instance of CodeMirror as GateOne.SSH.khEditor
                go.SSH.khEditor = cm;
            },
            enableEditor = function() {
                // Add the Editor so we get line numbers
                go.Editor.fromTextArea(u.getNode("#go_default_ssh_kh_textarea"), {lineNumbers: true, lineWrapping: true, tabindex: 1, autofocus: true}, storeEditor);
            };
        sshKHTextArea.value = message.known_hosts;
        // Now show the panel
        v.togglePanel('#'+prefix+'panel_known_hosts', enableEditor);
    },
    createKHPanel: function() {
        /**:GateOne.SSH.createKHPanel()

        Creates a panel where the user can edit their known_hosts file and appends it to '#gateone'.

        If the panel already exists its contents will be destroyed and re-created.
        */
        var existingPanel = u.getNode('#'+prefix+'panel_known_hosts'),
            sshPanel = u.createElement('div', {'id': 'panel_known_hosts', 'class': '✈panel ✈sectrans ✈panel_known_hosts'}),
            sshHeader = u.createElement('div', {'id': 'ssh_header', 'class': '✈sectrans'}),
            sshHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            sshKHTextArea = u.createElement('textarea', {'id': 'ssh_kh_textarea', 'rows': 30, 'cols': 100}),
            save = u.createElement('button', {'id': 'ssh_save', 'class': '✈button ✈black', 'type': 'submit'}),
            cancel = u.createElement('button', {'id': 'ssh_cancel', 'class': '✈button ✈black'}),
            form = u.createElement('form', {
                'method': 'post',
                'action': go.prefs.url+'ssh?known_hosts=True'
            });
        sshHeader.innerHTML = '<h2>' + gettext('SSH Plugin: Edit Known Hosts') + '</h2>';
        sshHeader.appendChild(sshHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        save.innerHTML = gettext("Save");
        cancel.innerHTML = gettext("Cancel");
        cancel.onclick = function(e) {
            e.preventDefault(); // Don't submit the form
            v.togglePanel('#'+prefix+'panel_known_hosts'); // Hide the panel
        }
        sshKHTextArea.onfocus = function(e) {
            sshKHTextArea.focus();
            go.Terminal.Input.disableCapture();
        }
        sshKHTextArea.onblur = function(e) {
            go.Terminal.Input.capture();
        }
        form.onsubmit = function(e) {
            // Submit the modified known_hosts file to the server and notify when complete
            e.preventDefault(); // Don't actually submit
            var kh = GateOne.SSH.khEditor.getValue();
            go.ws.send(JSON.stringify({'terminal:ssh_save_known_hosts': kh}));
            v.displayMessage(gettext("SSH Plugin: known_hosts saved."));
            // Hide the panel
            v.togglePanel('#'+prefix+'panel_known_hosts');
        }
        form.appendChild(sshHeader);
        form.appendChild(sshKHTextArea);
        form.appendChild(sshHRFix);
        form.appendChild(save);
        form.appendChild(cancel);
        if (existingPanel) {
            // Remove everything
            u.removeElement(existingPanel);
        }
        sshPanel.appendChild(form);
        u.hideElement(sshPanel);
        u.getNode(go.prefs.goDiv).appendChild(sshPanel);
    },
    displayHostFingerprint: function(message) {
        /**:GateOne.SSH.displayHostFingerprint(message)

        Displays the host's key as sent by the server via the 'sshjs_display_fingerprint' WebSocket action.

        The fingerprint will be colorized using the hex values of the fingerprint as the color code with the last value highlighted in bold.
        */
        // Example message: {"sshjs_display_fingerprint": {"result": "Success", "fingerprint": "cc:2f:b9:4f:f6:c0:e5:1d:1b:7a:86:7b:ff:86:97:5b"}}
        console.log('message:', message);
        if (message['result'] == 'Success') {
            var fingerprint = message['fingerprint'],
                hexes = fingerprint.split(':'),
                text = '',
                colorized = '',
                count = 0,
                temp;
            if (fingerprint.indexOf('ECDSA') == -1) { // Old fashioned fingerprint
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
            } else {
                temp = fingerprint.split(':')[1]; // Just the fingerprint part
                colorized = fingerprint.split(':')[0] + ':<br>' + temp.substring(0, temp.length - 8); // All but the last 8 chars which we'll highlight
                colorized += '<span style="color: #0ACD24">'; // A nice bright green for the last few bits
                colorized += temp.substr(temp.length - 8);
                colorized += '</span>';
            }
            v.displayMessage('<i>' + message['host'] + '</i>: ' + colorized);
        }
    },
    commandCompleted: function(message) {
        /**:GateOne.SSH.commandCompleted(message)

        Uses the contents of *message* to report the results of the command executed via :js:meth:`~GateOne.SSH.execRemoteCmd`.

        The *message* should be something like::

            {
                'term': 1,
                'cmd': 'uptime',
                'output': ' 20:45:27 up 13 days,  3:44,  9 users,  load average: 1.21, 0.79, 0.57',
                'result', 'Success'
            }

        If 'result' is anything other than 'Success' the error will be displayed to the user.

        If a callback was registered in :js:attr:`GateOne.SSH.remoteCmdCallbacks[term]` it will be called like so::

            callback(message['output'])

        Otherwise the output will just be displayed to the user.  After the callback has executed it will be removed from `GateOne.SSH.remoteCmdCallbacks`.
        */
        var term = message['term'],
            cmd = message['cmd'],
            output = message['output'],
            result = message['result'];
        if (result != 'Success') {
            v.displayMessage(gettext("Error executing background command, ") + "'" + cmd + "' " + gettext("on terminal ") + term + ": " + result);
            if (go.SSH.remoteCmdErrorbacks[term][cmd]) {
                go.SSH.remoteCmdErrorbacks[term][cmd](result);
                delete go.SSH.remoteCmdErrorbacks[term][cmd];
            }
            return;
        }
        if (go.SSH.remoteCmdCallbacks[term][cmd]) {
            go.SSH.remoteCmdCallbacks[term][cmd](output);
            delete go.SSH.remoteCmdCallbacks[term][cmd];
        } else { // If you don't have an associated callback it will display and log the output:  VERY useful in debugging!
            v.displayMessage(gettext("Remote command output from terminal ") + term + ": " + output);
        }
    },
    execRemoteCmd: function(term, command, callback, errorback) {
        /**:GateOne.SSH.execRemoteCmd(term, command, callback, errorback)

        Executes *command* by creating a secondary shell in the background using the multiplexed tunnel of *term* (works just like :js:meth:`~GateOne.SSH.duplicateSession`).

        Calls *callback* when the result of *command* comes back.

        Calls *errorback* if there's an error executing the command.
        */
        var ssh = go.SSH;
        // Create an associative array to keep track of which callback belongs to which command (so we can support multiple simultaneous commands/callbacks for the same terminal)
        if (!ssh.remoteCmdCallbacks[term]) {
            ssh.remoteCmdCallbacks[term] = {};
            // The errorbacks need an associative array too
            ssh.remoteCmdErrorbacks[term] = {};
        }
        // Set the callback for *term*
        ssh.remoteCmdCallbacks[term][command] = callback;
        // Set the errorback for *term*
        ssh.remoteCmdErrorbacks[term][command] = errorback;
        if (go.ws.readyState != 1) {
            ssh.commandCompleted({'term': term, 'cmd': command, 'result': gettext('WebSocket is disconnected.')});
        } else {
            go.ws.send(JSON.stringify({'terminal:ssh_execute_command': {'term': term, 'cmd': command}}));
        }
    }
});

// This is the favicon that gets used for SSH URLs in bookmarks
go.Icons['ssh'] = 'data:image/x-icon;base64,AAABAAIABQkAAAEAIAAAAQAAJgAAABAQAAABAAgAaAUAACYBAAAoAAAABQAAABIAAAABACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////SP///0j///9I////SP///w////8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A+AAAAPgAAAD4AAAA+AAAAPgAAAD4AAAA+AAAAPgAAAD4AAAAKAAAABAAAAAgAAAAAQAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACcnJwAoKSkAKikpACorKgArKysAKywrACwtLAAtLi0ALi4tAC0uLgAuLy4ALi8vAC8wLwAwMC8AMDAwADAxMAAxMjAAMTIxADIzMQAyMzIAMjMzADI0MgAyNDMAMzQ0ADQ0NAAzNTQANDU0ADQ2NAA0NjUANTY1ADU2NgA1NzUANjc2ADY3NwA3ODcANjg4ADc5NwA3OTgAODk4ADg5OQA4OjkAOTo5ADk6OgA5OzoAOjs6ADo7OwA6PDsAOzw7ADw9PAA8PjwAPD49ADw+PgA9Pz4APT8/AD1APgA/QD8AP0E/AEBBQQBAQkAAQEJBAEFCQQBBQ0IAQkRCAEJEQwBDRUMAREZFAEZIRwBGSUYAR0lHAEdKSABHSkkASEtJAElMSgBKTUsAS05MAE5QTwBnaGcAkXBUAG1wbgB+f34AgoOCAMOLWgDQlmMAj5CQAJCRkQChoqEAsrOyALO0swC3t7cAvL29AL29vQC+v74AxcXFAMbGxgDHx8cAyMjIAMrKygDLy8sAzMzMAM3NzQDOzs4Az8/PANHR0QDS0tIA1NTUANbW1gDb29sA39/fAOTk5ADo6OgA6enpAO3t7QDv7+8A8fHxAP///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABzc3Nzc3Nzc3Nzc3Nzc3Nzc1xoaGhoaGhoaGhoaGhac3NlNjEtJiEYEQ0IBQIAXXNzZDk0MC4kHxcRDAcEAV1zc2M9ODRPKSQdFBALBgNdc3NiQExVW1AoIhsVDwoGXnNzYUE/O1NXLighGRMOCV9zc2FDS1ZYNDAsJh0aEgxgc3NhRk5XNDQ0LyojHBYRYnNzYUhFVFlUODMvKCEcFGVzc2FKR0RUQDw3MiwnIBpmc3NhSklHQkE+OjUyKyUeZ3NzaGZpamtsbW9wbmxramhzc2hNcnJycnJycnJycmhNc3NRYWFhYXFRUVFRUVFRUXNzUVFRUVFRUVFRUVFRUlJz//8AAIABAACAAQAAgAEAAIABAACAAQAAgAEAAIABAACAAQAAgAEAAIABAACAAQAAgAEAAIABAACAAQAAgAEAAA==';

});
