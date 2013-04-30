# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

__doc__ = """\
Gate One utility functions and classes.
"""

# Meta
__version__ = '1.2'
__version_info__ = (1, 2)
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Import stdlib stuff
import os
import signal
import sys
import random
import re
import io
import errno
import uuid
import logging
import mimetypes
import fcntl
import hmac, hashlib
from datetime import timedelta
from functools import partial
try:
    import cPickle as pickle
except ImportError:
    import pickle # Python 3

# Import 3rd party stuff
from tornado import locale
from tornado.options import options
from tornado.escape import json_encode as _json_encode
from tornado.escape import json_decode
from tornado.escape import to_unicode, utf8

# Globals
GATEONE_DIR = os.path.dirname(os.path.abspath(__file__))
MACOS = os.uname()[0] == 'Darwin'
OPENBSD = os.uname()[0] == 'OpenBSD'
CSS_END = re.compile('\.css.*?$')
JS_END = re.compile('\.js.*?$')
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
# Default to using the environment's locale with en_US fallback
temp_locale = locale.get(os.environ.get('LANG', 'en_US').split('.')[0])
_ = temp_locale.translate
del temp_locale
# The above is necessary because gateone.py won't have read in its settings
# until after this file has loaded.  So get_settings() won't work properly
# until later in the module loading process.  This lets us display translated
# error messages in the event that Gate One never completed loading.

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

class SettingsError(Exception):
    """
    Raised when we encounter an error parsing .conf files in the settings dir.
    """
    pass

class RUDict(dict):
    """
    A dict that will recursively update keys and values in a safe manner so that
    sub-dicts will be merged without one clobbering the other.

    .. note:: This class (mostly) taken from `here <http://stackoverflow.com/questions/6256183/combine-two-dictionaries-of-dictionaries-python>`_
    """
    def __init__(self, *args, **kw):
        super(RUDict,self).__init__(*args, **kw)

    def update(self, E=None, **F):
        if E is not None:
            if 'keys' in dir(E) and callable(getattr(E, 'keys')):
                for k in E:
                    if k in self:  # Existing ...must recurse into both sides
                        self.r_update(k, E)
                    else: # Doesn't currently exist, just update
                        self[k] = E[k]
            else:
                for (k, v) in E:
                    self.r_update(k, {k:v})

        for k in F:
            self.r_update(k, {k:F[k]})

    def r_update(self, key, other_dict):
        if isinstance(self[key], dict) and isinstance(other_dict[key], dict):
            od = RUDict(self[key])
            nd = other_dict[key]
            od.update(nd)
            self[key] = od
        else:
            self[key] = other_dict[key]

    def __repr__(self):
        """
        Returns the `RUDict` as indented json to better resemble how it looks in
        a .conf file.
        """
        import json # Tornado's json_encode doesn't do indentation
        return json.dumps(self, indent=4)

    def __str__(self):
        """
        Just returns `self.__repr__()` with an extra newline at the end.
        """
        return self.__repr__() + "\n"

# Functions
def noop(*args, **kwargs):
    """Do nothing (i.e. "No Operation")"""
    pass

# The following was taken from:
# http://stackoverflow.com/questions/241327/python-snippet-to-remove-c-and-c-comments
# Thank you Markus Jarderot!
def remove_comments(text):
    """
    Removes C-style comments from *text* and returns the result.
    """
    def replacer(match):
        s = match.group(0)
        if s.startswith('/'):
            return ""
        else:
            return s
    pattern = re.compile(
        r'//.*?$|/\*.*?\*/|\'(?:\\.|[^\\\'])*\'|"(?:\\.|[^\\"])*"',
        re.DOTALL | re.MULTILINE
    )
    return re.sub(pattern, replacer, text)

def get_settings(path, add_default=True):
    """
    Reads any and all *.conf files containing JSON (JS-style comments are OK)
    inside *path* and returns them as an :class:`RUDict`.  Optionally, *path*
    may be a specific file (as opposed to just a directory).

    By default, all returned :class:`RUDict` objects will include a '*' dict
    which indicates "all users".  This behavior can be skipped by setting the
    *add_default* keyword argument to `False`.
    """
    settings = RUDict()
    if add_default:
        settings['*'] = {}
    # Using an RUDict so that subsequent .conf files can safely override
    # settings way down the chain without clobbering parent keys/dicts.
    if os.path.isdir(path):
        settings_files = [a for a in os.listdir(path) if a.endswith('.conf')]
        settings_files.sort()
    else:
        if not os.path.exists(path):
            raise IOError(_("%s does not exist" % path))
        settings_files = [path]
    for fname in settings_files:
        # Use this file to update settings
        if os.path.isdir(path):
            filepath = os.path.join(path, fname)
        else:
            filepath = path
        with io.open(filepath, encoding='utf-8') as f:
            # Remove comments
            proper_json = remove_comments(f.read())
            # Remove blank/empty lines
            proper_json = os.linesep.join([
                s for s in proper_json.splitlines() if s.strip()])
            try:
                settings.update(json_decode(proper_json))
            except ValueError as e:
                # Something was wrong with the JSON (syntax error, usually)
                logging.error(
                    "Error decoding JSON in settings file: %s"
                    % os.path.join(path, fname))
                logging.error(e)
                # Let's try to be as user-friendly as possible by pointing out
                # *precisely* where the error occurred (if possible)...
                try:
                    line_no = int(e.message.split(': line ', 1)[1].split()[0])
                    column = int(e.message.split(': line ', 1)[1].split()[2])
                    for i, line in enumerate(proper_json.splitlines()):
                        if i == line_no-1:
                            print(
                                line[:column] +
                                _(" <-- Something went wrong right here (or "
                                  "right above it)")
                            )
                            break
                        else:
                            print(line)
                    raise SettingsError()
                except (ValueError, IndexError):
                    print(_(
                        "Got an exception trying to display precisely where "
                        "the problem was.  This usually happens when you've "
                        "used single quotes (') instead of double quotes (\")."
                    ))
                    # Couldn't parse the exception message for line/column info
                    pass # No big deal; the user will figure it out eventually
    return settings

def options_to_settings(options):
    """
    Converts the given Tornado-style *options* to new-style settings.  Returns
    an :class:`RUDict` containing all the settings.
    """
    settings = RUDict({'*': {'gateone': {}, 'terminal': {}}})
    # In the new settings format some options have moved to the terminal app.
    # These settings are below and will be placed in the 'terminal' sub-dict.
    terminal_options = [
        'command', 'dtach', 'session_logging', 'session_logs_max_age',
        'syslog_session_logging'
    ]
    non_options = [
        # These are things that don't really belong in settings
        'new_api_key', 'help', 'kill', 'config'
    ]
    for key, value in options._options.items():
        value = value.value() # These are of type, tornado.options._Option
        if key in terminal_options:
            settings['*']['terminal'].update({key: value})
        elif key in non_options:
            continue
        else:
            if key == 'origins':
                #if value == '*':
                    #continue
                # Convert to the new format (a list with no http://)
                origins = value.split(';')
                converted_origins = []
                for origin in origins:
                    if '://' in origin:
                        # The new format doesn't bother with http:// or https://
                        origin = origin.split('://')[1]
                        if origin not in converted_origins:
                            converted_origins.append(origin)
                    elif origin not in converted_origins:
                        converted_origins.append(origin)
                settings['*']['gateone'].update({key: converted_origins})
            elif key == 'api_keys':
                if not value:
                    continue
                # API keys/secrets are now a dict instead of a string
                settings['*']['gateone']['api_keys'] = {}
                for pair in value.split(','):
                    api_key, secret = pair.split(':', 1)
                    if bytes == str: # Python 3
                        api_key = api_key.decode('UTF-8')
                        secret = secret.decode('UTF-8')
                    settings['*']['gateone']['api_keys'].update(
                        {api_key: secret})
            else:
                settings['*']['gateone'].update({key: value})
    return settings

def write_pid(path):
    """Writes our PID to *path*."""
    try:
        pid = os.getpid()
        with io.open(path, mode='w', encoding='utf-8') as pidfile:
            # Get a non-blocking exclusive lock
            fcntl.flock(pidfile.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            pidfile.seek(0)
            pidfile.truncate(0)
            pidfile.write(unicode(pid))
    except:
        raise
    finally:
        try:
            pidfile.close()
        except:
            pass

def read_pid(path):
    """Reads our current PID from *path*."""
    return str(io.open(path, mode='r', encoding='utf-8').read())

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

def get_translation(settings_dir=None):
    """
    Looks inside Gate One's settings to determine the configured locale and
    returns a matching locale.get_translation function.  If no locale is set
    (e.g. first time running Gate One) the local `$LANG` environment variable
    will be used.

    This function is meant to be used like so::

        >>> from utils import get_translation
        >>> _ = get_translation()
    """
    if not settings_dir:
        # Check the tornado options object first
        if hasattr(options, 'settings_dir'):
            settings_dir = options.settings_dir
        else: # Fall back to the default settings dir
            settings_dir = os.path.join(GATEONE_DIR, 'settings')
    # If none of the above worked we can always just use en_US:
    locale_str = os.environ.get('LANG', 'en_US').split('.')[0]
    try:
        settings = get_settings(settings_dir)
        gateone_settings = settings['*'].get('gateone', None)
        if gateone_settings: # All these checks are necessary for early startup
            locale_str = settings['*']['gateone'].get('locale', locale_str)
    except IOError: # server.conf doesn't exist (yet).
        # Fall back to os.environ['LANG']
        # Already set above
        pass
    user_locale = locale.get(locale_str)
    return user_locale.translate

def gen_self_signed_ssl(path=None):
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
        gen_self_signed_func(path=path)
    except SSLGenerationError as e:
        logging.error(_(
            "Error generating self-signed SSL key/certificate: %s" % e))

def gen_self_signed_openssl(path=None):
    """
    This method will generate a secure self-signed SSL key/certificate pair
    (using the `openssl <http://www.openssl.org/docs/apps/openssl.html>`_
    command) saving the result as 'certificate.pem' and 'keyfile.pem' to *path*.
    If *path* is not given the result will be saved in the current working
    directory.  The certificate will be valid for 10 years.
    """
    if not path:
        path = os.path.abspath(os.curdir)
    keyfile_path = "%s/keyfile.pem" % path
    certfile_path = "%s/certificate.pem" % path
    subject = (
        '-subj "/OU=%s (Self-Signed)/CN=Gate One/O=Liftoff Software"' %
        os.uname()[1] # Hostname
    )
    gen_command = (
        "openssl genrsa -aes256 -out %s.tmp -passout pass:password 4096" %
        keyfile_path
    )
    decrypt_key_command = (
        "openssl rsa -in %s.tmp -passin pass:password -out keyfile.pem" %
        keyfile_path
    )
    csr_command = (
        "openssl req -new -key %s -out temp.csr %s" % (keyfile_path, subject)
    )
    cert_command = (
        "openssl x509 -req "    # Create a new x509 certificate
        "-days 3650 "           # That lasts 10 years
        "-in temp.csr "         # Using the CSR we just generated
        "-signkey %s "          # Sign it with keyfile.pem that we just created
        "-out %s"               # Save it as certificate.pem
    )
    cert_command = cert_command % (keyfile_path, certfile_path)
    logging.debug(_(
        "Generating private key with command: %s" % gen_command))
    exitstatus, output = shell_command(gen_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to create private SSL key:\n%s" % output)
        if os.path.exists('%s.tmp' % keyfile_path):
            os.remove('%s.tmp' % keyfile_path)
        raise SSLGenerationError(error_msg)
    logging.debug(_(
        "Decrypting private key with command: %s" % decrypt_key_command))
    exitstatus, output = shell_command(decrypt_key_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to decrypt private SSL key:\n%s" % output)
        if os.path.exists('%s.tmp' % keyfile_path):
            os.remove('%s.tmp' % keyfile_path)
        raise SSLGenerationError(error_msg)
    logging.debug(_(
        "Creating CSR with command: %s" % csr_command))
    exitstatus, output = shell_command(csr_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to create CSR:\n%s" % output)
        if os.path.exists('%s.tmp' % keyfile_path):
            os.remove('%s.tmp' % keyfile_path)
        if os.path.exists('temp.csr'):
            os.remove('temp.csr')
        raise SSLGenerationError(error_msg)
    logging.debug(_(
        "Generating self-signed certificate with command: %s" % gen_command))
    exitstatus, output = shell_command(cert_command, 30)
    if exitstatus != 0:
        error_msg = _(
            "An error occurred trying to create certificate:\n%s" % output)
        if os.path.exists('%s.tmp' % keyfile_path):
            os.remove('%s.tmp' % keyfile_path)
        if os.path.exists('temp.csr'):
            os.remove('temp.csr')
        if os.path.exists(certfile_path):
            os.remove(certfile_path)
        raise SSLGenerationError(error_msg)
    # Clean up unnecessary leftovers
    os.remove('%s.tmp' % keyfile_path)
    os.remove('temp.csr')


def gen_self_signed_pyopenssl(notAfter=None, path=None):
    """
    This method will generate a secure self-signed SSL key/certificate pair
    (using pyOpenSSL) saving the result as 'certificate.pem' and 'keyfile.pem'
    in *path*.  If *path* is not given the result will be saved in the current
    working directory.  By default the certificate will be valid for 10 years
    but this can be overridden by passing a valid timestamp via the
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
    if not path:
        path = os.path.abspath(os.curdir)
    keyfile_path = "%s/keyfile.pem" % path
    certfile_path = "%s/certificate.pem" % path
    pkey = OpenSSL.crypto.PKey()
    pkey.generate_key(OpenSSL.crypto.TYPE_RSA, 4096)
    # Save the key as 'keyfile.pem':
    with io.open(keyfile_path, mode='wb') as f:
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
    with io.open(certfile_path, mode='wb') as f:
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
        >>> str2bool('whatever')
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

        >>> mkdir_p('/tmp/test/testing') # Does the same thing as...
        >>> from subprocess import call
        >>> call('mkdir -p /tmp/test/testing')

    .. note:: This doesn't actually call any external commands.
    """
    try:
        os.makedirs(path)
    except OSError as exc:
        if exc.errno == errno.EEXIST:
            pass
        else: raise

def cmd_var_swap(cmd, **kwargs):
    """
    Returns *cmd* with %variable% replaced with the keys/values passed in via
    *kwargs*.  This function is used by Gate One's Terminal application to
    swap the following Gate One variables in defined terminal 'commands':

        ==============  ==============
        %SESSION%       *session*
        %SESSION_DIR%   *session_dir*
        %SESSION_HASH%  *session_hash*
        %USERDIR%       *user_dir*
        %USER%          *user*
        %TIME%          *time*
        ==============  ==============

    This allows for unique or user-specific values to be swapped into command
    line arguments like so::

        ssh_connect.py -M -S '%SESSION%/%SESSION%/%r@%L:%p'

    Could become::

        ssh_connect.py -M -S '/tmp/gateone/NWI0YzYxNzAwMTA3NGYyZmI0OWJmODczYmQyMjQwMDYwM/%r@%L:%p'

    Here's an example::

        >>> cmd = "echo '%FOO% %BAR%'"
        >>> cmd_var_swap(cmd, foo="FOOYEAH,", bar="BAR NONE!")
        "echo 'FOOYEAH, BAR NONE!'"

    .. note:: The variables passed into this function via *kwargs* are case insensitive.  `cmd_var_swap(cmd, session=var)` would produce the same output as `cmd_var_swap(cmd, SESSION=var)`.
    """
    for key, value in kwargs.items():
        key = str(key) # Force to string in case of things like integers
        value = str(value)
        cmd = cmd.replace(r'%{key}%'.format(key=key.upper()), value)
    return cmd

def short_hash(to_shorten):
    """
    Converts *to_shorten* into a really short hash depenendent on the length of
    *to_shorten*.  The result will be safe for use as a file name.

    .. note:: Collisions are possible but *highly* unlikely because of how this method is used by Gate One.
    """
    import base64
    hashed = hashlib.sha1(to_shorten.encode('utf-8'))
    # Take the first eight characters to create a shortened version.
    return base64.urlsafe_b64encode(hashed.digest())[:8].decode('ascii')

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
            except Exception:
                pass # Already dead, no big deal.
    for pid in to_kill:
        kill_pids = get_process_tree(pid)
        for _pid in kill_pids:
            _pid = int(_pid)
            try:
                os.kill(_pid, signal.SIGTERM)
            except OSError:
                pass # Process already died.  Not a problem.

def kill_dtached_proc_bsd(session, term):
    """
    A BSD-specific implementation of `kill_dtached_proc` since Macs don't have
    /proc.  Seems simpler than :func:`kill_dtached_proc` but actually having to
    call a subprocess is less efficient (due to the sophisticated signal
    handling required by :func:`shell_command`).
    """
    logging.debug('kill_dtached_proc_bsd(%s, %s)' % (session, term))
    ps = which('ps')
    if MACOS:
        psopts = "-ef"
    elif OPENBSD:
        psopts = "-aux"
    cmd = (
        "%s %s | "
        "grep %s/dtach_%s | " # Limit to those matching our session/term combo
        "grep -v grep | " # Get rid of grep from the results (if present)
        "awk '{print $2}' " % (ps, psopts, session, term) # Just the PID please
    )
    logging.debug('kill cmd: %s' % cmd)
    exitstatus, output = shell_command(cmd)
    for line in output.splitlines():
        pid_to_kill = line.strip() # Get rid of trailing newline
        for pid in get_process_tree(pid_to_kill):
            try:
                os.kill(int(pid), signal.SIGTERM)
            except OSError:
                pass # Process already died.  Not a problem.

def killall(session_dir, pid_file):
    """
    Kills all running Gate One terminal processes including any detached dtach
    sessions.

    :session_dir: The path to Gate One's session directory.
    :pid_file: The path to Gate One's PID file
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
            cmdline_path = os.path.join(pid_dir, 'cmdline')
            if os.path.exists(cmdline_path):
                try:
                    with io.open(cmdline_path, mode='r', encoding='utf-8') as f:
                        cmdline = f.read()
                except IOError:
                    # Can happen if a process ended as we were looking at it
                    continue
            for session in sessions:
                if session in cmdline:
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass # PID is already dead--great
    try:
        go_pid = int(io.open(pid_file, mode='r', encoding='utf-8').read())
    except:
        logging.warning(_(
            "Could not open pid_file (%s).  You may have to kill gateone.py "
            "manually." % pid_file))
        return
    try:
        os.kill(go_pid, signal.SIGTERM)
    except OSError:
        pass # PID is already dead--great

def killall_bsd(session_dir, pid_file=None):
    """
    A BSD-specific version of `killall` since Macs don't have /proc.

    .. note:: *pid_file* is not used by this function.  It is simply here to provide compatibility with `killall`.
    """
    # TODO: See if there's a better way to keep track of subprocesses so we
    # don't have to enumerate the process table at all.
    logging.debug('killall_bsd(%s)' % session_dir)
    sessions = os.listdir(session_dir)
    if MACOS:
        psopts = "-ef"
    elif OPENBSD:
        psopts = "-aux"
    for session in sessions:
        cmd = (
            "ps %s | "
            "grep %s | " # Limit to those matching the session
            "grep -v grep | " # Get rid of grep from the results (if present)
            "awk '{print $2}' | " # Just the PID please
            "xargs kill" % (psopts, session) # Kill em'
        )
        logging.debug('killall cmd: %s' % cmd)
        exitstatus, output = shell_command(cmd)

def get_applications(application_dir, enabled=None):
    """
    Adds applications' Python files to `sys.path` and returns a list containing
    the name of each application.  If given, only applications in the *enabled*
    list will be returned.
    """
    out_list = []
    for directory in os.listdir(application_dir):
        application = directory
        directory = os.path.join(application_dir, directory) # Make absolute
        if not os.path.isdir(directory):
            continue
        if enabled and application not in enabled:
            continue
        application_files = os.listdir(directory)
        if "__init__.py" in application_files:
            out_list.append(application) # Just need the base
            sys.path.insert(0, directory)
        else: # Look for .py files
            for app_file in application_files:
                if app_file.endswith('.py'):
                    app_path = os.path.join(directory, app_file)
                    sys.path.insert(0, directory)
                    (basename, ext) = os.path.splitext(app_path)
                    basename = basename.split('/')[-1]
                    out_list.append(basename)
    # Sort alphabetically so the order in which they're applied can
    # be controlled somewhat predictably
    out_list.sort()
    return out_list

def get_plugins(plugin_dir, enabled=None):
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

    Optionally, a list of *enabled* (Python) plugins may be provided and only
    those plugins will be added to the 'py' portion of the returned dict.
    """
    out_dict = {'js': [], 'css': [], 'py': []}
    if not os.path.exists(plugin_dir):
        return out_dict
    for directory in os.listdir(plugin_dir):
        if enabled and directory not in enabled:
            continue
        plugin = directory
        http_static_path = '/static/%s' % plugin
        directory = os.path.join(plugin_dir, directory) # Make absolute
        if not os.path.isdir(directory):
            continue # This is not a plugin
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

def load_modules(modules):
    """
    Given a list of Python *modules*, imports them.

    .. note::  Assumes they're all in `sys.path`.
    """
    out_list = []
    for module in modules:
        imported = __import__(module, None, None, [''])
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
    Parse the *chars* passed from :class:`terminal.Terminal` by way of the special,
    optional escape sequence handler (e.g. '<plugin>|<text>') into a tuple of
    (<plugin name>, <text>).  Here's an example::

        >>> process_opt_esc_sequence('ssh|user@host:22')
        ('ssh', 'user@host:22')
    """
    plugin = None
    text = ""
    try:
        plugin, text = chars.split('|')
    except Exception:
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
    with io.open(filepath, mode='rb') as f:
        data = f.read()
    encoded = base64.b64encode(data).decode('ascii').replace('\n', '')
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
    return all(allowed.match(x) for x in hostname.split(b"."))

def recursive_chown(path, uid, gid):
    """Emulates 'chown -R *uid*:*gid* *path*' in pure Python"""
    error_msg = _(
        "Error: Gate One does not have the ability to recursively chown %s to "
        "uid %s/gid %s.  Please ensure that user, %s has write permission to "
        "the directory.")
    try:
        os.chown(path, uid, gid)
    except OSError as e:
        import pwd
        if e.errno in [errno.EACCES, errno.EPERM]:
            raise ChownError(error_msg % (path, uid, gid,
                repr(pwd.getpwuid(os.geteuid())[0])))
        else:
            raise
    for root, dirs, files in os.walk(path):
        for momo in dirs:
            _path = os.path.join(root, momo)
            try:
                os.chown(_path, uid, gid)
            except OSError as e:
                import pwd
                if e.errno in [errno.EACCES, errno.EPERM]:
                    raise ChownError(error_msg % (
                        _path, uid, gid, repr(pwd.getpwuid(os.geteuid())[0])))
                else:
                    raise
        for momo in files:
            _path = os.path.join(root, momo)
            try:
                os.chown(_path, uid, gid)
            except OSError as e:
                import pwd
                if e.errno in [errno.EACCES, errno.EPERM]:
                    raise ChownError(error_msg % (
                        _path, uid, gid, repr(pwd.getpwuid(os.geteuid())[0])))
                else:
                    raise

def check_write_permissions(user, path):
    """
    Returns True if the given *user* has write permissions to *path*.  *user*
    can be a UID (int) or a username (string).
    """
    import pwd, grp, stat
    # Get the user's complete passwd record
    if isinstance(user, int):
        user = pwd.getpwuid(user)
    else:
        user = pwd.getpwnam(user)
    groups = [] # A combination of user's primary GID and supplemental groups
    for group in grp.getgrall():
        if user.pw_name in group.gr_mem:
            groups.append(group.gr_gid)
        if group.gr_gid == user.pw_gid:
            groups.append(group.gr_gid)
    st = os.stat(path)
    other_write = bool(st.st_mode & stat.S_IWOTH)
    if other_write:
        return True # Read/write world!
    owner_write = bool(st.st_mode & stat.S_IWUSR)
    if st.st_uid == user.pw_uid and owner_write:
        return True # User can write to their own file
    group_write = bool(st.st_mode & stat.S_IWGRP)
    if st.st_gid in groups and group_write:
        return True # User belongs to a group that can write to the file
    return False

def bind(function, self):
    """
    Will return *function* with *self* bound as the first argument.  Allows one
    to write functions like this::

        def foo(self, whatever):
            return whatever

    ...outside of the construct of a class.
    """
    return partial(function, self)

def minify(path_or_fileobj, kind):
    """
    Returns *path_or_fileobj* as a minified string.  *kind* should be one of
    'js' or 'css'.  Works with JavaScript and CSS files using `slimit` and
    `cssmin`, respectively.
    """
    out = None
    # Optional:  If slimit is installed Gate One will use it to minify JS and CSS
    try:
        import slimit
    except ImportError:
        slimit = None
        logging.warning(_(
            "slimit module not found.  JavaScript will not be minified."))
        logging.info(_("To install slimit:  sudo pip install slimit"))
    try:
        import cssmin
    except ImportError:
        cssmin = None
        logging.warning(_(
            "cssmin module not found.  CSS will not be minified."))
        logging.info(_("To install cssmin:  sudo pip install cssmin"))
    if isinstance(path_or_fileobj, basestring):
        filename = os.path.split(path_or_fileobj)[1]
        with io.open(path_or_fileobj, mode='r', encoding='utf-8') as f:
            data = f.read()
    else:
        filename = os.path.split(path_or_fileobj.name)[1]
        data = path_or_fileobj.read()
    out = data
    if slimit and kind == 'js':
        out = slimit.minify(data)
        logging.debug(_(
            "(saved ~%s bytes minifying %s)" % (
                (len(data) - len(out), filename)
            )
        ))
        del slimit # Don't need this anymore
    elif cssmin and kind == 'css':
        out = cssmin.cssmin(data)
        logging.debug(_(
            "(saved ~%s bytes minifying %s)" % (
                (len(data) - len(out), filename)
            )
        ))
        del cssmin # Don't need this anymore
    return out

# This is so we can have the argument below be 'minify' (user friendly)
_minify = minify

def get_or_cache(cache_dir, path, minify=True):
    """
    Given a *path*, returns the cached version of that file.  If the file has
    yet to be cached, cache it and return the result.  If *minify* is `True`
    (the default), the file will be minified as part of the caching process (if
    possible).
    """
    # Need to store the original file's modification time in the filename
    # so we can tell if the original changed in the event that Gate One is
    # restarted.
    # Also, we're using the full path in the cached filename in the event
    # that two files have the same name but at different paths.
    mtime = os.stat(path).st_mtime
    shortened_path = short_hash(path)
    cached_filename = "%s:%s" % (shortened_path, mtime)
    cached_file_path = os.path.join(cache_dir, cached_filename)
    # Check if the file has changed since last time and use the cached
    # version if it makes sense to do so.
    if os.path.exists(cached_file_path):
        with io.open(cached_file_path, mode='r', encoding='utf-8') as f:
            data = f.read()
    elif minify:
        # Using regular expressions here because rendered filenames often end
        # like this: .css_1357311277
        # Hopefully this is a good enough classifier.
        if JS_END.search(path):
            kind = 'js'
        elif CSS_END.search(path):
            kind = 'css'
        else: # Just cache it as-is; no minification
            kind = False
        if kind:
            data = _minify(path, kind)
            # Cache it
            with io.open(cached_file_path, mode='w', encoding='utf-8') as f:
                f.write(data)
        else:
            with io.open(path, mode='r', encoding='utf-8') as f:
                data = f.read()
    else:
        with io.open(path, mode='r', encoding='utf-8') as f:
            data = f.read()
    # Clean up old versions of this file (if present)
    for fname in os.listdir(cache_dir):
        if fname == cached_filename:
            continue
        elif fname.startswith(shortened_path):
            # Older version present.  Remove it.
            os.remove(os.path.join(cache_dir, fname))
    return data

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

    .. note::

        On most Unix systems users must belong to the 'tty' group to create new
        controlling TTYs which is necessary for 'pty.fork()' to work.

    .. tip::

        If you get errors like, "OSError: out of pty devices" it likely means
        that your OS uses something other than 'tty' as the group owner of the
        devpts filesystem.  'mount | grep pts' will tell you the owner (look for
        gid=<owner>).
    """
    import pwd, grp
    human_supl_groups = []
    running_gid = gid
    if not isinstance(uid, int):
        # Get the uid/gid from the name
        running_uid = pwd.getpwnam(uid).pw_uid
    running_uid = uid
    if not isinstance(gid, int):
        running_gid = grp.getgrnam(gid).gr_gid
    if supl_groups:
        for i, group in enumerate(list(supl_groups)):
            # Just update in-place
            if not isinstance(group, int):
                supl_groups[i] = grp.getgrnam(group).gr_gid
            human_supl_groups.append(grp.getgrgid(supl_groups[i]).gr_name)
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
    os.umask(new_umask)
    final_uid = os.getuid()
    final_gid = os.getgid()
    logging.info(_(
        'Running as user/group, "%s/%s" with the following supplemental groups:'
        ' %s' % (pwd.getpwuid(final_uid)[0], grp.getgrgid(final_gid)[0],
                 ",".join(human_supl_groups))
    ))

def settings_template(path, **kwargs):
    """
    Renders and returns the Tornado template at *path* using the given *kwargs*.

    .. note:: Any blank lines in the rendered template will be removed.
    """
    from tornado.template import Template
    with io.open(path, mode='r', encoding='utf-8') as f:
        template_data = f.read()
    t = Template(template_data)
    # NOTE: Tornado returns templates as bytes, not unicode.  That's why we need
    # the decode() below...
    rendered = t.generate(**kwargs).decode('utf-8')
    out = ""
    for line in rendered.splitlines():
        if line.strip():
            out += line + "\n"
    return out

class memoize:
    """
    A memoization decorator that works with multiple arguments as well as
    unhashable arguments (e.g. dicts).
    """
    def __init__(self, fn):
        self.fn = fn
        self.memo = {}

    def __call__(self, *args, **kwds):
        string = pickle.dumps(args, 1) + pickle.dumps(kwds, 1)
        if string not in self.memo:
            # Commented out because it is REALLY noisy.  Uncomment to debug
            #logging.debug("memoize cache miss (%s)" % self.fn.__name__)
            self.memo[string] = self.fn(*args, **kwds)
        #else:
            #logging.debug("memoize cache hit (%s)" % self.fn.__name__)
        return self.memo[string]

def strip_xss(html, whitelist=None, replacement=u"\u2421"):
    """
    This function returns a tuple containing:

        * *html* with all non-whitelisted HTML tags replaced with *replacement*.  Any tags that contain JavaScript, VBScript, or other known XSS/executable functions will also be removed.
        * A list containing the tags that were removed.

    If *whitelist* is not given the following will be used::

        whitelist = set([
            'a', 'abbr', 'aside', 'audio', 'bdi', 'bdo', 'blockquote', 'canvas',
            'caption', 'code', 'col', 'colgroup', 'data', 'dd', 'del',
            'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1',
            'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
            'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
            'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup',
            'time', 'track', 'u', 'ul', 'var', 'video', 'wbr'
        ])

    Example::

        >>> html = '<span>Hello, exploit: <img src="javascript:alert(\"pwned!\")"></span>'
        >>> strip_xss(html)
        (u'<span>Hello, exploit: \u2421</span>', ['<img src="javascript:alert("pwned!")">'])

    .. note:: The default *replacement* is the unicode ␡ character (u"\u2421").

    If *replacement* is "entities" bad HTML tags will be encoded into HTML
    entities.  This allows things like <script>'whatever'</script> to be
    displayed without execution (which would be much less annoying to users that
    were merely trying to share a code example).  Here's an example::

        >>> html = '<span>Hello, exploit: <img src="javascript:alert(\"pwned!\")"></span>'
        >>> strip_xss(html, replacement="entities")
        ('<span>Hello, exploit: &lt;span&gt;Hello, exploit: &lt;img src="javascript:alert("pwned!")"&gt;&lt;/span&gt;</span>',
         ['<img src="javascript:alert("pwned!")">'])
        (u'<span>Hello, exploit: \u2421</span>', ['<img src="javascript:alert("pwned!")">'])

    .. note:: This function should work to protect against all `the XSS examples at OWASP <https://www.owasp.org/index.php/XSS_Filter_Evasion_Cheat_Sheet>`_.  Please `let us know <https://github.com/liftoff/GateOne/issues>`_ if you find something we missed.
    """
    re_html_tag = re.compile( # This matches HTML tags (if used correctly)
      "(?i)<\/?\w+((\s+\w+(\s*=\s*(?:\".*?\"|'.*?'|[^'\">\s]+))?)+\s*|\s*)\/?>")
    # This will match things like 'onmouseover=' ('on<whatever>=')
    on_events_re = re.compile('.*\s+(on[a-z]+\s*=).*')
    if not whitelist:
        # These are all pretty safe and covers most of what users would want in
        # terms of formatting and sharing media (images, audio, video, etc).
        whitelist = set([
            'a', 'abbr', 'aside', 'audio', 'bdi', 'bdo', 'blockquote', 'canvas',
            'caption', 'code', 'col', 'colgroup', 'data', 'dd', 'del',
            'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1',
            'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
            'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
            'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup',
            'time', 'track', 'u', 'ul', 'var', 'video', 'wbr'
        ])
    bad_tags = []
    for tag in re_html_tag.finditer(html):
        tag = tag.group()
        tag_lower = tag.lower()
        short_tag = tag_lower.split()[0].lstrip('</').rstrip('>')
        if short_tag not in whitelist:
            bad_tags.append(tag)
            continue
        # Make sure the tag can't execute any JavaScript
        if "javascript:" in tag_lower:
            bad_tags.append(tag)
            continue
        # on<whatever> events are not allowed (just another XSS vuln)
        if on_events_re.search(tag_lower):
            bad_tags.append(tag)
            continue
        # Flash sucks
        if "fscommand" in tag_lower:
            bad_tags.append(tag)
            continue
        # I'd be impressed if an attacker tried this one (super obscure)
        if "seeksegmenttime" in tag_lower:
            bad_tags.append(tag)
            continue
        # Yes we'll protect IE users from themselves...
        if "vbscript:" in tag_lower:
            bad_tags.append(tag)
            continue
    if replacement == "entities":
        import cgi
        for bad_tag in bad_tags:
            escaped = cgi.escape(html).encode('ascii', 'xmlcharrefreplace')
            html = html.replace(bad_tag, escaped)
    else:
        for bad_tag in bad_tags:
            html = html.replace(bad_tag, replacement)
    return (html, bad_tags)

def create_signature(*parts, **kwargs):
    """
    Creates an HMAC signature using the given *parts* and *kwargs*.  The first
    argument **must** be the 'secret' followed by any arguments that are to be
    part of the hash.  The only *kwargs* that is used is 'hmac_algo'.
    'hmac_algo' may be any HMAC algorithm present in the hashlib module.  If not
    provided, `hashlib.sha1` will be used.  Example usage::

        create_signature('secret', 'some-api-key', '1234567890123', 'user@somehost', hmac_algo=hashlib.sha1)

    .. note:: The API 'secret' **must** be the first argument.
    """
    secret = parts[0]
    secret = str(secret).encode('utf-8') # encode() because hmac takes bytes
    parts = parts[1:]
    hmac_algo = kwargs.get('hmac_algo', hashlib.sha1) # Default to sha1
    hash = hmac.new(secret, digestmod=hmac_algo)
    for part in parts:
        part = str(part).encode('utf-8') # str() in case of an int
        hash.update(part)
    return hash.hexdigest()

def combine_javascript(path, settings_dir=None):
    """
    Combines all application and plugin .js files into one big one; saved to the
    given *path*.  If given, *settings_dir* will be used to determine which
    applications and plugins should be included in the dump based on what is
    enabled.
    """
    if not settings_dir:
        settings_dir = os.path.join(GATEONE_DIR, 'settings')
    all_settings = get_settings(settings_dir)
    enabled_plugins = []
    enabled_applications = []
    if 'gateone' in all_settings['*']:
        # The check above will fail in first-run situations
        enabled_plugins = all_settings['*']['gateone'].get(
            'enabled_plugins', [])
        enabled_applications = all_settings['*']['gateone'].get(
            'enabled_applications', [])
    plugins_dir = os.path.join(GATEONE_DIR, 'plugins')
    pluginslist = os.listdir(plugins_dir)
    pluginslist.sort()
    applications_dir = os.path.join(GATEONE_DIR, 'applications')
    appslist = os.listdir(applications_dir)
    appslist.sort()
    with io.open(path, 'w') as f:
        # Start by adding gateone.js
        gateone_js = os.path.join(GATEONE_DIR, 'static', 'gateone.js')
        with io.open(gateone_js) as go_js:
            f.write(go_js.read() + '\n')
        # Gate One plugins
        for plugin in pluginslist:
            if enabled_plugins and plugin not in enabled_plugins:
                continue
            static_dir = os.path.join(plugins_dir, plugin, 'static')
            if os.path.isdir(static_dir):
                filelist = os.listdir(static_dir)
                filelist.sort()
                for filename in filelist:
                    filepath = os.path.join(static_dir, filename)
                    if filename.endswith('.js'):
                        with io.open(filepath) as js_file:
                            f.write(js_file.read() + u'\n')
        # Gate One applications
        for application in appslist:
            if enabled_applications:
                # Only export JS of enabled apps
                if application not in enabled_applications:
                    continue
            static_dir = os.path.join(GATEONE_DIR,
                'applications', application, 'static')
            plugins_dir = os.path.join(
                applications_dir, application, 'plugins')
            if os.path.isdir(static_dir):
                filelist = os.listdir(static_dir)
                filelist.sort()
                for filename in filelist:
                    filepath = os.path.join(static_dir, filename)
                    if filename.endswith('.js'):
                        with io.open(filepath) as js_file:
                            f.write(js_file.read() + u'\n')
            app_settings = all_settings['*'].get(application, None)
            enabled_app_plugins = []
            if app_settings:
                enabled_app_plugins = app_settings.get(
                    'enabled_plugins', [])
            if os.path.isdir(plugins_dir):
                pluginslist = os.listdir(plugins_dir)
                pluginslist.sort()
                # Gate One application plugins
                for plugin in pluginslist:
                    # Only export JS of enabled app plugins
                    if enabled_app_plugins:
                        if plugin not in enabled_app_plugins:
                            continue
                    static_dir = os.path.join(plugins_dir, plugin, 'static')
                    if os.path.isdir(static_dir):
                        filelist = os.listdir(static_dir)
                        filelist.sort()
                        for filename in filelist:
                            filepath = os.path.join(static_dir, filename)
                            if filename.endswith('.js'):
                                with io.open(filepath) as js_file:
                                    f.write(js_file.read() + u'\n')
        f.flush()

def combine_css(path, container, settings_dir=None):
    """
    Combines all application and plugin .css template files into one big one;
    saved to the given *path*.  Templates will be rendered using the given
    *container* as the replacement for templates use of '#{{container}}'.

    If given, *settings_dir* will be used to determine which applications and
    plugins should be included in the dump based on what is enabled.
    """
    if not settings_dir:
        settings_dir = os.path.join(GATEONE_DIR, 'settings')
    all_settings = get_settings(settings_dir)
    enabled_plugins = []
    enabled_applications = []
    if 'gateone' in all_settings['*']:
        # The check above will fail in first-run situations
        enabled_plugins = all_settings['*']['gateone'].get(
            'enabled_plugins', [])
        enabled_applications = all_settings['*']['gateone'].get(
            'enabled_applications', [])
    plugins_dir = os.path.join(GATEONE_DIR, 'plugins')
    pluginslist = os.listdir(plugins_dir)
    pluginslist.sort()
    applications_dir = os.path.join(GATEONE_DIR, 'applications')
    appslist = os.listdir(applications_dir)
    appslist.sort()
    themes = os.listdir(os.path.join(GATEONE_DIR, 'templates', 'themes'))
    theme_writers = {}
    for theme in themes:
        combined_theme_path = "%s_theme_%s" % (
            path.split('.css')[0], theme)
        theme_writers[theme] = io.open(combined_theme_path, 'w')
    # NOTE: We skip gateone.css because that isn't used when embedding
    with io.open(path, 'w') as f:
        # Gate One plugins
        # TODO: Add plugin theme files to this
        for plugin in pluginslist:
            if enabled_plugins and plugin not in enabled_plugins:
                continue
            css_dir = os.path.join(plugins_dir, plugin, 'templates')
            if os.path.isdir(css_dir):
                filelist = os.listdir(css_dir)
                filelist.sort()
                for filename in filelist:
                    filepath = os.path.join(css_dir, filename)
                    if filename.endswith('.css'):
                        with io.open(filepath) as css_file:
                            f.write(css_file.read() + u'\n')
        # Gate One applications
        for application in appslist:
            if enabled_applications:
                # Only export CSS of enabled apps
                if application not in enabled_applications:
                    continue
            css_dir = os.path.join(GATEONE_DIR,
                'applications', application, 'templates')
            subdirs = []
            plugins_dir = os.path.join(
                applications_dir, application, 'plugins')
            if os.path.isdir(css_dir):
                filelist = os.listdir(css_dir)
                filelist.sort()
                for filename in filelist:
                    filepath = os.path.join(css_dir, filename)
                    if filename.endswith('.css'):
                        with io.open(filepath) as css_file:
                            f.write(css_file.read() + u'\n')
                    elif os.path.isdir(filepath):
                        subdirs.append(filepath)
            while subdirs:
                subdir = subdirs.pop()
                filelist = os.listdir(subdir)
                filelist.sort()
                for filename in filelist:
                    filepath = os.path.join(subdir, filename)
                    if filename.endswith('.css'):
                        with io.open(filepath) as css_file:
                            combined = css_file.read() + u'\n'
                            if os.path.split(subdir)[1] == 'themes':
                                theme_writers[filename].write(combined)
                            else:
                                f.write(combined)
                    elif os.path.isdir(filepath):
                        subdirs.append(filepath)
            app_settings = all_settings['*'].get(application, None)
            enabled_app_plugins = []
            if app_settings:
                enabled_app_plugins = app_settings.get(
                    'enabled_plugins', [])
            if os.path.isdir(plugins_dir):
                pluginslist = os.listdir(plugins_dir)
                pluginslist.sort()
                # Gate One application plugins
                for plugin in pluginslist:
                    # Only export JS of enabled app plugins
                    if enabled_app_plugins:
                        if plugin not in enabled_app_plugins:
                            continue
                    css_dir = os.path.join(
                        plugins_dir, plugin, 'templates')
                    if os.path.isdir(css_dir):
                        filelist = os.listdir(css_dir)
                        filelist.sort()
                        for filename in filelist:
                            filepath = os.path.join(css_dir, filename)
                            if filename.endswith('.css'):
                                with io.open(filepath) as css_file:
                                    f.write(css_file.read() + u'\n')
                            elif os.path.isdir(os.path.join(
                                css_dir, filename)):
                                subdirs.append(filepath)
                    while subdirs:
                        subdir = subdirs.pop()
                        filelist = os.listdir(subdir)
                        filelist.sort()
                        for filename in filelist:
                            filepath = os.path.join(subdir, filename)
                            if filename.endswith('.css'):
                                with io.open(filepath) as css_file:
                                    with io.open(filepath) as css_file:
                                        combined = css_file.read() + u'\n'
                                        _dir = os.path.split(subdir)[1]
                                        if _dir == 'themes':
                                            theme_writers[filename].write(
                                                combined)
                                        else:
                                            f.write(combined)
                            elif os.path.isdir(filepath):
                                subdirs.append(filepath)
        f.flush()
    for writer in theme_writers.values():
        writer.flush()
        writer.close()
    # Now perform a replacement of the {{container}} variable
    with io.open(path, 'r') as f:
        css_data = f.read()
        css_data = css_data.replace(
            '#{{container}}', container)
    with io.open(path, 'w') as f:
        f.write(css_data)
    logging.info(_(
        "Non-theme CSS has been combined and saved to: %s"
        % path))
    for theme in theme_writers.keys():
        combined_theme_path = "%s_theme_%s" % (
            path.split('.css')[0], theme)
        with io.open(combined_theme_path, 'r') as f:
            css_data = f.read()
            css_data = css_data.replace(
                '#{{container}}', container)
        with io.open(combined_theme_path, 'w') as f:
            f.write(css_data)
        logging.info(_(
            "The %s theme CSS has been combined and saved to: %s"
            % (theme.split('.css')[0], combined_theme_path)))
# Misc
_ = get_translation()
if MACOS or OPENBSD: # Apply BSD-specific stuff
    kill_dtached_proc = kill_dtached_proc_bsd
    killall = killall_bsd
