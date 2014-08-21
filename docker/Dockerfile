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

RUN groupadd -r gateone && useradd -r -g gateone gateone

# Ensure everything is up-to-date
ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update --fix-missing
RUN apt-get -y upgrade

# Install dependencies
RUN apt-get -y \
    install python-pip \
    python-xpyb \
    python-imaging \
    python-setuptools \
    python-mutagen \
    python-pam \
    python-dev \
    git \
    openssh-client
RUN pip install --upgrade futures tornado cssmin slimit

# Free up some space:
RUN apt-get -q -y autoremove

# Create the volume mount point
# Logs and user data get stored in the volume
RUN mkdir -p /gateone/logs && \
    mkdir -p /gateone/users && \
    chown -R gateone:gateone /gateone

# The 99docker.conf points the log_file_prefix and user_dir to the paths above
ADD 99docker.conf /etc/gateone/conf.d/99docker.conf

# Clone the repo and install Gate One
RUN cd /gateone && \
    git clone $GATEONE_REPO_URL && \
    cd GateOne && \
    python setup.py install

# Copy our update script into the container
ADD update_and_run_gateone.py /usr/local/bin/update_and_run_gateone

# This ensures our SSL certificates get created:
RUN /usr/local/bin/gateone --configure \
    --log_file_prefix="/gateone/logs/gateone.log"

EXPOSE 8000

CMD ["/usr/local/bin/update_and_run_gateone", "--log_file_prefix=/gateone/logs/gateone.log"]
