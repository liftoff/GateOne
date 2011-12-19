(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// TODO: Investigate moving *all* the log storage to the server.  I had intended to have the server support logging regardless but the overhead associated with keeping logs on the client end is quite high.  It would probably provide a better overall user experience if the logs were stored on the server with the client having the ability to request the on demand.

// Tunable logging prefs
GateOne.prefs.logLevel = 'INFO';

// GateOne.Logging
GateOne.Base.module(GateOne, "Logging", '0.9', ['Base', 'Net']);
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
GateOne.Logging.level = GateOne.prefs.logLevel;
GateOne.Base.update(GateOne.Logging, {
// IMPORTANT NOTE:  Client-side logging of lines (basic) has been disabled due to serious performance problems.  Essentially, JavaScript sucks at this sort of operation and the 5MB limit really screws with the usefulness of it.  Server-side logging will have to be the implemented in a way that's transparent to the client.
    init: function() {
        var go = GateOne,
            l = go.Logging,
            u = go.Utils;
        // Register our WebSocket actions
        go.Net.addAction('logging_logs', l.logsListAction);
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
    logsListAction: function(message) {
        // Called when we receive the "logging_logs" action over the WebSocket...
        // Displays a listing of the user's log files
        var go = GateOne,
            u = go.Utils,
            l = go.Logging,
            prefix = go.prefs.prefix,
            logs = message['logs'],
            existingPanel = u.getNode('#'+prefix+'panel_logs'),
            logViewPanel = u.createElement('div', {'id': prefix+'panel_logs', 'class': 'panel sectrans'}),
            logViewHeader = u.createElement('div', {'id': prefix+'log_view_header', 'class': 'sectrans'}),
            logViewHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            logViewContent = u.createElement('div', {'id': prefix+'logview_container', 'class': 'sectrans'}),
            logInfoContainer = u.createElement('div');
//         connect_string,,end_date,1323872159020,filename,20111214091558965654.golog,version,1.0,user,daniel.mcdougall@liftoffsoftware.com,frames,4,start_date,1323872158997,size,278
        for (var i in logs) {
            var logObj = logs[i],
                logElem = u.createElement('div', {'class':'logitem'}),
                filenameDiv = u.createElement('span'),
                titleDiv = u.createElement('span'),
                beginDiv = u.createElement('div'),
                sizeDiv = u.createElement('div'),
                dateObj = new Date(parseInt(logObj['start_date'])),
                dateString = l.dateFormatter(dateObj);
            if (!logObj['connect_string']) {
                logObj['connect_string'] = "Title Unknown";
            } // 26669 2011-12-13 20:25
            titleDiv.innerHTML = logObj['connect_string'] + " " + logObj['size'] + " " + dateString;
            filenameDiv.innerHTML = "<b>File:</b> " + logObj['filename'];
            beginDiv.innerHTML = "<b>Date:</b> " + dateObj.getFullYear() + "-" + dateObj.getMonth();
            sizeDiv.innerHTML = "<b>Size:</b> " + logObj['size'];
            logElem.appendChild(titleDiv);
//             logElem.appendChild(filenameDiv);
//             logElem.appendChild(beginDiv);
            logElem.appendChild(sizeDiv);
            logInfoContainer.appendChild(logElem);
        }
        logViewHeader.innerHTML = '<h2>Logging Plugin: View Logs</h2>';
        logViewHeader.appendChild(logViewHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        logViewContent.appendChild(logInfoContainer);
        if (existingPanel) {
            // Remove everything first
            while (existingPanel.childNodes.length >= 1 ) {
                existingPanel.removeChild(existingPanel.firstChild);
            }
            existingPanel.appendChild(logViewHeader);
            existingPanel.appendChild(logViewContent);
        } else {
            logViewPanel.appendChild(logViewHeader);
            logViewPanel.appendChild(logViewContent);
            u.getNode(go.prefs.goDiv).appendChild(logViewPanel);
        }
        go.Visual.togglePanel('#'+prefix+'panel_logs');
    }
});

GateOne.Logging.destinations = { // Default to console logging.
    'console': GateOne.Logging.logToConsole, // Can be added to or replaced/removed
    // If anyone has any cool ideas for log destinations please let us know!
}

// Initialize the logger immediately upon loading of the module (before init())
if (typeof(GateOne.Logging.level) == 'string') {
    // Convert to integer
    GateOne.Logging.level = GateOne.Logging.levels[GateOne.Logging.level];
}
// GateOne.Logging.openDB();

})(window);