# -*- coding: utf-8 -*-
#
#       Copyright 2014 Liftoff Software Corporation
#

# TODO: Complete this docstring...
__doc__ = """\
html.py - A plugin for Gate One that adds a special escape sequence that allows
for the raw output of HTML in the terminal (so the browser can use it to format
text).

Here's an example::

    echo -e "\\x90;HTML|<span style="font-family:serif">\\x90HTML Fomatted Output\\x90;HTML|</span>\\x90"

The begin and end markers to output raw HTML into a terminal are:

    Begin HTML: `\\x90;HTML|`
    End HTML: `\\x90`

Whatever gets placed between those two values will be output directly to the
user's browser.

.. note:: The HTML will be stored as a single character in the terminal screen.  So no matter how long the HTML is it will only take up a single character block at the current cursor location.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'Events': {
            'terminal:add_terminal_callbacks': add_html_handler
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

import os, re, logging
import terminal
from gateone.core.locale import get_translation

_ = get_translation()

class HTMLOutput(terminal.FileType):
    """
    A subclass of :class:`FileType` that allows HTML output to pass through to
    the browser.  It can be used like so:

    .. ansi-block::

        \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m echo -e "\x90;HTML|<span style='font-family: serif; font-weight: bold;'>\x90This will be wrapped in a span\x90;HTML|</span>\x90"

    .. note:: This :class:`FileType` does its best to prevent XSS attacks.  If you find any way to execute scripts via this mechanism please let us know!  https://github.com/liftoff/GateOne/issues/
    """
    name = _("Raw HTML")
    mimetype = "text/html"
    suffix = ".html"
    re_html_tag = re.compile( # This matches HTML tags (if used correctly)
     b"(?i)<\/?\w+((\s+\w+(\s*=\s*(?:\".*?\"|'.*?'|[^'\">\s]+))?)+\s*|\s*)\/?>")
    re_header = re.compile(b'.*\x90;HTML\|', re.DOTALL)
    re_capture = re.compile(b'(\x90;HTML\|.+?\x90)', re.DOTALL)
    # Why have a tag whitelist?  So programs like 'wall' don't enable XSS
    # exploits.
    tag_whitelist = set([
        'a', 'abbr', 'aside', 'audio', 'bdi', 'bdo', 'blockquote', 'canvas',
        'caption', 'code', 'col', 'colgroup', 'data', 'dd', 'del',
        'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1',
        'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
        'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
        'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup',
        'time', 'track', 'u', 'ul', 'var', 'video', 'wbr'
    ])
    # This will match things like 'onmouseover=' ('on<whatever>=')
    on_events_re = re.compile(b'.*\s+(on[a-z]+\s*=).*')

    def __init__(self, path="", **kwargs):
        """
        **path:** (optional) The path to a file or directory where the file
        should be stored.  If *path* is a directory a random filename will be
        chosen.
        """
        self.path = path
        self.file_obj = None

    # Test with: echo -e "\x90;HTML|<span style='font-family: serif; font-weight: bold;'>\x90This will be wrapped in a span\x90;HTML|</span>\x90"
    def capture(self, data, term):
        """
        Captures the raw HTML and stores it in a temporary location returning
        that file object.
        """
        logging.debug('HTMLOutput.capture() len(data) %s' % len(data))
        import tempfile
        # A bit of output cleanup
        html = str(data).replace('\r\n', '\n')
        # Get rid of the '\x90;HTML|' and '\x90' parts
        html = html[7:-1]
        for tag in self.re_html_tag.finditer(html):
            tag_lower = tag.group().lower()
            short_tag = tag_lower.split()[0].lstrip('</').rstrip('>')
            if short_tag not in self.tag_whitelist:
                error_msg = _(
                    "HTML Plugin: Sorry but the '%s' tag is not allowed."
                    % short_tag)
                term.send_message(error_msg)
                html = u"\u2421" # Replace with the ␡ char
                break
            # Also make sure the tag can't execute any JavaScript
            if "javascript:" in tag_lower:
                error_msg = _(
                   "HTML Plugin: Sorry but using 'javascript:' is not allowed.")
                term.send_message(error_msg)
                html = u"\u2421"
                break
            # on<whatever> events are not allowed (just another XSS vuln)
            if self.on_events_re.search(tag_lower):
                error_msg = _(
                    "HTML Plugin: Sorry but using JavaScript events is not "
                    "allowed.")
                term.send_message(error_msg)
                html = u"\u2421"
                break
            # Flash sucks
            if "fscommand" in tag_lower:
                error_msg = _(
                    "HTML Plugin: Sorry but using 'FSCommand' is not allowed.")
                term.send_message(error_msg)
                html = u"\u2421"
                break
            # I'd be impressed if an attacker tried this one (super obscure)
            if "seeksegmenttime" in tag_lower:
                error_msg = _(
                    "HTML Plugin: Sorry but using 'seekSegmentTime' is not "
                    "allowed.")
                term.send_message(error_msg)
                html = u"\u2421"
                break
            # Yes we'll protect IE users from themselves...
            if "vbscript:" in tag_lower:
                error_msg = _(
                   "HTML Plugin: Sorry but using 'vbscript:' is not allowed.")
                term.send_message(error_msg)
                html = u"\u2421"
                break
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
            self.file_obj = tempfile.TemporaryFile()
            self.path = self.file_obj.name
        # Store the HTML in a temporary file
        self.file_obj.write(html.encode('UTF-8'))
        self.file_obj.flush()
        self.file_obj.seek(0) # Go back to the start
        # Advance the cursor so the next character doesn't overwrite our ref
        term.cursor_right()
        return self.file_obj

    def html(self):
        """
        Returns :attr:`self.file_obj` as raw HTML.
        """
        if not self.file_obj:
            return u""
        self.file_obj.seek(0) # Just to be safe
        html_out = self.file_obj.read()
        self.file_obj.seek(0) # I keep things tidy
        return html_out.decode('UTF-8')

def add_html_handler(self, term, multiplex, callback_id):
    """
    Adds the HTMLOutput :class:`FileType` to the terminal emulator.
    """
    # Add our HTMLOutput FileType to the terminal's magic
    multiplex.term.add_magic(HTMLOutput)

hooks = {
    'Events': {
        'terminal:add_terminal_callbacks': add_html_handler
    }
}
