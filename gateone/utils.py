# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

__doc__ = """\
Gate One utility functions and classes.
"""

# Meta
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Import stdlib stuff
import os
import signal
import sys
import re
import errno
import base64
import uuid
import logging
import syslog
import mimetypes
from commands import getstatusoutput
from datetime import datetime, timedelta

# Globals
# This matches JUST the PIDs from the output of the pstree command
RE_PSTREE = re.compile(r'\(([0-9]*)\)')
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
    10: u'^J',
    11: u'^K',
    12: u'^L',
    13: u'^M',
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
# Syslog string-to-int dict used by string_to_syslog_facility()
FACILITIES = {
    'kern': syslog.LOG_KERN,
    'user': syslog.LOG_USER,
    'mail': syslog.LOG_MAIL,
    'daemon': syslog.LOG_DAEMON,
    'auth': syslog.LOG_AUTH,
    'syslog': syslog.LOG_SYSLOG,
    'lpr': syslog.LOG_LPR,
    'news': syslog.LOG_NEWS,
    'uucp': syslog.LOG_UUCP,
    'cron': syslog.LOG_CRON,
    'local0': syslog.LOG_LOCAL0,
    'local1': syslog.LOG_LOCAL1,
    'local2': syslog.LOG_LOCAL2,
    'local3': syslog.LOG_LOCAL3,
    'local4': syslog.LOG_LOCAL4,
    'local5': syslog.LOG_LOCAL5,
    'local6': syslog.LOG_LOCAL6,
    'local7': syslog.LOG_LOCAL7
}

# Exceptions
class UnknownFacility(Exception):
    """
    Raised if string_to_syslog_facility() is given a string that doesn't match
    a known syslog facility.
    """
    pass

class MimeTypeFail(Exception):
    """
    Raised by create_data_uri() if the mimetype of a file could not be guessed.
    """
    pass

# Functions
def noop():
    'Do nothing (i.e. "No Operation")'
    pass

def gen_self_signed_ssl(notAfter=None):
    """
    This method will generate a secure self-signed SSL key/certificate pair
    saving the result as 'certificate.pem' and 'keyfile.pem' in the current
    working directory.  By default the certificate will be valid for 10 years
    but this can be overridden by passing a valid timestamp via the *notAfter*
    argument.

    Examples::

        gen_self_signed_ssl(60 * 60 * 24 * 365) # 1-year certificate
        gen_self_signed_ssl() # 10-year certificate
    """
    import OpenSSL, time, random, sys
    pkey = OpenSSL.crypto.PKey()
    pkey.generate_key(OpenSSL.crypto.TYPE_RSA, 2048)
    # Save the key as 'keyfile.pem':
    f = open('keyfile.pem', 'w')
    f.write(OpenSSL.crypto.dump_privatekey(OpenSSL.crypto.FILETYPE_PEM, pkey))
    f.close()

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
    f = open('certificate.pem', 'w')
    f.write(OpenSSL.crypto.dump_certificate(OpenSSL.crypto.FILETYPE_PEM, cert))
    f.close()

def none_fix(val):
    """
    If *val* is a string meaning 'none', return None.  Otherwise just return
    *val* as-is.  Examples::

        >>> import utils
        >>> utils.none_fix('none')
        None
        >>> utils.none_fix('0')
        None
        >>> utils.none_fix('whatever')
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

        >>> import utils
        >>> utils.str2bool('false')
        False
        >>> utils.str2bool('1')
        True
        >>> utils.st2bool('whatever')
        False
    """
    if isinstance(val, basestring) and val.lower() in ['1', 'true', 'yes']:
        return True
    else:
        return False

def generate_session_id():
    """
    Returns a random, 45-character session ID.  Example::

        >>> utils.generate_session_id()
        'NzY4YzFmNDdhMTM1NDg3Y2FkZmZkMWJmYjYzNjBjM2Y5O'

    """
    return base64.b64encode(uuid.uuid4().hex + uuid.uuid4().hex)[:45]

def mkdir_p(path):
    """
    Pythonic version of "mkdir -p".  Example equivalents::

        >>> import commands, utils
        >>> utils.mkdir_p('/tmp/test/testing') # Does the same thing as below:
        >>> commands.getoutput('mkdir -p /tmp/test/testing')
    """
    try:
        os.makedirs(path)
    except OSError as exc: # Python >2.5
        if exc.errno == errno.EEXIST:
            pass
        else: raise

def cmd_var_swap(cmd, session=None, user_dir=None, user=None, time=None):
    """
    Returns *cmd* with special inline variables swapped out for their respective
    argument values.  The special variables are as follows:

        %SESSION% - *session*
        %USERDIR% - *user_dir*
        %USER% - *user*
        %TIME% - *time*

    This allows for unique or user-specific values to be swapped into command
    line arguments like so:

        ssh_connect.py -M -S '/tmp/%SESSION%/%r@%h:%p'
    """
    if session:
        cmd = cmd.replace(r'%SESSION%', session)
    if user_dir:
        cmd = cmd.replace(r'%USERDIR%', user_dir)
    if user:
        cmd = cmd.replace(r'%USER%', user)
    if time:
        cmd = cmd.replace(r'%TIME%', str(time))
    return cmd

def kill_dtached_proc(session, term):
    """
    Kills the dtach session associated with the given *term* and all its
    sub-processes.  Requires *session* so it can figure out the right
    processess to kill.
    """
    cmd = (
        "ps -ef | "
        "grep %s/dtach:%s | " # Limit to those matching our session/term combo
        "grep 'dtach -c' | " # Limit to the parent dtach process
        "grep -v grep | " # Get rid of grep from the results (if present)
        "awk '{print $2}'" % (session, term) # Just the PID please
    )
    retcode, pid = getstatusoutput(cmd)
    if pid:
        retcode, pstree = getstatusoutput('pstree -p %s' % pid)
        # pstree will look something like:
        #   dtach(19041)---python(19042)---ssh(19048)
        pids = RE_PSTREE.findall(pstree)
        # pids will be something like ['19041', '19042', '19048']
        for pid in pids:
            try:
                os.kill(int(pid), signal.SIGTERM)
            except OSError:
                pass # No biggie; child died with parent

def killall(session_dir):
    """
    Kills all running Gate One terminal processes including any detached dtach
    sessions.
    *session_dir* - The path to Gate One's session directory.
    """
    cmd = (
        "for i in `ls %s`; "
        "do ps -ef | grep $i | awk '{print $2}' | xargs kill; "
        "done"
        % session_dir
    )
    retcode, output = getstatusoutput(cmd)
    cmd = "rm -rf %s/*" % session_dir
    recode, output = getstatusoutput(cmd)

def create_plugin_static_links(static_dir, plugin_dir):
    """
    Creates symbolic links for all plugins in the ./static/ directory.  The
    equivalent of:

    .. ansi-block::

        \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:~ $\x1b[0m ln -s *plugin_dir*/<plugin>/static *static_dir*/<plugin>

    This is so plugins can reference files in their static directories using the
    following straightforward path::

        https://<gate one>/static/<plugin name>/<some file>

    This function will also remove any dead links if a plugin is removed.
    """
    # Clean up dead links before we do anything else
    cmd = "find -L '%s' -type l -delete" % static_dir
    retcode, output = getstatusoutput(cmd)
    if retcode > 0:
        logging.error(
            "Error trying to clean up broken links in the static directory. "
            "Please check the permissions.\n\n%s" % output
        )
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

def get_plugins(plugin_dir):
    """
    Adds plugins' Python files to sys.path and returns a dictionary of
    JavaScript, CSS, and Python files contained in *plugin_dir* like so::

        {
            'js': [ # NOTE: These would be be inside *plugin_dir*/static
                '/static/happy_plugin/whatever.js',
                '/static/ssh/ssh.js',
            ],
            'css': ['/static/ssh/ssh.css'],
            'py': [ # NOTE: These will get added to sys.path
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

    \*.css files will get added to the <head> like so:

    .. code-block:: html

        {% for cssplugin in cssplugins %}
            <link rel="stylesheet" href="{{cssplugin}}" type="text/css" media="screen" />
        {% end %}
    """
    out_dict = {'js': [], 'css': [], 'py': []}
    for directory in os.listdir(plugin_dir):
        plugin = directory
        http_static_path = '/static/%s' % plugin
        directory = os.path.join(plugin_dir, directory) # Make absolute
        plugin_files = os.listdir(directory)
        if "__init__.py" in plugin_files:
            out_dict['py'].append(plugin) # Just need the base
            sys.path.append(directory)
        else: # Look for .py files
            for plugin_file in plugin_files:
                if plugin_file.endswith('.py'):
                    plugin_path = os.path.join(directory, plugin_file)
                    sys.path.append(directory)
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
    # Sort all plugins alphabetically so the order in which they're applied can
    # be controlled somewhat predictably
    out_dict['py'].sort()
    out_dict['js'].sort()
    out_dict['css'].sort()
    return out_dict

def load_plugins(plugins):
    """
    Given a list of *plugins*, imports them.
    NOTE:  Assumes they're all in sys.path.
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
    Given a *time_val* (string) such as '5d', returns a timedelta object
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

        >>> import utils
        >>> utils.convert_to_timedelta('7d')
        datetime.timedelta(7)
        >>> utils.convert_to_timedelta('24h')
        datetime.timedelta(1)
        >>> utils.convert_to_timedelta('60m')
        datetime.timedelta(0, 3600)
        >>> utils.convert_to_timedelta('120s')
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

def process_opt_esc_sequence(chars):
    """
    Parse the *chars* passed from terminal.py by way of the special,
    optional escape sequence handler (e.g. '<plugin>|<text>') into a tuple of
    (<plugin name>, <text>).  Here's an example::

        >>> import utils
        >>> utils.process_opt_esc_sequence('ssh|user@host:22')
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

        >>> import utils
        >>> test = '\\x1b]0;Some xterm title\x07'
        >>> print(utils.raw(test))
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
        raise UnknownFacility(
            "%s does not match a known syslog facility" % repr(facility))

def create_data_uri(filepath):
    """
    Given a file at *filepath*, return that file as a data URI.

    Raises a MimeTypeFail exception if the mimetype could not be guessed.
    """
    mimetype = mimetypes.guess_type(filepath)[0]
    if not mimetype:
        raise MimeTypeFail("Could not guess mime type of: %s" % filepath)
    f = open(filepath).read()
    encoded = base64.b64encode(f).replace('\n', '')
    if len(encoded) > 65000:
        logging.warn(
            "WARNING: Data URI > 65,000 characters.  You're pushing it buddy!")
    data_uri = "data:%s;base64,%s" % (mimetype, encoded)
    return data_uri