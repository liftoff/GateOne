#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#

# Meta
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Import stdlib stuff
import os, sys, re, io, gzip, fcntl, termios, struct, shutil, tempfile
from time import sleep
from datetime import datetime
from optparse import OptionParser

try:
    import curses
except ImportError:
    curses = None

# Import our own stuff
from gateone import GATEONE_DIR
from gateone.core.utils import raw
from gateone.core.configuration import get_settings, combine_css

# 3rd party imports
from tornado.escape import json_encode, json_decode
import tornado.template

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
APPLICATION_PATH = os.path.split(__file__)[0]
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log
RE_OPT_SEQ = re.compile(r'\x1b\]_\;(.+?)(\x07|\x1b\\)', re.MULTILINE)
RE_TITLE_SEQ = re.compile(
    r'.*\x1b\][0-2]\;(.+?)(\x07|\x1b\\)', re.DOTALL|re.MULTILINE)

# TODO: Support Fast forward/rewind/pause like Gate One itself.
def get_frames(golog_path, chunk_size=131072):
    """
    A generator that iterates over the frames in a .golog file, returning them
    as strings.
    """
    encoded_separator = SEPARATOR.encode('UTF-8')
    golog = gzip.open(golog_path)
    frame = b""
    while True:
        chunk = golog.read(chunk_size)
        frame += chunk
        if encoded_separator in chunk:
            split_frames = frame.split(encoded_separator)
            next_frame = split_frames[-1]
            for fr in split_frames[:-1]:
                # Undo extra CRs caused by capturing shell output on top of
                # shell output
                fr = fr.replace(b'\r\n', b'\n')
                yield fr
            frame = next_frame
        if len(chunk) < chunk_size:
            # Write last frame
            if frame:
                frame = frame.replace(b'\r\n', b'\n')
                yield frame
            break

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

def get_log_metadata(golog_path):
    """
    Returns the metadata from the log at the given *golog_path* in the form of
    a dict.
    """
    metadata = {}
    if not os.path.getsize(golog_path): # 0 bytes
        return metadata # Nothing to do
    try:
        first_frame, distance = retrieve_first_frame(golog_path)
    except IOError:
        # Something wrong with the log...  Probably still being written to
        return metadata
    if first_frame[14:].startswith('{'):
        # This is JSON, capture metadata
        metadata = json_decode(first_frame[14:])
    return metadata # All done

def playback_log(log_path, file_like, show_esc=False):
    """
    Plays back the log file at *log_path* by way of timely output to *file_like*
    which is expected to be any file-like object with write() and flush()
    methods.

    If *show_esc* is True, escape sequences and control characters will be
    escaped so they can be seen in the output.  There will also be no delay
    between the output of frames (under the assumption that if you want to see
    the raw log you want it to output all at once so you can pipe it into
    some other app).
    """
    prev_frame_time = None
    try:
        for count, frame in enumerate(get_frames(log_path)):
            frame_time = float(frame[:13]) # First 13 chars is the timestamp
            frame = frame[14:] # [14:] Skips the timestamp and the colon
            if count == 0:
                # Write it out immediately
                if show_esc:
                    frame = raw(frame)
                file_like.write(frame)
                prev_frame_time = frame_time
            else:
                if show_esc:
                    frame = raw(frame)
                else:
                    # Wait until the time between the previous frame and now
                    # has passed
                    wait_time = (frame_time - prev_frame_time)/1000.0
                    sleep(wait_time) # frame times are in milliseconds
                file_like.write(frame)
                prev_frame_time = frame_time
            file_like.flush()
    except IOError: # Something wrong with the file
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
    csi_sequence = re.compile(r'\x1B\[([?A-Za-z0-9;@:\!]*?)([A-Za-z@_])')
    #esc_rstrip = re.compile('[ \t]+\x1b.+$')
    out = u""
    esc_buffer = u""
    # If this seems confusing it is because text parsing is a black art! ARRR!
    for char in text:
        if not esc_buffer:
            if char == u'\x1b': # Start of an ESC sequence
                esc_buffer = char
            # TODO: Determine if we should bring this back:
            #elif ord(char) in replacement_map:
                #out += replacement_map[ord(char)]
            else: # Vanilla char.  Booooring.
                out += raw(char)
        else: # Something interesting is going on
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
                #seq_type = match_obj.group(1)
                esc_buffer = u'' # Just when you thought you've ESC'd...
                continue
            # CSI ESC sequences...  These are worth a second look
            match_obj = csi_sequence.match(esc_buffer)
            if match_obj:
                csi_type = match_obj.group(2)
                if csi_type == 'm' and preserve_renditions: # mmmmmm!
                    out += esc_buffer # Ooh, naked viewing of pretty things!
                elif csi_type == 'C': # Move cursor right (we want to do this)
                    # Will be something like this: \x1b[208C
                    num_spaces = match_obj.group(1)
                    if not num_spaces:
                        num_spaces = 1
                    spaces = int(num_spaces)
                    out += u' ' * spaces # Add an equivalent amount of spaces
                esc_buffer = u'' # Make room for more!
                continue
    if rstrip:
        # Remove trailing whitespace + trailing ESC sequences
        return out.rstrip()
    else: # All these trailers better make for a good movie
        return out

def flatten_log(log_path, file_like, preserve_renditions=True, show_esc=False):
    """
    Given a log file at *log_path*, write a string of log lines contained
    within to *file_like*.  Where *file_like* is expected to be any file-like
    object with write() and flush() methods.

    If *preserve_renditions* is True, CSI escape sequences for renditions will
    be preserved as-is (e.g. font color, background, etc).  This is to make the
    output appear as close to how it was originally displayed as possible.
    Besides that, it looks really nice =)

    If *show_esc* is True, escape sequences and control characters will be
    visible in the output.  Trailing whitespace and escape sequences will not be
    removed.

    ..note::

        Converts our standard recording-based log format into something that
        can be used with grep and similar search/filter tools.
    """
    from terminal import Terminal, SPECIAL
    metadata = get_log_metadata(log_path)
    rows = metadata.get('rows', 24)
    cols = metadata.get('columns', None)
    if not cols:
        # Try the old metadata format which used 'cols':
        cols = metadata.get('cols', 80)
    term = Terminal(rows=rows, cols=cols, em_dimensions=0)
    out_line = u""
    cr = False
    # We skip the first frame, [1:] because it holds the recording metadata
    for count, frame in enumerate(get_frames(log_path)):
        if count == 0:
            # Skip the first frame (it's just JSON-encoded metadata)
            continue
        # First 13 chars is the timestamp:
        frame_time = float(frame.decode('UTF-8', 'ignore')[:13])
        # Convert to datetime object
        frame_time = datetime.fromtimestamp(frame_time/1000)
        if show_esc:
            frame_time = frame_time.strftime(u'\x1b[0m%b %d %H:%M:%S')
        else: # Renditions preserved == I want pretty.  Make the date bold:
            frame_time = frame_time.strftime(u'\x1b[0;1m%b %d %H:%M:%S\x1b[m')
        if not show_esc:
            term.write(frame[14:])
        if term.capture:
            # Capturing a file...  Keep feeding it frames until complete
            continue
        elif term.captured_files:
            for line in term.screen:
                # Find all the characters that come before/after the capture
                for char in line:
                    if ord(char) >= SPECIAL:
                        adjusted = escape_escape_seq(out_line, rstrip=True)
                        adjusted = frame_time + u' %s\n' % adjusted
                        file_like.write(adjusted.encode('utf-8'))
                        out_line = u""
                        if char in term.captured_files:
                            captured_file = term.captured_files[char].file_obj
                            captured_file.seek(0)
                            file_like.write(captured_file.read())
                            file_like.write(b'\n')
                            del captured_file
                            term.clear_screen()
                            term.close_captured_fds() # Instant cleanup
                    else:
                        out_line += char
            if not out_line:
                continue
            adjusted = frame_time + u' %s\n' % out_line.strip()
            file_like.write(adjusted.encode('utf-8'))
            out_line = u""
            continue
        else:
            term.clear_screen()
        frame = frame.decode('UTF-8', 'ignore')
        for char in frame[14:]:
            if '\x1b[H\x1b[2J' in out_line: # Clear screen sequence
                # Handle the clear screen (usually ctrl-l) by outputting
                # a new log entry line to avoid confusion regarding what
                # happened at this time.
                out_line += u"^L" # Clear screen is a ctrl-l or equivalent
                if show_esc:
                    adjusted = raw(out_line)
                else:
                    adjusted = escape_escape_seq(out_line, rstrip=True)
                adjusted = frame_time + u' %s\n' % adjusted
                file_like.write(adjusted.encode('utf-8'))
                out_line = u""
                continue
            if char == u'\n':
                if show_esc:
                    adjusted = raw(out_line)
                else:
                    adjusted = escape_escape_seq(out_line, rstrip=True)
                if not adjusted:
                    out_line = u"" # Skip empty lines
                    continue
                adjusted = frame_time + u' %s\n' % adjusted
                file_like.write(adjusted.encode('utf-8'))
                out_line = u""
                cr = False
            elif char == u'\r':
                # Carriage returns need special handling.  Make a note of it
                cr = True
            else:
                # \r without \n means that characters were (likely)
                # overwritten.  This usually happens when the user gets to
                # the end of the line (which would create a newline in the
                # terminal but not necessarily the log), erases their
                # current line (e.g. ctrl-u), or an escape sequence modified
                # the line in-place.  To clearly indicate what happened we
                # insert a '^M' and start a new line so as to avoid
                # confusion over these events.
                if cr:
                    out_line += "^M"
                    file_like.write((frame_time + u' ').encode('utf-8'))
                    if show_esc:
                        adjusted = raw(out_line)
                    else:
                        adjusted = escape_escape_seq(out_line, rstrip=True)
                    file_like.write((adjusted + u'\n').encode('utf-8'))
                    out_line = u""
                out_line += char
                cr = False
        file_like.flush()
    del term

def render_log_frames(golog_path, rows, cols, limit=None):
    """
    Returns the frames of *golog_path* as a list of HTML-encoded strings that
    can be used with the playback_log.html template.  It accomplishes this task
    by running the frames through the terminal emulator and capturing the HTML
    output from the `Terminal.dump_html` method.

    If *limit* is given, only return that number of frames (e.g. for preview)
    """
    out_frames = []
    from terminal import Terminal
    term = Terminal(
        # 14/7 for the em_height should be OK for most browsers to ensure that
        # images don't always wind up at the bottom of the screen.
        rows=rows, cols=cols, em_dimensions={'height':14, 'width':7})
    for i, frame in enumerate(get_frames(golog_path)):
        if limit and i == limit:
            break
        if len(frame) > 14:
            if i == 0 and frame[14:15] == b'{':
                # This is just the metadata frame.  Skip it
                continue
            frame_time = int(float(frame[:13]))
            frame_screen = frame[14:] # Skips the colon
            # Emulate how a real shell would output newlines:
            frame_screen = frame_screen.replace(b'\n', b'\r\n')
            term.write(frame_screen)
            # Ensure we're not in the middle of capturing a file.  Otherwise
            # it might get cut off and result in no image being shown.
            if term.capture:
                continue
            scrollback, screen = term.dump_html()
            out_frames.append({'screen': screen, 'time': frame_time})
    del term # Ensures any file capture file descriptors are cleaned up
    return out_frames # Skip the first frame which is the metadata

def get_256_colors(container="gateone"):
    """
    Returns the rendered 256-color CSS.  If *container* is provided it will be
    used as the ``{{container}}`` variable when rendering the template (
    defaults to "gateone").
    """
    colors_json_path = os.path.join(
        APPLICATION_PATH, 'static', '256colors.json')
    # Using get_settings() as a cool hack to get the color data as a nice dict:
    color_map = get_settings(colors_json_path, add_default=False)
    # Setup our 256-color support CSS:
    colors_256 = ""
    for i in xrange(256):
        i = str(i)
        fg = u"#%s span.✈fx%s {color: #%s;}" % (
            container, i, color_map[i])
        bg = u"#%s span.✈bx%s {background-color: #%s;} " % (
            container, i, color_map[i])
        fg_rev =(
            u"#%s span.✈reverse.fx%s {background-color: #%s; color: "
            u"inherit;}" % (container, i, color_map[i]))
        bg_rev =(
            u"#%s span.✈reverse.bx%s {color: #%s; background-color: "
            u"inherit;} " % (container, i, color_map[i]))
        colors_256 += "%s %s %s %s\n" % (fg, bg, fg_rev, bg_rev)
    return colors_256

def render_html_playback(golog_path, render_settings=None):
    """
    Generates a self-contained HTML playback file from the .golog at the given
    *golog_path*.  The HTML will be output to stdout.  The optional
    *render_settings* argument (dict) can include the following options
    to control how the output is rendered:

        :prefix:
            (Default: `"go_default_"`) The GateOne.prefs.prefix to emulate when
            rendering the HTML template.
        :container:
            (Default: `"gateone"`) The name of the #gateone container to emulate
            when rendering the HTML template.
        :theme:
            (Default: `"black"`) The theme to use when rendering the HTML
            template.
        :colors:
            (Default: `"default"`) The text color scheme to use when rendering
            the HTML template.

    .. note:: This function returns a byte string (not a unicode string).
    """
    # Get the necessary variables out of render_settings
    if not render_settings:
        render_settings = {}
    terminal_app_path = os.path.join(GATEONE_DIR, 'applications', 'terminal')
    prefix = render_settings.get('prefix', 'go_default_')
    container = render_settings.get('container', 'gateone')
    colors = render_settings.get('colors', 'default')
    theme = render_settings.get('theme', 'black')
    temploc = tempfile.mkdtemp(prefix='logviewer') # stores rendered CSS
    # This function renders all themes
    combine_css(os.path.join(temploc, 'gateone.css'), container)
    theme_css_file = "gateone_theme_{theme}.css".format(theme=theme)
    theme_css_path = os.path.join(temploc, theme_css_file)
    with io.open(theme_css_path, mode='r', encoding='utf-8') as f:
        theme_css = f.read()
    # Cleanup the CSS files since we're now done with them
    shutil.rmtree(temploc)
    # Colors are easiest since they don't need to be rendered
    colors_css_file = "{0}.css".format(colors)
    colors_css_path = os.path.join(
        terminal_app_path, 'templates', 'term_colors', colors_css_file)
    with io.open(colors_css_path, mode='r', encoding='utf-8') as f:
        colors_css = f.read()
    templates_path = os.path.join(
        terminal_app_path, 'plugins', 'logging', 'templates')
    asis = lambda x: x # Used to disable autoescape
    loader = tornado.template.Loader(templates_path, autoescape="asis")
    playback_template = loader.load('playback_log.html')
    metadata = get_log_metadata(golog_path)
    rows = metadata.get('rows', 24)
    cols = metadata.get('columns', None)
    if not cols:
        # Try the old metadata format which used 'cols':
        cols = metadata.get('cols', 80)
    recording = render_log_frames(golog_path, rows, cols)
    playback_html = playback_template.generate(
        asis=asis,
        prefix=prefix,
        container=container,
        theme=theme_css,
        colors=colors_css,
        colors_256=get_256_colors(container),
        preview="false", # Only used by the logging plugin
        recording=json_encode(recording)
    )
    if not isinstance(playback_html, bytes): # It's a Unicode string
        playback_html = playback_html.encode('utf-8') # Convert to bytes
    return playback_html

def get_terminal_size():
    """
    Returns the size of the current terminal in the form of (rows, cols).
    """
    env = os.environ
    def ioctl_GWINSZ(fd):
        try:
            cr = struct.unpack('hh', fcntl.ioctl(fd, termios.TIOCGWINSZ,
        '1234'))
        except:
            return None
        return cr
    cr = ioctl_GWINSZ(0) or ioctl_GWINSZ(1) or ioctl_GWINSZ(2)
    if not cr:
        try:
            fd = os.open(os.ctermid(), os.O_RDONLY)
            cr = ioctl_GWINSZ(fd)
            os.close(fd)
        except:
            pass
    if not cr:
        try:
            cr = (env['LINES'], env['COLUMNS'])
        except:
            cr = (25, 80)
    return int(cr[0]), int(cr[1])

def main(args=sys.argv):
    """
    Parse command line arguments and view the log in the specified format.
    """
    cli_command = ""
    if sys.argv[0].endswith('gateone'):
        cli_command = "termlog "
    usage = '\t%prog {0}[options] <log file>'.format(cli_command)
    parser = OptionParser(usage=usage, version=__version__)
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
    parser.add_option("--html",
        dest="html",
        default=False,
        action="store_true",
        help=(
            "Render a given .golog as a self-contained HTML playback file "
            "(to stdout).")
    )
    parser.add_option("--metadata",
        dest="metadata",
        default=False,
        action="store_true",
        help=( "Prints (to stdout) the metadata of the given .golog")
    )
    (options, args) = parser.parse_args(args=args)
    if len(args) < 1:
        print("ERROR: You must specify a log file to view.")
        parser.print_help()
        sys.exit(1)
    if args[0].endswith('logviewer.py'):
        args.pop(0) # Didn't get filtered out automatically for some reason
    log_path = args[0]
    if not os.path.exists(log_path):
        print("ERROR: %s does not exist" % log_path)
        sys.exit(1)
    sys_stdout = sys.stdout
    if bytes != str: # Python 3
        sys_stdout = sys.stdout.buffer
    sys_stdout.flush() # Make sure it's empty before writing to the buffer
    try:
        if options.metadata:
            import json
            if curses and sys.stderr.isatty():
                try:
                    curses.setupterm()
                    print(json.dumps(get_log_metadata(log_path), indent=4))
                except Exception:
                    print(json.dumps(get_log_metadata(log_path)))
            sys.exit(0)
        elif options.flat:
            flatten_log(
                log_path,
                sys_stdout,
                preserve_renditions=options.pretty, show_esc=options.raw)
        elif options.html:
            result = render_html_playback(log_path)
            print(result)
        else:
            playback_log(log_path, sys_stdout, show_esc=options.raw)
    except (IOError, KeyboardInterrupt):
        # Move the cursor to the bottom of the screen to ensure it isn't in the
        # middle of the log playback output
        rows, cols = get_terminal_size()
        print("\x1b[%s;0H\n" % rows)
    sys.exit(0)

if __name__ == "__main__":
    main()
