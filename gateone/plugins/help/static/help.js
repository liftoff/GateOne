
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

// GateOne.Help (functions related to the help menu/panel)
GateOne.Base.module(GateOne, "Help", "1.0", ['Base']);
GateOne.Base.update(GateOne.Help, {
    init: function() {
        // Setup the help panel
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            helpContent = u.createElement('p', {'id': prefix+'help_content', 'class': 'sectrans', 'style': {'padding-bottom': '0.4em'}}),
            helpPanel = u.createElement('div', {'id': prefix+'panel_help', 'class': 'panel', 'style': {'width': '60%'}}),
            helpPanelH2 = u.createElement('h2', {'id': prefix+'help_title'}),
            helpPanelClose = u.createElement('div', {'id': prefix+'icon_closehelp', 'class': 'panel_close_icon', 'title': "Close This Panel"}),
            helpPanelSections = u.createElement('span', {'id': prefix+'help_sections'}),
            helpPanelUL = u.createElement('ul', {'id': prefix+'help_ol', style: {'margin-left': '1em', 'padding-left': '1em'}}),
            helpPanelAbout = u.createElement('li'),
            helpPanelAboutAnchor = u.createElement('a', {'id': prefix+'help_docs'}),
            helpPanelDocs = u.createElement('li'),
            helpPanelDocsAnchor = u.createElement('a', {'id': prefix+'help_docs'}),
            goDiv = u.getNode(go.prefs.goDiv);
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        if (go.Logging) {
            logFatal = go.Logging.logFatal;
            logError = go.Logging.logError;
            logWarning = go.Logging.logWarning;
            logInfo = go.Logging.logInfo;
            logDebug = go.Logging.logDebug;
        }
        // Create our info panel
        helpPanelH2.innerHTML = "Gate One Help";
        helpPanelClose.innerHTML = go.Icons['panelclose'];
        helpPanelH2.appendChild(helpPanelClose);
        helpPanelAboutAnchor.innerHTML = "About Gate One";
        helpPanelAbout.appendChild(helpPanelAboutAnchor);
        helpPanelDocsAnchor.innerHTML = "Gate One's Documentation";
        helpPanelDocs.appendChild(helpPanelDocsAnchor);
        helpPanel.appendChild(helpPanelH2);
        helpPanel.appendChild(helpPanelSections);
        helpPanelUL.appendChild(helpPanelAbout);
        helpPanelUL.appendChild(helpPanelDocs);
        helpContent.appendChild(helpPanelUL);
        helpPanel.appendChild(helpContent);
        go.Visual.applyTransform(helpPanel, 'scale(0)'); // Hidden by default
        goDiv.appendChild(helpPanel); // Doesn't really matter where it goes
        helpPanelAboutAnchor.onclick = function(e) {
            e.preventDefault(); // No need to change the hash
            GateOne.Help.aboutGateOne();
        };
        helpPanelAboutAnchor.onmouseover = function(e) {
            // TODO: Fix the CSS so this code isn't necessary
            this.style.cursor = "pointer";
        };
        helpPanelDocsAnchor.onclick = function(e) {
            e.preventDefault(); // No need to change the hash
            GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_help');
            window.open(GateOne.prefs.url+'docs/index.html');
        };
        helpPanelDocsAnchor.onmouseover = function(e) {
            this.style.cursor = "pointer";
        };
        helpPanelClose.onclick = function(e) {
            GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_help'); // Scale away, scale away, scale away.
        }
        // Register our keyboard shortcut (Alt-F1)
        go.Input.registerShortcut('KEY_F1', {'modifiers': {'ctrl': false, 'alt': false, 'meta': false, 'shift': true}, 'action': 'GateOne.Help.showHelp()'});
        // These shortcuts just add some helpful messages to regular keyboard shortcuts
        go.Input.registerShortcut('KEY_S', {'modifiers': {'ctrl': true, 'alt': false, 'meta': false, 'shift': false}, 'action': 'GateOne.Visual.displayMessage("Terminal output has been suspended (Ctrl-S). Type Ctrl-Q to resume."); GateOne.Input.queue(String.fromCharCode(19)); GateOne.Net.sendChars();'});

    },
    aboutGateOne: function() { // Displays our credits
        // First we create our settings object to pass to showHelpSection()
        var settingsObj = {
            'helpURL': GateOne.prefs.url+'static/about.html',
            'title': 'About Gate One'
        };
        GateOne.Help.showHelpSection(settingsObj);
    },
    showFirstTimeDialog: function() {
        // Pops up a dialog for first-time users that shows them the basics of Gate One
        var go = GateOne,
            u = go.Utils,
            firstTimeDiv = u.createElement('div', {'id': 'help_firsttime'}),
            dismiss = u.createElement('button', {'id': 'dismiss', 'type': 'reset', 'value': 'Cancel', 'class': 'button black'});
        firstTimeDiv.innerHTML = 'Gate One is an HTML5 web-based terminal emulator...';
        dismiss.innerHTML = "Dismiss";
        firstTimeDiv.appendChild(dismiss);
        var closeDialog = go.Visual.dialog('Welcome to Gate One', firstTimeDiv);
        dismiss.onclick = closeDialog;
    },
    showHelp: function() {
        // Just displays the help panel
        GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_help');
    },
    showHelpSection: function(sectionObj) {
        // Shows the given help information by sliding out whatever is in the help panel and sliding in the new help text
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            helpContent = u.getNode('#'+prefix+'help_content'),
            helpPanel = u.getNode('#'+prefix+'panel_help'),
            helpNav = u.createElement('div', {'id': prefix+'help_nav', 'class': 'panel_nav sectrans', 'style': {'padding-bottom': '0.5em'}}),
            helpBack = u.createElement('a', {'id': prefix+'help_back'}),
            newHelpContent = u.createElement('p', {'id': prefix+'help_section', 'class': 'sectrans', 'style': {'padding-bottom': '0.4em'}});
        var displayHelp = function(helpText) {
            go.Visual.applyTransform(helpContent, 'translateX(200%)');
            helpBack.innerHTML = go.Icons['back_arrow'] + " Back";
            helpBack.onclick = function(e) {
                e.preventDefault(); // Don't mess with location.url
                go.Visual.applyTransform(helpNav, 'translateX(200%)');
                go.Visual.applyTransform(newHelpContent, 'translateX(200%)');
                setTimeout(function() {
                    helpPanel.removeChild(newHelpContent);
                    helpPanel.removeChild(helpNav);
                    helpPanel.appendChild(helpContent);
                }, 900);
                setTimeout(function() {
                    go.Visual.applyTransform(helpContent, 'translateX(0)');
                }, 1000);
            };
            helpNav.appendChild(helpBack);
            helpNav.onmouseover = function(e) {
                this.style.cursor = "pointer";
            };
            newHelpContent.innerHTML = helpText;
            go.Visual.applyTransform(helpNav, 'translateX(200%)');
            go.Visual.applyTransform(newHelpContent, 'translateX(200%)');
            setTimeout(function() {
                helpPanel.removeChild(helpContent);
                helpPanel.appendChild(helpNav);
                helpPanel.appendChild(newHelpContent);
            }, 900);
            setTimeout(function() {
                go.Visual.applyTransform(helpNav, 'translateX(0)');
                go.Visual.applyTransform(newHelpContent, 'translateX(0)');
            }, 1000);
        };
        u.xhrGet(sectionObj.helpURL, displayHelp);
    }
});

})(window);
