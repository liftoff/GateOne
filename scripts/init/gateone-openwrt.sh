#!/bin/sh /etc/rc.common

# NOTE: Double-check that $GATEONE below is correct for your installation

START=50

SERVICE_USE_PID=1
GATEONE=/usr/local/bin/gateone
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
