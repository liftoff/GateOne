
GateOne.Base.superSandbox("GateOne.Help", ["GateOne.Visual", "GateOne.User", "GateOne.Input", "GateOne.Storage"], function(window, undefined) {
"use strict";

var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var go = GateOne,
    u = go.Utils,
    t = go.Terminal,
    v = go.Visual,
    E = go.Events,
    I = go.Input,
    gettext = GateOne.i18n.gettext,
    prefix = go.prefs.prefix,
    noop = u.noop,
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

// GateOne.Help (functions related to the help menu/panel)
GateOne.Base.module(GateOne, "Help", "1.2", ['Base']);
/**:GateOne.Help

A global Gate One plugin for providing helpful/useful information to the user.
*/
GateOne.Base.update(GateOne.Help, {
    init: function() {
        /**:GateOne.Help.init()

        Creates the help panel and registers the :kbd:`Shift-F1` (show help) and :kbd:`Ctrl-S` (displays helpful message about suspended terminal output) keyboard shortcuts.
        */
        var helpContent = u.createElement('p', {'id': prefix+'help_content', 'class': '✈help_content ✈sectrans'}),
            helpPanel = u.createElement('div', {'id': prefix+'panel_help', 'class': '✈panel ✈help_panel'}),
            helpPanelH2 = u.createElement('h2', {'id': prefix+'help_title'}),
            helpPanelH3 = u.createElement('h3', {'id': prefix+'help_contents'}),
            helpNav = u.createElement('div', {'id': prefix+'help_nav', 'class': '✈panel_nav ✈sectrans'}),
            helpPanelClose = u.createElement('div', {'id': prefix+'icon_closehelp', 'class': '✈panel_close_icon', 'title': "Close This Panel"}),
            helpPanelSections = u.createElement('div', {'id': prefix+'help_sections', 'class': '✈help_sections'}),
            GateOneSection = u.createElement('div', {'id': prefix+'help_section_gateone', 'class': '✈help_section'}),
            helpPanelUL = u.createElement('ul', {'id': prefix+'help_ol', 'class': '✈help_ul'}),
            helpPanelAbout = u.createElement('li'),
            helpPanelAboutAnchor = u.createElement('a', {'id': prefix+'help_docs'}),
            helpPanelDocs = u.createElement('li'),
            helpPanelDocsAnchor = u.createElement('a', {'id': prefix+'help_docs'});
        // Create our info panel
        helpPanelH2.innerHTML = gettext("Gate One Help");
        helpPanelH3.innerHTML = gettext("Contents");
        helpPanelClose.innerHTML = go.Icons['panelclose'];
        helpPanelAboutAnchor.innerHTML = gettext("About Gate One");
        helpPanelAbout.appendChild(helpPanelAboutAnchor);
        helpPanelDocsAnchor.innerHTML = gettext("Gate One's Documentation");
        helpPanelDocs.appendChild(helpPanelDocsAnchor);
        helpPanel.appendChild(helpPanelH2);
        helpPanel.appendChild(helpPanelClose);
        helpPanel.appendChild(helpPanelSections);
        helpPanelUL.appendChild(helpPanelAbout);
        helpPanelUL.appendChild(helpPanelDocs);
        helpNav.appendChild(helpPanelH3);
        helpPanel.appendChild(helpNav);
        GateOneSection.innerHTML = gettext("<b>Gate One Help:</b>");
        GateOneSection.appendChild(helpPanelUL);
        helpPanelSections.appendChild(GateOneSection);
        helpContent.appendChild(helpPanelSections);
        helpPanel.appendChild(helpContent);
        u.hideElement(helpPanel); // Start out hidden
        go.Visual.applyTransform(helpPanel, 'scale(0)'); // Hidden by default
        go.node.appendChild(helpPanel); // Doesn't really matter where it goes
        helpPanelAboutAnchor.onclick = function(e) {
            e.preventDefault(); // No need to change the hash
            GateOne.Help.aboutGateOne();
        };
        helpPanelDocsAnchor.onclick = function(e) {
            e.preventDefault(); // No need to change the hash
            v.togglePanel('#'+GateOne.prefs.prefix+'panel_help');
            window.open(GateOne.prefs.url+'docs/index.html');
        };
        helpPanelClose.onclick = function(e) {
            v.togglePanel('#'+GateOne.prefs.prefix+'panel_help'); // Scale away, scale away, scale away.
        }
        if (!go.prefs.embedded) {
            // Register our keyboard shortcut (Alt-F1)
            I.registerShortcut('KEY_F1',
                {'modifiers':
                    {'ctrl': false, 'alt': false, 'meta': false, 'shift': true},
                    'action': 'GateOne.Help.showHelp();'
                }
            );
        }
    },
    aboutGateOne: function() { //
        /**:GateOne.Help.aboutGateOne()

        Displays the Gate One version/credits.
        */
        go.Help.showHelpSection(go.prefs.url+'static/about.html', function() {
            u.getNode('#gateone_version').innerHTML = gettext("<b>Version:</b> ") + go.__version__ + " (" + go.__commit__ + ")";
        });
    },
    // TODO: Finish this...
    showFirstTimeDialog: function() {
        /**:GateOne.Help.showFirstTimeDialog()

        Pops up a dialog for first-time users that shows them the basics of Gate One.

        .. note:  Not implemented yet.
        */
        var firstTimeDiv = u.createElement('div', {'id': 'help_firsttime'}),
            dismiss = u.createElement('button', {'id': 'dismiss', 'type': 'reset', 'value': 'Cancel', 'class': '✈button ✈black'});
        firstTimeDiv.innerHTML = gettext('Gate One is a web-based application gateway...');
        dismiss.innerHTML = gettext("Dismiss");
        firstTimeDiv.appendChild(dismiss);
        var closeDialog = go.Visual.dialog(gettext('Welcome to Gate One'), firstTimeDiv);
        dismiss.onclick = closeDialog;
    },
    showHelp: function() {
        /**:GateOne.Help.showHelp()

        Displays the help panel.
        */
        v.togglePanel('#'+prefix+'panel_help');
    },
    addHelp: function(section, title, action, /*opt*/callback) {
        /**:GateOne.Help.addHelpSection(section, title, action[, callback])

        Adds help to the Help panel under the given *section* using the given *title*.  The *title* will be a link that performs one of the following:

            * If *action* is a URL, :js:meth:`~GateOne.Help.showHelpSection` will be called to load the content at that URL.
            * If *action* is a DOM node it will be displayed to the user (in the help panel).

        Example:

            >>> GateOne.Help.addHelp('Terminal', 'SSH Plugin', '/terminal/ssh/static/help.html');

        If a *callback* is provided it will be called after the *action* is loaded (i.e. when the user clicks on the link).
        */
        var helpPanelSections = u.getNode('#'+prefix+'help_sections'),
            existingSection = u.getNode('#'+prefix+'_'+section.toLowerCase()),
            newSection = u.createElement('div', {'id': '_'+section.toLowerCase()}),
            helpPanelUL = u.createElement('ul', {'class': '✈help_ul'}),
            helpPanelLI = u.createElement('li'),
            helpPanelAnchor = u.createElement('a', {'id': prefix+'help_docs'});
        helpPanelAnchor.innerHTML = title;
        helpPanelLI.appendChild(helpPanelAnchor);
        if (existingSection) {
            existingSection.querySelector('ul').appendChild(helpPanelLI);
        } else {
            newSection.innerHTML = "<b>" + section + "</b>";
            helpPanelUL.appendChild(helpPanelLI);
            newSection.appendChild(helpPanelUL);
            helpPanelSections.appendChild(newSection);
        }
        if (u.isElement(action)) {
            // TODO: Implement this
            logError(gettext("Haven't implemented the DOM option in this function yet, sorry!"));
        } else {
            helpPanelAnchor.onclick = function(e) {
                e.preventDefault(); // No need to change the hash
                GateOne.Help.showHelpSection(action, callback);
            };
        }
    },
    showHelpSection: function(helpURL, /*opt*/callback) {
        /**:GateOne.Help.showHelpSection(helpURL[, callback])

        Shows the given help information (*helpURL*) by sliding out whatever is in the help panel and sliding in the new help text.

        If *callback* is given it will be called after the content is loaded.
        */
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            helpContent = u.getNode('#'+prefix+'help_content'),
            helpPanel = u.getNode('#'+prefix+'panel_help'),
            helpNav = u.getNode('#'+prefix+'help_nav'),
            helpNavChildren = u.toArray(helpNav.childNodes),
            helpBack = u.createElement('a', {'id': prefix+'help_back'}),
            origNav = helpNav.innerHTML,
            newHelpContent = u.createElement('p', {'id': prefix+'help_section', 'class': '✈help_content ✈sectrans'}),
            removeNewContent = function () {
                helpPanel.removeChild(newHelpContent);
            },
            displayHelp = function(helpText) {
                newHelpContent.innerHTML = helpText;
                v.applyTransform(newHelpContent, 'translateX(200%)');
                helpPanel.appendChild(newHelpContent);
                v.enableTransitions(newHelpContent);
                setTimeout(function() {
                    v.applyTransform(newHelpContent, 'translateX(0)');
                }, 1);
                v.applyTransform(helpContent, 'translateX(-200%)'); // Slide it out of view
                helpBack.onclick = function(e) {
                    e.preventDefault(); // Don't mess with location.url
                    v.applyTransform(newHelpContent, 'translateX(200%)', removeNewContent);
                    v.applyTransform(helpContent, 'translateX(0)');
                    helpNav.innerHTML = origNav;
                };
                helpNavChildren.forEach(function(child) {
                    var removeIt = function(e) {
                        u.removeElement(child);
                    };
                    v.applyTransform(child, 'translateX(-200%)');
                    child.addEventListener(v.transitionEndName, removeIt, false);
                });
                helpNav.innerHTML = "";
                helpNav.appendChild(helpBack);
                setTimeout(function() {
                    if (callback) { callback(); }
                }, 100); // Just a moment so the DOM can finish drawing
            };
        helpBack.innerHTML = go.Icons['back_arrow'] + " Back";
        v.disableTransitions(newHelpContent);
        u.xhrGet(helpURL, displayHelp);
    }
});

});
