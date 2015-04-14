# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation (http://liftoffsoftware.com)
#
# NOTE:  Commercial licenses for this software are available!
#

# TODO: See if we can spin off termio.py into its own little program that sits between Gate One and ssh_connect.py.  That way we can take advantage of multiple cores/processors (for terminal-to-HTML processing).  There's no reason why we can't write something that does what dtach does.  Just need to redirect the fd of self.cmd to a unix domain socket and os.setsid() somewhere after forking (twice maybe?).
# TODO: Make the environment variables used before launching self.cmd configurable

# Meta
__version__ = '1.2'
__version_info__ = (1, 2)
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
About termio
============
This module provides a Multiplex class that can perform the following:

 * Fork a child process that opens a given terminal program.
 * Read and write data to and from the child process (synchronously or asynchronously).
 * Examine the output of the child process in real-time and perform actions (also asynchronously!) based on what is "expected" (aka non-blocking, pexpect-like functionality).
 * Log the output of the child process to a file and/or syslog.

The Multiplex class was built for asynchronous use in conjunction with a running
:class:`tornado.ioloop.IOLoop` instance but it can be used in a synchronous
(blocking) manner as well.  Synchronous use of this module is most likely to be
useful in an interactive Python session but if blocking doesn't matter for your
program please see the section titled, "Blocking" for tips & tricks.

Here's an example instantiating a Multiplex class::

    multiplexer = termio.Multiplex(
        'nethack',
        log_path='/var/log/myapp',
        user='bsmith@CORP',
        term_id=1,
        syslog=True
    )

.. note:: Support for event loops other than Tornado is in the works!

Then *multiplexer* can create and launch a new controlling terminal (tty)
running the given command (e.g. 'nethack')::

    env = {
        'PATH': os.environ['PATH'],
        'MYVAR': 'foo'
    }
    fd = multiplexer.spawn(80, 24, env=env)
    # The fd is returned from spawn() in case you want more low-level control.

Asynchronous input and output from the controlled program is handled via IOLoop.
It will automatically write all output from the terminal program to an instance
of self.terminal_emulator (which defaults to Gate One's `terminal.Terminal`).
So if you want to perform an action whenever the running terminal application
has output (like, say, sending a message to a client) you'll need to attach a
callback::

    def screen_update():
        'Called when new output is ready to send to the client'
        output = multiplexer.dump_html()
        socket_or_something.write(output)
    multiplexer.callbacks[multiplexer.CALLBACK_UPDATE] = screen_update

In this example, `screen_update()` will `write()` the output of
`multiplexer.dump_html()` to *socket_or_something* whenever the terminal program
has some sort of output.  You can also make calls directly to the terminal
emulator (if you're using a custom one)::

    def screen_update():
        output = multiplexer.term.my_custom_func()
        whatever.write(output)

Writing characters to the controlled terminal application is pretty
straightforward::

    multiplexer.write(u'some text')

Typically you'd pass in keystrokes or commands from your application to the
underlying program this way and the screen/terminal emulator would get updated
automatically.  If using Gate One's `terminal.Terminal()` you can also attach
callbacks to perform further actions when more specific situations are
encountered (e.g. when the window title is set via its respective escape
sequence)::

    def set_title():
        'Hypothetical title-setting function'
        print("Window title was just set to: %s" % multiplexer.term.title)
    multiplexer.term.callbacks[multiplexer.CALLBACK_TITLE] = set_title

Module Functions and Classes
============================
"""

# Stdlib imports
import os, sys, time, struct, io, gzip, re, logging, signal
from datetime import timedelta, datetime
from functools import partial
from itertools import izip
from concurrent.futures import ProcessPoolExecutor
from json import loads as json_decode
from json import dumps as json_encode

# Inernationalization support
_ = str # So pylint doesn't show a zillion errors about a missing _() function
import gettext
gettext.install('termio')

# Globals
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log
# NOTE: That unicode character was carefully selected from only the finest
# of the PUA.  I hereby dub thee, "U+F0F0F0, The Separator."
POSIX = 'posix' in sys.builtin_module_names
MACOS = os.uname()[0] == 'Darwin'
# Matches Gate One's special optional escape sequence (ssh plugin only)
RE_OPT_SSH_SEQ = re.compile(
    r'.*\x1b\]_\;(ssh\|set;connect_string.+?)(\x07|\x1b\\)',
    re.MULTILINE|re.DOTALL)
# Matches an xterm title sequence
RE_TITLE_SEQ = re.compile(
    r'.*\x1b\][0-2]\;(.+?)(\x07|\x1b\\)', re.DOTALL|re.MULTILINE)
EXTRA_DEBUG = False # For those times when you need to get dirty

# Helper functions
def debug_expect(m_instance, match, pattern):
    """
    This method is used by :meth:`BaseMultiplex.expect` if :attr:`self.debug` is
    True.  It facilitates easy debugging of regular expressions.  It will print
    out precisely what was matched and where.

    .. note::  This function only works with post-process patterns.
    """
    print("%s was matched..." % repr(pattern.pattern))
    for line in m_instance.dump():
        match_obj = pattern.search(line)
        if match_obj:
            print("--->%s\n" % repr(line))
            break
        else:
            if line.strip():
                print("    %s\n" % repr(line))

def retrieve_first_frame(golog_path):
    """
    Retrieves the first frame from the given *golog_path*.
    """
    found_first_frame = None
    frame = b""
    f = gzip.open(golog_path)
    while not found_first_frame:
        frame += f.read(1) # One byte at a time
        if frame.decode('UTF-8', "ignore").endswith(SEPARATOR):
            # That's it; wrap this up
            found_first_frame = True
    distance = f.tell()
    f.close()
    return (frame.decode('UTF-8', "ignore").rstrip(SEPARATOR), distance)

def retrieve_last_frame(golog_path):
    """
    Retrieves the last frame from the given *golog_path*.  It does this by
    iterating over the log in reverse.
    """
    encoded_separator = SEPARATOR.encode('UTF-8')
    golog = gzip.open(golog_path)
    chunk_size = 1024*128
    # Seek to the end of the file (gzip objects don't support negative seeking)
    distance = chunk_size
    prev_tell = None
    while golog.tell() != prev_tell:
        prev_tell = golog.tell()
        try:
            golog.seek(distance)
        except IOError:
            return # Something wrong with the file
        distance += distance
    # Now that we're at the end, go back a bit and split from there
    golog.seek(golog.tell() - chunk_size*2)
    end_frames = golog.read().split(encoded_separator)
    if len(end_frames) > 1:
        # Very last item will be empty
        return end_frames[-2].decode('UTF-8', 'ignore')
    else:
        # Just a single frame here, return it as-is
        return end_frames[0].decode('UTF-8', 'ignore')

def get_or_update_metadata(golog_path, user, force_update=False):
    """
    Retrieves or creates/updates the metadata inside of *golog_path*.

    If *force_update* is ``True`` the metadata inside the golog will be updated
    even if it already exists.

    .. note::

        All logs will need "fixing" the first time they're enumerated like this
        since they won't have an 'end_date''.  Fortunately we only need to do
        this once per golog.
    """
    logging.debug(
        'get_or_update_metadata(%s, %s, %s)' % (golog_path, user, force_update))
    if not os.path.getsize(golog_path): # 0 bytes
        return # Nothing to do
    try:
        first_frame, distance = retrieve_first_frame(golog_path)
    except IOError:
        # Something wrong with the log...  Probably still being written to
        return
    metadata = {}
    if first_frame[14:].startswith('{'):
        # This is JSON, capture existing metadata
        metadata = json_decode(first_frame[14:])
        # end_date gets added by this function
        if not force_update and 'end_date' in metadata:
            return metadata # All done
    # '\xf3\xb0\xbc\x8f' <--UTF-8 encoded SEPARATOR (for reference)
    encoded_separator = SEPARATOR.encode('UTF-8')
    golog = gzip.open(golog_path)
    # Loop over the file in big chunks (which is faster than read() by an order
    # of magnitude)
    chunk_size = 1024*128 # 128k should be enough for a 100x300 terminal full
    # of 4-byte unicode characters. That would be one BIG frame (i.e. unlikely).
    log_data = b''
    total_frames = 0
    max_data = chunk_size * 10 # Hopefully this is enough to capture a title
    while len(log_data) < max_data:
        try:
            chunk = golog.read(chunk_size)
        except (IOError, EOFError):
            return # Something wrong with the file
        total_frames += chunk.count(encoded_separator)
        log_data += chunk
        if len(chunk) < chunk_size:
            break
    # Remove the trailing incomplete frame
    log_data = encoded_separator.join(log_data.split(encoded_separator)[:-1])
    log_data = log_data.decode('UTF-8', 'ignore')
    start_date = first_frame[:13] # Getting the start date is easy
    last_frame = retrieve_last_frame(golog_path) # This takes some work
    if not last_frame:
        return # Something wrong with log
    end_date = last_frame[:13]
    version = u"1.0"
    connect_string = None
    # Try to find the host that was connected to by looking for the SSH
    # plugin's special optional escape sequence.  It looks like this:
    #   "\x1b]_;ssh|%s@%s:%s\007"
    match_obj = RE_OPT_SSH_SEQ.match(log_data[:(chunk_size*10)])
    if match_obj:
        connect_string = match_obj.group(1).split(';')[-1]
    if not connect_string:
        # Try guessing it by looking for a title escape sequence
        match_obj = RE_TITLE_SEQ.match(log_data[:(chunk_size*10)])
        if match_obj:
            # The split() here is an attempt to remove the tail end of
            # titles like this:  'someuser@somehost: ~'
            connect_string = match_obj.group(1)
    metadata.update({
        u'user': user,
        u'start_date': start_date,
        u'end_date': end_date,
        u'frames': total_frames,
        u'version': version,
        u'connect_string': connect_string,
        u'filename': os.path.split(golog_path)[1]
    })
    # Make a *new* first_frame
    first_frame = u"%s:" % start_date
    first_frame += json_encode(metadata) + SEPARATOR
    first_frame = first_frame.encode('UTF-8')
    # Replace the first frame and re-save the log
    temp_path = "%s.tmp" % golog_path
    golog = gzip.open(golog_path) # Re-open
    new_golog = gzip.open(temp_path, 'w')
    new_golog.write(first_frame)
    # Now write out the rest of it
    count = 0
    while True:
        try:
            chunk = golog.read(chunk_size)
        except IOError:
            return # Something wrong with the file
        if count == 0:
            if chunk[14:15] == b"{": # Old/incomplete metadata
                # Need to keep reading until the next frame
                while True:
                    try:
                        chunk += golog.read(chunk_size)
                    except IOError:
                        return # Something wrong with the file
                    if encoded_separator in chunk:
                        # This removes the first frame:
                        chunk = encoded_separator.join(
                            chunk.split(encoded_separator)[1:])
                        break
        new_golog.write(chunk)
        if len(chunk) < chunk_size:
            break # Everything must come to an end
        count += 1
    # Overwrite the old log
    import shutil
    shutil.move(temp_path, golog_path)
    return metadata

# Exceptions
class Timeout(Exception):
    """
    Used by :meth:`BaseMultiplex.expect` and :meth:`BaseMultiplex.await`;
    called when a timeout is reached.
    """
    pass

class ProgramTerminated(Exception):
    """
    Called when we try to write to a process that's no longer running.
    """
    pass

# Classes
class Pattern(object):
    """
    Used by :meth:`BaseMultiplex.expect`, an object to store patterns
    (regular expressions) and their associated properties.

    .. note:: The variable *m_instance* is used below to mean the current instance of BaseMultiplex (or a subclass thereof).

    :pattern: A regular expression or iterable of regular expressions that will be checked against the output stream.

    :callback: A function that will be called when the pattern is matched.  Callbacks are called like so::

        callback(m_instance, matched_string)

        .. tip:: If you provide a string instead of a function for your *callback* it will automatically be converted into a function that writes the string to the child process.  Example::

            >>> p = Pattern('(?i)password:', 'mypassword\\n')

    :optional: Indicates that this pattern is optional.  Meaning that it isn't required to match before the next pattern in :attr:`BaseMultiplex._patterns` is checked.

    :sticky: Indicates that the pattern will not time out and won't be automatically removed from self._patterns when it is matched.

    :errorback: A function to call in the event of a timeout or if an exception is encountered.  Errorback functions are called like so::

        errorback(m_instance)

    :preprocess: Indicates that this pattern is to be checked against the incoming stream before it is processed by the terminal emulator.  Useful if you need to match non-printable characters like control codes and escape sequences.

    :timeout: A :obj:`datetime.timedelta` object indicating how long we should wait before calling :meth:`errorback`.

    :created: A :obj:`datetime.datetime` object that gets set when the Pattern is instantiated by :meth:`BaseMultiplex.expect`.  It is used to determine if and when a timeout has been reached.
    """
    def __init__(self, pattern, callback,
            optional=False,
            sticky=False,
            errorback=None,
            preprocess=False,
            timeout=30):
        self.pattern = pattern
        if isinstance(callback, (str, unicode)):
            # Convert the string to a write() call
            self.callback = lambda m, match: m.write(unicode(callback))
        else:
            self.callback = callback
        self.errorback = errorback
        self.optional = optional
        self.sticky = sticky
        self.preprocess = preprocess
        self.timeout = timeout
        self.created = datetime.now()

class BaseMultiplex(object):
    """
    A base class that all Multiplex types will inherit from.

    :cmd: *string* - The command to execute when calling :meth:`spawn`.
    :terminal_emulator: *terminal.Terminal or similar* - The terminal emulator to write to when capturing the incoming output stream from *cmd*.
    :terminal_emulator_kwargs: A dictionary of keyword arguments to be passed to the *terminal_emulator* when it is instantiated.
    :log_path: *string* - The absolute path to the log file where the output from *cmd* will be saved.
    :user: *string* - If given this gets added to the log file as metadata (to differentiate who's who).
    :term_id: *string* - The terminal identifier to associated with this instance (only used in the logs to identify terminals).
    :syslog: *boolean* - Whether or not the session should be logged using the local syslog daemon.
    :syslog_facility: *integer* - The syslog facility to use when logging messages.  All possible facilities can be found in `utils.FACILITIES` (if you need a reference other than the syslog module).
    :additional_metadata: *dict* - Anything in this dict will be included in the metadata frame of the log file.  Can only be key:value strings.
    :encoding: *string* - The encoding to use when writing or reading output.
    :debug: *boolean* - Used by the `expect` methods...  If set, extra debugging information will be output whenever a regular expression is matched.

    Multiplex instances support the following callbacks which will be called
    when their respective events occur:

        * CALLBACK_UPDATE - Called when there's new output from the underlying program.
        * CALLBACK_EXIT - Called when the underlying program exits/terminates.
        * CALLBACK_LOG_FINALIZED - Called when the log has completed being processed (after the ``terminate()`` function is called).

    These callbacks can be used by attaching functions to the instance like so::

        m = MultiplexPOSIXIOLoop('top')
        m.add_callback(m.CALLBACK_EXIT, some_function, unique_id)

    In the above example `some_function()` would be called after the underlying
    program exits.  The given 'unique_id' is optional and can be used to remove
    the callback later using the `BaseMultiplex.remove_callback` method.
    """
    CALLBACK_UPDATE = 1 # Screen update
    CALLBACK_EXIT = 2   # When the underlying program exits
    CALLBACK_LOG_FINALIZED = 3 # When the log is done being processed/finalized

    def __init__(self,
            cmd,
            terminal_emulator=None, # Defaults to Gate One's terminal.Terminal
            terminal_emulator_kwargs=None,
            log_path=None,
            user=None, # Only used by log output (to differentiate who's who)
            term_id=None, # Also only for syslog output for the same reason
            syslog=False,
            syslog_facility=None,
            additional_metadata=None, # Will be stored in the log (if any)
            encoding='utf-8',
            debug=False):
        self.encoding = encoding
        self.debug = debug
        self.exitfunc = None
        self.cmd = cmd
        if terminal_emulator == None:
            # Why do this?  So you could use/write your own specialty emulator.
            # Whatever you use it just has to accept 'rows' and 'cols' as
            # keyword arguments in __init__()
            from terminal import Terminal # Dynamic import to cut down on waste
            self.terminal_emulator = Terminal
        else:
            self.terminal_emulator = terminal_emulator
        self.terminal_emulator_kwargs = terminal_emulator_kwargs
        if not terminal_emulator_kwargs:
            self.terminal_emulator_kwargs = {}
        self.log_path = log_path # Logs of the terminal output wind up here
        self.log = None # Just a placeholder until it is opened
        self.syslog = syslog # See "if self.syslog:" below
        self._alive = False
        self.ratelimiter_engaged = False
        self.capture_ratelimiter = False
        self.ctrl_c_pressed = False
        self.capturing_timeout = timedelta(seconds=2)
        self.rows = 24
        self.cols = 80
        self.pid = -1 # Means "no pid yet"
        self.started = "Never"
        self._patterns = []
        self._handling_match = False
        # Setup our callbacks
        self.callbacks = { # Defaults do nothing which saves some conditionals
            self.CALLBACK_UPDATE: {},
            self.CALLBACK_EXIT: {},
            self.CALLBACK_LOG_FINALIZED: {},
        }
        # Configure syslog logging
        self.user = user
        self.term_id = term_id
        self.syslog_buffer = ''
        self.additional_metadata = additional_metadata
        if self.syslog:
            try:
                import syslog
            except ImportError:
                logging.error(_(
                    "The syslog module is required to log terminal sessions to "
                    "syslog."))
                sys.exit(1)
            if not syslog_facility:
                syslog_facility = syslog.LOG_DAEMON
            syslog_facility = syslog_facility
            # Sets up syslog messages to show up like this:
            #   Sep 28 19:45:02 <hostname> gateone: <log message>
            syslog.openlog('gateone', 0, syslog_facility)

    def __repr__(self):
        """
        Returns self.__str__()
        """
        return "<%s>" % self.__str__()

    def __str__(self):
        """
        Returns a string representation of this Multiplex instance and the
        current state of things.
        """
        started = self.started
        if started != "Never":
            started = self.started.isoformat()
        out = (
            "%s.%s:  "
            "term_id: %s, "
            "alive: %s, "
            "command: %s, "
            "started: %s"
            % (
                self.__module__,
                self.__class__.__name__,
                self.term_id,
                self._alive,
                repr(self.cmd),
                started
            )
        )
        return out

    def set_encoding(self, encoding):
        """
        Sets the encoding for the terminal emulator to *encoding*.
        """
        self.term.encoding = encoding

    def add_callback(self, event, callback, identifier=None):
        """
        Attaches the given *callback* to the given *event*.  If given,
        *identifier* can be used to reference this callback leter (e.g. when you
        want to remove it).  Otherwise an identifier will be generated
        automatically.  If the given *identifier* is already attached to a
        callback at the given event, that callback will be replaced with
        *callback*.

        *event* - The numeric ID of the event you're attaching *callback* to (e.g. Multiplex.CALLBACK_UPDATE).
        *callback* - The function you're attaching to the *event*.
        *identifier* - A string or number to be used as a reference point should you wish to remove or update this callback later.

        Returns the identifier of the callback.  to Example:

            >>> m = Multiplex('bash')
            >>> def somefunc(): pass
            >>> id = "myref"
            >>> ref = m.add_callback(m.CALLBACK_UPDATE, somefunc, id)

        .. note:: This allows the controlling program to have multiple callbacks for the same event.
        """
        if not identifier:
            identifier = callback.__hash__()
        self.callbacks[event][identifier] = callback
        return identifier

    def remove_callback(self, event, identifier):
        """
        Removes the callback referenced by *identifier* that is attached to the
        given *event*.  Example::

            m.remove_callback(m.CALLBACK_UPDATE, "myref")

        """
        try:
            del self.callbacks[event][identifier]
        except KeyError:
            pass # Doesn't exist anymore--nothing to do

    def remove_all_callbacks(self, identifier):
        """
        Removes all callbacks associated with *identifier*.
        """
        for event, identifiers in self.callbacks.items():
            try:
                del self.callbacks[event][identifier]
            except KeyError:
                pass # Doesn't exist--nothing to worry about

    def _call_callback(self, callback):
        """
        This method is here in the event that subclasses of `BaseMultiplex` need
        to call callbacks in an implementation-specific way.  It just calls
        *callback*.
        """
        callback()

    def spawn(self, rows=24, cols=80, env=None, em_dimensions=None):
        """
        This method must be overridden by suclasses of `BaseMultiplex`.  It is
        expected to execute a child process in a way that allows non-blocking
        reads to be performed.
        """
        raise NotImplementedError(_(
            "spawn() *must* be overridden by subclasses."))

    def isalive(self):
        """
        This method must be overridden by suclasses of `BaseMultiplex`.  It is
        expected to return True if the child process is still alive and False
        otherwise.
        """
        raise NotImplementedError(_(
            "isalive() *must* be overridden by subclasses."))

    def term_write(self, stream):
        """
        Writes :obj:`stream` to `BaseMultiplex.term` and also takes care of
        logging to :attr:`log_path` (if set) and/or syslog (if
        :attr:`syslog` is `True`).  When complete, will call any
        callbacks registered in :obj:`CALLBACK_UPDATE`.

        :stream: A string or bytes containing the incoming output stream from the underlying terminal program.

        .. note:: This kind of logging doesn't capture user keystrokes.  This is intentional as we don't want passwords winding up in the logs.
        """
        #logging.debug('term_write() stream: %s' % repr(stream))
        # Write to the log (if configured)
        separator = b"\xf3\xb0\xbc\x8f"
        if self.log_path:
            # Using .encode() below ensures the result will be bytes
            now = str(int(round(time.time() * 1000))).encode('UTF-8')
            if not os.path.exists(self.log_path):
                # Write the first frame as metadata
                metadata = {
                    'version': '1.0', # Log format version
                    'rows': self.rows,
                    'columns': self.cols,
                    'term_id': self.term_id,
                    'start_date': now.decode('UTF-8') # JSON needs strings
                    # NOTE: end_date should be added later when the is read for
                    # the first time by either the logviewer or the logging
                    # plugin.
                }
                # Add any extra metadata to the first frame
                if self.additional_metadata:
                    metadata.update(self.additional_metadata)
                # The hope is that we can use the first-frame-metadata paradigm
                # to store all sorts of useful information about a log.
                # NOTE: Using .encode() below to ensure it is bytes in Python 3
                metadata_frame = json_encode(metadata).encode('UTF-8')
                # Using concatenation of bytes below to ensure compatibility
                # with both Python 2 and Python 3.
                metadata_frame = now + b":" + metadata_frame + separator
                self.log = gzip.open(self.log_path, mode='a')
                self.log.write(metadata_frame)
            if not self.log: # Only comes into play if the file already exists
                self.log = gzip.open(self.log_path, mode='a')
            # NOTE: I'm using an obscure unicode symbol in order to avoid
            # conflicts.  We need to do our best to ensure that we can
            # differentiate between terminal output and our log format...
            # This should do the trick because it is highly unlikely that
            # someone would be displaying this obscure unicode symbol on an
            # actual terminal unless they were using Gate One to view a
            # Gate One log file in vim or something =)
            # "\xf3\xb0\xbc\x8f" == \U000f0f0f == U+F0F0F (Private Use Symbol)
            output = now + b":" + stream + separator
            self.log.write(output)
        # NOTE: Gate One's log format is special in that it can be used for both
        # playing back recorded sessions *or* generating syslog-like output.
        if self.syslog:
            # Try and keep it as line-line as possible so we don't end up with
            # a log line per character.
            import syslog
            if '\n' in stream:
                for line in stream.splitlines():
                    if self.syslog_buffer:
                        line = self.syslog_buffer + line
                        self.syslog_buffer = ''
                    # Sylog really doesn't like any fancy encodings
                    line = line.encode('ascii', 'xmlcharrefreplace')
                    syslog.syslog("%s %s: %s" % (
                        self.user, self.term_id, line))
            else:
                self.syslog_buffer += stream
        # Handle preprocess patterns (for expect())
        if self._patterns:
            self.preprocess(stream)
        self.term.write(stream)
        # Handle post-process patterns (for expect())
        if self._patterns:
            self.postprocess()
        if self.CALLBACK_UPDATE in self.callbacks:
            for callback in self.callbacks[self.CALLBACK_UPDATE].values():
                self._call_callback(callback, stream=stream)

    def preprocess(self, stream):
        """
        Handles preprocess patterns registered by :meth:`expect`.  That
        is, those patterns which have been marked with `preprocess = True`.
        Patterns marked in this way get handled *before* the terminal emulator
        processes the :obj:`stream`.

        :stream: A string or bytes containing the incoming output stream from the underlying terminal program.
        """
        preprocess_patterns = (a for a in self._patterns if a.preprocess)
        finished_non_sticky = False
        # If there aren't any preprocess patterns this won't do anything:
        for pattern_obj in preprocess_patterns:
            if finished_non_sticky and not pattern_obj.sticky:
                # We only want sticky patterns if we've already matched once
                continue
            if isinstance(pattern_obj.pattern, (list, tuple)):
                for pat in pattern_obj.pattern:
                    match = pat.search(stream)
                    if match:
                        callback = partial(
                            pattern_obj.callback, self, match.group())
                        self._call_callback(callback)
                        if not pattern_obj.sticky:
                            self.unexpect(hash(pattern_obj)) # Remove it
                            break
            else:
                match = pattern_obj.pattern.search(stream)
                if match:
                    callback = partial(
                        pattern_obj.callback, self, match.group())
                    self._call_callback(callback)
                    if not pattern_obj.sticky:
                        self.unexpect(hash(pattern_obj)) # Remove it
            if not pattern_obj.optional:
                # We only match the first non-optional pattern
                finished_non_sticky = True

    def postprocess(self):
        """
        Handles post-process patterns registered by :meth:`expect`.
        """
        # Check the terminal emulator screen for any matching patterns.
        post_patterns = (a for a in self._patterns if not a.preprocess)
        finished_non_sticky = False
        for pattern_obj in post_patterns:
            # For post-processing matches we search the terminal emulator's
            # screen as a single string.  This allows for full-screen screen
            # scraping in addition to typical 'expect-like' functionality.
            # The big difference being that with traditional expect (and
            # pexpect) you don't get to examine the program's output as it
            # would be rendered in an actual terminal.
            # By using post-processing of the text after it has been handled
            # by a terminal emulator we don't have to worry about hidden
            # characters and escape sequences that we may not be aware of or
            # could make our regular expressions much more complicated than
            # they should be.
            if finished_non_sticky and not pattern_obj.sticky:
                continue # We only want sticky patterns at this point
            # For convenience, trailing whitespace is removed from the lines
            # output from the terminal emulator.  This is so we don't have to
            # put '\w*' before every '$' to match the end of a line.
            term_lines = "\n".join(
                [a.rstrip() for a in self.term.dump()]).rstrip()
            if isinstance(pattern_obj.pattern, (list, tuple)):
                for pat in pattern_obj.pattern:
                    match = pat.search(term_lines)
                    if match:
                        self._handle_match(pattern_obj, match)
                        break
            else:
                match = pattern_obj.pattern.search(term_lines)
                if match:
                    self._handle_match(pattern_obj, match)
            if not pattern_obj.optional and not pattern_obj.sticky:
                # We only match the first non-optional pattern
                finished_non_sticky = True

    def _handle_match(self, pattern_obj, match):
        """
        Handles a matched regex detected by :meth:`postprocess`.  It calls
        :obj:`Pattern.callback` and takes care of removing it from
        :attr:`_patterns` (if it isn't sticky).
        """
        if self._handling_match:
            # Don't process anything if we're in the middle of handling a match.
            # NOTE: This can happen when there's more than one thread,
            # processes, or PeriodicCallback going on simultaneously.  It seems
            # to work better than threading.Lock()
            return
        self._handling_match = True
        callback = partial(pattern_obj.callback, self, match.group())
        self._call_callback(callback)
        if self.debug:
            # Turn on the fancy regex debugger/pretty printer
            debug_callback = partial(
                debug_expect, self, match.group(), pattern_obj.pattern)
            self._call_callback(debug_callback)
        if not pattern_obj.sticky:
            self.unexpect(hash(pattern_obj)) # Remove it
        self._handling_match = False

    def writeline(self, line=''):
        """
        Just like :meth:`write` but it writes a newline after writing *line*.

        If no *line* is given a newline will be written.
        """
        self.write(line + u'\r\n')

    def writelines(self, lines):
        """
        Writes *lines* (a list of strings) to the underlying program, appending
        a newline after each line.
        """
        if getattr(lines, '__iter__', False):
            for line in lines:
                self.write(line + u'\r\n')
        else:
            raise TypeError(_(
                "%s is not iterable (strings don't count :)" % type(lines)))

    def dump_html(self, full=False, client_id='0'):
        """
        Returns the difference of terminal lines (a list of lines, to be
        specific) and its scrollback buffer (which is also a list of lines) as a
        tuple::

            (scrollback, screen)

        If a line hasn't changed since the last dump said line will be replaced
        with an empty string in the output.

        If *full*, will return the entire screen (not just the diff).

        if *client_id* is given (string), this will be used as a unique client
        identifier for keeping track of screen differences (so you can have
        multiple clients getting their own unique diff output for the same
        Multiplex instance).
        """
        modified = True
        if client_id not in self.prev_output:
            self.prev_output[client_id] = [None for a in xrange(self.rows-1)]
        try:
            scrollback, html = ([], [])
            if self.term:
                try:
                    modified = self.term.modified
                    result = self.term.dump_html()
                    if result:
                        scrollback, html = result
                        if scrollback:
                            self.shared_scrollback = scrollback
                        # Make a copy so we can save it to prev_output later
                        preserved_html = html[:]
                except IOError as e:
                    logging.debug(_("IOError attempting self.term.dump_html()"))
                    logging.debug("%s" % e)
            if html:
                if not full:
                    count = 0
                    for line1, line2 in izip(self.prev_output[client_id], html):
                        if line1 != line2:
                            html[count] = line2 # I love updates-in-place
                        else:
                            html[count] = ''
                        count += 1
                    # Otherwise a full dump will take place
                self.prev_output.update({client_id: preserved_html})
            if not modified:
                return (self.shared_scrollback, html)
            return (scrollback, html)
        except ValueError as e:
            # This would be special...
            logging.error(_("ValueError in dump_html(): %s" % e))
            return ([], [])
        except (IOError, TypeError) as e:
            logging.error(_("Unhandled exception in dump_html(): %s" % e))
            if self.ratelimiter_engaged:
                # Caused by the program being out of control
                return([], [
                    _("<b>Program output too noisy.  Sending Ctrl-c...</b>")])
            else:
                import traceback
                traceback.print_exc(file=sys.stdout)
            return ([], [])

    def dump(self):
        """
        Dumps whatever is currently on the screen of the terminal emulator as
        a list of plain strings (so they'll be escaped and look nice in an
        interactive Python interpreter).
        """
        return self.term.dump()

    def timeout_check(self, timeout_now=False):
        """
        Iterates over :attr:`BaseMultiplex._patterns` checking each to
        determine if it has timed out.  If a timeout has occurred for a
        `Pattern` and said Pattern has an *errorback* function that function
        will be called.

        Returns True if there are still non-sticky patterns remaining.  False
        otherwise.

        If *timeout_now* is True, will force the first errorback to be called
        and will empty out self._patterns.
        """
        remaining_patterns = False
        for pattern_obj in self._patterns:
            if timeout_now:
                if pattern_obj.errorback:
                    errorback = partial(pattern_obj.errorback, self)
                    self._call_callback(errorback)
                    self.unexpect()
                    return False
            if not pattern_obj.timeout:
                # Timeouts of 0 or None mean "wait forever"
                remaining_patterns = True
                continue
            elapsed = datetime.now() - pattern_obj.created
            if elapsed > pattern_obj.timeout:
                if not pattern_obj.sticky:
                    self.unexpect(hash(pattern_obj))
                if pattern_obj.errorback:
                    errorback = partial(pattern_obj.errorback, self)
                    self._call_callback(errorback)
            elif not pattern_obj.sticky:
                remaining_patterns = True
        return remaining_patterns

    def expect(self, patterns, callback,
            optional=False,
            sticky=False,
            errorback=None,
            timeout=15,
            position=None,
            preprocess=True):
        """
        Watches the stream of output coming from the underlying terminal program
        for *patterns* and if there's a match *callback* will be called like so::

            callback(multiplex_instance, matched_string)

        .. tip:: You can provide a string instead of a *callback* function as a shortcut if you just want said string written to the child process.

        *patterns* can be a string, an :class:`re.RegexObject` (as created by
        :func:`re.compile`), or a iterator of either/or.  Returns a reference
        object that can be used to remove the registered pattern/callback at any
        time using the :meth:`unexpect` method (see below).

        .. note::  This function is non-blocking!

        .. warning::  The *timeout* value gets compared against the time :meth:`expect` was called to create it.  So don't wait too long if you're planning on using :meth:`await`!

        Here's a simple example that changes a user's password::

            >>> def write_password(m_instance, matched):
            ...     print("Sending Password... %s patterns remaining." % len(m_instance._patterns))
            ...     m_instance.writeline('somepassword')
            >>> m = Multiplex('passwd someuser') # Assumes running as root :)
            >>> m.expect('(?i)password:', write_password) # Step 1
            >>> m.expect('(?i)password:', write_password) # Step 2
            >>> print(len(m._patterns)) # To show that there's two in the queue
                2
            >>> m.spawn() # Execute the command
            >>> m.await(10) # This will block for up to 10 seconds waiting for self._patterns to be empty (not counting optional patterns)
            Sending Password... 1 patterns remaining.
            Sending Password... 0 patterns remaining.
            >>> m.isalive()
            False
            >>> # All done!

        .. tip:: The :meth:`await` method will automatically call :meth:`spawn` if not :meth:`isalive`.

        This would result in the password of 'someuser' being changed to 'somepassword'.  How is the order determined?  Every time :meth:`expect` is called it creates a new :class:`Pattern` using the given parameters and appends it to `self._patterns` (which is a list).  As each :class:`Pattern` is matched its *callback* gets called and the :class:`Pattern` is removed from `self._patterns` (unless *sticky* is `True`).  So even though the patterns and callbacks listed above were identical they will get executed and removed in the order they were created as each respective :class:`Pattern` is matched.

        .. note:: Only the first pattern, or patterns marked as *sticky* are checked against the incoming stream.  If the first non-sticky pattern is marked *optional* then the proceeding pattern will be checked (and so on).  All other patterns will sit in `self._patterns` until their predecessors are matched/removed.

        Patterns can be removed from `self._patterns` as needed by calling `unexpect(<reference>)`.  Here's an example::

            >>> def handle_accepting_ssh_key(m_instance, matched):
            ...     m_instance.writeline(u'yes')
            >>> m = Multiplex('ssh someuser@somehost')
            >>> ref1 = m.expect('(?i)Are you sure.*\(yes/no\)\?', handle_accepting_ssh_key, optional=True)
            >>> def send_password(m_instance, matched):
            ...    m_instance.unexpect(ref1)
            ...    m_instance.writeline('somepassword')
            >>> ref2 = m.expect('(?i)password:', send_password)
            >>> # spawn() and/or await() and do stuff...

        The example above would send 'yes' if asked by the SSH program to accept
        the host's public key (which would result in it being automatically
        removed from `self._patterns`).  However, if this condition isn't met
        before send_password() is called, send_password() will use the reference
        object to remove it directly.  This ensures that the pattern won't be
        accidentally matched later on in the program's execution.

        .. note:: Even if we didn't match the "Are you sure..." pattern it would still get auto-removed after its timeout was reached.

        **About pattern ordering:** The position at which the given pattern will
        be inserted in `self._patterns` can be specified via the
        *position* argument.  The default is to simply append which should be
        appropriate in most cases.

        **About Timeouts:** The *timeout* value passed to expect() will be used
        to determine how long to wait before the pattern is removed from
        self._patterns.  When this occurs, *errorback* will be called with
        current Multiplex instance as the only argument.  If *errorback* is None
        (the default) the pattern will simply be discarded with no action taken.

        .. note:: If *sticky* is True the *timeout* value will be ignored.

        **Notes about the length of what will be matched:**  The entire terminal
        'screen' will be searched every time new output is read from the
        incoming stream.  This means that the number of rows and columns of the
        terminal determines the size of the search.  So if your pattern needs to
        look for something inside of 50 lines of text you need to make sure that
        when you call `spawn` you specify at least `rows = 50`.  Example::

            >>> def handle_long_search(m_instance, matched):
            ...     do_stuff(matched)
            >>> m = Multiplex('someCommandWithLotsOfOutput.sh')
            >>> # 'begin', at least one non-newline char, 50 newlines, at least one char, then 'end':
            >>> my_regex = re.compile('begin.+[\\n]{50}.+end', re.MULTILINE)
            >>> ref = m.expect(my_regex, handle_accepting_ssh_key)
            >>> m.spawn(rows=51, cols=150)
            >>> # Call m.read(), m.spawn() or just let an event loop (e.g. Tornado's IOLoop) take care of things...

        **About non-printable characters:** If the *postprocess* argument is
        True (the default), patterns will be checked against the current screen as
        output by the terminal emulator.  This means that things like control
        codes and escape sequences will be handled and discarded by the terminal
        emulator and as such won't be available for patterns to be checked
        against.  To get around this limitation you can set *preprocess* to True
        and the pattern will be checked against the incoming stream before it is
        processed by the terminal emulator.  Example::

            >>> def handle_xterm_title(m_instance, matched):
            ...     print("Caught title: %s" % matched)
            >>> m = Multiplex('echo -e "\\033]0;Some Title\\007"')
            >>> title_seq_regex = re.compile(r'\\x1b\\][0-2]\;(.*?)(\\x07|\\x1b\\\\)')
            >>> m.expect(title_seq_regex, handle_xterm_title, preprocess=True) # <-- 'preprocess=True'
            >>> m.await()
            Caught title: Some Title
            >>>

        **Notes about debugging:** Instead of using `await` to wait for all of your patterns to be matched at once you can make individual calls to `read` to determine if your patterns are being matched in the way that you want.  For example::

            >>> def do_stuff(m_instance, matched):
            ...     print("Debug: do_stuff() got %s" % repr(matched))
            ...     # Do stuff here
            >>> m = Multiplex('someLongComplicatedOutput.sh')
            >>> m.expect('some pattern', do_stuff)
            >>> m.expect('some other pattern', do_stuff)
            >>> m.spawn()
            >>> # Instead of calling await() just call one read() at a time...
            >>> print(repr(m.read()))
            ''
            >>> print(repr(m.read())) # Oops, called read() too soon.  Try again:
            'some other pattern'
            >>> # Doh!  Looks like 'some other pattern' comes first.  Let's start over...
            >>> m.unexpect() # Called with no arguments, it empties m._patterns
            >>> m.terminate() # Tip: This will call unexpect() too so the line above really isn't necessary
            >>> m.expect('some other pattern', do_stuff) # This time this one will be first
            >>> m.expect('some pattern', do_stuff)
            >>> m.spawn()
            >>> print(repr(m.read())) # This time I waited a moment :)
            'Debug: do_stuff() got "some other pattern"'
            'some other pattern'
            >>> # Huzzah!  Now let's see if 'some pattern' matches...
            >>> print(repr(m.read()))
            'Debug: do_stuff() got "some pattern"'
            'some pattern'
            >>> # As you can see, calling read() at-will in an interactive interpreter can be very handy.

        **About asynchronous use:**  This mechanism is non-blocking (with the exception of `await`) and is meant to be used asynchronously.  This means that if the running program has no output, `read` won't result in any patterns being matched.  So you must be careful about timing *or* you need to ensure that `read` gets called either automatically when there's data to be read (IOLoop, EPoll, select, etc) or at regular intervals via a loop.  Also, if you're not calling `read` at an interval (i.e. you're using a mechanism to detect when there's output to be read before calling it e.g. IOLoop) you need to ensure that `timeout_check` is called regularly anyway or timeouts won't get detected if there's no output from the underlying program.  See the `MultiplexPOSIXIOLoop.read` override for an example of what this means and how to do it.
        """
        # Create the Pattern object before we do anything else
        if isinstance(patterns, (str, unicode)):
            # Convert to a compiled regex (assume MULTILINE and DOTALL for the
            # sanity of the ignorant)
            patterns = re.compile(patterns, re.MULTILINE|re.DOTALL)
        if isinstance(patterns, (tuple, list)):
            # Ensure that all patterns are RegexObjects
            pattern_list = []
            for pattern in patterns:
                if isinstance(pattern, str):
                    pattern = re.compile(pattern)
                    pattern_list.append(pattern)
                else:
                    pattern_list.append(pattern)
            patterns = tuple(pattern_list) # No reason to keep it as a list
        # Convert timeout to a timedelta if necessary
        if timeout: # 0 or None mean "wait forever"
            if isinstance(timeout, (str, int, float)):
                timeout = timedelta(seconds=float(timeout))
            elif not isinstance(timeout, timedelta):
                raise TypeError(_(
                    "The timeout value must be a string, integer, float, or a "
                    "timedelta object"))
        pattern_obj = Pattern(patterns, callback,
            optional=optional,
            sticky=sticky,
            errorback=errorback,
            preprocess=preprocess,
            timeout=timeout)
        if isinstance(position, int):
            self._patterns.insert(position, pattern_obj)
        else:
            self._patterns.append(pattern_obj)
        return hash(pattern_obj)

    def unexpect(self, ref=None):
        """
        Removes *ref* from self._patterns so it will no longer be checked
        against the incoming stream.  If *ref* is None (the default),
        `self._patterns` will be emptied.
        """
        if not ref:
            self._patterns = [] # Reset
            return
        for i, item in enumerate(self._patterns):
            if hash(item) == ref:
                self._patterns.pop(i)

    def await(self, timeout=15, **kwargs):
        """
        Blocks until all non-optional patterns inside self._patterns have been
        removed *or* if the given *timeout* is reached.  *timeout* may be an
        integer (in seconds) or a `datetime.timedelta` object.

        Returns True if all non-optional, non-sticky patterns were handled
        successfully.

        .. warning:: The timeouts attached to Patterns are set when they are created.  Not when when you call :meth:`await`!

        As a convenience, if :meth:`isalive` resolves to False,
        :meth:`spawn` will be called automatically with *\*\*kwargs*

        await
            To wait with expectation.
        """
        if not self.isalive():
            self.spawn(**kwargs)
        start = datetime.now()
        # Convert timeout to a timedelta if necessary
        if isinstance(timeout, (str, int, float)):
            timeout = timedelta(seconds=float(timeout))
        elif not isinstance(timeout, timedelta):
            raise TypeError(_(
                "The timeout value must be a string, integer, float, or a "
                "timedelta object"))
        remaining_patterns = True
        # This starts up the scheduler that constantly checks patterns
        output = self.read() # Remember:  read() is non-blocking
        if output and self.debug and EXTRA_DEBUG:
            print("await: %s" % repr(output))
        while remaining_patterns:
            # First we need to discount optional patterns
            remaining_patterns = False
            if not self._patterns:
                break
            for pattern in self._patterns:
                if not pattern.optional and not pattern.sticky:
                    remaining_patterns = True
                    break
            # Now check if we've timed out
            if (datetime.now() - start) > timeout:
                for pattern in self._patterns:
                    if not pattern.sticky and not pattern.optional:
                        print(
                          "We were waiting on this pattern before timeout: %s" %
                          repr(pattern.pattern.pattern))
                raise Timeout("Lingered longer than %s" % timeout.seconds)
            # Lastly we perform a read() to ensure the output is processed
            output = self.read() # Remember:  read() is non-blocking
            if output and self.debug and EXTRA_DEBUG:
                print("await: %s" % repr(output))
            time.sleep(0.01) # So we don't eat up all the CPU
        return True

    def terminate(self):
        """
        This method must be overridden by suclasses of `BaseMultiplex`.  It is
        expected to terminate/kill the child process.
        """
        raise NotImplementedError(_(
            "terminate() *must* be overridden by subclasses."))

    def _read(self, bytes=-1):
        """
        This method must be overridden by subclasses of `BaseMultiplex`.  It is
        expected that this method read the output from the running terminal
        program in a non-blocking way, pass the result into `term_write`, and
        then return the result.
        """
        raise NotImplementedError(_(
            "_read() *must* be overridden by subclasses."))

    def read(self, bytes=-1):
        """
        Calls `_read` and checks if any timeouts have been reached in
        `self._patterns`.  Returns the result of `_read`.
        """
        result = self._read(bytes)
        # Perform checks for timeouts in self._patterns (used by self.expect())
        self.timeout_check()
        return result

    def write(self):
        raise NotImplementedError(_(
            "write() *must* be overridden by subclasses."))

class MultiplexPOSIXIOLoop(BaseMultiplex):
    """
    The MultiplexPOSIXIOLoop class takes care of executing a child process on
    POSIX (aka Unix) systems and keeping track of its state via a terminal
    emulator (`terminal.Terminal` by default).  If there's a started instance
    of :class:`tornado.ioloop.IOLoop`, handlers will be added to it that
    automatically keep the terminal emulator synchronized with the output of the
    child process.

    If there's no IOLoop (or it just isn't started), terminal applications can
    be interacted with by calling `MultiplexPOSIXIOLoop.read` (to write any
    pending output to the terminal emulator) and `MultiplexPOSIXIOLoop.write`
    (which writes directly to stdin of the child).

    .. note:: `MultiplexPOSIXIOLoop.read` is non-blocking.
    """
    def __init__(self, *args, **kwargs):
        super(MultiplexPOSIXIOLoop, self).__init__(*args, **kwargs)
        from tornado import ioloop
        self.terminating = False
        self.sent_sigint = False
        self.shell_command = ['/bin/sh', '-c']
        self.use_shell = True # Controls whether or not we wrap with the above
        self.env = {}
        self.io_loop = ioloop.IOLoop.current() # Monitors child for activity
        #self.io_loop.set_blocking_signal_threshold(2, self._blocked_io_handler)
        #signal.signal(signal.SIGALRM, self._blocked_io_handler)
        self.reenable_timeout = None
        interval = 100 # A 0.1 second interval should be fast enough
        self.scheduler = ioloop.PeriodicCallback(self._timeout_checker,interval)
        self.exitstatus = None
        self._checking_patterns = False
        self.read_timeout = datetime.now()
        self.capture_limit = -1 # Huge reads by default
        self.restore_rate = None

    def __del__(self):
        """
        Makes sure that the underlying terminal program is terminated so we
        don't leave things hanging around.
        """
        logging.debug("MultiplexPOSIXIOLoop.__del__()")
        self.terminate()

    def _call_callback(self, callback, *args, **kwargs):
        """
        If the IOLoop is started, adds the callback via
        :meth:`IOLoop.add_callback` to ensure it gets called at the next IOLoop
        iteration (which is thread safe).  If the IOLoop isn't started
        *callback* will get called immediately and directly.
        """
        if self.io_loop._running:
            self.io_loop.add_callback(callback, *args, **kwargs)
        else:
            callback(*args, **kwargs)

    def _reenable_output(self):
        """
        Restarts capturing output from the underlying terminal program by
        disengaging the rate limiter.
        """
        logging.debug("Disabling rate limiter")
        self.ratelimiter_engaged = False
        try:
            self.io_loop.add_handler(
                self.fd, self._ioloop_read_handler, self.io_loop.READ)
        except IOError:
            # Already been re-added...  Probably by write().  Ignore.
            pass

    def __reset_sent_sigint(self):
        self.sent_sigint = False

    def _blocked_io_handler(self, signum=None, frame=None, wait=None):
        """
        Handles the situation where a terminal is blocking IO (usually because
        of too much output).  This method would typically get called inside of
        `MultiplexPOSIXIOLoop._read` when the output of an fd is too noisy.

        If *wait* is given, will wait that many milliseconds long before
        disengaging the rate limiter.
        """
        if not self.isalive():
            # This can happen if terminate() gets called too fast from another
            # thread...  Strange stuff, mixing threading, signals, and
            # multiprocessing!
            return # Nothing to do
        logging.warning(_(
            "Noisy process (%s) kicked off rate limiter." % self.pid))
        if not wait:
            wait = 5000
        self.ratelimiter_engaged = True
        # CALLBACK_UPDATE is called here so the client can be made aware of the
        # fact that the rate limiter was engaged.
        for callback in self.callbacks[self.CALLBACK_UPDATE].values():
            self._call_callback(callback)
        self.io_loop.remove_handler(self.fd)
        self.reenable_timeout = self.io_loop.add_timeout(
            timedelta(milliseconds=wait), self._reenable_output)

    def spawn(self,
            rows=24, cols=80, env=None, em_dimensions=None, exitfunc=None):
        """
        Creates a new virtual terminal (tty) and executes self.cmd within it.
        Also attaches :meth:`self._ioloop_read_handler` to the IOLoop so that
        the terminal emulator will automatically stay in sync with the output of
        the child process.

        :cols: The number of columns to emulate on the virtual terminal (width)
        :rows: The number of rows to emulate (height).
        :env: Optional - A dictionary of environment variables to set when executing self.cmd.
        :em_dimensions: Optional - The dimensions of a single character within the terminal (only used when calculating the number of rows/cols images take up).
        :exitfunc: Optional - A function that will be called with the current Multiplex instance and its exit status when the child process terminates (*exitfunc(m_instance, statuscode)*).
        """
        self.started = datetime.now()
        #signal.signal(signal.SIGCHLD, signal.SIG_IGN) # No zombies allowed
        logging.debug(
            "spawn(rows=%s, cols=%s, env=%s, em_dimensions=%s)" % (
                rows, cols, repr(env), repr(em_dimensions)))
        rows = min(200, rows) # Max 200 to limit memory utilization
        cols = min(500, cols) # Max 500 for the same reason
        self.rows = rows
        self.cols = cols
        self.em_dimensions = em_dimensions
        import pty
        pid, fd = pty.fork()
        if pid == 0: # We're inside the child process
    # Close all file descriptors other than stdin, stdout, and stderr (0, 1, 2)
            try:
                # This ensures that the child doesn't get the parent's FDs
                os.closerange(3, 256)
            except OSError:
                pass
            if not env:
                env = {}
            env["COLUMNS"] = str(cols)
            env["LINES"] = str(rows)
            env["TERM"] = env.get("TERM", "xterm-256color")
            env["PATH"] = os.environ['PATH']
            env["LANG"] = os.environ.get('LANG', 'en_US.UTF-8')
            env["PYTHONIOENCODING"] = "utf_8"
            # Setup stdout to be more Gate One friendly
            import termios
            # Fix missing termios.IUTF8
            if 'IUTF8' not in termios.__dict__:
                termios.IUTF8 = 16384 # Hopefully not platform independent
            stdin = 0
            stdout = 1
            stderr = 2
            attrs = termios.tcgetattr(stdout)
            iflag, oflag, cflag, lflag, ispeed, ospeed, cc = attrs
            # Enable flow control and UTF-8 input (probably not needed)
            iflag |= (termios.IXON | termios.IXOFF | termios.IUTF8)
            # OPOST: Enable post-processing of chars (not sure if this matters)
            # INLCR: We're disabling this so we don't get \r\r\n anywhere
            oflag |= (termios.OPOST | termios.ONLCR | termios.INLCR)
            attrs = [iflag, oflag, cflag, lflag, ispeed, ospeed, cc]
            termios.tcsetattr(stdout, termios.TCSANOW, attrs)
            # Now do the same for stdin
            attrs = termios.tcgetattr(stdin)
            iflag, oflag, cflag, lflag, ispeed, ospeed, cc = attrs
            iflag |= (termios.IXON | termios.IXOFF | termios.IUTF8)
            oflag |= (termios.OPOST | termios.ONLCR | termios.INLCR)
            attrs = [iflag, oflag, cflag, lflag, ispeed, ospeed, cc]
            termios.tcsetattr(stdin, termios.TCSANOW, attrs)
            # The sleep statements below do two things:
            #   1) Ensures all the callbacks have time to be attached before
            #      the command is executed (so we can handle things like
            #      setting the title when the command first runs).
            #   2) Ensures we capture all output from the fd before it gets
            #      closed.
            import shlex
            cmd = shlex.split(self.cmd)
            if self.use_shell:
                if not isinstance(self.shell_command, list):
                    self.shell_command = shlex.split(self.shell_command)
                cmd = self.shell_command + [self.cmd + '; sleep .1']
            # This loop prevents UnicodeEncodeError exceptions:
            for k, v in env.items():
                if isinstance(v, unicode):
                    env[k] = v.encode('utf-8')
            os.dup2(stderr, stdout) # Copy stderr to stdout (equivalent to 2>&1)
            os.execvpe(cmd[0], cmd, env)
            os._exit(0)
        else: # We're inside this Python script
            logging.debug("spawn() pid: %s" % pid)
            self._alive = True
            self.fd = fd
            self.env = env
            self.exitfunc = exitfunc
            self.pid = pid
            self.time = time.time()
            try:
                self.term = self.terminal_emulator(
                    rows=rows,
                    cols=cols,
                    em_dimensions=em_dimensions,
                    encoding=self.encoding,
                    **self.terminal_emulator_kwargs
                )
            except TypeError:
                # Terminal emulator doesn't support em_dimensions.  That's OK
                self.term = self.terminal_emulator(
                    rows=rows,
                    cols=cols,
                    encoding=self.encoding,
                    **self.terminal_emulator_kwargs
                )
            # Tell our IOLoop instance to start watching the child
            self.io_loop.add_handler(
                fd, self._ioloop_read_handler, self.io_loop.READ)
            self.prev_output = {}
            self.shared_scrollback = []
            # Set non-blocking so we don't wait forever for a read()
            import fcntl
            fl = fcntl.fcntl(sys.stdin, fcntl.F_GETFL)
            fcntl.fcntl(self.fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
            # Set the size of the terminal
            resize = partial(self.resize, rows, cols, ctrl_l=False)
            self.io_loop.add_timeout(timedelta(milliseconds=100), resize)
            return fd

    def isalive(self):
        """
        Checks the underlying process to see if it is alive and sets self._alive
        appropriately.
        """
        if self._alive: # Re-check it
            try:
                os.kill(self.pid, 0) # kill -0 tells us it's still alive
                return self._alive
            except OSError:
                # Process is dead
                self._alive = False
                logging.debug(_(
                    "Child exited with status: %s" % self.exitstatus))
                self.terminate()
                return False
        else:
            return False

    def resize(self, rows, cols, em_dimensions=None, ctrl_l=True):
        """
        Resizes the child process's terminal window to *rows* and *cols* by
        first sending it a TIOCSWINSZ event and then sending ctrl-l.

        If *em_dimensions* are provided they will be updated along with the
        rows and cols.

        The sending of ctrl-l can be disabled by setting *ctrl_l* to False.
        """
        logging.debug(
            "Resizing term %s to rows: %s, cols: %s, em_dimensions=%s"
            % (self.term_id, rows, cols, em_dimensions))
        if rows < 2:
            rows = 24
        if cols < 2:
            cols = 80
        self.rows = rows
        self.cols = cols
        self.term.resize(rows, cols, em_dimensions)
        # Sometimes the resize doesn't actually apply (for whatever reason)
        # so to get around this we have to send a different value than the
        # actual value we want then send our actual value.  It's a bug outside
        # of Gate One that I have no idea how to isolate but this has proven to
        # be an effective workaround.
        import fcntl, termios
        s = struct.pack("HHHH", rows, cols, 0, 0)
        try:
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, s)
        except IOError:
            # Process already ended--no big deal
            return
        try:
            os.kill(self.pid, signal.SIGWINCH) # Send the resize signal
        except OSError:
            return # Process is dead.  Can happen when things go quickly
        if ctrl_l:
            self.write(u'\x0c') # ctrl-l

    def terminate(self):
        """
        Kill the child process associated with `self.fd`.

        .. note:: If dtach is being used this only kills the dtach process.
        """
        if not self.terminating:
            self.terminating = True
        else:
            return # Something else already called it
        logging.debug("terminate() self.pid: %s" % self.pid)
        if self.reenable_timeout:
            self.io_loop.remove_timeout(self.reenable_timeout)
        # Unset our blocked IO handler so there's no references to self hanging
        # around preventing us from freeing up memory
        try:
            self.io_loop.set_blocking_signal_threshold(None, None)
        except ValueError:
            pass # Can happen if this instance winds up in a thread
        for callback in self.callbacks[self.CALLBACK_EXIT].values():
            self._call_callback(callback)
        # This try/except block *must* come before the exitfunc logic.
        # Otherwise, if the registered exitfunc raises an exception the IOLoop
        # will never stop watching self.fd; resulting in an infinite loop of
        # exitfunc.
        try:
            self.io_loop.remove_handler(self.fd)
            os.close(self.fd)
        except (KeyError, IOError, OSError):
            # This can happen when the fd is removed by the underlying process
            # before the next cycle of the IOLoop.  Not really a problem.
            pass
        self.scheduler.stop()
        # NOTE: Without this 'del' we end up with a memory leak every time
        # a new instance of Multiplex is created.  Apparently the references
        # inside of PeriodicCallback pointing to self prevents proper garbage
        # collection.
        del self.scheduler
        try:
            os.kill(self.pid, signal.SIGTERM)
            def recheck_kill():
                if self.isalive():
                    os.kill(self.pid, signal.SIGKILL)
            # NOTE: This will delay calling of this Multiplex instance's
            #       __del__() method by the same number of seconds...
            self.io_loop.add_timeout(timedelta(seconds=3), recheck_kill)
        except OSError:
            # The process is already dead--great.
            pass
        if self.exitstatus == None:
            try:
                pid, status = os.waitpid(self.pid, 0)
                if pid: # pid is 0 if the process is still running
                    self.exitstatus = os.WEXITSTATUS(status)
            except OSError:
                # This can happen if the program closes itself very quickly
                # immediately after being executed.
                try: # Try again with -1
                    pid, status = os.waitpid(-1, os.WNOHANG)
                    if pid: # pid is 0 if the process is still running
                        self.exitstatus = os.WEXITSTATUS(status)
                except OSError:
                    logging.debug(_(
                        "Could not determine exit status for child with "
                        "PID: %s\n" % self.pid
                    ))
                    logging.debug(_("Setting self.exitstatus to 999"))
                    self.exitstatus = 999 # Seems like a good number
        if self._patterns:
            self.timeout_check(timeout_now=True)
            self.unexpect()
        # Call the exitfunc (if set)
        if self.exitfunc:
            self.exitfunc(self, self.exitstatus)
            self.exitfunc = None
        # Need to preserve finalize callbacks just until this func completes:
        finalize_callbacks = self.callbacks[self.CALLBACK_LOG_FINALIZED]
        # Reset all callbacks so there's nothing to prevent GC
        self.callbacks = {
            self.CALLBACK_UPDATE: {},
            self.CALLBACK_EXIT: {},
            self.CALLBACK_LOG_FINALIZED: {},
        }
        # Commented this out so that you can see what was in the terminal
        # emulator after the process terminates.
        #del self.term
        # Kick off a process that finalizes the log (updates metadata and
        # recompresses everything to save disk space)
        if not self.log_path:
            return # No log to finalize so we're done.
        if not self.log:
            return # No log to finalize so we're done.
        self.log.close() # Write it out
        logging.info(_("Finalizing {path} (pid: {pid})").format(
            path=self.log_path, pid=self.pid))
        with ProcessPoolExecutor(max_workers=1) as pool:
            f = pool.submit(get_or_update_metadata, self.log_path, self.user)
            for callback in finalize_callbacks.values():
                f.add_done_callback(callback)

    def _ioloop_read_handler(self, fd, event):
        """
        Read in the output of the process associated with *fd* and write it to
        `self.term`.

        :fd: The file descriptor of the child process.
        :event: An IOLoop event (e.g. IOLoop.READ).

        .. note:: This method is not meant to be called directly...  The IOLoop should be the one calling it when it detects any given event on the fd.
        """
        if event == self.io_loop.READ:
            self._call_callback(self.read)
        else: # Child died
            logging.debug(_(
                "Apparently fd %s just died (event: %s)" % (self.fd, event)))
            #if self.debug:
                #print(repr("".join([a for a in self.term.dump() if a.strip()])))
            self.terminate()

    def _read(self, bytes=-1):
        """
        Reads at most *bytes* from the incoming stream, writes the result to
        the terminal emulator using `term_write`, and returns what was read.
        If *bytes* is -1 (default) it will read `self.fd` until there's no more
        output.

        Returns the result of all that reading.

        .. note:: Non-blocking.
        """
        # Commented out because it can be really noisy.  Uncomment only if you
        # *really* need to debug this method.
        #logging.debug("MultiplexPOSIXIOLoop._read()")
        result = b""
        def restore_capture_limit():
            self.capture_limit = -1
            self.restore_rate = None
        try:
            with io.open(self.fd, 'rb', closefd=False, buffering=0) as reader:
                if bytes == -1:
                    # 2 seconds of blocking is too much.
                    timeout = timedelta(seconds=2)
                    loop_start = datetime.now()
                    if self.ctrl_c_pressed:
                        # If the user pressed Ctrl-C and the ratelimiter was
                        # engaged then we'd best discard the (possibly huge)
                        # buffer so we don't waste CPU cyles processing it.
                        reader.read(-1)
                        self.ctrl_c_pressed = False
                        return u'^C\n' # Let the user know what happened
                    if self.restore_rate:
                        # Need at least three seconds of inactivity to go back
                        # to unlimited reads
                        self.io_loop.remove_timeout(self.restore_rate)
                        self.restore_rate = self.io_loop.add_timeout(
                            timedelta(seconds=6), restore_capture_limit)
                    while True:
                        updated = reader.read(self.capture_limit)
                        if not updated:
                            break
                        result += updated
                        self.term_write(updated)
                        if self.ratelimiter_engaged or self.capture_ratelimiter:
                            break # Only allow one read per IOLoop loop
                        if self.capture_limit == 2048:
                            # Block for a little while: Enough to keep things
                            # moving but not fast enough to slow everyone else
                            # down
                            self._blocked_io_handler(wait=1000)
                            break
                        if datetime.now() - loop_start > timeout:
                            # Engage the rate limiter
                            if self.term.capture:
                                self.capture_ratelimiter = True
                                self.capture_limit = 65536
                                # Make sure we eventually get back to defaults:
                                self.io_loop.add_timeout(
                                    timedelta(seconds=10),
                                    restore_capture_limit)
                                # NOTE: The capture_ratelimiter doesn't remove
                                # self.fd from the IOLoop (that's the diff)
                            else:
                                # Set the capture limit to a smaller value so
                                # when we re-start output again the noisy
                                # program won't be able to take over again.
                                self.capture_limit = 2048
                                self.restore_rate = self.io_loop.add_timeout(
                                    timedelta(seconds=6),
                                    restore_capture_limit)
                                self._blocked_io_handler()
                            break
                elif bytes:
                    result = reader.read(bytes)
                    self.term_write(result)
        except IOError as e:
            # IOErrors can happen when self.fd is closed before we finish
            # reading from it.  Not a big deal.
            pass
        except OSError as e:
            logging.error("Got exception in read: %s" % repr(e))
        # This can be useful in debugging:
        #except Exception as e:
            #import traceback
            #logging.error(
                #"Got unhandled exception in read (???): %s" % repr(e))
            #traceback.print_exc(file=sys.stdout)
            #if self.isalive():
                #self.terminate()
        if self.debug:
            if result:
                print("_read(): %s" % repr(result))
        return result

    def _timeout_checker(self):
        """
        Runs `timeout_check` and if there are no more non-sticky
        patterns in :attr:`self._patterns`, stops :attr:`scheduler`.
        """
        if not self._checking_patterns:
            self._checking_patterns = True
            remaining_patterns = self.timeout_check()
            if not remaining_patterns:
                # No reason to keep the PeriodicCallback going
                logging.debug("Stopping self.scheduler (no remaining patterns)")
                try:
                    self.scheduler.stop()
                except AttributeError:
                # Now this is a neat trick:  The way IOLoop works with its
                # stack_context thingamabob the scheduler doesn't actualy end up
                # inside the MultiplexPOSIXIOLoop instance inside of this
                # instance of _timeout_checker() *except* inside the main
                # thread.  It is absolutely wacky but it works and works well :)
                    pass
            self._checking_patterns = False

    def read_raw(self, bytes=-1):
        """
        Reads the output from the underlying fd and returns the result.

        .. note: This method does not send the output to the terminal emulator.
        """
        result = ""
        try:
            with io.open(self.fd, 'rb', closefd=False,buffering=1024) as reader:
                result = reader.read(bytes)
        except IOError as e:
            # IOErrors can happen when self.fd is closed before we finish
            # reading from it.  Not a big deal.
            pass
        except OSError as e:
            logging.error("Got exception in read: %s" % repr(e))
        return result

    def read(self, bytes=-1):
        """
        .. note:: This is an override of `BaseMultiplex.read` in order to take advantage of the IOLoop for ensuring `BaseMultiplex.expect` patterns timeout properly.

        Calls `_read` and checks if any timeouts have been reached
        in :attr:`self._patterns`.  Returns the result of :meth:`_read`.  This
        is an override of `BaseMultiplex.read` that will create a
        :class:`tornado.ioloop.PeriodicCallback` (as `self.scheduler`) that
        executes :attr:`timeout_check` at a regular interval.  The
        `PeriodicCallback` will automatically cancel itself if there are no more
        non-sticky patterns in :attr:`self._patterns`.
        """
        # 50ms basic output rate limit on everything
        rate_wait = timedelta(milliseconds=50)
        if datetime.now() - self.read_timeout > rate_wait:
            result = self._read(bytes)
            self.read_timeout = datetime.now()
            remaining_patterns = self.timeout_check()
            if remaining_patterns and not self.scheduler._running:
                # Start 'er up in case we don't get any more output
                logging.debug("Starting self.scheduler to check for timeouts")
                self.scheduler.start()
            self.isalive() # This just ensures the exitfunc is called (if necessary)
            try:
                pid, status = os.waitpid(self.pid, os.WNOHANG)
            except OSError:
                # Process is dead; call terminate() to clean things up
                self.terminate()
                return result
            if pid: # pid is 0 if the process is still running
                self.exitstatus = os.WEXITSTATUS(status)
            return result

    def _write(self, chars):
        """
        Writes *chars* to `self.fd` (pretty straightforward).  If IOError or
        OSError exceptions are encountered, will run `terminate`.  All other
        exceptions are logged but no action will be taken.
        """
        #logging.debug("MultiplexPOSIXIOLoop._write(%s)" % repr(chars))
        try:
            with io.open(
                self.fd, 'wt', encoding='UTF-8', closefd=False) as writer:
                    writer.write(chars)
            if self.ratelimiter_engaged:
                if u'\x03' in chars: # Ctrl-C
                    # This will force self._read() to discard the buffer
                    self.ctrl_c_pressed = True
                # Reattach the fd so the user can continue immediately
                self._reenable_output()
        except OSError as e:
            logging.error(_(
                "Encountered error writing to terminal program: %s") % e)
            if self.isalive():
                self.terminate()
        except IOError as e:
            # We can safely ignore most of these...  They tend to crop up when
            # writing big chunks of data to dtach'd terminals.
            if not 'raw write()' in e.message:
                logging.error("write() exception: %s" % e)
        except Exception as e:
            logging.error("write() exception: %s" % e)

    def write(self, chars):
        """
        Calls `_write(*chars*)` via `_call_callback` to ensure thread safety.
        """
        if not self.isalive():
            raise ProgramTerminated(_("Child process is not running."))
        write = partial(self._write, chars)
        self._call_callback(write)

# Here's an example of how termio compares to pexpect:
#import pexpect
#child = pexpect.spawn ('ftp ftp.openbsd.org')
#child.expect ('Name .*: ')
#child.sendline ('anonymous')
#child.expect ('Password:')
#child.sendline ('noah@example.com')
#child.expect ('ftp> ')
#child.sendline ('cd pub')
#child.expect('ftp> ')
#child.sendline ('get ls-lR.gz')
#child.expect('ftp> ')
#child.sendline ('bye')
# NOTE: Every expect() in the above example is a blocking call.

# This is the same thing, rewritten using termio:
#import termio
#child = termio.Multiplex('ftp ftp.openbsd.org', debug=True)
## Expectations come first
#child.expect('Name .*:', "anonymous\n")
#child.expect('Password:', 'user@company.com\n')
#child.expect('ftp>$', 'cd pub\n')
#child.expect('ftp>$', 'get ls-lR.gz\n')
#child.expect('ftp>$', 'bye\n')
#child.await() # Blocks until all patterns have been matched or a timeout
# NOTE: If this code were called inside of an already-started IOLoop there would
# be no need to call await(). Everything would be asynchronous and non-blocking.

def spawn(cmd, rows=24, cols=80, env=None, em_dimensions=None, *args, **kwargs):
    """
    A shortcut to::

        m = Multiplex(cmd, *args, **kwargs)
        m.spawn(rows, cols, env)
        return m
    """
    m = Multiplex(cmd, *args, **kwargs)
    m.spawn(rows, cols, env, em_dimensions=em_dimensions)
    return m

def getstatusoutput(cmd, **kwargs):
    """
    Emulates Python's commands.getstatusoutput() function using a Multiplex
    instance.

    Optionally, any additional keyword arguments (\*\*kwargs) provided will be
    passed to the spawn() command.
    """
    # NOTE: This function is primarily here to provide an example of how to use
    # termio.Multiplex instances in a traditional, blocking manner.
    output = ""
    m = Multiplex(cmd)
    m.spawn(**kwargs)
    while m.isalive():
        result = m.read()
        if result:
            output += result
        time.sleep(0.01) # Reduce CPU overhead
    return (m.exitstatus, output)

if POSIX:
    Multiplex = MultiplexPOSIXIOLoop
else:
    raise NotImplementedError(_(
        "termio currently only works on Unix platforms."))
