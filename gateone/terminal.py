# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '1.0'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
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
import re, logging, base64, copy, StringIO, codecs
from datetime import datetime, timedelta
from collections import defaultdict
from itertools import imap, izip

# Import our own stuff
from utils import get_translation

# Import 3rd party stuff
try:
    # We need PIL to detect image types and get their dimensions.  Without the
    # dimenions, the browser will render the terminal screen much slower than
    # normal.  Without PIL images will be displayed simply as:
    #   <i>Image file</i>
    from PIL import Image
except ImportError:
    Image = None
    logging.warning(
        "Could not import the Python Imaging Library (PIL) "
        "so images will not be displayed in the terminal")

_ = get_translation()

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
        self.cur_rendition = [0]
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
        self.image = bytearray()

    def init_screen(self):
        """
        Fills :attr:`screen` with empty lines of (unicode) spaces using
        :attr:`self.cols` and :attr:`self.rows` for the dimensions.

        .. note:: Just because each line starts out with a uniform length does not mean it will stay that way.  Processing of escape sequences is handled when an output function is called.
        """
        self.screen = [
            [u' ' for a in xrange(self.cols)] for b in xrange(self.rows)
        ]
        # Tabstops
        tabs, remainder = divmod(self.cols, 8) # Default is every 8 chars
        self.tabstops = [(a*8)-1 for a in xrange(tabs)]
        self.tabstops[0] = 0 # Fix the first tabstop (which will be -1)
        # Base cursor position
        self.cursorX = 0
        self.cursorY = 0
        self.rendition_set = False

    def init_renditions(self):
        """
        Fills :attr:`self.renditions` with lists of [0] using :attr:`self.cols`
        and :attr:`self.rows` for the dimenions.
        """
        self.renditions = [
            [[0] for a in xrange(self.cols)] for b in xrange(self.rows)
        ]

    def init_scrollback(self):
        """
        Empties the scrollback buffers (:attr:`self.scrollback_buf` and
        :attr:`self.scrollback_renditions`).
        """
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
                line = [u' ' for a in xrange(cols)]
                renditions = [[0] for a in xrange(self.cols)]
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
                    self.renditions[i].append([0])
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
            self.top_margin = max(0, int(top) - 1) # These are 0-based like self.cursor[XY]
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
                [u'E' for a in xrange(self.cols)] for b in xrange(self.rows)
            ]
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
        #logging.debug('handling chars: %s' % `chars`)
        if special_checks:
            # NOTE: Special checks are limited to PNGs and JPEGs right now
            before_chars = ""
            after_chars = ""
            for magic_header in magic.keys():
                if magic_header.match(chars):
                    self.matched_header = magic_header
                    # TODO: Add a timeout here
                    self.timeout_image = datetime.now()
            if self.image or self.matched_header:
                self.image.extend(chars)
                match = magic[self.matched_header].match(self.image)
                if match:
                    #logging.debug("Matched image format.  Capturing...")
                    before_chars, after_chars = magic[
                            self.matched_header].split(self.image)
                    # Eliminate anything before the match
                    self.image = match.group()
                    self._capture_image()
                    self.image = bytearray() # Empty it now that is is captured
                    self.matched_header = None # Ditto
                if before_chars:
                    self.write(before_chars, special_checks=False)
                if after_chars:
                    self.write(after_chars, special_checks=False)
                # If we haven't got a complete image after one second something
                # went wrong.  Discard what we've got and restart.
                one_second = timedelta(seconds=1)
                if datetime.now() - self.timeout_image > one_second:
                    self.image = bytearray() # Empty it
                    self.matched_header = None
                    chars = _("Failed to decode image.  Buffer discarded.")
                else:
                    return
        # Have to convert to unicode
        try:
            chars = unicode(chars.decode('utf-8', "handle_special"))
        except UnicodeEncodeError:
            # Just in case
            try:
                chars = unicode(chars.decode('utf-8', "ignore"))
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
                            #logging.warning(_(
                                #"Warning: No ESC sequence handler for %s"
                                #% `self.esc_buffer`
                            #))
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
                        # Use plain ASCII if the char wasn't found (means it
                        # isn't a special line drawing character).
                        self.screen[self.cursorY][self.cursorX] = char
                except IndexError:
                    # This can happen when escape sequences go haywire
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
        for x in xrange(int(n)):
            line = self.screen.pop(self.top_margin) # Remove the top line
            self.scrollback_buf.append(line) # Add it to the scrollback buffer
            if len(self.scrollback_buf) > 1000:
                # 1000 lines ought to be enough for anybody
                self.init_scrollback()
                # NOTE:  This would only be if 1000 lines piled up before the
                # next dump_html() or dump().
            empty_line = [u' ' for a in xrange(self.cols)] # Line full of spaces
            # Add it to the bottom of the window:
            self.screen.insert(self.bottom_margin, empty_line)
            # Remove top line's style information
            style = self.renditions.pop(self.top_margin)
            self.scrollback_renditions.append(style)
            # Insert a new empty rendition as well:
            self.renditions.insert(
                self.bottom_margin, [[0] for a in xrange(self.cols)])
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
        for x in xrange(int(n)):
            self.screen.pop(self.bottom_margin) # Remove the bottom line
            empty_line = [u' ' for a in xrange(self.cols)] # Line full of spaces
            self.screen.insert(self.top_margin, empty_line) # Add it to the top
            # Remove bottom line's style information:
            self.renditions.pop(self.bottom_margin)
            # Insert a new empty one:
            self.renditions.insert(
                self.top_margin, [[0] for a in xrange(self.cols)])
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
            empty_line = [u' ' for a in xrange(self.cols)] # Line full of spaces
            self.screen.insert(self.cursorY, empty_line) # Insert at cursor
            # Insert a new empty rendition as well:
            self.renditions.insert(self.cursorY, [[0] for a in xrange(self.cols)])

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
            # Now add an empty line and empty set of renditions to the bottom of the
            # view
            empty_line = [u' ' for a in xrange(self.cols)] # Line full of spaces
            # Add it to the bottom of the view:
            self.screen.insert(self.bottom_margin, empty_line) # Insert at bottom
            # Insert a new empty rendition as well:
            self.renditions.insert(
                self.bottom_margin, [[0] for a in xrange(self.cols)])

    def backspace(self):
        """Execute a backspace (\\x08)"""
        try:
            self.renditions[self.cursorY][self.cursorX] = []
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
        stores self.image as if it were a single character in
        :attr:`self.screen` at the current cursor position.

        It also moves the cursor to the beginning of the last line before doing
        this in order to ensure that the captured image stays within the
        browser's current window.

        .. note:: The :meth:`Terminal._spanify_screen` function is aware of this logic and knows that a 'character' longer than an actual character indicates the presence of something like an image that needs special processing.
        """
        logging.debug("_capture_image() len(self.image): %s" % len(self.image))
        # Remove the extra \r's that the terminal adds:
        self.image = self.image.replace('\r\n', '\n')
        if Image: # PIL is loaded--try to guess how many lines the image takes
            i = StringIO.StringIO(self.image)
            try:
                im = Image.open(i)
            except IOError:
                # i.e. PIL couldn't identify the file
                return # Don't do anything--bad image
        else: # No PIL means no images.  Don't bother wasting memory.
            return
        if self.em_dimensions:
            # Make sure the image will fit properly in the screen
            width = im.size[0]
            height = im.size[1]
            if height <= self.em_dimensions['height']:
                # Fits within a line.  No need for a newline
                num_chars = int(width/self.em_dimensions['width'])
                # Put the image at the current cursor location
                self.screen[self.cursorY][self.cursorX] = self.image
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
                self.screen[self.cursorY][self.cursorX] = self.image
                self.newline()
        else:
            # No way to calculate the number of lines the image will take
            self.cursorY = self.rows - 1 # Move to the end of the screen
            # ... so it doesn't get cut off at the top
            self.screen[self.cursorY][self.cursorX] = self.image
            self.newline() # Make some space at the bottom too just in case
            self.newline()

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
        if alt:
            # Save the existing screen and renditions
            self.alt_screen = copy.copy(self.screen)
            self.alt_renditions = copy.copy(self.renditions)
            # Make a fresh one
            self.clear_screen()
        else:
            # Restore the screen
            if self.alt_screen and self.alt_renditions:
                self.screen = self.alt_screen
                self.renditions = self.alt_renditions
            # Empty out the alternate buffer (to save memory)
            self.alt_screen = None
            self.alt_renditions = None
        self.cur_rendition = []

    def toggle_alternate_screen_buffer_cursor(self, alt):
        """
        Same as :meth:`Terminal.toggle_alternate_screen_buffer` but also
        saves/restores the cursor location.
        """
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
        logging.debug("send_receive_mode(%s)" % repr(onoff))
        # This has been disabled because it might only be meant for the
        # underlying program and not the terminal emulator.  Needs research.
        #if onoff:
            #self.local_echo = False
        #else:
            #self.local_echo = True

    def insert_characters(self, n=1):
        """Inserts the specified number of characters at the cursor position."""
        n = int(n)
        for i in xrange(n):
            self.screen[self.cursorY].pop() # Take one down, pass it around
            self.screen[self.cursorY].insert(self.cursorX, u' ')

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
        if not n: # e.g. n == ''
            n = 1
        else:
            n = int(n)
        for i in xrange(n):
            try:
                self.screen[self.cursorY].pop(self.cursorX)
                self.screen[self.cursorY].append(u' ')
                self.renditions[self.cursorY].pop(self.cursorX)
                self.renditions[self.cursorY].append([0])
            except IndexError:
                # At edge of screen, ignore
                pass

    def _erase_characters(self, n=1):
        """
        Erases (to the right) the specified number of characters at the cursor
        position.

        .. note:: Deletes renditions too.
        """
        if not n: # e.g. n == ''
            n = 1
        else:
            n = int(n)
        distance = self.cols - self.cursorX
        n = min(n, distance)
        for i in xrange(n):
            self.screen[self.cursorY][self.cursorX+i] = u' '
            self.renditions[self.cursorY][self.cursorX+i] = [0]

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
        self.init_screen()
        self.renditions = [
            [self.cur_rendition for a in xrange(self.cols)
                ] for b in xrange(self.rows)
        ]
        self.cursorX = 0
        self.cursorY = 0

    def clear_screen_from_cursor_down(self):
        """
        Clears the screen from the cursor down (ESC[J or ESC[0J).
        """
        self.screen[self.cursorY:] = [
           [u' ' for a in xrange(self.cols)] for a in self.screen[self.cursorY:]
        ]
        self.renditions[self.cursorY:] = [
           [self.cur_rendition for a in xrange(self.cols)] for a in self.screen[
               self.cursorY:]
        ]
        self.cursorX = 0

    def clear_screen_from_cursor_up(self):
        """
        Clears the screen from the cursor up (ESC[1J).
        """
        self.screen[:self.cursorY+1] = [
           [u' ' for a in xrange(self.cols)] for a in self.screen[:self.cursorY]
        ]
        self.renditions[:self.cursorY+1] = [
           [[0] for a in xrange(self.cols)] for a in self.screen[:self.cursorY]
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
        self.screen[self.cursorY][self.cursorX:] = [
            u' ' for a in self.screen[self.cursorY][self.cursorX:]]
        # Reset the cursor position's rendition to the end of the line
        self.renditions[self.cursorY][self.cursorX:] = [
            self.cur_rendition for a in self.screen[self.cursorY][self.cursorX:]]

    def clear_line_from_cursor_left(self):
        """
        Clears the screen from the cursor left (ESC[1K).
        """
        saved = self.screen[self.cursorY][self.cursorX:]
        saved_renditions = self.renditions[self.cursorY][self.cursorX:]
        self.screen[self.cursorY] = [
            u' ' for a in self.screen[self.cursorY][:self.cursorX]
        ] + saved
        self.renditions[self.cursorY] = [
            [] for a in self.screen[self.cursorY][:self.cursorX]
        ] + saved_renditions

    def clear_line(self):
        """
        Clears the entire line (ESC[2K).
        """
        self.screen[self.cursorY] = [u' ' for a in xrange(self.cols)]
        self.renditions[self.cursorY] = [[0] for a in xrange(self.cols)]
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
        states = n.split(';')
        for state in states:
            state = int(state)
            if state == 0:
                self.leds[1] = False
                self.leds[2] = False
                self.leds[3] = False
                self.leds[4] = False
            else:
                self.leds[state] = True
        try:
            for callback in self.callbacks[CALLBACK_LEDS].values():
                callback()
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
        # TODO: Make this whole thing faster (or prove it isn't possible).
        cursorY = self.cursorY
        cursorX = self.cursorX
        #logging.debug("Setting rendition: %s at %s, %s" % (repr(n), cursorY, cursorX))
        if cursorX >= self.cols: # We're at the end of the row
            if len(self.renditions[cursorY]) <= cursorX:
                # Make it all longer
                #logging.debug("Making line %s longer" % self.cursorY)
                self.renditions[cursorY].append([]) # Make it longer
                self.screen[cursorY].append('\x00') # This needs to match
        if cursorY >= self.rows:
            # This should never happen
            logging.error(_(
                "cursorY >= self.rows! This should not happen! Bug!"))
            return # Don't bother setting renditions past the bottom
        if not n: # or \x1b[m (reset)
            self.cur_rendition = [0]
            return # No need for further processing; save some CPU
        # Convert the string (e.g. '0;1;32') to a list (e.g. [0,1,32]
        new_renditions = [int(a) for a in n.split(';') if a != '']
        # Handle 256-color renditions by getting rid of the (38|48);5 part and
        # incrementing foregrounds by 1000 and backgrounds by 10000 so we can
        # tell them apart in __spanify_screen().
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
                    # This is a valid 256-color rendition (38;5;<num>)
                    new_renditions.pop(background_index) # Goodbye 38
                    new_renditions.pop(background_index) # Goodbye 5
                    new_renditions[background_index] += 10000
        out_renditions = []
        for rend in new_renditions:
            if rend == 0:
                out_renditions = [0]
                # A 0 indicates reset so we don't want the last rendition to be
                # combined with this new one.  By setting the last rendition to
                # just [0] we're ensuring that _reduce_renditions() returns just
                # this rendition and not the previous one + this one.
                self.cur_rendition = [0]
                return
            else:
                out_renditions.append(rend)
        new_renditions = out_renditions
        reduced = _reduce_renditions(self.cur_rendition + new_renditions)
        self.cur_rendition = reduced

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
        results = []
        rendition_classes = RENDITION_CLASSES
        screen = self.screen
        renditions = self.renditions
        cursorX = self.cursorX
        cursorY = self.cursorY
        spancount = 0
        current_classes = []
        prev_rendition = None
        foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        for linecount, line_rendition in enumerate(izip(screen, renditions)):
            line = line_rendition[0]
            rendition = line_rendition[1]
            outline = ""
            charcount = 0
            for char, rend in izip(line, rendition):
                if len(char) > 1: # Special stuff =)
                    # Obviously, not really a single character
                    if not Image: # Can't use images in the terminal
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    image_data = char
                    # PIL likes file objects
                    i = StringIO.StringIO(image_data)
                    try:
                        im = Image.open(i)
                    except IOError:
                        # i.e. PIL couldn't identify the file
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    if len(image_data) > 50000: # TODO: Make this adjustable
                        # Probably too big to send to browser as a data URI.
                        if im: # Resize it...
                            # 640x480 should come in <32k for most stuff
                            try:
                                im.thumbnail((640, 480), Image.ANTIALIAS)
                                f = StringIO.StringIO()
                                im.save(f, im.format)
                                f.seek(0)
                                # Convert back to bytearray
                                image_data = bytearray(f.read())
                            except IOError:
                                # Sometimes PIL will throw this if it can't read
                                # the image.
                                outline += "<i>Problem displaying this image</i>"
                                continue
                        else: # Generic error
                            outline += "<i>Problem displaying this image</i>"
                            continue
                    # Need to encode base64 to create a data URI
                    # Python 2.6 doesn't like passing bytearrays to b64encode:
                    image_data = bytes(image_data) # This isn't necessary in 2.7
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
            if outline:
                results.append(outline)
            else:
                results.append(None) # 'null' is shorter than 4 spaces
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
        screen = self.scrollback_buf
        renditions = self.scrollback_renditions
        rendition_classes = RENDITION_CLASSES
        spancount = 0
        current_classes = []
        prev_rendition = None
        foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        for line, rendition in izip(screen, renditions):
            outline = ""
            for char, rend in izip(line, rendition):
                if len(char) > 1: # Special stuff =)
                    # Obviously, not really a single character
                    if not Image: # Can't use images in the terminal
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    image_data = char
                    # PIL likes file objects
                    i = StringIO.StringIO(image_data)
                    try:
                        im = Image.open(i)
                    except IOError:
                        # i.e. PIL couldn't identify the file
                        outline += "<i>Image file</i>"
                        continue # Can't do anything else
                    if len(image_data) > 50000: # TODO: Make this adjustable
                        # Probably too big to send to browser as a data URI.
                        if im: # Resize it...
                            # 640x480 should come in <32k for most stuff
                            im.thumbnail((640, 480), Image.ANTIALIAS)
                            f = StringIO.StringIO()
                            im.save(f, im.format)
                            f.seek(0)
                            # Convert back to bytearray
                            image_data = bytearray(f.read())
                        else: # Generic error
                            outline += "<i>Problem displaying this image</i>"
                            continue
                    # Need to encode base64 to create a data URI
                    encoded = base64.b64encode(image_data).replace('\n', '')
                    data_uri = "data:image/%s;base64,%s" % (
                        im.format.lower(), encoded)
                    outline += '\n<img src="%s" width="%s" height="%s">\n' % (
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

    def dump_html(self):
        """
        Dumps the terminal screen as a list of HTML-formatted lines.

        .. note:: This places <span class="cursor">(current character)</span> around the cursor location.
        """
        # NOTE: On my laptop this function will take about 30ms to complete
        # a full-screen 'top' refresh on a 57x209 screen.
        # In other words, it is pretty fast...  Not much optimization necessary
        results = self._spanify_screen()
        scrollback = []
        if self.scrollback_buf:
            scrollback = self._spanify_scrollback()
        # Empty the scrollback buffer:
        self.init_scrollback()
        self.modified = False
        return (scrollback, results)

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