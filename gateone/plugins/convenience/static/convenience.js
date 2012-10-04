(function(window, undefined) {
var document = window.document, // Have to do this because we're sandboxed
    // These are just convenient shortcuts:
    go = GateOne,
    u = go.Utils,
    t = go.Terminal,
    v = go.Visual,
    prefix = go.prefs.prefix;

// GateOne.Convenience (adds convenient stuff to Gate One)
GateOne.Base.module(GateOne, "Convenience", "1.0", ['Base']);
GateOne.Convenience.groupTemp = {}; // Used to pass group information around before a final message is displayed
GateOne.Base.update(GateOne.Convenience, {
    init: function() {
        go.Convenience.registerLSConvenience();
        go.Convenience.registerIPConvenience();
    },
    registerLSConvenience: function() {
        /**:GateOne.Convenience.registerLSConvenience()

        Registers a number of text transforms to add conveniences to the output of 'ls -l'.
        */
        var bytesPattern = /^([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?\s+[0-9]+\s+[A-Za-z0-9\-._@]+\s+[A-Za-z0-9\-._@]+\s+)([0-9]+(?![0-9,.KMGTP]))/g,
            bytesReplacementString = "$1<span class='clickable' onclick='GateOne.Visual.displayMessage(this.innerHTML + \" bytes is \" + GateOne.Utils.humanReadableBytes(parseInt(this.innerHTML), 2))'>$2</span>";
        t.registerTextTransform("ls-lbytes", bytesPattern, bytesReplacementString);
        var groupPattern = /^([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?\s+[0-9]+\s+[A-Za-z0-9\-._@]+\s+)([A-Za-z0-9\-._@]+)/g,
            groupReplacementString = "$1<span class='clickable' onclick='GateOne.Convenience.groupInfo(this)'>$2</span>";
        t.registerTextTransform("ls-lgroup", groupPattern, groupReplacementString);
        var userPattern = /^([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?\s+[0-9]+\s+)([A-Za-z0-9\-._@]+)/g,
            userReplacementString = "$1<span class='clickable' onclick='GateOne.Convenience.userInfo(this)'>$2</span>";
        t.registerTextTransform("ls-luser", userPattern, userReplacementString);
        var permissionsPattern = /^([bcdlpsS\-][r\-][w\-][xsS\-][r\-][w\-][xsS\-][r\-][w\-][xtT\-][+]?)/g,
            permissionsReplacementString = "<span class='clickable' onclick='GateOne.Convenience.permissionsInfo(this)'>$1</span>";
        t.registerTextTransform("ls-lperms", permissionsPattern, permissionsReplacementString);
    },
    registerIPConvenience: function() {
        /**:GateOne.Convenience.registerIPConvenience()

        Registers a text transform that makes IPv4 addresses into spans that will execute `host <IP address>` when clicked.
        */
        var IPv4Pattern = /(\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b)(?!\.)/g,
            IPv4ReplacementString = "<span class='clickable' onclick='GateOne.Convenience.IPInfo(this)'>$1</span>";
        t.registerTextTransform("IPv4", IPv4Pattern, IPv4ReplacementString);
        // Just a little regex to capture IPv6...
        var IPv6Pattern = /(\b((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\b)/g,
            IPv6ReplacementString = "<span class='clickable' onclick='GateOne.Convenience.IPInfo(this)'>$1</span>";
        t.registerTextTransform("IPv6", IPv6Pattern, IPv6ReplacementString);
    },
    IPInfo: function(elem) {
        /**:GateOne.Convenience.IPv4Info(elem)

        Calls `GateOne.SSH.execRemoteCmd(term, 'host ' + elem.innerHTML)`.
        */
        var term = localStorage[prefix+'selectedTerminal'],
            IP = elem.innerHTML;
        v.displayMessage("Looking up <i>" + IP + "</i>...");
        go.SSH.execRemoteCmd(term, 'host ' + IP + " | awk '{print $NF}'", go.Convenience.displayIPInfo);
    },
    displayIPInfo: function(output) {
        /**:GateOne.Convenience.IPv4Info(elem)

        Displays the result of `host <IP address>`.
        */
        v.displayMessage(output);
    },
    permissionsInfo: function(elem) {
        /**:GateOne.Convenience.permissionsInfo(elem)

        Displays information about the 'ls -l' permissions contained within *elem*.  elem.innerHTMl **must** be something like 'drwxrwxr-x'.
        */
        var message = " with permissions equivalent to 'chmod " + go.Convenience.permissionsBitmask(elem) + "'",
            types = {
                '-': "Regular File",
                'd': "Directory",
                'l': "Symbolic Link",
                's': "Socket",
                'p': "Named Pipe",
                'c': "Character Device",
                'b': "Block Device"
            };
        if (elem.innerHTML[0] == 'l') {
            message = "(" + types[elem.innerHTML[0]] + ")";
        } else {
            message = "(" + types[elem.innerHTML[0]] + ")" + message;
        }
        if (u.endsWith('+', elem.innerHTML)) {
            message += " (ACLs Applied)";
        }
        v.displayMessage(message);
    },
    permissionsBitmask: function(elemOrString) {
        /**:GateOne.Convenience.permissionsBitmask(elemOrString)

        Returns the bitmask (i.e. chmod <bitmask>) to a file/directory's permissions.  For example:

            > someElement.innerHTML = 'drwxrwxr-x';
            > GateOne.Convenience.permissionsBitmask(someElement);
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
        for (n = 1; n <= text.length; n++) {
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
            invalid = validate = /.*[;&$()\[\]\*].*/g, // Keep things safe just in case
            user = elem.innerHTML;
        if (elem.innerHTML.search(invalid) == -1) {
            v.displayMessage("Looking up info for user <i>" + user + "</i>...");
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
        userRow.innerHTML = '<td>Username</td><td>' + username + '</td>';
        passwordRow.innerHTML = '<td>Password</td><td>' + password + '</td>';
        uidRow.innerHTML = '<td>UID</td><td>' + uid + '</td>';
        gidRow.innerHTML = '<td>GID</td><td>' + gid + '</td>';
        gecosRow.innerHTML = '<td>GECOS</td><td>' + gecos + '</td>';
        homeDirRow.innerHTML = '<td>Home Directory&nbsp;&nbsp;&nbsp;</td><td>' + homeDir + '</td>';
        shellRow.innerHTML = '<td>Shell</td><td>' + shell + '</td>';
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
        v.displayMessage("An error was encountered trying to get user info: " + result);
    },
    groupInfo: function(elem) {
        /**:GateOne.Convenience.groupInfo(elem)

        Calls 'getent group ' + elem.innerHTML on the server using GateOne.SSH.execRemoteCmd().  The result will be handled by `GateOne.Convenience.displayGroupInfo()`
        */
        var term = localStorage[prefix+'selectedTerminal'],
            invalid = validate = /.*[;&$()\[\]\*].*/g, // Keep things safe just in case
            group = elem.innerHTML;
        if (elem.innerHTML.search(invalid) == -1) {
            v.displayMessage("Looking up info for group <i>" + group + "</i>...");
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
            v.displayMessage("Group not found");
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
        nameRow.innerHTML = '<td>Name</td><td>' + groupname + '</td>';
        passwordRow.innerHTML = '<td>Password</td><td>' + password + '</td>';
        gidRow.innerHTML = '<td>GID</td><td>' + gid + '</td>';
        usersRow.innerHTML = '<td>Users</td><td>' + users + '</td>';
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
        v.displayMessage("An error was encountered trying to get group info: " + result);
    },
    displayGroupInfo: function(output) {
        /**:GateOne.Convenience.displayGroupInfo(output)

        Displays a message conaining all of the group's information using GateOne.Convenience.groupTemp and by parsing the output of the `getent passwd | grep ...` command.
        */
        var gidUsersRow = u.createElement('tr', {'style': {'vertical-align': 'top'}}),
            groupname = output.split(':')[0],
            usersViaGID = output.split(':')[1],
            table = go.Convenience.groupTemp[groupname],
            titleDiv = u.createElement('div', {'style': {'text-align': 'center', 'text-decoration': 'underline'}})
            container = u.createElement('p');
        gidUsersRow.innerHTML = '<td nowrap="nowrap">Users via GID&nbsp;&nbsp;&nbsp;</td><td style="max-width: 20em;">' + usersViaGID + '</td>';
        titleDiv.innerHTML = "Group Info";
        table.appendChild(gidUsersRow);
        container.appendChild(titleDiv);
        container.appendChild(table);
        v.displayMessage(container.innerHTML, 3000); // Give it a little extra time than a normal message
    }
});

})(window);
