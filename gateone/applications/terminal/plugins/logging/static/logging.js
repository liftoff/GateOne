
GateOne.Base.superSandbox("GateOne.TermLogging", /* Dependencies -->*/["GateOne.Terminal", "GateOne.User"], function(window, undefined) {
"use strict";

// TODO: Move the parts that load and render logs in separate windows into Web Workers so they don't hang the browser while they're being rendered.
// TODO: Bring back *some* client-side logging so things like displayMessage() have somewhere to temporarily store messages so users can look back to re-read them (e.g. Which terminal was that bell just in?).  Probably put it in sessionStorage

// These are just convenient shortcuts:
var document = window.document, // Have to do this because we're sandboxed
    go = GateOne,
    u = go.Utils,
    t = go.Terminal,
    v = go.Visual,
    E = go.Events,
    prefix = go.prefs.prefix,
    gettext = go.i18n.gettext,
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

// GateOne.TermLogging
go.Base.module(GateOne, "TermLogging", '1.2');
go.TermLogging.serverLogs = [];
go.TermLogging.sortToggle = false;
go.TermLogging.searchFilter = null;
go.TermLogging.page = 0; // Used to tracking pagination
go.TermLogging.delay = 500;
go.Base.update(GateOne.TermLogging, {
    init: function() {
        /**:GateOne.TermLogging.init()

        Creates the log viewer panel and registers the following WebSocket actions::

            GateOne.Net.addAction('terminal:logging_log', GateOne.TermLogging.incomingLogAction);
            GateOne.Net.addAction('terminal:logging_logs_complete', GateOne.TermLogging.incomingLogsCompleteAction);
            GateOne.Net.addAction('terminal:logging_log_flat', GateOne.TermLogging.displayFlatLogAction);
            GateOne.Net.addAction('terminal:logging_log_playback', GateOne.TermLogging.displayPlaybackLogAction);
        */
        var l = go.TermLogging,
            prefix = go.prefs.prefix,
            pTag = u.getNode('#'+prefix+'info_actions'),
            infoPanelViewLogs = u.createElement('button', {'id': 'logging_viewlogs', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'});
        infoPanelViewLogs.innerHTML = gettext("Log Viewer");
        infoPanelViewLogs.title = gettext("Opens a panel where you can browse, preview, and open all of your server-side session logs.");
        infoPanelViewLogs.onclick = function() {
            l.loadLogs(true);
        }
        pTag.appendChild(infoPanelViewLogs);
        l.createPanel();
        // Default sort order is by date, descending, followed by alphabetical order of the title
        l.sortfunc = l.sortFunctions.date;
        localStorage[prefix+'logs_sort'] = 'date';
        // Register our WebSocket actions
        go.Net.addAction('terminal:logging_log', l.incomingLogAction);
        go.Net.addAction('terminal:logging_logs_complete', l.incomingLogsCompleteAction);
        go.Net.addAction('terminal:logging_log_flat', l.displayFlatLogAction);
        go.Net.addAction('terminal:logging_log_playback', l.displayPlaybackLogAction);
        go.Net.addAction('terminal:logging_sessions_disabled', l.sessionLoggingDisabled);
        // Have the server tell us if session logging is enabled.  If it isn't we'll get the 'terminal:logging_sessions_disabled' response.
        go.ws.send(JSON.stringify({'terminal:session_logging_check': null}));
    },
    sessionLoggingDisabled: function() {
        /**:GateOne.TermLogging.sessionLoggingDisabled()

        Just removes the "Log Viewer" button from the Terminal info panel.  It gets sent if the server has ``"session_logging": false``.
        */
        u.removeElement('#'+prefix+'logging_viewlogs');
    },
    createPanel: function() {
        /**:GateOne.TermLogging.createPanel()

        Creates the logging panel (just the empty shell of it).
        */
        var l = go.TermLogging,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logPanel = u.createElement('div', {'id': 'panel_logs', 'class': '✈panel ✈panel_logs ✈sectrans'}),
            logHeader = u.createElement('div', {'id': 'log_view_header', 'class': '✈sectrans'}),
            logHeaderH2 = u.createElement('h2', {'id': 'logging_title'}),
            logHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': '✈panel_close_icon', 'title': gettext("Close This Panel")}),
            logViewContent = u.createElement('div', {'id': 'logview_container', 'class': '✈sectrans'}),
            logPagination = u.createElement('div', {'id': 'log_pagination', 'class': '✈log_pagination ✈sectrans'}),
            logInfoContainer = u.createElement('div', {'id': 'log_info', 'class': '✈log_info'}),
            logListContainer = u.createElement('div', {'id': 'log_listcontainer', 'class': '✈log_listcontainer'}),
            logPreviewIframe = u.createElement('iframe', {'id': 'log_preview', 'class': '✈log_preview', 'style': {'display': 'none'}}), // Initial display:none to work around a (minor) IE 10 bug
            hr = u.createElement('hr'),
            logElemHeader = u.createElement('div', {'id': 'logitems_header', 'class':'✈table_header_row ✈logitems_header'}),
            // NOTE:  The 'white-space' style below is t work around a Firefox bug where 'float: right' causes a newline (against spec)
            titleSpan = u.createElement('span', {'id': 'log_titlespan', 'class':'✈table_cell ✈table_header_cell', 'style': {'white-space': 'normal'}}),
            dateSpan = u.createElement('span', {'id': 'log_datespan', 'class':'✈table_cell ✈table_header_cell', 'style': {'white-space': 'normal'}}),
            sizeSpan = u.createElement('span', {'id': 'log_sizespan', 'class':'✈table_cell ✈table_header_cell', 'style': {'white-space': 'normal'}}),
            sortOrder = u.createElement('span', {'id': 'logs_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
            logMetadataDiv = u.createElement('div', {'id': 'log_metadata', 'class': '✈log_metadata'});
        logHeaderH2.innerHTML = gettext('Log Viewer: Loading...');
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            // Stop the playing iframe so it doesn't eat up cycles while no one is watching it
            var previewIframe = u.getNode('#'+prefix+'log_preview'),
                logMetadataDiv = u.getNode('#'+prefix+'log_metadata'),
                iframeDoc = previewIframe.contentWindow.document;
            // Remove existing content first
            while (logMetadataDiv.childNodes.length >= 1 ) {
                logMetadataDiv.removeChild(logMetadataDiv.firstChild);
            }
            iframeDoc.open();
            iframeDoc.write('<html><head><title>' + gettext('Preview Iframe') + '</title></head><body style="background-color: #000; color: #fff; font-size: 1em; font-style: italic;">' + gettext('Click on a log to view a preview and metadata.') + '</body></html>');
            iframeDoc.close();
            GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_logs'); // Scale away, scale away, scale away.
        }
        logHeader.appendChild(logHeaderH2);
        logHeader.appendChild(panelClose);
        logHeader.appendChild(logHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        logInfoContainer.appendChild(logPagination);
        logInfoContainer.appendChild(logPreviewIframe);
        logInfoContainer.appendChild(hr);
        logInfoContainer.appendChild(logMetadataDiv);
        logViewContent.appendChild(logInfoContainer);
        if (l.sortToggle) {
            sortOrder.innerHTML = "▴";
        } else {
            sortOrder.innerHTML = "▾";
        }
        titleSpan.onclick = function(e) {
            var order = u.createElement('span', {'id': 'logs_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
                existingOrder = u.getNode('#'+prefix+'logs_sort_order');
            l.sortfunc = l.sortFunctions.alphabetical;
            if (localStorage[prefix+'logs_sort'] != 'alpha') {
                localStorage[prefix+'logs_sort'] = 'alpha';
            }
            if (this.childNodes.length > 1) {
                // Means the 'order' span is present.  Reverse the list
                if (l.sortToggle) {
                    l.sortToggle = false;
                } else {
                    l.sortToggle = true;
                }
            }
            if (existingOrder) {
                u.removeElement(existingOrder);
            }
            u.toArray(logElemHeader.getElementsByClassName('✈table_header_cell')).forEach(function(item) {
                item.className = '✈table_cell ✈table_header_cell';
            });
            this.className = '✈table_cell ✈table_header_cell ✈active';
            if (l.sortToggle) {
                order.innerHTML = "▴";
            } else {
                order.innerHTML = "▾";
            }
            this.appendChild(order);
            l.loadLogs();
        }
        dateSpan.onclick = function(e) {
            var order = u.createElement('span', {'id': 'logs_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
                existingOrder = u.getNode('#'+prefix+'logs_sort_order');
            l.sortfunc = l.sortFunctions.date;
            if (localStorage[prefix+'logs_sort'] != 'date') {
                localStorage[prefix+'logs_sort'] = 'date';
            }
            if (this.childNodes.length > 1) {
                // Means the 'order' span is present.  Reverse the list
                if (l.sortToggle) {
                    l.sortToggle = false;
                } else {
                    l.sortToggle = true;
                }
            }
            if (existingOrder) {
                u.removeElement(existingOrder);
            }
            u.toArray(logElemHeader.getElementsByClassName('✈table_header_cell')).forEach(function(item) {
                item.className = '✈table_cell ✈table_header_cell';
            });
            this.className = '✈table_cell ✈table_header_cell ✈active';
            if (l.sortToggle) {
                order.innerHTML = "▴";
            } else {
                order.innerHTML = "▾";
            }
            this.appendChild(order);
            l.loadLogs();
        }
        sizeSpan.onclick = function(e) {
            var order = u.createElement('span', {'id': 'logs_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
                existingOrder = u.getNode('#'+prefix+'logs_sort_order');
            l.sortfunc = l.sortFunctions.size;
            if (localStorage[prefix+'logs_sort'] != 'size') {
                localStorage[prefix+'logs_sort'] = 'size';
            }
            if (this.childNodes.length > 1) {
                // Means the 'order' span is present.  Reverse the list
                if (l.sortToggle) {
                    l.sortToggle = false;
                } else {
                    l.sortToggle = true;
                }
            }
            if (existingOrder) {
                u.removeElement(existingOrder);
            }
            u.toArray(logElemHeader.getElementsByClassName('✈table_header_cell')).forEach(function(item) {
                item.className = '✈table_cell ✈table_header_cell';
            });
            this.className = '✈table_cell ✈table_header_cell ✈active';
            if (l.sortToggle) {
                order.innerHTML = "▴";
            } else {
                order.innerHTML = "▾";
            }
            this.appendChild(order);
            l.loadLogs();
        }
        titleSpan.innerHTML = "Title";
        dateSpan.innerHTML = "Date";
        sizeSpan.innerHTML = "Size";
        if (localStorage[prefix+'logs_sort'] == 'alpha') {
            titleSpan.className = '✈table_cell ✈table_header_cell ✈active';
            titleSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'logs_sort'] == 'date') {
            dateSpan.className = '✈table_cell ✈table_header_cell ✈active';
            dateSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'logs_sort'] == 'size') {
            sizeSpan.className = '✈table_cell ✈table_header_cell ✈active';
            sizeSpan.appendChild(sortOrder);
        }
        logElemHeader.appendChild(titleSpan);
        logElemHeader.appendChild(sizeSpan);
        logElemHeader.appendChild(dateSpan);
        logListContainer.appendChild(logElemHeader);
        logViewContent.appendChild(logListContainer);
        if (existingPanel) {
            // Remove everything first
            while (existingPanel.childNodes.length >= 1 ) {
                existingPanel.removeChild(existingPanel.firstChild);
            }
            existingPanel.appendChild(logHeader);
            existingPanel.appendChild(logViewContent);
        } else {
            logPanel.appendChild(logHeader);
            logPanel.appendChild(logViewContent);
            u.hideElement(logPanel);
            u.getNode(go.prefs.goDiv).appendChild(logPanel);
        }
        var logPreviewIframeDoc = logPreviewIframe.contentWindow.document;
        logPreviewIframeDoc.open();
        logPreviewIframeDoc.write('<html><head><title>' + gettext('Preview Iframe') + '</title></head><body style="background-color: #000; color: #fff; font-size: 1em; font-style: italic;">' + gettext('Click on a log to view a preview and metadata.') + '</body></html>');
        logPreviewIframeDoc.close();
        E.on('go:panel_toggle:in', function(panel) {
            if (panel && panel.id == go.prefs.prefix+'panel_logs') {
                // Make the iframe visible
                u.showElement(logPreviewIframe);
            }
        });
        E.on('go:panel_toggle:out', function(panel) {
            if (panel && panel.id == go.prefs.prefix+'panel_logs') {
                // Make the iframe INvisible
                u.hideElement(logPreviewIframe);
            }
        });
    },
    loadLogs: function(forceUpdate) {
        /**:GateOne.TermLogging.loadLogs(forceUpdate)

        After `GateOne.TermLogging.serverLogs` has been populated this function will redraw the view depending on sort and pagination values.

        If *forceUpdate* empty out `GateOne.TermLogging.serverLogs` and tell the server to send us a new list.
        */
        var u = go.Utils,
            l = go.TermLogging,
            prefix = go.prefs.prefix,
            logCount = 0,
            serverLogs = l.serverLogs.slice(0), // Make a local copy since we're going to mess with it
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logViewHeader = u.getNode('#'+prefix+'logging_title'),
            existingHeader = u.getNode('#'+prefix+'logitems_header'),
            pagination = u.getNode('#'+prefix+'log_pagination'),
            paginationUL = u.getNode('#'+prefix+'log_pagination_ul'),
            logInfoContainer = u.getNode('#'+prefix+'log_info'),
            logListContainer = u.getNode('#'+prefix+'log_listcontainer'),
            logElements = u.toArray(u.getNodes('.✈logitem')),
            maxItems = l.getMaxLogItems(existingPanel) - 4; // -4 should account for the header with a bit of room at the bottom too
        l.delay = 500; // Reset it
        // Make sure the panel is visible
        if (go.Visual.getTransform(existingPanel) != "scale(1)") {
            go.Visual.togglePanel('#'+prefix+'panel_logs');
        }
        existingPanel.style['overflow-y'] = "hidden"; // Only temporary while we're loading
        setTimeout(function() {
            existingPanel.style['overflow-y'] = "auto"; // Set it back after everything is loaded
        }, 1000);
        if (logElements) { // Remove any existing log elements from the list
            logElements.forEach(function(logElem) {
                logElem.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(logElem);
                }, 1000);
            });
        }
        // Remove the pagination UL
        if (paginationUL) {
            u.removeElement(paginationUL);
        };
        if (!l.serverLogs.length || forceUpdate) {
            // Make sure GateOne.Logging.serverLogs is empty and kick off the process to list them
            l.serverLogs = [];
            setTimeout(function() {
                go.ws.send(JSON.stringify({'terminal:logging_get_logs': true}));
            }, 1000); // Let the panel expand before we tell the server to start sending us logs
            return;
        }
        // Apply the sort function
        serverLogs.sort(l.sortfunc);
        if (l.sortToggle) {
            serverLogs.reverse();
        }
        if (l.page) {
            var pageLogs = null;
            if (maxItems*(l.page+1) < serverLogs.length) {
                pageLogs = serverLogs.slice(maxItems*l.page, maxItems*(l.page+1));
            } else {
                pageLogs = serverLogs.slice(maxItems*l.page, serverLogs.length-1);
            }
            pageLogs.forEach(function(logObj) {
                if (logCount < maxItems) {
                    l.createLogItem(logListContainer, logObj, l.delay);
                }
                logCount += 1;
                l.delay += 50;
            });
        } else {
            serverLogs.forEach(function(logObj) {
                if (logCount < maxItems) {
                    l.createLogItem(logListContainer, logObj, l.delay);
                }
                logCount += 1;
                l.delay += 50;
            });
        }
        paginationUL = l.loadPagination(serverLogs, l.page);
        pagination.appendChild(paginationUL);
    },
    getMaxLogItems: function(elem) {
        /**:GateOne.TermLogging.getMaxLogItems(elem)

        Calculates and returns the number of log items that will fit in the given element (*elem*).  *elem* may be a DOM node or an element ID (string).
        */
        var l = go.TermLogging,
            node = u.getNode(elem),
            tempLog = {
                'columns': 203,
                'connect_string': "user@host",
                'end_date': "1324495629180",
                'filename': "20111221142606981294.golog",
                'frames': 108,
                'rows': 56,
                'size': 13817,
                'start_date': "1324495567011",
                'user': "daniel.mcdougall@liftoffsoftware.com",
                'version': "1.0"
            },
            logItemElement = l.createLogItem(node, tempLog, 0),
            nodeStyle = window.getComputedStyle(node, null),
            logElemStyle = window.getComputedStyle(logItemElement, null),
            nodeHeight = parseInt(nodeStyle['height'].split('px')[0]),
            height = parseInt(logElemStyle['height'].split('px')[0]),
            marginBottom = parseInt(logElemStyle['marginBottom'].split('px')[0]),
            paddingBottom = parseInt(logElemStyle['paddingBottom'].split('px')[0]),
            borderBottomWidth = parseInt(logElemStyle['borderBottomWidth'].split('px')[0]),
            borderTopWidth = parseInt(logElemStyle['borderTopWidth'].split('px')[0]),
            logElemHeight = height+marginBottom+paddingBottom+borderBottomWidth+borderTopWidth,
            max = Math.floor(nodeHeight/ logElemHeight);
        u.removeElement(logItemElement); // Don't want this hanging around
        return max;
    },
    loadPagination: function(logItems, /*opt*/page) {
        /**:GateOne.TermLogging.loadPagination(logItems[, page])

        Sets up the pagination for the given array of *logItems* and returns the pagination node.

        If *page* is given, the pagination will highlight the given page number and adjust prev/next accordingly.
        */
        var l = go.TermLogging,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logPaginationUL = u.createElement('ul', {'id': 'log_pagination_ul', 'class': '✈log_pagination ✈halfsectrans'}),
            logViewContent = u.getNode('#'+prefix+'logview_container'),
            maxItems = l.getMaxLogItems(existingPanel) - 4,
            logPages = Math.ceil(logItems.length/maxItems),
            prev = u.createElement('li', {'class': '✈log_page ✈halfsectrans'}),
            next = u.createElement('li', {'class': '✈log_page ✈halfsectrans'});
        // Add the paginator
        if (typeof(page) == 'undefined' || page == null) {
            page = 0;
        }
        if (page == 0) {
            prev.className = '✈log_page ✈halfsectrans ✈inactive';
        } else {
            prev.onclick = function(e) {
                e.preventDefault();
                l.page -= 1;
                l.loadLogs();
            }
        }
        prev.innerHTML = '<a id="'+prefix+'log_prevpage" href="javascript:void(0)">« ' + gettext('Previous') + '</a>';
        logPaginationUL.appendChild(prev);
        if (logPages > 0) {
            for (var i=0; i<=(logPages-1); i++) {
                var li = u.createElement('li', {'class': '✈log_page ✈halfsectrans'});
                if (i == page) {
                    li.innerHTML = '<a class="✈active" href="javascript:void(0)">'+(i+1)+'</a>';
                } else {
                    li.innerHTML = '<a href="javascript:void(0)">'+(i+1)+'</a>';
                    li.title = i+1;
                    li.onclick = function(e) {
                        e.preventDefault();
                        l.page = parseInt(this.title)-1;
                        l.loadLogs();
                    }
                }
                logPaginationUL.appendChild(li);
            }
        } else {
            var li = u.createElement('li', {'class': '✈log_page ✈halfsectrans'});
            li.innerHTML = '<a href="javascript:void(0)" class="✈active">1</a>';
            logPaginationUL.appendChild(li);
        }
        if (page == logPages-1 || logPages == 0) {
            next.className = '✈log_page ✈halfsectrans ✈inactive';
        } else {
            next.onclick = function(e) {
                e.preventDefault();
                l.page += 1;
                l.loadLogs();
            }
        }
        next.innerHTML = '<a id="'+prefix+'log_nextpage" href="javascript:void(0)">Next »</a>';
        logPaginationUL.appendChild(next);
        return logPaginationUL;
    },
    displayMetadata: function(logFile) {
        /**:GateOne.TermLogging.displayMetadata(logFile)

        Displays the information about the log file, *logFile* in the metadata area of the log viewer.
        */
        var l = go.TermLogging,
            prefix = go.prefs.prefix,
            infoDiv = u.getNode('#'+prefix+'log_info'),
            logMetadataDiv = u.getNode('#'+prefix+'log_metadata'),
            previewIframe = u.getNode('#'+prefix+'log_preview'),
            existingButtonRow = u.getNode('#'+prefix+'log_actions_row'),
            buttonRowTitle = u.createElement('div', {'class':'✈log_actions_title'}),
            buttonRow = u.createElement('div', {'id': 'log_actions_row', 'class': '✈metadata_row'}),
            viewFlatButton = u.createElement('button', {'id': 'log_view_flat', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            viewPlaybackButton = u.createElement('button', {'id': 'log_view_playback', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            downloadButton = u.createElement('button', {'id': 'log_download', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            logObj = null;
        if (existingButtonRow) {
            u.removeElement(existingButtonRow);
        }
        buttonRowTitle.innerHTML = gettext("Actions");
        viewFlatButton.innerHTML = gettext("Printable");
        viewFlatButton.title = gettext("Opens a new window with a traditional flat view of the log that can be printed.");
        viewFlatButton.onclick = function(e) {
            l.openLogFlat(logFile);
        }
        viewPlaybackButton.innerHTML = gettext("Open Playback");
        viewPlaybackButton.title = gettext("Opens a new window with a realtime playback of the log.");
        viewPlaybackButton.onclick = function(e) {
            l.openLogPlayback(logFile);
        }
        downloadButton.innerHTML = gettext("Save (HTML)");
        downloadButton.title = gettext("Save a pre-rendered, self-contained recording of this log to disk in HTML format.");
        downloadButton.onclick = function(e) {
            l.saveRenderedLog(logFile);
        }
        // Retreive the metadata on the log in question
        for (var i in l.serverLogs) {
            if (l.serverLogs[i]['filename'] == logFile) {
                logObj = l.serverLogs[i];
            }
        }
        if (!logObj) {
            // Not found, nothing to display
            return;
        }
        var dateObj = new Date(parseInt(logObj['start_date'])),
            dateString = go.Logging.dateFormatter(dateObj),
            metadataNames = {
                'Filename': logObj['filename'],
                'Date': dateString,
                'Frames': logObj['frames'],
                'Size': u.humanReadableBytes(logObj['size'], 2),
                'Rows': logObj['rows'],
                'Columns': logObj['columns']
            };
        l.openLogPlayback(logFile, 'preview');
        // Remove existing content first
        while (logMetadataDiv.childNodes.length >= 1 ) {
            logMetadataDiv.removeChild(logMetadataDiv.firstChild);
        }
        buttonRow.appendChild(buttonRowTitle);
        buttonRow.appendChild(viewFlatButton);
        buttonRow.appendChild(viewPlaybackButton);
        buttonRow.appendChild(downloadButton);
        infoDiv.insertBefore(buttonRow, previewIframe);
        for (var i in metadataNames) {
            var row = u.createElement('div', {'class': '✈metadata_row'}),
                title = u.createElement('div', {'class':'✈metadata_title'}),
                value = u.createElement('div', {'class':'✈metadata_value'});
            title.innerHTML = i;
            value.innerHTML = metadataNames[i];
            row.appendChild(title);
            row.appendChild(value);
            logMetadataDiv.appendChild(row);
        }
    },
    createLogItem: function(container, logObj, delay) {
        /**:GateOne.TermLogging.createLogItem(container, logObj, delay)

        Creates a logItem element using *logObj* and places it in *container*.

        *delay* controls how long it will wait before using a CSS3 effect to move it into view.
        */
        var l = go.TermLogging,
            prefix = go.prefs.prefix,
            logElem = u.createElement('div', {'class':'✈halfsectrans ✈table_row ✈logitem', 'name': prefix+'logitem'}),
            titleSpan = u.createElement('span', {'class':'✈table_cell ✈logitem_title'}),
            dateSpan = u.createElement('span', {'class':'✈table_cell'}),
            sizeSpan = u.createElement('span', {'class':'✈table_cell'}),
            dateObj = new Date(parseInt(logObj['start_date'])),
            dateString = go.Logging.dateFormatter(dateObj);
        titleSpan.innerHTML = "<b>" + logObj['connect_string'] + "</b>";
        dateSpan.innerHTML = dateString;
        sizeSpan.innerHTML = u.humanReadableBytes(logObj['size'], 1);
        logElem.appendChild(titleSpan);
        logElem.appendChild(sizeSpan);
        logElem.appendChild(dateSpan);
        logElem.setAttribute('data-filename', logObj['filename']);
        // JavaScript's function-level scope friggin sucks!
        logElem.onclick = function(e) {
            var filename = this.getAttribute('data-filename'),
                previewIframe = u.getNode('#'+prefix+'log_preview'),
                iframeDoc = previewIframe.contentWindow.document;
            // Highlight the selected row and show the metadata
            u.toArray(u.getNodes('.✈logitem')).forEach(function(node) {
                // Reset them all before we apply the 'active' class to just the one
                node.classList.remove('✈active');
            });
            this.classList.add('✈active');
            iframeDoc.open();
            iframeDoc.write('<html><head><title>' + gettext('Preview Iframe') + '</title></head><body style="background-color: #000; background-image: none; color: #fff; font-size: 1.2em; font-weight: bold; font-style: italic;">' + gettext('Loading Preview...') + '</body></html');
            iframeDoc.close();
            l.displayMetadata(filename);
        }
        logElem.style.opacity = 0;
        go.Visual.applyTransform(logElem, 'translateX(-300%)');
        setTimeout(function() {
            // Fade it in
            logElem.style.opacity = 1;
        }, delay);
        try {
            container.appendChild(logElem);
        } catch(e) {
            u.noop(); // Sometimes the container will be missing between page loads--no biggie
        }
        setTimeout(function() {
            try {
                go.Visual.applyTransform(logElem, '');
            } catch(e) {
                u.noop(); // Element was removed already.  No biggie.
            }
        }, delay);
        return logElem;
    },
    incomingLogAction: function(message) {
        /**:GateOne.TermLogging.incomingLogAction(message)

        Adds *message['log']* to `GateOne.TermLogging.serverLogs` and places it into the view.
        */
        var l = go.TermLogging,
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logViewHeader = u.getNode('#'+prefix+'logging_title'),
            existingHeader = u.getNode('#'+prefix+'logitems_header'),
            pagination = u.getNode('#'+prefix+'log_pagination'),
            existingPaginationUL = u.getNode('#'+prefix+'log_pagination_ul'),
            logListContainer = u.getNode('#'+prefix+'log_listcontainer'),
            logItems = u.toArray(u.getNodes('.✈table_row')),
            maxItems = l.getMaxLogItems(existingPanel) - 4; // -4 should account for the header with a bit of room at the bottom too
        if (message['log']) {
            if (!message['log']['connect_string']) {
                message['log']['connect_string'] = gettext("Title Unknown");
            }
            l.serverLogs.push(message['log']);
        }
        if (logItems.length >= maxItems) {
            l.delay = 500; // Reset it since we're no longer using it
            if (l.paginationTimeout) {
                clearTimeout(l.paginationTimeout);
                l.paginationTimeout = null;
            }
            l.paginationTimeout = setTimeout(function() {
                // De-bouncing this so it doesn't get called 1000 times/sec causing the browser to hang while the logs load.
                var paginationUL = l.loadPagination(l.serverLogs, l.page);
                if (existingPaginationUL) {
                    if (existingPaginationUL.getElementsByClassName('✈log_page').length < paginationUL.getElementsByClassName('✈log_page').length) {
                        pagination.replaceChild(paginationUL, existingPaginationUL);
                    }
                } else {
                    pagination.appendChild(paginationUL);
                }
            }, 250);
            return; // Don't add more than the panel can display
        }
        l.createLogItem(logListContainer, message['log'], l.delay);
        l.delay += 50;
    },
    incomingLogsCompleteAction: function(message) {
        /**:GateOne.TermLogging.incomingLogsCompleteAction(message)

        Sets the header of the log viewer and displays a message to indicate we're done loading.
        */
        var l = go.TermLogging,
            logViewHeader = u.getNode('#'+prefix+'logging_title');
        go.Visual.displayMessage('<b>' + gettext('Log listing complete:') + '</b> ' + l.serverLogs.length + gettext(' logs representing ') + u.humanReadableBytes(message['total_bytes'], 1) + gettext(' of disk space.'));
        logViewHeader.innerHTML = gettext('Log Viewer');
    },
    displayFlatLogAction: function(message) {
        /**:GateOne.TermLogging.displayFlatLogAction(message)

        Opens a new window displaying the (flat) log contained within *message* if there are no errors reported.
        */
        var l = go.TermLogging,
            newWindow, goDiv, css, newContent,
            out = "",
            result = message['result'],
            logLines = message['log'],
            metadata = message['metadata'],
            logViewContent = u.createElement('div', {'id': 'logview_content'}),
            logContainer = u.createElement('div', {'id': 'logview', 'class': '✈terminal', 'style': {'width': '100%', 'height': 'auto', 'right': 0}});
        if (result != "Success") {
            v.displayMessage(gettext("Could not retrieve log: ") + result);
        } else {
            newWindow = window.open('', '_newtab');
            goDiv = u.createElement('div', {'id': go.prefs.goDiv.split('#')[1], 'style': {'width': '100%', 'height': '100%'}}, true);
            css = u.getNodes('style'); // Grab em all
            newContent = "<html><head><title>" + gettext("Gate One Log (Flat): ") + metadata['filename'] + "</title></head><body style='margin: 0;'></body></html>";
            newWindow.focus();
            newWindow.document.write(newContent);
            newWindow.document.close();
            u.toArray(css).forEach(function(styleTag) {
                // Only add the styles that start with go.prefs.prefix
                if (u.startsWith(go.prefs.prefix, styleTag.id)) {
                    newWindow.document.head.appendChild(styleTag.cloneNode(true));
                }
            });
            newWindow.document.body.appendChild(goDiv);
            logContainer.innerHTML = '<pre style="overflow: visible; position: static; white-space: pre-wrap;" class="✈terminal_pre">' + logLines.join('\n') + '</pre>';
            logViewContent.appendChild(logContainer);
            goDiv.style['overflow'] = 'visible';
            goDiv.appendChild(logViewContent);
        }
    },
    displayPlaybackLogAction: function(message) {
        /**:GateOne.TermLogging.displayPlaybackLogAction(message)

        Opens a new window playing back the log contained within *message* if there are no errors reported.
        */
        var l = go.TermLogging,
            result = message['result'],
            logHTML = message['html'],
            where = message['where'],
            metadata = message['metadata'],
            logViewContent = u.createElement('div', {'id': 'logview_container', 'class': '✈logview_container'}),
            logContainer = u.createElement('div', {'id': 'logview', 'class': '✈terminal', 'style': {'width': '100%', 'height': '100%'}});
        if (result != "Success") {
            v.displayMessage(gettext("Could not retrieve log: ") + result);
        } else {
            if (where == 'preview') {
                var previewIframe = u.getNode('#'+prefix+'log_preview'),
                    iframeDoc = previewIframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(logHTML);
                iframeDoc.close();
            } else {
                var newWindow = window.open('', '_newtab');
                newWindow.focus();
                newWindow.document.write(logHTML);
                newWindow.document.close();
            }
        }
    },
    openLogFlat: function(logFile) {
        /**:GateOne.TermLogging.openLogFlat(logFile)

        Tells the server to open *logFile* for playback via the 'terminal:logging_get_log_flat' server-side WebSocket action (will end up calling :js:meth:`~GateOne.TermLogging.displayFlatLogAction`.
        */
        var theme_css = u.getNode('#'+prefix+'theme').innerHTML,
            colors_css = u.getNode('#'+prefix+'text_colors').innerHTML,
            message = {
                'log_filename': logFile,
                'theme_css': theme_css,
                'colors_css': colors_css
            };
        go.ws.send(JSON.stringify({'terminal:logging_get_log_flat': message}));
        go.Visual.displayMessage(logFile + gettext(' will be opened in a new window when rendering is complete.  Large logs can take some time so please be patient.'));
    },
    openLogPlayback: function(logFile, /*opt*/where) {
        /**:GateOne.TermLogging.openLogPlayback(logFile[, where])

        Tells the server to open *logFile* for playback via the 'terminal:logging_get_log_playback' server-side WebSocket action (will end up calling :js:meth:`~GateOne.TermLogging.displayPlaybackLogAction`.

        If *where* is given and it is set to 'preview' the playback will happen in the log_preview iframe.
        */
        var theme_css = u.getNode('#'+prefix+'theme').innerHTML,
            colors_css = u.getNode('#'+prefix+'text_colors').innerHTML,
            message = {
                'log_filename': logFile,
                'theme_css': theme_css,
                'colors_css': colors_css
            };
        if (where) {
            message['where'] = where;
        } else {
            go.Visual.displayMessage(logFile + gettext(' will be opened in a new window when rendering is complete.  Large logs can take some time so please be patient.'));
        }
        go.ws.send(JSON.stringify({'terminal:logging_get_log_playback': message}));
    },
    saveRenderedLog: function(logFile) {
        /**:GateOne.TermLogging.saveRenderedLog(logFile)

        Tells the server to open *logFile* rendered as a self-contained recording (via the 'logging_get_log_file' WebSocket action) and send it back to the browser for saving (using the 'save_file' WebSocket action).
        */
        var theme_css = u.getNode('#'+prefix+'theme').innerHTML,
            colors_css = u.getNode('#'+prefix+'text_colors').innerHTML,
            message = {
                'log_filename': logFile,
                'theme_css': theme_css,
                'colors_css': colors_css
            };
        go.ws.send(JSON.stringify({'terminal:logging_get_log_file': message}));
        go.Visual.displayMessage(logFile + gettext(' will be downloaded when rendering is complete.  Large logs can take some time so please be patient.'));
    },
    sortFunctions: {
        /**:GateOne.TermLogging.sortFunctions

        An associative array of functions that are used to sort logs.  When the user clicks on one of the sorting options it assigns one of these functions to :js:meth:`GateOne.TermLogging.sortfunc` which is then applied like so::

            logs.sort(GateOne.TermLogging.sortfunc);
        */
        date: function(a,b) {
            /**:GateOne.TermLogging.sortFunctions.date(a, b)

            Sorts logs by date (start_date) followed by alphabetical order of the title (connect_string).
            */
            if (a.start_date === b.start_date) {
                var x = a.connect_string.toLowerCase(), y = b.connect_string.toLowerCase();
                return x < y ? -1 : x > y ? 1 : 0;
            }
            if (a.start_date > b.start_date) {
                return -1;
            }
            if (a.start_date < b.start_date) {
                return 1;
            }
        },
        alphabetical: function(a,b) {
            /**:GateOne.TermLogging.sortFunctions.alphabetical(a, b)

            Sorts logs alphabetically using the title (connect_string).
            */
            var x = a.connect_string.toLowerCase(), y = b.connect_string.toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        },
        size: function(a,b) {
            /**:GateOne.TermLogging.sortFunctions.alphabetical(a, b)

            Sorts logs according to their size.
            */
            if (a.size === b.size) {
                var x = a.connect_string.toLowerCase(), y = b.connect_string.toLowerCase();
                return x < y ? -1 : x > y ? 1 : 0;
            }
            if (a.size > b.size) {
                return -1;
            }
            if (a.size < b.size) {
                return 1;
            }
        },
    },
    toggleSortOrder: function() {
        /**:GateOne.TermLogging.toggleSortOrder()

        Reverses the order of the logs array.
        */
        var l = go.TermLogging;
        if (l.sortToggle) {
            l.sortToggle = false;
            l.loadLogs();
        } else {
            l.sortToggle = true;
            l.loadLogs();
        }
    }
});

});
