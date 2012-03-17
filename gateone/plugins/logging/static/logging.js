(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// TODO: Move the parts that load and render logs in separate windows into Web Workers so they don't hang the browser while they're being rendered.
// TODO: Bring back *some* client-side logging so things like displayMessage() have somewhere to temporarily store messages so users can look back to re-read them (e.g. Which terminal was that bell just in?).  Probably put it in sessionStorage

// GateOne.Logging
GateOne.Base.module(GateOne, "Logging", '1.0', ['Base', 'Net']);
GateOne.Logging.levels = {
    // Forward and backward
    50: 'FATAL',
    40: 'ERROR',
    30: 'WARNING',
    20: 'INFO',
    10: 'DEBUG',
    'FATAL': 50,
    'ERROR': 40,
    'WARNING': 30,
    'INFO': 20,
    'DEBUG': 10
};
// Tunable logging prefs
if (!GateOne.prefs.logLevel) {
    GateOne.prefs.logLevel = 'INFO';
}
GateOne.noSavePrefs['level'] = null; // This ensures that the logging level isn't saved along with everything else if the user clicks "Save" in the settings panel
GateOne.Logging.level = GateOne.prefs.logLevel; // This allows it to be adjusted at the client
GateOne.Logging.serverLogs = [];
GateOne.Logging.sortToggle = false;
GateOne.Logging.searchFilter = null;
GateOne.Logging.page = 0; // Used to tracking pagination
GateOne.Logging.delay = 500;
GateOne.Base.update(GateOne.Logging, {
    init: function() {
        var go = GateOne,
            l = go.Logging,
            u = go.Utils,
            prefix = go.prefs.prefix,
            pTag = u.getNode('#'+prefix+'info_actions'),
            infoPanelViewLogs = u.createElement('button', {'id': 'logging_viewlogs', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
        infoPanelViewLogs.innerHTML = "Log Viewer";
        infoPanelViewLogs.title = "Opens a panel where you can browse, preview, and open all of your server-side session logs."
        infoPanelViewLogs.onclick = function() {
            l.loadLogs(true);
        }
        pTag.appendChild(infoPanelViewLogs);
        l.createPanel();
        // Default sort order is by date, descending, followed by alphabetical order of the title
        l.sortfunc = l.sortFunctions.date;
        localStorage[prefix+'logs_sort'] = 'date';
        // Register our WebSocket actions
        go.Net.addAction('logging_log', l.incomingLogAction);
        go.Net.addAction('logging_logs_complete', l.incomingLogsCompleteAction);
        go.Net.addAction('logging_log_flat', l.displayFlatLogAction);
        go.Net.addAction('logging_log_playback', l.displayPlaybackLogAction);
    },
    setLevel: function(level) {
        // Sets the log level to an integer if the given a string (e.g. "DEBUG").  Leaves it as-is if it's already a number.
        var l = GateOne.Logging;
        if (level === parseInt(level,10)) { // It's an integer, set it as-is
            l.level = level;
        } else { // It's a string, convert it first
            levelStr = level;
            level = l.levels[levelStr]; // Get integer
            l.level = level;
        }
    },
    /** @id MochiKit.Logging.Logger.prototype.logToConsole */
    logToConsole: function (msg) {
        if (typeof(window) != "undefined" && window.console && window.console.log) {
            // Safari and FireBug 0.4
            // Percent replacement is a workaround for cute Safari crashing bug
            window.console.log(msg.replace(/%/g, '\uFF05'));
        } else if (typeof(opera) != "undefined" && opera.postError) {
            // Opera
            opera.postError(msg);
        } else if (typeof(Debug) != "undefined" && Debug.writeln) {
            // IE Web Development Helper (?)
            // http://www.nikhilk.net/Entry.aspx?id=93
            Debug.writeln(msg);
        } else if (typeof(debug) != "undefined" && debug.trace) {
            // Atlas framework (?)
            // http://www.nikhilk.net/Entry.aspx?id=93
            debug.trace(msg);
        }
    },
    log: function(msg, level, destination) {
        /*
        Logs the given *msg* using all of the functions in GateOne.Logging.destinations after being prepended with the date and a string indicating the log level (e.g. "692011-10-25 10:04:28 INFO <msg>") *if* *level* is determined to be greater than the value of GateOne.Logging.level.  If the given *level* is not greater than GateOne.Logging.level *msg* will be discarded (noop).

        *level* can be provided as a string, an integer, null, or be left undefined:

             If an integer, an attempt will be made to convert it to a string using GateOne.Logging.levels but if this fails it will use "lvl:<integer>" as the level string.
             If a string, an attempt will be made to obtain an integer value using GateOne.Logging.levels otherwise GateOne.Logging.level will be used (to determine whether or not the message should actually be logged).
             If undefined, the level will be set to GateOne.Logging.level.
             If null (as opposed to undefined), level info will not be included in the log message.

        If *destination* is given (must be a function) it will be used to log messages like so: destination(message).  The usual conversion of *msg* to *message* will apply.
        */
        var l = GateOne.Logging,
            now = new Date(),
            message = "";
        if (typeof(level) == 'undefined') {
            level = l.level;
        }
        if (level === parseInt(level,10)) { // It's an integer
            if (l.levels[level]) {
                levelStr = l.levels[level]; // Get string
            } else {
                levelStr = "lvl:" + level;
            }
        } else if (typeof(level) == "string") { // It's a string
            levelStr = level;
            if (l.levels[levelStr]) {
                level = l.levels[levelStr]; // Get integer
            } else {
                level = l.level;
            }
        }
        if (level == null) {
            message = l.dateFormatter(now) + " " + msg;
        } else if (level >= l.level) {
            message = l.dateFormatter(now) + ' ' + levelStr + " " + msg;
        }
        if (message) {
            if (!destination) {
                for (var dest in l.destinations) {
                    l.destinations[dest](message);
                }
            } else {
                destination(message);
            }
        }
    },
    // Shortcuts for each log level
    logFatal: function(msg) { GateOne.Logging.log(msg, 'FATAL') },
    logError: function(msg) { GateOne.Logging.log(msg, 'ERROR') },
    logWarning: function(msg) { GateOne.Logging.log(msg, 'WARNING') },
    logInfo: function(msg) { GateOne.Logging.log(msg, 'INFO') },
    logDebug: function(msg) { GateOne.Logging.log(msg, 'DEBUG') },
    addDestination: function(name, dest) {
        // Creates a new log destination named, *name* that calls function *dest* like so:
        //     dest(<log message>)
        //
        // Example:
        //     GateOne.Logging.addDestination('screen', GateOne.Visual.displayMessage);
        // NOTE: The above example is kind of fun.  Try it!
        GateOne.Logging.destinations[name] = dest;
    },
    removeDestination: function(name) {
        // Removes the given log destination from GateOne.Logging.destinations
        if (GateOne.Logging.destinations[name]) {
            delete GateOne.Logging.destinations[name];
        } else {
            GateOne.Logging.logError("No log destination named, '" + name + "'.");
        }
    },
    dateFormatter: function(dateObj) {
        // Converts a Date() object into string suitable for logging
        // e.g. 2011-05-29 13:24:03
        var year = dateObj.getFullYear(),
            month = dateObj.getMonth() + 1, // JS starts months at 0
            day = dateObj.getDate(),
            hours = dateObj.getHours(),
            minutes = dateObj.getMinutes(),
            seconds = dateObj.getSeconds();
        // pad a 0 so it doesn't look silly
        if (month < 10) {
            month = "0" + month;
        }
        if (day < 10) {
            day = "0" + day;
        }
        if (hours < 10) {
            hours = "0" + hours;
        }
        if (minutes < 10) {
            minutes = "0" + minutes;
        }
        if (seconds < 10) {
            seconds = "0" + seconds;
        }
        return year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds;
    },
    createPanel: function() {
        // Creates the logging panel (just the empty shell)
        var go = GateOne,
            u = go.Utils,
            l = go.Logging,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logPanel = u.createElement('div', {'id': 'panel_logs', 'class': 'panel sectrans'}),
            logHeader = u.createElement('div', {'id': 'log_view_header', 'class': 'sectrans'}),
            logHeaderH2 = u.createElement('h2', {'id': 'logging_title'}),
            logHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': 'panel_close_icon', 'title': "Close This Panel"}),
            logViewContent = u.createElement('div', {'id': 'logview_container', 'class': 'sectrans'}),
            logPagination = u.createElement('div', {'id': 'log_pagination', 'class': 'sectrans'}),
            logInfoContainer = u.createElement('div', {'id': 'log_info'}),
            logListContainer = u.createElement('div', {'id': 'log_listcontainer'}),
            logPreviewIframe = u.createElement('iframe', {'id': 'log_preview'}),
            hr = u.createElement('hr'),
            logElemHeader = u.createElement('div', {'id': 'logitems_header', 'class':'table_header_row'}),
            titleSpan = u.createElement('span', {'id': 'log_titlespan', 'class':'table_cell table_header_cell'}),
            dateSpan = u.createElement('span', {'id': 'log_datespan', 'class':'table_cell table_header_cell'}),
            sizeSpan = u.createElement('span', {'id': 'log_sizespan', 'class':'table_cell table_header_cell'}),
            sortOrder = u.createElement('span', {'id': 'logs_sort_order', 'style': {'float': 'right', 'margin-left': '.3em', 'margin-top': '-.2em'}}),
            logMetadataDiv = u.createElement('div', {'id': 'log_metadata'});
        logHeaderH2.innerHTML = 'Log Viewer: Loading...';
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
            iframeDoc.write('<html><head><title>Preview Iframe</title></head><body style="background-color: #000; color: #fff; font-size: 1em; font-style: italic;">Click on a log to view a preview and metadata.</body></html>');
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
            u.toArray(logElemHeader.getElementsByClassName('table_header_cell')).forEach(function(item) {
                item.className = 'table_cell table_header_cell';
            });
            this.className = 'table_cell table_header_cell active';
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
            u.toArray(logElemHeader.getElementsByClassName('table_header_cell')).forEach(function(item) {
                item.className = 'table_cell table_header_cell';
            });
            this.className = 'table_cell table_header_cell active';
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
            u.toArray(logElemHeader.getElementsByClassName('table_header_cell')).forEach(function(item) {
                item.className = 'table_cell table_header_cell';
            });
            this.className = 'table_cell table_header_cell active';
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
            titleSpan.className = 'table_cell table_header_cell active';
            titleSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'logs_sort'] == 'date') {
            dateSpan.className = 'table_cell table_header_cell active';
            dateSpan.appendChild(sortOrder);
        } else if (localStorage[prefix+'logs_sort'] == 'size') {
            sizeSpan.className = 'table_cell table_header_cell active';
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
            u.getNode(go.prefs.goDiv).appendChild(logPanel);
        }
        var logPreviewIframeDoc = logPreviewIframe.contentWindow.document;
        logPreviewIframeDoc.open();
        logPreviewIframeDoc.write('<html><head><title>Preview Iframe</title></head><body style="background-color: #000; color: #fff; font-size: 1em; font-style: italic;">Click on a log to view a preview and metadata.</body></html>');
        logPreviewIframeDoc.close();
    },
    loadLogs: function(forceUpdate) {
        // After GateOne.Logging.serverLogs has been populated, this function will redraw the view depending on sort and pagination values
        // If *forceUpdate*, empty out GateOne.Logging.serverLogs and tell the server to send us a new list.
        var go = GateOne,
            u = go.Utils,
            l = go.Logging,
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
            logElements = u.toArray(document.getElementsByClassName('table_row')),
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
                go.ws.send(JSON.stringify({'logging_get_logs': true}));
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
    // Calculates and returns the number of log items that will fit in the given element ID (elem).
        try {
            var go = GateOne,
                l = go.Logging,
                u = go.Utils,
                node = u.getNode(elem),
                tempLog = {
                    'cols': 203,
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
                logItemElement = l.createLogItem(node, tempLog, 500);
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
        } catch(e) {
            return 1;
        }
        u.removeElement(logItemElement); // Don't want this hanging around
        return max;
    },
    loadPagination: function(logItems, /*opt*/page) {
        // Sets up the pagination for the given array of *logItems* and returns the pagination node.
        // If *page* is given, the pagination will highlight the given page number and adjust prev/next accordingly
        var go = GateOne,
            l = go.Logging,
            u = go.Utils,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logPaginationUL = u.createElement('ul', {'id': 'log_pagination_ul', 'class': 'log_pagination halfsectrans'}),
            logViewContent = u.getNode('#'+prefix+'logview_container'),
            maxItems = l.getMaxLogItems(existingPanel) - 4,
            logPages = Math.ceil(logItems.length/maxItems),
            prev = u.createElement('li', {'class': 'log_page halfsectrans'}),
            next = u.createElement('li', {'class': 'log_page halfsectrans'});
        // Add the paginator
        if (typeof(page) == 'undefined' || page == null) {
            page = 0;
        }
        if (page == 0) {
            prev.className = 'log_page halfsectrans inactive';
        } else {
            prev.onclick = function(e) {
                e.preventDefault();
                l.page -= 1;
                l.loadLogs();
            }
        }
        prev.innerHTML = '<a id="'+prefix+'log_prevpage" href="javascript:void(0)">« Previous</a>';
        logPaginationUL.appendChild(prev);
        if (logPages > 0) {
            for (var i=0; i<=(logPages-1); i++) {
                var li = u.createElement('li', {'class': 'log_page halfsectrans'});
                if (i == page) {
                    li.innerHTML = '<a class="active" href="javascript:void(0)">'+(i+1)+'</a>';
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
            var li = u.createElement('li', {'class': 'log_page halfsectrans'});
            li.innerHTML = '<a href="javascript:void(0)" class="active">1</a>';
            logPaginationUL.appendChild(li);
        }
        if (page == logPages-1 || logPages == 0) {
            next.className = 'log_page halfsectrans inactive';
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
        // Displays the information about the log file, *logFile* in the logview panel.
        var go = GateOne,
            u = go.Utils,
            l = go.Logging,
            prefix = go.prefs.prefix,
            infoDiv = u.getNode('#'+prefix+'log_info'),
            logMetadataDiv = u.getNode('#'+prefix+'log_metadata'),
            previewIframe = u.getNode('#'+prefix+'log_preview'),
            existingButtonRow = u.getNode('#'+prefix+'log_actions_row'),
            buttonRowTitle = u.createElement('div', {'class':'log_actions_title'}),
            buttonRow = u.createElement('div', {'id': 'log_actions_row', 'class': 'metadata_row'}),
            viewFlatButton = u.createElement('button', {'id': 'log_view_flat', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            viewPlaybackButton = u.createElement('button', {'id': 'log_view_playback', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            downloadButton = u.createElement('button', {'id': 'log_download', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            logObj = null;
        if (existingButtonRow) {
            u.removeElement(existingButtonRow);
        }
        buttonRowTitle.innerHTML = "Actions";
        viewFlatButton.innerHTML = "View Log (Flat)";
        viewFlatButton.title = "Opens a new window with a traditional flat view of the log.";
        viewFlatButton.onclick = function(e) {
            l.openLogFlat(logFile);
        }
        viewPlaybackButton.innerHTML = "View Log (Playback)";
        viewPlaybackButton.title = "Opens a new window with a realtime playback of the log.";
        viewPlaybackButton.onclick = function(e) {
            l.openLogPlayback(logFile);
        }
        downloadButton.innerHTML = "Save Log (HTML)";
        downloadButton.title = "Save a pre-rendered, self-contained recording of this log to disk in HTML format.";
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
            dateString = l.dateFormatter(dateObj),
            metadataNames = {
                'Filename': logObj['filename'],
                'Date': dateString,
                'Frames': logObj['frames'],
                'Size': logObj['size'],
                'Rows': logObj['rows'],
                'Columns': logObj['cols']
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
            var row = u.createElement('div', {'class': 'metadata_row'}),
                title = u.createElement('div', {'class':'metadata_title'}),
                value = u.createElement('div', {'class':'metadata_value'});
            title.innerHTML = i;
            value.innerHTML = metadataNames[i];
            row.appendChild(title);
            row.appendChild(value);
            logMetadataDiv.appendChild(row);
        }
    },
    createLogItem: function(container, logObj, delay) {
        // Creates a logItem element using *logObj* and places it into *container*.
        // *delay* controls how long it will wait before using a CSS3 effect to move it into view.
        var go = GateOne,
            u = go.Utils,
            l = go.Logging,
            prefix = go.prefs.prefix,
            logElem = u.createElement('div', {'class':'halfsectrans table_row', 'name': prefix+'logitem'}),
            titleSpan = u.createElement('span', {'class':'table_cell logitem_title'}),
            dateSpan = u.createElement('span', {'class':'table_cell'}),
            sizeSpan = u.createElement('span', {'class':'table_cell'}),
            dateObj = new Date(parseInt(logObj['start_date'])),
            dateString = l.dateFormatter(dateObj);
        titleSpan.innerHTML = "<b>" + logObj['connect_string'] + "</b>";
        dateSpan.innerHTML = dateString;
        sizeSpan.innerHTML = l.humanReadableBytes(logObj['size'], 1);
        logElem.appendChild(titleSpan);
        logElem.appendChild(sizeSpan);
        logElem.appendChild(dateSpan);
        with ({ filename: logObj['filename'] }) {
            logElem.onclick = function(e) {
                var previewIframe = u.getNode('#'+prefix+'log_preview'),
                    iframeDoc = previewIframe.contentWindow.document;
                // Highlight the selected row and show the metadata
                u.toArray(u.getNodes('.table_row')).forEach(function(node) {
                    // Reset them all before we apply the 'active' class to just the one
                    node.className = 'halfsectrans table_row';
                });
                this.className = 'halfsectrans table_row active';
                iframeDoc.open();
                iframeDoc.write('<html><head><title>Preview Iframe</title></head><body style="background-color: #000; background-image: none; color: #fff; font-size: 1.2em; font-weight: bold; font-style: italic;">Loading Preview...</body></html');
                iframeDoc.close();
                l.displayMetadata(filename);
            }
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
        // Adds *message['log']* to GateOne.Logging.serverLogs and places it into the view.
        var go = GateOne,
            u = go.Utils,
            l = go.Logging,
            prefix = go.prefs.prefix,
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logViewHeader = u.getNode('#'+prefix+'logging_title'),
            existingHeader = u.getNode('#'+prefix+'logitems_header'),
            pagination = u.getNode('#'+prefix+'log_pagination'),
            existingPaginationUL = u.getNode('#'+prefix+'log_pagination_ul'),
            logListContainer = u.getNode('#'+prefix+'log_listcontainer'),
            logItems = document.getElementsByClassName('table_row'),
            maxItems = l.getMaxLogItems(existingPanel) - 4; // -4 should account for the header with a bit of room at the bottom too
        if (message['log']) {
            if (!message['log']['connect_string']) {
                message['log']['connect_string'] = "Title Unknown";
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
                // De-bouncing this so it doesn't get called 1000 times/sec causing the browser to hang while the loads load.
                var paginationUL = l.loadPagination(l.serverLogs, l.page);
                if (existingPaginationUL) {
                    if (existingPaginationUL.getElementsByClassName('log_page').length < paginationUL.getElementsByClassName('log_page').length) {
                        pagination.replaceChild(paginationUL, existingPaginationUL);
                    }
                } else {
                    pagination.appendChild(paginationUL);
                }
            }, 500);
            return; // Don't add more than the panel can display
        }
        l.createLogItem(logListContainer, message['log'], l.delay);
        l.delay += 50;
    },
    incomingLogsCompleteAction: function(message) {
        // Just sets the header to indicate we're done loading
        var go = GateOne,
            u = go.Utils,
            l = go.Logging,
            prefix = go.prefs.prefix,
            logViewHeader = u.getNode('#'+prefix+'logging_title');
        go.Visual.displayMessage('<b>Log listing complete:</b> ' + message['total_logs'] + ' logs representing ' + l.humanReadableBytes(message['total_bytes'], 1) + ' of disk space.');
        logViewHeader.innerHTML = 'Log Viewer';
    },
    displayFlatLogAction: function(message) {
        // Opens a new window displaying the (flat) log contained within *message* if there are no errors reported
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            l = go.Logging,
            prefix = go.prefs.prefix,
            result = message['result'],
            logLines = message['log'],
            metadata = message['metadata'],
            logViewContent = u.createElement('div', {'id': 'logview_container'}),
            logContainer = u.createElement('div', {'id': 'logview', 'class': 'terminal', 'style': {'width': '100%', 'height': '100%'}});
        if (result != "Success") {
            v.displayMessage("Could not retrieve log: " + result);
        } else {
            var newWindow = window.open('', '_newtab'),
                goDiv = u.createElement('div', {'id': go.prefs.goDiv.split('#')[1]}, true),
                cssTheme = u.getNode('#'+prefix+'go_css_theme').cloneNode(true),
                cssColors = u.getNode('#'+prefix+'go_css_colors').cloneNode(true),
                newContent = "<html><head><title>Gate One Log (Flat): " + metadata['filename'] + "</title></head><body></body></html>";
            newWindow.focus();
            newWindow.document.write(newContent);
            newWindow.document.close();
            newWindow.document.head.appendChild(cssTheme);
            newWindow.document.head.appendChild(cssColors);
            newWindow.document.body.appendChild(goDiv);
            logContainer.innerHTML = '<pre style="height: 100%; overflow: auto; position: static; white-space: pre-line;">' + logLines.join('\n') + '</pre>';
            logViewContent.appendChild(logContainer);
            goDiv.appendChild(logViewContent);
        }
    },
    displayPlaybackLogAction: function(message) {
        // Opens a new window playing back the log contained within *message* if there are no errors reported
        var go = GateOne,
            u = go.Utils,
            v = go.Visual,
            l = go.Logging,
            prefix = go.prefs.prefix,
            result = message['result'],
            logHTML = message['html'],
            where = message['where'],
            metadata = message['metadata'],
            logViewContent = u.createElement('div', {'id': 'logview_container'}),
            logContainer = u.createElement('div', {'id': 'logview', 'class': 'terminal', 'style': {'width': '100%', 'height': '100%'}});
        if (result != "Success") {
            v.displayMessage("Could not retrieve log: " + result);
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
        // Tells the server to open *logFile* for playback (will end up calling displayFlatLogAction())
        var go = GateOne,
            message = {
                'log_filename': logFile,
                'theme': go.prefs.theme,
                'colors': go.prefs.colors
            };
        go.ws.send(JSON.stringify({'logging_get_log_flat': message}));
        go.Visual.displayMessage(logFile + ' will be opened in a new window when rendering is complete.  Large logs can take some time so please be patient.');
    },
    openLogPlayback: function(logFile, /*opt*/where) {
        // Tells the server to open *logFile* for playback (will end up calling displayPlaybackLogAction())
        // If *where* is given and it is set to 'preview' the playback will happen in the log_preview iframe.
        var go = GateOne,
            message = {
                'log_filename': logFile,
                'theme': go.prefs.theme,
                'colors': go.prefs.colors
            };
        if (where) {
            message['where'] = where;
        } else {
            go.Visual.displayMessage(logFile + ' will be opened in a new window when rendering is complete.  Large logs can take some time so please be patient.');
        }
        go.ws.send(JSON.stringify({'logging_get_log_playback': message}));
    },
    saveRenderedLog: function(logFile) {
        // Tells the server to open *logFile*, rendere it as a self-contained recording, and send it back to the browser for saving (using the save_file action).
        var go = GateOne,
            message = {
                'log_filename': logFile,
                'theme': go.prefs.theme,
                'colors': go.prefs.colors
            };
        go.ws.send(JSON.stringify({'logging_get_log_file': message}));
        go.Visual.displayMessage(logFile + ' will be downloaded when rendering is complete.  Large logs can take some time so please be patient.');
    },
    sortFunctions: {
        date: function(a,b) {
            // Sorts by date (start_date) followed by alphabetical order of the title (connect_string)
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
            // Sorts alphabetically using the title (connect_string)
            var x = a.connect_string.toLowerCase(), y = b.connect_string.toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        },
        size: function(a,b) {
            // Sorts logs according to their size
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
        // Reverses the order of the log list
        var go = GateOne,
            l = go.Logging,
            u = go.Utils,
            prefix = go.prefs.prefix;
        if (l.sortToggle) {
            l.sortToggle = false;
            l.loadLogs();
        } else {
            l.sortToggle = true;
            l.loadLogs();
        }
    },
    humanReadableBytes: function(bytes, /*opt*/precision) {
        // Returns *bytes* as a human-readable string in a similar fashion to how it would be displayed by 'ls -lh' or 'df -h'.
        // If *precision* (integer) is given, it will be used to determine the number of decimal points to use when rounding.  Otherwise it will default to 0
        var sizes = ['', 'K', 'M', 'G', 'T'],
            postfix = 0;
        bytes = parseInt(bytes); // Just in case we get passed *bytes* as a string
        if (!precision) {
            precision = 0;
        }
        if (bytes == 0) return 'n/a';
        if (bytes > 1024) {
            while( bytes >= 1024 ) {
                postfix++;
                bytes = bytes / 1024;
            }
            return bytes.toFixed(precision) + sizes[postfix];
        } else {
            // Just return the bytes as-is (as a string)
            return bytes + "";
        }
    }
});

GateOne.Logging.destinations = { // Default to console logging.
    'console': GateOne.Logging.logToConsole // Can be added to or replaced/removed
    // If anyone has any cool ideas for log destinations please let us know!
}

// Initialize the logger immediately upon loading of the module (before init())
if (typeof(GateOne.Logging.level) == 'string') {
    // Convert to integer
    GateOne.Logging.level = GateOne.Logging.levels[GateOne.Logging.level];
}

})(window);
