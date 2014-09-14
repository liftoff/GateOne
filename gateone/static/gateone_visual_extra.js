(function(window, undefined) {

// This JavaScript file consists of some lesser-used (or late-loading-OK) visual functions that were moved out of gateone.js to save space.

var document = window.document,
    go = GateOne,
    prefix = go.prefs.prefix,
    u = go.Utils,
    v = go.Visual,
    E = go.Events,
    I = go.Input,
    S = go.Storage,
    gettext = GateOne.i18n.gettext,
    urlObj = (window.URL || window.webkitURL),
    logFatal = GateOne.Logging.logFatal,
    logError = GateOne.Logging.logError,
    logWarning = GateOne.Logging.logWarning,
    logInfo = GateOne.Logging.logInfo,
    logDebug = GateOne.Logging.logDebug;

GateOne.Base.update(GateOne.Visual, {
    widget: function(title, content, /*opt*/options) {
        /**:GateOne.Visual.widget(title, content[, options])

        Creates an on-screen widget with the given *title* and *content*.  Returns a function that will remove the widget when called.

        Widgets differ from dialogs in that they don't have a visible title and are meant to be persistent on the screen without getting in the way.  They are transparent by default and the user can move them at-will by clicking and dragging anywhere within the widget (not just the title).

        Widgets can be attached to a specific element by specifying a DOM object or querySelector string in *options['where']*.  Otherwise the widget will be attached to the currently-selected workspace.

        Widgets can be 'global' (attached to document.body) by setting *options['where']* to 'global'.

        By default widgets will appear in the upper-right corner of a given workspace.

        :param string title:  Will appear at the top of the widget when the mouse cursor is hovering over it for more than 2 seconds.
        :param string content:  HTML string or JavaScript DOM node:  The content of the widget.
        :param object options:  An associative array of parameters that change the look and/or behavior of the widget.

        Here's the possible options:

             :onopen:  Assign a function to this option and it will be called when the widget is opened with the widget parent element (widgetContainer) being passed in as the only argument.
             :onclose:  Assign a function to this option and it will be called when the widget is closed.
             :onconfig:  If a function is assigned to this parameter a gear icon will be visible in the title bar that when clicked will call this function.
             :where:  The node where we'll be attaching this widget or 'global' to add the widget to document.body.
             :top:  The initial 'top' position of the widget.
             :left:  The initial 'left' position of the widget.
        */
        options = options || {};
        var prefix = go.prefs.prefix,
            u = go.Utils,
            v = go.Visual,
            goDiv = u.getNode(go.prefs.goDiv),
            unique = u.randomPrime(), // Need something unique to enable having more than one widget on the same page.
            widgetContainer = u.createElement('div', {'id': 'widgetcontainer_' + unique, 'class': '✈halfsectrans ✈widgetcontainer', 'name': 'widget', 'title': title}),
            widgetDiv = u.createElement('div', {'id': 'widgetdiv', 'class': '✈widgetdiv'}),
            widgetContent = u.createElement('div', {'id': 'widgetcontent', 'class': '✈widgetcontent'}),
            widgetTitle = u.createElement('h3', {'id': 'widgettitle', 'class': '✈halfsectrans ✈originbottommiddle ✈widgettitle'}),
            dragHandle = u.createElement('div', {'class': '✈draghandle'}),
            icons = u.createElement('div', {'class': '✈dialog_icons'}),
            close = u.createElement('div', {'id': 'widget_close', 'class': '✈widget_icon ✈widget_close'}),
            configure = u.createElement('div', {'id': 'widget_configure', 'class': '✈widget_icon ✈widget_configure'}),
            widgetToForeground = function(e) {
                // Move this widget to the front of our array and fix all the z-index of all the widgets
                for (var i in v.widgets) {
                    if (widgetContainer == v.widgets[i]) {
                        v.widgets.splice(i, 1); // Remove it
                        v.widgets.unshift(widgetContainer); // Add it to the front
                        widgetContainer.style.opacity = 1; // Make sure it is visible
                    }
                }
                // Set the z-index of each widget to be its original z-index - its position in the array (should ensure the first item in the array has the highest z-index and so on)
                for (var i in v.widgets) {
                    if (i != 0) {
                        // Set all non-foreground widgets opacity to be slightly less than 1 to make the active widget more obvious
                        v.widgets[i].style.opacity = 0.75;
                    }
                    v.widgets[i].style.zIndex = v.widgetZIndex - i;
                }
                // Remove the event that called us so we're not constantly looping over the widgets array
                widgetContainer.removeEventListener("mousedown", widgetToForeground, true);
            },
            containerMouseUp = function(e) {
                // Reattach our mousedown function since it auto-removes itself the first time it runs (so we're not wasting cycles constantly looping over the widgets array)
                widgetContainer.addEventListener("mousedown", widgetToForeground, true);
                widgetContainer.style.opacity = 1;
            },
            widgetMouseOver = function(e) {
                // Show the border and titlebar after a timeout
                var v = go.Visual;
                if (v.widgetHoverTimeout) {
                    clearTimeout(v.widgetHoverTimeout);
                    v.widgetHoverTimeout = null;
                }
                v.widgetHoverTimeout = setTimeout(function() {
                    // De-bounce
                    widgetTitle.style.opacity = 1;
                    v.widgetHoverTimeout = null;
                }, 1000);
            },
            widgetMouseOut = function(e) {
                // Hide the border and titlebar
                var v = go.Visual;
                if (!widgetContainer.dragging) {
                    if (v.widgetHoverTimeout) {
                        clearTimeout(v.widgetHoverTimeout);
                        v.widgetHoverTimeout = null;
                    }
                    v.widgetHoverTimeout = setTimeout(function() {
                        // De-bounce
                        widgetTitle.style.opacity = 0;
                        v.widgetHoverTimeout = null;
                    }, 500);
                }
            },
            widgetMouseDown = function(e) {
                var m = go.Input.mouse(e); // Get the properties of the mouse event
                if (m.button.left) { // Only if left button is depressed
                    var left = window.getComputedStyle(widgetContainer, null)['left'],
                        top = window.getComputedStyle(widgetContainer, null)['top'];
                    widgetContainer.dragging = true;
                    e.preventDefault();
                    v.dragOrigin.X = e.clientX + window.scrollX;
                    v.dragOrigin.Y = e.clientY + window.scrollY;
                    if (left.indexOf('%') != -1) {
                        // Have to convert a percent to an actual pixel value
                        var percent = parseInt(left.substring(0, left.length-1)),
                            bodyWidth = window.getComputedStyle(document.body, null)['width'],
                            bodyWidth = parseInt(bodyWidth.substring(0, bodyWidth.length-2));
                        v.dragOrigin.widgetX = Math.floor(bodyWidth * (percent*.01));
                    } else {
                        v.dragOrigin.widgetX = parseInt(left.substring(0, left.length-2)); // Remove the 'px'
                    }
                    if (top.indexOf('%') != -1) {
                        // Have to convert a percent to an actual pixel value
                        var percent = parseInt(top.substring(0, top.length-1)),
                            bodyHeight = document.body.scrollHeight;
                        v.dragOrigin.widgetY = Math.floor(bodyHeight * (percent*.01));
                    } else {
                        v.dragOrigin.widgetY = parseInt(top.substring(0, top.length-2));
                    }
                    widgetContainer.style.opacity = 0.75; // Make it see-through to make it possible to see things behind it for a quick glance.
                }
            },
            moveWidget = function(e) {
                // Called when the widget is dragged
                if (widgetContainer.dragging) {
                    widgetContainer.className = '✈widgetcontainer'; // Have to get rid of the halfsectrans so it will drag smoothly.
                    var X = e.clientX + window.scrollX,
                        Y = e.clientY + window.scrollY,
                        xMoved = X - v.dragOrigin.X,
                        yMoved = Y - v.dragOrigin.Y,
                        newX = 0,
                        newY = 0;
                    if (isNaN(v.dragOrigin.widgetX)) {
                        v.dragOrigin.widgetX = 0;
                    }
                    if (isNaN(v.dragOrigin.widgetY)) {
                        v.dragOrigin.widgetY = 0;
                    }
                    newX = v.dragOrigin.widgetX + xMoved;
                    newY = v.dragOrigin.widgetY + yMoved;
                    if (widgetContainer.dragging) {
                        widgetContainer.style.left = newX + 'px';
                        widgetContainer.style.top = newY + 'px';
                    }
                }
            },
            closeWidget = function(e) {
                if (e) { e.preventDefault() }
                widgetContainer.className = '✈halfsectrans ✈widgetcontainer';
                widgetContainer.style.opacity = 0;
                setTimeout(function() {
                    u.removeElement(widgetContainer);
                }, 1000);
                document.body.removeEventListener("mousemove", moveWidget, true);
                document.body.removeEventListener("mouseup", function(e) {widgetContainer.dragging = false;}, true);
                widgetContainer.removeEventListener("mousedown", widgetToForeground, true); // Just in case--to ensure garbage collection
                widgetTitle.removeEventListener("mousedown", widgetMouseDown, true); // Ditto
                for (var i in v.widgets) {
                    if (widgetContainer == v.widgets[i]) {
                        v.widgets.splice(i, 1);
                    }
                }
                if (v.widgets.length) {
                    v.widgets[0].style.opacity = 1; // Set the new-first widget back to fully visible
                }
                // Call the onclose function
                if (options['onclose']) {
                    options['onclose']();
                }
            };
        // Sanitize options and apply defaults if necessary
        options.onopen = options.onopen || null;
        options.onclose = options.onclose || null;
        options.onconfig = options.onconfig || null;
        options.where = options.where || '#'+prefix+'workspace'+localStorage[prefix+'selectedWorkspace'];
        // Keep track of all open widgets so we can determine the foreground order
        if (!v.widgets) {
            v.widgets = [];
        }
        v.widgets.push(widgetContainer);
        widgetDiv.appendChild(widgetContent);
        // Enable drag-to-move on the widget title
        if (!widgetContainer.dragging) {
            widgetContainer.dragging = false;
            v.dragOrigin = {};
        }
        widgetContainer.addEventListener("mousedown", widgetMouseDown, true);
        widgetContainer.addEventListener("mouseover", widgetMouseOver, true);
        widgetContainer.addEventListener("mouseout", widgetMouseOut, true);
        // These have to be attached to document.body otherwise the widgets will be constrained within #gateone which could just be a small portion of a larger web page.
        document.body.addEventListener("mousemove", moveWidget, true);
        document.body.addEventListener("mouseup", function(e) {widgetContainer.dragging = false;}, true);
        widgetContainer.addEventListener("mousedown", widgetToForeground, true); // Ensure that clicking on a widget brings it to the foreground
        widgetContainer.addEventListener("mouseup", containerMouseUp, true);
        widgetContainer.style.opacity = 0;
        setTimeout(function() {
            // This fades the widget in with a nice and smooth CSS3 transition (thanks to the 'halfsectrans' class)
            widgetContainer.style.opacity = 1;
        }, 50);
        close.innerHTML = go.Icons['panelclose'];
        close.onclick = closeWidget;
        configure.innerHTML = go.Icons['prefs'].replace('prefsGradient', 'widgetGradient' + u.randomPrime());
        widgetTitle.innerHTML = title;
        if (options.onconfig) {
            configure.onclick = options.onconfig;
            widgetTitle.appendChild(configure);
        }
        widgetContainer.appendChild(widgetTitle);
        icons.appendChild(close);
        widgetTitle.appendChild(icons);
        if (typeof(content) == "string") {
            widgetContent.innerHTML = content;
        } else {
            widgetContent.appendChild(content);
        }
        widgetContainer.appendChild(widgetDiv);
        if (options['top']) {
            widgetContainer.style.top = options['top'];
        }
        if (options['left']) {
            widgetContainer.style.left = options['left'];
        }
        // Determine where we should put this widget
        if (options['where'] == 'global') {
            // global widgets are fixed to the page as a whole
            document.body.appendChild(widgetContainer);
        } else if (options['where']) {
            u.getNode(options['where']).appendChild(widgetContainer);
        }
        v.widgetZIndex = parseInt(getComputedStyle(widgetContainer).zIndex); // Right now this is 750 in the themes but that could change in the future so I didn't want to hard-code that value
        widgetToForeground();
        if (options.onopen) {
            options.onopen(widgetContainer);
        }
        return closeWidget;
    },
    confirm: function(title, question, callback) {
        /**:GateOne.Visual.confirm(title, question, callback)

        Opens a dialog where the user will be asked to confirm (via "Yes" or "No") the given *message*.

        The given *callback* will be called if the user confirms by clicking the "Yes" button.

        :param title: The title of the confirmation.
        :param question: The yes/no question to ask the user.
        :param callback: A function that will be called if the user confirms with "Yes".
        */
        var go = GateOne,
            u = GateOne.Utils,
            v = GateOne.Visual,
            closeDialog,
            options = {'maximizable': false, 'minimizable': false, 'class': '✈confirmdialog'},
            centeringDiv = u.createElement('div', {'class': '✈centered_text'}),
            yes = u.createElement('button', {'type': 'submit', 'value': 'OK', 'class': '✈button ✈black ✈yes'}),
            no = u.createElement('button', {'type': 'reset', 'value': 'OK', 'class': '✈button ✈black ✈no'}),
            messageContainer = u.createElement('p', {'class': '✈confirm_message'});
        yes.innerHTML = gettext("Yes");
        no.innerHTML = gettext("No");
        if (question instanceof HTMLElement) {
            messageContainer.appendChild(question);
        } else {
            messageContainer.innerHTML = "<p>" + question + "</p>";
        }
        centeringDiv.appendChild(no);
        centeringDiv.appendChild(yes);
        messageContainer.appendChild(centeringDiv);
        closeDialog = go.Visual.dialog(title, messageContainer, options);
        no.tabIndex = 1;
        yes.tabIndex = 1;
        yes.onclick = function(e) {
            e.preventDefault();
            closeDialog();
            if (callback) {
                callback();
            }
        }
        no.onclick = function(e) {
            e.preventDefault();
            closeDialog();
        }
        setTimeout(function() {
            no.focus();
        }, 250);
        go.Events.trigger('go:confirm', title, question, closeDialog);
    },
    // Example pane usage scenarios:
    //   var testPane = GateOne.Visual.Pane(someNode),
    //   testPane.innerHTML = "<p>Test pane</p>";
    //   testPane.appendChild('#some_element');

    //   var term1Pane = GateOne.Visual.Pane('#go_default_term1_pre'); <-- Creates a new Pane from term1_pre.  Doesn't make any changes to term1_pre unless specified in options.
    //   term1Pane.vsplit(); <-- Splits into two panes 50/50 left-and-right with the existing pane winding up on the left (default).
    //   term1Pane = term1Pane.hsplit(); <-- Splits into two panes 50/50 top-and-bottom with the existing pane winding up on the top (default).
    //   term1Pane.relocate('#some_id'); <-- Removes term1Pane from its existing location and places it into #some_id.
    panes: {}, // Tracks open Pane instances
    Pane: function(elem, options) {
        /**:GateOne.Visual.Pane

            :elem: A querySelector-like string or a DOM node.
            :options: A JavaScript object which may contain a number of configurable options (see below).

        An object that represents a pane on the page.  A new Pane may be created like so:

            >>> var pane = GateOne.Visual.Pane(elem, options);

        Options:

            :name: What to call this Pane so you can reference it later.
            :scroll: A boolean value representing whether or not this Pane will be scrollable (default is ``true``).
        */
        // Enforce 'new' to ensure unique instances
        if (!(this instanceof v.Pane)) {return new v.Pane(elem, options);}
        options = (options || {});
        var self = this,
            nodeContainer = u.createElement('div', {'class': '✈pane_cell'}),
            paneRow = u.createElement('div', {'class': '✈pane_row'});
        self.node = u.createElement('div', {'class': '✈pane'});
        if (options.name === undefined) {
            options.name = 'pane_' + u.randomString(8, 'abcdefghijklmnopqrstuvwxyz');
        }
        self.name = options.name;
        self.node.setAttribute('data-pane', self.name);
        self.elem = u.getNode(elem);
        self.parent = elem.parentNode;
        // Immediately wrap the given *elem* in our ✈pane container
        self.parent.appendChild(self.node);
        self.node.appendChild(paneRow); // Inside a row
        paneRow.appendChild(nodeContainer); // Inside a cell
        nodeContainer.appendChild(self.elem);
        self.metadata = {
            'grid': []
        };
        self.scroll = (options['scroll'] || false);
//         if (!('✈pane' in self.node.classList)) {
//             // Converting existing element into a Pane.
//             self.node.classList.add('✈pane');
//             // TODO: Probably need to add more stuff here
//         }
        // Scroll the element to the bottom since we just moved it all around
        setTimeout(function() {
            u.scrollToBottom(self.elem);
        }, 100);
        v.panes[self.name] = self;
        E.trigger("go:new_pane", self);
        self.split = function(axis, way, /*opt*/newNode) {
            /**:GateOne.Visual.Pane.split(axis, way[, newNode])

            Split this Pane into two.  The *axis* argument may be 'vertical', 'horizontal', or 'evil'.  Actually, just those first two make sense.

            The *way* argument controls left/right (vertical split) or top/bottom (horizontal split).  If not provided the default is have the existing pane wind up on the left or on the top, respectively.

            If provided, the given *newNode* will be placed in the new container that results from the split.  Otherwise a new application chooser will be placed there.  Note that if an existing node is given as *newNode* it will be moved into the panel.

            .. note:: If you can't remember how to use this function just use the vsplit() or hsplit() shortcuts.
            */
            var paneRow, newPane, barWidth,
                rowCount = 0, cellCount = 0,
                rows = u.toArray(self.node.querySelectorAll('.✈pane_row')),
                bars, newWidth,
//                 newHeight = parseInt(node.clientHeight/2) - parseInt(barWidth/2),
                newBar = u.createElement('div');
            if (axis == 'vertical') {
                newBar.className = '✈vsplitbar';
                way = way || 'left';
                rows.forEach(function(row) {
                    var cells = u.toArray(row.querySelectorAll('.✈pane_cell')),
                        barCount = 0;
                    bars = u.toArray(row.querySelectorAll('.✈vsplitbar'));
                    rowCount += 1;
                    row.appendChild(newBar); // So we can see how wide it is
                    barWidth = newBar.clientWidth;
                    newWidth = parseInt(self.node.clientWidth/(cells.length+1)) - barWidth;
                    cells.forEach(function(cell) {
                        if (cellCount == 0) {
                            cell.style.left = 0;
                        } else {
                            cell.style.left = ((newWidth * cellCount) + barWidth) + 'px';
                        }
                        cell.style.width = newWidth + 'px';
                        cell.style.height = '100%';
                        cellCount += 1;
                    });
                    bars.forEach(function(bar) {
                        barCount += 1;
                        console.log("Setting bar:", bar, " left to:", (newWidth * barCount) + 'px');
                        bar.style.left = ((newWidth * barCount) + barWidth) + 'px';
                    });
                    newPane = u.createElement('div', {'class': '✈pane_cell', 'style': {'width': newWidth + 'px', 'height': '100%', 'left': ((newWidth * cellCount) + (barWidth * barCount) + barWidth) + 'px'}});
                    if (barCount === 0) {
                        newBar.style.left = newWidth + 'px';
                    } else {
                        newBar.style.left = ((newWidth * cellCount) + barWidth) + 'px';
                    }
                });
                if (way == 'left') {
                    rows[rows.length-1].appendChild(newPane);
                }
                /* else {
                    newPane.style.top = (newHeight + barWidth) + 'px';
                    newBar.style.top = newHeight + 'px';
                }*/
            } else {
                newBar.className = '✈hsplitbar';
                way = way || 'top';
                paneRow = u.createElement('div', {'class': '✈pane_row'}); // Where this goes depends on 'top'
//                 nodeContainer.style.height = newHeight + 'px';
//                 nodeContainer.style.width = '100%';
                newPane = u.createElement('div', {'class': '✈pane_cell', 'style': {'width': '100%', 'height': newHeight + 'px'}});
            }
            if (!newNode) {
                newNode = v.appChooser(false);
            }
            newPane.appendChild(newNode);
//             if (way == 'left' || way == 'top') {
//                 if (paneRow) {
//                     paneRow.appendChild(newPane);
//                     self.node.appendChild(newBar);
//                     self.node.appendChild(paneRow);
//                 }
//             } else {
//                 if (paneRow) {
//                     paneRow.appendChild(newPane);
//                     self.node.insertBefore(rows[0], paneRow);
//                     self.node.appendChild(newBar);
//                     self.node.appendChild(paneRow);
//                 }
//                 rows[0].appendChild(newPane);
//                 rows[0].appendChild(newBar);
//             }
            setTimeout(function() {
                u.scrollToBottom(self.elem);
                u.scrollToBottom(newNode);
            }, 100);
            E.trigger("go:pane_split", self);
            return self;
        }
        self.vsplit = function(/*opt*/newNode) {
            /**:GateOne.Visual.Pane.vsplit([newNode])

            A shortcut for `GateOne.Visual.Pane.split('vertical')`
            */
            self.split('vertical', null, newNode);
        }
        self.hsplit = function(/*opt*/newNode) {
            /**:GateOne.Visual.Pane.hsplit([newNode])

            A shortcut for `GateOne.Visual.Pane.split('horizontal')`
            */
            self.split('horizontal', null, newNode);
        }
        self.relocate = function(where, /*opt*/splitAxis) {
            /**:GateOne.Visual.Pane.relocate(where)

            Moves the Pane from wherever it currently resides into the element at *where*.  The *splitAxis* argument will be used to determine how to split *where* to accomodate this Pane.
            */
        }
        self.save = function() {
            /**:GateOne.Visual.Pane.save()

            Saves the state of this pane in `localStorage` so that it may be restored later via :js:meth:`GateOne.Visual.Pane.restore`.
            */
            localStorage[prefix+'pane_'+self.name] = self.metadata;
        }
        self.restore = function(name) {
            /**:GateOne.Visual.Pane.restore(name)

            Restores the state of a :js:meth:`GateOne.Visual.Pane` of the given *name*.
            */
            var metadata = localStorage[prefix+'pane_'+name];
            if (metadata) {
                // Do the restore
            }
        }
        self.minimize = function(way) {
            /**:GateOne.Visual.Pane.minimize()

            Minimizes the Pane by docking it to the 'top', 'bottom', 'left', or 'right' of the view depending on *way*.
            */
        }
        self.remove = function() {
            /**:GateOne.Visual.Pane.remove()

            Removes the Pane from the page.
            */
            u.removeElement(self.node);
            delete v._panes[self.name];
            // TODO: Add logic here to remove the splitbar(s)
        }
        return self;
    },
    nodeThumb: function(elem, scale) {
        /**:GateOne.Visual.nodeThumb(elem, scale)

        Returns a miniature clone of the given *elem* that is reduced in size by the amount given by *scale* (e.g. 0.25 for 1/4 size).
        */
        var u = go.Utils,
            clone = u.getNode(elem).cloneNode(true);
        go.Visual.applyTransform(clone, 'scale('+scale+')');
        clone.id = clone.id + '_mini';
        return clone;
    },
    table: function(settings, data) {
        /**:GateOne.Visual.table(settings, data)

        :settings: A JavaScript object that controls the display and creation of this table (see below).
        :data: A JavaScript Array *or* a function which returns a JavaScript Array (more on that below) representing the data in the table.

        :returns: The table node.

        Creates or updates-in-place an HTML table from the given *settings* and *data* that will use Gate One defaults for style (which means appearance will be controlled via themes).

        The *settings* are described below:

            :id: **Required** - A unique name to identify this table.  Will be assigned to the 'id' attribute, prefixed with :js:attr:`GateOne.prefs.prefix`.  If a table with this `id` already exists it will be replaced with a new table using *data*.
            :header: An array of column headers.
            :footer: An array of column footers.  Footers may be passed as functions.
            :table_attrs: Any extra attributes you wish to be applied to the ``<table>`` element.
            :thead_attrs: Any extra attributes you wish to be applied to the ``<thead>`` element.
            :tbody_attrs: Any extra attributes you wish to be applied to the ``<tbody>`` element.
            :th_attrs: Any extra attributes you wish to be applied to ``<th>`` elements.
            :tr_attrs: Any extra attributes you wish to be applied to ``<tr>`` elements.
            :td_attrs: Any extra attributes you wish to be applied to ``<td>`` elements.
            :readonly: If ``true`` any automatically-created form elements (e.g. checkboxes) in the table will be marked as disabled (read-only).

        Examples::

            >>> var mydata = [
                ["John", "Smith", true],
                ["Jane", "Austin", false]
            ];
            >>> var settings = {
                'id': "example",
                'header': ["First Name", "Last Name", "Marital Status"]
            };
            >>> var mytable = GateOne.Visual.table(settings, mydata);

        The above example would result in HTML looking like this:

        .. code-block:: html

            <table id="go_default_example" class="✈table">
                <thead class="✈table_head">
                <tr class="✈table_row">
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Marital Status</th>
                </tr>
                </thead>

                <tbody class="✈table_body">
                <tr class="✈table_row" data-index="0">
                    <td class="✈table_cell" data-column="First Name">John</td>
                    <td class="✈table_cell" data-column="Last Name">Doe</td>
                    <td class="✈table_cell" data-column="Marital Status"><input type="checkbox" name="marital-status" checked></td>
                </tr>

                <tr class="✈table_row" data-index="1">
                    <td class="✈table_cell" data-column="First Name">Jane</td>
                    <td class="✈table_cell" data-column="Last Name">Austin</td>
                    <td class="✈table_cell" data-column="Marital Status"><input type="checkbox" name="marital-status"></td>
                </tr>
                </tbody>
            </table>

        .. note:: All 'id' attributes will be prefixed with `GateOne.Prefs.prefix`.

        .. note:: In order to facilitate theming all tables, rows, and cells will be assigned the '✈table', '✈table_row' and '✈table_cell' classes, respectively.

        Tables can be created using two-way data binding if you provide a function instead of an Array as ``settings['data']``.  It works like this:

            * The function will be called to populate the initial table.
            * The function will be attached to the `go:table:<table id>:render` event.  To update the table with the latest data simply trigger it: `GateOne.Events.trigger('go:table:<table id>:render')`.  Any extra arguments supplied will be passed to the attached function.
            * Appropriate (DOM) event hadlers will be attached to each element of the table that trigger the `go:table:<table id>:interact` event.  The element and the event object will be passed as the only arguments.

        So if a user clicks on a cell in the table the `go:table:<table id>` event will be fired three times:  Once with the table, once with the row, and once with the cell; each with their respective DOM event objects as the second argument.

        If you make a change to your data you simply need to call `GateOne.Events.trigger('go:table:<table id>:render')` and your bound function will be called and the table updated automatically.

        As an alternative to providing a simple Array of Arrays of strings as the table data, an Array of Objects may be used instead.  Here's an example demonstrating the format::

            >>> var mydata = [
                [{'content': "John", 'class': "firstname", 'data-alternatives': "Jon, Jonathan"}, {'content': "Doe", 'class': "lastname"}, true],
                [{'content': "Jane", 'class': "firstname"}, {'content': "Austin", 'class': "lastname"}, false]
            ]
            >>> var settings = {
                'id': "example2",
                'header': ["First Name", "Last Name", "Marital Status"],
                'table_attrs': {'class': '✈my_table'}
            };
            >>> var mytable = GateOne.Visual.table(settings, mydata);

        The format above would generate HTML that looks like this:

        .. code-block:: html

            <table id="go_default_example2" class="✈table ✈my_table">
                <thead class="✈table_head">
                <tr class="✈table_row">
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Marital Status</th>
                </tr>
                </thead>

                <tbody class="✈table_body">
                <tr class="✈table_row" data-index="0">
                    <td class="✈table_cell firstname" data-column="First Name" data-alternatives="Jon, Jonathan">John</td>
                    <td class="✈table_cell lastname" data-column="Last Name">Doe</td>
                    <td class="✈table_cell" data-column="Marital Status"><input type="checkbox" name="marital-status" checked></td>
                </tr>

                <tr class="✈table_row" data-index="1">
                    <td class="✈table_cell firstname" data-column="First Name">Jane</td>
                    <td class="✈table_cell lastname" data-column="Last Name">Austin</td>
                    <td class="✈table_cell" data-column="Marital Status"><input type="checkbox" name="marital-status"></td>
                </tr>
                </tbody>
            </table>

        Any extra attributes assigned to each cell's object will be passed to the second argument of :js:meth:`GateOne.Utils.createElement`.  The only exception being the "content" attribute which will be used inside the cell.

        .. note:: If you're using the object notation for cells you *must* include a "content" attribute.
        */
        if (!settings['id']) {
            logError(gettext("GateOne.Visual.table(): You must pass in settings['id'] to this function."));
            return
        }
        var prefix = go.prefs.prefix,
            u = go.Utils,
            E = go.Events,
            v = go.Visual,
            existing = u.getNode('#'+prefix+settings['id']),
            table, thead, tbody, tr, th, td, datafunc,
            count = 0,
            prependClass = function(attrs, _class) {
                // This just makes sure that _class is in attrs (and it's first if not already present)
                if ('class' in attrs) {
                    if (attrs['class'].indexOf(_class) == -1) {
                        // Prepend the missing class (e.g. '✈table')
                        attrs['class'] = _class + ' ' + attrs['class'];
                    }
                } else {
                    attrs['class'] = _class;
                }
            };
        datafunc = data;
        if (u.isFunction(data)) {
            data = data();
        }
        if (settings["table_attrs"]) {
            prependClass(settings["table_attrs"], '✈table');
        } else {
            settings["table_attrs"] = {'class': '✈table'};
        }
        if (existing) {
            // Empty it out because we'll be replacing it with all new stuff (in two operations:  First the thead then then the tbody)
            existing.innerHTML = '';
        }
        table = existing || u.createElement('table', settings["table_attrs"]);
        // Attach our data update func to the appropriate event
        if (!("go:table:"+settings['id']+":render" in E.callbacks)) {
            E.on("go:table:"+settings['id']+":render", u.partial(v.table, settings, datafunc, table));
        }
        if (settings['id']) {
            table.id = prefix+settings['id'];
        }
        if (settings["thead_attrs"]) {
            prependClass(settings["thead_attrs"], '✈table_head');
        } else {
            settings["thead_attrs"] = {'class': '✈table_head'};
        }
        thead = u.createElement('thead', settings["thead_attrs"]);
        if (settings["tbody_attrs"]) {
            prependClass(settings["tbody_attrs"], '✈table_body');
        } else {
            settings["tbody_attrs"] = {'class': '✈table_body'};
        }
        tbody = u.createElement('tbody', settings["tbody_attrs"]);
        if (settings["th_attrs"]) {
            prependClass(settings["th_attrs"], '✈table_th');
        } else {
            settings["th_attrs"] = {'class': '✈table_th'};
        }
        th = u.partial(u.createElement, 'th', settings["th_attrs"]);
        if (settings["tr_attrs"]) {
            prependClass(settings["tr_attrs"], '✈table_row');
        } else {
            settings["tr_attrs"] = {'class': '✈table_row'};
        }
        tr = u.partial(u.createElement, 'tr', settings["tr_attrs"]);
        if (settings["td_attrs"]) {
            prependClass(settings["td_attrs"], '✈table_cell');
        } else {
            settings["td_attrs"] = {'class': '✈table_cell'};
        }
        td = u.partial(u.createElement, 'td', settings["td_attrs"]);
        // Add the header
        if (settings['header']) {
            var thead_tr = u.createElement('tr', settings["tr_attrs"]);
            settings['header'].forEach(function(name) {
                var th_cell = th();
                th_cell.innerHTML = name;
                thead_tr.appendChild(th_cell);
            });
            thead.appendChild(thead_tr);
        }
        data.forEach(function(row) {
            var table_row = tr(),
                valcount = 0;
            table_row.setAttribute('data-index', count);
            row.forEach(function(val) {
                var table_cell = td();
                if (u.isBool(val)) {
                    // Make a checkbox for true/false values
                    var checkbox = u.createElement('input', {'type': 'checkbox'});
                    checkbox.disabled = settings['readonly'] || false;
                    checkbox.checked = val;
                    table_cell.appendChild(checkbox);
                } else if (val['content']) {
                    // This is an object (as opposed to just a string or bool); treat it appropriately
                    var contentNode;
                    if (!u.isString(val['content'])) {
                        // Remove it temporarily
                        contentNode = val['content'];
                        delete val['content'];
                    }
                    if (val["class"]) {
                        prependClass(val, '✈table_cell');
                    } else {
                        val["class"] = '✈table_cell';
                    }
                    // Replace the table_cell we just created with a new one that uses the given attributes:
                    table_cell = u.createElement('td', val);
                    // Remove the 'content' attribute before we place it in the DOM:
                    table_cell.removeAttribute('content');
                    // Add the content node back if necessary
                    if (contentNode) {
                        val['content'] = contentNode;
                    }
                    if (u.isString(val['content'])) {
                        table_cell.innerHTML = val['content'];
                    } else {
                        // A DOM node; handle it appropriately
                        table_cell.appendChild(val['content']);
                    }
                } else {
                    if (u.isString(val)) {
                        table_cell.innerHTML = val;
                    } else {
                        // Assume a DOM node; handle it appropriately
                        table_cell.appendChild(val);
                    }
                }
                // Add the data-column attribute
                if (settings['header']) {
                    table_cell.setAttribute('data-column', settings["header"][valcount]);
                }
                table_row.appendChild(table_cell);
                valcount += 1;
            });
            tbody.appendChild(table_row);
            count += 1;
        });
        // Do these last to cut down on DOM reflows
        table.appendChild(thead);
        table.appendChild(tbody);
        return table;
    }
    // NOTE: Below is a work in progress.  Not used by anything yet.
//     fitWindow: function(elem, parent) {
//         // Scales the given *elem* to fit within the given *parent*.
//         // If rows/cols are not set it will simply move all terminals to the top of the view so that the scrollback stays hidden while screen updates are happening.
//         var termPre = GateOne.Terminal.terminals[term].node,
//             screenSpan = GateOne.Terminal.terminals[term].screenNode;
//         if (GateOne.prefs.rows) { // If someone explicitly set rows/cols, scale the term to fit the screen
//             var nodeHeight = screenSpan.offsetHeight;
//             if (nodeHeight < document.documentElement.clientHeight) { // Grow to fit
//                 var scale = document.documentElement.clientHeight / (document.documentElement.clientHeight - nodeHeight),
//                     transform = "scale(" + scale + ", " + scale + ")";
//                 GateOne.Visual.applyTransform(termPre, transform);
//             } else if (nodeHeight > document.documentElement.clientHeight) { // Shrink to fit
//
//             }
//         }
//     }
});

})(window);
