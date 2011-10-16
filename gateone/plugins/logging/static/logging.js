(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// NOTE: indexedDB use has been disabled until I can figure out a fast/clean way to trim the database so it doesn't grow indefinitely.

// TODO: Make it so that when a user clicks on the "view log" button it only shows the log lines from the current terminal (not all of them).
// TODO: Investigate moving *all* the log storage to the server.  I had intended to have the server support logging regardless but the overhead associated with keeping logs on the client end is quite high.  It would probably provide a better overall user experience if the logs were stored on the server with the client having the ability to request the on demand.

// Set the indexedDB variable as a global (within sandbox) attached to the right indexedDB implementation
indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
if ('webkitIndexedDB' in window) {
    window.IDBTransaction = window.webkitIDBTransaction;
    window.IDBKeyRange = window.webkitIDBKeyRange;
}

// Tunable logging prefs
GateOne.prefs.logLevel = 'INFO';
GateOne.prefs.logLines = 2000;

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
GateOne.Logging.queue = []; // For queuing log messages going into localStorage
GateOne.Base.update(GateOne.Logging, {
// IMPORTANT NOTE:  Client-side logging of lines (basic) has been disabled due to serious performance problems.  Essentially, JavaScript sucks at this sort of operation and the 5MB limit really screws with the usefulness of it.  Server-side logging will have to be the implemented in a way that's transparent to the client.
//     init: function() {
//         // Logging GUI stuff
//         var go = GateOne,
//             u = go.Utils,
//             prefix = go.prefs.prefix,
//             p = u.getNode('#'+prefix+'info_actions'),
//             infoPanelViewLog = u.createElement('button', {'id': prefix+'viewlog', 'type': 'submit', 'value': 'Submit', 'class': 'button black'});
//         infoPanelViewLog.innerHTML = "View Log";
//         infoPanelViewLog.onclick = function() {
// //             go.Logging.getLogDB(go.Logging.openLog);
//             go.Logging.openLog(localStorage['log'].split('\n'));
//         }
//         p.appendChild(infoPanelViewLog);
//     },
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
    logToLocalStorage: function(msg) {
        // Logs *msg* to localStorage.  If *msg* is an Array, it will be converted into a string (one log line per array item)
        // NOTE:  I'm using split() and join() here because they appear to be significantly faster than doing a JSON.parse() and JSON.stringify()
        var logArray = localStorage['log'].split('\n');
        if (GateOne.Utils.isArray(msg)) {
            if (logArray) {
                logArray = logArray.concat(msg);
            } else {
                logArray = msg;
            }
        } else {
            if (logArray) {
                logArray.push(msg);
            } else {
                logArray = [msg];
            }
        }
        if (logArray.length > GateOne.prefs.logLines) {
            // Remove lines greater than max
            logArray.reverse();
            logArray.length = GateOne.prefs.logLines;
            logArray.reverse();
        }
        // Join it together as a single string
        logArray = logArray.join('\n');
        localStorage.setItem('log', logArray);
    },
    log: function(msg, level) {
        // *level* can be a string or an integer.
        // if *level* is null (as opposed to undefined), level info will not be included in the log
        var l = GateOne.Logging,
            now = new Date(),
            message = "";
        if (typeof(level) == 'undefined') {
            level = l.level;
        }
        if (level === parseInt(level,10)) { // It's an integer
            levelStr = l.levels[level]; // Get string
        } else { // It's a string
            levelStr = level;
            level = l.levels[levelStr]; // Get integer
        }
        if (level == null) {
            message = l.dateFormatter(now) + " " + msg;
        } else if (level >= l.level) {
            message = l.dateFormatter(now) + ' ' + levelStr + " " + msg;
        }
        if (message) {
            for (dest in l.destinations) {
                l.destinations[dest](message);
            }
        }
    },
    // Shortcuts for each log level
    logFatal: function(msg) { GateOne.Logging.log(msg, 'FATAL') },
    logError: function(msg) { GateOne.Logging.log(msg, 'ERROR') },
    logWarning: function(msg) { GateOne.Logging.log(msg, 'WARNING') },
    logInfo: function(msg) { GateOne.Logging.log(msg, 'INFO') },
    logDebug: function(msg) { GateOne.Logging.log(msg, 'DEBUG') },
    processLogQueue: function() {
        // Saves GateOne.Logging.queue to localStorage and empties it out
        var l = GateOne.Logging,
            now = new Date();
        l.queue.forEach(function(msg) {
            if (GateOne.Utils.isArray(msg)) {
                var newMessage = [];
                msg.forEach(function(line) {
                    if (line) {
                        newMessage.push(l.dateFormatter(now) + " " + line);
                    }
                })
                l.logToLocalStorage(newMessage);
            } else {
                l.logToLocalStorage(l.dateFormatter(now) + " " + msg);
            }
        });
        l.queue = []; // Empty it out
    },
    logStorage: function(msg) {
        // Logs straight to localStorage using GateOne.Logging.logToLocalStorage
        var go = GateOne,
            l = go.Logging;
        l.queue.push(msg);
        if (l.localStorageTimer) {
            clearTimeout(l.localStorageTimer);
        }
        l.localStorageTimer = setTimeout(l.processLogQueue, 500); // half second of idle
    },
    addDestination: function(name, dest) {
        // Creates a new log destination named, *name* that calls function *dest* like so:
        //     dest(<log message>)
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
    onerror: function(e) {
        GateOne.Logging.logError('onerror: ' + e + ', items: ' + GateOne.Utils.items(e));
        GateOne.Logging.logError('currentTarget: ' + GateOne.Utils.items(e.currentTarget));
    },
    openDB: function() {
        // Opens the (indexedDB) log database for use.
        var request = indexedDB.open("gateone");
        request.onsuccess = function(e) {
            var v = "1.00";
            GateOne.Logging.db = e.target.result;
            var db = GateOne.Logging.db;
            // We can only create Object stores in a setVersion transaction;
            if(v != db.version) {
                var setVrequest = db.setVersion(v);
                // onsuccess is the only place we can create Object Stores
                setVrequest.onfailure = GateOne.Logging.onerror;
                setVrequest.onsuccess = function(e) {
                    if(db.objectStoreNames.contains("log")) {
                        db.deleteObjectStore("log");
                    }
                    var store = db.createObjectStore("log", {keyPath: "timeStamp"});
                };
            }
        };
        request.onfailure = GateOne.Logging.onerror;
    },
    logToDB: function(lines) {
        // Logs *lines* to the (indexedDB) log database
        var db = GateOne.Logging.db,
            trans = db.transaction(["log"], IDBTransaction.READ_WRITE, 0);
            store = trans.objectStore("log"),
            data = {
                "line": lines,
                "timeStamp": new Date().getTime()
            },
            request = store.put(data);
//         GateOne.Logging.logInfo(GateOne.Utils.items(store));
        request.onsuccess = function(e) {
            GateOne.Logging.logInfo("Logged " + lines.length + " lines successfully");
//             GateOne.Utils.noop(); // Don't do anything
        };
        request.onerror = GateOne.Logging.onerror;
    },
    clearLogDB: function(id) {
        // Clears the log (indexedDB) database
        var db = GateOne.Logging.db,
            trans = db.transaction(["log"], IDBTransaction.READ_WRITE, 0),
            store = trans.objectStore("log"),
            request = store.clear();
        request.onerror = GateOne.Logging.onerror;
    },
    countLogDB: function(callback) {
        // Retrieves the total number of lines in the log DB and calls *callback* with that number as the only argument.
        var db = GateOne.Logging.db,
            trans = db.transaction(["log"], IDBTransaction.READ_WRITE, 0),
            store = trans.objectStore("log"),
            keyRange = IDBKeyRange.lowerBound(0), // Get everything in the store;
            cursorRequest = store.openCursor(keyRange),
            count = 0;
        cursorRequest.onsuccess = function(e) {
            var cursor = e.target.result;
            if(!cursor)
                return;
            if (GateOne.Utils.isArray(cursor.value.line)) {
                count += cursor.value.line.length;
            } else {
                count += 1;
            }
            cursor.continue();
        };
        trans.oncomplete = function(e) {
            GateOne.Logging.logDebug('transaction complete');
            callback(count);
        }
        cursorRequest.onerror = GateOne.Logging.onerror;
    },
    getLogDB: function(callback) {
        // Retrieves all log lines from the database and calls *callback* with the result as the only argument
        var db = GateOne.Logging.db,
            trans = db.transaction(["log"], IDBTransaction.READ_WRITE, 0),
            store = trans.objectStore("log"),
            keyRange = IDBKeyRange.lowerBound(0), // Get everything in the store;
            cursorRequest = store.openCursor(keyRange),
            result = [];
        cursorRequest.onsuccess = function(e) {
            var cursor = e.target.result,
                out = [];
            if(!cursor)
                return;
            var datetime = GateOne.Logging.dateFormatter(new Date(cursor.value.timeStamp));
            if (GateOne.Utils.isArray(cursor.value.line)) {
                cursor.value.line.forEach(function(Line) {
                    out.push(datetime + ' ' + Line);
                });
            } else {
                out.push(datetime + ' ' + cursor.value.line);
            }
            result = result.concat(out);
            cursor.continue();
        };
        trans.oncomplete = function(e) {
            GateOne.Logging.logDebug('transaction complete');
            callback(result);
        }
        cursorRequest.onerror = GateOne.Logging.onerror;
    },
    trimLogDB: function(currentLines, callback) {
        // Trims the logDB down to the max set in GateOne.prefs.logLines and calls *callback* when complete (if given)
        // NOTE: Not working/incomplete.
        var db = GateOne.Logging.db,
            trans = db.transaction(["log"], IDBTransaction.READ_WRITE, 0),
            store = trans.objectStore("log"),
            keyRange = IDBKeyRange.lowerBound(0), // Get everything in the store
            cursorRequest = store.openCursor(keyRange),
            count = 0;
        cursorRequest.onsuccess = function(e) {
            var cursor = e.target.result;
            if(!cursor)
                return;
            if (GateOne.Utils.isArray(cursor.value.line)) {
                var total_lines = cursor.value.line.length,
                    delete_lines = total_lines - lines;
                cursor.value.line.forEach(function(Line) {
                    count += 1;
                });
            } else {
                count += 1;
            }
            cursor.continue();
        };
        trans.oncomplete = function(e) {
            GateOne.Logging.logDebug('trimLogDB transaction complete');

            callback();
        }
        cursorRequest.onerror = GateOne.Logging.onerror;
    },
    renderLogDB: function(row) {
        // Only used in debugging.
        var datetime = GateOne.Logging.dateFormatter(new Date(row.timeStamp));
        if (GateOne.Utils.isArray(row.line)) {
            row.line.forEach(function(Line) {
                var out = datetime + ' ' + Line;
                console.log(out);
            });
        } else {
            var out = datetime + ' ' + row.line;
            console.log(out);
        }
    },
    openLog: function(lines) {
        // Opens the given log lines in a new window by sending it to the server to be mirrored back
        var go = GateOne,
            form = go.Utils.createElement('form', {
                'method': 'post',
                'action': '/openlog',
                'target': '_blank'
            }),
            logField = go.Utils.createElement('textarea', {'name': 'log'}),
            schemeField = go.Utils.createElement('input', {'name': 'scheme'}),
            containerField = go.Utils.createElement('input', {'name': 'container'}),
            prefixField = go.Utils.createElement('input', {'name': 'prefix'});
        logField.value = lines.join('\n');
        form.appendChild(logField);
        schemeField.value = go.prefs.scheme;
        form.appendChild(schemeField);
        containerField.value = go.prefs.goDiv.split('#')[1];
        form.appendChild(containerField);
        prefixField.value = go.prefs.prefix;
        form.appendChild(prefixField);
        document.body.appendChild(form);
        form.submit();
        setTimeout(function() {
            // No reason to keep this around
            document.body.removeChild(form);
        }, 1000);
    }
});

GateOne.Logging.destinations = { // Default to console logging.
    'console': GateOne.Logging.logToConsole, // Can be added to or replaced/removed
}

// Initialize the logger immediately upon loading of the module (before init())
if (typeof(GateOne.Logging.level) == 'string') {
    // Convert to integer
    GateOne.Logging.level = GateOne.Logging.levels[GateOne.Logging.level];
}
GateOne.Logging.openDB();

})(window);