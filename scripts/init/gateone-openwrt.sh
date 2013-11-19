#!/bin/sh /etc/rc.common

START=50

SERVICE_USE_PID=1
GATEONE=gateone
GATEONE_PID=/tmp/run/gateone.pid
GATEONE_OPTS="--pid_file=${GATEONE_PID}"

start () {
    if ! start-stop-daemon -S -b -x ${GATEONE} -- ${GATEONE_OPTS}; then
        exit 1
    fi
}

stop() {
    start-stop-daemon -K -q -p $GATEONE_PID
}

restart() {
    stop
    sleep 2
    start
}
