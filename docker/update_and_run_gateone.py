#!/usr/bin/env python

"""
Checks if Gate One is up-to-date inside the container by performing a
`git pull`.  If new code was pulled it will be automatically installed via
`python setup.py install`

Once that's done it will automatically run the 'gateone' command; passing it any
arguments that were passed to this script.

To disable the automatic update mechanism simply pass --noupdate as a command
line argument to this script.

.. note::

    This script will also update the Tornado framework via the pip command.
"""

import os, sys
try:
    from commands import getstatusoutput
except ImportError: # Python 3
    from subprocess import getstatusoutput

if __name__ == "__main__":
    go_args = sys.argv[1:]
    os.chdir('/gateone/GateOne')
    if '--noupdate' not in go_args:
        retcode, output = getstatusoutput('git pull')
        if 'up-to-date' in output:
            print("Gate One is already up-to-date")
        else:
            print("Installing the latest code...")
            retcode, output = getstatusoutput('python setup.py install')
            if retcode == 0:
                print("Gate One has been updated.")
            else:
                print("Encountered a problem trying to install/upgrade Gate One...")
                print(output)
                sys.exit(1)
        retcode, output = getstatusoutput('pip install --upgrade tornado')
    else:
        go_args.remove('--noupdate')
    os.execvp('/usr/bin/python', [
        '/usr/bin/python', '/usr/local/bin/gateone'] + go_args)
    os._exit(0)
