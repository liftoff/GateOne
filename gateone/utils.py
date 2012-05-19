# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

__doc__ = """\
Gate One utility functions and classes.
"""

# Meta
__version__ = '1.1'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 1)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Import stdlib stuff
import os
import signal
import sys
import random
import re
import errno
import uuid
import logging
import mimetypes
import gzip
import fcntl
from datetime import timedelta

# Import 3rd party stuff
from tornado import locale
try:
    from tornado.escape import json_encode as _json_encode
    from tornado.escape import json_decode
except ImportError: # Tornado isn't available
    from json import dumps as _json_encode
    from json import loads as json_encode
from tornado.escape import to_unicode, utf8

# Globals
MACOS = os.uname()[0] == 'Darwin'
# This matches JUST the PIDs from the output of the pstree command
#RE_PSTREE = re.compile(r'\(([0-9]*)\)')
# Matches Gate One's special optional escape sequence (ssh plugin only)
#RE_OPT_SSH_SEQ = re.compile(
    #r'.*\x1b\]_\;(ssh\|.+?)(\x07|\x1b\\)', re.MULTILINE|re.DOTALL)
## Matches an xterm title sequence
#RE_TITLE_SEQ = re.compile(
    #r'.*\x1b\][0-2]\;(.+?)(\x07|\x1b\\)', re.DOTALL|re.MULTILINE)
# This is used by the raw() function to show control characters
REPLACEMENT_DICT = {
    0: u'^@',
    1: u'^A',
    2: u'^B',
    3: u'^C',
    4: u'^D',
    5: u'^E',
    6: u'^F',
    7: u'^G',
    8: u'^H',
    9: u'^I',
    #10: u'^J', # Newline (\n)
    11: u'^K',
    12: u'^L',
    #13: u'^M', # Carriage return (\r)
    14: u'^N',
    15: u'^O',
    16: u'^P',
    17: u'^Q',
    18: u'^R',
    19: u'^S',
    20: u'^T',
    21: u'^U',
    22: u'^V',
    23: u'^W',
    24: u'^X',
    25: u'^Y',
    26: u'^Z',
    27: u'^[',
    28: u'^\\',
    29: u'^]',
    30: u'^^',
    31: u'^_',
    127: u'^?',
}
# These should match what's in the syslog module (hopefully not platform-dependent)
FACILITIES = {
    'auth': 32,
    'cron': 72,
    'daemon': 24,
    'kern': 0,
    'local0': 128,
    'local1': 136,
    'local2': 144,
    'local3': 152,
    'local4': 160,
    'local5': 168,
    'local6': 176,
    'local7': 184,
    'lpr': 48,
    'mail': 16,
    'news': 56,
    'syslog': 40,
    'user': 8,
    'uucp': 64
}
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log

# Exceptions
class UnknownFacility(Exception):
    """
    Raised if `string_to_syslog_facility` is given a string that doesn't match
    a known syslog facility.
    """
    pass

class MimeTypeFail(Exception):
    """
    Raised by `create_data_uri` if the mimetype of a file could not be guessed.
    """
    pass

class SSLGenerationError(Exception):
    """
    Raised by `gen_self_signed_ssl` if an error is encountered generating a
    self-signed SSL certificate.
    """
    pass

class ChownError(Exception):
    """
    Raised by `recursive_chown` if an OSError is encountered while trying to
    recursively chown a directory.
    """
    pass

# Functions
def noop(*args, **kwargs):
    """Do nothing (i.e. "No Operation")"""
    pass

def write_pid(path):
    """Writes our PID to *path*."""
    try:
        pid = os.getpid()
        with open(path, 'w') as pidfile:
            # Get a non-blocking exclusive lock
            fcntl.flock(pidfile.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            pidfile.seek(0)
            pidfile.truncate(0)
            pidfile.write(str(pid))
    except:
        raise
    finally:
        try:
            pidfile.close()
        except:
            pass

def read_pid(path):
    """Reads our current PID from *path*."""
    return str(open(path).read())

def remove_pid(path):
    """Removes the PID file at *path*."""
    try:
        os.remove(path)
    except:
        pass


def shell_command(cmd, timeout_duration=5):
    """
    Resets the SIGCHLD signal handler (if necessary), executes *cmd* via
    :func:`commands.getstatusoutput`, then re-enables the SIGCHLD handler (if it
    was set to something other than SIG_DFL).  Returns the result of
    `getstatusoutput` which is a tuple in the form of::

        (exitstatus, output)

    If the command takes longer than *timeout_duration* seconds, it will be
    auto-killed and the following will be returned::

        (255, _("ERROR: Timeout running shell command"))
    """
    from commands import getstatusoutput
    existing_handler = signal.getsignal(signal.SIGCHLD)
    default = (255, _("ERROR: Timeout running shell command"))
    if existing_handler != 0: # Something other than default
        # Reset it to default so getstatusoutput will work properly
        try:
            signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        except ValueError:
            # "Signal only works in the main thread" - no big deal.  This just
            # means we never needed to call signal in the first place.
            pass
    result = timeout_func(
        getstatusoutput,
        args=(cmd,),
        default=default,
        timeout_duration=timeout_duration
    )
    try:
        signal.signal(signal.SIGCHLD, existing_handler)
    except ValueError:
        # Like above, signal only works from within the main thread but our use
        # of it here would only matter if we were in the main thread.
        pass
    return result

def json_encode(obj):
    """
    On some platforms (CentOS 6.2, specifically) `tornado.escape.json_decode`
    doesn't seem to work just right when it comes to returning unicode strings.
    This is just a wrapper that ensures that the returned string is unicode.
    """
    return to_unicode(_json_encode(obj))

def get_translation():
    """
    Looks inside GATEONE_DIR/server.conf to determine the configured locale and
    returns a matching locale.get_translation function.  Meant to be used like
    this:

        >>> from utils import get_translation
        >>> _ = get_translation()
    """
    gateone_dir = os.path.dirname(os.path.abspath(__file__))
    server_conf = os.path.join(gateone_dir, 'server.conf')
    try:
        locale_str = os.environ.get('LANG', 'en_US').split('.')[0]
        with open(server_conf) as f:
            for line in f:
                if line.startswith('locale'):
                    locale_str = line.split('=')[1].strip()
                    locale_str = locale_str.strip('"').strip("'")
                    break
    except IOError: # server.conf doesn't exist (yet).
        # Fall back to os.environ['LANG']
        # Already set above
        pass
    user_locale = locale.get(locale_str)
    return user_locale.translate

def gen_self_signed_ssl():
    """
    Generates a self-signed SSL certificate using pyOpenSSL or the openssl
    command depending on what's available,  The resulting key/certificate will
    use the RSA algorithm at 4096 bits.
    """
    try:
        import OpenSSL
        # Direct OpenSSL library calls are better than executing commands...
        gen_self_signed_func = gen_self_signed_pyopenssl
    except ImportError:
        gen_self_signed_func = gen_self_signed_openssl
    try:
        gen_self_signed_func()
    except SSLGenerationError as e:
        logging.error(_(
            "Error generating self-signed SSL key/certificate: %s" % e))

def gen_self_signed_openssl():
    """
    This method will generate a secure self-signed SSL key/certificate pair
    (using the `openssl <http://www.openssl.org/docs/apps/openssl.html>`_
    command) saving the result as 'certificate.pem' and 'keyfile.pem' in the
    current working directory.  The certificate will be valid for 10 years.
    """
    subject = (
        '-subj "/OU=%s (Self-Signed)/CN=Gate One/O=Liftoff Software"' %
        os.uname()[1] # Hostname
    )
    gen_command = (
        "openssl genrsa -aes256 -out keyfile.pem.tmp -passout pass:password 4096"
    )
    decrypt_key_command = (
        "openssl rsa -in keyfile.pem.tmp -passin pass:password -out keyfile.pem"
    )
    csr_command = (
        "openssl req -new -key keyfile.pem -out temp.csr %s" % subject
    )
    cert_command = (
        "openssl x509 -req "    # Create a new x509 certificate
        "-days 3650 "           # That lasts 10 years
        "-in temp.csr "         # Using the CSR we just generated
        "-signkey keyfile.pem " # Sign it with keyfile.pem that we just created
        "-out certificate.pem"  # Save it as certificate.pem
    )
    exitstatus, output = shell_command(gen_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to create private SSL key:\n%s" % output)
        if os.path.exists('keyfile.pem.tmp'):
            os.remove('keyfile.pem.tmp')
        raise SSLGenerationError(error_msg)
    exitstatus, output = shell_command(decrypt_key_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to decrypt private SSL key:\n%s" % output)
        if os.path.exists('keyfile.pem.tmp'):
            os.remove('keyfile.pem.tmp')
        raise SSLGenerationError(error_msg)
    exitstatus, output = shell_command(csr_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to create CSR:\n%s" % output)
        if os.path.exists('keyfile.pem.tmp'):
            os.remove('keyfile.pem.tmp')
        if os.path.exists('temp.csr'):
            os.remove('temp.csr')
        raise SSLGenerationError(error_msg)
    exitstatus, output = shell_command(cert_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to create certificate:\n%s" % output)
        if os.path.exists('keyfile.pem.tmp'):
            os.remove('keyfile.pem.tmp')
        if os.path.exists('temp.csr'):
            os.remove('temp.csr')
        if os.path.exists('certificate.pem'):
            os.remove('certificate.pem')
        raise SSLGenerationError(error_msg)
    # Clean up unnecessary leftovers
    os.remove('keyfile.pem.tmp')
    os.remove('temp.csr')


def gen_self_signed_pyopenssl(notAfter=None):
    """
    This method will generate a secure self-signed SSL key/certificate pair
    (using pyOpenSSL) saving the result as 'certificate.pem' and 'keyfile.pem'
    in the current working directory.  By default the certificate will be valid
    for 10 years but this can be overridden by passing a valid timestamp via the
    *notAfter* argument.

    Examples::

        >>> gen_self_signed_ssl(60 * 60 * 24 * 365) # 1-year certificate
        >>> gen_self_signed_ssl() # 10-year certificate
    """
    try:
        import OpenSSL
    except ImportError:
        error_msg = _(
            "Error: You do not have pyOpenSSL installed.  Please install "
            "it (sudo pip install pyopenssl.")
        raise SSLGenerationError(error_msg)
    pkey = OpenSSL.crypto.PKey()
    pkey.generate_key(OpenSSL.crypto.TYPE_RSA, 4096)
    # Save the key as 'keyfile.pem':
    with open('keyfile.pem', 'w') as f:
        f.write(OpenSSL.crypto.dump_privatekey(
            OpenSSL.crypto.FILETYPE_PEM, pkey))
    cert = OpenSSL.crypto.X509()
    cert.set_serial_number(random.randint(0, sys.maxint))
    cert.gmtime_adj_notBefore(0)
    if notAfter:
        cert.gmtime_adj_notAfter(notAfter)
    else:
        cert.gmtime_adj_notAfter(60 * 60 * 24 * 3650)
    cert.get_subject().CN = '*'
    cert.get_subject().O = 'Gate One Certificate'
    cert.get_issuer().CN = 'Untrusted Authority'
    cert.get_issuer().O = 'Self-Signed'
    cert.set_pubkey(pkey)
    cert.sign(pkey, 'md5')
    with open('certificate.pem', 'w') as f:
        f.write(OpenSSL.crypto.dump_certificate(
            OpenSSL.crypto.FILETYPE_PEM, cert))

def none_fix(val):
    """
    If *val* is a string that utlimately means 'none', return None.  Otherwise
    return *val* as-is.  Examples::

        >>> none_fix('none')
        None
        >>> none_fix('0')
        None
        >>> none_fix('whatever')
        'whatever'
    """
    if isinstance(val, basestring) and val.lower() in ['none', '0', 'no']:
        return None
    else:
        return val

def str2bool(val):
    """
    Converts strings like, 'false', 'true', '0', and '1' into their boolean
    equivalents.  If no logical match is found, return False.  Examples::

        >>> str2bool('false')
        False
        >>> str2bool('1')
        True
        >>> st2bool('whatever')
        False
    """
    if isinstance(val, basestring) and val.lower() in ['1', 'true', 'yes']:
        return True
    else:
        return False

def generate_session_id():
    """
    Returns a random, 45-character session ID.  Example:

    .. code-block:: python

        >>> generate_session_id()
        "NzY4YzFmNDdhMTM1NDg3Y2FkZmZkMWJmYjYzNjBjM2Y5O"
        >>>
    """
    import base64
    session_id = base64.b64encode(
        utf8(uuid.uuid4().hex + uuid.uuid4().hex))[:45]
    if bytes != str: # Python 3
        return str(session_id, 'UTF-8')
    return session_id

def mkdir_p(path):
    """
    Pythonic version of "mkdir -p".  Example equivalents::

        >>> import commands
        >>> mkdir_p('/tmp/test/testing') # Does the same thing as below:
        >>> commands.getstatusoutput('mkdir -p /tmp/test/testing')

    .. note:: This doesn't actually call any external commands.
    """
    try:
        os.makedirs(path)
    except OSError as exc: # Python >2.5
        if exc.errno == errno.EEXIST:
            pass
        else: raise

def cmd_var_swap(cmd,
        session=None, session_hash=None, user_dir=None, user=None, time=None):
    """
    Returns *cmd* with special inline variables swapped out for their respective
    argument values.  The special variables are as follows:

        ==============  ==============
        %SESSION%       *session*
        %SESSION_HASH%  *session_hash*
        %USERDIR%       *user_dir*
        %USER%          *user*
        %TIME%          *time*
        ==============  ==============

    This allows for unique or user-specific values to be swapped into command
    line arguments like so::

        ssh_connect.py -M -S '/tmp/gateone/%SESSION%/%r@%L:%p'

    The values passed into this function can be whatever you like.  They don't
    necessarily have to match their intended values.
    """
    if session:
        cmd = cmd.replace(r'%SESSION%', session)
    if session_hash:
        cmd = cmd.replace(r'%SESSION_HASH%', session_hash)
    if user_dir:
        cmd = cmd.replace(r'%USERDIR%', user_dir)
    if user:
        cmd = cmd.replace(r'%USER%', user)
    if time:
        cmd = cmd.replace(r'%TIME%', str(time))
    return cmd

def short_hash(to_shorten):
    """
    Converts *to_shorten* into a really short hash depenendent on the length of
    *to_shorten*.  The result will be safe for use as a file name.
    """
    import struct, binascii, base64
    packed = struct.pack('q', binascii.crc32(utf8(to_shorten)))
    return str(base64.urlsafe_b64encode(packed)).replace('=', '')

def get_process_tree(parent_pid):
    """
    Returns a list of child pids that were spawned from *parent_pid*.

    .. note:: Will include parent_pid in the output list.
    """
    parent_pid = str(parent_pid) # Has to be a string
    ps = which('ps')
    retcode, output = shell_command('%s -ef' % ps)
    out = [parent_pid]
    pidmap = []
    # Construct the pidmap:
    for line in output.splitlines():
        split_line = line.split()
        pid = split_line[1]
        ppid = split_line[2]
        pidmap.append((pid, ppid))
    def walk_pids(pidmap, checkpid):
        """
        Recursively walks the given *pidmap* and updates the *out* variable with
        the child pids of *checkpid*.
        """
        for pid, ppid in pidmap:
            if ppid == checkpid:
                out.append(pid)
                walk_pids(pidmap, pid)
    walk_pids(pidmap, parent_pid)
    return out

def kill_dtached_proc(session, term):
    """
    Kills the dtach processes associated with the given *term* and all its
    sub-processes.  Requires *session* so it can figure out the right
    processess to kill.
    """
    logging.debug('kill_dtached_proc(%s, %s)' % (session, term))
    dtach_socket_name = 'dtach_%s' % term
    to_kill = []
    for f in os.listdir('/proc'):
        pid_dir = os.path.join('/proc', f)
        if os.path.isdir(pid_dir):
            try:
                pid = int(f)
            except ValueError:
                continue # Not a PID
            try:
                with open(os.path.join(pid_dir, 'cmdline')) as f:
                    cmdline = f.read()
                if cmdline and session in cmdline:
                    if dtach_socket_name in cmdline:
                        to_kill.append(pid)
            except Exception as e:
                #logging.debug("Couldn't read the cmdline of PID %s" % pid)
                #logging.debug(e)
                pass # Already dead, no big deal.
                # Uncomment above if you're having problems or think otherwise.
    for pid in to_kill:
        kill_pids = get_process_tree(pid)
        for _pid in kill_pids:
            _pid = int(_pid)
            try:
                os.kill(_pid, signal.SIGTERM)
            except OSError:
                pass # Process already died.  Not a problem.

def kill_dtached_proc_macos(session, term):
    """
    A Mac OS-specific implementation of `kill_dtached_proc` since Macs don't
    have /proc.  Seems simpler than :func:`kill_dtached_proc` but actually
    having to call a subprocess is less efficient (due to the sophisticated
    signal handling required by :func:`shell_command`).
    """
    logging.debug('kill_dtached_proc_macos(%s, %s)' % (session, term))
    ps = which('ps')
    cmd = (
        "%s -ef | "
        "grep %s/dtach_%s | " # Limit to those matching our session/term combo
        "grep -v grep | " # Get rid of grep from the results (if present)
        "awk '{print $2}' " % (ps, session, term) # Just the PID please
    )
    exitstatus, output = shell_command(cmd)
    for line in output.splitlines():
        pid_to_kill = line.strip() # Get rid of trailing newline
        for pid in get_process_tree(pid_to_kill):
            try:
                os.kill(int(pid), signal.SIGTERM)
            except OSError:
                pass # Process already died.  Not a problem.

def killall(session_dir):
    """
    Kills all running Gate One terminal processes including any detached dtach
    sessions.

    :session_dir: The path to Gate One's session directory.
    """
    sessions = os.listdir(session_dir)
    for f in os.listdir('/proc'):
        pid_dir = os.path.join('/proc', f)
        if os.path.isdir(pid_dir):
            try:
                pid = int(f)
                if pid == os.getpid():
                    continue # It would be suicide!
            except ValueError:
                continue # Not a PID
            with open(os.path.join(pid_dir, 'cmdline')) as f:
                cmdline = f.read()
            for session in sessions:
                if session in cmdline:
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass # PID is already dead--great
                elif 'python' in cmdline:
                    if 'gateone.py' in cmdline:
                        try:
                            os.kill(pid, signal.SIGTERM)
                        except OSError:
                            pass # PID is already dead--great

def killall_macos(session_dir):
    """
    A Mac OS X-specific version of `killall` since Macs don't have /proc.
    """
    # TODO: See if there's a better way to keep track of subprocesses so we
    # don't have to enumerate the process table at all.
    sessions = os.listdir(session_dir)
    for session in sessions:
        cmd = (
            "ps -ef | "
            "grep %s | " # Limit to those matching the session
            "grep -v grep | " # Get rid of grep from the results (if present)
            "awk '{print $2}' | " # Just the PID please
            "xargs kill" % session # Kill em'
        )
        exitstatus, output = shell_command(cmd)

def create_plugin_links(static_dir, templates_dir, plugin_dir):
    """
    Creates symbolic links for all plugins in the ./static/ and ./templates/
    directories.  The equivalent of:

    .. ansi-block::

        \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m ln -s *plugin_dir*/<plugin>/static *static_dir*/<plugin>
        \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m ln -s *plugin_dir*/<plugin>/templates *templates_dir*/<plugin>

    This is so plugins can reference files in these directories using the
    following straightforward paths::

        https://<gate one>/static/<plugin name>/<some file>
        https://<gate one>/render/<plugin name>/<some file>

    This function will also remove any dead links if a plugin is removed.
    """
    # Clean up dead links before we do anything else
    for f in os.listdir(static_dir):
        if os.path.islink(f):
            if not os.path.exists(os.readlink(f)):
                os.unlink(f)
    for f in os.listdir(templates_dir):
        if os.path.islink(f):
            if not os.path.exists(os.readlink(f)):
                os.unlink(f)
    # Create symbolic links for each plugin's respective static directory
    for directory in os.listdir(plugin_dir):
        plugin_name = directory
        directory = os.path.join(plugin_dir, directory) # Make absolute
        for f in os.listdir(directory):
            if f == 'static':
                abs_src_path = os.path.join(directory, f)
                abs_dest_path = os.path.join(static_dir, plugin_name)
                try:
                    os.symlink(abs_src_path, abs_dest_path)
                except OSError:
                    pass # Already exists
            if f == 'templates':
                abs_src_path = os.path.join(directory, f)
                abs_dest_path = os.path.join(templates_dir, plugin_name)
                try:
                    os.symlink(abs_src_path, abs_dest_path)
                except OSError:
                    pass # Already exists

def get_plugins(plugin_dir):
    """
    Adds plugins' Python files to `sys.path` and returns a dictionary of
    JavaScript, CSS, and Python files contained in *plugin_dir* like so::

        {
            'js': [ // NOTE: These would be be inside *plugin_dir*/static
                '/static/happy_plugin/whatever.js',
                '/static/ssh/ssh.js',
            ],
            'css': ['/cssrender?plugin=bookmarks&template=bookmarks.css'],
            // NOTE: CSS URLs will require '&container=<container>' and '&prefix=<prefix>' to load.
            'py': [ // NOTE: These will get added to sys.path
                'happy_plugin',
                'ssh'
            ],
        }

    \*.js files inside of *plugin_dir*/<the plugin>/static will get automatically
    added to Gate One's index.html like so:

    .. code-block:: html

        {% for jsplugin in jsplugins %}
            <script type="text/javascript" src="{{jsplugin}}"></script>
        {% end %}

    \*.css files will get imported automatically by GateOne.init()
    """
    out_dict = {'js': [], 'css': [], 'py': []}
    for directory in os.listdir(plugin_dir):
        plugin = directory
        http_static_path = '/static/%s' % plugin
        directory = os.path.join(plugin_dir, directory) # Make absolute
        plugin_files = os.listdir(directory)
        if "__init__.py" in plugin_files:
            out_dict['py'].append(plugin) # Just need the base
            sys.path.insert(0, directory)
        else: # Look for .py files
            for plugin_file in plugin_files:
                if plugin_file.endswith('.py'):
                    plugin_path = os.path.join(directory, plugin_file)
                    sys.path.insert(0, directory)
                    (basename, ext) = os.path.splitext(plugin_path)
                    basename = basename.split('/')[-1]
                    out_dict['py'].append(basename)
        for plugin_file in plugin_files:
            if plugin_file == 'static':
                static_dir = os.path.join(directory, plugin_file)
                for static_file in os.listdir(static_dir):
                    if static_file.endswith('.js'):
                        http_path = os.path.join(http_static_path, static_file)
                        out_dict['js'].append(http_path)
                    elif static_file.endswith('.css'):
                        http_path = os.path.join(http_static_path, static_file)
                        out_dict['css'].append(http_path)
            if plugin_file == 'templates':
                templates_dir = os.path.join(directory, plugin_file)
                for template_file in os.listdir(templates_dir):
                    if template_file.endswith('.css'):
                        http_path = "/cssrender?plugin=%s&template=%s" % (
                            plugin, template_file)
                        out_dict['css'].append(http_path)
    # Sort all plugins alphabetically so the order in which they're applied can
    # be controlled somewhat predictably
    out_dict['py'].sort()
    out_dict['js'].sort()
    out_dict['css'].sort()
    return out_dict

def load_plugins(plugins):
    """
    Given a list of *plugins*, imports them.

    .. note::  Assumes they're all in `sys.path`.
    """
    out_list = []
    for plugin in plugins:
        imported = __import__(plugin, None, None, [''])
        out_list.append(imported)
    return out_list

def merge_handlers(handlers):
    """
    Takes a list of Tornado *handlers* like this::

        [
            (r"/", MainHandler),
            (r"/ws", TerminalWebSocket),
            (r"/auth", AuthHandler),
            (r"/style", StyleHandler),
                ...
            (r"/style", SomePluginHandler),
        ]

    ...and returns a list with duplicate handlers removed; giving precedence to
    handlers with higher indexes.  This allows plugins to override Gate One's
    default handlers.  Given the above, this is what would be returned::

        [
            (r"/", MainHandler),
            (r"/ws", TerminalWebSocket),
            (r"/auth", AuthHandler),
                ...
            (r"/style", SomePluginHandler),
        ]

    This example would replace the default "/style" handler with
    SomePluginHandler; overriding Gate One's default StyleHandler.
    """
    out_list = []
    regexes = []
    handlers.reverse()
    for handler in handlers:
        if handler[0] not in regexes:
            regexes.append(handler[0])
            out_list.append(handler)
    out_list.reverse()
    return out_list

# NOTE: This function has been released under the Apache 2.0 license.
# See: http://code.activestate.com/recipes/577894-convert-strings-like-5d-and-60s-to-timedelta-objec/
def convert_to_timedelta(time_val):
    """
    Given a *time_val* (string) such as '5d', returns a `datetime.timedelta` object
    representing the given value (e.g. timedelta(days=5)).  Accepts the
    following '<num><char>' formats:

    =========   ======= ===================
    Character   Meaning Example
    =========   ======= ===================
    s           Seconds '60s' -> 60 Seconds
    m           Minutes '5m'  -> 5 Minutes
    h           Hours   '24h' -> 24 Hours
    d           Days    '7d'  -> 7 Days
    =========   ======= ===================

    Examples::

        >>> convert_to_timedelta('7d')
        datetime.timedelta(7)
        >>> convert_to_timedelta('24h')
        datetime.timedelta(1)
        >>> convert_to_timedelta('60m')
        datetime.timedelta(0, 3600)
        >>> convert_to_timedelta('120s')
        datetime.timedelta(0, 120)
    """
    num = int(time_val[:-1])
    if time_val.endswith('s'):
        return timedelta(seconds=num)
    elif time_val.endswith('m'):
        return timedelta(minutes=num)
    elif time_val.endswith('h'):
        return timedelta(hours=num)
    elif time_val.endswith('d'):
        return timedelta(days=num)

def convert_to_bytes(size_val):
    """
    Given a *size_val* (string) such as '100M', returns an integer representing
    an equivalent amount of bytes.  Accepts the following '<num><char>' formats:

    =========== ==========  ===================
    Character   Meaning     Example
    =========== ==========  ===================
    B (or none) Bytes       '100' or '100b' -> 100
    K           Kilobytes   '1k' -> 1024
    M           Megabytes   '1m' -> 1048576
    G           Gigabytes   '1g' -> 1073741824
    T           Terabytes   '1t' -> 1099511627776
    P           Petabytes   '1p' -> 1125899906842624
    E           Exabytes    '1e' -> 1152921504606846976
    Z           Zettabytes  '1z' -> 1180591620717411303424L
    Y           Yottabytes  '7y' -> 1208925819614629174706176L
    =========== ==========  ===================

    .. note:: If no character is given the *size_val* will be assumed to be in bytes.

    .. tip:: All characters will be converted to upper case before conversion (case-insensitive).

    Examples::

        >>> convert_to_bytes('2M')
        2097152
        >>> convert_to_bytes('2g')
        2147483648
    """
    symbols = "BKMGTPEZY"
    letter = size_val[-1:].strip().upper()
    if letter.isdigit(): # Assume bytes
        letter = 'B'
        num = size_val
    else:
        num = size_val[:-1]
    assert num.isdigit() and letter in symbols
    num = float(num)
    prefix = {symbols[0]:1}
    for i, size_val in enumerate(symbols[1:]):
        prefix[size_val] = 1 << (i+1)*10
    return int(num * prefix[letter])

def process_opt_esc_sequence(chars):
    """
    Parse the *chars* passed from `terminal.Terminal` by way of the special,
    optional escape sequence handler (e.g. '<plugin>|<text>') into a tuple of
    (<plugin name>, <text>).  Here's an example::

        >>> process_opt_esc_sequence('ssh|user@host:22')
        ('ssh', 'user@host:22')
    """
    plugin = None
    text = ""
    try:
        plugin, text = chars.split('|')
    except Exception as e:
        pass # Something went horribly wrong!
    return (plugin, text)

def raw(text, replacement_dict=None):
    """
    Returns *text* as a string with special characters replaced by visible
    equivalents using *replacement_dict*.  If *replacement_dict* is None or
    False the global REPLACEMENT_DICT will be used.  Example::

        >>> test = '\\x1b]0;Some xterm title\x07'
        >>> print(raw(test))
        '^[]0;Some title^G'
    """
    if not replacement_dict:
        replacement_dict = REPLACEMENT_DICT
    out = u''
    for char in text:
        charnum = ord(char)
        if charnum in replacement_dict.keys():
            out += replacement_dict[charnum]
        else:
            out += char
    return out

def string_to_syslog_facility(facility):
    """
    Given a string (*facility*) such as, "daemon" returns the numeric
    syslog.LOG_* equivalent.
    """
    if facility.lower() in FACILITIES:
        return FACILITIES[facility.lower()]
    else:
        raise UnknownFacility(_(
            "%s does not match a known syslog facility" % repr(facility)))

def create_data_uri(filepath):
    """
    Given a file at *filepath*, return that file as a data URI.

    Raises a `MimeTypeFail` exception if the mimetype could not be guessed.
    """
    import base64
    mimetype = mimetypes.guess_type(filepath)[0]
    if not mimetype:
        raise MimeTypeFail("Could not guess mime type of: %s" % filepath)
    with open(filepath, 'rb') as f:
        data = f.read()
    encoded = str(base64.b64encode(data)).replace('\n', '')
    if len(encoded) > 65000:
        logging.warn(
            "WARNING: Data URI > 65,000 characters.  You're pushing it buddy!")
    data_uri = "data:%s;base64,%s" % (mimetype, encoded)
    return data_uri

def human_readable_bytes(nbytes):
    """
    Returns *nbytes* as a human-readable string in a similar fashion to how it
    would be displayed by 'ls -lh' or 'df -h'.
    """
    K, M, G, T = 1 << 10, 1 << 20, 1 << 30, 1 << 40
    if nbytes >= T:
        return '%.1fT' % (float(nbytes)/T)
    elif nbytes >= G:
        return '%.1fG' % (float(nbytes)/G)
    elif nbytes >= M:
        return '%.1fM' % (float(nbytes)/M)
    elif nbytes >= K:
        return '%.1fK' % (float(nbytes)/K)
    else:
        return '%d' % nbytes

def which(binary, path=None):
    """
    Returns the full path of *binary* (string) just like the 'which' command.
    Optionally, a *path* (colon-delimited string) may be given to use instead of
    `os.environ` ['PATH'].
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

def timeout_func(func, args=(), kwargs={}, timeout_duration=10, default=None):
    """
    Sets a timeout on the given function, passing it the given args, kwargs,
    and a *default* value to return in the event of a timeout.  If *default* is
    a function that function will be called in the event of a timeout.
    """
    import threading
    class InterruptableThread(threading.Thread):
        def __init__(self):
            threading.Thread.__init__(self)
            self.result = None

        def run(self):
            try:
                self.result = func(*args, **kwargs)
            except:
                self.result = default

    it = InterruptableThread()
    it.start()
    it.join(timeout_duration)
    if it.isAlive():
        if hasattr(default, '__call__'):
            return default()
        else:
            return default
    else:
        return it.result

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
    if len(hostname) > 255:
        return False
    if hostname[-1:] == ".": # Strip the tailing dot if present
        hostname = hostname[:-1]
    allowed = re.compile("(?!-)[A-Z\d-]{1,63}(?<!-)$", re.IGNORECASE)
    if allow_underscore:
        allowed = re.compile("(?!-)[_A-Z\d-]{1,63}(?<!-)$", re.IGNORECASE)
    return all(allowed.match(x) for x in hostname.split("."))

def recursive_chown(path, uid, gid):
    """Emulates 'chown -R *uid*:*gid* *path*' in pure Python"""
    error_msg = _(
        "Error: Gate One does not have the ability to recursively chown %s to "
        "uid %s/gid %s.  Please ensure that user, %s has write permission to "
        "the directory.")
    try:
        os.chown(path, uid, gid)
    except OSError as e:
        if e.errno in [errno.EACCES, errno.EPERM]:
            raise ChownError(error_msg % (path, uid, gid, repr(os.getlogin())))
        else:
            raise
    for root, dirs, files in os.walk(path):
        for momo in dirs:
            _path = os.path.join(root, momo)
            try:
                os.chown(_path, uid, gid)
            except OSError as e:
                if e.errno in [errno.EACCES, errno.EPERM]:
                    raise ChownError(error_msg % (
                        _path, uid, gid, repr(os.getlogin())))
                else:
                    raise
        for momo in files:
            _path = os.path.join(root, momo)
            try:
                os.chown(_path, uid, gid)
            except OSError as e:
                if e.errno in [errno.EACCES, errno.EPERM]:
                    raise ChownError(error_msg % (
                        _path, uid, gid, repr(os.getlogin())))
                else:
                    raise

def drop_privileges(uid='nobody', gid='nogroup', supl_groups=None):
    """
    Drop privileges by changing the current process owner/group to
    *uid*/*gid* (both may be an integer or a string).  If *supl_groups* (list)
    is given the process will be assigned those values as its effective
    supplemental groups.  If *supl_groups* is None it will default to using
    'tty' as the only supplemental group.  Example::

        drop_privileges('gateone', 'gateone', ['tty'])

    This would change the current process owner to gateone/gateone with 'tty' as
    its only supplemental group.

    .. note:: On most Unix systems users must belong to the 'tty' group to create new controlling TTYs which is necessary for 'pty.fork()' to work.

    .. tip:: If you get errors like, "OSError: out of pty devices" it likely means that your OS uses something other than 'tty' as the group owner of the devpts filesystem.  'mount | grep pts' will tell you the owner.
    """
    import pwd, grp
    running_gid = gid
    if not isinstance(uid, int):
        # Get the uid/gid from the name
        running_uid = pwd.getpwnam(uid).pw_uid
    running_uid = uid
    if not isinstance(gid, int):
        running_gid = grp.getgrnam(gid).gr_gid
    if supl_groups:
        for i, group in enumerate(supl_groups):
            # Just update in-place
            if not isinstance(group, int):
                supl_groups[i] = grp.getgrnam(group).gr_gid
        try:
            os.setgroups(supl_groups)
        except OSError as e:
            logging.error(_('Could not set supplemental groups: %s' % e))
            exit()
    # Try setting the new uid/gid
    try:
        os.setgid(running_gid)
    except OSError as e:
        logging.error(_('Could not set effective group id: %s' % e))
        exit()
    try:
        os.setuid(running_uid)
    except OSError as e:
        logging.error(_('Could not set effective user id: %s' % e))
        exit()
    # Ensure a very convervative umask
    new_umask = 0o77
    old_umask = os.umask(new_umask)
    final_uid = os.getuid()
    final_gid = os.getgid()
    human_supl_groups = []
    for group in supl_groups:
        human_supl_groups.append(grp.getgrgid(group).gr_name)
    logging.info(_(
        'Running as user/group, "%s/%s" with the following supplemental groups:'
        ' %s' % (pwd.getpwuid(final_uid)[0], grp.getgrgid(final_gid)[0],
                 ",".join(human_supl_groups))
    ))

# Misc
_ = get_translation()
if MACOS: # Apply mac-specific stuff
    kill_dtached_proc = kill_dtached_proc_macos
    killall = killall_macos

# Used in case bell.ogg can't be found or can't be converted into a data URI
fallback_bell = "data:audio/ogg;base64,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"