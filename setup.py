#!/usr/bin/env python
# -*- coding: utf-8 -*-

from setuptools import setup
from distutils.command.install import INSTALL_SCHEMES
import sys, os, shutil

for scheme in INSTALL_SCHEMES.values():
    scheme['data'] = scheme['purelib']

# Globals
PYTHON3 = False
POSIX = 'posix' in sys.builtin_module_names
version = '1.2.0'
requires = ["tornado (>=3.0)"]
extra = {}
data_files = []
major, minor = sys.version_info[:2] # Python version
if major == 2 and minor <=5:
    print("Gate One requires Python 2.6+.  You are running %s" % sys.version)
    sys.exit(1)
if major == 2:
    from distutils.command.build_py import build_py
    requires.append('futures') # Added in 3.2 (only needed in 2.6 and 2.7)
if major == 2 and minor == 6:
    requires.append('ordereddict') # This was added in Python 2.7+
if major == 3:
    PYTHON3 = True
    extra['use_2to3'] = True # Automatically convert to Python 3; love it!
    try:
        from distutils.command.build_py import build_py_2to3 as build_py
    except ImportError:
        print("Python 3.X support requires the 2to3 tool.")
        print(
            "It normally comes with Python 3.X but (apparenty) not on your "
            "distribution.\nPlease find out what package you need to get 2to3"
            "and install it.")
        sys.exit(1)

# Some paths we can reference
setup_dir = os.path.dirname(os.path.abspath(__file__))
build_dir = os.path.join(setup_dir, 'build')
if not os.path.exists(build_dir):
    # Make the build dir a little early so we can use it as a temporary place
    # to store build files
    os.mkdir(build_dir)

# Detect appropriate init script and make sure it is put in the right place
init_script = []
conf_file = [] # Only used on Gentoo
upstart_file = [] # Only used on Ubuntu (I think)
debian_script = os.path.join(setup_dir, 'scripts/init/gateone-debian.sh')
redhat_script = os.path.join(setup_dir, 'scripts/init/gateone-redhat.sh')
freeBsd_script = os.path.join(setup_dir, 'scripts/init/gateone-freebsd.sh')
gentoo_script = os.path.join(setup_dir, 'scripts/init/gateone-gentoo.sh')
upstart_script = os.path.join(setup_dir, 'scripts/init/gateone.conf')
temp_script_path = os.path.join(setup_dir, 'build/gateone')
bsd_script_path = '/usr/local/etc/rc.d/gateone'
bsd_rcd = '/etc/rc.conf'
upstart_temp_path = os.path.join(setup_dir, 'build/gateone.conf')
if os.path.exists('/etc/debian_version'):
    shutil.copy(debian_script, temp_script_path)
elif os.path.exists('/etc/redhat-release'):
    shutil.copy(redhat_script, temp_script_path)
elif os.path.exists('/etc/freebsd-update.conf'):
     shutil.copy(freebsd_script, bsd_script_path)
     with open(bsd_rcd, "a") as myfile:
       myfile.write("gateone_enable=YES") 
elif os.path.exists('/etc/gentoo-release'):
    shutil.copy(gentoo_script, temp_script_path)
    conf_file = ['/etc/conf.d', [
        os.path.join(setup_dir, 'scripts/conf/gateone')
    ]]
# Handle the upstart script (Ubuntu only as far as I know)
if os.path.isdir('/etc/init'):
    shutil.copy(upstart_script, upstart_temp_path)
    upstart_file = ['/etc/init', [upstart_temp_path]]

if os.path.exists(temp_script_path):
    init_script = ['/etc/init.d', [temp_script_path]]

# NOTE: This function was copied from Django's setup.py (thanks guys!)
def fullsplit(path, result=None):
    """
    Split a pathname into components (the opposite of os.path.join) in a
    platform-neutral way.
    """
    if result is None:
        result = []
    head, tail = os.path.split(path)
    if head == '':
        return [tail] + result
    if head == path:
        return result
    return fullsplit(head, [tail] + result)

gateone_dir = os.path.join(setup_dir, 'gateone')

ignore_list = [
    '__pycache__',
    '.kate-swp',
    '.pyc',
    '.pyo',
    '.pye',
    '.git',
    '.gitignore',
    '.jse'
]
packages = ['termio', 'terminal', 'onoff']

for dirpath, dirnames, filenames in os.walk('gateone'):
    # Ignore PEP 3147 cache dirs and those whose names start with '.'
    dirnames[:] = [
        d for d in dirnames
        if not d.startswith('.')
        and d not in ignore_list
    ]
    if '__init__.py' in filenames:
        package = '.'.join(fullsplit(dirpath))
        #if package.count('.') < 3:
        packages.append(package)
        #else:
            #data_files.append([
                #dirpath, [os.path.join(dirpath, f)
                #for f in filenames
                #if f not in ignore_list]
            #])
    elif filenames:
        data_files.append([
            dirpath, [os.path.join(dirpath, f)
            for f in filenames
            if f not in ignore_list]
        ])

if os.getuid() == 0:
    if init_script:
        data_files.append(init_script)
    if conf_file:
        data_files.append(conf_file)
    if upstart_file:
        data_files.append(upstart_file)
else:
    print("You are not root; skipping installation of init scripts.")

# Try minifying gateone.js
try:
    import slimit
    static_dir = os.path.join(setup_dir, 'gateone', 'static')
    gateone_js = os.path.join(static_dir, 'gateone.js')
    gateone_min_js = os.path.join(static_dir, 'gateone.min.js')
    with open(gateone_js, 'rb') as f:
        data = f.read()
    try:
        out = slimit.minify(data)
        with open(gateone_min_js, 'wb') as f:
            f.write(out)
            f.write('\n//# sourceURL=/static/gateone.js\n')
    except Exception as e:
        print("Got an exception trying to minify gateone.js; skipping")
        #import traceback
        #traceback.print_exc(file=sys.stdout)
except ImportError:
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
    requires = requires,
    zip_safe = False, # TODO: Convert everything to using pkg_resources
    py_modules = ["gateone"],
    entry_points = {
        'console_scripts': [
            'gateone = gateone.core.server:main'
        ]
    },
    provides = ['gateone', 'termio', 'terminal', 'onoff'],
    packages = packages,
    data_files = data_files,
    **extra
)

print("""
\x1b[1mIMPORTANT:\x1b[0m Gate One has been relocated from /opt/gateone to your
system's site-packages directory.  The old location was left alone.  You may
now start Gate One by simply running 'gateone' (it should be in your $PATH).

\x1b[1mImportant default file locations (and their respective cli args):\x1b[0m

    \x1b[1m--settings_dir\x1b[0m=/etc/gateone/conf.d
    \x1b[1m--certificate\x1b[0m=/etc/gateone/ssl/certificate.pem
    \x1b[1m--keyfile\x1b[0m=/etc/gateone/ssl/keyfile.pem
    \x1b[1m--user_dir\x1b[0m=/var/lib/gateone/users
    \x1b[1m--log_file_prefix\x1b[0m=/var/log/gateone/gateone.log
    \x1b[1m--pid_file\x1b[0m=/var/run/gateone.pid
""")

if os.path.exists('/opt/gateone/settings'):
    print("""\
\x1b[1mTIP:\x1b[0m If you wish to preserve your old settings:
    sudo mkdir -p /etc/gateone
    sudo mv /opt/gateone/settings /etc/gateone/conf.d""")
