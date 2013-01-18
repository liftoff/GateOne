# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
playback.py - A plugin for Gate One that adds support for saving and playing
back session recordings.

.. note:: Yes this only contains one function and it is exposed to clients through a WebSocket hook.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'WebSocket': {
            'playback_save_recording': save_recording,
        }
    }

Docstrings
----------
"""

# Meta
__version__ = '1.0'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os
from utils import get_translation

_ = get_translation()

# Globals
PLUGIN_PATH = os.path.split(__file__)[0]

def get_256_colors(self):
    """
    Returns the rendered 256-color CSS.
    """
    colors_256_path = self.render_256_colors()
    filename = os.path.split(colors_256_path)[1]
    mtime = os.stat(colors_256_path).st_mtime
    cached_filename = "%s:%s" % (colors_256_path.replace('/', '_'), mtime)
    cache_dir = self.ws.prefs['*']['gateone']['cache_dir']
    cached_file_path = os.path.join(cache_dir, cached_filename)
    with open(cached_file_path) as f:
        colors_256 = f.read()
    return colors_256

def save_recording(self, settings):
    """
    Handles uploads of session recordings and returns them to the client in a
    self-contained HTML file that will auto-start playback.

    NOTE: The real crux of the code that handles this is in the template.
    """
    import tornado.template
    from datetime import datetime
    now = datetime.now().strftime('%Y%m%d%H%m%S') # e.g. '20120208200222'
    out_dict = {
        'result': 'Success',
        'filename': 'GateOne_recording-%s.html' % now,
        'data': None,
        'mimetype': 'text/html'
    }
    recording = settings["recording"]
    container = settings["container"]
    prefix = settings["prefix"]
    theme = settings["theme"]
    colors = settings["colors"]
    template_path = os.path.join(PLUGIN_PATH, 'templates')
    colors_templates_path = os.path.join(template_path, 'term_colors')
    colors_css_path = os.path.join(colors_templates_path, '%s.css' % colors)
    with open(colors_css_path) as f:
        colors_file = f.read()
    themes_templates_path = os.path.join(template_path, 'themes')
    theme_css_path = os.path.join(themes_templates_path, '%s.css' % theme)
    with open(theme_css_path) as f:
        theme_file = f.read()
    colors = tornado.template.Template(colors_file)
    rendered_colors = colors.generate(container=container, prefix=prefix)
    theme = tornado.template.Template(theme_file)
    # Setup our 256-color support CSS:
    colors_256 = get_256_colors(self)
    rendered_theme = theme.generate(
        container=container,
        prefix=prefix,
        colors_256=colors_256,
        url_prefix=self.ws.settings['url_prefix']
    )
    templates_path = os.path.join(plugin_path, "templates")
    recording_template_path = os.path.join(
        templates_path, "self_contained_recording.html")
    with open(recording_template_path) as f:
        recording_template_data = f.read()
    recording_template = tornado.template.Template(recording_template_data)
    rendered_recording = recording_template.generate(
        recording=recording,
        container=container,
        prefix=prefix,
        theme=rendered_theme,
        colors=rendered_colors
    )
    out_dict['data'] = rendered_recording
    message = {'save_file': out_dict}
    self.write_message(message)

hooks = {
    'WebSocket': {
        'playback_save_recording': save_recording,
    }
}
