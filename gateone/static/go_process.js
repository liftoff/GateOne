// A Web Worker for processing incoming text
var consoleLog = [],
    SCREEN = [];
var log = function(msg) {
    // Appends msg to a global consoleLog variable which will be handled by the caller
    consoleLog.push(msg);
}
var linkify = function(text, pattern, newString) {
    // Given *text*, find all strings matching *pattern* and turn them into clickable links using *newString*
    // If *pattern* or *baseURL* are not provided, simply transforms URLs into clickable links.
    // Here's an example of replacing hypothetical ticket numbers with clickable links:
    //      linkify("Please see ticket IM123456789", /(\bIM\d{9,10}\b)/g, "<a href='https://support.company.com/tracker?ticket=$1' target='new'>$1</a>")
    if (!pattern) {
        pattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    }
    if (!newString) {
        newString = "<a href='$1' target='new'>$1</a>";
    }
    return text.replace(pattern, newString);
};
var processScreen = function(scrollback, termUpdateObj, prevScrollback, prefs, textTransforms) {
    // Do all the necessary client-side processing of the terminal screen and scrollback buffer.  The idea being that a web worker doing this stuff should make Gate One more responsive (at the client).
    // scrollback: go.terminals[term]['scrollback']
    // termUpdateObj: The object containing the terminal screen/scrollback provided by the server
    // prevScrollback: localStorage['scrollback' + term]
    // termTitle: u.getNode('#' + go.prefs.prefix + 'term' + term).title (since we can't query the DOM from within a Worker)
    // prefs: GateOne.prefs
    // textTransforms: Textual transformations that will be passed to linkify()
    var count = 0,
        term = termUpdateObj['term'],
        screen = [],
        incoming_scrollback = termUpdateObj['scrollback'],
        rateLimiter = termUpdateObj['ratelimiter'],
        outputObj = {'term': term},
        screen_html = '',
        scrollback_html = '';
    // If there's no scrollback buffer, try filling it with what was preserved in localStorage
    if (!scrollback.length) {
        if (prevScrollback) {
            scrollback = prevScrollback.split('\n');
        } else {
            scrollback = [];
        }
    }
    if (incoming_scrollback.length) {
        scrollback = scrollback.concat(incoming_scrollback);
    }
    // Now trim the array to match the go.prefs['scrollback'] setting
    if (scrollback.length > prefs.scrollback) {
        scrollback.reverse();
        scrollback.length = prefs.scrollback; // I love that Array().length isn't just a read-only value =)
        scrollback.reverse(); // Put it back in the proper order
    }
    // Assemble the entire screen from what the server sent us (lines that haven't changed get sent as null)
    for (var i=0; i < termUpdateObj['screen'].length; i++) {
        var line = termUpdateObj['screen'][i];
        if (line == null) {
            screen[i] = ""; // An empty string will do (emulates unchanged)
        } else if (line.length) {
            // Linkify and transform the text inside the screen before we push it
            line = linkify(line);
            for (var trans in textTransforms) {
                // Have to convert the regex to a string and use eval since Firefox can't seem to pass regexp objects to Web Workers.
                var pattern = eval(textTransforms[trans]['pattern']),
                    newString = textTransforms[trans]['newString'];
                line = linkify(line, pattern, newString);
            }
            screen[i] = line;
        } else {
            // Line is unchanged
            screen[i] = '';
        }
    }
//     for (var i=0; i < termUpdateObj['screen'].length; i++) {
//         var line = termUpdateObj['screen'][i];
//         if (line == null) {
//             SCREEN[i] = ""; // An empty string will do (emulates unchanged)
//         } else if (line.length) {
//             // Linkify and transform the text inside the screen before we push it
//             line = linkify(line);
//             for (var trans in textTransforms) {
//                 // Have to convert the regex to a string and use eval since Firefox can't seem to pass regexp objects to Web Workers.
//                 var pattern = eval(textTransforms[trans]['pattern']),
//                     newString = textTransforms[trans]['newString'];
//                 line = linkify(line, pattern, newString);
//             }
//             SCREEN[i] = line;
//         } /*else {*/
//             // Line is unchanged.  Use the previous one
// //             SCREEN[i] = terminalObj['screen'][i];
// //         }
//     }
    outputObj['screen'] = screen;
    outputObj['scrollback'] = scrollback;
    outputObj['log'] = consoleLog.join('\n');
    return outputObj
}
self.addEventListener('message', function(e) {
    var data = e.data,
        term = data.term,
        cmds = data.cmds,
        text = data.text,
        scrollback = data.scrollback,
        termUpdateObj = data.termUpdateObj,
        prevScrollback = data.prevScrollback,
        prefs= data.prefs,
        textTransforms = data.textTransforms,
        result = null;
    if (cmds) {
        cmds.forEach(function(cmd) {
            switch (cmd) {
                case 'linkify':
                    // Linkify links before anything else so we don't clobber any follow-up linkification
                    text = linkify(text);
                    if (textTransforms) {
                        for (var trans in textTransforms) {
                            // Have to convert the regex to a string and use eval since Firefox can't seem to pass regexp objects to Web Workers.
                            var pattern = eval(textTransforms[trans]['pattern']),
                                newString = textTransforms[trans]['newString'];
                            text = linkify(text, pattern, newString);
                        }
                    }
                    break;
                case 'processScreen':
                    result = processScreen(scrollback, termUpdateObj, prevScrollback, prefs, textTransforms);
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
    }
}, false);
