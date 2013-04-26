#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#
# For license information see LICENSE.txt

# Meta
__version__ = '1.0.0'
__version_info__ = (1, 0, 0)
__license__ = "Apache 2.0 (see LICENSE.txt)"
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'


import logging

class OnOffMixin(object):
    """
    A mixin to add :func:`on`, :func:`off`, and :func:`trigger` event handling
    methods to any class.

    For an example, let's pretend we've got a basic WebSocket server that can
    perform a number of functions based on the incoming message::

        class ActionWebSocket(WebSocketHandler):
            def open(self):
                print("WebSocket opened")

            def on_message(self, message):
                if message == 'hello':
                    self.hello()
                elif message == 'ping':
                    self.pong()

            def on_close(self):
                print("WebSocket closed")

            def pong(self, timestamp):
                self.write_message('pong')

            def hello(self):
                self.write_message('Hey there!')

    This works OK for the most simple of stuff.  We could use string parsing of
    various sorts (startswith(), json, etc) to differentiate messages from each
    other but our conditionals will quickly grow into a giant mess.

    Here's a better way::

        class ActionWebSocket(WebSocketHandler, OnOffMixin):
            "Calls an appropriate 'action' based on the incoming message."
            def __init__(self): # Ignoring parent __init__() for ths example
                self.on("ping", self.pong)
                self.on("hello", self.heythere)

            def open(self):
                print("WebSocket opened")

            def on_message(self, message):
                # Assume a json-encoded dict like {"ping": null}
                message_obj = json.loads(message)
                for key, value in message_obj.items():
                    self.trigger(key, value)

            def on_close(self):
                print("WebSocket closed")

            def pong(self, timestamp):
                self.write_message('pong')

            def heythere(self):
                self.write_message('Hey there!')

    In the above example we used the `OnOffMixin` to add :func:`on`,
    :func:`off`, and :func:`trigger` methods to our `ActionWebSocket` class.
    """
    def on(self, events, callback, times=None):
        """
        Registers the given *callback* with the given *events* (string or list
        of strings) that will get called whenever the given *event* is triggered
        (using :meth:`self.trigger`).

        If *times* is given the *callback* will only be fired that many times
        before it is automatically removed from :attr:`self._on_off_events`.
        """
        # Make sure our _on_off_events dict is present (if first invokation)
        if not hasattr(self, '_on_off_events'):
            self._on_off_events = {}
        if isinstance(events, str):
            events = [events]
        callback_obj = {
            'callback': callback,
            'times': times,
            'calls': 0
        }
        for event in events:
            if event not in self._on_off_events:
                self._on_off_events.update({event: [callback_obj.copy()]})
            else:
                self._on_off_events[event].append(callback_obj.copy())

    def off(self, events, callback):
        """
        Removes the given *callback* from the given *events* (string or list of
        strings).
        """
        if isinstance(events, str):
            events = [events]
        for event in events:
            for callback_obj in self._on_off_events[event]:
                if callback_obj['callback'] == callback:
                    try:
                        del self._on_off_events[event]
                    except KeyError:
                        pass # Nothing to do

    def once(self, events, callback):
        """
        A shortcut for `self.on(events, callback, 1)`
        """
        self.on(events, callback, 1)

    def trigger(self, events, *args, **kwargs):
        """
        Fires the given *events* (string or list of strings).  All callbacks
        associated with these *events* will be called and if their respective
        objects have a *times* value set it will be used to determine when to
        remove the associated callback from the event.

        If given, callbacks associated with the given *events* will be called
        with *args* and *kwargs*.
        """
        # Make sure our _on_off_events dict is present (if first invokation)
        if not hasattr(self, '_on_off_events'):
            self._on_off_events = {}
        logging.debug("OnOffMixin.triggering event(s): %s" % events)
        if isinstance(events, str):
            events = [events]
        for event in events:
            if event in self._on_off_events:
                for callback_obj in self._on_off_events[event]:
                    try:
                        callback_obj['callback'](*args, **kwargs)
                    except TypeError:
                        logging.warning(
                            "trigger() failed trying to call %s.  Attempting to"
                            " call with automatic 'self' applied..." %
                            callback_obj['callback'].__name__)
                        callback_obj['callback'](self, *args, **kwargs)
                        logging.warning(
                            "You probably want to update your code to bind "
                            "'self' to that function using functools.partial()")
                    callback_obj['calls'] += 1
                    if callback_obj['calls'] == callback_obj['times']:
                        self.off(event, callback_obj['callback'])
