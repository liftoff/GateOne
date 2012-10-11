#!/usr/bin/env python

__version__ = '1.0'
__license__ = "Apache 2.0" # Do what you want with this code but don't sue me :)
__version_info__ = (1, 0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
hello_embedded
==============
This is a self-running tutorial demonstrating how to embed Gate One into any
given web application.  Simply run ./hello_embedded.py and connect to it in your
web browser.  If your Gate One server is running on the same host you can
change the port by passing, '--port=<something other than 443>' as a command
line argument to hello_embedded.py.

The code that makes up hello_embedded.py is just a boilerplate Tornado web
server.  All the interesting parts are contained in the static/index.html
directory.

.. note:: Why not just put the tutorial in the regular Gate One docs?  Because in order for the tutorial to work it must be run from a web server (file:// URLs won't work).  Gate One's documentation is made to work completely offline (you can even make a PDF out of it).
"""

import os, sys

import tornado.httpserver
import tornado.ioloop
import tornado.options
import tornado.web

from tornado.options import define, options

define("port", default=443, help="Listen on this port", type=int)
define("address", default='127.0.0.1', help="Listen on this address", type=str)

class MainHandler(tornado.web.RequestHandler):
    def get(self):
        index_html = open('static/index.html').read()
        self.write(index_html)

def main():
    tornado.options.parse_command_line()
    application = tornado.web.Application([
            (r"/", MainHandler),
        ],
        static_path=os.path.join(os.path.dirname(__file__), "static"),
        debug=True
    )
    https_server = tornado.httpserver.HTTPServer(
        application, ssl_options={
        "certfile": os.path.join(os.getcwd(), "certificate.pem"),
        "keyfile": os.path.join(os.getcwd(), "keyfile.pem"),
    })
    print("Now listening on https://%s:%s" % (options.address, options.port))
    https_server.listen(address=options.address, port=options.port)
    tornado.ioloop.IOLoop.instance().start()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
