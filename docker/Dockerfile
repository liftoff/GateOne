############################################################
# Dockerfile that creates a container for running Gate One.
# Inside the container Gate One will run as the 'gateone'
# user and will listen on port 8000.  docker run example:
#
#   docker run -t --name=gateone -p 443:8000 gateone
#
# That would run Gate One; accessible via port 443 from
# outside the container.  It will also run in the foreground
# with pretty-printed log output (so you can see what's
# going on).  To run Gate One in the background:
#
#   docker run -d --name=gateone -p 443:8000 gateone
#
# You could then stop or start the container like so:
#
#   docker stop gateone
#   docker start gateone
#
# The script that starts Gate One inside of the container
# performs a 'git pull' and will automatically install the
# latest code whenever it runs.  To disable this feature
# simply pass --noupdate when running the container:
#
#   docker run -d --name=gateone -p 443:8000 gateone --noupdate
#
# Note that merely stopping & starting the container doesn't
# pull in updates.  That will only happen if you 'docker rm'
# the container and start it back up again.
#
############################################################

FROM ubuntu
MAINTAINER Dan McDougall <daniel.mcdougall@liftoffsoftware.com>

ENV GATEONE_REPO_URL https://github.com/liftoff/GateOne.git

# Ensure everything is up-to-date
ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update --fix-missing && apt-get -y upgrade

# Install dependencies
RUN apt-get -y \
    install python-pip \
    python-imaging \
    python-setuptools \
    python-mutagen \
    python-pam \
    python-dev \
    git \
    telnet \
    openssh-client && \
    apt-get -y clean && \
    apt-get -q -y autoremove
RUN pip install --upgrade futures tornado cssmin slimit psutil

# Create the necessary directories, clone the repo, and install everything
RUN mkdir -p /gateone/logs && \
    mkdir -p /gateone/users && \
    mkdir -p /etc/gateone/conf.d && \
    mkdir -p /etc/gateone/ssl && \
    cd /gateone && \
    git clone $GATEONE_REPO_URL && \
    cd GateOne && \
    python setup.py install && \
    cp docker/update_and_run_gateone.py /usr/local/bin/update_and_run_gateone && \
    cp docker/60docker.conf /etc/gateone/conf.d/60docker.conf

# This ensures our configuration files/dirs are created:
RUN /usr/local/bin/gateone --configure \
    --log_file_prefix="/gateone/logs/gateone.log"

# Remove the auto-generated key/certificate so that a new one gets created the
# first time the container is started:
RUN rm -f /etc/gateone/ssl/key.pem && \
    rm -f /etc/gateone/ssl/certificate.pem
# (We don't want everyone using the same SSL key/certificate)

EXPOSE 8000

CMD ["/usr/local/bin/update_and_run_gateone", "--log_file_prefix=/gateone/logs/gateone.log"]
