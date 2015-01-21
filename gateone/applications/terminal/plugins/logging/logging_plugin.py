# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation
#
# NOTE:  Named logging_plugin.py instead of "logging.py" to avoid conflicts
#        with the existing logging module

# TODO: Fix the flat log viewing format.  Doesn't look quite right.
# TODO: Write search functions.
# TODO: Add some search indexing capabilities so that search will be fast.
# TODO: Write a handler that displays a page where users can drag & drop .golog files to have them played back in their browser.

__doc__ = """\
logging_plugin.py - A plugin for Gate One that provides logging-related
functionality.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'WebSocket': {
            'logging_get_logs': enumerate_logs,
            'logging_get_log_flat': retrieve_log_flat,
            'logging_get_log_playback': retrieve_log_playback,
            'logging_get_log_file': save_log_playback,
        },
        'Events': {
            'terminal:authenticate': send_logging_css_template
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
import logging
import time
import re
from multiprocessing import Process, Queue

# Our stuff
from gateone import GATEONE_DIR
from gateone.auth.authorization import applicable_policies
from gateone.applications.terminal.logviewer import flatten_log
from gateone.applications.terminal.logviewer import render_log_frames
from termio import get_or_update_metadata
from gateone.core.utils import json_encode
from gateone.core.locale import get_translation

_ = get_translation()

# Tornado stuff
import tornado.template
import tornado.ioloop

# TODO: Make the log retrieval functions work incrementally as logs are read so they don't have to be stored entirely in memory before being sent to the client.

# Globals
PLUGIN_PATH = os.path.split(__file__)[0] # Path to this plugin's directory
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log
PROCS = {} # For tracking/cancelling background processes
# Matches Gate One's special optional escape sequence (ssh plugin only)
RE_OPT_SSH_SEQ = re.compile(
    r'.*\x1b\]_\;(ssh\|.+?)(\x07|\x1b\\)', re.MULTILINE|re.DOTALL)
# Matches an xterm title sequence
RE_TITLE_SEQ = re.compile(
    r'.*\x1b\][0-2]\;(.+?)(\x07|\x1b\\)', re.DOTALL|re.MULTILINE)

# Helper functions
def get_256_colors(self):
    """
    Returns the rendered 256-color CSS.
    """
    colors_256_path = self.render_256_colors()
    mtime = os.stat(colors_256_path).st_mtime
    cached_filename = "%s:%s" % (colors_256_path.replace('/', '_'), mtime)
    cache_dir = self.ws.settings['cache_dir']
    cached_file_path = os.path.join(cache_dir, cached_filename)
    if os.path.exists(cached_file_path):
        with open(cached_file_path) as f:
            colors_256 = f.read()
    else:
        # Debug mode is enabled
        with open(os.path.join(cache_dir, '256_colors.css')) as f:
            colors_256 = f.read()
    return colors_256

# WebSocket commands (not the same as handlers)
def enumerate_logs(self, limit=None):
    """
    Calls _enumerate_logs() via a :py:class:`multiprocessing.Process` so it
    doesn't cause the :py:class:`~tornado.ioloop.IOLoop` to block.

    Log objects will be returned to the client one at a time by sending
    'logging_log' actions to the client over the WebSocket (*self*).
    """
    self.term_log.debug("enumerate_logs(%s, %s)" % (self, limit))
    # Sometimes IOLoop detects multiple events on the fd before we've finished
    # doing a get() from the queue.  This variable is used to ensure we don't
    # send the client duplicates:
    results = []
    # NOTE: self.policy represents the user's specific settings
    if self.policy['session_logging'] == False:
        message = {'go:notice': _(
            "NOTE: User session logging is disabled.  To enable it, set "
            "'session_logging = True' in your server.conf.")}
        self.write_message(message)
        return # Nothing left to do
    view_logs = self.policy.get('view_logs', True)
    if not view_logs:
        # TODO: Make it so that users don't even see the log viewer if they don't have this setting
        message = {'go:notice': _(
            "NOTE: Your access to the log viewer has been restricted.")}
        self.write_message(message)
        return # Nothing left to do
    user = self.current_user['upn']
    users_dir = os.path.join(self.ws.settings['user_dir'], user) # "User's dir"
    io_loop = tornado.ioloop.IOLoop.current()
    global PROCS
    if user not in PROCS:
        PROCS[user] = {}
    else: # Cancel anything that's already running
        fd = PROCS[user]['queue']._reader.fileno()
        if fd in io_loop._handlers:
            io_loop.remove_handler(fd)
        if PROCS[user]['process']:
            try:
                PROCS[user]['process'].terminate()
            except OSError:
                # process was already terminated...  Nothing to do
                pass
    PROCS[user]['queue'] = q = Queue()
    PROCS[user]['process'] = Process(
        target=_enumerate_logs, args=(q, user, users_dir, limit))
    def send_message(fd, event):
        """
        Sends the log enumeration result to the client.  Necessary because
        IOLoop doesn't pass anything other than *fd* and *event* when it handles
        file descriptor events.
        """
        message = q.get()
        #self.term_log.debug('message: %s' % message)
        if message == 'complete':
            io_loop.remove_handler(fd)
            total_bytes = 0
            logs_dir = os.path.join(users_dir, "logs")
            log_files = os.listdir(logs_dir)
            for log in log_files:
                log_path = os.path.join(logs_dir, log)
                total_bytes += os.stat(log_path).st_size
            out_dict = {
                'total_logs': len(log_files),
                'total_bytes': total_bytes
            }
            # This signals to the client that we're done
            message = {'terminal:logging_logs_complete': out_dict}
            self.write_message(message)
            return
        message = json_encode(message)
        if message not in results:
            # Keep track of how many/how much
            if results:
                results.pop() # No need to keep old stuff hanging around
            results.append(message)
            self.write_message(message)
    # This is kind of neat:  multiprocessing.Queue() instances have an
    # underlying fd that you can access via the _reader:
    io_loop.add_handler(q._reader.fileno(), send_message, io_loop.READ)
    # We tell the IOLoop to watch this fd to see if data is ready in the queue.
    PROCS[user]['process'].start()

def _enumerate_logs(queue, user, users_dir, limit=None):
    """
    Enumerates all of the user's logs and sends the client a "logging_logs"
    message with the result.

    If *limit* is given, only return the specified logs.  Works just like
    `MySQL <http://en.wikipedia.org/wiki/MySQL>`_: limit="5,10" will retrieve
    logs 5-10.
    """
    logs_dir = os.path.join(users_dir, "logs")
    log_files = os.listdir(logs_dir)
    log_files = [a for a in log_files if a.endswith('.golog')] # Only gologs
    log_files.sort() # Should put them in order by date
    log_files.reverse() # Make the newest ones first
    out_dict = {}
    for log in log_files:
        log_path = os.path.join(logs_dir, log)
        logging.debug("Getting metadata from: %s" % log_path)
        try:
            metadata = get_or_update_metadata(log_path, user)
        except EOFError:
            continue # Something wrong with this log; skip
        if not metadata:
            # Broken log file -- may be being written to
            continue # Just skip it
        metadata['size'] = os.stat(log_path).st_size
        out_dict['log'] = metadata
        message = {'terminal:logging_log': out_dict}
        queue.put(message)
        # If we go too quick sometimes the IOLoop will miss a message
        time.sleep(0.01)
    queue.put('complete')

def retrieve_log_flat(self, settings):
    """
    Calls :func:`_retrieve_log_flat` via a :py:class:`multiprocessing.Process`
    so it doesn't cause the :py:class:`~tornado.ioloop.IOLoop` to block.

    :arg dict settings: A dict containing the *log_filename*, *colors*, and *theme* to use when generating the HTML output.

    Here's the details on *settings*:

    :arg settings['log_filename']: The name of the log to display.
    :arg settings['colors']: The CSS color scheme to use when generating output.
    :arg settings['theme']: The CSS theme to use when generating output.
    :arg settings['where']: Whether or not the result should go into a new window or an iframe.
    """
    settings['container'] = self.ws.container
    settings['prefix'] = self.ws.prefix
    settings['user'] = user = self.current_user['upn']
    settings['users_dir'] = os.path.join(self.ws.settings['user_dir'], user)
    settings['gateone_dir'] = GATEONE_DIR
    settings['256_colors'] = get_256_colors(self)
    io_loop = tornado.ioloop.IOLoop.current()
    global PROCS
    if user not in PROCS:
        PROCS[user] = {}
    else: # Cancel anything that's already running
        fd = PROCS[user]['queue']._reader.fileno()
        if fd in io_loop._handlers:
            io_loop.remove_handler(fd)
        if PROCS[user]['process']:
            try:
                PROCS[user]['process'].terminate()
            except OSError:
                # process was already terminated...  Nothing to do
                pass
    PROCS[user]['queue'] = q = Queue()
    PROCS[user]['process'] = Process(
        target=_retrieve_log_flat, args=(q, settings))
    def send_message(fd, event):
        """
        Sends the log enumeration result to the client.  Necessary because
        IOLoop doesn't pass anything other than *fd* and *event* when it handles
        file descriptor events.
        """
        io_loop.remove_handler(fd)
        message = q.get()
        self.write_message(message)
    # This is kind of neat:  multiprocessing.Queue() instances have an
    # underlying fd that you can access via the _reader:
    io_loop.add_handler(q._reader.fileno(), send_message, io_loop.READ)
    # We tell the IOLoop to watch this fd to see if data is ready in the queue.
    PROCS[user]['process'].start()

def _retrieve_log_flat(queue, settings):
    """
    Writes the given *log_filename* to *queue* in a flat format equivalent to::

        ./logviewer.py --flat log_filename

    *settings* - A dict containing the *log_filename*, *colors_css*, and
    *theme_css* to use when generating the HTML output.
    """
    out_dict = {
        'result': "",
        'log': "",
        'metadata': {},
    }
    # Local variables
    out = []
    spanstrip = re.compile(r'\s+\<\/span\>$')
    user = settings['user']
    users_dir = settings['users_dir']
    log_filename = settings['log_filename']
    logs_dir = os.path.join(users_dir, "logs")
    log_path = os.path.join(logs_dir, log_filename)
    if os.path.exists(log_path):
        out_dict['metadata'] = get_or_update_metadata(log_path, user)
        out_dict['metadata']['filename'] = log_filename
        out_dict['result'] = "Success"
        from io import BytesIO
        # Use the terminal emulator to create nice HTML-formatted output
        from terminal import Terminal
        term = Terminal(rows=100, cols=300, em_dimensions=0)
        io_obj = BytesIO()
        flatten_log(log_path, io_obj)
        io_obj.seek(0)
        # Needed to emulate an actual term
        flattened_log = io_obj.read().replace(b'\n', b'\r\n')
        # NOTE: Using chunking below to emulate how a stream might actually be
        # written to the terminal emulator.  This is to prevent the emulator
        # from thinking that any embedded files (like PDFs) are never going to
        # end.
        def chunker(s, n):
            """Produce `n`-character chunks from `s`."""
            for start in range(0, len(s), n):
                yield s[start:start+n]
        for chunk in chunker(flattened_log, 499):
            term.write(chunk)
        scrollback, screen = term.dump_html()
        # Join them together
        log_lines = scrollback + screen
        # rstrip the lines
        log_lines = [a.rstrip() for a in log_lines]
        # Fix things like "<span>whatever [lots of whitespace]    </span>"
        for i, line in enumerate(log_lines):
            out.append(spanstrip.sub("</span>", line))
        out_dict['log'] = out
        term.clear_screen() # Ensure the function below works...
        term.close_captured_fds() # Force clean up open file descriptors
    else:
        out_dict['result'] = _("ERROR: Log not found")
    message = {'terminal:logging_log_flat': out_dict}
    queue.put(message)

def retrieve_log_playback(self, settings):
    """
    Calls :func:`_retrieve_log_playback` via a
    :py:class:`multiprocessing.Process` so it doesn't cause the
    :py:class:`~tornado.ioloop.IOLoop` to block.
    """
    settings['container'] = self.ws.container
    settings['prefix'] = self.ws.prefix
    settings['user'] = user = self.current_user['upn']
    settings['users_dir'] = os.path.join(self.ws.settings['user_dir'], user)
    settings['gateone_dir'] = GATEONE_DIR
    settings['256_colors'] = get_256_colors(self)
    io_loop = tornado.ioloop.IOLoop.current()
    global PROCS
    if user not in PROCS:
        PROCS[user] = {}
    else: # Cancel anything that's already running
        fd = PROCS[user]['queue']._reader.fileno()
        if fd in io_loop._handlers:
            io_loop.remove_handler(fd)
        if PROCS[user]['process']:
            try:
                PROCS[user]['process'].terminate()
            except OSError:
                # process was already terminated...  Nothing to do
                pass
    PROCS[user]['queue'] = q = Queue()
    PROCS[user]['process'] = Process(
        target=_retrieve_log_playback, args=(q, settings))
    def send_message(fd, event):
        """
        Sends the log enumeration result to the client.  Necessary because
        IOLoop doesn't pass anything other than *fd* and *event* when it handles
        file descriptor events.
        """
        io_loop.remove_handler(fd)
        message = q.get()
        self.write_message(message)
    # This is kind of neat:  multiprocessing.Queue() instances have an
    # underlying fd that you can access via the _reader:
    io_loop.add_handler(q._reader.fileno(), send_message, io_loop.READ)
    PROCS[user]['process'].start()

def _retrieve_log_playback(queue, settings):
    """
    Writes a JSON-encoded message to the client containing the log in a
    self-contained HTML format similar to::

        ./logviewer.py log_filename

    *settings* - A dict containing the *log_filename*, *colors*, and *theme* to
    use when generating the HTML output.

    :arg settings['log_filename']: The name of the log to display.
    :arg settings['colors_css']: The CSS color scheme to use when generating output.
    :arg settings['theme_css']: The entire CSS theme <style> to use when generating output.
    :arg settings['where']: Whether or not the result should go into a new window or an iframe.

    The output will look like this::

        {
            'result': "Success",
            'log': <HTML rendered output>,
            'metadata': {<metadata of the log>}
        }

    It is expected that the client will create a new window with the result of
    this method.
    """
    #print("Running retrieve_log_playback(%s)" % settings);
    if 'where' not in settings: # Avoids a KeyError if it is missing
        settings['where'] = None
    out_dict = {
        'result': "",
        'html': "", # Will be replace with the rendered template
        'metadata': {},
        'where': settings['where'] # Just gets passed as-is back to the client
    }
    # Local variables
    user = settings['user']
    users_dir = settings['users_dir']
    container = settings['container']
    prefix = settings['prefix']
    log_filename = settings['log_filename']
    # Important paths
    # NOTE: Using os.path.join() in case Gate One can actually run on Windows
    # some day.
    logs_dir = os.path.join(users_dir, "logs")
    log_path = os.path.join(logs_dir, log_filename)
    template_path = os.path.join(PLUGIN_PATH, 'templates')
    # recording format:
    # {"screen": [log lines], "time":"2011-12-20T18:00:01.033Z"}
    # Actual method logic
    if os.path.exists(log_path):
        # First we setup the basics
        out_dict['metadata'] = get_or_update_metadata(log_path, user)
        out_dict['metadata']['filename'] = log_filename
        try:
            rows = out_dict['metadata']['rows']
            cols = out_dict['metadata']['columns']
        except KeyError:
        # Log was created before rows/cols metadata was included via termio.py
        # Use some large values to ensure nothing wraps and hope for the best:
            rows = 40
            cols = 500
        out_dict['result'] = "Success" # TODO: Add more error checking
        # NOTE: Using Loader() directly here because I was getting strange EOF
        # errors trying to do it the other way :)
        loader = tornado.template.Loader(template_path)
        playback_template = loader.load('playback_log.html')
        preview = 'false'
        if settings['where']:
            preview = 'true'
            recording = render_log_frames(log_path, rows, cols, limit=50)
        else:
            recording = render_log_frames(log_path, rows, cols)
        playback_html = playback_template.generate(
            prefix=prefix,
            container=container,
            theme=settings['theme_css'],
            colors=settings['colors_css'],
            colors_256=settings['256_colors'],
            preview=preview,
            recording=json_encode(recording)
        )
        if not isinstance(playback_html, str):
            playback_html = playback_html.decode('utf-8')
        out_dict['html'] = playback_html
    else:
        out_dict['result'] = _("ERROR: Log not found")
    message = {'terminal:logging_log_playback': out_dict}
    queue.put(message)

def save_log_playback(self, settings):
    """
    Calls :func:`_save_log_playback` via a :py:class:`multiprocessing.Process`
    so it doesn't cause the :py:class:`~tornado.ioloop.IOLoop` to block.
    """
    settings['container'] = self.ws.container
    settings['prefix'] = self.ws.prefix
    settings['user'] = user = self.current_user['upn']
    settings['users_dir'] = os.path.join(self.ws.settings['user_dir'], user)
    settings['gateone_dir'] = GATEONE_DIR
    settings['256_colors'] = get_256_colors(self)
    q = Queue()
    global PROC
    PROC = Process(target=_save_log_playback, args=(q, settings))
    PROC.daemon = True # We don't care if this gets terminated mid-process.
    io_loop = tornado.ioloop.IOLoop.current()
    def send_message(fd, event):
        """
        Sends the log enumeration result to the client.  Necessary because
        IOLoop doesn't pass anything other than *fd* and *event* when it handles
        file descriptor events.
        """
        io_loop.remove_handler(fd)
        message = q.get()
        self.write_message(message)
    # This is kind of neat:  multiprocessing.Queue() instances have an
    # underlying fd that you can access via the _reader:
    io_loop.add_handler(q._reader.fileno(), send_message, io_loop.READ)
    PROC.start()
    return

def _save_log_playback(queue, settings):
    """
    Writes a JSON-encoded message to the client containing the log in a
    self-contained HTML format similar to::

        ./logviewer.py log_filename

    The difference between this function and :py:meth:`_retrieve_log_playback`
    is that this one instructs the client to save the file to disk instead of
    opening it in a new window.

    :arg settings['log_filename']: The name of the log to display.
    :arg settings['colors']: The CSS color scheme to use when generating output.
    :arg settings['theme']: The CSS theme to use when generating output.
    :arg settings['where']: Whether or not the result should go into a new window or an iframe.

    The output will look like this::

        {
            'result': "Success",
            'data': <HTML rendered output>,
            'mimetype': 'text/html'
            'filename': <filename of the log recording>
        }

    It is expected that the client will create a new window with the result of
    this method.
    """
    #print("Running retrieve_log_playback(%s)" % settings);
    out_dict = {
        'result': "Success",
        'mimetype': 'text/html',
        'data': "", # Will be replace with the rendered template
    }
    # Local variables
    user = settings['user']
    users_dir = settings['users_dir']
    container = settings['container']
    prefix = settings['prefix']
    log_filename = settings['log_filename']
    short_logname = log_filename.split('.golog')[0]
    out_dict['filename'] = "%s.html" % short_logname
    # Important paths
    logs_dir = os.path.join(users_dir, "logs")
    log_path = os.path.join(logs_dir, log_filename)
    #templates_path = os.path.join(gateone_dir, 'templates')
    #colors_path = os.path.join(templates_path, 'term_colors')
    #themes_path = os.path.join(templates_path, 'themes')
    template_path = os.path.join(PLUGIN_PATH, 'templates')
    # recording format:
    # {"screen": [log lines], "time":"2011-12-20T18:00:01.033Z"}
    # Actual method logic
    if os.path.exists(log_path):
        # Next we render the theme and color templates so we can pass them to
        # our final template
        out_dict['metadata'] = get_or_update_metadata(log_path, user)
        try:
            rows = out_dict['metadata']['rows']
            cols = out_dict['metadata']['columns']
        except KeyError:
        # Log was created before rows/cols metadata was included via termio.py
        # Use some large values to ensure nothing wraps and hope for the best:
            rows = 40
            cols = 500
        # NOTE: 'colors' are customizable but colors_256 is universal.  That's
        # why they're separate.
        # Lastly we render the actual HTML template file
        # NOTE: Using Loader() directly here because I was getting strange EOF
        # errors trying to do it the other way :)
        loader = tornado.template.Loader(template_path)
        playback_template = loader.load('playback_log.html')
        recording = render_log_frames(log_path, rows, cols)
        preview = 'false'
        playback_html = playback_template.generate(
            prefix=prefix,
            container=container,
            theme=settings['theme_css'],
            colors=settings['colors_css'],
            colors_256=settings['256_colors'],
            preview=preview,
            recording=json_encode(recording),
        )
        out_dict['data'] = playback_html
    else:
        out_dict['result'] = _("ERROR: Log not found")
    message = {'go:save_file': out_dict}
    queue.put(message)

# Temporarily disabled while I work around the problem of gzip files not being
# downloadable over the websocket.
#def get_log_file(self, log_filename):
    #"""
    #Returns the given *log_filename* (as a regular file) so the user can save it
    #to disk.
    #"""
    #user = self.current_user['upn']
    #logging.debug("%s: get_log_file(%s)" % (user, log_filename))
    #users_dir = os.path.join(self.ws.settings['user_dir'], user) # "User's dir"
    #users_log_dir = os.path.join(users_dir, 'logs')
    #log_path = os.path.join(users_log_dir, log_filename)
    #out_dict = {'result': 'Success'}
    #if os.path.exists(log_path):
        #with open(log_path) as f:
            #out_dict['data'] = f.read()
    #else:
        #out_dict['result'] = _(
            #'SSH Plugin Error: Log not found at %s' % log_path)
    #message = {'save_file': out_dict}
    #self.write_message(message)

def session_logging_check(self):
    """
    Attached to the `terminal:session_logging_check` WebSocket action; replies
    with `terminal:logging_sessions_disabled` if terminal session logging is
    disabled.

    .. note::

        The `terminal:logging_sessions_disabled` message just has the client
        remove the "Log Viewer" button so they don't get confused with an
        always-empty log viewer.
    """
    policy = applicable_policies(
        'terminal', self.current_user, self.ws.prefs)
    session_logging = policy.get('session_logging', True)
    if not session_logging:
        message = {'terminal:logging_sessions_disabled': True}
        self.write_message(message)

def send_logging_css_template(self):
    """
    Sends our logging.css template to the client using the 'load_style'
    WebSocket action.  The rendered template will be saved in Gate One's
    'cache_dir'.
    """
    css_path = os.path.join(PLUGIN_PATH, 'templates', 'logging.css')
    self.ws.render_and_send_css(css_path)

hooks = {
    'WebSocket': {
        'terminal:logging_get_logs': enumerate_logs,
        'terminal:logging_get_log_flat': retrieve_log_flat,
        'terminal:logging_get_log_playback': retrieve_log_playback,
        'terminal:logging_get_log_file': save_log_playback,
        'terminal:session_logging_check': session_logging_check,
    },
    'Events': {
        'terminal:authenticate': send_logging_css_template
    }
}
