(function(window, undefined) {
"use strict";

// This JavaScript consists of some lesser-used utility functions that were moved out of the main gateone.js in order to save space.

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

// Add some extra utility functions to GateOne.Utils
GateOne.Base.update(GateOne.Utils, {
    itemgetter: function(name) {
        /**:GateOne.Utils.itemgetter(name)

        Copied from `MochiKit.Base.itemgetter <http://mochi.github.com/mochikit/doc/html/MochiKit/Base.html#fn-itemgetter>`_.  Returns a ``function(obj)`` that returns ``obj[name]``.

        :param value name: The value that will be used as the key when the returned function is called to retrieve an item.
        :returns: A function.

        To better understand what this function does it is probably best to simply provide the code:

        .. code-block:: javascript

            var itemgetter = function (name) {
                return function (arg) {
                    return arg[name];
                }
            }

        Here's an example of how to use it:

            >>> var object1 = {};
            >>> var object2 = {};
            >>> object1.someNumber = 12;
            >>> object2.someNumber = 37;
            >>> var numberGetter = GateOne.Utils.itemgetter("someNumber");
            >>> numberGetter(object1);
            12
            >>> numberGetter(object2);
            37

        .. note:: Yes, it can be confusing.  Especially when thinking up use cases but it actually is incredibly useful when the need arises!
        */
        return function (arg) {
            return arg[name];
        };
    },
    isBool: function(obj) {
        /**:GateOne.Utils.isBool(obj)

        Returns ``true`` if *obj* is a Boolean value.
        */
        if (typeof obj == typeof true) {
            return true;
        }
        return false;
    },
    isFunction: function(obj) {
        /**:GateOne.Utils.isFunction(obj)

        Returns ``true`` if *obj* is a function.
        */
        var getType = {};
        return obj && getType.toString.call(obj) === '[object Function]';
    },
    isString: function(obj) {
        /**:GateOne.Utils.isString(obj)

        Returns ``true`` if *obj* is a string.
        */
        if (obj.substring) {
            return true;
        }
        return false;
    },
    getOffset: function(elem) {
        /**:GateOne.Utils.getOffset(elem)

        :returns: An object representing ``elem.offsetTop`` and ``elem.offsetLeft``.

        Example:

            >>> GateOne.Utils.getOffset(someNode);
            {"top":130, "left":50}
        */
        var node = GateOne.Utils.getNode(elem), x = 0, y = 0;
        while( node && !isNaN( node.offsetLeft ) && !isNaN( node.offsetTop ) ) {
            x += node.offsetLeft - node.scrollLeft;
            y += node.offsetTop - node.scrollTop;
            node = node.offsetParent;
        }
        return { top: y, left: x };
    },
    scrollLines: function(elem, lines) {
        /**:GateOne.Utils.scrollLines(elem, lines)

        Scrolls the given element (*elem*) by the number given in *lines*.  It will automatically determine the line height using :js:func:`~GateOne.Utils.getEmDimensions`.  *lines* can be a positive or negative integer (to scroll down or up, respectively).

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
        :param number lines: The number of lines to scroll *elem* by.  Can be positive or negative.

        Example:

            >>> GateOne.Utils.scrollLines('#go_term1_pre', -3);

        .. note:: There must be a scrollbar visible (and ``overflow-y = "auto"`` or equivalent) for this to work.
        */
        // Lines are calculated based on the EM height of text in the element.
        logDebug('scrollLines(' + elem + ', ' + lines + ')');
        var node = go.Utils.getNode(elem),
            emDimensions = go.Utils.getEmDimensions(elem),
            negative = (lines < 0),
            absoluteVal = Math.abs(lines),
            fullPage = emDimensions.h * absoluteVal,
            scrollTop = node.scrollTop;
        if (go.Utils.scrollTopTemp) {
            scrollTop = go.Utils.scrollTopTemp;
        }
        if (negative) {
            node.scrollTop = scrollTop - fullPage;
        } else {
            node.scrollTop = scrollTop + fullPage;
        }
        go.Utils.scrollTopTemp = node.scrollTop;
    },
    scrollToBottom: function(elem) {
        /**:GateOne.Utils.scrollToBottom(elem)

        Scrolls the given element (*elem*) to the very bottom (all the way down).

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.

        Example:

            >>> GateOne.Utils.scrollToBottom('#'+GateOne.prefs.prefix+'term1_pre');
        */
        var node = GateOne.Utils.getNode(elem);
        if (node) {
            if (node.scrollTop != node.scrollHeight) {
                node.scrollTop = node.scrollHeight;
            }
        }
    },
    prevEmDimensions: {'w': 7, 'h': 14}, // Used if something goes wrong doing the calculation.  These are just reasonable defaults that will be overwritten
    getEmDimensions: function(elem, /*opt*/where) {
        /**:GateOne.Utils.getEmDimensions(elem[, where])

        Returns the height and width of 1em inside the given elem (e.g. '#term1_pre').  The returned object will be in the form of:

        .. code-block:: javascript

            {'w': <width in px>, 'h': <height in px>}

        If *where* (element) is given, the EM dimensions calculation will be based on what sizes would apply if the given *elem* were placed inside *where*.

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
        :param where: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
        :returns: An object containing the width and height as obj.w and obj.h.

        Example:

            >>> GateOne.Utils.getEmDimensions('#gateone');
            {'w': 8, 'h': 15}
        */
//         logDebug('getEmDimensions('+elem+', id: '+elem.id+')');
        var node = u.getNode(elem).cloneNode(false), // Work on a clone so we can leave the original alone
            sizingPre = document.createElement("pre"),
            fillerX = '', fillerY = [],
            lineCounter = 0;
        if (!node.style) { // This can happen if the user clicks back and forth really quickly in the middle of running this function
            return u.prevEmDimensions;
        }
        try {
            // We need to place the cloned node into the DOM for the calculation to work properly
            node.id = 'sizingNode';
            if (where) {
                where = u.getNode(where);
                where.appendChild(node);
            } else {
                document.body.appendChild(node);
            }
            if (!u.isVisible(node)) {
                // Reset so it is visible
                node.style.display = '';
                node.style.opacity = 1;
            }
            node.className = "✈noanimate ✈terminal";
            // We need a number of lines so we can factor in the line height and character spacing (if it has been messed with either directly or indirectly via the font renderer).
            for (var i=0; i <= 1023; i++) {
                fillerX += "M";
            }
            fillerY.push(fillerX);
            for (var i=0; i <= 255; i++) {
                fillerY.push(fillerX);
            }
            sizingPre.className = '✈terminal_pre';
            sizingPre.innerHTML = fillerY.join('\n');
            // Set the attributes of our copy to reflect a minimal-size block element
            node.style.position = 'fixed';
            node.style.top = 0;
            node.style.left = 0;
            node.style.bottom = 'auto';
            node.style.right = 'auto';
            node.style.width = 'auto';
            node.style.height = 'auto';
            node.style.display = 'block';
            sizingPre.style.position = 'absolute';
            sizingPre.style.top = 0;
            sizingPre.style.left = 0;
            sizingPre.style.bottom = 'auto';
            sizingPre.style.right = 'auto';
            sizingPre.style.width = 'auto';
            sizingPre.style.height = 'auto';
            sizingPre.style.display = 'block';
            sizingPre.style['white-space'] = 'pre'; // Without this the size calculation will be off
            sizingPre.style['word-wrap'] = 'normal';
            // Add in our sizingDiv and grab its height
            node.appendChild(sizingPre);
            var nodeHeight = sizingPre.scrollHeight,
                nodeWidth = sizingPre.scrollWidth;
            nodeHeight = parseInt(nodeHeight)/256;
            nodeWidth = parseInt(nodeWidth)/1024;
            // Clean up, clean up
            node.removeChild(sizingPre);
            if (where) {
                where.removeChild(node);
            } else {
                document.body.removeChild(node);
            }
            u.prevEmDimensions = {'w': nodeWidth, 'h': nodeHeight};
        } catch(e) {
            logDebug(gettext("Error getting em dimensions (probably just a hidden terminal): ") + e);
            // Cleanup
            if (where) {
                where.removeChild(node);
            } else {
                document.body.removeChild(node);
            }
        }
        return u.prevEmDimensions;
    },
    getRowsAndColumns: function(elem, /*opt*/where) {
        /**:GateOne.Utils.getRowsAndColumns(elem[, where])

        Calculates and returns the number of text rows and colunmns that will fit in the given element (*elem*) as an object like so:

        .. code-block:: javascript

            {'cols': 165, 'rows': 45}

        :param elem: A `querySelector <https://developer.mozilla.org/en-US/docs/DOM/Document.querySelector>`_ string like ``#some_element_id`` or a DOM node.
        :param where: An optional location to please a cloned node of the given *elem* before performing calculations.
        :returns: An object with obj.cols and obj.rows representing the maximum number of columns and rows of text that will fit inside *elem*.

        .. warning:: *elem* must be a basic block element such as DIV, SPAN, P, PRE, etc.  Elements that require sub-elements such as TABLE (requires TRs and TDs) probably won't work.

        .. note::  This function only works properly with monospaced fonts but it does work with high-resolution displays (so users with properly-configured high-DPI displays will be happy =).  Other similar functions I've found on the web had hard-coded pixel widths for known fonts at certain point sizes.  These break on any display with a resolution higher than 96dpi.

        Example:

            >>> GateOne.Utils.getRowsAndColumns('#gateone');
            {'cols': 165, 'rows': 45}
        */
//         logDebug('getRowsAndColumns('+elem+')');
        where = where || go.node;
        var u = go.Utils,
            node = u.getNode(elem),
            elementDimensions = {
                h: node.clientHeight,
                w: node.clientWidth
            },
            textDimensions = u.getEmDimensions(elem, where);
        if (!u.isVisible(node)) {
            node = node.cloneNode(false); // Work on a clone so we can leave the original alone
            // Reset so it is visible
            node.style.display = '';
            node.style.opacity = 1;
            where.appendChild(node, true);
            elementDimensions = {
                h: node.clientHeight,
                w: node.clientWidth
            };
            textDimensions = u.getEmDimensions(elem, where);
            where.removeChild(node);
        }
        if (!textDimensions) {
            return; // Nothing to do
        }
        // Calculate the rows and columns:
        var rows = (elementDimensions.h / textDimensions.h),
            cols = (elementDimensions.w / textDimensions.w);
        var dimensionsObj = {'rows': rows, 'columns': cols};
        return dimensionsObj;
    },
    replaceURLWithHTMLLinks: function(text) {
        /**:GateOne.Utils.replaceURLWithHTMLLinks(text)

        :returns: *text* with URLs transformed into links.

        Turns textual URLs like 'http://whatever.com/' into links.

        :param string text: Any text with or without links in it (no URLs == no changes)

        Example:

            >>> GateOne.Utils.replaceURLWithHTMLLinks('Downloading http://foo.bar.com/some/file.zip');
            "Downloading <a href='http://foo.bar.com/some/file.zip'>http://foo.bar.com/some/file.zip</a>"
        */
        var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(exp,"<a href='$1'>$1</a>");
    },
    isDescendant: function(parent, child) {
        /**:GateOne.Utils.isDescendant(parent, child)

        Returns true if *child* is a descendent of *parent* (in the DOM).

        :param node parent: A DOM node.
        :param node child: A DOM node.
        :returns: true/false

        Example:

            >>> GateOne.Utils.isDescendant(go.node, pastearea);
            true
            >>> GateOne.Utils.isDescendant(go.node, document.body);
            false
        */
        var node = child.parentNode;
        while (node != null) {
            if (node == parent) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    },
    // Thanks to Paul Sowden (http://www.alistapart.com/authors/s/paulsowden) at A List Apart for this function.
    // See: http://www.alistapart.com/articles/alternate/
    setActiveStyleSheet: function(title) {
        /**:GateOne.Utils.setActiveStyleSheet(title)

        Sets the stylesheet matching *title* to be active.

        Thanks to `Paul Sowden <http://www.alistapart.com/authors/s/paulsowden>`_ at `A List Apart <http://www.alistapart.com/>`_ for this function.
        See: http://www.alistapart.com/articles/alternate/ for a great article on how to control active/alternate stylesheets in JavaScript.

        :param string title: The title of the stylesheet to set active.

        Example:

            >>> GateOne.Utils.setActiveStyleSheet("myplugin_stylesheet");
        */
        var i, a, main;
        for (var i=0; (a = document.getElementsByTagName("link")[i]); i++) {
            if (a.getAttribute("rel").indexOf("style") != -1 && a.getAttribute("title")) {
                a.disabled = true;
                if (a.getAttribute("title") == title) a.disabled = false;
            }
        }
    },
    loadCSS: function(url, id){
        /**:GateOne.Utils.loadCSS(url, id)

        Loads and applies the CSS at *url*.  When the ``<link>`` element is created it will use *id* like so:

        .. code-block:: javascript

            {'id': GateOne.prefs.prefix + id}

        :param string url: The URL path to the style sheet.
        :param string id: The 'id' that will be applied to the ``<link>`` element when it is created.

        .. note:: If an existing ``<link>`` element already exists with the same *id* it will be overridden.

        Example:

        .. code-block:: javascript

            GateOne.Utils.loadCSS("static/css/some_app.css", "some_app_css");
        */
        if (!id) {
            id = 'css_file';
        }
        var u = go.Utils,
            prefix = go.prefs.prefix,
            goURL = go.prefs.url,
            container = go.prefs.goDiv.split('#')[1],
            cssNode = u.createElement('link', {'id': prefix+id, 'type': 'text/css', 'rel': 'stylesheet', 'href': url, 'media': 'screen'}),
            styleNode = u.createElement('style', {'id': prefix+id}),
            existing = u.getNode('#'+prefix+id);
        if (existing) {
            u.removeElement(existing);
        }
        var themeCSS = u.getNode('#'+prefix+'go_css_theme'); // Theme should always be last so it can override defaults and plugins
        if (themeCSS) {
            u.getNode("head").insertBefore(cssNode, themeCSS);
        } else {
            u.getNode("head").appendChild(cssNode);
        }
    },
    loadScriptError: function(scriptTag, url, callback) {
        /**:GateOne.Utils.loadScriptError(url, scriptTag, callback)

        Called when :js:meth:`GateOne.Utils.loadScript` fails to load the .js file at the given *url*.  Under the assumption that the user has yet to accept the Gate One server's SSL certificate, it will pop-up an alert that instructs the user they will be redirected to a page where they can accept Gate One's SSL certificate (when they click OK).
        */
        var u = go.Utils,
            acceptURL = go.prefs.url + 'static/accept_certificate.html',
            okCallback = function() {
                // Called when the user clicks OK
                u.acceptWindow = window.open(acceptURL, 'accept');
                u.windowChecker = setInterval(function() {
                    if (u.acceptWindow.closed) {
                        // Re-proceed
                        u.removeElement(scriptTag);
                        u.loadScript(url, callback);
                        clearInterval(u.windowChecker);
                    }
                }, 100);
            };
        // Redirect the user to a page where they can accept the SSL certificate (it will redirect back)
        GateOne.Visual.alert(gettext("JavaScript Load Error"), gettext("This can happen if you haven't accepted Gate One's SSL certificate yet.  Click OK to open a new tab/window where you can accept the Gate One server's SSL certificate.  If the page doesn't load it means the Gate One server is currently unavailable."), okCallback);
    },
    loadScript: function(url, callback){
        /**:GateOne.Utils.loadScript(url[, callback])

        Loads the JavaScript (.js) file at *URL* and appends it to `document.body <https://developer.mozilla.org/en/DOM/document.body>`_.  If *callback* is given, it will be called after the script has been loaded.

        :param string URL: The URL of a JavaScript file.
        :param function callback:  *Optional:* A function to call after the script has been loaded.

        Example:

        .. code-block:: javascript

            var myfunc = function() { console.log("finished loading whatever.js"); };
            GateOne.Utils.loadScript("https://someserver.com/static/whatever.js", myfunc);
        */
        // Imports the given JS *url*
        // If *callback* is given, it will be called in the onload() event handler for the script
        var u = GateOne.Utils,
            self = this,
            tag = document.createElement("script");
        tag.type="text/javascript";
        tag.src = url;
        if (callback) {
            tag.onload = function() {
                callback();
            };
        }
        document.body.appendChild(tag);
        setTimeout(function() {
            // If the URL doesn't load within 5 seconds assume it is an SSL certificate issue
            u.loadScriptError(tag, url, callback);
        }, 5000);
    },
    isPrime: function(n) {
        /**:GateOne.Utils.isPrime(n)

        Returns true if *n* is a prime number.

        :param number n: The number we're checking to see if it is prime or not.
        :returns: true/false

        Example:

        .. code-block:: javascript

            > GateOne.Utils.isPrime(13);
            true
            > GateOne.Utils.isPrime(14);
            false
        */
        // Copied from http://www.javascripter.net/faq/numberisprime.htm (thanks for making the Internet a better place!)
        if (isNaN(n) || !isFinite(n) || n%1 || n<2) return false;
        var m=Math.sqrt(n);
        for (var i=2; i<=m; i++) if (n%i==0) return false;
        return true;
    },
    randomPrime: function() {
        /**:GateOne.Utils.randomPrime()

        :returns: A random prime number <= 9 digits.

        Example:

        .. code-block:: javascript

            > GateOne.Utils.randomPrime();
            618690239
        */
        // Returns a random prime number <= 9 digits
        var i = 10;
        while (!GateOne.Utils.isPrime(i)) {
            i = Math.floor(Math.random()*1000000000);
        }
        return i;
    },
    // NOTE: getToken() is a work-in-progress and ultimately may not be necessary thanks to the security of the WebSocket.
    // NOTE: The token-based approach prevents an attacker from copying a user's session ID to another host and using it to login but it has the disadvantage of requiring that the user re-login if they reload the page or close their tab.
    // NOTE: If we save the seed in sessionStorage, the user can see it but their session could persist as long as they didn't close the tab (saving them from the reload problem).  This would leave the seeds visible to attackers that had access to the JavaScript console on the client though.  So we would need to change the seeds on a fairly regular basis (say, every minute) to mitigate this.
    getToken: function() {
        // Generates a token using the global, *seed* based on the current date/time that can be used to validate the client
        // NOTE: *seed* must be a 9-digit (or less) integer
        //  In order for this to prevent session hijacking the seed must be re-used every single time and cannot be stored in a way that is easily retrievable from regular web development tools (make the attacker dump memory and find the seed before it expires).
        var time = new Date().getTime(),
            downToTenSecond = Math.round(time/10000);
        // NOTE: On the server we should check forward/backward in time 10 seconds to provide the client with a 30-second window of drift.
        if (!seed1) { // Seeds haven't been defined yet.  Set them.
            seed1 = Math.floor(Math.random()*1000000000);
            seed2 = Math.floor(Math.random()*1000000000);
        }
        var digest = Crypto.MD5(seed1*seed2*downToTenSecond+'');
        return digest.slice(2,11); // Only need a subset of the md5
    },
    rtrim: function(string) {
        /**:GateOne.Utils.rtrim(string)

        Returns *string* minus right-hand whitespace
        */
        return string.replace(/\s+$/,"");
    },
    ltrim: function(string) {
        /**:GateOne.Utils.ltrim(string)

        Returns *string* minus left-hand whitespace
        */
        return string.replace(/^\s+/,"");
    },
    stripHTML: function(html) {
        /**:GateOne.Utils.stripHTML(html)

        Returns the contents of *html* minus the HTML.
        */
        var tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent||tmp.innerText;
    },
    humanReadableBytes: function(bytes, /*opt*/precision) {
        // Returns *bytes* as a human-readable string in a similar fashion to how it would be displayed by 'ls -lh' or 'df -h'.
        // If *precision* (integer) is given, it will be used to determine the number of decimal points to use when rounding.  Otherwise it will default to 0
        var sizes = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'],
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
    },
    last: function(iterable, n, guard) {
        /**:GateOne.Utils.last(iterable, n, guard)

        Returns the last element of the given *iterable*.

        If *n* is given it will return the last N values in the array.  Example:

            >>> GateOne.Utils.last("foobar", 3);
            ["b", "a", "r"]

        .. note:: The *guard* variable is there so it will work with :js:meth:`Array.prototype.map`.
        */
        if (iterable == null) return void 0;
        if ((n != null) && !guard) {
            return Array.prototype.slice.call(iterable, Math.max(iterable.length - n, 0));
        } else {
            return iterable.slice(-1)[0];
        }
    },
    capitalizeFirstLetter: function(string) {
        /**:GateOne.Utils.capitalizeFirstLetter(string)

        Returns *string* with the first letter capitalized.
        */
        return string.charAt(0).toUpperCase() + string.slice(1);
    },
    Interval: function(fn, time) {
        /**:GateOne.Utils.Interval(fn, time)

        Returns an instance of an `Interval` object which is a slightly more intelligent way to handle interval-based callbacks than JavaScript's built-in `setInterval()` and `clearInterval()`.  Example usage:

            >>> var clockUpdater = GateOne.Utils.Interval(updateFunc, 1000); // Start the Interval
            >>> clockUpdater.start();
            >>> // Some time goes by...
            >>> clockUpdater.isRunning();
            true
            >>> clockUpdater.stop();
            >>> clockUpdater.isRunning();
            false
        */
        if (!(this instanceof Interval)) {return new Interval();}
        var self = this; // Explicit is better than implicit
        self.timer = false;
        self.start = function () {
            if (!self.isRunning()) { timer = setInterval(fn, time); }
        };
        self.stop = function () {
            clearInterval(timer);
            timer = false;
        };
        self.isRunning = function () {
            return timer !== false;
        };
    }
});

})(window);
