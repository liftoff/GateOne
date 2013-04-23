#!/usr/bin/env python
# -*- coding: utf-8 -*-

# TODO: Get this to be more intelligent about dependencies...
#       * It should try to automatically install things like html5lib
#       * We should also add a mechansim for plugins to mark things as dependencies.

from distutils.core import setup
import sys, os, shutil
try:
    from commands import getstatusoutput
except ImportError: # Python 3
    from subprocess import getstatusoutput
try:
   from distutils.command.build_py import build_py_2to3 as build_py
except ImportError:
   from distutils.command.build_py import build_py

# Globals
PYTHON3 = False
POSIX = 'posix' in sys.builtin_module_names
version = '1.2.0'
extra = {}
major, minor = sys.version_info[:2] # Python version
if major == 2 and minor <=5:
    print("Gate One requires Python 2.6+.  You are running %s" % sys.version)
    sys.exit(1)
if major == 3:
    from setuptools import setup
    PYTHON3 = True
    extra['use_2to3'] = True
    try:
        import lib2to3 # Just a check--the module is not actually used
    except ImportError:
        print("Python 3.X support requires the 2to3 tool.")
        sys.exit(1)

# Some paths we can reference
setup_dir = os.path.dirname(os.path.abspath(__file__))
build_dir = os.path.join(setup_dir, 'build')
if not os.path.exists(build_dir):
    # Make the build dir a little early so we can use it as a temporary place
    # to store build files
    os.mkdir(build_dir)
static_dir = os.path.join(setup_dir, 'gateone', 'static')
plugins_dir = os.path.join(setup_dir, 'gateone', 'plugins')
applications_dir = os.path.join(setup_dir, 'gateone', 'applications')
templates_dir = os.path.join(setup_dir, 'gateone', 'templates')
docs_dir = os.path.join(setup_dir, 'gateone', 'docs')
tests_dir = os.path.join(setup_dir, 'gateone', 'tests')
i18n_dir = os.path.join(setup_dir, 'gateone', 'i18n')
settings_dir = os.path.join(setup_dir, 'gateone', 'settings')

if POSIX:
    prefix = '/opt'
else: # FUTURE
    prefix = os.environ['PROGRAMFILES']

for arg in sys.argv:
    if arg.startswith('--prefix') or arg.startswith('--home'):
        prefix = arg.split('=')[1]
print("Gate One will be installed in %s/gateone" % prefix)

def walk_data_files(path, install_path=prefix):
    """
    Walks *path* and returns a list suitable for use in data_files.
    *install_path* will be used as the base installation path of the output.

    NOTE: Ignores .git directories and .pyc/.pyo files.
    """
    out = []
    for (dirpath, dirs, filenames) in os.walk(path):
        if ".git" in dirs:
            del dirs[dirs.index(".git")]
        thesefiles = []
        shortened_path = dirpath.split(setup_dir)[1][1:]
        final_path = os.path.join(install_path, shortened_path)
        for fname in filenames:
            if fname.endswith('.pyc') or fname.endswith('.pyo'):
                continue # Skip it
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
        os.path.join(setup_dir, 'gateone', 'gopam.py'),
        os.path.join(setup_dir, 'gateone', 'logviewer.py'),
        os.path.join(setup_dir, 'gateone', 'sso.py'),
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
application_files = walk_data_files(applications_dir)
test_files = walk_data_files(tests_dir)
i18n_files = walk_data_files(i18n_dir)
settings_files = walk_data_files(settings_dir)

# Detect appropriate init script and make sure it is put in the right place
init_script = []
conf_file = [] # Only used on Gentoo
debian_script = os.path.join(setup_dir, 'scripts/init/gateone-debian.sh')
redhat_script = os.path.join(setup_dir, 'scripts/init/gateone-redhat.sh')
gentoo_script = os.path.join(setup_dir, 'scripts/init/gateone-gentoo.sh')
temp_script_path = os.path.join(setup_dir, 'build/gateone')
temp_confd_path = os.path.join(setup_dir, 'build/gateone')
if os.path.exists('/etc/debian_version'):
    shutil.copy(debian_script, temp_script_path)
elif os.path.exists('/etc/redhat-release'):
    shutil.copy(redhat_script, temp_script_path)
elif os.path.exists('/etc/gentoo-release'):
    shutil.copy(gentoo_script, temp_script_path)
    conf_file = [('/etc/conf.d', [
        os.path.join(setup_dir, 'scripts/conf/gateone')
    ])]

if os.path.exists(temp_script_path):
    init_script = [('/etc/init.d', [
        temp_script_path
    ])]

# Put it all together
data_files = (
    gateone_files +
    static_files +
    template_files +
    docs_files +
    plugin_files +
    application_files +
    test_files +
    i18n_files +
    settings_files +
    init_script +
    conf_file
)

# In the newer version of Gate One these plugins were moved under the terminal
# application's own plugin directory...
relocate_plugins = [
    'bookmarks',
    'convenience',
    'example',
    'logging',
    'mobile',
    'notice',
    'playback',
    'ssh'
]
# NOTE:  Eventually this logic will go away.
for plugin in relocate_plugins:
    old_plugin_loc = os.path.join(prefix, 'gateone', 'plugins', plugin)
    new_plugin_loc = os.path.join(prefix,
                        'gateone', 'applications', 'terminal', 'plugins')
    if os.path.exists(old_plugin_loc):
        try:
            print("Relocating Terminal-specific plugin %s to %s" % (
                plugin, new_plugin_loc))
            shutil.move(old_plugin_loc, new_plugin_loc)
        except:
            print("Error moving %s to %s.  You'll have to DIY." % (
                old_plugin_loc, new_plugin_loc))

# NOTE:  Eventually this logic will go away too.
# Remove the old go_process.js Web Worker file (it has been moved into terminal)
old_webworker_loc = os.path.join(prefix, 'gateone', 'static', 'go_process.js')
if os.path.exists(old_webworker_loc):
    # Just keeping things tidy
    os.remove(old_webworker_loc)

old_termio_path = os.path.join(prefix, 'gateone', 'termio.py')
if os.path.exists(old_termio_path):
    os.remove(old_termio_path)
    try:
        os.remove(old_termio_path+'c') # termio.pyc
    except Exception:
        pass

old_terminal_path = os.path.join(prefix, 'gateone', 'terminal.py')
if os.path.exists(old_terminal_path):
    os.remove(old_terminal_path)
    try:
        os.remove(old_terminal_path+'c') # termio.pyc
    except Exception:
        pass

old_onoff_path = os.path.join(prefix, 'gateone', 'onoff.py')
if os.path.exists(old_onoff_path):
    os.remove(old_onoff_path)
    try:
        os.remove(old_onoff_path+'c') # termio.pyc
    except Exception:
        pass

setup(
    name = 'gateone',
    cmdclass = {'build_py': build_py},
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
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3.2",
        "Programming Language :: Python :: 3.3",
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
    requires = ["tornado (>=3.0)"],
    provides = ['gateone', 'termio', 'terminal'],
    packages = ['gateone', 'termio', 'terminal', 'onoff'],
    data_files = data_files,
    **extra
)

# TODO: This is a work-in-progress
# Update the version string of gateone.py (so we can tell which git revision)
#retcode, output = getstatusoutput("git describe")

# Python3 support stuff is below
def fix_shebang(filepath):
    """
    Swaps 'python' for 'python3' in the shebang (if present) in the given
    *filepath*.  Returns True if a change was made.  False if no changes.
    """
    contents = []
    with open(filepath, mode='r', encoding="utf-8") as f:
        contents = f.readlines()
    if contents and contents[0].startswith('#!'): # Shebang
        if 'python3' in contents[0]:
            return False # Nothing to do
        with open(filepath, mode='w', encoding="utf-8") as f:
            contents[0] = contents[0].replace('python', 'python3')
            f.write("".join(contents))
            return True

if PYTHON3:
    try:
        import html5lib
    except ImportError:
        # We'll need to use the one bundled with the bookmarks plugin which
        # means we need to convert it
        html5lib = None
    command = "2to3 -w -n -x print -x dict -x input %s"
    for (dirpath, dirs, filenames) in os.walk(os.path.join(prefix, 'gateone')):
        for f in filenames:
            if f.endswith('.py'):
                filepath = os.path.join(dirpath, f)
                if html5lib: # html5lib is installed
                # TODO: Add logic to double-check html5lib version
                    if "bookmarks/dependencies/html5lib" in filepath:
                        # Remove it to ensure the installed version gets used
                        os.remove(filepath)
                        continue # Don't bother with the conversion
                print("Converting to python3: %s" % filepath)
                # Fix the shebang if present
                fix_shebang(filepath)
                retcode, output = getstatusoutput(command % filepath)
