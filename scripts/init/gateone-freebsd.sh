#!/bin/sh

# PROVIDE: gateone
# REQUIRE: LOGIN DAEMON
# KEYWORD: shutdown

. /etc/rc.subr

name=gateone
rcvar=gateone_enable
command=gateone
command_interpreter=/usr/local/bin/python
start_cmd="/usr/sbin/daemon $command > /dev/null 2>&1"
load_rc_config $name
run_rc_command "$1"
