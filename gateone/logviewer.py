#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Import stdlib stuff
import os, sys, re, gzip
from time import sleep
from datetime import datetime
from optparse import OptionParser

# Import our own stuff
from utils import raw
from gateone import PLUGINS

# 3rd party imports
from tornado.escape import json_encode, json_decode

__doc__ = """\
.. _log_viewer:

Log Viewer
==========
Allows the user to play back a given log file like a video (default) or display
it in a syslog-like format.  To view usage information, run it with the --help
switch:

.. ansi-block::
    \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:/opt/gateone $\x1b[0m ./logviewer.py --help
    Usage:  logviewer.py [options] <log file>

    Options:
      --version       show program's version number and exit
      -h, --help      show this help message and exit
      -f, --flat      Display the log line-by-line in a syslog-like format.
      -p, --playback  Play back the log in a video-like fashion. This is the
                    default view.
      --pretty        Preserve font and character renditions when displaying the
                    log in flat view (default).
      --raw           Display control characters and escape sequences when
                    viewing.

Here's an example of how to display a Gate One log (.golog) in a flat, greppable
format:

.. ansi-block::

    \x1b[1;31mroot\x1b[0m@host\x1b[1;34m:/opt/gateone $\x1b[0m ./logviewer.py --flat
    Sep 09 21:07:14 Host/IP or SSH URL [localhost]: modern-host
    Sep 09 21:07:16 Port [22]:
    Sep 09 21:07:16 User: bsmith
    Sep 09 21:07:17 Connecting to: ssh://bsmith@modern-host:22
    Sep 09 21:07:17
    Sep 09 21:07:17 bsmith@modern-host's password:
    Sep 09 21:07:20 Welcome to Ubuntu 11.04 (GNU/Linux 2.6.38-11-generic x86_64)
    Sep 09 21:07:20
    Sep 09 21:07:20  * Documentation:  https://help.ubuntu.com/
    Sep 09 21:07:20
    Sep 09 21:07:20 Last login: Thu Sep 29 08:51:27 2011 from portarisk
    Sep 09 21:07:20 \x1b[1;34mbsmith\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m ls
    Sep 09 21:07:21 why_I_love_gate_one.txt  to_dont_list.txt
    Sep 09 21:07:21 \x1b[1;34mbsmith\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m

About Gate One's Log Format
===========================
Gate One's log format (.golog) is a gzip-compressed unicode (UTF-8) text file
consisting of time-based frames separated by the unicode character, U+F0F0F0.
Each frame consists of JavaScript-style timestamp (because it is compact)
followed by a colon and then the text characters of the frame.  A frame ends
when a U+F0F0F0 character is encountered.

Here are two example .golog frames demonstrating the format::

    1317344834868:\\x1b[H\\x1b[2JHost/IP or SSH URL [localhost]: <U+F0F0F>1317344836086:\\r\\nPort [22]: <U+F0F0F>

Gate One logs can be opened, decoded, and parsed in Python fairly easily::

    import gzip
    golog = gzip.open(path_to_golog).read()
    for frame in golog.split(u"\U000f0f0f".encode('UTF-8')):
        frame_time = float(frame[:13]) # First 13 chars is the timestamp
        # Timestames can be converted into datetime objects very simply:
        datetime_obj = datetime.fromtimestamp(frame_time/1000)
        frame_text = frame[14:] # This gets you the actual text minus the colon
        # Do something with the datetime_obj and the frame_text

.. note:: U+F0F0F0 is from Private Use Area (PUA) 15 in the Unicode Character Set (UCS). It was chosen at random (mostly =) from PUA-15 because it is highly unlikely to be used in an actual terminal program where it could corrupt a session log.

Class Docstrings
================
"""

# Globals
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log
RE_OPT_SEQ = re.compile(r'\x1b\]_\;(.+?)(\x07|\x1b\\)', re.MULTILINE)
RE_TITLE_SEQ = re.compile(
    r'.*\x1b\][0-2]\;(.+?)(\x07|\x1b\\)', re.DOTALL|re.MULTILINE)

# TODO: Support Fast forward/rewind/pause like Gate One itself.

def playback_log(log_path, file_like, show_esc=False):
    """
    Plays back the log file at *log_path* by way of timely output to *file_like*
    which is expected to be any file-like object with write() and flush()
    methods.

    If *show_esc* is True, escape sequences and control characters will be
    escaped so they can be seen in the output.
    """
    log = gzip.open(log_path).read()
    prev_frame_time = None
    # Skip first frame
    for i, frame in enumerate(log.split(SEPARATOR.encode('UTF-8'))[1:]):
        try:
            frame_time = float(frame[:13]) # First 13 chars is the timestamp
            frame = frame[14:] # Skips the colon
            if i == 0:
                # Write it out immediately
                file_like.write(frame)
                prev_frame_time = frame_time
            else:
            # Wait until the time between the previous frame and now has passed
                wait_time = (frame_time - prev_frame_time)/1000.0
                sleep(wait_time) # frame times are in milliseconds
                prev_frame_time = frame_time
                if show_esc:
                    frame = raw(frame)
                file_like.write(frame)
                file_like.flush()
        except ValueError:
            # End of file.  No biggie.
            return

def escape_escape_seq(text, preserve_renditions=True, rstrip=True):
    """
    Escapes escape sequences so they don't muck with the terminal viewing *text*
    Also replaces special characters with unicode symbol equivalents (e.g. so
    you can see what they are without having them do anything to your running
    shell)

    If *preserve_renditions* is True, CSI escape sequences for renditions will
    be preserved as-is (e.g. font color, background, etc).

    If *rstrip* is true, trailing escape sequences and whitespace will be
    removed.
    """
    esc_sequence = re.compile(
        r'\x1b(.*\x1b\\|[ABCDEFGHIJKLMNOQRSTUVWXYZa-z0-9=]|[()# %*+].)')
    csi_sequence = re.compile(r'\x1B\[([?A-Za-z0-9;@:\!]*)([A-Za-z@_])')
    esc_rstrip = re.compile('[ \t]+\x1b.+$')
    out = u""
    esc_buffer = u""
    # If this seems confusing it is because text parsing is a black art! ARRR!
    for char in text:
        if not esc_buffer:
            if char == u'\x1b':
                esc_buffer = char
            # TODO: Determine if we should bring this back:
            #elif ord(char) in replacement_map:
                #out += replacement_map[ord(char)]
            else:
                out += raw(char)
        else:
            esc_buffer += char
            if char == u'\x07' or esc_buffer.endswith(u'\x1b\\'): # Likely title
                esc_buffer = u'' # Nobody wants to see your naked ESC sequence
                continue
            elif esc_buffer.endswith('\x1b\\'):
                esc_buffer = u'' # Ignore
                continue
            # Nobody wants to see plain ESC sequences in the buf...
            match_obj = esc_sequence.match(esc_buffer)
            if match_obj:
                seq_type = match_obj.group(1)
                esc_buffer = u'' # Just when you thought you've ESC'd...
                continue
            # CSI ESC sequences...  These are worth a second look
            match_obj = csi_sequence.match(esc_buffer)
            if match_obj:
                csi_type = match_obj.group(2)
                if csi_type == 'm' and preserve_renditions: # mmmmmm!
                    out += esc_buffer # Ooh, naked viewing of pretty things!
                esc_buffer = u'' # Make room for more!
                continue
    if rstrip:
        # Remove trailing whitespace + trailing ESC sequences
        return esc_rstrip.sub('', out).rstrip()
    else: # All these trailers better make for a good movie
        return out

def flatten_log(log_path, preserve_renditions=True, show_esc=False):
    """
    Given a log file at *log_path*, return a str of log lines contained within.

    If *preserve_renditions* is True, CSI escape sequences for renditions will
    be preserved as-is (e.g. font color, background, etc).  This is to make the
    output appear as close to how it was originally displayed as possible.
    Besides that, it looks really nice =)

    If *show_esc* is True, escape sequences and control characters will be
    visible in the output.  Trailing whitespace and escape sequences will not be
    removed.

    NOTE: Converts our standard recording-based log format into something that
    can be used with grep and similar search/filter tools.
    """
    import gzip
    lines = gzip.open(log_path).read()
    out = ""
    # Skip the first frame (metadata)
    for frame in lines.split(SEPARATOR.encode('UTF-8'))[1:]:
        try:
            frame_time = float(frame[:13]) # First 13 chars is the timestamp
            # Convert to datetime object
            frame_time = datetime.fromtimestamp(frame_time/1000)
            if u'\n' in frame[14:]: # Skips the colon
                frame_lines = frame[14:].splitlines()
                for i, fl in enumerate(frame_lines):
                    if len(fl):
                        # NOTE: Have to put a rendition reset (\x1b[m) at the
                        # start of each line in case the previous line didn't
                        # reset it on its own.
                        if show_esc:
                            out += u"%s %s\n" % ( # Standard Unix log format
                                frame_time.strftime(u'\x1b[m%b %m %H:%M:%S'),
                                raw(fl))
                        else:
                            out += u"%s %s\n" % ( # Standard Unix log format
                                frame_time.strftime(u'\x1b[m%b %m %H:%M:%S'),
                                escape_escape_seq(fl, rstrip=True)
                            )
                    elif i:# Don't need this for the first empty line in a frame
                        out += frame_time.strftime(u'\x1b[m%b %m %H:%M:%S \n')
                out += frame_time.strftime(u'\x1b[m%b %m %H:%M:%S \n')
            elif show_esc:
                if len(out) and out[-1] == u'\n':
                    out = u"%s%s\n" % (out[:-1], raw(frame[14:]))
            else:
                if '\x1b[H\x1b[2J' in frame[14:]: # Clear screen sequence
                    out += frame_time.strftime(u'\x1b[m%b %m %H:%M:%S ')
                    out += escape_escape_seq(frame[14:], rstrip=True).rstrip()
                    out += ' ^L\n'
                    continue
                escaped_frame = escape_escape_seq(frame[14:], rstrip=True)
                if len(out) and out[-1] == u'\n':
                    # Back up a line and add this character to it
                    out = u"%s%s\n" % (out[:-1], escaped_frame)
                elif escaped_frame:
                    # This is pretty much always going to be the first line
                    out += u"%s %s\n" % ( # Standard Unix log format
                        frame_time.strftime(u'\x1b[m%b %m %H:%M:%S'),
                        escaped_frame.rstrip()
                    )
        except ValueError as e:
            pass
            # End of file.  No biggie.
    return out

if __name__ == "__main__":
    """Parse command line arguments and view the log in the specified format."""
    usage = ('\t%prog [options] <log file>')
    parser = OptionParser(usage=usage, version=__version__)
    parser.disable_interspersed_args()
    parser.add_option("-f", "--flat",
        dest="flat",
        default=False,
        action="store_true",
        help="Display the log line-by-line in a syslog-like format."
    )
    parser.add_option("-p", "--playback",
        dest="playback",
        default=True,
        action="store_false",
        help=("Play back the log in a video-like fashion. This is the default "
              "view.")
    )
    parser.add_option("--pretty",
        dest="pretty",
        default=True,
        action="store_true",
        help=("Preserve font and character renditions when displaying the log "
              "in flat view (default).")
    )
    parser.add_option("--raw",
        dest="raw",
        default=False,
        action="store_true",
        help="Display control characters and escape sequences when viewing."
    )
    (options, args) = parser.parse_args()
    if len(args) < 1:
        print("ERROR: You must specify a log file to view.")
        parser.print_help()
        sys.exit(1)
    log_path = args[0]
    if options.flat:
        result = flatten_log(
            log_path, preserve_renditions=options.pretty, show_esc=options.raw)
        print(result)
    else:
        playback_log(log_path, sys.stdout)