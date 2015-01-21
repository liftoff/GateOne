#!/bin/bash
#
# gateone      Start/Stop Gate One.
#
# chkconfig: 2345 55 25
# description: Gate One is a web-based terminal emulator and SSH client.
#
# processname: gateone
# config: /etc/gateone/conf.d/
# pidfile: /var/run/gateone.pid
#

# Source function library
. /etc/init.d/functions

# Get network config
. /etc/sysconfig/network

RETVAL=0

GATEONE=gateone
GATEONE_PID=/var/run/gateone.pid
GATEONE_OPTS="--pid_file=${GATEONE_PID}"

# Check that networking is up.
[ "$NETWORKING" = "no" ] && exit 0

# Make sure gateone.py is available and executable
test -x ${GATEONE} || exit 0

start() {
    echo -n $"Starting Gate One: "
    # Start me up!
    daemon "nohup ${GATEONE} ${GATEONE_OPTS} > /dev/null 2>&1 &"
    RETVAL=$?
    echo
    [ $RETVAL -eq 0 ] && touch /var/lock/subsys/gateone
    return $RETVAL
}

stop() {
    echo -n $"Stopping Gate One: "
    killproc -p ${GATEONE_PID}
    RETVAL=$?
    echo
    [ $RETVAL -eq 0 ] && rm -f /var/lock/subsys/gateone
    return $RETVAL
}

restart() {
    stop
    start
}

reload() {
    stop
    start
}

case "$1" in
  start)
      start
    ;;
  stop)
      stop
    ;;
  status)
    status gateone
    ;;
  restart)
      restart
    ;;
  condrestart)
      [ -f /var/lock/subsys/gateone ] && restart || :
    ;;
  reload)
    reload
    ;;
  killterms)
    echo "Killing all running Gate One terminals..."
    ${GATEONE} --kill
    ;;
  *)
    echo $"Usage: $0 {start|stop|status|restart|condrestart|reload|killterms}"
    exit 1
esac

exit $?
