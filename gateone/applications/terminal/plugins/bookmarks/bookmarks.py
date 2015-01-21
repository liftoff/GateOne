# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
bookmarks.py - A plugin for Gate One that adds fancy bookmarking capabilities.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'Web': [
            (r"/bookmarks/fetchicon", FaviconHandler),
            (r"/bookmarks/export", ExportHandler),
            (r"/bookmarks/import", ImportHandler),
        ],
        'WebSocket': {
            'terminal:bookmarks_sync': save_bookmarks,
            'terminal:bookmarks_get': get_bookmarks,
            'terminal:bookmarks_deleted': delete_bookmarks,
            'terminal:bookmarks_rename_tags': rename_tags,
        },
        'Events': {
            'terminal:authenticate': send_bookmarks_css_template
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
import os, sys, time, json, socket
from functools import partial

# Our stuff
from gateone.core.server import BaseHandler
from gateone.core.utils import noop, json_encode
from gateone.auth.authorization import require, authenticated

# Tornado stuff
import tornado.web
from tornado.escape import json_decode

# 3rd party stuff
PLUGIN_PATH = os.path.split(__file__)[0]
#sys.path.append(os.path.join(PLUGIN_PATH, "dependencies"))

# Globals
boolean_fix = {
    True: True,
    False: False,
    'True': True,
    'False': False,
    'true': True,
    'false': False
}

# Helper functions
def unescape(s):
    """
    Unescape HTML code refs; c.f. http://wiki.python.org/moin/EscapingHtml
    """
    import re
    from htmlentitydefs import name2codepoint
    # Fix the missing one:
    name2codepoint['#39'] = 39
    return re.sub('&(%s);' % '|'.join(name2codepoint), lambda m: unichr(name2codepoint[m.group(1)]), s)

def parse_bookmarks_html(html):
    """
    Reads the Netscape-style bookmarks.html in string, *html* and returns a
    list of Bookmark objects.
    """
    # If this looks impossibly complicated it's because parsing HTML streams is
    # dark voodoo.  I had to push my brains back behind my eyes and into my ears
    # a few times while writing this.
    import html5lib
    out_list = []
    p = html5lib.HTMLParser(tree=html5lib.treebuilders.getTreeBuilder("dom"))
    dom_tree = p.parse(html)
    walker = html5lib.treewalkers.getTreeWalker("dom")
    stream = walker(dom_tree)
    level = 0
    tags = []
    h3on = False
    aon = False
    ddon = False
    add_date = None
    url = None
    icon = None
    name = ""
    for token in stream:
        if 'name' in token:
            if token['name'] == 'dl':
                if token['type'] == 'StartTag':
                    level += 1
                elif token['type'] == 'EndTag':
                    if tags:
                        tags.pop()
                    level -= 1
            if token['name'] == 'dd':
                if token['type'] == 'StartTag':
                    ddon = True
                elif token['type'] == 'EndTag':
                    ddon = False
            if token['name'] == 'h3':
                if token['type'] == 'StartTag':
                    h3on = True
                elif token['type'] == 'EndTag':
                    h3on = False
            if token['name'] == 'a':
                if token['type'] == 'StartTag':
                    aon = True
                elif token['type'] == 'EndTag':
                    aon = False
                    if not add_date: # JavaScript-style 13-digit epoch:
                        add_date = int(round(time.time() * 1000))
                    add_date = int(add_date)
                    if add_date > 9999999999999: # Delicious goes out to 16
                        add_date = int(add_date/1000)
                    if add_date < 10000000000: # Chrome only goes to 10 digits
                        add_date = int(add_date*1000)
                    bm = {
                        'url': url,
                        'name': name.strip(),
                        'tags': [a for a in tags if a], # Remove empty tags
                        'notes': "", # notes
                        'visits': 0, # visits
                        'updated': add_date, # updated
                        'created': add_date, # created
                        'updateSequenceNum': 0, # updateSequenceNum
                        'images': {'favicon': icon}
                    }
                    out_list.append(bm)
                    # Reset everything (just in case)
                    add_date = None
                    url = None
                    icon = None
                    name = ""
        if h3on:
            if token['data']:
                if type(token['data']) == str:
                    tags.append(token['data'])
                elif type(token['data']) == unicode:
                    tags.append(token['data'])
        if ddon: # Indicates that there's notes here
            if token['data']:
                if token['type'] == 'Characters':
                    # Notes get attached to the bookmark we just created
                    out_list[-1]['notes'] = unescape(token['data'].strip())
        if aon:
            if token['type'] == 'StartTag':
                # html5lib changed from using lists to using dicts at some point
                # after 0.90.  Hence the two conditionals below
                if isinstance(token['data'], list):
                    for tup in token['data']:
                        if tup[0] == 'add_date':
                            add_date = tup[1]
                        elif tup[0] == 'href':
                            url = tup[1]
                        elif tup[0] == 'icon':
                            icon = tup[1]
                        elif tup[0] == 'tags':
                            tags = tup[1].split(',') # Delicious-style
                elif isinstance(token['data'], dict):
                    for tup in token['data']:
                        if 'add_date' in tup:
                            add_date = token['data'][tup]
                        elif 'href' in tup:
                            url = token['data'][tup]
                        elif 'icon' in tup:
                            icon = token['data'][tup]
                        elif 'tags' in tup:
                            tags = token['data'][tup].split(',') # Delicious
            elif token['type'] == 'Characters':
                name += unescape(token['data'])
    return out_list

def get_json_tags(bookmarks, url):
    """
    Iterates over *bookmarks* (dict) trying to find tags associated with the
    given *url*.  Returns the tags found as a list.
    """
    tags = []
    # This function has been brought to you by your favorite stock symbol
    if bookmarks.has_key('root') and bookmarks.has_key('children'):
        for item in bookmarks['children']:
            if item['title'] == 'Tags':
                for child in item['children']:
                    if child['type'] == 'text/x-moz-place-container':
                        for subchild in child['children']:
                            if subchild['type'] == 'text/x-moz-place':
                                if subchild['uri'] == url:
                                    tags.append(child['title'])
                                        # "Ahhhhhhh"
                                            # "hhhhhhhh"
                                                # "hhhhhhh"
                                                    # "hhhhhh"
                                                        # "hhhhh"
                                                            # "!!!"
                                                                # <splat>
    return tags

def get_ns_json_bookmarks(json_dict, bookmarks):
    """
    Given a *json_dict*, updates *bookmarks* with each URL as it is found
    within.

    .. note:: Only works with Netscape-style bookmarks.json files.
    """
    if json_dict.has_key('children'):
        for child in json_dict['children']:
            if child['type'] == 'text/x-moz-place':
                if not bookmarks[0].has_key(child['uri']):
                    # Browser won't let you load file: URIs from HTTP pages
                    if child['uri'][0:6] not in ['place:', 'file:/']:
                        # Note the use of json_dict as bookmarks[1] here:
                        tags = get_json_tags(bookmarks[1], child['uri'])
                        if not tags:
                            tags = ['Untagged']
                        if child.has_key("annos"):
                            notes = child["annos"]
                        else:
                            notes = ""
                        if child['lastModified'] > 9999999999999:
                            # Chop off the microseconds to make it 13 digits
                            child['lastModified'] = int(child['lastModified']/1000)
                        elif child['lastModified'] < 10000000000:
                            child['lastModified'] = int(child['lastModified']*1000)
                        if child['dateAdded'] > 9999999999999: # Delicious
                            # Chop off the microseconds to make it 13 digits
                            child['dateAdded'] = int(child['dateAdded']/1000)
                        elif child['dateAdded'] < 10000000000: # Chrome
                            child['dateAdded'] = int(child['dateAdded']*1000)
                        bm = {
                            'url': child['uri'],
                            'name': child['title'].strip(),
                            'tags': tags,
                            'notes': notes,
                            'visits': 0, # visits
                            'updated': child['lastModified'], # updated
                            'created': child['dateAdded'], # created
                            'updateSequenceNum': 0, # updateSequenceNum
                            'images': {} # No icons in JSON :(
                        }
                        bookmarks[0].update({child['uri']: bm})
            elif child['type'] == 'text/x-moz-place-container':
                get_ns_json_bookmarks(child, bookmarks)

def parse_bookmarks_json(json_str):
    """
    Given *json_str*, returns a list of bookmark objects representing the data
    contained therein.
    """
    # TODO: Get this recognizing and parsing our own JSON format.
    json_obj = json.loads(json_str)
    out_list = []
    bookmarks = [{}, json_obj] # Inside a list for persistence
    get_ns_json_bookmarks(json_obj, bookmarks) # Updates urls in-place
    for url, bm in bookmarks[0].items():
        out_list.append(bm)
    return out_list

# Data Structures
class BookmarksDB(object):
    """
    Used to read and write bookmarks to a file on disk.  Can also synchronize
    a given list of bookmarks with what's on disk.  Uses a given bookmark's
    ``updateSequenceNum`` to track what wins the "who is newer?" comparison.
    """
    def __init__(self, user_dir, user):
        """
        Sets up our bookmarks database object and reads everything in.
        """
        self.bookmarks = [] # For temp storage of all bookmarks
        self.user_dir = user_dir
        self.user = user
        users_dir = os.path.join(user_dir, user) # "User's dir"
        self.bookmarks_path = os.path.join(users_dir, "bookmarks.json")
        # Read existing bookmarks into self.bookmarks
        self.open_bookmarks()

    def open_bookmarks(self):
        """
        Opens the bookmarks stored in self.user_dir.  If not present, an
        empty file will be created.
        """
        if not os.path.exists(self.bookmarks_path):
            with open(self.bookmarks_path, 'w') as f:
                f.write('[]') # That's an empty JSON list
            return # Default of empty list will do
        with open(self.bookmarks_path) as f:
            self.bookmarks = json_decode(f.read())

    def save_bookmarks(self):
        """
        Saves self.bookmarks to self.bookmarks_path as a JSON-encoded list.
        """
        with open(self.bookmarks_path, 'w') as f:
            f.write(json_encode(self.bookmarks))

    def sync_bookmarks(self, bookmarks):
        """
        Given *bookmarks*, synchronize with self.bookmarks doing conflict
        resolution and whatnot.
        """
        highest_USN = self.get_highest_USN()
        changed = False # For if there's changes that need to be written
        updated_bookmarks = [] # For bookmarks that are newer on the server
        for bm in bookmarks:
            if bm['url'] == "web+deleted:bookmarks/":
                # Remove the existing deleted entry if it exists
                for j, deleted_bm in enumerate(bm['notes']):
                    if deleted_bm['url'] == bm['url']:
                        # Remove the deleted bookmark entry
                        bm['notes'].pop(j)
            found_existing = False
            for i, db_bookmark in enumerate(self.bookmarks):
                if bm['url'] == db_bookmark['url']:
                    # Bookmark already exists, check which is newer
                    found_existing = True
                    if bm['updateSequenceNum'] > db_bookmark['updateSequenceNum']:
                        # The given bookmark is newer than what's in the DB
                        self.bookmarks[i] = bm # Replace it
                        highest_USN += 1 # Increment the USN
                        self.bookmarks[i]['updateSequenceNum'] = highest_USN
                        changed = True
                    elif bm['updateSequenceNum'] < db_bookmark['updateSequenceNum']:
                        # DB has a newer bookmark.  Add it to the list to send
                        # to the client.
                        updated_bookmarks.append(db_bookmark)
                    # Otherwise the USNs are equal and there's nothing to do
            if not found_existing:
                # This is a new bookmark.  Add it
                highest_USN += 1 # Increment the USN
                bm['updateSequenceNum'] = highest_USN
                self.bookmarks.append(bm)
                changed = True # So it will be saved
        if changed:
            # Write the changes to disk
            self.save_bookmarks()
        # Let the client know what's newer on the server
        return updated_bookmarks

    def delete_bookmark(self, bookmark):
        """Deletes the given *bookmark*."""
        highest_USN = self.get_highest_USN()
        for i, db_bookmark in enumerate(self.bookmarks):
            if bookmark['url'] == db_bookmark['url']:
                # Remove it
                self.bookmarks.pop(i)
                # Add it to the list of deleted bookmarks
                special_deleted_bm = None
                for bm in self.bookmarks:
                    if bm['url'] == "web+deleted:bookmarks/":
                        special_deleted_bm = bm
                # The deleted bookmarks 'bookmark' is just a list of URLs that
                # have been deleted along with the time it happened.  This lets
                # us keep multiple browsers in sync with what's been deleted
                # so we don't inadvertently end up re-adding bookmarks that were
                # deleted by another client.
                if not special_deleted_bm:
                    # Make our first entry
                    special_deleted_bm = {
                        'url': "web+deleted:bookmarks/",
                        'name': "Deleted Bookmarks",
                        'tags': [],
                        'notes': [bookmark],
                        'visits': highest_USN + 1,
                        'updated': int(round(time.time() * 1000)),
                        'created': int(round(time.time() * 1000)),
                        'updateSequenceNum': 0,
                        'images': {}
                    }
                    self.bookmarks.append(special_deleted_bm)
                else:
                    # Check for pre-existing
                    updated = False
                    for j, deleted_bm in enumerate(special_deleted_bm['notes']):
                        if deleted_bm['url'] == bookmark['url']:
                            # Update it in place
                            special_deleted_bm['notes'][j] = bookmark
                            updated = True
                    if not updated:
                        special_deleted_bm['notes'].append(bookmark)
                    highest_USN += 1
                    special_deleted_bm['updateSequenceNum'] = highest_USN
                break
        # Save the change to disk
        self.save_bookmarks()

    def get_bookmarks(self, updateSequenceNum=0):
        """
        Returns a list of bookmarks newer than *updateSequenceNum*.
        If *updateSequenceNum* is 0 or undefined, all bookmarks will be
        returned.
        """
        out_bookmarks = []
        for bm in self.bookmarks:
            if bm['updateSequenceNum'] > updateSequenceNum:
                out_bookmarks.append(bm)
        return out_bookmarks

    def get_highest_USN(self):
        """Returns the highest updateSequenceNum in self.bookmarks"""
        highest_USN = 0
        for bm in self.bookmarks:
            if bm['updateSequenceNum'] > highest_USN:
                highest_USN = bm['updateSequenceNum']
        return highest_USN

    def rename_tag(self, old_tag, new_tag):
        """
        Goes through all bookmarks and renames all tags named *old_tag* to be
        *new_tag*.
        """
        highest_USN = self.get_highest_USN()
        for bm in self.bookmarks:
            if old_tag in bm['tags']:
                highest_USN += 1
                i = bm['tags'].index(old_tag)
                bm['tags'][i] = new_tag
                # Made a change so we need to increment the USN to ensure sync
                bm['updateSequenceNum'] = highest_USN
                bm['updated'] = int(round(time.time() * 1000))
        # Save the change to disk
        self.save_bookmarks()

# Handlers
class FaviconHandler(BaseHandler):
    """
    Retrives the biggest favicon-like icon at the given URL.  It will try to
    fetch apple-touch-icons (which can be nice and big) before it falls back
    to grabbing the favicon.

    .. note:: Works with GET and POST requests but POST is preferred since it keeps the URL from winding up in the server logs.
    """
    # Valid favicon mime types
    favicon_mimetypes = [
        'image/vnd.microsoft.icon',
        'image/x-icon',
        'image/png',
        'image/svg+xml',
        'image/gif',
        'image/jpeg'
    ]
    @tornado.web.asynchronous
    def get(self):
        self.process()

    @tornado.web.asynchronous
    def post(self):
        self.process()

    def process(self):
        url = self.get_argument("url")
        http = tornado.httpclient.AsyncHTTPClient()
        callback = partial(self.on_response, url)
        http.fetch(url, callback, connect_timeout=5.0, request_timeout=5.0)

    def get_favicon_url(self, html):
        """
        Parses *html* looking for a favicon URL.  Returns a tuple of::

            (<url>, <mimetype>)

        If no favicon can be found, returns::

            (None, None)
        """
        import html5lib
        p = html5lib.HTMLParser(
            tree=html5lib.treebuilders.getTreeBuilder("dom"))
        dom_tree = p.parse(html)
        walker = html5lib.treewalkers.getTreeWalker("dom")
        stream = walker(dom_tree)
        fetch_url = None
        mimetype = None
        icon = False
        for token in stream:
            if 'name' in token:
                if token['name'] == 'link':
                    for attr in token['data']:
                        if attr[0] == 'rel':
                            if 'shortcut icon' in attr[1].lower():
                                icon = True
                        elif attr[0] == 'href':
                            fetch_url = attr[1]
                        elif attr[0] == 'type':
                            mimetype = attr[1]
                    if fetch_url and icon:
                        if not mimetype:
                            mimetype = "image/x-icon"
                        if mimetype in self.favicon_mimetypes:
                            return (fetch_url, mimetype)
        return (None, None)

    def on_response(self, url, response):
        try:
            from urlparse import urlparse
        except ImportError: # Python 3.X
            from urllib import parse as urlparse
        if response.error:
            self.write('Unable to fetch icon.')
            self.finish()
            return
        fetch_url = None
        try:
            content = response.body.decode('utf-8')
        except UnicodeDecodeError:
            content = response.body
        parsed_url = urlparse(url)
        (fetch_url, mimetype) = self.get_favicon_url(content)
        if fetch_url:
            if not fetch_url.startswith('http'):
                fetch_url = '%s://%s%s' % (
                    parsed_url.scheme, parsed_url.netloc, fetch_url)
        if not mimetype:
            mimetype = "image/x-icon" # Default
        if not fetch_url:
            fetch_url = '%s://%s/favicon.ico' % (
                parsed_url.scheme, parsed_url.netloc)
        if fetch_url.startswith('http://') or fetch_url.startswith('https://'):
            noop()
        else:
            raise tornado.web.HTTPError(404)
        http = tornado.httpclient.AsyncHTTPClient()
        callback = partial(self.icon_fetch, url, mimetype)
        try:
            http.fetch(
                fetch_url,
                callback,
                connect_timeout=5.0,
                request_timeout=5.0
            )
        except socket.gaierror: # No address associated with hostname
            self.write('Unable to fetch icon.')
            self.finish()
            return

    def icon_multifetch(self, urls, response):
        """
        Fetches the icon at the given URLs, stopping when it finds the biggest.
        If an icon is not found, calls itself again with the next icon URL.
        If the icon is found, writes it to the client and finishes the request.
        """
        if response.error:
            if urls:
                url = urls.pop()
                http = tornado.httpclient.AsyncHTTPClient()
                callback = partial(self.icon_multifetch, urls)
                try:
                    http.fetch(url, callback)
                except socket.gaierror:
                    raise tornado.web.HTTPError(404)
            else:
                raise tornado.web.HTTPError(404)
        else:
            if 'Content-Type' in response.headers:
                mimetype = response.headers['Content-Type']
                self.set_header("Content-Type", mimetype)
            else:
                mimetype = "image/vnd.microsoft.icon"
                self.set_header("Content-Type", mimetype)
            data_uri = "data:%s;base64,%s" % (
                mimetype,
                response.body.encode('base64').replace('\n', '')
            )
            self.write(data_uri)
            self.finish()

    def icon_fetch(self, url, mimetype, response):
        """Returns the fetched icon to the client."""
        if response.error:
            self.write('Unable to fetch icon.')
            self.finish()
            return
        data_uri = "data:%s;base64,%s" % (
            mimetype,
            response.body.encode('base64').replace('\n', '')
        )
        self.set_header("Content-Type", mimetype)
        self.write(data_uri)
        self.finish()

class ImportHandler(tornado.web.RequestHandler):
    """
    Takes a bookmarks.html in a POST and returns a list of bookmarks in JSON
    format
    """
    @tornado.web.asynchronous
    def post(self):
        html = self.request.body
        if html.startswith(b'{'): # This is a JSON file
            bookmarks = parse_bookmarks_json(html)
        else:
            bookmarks = parse_bookmarks_html(html)
        self.write(tornado.escape.json_encode(bookmarks))
        self.finish()
        # NOTE: The client will take care of storing these at the next sync

class ExportHandler(tornado.web.RequestHandler):
    """
    Takes a JSON-encoded list of bookmarks and returns a Netscape-style HTML
    file.
    """
    @tornado.web.asynchronous
    def post(self):
        bookmarks = self.get_argument("bookmarks")
        bookmarks = tornado.escape.json_decode(bookmarks)
        self.set_header("Content-Type", "text/html")
        self.set_header(
            "Content-Disposition", 'attachment; filename="bookmarks.html"')
        templates_path = os.path.join(PLUGIN_PATH, "templates")
        bookmarks_html =  os.path.join(templates_path, "bookmarks.html")
        self.render(bookmarks_html, bookmarks=bookmarks)

# WebSocket commands (not the same as handlers)
@require(authenticated())
def save_bookmarks(self, bookmarks):
    """
    Handles saving *bookmarks* for clients.
    """
    out_dict = {
        'updates': [],
        'count': 0,
        'errors': []
    }
    try:
        user = self.current_user['upn']
        bookmarks_db = BookmarksDB(self.ws.settings['user_dir'], user)
        updates = bookmarks_db.sync_bookmarks(bookmarks)
        out_dict.update({
            'updates': updates,
            'count': len(bookmarks),
        })
        out_dict['updateSequenceNum'] = bookmarks_db.get_highest_USN()
    except Exception as e:
        import traceback
        self.term_log.error("Got exception synchronizing bookmarks: %s" % e)
        traceback.print_exc(file=sys.stdout)
        out_dict['errors'].append(str(e))
    if out_dict['errors']:
        out_dict['result'] = "Upload completed but errors were encountered."
    else:
        out_dict['result'] = "Upload successful"
    message = {'terminal:bookmarks_save_result': out_dict}
    self.write_message(json_encode(message))

@require(authenticated())
def get_bookmarks(self, updateSequenceNum):
    """
    Returns a JSON-encoded list of bookmarks updated since the last
    *updateSequenceNum*.

    If *updateSequenceNum* resolves to False, all bookmarks will be sent to
    the client.
    """
    user = self.current_user['upn']
    bookmarks_db = BookmarksDB(self.settings['user_dir'], user)
    if updateSequenceNum:
        updateSequenceNum = int(updateSequenceNum)
    else: # This will force a full download
        updateSequenceNum = 0
    updated_bookmarks = bookmarks_db.get_bookmarks(updateSequenceNum)
    message = {'terminal:bookmarks_updated': updated_bookmarks}
    self.write_message(json_encode(message))

@require(authenticated())
def delete_bookmarks(self, deleted_bookmarks):
    """
    Handles deleting bookmarks given a *deleted_bookmarks* list.
    """
    user = self.current_user['upn']
    bookmarks_db = BookmarksDB(self.ws.settings['user_dir'], user)
    out_dict = {
        'result': "",
        'count': 0,
        'errors': [],
    }
    try:
        for bookmark in deleted_bookmarks:
            out_dict['count'] += 1
            bookmarks_db.delete_bookmark(bookmark)
        out_dict['result'] = "Success"
    except Exception as e: # TODO: Make this more specific
        self.term_log.error("delete_bookmarks error: %s" % e)
        import traceback
        traceback.print_exc(file=sys.stdout)
        out_dict['result'] = "Errors"
        out_dict['errors'].append(str(e))
    message = {'terminal:bookmarks_delete_result': out_dict}
    self.write_message(json_encode(message))

@require(authenticated())
def rename_tags(self, renamed_tags):
    """
    Handles renaming tags.
    """
    user = self.current_user['upn']
    bookmarks_db = BookmarksDB(self.ws.settings['user_dir'], user)
    out_dict = {
        'result': "",
        'count': 0,
        'errors': [],
        'updates': []
    }
    for pair in renamed_tags:
        old_name, new_name = pair.split(',')
        bookmarks_db.rename_tag(old_name, new_name)
        out_dict['count'] += 1
    message = {'terminal:bookmarks_renamed_tags': out_dict}
    self.write_message(json_encode(message))

def send_bookmarks_css_template(self):
    """
    Sends our bookmarks.css template to the client using the 'load_style'
    WebSocket action.  The rendered template will be saved in Gate One's
    'cache_dir'.
    """
    css_path = os.path.join(PLUGIN_PATH, 'templates', 'bookmarks.css')
    self.ws.render_and_send_css(css_path)

hooks = {
    'Web': [
        (r"/bookmarks/fetchicon", FaviconHandler),
        (r"/bookmarks/export", ExportHandler),
        (r"/bookmarks/import", ImportHandler),
    ],
    'WebSocket': {
        'terminal:bookmarks_sync': save_bookmarks,
        'terminal:bookmarks_get': get_bookmarks,
        'terminal:bookmarks_deleted': delete_bookmarks,
        'terminal:bookmarks_rename_tags': rename_tags,
    },
    'Events': {
        'terminal:authenticate': send_bookmarks_css_template
    }
}
