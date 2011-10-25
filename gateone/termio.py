# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# TODO: See if we can spin off termio.py into its own little program that sits between Gate One and ssh_connect.py.  That way we can take advantage of multiple cores/processors (for terminal-to-HTML processing).  There's no reason why we can't write something that does what dtach does.  Just need to redirect the fd of self.cmd to a unix domain socket and os.setsid() somewhere after forking (twice maybe?).
# TODO: Make the environment variables used before launching self.cmd configurable

# Meta
__version__ = '0.9'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
About termio
============
This module provides a Multiplex class that can perform the following:

 * Fork a child process that opens a given terminal program.
 * Read and write data to and from the child process.
 * Log the output of the child process to a file and/or syslog.

The Multiplex class is meant to be used in conjunction with a running Tornado
IOLoop instance.  It can be instantiated from within your Tornado application
like so::

    multiplexer = termio.Multiplex(
        'nethack',
        tmpdir='/tmp',
        log_path='/var/log/myapp',
        user='bsmith@CORP',
        term_num=1,
        syslog=True
    )

Then *multiplexer* can create and launch a new controlling terminal (tty)
running the given command (e.g. 'nethack')::

    env = {
        'PATH': os.environ['PATH'],
        'MYVAR': 'foo'
    }
    fd = multiplexer.create(80, 24, env=env)
    # The fd is returned from create() in case you want more low-level control.

Input and output from the controlled program is asynchronous and gets handled
via IOLoop.  It will automatically write all output from the terminal program to
an instance of self.terminal_emulator (which defaults to Gate One's
terminal.Terminal).  So if you want to perform an action whenever the running
terminal application has output (like, say, sending a message to a client)
you'll need to attach a callback::

    def screen_update():
        'Called when new output is ready to send to the client'
        output = multiplexer.dumplines()
        socket_or_something.write(output)
    multiplexer.callbacks[multiplexer.CALLBACK_UPDATE] = screen_update

In this example, screen_update() will write() the output of
multiplexer.dumplines() to *socket_or_something* whenever the terminal program
has some sort of output.  You can also make calls directly to the terminal
emulator (if you're using a custom one)::

    def screen_update():
        output = multiplexer.term.my_custom_func()
        whatever.write(output)

Writing characters to the controlled terminal application is pretty
straightforward::

    multiplexer.proc_write('some text')

Typically you'd pass in keystrokes or commands from your application to the
underlying program this way and the screen/terminal emulator would get updated
automatically.  If using Gate One's Terminal() you can also attach callbacks
to perform further actions when more specific situations are encountered (e.g.
when the window title is set via that respective escape sequence)::

    def set_title():
        'Hypothetical title-setting function'
        print("Window title was just set to: %s" % multiplexer.term.title)
    multiplexer.term.callbacks[multiplexer.CALLBACK_TITLE] = set_title

Module Functions and Classes
============================
"""

# Stdlib imports
import signal, threading, fcntl, os, pty, re, sys, time, termios, struct
import io, codecs, gzip, syslog
from tornado import ioloop
from functools import partial
from itertools import izip
import logging
from subprocess import Popen

# Import our own stuff
from utils import noop
from utils import get_translation

_ = get_translation()

# Globals
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log
# NOTE: That unicode character was carefully selected from only the finest
# of the PUA.  I hereby dub thee, "U+F0F0F0, The Separator."

# Helper functions
def handle_special(e):
    """
    Used in conjunction with codecs.register_error, will replace special ascii
    characters such as 0xDA and 0xc4 (which are used by ncurses) with their
    Unicode equivalents.
    """
    # TODO: Fill this out with *all* the ascii characters >127 from
    #       http://www.ascii-code.com/
    specials = {
        # NOTE: When $TERM is set to "Linux" these end up getting used by things
        #       like ncurses-based apps.  In other words, it makes a whole lot
        #       of ugly look pretty again.
        0xda: u'┌', # ACS_ULCORNER
        0xc0: u'└', # ACS_LLCORNER
        0xbf: u'┐', # ACS_URCORNER
        0xd9: u'┘', # ACS_LRCORNER
        0xb4: u'├', # ACS_RTEE
        0xc3: u'┤', # ACS_LTEE
        0xc1: u'┴', # ACS_BTEE
        0xc2: u'┬', # ACS_TTEE
        0xc4: u'─', # ACS_HLINE
        0xb3: u'│', # ACS_VLINE
        0xc5: u'┼', # ACS_PLUS
        0x2d: u'', # ACS_S1
        0x5f: u'', # ACS_S9
        0xc5: u'◆', # ACS_DIAMOND
        0xb2: u'▒', # ACS_CKBOARD
        0xf8: u'°', # ACS_DEGREE
        0xf1: u'±', # ACS_PLMINUS
        0xf9: u'•', # ACS_BULLET
        0x3c: u'←', # ACS_LARROW
        0x3e: u'→', # ACS_RARROW
        0x76: u'↓', # ACS_DARROW
        0x5e: u'↑', # ACS_UARROW
        0xb0: u'⊞', # ACS_BOARD
        0x0f: u'⨂', # ACS_LANTERN
        0xdb: u'█', # ACS_BLOCK
        0x9d: u'Ø', # Upper-case slashed zero (157)--using same as empty set
        0xd8: u'Ø', # Empty set (216)
# Note to self:  Why did I bother with these overly descriptive comments?  Ugh
# I've been staring at obscure symbols far too much lately ⨀_⨀
        0xc7: u'Ç', # Latin capital letter C with cedilla
        0xeb: u'ë', # Latin small letter e with diaeresis
        0x99: u'™', # Trademark sign--in case you didn't know!
        0xff: u'ÿ', # Latin small letter y with diaeresis⬅So THATS what that is
        0xa8: u'¨', # Spacing diaeresis - umlaut
        0xec: u'ì', # Latin small letter i with grave... concern.
        0xca: u'Ê', # Latin capital letter E with circumflex
        0x83: u'ƒ', # Latin small letter f with hook
        0xe2: u'â',
    }
    # I left this in its odd state so I could differentiate between the two
    # in the future.
    if isinstance(e, (UnicodeEncodeError, UnicodeTranslateError)):
        s = [u'%s' % specials[ord(c)] for c in e.object[e.start:e.end]]
        return ''.join(s), e.end
    else:
        s = [u'%s' % specials[ord(c)] for c in e.object[e.start:e.end]]
        return ''.join(s), e.end
codecs.register_error('handle_special', handle_special)

# Classes
class Multiplex:
    """
    The Multiplex class takes care of forking a child process and provides
    methods for reading/writing to it.  It also creates an instance of
    tornado.ioloop.IOLoop that listens for events on the spawned terminal
    application and updates self.proc[fd]['term'] with any changes.
    """
    CALLBACK_UPDATE = 1 # Screen update
    CALLBACK_EXIT = 2   # When the underlying program exits

    def __init__(self,
            cmd=None,
            terminal_emulator=None, # Defaults to Gate One's terminal.Terminal
            cps=5000,
            tmpdir="/tmp",
            log_path=None,
            user=None, # Only used by syslog output (to differentiate who's who)
            term_num=None, # Also only for syslog output for the same reason
            syslog=False,
            syslog_facility=syslog.LOG_DAEMON):
        # NOTE: Commented this out because Death apparently moves too swiftly!
        # Elect for automatic child reaping (may Death take them kindly!)
        #signal.signal(signal.SIGCHLD, signal.SIG_IGN)
        self.cmd = cmd
        if not terminal_emulator:
            # Why do this?  So you could use/write your own specialty emulator.
            # Whatever you use it just has to accept 'rows' and 'cols' as
            # keyword arguments in __init__()
            from terminal import Terminal # Dynamic import to cut down on waste
            self.terminal_emulator = Terminal
        else:
            self.terminal_emulator = terminal_emulator
        self.cps = cps # Characters per second where the rate limiter kicks in
        self.tmpdir = tmpdir # Where to store things like pid files
        self.log_path = log_path # Logs of the terminal output wind up here
        self.syslog = syslog # See "if self.syslog:" below
        self.syslog_facility = syslog_facility # Ditto
        self.io_loop = ioloop.IOLoop.instance() # Monitors child for activity
        self.alive = True # Provides a quick way to see if we're still kickin'
        # These three variables are used by the rate limiting function:
        self.ratelimit = time.time()
        self.skip = False
        self.ratelimiter_engaged = False
        # Setup our callbacks
        self.callbacks = { # Defaults do nothing which saves some conditionals
            self.CALLBACK_UPDATE: noop,
            self.CALLBACK_EXIT: noop,
        }
        # Configure syslog logging
        self.user = user
        self.term_num = term_num
        self.syslog_buffer = ''
        if self.syslog: # Dynamic imports again because I'm freaky and frugal
            import syslog
            # Sets up syslog messages to show up like this:
            #   Sep 28 19:45:02 <hostname> gateone: <log message>
            syslog.openlog('gateone', 0, syslog_facility)

    def create(self, rows=24, cols=80, env=None):
        """
        Creates a new virtual terminal (tty) and executes self.cmd within it.
        Also sets up our read/write callback and attaches them to Tornado's
        IOLoop.

        *cols*
            The number of columns to emulate on the virtual terminal (width)
        *rows*
            The number of rows to emulate (height).
        *env*
            A dictionary of environment variables to set when executing self.cmd.
        """
        pid, fd = pty.fork()
        if pid == 0: # We're inside the child process
            try: # Enumerate our file descriptors
                fd_list = [int(i) for i in os.listdir('/proc/self/fd')]
            except OSError:
                fd_list = xrange(256)
    # Close all file descriptors other than stdin, stdout, and stderr (0, 1, 2)
            for i in [i for i in fd_list if i > 2]:
                try:
                    os.close(i)
                except OSError:
                    pass
            if not env:
                env = {}
            env["COLUMNS"] = str(cols)
            env["LINES"] = str(rows)
            env["TERM"] = "xterm" # TODO: This needs to be configurable on-the-fly
            #env["PATH"] = os.environ['PATH']
            #env["LANG"] = os.environ['LANG']
            p = Popen(self.cmd, env=env, shell=True)
            p.wait()
            # This exit() ensures IOLoop doesn't freak out about a missing fd
            sys.exit(0)
        else: # We're inside this Python script
            fcntl.fcntl(fd, fcntl.F_SETFL, os.O_NONBLOCK)
            # These two lines set the size of the terminal window:
            s = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(fd, termios.TIOCSWINSZ, s)
            self.fd = fd
            self.pid = pid
            self.term = self.terminal_emulator(rows=rows, cols=cols)
            self.time = time.time()
            # Tell our IOLoop instance to start watching the child
            self.io_loop.add_handler(
                self.fd, self.proc_read, self.io_loop.READ)
            self.prev_output = [None for a in xrange(rows-1)]
            return fd

    def die(self):
        """
        Sets self.alive to False

        NOTE: This is actually important as it allows controlling processes to
        see if the multiplexer is still alive or not (so they don't have to
        enumerate the process table looking for a particular pid).
        """
        self.alive = False

    def resize(self, rows, cols):
        """
        Resizes the child process's terminal window to *rows* and *cols*
        """
        self.term.resize(rows, cols)
        s = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, s)

    def redraw(self):
        """
        Tells the running terminal program to redraw the screen by executing
        a window resize event (using its current dimensions) and writing a
        ctrl-l.
        """
        s = struct.pack("HHHH", self.term.rows, self.term.cols, 0, 0)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, s)
        self.proc_write(u'\x0c') # ctrl-l
        # WINCH can mess things up quite a bit so I've disabled it.
        # Leaving this here in case it ever becomes configurable (reference)
        #os.kill(self.proc[fd]['pid'], signal.SIGWINCH)

    def proc_kill(self):
        """
        Kill the child process associated with the given file descriptor (fd).

        NOTE: If dtach is being used this only kills the dtach process.
        """
        try:
            self.io_loop.remove_handler(self.fd)
        except KeyError, IOError:
            # This can happen when the fd is removed by the underlying process
            # before the next cycle of the IOLoop.  Not really a problem.
            pass
        try:
            os.kill(self.pid, signal.SIGTERM)
            os.wait()
        except OSError:
            # Lots of trivial reasons why we could get these
            pass

    def term_write(self, chars):
        """
        Writes *chars* to self.term and also takes care of logging to
        *self.log_path* (if set) and/or syslog (if *self.syslog* is True).

        NOTE: This kind of logging doesn't capture user keystrokes.  This is
        intentional as we don't want passwords winding up in the logs.
        """
        # Write to the log too (if configured)
        if self.log_path:
            now = int(round(time.time() * 1000))
            # NOTE: I'm using an obscure unicode symbol in order to avoid
            # conflicts.  We need to do our best to ensure that we can
            # differentiate between terminal output and our log format...
            # This should do the trick because it is highly unlikely that
            # someone would be displaying this obscure unicode symbol on an
            # actual terminal unless they were using Gate One to view a
            # Gate One log file in vim or something =)
            # \U000f0f0f == U+F0F0F (Private Use Symbol)
            chars = unicode(chars)
            output = u"%s:%s\U000f0f0f" % (now, chars)
            log = gzip.open(self.log_path, mode='a')
            log.write(output.encode("utf-8"))
            log.close()
        # NOTE: Gate One's log format is special in that it can be used for both
        # playing back recorded sessions *or* generating syslog-like output.
        if self.syslog:
            # Try and keep it as line-line as possible so we don't end up with
            # a log line per character.
            if '\n' in chars:
                for line in chars.splitlines():
                    if self.syslog_buffer:
                        line = self.syslog_buffer + line
                        self.syslog_buffer = ''
                    # Sylog really doesn't like any fancy encodings
                    line = line.encode('ascii', 'xmlcharrefreplace')
                    syslog.syslog("%s %s: %s" % (
                        self.user, self.term_num, line))
            else:
                self.syslog_buffer += chars
        self.term.write(chars)
        self.io_loop.add_callback(self.callbacks[self.CALLBACK_UPDATE])

    def proc_read(self, fd, event):
        """
        Read in the output of the process associated with *fd* and write it to
        self.term.

        This method will also keep an eye on the output rate of the underlying
        terminal application.  If it goes to high (which would gobble up CPU) it
        will engage a rate limiter.  So if someone thinks it would be funny to
        run 'top' with a refresh rate of 0.01 they'll really only be getting
        updates every ~2 seconds (and it won't bog down the server =).

        NOTE: This method is not meant to be called directly...  The IOLoop
        should be the one calling it when it detects an io_loop.READ event.
        """
        if event == self.io_loop.READ:
            try:
                with io.open(
                        self.fd,
                        'rt',
                        buffering=1024,
                        newline="",
                        encoding='UTF-8', # TODO: Make this configurable
                        closefd=False,
                        errors='handle_special'
                    ) as reader:
                    updated = reader.read(65536)
                #updated = os.read(fd, 65536) # A lot slower than reader, why?
                ratelimit = self.ratelimit
                now = time.time()
                timediff = now - self.time
                rate_timediff = now - ratelimit
                characters = len(updated)
                cps = characters/timediff # Assumes 7 bits per char (ASCII)
                # The conditionals below drop the output of our fd if it's coming
                # in too fast.  Essentially, it is a rate limiter to prevent
                # really noisy/fast output console apps (say, 'top' with a
                # refresh rate of 0.01) from causing this application to
                # gobble up all the system CPU trying to process the input.
                # Think of it like mplayer's "-framedrop" option that keeps
                # your video playing at the proper rate if the CPU runs out of
                # power to process video frames.

                # Only consider dropping if the rate is faster than self.cps:
                if cps > self.cps:
                    # Don't start cutting frames unless this is a constant thing
                    if rate_timediff > 3:
                        # TODO: Have this flash a message on the screen
                        #       indicating the rate limiter has been engaged.
                        self.ratelimiter_engaged = True
                        check = divmod(now - ratelimit, 2)[0]
                        # Update once every other second or so
                        if check % 2 == 0 and not self.skip:
                            self.term_write(updated)
                            self.skip = True
                        elif self.skip:
                            self.skip = False
                    else:
                        self.term_write(updated)
                    # NOTE: This can result in odd output with too-fast apps
                else:
                    self.term_write(updated)
                if now - ratelimit > 1:
                    # Reset the rate limiter
                    self.ratelimit = time.time()
                self.time = time.time()
            except KeyError as e:
                # Should just be an exception from handle_special()
                logging.debug("KeyError in proc_read(): %s" % e) # So we know
            except (IOError, OSError) as e:
                logging.error("Got exception in proc_read: %s" % `e`)
                self.die()
                self.proc_kill()
            except Exception as e:
                import traceback
                logging.error("Got BIZARRO exception in proc_read (WTF?): %s" % `e`)
                traceback.print_exc(file=sys.stdout)
                self.die()
                self.proc_kill()
        else: # Child died
            logging.debug("Apparently fd %s just died." % self.fd)
            self.die()
            self.proc_kill()
            self.callbacks[self.CALLBACK_EXIT]()

    def proc_write(self, chars):
        """
        Writes *chars* to the terminal process running on *fd*.
        """
        try:
        # By creating a new writer with every execution of this function we
        # can avoid the memory leak in earlier versions of Python.  It is
        # slightly slower but, hey, now you have an excuse to upgrade!
            with io.open(
                self.fd,
                'wt',
                buffering=1024,
                newline="",
                encoding='UTF-8',
                closefd=False
            ) as writer:
                writer.write(chars)
            # This doesn't leak but it also doesn't support unicode:
            #os.write(self.fd, s)
        except (IOError, OSError):
            self.die()
            self.proc_kill()
        except Exception as e:
            logging.error("proc_write() exception: %s" % e)

    def dumplines(self):
        """
        Returns the terminal text lines (a list of lines, to be specific) and
        its scrollback buffer (which is also a list of lines) as a tuple,
        (scrollback, text).  If a line hasn't changed since the last dump then
        it will be replaced with an empty string (in the terminal text lines).
        """
        try:
            output = []
            scrollback, html = self.term.dump_html()
            for line1, line2 in izip(self.prev_output, html):
                if line1 != line2:
                    output.append(line2)
                else:
                    output.append('')
            self.prev_output = html
            return (scrollback, output)
        except KeyError:
            return (None, None)
