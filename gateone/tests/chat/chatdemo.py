#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# Copyright 2009 Facebook
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may
# not use this file except in compliance with the License. You may obtain
# a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
# WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations
# under the License.

# NOTE:  This is a modified version of the 'chat' demo application included in
# the Tornado framework tarball.

# TODO: Write a nice long docstring for this and make sure it shows up in the
#       regular Gate One documentation.

import sys
import logging
import time
import json
import tornado.auth
import tornado.escape
import tornado.ioloop
import tornado.options
import tornado.web
import os.path
import uuid

from tornado.options import define, options

define("port", default=8000, help="Run on the given port", type=int)

class Application(tornado.web.Application):
    def __init__(self):
        handlers = [
            (r"/", MainHandler),
            (r"/auth/login", LoginHandler),
            #(r"/auth/logout", AuthLogoutHandler),
            (r"/a/message/new", MessageNewHandler),
            (r"/a/message/updates", MessageUpdatesHandler),
        ]
        settings = dict(
            cookie_secret=u"MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M",
            login_url="/auth/login",
            template_path=os.path.join(os.path.dirname(__file__), "templates"),
            static_path=os.path.join(os.path.dirname(__file__), "static"),
            xsrf_cookies=False,
            debug=True,
            autoescape="xhtml_escape"
        )
        tornado.web.Application.__init__(self, handlers, **settings)


class BaseHandler(tornado.web.RequestHandler):
    def get_current_user(self):
        user_json = self.get_secure_cookie("user")
        if not user_json: return None
        return tornado.escape.json_decode(user_json)


class MainHandler(BaseHandler):
    @tornado.web.authenticated
    def get(self):
        user = self.get_current_user()
        print("User joined chat: %s" % user)
        api_key = self.settings['cookie_secret']
        upn = user
        # Make a note that this is a quick way to generate a JS-style epoch:
        timestamp = str(int(time.time()) * 1000)
        auth_obj = {
            'api_key': api_key, # Whatever is in server.conf
            'upn': upn, # e.g. user@gmail.com
            'timestamp': timestamp,
            #'signature': <gibberish>, # We update the sig below
            'signature_method': 'HMAC-SHA1', # Won't change (for now)
            'api_version': '1.0' # Won't change (for now)
        }
        secret = 'secret' # Whatever is in server.conf for our API key
        # For this app I'm using the convenient _create_signature_v1() method
        # but it is trivial to implement the same exact thing in just about any
        # language. Here's the function (so you don't have to look it up =):
        #
        # def _create_signature(secret, *parts):
        #    hash = hmac.new(utf8(secret), digestmod=hashlib.sha1)
        #    for part in parts: hash.update(utf8(part))
        #    return utf8(hash.hexdigest())
        #
        # Real simple: HMAC-SHA1 hash the three parts using 'secret'.  The utf8
        # function just ensures that the encoding is UTF-8.  In most cases you
        # won't have to worry about stuff like that since these values will most
        # likely just be ASCII.
        signature = tornado.web._create_signature_v1(
            secret,
            api_key,
            upn,
            timestamp
        ).decode('utf-8')
        auth_obj.update({'signature': signature})
        auth = json.dumps(auth_obj)
        self.render(
            "index.html",
            messages=MessageMixin.cache,
            auth=auth
        )

class MessageMixin(object):
    waiters = set()
    cache = []
    cache_size = 200

    def wait_for_messages(self, callback, cursor=None):
        cls = MessageMixin
        if cursor:
            index = 0
            for i in xrange(len(cls.cache)):
                index = len(cls.cache) - i - 1
                if cls.cache[index]["id"] == cursor: break
            recent = cls.cache[index + 1:]
            if recent:
                callback(recent)
                return
        cls.waiters.add(callback)

    def cancel_wait(self, callback):
        cls = MessageMixin
        cls.waiters.remove(callback)

    def new_messages(self, messages):
        cls = MessageMixin
        logging.info("Sending new message to %r listeners", len(cls.waiters))
        for callback in cls.waiters:
            try:
                callback(messages)
            except:
                logging.error("Error in waiter callback", exc_info=True)
        cls.waiters = set()
        cls.cache.extend(messages)
        if len(cls.cache) > self.cache_size:
            cls.cache = cls.cache[-self.cache_size:]

class MessageNewHandler(BaseHandler, MessageMixin):
    @tornado.web.authenticated
    def post(self):
        message = {
            "id": str(uuid.uuid4()),
            "from": self.current_user,
            "body": self.get_argument("body"),
        }
        message["html"] = self.render_string("message.html", message=message)
        if self.get_argument("next", None):
            self.redirect(self.get_argument("next"))
        else:
            self.write(message)
        self.new_messages([message])

class MessageUpdatesHandler(BaseHandler, MessageMixin):
    @tornado.web.authenticated
    @tornado.web.asynchronous
    def post(self):
        cursor = self.get_argument("cursor", None)
        self.wait_for_messages(self.on_new_messages,
                               cursor=cursor)

    def on_new_messages(self, messages):
        # Closed client connection
        if self.request.connection.stream.closed():
            return
        self.finish(dict(messages=messages))

    def on_connection_close(self):
        self.cancel_wait(self.on_new_messages)

class LoginHandler(BaseHandler):
    def get(self):
        self.write('<html><body><form action="/auth/login" method="post">'
                   'Your Name: <input type="text" name="name">'
                   '<input type="submit" value="Sign in">'
                   '</form></body></html>')

    def post(self):
        user_name = self.get_argument("name")
        self.set_secure_cookie("user", tornado.escape.json_encode(user_name))
        self.redirect("/")

def main():
    tornado.options.parse_command_line()
    app = Application()
    app.listen(options.port, ssl_options={
        "certfile": os.path.join(os.getcwd(), "certificate.pem"),
        "keyfile": os.path.join(os.getcwd(), "keyfile.pem"),
    })
    print("For this to work you must add the following to Gate One's "
          "settings/20authentication.conf (under the 'gateone' section):")
    print('\n    "auth": "api"\n')
    # Using the cookie_secret as the API key here:
    print(u'You will also want to add the following to your 30api_keys.conf '
           '(or just create a new file with this info inside it):')
    print('''
{
    "*": {
        "gateone": {
            "api_keys": {
                "MjkwYzc3MDI2MjhhNGZkNDg1MjJkODgyYjBmN2MyMTM4M": "secret"
            }
        }
    }
}''')
    print("\n...and restart Gate One for the change to take effect.")
    # NOTE: Gate One will actually generate a nice and secure secret when you
    # use --new_api_key option.  Using 'secret' here to demonstrate that it can
    # be whatever you want.
    print("Listening on 0.0.0.0:%s" % options.port)
    tornado.ioloop.IOLoop.instance().start()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
