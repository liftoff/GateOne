#!/usr/bin/env python
# -*- coding: utf-8 -*-

from setuptools import setup
from setuptools.command.install import install
from distutils.command.install import INSTALL_SCHEMES
import sys, os, shutil, io

for scheme in INSTALL_SCHEMES.values():
    scheme['data'] = scheme['purelib']

# Globals
PYTHON3 = False
POSIX = 'posix' in sys.builtin_module_names
version = '1.2.0'
requires = ["tornado >=4.0", "html5lib >= 0.999"]
extra = {}
data_files = []
major, minor = sys.version_info[:2] # Python version
if major == 2 and minor <=5:
    print("Gate One requires Python 2.6+.  You are running %s" % sys.version)
    sys.exit(1)
if major == 2:
    from distutils.command.build_py import build_py
    from commands import getstatusoutput
    requires.append('futures') # Added in 3.2 (only needed in 2.6 and 2.7)
if major == 2 and minor == 6:
    requires.append('ordereddict') # This was added in Python 2.7+
if major == 3:
    PYTHON3 = True
    from subprocess import getstatusoutput
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

def which(binary, path=None):
    """
    Returns the full path of *binary* (string) just like the 'which' command.
    Optionally, a *path* (colon-delimited string) may be given to use instead of
    `os.environ['PATH']`.
    """
    if path:
        paths = path.split(':')
    else:
        paths = os.environ['PATH'].split(':')
    for path in paths:
        if not os.path.exists(path):
            continue
        files = os.listdir(path)
        if binary in files:
            return os.path.join(path, binary)
    return None

# Some paths we can reference
setup_dir = os.path.dirname(os.path.abspath(__file__))
build_dir = os.path.join(setup_dir, 'build')
if not os.path.exists(build_dir):
    # Make the build dir a little early so we can use it as a temporary place
    # to store build files
    os.mkdir(build_dir)

# Detect appropriate init script and make sure it is put in the right place
skip_init = False
if '--skip_init_scripts' in sys.argv:
    skip_init = True
    sys.argv.remove('--skip_init_scripts')
init_script = []
conf_file = [] # Only used on Gentoo
upstart_file = [] # Only used on Ubuntu (I think)
systemd_file = [] # Only used on systems with systemd
debian_script = os.path.join(setup_dir, 'scripts/init/gateone-debian.sh')
redhat_script = os.path.join(setup_dir, 'scripts/init/gateone-redhat.sh')
freebsd_script = os.path.join(setup_dir, 'scripts/init/gateone-freebsd.sh')
gentoo_script = os.path.join(setup_dir, 'scripts/init/gateone-gentoo.sh')
openwrt_script = os.path.join(setup_dir, 'scripts/init/gateone-openwrt.sh')
upstart_script = os.path.join(setup_dir, 'scripts/init/gateone.conf')
systemd_service = os.path.join(setup_dir, 'scripts/init/gateone.service')
temp_script_path = os.path.join(setup_dir, 'build/gateone')
bsd_temp = os.path.join(setup_dir, 'build/freebsd')
bsd_temp_script = os.path.join(bsd_temp, 'gateone')
upstart_temp_path = os.path.join(setup_dir, 'build/gateone.conf')
systemd_temp_path = os.path.join(setup_dir, 'build/gateone.service')
if not skip_init:
    if os.path.exists('/etc/debian_version'):
        shutil.copy(debian_script, temp_script_path)
    elif os.path.exists('/etc/redhat-release'):
        shutil.copy(redhat_script, temp_script_path)
    elif os.path.exists('/etc/freebsd-update.conf'):
        if not os.path.isdir(bsd_temp):
            os.mkdir(bsd_temp)
        shutil.copy(freebsd_script, bsd_temp_script)
    elif os.path.exists('/etc/gentoo-release'):
        shutil.copy(gentoo_script, temp_script_path)
        conf_file = ['/etc/conf.d', [
            os.path.join(setup_dir, 'scripts/conf/gateone')
        ]]
    elif os.path.exists('/etc/openwrt_release'):
        shutil.copy(openwrt_script, temp_script_path)
    # Handle the upstart script (Ubuntu only as far as I know)
    if os.path.isdir('/etc/init'):
        shutil.copy(upstart_script, upstart_temp_path)
        upstart_file = ['/etc/init', [upstart_temp_path]]
    # Handle systemd (can be used in conjunction with other init processes)
    systemd = which('systemd-notify')
    if systemd:
        # System is using systemd
        shutil.copy(systemd_service, systemd_temp_path)
        # This pkg-config command tells us where to put systemd .service files:
        retcode, systemd_system_unit_dir = getstatusoutput(
            'pkg-config systemd --variable=systemdsystemunitdir')
        systemd_file = [systemd_system_unit_dir, [systemd_temp_path]]
    # Handle FreeBSD and regular init.d scripts
    if os.path.exists(bsd_temp_script):
        init_script = ['/usr/local/etc/rc.d', [bsd_temp_script]]
    elif os.path.exists(temp_script_path):
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
plugin_dir = os.path.join(gateone_dir, 'plugins')
app_dir = os.path.join(gateone_dir, 'applications')

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
if '--skip_docs' in sys.argv:
    ignore_list.append('docs')
    sys.argv.remove('--skip_docs')

os.chdir(setup_dir)
for dirpath, dirnames, filenames in os.walk('gateone'):
    # Ignore PEP 3147 cache dirs and those whose names start with '.'
    dirnames[:] = [
        d for d in dirnames
        if not d.startswith('.')
        and d not in ignore_list
    ]
    if '__init__.py' in filenames:
        package = '.'.join(fullsplit(dirpath))
        packages.append(package)
    elif filenames:
        data_files.append([
            dirpath, [os.path.join(dirpath, f)
            for f in filenames
            if f not in ignore_list]
        ])

entry_points = {
    'console_scripts': ['gateone = gateone.core.server:main'],
    'go_plugins': [],
    'go_applications': [],
}
# Add plugin entry points for Python plugins
plugin_ep_template = '{name} = gateone.plugins.{name}'
for filename in os.listdir(plugin_dir):
    path = os.path.join(plugin_dir, filename)
    if os.path.isdir(path):
        if '__init__.py' in os.listdir(path):
            entry_points['go_plugins'].append(
                plugin_ep_template.format(name=filename))
# Add application (and their plugins) entry points
app_ep_template = '{name} = gateone.applications.{name}'
app_plugin_ep_template = '{name} = gateone.applications.{app}.plugins.{name}'
for filename in os.listdir(app_dir):
    path = os.path.join(app_dir, filename)
    if os.path.isdir(path):
        if '__init__.py' in os.listdir(path):
            entry = app_ep_template.format(name=filename)
            entry_points['go_applications'].append(entry)
        if 'plugins' in os.listdir(path):
            plugins_path = os.path.join(path, 'plugins')
            for f in os.listdir(plugins_path):
                ppath = os.path.join(plugins_path, f)
                if os.path.isdir(ppath):
                    if '__init__.py' in os.listdir(ppath):
                        plugin_ep_name = 'go_%s_plugins' % filename
                        entry = app_plugin_ep_template.format(
                            app=filename, name=f)
                        if not plugin_ep_name in entry_points:
                            entry_points[plugin_ep_name] = []
                        entry_points[plugin_ep_name].append(entry)

if os.getuid() == 0 and not skip_init:
    if init_script:
        data_files.append(init_script)
    if conf_file:
        data_files.append(conf_file)
    if upstart_file:
        data_files.append(upstart_file)
    if systemd_file:
        data_files.append(systemd_file)
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

class FixInitPaths(install):
    """
    An override of the `setuptools.command.install.install` cmdclass to ensure
    the paths to 'gateone' are correct in any init scripts.
    """
    def finalize_options(self):
        """
        Calls the regular ``finalize_options()`` method and adjusts the path to
        the 'gateone' script inside init scripts, .conf, and .service files.
        """
        install.finalize_options(self)
        if skip_init:
            return
        gateone_path = os.path.join(self.install_scripts, 'gateone')
        if os.path.exists(temp_script_path):
            with io.open(temp_script_path, encoding='utf-8') as f:
                temp = f.read()
            temp = temp.replace('GATEONE=gateone', 'GATEONE=%s' % gateone_path)
            with io.open(temp_script_path, 'w', encoding='utf-8') as f:
                f.write(temp)
        if os.path.exists(upstart_temp_path):
            with io.open(upstart_temp_path, encoding='utf-8') as f:
                temp = f.read()
            temp = temp.replace('exec gateone', 'exec %s' % gateone_path)
            with io.open(upstart_temp_path, 'w', encoding='utf-8') as f:
                f.write(temp)
        if os.path.exists(systemd_temp_path):
            with io.open(systemd_temp_path, encoding='utf-8') as f:
                temp = f.read()
            temp = temp.replace(
                'ExecStart=gateone', 'ExecStart=%s' % gateone_path)
            with io.open(systemd_temp_path, 'w', encoding='utf-8') as f:
                f.write(temp)
        if os.path.exists(bsd_temp_script):
            with io.open(bsd_temp_script, encoding='utf-8') as f:
                temp = f.read()
            temp = temp.replace(
                'command=gateone', 'command=%s' % gateone_path)
            with io.open(bsd_temp_script, 'w', encoding='utf-8') as f:
                f.write(temp)

setup(
    name = 'gateone',
    cmdclass = {'build_py': build_py, 'install': FixInitPaths},
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
    install_requires = requires,
    zip_safe = False, # TODO: Convert everything to using pkg_resources
    py_modules = ["gateone"],
    entry_points = entry_points,
    provides = ['gateone', 'termio', 'terminal', 'onoff'],
    packages = packages,
    data_files = data_files,
    **extra
)

# For whatever reason 2to3 doesn't fix the shebang in the ssh_connect.py
# script on systems with both python2 and python3.  Double-check that and fix it
# if needed:
if PYTHON3:
    # We only need to fix the shebang if the 'python' executable is Python 2.X
    retcode, output = getstatusoutput('python --version')
    if output.split()[1].startswith('2'):
        for path in sys.path:
            try:
                files = os.listdir(path)
            except (NotADirectoryError, FileNotFoundError):
                continue
            for f in files:
                if 'gateone' in f: # Found an installation
                    ssh_connect = os.path.join(
                        path, f, 'gateone', 'applications', 'terminal',
                        'plugins', 'ssh', 'scripts', 'ssh_connect.py')
                    if setup_dir in ssh_connect:
                        continue # Don't mess with the downloaded code
                    if not os.path.exists(ssh_connect):
                        # Alternate location on some systems:
                        ssh_connect = os.path.join(
                            path, f, 'applications', 'terminal', 'plugins',
                            'ssh', 'scripts', 'ssh_connect.py')
                    if os.path.exists(ssh_connect):
                        new_ssh_connect = b''
                        for i, line in enumerate(open(ssh_connect, 'rb')):
                            if i == 0 and not line.strip().endswith(b'python3'):
                                print(
                                    "Changing shebang to use 'python3' in %s" %
                                    ssh_connect)
                                new_ssh_connect += b'#!/usr/bin/env python3\n'
                            else:
                                new_ssh_connect += line
                        with open(ssh_connect, 'wb') as new_ssh_c:
                            new_ssh_c.write(new_ssh_connect)

print("Entry points were created for the following:")
for ep, items in sorted(list(entry_points.items())):
    print("    %s" % ep)
    for item in sorted(items):
        print("        %s" % item)

if not os.path.exists('/opt/gateone'):
    # Don't bother printing out the migration info below if the user has never
    # installed Gate One on this system before.
    sys.exit(0)

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
