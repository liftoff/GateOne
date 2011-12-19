# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# NOTE:  Named logging_plugin.py instead of "logging.py" to avoid conflics with the existing logging module

__doc__ = """\
logging.py - A plugin for Gate One that provides logging-related functionality.
"""

# Meta
__version__ = '0.9'
__license__ = "GNU AGPLv3 or Proprietary (see LICENSE.txt)"
__version_info__ = (0, 9)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

# Python stdlib
import os
import logging
import gzip
import re
import io

# Our stuff
from gateone import BaseHandler, PLUGINS
from logviewer import flatten_log, playback_log
from utils import get_translation

_ = get_translation()

# Tornado stuff
import tornado.web
from tornado.escape import json_encode, json_decode

# Globals
SEPARATOR = u"\U000f0f0f" # The character used to separate frames in the log
RE_OPT_SEQ = re.compile(r'\x1b\]_\;(.*)(\x07|\x1b\\)', re.MULTILINE)
RE_TITLE_SEQ = re.compile(
    r'.*\x1b\][0-2]\;(.*)(\x07|\x1b\\)', re.DOTALL|re.MULTILINE)

# Helper functions
def retrieve_first_frame(golog_path):
    """
    Retrieves the first frame from the given *golog_path*.
    """
    found_first_frame = None
    frame = ""
    f = gzip.open(golog_path)
    while not found_first_frame:
        frame += f.read(1)
        if frame.decode('UTF-8', "ignore").endswith(SEPARATOR):
            # That's it; wrap this up
            found_first_frame = True
    f.close()
    return frame.decode('UTF-8', "ignore").rstrip(SEPARATOR)

def fix_metadata(golog_path, user):
    """
    Fixes the metadata inside of the golog at *golog_path*.

    NOTE:  All logs will need "fixing" the first time they're enumerated since
    they won't have an end_date.  Fortunately we only need to do this once per
    golog.
    """
    # Sadly, we have to read the whole thing into memory to do this
    golog_frames = gzip.open(golog_path).read().decode('UTF-8').split(SEPARATOR)
    golog_frames.pop() # Get rid of the last (empty) item
    # Getting the start and end dates are easy
    start_date = golog_frames[0][:13]
    end_date = golog_frames[-2][:13] # The very last is empty
    num_frames = len(golog_frames)
    version = "1.0"
    connect_string = None
    if 'ssh' in PLUGINS['py']:
        # Try to find the host that was connected to by looking for the SSH
        # plugin's special optional escape sequence.  It looks like this:
        #   "\x1b]_;ssh|%s@%s:%s\007"
        for frame in golog_frames:
            match_obj = RE_OPT_SEQ.match(frame)
            if match_obj:
                connect_string = match_obj.group(1).split('|')[1]
                break
    if not connect_string:
        # Try guessing it by looking for a title escape sequence
        for frame in golog_frames:
            match_obj = RE_TITLE_SEQ.match(frame)
            if match_obj:
                # The split() here is an attempt to remove titles like this:
                #   'someuser@somehost: ~'
                connect_string = match_obj.group(1).split(':')[0]
                break
    metadata = {
        'user': user,
        'start_date': start_date,
        'end_date': end_date,
        'frames': num_frames,
        'version': version,
        'connect_string': connect_string
    }
    first_frame = "%s:%s%s" % (start_date, json_encode(metadata), SEPARATOR)
    # Insert the new first frame
    golog_frames.insert(0, first_frame)
    # Save it
    f = gzip.open(golog_path, 'w')
    f.write(SEPARATOR.join(golog_frames).encode('UTF-8'))
    f.close()
    return metadata

# Handlers

# WebSocket commands (not the same as handlers)
def enumerate_logs(limit=None, tws=None):
    """
    Enumerates all of the user's logs and sends the client a "logging_logs"
    message with the result.

    If *limit* (int) is given, only return that number of logs.
    """
    print("Running enumerate_logs()");
    user = tws.get_current_user()['upn']
    users_dir = os.path.join(tws.settings['user_dir'], user) # "User's dir"
    logs_dir = os.path.join(users_dir, "logs")
    log_files = os.listdir(logs_dir)
    out_dict = {
        'logs': [],
        'total_bytes': 0
    }
    for log in log_files:
        metadata = {}
        log_path = os.path.join(logs_dir, log)
        logfile = gzip.open(log_path)
        # The first frame is the metadata frame (for the latest format anyway)
        first_frame = retrieve_first_frame(log_path)
        if first_frame[14:].startswith('{'):
            # This is JSON
            metadata = json_decode(first_frame[14:])
            if 'version' not in metadata:
                metadata = fix_metadata(log_path, user)
        else:
            metadata = fix_metadata(log_path, user)
        metadata['size'] = os.stat(log_path).st_size
        metadata['filename'] = log
        out_dict['total_bytes'] += metadata['size']
        out_dict['logs'].append(metadata)
    message = {'logging_logs': out_dict}
    from pprint import pprint
    pprint(message)
    tws.write_message(json_encode(message))

def retrieve_log_flat(log_filename, tws):
    """
    Returns the given *log_filename* in a flat format equivalent to::

        ./logviewer.py --flat log_filename
    """
    print("Running retrieve_log_flat()");
    user = tws.get_current_user()['upn']
    users_dir = os.path.join(tws.settings['user_dir'], user) # "User's dir"
    logs_dir = os.path.join(users_dir, "logs")
    log_files = os.listdir(logs_dir)

hooks = {
    'WebSocket': {
        'logging_get_logs': enumerate_logs,
        'logging_view_log_flat': retrieve_log_flat
    }
}
print("Loaded Logging plugin")