(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

"use strict";

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;

// GateOne.Bookmarks (bookmark management functions)
GateOne.Base.module(GateOne, "Bookmarks", "0.9", ['Base']);
GateOne.Bookmarks.bookmarks = [];
GateOne.Bookmarks.tags = [];
GateOne.Bookmarks.sortToggle = false;
GateOne.Base.update(GateOne.Bookmarks, {
    // TODO: Add auto-tagging bookmarks based on date of last login...  <1day, <7days, etc
    // TODO: Make it so you can have a bookmark containing multiple URLs.  So they all get opened at once when you open it.
    init: function() {
        var go = GateOne,
            u = go.Utils,
            b = go.Bookmarks,
            toolbarBookmarks = u.createElement('div', {'id': go.prefs.prefix+'icon_bookmarks', 'class': go.prefs.prefix+'toolbar', 'title': "Bookmarks"}),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar');
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        if (go.Logging) {
            logFatal = go.Logging.logFatal;
            logError = go.Logging.logError;
            logWarning = go.Logging.logWarning;
            logInfo = go.Logging.logInfo;
            logDebug = go.Logging.logDebug;
        } else {
            logFatal = noop;
            logError = noop;
            logWarning = noop;
            logInfo = noop;
            logDebug = noop;
        }
        // Default sort order is by date created, descending, followed by alphabetical order
        if (!localStorage['sort']) {
            // Set a default
            localStorage['sort'] = 'date';
            b.sortfunc = b.sortFunctions.created;
        } else {
            if (localStorage['sort'] == 'alpha') {
                b.sortfunc = b.sortFunctions.alphabetical;
            } else if (localStorage['sort'] == 'date') {
                b.sortfunc = b.sortFunctions.created;
            } if (localStorage['sort'] == 'visits') {
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
        if (!localStorage['bookmarks']) {
            localStorage['bookmarks'] = "[]"; // Init as empty list
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
        // Takes an array of bookmarks and stores them in both Bookmarks.bookmarks and using Bookmarks.Storage
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
                    if (bookmark.updateSequenceNum > parseInt(localStorage['USN'])) {
                        // Also need to add it to toUpload
                        b.toUpload.push(conflictingBookmark);
                    }
                }
            } else if (deletedBookmark) {
                // Don't do anything
            } else {
                // No conflict; store it if we haven't already deleted it
                var deletedBookmarks = localStorage['deletedBookmarks'];
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
//     loadBookmarks: function(/*opt*/delay) {
//         // Loads the user's bookmarks
//         // Optionally, a sort function may be supplied that sorts the bookmarks before placing them in the panel.
//         // If *ad* is true, an advertisement will be the first item in the bookmarks list
//         // If *delay* is given, that will be used to set the delay
// //         console.log("loadBookmarks()");
//         var go = GateOne,
//             b = go.Bookmarks,
//             u = go.Utils,
//             bookmarks = b.bookmarks.slice(0), // Make a local copy since we're going to mess with it
//             bmCount = 0, // Starts at 1 for the ad
//             bmMax = u.getMaxBookmarks('#'+prefix+'bm_container'),
//             bmContainer = u.getNode('#'+prefix+'bm_container'),
//             bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
//             pagination = u.getNode('#'+prefix+'bm_pagination'),
//             paginationUL = u.getNode('#'+prefix+'bm_pagination_ul'),
//             tagCloud = u.getNode('#'+prefix+'bm_tagcloud'),
//             bmSearch = u.getNode('#'+prefix+'bm_search'),
//             bmTaglist = u.getNode('#'+prefix+'bm_taglist'),
//             cloudTags = u.toArray(tagCloud.getElementsByClassName('bm_tag')),
//             allTags = [],
//             filteredBookmarks = [],
//             bookmarkElements = u.toArray(document.getElementsByClassName('bookmark'));
//         bmPanel.style['overflow-y'] = "hidden"; // Only temporary while we're loading bookmarks
//         setTimeout(function() {
//             bmPanel.style['overflow-y'] = "auto"; // Set it back after everything is loaded
//         }, 1000);
//         if (bookmarkElements) { // Remove any existing bookmarks from the list
//             bookmarkElements.forEach(function(bm) {
//                 bm.style.opacity = 0;
//                 setTimeout(function() {
//                     u.removeElement(bm);
//                 },500);
//             });
//         }
//         if (!delay) {
//             delay = 0;
//         }
//         // Remove the pagination UL
//         if (paginationUL) {
//             u.removeElement(paginationUL);
//         };
//         // Apply the sort function
//         bookmarks.sort(b.sortfunc);
//         if (b.sortToggle) {
//             bookmarks.reverse();
//         }
//         if (!bookmarks.length) { // No bookmarks == Likely new user.  Show a welcome message.
//             var welcome = {
//                     'url': "http://liftoffsoftware.com/",
//                     'name': "You don't have any bookmarks yet!",
//                     'tags': [],
//                     'notes': 'A great way to get started is to import bookmarks or click Evernote Sync.',
//                     'visits': 0,
//                     'updated': new Date().getTime(),
//                     'created': new Date().getTime(),
//                     'updateSequenceNum': 0, // This will get set when synchronizing with Evernote
//                     'images': {'favicon': "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9sHCBMpEfMvEIMAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAACEUlEQVQoz2M0Lei7f/YIA3FAS02FUcQ2iFtcDi7Ex81poq6ooyTz7cevl+8/nr354Nmb93DZry8fMXPJa7Lx8EP43pYGi2oyIpwt2NlY333+WpcQGO9pw8jAePbm/X///zMwMPz++pEJrrs00ntqUbwQLzcDA8P2Exd3nLzEwMDAwsxcGO6xuCaTmQmqEkqZaSplBjrDNW87cfHinUdwx1jqqKT7O0HYLBAqwcvuzpOXEPb956+fvn7PwMCwfM8JX2tDuGuX7T729SUDCwMDAyc7m5KkaO6ERTcfPUcOk8lrd01eu4uBgUGAh6szM0JPRe7p3RtMDAwMarISGvJSG9sLo1ytMIPSTFNpe0+pu5mulrwU1A+fv/1gYGDgYGNtSwttSApCVu1jZbC8IVtSWICBgeHT1+9QDQ+ev/728xdExYcv35A1vP30BR4+Vx88hWr49///zpOXIKLbT1xkYGDwtNDPD3FnZmI6de3eu89fGRgYHrx4c+3BU0QoNc5fb6On/uX7j4cv3rSlhUI8Y62nlj9x8e7Tl0MdzYunLPv95y8DAwMiaZhqKPnbGplpKqvJSsCd9OHLt3UHT9958nLZnuOQpMEClzt9497Nx8+rYv2E+XiE+XkYGBi+/fx1+e7jpbuP3X36Cq4MPfFBgKSwABcH2/1nryFJCDnxsWipqVy7dQdNw52Xj7Amb0VjGwCOn869WU5D8AAAAABJRU5ErkJggg=="}
//             },
//                 introVideo = {
//                 'url': "http://vimeo.com/26357093",
//                 'name': "A Quick Screencast Overview of Bookmarked",
//                 'tags': ["Video", "Help"],
//                 'notes': 'Want some help getting started?  Our short (3 minutes) overview screencast can be illuminating.',
//                 'visits': 0,
//                 'updated': new Date().getTime(),
//                 'created': new Date().getTime(),
//                 'updateSequenceNum': 0, // This will get set when synchronizing with Evernote
//                 'images': {'favicon': "data:image/x-icon;base64,AAABAAEAEBAAAAAAAABoBQAAFgAAACgAAAAQAAAAIAAAAAEACAAAAAAAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAA8uvRAMq/oQDj28EA27crAOjRdwCrhwoAuZQLAODKdwC6r5EAkXs1AODCSgCKd0MA3rw7AP///wDi3dAA/PnwAI9yFwBzWxUAh2kHAL6aCwDAmgsA6taGAM+nDACwjxkA1q0NANfIkwDt3qQAz8ShAI98RADr6OAAlXUIAO3blQCqk0UAtKeCAOndsgCdewkAzsawAOTcwQDg1rIA2bIcALmlZADbvUkAno5iAPX07wDGt4MA8OCkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBQUFBQUFBQUFBQUABQUGRkZGQcXGRkZGRkZFBQUGRkZGR8MEgYZGRkZGRkUFBkZGRcJDiwrBhkZGRkZFBQZGRkYDg4ODisHGRkZGRQUGRkZKQ4ODg4OHRkZGRkUFBkZGQIODhYBDiwRGRkZFBQZGRUeDg4ZCw4OJQcZGRQUByQKDg4mFxknDg4hGRkUFCotDw4OGigTIg4OHBkZFBQoLg4ODggZIywODgMZGRQUGRkgDhAEGQsODg4bGRkUFBkZGQ0EGRkZBBYFKBkZFBQZGRkZGRkZGRkZGRkZGRQUDRkZGRkZGRkZGRkZGQ0UABQUFBQUFBQUFBQUFBQUAIABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIABAAA="}
//             };
//             b.createBookmark(bmContainer, welcome, delay, false);
//             b.createBookmark(bmContainer, introVideo, delay+100, false);
//         }
//         // Remove bookmarks from *bookmarks* that don't match the searchFilter (if one is set)
//         if (b.searchFilter) {
//             bookmarks.forEach(function(bookmark) {
//                 var bookmarkName = bookmark.name.toLowerCase();
//                 if (bookmarkName.match(b.searchFilter.toLowerCase())) {
//                     filteredBookmarks.push(bookmark);
//                 }
//             });
//             bookmarks = filteredBookmarks;
//             filteredBookmarks = []; // Have to reset this for use further down
//         }
//         bmTaglist.innerHTML = ""; // Clear out the tag list
//         // Now recreate it...
//         if (b.dateTags) {
//             for (var i in b.dateTags) {
//                 var tag = u.createElement('li', {'id': 'bm_autotag'});
//                 tag.onclick = function(e) {
//                     b.removeFilterDateTag(bookmarks, this.innerHTML);
//                 };
//                 tag.innerHTML = b.dateTags[i];
//                 bmTaglist.appendChild(tag);
//             }
//         }
//         if (b.tags) {
//             for (var i in b.tags) { // Recreate the tag filter list
//                 var tag = u.createElement('li', {'id': 'bm_tag'});
//                 tag.innerHTML = b.tags[i];
//                 tag.onclick = function(e) {
//                     b.removeFilterTag(bookmarks, this.innerHTML);
//                 };
//                 bmTaglist.appendChild(tag);
//             }
//         }
//         if (b.tags) {
//         // Remove all bookmarks that don't have matching *Bookmarks.tags*
//             bookmarks.forEach(function(bookmark) {
//                 var bookmarkTags = bookmark.tags,
//                     allTagsPresent = false,
//                     tagCount = 0;
//                 bookmarkTags.forEach(function(tag) {
//                     if (b.tags.indexOf(tag) != -1) { // tag not in tags
//                         tagCount += 1;
//                     }
//                 });
//                 if (tagCount == Bookmarks.tags.length) {
//                     // Add the bookmark to the list
//                     filteredBookmarks.push(bookmark);
//                 }
//             });
//             bookmarks = filteredBookmarks;
//             filteredBookmarks = []; // Have to reset this for use further down
//         }
//         if (b.dateTags) {
//         // Remove from the bookmarks array all bookmarks that don't measure up to *Bookmarks.dateTags*
//             bookmarks.forEach(function(bookmark) {
//                 var dateObj = new Date(parseInt(bookmark.created)),
//                     dateTag = b.getDateTag(dateObj),
//                     tagCount = 0;
//                 b.dateTags.forEach(function(tag) {
//                     // Create a new Date object that reflects the date tag
//                     var dateTagDateObj = new Date(),
//                         olderThanYear = false;
//                     if (tag == '<1 day') {
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-1);
//                     }
//                     if (tag == '<7 days') {
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-7);
//                     }
//                     if (tag == '<30 days') {
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-30);
//                     }
//                     if (tag == '<60 days') {
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-60);
//                     }
//                     if (tag == '<90 days') {
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-90);
//                     }
//                     if (tag == '<180 days') {
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-180);
//                     }
//                     if (tag == '<1 year') {
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-365);
//                     }
//                     if (tag == '>1 year') {
//                         olderThanYear = true;
//                         dateTagDateObj.setDate(parseInt(dateTagDateObj.getDate())-365);
//                     }
//                     if (!olderThanYear) {
//                         if (dateObj > dateTagDateObj) {
//                             tagCount += 1;
//                         }
//                     } else {
//                         if (dateObj < dateTagDateObj) {
//                             tagCount += 1;
//                         }
//                     }
//                 });
//                 if (tagCount == b.dateTags.length) {
//                     // Add the bookmark to the list
//                     filteredBookmarks.push(bookmark);
//                 }
//             });
//             bookmarks = filteredBookmarks;
//             filteredBookmarks = [];
//         }
//         allTags = b.getTags(bookmarks);
//         b.filteredBookmarks = bookmarks; // Need to keep track semi-globally for some things
//         if (b.page) {
//             var pageBookmarks = null;
//             if (bmMax*(b.page+1) < bookmarks.length) {
//                 pageBookmarks = bookmarks.slice(bmMax*b.page, bmMax*(b.page+1));
//             } else {
//                 pageBookmarks = bookmarks.slice(bmMax*b.page, bookmarks.length-1);
//             }
//             pageBookmarks.forEach(function(bookmark) {
//                 if (bmCount < bmMax) {
//                     if (!bookmark.images) {
// //                         console.log('bookmark missing images: ' + bookmark);
//                     }
//                     b.createBookmark(bmContainer, bookmark, delay);
// //                     delay += 25;
//                 }
//                 bmCount += 1;
//             });
//         } else {
//             bookmarks.forEach(function(bookmark) {
//                 if (bmCount < bmMax) {
//                     b.createBookmark(bmContainer, bookmark, delay);
// //                     delay += 25;
//                 }
//                 bmCount += 1;
//             });
//         }
//         // Add the pagination query string to the location
//         if (window.history.pushState) {
//             var query = window.location.search.substring(1),
//                 newQuery = null,
//                 match = false,
//                 queries = query.split('&');
// //             console.log('query: ' + query + ', queries: ' + queries);
//             if (b.page > 0) {
//                 if (query.length) {
//                     if (query.indexOf('page=') != -1) {
//                         // 'page=' is already present
//                         for (var i in queries) {
//                             if (queries[i].indexOf('page=') != -1) { // This is the page string
//                                 queries[i] = 'page=' + (b.page+1);
//                                 match = true;
//                             }
//                         }
//                     } else {
//                         queries.push('page=' + (b.page+1));
//                     }
//                     newQuery = queries.join('&');
//                 } else {
//                     newQuery = 'page=' + (b.page+1);
//                 }
// //                 console.log('newQuery: ' + newQuery);
//                 window.history.pushState("", "Bookmarked. Page " + b.page, "/?" + newQuery);
//             } else {
//                 if (query.indexOf('page=') != -1) {
//                     // Gotta remove the 'page=' part
//                     for (var i in queries) {
//                         if (queries[i].indexOf('page=') != -1) { // This is the page string
//                             delete queries[i];
//                         }
//                     }
//                     if (query.length) {
//                         newQuery = queries.join('&');
//                         if (newQuery.length) {
//                             window.history.pushState("", "Default", "/?" + queries.join('&'));
//                         } else {
//                             window.history.pushState("", "Default", "/");
//                         }
//                     }
//                 }
//             }
//         }
//         var bmPaginationUL = b.loadPagination(bookmarks, b.page);
//         pagination.appendChild(bmPaginationUL);
//         // Hide tags that aren't in the bookmark array
//         delay = 100;
//         cloudTags.forEach(function hideTag(tagNode) {
//             if (allTags.indexOf(tagNode.innerHTML) == -1) { // Tag isn't in the new list of bookmarks
//                 // Make it appear inactive
//                 setTimeout(function() {
//                     tagNode.className = 'bm_tag sectrans inactive';
// //                     u.applyTransform(tagNode, 'scale(0)');
//                 }, delay);
//             }
//         });
//         // Mark tags as active that were previously inactive (if the user just removed a tag from the tag filter)
//         delay = 100;
//         cloudTags.forEach(function showTag(tagNode) {
// //             tagNode.className = "bm_tag sectransform";
//             if (allTags.indexOf(tagNode.innerHTML) != -1) { // Tag is in the new list of bookmarks
//                 // Make it appear active
//                 setTimeout(function unTrans() {
//                     setTimeout(function reClass() {
//                         if (tagNode.innerHTML == "Untagged") {
//                             tagNode.className = 'bm_tag sectrans untagged';
//                         } else if (tagNode.innerHTML == "Searches") {
//                             tagNode.className = 'bm_tag sectrans searches';
//                         } else {
//                             tagNode.className = 'bm_tag sectrans'; // So we don't have slow mouseovers
//                         }
//                     }, 500);
//                 }, delay);
//             }
//         });
//     },
// This is the old loadBookmarks (need it for reference until I'm done porting everything from http://bookmarked.us/)
    loadBookmarks: function(/*opt*/sortfunc) {
        // Loads the user's bookmarks from localStorage
        // bookmark format:
        // [{name: 'Some Host', url: 'ssh://user@somehost:22', tags: ['New York, Linux'], notes: 'Lots of stuff on this host.'}, <another>, <another>, ...]
        // Optionally, a sort function may be supplied that sorts the bookmarks before placing them in the panel.
        logDebug('loadBookmarks()');
        var go = GateOne,
            prefix = go.prefs.prefix,
            u = go.Utils,
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks'),
            bookmarks = localStorage['bookmarks'],
            bmContainer = u.createElement('div', {'id': prefix+'bm_container', 'class': 'sectrans'}),
            alltags = go.Bookmarks.allTags(),
            bmTagCloud = u.createElement('ul', {'id': prefix+'bm_tagcloud', 'class': 'sectrans'}),
            bmTagCloudUL = u.createElement('ul', {'id': prefix+'bm_tagcloud_ul'}),
            bmTagsHeader = u.createElement('h3', {'class': 'sectrans'}),
            delay = 1000,
            bookmarkElements = GateOne.Utils.toArray(document.getElementsByClassName(prefix+'bookmark'));
        if (bookmarks) {
            bookmarks = GateOne.Bookmarks.bookmarks = JSON.parse(bookmarks);
        } else {
            return;
        }
        if (bookmarkElements) { // Remove any existing bookmarks from the list
            bookmarkElements.forEach(function(bm) {
                bm.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(bm);
                },1000);
            });
        }
        // Remove the tag cloud before we add a new one
        var tagCloud = u.getNode('#'+prefix+'bm_tagcloud');
        if (tagCloud) {
            tagCloud.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(tagCloud);
            },1000);
        };
        // Apply the sort function
        if (sortfunc) {
            bookmarks.sort(sortfunc);
        } else {
            bookmarks.sort(go.Bookmarks.sortfunc);
        }
        bookmarks.forEach(function(bookmark) {
            go.Bookmarks.createBookmark(bmContainer, bookmark, delay);
            delay += 50;
        });
        bmPanel.appendChild(bmContainer);
        // Add the tag cloud
        bmTagsHeader.innerHTML = 'Tags';
        go.Visual.applyTransform(bmTagsHeader, 'translate(200%, 0)');
        bmTagCloud.appendChild(bmTagsHeader);
        bmTagCloud.appendChild(bmTagCloudUL);
        delay = 1250;
        setTimeout(function() {
            go.Visual.applyTransform(bmTagsHeader, 'translate(0, 0)');
        }, 1000);
        alltags.forEach(function(tag) {
            var li = u.createElement('li', {'class': prefix+'bm_tag sectransform'});
            li.innerHTML = tag;
            go.Visual.applyTransform(li, 'translate(1000%, 0)');
            li.onclick = function(e) {
                go.Bookmarks.addFilterTag(tag);
            };
            bmTagCloudUL.appendChild(li);
            setTimeout(function() {
                go.Visual.applyTransform(li, 'translate(0, 0)');
            }, delay);
            delay += 50;
        });
        bmPanel.appendChild(bmTagCloud);
    },
    createBookmark: function(bmContainer, bookmark, delay) {
        // Creates a new bookmark element to be placed in bm_container
        // *bmContainer* is the node we're going to be placing bookmarks
        // *bookmark* is expected to be a bookmark object taken from the list inside localStorage['bookmarks']
        // *delay* is the amount of milliseconds to wait before translating the bookmark into view
        var go = GateOne,
            prefix = go.prefs.prefix,
            u = go.Utils,
            bmElement = u.createElement('div', {'class': prefix+'bookmark sectrans'}),
            bmURI = u.createElement('div', {'class': prefix+'bm_uri'}),
            bmLink = u.createElement('a', {'class': prefix+'bm_url'}),
            bmEdit = u.createElement('a', {'id': prefix+'bm_edit'}),
            bmControls = u.createElement('span', {'class': prefix+'bm_controls'}),
            bmDesc = u.createElement('span', {'class': prefix+'bm_desc'}),
            bmVisited = u.createElement('div', {'class': prefix+'bm_visited'}),
            bmTaglist = u.createElement('ul', {'class': prefix+'bm_taglist'});
        bmControls.innerHTML = '<a href="#" id="go_bm_edit" onclick="GateOne.Bookmarks.editBookmark(this);">Edit</a>|<a href="#" id="go_bm_delete" onclick="GateOne.Bookmarks.deleteBookmark(this);">Delete</a>';
        bmLink.href = bookmark.url;
        bmLink.innerHTML = bookmark.name;
        bmLink.onclick = function(e) {
            e.preventDefault();
            go.Bookmarks.openBookmark(this.href);
        };
        bmURI.appendChild(bmLink);
        bmURI.appendChild(bmControls);
        bmElement.appendChild(bmURI);
        bmVisited.innerHTML = bookmark.visits;
        bmElement.appendChild(bmVisited);
        bmDesc.innerHTML = bookmark.notes + '<br /><br />';
        bmElement.appendChild(bmDesc);
        bookmark.tags.forEach(function(tag) {
            var bmTag = u.createElement('li', {'class': prefix+'bm_tag'});
            bmTag.innerHTML = tag;
            bmTag.onclick = function(e) {
                go.Bookmarks.addFilterTag(tag);
            };
            bmTaglist.appendChild(bmTag);
        });
        bmElement.appendChild(bmTaglist);
        go.Visual.applyTransform(bmElement, 'translate(-200%, 0)');
        bmContainer.appendChild(bmElement);
        setTimeout(function() {
            go.Visual.applyTransform(bmElement, 'translate(0, 0)');
        }, delay);
        delay += 50;
    },
    createPanel: function() {
        // Creates the bookmarks panel and appends it to #gateone
        // If the bookmarks panel already exists, leave it but recreate the contents
        var go = GateOne,
            u = go.Utils,
            existingPanel = u.getNode('#'+go.prefs.prefix+'panel_bookmarks'),
            bmPanel = u.createElement('div', {'id': go.prefs.prefix+'panel_bookmarks', 'class': go.prefs.prefix+'panel sectrans'}),
            bmHeader = u.createElement('div', {'id': go.prefs.prefix+'bm_header', 'class': 'sectrans'}),
            bmTags = u.createElement('div', {'id': go.prefs.prefix+'bm_tags', 'class': 'sectrans'}),
            bmNew = u.createElement('div', {'id': go.prefs.prefix+'bm_new'}),
            bmHRFix = u.createElement('hr', {'style': {'opacity': 0}}),
            bmDisplayOpts = u.createElement('div', {'id': go.prefs.prefix+'bm_display_opts'});
        bmHeader.innerHTML = '<h2>Bookmarks <input type="text" name="search" value="Search" id="'+go.prefs.prefix+'bm_search" /></h2>';
        bmTags.innerHTML = '<b>Tag Filter:</b> <ul id="'+go.prefs.prefix+'bm_taglist"></ul>';
        bmNew.innerHTML = 'New ★';
        bmNew.onclick = go.Bookmarks.bookmarkForm;
        bmDisplayOpts.innerHTML = '<b>Sort: </b><span id="'+go.prefs.prefix+'bm_sort_direction">▼</span>';
        bmHeader.appendChild(bmTags);
        bmHeader.appendChild(bmNew);
        bmHeader.appendChild(bmHRFix); // The HR here fixes an odd rendering bug with Chrome on Mac OS X
        bmHeader.appendChild(bmDisplayOpts);
        if (existingPanel) {
            // Remove everything first
            while (existingPanel.childNodes.length >= 1 ) {
                existingPanel.removeChild(existingPanel.firstChild);
            }
            // Fade it in nicely
            bmHeader.style.opacity = 0;
            existingPanel.appendChild(bmHeader);
            setTimeout(function() {
                bmHeader.style.opacity = 1;
            }, 1000)
        } else {
            bmPanel.appendChild(bmHeader);
            u.getNode(go.prefs.goDiv).appendChild(bmPanel);
        }

        u.getNode('#'+go.prefs.prefix+'bm_sort_direction').onclick = go.Bookmarks.toggleSortOrder;
    },
    openBookmark: function(URL) {
        // If the current terminal is in a disconnected state, connects to *URL* in the current terminal.
        // If the current terminal is already connected, opens a new terminal and uses that.
        var term = localStorage['selectedTerminal'],
            termTitle = GateOne.Utils.getNode('#'+GateOne.prefs.prefix+'term'+term).title;
        if (URL.slice(0,4) == "http") {
            // This is a regular URL, open in a new window
            GateOne.Bookmarks.incrementVisits(URL);
            GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_bookmarks');
            window.open(URL);
            return; // All done
        }
        // Proceed as if this is an SSH URL...
        if (termTitle == 'Gate One') {
            // Foreground terminal has yet to be connected, use it
            GateOne.Input.queue(URL+'\n');
            GateOne.Net.sendChars();
        } else {
            GateOne.Terminal.newTerminal();
            setTimeout(function() {
                GateOne.Input.queue(URL+'\n');
                GateOne.Net.sendChars();
            }, 250);
        }
        GateOne.Visual.togglePanel('#'+GateOne.prefs.prefix+'panel_bookmarks');
        GateOne.Bookmarks.incrementVisits(URL);
    },
    toggleSortOrder: function() {
        // Reverses the order of the bookmarks list
        var go = GateOne,
            sortDirection = go.Utils.getNode('#'+go.prefs.prefix+'bm_sort_direction');
        if (go.Bookmarks.sortToggle) {
            go.Bookmarks.sortToggle = false;
            go.Bookmarks.sortfunc = function(a,b) { if (a.visits > b.visits) { return -1 } else { return 1 } };
            go.Bookmarks.loadBookmarks();
            go.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
            go.Visual.applyTransform(sortDirection, 'rotate(0deg)');
        } else {
            go.Bookmarks.sortToggle = true;
            go.Bookmarks.sortfunc = function(a,b) { if (a.visits < b.visits) { return -1 } else { return 1 } };
            go.Bookmarks.loadBookmarks();
            go.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
            go.Visual.applyTransform(sortDirection, 'rotate(180deg)');
        }
    },
    filterBookmarksByTags: function(tags) {
        // Filters the bookmarks list using the given tags and draws the breadcrumbs at the top of the panel.
        // *tags* should be an array of strings:  ['Linux', 'New York']
        var go = GateOne,
            u = go.Utils,
            bmTaglist = u.getNode('#'+go.prefs.prefix+'bm_taglist'),
            bookmarks = GateOne.Utils.toArray(document.getElementsByClassName(go.prefs.prefix+'bookmark')),
            bmTags = document.getElementsByClassName(go.prefs.prefix+'bm_tag');
        bmTaglist.innerHTML = ""; // Clear out the tag list
        for (var i in tags) { // Recreate the tag list
            tag = u.createElement('li', {id: go.prefs.prefix+'bm_tag'});
            tag.innerHTML = tags[i];
            tag.onclick = function(e) {
                go.Bookmarks.removeFilterTag(this.innerHTML);
            };
            bmTaglist.appendChild(tag);
        }
        var getTags = function(bookmark) {
            // Returns an array of tags associated with the given bookmark element.
            var bmTags = bookmark.getElementsByClassName(GateOne.prefs.prefix+'bm_tag'),
                outArray = [];
            bmTags = GateOne.Utils.toArray(bmTags);
            bmTags.forEach(function(liTag) {
                outArray.push(liTag.innerHTML);
            });
            return outArray;
        }
        // Remove bookmarks that don't match the user's selected tags:
        bookmarks.forEach(function(bookmark) {
            var bookmarkTags = getTags(bookmark),
                allTagsPresent = false,
                tagCount = 0;
            bookmarkTags.forEach(function(tag) {
                if (tags.indexOf(tag) != -1) { // tag not in tags
                    tagCount += 1;
                }
            });
            if (tagCount != tags.length) {
                // Remove the bookmark from the list
                go.Visual.applyTransform(bookmark, 'translate(-200%, 0)');
                setTimeout(function() {
                    u.removeElement(bookmark);
                }, 1000);
            }
        });
    },
    addFilterTag: function(tag) {
        // Adds the given tag to the filter list
        for (var i in GateOne.Bookmarks.tags) {
            if (GateOne.Bookmarks.tags[i] == tag) {
                // Tag already exists, ignore.
                return;
            }
        }
        GateOne.Bookmarks.tags.push(tag);
        GateOne.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
    },
    removeFilterTag: function(tag) {
        // Removes the given tag from the filter list
        for (var i in GateOne.Bookmarks.tags) {
            if (GateOne.Bookmarks.tags[i] == tag) {
                GateOne.Bookmarks.tags.splice(i, 1);
            }
        }
        GateOne.Bookmarks.loadBookmarks(GateOne.Bookmarks.sortfunc);
        GateOne.Bookmarks.filterBookmarksByTags(GateOne.Bookmarks.tags);
    },
    allTags: function() {
        // Returns an array of all the tags in localStorage['bookmarks']
        // ordered alphabetically
        var tagList = [],
            bookmarks = JSON.parse(localStorage['bookmarks']);
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
            prefix = go.prefs.prefix,
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
            var bookmarks = JSON.parse(localStorage['bookmarks']),
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
            bmForm.innerHTML = '<h2>New Bookmark</h2><label for="'+prefix+'bm_newurl">URL</label><label for="'+prefix+'bm_newurl" class="inlined">ssh://user@host:22 or http://webhost/path</label><input type="text" name="'+prefix+'bm_newurl" id="'+prefix+'bm_newurl" class="input-text"><label for="'+prefix+'bm_new_name">Name</label><label for="'+prefix+'bm_new_name" class="inlined">Web App Server 1</label><input type="text" name="'+prefix+'bm_new_name" id="'+prefix+'bm_new_name" class="input-text"><label for="'+prefix+'bm_newurl_tags">Tags</label><label for="'+prefix+'bm_newurl_tags" class="inlined">Linux, New York, Production</label><input type="text" name="'+prefix+'bm_newurl_tags" id="'+prefix+'bm_newurl_tags" class="input-text"><label for="'+prefix+'bm_new_notes">Notes</label><label for="'+prefix+'bm_new_notes" class="inlined medium">Add some notes about this bookmark.</label><textarea id="'+prefix+'bm_new_notes" class="input-text medium"></textarea>';
        }
        bmCancel.onclick = function(e) {
            // Reset the inline labels in addition to the form
            u.toArray(document.getElementsByClassName('input-text')).forEach(function(node) {
                node.style['background-color'] = 'transparent';
            });
            // Now slide away the form and bring our regular bookmark panel back.
            go.Visual.applyTransform(bmForm, 'translate(200%, 0)');
            setTimeout(function() {
                u.removeElement(bmForm);
                u.toArray(bmPanelChildren).forEach(function(child) {
                    child.style.display = "block";
                    setTimeout(function() {
                        go.Visual.applyTransform(child, 'translate(0, 0)');
                    }, 250);
                });
            }, 750);
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
        u.toArray(document.getElementsByClassName('input-text')).forEach(function(node) {
//             node.onfocus = function(e) {
//                 this.style['background-color'] = '#fff';
//             };
            node.onblur = function(e) {
                if (!this.value) { // Show label again if field is empty
                    this.style['background-color'] = 'transparent';
                }
            };
        });
        // TODO: Add validation (also make sure user isn't making an identical bookmark)
        bmForm.onsubmit = function(e) {
            // Don't actually submit it
            e.preventDefault();
            // Grab the form values
            var delay = 1000,
                bmContainer = u.getNode('#'+go.prefs.prefix+'bm_container'),
                url = u.getNode('#'+go.prefs.prefix+'bm_newurl').value,
                name = u.getNode('#'+go.prefs.prefix+'bm_new_name').value,
                tags = u.getNode('#'+go.prefs.prefix+'bm_newurl_tags').value,
                notes = u.getNode('#'+go.prefs.prefix+'bm_new_notes').value,
                bookmarks = JSON.parse(localStorage['bookmarks']);
            // Fix any missing trailing slashes in the URL
            if (url.slice(0,4) == "http") {
                if (url.indexOf("?") == -1){
                    // No query string present, assume a trailing slash is necessary
                    if (url[url.length-1] != "/") {
                        url = url + "/";
                    }
                }
            }
            if (tags) {
                // Convert to list
                tags = tags.split(',');
                tags = tags.map(function(item) {
                    return item.trim();
                });
            }
            // Construct a new bookmark object
            var bm = {url: url, name: name, tags: tags, notes: notes, visits: 0};
            // Append to the bookmarks array
            bookmarks.push(bm);
            // Save back to localStorage
            localStorage['bookmarks'] = JSON.stringify(bookmarks);
            // Add the new bookmark to the panel
            go.Bookmarks.createBookmark(bmContainer, bm, 10);
            // Now fade out the form and bring our regular bookmark panel back.
//             go.Visual.applyTransform(bmForm, 'translate(200%, 0)');
            bmForm.style.opacity = 0;
            setTimeout(function() {
                u.removeElement(bmForm);
//                 u.toArray(bmPanelChildren).forEach(function(child) {
//                     setTimeout(function() {
//                         child.style.display = "block";
//                     }, 750);
//                     setTimeout(function() {
//                         go.Visual.applyTransform(child, 'translate(0, 0)');
//                     }, 1000);
//                 });
            }, 1000);
            GateOne.Bookmarks.createPanel();
            GateOne.Bookmarks.loadBookmarks(GateOne.Bookmarks.sortfunc);
        }
    },
    incrementVisits: function(url) {
        // Increments the given bookmark by 1
        var bookmarks = JSON.parse(localStorage['bookmarks']);
        bookmarks.forEach(function(bookmark) {
            if (bookmark.url == url) {
                bookmark.visits += 1;
            }
        });
        localStorage['bookmarks'] = JSON.stringify(bookmarks);
        GateOne.Bookmarks.loadBookmarks(GateOne.Bookmarks.sort);
    },
    newBookmark: function(obj) {
        // Creates a new bookmark using *obj* which should be something like this:
        // {"name":"My Host","url":"ssh://myuser@myhost","tags":["Home","Linux"],"notes":"Home PC","visits":0}
        var bookmarks = localStorage['bookmarks'];
        if (bookmarks) {
            bookmarks = GateOne.Bookmarks.bookmarks = JSON.parse(bookmarks);
        }
        bookmarks.push(obj);
        localStorage['bookmarks'] = JSON.stringify(bookmarks);
    },
    editBookmark: function(obj) {
        // Slides the bookmark editor form into view
        // Note: Only meant to be called with a bm_edit anchor as *obj*
        var go = GateOne,
            url = obj.parentElement.parentElement.getElementsByClassName("go_bm_url")[0].href;
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
            bookmarks = JSON.parse(localStorage['bookmarks']),
            confirmElement = u.createElement('div', {'id': prefix+'bm_confirm_delete', 'class': prefix+'bookmark halfsectrans', 'style': {'text-align': 'center', 'position': 'absolute', 'top': 0, 'left': 0, 'right': 0, 'bottom': 0, 'opacity': 0, 'border': 0, 'padding': '0.2em', 'z-index': 750}}),
            yes = u.createElement('button', {'id': prefix+'bm_yes', 'class': 'button black'}),
            no = u.createElement('button', {'id': prefix+'bm_no', 'class': 'button black'}),
            bmPanel = u.getNode('#'+prefix+'panel_bookmarks');
        if (typeof(obj) == "string") {
            url = obj;
        } else {
            // Assume this is an anchor tag from the onclick event
            url = obj.parentElement.parentElement.getElementsByClassName("go_bm_url")[0].href;
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
            localStorage['bookmarks'] = JSON.stringify(bookmarks);
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
    }
});

})(window);