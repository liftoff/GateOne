#!/usr/bin/env python

import os

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
    main()
