#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

# Meta
__version__ = '0.9'
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
The Terminal Rendition Test Script
==================================
Outputs a number of tables representing each state that a character may have in
a VT-style terminal.

.. todo:: Attach a screenshot of what it should look like.
"""
from collections import OrderedDict

STYLE_NAMES = {
    1: '\x1b[1mESC[1m (Bold)      \x1b[0m',
    2: '\x1b[1mESC[2m (Dim)       \x1b[0m',
    3: '\x1b[1mESC[3m (Italic)    \x1b[0m',
    4: '\x1b[1mESC[4m (Underline) \x1b[0m',
    5: '\x1b[1mESC[5m (Blink)     \x1b[0m',
    6: '\x1b[1mESC[6m (Fast Blink)\x1b[0m',
    7: '\x1b[1mESC[7m (Reverse)   \x1b[0m',
    8: '\x1b[1mESC[8m (Hidden)    \x1b[0m',
    9: '\x1b[1mESC[9m (Strike)    \x1b[0m',
}
FANCY_STYLE_NAMES = {
    51: '\x1b[1mESC[51m (Frame)      \x1b[0m',
    52: '\x1b[1mESC[52m (Encircle)   \x1b[0m',
    53: '\x1b[1mESC[53m (Overline)   \x1b[0m',
    60: '\x1b[1mESC[60m (RightLine)  \x1b[0m',
    61: '\x1b[1mESC[61m (Right2xLine)\x1b[0m',
    62: '\x1b[1mESC[61m (LeftLine)   \x1b[0m',
    63: '\x1b[1mESC[63m (Left2xLine) \x1b[0m',
}
FOREGROUND_NAMES = {
    30: 'Black  ',
    31: 'Red    ',
    32: 'Green  ',
    33: 'Yellow ',
    34: 'Blue   ',
    35: 'Magenta',
    36: 'Cyan   ',
    37: 'White  '
}
BACKGROUND_NAMES = {
    40: 'Black  ',
    41: 'Red    ',
    42: 'Green  ',
    43: 'Yellow ',
    44: 'Blue   ',
    45: 'Magenta',
    46: 'Cyan   ',
    47: 'White  '
}
BRIGHT_FOREGROUND_NAMES = {
    90: 'Black  ',
    91: 'Red    ',
    92: 'Green  ',
    93: 'Yellow ',
    94: 'Blue   ',
    95: 'Magenta',
    96: 'Cyan   ',
    97: 'White  '
}
BRIGHT_BACKGROUND_NAMES = {
    100: 'Black  ',
    101: 'Red    ',
    102: 'Green  ',
    103: 'Yellow ',
    104: 'Blue   ',
    105: 'Magenta',
    106: 'Cyan   ',
    107: 'White  '
}

def foregrounds_str():
    """
    Returns all the foreground colors (as a string) in their actual color:
        'Black Red Green Yellow Blue Magenta Cyan White'
    """
    out = ""
    foregrounds = ["\x1b[%sm" % (f+30) for f in xrange(8)]
    for i, foreground in enumerate(foregrounds):
        out += "%s%s\x1b[0m " % (foreground, FOREGROUND_NAMES[i+30])
    return out.rstrip() # Remove trailing whitespace

def backgrounds_str():
    """
    Returns all the background colors (as a string) in their actual color:
        'Black Red Green Yellow Blue Magenta Cyan White'
    """
    out = ""
    backgrounds = ["\x1b[%sm" % (f+40) for f in xrange(8)]
    for i, background in enumerate(backgrounds):
        out += "%s%s\x1b[0m " % (background, BACKGROUND_NAMES[i+40])
    return out.rstrip() # Remove trailing whitespace

def color_combos_8():
    """
    Prints out a table of all the 8-color background/foreground combinations:

        * Plain (no bold, italic, etc)
        * Bold
        * Dim
        * Italic
        * Underline
        * Blink
        * Fast blink
        * Reverse (aka "Inverse Video")
        * Hidden
        * Strikethrough
    """
    out = "ALL STYLES (0-9) + 8-COLOR FOREGROUNDS (30-37) AND BACKGROUNDS (40-47)\n"
    foregrounds = ["\x1b[%sm" % (f+30) for f in xrange(8)]
    backgrounds = ["\x1b[%sm" % (f+40) for f in xrange(8)]
    styles = ["\x1b[%sm" % f for f in xrange(1, 10)]
    out += "┌───────────────────┬%s┐\n" % ("─" * 56)
    out += "│\x1b[1mESC[0m (Plain)     \x1b[0m│"
    for i, foreground in enumerate(foregrounds):
        out += "%s%s\x1b[0m" % (foreground, FOREGROUND_NAMES[i+30])
    out += "│\n"
    for i, background in enumerate(backgrounds):
        out += "│Background: %s\x1b[0m│" % (BACKGROUND_NAMES[i+40])
        for i, foreground in enumerate(foregrounds):
            out += "%s%s%s\x1b[0m" % (background, foreground, FOREGROUND_NAMES[i+30])
        out += "│\n"
    for i, style in enumerate(styles, 1):
        out += "│%s│" % STYLE_NAMES[i]
        for i, foreground in enumerate(foregrounds):
            out += "%s%s%s\x1b[0m" % (style, foreground, FOREGROUND_NAMES[i+30])
        out += "│\n"
        for i, background in enumerate(backgrounds):
            out += "│Background: %s\x1b[0m│" % (BACKGROUND_NAMES[i+40])
            for i, foreground in enumerate(foregrounds):
                out += "%s%s%s%s\x1b[0m" % (style, background, foreground, FOREGROUND_NAMES[i+30])
            out += "│\n"
    out += "└───────────────────┴%s┘\n" % ("─" * 56)
    return out

def color_combos_16():
    """
    Prints out a table of all the bright (16-color) background/foreground
    combinations:

        * Plain (no bold, italic, etc)
        * Bold
        * Dim
        * Italic
        * Underline
        * Blink
        * Fast blink
        * Reverse (aka "Inverse Video")
        * Hidden
        * Strikethrough
    """
    out = "ALL STYLES (0-9) + BRIGHT FOREGROUNDS (90-97) AND BRIGHT BACKGROUNDS (100-107)\n"
    foregrounds = ["\x1b[%sm" % (f+90) for f in xrange(8)]
    backgrounds = ["\x1b[%sm" % (f+100) for f in xrange(8)]
    styles = ["\x1b[%sm" % f for f in xrange(1, 10)]
    out += "┌───────────────────┬%s┐\n" % ("─" * 56)
    out += "│\x1b[1mESC[0m (Plain)     \x1b[0m│"
    for i, foreground in enumerate(foregrounds):
        out += "%s%s\x1b[0m" % (foreground, BRIGHT_FOREGROUND_NAMES[i+90])
    out += "│\n"
    for i, background in enumerate(backgrounds):
        out += "│Background: %s\x1b[0m│" % (BRIGHT_BACKGROUND_NAMES[i+100])
        for i, foreground in enumerate(foregrounds):
            out += "%s%s%s\x1b[0m" % (background, foreground, BRIGHT_FOREGROUND_NAMES[i+90])
        out += "│\n"
    for i, style in enumerate(styles, 1):
        out += "│%s│" % STYLE_NAMES[i]
        for i, foreground in enumerate(foregrounds):
            out += "%s%s%s\x1b[0m" % (style, foreground, BRIGHT_FOREGROUND_NAMES[i+90])
        out += "│\n"
        for i, background in enumerate(backgrounds):
            out += "│Background: %s\x1b[0m│" % (BRIGHT_BACKGROUND_NAMES[i+100])
            for i, foreground in enumerate(foregrounds):
                out += "%s%s%s%s\x1b[0m" % (style, background, foreground, BRIGHT_FOREGROUND_NAMES[i+90])
            out += "│\n"
    out += "└───────────────────┴%s┘\n" % ("─" * 56)
    return out

def fancy_styles():
    """
    Prints out a table of all the fancy styles Gate One supports:

        * Frame
        * Encircle
        * Overline
        * Right Line
        * Right Double-line
        * Left Line
        * Left Double-line
    """
    out = "ALL FANCY STYLES (51-53, 60-63) + 8-COLOR FOREGROUNDS (30-37) AND BACKGROUNDS (40-47)\n"
    foregrounds = ["\x1b[%sm" % (f+30) for f in xrange(8)]
    backgrounds = ["\x1b[%sm" % (f+40) for f in xrange(8)]
    out += "┌─────────────────────┬%s┐\n" % ("─" * 56)
    for num, name in FANCY_STYLE_NAMES.items():
        out += "│%s│" % name
        for i, foreground in enumerate(foregrounds):
            out += "\x1b[%sm%s%s\x1b[0m" % (num, foreground, FOREGROUND_NAMES[i+30])
        out += "│\n"
        for i, background in enumerate(backgrounds):
            out += "│Background: %s  \x1b[0m│" % (BACKGROUND_NAMES[i+40])
            for i, foreground in enumerate(foregrounds):
                out += "\x1b[%sm%s%s%s\x1b[0m" % (num, background, foreground, FOREGROUND_NAMES[i+30])
            out += "│\n"
    out += "└─────────────────────┴%s┘\n" % ("─" * 56)
    return out


# A HUGE thank you to Micah Elliott (http://MicahElliott.com) for posting these
# values here: https://gist.github.com/719710

colors_256 = {
    # 8-color equivalents:
     0: "000000",
     1: "800000",
     2: "008000",
     3: "808000",
     4: "000080",
     5: "800080",
     6: "008080",
     7: "c0c0c0",
    # "Bright" (16-color) equivalents:
     8: "808080",
     9: "ff0000",
    10: "00ff00",
    11: "ffff00",
    12: "0000ff",
    13: "ff00ff",
    14: "00ffff",
    15: "ffffff",
    # The rest of the 256-colors:
    16: "000000",
    17: "00005f",
    18: "000087",
    19: "0000af",
    20: "0000d7",
    21: "0000ff",
    22: "005f00",
    23: "005f5f",
    24: "005f87",
    25: "005faf",
    26: "005fd7",
    27: "005fff",
    28: "008700",
    29: "00875f",
    30: "008787",
    31: "0087af",
    32: "0087d7",
    33: "0087ff",
    34: "00af00",
    35: "00af5f",
    36: "00af87",
    37: "00afaf",
    38: "00afd7",
    39: "00afff",
    40: "00d700",
    41: "00d75f",
    42: "00d787",
    43: "00d7af",
    44: "00d7d7",
    45: "00d7ff",
    46: "00ff00",
    47: "00ff5f",
    48: "00ff87",
    49: "00ffaf",
    50: "00ffd7",
    51: "00ffff",
    52: "5f0000",
    53: "5f005f",
    54: "5f0087",
    55: "5f00af",
    56: "5f00d7",
    57: "5f00ff",
    58: "5f5f00",
    59: "5f5f5f",
    60: "5f5f87",
    61: "5f5faf",
    62: "5f5fd7",
    63: "5f5fff",
    64: "5f8700",
    65: "5f875f",
    66: "5f8787",
    67: "5f87af",
    68: "5f87d7",
    69: "5f87ff",
    70: "5faf00",
    71: "5faf5f",
    72: "5faf87",
    73: "5fafaf",
    74: "5fafd7",
    75: "5fafff",
    76: "5fd700",
    77: "5fd75f",
    78: "5fd787",
    79: "5fd7af",
    80: "5fd7d7",
    81: "5fd7ff",
    82: "5fff00",
    83: "5fff5f",
    84: "5fff87",
    85: "5fffaf",
    86: "5fffd7",
    87: "5fffff",
    88: "870000",
    89: "87005f",
    90: "870087",
    91: "8700af",
    92: "8700d7",
    93: "8700ff",
    94: "875f00",
    95: "875f5f",
    96: "875f87",
    97: "875faf",
    98: "875fd7",
    99: "875fff",
    100: "878700",
    101: "87875f",
    102: "878787",
    103: "8787af",
    104: "8787d7",
    105: "8787ff",
    106: "87af00",
    107: "87af5f",
    108: "87af87",
    109: "87afaf",
    110: "87afd7",
    111: "87afff",
    112: "87d700",
    113: "87d75f",
    114: "87d787",
    115: "87d7af",
    116: "87d7d7",
    117: "87d7ff",
    118: "87ff00",
    119: "87ff5f",
    120: "87ff87",
    121: "87ffaf",
    122: "87ffd7",
    123: "87ffff",
    124: "af0000",
    125: "af005f",
    126: "af0087",
    127: "af00af",
    128: "af00d7",
    129: "af00ff",
    130: "af5f00",
    131: "af5f5f",
    132: "af5f87",
    133: "af5faf",
    134: "af5fd7",
    135: "af5fff",
    136: "af8700",
    137: "af875f",
    138: "af8787",
    139: "af87af",
    140: "af87d7",
    141: "af87ff",
    142: "afaf00",
    143: "afaf5f",
    144: "afaf87",
    145: "afafaf",
    146: "afafd7",
    147: "afafff",
    148: "afd700",
    149: "afd75f",
    150: "afd787",
    151: "afd7af",
    152: "afd7d7",
    153: "afd7ff",
    154: "afff00",
    155: "afff5f",
    156: "afff87",
    157: "afffaf",
    158: "afffd7",
    159: "afffff",
    160: "d70000",
    161: "d7005f",
    162: "d70087",
    163: "d700af",
    164: "d700d7",
    165: "d700ff",
    166: "d75f00",
    167: "d75f5f",
    168: "d75f87",
    169: "d75faf",
    170: "d75fd7",
    171: "d75fff",
    172: "d78700",
    173: "d7875f",
    174: "d78787",
    175: "d787af",
    176: "d787d7",
    177: "d787ff",
    178: "d7af00",
    179: "d7af5f",
    180: "d7af87",
    181: "d7afaf",
    182: "d7afd7",
    183: "d7afff",
    184: "d7d700",
    185: "d7d75f",
    186: "d7d787",
    187: "d7d7af",
    188: "d7d7d7",
    189: "d7d7ff",
    190: "d7ff00",
    191: "d7ff5f",
    192: "d7ff87",
    193: "d7ffaf",
    194: "d7ffd7",
    195: "d7ffff",
    196: "ff0000",
    197: "ff005f",
    198: "ff0087",
    199: "ff00af",
    200: "ff00d7",
    201: "ff00ff",
    202: "ff5f00",
    203: "ff5f5f",
    204: "ff5f87",
    205: "ff5faf",
    206: "ff5fd7",
    207: "ff5fff",
    208: "ff8700",
    209: "ff875f",
    210: "ff8787",
    211: "ff87af",
    212: "ff87d7",
    213: "ff87ff",
    214: "ffaf00",
    215: "ffaf5f",
    216: "ffaf87",
    217: "ffafaf",
    218: "ffafd7",
    219: "ffafff",
    220: "ffd700",
    221: "ffd75f",
    222: "ffd787",
    223: "ffd7af",
    224: "ffd7d7",
    225: "ffd7ff",
    226: "ffff00",
    227: "ffff5f",
    228: "ffff87",
    229: "ffffaf",
    230: "ffffd7",
    231: "ffffff",
    # Grayscale:
    232: "080808",
    233: "121212",
    234: "1c1c1c",
    235: "262626",
    236: "303030",
    237: "3a3a3a",
    238: "444444",
    239: "4e4e4e",
    240: "585858",
    241: "626262",
    242: "6c6c6c",
    243: "767676",
    244: "808080",
    245: "8a8a8a",
    246: "949494",
    247: "9e9e9e",
    248: "a8a8a8",
    249: "b2b2b2",
    250: "bcbcbc",
    251: "c6c6c6",
    252: "d0d0d0",
    253: "dadada",
    254: "e4e4e4",
    255: "eeeeee"
}

def color_combos_256():
    """
    Prints out a table of all the 256-color background/foreground combinations:

        * Plain (no bold, italic, etc)
        * Bold
        * Dim
        * Italic
        * Underline
        * Blink
        * Fast blink
        * Reverse (aka "Inverse Video")
        * Hidden
        * Strikethrough
    """
    out = "ALL STYLES (0-9) + XTERM'S 256 COLORS (LOTS TO SHOW SO SLIGHTLY MESSY)\n"
    colors = [c for c in colors_256.keys()]
    bg_colors_seq = ["\x1b[48;5;%sm" % c for c in colors_256.keys()]
    fg_colors_seq = ["\x1b[38;5;%sm" % c for c in colors_256.keys()]
    colors.sort() # Put them in order
    styles = ["\x1b[%sm" % f for f in xrange(1, 10)]
    for i, style in enumerate(styles, 1):
        out += "│%s│" % STYLE_NAMES[i]
        for n, color in enumerate(colors):
            out += "%s%s%s\x1b[0m" % (style, bg_colors_seq[color], colors_256[n])
        out += "\n"
    for i, style in enumerate(styles, 1):
        out += "│%s│" % STYLE_NAMES[i]
        for n, color in enumerate(colors):
            out += "%s%s%s\x1b[0m" % (style, fg_colors_seq[color], colors_256[n])
        out += "\n"
    out += "\n"
    return out

if __name__ == "__main__":
    from time import sleep
    print("WARNING!  THIS CAN TAX EVEN A POWERFUL MACHINE!")
    print("EVEN THE BEST OF BROWSERS CRAWL WITH THIS MANY LITTLE DETAILS!")
    print("IF YOUR SYSTEM BECOMES UNRESPONSIVE TRY CLOSING THIS TERMINAL")
    print("...starting test in 5 seconds...")
    sleep(5)
    for line in color_combos_8().split('\n'):
        print(line)
        sleep(0.15)
    for line in color_combos_16().split('\n'):
        print(line)
        sleep(0.15)
    for line in fancy_styles().split('\n'):
        print(line)
        sleep(0.15)
    print(color_combos_256())