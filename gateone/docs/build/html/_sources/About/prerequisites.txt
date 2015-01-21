Prerequisites
=============
Before installing Gate One your system must meet the following requirements:

=================================================   =================================================
Requirement                                         Version
=================================================   =================================================
Python                                              2.6+ or 3.2+
`Tornado Framework <http://www.tornadoweb.org/>`_   2.2+
=================================================   =================================================

.. note:: If using Python 2.6 you'll need to install the ordereddict module:  `sudo pip install ordereddict` or you can download it `here <http://pypi.python.org/pypi/ordereddict>`_.  As of Python 2.7 OrderedDict was added to the `collections <http://docs.python.org/library/collections.html>`_ module in the standard library.

The following commands can be used to verify which version of each are installed:

.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m python -V
    Python 2.7.2+
    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m python -c "import tornado; print(tornado.version)"
    2.4
    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m

Addditionally, if you wish to use Kerberos/Active Directory authentication you'll need the `python-kerberos <http://pypi.python.org/pypi/kerberos>`_ module.  On most systems both Tornado and the Kerberos module can be installed with via a single command:

.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m sudo pip install tornado kerberos

...or if you have an older operating system:

.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@legacy-host\x1b[1;34m:~ $\x1b[0m sudo easy_install tornado kerberos

.. note:: The use of pip is recommended.  See http://www.pip-installer.org/en/latest/installing.html if you don't have it.
