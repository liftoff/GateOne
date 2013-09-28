#!/bin/sh

echo -e "\n\n\033[1mTimedout due to lack of activity.\033[0m"
echo -e "\033]_;notice|Timedout due to lack of activity.\007"
echo '[Press Ctrl-C to close this terminal]'
read whatever
exit 1
