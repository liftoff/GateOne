#!/bin/sh

# Description:  If Gate One does what it is supposed to do the terminal running
# this script will be terminated after a few seconds of craziness.

# Prevent Ctrl-c from killing this script:
trap "" 2 20

# Print to stdout as much as possible.
while true; do echo "Kill me\!"; done

# NOTE:  To test if the Ctrl-c part works just run "yes"