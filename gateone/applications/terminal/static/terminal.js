
// TODO: Make it so you can call 'new Terminal()' or something like that to get a singular object to control terminals.

// GateOne.Terminal gets its own sandbox to avoid a constant barrage of circular references on the garbage collector
GateOne.Base.superSandbox("GateOne.Terminal", ["GateOne.Visual", "GateOne.User.__initialized__", "GateOne.Input", "GateOne.Storage"], function(window, undefined) {
"use strict";

// Sandbox-wide shortcuts
var go = GateOne,
    prefix = go.prefs.prefix,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    I = go.Input,
    S = go.Storage,
    t, // Will be GateOne.Terminal (set below via the GateOne.Base.module() method)
    gettext = GateOne.i18n.gettext,
    urlObj = (window.URL || window.webkitURL),
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug,
    // Firefox doesn't support 'mousewheel'
    mousewheelevt = (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel";

// Icons used in this application:
go.Icons.terminal = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="15.938" width="18" viewBox="0 0 18 18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient10820" x1="567.96" gradientUnits="userSpaceOnUse" y1="674.11" gradientTransform="matrix(0.21199852,0,0,0.19338189,198.64165,418.2867)" x2="567.96" y2="756.67"><stop class="✈stop1" offset="0"/><stop class="✈stop2" offset="0.4944"/><stop class="✈stop3" offset="0.5"/><stop class="✈stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="translate(-310.03125,-548.65625)"><path fill="url(#linearGradient10820)" d="m310.03,548.66,0,13.5,6.4062,0-0.40625,2.4375,5.6562-0.0312-0.46875-2.4062,6.8125,0,0-13.5-18,0zm1.25,1.125,15.531,0,0,11.219-15.531,0,0-11.219z"/></g><g style="letter-spacing:0px;text-anchor:middle;word-spacing:0px;text-align:center;" line-height="125%" font-weight="normal" font-size="17.85666656px" transform="scale(1.0177209,0.98258768)" font-stretch="normal" font-variant="normal" font-style="normal" font-family="DejaVu Sans" class="✈svg"><path d="m4.3602,8.4883,0,0.75202-0.44794,0,0-0.72259c-0.49699,3E-7-0.8948-0.076292-1.1934-0.22888v-0.56238c0.42723,0.20054,0.82504,0.30081,1.1934,0.30081v-1.419c-0.4207-0.1394-0.7161-0.2975-0.8861-0.474-0.1679-0.1788-0.2518-0.4185-0.2518-0.7194,0-0.2855,0.1003-0.522,0.3008-0.7095,0.2006-0.1874,0.4796-0.303,0.8371-0.3466v-0.58854h0.44794v0.57546c0.40761,0.019622,0.77381,0.10463,1.0986,0.25503l-0.2158,0.4741c-0.3052-0.1351-0.5994-0.2136-0.8828-0.2354v1.3798c0.4338,0.1482,0.7379,0.3106,0.9122,0.4872,0.1766,0.1743,0.2649,0.4032,0.2649,0.6866,0,0.6103-0.3924,0.9754-1.1771,1.0953m-0.4479-2.4293v-1.2065c-0.37492,0.063217-0.56238,0.25286-0.56238,0.56892-0.0000012,0.17003,0.043594,0.3019,0.13079,0.39563,0.089369,0.093733,0.23323,0.17438,0.43159,0.24195m0.44794,0.71605,0,1.2196c0.4011-0.061,0.6016-0.2616,0.6016-0.6016,0-0.2768-0.2005-0.4828-0.6016-0.618"/></g><g style="letter-spacing:0px;text-anchor:middle;word-spacing:0px;text-align:center;" line-height="125%" font-weight="normal" font-size="6.54116535px" transform="scale(0.84851886,1.1785242)" font-stretch="normal" font-variant="normal" font-style="normal" font-family="Droid Sans Mono" class="✈svg"><path style="" d="m12.145,7.6556-4.0212,0,0-0.44715,4.0212,0,0,0.44715"/></g></svg>';

// Setup some defaults for our terminal-specific prefs
go.prefs.webWorker = go.prefs.webWorker || null; // This is the fallback path to the Terminal's screen processing Web Worker (term_ww.js).  You should only ever have to change this when embedding and your Gate One server is listening on a different port than your app's web server.  In such situations you'd want to copy term_ww.js to some location on your server and set this variable to that path (e.g. 'https://your-app.company.com/static/term_ww.js').
go.prefs.rows = go.prefs.rows || null; // Override the automatically calculated value (null means fill the window)
go.prefs.columns = go.prefs.columns || null; // Ditto
go.prefs.highlightSelection = go.prefs.highlightSelection || true; // If false selecting text will not result in other occurences of that text being highlighted
go.prefs.audibleBell = go.prefs.audibleBell || true; // If false, the bell sound will not be played (visual notification will still occur),
go.prefs.bellSound = go.prefs.bellSound || ''; // Stores the bell sound data::URI (cached).
go.prefs.bellSoundType = go.prefs.bellSoundType || ''; // Stores the mimetype of the bell sound.
go.prefs.terminalFont = go.prefs.terminalFont || 'Ubuntu Mono'; // The font-family to use inside of terminals (e.g. 'monospace', 'Ubuntu Mono', etc)
go.prefs.terminalFontSize = go.prefs.terminalFontSize || '90%'; // The font-size to use inside of terminals (e.g. '90%', '0.9em', '12pt', etc)
go.prefs.colors = go.prefs.colors || 'default'; // The color scheme to use (e.g. 'default', 'gnome-terminal', etc)
go.prefs.disableTermTransitions = go.prefs.disableTermTransitions || false; // Disabled the sliding animation on terminals to make switching faster
go.prefs.rowAdjust = go.prefs.rowAdjust || 0;   // When the terminal rows are calculated they will be decreased by this amount (e.g. to make room for the playback controls).
// rowAdjust is necessary so that plugins can increment it if they're adding things to the top or bottom of GateOne.
go.prefs.colAdjust = go.prefs.colAdjust || 0;  // Just like rowAdjust but it controls how many columns are removed from the calculated terminal dimensions before they're sent to the server.
if(isNaN(go.prefs.scrollback)) {
    go.prefs.scrollback = 500;
}
// This ensures that the webWorker setting isn't stored in the user's prefs in localStorage:
go.noSavePrefs.webWorker = null;
go.noSavePrefs.rowAdjust = null;
go.noSavePrefs.colAdjust = null;

t = go.Base.module(GateOne, "Terminal", "1.2", ['Base', 'Utils', 'Visual']);
t.terminals = { // For keeping track of running terminals
    count: function() { // A useful function (terminals can be differentiated because they'll always be integers)
        // Returns the number of open terminals
        var counter = 0, term;
        for (term in t.terminals) {
            if (term % 1 === 0) {
                counter += 1;
            }
        }
        return counter;
    }
};
// These two variables are semi-constants that are used in determining the size of terminals.  They make room for...
t.colAdjust = 4; // The scrollbar (4 chars of width is usually enough)
t.rowAdjust = 0; // The row that gets cut off at the top of the terminal by the browser (when doing our row/columns calculation)
// All updateTermCallbacks are executed whenever a terminal is updated like so: callback(<term number>)
// Plugins can register updateTermCallbacks by simply doing a push():  GateOne.Terminal.updateTermCallbacks.push(myFunc);
t.updateTermCallbacks = []; // DEPRECATED
// All defined newTermCallbacks are executed whenever a new terminal is created like so: callback(<term number>)
t.newTermCallbacks = []; // DEPRECATED
// All defined closeTermCallbacks are executed whenever a terminal is closed just like newTermCallbacks:  callback(<term number>)
t.closeTermCallbacks = []; // DEPRECATED
// All defined reattachTerminalsCallbacks are executed whenever the reattachTerminalsAction is called.  It is important to register a callback here when in embedded mode (if you want to place terminals in a specific location).
t.reattachTerminalsCallbacks = []; // DEPRECATED
t.scrollbackToggle = false;
t.textTransforms = {}; // Can be used to transform text (e.g. into clickable links).  Use registerTextTransform() to add new ones.
t.lastTermNumber = 0; // Starts at 0 since newTerminal() increments it by 1
t.manualTitle = false; // If a user overrides the title this variable will be used to keep track of that so setTitleAction won't overwrite it
t.scrollbarWidth = null; // Used to keep track of the scrollbar width so we can adjust the toolbar appropriately.  It is saved here since we have to measure the inside of a terminal to get this value reliably.
t.dbVersion = 1; // NOTE: Must be an integer (no floats!)
t.terminalDBModel = {
    'scrollback': {keyPath: 'term'} // Just storing the scrollback buffer for now
};
t.outputSuspended = gettext("Terminal output has been suspended (Ctrl-S). Type Ctrl-Q to resume.");
t.warnedAboutVoiceExt = false; // Tracks whether we've already warned the user about the presence of a problem extension.
t.sharedTerminals = {}; // Just a placeholder; gets replaced by the server after something gets shared for the first time
go.Base.update(GateOne.Terminal, {
    __appinfo__: {
        'name': 'Terminal',
        'module': 'GateOne.Terminal',
        'icon': function(settings) {
            if (settings['icon']) {
                return settings['icon'];
            } else {
                return go.Icons.terminal;
            }
        },
        'relocatable': true
    },
    __new__: function(settings, /*opt*/where) {
        /**:GateOne.Terminal.__new__(settings[, where])

        Called when a user clicks on the Terminal Application in the New Workspace Workspace (or anything that happens to call __new__()).

        :settings: An object containing the settings that will control how the new terminal is created.  Typically contains the application's 'info' data from the server.
        :where: An optional querySelector-like string or DOM node where the new Terminal should be placed.  If not given a new workspace will be created to contain the Terminal.
        */
        logDebug("GateOne.Terminal.__new__(" + JSON.stringify(settings) + ")");
        var term, voiceExtDetected,
            // NOTE: Most of these will always be empty/undefined/null except in special embedded situations
            termSettings = {
                'metadata': settings.metadata || {},
                'command': settings['command'] || settings['sub_application'] || null
            };
        if (settings['encoding']) {
            encoding = settings['encoding'];
        }
        where = where || go.Visual.newWorkspace();
        if (go.ws.readyState == 1) { // Only open a new terminal if we're connected
            if (!go.Terminal.warnedAboutVoiceExt) {
                if (GateOne.Terminal.hasVoiceExt()) {
                    v.alert(gettext("WARNING: Problematic Browser Extension Detected"),
                            "<p><b>"+gettext("Warning:")+"</b>"+gettext(" An extension was detected that can result in a severe negative impact on terminal performance (Google Voice). The extension is modifying the web page every time there's a screen update (what it thinks are phone numbers are being converted into clickable links).  Please disable the 'Clickable Links' feature of the extension, turn it off for this web site (if possible), or disable it entirely.")+"</p>");
                }
                go.Terminal.warnedAboutVoiceExt = true;
            }
            term = go.Terminal.newTerminal(null, termSettings, where);
        } else {
            v.closeWorkspace(workspace);
            v.displayMessage(gettex("Please wait until Gate One is reconnected."));
            v.appChooser();
        }
    },
    init: function() {
        logDebug("Terminal.init()");
        var t = go.Terminal,
            term = localStorage[prefix+'selectedTerminal'],
            div = u.createElement('div', {'id': 'info_actions', 'style': {'padding-bottom': '0.4em'}}),
            tableDiv = u.createElement('div', {'class': '✈paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            tableDiv2 = u.createElement('div', {'class': '✈paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            infoPanel = u.createElement('div', {'id': 'panel_info', 'class': '✈panel'}),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': '✈panel_close_icon', 'title': gettext("Close This Panel")}),
            infoPanelRow1 = u.createElement('div', {'class': '✈paneltablerow', 'id': 'panel_inforow1'}),
            infoPanelRow2 = u.createElement('div', {'class': '✈paneltablerow', 'id': 'panel_inforow2'}),
            infoPanelRow3 = u.createElement('div', {'class': '✈paneltablerow', 'id': 'panel_inforow3'}),
            infoPanelRow4 = u.createElement('div', {'class': '✈paneltablerow', 'id': 'panel_inforow4'}),
            infoPanelRow5 = u.createElement('div', {'class': '✈paneltablerow', 'id': 'panel_inforow5'}),
            infoPanelRow6 = u.createElement('div', {'class': '✈paneltablerow', 'id': 'panel_inforow6'}),
            infoPanelRow7 = u.createElement('div', {'class': '✈paneltablerow', 'id': 'panel_inforow7'}),
            infoPanelH2 = u.createElement('h2', {'id': 'termtitle'}),
            infoPanelTimeLabel = u.createElement('span', {'id': 'term_time_label', 'style': {'display': 'table-cell'}}),
            infoPanelTime = u.createElement('span', {'id': 'term_time', 'style': {'display': 'table-cell'}}),
            infoPanelRowsLabel = u.createElement('span', {'id': 'rows_label', 'style': {'display': 'table-cell'}}),
            infoPanelRows = u.createElement('span', {'id': 'rows', 'style': {'display': 'table-cell'}}),
            infoPanelColsLabel = u.createElement('span', {'id': 'cols_label', 'style': {'display': 'table-cell'}}),
            infoPanelCols = u.createElement('span', {'id': 'columns', 'style': {'display': 'table-cell'}}),
            infoPanelBackspaceLabel = u.createElement('span', {'id': 'backspace_label', 'style': {'display': 'table-cell'}}),
            infoPanelBackspace = u.createElement('span', {'id': 'backspace', 'style': {'display': 'table-cell'}}),
            infoPanelBackspaceCheckH = u.createElement('input', {'type': 'radio', 'id': 'backspace_h', 'name': 'backspace', 'value': '^H', 'style': {'display': 'table-cell'}}),
            infoPanelBackspaceCheckQ = u.createElement('input', {'type': 'radio', 'id': 'backspace_q', 'name': 'backspace', 'value': '^?', 'style': {'display': 'table-cell'}}),
            infoPanelEncodingLabel = u.createElement('span', {'id': 'encoding_label', 'style': {'display': 'table-cell'}}),
            infoPanelEncoding = u.createElement('input', {'type': 'text', 'id': 'encoding', 'name': 'encoding', 'value': 'utf-8', 'style': {'display': 'table-cell'}}),
            infoPanelKeyboardLabel = u.createElement('span', {'id': 'keyboard_label', 'class':'✈paneltablelabel'}),
            infoPanelKeyboard = u.createElement('select', {'id': 'keyboard', 'name':'keyboard', 'style': {'display': 'table-cell'}}),
            infoPanelSaveRecording = u.createElement('button', {'id': 'saverecording', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            infoPanelMonitorActivity = u.createElement('input', {'id': 'monitor_activity', 'type': 'checkbox', 'name': 'monitor_activity', 'value': 'monitor_activity', 'style': {'margin-right': '0.5em'}}),
            infoPanelMonitorActivityLabel = u.createElement('span'),
            infoPanelMonitorInactivity = u.createElement('input', {'id': 'monitor_inactivity', 'type': 'checkbox', 'name': 'monitor_inactivity', 'value': 'monitor_inactivity', 'style': {'margin-right': '0.5em'}}),
            infoPanelMonitorInactivityLabel = u.createElement('span'),
            infoPanelInactivityInterval = u.createElement('input', {'id': 'inactivity_interval', 'type': 'number', 'step': 'any', 'name': prefix+'inactivity_interval', 'size': 3, 'value': 10, 'style': {'margin-right': '0.5em', 'text-align': 'right', 'width': '4em'}}),
            infoPanelInactivityIntervalLabel = u.createElement('span'),
            goDiv = u.getNode(go.prefs.goDiv),
            termSharingButton = u.createElement('button', {'id': 'term_sharing', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black ✈tooltip'}),
            resetTermButton = u.createElement('button', {'id': 'reset_terminal', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black ✈tooltip'}),
            cmdQueryString = u.getQueryVariable('terminal_cmd'),
            switchTerm = function() {
                if (localStorage[prefix+'selectedTerminal']) {
                    go.Terminal.switchTerminal(localStorage[prefix+'selectedTerminal']);
                }
            },
            updatePrefsfunc = function(panelNode) {
                if (panelNode.id == prefix+'panel_prefs') {
                    go.ws.send(JSON.stringify({'terminal:enumerate_fonts': null}));
                    go.ws.send(JSON.stringify({'terminal:enumerate_colors': null}));
                }
            },
            transitionEndFunc = function(wsNode) { // Called after workspaces are switched
                if (go.User.activeApplication == "Terminal") {
                    go.Terminal.alignTerminal();
                } else {
                    go.Terminal.Input.disableCapture(null, true); // Force capture off
                }
            };
        if (cmdQueryString) {
            go.Terminal.defaultCommand = cmdQueryString;
        }
        // Create our Terminal panel
        infoPanelH2.innerHTML = "Gate One";
        infoPanelH2.title = gettext("Click to edit.  Leave blank for default.");
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            v.togglePanel('#'+prefix+'panel_info'); // Scale away, scale away, scale away.
        }
        infoPanelTimeLabel.innerHTML = "<b>"+gettext("Connected Since:")+"</b> ";
        infoPanelRowsLabel.innerHTML = "<b>"+gettext("Rows:")+"</b> ";
        infoPanelRows.innerHTML = go.prefs.rows; // Will be replaced
        infoPanelColsLabel.innerHTML = "<b>"+gettext("Columns:")+"</b> ";
        infoPanelCols.innerHTML = go.prefs.columns; // Will be replaced
        infoPanelBackspaceLabel.innerHTML = "<b>"+gettext("Backspace Key:")+"</b> ";
        infoPanelBackspaceCheckQ.checked = true;
        infoPanelBackspaceCheckQ.onclick = function(e) {
            var term = localStorage[prefix+'selectedTerminal'];
            go.Terminal.terminals[term]['backspace'] = String.fromCharCode(127);
        }
        infoPanelBackspaceCheckH.onclick = function(e) {
            var term = localStorage[prefix+'selectedTerminal'];
            go.Terminal.terminals[term]['backspace'] = String.fromCharCode(8);
        }
        infoPanelBackspace.appendChild(infoPanelBackspaceCheckH);
        infoPanelBackspace.appendChild(infoPanelBackspaceCheckQ);
        infoPanelEncodingLabel.innerHTML = "<b>"+gettext("Encoding:")+"</b> ";
        infoPanelEncoding.onblur = function(e) {
            // When the user is done editing their encoding make the change immediately
            var term = localStorage[prefix+'selectedTerminal'];
            go.Terminal.terminals[term]['encoding'] = this.value;
            go.ws.send(JSON.stringify({'terminal:set_encoding': {'term': term, 'encoding': this.value}}));
        }
        infoPanelKeyboardLabel.innerHTML = "<b>"+gettext("Keyboard Mode")+"</b>";
        // TODO: Move these keyboard modes to a global somewhere so we can stay better organized.
        infoPanelKeyboard.add(new Option("default", "default"), null);
        infoPanelKeyboard.add(new Option("xterm", "xterm"), null);
        infoPanelKeyboard.add(new Option("sco", "sco"), null);
        infoPanelKeyboard.onblur = function(e) {
            // When the user is done editing their encoding make the change immediately
            var term = localStorage[prefix+'selectedTerminal'];
            go.Terminal.terminals[term]['keyboard'] = this.value;
            go.ws.send(JSON.stringify({'terminal:set_keyboard_mode': {'term': term, 'mode': this.value}}));
        }
        infoPanel.appendChild(infoPanelH2);
        infoPanel.appendChild(panelClose);
        infoPanel.appendChild(div);
        infoPanel.appendChild(tableDiv);
        infoPanel.appendChild(tableDiv2);
        infoPanelBackspaceCheckQ.insertAdjacentHTML('afterend', "^?");
        infoPanelBackspaceCheckH.insertAdjacentHTML('afterend', "^H");
        infoPanelRow1.appendChild(infoPanelTimeLabel);
        infoPanelRow1.appendChild(infoPanelTime);
        infoPanelRow2.appendChild(infoPanelRowsLabel);
        infoPanelRow2.appendChild(infoPanelRows);
        infoPanelRow3.appendChild(infoPanelColsLabel);
        infoPanelRow3.appendChild(infoPanelCols);
        infoPanelRow4.appendChild(infoPanelBackspaceLabel);
        infoPanelRow4.appendChild(infoPanelBackspace);
        infoPanelRow5.appendChild(infoPanelEncodingLabel);
        infoPanelRow5.appendChild(infoPanelEncoding);
        infoPanelRow6.appendChild(infoPanelKeyboardLabel);
        infoPanelRow6.appendChild(infoPanelKeyboard);
        tableDiv.appendChild(infoPanelRow1);
        tableDiv.appendChild(infoPanelRow2);
        tableDiv.appendChild(infoPanelRow3);
        tableDiv.appendChild(infoPanelRow4);
        tableDiv.appendChild(infoPanelRow5);
        tableDiv.appendChild(infoPanelRow6);
        infoPanelMonitorActivityLabel.innerHTML = gettext("Monitor for Activity")+"<br />";
        infoPanelMonitorInactivityLabel.innerHTML = gettext("Monitor for ");
        infoPanelInactivityIntervalLabel.innerHTML = gettext("Seconds of Inactivity");
        infoPanelInactivityInterval.value = "10";
        infoPanelRow7.appendChild(infoPanelMonitorActivity);
        infoPanelRow7.appendChild(infoPanelMonitorActivityLabel);
        infoPanelRow7.appendChild(infoPanelMonitorInactivity);
        infoPanelRow7.appendChild(infoPanelMonitorInactivityLabel);
        infoPanelRow7.appendChild(infoPanelInactivityInterval);
        infoPanelRow7.appendChild(infoPanelInactivityIntervalLabel);
        tableDiv2.appendChild(infoPanelRow7);
        u.hideElement(infoPanel); // Start out hidden
        v.applyTransform(infoPanel, 'scale(0)');
        goDiv.appendChild(infoPanel); // Doesn't really matter where it goes
        infoPanelMonitorInactivity.onclick = function(e) {
            // Turn on/off inactivity monitoring
            var term = localStorage[prefix+'selectedTerminal'],
                monitorInactivity = u.getNode('#'+prefix+'monitor_inactivity'),
                monitorActivity = u.getNode('#'+prefix+'monitor_activity'),
                termTitle = go.Terminal.terminals[term].title,
                inactivity;
            if (monitorInactivity.checked) {
                inactivity = function() {
                    go.Terminal.notifyInactivity(term + ': ' + termTitle);
                    // Restart the timer
                    go.Terminal.terminals[term].inactivityTimer = setTimeout(inactivity, go.Terminal.terminals[term].inactivityTimeout);
                };
                go.Terminal.terminals[term].inactivityTimeout = parseInt(infoPanelInactivityInterval.value) * 1000 || 10000; // Ten second default
                go.Terminal.terminals[term].inactivityTimer = setTimeout(inactivity, go.Terminal.terminals[term].inactivityTimeout);
                go.Visual.displayMessage(gettext("Now monitoring for inactivity in terminal: ") + term);
                if (go.Terminal.terminals[term].activityNotify) {
                    // Turn off monitoring for activity if we're now going to monitor for inactivity
                    go.Terminal.terminals[term].activityNotify = false;
                    monitorActivity.checked = false;
                }
            } else {
                monitorInactivity.checked = false;
                clearTimeout(go.Terminal.terminals[term].inactivityTimer);
                go.Terminal.terminals[term].inactivityTimer = false;
            }
        }
        infoPanelMonitorActivity.onclick = function() {
            // Turn on/off activity monitoring
            var term = localStorage[prefix+'selectedTerminal'],
                monitorInactivity = u.getNode('#'+prefix+'monitor_inactivity'),
                monitorActivity = u.getNode('#'+prefix+'monitor_activity');
            if (monitorActivity.checked) {
                go.Terminal.terminals[term].activityNotify = true;
                go.Visual.displayMessage(gettext("Now monitoring for activity in terminal: ") + term);
                if (go.Terminal.terminals[term].inactivityTimer) {
                    // Turn off monitoring for activity if we're now going to monitor for inactivity
                    clearTimeout(go.Terminal.terminals[term].inactivityTimer);
                    go.Terminal.terminals[term].inactivityTimer = false;
                    monitorInactivity.checked = false;
                }
            } else {
                monitorActivity.checked = false;
                go.Terminal.terminals[term].activityNotify = false;
            }
        }
        infoPanelInactivityInterval.onblur = function(e) {
            // Update go.Terminal.terminals[term].inactivityTimeout with the this.value
            var term = localStorage[prefix+'selectedTerminal'];
            go.Terminal.terminals[term].inactivityTimeout = parseInt(this.value) * 1000;
        }
        var editTitle =  function(e) {
            var term = localStorage[prefix+'selectedTerminal'],
                title = go.Terminal.terminals[term].title,
                titleEdit = u.createElement('input', {'type': 'text', 'name': 'title', 'value': title, 'id': go.prefs.prefix + 'title_edit'}),
                finishEditing = function(e) {
                    var newTitle = titleEdit.value,
                        termObj = u.getNode('#'+prefix+'term' + term);
                    // Send a message to the server with the new title so it can stay in sync if the user reloads the page or reconnects from a different browser/machine
                    go.ws.send(JSON.stringify({'terminal:manual_title': {'term': term, 'title': newTitle}}));
                    infoPanelH2.innerHTML = newTitle;
                    infoPanelH2.onclick = editTitle;
                    go.Terminal.displayTermInfo(term);
                    go.Terminal.Input.capture();
                };
            go.Terminal.Input.disableCapture();
            titleEdit.onblur = finishEditing;
            titleEdit.onkeypress = function(e) {
                if (go.Input.key(e).code == 13) { // Enter key
                    finishEditing(e);
                }
            }
            this.onclick = null;
            this.innerHTML = "";
            this.appendChild(titleEdit);
            titleEdit.focus();
            titleEdit.select();
        }
        infoPanelH2.onclick = editTitle;
        termSharingButton.innerHTML = gettext("Terminal Sharing");
        termSharingButton.title = gettext("Opens up the terminal sharing control panel for this terminal.");
        termSharingButton.onclick = function() {
            go.Terminal.shareDialog(localStorage[prefix+'selectedTerminal']);
            v.togglePanel('#'+prefix+'panel_info');
        }
        resetTermButton.innerHTML = gettext("Rescue Terminal");
        resetTermButton.title = gettext("Attempts to rescue a hung terminal by performing a terminal reset; the equivalent of executing the 'reset' command.");
        resetTermButton.onclick = function() {
            go.ws.send(JSON.stringify({'terminal:reset_terminal': localStorage[prefix+'selectedTerminal']}));
        }
        div.appendChild(resetTermButton);
        div.appendChild(termSharingButton);
        if (go.prefs.scrollback == 0) {
            go.Terminal.colAdjust = 1; // No scrollbar so we can use the extra space
        }
        // Register our keyboard shortcuts
        if (!go.prefs.embedded) {
            // Pseudo print dialog
            E.on("terminal:keydown:meta-p", function() { GateOne.Terminal.printScreen(); });
            // Helpful message so the user doesn't get confused as to why their terminal stopped working:
            E.on("terminal:keydown:ctrl-s", function() {
                GateOne.Visual.displayMessage(GateOne.Terminal.outputSuspended); GateOne.Input.queue(String.fromCharCode(19)); GateOne.Net.sendChars();
            });
            // Ctrl-Alt-P to open a popup terminal
            E.on("go:keydown:ctrl-alt-p", function() { GateOne.Terminal.popupTerm(null, {"global": false}); });
            E.on("terminal:new_terminal", go.Terminal.showIcons);
            E.on("go:ws_transitionend", transitionEndFunc);
        }
        // Load the bell sound from the cache.  If that fails ask the server to send us the file.
        if (go.prefs.bellSound.length) {
            logDebug("Existing bell sound found");
            go.Terminal.loadBell({'mimetype': go.prefs.bellSoundType, 'data_uri': go.prefs.bellSound});
        } else {
            logDebug("Attempting to download our bell sound...");
            go.ws.send(JSON.stringify({'terminal:get_bell': null}));
        }
        // Load the Web Worker
        if (!go.prefs.webWorker) {
            go.prefs.webWorker = go.prefs.url + 'terminal/static/webworkers/term_ww.js';
        }
        logDebug(gettext("Attempting to download our WebWorker..."));
        go.ws.send(JSON.stringify({'terminal:get_webworker': null}));
        // Get shift-Insert working in a natural way (NOTE: Will only work when Gate One is the active element on the page)
        E.on("terminal:keydown:shift-insert", go.Terminal.paste);
        // Register our actions
        go.Net.addAction('terminal:commands_list', go.Terminal.enumerateCommandsAction);
        go.Net.addAction('terminal:fonts_list', go.Terminal.enumerateFontsAction);
        go.Net.addAction('terminal:colors_list', go.Terminal.enumerateColorsAction);
        go.Net.addAction('terminal:terminals', go.Terminal.reattachTerminalsAction);
        go.Net.addAction('terminal:termupdate', go.Terminal.updateTerminalAction);
        go.Net.addAction('terminal:set_title', go.Terminal.setTitleAction);
        go.Net.addAction('terminal:resize', go.Terminal.resizeAction);
        go.Net.addAction('terminal:term_ended', go.Terminal.closeTerminal);
        go.Net.addAction('terminal:term_exists', go.Terminal.reconnectTerminalAction);
        go.Net.addAction('terminal:term_moved', go.Terminal.moveTerminalAction);
        go.Net.addAction('terminal:term_locations', go.Terminal.locationsAction);
        go.Net.addAction('terminal:set_mode', go.Terminal.setModeAction); // For things like application cursor keys
        go.Net.addAction('terminal:reset_client_terminal', go.Terminal.resetTerminalAction);
        go.Net.addAction('terminal:load_webworker', go.Terminal.loadWebWorkerAction);
        go.Net.addAction('terminal:bell', go.Terminal.bellAction);
        go.Net.addAction('terminal:load_bell', go.Terminal.loadBell);
        go.Net.addAction('terminal:encoding', go.Terminal.termEncodingAction);
        go.Net.addAction('terminal:keyboard_mode', go.Terminal.termKeyboardModeAction);
        go.Net.addAction('terminal:shared_terminals', go.Terminal.sharedTerminalsAction);
        go.Net.addAction('terminal:captured_data', go.Terminal.capturedData);
        go.Terminal.createPrefsPanel();
        E.on("go:panel_toggle:in", updatePrefsfunc);
        E.on("go:restore_defaults", function() {
            go.prefs['colors'] = "default";
            go.prefs['disableTermTransitions'] = false;
            go.prefs.scrollback = 500;
            go.prefs.rows = null;
            go.prefs.columns = null;
            go.prefs['highlightSelection'] = true;
            go.prefs['audibleBell'] = true;
            go.prefs['bellSound'] = '';
            go.prefs['bellSoundType'] = '';
        });
        E.on("terminal:switch_terminal", go.Terminal.switchTerminalEvent);
        E.on("go:switch_workspace", go.Terminal.switchWorkspaceEvent);
        E.on("go:relocate_workspace", go.Terminal.relocateWorkspaceEvent);
        E.on("go:close_workspace", go.Terminal.workspaceClosedEvent);
        E.on("go:swapped_workspaces", go.Terminal.swappedWorkspacesEvent);
        E.on("go:grid_view:open", function() {
            go.Terminal.disableScrollback();
            // Ensure any scaled terminals are un-scaled so there's no overlap:
            v.applyTransform(u.getNodes('.✈terminal_pre'), '');
            u.hideElements('.✈pastearea');
            go.Terminal.Input.disableCapture(null, true);
        });
        E.on("go:grid_view:close", function() {
            go.Terminal.enableScrollback();
            u.showElements('.✈pastearea');
            setTimeout(go.Terminal.alignTerminal, 1000);
            go.Terminal.Input.capture();
        });
        E.on("go:connnection_established", go.Terminal.reconnectEvent);
        go.Terminal.loadFont();
        go.Terminal.loadTextColors();
        E.on("go:css_loaded", function() {
            if (!go.Terminal.loadEventsAttached) {
                // This ensures that whatever effects are applied to a terminal applied when resized too:
                E.on("go:update_dimensions", go.Terminal.onResizeEvent);
                E.on("go:pane_split", function(pane) {
                    go.Terminal.onResizeEvent();
                    go.Terminal.recordPanePositions(pane);
                });
                E.on("go:update_dimensions", switchTerm); // go:update_dimensions gets called many times on page load so we attach this event a bit later in the process.
                if (!go.prefs.broadcastTerminal) {
                    go.Terminal.getOpenTerminals(); // Tells the server to tell us what's already running (if anything)
                    go.ws.send(JSON.stringify({'terminal:enumerate_commands': null}));
                    go.Terminal.listSharedTerminals();
                    if (cmdQueryString) {
                        E.on("terminal:term_reattach", function(termNums, terminals) {
                            if (!termNums.length) {
                                go.Terminal.newTerminal(); // Open up a new terminal right away if the terminal_cmd query string is provided
                            }
                        });
                    }
                }
                go.ws.send(JSON.stringify({'terminal:enumerate_fonts': null}));
                go.ws.send(JSON.stringify({'terminal:enumerate_colors': null}));
                go.Terminal.loadEventsAttached = true;
            }
        });
        E.on("go:set_location", go.Terminal.changeLocation);
        E.on("terminal:resume_popup", function(term, termObj) {
            setTimeout(function() {
                // Popup terminals need a moment so they can finish being drawn
                var options = {};
                if (termObj.metadata) {
                    if (termObj.metadata.where) {
                        options.where = u.getNode('#' + termObj.metadata.where) || u.getNode('.' + termObj.metadata.where);
                    }
                }
                go.Terminal.popupTerm(term, options);
            }, 1150);
        });
        E.on("terminal:term_closed", function(term) {
            // Check if the closed terminal belonged to someone else (shared) and tell the server to detach it if necessary
            logDebug("term_closed: " + term);
        });
        // Open/Create our terminal database
        S.openDB('terminal', go.Terminal.setDBReady, go.Terminal.terminalDBModel, go.Terminal.dbVersion);
        // Cleanup any old-style scrollback buffers that might be hanging around
        for (var key in localStorage) {
            if (key.indexOf(prefix+'scrollback') == 0) { // This is an old-style scrollback buffer
                delete localStorage[key];
            }
        }
    },
    hasVoiceExt: function() {
        /**:GateOne.Terminal.hasVoiceExt()

        This function returns ``true`` if an extension is detected that converts phone numbers into clickable links (e.g. Google Voice).  Such browser extensions can have a *severe* negative performance impact while using terminals (every screen update requires a re-scan of the entire page!).
        */
        var testNode = u.createElement('div', {'class': '✈phonenumbercheck', 'style': {'position': 'absolute', 'top': 0, 'left': 0}}),
            originalHTML = "<span>904-555-1212</span>",
            detected = false;
        v.applyTransform(testNode, 'translateX(-99999px)');
        testNode.innerHTML = originalHTML;
        go.node.appendChild(testNode);
        if (testNode.innerHTML != originalHTML) {
            detected = true;
        }
        u.removeElement(testNode);
        return detected;
    },
    setDBReady: function(db) {
        /**:GateOne.Terminal.dbReady(db)

        Sets ``GateOne.Terminal.dbReady = true`` so that we know when the 'terminal' database is available & ready (indexedDB databases are async).
        */
        go.Terminal.dbReady = true;
    },
    createPrefsPanel: function() {
        /**:GateOne.Terminal.createPrefsPanel()

        Creates the terminal preferences and adds them to the global preferences panel.
        */
        var contentContainer = u.createElement('div'),
            prefsPanelStyleRow1 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow1b = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow2 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow3 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow4 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow5 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelStyleRow6 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelRow1 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelRow2 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelRow4 = u.createElement('div', {'class':'✈paneltablerow'}),
            prefsPanelRow5 = u.createElement('div', {'class':'✈paneltablerow'}),
            tableDiv = u.createElement('div', {'id': 'prefs_tablediv1', 'class':'✈paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            tableDiv2 = u.createElement('div', {'id': 'prefs_tablediv2', 'class':'✈paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            prefsPanelFontLabel = u.createElement('span', {'id': 'prefs_font_label', 'class':'✈paneltablelabel'}),
            prefsPanelFont = u.createElement('select', {'id': 'prefs_font', 'name':'prefs_font', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelFontSizeLabel = u.createElement('span', {'id': 'prefs_font_size_label', 'class':'✈paneltablelabel'}),
            prefsPanelFontSize = u.createElement('input', {'id': 'prefs_font_size', 'name':'prefs_font_size', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelColorsLabel = u.createElement('span', {'id': 'prefs_colors_label', 'class':'✈paneltablelabel'}),
            prefsPanelColors = u.createElement('select', {'id': 'prefs_colors', 'name':'prefs_colors', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelDisableHighlightLabel = u.createElement('span', {'id': 'prefs_disablehighlight_label', 'class':'✈paneltablelabel'}),
            prefsPanelDisableHighlight = u.createElement('input', {'id': 'prefs_disablehighlight', 'name': prefix+'prefs_disablehighlight', 'value': 'disablehighlight', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelDisableAudibleBellLabel = u.createElement('span', {'id': 'prefs_disableaudiblebell_label', 'class':'✈paneltablelabel'}),
            prefsPanelDisableAudibleBell = u.createElement('input', {'id': 'prefs_disableaudiblebell', 'name': prefix+'prefs_disableaudiblebell', 'value': 'disableaudiblebell', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelBellLabel = u.createElement('span', {'id': 'prefs_bell_label', 'class':'✈paneltablelabel'}),
            prefsPanelBell = u.createElement('button', {'id': 'prefs_bell', 'value': 'bell', 'class': '✈button ✈black', 'style': {'display': 'table-cell', 'float': 'right'}}),
            prefsPanelScrollbackLabel = u.createElement('span', {'id': 'prefs_scrollback_label', 'class':'✈paneltablelabel'}),
            prefsPanelScrollback = u.createElement('input', {'id': 'prefs_scrollback', 'name': prefix+'prefs_scrollback', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelRowsLabel = u.createElement('span', {'id': 'prefs_rows_label', 'class':'✈paneltablelabel'}),
            prefsPanelRows = u.createElement('input', {'id': 'prefs_rows', 'name': prefix+'prefs_rows', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            prefsPanelColsLabel = u.createElement('span', {'id': 'prefs_cols_label', 'class':'✈paneltablelabel'}),
            prefsPanelCols = u.createElement('input', {'id': 'prefs_cols', 'name': prefix+'prefs_cols', 'size': 5, 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            colorsList = [],
            savePrefsCallback = function() {
                // Called when the user clicks the "Save" button in the preferences panel; grabs all the terminal-specific values and saves deals with them appropriately
                var colors = u.getNode('#'+prefix+'prefs_colors').value,
                    loadFont, prevValue, terms,
                    font = u.getNode('#'+prefix+'prefs_font').value,
                    fontSize = u.getNode('#'+prefix+'prefs_font_size').value,
                    scrollbackValue = u.getNode('#'+prefix+'prefs_scrollback').value,
                    rowsValue = u.getNode('#'+prefix+'prefs_rows').value,
                    colsValue = u.getNode('#'+prefix+'prefs_cols').value,
                    disableHighlight = u.getNode('#'+prefix+'prefs_disablehighlight').checked,
                    disableAudibleBell = u.getNode('#'+prefix+'prefs_disableaudiblebell').checked;
                // Grab the form values and set them in prefs
                if (font != go.prefs.terminalFont) {
                    go.prefs.terminalFont = font;
                    loadFont = true;
                }
                if (fontSize != go.prefs.terminalFontSize) {
                    go.prefs.terminalFontSize = fontSize;
                    loadFont = true;
                }
                if (loadFont) {
                    go.Terminal.loadFont(font, fontSize); // Load the font right now
                }
                if (colors != go.prefs.colors) {
                    go.Terminal.loadTextColors(colors); // Load the colors right now
                    go.prefs.colors = colors;
                }
                if (scrollbackValue) {
                    prevValue = go.prefs.scrollback;
                    go.prefs.scrollback = parseInt(scrollbackValue);
                    if (prevValue == 0 && prevValue != go.prefs.scrollback) {
                        // Re-enable the scrollback buffer, fix the colAdjust parameter, and turn overflow-y back on in all terminals
                        terms = u.toArray(u.getNodes('.✈terminal'));
                        go.Terminal.colAdjust = 4;
                        terms.forEach(function(termObj) {
                            var term = termObj.id.split('term')[1],
                                termPre = GateOne.Terminal.terminals[term].node;
                            termPre.style['overflow-y'] = 'auto';
                        });
                    }
                }
                if (rowsValue) {
                    go.prefs.rows = parseInt(rowsValue);
                } else {
                    go.prefs.rows = null;
                }
                if (colsValue) {
                    go.prefs.columns = parseInt(colsValue);
                } else {
                    go.prefs.columns = null;
                }
                if (disableHighlight) {
                    go.prefs.highlightSelection = false;
                    go.Terminal.unHighlight(); // In case there's something currently highlighted
                } else {
                    go.prefs.highlightSelection = true;
                }
                if (disableAudibleBell) {
                    go.prefs.audibleBell = false;
                } else {
                    go.prefs.audibleBell = true;
                }
            };
        prefsPanelBell.onclick = function(e) {
            e.preventDefault(); // Just in case
            go.Terminal.uploadBellDialog();
        }
        prefsPanelFontLabel.innerHTML = "<b>"+gettext("Font:")+"</b> ";
        prefsPanelFontSizeLabel.innerHTML = "<b>"+gettext("Font Size:")+"</b> ";
        prefsPanelColorsLabel.innerHTML = "<b>"+gettext("Color Scheme:")+"</b> ";
        prefsPanelDisableHighlightLabel.innerHTML = "<b>"+gettext("Disable Selected Text Highlighting:")+"</b> ";
        prefsPanelDisableAudibleBellLabel.innerHTML = "<b>"+gettext("Disable Bell Sound:")+"</b> ";
        prefsPanelBell.innerHTML = gettext("Configure");
        prefsPanelBellLabel.innerHTML = "<b>"+gettext("Bell Sound:")+"</b> ";
        prefsPanelStyleRow1.appendChild(prefsPanelFontLabel);
        prefsPanelStyleRow1.appendChild(prefsPanelFont);
        prefsPanelStyleRow1b.appendChild(prefsPanelFontSizeLabel);
        prefsPanelStyleRow1b.appendChild(prefsPanelFontSize);
        prefsPanelStyleRow2.appendChild(prefsPanelColorsLabel);
        prefsPanelStyleRow2.appendChild(prefsPanelColors);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableHighlightLabel);
        prefsPanelStyleRow4.appendChild(prefsPanelDisableHighlight);
        prefsPanelStyleRow5.appendChild(prefsPanelDisableAudibleBellLabel);
        prefsPanelStyleRow5.appendChild(prefsPanelDisableAudibleBell);
        prefsPanelStyleRow6.appendChild(prefsPanelBellLabel);
        prefsPanelStyleRow6.appendChild(prefsPanelBell);
        tableDiv.appendChild(prefsPanelStyleRow1);
        tableDiv.appendChild(prefsPanelStyleRow1b);
        tableDiv.appendChild(prefsPanelStyleRow2);
        tableDiv.appendChild(prefsPanelStyleRow4);
        tableDiv.appendChild(prefsPanelStyleRow5);
        tableDiv.appendChild(prefsPanelStyleRow6);
        prefsPanelScrollbackLabel.innerHTML = "<b>"+gettext("Scrollback Buffer Lines:")+"</b> ";
        prefsPanelScrollback.value = go.prefs.scrollback;
        prefsPanelRowsLabel.innerHTML = "<b>"+gettext("Terminal Rows:")+"</b> ";
        prefsPanelRows.value = go.prefs.rows || "";
        prefsPanelColsLabel.innerHTML = "<b>"+gettext("Terminal Columns:")+"</b> ";
        prefsPanelCols.value = go.prefs.columns || "";
        prefsPanelRow1.appendChild(prefsPanelScrollbackLabel);
        prefsPanelRow1.appendChild(prefsPanelScrollback);
        prefsPanelRow4.appendChild(prefsPanelRowsLabel);
        prefsPanelRow4.appendChild(prefsPanelRows);
        prefsPanelRow5.appendChild(prefsPanelColsLabel);
        prefsPanelRow5.appendChild(prefsPanelCols);
        tableDiv2.appendChild(prefsPanelRow1);
        tableDiv2.appendChild(prefsPanelRow2);
        tableDiv2.appendChild(prefsPanelRow4);
        tableDiv2.appendChild(prefsPanelRow5);
        contentContainer.appendChild(tableDiv);
        contentContainer.appendChild(tableDiv2);
        go.User.preference(gettext("Terminal"), contentContainer, savePrefsCallback);
    },
    enumerateCommandsAction: function(messageObj) {
        /**:GateOne.Terminal.enumerateCommandsAction(messageObj)

        Attached to the 'terminal:commands_list' WebSocket action; stores *messageObj['commands']* in `GateOne.Terminal.commandsList`.
        */
        var commandsList = messageObj.commands;
        // Save the fonts list so other things (plugins, embedded situations, etc) can reference it without having to examine the select tag
        go.Terminal.commandsList = commandsList;
    },
    enumerateFontsAction: function(messageObj) {
        /**:GateOne.Terminal.enumerateFontsAction(messageObj)

        Attached to the 'terminal:fonts_list' WebSocket action; updates the preferences panel with the list of fonts stored on the server and stores the list in `GateOne.Terminal.fontsList`.
        */
        var fontsList = messageObj.fonts,
            prefsFontSelect = u.getNode('#'+prefix+'prefs_font'),
            prefsFontSize = u.getNode('#'+prefix+'prefs_font_size'),
            i, count = 1; // Start at 1 since we always add monospace
        // Save the fonts list so other things (plugins, embedded situations, etc) can reference it without having to examine the select tag
        go.Terminal.fontsList = fontsList;
        prefsFontSelect.options.length = 0;
        prefsFontSelect.add(new Option(gettext("monospace (let browser decide)"), "monospace"), null);
        for (i in fontsList) {
            prefsFontSelect.add(new Option(fontsList[i], fontsList[i]), null);
            if (go.prefs.terminalFont == fontsList[i]) {
                prefsFontSelect.selectedIndex = count;
            }
            count += 1;
        }
        // Also apply the user's chosen font size to the input element
        prefsFontSize.value = go.prefs.terminalFontSize;
    },
    enumerateColorsAction: function(messageObj) {
        /**:GateOne.Terminal.enumerateColorsAction(messageObj)

        Attached to the 'terminal:colors_list' WebSocket action; updates the preferences panel with the list of text color schemes stored on the server.
        */
        var colorsList = messageObj.colors,
            prefsColorsSelect = u.getNode('#'+prefix+'prefs_colors'),
            i, count = 0;
        // Save the colors list so other things (plugins, embedded situations, etc) can reference it without having to examine the select tag
        go.Terminal.colorsList = colorsList;
        prefsColorsSelect.options.length = 0;
        for (i in colorsList) {
            prefsColorsSelect.add(new Option(colorsList[i], colorsList[i]), null);
            if (go.prefs.colors == colorsList[i]) {
                prefsColorsSelect.selectedIndex = count;
            }
            count += 1;
        }
    },
    onResizeEvent: function(e) {
        /**:GateOne.Terminal.onResizeEvent()

        Attached to the `go:update_dimensions` event; calls :js:meth:`GateOne.Terminal.sendDimensions` for all terminals to ensure the new dimensions get applied.
        */
        logDebug('GateOne.Terminal.onResizeEvent()');
        var termNum, parentHeight, termPre, shareID;
        for (termNum in go.Terminal.terminals) {
            // Only want terminals which are integers; not the 'count()' function
            if (termNum % 1 === 0) {
                termPre = go.Terminal.terminals[termNum].node;
                for (shareID in go.Terminal.sharedTerminals) {
                    // Check if this terminal belongs to someone else so we can skip telling the server to resize it (only the owner can resize a terminal)
                    if (termNum == go.Terminal.sharedTerminals[shareID].term) {
                        if (go.Terminal.sharedTerminals[shareID].owner != go.User.username) {
                            return; // We're not the owner so nothing to do
                        }
                    }
                }
                if (u.isVisible(termPre)) { // Only if terminal is visible
                    go.Terminal.sendDimensions(termNum);
                    if (go.prefs.scrollback != 0) {
                        parentHeight = termPre.parentNode.clientHeight;
                        if (parentHeight) {
                            termPre.style.height = parentHeight + 'px';
                        }
                    }
                    // Adjust the view so the scrollback buffer stays hidden unless the user scrolls
                    u.scrollToBottom(termPre);
                    // Make sure the terminal is in alignment
                    E.once("terminal:term_updated", function() {
                        go.Terminal.alignTerminal(termNum);
                    });
                }
            }
        }
    },
    reconnectEvent: function() {
        /**:GateOne.Terminal.reconnectEvent()

        Attached to the `go:connnection_established` event; closes all open terminals so that :js:meth:`GateOne.Terminal.reattachTerminalsAction` can do its thing.
        */
        logDebug('reconnectEvent()');
        for (var term in go.Terminal.terminals) {
            // Only want terminals which are integers; not the 'count()' function
            if (term % 1 === 0) {
                // The "true, '', false" below tells closeTerminal() to leave the localStorage alone, don't display a close message, and don't tell the server to kill it.
                go.Terminal.closeTerminal(term, true, "", false);
            }
        }
    },
    connectionError: function() {
        /**:GateOne.Terminal.connectionError()

        This function gets attached to the "go:connection_error" event; closes all open terminals.
        */
//         var terms = u.toArray(u.getNodes('.✈terminal'));
//         terms.forEach(function(termObj) {
//             // Passing 'true' here to keep the stuff in localStorage for this term.
//             go.Terminal.closeTerminal(termObj.id.split('term')[1], true);
//         });
    },
    getOpenTerminals: function() {
        /**:GateOne.Terminal.getOpenTerminals()

        Requests a list of open terminals on the server via the 'terminal:get_terminals' WebSocket action.  The server will respond with a 'terminal:terminals' WebSocket action message which calls :js:meth:`GateOne.Terminal.reattachTerminalsAction`.
        */
        logDebug('getOpenTerminals()');
        go.ws.send(JSON.stringify({'terminal:get_terminals': null}));
    },
    sendString: function(chars, /*opt*/term) {
        /**:GateOne.Terminal.sendString(chars[, term])

        Like sendChars() but for programmatic use.  *chars* will be sent to *term* on the server.

        If *term* is not given the currently-selected terminal will be used.
        */
        logDebug('sendString(): ' + chars);
        var term = term || localStorage[go.prefs.prefix+'selectedTerminal'],
            message = {'chars': chars, 'term': term};
        go.ws.send(JSON.stringify({'terminal:write_chars': message}));
    },
    killTerminal: function(term) {
        /**:GateOne.Terminal.killTerminal(term)

        Tells the server got close the given *term* and kill the underlying process.
        */
        go.ws.send(JSON.stringify({'terminal:kill_terminal': term}));
    },
    refresh: function(term) {
        /**:GateOne.Terminal.refresh(term)

        Tells the Gate One server to send a screen refresh (using the diff method).

        .. note:: This function is only here for debugging purposes.  Under normal circumstances difference-based screen refreshes are initiated at the server.
        */
        go.ws.send(JSON.stringify({'terminal:refresh': term}));
    },
    fullRefresh: function(term) {
        /**:GateOne.Terminal.fullRefresh(term)

        Tells the Gate One server to send a full screen refresh to the client for the given *term*.
        */
        go.ws.send(JSON.stringify({'terminal:full_refresh': term}));
    },
    loadFont: function(font, /*opt*/size) {
        /**:GateOne.Terminal.loadFont(font[, size])

        Tells the server to perform a sync of the given *font* with the client.  If *font* is not given, will load the font set in :js:attr:`GateOne.prefs.font`.

        Optionally, a *size* may be chosen.  It must be a valid CSS 'font-size' value such as '0.9em', '90%', '12pt', etc.
        */
        logDebug('loadFont(' + font + ", " + size + ")");
        font = font || go.prefs.terminalFont;
        var settings = {'font_family': font};
        if (size) {settings['font_size'] = size}
        go.ws.send(JSON.stringify({'terminal:get_font': settings}));
    },
    loadTextColors: function(colors) {
        /**:GateOne.Terminal.loadTextColors(colors)

        Tells the server to perform a sync of the given *colors* (terminal text colors) with the client.  If *colors* is not given, will load the colors set in :js:attr:`GateOne.prefs.colors`.
        */
        logDebug('loadTextColors(' + colors + ")");
        colors = colors || go.prefs.colors;
        go.ws.send(JSON.stringify({'terminal:get_colors': {'colors': colors}}));
    },
    displayTermInfo: function(term) {
        /**:GateOne.Terminal.displayTermInfo(term)

        Displays the given term's information as a psuedo tooltip that eventually fades away.
        */
        var termObj = u.getNode('#'+prefix+'term' + term);
        if (!termObj) {
            return;
        }
        var displayText = termObj.id.split('term')[1] + ": " + go.Terminal.terminals[term].title,
            termInfoDiv = u.createElement('div', {'id': 'terminfo', 'class': '✈terminfo'}),
            marginFix = Math.round(go.Terminal.terminals[term].title.length/2),
            infoContainer = u.createElement('div', {'id': 'infocontainer', 'class': '✈term_infocontainer ✈halfsectrans'});
        termInfoDiv.innerHTML = displayText;
        if (u.getNode('#'+prefix+'infocontainer')) { u.removeElement('#'+prefix+'infocontainer'); }
        infoContainer.appendChild(termInfoDiv);
        infoContainer.addEventListener('mousemove', function(e) {
            clearTimeout(v.infoTimer);
            u.removeElement(infoContainer);
            go.Terminal.Input.capture();
        }, false);
        go.node.appendChild(infoContainer);
        if (v.infoTimer) {
            clearTimeout(v.infoTimer);
            v.infoTimer = null;
        }
        v.infoTimer = setTimeout(function() {
            if (!go.prefs.disableTransitions) {
                v.applyStyle(infoContainer, {'opacity': 0});
            }
            setTimeout(function() {
                u.removeElement(infoContainer);
            }, 1000);
        }, 1000);
    },
    sendDimensions: function(/*opt*/term, /*opt*/ctrl_l) {
        /**:GateOne.Terminal.sendDimensions([term[, ctrl_l]])

        Detects and sends the given term's dimensions (rows/columns) to the server.

        If no *term* is given it will send the dimensions of the currently-selected terminal to the server which will be applied to all terminals.
        */
        logDebug('sendDimensions(' + term + ', ' + ctrl_l + ')');
        if (go.prefs.broadcastTerminal) {
            return; // Clients of broadcast terminals don't get to resize them
        }
        // Explanation of below:  If the difference between the calculated value and the floor() of that value is greater than 0.8
        // it means that the 'fit' of the total rows--if we round() them--will be awfully tight.  Too tight, in fact.  I know this
        // because even though the math adds up the browsers pull crap like, "the child <pre> offsetHeight is greater than it's
        // parent's clientHeight" which is supposed to be impossible.  So I've defined the 'fit' to be 'too tight' if the there's
        // > 20% of a character (height-wise) of "wiggle room" between what is *supposed* to fit in the element and what the
        // browser tells us will fit (it lies--the top gets cut off!).
        var termObj, prevRows, prevCols, noTerm, termNode, termNum, where, rowAdjust, colAdjust, emDimensions, dimensions, rowsValue, colsValue, prefs,
            getAndSend = function(term) {
                var termObj = go.Terminal.terminals[term],
                    prevRows = termObj.prevRows,
                    prevCols = termObj.prevCols,
                    where = termObj.where,
                    termNode = termObj.terminal,
                    rowAdjust = go.prefs.rowAdjust + go.Terminal.rowAdjust,
                    colAdjust = go.prefs.colAdjust + go.Terminal.colAdjust,
                    emDimensions = u.getEmDimensions(termNode, where),
                    dimensions = u.getRowsAndColumns(termNode, where),
                    rowsValue = (dimensions.rows - rowAdjust),
                    colsValue = Math.ceil(dimensions.columns - colAdjust),
                    prefs = {
                        'term': term,
                        // rows are set below...
                        'columns': colsValue,
                        'em_dimensions': emDimensions
                    };
                if (termObj.noAdjust) {
                    rowsValue = dimensions.rows; // Don't bother with the usual rowAdjust for popup terminals and similar
                }
                if ((rowsValue - Math.floor(rowsValue)) > 0.8) {
                    prefs.rows = Math.ceil(rowsValue);
                } else {
                    prefs.rows = Math.floor(rowsValue);
                }
                if (!emDimensions.h || !emDimensions.w) {
                    return; // Nothing to do
                }
                if (!prefs.rows || !prefs.columns) {
                    return; // Something went wrong
                }
                if (prefs.rows < 2 || prefs.columns < 2) {
                    return; // Something went wrong; ignore
                }
                if (prevRows == prefs.rows && prevCols == prefs.columns) {
                    return; // Nothing to do
                }
                // Apply user-defined rows and columns (if set)
                if (go.prefs.columns) { prefs.columns = go.prefs.columns };
                if (go.prefs.rows) { prefs.rows = go.prefs.rows };
                // Save the rows/columns for comparison next time
                termObj.prevCols = prefs.columns;
                termObj.prevRows = prefs.rows;
                go.ws.send(JSON.stringify({'terminal:resize': prefs}));
                E.trigger("terminal:send_dimensions", term);
                // Execute any sendDimensionsCallbacks
                if (GateOne.Net.sendDimensionsCallbacks.length) {
                    go.Logging.deprecated("sendDimensionsCallbacks", gettext("Use ")+"GateOne.Events.on('terminal:send_dimensions', func) "+gettext("instead."));
                    for (var i=0; i<GateOne.Net.sendDimensionsCallbacks.length; i++) {
                        GateOne.Net.sendDimensionsCallbacks[i](term);
                    }
                }
            };
        if (typeof(ctrl_l) == 'undefined') {
            ctrl_l = true;
        }
        if (!term) {
            for (termNum in go.Terminal.terminals) {
                // Only want terminals which are integers; not the 'count()' function
                if (termNum % 1 === 0) {
                    getAndSend(termNum);
                }
            };
        } else {
            getAndSend(term);
        }
    },
    setTitle: function(term, text) {
        /**:GateOne.Terminal.setTitle(term, text)

        Sets the visible title of *term* to *text* appropriately based on whether or not this is a popup terminal or just a regular one.

        .. note:: This function does *not* set the 'title' or 'X11Title' attributes of the `GateOne.Terminal.terminals[term]` object.  That is handled by :js:meth:`GateOne.Terminal.setTitleAction`.
        */
        logDebug("GateOne.Terminal.setTitle(" + term + ", " + text + ")");
        var where;
        if (!go.Terminal.terminals[term]) {
            return; // Nothing to do
        }
        where = go.Terminal.terminals[term].where;
        if (where && where.classList.contains('✈termdialog')) {
            // This is a popup terminal; set the title of the dialog
            u.toArray(u.getNodes('.✈popupterm')).forEach(function(dialog) {
                if (u.isDescendant(dialog, where)) {
                    dialog.querySelector('.✈titletext').innerHTML = text;
                }
            });
        } else {
            v.setTitle(text);
        }
    },
    setTitleAction: function(titleObj) {
        /**:GateOne.Terminal.setTitleAction(titleObj)

        Sets the title of *titleObj.term* to *titleObj.title*.
        */
        var term = titleObj.term,
            title = titleObj.title,
            termObj = go.Terminal.terminals[term],
            sideinfo = u.getNode('#'+prefix+'sideinfo'),
            termTitle = u.getNode('#'+prefix+'termtitle'),
            toolbar = u.getNode('#'+prefix+'toolbar'),
            goDiv = u.getNode(go.prefs.goDiv),
            heightDiff = goDiv.clientHeight - toolbar.clientHeight,
            scrollbarAdjust = (go.Terminal.scrollbarWidth || 15); // Fallback to 15px if this hasn't been set yet (a common width)
        logDebug("setTitleAction() Setting term " + term + " to title: " + title);
        if (!termObj) {
            return; // Terminal was just closed
        }
        termObj['X11Title'] = title;
        termObj.title = title;
        go.Terminal.setTitle(term, term + ": " + title);
        if (termObj.workspace) {
            // Set the title of the workspace too so it shows up in the locations panel
            go.workspaces[termObj.workspace].node.setAttribute('data-title', term + ": " + title);
        }
        // Also update the info panel
        if (termTitle) {
            termTitle.innerHTML = term+': '+title;
        }
        E.trigger('terminal:set_title_action', term, title);
    },
    resizeAction: function(message) {
        /**:GateOne.Terminal.resizeAction(message)

        Called when the server sends the `terminal:resize` WebSocket action.  Sets the 'rows' and 'columns' values inside `GateOne.Terminal.terminals[message.term]` and sets the same values inside the Info & Tools panel.
        */
        var term = message.term,
            rows = message.rows,
            columns = message.columns,
            infoPanelRows = u.getNode('#'+prefix+'rows'),
            infoPanelCols = u.getNode('#'+prefix+'columns');
        go.Terminal.terminals[term].rows = rows;
        go.Terminal.terminals[term].columns = columns;
        infoPanelRows.innerHTML = rows + "<br />";
        infoPanelCols.innerHTML = columns + "<br />";
        E.trigger("terminal:resize", term, rows, columns);
    },
    paste: function(e) {
        /**:GateOne.Terminal.paste(e)

        This gets attached to Shift-Insert (KEY_INSERT) as a shortcut in order to support pasting.
        */
        logDebug('paste()');
        var tempPaste = u.createElement('textarea', {'class': '✈temppaste', 'style': {'position': 'fixed', 'top': '-100000px', 'left': '-100000px', 'opacity': 0}});
        go.Terminal.Input.handlingPaste = true;
        tempPaste.oninput = function(e) {
            var pasted = tempPaste.value,
                lines = pasted.split('\n');
            if (lines.length > 1) {
                // If we're pasting stuff with newlines we should strip trailing whitespace so the lines show up correctly.  In all but a few cases this is what the user expects.
                for (var i=0; i < lines.length; i++) {
                    lines[i] = lines[i].replace(/\s*$/g, ""); // Remove trailing whitespace
                }
                pasted = lines.join('\n');
            }
            go.Terminal.sendString(pasted);
            tempPaste.value = "";
            u.removeElement(tempPaste); // Don't need this anymore
            setTimeout(function() {
                go.Terminal.Input.handlingPaste = false;
                go.Terminal.Input.capture();
            }, 250);
        }
        go.node.appendChild(tempPaste);
        tempPaste.focus();
    },
    writeScrollback: function(term, scrollback) {
        /**:GateOne.Terminal.writeScrollback(term, scrollback)

        Writes the given *scrollback* buffer for the given *term* to localStorage.
        */
        // NOTE:  I seriously doubt we'll ever be in a situation where this gets called before the DB is ready but just in case...
        if (!go.Terminal.dbReady) {
            // Database hasn't finished initializing yet.  Wait just a moment and retry...
            if (go.Terminal.deferDBTimer) {
                clearTimeout(go.Terminal.deferDBTimer);
                go.Terminal.deferDBTimer = null;
            }
            go.Terminal.deferDBTimer = setTimeout(function() {
                go.Terminal.wrriteScrollback(term, scrollback);
                go.Terminal.deferDBTimer = null;
            }, 10);
            return;
        }
        var terminalDB = S.dbObject('terminal'),
            scrollbackObj = {'term': term, 'scrollback': scrollback, 'date': new Date()}; // Date is probably not necessary but you never know...   Could be useful
        terminalDB.put('scrollback', scrollbackObj); // Put it in the 'scrollback' store
    },
    _dirtyLines: [],
    applyScreen: function(screen, /*opt*/term, /*opt*/noUpdate) {
        /**:GateOne.Terminal.applyScreen(screen[, term[, noUpdate]])

        Uses *screen* (array of HTML-formatted lines) to update *term*.

        If *term* is omitted `localStorage[prefix+selectedTerminal]` will be used.

        If *noUpdate* is ``true`` the array that holds the current screen in `GateOne.Terminal.terminals` will not be updated (useful for temporary screen replacements).

        .. note::  Lines in *screen* that are empty strings or null will be ignored (so it is safe to pass a full array with only a single updated line).
        */
        var termObj = go.Terminal.terminals[term],
            screenNode = termObj.screenNode,
            existingScreen = termObj['screen'],
            i, existingLine, classes, lineSpan,
            dirtyLines = go.Terminal._dirtyLines,
            updateDirtyLines = function() {
                for (i=0; i < dirtyLines.length; i++) {
                    dirtyLines[i][0].innerHTML = dirtyLines[i][1] + '\n';
                }
                dirtyLines.length = 0 // Empty it out (makes the object shallow/saves GC later)
            };
        if (!term) {
            term = localStorage[prefix+'selectedTerminal'];
        }
        for (var i=0; i < screen.length; i++) {
            if (screen[i].length) {
                existingLine = termObj['lineCache'][i];
                if (existingLine) {
                    if (screen[i] != existingScreen[i]) {
                        if (noUpdate !== true) {
                            // Update the existing screen array in-place to cut down on GC
                            termObj['screen'][i] = screen[i];
                        }
                        dirtyLines.push([existingLine, screen[i]]);
                    }
                } else { // Size of the terminal increased
                    classes = '✈termline ' + prefix + 'line_' + i;
                    lineSpan = u.createElement('span', {'class': classes});
                    lineSpan.innerHTML = screen[i] + '\n';
                    screenNode.appendChild(lineSpan);
                    termObj['lineCache'][i] = lineSpan;
                }
            }
        }
        requestAnimationFrame(updateDirtyLines);
    },
    alignTerminal: function(term) {
        /**:GateOne.Terminal.alignTerminal(term)

        Uses a CSS3 transform to move the terminal <pre> element upwards just a bit so that the scrollback buffer isn't visislbe unless you actually scroll.  This improves the terminal's overall appearance considerably because the bottoms of characters in the scollback buffer tend to look like graphical glitches.
        */
        logDebug("alignTerminal("+term+")");
        if (!term) { // Use currentTerm
            term = localStorage[prefix+'selectedTerminal'];
        }
        if (!go.Terminal.terminals[term]) {
            return; // Can happen if the terminal is closed immediately after being opened
        }
        if (go.prefs.scrollback == 0) {
            return; // Don't bother if scrollback has been disabled
        }
        var termPre = go.Terminal.terminals[term].node,
            screenSpan = go.Terminal.terminals[term].screenNode,
            terminalNode = go.Terminal.terminals[term].terminal,
            where = go.Terminal.terminals[term].where,
            rowAdjust = go.prefs.rowAdjust + go.Terminal.rowAdjust,
            colAdjust = go.prefs.colAdjust + go.Terminal.colAdjust;
        if (!termPre) {
            return; // Can happen for the same reason as above
        }
        if (go.Terminal.terminals[term].noAdjust) {
            rowAdjust = go.prefs.rowAdjust; // Don't bother with the usual rowAdjust for popup terminals
        }
        v.applyTransform(termPre, ''); // Need to reset before we do the calculation
        var emDimensions = u.getEmDimensions(screenSpan, terminalNode);
        if (go.prefs.rows) { // If someone explicitly set rows/columns, scale the term to fit the screen
            if (screenSpan.getClientRects()[0]) {
//                 termPre.style.height = 'auto'; // For some reason if you don't set this the terminal may appear waaay above where it is supposed to.
                var nodeHeight = screenSpan.offsetHeight - (emDimensions.h * rowAdjust), // The +em height compensates for the presence of the playback controls
                    nodeWidth = screenSpan.offsetWidth - (emDimensions.w * colAdjust); // Making room for the toolbar
                if (nodeHeight < where.offsetHeight) { // Resize to fit
                    var scaleY = (where.offsetHeight / (emDimensions.h * (go.prefs.rows + go.Terminal.rowAdjust))),
                        scaleX = (where.offsetWidth / (emDimensions.w * (go.prefs.columns + go.Terminal.colAdjust))),
                        transform = transform = "scale(" + scaleX + ", " + scaleY + ")";
                    v.applyTransform(termPre, transform);
                }/* else { // Terminal size is too big to fit.  Scale it down (work in progress)
                    console.log("where.offsetHeight: " + where.offsetHeight + ", where.offsetWidth: " + where.offsetWidth);
                    console.log("emDimensions.h: " + emDimensions.h + ", emDimensions.w: " + emDimensions.w);
                    console.log("go.prefs.rows+go.Terminal.rowAdjust: " + (go.prefs.rows+go.Terminal.rowAdjust) + ", go.prefs.columns+go.Terminal.colAdjust: " + go.prefs.columns+go.Terminal.colAdjust);
                    var scaleY = (where.offsetHeight /(emDimensions.h * (go.prefs.rows+go.Terminal.rowAdjust))),
                        scaleX = (where.offsetWidth / (emDimensions.w * (go.prefs.columns+go.Terminal.colAdjust))),
                        transform = transform = "scale(" + scaleX + ", " + scaleY + ")";
                    v.applyTransform(termPre, transform);
                }*/
            }
        } else {
            // Feel free to attach something like this to the "terminal:term_updated" event if you want.
            if (u.isVisible(termPre)) {
                // NOTE:  The distance below is -1 because--for whatever reason--the calculation is always off by 1.  No idea why.
                var distance = where.clientHeight - (screenSpan.offsetHeight + Math.floor(emDimensions.h * rowAdjust)) - 1,
                    transform = "translateY(-" + distance + "px)";
                if (distance > 0) {
                    if (distance < emDimensions.h) { // A sanity check (we should never be adjusting more than the height of a single character)
                        v.applyTransform(termPre, transform); // Move it to the top so the scrollback isn't visible unless you actually scroll
                    } else {
                        // Fall back to no adjustment at all (rather have the scrollback partially visible than anything off-screen)
                        v.applyTransform(termPre, ''); // This resets it to "no transform"
                    }
                }
            }
        }
    },
    termUpdateFromWorker: function(e) {
        /**:GateOne.Terminal.termUpdateFromWorker(e)

        This function gets assigned to the :js:meth:`termUpdatesWorker.onmessage` event; Whenever the WebWorker completes processing of the incoming screen it posts the result to this function.  It takes care of updating the terminal on the page, storing the scrollback buffer, and finally triggers the "terminal:term_updated" event passing the terminal number as the only argument.
        */
        var data = e.data,
            term = data.term,
            screen = data.screen,
            scrollback = data.scrollback,
            backspace = data.backspace,
            screen_html = "",
            consoleLog = data.log, // Only used when debugging
            screenUpdate = false,
            termTitle = "Gate One", // Will be replaced down below
            goDiv = go.node,
            i, existingPre, existingScreen, existingLine, lineSpan, inactivity, prevLength, classes, scriptElements, reScrollback, then, now;
        if (!go.Terminal.terminals[term]) {
            return; // Nothing to do
        }
        existingPre = go.Terminal.terminals[term].node;
        existingScreen = go.Terminal.terminals[term].screenNode
        if (term && go.Terminal.terminals[term]) {
            termTitle = go.Terminal.terminals[term].title;
        } else {
            // Terminal was likely just closed.
            return;
        };
        if (backspace.length) {
            go.Terminal.Input.automaticBackspace = false; // Tells us to hold off on attempting to detect backspace for a while
            setTimeout(function() {
                // Don't bother checking for incorrect backspace again for at least 10 seconds
                go.Terminal.Input.automaticBackspace = true;
            }, 10000);
            // Use whatever was detected
            if (backspace.charCodeAt(0) == 8) {
                v.displayMessage(gettext("Backspace difference detected; switching to ^?"));
                go.Net.sendString(String.fromCharCode(8)); // Send the intended backspace
                u.getNode('#'+prefix+'backspace_h').checked = true;
            } else {
                v.displayMessage(gettext("Backspace difference detected; switching to ^H"));
                go.Net.sendString(String.fromCharCode(127)); // Send the intended backspace
                u.getNode('#'+prefix+'backspace_q').checked = true;
            }
            go.Terminal.terminals[term]['backspace'] = backspace;
        }
        if (screen) {
            if (existingScreen && go.Terminal.terminals[term]['screen'].length != screen.length) {
                // Resized
                prevLength = go.Terminal.terminals[term]['screen'].length;
                go.Terminal.terminals[term]['screen'].length = screen.length; // Resize the array to match
                if (prevLength < screen.length) {
                    // Grow to fit
                    for (i=0; i < screen.length; i++) {
                        classes = '✈termline ' + prefix + 'line_' + i;
                        existingLine = existingPre.querySelector('.' + prefix + 'line_' + i);
                        lineSpan = u.createElement('span', {'class': classes});
                        if (!existingLine) {
                            lineSpan.innerHTML = screen[i] + '\n';
                            existingScreen.appendChild(lineSpan);
                            // Update the existing screen array in-place to cut down on GC
                            go.Terminal.terminals[term]['screen'][i] = screen[i];
                            // Update the existing lineCache too
                            go.Terminal.terminals[term]['lineCache'][i] = lineSpan;
                        }
                    }
                } else {
                    // Shrink to fit
                    for (i=0; i < prevLength; i++) {
                        classes = '✈termline ' + prefix + 'line_' + i;
                        existingLine = existingPre.querySelector('.' + prefix + 'line_' + i);
                        if (existingLine) {
                            if (i >= screen.length) {
                                u.removeElement(existingLine);
                            }
                        }
                    }
                }
                go.Terminal.alignTerminal(term);
            }
            if (existingScreen) { // Update the terminal display
                go.Terminal.applyScreen(screen, term);
                u.scrollToBottom(existingPre);
            }
            screenUpdate = true;
            go.Terminal.terminals[term].scrollbackVisible = false;
            // This is a convenience for plugin authors:  Execute any incoming <script> tags automatically
            scriptElements = go.Terminal.terminals[term].node.querySelectorAll('script');
            if (scriptElements.length) {
                u.toArray(scriptElements).forEach(function(tag) {
                    eval(tag.innerHTML);
                });
            }
        }
        if (go.prefs.scrollback == 0) {
            scrollback = []; // Empty it out since the user has disabled the scrollback buffer
        }
        if (scrollback.length && go.Terminal.terminals[term].scrollback.toString() != scrollback.toString()) {
            reScrollback = u.partial(go.Terminal.enableScrollback, term);
            go.Terminal.terminals[term].scrollback = scrollback;
            go.Terminal.writeScrollback(term, scrollback); // Uses IndexedDB so it should be nice and async
            // This updates the scrollback buffer in the DOM
            clearTimeout(go.Terminal.terminals[term].scrollbackTimer);
            // This timeout re-adds the scrollback buffer after 1 second.  If we don't do this it can slow down the responsiveness quite a bit
            go.Terminal.terminals[term].scrollbackTimer = setTimeout(reScrollback, 500); // Just enough to de-bounce (to keep things smooth)
        }
        if (consoleLog) {
            // This is only used when debugging the Web Worker
            logInfo(consoleLog);
        }
        if (screenUpdate) {
            // Take care of the activity/inactivity notifications
            if (go.Terminal.terminals[term].inactivityTimer) {
                clearTimeout(go.Terminal.terminals[term].inactivityTimer);
                inactivity = u.partial(go.Terminal.notifyInactivity, term + ': ' + termTitle);
                go.Terminal.terminals[term].inactivityTimer = setTimeout(inactivity, go.Terminal.terminals[term].inactivityTimeout);
            }
            if (go.Terminal.terminals[term].activityNotify) {
                if (!go.Terminal.terminals[term]['lastNotifyTime']) {
                    // Setup a minimum delay between activity notifications so we're not spamming the user
                    go.Terminal.terminals[term]['lastNotifyTime'] = new Date();
                    go.Terminal.notifyActivity(term + ': ' + termTitle);
                } else {
                    then = new Date(go.Terminal.terminals[term]['lastNotifyTime']);
                    now = new Date();
                    then.setSeconds(then.getSeconds() + 5); // 5 seconds between notifications
                    if (now > then) {
                        go.Terminal.terminals[term]['lastNotifyTime'] = new Date(); // Reset
                        go.Terminal.notifyActivity(term + ': ' + termTitle);
                    }
                }
            }
            // Excute any registered callbacks
            E.trigger("terminal:term_updated", term);
            if (go.Terminal.updateTermCallbacks.length) {
                go.Logging.deprecated("updateTermCallbacks", gettext("Use GateOne.Events.on('terminal:term_updated', func) instead."));
                for (i=0; i<go.Terminal.updateTermCallbacks.length; i++) {
                    go.Terminal.updateTermCallbacks[i](term);
                }
            }
        }
    },
    loadWebWorkerAction: function(source) {
        /**:GateOne.Terminal.loadWebWorkerAction(source)

            Loads our Web Worker given it's *source* (which is sent to us over the WebSocket which is a clever workaround to the origin limitations of Web Workers =).
        */
        var t = go.Terminal,
            blob = null;
        try {
            blob = u.createBlob(source, 'application/javascript');
        } catch (e) {
            // No blob
            ;;
        }
        // Obtain a blob URL reference to our worker 'file'.
        if (blob && urlObj && urlObj.createObjectURL) {
            try {
                var blobURL = urlObj.createObjectURL(blob);
                t.termUpdatesWorker = new Worker(blobURL);
            } catch (e) {
                // Some browsers (IE 10) don't allow you to load Web Workers via Blobs  For these we need to load the old fashioned way.
                // NOTE:  This means that if you're embedding Gate One you MUST have it listening on the same port as the web page embedding it.  Web Workers have the odd security restriction of being required to load via the same origin *type* (aka port) which is just plain wacky.
                t.termUpdatesWorker = new Worker(go.prefs.webWorker);
            }
        } else {
            // Fall back to the old way (try it anyway--won't work for most embedded situations)
            t.termUpdatesWorker = new Worker(go.prefs.webWorker);
            // Why bother with Blobs?  Because you can't load Web Workers from a different origin *type*.  What?!?
            // The origin type would be, say, HTTPS on port 443.  So if I wanted to load a Web Worker from such a page where the Worker's URL is from an HTTPS server on port 10443 it would throw errors.  Even if it is from the same domain.  The same holds true for loading a Worker from an HTTP URL.  What's odd is that you can load a Worker from HTTPS on a completely *different* domain as long as it's the same origin *type*!  Who comes up with this stuff?!?
            // So by loading the Web Worker code via the WebSocket we can get around all that nonsense since WebSockets can be anywhere and on any port without silly restrictions.
            // In other words, the old way should still work as long as Gate One is listening on the same protocol (HTTPS) and port (443) as the app that's embedding it.
        }
        t.termUpdatesWorker.onmessage = t.termUpdateFromWorker;
    },
    updateTerminalAction: function(termUpdateObj) {
        /**:GateOne.Terminal.updateTerminalAction(termUpdateObj)

            Takes the updated screen information from *termUpdateObj* and posts it to the 'term_ww.js' Web Worker to be processed.

            .. note:: The Web Worker is important because it allows offloading of CPU-intensive tasks like linkification and text transforms so they don't block screen updates
        */
        var t = go.Terminal,
            term = termUpdateObj.term,
            ratelimiter = termUpdateObj['ratelimiter'],
            scrollback,
            textTransforms = go.Terminal.textTransforms,
            checkBackspace = null,
            message = null;
//         logDebug('GateOne.Utils.updateTerminalAction() termUpdateObj: ' + u.items(termUpdateObj));
//         logDebug("screen length: " + termUpdateObj['screen'].length);
        if (!go.Terminal.terminals[term]) {
            return; // Terminal was just closed
        }
        scrollback = go.Terminal.terminals[term].scrollback;
        if (ratelimiter) {
            v.displayMessage(gettext("WARNING: The rate limiter was engaged on terminal: ") + term + gettext(".  Output will be severely slowed until you press a key (e.g. Ctrl-C)."));
        }
        if (go.Terminal.Input.sentBackspace) {
            checkBackspace = go.Terminal.terminals[term]['backspace'];
            go.Terminal.Input.sentBackspace = false; // Prevent a potential race condition
        }
        if (!scrollback) {
            // Terminal was just closed, ignore
            return;
        }
        // Remove all DOM nodes from the terminalObj since they can't be passed to a Web Worker
        if (termUpdateObj['screen']) {
            message = {
                'cmds': ['processScreen'],
                'scrollback': scrollback,
                'termUpdateObj': termUpdateObj,
                'prefs': go.prefs,
                'textTransforms': textTransforms,
                'checkBackspace': checkBackspace,
                'term': term
            };
            // This event allows plugins to take actions based on the incoming message and to transform it before it is sent to the Web Worker for processing:
            E.trigger("terminal:incoming_term_update", message);
            // Offload processing of the incoming screen to the Web Worker
            t.termUpdatesWorker.postMessage(message);
        }
    },
    notifyInactivity: function(term) {
        /**:GateOne.Terminal.notifyInactivity(term)

            Notifies the user of inactivity in *term*.
        */
        var message = gettext("Inactivity in terminal: ") + term;
        go.Terminal.playBell();
        v.displayMessage(message);
    },
    notifyActivity: function(term) {
        /**:GateOne.Terminal.notifyActivity(term)

            Notifies the user of activity in *term*.
        */
        var message = gettext("Activity in terminal: ") + term;
        go.Terminal.playBell();
        v.displayMessage(message);
    },
    newPastearea: function(term) {
        /**:GateOne.Terminal.newPastearea()

        Returns a 'pastearea' (textarea) element meant for placement above terminals for the purpose of enabling proper copy & paste.
        */
//         if ('ontouchstart' in document.documentElement) { // Touch-enabled devices only
//             return; // Don't create the pastearea on mobile devices since it messes up the ability to scroll
//         }
        var pastearea = u.createElement('textarea', {'id': 'pastearea'+term, 'class': '✈pastearea'}),
        // The following functions control the copy & paste capability
            pasteareaOnInput = function(e) {
                var pasted = pastearea.value,
                    lines = pasted.split('\n');
                if (go.Terminal.Input.handlingPaste) {
                    return;
                }
                if (lines.length > 1) {
                    // If we're pasting stuff with newlines we should strip trailing whitespace so the lines show up correctly.  In all but a few cases this is what the user expects.
                    for (var i=0; i < lines.length; i++) {
                        lines[i] = lines[i].replace(/\s*$/g, ""); // Remove trailing whitespace
                    }
                    pasted = lines.join('\n');
                }
                go.Terminal.sendString(pasted);
                pastearea.value = "";
                go.Terminal.Input.capture();
            },
            pasteareaScroll = function(e) {
                // We have to hide the pastearea so we can scroll the terminal underneath
                e.preventDefault();
                var pasteArea = u.getNode('#'+prefix+'pastearea'+term);
                u.hideElement(pastearea);
                if (go.scrollTimeout) {
                    clearTimeout(go.scrollTimeout);
                    go.scrollTimeout = null;
                }
                go.scrollTimeout = setTimeout(function() {
                    u.showElement(pastearea);
                }, 1000);
            },
            pasteareaMousemove = function(e) {
                var termline = null,
                    elem = null,
                    maxRecursion = 10,
                    count = 0,
                    X = e.clientX,
                    Y = e.clientY,
                    timeout = 50;
                if (pastearea.style.display != 'none') {
                    u.hideElement(pastearea);
                    go.Terminal.Input.pasteareaTemp = pastearea.onmousemove;
                    pastearea.onmousemove = null;
                }
                var elementUnder = document.elementFromPoint(X, Y);
                while (!termline) {
                    // Look for special things under the mouse until we've reached the parent container of the line
                    count += 1;
                    if (count > maxRecursion) {
                        break;
                    }
                    if (!elem) {
                        elem = elementUnder;
                    }
                    if (typeof(elem.className) == "undefined") {
                        break;
                    }
                    if (elem.className.indexOf && elem.className.indexOf('✈termline') != -1) {
                        termline = elem; // End it
                    } else if (elem.tagName.toLowerCase) {
                        var tagName = elem.tagName.toLowerCase();
                        if (tagName == 'a' || tagName == 'img' || tagName == 'audio' || tagName == 'video') {
                            // Anchor elements mean we shouldn't make the pastearea reappear so the user can click on them
                            if (go.Terminal.pasteAreaTimer) {
                                clearTimeout(go.Terminal.pasteAreaTimer);
                                go.Terminal.pasteAreaTimer = null;
                            }
                            return;
                        }
                    } else if (elem.className.indexOf && elem.className.indexOf('✈clickable') != -1) {
                        // Clickable elements mean we shouldn't make the pastearea reappear
                        if (go.Terminal.pasteAreaTimer) {
                            clearTimeout(go.Terminal.pasteAreaTimer);
                            go.Terminal.pasteAreaTimer = null;
                        }
                        return;
                    } else {
                        elem = elem.parentNode;
                    }
                }
                if (go.Terminal.pasteAreaTimer) {
                    return; // Let it return to visibility on its own
                }
                go.Terminal.pasteAreaTimer = setTimeout(function() {
                    pastearea.onmousemove = go.Terminal.Input.pasteareaTemp;
                    go.Terminal.pasteAreaTimer = null;
                    if (!u.getSelText()) {
                        u.showElement(pastearea);
                    }
                }, timeout);
            };
        pastearea.oninput = pasteareaOnInput;
        pastearea.addEventListener(mousewheelevt, pasteareaScroll, true);
        pastearea.onpaste = function(e) {
            go.Terminal.Input.onPaste(e);
            // Start capturing input again
            setTimeout(function() {
                // For some reason when you paste the onmouseup event doesn't fire on goDiv; goFigure
                go.Terminal.Input.mouseDown = false;
                go.Terminal.Input.capture();
                pastearea.value = ''; // Empty it out to ensure there's no leftovers in subsequent pastes
                pastearea.onmousemove = pasteareaMousemove;
            }, 1);
        }
        pastearea.addEventListener('contextmenu', function(e) {
            // For some reason Chrome will fire infinite mousemove events when the context menu is open (even if the mouse isn't moving!) so we disable the mousemove event while it's open to work around that problem:
            pastearea.onmousemove = null; // We don't need these events firing while the context menu is open anyway
            u.showElement(pastearea); // Make sure it's not hidden
            pastearea.focus(); // Make sure it has focus so the user can paste
        }, false);
        pastearea.onmousemove = pasteareaMousemove;
        pastearea.addEventListener('mousedown', function(e) {
            // When the user left-clicks assume they're trying to highlight text
            // so bring the terminal to the front and try to emulate normal
            // cursor-text action as much as possible.
            // NOTE: There's one caveat with this method:  If text is highlighted
            //       right-click to paste won't work.  So the user has to just click
            //       somewhere (to deselect the text) before they can use the Paste
            //       context menu.  As a convenient shortcut/workaround, the user
            //       can middle-click to paste the current selection.
            logDebug('pastearea.onmousedown button: ' + e.button + ', which: ' + e.which);
            var m = go.Input.mouse(e), // Get the properties of the mouse event
                X = e.clientX,
                Y = e.clientY,
                selectedTerm = (this.id + '').split('pastearea')[1];
            if (localStorage[prefix+'selectedTerminal'] != selectedTerm) {
                // Switch terminals
                go.Terminal.switchTerminal(selectedTerm);
            }
            go.Terminal.setActive(selectedTerm);
            if (m.button.left) { // Left button depressed
                u.hideElement(pastearea);
                if (go.Terminal.pasteAreaTimer) {
                    clearTimeout(go.Terminal.pasteAreaTimer);
                }
                var elementUnder = document.elementFromPoint(X, Y);
                if (typeof(elementUnder.onclick) == "function") {
                    // Fire the onclick event
                    elementUnder.onclick(e); // Pass through the event
                }
                // This lets users click on links underneath the pastearea
                if (elementUnder.tagName == "A") {
                    window.open(document.elementFromPoint(X, Y).href);
                }
                // Don't add the scrollback if the user is highlighting text--it will mess it up
                if (go.Terminal.terminals[selectedTerm]) {
                    if (go.Terminal.terminals[selectedTerm].scrollbackTimer) {
                        clearTimeout(go.Terminal.terminals[selectedTerm].scrollbackTimer);
                    }
                }
                go.Terminal.Input.mouseDown = true;
                go.Terminal.Input.capture();
            } else if (m.button.middle) {
                // This is here to enable middle-click-to-paste in Windows but it only works if the user has launched Gate One in "application mode".
                // Gate One can be launched in "application mode" if the user selects the "create application shortcut..." option from the tools menu.
                try {
                    document.execCommand('paste');
                } catch (e) {
                    // Browser won't let us execute a paste event...  Hope for the best with the pastearea!
                    ;; // Ignore
                }
            } else if (m.button.right) {
                if (u.getSelText()) {
                    u.hideElement(pastearea);
                }
            }
        }, true);
        pastearea.addEventListener('mouseup', function(e) {
            // If the user doesn't select "Paste" from the context menu we need to make sure we re-enable the mousemove event function:
            pastearea.onmousemove = pasteareaMousemove;
            u.showElement(pastearea);
        }, true);
        return pastearea;
    },
    newTerminal: function(/*Opt:*/term, /*Opt:*/settings, /*Opt*/where) {
        /**:GateOne.Terminal.newTerminal([term[, settings[, where]]])

        Adds a new terminal to the grid and starts updates with the server.

        If *term* is provided, the created terminal will use that number.

        If *settings* (object) are provided the given parameters will be applied to the created terminal's parameters in GateOne.Terminal.terminals[term] as well as sent as part of the 'terminal:new_terminal' WebSocket action.  This mechanism can be used to spawn terminals using different 'commands' that have been configured on the server.  For example::

            > // Creates a new terminal that spawns whatever command is set as 'login' in Gate One's settings:
            > GateOne.Terminal.newTerminal(null, {'command': 'login'});

        If *where* is provided, the new terminal element will be appended like so:  where.appendChild(<new terminal element>);  Otherwise the terminal will be added to the grid.

        Terminal types are sent from the server via the 'terminal_types' action which sets up GateOne.terminalTypes.  This variable is an associative array in the form of:  {'term type': {'description': 'Description of terminal type', 'default': true/false, <other, yet-to-be-determined metadata>}}.
        */
        logDebug("newTerminal(" + term + ", " + JSON.stringify(settings) + ", " + where + ")");
        var t = go.Terminal,
            currentTerm, terminal, emDimensions, dimensions, rows, columns, pastearea, switchTermFunc,
            // NOTE: trulyNew tracks whether or not we were passed a *term* (terminal number) as an argument.
            //       This allows us to differentiate between a terminal that we're resuming and one that is truly *new*.
            trulyNew = false,
            terminalDB = S.dbObject('terminal'),
            gridwrapper = u.getNode('#'+prefix+'gridwrapper'),
            rowAdjust = go.prefs.rowAdjust + go.Terminal.rowAdjust,
            colAdjust = go.prefs.colAdjust + go.Terminal.colAdjust,
            workspaceNum, // Set below (if any)
            termPre, // Created below after we have a terminal number to use
            screenSpan, // Ditto
            wheelFunc = function(e) {
                var m = go.Input.mouse(e),
                    modifiers = go.Input.modifiers(e);
                if (!modifiers.shift && !modifiers.ctrl && !modifiers.alt) { // Only for basic scrolling
                    if (go.Terminal.terminals[term]) {
                        var term = localStorage[prefix+'selectedTerminal'],
                            terminalObj = go.Terminal.terminals[term];
                        if (!terminalObj.scrollbackVisible) {
                            // Immediately re-enable the scrollback buffer
                            go.Terminal.enableScrollback(term);
                        }
                    }
                } else {
                    e.preventDefault();
                }
            };
        if (term) {
            currentTerm = 'term' + term;
            t.lastTermNumber = term;
        } else {
            trulyNew = true;
            if (!t.lastTermNumber) {
                t.lastTermNumber = 0; // Start at 0 so the first increment will be 1
            }
            t.lastTermNumber = t.lastTermNumber + 1;
            term = t.lastTermNumber;
            currentTerm = 'term' + t.lastTermNumber;
        }
        switchTermFunc = u.partial(go.Terminal.switchTerminal, term);
        if (!where) {
            if (gridwrapper) {
                where = v.newWorkspace(); // Use the gridwrapper (grid) by default
                where.innerHTML = ""; // Empty it out before we use it
                where.setAttribute('data-application', 'Terminal'); // Hint for relocateWorkspace()
                workspaceNum = parseInt(where.getAttribute('data-workspace'));
            } else {
                where = go.node;
            }
        } else {
            where = u.getNode(where);
            if (where.id.indexOf(prefix+'workspace') != -1) {
                // This is a workspace, grab the number
                workspaceNum = parseInt(where.getAttribute('data-workspace'));
            }
        }
        // Create the terminal record scaffold
        if (!go.Terminal.terminals[term]) {
            // Why the above check?  In case we're resuming from being disconnected
            go.Terminal.terminals[term] = {
                created: new Date(), // So we can keep track of how long it has been open
                mode: 'default', // e.g. 'appmode', 'default', etc
                keyboard: 'default', // e.g. 'default', 'xterm', 'sco'
                backspace: String.fromCharCode(127), // ^?
                encoding: 'utf-8',  // Just a default--will get overridden if provided via settings['encoding']
                screen: [],
                prevScreen: [],
                lineCache: [],
                title: 'Gate One',
                scrollback: [],
                scrollbackTimer: null, // Controls re-adding scrollback buffer
                where: where,
                workspace: workspaceNum // NOTE: This will be (likely) be undefined when embedding
            }
        }
        for (var pref in settings) {
            if (pref != 'style') {
                go.Terminal.terminals[term][pref] = settings[pref];
            }
        }
        // Retrieve any previous scrollback buffer for this terminal
        terminalDB.get('scrollback', term, function(obj) {
            if (obj) {
                go.Terminal.terminals[term].scrollback = obj.scrollback;
            }
        });
        terminal = u.createElement('div', {'id': currentTerm, 'class': '✈terminal'});
        if (!go.prefs.embedded) {
            // Switch to the newly created workspace (if warranted)
            if (workspaceNum) {
                if (t.newTermSwitchDebounce) {
                    clearTimeout(t.newTermSwitchDebounce);
                    t.newTermSwitchDebounce = null;
                }
                // This timeout is to keep things smooth when many terminals are resumed simultaneously
                t.newTermSwitchDebounce = setTimeout(function () {
                    v.switchWorkspace(workspaceNum);
                }, 25);
            }
        }
        pastearea = go.Terminal.newPastearea(term);
        terminal.setAttribute('data-term', term);
        terminal.appendChild(pastearea);
        go.Terminal.terminals[term]['pasteNode'] = pastearea;
        termPre = u.createElement('pre', {'id': 'term'+term+'_pre', 'class': '✈terminal_pre'});
        terminal.appendChild(termPre);
        go.Terminal.terminals[term].node = termPre; // For faster access
        if (settings && settings['style']) {
            v.applyStyle(terminal, settings['style']);
        }
        if (where && where.classList.contains('✈terminal')) {
            terminal = where;
            terminal.id = currentTerm;
        } else {
            u.getNode(where).appendChild(terminal);
        }
        dimensions = u.getRowsAndColumns(terminal, where);
        if (settings && settings.noAdjust) {
            go.Terminal.terminals[term].noAdjust = true;
            rows = dimensions.rows;
            columns = Math.ceil(dimensions.columns);
        } else {
            rows = (dimensions.rows - rowAdjust);
            columns = Math.ceil(dimensions.columns - colAdjust);
        }
        if ((rows - Math.floor(rows)) > 0.8) {
            rows = Math.ceil(rows);
        } else {
            rows = Math.floor(rows);
        }
        go.Terminal.terminals[term].rows = rows;
        go.Terminal.terminals[term].columns = columns;
        go.Terminal.terminals[term].terminal = terminal; // Cache it for quicker access later
        go.Terminal.prevCols = columns; // So sendDimensions() will know if we are already set to this size
        go.Terminal.prevRows = rows;    // Ditto
        // This ensures that we re-enable input if the user clicked somewhere else on the page then clicked back on the terminal:
        terminal.addEventListener('click', switchTermFunc, false);
        // Get any previous term's dimensions so we can use them for the new terminal
        var termSettings = {
                'term': term,
                'rows': rows,
                'columns': columns
            },
            slide = u.partial(go.Terminal.switchTerminal, term);
        // Update termSettings with *settings* (overriding with anything that was given)
        for (var pref in settings) {
            if (pref != 'style') {
                termSettings[pref] = settings[pref];
            }
        }
        // Use the default command if set
        if (go.Terminal.defaultCommand) {
            if (!termSettings['command']) {
                termSettings['command'] = go.Terminal.defaultCommand;
            }
        }
        // Apply user-defined rows and columns (if set)
        if (go.prefs.columns) { termSettings.columns = go.prefs.columns };
        if (go.prefs.rows) { termSettings.rows = go.prefs.rows };
        // This re-enables the scrollback buffer immediately if the user starts scrolling (even if the timeout hasn't expired yet)
        terminal.addEventListener(mousewheelevt, wheelFunc, true);
        screenSpan = u.createElement('span', {'id': 'term'+term+'screen', 'class': '✈screen'})
        // Add the scaffold of the screen
        for (var i=0; i<rows; i++) {
            var classes = '✈termline ' + prefix + 'line_' + i,
                lineSpan = u.createElement('span', {'class': classes});
            lineSpan.innerHTML = ' \n';
            screenSpan.appendChild(lineSpan);
            // Fill out prevScreen with spaces
            go.Terminal.terminals[term]['prevScreen'][i] = ' \n';
            // Update the existing screen array in-place to cut down on GC
            go.Terminal.terminals[term]['screen'][i] = ' \n';
            // Update the lineCache too
            go.Terminal.terminals[term]['lineCache'][i] = lineSpan;
        }
        go.Terminal.terminals[term].screenNode = screenSpan;
        if (go.prefs.scrollback == 0) {
            // This ensures the scrollback buffer stays hidden if scrollback is 0
            termPre.style['overflow-y'] = 'hidden';
        } else {
            // Pre-fill the scrollback buffer so terminals stay bottom-aligned when scaled (hard-set rows/columns)
            for (var i=0; i<go.prefs.scrollback; i++) {
                go.Terminal.terminals[term].scrollback[i] = '';
            }
        }
        termPre.appendChild(screenSpan);
        termPre.oncopy = function(e) {
            // Convert to plaintext before copying
            var text = u.getSelText().replace(/\s+$/mg, '\n'),
                selection = window.getSelection(),
                tempTextArea = u.createElement('textarea', {'style': {'left': '-999999px', 'top': '-999999px'}});
            // NOTE: This process doesn't work in Firefox...  It will auto-empty the clipboard if you try.
            if (navigator.userAgent.indexOf('Firefox') != -1) {
                return true; // Firefox doesn't appear to copy formatting anyway so fortunately this function isn't necessary
            }
            tempTextArea.value = text;
            document.body.appendChild(tempTextArea);
            tempTextArea.select();
            setTimeout(function() {
                // Get rid of it once the copy operation is complete
                u.removeElement(tempTextArea);
                go.Terminal.Input.capture(); // Re-focus on the terminal and start accepting keyboard input again
            }, 100);
            return true;
        }
        // Switch to our new terminal if *term* is set (no matter where it is)
        if (trulyNew) {
            // Only slide for terminals that are actually *new* (as opposed to ones that we're re-attaching to)
            setTimeout(slide, 100);
        }
        termSettings['em_dimensions'] = u.getEmDimensions(terminal, where);
        // Tell the server to create a new terminal process
        if (!go.prefs.broadcastTerminal) {
            go.ws.send(JSON.stringify({'terminal:new_terminal': termSettings}));
        }
        // Excute any registered callbacks (DEPRECATED: Use GateOne.Events.on("new_terminal", <callback>) instead)
        if (go.Terminal.newTermCallbacks.length) {
            go.Logging.deprecated("newTermCallbacks", gettext("Use ")+"GateOne.Events.on('terminal:new_terminal', func) "+gettext("instead."));
            go.Terminal.newTermCallbacks.forEach(function(callback) {
                callback(term);
            });
        }
        // Call this whether there's an old scrollback or not because it ensures the terminal stays bottom-aligned wherever it is placed:
        go.Terminal.enableScrollback(term);
        // Fire our new_terminal event if everything was successful
        if (go.Terminal.terminals[term]) {
            go.Terminal.alignTerminal(term);
            E.trigger("terminal:new_terminal", term, trulyNew);
        }
        return term; // So you can call it from your own code and know what terminal number you wound up with
    },
    closeTerminal: function(term, /*opt*/noCleanup, /*opt*/message, /*opt*/sendKill) {
        /**:GateOne.Terminal.closeTerminal(term[, noCleanup[, message[, sendKill]]])

        :param number term: The terminal to close.
        :param boolean noCleanup: If ``true`` the terminal's metadata in localStorage/IndexedDB (i.e. scrollback buffer) will not be removed.
        :param string message: An optional message to display to the user after the terminal is close.
        :param boolean sendKill: If undefined or ``true``, will tell the server to kill the process associated with the given *term* (i.e. close it for real).

        Closes the given terminal (*term*) and tells the server to end its running process.
        */
        logDebug("closeTerminal(" + term + ", " + noCleanup + ", " + message + ", " + sendKill + ")");
        var lastTerm, terms, termNode, shareID,
            termObj = go.Terminal.terminals[term],
            terminalDB = S.dbObject('terminal');
        if (!termObj) {
            return; // Nothing to do
        }
        termNode = go.Terminal.terminals[term].terminal;
        if (!termNode) {
            return; // Nothing to do
        }
        if (message === undefined) {
            message = "Closed term " + term + ": " + go.Terminal.terminals[term].title;
        }
        // Tell the server to kill the terminal
        if (sendKill === undefined || sendKill) {
            if (termObj.shareID) {
                // Check if we're the owner and if so, kill it.  Otherwise detach it.
                shareID = termObj.shareID;
                if (go.Terminal.sharedTerminals[shareID] && go.Terminal.sharedTerminals[shareID].owner == go.User.username) {
                     // We're the owner of this shared terminal; kill it
                    go.Terminal.killTerminal(term);
                } else {
                    go.Terminal.detachSharedTerminal(term);
                }
            } else {
                go.Terminal.killTerminal(term);
            }
        }
        if (!noCleanup) {
            // Delete the associated scrollback buffer (save the world from storage pollution)
            terminalDB.del('scrollback', term);
        }
        // Remove the terminal from the page
        if (termNode) {
            u.removeElement(termNode);
        }
        // Also remove it from working memory
        delete go.Terminal.terminals[term];
        // Now find out what the previous terminal was and move to it
        terms = u.toArray(u.getNodes('.✈terminal'));
        if (message.length) {
            go.Visual.displayMessage(message);
        }
        terms.forEach(function(termObj) {
            lastTerm = termObj;
        });
        // Excute any registered callbacks
        E.trigger("terminal:term_closed", term);
        // Make sure empty workspaces get cleaned up
        E.trigger('go:cleanup_workspaces');
        if (go.Terminal.closeTermCallbacks.length) {
            go.Terminal.closeTermCallbacks.forEach(function(callback) {
                go.Logging.deprecated("closeTermCallbacks", gettext("Use ")+"GateOne.Events.on('terminal:term_closed', func) "+gettext("instead."));
                callback(term);
            });
        }
        if (lastTerm) {
            var termNum = lastTerm.id.split('term')[1];
            go.Terminal.switchTerminal(termNum);
        }
    },
    popupTerm: function(/*opt*/term, /*opt*/options, /*opt*/termSettings) {
        /**:GateOne.Terminal.popupTerm([term])

        Opens a dialog with a terminal contained within.  If *term* is given the created terminal will use that number.

        The *options* argument may contain the following:

            :global: If ``true`` the dialog will be appended to `GateOne.node` (e.g. #gateone) instead of the current workspace.
            :where: If provided the popup terminal will be placed within the given element.

        If the terminal inside the dialog ends it will be closed automatically.  If the user closes the dialog the terminal will be closed automatically as well.

        If *termSettings* are provided they will be passed to :js:func:`GateOne.Terminal.newTerminal` when called.
        */
        term = term || go.Terminal.lastTermNumber + 1;
        options = options || {};
        var content = u.createElement('div', {'class': '✈termdialog', 'style': {'top': 0, 'bottom': 0, 'left': 0, 'right': 0, 'width': '100%', 'height': '100%'}}),
            closeFunc = function(dialogContainer) {
                go.Terminal.closeTerminal(term);
            },
            resizeFunc = function(dialogContainer) {
                // popup terminals need a moment before they're ready for a dimensions check
                t.sendDimensions(term);
                setTimeout(function() {
                    t.alignTerminal(term);
                }, 50);
                /* Why the second call the same exact function?  The first one works 90% of the time and is so quick as to be imperceptable.
                   Sometimes it happens before the browser is ready (my best guess anyway) and something goes wrong in the calculation (it fails gracefully by not adjusting anything).
                   In the latter case we have a follow-up call that will fix it.  If the calculation is exactly the same nothing will happen. */
                setTimeout(function() {
                    t.alignTerminal(term);
                }, 250);
            },
            currentWorkspace = localStorage[prefix+'selectedWorkspace'],
            where = options.where || u.getNode('#'+prefix+'workspace'+currentWorkspace),
            closeDialog,
            termQuitFunc = function(termNum) {
                if (termNum == term) {
                    closeDialog();
                    E.off('terminal:term_closed', termQuitFunc);
                }
            };
        termSettings = termSettings || {};
        if (!where) { // If the location cannot be found just make a global pop-up terminal
            options.global = true;
        }
        if (options.global) {
            where = go.node;
        }
        where = u.getNode(where);
        closeDialog = v.dialog("Pop-up Terminal", content, {'where': where, 'events': {'closed': closeFunc, 'resized': resizeFunc}, 'style': {'width': '60%', 'height': '50%'}, 'class': '✈popupterm'});
        E.on('terminal:term_closed', termQuitFunc);
        termSettings.noAdjust = true;
        termSettings.metadata = termSettings.metadata || {};
        termSettings.metadata.resumeEvent = "terminal:resume_popup";
        termSettings.metadata.where = where.id || where.className;
        termSettings.style = termSettings.style || {};
        termSettings.style.width = '100%';
        termSettings.style.height = '100%';
//         go.Terminal.newTerminal(term, {'noAdjust': true, 'metadata': {'resumeEvent': "terminal:resume_popup", 'where': where.id || where.className}, 'style': {'width': '100%', 'height': '100%'}}, content);
        go.Terminal.newTerminal(term, termSettings, content);
        setTimeout(function() {
            // popup terminals need a moment before they're ready for a dimensions check
            t.sendDimensions(term);
            setTimeout(function() {
                t.alignTerminal(term);
            }, 500); // The first one needs extra time in case of a resume situation (which can be CPU intensive)
        }, 50);
    },
    setTerminal: function(term) {
        /**:GateOne.Terminal.setTerminal(term)

        Sets the 'selectedTerminal' value in `localStorage` and sends the 'terminal:set_terminal' WebSocket action to the server to let it know which terminal is currently active.

        This function triggers the 'terminal:set_terminal' event passing the terminal number as the only argument.
        */
        if (!term) {
            logError("GateOne.Terminal.setTerminal() " + gettext("got an invalid term number: ") + term);
            return;
        }
        var term = parseInt(term); // Sometimes it will be a string
        localStorage[prefix+'selectedTerminal'] = term;
        go.ws.send(JSON.stringify({'terminal:set_terminal': term}));
        E.trigger('terminal:set_terminal', term);
    },
    switchTerminal: function(term) {
        /**:GateOne.Terminal.switchTerminal(term)

        Calls `GateOne.Terminal.setTerminal(*term*)` then triggers the 'terminal:switch_terminal' event passing *term* as the only argument.
        */
        if (!term) {
            return true; // Sometimes this can happen if certain things get called a bit too early or out-of-order.  Not a big deal since everything will catch up eventually.
        }
        if (!go.Terminal.terminals[term]) {
            return true; // This can happen if the user clicks on a terminal in the moments before it has completed initializing.
        }
        var selectedTerm = localStorage[prefix+'selectedTerminal'],
            displayText = term + ": " + go.Terminal.terminals[term].title;
        // Always call capture()
        go.Terminal.Input.capture();
        // Always run setActive()
        go.Terminal.setActive(term);
        go.Terminal.setTitle(term, displayText);
        if (term == selectedTerm) {
            return true; // Nothing to do
        }
        logDebug('switchTerminal('+term+')');
        go.Terminal.setTerminal(term);
        E.trigger('terminal:switch_terminal', term);
    },
    setActive: function(/*opt*/term) {
        /**:GateOne.Terminal.setActive([term])

        Removes the '✈inactive' class from the given *term*.

        If *term* is not given the currently-selected terminal will be used.
        */
        logDebug('setActive('+term+')');
        term = term || localStorage[prefix+'selectedTerminal'];
        var terms = u.toArray(u.getNodes('.✈terminal')),
            termNode;
        if (go.Terminal.terminals[term] && go.Terminal.terminals[term].terminal) {
            termNode = go.Terminal.terminals[term].terminal;
            terms.forEach(function(terminalNode) {
                if (terminalNode == termNode) {
                    terminalNode.classList.remove('✈inactive');
                } else {
                    terminalNode.classList.add('✈inactive');
                }
            });
        }
    },
    isActive: function() {
        /**:GateOne.Terminal.isActive()

        Returns ``true`` if a terminal is the current application (selected by the user)
        */
        var currentWorkspace = localStorage[prefix+'selectedWorkspace'],
            termFound = false;
        // TODO: Make this switch to the appropriate terminal when multiple terminals share the same workspace (FUTURE)
        for (var term in go.Terminal.terminals) {
            // Only want terminals which are integers; not the 'count()' function
            if (term % 1 === 0) {
                if (go.Terminal.terminals[term].workspace == currentWorkspace) {
                    // At least one terminal is on this workspace; check if it is active
                    if (!go.Terminal.terminals[term].node.classList.contains('✈inactive')) {
                        termFound = term; // Terminals that don't contain '✈inactive' are active
                    }
                }
            }
        };
        return termFound;
    },
    switchTerminalEvent: function(term) {
        /**:GateOne.Terminal.switchTerminalEvent(term)

        This gets attached to the 'terminal:switch_terminal' event in :js:meth:`GateOne.Terminal.init`; performs a number of actions whenever the user changes the current terminal.
        */
        logDebug('switchTerminalEvent('+term+')');
        var termNode,
            termTitleH2 = u.getNode('#'+prefix+'termtitle'),
            displayText = "Gate One",
            setActivityCheckboxes = function(term) {
                var monitorInactivity = u.getNode('#'+prefix+'monitor_inactivity'),
                    monitorActivity = u.getNode('#'+prefix+'monitor_activity');
                if (monitorInactivity) {
                    monitorInactivity.checked = go.Terminal.terminals[term].inactivityTimer;
                }
                if (monitorActivity) {
                    monitorActivity.checked = go.Terminal.terminals[term].activityNotify;
                }
            },
            setEncodingValue = function(term) {
                var infoPanelEncoding = u.getNode('#'+prefix+'encoding');
                if (infoPanelEncoding) {
                    infoPanelEncoding.value = go.Terminal.terminals[term]['encoding'];
                }
            },
            setKeyboardValue = function(term) {
                var infoPanelKeyboard = u.getNode('#'+prefix+'keyboard');
                if (infoPanelKeyboard) {
                    infoPanelKeyboard.value = go.Terminal.terminals[term]['keyboard'];
                }
            };
        if (!go.Terminal.terminals[term]) {
            return;
        }
        termNode = go.Terminal.terminals[term].terminal;
        if (termNode) {
            displayText = term + ": " + go.Terminal.terminals[term].title;
            termTitleH2.innerHTML = displayText;
            setActivityCheckboxes(term);
            setEncodingValue(term);
            setKeyboardValue(term);
            // Wrapping this in a timeout seems to resolve the issue where sometimes it isn't scrolled to the bottom when you switch
            setTimeout(function() {
                if (go.Terminal.terminals[term].node) {
                    u.scrollToBottom(go.Terminal.terminals[term].node);
                }
            }, 50);
        } else {
            return; // This can happen if the terminal closed before a timeout completed.  Not a big deal, ignore
        }
        go.User.setActiveApp('Terminal');
        go.Terminal.displayTermInfo(term);
    },
    switchWorkspaceEvent: function(workspace) {
        /**:GateOne.Terminal.switchWorkspaceEvent(workspace)

        Called whenever Gate One switches to a new workspace; checks whether or not this workspace is home to a terminal and calls switchTerminalEvent() on said terminal (to make sure input is enabled and it is scrolled to the bottom).
        */
        logDebug('GateOne.Terminal.switchWorkspaceEvent('+workspace+')');
        var termFound = false;
        // TODO: Make this switch to the appropriate terminal when multiple terminals share the same workspace (FUTURE)
        if (go.User.activeApplication == 'Terminal') {
            for (var term in go.Terminal.terminals) {
                // Only want terminals which are integers; not the 'count()' function
                if (term % 1 === 0) {
                    if (go.Terminal.terminals[term].workspace == workspace) {
                        // At least one terminal is on this workspace
                        go.Terminal.switchTerminal(term);
                        termFound = term;
                    }
                }
            };
            go.Terminal.switchedWorkspace = true;
            setTimeout(function() {
                // Need a mechanism to inform GateOne.Input.disableCapture() that we just switched to this workspace and no matter what sort of event bubbles up from a click (or whatever) that will cause a blur should be ignored.
                go.Terminal.switchedWorkspace = false;
            }, 100);
            go.Terminal.showIcons();
        } else {
            go.Terminal.Input.disableCapture(null, true);
            go.Terminal.hideIcons();
        }
    },
    workspaceClosedEvent: function(workspace) {
        /**:GateOne.Terminal.workspaceClosedEvent(workspace)

        Attached to the `go:close_workspace` event; closes any terminals that are attached to the given *workspace*.
        */
        logDebug('workspaceClosedEvent: ' + workspace);
        for (var term in go.Terminal.terminals) {
            // Only want terminals which are integers; not the 'count()' function
            if (term % 1 === 0) {
                if (go.Terminal.terminals[term].workspace == workspace) {
                    // At least one terminal is on this workspace
                    go.Terminal.closeTerminal(term);
                }
            }
        }
    },
    swappedWorkspacesEvent: function(ws1, ws2) {
        /**:GateOne.Terminal.swappedWorkspacesEvent(ws1, ws2)

        Attached to the `go:swapped_workspaces` event; updates `GateOne.Terminal.terminals` with the correct workspace attributes if either contains terminals.
        */
        var term1, term2, temp;
        for (var term in go.Terminal.terminals) {
            // Only want terminals which are integers; not the 'count()' function
            if (term % 1 === 0) {
                if (go.Terminal.terminals[term].workspace == ws1) {
                    // This is now ws2
                    term1 = term;
                } else if (go.Terminal.terminals[term].workspace == ws2) {
                    // This is now ws1
                    term2 = term;
                }
            }
        };
        go.Terminal.terminals[term1].workspace = ws2;
        go.Terminal.terminals[term2].workspace = ws1;
        // Now swap the terminal numbers as well
        temp = go.Terminal.terminals[term1];
        go.Terminal.terminals[term1] = go.Terminal.terminals[term2];
        go.Terminal.terminals[term2] = temp;
        u.scrollToBottom(go.Terminal.terminals[term1].node);
        u.scrollToBottom(go.Terminal.terminals[term2].node);
        // Lastly we tell the server about this change so if the user resumes their session the ordering will remain
        go.ws.send(JSON.stringify({'terminal:swap_terminals': {'term1': term1, 'term2': term2}}));
        // Force input events to be re-attached
        go.Terminal.Input.disableCapture();
        go.Terminal.Input.capture();
    },
    printScreen: function(term) {
        /**:GateOne.Terminal.printScreen(term)

        Prints *just* the screen (no scrollback) of the given *term*.  If *term* is not provided the currently-selected terminal will be used.
        */
        var term = term || localStorage[prefix+'selectedTerminal'],
            scrollbackHTML = "",
            scrollbackNode = go.Terminal.terminals[term].scrollbackNode;
//         if (scrollbackNode) {
//             scrollbackHTML = scrollbackNode.innerHTML;
//             scrollbackNode.innerHTML = ""; // Empty it out
//         }
        // The print dialog does strange things to the order of things in terms of input/key events so we have to temporarily disableCapture()
        go.Terminal.Input.disableCapture();
        window.print();
//         if (scrollbackNode) {
//             scrollbackNode.innerHTML = scrollbackHTML; // Put it back
//         }
        // Re-enable capturing of keyboard input
        go.Terminal.Input.capture();
        setTimeout(function() {
            go.Terminal.Input.inputNode.value = ""; // Empty it because there's a good chance it will contain 'p'
            go.Terminal.alignTerminal(term); // Fix any alignment issues
        }, 1500);
    },
    hideIcons: function() {
        /**:GateOne.Terminal.hideIcons()

        Hides the Terminal's toolbar icons (i.e. when another application is running).
        */
        u.removeElement('#'+prefix+'icon_info');
    },
    showIcons: function() {
        /**:GateOne.Terminal.showIcons()

        Shows (unhides) the Terminal's toolbar icons (i.e. when another application is running).
        */
        var toolbarInfo = u.createElement('div', {'id': 'icon_info', 'class': '✈toolbar_icon', 'title': gettext("Terminal Application Panel")}),
            existing = u.getNode('#'+prefix+'icon_info'),
            toolbarPrefs = u.getNode('#'+prefix+'icon_prefs'),
            showInfo = function() {
                var term = localStorage[prefix+'selectedTerminal'],
                    termObj = go.Terminal.terminals[term];
                u.getNode('#'+prefix+'term_time').innerHTML = termObj['created'].toLocaleString() + "<br />";
                u.getNode('#'+prefix+'rows').innerHTML = termObj.rows + "<br />";
                u.getNode('#'+prefix+'columns').innerHTML = termObj.columns + "<br />";
                v.togglePanel('#'+prefix+'panel_info');
            };
        if (!existing) {
            toolbarInfo.innerHTML = go.Icons.terminal;
            toolbarInfo.onclick = showInfo;
            go.toolbar.insertBefore(toolbarInfo, toolbarPrefs);
        }
    },
    loadBell: function(message) {
        // Loads the bell sound into the page as an <audio> element using the given *audioDataURI*.
        var audioDataURI = message['data_uri'],
            mimetype = message['mimetype'],
            existing = u.getNode('#'+go.prefs.prefix+'bell'),
            audioElem = u.createElement('audio', {'id': 'bell', 'preload': 'auto'}),
            sourceElem = u.createElement('source', {'id': 'bell_source', 'type': mimetype});
        if (existing) {
            u.removeElement(existing);
        }
        sourceElem.src = audioDataURI;
        audioElem.appendChild(sourceElem);
        go.node.appendChild(audioElem);
        // Cache it so we don't have to re-download it every time.
        go.prefs.bellSound = audioDataURI;
        go.prefs.bellSoundType = mimetype;
        go.Terminal.bellNode = audioElem; // For quick reference later
        u.savePrefs(true);
    },
    uploadBellDialog: function() {
        // Displays a dialog/form where the user can upload a replacement bell sound or use the default
        var playBell = u.createElement('button', {'id': 'play_bell', 'value': 'play_bell', 'class': '✈button ✈black'}),
            defaultBell = u.createElement('button', {'id': 'default_bell', 'value': 'default_bell', 'class': '✈button ✈black', 'style': {'float': 'right'}}),
            uploadBellForm = u.createElement('form', {'name': prefix+'upload_bell_form', 'class': '✈upload_bell_form'}),
            bellFile = u.createElement('input', {'type': 'file', 'id': 'upload_bell', 'name': prefix+'upload_bell'}),
            bellFileLabel = u.createElement('label'),
            row1 = u.createElement('div', {'style': {'margin-top': '0.5em'}}), row2 = row1.cloneNode(false), row3 = row1.cloneNode(false),
            submit = u.createElement('button', {'id': 'submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black', 'style': {'float': 'right'}}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black', 'style': {'float': 'right'}});
        submit.innerHTML = gettext("Submit");
        cancel.innerHTML = gettext("Cancel");
        defaultBell.innerHTML = gettext("Reset Bell to Default");
        playBell.innerHTML = gettext("Play Current Bell");
        playBell.onclick = function(e) {
            e.preventDefault();
            go.Terminal.playBell();
        }
        bellFileLabel.innerHTML = gettext("Select a Sound File");
        bellFileLabel.htmlFor = prefix+'upload_bell';
        row1.appendChild(playBell);
        row1.appendChild(defaultBell);
        row2.appendChild(bellFileLabel);
        row2.appendChild(bellFile);
        row2.style['text-align'] = 'center';
        uploadBellForm.appendChild(row1);
        uploadBellForm.appendChild(row2);
        row3.classList.add('✈centered_buttons');
        row3.appendChild(submit);
        row3.appendChild(cancel);
        uploadBellForm.appendChild(row3);
        var closeDialog = go.Visual.dialog(gettext('Upload Bell Sound'), uploadBellForm, {'class': '✈prefsdialog', 'style': {'width': '25em'}});
        cancel.onclick = closeDialog;
        defaultBell.onclick = function(e) {
            e.preventDefault();
            go.ws.send(JSON.stringify({'terminal:get_bell': null}));
            closeDialog();
        }
        uploadBellForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var bellFile = u.getNode('#'+prefix+'upload_bell').files[0],
                bellReader = new FileReader(),
                saveBell = function(evt) {
                    var dataURI = evt.target.result,
                        mimetype = bellFile.type;
                    go.Terminal.loadBell({'mimetype': mimetype, 'data_uri': dataURI});
                };
            // Get the data out of the files
            bellReader.onload = saveBell;
            bellReader.readAsDataURL(bellFile);
            closeDialog();
        }
    },
    bellAction: function(bellObj) {
        /**:GateOne.Terminal.bellAction(bellObj)

        Attached to the 'terminal:bell' WebSocket action; plays a bell sound and pops up a message indiciating which terminal issued a bell.
        */
        var term = bellObj.term;
        go.Terminal.playBell();
        v.displayMessage(gettext("Bell in: ") + term + ": " + go.Terminal.terminals[term].title);
    },
    playBell: function() {
        /**:GateOne.Terminal.playBell()

        Plays the bell sound without any visual notification.
        */
        if (go.Terminal.bellNode) {
            if (go.prefs.audibleBell) {
                go.Terminal.bellNode.play();
            }
        }
    },
    updateDimensions: function() {
        /**:GateOne.Terminal.updateDimensions()

        This gets attached to the "go:update_dimensions" event which gets called whenever the window is resized.  It makes sure that all the terminal containers are of the correct dimensions.
        */
//         var terms = u.toArray(u.getNodes('.✈terminal')),
//             wrapperDiv = u.getNode('#'+prefix+'gridwrapper');
//         if (wrapperDiv) {
//             if (terms.length) {
//                 terms.forEach(function(termObj) {
//                     termObj.style.height = go.Visual.goDimensions.h + 'px';
//                     termObj.style.width = go.Visual.goDimensions.w + 'px';
//                 });
//             }
//         }
    },
    enableScrollback: function(/*Optional*/term) {
        /**:GateOne.Terminal.enableScrollback([term])

        Replaces the contents of the selected/active terminal scrollback buffer with the complete latest scrollback buffer from `GateOne.Terminal.terminals[*term*]`.

        If *term* is given, only ensable scrollback for that terminal.
        */
        logDebug('enableScrollback(' + term + ')');
        if (go.prefs.scrollback == 0) {
            return; // Don't re-enable scrollback if it has been disabled
        }
        if (u.getSelText()) {
            // Don't re-enable the scrollback buffer if the user is selecting text (so we don't clobber their highlight)
            // Retry again in a bit
            clearTimeout(go.Terminal.terminals[term].scrollbackTimer);
            go.Terminal.terminals[term].scrollbackTimer = setTimeout(function() {
                go.Terminal.enableScrollback(term);
            }, 500);
            return;
        }
        var enableSB = function(termNum) {
            if (!go.Terminal.terminals[termNum]) { // The terminal was just closed
                return; // We're done here
            }
            var termPre = go.Terminal.terminals[termNum].node,
                termScreen = go.Terminal.terminals[termNum].screenNode,
                termScrollback = go.Terminal.terminals[termNum].scrollbackNode,
                parentHeight;
            if (termPre) {
                parentHeight = termPre.parentNode.clientHeight;
            }
            // Only set the height of the terminal if we could measure it (depending on the CSS the parent element might have a height of 0)
//             if (parentHeight) {
//                 termPre.style.height = parentHeight + 'px';
//             }
            termPre.style['overflow-y'] = ""; // Allow the class to control this (will be auto)
            if (termScrollback) {
                var scrollbackHTML = go.Terminal.terminals[termNum].scrollback.join('\n') + '\n';
                if (termScrollback.innerHTML != scrollbackHTML) {
                    termScrollback.innerHTML = scrollbackHTML;
                }
                termScrollback.style.display = ''; // Reset
            } else {
                // Create the span that holds the scrollback buffer
                termScrollback = u.createElement('span', {'id': 'term'+termNum+'scrollback', 'class': '✈scrollback'});
                termScrollback.innerHTML = go.Terminal.terminals[termNum].scrollback.join('\n') + '\n';
                termPre.insertBefore(termScrollback, termScreen);
                go.Terminal.terminals[termNum].scrollbackNode = termScrollback;
            }
            u.scrollToBottom(termPre);
            if (go.Terminal.terminals[termNum].scrollbackTimer) {
                clearTimeout(go.Terminal.terminals[termNum].scrollbackTimer);
            }
            go.Terminal.terminals[termNum].scrollbackVisible = true;
        };
        if (term && term in GateOne.Terminal.terminals) {
            // If there's a terminal node ready-to-go for scrollback...
            if (go.Terminal.terminals[term].node) {
                enableSB(term); // Have it create/add the scrollback buffer
            }
        } else {
            var terms = u.toArray(u.getNodes('.✈terminal'));
            terms.forEach(function(termObj) {
                var termNum = termObj.id.split(prefix+'term')[1];
                if (termNum in GateOne.Terminal.terminals) {
                    enableSB(termNum);
                }
            });
            return;
        }
        go.Terminal.scrollbackToggle = true;
        E.trigger("terminal:scrollback:enabled", term);
    },
    disableScrollback: function(/*Optional*/term) {
        logDebug("disableScrollback()");
        // Replaces the contents of the selected terminal with just the screen (i.e. no scrollback)
        // If *term* is given, only disable scrollback for that terminal
        if (term) {
            var termPre = GateOne.Terminal.terminals[term].node,
                termScrollback = go.Terminal.terminals[term].scrollbackNode;
            if (termScrollback) {
                termScrollback.style.display = "none";
            }
            termPre.style['overflow-y'] = "hidden";
            go.Terminal.terminals[term].scrollbackVisible = false;
        } else {
            var terms = u.toArray(u.getNodes('.✈terminal'));
            terms.forEach(function(termObj) {
                var termID = termObj.id.split(prefix+'term')[1],
                    termScrollback = go.Terminal.terminals[termID].scrollbackNode;
                if (termScrollback) {
                    termScrollback.style.display = "none";
                }
                go.Terminal.terminals[termID].scrollbackVisible = false;
            });
        }
        go.Terminal.scrollbackToggle = false;
        E.trigger("terminal:scrollback:disabled", term);
    },
    toggleScrollback: function() {
        /**:GateOne.Terminal.toggleScrollback()

        Enables or disables the scrollback buffer (to hide or show the scrollbars).
        */
        logDebug("toggleScrollback()");
        // Why bother?  The translate() effect is a _lot_ smoother without scrollbars.  Also, full-screen applications that regularly update the screen can really slow down if the entirety of the scrollback buffer must be updated along with the current view.
        var t = GateOne.Terminal;
        if (t.scrollbackToggle) {
            t.enableScrollback();
            t.scrollbackToggle = false;
        } else {
            t.disableScrollback();
            t.scrollbackToggle = true;
        }
    },
    clearScrollback: function(term) {
        /**:GateOne.Terminal.clearScrollback(term)

        Empties the scrollback buffer for the given *term* in memory, in localStorage, and in the DOM.
        */
        var scrollbackNode = go.Terminal.terminals[term].scrollbackNode,
            terminalDB = S.dbObject('terminal');
        go.Terminal.terminals[term].scrollback = [];
        terminalDB.del('scrollback', term);
        if (scrollbackNode) {
            scrollbackNode.innerHTML = '';
        }
    },
    clearScreen: function(term) {
        /**:GateOne.Terminal.clearScreen(term)

        Clears the screen of the given *term* in memory and in the DOM.

        .. note:: The next incoming screen update from the server will likely re-populate most if not all of the screen.
        */
        logDebug('clearScreen('+term+')');
        var screenLength = go.Terminal.terminals[term]['screen'].length,
            screenNode = go.Terminal.terminals[term].screenNode,
            emptyScreen = [];
        for (var i=0; i < screenLength; i++) {
            emptyScreen[i] = ' '; // Using a space so that applyScreen doesn't ignore these lines
        }
        go.Terminal.applyScreen(emptyScreen, term);
    },
    getLocations: function() {
        /**:GateOne.Terminal.getLocations()

        Sends the `terminal:get_locations` WebSocket action to the server.  This will ultimately trigger the :js:meth:`GateOne.Terminal.locationsAction` function.
        */
        go.ws.send(JSON.stringify({'terminal:get_locations': null}));
    },
    locationsAction: function(locations) {
        /**:GateOne.Terminal.locationsAction(locations)

        Attached to the `terminal:term_locations` WebSocket action, triggers the `terminal:term_locations` event (in case someone wants to do something with that information).
        */
        E.trigger("terminal:term_locations", locations);
    },
    relocateWorkspaceEvent: function(workspace, location) {
        /**:GateOne.Terminal.relocateWorkspaceEvent(workspace, location)

        Attached to the `go:relocate_workspace` event; calls :js:meth:`GateOne.Terminal.relocateTerminal` if the given *workspace* has a terminal contained within it.
        */
        var termFound = false;
        // TODO: Make this work properly when multiple terminals share the same workspace (FUTURE)
        for (var term in go.Terminal.terminals) {
            // Only want terminals which are integers; not the 'count()' function
            if (term % 1 === 0) {
                if (go.Terminal.terminals[term].workspace == workspace) {
                    // At least one terminal is on this workspace
                    go.Terminal.relocateTerminal(term, location);
                    termFound = true;
                }
            }
        };
    },
    relocateTerminal: function(term, location) {
        /**:GateOne.Terminal.relocateTerminal(term, location)

        :param number term: The number of the terminal to move (e.g. 1).
        :param string location: The 'location' where the terminal will be moved (e.g. 'window2').

        Moves the given *term* to the given *location* (aka window) by sending
        the appropriate message to the Gate One server.
        */
        var settings = {
            'term': term,
            'location': location
        }
        go.ws.send(JSON.stringify({'terminal:move_terminal': settings}));
    },
    changeLocation: function(location, /*opt*/settings) {
        /**:GateOne.Terminal.changeLocation(location[, settings])

        Attached to the `go:set_location` event, removes all terminals from the current view and opens up all the terminals at the new *location*.  If there are currently no terminals at *location* a new terminal will be opened automatically.

        To neglect opening a new terminal automatically provide a settings object like so:

            >>> GateOne.Terminal.changeLocation('window2', {'new_term': false}`);
        */
        var terms = u.toArray(u.getNodes('.✈terminal'));
        terms.forEach(function(termObj) {
            // Close all open terminals as quietly as possible
            go.Terminal.closeTerminal(termObj.id.split('term')[1], false, "", false);
        });
    },
    reconnectTerminalAction: function(message) {
        /**:GateOne.Terminal.reconnectTerminalAction(message)

        Called when the server reports that the terminal number supplied via the `terminal:new_terminal` WebSocket action already exists.

        This method also gets called when a terminal is moved from one 'location' to another.
        */
        // NOTE: Might be useful to override if you're embedding Gate One into something else
        logDebug('reconnectTerminalAction(): ', message);
        var term = message.term,
            shareID = message.share_id;
        // This gets called when a terminal is moved from one 'location' to another.  When that happens we need to open it up like it's new...
        if (!go.prefs.embedded) {
            if (!go.Terminal.terminals[term]) {
                go.Terminal.newTerminal(term);
                // Assume the user wants to switch to this terminal immediately
                go.Terminal.switchTerminal(term);
            }
        }
        E.trigger("terminal:reconnect_terminal", message);
        if (shareID && go.Terminal.terminals[term] && !go.Terminal.terminals[term].shareID) {
            go.Terminal.terminals[term].shareID = shareID;
        }
    },
    moveTerminalAction: function(obj) {
        /**:GateOne.Terminal.moveTerminalAction(obj)

        Attached to the `terminal:term_moved` WebSocket Action, closes the given *term* with a slightly different message than closeTerminal().
        */
        var term = obj.term,
            location = obj['location'],
            message = gettext("Terminal: ") + term + gettext(" has been relocated to location: ") + location;
        go.Terminal.closeTerminal(term, false, message, false); // Close the terminal with our special message and don't kill its process
    },
    reattachTerminalsAction: function(terminals) {
        /**:GateOne.Terminal.reattachTerminalsAction(terminals)

        Called after we authenticate to the server, this function is attached to the `terminal:terminals` WebSocket action which is the server's way of notifying the client that there are existing terminals.

        If we're reconnecting to an existing session, running terminals will be recreated/reattached.

        If this is a new session (and we're not in embedded mode), a new terminal will be created.
        */
        var newTermSettings, command, metadata,
            termNumbers = [],
            reattachCallbacks = false,
            terminalDB = S.dbObject('terminal');
        logDebug("reattachTerminalsAction() terminals: ", terminals);
        if (!go.Storage.loadedFiles['font.css']) {
            // Don't do anything until the font.css is loaded so that dimensions can be calculated properly
            setTimeout(function() {
                // Retry in a few ms
                go.Terminal.reattachTerminalsAction(terminals);
            }, 50);
            return;
        }
        // Make an array of terminal numbers
        for (var term in terminals) {
            termNumbers.push(parseInt(term));
        }
        // Clean up the terminal DB
        terminalDB.dump('scrollback', function(objs) {
            for (var i=0; i<objs.length; i++) {
                var termNum = objs[i].term;
                if (termNumbers.indexOf(termNum) == -1) { // Terminal for this buffer no longer exists
                    logDebug("Deleting scollback buffer for non-existent terminal: " + termNum);
                    terminalDB.del('scrollback', termNum);
                }
            }
        });
        if (go.Terminal.reattachTerminalsCallbacks.length || "term_reattach" in E.callbacks) {
            reattachCallbacks = true;
        }
        // This is wrapped in a timeout so the message above will get displayed while it takes place (otherwise the browser will pause while it thinks really hard and then shows the message *and* brings up the terminals at the same time)
        setTimeout(function() {
            if (!go.prefs.embedded && !reattachCallbacks) { // Only perform the default action if not in embedded mode and there are no registered reattach callbacks.
                if (termNumbers.length) {
                    // Reattach the running terminals
                    termNumbers.forEach(function(termNum) {
                        var shareID = terminals[termNum].share_id;
                        if (!go.Terminal.terminals[termNum]) {
                            metadata = terminals[termNum].metadata || {};
                            command = terminals[termNum].command || null;
                            if (metadata.resumeEvent) {
                                E.trigger(metadata.resumeEvent, termNum, terminals[termNum]);
                            } else {
                                go.Terminal.newTerminal(termNum, {'command': command, 'metadata': metadata});
                            }
                            go.Terminal.lastTermNumber = termNum;
                        }
                        if (terminals[termNum].share_id && !go.Terminal.terminals[termNum].shareID) {
                            go.Terminal.terminals[termNum].shareID = shareID;
                        }
                    });
                }
            }
            E.trigger("terminal:term_reattach", termNumbers, terminals); // termNumbers first to maintain backwards compatibility
            if (go.Terminal.reattachTerminalsCallbacks.length) {
                go.Logging.deprecated("reattachTerminalsCallbacks", gettext("Use ") + "GateOne.Events.on('terminal:term_reattach', func) " + gettext("instead."));
                // Call any registered callbacks
                go.Terminal.reattachTerminalsCallbacks.forEach(function(callback) {
                    callback(termNumbers);
                });
            }
        }, 1050);
    },
    recordPanePositions: function() {
        /**:GateOne.Terminal.recordPanePositions()

        Records the position of each terminal in each :js:meth:`GateOne.Visual.Pane` that exists on the page (so they can be resumed properly).
        */
        var rowCount = 0, cellCount = 0;
        u.toArray(u.getNodes('.✈pane')).forEach(function(paneNode) {
            var name = paneNode.getAttribute('data-pane'),
                pane = v.panes[name];
            u.toArray(pane.node.querySelectorAll('.✈pane_row')).forEach(function(row) {
                rowCount += 1;
                u.toArray(pane.node.querySelectorAll('.✈pane_cell')).forEach(function(cell) {
                    cellCount += 1;
                    var terminal = cell.querySelector('.✈terminal'),
                        term, termObj;
                    if (terminal) {
                        term = terminal.getAttribute('data-term');
                        if (term) {
                            termObj = go.Terminal.terminals[term];
                            termObj.metadata.resumeEvent = "terminal:resume_split_pane";
                            termObj.metadata.pane = pane.name;
                            termObj.metadata.panePosition = [rowCount, cellCount];
                        }
                    }
                });
            });
        });
    },
    resumePanePosition: function(term) {
        /**:GateOne.Terminal.resumePanePosition(term)

        Uses ``GateOne.Terminal.terminals[term].metadata.panePosition`` to create a new terminal in that exact spot.  New :js:meth`GateOne.Visual.Pane` objects will be created as necessary to ensure the terminal winds up where it was previously.
        */
        var termObj = go.Terminal.terminals[term],
            name = termObj.metadata.pane,
            row = termObj.metadata.panePosition[0],
            column = termObj.metadata.panePosition[1];

    },
    modes: {
        // Various functions that will be called when a matching mode is set.
        // NOTE: Most mode settings only apply on the server side of things (which is why this is so short).
        '1': function(term, bool) {
            // Application Cursor Mode
            logDebug("Setting Application Cursor Mode to: " + bool + " on term: " + term);
            if (bool) {
                // Turn on Application Cursor Keys mode
                go.Terminal.terminals[term]['mode'] = 'appmode';
            } else {
                // Turn off Application Cursor Keys mode
                go.Terminal.terminals[term]['mode'] = 'default';
            }
        },
        '1000': function(term, bool) {
            // Use Button Event Mouse Tracking (aka SET_VT200_MOUSE)
            logDebug("Setting Button Motion Event Mouse Tracking Mode to: " + bool + " on term: " + term);
            if (bool) {
                // Turn on Button Event Mouse Tracking
                go.Terminal.terminals[term].mouse = 'mouse_button';
            } else {
                // Turn off Button Event Mouse Tracking
                go.Terminal.terminals[term].mouse = false;
            }
        },
        '1002': function(term, bool) {
            // Use Button Motion Event Mouse Tracking (aka SET_BTN_EVENT_MOUSE)
            logDebug("Setting Button Motion Event Mouse Tracking Mode to: " + bool + " on term: " + term);
            if (bool) {
                // Turn on Button Motion Event Mouse Tracking
                go.Terminal.terminals[term].mouse = 'mouse_button_motion';
            } else {
                // Turn off Button Motion Event Mouse Tracking
                go.Terminal.terminals[term].mouse = false;
            }
        }
    },
    setModeAction: function(modeObj) {
        /**:GateOne.Terminal.setModeAction(modeObj)

        Set the given terminal mode (e.g. application cursor mode aka appmode).  *modeObj* is expected to be something like this::

            {'mode': '1', 'term': '1', 'bool': true}
        */
        logDebug("setModeAction modeObj: " + GateOne.Utils.items(modeObj));
        if (!go.Terminal.terminals[modeObj.term]) {
            return; // Terminal was closed
        }
        if (go.Terminal.modes[modeObj.mode]) {
            go.Terminal.modes[modeObj.mode](modeObj.term, modeObj.bool);
        }
    },
    registerTextTransform: function(name, pattern, newString) {
        /**:GateOne.Terminal.registerTextTransform(name, pattern, newString)

        Adds a new or replaces an existing text transformation to GateOne.Terminal.textTransforms using *pattern* and *newString* with the given *name*.  Example::

             var pattern = /(\bIM\d{9,10}\b)/g,
                 newString = "<a href='https://support.company.com/tracker?ticket=$1' target='new'>$1</a>";
             GateOne.Terminal.registerTextTransform("ticketIDs", pattern, newString);

        Would linkify text matching that pattern in the terminal.

        For example, if you typed "Ticket number: IM123456789" into a terminal it would be transformed thusly::

             "Ticket number: <a href='https://support.company.com/tracker?ticket=IM123456789' target='new'>IM123456789</a>"

        Alternatively, a function may be provided instead of *pattern*.  In this case, each line will be transformed like so::

             line = pattern(line);

        .. note:: *name* is only used for reference purposes in the textTransforms object (so it can be removed or replaced later).

        .. tip:: To match the beginning of a line use '\\n' instead of '\^'.  This is necessary because the entire screen is matched at once as opposed to line-by-line.
        */
        var go = GateOne,
            t = go.Terminal;
        if (typeof(pattern) == "object" || typeof(pattern) == "function") {
            pattern = pattern.toString(); // Have to convert it to a string so we can pass it to the Web Worker so Firefox won't freak out
        }
        t.textTransforms[name] = {};
        t.textTransforms[name]['name'] = name;
        t.textTransforms[name]['pattern'] = pattern;
        t.textTransforms[name]['newString'] = newString;
    },
    unregisterTextTransform: function(name) {
        /**:GateOne.Terminal.unregisterTextTransform(name)

            Removes the given text transform from `GateOne.Terminal.textTransforms`.
        */
        delete GateOne.Terminal.textTransforms[name];
    },
    resetTerminalAction: function(term) {
        /**:GateOne.Terminal.resetTerminalAction(term)

        Clears the screen and the scrollback buffer of the given *term* (in memory, localStorage, and in the DOM).
        */
        logDebug("resetTerminalAction term: " + term);
        go.Terminal.clearScrollback(term);
        go.Terminal.clearScreen(term);
    },
    termEncodingAction: function(message) {
        /**:GateOne.Terminal.termEncodingAction(message)

        Handles the 'terminal:encoding' WebSocket action that tells us the encoding that is set for a given terminal.  The expected message format:

        :param string message.term: The terminal in question.
        :param string message['encoding']: The encoding to set on the given terminal.

        .. note:: The encoding value here is only used for informational purposes.  No encoding/decoding happens at the client.
        */
        //console.log('termEncodingAction: ', message);
        var term = message.term,
            encoding = message['encoding'],
            infoPanelEncoding = u.getNode('#'+prefix+'encoding');
        if (!go.Terminal.terminals[term]) {
            return; // Terminal was just closed
        }
        go.Terminal.terminals[term]['encoding'] = encoding;
        infoPanelEncoding.value = encoding;
    },
    termKeyboardModeAction: function(message) {
        /**:GateOne.Terminal.termKeyboardModeAction(message)

        Handles the 'terminal:keyboard_mode' WebSocket action that tells us the keyboard mode that is set for a given terminal.  The expected message format:

        :param string message.term: The terminal in question.
        :param string message['mode']: The keyboard mode to set on the given terminal.  E.g. 'default', 'sco', 'xterm', 'linux', etc

        .. note:: The keyboard mode value is only used by the client.  There's no server-side functionality related to keyboard modes other than the fact that it remembers the setting.
        */
        //console.log('termKeyboardModeAction: ', message);
        var term = message.term,
            mode = message['mode'],
            infoPanelKeyboard = u.getNode('#'+prefix+'keyboard');
        go.Terminal.terminals[term]['keyboard'] = mode;
        infoPanelKeyboard.value = mode;
    },
    xtermEncode: function(number) {
        /**:GateOne.Terminal.xtermEncode(number)

        Encodes the given *number* into a single character using xterm's encoding scheme.  e.g. to convert mouse coordinates for use in an escape sequence.

        The xterm encoding scheme takes the ASCII value of (*number* + 32).  So the number one would be ! (exclamation point), the number two would be " (double-quote), the number three would be # (hash), and so on.

        .. note:: This encoding mechansim has the unfortunate limitation of only being able to encode up to the number 233.
        */
        return String.fromCharCode(number+32);
    },
    highlight: function(text, term) {
        /**:GateOne.Terminal.highlight(text[, term])

        Highlights all occurrences of the given *text* inside the given *term* by wrapping it in a span like so:

        .. code-block:: html

            <span class="✈highlight">text</span>

        If *term* is not provided the currently-selected terminal will be used.
        */
        if (!term) {
            term = localStorage[prefix+'selectedTerminal'];
        }
        var termNode = go.Terminal.terminals[term].node,
            regexText = text.replace(/([.?*+^$[\]\\(){}|\-])/g, "\\$1"),
            pattern = new RegExp(regexText, 'g'),
            repl = '<span class="✈highlight">' + text + '</span>',
            isOrContains = function(node, container) {
                while (node) {
                    if (node === container) {
                        return true;
                    }
                    node = node.parentNode;
                }
                return false;
            },
            elementContainsSelection = function(node) {
                var sel;
                if (window.getSelection) {
                    sel = window.getSelection();
                    return u.isDescendant(node, sel.anchorNode);
                } else if ((sel = document.selection) && sel.type != "Control") {
                    return isOrContains(sel.createRange().parentNode(), node);
                }
                return false;
            },
            recurReplacement = function(node) {
                if (node.nodeType === 3 && node.parentNode) {
                    if (!elementContainsSelection(node.parentNode)) {
                        var replaced = node.nodeValue.replace('<', '&lt;').replace('>', '&gt;').replace(pattern, repl);
                        if (node.nodeValue != replaced) {
                            node.parentNode.innerHTML = node.parentNode.innerHTML.replace(pattern, repl);
                        }
                    }
                } else {
                    u.toArray(node.childNodes).forEach(function(elem) {
                        recurReplacement(elem);
                    });
                }
            };
        recurReplacement(termNode);
    },
    unHighlight: function() {
        /**:GateOne.Terminal.unHighlight()

        Undoes the results of :js:meth:`GateOne.Terminal.highlight`.
        */
        u.toArray(u.getNodes('.✈highlight')).forEach(function(elem) {
            if (elem) {
                var parent = elem.parentNode,
                    textNode = document.createTextNode(elem.innerHTML);
                parent.replaceChild(textNode, elem);
                parent.normalize(); // Join text nodes together so subsequent highlights work
            }
        });
    },
    // NOTE:  highlightTexts and highlightDialog are works-in-progress.
    highlightTexts: {},
        /**:GateOne.Terminal.highlightTexts

        An object that holds all the words the user wishes to stay persistently highlighted (even after screen updates and whatnot) across all terminals.

        .. note:: Word highlighting that is specific to individual terminals is stored in `GateOne.Terminal.terminals[term]`.
        */
    highlightDialog: function() {
        /**:GateOne.Terminal.highlightDialog()

        Opens a dialog where users can add/remove text they would like to be highlighted on a semi-permanent basis (e.g. even after a screen update).
        */
        var closeDialog, // Filled out below
            highlightDesc = '<p style="width: 18em;">'+gettext('Words or phrases you would like to remain persistently highlighted in terminals')+'</p>',
            tr = u.partial(u.createElement, 'tr', {'class': '✈table_row ✈pointer'}),
            td = u.partial(u.createElement, 'td', {'class': '✈table_cell'}),
            container = u.createElement('div', {'class': '✈highlight_dialog'}),
            tableContainer = u.createElement('div', {'style': {'overflow': 'auto', 'height': (go.node.clientHeight/3) + 'px'}}),
            highlightTable = u.createElement('table', {'class': '✈highlight_words'}),
            tbody = u.createElement('tbody'),
            save = u.createElement('button', {'id': 'save', 'type': 'submit', 'value': gettext('Save'), 'class': '✈button ✈black', 'style': {'float': 'right', 'margin-top': '0.5em'}}),
            cancel = u.createElement('button', {'id': 'cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black', 'style': {'float': 'right', 'margin-top': '0.5em'}}),
            addWords = function(highlightObj) {
                for (var word in highlightObj) {
                    var term = highlightObj[word].term,
                        globalVal = highlightObj[word]['global'],
                        row = tr(),
                        textTD = u.createElement('td', {'class': '✈table_cell ✈highlight_word'}),
                        termTD = td(),
                        termInput = u.createElement('input', {'type': 'text', 'name': 'term'}),
                        globalTD = td(),
                        deleteTD = td(),
                        globalCheck = u.createElement('input', {'type': 'checkbox', 'name': 'global'});
                    textTD.innerHTML = upn;
                    termInput.value = term;
                    deleteTD.innerHTML = '<a onclick="GateOne.Terminal.unhighlightWord();">'+gettext('Remove')+'</a>';
                    row.appendChild(textTD);
                    row.appendChild(termTD);
                    globalTD.appendChild(globalCheck);
                    row.appendChild(globalTD);
                    row.appendChild(deleteTD);
                    tbody.appendChild(row);
                }
                closeDialog = v.dialog(gettext("Word Highlighting in Terminal: ") + term, container, {'class': '✈prefsdialog'});
                cancel.onclick = closeDialog;
            },
            saveFunc = function() {
                var rows = u.toArray(u.getNodes('.✈highlight_dialog tbody tr'));
                rows.forEach(function(row) {
                    var text = row.querySelector('.✈highlight_word').innerHTML,
                        term = row.querySelector('input[name="term"]').value;
                        global = row.querySelector('input[name="global"]').checked;
                    if (global) {
                        // Clear any existing matching global higlight text
                        E.off("terminal:term_updated", null, 'global_highlight:' + text); // Using a string as the context (aka 'this') is a cool hack :)
                        E.on("terminal:term_updated", u.partial(go.Terminal.highlight, text), 'global_highlight:' + text);
                    } else {
                        var context = 'highlight:' +term + ":" + text;
                        // Clear any existing matching highlight for the current terminal
                        E.off("terminal:term_updated", null, context);
                        E.on("terminal:term_updated", u.partial(go.Terminal.highlight, text), context);
                    }
                });
            };
        save.innerHTML = gettext("Save");
        cancel.innerHTML = gettext("Cancel");
        save.addEventListener('click', saveFunc, false);
        highlightTable.innerHTML = "<thead><tr class='✈table_row'><th>"+gettext("Word")+"</th><th>"+gettext("Global")+"</th><th>"+gettext("Remove")+"</th></tr></thead>";
        highlightTable.appendChild(tbody);
        container.innerHTML = highlightDesc;
        tableContainer.appendChild(highlightTable);
        container.appendChild(tableContainer);
        container.appendChild(save);
        container.appendChild(cancel);
    },
    showSuspended: function() {
        /**:GateOne.Terminal.showSuspended()

        Displays a little widget in the terminal that indicates that output has been suspended.
        */
        var suspendedWidget = u.createElement('div', {'id': 'widget_suspended', 'style': {'width': '20em', 'height': '4em', 'position': 'static', 'border': '1px #ccc solid', 'background-color': 'white', 'opacity': '0.7'}});
        suspendedWidget.innerHTML = go.Terminal.outputSuspended;
        v.widget(gettext('Terminal Output Suspended'), suspendedWidget);
    },
    scrollPageUp: function(term) {
        /**:GateOne.Terminal.scrollPageUp([term])

        Scrolls the given *term* one page up.  If *term* is not given the currently-selected terminal will be used.
        */
        if (!term) {
            term = localStorage[prefix+'selectedTerminal'];
        }
        var termNode = go.Terminal.terminals[term].node,
            lines = parseInt(go.Terminal.terminals[term].rows);
        u.scrollLines(termNode, -lines);
    },
    scrollPageDown: function(term) {
        /**:GateOne.Terminal.scrollPageDown([term])

        Scrolls the given *term* one page up.  If *term* is not given the currently-selected terminal will be used.
        */
        if (!term) {
            term = localStorage[prefix+'selectedTerminal'];
        }
        var termNode = go.Terminal.terminals[term].node,
            lines = parseInt(go.Terminal.terminals[term].rows);
        u.scrollLines(termNode, lines);
    },
    // NOTE:  Everything below this point is a work in progress.
    chooser: function() {
        /**:GateOne.Terminal.chooser()

        Pops up a dialog where the user can immediately switch to any terminal in any 'location'.

        .. note:: If the terminal is in a different location the current location will be changed along with all terminals before the switch is made.
        */
    },
    sharePermissions: function(term, permissions) {
        /**:GateOne.Terminal.sharePermissions(term, permissions)

        Sets the sharing *permissions* of the given *term*.  The *permissions* must be an object that contains one or both of the following:

            :read: An array of users that will be given read-only access to the given *term*.
            :write: An array of users that will be given write access to the given *term*.

        .. note:: *read* and *write* may be given as a string if only one user's permissions are being modified.

        Example:

            >>> GateOne.Terminal.sharePermissions(1, {'read': 'AUTHENTICATED', 'write': ["bob@company", "joe@company"]);

        .. note:: If a user is granted write permission to a terminal they will automatically be granted read permission.
        */
        logDebug('GateOne.Terminal.sharePermissions(): ', permissions);
        var settings = {'term': term, 'read': permissions.read, 'write': permissions.write, 'password': permissions['password']};
        if (permissions.broadcast !== undefined) {
            settings.broadcast = permissions.broadcast;
        }
        go.ws.send(JSON.stringify({"terminal:permissions": settings}));
        E.trigger("terminal:permissions", settings);
    },
    shareDialog: function(term) {
        /**:GateOne.Terminal.shareDialog(term)

        Opens a dialog where the user can share a terminal or modify the permissions on a terminal that is already shared.
        */
        var closeDialog, // Filled out below
            anonDesc = gettext('Anyone (Broadcast)'),
            authenticatedDesc = gettext('Authenticated Users'),
            container = u.createElement('div', {'class': '✈share_dialog'}),
            tableContainer = u.createElement('div', {'style': {'overflow': 'auto', 'height': (go.node.clientHeight / 3) + 'px'}}),
            shareIDExplanation = gettext("The Share ID is used to generate the broadcast URL."),
            shareIDLabel = u.createElement('label'),
            shareIDInput = u.createElement('input', {'type': 'text', 'id': 'share_id', 'class': '✈share_id', 'placeholder': gettext('Auto')}),
            broadcastURLLabel = u.createElement('label'),
            broadcastURLInput = u.createElement('input', {'type': 'text', 'id': 'broadcast_url', 'class': '✈broadcast_url', 'placeholder': gettext('Broadcast disabled')}),
            passwordLabel = u.createElement('label'),
            password = u.createElement('input', {'type': 'text', 'id': 'share_password', 'class': '✈share_password', 'placeholder': gettext('Optional: Password-protect this shared terminal')}),
            buttonContainer = u.createElement('div', {'class': '✈centered_buttons'}),
            apply = u.createElement('button', {'id': 'apply', 'type': 'submit', 'value': gettext('Apply'), 'class': '✈button ✈black', 'style': {'float': 'right', 'margin-top': '0.5em'}}),
            done = u.createElement('button', {'id': 'done', 'type': 'reset', 'value': gettext('Done'), 'class': '✈button ✈black', 'style': {'float': 'right', 'margin-top': '0.5em'}}),
            newShareID = u.createElement('button', {'id': 'new_share_id', 'type': 'submit', 'value': gettext('New Sharing ID'), 'title': gettext("Generate a new share ID (the last part of the broadcast URL)"), 'class': '✈button ✈black', 'style': {'float': 'right', 'margin-top': '0.5em'}}),
            shareObj = go.Terminal.sharedTermObj(term),
            writeCheckFunc = function() {
                var read = this.parentNode.parentNode.querySelector('input[name="read"]');
                if (this.checked) {
                    read.checked = true;
                }
                apply.style.display = '';
            },
            readCheckFunc = function() {
                var write = this.parentNode.parentNode.querySelector('input[name="write"]');
                if (!this.checked) {
                    write.checked = false;
                }
                apply.style.display = '';
            },
            addUsers = function(userList) {
                // Add the "Authenticated Users" and "Anonymous" rows first
                var shareID = go.Terminal.shareID(term),
                    broadcastURL = go.Terminal.shareBroadcastURL(term),
                    anonUsers = {'upn': anonDesc},
                    authenticatedUsers = {'upn': authenticatedDesc},
                    tableSettings = {
                        'id': "sharing_table",
                        'header': [
                            gettext("User"),
                            gettext("IP Address"),
                            gettext("Read"),
                            gettext("Write")
                        ],
                        'table_attrs': {'class': '✈sharing_table'}
                    },
                    user,
                    tableData = [],
                    table; // Assigned below
                shareObj = go.Terminal.sharedTermObj(term); // Refresh it (just in case)
                if (shareID) {
                    shareIDInput.value = shareID;
                }
                if (broadcastURL) {
                    broadcastURLInput.value = broadcastURL;
                }
                userList.unshift(anonUsers);
                userList.unshift(authenticatedUsers);
                for (user in userList) {
                    var upn = userList[user].upn,
                        upnSpan = u.createElement('span', {'class': '✈user_upn'}),
                        ip = userList[user].ip_address || '',
                        readCheck = u.createElement('input', {'type': 'checkbox', 'name': 'read'}),
                        writeCheck = u.createElement('input', {'type': 'checkbox', 'name': 'write'}),
                        anon = false;
                    upnSpan.innerHTML = upn;
                    if (upn == go.User.username) {
                        if (upn == 'ANONYMOUS') {
                            anon = true; // So we know that all users are anonymous
                        }
                        continue;
                    } else if (upn == authenticatedDesc) {
                        if (anon) { continue; } // ANONYMOUS and AUTHENTICATED cannot co-exist
                    }
                    writeCheck.addEventListener('click', writeCheckFunc, false);
                    if (upn == anonDesc) {
                        upn = "broadcast";
                        writeCheck.disabled = true;
                        if (broadcastURL) {
                            readCheck.checked = true;
                        }
                    }
                    if (upn == authenticatedDesc) {
                        upn = "AUTHENTICATED";
                    }
                    if (shareObj && shareObj.read.indexOf(upn) != -1) {
                        readCheck.checked = true;
                    }
                    if (shareObj && shareObj.write.indexOf(upn) != -1) {
                        writeCheck.checked = true;
                    }
                    upnSpan.setAttribute('data-upn', upn);
                    readCheck.addEventListener('click', readCheckFunc, false);
                    tableData.unshift([upnSpan, ip, readCheck, writeCheck]);
                }
                table = v.table(tableSettings, tableData);
                tableContainer.appendChild(table);
                closeDialog = v.dialog(gettext("Terminal Sharing: ") + term, container, {'class': '✈prefsdialog'});
                done.onclick = closeDialog;
            },
            saveFunc = function() {
                var permissions = {"read": [], "write": [], "broadcast": false, "password": password.value},
                    shareID = go.Terminal.shareID(term),
                    rows = u.toArray(u.getNodes('.✈share_dialog tbody tr'));
                shareObj = go.Terminal.sharedTermObj(term); // Refresh it (just in case)
                rows.forEach(function(row) {
                    var user = row.querySelector('.✈user_upn').getAttribute('data-upn'),
                        read = row.querySelector('input[name="read"]').checked,
                        write = row.querySelector('input[name="write"]').checked;
                    if (read) {
                        if (user == 'broadcast') {
                            // The "Anyone (Broadcast)" read checkbox is special:
                            permissions.broadcast = true;
                        } else {
                            permissions.read.push(user);
                        }
                    }
                    if (write) {
                        permissions.write.push(user);
                    }
                });
                if (!permissions.password.length) {
                    permissions.password = null;
                }
                if (!permissions.broadcast && !permissions.read.length && !permissions.write.length) {
                    if (shareObj) {
                        shareObj.closeFunc(); // Closes the widget
                    }
                    v.displayMessage(gettext("Terminal is no longer shared: ") + term);
                    shareIDInput.value = '';
                }
                if (!permissions.broadcast) {
                    broadcastURLInput.value = "";
                }
                go.Terminal.sharePermissions(term, permissions);
                if (shareIDInput.value.length && shareID != shareIDInput.value) {
                    go.Terminal.setShareID(term, shareIDInput.value);
                }
                setTimeout(function() {
                    // Give the server a moment to apply everything before we ask for an update
                    go.Terminal.listSharedTerminals();
                }, 250);
                apply.style.display = 'none';
            };
        newShareID.onclick = function(e) {
            e.preventDefault();
            go.Terminal.setShareID(term);
        };
        shareIDInput.title = shareIDExplanation;
        shareIDLabel.title = shareIDExplanation;
        shareIDInput.setAttribute('data-term', term);
        shareIDInput.addEventListener('keydown', function(e) {
            var key = go.Input.key(e);
            apply.style.display = '';
            if (key.string == "KEY_ENTER") {
                saveFunc();
            }
        }, false);
        password.addEventListener('keydown', function(e) {
            var key = go.Input.key(e);
            apply.style.display = '';
            if (key.string == "KEY_ENTER") {
                saveFunc();
            }
        }, false);
        broadcastURLInput.setAttribute('data-term', term);
        broadcastURLInput.addEventListener('keydown', function(e) {
            var modifiers = go.Input.modifiers(e);
            if (!modifiers.ctrl) { // Let the user Ctrl-C to copy
                e.preventDefault();
            }
        }, false);
        broadcastURLInput.addEventListener('keyup', function(e) {
            var modifiers = go.Input.modifiers(e);
            if (!modifiers.ctrl) { // Let the user Ctrl-C to copy
                e.preventDefault();
            }
        }, false);
        broadcastURLInput.addEventListener('keypress', function(e) {
            e.preventDefault();
        }, false);
        broadcastURLInput.addEventListener('click', function(e) {
            // Select all when clicking on the field
            this.focus();
            this.select();
        }, false);
        shareIDLabel.innerHTML = gettext("Share ID:");
        shareIDLabel.htmlFor = prefix+"share_id";
        broadcastURLLabel.innerHTML = gettext("Broadcast URL:");
        broadcastURLLabel.htmlFor = prefix+"broadcast_url";
        passwordLabel.innerHTML = gettext("Password:");
        passwordLabel.htmlFor = prefix+"share_password";
        if (shareObj && shareObj.password) {
            password.value = shareObj.password;
        }
        apply.innerHTML = gettext("Apply");
        done.innerHTML = gettext("Done");
        newShareID.innerHTML = gettext("Generate New Share ID");
        apply.addEventListener('click', saveFunc, false);
        apply.style.display = 'none'; // Shown when changes have been made
        container.appendChild(shareIDLabel);
        container.appendChild(shareIDInput);
        container.appendChild(broadcastURLLabel);
        container.appendChild(broadcastURLInput);
        container.appendChild(tableContainer);
        container.appendChild(passwordLabel);
        container.appendChild(password);
        buttonContainer.appendChild(done);
        buttonContainer.appendChild(apply);
        buttonContainer.appendChild(newShareID);
        container.appendChild(buttonContainer);
        go.Terminal.listSharedTerminals(); // Get the latest share information
        E.once("go:user_list", addUsers);
        go.User.listUsers();
    },
    setShareID: function(term, /*opt*/shareID) {
        /**:GateOne.Terminal.setShareID(term, [shareID])

        Sets the share ID of the given *term*.  If a *shareID* is not provided one will be generated automatically (by the server).
        */
        var settings = {'term': term};
        if (shareID) {
            settings.share_id = shareID;
        }
        go.ws.send(JSON.stringify({'terminal:new_share_id': settings}));
        setTimeout(function() {
            // Give the server a moment
            go.Terminal.listSharedTerminals();
        }, 250);
    },
    attachSharedTerminal: function(shareID, /*opt*/password, /*opt*/metadata) {
        /**:GateOne.Terminal.attachSharedTerminal(shareID[, password[, metadata]])

        Opens the terminal associated with the given *shareID*.

        If a *password* is given it will be used to attach to the shared terminal.

        If *metadata* is given it will be passed to the server to be used for extra logging and providing additional details about who is connecting to shared terminals.
        */
        var settings = {
            "share_id": shareID,
            "password": password || null,
            "metadata": metadata || {}
        };
        go.ws.send(JSON.stringify({
            "terminal:attach_shared_terminal": settings
        }));
        E.trigger("terminal:attach_shared_terminal", shareID, password, metadata);
    },
    detachSharedTerminal: function(term) {
        /**:GateOne.Terminal.detachSharedTerminal(term)

        Tells the server that we no longer wish to view the terminal associated with the given *term* (local terminal number).
        */
        var settings = { "term": term };
        go.ws.send(JSON.stringify({
            "terminal:detach_shared_terminal": settings
        }));
        E.trigger("terminal:detach_shared_terminal", term);
    },
    listSharedTerminals: function() {
        /**:GateOne.Terminal.listSharedTerminals()

        Sens the `terminal:list_shared_terminals` WebSocket action to the server which will reply with the `terminal:shared_terminals` WebSocket action (if the user is allowed to list shared terminals).
        */
        go.ws.send(JSON.stringify({"terminal:list_shared_terminals": null}));
    },
    sharedTerminalsAction: function(message) {
        /**:GateOne.Terminal.sharedTerminalsAction(message)

        Attached to the `terminal:shared_terminals` WebSocket action; stores the list of terminals that have been shared with the user in `GateOne.Terminal.sharedTerminals` and triggers the `terminal:shared_terminals` event.
        */
        logDebug('GateOne.Terminal.sharedTerminalsAction(): ', message);
        var broadcastURLInput = u.getNode('.✈broadcast_url'),
            shareIDInput = u.getNode('.✈share_id'),
            shareWidgets = u.toArray(u.getNodes('.✈share_widget')),
            toolbarPrefs = u.getNode('#'+prefix+'icon_prefs'),
            term, shareID, shareObj, widgetExists, closeFunc, dialogTerm, toolbarSharing, existing, nonOwnerShared;
        for (shareID in message.terminals) {
            if (go.Terminal.sharedTerminals[shareID] && go.Terminal.sharedTerminals[shareID].closeFunc) {
                // Preserve the existing widget closeFunc (if any)
                closeFunc = go.Terminal.sharedTerminals[shareID].closeFunc;
                message.terminals[shareID].closeFunc = closeFunc;
            }
        }
        go.Terminal.sharedTerminals = message.terminals;
        if (broadcastURLInput) {
            dialogTerm = broadcastURLInput.getAttribute('data-term');
            // The share dialog is open; update the broadcast URL
            for (shareID in message.terminals) {
                term = message.terminals[shareID].term;
                if (message.terminals[shareID].owner == go.User.username) { // One of ours
                    go.Terminal.terminals[term].shareID = shareID; // This is important (so other functions can know the terminal is shared)
                    if (message.terminals[shareID].term == dialogTerm) {
                        shareIDInput.value = shareID;
                        if (message.terminals[shareID].broadcast) {
                            broadcastURLInput.value = message.terminals[shareID].broadcast;
                        }
                    }
                }
            }
        }
        for (shareID in message.terminals) {
            if (message.terminals[shareID].owner == go.User.username) { // One of ours
                term = message.terminals[shareID].term;
                widgetExists = false;
                shareWidgets.forEach(function(widget) {
                    if (widget.getAttribute('data-term') == term) {
                        widgetExists = widget;
                        widget.querySelector('.✈share_widget_viewers').innerHTML = message.terminals[shareID].viewers.length;
                    }
                });
                if (!widgetExists) {
                    // Create the sharing widget
                    if (go.Terminal.terminals[term]) {
                        go.Terminal.shareWidget(term);
                    } else {
                        setTimeout(function() {
                            // Page hasn't finished loading yet.  Give it a moment...
                            go.Terminal.shareWidget(term);
                        }, 2000);
                    }
                }
            } else {
                nonOwnerShared = true;
            }
        }
        if (nonOwnerShared) {
            // There's at least one shared terminal that we can view where we're not the owner; display the shared terminals icon.
            if (go.prefs.showToolbar) {
                toolbarSharing = u.createElement('div', {'id': 'icon_term_sharing', 'class': '✈toolbar_icon', 'title': gettext("Shared Terminals")});
                existing = u.getNode('#'+prefix+'icon_term_sharing');
                if (!existing) {
                    v.displayMessage(gettext("Shared terminals are available (click the magnifying glass icon)."));
                    toolbarSharing.innerHTML = go.Icons['application'];
                    toolbarSharing.onclick = go.Terminal.sharedTerminalsDialog;
                    go.toolbar.insertBefore(toolbarSharing, toolbarPrefs);
                }
            }
        }
        E.trigger("terminal:shared_terminals", message.terminals);
    },
    sharedTerminalsDialog: function() {
        /**:GateOne.Terminal.sharedTerminalsDialog()

        Opens up a dialog where the user can open terminals that have been shared with them.
        */
        var closeDialog, // Filled out below
            view,
            tr = u.partial(u.createElement, 'tr', {'class': '✈table_row ✈pointer'}),
            td = u.partial(u.createElement, 'td', {'class': '✈table_cell'}),
            container = u.createElement('div', {'class': '✈shared_terminals_dialog'}),
            tableContainer = u.createElement('div', {'style': {'overflow': 'auto', 'height': (go.node.clientHeight/3) + 'px'}}),
            users = u.createElement('table', {'class': '✈shared_terminals'}),
            tbody = u.createElement('tbody'),
            sharedTerms = go.Terminal.sharedTerminals,
            buttonContainer = u.createElement('div', {'class': '✈centered_buttons'}),
            done = u.createElement('button', {'id': 'done', 'type': 'reset', 'value': gettext('Done'), 'class': '✈button ✈black', 'style': {'float': 'right', 'margin-top': '0.5em'}}),
            tableSettings = {
                'id': "share_viewers_table",
                'header': [
                    gettext("Owner"),
                    gettext("Title"),
                    gettext("Write Access"),
                    gettext("Password"),
                    gettext("View")
                ],
                'table_attrs': {'class': '✈sharing_table'}
            },
            tableData = [],
            table, owner, ownerSpan, writeCheck, title, passwordInput, shareID;
        for (shareID in sharedTerms) {
            view = u.createElement('button', {'id': 'view', 'type': 'submit', 'value': gettext('View'), 'class': '✈button ✈black ✈view_shared_term', 'style': {'margin-top': '0.5em'}}),
            owner = sharedTerms[shareID].owner;
            ownerSpan = u.createElement('span', {'class': '✈share_owner'});
            title = sharedTerms[shareID].title || gettext('No Title');
            passwordInput = u.createElement('input', {'type': 'password', 'name': 'password'});
            writeCheck = u.createElement('input', {'type': 'checkbox', 'name': 'write'});
            passwordInput.setAttribute('data-shareid', shareID);
            view.setAttribute('data-shareid', shareID);
            view.innerHTML = gettext("View");
            ownerSpan.innerHTML = owner;
            writeCheck.disabled = true;
            if (owner == go.User.username) {
                if (owner != 'ANONYMOUS') {
                    continue; // Skip ourselves
                }
            } else if (sharedTerms[shareID].write.indexOf(go.User.username) != -1) {
                writeCheck.checked = true;
            }
            if (sharedTerms[shareID]['password_protected']) {
                passwordInput.placeholder = gettext("Required");
            } else {
                passwordInput.disabled = true;
            }
            ownerSpan.setAttribute('data-owner', owner);
            view.onclick = function(e) {
                var shareID = this.getAttribute('data-shareid'),
                    password = this.parentNode.parentNode.querySelector('input[name="password"]');
                e.preventDefault();
                if (sharedTerms[shareID]['password_protected']) {
                    // Make sure it's set before we allow submission
                    if (!password.value.length) {
                        v.displayMessage(gettext("Error: You must enter a password to view this shared terminal"));
                        return;
                    }
                }
                E.off("terminal:new_terminal", null, shareID); // Remove any existing closeDialog() functions for this event (in case password was wrong or something like that)
                E.once("terminal:new_terminal", function(termNum) {
                    closeDialog();
                }, shareID);
                go.Terminal.attachSharedTerminal(shareID, password.value);
            }
            tableData.unshift([ownerSpan, title, writeCheck, passwordInput, view]);
        }
        table = v.table(tableSettings, tableData);
        tableContainer.appendChild(table);
        closeDialog = v.dialog(gettext("Shared Terminals"), container, {'class': '✈prefsdialog'});
        done.onclick = closeDialog;
        done.innerHTML = gettext("Done");
        container.appendChild(tableContainer);
        buttonContainer.appendChild(done);
        container.appendChild(buttonContainer);
    },
    shareInfo: function(term) {
        /**:GateOne.Terminal.shareInfo(term)

        Displays a dialog that lists the current viewers (along with their permissions) of a given *term*.
        */
        var closeDialog, // Filled out below
            tr = u.partial(u.createElement, 'tr', {'class': '✈table_row ✈pointer'}),
            td = u.partial(u.createElement, 'td', {'class': '✈table_cell'}),
            container = u.createElement('div', {'class': '✈share_dialog'}),
            tableContainer = u.createElement('div', {'style': {'overflow': 'auto', 'height': (go.node.clientHeight/3) + 'px'}}),
            users = u.createElement('table', {'class': '✈share_users'}),
            tbody = u.createElement('tbody'),
            buttonContainer = u.createElement('div', {'class': '✈centered_buttons'}),
            done = u.createElement('button', {'id': 'done', 'type': 'reset', 'value': gettext('Done'), 'class': '✈button ✈black', 'style': {'float': 'right', 'margin-top': '0.5em'}}),
            shareObj = go.Terminal.sharedTermObj(term),
            viewers = shareObj['viewers'],
            tableSettings = {
                'id': "share_viewers_table",
                'header': [
                    gettext("User"),
                    gettext("IP Address"),
                    gettext("Authenticated"),
                    gettext("Write")
                ],
                'table_attrs': {'class': '✈sharing_table'}
            },
            tableData = [],
            user, upn, upnSpan, ip, authenticatedCheck, writeCheck, anon,
            table; // Assigned below
        for (user in viewers) {
            upn = viewers[user]['upn'];
            upnSpan = u.createElement('span', {'class': '✈user_upn'});
            ip = viewers[user].ip_address || '';
            authenticatedCheck = u.createElement('input', {'type': 'checkbox', 'name': 'authenticated'});
            writeCheck = u.createElement('input', {'type': 'checkbox', 'name': 'write'});
            anon = false;
            upnSpan.innerHTML = upn;
            writeCheck.disabled = true;
            if (upn == go.User.username) {
                if (upn != 'ANONYMOUS') {
                    continue; // Skip ourselves
                }
            } else if (shareObj.write.indexOf(upn) != -1) {
                writeCheck.checked = true;
            }
            if (!viewers[user].broadcast) {
                authenticatedCheck.checked = true;
            }
            authenticatedCheck.disabled = true;
            upnSpan.setAttribute('data-upn', upn);
            tableData.unshift([upnSpan, ip, authenticatedCheck, writeCheck]);
        }
        table = v.table(tableSettings, tableData);
        tableContainer.appendChild(table);
        closeDialog = v.dialog(gettext("Terminal Viewers: ") + term, container, {'class': '✈prefsdialog'});
        done.onclick = closeDialog;
        done.innerHTML = gettext("Done");
        container.appendChild(tableContainer);
        buttonContainer.appendChild(done);
        container.appendChild(buttonContainer);
    },
    shareWidget: function(term) {
        /**:GateOne.Terminal.shareWidget(term)

        Adds a terminal sharing widget to the given *term* (number) that provides sharing controls and information (e.g. number of viewers).
        */
        var widgetContent = u.createElement('div', {'class': '✈share_widget'}),
            broadcastURL = u.createElement('span', {'class': '✈share_widget_settings'}),
            sharingTitle = u.createElement('h4', {'class': '✈share_widget_title'}),
            viewers = u.createElement('span', {'class': '✈share_widget_text'}),
            viewersVal = u.createElement('span', {'class': '✈share_widget_viewers'}),
            settings = u.createElement('button', {'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black ✈share_widget_button'}),
            shareObj = go.Terminal.sharedTermObj(term),
            closeFunc,
            endSharing = function() {
                go.Terminal.sharePermissions(term, {'read': [], 'write': [], 'broadcast': false});
                v.displayMessage(gettext("Terminal is no longer shared: ") + term);
            };
        viewersVal.onclick = function(e) { go.Terminal.shareInfo(term); }
        settings.innerHTML = gettext("Settings");
        settings.onclick = function(e) { go.Terminal.shareDialog(term); }
        sharingTitle.innerHTML = gettext("Terminal Sharing Info");
        viewers.innerHTML = gettext("Viewers: ");
        viewersVal.innerHTML = shareObj['viewers'].length;
        viewers.appendChild(viewersVal);
        widgetContent.setAttribute('data-term', term);
        widgetContent.appendChild(sharingTitle);
        widgetContent.appendChild(viewers);
        widgetContent.appendChild(viewersVal);
        widgetContent.appendChild(settings);
        closeFunc = v.widget(gettext('Terminal Sharing'), widgetContent, {'onclose': endSharing, 'top': '0px', 'left': '85%', 'where': go.Terminal.terminals[term].where});
        shareObj.closeFunc = closeFunc;
    },
    sharedTermObj: function(term) {
        /**:GateOne.Terminal.sharedTermObj(term)

        Returns the object matching the given *term* from `GateOne.Terminal.sharedTerminals`.
        */
        var sharedTerms = go.Terminal.sharedTerminals, shareID;
        for (shareID in sharedTerms) {
            if (sharedTerms[shareID].term == term) {
                return sharedTerms[shareID];
            }
        }
    },
    shareID: function(term) {
        /**:GateOne.Terminal.shareID(term)

        Returns the share ID for the given *term* (if any).
        */
        var sharedTerms = go.Terminal.sharedTerminals, shareID;
        for (shareID in sharedTerms) {
            if (sharedTerms[shareID].term == term) {
                return shareID;
            }
        }
    },
    shareBroadcastURL: function(term) {
        /**:GateOne.Terminal.shareBroadcastURL(term)

        Returns the broadcast URL for the given *term* (if any).
        */
        var shareObj = go.Terminal.sharedTermObj(term);
        if (shareObj) {
            if (shareObj.broadcast) {
                return shareObj.broadcast;
            }
        }
    },
    _trimmedScreen: function(screen) {
        /**:GateOne.Terminal._trimmedScreen(screen)

        Returns *screen* with all trailing empty lines removed.
        */
        var lastLine = 0, i;
        for (i=0; i <= screen.length-1; i++) {
            if (screen[i].length && screen[i].trim().length) {
                lastLine = i;
            }
        }
        return screen.slice(0, lastLine+1);
    },
    lastLines: function(/*opt*/n, /*opt*/term) {
        /**:GateOne.Terminal.lastLines([n[, term]])

        Returns the last *n* non-blank (trimmed) line in the terminal.  Useful for pattern matching.

        If *term* is not given the ``localStorage[prefix+'selectedTerminal']`` will be used.
        */
        term = term || localStorage[prefix+'selectedTerminal'];
        var lastLine, i,
            nonblankLines,
            screen = go.Terminal.terminals[term].screen;
        // Walk the screen to find the last non-blank line
        for (i=0; i <= screen.length-1; i++) {
            if (screen[i].length && screen[i].trim().length) {
                lastLine = i;
            }
        }
        nonblankLines = screen.slice((lastLine - n)+1, lastLine+1)
        return nonblankLines;
    },
    startCapture: function(term) {
        /**:GateOne.Terminal.startCapture(term)

        Starts capturing terminal output for the given *term*.  The :js:func:`GateOne.Terminal.stopCapture` function can be called to stop the capture and send the captured data to the client via the 'terminal:captured_data' WebSocket action.  This WebSocket action gets attached to :js:func:`GateOne.Terminal.capturedData` which will call the 'terminal:captured_data' event passing the terminal number and the captured data as the only arguments.
        */
        term = term || localStorage[prefix+'selectedTerminal'];
        go.ws.send(JSON.stringify({'terminal:start_capture': term}));
    },
    stopCapture: function(term) {
        /**:GateOne.Terminal.stopCapture(term)

        Stops capturing output on the given *term*.
        */
        term = term || localStorage[prefix+'selectedTerminal'];
        go.ws.send(JSON.stringify({'terminal:stop_capture': term}));
    },
    capturedData: function(message) {
        /**:GateOne.Terminal.capturedData(message)

        Attached to the 'terminal:captured_data' WebSocket action; triggers the 'terminal:captured_data' event like so:

        .. code-block:: javascript

            GateOne.Events.trigger('terminal:captured_data', term, data);
        */
        var term = message.term, data = message.data;
        E.trigger("terminal:captured_data", term, data);
    }
});

});
