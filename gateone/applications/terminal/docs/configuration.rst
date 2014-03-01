.. _terminal-configuration:

**********************
Terminal Configuration
**********************

Settings
========
The Terminal application stores its settings by default in
'gateone/settings/50terminal.conf'.  This file uses Gate One's standard JSON
format and should look something like this:

.. code-block:: javascript

    // This is Gate One's Terminal application settings file.
    {
        // "*" means "apply to all users" or "default"
        "*": {
            "terminal": { // These settings apply to the "terminal" application
                "commands": {
                    "SSH": "/opt/gateone/applications/terminal/plugins/ssh/scripts/ssh_connect.py --logo -S '%SESSION_DIR%/%SESSION%/%SHORT_SOCKET%' --sshfp -a '-oUserKnownHostsFile=\\\"%USERDIR%/%USER%/.ssh/known_hosts\\\"'"
                },
                "default_command": "SSH",
                "dtach": true,
                "session_logging": true,
                "session_logs_max_age": "30d",
                "syslog_session_logging": false,
                "max_terms": 100
            }
        }
    }

.. tip::

    If you want Gate One to emulate the system's console (great in the event
    that SSH is unavailable) you can add "setsid /bin/login" to your commands:

    .. code-block:: javascript

        "commands": {
            "SSH": "/opt/gateone/applications/terminal/plugins/ssh/scripts/ssh_connect.py --logo -S '%SESSION_DIR%/%SESSION%/%SHORT_SOCKET%' --sshfp -a '-oUserKnownHostsFile=\\\"%USERDIR%/%USER%/.ssh/known_hosts\\\"'",
            "login": "setsid /bin/login"
        }

    That will allow users to login to the same server hosting Gate One
    (i.e. just like SSH to localhost).  You can set "default_command" to "login"
    or users can visit https://your-gateone-server/?terminal_cmd=login and all
    new terminals will be opened using that command.
