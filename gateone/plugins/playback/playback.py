# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
playback.py - A plugin for Gate One that adds support for saving and playing
back session recordings.
"""

# Meta
__version__ = '1.0'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os

# Tornado stuff


# Globals
plugin_path = os.path.split(__file__)[0]

def save_recording(settings, tws):
    """
    Handles uploads of session recordings and returns them to the client in a
    self-contained HTML file that will auto-start playback.

    NOTE: The real crux of the code that handles this is in the template.
    """
    import tornado.template
    from gateone import COLORS_256
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
    gateone_dir = tws.settings['gateone_dir']
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
    colors = tornado.template.Template(colors_file)
    rendered_colors = colors.generate(container=container, prefix=prefix)
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
        container=container,
        prefix=prefix,
        colors_256=colors_256,
        url_prefix=tws.settings['url_prefix']
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
    tws.write_message(message)

hooks = {
    'WebSocket': {
        'playback_save_recording': save_recording,
    }
}