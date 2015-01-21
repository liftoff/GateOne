# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation

# Meta
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"
__doc__ = """
.. _locale.py:

Locale Module for Gate One
==========================

This module contains functions that deal with Gate One's locale, localization,
and internationalization features.
"""

import os, gettext, logging
from .configuration import get_settings
from tornado.options import options

# Figure out which languages we have translations for:
from pkg_resources import resource_listdir, resource_stream, isdir
from pkg_resources import resource_exists
supported_locales = [
    a for a in resource_listdir('gateone', 'i18n')
        if a not in ('gateone.pot', 'gateone_js.pot')]

def get_translation(settings_dir=None):
    """
    Looks inside Gate One's settings to determine the configured locale and
    returns a matching locale.get_translation function.  If no locale is set
    (e.g. first time running Gate One) the local `$LANG` environment variable
    will be used.

    This function is meant to be used like so::

        >>> from gateone.core.locale import get_translation
        >>> _ = get_translation()
    """
    if not settings_dir:
        # Check the tornado options object first
        if hasattr(options, 'settings_dir'):
            settings_dir = options.settings_dir
        else: # Fall back to the default settings dir
            settings_dir = os.path.join(os.path.sep, 'etc', 'gateone' 'conf.d')
    # If none of the above worked we can always just use en_US:
    locale_str = os.environ.get('LANG', 'en_US').split('.')[0]
    try:
        settings = get_settings(settings_dir)
        gateone_settings = settings['*'].get('gateone', None)
        if gateone_settings: # All these checks are necessary for early startup
            locale_str = settings['*']['gateone'].get('locale', locale_str)
    except IOError: # server.conf doesn't exist (yet).
        # Already set above
        pass
    if locale_str.startswith('en'): # Gate One's messages are already English
        return lambda c: c # Just return strings as-is
    # Try to find a translation
    mo_path = '/i18n/%s/LC_MESSAGES/gateone.mo' % locale_str
    if not resource_exists('gateone', mo_path):
        logging.warning("No translation found for locale: %s" % locale_str)
        return lambda c: c # No translation so you get English; sorry :(
    with resource_stream('gateone', mo_path) as f:
        key = (gettext.GNUTranslations, f)
        translation = gettext._translations.setdefault(
            key, gettext.GNUTranslations(f))
        return translation.ugettext
