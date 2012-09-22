#!/sbin/runscript
#
# Options are controlled via /etc/conf.d/gateone

extra_commands="killterms reload"
GATEONE_DIR=/opt/gateone

depend() {
        need net
        after bootmisc
}

start() {
        ebegin "Starting Gate One"
        start-stop-daemon --background --start --exec ${GATEONE_DIR}/gateone.py -- ${GATEONE_OPTS}
        eend $?
}

stop() {
        ebegin "Stopping Gate One"
        start-stop-daemon --stop --name gateone.py
        eend $?
}

reload()
{
        stop
        killterms
        start
}

killterms()
{
        einfo "Killing all running Gate One terminals..."
        ${GATEONE_DIR}/gateone.py --kill
}
