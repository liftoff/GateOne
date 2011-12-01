#!/usr/bin/env python
# -*- coding: utf-8 -*-

from distutils.core import setup
import sys, os

version = '0.9'
prefix = '/opt'
for arg in sys.argv:
    if arg.startswith('--prefix') or arg.startswith('--home'):
        prefix = arg.split('=')[1]

def walk_data_files(path, install_path=prefix):
    """
    Walks *path* and returns a list suitable for use in data_files.
    *install_path* will be used as the base installation path of the output.

    NOTE: Ignores .git directories.
    """
    out = []
    for (dirpath, dirs, filenames) in os.walk(path):
        if ".git" in dirs:
            del dirs[dirs.index(".git")]
        thesefiles = []
        final_path = os.path.join(install_path, dirpath)
        print("final path: %s" % final_path)
        for fname in filenames:
            file_path = os.path.join(dirpath, fname)
            thesefiles.append(file_path)
        out.append((final_path, thesefiles))
    return out

# Take care of our data files
gateone_files=[ # Start with the basics...
    (prefix + '/gateone', [
        'gateone/auth.py',      # Yes, we're treating Python files as data files
        'gateone/gateone.py',   # ...because Gate One is not a module.
        'LICENSE.txt',          # Why bother?  Because users are familiar with
        'gateone/logviewer.py', # the setup.py method *and* it can create .rpm
        'gateone/sso.py',       # files for us (among other things).
        'gateone/terminal.py',
        'gateone/termio.py',
        'gateone/utils.py',
        'gateone/authpam.py',
        'README.rst',
        'babel_gateone.cfg'
    ])
]
static_files = walk_data_files('gateone/static')
template_files = walk_data_files('gateone/templates')
docs_files = walk_data_files('gateone/docs')
plugin_files = walk_data_files('gateone/plugins')
test_files = walk_data_files('gateone/tests')
i18n_files = walk_data_files('gateone/i18n')
# Put it all together
data_files = (
    gateone_files +
    static_files +
    template_files +
    docs_files +
    plugin_files +
    test_files +
    i18n_files
)

setup(
    name = 'gateone',
    license = 'AGPLv3 or Proprietary',
    version = version,
    description = 'Web-based Terminal Emulator and SSH Client',
    long_description = (
        'Gate One is a web-based terminal emulator and SSH client with many '
        'unique and advanced features.'),
    classifiers = [
    "Development Status : 4 - Beta",
    "Operating System :: Unix",
    "Environment :: Console",
    "Environment :: Web Environment",
    "Intended Audience :: End Users/Desktop",
    "Intended Audience :: Developers",
    "Intended Audience :: System Administrators",
    # NOTE: Wish there was a "Tornado" framework option
    "Programming Language :: Python :: 2.6",
    "License :: OSI Approved :: GNU Affero General Public License v3",
    "License :: Other/Proprietary License",
    "Topic :: Internet :: WWW/HTTP",
    "Topic :: Terminals"
    ], # Get strings from http://pypi.python.org/pypi?%3Aaction=list_classifiers
    keywords = 'web administration terminal vt100 xterm emulation',
    url = "http:/liftoffsoftware.com/",
    author = 'Dan McDougall',
    author_email = 'daniel.mcdougall@liftoffsoftware.com',
    requires=["tornado (>=2.1)"],
    provides = ['gateone'],
    data_files = data_files,
)