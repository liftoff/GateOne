// A Web Worker for processing incoming text
var consoleLog = [],
    SCREEN = [];
var log = function(msg) {
    // Appends msg to a global consoleLog variable which will be handled by the caller
    consoleLog.push(msg);
}
var transformText = function(text, pattern, newString) {
    // Given *text*, find all strings matching *pattern* and turn them into clickable links using *newString*
    // If *pattern* is not provided, simply transforms URLs into clickable links.
    // Here's an example of replacing hypothetical ticket numbers with clickable links:
    //      transformText("Please see ticket IM123456789", /(\bIM\d{9,10}\b)/g, "<a href='https://support.company.com/tracker?ticket=$1' target='new'>$1</a>")
    if (!pattern) {
        pattern = /(\b(https?|web+ssh|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])(?!.*a\>)/ig;
    }
    if (!newString) {
        newString = "<a href='$1' target='new'>$1</a>";
    }
    return text.replace(pattern, newString);
};
var processLines = function(lines, textTransforms) {
    var output = []
    for (var i=0; i < lines.length; i++) {
        var line = lines[i];
        if (line == null) {
            output[i] = ""; // An empty string will do (emulates unchanged)
        } else if (line.length) {
            // Trim trailing whitespace only if the line isn't just full of whitespace
            var trimmedLine = line.replace(/\s+$/g, "");
            if (!trimmedLine.length) {
                // Need a space here so the browser gives the block some height
                trimmedLine = " ";
                // NOTE:  There's logic in terminal.js to ensure trailing whitespace gets removed when copying text from a terminal
            }
            line = trimmedLine;
            output[i] = line;
        } else {
            // Line is unchanged
            output[i] = '';
        }
    }
    outText = output.join('\n')
    // Linkify and transform the text inside the screen before we push it
    for (var trans in textTransforms) {
        // Have to convert the regex to a string and use eval since Firefox can't seem to pass regexp objects to Web Workers.
        var name = textTransforms[trans]['name'],
            pattern = textTransforms[trans]['pattern'],
            newString = textTransforms[trans]['newString'];
        try {
            pattern = eval(pattern);
        } catch(e) {
            // A SyntaxError likely means this is a function
            if (e instanceof SyntaxError) {
                try {
                    pattern = Function("return " + pattern)();
                } catch(e) {
                    log("Error transforming text inside of the term_ww.js Worker: " + e + ", name: " + name + ", pattern: '" + pattern + "'");
                }
            }
        }
        if (typeof(pattern) == "function") {
            outText = pattern(outText);
        } else {
            outText = transformText(outText, pattern, newString);
        }
    }
    output = transformText(outText).split('\n'); // Convert links to anchor tags and convert back to an array
    return output;
}
var processScreen = function(scrollback, termUpdateObj, prefs, textTransforms, checkBackspace) {
    // Do all the necessary client-side processing of the terminal screen and scrollback buffer.  The idea being that a web worker doing this stuff should make Gate One more responsive (at the client).
    // scrollback: go.terminals[term]['scrollback']
    // termUpdateObj: The object containing the terminal screen/scrollback provided by the server
    // termTitle: u.getNode('#' + go.prefs.prefix + 'term' + term).title (since we can't query the DOM from within a Worker)
    // prefs: GateOne.prefs
    // textTransforms: Textual transformations that will be passed to transformText(),
    // checkBackspace: null or the current value of the backspace key (if we're to check it).
    var term = termUpdateObj['term'],
        screen = [],
        incoming_scrollback = termUpdateObj['scrollback'],
        rateLimiter = termUpdateObj['ratelimiter'],
        backspace = "",
        outputObj = {'term': term};
    if (!scrollback.length) {
        scrollback = [];
    }
    if (incoming_scrollback.length) {
        // Process the scrollback buffer before we concatenate it
        incoming_scrollback = processLines(incoming_scrollback, textTransforms);
        scrollback = scrollback.concat(incoming_scrollback);
    }
    // Now trim the array to match the go.prefs['scrollback'] setting
    if (scrollback.length > prefs.scrollback) {
        scrollback.reverse();
        scrollback.length = prefs.scrollback; // I love that Array().length isn't just a read-only value =)
        scrollback.reverse(); // Put it back in the proper order
    }
    if (checkBackspace) {
        // Find the first non-empty line and check for ^H and ^? then return the opposite value
        for (var i=0; i < termUpdateObj['screen'].length; i++) {
            if (termUpdateObj['screen'][i].length) {
                if (termUpdateObj['screen'][i].indexOf('<span class="✈cursor">') != -1) { // Only care about lines that have the cursor in them
                    var beforeCursor = termUpdateObj['screen'][i].split('<span class="✈cursor">')[0];
                    if (beforeCursor.substr(beforeCursor.length - 2) == '^H') {
                        if (checkBackspace != String.fromCharCode(127)) {
                            backspace = String.fromCharCode(127); // Switch to ^H
                        }
                    } else if (beforeCursor.substr(beforeCursor.length - 2) == '^?') {
                        if (checkBackspace != String.fromCharCode(8)) {
                            backspace = String.fromCharCode(8); // Switch to ^?
                        }
                    }
                }
            }
        }
    }
    for (var i=0; i<scrollback.length; i++) {
        if (scrollback[i].indexOf("<span") != 0) {
            scrollback[i] = '<span class="✈sbline">' + scrollback[i] + '</span>';
        }
    }
    textTransforms['contenteditable cursor'] = {
        'name': 'contentenditable cursor',
        'pattern': '/\<span class="✈cursor"\>/g',
        'newString': '<span id="term'+term+'cursor" class="✈cursor">'
    };
    // Assemble the entire screen from what the server sent us (lines that haven't changed get sent as null)
    screen = processLines(termUpdateObj['screen'], textTransforms);
    outputObj['screen'] = screen;
    outputObj['scrollback'] = scrollback;
    outputObj['backspace'] = backspace;
    outputObj['log'] = consoleLog.join('\n');
    return outputObj
}
self.addEventListener('message', function(e) {
    var data = e.data,
        term = data.term,
        cmds = data.cmds,
        text = data.text,
        scrollback = data.scrollback,
        checkBackspace = data.checkBackspace,
        termUpdateObj = data.termUpdateObj,
        prefs= data.prefs,
        textTransforms = data.textTransforms,
        result;
    if (cmds) {
        cmds.forEach(function(cmd) {
            switch (cmd) {
                case 'transformText':
                    // Linkify links before anything else so we don't clobber any follow-up linkification
                    text = transformText(text);
                    if (textTransforms) {
                        for (var trans in textTransforms) {
                            // Have to convert the regex to a string and use eval since Firefox can't seem to pass regexp objects to Web Workers.
                            var pattern = eval(textTransforms[trans]['pattern']),
                                newString = textTransforms[trans]['newString'];
                            text = transformText(text, pattern, newString);
                        }
                    }
                    break;
                case 'processScreen':
                    result = processScreen(scrollback, termUpdateObj, prefs, textTransforms, checkBackspace);
                    break;
                default:
                    self.postMessage('Unknown command: ' + cmds);
                    break
            };
        });
        if (text) {
            self.postMessage({'text': text, 'term': term, 'log': consoleLog.join('\n')});
        } else if (result) {
            self.postMessage(result);
        }
        result = null;
        consoleLog = []; // Reset
    }
}, false);

//# sourceURL=/terminal/static/webworkers/term_ww.js
