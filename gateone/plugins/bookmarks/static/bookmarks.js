(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

"use strict";

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;
var months = {
    '0': 'JAN',
    '1': 'FEB',
    '2': 'MAR',
    '3': 'APR',
    '4': 'MAY',
    '5': 'JUN',
    '6': 'JUL',
    '7': 'AUG',
    '8': 'SEP',
    '9': 'OCT',
    '10': 'NOV',
    '11': 'DEC'
}
// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = noop;
var logError = noop;
var logWarning = noop;
var logInfo = noop;
var logDebug = noop;

// GateOne.Bookmarks (bookmark management functions)
GateOne.Base.module(GateOne, "Bookmarks", "0.9", ['Base']);
GateOne.Bookmarks.bookmarks = [];
GateOne.Bookmarks.tags = [];
GateOne.Bookmarks.sortToggle = false;
GateOne.Bookmarks.searchFilter = null;
GateOne.Bookmarks.page = 0; // Used to tracking pagination
GateOne.Bookmarks.dateTags = [];
GateOne.Bookmarks.toUpload = []; // Used for tracking what needs to be uploaded to the server
GateOne.Bookmarks.temp = ""; // Just a temporary holding space for things like drag & drop
GateOne.Base.update(GateOne.Bookmarks, {
    // TODO: Add auto-tagging bookmarks based on date of last login...  <1day, <7days, etc
    // TODO: Make it so you can have a bookmark containing multiple URLs.  So they all get opened at once when you open it.
    init: function() {
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            toolbarBookmarks = u.createElement('div', {'id': go.prefs.prefix+'icon_bookmarks', 'class': 'toolbar', 'title': "Bookmarks"}),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar');
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        if (go.Logging) {
            logFatal = go.Logging.logFatal;
            logError = go.Logging.logError;
            logWarning = go.Logging.logWarning;
            logInfo = go.Logging.logInfo;
            logDebug = go.Logging.logDebug;
        }
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
        // Setup our toolbar icons and actions
        go.Icons['bookmark'] = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" height="17.117" width="18" version="1.1" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs><linearGradient id="linearGradient15649" y2="545.05" gradientUnits="userSpaceOnUse" x2="726.49" y1="545.05" x1="748.51"><stop class="stop1" offset="0"/><stop class="stop4" offset="1"/></linearGradient></defs><metadata><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:title/></cc:Work></rdf:RDF></metadata><g transform="matrix(0.81743869,0,0,0.81743869,-310.96927,-428.95367)"><polygon points="726.49,542.58,734.1,541.47,737.5,534.58,740.9,541.47,748.51,542.58,743,547.94,744.3,555.52,737.5,551.94,730.7,555.52,732,547.94" fill="url(#linearGradient15649)" transform="translate(-346.07093,-9.8266745)"/></g></svg>';
        toolbarBookmarks.innerHTML = go.Icons['bookmark'];
        var showBookmarks = function() {
            go.Visual.togglePanel('#'+go.prefs.prefix+'panel_bookmarks');
        }
        toolbarBookmarks.onclick = showBookmarks;
        // Stick it on the end (can go wherever--unlike GateOne.Terminal's icons)
        toolbar.appendChild(toolbarBookmarks);
        // Initialize the localStorage['bookmarks'] if it doesn't exist
        if (!localStorage[prefix+'bookmarks']) {
            localStorage[prefix+'bookmarks'] = "[]"; // Init as empty JSON list
        } else {
            // Load them into GateOne.Bookmarks.bookmarks
            b.bookmarks = JSON.parse(localStorage[prefix+'bookmarks']);
        }
        // Default sort order is by visits, descending
        b.sortfunc = function(a,b) { if (a.visits > b.visits) { return -1 } else { return 1 } };
        b.createPanel();
        b.loadBookmarks(b.sort);
    },
    sortFunctions: {
        visits: function(a,b) {
            // Sorts bookmarks according to the number of visits followed by alphabetical
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
            // Sorts bookmarks by date modified followed by alphabetical
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
            var x = a.name.toLowerCase(), y = b.name.toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        }
    },
    storeBookmarks: function(bookmarks, /*opt*/recreatePanel, skipTags) {
        // Takes an array of bookmarks and stores them in both GateOne.Bookmarks.bookmarks and using GateOne.Bookmarks.Storage
        // If *recreatePanel* is true, the panel will be re-drawn after bookmarks are stored.
        // If *skipTags* is true, bookmark tags will be ignored when saving the bookmark object (necessary since Evernote will return notes with missing tags after you add new ones on the first save)
        var go = GateOne,
            b = go.Bookmarks,
            count = 0;
        bookmarks.forEach(function(bookmark) {
            count += 1;
            var conflictingBookmark = false,
                deletedBookmark = false;
            // Add a trailing slash to URLs like http://liftoffsoftware.com
            if (bookmark.url.split('/').length == 3) {
                bookmark.url += '/';
            }
            // Check if this is our "Deleted Bookmarks" bookmark
            if (bookmark.url == "web+deleted:bookmarked.us/") {
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
                    // Evernote is newer; overwrite it
                    if (skipTags) {
                        bookmark.tags = conflictingBookmark.tags; // Use the old ones
                    }
                    b.createOrUpdateBookmark(bookmark);
                } else if (parseInt(conflictingBookmark.updateSequenceNum) < parseInt(bookmark.updateSequenceNum)) {
                    // Evernote isn't newer but it has a higher USN.  So just update this bookmark's USN to match
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
//         b.flushIconQueue();
        return count;
    },
    loadBookmarks: function(/*opt*/delay) {
        // Loads the user's bookmarks
        // Optionally, a sort function may be supplied that sorts the bookmarks before placing them in the panel.
        // If *ad* is true, an advertisement will be the first item in the bookmarks list
        // If *delay* is given, that will be used to set the delay
//         console.log("loadBookmarks()");
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            goDiv = u.getNode(go.prefs.goDiv),
            prefix = go.prefs.prefix,
            bookmarks = b.bookmarks.slice(0), // Make a local copy since we're going to mess with it
            bmCount = 0, // Starts at 1 for the ad
            bmMax = b.getMaxBookmarks('#'+prefix+'bm_container'),
            bmContainer = u.getNode('#'+prefix+'bm_container'),
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            pagination = u.getNode('#'+prefix+'bm_pagination'),
            paginationUL = u.getNode('#'+prefix+'bm_pagination_ul'),
            tagCloud = u.getNode('#'+prefix+'bm_tagcloud'),
            bmSearch = u.getNode('#'+prefix+'bm_search'),
            bmTaglist = u.getNode('#'+prefix+'bm_taglist'),
            cloudTags = u.toArray(tagCloud.getElementsByClassName('bm_tag')),
            allTags = [],
            filteredBookmarks = [],
            bookmarkElements = u.toArray(goDiv.getElementsByClassName('bookmark'));
        bmPanel.style['overflow-y'] = "hidden"; // Only temporary while we're loading bookmarks
        setTimeout(function() {
            bmPanel.style['overflow-y'] = "auto"; // Set it back after everything is loaded
        }, 1000);
        if (bookmarkElements) { // Remove any existing bookmarks from the list
            bookmarkElements.forEach(function(bm) {
                bm.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(bm);
                },500);
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
                    'name': "You don't have any bookmarks yet!",
                    'tags': [],
                    'notes': 'A great way to get started is to import bookmarks or click Evernote Sync.',
                    'visits': 0,
                    'updated': new Date().getTime(),
                    'created': new Date().getTime(),
                    'updateSequenceNum': 0, // This will get set when synchronizing with Evernote
                    'images': {'favicon': "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9sHCBMpEfMvEIMAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAACEUlEQVQoz2M0Lei7f/YIA3FAS02FUcQ2iFtcDi7Ex81poq6ooyTz7cevl+8/nr354Nmb93DZry8fMXPJa7Lx8EP43pYGi2oyIpwt2NlY333+WpcQGO9pw8jAePbm/X///zMwMPz++pEJrrs00ntqUbwQLzcDA8P2Exd3nLzEwMDAwsxcGO6xuCaTmQmqEkqZaSplBjrDNW87cfHinUdwx1jqqKT7O0HYLBAqwcvuzpOXEPb956+fvn7PwMCwfM8JX2tDuGuX7T729SUDCwMDAyc7m5KkaO6ERTcfPUcOk8lrd01eu4uBgUGAh6szM0JPRe7p3RtMDAwMarISGvJSG9sLo1ytMIPSTFNpe0+pu5mulrwU1A+fv/1gYGDgYGNtSwttSApCVu1jZbC8IVtSWICBgeHT1+9QDQ+ev/728xdExYcv35A1vP30BR4+Vx88hWr49///zpOXIKLbT1xkYGDwtNDPD3FnZmI6de3eu89fGRgYHrx4c+3BU0QoNc5fb6On/uX7j4cv3rSlhUI8Y62nlj9x8e7Tl0MdzYunLPv95y8DAwMiaZhqKPnbGplpKqvJSsCd9OHLt3UHT9958nLZnuOQpMEClzt9497Nx8+rYv2E+XiE+XkYGBi+/fx1+e7jpbuP3X36Cq4MPfFBgKSwABcH2/1nryFJCDnxsWipqVy7dQdNw52Xj7Amb0VjGwCOn869WU5D8AAAAABJRU5ErkJggg=="}
            },
                introVideo = {
                'url': "http://vimeo.com/26357093",
                'name': "A Quick Screencast Overview of Bookmarked",
                'tags': ["Video", "Help"],
                'notes': 'Want some help getting started?  Our short (3 minutes) overview screencast can be illuminating.',
                'visits': 0,
                'updated': new Date().getTime(),
                'created': new Date().getTime(),
                'updateSequenceNum': 0, // This will get set when synchronizing with Evernote
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
                var tag = u.createElement('li', {'id': 'bm_autotag'});
                tag.onclick = function(e) {
                    b.removeFilterDateTag(bookmarks, this.innerHTML);
                };
                tag.innerHTML = b.dateTags[i];
                bmTaglist.appendChild(tag);
            }
        }
        if (b.tags) {
            for (var i in b.tags) { // Recreate the tag filter list
                var tag = u.createElement('li', {'id': 'bm_tag'});
                tag.innerHTML = b.tags[i];
                tag.onclick = function(e) {
                    b.removeFilterTag(bookmarks, this.innerHTML);
                };
                bmTaglist.appendChild(tag);
            }
        }
        if (b.tags) {
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
        if (b.dateTags) {
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
//                         console.log('bookmark missing images: ' + bookmark);
                    }
                    b.createBookmark(bmContainer, bookmark, delay);
//                     delay += 25;
                }
                bmCount += 1;
            });
        } else {
            bookmarks.forEach(function(bookmark) {
                if (bmCount < bmMax) {
                    b.createBookmark(bmContainer, bookmark, delay);
//                     delay += 25;
                }
                bmCount += 1;
            });
        }
        // Add the pagination query string to the location
        if (window.history.pushState) {
            var query = window.location.search.substring(1),
                newQuery = null,
                match = false,
                queries = query.split('&');
//             console.log('query: ' + query + ', queries: ' + queries);
            if (b.page > 0) {
                if (query.length) {
                    if (query.indexOf('page=') != -1) {
                        // 'page=' is already present
                        for (var i in queries) {
                            if (queries[i].indexOf('page=') != -1) { // This is the page string
                                queries[i] = 'page=' + (b.page+1);
                                match = true;
                            }
                        }
                    } else {
                        queries.push('page=' + (b.page+1));
                    }
                    newQuery = queries.join('&');
                } else {
                    newQuery = 'page=' + (b.page+1);
                }
//                 console.log('newQuery: ' + newQuery);
                window.history.pushState("", "Bookmarked. Page " + b.page, "/?" + newQuery);
            } else {
                if (query.indexOf('page=') != -1) {
                    // Gotta remove the 'page=' part
                    for (var i in queries) {
                        if (queries[i].indexOf('page=') != -1) { // This is the page string
                            delete queries[i];
                        }
                    }
                    if (query.length) {
                        newQuery = queries.join('&');
                        if (newQuery.length) {
                            window.history.pushState("", "Default", "/?" + queries.join('&'));
                        } else {
                            window.history.pushState("", "Default", "/");
                        }
                    }
                }
            }
        }
        var bmPaginationUL = b.loadPagination(bookmarks, b.page);
        pagination.appendChild(bmPaginationUL);
        // Hide tags that aren't in the bookmark array
        delay = 100;
        cloudTags.forEach(function hideTag(tagNode) {
            if (allTags.indexOf(tagNode.innerHTML) == -1) { // Tag isn't in the new list of bookmarks
                // Make it appear inactive
                setTimeout(function() {
                    tagNode.className = 'bm_tag sectrans inactive';
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
                            tagNode.className = 'bm_tag sectrans untagged';
                        } else if (tagNode.innerHTML == "Searches") {
                            tagNode.className = 'bm_tag sectrans searches';
                        } else {
                            tagNode.className = 'bm_tag sectrans'; // So we don't have slow mouseovers
                        }
                    }, 500);
                }, delay);
            }
        });
    },
// This is the old loadBookmarks (need it for reference until I'm done porting everything from http://bookmarked.us/)
//     loadBookmarks: function(/*opt*/sortfunc) {
//         // Loads the user's bookmarks from localStorage
//         // bookmark format:
//         // [{name: 'Some Host', url: 'ssh://user@somehost:22', tags: ['New York, Linux'], notes: 'Lots of stuff on this host.'}, <another>, <another>, ...]
//         // Optionally, a sort function may be supplied that sorts the bookmarks before placing them in the panel.
//         logDebug('loadBookmarks()');
//         var go = GateOne,
//             prefix = go.prefs.prefix,
//             u = go.Utils,
//             bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
//             bookmarks = localStorage['bookmarks'],
//             bmContainer = u.createElement('div', {'id': prefix+'bm_container', 'class': 'sectrans'}),
//             alltags = go.Bookmarks.allTags(),
//             bmTagCloud = u.createElement('ul', {'id': prefix+'bm_tagcloud', 'class': 'sectrans'}),
//             bmTagCloudUL = u.createElement('ul', {'id': prefix+'bm_tagcloud_ul'}),
//             bmTagsHeader = u.createElement('h3', {'class': 'sectrans'}),
//             delay = 1000,
//             bookmarkElements = u.toArray(u.getNode(go.prefs.goDiv).getElementsByClassName('bookmark'));
//         if (bookmarks) {
//             bookmarks = go.Bookmarks.bookmarks = JSON.parse(bookmarks);
//         } else {
//             return;
//         }
//         if (bookmarkElements) { // Remove any existing bookmarks from the list
//             bookmarkElements.forEach(function(bm) {
//                 bm.style.opacity = 0;
//                 setTimeout(function() {
//                     u.removeElement(bm);
//                 },1000);
//             });
//         }
//         // Remove the tag cloud before we add a new one
//         var tagCloud = u.getNode('#'+prefix+'bm_tagcloud');
//         if (tagCloud) {
//             tagCloud.style.opacity = 0;
//             setTimeout(function() {
//                 u.removeElement(tagCloud);
//             },1000);
//         };
//         // Apply the sort function
//         if (sortfunc) {
//             bookmarks.sort(sortfunc);
//         } else {
//             bookmarks.sort(go.Bookmarks.sortfunc);
//         }
//         bookmarks.forEach(function(bookmark) {
//             go.Bookmarks.createBookmark(bmContainer, bookmark, delay);
//             delay += 50;
//         });
//         bmPanel.appendChild(bmContainer);
//         // Add the tag cloud
//         bmTagsHeader.innerHTML = 'Tags';
//         go.Visual.applyTransform(bmTagsHeader, 'translate(200%, 0)');
//         bmTagCloud.appendChild(bmTagsHeader);
//         bmTagCloud.appendChild(bmTagCloudUL);
//         delay = 1250;
//         setTimeout(function() {
//             go.Visual.applyTransform(bmTagsHeader, 'translate(0, 0)');
//         }, 1000);
//         alltags.forEach(function(tag) {
//             var li = u.createElement('li', {'class': 'bm_tag sectrans'});
//             li.innerHTML = tag;
//             go.Visual.applyTransform(li, 'translate(1000%, 0)');
//             li.onclick = function(e) {
//                 go.Bookmarks.addFilterTag(tag);
//             };
//             bmTagCloudUL.appendChild(li);
//             setTimeout(function() {
//                 go.Visual.applyTransform(li, 'translate(0, 0)');
//             }, delay);
//             delay += 50;
//         });
//         bmPanel.appendChild(bmTagCloud);
//     },
    createBookmark: function(bmContainer, bookmark, delay, /*opt*/ad) {
        // Creates a new bookmark element and places it in  in bmContainer.  Also returns the bookmark element.
        // *bmContainer* is the node we're going to be placing bookmarks
        // *bookmark* is expected to be a bookmark object
        // *delay* is the amount of milliseconds to wait before translating the bookmark into view
        // Optional: if *ad* is true, will not bother adding tags or edit/delete/share links
//         console.log('createBookmark() bookmark: ' + bookmark.url);
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            twoSec = null,
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            bmStats = u.createElement('div', {'class': 'bm_stats superfasttrans', 'style': {'opacity': 0}}),
            dateObj = new Date(parseInt(bookmark.created)),
            bmElement = u.createElement('div', {'class': 'bookmark halfsectrans', 'name': 'bookmark'}),
            bmLinkFloat = u.createElement('div', {'class': 'linkfloat'}), // So the user can click anywhere on a bookmark to open it
            bmContent = u.createElement('span', {'class': 'bm_content'}),
            bmFavicon = u.createElement('span', {'class': 'bm_favicon'}),
            bmLink = u.createElement('a', {'href': bookmark.url, 'class': 'bm_url', 'tabindex': 2}),
            bmEdit = u.createElement('a', {'class': 'bm_edit'}),
            bmDelete = u.createElement('a', {'class': 'bm_delete'}),
            bmShare = u.createElement('a', {'class': 'bm_share'}),
            bmControls = u.createElement('span', {'class': 'bm_controls'}),
            bmDesc = u.createElement('span', {'class': 'bm_desc'}),
            bmVisited = u.createElement('span', {'class': 'bm_visited', 'title': 'Number of visits'}),
            bmTaglist = u.createElement('ul', {'class': 'bm_taglist'});
//         if (bmElement.addEventListener) {
            bmElement.addEventListener('dragstart', u.handleDragStart, false);
            bmElement.addEventListener('dragenter', u.handleDragEnter, false);
            bmElement.addEventListener('dragover', u.handleDragOver, false);
            bmElement.addEventListener('dragleave', u.handleDragLeave, false);
            bmElement.addEventListener('drop', u.handleDrop, false);
            bmElement.addEventListener('dragend', u.handleDragEnd, false);
//         } else { // I hate IE!
//             bmElement.attachEvent('dragstart', u.handleDragStart);
//             bmElement.attachEvent('dragenter', u.handleDragEnter);
//             bmElement.attachEvent('dragover', u.handleDragOver);
//             bmElement.attachEvent('dragleave', u.handleDragLeave);
//             bmElement.attachEvent('drop', u.handleDrop);
//             bmElement.attachEvent('dragend', u.handleDragEnd);
//         }
        bmEdit.innerHTML = 'Edit |';
        bmDelete.innerHTML = 'Delete |';
        bmShare.innerHTML = 'Share';
        bmEdit.onclick = function(e) {
            e.preventDefault();
            b.editBookmark(this);
        }
        bmDelete.onclick = function(e) {
            e.preventDefault();
            b.deleteBookmark(this);
        }
        bmShare.onclick = function(e) {
            e.preventDefault();
            b.shareBookmark(this);
        }
        bmControls.appendChild(bmEdit);
        bmControls.appendChild(bmDelete);
        bmControls.appendChild(bmShare);
        bmStats.innerHTML = months[dateObj.getMonth()] + '<br />' + dateObj.getDay() + '<br />' + dateObj.getFullYear();
        bmElement.title = bookmark.url;
        if (bookmark.url.indexOf('%s') != -1) {
            // This is a keyword search URL.  Mark it as such.
            bmLink.innerHTML = '<span class="search">Search:</span> ' + bookmark.name;
        } else {
            bmLink.innerHTML = bookmark.name;
        }
        bmLink.onclick = function(e) {
            b.openBookmark(this.href);
        };
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
            var bmDateTag = u.createElement('li', {'class': 'bm_autotag'}),
                dateTag = b.getDateTag(dateObj);
            bmVisited.innerHTML = bookmark.visits;
            bmElement.appendChild(bmVisited);
            bmElement.appendChild(bmControls);
            bookmark.tags.forEach(function(tag) {
                var bmTag = u.createElement('li', {'class': 'bm_tag'});
                bmTag.innerHTML = tag;
                bmTag.onclick = function(e) {
                    b.addFilterTag(b.filteredBookmarks, tag);
                };
                bmTaglist.appendChild(bmTag);
            });
            bmDateTag.innerHTML = dateTag;
            bmDateTag.onclick = function(e) {
                b.addFilterDateTag(b.filteredBookmarks, dateTag);
            };
            bmTaglist.appendChild(bmDateTag);
            bmElement.appendChild(bmTaglist);
        }
        bmElement.appendChild(bmLinkFloat);
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
                u.applyTransform(bmElement, '');
            } catch(e) {
                u.noop(); // Bookmark element was removed already.  No biggie.
            }
        }, delay);
        delay += 50;
        return bmElement;
    },
//     createBookmark: function(bmContainer, bookmark, delay) {
//         // Creates a new bookmark element to be placed in bm_container
//         // *bmContainer* is the node we're going to be placing bookmarks
//         // *bookmark* is expected to be a bookmark object taken from the list inside localStorage['bookmarks']
//         // *delay* is the amount of milliseconds to wait before translating the bookmark into view
//         var go = GateOne,
//             prefix = go.prefs.prefix,
//             u = go.Utils,
//             bmElement = u.createElement('div', {'class': 'bookmark sectrans'}),
//             bmURI = u.createElement('div', {'class': 'bm_uri'}),
//             bmLink = u.createElement('a', {'class': 'bm_url'}),
//             bmEdit = u.createElement('a', {'id': prefix+'bm_edit'}),
//             bmControls = u.createElement('span', {'class': 'bm_controls'}),
//             bmDesc = u.createElement('span', {'class': 'bm_desc'}),
//             bmVisited = u.createElement('div', {'class': 'bm_visited'}),
//             bmTaglist = u.createElement('ul', {'class': 'bm_taglist'});
//         bmControls.innerHTML = '<a href="#" id="' + prefix + 'bm_edit" onclick="GateOne.Bookmarks.editBookmark(this);">Edit</a>|<a href="#" id="' + prefix + 'bm_delete" onclick="GateOne.Bookmarks.deleteBookmark(this);">Delete</a>';
//         bmLink.href = bookmark.url;
//         bmLink.innerHTML = bookmark.name;
//         bmLink.onclick = function(e) {
//             e.preventDefault();
//             go.Bookmarks.openBookmark(this.href);
//         };
//         bmURI.appendChild(bmLink);
//         bmURI.appendChild(bmControls);
//         bmElement.appendChild(bmURI);
//         bmVisited.innerHTML = bookmark.visits;
//         bmElement.appendChild(bmVisited);
//         bmDesc.innerHTML = bookmark.notes + '<br /><br />';
//         bmElement.appendChild(bmDesc);
//         bookmark.tags.forEach(function(tag) {
//             var bmTag = u.createElement('li', {'class': 'bm_tag'});
//             bmTag.innerHTML = tag;
//             bmTag.onclick = function(e) {
//                 go.Bookmarks.addFilterTag(tag);
//             };
//             bmTaglist.appendChild(bmTag);
//         });
//         bmElement.appendChild(bmTaglist);
//         go.Visual.applyTransform(bmElement, 'translate(-200%, 0)');
//         bmContainer.appendChild(bmElement);
//         setTimeout(function() {
//             go.Visual.applyTransform(bmElement, 'translate(0, 0)');
//         }, delay);
//         delay += 50;
//     },
    createSortOpts: function() {
        // Returns a div containing bm_display_opts representing the user's current settings.
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            bmSortOpts = u.createElement('span', {'id': prefix+'bm_sort_options'}),
            bmSortAlpha = u.createElement('a', {'id': prefix+'bm_sort_alpha'}),
            bmSortDate = u.createElement('a', {'id': prefix+'bm_sort_date'}),
            bmSortVisits = u.createElement('a', {'id': prefix+'bm_sort_visits'}),
            bmSortDirection = u.createElement('div', {'id': prefix+'bm_sort_direction'});
        bmSortAlpha.innerHTML = 'Alphabetical ';
        bmSortDate.innerHTML = 'Date ';
        bmSortVisits.innerHTML = 'Visits ';
        bmSortDirection.innerHTML = '▼';
        bmSortOpts.innerHTML = '<b>Sort:</b> ';
        if (localStorage[prefix+'sort'] == 'alpha') {
            bmSortAlpha.className = 'active';
        } else if (localStorage[prefix+'sort'] == 'date') {
            bmSortDate.className = 'active';
        } else if (localStorage[prefix+'sort'] == 'visits') {
            bmSortVisits.className = 'active';
        }
        bmSortAlpha.onclick = function(e) {
            if (localStorage[prefix+'sort'] != 'alpha') {
                b.sortfunc = b.sortFunctions.alphabetical;
                u.getNode('#'+prefix+'bm_sort_' + localStorage[prefix+'sort']).className = null;
                u.getNode('#'+prefix+'bm_sort_alpha').className = 'active';
                b.loadBookmarks();
                localStorage[prefix+'sort'] = 'alpha';
            }
        }
        bmSortDate.onclick = function(e) {
            if (localStorage[prefix+'sort'] != 'date') {
                b.sortfunc = b.sortFunctions.created;
                u.getNode('#'+prefix+'bm_sort_' + localStorage[prefix+'sort']).className = null;
                u.getNode('#'+prefix+'bm_sort_date').className = 'active';
                b.loadBookmarks();
                localStorage[prefix+'sort'] = 'date';
            }
        }
        bmSortVisits.onclick = function(e) {
            if (localStorage[prefix+'sort'] != 'visits') {
                b.sortfunc = b.sortFunctions.visits;
                u.getNode('#'+prefix+'bm_sort_' + localStorage[prefix+'sort']).className = null;
                u.getNode('#'+prefix+'bm_sort_visits').className = 'active';
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
        // Creates the bookmarks panel.  If *ad* is true, shows an ad as the first bookmark
        // If the bookmarks panel already exists, re-create the bookmarks container and reset pagination
        // If *embedded* is true then we'll just load the header (without search).
//         console.log('createPanel()');
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            delay = 1000, // Pretty much everything has the 'sectrans' class for 1-second transition effects
            existingPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            bmPanel = u.createElement('div', {'id': prefix+'panel_bookmarks', 'class': 'panel sectrans'}),
            bmHeader = u.createElement('div', {'id': prefix+'bm_header', 'class': 'sectrans'}),
            bmContainer = u.createElement('div', {'id': prefix+'bm_container', 'class': 'sectrans'}),
            bmPagination = u.createElement('div', {'id': prefix+'bm_pagination', 'class': 'sectrans'}),
            bmTagCloud = u.createElement('div', {'id': prefix+'bm_tagcloud', 'class': 'sectrans'}),
            bmTags = u.createElement('div', {'id': prefix+'bm_tags', 'class': 'sectrans'}),
            bmNew = u.createElement('div', {'id': prefix+'bm_new', 'class': 'sectransform'}),
            bmHRFix = u.createElement('hr', {'style': {'opacity': 0, 'margin-bottom': 0}}),
            bmDisplayOpts = u.createElement('div', {'id': prefix+'bm_display_opts', 'class': 'sectransform'}),
            bmSortOpts = b.createSortOpts(),
            bmOptions = u.createElement('div', {'id': prefix+'bm_options'}),
            bmNuke = u.createElement('a', {'id': prefix+'bm_nuke', 'title': 'Erase all bookmarks (locally) and de-authorize Evernote Sync.'}),
            bmExport = u.createElement('a', {'id': prefix+'bm_export', 'title': 'Save your bookmarks to a file'}),
            bmImport = u.createElement('a', {'id': prefix+'bm_import', 'title': 'Import bookmarks from another application'}),
            bmENSync = u.createElement('a', {'id': prefix+'en_sync', 'title': 'Synchronize your bookmarks with Evernote'}),
            bmH2 = u.createElement('h2'),
            bmHeaderImage = u.createElement('span', {'id': prefix+'bm_header_star'}),
            bmTagCloudUL = u.createElement('ul', {'id': prefix+'bm_tagcloud_ul'}),
            bmTagCloudTip = u.createElement('span', {'id': prefix+'bm_tagcloud_tip', 'class': 'sectrans'}),
            bmTagsHeader = u.createElement('h3', {'class': 'sectrans'}),
            bmSearch = u.createElement('input', {'id': prefix+'bm_search', 'name': 'search', 'type': 'search', 'tabindex': 1, 'placeholder': 'Search Bookmarks'}),
            allTags = b.getTags(b.bookmarks),
            toggleSort = u.partial(b.toggleSortOrder, b.bookmarks);
        bmH2.innerHTML = 'Bookmarks';
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
                    // TODO: Make this remove the search string from the URL
                }
            }
        }
        bmHeader.appendChild(bmH2);
        bmTags.innerHTML = '<span id="'+prefix+'bm_taglist_label">Tag Filter:</span> <ul id="'+prefix+'bm_taglist"></ul> ';
        bmENSync.innerHTML = 'Sync Bookmarks | ';
        bmImport.innerHTML = 'Import | ';
        bmExport.innerHTML = 'Export | ';
        bmNuke.innerHTML = 'Nuke | ';
        bmImport.onclick = function(e) {
            b.importForm();
        }
        bmExport.onclick = function(e) {
            b.openExportDialog();
        }
        bmNuke.onclick = function(e) {
            b.openNukeDialog();
        }
        bmENSync.onclick = function(e) {
            var USN = localStorage[prefix+'USN'] || 0;
            this.innerHTML = "Synchronizing... | ";
            if (!b.bookmarks.length) {
                u.displayMessage("NOTE: Since this is your first sync it can take a few seconds.  Please be patient.");
            } else {
                u.displayMessage("Please wait while we synchronize your bookmarks...");
            }
            b.syncTimer = setInterval(function() {
                u.displayMessage("Please wait while we synchronize your bookmarks...");
            }, 6000);
            u.xhrGet('/evernote?sync=True&updateSequenceNum='+USN, b.syncEvernote);
        }
        bmOptions.appendChild(bmENSync);
        bmOptions.appendChild(bmImport);
        bmOptions.appendChild(bmExport);
        bmOptions.appendChild(bmNuke);
        bmTags.appendChild(bmOptions);
        bmNew.innerHTML = '+ New';
        bmNew.onclick = b.bookmarkForm;
//         bmDisplayOpts.innerHTML = '<span id="bm_sort_options"><b>Sort:</b> <a id="bm_sort_alpha">Alphabetical</a>, <a id="bm_sort_date" class="active">Date</a>, <a id="bm_sort_visits">Visits</a></span> <span id="bm_sort_direction">▼</span>';
        bmDisplayOpts.appendChild(bmSortOpts);
        bmHeader.appendChild(bmTags);
        bmHeader.appendChild(bmHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
//         bmTagsHeader.innerHTML = '<a id="bm_user_tags" href="#">Tags</a> | <a id="bm_auto_tags" class="inactive" href="#">Autotags</a>';
        bmTagsHeader.innerHTML = '<a id="bm_user_tags" href="#">Tags</a>';
        go.Visual.applyTransform(bmTagsHeader, 'translate(300%, 0)');
        go.Visual.applyTransform(bmPagination, 'translate(300%, 0)');
        bmTagCloud.appendChild(bmTagsHeader);
        bmTagCloud.appendChild(bmTagCloudUL);
        bmTagCloudTip.style.opacity = 0;
        bmTagCloudTip.innerHTML = "<br><b>Tip:</b> " + b.generateTip();
        bmTagCloud.appendChild(bmTagCloudTip);
        if (existingPanel) {
            // Remove everything first
            while (existingPanel.childNodes.length >= 1 ) {
                existingPanel.removeChild(existingPanel.firstChild);
            }
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
            setTimeout(function() { // Fade them in and load the bookmarks
                go.Visual.applyTransform(bmTagsHeader, '');
                go.Visual.applyTransform(bmPagination, '');
                b.loadBookmarks(1);
            }, 800); // Needs to be just a bit longer than the previous setTimeout
            setTimeout(function() { // This one looks nicer if it comes last
                bmTagCloudTip.style.opacity = 1;
            }, 3000);
            setTimeout(function() { // Make it go away after a while
                bmTagCloudTip.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(bmTagCloudTip);
                }, 1000);
            }, 30000);
            allTags.forEach(function(tag) {
                var li = u.createElement('li', {'class': 'bm_tag sectrans', 'title': 'Click to filter or drop on a bookmark to tag it.', 'draggable': true});
                li.innerHTML = tag;
                li.addEventListener('dragstart', u.handleDragStart, false);
                go.Visual.applyTransform(li, 'translateX(700px)');
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
                    li.className = 'bm_tag sectrans untagged';
                }
                setTimeout(function unTrans() {
                    go.Visual.applyTransform(li, '');
                }, delay);
                delay += 10;
            });
            if (existingPanel) {
                existingPanel.appendChild(bmTagCloud);
            } else {
                bmPanel.appendChild(bmTagCloud);
            }
        }
        // Commented out until we can figure out how to deal with cell phone browsers (when they zoom or change orientation it kicks off onresize event)
//         window.onresize = function(e) {
//             Bookmarks.loadBookmarks();
//         }
    },
//     createPanel: function() {
//         // Creates the bookmarks panel and appends it to #gateone
//         // If the bookmarks panel already exists, leave it but recreate the contents
//         var go = GateOne,
//             u = go.Utils,
//             prefix = go.prefs.prefix,
//             existingPanel = u.getNode('#'+prefix+'panel_bookmarks'),
//             bmPanel = u.createElement('div', {'id': prefix+'panel_bookmarks', 'class': 'panel sectrans'}),
//             bmHeader = u.createElement('div', {'id': prefix+'bm_header', 'class': 'sectrans'}),
//             bmTags = u.createElement('div', {'id': prefix+'bm_tags', 'class': 'sectrans'}),
//             bmNew = u.createElement('div', {'id': prefix+'bm_new'}),
//             bmHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
//             bmDisplayOpts = u.createElement('div', {'id': prefix+'bm_display_opts'});
//         bmHeader.innerHTML = '<h2>Bookmarks <input type="text" name="search" value="Search" id="'+prefix+'bm_search" /></h2>';
//         bmTags.innerHTML = '<b>Tag Filter:</b> <ul id="'+prefix+'bm_taglist"></ul>';
//         bmNew.innerHTML = 'New ★';
//         bmNew.onclick = go.Bookmarks.bookmarkForm;
//         bmDisplayOpts.innerHTML = '<b>Sort: </b><span id="'+prefix+'bm_sort_direction">▼</span>';
//         bmHeader.appendChild(bmTags);
//         bmHeader.appendChild(bmNew);
//         bmHeader.appendChild(bmHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
//         bmHeader.appendChild(bmDisplayOpts);
//         if (existingPanel) {
//             // Remove everything first
//             while (existingPanel.childNodes.length >= 1 ) {
//                 existingPanel.removeChild(existingPanel.firstChild);
//             }
//             // Fade it in nicely
//             bmHeader.style.opacity = 0;
//             existingPanel.appendChild(bmHeader);
//             setTimeout(function() {
//                 bmHeader.style.opacity = 1;
//             }, 1000)
//         } else {
//             bmPanel.appendChild(bmHeader);
//             u.getNode(go.prefs.goDiv).appendChild(bmPanel);
//         }
//
//         u.getNode('#'+go.prefs.prefix+'bm_sort_direction').onclick = go.Bookmarks.toggleSortOrder;
//     },
    openBookmark: function(URL) {
        // If the current terminal is in a disconnected state, connects to *URL* in the current terminal.
        // If the current terminal is already connected, opens a new terminal and uses that.
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            term = localStorage['selectedTerminal'],
            termTitle = u.getNode('#'+prefix+'term'+term).title;
        if (URL.slice(0,4) == "http") {
            // This is a regular URL, open in a new window
            b.incrementVisits(URL);
            go.Visual.togglePanel('#'+prefix+'panel_bookmarks');
            window.open(URL);
            return; // All done
        }
        // Proceed as if this is an SSH URL...
        if (termTitle == 'Gate One') {
            // Foreground terminal has yet to be connected, use it
            go.Input.queue(URL+'\n');
            go.Net.sendChars();
        } else {
            go.Terminal.newTerminal();
            setTimeout(function() {
                go.Input.queue(URL+'\n');
                go.Net.sendChars();
            }, 250);
        }
        go.Visual.togglePanel('#'+prefix+'panel_bookmarks');
        b.incrementVisits(URL);
    },
    toggleSortOrder: function(/*opt*/bookmarks) {
        // Reverses the order of the bookmarks list
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            bmSearch = u.getNode('#'+prefix+'bm_search'),
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
        // Filters bookmarks to those matching *str*
        // Set the global search filter so we can use it within other functions
        var go = GateOne,
            b = go.Bookmarks;
        b.searchFilter = str;
        if (window.history.pushState) {
            window.history.pushState("", "Bookmarked. Search: " + str, "/?filterstring=" + str);
        }
        b.loadBookmarks();
    },
    addFilterTag: function(bookmarks, tag) {
        // Adds the given tag to the filter list
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.tags) {
            if (b.tags[i] == tag) {
                // Tag already exists, ignore.
                return;
            }
        }
        b.tags.push(tag);
        if (window.history.pushState) {
            var tagString = b.tags.join(',');
            window.history.pushState("", "Bookmarked. Tag Filter: " + tagString, "/?filtertags=" + tagString);
        }
        // Reset the pagination since our bookmark list will change
        b.page = 0;
        b.loadBookmarks();
    },
    removeFilterTag: function(bookmarks, tag) {
        // Removes the given tag from the filter list
//         console.log('removeFilterTag tag: ' + tag);
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.tags) {
            if (b.tags[i] == tag) {
                b.tags.splice(i, 1);
            }
        }
        if (window.history.pushState) {
            if (b.tags.length) {
                var tagString = b.tags.join(',');
                window.history.pushState("", "Bookmarked. Tag Filter: " + tagString, "/?filtertags=" + tagString);
            } else {
                window.history.pushState("", "Default", "/"); // Set it back to the default URL
            }
        }
        // Reset the pagination since our bookmark list will change
        b.page = 0;
        b.loadBookmarks();
    },
    addFilterDateTag: function(bookmarks, tag) {
        // Adds the given dateTag to the filter list
//         console.log('addFilterDateTag: ' + tag);
        var go = GateOne,
            b = go.Bookmarks;
        for (var i in b.dateTags) {
            if (b.dateTags[i] == tag) {
                // Tag already exists, ignore.
                return;
            }
        }
        b.dateTags.push(tag);
        // Reset the pagination since our bookmark list will change
        b.page = 0;
        b.loadBookmarks();
    },
    removeFilterDateTag: function(bookmarks, tag) {
        // Removes the given dateTag from the filter list
//         console.log("removeFilterDateTag: " + tag);
        var go = GateOne,
            b = go.Bookmarks;
        // Change the &lt; and &gt; back into < and >
        tag = tag.replace('&lt;', '<');
        tag = tag.replace('&gt;', '>');
        for (var i in b.dateTags) {
            if (b.dateTags[i] == tag) {
                b.dateTags.splice(i, 1);
            }
        }
        b.loadBookmarks();
    },
    getTags: function(/*opt*/bookmarks) {
        // Returns an array of all the tags in Bookmarks.bookmarks or *bookmarks* if given.
        // NOTE: Ordered alphabetically
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
    getDateTag: function(dateObj) {
        // Given a Date() object, returns a string such as "<7 days".  Suitable for use as an autotag.
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
//     toggleSortOrder: function() {
//         // Reverses the order of the bookmarks list
//         var go = GateOne,
//             sortDirection = go.Utils.getNode('#'+go.prefs.prefix+'bm_sort_direction');
//         if (go.Bookmarks.sortToggle) {
//             go.Bookmarks.sortToggle = false;
//             go.Bookmarks.sortfunc = function(a,b) { if (a.visits > b.visits) { return -1 } else { return 1 } };
//             go.Bookmarks.loadBookmarks();
//             go.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
//             go.Visual.applyTransform(sortDirection, 'rotate(0deg)');
//         } else {
//             go.Bookmarks.sortToggle = true;
//             go.Bookmarks.sortfunc = function(a,b) { if (a.visits < b.visits) { return -1 } else { return 1 } };
//             go.Bookmarks.loadBookmarks();
//             go.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
//             go.Visual.applyTransform(sortDirection, 'rotate(180deg)');
//         }
//     },
//     filterBookmarksByTags: function(tags) {
//         // Filters the bookmarks list using the given tags and draws the breadcrumbs at the top of the panel.
//         // *tags* should be an array of strings:  ['Linux', 'New York']
//         var go = GateOne,
//             u = go.Utils,
//             goDiv = u.getNode(go.prefs.goDiv),
//             bmTaglist = u.getNode('#'+go.prefs.prefix+'bm_taglist'),
//             bookmarks = u.toArray(goDiv.getElementsByClassName('bookmark')),
//             bmTags = goDiv.getElementsByClassName('bm_tag');
//         bmTaglist.innerHTML = ""; // Clear out the tag list
//         for (var i in tags) { // Recreate the tag list
//             tag = u.createElement('li', {'id': go.prefs.prefix+'bm_tag'});
//             tag.innerHTML = tags[i];
//             tag.onclick = function(e) {
//                 go.Bookmarks.removeFilterTag(this.innerHTML);
//             };
//             bmTaglist.appendChild(tag);
//         }
//         var getTags = function(bookmark) {
//             // Returns an array of tags associated with the given bookmark element.
//             var bmTags = bookmark.getElementsByClassName('bm_tag'),
//                 outArray = [];
//             bmTags = u.toArray(bmTags);
//             bmTags.forEach(function(liTag) {
//                 outArray.push(liTag.innerHTML);
//             });
//             return outArray;
//         }
//         // Remove bookmarks that don't match the user's selected tags:
//         bookmarks.forEach(function(bookmark) {
//             var bookmarkTags = getTags(bookmark),
//                 allTagsPresent = false,
//                 tagCount = 0;
//             bookmarkTags.forEach(function(tag) {
//                 if (tags.indexOf(tag) != -1) { // tag not in tags
//                     tagCount += 1;
//                 }
//             });
//             if (tagCount != tags.length) {
//                 // Remove the bookmark from the list
//                 go.Visual.applyTransform(bookmark, 'translate(-200%, 0)');
//                 setTimeout(function() {
//                     u.removeElement(bookmark);
//                 }, 1000);
//             }
//         });
//     },
//     addFilterTag: function(tag) {
//         // Adds the given tag to the filter list
//         for (var i in GateOne.Bookmarks.tags) {
//             if (GateOne.Bookmarks.tags[i] == tag) {
//                 // Tag already exists, ignore.
//                 return;
//             }
//         }
//         GateOne.Bookmarks.tags.push(tag);
//         GateOne.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
//     },
//     removeFilterTag: function(tag) {
//         // Removes the given tag from the filter list
//         for (var i in GateOne.Bookmarks.tags) {
//             if (GateOne.Bookmarks.tags[i] == tag) {
//                 GateOne.Bookmarks.tags.splice(i, 1);
//             }
//         }
//         GateOne.Bookmarks.loadBookmarks(GateOne.Bookmarks.sortfunc);
//         GateOne.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
//     },
    allTags: function() {
        // Returns an array of all the tags in localStorage['bookmarks']
        // ordered alphabetically
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
    bookmarkForm: function(/*Opt*/URL) {
        // Displays the form where a user can create or edit a bookmark.
        // If *URL* is given, pre-fill the form with the associated bookmark for editing.
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            prefix = go.prefs.prefix,
            goDiv = u.getNode(go.prefs.goDiv),
            bmTagCloud = u.createElement('ul', {'id': prefix+'bm_tagcloud', 'class': 'sectrans'}),
            bmTagCloudUL = u.createElement('ul', {'id': prefix+'bm_tagcloud_ul'}),
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            bmPanelChildren = bmPanel.childNodes,
            bmForm = u.createElement('form', {'name': prefix+'bm_new_form', 'id': prefix+'bm_new_form', 'class': 'sectrans'}),
            bmSubmit = u.createElement('button', {'id': 'bm_submit', 'type': 'submit', 'value': 'Submit', 'class': 'button black'}),
            bmCancel = u.createElement('button', {'id': 'bm_cancel', 'type': 'reset', 'value': 'Cancel', 'class': 'button black'});
        bmSubmit.innerHTML = "Submit";
        bmCancel.innerHTML = "Cancel";
        if (typeof(URL) == "string") {
            // Editing an existing bookmark
            var bookmarks = JSON.parse(localStorage[prefix+'bookmarks']),
                count = 0,
                index = null;
            bookmarks.forEach(function(bookmark) {
                if (bookmark.url == URL) {
                    index = count;
                }
                count += 1;
            });
            var bmName = bookmarks[index].name,
                bmTags = bookmarks[index].tags,
                bmNotes = bookmarks[index].notes;
            bmForm.innerHTML = '<h2>Edit Bookmark</h2><label for="'+prefix+'bm_newurl">URL</label><input type="text" name="'+prefix+'bm_newurl" id="'+prefix+'bm_newurl" class="input-text-plain" value="' + URL + '"><label for="'+prefix+'bm_new_name">Name</label><input type="text" name="'+prefix+'bm_new_name" id="'+prefix+'bm_new_name" class="input-text-plain" value="' + bmName + '"><label for="'+prefix+'bm_newurl_tags">Tags</label><input type="text" name="'+prefix+'bm_newurl_tags" id="'+prefix+'bm_newurl_tags" class="input-text-plain" value="' + bmTags + '"><label for="'+prefix+'bm_new_notes">Notes</label><textarea id="'+prefix+'bm_new_notes" class="input-text-plain medium">' + bmNotes + '</textarea>';
        } else {
            // Creating a new bookmark (blank form)
            bmForm.innerHTML = '<h2>New Bookmark</h2><label for="'+prefix+'bm_newurl">URL</label><label for="'+prefix+'bm_newurl" class="inlined">ssh://user@host:22 or http://webhost/path</label><input type="text" name="'+prefix+'bm_newurl" id="'+prefix+'bm_newurl" class="input-text"><label for="'+prefix+'bm_new_name">Name</label><label for="'+prefix+'bm_new_name" class="inlined">Web App Server 1</label><input type="text" name="'+prefix+'bm_new_name" id="'+prefix+'bm_new_name" class="input-text"><label for="'+prefix+'bm_newurl_tags">Tags</label><label for="'+prefix+'bm_newurl_tags" class="inlined">Linux, New York, Production</label><input type="text" name="'+prefix+'bm_newurl_tags" id="'+prefix+'bm_newurl_tags" class="input-text"><label for="'+prefix+'bm_new_notes">Notes</label><label for="'+prefix+'bm_new_notes" class="inlined medium">Add some notes about this bookmark.</label><textarea id="'+prefix+'bm_new_notes" class="input-text medium"></textarea>';
        }
        bmCancel.onclick = function(e) {
            // Reset the inline labels in addition to the form
            u.toArray(document.getElementsByClassName('input-text')).forEach(function(node) {
                node.style.backgroundColor = 'transparent';
            });
            // Now slide away the form and bring our regular bookmark panel back.
            go.Visual.applyTransform(bmForm, 'translate(200%, 0)');
            setTimeout(function() {
                u.removeElement(bmForm);
                b.createPanel();
            }, 500);
        };
        bmForm.appendChild(bmSubmit);
        bmForm.appendChild(bmCancel);
        go.Visual.applyTransform(bmForm, 'translate(200%, 0)');
        bmPanel.appendChild(bmForm);
        // Slide the existing panel away
        u.toArray(bmPanelChildren).forEach(function(child) {
            if (child.name) {
                if (child.name != prefix+'bm_new_form') {
                    go.Visual.applyTransform(child, 'translate(200%, 0)');
                    setTimeout(function() {
                        child.style.display = "none";
                    }, 750);
                }
            } else {
                go.Visual.applyTransform(child, 'translate(200%, 0)');
                setTimeout(function() {
                    child.style.display = "none";
                }, 750);
            }
        });
        setTimeout(function() {
            go.Visual.applyTransform(bmForm, 'translate(0, 0)');
        }, 500);
        // Set our onchange event to remove the inline label once the user has started typing
        u.toArray(goDiv.getElementsByClassName('input-text')).forEach(function(node) {
            node.onfocus = function(e) {
                this.style.cssText = "background-color: #fff";
                this.previousSibling.style.opacity = 0;
            };
            node.onblur = function(e) {
                if (!this.value) { // Show label again if field is empty
                    this.style.cssText = "background-color: transparent";
                    this.previousSibling.style.opacity = 1;
                }
            };
        });
        // TODO: Add validation (also make sure user isn't making an identical bookmark)
        bmForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var delay = 1000,
                url = u.getNode('#'+prefix+'bm_newurl').value,
                name = u.getNode('#'+prefix+'bm_new_name').value,
                tags = u.getNode('#'+prefix+'bm_newurl_tags').value,
                notes = u.getNode('#'+prefix+'bm_new_notes').value,
                now = new Date();
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
                tags = [];
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
                    'updateSequenceNum': 0, // This will get set when synchronizing with Evernote
                    'images': {'favicon': null}
                };
                b.createOrUpdateBookmark(bm);
                // TODO: Get this fetching icons for HTTP and HTTPS URLs
                // Fetch its icon (have to wait a sec since storeBookmark is async)
//                 setTimeout(function() {
//                     b.updateIcon(bm);
//                 }, 1000);
            } else {
//                 console.log("existing bookmark, url: " + url);
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
                            b.deleteBookmark(URL); // Delete the original URL
                        }
                        // Store the modified bookmark
                        b.createOrUpdateBookmark(b.bookmarks[i]);
//                         b.Storage.storeBookmark(b.bookmarks[i]);
                        // Re-fetch its icon (have to wait a sec since storeBookmark is async)
                        setTimeout(function() {
                            b.updateIcon(b.bookmarks[i]);
                        }, 1000);
                        break;
                    }
                }
            }
            bmForm.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(bmForm);
            }, 1000);
            b.createPanel();
        }
//         bmForm.onsubmit = function(e) {
//             // Don't actually submit it
//             e.preventDefault();
//             // Grab the form values
//             var delay = 1000,
//                 bmContainer = u.getNode('#'+go.prefs.prefix+'bm_container'),
//                 url = u.getNode('#'+go.prefs.prefix+'bm_newurl').value,
//                 name = u.getNode('#'+go.prefs.prefix+'bm_new_name').value,
//                 tags = u.getNode('#'+go.prefs.prefix+'bm_newurl_tags').value,
//                 notes = u.getNode('#'+go.prefs.prefix+'bm_new_notes').value,
//                 bookmarks = JSON.parse(localStorage[prefix+'bookmarks']);
//             // Fix any missing trailing slashes in the URL
//             if (url.slice(0,4) == "http") {
//                 if (url.indexOf("?") == -1){
//                     // No query string present, assume a trailing slash is necessary
//                     if (url[url.length-1] != "/") {
//                         url = url + "/";
//                     }
//                 }
//             }
//             if (tags) {
//                 // Convert to list
//                 tags = tags.split(',');
//                 tags = tags.map(function(item) {
//                     return item.trim();
//                 });
//             }
//             // Construct a new bookmark object
//             var bm = {url: url, name: name, tags: tags, notes: notes, visits: 0};
//             // Append to the bookmarks array
//             bookmarks.push(bm);
//             // Save back to localStorage
//             localStorage[prefix+'bookmarks'] = JSON.stringify(bookmarks);
//             // Add the new bookmark to the panel
//             go.Bookmarks.createBookmark(bmContainer, bm, 10);
//             // Now fade out the form and bring our regular bookmark panel back.
// //             go.Visual.applyTransform(bmForm, 'translate(200%, 0)');
//             bmForm.style.opacity = 0;
//             setTimeout(function() {
//                 u.removeElement(bmForm);
// //                 u.toArray(bmPanelChildren).forEach(function(child) {
// //                     setTimeout(function() {
// //                         child.style.display = "block";
// //                     }, 750);
// //                     setTimeout(function() {
// //                         go.Visual.applyTransform(child, 'translate(0, 0)');
// //                     }, 1000);
// //                 });
//             }, 1000);
//             go.Bookmarks.createPanel();
//             go.Bookmarks.loadBookmarks(go.Bookmarks.sortfunc);
//         }
    },
    incrementVisits: function(url) {
        // Increments the given bookmark by 1
        var go = GateOne,
            prefix = go.prefs.prefix,
            bookmarks = JSON.parse(localStorage[prefix+'bookmarks']);
        bookmarks.forEach(function(bookmark) {
            if (bookmark.url == url) {
                bookmark.visits += 1;
            }
        });
        localStorage[prefix+'bookmarks'] = JSON.stringify(bookmarks);
        go.Bookmarks.loadBookmarks(go.Bookmarks.sort);
    },
    newBookmark: function(obj) {
        // Creates a new bookmark using *obj* which should be something like this:
        // {"name":"My Host","url":"ssh://myuser@myhost","tags":["Home","Linux"],"notes":"Home PC","visits":0}
        var go = GateOne,
            prefix = go.prefs.prefix,
            bookmarks = localStorage[prefix+'bookmarks'];
        if (bookmarks) {
            bookmarks = go.Bookmarks.bookmarks = JSON.parse(bookmarks);
        }
        bookmarks.push(obj);
        localStorage[prefix+'bookmarks'] = JSON.stringify(bookmarks);
    },
    editBookmark: function(obj) {
        // Slides the bookmark editor form into view
        // Note: Only meant to be called with a bm_edit anchor as *obj*
        var go = GateOne,
            url = obj.parentElement.parentElement.getElementsByClassName("bm_url")[0].href;
        go.Bookmarks.bookmarkForm(url);
    },
    deleteBookmark: function(obj) {
        // Deletes the given bookmark..  *obj* can either be a URL (string) or the "go_bm_delete" anchor tag.
        var go = GateOne,
            u = go.Utils,
            prefix = go.prefs.prefix,
            url = null,
            count = 0,
            remove = null,
            bookmarks = JSON.parse(localStorage[prefix+'bookmarks']),
            confirmElement = u.createElement('div', {'id': prefix+'bm_confirm_delete', 'class': 'bookmark halfsectrans', 'style': {'text-align': 'center', 'position': 'absolute', 'top': 0, 'left': 0, 'right': 0, 'bottom': 0, 'opacity': 0, 'border': 0, 'padding': '0.2em', 'z-index': 750}}),
            yes = u.createElement('button', {'id': prefix+'bm_yes', 'class': 'button black'}),
            no = u.createElement('button', {'id': prefix+'bm_no', 'class': 'button black'}),
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks');
        if (typeof(obj) == "string") {
            url = obj;
        } else {
            // Assume this is an anchor tag from the onclick event
            url = obj.parentElement.parentElement.getElementsByClassName("bm_url")[0].href;
        }
        yes.innerHTML = "Yes";
        no.innerHTML = "No";
        yes.onclick = function(e) {
            go.Visual.applyTransform(obj.parentElement.parentElement.parentElement, 'translate(-200%, 0)');
            // Find the matching bookmark and delete it
            bookmarks.forEach(function(bookmark) {
                if (bookmark.url == url) {
                    remove = count;
                }
                count += 1;
            });
            bookmarks.splice(remove, 1); // Remove the bookmark in question.
            // Now save our new bookmarks list
            localStorage[prefix+'bookmarks'] = JSON.stringify(bookmarks);
            setTimeout(function() {
                u.removeElement(obj.parentElement.parentElement.parentElement);
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
        confirmElement.innerHTML = "Are you sure you want to delete this bookmark?<br />";
        confirmElement.appendChild(no);
        confirmElement.appendChild(yes);
        obj.parentElement.parentElement.appendChild(confirmElement);
        setTimeout(function() {
            confirmElement.style.opacity = 1;
        }, 250);
    },
    createOrUpdateBookmark: function(obj) {
        // Creates or updates a bookmark (in Bookmarks.bookmarks and storage) using *obj*
//         console.log("calling createOrUpdateBookmark()");
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            matched = false;
        for (var i in b.bookmarks) {
            if (b.bookmarks[i]) {
                if (b.bookmarks[i].url == obj.url) {
                    // Double-check the images to make sure we're not throwing one away
                    if (u.items(Bookmarks.bookmarks[i].images).length) {
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
            // Fix the name (Evernote doesn't like leading spaces)
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
//         var recordIt = function() { console.log(obj.url); };
//         Bookmarks.Storage.storeBookmark(obj, recordIt);
        b.storeBookmark(obj);
        // Add this bookmark to the icon fetching queue
//         localStorage['iconQueue'] += obj.url + '\n';
    },
    getMaxBookmarks: function(elem) {
    // Calculates and returns the number of bookmarks that will fit in the given element ID (elem).
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
                bmElement = b.createBookmark(node, tempBookmark, 1000),
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
        // Sets up the pagination for the given array of bookmarks and returns the pagination node.
        // If *page* is given, the pagination will highlight the given page number and adjust prev/next accordingly
        var go = GateOne,
            b = go.Bookmarks,
            u = go.Utils,
            prefix = go.prefs.prefix,
            bmPaginationUL = u.createElement('ul', {'id': prefix+'bm_pagination_ul', 'class': 'bm_pagination halfsectrans'}),
            bmContainer = u.getNode('#'+prefix+'bm_container'),
            bmMax = b.getMaxBookmarks('#'+prefix+'bm_container'),
            bmPages = Math.ceil(bookmarks.length/bmMax),
            prev = u.createElement('li', {'class': 'bm_page halfsectrans'}),
            next = u.createElement('li', {'class': 'bm_page halfsectrans'});
        // Add the paginator
        if (typeof(page) == 'undefined' || page == null) {
            page = 0;
        }
        if (page == 0) {
            prev.className = 'bm_page halfsectrans inactive';
        } else {
            prev.onclick = function(e) {
                e.preventDefault();
                b.page -= 1;
                b.loadBookmarks();
            }
        }
        prev.innerHTML = '<a id="'+prefix+'bm_prevpage" href="#">« Previous</a>';
        bmPaginationUL.appendChild(prev);
        if (bmPages > 0) {
            for (var i=0; i<=(bmPages-1); i++) {
                var li = u.createElement('li', {'class': 'bm_page halfsectrans'});
                if (i == page) {
                    li.innerHTML = '<a href="#" class="active" style="color: #fff">'+(i+1)+'</a>';
                } else {
                    li.innerHTML = '<a href="#">'+(i+1)+'</a>';
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
            var li = u.createElement('li', {'class': 'bm_page halfsectrans'});
            li.innerHTML = '<a href="#" class="active" style="color: #fff">1</a>';
            bmPaginationUL.appendChild(li);
        }
        if (page == bmPages-1 || bmPages == 0) {
            next.className = 'bm_page halfsectrans inactive';
        } else {
            next.onclick = function(e) {
                e.preventDefault();
                b.page += 1;
                b.loadBookmarks();
            }
        }
        next.innerHTML = '<a id="'+prefix+'bm_nextpage" href="#">Next »</a>';
        bmPaginationUL.appendChild(next);
        return bmPaginationUL;
    },
    storeBookmark: function(bookmarkObj, /*opt*/callback) {
        // Stores the given *bookmarkObj* in the DB
        // if *callback* is given, will be executed after the bookmark is stored with the bookmarkObj as the only argument
        // Assume Bookmarks.bookmarks has already been updated and stringify them to localStorage['bookmarks']
        localStorage[GateOne.prefs.prefix+'bookmarks'] = JSON.stringify(GateOne.Bookmarks.bookmarks);
        if (callback) {
            callback(bookmarkObj);
        }
    },
    generateTip: function() {
        // Returns a string with a tip
        var tips = [
            "You can right-click on a tag to rename it.",
            "You can drag & drop a tag onto a bookmark to tag it.",
            "You can create bookmarks with any kind of URL. Even email address URLs: 'mailto:user@domain.com'.",
            "The 'Filtered Bookmarks' option in the export dialog is a great way to share a subset of your bookmarks with friends and coworkers.",
            "If you're using someone else's computer, use the Nuke feature when you're done to keep your bookmarks private.",
        ];
        return tips[Math.floor(Math.random()*tips.length)];
    }
});

})(window);