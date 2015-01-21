Settings Directory
==================
Gate One's settings directory contains .conf files that define all the settings
and policies that will apply to users and groups.  Mostly, these .conf files
define who can login and what they can do but other general-purpose settings can
go in here as well.

.. note:: Support for groups is forthcoming.

The Format
----------
All .conf files are expected to be in a JSON format that uses the following
conventions::

    {
        "<key=value>": {
            "<application name>": {
                "<application-specific setting>"
            } // Comments like this are OK
        /*
            Comments like this are fine too
        */
        }

        // Empty lines (like above) are ignored
    }

.. note:: Instead of, '<key=value>' an asterisk "*" (the default rule) may be used to indicate "all users".

The Rules
---------

Rule 1: Only .conf files will be read
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Any and all files ending in .conf will be read in alphabetical order and
ultimately combined into a single Python dict (an RUDict to be specific).  All
other files in the security directory will be ignored (like this README*.rst).

Rule 2: Parameters will be merged safely
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
The security dict is constructed in such a way that all parameters can be added
to or overridden safely without cloberring parent dicts or keys.  For example,
if we have the following in a file named 50limits.conf::

    {
        "*": {
            "limits": {
                "terminal": {
                    "max_terms": 10
                }
            }
        }
    }

...and we have the following in a file named "60more_limits.conf"::

    {
        "*": {
            "terminal": {
                "max_terms": 5, // Override max_terms_total
                "additional_item": true // Add a new key:value
            }
        }
    }

The resulting dict would look like this:

    {
        "*": {
            "terminal": {
                "max_terms": 5,
                "additional_item": true
            }
        }
    }

The important thing to note is that the "terminal" dict wasn't completely
clobbered by the subsequent .conf file.  Instead the two were merged in an
intelligent manner.

Rule 3: Regular expressions are OK
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
You may use regular expressions in users, groups, and attributes.  For example::

    {
        "user.email=*.company.com": {
            "terminal": {
                login: true,
                "max_terms": 10
            }
        }
    }

The above example would allow login for all users with an email address ending
in 'company.com'.

Rule 4: Order Matters
^^^^^^^^^^^^^^^^^^^^^
There's a reason why the example files in this directory begin with numbers: The
order in which they're loaded matters.  Files that come later (alphanumerically)
will override the settings from earlier files.  So if 10access.conf exists and
it has '*' (default) allowing everyone to login but 20access.conf has a default
deny the default deny will take precedence.
