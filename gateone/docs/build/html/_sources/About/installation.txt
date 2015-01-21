Installation
============
Gate One can be installed via a number of methods, depending on which package you've got.  Assuming you've downloaded the appropriate Gate One package for your operating system to your home directory...

RPM-based Linux Distributions
-----------------------------
.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@redhat\x1b[1;34m:~ $\x1b[0m sudo rpm -Uvh gateone*.rpm

Debian-based Linux Distributions
--------------------------------
.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@ubuntu\x1b[1;34m:~ $\x1b[0m sudo dpkg -i gateone*.deb

From Source
-----------
.. ansi-block::
    :string_escape:

    \x1b[1;34muser\x1b[0m@whatever\x1b[1;34m:~ $\x1b[0m tar zxvf gateone*.tar.gz; cd gateone*; sudo python setup.py install

This translates to:  Extract; Change into the gateone* directory; Install.

.. tip:: You can make your own RPM from the source tarball by executing ``sudo python setup.py bdist_rpm`` instead of ``sudo python setup.py install``.
