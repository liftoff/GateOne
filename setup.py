#!/usr/bin/env python
# -*- coding: utf-8 -*-

from distutils.core import setup
import sys, os

# Globals
POSIX = 'posix' in sys.builtin_module_names
version = '0.9'
# Some paths we can reference
setup_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join('gateone', 'static')
plugins_dir = os.path.join('gateone', 'plugins')
templates_dir = os.path.join('gateone', 'templates')
docs_dir = os.path.join('gateone', 'docs')
tests_dir = os.path.join('gateone', 'tests')
i18n_dir = os.path.join('gateone', 'i18n')

if POSIX:
    prefix = '/opt'
else:
    prefix = os.environ['PROGRAMFILES']
print("Gate One will be installed in %s" % prefix)

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
        #print("final path: %s" % final_path)
        for fname in filenames:
            file_path = os.path.join(dirpath, fname)
            thesefiles.append(file_path)
        out.append((final_path, thesefiles))
    return out

# Take care of our data files
# Yes, we're treating Python files as data files. Why bother?  Because users are
# familiar with the setup.py method *and* it can create .rpm files for us (among
# other things).  Gate One is not a module, after all.
gateone_files=[ # Start with the basics...
    (os.path.join(prefix, 'gateone'), [
        os.path.join('gateone', 'auth.py'),
        os.path.join('gateone', 'gateone.py'),
        os.path.join('gateone', 'logviewer.py'),
        os.path.join('gateone', 'sso.py'),
        os.path.join('gateone', 'terminal.py'),
        os.path.join('gateone', 'termio.py'),
        os.path.join('gateone', 'utils.py'),
        os.path.join('gateone', 'authpam.py'),
        os.path.join('gateone', 'remote_syslog.py'),
        'README.rst',
        'LICENSE.txt',
        'babel_gateone.cfg'
    ])
]
static_files = walk_data_files(static_dir)
template_files = walk_data_files(templates_dir)
docs_files = walk_data_files(docs_dir)
plugin_files = walk_data_files(plugins_dir)
test_files = walk_data_files(tests_dir)
i18n_files = walk_data_files(i18n_dir)
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
    keywords = (
        'web administration terminal vt100 xterm emulation html5 console '
        'web-to-host'),
    url = "http:/liftoffsoftware.com/Products/GateOne",
    author = 'Dan McDougall',
    author_email = 'daniel.mcdougall@liftoffsoftware.com',
    requires=["tornado (>=2.2)"],
    provides = ['gateone'],
    data_files = data_files,
)