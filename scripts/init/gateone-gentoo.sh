#!/sbin/runscript
#
# Options are controlled via /etc/conf.d/gateone

extra_commands="killterms reload"
GATEONE=gateone

depend() {
        need net
        after bootmisc
}

start() {
        ebegin "Starting Gate One"
        start-stop-daemon --background --start --exec ${GATEONE} -- ${GATEONE_OPTS}
        eend $?
}

stop() {
        ebegin "Stopping Gate One"
        start-stop-daemon --stop --name ${GATEONE}
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
        ${GATEONE} --kill
}
