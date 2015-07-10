# Meta
__version__ = '1.2.0'
__version_info__ = (1, 2, 0)
__license__ = "AGPLv3" # ...or proprietary (see LICENSE.txt)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'
__commit__ = "20150624125036" # Gets replaced by git (holds the date/time)

import os
GATEONE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSIONS = {}
PERSIST = {}
# PERSIST is a generic place for applications and plugins to store stuff in a
# way that lasts between page loads.  USE RESPONSIBLY.

