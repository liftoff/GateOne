// A Web Worker for processing incoming text
consoleLog = [];
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
// NOTE: This function is a work in progress...  When I'm done it should make Gate One even more responsive.
var processScreen = function(terminalObj, prevBuffer, jsonDoc, termTitle, scrollbackMax) {
    // Figure out the difference between the current screen and the new one (for logging)
    // terminalObj: go.terminals[term]
    // prevBuffer: localStorage['scrollback' + term]
    // jsonDoc: JSON object given to us from the server
    // termTitle: u.getNode('#' + go.prefs.prefix + 'term' + term).title (since we can't query the DOM from within a Worker)
    // scrollbackMax: GateOne.prefs['scrollback']
    var count = 0,
        logLines = [],
        tempLines = [],
        lastLine = null,
        lastNewLine = null,
        term = jsonDoc['term'],
        screen = jsonDoc['screen'], // Used when a refresh is requested or the entire screen changed
        incoming_scrollback = jsonDoc['scrollback'],
        scrollback = terminalObj['scrollback'],
        rateLimiter = jsonDoc['ratelimiter'];  // TODO: Make this display an icon or message indicating it has been engaged
    // Now trim the array to match the go.prefs['scrollback'] setting
    if (scrollback.length > scrollbackMax) {
        scrollback.reverse();
        scrollback.length = scrollbackMax; // I love that Array().length isn't just a read-only value =)
        scrollback.reverse(); // Put it back in the proper order
    }
    return {'scrollback': scrollback, 'logLines': logLines, 'log': consoleLog}
}
self.addEventListener('message', function(e) {
    var data = e.data,
        cmds = data.cmds,
        text = data.text,
        textTransforms = data.textTransforms,
        terminalObj = data.terminalObj,
        prevBuffer = data.prevBuffer,
        jsonDoc = data.jsonDoc,
        termTitle = data.termTitle,
        scrollbackMax= data.scrollbackMax,
        term = data.term,
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
                    term = jsonDoc['term'];
                    result = processScreen(terminalObj, prevBuffer, jsonDoc, termTitle, scrollbackMax);
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
    }
}, false);
