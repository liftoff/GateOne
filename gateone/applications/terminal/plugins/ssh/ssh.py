# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# TODO: Complete this docstring...
__doc__ = """\
ssh.py - A plugin for Gate One that adds additional SSH-specific features.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'Web': [(r"/ssh", KnownHostsHandler)],
        'WebSocket': {
            'ssh_get_connect_string': get_connect_string,
            'ssh_execute_command': ws_exec_command,
            'ssh_get_identities': get_identities,
            'ssh_get_public_key': get_public_key,
            'ssh_get_private_key': get_private_key,
            'ssh_get_host_fingerprint': get_host_fingerprint,
            'ssh_gen_new_keypair': generate_new_keypair,
            'ssh_store_id_file': store_id_file,
            'ssh_delete_identity': delete_identity,
            'ssh_set_default_identities': set_default_identities
        },
        'Escape': opt_esc_handler,
        'Events': {
            'terminal:authenticate': send_css_template,
            'terminal:authenticate': create_user_ssh_dir
        }
    }

Docstrings
----------
"""

# Meta
__version__ = '1.1'
__version_info__ = (1, 1)
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os, re, io
from datetime import datetime, timedelta
from functools import partial

# Our stuff
from gateone.core.server import BaseHandler
from gateone.core.utils import mkdir_p, shell_command, which
from gateone.core.utils import noop, bind
from gateone.core.locale import get_translation
from gateone.core.log import go_logger

_ = get_translation()

# Tornado stuff
import tornado.web
import tornado.ioloop

# Globals
ssh_log = go_logger("gateone.terminal.ssh", plugin='ssh')
OPENSSH_VERSION = None
DROPBEAR_VERSION = None
PLUGIN_PATH = os.path.split(__file__)[0] # Path to this plugin's directory
OPEN_SUBCHANNELS = {}
SUBCHANNEL_TIMEOUT = timedelta(minutes=5) # How long to wait before auto-closing
READY_STRING = "GATEONE_SSH_EXEC_CMD_CHANNEL_READY"
READY_MATCH = re.compile("^%s$" % READY_STRING, re.MULTILINE)
OUTPUT_MATCH = re.compile(
    "^{rs}.+^{rs}$".format(rs=READY_STRING), re.MULTILINE|re.DOTALL)
VALID_PRIVATE_KEY = valid = re.compile(
    r'^-----BEGIN [A-Z]+ PRIVATE KEY-----.*-----END [A-Z]+ PRIVATE KEY-----$',
    re.MULTILINE|re.DOTALL)
TIMER = None # Used to store temporary, cancellable timeouts
# TODO: make execute_command() a user-configurable option...  So it will automatically run whatever command(s) the user likes whenever they connect to a given server.  Differentiate between when they connect and when they start up a master or slave channel.
# TODO: Make it so that equivalent KnownHostsHandler functionality works over the WebSocket.

# Exceptions
class SSHMultiplexingException(Exception):
    """
    Called when there's a failure trying to open a sub-shell via OpenSSH's
    `Master mode <http://en.wikibooks.org/wiki/OpenSSH/Cookbook/Multiplexing>`_
    multiplexing capability.
    """
    pass

class SSHExecutionException(Exception):
    """
    Called when there's an error trying to execute a command in the slave.
    """
    pass

class SSHKeygenException(Exception):
    """
    Called when there's an error trying to generate a public/private keypair.
    """
    pass

class SSHKeypairException(Exception):
    """
    Called when there's an error trying to save public/private keypair or
    certificate.
    """
    pass

class SSHPassphraseException(Exception):
    """
    Called when we try to generate/decode something that requires a passphrase
    but no passphrase was given.
    """
    pass

def get_ssh_dir(self):
    """
    Given a :class:`gateone.TerminalWebSocket` (*self*) instance, return the
    current user's ssh directory

    .. note:: If the user's ssh directory doesn't start with a . (dot) it will be renamed.
    """
    user = self.current_user['upn']
    users_dir = os.path.join(self.ws.settings['user_dir'], user) # "User's dir"
    old_ssh_dir = os.path.join(users_dir, 'ssh')
    users_ssh_dir = os.path.join(users_dir, '.ssh')
    if os.path.exists(old_ssh_dir):
        if not os.path.exists(users_ssh_dir):
            self.ssh_log.info(_(
                "Renaming %s's 'ssh' directory to '.ssh'." % user))
            os.rename(old_ssh_dir, users_ssh_dir)
        else:
            self.ssh_log.warning(_(
                "Both an 'ssh' and '.ssh' directory exist for user %s.  "
                "Using the .ssh directory." % user))
    return users_ssh_dir

def open_sub_channel(self, term):
    """
    Opens a sub-channel of communication by executing a new shell on the SSH
    server using OpenSSH's `Master mode <http://en.wikibooks.org/wiki/OpenSSH/Cookbook/Multiplexing>`_
    capability (it spawns a new slave) and returns the resulting
    :class:`termio.Multiplex` instance.  If a slave has already been opened for
    this purpose it will re-use the existing channel.
    """
    term = int(term)
    global OPEN_SUBCHANNELS
    if term in OPEN_SUBCHANNELS and OPEN_SUBCHANNELS[term].isalive():
        # Use existing sub-channel (much faster this way)
        return OPEN_SUBCHANNELS[term]
    self.ssh_log.info("Opening SSH sub-channel", metadata={'term': term})
    # NOTE: When connecting a slave via ssh you can't tell it to execute a
    # command like you normally can (e.g. 'ssh user@host <some command>').  This
    # is why we're using the termio.Multiplex.expect() functionality below...
    session = self.ws.session
    session_dir = self.ws.settings['session_dir']
    session_path = os.path.join(session_dir, session)
    if not session_path:
        raise SSHMultiplexingException(_(
            "SSH Plugin: Unable to open slave sub-channel."))
    socket_path = self.loc_terms[term]['ssh_socket']
    # Interesting: When using an existing socket you don't need to give it all
    # the same options as you used to open it but you still need to give it
    # *something* in place of the hostname or it will report a syntax error and
    # print out the help.  So that's why I've put 'go_ssh_remote_cmd' below.
    # ...but I could have just used 'foo' :)
    if not socket_path:
        raise SSHMultiplexingException(_(
            "SSH Plugin: Unable to open slave sub-channel."))
    users_ssh_dir = get_ssh_dir(self)
    ssh_config_path = os.path.join(users_ssh_dir, 'config')
    if not os.path.exists(ssh_config_path):
        # Create it (an empty one so ssh doesn't error out)
        with open(ssh_config_path, 'w') as f:
            f.write('\n')
    # Hopefully 'go_ssh_remote_cmd' will be a clear enough indication of
    # what is going on by anyone that has to review the logs...
    ssh = which('ssh')
    ssh_command = "%s -x -S'%s' -F'%s' go_ssh_remote_cmd" % (
        ssh, socket_path, ssh_config_path)
    OPEN_SUBCHANNELS[term] = m = self.new_multiplex(
        ssh_command, "%s (sub)" % term)
    # Using huge numbers here so we don't miss much (if anything) if the user
    # executes something like "ps -ef".
    m.spawn(rows=100, cols=200) # Hopefully 100/200 lines/cols is enough
    # ...if it isn't, well, that's not really what this is for :)
    # Set the term title so it gets a proper name in the logs
    m.writeline(u'echo -e "\\033]0;Term %s sub-channel\\007"' % term)
    return m

def wait_for_prompt(term, cmd, errorback, callback, m_instance, matched):
    """
    Called by :func:`termio.Multiplex.expect` inside of :func:`execute_command`,
    clears the screen and executes *cmd*.  Also, sets an
    :func:`~termio.Multiplex.expect` to call :func:`get_cmd_output` when the
    end of the command output is detected.
    """
    ssh_log.debug('wait_for_prompt()')
    m_instance.term.clear_screen() # Makes capturing just what we need easier
    getoutput = partial(get_cmd_output, term, errorback, callback)
    m_instance.expect(OUTPUT_MATCH,
        getoutput, errorback=errorback, preprocess=False, timeout=10)
    # Run our command immediately followed by our separation/ready string
    m_instance.writeline((
        u'echo -e "{rs}"; ' # Echo the first READY_STRING
        u'{cmd}; ' # Execute the command in question
        u'echo -e "{rs}"' # READY_STRING again so we can capture the between
    ).format(rs=READY_STRING, cmd=cmd))

def get_cmd_output(term, errorback, callback, m_instance, matched):
    """
    Captures the output of the command executed inside of
    :func:`wait_for_prompt` and calls *callback* if it isn't `None`.
    """
    ssh_log.debug('get_cmd_output()')
    cmd_out = [a.rstrip() for a in m_instance.dump() if a.rstrip()]
    capture = False
    out = []
    for line in cmd_out:
        if not capture and line.startswith(READY_STRING):
            capture = True
        elif capture:
            if READY_STRING in line:
                break
            out.append(line)
    # This is just a silly trick to get the shell timing out/terminating itself
    # after a timout (so we don't keep the sub-channel open forever).  It is
    # easier than starting a timeout thread, timer, IOLoop.add_timeout(), etc
    # (I tried all those and it seemed to result in m_instance never getting
    # cleaned up properly by the garbage collector--it would leak memory)
    m_instance.unexpect() # Clear out any existing patterns (i.e. keepalive ;)
    m_instance.expect( # Add our inactivity timeout
        "^SUB-CHANNEL INACTIVITY TIMEOUT$", # ^ and $ to prevent accidents ;)
        noop, # Don't need to do anything since this should never match
        errorback=timeout_sub_channel,
        preprocess=False,
        timeout=SUBCHANNEL_TIMEOUT)
    m_instance.scheduler.start() # To ensure the timeout occurs
    cmd_out = "\n".join(out)
    if callback:
        callback(cmd_out, None)

def terminate_sub_channel(m_instance):
    """
    Calls `m_instance.terminate()` and deletes it from `OPEN_SUBCHANNELS`.
    """
    ssh_log.info(
        "Closing SSH sub-channel", metadata={'term': repr(m_instance.term_id)})
    global OPEN_SUBCHANNELS
    m_instance.terminate()
    # Find the Multiplex object inside of OPEN_SUBCHANNELS and remove it
    for key, value in list(OPEN_SUBCHANNELS.items()):
        # This will be something like: {1: <Multiplex instance>}
        if hash(value) == hash(m_instance):
            # This is necessary so the interpreter can properly collect garbage:
            del OPEN_SUBCHANNELS[key]

def timeout_sub_channel(m_instance):
    """
    Called when the sub-channel times out by way of an
    :class:`termio.Multiplex.expect` pattern that should never match anything.
    """
    ssh_log.info(
        _("SSH sub-channel closed due to inactivity."),
        metadata={'term': repr(m_instance.term_id)})
    terminate_sub_channel(m_instance)

def got_error(self, m_instance, match=None, term=None, cmd=None):
    """
    Called if :func:`execute_command` encounters a problem/timeout.

    *match* is here in case we want to use it for a positive match of an error.
    """
    self.ssh_log.error(_(
        "%s: Got an error trying to capture output inside of "
        "execute_command() running: %s" % (m_instance.user, m_instance.cmd)))
    self.ssh_log.debug("output before error: %s" % m_instance.dump())
    terminate_sub_channel(m_instance)
    if self:
        message = {
            'terminal:sshjs_cmd_output': {
                'cmd': cmd,
                'term': term,
                'output': None,
                'result': _(
                    'Error: Timeout exceeded or command failed to execute.')
            }
        }
        self.write_message(message)

def execute_command(self, term, cmd, callback=None):
    """
    Execute the given command (*cmd*) on the given *term* using the existing
    SSH tunnel (taking advantage of `Master mode <http://en.wikibooks.org/wiki/OpenSSH/Cookbook/Multiplexing>`_)
    and call *callback* with the output of said command and the current
    :class:`termio.Multiplex` instance as arguments like so::

        callback(output, m_instance)

    If *callback* is not provided then the command will be executed and any
    output will be ignored.

    .. note:: This will not result in a new terminal being opened on the client--it simply executes a command and returns the result using the existing SSH tunnel.
    """
    self.ssh_log.info(
        "Executing command on SSH sub-channel: %s" % cmd,
        metadata={'term': term, 'command': cmd})
    try:
        m = open_sub_channel(self, term)
    except SSHMultiplexingException as e:
        self.ssh_log.error(_(
            "%s: Got an error trying to open sub-channel on term %s..." %
            (self.current_user['upn'], term)))
        # Try to send an error response to the client
        message = {
            'terminal:sshjs_cmd_output': {
                'term': term,
                'cmd': cmd,
                'output': None,
                'result': str(e)
            }
        }
        try:
            self.write_message(message)
        except: # This is really just a last-ditch thing
            pass
        return
    # NOTE: We can assume the IOLoop is started and automatically calling read()
    m.unexpect() # Clear out any existing patterns (if existing sub-channel)
    m.term.clear_screen() # Clear the screen so nothing mucks up our regexes
    # Check to make sure we've got a proper prompt by executing an echo
    # statement and waiting for it to complete.  This is more reliable than
    # using a regular expression to match a shell prompt (which could be set
    # to anything).  It also gives us a clear indication as to where the command
    # output begins and ends.
    errorback = partial(got_error, self, term=term, cmd=cmd)
    wait = partial(wait_for_prompt, term, cmd, errorback, callback)
    m.expect(READY_MATCH,
        callback=wait, errorback=errorback, preprocess=False, timeout=10)
    self.ssh_log.debug("Waiting for READY_MATCH inside execute_command()")
    m.writeline(u'echo -e "\\n%s"' % READY_STRING)

def send_result(self, term, cmd, output, m_instance):
    """
    Called by :func:`ws_exec_command` when the output of the executed command
    has been captured successfully.  Writes a message to the client with the
    command's output and some relevant metadata.
    """
    message = {
        'terminal:sshjs_cmd_output': {
            'term': term,
            'cmd': cmd,
            'output': output,
            'result': 'Success'
        }
    }
    self.write_message(message)

def ws_exec_command(self, settings):
    """
    Takes the necessary variables from *settings* and calls :func:`execute_command`.

    *settings* should be a dict that contains a 'term' and a 'cmd' to execute.

    .. tip:: This function can be used to quickly execute a command and return its result from the client over an existing SSH connection without requiring the user to enter their password!  See execRemoteCmd() in ssh.js.
    """
    term = settings['term']
    cmd = settings['cmd']
    send = partial(send_result, self, term, cmd)
    try:
        execute_command(self, term, cmd, send)
    except SSHExecutionException as e:
        message = {
            'terminal:sshjs_cmd_output': {
                'term': term,
                'cmd': cmd,
                'output': None,
                'result': 'Error: %s' % e
            }
        }
        self.write_message(message)

# Handlers
class KnownHostsHandler(BaseHandler):
    """
    This handler allows the client to view, edit, and upload the known_hosts
    file associated with their user account.
    """
    @tornado.web.authenticated
    def get(self):
        """
        Determine what the user is asking for and call the appropriate method.
        """ # NOTE: Just dealing with known_hosts for now but keys are next
        get_kh = self.get_argument('known_hosts', None)
        if get_kh:
            self._return_known_hosts()

    @tornado.web.authenticated
    def post(self):
        """
        Determine what the user is updating by checking the given arguments and
        proceed with the update.
        """
        known_hosts = self.get_argument('known_hosts', None)
        if known_hosts:
            kh = self.request.body
            self._save_known_hosts(kh)

    def _return_known_hosts(self):
        """Returns the user's known_hosts file in text/plain format."""
        user = self.current_user['upn']
        ssh_log.debug("known_hosts requested by %s" % user)
        users_dir = os.path.join(self.settings['user_dir'], user) # "User's dir"
        users_ssh_dir = os.path.join(users_dir, '.ssh')
        kh_path = os.path.join(users_ssh_dir, 'known_hosts')
        known_hosts = ""
        if os.path.exists(kh_path):
            known_hosts = open(kh_path).read()
        self.set_header ('Content-Type', 'text/plain')
        self.write(known_hosts)

    def _save_known_hosts(self, known_hosts):
        """Save the given *known_hosts* file."""
        user = self.current_user['upn']
        users_dir = os.path.join(self.settings['user_dir'], user) # "User's dir"
        users_ssh_dir = os.path.join(users_dir, '.ssh')
        kh_path = os.path.join(users_ssh_dir, 'known_hosts')
        # Letting Tornado's exception handler deal with errors here
        with io.open(kh_path, 'wb') as f:
            f.write(known_hosts)
        self.write("success")

"""
WebSocket Commands
------------------
"""
# WebSocket commands (not the same as handlers)
def get_connect_string(self, term):
    """
    Attached to the (server-side) `terminal:ssh_get_connect_string` WebSocket
    action; writes the connection string associated with *term* to the WebSocket
    like so::

        {'terminal:sshjs_reconnect': {*term*: <connection string>}}

    In ssh.js we attach a WebSocket action to 'terminal:sshjs_reconnect'
    that assigns the connection string sent by this function to
    `GateOne.Terminal.terminals[*term*]['sshConnectString']`.
    """
    # This is the first function that normally gets called when a user uses SSH
    # so it's a good time to update the logger with extra metadata
    self.ssh_log = go_logger(
        "gateone.terminal.ssh", plugin='ssh', **self.log_metadata)
    term = int(term)
    if term not in self.loc_terms:
        return # Nothing to do (already closed)
    self.ssh_log.debug("get_connect_string()", metadata={'term': term})
    connect_string = self.loc_terms[term].get('ssh_connect_string', None)
    if connect_string:
        message = {
            'terminal:sshjs_reconnect': {
                'term': term,
                'connect_string': connect_string
            }
        }
        self.write_message(message)

def get_key(self, name, public):
    """
    Returns the private SSH key associated with *name* to the client.  If
    *public* is `True`, returns the public key to the client.
    """
    if not isinstance(name, (str, unicode)):
        error_msg = _(
            'SSH Plugin Error: Invalid name given, %s' % repr(name))
        message = {'go:save_file': {'result': error_msg}}
        self.write_message(message)
        return
    if public and not name.endswith('.pub'):
        name += '.pub'
    out_dict = {
        'result': None, # Yet
        'filename': name,
        'data': None,
        'mimetype': 'text/plain'
    }
    users_ssh_dir = get_ssh_dir(self)
    key_path = os.path.join(users_ssh_dir, name)
    if os.path.exists(key_path):
        with open(key_path) as f:
            out_dict['data'] = f.read()
        out_dict['result'] = 'Success'
    else:
        out_dict['result'] = _(
            'SSH Plugin Error: Public key not found at %s' % key_path)
    message = {'go:save_file': out_dict}
    self.write_message(message)
    return out_dict

def get_public_key(self, name):
    """
    Returns the user's public key file named *name*.
    """
    get_key(self, name, True)

def get_private_key(self, name):
    """
    Returns the user's private key file named *name*.
    """
    get_key(self, name, False)

def get_host_fingerprint(self, settings):
    """
    Returns a the hash of the given host's public key by making a remote
    connection to the server (not just by looking at known_hosts).
    """
    out_dict = {}
    if 'port' not in settings:
        port = 22
    else:
        port = settings['port']
    if 'host' not in settings:
        out_dict['result'] = _("Error:  You must supply a 'host'.")
        message = {'terminal:sshjs_display_fingerprint': out_dict}
        self.write_message(message)
    else:
        host = settings['host']
    self.ssh_log.debug(
        "get_host_fingerprint(%s:%s)" % (host, port),
        metadata={'host': host, 'port': port})
    out_dict.update({
        'result': 'Success',
        'host': host,
        'fingerprint': None
    })
    ssh = which('ssh')
    command = "%s -p %s -oUserKnownHostsFile=none -F. %s" % (ssh, port, host)
    m = self.new_multiplex(
        command,
        'get_host_key',
        logging=False) # Logging is false so we don't make tons of silly logs
    def grab_fingerprint(m_instance, match):
        out_dict['fingerprint'] = match.splitlines()[-1][:-1]
        m_instance.terminate()
        message = {'terminal:sshjs_display_fingerprint': out_dict}
        self.write_message(message)
        del m_instance
    def errorback(m_instance):
        leftovers = [a.rstrip() for a in m_instance.dump() if a.strip()]
        out_dict['result'] = _(
            "Error: Could not determine the fingerprint of %s:%s... '%s'"
            % (host, port, "\n".join(leftovers)))
        m_instance.terminate() # Don't leave stuff hanging around!
        message = {'terminal:sshjs_display_fingerprint': out_dict}
        self.write_message(message)
        del m_instance
    # "The authenticity of host 'localhost (127.0.0.1)' can't be established.\r\nECDSA key fingerprint is 83:f5:b1:f1:d3:8c:b8:fe:d3:be:e5:dd:95:a5:ba:73.\r\nAre you sure you want to continue connecting (yes/no)? "
    m.expect('\n.+fingerprint .+\n',
        grab_fingerprint, errorback=errorback, preprocess=False)
    m.spawn()
    # OpenSSH output example:
    # ECDSA key fingerprint is 28:46:86:3a:c6:f9:63:b8:90:e1:09:69:f2:1d:c8:ce.
    # Dropbear output example:
    # (fingerprint md5 fa:a1:5b:4f:e5:ab:fe:e6:1f:1f:74:20:d7:35:67:c2)

def generate_new_keypair(self, settings):
    """
    Calls :func:`openssh_generate_new_keypair` or
    :func:`dropbear_generate_new_keypair` depending on what's available on the
    system.
    """
    self.ssh_log.debug('generate_new_keypair()')
    users_ssh_dir = get_ssh_dir(self)
    name = 'id_ecdsa'
    keytype = None
    bits = None
    passphrase = ''
    comment = ''
    if 'name' in settings:
        name = settings['name']
    if 'keytype' in settings:
        keytype = settings['keytype']
    if 'bits' in settings:
        bits = settings['bits']
    if 'passphrase' in settings:
        passphrase = settings['passphrase']
    if 'comment' in settings:
        comment = settings['comment']
    log_metadata = {
        'name': name,
        'keytype': keytype,
        'bits': bits,
        'comment': comment
    }
    self.ssh_log.info("Generating new SSH keypair", metadata=log_metadata)
    if which('ssh-keygen'): # Prefer OpenSSH
        openssh_generate_new_keypair(
            self,
            name, # Name to use when generating the keypair
            users_ssh_dir, # Path to save it
            keytype=keytype,
            passphrase=passphrase,
            bits=bits,
            comment=comment
        )
    elif which('dropbearkey'):
        dropbear_generate_new_keypair(self,
            name, # Name to use when generating the keypair
            users_ssh_dir, # Path to save it
            keytype=keytype,
            passphrase=passphrase,
            bits=bits,
            comment=comment)

def errorback(self, m_instance):
    self.ssh_log.error(_("Keypair generation failed."))
    print(m_instance.dump())
    m_instance.terminate()
    message = {
        'terminal:sshjs_keygen_complete': {
            'result': _("There was a problem generating SSH keys: %s"
                        % m_instance.dump()),
        }
    }
    self.write_message(message)

def overwrite(m_instance, match):
    """
    Called if we get asked to overwrite an existing keypair.
    """
    ssh_log.debug('overwrite()')
    m_instance.writeline('y')

def enter_passphrase(passphrase, m_instance, match):
    ssh_log.debug("entering passphrase...")
    m_instance.writeline('%s' % passphrase)

def finished(self, m_instance, fingerprint):
    self.ssh_log.info(
        _("Keypair generation complete"), metadata={'fingerprint': fingerprint})
    message = {
        'terminal:sshjs_keygen_complete': {
            'result': 'Success',
            'fingerprint': fingerprint
        }
    }
    m_instance.terminate()
    self.write_message(message)

def openssh_generate_new_keypair(self, name, path,
        keytype=None, passphrase="", bits=None, comment=""):
    """
    Generates a new private and public key pair--stored in the user's directory
    using the given *name* and other optional parameters (using OpenSSH).

    If *keytype* is given, it must be one of "ecdsa", "rsa" or "dsa" (case
    insensitive).  If *keytype* is "rsa" or "ecdsa", *bits* may be specified to
    specify the size of the key.

    .. note:: Defaults to generating a 521-byte ecdsa key if OpenSSH is version 5.7+. Otherwise a 2048-bit rsa key will be used.
    """
    self.ssh_log.debug('openssh_generate_new_keypair()')
    openssh_version = shell_command('ssh -V')[1]
    ssh_major_version = int(
        openssh_version.split()[0].split('_')[1].split('.')[0])
    key_path = os.path.join(path, name)
    ssh_minor_version = int(
        openssh_version.split()[0].split('_')[1].split('.')[1][0])
    ssh_version = "%s.%s" % (ssh_major_version, ssh_minor_version)
    ssh_version = float(ssh_version)
    if not keytype:
        if ssh_version >= 5.7:
            keytype = "ecdsa"
        else:
            keytype = "rsa"
    else:
        keytype = keytype.lower()
    if not bits and keytype == "ecdsa":
        bits = 521 # Not a typo: five-hundred-twenty-one bits
    elif not bits and keytype == "rsa":
        bits = 2048
    if not passphrase: # This just makes sure False and None end up as ''
        passphrase = ''
    hostname = os.uname()[1]
    if not comment:
        now = datetime.now().isoformat()
        comment = "Generated by Gate One on %s %s" % (hostname, now)
    ssh_keygen_path = which('ssh-keygen')
    command = (
        "%s "       # Path to ssh-keygen
        "-b %s "    # bits
        "-t %s "    # keytype
        "-C '%s' "  # comment
        "-f '%s'"   # Key path
        % (ssh_keygen_path, bits, keytype, comment, key_path)
    )
    self.ssh_log.debug("Keygen command: %s" % command)
    m = self.new_multiplex(command, "gen_ssh_keypair")
    call_errorback = partial(errorback, self)
    m.expect('^Overwrite.*',
        overwrite, optional=True, preprocess=False, timeout=10)
    passphrase_handler = partial(enter_passphrase, passphrase)
    m.expect('^Enter passphrase',
        passphrase_handler,
        errorback=call_errorback,
        preprocess=False,
        timeout=10)
    m.expect('^Enter same passphrase again',
        passphrase_handler,
        errorback=call_errorback,
        preprocess=False,
        timeout=10)
    finalize = partial(finished, self)
    # The regex below captures the md5 fingerprint which tells us the
    # operation was successful.
    m.expect(
        '(([0-9a-f][0-9a-f]\:){15}[0-9a-f][0-9a-f])',
        finalize,
        errorback=call_errorback,
        preprocess=False,
        timeout=15 # Key generation can take a little while
    )
    m.spawn()

def dropbear_generate_new_keypair(self, name, path,
        keytype=None, passphrase="", bits=None, comment=""):
    """
    .. note:: Not implemented yet
    """
    pass

def openssh_generate_public_key(self, path, passphrase=None, settings=None):
    """
    Generates a public key from the given private key at *path*.  If a
    *passphrase* is provided, it will be used to generate the public key (if
    necessary).
    """
    self.ssh_log.debug('openssh_generate_public_key()')
    ssh_keygen_path = which('ssh-keygen')
    pubkey_path = "%s.pub" % path
    command = (
        "%s "       # Path to ssh-keygen
        "-f '%s' "  # Key path
        "-y "       # Output public key to stdout
        "2>&1 "     # Redirect stderr to stdout so we can catch failures
        "> '%s'"    # Redirect stdout to the public key path
        % (ssh_keygen_path, path, pubkey_path)
    )
    import termio
    m = termio.Multiplex(command)
    def request_passphrase(*args, **kwargs):
        "Called if this key requires a passphrase.  Ask the client to provide"
        message = {'terminal:sshjs_ask_passphrase': settings}
        self.write_message(message)
    def bad_passphrase(m_instance, match):
        "Called if the user entered a bad passphrase"
        settings['bad'] = True
        request_passphrase()
    if passphrase:
        m.expect('^Enter passphrase',
            "%s\n" % passphrase, optional=True, preprocess=False, timeout=5)
        m.expect('^load failed',
            bad_passphrase, optional=True, preprocess=False, timeout=5)
    elif settings:
        m.expect('^Enter passphrase',
            request_passphrase, optional=True, preprocess=False, timeout=5)
    def atexit(child, exitstatus):
        "Raises an SSHKeygenException if the *exitstatus* isn't 0"
        if exitstatus != 0:
            print(m.dump)
            raise SSHKeygenException(_(
                "Error generating public key from private key at %s" % path))
    m.spawn(exitfunc=atexit)
    #exitstatus, output = shell_command(command)
    #if exitstatus != 0:
        #raise SSHKeygenException(_(
            #"Error generating public key from private key at %s" % path))

# ssh-kegen example for reference:
    #$ ssh-keygen -b 521 -t ecdsa "Testing" -f /tmp/testkey
    #Generating public/private ecdsa key pair.
    #Enter passphrase (empty for no passphrase):
    #Enter same passphrase again:
    #Your identification has been saved in /tmp/testkey.
    #Your public key has been saved in /tmp/testkey.pub.
    #The key fingerprint is:
    #6b:13:4b:5d:80:bd:21:70:33:f5:b9:15:78:75:08:9a Testing
    #The key's randomart image is:
    #+--[ECDSA  521]---+
    #|      ..++o .o.oo|
    #|       .ooo=..o..|
    #|         .Eo+..  |
    #|         ... o   |
    #|        S . .    |
    #|       . +       |
    #|        =        |
    #|       . .       |
    #|                 |
    #+-----------------+

# dropbearkey example for reference:

    #root@router:~# dropbearkey -t dss -f /tmp/testing
    #Will output 1024 bit dss secret key to '/tmp/testing'
    #Generating key, this may take a while...
    #Public key portion is:
    #ssh-dss AAAAB3NzaC1kc3MAAACBAJ5jU4izsZtJKEojw7gIcc6e3U4X6OENN6081YxSAanfTbKjR0V3Ho6aui2z8o039BVH4S5cVD51vEEvDjirKStM2aMvdrVZkjGH1iOMWY4MQrCl4EqMr7rWikeiZJN6BJ+xmPBUyZuicVDFkBwqC+dKgxml0RTpa7TYBWvp403XAAAAFQDg6vb3afaKM9+DvBW7I4xPxF8a8QAAAIEAjcNHYFrqcWK9lSsw2Oy+w1PEWQuxvWydXXk3MQyiZ/PYaeU/138iCB2pW1fgCksx5CHF8dgtQ7AsFv32gBlxuDgX3EYtPYR0wGJqyU7w9+qaq1T02zmDfW4k2WDfMNz+QWFYHuKzC/aeuEC0BRTLyPVQMHLNAd/F5beCqlIPRPcAAACAfUy1+yNgK2svox6aJRqtpxbMSPDRNTRMAjeTkCeLopesZFYbPvms2c19WkIk2qD9aw3gIxsR4wO+kkvI4BtOs8dXQWS+bc+svJbIYOqmPFo89BJHfbP9wvMhfTlp1uH9LxAG6ZiHHz5fseUgTrwYkSw1beUprikxlca8lQm5v7g= root@RouterStationPro
    #Fingerprint: md5 c6:f9:f2:95:b8:40:ac:f3:53:f1:39:e9:57:a0:58:18

# TODO: Get this validating uploaded keys.
def store_id_file(self, settings):
    """
    Stores the given *settings['private']* and/or *settings['public']* keypair
    in the user's ssh directory as *settings['name']* and/or
    *settings['name']*.pub, respectively.  Either file can be saved independent
    of each other (in case this function needs to be called multiple times to
    save each respective file).

    Also, a *settings['certificate']* may be provided to be saved along
    with the private and public keys.  It will be saved as
    *settings['name']*-cert.pub.

    .. note::

        I've found the following website helpful in understanding how to use
        OpenSSH with SSL certificates:
        http://blog.habets.pp.se/2011/07/OpenSSH-certificates

    .. tip::

        Using signed-by-a-CA certificates is very handy because allows you to
        revoke the user's SSH key(s).  e.g. If they left the company.
    """
    self.ssh_log.debug('store_id_file()')
    out_dict = {'result': 'Success'}
    global TIMER
    try:
        name = settings.get('name', None)
        if not name:
            raise SSHKeypairException(_("You must specify a valid *name*."))
        name = os.path.splitext(name)[0] # Remove .txt, .pub, etc
        private = settings.get('private', None)
        public = settings.get('public', None)
        certificate = settings.get('certificate', None)
        passphrase = settings.get('passphrase', None)
        if not private and not public and not certificate:
            raise SSHKeypairException(_("No files were given to save!"))
        users_ssh_dir = get_ssh_dir(self)
        private_key_path = os.path.join(users_ssh_dir, name)
        # Strip any .pub or .txt from the end of the public key
        if name.endswith('.pub'):
            public_key_name = name # Get rid of the extra .pub
        public_key_name = name + '.pub'
        public_key_path = os.path.join(users_ssh_dir, public_key_name)
        certificate_name = name + '-cert.pub'
        if name.endswith('-cert.pub'):
            certificate_name = name # Don't need an extra -cert.pub at the end
        certificate_path = os.path.join(users_ssh_dir, certificate_name)
        if private:
            # Fix Windows newlines
            private = private.replace('\r\n', '\n')
            if VALID_PRIVATE_KEY.match(private):
                with open(private_key_path, 'w') as f:
                    f.write(private)
                # Without this you get a warning:
                os.chmod(private_key_path, 0o600)
            else:
                self.write_message({'go:notice': _(
                    "ERROR: Private key is not valid.")})
                return
        if public:
            # Fix Windows newlines
            public = public.replace('\r\n', '\n')
            with open(public_key_path, 'w') as f:
                f.write(public)
            # Now remove the timer that will generate the public key from the
            # private key if it is set.
            if TIMER:
                self.ssh_log.debug(_(
                    "Got public key, cancelling public key generation timer."))
                io_loop = tornado.ioloop.IOLoop.current()
                io_loop.remove_timeout(TIMER)
                TIMER = None
            get_ids = partial(get_identities, self, None)
            io_loop.add_timeout(timedelta(seconds=2), get_ids)
        elif private: # No biggie, generate one
            # Only generate a new public key if one isn't uploaded within 2
            # seconds (should be plenty of time since they're typically sent
            # simultaneously but inside different WebSocket messages).
            self.ssh_log.debug(_(
                "Only received a private key.  Setting timeout to generate the "
                "public key if not received within 3 seconds."))
            io_loop = tornado.ioloop.IOLoop.current()
            deadline = timedelta(seconds=2)
            def generate_public_key(): # I love closures
                openssh_generate_public_key(self,
                    private_key_path, passphrase, settings=settings)
                get_ids = partial(get_identities, self, None)
                io_loop.add_timeout(timedelta(seconds=2), get_ids)
            # This gets removed if the public key is uploaded
            TIMER = io_loop.add_timeout(deadline, generate_public_key)
        if certificate:
            # Fix Windows newlines
            certificate = certificate.replace('\r\n', '\n')
            with open(certificate_path, 'w') as f:
                f.write(certificate)
    except Exception as e:
        out_dict['result'] = _("Error saving keys: %s" % e)
    message = {
        'terminal:sshjs_save_id_complete': out_dict
    }
    self.write_message(message)

def delete_identity(self, name):
    """
    Removes the identity associated with *name*.  For example if *name* is
    'testkey', 'testkey' and 'testkey.pub' would be removed from the user's
    ssh directory (and 'testkey-cert.pub' if present).
    """
    self.ssh_log.info(
        'Deleting SSH identity: %s' % name, metadata={'name': name})
    out_dict = {'result': 'Success'}
    users_ssh_dir = get_ssh_dir(self)
    private_key_path = os.path.join(users_ssh_dir, name)
    public_key_path = os.path.join(users_ssh_dir, name+'.pub')
    certificate_path = os.path.join(users_ssh_dir, name+'-cert.pub')
    try:
        if os.path.exists(private_key_path):
            os.remove(private_key_path)
        if os.path.exists(public_key_path):
            os.remove(public_key_path)
        if os.path.exists(certificate_path):
            os.remove(certificate_path)
    except Exception as e:
        out_dict['result'] = _("Error deleting keypair: %s" % e)
    message = {
        'terminal:sshjs_delete_identity_complete': out_dict
    }
    self.write_message(message)

def get_identities(self, *anything):
    """
    Sends a message to the client with a list of the identities stored on the
    server for the current user.

    *anything* is just there because the client needs to send *something* along
    with the 'action'.
    """
    self.ssh_log.debug('get_identities()')
    out_dict = {'result': 'Success'}
    users_ssh_dir = get_ssh_dir(self)
    out_dict['identities'] = []
    ssh_keygen_path = which('ssh-keygen')
    # TODO:  Switch this from using ssh-keygen to determine the keytype to using the string inside the public key.
    try:
        if os.path.exists(users_ssh_dir):
            ssh_files = os.listdir(users_ssh_dir)
            for f in ssh_files:
                if f.endswith('.pub'):
                    # Double-check there's also a private key...
                    identity = f[:-4] # Will be the same name minus '.pub'
                    if identity in ssh_files:
                        id_path = os.path.join(users_ssh_dir, identity)
                        pub_key_path = os.path.join(users_ssh_dir, f)
                        public_key_contents = open(pub_key_path).read()
                        comment = ' '.join(public_key_contents.split(' ')[2:])
                        if public_key_contents.startswith('ecdsa'):
                            keytype = 'ECDSA'
                        elif public_key_contents.startswith('ssh-dss'):
                            keytype = 'DSA'
                        elif public_key_contents.startswith('ssh-rsa'):
                            keytype = 'RSA'
                        else:
                            keytype = 'Unknown'
                        keygen_cmd = "'%s' -vlf '%s'" % (
                            ssh_keygen_path, id_path)
                        retcode, key_info = shell_command(keygen_cmd)
                        # This will just wind up as an empty string if the
                        # version of ssh doesn't support randomart:
                        randomart = '\n'.join(key_info.splitlines()[1:])
                        bits = key_info.split()[0]
                        fingerprint = key_info.split()[1]
                        retcode, bubblebabble = shell_command(
                            "'%s' -Bf '%s'" % (ssh_keygen_path, id_path))
                        bubblebabble = bubblebabble.split()[1]
                        certinfo = ''
                        cert_path = "'%s-cert.pub'" % id_path
                        if os.path.exists(cert_path):
                            retcode, certinfo = shell_command(
                            "'%s' -Lf '%s'" % (ssh_keygen_path, cert_path))
                        certinfo = ' '.join(certinfo.split(' ')[1:])
                        fixed_certinfo = ''
                        for i, line in enumerate(certinfo.splitlines()):
                            if i == 0:
                                line = line.lstrip()
                            fixed_certinfo += line.replace('    ', ' ')
                            fixed_certinfo += '\n'
                        id_obj = {
                            'name': identity,
                            'public': public_key_contents,
                            'keytype': keytype,
                            'bubblebabble': bubblebabble,
                            'fingerprint': fingerprint,
                            'randomart': randomart,
                            'certinfo': fixed_certinfo,
                            'bits': bits,
                            'comment': comment.rstrip(),
                        }
                        out_dict['identities'].append(id_obj)
        # Figure out which identities are defaults
        default_ids = []
        default_ids_exists = False
        users_ssh_dir = get_ssh_dir(self)
        default_ids_path = os.path.join(users_ssh_dir, '.default_ids')
        if os.path.exists(default_ids_path):
            default_ids_exists = True
            with open(default_ids_path) as f:
                default_ids = f.read().splitlines() # Why not readlines()? \n
        # Convert any absolute paths inside default_ids to just the short names
        default_ids = [os.path.split(a)[1] for a in default_ids]
        if default_ids_exists:
            for i, id_obj in enumerate(out_dict['identities']):
                if id_obj['name'] in default_ids:
                    out_dict['identities'][i]['default'] = True
                else:
                    out_dict['identities'][i]['default'] = False
    except Exception as e:
        error_msg = _("Error getting identities: %s" % e)
        self.ssh_log.error(error_msg)
        out_dict['result'] = error_msg
    message = {
        'terminal:sshjs_identities_list': out_dict
    }
    self.write_message(message)

def set_default_identities(self, identities):
    """
    Given a list of *identities*, mark them as defaults to use in all outbound
    SSH connections by writing them to `<user's ssh dir>/.default_ids`.  If
    *identities* is empty, no identities will be used in outbound connections.

    .. note::

        Whenever this function is called it will overwrite whatever is in
        `.default_ids`.
    """
    if isinstance(identities, list): # Ignore anything else
        users_ssh_dir = get_ssh_dir(self)
        default_ids_path = os.path.join(users_ssh_dir, '.default_ids')
        with open(default_ids_path, 'w') as f:
            f.write('\n'.join(identities) + '\n') # Need that trailing newline

def set_ssh_socket(self, term, path):
    """
    Given a *term* and *path*, sets
    ``self.loc_terms[term]['ssh_socket'] = path``.
    """
    self.ssh_log.debug("set_ssh_socket(): %s, %s" % (term, path))
    term = int(term)
    if term in self.loc_terms:
        self.loc_terms[term]['ssh_socket'] = path
        self.save_term_settings(term, {'ssh_socket': path})

def set_ssh_connect_string(self, term, connect_string):
    """
    Given a *term* and *connect_string*, sets
    ``self.loc_terms[term]['ssh_connect_string'] = connect_string``.
    """
    self.ssh_log.debug(
        'set_ssh_connect_string: %s, %s' % (term, connect_string))
    term = int(term)
    if term in self.loc_terms:
        self.loc_terms[term]['ssh_connect_string'] = connect_string
        self.save_term_settings(term, {'ssh_connect_string': connect_string})
    message = {'terminal:sshjs_connect': connect_string}
    self.write_message(message)

# Special optional escape sequence handler (see docs on how it works)
def opt_esc_handler(self, text, term=None, multiplex=None):
    """
    Handles text passed from the special optional escape sequance handler.  We
    use it to tell ssh.js what the SSH connection string is so it can use that
    information to duplicate sessions (if the user so desires).  For reference,
    the specific string which will call this function from a terminal app is::

        \\x1b]_;ssh|<whatever>\\x07

    .. seealso::

        :class:`gateone.TerminalWebSocket.esc_opt_handler` and
        :func:`terminal.Terminal._opt_handler`
    """
    supported_assignments = {
        'ssh_socket': set_ssh_socket,
        'connect_string': set_ssh_connect_string
    }
    if text.startswith('set;'):
        values = text.split(';')
        assignment = values[1]
        data = values[2:]
        func = supported_assignments.get(assignment, None)
        if func:
            func(self, term, *data)
        return

def create_user_ssh_dir(self):
    """
    To be called by the 'Auth' hook that gets called after the user is done
    authenticating, ensures that the `<user's dir>/ssh` directory exists.
    """
    self.ssh_log.debug("create_user_ssh_dir()")
    user = self.current_user['upn']
    users_dir = os.path.join(self.ws.settings['user_dir'], user) # "User's dir"
    ssh_dir = os.path.join(users_dir, '.ssh')
    try:
        mkdir_p(ssh_dir)
    except OSError as e:
        self.ssh_log.error(_("Error creating user's ssh directory: %s\n" % e))

def send_ssh_css_template(self):
    """
    Sends our ssh.css template to the client using the 'load_style'
    WebSocket action.  The rendered template will be saved in Gate One's
    'cache_dir'.
    """
    css_path = os.path.join(PLUGIN_PATH, 'templates', 'ssh.css')
    self.render_and_send_css(css_path)

def initialize(self):
    """
    Called inside of :meth:`TerminalApplication.initialize` shortly after the
    WebSocket is instantiated.  Attaches our two `terminal:authenticate` events
    (to create the user's .ssh dir and send our CSS template) and ensures that
    the ssh_connect.py script is executable.
    """
    ssh_connect_path = os.path.join(PLUGIN_PATH, 'scripts', 'ssh_connect.py')
    if os.path.exists(ssh_connect_path):
        import stat
        st = os.stat(ssh_connect_path)
        if not bool(st.st_mode & stat.S_IXOTH):
            try:
                os.chmod(ssh_connect_path, 0o755)
            except OSError:
                ssh_log.error(_(
                    "Could not set %s as executable.  You will need to 'chmod "
                    "a+x' that script manually.") % ssh_connect_path)
                user_msg = _(
                    "Error loading SSH plugin:  The ssh_connect.py script is "
                    "not executable.  See the logs for more details.")
                send_msg = partial(self.ws.send_message, user_msg)
                events = ["terminal:authenticate", "terminal:new_terminal"]
                self.on(events, send_msg)
    self.ssh_log = go_logger("gateone.terminal.ssh", plugin='ssh')
    # NOTE:  Why not use the 'Events' hook for these?  You can't attach two
    # functions to the same event via that mechanism because it's a dict
    # (one would override the other).
    # An alternative would be to write a single function say, on_auth() that
    # calls both of these functions then assign it to 'terminal:authenticate' in
    # the 'Events' hook.  I think this way is better since it is more explicit.
    self.on('terminal:authenticate', bind(send_ssh_css_template, self))
    self.on('terminal:authenticate', bind(create_user_ssh_dir, self))

hooks = {
    'Web': [(r"/ssh", KnownHostsHandler)],
    'WebSocket': {
        'terminal:ssh_get_connect_string': get_connect_string,
        'terminal:ssh_execute_command': ws_exec_command,
        'terminal:ssh_get_identities': get_identities,
        'terminal:ssh_get_public_key': get_public_key,
        'terminal:ssh_get_private_key': get_private_key,
        'terminal:ssh_get_host_fingerprint': get_host_fingerprint,
        'terminal:ssh_gen_new_keypair': generate_new_keypair,
        'terminal:ssh_store_id_file': store_id_file,
        'terminal:ssh_delete_identity': delete_identity,
        'terminal:ssh_set_default_identities': set_default_identities,
    },
    'Escape': opt_esc_handler,
}

# Certificate information (as output by ssh-keygen) for reference:
#
#$ ssh-keygen -Lf id_rsa-cert.pub
#id_rsa-cert.pub:
        #Type: ssh-rsa-cert-v01@openssh.com user certificate
        #Public key: RSA-CERT 80:57:2c:18:f9:86:ab:8b:64:27:db:6f:5e:03:3f:d9
        #Signing CA: RSA 86:25:b0:73:67:0f:51:2e:a7:96:63:08:fb:d6:69:94
        #Key ID: "user_riskable"
        #Serial: 0
        #Valid: from 2012-01-08T13:38:00 to 2013-01-06T13:39:27
        #Principals:
                #riskable
        #Critical Options: (none)
        #Extensions:
                #permit-agent-forwarding
                #permit-port-forwarding
                #permit-pty
                #permit-user-rc
                #permit-X11-forwarding


# NOTE: *message['identities'][0]* - An associative array conaining the key's metadata.  For example:
#
#{
    #'name': "testid",
    #'public': "ecdsa-sha2-nistp521 AAAAE2VjZHNhLXNoYTItbmlzdHA1MjEAAAAIbmlzdHA1MjEAAACFBAChqFprVjC0MKe3qpjjc+WdANOHMgcUl46dJxZ+s5soBTkO6thcJDAbFb36lg3YyzZi/PtDJV5CPp8Mv1SUXUYBqgFZJFBqWwkB0O1ohjtEVzC8+ybrY+hP0zLqykglhOi+6W66HgFwjJGn56uGE7s8UpnSRKtqGq2USyme5gopYlytTw== Generated by Gate One on somehost",
    #'keytype': "ecdsa",
    #'bubblebabble': "xevol-budez-difod-zumif-zofos-vezis-rilep-febel-tufok-lugud-dyxex",
    #'fingerprint': "0e:69:0a:9e:2e:26:2b:91:23:3d:95:4b:65:31:a9:6f",
    #'randomart': "+--[ECDSA  521]---+\n|      oo         |\n|      +.         |\n|     =           |\n|    =  .         |\n| o.o o+ S        |\n|=.oo.oEo         |\n|.oo...  .        |\n|+o               |\n|=o.              |\n+-----------------+",
    #'certinfo': "",
    #'bits': 521,
    #'comment': "Generated by Gate One on somehost",
#}
