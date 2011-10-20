#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
ssh_connect.py - Opens an interactive SSH session with the given arguments and
sets the window title to user@host.
"""

# Meta
__version__ = '1.0' # Pretty much the only thing that ISN'T beta right now ;)
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Import Python stdlib stuff
import os, sys, errno, readline, re, tempfile, base64, binascii, struct
from subprocess import Popen, PIPE
from optparse import OptionParser

# Import 3rd party stuff
from tornado.options import options

# Globals
re_host = re.compile(r'ssh://')

# Helper functions
def mkdir_p(path):
    """Pythonic version of mkdir -p"""
    try:
        os.makedirs(path)
    except OSError as exc: # Python >2.5
        if exc.errno == errno.EEXIST:
            pass
        else: raise

def short_hash(to_shorten):
    """
    Converts *to_shorten* into a really short hash depenendent on the length of
    *to_shorten*.  The result will be safe for use as a file name.
    """
    packed = struct.pack('i', binascii.crc32(to_shorten))
    return base64.urlsafe_b64encode(packed).replace('=', '')

def connect_ssh(
        user,
        host,
        port,
        password=None,
        env=None,
        socket=None,
        sshfp=False,
        additional_args=None):
    """
    Starts an interactive SSH session to the given host as the given user on the
    given port.
    If a password is given, that will be passed to SSH when prompted.
    If *env* (dict) is given, that will be used for the shell env when opening
    the SSH connection.
    If *socket* (a file path) is given, this will be passed to the SSH command
    as -S<socket>.  If the socket does not exist, ssh's Master mode switch will
    be set (-M) automatically.  This allows sessions to be duplicated
    automatically.
    If *additional_args* is given this value (or values if it is a list) will be
    added to the arguments passed to the ssh command.
    """
    # NOTE: Figure out if we really want to use the env forwarding feature
    if not env: # Unless we enable SendEnv in ssh these will do nothing
        env = {
            'TERM': 'xterm',
            'LANG': 'en_US.UTF-8',
        }
    command = "/usr/bin/ssh"
    args = [
        "-x", # No X11 forwarding, thanks :)
        "-F/dev/null", # No config dir (might change this is the future)
        # This is so people won't have to worry about user management when
        # running one-Gate One-per-server...
        "-oNoHostAuthenticationForLocalhost=yes",
        "-oPreferredAuthentications=keyboard-interactive,password",
        "-p", port,
        "-l", user,
    ]
    if sshfp:
        args.insert(3, "-oVerifyHostKeyDNS=yes")
    if socket:
        # Only set Master mode if we don't have a socket for this session.
        # This allows us to duplicate a session without having to code
        # anything special to pre-recognize this condition in gateone.py or
        # gateone.js.  It makes everything automagical :)
        socket_path = socket.replace(r'%r', user) # Replace just like ssh does
        socket_path = socket_path.replace(r'%h', host)
        socket_path = socket_path.replace(r'%p', port)
        # The %SHORT_SOCKET% replacement is special: It replaces the equivalent
        # of ssh's %r@%h:%p with a shortened hash of the same value.  For
        # example: user@somehost:22 would become 'ud6U2Q'.  This is to avoid the
        # potential of a really long FQDN (%h) resulting in a "ControlPath too
        # long" error with the ssh command.
        user_at_host_port = "%s@%s:%s" % (user, host, port)
        hashed = short_hash(user_at_host_port)
        socket_path = socket_path.replace(r'%SHORT_SOCKET%', hashed)
        if not os.path.exists(socket_path):
            args.insert(0, "-M")
        else:
            print("\x1b]0;%s@%s (child)\007" % (user, host))
            print(
                "NOTE: Existing ssh session detected for ssh://%s@%s:%s;"
                " utilizing existing tunnel." % (user, host, port)
            )
        socket = socket.replace(r'%SHORT_SOCKET%', hashed)
        socket_arg = "-S%s" % socket
        # Also make sure the base directory exists
        basedir = os.path.split(socket)[0]
        mkdir_p(basedir)
        os.chmod(basedir, 0700) # 0700 for good security practices
        args.insert(1, socket_arg) # After -M so it is easier to see in ps
    if additional_args:
        if isinstance(additional_args, list):
            args.extend(additional_args)
        elif isinstance(additional_args, basestring):
            args.extend(additional_args.split())
    args.insert(0, command) # Command has to go first
    args.append(host) # Host should be last
    if password:
        # Create a temporary script to use with SSH_ASKPASS
        temp = tempfile.NamedTemporaryFile(delete=False)
        os.chmod(temp.name, 0700)
        temp.write('#!/bin/bash\necho "%s"\n' % password)
        temp.close()
        env['SSH_ASKPASS'] = temp.name
        env['DISPLAY'] = ':9999'
        # NOTE: preexec_fn below is necessary for SSH_ASKPASS to work
        p = Popen(args, env=env, preexec_fn=os.setsid)
        # This removes the temporary file in a timely manner
        rm = Popen("sleep 15 && /bin/rm -f " + temp.name, shell=True)
        # 15 seconds should be enough even for slow connections/servers
        # It's a tradeoff:  Lower number, more secure.  Higher number, less
        # likely to fail
    else:
        p = Popen(args)
    if 'GO_TERM' in os.environ.keys():
        if 'GO_SESSION_DIR' in os.environ.keys():
            # Save a file indicating our session is attached to GO_TERM
            term = os.environ['GO_TERM']
            ssh_session = 'ssh:%s:%s@%s:%s' % (term, user, host, port)
            term_hint_path = os.environ['GO_SESSION_DIR'] + '/%s' % ssh_session
            with open(term_hint_path, 'w') as f:
                # Doesn't really matter what we write in here...  args works
                f.write(" ".join(args) + '\n')
    pid, retcode = os.waitpid(p.pid, 0)
    # We have this little "wait for user input" bit so users can see the ouput
    # of a session before it got closed (can be lots of useful information).
    wait = raw_input("[Press Enter to close this terminal]")
    # Clean up
    if 'GO_TERM' in os.environ.keys():
        if 'GO_SESSION_DIR' in os.environ.keys():
            os.remove(term_hint_path)
    sys.exit(retcode/256) # os.waitpid() return code is * 256 for some reason

def parse_ssh_url(url):
    """
    Parses an ssh URL like, 'ssh://user@host:22' and returns a tuple of:
        (user, host, port, password)

    NOTE: *password* may be None
    """
    password = None
    if '@' in url: # user@host[:port]
        host = url.split('@')[1].split(':')[0]
        user = url.split('@')[0][6:]
        if ':' in user: # Password was included (not secure but it could be useful)
            password = user.split(':')[1]
            user = user.split(':')[0]
        if len(url.split('@')[1].split(':')) == 1: # No port given, assume 22
            port = '22'
        else:
            port = url.split('@')[1].split(':')[1]
    else: # Just host[:port] (assume $USER)
        user = os.environ['USER']
        url = url[6:] # Remove the protocol
        host = url.split(':')[0]
        if len(url.split(':')) == 2: # There's a port #
            port = url.split(':')[1]
        else:
            port = '22'
    return (user, host, port, password)

if __name__ == "__main__":
    """Parse command line arguments and execute ssh_connect()"""
    usage = (
        #'Usage:\n'
            '\t%prog [options] <user> <host> [port]\n'
        '...or...\n'
            '\t%prog [options] <ssh://user@host[:port]>'
    )
    parser = OptionParser(usage=usage, version=__version__)
    parser.disable_interspersed_args()
    parser.add_option("-a", "--args",
        dest="additional_args",
        default=None,
        help=("Any additional arguments that should be passed to the ssh "
             "command.  It is recommended to wrap these in quotes."),
        metavar="'<args>'"
    )
    parser.add_option("-S",
        dest="socket",
        default=None,
        help=("Path to the control socket for connection sharing (see master "
              "mode and 'man ssh')."),
        metavar="'<filepath>'"
    )
    parser.add_option("--sshfp",
        dest="sshfp",
        default=True,
        help=("Enable the use of SSHFP in verifying host keys. See:  "
              "http://en.wikipedia.org/wiki/SSHFP#SSHFP")
    )
    (options, args) = parser.parse_args()
    try:
        if len(args) == 1:
            (user, host, port, password) = parse_ssh_url(args[0])
            connect_ssh(user, host, port,
                password=password,
                sshfp=options.sshfp,
                additional_args=options.additional_args,
                socket=options.socket
            )
        elif len(args) == 2: # No port given, assume 22
            connect_ssh(args[0], args[1], '22',
                sshfp=options.sshfp,
                additional_args=options.additional_args,
                socket=options.socket
            )
        elif len(args) == 3:
            connect_ssh(args[0], args[1], args[2],
                sshfp=options.sshfp,
                additional_args=options.additional_args,
                socket=options.socket
            )
    except Exception as e:
        pass # Something ain't right.  Try the interactive entry method...
    password = None
    try:
        url = raw_input(
            "[Press Shift-F1 for help]\n\nHost/IP or SSH URL [localhost]: ")
        if url.startswith('ssh://'): # This is an SSH URL
            (user, host, port, password) = parse_ssh_url(url)
        else:
            port = raw_input("Port [22]: ")
            if not port:
                port = '22'
            user = raw_input("User: ")
            host = url
        if not url:
            host = 'localhost'
        print('Connecting to: ssh://%s@%s:%s' % (user, host, port))
        # TODO: Add some way here to communicate to Gate One the specific SSH URL being connected to so it is easy to duplicate.
        # Set title (might be redundant but doesn't hurt)
        print("\x1b]0;%s@%s\007" % (user, host))
        # Special escape handler:
        print("\x1b]_;ssh|%s@%s:%s\007" % (user, host, port))
        connect_ssh(user, host, port,
            password=password,
            sshfp=options.sshfp,
            additional_args=options.additional_args,
            socket=options.socket
        )
    except Exception as e: # Catch all
        print e
        noop = raw_input("[Press Enter to close this terminal]")