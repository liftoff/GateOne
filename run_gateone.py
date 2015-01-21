#!/usr/bin/python

"""
This script is meant for users that wish to run Gate One out of this (GateOne)
directory (as opposed to running setup.py).  If you plan to (or already ran)
setup.py please use the 'gateone' script which gets installed in your $PATH
automatically.
"""

import os, sys

WORKING_DIR = os.path.dirname(os.path.abspath(__file__))
setup_py = os.path.join(WORKING_DIR, 'setup.py')

# Insert the path to this script's directory so that the Python interpreter can
# import gateone, termio, terminal, and onoff:
sys.path.insert(0, WORKING_DIR)

# Create the egg-info directory so entry points will work
egg_info_dir = os.path.join(WORKING_DIR, 'gateone.egg-info')
if not os.path.isdir(egg_info_dir):
    try:
        from commands import getstatusoutput
    except ImportError: # Python 3
        from subprocess import getstatusoutput
    retcode, output = getstatusoutput('python %s egg_info' % setup_py)
    if retcode != 0:
        print(
            "Error: Could not create %s.  Permissions problem?" % egg_info_dir)
        sys.exit(2)

from gateone.core.server import main

main(installed=False)
