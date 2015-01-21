
// TODO:  Add syntax highlighting for nmap (use GateOne.Terminal.lastCommand)
GateOne.Base.superSandbox("GateOne.Convenience", ["GateOne.Terminal", "GateOne.User"], function(window, undefined) {
"use strict";

// These are just convenient shortcuts:
var document = window.document, // Have to do this because we're sandboxed
    go = GateOne,
    u = go.Utils,
    t = go.Terminal,
    v = go.Visual,
    E = go.Events,
    gettext = go.i18n.gettext,
    prefix = go.prefs.prefix;

// Tunable prefs
if (typeof(go.prefs.disableLSConvenience) == "undefined") {
    go.prefs.disableLSConvenience = false;
}
if (typeof(go.prefs.disablePSConvenience) == "undefined") {
    go.prefs.disablePSConvenience = false;
}
if (typeof(go.prefs.disableSyslogConvenience) == "undefined") {
    go.prefs.disableSyslogConvenience = false;
}
if (typeof(go.prefs.disableIPConvenience) == "undefined") {
    go.prefs.disableIPConvenience = false;
}

// GateOne.Convenience (adds convenient stuff to Gate One)
GateOne.Base.module(GateOne, "Convenience", "1.2", ['Base']);
/**:GateOne.Convenience

Provides numerous syntax highlighting functions and conveniences to provide quick and useful information to the user.
*/
GateOne.Convenience.groupTemp = {}; // Used to pass group information around before a final message is displayed
GateOne.Base.update(GateOne.Convenience, {
    init: function() {
        /**:GateOne.Convenience.init()

        Sets up all our conveniences.
        */
        go.Convenience.addPrefs();
        E.on("go:js_loaded", function() {
            if (!go.prefs.disableLSConvenience) {
                go.Convenience.registerLSConvenience();
            }
            if (!go.prefs.disableSyslogConvenience) {
                go.Convenience.registerSyslogConvenience();
            }
            if (!go.prefs.disableIPConvenience) {
                go.Convenience.registerIPConvenience();
            }
            if (!go.prefs.disablePSConvenience) {
                go.Convenience.registerPSConvenience();
            }
        });
    },
    addPrefs: function() {
        /**:GateOne.Convenience.addPrefs()

        Adds a number of configurable elements to Gate One's preferences panel.
        */
        var prefsPanelForm = u.getNode('#'+prefix+'prefs_form'),
            saveButton = u.getNode('#'+prefix+'prefs_save'),
            LSRow = u.createElement('div', {'class':'✈paneltablerow'}),
            PSRow = u.createElement('div', {'class':'✈paneltablerow'}),
            SyslogRow = u.createElement('div', {'class':'✈paneltablerow'}),
            IPRow = u.createElement('div', {'class':'✈paneltablerow'}),
            tableDiv = u.createElement('div', {'id': 'prefs_convenience', 'class':'✈paneltable', 'style': {'display': 'table', 'padding': '0.5em'}}),
            LSPrefsLabel = u.createElement('span', {'id': 'prefs_ls_label', 'class':'✈paneltablelabel'}),
            LSPrefs = u.createElement('input', {'id': 'prefs_disableLStt', 'name': prefix+'prefs_disableLStt', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            PSPrefsLabel = u.createElement('span', {'id': 'prefs_ps_label', 'class':'✈paneltablelabel'}),
            PSPrefs = u.createElement('input', {'id': 'prefs_disablePStt', 'name': prefix+'prefs_disablePStt', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            SyslogPrefsLabel = u.createElement('span', {'id': 'prefs_sylog_label', 'class':'✈paneltablelabel'}),
            SyslogPrefs = u.createElement('input', {'id': 'prefs_disableSyslogtt', 'name': prefix+'prefs_disableSyslogtt', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}}),
            IPPrefsLabel = u.createElement('span', {'id': 'prefs_IP_label', 'class':'✈paneltablelabel'}),
            IPPrefs = u.createElement('input', {'id': 'prefs_disableIPtt', 'name': prefix+'prefs_disableIPtt', 'type': 'checkbox', 'style': {'display': 'table-cell', 'text-align': 'right', 'float': 'right'}});
        LSPrefsLabel.innerHTML = "<b>" + gettext("Disable 'ls -l' Convenience:") + "</b> ";
        LSPrefs.checked = go.prefs.disableLSConvenience;
        LSRow.appendChild(LSPrefsLabel);
        LSRow.appendChild(LSPrefs);
        tableDiv.appendChild(LSRow);
        PSPrefsLabel.innerHTML = "<b>" + gettext("Disable 'ps' Convenience:") + "</b> ";
        PSPrefs.checked = go.prefs.disablePSConvenience;
        PSRow.appendChild(PSPrefsLabel);
        PSRow.appendChild(PSPrefs);
        tableDiv.appendChild(PSRow);
        SyslogPrefsLabel.innerHTML = "<b>" + gettext("Disable Syslog Convenience:") + "</b> ";
        SyslogPrefs.checked = go.prefs.disableSyslogConvenience;
        SyslogRow.appendChild(SyslogPrefsLabel);
        SyslogRow.appendChild(SyslogPrefs);
        tableDiv.appendChild(SyslogRow);
        IPPrefsLabel.innerHTML = "<b>" + gettext("Disable IP Address Convenience:") + "</b> ";
        IPPrefs.checked = go.prefs.disableIPConvenience;
        IPRow.appendChild(IPPrefsLabel);
        IPRow.appendChild(IPPrefs);
        tableDiv.appendChild(IPRow);
        go.User.preference(gettext("Terminal:Convenience Plugin"), tableDiv);
        // This makes sure our prefs get saved along with everything else
        E.on('go:save_prefs', go.Convenience.savePrefsCallback);
    },
    savePrefsCallback: function() {
        /**:GateOne.Convenience.savePrefsCallback()

        Called when the user clicks the "Save" button in the prefs panel.
        */
        var c = go.Convenience,
            disableLS = u.getNode('#'+prefix+'prefs_disableLStt').checked,
            disablePS = u.getNode('#'+prefix+'prefs_disablePStt').checked,
            disableSyslog = u.getNode('#'+prefix+'prefs_disableSyslogtt').checked,
            disableIP = u.getNode('#'+prefix+'prefs_disableIPtt').checked;
        go.prefs.disableLSConvenience = disableLS;
        go.prefs.disablePSConvenience = disablePS;
        go.prefs.disableSyslogConvenience = disableSyslog;
        go.prefs.disableIPConvenience = disableIP;
        c.unregisterLSConvenience();
        c.unregisterPSConvenience();
        c.unregisterSyslogConvenience();
        c.unregisterIPConvenience();
        if (!disableLS) {
            c.registerLSConvenience();
        }
        if (!disablePS) {
            c.registerPSConvenience();
        }
        if (!disableSyslog) {
            c.registerSyslogConvenience();
        }
        if (!disableIP) {
            c.registerIPConvenience();
        }
    },
    registerLSConvenience: function() {
        /**:GateOne.Convenience.registerLSConvenience()

        Registers a number of text transforms to add conveniences to the output of 'ls -l'.
        */
        var bytesPattern = /([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?\s+[0-9]+\s+[A-Za-z0-9\-._@]+\s+[A-Za-z0-9\-._@]+\s+)([0-9]+(?![0-9,.KMGTP]))/g,
            bytesReplacementString = "$1<span class='✈clickable' onclick='GateOne.Visual.displayMessage(this.innerHTML + \" bytes == \" + GateOne.Utils.humanReadableBytes(parseInt(this.innerHTML), 2))'>$2</span>";
        t.registerTextTransform("ls-lbytes", bytesPattern, bytesReplacementString);
        if (go.SSH) {
            var groupPattern = /([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?\s+[0-9]+\s+[A-Za-z0-9\-._@]+\s+)([A-Za-z0-9\-._@]+)/g,
                groupReplacementString = "$1<span class='✈clickable' onclick='GateOne.Convenience.groupInfo(this)'>$2</span>";
            t.registerTextTransform("ls-lgroup", groupPattern, groupReplacementString);
            var userPattern = /([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?\s+[0-9]+\s+)([A-Za-z0-9\-._@]+)/g,
                userReplacementString = "$1<span class='✈clickable' onclick='GateOne.Convenience.userInfo(this)'>$2</span>";
            t.registerTextTransform("ls-luser", userPattern, userReplacementString);
        }
        var permissionsPattern = /^([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?) /mg,
            permissionsReplacementString = "<span class='✈clickable' onclick='GateOne.Convenience.permissionsInfo(this)'>$1</span> ";
        t.registerTextTransform("ls-lperms", permissionsPattern, permissionsReplacementString);
    },
    unregisterLSConvenience: function() {
        /**:GateOne.Convenience.unregisterLSConvenience()

        Removes all of the text transforms that apply to the output of 'ls -l'
        */
        t.unregisterTextTransform("ls-lbytes");
        t.unregisterTextTransform("ls-lgroup");
        t.unregisterTextTransform("ls-luser");
        t.unregisterTextTransform("ls-lperms");
    },
    registerIPConvenience: function() {
        /**:GateOne.Convenience.registerIPConvenience()

        Registers a text transform that makes IPv4 addresses into spans that will execute `host <IP address>` when clicked.

        .. note:: This feeature will disable itself if the SSH plugin is disabled/missing.
        */
        // This feature requires the SSH plugin to work properly
        if (go.SSH) {
            var IPv4Pattern = /(\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b)(?!([\.\w-_]|.*a\>))/g,
                IPv4ReplacementString = "<span class='✈clickable' onclick='GateOne.Convenience.IPInfo(this)'>$1</span>";
            t.registerTextTransform("IPv4", IPv4Pattern, IPv4ReplacementString);
            // Just a little regex to capture IPv6...
            var IPv6Pattern = /(\b((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\b)(?!([\:]|.*a\>))/g,
                IPv6ReplacementString = "<span class='✈clickable' onclick='GateOne.Convenience.IPInfo(this)'>$1</span>";
            t.registerTextTransform("IPv6", IPv6Pattern, IPv6ReplacementString);
        }
    },
    unregisterIPConvenience: function() {
        /**:GateOne.Convenience.registerIPConvenience()

        Removes all the text transforms that apply to IP addresses.
        */
        t.unregisterTextTransform("IPv4");
        t.unregisterTextTransform("IPv6");
    },
    IPInfo: function(elem) {
        /**:GateOne.Convenience.IPInfo(elem)

        Calls `GateOne.SSH.execRemoteCmd(term, 'host ' + elem.innerHTML)`.
        */
        var term = localStorage[prefix+'selectedTerminal'],
            IP = elem.innerHTML;
        v.displayMessage("Looking up <i>" + IP + "</i>...");
        go.SSH.execRemoteCmd(term, 'host ' + IP + " | awk '{print $NF}'", go.Convenience.displayIPInfo);
    },
    displayIPInfo: function(output) {
        /**:GateOne.Convenience.displayIPInfo(output)

        Displays the result of `host <IP address>`.
        */
        v.displayMessage(output);
    },
    permissionsInfo: function(elem) {
        /**:GateOne.Convenience.permissionsInfo(elem)

        Displays information about the 'ls -l' permissions contained within *elem*.  elem.innerHTMl **must** be something like 'drwxrwxr-x'.
        */
        var message = gettext(" with permissions equivalent to ") + "'chmod " + go.Convenience.permissionsBitmask(elem) + "'",
            types = {
                '-': gettext("Regular File"),
                'd': gettext("Directory"),
                'l': gettext("Symbolic Link"),
                's': gettext("Socket"),
                'p': gettext("Named Pipe"),
                'c': gettext("Character Device"),
                'b': gettext("Block Device")
            };
        if (elem.innerHTML[0] == 'l') {
            message = "(" + types[elem.innerHTML[0]] + ")";
        } else {
            message = "(" + types[elem.innerHTML[0]] + ")" + message;
        }
        if (u.endsWith('+', elem.innerHTML)) {
            message += gettext(" (ACLs Applied)");
        }
        v.displayMessage(message);
    },
    permissionsBitmask: function(elemOrString) {
        /**:GateOne.Convenience.permissionsBitmask(elemOrString)

        Returns the bitmask (i.e. chmod <bitmask>) to a file/directory's permissions.  For example:

            >>> someElement.innerHTML = 'drwxrwxr-x';
            >>> GateOne.Convenience.permissionsBitmask(someElement);
            '0775'
        */
        var text = '',
            val = 0,
            permissions = {
                'r1': 400, 'w2': 200, 'x3': 100, 's3': 4100, 'S3': 4000,
                'r4': 40,  'w5': 20,  'x6': 10,  's6': 2010, 'S6': 2000,
                'r7': 4,   'w8': 2,   'x9': 1,   't9': 1001, 'T9': 1000
            };
        if (elemOrString.innerHTML) {
            text = elemOrString.innerHTML;
        } else {
            text = elemOrString;
        }
        // Start at 1 to skip the first letter (e.g. 'd' or 'l')
        for (var n = 1; n <= text.length; n++) {
            var char = text[n];
            if (permissions[char + n]) {
                val += permissions[char + n];
            }
        }
        if (val < 1000) {
            val = '0' + val;
        } else {
            val = '' + val;
        }
        return val;
    },
    userInfo: function(elem) {
        /**:GateOne.Convenience.userInfo(elem)

        Calls 'getent passwd ' + elem.innerHTML on the server using GateOne.SSH.execRemoteCmd().  The result will be handled by `GateOne.Convenience.displayUserInfo()`
        */
        var term = localStorage[prefix+'selectedTerminal'],
            invalid = /.*[;&$()\[\]\*].*/g, // Keep things safe just in case
            user = elem.innerHTML;
        if (elem.innerHTML.search(invalid) == -1) {
            v.displayMessage(gettext("Looking up info for user: ") + "<i>" + user + "</i>...");
            go.SSH.execRemoteCmd(term, 'getent passwd ' + user, go.Convenience.displayUserInfo);
        }
    },
    displayUserInfo: function(output) {
        /**:GateOne.Convenience.displayUserInfo(output)

        Parses the output of the 'getent passwd <user>' command and displays it in an easy-to-read format.
        */
        var fieldList = output.split(':'),
            username = fieldList[0],
            password = fieldList[1],
            uid = fieldList[2],
            gid = fieldList[3],
            gecos = fieldList[4],
            homeDir = fieldList[5],
            shell = fieldList[6],
            container = u.createElement('div'),
            table = u.createElement('table', {'style': {'text-align': 'left'}}),
            userRow = u.createElement('tr'),
            passwordRow = u.createElement('tr'),
            uidRow = u.createElement('tr'),
            gidRow = u.createElement('tr'),
            gecosRow = u.createElement('tr'),
            homeDirRow = u.createElement('tr'),
            shellRow = u.createElement('tr');
        userRow.innerHTML = '<td>' + gettext('Username') + '</td><td>' + username + '</td>';
        passwordRow.innerHTML = '<td>' + gettext('Password') + '</td><td>' + password + '</td>';
        uidRow.innerHTML = '<td>UID</td><td>' + uid + '</td>';
        gidRow.innerHTML = '<td>GID</td><td>' + gid + '</td>';
        gecosRow.innerHTML = '<td>GECOS</td><td>' + gecos + '</td>';
        homeDirRow.innerHTML = '<td>' + gettext('Home Directory') + '&nbsp;&nbsp;&nbsp;</td><td>' + homeDir + '</td>';
        shellRow.innerHTML = '<td>Shell</td><td>' + shell + '</td>'; // 'Shell' is precisely what this is in all languages as I undertstand it (hence no gettext())
        table.appendChild(userRow);
        table.appendChild(passwordRow);
        table.appendChild(uidRow);
        table.appendChild(gidRow);
        table.appendChild(gecosRow);
        table.appendChild(homeDirRow);
        table.appendChild(shellRow);
        container.appendChild(table);
        v.displayMessage(container.innerHTML, 3000); // Give it a little extra time than a normal message
    },
    userInfoError: function(result) {
        /**:GateOne.Convenience.userInfoError(result)

        Displays a message indicating there was an error getting info on the user.
        */
        v.displayMessage(gettext("An error was encountered trying to get user info: ") + result);
    },
    groupInfo: function(elem) {
        /**:GateOne.Convenience.groupInfo(elem)

        Calls 'getent group ' + elem.innerHTML on the server using GateOne.SSH.execRemoteCmd().  The result will be handled by `GateOne.Convenience.displayGroupInfo()`
        */
        var term = localStorage[prefix+'selectedTerminal'],
            invalid = /.*[;&$()\[\]\*].*/g, // Keep things safe just in case
            group = elem.innerHTML;
        if (elem.innerHTML.search(invalid) == -1) {
            v.displayMessage(gettext("Looking up info for group") + " <i>" + group + "</i>...");
            go.SSH.execRemoteCmd(term, 'getent group ' + group, go.Convenience.groupInfo2);
        }
    },
    groupInfo2: function(output) {
        /**:GateOne.Convenience.groupInfo2(output)

        Parses the output of the `getent group <group>` command, saves the details as HTML in GateOne.Convenience.groupTemp, then calls `getent passwd` looking for all the users that have the given group as their primary GID.  The final output will be displayed via GateOne.Convenience.displayGroupInfo().
        */
        if (output.indexOf('not found') != -1) {
            go.Convenience.groupInfoError("<i>" + output + "</i>");
            return;
        }
        if (output.length == 0) {
            v.displayMessage(gettext("Group not found"));
            return;
        }
        var fieldList = output.split(':'),
            groupname = fieldList[0],
            password = fieldList[1],
            gid = fieldList[2],
            userList = fieldList[3].split(','),
            users = userList.join(" "),
            table = u.createElement('table', {'style': {'min-width': '10em', 'text-align': 'left'}}),
            nameRow = u.createElement('tr'),
            passwordRow = u.createElement('tr'),
            gidRow = u.createElement('tr'),
            usersRow = u.createElement('tr', {'style': {'vertical-align': 'top'}}),
            term = localStorage[prefix+'selectedTerminal'];
        nameRow.innerHTML = '<td>' + gettext('Name') + '</td><td>' + groupname + '</td>';
        passwordRow.innerHTML = '<td>' + gettext('Password') + '</td><td>' + password + '</td>';
        gidRow.innerHTML = '<td>GID</td><td>' + gid + '</td>';
        usersRow.innerHTML = '<td>' + gettext('Users') + '</td><td>' + users + '</td>';
        table.appendChild(nameRow);
        table.appendChild(passwordRow);
        table.appendChild(gidRow);
        table.appendChild(usersRow);
        go.Convenience.groupTemp[groupname] = table;
        // Now find out which users have this group listed as their primary gid and pass the info along to displayGIDInfo()
        go.SSH.execRemoteCmd(term, "USERLIST=`getent passwd | grep \"^[^:]*:[^:]*:[^:]*:" + gid + ":\" | awk -F: '{print $1}' | xargs`; echo " + groupname + ":${USERLIST}", go.Convenience.displayGroupInfo);
    },
    groupInfoError: function(result) {
        /**:GateOne.Convenience.groupInfoError(result)

        Displays a message indicating there was an error getting info on the group.
        */
        v.displayMessage(gettext("An error was encountered trying to get group info: ") + result);
    },
    displayGroupInfo: function(output) {
        /**:GateOne.Convenience.displayGroupInfo(output)

        Displays a message conaining all of the group's information using GateOne.Convenience.groupTemp and by parsing the output of the `getent passwd | grep ...` command.
        */
        var gidUsersRow = u.createElement('tr', {'style': {'vertical-align': 'top'}}),
            groupname = output.split(':')[0],
            usersViaGID = output.split(':')[1],
            table = go.Convenience.groupTemp[groupname],
            titleDiv = u.createElement('div', {'style': {'text-align': 'center', 'text-decoration': 'underline'}}),
            container = u.createElement('p');
        gidUsersRow.innerHTML = '<td nowrap="nowrap">' + gettext('Users via GID') + '&nbsp;&nbsp;&nbsp;</td><td style="max-width: 20em;">' + usersViaGID + '</td>';
        titleDiv.innerHTML = gettext("Group Info");
        if (!table) {
            // Something went wrong trying to split() the output
            go.Convenience.groupInfoError(gettext("Likely too much output so it got truncated... ") + output);
        }
        table.appendChild(gidUsersRow);
        container.appendChild(titleDiv);
        container.appendChild(table);
        v.displayMessage(container.innerHTML, 3000); // Give it a little extra time than a normal message
    },
    registerSyslogConvenience: function() {
        /**:GateOne.Convenience.registerSyslogConvenience()

        Registers a text transform that makes standard syslog output easier on the eyes.
        */
        var timeRegex = /^((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+[0-9]+(st|th|nd)?)\s+([0-9][0-9]\:[0-9][0-9]\:[0-9][0-9])\s+(\w+)\s+(.+?\:)?(.*?)$/mg,
            timeReplacementString = "<span class='✈row' onclick='GateOne.Convenience.toggleBackground(this)'><span class='✈date' onclick='this.parentElement.onclick()'>$1</span> <span class='✈time' onclick='this.parentElement.onclick(this.parentElement)'>$4</span> <span class='✈hostname' onclick='this.parentElement.onclick(this.parentElement)'>$5</span> <span class='✈service' onclick='this.parentElement.onclick(this.parentElement)'>$6</span><span class='✈message' onclick='this.parentElement.onclick(this.parentElement)'>$7</span></span>";
        t.registerTextTransform("sysloglines", timeRegex, timeReplacementString);
    },
    unregisterSyslogConvenience: function() {
        /**:GateOne.Convenience.unregisterSyslogConvenience()

        Removes all the text transforms associated with syslog output.
        */
        t.unregisterTextTransform("sysloglines");
    },
    registerPSConvenience: function() {
        /**:GateOne.Convenience.registerPSConvenience()

        Registers a text transform that adds syntax highlighting to the output of 'ps'.
        */
        var headingPattern = /\n(\s*?USER|\s*?UID|\s*?PID)(.*)(CMD|COMMAND)/g,
            headingReplacementString = "\n<span id='✈ps_heading' class='✈reverse ✈bold'>$1$2$3</span>",
            psRootPattern = /\n(root)(\s+[0-9]+)/g, // Highlights the word 'root'
            psRootReplacementString = "\n<span class='✈highlight_root'>$1</span>$2", // Default theme has this as a red color
            kernelModulePattern = /([0-9] )(\[.+?\]\n)/g, // Kernel/system processes show up in brackets
            kernelModuleReplacementString = "$1<span title='" + gettext("Kernel or System Process") + "' class='✈dim'>$2</span>";
        t.registerTextTransform("psroot", psRootPattern, psRootReplacementString);
        t.registerTextTransform("psheading", headingPattern, headingReplacementString);
        t.registerTextTransform("pskernelmodule", kernelModulePattern, kernelModuleReplacementString);
    },
    unregisterPSConvenience: function() {
        /**:GateOne.Convenience.unregisterPSConvenience()

        Removes all the text transforms associated with ps output.
        */
        t.unregisterTextTransform("psroot");
        t.unregisterTextTransform("psheading");
        t.unregisterTextTransform("pskernelmodule");
    },
    toggleBackground: function(elem) {
        /**:GateOne.Convenience.toggleBackground(result)

        Toggles a background color on and off for the given *elem* by adding or removing the 'selectedrow' class.
        */
        // Sometimes the browser registers one click for the entire row sometimes it registers two clicks:  One for the row and one for the span inside of it.
        // Sometimes the browser will only register a click for the span inside of the row--failing to fire the containing row's onclick event.
        // The semi-strange logic below handles all of these situations gracefully.
        return; // Temporarily disabled because it was getting annoying.  Might get rid of it entirely in the future.
        if (go.Convenience.togglingBackground) {
            return; // Only once per click thanks :)
        }
        go.Convenience.togglingBackground = true;
        if (elem.className.indexOf('✈selectedrow') == -1) {
            elem.className += ' ✈selectedrow';
        } else {
            elem.className = elem.className.replace('✈selectedrow', '');
        }
        setTimeout(function() {
            go.Convenience.togglingBackground = false;
        }, 1);
    }
});

});
