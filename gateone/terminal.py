# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__version__ = '0.9'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
About This Module
=================
This crux of this module is the Terminal class which is a pure-Python
implementation of a quintessential Unix-style terminal emulator.  It actually
does its best to emulate an xterm.  This means it supports the majority of the
relevant portions of ECMA-48.  This includes support for emulating varous VT-*
terminal types as well as the "linux" terminal type.

The Terminal class's emulation support is not complete but it should suffice for
most terminal emulation needs.  If additional support for certain escape
sequences or modes are required please feel free to provide a patch or to simply
ask for something to be added.

Note that Terminal was written from scratch in order to be as fast as possible.
Comments have been placed where different implementations/development patterns
have been tried and ultimately failed to provide speed improvements.  Any and
all suggestions or patches to improve speed (or emulation support) are welcome!

Supported Emulation Types
-------------------------
Without any special mode settings or parameters, Terminal should be able to
support most applications under the following terminal types (e.g.
"export TERM=<terminal type>"):

 * xterm (the most important one)
 * ECMA-48/ANSI X3.64
 * Nearly all the VT-* types:  VT-52, VT-100, VT-220, VT-320, VT-420, and VT-520
 * Linux console ("linux")

What Terminal Doesn't Do
------------------------
The Terminal class is meant to emulate the display portion of a given terminal.
It does not translate keystrokes into escape sequences or special control
codes--you'll have to take care of that in your application (or at the
client-side like Gate One).  It does, however, keep track of many
keystroke-specific modes of operation such as Application Cursor Keys and the G0
and G1 charset modes *with* callbacks that can be used to notify your
application when something changes.

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

============================    ========================================================================
Callback                        Called when...
============================    ========================================================================
Terminal.CALLBACK_SCROLL_UP     The terminal is scrolled up (back).
Terminal.CALLBACK_CHANGED       The screen is changed/updated.
Terminal.CALLBACK_CURSOR_POS    The cursor position changes.
Terminal.CALLBACK_DSR           A Device Status Report (DSR) is requested (via the DSR escape sequence).
Terminal.CALLBACK_TITLE         The terminal title changes (xterm-style)
Terminal.CALLBACK_BELL          The bell character (^G) is encountered.
Terminal.CALLBACK_OPT           The special optional escape sequence is encountered.
Terminal.CALLBACK_MODE          The terminal mode setting changes (e.g. use alternate screen buffer).
============================    ========================================================================

Note that Terminal.CALLBACK_DSR is special in that it in most cases it will be called with arguments.  See the code for examples of how and when this happens.

Also, in most cases it is unwise to override Terminal.CALLBACK_MODE since this method is primarily meant for internal use within the Terminal class.

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
Whenever a scroll_up() event occurs, the line (or lines) that will be removed
from the top of the screen will be placed into Terminal.scrollback_buf.  Then,
whenever dump_html() is called, the scrollback buffer will be returned along
with the screen output and reset to an empty state.

Why do this?  In the event that a very large write() occurs (e.g. 'ps aux'), it
gives the controlling program the ability to capture what went past the screen
without some fancy tracking logic surrounding Terminal.write().

More information about how this works can be had by looking at the dump_html()
function itself.

.. note:: There's more than one function that empties Terminal.scrollback_buf when called.  You'll just have to have a look around =)

Class Docstrings
================
"""

# Import stdlib stuff
import re, time, logging
from collections import defaultdict
from itertools import imap, izip
import copy

# Import our own stuff
from utils import get_translation

_ = get_translation()

# Globals

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
    9: 'strikethrough',
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
    29: 'strikethroughreset',
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

# TODO List:
#
#   * Needs tests!
#   * Figure out how to handle programs like htop that position the cursor without following up with proper rendition reset sequences.

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
    ASCII_XON = 17    # Resume Transmission
    ASCII_XOFF = 19   # Stop Transmission or Ignore Characters
    ASCII_CAN = 24    # Cancel Escape Sequence
    ASCII_SUB = 26    # Substitute: Cancel Escape Sequence and replace with ?
    ASCII_ESC = 27    # Escape
    ASCII_CSI = 155   # Control Sequence Introducer (that nothing uses)
    ASCII_HTS = 210   # Horizontal Tab Stop (HTS)

    charsets = {'0': { # Line drawing mode
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

    CALLBACK_SCROLL_UP = 1    # Called after a scroll up event (new line)
    CALLBACK_CHANGED = 2      # Called after the screen is updated
    CALLBACK_CURSOR_POS = 3   # Called after the cursor position is updated
    # <waives hand in air> You are not concerned with the number 4
    CALLBACK_DSR = 5          # Called when a DSR requires a response
    # NOTE: CALLBACK_DSR must accept 'response' as either the first argument or
    #       as a keyword argument.
    CALLBACK_TITLE = 6        # Called when the terminal sets the window title
    CALLBACK_BELL = 7         # Called after ASCII_BEL is encountered.
    CALLBACK_OPT = 8   # Called when we encounter the optional ESC sequence
    # NOTE: CALLBACK_OPT must accept 'chars' as either the first argument or as
    #       a keyword argument.
    CALLBACK_MODE = 9  # Called when the terminal mode changes (e.g. DECCKM)

    RE_CSI_ESC_SEQ = re.compile(r'\x1B\[([?A-Za-z0-9;@:\!]*)([A-Za-z@_])')
    RE_ESC_SEQ = re.compile(r'\x1b(.*\x1b\\|[ABCDEFGHIJKLMNOQRSTUVWXYZa-z0-9=]|[()# %*+].)')
    RE_TITLE_SEQ = re.compile(r'\x1b\][0-2]\;(.*)(\x07|\x1b\\)')
    # The below regex is used to match our optional (non-standard) handler
    RE_OPT_SEQ = re.compile(r'\x1b\]_\;(.*)(\x07|\x1b\\)')
    RE_NUMBERS = re.compile('\d*') # Matches any number

    def __init__(self, rows=24, cols=80):
        self.cols = cols
        self.rows = rows
        self.scrollback_buf = []
        self.scrollback_renditions = []
        self.title = "Gate One"
        self.ignore = False
        self.local_echo = True
        self.esc_buffer = '' # For holding escape sequences as they're typed.
        self.prev_esc_buffer = '' # Special: So we can differentiate between
                                  # certain circumstances.
        self.show_cursor = True
        self.last_rendition = [0]
        self.init_screen()
        self.init_renditions()
        self.G0_charset = 'B'
        self.G1_charset = 'B'
        # Set the default window margins
        self.top_margin = 0
        self.bottom_margin = self.rows - 1

        self.specials = {
            self.ASCII_NUL: self.__ignore,
            self.ASCII_BEL: self._bell,
            self.ASCII_BS: self._backspace,
            self.ASCII_HT: self._horizontal_tab,
            self.ASCII_LF: self._linefeed,
            self.ASCII_VT: self._linefeed,
            self.ASCII_FF: self._linefeed,
            self.ASCII_CR: self._carriage_return,
            self.ASCII_XON: self._xon,
            self.ASCII_CAN: self._cancel_esc_sequence,
            self.ASCII_XOFF: self._xoff,
            #self.ASCII_ESC: self._sub_esc_sequence,
            self.ASCII_ESC: self._escape,
            self.ASCII_CSI: self._csi,
        }
        # TODO: Finish these:
        self.esc_handlers = {
            # TODO: Make a different set of these for each respective emulation mode (VT-52, VT-100, VT-200, etc etc)
            '#': self._set_line_params, # Varies
            '\\': self._string_terminator, # ST
            'c': self.clear_screen, # Reset terminal
            'D': self.__ignore, # Move/scroll window up one line    IND
            'M': self._reverse_linefeed, # Move/scroll window down one line RI
            'E': self._next_line, # Move to next line NEL
            'F': self.__ignore, # Enter Graphics Mode
            'G': self._next_line, # Exit Graphics Mode
            '6': self._dsr_get_cursor_position, # Get cursor position   DSR
            '7': self.save_cursor_position, # Save cursor position and attributes   DECSC
            '8': self.restore_cursor_position, # Restore cursor position and attributes   DECSC
            'H': self._set_tabstop, # Set a tab at the current column   HTS
            'I': self._reverse_linefeed,
            '(': self.set_G0_charset, # Designate G0 Character Set
            ')': self.set_G1_charset, # Designate G1 Character Set
            'N': self.__ignore, # Set single shift 2    SS2
            'O': self.__ignore, # Set single shift 3    SS3
            '5': self._device_status_report, # Request: Device status report DSR
            '0': self.__ignore, # Response: terminal is OK  DSR
            'P': self._dcs_handler, # Device Control String  DCS
            '=': self.__ignore, # Application Keypad  DECPAM
            '>': self.__ignore, # Exit alternate keypad mode
            '<': self.__ignore, # Exit VT-52 mode
        }
        self.csi_handlers = {
            'A': self.cursor_up,
            'B': self.cursor_down,
            'C': self.cursor_right,
            'D': self.cursor_left,
            'E': self.cursor_next_line,
            'F': self.cursor_previous_line,
            'G': self.cursor_horizontal_absolute,
            'H': self.cursor_position,
            'L': self.insert_line,
            'M': self.delete_line,
            #'b': self.repeat_last_char, # TODO
            'c': self._csi_device_status_report, # Device status report (DSR)
            'g': self.__ignore, # TODO: Tab clear
            'h': self._set_expanded_mode,
            'l': self._reset_expanded_mode,
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
            'p': self.terminal_reset, # TODO: "!p" is "Soft terminal reset".  Also, "Set conformance level" (VT100, VT200, or VT300)
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
            '1': self.application_mode,
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
            '47': self.alternate_screen_buffer, # Use Alternate Screen Buffer
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
            '1049': self.alternate_screen_buffer_cursor, # Save cursor as in DECSC and use Alternate Screen Buffer, clearing it first
            '1051': self.__ignore, # Set Sun function-key mode
            '1052': self.__ignore, # Set HP function-key mode
            '1060': self.__ignore, # Set legacy keyboard emulation (X11R6)
            '1061': self.__ignore, # Set Sun/PC keyboard emulation of VT220 keyboard
        }
        self.callbacks = {
            self.CALLBACK_SCROLL_UP: None,
            self.CALLBACK_CHANGED: None,
            self.CALLBACK_CURSOR_POS: None,
            self.CALLBACK_DSR: None,
            self.CALLBACK_TITLE: None,
            self.CALLBACK_BELL: None,
            self.CALLBACK_OPT: None,
            self.CALLBACK_MODE: None
        }
        self.leds = {
            1: False,
            2: False,
            3: False,
            4: False
        }
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

    def init_screen(self):
        """
        Fills self.screen with empty lines of (unicode) spaces using self.cols
        and self.rows for the dimensions.

        NOTE: Just because each line starts out with a uniform length does not
        mean it will stay that way.  Processing of escape sequences is handled
        when an output function is called.
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
        Fills self.renditions with lists of None using self.cols and self.rows
        for the dimenions.
        """
        self.renditions = [
            [[0] for a in xrange(self.cols)] for b in xrange(self.rows)
        ]

    def init_scrollback(self):
        """
        Empties out the scrollback buffers
        """
        self.scrollback_buf = []
        self.scrollback_renditions = []

    def terminal_reset(self, *args, **kwargs):
        """
        Resets the terminal back to an empty screen with all defaults.
        """
        self.leds = {
            1: False,
            2: False,
            3: False,
            4: False
        }
        self.title = "Gate One"
        self.ignore = False
        self.esc_buffer = ''
        self.prev_esc_buffer = ''
        self.show_cursor = True
        self.rendition_set = False
        self.G0_charset = 'B'
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

    def __ignore(self, *args, **kwargs):
        """Do nothing"""
        pass

    def resize(self, rows, cols):
        """
        Resizes the terminal window, adding or removing rows or columns as
        needed.
        """
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

        # TODO: Test these to make sure they're sane in all situations
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
        DECSTBM - Sets self.top_margin and self.bottom_margin using the provided
        settings in the form of '<top_margin>;<bottom_margin>'.

        NOTE: This also handles restore/set "DEC Private Mode Values"
        """
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
        Returns the current cursor positition as a tuple, (row, col)
        """
        return (self.cursorY, self.cursorX)

    def set_title(self, title):
        """
        Sets self.title to *title* and executes
        self.callbacks[self.CALLBACK_TITLE]()
        """
        self.title = title
        try:
            self.callbacks[self.CALLBACK_TITLE]()
        except TypeError as e:
            logging.error(_("Got TypeError on CALLBACK_TITLE..."))
            logging.error(repr(self.callbacks[self.CALLBACK_TITLE]))
            logging.error(e)

# TODO: put some logic in these save/restore functions to walk the current
# rendition line to come up with a logical rendition for that exact spot.
    def save_cursor_position(self, mode=None):
        """
        Saves the cursor position and current rendition settings to
        self.saved_cursorX, self.saved_cursorY, and self.saved_rendition

        NOTE: Also handles the set/restore "Private Mode Settings" sequence.
        """
        if mode: # Set DEC private mode
            # TODO: Need some logic here to save the current expanded mode
            #       so we can restore it in _set_top_bottom().
            self._set_expanded_mode(mode)
        # NOTE: args and kwargs are here to make sure we don't get an exception
        #       when we're called via escape sequences.
        self.saved_cursorX = self.cursorX
        self.saved_cursorY = self.cursorY
        self.saved_rendition = self.renditions[self.cursorY][self.cursorX]

    def restore_cursor_position(self, *args, **kwargs):
        """
        Restores the cursor position and rendition settings from
        self.saved_cursorX, self.saved_cursorY, and self.saved_rendition (if
        they're set).
        """
        if self.saved_cursorX and self.saved_cursorY:
            self.cursorX = self.saved_cursorX
            self.cursorY = self.saved_cursorY
            self.renditions[self.cursorY][self.cursorX] = self.saved_rendition

    def _dsr_get_cursor_position(self):
        """
        Returns the current cursor positition as a DSR response in the form of:
        '\x1b<self.cursorY>;<self.cursorX>R'.  Also executes CALLBACK_DSR with
        the same output as the first argument.  Example:

            self.callbacks[self.CALLBACK_DSR]('\x1b20;123R')
        """
        esc_cursor_pos = '\x1b%s;%sR' % (self.cursorY, self.cursorX)
        try:
            self.callbacks[self.CALLBACK_DSR](esc_cursor_pos)
        except TypeError:
            pass
        return esc_cursor_pos

    def _dcs_handler(self, string=None):
        """
        Handles Device Control String sequences.  Still haven't figured out if
        these really need to be implemented.
        """
        print("TODO: Handle this DCS: %s" % string)

    def _set_line_params(self, param):
        """
        This function handles the control sequences that set double and single
        line heights and widths.  NOTE: Not actually implemented yet!
        """
        print("TODO: Handle this line height setting: %s" % param)

    def set_G0_charset(self, char):
        """
        Sets the terminal's G0 (default) charset to the type specified by *char*

        Here's the possibilities:
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

        NOTE: Doesn't actually do anything other than set the variable.
        """
        self.G0_charset = char

    def set_G1_charset(self, char):
        """
        Sets the terminal's G1 (alt) charset to the type specified by *char*

        Here's the possibilities:
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

        NOTE: Doesn't actually do anything other than set the variable.
        """
        self.G1_charset = char

    def write(self, chars):
        """
        Write *chars* to the terminal at the current cursor position advancing
        the cursor as it does so.  If *chars* is not unicode, it will be
        converted to unicode before being stored in self.screen.
        """
        # TODO: See how much faster this could be if it were all inside of one
        # giant function instead of having it call all the little ones.  It
        # surely wouldn't be as neat but I bet all these function calls add up.
        # NOTE: This is the slowest function in all of Gate One.  All
        # suggestions on how to speed it up are welcome!

        # Speedups (don't want dots in loops if they can be avoided)
        specials = self.specials
        esc_handlers = self.esc_handlers
        csi_handlers = self.csi_handlers
        RE_ESC_SEQ = self.RE_ESC_SEQ
        RE_CSI_ESC_SEQ = self.RE_CSI_ESC_SEQ
        cursor_right = self.cursor_right
        changed = False
        # Commented this out because even if logging isn't set to debug, these
        # logging.whatever() lines do still eat some CPU
        #logging.debug('handling chars: %s' % `chars`)
        for char in chars:
            charnum = ord(char)
            if charnum in specials:
                specials[charnum]()
            elif not self.ignore:
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
                            self.prev_esc_buffer = self.esc_buffer
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
                                logging.error(_(
                                    "CSI Handler Error: Type: %s, Values: %s" %
                                    (csi_type, csi_values)
                                ))
                            self.prev_esc_buffer = self.esc_buffer
                            self.esc_buffer = ''
                            continue
                    except KeyError:
                        # No handler for this, try some alternatives
                        if self.esc_buffer.endswith('\x1b\\'):
                            self._osc_handler()
                        else:
                            logging.warning(_(
                                "Warning: No ESC sequence handler for %s"
                                % `self.esc_buffer`
                            ))
                            self.esc_buffer = ''
                    continue # We're done here
# TODO: Figure out a way to write characters past the edge of the screen so that users can copy & paste without having newlines in the middle of everything.
                if self.local_echo:
                    changed = True
                    if self.cursorX >= self.cols:
                        # Start a newline but NOTE: Not really the best way to
                        # handle this because it means copying and pasting lines
                        # will end up broken into pieces of size=self.cols
                        self._newline()
                        self.cursorX = 0
                        # This actually works but until I figure out a way to
                        # get the browser to properly wrap the line without
                        # freaking out whenever someone clicks on the page it
                        # will have to stay commented.  NOTE: This might be a
                        # browser bug.
                        #self.screen[self.cursorY].append(unicode(char))
                        #self.renditions[self.cursorY].append([])
                        # To try it just uncomment the above two lines and
                        # comment out the self._newline() and self.cusorX lines
                    if self.G0_charset == '0':
                        self.screen[self.cursorY][self.cursorX] = self.charsets[
                            '0'][charnum]
                    else:
                        self.renditions[self.cursorY][
                            self.cursorX] = self.last_rendition
                        self.screen[self.cursorY][self.cursorX] = unicode(char)
                    self.prev_esc_buffer = ''
                    cursor_right()
        if changed:
            # Execute our callbacks
            try:
                self.callbacks[self.CALLBACK_CHANGED]()
            except TypeError:
                pass
            try:
                self.callbacks[self.CALLBACK_CURSOR_POS]()
            except TypeError:
                pass

# TODO: This is a work in progress...  Testing how much things get sped up by
# replacing all the function calls with inline code.  It is real ugly and hard
# to follow but it might just be significantly faster.
    #def write(self, chars):
        #"""
        #Write *chars* to the terminal at the current cursor position advancing
        #the cursor as it does so.  If *chars* is not unicode, it will be
        #converted to unicode before being stored in self.screen.
        #"""
        ## NOTE: This is the rewrite of write()...  A work in progress.  Notes
        ## are sprinked throughout the function indicating what needs to be done.

        ## Speedups (don't want dots in loops if they can be avoided)
        #start = time.time()
        #specials = self.specials
        #esc_handlers = self.esc_handlers
        #csi_handlers = self.csi_handlers
        #RE_ESC_SEQ = self.RE_ESC_SEQ
        #RE_CSI_ESC_SEQ = self.RE_CSI_ESC_SEQ
        #cursor_right = self.cursor_right
        #changed = False
        #ASCII_NUL = 0     # Null
        #ASCII_BEL = 7     # Bell (BEL)
        #ASCII_BS = 8      # Backspace
        #ASCII_HT = 9      # Horizontal Tab
        #ASCII_LF = 10     # Line Feed
        #ASCII_VT = 11     # Vertical Tab
        #ASCII_FF = 12     # Form Feed
        #ASCII_CR = 13     # Carriage Return
        #ASCII_XON = 17    # Resume Transmission
        #ASCII_XOFF = 19   # Stop Transmission or Ignore Characters
        #ASCII_CAN = 24    # Cancel Escape Sequence
        #ASCII_SUB = 26    # Substitute: Cancel Escape Sequence and replace with ?
        #ASCII_ESC = 27    # Escape
        #ASCII_CSI = 155   # Control Sequence Introducer (that nothing uses)
        #ASCII_HTS = 210   # Horizontal Tab Stop (HTS)
        #specials = [
            #ASCII_NUL,
            #ASCII_BEL,
            #ASCII_BS,
            #ASCII_HT,
            #ASCII_LF,
            #ASCII_VT,
            #ASCII_FF,
            #ASCII_CR,
            #ASCII_XON,
            #ASCII_CAN,
            #ASCII_XOFF,
            #ASCII_ESC,
            #ASCII_CSI
        #]
        ## Commented this out because even if logging isn't set to debug, these
        ## logging.whatever() lines do still eat some CPU
        ##logging.debug('handling chars: %s' % `chars`)

        ## Looping over the characters individually is actually pretty quick as
        ## is demonstrated by the __spanify_screen() function.
        #for char in chars:
            #charnum = ord(char)
            #if charnum in specials:
                #if charnum == ASCII_NUL:
                    #pass # Ignore the null character
                #elif charnum == ASCII_BEL:
                    #if not self.esc_buffer:
                        #try: # We're not in the middle of an esc sequence
                            #self.callbacks[self.CALLBACK_BELL]()
                        #except TypeError:
                            #pass
                    #else: # We're (likely) setting a title
                        ## Add the bell char so we don't lose it
                        #self.esc_buffer += '\x07'
                        #self._osc_handler()
                #elif charnum == ASCII_BS:
                    #self.renditions[self.cursorY][self.cursorX] = None
                    #self.cursor_left(1)
                #elif charnum == ASCII_HT:
                    #next_tabstop = self.cols -1
                    #for tabstop in self.tabstops:
                        #if tabstop > self.cursorX:
                            #next_tabstop = tabstop
                            #break
                    #self.cursorX = next_tabstop
                #elif charnum in [ASCII_LF, ASCII_VT, ASCII_FF]:
                    #self.cursorY += 1
                    #if self.cursorY > self.bottom_margin:
                        #self.scroll_up()
                        #self.cursorY = self.bottom_margin
                        #self.clear_line()
                #elif charnum == ASCII_CR:
                    #self.cursorX = 0
                #elif charnum == ASCII_XON:
                    #self.ignore = False
                #elif charnum == ASCII_XOFF:
                    #self.ignore = True
                #elif charnum == ASCII_CAN:
                    #self.esc_buffer = ''
                #elif charnum == ASCII_ESC:
                    #buf = self.esc_buffer
                    #if buf.startswith('\x1bP') or buf.startswith('\x1b]'):
                        ## CSRs and OSCs are special
                        #self.esc_buffer += '\x1b'
                    #else:
                        ## Get rid of whatever's there since we obviously didn't
                        ## know what to do with it
                        #self.esc_buffer = '\x1b'
                #elif charnum == ASCII_CSI:
                    #self.esc_buffer = '\x1b['
            #elif not self.ignore:
                ## Now handle the regular characters and escape sequences
                #if self.esc_buffer: # We've got an escape sequence going on...
                    #try:
                        #self.esc_buffer += char
                        ## First try to handle non-CSI ESC sequences (the basics)
                        #match_obj = RE_ESC_SEQ.match(self.esc_buffer)
                        #if match_obj:
                            #seq_type = match_obj.group(1) # '\x1bA' -> 'A'
                            #if len(seq_type) == 1: # Single-character sequnces
                                #seq_type = seq_type[1]
                            #else: # Multi-character stuff like '\x1b)B'
                                #seq_type = seq_type[1]
                                #arg = seq_type[1:]
                            #if seq_type == 'c':
                                #self.clear_screen()
                            #elif seq_type == 'E':
                                #if self.cursorY < self.rows -1:
                                    #self.cursorY += 1
                            #elif seq_type == 'H':
                                #if self.cursorX not in self.tabstops:
                                    #for tabstop in self.tabstops:
                                        #if self.cursorX > tabstop:
                                            #self.tabstops.append(self.cursorX)
                                            #self.tabstops.sort()
                                            #break
                            #elif seq_type in 'IM':
                                #self.cursorX = 0
                                #self.cursorY -= 1
                                #if self.cursorY < self.top_margin:
                                    #self.scroll_down()
                                    #self.cursorY = self.top_margin
                            #elif seq_type == '(':
                                #self.G0_charset = arg
                            #elif seq_type == ')':
                                #self.G1_charset = arg
                            #elif seq_type == '7':
                                #if arg: # Set DEC private mode
                ## TODO: Need some logic here to save the current expanded mode
                ##       so we can restore it in _set_top_bottom().
                                    #self._set_expanded_mode(mode)
        ## NOTE: args and kwargs are here to make sure we don't get an exception
        ##       when we're called via escape sequences.
                                #self.saved_cursorX = self.cursorX
                                #self.saved_cursorY = self.cursorY
                                #self.saved_rendition = self.renditions[
                                        #self.cursorY][self.cursorX]
                            #elif seq_type == '8':
                                #if self.saved_cursorX and self.saved_cursorY:
                                    #self.cursorX = self.saved_cursorX
                                    #self.cursorY = self.saved_cursorY
                                    #self.renditions[
                                        #self.cursorY][
                                            #self.cursorX] = self.saved_rendition
                            #elif seq_type == '6':
                                #esc_cursor_pos = '\x1b%s;%sR' % (
                                    #self.cursorY, self.cursorX)
                                #try:
                                    #self.callbacks[self.CALLBACK_DSR](
                                        #esc_cursor_pos)
                                #except TypeError:
                                    #pass
                            #elif seq_type == '5':
                                #response = "\x1b[0n"
                                #try:
                                    #self.callbacks[self.CALLBACK_DSR](response)
                                #except TypeError:
                                    #pass
                            #self.prev_esc_buffer = self.esc_buffer
                            #self.esc_buffer = '' # All done with this one
                            #continue
                        ## Next try to handle CSI ESC sequences
                        #match_obj = RE_CSI_ESC_SEQ.match(self.esc_buffer)
                        #if match_obj:
                            #csi_values = match_obj.group(1) # e.g. '0;1;37'
                            #csi_type = match_obj.group(2) # e.g. 'm'
                            ##logging.debug(
                                ##'CSI: %s, %s' % (csi_type, csi_values))
                            ## Call the matching CSI handler
                            #try:
                                #csi_handlers[csi_type](csi_values)
                            #except ValueError:
                                #logging.error(
                                    #"CSI Handler Error: Type: %s, Values: %s" %
                                    #(csi_type, csi_values)
                                #)
                            #self.prev_esc_buffer = self.esc_buffer
                            #self.esc_buffer = ''
                            #continue
                    #except KeyError:
                        ## No handler for this, try some alternatives
                        #if self.esc_buffer.endswith('\x1b\\'):
                            #self._osc_handler()
                        #else:
                            #logging.warning(
                                #"Warning: No ESC sequence handler for %s"
                                #% `self.esc_buffer`
                            #)
                            #self.esc_buffer = ''
                    #continue # We're done here
## TODO: Figure out a way to write characters past the edge of the screen so that users can copy & paste without having newlines in the middle of everything.
                #if self.local_echo:
                    #changed = True
                    #if self.cursorX >= self.cols:
                        ## Start a newline but NOTE: Not really the best way to
                        ## handle this because it means copying and pasting lines
                        ## will end up broken into pieces of size=self.cols
                        #self._newline()
                        #self.cursorX = 0
                        ## This actually works but until I figure out a way to
                        ## get the browser to properly wrap the line without
                        ## freaking out whenever someone clicks on the page it
                        ## will have to stay commented.  NOTE: This might be a
                        ## browser bug.
                        ##self.screen[self.cursorY].append(unicode(char))
                        ##self.renditions[self.cursorY].append([])
                        ## To try it just uncomment the above two lines and
                        ## comment out the self._newline() and self.cusorX lines
                    #if self.G0_charset == '0':
                        #self.screen[self.cursorY][self.cursorX] = self.charsets[
                            #'0'][charnum]
                    #else:
                        #self.renditions[self.cursorY][
                            #self.cursorX] = self.last_rendition
                        #self.screen[self.cursorY][self.cursorX] = unicode(char)
                    #self.prev_esc_buffer = ''
                    #cursor_right()
        #if changed:
            ## Execute our callbacks
            #try:
                #self.callbacks[self.CALLBACK_CHANGED]()
            #except TypeError:
                #pass
            #try:
                #self.callbacks[self.CALLBACK_CURSOR_POS]()
            #except TypeError:
                #pass
        #end = time.time()
        #elapsed = end - start
        #print('It took %0.2fms to write()' % (elapsed*1000.0))

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

        NOTE: This will only scroll up the region within self.top_margin and
        self.bottom_margin (if set).
        """
        for x in xrange(int(n)):
            line = self.screen.pop(self.top_margin) # Remove the top line
            self.scrollback_buf.append(line) # Add it to the scrollback buffer
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
            self.callbacks[self.CALLBACK_CHANGED]()
        except TypeError:
            pass
        # Execute our callback to scroll up the screen
        try:
            self.callbacks[self.CALLBACK_SCROLL_UP]()
        except TypeError:
            pass

    def scroll_down(self, n=1):
        """
        Scrolls down the terminal screen by *n* lines (default: 1). The
        callbacks CALLBACK_CHANGED and CALLBACK_SCROLL_DOWN are called after
        scrolling the screen.
        """
        for x in xrange(int(n)):
            line = self.screen.pop(self.bottom_margin) # Remove the bottom line
            empty_line = [u' ' for a in xrange(self.cols)] # Line full of spaces
            self.screen.insert(self.top_margin, empty_line) # Add it to the top
            # Remove bottom line's style information:
            style = self.renditions.pop(self.bottom_margin)
            # Insert a new empty one:
            self.renditions.insert(
                self.top_margin, [[0] for a in xrange(self.cols)])
        # Execute our callback indicating lines have been updated
        try:
            self.callbacks[self.CALLBACK_CHANGED]()
        except TypeError:
            pass

        # Execute our callback to scroll up the screen
        try:
            self.callbacks[self.CALLBACK_SCROLL_UP]()
        except TypeError:
            pass

    def insert_line(self, n):
        """
        Inserts *n* lines at the current cursor position.
        """
        line = self.screen.pop(self.bottom_margin) # Remove the bottom line
        # Remove bottom line's style information as well:
        style = self.renditions.pop(self.bottom_margin)
        empty_line = [u' ' for a in xrange(self.cols)] # Line full of spaces
        self.screen.insert(self.cursorY, empty_line) # Insert at cursor
        # Insert a new empty rendition as well:
        self.renditions.insert(self.cursorY, [[0] for a in xrange(self.cols)])

    def delete_line(self, n):
        """
        Deletes *n* lines at the current cursor position.
        """
        line = self.screen.pop(self.cursorY) # Remove the line at the cursor
        # Remove the line's style information as well:
        style = self.renditions.pop(self.cursorY)
        # Now add an empty line and empty set of renditions to the bottom of the
        # view
        empty_line = [u' ' for a in xrange(self.cols)] # Line full of spaces
        # Add it to the bottom of the view:
        self.screen.insert(self.bottom_margin, empty_line) # Insert at bottom
        # Insert a new empty rendition as well:
        self.renditions.insert(
            self.bottom_margin, [[0] for a in xrange(self.cols)])

    def _backspace(self):
        """Execute a backspace (\x08)"""
        self.renditions[self.cursorY][self.cursorX] = None
        self.cursor_left(1)

    def _horizontal_tab(self):
        """Execute horizontal tab (\x09)"""
        next_tabstop = self.cols -1
        for tabstop in self.tabstops:
            if tabstop > self.cursorX:
                next_tabstop = tabstop
                break
        self.cursorX = next_tabstop

    def _set_tabstop(self):
        """Sets a tabstop at the current position of self.cursorX."""
        if self.cursorX not in self.tabstops:
            for tabstop in self.tabstops:
                if self.cursorX > tabstop:
                    self.tabstops.append(self.cursorX)
                    self.tabstops.sort() # Put them in order :)
                    break

    def _linefeed(self):
        """Execute line feed"""
        self._newline()

    def _next_line(self):
        """Moves cursor down one line"""
        if self.cursorY < self.rows -1:
            self.cursorY += 1

    def _reverse_linefeed(self):
        self.cursorX = 0
        self.cursorY -= 1
        if self.cursorY < self.top_margin:
            self.scroll_down()
            self.cursorY = self.top_margin

    def _newline(self):
        """
        Adds a new line to self.screen and sets self.cursorX to 0.
        """
        self.cursorY += 1
        if self.cursorY > self.bottom_margin:
            self.scroll_up()
            self.cursorY = self.bottom_margin
            self.clear_line()

    def _carriage_return(self):
        """
        Execute carriage return (set self.cursorX to 0)
        """
        self.cursorX = 0

    def _xon(self):
        """
        Handle XON character (stop ignoring)
        """
        self.ignore = False

    def _xoff(self):
        """
        Handle XOFF character (start ignoring)
        """
        self.ignore = True

    def _cancel_esc_sequence(self):
        """Cancels any escape sequence currently in progress."""
        self.esc_buffer = ''

    def _sub_esc_sequence(self):
        """
        Cancels any escape sequence currently in progress and substitutes it
        with single question mark (?).
        """
        self.esc_buffer = ''
        self.write('?')

    def _escape(self):
        """
        Handle escape character as well as escape sequences.
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
        Starts a CSI sequence.
        """
        self.esc_buffer = '\x1b['

    def _string_terminator(self):
        """
        Handle the string terminator.
        """
        # TODO: This.
        # NOTE: Might this just call _cancel_esc_sequence?  I need to double-check.
        pass

    def _osc_handler(self):
        """
        Handles Operating System Command (OSC) escape sequences which need
        special care since they are of indeterminiate length and end with either
        a bell (\x07) or a sequence terminator (\x9c aka ST).  This will usually
        called from self._bell() to set the title of the terminal (just like an
        xterm) but it is also possible to be called directly whenever an ST is
        encountered.
        """
        # Try the title sequence first
        match_obj = self.RE_TITLE_SEQ.match(self.esc_buffer)
        if match_obj:
            title = match_obj.group(1)
            self.set_title(title) # Sets self.title
            self.esc_buffer = ''
            return
        # Next try our special optional handler sequence
        match_obj = self.RE_OPT_SEQ.match(self.esc_buffer)
        if match_obj:
            text = match_obj.group(1)
            self.__opt_handler(text)
            self.esc_buffer = ''
            return
        # At this point we've encountered something unusual
        logging.warning(_("Warning: No ESC sequence handler for %s" %
            `self.esc_buffer`))
        self.esc_buffer = ''

    def _bell(self):
        """
        Handle bell character and execute self.CALLBACKS[CALLBACK_BELL]() if we
        are not in the middle of an escape sequence.  If we *are* in the middle
        of an escape sequence, call self._osc_handler() since we can be nearly
        certain that we're simply terminating an OSC sequence.
        """
        # NOTE: A little explanation is in order: The bell character (\x07) by
        #       itself should play a bell (pretty straighforward).  However, if
        #       the bell character is at the tail end of a particular escape
        #       sequence (string starting with \x1b]0;) this indicates an xterm
        #       title (everything between \x1b]0;...\x07).
        if not self.esc_buffer: # We're not in the middle of an esc sequence
            try:
                self.callbacks[self.CALLBACK_BELL]()
            except TypeError:
                pass
        else: # We're (likely) setting a title
            self.esc_buffer += '\x07' # Add the bell char so we don't lose it
            self._osc_handler()

    def _device_status_report(self):
        """
        Returns '\x1b[0n' (terminal OK) and executes
        self.callbacks[self.CALLBACK_DSR]("\x1b[0n").
        """
        response = "\x1b[0n"
        try:
            self.callbacks[self.CALLBACK_DSR](response)
        except TypeError:
            pass
        return response

    def _csi_device_status_report(self, request):
        """
        Returns '\x1b[1;2c' (Meaning: I'm a vt220 terminal, version 1.0) and
        executes self.callbacks[self.CALLBACK_DSR]("\x1b[1;2c").
        """
        response = "\x1b[1;2c"
        try:
            self.callbacks[self.CALLBACK_DSR](response)
        except TypeError:
            pass
        return response

    def _set_expanded_mode(self, setting):
        """
        Accepts "standard mode" settings.  Typically '\x1b[?25h' to hide cursor.

        Notes on modes::
            '?1h' - Application Cursor Keys
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
            self.callbacks[self.CALLBACK_MODE](setting, True)
        except TypeError:
            pass

    def _reset_expanded_mode(self, setting):
        """
        Accepts "standard mode" settings.  Typically '\x1b[?25l' to show cursor.
        """
        setting = setting[1:] # Don't need the ?
        settings = setting.split(';')
        for setting in settings:
            try:
                self.expanded_modes[setting](False)
            except (KeyError, TypeError):
                pass # Unsupported expanded mode
        try:
            self.callbacks[self.CALLBACK_MODE](setting, False)
        except TypeError:
            pass

    def application_mode(self, boolean):
        """self.application_keys = *boolean*"""
        self.application_keys = boolean

    def alternate_screen_buffer(self, alt):
        """
        If *alt* is True, copy the current screen and renditions to
        self.alt_screen and self.alt_renditions then re-init self.screen and
        self.renditions.
        If *alt* is False, restore the saved screen buffer and renditions then
        nullify self.alt_screen and self.alt_renditions.
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

    def alternate_screen_buffer_cursor(self, alt):
        """
        Same as self.alternate_screen_buffer but saves/restores the cursor
        location.
        """
        if alt:
            self.alt_cursorX = self.cursorX
            self.alt_cursorY = self.cursorY
        else:
            self.cursorX = self.alt_cursorX
            self.cursorY = self.alt_cursorY
        self.alternate_screen_buffer(alt)

    def show_hide_cursor(self, boolean):
        """self.show_cursor = boolean"""
        self.show_cursor = boolean

    def send_receive_mode(self, onoff):
        """
        Turns on or off local echo dependong on the value of *onoff*

        self.local_echo = *onoff*
        """
        if onoff:
            self.local_echo = False
        else:
            self.local_echo = True

    def insert_characters(self, n=1):
        """Inserts the specified number of characters at the cursor position"""
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

        NOTE: Deletes renditions too.
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
        position.  NOTE: Deletes renditions too.
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
            self.callbacks[self.CALLBACK_CURSOR_POS]()
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
            self.callbacks[self.CALLBACK_CURSOR_POS]()
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
            self.callbacks[self.CALLBACK_CURSOR_POS]()
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
            self.callbacks[self.CALLBACK_CURSOR_POS]()
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
            self.callbacks[self.CALLBACK_CURSOR_POS]()
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
            self.callbacks[self.CALLBACK_CURSOR_POS]()
        except TypeError:
            pass

    def cursor_horizontal_absolute(self, n):
        """ESCnG CHA (Cursor Horizontal Absolute)"""
        if not n:
            n = 1
        n = int(n)
        self.cursorX = n - 1 # -1 because cols is 0-based
        try:
            self.callbacks[self.CALLBACK_CURSOR_POS]()
        except TypeError:
            pass

    def cursor_position(self, coordinates):
        """
        ESCnH CUP (Cursor Position).  Move the cursor to the given coordinates.

        *coordinates*: Should be something like, 'row;col' (1-based) but,
        'row', 'row;', and ';col' are also valid (assumes 1 on missing value).

        If coordinates is '', the cursor will be moved to the top left (1;1).
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
            self.callbacks[self.CALLBACK_CURSOR_POS]()
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
        """
        self.init_screen()
        self.init_renditions()
        self.cursorX = 0
        self.cursorY = 0

    def clear_screen_from_cursor_down(self):
        """
        Clears the screen from the cursor down (Esc[J or Esc[0J).
        """
        self.screen[self.cursorY:] = [
           [u' ' for a in xrange(self.cols)] for a in self.screen[self.cursorY:]
        ]
        self.renditions[self.cursorY:] = [
           [[0] for a in xrange(self.cols)] for a in self.screen[self.cursorY:]
        ]
        self.cursorX = 0

    def clear_screen_from_cursor_up(self):
        """
        Clears the screen from the cursor up (Esc[1J).
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
        CSI*n*J ED (Erase Data).  This escape sequence uses the following rules::

            Esc[J   Clear screen from cursor down   ED0
            Esc[0J  Clear screen from cursor down   ED0
            Esc[1J  Clear screen from cursor up     ED1
            Esc[2J  Clear entire screen             ED2
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
            self.callbacks[self.CALLBACK_CHANGED]()
        except TypeError:
            pass
        try:
            self.callbacks[self.CALLBACK_CURSOR_POS]()
        except TypeError:
            pass

    def clear_line_from_cursor_right(self):
        """
        Clears the screen from the cursor right (Esc[K or Esc[0K).
        """
        self.screen[self.cursorY][self.cursorX:] = [
            u' ' for a in self.screen[self.cursorY][self.cursorX:]]
        # NOTE: We have to check if a rendition was just set for this cursor
        #       position since \x1b[K is only supposed to clear renditions that
        #       were set prior to the cursor being placed at its current
        #       position (which is odd--and I can't find any documentation that
        #       says that's how it is supposed to work but it seems to be the
        #       case in real-world testing).
        if self.prev_esc_buffer.endswith('m'): # Was a rendition, preserve it
            self.renditions[self.cursorY][self.cursorX+1:] = [
                None for a in self.screen[self.cursorY][self.cursorX:]]
        else: # Reset the cursor position's rendition to the end of the line
            self.renditions[self.cursorY][self.cursorX:] = [
                None for a in self.screen[self.cursorY][self.cursorX:]]

    def clear_line_from_cursor_left(self):
        """
        Clears the screen from the cursor left (Esc[1K).
        """
        saved = self.screen[self.cursorY][self.cursorX:]
        saved_renditions = self.renditions[self.cursorY][self.cursorX:]
        self.screen[self.cursorY] = [
            u' ' for a in self.screen[self.cursorY][:self.cursorX]
        ] + saved
        self.renditions[self.cursorY] = [
            None for a in self.screen[self.cursorY][:self.cursorX]
        ] + saved_renditions

    def clear_line(self):
        """
        Clears the entire line (Esc[2K).
        """
        self.screen[self.cursorY] = [u' ' for a in xrange(self.cols)]
        self.renditions[self.cursorY] = [[0] for a in xrange(self.cols)]
        self.cursorX = 0

    def clear_line_from_cursor(self, n):
        """
        CSI*n*K EL (Erase in Line).  This escape sequence uses the following
        rules::

            Esc[K   Clear screen from cursor right  EL0
            Esc[0K  Clear screen from cursor right  EL0
            Esc[1K  Clear screen from cursor left   EL1
            Esc[2K  Clear entire line               ED2
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
            self.callbacks[self.CALLBACK_CHANGED]()
        except TypeError:
            pass
        try:
            self.callbacks[self.CALLBACK_CURSOR_POS]()
        except TypeError:
            pass

    def set_led_state(self, n):
        """
        Sets the values the dict, self.leds depending on *n* using the following
        rules:

            Esc[0q  Turn off all four leds  DECLL0
            Esc[1q  Turn on LED #1          DECLL1
            Esc[2q  Turn on LED #2          DECLL2
            Esc[3q  Turn on LED #3          DECLL3
            Esc[4q  Turn on LED #4          DECLL4
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

    def __reduce_renditions(self, renditions):
        """
        Takes a list, *renditions*, and reduces it to its logical equivalent (as
        far as renditions go).  Example:

            [0, 32, 0, 34, 0, 32]

        Would become:

            [0, 32]

        Other Examples:

            [0, 1, 36, 36] -> [0, 1, 36]
            [0, 30, 42, 30, 42] -> [0, 30, 42]
            [36, 32, 44, 42] -> [32, 42]
            [36, 35] -> [35]
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
            else:
                out_renditions.append(rend)
        if foreground:
            out_renditions.append(foreground)
        if background:
            out_renditions.append(background)
        return out_renditions

    def _set_rendition(self, n):
        """
        Sets self.renditions[self.cursorY][self.cursorX] equal to n.split(';').
        *n* is expected to be a string of ECMA-48 rendition numbers separated by
        semicolons.  Example:
            '0;1;31'
        ...will result in:
            [0, 1, 31]

        Note that the numbers were converted to integers and the order was
        preserved.
        """
        # TODO: Make this whole thing faster (or prove it isn't possible).
        cursorY = self.cursorY
        cursorX = self.cursorX
        #logging.debug("Setting rendition: %s at %s, %s" % (n, cursorY, cursorX))
        if cursorX >= self.cols: # We're at the end of the row
            if len(self.renditions[cursorY]) <= cursorX:
                # Make it all longer
                #logging.debug("Making line %s longer" % self.cursorY)
                self.renditions[cursorY].append([0]) # Make it longer
                self.screen[cursorY].append('\x00') # This needs to match
        if cursorY >= self.rows:
            # This should never happen
            logging.error(_(
                "cursorY >= self.rows! This should not happen! Bug!"))
            return # Don't bother setting renditions past the bottom
        if not n: # or \x1b[m (reset)
            self.last_rendition = [0]
            self.renditions[cursorY][cursorX] = [0]
            return # No need for further processing; save some CPU
        # Convert the string (e.g. '0;1;32') to a list (e.g. [0,1,32]
        new_renditions = [int(a) for a in n.split(';') if a != '']
        found_256 = None
        foreground = False
        background = False
        for i, rend in enumerate(new_renditions):
            if rend in [38,48]:
                found_256 = i
                if rend == 38:
                    foreground = True
                elif rend == 48:
                    background = True
                break
        if found_256 != None:
            # Pop out the 38/48 and the subsequent 5
            new_renditions.pop(found_256)
            new_renditions.pop(found_256)
            # Now increase the actual color by 1000 so it doesn't conflict
            try:
                if foreground:
                    new_renditions[found_256] += 1000
                elif background:
                    new_renditions[found_256] += 10000
            except IndexError:
                # NOTE: This exception check is temporary!  I got an IndexError
                # here a few times when testing but I can't seem to reproduce it
                # now that I'm watching for it (figures!).  Hopefully I'll find
                # whatever bug is causing this and then I can get rid of this
                # silly check.
                logging.error(_("WFT?  new_renditions: %s, found_256: %s"
                    % (new_renditions, found_256)))
        out_renditions = []
        for rend in new_renditions:
            if rend == 0:
                out_renditions = [0]
            else:
                out_renditions.append(rend)
        if out_renditions == [0]:
            self.last_rendition = out_renditions
            return
        new_renditions = out_renditions
        self.last_rendition = self.__reduce_renditions(
            self.last_rendition + new_renditions)

    def __opt_handler(self, chars):
        """
        Optional special escape sequence handler for sequences matching
        RE_OPT_SEQ.  If self.CALLBACK_OPT is defined it will be called like so:
            self.CALLBACKS[self.CALLBACK_OPT](chars)

        Applications can use this escape sequence to define whatever special
        handlers they like.  It works like this: If an escape sequence is
        encountered matching RE_OPT_SEQ this method will be called with the
        inbetween *chars* (e.g. \x1b]_;<chars>\x07) as the argument.

        Applications can then do what they wish with *chars*.

        NOTE: I added this functionality so that plugin authors would have a
        mechanism to communicate with terminal applications.  See the SSH plugin
        for an example of how this can be done (there's channels of
        communication amongst ssh_connect.py, ssh.js, and ssh.py).
        """
        try:
            self.callbacks[self.CALLBACK_OPT](chars)
        except TypeError as e:
            # High likelyhood that nothing is defined.  No biggie.
            pass

    def __spanify_screen(self):
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
                changed = True
                if char in "<>": # Have to convert lt/gt to HTML entities
                    char = char.replace('<', '&lt;')
                    char = char.replace('>', '&gt;')
                if rend == prev_rendition:
                    # Shortcut...  So we can skip all the logic below
                    changed = False
                else:
                    prev_rendition = rend
                if changed and rend != None:
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
            # rstrip() is here to save some bandwidth
            results.append(outline.rstrip())
        for whatever in xrange(spancount): # Bit of cleanup to be safe
            results[-1] += "</span>"
        return results

    def __spanify_scrollback(self):
        """
        Spanifies everything inside *screen* using *renditions*.  This differs
        from __spanify_screen() in that it doesn't apply any logic to detect the
        location of the cursor (just a tiny bit faster).
        """
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
                changed = True
                if char in "<>": # Have to convert lt/gt to HTML entities
                    char = char.replace('<', '&lt;')
                    char = char.replace('>', '&gt;')
                if rend == prev_rendition:
                    # Shortcut...  So we can skip all the logic below
                    changed = False
                else:
                    prev_rendition = rend
                if changed and rend != None:
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
                outline += char
            # rstrip() is here to save some bandwidth
            results.append(outline.rstrip())
        for whatever in xrange(spancount): # Bit of cleanup to be safe
            results[-1] += "</span>"
        return results

    def dump_html(self):
        """
        Dumps the terminal screen as a list of HTML-formatted lines.

        Note: This places <span class="cursor">(current character)</span> around
        the cursor location.
        """
        # NOTE: On my laptop this function will take about 30ms to complete
        # a full-screen 'top' refresh on a 57x209 screen.
        # In other words, it is pretty fast...  Not much optimization necessary
        results = self.__spanify_screen()
        scrollback = []
        if self.scrollback_buf:
            scrollback = self.__spanify_scrollback()
        # Empty the scrollback buffer:
        self.init_scrollback()
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
        return (scrollback, screen)

    def dump_components(self):
        """
        Dumps the screen and renditions as-is, the scrollback buffer as HTML,
        and the current cursor coordinates.  Also, empties the scrollback buffer

        NOTE: Was used in some performance-related experiments but might be
        useful for other patterns in the future so I've left it here.
        """
        screen = [a.tounicode() for a in self.screen]
        scrollback = []
        if self.scrollback_buf:
            # Process the scrollback buffer into HTML
            scrollback = self.__spanify_scrollback(
                self.scrollback_buf, self.scrollback_renditions)
        # Empty the scrollback buffer:
        self.init_scrollback()
        return (scrollback, screen, self.renditions, self.cursorY, self.cursorX)

    def dump(self):
        """
        Returns self.screen as a list of strings with no formatting.
        No scrollback buffer.  No renditions.

        NOTE: Does not empty the scrollback buffer.  Primarily used to get a
        quick glance of what is being displayed (when debugging).
        """
        out = []
        for line in self.screen:
            out.append("".join(line))
        return out