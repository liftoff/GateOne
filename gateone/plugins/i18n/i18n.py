# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
i18n.py - A plugin to support internationalization.  Specifically, keyboard
layouts.
"""

# Meta
__version__ = '0.9'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os
import logging
import gettext

# Our stuff
from gateone import BaseHandler
from utils import get_translation

_ = get_translation()

# Tornado stuff
import tornado.web
from tornado.escape import json_encode, json_decode

# Handlers
class KeyboardLayoutsHandler(BaseHandler):
    """
    This handler allows the client to enumerate or download/load keyboard
    layouts written in JavaScript.  The keyboard layouts should be .js files
    placed in the plugins/i18n/static/keyboard_layouts directory.
    """
    @tornado.web.authenticated
    def get(self):
        gateone_dir = self.settings['gateone_dir']
        layouts_dir = os.path.join(
            gateone_dir, 'plugins/i18n/static/keyboard_layouts')
        enum = self.get_argument("enumerate", None)
        if enum:
            layouts = os.listdir(layouts_dir)
            # The client will take care of the .js part on its own
            layouts = [a.replace('.js', '') for a in layouts]
            self.set_header ('Content-Type', 'application/json')
            message = {'layouts': layouts}
            self.write(json_encode(message))
        else:
            # NOTE: *layout* needs to be the actual filename (with .js)
            layout = self.get_argument("layout")
            self.set_header ('Content-Type', 'application/javascript')
            try:
                with open(os.path.join(layouts_dir, layout)) as f:
                    self.write(f.read())
            except IOError:
                # Given layout was not found
                logging.error(
                    _("plugins/i18n/static/keyboard_layouts/%s was not found"
                        % layout))

# NOTE: This is a work-in-progress.  I'm trying to decide if I want to implement a JavaScript _() function or just do everything via tornado templates (which have the _() function built-in:  {{_("Your string here")}}).
#class TranslationHandler(BaseHandler):
    #"""
    #Returns a JSON object representing a list of translations that are meant to
    #be used by the i18n.js script.  It will dump (in JSON) all translations for
    #a given locale.  This includes any translations that can be found inside
    #plugin directories (plugins/<plugin name>/i18n/<locale>/LC_MESSAGES/*).
    #"""
    #@tornado.web.authenticated
    #def get(self):
        #gateone_dir = self.settings['gateone_dir']
        #locale = self.get_argument("locale", None)
        #if not locale:
            ## Nothing to do
            #self.write('{}')
        #else:
            ## First we grab all of Gate One's translations
            #locale_dir = os.path.join(gateone_dir, 'i18n')
            #tr = gettext.translation('gateone', locale_dir)

        #try:
            #if not locale_dir:
                #locale_dir = os.path.join(os.getcwd(), 'i18n')
                #if domain == 'PyCI':
                    #tr = gettext.translation(domain, locale_dir)
                #else:
                    ## Check if the domain matches the name of a plugin
                    #plugins = find_plugins()
                    #for plugin in plugins:
                        #if plugin.__module__ == domain:
                            #locale_dir = os.path.join(os.getcwd(), 'plugins_enabled/%s/i18n' % plugin.__module__)
                            #tr = gettext.translation(domain, locale_dir)
            #keys = tr._catalog.keys()
            #keys.sort()
            #ret = {}
            #for k in keys:
                #v = tr._catalog[k]
                #if type(k) is tuple:
                    #if k[0] not in ret:
                        #ret[k[0]] = []
                    #ret[k[0]].append(v)
                #else:
                    #ret[k] = v
            #self.write(json.dumps(ret, ensure_ascii=False, indent=indent))
        #except IOError:
            #return None

hooks = {
    'Web': [(r"/i18n/get_layout", KeyboardLayoutsHandler)],
}