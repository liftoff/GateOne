#!/usr/bin/python

"""
This script is meant for users that wish to run Gate One out of this (GateOne)
directory (as opposed to running setup.py).  If you plan to (or already ran)
setup.py please use the 'gateone' script which gets installed in your $PATH
automatically.
"""

import os, sys

WORKING_DIR = os.path.dirname(os.path.abspath(__file__))

# Insert the path to this script's directory so that the Python interpreter can
# import gateone, termio, terminal, and onoff:
sys.path.insert(0, WORKING_DIR)

from gateone.core.server import main

main(installed=False)
