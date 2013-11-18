#!/bin/sh

# PROVIDE: gateone 
# REQUIRE: LOGIN cleanvar sshd
# KEYWORD: shutdown

. /etc/rc.subr

name=gateone
rcvar=gateone_enable
command=/usr/local/bin/gateone 
command_interpreter=/usr/local/bin/python
start_cmd="/usr/sbin/daemon $command"
load_rc_config $name
run_rc_command "$1"
