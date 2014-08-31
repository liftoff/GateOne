What is Gate One?
-----------------

This is the official Docker repo for [Gate One][1]--a web based terminal emulator and SSH client (and soon to support X11).  The first time you 'docker run' the liftoff/gateone image it will automatically update itself with [the latest code from Github][2].

Inside the image Gate One is configured to run as the root user (due to a bug in Docker; see https://github.com/docker/docker/issues/5892) and listen on port 8000.  It is also configured to use /gateone/logs for logging and /gateone/users for the user_dir.  The settings_dir is still at the usual /etc/gateone/conf.d location and SSL certificates (which will be generated automatically the first time you run the image) are stored in /etc/gateone/ssl/.

Using this Image
----------------

To run the image in the foreground with pretty-printed log messages, accessible via port 443:

    docker run -t --name=gateone -p 443:8000 liftoff/gateone
    # Ctrl-C will stop viewing the output but leave the container running

To run the image in the background (e.g. as part of a script):

    docker run -d --name=gateone -p 443:8000 liftoff/gateone

To stop and start the image after having created a container via 'docker run':

    docker stop gateone
    docker start gateone

Note that merely stopping & starting the container doesn't pull in updates.  That will only happen if you 'docker rm' container and start it back up again via 'docker run'.

Building the Image
------------------

The Dockerfile along with the update_and_run_gateone.py script and 99docker.conf can be found in [Gate One's repo on Github][3].

You can build your own copy of the liftoff/gateone image using that Dockerfile like so:

    git clone https://github.com/liftoff/GateOne.git # Clone the repo
    cd GateOne/docker
    docker build -t gateone . # Always tag your builds!

Issues, Bugs, Feature Suggestions
---------------------------------

Any problems, bugs, or suggestions for the liftoff/gateone Docker image should be opened in [Gate One's issue tracker][4].


  [1]: http://liftoffsoftware.com/Products/GateOne
  [2]: https://github.com/liftoff/GateOne
  [3]: https://github.com/liftoff/GateOne/tree/master/docker
  [4]: https://github.com/liftoff/GateOne/issues
