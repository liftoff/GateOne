# -*- coding: utf-8 -*-
import os, sys
from setuptools import setup


cmdclass = {}
try: # Enable the sphinx_build command if Sphinx is installed
    from sphinx.setup_command import BuildDoc
    cmdclass['build_sphinx'] = BuildDoc
except ImportError:
    pass # Ignore--not important

extra = {}

major, minor = sys.version_info[:2] # Python version
if major == 2:
    from distutils.command.build_py import build_py
if major == 3:
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

cmdclass['build_py'] = build_py

setup_dir = os.path.dirname(os.path.abspath(__file__))
# Find any .css or .js files in the static dir and make sure they're included
static_dir = 'go_example_package/static/'
static_files = []
for filename in os.listdir(static_dir):
    if filename.endswith('.js') or filename.endswith('.css'):
        static_files.append(os.path.join(static_dir, filename))

setup(
    name="gateone_example_terminal_plugin_package", # This is how it will be named in the filesystem
    # Something like: gateone_example_terminal_plugin_package-1.0-py3.6.egg
    version="1.0",
    description="Example packaged plugin for Gate One",
    author="Dan McDougall",
    cmdclass=cmdclass,
    author_email="daniel.mcdougall@liftoffsoftware.com",
    url="http://liftoffsoftware.com/Products/GateOne",
    license="AGPLv3",
    package_dir={'go_example_package': 'go_example_package'},
    packages=['go_example_package'],
    zip_safe=False,
    data_files=[[static_dir, static_files]],
    entry_points = {
        'go_terminal_plugins': ['gateone.applications.terminal.plugins.go_example_package = go_example_package'],
    },
    # NOTE: If developing an application (instead of a plugin) you'll register a different entry point:
    #entry_points = {
        #'go_applications': ['gateone.applications.go_example_package = go_example_package'],
    #},
    # That would tell Gate One about our 'go_example_package' so it can be imported properly
    classifiers=[
        "Environment :: Console",
        "Intended Audience :: Developers",
        "Intended Audience :: System Administrators",
        "Programming Language :: Python",
        "Programming Language :: Python :: 2",
        "Programming Language :: Python :: 2.6",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.1",
        "Programming Language :: Python :: 3.2",
        "Programming Language :: Python :: 3.3",
        "Programming Language :: Python :: 3.4",
        "Topic :: Software Development :: Build Tools",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    **extra
)
