#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# TODO: Make it so that a username can have an @ sign in it.

__doc__ = """\
ssh_connect.py - Opens an interactive SSH session with the given arguments and
sets the window title to user@host.
"""

# Meta
__version__ = '1.2'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 2)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Import Python stdlib stuff
import os, sys, errno, readline, tempfile, base64, binascii, struct, signal, re
from subprocess import Popen
from optparse import OptionParser
# i18n support stuff
import gettext
gettext.bindtextdomain('ssh_connect', 'i18n')
gettext.textdomain('ssh_connect')
_ = gettext.gettext

# Disable ESC autocomplete for local paths (prevents information disclosure)
readline.parse_and_bind('esc: none')

# Globals
POSIX = 'posix' in sys.builtin_module_names
wrapper_script = """\
#!/bin/sh
# This variable is for easy retrieval later
SSH_SOCKET='{socket}'
{cmd}
echo '[Press Enter to close this terminal]'
read waitforuser
rm -f {temp} # Cleanup
exit 0
"""
# We have the little "wait for user" bit so users can see the ouput of a
# session before it got closed (can be lots of useful information).

# Helper functions
def mkdir_p(path):
    """Pythonic version of mkdir -p"""
    try:
        os.makedirs(path)
    except OSError as exc: # Python >2.5
        if exc.errno == errno.EEXIST:
            pass
        else: raise

def which(binary, path=None):
    """
    Returns the full path of *binary* (string) just like the 'which' command.
    Optionally, a *path* (colon-delimited string) may be given to use instead of
    os.environ['PATH'].
    """
    if path:
        paths = path.split(':')
    else:
        paths = os.environ['PATH'].split(':')
    for path in paths:
        if not os.path.exists(path):
            continue
        files = os.listdir(path)
        if binary in files:
            return os.path.join(path, binary)
    return None

def short_hash(to_shorten):
    """
    Converts *to_shorten* into a really short hash depenendent on the length of
    *to_shorten*.  The result will be safe for use as a file name.
    """
    if bytes != str: # Python 3
        to_shorten = bytes(to_shorten, 'UTF-8')
    packed = struct.pack('q', binascii.crc32(to_shorten))
    return str(base64.urlsafe_b64encode(packed)).replace('=', '')

def valid_hostname(hostname, allow_underscore=False):
    """
    Returns True if the given *hostname* is valid according to RFC rules.  Works
    with Internationalized Domain Names (IDN) and optionally, hostnames with an
    underscore (if *allow_underscore* is True).

    The rules for hostnames:

        * Must be less than 255 characters.
        * Individual labels (separated by dots) must be <= 63 characters.
        * Only the ASCII alphabet (A-Z) is allowed along with dashes (-) and dots (.).
        * May not start with a dash or a dot.
        * May not end with a dash.
        * If an IDN, when converted to Punycode it must comply with the above.

    IP addresses will be validated according to their well-known specifications.

    Examples::

        >>> valid_hostname('foo.bar.com.') # Standard FQDN
        True
        >>> valid_hostname('2foo') # Short hostname
        True
        >>> valid_hostname('-2foo') # No good:  Starts with a dash
        False
        >>> valid_hostname('host_a') # No good: Can't have underscore
        False
        >>> valid_hostname('host_a', allow_underscore=True) # Now it'll validate
        True
        >>> valid_hostname(u'ジェーピーニック.jp') # Example valid IDN
        True
    """
    # Convert to Punycode if an IDN
    try:
        hostname = hostname.encode('idna')
    except UnicodeError: # Can't convert to Punycode: Bad hostname
        return False
    try:
        hostname = str(hostname, 'UTF-8')
    except TypeError: # Python 2.6+.  Just ignore
        pass
    if len(hostname) > 255:
        return False
    if hostname[-1:] == ".": # Strip the tailing dot if present
        hostname = hostname[:-1]
    allowed = re.compile("(?!-)[A-Z\d-]{1,63}(?<!-)$", re.IGNORECASE)
    if allow_underscore:
        allowed = re.compile("(?!-)[_A-Z\d-]{1,63}(?<!-)$", re.IGNORECASE)
    return all(allowed.match(x) for x in hostname.split("."))

def valid_ip(ipaddr):
    """
    Returns True if *ipaddr* is a valid IPv4 or IPv6 address.
    """
    import socket
    if ':' in ipaddr: # IPv6 address
        try:
            socket.inet_pton(socket.AF_INET6, ipaddr)
            return True
        except socket.error:
            return False
    else:
        try:
            socket.inet_pton(socket.AF_INET, ipaddr)
            return True
        except socket.error:
            return False

def get_identities(users_ssh_dir, only_defaults=False):
    """
    Returns a list of identities stored in the user's 'ssh' directory.  It does
    this by examining os.environ['GO_USER'] os.environ['GO_USER_DIR'].  If
    *only_defaults* is True and if a '.default_ids' file exists only identities
    listed within it will be returned.
    """
    identities = []
    if os.path.exists(users_ssh_dir):
        ssh_files = os.listdir(users_ssh_dir)
        defaults_present = False
        defaults = []
        if only_defaults and '.default_ids' in ssh_files:
            defaults_present = True
            with open(os.path.join(users_ssh_dir, '.default_ids')) as f:
                defaults = f.read().splitlines()
            # Fix empty entries
            defaults = [a for a in defaults if os.path.exists(
                os.path.join(users_ssh_dir, a))]
            # Reduce absolute paths to short names (for easy matching)
            defaults = [os.path.split(a)[1] for a in defaults]
        for f in ssh_files:
            if f.endswith('.pub'):
                # If there's a public key there's probably a private one...
                identity = f[:-4] # Will be the same name minus '.pub'
                if identity in ssh_files:
                    identities.append(os.path.join(users_ssh_dir, identity))
    if defaults_present:
        # Only include identities marked as default
        identities = [a for a in identities if os.path.split(a)[1] in defaults]
    elif only_defaults:
        return []
    return identities

def openssh_connect(
        user,
        host,
        port=22,
        config=None,
        command=None,
        password=None,
        env=None,
        socket=None,
        sshfp=False,
        randomart=False,
        identities=None,
        additional_args=None):
    """
    Starts an interactive SSH session to the given host as the given user on the
    given port.
    If *command* isn't given, the equivalent of "which ssh" will be used to
    determine the full path to the ssh executable.  Otherwise *command* will be
    used.
    If a password is given, that will be passed to SSH when prompted.
    If *env* (dict) is given, that will be used for the shell env when opening
    the SSH connection.
    If *socket* (a file path) is given, this will be passed to the SSH command
    as -S<socket>.  If the socket does not exist, ssh's Master mode switch will
    be set (-M) automatically.  This allows sessions to be duplicated
    automatically.
    If *sshfp* resolves to True, SSHFP (DNS-based host verification) support
    will be enabled.
    If *randomart* resolves to True, the VisualHostKey (randomart hash) option
    will be enabled to display randomart when the connection is made.
    If *identities* given (may be a list or just a single string), it/those will
    be passed to the ssh command to use when connecting (e.g. -i/identity/path).
    If *additional_args* is given this value (or values if it is a list) will be
    added to the arguments passed to the ssh command.
    """
    try:
        int(port)
    except ValueError:
        print(_("The port must be an integer < 65535"))
        sys.exit(1)
    signal.signal(signal.SIGCHLD, signal.SIG_IGN) # No zombies
    # NOTE: Figure out if we really want to use the env forwarding feature
    if not env: # Unless we enable SendEnv in ssh these will do nothing
        env = {
            'TERM': 'xterm',
            'LANG': 'en_US.UTF-8',
        }
    # Get the default rows/cols right from the start
    try:
        env['LINES'] = os.environ['LINES']
        env['COLUMNS'] = os.environ['COLUMNS']
    except KeyError:
        pass # These variables aren't set
    # Get the user's ssh directory
    if 'GO_USER' in os.environ: # Try to use Gate One's provided user first
        go_user = os.environ['GO_USER']
    else: # Fall back to the executing user (for testing outside of Gate One)
        go_user = os.environ['USER']
    if 'GO_USER_DIR' in os.environ:
        users_dir = os.path.join(os.environ['GO_USER_DIR'], go_user)
        users_ssh_dir = os.path.join(users_dir, 'ssh')
    else: # Fall back to using the default OpenSSH location for ssh stuff
        if POSIX:
            users_ssh_dir = os.path.join(os.environ['HOME'], '.ssh')
        else:
            # Assume Windows.  TODO: Double-check this is the right default path
            users_ssh_dir = os.path.join(os.environ['USERPROFILE'], '.ssh')
    if not os.path.exists(users_ssh_dir):
        mkdir_p(users_ssh_dir)
    ssh_config_path = os.path.join(users_ssh_dir, 'config')
    if not os.path.exists(ssh_config_path):
        # Create it (an empty one so ssh doesn't error out)
        with open(ssh_config_path, 'w') as f:
            f.write('\n')
    ssh_default_identity_path = os.path.join(users_ssh_dir, 'id_ecdsa')
    args = [
        "-x", # No X11 forwarding, thanks :)
        "-F%s" % ssh_config_path, # It's OK if it doesn't exist
        # This is so people won't have to worry about user management when
        # running one-Gate One-per-server...
        "-oNoHostAuthenticationForLocalhost=yes",
        # This ensure's that the executing user's identity won't be used:
        "-oIdentityFile=%s" % ssh_default_identity_path,
        "-p", str(port),
        "-l", user,
    ]
    # If we're given specific identities use them exclusively
    if identities:
        if isinstance(identities, (unicode, str)):
            # Only one identity present, turn it into a list
            if os.path.sep not in identities:
                # Turn the short identity name into an absolute path
                identities = os.path.join(users_ssh_dir, identities)
            identities = [identities] # Make it a list
    else:
        # No identities given.  Get them from the user's dir (if any)
        identities = get_identities(users_ssh_dir, only_defaults=True)
    # Now make sure we use them in the connection...
    if identities:
        print(_(
            "The following SSH identities are being used for this "
            "connection:"))
        for identity in identities:
            if os.path.sep not in identity:
                # Turn the short identity name into an absolute path
                identity = os.path.join(users_ssh_dir, identity)
            args.insert(3, "-i%s" % identity)
            print(_("\t\x1b[1m%s\x1b[0m" % os.path.split(identity)[1]))
        args.insert(3, # Make sure we're using publickey auth first
        "-oPreferredAuthentications=publickey,keyboard-interactive,password"
        )
    else:
        args.insert(
            3, # Don't use publickey
            "-oPreferredAuthentications=keyboard-interactive,password"
        )
    if sshfp:
        args.insert(3, "-oVerifyHostKeyDNS=yes")
    if randomart:
        args.insert(3, "-oVisualHostKey=yes")
    if not command:
        if 'PATH' in env:
            command = which("ssh", path=env['PATH'])
        else:
            env['PATH'] = os.environ['PATH']
            command = which("ssh")
    if '[' in host: # IPv6 address
        # Have to remove the brackets which is silly.  See bug:
        #   https://bugzilla.mindrot.org/show_bug.cgi?id=1602
        host = host.strip('[]')
    if socket:
        # Only set Master mode if we don't have a socket for this session.
        # This allows us to duplicate a session without having to code
        # anything special to pre-recognize this condition in gateone.py or
        # gateone.js.  It makes everything automagical :)
        socket_path = socket.replace(r'%r', user) # Replace just like ssh does
        socket_path = socket_path.replace(r'%h', host)
        socket_path = socket_path.replace(r'%p', str(port))
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
            print(_(
                "\x1b]_;notice|Existing ssh session detected for ssh://%s@%s:%s;"
                " utilizing existing tunnel.\007" % (user, host, port)
            ))
        socket = socket.replace(r'%SHORT_SOCKET%', hashed)
        socket_arg = "-S%s" % socket
        # Also make sure the base directory exists
        basedir = os.path.split(socket)[0]
        mkdir_p(basedir)
        os.chmod(basedir, 0o700) # 0700 for good security practices
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
        os.chmod(temp.name, 0o700)
        temp.write('#!/bin/bash\necho "%s"\n' % password)
        temp.close()
        env['SSH_ASKPASS'] = temp.name
        env['DISPLAY'] = ':9999'
        # This removes the temporary file in a timely manner
        Popen("sleep 15 && /bin/rm -f %s" % temp.name, shell=True)
        # 15 seconds should be enough even for slow connections/servers
        # It's a tradeoff:  Lower number, more secure.  Higher number, less
        # likely to fail
    script_path = None
    if 'GO_TERM' in os.environ.keys():
        if 'GO_SESSION_DIR' in os.environ.keys():
            # Save a file indicating our session is attached to GO_TERM
            term = os.environ['GO_TERM']
            ssh_session = 'ssh:%s:%s@%s:%s' % (term, user, host, port)
            script_path = os.path.join(
                os.environ['GO_SESSION_DIR'], ssh_session)
    if not script_path:
        # Just use a generic temp file
        temp = tempfile.NamedTemporaryFile(prefix="ssh_connect", delete=False)
        script_path = "%s" % temp.name
        temp.close() # Will be written to below
    # Create our little shell script to wrap the SSH command
    script = wrapper_script.format(
        socket=socket,
        cmd=" ".join(args),
        temp=script_path)
    with open(script_path, 'w') as f:
        f.write(script) # Save it to disk
    # NOTE: We wrap in a shell script so we can execute it and immediately quit.
    # By doing this instead of keeping ssh_connect.py running we can save a lot
    # of memory (depending on how many terminals are open).
    os.chmod(script_path, 0o700) # 0700 for good security practices
    if password:
        # SSH_ASKPASS needs some special handling
        pid = os.fork()
        if pid == 0:
            # Ensure that process is detached from TTY so SSH_ASKPASS will work
            os.setsid() # This is the key
            # Execute then immediately quit so we don't use up any more memory
            # than we need.
            os.execvpe(script_path, [], env)
            os._exit(0)
        else:
            os._exit(0)
    else:
        os.execvpe(script_path, [], env)
        os._exit(0)

def telnet_connect(user, host, port=23, env=None):
    """
    Starts an interactive Telnet session to the given host as the given user on
    the given port.  *user* may be None, False, or an empty string.

    If *env* (dict) is given it will be set before excuting the telnet command.

    .. note:: Some telnet servers don't support sending the username in the connection.  In these cases it will simply ask for it after the connection is established.
    """
    try:
        int(port)
    except ValueError:
        print(_("The port must be an integer < 65535"))
        sys.exit(1)
    signal.signal(signal.SIGCHLD, signal.SIG_IGN) # No zombies
    if not env:
        env = {
            'TERM': 'xterm',
            'LANG': 'en_US.UTF-8',
        }
    # Get the default rows/cols right from the start
    try:
        env['LINES'] = os.environ['LINES']
        env['COLUMNS'] = os.environ['COLUMNS']
    except KeyError:
        pass # These variables aren't set
    if 'PATH' in env:
        command = which("telnet", path=env['PATH'])
    else:
        env['PATH'] = os.environ['PATH']
        command = which("telnet")
    args = [host, str(port)]
    if user:
        args.insert(0, user)
        args.insert(0, "-l")
    args.insert(0, command) # Command has to go first
    script_path = None
    if 'GO_TERM' in os.environ.keys():
        if 'GO_SESSION_DIR' in os.environ.keys():
            # Save a file indicating our session is attached to GO_TERM
            term = os.environ['GO_TERM']
            telnet_session = 'telnet:%s:%s@%s:%s' % (term, user, host, port)
            script_path = os.path.join(
                os.environ['GO_SESSION_DIR'], telnet_session)
    if not script_path:
        # Just use a generic temp file
        temp = tempfile.NamedTemporaryFile(prefix="ssh_connect", delete=False)
        script_path = "%s" % temp.name
        temp.close() # Will be written to below
    # Create our little shell script to wrap the SSH command
    script = wrapper_script.format(
        socket="NO SOCKET",
        cmd=" ".join(args),
        temp=script_path)
    with open(script_path, 'w') as f:
        f.write(script) # Save it to disk
    # NOTE: We wrap in a shell script so we can execute it and immediately quit.
    # By doing this instead of keeping ssh_connect.py running we can save a lot
    # of memory (depending on how many terminals are open).
    os.chmod(script_path, 0o700) # 0700 for good security practices
    os.execvpe(script_path, [], env)
    os._exit(0)

def parse_telent_url(url):
    """
    Parses a telnet URL like, 'telnet://user@host:23' and returns a tuple of::

        (user, host, port)
    """
    user = None # Default
    if '@' in url: # user@host[:port]
        host = url.split('@')[1].split(':')[0]
        user = url.split('@')[0][9:]
        if ':' in user: # Password was included (not secure but it could be useful)
            password = user.split(':')[1]
            user = user.split(':')[0]
        if len(url.split('@')[1].split(':')) == 1: # No port given, assume 22
            port = '23'
        else:
            port = url.split('@')[1].split(':')[1]
            port = port.split('/')[0] # In case there's a query string
    else: # Just host[:port] (assume $GO_USER)
        url = url[9:] # Remove the protocol
        host = url.split(':')[0]
        if len(url.split(':')) == 2: # There's a port #
            port = url.split(':')[1]
            port = port.split('/')[0] # In case there's a query string
        else:
            port = '23'
    return (user, host, port)

def parse_ssh_url(url):
    """
    Parses an ssh URL like, 'ssh://user@host:22' and returns a tuple of::

        (user, host, port, password, identities)

    .. note:: 'web+ssh://' URLs are also supported.

    If an ssh URL is given without a username, os.environ['GO_USER'] will be
    used and if that doesn't exist it will fall back to os.environ['USER'].

    SSH Identities may be specified as a query string:

        ssh://user@host:22/?identities=id_rsa,id_ecdsa

    .. note:: *password* and *identities* may be returned as None and [], respectively.
    """
    identities = []
    password = None
    ipv6 = False
    # Remove the 'web+' part if present
    if url.startswith('web+'):
        url = url[4:]
    if '@' in url: # user@host[:port]
        if '[' in url and ']' in url: # IPv6 address.
            ipv6 = True
            ipv6_addr = re.compile('\[.+\]', re.DOTALL)
            host = ipv6_addr.match(url.split('@')[1]).group()
        else:
            host = url.split('@')[1].split(':')[0]
        user = url.split('@')[0][6:]
        if ':' in user: # Password was included (not secure but it could be useful)
            password = user.split(':')[1]
            user = user.split(':')[0]
        if ipv6:
            port = ipv6_addr.split(url)[1][1:]
            if not port:
                port = '22'
        else:
            if len(url.split('@')[1].split(':')) == 1: # No port given
                port = '22'
            else:
                port = url.split('@')[1].split(':')[1]
                port = port.split('/')[0] # In case there's a query string
    else: # Just host[:port] (assume $GO_USER)
        try:
            user = os.environ['GO_USER']
        except KeyError: # Fall back to $USER
            user = os.environ['USER']
        url = url[6:] # Remove the protocol
        host = url.split(':')[0]
        if len(url.split(':')) == 2: # There's a port #
            port = url.split(':')[1]
            port = port.split('/')[0] # In case there's a query string
        else:
            port = '22'
    # Parse out any query string parameters
    if "?" in url:
        query_string = url.split('?')[1]
        options = query_string.split('&') # Looking to the future here
        options_dict = {}
        for option in options:
            # 'identities=id_rsa,id_ecdsa' -> ['identities', 'id_rsa,id_ecdsa']
            key, value = option.split('=')
            options_dict[key] = value
        # Capture the provided identities (if any)
        if 'identities' in options_dict:
            identities = options_dict['identities'].split(',')
    return (user, host, port, password, identities)

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
    parser.add_option("-c", "--command",
        dest="command",
        default='ssh',
        help=_("Path to the ssh command.  Default: 'ssh' (which usually means "
              "/usr/bin/ssh)."),
        metavar="'<filepath>'"
    )
    parser.add_option("-a", "--args",
        dest="additional_args",
        default=None,
        help=_("Any additional arguments that should be passed to the ssh "
             "command.  It is recommended to wrap these in quotes."),
        metavar="'<args>'"
    )
    parser.add_option("-S",
        dest="socket",
        default=None,
        help=_("Path to the control socket for connection sharing (see master "
              "mode and 'man ssh')."),
        metavar="'<filepath>'"
    )
    parser.add_option("--sshfp",
        dest="sshfp",
        default=False,
        action="store_true",
        help=_("Enable the use of SSHFP in verifying host keys. See:  "
              "http://en.wikipedia.org/wiki/SSHFP#SSHFP")
    )
    parser.add_option("--randomart",
        dest="randomart",
        default=False,
        action="store_true",
        help=_("Enable the VisualHostKey (randomart hash host key) option when "
              "connecting.")
    )
    parser.add_option("--logo",
        dest="logo",
        default=False,
        action="store_true",
        help=_("Display the logo image inline in the terminal.")
    )
    parser.add_option("--default_host",
        dest="default_host",
        default="localhost",
        help=_("The default host that will be used for outbound connections if "
               "no hostname is provided.  Default: localhost"),
        metavar="'<hostname>'"
    )
    (options, args) = parser.parse_args()
    # This is to prevent things like "ssh://user@host && <malicious commands>"
    bad_chars = re.compile('.*[\$\n\!\;&` |<>].*')
    try:
        if len(args) == 1:
            (user, host, port, password, identities) = parse_ssh_url(args[0])
            openssh_connect(user, host, port,
                command=options.command,
                password=password,
                sshfp=options.sshfp,
                randomart=options.randomart,
                identities=identities,
                additional_args=options.additional_args,
                socket=options.socket
            )
        elif len(args) == 2: # No port given, assume 22
            openssh_connect(args[0], args[1], '22',
                command=options.command,
                sshfp=options.sshfp,
                randomart=options.randomart,
                additional_args=options.additional_args,
                socket=options.socket
            )
        elif len(args) == 3:
            openssh_connect(args[0], args[1], args[2],
                command=options.command,
                sshfp=options.sshfp,
                randomart=options.randomart,
                additional_args=options.additional_args,
                socket=options.socket
            )
    except Exception:
        pass # Something ain't right.  Try the interactive entry method...
    password = None
    try:
        identities = []
        protocol = None
        script_dir = os.path.dirname(os.path.abspath(__file__))
        logo_path = os.path.join(script_dir, 'logo.png')
        logo = None
        # Only show the logo image if running inside Gate One
        if options.logo:
            if 'GO_TERM' in os.environ.keys():
                if os.path.exists(logo_path):
                    with open(logo_path) as f:
                        logo = f.read()
                        # stdout instead of print so we don't get an extra newline
                        sys.stdout.write(logo)
        url = None
        user = None
        port = None
        validated = False
        invalid_hostname_err = _(
            'Error:  You must enter a valid hostname or IP address.')
        invalid_port_err = _(
            'Error:  You must enter a valid port (1-65535).')
        invalid_user_err = _(
            'Error:  You must enter a valid username.')
        default_host_str = " [%s]" % options.default_host
        if options.default_host == "":
            default_host_str = ""
        while not validated:
            url = raw_input(_(
               "[Press Shift-F1 for help]\n\nHost/IP or SSH URL%s: " %
               default_host_str))
            if bad_chars.match(url):
                noop = raw_input(invalid_hostname_err)
                continue
            if not url:
                if options.default_host:
                    host = options.default_host
                    protocol = 'ssh'
                    validated = True
                else:
                    noop = raw_input(invalid_hostname_err)
                    continue
            elif url.startswith('ssh://') or url.startswith('web+ssh'):
                (user, host, port, password, identities) = parse_ssh_url(url)
                protocol = 'ssh'
            elif url.startswith('telnet://'): # This is a telnet URL
                (user, host, port) = parse_telent_url(url)
                protocol = 'telnet'
            else:
                # Always assume SSH unless given a telnet:// URL
                protocol = 'ssh'
                host = url
            if valid_hostname(host):
                validated = True
            else:
                # Double-check: It might be an IPv6 address
                # IPv6 addresses must be wrapped in brackets:
                if '[' in host and ']' in host:
                    no_brackets = host.strip('[]')
                    if valid_ip(no_brackets):
                        validated = True
                    else:
                        url = None
                        noop = raw_input(invalid_hostname_err)
                else:
                    url = None
                    noop = raw_input(invalid_hostname_err)
        validated = False
        while not validated:
            if not port:
                port = raw_input("Port [22]: ")
                if not port:
                    port = 22
            try:
                port = int(port)
                if port <= 65535 and port > 1:
                    validated = True
                else:
                    port = None
                    noop = raw_input(invalid_port_err)
            except ValueError:
                port = None
                noop = raw_input(invalid_port_err)
        validated = False
        while not validated:
            if not user:
                user = raw_input("User: ")
                if not user:
                    continue
            if bad_chars.match(user):
                noop = raw_input(invalid_user_err)
                user = None
            else:
                validated = True
        if protocol == 'ssh':
            print(_('Connecting to ssh://%s@%s:%s' % (user, host, port)))
            # Set title
            print("\x1b]0;ssh://%s@%s\007" % (user, host))
            # Special escape handler (so the rest of the plugin knows the
            # connect string)
            print("\x1b]_;ssh|%s@%s:%s\007" % (user, host, port))
            openssh_connect(user, host, port,
                command=options.command,
                password=password,
                sshfp=options.sshfp,
                randomart=options.randomart,
                identities=identities,
                additional_args=options.additional_args,
                socket=options.socket
            )
        elif protocol == 'telnet':
            if user:
                print(_('Connecting to telnet://%s@%s:%s' % (user, host, port)))
                # Set title
                print("\x1b]0;telnet://%s@%s\007" % (user, host))
            else:
                print(_('Connecting to telnet://%s:%s' % (host, port)))
                # Set title
                print("\x1b]0;telnet://%s\007" % host)
            telnet_connect(user, host, port)
    except KeyboardInterrupt:
        print(_("\nKeyboardInterrupt detected.  Quitting..."))
    except Exception as e: # Catch all
        print(_("Got Exception: %s" % e))
        import traceback
        traceback.print_exc(file=sys.stdout)
        print("Please open up a new issue at https://github.com/liftoff"
                "/GateOne/issues and paste the above information.")
        noop = raw_input(_("[Press any key to close this terminal]"))
