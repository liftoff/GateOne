(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// Useful sandbox-wide stuff
var noop = GateOne.Utils.noop;

// Sandbox-wide shortcuts for each log level (actually assigned in init())
var logFatal = null;
var logError = null;
var logWarning = null;
var logInfo = null;
var logDebug = null;

// GateOne.Bookmarks (bookmark management functions)
GateOne.Base.module(GateOne, "Bookmarks", "0.9", ['Base']);
GateOne.Bookmarks.bookmarks = [];
GateOne.Bookmarks.tags = [];
GateOne.Bookmarks.sortToggle = false;
GateOne.Base.update(GateOne.Bookmarks, {
    // TODO: Add auto-tagging bookmarks based on date of last login...  <1day, <7days, etc
    // TODO: Add the ability to filter-search with instant results.
    // TODO: Make it so you can have a bookmark containing multiple URLs.  So they all get opened at once when you open it.
    init: function() {
        // Assign our logging function shortcuts if the Logging module is available with a safe fallback
        logFatal = GateOne.Logging.logFatal || noop;
        logError = GateOne.Logging.logError || noop;
        logWarning = GateOne.Logging.logWarning || noop;
        logInfo = GateOne.Logging.logInfo || noop;
        logDebug = GateOne.Logging.logDebug || noop;
        var go = GateOne,
            u = go.Utils,
            toolbarBookmarks = u.createElement('div', {'id': go.prefs.prefix+'icon_bookmarks', 'class': go.prefs.prefix+'toolbar', 'title': "Bookmarks"}),
            toolbar = u.getNode('#'+go.prefs.prefix+'toolbar');
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
        GateOne.Bookmarks.sortfunc = function(a,b) { if (a.visits > b.visits) { return -1 } else { return 1 } };
        GateOne.Bookmarks.createPanel();
        GateOne.Bookmarks.loadBookmarks(GateOne.Bookmarks.sort);
    },
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
        for (i in tags) { // Recreate the tag list
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
        for (i in GateOne.Bookmarks.tags) {
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
        for (i in GateOne.Bookmarks.tags) {
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