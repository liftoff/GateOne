(function(window, undefined) {
var document = window.document; // Have to do this because we're sandboxed

// First we need to know if this is a mobile browser or not so we can decide whether we want to invoke our mobile-specific JS
var mobile = function(){
    return {
        detect:function(){
            var uagent = navigator.userAgent.toLowerCase();
            var list = this.mobiles;
            var ismobile = false;
            for(var d=0;d<list.length;d+=1){
                if(uagent.indexOf(list[d])!=-1){
                    ismobile = true;
                }
            }
            return ismobile;
        },
        mobiles:[
            "midp","240x320","blackberry","netfront","nokia","panasonic",
            "portalmmm","sharp","sie-","sonyericsson","symbian",
            "windows ce","benq","mda","mot-","opera mini",
            "philips","pocket pc","sagem","samsung","sda",
            "sgh-","vodafone","xda","palm","iphone",
            "ipod","android"
        ]
    };
}();

// GateOne.Mobile
GateOne.Base.module(GateOne, "Mobile", '1.0', ['Base', 'Net', 'Input']);
GateOne.Mobile.origHeight = document.body.scrollHeight;
GateOne.Mobile.origWidth = document.body.scrollWidth;
GateOne.Base.update(GateOne.Mobile, {
    init: function() {
        // text input (native keyboard) version
        if (mobile.detect()) {
            var go = GateOne,
                u = go.Utils,
                goDiv = u.getNode(go.prefs.goDiv),
                style = window.getComputedStyle(goDiv, null),
                form = u.createElement('form'),
                inputElement = u.createElement('input', {'type': 'text', 'name': 'mobile_input', 'id': 'mobile_input', 'size': 10, 'style': {'background': 'transparent', 'height': '1em', 'color': '#ccc', 'position': 'fixed', 'bottom': 0, 'left': 0, 'z-index': 1000, 'font-size': '200%', 'height': '2em', 'opacity': '0.5', 'border': 'none'}});
            goDiv.onkeydown = null;
            goDiv.addEventListener('touchstart', function(e) {
                var t = e.touches[0];
                go.Mobile.touchstartX = t.pageX;
                go.Mobile.touchstartY = t.pageY;
            }, true);
            goDiv.addEventListener('touchmove', function(e) {
                var t = e.touches[0];
                if (t.pageX < go.Mobile.touchstartX && (go.Mobile.touchstartX - t.pageX) > 20) {
                    go.Visual.slideRight();
                } else if (t.pageX > go.Mobile.touchstartX && (t.pageX - go.Mobile.touchstartX) > 20) {
                    go.Visual.slideLeft();
                } else if (t.pageY < go.Mobile.touchstartY && (go.Mobile.touchstartY - t.pageY) > 20) {
                    go.Visual.slideDown();
                } else if (t.pageY > go.Mobile.touchstartY && (t.pageY - go.Mobile.touchstartY) > 20) {
                    go.Visual.slideUp();
                }
                e.preventDefault();
            }, true);
            inputElement.value = '';
            inputElement.tabIndex = 1;
            inputElement.autocorrect = "off";
            inputElement.autocomplete = "off";
            inputElement.autocapitalize = "none";
            inputElement.placeholder = " Click to type";
            inputElement.spellcheck = false;
            inputElement.addEventListener('focus', function(e) {
                // Move everything UP so the user can see what they're typing
                setTimeout(function() {
                    var newSize = go.Mobile.origHeight - document.body.scrollHeight;
                }, 500);
            }, true);
            inputElement.addEventListener('blur', function(e) {
                // Move everything UP so the user can see what they're typing
                go.Visual.applyTransform(goDiv, '');
            }, true);
            inputElement.addEventListener('keyup', function(e) {
                // For some reason mobile browsers have issues capturing onkeydown, onkeyup, and onkeypress events.  They seem to work OK for enter and backspace though (bizarre, right?)
                // What's interesting is that enter and backspace don't work for 'oninput' events.  Wacky!
                var key = go.Input.key(e),
                    modifiers = go.Input.modifiers(e),
                    keyString = String.fromCharCode(key.code);
                if (key.string == "KEY_BACKSPACE" || key.string == "KEY_ENTER") {
                    go.Input.queue(keyString);
                    go.Net.sendChars();
                    inputElement.value = '';
                }
                e.preventDefault();
            }, true);
            inputElement.addEventListener('input', function(e) {
                var keyString = inputElement.value;
                go.Input.queue(keyString);
                go.Net.sendChars();
                inputElement.value = ''; // Clear it out
            }, true);
            form.onsubmit = function(e) {
                e.preventDefault();
                inputElement.focus();
            }
            form.appendChild(inputElement);
            document.body.appendChild(form);
            setTimeout(function() {
                u.hideElements('.pastearea');
            }, 3000);
            window.onresize = function(e) {
                // Mobile resize is slightly different from desktop
                go.Visual.updateDimensions();
                go.Mobile.sendDimensions(null, false);
            }
            setTimeout(function() { // Wrapped in a timeout since it takes a moment for everything to change in the browser
                go.Visual.updateDimensions();
                go.Mobile.sendDimensions();
            }, 4000);
        }
    },
    sendDimensions: function(term) {
        // Same as GateOne.Net.sendDimensions() but we don't adjust for the playback controls
        if (!term) {
            var term = localStorage[GateOne.prefs.prefix+'selectedTerminal'];
        }
        var go = GateOne,
            u = go.Utils,
            emDimensions = u.getEmDimensions(go.prefs.goDiv),
            dimensions = u.getRowsAndColumns(go.prefs.goDiv),
            prefs = {
                'term': term,
                'rows': Math.ceil(dimensions.rows - 1),
                'cols': Math.ceil(dimensions.cols - 6), // -5 for the sidebar + scrollbar and -1 because we're using Math.ceil
                'em_dimensions': emDimensions
            }
        if (!go.prefs.showToolbar && !go.prefs.showTitle) {
            prefs['cols'] = dimensions.cols - 1; // If there's no toolbar and no title there's no reason to have empty space on the right.
        }
        // Apply user-defined rows and cols (if set)
        if (go.prefs.cols) { prefs.cols = go.prefs.cols };
        if (go.prefs.rows) { prefs.rows = go.prefs.rows };
        // Tell the server the new dimensions
        go.ws.send(JSON.stringify({'resize': prefs}));
    },
});

})(window);
