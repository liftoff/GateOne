#!/bin/sh

### BEGIN INIT INFO
# Provides:          gateone
# Required-Start:    $network $local_fs $remote_fs
# Required-Stop:     $network $local_fs $remote_fs
# Default-Start:     3 4 5
# Default-Stop:      0 1 2 6
# Short-Description: Starts and stops Gate One
### END INIT INFO

#
# Start/stops the Gate One daemon (gateone.py).
#

GATEONE_DIR=/opt/gateone
GATEONE_PID=/var/run/gateone.pid
GATEONE_OPTS="--pid_file=${GATEONE_PID}"

# clear conflicting settings from the environment
unset TMPDIR

# Make sure gateone.py is available and executable
test -x /opt/gateone/gateone.py || exit 0

. /lib/lsb/init-functions

case "$1" in
    start)
        log_daemon_msg "Starting Gate One daemon" "gateone.py"
        if ! start-stop-daemon --background --start --quiet --exec ${GATEONE_DIR}/gateone.py -- ${GATEONE_OPTS}; then
            log_end_msg 1
            exit 1
        fi
        log_end_msg 0
        ;;
    stop)
        log_daemon_msg "Stopping Gate One daemon" "gateone.py"
        start-stop-daemon --stop --quiet --pidfile $GATEONE_PID
        # Wait a little and remove stale PID file
        sleep 1
        if [ -f $GATEONE_PID ] && ! ps h `cat $GATEONE_PID` > /dev/null
        then
            # Stale PID file (gateone was succesfully stopped),
            # remove it (should be removed automatically by gateone itself but you never know)
            rm -f $GATEONE_PID
        fi
        log_end_msg 0
        ;;
    restart|force-reload)
        $0 stop
        sleep 3
        $0 start
        ;;
    killterms)
        log_daemon_msg "Killing all running Gate One terminals..."
        # This instructs Gate One to kill all of it's subprocesses including open SSH connections and whatnot
        ${GATEONE_DIR}/gateone.py --kill
        # NOTE: Also kills dtach sessions (if that feature is enabled)
        ;;
    *)
        echo "Usage: /etc/init.d/gateone {start|stop|restart|force-reload|killterms}"
        exit 1
        ;;
esac

exit 0