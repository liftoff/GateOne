var gridIcon = function() {
    // A dependency-checking function.  Returns true if the grid icon is present.
    return (GateOne.Utils.getNode('.✈icon_grid'));
    // The point being that we want the bookmarks icon to be added to the toolbar *after* the grid.
}

GateOne.Base.superSandbox("GateOne.Bookmarks", ["GateOne.Terminal", gridIcon], function(window, undefined) {
"use strict";

// Useful sandbox-wide stuff
var document = window.document, // Have to do this because we're sandboxed
    go = GateOne,
    b, // Will become go.Bookmarks
    u = go.Utils,
    t = go.Terminal,
    v = go.Visual,
    E = go.Events,
    prefix = go.prefs.prefix,
    gettext = go.i18n.gettext,
    noop = u.noop,
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug,
    months = {
        '0': gettext('JAN'),
        '1': gettext('FEB'),
        '2': gettext('MAR'),
        '3': gettext('APR'),
        '4': gettext('MAY'),
        '5': gettext('JUN'),
        '6': gettext('JUL'),
        '7': gettext('AUG'),
        '8': gettext('SEP'),
        '9': gettext('OCT'),
        '10': gettext('NOV'),
        '11': gettext('DEC')
    };

// TODO: Make it so you can have a bookmark containing multiple URLs.  So they all get opened at once when you open it.
// TODO: Move the JSON.stringify() stuff into a Web Worker so the browser doesn't stop responding when a huge amount of bookmarks are being saved.
// TODO: Add hooks that allow other plugins to attach actions to be called before and after bookmarks are executed.
// TODO: Refactor the code to use GateOne.Storage instead of localStorage.

// GateOne.Bookmarks (bookmark management functions)
go.Base.module(GateOne, "Bookmarks", "1.2", ['Base']);
b = go.Bookmarks;
go.Bookmarks.bookmarks = [];
/**:GateOne.Bookmarks.bookmarks

All the user's bookmarks are stored in this array which is stored/loaded from `localStorage[GateOne.prefs.prefix+'bookmarks']`.  Each bookmark consists of the following data structure::

    {
        created: 1356974567922,
        images: {favicon: "data:image/x-icon;base64,<gobbledygook>"},
        name: "localhost",
        notes: "Login to the Gate One server itself",
        tags: ["Linux", "Ubuntu", "Production", "Gate One"],
        updateSequenceNum: 11,
        updated: 1356974567922,
        url: "ssh://localhost",
        visits: 0
    }

Most of that should be self-explanatory except the `updateSequenceNum` (aka USN).  The USN value is used to determine when this bookmark was last changed in comparison to the highest USN stored on the server.  By comparing the highest client-side USN against the highest server-side USN we can determine what (if anything) has changed since the last synchronization.  It is much more efficient than enumerating all bookmarks on both the client and server in order to figure out what's different.
*/
b.URLHandlers = {};
b.iconHandlers = {};
b.tags = [];
b.sortToggle = false;
b.searchFilter = null;
b.page = 0; // Used to tracking pagination
b.dateTags = [];
b.URLTypeTags = [];
b.toUpload = []; // Used for tracking what needs to be uploaded to the server
b.loginSync = true; // Makes sure we don't display "Synchronization Complete" if the user just logged in (unless it is the first time).
b.temp = ""; // Just a temporary holding space for things like drag & drop
go.Base.update(GateOne.Bookmarks, {
    init: function() {
        /**:GateOne.Bookmarks.init()

        Creates the bookmarks panel, initializes some important variables, registers the :kbd:`Control-Alt-b` keyboard shortcut, and registers the following WebSocket actions::

            GateOne.Net.addAction('terminal:bookmarks_updated', GateOne.Bookmarks.syncBookmarks);
            GateOne.Net.addAction('terminal:bookmarks_save_result', GateOne.Bookmarks.syncComplete);
            GateOne.Net.addAction('terminal:bookmarks_delete_result', GateOne.Bookmarks.deletedBookmarksSyncComplete);
            GateOne.Net.addAction('terminal:bookmarks_renamed_tags', GateOne.Bookmarks.tagRenameComplete);
        */
        var b = go.Bookmarks,
            goDiv = u.getNode(go.prefs.goDiv),
            toolbarBookmarks = u.createElement('div', {'id': go.prefs.prefix+'icon_bookmarks', 'class': '✈toolbar_icon ✈icon_bookmarks', 'title': gettext("Bookmarks")}),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar'),
            bookmarks = [], // Loaded and tested before we set GateOne.Bookmarks.bookmarks
            badBookmarks = [],
            toggleBookmarks = function() {
                v.togglePanel('#'+prefix+'panel_bookmarks');
            };
        // Default sort order is by date created, descending, followed by alphabetical order
        if (!localStorage[prefix+'sort']) {
            // Set a default
            localStorage[prefix+'sort'] = 'date';
            b.sortfunc = b.sortFunctions.created;
        } else {
            if (localStorage[prefix+'sort'] == 'alpha') {
                b.sortfunc = b.sortFunctions.alphabetical;
            } else if (localStorage[prefix+'sort'] == 'date') {
                b.sortfunc = b.sortFunctions.created;
            } if (localStorage[prefix+'sort'] == 'visits') {
                b.sortfunc = b.sortFunctions.visits;
            }
        }
        // Add our HTTP and HTTPS favicon handlers
        b.registerIconHandler('http', b.httpIconHandler);
        b.registerIconHandler('https', b.httpIconHandler);
        // Setup our toolbar icons and actions
        toolbarBookmarks.innerHTML = go.Icons.bookmark;
        toolbarBookmarks.addEventListener('click', toggleBookmarks, false);
        // Stick it on the end (can go wherever--unlike GateOne.Terminal's icons)
        toolbar.appendChild(toolbarBookmarks);
        // Initialize the localStorage['bookmarks'] if it doesn't exist
        if (!localStorage[prefix+'bookmarks']) {
            localStorage[prefix+'bookmarks'] = "[]"; // Init as empty JSON list
            b.bookmarks = [];
        } else {
            // Load them into GateOne.Bookmarks.bookmarks
            bookmarks = JSON.parse(localStorage[prefix+'bookmarks']);
            // Validate the bookmarks and try to fix broken ones
            bookmarks.forEach(function(bookmark) {
                if (!bookmark.name.length) {
                    // Missing name; try to fix it using the URL's host
                    var parsedURL = b.parseUri(bookmark.url);
                    bookmark.name = parsedURL.host;
                } else if (!bookmark.url.length) {
                    badBookmarks.push(bookmark);
                }
            });
            b.bookmarks = bookmarks;
            if (badBookmarks.length) {
                logError(gettext("Bad bookmarks were encountered while loading: "), badBookmarks);
                // Re-save the good bookmarks so we don't have this problem again
                b.storeBookmarks(b.bookmarks);
            }
        }
        // Initialize the USN if it isn't already set
        if (!localStorage[prefix+'USN']) {
            localStorage[prefix+'USN'] = 0;
        }
        // Default sort order is by visits, descending
        b.createPanel();
        // Create the icon fetching queue if it doesn't already exist
        if (!localStorage[prefix+'iconQueue']) {
            localStorage[prefix+'iconQueue'] = "";
        }
        setTimeout(function() {
            // Complete fetching icons if there's anything to fetch
            if (localStorage[prefix+'iconQueue'].length) {
                b.flushIconQueue();
            }
        }, 3000);
        // Setup a callback that re-draws the bookmarks panel whenever it is opened
        go.Events.on('go:panel_toggle:in', b.panelToggleIn);
        // Register our WebSocket actions
        go.Net.addAction('terminal:bookmarks_updated', b.syncBookmarks);
        go.Net.addAction('terminal:bookmarks_save_result', b.syncComplete);
        go.Net.addAction('terminal:bookmarks_delete_result', b.deletedBookmarksSyncComplete);
        go.Net.addAction('terminal:bookmarks_renamed_tags', b.tagRenameComplete);
        // Setup a keyboard shortcut so bookmarks can be keyboard-navigable
        if (!go.prefs.embedded) {
            E.on("go:keydown:ctrl-alt-b", toggleBookmarks);
            // Setup a callback that synchronizes the user's bookmarks everything is done loading
            go.Events.on("go:js_loaded", b.userLoginSync);
        }
    },
    panelToggleIn: function(panel) {
        /**:GateOne.Bookmarks.panelToggleIn(panel)

        Called when `panel_toggle:in` event is triggered, calls :js:meth:`GateOne.Bookmarks.createPanel` if *panel* is the Bookmarks panel.
        */
        if (panel.id == go.prefs.prefix+'panel_bookmarks') {
            go.Bookmarks.createPanel();
        }
    },
    userLoginSync: function(username) {
        /**:GateOne.Bookmarks.userLoginSync(username)

        This gets attached to the `go:js_loaded` event.  Calls the server-side `terminal:bookmarks_get` WebSocket action with the current USN (Update Sequence Number) to ensure the user's bookmarks are in sync with what's on the server.
        */
        var USN = localStorage[prefix+'USN'] || 0;
        go.ws.send(JSON.stringify({'terminal:bookmarks_get': USN}));
    },
    sortFunctions: {
        /**:GateOne.Bookmarks.sortFunctions

        An associative array of functions that are used to sort bookmarks.  When the user clicks on one of the sorting options it assigns one of these functions to :js:meth:`GateOne.Bookmarks.sortfunc` which is then applied like so::

            bookmarks.sort(GateOne.Bookmarks.sortfunc);

        */
        visits: function(a,b) {
            /**:GateOne.Bookmarks.sortFunctions.visits(a, b)

            Sorts bookmarks according to the number of visits followed by alphabetical.
            */
            if (a.visits === b.visits) {
                var x = a.name.toLowerCase(), y = b.name.toLowerCase();
                return x < y ? -1 : x > y ? 1 : 0;
            }
            if (a.visits > b.visits) {
                return -1;
            }
            if (a.visits < b.visits) {
                return 1;
            }
        },
        created: function(a,b) {
            /**:GateOne.Bookmarks.sortFunctions.created(a, b)

            Sorts bookmarks by date modified followed by alphabetical.
            */
            if (a.created === b.created) {
                var x = a.name.toLowerCase(), y = b.name.toLowerCase();
                return x < y ? -1 : x > y ? 1 : 0;
            }
            if (a.created > b.created) {
                return -1;
            }
            if (a.created < b.created) {
                return 1;
            }
        },
        alphabetical: function(a,b) {
            /**:GateOne.Bookmarks.sortFunctions.alphabetical(a, b)

            Sorts bookmarks alphabetically.
            */
            var x = a.name.toLowerCase(), y = b.name.toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        }
    },
    storeBookmarks: function(bookmarks, /*opt*/recreatePanel, skipTags) {
        /**:GateOne.Bookmarks.storeBookmarks(bookmarks[, recreatePanel[, skipTags ] ])

        Takes an array of *bookmarks* and stores them in `GateOne.Bookmarks.bookmarks`.

        If *recreatePanel* is true, the panel will be re-drawn after bookmarks are stored.

        If *skipTags* is true, bookmark tags will be ignored when saving *bookmarks*.
        */
        var go = GateOne,
            prefix = go.prefs.prefix,
            b = go.Bookmarks,
            count = 0;
        bookmarks.forEach(function(bookmark) {
            count += 1;
            var conflictingBookmark = false,
                deletedBookmark = false;
            // Add a trailing slash to URLs like http://liftoffsoftware.com
            if (bookmark.url.slice(0,4) == "http" && bookmark.url.indexOf('/', 7) == -1) {
                bookmark.url += '/';
            }
            // Check if this is our "Deleted Bookmarks" bookmark
            if (bookmark.url == "web+deleted:bookmarks/") {
                // Write the contained URLs to localStorage
                deletedBookmark = true;
            }
            // Add a "Untagged" tag if tags is empty
            if (!bookmark.tags.length) {
                bookmark.tags = ['Untagged'];
            }
            b.bookmarks.forEach(function(storedBookmark) {
                if (storedBookmark.url == bookmark.url) {
                    // There's a conflict
                    conflictingBookmark = storedBookmark;
                }
            });
            if (conflictingBookmark) {
                if (parseInt(conflictingBookmark.updated) < parseInt(bookmark.updated)) {
                    // Server is newer; overwrite it
                    if (skipTags) {
                        bookmark.tags = conflictingBookmark.tags; // Use the old ones
                    }
                    b.createOrUpdateBookmark(bookmark);
                } else if (parseInt(conflictingBookmark.updateSequenceNum) < parseInt(bookmark.updateSequenceNum)) {
                    // Server isn't newer but it has a higher USN.  So just update this bookmark's USN to match
                    b.updateUSN(bookmark);
                    conflictingBookmark.updateSequenceNum = bookmark.updateSequenceNum;
                    if (bookmark.updateSequenceNum > parseInt(localStorage[prefix+'USN'])) {
                        // Also need to add it to toUpload
                        b.toUpload.push(conflictingBookmark);
                    }
                }
            } else if (deletedBookmark) {
                // Don't do anything
            } else {
                // No conflict; store it if we haven't already deleted it
                var deletedBookmarks = localStorage[prefix+'deletedBookmarks'];
                if (deletedBookmarks) {
                    var existing = JSON.parse(deletedBookmarks),
                        found = false;
                    existing.forEach(function(obj) {
                        if (obj.url == bookmark.url) {
                            if (!obj.deleted > bookmark.updated) {
                                found = true;
                            }
                        }
                    });
                    if (!found) {
                        b.createOrUpdateBookmark(bookmark);
                    }
                } else {
                    b.createOrUpdateBookmark(bookmark);
                }
            }
        });
        if (recreatePanel) {
            b.createPanel();
        }
        b.flushIconQueue();
        return count;
    },
    syncComplete: function(response) {
        /**:GateOne.Bookmarks.syncComplete(response)

        Called when the sync (download) is completed.  Stores the current highest `updateSequenceNum` in localStorage, and notifies the user of any errors that occurred during synchronization.
        */
        logDebug('syncComplete()');
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            responseObj = null;
        if (typeof(response) == "string") {
            responseObj = JSON.parse(response);
        } else {
            responseObj = response;
        }
        clearInterval(b.syncTimer);
        if (responseObj['updateSequenceNum']) {
            localStorage[prefix+'USN'] = parseInt(responseObj['updateSequenceNum']);
        }
        if (responseObj['errors'].length == 0) {
            go.Visual.displayMessage("Synchronization Complete: " + (responseObj['count']) + " bookmarks were updated.");
            if (responseObj['updates'].length) {
                // The 'updates' list will include the bookmarks that have been updated so we can update their "updated" and "USN" attributes on the client
                b.storeBookmarks(responseObj['updates'], true, true);
            }
        } else {
            go.Visual.displayMessage(gettext("Synchronization Complete (With Errors): ") + (responseObj['count']) + gettext(" bookmarks were updated successfully."));
            go.Visual.displayMessage(gettext("See the JavaScript console for details."));
            logError(gettext("Synchronization Errors: ") + u.items(responseObj['errors'][0]));
        }
        b.createPanel();
        u.getNode('#'+prefix+'bm_sync').innerHTML = gettext("Sync Bookmarks") + " | ";
        b.toUpload = []; // Reset it
    },
    syncBookmarks: function(response) {
        /**:GateOne.Bookmarks.syncBookmarks(response)

        Called when the `terminal:bookmarks_updated` WebSocket action is received from the server.  Removes bookmarks marked as deleted on the server, uploads new bookmarks that are not on the server (yet), and processes any tags that have been renamed.
        */
        logDebug('syncBookmarks() response: ' + response + ', response.length: ' + response.length);
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix,
            firstTime = false,
            bookmarks = null,
            foundDeleted = false,
            localDiff = [],
            remoteDiff = [];
        if (!localStorage[prefix+'deletedBookmarks']) {
            // If it isn't present as an empty array it can break things.
            localStorage[prefix+'deletedBookmarks'] = "[]";
        }
        if (!b.bookmarks.length) {
            firstTime = true;
        }
        if (typeof(response) == "string") {
            bookmarks = JSON.parse(response);
        } else {
            bookmarks = response;
        }
        // Process deleted bookmarks before anything else
        bookmarks.forEach(function(bookmark) {
            if (bookmark.url == 'web+deleted:bookmarks/') {
                foundDeleted = true;
                var deletedBookmarksLocal = JSON.parse(localStorage[prefix+'deletedBookmarks']),
                    deletedBookmarksServer = bookmark.notes;
                // Figure out the differences
                for (var i in deletedBookmarksLocal) {
                    var found = false;
                    for (var n in deletedBookmarksServer) {
                        if (deletedBookmarksLocal[i].url == deletedBookmarksServer[n].url) {
                            found = true;
                        }
                    }
                    if (!found) {
                        // We need to send these to the server for processing
                        localDiff.push(deletedBookmarksLocal[i]);
                    }
                }
                for (var i in deletedBookmarksServer) {
                    var found = false;
                    for (var n in deletedBookmarksLocal) {
                        if (deletedBookmarksServer[i].url == deletedBookmarksLocal[n].url) {
                            found = true;
                        }
                    }
                    if (!found) {
                        // We need to process these locally
                        remoteDiff.push(deletedBookmarksServer[i]);
                    }
                }
                if (localDiff.length) {
                    go.ws.send(JSON.stringify({'terminal:bookmarks_deleted': localDiff}));
                }
                if (remoteDiff.length) {
                    for (var i in remoteDiff) {
                        var callback = function() {
                            // This is so we don't endlessly sync deleted bookmarks.
                            localStorage[prefix+'deletedBookmarks'] = "[]";
                        }
                        b.removeBookmark(remoteDiff[i].url, callback);
                    }
                }
                // Fix the USN if the deletedBookmark note has the highest USN
                if (parseInt(localStorage[prefix+'USN']) < bookmark.updateSequenceNum) {
                    localStorage[prefix+'USN'] = JSON.parse(bookmark.updateSequenceNum);
                }
            }
        });
        if (!foundDeleted) {
            // Have to upload our deleted bookmarks list (if any)
            var deletedBookmarks = JSON.parse(localStorage[prefix+'deletedBookmarks']);
            if (deletedBookmarks.length) {
                go.ws.send(JSON.stringify({'terminal:bookmarks_deleted': deletedBookmarks}));
            }
        }
        setTimeout(function() {
            // This checks if there are new/imported bookmarks
            var count = b.storeBookmarks(bookmarks, false);
            b.bookmarks.forEach(function(bookmark) {
                if (bookmark.updateSequenceNum == 0) { // A USN of 0 means it isn't on the server at all or needs to be synchronized
                    // Mark it for upload
                    b.toUpload.push(bookmark);
                }
            });
            // If there *are* new/imported bookmarks, upload them:
            if (b.toUpload.length) {
                go.ws.send(JSON.stringify({'terminal:bookmarks_sync': b.toUpload}));
            } else {
                clearTimeout(b.syncTimer);
                if (!firstTime) {
                    if (!JSON.parse(localStorage[prefix+'deletedBookmarks']).length) {
                        // Only say we're done if the deletedBookmarks queue is empty
                        if (!b.loginSync) {
                            // This lets us turn off the "Synchronization Complete" message when the user had their bookmarks auto-sync after login
                                go.Visual.displayMessage(gettext("Synchronization Complete"));
                            if (count) {
                                b.createPanel();
                            }
                        }
                    }
                    if (localStorage[prefix+'iconQueue'].length) {
                        go.Visual.displayMessage(gettext("Missing bookmark icons will be retrieved in the background"));
                    }
                    if (b.highestUSN() > parseInt(localStorage[prefix+'USN'])) {
                        localStorage[prefix+'USN'] = b.highestUSN();
                    }
                } else {
                    if (localStorage[prefix+'USN'] != 0) {
                        go.Visual.displayMessage(gettext("First-Time Synchronization Complete"));
                        go.Visual.displayMessage(gettext("Missing bookmark icons will be retrieved in the background"));
                    }
                    b.createPanel();
                    localStorage[prefix+'USN'] = b.highestUSN();
                }
                u.getNode('#'+prefix+'bm_sync').innerHTML = gettext("Sync Bookmarks") + " | ";
            }
            // Process any pending tag renames
            if (localStorage[prefix+'renamedTags']) {
                var renamedTags = JSON.parse(localStorage[prefix+'renamedTags']);
                go.ws.send(JSON.stringify({'terminal:bookmarks_rename_tags': renamedTags}));
            }
            b.loginSync = false; // So subsequent synchronizations display the "Synchronization Complete" message
        }, 200);
    },
    tagRenameComplete: function(result) {
        /**:GateOne.Bookmarks.tagRenameComplete(result)

        Called when the 'bookmarks_renamed_tags' WebSocket action is received from the server.  Deletes `localStorage[GateOne.prefs.prefix+'renamedTags']` (which stores tags that have been renamed and are awaiting sync) and displays a message to the user indicating that tags were renamed successfully.
        */
        var go = GateOne,
            b = go.Bookmarks,
            prefix = go.prefs.prefix;
        if (result) {
            delete localStorage[prefix+'renamedTags'];
            go.Visual.displayMessage(result['count'] + gettext(" tags were renamed."));
        }
    },
    deletedBookmarksSyncComplete: function(message) {
        /**:GateOne.Bookmarks.deletedBookmarksSyncComplete(message)

        Handles the response from the server after we've sent the 'bookmarks_deleted' WebSocket action.  Resets `localStorage[GateOne.prefs.prefix+'deletedBookmarks']` and displays a message to the user indicating how many bookmarks were just deleted.
        */
        var go = GateOne,
            v = go.Visual,
            prefix = go.prefs.prefix;
        if (message) {
            localStorage[prefix+'deletedBookmarks'] = "[]"; // Clear it out now that we're done
            v.displayMessage(message['count'] + gettext(" bookmarks were deleted or marked as such."));
        }
    },
    loadBookmarks: function(/*opt*/delay) {
        /**:GateOne.Bookmarks.loadBookmarks([delay])

        Filters/sorts/displays bookmarks and updates the bookmarks panel to reflect the current state of things (draws the tag cloud and ensures the pagination is correct).

        If *delay* (milliseconds) is given, loading of bookmarks will be delayed by that amount before they're drawn (for animation purposes).
        */
        logDebug("loadBookmarks()");
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv),
            prefix = go.prefs.prefix,
            bookmarks = b.bookmarks.slice(0), // Make a local copy since we're going to mess with it
            bmCount = 0, // Starts at 1 for the ad
            bmMax = b.getMaxBookmarks('.✈bm_container'),
            bmContainer = u.getNode('.✈bm_container'),
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            pagination = u.getNode('#'+prefix+'bm_pagination'),
            paginationUL = u.getNode('#'+prefix+'bm_pagination_ul'),
            tagCloud = u.getNode('#'+prefix+'bm_tagcloud'),
            bmSearch = u.getNode('#'+prefix+'bm_search'),
            bmTaglist = u.getNode('#'+prefix+'bm_taglist'),
            cloudTags = u.toArray(tagCloud.getElementsByClassName('✈bm_tag')),
            allTags = [],
            filteredBookmarks = [],
            bookmarkElements = u.toArray(goDiv.getElementsByClassName('✈bookmark'));
        bmPanel.style['overflow-y'] = "hidden"; // Only temporary while we're loading bookmarks
        setTimeout(function() {
            bmPanel.style['overflow-y'] = "auto"; // Set it back after everything is loaded
        }, 1000);
        if (bookmarkElements) { // Remove any existing bookmarks from the list
            bookmarkElements.forEach(function(bm) {
                bm.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(bm);
                }, 500);
            });
        }
        if (!delay) {
            delay = 0;
        }
        // Remove the pagination UL
        if (paginationUL) {
            u.removeElement(paginationUL);
        };
        // Apply the sort function
        bookmarks.sort(b.sortfunc);
        if (b.sortToggle) {
            bookmarks.reverse();
        }
        if (!bookmarks.length) { // No bookmarks == Likely new user.  Show a welcome message.
            var welcome = {
                    'url': "http://liftoffsoftware.com/",
                    'name': gettext("You don't have any bookmarks yet!"),
                    'tags': [],
                    'notes': gettext('A great way to get started is to import bookmarks or click Sync.'),
                    'visits': 0,
                    'updated': new Date().getTime(),
                    'created': new Date().getTime(),
                    'updateSequenceNum': 0,
                    'images': {'favicon': "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9sHCBMpEfMvEIMAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAACEUlEQVQoz2M0Lei7f/YIA3FAS02FUcQ2iFtcDi7Ex81poq6ooyTz7cevl+8/nr354Nmb93DZry8fMXPJa7Lx8EP43pYGi2oyIpwt2NlY333+WpcQGO9pw8jAePbm/X///zMwMPz++pEJrrs00ntqUbwQLzcDA8P2Exd3nLzEwMDAwsxcGO6xuCaTmQmqEkqZaSplBjrDNW87cfHinUdwx1jqqKT7O0HYLBAqwcvuzpOXEPb956+fvn7PwMCwfM8JX2tDuGuX7T729SUDCwMDAyc7m5KkaO6ERTcfPUcOk8lrd01eu4uBgUGAh6szM0JPRe7p3RtMDAwMarISGvJSG9sLo1ytMIPSTFNpe0+pu5mulrwU1A+fv/1gYGDgYGNtSwttSApCVu1jZbC8IVtSWICBgeHT1+9QDQ+ev/728xdExYcv35A1vP30BR4+Vx88hWr49///zpOXIKLbT1xkYGDwtNDPD3FnZmI6de3eu89fGRgYHrx4c+3BU0QoNc5fb6On/uX7j4cv3rSlhUI8Y62nlj9x8e7Tl0MdzYunLPv95y8DAwMiaZhqKPnbGplpKqvJSsCd9OHLt3UHT9958nLZnuOQpMEClzt9497Nx8+rYv2E+XiE+XkYGBi+/fx1+e7jpbuP3X36Cq4MPfFBgKSwABcH2/1nryFJCDnxsWipqVy7dQdNw52Xj7Amb0VjGwCOn869WU5D8AAAAABJRU5ErkJggg=="}
            },
                introVideo = {
                'url': "http://vimeo.com/26357093",
                'name': gettext("A Quick Screencast Overview of Bookmarked"),
                'tags': ["Video", "Help"],
                'notes': gettext('Want some help getting started?  Our short (3 minutes) overview screencast can be illuminating.'),
                'visits': 0,
                'updated': new Date().getTime(),
                'created': new Date().getTime(),
                'updateSequenceNum': 0,
                'images': {'favicon': "data:image/x-icon;base64,AAABAAEAEBAAAAAAAABoBQAAFgAAACgAAAAQAAAAIAAAAAEACAAAAAAAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAA8uvRAMq/oQDj28EA27crAOjRdwCrhwoAuZQLAODKdwC6r5EAkXs1AODCSgCKd0MA3rw7AP///wDi3dAA/PnwAI9yFwBzWxUAh2kHAL6aCwDAmgsA6taGAM+nDACwjxkA1q0NANfIkwDt3qQAz8ShAI98RADr6OAAlXUIAO3blQCqk0UAtKeCAOndsgCdewkAzsawAOTcwQDg1rIA2bIcALmlZADbvUkAno5iAPX07wDGt4MA8OCkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBQUFBQUFBQUFBQUABQUGRkZGQcXGRkZGRkZFBQUGRkZGR8MEgYZGRkZGRkUFBkZGRcJDiwrBhkZGRkZFBQZGRkYDg4ODisHGRkZGRQUGRkZKQ4ODg4OHRkZGRkUFBkZGQIODhYBDiwRGRkZFBQZGRUeDg4ZCw4OJQcZGRQUByQKDg4mFxknDg4hGRkUFCotDw4OGigTIg4OHBkZFBQoLg4ODggZIywODgMZGRQUGRkgDhAEGQsODg4bGRkUFBkZGQ0EGRkZBBYFKBkZFBQZGRkZGRkZGRkZGRkZGRQUDRkZGRkZGRkZGRkZGQ0UABQUFBQUFBQUFBQUFBQUAIABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIABAAA="}
            };
            b.createBookmark(bmContainer, welcome, delay, false);
            b.createBookmark(bmContainer, introVideo, delay+100, false);
        }
        // Remove bookmarks from *bookmarks* that don't match the searchFilter (if one is set)
        if (b.searchFilter) {
            bookmarks.forEach(function(bookmark) {
                var bookmarkName = bookmark.name.toLowerCase();
                if (bookmarkName.match(b.searchFilter.toLowerCase())) {
                    filteredBookmarks.push(bookmark);
                }
            });
            bookmarks = filteredBookmarks;
            filteredBookmarks = []; // Have to reset this for use further down
        }
        bmTaglist.innerHTML = ""; // Clear out the tag list
        // Now recreate it...
        if (b.dateTags) {
            for (var i in b.dateTags) {
                var tag = u.createElement('li', {'class': '✈bm_autotag'});
                tag.onclick = function(e) {
                    b.removeFilterDateTag(bookmarks, this.innerHTML);
                };
                tag.innerHTML = b.dateTags[i];
                bmTaglist.appendChild(tag);
            }
        }
        if (b.URLTypeTags) {
            for (var i in b.URLTypeTags) {
                var tag = u.createElement('li', {'class': '✈bm_autotag ✈bm_urltype_tag'});
                tag.onclick = function(e) {
                    b.removeFilterURLTypeTag(bookmarks, this.innerHTML);
                };
                tag.innerHTML = b.URLTypeTags[i];
                bmTaglist.appendChild(tag);
            }
        }
        if (b.tags.length) {
            for (var i in b.tags) { // Recreate the tag filter list
                var tag = u.createElement('li', {'class': '✈bm_tag'});
                tag.innerHTML = b.tags[i];
                tag.onclick = function(e) {
                    b.removeFilterTag(bookmarks, this.innerHTML);
                };
                bmTaglist.appendChild(tag);
            }
        }
        if (b.tags.length) {
        // Remove all bookmarks that don't have matching *Bookmarks.tags*
            bookmarks.forEach(function(bookmark) {
                var bookmarkTags = bookmark.tags,
                    allTagsPresent = false,
                    tagCount = 0;
                bookmarkTags.forEach(function(tag) {
                    if (b.tags.indexOf(tag) != -1) { // tag not in tags
                        tagCount += 1;
                    }
                });
                if (tagCount == b.tags.length) {
                    // Add the bookmark to the list
                    filteredBookmarks.push(bookmark);
                }
            });
            bookmarks = filteredBookmarks;
            filteredBookmarks = []; // Have to reset this for use further down
        }
        if (b.URLTypeTags.length) {
        // Remove all bookmarks that don't have matching URL type
            bookmarks.forEach(function(bookmark) {
                var urlType = bookmark.url.split(':')[0];
                if (b.URLTypeTags.indexOf(urlType) == 0) {
                    // Add the bookmark to the list
                    filteredBookmarks.push(bookmark);
                }
            });
            bookmarks = filteredBookmarks;
            filteredBookmarks = []; // Have to reset this for use further down
        }
        if (b.dateTags.length) {
        // Remove from the bookmarks array all bookmarks that don't measure up to *Bookmarks.dateTags*
            bookmarks.forEach(function(bookmark) {
                var dateObj = new Date(parseInt(bookmark.created)),
                    dateTag = b.getDateTag(dateObj),
                    tagCount = 0;
                b.dateTags.forEach(function(tag) {
                    // Create a new Date object that reflects the date tag
                    var dateTagDateObj = new Date(),
                        olderThanYear = false;
                    if (tag == '<1 day') {
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-1);
                    }
                    if (tag == '<7 days') {
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-7);
                    }
                    if (tag == '<30 days') {
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-30);
                    }
                    if (tag == '<60 days') {
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-60);
                    }
                    if (tag == '<90 days') {
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-90);
                    }
                    if (tag == '<180 days') {
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-180);
                    }
                    if (tag == '<1 year') {
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-365);
                    }
                    if (tag == '>1 year') {
                        olderThanYear = true;
                        dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-365);
                    }
                    if (!olderThanYear) {
                        if (dateObj > dateTagDateObj) {
                            tagCount += 1;
                        }
                    } else {
                        if (dateObj < dateTagDateObj) {
                            tagCount += 1;
                        }
                    }
                });
                if (tagCount == b.dateTags.length) {
                    // Add the bookmark to the list
                    filteredBookmarks.push(bookmark);
                }
            });
            bookmarks = filteredBookmarks;
            filteredBookmarks = [];
        }
        allTags = b.getTags(bookmarks);
        b.filteredBookmarks = bookmarks; // Need to keep track semi-globally for some things
        if (b.page) {
            var pageBookmarks = null;
            if (bmMax*(b.page+1) < bookmarks.length) {
                pageBookmarks = bookmarks.slice(bmMax*b.page, bmMax*(b.page+1));
            } else {
                pageBookmarks = bookmarks.slice(bmMax*b.page, bookmarks.length-1);
            }
            pageBookmarks.forEach(function(bookmark) {
                if (bmCount < bmMax) {
                    if (!bookmark.images) {
                        logDebug(gettext('bookmark missing images: ') + bookmark);
                    }
                    b.createBookmark(bmContainer, bookmark, delay);
                }
                bmCount += 1;
            });
        } else {
            bookmarks.forEach(function(bookmark) {
                if (bmCount < bmMax) {
                    b.createBookmark(bmContainer, bookmark, delay);
                }
                bmCount += 1;
            });
        }
        var bmPaginationUL = b.loadPagination(bookmarks, b.page);
        pagination.appendChild(bmPaginationUL);
        // Hide tags that aren't in the bookmark array
        delay = 100;
        cloudTags.forEach(function hideTag(tagNode) {
            if (allTags.indexOf(tagNode.innerHTML) == -1) { // Tag isn't in the new list of bookmarks
                // Make it appear inactive
                setTimeout(function() {
                    tagNode.className = '✈bm_tag ✈sectrans ✈inactive';
                }, delay);
            }
        });
        // Mark tags as active that were previously inactive (if the user just removed a tag from the tag filter)
        delay = 100;
        cloudTags.forEach(function showTag(tagNode) {
            if (allTags.indexOf(tagNode.innerHTML) != -1) { // Tag is in the new list of bookmarks
                // Make it appear active
                setTimeout(function unTrans() {
                    setTimeout(function reClass() {
                        if (tagNode.innerHTML == "Untagged") {
                            tagNode.className = '✈bm_tag ✈sectrans ✈untagged';
                        } else if (tagNode.innerHTML == "Searches") {
                            tagNode.className = '✈bm_tag ✈sectrans ✈searches';
                        } else {
                            tagNode.className = '✈bm_tag ✈sectrans'; // So we don't have slow mouseovers
                        }
                    }, 500);
                }, delay);
            }
        });
    },
    flushIconQueue: function() {
        /**:GateOne.Bookmarks.flushIconQueue()

        Loops over `localStorage[GateOne.prefs.prefix+'iconQueue']` fetching icons until it is empty.

        If the queue is currently being processed this function won't do anything when called.
        */
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix;
        if (!b.flushingIconQueue) {
            setTimeout(function() { // Wrapped for async
                b.flushingIconQueue = true;
                if (localStorage[prefix+'iconQueue'].length) {
                    // We have icons to fetch
                    var iconQueue = localStorage[prefix+'iconQueue'].split('\n'),
                        removed = [];
                    b.flushProgress = setInterval(function() {
                        try {
                            var remaining = Math.abs((localStorage[prefix+'iconQueue'].split('\n').length-1) - iconQueue.length);
                            u.updateProgress(prefix+'iconflush', iconQueue.length, remaining, gettext('Fetching Icons...'));
                            if (localStorage[prefix+'iconQueue'].split('\n').length == 1) {
                                clearInterval(b.flushProgress);
                            }
                        } catch(e) {
                            // Something went wrong (bad math)... Stop updating progress
                            clearInterval(b.flushProgress);
                        }
                    }, 1000);
                    for (var i in iconQueue) {
                        // Find the bookmark associated with this URL
                        var bookmark = b.getBookmarkObj(iconQueue[i]);
                        if (bookmark) {
                            if (bookmark.url) {
                                b.updateIcon(bookmark);
                            }
                        } else {
                            // For whatever reason this bookmark doesn't exist anymore.
                            removed.push(iconQueue[i]);
                        }
                    }
                    if (removed.length) {
                        // Remove these from the queue
                        iconQueue = localStorage[prefix+'iconQueue'].split('\n');
                        for (var r in removed) {
                            for (var i in iconQueue) {
                                if (iconQueue[i] == removed[r]) {
                                    iconQueue.splice(i, 1);
                                }
                            }
                        }
                        if (iconQueue.length) {
                            localStorage[prefix+'iconQueue'] = iconQueue.join('\n');
                        } else {
                            localStorage[prefix+'iconQueue'] = "";
                        }
                    }
                }
                b.flushingIconQueue = false;
            }, 100);
        }
    },
    updateIcon: function(bookmark) {
        /**:GateOne.Bookmarks.updateIcon(bookmark)

        Calls the handler in `GateOne.Bookmarks.iconHandlers` associated with the given *bookmark.url* protocol.

        If no handler can be found no operation will be performed.
        */
        var parsedURL = b.parseUri(bookmark.url);
        if (parsedURL.protocol in b.iconHandlers) {
            b.iconHandlers[parsedURL.protocol](bookmark);
        } else {
            logDebug(gettext('No icon handler for protocol: ') + parsedURL.protocol);
        }
    },
    storeFavicon: function(bookmark, dataURI) {
        /**:GateOne.Bookmarks.storeFavicon(bookmark, dataURI)

        Stores the given *dataURI* as the 'favicon' image for the given *bookmark*.

        .. note:: *dataURI* must be pre-encoded data:URI
        */
        var iconQueue = localStorage[prefix+'iconQueue'].split('\n'),
            visibleBookmarks = u.toArray(u.getNodes('.✈bookmark')),
            removed;
        if (u.startsWith("data:", dataURI)) {
            bookmark.images = {'favicon': dataURI};
            b.createOrUpdateBookmark(bookmark);
        }
        for (var i in iconQueue) {
            if (iconQueue[i] == bookmark.url) {
                // Remove it
                removed = iconQueue.splice(i, 1);
            }
        }
        localStorage[prefix+'iconQueue'] = iconQueue.join('\n');
        // TODO:  Get this working...
//         visibleBookmarks.forEach(function(bookmark) {
//             // Update the favicon of this bookmark in-place (if it is visible)
//             var bmURL = bookmark.getElementsByClassName('✈bm_url');
//             if (bmURL.href == bookmark.url) {
//                 // Add the favicon
//
//             }
//         });
        // Ignore anything else
    },
    updateIcons: function(urls) {
        /**:GateOne.Bookmarks.updateIcons(urls)

        Loops over the given *urls* attempting to fetch and store their respective favicons.

        .. note:: This function is only used when debugging.  It is called by no other functions.
        */
        var go = GateOne,
            b = go.Bookmarks;
        urls.forEach(function(url) {
            b.bookmarks.forEach(function(bookmark) {
                if (bookmark.url == url) {
                    b.updateIcon(bookmark);
                }
            });
        });
    },
    httpIconHandler: function(bookmark) {
        /**:GateOne.Bookmarks.httpIconHandler(bookmark)

        Retrieves the icon for the given HTTP or HTTPS *bookmark* and saves it in the bookmarks DB.
        */
        var params = 'url=' + bookmark.url,
            callback = u.partial(b.storeFavicon, bookmark),
            xhr = new XMLHttpRequest(),
            handleStateChange = function(e) {
                var status = null;
                try {
                    status = parseInt(e.target.status);
                } catch(e) {
                    return;
                }
                if (e.target.readyState == 4) {
                    b.fetchingIcon = false; // All done regardless of what happened
                    callback(e.target.responseText); // storeFavicon will take care of filtering out bad responses
                }
            };
        if (!b.fetchingIcon) {
            b.fetchingIcon = true;
            if (xhr.addEventListener) {
                xhr.addEventListener('readystatechange', handleStateChange, false);
            } else {
                xhr.onreadystatechange = handleStateChange;
            }
            xhr.open('POST', go.prefs.url+'bookmarks/fetchicon', true);
            xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            xhr.send(params);
        } else {
            setTimeout(function() {
                b.httpIconHandler(bookmark);
            }, 50); // Wait a moment and retry
        }
    },
    createBookmark: function(bmContainer, bookmark, delay, /*opt*/ad) {
        /**:GateOne.Bookmarks.createBookmark(bmContainer, bookmark, delay)

        Creates a new bookmark element and places it in *bmContainer*.  Also returns the bookmark element.

        :param DOM_node bmContainer: The DOM node we're going to be placing the bookmark.
        :param object bookmark: A bookmark object (presumably taken from :js:attr:`GateOne.Bookmarks.bookmarks`)
        :param number delay: The amount of milliseconds to wait before translating (sliding) the bookmark into view.
        :param boolean ad: If true, will not bother adding tags or edit/delete/share links.
        */
        logDebug('createBookmark() bookmark: ' + bookmark.url);
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            twoSec = null,
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            bmStats = u.createElement('div', {'class': '✈bm_stats ✈superfasttrans', 'style': {'opacity': 0}}),
            dateObj = new Date(parseInt(bookmark.created)),
            bmElement = u.createElement('div', {'class': '✈bookmark ✈halfsectrans', 'name': 'bookmark'}),
            bmLinkFloat = u.createElement('div', {'class': '✈linkfloat'}), // So the user can click anywhere on a bookmark to open it
            bmContent = u.createElement('span', {'class': '✈bm_content'}),
            bmFavicon = u.createElement('span', {'class': '✈bm_favicon'}),
            bmLink = u.createElement('a', {'href': bookmark.url, 'class': '✈bm_url', 'tabindex': 2}),
            bmEdit = u.createElement('a'),
            bmDelete = u.createElement('a'),
            bmControls = u.createElement('span', {'class': '✈bm_controls'}),
            bmDesc = u.createElement('span', {'class': '✈bm_desc'}),
            bmVisited = u.createElement('span', {'class': '✈bm_visited', 'title': 'Number of visits'}),
            bmTaglist = u.createElement('ul', {'class': '✈bm_taglist'});
            bmElement.addEventListener('dragstart', b.handleDragStart, false);
            bmElement.addEventListener('dragenter', b.handleDragEnter, false);
            bmElement.addEventListener('dragover', b.handleDragOver, false);
            bmElement.addEventListener('dragleave', b.handleDragLeave, false);
            bmElement.addEventListener('drop', b.handleDrop, false);
            bmElement.addEventListener('dragend', b.handleDragEnd, false);
        bmEdit.innerHTML = 'Edit |';
        bmDelete.innerHTML = 'Delete';
        bmEdit.onclick = function(e) {
            e.preventDefault();
            b.editBookmark(this);
        }
        bmDelete.onclick = function(e) {
            e.preventDefault();
            b.deleteBookmark(this);
        }
        bmControls.appendChild(bmEdit);
        bmControls.appendChild(bmDelete);
        bmStats.innerHTML = months[dateObj.getMonth()] + '<br />' + dateObj.getDay() + '<br />' + dateObj.getFullYear();
        bmElement.title = bookmark.url;
        if (bookmark.url.indexOf('%s') != -1) {
            // This is a keyword search URL.  Mark it as such.
            bmLink.innerHTML = '<span class="✈search">' + gettext('Search:') + '</span> ' + bookmark.name;
        } else {
            bmLink.innerHTML = bookmark.name;
        }
        bmLink.onclick = function(e) {
            e.preventDefault();
            b.openBookmark(this.href);
        };
        bmLink.onfocus = function(e) {
            bmElement.className = "✈bookmark ✈halfsectrans ✈bmfocus";
        }
        bmLink.onblur = function(e) {
            bmElement.className = "✈bookmark ✈halfsectrans";
        }
        if (ad) {
            bmLink.innerHTML = "AD: " + bmLink.innerHTML;
            bmDesc.innerHTML = bookmark.notes;
        }
        if (!b.bookmarks.length) {
            // Add the notes if there's no bookmarks since this is just the "Welcome" message
            bmDesc.innerHTML = bookmark.notes;
        }
        if (bookmark.images['favicon']) {
            bmFavicon.innerHTML = '<img align="left" src="' + bookmark['images']['favicon'] + '" width="16" height="16">';
            bmContent.appendChild(bmFavicon);
        }
        bmContent.appendChild(bmLink);
        // The Link Float div sits behind everything but on top of bmElement and allows us to click anywhere to open the bookmark without clobbering the onclick events of tags, edit/delete, etc
        bmElement.appendChild(bmContent);
        bmDesc.innerHTML = bookmark.notes;
        bmContent.appendChild(bmDesc);
        if (!ad && b.bookmarks.length) {
            var bmDateTag = u.createElement('li', {'class': '✈bm_autotag'}),
                goTag = u.createElement('li', {'class': '✈bm_autotag ✈bm_urltype_tag'}),
                urlType = bookmark.url.split(':')[0],
                dateTag = b.getDateTag(dateObj);
            bmVisited.innerHTML = bookmark.visits;
            bmElement.appendChild(bmVisited);
            bmElement.appendChild(bmControls);
            bookmark.tags.sort(); // Make them alphabetical
            bookmark.tags.forEach(function(tag) {
                var bmTag = u.createElement('li', {'class': '✈bm_tag'});
                bmTag.innerHTML = tag;
                bmTag.onclick = function(e) {
                    b.addFilterTag(b.filteredBookmarks, tag);
                };
                bmTaglist.appendChild(bmTag);
            });
            goTag.innerHTML = urlType; // The ★ gets added via CSS
            goTag.onclick = function(e) {
                b.addFilterURLTypeTag(b.filteredBookmarks, urlType);
            }
            bmTaglist.appendChild(goTag);
            bmDateTag.innerHTML = dateTag;
            bmDateTag.onclick = function(e) {
                b.addFilterDateTag(b.filteredBookmarks, dateTag);
            };
            bmTaglist.appendChild(bmDateTag);
            bmElement.appendChild(bmTaglist);
        }
        bmElement.appendChild(bmLinkFloat);
        bmLinkFloat.oncontextmenu = function(e) {
            // If the user invokes the context menu we want to make sure they can select the "copy link" option so we hide the linkfloat
            u.hideElement(bmLinkFloat);
            setTimeout(function() {
                // Bring it back after a moment.
                u.showElement(bmLinkFloat);
            }, 250);
        }
        bmLinkFloat.onclick = function(e) {
            b.openBookmark(bmLink.href);
        }
        bmElement.style.opacity = 0;
        setTimeout(function() {
            bmElement.style.opacity = 1;
        }, 500);
        try {
            bmContainer.appendChild(bmElement);
        } catch(e) {
            u.noop(); // Sometimes bmContainer will be missing between page loads--no biggie
        }
        setTimeout(function() {
            try {
                go.Visual.applyTransform(bmElement, '');
            } catch(e) {
                u.noop(); // Bookmark element was removed already.  No biggie.
            }
        }, delay);
        delay += 50;
        return bmElement;
    },
    createSortOpts: function() {
        /**:GateOne.Bookmarks.createSortOpts()

        Returns a span representing the current sort direction and "sort by" type.
        */
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            bmSortOpts = u.createElement('span', {'id': 'bm_sort_options', 'class': '✈bm_sort_options'}),
            bmSortAlpha = u.createElement('a', {'id': 'bm_sort_alpha', 'class': '✈bm_sort_alpha'}),
            bmSortDate = u.createElement('a', {'id': 'bm_sort_date', 'class': '✈bm_sort_date'}),
            bmSortVisits = u.createElement('a', {'id': 'bm_sort_visits', 'class': '✈bm_sort_visits'}),
            bmSortDirection = u.createElement('div', {'id': 'bm_sort_direction', 'class': '✈bm_sort_direction'});
        bmSortAlpha.innerHTML = 'Alphabetical ';
        bmSortDate.innerHTML = 'Date ';
        bmSortVisits.innerHTML = 'Visits ';
        bmSortDirection.innerHTML = '▼';
        bmSortOpts.innerHTML = '<b>Sort:</b> ';
        if (localStorage[prefix+'sort'] == 'alpha') {
            bmSortAlpha.className = '✈active';
        } else if (localStorage[prefix+'sort'] == 'date') {
            bmSortDate.className = '✈active';
        } else if (localStorage[prefix+'sort'] == 'visits') {
            bmSortVisits.className = '✈active';
        }
        bmSortAlpha.onclick = function(e) {
            if (localStorage[prefix+'sort'] != 'alpha') {
                b.sortfunc = b.sortFunctions.alphabetical;
                u.getNode('#'+prefix+'bm_sort_' + localStorage[prefix+'sort']).className = null;
                u.getNode('#'+prefix+'bm_sort_alpha').className = '✈active';
                b.loadBookmarks();
                localStorage[prefix+'sort'] = 'alpha';
            }
        }
        bmSortDate.onclick = function(e) {
            if (localStorage[prefix+'sort'] != 'date') {
                b.sortfunc = b.sortFunctions.created;
                u.getNode('#'+prefix+'bm_sort_' + localStorage[prefix+'sort']).className = null;
                u.getNode('#'+prefix+'bm_sort_date').className = '✈active';
                b.loadBookmarks();
                localStorage[prefix+'sort'] = 'date';
            }
        }
        bmSortVisits.onclick = function(e) {
            if (localStorage[prefix+'sort'] != 'visits') {
                b.sortfunc = b.sortFunctions.visits;
                u.getNode('#'+prefix+'bm_sort_' + localStorage[prefix+'sort']).className = null;
                u.getNode('#'+prefix+'bm_sort_visits').className = '✈active';
                b.loadBookmarks();
                localStorage[prefix+'sort'] = 'visits';
            }
        }
        bmSortOpts.appendChild(bmSortAlpha);
        bmSortOpts.appendChild(bmSortDate);
        bmSortOpts.appendChild(bmSortVisits);
        bmSortOpts.appendChild(bmSortDirection);
        return bmSortOpts;
    },
    createPanel: function(/*opt*/embedded) {
        /**:GateOne.Bookmarks.createPanel([embedded])

        Creates the bookmarks panel.  If the bookmarks panel already exists it will be destroyed and re-created, resetting the pagination.

        If *embedded* is true then we'll just load the header (without search).
        */
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            delay = 1000, // Pretty much everything has the 'sectrans' class for 1-second transition effects
            existingPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            bmPanel = u.createElement('div', {'id': 'panel_bookmarks', 'class': '✈panel ✈sectrans ✈panel_bookmarks'}),
            panelClose = u.createElement('div', {'id': 'icon_closepanel', 'class': '✈panel_close_icon', 'title': gettext("Close This Panel")}),
            bmHeader = u.createElement('div', {'id': 'bm_header', 'class': '✈sectrans'}),
            bmContainer = u.createElement('div', {'id': 'bm_container', 'class': '✈bm_container ✈sectrans'}),
            bmPagination = u.createElement('div', {'id': 'bm_pagination', 'class': '✈bm_pagination ✈sectrans'}),
            bmTags = u.createElement('div', {'id': 'bm_tags', 'class': '✈bm_tags ✈sectrans'}),
            bmNew = u.createElement('a', {'id': 'bm_new', 'class': '✈bm_new ✈quartersectrans', 'tabindex': 3}),
            bmHRFix = u.createElement('hr', {'style': {'opacity': 0, 'margin-bottom': 0}}),
            bmDisplayOpts = u.createElement('div', {'id': 'bm_display_opts', 'class': '✈bm_display_opts ✈sectransform'}),
            bmSortOpts = b.createSortOpts(),
            bmOptions = u.createElement('div', {'id': 'bm_options', 'class': '✈bm_options'}),
            bmExport = u.createElement('a', {'id': 'bm_export', 'title': gettext('Save your bookmarks to a file')}),
            bmImport = u.createElement('a', {'id': 'bm_import', 'title': gettext('Import bookmarks from another application')}),
            bmSync = u.createElement('a', {'id': 'bm_sync', 'title': gettext('Synchronize your bookmarks with the server.')}),
            bmH2 = u.createElement('h2'),
            bmHeaderImage = u.createElement('span', {'id': 'bm_header_star'}),
            bmSearch = u.createElement('input', {'id': 'bm_search', 'class': '✈bm_search', 'name': prefix+'search', 'type': 'search', 'tabindex': 1, 'placeholder': gettext('Search Bookmarks')}),
            toggleSort = u.partial(b.toggleSortOrder, b.bookmarks);
        bmH2.innerHTML = 'Bookmarks';
        panelClose.innerHTML = go.Icons['panelclose'];
        panelClose.onclick = function(e) {
            go.Visual.togglePanel('#'+prefix+'panel_bookmarks'); // Scale away, scale away, scale away.
        }
        if (!embedded) {
            bmH2.appendChild(bmSearch);
            bmSearch.onchange = function(e) {
                b.page = 0;
                if (bmSearch.value) {
                    b.searchFilter = bmSearch.value;
                    b.filterBookmarksBySearchString(bmSearch.value);
                } else {
                    b.searchFilter = null;
                    b.loadBookmarks();
                }
            }
        }
        bmHeader.appendChild(bmH2);
        bmHeader.appendChild(panelClose);
        bmTags.innerHTML = '<span id="'+prefix+'bm_taglist_label" class="✈bm_taglist_label">' + gettext('Tag Filter:') + '</span> <ul id="'+prefix+'bm_taglist"></ul> ';
        bmSync.innerHTML = gettext('Sync Bookmarks') + ' | ';
        bmImport.innerHTML = gettext('Import') + ' | ';
        bmExport.innerHTML = gettext('Export');
        bmImport.onclick = function(e) {
            b.openImportDialog();
        }
        bmExport.onclick = function(e) {
            b.openExportDialog();
        }
        bmSync.onclick = function(e) {
            e.preventDefault();
            var USN = localStorage[prefix+'USN'] || 0;
            this.innerHTML = gettext("Synchronizing...") + " | ";
            if (!b.bookmarks.length) {
                go.Visual.displayMessage(gettext("NOTE: Since this is your first sync it can take a few seconds.  Please be patient."));
            } else {
                go.Visual.displayMessage(gettext("Please wait while we synchronize your bookmarks..."));
            }
            b.syncTimer = setInterval(function() {
                go.Visual.displayMessage(gettext("Please wait while we synchronize your bookmarks..."));
            }, 6000);
            go.ws.send(JSON.stringify({'terminal:bookmarks_get': USN}));
        }
        bmOptions.appendChild(bmSync);
        bmOptions.appendChild(bmImport);
        bmOptions.appendChild(bmExport);
        bmTags.appendChild(bmOptions);
        bmNew.innerHTML = gettext('+ New Bookmark');
        bmNew.onclick = b.openNewBookmarkForm;
        bmNew.onkeyup = function(e) {
            if (e.keyCode == 13) { // Enter key
                bmNew.click(); // Simulate clicking on it
            }
        }
        bmDisplayOpts.appendChild(bmSortOpts);
        bmHeader.appendChild(bmTags);
        bmHeader.appendChild(bmHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        go.Visual.applyTransform(bmPagination, 'translate(300%, 0)');
        if (existingPanel) {
            // Remove everything first
            while (existingPanel.childNodes.length >= 1 ) {
                existingPanel.removeChild(existingPanel.firstChild);
            }
            // Since we didn't use GateOne.Utils.removeElement for the above, make sure we clean out the node cache so everything can be garbage collected
            u._nodeCache = {};
            // Fade it in nicely
            bmHeader.style.opacity = 0;
            existingPanel.appendChild(bmHeader);
            existingPanel.appendChild(bmNew);
            existingPanel.appendChild(bmDisplayOpts);
            existingPanel.appendChild(bmContainer);
            existingPanel.appendChild(bmPagination);
            go.Visual.applyTransform(bmNew, 'translate(-300%, 0)');
            go.Visual.applyTransform(bmDisplayOpts, 'translate(300%, 0)');
            setTimeout(function() { // Fade them in
                bmHeader.style.opacity = 1;
                go.Visual.applyTransform(bmNew, '');
                go.Visual.applyTransform(bmDisplayOpts, '');
            }, 700);
            u.getNode('#'+prefix+'bm_sort_direction').onclick = toggleSort;
        } else {
            bmPanel.appendChild(bmHeader);
            u.hideElement(bmPanel); // Start out hidden
            u.getNode(go.prefs.goDiv).appendChild(bmPanel);
            if (!embedded) {
                bmPanel.appendChild(bmNew);
                bmPanel.appendChild(bmDisplayOpts);
                bmPanel.appendChild(bmContainer);
                bmPanel.appendChild(bmPagination);
                u.getNode('#'+prefix+'bm_sort_direction').onclick = toggleSort;
            }
        }
        if (!embedded) {
            b.loadTagCloud('tags');
            setTimeout(function() { // Fade them in and load the bookmarks
                go.Visual.applyTransform(bmPagination, '');
                b.loadBookmarks(1);
            }, 800); // Needs to be just a bit longer than the previous setTimeout
        }
        // Autofocus the search box after everything is drawn
        setTimeout(function() {
            bmSearch.focus();
        }, 1000);
    },
    loadTagCloud: function(active) {
        /**:GateOne.Bookmarks.loadTagCloud([active])

        Loads the tag cloud.  If *active* is given it must be one of 'tags' or 'autotags'.  It will mark the appropriate header as inactive and load the respective tags.

        */
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix,
            delay = 1000,
            existingPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            existingTagCloud = u.getNode('#'+prefix+'bm_tagcloud'),
            existingTagCloudUL = u.getNode('#'+prefix+'bm_tagcloud_ul'),
            existingTip = u.getNode('#'+prefix+'bm_tagcloud_tip'),
            existingTagsLink = u.getNode('#'+prefix+'bm_tags_header_link'),
            existingAutotagsLink = u.getNode('#'+prefix+'bm_autotags_header_link'),
            bmTagCloud = u.createElement('div', {'id': 'bm_tagcloud', 'class': '✈sectrans ✈bm_tagcloud'}),
            bmTagCloudUL = u.createElement('ul', {'id': 'bm_tagcloud_ul', 'class': '✈bm_tagcloud_ul'}),
            bmTagCloudTip = u.createElement('span', {'id': 'bm_tagcloud_tip', 'class': '✈sectrans ✈bm_tagcloud_tip'}),
            bmTagsHeader = u.createElement('h3', {'class': '✈sectrans'}),
            pipeSeparator = u.createElement('span'),
            bmTagsHeaderTagsLink = u.createElement('a', {'id': 'bm_tags_header_link', 'class': '✈bm_tags_header_link'}),
            bmTagsHeaderAutotagsLink = u.createElement('a', {'id': 'bm_autotags_header_link', 'class': '✈bm_autotags_header_link'}),
            allTags = b.getTags(b.bookmarks),
            allAutotags = b.getAutotags(b.bookmarks);
        bmTagsHeaderTagsLink.onclick = function(e) {
            b.loadTagCloud('tags');
        }
        bmTagsHeaderAutotagsLink.onclick = function(e) {
            b.loadTagCloud('autotags');
        }
        if (active) {
            if (active == 'tags') {
                if (existingAutotagsLink) {
                    existingTagsLink.className = '';
                    existingAutotagsLink.className = '✈inactive';
                } else {
                    bmTagsHeaderAutotagsLink.className = '✈inactive';
                }
            } else if (active == 'autotags') {
                if (existingTagsLink) {
                    existingTagsLink.className = '✈inactive';
                    existingAutotagsLink.className = '';
                } else {
                    bmTagsHeaderTagsLink.className = '✈inactive';
                }
            }
        }
        if (existingTagCloudUL) {
            // Send all the tags away
            u.toArray(existingTagCloudUL.childNodes).forEach(function(elem) {
                elem.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(elem);
                }, 1000);
            });
            setTimeout(function() {
                u.removeElement(existingTagCloudUL);
            }, 1000);
        }
        if (existingTip) {
            existingTip.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(existingTip);
            }, 800);
        }
        setTimeout(function() { // This looks nicer if it comes last
            bmTagCloudTip.style.opacity = 1;
        }, 3000);
        setTimeout(function() { // Make it go away after a while
            bmTagCloudTip.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(bmTagCloudTip);
            }, 1000);
        }, 30000);
        go.Visual.applyTransform(bmTagsHeader, 'translate(300%, 0)');
        bmTagsHeaderAutotagsLink.innerHTML = gettext("Autotags");
        pipeSeparator.innerHTML = " | ";
        bmTagsHeaderTagsLink.innerHTML = gettext("Tags");
        bmTagsHeader.appendChild(bmTagsHeaderTagsLink);
        bmTagsHeader.appendChild(pipeSeparator);
        bmTagsHeader.appendChild(bmTagsHeaderAutotagsLink);
        bmTagCloudTip.style.opacity = 0;
        bmTagCloudTip.innerHTML = "<br><b>" + gettext("Tip:") + "</b> " + b.generateTip();
        if (existingTagCloud) {
            existingTagCloud.appendChild(bmTagCloudUL);
            existingTagCloud.appendChild(bmTagCloudTip);
        } else {
            bmTagCloud.appendChild(bmTagsHeader);
            bmTagCloud.appendChild(bmTagCloudUL);
            bmTagCloud.appendChild(bmTagCloudTip);
            existingPanel.appendChild(bmTagCloud);
        }
        if (active == 'tags') {
            allTags.forEach(function(tag) {
                var li = u.createElement('li', {'class': '✈bm_tag ✈sectrans', 'title': gettext('Click to filter or drop on a bookmark to tag it.'), 'draggable': true});
                li.innerHTML = tag;
                li.addEventListener('dragstart', b.handleDragStart, false);
                v.applyTransform(li, 'translateX(700px)');
                li.onclick = function(e) {
                    b.addFilterTag(b.bookmarks, tag);
                };
                li.oncontextmenu = function(e) {
                    // Bring up the context menu
                    e.preventDefault(); // Prevent regular context menu
                    b.tagContextMenu(li);
                }
                bmTagCloudUL.appendChild(li);
                if (tag == "Untagged") {
                    li.className = '✈bm_tag ✈sectrans ✈untagged';
                }
                setTimeout(function unTrans() {
                    v.applyTransform(li, '');
                }, delay);
                delay += 50;
            });
        } else if (active == 'autotags') {
            allAutotags.forEach(function(tag) {
                var li = u.createElement('li', {'title': gettext('Click to filter.')});
                li.innerHTML = tag;
                v.applyTransform(li, 'translateX(700px)');
                if (u.startsWith('<', tag) || u.startsWith('>', tag)) { // Date tag
                    li.className = '✈bm_autotag ✈sectrans';
                    li.onclick = function(e) {
                        b.addFilterDateTag(b.bookmarks, tag);
                    };
                    setTimeout(function unTrans() {
                        v.applyTransform(li, '');
                        setTimeout(function() {
                            li.className = '✈bm_autotag';
                        }, 1000);
                    }, delay);
                } else { // URL type tag
                    li.className = '✈bm_autotag ✈bm_urltype_tag ✈sectrans';
                    li.onclick = function(e) {
                        b.addFilterURLTypeTag(b.bookmarks, tag);
                    }
                    setTimeout(function unTrans() {
                        v.applyTransform(li, '');
                        setTimeout(function() {
                            li.className = '✈bm_autotag ✈bm_urltype_tag';
                        }, 1000);
                    }, delay);
                }
                bmTagCloudUL.appendChild(li);
                delay += 50;
            });
        }
        setTimeout(function() {
            v.applyTransform(bmTagsHeader, '');
        }, 800);
    },
    registerURLHandler: function(protocol, handler) {
        /**:GateOne.Bookmarks.registerURLHandler(protocol, handler)

        Registers the given *handler* as the function to use whenever a bookmark is opened with a matching *protocol*.

        When the given *handler* is called it will be passed the URL as the only argument.
        */
        b.URLHandlers[protocol] = handler;
    },
    registerIconHandler: function(protocol, handler) {
        /**:GateOne.Bookmarks.registerIconHandler(protocol, handler)

        Registers the given *handler* as the function to use whenever a bookmark icon needs to be retrieved for the given *protocol*.

        When the given *handler* is called it will be passed the bookmark object as the only argument.  It is up to the handler to call (or not) ``GateOne.Bookmarks.storeFavicon(bookmark, <icon data URI>);`` to store the icon.
        */
        b.iconHandlers[protocol] = handler;
    },
    openBookmark: function(URL) {
        /**:GateOne.Bookmarks.openBookmark(URL)

        Calls the function in `GateOne.Bookmarks.URLHandlers` associated with the protocol of the given *URL*.

        If no function is registered for the given *URL* protocol a new browser window will be opened using the given *URL*.
        */
        var bookmark = b.getBookmarkObj(URL),
            parsed = b.parseUri(URL);
        if (URL.indexOf('%s') != -1) { // This is a keyword search bookmark
            b.openSearchDialog(URL, bookmark.name);
            return;
        }
        b.incrementVisits(URL);
        if (b.URLHandlers[parsed.protocol]) {
            b.URLHandlers[parsed.protocol](URL);
        } else {
            // Let the browser handle it
            window.open(URL);
        }
        go.Visual.togglePanel('#'+prefix+'panel_bookmarks');
        E.trigger("bookmarks:open_bookmark", URL);
    },
    toggleSortOrder: function() {
        /**:GateOne.Bookmarks.toggleSortOrder()

        Reverses the order of the bookmarks list.
        */
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            sortDirection = u.getNode('#'+prefix+'bm_sort_direction');
        if (b.sortToggle) {
            b.sortToggle = false;
            b.loadBookmarks();
            go.Visual.applyTransform(sortDirection, 'rotate(0deg)');
        } else {
            b.sortToggle = true;
            b.loadBookmarks();
            go.Visual.applyTransform(sortDirection, 'rotate(180deg)');
        }
    },
    filterBookmarksBySearchString: function(str) {
        /**:GateOne.Bookmarks.filterBookmarksBySearchString(str)

        Filters bookmarks to those matching *str* (used by the search function).
        */
        // Set the global search filter so we can use it within other functions
        var go = GateOne,
            b = go.Bookmarks;
        b.searchFilter = str;
        b.loadBookmarks();
    },
    addFilterTag: function(bookmarks, tag) {
        /**:GateOne.Bookmarks.addFilterTag(bookmarks, tag)

        Adds the given *tag* to the filter list.  *bookmarks* is unused.
        */
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.tags) {
            if (b.tags[i] == tag) {
                // Tag already exists, ignore.
                return;
            }
        }
        b.tags.push(tag);
        // NOTE: Saving this for future reference in case I want to add the ability to pre-load Gate One with certain bookmark tag filters or something similar
//         if (window.history.pushState) {
//             var tagString = b.tags.join(',');
//             window.history.pushState("", "Bookmarked. Tag Filter: " + tagString, "/?filtertags=" + tagString);
//         }
        // Reset the pagination since our bookmark list will change
        b.page = 0;
        b.loadBookmarks();
    },
    removeFilterTag: function(bookmarks, tag) {
        /**:GateOne.Bookmarks.removeFilterTag(bookmarks, tag)

        Removes the given *tag* from the filter list.  *bookmarks* is unused.
        */
        logDebug('removeFilterTag tag: ' + tag);
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.tags) {
            if (b.tags[i] == tag) {
                b.tags.splice(i, 1);
            }
        }
//         if (window.history.pushState) {
//             if (b.tags.length) {
//                 var tagString = b.tags.join(',');
//                 window.history.pushState("", "Bookmarked. Tag Filter: " + tagString, "/?filtertags=" + tagString);
//             } else {
//                 window.history.pushState("", "Default", "/"); // Set it back to the default URL
//             }
//         }
        // Reset the pagination since our bookmark list will change
        b.page = 0;
        b.loadBookmarks();
    },
    addFilterDateTag: function(bookmarks, dateTag) {
        /**:GateOne.Bookmarks.addFilterDateTag(bookmarks, dateTag)

        Adds the given *dateTag* to the filter list.  *bookmarks* is unused.
        */
        logDebug('addFilterDateTag: ' + dateTag);
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.dateTags) {
            if (b.dateTags[i] == dateTag) {
                // Tag already exists, ignore.
                return;
            }
        }
        b.dateTags.push(dateTag);
        // Reset the pagination since our bookmark list will change
        b.page = 0;
        b.loadBookmarks();
    },
    removeFilterDateTag: function(bookmarks, dateTag) {
        /**:GateOne.Bookmarks.removeFilterDateTag(bookmarks, dateTag)

        Removes the given *dateTag* from the filter list.  *bookmarks* is unused.
        */
        logDebug("removeFilterDateTag: " + dateTag);
        var go = GateOne,
            b = go.Bookmarks;
        // Change the &lt; and &gt; back into < and >
        dateTag = dateTag.replace('&lt;', '<');
        dateTag = dateTag.replace('&gt;', '>');
        for (var i in b.dateTags) {
            if (b.dateTags[i] == dateTag) {
                b.dateTags.splice(i, 1);
            }
        }
        b.loadBookmarks();
    },
    addFilterURLTypeTag: function(bookmarks, typeTag) {
        /**:GateOne.Bookmarks.addFilterURLTypeTag(bookmarks, typeTag)

        Adds the given *typeTag* to the filter list.  *bookmarks* is unused.
        */
        logDebug('addFilterURLTypeTag: ' + typeTag);
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.URLTypeTags) {
            if (b.URLTypeTags[i] == typeTag) {
                // Tag already exists, ignore.
                return;
            }
        }
        b.URLTypeTags.push(typeTag);
        // Reset the pagination since our bookmark list will change
        b.page = 0;
        b.loadBookmarks();
    },
    removeFilterURLTypeTag: function(bookmarks, typeTag) {
        /**:GateOne.Bookmarks.removeFilterURLTypeTag(bookmarks, typeTag)

        Removes the given *typeTag* from the filter list.  *bookmarks* is unused.
        */
        logDebug("removeFilterURLTypeTag: " + typeTag);
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.URLTypeTags) {
            if (b.URLTypeTags[i] == typeTag) {
                b.URLTypeTags.splice(i, 1);
            }
        }
        b.loadBookmarks();
    },
    getTags: function(/*opt*/bookmarks) {
        /**:GateOne.Bookmarks.getTags([bookmarks])

        Returns an array of all the tags in `GateOne.Bookmarks.bookmarks` or *bookmarks* if given.

        .. note:: Ordered alphabetically
        */
        var go = GateOne,
            b = go.Bookmarks,
            tagList = [];
        if (!bookmarks) {
            bookmarks = b.bookmarks;
        }
        bookmarks.forEach(function(bookmark) {
            if (bookmark.tags) {
                if (go.Utils.isArray(bookmark.tags)) {
                    bookmark.tags.forEach(function(tag) {
                        if (tagList.indexOf(tag) == -1) {
                            tagList.push(tag);
                        }
                    });
                }
            }
        });
        tagList.sort();
        return tagList;
    },
    getAutotags: function(/*opt*/bookmarks) {
        /**:GateOne.Bookmarks.getAutotags([bookmarks])

        Returns an array of all the autotags in `GateOne.Bookmarks.bookmarks` or *bookmarks* if given.

        .. note:: Ordered alphabetically with the URL types coming before date tags.
        */
        var go = GateOne,
            b = go.Bookmarks,
            autoTagList = [],
            dateTagList = [];
        if (!bookmarks) {
            bookmarks = b.bookmarks;
        }
        bookmarks.forEach(function(bookmark) {
            var dateObj = new Date(parseInt(bookmark.created)),
                dateTag = b.getDateTag(dateObj),
                urlType = bookmark.url.split(':')[0];
            if (dateTagList.indexOf(dateTag) == -1) {
                dateTagList.push(dateTag);
            }
            if (autoTagList.indexOf(urlType) == -1) {
                autoTagList.push(urlType);
            }
        });
        autoTagList.sort();
        dateTagList.sort();
        return autoTagList.concat(dateTagList);
    },
    openImportDialog: function() {
        /**:GateOne.Bookmarks.openImportDialog()

        Displays the form where a user can create or edit a bookmark.

        If *URL* is given, pre-fill the form with the associated bookmark for editing.
        */
        var go = GateOne,
            prefix = go.prefs.prefix,
            u = go.Utils,
            b = go.Bookmarks,
            bmForm = u.createElement('form', {'name': prefix+'bm_import_form', 'id': 'bm_import_form', 'class': '✈bm_import_form ✈sectrans', 'enctype': 'multipart/form-data'}),
            importLabel = u.createElement('label', {'style': {'text-align': 'center'}}),
            importFile = u.createElement('input', {'type': 'file', 'id': 'bookmarks_upload', 'class': '✈bookmarks_upload', 'name': prefix+'bookmarks_upload'}),
            buttonContainer = u.createElement('div', {'id': 'bm_buttons', 'class': '✈bm_buttons'}),
            bmSubmit = u.createElement('button', {'id': 'bm_submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈bm_submit ✈button ✈black'}),
            bmCancel = u.createElement('button', {'id': 'bm_cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈bm_submit ✈button ✈black'}),
            bmHelp = u.createElement('p');
        bmSubmit.innerHTML = gettext("Submit");
        bmCancel.innerHTML = gettext("Cancel");
        importLabel.innerHTML = "Upload bookmarks.html or bookmarks.json";
        importLabel.htmlFor = prefix+'bookmarks_upload';
        bmForm.appendChild(importLabel);
        bmForm.appendChild(importFile);
        buttonContainer.appendChild(bmSubmit);
        buttonContainer.appendChild(bmCancel);
        bmForm.appendChild(buttonContainer);
        bmHelp.innerHTML = '<i>' + gettext('Imported bookmarks will be synchronized the next time you click, "Sync Bookmarks".') + '</i>'
        bmForm.appendChild(bmHelp);
        var closeDialog = go.Visual.dialog(gettext("Import Bookmarks"), bmForm, {'class': '✈prefsdialog', 'style': {'top': '15%'}}); // Looks better if a bit closer to the top of the page (as an initial location)
        bmForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // NOTE:  Using HTML5 file uploads here...  Should work fine in Opera, Firefox, and Webkit
            var delay = 1000,
                fileInput = u.getNode('#'+prefix+'bookmarks_upload'),
                file = fileInput.files[0],
                xhr = new XMLHttpRequest(),
                handleStateChange = function(e) {
                    var status = null;
                    try {
                        status = parseInt(e.target.status);
                    } catch(e) {
                        return;
                    }
                    if (e.target.readyState == 4 && status == 200 && e.target.responseText) {
                        var bookmarks = JSON.parse(e.target.responseText),
                            count = b.storeBookmarks(bookmarks, true);
                        go.Visual.displayMessage(count+gettext(" bookmarks imported."));
                        go.Visual.displayMessage(gettext("Bookmark icons will be retrieved in the background"));
                        closeDialog();
                    }
                };
            if (xhr.addEventListener) {
                xhr.addEventListener('readystatechange', handleStateChange, false);
            } else {
                xhr.onreadystatechange = handleStateChange;
            }
            xhr.open('POST', go.prefs.url+'bookmarks/import', true);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.setRequestHeader("X-File-Name", file.name);
            xhr.send(file);
        }
        bmCancel.onclick = closeDialog;
    },
    // TODO: Convert this to save the bookmarks locally instead of having to submit them to the server for conversion.
    exportBookmarks: function(/*opt*/bookmarks) {
        /**:GateOne.Bookmarks.exportBookmarks([bookmarks])

        Allows the user to save their bookmarks as a Netscape-style HTML file.  Immediately starts the download.

        If *bookmarks* is given, that array will be what is exported.  Otherwise the complete `GateOne.Bookmarks.bookmarks` array will be exported.
        */
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            form = u.createElement('form', {
                'method': 'post',
                'action': go.prefs.url+'bookmarks/export'
            }),
            bookmarksJSON = u.createElement('textarea', {'name': 'bookmarks'});
        if (!bookmarks) {
            bookmarks = b.bookmarks;
        }
        bookmarksJSON.value = JSON.stringify(bookmarks);
        form.appendChild(bookmarksJSON);
        document.body.appendChild(form);
        form.submit();
        setTimeout(function() {
            // No reason to keep this around
            document.body.removeChild(form);
        }, 1000);
    },
    getDateTag: function(dateObj) {
        /**:GateOne.Bookmarks.getDateTag(dateObj)

        Given a ``Date`` object, returns a string such as "<7 days".  Suitable for use as an autotag.
        */
        var dt = new Date();
        // Substract 7 days from today's date
        dt.setDate(parseInt(dt.getDate())-1);
        if (dt < dateObj) {
            return "<1 day";
        }
        dt.setDate(parseInt(dt.getDate())-6);
        if (dt < dateObj) {
            return "<7 days";
        }
        dt.setDate(parseInt(dt.getDate())-23);
        if (dt < dateObj) {
            return "<30 days";
        }
        dt.setDate(parseInt(dt.getDate())-30);
        if (dt < dateObj) {
            return "<60 days";
        }
        dt.setDate(parseInt(dt.getDate())-120);
        if (dt < dateObj) {
            return "<180 days";
        }
        dt.setDate(parseInt(dt.getDate())-245);
        if (dt < dateObj) {
            return "<1 year";
        }
        return ">1 year";
    },
    allTags: function() {
        /**:GateOne.Bookmarks.allTags()

        Returns an array of all the tags in `localStorage[GateOne.prefs.prefix+'bookmarks']` ordered alphabetically.
        */
        var tagList = [],
            bookmarks = JSON.parse(localStorage[prefix+'bookmarks']);
        bookmarks.forEach(function(bookmark) {
            bookmark.tags.forEach(function(tag) {
                if (tagList.indexOf(tag) == -1) {
                    tagList.push(tag);
                }
            });
        });
        tagList.sort();
        return tagList;
    },
    openNewBookmarkForm: function(/*Opt*/URL) {
        /**:GateOne.Bookmarks.openNewBookmarkForm([URL])

        Displays the form where a user can create or edit a bookmark.

        If *URL* is given, pre-fill the form with the associated bookmark for editing.
        */
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix,
            formTitle = "",
            bmForm = u.createElement('form', {'name': prefix+'bm_new_form', 'id': 'bm_new_form', 'class': '✈bm_new_form ✈sectrans'}),
            urlInput = u.createElement('input', {'type': 'url', 'id': 'bm_newurl', 'class': '✈bm_newurl', 'name': prefix+'bm_newurl', 'placeholder': 'ssh://user@host:22 or http://webhost/path', 'required': 'required'}),
            urlLabel = u.createElement('label'),
            nameInput = u.createElement('input', {'type': 'text', 'id': 'bm_new_name', 'class': '✈bm_new_name', 'name': prefix+'bm_new_name', 'placeholder': gettext('Web App Server 2'), 'required': 'required'}),
            nameLabel = u.createElement('label'),
            tagsInput = u.createElement('input', {'type': 'text', 'id': 'bm_newurl_tags', 'class': '✈bm_newurl_tags', 'name': prefix+'bm_newurl_tags', 'placeholder': gettext('Linux, New York, Production')}),
            tagsLabel = u.createElement('label'),
            notesTextarea = u.createElement('textarea', {'id': 'bm_new_notes', 'name': prefix+'bm_new_notes', 'placeholder': gettext('e.g. Supported by Global Ops')}),
            notesLabel = u.createElement('label'),
            buttonContainer = u.createElement('div', {'id': 'bm_buttons', 'class': '✈bm_buttons'}),
            bmSubmit = u.createElement('button', {'id': 'bm_submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈bm_submit ✈button ✈black'}),
            bmCancel = u.createElement('button', {'id': 'bm_cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈bm_submit ✈button ✈black'}),
            bookmarks = JSON.parse(localStorage[prefix+'bookmarks']),
            index, bmName, bmTags, bmNotes;
        bmSubmit.innerHTML = gettext("Save");
        bmCancel.innerHTML = gettext("Cancel");
        urlLabel.innerHTML = "URL";
        urlLabel.htmlFor = prefix+'bm_newurl';
        nameLabel.innerHTML = gettext("Name");
        nameLabel.htmlFor = prefix+'bm_new_name';
        tagsLabel.innerHTML = gettext("Tags");
        tagsLabel.htmlFor = prefix+'bm_newurl_tags';
        notesLabel.innerHTML = gettext("Notes");
        notesLabel.htmlFor = prefix+'bm_new_notes';
        if (typeof(URL) == "string") {
            // Editing an existing bookmark
            bookmarks.forEach(function(bookmark) {
                if (bookmark.url == URL) {
                    bmName = bookmark.name;
                    bmTags = bookmark.tags;
                    bmNotes = bookmark.notes;
                }
            });
            formTitle = gettext("Edit Bookmark");
            urlInput.value = URL;
            nameInput.value = bmName;
            tagsInput.value = bmTags;
            notesTextarea.value = bmNotes;
        } else {
            // Creating a new bookmark (blank form)
            formTitle = gettext("New Bookmark");
        }
        bmForm.appendChild(urlLabel);
        bmForm.appendChild(urlInput);
        bmForm.appendChild(nameLabel);
        bmForm.appendChild(nameInput);
        bmForm.appendChild(tagsLabel);
        bmForm.appendChild(tagsInput);
        bmForm.appendChild(notesLabel);
        bmForm.appendChild(notesTextarea);
        buttonContainer.appendChild(bmSubmit);
        buttonContainer.appendChild(bmCancel);
        bmForm.appendChild(buttonContainer);
        setTimeout(function() {
            u.getNode('#'+prefix+'bm_newurl').focus();
        }, 1000);
        var closeDialog = go.Visual.dialog(formTitle, bmForm, {'class': '✈prefsdialog', 'style': {'top': '15%'}});
        bmForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var url = u.getNode('#'+prefix+'bm_newurl').value,
                parsed = b.parseUri(url),
                name = u.getNode('#'+prefix+'bm_new_name').value,
                tags = u.getNode('#'+prefix+'bm_newurl_tags').value,
                notes = u.getNode('#'+prefix+'bm_new_notes').value,
                now = new Date();
            if (!url.length) {
                v.displayMessage(gettext("Error: URL is missing"));
                return false;
            }
            if (!parsed.protocol) {
                v.displayMessage(gettext("Error: URL does not contain a valid protocol (e.g. ssh:// or http://)"));
                return false;
            }
            if (!name.length) {
                v.displayMessage(gettext("Error: You must give this bookmark a name."));
                return false;
            }
            // Fix any missing trailing slashes in the URL
            if (url.slice(0,4) == "http" && url.indexOf('/', 7) == -1) {
                url = url + "/";
            }
            if (tags) {
                // Convert to list
                tags = tags.split(',');
                tags = tags.map(function(item) {
                    return item.trim();
                });
            } else {
                tags = ['Untagged'];
            }
            if (typeof(URL) != "string") { // We're creating a new bookmark
                // Construct a new bookmark object
                var bm = {
                    'url': url,
                    'name': name,
                    'tags': tags,
                    'notes': notes,
                    'visits': 0,
                    'updated': now.getTime(),
                    'created': now.getTime(),
                    'updateSequenceNum': 0, // This will get set when synchronizing with the server
                    'images': {'favicon': null}
                };
                // Double-check there isn't already an existing bookmark with this URL
                for (var i in b.bookmarks) {
                    if (b.bookmarks[i].url == url) {
                        go.Visual.displayMessage(gettext('Error: Bookmark already exists with this URL.'));
                        return;
                    }
                }
                b.createOrUpdateBookmark(bm);
                // Fetch its icon
                b.updateIcon(bm);
                // Keep everything sync'd up.
                setTimeout(function() {
                    var USN = localStorage[prefix+'USN'] || 0;
                    go.ws.send(JSON.stringify({'terminal:bookmarks_get': USN}));
                    b.createPanel();
                    closeDialog();
                }, 500); // Give the icon-fetcher some time to fetch the icon before we re-draw the bookmarks list
            } else {
                // Find the existing bookmark and replace it.
                for (var i in b.bookmarks) {
                    if (b.bookmarks[i].url == URL) { // Note that we're matching the original URL
                        // This is our bookmark
                        b.bookmarks[i].url = url;
                        b.bookmarks[i].name = name;
                        b.bookmarks[i].notes = notes;
                        b.bookmarks[i].tags = tags;
                        b.bookmarks[i].updated = now.getTime();
                        b.bookmarks[i].updateSequenceNum = 0;
                        if (url != URL) { // We're changing the URL for this bookmark
                            // Have to delete the old one since the URL is used as the index in the indexedDB
                            b.removeBookmark(URL); // Delete the original URL
                        }
                        // Store the modified bookmark
                        b.createOrUpdateBookmark(b.bookmarks[i]);
                        // Re-fetch its icon
                        setTimeout(function() {
                            b.updateIcon(b.bookmarks[i]);
                            setTimeout(function() {
                                b.createPanel();
                                closeDialog();
                            }, 100);
                        }, 500);
                        break;
                    }
                }
            }
        }
        bmCancel.onclick = closeDialog;
        return true;
    },
    incrementVisits: function(URL) {
        /**:GateOne.Bookmarks.incrementVisits(URL)

        Increments by 1 the 'visits' value of the bookmark object associated with the given *URL*.
        */
        var go = GateOne,
            b = go.Bookmarks;
        b.bookmarks.forEach(function(bookmark) {
            if (bookmark.url == URL) {
                bookmark.visits += 1;
                bookmark.updated = new Date().getTime(); // So it will sync
                bookmark.updateSequenceNum = 0;
                b.storeBookmark(bookmark);
            }
        });
        b.loadBookmarks(b.sort);
    },
    editBookmark: function(obj) {
        /**:GateOne.Bookmarks.editBookmark(obj)

        Opens the bookmark editor for the given *obj* (the bookmark element on the page).

        .. note:: Only meant to be called from a 'bm_edit' anchor tag (as the *obj*).
        */
        var go = GateOne,
            url = obj.parentNode.parentNode.getElementsByClassName("✈bm_url")[0].href;
        go.Bookmarks.openNewBookmarkForm(url);
    },
    highestUSN: function() {
        /**:GateOne.Bookmarks.highestUSN()

        Returns the highest `updateSequenceNum` that exists in all bookmarks.
        */
        var b = GateOne.Bookmarks,
            highest = 0;
        b.bookmarks.forEach(function(bookmark) {
            if (bookmark['updateSequenceNum'] > highest) {
                highest = bookmark['updateSequenceNum'];
            }
        });
        return highest;
    },
    removeBookmark: function(url, callback) {
        /**:GateOne.Bookmarks.removeBookmark(url[, callback])

        Removes the bookmark matching *url* from `GateOne.Bookmarks.bookmarks` and saves the change to localStorage.

        If *callback* is given it will be called after the bookmark has been deleted.

        .. note:: Not the same thing as :js:meth:`GateOne.Bookmarks.deleteBookmark`.
        */
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix;
        // Find the matching bookmark and delete it
        for (var i in b.bookmarks) {
            if (b.bookmarks[i].url == url) {
                b.bookmarks.splice(i, 1); // Remove the bookmark in question.
            }
        }
        // Now save our new bookmarks list to disk
        localStorage[prefix+'bookmarks'] = JSON.stringify(b.bookmarks);
        if (callback) {
            callback();
        }
    },
    deleteBookmark: function(obj) {
        /**:GateOne.Bookmarks.deleteBookmark(obj)

        Asks the user for confirmation then deletes the chosen bookmark...

        *obj* can either be a URL (string) or the "go_bm_delete" anchor tag.

        .. note:: Not the same thing as :js:meth:`GateOne.Bookmarks.removeBookmark`.
        */
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix,
            url = null,
            count = 0,
            remove = null,
            confirmElement = u.createElement('div', {'id': 'bm_confirm_delete', 'class': '✈bookmark ✈halfsectrans ✈bm_confirm_delete'}),
            yes = u.createElement('button', {'id': 'bm_yes', 'class': '✈bm_yes ✈button ✈black'}),
            no = u.createElement('button', {'id': 'bm_no', 'class': '✈bm_yes ✈button ✈black'}),
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks');
        if (typeof(obj) == "string") {
            url = obj;
        } else {
            // Assume this is an anchor tag from the onclick event
            url = obj.parentNode.parentNode.getElementsByClassName("✈bm_url")[0].href;
        }
        yes.innerHTML = gettext("Yes");
        no.innerHTML = gettext("No");
        yes.onclick = function(e) {
            var USN = localStorage[prefix+'USN'] || 0;
            go.Visual.applyTransform(obj.parentNode.parentNode, 'translate(-200%, 0)');
            // Find the matching bookmark and delete it
            for (var i in b.bookmarks) {
                if (b.bookmarks[i].url == url) {
                    b.bookmarks.splice(i, 1); // Remove the bookmark in question.
                }
            }
            // Now save our new bookmarks list to disk
            localStorage[prefix+'bookmarks'] = JSON.stringify(b.bookmarks);
            // Keep everything sync'd up.
            go.ws.send(JSON.stringify({'terminal:bookmarks_get': USN}));
            setTimeout(function() {
                u.removeElement(obj.parentNode.parentNode);
            }, 1000);
        };
        no.onclick = function(e) {
            // Remove the confirmation element
            var confirm = u.getNode('#'+go.prefs.prefix+'bm_confirm_delete');
            confirm.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(confirm);
            }, 500);
        };
        // Confirm the user wants to delete the bookmark
        confirmElement.innerHTML = gettext("Are you sure you want to delete this bookmark?") + "<br />";
        confirmElement.appendChild(no);
        confirmElement.appendChild(yes);
        obj.parentNode.parentNode.appendChild(confirmElement);
        setTimeout(function() {
            confirmElement.style.opacity = 1;
        }, 250);
        // Save this bookmark in the deleted bookmarks list so we can let the server know the next time we sync
        var deletedBookmarks = localStorage[prefix+'deletedBookmarks'],
            deleted = new Date().getTime();
        if (!deletedBookmarks) {
            localStorage[prefix+'deletedBookmarks'] = JSON.stringify([{'url': url, 'deleted': deleted}]);
        } else {
            var existing = JSON.parse(deletedBookmarks);
            existing.push({'url': url, 'deleted': deleted});
            localStorage[prefix+'deletedBookmarks'] = JSON.stringify(existing);
        }
    },
    updateUSN: function(obj) {
        /**:GateOne.Bookmarks.updateUSN(obj)

        Updates the `updateSequenceNum` of the bookmark matching *obj* in `GateOne.Bookmarks.bookmarks` (and in localStorage via :js:meth:`~GateOne.Bookmarks.storeBookmark`).
        */
        var go = GateOne,
            b = go.Bookmarks,
            matched = null;
        for (var i in b.bookmarks) {
            if (b.bookmarks[i]) {
                if (b.bookmarks[i].url == obj.url) {
                    // Replace this one
                    b.bookmarks[i].updateSequenceNum = obj.updateSequenceNum;
                    matched = b.bookmarks[i];
                }
            }
        };
        // storeBookmark takes care of duplicates automatically
        if (matched) {
            b.storeBookmark(matched);
        }
    },
    createOrUpdateBookmark: function(obj) {
        /**:GateOne.Bookmarks.createOrUpdateBookmark(obj)

        Creates or updates a bookmark (in `GateOne.Bookmarks.bookmarks` and localStorage) using the given bookmark *obj*.
        */
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix,
            matched = false;
        for (var i in b.bookmarks) {
            if (b.bookmarks[i]) {
                if (b.bookmarks[i].url == obj.url) {
                    // Double-check the images to make sure we're not throwing one away
                    if (u.items(b.bookmarks[i].images).length) {
                        if (!u.items(obj.images).length) {
                            // No images in obj. Replace them with existing
                            obj['images'] = b.bookmarks[i].images;
                        }
                    }
                    // Replace this one
                    b.bookmarks[i] = obj;
                    matched = true;
                }
            }
        };
        if (!matched) {
            // Fix the name (i.e. remove leading spaces)
            obj.name = obj.name.trim();
            b.bookmarks.push(obj);
        }
        // Check if this is a keyword search
        if (obj.url.indexOf('%s') != -1) {
            // Auto-tag Searches with the "Searches" tag
            if (obj.tags.indexOf('Searches') == -1) {
                obj.tags.push('Searches');
            }
        }
        // storeBookmark takes care of duplicates automatically
        b.storeBookmark(obj);
        if (!obj['images'] || (obj['images'] && obj['images']['favicon'] === undefined)) {
            // Add this bookmark to the icon fetching queue
            localStorage[prefix+'iconQueue'] += obj.url + '\n';
        }
    },
    getMaxBookmarks: function(elem) {
        /**:GateOne.Bookmarks.getMaxBookmarks(elem)

        Calculates and returns the number of bookmarks that will fit in the given element (*elem*).  *elem* may be an element ID or a DOM node object.
        */
        try {
            var go = GateOne,
                b = go.Bookmarks,
                u = go.Utils,
                node = u.getNode(elem),
                tempBookmark = {
                    'url': "http://tempbookmark",
                    'name': "You should not see this",
                    'tags': [],
                    'notes': "This should never be visible.  If you see this, well, sigh.",
                    'visits': 0,
                    'updated': new Date().getTime(),
                    'created': new Date().getTime(),
                    'updateSequenceNum': 0, // This will get set when synchronizing with the server
                    'images': {}
                },
                bmElement = b.createBookmark(node, tempBookmark, 1),
                nodeStyle = window.getComputedStyle(node, null),
                bmStyle = window.getComputedStyle(bmElement, null),
                nodeHeight = parseInt(nodeStyle['height'].split('px')[0]),
                height = parseInt(bmStyle['height'].split('px')[0]),
                marginBottom = parseInt(bmStyle['marginBottom'].split('px')[0]),
                paddingBottom = parseInt(bmStyle['paddingBottom'].split('px')[0]),
                borderBottomWidth = parseInt(bmStyle['borderBottomWidth'].split('px')[0]),
                borderTopWidth = parseInt(bmStyle['borderTopWidth'].split('px')[0]),
                bookmarkHeight = height+marginBottom+paddingBottom+borderBottomWidth+borderTopWidth,
                max = Math.floor(nodeHeight/ bookmarkHeight);
        } catch(e) {
            return 1; // Errors can happen when loadBookmarks is called too quickly sometimes.  Almost always auto-corrects itself so no big deal.
        }
        u.removeElement(bmElement); // Don't want this hanging around
        return max;
    },
    loadPagination: function(bookmarks, /*opt*/page) {
        /**:GateOne.Bookmarks.loadPagination(bookmarks[, page])

        Sets up the pagination for the given array of bookmarks and returns the pagination node.

        If *page* is given the pagination will highlight the given page number and adjust the prev/next links accordingly.
        */
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            bmPaginationUL = u.createElement('ul', {'id': 'bm_pagination_ul', 'class': '✈bm_pagination ✈bm_pagination_ul ✈halfsectrans'}),
            bmContainer = u.getNode('.✈bm_container'),
            bmMax = b.getMaxBookmarks('.✈bm_container'),
            bmPages = Math.ceil(bookmarks.length/bmMax),
            prev = u.createElement('li', {'class': '✈bm_page ✈halfsectrans'}),
            next = u.createElement('li', {'class': '✈bm_page ✈halfsectrans'});
        // Add the paginator
        if (typeof(page) == 'undefined' || page == null) {
            page = 0;
        }
        if (page == 0) {
            prev.className = '✈bm_page ✈halfsectrans ✈inactive';
        } else {
            prev.onclick = function(e) {
                e.preventDefault();
                b.page -= 1;
                b.loadBookmarks();
            }
        }
        prev.innerHTML = '<a id="'+prefix+'bm_prevpage" href="javascript:void(0)">« Previous</a>';
        bmPaginationUL.appendChild(prev);
        if (bmPages > 0) {
            for (var i=0; i<=(bmPages-1); i++) {
                var li = u.createElement('li', {'class': '✈bm_page ✈halfsectrans'});
                if (i == page) {
                    li.innerHTML = '<a class="✈active" href="javascript:void(0)">'+(i+1)+'</a>';
                } else {
                    li.innerHTML = '<a href="javascript:void(0)">'+(i+1)+'</a>';
                    li.title = i+1;
                    li.onclick = function(e) {
                        e.preventDefault();
                        b.page = parseInt(this.title)-1;
                        b.loadBookmarks();
                    }
                }
                bmPaginationUL.appendChild(li);
            }
        } else {
            var li = u.createElement('li', {'class': '✈bm_page ✈halfsectrans'});
            li.innerHTML = '<a href="javascript:void(0)" class="✈active">1</a>';
            bmPaginationUL.appendChild(li);
        }
        if (page == bmPages-1 || bmPages == 0) {
            next.className = '✈bm_page ✈halfsectrans ✈inactive';
        } else {
            next.onclick = function(e) {
                e.preventDefault();
                b.page += 1;
                b.loadBookmarks();
            }
        }
        next.innerHTML = '<a id="'+prefix+'bm_nextpage" href="javascript:void(0)">Next »</a>';
        bmPaginationUL.appendChild(next);
        return bmPaginationUL;
    },
    getBookmarkObj: function(URL) {
        /**:GateOne.Bookmarks.getBookmarkObj(URL)

        Returns the bookmark object associated with the given *URL*.
        */
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.bookmarks) {
            if (b.bookmarks[i].url == URL) {
                return b.bookmarks[i];
            }
        }
    },
    addTagToBookmark: function(URL, tag) {
        /**:GateOne.Bookmarks.addTagToBookmark(URL, tag)

        Adds the given *tag* to the bookmark object associated with *URL*.
        */
        logDebug('addTagToBookmark tag: ' + tag);
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv),
            visibleBookmarks = u.toArray(goDiv.getElementsByClassName('✈bookmark'));
        for (var i in b.bookmarks) {
            if (b.bookmarks[i].url == URL) {
                b.bookmarks[i].tags.push(tag);
                // Now remove the "Untagged" tag if present
                for (var n in b.bookmarks[i].tags) {
                    if (b.bookmarks[i].tags[n] == 'Untagged') {
                        b.bookmarks[i].tags.splice(n, 1);
                    }
                }
                // Now make the change permanent
                b.storeBookmark(b.bookmarks[i]);
            }
        }
        visibleBookmarks.forEach(function(bookmark) {
            var bmURL = bookmark.getElementsByClassName('✈bm_url')[0].href,
                bmTaglist = bookmark.getElementsByClassName('✈bm_taglist')[0];
            if (URL == bmURL) {
                // This is our bookmark, append this tag to bm_tags
                var bmTag = u.createElement('li', {'class': '✈bm_tag'});
                bmTag.innerHTML = tag;
                bmTag.onclick = function(e) {
                    b.addFilterTag(b.filteredBookmarks, tag);
                };
                bmTaglist.appendChild(bmTag);
            }
            // Now remove the "Untagged" tag
            for (var i in bmTaglist.childNodes) {
                if (bmTaglist.childNodes[i].innerHTML == "Untagged") {
                    u.removeElement(bmTaglist.childNodes[i]);
                }
            }
        });
    },
    storeBookmark: function(bookmarkObj, /*opt*/callback) {
        /**:GateOne.Bookmarks.storeBookmark(bookmarkObj[, callback])

        Stores the given *bookmarkObj* in localStorage.

        if *callback* is given it will be executed after the bookmark is stored with the *bookmarkObj* as the only argument.
        */
        // Assume Bookmarks.bookmarks has already been updated and stringify them to localStorage['bookmarks']
        localStorage[GateOne.prefs.prefix+'bookmarks'] = JSON.stringify(GateOne.Bookmarks.bookmarks);
        if (callback) {
            callback(bookmarkObj);
        }
    },
    renameTag: function(oldName, newName) {
        /**:GateOne.Bookmarks.renameTag(oldName, newName)

        Renames the tag matching *oldName* to be *newName* for all bookmarks that have it.
        */
        var go = GateOne,
            prefix = go.prefs.prefix,
            u = go.Utils,
            b = go.Bookmarks,
            success = false;
        b.bookmarks.forEach(function(bookmark) {
            for (var i in bookmark.tags) {
                if (bookmark.tags[i] == oldName) {
                    bookmark.tags[i] = newName;
                    b.createOrUpdateBookmark(bookmark);
                    success = true;
                }
            }
        });
        if (success) {
            go.Visual.displayMessage(oldName + gettext(" has been renamed to: ") + newName);
            // Mark down that we've renamed this tag so we can update Evernote at the next sync
            if (localStorage[prefix+'renamedTags']) {
                var renamedTags = JSON.parse(localStorage[prefix+'renamedTags']);
                renamedTags.push(oldName + ',' + newName);
                localStorage[prefix+'renamedTags'] = JSON.stringify(renamedTags);
            } else {
                localStorage[prefix+'renamedTags'] = JSON.stringify([oldName + ',' + newName]);
            }
            b.createPanel();
        }
    },
    tagContextMenu: function(elem) {
        /**:GateOne.Bookmarks.tagContextMenu(elem)

        Called when we right-click on a tag *elem*.  Gives the user the option to rename the tag or cancel the context menu.
        */
        var go = GateOne,
            prefix = go.prefs.prefix,
            u = go.Utils,
            b = go.Bookmarks,
            existing = u.getNode('#'+prefix+'bm_context'),
            offset = u.getOffset(elem),
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            bmPanelWidth = bmPanel.offsetWidth,
            rename = u.createElement('a', {'id': 'bm_context_rename', 'class': '✈pointer'}),
            cancel = u.createElement('a', {'id': 'bm_context_cancel', 'class': '✈pointer'}),
            menu = u.createElement('div', {'id': 'bm_context', 'class': '✈quartersectrans ✈bm_context'});
        // Close any existing context menu before we do anything else
        if (existing) {
            existing.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(existing);
            }, 1000);
        }
        rename.innerHTML = "Rename: " + elem.innerHTML;
        cancel.innerHTML = "Cancel";
        menu.appendChild(rename);
        menu.appendChild(cancel);
        menu.style.opacity = 0;
        rename.onclick = function(e) {
            menu.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(menu);
            }, 1000);
            b.openRenameDialog(elem.innerHTML);
        }
        cancel.onclick = function(e) {
            menu.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(menu);
            }, 1000);
        }
        bmPanel.appendChild(menu);
        if (bmPanelWidth-offset.left < menu.offsetWidth) {
            menu.style['right'] = '0px';
        } else {
            menu.style['left'] = offset.left+'px';
        }
        menu.style['top'] = offset.top+'px';
        setTimeout(function() {
            menu.style.opacity = 1;
        }, 250);
    },
    openRenameDialog: function(tagName) {
        /**:GateOne.Bookmarks.openRenameDialog(tagName)

        Creates a dialog where the user can rename the given *tagName*.
        */
        var closeDialog,
            bmForm = u.createElement('form', {'name': prefix+'bm_dialog_form', 'id': 'bm_dialog_form', 'class': '✈sectrans ✈bm_dialog_form'}),
            buttonContainer = u.createElement('div', {'id': 'bm_buttons', 'class': '✈bm_buttons'}),
            bmSubmit = u.createElement('button', {'id': 'bm_submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            bmCancel = u.createElement('button', {'id': 'bm_cancel', 'value': gettext('Cancel'), 'class': '✈button ✈black'});
        bmForm.innerHTML = '<label for="'+prefix+'bm_newtagname">' + gettext('New Name') + '</label><input type="text" class="✈bm_newtagname" name="'+prefix+'bm_newtagname" id="'+prefix+'bm_newtagname" autofocus required>';
        bmCancel.onclick = closeDialog;
        buttonContainer.appendChild(bmSubmit);
        buttonContainer.appendChild(bmCancel);
        bmForm.appendChild(buttonContainer);
        bmSubmit.innerHTML = gettext("Save");
        bmCancel.innerHTML = gettext("Cancel");
        closeDialog = go.Visual.dialog("Rename Tag: " + tagName, bmForm, {'resizable': false, 'minimizable': false, 'class': '✈prefsdialog', 'style': {'top': '15%'}});
        setTimeout(function() {
            // Because of the way dialogs appear the autofocus attribute doesn't work...
            u.getNode('.✈bm_newtagname').focus();
        }, 500);
        bmForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            var newName = u.getNode('#'+prefix+'bm_newtagname').value;
            b.renameTag(tagName, newName);
            closeDialog();
        }
        bmCancel.onclick = function(e) {
            e.preventDefault();
            closeDialog();
        }
    },
    openExportDialog: function() {
        /**:GateOne.Bookmarks.openExportDialog()

        Creates a dialog where the user can select some options and export their bookmarks.
        */
        var go = GateOne,
            prefix = go.prefs.prefix,
            u = go.Utils,
            b = go.Bookmarks,
            bmForm = u.createElement('form', {'name': prefix+'bm_export_form', 'id': 'bm_export_form', 'class': '✈bm_export_form'}),
            buttonContainer = u.createElement('div', {'id': 'bm_buttons', 'class': '✈bm_buttons'}),
            bmExportAll = u.createElement('button', {'id': 'bm_export_all', 'type': 'submit', 'value': gettext('all'), 'class': '✈button ✈black'}),
            bmExportFiltered = u.createElement('button', {'id': 'bm_export_filtered', 'type': 'submit', 'value': gettext('all'), 'class': '✈button ✈black'}),
            bmCancel = u.createElement('button', {'id': 'bm_cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black'});
        bmForm.innerHTML = '<p>' + gettext('You can export all bookmarks or just bookmarks within the current filter/search') + '</p>';
        buttonContainer.appendChild(bmExportAll);
        buttonContainer.appendChild(bmExportFiltered);
        buttonContainer.appendChild(bmCancel);
        bmExportAll.innerHTML = gettext("All Bookmarks");
        bmExportFiltered.innerHTML = gettext("Filtered Bookmarks");
        bmCancel.innerHTML = gettext("Cancel");
        bmForm.appendChild(buttonContainer);
        var closeDialog = go.Visual.dialog(gettext('Export Bookmarks'), bmForm, {'class': '✈prefsdialog', 'style': {'top': '15%'}});
        bmCancel.onclick = closeDialog;
        bmExportAll.onclick = function(e) {
            e.preventDefault();
            b.exportBookmarks();
            closeDialog();
        }
        bmExportFiltered.onclick = function(e) {
            e.preventDefault();
            b.exportBookmarks(b.filteredBookmarks);
            closeDialog();
        }
    },
    openSearchDialog: function(URL, title) {
        /**:GateOne.Bookmarks.openSearchDialog(URL, title)

        Creates a dialog where the user can utilize a keyword search *URL*.  *title* will be used to create the dialog title like this:  "Keyword Search: *title*".
        */
        var closeDialog,
            bmForm = u.createElement('form', {'name': prefix+'bm_dialog_form', 'id': 'bm_dialog_form', 'class': '✈sectrans ✈bm_dialog_form'}),
            bmSubmit = u.createElement('button', {'id': 'bm_submit', 'type': 'submit', 'value': gettext('Submit'), 'class': '✈button ✈black'}),
            bmCancel = u.createElement('button', {'id': 'bm_cancel', 'type': 'reset', 'value': gettext('Cancel'), 'class': '✈button ✈black'});
        bmForm.innerHTML = '<label for='+prefix+'"bm_keyword_seach">' + gettext('Search') + '</label><input type="text" class="✈bm_searchstring" name="'+prefix+'bm_searchstring" id="'+prefix+'bm_searchstring" autofocus required>';
        bmForm.appendChild(bmSubmit);
        bmForm.appendChild(bmCancel);
        bmSubmit.innerHTML = gettext("Go");
        bmCancel.innerHTML = gettext("Cancel");
        closeDialog = go.Visual.dialog(gettext("Keyword Search: ") + title, bmForm, {'resizable': false, 'minimizable': false, 'class': '✈prefsdialog', 'style': {'top': '15%'}});
        setTimeout(function() {
            // Because of the way dialogs appear the autofocus attribute doesn't work...
            u.getNode('.✈bm_searchstring').focus();
        }, 500);
        bmCancel.onclick = closeDialog;
        bmForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            b.incrementVisits(URL);
            var searchString = u.getNode('#'+prefix+'bm_searchstring').value;
            window.open(URL.replace('%s', searchString));
            closeDialog();
        }
    },
    generateTip: function() {
        /**:GateOne.Bookmarks.generateTip()

        Returns a random, helpful tip for using bookmarks (as a string).
        */
        var tips = [
            gettext("You can right-click on a tag to rename it."),
            gettext("You can drag & drop a tag onto a bookmark to tag it."),
            gettext("You can create bookmarks with any kind of URL. Even email address URLs: 'mailto:user@domain.com'."),
            gettext("The 'Filtered Bookmarks' option in the export dialog is a great way to share a subset of your bookmarks with friends and coworkers."),
        ];
        return tips[Math.floor(Math.random()*tips.length)];
    },
    updateProgress: function(name, total, num, /*opt*/desc) {
        /**:GateOne.Bookmarks.updateProgress(name, total, num[, desc])

        Creates/updates a progress bar given a *name*, a *total*, and *num* representing the current state of an action.

        Optionally, a description (*desc*) may be provided that will be placed above the progress bar.
        */
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            existing = u.getNode('#' + name),
            existingBar = u.getNode('#' + name + 'bar'),
            progress = Math.round((num/total)*100),
            progressContainer = u.createElement('div', {'class': '✈bm_progresscontainer', 'id': name}),
            progressBarContainer = u.createElement('div', {'class': '✈bm_progressbarcontainer'}),
            progressBar = u.createElement('div', {'class': '✈bm_progressbar', 'id': name+'bar'});
        if (existing) {
            existingBar.style.width = progress + '%';
        } else {
            if (desc) {
                progressContainer.innerHTML = desc + "<br />";
            }
            progressBar.style.width = progress + '%';
            progressBarContainer.appendChild(progressBar);
            progressContainer.appendChild(progressBarContainer);
            u.getNode('#'+prefix+'noticecontainer').appendChild(progressContainer);
        }
        if (progress == 100) {
            existing = u.getNode('#' + name); // Have to reset this just in case
            setTimeout(function() {
                existing.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(existing);
                }, 5000);
            }, 1000);
        }
    },
    handleDragStart: function(e) {
        // Target (this) element is the source node.
        GateOne.Bookmarks.temp = this; // Temporary holding space
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    },
    handleDragOver: function(e) {
        if (e.preventDefault) {
            e.preventDefault(); // Necessary. Allows us to drop.
        }
        e.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.
        this.className = '✈bookmark ✈over';
        return false;
    },
    handleDragEnter: function(e) {
        // this / e.target is the current hover target.
        this.className = '✈bookmark ✈over';
    },
    handleDragLeave: function(e) {
        this.className = '✈bookmark ✈sectrans';
    },
    handleDrop: function(e) {
        // this / e.target is current target element.
        if (e.stopPropagation) {
            e.stopPropagation(); // stops the browser from redirecting.
        }
        // Don't do anything if dropping the same column we're dragging.
        if (GateOne.Bookmarks.temp != this) {
            // Add the tag to the bookmark it was dropped on.
            var url = this.getElementsByClassName('✈bm_url')[0].href;
            GateOne.Bookmarks.addTagToBookmark(url, e.dataTransfer.getData('text/html'));
        }
        this.className = '✈bookmark ✈halfsectrans';
        GateOne.Bookmarks.temp = "";
        return false;
    },
    handleDragEnd: function(e) {
        // this/e.target is the source node.
//         [].forEach.call(bmElement, function (bmElement) {
//             bmElement.className = '✈bookmark ✈sectrans';
//         });
    }
});

// The below portion of GateOne.Bookmarks comes from parseUri which is MIT licensed:
// http://blog.stevenlevithan.com/archives/parseuri
go.Base.update(go.Bookmarks, {
    parseUri: function(str) {
        var o = {
                strictMode: true,
                key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
                q: {
                    name: "queryKey",
                    parser: /(?:^|&)([^&=]*)=?([^&]*)/g
                },
                parser: {
                    strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
                    loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
                }
            },
            m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
            uri = {},
            i = 14;
        while (i--) uri[o.key[i]] = m[i] || "";
        uri[o.q.name] = {};
        uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
            if ($1) uri[o.q.name][$1] = $2;
        });
        return uri;
    }
});
// Our icons
go.Icons.bookmark = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="17.117" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient15649" y2="545.05" gradientUnits="userSpaceOnUse" x2="726.49" y1="545.05" x1="748.51"><stop class="✈stop1" offset="0"/><stop class="✈stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.81743869,0,0,0.81743869,-310.96927,-428.95367)"><polygon points="726.49,542.58,734.1,541.47,737.5,534.58,740.9,541.47,748.51,542.58,743,547.94,744.3,555.52,737.5,551.94,730.7,555.52,732,547.94" fill="url(#linearGradient15649)" transform="translate(-346.07093,-9.8266745)"/></g></svg>';

});
