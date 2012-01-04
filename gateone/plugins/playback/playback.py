# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
playback.py - A plugin for Gate One that adds support for saving and playing
back session recordings.
"""

# Meta
__version__ = '0.9'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os
import logging

# Our stuff
from gateone import BaseHandler, COLORS_256
from utils import get_translation

_ = get_translation()

# Tornado stuff
import tornado.web
import tornado.template
from tornado.escape import json_encode, json_decode

class RecordingHandler(BaseHandler):
    """
    Handles uploads of session recordings and returns them to the client in a
    self-contained HTML file that will auto-start playback.

    NOTE: The real crux of the code that handles this is in the template.
    """
    def post(self):
        r = self.get_argument("r", None) # Used to ensure a fresh recording
        recording = self.get_argument("recording")
        container = self.get_argument("container")
        prefix = self.get_argument("prefix")
        theme = self.get_argument("theme")
        colors = self.get_argument("colors")
        gateone_dir = self.settings['gateone_dir']
        plugins_path = os.path.join(gateone_dir, 'plugins')
        #playback_plugin_path = os.path.join(plugins_path, 'playback')
        template_path = os.path.join(gateone_dir, 'templates')
        colors_templates_path = os.path.join(template_path, 'term_colors')
        colors_css_path = os.path.join(colors_templates_path, '%s.css' % colors)
        with open(colors_css_path) as f:
            colors_file = f.read()
        themes_templates_path = os.path.join(template_path, 'themes')
        theme_css_path = os.path.join(themes_templates_path, '%s.css' % theme)
        with open(theme_css_path) as f:
            theme_file = f.read()
        #colors_file = open(
            #'%s/templates/term_colors/%s.css' % (gateone_dir, colors)).read()
        colors = tornado.template.Template(colors_file)
        rendered_colors = colors.generate(container=container, prefix=prefix)
        #theme_file = open(
            #'%s/templates/themes/%s.css' % (gateone_dir, theme)).read()
        theme = tornado.template.Template(theme_file)
        # Setup our 256-color support CSS:
        colors_256 = ""
        for i in xrange(256):
            fg = "#%s span.fx%s {color: #%s;}" % (
                container, i, COLORS_256[i])
            bg = "#%s span.bx%s {background-color: #%s;} " % (
                container, i, COLORS_256[i])
            colors_256 += "%s %s" % (fg, bg)
        colors_256 += "\n"
        rendered_theme = theme.generate(
            container=container, prefix=prefix, colors_256=colors_256)
        self.render(
            "templates/self_contained_recording.html",
            recording=recording,
            container=container,
            prefix=prefix,
            theme=rendered_theme,
            colors=rendered_colors
        )

hooks = {
    'Web': [(r"/recording", RecordingHandler)]
}