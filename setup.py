#!/usr/bin/env python
# -*- coding: utf-8 -*-

from distutils.core import setup
import sys, os

# Globals
POSIX = 'posix' in sys.builtin_module_names
version = '1.1'
setup_dir = os.path.dirname(os.path.abspath(__file__))
major, minor = sys.version_info[:2] # Python version
if major == 2 and minor <=5:
    print("Gate One requires Python 2.6+.  You are running %s" % sys.version)
    sys.exit(1)
if major == 3:
    try:
        import lib2to3 # Just a check--the module is not actually used
    except ImportError:
        print("Python 3.X support requires the 2to3 tool.")
        sys.exit(1)

# Some paths we can reference
static_dir = os.path.join(setup_dir, 'gateone', 'static')
plugins_dir = os.path.join(setup_dir, 'gateone', 'plugins')
templates_dir = os.path.join(setup_dir, 'gateone', 'templates')
docs_dir = os.path.join(setup_dir, 'gateone', 'docs')
tests_dir = os.path.join(setup_dir, 'gateone', 'tests')
i18n_dir = os.path.join(setup_dir, 'gateone', 'i18n')
combined_js = os.path.join(static_dir, 'combined_plugins.js')
with open(combined_js, 'w') as f:
    f.write('// This forces the file to be recreated')

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
        shortened_path = dirpath.split(setup_dir)[1][1:]
        final_path = os.path.join(install_path, shortened_path)
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
        os.path.join(setup_dir, 'gateone', 'auth.py'),
        os.path.join(setup_dir, 'gateone', 'gateone.py'),
        os.path.join(setup_dir, 'gateone', 'logviewer.py'),
        os.path.join(setup_dir, 'gateone', 'sso.py'),
        os.path.join(setup_dir, 'gateone', 'terminal.py'),
        os.path.join(setup_dir, 'gateone', 'termio.py'),
        os.path.join(setup_dir, 'gateone', 'utils.py'),
        os.path.join(setup_dir, 'gateone', 'authpam.py'),
        os.path.join(setup_dir, 'gateone', 'remote_syslog.py'),
        os.path.join(setup_dir, 'README.rst'),
        os.path.join(setup_dir, 'LICENSE.txt'),
        os.path.join(setup_dir, 'babel_gateone.cfg')
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
        'Gate One is a web-based terminal emulator and SSH client that requires'
        ' no browser plugins and includes many unique and advanced features.'),
    classifiers = [
        "Development Status :: 5 - Production/Stable",
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
    data_files = data_files
)

# Python3 support stuff is below
def fix_shebang(filepath):
    """
    Swaps 'python' for 'python3' in the shebang (if present) in the given
    *filepath*.
    """
    contents = []
    with open(filepath, 'r') as f:
        contents = f.readlines()
    if contents and contents[0].startswith('#!'): # Shebang
        with open(filepath, 'w') as f:
            contents[0] = contents[0].replace('python', 'python3')
            f.write("".join(contents))

if major == 3:
    from subprocess import getstatusoutput
    command = "2to3 -w -n -x print -x dict -x input %s"
    for (dirpath, dirs, filenames) in os.walk(os.path.join(prefix, 'gateone')):
        for f in filenames:
            if f.endswith('.py'):
                filepath = os.path.join(dirpath, f)
                print("Converting to python3: %s" % filepath)
                # Fix the shebang if present
                fix_shebang(filepath)
                retcode, output = getstatusoutput(command % filepath)