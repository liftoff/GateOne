# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#

__doc__ = """\
This module simply provides a collection of utility functions for the Terminal
application
"""

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Standard library imports
import os, io

# Gate One imports
from gateone.core.utils import json_encode
from gateone.core.configuration import RUDict
from gateone.core.locale import get_translation
from gateone.core.log import go_logger

# 3rd party imports
from tornado.escape import json_decode
from tornado.options import options

APPLICATION_PATH = os.path.split(__file__)[0] # Path to our application
term_log = go_logger("gateone.terminal")

# Localization support
_ = get_translation()

def save_term_settings(term, location, session, settings):
    """
    Saves the *settings* associated with the given *term*, *location*, and
    *session* in the 'term_settings.json' file inside the user's session
    directory.

    When complete the given *callback* will be called (if given).
    """
    term = str(term) # JSON wants strings as keys
    term_settings = RUDict()
    term_settings[location] = {term: settings}
    session_dir = options.session_dir
    session_dir = os.path.join(session_dir, session)
    settings_path = os.path.join(session_dir, 'term_settings.json')
    # First we read in the existing settings and then update them.
    if os.path.exists(settings_path):
        with io.open(settings_path, encoding='utf-8') as f:
            term_settings.update(json_decode(f.read()))
        term_settings[location][term].update(settings)
    with io.open(settings_path, 'w', encoding='utf-8') as f:
        f.write(json_encode(term_settings))

def restore_term_settings(location, session):
    """
    Returns the terminal settings associated with the given *location* that are
    stored in the user's session directory.
    """
    session_dir = options.session_dir
    session_dir = os.path.join(session_dir, session)
    settings_path = os.path.join(session_dir, 'term_settings.json')
    if not os.path.exists(settings_path):
        return # Nothing to do
    with io.open(settings_path, encoding='utf-8') as f:
        try:
            settings = json_decode(f.read())
        except ValueError:
            # Something wrong with the file.  Remove it
            term_log.error(_(
                "Error decoding {0}.  File will be removed.").format(
                    settings_path))
            os.remove(settings_path)
            return {}
    return settings
