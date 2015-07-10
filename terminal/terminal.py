# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '1.1'
__version_info__ = (1, 1)
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
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

====================================    ================================================================================
Callback Constant (ID)                  Called when...
====================================    ================================================================================
:attr:`terminal.CALLBACK_SCROLL_UP`     The terminal is scrolled up (back).
:attr:`terminal.CALLBACK_CHANGED`       The screen is changed/updated.
:attr:`terminal.CALLBACK_CURSOR_POS`    The cursor position changes.
:attr:`terminal.CALLBACK_DSR`           A Device Status Report (DSR) is requested (via the DSR escape sequence).
:attr:`terminal.CALLBACK_TITLE`         The terminal title changes (xterm-style)
:attr:`terminal.CALLBACK_BELL`          The bell character (^G) is encountered.
:attr:`terminal.CALLBACK_OPT`           The special optional escape sequence is encountered.
:attr:`terminal.CALLBACK_MODE`          The terminal mode setting changes (e.g. use alternate screen buffer).
:attr:`terminal.CALLBACK_MESSAGE`       The terminal needs to send the user a message (without messing with the screen).
====================================    ================================================================================

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
import os, sys, re, logging, base64, codecs, unicodedata, tempfile, struct
from io import BytesIO
from array import array
from datetime import datetime, timedelta
from functools import partial
from collections import defaultdict
try:
    from collections import OrderedDict
except ImportError: # Python <2.7 didn't have OrderedDict in collections
    try:
        from ordereddict import OrderedDict
    except ImportError:
        logging.error(
            "Error: Could not import OrderedDict.  Please install it:")
        logging.error("\tsudo pip install ordereddict")
        logging.error(
            "...or download it from http://pypi.python.org/pypi/ordereddict")
        sys.exit(1)
try:
    from itertools import imap, izip
except ImportError:  # Python 3 doesn't have imap or izip in itertool
    imap = map
    izip = zip
try:
    xrange = xrange
except NameError:  # Python 3 doesn't have xrange()
    xrange = range
try:
    unichr = unichr
except NameError:  # Python 3 doesn't have unichr()
    unichr = chr
try:
    basestring = basestring
except NameError:  # Python 3 doesn't have basestring
    basestring = (str, bytes)

# Inernationalization support
_ = str # So pyflakes doesn't complain
import gettext
gettext.install('terminal')

# Globals
_logged_pil_warning = False # Used so we don't spam the user with warnings
_logged_mutagen_warning = False # Ditto
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
# Called when the terminal emulator encounters a situation where it wants to
# tell the user about something (say, an error decoding an image) without
# interfering with the terminal's screen.
CALLBACK_MESSAGE = 12

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
    10: 'fontreset', # NOTE: The font renditions don't do anything right now
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
    39: 'foregroundreset', # Special: Set FG to default
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
# TODO:  Handle the ESC sequence that sets the colors from 90-87 (e.g. ESC]91;orange/brown^G)
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

RESET_CLASSES = set([
    'backgroundreset',
    'boldreset',
    'dimreset',
    'italicreset',
    'underlinereset',
    'reversereset',
    'hiddenreset',
    'strikereset',
    'resetfont'
])

try:
    unichr(0x10000) # Will throw a ValueError on narrow Python builds
    SPECIAL = 1048576 # U+100000 or unichr(SPECIAL) (start of Plane 16)
except:
    SPECIAL = 63561

def handle_special(e):
    """
    Used in conjunction with :py:func:`codecs.register_error`, will replace
    special ascii characters such as 0xDA and 0xc4 (which are used by ncurses)
    with their Unicode equivalents.
    """
    # TODO: Get this using curses special characters when appropriate
    #curses_specials = {
        ## NOTE: When $TERM is set to "Linux" these end up getting used by things
        ##       like ncurses-based apps.  In other words, it makes a whole lot
        ##       of ugly look pretty again.
        #0xda: u'┌', # ACS_ULCORNER
        #0xc0: u'└', # ACS_LLCORNER
        #0xbf: u'┐', # ACS_URCORNER
        #0xd9: u'┘', # ACS_LRCORNER
        #0xb4: u'├', # ACS_RTEE
        #0xc3: u'┤', # ACS_LTEE
        #0xc1: u'┴', # ACS_BTEE
        #0xc2: u'┬', # ACS_TTEE
        #0xc4: u'─', # ACS_HLINE
        #0xb3: u'│', # ACS_VLINE
        #0xc5: u'┼', # ACS_PLUS
        #0x2d: u'', # ACS_S1
        #0x5f: u'', # ACS_S9
        #0x60: u'◆', # ACS_DIAMOND
        #0xb2: u'▒', # ACS_CKBOARD
        #0xf8: u'°', # ACS_DEGREE
        #0xf1: u'±', # ACS_PLMINUS
        #0xf9: u'•', # ACS_BULLET
        #0x3c: u'←', # ACS_LARROW
        #0x3e: u'→', # ACS_RARROW
        #0x76: u'↓', # ACS_DARROW
        #0x5e: u'↑', # ACS_UARROW
        #0xb0: u'⊞', # ACS_BOARD
        #0x0f: u'⨂', # ACS_LANTERN
        #0xdb: u'█', # ACS_BLOCK
    #}
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
    chars = e.object
    if bytes == str: # Python 2
        # Convert e.object to a bytearray for an easy switch to integers.
        # It is quicker than calling ord(char) on each char in e.object
        chars = bytearray(e.object)
        # NOTE: In Python 3 when you iterate over bytes they appear as integers.
        #       So we don't need to convert to a bytearray in Python 3.
    if isinstance(e, (UnicodeEncodeError, UnicodeTranslateError)):
        s = [u'%s' % specials[c] for c in chars[e.start:e.end]]
        return ''.join(s), e.end
    else:
        s = [u'%s' % specials[c] for c in chars[e.start:e.end]]
        return ''.join(s), e.end
codecs.register_error('handle_special', handle_special)

# TODO List:
#
#   * We need unit tests!
#   * Add a function that can dump the screen with text renditions represented as their usual escape sequences so applications that try to perform screen-scraping can match things like '\x1b[41mAuthentication configuration' without having to find specific character positions and then examining the renditions on that line.

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
    for rend in renditions:
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

def unicode_counter():
    """
    A generator that returns incrementing Unicode characters that can be used as
    references inside a Unicode array.  For example::

        >>> counter = unicode_counter()
        >>> mapping_dict = {}
        >>> some_array = array('u')
        >>> # Pretend 'marker ...' below is a reference to something important
        >>> for i, c in enumerate(u'some string'):
        ...     if c == u' ': # Mark the location of spaces
        ...         # Perform some operation where we need to save a value
        ...         result = some_evaluation(i, c)
        ...         # Save some memory by storing a reference to result instead
        ...         # of the same result over and over again
        ...         if result not in mapping_dict.values():
        ...             marker = counter.next()
        ...             some_array.append(marker)
        ...             mapping_dict[marker] = result
        ...         else: # Find the existing reference so we can use it again
        ...             for k, v in mapping_dict.items():
        ...                 if v == result: # Use the existing value
        ...                     some_array.append(k)
        ...     else:
        ...         some_array.append('\x00') # \x00 == "not interesting" placeholder
        >>>

    Now we could iterate over 'some string' and some_array simultaneously using
    zip(u'some string', some_array) to access those reference markers when we
    encountered the correct position.  This can save a lot of memory if you need
    to store objects in memory that have a tendancy to repeat (e.g. text
    rendition lists in a terminal).

    .. note:: Meant to be used inside the renditions array to reference text rendition lists such as `[0, 1, 34]`.
    """
    n = 1000 # Start at 1000 so we can use lower characters for other things
    while True:
        yield unichr(n)
        if n == 65535: # The end of unicode in narrow builds of Python
            n = 0 # Reset
        else:
            n += 1

# NOTE:  Why use a unicode array() to store references instead of just a regular array()?  Two reasons:  1) Large namespace.  2) Only need to use one kind of array for everything (convenience).  It is also a large memory savings over "just using a list with references to items in a dict."
def pua_counter():
    """
    A generator that returns a Unicode Private Use Area (PUA) character starting
    at the beginning of Plane 16 (U+100000); counting up by one with each
    successive call.  If this is a narrow Python build the tail end of Plane 15
    will be used as a fallback (with a lot less characters).

    .. note::

        Meant to be used as references to non-text objects in the screen array()
        (since it can only contain unicode characters)
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

def convert_to_timedelta(time_val):
    """
    Given a *time_val* (string) such as '5d', returns a `datetime.timedelta`
    object representing the given value (e.g. `timedelta(days=5)`).  Accepts the
    following '<num><char>' formats:

    =========   ============ =========================
    Character   Meaning      Example
    =========   ============ =========================
    (none)      Milliseconds '500' -> 500 Milliseconds
    s           Seconds      '60s' -> 60 Seconds
    m           Minutes      '5m'  -> 5 Minutes
    h           Hours        '24h' -> 24 Hours
    d           Days         '7d'  -> 7 Days
    M           Months       '2M'  -> 2 Months
    y           Years        '10y' -> 10 Years
    =========   ============ =========================

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
    try:
        num = int(time_val)
        return timedelta(milliseconds=num)
    except ValueError:
        pass
    num = int(time_val[:-1])
    if time_val.endswith('s'):
        return timedelta(seconds=num)
    elif time_val.endswith('m'):
        return timedelta(minutes=num)
    elif time_val.endswith('h'):
        return timedelta(hours=num)
    elif time_val.endswith('d'):
        return timedelta(days=num)
    elif time_val.endswith('M'):
        return timedelta(days=(num*30))  # Yeah this is approximate
    elif time_val.endswith('y'):
        return timedelta(days=(num*365)) # Sorry, no leap year support

def total_seconds(td):
    """
    Given a timedelta (*td*) return an integer representing the equivalent of
    Python 2.7's :meth:`datetime.timdelta.total_seconds`.
    """
    return (((
        td.microseconds +
        (td.seconds + td.days * 24 * 3600) * 10**6) / 10**6))

# NOTE:  This is something I'm investigating as a way to use the new go_async
# module.  A work-in-progress.  Ignore for now...
def spanify_screen(state_obj):
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
    #special = SPECIAL
    rendition_classes = RENDITION_CLASSES
    html_cache = state_obj['html_cache']
    screen = state_obj['screen']
    renditions = state_obj['renditions']
    renditions_store = state_obj['renditions_store']
    cursorX = state_obj['cursorX']
    cursorY = state_obj['cursorY']
    show_cursor = state_obj['show_cursor']
    class_prefix = state_obj['class_prefix']
    #captured_files = state_obj['captured_files']
    spancount = 0
    current_classes = set()
    prev_rendition = None
    foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
    backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
    html_entities = {"&": "&amp;", '<': '&lt;', '>': '&gt;'}
    cursor_span = '<span class="%scursor">' % class_prefix
    for linecount, line_rendition in enumerate(izip(screen, renditions)):
        line = line_rendition[0]
        rendition = line_rendition[1]
        combined = (line + rendition).tounicode()
        if html_cache and combined in html_cache:
            # Always re-render the line with the cursor (or just had it)
            if cursor_span not in html_cache[combined]:
                # Use the cache...
                results.append(html_cache[combined])
                continue
        if not len(line.tounicode().rstrip()) and linecount != cursorY:
            results.append(line.tounicode())
            continue # Line is empty so we don't need to process renditions
        outline = ""
        if current_classes:
            outline += '<span class="%s%s">' % (
                class_prefix,
                (" %s" % class_prefix).join(current_classes))
        charcount = 0
        for char, rend in izip(line, rendition):
            rend = renditions_store[rend] # Get actual rendition
            #if ord(char) >= special: # Special stuff =)
                ## Obviously, not really a single character
                #if char in captured_files:
                    #outline += captured_files[char].html()
                    #continue
            changed = True
            if char in "&<>":
                # Have to convert ampersands and lt/gt to HTML entities
                char = html_entities[char]
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
                                current_classes = set()
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
                                    except KeyError:
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
                            current_classes.add(_class)
                if current_classes:
                    outline += '<span class="%s%s">' % (
                        class_prefix,
                        (" %s" % class_prefix).join(current_classes))
                    spancount += 1
            if linecount == cursorY and charcount == cursorX: # Cursor
                if show_cursor:
                    outline += '<span class="%scursor">%s</span>' % (
                        class_prefix, char)
                else:
                    outline += char
            else:
                outline += char
            charcount += 1
        if outline:
            # Make sure all renditions terminate at the end of the line
            for whatever in xrange(spancount):
                outline += "</span>"
            results.append(outline)
            if html_cache:
                html_cache[combined] = outline
        else:
            results.append(None) # null is shorter than 4 spaces
        # NOTE: The client has been programmed to treat None (aka null in
        #       JavaScript) as blank lines.
    for whatever in xrange(spancount): # Bit of cleanup to be safe
        results[-1] += "</span>"
    return (html_cache, results)

# Exceptions
class InvalidParameters(Exception):
    """
    Raised when `Terminal` is passed invalid parameters.
    """
    pass

# Classes
class AutoExpireDict(dict):
    """
    An override of Python's `dict` that expires keys after a given
    *_expire_timeout* timeout (`datetime.timedelta`).  The default expiration
    is one hour.  It is used like so::

        >>> expiring_dict = AutoExpireDict(timeout=timedelta(minutes=10))
        >>> expiring_dict['somekey'] = 'some value'
        >>> # You can see when this key was created:
        >>> print(expiring_dict.creation_times['somekey'])
        2013-04-15 18:44:18.224072

    10 minutes later your key will be gone::

        >>> 'somekey' in expiring_dict
        False

    The 'timeout' may be be given as a `datetime.timedelta` object or a string
    like, "1d", "30s" (will be passed through the `convert_to_timedelta`
    function).

    By default `AutoExpireDict` will check for expired keys every 30 seconds but
    this can be changed by setting the 'interval'::

        >>> expiring_dict = AutoExpireDict(interval=5000) # 5 secs
        >>> # Or to change it after you've created one:
        >>> expiring_dict.interval = "10s"

    The 'interval' may be an integer, a `datetime.timedelta` object, or a string
    such as '10s' or '5m' (will be passed through the `convert_to_timedelta`
    function).

    If there are no keys remaining the `tornado.ioloop.PeriodicCallback` (
    ``self._key_watcher``) that checks expiration will be automatically stopped.
    As soon as a new key is added it will be started back up again.

    .. note::

        Only works if there's a running instances of `tornado.ioloop.IOLoop`.
    """
    def __init__(self, *args, **kwargs):
        self.io_loop = IOLoop.current()
        self.creation_times = {}
        if 'timeout' in kwargs:
            self.timeout = kwargs.pop('timeout')
        if 'interval' in kwargs:
            self.interval = kwargs.pop('interval')
        super(AutoExpireDict, self).__init__(*args, **kwargs)
        # Set the start time on every key
        for k in self.keys():
            self.creation_times[k] = datetime.now()
        self._key_watcher = PeriodicCallback(
            self._timeout_checker, self.interval, io_loop=self.io_loop)
        self._key_watcher.start() # Will shut down at the next interval if empty

    @property
    def timeout(self):
        """
        A `property` that controls how long a key will last before being
        automatically removed.  May be be given as a `datetime.timedelta`
        object or a string like, "1d", "30s" (will be passed through the
        `convert_to_timedelta` function).
        """
        if not hasattr(self, "_timeout"):
            self._timeout = timedelta(hours=1) # Default is 1-hour timeout
        return self._timeout

    @timeout.setter
    def timeout(self, value):
        if isinstance(value, basestring):
            value = convert_to_timedelta(value)
        self._timeout = value

    @property
    def interval(self):
        """
        A `property` that controls how often we check for expired keys.  May be
        given as milliseconds (integer), a `datetime.timedelta` object, or a
        string like, "1d", "30s" (will be passed through the
        `convert_to_timedelta` function).
        """
        if not hasattr(self, "_interval"):
            self._interval = 10000 # Default is every 10 seconds
        return self._interval

    @interval.setter
    def interval(self, value):
        if isinstance(value, basestring):
            value = convert_to_timedelta(value)
        if isinstance(value, timedelta):
            value = total_seconds(value) * 1000 # PeriodicCallback uses ms
        self._interval = value
        # Restart the PeriodicCallback
        if hasattr(self, '_key_watcher'):
            self._key_watcher.stop()
        self._key_watcher = PeriodicCallback(
            self._timeout_checker, value, io_loop=self.io_loop)

    def renew(self, key):
        """
        Resets the timeout on the given *key*; like it was just created.
        """
        self.creation_times[key] = datetime.now() # Set/renew the start time
        # Start up the key watcher if it isn't already running
        if not self._key_watcher._running:
            self._key_watcher.start()

    def __setitem__(self, key, value):
        """
        An override that tracks when keys are updated.
        """
        super(AutoExpireDict, self).__setitem__(key, value) # Set normally
        self.renew(key) # Set/renew the start time

    def __delitem__(self, key):
        """
        An override that makes sure *key* gets removed from
        ``self.creation_times`` dict.
        """
        del self.creation_times[key]
        super(AutoExpireDict, self).__delitem__(key)

    def __del__(self):
        """
        Ensures that our `tornado.ioloop.PeriodicCallback`
        (``self._key_watcher``) gets stopped.
        """
        self._key_watcher.stop()

    def update(self, *args, **kwargs):
        """
        An override that calls ``self.renew()`` for every key that gets updated.
        """
        super(AutoExpireDict, self).update(*args, **kwargs)
        for key, value in kwargs.items():
            self.renew(key)

    def clear(self):
        """
        An override that empties ``self.creation_times`` and calls
        ``self._key_watcher.stop()``.
        """
        super(AutoExpireDict, self).clear()
        self.creation_times.clear()
        # Shut down the key watcher right away
        self._key_watcher.stop()

    def _timeout_checker(self):
        """
        Walks ``self`` and removes keys that have passed the expiration point.
        """
        if not self.creation_times:
            self._key_watcher.stop() # Nothing left to watch
        for key, starttime in list(self.creation_times.items()):
            if datetime.now() - starttime > self.timeout:
                del self[key]

# AutoExpireDict only works if Tornado is present.
# Don't use the HTML_CACHE if Tornado isn't available.
try:
    from tornado.ioloop import IOLoop, PeriodicCallback
    HTML_CACHE = AutoExpireDict(timeout=timedelta(minutes=1), interval=30000)
except ImportError:
    HTML_CACHE = None

class FileType(object):
    """
    An object to hold the attributes of a supported file capture/output type.
    """
    # These attributes are here to prevent AttributeErrors if not overridden
    thumbnail = None
    html_template = "" # Must be overridden
    html_icon_template = "" # Must be overridden
    # This is for things like PDFs which can contain other FileTypes:
    is_container = False # Must be overridden
    helper = None # Optional function to be called when a capture is started
    original_file = None # Can be used when the file is modified
    def __init__(self,
        name, mimetype, re_header, re_capture, suffix="", path="", linkpath="", icondir=None):
        """
        **name:** Name of the file type.
        **mimetype:** Mime type of the file.
        **re_header:** The regex to match the start of the file.
        **re_capture:** The regex to carve the file out of the stream.
        **suffix:** (optional) The suffix to be appended to the end of the filename (if one is generated).
        **path:** (optional) The path to a file or directory where the file should be stored.  If *path* is a directory a random filename will be chosen.
        **linkpath:** (optional) The path to use when generating a link in HTML output.
        **icondir:** (optional) A path to look for a relevant icon to display when generating HTML output.
        """
        self.name = name
        self.mimetype = mimetype
        self.re_header = re_header
        self.re_capture = re_capture
        self.suffix = suffix
        # A path just in case something needs to access it outside of Python:
        self.path = path
        self.linkpath = linkpath
        self.icondir = icondir
        self.file_obj = None

    def __repr__(self):
        return "<%s>" % self.name

    def __str__(self):
        "Override if the defined file type warrants a text-based output."
        return self.__repr__()

    def __del__(self):
        """
        Make sure that self.file_obj gets closed/deleted.
        """
        logging.debug("FileType __del__(): Closing/deleting temp file(s)")
        try:
            self.file_obj.close() # Ensures it gets deleted
        except AttributeError:
            pass # Probably never got opened properly (bad file); no big
        try:
            self.original_file.close()
        except AttributeError:
            pass # Probably never got opened/saved properly

    def raw(self):
        self.file_obj.seek(0)
        data = open(self.file_obj).read()
        self.file_obj.seek(0)
        return data

    def html(self):
        """
        Returns the object as an HTML-formatted string.  Must be overridden.
        """
        raise NotImplementedError

    def capture(self, data, term_instance=None):
        """
        Stores *data* as a temporary file and returns that file's object.
        *term_instance* can be used by overrides of this function to make
        adjustments to the terminal emulator after the *data* is captured e.g.
        to make room for an image.
        """
        # Remove the extra \r's that the terminal adds:
        data = data.replace(b'\r\n', b'\n')
        logging.debug("capture() len(data): %s" % len(data))
        # Write the data to disk in a temporary location
        self.file_obj = tempfile.TemporaryFile()
        self.file_obj.write(data)
        self.file_obj.flush()
        # Leave it open
        return self.file_obj

    def close(self):
        """
        Closes :attr:`self.file_obj`
        """
        try:
            self.file_obj.close()
        except AttributeError:
            pass # file object never got created properly (probably missing PIL)

class ImageFile(FileType):
    """
    A subclass of :class:`FileType` for images (specifically to override
    :meth:`self.html` and :meth:`self.capture`).
    """
    def capture(self, data, term_instance):
        """
        Captures the image contained within *data*.  Will use *term_instance*
        to make room for the image in the terminal screen.

        .. note::  Unlike :class:`FileType`, *term_instance* is mandatory.
        """
        logging.debug('ImageFile.capture()')
        global _logged_pil_warning
        Image = False
        try:
            from PIL import Image
        except ImportError:
            if _logged_pil_warning:
                return
            _logged_pil_warning = True
            logging.warning(_(
                "Could not import the Python Imaging Library (PIL).  "
                "Images will not be displayed in the terminal."))
            logging.info(_(
                "TIP: Pillow is a 'friendly fork' of PIL that has been updated "
                "to work with Python 3 (also works in Python 2.X).  You can "
                "install it with:  pip install --upgrade pillow"))
            return # No PIL means no images.  Don't bother wasting memory.
        if _logged_pil_warning:
            _logged_pil_warning = False
            logging.info(_(
                "Good job installing PIL!  Terminal image suppport has been "
                "re-enabled.  Aren't dynamic imports grand?"))
        #open('/tmp/lastimage.img', 'w').write(data) # Use for debug
        # Image file formats don't usually like carriage returns:
        data = data.replace(b'\r\n', b'\n') # shell adds an extra /r
        i = BytesIO(data)
        try:
            im = Image.open(i)
        except (AttributeError, IOError) as e:
            # i.e. PIL couldn't identify the file
            message = _("PIL couldn't process the image (%s)" % e)
            logging.error(message)
            term_instance.send_message(message)
            return # Don't do anything--bad image
        # Save a copy of the data so the user can have access to the original
        if self.path:
            if os.path.exists(self.path):
                if os.path.isdir(self.path):
                    self.original_file = tempfile.NamedTemporaryFile(
                        suffix=self.suffix, dir=self.path)
                    self.original_file.write(data)
                    self.original_file.flush()
                    self.original_file.seek(0) # Just in case
        # Resize the image to be small enough to fit within a typical terminal
        if im.size[0] > 640 or im.size[1] > 480:
            im.thumbnail((640, 480), Image.ANTIALIAS)
        # Get the current image location and reference so we can move it around
        img_Y = term_instance.cursorY
        img_X = term_instance.cursorX
        ref = term_instance.screen[img_Y][img_X]
        if term_instance.em_dimensions:
            # Make sure the image will fit properly in the screen
            width = im.size[0]
            height = im.size[1]
            if height <= term_instance.em_dimensions['height']:
                # Fits within a line.  No need for a newline
                num_chars = int(width/term_instance.em_dimensions['width'])
                # Move the cursor an equivalent number of characters
                term_instance.cursor_right(num_chars)
            else:
                # This is how many newlines the image represents:
                newlines = int(height/term_instance.em_dimensions['height'])
                term_instance.screen[img_Y][img_X] = u' ' # Empty old location
                term_instance.cursorX = 0
                term_instance.newline() # Start with a newline
                if newlines > term_instance.cursorY:
                    # Shift empty lines at the bottom to the top to kinda sorta
                    # make room for the images so the user doesn't have to
                    # scroll (hey, it works!)
                    for i in xrange(newlines):
                        line = term_instance.screen.pop()
                        rendition = term_instance.renditions.pop()
                        term_instance.screen.insert(0, line)
                        term_instance.renditions.insert(0, rendition)
                        if term_instance.cursorY < (term_instance.rows - 1):
                            term_instance.cursorY += 1
                # Save the new image location
                term_instance.screen[
                    term_instance.cursorY][term_instance.cursorX] = ref
                term_instance.newline() # Follow-up newline
        elif term_instance.em_dimensions == None:
            # No way to calculate the number of lines the image will take
            term_instance.screen[img_Y][img_X] = u' ' # Empty old location
            term_instance.cursorY = term_instance.rows - 1 # Move to the end
            # ... so it doesn't get cut off at the top
            # Save the new image location
            term_instance.screen[
                term_instance.cursorY][term_instance.cursorX] = ref
            # Make some space at the bottom too just in case
            term_instance.newline()
            term_instance.newline()
        else:
            # When em_dimensions are set to 0 assume the user intentionally
            # wants things to be sized as inline as possible.
            term_instance.newline()
        # Write the captured image to disk
        if self.path:
            if os.path.exists(self.path):
                if os.path.isdir(self.path):
                    # Assume that a path was given for a reason and use a
                    # NamedTemporaryFile instead of TemporaryFile.
                    self.file_obj = tempfile.NamedTemporaryFile(
                        suffix=self.suffix, dir=self.path)
                    # Update self.path to use the new, actual file path
                    self.path = self.file_obj.name
                else:
                    self.file_obj = open(self.path, 'rb+')
        else:
            self.file_obj = tempfile.TemporaryFile(suffix=self.suffix)
        try:
            im.save(self.file_obj, im.format)
        except (AttributeError, IOError):
            # PIL was compiled without (complete) support for this format
            logging.error(_(
                "PIL is missing support for this image type (%s).  You probably"
                " need to install zlib-devel and libjpeg-devel then re-install "
                "it with 'pip install --upgrade PIL' or 'pip install "
                "--upgrade Pillow'" % self.name))
            try:
                self.file_obj.close() # Can't do anything with it
            except AttributeError:
                pass # File was probably just never opened/saved properly
            return None
        self.file_obj.flush()
        self.file_obj.seek(0) # Go back to the start
        return self.file_obj

    def html(self):
        """
        Returns :attr:`self.file_obj` as an <img> tag with the src set to a
        data::URI.
        """
        try:
            from PIL import Image
        except ImportError:
            return # Warnings will have already been printed by this point
        if not self.file_obj:
            return u""
        self.file_obj.seek(0)
        try:
            im = Image.open(self.file_obj)
        except IOError:
            # i.e. PIL couldn't identify the file
            return u"<i>Error displaying image</i>"
        self.file_obj.seek(0)
        # Need to encode base64 to create a data URI
        encoded = base64.b64encode(self.file_obj.read())
        data_uri = "data:image/{type};base64,{encoded}".format(
            type=im.format.lower(), encoded=encoded.decode('utf-8'))
        link = "%s/%s" % (self.linkpath, os.path.split(self.path)[1])
        if self.original_file:
            link = "%s/%s" % (
                self.linkpath, os.path.split(self.original_file.name)[1])
        if self.thumbnail:
            return self.html_icon_template.format(
                link=link,
                src=data_uri,
                width=im.size[0],
                height=im.size[1])
        return self.html_template.format(
            link=link, src=data_uri, width=im.size[0], height=im.size[1])

class PNGFile(ImageFile):
    """
    An override of :class:`ImageFile` for PNGs to hard-code the name, regular
    expressions, mimetype, and suffix.
    """
    name = _("PNG Image")
    mimetype = "image/png"
    suffix = ".png"
    re_header = re.compile(b'.*\x89PNG\r', re.DOTALL)
    re_capture = re.compile(b'(\x89PNG\r.+?IEND\xaeB`\x82)', re.DOTALL)
    html_template = (
        '<a target="_blank" href="{link}" '
        'title="Click to open the original file in a new window (full size)">'
        '<img src="{src}" width="{width}" height="{height}">'
        '</a>'
    )

    def __init__(self, path="", linkpath="", **kwargs):
        """
        **path:** (optional) The path to a file or directory where the file
        should be stored.  If *path* is a directory a random filename will be
        chosen.
        """
        self.path = path
        self.linkpath = linkpath
        self.file_obj = None
        # Images will be displayed inline so no icons unless overridden:
        self.html_icon_template = self.html_template

class JPEGFile(ImageFile):
    """
    An override of :class:`ImageFile` for JPEGs to hard-code the name, regular
    expressions, mimetype, and suffix.
    """
    name = _("JPEG Image")
    mimetype = "image/jpeg"
    suffix = ".jpeg"
    re_header = re.compile(
        b'.*\xff\xd8\xff.+JFIF\x00|.*\xff\xd8\xff.+Exif\x00', re.DOTALL)
    re_capture = re.compile(b'(\xff\xd8\xff.+?\xff\xd9)', re.DOTALL)
    html_template = (
        '<a target="_blank" href="{link}" '
        'title="Click to open the original file in a new window (full size)">'
        '<img src="{src}" width="{width}" height="{height}">'
        '</a>'
    )
    def __init__(self, path="", linkpath="", **kwargs):
        """
        **path:** (optional) The path to a file or directory where the file
        should be stored.  If *path* is a directory a random filename will be
        chosen.
        """
        self.path = path
        self.linkpath = linkpath
        self.file_obj = None
        # Images will be displayed inline so no icons unless overridden:
        self.html_icon_template = self.html_template

class SoundFile(FileType):
    """
    A subclass of :class:`FileType` for sound files (e.g. .wav).  Overrides
    :meth:`self.html` and :meth:`self.capture`.
    """
    # NOTE: I disabled autoplay on these sounds because it causes the browser to
    # play back the sound with every screen update!  Press return a few times
    # and the sound will play a few times; annoying!
    html_template = (
        '<audio controls>'
        '<source src="{src}" type="{mimetype}">'
        'Your browser does not support this audio format.'
        '</audio>'
    )
    display_metadata = None # Can be overridden to send a message to the user
    def capture(self, data, term_instance):
        """
        Captures the sound contained within *data*.  Will use *term_instance*
        to make room for the embedded sound control in the terminal screen.

        .. note::  Unlike :class:`FileType`, *term_instance* is mandatory.
        """
        logging.debug('SoundFile.capture()')
        # Fix any carriage returns (generated by the shell):
        data = data.replace(b'\r\n', b'\n')
        # Make some room for the audio controls:
        term_instance.newline()
        # Write the captured image to disk
        if self.path:
            if os.path.exists(self.path):
                if os.path.isdir(self.path):
                    # Assume that a path was given for a reason and use a
                    # NamedTemporaryFile instead of TemporaryFile.
                    self.file_obj = tempfile.NamedTemporaryFile(
                        suffix=self.suffix, dir=self.path)
                    # Update self.path to use the new, actual file path
                    self.path = self.file_obj.name
                else:
                    self.file_obj = open(self.path, 'rb+')
        else:
            self.file_obj = tempfile.TemporaryFile(suffix=self.suffix)
        self.file_obj.write(data)
        self.file_obj.flush()
        self.file_obj.seek(0) # Go back to the start
        if self.display_metadata:
            self.display_metadata(term_instance)
        return self.file_obj

    def html(self):
        """
        Returns :attr:`self.file_obj` as an <img> tag with the src set to a
        data::URI.
        """
        if not self.file_obj:
            return u""
        self.file_obj.seek(0)
        # Need to encode base64 to create a data URI
        encoded = base64.b64encode(self.file_obj.read())
        data_uri = "data:{mimetype};base64,{encoded}".format(
            mimetype=self.mimetype, encoded=encoded.decode('utf-8'))
        link = "%s/%s" % (self.linkpath, os.path.split(self.path)[1])
        if self.original_file:
            link = "%s/%s" % (
                self.linkpath, os.path.split(self.original_file.name)[1])
        if self.thumbnail:
            return self.html_icon_template.format(
                link=link,
                src=data_uri,
                icon=self.thumbnail,
                mimetype=self.mimetype)
        return self.html_template.format(
            link=link, src=data_uri, mimetype=self.mimetype)

class WAVFile(SoundFile):
    """
    An override of :class:`SoundFile` for WAVs to hard-code the name, regular
    expressions, mimetype, and suffix.  Also, a :func:`helper` function is
    provided that adjusts the `self.re_capture` regex so that it precisely
    matches the WAV file being captured.
    """
    name = _("WAV Sound")
    mimetype = "audio/x-wav"
    suffix = ".wav"
    re_header = re.compile(b'RIFF....WAVEfmt', re.DOTALL)
    re_capture = re.compile(b'(RIFF....WAVEfmt.+?\r\n)', re.DOTALL)
    re_wav_header = re.compile(b'(RIFF.{40})', re.DOTALL)
    def __init__(self, path="", linkpath="", **kwargs):
        """
        **path:** (optional) The path to a file or directory where the file
        should be stored.  If *path* is a directory a random filename will be
        chosen.
        """
        self.path = path
        self.linkpath = linkpath
        self.file_obj = None
        self.sent_message = False
        # Sounds will be displayed inline so no icons unless overridden:
        self.html_icon_template = self.html_template

    def helper(self, term_instance):
        """
        Called at the start of a WAV file capture.  Calculates the length of the
        file and modifies `self.re_capture` with laser precision.
        """
        data = term_instance.capture
        self.wav_header = struct.unpack(
            '4si4s4sihhiihh4si', self.re_wav_header.match(data).group())
        self.wav_length = self.wav_header[1] + 8
        if not self.sent_message:
            channels = "mono"
            if self.wav_header[6] == 2:
                channels = "stereo"
            if self.wav_length != self.wav_header[12] + 44:
                # Corrupt WAV file
                message = _("WAV File is corrupted: Header data mismatch.")
                term_instance.send_message(message)
                term_instance.cancel_capture = True
            message = _("WAV File: %skHz (%s)" % (self.wav_header[7], channels))
            term_instance.send_message(message)
            self.sent_message = True
        # Update the capture regex with laser precision:
        self.re_capture = re.compile(
            b'(RIFF....WAVE.{%s})' % (self.wav_length-12), re.DOTALL)

class OGGFile(SoundFile):
    """
    An override of :class:`SoundFile` for OGGs to hard-code the name, regular
    expressions, mimetype, and suffix.
    """
    name = _("OGG Sound")
    mimetype = "audio/ogg"
    suffix = ".ogg"
    # NOTE: \x02 below marks "start of stream" (\x04 is "end of stream")
    re_header = re.compile(b'OggS\x00\x02', re.DOTALL)
    # NOTE: This should never actually match since it will be replaced by the
    # helper() function:
    re_capture = re.compile(b'(OggS\x00\x02.+OggS\x00\x04\r\n)', re.DOTALL)
    re_ogg_header = re.compile(b'(OggS\x00\x02.{21})', re.DOTALL)
    re_last_segment = re.compile(b'(OggS\x00\x04.{21})', re.DOTALL)
    def __init__(self, path="", linkpath="", **kwargs):
        """
        **path:** (optional) The path to a file or directory where the file
        should be stored.  If *path* is a directory a random filename will be
        chosen.
        """
        self.path = path
        self.linkpath = linkpath
        self.file_obj = None
        self.sent_message = False
        # Sounds will be displayed inline so no icons unless overridden:
        self.html_icon_template = self.html_template

    def helper(self, term_instance):
        """
        Called at the start of a OGG file capture.  Calculates the length of the
        file and modifies `self.re_capture` with laser precision.  Returns
        `True` if the entire ogg has been captured.
        """
        data = term_instance.capture
        last_segment_header = self.re_last_segment.search(data)
        if not last_segment_header:
            #print("No last segment header yet")
            #print(repr(data.split('OggS')[-1]))
            #print('-----------------------------')
            return # Haven't reached the end of the OGG yet
        else:
            last_segment_header = last_segment_header.group()
        # This decodes the OGG page header
        (oggs, version, type_flags, position,
             serial, sequence, crc, segments) = struct.unpack(
                "<4sBBqIIiB", last_segment_header)
        # Figuring out the length of the last set of segments is a little bit
        # involved...
        lacing_size = 0
        lacings = []
        last_segment_header = re.search( # Include the segment table
            b'(OggS\x00\x04.{%s})' % (21+segments), data, re.DOTALL).group()
        lacing_bytes = last_segment_header[27:][:segments]
        for c in map(ord, lacing_bytes):
            lacing_size += c
            if c < 255:
                lacings.append(lacing_size)
                lacing_size = 0
        segment_size = 27 # Initial header size
        segment_size += sum(ord(e) for e in last_segment_header[27:])
        segment_size += len(lacings)
        # Update the capture regex with laser precision:
        self.re_capture = re.compile(
            b'(OggS\x00\x02\x00.+OggS\x00\x04..{%s})'
            % (segment_size), re.DOTALL)
        return True

    def display_metadata(self, term_instance):
        """
        Sends a message to the user that displays the OGG file metadata.  Things
        like ID3 tags, bitrate, channels, etc.
        """
        if not self.sent_message:
            global _logged_mutagen_warning
            try:
                import mutagen.oggvorbis
            except ImportError:
                if not _logged_mutagen_warning:
                    _logged_mutagen_warning = True
                    logging.warning(_(
                        "Could not import the mutagen Python module.  "
                        "Displaying audio file metadata will be disabled."))
                    logging.info(_(
                        "TIP: Install mutagen:  sudo pip install mutagen"))
                return
            oggfile = mutagen.oggvorbis.Open(self.file_obj.name)
            message = "<pre>%s</pre>" % oggfile.pprint()
            term_instance.send_message(message)
            self.sent_message = True

class PDFFile(FileType):
    """
    A subclass of :class:`FileType` for PDFs (specifically to override
    :meth:`self.html`).  Has hard-coded name, mimetype, suffix, and regular
    expressions.  This class will also utilize :attr:`self.icondir` to look for
    an icon named, 'pdf.svg'.  If found it will be utilized by
    :meth:`self.html` when generating output.
    """
    name = _("PDF Document")
    mimetype = "application/pdf"
    suffix = ".pdf"
    re_header = re.compile(br'.*%PDF-[0-9]\.[0-9]{1,2}.+?obj', re.DOTALL)
    re_capture = re.compile(br'(%PDF-[0-9]\.[0-9]{1,2}.+%%EOF)', re.DOTALL)
    icon = "pdf.svg" # Name of the file inside of self.icondir
    # NOTE:  Using two separate links below so the whitespace doesn't end up
    # underlined.  Looks much nicer this way.
    html_icon_template = (
        '<span class="pdfcontainer"><a class="pdflink" target="_blank" '
        'href="{link}">{icon}</a><br>'
        '   <a class="pdflink" href="{link}">{name}</a></span>')
    html_template = (
        '<span class="pdfcontainer"><a target="_blank" href="{link}">{name}</a>'
        '</span>')
    is_container = True

    def __init__(self, path="", linkpath="", icondir=None):
        """
        **path:** (optional) The path to the file.
        **linkpath:** (optional) The path to use when generating a link in HTML output.
        **icondir:** (optional) A path to look for a relevant icon to display when generating HTML output.
        """
        self.path = path
        self.linkpath = linkpath
        self.icondir = icondir
        self.file_obj = None
        self.thumbnail = None

    def generate_thumbnail(self):
        """
        If available, will use ghostscript (gs) to generate a thumbnail of this
        PDF in the form of an <img> tag with the src set to a data::URI.
        """
        from commands import getstatusoutput
        thumb = tempfile.NamedTemporaryFile()
        params = [
            'gs', # gs must be in your path
            '-dPDFFitPage',
            '-dPARANOIDSAFER',
            '-dBATCH',
            '-dNOPAUSE',
            '-dNOPROMPT',
            '-dMaxBitmap=500000000',
            '-dAlignToPixels=0',
            '-dGridFitTT=0',
            '-dDEVICEWIDTH=90',
            '-dDEVICEHEIGHT=120',
            '-dORIENT1=true',
            '-sDEVICE=jpeg',
            '-dTextAlphaBits=4',
            '-dGraphicsAlphaBits=4',
            '-sOutputFile=%s' % thumb.name,
            self.path
        ]
        retcode, output = getstatusoutput(" ".join(params))
        if retcode == 0:
            # Success
            data = None
            with open(thumb.name) as f:
                data = f.read()
            thumb.close() # Make sure it gets removed now we've read it
            if data:
                encoded = base64.b64encode(data)
                data_uri = "data:image/jpeg;base64,%s" % encoded.decode('utf-8')
                return '<img src="%s">' % data_uri

    def capture(self, data, term_instance):
        """
        Stores *data* as a temporary file and returns that file's object.
        *term_instance* can be used by overrides of this function to make
        adjustments to the terminal emulator after the *data* is captured e.g.
        to make room for an image.
        """
        logging.debug("PDFFile.capture()")
        # Remove the extra \r's that the terminal adds:
        data = data.replace(b'\r\n', b'\n')
        # Write the data to disk in a temporary location
        if self.path:
            if os.path.exists(self.path):
                if os.path.isdir(self.path):
                    # Assume that a path was given for a reason and use a
                    # NamedTemporaryFile instead of TemporaryFile.
                    self.file_obj = tempfile.NamedTemporaryFile(
                        suffix=self.suffix, dir=self.path)
                    # Update self.path to use the new, actual file path
                    self.path = self.file_obj.name
                else:
                    self.file_obj = open(self.path, 'rb+')
        else:
            # Use the terminal emulator's temppath
            self.file_obj = tempfile.NamedTemporaryFile(
                suffix=self.suffix, dir=term_instance.temppath)
            self.path = self.file_obj.name
        self.file_obj.write(data)
        self.file_obj.flush()
        # Ghostscript-based thumbnail generation disabled due to its slow,
        # blocking nature.  Works great though!
        #self.thumbnail = self.generate_thumbnail()
        # TODO: Figure out a way to do non-blocking thumbnail generation
        if self.icondir:
            pdf_icon = os.path.join(self.icondir, self.icon)
            if os.path.exists(pdf_icon):
                with open(pdf_icon) as f:
                    self.thumbnail = f.read()
        if self.thumbnail:
            # Make room for our link
            img_Y = term_instance.cursorY
            img_X = term_instance.cursorX
            ref = term_instance.screen[img_Y][img_X]
            term_instance.screen[img_Y][img_X] = u' ' # No longer at this loc
            if term_instance.cursorY < 8: # Icons are about ~8 newlines high
                for line in xrange(8 - term_instance.cursorY):
                    term_instance.newline()
            # Save the new location
            term_instance.screen[
                term_instance.cursorY][term_instance.cursorX] = ref
            term_instance.newline()
        else:
            # Make room for the characters in the name, "PDF Document"
            for i in xrange(len(self.name)):
                term_instance.screen[term_instance.cursorY].pop()
        # Leave it open
        return self.file_obj

    def html(self):
        """
        Returns a link to download the PDF using :attr:`self.linkpath` for the
        href attribute.  Will use :attr:`self.html_icon_template` if
        :attr:`self.icon` can be found.  Otherwise it will just output
        :attr:`self.name` as a clickable link.
        """
        link = "%s/%s" % (self.linkpath, os.path.split(self.path)[1])
        if self.thumbnail:
            return self.html_icon_template.format(
                link=link, icon=self.thumbnail, name=self.name)
        return self.html_template.format(
            link=link, icon=self.thumbnail, name=self.name)

class NotFoundError(Exception):
    """
    Raised by :meth:`Terminal.remove_magic` if a given filetype was not found in
    :attr:`Terminal.supported_magic`.
    """
    pass

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

    class_prefix = u'✈' # Prefix used with HTML output span class names
                        # (to avoid namespace conflicts)

    charsets = {
        'B': {}, # Default is USA (aka 'B')
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

    RE_CSI_ESC_SEQ = re.compile(r'\x1B\[([?A-Za-z0-9>;@:\!]*?)([A-Za-z@_])')
    RE_ESC_SEQ = re.compile(
        r'\x1b(.*\x1b\\|[ABCDEFGHIJKLMNOQRSTUVWXYZa-z0-9=<>]|[()# %*+].)')
    RE_TITLE_SEQ = re.compile(r'\x1b\][0-2]\;(.*?)(\x07|\x1b\\)')
    # The below regex is used to match our optional (non-standard) handler
    RE_OPT_SEQ = re.compile(r'\x1b\]_\;(.+?)(\x07|\x1b\\)')
    RE_NUMBERS = re.compile('\d*') # Matches any number
    RE_SIGINT = re.compile(b'.*\^C', re.MULTILINE|re.DOTALL)

    def __init__(self, rows=24, cols=80, em_dimensions=None, temppath='/tmp',
    linkpath='/tmp', icondir=None, encoding='utf-8', async=None, debug=False,
    enabled_filetypes="all"):
        """
        Initializes the terminal by calling *self.initialize(rows, cols)*.  This
        is so we can have an equivalent function in situations where __init__()
        gets overridden.

        If *em_dimensions* are provided they will be used to determine how many
        lines images will take when they're drawn in the terminal.  This is to
        prevent images that are written to the top of the screen from having
        their tops cut off.  *em_dimensions* must be a dict in the form of::

            {'height': <px>, 'width': <px>}

        The *temppath* will be used to store files that are captured/saved by
        the terminal emulator.  In conjunction with this is the *linkpath* which
        will be used when creating links to these temporary files.  For example,
        a web-based application may wish to have the terminal emulator store
        temporary files in /tmp but give clients a completely unrelated URL to
        retrieve these files (for security or convenience reasons).  Here's a
        real world example of how it works::

            >>> term = Terminal(
            ... rows=10, cols=40, temppath='/var/tmp', linkpath='/terminal')
            >>> term.write('About to write a PDF\\n')
            >>> pdf = open('/path/to/somefile.pdf').read()
            >>> term.write(pdf)
            >>> term.dump_html()
            ([u'About to write a PDF                    ',
            # <unnecessary lines of whitespace have been removed for this example>
            u'<a target="_blank" href="/terminal/tmpZoOKVM.pdf">PDF Document</a>'])

        The PDF file in question will reside in `/var/tmp` but the link was
        created as `href="/terminal/tmpZoOKVM.pdf"`.  As long as your web app
        knows to look in /var/tmp for incoming '/terminal' requests users should
        be able to retrieve their documents.

            http://yourapp.company.com/terminal/tmpZoOKVM.pdf

        The *icondir* parameter, if given, will be used to provide a relevant
        icon when outputing a link to a file.  When a supported
        :class:`FileType` is captured the instance will be given the *icondir*
        as a parameter in a manner similar to this::

            filetype_instance = filetype_class(icondir=self.icondir)

        That way when filetype_instance.html() is called it can display a nice
        icon to the user...  if that particular :class:`FileType` supports icons
        and the icon it is looking for happens to be available at *icondir*.

        If *debug* is True, the root logger will have its level set to DEBUG.

        If *enabled_filetypes* are given (iterable of strings or `FileType`
        classes) the provided file types will be enabled for this terminal.
        If not given it will default to enabling 'all' file types.  To disable
        support for all file types simply pass ``None``, ``False``, or an empty
        list.
        """
        if rows < 2 or cols < 2:
            raise InvalidParameters(_(
                "Invalid value(s) given for rows ({rows}) and/or cols "
                "({cols}).  Both must be > 1.").format(rows=rows, cols=cols))
        if em_dimensions:
            if not isinstance(em_dimensions, dict):
                raise InvalidParameters(_(
                    "The em_dimensions keyword argument must be a dict.  "
                    "Here's what was given instead: {0}").format(
                        repr(em_dimensions)))
            if 'width' not in em_dimensions or 'height' not in em_dimensions:
                raise InvalidParameters(_(
                    "The given em_dimensions dict ({0}) is missing either "
                    "'height' or 'width'").format(repr(em_dimensions)))
        if not os.path.exists(temppath):
            raise InvalidParameters(_(
                "The given temppath ({0}) does not exist.").format(temppath))
        if icondir:
            if not os.path.exists(icondir):
                logging.warning(_(
                    "The given icondir ({0}) does not exist.").format(icondir))
        if debug:
            logger = logging.getLogger()
            logger.level = logging.DEBUG
        self.temppath = temppath
        self.linkpath = linkpath
        self.icondir = icondir
        self.encoding = encoding
        self.async = async
        if enabled_filetypes == "all":
            enabled_filetypes = [
                PDFFile,
                PNGFile,
                JPEGFile,
                WAVFile,
                OGGFile,
            ]
        elif enabled_filetypes:
            for i, filetype in enumerate(list(enabled_filetypes)):
                if isinstance(filetype, basestring):
                    # Attempt to convert into a proper class with Python voodoo
                    _class = globals().get(filetype)
                    if _class:
                        enabled_filetypes[i] = _class # Update in-place
        else:
            enabled_filetypes = []
        self.enabled_filetypes = enabled_filetypes
        # This controls how often we send a message to the client when capturing
        # a special file type.  The default is to update the user of progress
        # once every 1.5 seconds.
        self.message_interval = timedelta(seconds=1.5)
        self.notified = False # Used to tell if we have notified the user before
        self.cancel_capture = False
        # Used by cursor_left() and cursor_right() to handle double-width chars:
        self.double_width_right = False
        self.double_width_left = False
        self.prev_char = u''
        self.max_scrollback = 1000 # Max number of lines kept in the buffer
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
        self.insert_mode = False
        self.esc_buffer = '' # For holding escape sequences as they're typed.
        self.cursor_home = 0
        self.cur_rendition = unichr(1000) # Should always be reset ([0])
        self.init_screen()
        self.init_renditions()
        self.current_charset = 0
        self.set_G0_charset('B')
        self.set_G1_charset('B')
        self.use_g0_charset()
        # Set the default window margins
        self.top_margin = 0
        self.bottom_margin = self.rows - 1
        self.timeout_capture = None
        self.specials = {
            self.ASCII_NUL: self.__ignore,
            self.ASCII_BEL: self.bell,
            self.ASCII_BS: self.backspace,
            self.ASCII_HT: self.horizontal_tab,
            self.ASCII_LF: self.newline,
            self.ASCII_VT: self.newline,
            self.ASCII_FF: self.newline,
            self.ASCII_CR: self.carriage_return,
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
            'Z': self._csi_device_identification,
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
            'c': self._csi_device_identification, # Device status report (DSR)
            'g': self.__ignore, # TODO: Tab clear
            'h': self.set_expanded_mode,
            'i': self.__ignore, # ESC[5i is "redirect to printer", ESC[4i ends it
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
            'n': self._csi_device_status_report, # <ESC>[6n is the only one I know of (request cursor position)
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
        # Used to store what expanded modes are active
        self.expanded_modes = {
            # Important defaults
            '1': False, # Application Cursor Keys
            '7': False, # Autowrap
            '25': True, # Show Cursor
        }
        self.expanded_mode_handlers = {
            # Expanded modes take a True/False argument for set/reset
            '1': partial(self.expanded_mode_toggle, '1'),
            '2': self.__ignore, # DECANM and set VT100 mode (and lock keyboard)
            '3': self.__ignore, # 132 Column Mode (DECCOLM)
            '4': self.__ignore, # Smooth (Slow) Scroll (DECSCLM)
            '5': self.__ignore, # Reverse video (might support in future)
            '6': self.__ignore, # Origin Mode (DECOM)
            # Wraparound Mode (DECAWM):
            '7': partial(self.expanded_mode_toggle, '7'),
            '8': self.__ignore, # Auto-repeat Keys (DECARM)
            # Send Mouse X & Y on button press:
            '9': partial(self.expanded_mode_toggle, '9'),
            '12': self.__ignore, # SRM or Start Blinking Cursor (att610)
            '18': self.__ignore, # Print form feed (DECPFF)
            '19': self.__ignore, # Set print extent to full screen (DECPEX)
            '25': partial(self.expanded_mode_toggle, '25'),
            '38': self.__ignore, # Enter Tektronix Mode (DECTEK)
            '41': self.__ignore, # more(1) fix (whatever that is)
            '42': self.__ignore, # Enable Nation Replacement Character sets (DECNRCM)
            '44': self.__ignore, # Turn On Margin Bell
            '45': self.__ignore, # Reverse-wraparound Mode
            '46': self.__ignore, # Start Logging
            '47': self.toggle_alternate_screen_buffer, # Use Alternate Screen Buffer
            '66': self.__ignore, # Application keypad (DECNKM)
            '67': self.__ignore, # Backarrow key sends delete (DECBKM)
            # Send Mouse X/Y on button press and release:
            '1000': partial(self.expanded_mode_toggle, '1000'),
            # Use Hilite Mouse Tracking:
            '1001': partial(self.expanded_mode_toggle, '1001'),
            # Use Cell Motion Mouse Tracking:
            '1002': partial(self.expanded_mode_toggle, '1002'),
            # Use All Motion Mouse Tracking:
            '1003': partial(self.expanded_mode_toggle, '1003'),
            # Send FocusIn/FocusOut events:
            '1004': partial(self.expanded_mode_toggle, '1004'),
            # Enable UTF-8 Mouse Mode:
            '1005': partial(self.expanded_mode_toggle, '1005'),
            # Enable SGR Mouse Mode:
            '1006': partial(self.expanded_mode_toggle, '1006'),
            '1010': self.__ignore, # Scroll to bottom on tty output
            '1011': self.__ignore, # Scroll to bottom on key press
            '1035': self.__ignore, # Enable special modifiers for Alt and NumLock keys
            '1036': self.__ignore, # Send ESC when Meta modifies a key
            '1037': self.__ignore, # Send DEL from the editing-keypad Delete key
            '1047': self.__ignore, # Use Alternate Screen Buffer
            '1048': self.__ignore, # Save cursor as in DECSC
            # Save cursor as in DECSC and use Alternate Screen Buffer,
            # clearing it first:
            '1049': self.toggle_alternate_screen_buffer_cursor,
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
            CALLBACK_MESSAGE: {},
        }
        self.leds = {
            1: False,
            2: False,
            3: False,
            4: False
        }
        # supported_magic gets assigned via self.add_magic() below
        self.supported_magic = []
        # Dict for magic "numbers" so we can tell when a particular type of
        # file begins and ends (so we can capture it in binary form and
        # later dump it out via dump_html())
        # The format is 'beginning': 'whole'
        self.magic = OrderedDict()
        # magic_map is like magic except it is in the format of:
        #   'beginning': <filetype class>
        self.magic_map = {}
        # Supported magic (defaults)
        for filetype in self.enabled_filetypes:
            self.add_magic(filetype)
        # NOTE:  The order matters!  Some file formats are containers that can
        # hold other file formats.  For example, PDFs can contain JPEGs.  So if
        # we match JPEGs before PDFs we might make a match when we really wanted
        # to match the overall container (the PDF).
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
        self.capture = b""
        self.captured_files = {}
        self.file_counter = pua_counter()
        # This is for creating a new point of reference every time there's a new
        # unique rendition at a given coordinate
        self.rend_counter = unicode_counter()
        # Used for mapping unicode chars to acutal renditions (to save memory):
        self.renditions_store = {
            u' ': [], # Nada, nothing, no rendition.  Not the same as below
            self.rend_counter.next(): [0] # Default is actually reset
        }
        self.watcher = None # Placeholder for the file watcher thread (if used)

    def add_magic(self, filetype):
        """
        Adds the given *filetype* to :attr:`self.supported_magic` and generates
        the necessary bits in :attr:`self.magic` and :attr:`self.magic_map`.

        *filetype* is expected to be a subclass of :class:`FileType`.
        """
        #logging.debug("add_magic(%s)" % filetype)
        if filetype in self.supported_magic:
            return # Nothing to do; it's already there
        self.supported_magic.append(filetype)
        # Wand ready...
        for Type in self.supported_magic:
            self.magic.update({Type.re_header: Type.re_capture})
        # magic_map is just a convenient way of performing magic, er, I
        # mean referencing filetypes that match the supported magic numbers.
        for Type in self.supported_magic:
            self.magic_map.update({Type.re_header: Type})

    def remove_magic(self, filetype):
        """
        Removes the given *filetype* from :attr:`self.supported_magic`,
        :attr:`self.magic`, and :attr:`self.magic_map`.

        *filetype* may be the specific filetype class or a string that can be
        either a filetype.name or filetype.mimetype.
        """
        found = None
        if isinstance(filetype, basestring):
            for Type in self.supported_magic:
                if Type.name == filetype:
                    found = Type
                    break
                elif Type.mimetype == filetype:
                    found = Type
                    break
        else:
            for Type in self.supported_magic:
                if Type == filetype:
                    found = Type
                    break
        if not found:
            raise NotFoundError("%s not found in supported magic" % filetype)
        self.supported_magic.remove(Type)
        del self.magic[Type.re_header]
        del self.magic_map[Type.re_header]

    def update_magic(self, filetype, mimetype):
        """
        Replaces an existing FileType with the given *mimetype* in
        :attr:`self.supported_magic` with the given *filetype*.  Example::

            >>> import terminal
            >>> term = terminal.Terminal()
            >>> class NewPDF = class(terminal.PDFile)
            >>> # Open PDFs immediately in a new window
            >>> NewPDF.html_template = "<script>window.open({link})</script>"
            >>> NewPDF.html_icon_template = NewPDF.html_template # Ignore icon
            >>> term.update_magic(NewPDF, mimetype="application/pdf")
        """
        # Find the matching magic filetype
        for i, Type in enumerate(self.supported_magic):
            if Type.mimetype == mimetype:
                break
        # Replace self.magic and self.magic_map
        del self.magic[Type.re_header]
        del self.magic_map[Type.re_header]
        self.magic.update({filetype.re_header: filetype.re_capture})
        self.magic_map.update({filetype.re_header: filetype})
        # Finally replace the existing filetype in supported_magic
        self.supported_magic[i] = filetype

    def init_screen(self):
        """
        Fills :attr:`screen` with empty lines of (unicode) spaces using
        :attr:`self.cols` and :attr:`self.rows` for the dimensions.

        .. note:: Just because each line starts out with a uniform length does not mean it will stay that way.  Processing of escape sequences is handled when an output function is called.
        """
        logging.debug('init_screen()')
        self.screen = [array('u', u' ' * self.cols) for a in xrange(self.rows)]
        # Tabstops
        self.tabstops = set(range(7, self.cols, 8))
        # Base cursor position
        self.cursorX = 0
        self.cursorY = 0
        self.rendition_set = False

    def init_renditions(self, rendition=unichr(1000)): # Match unicode_counter
        """
        Replaces :attr:`self.renditions` with arrays of *rendition* (characters)
        using :attr:`self.cols` and :attr:`self.rows` for the dimenions.
        """
        logging.debug(
            "init_renditions(%s)" % rendition.encode('unicode_escape'))
        # The actual renditions at various coordinates:
        self.renditions = [
            array('u', rendition * self.cols) for a in xrange(self.rows)]

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

    def send_message(self, message):
        """
        A convenience function for calling all CALLBACK_MESSAGE callbacks.
        """
        logging.debug('send_message(%s)' % message)
        try:
            for callback in self.callbacks[CALLBACK_MESSAGE].values():
                callback(message)
        except TypeError:
            pass

    def send_update(self):
        """
        A convenience function for calling all CALLBACK_CHANGED callbacks.
        """
        #logging.debug('send_update()')
        try:
            for callback in self.callbacks[CALLBACK_CHANGED].values():
                callback()
        except TypeError:
            pass

    def send_cursor_update(self):
        """
        A convenience function for calling all CALLBACK_CURSOR_POS callbacks.
        """
        #logging.debug('send_cursor_update()')
        try:
            for callback in self.callbacks[CALLBACK_CURSOR_POS].values():
                callback()
        except TypeError:
            pass

    def reset(self, *args, **kwargs):
        """
        Resets the terminal back to an empty screen with all defaults.  Calls
        :meth:`Terminal.callbacks[CALLBACK_RESET]` when finished.

        .. note:: If terminal output has been suspended (e.g. via ctrl-s) this will not un-suspend it (you need to issue ctrl-q to the underlying program to do that).
        """
        logging.debug('reset()')
        self.leds = {
            1: False,
            2: False,
            3: False,
            4: False
        }
        self.expanded_modes = {
            # Important defaults
            '1': False,
            '7': False,
            '25': True,
        }
        self.local_echo = True
        self.title = "Gate One"
        self.esc_buffer = ''
        self.insert_mode = False
        self.rendition_set = False
        self.current_charset = 0
        self.set_G0_charset('B')
        self.set_G1_charset('B')
        self.use_g0_charset()
        self.top_margin = 0
        self.bottom_margin = self.rows - 1
        self.alt_screen = None
        self.alt_renditions = None
        self.alt_cursorX = 0
        self.alt_cursorY = 0
        self.saved_cursorX = 0
        self.saved_cursorY = 0
        self.saved_rendition = [None]
        self.init_screen()
        self.init_renditions()
        self.init_scrollback()
        try:
            for callback in self.callbacks[CALLBACK_RESET].values():
                callback()
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
        logging.debug(
            "resize(%s, %s, em_dimensions: %s)" % (rows, cols, em_dimensions))
        if em_dimensions:
            self.em_dimensions = em_dimensions
        if rows == self.rows and cols == self.cols:
            return # Nothing to do--don't mess with the margins or the cursor
        if rows < self.rows: # Remove rows from the top
            for i in xrange(self.rows - rows):
                line = self.screen.pop(0)
                # Add it to the scrollback buffer so it isn't lost forever
                self.scrollback_buf.append(line)
                rend = self.renditions.pop(0)
                self.scrollback_renditions.append(rend)
        elif rows > self.rows: # Add rows at the bottom
            for i in xrange(rows - self.rows):
                line = array('u', u' ' * self.cols)
                renditions = array('u', unichr(1000) * self.cols)
                self.screen.append(line)
                self.renditions.append(renditions)
        self.rows = rows
        self.top_margin = 0
        self.bottom_margin = self.rows - 1
        # Fix the cursor location:
        if self.cursorY >= self.rows:
            self.cursorY = self.rows - 1
        if cols > self.cols: # Add cols to the right
            for i in xrange(self.rows):
                for j in xrange(cols - self.cols):
                    self.screen[i].append(u' ')
                    self.renditions[i].append(unichr(1000))
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
        #logging.debug("_set_top_bottom(%s)" % settings)
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
        self.saved_rendition = self.cur_rendition

    def restore_cursor_position(self, *args, **kwargs):
        """
        Restores the cursor position and rendition settings from
        :attr:`self.saved_cursorX`, :attr:`self.saved_cursorY`, and
        :attr:`self.saved_rendition` (if they're set).
        """
        if self.saved_cursorX and self.saved_cursorY:
            self.cursorX = self.saved_cursorX
            self.cursorY = self.saved_cursorY
            self.cur_rendition = self.saved_rendition

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

        .. note::

            Double-line height text is currently unimplemented (does anything
            actually use it?).
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
        self.charset = self.G0_charset

    def use_g1_charset(self):
        """
        Sets the current charset to G1.  This should get called when ASCII_SI
        is encountered.
        """
        #logging.debug(
            #"Switching to G1 charset (which is %s)" % repr(self.G1_charset))
        self.current_charset = 1
        self.charset = self.G1_charset

    def abort_capture(self):
        """
        A convenience function that takes care of canceling a file capture and
        cleaning up the output.
        """
        logging.debug('abort_capture()')
        self.cancel_capture = True
        self.write(b'\x00') # This won't actually get written
        self.send_update()
        self.send_message(_(u'File capture aborted.'))

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
        magic = self.magic
        magic_map = self.magic_map
        changed = False
        # This is commented because of how noisy it is.  Uncomment to debug the
        # terminal emualtor:
        #logging.debug('handling chars: %s' % repr(chars))
        # Only perform special checks (for FileTYpe stuff) if we're given bytes.
        # Incoming unicode chars should NOT be binary data.
        if not isinstance(chars, bytes):
            special_checks = False
        if special_checks:
            before_chars = b""
            after_chars = b""
            if not self.capture:
                for magic_header in magic:
                    try:
                        if magic_header.match(chars):
                            self.matched_header = magic_header
                            self.timeout_capture = datetime.now()
                            self.progress_timer = datetime.now()
                            # Create an instance of the filetype
                            self._filetype_instance()
                            break
                    except UnicodeEncodeError:
                        # Gibberish; drop it and pretend it never happened
                        logging.debug(_(
                            "Got UnicodeEncodeError trying to check FileTypes"))
                        self.esc_buffer = ""
                        # Make it so it won't barf below
                        chars = chars.encode(self.encoding, 'ignore')
            if self.capture or self.matched_header:
                self.capture += chars
                if self.cancel_capture:
                    # Try to split the garbage from the post-ctrl-c output
                    split_capture = self.RE_SIGINT.split(self.capture)
                    after_chars = split_capture[-1]
                    self.capture = b''
                    self.matched_header = None
                    self.cancel_capture = False
                    self.write(u'^C\r\n', special_checks=False)
                    self.write(after_chars, special_checks=False)
                    return
                ref = self.screen[self.cursorY][self.cursorX]
                ft_instance = self.captured_files[ref]
                if ft_instance.helper:
                    ft_instance.helper(self)
                now = datetime.now()
                if now - self.progress_timer > self.message_interval:
                    # Send an update of the progress to the user
                    # NOTE: This message will only get sent if it takes longer
                    # than self.message_interval to capture a file.  So it is
                    # nice and user friendly:  Small things output instantly
                    # without notifications while larger files that take longer
                    # to capture will keep the user abreast of the progress.
                    ft = magic_map[self.matched_header].name
                    indicator = 'K'
                    size = float(len(self.capture))/1024 # Kb
                    if size > 1024: # Switch to Mb
                        size = size/1024
                        indicator = 'M'
                    message = _(
                        "%s: %.2f%s captured..." % (ft, size, indicator))
                    self.notified = True
                    self.send_message(message)
                    self.progress_timer = datetime.now()
                match = ft_instance.re_capture.search(self.capture)
                if match:
                    logging.debug(
                        "Matched %s format (%s, %s).  Capturing..." % (
                        self.magic_map[self.matched_header].name,
                        self.cursorY, self.cursorX))
                    split_capture = ft_instance.re_capture.split(self.capture,1)
                    before_chars = split_capture[0]
                    self.capture = split_capture[1]
                    after_chars = b"".join(split_capture[2:])
                if after_chars:
                    is_container = magic_map[self.matched_header].is_container
                    if is_container and len(after_chars) > 500:
                        # Could be more to this file.  Let's wait until output
                        # slows down before attempting to perform a match
                        logging.debug(
                            "> 500 characters after capture.  Waiting for more")
                        return
                    else:
                        # These need to be written before the capture so that
                        # the FileType.capture() method can position things
                        # appropriately.
                        if before_chars:
                            # Empty out self.capture temporarily so these chars
                            # get handled properly
                            cap_temp = self.capture
                            self.capture = b""
                            # This will overwrite our ref:
                            self.write(before_chars, special_checks=False)
                            # Put it back for the rest of the processing
                            self.capture = cap_temp
                        # Perform the capture and start anew
                        self._capture_file(ref)
                        if self.notified:
                            # Send a final notice of how big the file was (just
                            # to keep things consistent).
                            ft = magic_map[self.matched_header].name
                            indicator = 'K'
                            size = float(len(self.capture))/1024 # Kb
                            if size > 1024: # Switch to Mb
                                size = size/1024
                                indicator = 'M'
                            message = _(
                                "%s: Capture complete (%.2f%s)" % (
                                ft, size, indicator))
                            self.notified = False
                            self.send_message(message)
                        self.capture = b"" # Empty it now that is is captured
                        self.matched_header = None # Ditto
                    self.write(after_chars, special_checks=True)
                    return
                return
        # Have to convert to unicode
        try:
            chars = chars.decode(self.encoding, "handle_special")
        except UnicodeDecodeError:
            # Just in case
            try:
                chars = chars.decode(self.encoding, "ignore")
            except UnicodeDecodeError:
                logging.error(
                    _("Double UnicodeDecodeError in terminal.Terminal."))
                return
        except AttributeError:
            # In Python 3 strings don't have .decode()
            pass # Already Unicode
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
                            logging.warning(_(
                                "Warning: No ESC sequence handler for %s"
                                % repr(self.esc_buffer)
                            ))
                            self.esc_buffer = ''
                    continue # We're done here
                changed = True
                if self.cursorX >= self.cols:
                    self.cursorX = 0
                    self.newline()
                    # Non-autowrap has been disabled due to issues with browser
                    # wrapping.
                    #if self.expanded_modes['7']:
                        #self.cursorX = 0
                        #self.newline()
                    #else:
                        #self.screen[self.cursorY].append(u' ') # Make room
                        #self.renditions[self.cursorY].append(u' ')
                try:
                    self.renditions[self.cursorY][
                        self.cursorX] = self.cur_rendition
                    if self.insert_mode:
                        # Insert mode dictates that we move everything to the
                        # right for every character we insert.  Normally the
                        # program itself will take care of this but older
                        # programs and shells will simply set call ESC[4h,
                        # insert the character, then call ESC[4i to return the
                        # terminal to its regular state.
                        self.insert_characters(1)
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
                            # Sometimes a joined combining char can still result
                            # a string of length > 1.  So we need to handle that
                            if len(combined) > 1:
                                for i, c in enumerate(combined):
                                    self.screen[self.cursorY][
                                        self.cursorX] = c
                                    if i < len(combined) - 1:
                                        self.cursorX += 1
                            else:
                                self.screen[self.cursorY][
                                    self.cursorX] = combined
                        else:
                            # Normal character
                            self.screen[self.cursorY][self.cursorX] = char
                except IndexError as e:
                    # This can happen when escape sequences go haywire
                    # Only log the error if debugging is enabled (because we
                    # really don't care that much 99% of the time)
                    logger = logging.getLogger()
                    if logger.level < 20:
                        logging.error(_(
                            "IndexError in write(): %s" % e))
                        import traceback, sys
                        traceback.print_exc(file=sys.stdout)
                self.cursorX += 1
                #self.cursor_right()
            self.prev_char = char
        if changed:
            self.modified = True
            # Execute our callbacks
            self.send_update()
            self.send_cursor_update()

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

        .. note::

            This will only scroll up the region within `self.top_margin` and
            `self.bottom_margin` (if set).
        """
        #logging.debug("scroll_up(%s)" % n)
        empty_line = array('u', u' ' * self.cols) # Line full of spaces
        empty_rend = array('u', unichr(1000) * self.cols)
        for x in xrange(int(n)):
            line = self.screen.pop(self.top_margin) # Remove the top line
            self.scrollback_buf.append(line) # Add it to the scrollback buffer
            if len(self.scrollback_buf) > self.max_scrollback:
                self.init_scrollback()
                # NOTE:  This would only be the # of lines piled up before the
                # next dump_html() or dump().
            # Add it to the bottom of the window:
            self.screen.insert(self.bottom_margin, empty_line[:]) # A copy
            # Remove top line's rendition information
            rend = self.renditions.pop(self.top_margin)
            self.scrollback_renditions.append(rend)
            # Insert a new empty rendition as well:
            self.renditions.insert(self.bottom_margin, empty_rend[:])
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
            empty_line = array('u', unichr(1000) * self.cols)
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
            empty_rend = array('u', unichr(1000) * self.cols)
            self.renditions.insert(self.cursorY, empty_rend) # Insert at cursor

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
            empty_rend = array('u', unichr(1000) * self.cols)
            self.renditions.insert(self.bottom_margin, empty_rend)

    def backspace(self):
        """Execute a backspace (\\x08)"""
        self.cursor_left(1)

    def horizontal_tab(self):
        """Execute horizontal tab (\\x09)"""
        for stop in sorted(self.tabstops):
            if self.cursorX < stop:
                self.cursorX = stop + 1
                break
        else:
            self.cursorX = self.cols - 1

    def _set_tabstop(self):
        """Sets a tabstop at the current position of :attr:`self.cursorX`."""
        if self.cursorX not in self.tabstops:
            for tabstop in self.tabstops:
                if self.cursorX > tabstop:
                    self.tabstops.add(self.cursorX)
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
        cols = self.cols
        self.cursorY += 1
        if self.cursorY > self.bottom_margin:
            self.scroll_up()
            self.cursorY = self.bottom_margin
            self.clear_line()
        # Shorten the line if it is longer than the number of columns
        # NOTE: This lets us keep the width of existing lines even if the number
        # of columns is reduced while at the same time accounting for apps like
        # 'top' that merely overwrite existing lines.  If we didn't do this
        # the output from 'top' would get all messed up from leftovers at the
        # tail end of every line when self.cols had a larger value.
        if len(self.screen[self.cursorY]) >= cols:
            self.screen[self.cursorY] = self.screen[self.cursorY][:cols]
            self.renditions[self.cursorY] = self.renditions[self.cursorY][:cols]
        # NOTE: The above logic is placed inside of this function instead of
        # inside self.write() in order to reduce CPU utilization.  There's no
        # point in performing a conditional check for every incoming character
        # when the only time it will matter is when a newline is being written.

    def carriage_return(self):
        """
        Executes a carriage return (sets :attr:`self.cursorX` to 0).  In other
        words it moves the cursor back to position 0 on the line.
        """
        if self.cursorX == 0:
            return # Nothing to do
        if divmod(self.cursorX, self.cols+1)[1] == 0:
            # A carriage return at the precise end of line means the program is
            # assuming vt100-style autowrap.  Since we let the browser handle
            # that we need to discard this carriage return since we're not
            # actually making a newline.
            if self.prev_char not in [u'\x1b', u'\n']:
                # These are special cases where the underlying shell is assuming
                # autowrap so we have to emulate it.
                self.newline()
            else:
                return
        if not self.capture:
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
        by setting :attr:`self.esc_buffer` to '\\\\x1b[' (which is the CSI
        escape sequence).
        """
        self.esc_buffer = '\x1b['

    def _filetype_instance(self):
        """
        Instantiates a new instance of the given :class:`FileType` (using
        `self.matched_header`) and stores the result in `self.captured_files`
        and creates a reference to that location at the current cursor location.
        """
        ref = self.file_counter.next()
        logging.debug("_filetype_instance(%s)" % repr(ref))
        # Before doing anything else we need to mark the current cursor
        # location as belonging to our file
        self.screen[self.cursorY][self.cursorX] = ref
        # Create an instance of the filetype we can reference
        filetype_instance = self.magic_map[self.matched_header](
            path=self.temppath,
            linkpath=self.linkpath,
            icondir=self.icondir)
        self.captured_files[ref] = filetype_instance

    def _capture_file(self, ref):
        """
        This function gets called by :meth:`Terminal.write` when the incoming
        character stream matches a value in :attr:`self.magic`.  It will call
        whatever function is associated with the matching regex in
        :attr:`self.magic_map`.  It also stores the current file capture
        reference (*ref*) at the current cursor location.
        """
        logging.debug("_capture_file(%s)" % repr(ref))
        self.screen[self.cursorY][self.cursorX] = ref
        filetype_instance = self.captured_files[ref]
        filetype_instance.capture(self.capture, self)
        # Start up an open file watcher so leftover file objects get
        # closed when they're no longer being used
        if not self.watcher or not self.watcher.isAlive():
            import threading
            self.watcher = threading.Thread(
                name='watcher', target=self._captured_fd_watcher)
            self.watcher.setDaemon(True)
            self.watcher.start()
        return

    def _captured_fd_watcher(self):
        """
        Meant to be run inside of a thread, calls
        :meth:`Terminal.close_captured_fds` until there are no more open image
        file descriptors.
        """
        logging.debug("starting _captured_fd_watcher()")
        import time
        self.quitting = False
        while not self.quitting:
            if self.captured_files:
                self.close_captured_fds()
                time.sleep(5)
            else:
                self.quitting = True
        logging.debug('_captured_fd_watcher() quitting: No more images.')

    def close_captured_fds(self):
        """
        Closes the file descriptors of any captured files that are no longer on
        the screen.
        """
        #logging.debug('close_captured_fds()') # Commented because it's kinda noisy
        if self.captured_files:
            for ref in list(self.captured_files.keys()):
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
                    try:
                        self.captured_files[ref].close()
                    except AttributeError:
                        pass # File already closed or never captured properly
                    del self.captured_files[ref]

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
        logging.warning(_("Warning: No special ESC sequence handler for %s" %
            repr(self.esc_buffer)))
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
            logging.debug('Regular bell')
            try:
                for callback in self.callbacks[CALLBACK_BELL].values():
                    callback()
            except TypeError:
                pass
        else: # We're (likely) setting a title
            self.esc_buffer += '\x07' # Add the bell char so we don't lose it
            self._osc_handler()

    def _device_status_report(self, n=None):
        """
        Returns '\\\\x1b[0n' (terminal OK) and executes:

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

    def _csi_device_identification(self, request=None):
        """
        If we're responding to ^[Z, ^[c, or ^[0c, returns '\\\\x1b[1;2c'
        (Meaning: I'm a vt220 terminal, version 1.0) and
        executes:

        .. code-block:: python

            self.callbacks[self.CALLBACK_DSR]("\\x1b[1;2c")

        If we're responding to ^[>c or ^[>0c, executes:

        .. code-block:: python

            self.callbacks[self.CALLBACK_DSR]("\\x1b[>0;271;0c")
        """
        logging.debug("_csi_device_identification(%s)" % request)
        if request and u">" in request:
            response = u"\x1b[>0;271;0c"
        else:
            response = u"\x1b[?1;2c"
        try:
            for callback in self.callbacks[CALLBACK_DSR].values():
                callback(response)
        except TypeError:
            pass
        return response

    def _csi_device_status_report(self, request=None):
        """
        Calls :meth:`self.callbacks[self.CALLBACK_DSR]` with an appropriate
        response to the given *request*.

        .. code-block:: python

            self.callbacks[self.CALLBACK_DSR](response)

        Supported requests and their responses:

            =============================    ==================
            Request                          Response
            =============================    ==================
            ^[5n (Status Report)             ^[[0n
            ^[6n (Report Cursor Position)    ^[[<row>;<column>R
            ^[15n (Printer Ready?)           ^[[10n (Ready)
            =============================    ==================
        """
        logging.debug("_csi_device_status_report(%s)" % request)
        supported_requests = [
            u"5",
            u"6",
            u"15",
        ]
        if not request:
            return # Nothing to do
        response = u""
        if request.startswith('?'):
            # Get rid of it
            request = request[1:]
        if request in supported_requests:
            if request == u"5":
                response = u"\x1b[0n"
            elif request == u"6":
                rows = self.cursorY + 1
                cols = self.cursorX + 1
                response = u"\x1b[%s;%sR" % (rows, cols)
            elif request == u"15":
                response = u"\x1b[10n"
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
            '?5h' - DECSCNM (default off): Set reverse-video mode
            '?7h' - DECAWM: Autowrap mode
            '?12h' - Local echo (SRM or Send Receive Mode)
            '?25h' - Hide cursor
            '?1000h' - Send Mouse X/Y on button press and release
            '?1001h' - Use Hilite Mouse Tracking
            '?1002h' - Use Cell Motion Mouse Tracking
            '?1003h' - Use All Motion Mouse Tracking
            '?1004h' - Send focus in/focus out events
            '?1005h' - Enable UTF-8 Mouse Mode
            '?1006h' - Enable SGR Mouse Mode
            '?1015h' - Enable urxvt Mouse Mode
            '?1049h' - Save cursor and screen
        """
        # TODO: Add support for the following:
        # * 3: 132 column mode (might be "or greater")
        # * 4: Smooth scroll (for animations and also makes things less choppy)
        # * 5: Reverse video (should be easy: just need some extra CSS)
        # * 6: Origin mode
        # * 7: Wraparound mode
        logging.debug("set_expanded_mode(%s)" % setting)
        if setting.startswith('?'):
            # DEC Private Mode Set
            setting = setting[1:] # Don't need the ?
            settings = setting.split(';')
            for setting in settings:
                try:
                    self.expanded_mode_handlers[setting](True)
                except (KeyError, TypeError):
                    pass # Unsupported expanded mode
            try:
                for callback in self.callbacks[CALLBACK_MODE].values():
                    callback(setting, True)
            except TypeError:
                pass
        else:
            # There's a couple mode settings that are just "[Nh" where N==number
            # [2h Keyboard Action Mode (AM)
            # [4h Insert Mode
            # [12h Send/Receive Mode (SRM)
            # [24h Automatic Newline (LNM)
            if setting == '4':
                self.insert_mode = True

    def reset_expanded_mode(self, setting):
        """
        Accepts "standard mode" settings.  Typically '\\\\x1b[?25l' to show
        cursor.
        """
        logging.debug("reset_expanded_mode(%s)" % setting)
        if setting.startswith('?'):
            setting = setting[1:] # Don't need the ?
            settings = setting.split(';')
            for setting in settings:
                try:
                    self.expanded_mode_handlers[setting](False)
                except (KeyError, TypeError):
                    pass # Unsupported expanded mode
            try:
                for callback in self.callbacks[CALLBACK_MODE].values():
                    callback(setting, False)
            except TypeError:
                pass
        else:
            # There's a couple mode settings that are just "[Nh" where N==number
            # [2h Keyboard Action Mode (AM)
            # [4h Insert Mode
            # [12h Send/Receive Mode (SRM)
            # [24h Automatic Newline (LNM)
            # The only one we care about is 4 (insert mode)
            if setting == '4':
                self.insert_mode = False

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
        self.cur_rendition = unichr(1000)

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

    def expanded_mode_toggle(self, mode, boolean):
        """
        Meant to be used with (simple) expanded mode settings that merely set or
        reset attributes for tracking purposes; sets `self.expanded_modes[mode]`
        to *boolean*.  Example usage::

            >>> self.expanded_mode_handlers['1000'] = partial(self.expanded_mode_toggle, 'mouse_button_events')
        """
        self.expanded_modes[mode] = boolean

    def insert_characters(self, n=1):
        """
        Inserts the specified number of characters at the cursor position.
        Overwriting whatever is already present.
        """
        #logging.debug("insert_characters(%s)" % n)
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
                self.renditions[self.cursorY].append(unichr(1000))
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
            self.renditions[self.cursorY][self.cursorX+i] = unichr(1000)

    def cursor_left(self, n=1):
        """ESCnD CUB (Cursor Back)"""
        # Commented out to save CPU (and the others below too)
        #logging.debug('cursor_left(%s)' % n)
        n = int(n)
        # This logic takes care of double-width unicode characters
        if self.double_width_left:
            self.double_width_left = False
            return
        self.cursorX = max(0, self.cursorX - n) # Ensures positive value
        try:
            char = self.screen[self.cursorY][self.cursorX]
        except IndexError: # Cursor is past the right-edge of the screen; ignore
            char = u' ' # This is a safe default/fallback
        if unicodedata.east_asian_width(char) == 'W':
            # This lets us skip the next call (get called 2x for 2x width)
            self.double_width_left = True
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
        # This logic takes care of double-width unicode characters
        if self.double_width_right:
            self.double_width_right = False
            return
        self.cursorX += n
        try:
            char = self.screen[self.cursorY][self.cursorX]
        except IndexError: # Cursor is past the right-edge of the screen; ignore
            char = u' ' # This is a safe default/fallback
        if unicodedata.east_asian_width(char) == 'W':
            # This lets us skip the next call (get called 2x for 2x width)
            self.double_width_right = True
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
        #logging.debug("cursor_next_line(%s)" % n)
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
        #logging.debug("cursor_previous_line(%s)" % n)
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
        # The column needs special attention in case there's double-width
        # characters.
        double_width = 0
        if self.cursorY < self.rows:
            for i, char in enumerate(self.screen[self.cursorY]):
                if i == col - double_width:
                    # No need to continue further
                    break
                if unicodedata.east_asian_width(char) == 'W':
                    double_width += 1
            if double_width:
                col = col - double_width
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

        .. note::

            The current rendition (self.cur_rendition) will be applied to all
            characters on the screen when this function is called.
        """
        logging.debug('clear_screen()')
        self.scroll_up(len(self.screen) - 1)
        self.init_screen()
        self.init_renditions(self.cur_rendition)
        self.cursorX = 0
        self.cursorY = 0

    def clear_screen_from_cursor_down(self):
        """
        Clears the screen from the cursor down (ESC[J or ESC[0J).

        .. note:: This method actually erases from the cursor position to the end of the screen.
        """
        #logging.debug('clear_screen_from_cursor_down()')
        self.clear_line_from_cursor_right()
        if self.cursorY == self.rows - 1:
            # Bottom of screen; nothing to do
            return
        self.screen[self.cursorY+1:] = [
            array('u', u' ' * self.cols) for a in self.screen[self.cursorY+1:]
        ]
        c = self.cur_rendition # Just to save space below
        self.renditions[self.cursorY+1:] = [
            array('u', c * self.cols) for a in self.renditions[self.cursorY+1:]
        ]

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
            self.cur_rendition * len(self.screen[self.cursorY][:self.cursorX]))
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
        logging.debug("set_led_state(%s)" % n)
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
            try:
                if len(self.renditions[cursorY]) <= cursorX:
                    # Make it all longer
                    self.renditions[cursorY].append(u' ') # Make it longer
                    self.screen[cursorY].append(u'\x00') # This needs to match
            except IndexError:
                # This can happen if the rate limiter kicks in and starts
                # cutting off escape sequences at random.
                return # Don't bother attempting to process anything else
        if cursorY >= self.rows:
            logging.error(_(
                "cursorY >= self.rows!  This is either a bug or just a symptom "
                "of the rate limiter kicking in."))
            return # Don't bother setting renditions past the bottom
        if not n: # or \x1b[m (reset)
            # First char in PUA Plane 16 is always the default:
            self.cur_rendition = unichr(1000) # Should be reset (e.g. [0])
            return # No need for further processing; save some CPU
        # Convert the string (e.g. '0;1;32') to a list (e.g. [0,1,32]
        new_renditions = [int(a) for a in n.split(';') if a != '']
        # Handle 256-color renditions by getting rid of the (38|48);5 part and
        # incrementing foregrounds by 1000 and backgrounds by 10000 so we can
        # tell them apart in _spanify_screen().
        try:
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
        except IndexError:
            # Likely that the rate limiter has caused all sorts of havoc with
            # escape sequences.  Just ignore it and halt further processing
            return
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

        .. note::

            I added this functionality so that plugin authors would have a
            mechanism to communicate with terminal applications.  See the SSH
            plugin for an example of how this can be done (there's channels of
            communication amongst ssh_connect.py, ssh.js, and ssh.py).
        """
        try:
            for callback in self.callbacks[CALLBACK_OPT].values():
                callback(chars)
        except TypeError:
            # High likelyhood that nothing is defined.  No biggie.
            pass

# NOTE:  This was something I was testing to simplify the code. It works
# (mostly) but the performance was TERRIBLE.  Still needs investigation...
    #def _classify_renditions(self):
        #"""
        #Returns ``self.renditions`` as a list of HTML classes for each position.
        #"""
        #return [[map(RENDITION_CLASSES.get, rend) for rend in map(
                #self.renditions_store.get, rendition)]
                    #for rendition in self.renditions]

    #def _spanify_line(self, line, rendition, current_classes=None, cursor=False):
        #"""
        #Returns a string containing *line* with HTML spans applied representing
        #*renditions*.
        #"""
        #outline = ""
        #reset_classes = RESET_CLASSES # TODO
        #html_entities = {"&": "&amp;", '<': '&lt;', '>': '&gt;'}
        #foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        #backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        #prev_rendition = None
        #if current_classes:
            #outline += '<span class="%s%s">' % (
                #self.class_prefix,
                #(" %s" % self.class_prefix).join(current_classes))
        #charcount = 0
        #for char, rend in izip(line, rendition):
            #changed = True
            #if char in "&<>":
                ## Have to convert ampersands and lt/gt to HTML entities
                #char = html_entities[char]
            #if rend == prev_rendition:
                ## Shortcut...  So we can skip all the logic below
                #changed = False
            #else:
                #prev_rendition = rend
            #if changed:
                #outline += "</span>"
                #current_classes = [a for a in rend if a and 'reset' not in a]
                ##if rend and rend[0] == 'reset':
                    ##if len(current_classes) > 1:
                        ##classes = (
                            ##" %s" % self.class_prefix).join(current_classes)
                ##else:
                #classes = (" %s" % self.class_prefix).join(current_classes)
                #if current_classes != ['reset']:
                    #outline += '<span class="%s%s">' % (
                        #self.class_prefix, classes)
            #if cursor and charcount == cursor:
                #outline += '<span class="%scursor">%s</span>' % (
                    #self.class_prefix, char)
            #else:
                #outline += char
            #charcount += 1
        #open_spans = outline.count('<span')
        #close_spans = outline.count('</span')
        #if open_spans != close_spans:
            #for i in xrange(open_spans - close_spans):
                #outline += '</span>'
        #return current_classes, outline

    #def _spanify_screen_test(self):
        #"""
        #Iterates over the lines in *screen* and *renditions*, applying HTML
        #markup (span tags) where appropriate and returns the result as a list of
        #lines. It also marks the cursor position via a <span> tag at the
        #appropriate location.
        #"""
        ##logging.debug("_spanify_screen()")
        #results = []
        ## NOTE: Why these duplicates of self.* and globals?  Local variable
        ## lookups are faster--especially in loops.
        #special = SPECIAL
        ##rendition_classes = RENDITION_CLASSES
        #html_cache = HTML_CACHE
        #has_cache = isinstance(html_cache, AutoExpireDict)
        #screen = self.screen
        #renditions = self.renditions
        #renditions_store = self.renditions_store
        #classified_renditions = self._classify_renditions()
        #cursorX = self.cursorX
        #cursorY = self.cursorY
        #show_cursor = self.expanded_modes['25']
        ##spancount = 0
        #current_classes = []
        ##prev_rendition = None
        ##foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        ##backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        ##html_entities = {"&": "&amp;", '<': '&lt;', '>': '&gt;'}
        #cursor_span = '<span class="%scursor">' % self.class_prefix
        #for linecount, line in enumerate(screen):
            #rendition = classified_renditions[linecount]
            #combined = (line + renditions[linecount]).tounicode()
            #if has_cache and combined in html_cache:
                ## Always re-render the line with the cursor (or just had it)
                #if cursor_span not in html_cache[combined]:
                    ## Use the cache...
                    #results.append(html_cache[combined])
                    #continue
            #if not len(line.tounicode().rstrip()) and linecount != cursorY:
                #results.append(line.tounicode())
                #continue # Line is empty so we don't need to process renditions
            #if linecount == cursorY and show_cursor:
                #current_classes, outline = self._spanify_line(
                    #line, rendition,
                    #current_classes=current_classes,
                    #cursor=cursorX)
            #else:
                #current_classes, outline = self._spanify_line(
                    #line, rendition,
                    #current_classes=current_classes,
                    #cursor=False)
            #if outline:
                #results.append(outline)
                #if html_cache:
                    #html_cache[combined] = outline
            #else:
                #results.append(None) # null is less memory than spaces
            ## NOTE: The client has been programmed to treat None (aka null in
            ##       JavaScript) as blank lines.
        #return results

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
        html_cache = HTML_CACHE
        has_cache = isinstance(html_cache, AutoExpireDict)
        screen = self.screen
        renditions = self.renditions
        renditions_store = self.renditions_store
        cursorX = self.cursorX
        cursorY = self.cursorY
        show_cursor = self.expanded_modes['25']
        spancount = 0
        current_classes = set()
        prev_rendition = None
        foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        html_entities = {"&": "&amp;", '<': '&lt;', '>': '&gt;'}
        cursor_span = '<span class="%scursor">' % self.class_prefix
        for linecount, line in enumerate(screen):
            rendition = renditions[linecount]
            line_chars = line.tounicode()
            combined = line_chars + rendition.tounicode()
            cursor_line = True if linecount == cursorY else False
            if not cursor_line and has_cache and combined in html_cache:
                # Always re-render the line with the cursor (or just had it)
                if cursor_span not in html_cache[combined]:
                    # Use the cache...
                    results.append(html_cache[combined])
                    continue
            if not len(line_chars.rstrip()) and not cursor_line:
                results.append(line_chars)
                continue # Line is empty so we don't need to process renditions
            outline = ""
            if current_classes:
                outline += '<span class="%s%s">' % (
                    self.class_prefix,
                    (" %s" % self.class_prefix).join(current_classes))
            charcount = 0
            for char, rend in izip(line, rendition):
                rend = renditions_store[rend] # Get actual rendition
                if ord(char) >= special: # Special stuff =)
                    # Obviously, not really a single character
                    if char in self.captured_files:
                        outline += self.captured_files[char].html()
                        continue
                changed = True
                if char in "&<>":
                    # Have to convert ampersands and lt/gt to HTML entities
                    char = html_entities[char]
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
                                    current_classes = set()
                                    if spancount:
                                        for i in xrange(spancount):
                                            outline += "</span>"
                                        spancount = 0
                                else:
                                    reset_class = _class.split('reset')[0]
                                    if reset_class == 'foreground':
                                        [current_classes.remove(a) for a in
                                        current_classes if a in foregrounds]
                                    elif reset_class == 'background':
                                        [current_classes.remove(a) for a in
                                        current_classes if a in backgrounds]
                                    elif reset_class in current_classes:
                                        current_classes.remove(reset_class)
                            else:
                                if _class in foregrounds:
                                    [current_classes.remove(a) for a in
                                    current_classes if a in foregrounds]
                                elif _class in backgrounds:
                                    [current_classes.remove(a) for a in
                                    current_classes if a in backgrounds]
                                current_classes.add(_class)
                    if current_classes:
                        outline += '<span class="%s%s">' % (
                            self.class_prefix,
                            (" %s" % self.class_prefix).join(current_classes))
                        spancount += 1
                if cursor_line and show_cursor and charcount == cursorX:
                    outline += '<span class="%scursor">%s</span>' % (
                        self.class_prefix, char)
                else:
                    outline += char
                charcount += 1
            if outline:
                # Make sure all renditions terminate at the end of the line
                for whatever in xrange(spancount):
                    outline += "</span>"
                results.append(outline)
                if has_cache:
                    html_cache[combined] = outline
            else:
                results.append(None) # null is shorter than spaces
            # NOTE: The client has been programmed to treat None (aka null in
            #       JavaScript) as blank lines.
        for whatever in xrange(spancount): # Bit of cleanup to be safe
            results[-1] += "</span>"
        return results

    def _spanify_scrollback(self):
        """
        Spanifies (turns renditions into `<span>` elements) everything inside
        `self.scrollback` using `self.renditions`.  This differs from
        `_spanify_screen` in that it doesn't apply any logic to detect the
        location of the cursor (to make it just a tiny bit faster).
        """
        # NOTE: See the comments in _spanify_screen() for details on this logic
        results = []
        special = SPECIAL
        html_cache = HTML_CACHE
        has_cache = isinstance(html_cache, AutoExpireDict)
        screen = self.scrollback_buf
        renditions = self.scrollback_renditions
        rendition_classes = RENDITION_CLASSES
        renditions_store = self.renditions_store
        spancount = 0
        current_classes = set()
        prev_rendition = None
        foregrounds = ('f0','f1','f2','f3','f4','f5','f6','f7')
        backgrounds = ('b0','b1','b2','b3','b4','b5','b6','b7')
        html_entities = {"&": "&amp;", '<': '&lt;', '>': '&gt;'}
        cursor_span = '<span class="%scursor">' % self.class_prefix
        for line, rendition in izip(screen, renditions):
            combined = (line + rendition).tounicode()
            if has_cache and combined in html_cache:
                # Most lines should be in the cache because they were rendered
                # while they were on the screen.
                if cursor_span not in html_cache[combined]:
                    results.append(html_cache[combined])
                    continue
            if not len(line.tounicode().rstrip()):
                results.append(line.tounicode())
                continue # Line is empty so we don't need to process renditions
            outline = ""
            if current_classes:
                outline += '<span class="%s%s">' % (
                    self.class_prefix,
                    (" %s" % self.class_prefix).join(current_classes))
            for char, rend in izip(line, rendition):
                rend = renditions_store[rend] # Get actual rendition
                if ord(char) >= special: # Special stuff =)
                    # Obviously, not really a single character
                    if char in self.captured_files:
                        outline += self.captured_files[char].html()
                        continue
                changed = True
                if char in "&<>":
                    # Have to convert ampersands and lt/gt to HTML entities
                    char = html_entities[char]
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
                                    current_classes = set()
                                else:
                                    reset_class = _class.split('reset')[0]
                                    if reset_class == 'foreground':
                                        [current_classes.remove(a) for a in
                                        current_classes if a in foregrounds]
                                    elif reset_class == 'background':
                                        [current_classes.remove(a) for a in
                                        current_classes if a in backgrounds]
                                    elif reset_class in current_classes:
                                        current_classes.remove(reset_class)
                            else:
                                if _class in foregrounds:
                                    [current_classes.remove(a) for a in
                                    current_classes if a in foregrounds]
                                elif _class in backgrounds:
                                    [current_classes.remove(a) for a in
                                    current_classes if a in backgrounds]
                                current_classes.add(_class)
                    if current_classes:
                        outline += '<span class="%s%s">' % (
                            self.class_prefix,
                            (" %s" % self.class_prefix).join(current_classes))
                        spancount += 1
                outline += char
            if outline:
                # Make sure all renditions terminate at the end of the line
                for whatever in xrange(spancount):
                    outline += "</span>"
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

        .. note::

            This places <span class="cursor">(current character)</span> around
            the cursor location.
        """
        if renditions: # i.e. Use stylized text (the default)
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
                    for x, char in enumerate(row):
                        if x == cursorX:
                            cursor_row += (
                                '<span class="%scursor">%s</span>' % (
                                self.class_prefix, char))
                        else:
                            cursor_row += char
                    screen.append(cursor_row)
                else:
                    screen.append("".join(row))
            scrollback = [a.tounicode() for a in self.scrollback_buf]
        # Empty the scrollback buffer:
        self.init_scrollback()
        self.modified = False
        return (scrollback, screen)

# NOTE: This is a work-in-progress.  Don't use it.
    def dump_html_async(self, identifier=None, renditions=True, callback=None):
        """
        Dumps the terminal screen as a list of HTML-formatted lines.  If
        *renditions* is True (default) then terminal renditions will be
        converted into HTML <span> elements so they will be displayed properly
        in a browser.  Otherwise only the cursor <span> will be added to mark
        its location.

        .. note::

            This places <span class="cursor">(current character)</span> around
            the cursor location.
        """
        if self.async:
            state_obj = {
                'html_cache': HTML_CACHE,
                'screen': self.screen,
                'renditions': self.renditions,
                'renditions_store': self.renditions_store,
                'cursorX': self.cursorX,
                'cursorY': self.cursorY,
                'show_cursor': self.expanded_modes['25'],
                'class_prefix': self.class_prefix
            }
            self.async.call_singleton(
                spanify_screen, identifier, state_obj, callback=callback)
        else:
            scrollback, screen = self.dump_html(renditions=renditions)
            callback(scrollback, screen)

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
def css_renditions(selector=None):
    """
    Returns a (long) string containing all the CSS styles in order to support
    terminal text renditions (different colors, bold, etc) in an HTML terminal
    using the dump_html() function.  If *selector* is provided, all styles will
    be prefixed with said selector like so::

        ${selector} span.f0 { color: #5C5C5C; }

    Example::

        >>> css_renditions("#gateone").splitlines()[7]
        '#gateone span.f0 { color: #5C5C5C; } /* Black */'
    """
    from string import Template
    # Try looking for the fallback CSS template in two locations:
    #   * The same directory that holds terminal.py
    #   * A 'templates' directory in the same location as terminal.py
    template_name = 'terminal_renditions_fallback.css'
    template_path = os.path.join(os.path.split(__file__)[0], template_name)
    if not os.path.exists(template_path):
        # Try looking in a 'templates' directory
        template_path = os.path.join(
            os.path.split(__file__)[0], 'templates', template_name)
    if not os.path.exists(template_path):
        raise IOError("File not found: %s" % template_name)
    with open(template_path) as f:
        css = f.read()
    renditions_template = Template(css)
    return renditions_template.substitute(selector=selector)
