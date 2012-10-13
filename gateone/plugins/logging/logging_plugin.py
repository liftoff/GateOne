# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# NOTE:  Named logging_plugin.py instead of "logging.py" to avoid conflics with the existing logging module

# TODO: Fix the flat log viewing format.  Doesn't look quite right.
# TODO: Write search functions.
# TODO: Add some search indexing capabilities so that search will be fast.
# TODO: Add a background process that cleans up old logs.
# TODO: Write a handler that displays a page where users can drag & drop .golog files to have them played back in their browser.

__doc__ = """\
logging.py - A plugin for Gate One that provides logging-related functionality.

Hooks
-----
This Python plugin file implements the following hooks::

    hooks = {
        'WebSocket': {
            'logging_get_logs': enumerate_logs,
            'logging_get_log_flat': retrieve_log_flat,
            'logging_get_log_playback': retrieve_log_playback,
            'logging_get_log_file': save_log_playback,
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
import gzip
import time
import re
from multiprocessing import Process, Queue

# Our stuff
from gateone import BaseHandler, PLUGINS
from logviewer import flatten_log, get_frames
from termio import retrieve_first_frame, retrieve_last_frame
from termio import get_or_update_metadata
from utils import get_translation, json_encode

_ = get_translation()

# Tornado stuff
import tornado.template
import tornado.ioloop
from tornado.escape import json_decode

# TODO: Make the log retrieval functions work incrementally as logs are read so they don't have to be stored entirely in memory before being sent to the client.

# Globals
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log
PROCS = {} # For tracking/cancelling background processes
# Matches Gate One's special optional escape sequence (ssh plugin only)
RE_OPT_SSH_SEQ = re.compile(
    r'.*\x1b\]_\;(ssh\|.+?)(\x07|\x1b\\)', re.MULTILINE|re.DOTALL)
# Matches an xterm title sequence
RE_TITLE_SEQ = re.compile(
    r'.*\x1b\][0-2]\;(.+?)(\x07|\x1b\\)', re.DOTALL|re.MULTILINE)

# Helper functions
def retrieve_log_frames(golog_path, rows, cols, limit=None):
    """
    Returns the frames of *golog_path* as a list that can be used with the
    playback_log.html template.

    If *limit* is given, only return that number of frames (e.g. for preview)
    """
    out_frames = []
    from terminal import Terminal
    terminal_emulator = Terminal
    term = terminal_emulator(
        # 14/7 for the em_height should be OK for most browsers to ensure that
        # images don't always wind up at the bottom of the screen.
        rows=rows, cols=cols, em_dimensions={'height':14, 'width':7})
    for i, frame in enumerate(get_frames(golog_path)):
        if limit and i == limit:
            break
        if len(frame) > 14:
            frame_time = int(float(frame[:13]))
            frame_screen = frame[14:] # Skips the colon
            term.write(frame_screen)
            # Ensure we're not in the middle of capturing an image.  Otherwise
            # it might get cut off and result in no image being shown.
            if not term.image:
                scrollback, screen = term.dump_html()
            out_frames.append({'screen': screen, 'time': frame_time})
    return out_frames # Skip the first frame which is the metadata

# Handlers

# WebSocket commands (not the same as handlers)
def enumerate_logs(limit=None, tws=None):
    """
    Calls _enumerate_logs() via a :py:class:`multiprocessing.Process` so it
    doesn't cause the :py:class:`~tornado.ioloop.IOLoop` to block.

    Log objects will be returned to the client one at a time by sending
    'logging_log' actions to the client over the WebSocket (*tws*).
    """
    # Sometimes IOLoop detects multiple events on the fd before we've finished
    # doing a get() from the queue.  This variable is used to ensure we don't
    # send the client duplicates:
    results = []
    if tws.settings['session_logging'] == False:
        message = {'notice': _(
            "NOTE: User session logging is disabled.  To enable it, set "
            "'session_logging = True' in your server.conf.")}
        tws.write_message(message)
        return # Nothing left to do
    user = tws.get_current_user()['upn']
    users_dir = os.path.join(tws.settings['user_dir'], user) # "User's dir"
    io_loop = tornado.ioloop.IOLoop.instance()
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
        #logging.debug('message: %s' % message)
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
            message = {'logging_logs_complete': out_dict}
            tws.write_message(message)
            return
        message = json_encode(message)
        if message not in results:
            # Keep track of how many/how much
            if results:
                results.pop() # No need to keep old stuff hanging around
            results.append(message)
            tws.write_message(message)
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
        logfile = gzip.open(log_path)
        logging.debug("Getting metadata from: %s" % log_path)
        metadata = get_or_update_metadata(log_path, user)
        if not metadata:
            # Broken log file -- may be being written to
            continue # Just skip it
        metadata['size'] = os.stat(log_path).st_size
        out_dict['log'] = metadata
        message = {'logging_log': out_dict}
        queue.put(message)
        # If we go too quick sometimes the IOLoop will miss a message
        time.sleep(0.01)
    queue.put('complete')

def retrieve_log_flat(settings, tws=None):
    """
    Calls :func:`_retrieve_log_flat` via a :py:class:`multiprocessing.Process`
    so it doesn't cause the :py:class:`~tornado.ioloop.IOLoop` to block.

    :arg dict settings: A dict containing the *log_filename*, *colors*, and *theme* to use when generating the HTML output.
    :arg instance tws: The current :class:`gateone.TerminalWebSocket` instance (connected).

    Here's the details on *settings*:

    :arg settings['log_filename']: The name of the log to display.
    :arg settings['colors']: The CSS color scheme to use when generating output.
    :arg settings['theme']: The CSS theme to use when generating output.
    :arg settings['where']: Whether or not the result should go into a new window or an iframe.
    """
    settings['container'] = tws.container
    settings['prefix'] = tws.prefix
    settings['user'] = user = tws.get_current_user()['upn']
    settings['users_dir'] = os.path.join(tws.settings['user_dir'], user)
    settings['gateone_dir'] = tws.settings['gateone_dir']
    io_loop = tornado.ioloop.IOLoop.instance()
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
        tws.write_message(message)
    # This is kind of neat:  multiprocessing.Queue() instances have an
    # underlying fd that you can access via the _reader:
    io_loop.add_handler(q._reader.fileno(), send_message, io_loop.READ)
    # We tell the IOLoop to watch this fd to see if data is ready in the queue.
    PROCS[user]['process'].start()

def _retrieve_log_flat(queue, settings):
    """
    Writes the given *log_filename* to *queue* in a flat format equivalent to::

        ./logviewer.py --flat log_filename

    *settings* - A dict containing the *log_filename*, *colors*, and *theme* to
    use when generating the HTML output.
    """
    out_dict = {
        'result': "",
        'log': "",
        'metadata': {},
    }
    # Local variables
    out = []
    spanstrip = re.compile(r'\s+\<\/span\>$')
    gateone_dir = settings['gateone_dir']
    user = settings['user']
    users_dir = settings['users_dir']
    container = settings['container']
    prefix = settings['prefix']
    log_filename = settings['log_filename']
    theme = "%s.css" % settings['theme']
    colors = "%s.css" % settings['colors']
    logs_dir = os.path.join(users_dir, "logs")
    log_path = os.path.join(logs_dir, log_filename)
    if os.path.exists(log_path):
        out_dict['metadata'] = get_or_update_metadata(log_path, user)
        out_dict['metadata']['filename'] = log_filename
        out_dict['result'] = "Success"
        import StringIO
        # Use the terminal emulator to create nice HTML-formatted output
        from terminal import Terminal
        term = Terminal(rows=100, cols=300)
        io_obj = StringIO.StringIO()
        flatten_log(log_path, io_obj)
        io_obj.seek(0)
        # Needed to emulate an actual term
        flattened_log = io_obj.read().replace('\n', '\r\n')
        term.write(flattened_log)
        scrollback, screen = term.dump_html()
        # Join them together
        log_lines = scrollback + screen
        # rstrip the lines
        log_lines = [a.rstrip() for a in log_lines]
        # Fix things like "<span>whatever [lots of whitespace]    </span>"
        for i, line in enumerate(log_lines):
            out.append(spanstrip.sub("</span>", line))
        out_dict['log'] = out
    else:
        out_dict['result'] = _("ERROR: Log not found")
    message = {'logging_log_flat': out_dict}
    queue.put(message)

def retrieve_log_playback(settings, tws=None):
    """
    Calls :func:`_retrieve_log_playback` via a
    :py:class:`multiprocessing.Process` so it doesn't cause the
    :py:class:`~tornado.ioloop.IOLoop` to block.
    """
    settings['container'] = tws.container
    settings['prefix'] = tws.prefix
    settings['user'] = user = tws.get_current_user()['upn']
    settings['users_dir'] = os.path.join(tws.settings['user_dir'], user)
    settings['gateone_dir'] = tws.settings['gateone_dir']
    settings['url_prefix'] = tws.settings['url_prefix']
    io_loop = tornado.ioloop.IOLoop.instance()
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
        tws.write_message(message)
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
    :arg settings['colors']: The CSS color scheme to use when generating output.
    :arg settings['theme']: The CSS theme to use when generating output.
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
    gateone_dir = settings['gateone_dir']
    user = settings['user']
    users_dir = settings['users_dir']
    container = settings['container']
    prefix = settings['prefix']
    url_prefix = settings['url_prefix']
    log_filename = settings['log_filename']
    theme = "%s.css" % settings['theme']
    colors = "%s.css" % settings['colors']
    # Important paths
    # NOTE: Using os.path.join() in case Gate One can actually run on Windows
    # some day.
    logs_dir = os.path.join(users_dir, "logs")
    log_path = os.path.join(logs_dir, log_filename)
    templates_path = os.path.join(gateone_dir, 'templates')
    colors_path = os.path.join(templates_path, 'term_colors')
    themes_path = os.path.join(templates_path, 'themes')
    plugins_path = os.path.join(gateone_dir, 'plugins')
    logging_plugin_path = os.path.join(plugins_path, 'logging')
    template_path = os.path.join(logging_plugin_path, 'templates')
    # recording format:
    # {"screen": [log lines], "time":"2011-12-20T18:00:01.033Z"}
    # Actual method logic
    if os.path.exists(log_path):
        # First we setup the basics
        out_dict['metadata'] = get_or_update_metadata(log_path, user)
        out_dict['metadata']['filename'] = log_filename
        try:
            rows = out_dict['metadata']['rows']
            cols = out_dict['metadata']['cols']
        except KeyError:
        # Log was created before rows/cols metadata was included via termio.py
        # Use some large values to ensure nothing wraps and hope for the best:
            rows = 40
            cols = 500
        out_dict['result'] = "Success" # TODO: Add more error checking
        # Next we render the theme and color templates so we can pass them to
        # our final template
        with open(os.path.join(colors_path, colors)) as f:
            colors_file = f.read()
        colors_template = tornado.template.Template(colors_file)
        rendered_colors = colors_template.generate(
            container=container,
            prefix=prefix,
            url_prefix=url_prefix
        )
        with open(os.path.join(themes_path, theme)) as f:
            theme_file = f.read()
        theme_template = tornado.template.Template(theme_file)
        # Setup our 256-color support CSS:
        colors_256 = ""
        from gateone import COLORS_256
        for i in xrange(256):
            fg = "#%s span.fx%s {color: #%s;}" % (
                container, i, COLORS_256[i])
            bg = "#%s span.bx%s {background-color: #%s;} " % (
                container, i, COLORS_256[i])
            fg_rev = "#%s span.reverse.fx%s {background-color: #%s; color: inherit;}" % (
                container, i, COLORS_256[i])
            bg_rev = "#%s span.reverse.bx%s {color: #%s; background-color: inherit;} " % (
                container, i, COLORS_256[i])
            colors_256 += "%s %s %s %s\n" % (fg, bg, fg_rev, bg_rev)
        colors_256 += "\n"
        rendered_theme = theme_template.generate(
            container=container,
            prefix=prefix,
            colors_256=colors_256,
            url_prefix=url_prefix
        )
        # NOTE: 'colors' are customizable but colors_256 is universal.  That's
        # why they're separate.
        # Lastly we render the actual HTML template file
        # NOTE: Using Loader() directly here because I was getting strange EOF
        # errors trying to do it the other way :)
        loader = tornado.template.Loader(template_path)
        playback_template = loader.load('playback_log.html')
        preview = 'false'
        if settings['where']:
            preview = 'true'
            recording = retrieve_log_frames(log_path, rows, cols, limit=50)
        else:
            recording = retrieve_log_frames(log_path, rows, cols)
        playback_html = playback_template.generate(
            prefix=prefix,
            container=container,
            theme=rendered_theme,
            colors=rendered_colors,
            preview=preview,
            recording=json_encode(recording),
            url_prefix=url_prefix
        )
        out_dict['html'] = playback_html
    else:
        out_dict['result'] = _("ERROR: Log not found")
    message = {'logging_log_playback': out_dict}
    queue.put(message)

def save_log_playback(settings, tws=None):
    """
    Calls :func:`_save_log_playback` via a :py:class:`multiprocessing.Process`
    so it doesn't cause the :py:class:`~tornado.ioloop.IOLoop` to block.
    """
    settings['container'] = tws.container
    settings['prefix'] = tws.prefix
    settings['user'] = user = tws.get_current_user()['upn']
    settings['users_dir'] = os.path.join(tws.settings['user_dir'], user)
    settings['gateone_dir'] = tws.settings['gateone_dir']
    settings['url_prefix'] = tws.settings['url_prefix']
    q = Queue()
    global PROC
    PROC = Process(target=_save_log_playback, args=(q, settings))
    PROC.daemon = True # We don't care if this gets terminated mid-process.
    io_loop = tornado.ioloop.IOLoop.instance()
    def send_message(fd, event):
        """
        Sends the log enumeration result to the client.  Necessary because
        IOLoop doesn't pass anything other than *fd* and *event* when it handles
        file descriptor events.
        """
        io_loop.remove_handler(fd)
        message = q.get()
        tws.write_message(message)
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
    gateone_dir = settings['gateone_dir']
    user = settings['user']
    users_dir = settings['users_dir']
    container = settings['container']
    prefix = settings['prefix']
    url_prefix = settings['url_prefix']
    log_filename = settings['log_filename']
    short_logname = log_filename.split('.golog')[0]
    out_dict['filename'] = "%s.html" % short_logname
    theme = "%s.css" % settings['theme']
    colors = "%s.css" % settings['colors']
    # Important paths
    # NOTE: Using os.path.join() in case Gate One can actually run on Windows
    # some day.
    logs_dir = os.path.join(users_dir, "logs")
    log_path = os.path.join(logs_dir, log_filename)
    templates_path = os.path.join(gateone_dir, 'templates')
    colors_path = os.path.join(templates_path, 'term_colors')
    themes_path = os.path.join(templates_path, 'themes')
    plugins_path = os.path.join(gateone_dir, 'plugins')
    logging_plugin_path = os.path.join(plugins_path, 'logging')
    template_path = os.path.join(logging_plugin_path, 'templates')
    # recording format:
    # {"screen": [log lines], "time":"2011-12-20T18:00:01.033Z"}
    # Actual method logic
    if os.path.exists(log_path):
        # Next we render the theme and color templates so we can pass them to
        # our final template
        out_dict['metadata'] = get_or_update_metadata(log_path, user)
        try:
            rows = out_dict['metadata']['rows']
            cols = out_dict['metadata']['cols']
        except KeyError:
        # Log was created before rows/cols metadata was included via termio.py
        # Use some large values to ensure nothing wraps and hope for the best:
            rows = 40
            cols = 500
        with open(os.path.join(colors_path, colors)) as f:
            colors_file = f.read()
        colors_template = tornado.template.Template(colors_file)
        rendered_colors = colors_template.generate(
            container=container,
            prefix=prefix,
            url_prefix=url_prefix
        )
        with open(os.path.join(themes_path, theme)) as f:
            theme_file = f.read()
        theme_template = tornado.template.Template(theme_file)
        # Setup our 256-color support CSS:
        colors_256 = ""
        from gateone import COLORS_256
        for i in xrange(256):
            fg = "#%s span.fx%s {color: #%s;}" % (
                container, i, COLORS_256[i])
            bg = "#%s span.bx%s {background-color: #%s;} " % (
                container, i, COLORS_256[i])
            colors_256 += "%s %s" % (fg, bg)
        colors_256 += "\n"
        rendered_theme = theme_template.generate(
            container=container,
            prefix=prefix,
            colors_256=colors_256,
            url_prefix=url_prefix
        )
        # NOTE: 'colors' are customizable but colors_256 is universal.  That's
        # why they're separate.
        # Lastly we render the actual HTML template file
        # NOTE: Using Loader() directly here because I was getting strange EOF
        # errors trying to do it the other way :)
        loader = tornado.template.Loader(template_path)
        playback_template = loader.load('playback_log.html')
        recording = retrieve_log_frames(log_path, rows, cols)
        preview = 'false'
        playback_html = playback_template.generate(
            prefix=prefix,
            container=container,
            theme=rendered_theme,
            colors=rendered_colors,
            preview=preview,
            recording=json_encode(recording),
            url_prefix=url_prefix
        )
        out_dict['data'] = playback_html
    else:
        out_dict['result'] = _("ERROR: Log not found")
    message = {'save_file': out_dict}
    queue.put(message)

# Temporarily disabled while I work around the problem of gzip files not being
# downloadable over the websocket.
#def get_log_file(log_filename, tws):
    #"""
    #Returns the given *log_filename* (as a regular file) so the user can save it
    #to disk.
    #"""
    #user = tws.get_current_user()['upn']
    #logging.debug("%s: get_log_file(%s)" % (user, log_filename))
    #users_dir = os.path.join(tws.settings['user_dir'], user) # "User's dir"
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
    #tws.write_message(message)

hooks = {
    'WebSocket': {
        'logging_get_logs': enumerate_logs,
        'logging_get_log_flat': retrieve_log_flat,
        'logging_get_log_playback': retrieve_log_playback,
        'logging_get_log_file': save_log_playback,
    }
}