# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '1.1'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 1)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
About This Module
=================
This crux of this module is the Terminal class which is a pure-Python
implementation of the quintessential Unix terminal emulator.  It does its best
to emulate an xterm and along with that comes support for the majority of the
relevant portions of ECMA-48.  This includes support for emulating varous VT-*
terminal types as well as the "linux" terminal type.

The Terminal class's VT-* emulation support is not complete but it should
suffice for most terminal emulation needs (e.g. all your typical command line
programs should work wonderfully).  If something doesn't look quite right or you
need support for certain modes added please feel free to open a ticket on Gate
One's issue tracker:  https://github.com/liftoff/GateOne/issues

Note that Terminal was written from scratch in order to be as fast as possible.
It is extensively commented and implements some interesting patterns in order to
maximize execution speed (most notably for things that loop).  Some bits of code
may seem "un-Pythonic" and/or difficult to grok but understand that this is
probably due to optimizations.  If you know "a better way" please feel free to
submit a patch, open a ticket, or send us an email.  There's a reason why open
source software is a superior development model!

Supported Emulation Types
-------------------------
Without any special mode settings or parameters Terminal should effectively
emulate the following terminal types:

 * xterm (the most important one)
 * ECMA-48/ANSI X3.64
 * Nearly all the VT-* types:  VT-52, VT-100, VT-220, VT-320, VT-420, and VT-520
 * Linux console ("linux")

If you want Terminal to support something else or it's missing a feature from
any given terminal type please `let us know <https://github.com/liftoff/GateOne/issues/new>`_.
We'll implement it!

What Terminal Doesn't Do
------------------------
The Terminal class is meant to emulate the display portion of a given terminal.
It does not translate keystrokes into escape sequences or special control
codes--you'll have to take care of that in your application (or at the
client-side like Gate One).  It does, however, keep track of many
keystroke-specific modes of operation such as Application Cursor Keys and the G0
and G1 charset modes *with* callbacks that can be used to notify your
application when such things change.

Special Considerations
----------------------
Many methods inside Terminal start with an underscore.  This was done to
indicate that such methods shouldn't be called directly (from a program that
imported the module).  If it was thought that a situation might arise where a
method could be used externally by a controlling program, the underscore was
omitted.

Asynchronous Use
----------------
To support asynchronous usage (and make everything faster), Terminal was written
to support extensive callbacks that are called when certain events are
encountered.  Here are the events and their callbacks:

.. _callback_constants:

====================================    ========================================================================
Callback Constant (ID)                  Called when...
====================================    ========================================================================
:attr:`terminal.CALLBACK_SCROLL_UP`     The terminal is scrolled up (back).
:attr:`terminal.CALLBACK_CHANGED`       The screen is changed/updated.
:attr:`terminal.CALLBACK_CURSOR_POS`    The cursor position changes.
:attr:`terminal.CALLBACK_DSR`           A Device Status Report (DSR) is requested (via the DSR escape sequence).
:attr:`terminal.CALLBACK_TITLE`         The terminal title changes (xterm-style)
:attr:`terminal.CALLBACK_BELL`          The bell character (^G) is encountered.
:attr:`terminal.CALLBACK_OPT`           The special optional escape sequence is encountered.
:attr:`terminal.CALLBACK_MODE`          The terminal mode setting changes (e.g. use alternate screen buffer).
====================================    ========================================================================

Note that CALLBACK_DSR is special in that it in most cases it will be called with arguments.  See the code for examples of how and when this happens.

Also, in most cases it is unwise to override CALLBACK_MODE since this method is primarily meant for internal use within the Terminal class.

Using Terminal
--------------
Gate One makes extensive use of the Terminal class and its callbacks.  So that's
a great place to look for specific examples (gateone.py and termio.py,
specifically).  Having said that, implementing Terminal is pretty
straightforward::

    >>> import terminal
    >>> term = terminal.Terminal(24, 80)
    >>> term.write("This text will be written to the terminal screen.")
    >>> term.dump()
    [u'This text will be written to the terminal screen.                               ',
    <snip>
    u'                                                                                ']

Here's an example with some basic callbacks:

    >>> def mycallback():
    ...     "This will be called whenever the screen changes."
    ...     print("Screen update! Perfect time to dump the terminal screen.")
    ...     print(term.dump()[0]) # Only need to see the top line for this demo =)
    ...     print("Just dumped the screen.")
    >>> import terminal
    >>> term = terminal.Terminal(24, 80)
    >>> term.callbacks[term.CALLBACK_CHANGED] = mycallback
    >>> term.write("This should result in mycallback() being called")
    Screen update! Perfect time to dump the terminal screen.
    This should result in mycallback() being called
    Just dumped the screen.

.. note:: In testing Gate One it was determined that it is faster to perform the conversion of a terminal screen to HTML on the server side than it is on the client side (via JavaScript anyway).

About The Scrollback Bufffer
----------------------------
The Terminal class implements a scrollback buffer.  Here's how it works:
Whenever a :meth:`Terminal.scroll_up` event occurs, the line (or lines) that
will be removed from the top of the screen will be placed into
:attr:`Terminal.scrollback_buf`. Then whenever :meth:`Terminal.dump_html` is
called the scrollback buffer will be returned along with the screen output and
reset to an empty state.

Why do this?  In the event that a very large :meth:`Terminal.write` occurs (e.g.
'ps aux'), it gives the controlling program the ability to capture what went
past the screen without some fancy tracking logic surrounding
:meth:`Terminal.write`.

More information about how this works can be had by looking at the
:meth:`Terminal.dump_html` function itself.

.. note:: There's more than one function that empties :attr:`Terminal.scrollback_buf` when called.  You'll just have to have a look around =)

Class Docstrings
================
"""

# Import stdlib stuff
import re, logging, base64, StringIO, codecs, unicodedata, tempfile
from array import array
from datetime import datetime, timedelta
from collections import defaultdict
from itertools import imap, izip

# Inernationalization support
import gettext
gettext.install('terminal')

# Import 3rd party stuff
try:
    # We need PIL to detect image types and get their dimensions.  Without the
    # dimenions, the browser will render the terminal screen much slower than
    # normal.  Without PIL images will be displayed simply as:
    #   <i>Image file</i>
    from PIL import Image
except ImportError:
    Image = None
    logging.warning(_(
        "Could not import the Python Imaging Library (PIL) "
        "so images will not be displayed in the terminal"))

# Globals
CALLBACK_SCROLL_UP = 1    # Called after a scroll up event (new line)
CALLBACK_CHANGED = 2      # Called after the screen is updated
CALLBACK_CURSOR_POS = 3   # Called after the cursor position is updated
# <waives hand in air> You are not concerned with the number 4
CALLBACK_DSR = 5          # Called when a DSR requires a response
# NOTE: CALLBACK_DSR must accept 'response' as either the first argument or
#       as a keyword argument.
CALLBACK_TITLE = 6        # Called when the terminal sets the window title
CALLBACK_BELL = 7         # Called after ASCII_BEL is encountered.
CALLBACK_OPT = 8 # Called when we encounter the optional ESC sequence
# NOTE: CALLBACK_OPT must accept 'chars' as either the first argument or as
#       a keyword argument.
CALLBACK_MODE = 9 # Called when the terminal mode changes (e.g. DECCKM)
CALLBACK_RESET = 10 # Called when a terminal reset (^[[!p) is encountered
CALLBACK_LEDS = 11 # Called when the state of the LEDs changes

# These are for HTML output:
RENDITION_CLASSES = defaultdict(lambda: None, {
    0: 'reset', # Special: Return everything to defaults
    1: 'bold',
    2: 'dim',
    3: 'italic',
    4: 'underline',
    5: 'blink',
    6: 'fastblink',
    7: 'reverse',
    8: 'hidden',
    9: 'strike',
    10: 'resetfont', # NOTE: The font renditions don't do anything right now
    11: 'font11', # Mostly because I have no idea what they are supposed to look
    12: 'font12', # like.
    13: 'font13',
    14: 'font14',
    15: 'font15',
    16: 'font16',
    17: 'font17',
    18: 'font18',
    19: 'font19',
    20: 'fraktur',
    21: 'boldreset',
    22: 'dimreset',
    23: 'italicreset',
    24: 'underlinereset',
    27: 'reversereset',
    28: 'hiddenreset',
    29: 'strikereset',
    # Foregrounds
    30: 'f0', # Black
    31: 'f1', # Red
    32: 'f2', # Green
    33: 'f3', # Yellow
    34: 'f4', # Blue
    35: 'f5', # Magenta
    36: 'f6', # Cyan
    37: 'f7', # White
    38: '', # 256-color support uses this like so: \x1b[38;5;<color num>sm
    # Backgrounds
    40: 'b0', # Black
    41: 'b1', # Red
    42: 'b2', # Green
    43: 'b3', # Yellow
    44: 'b4', # Blue
    45: 'b5', # Magenta
    46: 'b6', # Cyan
    47: 'b7', # White
    48: '', # 256-color support uses this like so: \x1b[48;5;<color num>sm
    49: 'backgroundreset', # Special: Set BG to default
    51: 'frame',
    52: 'encircle',
    53: 'overline',
    60: 'rightline',
    61: 'rightdoubleline',
    62: 'leftline',
    63: 'leftdoubleline',
    # aixterm colors (aka '16 color support').  They're supposed to be 'bright'
    # versions of the first 8 colors (hence the 'b').
    # 'Bright' Foregrounds
    90: 'bf0', # Bright black (whatever that is =)
    91: 'bf1', # Bright red
    92: 'bf2', # Bright green
    93: 'bf3', # Bright yellow
    94: 'bf4', # Bright blue
    95: 'bf5', # Bright magenta
    96: 'bf6', # Bright cyan
    97: 'bf7', # Bright white
    # 'Bright' Backgrounds
    100: 'bb0', # Bright black
    101: 'bb1', # Bright red
    102: 'bb2', # Bright green
    103: 'bb3', # Bright yellow
    104: 'bb4', # Bright blue
    105: 'bb5', # Bright magenta
    106: 'bb6', # Bright cyan
    107: 'bb7' # Bright white
})
# Generate the dict of 256-color (xterm) foregrounds and backgrounds
for i in xrange(256):
    RENDITION_CLASSES[(i+1000)] = "fx%s" % i
    RENDITION_CLASSES[(i+10000)] = "bx%s" % i
del i # Cleanup

try:
    unichr(0x10000) # Will throw a ValueError on narrow Python builds
    SPECIAL = 1048576 # U+100000 or unichr(SPECIAL) (start of Plane 16)
except:
    SPECIAL = 63561

def handle_special(e):
    """
    Used in conjunction with codecs.register_error, will replace special ascii
    characters such as 0xDA and 0xc4 (which are used by ncurses) with their
    Unicode equivalents.
    """
    # TODO: Get this using curses special characters when appropriate
    curses_specials = {
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
        0x60: u'◆', # ACS_DIAMOND
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
    }
    specials = {
# Note to self:  Why did I bother with these overly descriptive comments?  Ugh
# I've been staring at obscure symbols far too much lately ⨀_⨀
        128: u'€', # Euro sign
        129: u' ', # Unknown (Using non-breaking spaces for all unknowns)
        130: u'‚', # Single low-9 quotation mark
        131: u'ƒ', # Latin small letter f with hook
        132: u'„', # Double low-9 quotation mark
        133: u'…', # Horizontal ellipsis
        134: u'†', # Dagger
        135: u'‡', # Double dagger
        136: u'ˆ', # Modifier letter circumflex accent
        137: u'‰', # Per mille sign
        138: u'Š', # Latin capital letter S with caron
        139: u'‹', # Single left-pointing angle quotation
        140: u'Œ', # Latin capital ligature OE
        141: u' ', # Unknown
        142: u'Ž', #  Latin captial letter Z with caron
        143: u' ', # Unknown
        144: u' ', # Unknown
        145: u'‘', # Left single quotation mark
        146: u'’', # Right single quotation mark
        147: u'“', # Left double quotation mark
        148: u'”', # Right double quotation mark
        149: u'•', # Bullet
        150: u'–', # En dash
        151: u'—', # Em dash
        152: u'˜', # Small tilde
        153: u'™', # Trade mark sign
        154: u'š', # Latin small letter S with caron
        155: u'›', #  Single right-pointing angle quotation mark
        156: u'œ', # Latin small ligature oe
        157: u'Ø', # Upper-case slashed zero--using same as empty set (216)
        158: u'ž', # Latin small letter z with caron
        159: u'Ÿ', # Latin capital letter Y with diaeresis
        160: u' ', # Non-breaking space
        161: u'¡', # Inverted exclamation mark
        162: u'¢', # Cent sign
        163: u'£', # Pound sign
        164: u'¤', # Currency sign
        165: u'¥', # Yen sign
        166: u'¦', # Pipe, Broken vertical bar
        167: u'§', # Section sign
        168: u'¨', # Spacing diaeresis - umlaut
        169: u'©', # Copyright sign
        170: u'ª', # Feminine ordinal indicator
        171: u'«', # Left double angle quotes
        172: u'¬', # Not sign
        173: u"\u00AD", # Soft hyphen
        174: u'®', # Registered trade mark sign
        175: u'¯', # Spacing macron - overline
        176: u'°', # Degree sign
        177: u'±', # Plus-or-minus sign
        178: u'²', # Superscript two - squared
        179: u'³', # Superscript three - cubed
        180: u'´', # Acute accent - spacing acute
        181: u'µ', # Micro sign
        182: u'¶', # Pilcrow sign - paragraph sign
        183: u'·', # Middle dot - Georgian comma
        184: u'¸', # Spacing cedilla
        185: u'¹', # Superscript one
        186: u'º', # Masculine ordinal indicator
        187: u'»', # Right double angle quotes
        188: u'¼', # Fraction one quarter
        189: u'½', # Fraction one half
        190: u'¾', # Fraction three quarters
        191: u'¿', # Inverted question mark
        192: u'À', # Latin capital letter A with grave
        193: u'Á', # Latin capital letter A with acute
        194: u'Â', # Latin capital letter A with circumflex
        195: u'Ã', # Latin capital letter A with tilde
        196: u'Ä', # Latin capital letter A with diaeresis
        197: u'Å', # Latin capital letter A with ring above
        198: u'Æ', # Latin capital letter AE
        199: u'Ç', # Latin capital letter C with cedilla
        200: u'È', # Latin capital letter E with grave
        201: u'É', # Latin capital letter E with acute
        202: u'Ê', # Latin capital letter E with circumflex
        203: u'Ë', # Latin capital letter E with diaeresis
        204: u'Ì', # Latin capital letter I with grave
        205: u'Í', # Latin capital letter I with acute
        206: u'Î', # Latin capital letter I with circumflex
        207: u'Ï', # Latin capital letter I with diaeresis
        208: u'Ð', # Latin capital letter ETH
        209: u'Ñ', # Latin capital letter N with tilde
        210: u'Ò', # Latin capital letter O with grave
        211: u'Ó', # Latin capital letter O with acute
        212: u'Ô', # Latin capital letter O with circumflex
        213: u'Õ', # Latin capital letter O with tilde
        214: u'Ö', # Latin capital letter O with diaeresis
        215: u'×', # Multiplication sign
        216: u'Ø', # Latin capital letter O with slash (aka "empty set")
        217: u'Ù', # Latin capital letter U with grave
        218: u'Ú', # Latin capital letter U with acute
        219: u'Û', # Latin capital letter U with circumflex
        220: u'Ü', # Latin capital letter U with diaeresis
        221: u'Ý', # Latin capital letter Y with acute
        222: u'Þ', # Latin capital letter THORN
        223: u'ß', # Latin small letter sharp s - ess-zed
        224: u'à', # Latin small letter a with grave
        225: u'á', # Latin small letter a with acute
        226: u'â', # Latin small letter a with circumflex
        227: u'ã', # Latin small letter a with tilde
        228: u'ä', # Latin small letter a with diaeresis
        229: u'å', # Latin small letter a with ring above
        230: u'æ', # Latin small letter ae
        231: u'ç', # Latin small letter c with cedilla
        232: u'è', # Latin small letter e with grave
        233: u'é', # Latin small letter e with acute
        234: u'ê', # Latin small letter e with circumflex
        235: u'ë', # Latin small letter e with diaeresis
        236: u'ì', # Latin small letter i with grave
        237: u'í', # Latin small letter i with acute
        238: u'î', # Latin small letter i with circumflex
        239: u'ï', # Latin small letter i with diaeresis
        240: u'ð', # Latin small letter eth
        241: u'ñ', # Latin small letter n with tilde
        242: u'ò', # Latin small letter o with grave
        243: u'ó', # Latin small letter o with acute
        244: u'ô', # Latin small letter o with circumflex
        245: u'õ', # Latin small letter o with tilde
        246: u'ö', # Latin small letter o with diaeresis
        247: u'÷', # Division sign
        248: u'ø', # Latin small letter o with slash
        249: u'ù', # Latin small letter u with grave
        250: u'ú', # Latin small letter u with acute
        251: u'û', # Latin small letter u with circumflex
        252: u'ü', # Latin small letter u with diaeresis
        253: u'ý', # Latin small letter y with acute
        254: u'þ', # Latin small letter thorn
        255: u'ÿ', # Latin small letter y with diaeresis
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

# TODO List:
#
#   * We need unit tests!

# Helper functions
def _reduce_renditions(renditions):
    """
    Takes a list, *renditions*, and reduces it to its logical equivalent (as
    far as renditions go).  Example::

        [0, 32, 0, 34, 0, 32]

    Would become::

        [0, 32]

    Other Examples::

        [0, 1, 36, 36]      ->  [0, 1, 36]
        [0, 30, 42, 30, 42] ->  [0, 30, 42]
        [36, 32, 44, 42]    ->  [32, 42]
        [36, 35]            ->  [35]
    """
    out_renditions = []
    foreground = None
    background = None
    for i, rend in enumerate(renditions):
        if rend < 29:
            if rend not in out_renditions:
                out_renditions.append(rend)
        elif rend > 29 and rend < 40:
            # Regular 8-color foregrounds
            foreground = rend
        elif rend > 39 and rend < 50:
            # Regular 8-color backgrounds
            background = rend
        elif rend > 91 and rend < 98:
            # 'Bright' (16-color) foregrounds
            foreground = rend
        elif rend > 99 and rend < 108:
            # 'Bright' (16-color) backgrounds
            background = rend
        elif rend > 1000 and rend < 10000:
            # 256-color foregrounds
            foreground = rend
        elif rend > 10000 and rend < 20000:
            # 256-color backgrounds
            background = rend
        else:
            out_renditions.append(rend)
    if foreground:
        out_renditions.append(foreground)
    if background:
        out_renditions.append(background)
    return out_renditions

def pua_counter():
    """
    A generator that returns a Unicode Private Use Area (PUA) character starting
    at the beginning of Plane 16 (U+100000); counting up by one with each
    successive call.  If this is a narrow Python build the tail end of Plane 15
    will be used as a fallback (with a lot less characters).

    .. note:: Meant to be used as references to image objects in the screen array()
    """
    if SPECIAL == 1048576: # Not a narrow build of Python
        n = SPECIAL # U+100000 or unichr(SPECIAL) (start of Plane 16)
        while True:
            yield unichr(n)
            if n == 1114111:
                n = SPECIAL # Reset--would be impressive to make it this far!
            else:
                n += 1
    else:
        # This Python build is 'narrow' so we have to settle for less
        # Hopefully no real-world terminal will actually want to use one of
        # these characters.  In my research I couldn't find a font that used
        # them.  Please correct me if I'm wrong!
        n = SPECIAL # u'\uf849'
        while True:
            yield unichr(n)
            if n == 63717: # The end of nothing-but-block-chars in Plane 15
                n = SPECIAL # Reset
            else:
                n += 1

class Terminal(object):
    """
    Terminal controller class.
    """
    ASCII_NUL = 0     # Null
    ASCII_BEL = 7     # Bell (BEL)
    ASCII_BS = 8      # Backspace
    ASCII_HT = 9      # Horizontal Tab
    ASCII_LF = 10     # Line Feed
    ASCII_VT = 11     # Vertical Tab
    ASCII_FF = 12     # Form Feed
    ASCII_CR = 13     # Carriage Return
    ASCII_SO = 14     # Ctrl-N; Shift out (switches to the G0 charset)
    ASCII_SI = 15     # Ctrl-O; Shift in (switches to the G1 charset)
    ASCII_XON = 17    # Resume Transmission
    ASCII_XOFF = 19   # Stop Transmission or Ignore Characters
    ASCII_CAN = 24    # Cancel Escape Sequence
    ASCII_SUB = 26    # Substitute: Cancel Escape Sequence and replace with ?
    ASCII_ESC = 27    # Escape
    ASCII_CSI = 155   # Control Sequence Introducer (that nothing uses)
    ASCII_HTS = 210   # Horizontal Tab Stop (HTS)

    charsets = {
        'B': {}, # Default: USA
        '0': { # Line drawing mode
            95: u' ',
            96: u'◆',
            97: u'▒',
            98: u'\t',
            99: u'\x0c',
            100: u'\r',
            101: u'\n',
            102: u'°',
            103: u'±',
            104: u'\n',
            105: u'\x0b',
            106: u'┘',
            107: u'┐',
            108: u'┌',
            109: u'└',
            110: u'┼',
            111: u'⎺', # All these bars and not a drink!
            112: u'⎻',
            113: u'─',
            114: u'⎼',
            115: u'⎽',
            116: u'├',
            117: u'┤',
            118: u'┴',
            119: u'┬',
            120: u'│',
            121: u'≤',
            122: u'≥',
            123: u'π',
            124: u'≠',
            125: u'£',
            126: u'·' # Centered dot--who comes up with this stuff?!?
        }
    }

    RE_CSI_ESC_SEQ = re.compile(r'\x1B\[([?A-Za-z0-9;@:\!]*)([A-Za-z@_])')
    RE_ESC_SEQ = re.compile(r'\x1b(.*\x1b\\|[ABCDEFGHIJKLMNOQRSTUVWXYZa-z0-9=<>]|[()# %*+].)')
    RE_TITLE_SEQ = re.compile(r'\x1b\][0-2]\;(.*?)(\x07|\x1b\\)')
    # The below regex is used to match our optional (non-standard) handler
    RE_OPT_SEQ = re.compile(r'\x1b\]_\;(.+?)(\x07|\x1b\\)')
    RE_NUMBERS = re.compile('\d*') # Matches any number

    def __init__(self, rows=24, cols=80, em_dimensions=None):
        """
        Initializes the terminal by calling *self.initialize(rows, cols)*.  This
        is so we can have an equivalent function in situations where __init__()
        gets overridden.

        If *em_dimensions* are provided they will be used to determine how many
        lines images will take when they're drawn in the terminal.  This is to
        prevent images that are written to the top of the screen from having
        their tops cut off.  *em_dimensions* should be a dict in the form of::

            {'height': <px>, 'width': <px>}
        """
        self.initialize(rows, cols, em_dimensions)

    def initialize(self, rows=24, cols=80, em_dimensions=None):
        """
        Initializes the terminal (the actual equivalent to :meth:`__init__`).
        """
        self.cols = cols
        self.rows = rows
        self.em_dimensions = em_dimensions
        self.scrollback_buf = []
        self.scrollback_renditions = []
        self.title = "Gate One"
        # This variable can be referenced by programs implementing Terminal() to
        # determine if anything has changed since the last dump*()
        self.modified = False
        self.local_echo = True
        self.esc_buffer = '' # For holding escape sequences as they're typed.
        self.show_cursor = True
        self.cursor_home = 0
        self.cur_rendition = unichr(SPECIAL) # Should always be reset ([0])
        self.init_screen()
        self.init_renditions()
        self.G0_charset = self.charsets['B']
        self.G1_charset = self.charsets['B']
        self.current_charset = 0
        self.charset = self.G0_charset
        self.set_G0_charset('B')
        self.set_G1_charset('B')
        self.use_g0_charset()
        # Set the default window margins
        self.top_margin = 0
        self.bottom_margin = self.rows - 1
        self.timeout_image = None
        self.specials = {
            self.ASCII_NUL: self.__ignore,
            self.ASCII_BEL: self.bell,
            self.ASCII_BS: self.backspace,
            self.ASCII_HT: self.horizontal_tab,
            self.ASCII_LF: self.linefeed,
            self.ASCII_VT: self.linefeed,
            self.ASCII_FF: self.linefeed,
            self.ASCII_CR: self._carriage_return,
            self.ASCII_SO: self.use_g1_charset,
            self.ASCII_SI: self.use_g0_charset,
            self.ASCII_XON: self._xon,
            self.ASCII_CAN: self._cancel_esc_sequence,
            self.ASCII_XOFF: self._xoff,
            #self.ASCII_ESC: self._sub_esc_sequence,
            self.ASCII_ESC: self._escape,
            self.ASCII_CSI: self._csi,
        }
        self.esc_handlers = {
            # TODO: Make a different set of these for each respective emulation mode (VT-52, VT-100, VT-200, etc etc)
            '#': self._set_line_params, # Varies
            '\\': self._string_terminator, # ST
            'c': self.clear_screen, # Reset terminal
            'D': self.__ignore, # Move/scroll window up one line    IND
            'M': self.reverse_linefeed, # Move/scroll window down one line RI
            'E': self.next_line, # Move to next line NEL
            'F': self.__ignore, # Enter Graphics Mode
            'G': self.next_line, # Exit Graphics Mode
            '6': self._dsr_get_cursor_position, # Get cursor position   DSR
            '7': self.save_cursor_position, # Save cursor position and attributes   DECSC
            '8': self.restore_cursor_position, # Restore cursor position and attributes   DECSC
            'H': self._set_tabstop, # Set a tab at the current column   HTS
            'I': self.reverse_linefeed,
            '(': self.set_G0_charset, # Designate G0 Character Set
            ')': self.set_G1_charset, # Designate G1 Character Set
            'N': self.__ignore, # Set single shift 2    SS2
            'O': self.__ignore, # Set single shift 3    SS3
            '5': self._device_status_report, # Request: Device status report DSR
            '0': self.__ignore, # Response: terminal is OK  DSR
            'P': self._dcs_handler, # Device Control String  DCS
            # NOTE: = and > are ignored because the user can override/control
            # them via the numlock key on their keyboard.  To do otherwise would
            # just confuse people.
            '=': self.__ignore, # Application Keypad  DECPAM
            '>': self.__ignore, # Exit alternate keypad mode
            '<': self.__ignore, # Exit VT-52 mode
        }
        self.csi_handlers = {
            'A': self.cursor_up,
            'B': self.cursor_down,
            'C': self.cursor_right,
            'D': self.cursor_left,
            'E': self.cursor_next_line, # NOTE: Not the same as next_line()
            'F': self.cursor_previous_line,
            'G': self.cursor_horizontal_absolute,
            'H': self.cursor_position,
            'L': self.insert_line,
            'M': self.delete_line,
            #'b': self.repeat_last_char, # TODO
            'c': self._csi_device_status_report, # Device status report (DSR)
            'g': self.__ignore, # TODO: Tab clear
            'h': self.set_expanded_mode,
            'l': self.reset_expanded_mode,
            'f': self.cursor_position,
            'd': self.cursor_position_vertical, # Vertical Line Position Absolute (VPA)
            #'e': self.cursor_position_vertical_relative, # VPR TODO
            'J': self.clear_screen_from_cursor,
            'K': self.clear_line_from_cursor,
            'S': self.scroll_up,
            'T': self.scroll_down,
            's': self.save_cursor_position,
            'u': self.restore_cursor_position,
            'm': self._set_rendition,
            'n': self.__ignore, # <ESC>[6n is the only one I know of (request cursor position)
            #'m': self.__ignore, # For testing how much CPU we save when not processing CSI
            'p': self.reset, # TODO: "!p" is "Soft terminal reset".  Also, "Set conformance level" (VT100, VT200, or VT300)
            'r': self._set_top_bottom, # DECSTBM (used by many apps)
            'q': self.set_led_state, # Seems a bit silly but you never know
            'P': self.delete_characters, # DCH Deletes the specified number of chars
            'X': self._erase_characters, # ECH Same as DCH but also deletes renditions
            'Z': self.insert_characters, # Inserts the specified number of chars
            '@': self.insert_characters, # Inserts the specified number of chars
            #'`': self._char_position_row, # Position cursor (row only)
            #'t': self.window_manipulation, # TODO
            #'z': self.locator, # TODO: DECELR "Enable locator reporting"
        }
        self.expanded_modes = {
            # Expanded modes take a True/False argument for set/reset
            '1': self.set_application_mode,
            '2': self.__ignore, # DECANM and set VT100 mode
            '3': self.__ignore, # 132 Column Mode (DECCOLM)
            '4': self.__ignore, # Smooth (Slow) Scroll (DECSCLM)
            '5': self.__ignore, # Reverse video (might support in future)
            '6': self.__ignore, # Origin Mode (DECOM)
            '7': self.__ignore, # Wraparound Mode (DECAWM)
            '8': self.__ignore, # Auto-repeat Keys (DECARM)
            '9': self.__ignore, # Send Mouse X & Y on button press (maybe)
            '12': self.send_receive_mode, # SRM
            '18': self.__ignore, # Print form feed (DECPFF)
            '19': self.__ignore, # Set print extent to full screen (DECPEX)
            '25': self.show_hide_cursor,
            '38': self.__ignore, # Enter Tektronix Mode (DECTEK)
            '41': self.__ignore, # more(1) fix (whatever that is)
            '42': self.__ignore, # Enable Nation Replacement Character sets (DECNRCM)
            '44': self.__ignore, # Turn On Margin Bell
            '45': self.__ignore, # Reverse-wraparound Mode
            '46': self.__ignore, # Start Logging (Hmmm)
            '47': self.toggle_alternate_screen_buffer, # Use Alternate Screen Buffer
            '66': self.__ignore, # Application keypad (DECNKM)
            '67': self.__ignore, # Backarrow key sends delete (DECBKM)
            '1000': self.__ignore, # Send Mouse X/Y on button press and release
            '1001': self.__ignore, # Use Hilite Mouse Tracking
            '1002': self.__ignore, # Use Cell Motion Mouse Tracking
            '1003': self.__ignore, # Use All Motion Mouse Tracking
            '1010': self.__ignore, # Scroll to bottom on tty output
            '1011': self.__ignore, # Scroll to bottom on key press
            '1035': self.__ignore, # Enable special modifiers for Alt and NumLock keys
            '1036': self.__ignore, # Send ESC when Meta modifies a key
            '1037': self.__ignore, # Send DEL from the editing-keypad Delete key
            '1047': self.__ignore, # Use Alternate Screen Buffer
            '1048': self.__ignore, # Save cursor as in DECSC
            '1049': self.toggle_alternate_screen_buffer_cursor, # Save cursor as in DECSC and use Alternate Screen Buffer, clearing it first
            '1051': self.__ignore, # Set Sun function-key mode
            '1052': self.__ignore, # Set HP function-key mode
            '1060': self.__ignore, # Set legacy keyboard emulation (X11R6)
            '1061': self.__ignore, # Set Sun/PC keyboard emulation of VT220 keyboard
        }
        self.callbacks = {
            CALLBACK_SCROLL_UP: {},
            CALLBACK_CHANGED: {},
            CALLBACK_CURSOR_POS: {},
            CALLBACK_DSR: {},
            CALLBACK_TITLE: {},
            CALLBACK_BELL: {},
            CALLBACK_OPT: {},
            CALLBACK_MODE: {},
            CALLBACK_RESET: {},
            CALLBACK_LEDS: {},
        }
        self.leds = {
            1: False,
            2: False,
            3: False,
            4: False
        }
        png_header = re.compile('.*\x89PNG\r', re.DOTALL)
        png_whole = re.compile('\x89PNG\r.+IEND\xaeB`\x82', re.DOTALL)
        # NOTE: Only matching JFIF and Exif JPEGs because "\xff\xd8" is too
        # ambiguous.
        jpeg_header = re.compile('.*\xff\xd8\xff.+JFIF\x00|.*\xff\xd8\xff.+Exif\x00', re.DOTALL)
        jpeg_whole = re.compile(
            '\xff\xd8\xff.+JFIF\x00.+\xff\xd9(?!\xff)|\xff\xd8\xff.+Exif\x00.+\xff\xd9(?!\xff)', re.DOTALL)
        self.magic = {
            # Dict for magic "numbers" so we can tell when a particular type of
            # file begins and ends (so we can capture it in binary form and
            # later dump it out via dump_html())
            # The format is 'beginning': 'whole'
            png_header: png_whole,
            jpeg_header: jpeg_whole,
        }
        self.matched_header = None
        # These are for saving self.screen and self.renditions so we can support
        # an "alternate buffer"
        self.alt_screen = None
        self.alt_renditions = None
        self.alt_cursorX = 0
        self.alt_cursorY = 0
        self.saved_cursorX = 0
        self.saved_cursorY = 0
        self.saved_rendition = [None]
        self.application_keys = False
        self.image = ""
        self.images = {}
        self.image_counter = pua_counter()
        # This is for creating a new point of reference every time there's a new
        # unique rendition at a given coordinate
        self.rend_counter = pua_counter()
        # Used for mapping unicode chars to acutal renditions (to save memory):
        self.renditions_store = {
            u' ': [0], # Nada, nothing, no rendition.  Not the same as below
            self.rend_counter.next(): [0] # Default is actually reset
        }
        self.prev_dump = [] # A cache to speed things up
        self.prev_dump_rend = [] # Ditto
        self.html_cache = [] # Ditto
        self.watcher = None # Placeholder for the image watcher thread (if used)

    def init_screen(self):
        """
        Fills :attr:`screen` with empty lines of (unicode) spaces using
        :attr:`self.cols` and :attr:`self.rows` for the dimensions.

        .. note:: Just because each line starts out with a uniform length does not mean it will stay that way.  Processing of escape sequences is handled when an output function is called.
        """
        logging.debug('init_screen()')
        self.screen = [array('u', u' ' * self.cols) for a in xrange(self.rows)]
        # Tabstops
        tabs, remainder = divmod(self.cols, 8) # Default is every 8 chars
        self.tabstops = [(a*8)-1 for a in xrange(tabs)]
        self.tabstops[0] = 0 # Fix the first tabstop (which will be -1)
        # Base cursor position
        self.cursorX = 0
        self.cursorY = 0
        self.rendition_set = False
        self.prev_dump = [] # Force a full dump with an init
        self.prev_dump_rend = []
        self.html_cache = [] # Force this to be reset as well

    def init_renditions(self, rendition=unichr(SPECIAL)):
        """
        Replaces :attr:`self.renditions` with arrays of *rendition* (characters)
        using :attr:`self.cols` and :attr:`self.rows` for the dimenions.
        """
        # The actual renditions at various coordinates:
        self.renditions = [
            array('u', rendition * self.cols) for a in xrange(self.rows)]

    def init_scrollback(self):
        """
        Empties the scrollback buffers (:attr:`self.scrollback_buf` and
        :attr:`self.scrollback_renditions`).
        """
        # Close any image files that might be associated with characters
        self.scrollback_buf = []
        self.scrollback_renditions = []

    def add_callback(self, event, callback, identifier=None):
        """
        Attaches the given *callback* to the given *event*.  If given,
        *identifier* can be used to reference this callback leter (e.g. when you
        want to remove it).  Otherwise an identifier will be generated
        automatically.  If the given *identifier* is already attached to a
        callback at the given event that callback will be replaced with
        *callback*.

            :event: The numeric ID of the event you're attaching *callback* to. The :ref:`callback constants <callback_constants>` should be used as the numerical IDs.
            :callback: The function you're attaching to the *event*.
            :identifier: A string or number to be used as a reference point should you wish to remove or update this callback later.

        Returns the identifier of the callback.  to Example::

            >>> term = Terminal()
            >>> def somefunc(): pass
            >>> id = "myref"
            >>> ref = term.add_callback(term.CALLBACK_BELL, somefunc, id)

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

            >>> term.remove_callback(CALLBACK_BELL, "myref")
        """
        del self.callbacks[event][identifier]

    def remove_all_callbacks(self, identifier):
        """
        Removes all callbacks associated with *identifier*.
        """
        for event, identifiers in self.callbacks.items():
            try:
                del self.callbacks[event][identifier]
            except KeyError:
                pass # No match, no biggie

    def reset(self, *args, **kwargs):
        """
        Resets the terminal back to an empty screen with all defaults.  Calls
        :meth:`Terminal.callbacks[CALLBACK_RESET]` when finished.

        .. note:: If terminal output has been suspended (e.g. via ctrl-s) this will not un-suspend it (you need to issue ctrl-q to the underlying program to do that).
        """
        self.leds = {
            1: False,
            2: False,
            3: False,
            4: False
        }
        self.local_echo = True
        self.title = "Gate One"
        self.esc_buffer = ''
        self.show_cursor = True
        self.rendition_set = False
        self.G0_charset = 'B'
        self.current_charset = self.charsets['B']
        self.top_margin = 0
        self.bottom_margin = self.rows - 1
        self.alt_screen = None
        self.alt_renditions = None
        self.alt_cursorX = 0
        self.alt_cursorY = 0
        self.saved_cursorX = 0
        self.saved_cursorY = 0
        self.saved_rendition = [None]
        self.application_keys = False
        self.init_screen()
        self.init_renditions()
        self.init_scrollback()
        self.prev_dump = []
        self.prev_dump_rend = []
        self.html_cache = []
        try:
            self.callbacks[CALLBACK_RESET]()
        except TypeError:
            pass

    def __ignore(self, *args, **kwargs):
        """
        Does nothing (on purpose!).  Used as a placeholder for unimplemented
        functions.
        """
        pass

    def resize(self, rows, cols, em_dimensions=None):
        """
        Resizes the terminal window, adding or removing *rows* or *cols* as
        needed.  If *em_dimensions* are provided they will be stored in
        *self.em_dimensions* (which is currently only used by image output).
        """
        logging.debug("resize(%s, %s)" % (rows, cols))
        if em_dimensions:
            self.em_dimensions = em_dimensions
        if rows == self.rows and cols == self.cols:
            return # Nothing to do--don't mess with the margins or the cursor
        if rows < self.rows: # Remove rows from the top
            for i in xrange(self.rows - rows):
                self.screen.pop(0)
                self.renditions.pop(0)
        elif rows > self.rows: # Add rows at the bottom
            for i in xrange(rows - self.rows):
                line = array('u', u' ' * self.cols)
                renditions = array('u', unichr(SPECIAL) * self.cols)
                self.screen.append(line)
                self.renditions.append(renditions)
        self.rows = rows
        self.top_margin = 0
        self.bottom_margin = self.rows - 1

        # Fix the cursor location:
        if self.cursorY >= self.rows:
            self.cursorY = self.rows - 1

        if cols < self.cols: # Remove cols to the right
            for i in xrange(self.rows):
                self.screen[i] = self.screen[i][:cols - self.cols]
                self.renditions[i] = self.renditions[i][:cols - self.cols]
        elif cols > self.cols: # Add cols to the right
            for i in xrange(self.rows):
                for j in xrange(cols - self.cols):
                    self.screen[i].append(u' ')
                    self.renditions[i].append(unichr(SPECIAL))
        self.cols = cols

        # Fix the cursor location:
        if self.cursorX >= self.cols:
            self.cursorX = self.cols - 1
        self.rendition_set = False

    def _set_top_bottom(self, settings):
        """
        DECSTBM - Sets :attr:`self.top_margin` and :attr:`self.bottom_margin`
        using the provided settings in the form of '<top_margin>;<bottom_margin>'.

        .. note:: This also handles restore/set "DEC Private Mode Values".
        """
        logging.debug("_set_top_bottom(%s)" % settings)
        # NOTE: Used by screen and vi so this needs to work and work well!
        if len(settings):
            if settings.startswith('?'):
                # This is a set/restore DEC PMV sequence
                return # Ignore (until I figure out what this should do)
            top, bottom = settings.split(';')
            self.top_margin = max(0, int(top) - 1) # These are 0-based
            if bottom:
                self.bottom_margin = min(self.rows - 1, int(bottom) - 1)
        else:
            # Reset to defaults (full screen margins)
            self.top_margin, self.bottom_margin = 0, self.rows - 1

    def get_cursor_position(self):
        """
        Returns the current cursor positition as a tuple::

            (row, col)
        """
        return (self.cursorY, self.cursorX)

    def set_title(self, title):
        """
        Sets :attr:`self.title` to *title* and executes
        :meth:`Terminal.callbacks[CALLBACK_TITLE]`
        """
        self.title = title
        try:
            for callback in self.callbacks[CALLBACK_TITLE].values():
                callback()
        except TypeError as e:
            logging.error(_("Got TypeError on CALLBACK_TITLE..."))
            logging.error(repr(self.callbacks[CALLBACK_TITLE]))
            logging.error(e)

    def get_title(self):
        """Returns :attr:`self.title`"""
        return self.title

# TODO: put some logic in these save/restore functions to walk the current
# rendition line to come up with a logical rendition for that exact spot.
    def save_cursor_position(self, mode=None):
        """
        Saves the cursor position and current rendition settings to
        :attr:`self.saved_cursorX`, :attr:`self.saved_cursorY`, and
        :attr:`self.saved_rendition`

        .. note:: Also handles the set/restore "Private Mode Settings" sequence.
        """
        if mode: # Set DEC private mode
            # TODO: Need some logic here to save the current expanded mode
            #       so we can restore it in _set_top_bottom().
            self.set_expanded_mode(mode)
        # NOTE: args and kwargs are here to make sure we don't get an exception
        #       when we're called via escape sequences.
        self.saved_cursorX = self.cursorX
        self.saved_cursorY = self.cursorY
        self.saved_rendition = self.renditions[self.cursorY][self.cursorX]

    def restore_cursor_position(self, *args, **kwargs):
        """
        Restores the cursor position and rendition settings from
        :attr:`self.saved_cursorX`, :attr:`self.saved_cursorY`, and
        :attr:`self.saved_rendition` (if they're set).
        """
        if self.saved_cursorX and self.saved_cursorY:
            self.cursorX = self.saved_cursorX
            self.cursorY = self.saved_cursorY
            self.renditions[self.cursorY][self.cursorX] = self.saved_rendition

    def _dsr_get_cursor_position(self):
        """
        Returns the current cursor positition as a DSR response in the form of::

            '\x1b<self.cursorY>;<self.cursorX>R'

        Also executes CALLBACK_DSR with the same output as the first argument.
        Example::

            self.callbacks[CALLBACK_DSR]('\x1b20;123R')
        """
        esc_cursor_pos = '\x1b%s;%sR' % (self.cursorY, self.cursorX)
        try:
            for callback in self.callbacks[CALLBACK_DSR].values():
                callback(esc_cursor_pos)
        except TypeError:
            pass
        return esc_cursor_pos

    def _dcs_handler(self, string=None):
        """
        Handles Device Control String sequences.  Unimplemented.  Probablye not
        appropriate for Gate One.  If you believe this to be false please open
        a ticket in the issue tracker.
        """
        pass
        #print("TODO: Handle this DCS: %s" % string)

    def _set_line_params(self, param):
        """
        This function handles the control sequences that set double and single
        line heights and widths.  It also handles the "screen alignment test" (
        fill the screen with Es).

        .. note:: Double-line height text is currently unimplemented (does anything actually use it?).
        """
        try:
            param = int(param)
        except ValueError:
            logging.warning("Couldn't handle escape sequence #%s" % repr(param))
        if param == 8:
            # Screen alignment test
            self.init_renditions()
            self.screen = [
                array('u', u'E' * self.cols) for a in xrange(self.rows)]
        # TODO: Get this handling double line height stuff...  For kicks

    def set_G0_charset(self, char):
        """
        Sets the terminal's G0 (default) charset to the type specified by
        *char*.

        Here's the possibilities::

            0    DEC Special Character and Line Drawing Set
            A    United Kingdom (UK)
            B    United States (USASCII)
            4    Dutch
            C    Finnish
            5    Finnish
            R    French
            Q    French Canadian
            K    German
            Y    Italian
            E    Norwegian/Danish
            6    Norwegian/Danish
            Z    Spanish
            H    Swedish
            7    Swedish
            =    Swiss
        """
        #logging.debug("Setting G0 charset to %s" % repr(char))
        try:
            self.G0_charset = self.charsets[char]
        except KeyError:
            self.G0_charset = self.charsets['B']
        if self.current_charset == 0:
            self.charset = self.G0_charset

    def set_G1_charset(self, char):
        """
        Sets the terminal's G1 (alt) charset to the type specified by *char*.

        Here's the possibilities::

            0    DEC Special Character and Line Drawing Set
            A    United Kingdom (UK)
            B    United States (USASCII)
            4    Dutch
            C    Finnish
            5    Finnish
            R    French
            Q    French Canadian
            K    German
            Y    Italian
            E    Norwegian/Danish
            6    Norwegian/Danish
            Z    Spanish
            H    Swedish
            7    Swedish
            =    Swiss
        """
        #logging.debug("Setting G1 charset to %s" % repr(char))
        try:
            self.G1_charset = self.charsets[char]
        except KeyError:
            self.G1_charset = self.charsets['B']
        if self.current_charset == 1:
            self.charset = self.G1_charset

    def use_g0_charset(self):
        """
        Sets the current charset to G0.  This should get called when ASCII_SO
        is encountered.
        """
        #logging.debug(
            #"Switching to G0 charset (which is %s)" % repr(self.G0_charset))
        self.current_charset = 0

    def use_g1_charset(self):
        """
        Sets the current charset to G1.  This should get called when ASCII_SI
        is encountered.
        """
        #logging.debug(
            #"Switching to G1 charset (which is %s)" % repr(self.G1_charset))
        self.current_charset = 1

    def write(self, chars, special_checks=True):
        """
        Write *chars* to the terminal at the current cursor position advancing
        the cursor as it does so.  If *chars* is not unicode, it will be
        converted to unicode before being stored in self.screen.

        if *special_checks* is True (default), Gate One will perform checks for
        special things like image files coming in via *chars*.
        """
        # NOTE: This is the slowest function in all of Gate One.  All
        # suggestions on how to speed it up are welcome!

        # Speedups (don't want dots in loops if they can be avoided)
        specials = self.specials
        esc_handlers = self.esc_handlers
        csi_handlers = self.csi_handlers
        RE_ESC_SEQ = self.RE_ESC_SEQ
        RE_CSI_ESC_SEQ = self.RE_CSI_ESC_SEQ
        cursor_right = self.cursor_right
        magic = self.magic
        changed = False
        #logging.debug('handling chars: %s' % repr(chars))
        if special_checks:
            # NOTE: Special checks are limited to PNGs and JPEGs right now
            before_chars = ""
            after_chars = ""
            for magic_header in magic.keys():
                if magic_header.match(str(chars)):
                    self.matched_header = magic_header
                    self.timeout_image = datetime.now()
            if self.image or self.matched_header:
                self.image += chars
                match = magic[self.matched_header].search(self.image)
                if match:
                    #logging.debug("Matched image format.  Capturing...")
                    before_chars, after_chars = magic[
                            self.matched_header].split(self.image)
                    # Eliminate anything before the match
                    self.image = match.group()
                    self._capture_image()
                    self.image = "" # Empty it now that is is captured
                    self.matched_header = None # Ditto
                if before_chars:
                    self.write(before_chars, special_checks=False)
                if after_chars:
                    self.write(after_chars, special_checks=False)
                # If we haven't got a complete image after one second something
                # went wrong.  Discard what we've got and restart.
                one_second = timedelta(seconds=1)
                if datetime.now() - self.timeout_image > one_second:
                    self.image = "" # Empty it
                    self.matched_header = None
                    chars = _("Failed to decode image.  Buffer discarded.")
                else:
                    return
        # Have to convert to unicode
        try:
            chars = chars.decode('utf-8', "handle_special")
        except UnicodeEncodeError:
            # Just in case
            try:
                chars = chars.decode('utf-8', "ignore")
            except UnicodeEncodeError:
                logging.error(
                    _("Double UnicodeEncodeError in Terminal.terminal."))
                return
        for char in chars:
            charnum = ord(char)
            if charnum in specials:
                specials[charnum]()
            else:
                # Now handle the regular characters and escape sequences
                if self.esc_buffer: # We've got an escape sequence going on...
                    try:
                        self.esc_buffer += char
                        # First try to handle non-CSI ESC sequences (the basics)
                        match_obj = RE_ESC_SEQ.match(self.esc_buffer)
                        if match_obj:
                            seq_type = match_obj.group(1) # '\x1bA' -> 'A'
                            # Call the matching ESC handler
                            #logging.debug('ESC seq: %s' % seq_type)
                            if len(seq_type) == 1: # Single-character sequnces
                                esc_handlers[seq_type]()
                            else: # Multi-character stuff like '\x1b)B'
                                esc_handlers[seq_type[0]](seq_type[1:])
                            self.esc_buffer = '' # All done with this one
                            continue
                        # Next try to handle CSI ESC sequences
                        match_obj = RE_CSI_ESC_SEQ.match(self.esc_buffer)
                        if match_obj:
                            csi_values = match_obj.group(1) # e.g. '0;1;37'
                            csi_type = match_obj.group(2) # e.g. 'm'
                            #logging.debug(
                                #'CSI: %s, %s' % (csi_type, csi_values))
                            # Call the matching CSI handler
                            try:
                                csi_handlers[csi_type](csi_values)
                            except ValueError:
                            # Commented this out because it can be super noisy
                                #logging.error(_(
                                    #"CSI Handler Error: Type: %s, Values: %s" %
                                    #(csi_type, csi_values)
                                #))
                                pass
                            self.esc_buffer = ''
                            continue
                    except KeyError:
                        # No handler for this, try some alternatives
                        if self.esc_buffer.endswith('\x1b\\'):
                            self._osc_handler()
                        else:
                            # Commented this out because it can be super noisy
                            logging.warning(_(
                                "Warning: No ESC sequence handler for %s"
                                % `self.esc_buffer`
                            ))
                            self.esc_buffer = ''
                    continue # We're done here
# TODO: Figure out a way to write characters past the edge of the screen so that users can copy & paste without having newlines in the middle of everything.
                changed = True
                if self.cursorX >= self.cols:
                    # Start a newline but NOTE: Not really the best way to
                    # handle this because it means copying and pasting lines
                    # will end up broken into pieces of size=self.cols
                    self.newline()
                    self.cursorX = 0
                    # This actually works but until I figure out a way to
                    # get the browser to properly wrap the line without
                    # freaking out whenever someone clicks on the page it
                    # will have to stay commented.  NOTE: This might be a
                    # browser bug.
                    #self.screen[self.cursorY].append(unicode(char))
                    #self.renditions[self.cursorY].append([])
                    # To try it just uncomment the above two lines and
                    # comment out the self.newline() and self.cusorX lines
                try:
                    self.renditions[self.cursorY][
                        self.cursorX] = self.cur_rendition
                    if charnum in self.charset:
                        char = self.charset[charnum]
                        self.screen[self.cursorY][self.cursorX] = char
                    else:
                        # Double check this isn't a unicode diacritic (accent)
                        # which simply modifies the character before it
                        if unicodedata.combining(char):
                            # This is a diacritic.  Combine it with existing:
                            current = self.screen[self.cursorY][self.cursorX]
                            combined = unicodedata.normalize(
                                'NFC', u'%s%s' % (current, char))
                            self.screen[self.cursorY][self.cursorX] = combined
                        else:
                            # Normal character
                            self.screen[self.cursorY][self.cursorX] = char
                except IndexError as e:
                    # This can happen when escape sequences go haywire
                    logging.error("IndexError in write(): %s" % e)
                    pass
                cursor_right()
        if changed:
            self.modified = True
            # Execute our callbacks
            try:
                for callback in self.callbacks[CALLBACK_CHANGED].values():
                    callback()
            except TypeError:
                pass
            try:
                for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                    callback()
            except TypeError:
                pass

    def flush(self):
        """
        Only here to make Terminal compatible with programs that want to use
        file-like methods.
        """
        pass

    def scroll_up(self, n=1):
        """
        Scrolls up the terminal screen by *n* lines (default: 1). The callbacks
        CALLBACK_CHANGED and CALLBACK_SCROLL_UP are called after scrolling the
        screen.

        .. note:: This will only scroll up the region within self.top_margin and self.bottom_margin (if set).
        """
        #logging.debug("scroll_up(%s)" % n)
        for x in xrange(int(n)):
            line = self.screen.pop(self.top_margin) # Remove the top line
            self.scrollback_buf.append(line) # Add it to the scrollback buffer
            if len(self.scrollback_buf) > 1000:
                # 1000 lines ought to be enough for anybody
                self.init_scrollback()
                # NOTE:  This would only be if 1000 lines piled up before the
                # next dump_html() or dump().
            empty_line = array('u', u' ' * self.cols) # Line full of spaces
            # Add it to the bottom of the window:
            self.screen.insert(self.bottom_margin, empty_line)
            # Remove top line's style information
            style = self.renditions.pop(self.top_margin)
            self.scrollback_renditions.append(style)
            # Insert a new empty rendition as well:
            empty_line = array('u', unichr(SPECIAL) * self.cols)
            self.renditions.insert(self.bottom_margin, empty_line)
        # Execute our callback indicating lines have been updated
        try:
            for callback in self.callbacks[CALLBACK_CHANGED].values():
                callback()
        except TypeError:
            pass
        # Execute our callback to scroll up the screen
        try:
            for callback in self.callbacks[CALLBACK_SCROLL_UP].values():
                callback()
        except TypeError:
            pass

    def scroll_down(self, n=1):
        """
        Scrolls down the terminal screen by *n* lines (default: 1). The
        callbacks CALLBACK_CHANGED and CALLBACK_SCROLL_DOWN are called after
        scrolling the screen.
        """
        #logging.debug("scroll_down(%s)" % n)
        for x in xrange(int(n)):
            self.screen.pop(self.bottom_margin) # Remove the bottom line
            empty_line = array('u', u' ' * self.cols) # Line full of spaces
            self.screen.insert(self.top_margin, empty_line) # Add it to the top
            # Remove bottom line's style information:
            self.renditions.pop(self.bottom_margin)
            # Insert a new empty one:
            empty_line = array('u', unichr(SPECIAL) * self.cols)
            self.renditions.insert(self.top_margin, empty_line)
        # Execute our callback indicating lines have been updated
        try:
            for callback in self.callbacks[CALLBACK_CHANGED].values():
                callback()
        except TypeError:
            pass

        # Execute our callback to scroll up the screen
        try:
            for callback in self.callbacks[CALLBACK_SCROLL_UP].values():
                callback()
        except TypeError:
            pass

    def insert_line(self, n=1):
        """
        Inserts *n* lines at the current cursor position.
        """
        #logging.debug("insert_line(%s)" % n)
        if not n: # Takes care of an empty string
            n = 1
        n = int(n)
        for i in xrange(n):
            self.screen.pop(self.bottom_margin) # Remove the bottom line
            # Remove bottom line's style information as well:
            self.renditions.pop(self.bottom_margin)
            empty_line = array('u', u' ' * self.cols) # Line full of spaces
            self.screen.insert(self.cursorY, empty_line) # Insert at cursor
            # Insert a new empty rendition as well:
            empty_line = array('u', unichr(SPECIAL) * self.cols)
            self.renditions.insert(self.cursorY, empty_line) # Insert at cursor

    def delete_line(self, n=1):
        """
        Deletes *n* lines at the current cursor position.
        """
        #logging.debug("delete_line(%s)" % n)
        if not n: # Takes care of an empty string
            n = 1
        n = int(n)
        for i in xrange(n):
            self.screen.pop(self.cursorY) # Remove the line at the cursor
            # Remove the line's style information as well:
            self.renditions.pop(self.cursorY)
            # Now add an empty line and empty set of renditions to the bottom of
            # the view
            empty_line = array('u', u' ' * self.cols) # Line full of spaces
            # Add it to the bottom of the view:
            self.screen.insert(self.bottom_margin, empty_line) # Insert at bottom
            # Insert a new empty rendition as well:
            empty_line = array('u', unichr(SPECIAL) * self.cols)
            self.renditions.insert(self.bottom_margin, empty_line)

    def backspace(self):
        """Execute a backspace (\\x08)"""
        try:
            self.renditions[self.cursorY][self.cursorX] = u' '
        except IndexError:
            pass # At the edge, no biggie
        self.cursor_left(1)

    def horizontal_tab(self):
        """Execute horizontal tab (\\x09)"""
        next_tabstop = self.cols -1
        for tabstop in self.tabstops:
            if tabstop > self.cursorX:
                next_tabstop = tabstop
                break
        self.cursorX = next_tabstop

    def _set_tabstop(self):
        """Sets a tabstop at the current position of :attr:`self.cursorX`."""
        if self.cursorX not in self.tabstops:
            for tabstop in self.tabstops:
                if self.cursorX > tabstop:
                    self.tabstops.append(self.cursorX)
                    self.tabstops.sort() # Put them in order :)
                    break

    def linefeed(self):
        """
        LF - Executes a line feed.

        .. note:: This actually just calls :meth:`Terminal.newline`.
        """
        self.newline()

    def next_line(self):
        """
        CNL - Moves the cursor down one line to the home position.  Will not
        result in a scrolling event like newline() does.

        .. note:: This is not the same thing as :meth:`Terminal.cursor_next_line` which preserves the cursor's column position.
        """
        self.cursorX = self.cursor_home
        if self.cursorY < self.rows -1:
            self.cursorY += 1

    def reverse_linefeed(self):
        """
        RI - Executes a reverse line feed: Move the cursor up one line to the
        home position.  If the cursor move would result in going past the top
        margin of the screen (upwards) this will execute a scroll_down() event.
        """
        self.cursorX = 0
        self.cursorY -= 1
        if self.cursorY < self.top_margin:
            self.scroll_down()
            self.cursorY = self.top_margin

    def newline(self):
        """
        Increases :attr:`self.cursorY` by 1 and calls :meth:`Terminal.scroll_up`
        if that action will move the curor past :attr:`self.bottom_margin`
        (usually the bottom of the screen).
        """
        self.cursorY += 1
        if self.cursorY > self.bottom_margin:
            self.scroll_up()
            self.cursorY = self.bottom_margin
            self.clear_line()

    def _carriage_return(self):
        """
        Executes a carriage return (sets :attr:`self.cursorX` to 0).  In other
        words it moves the cursor back to position 0 on the line.
        """
        self.cursorX = 0

    def _xon(self):
        """
        Handles the XON character (stop ignoring).

        .. note:: Doesn't actually do anything (this feature was probably meant for the underlying terminal program).
        """
        logging.debug('_xon()')
        self.local_echo = True

    def _xoff(self):
        """
        Handles the XOFF character (start ignoring)

        .. note:: Doesn't actually do anything (this feature was probably meant for the underlying terminal program).
        """
        logging.debug('_xoff()')
        self.local_echo = False

    def _cancel_esc_sequence(self):
        """
        Cancels any escape sequence currently being processed.  In other words
        it empties :attr:`self.esc_buffer`.
        """
        self.esc_buffer = ''

    def _sub_esc_sequence(self):
        """
        Cancels any escape sequence currently in progress and replaces
        :attr:`self.esc_buffer` with single question mark (?).

        .. note:: Nothing presently uses this function and I can't remember what it was supposed to be part of (LOL!).  Obviously it isn't very important.
        """
        self.esc_buffer = ''
        self.write('?')

    def _escape(self):
        """
        Handles the escape character as well as escape sequences that may end
        with an escape character.
        """
        buf = self.esc_buffer
        if buf.startswith('\x1bP') or buf.startswith('\x1b]'):
            # CSRs and OSCs are special
            self.esc_buffer += '\x1b'
        else:
            # Get rid of whatever's there since we obviously didn't know what to
            # do with it
            self.esc_buffer = '\x1b'

    def _csi(self):
        """
        Marks the start of a CSI escape sequence (which is itself a character)
        by setting :attr:`self.esc_buffer` to '\\\\x1b[' (which is the CSI escape
        sequence).
        """
        self.esc_buffer = '\x1b['

    def _capture_image(self):
        """
        This gets called when an image (PNG or JPEG) was detected by
        :meth:`Terminal.write` and captured in :attr:`self.image`.  It cleans up
        the data inside :attr:`self.image` (getting rid of carriage returns) and
        stores a reference to self.image as a single character (using
        :attr:`self.image_counter`) in :attr:`self.screen` at the current cursor
        position.  The actual image will be written to disk and read on-demand
        by :meth:`self__spanify_screen` when it needs to be displayed.  The
        image on disk will be automatically removed  when it is no longer
        visible.

        It also moves the cursor to the beginning of the last line before doing
        this in order to ensure that the captured image stays within the
        browser's current window.

        .. note:: The :meth:`Terminal._spanify_screen` function is aware of this logic and knows that a 'character' in Plane 16 of the Unicode PUA indicates the presence of something like an image that needs special processing.
        """
        # Remove the extra \r's that the terminal adds:
        self.image = str(self.image).replace('\r\n', '\n')
        logging.debug("_capture_image() len(self.image): %s" % len(self.image))
        if Image: # PIL is loaded--try to guess how many lines the image takes
            i = StringIO.StringIO(self.image)
            try:
                im = Image.open(i)
            except IOError:
                # i.e. PIL couldn't identify the file
                return # Don't do anything--bad image
        else: # No PIL means no images.  Don't bother wasting memory.
            return
        ref = self.image_counter.next()
        if self.em_dimensions:
            # Make sure the image will fit properly in the screen
            width = im.size[0]
            height = im.size[1]
            if height <= self.em_dimensions['height']:
                # Fits within a line.  No need for a newline
                num_chars = int(width/self.em_dimensions['width'])
                # Put the image at the current cursor location
                self.screen[self.cursorY][self.cursorX] = ref
                # Move the cursor an equivalent number of characters
                self.cursor_right(num_chars)
            else:
                newlines = int(height/self.em_dimensions['height'])
                self.cursorX = 0
                newlines = abs(self.cursorY - newlines)
                self.newline() # Start with a newline for good measure... For
                # Some reason it seems to look better that way.
                if newlines > self.cursorY:
                    for line in xrange(newlines):
                        self.newline()
                self.screen[self.cursorY][self.cursorX] = ref
                self.newline()
        else:
            # No way to calculate the number of lines the image will take
            self.cursorY = self.rows - 1 # Move to the end of the screen
            # ... so it doesn't get cut off at the top
            self.screen[self.cursorY][self.cursorX] = ref
            self.newline() # Make some space at the bottom too just in case
            self.newline()
        # Write the image to disk in a temporary location
        self.images[ref] = tempfile.TemporaryFile()
        im.save(self.images[ref], im.format)
        self.images[ref].flush()
        # Start up the image watcher thread so leftover FDs get closed when
        # they're no longer being used
        if not self.watcher or not self.watcher.isAlive():
            import threading
            self.watcher = threading.Thread(
                name='watcher', target=self._image_fd_watcher)
            self.watcher.setDaemon(True)
            self.watcher.start()

    def _image_fd_watcher(self):
        """
        Meant to be run inside of a thread, calls close_image_fds() until there
        are no more open image file descriptors.
        """
        logging.debug("starting image_fd_watcher()")
        import time
        quitting = False
        while not quitting:
            if self.images:
                self.close_image_fds()
                time.sleep(5)
            else:
                quitting = True
        logging.debug('image_fd_watcher() quitting: No more images.')

    def close_image_fds(self):
        """
        Closes the file descriptors of any images that are no longer on the
        screen.
        """
        #logging.debug('close_image_fds()') # Commented because it's kinda noisy
        if self.images:
            for ref in self.images.keys():
                found = False
                for line in self.screen:
                    if ref in line:
                        found = True
                        break
                if self.alt_screen:
                    for line in self.alt_screen:
                        if ref in line:
                            found = True
                            break
                if not found:
                    self.images[ref].close()
                    del self.images[ref]

    def _string_terminator(self):
        """
        Handle the string terminator (ST).

        .. note:: Doesn't actually do anything at the moment.  Probably not needed since :meth:`Terminal._escape` and/or :meth:`Terminal.bell` will end up handling any sort of sequence that would end in an ST anyway.
        """
        # NOTE: Might this just call _cancel_esc_sequence?  I need to double-check.
        pass

    def _osc_handler(self):
        """
        Handles Operating System Command (OSC) escape sequences which need
        special care since they are of indeterminiate length and end with
        either a bell (\\\\x07) or a sequence terminator (\\\\x9c aka ST).  This
        will usually be called from :meth:`Terminal.bell` to set the title of
        the terminal (just like an xterm) but it is also possible to be called
        directly whenever an ST is encountered.
        """
        # Try the title sequence first
        match_obj = self.RE_TITLE_SEQ.match(self.esc_buffer)
        if match_obj:
            self.esc_buffer = ''
            title = match_obj.group(1)
            self.set_title(title) # Sets self.title
            return
        # Next try our special optional handler sequence
        match_obj = self.RE_OPT_SEQ.match(self.esc_buffer)
        if match_obj:
            self.esc_buffer = ''
            text = match_obj.group(1)
            self._opt_handler(text)
            return
        # At this point we've encountered something unusual
        #logging.warning(_("Warning: No ESC sequence handler for %s" %
            #`self.esc_buffer`))
        self.esc_buffer = ''

    def bell(self):
        """
        Handles the bell character and executes
        :meth:`Terminal.callbacks[CALLBACK_BELL]` (if we are not in the middle
        of an escape sequence that ends with a bell character =).  If we *are*
        in the middle of an escape sequence, calls :meth:`self._osc_handler`
        since we can be nearly certain that we're simply terminating an OSC
        sequence. Isn't terminal emulation grand? ⨀_⨀
        """
        # NOTE: A little explanation is in order: The bell character (\x07) by
        #       itself should play a bell (pretty straighforward).  However, if
        #       the bell character is at the tail end of a particular escape
        #       sequence (string starting with \x1b]0;) this indicates an xterm
        #       title (everything between \x1b]0;...\x07).
        if not self.esc_buffer: # We're not in the middle of an esc sequence
            try:
                for callback in self.callbacks[CALLBACK_BELL].values():
                    callback()
            except TypeError:
                pass
        else: # We're (likely) setting a title
            self.esc_buffer += '\x07' # Add the bell char so we don't lose it
            self._osc_handler()

    def _device_status_report(self):
        """
        Returns '\x1b[0n' (terminal OK) and executes:

        .. code-block:: python

            self.callbacks[CALLBACK_DSR]("\\x1b[0n")
        """
        logging.debug("_device_status_report()")
        response = u"\x1b[0n"
        try:
            for callback in self.callbacks[CALLBACK_DSR].values():
                callback(response)
        except TypeError:
            pass
        return response

    def _csi_device_status_report(self, request):
        """
        Returns '\\\\x1b[1;2c' (Meaning: I'm a vt220 terminal, version 1.0) and
        executes:

        .. code-block:: python

            self.callbacks[self.CALLBACK_DSR]("\\x1b[1;2c")
        """
        logging.debug("_csi_device_status_report()")
        response = u"\x1b[1;2c"
        try:
            for callback in self.callbacks[CALLBACK_DSR].values():
                callback(response)
        except TypeError:
            pass
        return response

    def set_expanded_mode(self, setting):
        """
        Accepts "standard mode" settings.  Typically '\\\\x1b[?25h' to hide cursor.

        Notes on modes::

            '?1h' - Application Cursor Keys
            '?5h' - DECSCNM (default off): Set reverse-video mode.
            '?12h' - Local echo (SRM or Send Receive Mode)
            '?25h' - Hide cursor
            '?1049h' - Save cursor and screen
        """
        # TODO: Add support for the following:
        # * 3: 132 column mode (might be "or greater")
        # * 4: Smooth scroll (for animations and also makes things less choppy)
        # * 5: Reverse video (should be easy: just need some extra CSS)
        # * 6: Origin mode
        # * 7: Wraparound mode
        logging.debug("set_expanded_mode(%s)" % setting)
        setting = setting[1:] # Don't need the ?
        settings = setting.split(';')
        for setting in settings:
            try:
                self.expanded_modes[setting](True)
            except (KeyError, TypeError):
                pass # Unsupported expanded mode
        try:
            for callback in self.callbacks[CALLBACK_MODE].values():
                callback(setting, True)
        except TypeError:
            pass

    def reset_expanded_mode(self, setting):
        """
        Accepts "standard mode" settings.  Typically '\\\\x1b[?25l' to show
        cursor.
        """
        logging.debug("reset_expanded_mode(%s)" % setting)
        setting = setting[1:] # Don't need the ?
        settings = setting.split(';')
        for setting in settings:
            try:
                self.expanded_modes[setting](False)
            except (KeyError, TypeError):
                pass # Unsupported expanded mode
        try:
            for callback in self.callbacks[CALLBACK_MODE].values():
                callback(setting, False)
        except TypeError:
            pass

    def set_application_mode(self, boolean):
        """
        Sets :attr:`self.application_keys` equal to *boolean*.  Literally:

        .. code-block:: python

            self.application_keys = boolean
        """
        self.application_keys = boolean

    def toggle_alternate_screen_buffer(self, alt):
        """
        If *alt* is True, copy the current screen and renditions to
        :attr:`self.alt_screen` and :attr:`self.alt_renditions` then re-init
        :attr:`self.screen` and :attr:`self.renditions`.

        If *alt* is False, restore the saved screen buffer and renditions then
        nullify :attr:`self.alt_screen` and :attr:`self.alt_renditions`.
        """
        #logging.debug('toggle_alternate_screen_buffer(%s)' % alt)
        if alt:
            # Save the existing screen and renditions
            self.alt_screen = self.screen[:]
            self.alt_renditions = self.renditions[:]
            # Make a fresh one
            self.clear_screen()
        else:
            # Restore the screen
            if self.alt_screen and self.alt_renditions:
                self.screen = self.alt_screen[:]
                self.renditions = self.alt_renditions[:]
            # Empty out the alternate buffer (to save memory)
            self.alt_screen = None
            self.alt_renditions = None
        # These all need to be reset no matter what
        self.cur_rendition = unichr(SPECIAL)
        self.prev_dump = []
        self.prev_dump_rend = []
        self.html_cache = []

    def toggle_alternate_screen_buffer_cursor(self, alt):
        """
        Same as :meth:`Terminal.toggle_alternate_screen_buffer` but also
        saves/restores the cursor location.
        """
        #logging.debug('toggle_alternate_screen_buffer_cursor(%s)' % alt)
        if alt:
            self.alt_cursorX = self.cursorX
            self.alt_cursorY = self.cursorY
        else:
            self.cursorX = self.alt_cursorX
            self.cursorY = self.alt_cursorY
        self.toggle_alternate_screen_buffer(alt)

    def show_hide_cursor(self, boolean):
        """
        Literally:

        .. code-block:: python

            self.show_cursor = boolean
        """
        self.show_cursor = boolean

    def send_receive_mode(self, onoff):
        """
        Turns on or off local echo dependong on the value of *onoff*:

        .. code-block:: python

            self.local_echo = onoff
        """
        #logging.debug("send_receive_mode(%s)" % repr(onoff))
        # This has been disabled because it might only be meant for the
        # underlying program and not the terminal emulator.  Needs research.
        #if onoff:
            #self.local_echo = False
        #else:
            #self.local_echo = True

    def insert_characters(self, n=1):
        """Inserts the specified number of characters at the cursor position."""
        #logging.debug("insert_characters(%s)" % n)
        n = int(n)
        for i in xrange(n):
            self.screen[self.cursorY].pop() # Take one down, pass it around
            self.screen[self.cursorY].insert(self.cursorX, unichr(SPECIAL))

    def delete_characters(self, n=1):
        """
        DCH - Deletes (to the left) the specified number of characters at the
        cursor position.  As characters are deleted, the remaining characters
        between the cursor and right margin move to the left. Character
        attributes (renditions) move with the characters.  The terminal adds
        blank spaces with no visual character attributes at the right margin.
        DCH has no effect outside the scrolling margins.

        .. note:: Deletes renditions too.  You'd *think* that would be in one of the VT-* manuals...  Nope!
        """
        #logging.debug("delete_characters(%s)" % n)
        if not n: # e.g. n == ''
            n = 1
        else:
            n = int(n)
        for i in xrange(n):
            try:
                self.screen[self.cursorY].pop(self.cursorX)
                self.screen[self.cursorY].append(u' ')
                self.renditions[self.cursorY].pop(self.cursorX)
                self.renditions[self.cursorY].append(unichr(SPECIAL))
            except IndexError:
                # At edge of screen, ignore
                #print('IndexError in delete_characters(): %s' % e)
                pass

    def _erase_characters(self, n=1):
        """
        Erases (to the right) the specified number of characters at the cursor
        position.

        .. note:: Deletes renditions too.
        """
        #logging.debug("_erase_characters(%s)" % n)
        if not n: # e.g. n == ''
            n = 1
        else:
            n = int(n)
        distance = self.cols - self.cursorX
        n = min(n, distance)
        for i in xrange(n):
            self.screen[self.cursorY][self.cursorX+i] = u' '
            self.renditions[self.cursorY][self.cursorX+i] = unichr(SPECIAL)

    def cursor_left(self, n=1):
        """ESCnD CUB (Cursor Back)"""
        # Commented out to save CPU (and the others below too)
        #logging.debug('cursor_left(%s)' % n)
        n = int(n)
        self.cursorX = max(0, self.cursorX - n)
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_right(self, n=1):
        """ESCnC CUF (Cursor Forward)"""
        #logging.debug('cursor_right(%s)' % n)
        if not n:
            n = 1
        n = int(n)
        self.cursorX += n
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_up(self, n=1):
        """ESCnA CUU (Cursor Up)"""
        #logging.debug('cursor_up(%s)' % n)
        if not n:
            n = 1
        n = int(n)
        self.cursorY = max(0, self.cursorY - n)
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_down(self, n=1):
        """ESCnB CUD (Cursor Down)"""
        #logging.debug('cursor_down(%s)' % n)
        if not n:
            n = 1
        n = int(n)
        self.cursorY = min(self.rows, self.cursorY + n)
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_next_line(self, n):
        """ESCnE CNL (Cursor Next Line)"""
        if not n:
            n = 1
        n = int(n)
        self.cursorY = min(self.rows, self.cursorY + n)
        self.cursorX = 0
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_previous_line(self, n):
        """ESCnF CPL (Cursor Previous Line)"""
        if not n:
            n = 1
        n = int(n)
        self.cursorY = max(0, self.cursorY - n)
        self.cursorX = 0
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_horizontal_absolute(self, n):
        """ESCnG CHA (Cursor Horizontal Absolute)"""
        if not n:
            n = 1
        n = int(n)
        self.cursorX = n - 1 # -1 because cols is 0-based
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_position(self, coordinates):
        """
        ESCnH CUP (Cursor Position).  Move the cursor to the given coordinates.

            :coordinates: Should be something like, 'row;col' (1-based) but, 'row', 'row;', and ';col' are also valid (assumes 1 on missing value).

        .. note:: If coordinates is '' (an empty string), the cursor will be moved to the top left (1;1).
        """
        # NOTE: Since this is 1-based we have to subtract 1 from everything to
        #       match how we store these values internally.
        if not coordinates:
            row, col = 0, 0
        elif ';' in coordinates:
            row, col = coordinates.split(';')
        else:
            row = coordinates
            col = 0
        try:
            row = int(row)
        except ValueError:
            row = 0
        try:
            col = int(col)
        except ValueError:
            col = 0
        # These ensure a positive integer while reducing row and col by 1:
        row = max(0, row - 1)
        col = max(0, col - 1)
        self.cursorY = row
        self.cursorX = col
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def cursor_position_vertical(self, n):
        """
        Vertical Line Position Absolute (VPA) - Moves the cursor to given line.
        """
        n = int(n)
        self.cursorY = n - 1

    def clear_screen(self):
        """
        Clears the screen.  Also used to emulate a terminal reset.

        .. note:: The current rendition (self.cur_rendition) will be applied to all characters on the screen when this function is called.
        """
        #logging.debug('clear_screen()')
        self.init_screen()
        self.init_renditions(self.cur_rendition)
        self.cursorX = 0
        self.cursorY = 0

    def clear_screen_from_cursor_down(self):
        """
        Clears the screen from the cursor down (ESC[J or ESC[0J).
        """
        #logging.debug('clear_screen_from_cursor_down()')
        self.screen[self.cursorY:] = [
            array('u', u' ' * self.cols) for a in self.screen[self.cursorY:]
        ]
        c = self.cur_rendition # Just to save space below
        self.renditions[self.cursorY:] = [
            array('u', c * self.cols) for a in self.renditions[self.cursorY:]
        ]
        self.cursorX = 0

    def clear_screen_from_cursor_up(self):
        """
        Clears the screen from the cursor up (ESC[1J).
        """
        #logging.debug('clear_screen_from_cursor_up()')
        self.screen[:self.cursorY+1] = [
            array('u', u' ' * self.cols) for a in self.screen[:self.cursorY]
        ]
        c = self.cur_rendition
        self.renditions[:self.cursorY+1] = [
            array('u', c * self.cols) for a in self.renditions[:self.cursorY]
        ]
        self.cursorX = 0
        self.cursorY = 0

    def clear_screen_from_cursor(self, n):
        """
        CSI *n* J ED (Erase Data).  This escape sequence uses the following rules:

        ======  =============================   ===
        Esc[J   Clear screen from cursor down   ED0
        Esc[0J  Clear screen from cursor down   ED0
        Esc[1J  Clear screen from cursor up     ED1
        Esc[2J  Clear entire screen             ED2
        ======  =============================   ===
        """
        #logging.debug('clear_screen_from_cursor(%s)' % n)
        try:
            n = int(n)
        except ValueError: # Esc[J
            n = 0
        clear_types = {
            0: self.clear_screen_from_cursor_down,
            1: self.clear_screen_from_cursor_up,
            2: self.clear_screen
        }
        try:
            clear_types[n]()
        except KeyError:
            logging.error(_("Error: Unsupported number for escape sequence J"))
        # Execute our callbacks
        try:
            for callback in self.callbacks[CALLBACK_CHANGED].values():
                callback()
        except TypeError:
            pass
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def clear_line_from_cursor_right(self):
        """
        Clears the screen from the cursor right (ESC[K or ESC[0K).
        """
        #logging.debug("clear_line_from_cursor_right()")
        saved = self.screen[self.cursorY][:self.cursorX]
        saved_renditions = self.renditions[self.cursorY][:self.cursorX]
        spaces = array('u', u' '*len(self.screen[self.cursorY][self.cursorX:]))
        renditions = array('u',
            self.cur_rendition * len(self.screen[self.cursorY][self.cursorX:]))
        self.screen[self.cursorY] = saved + spaces
        # Reset the cursor position's rendition to the end of the line
        self.renditions[self.cursorY] = saved_renditions + renditions

    def clear_line_from_cursor_left(self):
        """
        Clears the screen from the cursor left (ESC[1K).
        """
        #logging.debug("clear_line_from_cursor_left()")
        saved = self.screen[self.cursorY][self.cursorX:]
        saved_renditions = self.renditions[self.cursorY][self.cursorX:]
        spaces = array('u', u' '*len(self.screen[self.cursorY][:self.cursorX]))
        renditions = array('u',
            self.cur_rendition * len(self.screen[self.cursorY][self.cursorX:]))
        self.screen[self.cursorY] = spaces + saved
        self.renditions[self.cursorY] = renditions + saved_renditions

    def clear_line(self):
        """
        Clears the entire line (ESC[2K).
        """
        #logging.debug("clear_line()")
        self.screen[self.cursorY] = array('u', u' ' * self.cols)
        c = self.cur_rendition
        self.renditions[self.cursorY] = array('u', c * self.cols)
        self.cursorX = 0

    def clear_line_from_cursor(self, n):
        """
        CSI*n*K EL (Erase in Line).  This escape sequence uses the following
        rules:

        ======  ==============================  ===
        Esc[K   Clear screen from cursor right  EL0
        Esc[0K  Clear screen from cursor right  EL0
        Esc[1K  Clear screen from cursor left   EL1
        Esc[2K  Clear entire line               ED2
        ======  ==============================  ===
        """
        #logging.debug('clear_line_from_cursor(%s)' % n)
        try:
            n = int(n)
        except ValueError: # Esc[J
            n = 0
        clear_types = {
            0: self.clear_line_from_cursor_right,
            1: self.clear_line_from_cursor_left,
            2: self.clear_line
        }
        try:
            clear_types[n]()
        except KeyError:
            logging.error(_(
                "Error: Unsupported number for CSI escape sequence K"))
        # Execute our callbacks
        try:
            for callback in self.callbacks[CALLBACK_CHANGED].values():
                callback()
        except TypeError:
            pass
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def set_led_state(self, n):
        """
        Sets the values the dict, self.leds depending on *n* using the following
        rules:

        ======  ======================  ======
        Esc[0q  Turn off all four leds  DECLL0
        Esc[1q  Turn on LED #1          DECLL1
        Esc[2q  Turn on LED #2          DECLL2
        Esc[3q  Turn on LED #3          DECLL3
        Esc[4q  Turn on LED #4          DECLL4
        ======  ======================  ======

        .. note:: These aren't implemented in Gate One's GUI (yet) but they certainly kept track of!
        """
        leds = n.split(';')
        for led in leds:
            led = int(led)
            if led == 0:
                self.leds[1] = False
                self.leds[2] = False
                self.leds[3] = False
                self.leds[4] = False
            else:
                self.leds[led] = True
        try:
            for callback in self.callbacks[CALLBACK_LEDS].values():
                callback(led)
        except TypeError:
            pass

    def _set_rendition(self, n):
        """
        Sets :attr:`self.renditions[self.cursorY][self.cursorX]` equal to
        *n.split(';')*.

        *n* is expected to be a string of ECMA-48 rendition numbers separated by
        semicolons.  Example::

            '0;1;31'

        ...will result in::

            [0, 1, 31]

        Note that the numbers were converted to integers and the order was
        preserved.
        """
        #logging.debug("_set_rendition(%s)" % n)
        cursorY = self.cursorY
        cursorX = self.cursorX
        if cursorX >= self.cols: # We're at the end of the row
            if len(self.renditions[cursorY]) <= cursorX:
                # Make it all longer
                self.renditions[cursorY].append(u' ') # Make it longer
                self.screen[cursorY].append(u'\x00') # This needs to match
        if cursorY >= self.rows:
            # This should never happen
            logging.error(_(
                "cursorY >= self.rows! This should not happen! Bug!"))
            return # Don't bother setting renditions past the bottom
        if not n: # or \x1b[m (reset)
            # First char in PUA Plane 16 is always the default:
            self.cur_rendition = unichr(SPECIAL) # Should be reset (e.g. [0])
            return # No need for further processing; save some CPU
        # Convert the string (e.g. '0;1;32') to a list (e.g. [0,1,32]
        new_renditions = [int(a) for a in n.split(';') if a != '']
        # Handle 256-color renditions by getting rid of the (38|48);5 part and
        # incrementing foregrounds by 1000 and backgrounds by 10000 so we can
        # tell them apart in _spanify_screen().
        if 38 in new_renditions:
            foreground_index = new_renditions.index(38)
            if len(new_renditions[foreground_index:]) >= 2:
                if new_renditions[foreground_index+1] == 5:
                    # This is a valid 256-color rendition (38;5;<num>)
                    new_renditions.pop(foreground_index) # Goodbye 38
                    new_renditions.pop(foreground_index) # Goodbye 5
                    new_renditions[foreground_index] += 1000
        if 48 in new_renditions:
            background_index = new_renditions.index(48)
            if len(new_renditions[background_index:]) >= 2:
                if new_renditions[background_index+1] == 5:
                    # This is a valid 256-color rendition (48;5;<num>)
                    new_renditions.pop(background_index) # Goodbye 48
                    new_renditions.pop(background_index) # Goodbye 5
                    new_renditions[background_index] += 10000
        out_renditions = []
        for rend in new_renditions:
            if rend == 0:
                out_renditions = [0]
            else:
                out_renditions.append(rend)
        if out_renditions[0] == 0:
            # If it starts with 0 there's no need to combine it with the
            # previous rendition...
            reduced = _reduce_renditions(out_renditions)
            if reduced not in self.renditions_store.values():
                new_ref_point = self.rend_counter.next()
                self.renditions_store.update({new_ref_point: reduced})
                self.cur_rendition = new_ref_point
            else: # Find the right reference point to use
                for k, v in self.renditions_store.items():
                    if reduced == v:
                        self.cur_rendition = k
            return
        new_renditions = out_renditions
        cur_rendition_list = self.renditions_store[self.cur_rendition]
        reduced = _reduce_renditions(cur_rendition_list + new_renditions)
        if reduced not in self.renditions_store.values():
            new_ref_point = self.rend_counter.next()
            self.renditions_store.update({new_ref_point: reduced})
            self.cur_rendition = new_ref_point
        else: # Find the right reference point to use
            for k, v in self.renditions_store.items():
                if reduced == v:
                    self.cur_rendition = k

    def _opt_handler(self, chars):
        """
        Optional special escape sequence handler for sequences matching
        RE_OPT_SEQ.  If CALLBACK_OPT is defined it will be called like so::

            self.callbacks[CALLBACK_OPT](chars)

        Applications can use this escape sequence to define whatever special
        handlers they like.  It works like this: If an escape sequence is
        encountered matching RE_OPT_SEQ this method will be called with the
        inbetween *chars* (e.g. \x1b]_;<chars>\x07) as the argument.

        Applications can then do what they wish with *chars*.

        .. note:: I added this functionality so that plugin authors would have a mechanism to communicate with terminal applications.  See the SSH plugin for an example of how this can be done (there's channels of communication amongst ssh_connect.py, ssh.js, and ssh.py).
        """
        try:
            for callback in self.callbacks[CALLBACK_OPT].values():
                callback(chars)
        except TypeError as e:
            # High likelyhood that nothing is defined.  No biggie.
            pass

    def _spanify_screen(self):
        """
        Iterates over the lines in *screen* and *renditions*, applying HTML
        markup (span tags) where appropriate and returns the result as a list of
        lines. It also marks the cursor position via a <span> tag at the
        appropriate location.
        """
        #logging.debug("_spanify_screen()")
        results = []
        # NOTE: Why these duplicates of self.* and globals?  Local variable
        # lookups are faster--especially in loops.
        special = SPECIAL
        rendition_classes = RENDITION_CLASSES
        screen = self.screen
        renditions = self.renditions
        renditions_store = self.renditions_store
        cursorX = self.cursorX
        cursorY = self.cursorY
        if len(self.prev_dump) != len(screen):
            # Fix it to be equal--assume first time/screen reset/resize/etc
            # Just fill it with empty strings (only the length matters here)
            self.prev_dump = [[] for a in screen]
            self.prev_dump_rend = [[] for a in screen]
        # The html_cache may need to be fixed as well
        if len(self.html_cache) != len(screen):
            self.html_cache = [u'' for a in screen] # Essentially a reset
        spancount = 0
        current_classes = []
        prev_rendition = None
        foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        for linecount, line_rendition in enumerate(izip(screen, renditions)):
            line = line_rendition[0]
            rendition = line_rendition[1]
            if linecount != cursorY and self.prev_dump[linecount] == line:
                if '<span class="cursor">' not in self.html_cache[linecount]:
                    if self.prev_dump_rend[linecount] == rendition:
                        # No change since the last dump.  Use the cache...
                        results.append(self.html_cache[linecount])
                        continue # Nothing changed so move on to the next line
            outline = ""
            charcount = 0
            for char, rend in izip(line, rendition):
                rend = renditions_store[rend] # Get actual rendition
                if ord(char) >= special: # Special stuff =)
                    # Obviously, not really a single character
                    if not Image: # Can't use images in the terminal
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    image_file = self.images[char]
                    image_file.seek(0) # Back to the start
                    image_data = image_file.read()
                    # PIL likes StringIO objects for some reason
                    i = StringIO.StringIO(image_data)
                    try:
                        im = Image.open(i)
                    except IOError:
                        # i.e. PIL couldn't identify the file
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    # TODO: Make these sizes adjustable:
                    if im.size[0] > 640 or im.size[1] > 480:
                        # Probably too big to send to browser as a data URI.
                        if im: # Resize it...
                            # 640x480 should come in <32k for most stuff
                            try:
                                #image_file.seek(0)
                                im.thumbnail((640, 480), Image.ANTIALIAS)
                                im.save(image_file, im.format)
                                # Re-read it in
                                image_file.seek(0)
                                image_data = image_file.read()
                            except IOError:
                                # Sometimes PIL will throw this if it can't read
                                # the image.
                                outline += "<i>Problem displaying this image</i>"
                                continue
                        else: # Generic error
                            outline += "<i>Problem displaying this image</i>"
                            continue
                    # Need to encode base64 to create a data URI
                    encoded = base64.b64encode(image_data).replace('\n', '')
                    data_uri = "data:image/%s;base64,%s" % (
                        im.format.lower(), encoded)
                    outline += '<img src="%s" width="%s" height="%s">' % (
                        data_uri, im.size[0], im.size[1])
                    continue
                changed = True
                if char in "&<>":
                    # Have to convert ampersands and lt/gt to HTML entities
                    char = char.replace('&', '&amp;')
                    char = char.replace('<', '&lt;')
                    char = char.replace('>', '&gt;')
                if rend == prev_rendition:
                    # Shortcut...  So we can skip all the logic below
                    changed = False
                else:
                    prev_rendition = rend
                if changed and rend:
                    classes = imap(rendition_classes.get, rend)
                    for _class in classes:
                        if _class and _class not in current_classes:
                            # Something changed...  Start a new span
                            if spancount:
                                outline += "</span>"
                                spancount -= 1
                            if 'reset' in _class:
                                if _class == 'reset':
                                    current_classes = []
                                    if spancount:
                                        for i in xrange(spancount):
                                            outline += "</span>"
                                        spancount = 0
                                else:
                                    reset_class = _class.split('reset')[0]
                                    if reset_class == 'foreground':
                                        # Remove any foreground classes
                                        [current_classes.pop(i) for i, a in
                                        enumerate(current_classes) if a in
                                        foregrounds
                                        ]
                                    elif reset_class == 'background':
                                        [current_classes.pop(i) for i, a in
                                        enumerate(current_classes) if a in
                                        backgrounds
                                        ]
                                    else:
                                        try:
                                            current_classes.remove(reset_class)
                                        except ValueError:
                                            # Trying to reset something that was
                                            # never set.  Ignore
                                            pass
                            else:
                                if _class in foregrounds:
                                    [current_classes.pop(i) for i, a in
                                    enumerate(current_classes) if a in
                                    foregrounds
                                    ]
                                elif _class in backgrounds:
                                    [current_classes.pop(i) for i, a in
                                    enumerate(current_classes) if a in
                                    backgrounds
                                    ]
                                current_classes.append(_class)
                    if current_classes:
                        outline += '<span class="%s">' % " ".join(current_classes)
                        spancount += 1
                if linecount == cursorY and charcount == cursorX: # Cursor position
                    if self.show_cursor:
                        outline += '<span class="cursor">%s</span>' % char
                    else:
                        outline += char
                else:
                    outline += char
                charcount += 1
            self.prev_dump[linecount] = line[:]
            self.prev_dump_rend[linecount] = rendition[:]
            if outline:
                results.append(outline)
                self.html_cache[linecount] = outline
            else:
                results.append(None) # 'null' is shorter than 4 spaces
                self.html_cache[linecount] = None
            # NOTE: The client has been programmed to treat None (aka null in
            #       JavaScript) as blank lines.
        for whatever in xrange(spancount): # Bit of cleanup to be safe
            results[-1] += "</span>"
        return results

    def _spanify_scrollback(self):
        """
        Spanifies everything inside *screen* using *renditions*.  This differs
        from _spanify_screen() in that it doesn't apply any logic to detect the
        location of the cursor (to make it just a tiny bit faster).
        """
        # NOTE: See the comments in _spanify_screen() for details on this logic
        results = []
        special = SPECIAL
        screen = self.scrollback_buf
        renditions = self.scrollback_renditions
        rendition_classes = RENDITION_CLASSES
        renditions_store = self.renditions_store
        spancount = 0
        current_classes = []
        prev_rendition = None
        foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        for line, rendition in izip(screen, renditions):
            outline = ""
            for char, rend in izip(line, rendition):
                rend = renditions_store[rend] # Get actual rendition
                if ord(char) >= special: # Special stuff =)
                    # Obviously, not really a single character
                    if not Image: # Can't use images in the terminal
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    image_file = self.images[char]
                    image_file.seek(0) # Back to the start
                    image_data = image_file.read()
                    # PIL likes StringIO objects for some reason
                    i = StringIO.StringIO(image_data)
                    try:
                        im = Image.open(i)
                    except IOError:
                        # i.e. PIL couldn't identify the file
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    # TODO: Make these sizes adjustable:
                    if im.size[0] > 640 or im.size[1] > 480:
                        # Probably too big to send to browser as a data URI.
                        if im: # Resize it...
                            # 640x480 should come in <32k for most stuff
                            try:
                                image_file.seek(0)
                                im.thumbnail((640, 480), Image.ANTIALIAS)
                                im.save(image_file, im.format)
                                # Re-read it in
                                image_file.seek(0)
                                image_data = image_file.read()
                            except IOError:
                                # Sometimes PIL will throw this if it can't read
                                # the image.
                                outline += "<i>Problem displaying this image</i>"
                                continue
                        else: # Generic error
                            outline += "<i>Problem displaying this image</i>"
                            continue
                    # Need to encode base64 to create a data URI
                    encoded = base64.b64encode(image_data).replace('\n', '')
                    data_uri = "data:image/%s;base64,%s" % (
                        im.format.lower(), encoded)
                    outline += '<img src="%s" width="%s" height="%s">' % (
                        data_uri, im.size[0], im.size[1])
                    continue
                changed = True
                if char in "&<>":
                    # Have to convert ampersands and lt/gt to HTML entities
                    char = char.replace('&', '&amp;')
                    char = char.replace('<', '&lt;')
                    char = char.replace('>', '&gt;')
                if rend == prev_rendition:
                    changed = False
                else:
                    prev_rendition = rend
                if changed and rend != None:
                    classes = imap(rendition_classes.get, rend)
                    for _class in classes:
                        if _class and _class not in current_classes:
                            if spancount:
                                outline += "</span>"
                                spancount -= 1
                            if 'reset' in _class:
                                if _class == 'reset':
                                    current_classes = []
                                else:
                                    reset_class = _class.split('reset')[0]
                                    if reset_class == 'foreground':
                                        [current_classes.pop(i) for i, a in
                                        enumerate(current_classes) if a in
                                        foregrounds
                                        ]
                                    elif reset_class == 'background':
                                        [current_classes.pop(i) for i, a in
                                        enumerate(current_classes) if a in
                                        backgrounds
                                        ]
                                    else:
                                        try:
                                            current_classes.remove(reset_class)
                                        except ValueError:
                                            pass
                            else:
                                if _class in foregrounds:
                                    [current_classes.pop(i) for i, a in
                                    enumerate(current_classes) if a in
                                    foregrounds
                                    ]
                                elif _class in backgrounds:
                                    [current_classes.pop(i) for i, a in
                                    enumerate(current_classes) if a in
                                    backgrounds
                                    ]
                                current_classes.append(_class)
                    if current_classes:
                        outline += '<span class="%s">' % " ".join(current_classes)
                        spancount += 1
                outline += char
            if outline:
                results.append(outline)
            else:
                results.append(None)
        for whatever in xrange(spancount): # Bit of cleanup to be safe
            results[-1] += "</span>"
        return results

    def dump_html(self, renditions=True):
        """
        Dumps the terminal screen as a list of HTML-formatted lines.  If
        *renditions* is True (default) then terminal renditions will be
        converted into HTML <span> elements so they will be displayed properly
        in a browser.  Otherwise only the cursor <span> will be added to mark
        its location.

        .. note:: This places <span class="cursor">(current character)</span> around the cursor location.
        """
        if renditions: # i.e. Use stylized text
            screen = self._spanify_screen()
            scrollback = []
            if self.scrollback_buf:
                scrollback = self._spanify_scrollback()
        else:
            cursorX = self.cursorX
            cursorY = self.cursorY
            screen = []
            for y, row in enumerate(self.screen):
                if y == cursorY:
                    cursor_row = ""
                    for x, c in enumerate(row):
                        if x == cursorX:
                            cursor_row += '<span class="cursor">%s</span>' % c
                        else:
                            cursor_row += char
                    screen.append(cursor_row)
                else:
                    screen.append("".join(row))
        # Empty the scrollback buffer:
        self.init_scrollback()
        self.modified = False
        return (scrollback, screen)

    def dump_plain(self):
        """
        Dumps the screen and the scrollback buffer as-is then empties the
        scrollback buffer.
        """
        screen = self.screen
        scrollback = self.scrollback_buf
        # Empty the scrollback buffer:
        self.init_scrollback()
        self.modified = False
        return (scrollback, screen)

    def dump_components(self):
        """
        Dumps the screen and renditions as-is, the scrollback buffer as HTML,
        and the current cursor coordinates.  Also, empties the scrollback buffer

        .. note:: This was used in some performance-related experiments but might be useful for other patterns in the future so I've left it here.
        """
        screen = [a.tounicode() for a in self.screen]
        scrollback = []
        if self.scrollback_buf:
            # Process the scrollback buffer into HTML
            scrollback = self._spanify_scrollback(
                self.scrollback_buf, self.scrollback_renditions)
        # Empty the scrollback buffer:
        self.init_scrollback()
        self.modified = False
        return (scrollback, screen, self.renditions, self.cursorY, self.cursorX)

    def dump(self):
        """
        Returns self.screen as a list of strings with no formatting.
        No scrollback buffer.  No renditions.  It is meant to be used to get a
        quick glance of what is being displayed (when debugging).

        .. note:: This method does not empty the scrollback buffer.
        """
        out = []
        for line in self.screen:
            line_out = ""
            for char in line:
                if len(char) > 1: # This is an image (or similar)
                    line_out += u'⬚' # Use a dotted square as a placeholder
                else:
                    line_out += char
            out.append(line_out)
        self.modified = False
        return out

# This is here to make it easier for someone to produce an HTML app that uses
# terminal.py
def css_colors(selector=None):
    """
    Returns a (long) string containing all the CSS styles in order to support
    color in an HTML terminal using the dump_html() function.  If *selector* is
    provided, all styles will be prefixed with said selector like so::

        ${selector} span.f0 { color: #5C5C5C; }

    Example::

        >>> css_colors("#gateone").splitlines()[1]
        '#gateone span.f0 { color: #5C5C5C; } /* Black */'
    """
    from string import Template
    colors_template = Template(CSS_COLORS)
    return colors_template.substitute(selector=selector)

CSS_COLORS = """\
/* 8-color Foregrounds */
${selector} span.f0 { color: #5C5C5C; } /* Black */
${selector} span.f1 { color: #D6292C; } /* Red */
${selector} span.f2 { color: #13A110; } /* Green */
${selector} span.f3 { color: #E9E900; } /* Yellow */
${selector} span.f4 { color: #1B4CFF; } /* Blue */
${selector} span.f5 { color: #E01DC6; } /* Magenta */
${selector} span.f6 { color: #28AAA8; } /* Cyan */
${selector} span.f7 { color: #eee; } /* White */
/* 8-color Foregrounds on 8-color Backgrounds */
${selector} span.f0.b0 { color: #444; background-color: #000; } /* Black on Black */
${selector} span.f0.b1 { color: #000; background-color: #B21818; } /* Black on Red */
${selector} span.f0.b2 { color: #000; background-color: green; } /* Black on Green */
${selector} span.f0.b3 { color: #000; background-color: #FFFF00; } /* Black on Yellow */
${selector} span.f0.b4 { color: #000; background-color: #1818B2; } /* Black on Blue */
${selector} span.f0.b5 { color: #000; background-color: #B218B2; } /* Black on Magenta */
${selector} span.f0.b6 { color: #000; background-color: #18B2B2; } /* Black on Cyan */
${selector} span.f0.b7 { color: #000; background-color: #B2B2B2; } /* Black on White */
/* 8-color Foregrounds with 'bright' (16-color) Backgrounds */
${selector} span.f0.bb0 { color: #444; background-color: #000; } /* Black on Black */
${selector} span.f0.bb1 { color: #000; background-color: #B21818; } /* Black on Bright Red */
${selector} span.f0.bb2 { color: #000; background-color: #00E40C; } /* Black on Bright Green */
${selector} span.f0.bb3 { color: #000; background-color: #FFFF00; } /* Black on Bright Yellow */
${selector} span.f0.bb4 { color: #000; background-color: #1818B2; } /* Black on Bright Blue */
${selector} span.f0.bb5 { color: #000; background-color: #B218B2; } /* Black on Bright Magenta */
${selector} span.f0.bb6 { color: #000; background-color: #18B2B2; } /* Black on Bright Cyan */
${selector} span.f0.bb7 { color: #000; background-color: #B2B2B2; } /* Black on Bright White */
/* 8-color Backgrounds */
${selector} span.b0  { background-color: #000; } /* Black (used when the rendition is set to 49) */
${selector} span.b1  { background-color: #B21818; } /* Red */
${selector} span.b2  { background-color: green; } /* Green */
${selector} span.b3  { background-color: #FFFF00; } /* Yellow */
${selector} span.b4  { background-color: #1818B2; } /* Blue */
${selector} span.b5  { background-color: #B218B2; } /* Magenta */
${selector} span.b6  { background-color: #18B2B2; } /* Cyan */
${selector} span.b7  { background-color: #B2B2B2; } /* White */
/* Reversed Foregrounds */
${selector} span.reverse { color: #000; background-color: #ccc; } /* Black on White (since this is the "Black" CSS) */
${selector} span.reverse.f0 { color: #444; background-color: #000; } /* Black on Black (#444 so you can still read it)*/
${selector} span.reverse.f1 { color: #000; background-color: #D6292C; } /* Red on Black */
${selector} span.reverse.f2 { color: #000; background-color: green; } /* Green on Black */
${selector} span.reverse.f3 { color: #000; background-color: #BDC000; } /* Yellow on Black */
${selector} span.reverse.f4 { color: #000; background-color: #1B4CFF; } /* Blue on Black */
${selector} span.reverse.f5 { color: #000; background-color: #E01DC6; } /* Magenta on Black */
${selector} span.reverse.f6 { color: #000; background-color: #28AAA8; } /* Cyan on Black */
${selector} span.reverse.f7 { color: #000; background-color: #eee; } /* White on Black */
/* 16-color ('Bright') Foregrounds */
${selector} span.bf0 { color: #5C5C5C; } /* Bright Black!  I never knew thee existed! */
${selector} span.bf1 { color: #D6292C; } /* Bright Red */
${selector} span.bf2 { color: #13A110; } /* Bright Green */
${selector} span.bf3 { color: #E9E900; } /* Bright Yellow */
${selector} span.bf4 { color: #1B4CFF; } /* Bright Blue */
${selector} span.bf5 { color: #E01DC6; } /* Bright Magenta */
${selector} span.bf6 { color: #28AAA8; } /* Bright Cyan */
${selector} span.bf7 { color: #eee; } /* Bright White (use this on dentures) */
${selector} span.bf0.bb1 { color: #000; background-color: #B21818; } /* Bright Black on Bright Red */
${selector} span.bf0.bb2 { color: #000; background-color: #00E40C; } /* Bright Black on Bright Green */
${selector} span.bf0.bb3 { color: #000; background-color: #FFFF00; } /* Bright Black on Bright Yellow */
${selector} span.bf0.bb4 { color: #000; background-color: #1818B2; } /* Bright Black on Bright Blue */
${selector} span.bf0.bb5 { color: #000; background-color: #B218B2; } /* Bright Black on Bright Magenta */
${selector} span.bf0.bb6 { color: #000; background-color: #18B2B2; } /* Bright Black on Bright Cyan */
${selector} span.bf0.bb7 { color: #000; background-color: #B2B2B2; } /* Bright Black on Bright White */
/* 16-color ('Bright') Backgrounds */
${selector} span.bb0  { background-color: #000; } /* Bright Black */
${selector} span.bb1  { background-color: #B21818; } /* Bright Red */
${selector} span.bb2  { background-color: #00E40C; } /* Bright Green */
${selector} span.bb3  { background-color: #FFFF00; } /* Bright Yellow */
${selector} span.bb4  { background-color: #1818B2; } /* Bright Blue */
${selector} span.bb5  { background-color: #B218B2; } /* Bright Magenta */
${selector} span.bb6  { background-color: #18B2B2; } /* Bright Cyan */
${selector} span.bb7  { background-color: #B2B2B2; } /* Bright White */
/* Reversed Foregrounds */
${selector} span.reverse { color: #000; background-color: #ccc; } /* Black on White */
${selector} span.reverse.bf0 { color: #000; background-color: #ccc; } /* Black */
${selector} span.reverse.bf1 { color: #000; background-color: #D6292C; } /* Red */
${selector} span.reverse.bf2 { color: #000; background-color: #13A110; } /* Green */
${selector} span.reverse.bf3 { color: #000; background-color: #BDC000; } /* Yellow */
${selector} span.reverse.bf4 { color: #000; background-color: #1B4CFF; } /* Blue */
${selector} span.reverse.bf5 { color: #000; background-color: #E01DC6; } /* Magenta */
${selector} span.reverse.bf6 { color: #000; background-color: #28AAA8; } /* Cyan */
${selector} span.reverse.bf7 { color: #000; background-color: #eee; } /* White */
${selector} span.encircle {
    border: .1em;
    border-radius: .7em;
    -moz-border-radius: 1em;
    display: inline-block;
    margin-right: -0.15em; /* Because we scale it down to make the box normal-sized we have to move it to the left slightly to have it line up properly */
    border-color: #BBB;
    border-style: solid;
    /* WebKit */
    -webkit-transition: -webkit-transform 1s ease-in-out;
    -webkit-transform: scale(.9);
    /* Firefox */
    -moz-transition: -moz-transform 1s ease-in-out;
    -moz-transform: scale(.9);
    /* IE9+ */
    -ms-transition: -ms-transform 1s ease-in-out;
    -ms-transform: scale(.9);
    /* Opera */
    -o-transition: -o-transform 1s ease-in-out;
    -o-transform: scale(.9);
    /* Future CSS3 standard */
    transition: transform 1s ease-in-out;
    transform: scale(.9);
}
${selector} span.rightline {
    border-right: .2em;
    border-top: 0;
    border-bottom: 0;
    border-left: 0;
    border-style: solid;
    margin-right: -0.2em;
    display: inline-block;
    /* WebKit */
    -webkit-transition: -webkit-transform 1s ease-in-out;
    -webkit-transform: scale(.9);
    /* Firefox */
    -moz-transition: -moz-transform 1s ease-in-out;
    -moz-transform: scale(.9);
    /* IE9+ */
    -ms-transition: -ms-transform 1s ease-in-out;
    -ms-transform: scale(.9);
    /* Opera */
    -o-transition: -o-transform 1s ease-in-out;
    -o-transform: scale(.9);
    /* Future CSS3 standard */
    transition: transform 1s ease-in-out;
    transform: scale(.9);
}
${selector} span.rightdoubleline {
    border-right: .3em;
    border-top: 0;
    border-bottom: 0;
    border-left: 0;
    border-style: double;
    margin-right: -0.3em;
    display: inline-block;
    /* WebKit */
    -webkit-transition: -webkit-transform 1s ease-in-out;
    -webkit-transform: scale(.9);
    /* Firefox */
    -moz-transition: -moz-transform 1s ease-in-out;
    -moz-transform: scale(.9);
    /* IE9+ */
    -ms-transition: -ms-transform 1s ease-in-out;
    -ms-transform: scale(.9);
    /* Opera */
    -o-transition: -o-transform 1s ease-in-out;
    -o-transform: scale(.9);
    /* Future CSS3 standard */
    transition: transform 1s ease-in-out;
    transform: scale(.9);
}
${selector} span.leftline {
    border-left: .2em;
    border-top: 0;
    border-bottom: 0;
    border-right: 0;
    border-style: solid;
    margin-right: -0.2em;
    display: inline-block;
    /* WebKit */
    -webkit-transition: -webkit-transform 1s ease-in-out;
    -webkit-transform: scale(.9);
    /* Firefox */
    -moz-transition: -moz-transform 1s ease-in-out;
    -moz-transform: scale(.9);
    /* IE9+ */
    -ms-transition: -ms-transform 1s ease-in-out;
    -ms-transform: scale(.9);
    /* Opera */
    -o-transition: -o-transform 1s ease-in-out;
    -o-transform: scale(.9);
    /* Future CSS3 standard */
    transition: transform 1s ease-in-out;
    transform: scale(.9);
}
${selector} span.leftdoubleline {
    border-left: .3em;
    border-top: 0;
    border-bottom: 0;
    border-right: 0;
    border-style: double;
    margin-right: -0.3em;
    display: inline-block;
    /* WebKit */
    -webkit-transition: -webkit-transform 1s ease-in-out;
    -webkit-transform: scale(.9);
    /* Firefox */
    -moz-transition: -moz-transform 1s ease-in-out;
    -moz-transform: scale(.9);
    /* IE9+ */
    -ms-transition: -ms-transform 1s ease-in-out;
    -ms-transform: scale(.9);
    /* Opera */
    -o-transition: -o-transform 1s ease-in-out;
    -o-transform: scale(.9);
    /* Future CSS3 standard */
    transition: transform 1s ease-in-out;
    transform: scale(.9);
}
${selector} span.bold { font-weight: bold; }
${selector} span.dim { opacity: 0.7; }
${selector} span.hidden { color: transparent !important;}
${selector} span.underline { text-decoration: underline; }
${selector} span.overline { text-decoration: overline; }
${selector} span.italic { font-style: italic; }
${selector} span.strike { text-decoration: line-through; }
${selector} span.frame {
    /* An inset shadow emulates a border without making the box bigger */
    -moz-box-shadow: inset 0.1em 0.1em 0.3em #000;
    -webkit-box-shadow: inset 0.1em 0.1em 0.3em #000;
    box-shadow: inset 0.1em 0.1em 0.3em #000;
}
@-webkit-keyframes blinker {
  from { opacity: 1.0; }
  to { opacity: 0.0; }
}
@-moz-keyframes blinker {
  from { opacity: 1.0; }
  to { opacity: 0.0; }
}
@keyframes blinker {
  from { opacity: 1.0; }
  to { opacity: 0.0; }
}
${selector} span.blink {
    -webkit-animation-name: blinker;
    -webkit-animation-iteration-count: infinite;
    -webkit-animation-timing-function: cubic-bezier(1.0,0,0,1.0);
    -webkit-animation-duration: 1s;
    -moz-animation-iteration-count: infinite;
    -moz-animation-name: blinker;
    -moz-animation-duration: 1s;
    -moz-animation-timing-function: cubic-bezier(1.0,0,0,1.0);
    animation-name: blinker;
    animation-iteration-count: infinite;
    animation-timing-function: cubic-bezier(1.0,0,0,1.0);
    animation-duration: 1s;
}
${selector} span.fastblink {
    -webkit-animation-name: blinker;
    -webkit-animation-iteration-count: infinite;
    -webkit-animation-timing-function: cubic-bezier(1.0,0,0,1.0);
    -webkit-animation-duration: 0.5s;
    -moz-animation-iteration-count: infinite;
    -moz-animation-name: blinker;
    -moz-animation-duration: 0.5s;
    -moz-animation-timing-function: cubic-bezier(1.0,0,0,1.0);
    animation-name: blinker;
    animation-iteration-count: infinite;
    animation-timing-function: cubic-bezier(1.0,0,0,1.0);
    animation-duration: 0.5s;
}
${selector} span.fx0 {color: #000000;} ${selector} span.bx0 {background-color: #000000;}  ${selector} span.reverse.fx0 {background-color: #000000; color: inherit;} ${selector} span.reverse.bx0 {color: #000000; background-color: inherit;}
${selector} span.fx1 {color: #800000;} ${selector} span.bx1 {background-color: #800000;}  ${selector} span.reverse.fx1 {background-color: #800000; color: inherit;} ${selector} span.reverse.bx1 {color: #800000; background-color: inherit;}
${selector} span.fx2 {color: #008000;} ${selector} span.bx2 {background-color: #008000;}  ${selector} span.reverse.fx2 {background-color: #008000; color: inherit;} ${selector} span.reverse.bx2 {color: #008000; background-color: inherit;}
${selector} span.fx3 {color: #808000;} ${selector} span.bx3 {background-color: #808000;}  ${selector} span.reverse.fx3 {background-color: #808000; color: inherit;} ${selector} span.reverse.bx3 {color: #808000; background-color: inherit;}
${selector} span.fx4 {color: #000080;} ${selector} span.bx4 {background-color: #000080;}  ${selector} span.reverse.fx4 {background-color: #000080; color: inherit;} ${selector} span.reverse.bx4 {color: #000080; background-color: inherit;}
${selector} span.fx5 {color: #800080;} ${selector} span.bx5 {background-color: #800080;}  ${selector} span.reverse.fx5 {background-color: #800080; color: inherit;} ${selector} span.reverse.bx5 {color: #800080; background-color: inherit;}
${selector} span.fx6 {color: #008080;} ${selector} span.bx6 {background-color: #008080;}  ${selector} span.reverse.fx6 {background-color: #008080; color: inherit;} ${selector} span.reverse.bx6 {color: #008080; background-color: inherit;}
${selector} span.fx7 {color: #c0c0c0;} ${selector} span.bx7 {background-color: #c0c0c0;}  ${selector} span.reverse.fx7 {background-color: #c0c0c0; color: inherit;} ${selector} span.reverse.bx7 {color: #c0c0c0; background-color: inherit;}
${selector} span.fx8 {color: #808080;} ${selector} span.bx8 {background-color: #808080;}  ${selector} span.reverse.fx8 {background-color: #808080; color: inherit;} ${selector} span.reverse.bx8 {color: #808080; background-color: inherit;}
${selector} span.fx9 {color: #ff0000;} ${selector} span.bx9 {background-color: #ff0000;}  ${selector} span.reverse.fx9 {background-color: #ff0000; color: inherit;} ${selector} span.reverse.bx9 {color: #ff0000; background-color: inherit;}
${selector} span.fx10 {color: #00ff00;} ${selector} span.bx10 {background-color: #00ff00;}  ${selector} span.reverse.fx10 {background-color: #00ff00; color: inherit;} ${selector} span.reverse.bx10 {color: #00ff00; background-color: inherit;}
${selector} span.fx11 {color: #ffff00;} ${selector} span.bx11 {background-color: #ffff00;}  ${selector} span.reverse.fx11 {background-color: #ffff00; color: inherit;} ${selector} span.reverse.bx11 {color: #ffff00; background-color: inherit;}
${selector} span.fx12 {color: #0000ff;} ${selector} span.bx12 {background-color: #0000ff;}  ${selector} span.reverse.fx12 {background-color: #0000ff; color: inherit;} ${selector} span.reverse.bx12 {color: #0000ff; background-color: inherit;}
${selector} span.fx13 {color: #ff00ff;} ${selector} span.bx13 {background-color: #ff00ff;}  ${selector} span.reverse.fx13 {background-color: #ff00ff; color: inherit;} ${selector} span.reverse.bx13 {color: #ff00ff; background-color: inherit;}
${selector} span.fx14 {color: #00ffff;} ${selector} span.bx14 {background-color: #00ffff;}  ${selector} span.reverse.fx14 {background-color: #00ffff; color: inherit;} ${selector} span.reverse.bx14 {color: #00ffff; background-color: inherit;}
${selector} span.fx15 {color: #ffffff;} ${selector} span.bx15 {background-color: #ffffff;}  ${selector} span.reverse.fx15 {background-color: #ffffff; color: inherit;} ${selector} span.reverse.bx15 {color: #ffffff; background-color: inherit;}
${selector} span.fx16 {color: #000000;} ${selector} span.bx16 {background-color: #000000;}  ${selector} span.reverse.fx16 {background-color: #000000; color: inherit;} ${selector} span.reverse.bx16 {color: #000000; background-color: inherit;}
${selector} span.fx17 {color: #00005f;} ${selector} span.bx17 {background-color: #00005f;}  ${selector} span.reverse.fx17 {background-color: #00005f; color: inherit;} ${selector} span.reverse.bx17 {color: #00005f; background-color: inherit;}
${selector} span.fx18 {color: #000087;} ${selector} span.bx18 {background-color: #000087;}  ${selector} span.reverse.fx18 {background-color: #000087; color: inherit;} ${selector} span.reverse.bx18 {color: #000087; background-color: inherit;}
${selector} span.fx19 {color: #0000af;} ${selector} span.bx19 {background-color: #0000af;}  ${selector} span.reverse.fx19 {background-color: #0000af; color: inherit;} ${selector} span.reverse.bx19 {color: #0000af; background-color: inherit;}
${selector} span.fx20 {color: #0000d7;} ${selector} span.bx20 {background-color: #0000d7;}  ${selector} span.reverse.fx20 {background-color: #0000d7; color: inherit;} ${selector} span.reverse.bx20 {color: #0000d7; background-color: inherit;}
${selector} span.fx21 {color: #0000ff;} ${selector} span.bx21 {background-color: #0000ff;}  ${selector} span.reverse.fx21 {background-color: #0000ff; color: inherit;} ${selector} span.reverse.bx21 {color: #0000ff; background-color: inherit;}
${selector} span.fx22 {color: #005f00;} ${selector} span.bx22 {background-color: #005f00;}  ${selector} span.reverse.fx22 {background-color: #005f00; color: inherit;} ${selector} span.reverse.bx22 {color: #005f00; background-color: inherit;}
${selector} span.fx23 {color: #005f5f;} ${selector} span.bx23 {background-color: #005f5f;}  ${selector} span.reverse.fx23 {background-color: #005f5f; color: inherit;} ${selector} span.reverse.bx23 {color: #005f5f; background-color: inherit;}
${selector} span.fx24 {color: #005f87;} ${selector} span.bx24 {background-color: #005f87;}  ${selector} span.reverse.fx24 {background-color: #005f87; color: inherit;} ${selector} span.reverse.bx24 {color: #005f87; background-color: inherit;}
${selector} span.fx25 {color: #005faf;} ${selector} span.bx25 {background-color: #005faf;}  ${selector} span.reverse.fx25 {background-color: #005faf; color: inherit;} ${selector} span.reverse.bx25 {color: #005faf; background-color: inherit;}
${selector} span.fx26 {color: #005fd7;} ${selector} span.bx26 {background-color: #005fd7;}  ${selector} span.reverse.fx26 {background-color: #005fd7; color: inherit;} ${selector} span.reverse.bx26 {color: #005fd7; background-color: inherit;}
${selector} span.fx27 {color: #005fff;} ${selector} span.bx27 {background-color: #005fff;}  ${selector} span.reverse.fx27 {background-color: #005fff; color: inherit;} ${selector} span.reverse.bx27 {color: #005fff; background-color: inherit;}
${selector} span.fx28 {color: #008700;} ${selector} span.bx28 {background-color: #008700;}  ${selector} span.reverse.fx28 {background-color: #008700; color: inherit;} ${selector} span.reverse.bx28 {color: #008700; background-color: inherit;}
${selector} span.fx29 {color: #00875f;} ${selector} span.bx29 {background-color: #00875f;}  ${selector} span.reverse.fx29 {background-color: #00875f; color: inherit;} ${selector} span.reverse.bx29 {color: #00875f; background-color: inherit;}
${selector} span.fx30 {color: #008787;} ${selector} span.bx30 {background-color: #008787;}  ${selector} span.reverse.fx30 {background-color: #008787; color: inherit;} ${selector} span.reverse.bx30 {color: #008787; background-color: inherit;}
${selector} span.fx31 {color: #0087af;} ${selector} span.bx31 {background-color: #0087af;}  ${selector} span.reverse.fx31 {background-color: #0087af; color: inherit;} ${selector} span.reverse.bx31 {color: #0087af; background-color: inherit;}
${selector} span.fx32 {color: #0087d7;} ${selector} span.bx32 {background-color: #0087d7;}  ${selector} span.reverse.fx32 {background-color: #0087d7; color: inherit;} ${selector} span.reverse.bx32 {color: #0087d7; background-color: inherit;}
${selector} span.fx33 {color: #0087ff;} ${selector} span.bx33 {background-color: #0087ff;}  ${selector} span.reverse.fx33 {background-color: #0087ff; color: inherit;} ${selector} span.reverse.bx33 {color: #0087ff; background-color: inherit;}
${selector} span.fx34 {color: #00af00;} ${selector} span.bx34 {background-color: #00af00;}  ${selector} span.reverse.fx34 {background-color: #00af00; color: inherit;} ${selector} span.reverse.bx34 {color: #00af00; background-color: inherit;}
${selector} span.fx35 {color: #00af5f;} ${selector} span.bx35 {background-color: #00af5f;}  ${selector} span.reverse.fx35 {background-color: #00af5f; color: inherit;} ${selector} span.reverse.bx35 {color: #00af5f; background-color: inherit;}
${selector} span.fx36 {color: #00af87;} ${selector} span.bx36 {background-color: #00af87;}  ${selector} span.reverse.fx36 {background-color: #00af87; color: inherit;} ${selector} span.reverse.bx36 {color: #00af87; background-color: inherit;}
${selector} span.fx37 {color: #00afaf;} ${selector} span.bx37 {background-color: #00afaf;}  ${selector} span.reverse.fx37 {background-color: #00afaf; color: inherit;} ${selector} span.reverse.bx37 {color: #00afaf; background-color: inherit;}
${selector} span.fx38 {color: #00afd7;} ${selector} span.bx38 {background-color: #00afd7;}  ${selector} span.reverse.fx38 {background-color: #00afd7; color: inherit;} ${selector} span.reverse.bx38 {color: #00afd7; background-color: inherit;}
${selector} span.fx39 {color: #00afff;} ${selector} span.bx39 {background-color: #00afff;}  ${selector} span.reverse.fx39 {background-color: #00afff; color: inherit;} ${selector} span.reverse.bx39 {color: #00afff; background-color: inherit;}
${selector} span.fx40 {color: #00d700;} ${selector} span.bx40 {background-color: #00d700;}  ${selector} span.reverse.fx40 {background-color: #00d700; color: inherit;} ${selector} span.reverse.bx40 {color: #00d700; background-color: inherit;}
${selector} span.fx41 {color: #00d75f;} ${selector} span.bx41 {background-color: #00d75f;}  ${selector} span.reverse.fx41 {background-color: #00d75f; color: inherit;} ${selector} span.reverse.bx41 {color: #00d75f; background-color: inherit;}
${selector} span.fx42 {color: #00d787;} ${selector} span.bx42 {background-color: #00d787;}  ${selector} span.reverse.fx42 {background-color: #00d787; color: inherit;} ${selector} span.reverse.bx42 {color: #00d787; background-color: inherit;}
${selector} span.fx43 {color: #00d7af;} ${selector} span.bx43 {background-color: #00d7af;}  ${selector} span.reverse.fx43 {background-color: #00d7af; color: inherit;} ${selector} span.reverse.bx43 {color: #00d7af; background-color: inherit;}
${selector} span.fx44 {color: #00d7d7;} ${selector} span.bx44 {background-color: #00d7d7;}  ${selector} span.reverse.fx44 {background-color: #00d7d7; color: inherit;} ${selector} span.reverse.bx44 {color: #00d7d7; background-color: inherit;}
${selector} span.fx45 {color: #00d7ff;} ${selector} span.bx45 {background-color: #00d7ff;}  ${selector} span.reverse.fx45 {background-color: #00d7ff; color: inherit;} ${selector} span.reverse.bx45 {color: #00d7ff; background-color: inherit;}
${selector} span.fx46 {color: #00ff00;} ${selector} span.bx46 {background-color: #00ff00;}  ${selector} span.reverse.fx46 {background-color: #00ff00; color: inherit;} ${selector} span.reverse.bx46 {color: #00ff00; background-color: inherit;}
${selector} span.fx47 {color: #00ff5f;} ${selector} span.bx47 {background-color: #00ff5f;}  ${selector} span.reverse.fx47 {background-color: #00ff5f; color: inherit;} ${selector} span.reverse.bx47 {color: #00ff5f; background-color: inherit;}
${selector} span.fx48 {color: #00ff87;} ${selector} span.bx48 {background-color: #00ff87;}  ${selector} span.reverse.fx48 {background-color: #00ff87; color: inherit;} ${selector} span.reverse.bx48 {color: #00ff87; background-color: inherit;}
${selector} span.fx49 {color: #00ffaf;} ${selector} span.bx49 {background-color: #00ffaf;}  ${selector} span.reverse.fx49 {background-color: #00ffaf; color: inherit;} ${selector} span.reverse.bx49 {color: #00ffaf; background-color: inherit;}
${selector} span.fx50 {color: #00ffd7;} ${selector} span.bx50 {background-color: #00ffd7;}  ${selector} span.reverse.fx50 {background-color: #00ffd7; color: inherit;} ${selector} span.reverse.bx50 {color: #00ffd7; background-color: inherit;}
${selector} span.fx51 {color: #00ffff;} ${selector} span.bx51 {background-color: #00ffff;}  ${selector} span.reverse.fx51 {background-color: #00ffff; color: inherit;} ${selector} span.reverse.bx51 {color: #00ffff; background-color: inherit;}
${selector} span.fx52 {color: #5f0000;} ${selector} span.bx52 {background-color: #5f0000;}  ${selector} span.reverse.fx52 {background-color: #5f0000; color: inherit;} ${selector} span.reverse.bx52 {color: #5f0000; background-color: inherit;}
${selector} span.fx53 {color: #5f005f;} ${selector} span.bx53 {background-color: #5f005f;}  ${selector} span.reverse.fx53 {background-color: #5f005f; color: inherit;} ${selector} span.reverse.bx53 {color: #5f005f; background-color: inherit;}
${selector} span.fx54 {color: #5f0087;} ${selector} span.bx54 {background-color: #5f0087;}  ${selector} span.reverse.fx54 {background-color: #5f0087; color: inherit;} ${selector} span.reverse.bx54 {color: #5f0087; background-color: inherit;}
${selector} span.fx55 {color: #5f00af;} ${selector} span.bx55 {background-color: #5f00af;}  ${selector} span.reverse.fx55 {background-color: #5f00af; color: inherit;} ${selector} span.reverse.bx55 {color: #5f00af; background-color: inherit;}
${selector} span.fx56 {color: #5f00d7;} ${selector} span.bx56 {background-color: #5f00d7;}  ${selector} span.reverse.fx56 {background-color: #5f00d7; color: inherit;} ${selector} span.reverse.bx56 {color: #5f00d7; background-color: inherit;}
${selector} span.fx57 {color: #5f00ff;} ${selector} span.bx57 {background-color: #5f00ff;}  ${selector} span.reverse.fx57 {background-color: #5f00ff; color: inherit;} ${selector} span.reverse.bx57 {color: #5f00ff; background-color: inherit;}
${selector} span.fx58 {color: #5f5f00;} ${selector} span.bx58 {background-color: #5f5f00;}  ${selector} span.reverse.fx58 {background-color: #5f5f00; color: inherit;} ${selector} span.reverse.bx58 {color: #5f5f00; background-color: inherit;}
${selector} span.fx59 {color: #5f5f5f;} ${selector} span.bx59 {background-color: #5f5f5f;}  ${selector} span.reverse.fx59 {background-color: #5f5f5f; color: inherit;} ${selector} span.reverse.bx59 {color: #5f5f5f; background-color: inherit;}
${selector} span.fx60 {color: #5f5f87;} ${selector} span.bx60 {background-color: #5f5f87;}  ${selector} span.reverse.fx60 {background-color: #5f5f87; color: inherit;} ${selector} span.reverse.bx60 {color: #5f5f87; background-color: inherit;}
${selector} span.fx61 {color: #5f5faf;} ${selector} span.bx61 {background-color: #5f5faf;}  ${selector} span.reverse.fx61 {background-color: #5f5faf; color: inherit;} ${selector} span.reverse.bx61 {color: #5f5faf; background-color: inherit;}
${selector} span.fx62 {color: #5f5fd7;} ${selector} span.bx62 {background-color: #5f5fd7;}  ${selector} span.reverse.fx62 {background-color: #5f5fd7; color: inherit;} ${selector} span.reverse.bx62 {color: #5f5fd7; background-color: inherit;}
${selector} span.fx63 {color: #5f5fff;} ${selector} span.bx63 {background-color: #5f5fff;}  ${selector} span.reverse.fx63 {background-color: #5f5fff; color: inherit;} ${selector} span.reverse.bx63 {color: #5f5fff; background-color: inherit;}
${selector} span.fx64 {color: #5f8700;} ${selector} span.bx64 {background-color: #5f8700;}  ${selector} span.reverse.fx64 {background-color: #5f8700; color: inherit;} ${selector} span.reverse.bx64 {color: #5f8700; background-color: inherit;}
${selector} span.fx65 {color: #5f875f;} ${selector} span.bx65 {background-color: #5f875f;}  ${selector} span.reverse.fx65 {background-color: #5f875f; color: inherit;} ${selector} span.reverse.bx65 {color: #5f875f; background-color: inherit;}
${selector} span.fx66 {color: #5f8787;} ${selector} span.bx66 {background-color: #5f8787;}  ${selector} span.reverse.fx66 {background-color: #5f8787; color: inherit;} ${selector} span.reverse.bx66 {color: #5f8787; background-color: inherit;}
${selector} span.fx67 {color: #5f87af;} ${selector} span.bx67 {background-color: #5f87af;}  ${selector} span.reverse.fx67 {background-color: #5f87af; color: inherit;} ${selector} span.reverse.bx67 {color: #5f87af; background-color: inherit;}
${selector} span.fx68 {color: #5f87d7;} ${selector} span.bx68 {background-color: #5f87d7;}  ${selector} span.reverse.fx68 {background-color: #5f87d7; color: inherit;} ${selector} span.reverse.bx68 {color: #5f87d7; background-color: inherit;}
${selector} span.fx69 {color: #5f87ff;} ${selector} span.bx69 {background-color: #5f87ff;}  ${selector} span.reverse.fx69 {background-color: #5f87ff; color: inherit;} ${selector} span.reverse.bx69 {color: #5f87ff; background-color: inherit;}
${selector} span.fx70 {color: #5faf00;} ${selector} span.bx70 {background-color: #5faf00;}  ${selector} span.reverse.fx70 {background-color: #5faf00; color: inherit;} ${selector} span.reverse.bx70 {color: #5faf00; background-color: inherit;}
${selector} span.fx71 {color: #5faf5f;} ${selector} span.bx71 {background-color: #5faf5f;}  ${selector} span.reverse.fx71 {background-color: #5faf5f; color: inherit;} ${selector} span.reverse.bx71 {color: #5faf5f; background-color: inherit;}
${selector} span.fx72 {color: #5faf87;} ${selector} span.bx72 {background-color: #5faf87;}  ${selector} span.reverse.fx72 {background-color: #5faf87; color: inherit;} ${selector} span.reverse.bx72 {color: #5faf87; background-color: inherit;}
${selector} span.fx73 {color: #5fafaf;} ${selector} span.bx73 {background-color: #5fafaf;}  ${selector} span.reverse.fx73 {background-color: #5fafaf; color: inherit;} ${selector} span.reverse.bx73 {color: #5fafaf; background-color: inherit;}
${selector} span.fx74 {color: #5fafd7;} ${selector} span.bx74 {background-color: #5fafd7;}  ${selector} span.reverse.fx74 {background-color: #5fafd7; color: inherit;} ${selector} span.reverse.bx74 {color: #5fafd7; background-color: inherit;}
${selector} span.fx75 {color: #5fafff;} ${selector} span.bx75 {background-color: #5fafff;}  ${selector} span.reverse.fx75 {background-color: #5fafff; color: inherit;} ${selector} span.reverse.bx75 {color: #5fafff; background-color: inherit;}
${selector} span.fx76 {color: #5fd700;} ${selector} span.bx76 {background-color: #5fd700;}  ${selector} span.reverse.fx76 {background-color: #5fd700; color: inherit;} ${selector} span.reverse.bx76 {color: #5fd700; background-color: inherit;}
${selector} span.fx77 {color: #5fd75f;} ${selector} span.bx77 {background-color: #5fd75f;}  ${selector} span.reverse.fx77 {background-color: #5fd75f; color: inherit;} ${selector} span.reverse.bx77 {color: #5fd75f; background-color: inherit;}
${selector} span.fx78 {color: #5fd787;} ${selector} span.bx78 {background-color: #5fd787;}  ${selector} span.reverse.fx78 {background-color: #5fd787; color: inherit;} ${selector} span.reverse.bx78 {color: #5fd787; background-color: inherit;}
${selector} span.fx79 {color: #5fd7af;} ${selector} span.bx79 {background-color: #5fd7af;}  ${selector} span.reverse.fx79 {background-color: #5fd7af; color: inherit;} ${selector} span.reverse.bx79 {color: #5fd7af; background-color: inherit;}
${selector} span.fx80 {color: #5fd7d7;} ${selector} span.bx80 {background-color: #5fd7d7;}  ${selector} span.reverse.fx80 {background-color: #5fd7d7; color: inherit;} ${selector} span.reverse.bx80 {color: #5fd7d7; background-color: inherit;}
${selector} span.fx81 {color: #5fd7ff;} ${selector} span.bx81 {background-color: #5fd7ff;}  ${selector} span.reverse.fx81 {background-color: #5fd7ff; color: inherit;} ${selector} span.reverse.bx81 {color: #5fd7ff; background-color: inherit;}
${selector} span.fx82 {color: #5fff00;} ${selector} span.bx82 {background-color: #5fff00;}  ${selector} span.reverse.fx82 {background-color: #5fff00; color: inherit;} ${selector} span.reverse.bx82 {color: #5fff00; background-color: inherit;}
${selector} span.fx83 {color: #5fff5f;} ${selector} span.bx83 {background-color: #5fff5f;}  ${selector} span.reverse.fx83 {background-color: #5fff5f; color: inherit;} ${selector} span.reverse.bx83 {color: #5fff5f; background-color: inherit;}
${selector} span.fx84 {color: #5fff87;} ${selector} span.bx84 {background-color: #5fff87;}  ${selector} span.reverse.fx84 {background-color: #5fff87; color: inherit;} ${selector} span.reverse.bx84 {color: #5fff87; background-color: inherit;}
${selector} span.fx85 {color: #5fffaf;} ${selector} span.bx85 {background-color: #5fffaf;}  ${selector} span.reverse.fx85 {background-color: #5fffaf; color: inherit;} ${selector} span.reverse.bx85 {color: #5fffaf; background-color: inherit;}
${selector} span.fx86 {color: #5fffd7;} ${selector} span.bx86 {background-color: #5fffd7;}  ${selector} span.reverse.fx86 {background-color: #5fffd7; color: inherit;} ${selector} span.reverse.bx86 {color: #5fffd7; background-color: inherit;}
${selector} span.fx87 {color: #5fffff;} ${selector} span.bx87 {background-color: #5fffff;}  ${selector} span.reverse.fx87 {background-color: #5fffff; color: inherit;} ${selector} span.reverse.bx87 {color: #5fffff; background-color: inherit;}
${selector} span.fx88 {color: #870000;} ${selector} span.bx88 {background-color: #870000;}  ${selector} span.reverse.fx88 {background-color: #870000; color: inherit;} ${selector} span.reverse.bx88 {color: #870000; background-color: inherit;}
${selector} span.fx89 {color: #87005f;} ${selector} span.bx89 {background-color: #87005f;}  ${selector} span.reverse.fx89 {background-color: #87005f; color: inherit;} ${selector} span.reverse.bx89 {color: #87005f; background-color: inherit;}
${selector} span.fx90 {color: #870087;} ${selector} span.bx90 {background-color: #870087;}  ${selector} span.reverse.fx90 {background-color: #870087; color: inherit;} ${selector} span.reverse.bx90 {color: #870087; background-color: inherit;}
${selector} span.fx91 {color: #8700af;} ${selector} span.bx91 {background-color: #8700af;}  ${selector} span.reverse.fx91 {background-color: #8700af; color: inherit;} ${selector} span.reverse.bx91 {color: #8700af; background-color: inherit;}
${selector} span.fx92 {color: #8700d7;} ${selector} span.bx92 {background-color: #8700d7;}  ${selector} span.reverse.fx92 {background-color: #8700d7; color: inherit;} ${selector} span.reverse.bx92 {color: #8700d7; background-color: inherit;}
${selector} span.fx93 {color: #8700ff;} ${selector} span.bx93 {background-color: #8700ff;}  ${selector} span.reverse.fx93 {background-color: #8700ff; color: inherit;} ${selector} span.reverse.bx93 {color: #8700ff; background-color: inherit;}
${selector} span.fx94 {color: #875f00;} ${selector} span.bx94 {background-color: #875f00;}  ${selector} span.reverse.fx94 {background-color: #875f00; color: inherit;} ${selector} span.reverse.bx94 {color: #875f00; background-color: inherit;}
${selector} span.fx95 {color: #875f5f;} ${selector} span.bx95 {background-color: #875f5f;}  ${selector} span.reverse.fx95 {background-color: #875f5f; color: inherit;} ${selector} span.reverse.bx95 {color: #875f5f; background-color: inherit;}
${selector} span.fx96 {color: #875f87;} ${selector} span.bx96 {background-color: #875f87;}  ${selector} span.reverse.fx96 {background-color: #875f87; color: inherit;} ${selector} span.reverse.bx96 {color: #875f87; background-color: inherit;}
${selector} span.fx97 {color: #875faf;} ${selector} span.bx97 {background-color: #875faf;}  ${selector} span.reverse.fx97 {background-color: #875faf; color: inherit;} ${selector} span.reverse.bx97 {color: #875faf; background-color: inherit;}
${selector} span.fx98 {color: #875fd7;} ${selector} span.bx98 {background-color: #875fd7;}  ${selector} span.reverse.fx98 {background-color: #875fd7; color: inherit;} ${selector} span.reverse.bx98 {color: #875fd7; background-color: inherit;}
${selector} span.fx99 {color: #875fff;} ${selector} span.bx99 {background-color: #875fff;}  ${selector} span.reverse.fx99 {background-color: #875fff; color: inherit;} ${selector} span.reverse.bx99 {color: #875fff; background-color: inherit;}
${selector} span.fx100 {color: #878700;} ${selector} span.bx100 {background-color: #878700;}  ${selector} span.reverse.fx100 {background-color: #878700; color: inherit;} ${selector} span.reverse.bx100 {color: #878700; background-color: inherit;}
${selector} span.fx101 {color: #87875f;} ${selector} span.bx101 {background-color: #87875f;}  ${selector} span.reverse.fx101 {background-color: #87875f; color: inherit;} ${selector} span.reverse.bx101 {color: #87875f; background-color: inherit;}
${selector} span.fx102 {color: #878787;} ${selector} span.bx102 {background-color: #878787;}  ${selector} span.reverse.fx102 {background-color: #878787; color: inherit;} ${selector} span.reverse.bx102 {color: #878787; background-color: inherit;}
${selector} span.fx103 {color: #8787af;} ${selector} span.bx103 {background-color: #8787af;}  ${selector} span.reverse.fx103 {background-color: #8787af; color: inherit;} ${selector} span.reverse.bx103 {color: #8787af; background-color: inherit;}
${selector} span.fx104 {color: #8787d7;} ${selector} span.bx104 {background-color: #8787d7;}  ${selector} span.reverse.fx104 {background-color: #8787d7; color: inherit;} ${selector} span.reverse.bx104 {color: #8787d7; background-color: inherit;}
${selector} span.fx105 {color: #8787ff;} ${selector} span.bx105 {background-color: #8787ff;}  ${selector} span.reverse.fx105 {background-color: #8787ff; color: inherit;} ${selector} span.reverse.bx105 {color: #8787ff; background-color: inherit;}
${selector} span.fx106 {color: #87af00;} ${selector} span.bx106 {background-color: #87af00;}  ${selector} span.reverse.fx106 {background-color: #87af00; color: inherit;} ${selector} span.reverse.bx106 {color: #87af00; background-color: inherit;}
${selector} span.fx107 {color: #87af5f;} ${selector} span.bx107 {background-color: #87af5f;}  ${selector} span.reverse.fx107 {background-color: #87af5f; color: inherit;} ${selector} span.reverse.bx107 {color: #87af5f; background-color: inherit;}
${selector} span.fx108 {color: #87af87;} ${selector} span.bx108 {background-color: #87af87;}  ${selector} span.reverse.fx108 {background-color: #87af87; color: inherit;} ${selector} span.reverse.bx108 {color: #87af87; background-color: inherit;}
${selector} span.fx109 {color: #87afaf;} ${selector} span.bx109 {background-color: #87afaf;}  ${selector} span.reverse.fx109 {background-color: #87afaf; color: inherit;} ${selector} span.reverse.bx109 {color: #87afaf; background-color: inherit;}
${selector} span.fx110 {color: #87afd7;} ${selector} span.bx110 {background-color: #87afd7;}  ${selector} span.reverse.fx110 {background-color: #87afd7; color: inherit;} ${selector} span.reverse.bx110 {color: #87afd7; background-color: inherit;}
${selector} span.fx111 {color: #87afff;} ${selector} span.bx111 {background-color: #87afff;}  ${selector} span.reverse.fx111 {background-color: #87afff; color: inherit;} ${selector} span.reverse.bx111 {color: #87afff; background-color: inherit;}
${selector} span.fx112 {color: #87d700;} ${selector} span.bx112 {background-color: #87d700;}  ${selector} span.reverse.fx112 {background-color: #87d700; color: inherit;} ${selector} span.reverse.bx112 {color: #87d700; background-color: inherit;}
${selector} span.fx113 {color: #87d75f;} ${selector} span.bx113 {background-color: #87d75f;}  ${selector} span.reverse.fx113 {background-color: #87d75f; color: inherit;} ${selector} span.reverse.bx113 {color: #87d75f; background-color: inherit;}
${selector} span.fx114 {color: #87d787;} ${selector} span.bx114 {background-color: #87d787;}  ${selector} span.reverse.fx114 {background-color: #87d787; color: inherit;} ${selector} span.reverse.bx114 {color: #87d787; background-color: inherit;}
${selector} span.fx115 {color: #87d7af;} ${selector} span.bx115 {background-color: #87d7af;}  ${selector} span.reverse.fx115 {background-color: #87d7af; color: inherit;} ${selector} span.reverse.bx115 {color: #87d7af; background-color: inherit;}
${selector} span.fx116 {color: #87d7d7;} ${selector} span.bx116 {background-color: #87d7d7;}  ${selector} span.reverse.fx116 {background-color: #87d7d7; color: inherit;} ${selector} span.reverse.bx116 {color: #87d7d7; background-color: inherit;}
${selector} span.fx117 {color: #87d7ff;} ${selector} span.bx117 {background-color: #87d7ff;}  ${selector} span.reverse.fx117 {background-color: #87d7ff; color: inherit;} ${selector} span.reverse.bx117 {color: #87d7ff; background-color: inherit;}
${selector} span.fx118 {color: #87ff00;} ${selector} span.bx118 {background-color: #87ff00;}  ${selector} span.reverse.fx118 {background-color: #87ff00; color: inherit;} ${selector} span.reverse.bx118 {color: #87ff00; background-color: inherit;}
${selector} span.fx119 {color: #87ff5f;} ${selector} span.bx119 {background-color: #87ff5f;}  ${selector} span.reverse.fx119 {background-color: #87ff5f; color: inherit;} ${selector} span.reverse.bx119 {color: #87ff5f; background-color: inherit;}
${selector} span.fx120 {color: #87ff87;} ${selector} span.bx120 {background-color: #87ff87;}  ${selector} span.reverse.fx120 {background-color: #87ff87; color: inherit;} ${selector} span.reverse.bx120 {color: #87ff87; background-color: inherit;}
${selector} span.fx121 {color: #87ffaf;} ${selector} span.bx121 {background-color: #87ffaf;}  ${selector} span.reverse.fx121 {background-color: #87ffaf; color: inherit;} ${selector} span.reverse.bx121 {color: #87ffaf; background-color: inherit;}
${selector} span.fx122 {color: #87ffd7;} ${selector} span.bx122 {background-color: #87ffd7;}  ${selector} span.reverse.fx122 {background-color: #87ffd7; color: inherit;} ${selector} span.reverse.bx122 {color: #87ffd7; background-color: inherit;}
${selector} span.fx123 {color: #87ffff;} ${selector} span.bx123 {background-color: #87ffff;}  ${selector} span.reverse.fx123 {background-color: #87ffff; color: inherit;} ${selector} span.reverse.bx123 {color: #87ffff; background-color: inherit;}
${selector} span.fx124 {color: #af0000;} ${selector} span.bx124 {background-color: #af0000;}  ${selector} span.reverse.fx124 {background-color: #af0000; color: inherit;} ${selector} span.reverse.bx124 {color: #af0000; background-color: inherit;}
${selector} span.fx125 {color: #af005f;} ${selector} span.bx125 {background-color: #af005f;}  ${selector} span.reverse.fx125 {background-color: #af005f; color: inherit;} ${selector} span.reverse.bx125 {color: #af005f; background-color: inherit;}
${selector} span.fx126 {color: #af0087;} ${selector} span.bx126 {background-color: #af0087;}  ${selector} span.reverse.fx126 {background-color: #af0087; color: inherit;} ${selector} span.reverse.bx126 {color: #af0087; background-color: inherit;}
${selector} span.fx127 {color: #af00af;} ${selector} span.bx127 {background-color: #af00af;}  ${selector} span.reverse.fx127 {background-color: #af00af; color: inherit;} ${selector} span.reverse.bx127 {color: #af00af; background-color: inherit;}
${selector} span.fx128 {color: #af00d7;} ${selector} span.bx128 {background-color: #af00d7;}  ${selector} span.reverse.fx128 {background-color: #af00d7; color: inherit;} ${selector} span.reverse.bx128 {color: #af00d7; background-color: inherit;}
${selector} span.fx129 {color: #af00ff;} ${selector} span.bx129 {background-color: #af00ff;}  ${selector} span.reverse.fx129 {background-color: #af00ff; color: inherit;} ${selector} span.reverse.bx129 {color: #af00ff; background-color: inherit;}
${selector} span.fx130 {color: #af5f00;} ${selector} span.bx130 {background-color: #af5f00;}  ${selector} span.reverse.fx130 {background-color: #af5f00; color: inherit;} ${selector} span.reverse.bx130 {color: #af5f00; background-color: inherit;}
${selector} span.fx131 {color: #af5f5f;} ${selector} span.bx131 {background-color: #af5f5f;}  ${selector} span.reverse.fx131 {background-color: #af5f5f; color: inherit;} ${selector} span.reverse.bx131 {color: #af5f5f; background-color: inherit;}
${selector} span.fx132 {color: #af5f87;} ${selector} span.bx132 {background-color: #af5f87;}  ${selector} span.reverse.fx132 {background-color: #af5f87; color: inherit;} ${selector} span.reverse.bx132 {color: #af5f87; background-color: inherit;}
${selector} span.fx133 {color: #af5faf;} ${selector} span.bx133 {background-color: #af5faf;}  ${selector} span.reverse.fx133 {background-color: #af5faf; color: inherit;} ${selector} span.reverse.bx133 {color: #af5faf; background-color: inherit;}
${selector} span.fx134 {color: #af5fd7;} ${selector} span.bx134 {background-color: #af5fd7;}  ${selector} span.reverse.fx134 {background-color: #af5fd7; color: inherit;} ${selector} span.reverse.bx134 {color: #af5fd7; background-color: inherit;}
${selector} span.fx135 {color: #af5fff;} ${selector} span.bx135 {background-color: #af5fff;}  ${selector} span.reverse.fx135 {background-color: #af5fff; color: inherit;} ${selector} span.reverse.bx135 {color: #af5fff; background-color: inherit;}
${selector} span.fx136 {color: #af8700;} ${selector} span.bx136 {background-color: #af8700;}  ${selector} span.reverse.fx136 {background-color: #af8700; color: inherit;} ${selector} span.reverse.bx136 {color: #af8700; background-color: inherit;}
${selector} span.fx137 {color: #af875f;} ${selector} span.bx137 {background-color: #af875f;}  ${selector} span.reverse.fx137 {background-color: #af875f; color: inherit;} ${selector} span.reverse.bx137 {color: #af875f; background-color: inherit;}
${selector} span.fx138 {color: #af8787;} ${selector} span.bx138 {background-color: #af8787;}  ${selector} span.reverse.fx138 {background-color: #af8787; color: inherit;} ${selector} span.reverse.bx138 {color: #af8787; background-color: inherit;}
${selector} span.fx139 {color: #af87af;} ${selector} span.bx139 {background-color: #af87af;}  ${selector} span.reverse.fx139 {background-color: #af87af; color: inherit;} ${selector} span.reverse.bx139 {color: #af87af; background-color: inherit;}
${selector} span.fx140 {color: #af87d7;} ${selector} span.bx140 {background-color: #af87d7;}  ${selector} span.reverse.fx140 {background-color: #af87d7; color: inherit;} ${selector} span.reverse.bx140 {color: #af87d7; background-color: inherit;}
${selector} span.fx141 {color: #af87ff;} ${selector} span.bx141 {background-color: #af87ff;}  ${selector} span.reverse.fx141 {background-color: #af87ff; color: inherit;} ${selector} span.reverse.bx141 {color: #af87ff; background-color: inherit;}
${selector} span.fx142 {color: #afaf00;} ${selector} span.bx142 {background-color: #afaf00;}  ${selector} span.reverse.fx142 {background-color: #afaf00; color: inherit;} ${selector} span.reverse.bx142 {color: #afaf00; background-color: inherit;}
${selector} span.fx143 {color: #afaf5f;} ${selector} span.bx143 {background-color: #afaf5f;}  ${selector} span.reverse.fx143 {background-color: #afaf5f; color: inherit;} ${selector} span.reverse.bx143 {color: #afaf5f; background-color: inherit;}
${selector} span.fx144 {color: #afaf87;} ${selector} span.bx144 {background-color: #afaf87;}  ${selector} span.reverse.fx144 {background-color: #afaf87; color: inherit;} ${selector} span.reverse.bx144 {color: #afaf87; background-color: inherit;}
${selector} span.fx145 {color: #afafaf;} ${selector} span.bx145 {background-color: #afafaf;}  ${selector} span.reverse.fx145 {background-color: #afafaf; color: inherit;} ${selector} span.reverse.bx145 {color: #afafaf; background-color: inherit;}
${selector} span.fx146 {color: #afafd7;} ${selector} span.bx146 {background-color: #afafd7;}  ${selector} span.reverse.fx146 {background-color: #afafd7; color: inherit;} ${selector} span.reverse.bx146 {color: #afafd7; background-color: inherit;}
${selector} span.fx147 {color: #afafff;} ${selector} span.bx147 {background-color: #afafff;}  ${selector} span.reverse.fx147 {background-color: #afafff; color: inherit;} ${selector} span.reverse.bx147 {color: #afafff; background-color: inherit;}
${selector} span.fx148 {color: #afd700;} ${selector} span.bx148 {background-color: #afd700;}  ${selector} span.reverse.fx148 {background-color: #afd700; color: inherit;} ${selector} span.reverse.bx148 {color: #afd700; background-color: inherit;}
${selector} span.fx149 {color: #afd75f;} ${selector} span.bx149 {background-color: #afd75f;}  ${selector} span.reverse.fx149 {background-color: #afd75f; color: inherit;} ${selector} span.reverse.bx149 {color: #afd75f; background-color: inherit;}
${selector} span.fx150 {color: #afd787;} ${selector} span.bx150 {background-color: #afd787;}  ${selector} span.reverse.fx150 {background-color: #afd787; color: inherit;} ${selector} span.reverse.bx150 {color: #afd787; background-color: inherit;}
${selector} span.fx151 {color: #afd7af;} ${selector} span.bx151 {background-color: #afd7af;}  ${selector} span.reverse.fx151 {background-color: #afd7af; color: inherit;} ${selector} span.reverse.bx151 {color: #afd7af; background-color: inherit;}
${selector} span.fx152 {color: #afd7d7;} ${selector} span.bx152 {background-color: #afd7d7;}  ${selector} span.reverse.fx152 {background-color: #afd7d7; color: inherit;} ${selector} span.reverse.bx152 {color: #afd7d7; background-color: inherit;}
${selector} span.fx153 {color: #afd7ff;} ${selector} span.bx153 {background-color: #afd7ff;}  ${selector} span.reverse.fx153 {background-color: #afd7ff; color: inherit;} ${selector} span.reverse.bx153 {color: #afd7ff; background-color: inherit;}
${selector} span.fx154 {color: #afff00;} ${selector} span.bx154 {background-color: #afff00;}  ${selector} span.reverse.fx154 {background-color: #afff00; color: inherit;} ${selector} span.reverse.bx154 {color: #afff00; background-color: inherit;}
${selector} span.fx155 {color: #afff5f;} ${selector} span.bx155 {background-color: #afff5f;}  ${selector} span.reverse.fx155 {background-color: #afff5f; color: inherit;} ${selector} span.reverse.bx155 {color: #afff5f; background-color: inherit;}
${selector} span.fx156 {color: #afff87;} ${selector} span.bx156 {background-color: #afff87;}  ${selector} span.reverse.fx156 {background-color: #afff87; color: inherit;} ${selector} span.reverse.bx156 {color: #afff87; background-color: inherit;}
${selector} span.fx157 {color: #afffaf;} ${selector} span.bx157 {background-color: #afffaf;}  ${selector} span.reverse.fx157 {background-color: #afffaf; color: inherit;} ${selector} span.reverse.bx157 {color: #afffaf; background-color: inherit;}
${selector} span.fx158 {color: #afffd7;} ${selector} span.bx158 {background-color: #afffd7;}  ${selector} span.reverse.fx158 {background-color: #afffd7; color: inherit;} ${selector} span.reverse.bx158 {color: #afffd7; background-color: inherit;}
${selector} span.fx159 {color: #afffff;} ${selector} span.bx159 {background-color: #afffff;}  ${selector} span.reverse.fx159 {background-color: #afffff; color: inherit;} ${selector} span.reverse.bx159 {color: #afffff; background-color: inherit;}
${selector} span.fx160 {color: #d70000;} ${selector} span.bx160 {background-color: #d70000;}  ${selector} span.reverse.fx160 {background-color: #d70000; color: inherit;} ${selector} span.reverse.bx160 {color: #d70000; background-color: inherit;}
${selector} span.fx161 {color: #d7005f;} ${selector} span.bx161 {background-color: #d7005f;}  ${selector} span.reverse.fx161 {background-color: #d7005f; color: inherit;} ${selector} span.reverse.bx161 {color: #d7005f; background-color: inherit;}
${selector} span.fx162 {color: #d70087;} ${selector} span.bx162 {background-color: #d70087;}  ${selector} span.reverse.fx162 {background-color: #d70087; color: inherit;} ${selector} span.reverse.bx162 {color: #d70087; background-color: inherit;}
${selector} span.fx163 {color: #d700af;} ${selector} span.bx163 {background-color: #d700af;}  ${selector} span.reverse.fx163 {background-color: #d700af; color: inherit;} ${selector} span.reverse.bx163 {color: #d700af; background-color: inherit;}
${selector} span.fx164 {color: #d700d7;} ${selector} span.bx164 {background-color: #d700d7;}  ${selector} span.reverse.fx164 {background-color: #d700d7; color: inherit;} ${selector} span.reverse.bx164 {color: #d700d7; background-color: inherit;}
${selector} span.fx165 {color: #d700ff;} ${selector} span.bx165 {background-color: #d700ff;}  ${selector} span.reverse.fx165 {background-color: #d700ff; color: inherit;} ${selector} span.reverse.bx165 {color: #d700ff; background-color: inherit;}
${selector} span.fx166 {color: #d75f00;} ${selector} span.bx166 {background-color: #d75f00;}  ${selector} span.reverse.fx166 {background-color: #d75f00; color: inherit;} ${selector} span.reverse.bx166 {color: #d75f00; background-color: inherit;}
${selector} span.fx167 {color: #d75f5f;} ${selector} span.bx167 {background-color: #d75f5f;}  ${selector} span.reverse.fx167 {background-color: #d75f5f; color: inherit;} ${selector} span.reverse.bx167 {color: #d75f5f; background-color: inherit;}
${selector} span.fx168 {color: #d75f87;} ${selector} span.bx168 {background-color: #d75f87;}  ${selector} span.reverse.fx168 {background-color: #d75f87; color: inherit;} ${selector} span.reverse.bx168 {color: #d75f87; background-color: inherit;}
${selector} span.fx169 {color: #d75faf;} ${selector} span.bx169 {background-color: #d75faf;}  ${selector} span.reverse.fx169 {background-color: #d75faf; color: inherit;} ${selector} span.reverse.bx169 {color: #d75faf; background-color: inherit;}
${selector} span.fx170 {color: #d75fd7;} ${selector} span.bx170 {background-color: #d75fd7;}  ${selector} span.reverse.fx170 {background-color: #d75fd7; color: inherit;} ${selector} span.reverse.bx170 {color: #d75fd7; background-color: inherit;}
${selector} span.fx171 {color: #d75fff;} ${selector} span.bx171 {background-color: #d75fff;}  ${selector} span.reverse.fx171 {background-color: #d75fff; color: inherit;} ${selector} span.reverse.bx171 {color: #d75fff; background-color: inherit;}
${selector} span.fx172 {color: #d78700;} ${selector} span.bx172 {background-color: #d78700;}  ${selector} span.reverse.fx172 {background-color: #d78700; color: inherit;} ${selector} span.reverse.bx172 {color: #d78700; background-color: inherit;}
${selector} span.fx173 {color: #d7875f;} ${selector} span.bx173 {background-color: #d7875f;}  ${selector} span.reverse.fx173 {background-color: #d7875f; color: inherit;} ${selector} span.reverse.bx173 {color: #d7875f; background-color: inherit;}
${selector} span.fx174 {color: #d78787;} ${selector} span.bx174 {background-color: #d78787;}  ${selector} span.reverse.fx174 {background-color: #d78787; color: inherit;} ${selector} span.reverse.bx174 {color: #d78787; background-color: inherit;}
${selector} span.fx175 {color: #d787af;} ${selector} span.bx175 {background-color: #d787af;}  ${selector} span.reverse.fx175 {background-color: #d787af; color: inherit;} ${selector} span.reverse.bx175 {color: #d787af; background-color: inherit;}
${selector} span.fx176 {color: #d787d7;} ${selector} span.bx176 {background-color: #d787d7;}  ${selector} span.reverse.fx176 {background-color: #d787d7; color: inherit;} ${selector} span.reverse.bx176 {color: #d787d7; background-color: inherit;}
${selector} span.fx177 {color: #d787ff;} ${selector} span.bx177 {background-color: #d787ff;}  ${selector} span.reverse.fx177 {background-color: #d787ff; color: inherit;} ${selector} span.reverse.bx177 {color: #d787ff; background-color: inherit;}
${selector} span.fx178 {color: #d7af00;} ${selector} span.bx178 {background-color: #d7af00;}  ${selector} span.reverse.fx178 {background-color: #d7af00; color: inherit;} ${selector} span.reverse.bx178 {color: #d7af00; background-color: inherit;}
${selector} span.fx179 {color: #d7af5f;} ${selector} span.bx179 {background-color: #d7af5f;}  ${selector} span.reverse.fx179 {background-color: #d7af5f; color: inherit;} ${selector} span.reverse.bx179 {color: #d7af5f; background-color: inherit;}
${selector} span.fx180 {color: #d7af87;} ${selector} span.bx180 {background-color: #d7af87;}  ${selector} span.reverse.fx180 {background-color: #d7af87; color: inherit;} ${selector} span.reverse.bx180 {color: #d7af87; background-color: inherit;}
${selector} span.fx181 {color: #d7afaf;} ${selector} span.bx181 {background-color: #d7afaf;}  ${selector} span.reverse.fx181 {background-color: #d7afaf; color: inherit;} ${selector} span.reverse.bx181 {color: #d7afaf; background-color: inherit;}
${selector} span.fx182 {color: #d7afd7;} ${selector} span.bx182 {background-color: #d7afd7;}  ${selector} span.reverse.fx182 {background-color: #d7afd7; color: inherit;} ${selector} span.reverse.bx182 {color: #d7afd7; background-color: inherit;}
${selector} span.fx183 {color: #d7afff;} ${selector} span.bx183 {background-color: #d7afff;}  ${selector} span.reverse.fx183 {background-color: #d7afff; color: inherit;} ${selector} span.reverse.bx183 {color: #d7afff; background-color: inherit;}
${selector} span.fx184 {color: #d7d700;} ${selector} span.bx184 {background-color: #d7d700;}  ${selector} span.reverse.fx184 {background-color: #d7d700; color: inherit;} ${selector} span.reverse.bx184 {color: #d7d700; background-color: inherit;}
${selector} span.fx185 {color: #d7d75f;} ${selector} span.bx185 {background-color: #d7d75f;}  ${selector} span.reverse.fx185 {background-color: #d7d75f; color: inherit;} ${selector} span.reverse.bx185 {color: #d7d75f; background-color: inherit;}
${selector} span.fx186 {color: #d7d787;} ${selector} span.bx186 {background-color: #d7d787;}  ${selector} span.reverse.fx186 {background-color: #d7d787; color: inherit;} ${selector} span.reverse.bx186 {color: #d7d787; background-color: inherit;}
${selector} span.fx187 {color: #d7d7af;} ${selector} span.bx187 {background-color: #d7d7af;}  ${selector} span.reverse.fx187 {background-color: #d7d7af; color: inherit;} ${selector} span.reverse.bx187 {color: #d7d7af; background-color: inherit;}
${selector} span.fx188 {color: #d7d7d7;} ${selector} span.bx188 {background-color: #d7d7d7;}  ${selector} span.reverse.fx188 {background-color: #d7d7d7; color: inherit;} ${selector} span.reverse.bx188 {color: #d7d7d7; background-color: inherit;}
${selector} span.fx189 {color: #d7d7ff;} ${selector} span.bx189 {background-color: #d7d7ff;}  ${selector} span.reverse.fx189 {background-color: #d7d7ff; color: inherit;} ${selector} span.reverse.bx189 {color: #d7d7ff; background-color: inherit;}
${selector} span.fx190 {color: #d7ff00;} ${selector} span.bx190 {background-color: #d7ff00;}  ${selector} span.reverse.fx190 {background-color: #d7ff00; color: inherit;} ${selector} span.reverse.bx190 {color: #d7ff00; background-color: inherit;}
${selector} span.fx191 {color: #d7ff5f;} ${selector} span.bx191 {background-color: #d7ff5f;}  ${selector} span.reverse.fx191 {background-color: #d7ff5f; color: inherit;} ${selector} span.reverse.bx191 {color: #d7ff5f; background-color: inherit;}
${selector} span.fx192 {color: #d7ff87;} ${selector} span.bx192 {background-color: #d7ff87;}  ${selector} span.reverse.fx192 {background-color: #d7ff87; color: inherit;} ${selector} span.reverse.bx192 {color: #d7ff87; background-color: inherit;}
${selector} span.fx193 {color: #d7ffaf;} ${selector} span.bx193 {background-color: #d7ffaf;}  ${selector} span.reverse.fx193 {background-color: #d7ffaf; color: inherit;} ${selector} span.reverse.bx193 {color: #d7ffaf; background-color: inherit;}
${selector} span.fx194 {color: #d7ffd7;} ${selector} span.bx194 {background-color: #d7ffd7;}  ${selector} span.reverse.fx194 {background-color: #d7ffd7; color: inherit;} ${selector} span.reverse.bx194 {color: #d7ffd7; background-color: inherit;}
${selector} span.fx195 {color: #d7ffff;} ${selector} span.bx195 {background-color: #d7ffff;}  ${selector} span.reverse.fx195 {background-color: #d7ffff; color: inherit;} ${selector} span.reverse.bx195 {color: #d7ffff; background-color: inherit;}
${selector} span.fx196 {color: #ff0000;} ${selector} span.bx196 {background-color: #ff0000;}  ${selector} span.reverse.fx196 {background-color: #ff0000; color: inherit;} ${selector} span.reverse.bx196 {color: #ff0000; background-color: inherit;}
${selector} span.fx197 {color: #ff005f;} ${selector} span.bx197 {background-color: #ff005f;}  ${selector} span.reverse.fx197 {background-color: #ff005f; color: inherit;} ${selector} span.reverse.bx197 {color: #ff005f; background-color: inherit;}
${selector} span.fx198 {color: #ff0087;} ${selector} span.bx198 {background-color: #ff0087;}  ${selector} span.reverse.fx198 {background-color: #ff0087; color: inherit;} ${selector} span.reverse.bx198 {color: #ff0087; background-color: inherit;}
${selector} span.fx199 {color: #ff00af;} ${selector} span.bx199 {background-color: #ff00af;}  ${selector} span.reverse.fx199 {background-color: #ff00af; color: inherit;} ${selector} span.reverse.bx199 {color: #ff00af; background-color: inherit;}
${selector} span.fx200 {color: #ff00d7;} ${selector} span.bx200 {background-color: #ff00d7;}  ${selector} span.reverse.fx200 {background-color: #ff00d7; color: inherit;} ${selector} span.reverse.bx200 {color: #ff00d7; background-color: inherit;}
${selector} span.fx201 {color: #ff00ff;} ${selector} span.bx201 {background-color: #ff00ff;}  ${selector} span.reverse.fx201 {background-color: #ff00ff; color: inherit;} ${selector} span.reverse.bx201 {color: #ff00ff; background-color: inherit;}
${selector} span.fx202 {color: #ff5f00;} ${selector} span.bx202 {background-color: #ff5f00;}  ${selector} span.reverse.fx202 {background-color: #ff5f00; color: inherit;} ${selector} span.reverse.bx202 {color: #ff5f00; background-color: inherit;}
${selector} span.fx203 {color: #ff5f5f;} ${selector} span.bx203 {background-color: #ff5f5f;}  ${selector} span.reverse.fx203 {background-color: #ff5f5f; color: inherit;} ${selector} span.reverse.bx203 {color: #ff5f5f; background-color: inherit;}
${selector} span.fx204 {color: #ff5f87;} ${selector} span.bx204 {background-color: #ff5f87;}  ${selector} span.reverse.fx204 {background-color: #ff5f87; color: inherit;} ${selector} span.reverse.bx204 {color: #ff5f87; background-color: inherit;}
${selector} span.fx205 {color: #ff5faf;} ${selector} span.bx205 {background-color: #ff5faf;}  ${selector} span.reverse.fx205 {background-color: #ff5faf; color: inherit;} ${selector} span.reverse.bx205 {color: #ff5faf; background-color: inherit;}
${selector} span.fx206 {color: #ff5fd7;} ${selector} span.bx206 {background-color: #ff5fd7;}  ${selector} span.reverse.fx206 {background-color: #ff5fd7; color: inherit;} ${selector} span.reverse.bx206 {color: #ff5fd7; background-color: inherit;}
${selector} span.fx207 {color: #ff5fff;} ${selector} span.bx207 {background-color: #ff5fff;}  ${selector} span.reverse.fx207 {background-color: #ff5fff; color: inherit;} ${selector} span.reverse.bx207 {color: #ff5fff; background-color: inherit;}
${selector} span.fx208 {color: #ff8700;} ${selector} span.bx208 {background-color: #ff8700;}  ${selector} span.reverse.fx208 {background-color: #ff8700; color: inherit;} ${selector} span.reverse.bx208 {color: #ff8700; background-color: inherit;}
${selector} span.fx209 {color: #ff875f;} ${selector} span.bx209 {background-color: #ff875f;}  ${selector} span.reverse.fx209 {background-color: #ff875f; color: inherit;} ${selector} span.reverse.bx209 {color: #ff875f; background-color: inherit;}
${selector} span.fx210 {color: #ff8787;} ${selector} span.bx210 {background-color: #ff8787;}  ${selector} span.reverse.fx210 {background-color: #ff8787; color: inherit;} ${selector} span.reverse.bx210 {color: #ff8787; background-color: inherit;}
${selector} span.fx211 {color: #ff87af;} ${selector} span.bx211 {background-color: #ff87af;}  ${selector} span.reverse.fx211 {background-color: #ff87af; color: inherit;} ${selector} span.reverse.bx211 {color: #ff87af; background-color: inherit;}
${selector} span.fx212 {color: #ff87d7;} ${selector} span.bx212 {background-color: #ff87d7;}  ${selector} span.reverse.fx212 {background-color: #ff87d7; color: inherit;} ${selector} span.reverse.bx212 {color: #ff87d7; background-color: inherit;}
${selector} span.fx213 {color: #ff87ff;} ${selector} span.bx213 {background-color: #ff87ff;}  ${selector} span.reverse.fx213 {background-color: #ff87ff; color: inherit;} ${selector} span.reverse.bx213 {color: #ff87ff; background-color: inherit;}
${selector} span.fx214 {color: #ffaf00;} ${selector} span.bx214 {background-color: #ffaf00;}  ${selector} span.reverse.fx214 {background-color: #ffaf00; color: inherit;} ${selector} span.reverse.bx214 {color: #ffaf00; background-color: inherit;}
${selector} span.fx215 {color: #ffaf5f;} ${selector} span.bx215 {background-color: #ffaf5f;}  ${selector} span.reverse.fx215 {background-color: #ffaf5f; color: inherit;} ${selector} span.reverse.bx215 {color: #ffaf5f; background-color: inherit;}
${selector} span.fx216 {color: #ffaf87;} ${selector} span.bx216 {background-color: #ffaf87;}  ${selector} span.reverse.fx216 {background-color: #ffaf87; color: inherit;} ${selector} span.reverse.bx216 {color: #ffaf87; background-color: inherit;}
${selector} span.fx217 {color: #ffafaf;} ${selector} span.bx217 {background-color: #ffafaf;}  ${selector} span.reverse.fx217 {background-color: #ffafaf; color: inherit;} ${selector} span.reverse.bx217 {color: #ffafaf; background-color: inherit;}
${selector} span.fx218 {color: #ffafd7;} ${selector} span.bx218 {background-color: #ffafd7;}  ${selector} span.reverse.fx218 {background-color: #ffafd7; color: inherit;} ${selector} span.reverse.bx218 {color: #ffafd7; background-color: inherit;}
${selector} span.fx219 {color: #ffafff;} ${selector} span.bx219 {background-color: #ffafff;}  ${selector} span.reverse.fx219 {background-color: #ffafff; color: inherit;} ${selector} span.reverse.bx219 {color: #ffafff; background-color: inherit;}
${selector} span.fx220 {color: #ffd700;} ${selector} span.bx220 {background-color: #ffd700;}  ${selector} span.reverse.fx220 {background-color: #ffd700; color: inherit;} ${selector} span.reverse.bx220 {color: #ffd700; background-color: inherit;}
${selector} span.fx221 {color: #ffd75f;} ${selector} span.bx221 {background-color: #ffd75f;}  ${selector} span.reverse.fx221 {background-color: #ffd75f; color: inherit;} ${selector} span.reverse.bx221 {color: #ffd75f; background-color: inherit;}
${selector} span.fx222 {color: #ffd787;} ${selector} span.bx222 {background-color: #ffd787;}  ${selector} span.reverse.fx222 {background-color: #ffd787; color: inherit;} ${selector} span.reverse.bx222 {color: #ffd787; background-color: inherit;}
${selector} span.fx223 {color: #ffd7af;} ${selector} span.bx223 {background-color: #ffd7af;}  ${selector} span.reverse.fx223 {background-color: #ffd7af; color: inherit;} ${selector} span.reverse.bx223 {color: #ffd7af; background-color: inherit;}
${selector} span.fx224 {color: #ffd7d7;} ${selector} span.bx224 {background-color: #ffd7d7;}  ${selector} span.reverse.fx224 {background-color: #ffd7d7; color: inherit;} ${selector} span.reverse.bx224 {color: #ffd7d7; background-color: inherit;}
${selector} span.fx225 {color: #ffd7ff;} ${selector} span.bx225 {background-color: #ffd7ff;}  ${selector} span.reverse.fx225 {background-color: #ffd7ff; color: inherit;} ${selector} span.reverse.bx225 {color: #ffd7ff; background-color: inherit;}
${selector} span.fx226 {color: #ffff00;} ${selector} span.bx226 {background-color: #ffff00;}  ${selector} span.reverse.fx226 {background-color: #ffff00; color: inherit;} ${selector} span.reverse.bx226 {color: #ffff00; background-color: inherit;}
${selector} span.fx227 {color: #ffff5f;} ${selector} span.bx227 {background-color: #ffff5f;}  ${selector} span.reverse.fx227 {background-color: #ffff5f; color: inherit;} ${selector} span.reverse.bx227 {color: #ffff5f; background-color: inherit;}
${selector} span.fx228 {color: #ffff87;} ${selector} span.bx228 {background-color: #ffff87;}  ${selector} span.reverse.fx228 {background-color: #ffff87; color: inherit;} ${selector} span.reverse.bx228 {color: #ffff87; background-color: inherit;}
${selector} span.fx229 {color: #ffffaf;} ${selector} span.bx229 {background-color: #ffffaf;}  ${selector} span.reverse.fx229 {background-color: #ffffaf; color: inherit;} ${selector} span.reverse.bx229 {color: #ffffaf; background-color: inherit;}
${selector} span.fx230 {color: #ffffd7;} ${selector} span.bx230 {background-color: #ffffd7;}  ${selector} span.reverse.fx230 {background-color: #ffffd7; color: inherit;} ${selector} span.reverse.bx230 {color: #ffffd7; background-color: inherit;}
${selector} span.fx231 {color: #ffffff;} ${selector} span.bx231 {background-color: #ffffff;}  ${selector} span.reverse.fx231 {background-color: #ffffff; color: inherit;} ${selector} span.reverse.bx231 {color: #ffffff; background-color: inherit;}
${selector} span.fx232 {color: #080808;} ${selector} span.bx232 {background-color: #080808;}  ${selector} span.reverse.fx232 {background-color: #080808; color: inherit;} ${selector} span.reverse.bx232 {color: #080808; background-color: inherit;}
${selector} span.fx233 {color: #121212;} ${selector} span.bx233 {background-color: #121212;}  ${selector} span.reverse.fx233 {background-color: #121212; color: inherit;} ${selector} span.reverse.bx233 {color: #121212; background-color: inherit;}
${selector} span.fx234 {color: #1c1c1c;} ${selector} span.bx234 {background-color: #1c1c1c;}  ${selector} span.reverse.fx234 {background-color: #1c1c1c; color: inherit;} ${selector} span.reverse.bx234 {color: #1c1c1c; background-color: inherit;}
${selector} span.fx235 {color: #262626;} ${selector} span.bx235 {background-color: #262626;}  ${selector} span.reverse.fx235 {background-color: #262626; color: inherit;} ${selector} span.reverse.bx235 {color: #262626; background-color: inherit;}
${selector} span.fx236 {color: #303030;} ${selector} span.bx236 {background-color: #303030;}  ${selector} span.reverse.fx236 {background-color: #303030; color: inherit;} ${selector} span.reverse.bx236 {color: #303030; background-color: inherit;}
${selector} span.fx237 {color: #3a3a3a;} ${selector} span.bx237 {background-color: #3a3a3a;}  ${selector} span.reverse.fx237 {background-color: #3a3a3a; color: inherit;} ${selector} span.reverse.bx237 {color: #3a3a3a; background-color: inherit;}
${selector} span.fx238 {color: #444444;} ${selector} span.bx238 {background-color: #444444;}  ${selector} span.reverse.fx238 {background-color: #444444; color: inherit;} ${selector} span.reverse.bx238 {color: #444444; background-color: inherit;}
${selector} span.fx239 {color: #4e4e4e;} ${selector} span.bx239 {background-color: #4e4e4e;}  ${selector} span.reverse.fx239 {background-color: #4e4e4e; color: inherit;} ${selector} span.reverse.bx239 {color: #4e4e4e; background-color: inherit;}
${selector} span.fx240 {color: #585858;} ${selector} span.bx240 {background-color: #585858;}  ${selector} span.reverse.fx240 {background-color: #585858; color: inherit;} ${selector} span.reverse.bx240 {color: #585858; background-color: inherit;}
${selector} span.fx241 {color: #626262;} ${selector} span.bx241 {background-color: #626262;}  ${selector} span.reverse.fx241 {background-color: #626262; color: inherit;} ${selector} span.reverse.bx241 {color: #626262; background-color: inherit;}
${selector} span.fx242 {color: #6c6c6c;} ${selector} span.bx242 {background-color: #6c6c6c;}  ${selector} span.reverse.fx242 {background-color: #6c6c6c; color: inherit;} ${selector} span.reverse.bx242 {color: #6c6c6c; background-color: inherit;}
${selector} span.fx243 {color: #767676;} ${selector} span.bx243 {background-color: #767676;}  ${selector} span.reverse.fx243 {background-color: #767676; color: inherit;} ${selector} span.reverse.bx243 {color: #767676; background-color: inherit;}
${selector} span.fx244 {color: #808080;} ${selector} span.bx244 {background-color: #808080;}  ${selector} span.reverse.fx244 {background-color: #808080; color: inherit;} ${selector} span.reverse.bx244 {color: #808080; background-color: inherit;}
${selector} span.fx245 {color: #8a8a8a;} ${selector} span.bx245 {background-color: #8a8a8a;}  ${selector} span.reverse.fx245 {background-color: #8a8a8a; color: inherit;} ${selector} span.reverse.bx245 {color: #8a8a8a; background-color: inherit;}
${selector} span.fx246 {color: #949494;} ${selector} span.bx246 {background-color: #949494;}  ${selector} span.reverse.fx246 {background-color: #949494; color: inherit;} ${selector} span.reverse.bx246 {color: #949494; background-color: inherit;}
${selector} span.fx247 {color: #9e9e9e;} ${selector} span.bx247 {background-color: #9e9e9e;}  ${selector} span.reverse.fx247 {background-color: #9e9e9e; color: inherit;} ${selector} span.reverse.bx247 {color: #9e9e9e; background-color: inherit;}
${selector} span.fx248 {color: #a8a8a8;} ${selector} span.bx248 {background-color: #a8a8a8;}  ${selector} span.reverse.fx248 {background-color: #a8a8a8; color: inherit;} ${selector} span.reverse.bx248 {color: #a8a8a8; background-color: inherit;}
${selector} span.fx249 {color: #b2b2b2;} ${selector} span.bx249 {background-color: #b2b2b2;}  ${selector} span.reverse.fx249 {background-color: #b2b2b2; color: inherit;} ${selector} span.reverse.bx249 {color: #b2b2b2; background-color: inherit;}
${selector} span.fx250 {color: #bcbcbc;} ${selector} span.bx250 {background-color: #bcbcbc;}  ${selector} span.reverse.fx250 {background-color: #bcbcbc; color: inherit;} ${selector} span.reverse.bx250 {color: #bcbcbc; background-color: inherit;}
${selector} span.fx251 {color: #c6c6c6;} ${selector} span.bx251 {background-color: #c6c6c6;}  ${selector} span.reverse.fx251 {background-color: #c6c6c6; color: inherit;} ${selector} span.reverse.bx251 {color: #c6c6c6; background-color: inherit;}
${selector} span.fx252 {color: #d0d0d0;} ${selector} span.bx252 {background-color: #d0d0d0;}  ${selector} span.reverse.fx252 {background-color: #d0d0d0; color: inherit;} ${selector} span.reverse.bx252 {color: #d0d0d0; background-color: inherit;}
${selector} span.fx253 {color: #dadada;} ${selector} span.bx253 {background-color: #dadada;}  ${selector} span.reverse.fx253 {background-color: #dadada; color: inherit;} ${selector} span.reverse.bx253 {color: #dadada; background-color: inherit;}
${selector} span.fx254 {color: #e4e4e4;} ${selector} span.bx254 {background-color: #e4e4e4;}  ${selector} span.reverse.fx254 {background-color: #e4e4e4; color: inherit;} ${selector} span.reverse.bx254 {color: #e4e4e4; background-color: inherit;}
${selector} span.fx255 {color: #eeeeee;} ${selector} span.bx255 {background-color: #eeeeee;}  ${selector} span.reverse.fx255 {background-color: #eeeeee; color: inherit;} ${selector} span.reverse.bx255 {color: #eeeeee; background-color: inherit;}

${selector} span.cursor { color: #000; background-color: #ccc; }"""