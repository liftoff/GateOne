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

// GateOne.SSH (ssh client functions)
GateOne.Base.module(GateOne, "SSH", "1.0", ['Base']);
GateOne.SSH.identities = []; // SSH identity objects end up in here
GateOne.SSH.remoteCmdCallbacks = {};
GateOne.SSH.remoteCmdErrorbacks = {};
GateOne.Base.update(GateOne.SSH, {
    init: function() {
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            prefsPanel = u.getNode('#'+prefix+'panel_prefs'),
            infoPanel = u.getNode('#'+prefix+'panel_info'),
            h3 = u.createElement('h3'),
            infoPanelDuplicateSession = u.createElement('button', {'id': 'duplicate_session', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            infoPanelManageIdentities = u.createElement('button', {'id': 'manage_identities', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            prefsPanelKnownHosts = u.createElement('button', {'id': 'edit_kh', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
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
        infoPanelManageIdentities.innerHTML = "Manage Identities";
        infoPanelManageIdentities.onclick = function() {
            go.SSH.loadIDs();
        }
        infoPanelDuplicateSession.innerHTML = "Duplicate Session";
        infoPanelDuplicateSession.onclick = function() {
            var term = localStorage[prefix+'selectedTerminal'];
            go.SSH.duplicateSession(term);
        }
        h3.innerHTML = "SSH Plugin";
        if (prefsPanel) {// Only add to the prefs panel if it actually exists (i.e. not in embedded mode) = u.getNode('#'+prefix+'panel_prefs'),
            infoPanel.appendChild(h3);
            infoPanel.appendChild(infoPanelDuplicateSession);
            infoPanel.appendChild(infoPanelManageIdentities);
            infoPanel.appendChild(prefsPanelKnownHosts);
            go.SSH.createKHPanel();
        }
        // Setup a callback that runs disableCapture() whenever the panel is opened
        if (!GateOne.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_ssh_ids']) {
            GateOne.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_ssh_ids'] = {};
        }
        GateOne.Visual.panelToggleCallbacks['in']['#'+prefix+'panel_ssh_ids']['disableCapture'] = GateOne.Input.disableCapture;
        // Setup a callback that runs capture() whenever the panel is closed
        if (!GateOne.Visual.panelToggleCallbacks['out']['#'+prefix+'panel_ssh_ids']) {
            GateOne.Visual.panelToggleCallbacks['out']['#'+prefix+'panel_ssh_ids'] = {};
        }
        GateOne.Visual.panelToggleCallbacks['out']['#'+prefix+'panel_ssh_ids']['disableCapture'] = GateOne.Input.capture;
        go.SSH.createPanel();
        go.Net.addAction('sshjs_connect', go.SSH.handleConnect);
        go.Net.addAction('sshjs_reconnect', go.SSH.handleReconnect);
        go.Net.addAction('sshjs_keygen_complete', go.SSH.keygenComplete);
        go.Net.addAction('sshjs_save_id_complete', go.SSH.saveComplete);
        go.Net.addAction('sshjs_display_fingerprint', go.SSH.displayHostFingerprint);
        go.Net.addAction('sshjs_identities_list', go.SSH.incomingIDsAction);
        go.Net.addAction('sshjs_delete_identity_complete', go.SSH.deleteCompleteAction);
        go.Net.addAction('sshjs_cmd_output', go.SSH.commandCompleted);
        go.Net.addAction('sshjs_ask_passphrase', go.SSH.enterPassphraseAction);
        go.Terminal.newTermCallbacks.push(go.SSH.getConnectString);
        if (!go.prefs.embedded) {
            go.Input.registerShortcut('KEY_D', {'modifiers': {'ctrl': true, 'alt': true, 'meta': false, 'shift': false}, 'action': 'GateOne.SSH.duplicateSession(localStorage[GateOne.prefs.prefix+"selectedTerminal"])'});
        }
    },
    createPanel: function() {
        // Creates the SSH identity management panel (the shell of it anyway)
        var go = GateOne,
            u = go.Utils,
            ssh = go.SSH,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            sshIDPanel = u.createElement('div', {'id': 'panel_ssh_ids', 'class': 'panel sectrans'}),
            sshIDHeader = u.createElement('div', {'id': 'ssh_ids_header', 'class': 'sectrans'}),
            sshIDHeaderH2 = u.createElement('h2', {'id': 'ssh_ids_title', 'class': 'sectrans'}),
            sshNewID = u.createElement('a', {'id': 'ssh_new_id', 'class': 'halfsectrans ssh_panel_link'}),
            sshUploadID = u.createElement('a', {'id': 'ssh_upload_id', 'class': 'halfsectrans ssh_panel_link'}),
            sshIDHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': 'panel_close_icon', 'title': "Close This Panel"}),
            sshIDContent = u.createElement('div', {'id': 'ssh_ids_container', 'class': 'sectrans'}),
            sshIDInfoContainer = u.createElement('div', {'id': 'ssh_id_info', 'class': 'sectrans'}),
            sshIDListContainer = u.createElement('div', {'id': 'ssh_ids_listcontainer', 'class': 'sectrans'}),
            sshIDElemHeader = u.createElement('div', {'id': 'ssh_id_header', 'class':'table_header_row sectrans'}),
            defaultSpan = u.createElement('span', {'id': 'ssh_id_defaultspan', 'class':'table_cell table_header_cell'}),
            nameSpan = u.createElement('span', {'id': 'ssh_id_namespan', 'class':'table_cell table_header_cell'}),
            keytypeSpan = u.createElement('span', {'id': 'ssh_id_keytypespan', 'class':'table_cell table_header_cell'}),
            commentSpan = u.createElement('span', {'id': 'ssh_id_commentspan', 'class':'table_cell table_header_cell'}),
            bitsSpan = u.createElement('span', {'id': 'ssh_id_bitsspan', 'class':'table_cell table_header_cell'}),
            certSpan = u.createElement('span', {'id': 'ssh_id_certspan', 'class':'table_cell table_header_cell'}),
            sortOrder = u.createElement('span', {'id': 'ssh_ids_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
            sshIDMetadataDiv = u.createElement('div', {'id': 'ssh_id_metadata', 'class': 'sectrans'});
        sshIDHeaderH2.innerHTML = 'SSH Identity Manager: Loading...';
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_ssh_ids'); // Scale away, scale away, scale away.
        }
        sshIDHeader.appendChild(sshIDHeaderH2);
        sshIDHeader.appendChild(panelClose);
        sshIDHeader.appendChild(sshIDHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        sshNewID.innerHTML = "+ New Identity";
        sshNewID.onclick = function(e) {
            // Show the new identity dialog/form
            ssh.newIDForm();
        }
        sshUploadID.innerHTML = "+ Upload";
        sshUploadID.onclick = function(e) {
            // Show the upload identity dialog/form
            ssh.uploadIDForm();
        }
        go.Visual.applyTransform(sshIDMetadataDiv, 'translate(300%)'); // It gets translated back in showIDs
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
            u.toArray(sshIDElemHeader.getElementsByClassName('table_header_cell')).forEach(function(item) {
                item.className = 'table_cell table_header_cell';
            });
            this.className = 'table_cell table_header_cell active';
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
            u.toArray(sshIDElemHeader.getElementsByClassName('table_header_cell')).forEach(function(item) {
                item.className = 'table_cell table_header_cell';
            });
            this.className = 'table_cell table_header_cell active';
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
            u.toArray(sshIDElemHeader.getElementsByClassName('table_header_cell')).forEach(function(item) {
                item.className = 'table_cell table_header_cell';
            });
            this.className = 'table_cell table_header_cell active';
            if (ssh.sortToggle) {
                order.innerHTML = "▴";
            } else {
                order.innerHTML = "▾";
            }
            this.appendChild(order);
            ssh.loadIDs();
        }
        defaultSpan.innerHTML = "Default"
        defaultSpan.title = "This field indicates whether or not this identity should be used by default for all connections.  NOTE: If an identity isn't set as default it can still be used for individual servers by using bookmarks or passing it as a query string parameter to the ssh:// URL when opening a new terminal.  For example:  ssh://user@host:22/?identity=*name*";
        nameSpan.innerHTML = "Name";
        nameSpan.title = "The *name* of this identity.  NOTE: The name represented here actually encompasses two or three files:  '*name*', '*name*.pub', and if there's an associated X.509 certificate, '*name*-cert.pub'.";
        bitsSpan.innerHTML = "Bits";
        bitsSpan.title = "The cryptographic key size.  NOTE:  RSA keys can have a value from 768 to 4096 (with 2048 being the most common), DSA keys must have a value of 1024, and ECDSA (that is, Elliptic Curve DSA) keys must be one of 256, 384, or 521 (that's not a typo: five hundred twenty one)";
        keytypeSpan.innerHTML = "Keytype";
        keytypeSpan.title = "Indicates the type of key used by this identity.  One of RSA, DSA, or ECDSA.";
        certSpan.innerHTML = "Cert";
        certSpan.title = "This field indicates whether or not there's an X.509 certificate associated with this identity (i.e. a '*name*-cert.pub' file).  X.509 certificates (for use with SSH) are created by signing a public key using a Certificate Authority (CA).  NOTE: In order to use X.509 certificates for authentication with SSH the servers you're connecting to must be configured to trust keys signed by a given CA.";
        commentSpan.innerHTML = "Comment";
        commentSpan.title = "This field will contain the comment from the identity's public key.  It comes after the key itself inside its .pub file and if the key was generated by OpenSSH it will typically be something like, 'user@host'.";
        if (localStorage[prefix+'ssh_ids_sort'] == 'alpha') {
            nameSpan.className = 'table_cell table_header_cell active';
            nameSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'ssh_ids_sort'] == 'date') {
            bitsSpan.className = 'table_cell table_header_cell active';
            bitsSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'ssh_ids_sort'] == 'size') {
            keytypeSpan.className = 'table_cell table_header_cell active';
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
            u.getNode(go.prefs.goDiv).appendChild(sshIDPanel);
        }
    },
    loadIDs: function() {
        // Toggles the panel into view (if not already visible) and tells the server to send us our list of identities
        var go = GateOne,
            u = go.Utils,
            ssh = go.SSH,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_ssh_ids');
        ssh.delay = 500; // Reset it
        // Make sure the panel is visible
        if (go.Visual.getTransform(existingPanel) != "scale(1)") {
            go.Visual.togglePanel('#'+prefix+'panel_ssh_ids');
        }
        // Kick off the process to list them
        go.ws.send(JSON.stringify({'ssh_get_identities': true}));
    },
    incomingIDsAction: function(message) {
        // Adds *message['identities']* to GateOne.SSH.identities and places them into the view.
        var go = GateOne,
            u = go.Utils,
            ssh = go.SSH,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            sshIDHeaderH2 = u.getNode('#'+prefix+'ssh_ids_title'),
            sshIDMetadataDiv = u.getNode('#'+prefix+'ssh_id_metadata'),
            sshIDListContainer = u.getNode('#'+prefix+'ssh_ids_listcontainer'),
            IDElements = u.toArray(u.getNodes('.ssh_id'));
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
        sshIDMetadataDiv.innerHTML = '<p id="' + prefix + 'ssh_id_tip"><i><b>Tip:</b> Click on an identity to see its information.</i></p>';
        setTimeout(function() {
            go.Visual.applyTransform(sshIDMetadataDiv, '');
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
        sshIDHeaderH2.innerHTML = "SSH Identity Manager";
    },
    displayMetadata: function(identity) {
        // Displays the information about the given *identity* (its name) in the SSH identities metadata area (on the right).
        // Also displays the buttons that allow the user to delete the identity or upload a certificate.
        var go = GateOne,
            u = go.Utils,
            ssh = go.SSH,
            prefix = go.prefs.prefix,
            downloadButton = u.createElement('button', {'id': 'ssh_id_download', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            deleteIDButton = u.createElement('button', {'id': 'ssh_id_delete', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            uploadCertificateButton = u.createElement('button', {'id': 'ssh_id_upload_cert', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            sshIDMetadataDiv = u.getNode('#'+prefix+'ssh_id_metadata'),
            IDObj = null;
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
        downloadButton.innerHTML = "Download";
        downloadButton.onclick = function(e) {
            go.ws.send(JSON.stringify({'ssh_get_private_key': IDObj['name']}));
            go.ws.send(JSON.stringify({'ssh_get_public_key': IDObj['name']}));
        }
        deleteIDButton.innerHTML = "Delete " + IDObj['name'];
        deleteIDButton.title = "Delete this identity";
        deleteIDButton.onclick = function(e) {
            // Display a confirmation dialog
            var container = u.createElement('div', {'style': {'text-align': 'center'}}),
                yes = u.createElement('button', {'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
                no = u.createElement('button', {'type': 'submit', 'value': 'Submit', 'class': 'button black'});
            yes.innerHTML = "Yes";
            no.innerHTML = "No";
            container.appendChild(yes);
            container.appendChild(no);
            var closeDialog = go.Visual.dialog('Delete identity ' + IDObj['name'] + '?', container);
            yes.onclick = function(e) {
                go.ws.send(JSON.stringify({'ssh_delete_identity': IDObj['name']}));
                closeDialog();
            }
            no.onclick = closeDialog;
        }
        uploadCertificateButton.title = "An X.509 certificate may be uploaded to add to this identity.  If one already exists, the existing certificate will be overwritten.";
        uploadCertificateButton.onclick = function(e) {
            ssh.uploadCertificateForm(identity);
        }
        var metadataNames = {
            'Identity Name': IDObj['name'],
            'Keytype': IDObj['keytype'],
            'Bits': IDObj['bits'],
            'Fingerprint': IDObj['fingerprint'],
            'Comment': IDObj['comment'],
            'Bubble Babble': IDObj['bubblebabble'],
        };
        if (IDObj['certinfo']) {
            // Only display cert info if there's actually cert info to display
            metadataNames['Certificate Info'] = IDObj['certinfo'];
            uploadCertificateButton.innerHTML = "Replace Certificate";
        } else {
            // Only display randomart if there's no cert info because otherwise it takes up too much space
            metadataNames['Randomart'] = IDObj['randomart'];
            uploadCertificateButton.innerHTML = "Upload Certificate";
        }
        // Remove existing content first
        while (sshIDMetadataDiv.childNodes.length >= 1 ) {
            sshIDMetadataDiv.removeChild(sshIDMetadataDiv.firstChild);
        }
        var actionsrow = u.createElement('div', {'class': 'metadata_row'}),
            actionstitle = u.createElement('div', {'class':'ssh_id_metadata_title'});
        actionstitle.innerHTML = 'Actions';
        actionsrow.appendChild(actionstitle);
        actionsrow.appendChild(downloadButton);
        actionsrow.appendChild(deleteIDButton);
        actionsrow.appendChild(uploadCertificateButton);
        sshIDMetadataDiv.appendChild(actionsrow);
        var pubkeyrow = u.createElement('div', {'class': 'metadata_row'}),
            pubkeytitle = u.createElement('div', {'class':'ssh_id_metadata_title'}),
            pubkeyvalue = u.createElement('textarea', {'class':'ssh_id_pubkey_value'});
        pubkeytitle.innerHTML = 'Public Key';
        pubkeyvalue.innerHTML = IDObj['public'];
        pubkeyvalue.title = "Click me to select all";
        pubkeyvalue.onclick = function(e) {
            // Select all in the textarea when it is clicked
            this.focus();
            this.select();
        }
        pubkeyrow.appendChild(pubkeytitle);
        pubkeyrow.appendChild(pubkeyvalue);
        sshIDMetadataDiv.appendChild(pubkeyrow);
        for (var i in metadataNames) {
            var row = u.createElement('div', {'class': 'metadata_row'}),
                title = u.createElement('div', {'class':'ssh_id_metadata_title'}),
                value = u.createElement('div', {'class':'ssh_id_metadata_value'});
            title.innerHTML = i;
            value.innerHTML = metadataNames[i];
            row.appendChild(title);
            row.appendChild(value);
            sshIDMetadataDiv.appendChild(row);
        }
    },
    createIDItem: function(container, IDObj, delay) {
        // Creates an SSH identity element using *IDObj* and places it into *container*.
        // *delay* controls how long it will wait before using a CSS3 effect to move it into view.
        var go = GateOne,
            u = go.Utils,
            ssh = go.SSH,
            prefix = go.prefs.prefix,
            elem = u.createElement('div', {'class':'sectrans ssh_id', 'name': prefix+'ssh_id'}),
            IDViewOptions = u.createElement('span', {'class': 'ssh_id_options'}),
            viewPubKey = u.createElement('a'),
            defaultSpan = u.createElement('span', {'class':'table_cell ssh_id_default'}),
            defaultCheckbox = u.createElement('input', {'type': 'checkbox', 'name': 'ssh_id_default', 'value': IDObj['name']}),
            nameSpan = u.createElement('span', {'class':'table_cell ssh_id_name'}),
            keytypeSpan = u.createElement('span', {'class':'table_cell'}),
            certSpan = u.createElement('span', {'class':'table_cell'}),
            bitsSpan = u.createElement('span', {'class':'table_cell'}),
            commentSpan = u.createElement('span', {'class':'table_cell'}),
            isCertificate = "No";
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
            GateOne.ws.send(JSON.stringify({'ssh_set_default_identities': newDefaults}));
        }
        defaultSpan.appendChild(defaultCheckbox);
        nameSpan.innerHTML = "<b>" + IDObj['name'] + "</b>";
        keytypeSpan.innerHTML = IDObj['keytype'];
        commentSpan.innerHTML = IDObj['comment'];
        bitsSpan.innerHTML = IDObj['bits'];
        if (IDObj['certinfo'].length) {
            isCertificate = "Yes";
        }
        certSpan.innerHTML = isCertificate;
        elem.appendChild(defaultSpan);
        elem.appendChild(nameSpan);
        elem.appendChild(keytypeSpan);
        elem.appendChild(bitsSpan);
        elem.appendChild(commentSpan);
        elem.appendChild(certSpan);
        with ({ name: IDObj['name'] }) {
            elem.onclick = function(e) {
                // Highlight the selected row and show the metadata
                u.toArray(u.getNodes('.ssh_id')).forEach(function(node) {
                    // Reset them all before we apply the 'active' class to just the one
                    node.className = 'halfsectrans ssh_id';
                });
                this.className = 'halfsectrans ssh_id active';
                ssh.displayMetadata(name);
            }
        }
        elem.style.opacity = 0;
        go.Visual.applyTransform(elem, 'translateX(-300%)');
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
                go.Visual.applyTransform(elem, '');
            } catch(e) {
                u.noop(); // Element was removed already.  No biggie.
            }
        }, delay);
        return elem;
    },
    getMaxIDs: function(elem) {
        // Calculates and returns the number of SSH identities that will fit in the given element ID (elem).
        try {
            var go = GateOne,
                ssh = go.SSH,
                u = go.Utils,
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
        // Displays the dialog/form where a user can create or edit an SSH identity.
        var go = GateOne,
            u = go.Utils,
            ssh = go.SSH,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            identityForm = u.createElement('form', {'name': prefix+'ssh_id_form', 'class': 'ssh_id_form'}),
            nameInput = u.createElement('input', {'type': 'text', 'id': 'ssh_new_id_name', 'name': prefix+'ssh_new_id_name', 'placeholder': '<letters, numbers, underscore>', 'tabindex': 1, 'required': 'required', 'pattern': '[A-Za-z0-9_]+'}),
            nameLabel = u.createElement('label'),
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
            passphraseInput = u.createElement('input', {'type': 'password', 'id': 'ssh_new_id_passphrase', 'name': prefix+'ssh_new_id_passphrase', 'placeholder': '<Optional>', 'pattern': '.{4}.+'}), // That pattern means > 4 characters
            verifyPassphraseInput = u.createElement('input', {'type': 'password', 'id': 'ssh_new_id_passphrase_verify', 'name': prefix+'ssh_new_id_passphrase_verify', 'placeholder': '<Optional>', 'pattern': '.{4}.+'}),
            passphraseLabel = u.createElement('label'),
            commentInput = u.createElement('input', {'type': 'text', 'id': 'ssh_new_id_comment', 'name': prefix+'ssh_new_id_comment', 'placeholder': '<Optional>'}),
            commentLabel = u.createElement('label'),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': 'Cancel', 'class': 'button black'}),
            nameValidate = function(e) {
                var nameNode = u.getNode('#'+prefix+'ssh_new_id_name'),
                    text = nameNode.value;
                if (text != text.match(/[A-Za-z0-9_]+/)) {
                    nameNode.setCustomValidity("Valid characters: Numbers, Letters, Underscores");
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
                    verifyNode.setCustomValidity("Error: Must be longer than four characters.");
                } else {
                    verifyNode.setCustomValidity("");
                }
            };
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        nameLabel.innerHTML = "Name";
        nameLabel.htmlFor = prefix+'ssh_new_id_name';
        nameInput.oninput = nameValidate;
        passphraseInput.oninput = passphraseValidate;
        verifyPassphraseInput.oninput = passphraseValidate;
        keytypeLabel.innerHTML = "Keytype";
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
        }
        passphraseLabel.innerHTML = "Passphrase";
        passphraseLabel.htmlFor = prefix+'ssh_new_id_passphrase';
        commentLabel.innerHTML = "Comment";
        commentLabel.htmlFor = prefix+'ssh_new_id_comment';
        identityForm.appendChild(nameLabel);
        identityForm.appendChild(nameInput);
        identityForm.appendChild(keytypeLabel);
        identityForm.appendChild(keytypeSelect);
        identityForm.appendChild(bitsLabel);
        identityForm.appendChild(bitsSelect);
        identityForm.appendChild(passphraseLabel);
        identityForm.appendChild(passphraseInput);
        identityForm.appendChild(verifyPassphraseInput);
        identityForm.appendChild(commentLabel);
        identityForm.appendChild(commentInput);
        identityForm.appendChild(submit);
        identityForm.appendChild(cancel);
        var closeDialog = go.Visual.dialog('New SSH Identity', identityForm);
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
            go.ws.send(JSON.stringify({'ssh_gen_new_keypair': settings}));
            closeDialog();
            ssh.loadIDs();
        }
    },
    uploadIDForm: function() {
        // Displays the dialog/form where a user can upload an SSH identity (that's already been created)
        var go = GateOne,
            u = go.Utils,
            ssh = go.SSH,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            uploadIDForm = u.createElement('form', {'name': prefix+'ssh_upload_id_form', 'class': 'ssh_id_form'}),
            privateKeyFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_privatekey', 'name': prefix+'ssh_upload_id_privatekey', 'required': 'required'}),
            privateKeyFileLabel = u.createElement('label'),
            publicKeyFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_publickey', 'name': prefix+'ssh_upload_id_publickey'}),
            publicKeyFileLabel = u.createElement('label'),
            certificateFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_cert', 'name': prefix+'ssh_upload_id_cert'}),
            certificateFileLabel = u.createElement('label'),
            note = u.createElement('p', {'style': {'font-size': '80%', 'margin-top': '1em', 'margin-bottom': '1em'}}),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': 'Cancel', 'class': 'button black'});
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        note.innerHTML = "<b>NOTE:</b> If a public key is not provided one will be automatically generated using the private key.  You may be asked for the passphrase to perform this operation.";
        privateKeyFileLabel.innerHTML = "Private Key";
        privateKeyFileLabel.htmlFor = prefix+'ssh_upload_id_privatekey';
        publicKeyFileLabel.innerHTML = "Optional: Public Key";
        publicKeyFileLabel.htmlFor = prefix+'ssh_upload_id_publickey';
        certificateFileLabel.innerHTML = "Optional: Certificate";
        certificateFileLabel.htmlFor = prefix+'ssh_upload_id_cert';
        uploadIDForm.appendChild(privateKeyFileLabel);
        uploadIDForm.appendChild(privateKeyFile);
        uploadIDForm.appendChild(publicKeyFileLabel);
        uploadIDForm.appendChild(publicKeyFile);
        uploadIDForm.appendChild(certificateFileLabel);
        uploadIDForm.appendChild(certificateFile);
        uploadIDForm.appendChild(note);
        uploadIDForm.appendChild(submit);
        uploadIDForm.appendChild(cancel);
        var closeDialog = go.Visual.dialog('Upload SSH Identity', uploadIDForm);
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
                    go.ws.send(JSON.stringify({'ssh_store_id_file': settings}));
                },
                publicKeyReader = new FileReader(),
                sendPublicKey = function(evt) {
                    var data = evt.target.result,
                        fileName = null;
                    if (privFile.fileName) {
                        fileName = privFile.fileName;
                    } else {
                        fileName = privFile.name;
                    }
                    var settings = {
                        'name': fileName,
                        'public': data,
                    };
                    go.ws.send(JSON.stringify({'ssh_store_id_file': settings}));
                },
                certificateReader = new FileReader(),
                sendCertificate = function(evt) {
                    var data = evt.target.result,
                        fileName = null;
                    if (privFile.fileName) {
                        fileName = privFile.fileName;
                    } else {
                        fileName = privFile.name;
                    }
                    var settings = {
                        'name': fileName,
                        'certificate': data,
                    };
                    go.ws.send(JSON.stringify({'ssh_store_id_file': settings}));
                };
            // Get the data out of the files
            privateKeyReader.onload = sendPrivateKey;
            privateKeyReader.readAsText(privFile);
            publicKeyReader.onload = sendPublicKey;
            publicKeyReader.readAsText(pubFile);
            certificateReader.onload = sendCertificate;
            certificateReader.readAsText(certFile);
            closeDialog();
        }
    },
    uploadCertificateForm: function(identity) {
        // Displays the dialog/form where a user can add or replace a certificate associated with their identity
        // *identity* should be the name of the identity associated with this certificate
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            uploadCertForm = u.createElement('form', {'name': prefix+'ssh_upload_cert_form', 'class': 'ssh_id_form'}),
            certificateFile = u.createElement('input', {'type': 'file', 'id': 'ssh_upload_id_cert', 'name': prefix+'ssh_upload_id_cert'}),
            certificateFileLabel = u.createElement('label'),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': 'Cancel', 'class': 'button black'});
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        certificateFileLabel.innerHTML = "Optional Certificate";
        certificateFileLabel.htmlFor = prefix+'ssh_upload_id_cert';
        uploadCertForm.appendChild(certificateFileLabel);
        uploadCertForm.appendChild(certificateFile);
        uploadCertForm.appendChild(submit);
        uploadCertForm.appendChild(cancel);
        var closeDialog = go.Visual.dialog('Upload X.509 Certificate', uploadCertForm);
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
                    go.ws.send(JSON.stringify({'ssh_store_id_file': settings}));
                };
            // Get the data out of the files
            certificateReader.onload = sendCertificate;
            certificateReader.readAsText(certFile);
            closeDialog();
        }
    },
    enterPassphraseAction: function(settings) {
        // Displays the dialog/form where a user can enter a passphrase for a given identity (called by the server if something requires it)
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            sshIDPanel = u.getNode('#'+prefix+'panel_ssh_ids'),
            passphraseForm = u.createElement('form', {'name': prefix+'ssh_passphrase_form', 'class': 'ssh_id_form'}),
            passphrase = u.createElement('input', {'type': 'password', 'id': 'ssh_passphrase', 'name': prefix+'ssh_passphrase'}),
            passphraseLabel = u.createElement('label'),
            explanation = u.createElement('p', {'style': {'margin-top': '0.5em'}}),
            safetyNote = u.createElement('p', {'style': {'font-size': '80%'}}),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': 'Cancel', 'class': 'button black'});
        submit.innerHTML = "Submit";
        cancel.innerHTML = "Cancel";
        passphrase.autofocus = "autofocus";
        explanation.innerHTML = "The private key for this SSH identity is protected by a passphrase.  Please enter the passphrase so a public key can be generated.";
        safetyNote.innerHTML = "<b>NOTE:</b> This passphrase will only be used to extract the public key and will not be stored.";
        passphraseLabel.innerHTML = "Passphrase";
        passphraseLabel.htmlFor = prefix+'ssh_passphrase';
        passphraseForm.appendChild(explanation);
        passphraseForm.appendChild(passphraseLabel);
        passphraseForm.appendChild(passphrase);
        passphraseForm.appendChild(safetyNote);
        passphraseForm.appendChild(submit);
        passphraseForm.appendChild(cancel);
        if (settings['bad']) {
            delete settings['bad'];
            explanation.innerHTML = "<span style='color: red;'>Invalid passphrase.</span>  Please try again.";
        }
        var closeDialog = go.Visual.dialog('Passphrase for "' + settings['name'] + '"', passphraseForm);
        cancel.onclick = closeDialog;
        passphraseForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            settings['passphrase'] = passphrase.value;
            go.ws.send(JSON.stringify({'ssh_store_id_file': settings}));
            closeDialog();
        }
    },
    getConnectString: function(term) {
        // Asks the SSH plugin on the Gate One server what the SSH connection string is for the given *term*.
        GateOne.ws.send(JSON.stringify({'ssh_get_connect_string': term}));
    },
    deleteCompleteAction: function(message) {
        // Called when an identity is deleted
        GateOne.SSH.loadIDs();
    },
    handleConnect: function(connectString) {
        // Handles the 'sshjs_connect' action which should provide an SSH *connectString* in the form of user@host:port
        // The *connectString* will be stored in GateOne.terminals[term]['sshConnectString'] which is meant to be used in duplicating terminals (because you can't rely on the title).
        // Also requests the host's public certificate to have it displayed to the user.
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
//             go.Visual.setTitleAction({'term': term, 'title': dict[term]});
        }
    },
    keygenComplete: function(message) {
        // Called when we receive a message from the server indicating a keypair was generated successfully
        var go = GateOne,
            ssh = go.SSH,
            v = go.Visual;
        if (message['result'] == 'Success') {
            v.displayMessage('Keypair generation complete.');
        } else {
            v.displayMessage(message['result']);
        }
        ssh.loadIDs();
    },
    saveComplete: function(message) {
        // Called when we receive a message from the server indicating the uploaded identity was saved
        var go = GateOne,
            ssh = go.SSH,
            v = go.Visual;
        if (message['result'] == 'Success') {
            v.displayMessage('Identity saved successfully.');
        } else {
            v.displayMessage(message['result']);
        }
        ssh.loadIDs();
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
            sshPanel = u.createElement('div', {'id': 'panel_known_hosts', 'class': 'panel sectrans'}),
            sshHeader = u.createElement('div', {'id': 'ssh_header', 'class': 'sectrans'}),
            sshHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            sshKHTextArea = u.createElement('textarea', {'id': 'ssh_kh_textarea', 'rows': 30, 'cols': 100}),
            save = u.createElement('button', {'id': 'ssh_save', 'class': 'button black', 'type': 'submit'}),
            cancel = u.createElement('button', {'id': 'ssh_cancel', 'class': 'button black'}),
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
            v.displayMessage('Fingerprint of <i>' + message['host'] + '</i>: ' + colorized);
        }
    },
    commandCompleted: function(message) {
        // Uses the contents of *message* to report the results of the command executed via execRemoteCmd()
        // Message should be something like:  {'term': 1, 'cmd': 'uptime', 'output': ' 20:45:27 up 13 days,  3:44,  9 users,  load average: 1.21, 0.79, 0.57', 'result', 'Success'}
        // If result is anything other than 'Success' the error will be displayed to the user.
        // If a callback was registered in GateOne.SSH.remoteCmdCallbacks[term] it will be called like so:  callback(message['output']).  Otherwise the output will just be displayed to the user.
        // After the callback has executed it will be removed from GateOne.SSH.remoteCmdCallbacks.
        var go = GateOne,
            term = message['term'],
            cmd = message['cmd'],
            output = message['output'],
            result = message['result'];
        if (result != 'Success') {
            go.Visual.displayMessage("Error executing background command on terminal " + term + ": " + result);
            if (go.SSH.remoteCmdErrorbacks[term][cmd]) {
                go.SSH.remoteCmdErrorbacks[term][cmd](result);
                delete go.SSH.remoteCmdErrorbacks[term][cmd];
            }
            return;
        }
        if (go.SSH.remoteCmdCallbacks[term][cmd]) {
            go.SSH.remoteCmdCallbacks[term][cmd](output);
            delete go.SSH.remoteCmdCallbacks[term][cmd];
        } else {
            go.Visual.displayMessage("Remote command output from terminal " + term + ": " + output);
        }
    },
    execRemoteCmd: function(term, command, callback, errorback) {
        // Executes *command* by creating a secondary shell in the background using the multiplexed tunnel of *term* (works just like duplicateSession()).
        // Calls *callback* when the result of *command* comes back.
        // *errorback* will be called if there's an error executing the command.
        var go = GateOne,
            ssh = go.SSH;
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
        go.ws.send(JSON.stringify({'ssh_execute_command': {'term': term, 'cmd': command}}));
    }
});

})(window);