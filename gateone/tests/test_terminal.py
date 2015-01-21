#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2011 Liftoff Software Corporation
#

# Meta
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

"""
Tests the terminal module.  This whole thing is a huge TODO.
"""

# Import Python built-ins
import os, sys, unittest, time
from pprint import pprint
cwd = os.getcwd()
terminal_dir = os.path.abspath(os.path.join(cwd, '../'))
sys.path.append(terminal_dir)
import terminal

# Globals
ROWS = 56
COLS = 210

# Unit Tests
class Test1Coding(unittest.TestCase):
    """
    Tests for various coding issues/errors in the terminal module.
    """
    def test_1_parsing_performance(self):
        "\033[1mRunning Performance Test 1\033[0;0m"
        term = terminal.Terminal(ROWS, COLS)
        start = time.time()
        for i, x in enumerate(xrange(4)):
            with open('saved_stream.txt') as stream:
                for char in stream.read():
                    term.write(char)
            print(i)
        end = time.time()
        elapsed = end - start
        print('It took %0.2fms to process the input' % (elapsed*1000.0))
        pprint(term.dump_html())

    #def test_2_parsing_performance(self):
        #"\033[1mRunning Performance Test 2\033[0;0m"
        #term = terminal.Terminal(ROWS, COLS)
        #start = time.time()
        #with open('saved_stream.txt') as stream:
            #for i, x in enumerate(xrange(5)):
                #term.write(stream.read())
                #stream.seek(0)
                #print(i)
        #end = time.time()
        #elapsed = end - start
        #print('It took %0.2fms to process the input' % (elapsed*1000.0))



if __name__ == "__main__":
    print("Date & Time:\t\t\t%s" % time.ctime())
    unittest.main()
