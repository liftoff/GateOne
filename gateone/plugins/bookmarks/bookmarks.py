# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

__doc__ = """\
bookmarks.py - A plugin for Gate One that adds fancy bookmarking capabilities.
"""

# Meta
__version__ = '0.9'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os, sys
import logging
from functools import partial
try:
    from urlparse import urlparse
except ImportError: # Python 3.X
    from urllib import parse as urlparse

# Our stuff
from gateone import BaseHandler
from utils import get_translation, mkdir_p, noop

_ = get_translation()

# Tornado stuff
import tornado.web
from tornado.escape import json_encode, json_decode

# 3rd party stuff
# The following two lines let us import modules in the "dependencies" dir
plugin_path = os.path.split(__file__)[0]
sys.path.append(os.path.join(plugin_path, "dependencies"))
import html5lib
from html5lib import treebuilders, treewalkers

# Globals

class BookmarksDB(object):
    """
    Used to read and write bookmarks to a file on disk.  Can also synchronize
    a given list of bookmarks with what's on disk.  Uses a given bookmark's
    updateSequenceNum to track what wins the "who is newer?" comparison.
    """
    def __init__(self, user_dir, user):
        """
        Sets up a session with Evernote to store/retrieve/sync notes...

        Authenticates in one of two ways:  username/password or you can skip
        that and provide an authToken.  If providing an authToken you must also
        provide a shardId and a userId.

        *notebook_name* represents the name of the notebook
        we'll be using to store bookmarks.
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
        for i, db_bookmark in enumerate(self.bookmarks):
            if bookmark['url'] == db_bookmark['url']:
                # Remove it
                self.bookmarks.pop(i)
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

# Handlers
class SyncHandler(BaseHandler):
    """
    Handles synchronizing bookmarks with clients.
    """
    boolean_fix = {
        True: True,
        False: False,
        'True': True,
        'False': False,
        'true': True,
        'false': False
    }

    @tornado.web.asynchronous
    @tornado.web.authenticated
    def post(self):
        """Handles POSTs of JSON-encoded bookmarks."""
        out_dict = {
            'updates': [],
            'count': 0,
            'errors': []
        }
        try:
            user = self.get_current_user()['go_upn']
            bookmarks_db = BookmarksDB(self.settings['user_dir'], user)
            bookmarks_json = unicode(self.request.body, errors='ignore')
            bookmarks = tornado.escape.json_decode(bookmarks_json)
            updates = bookmarks_db.sync_bookmarks(bookmarks)
            out_dict.update({
                'updates': updates,
                'count': len(bookmarks),
            })
            out_dict['updateSequenceNum'] = bookmarks_db.get_highest_USN()
        except Exception as e:
            import traceback
            logging.error("Got exception synchronizing bookmarks: %s" % e)
            traceback.print_exc(file=sys.stdout)
            out_dict['errors'].append(str(e))
        if out_dict['errors']:
            out_dict['result'] = "Upload completed but errors were encountered."
        else:
            out_dict['result'] = "Upload successful"
        self.write(json_encode(out_dict))
        self.finish()

    @tornado.web.asynchronous
    @tornado.web.authenticated
    def get(self):
        """
        Returns a JSON-encodedlist of bookmarks updated since the last
        updateSequenceNum.  Expects "updateSequenceNum" as an argument.

        If "updateSequenceNum" resolves to False, all bookmarks will be sent to
        the client.
        """
        user = self.get_current_user()['go_upn']
        bookmarks_db = BookmarksDB(self.settings['user_dir'], user)
        updateSequenceNum = self.get_argument("updateSequenceNum", None)
        if updateSequenceNum:
            updateSequenceNum = int(updateSequenceNum)
        else: # This will force a full download
            updateSequenceNum = 0
        updated_bookmarks = bookmarks_db.get_bookmarks(updateSequenceNum)
        self.write(json_encode(updated_bookmarks))
        self.finish()

class DeleteBookmarksHandler(BaseHandler):
    """
    Handles POSTs of deleted bookmarks to process on the server side of things.
    """
    @tornado.web.asynchronous
    def post(self):
        """Handles POSTs of a JSON-encoded deletedBookmarks list."""
        deleted_bookmarks_json = unicode(self.request.body, errors='ignore')
        deleted_bookmarks = tornado.escape.json_decode(deleted_bookmarks_json)
        user = self.get_current_user()['go_upn']
        bookmarks_db = BookmarksDB(self.settings['user_dir'], user)
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
            out_dict['result'] = "Errors"
            out_dict['errors'].append(str(e))
        self.write(out_dict)
        self.finish()

class FaviconHandler(tornado.web.RequestHandler):
    """
    Retrives the biggest favicon-like icon at the given URL.  It will try to
    fetch apple-touch-icons (which can be nice and big) before it falls back
    to grabbing the favicon.

    NOTE: Works with GET and POST requests but POST is preferred since it keeps
    the URL from winding up in the server logs.
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
        Parses *html* looking for a favicon URL.  Returns a tuple of:
            (<url>, <mimetime>)

        If no favicon can be found, returns:
            (None, None)
        """
        p = html5lib.HTMLParser(tree=treebuilders.getTreeBuilder("dom"))
        dom_tree = p.parse(html)
        walker = treewalkers.getTreeWalker("dom")
        stream = walker(dom_tree)
        fetch_url = None
        mimetype = None
        icon = False
        found_token = None
        for token in stream:
            if 'name' in token:
                if token['name'] == 'link':
                    for attr in token['data']:
                        if attr[0] == 'rel':
                            if 'shortcut icon' in attr[1].lower():
                                found_token = token
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
        except gaierror: # No address associated with hostname
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
                except gaierror:
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

hooks = {
    'Web': [
        (r"/bookmarks_sync", SyncHandler),
        (r"/bookmarks_fetchicon", FaviconHandler),
        (r"/bookmarks_delete", DeleteBookmarksHandler),
    ]
}