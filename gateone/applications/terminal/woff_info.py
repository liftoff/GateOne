#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#       Copyright 2013 Liftoff Software Corporation

# Meta
__version__ = '1.0'
__version_info__ = (1, 0)
__license__ = "AGPLv3 or Proprietary (see LICENSE.txt)"

__doc__ = """\
.. _woff_info.py:

Provides a number of functions that can be used to extract the 'name' data from
.woff (web font) files.

.. note::

    In most cases .woff files have the metadata stripped (to save space) which
    is why this module only grabs the 'name' records from the snft (font data)
    tables.

Example::

    >>> from pprint import pprint
    >>> from woff_info import woff_name_data
    >>> woff_path = '/opt/gateone/applications/terminal/static/fonts/ubuntumono-normal.woff'
    >>> pprint(woff_info(woff_path))
    {'Compatible Full': 'Ubuntu Mono',
    'Copyright': 'Copyright 2011 Canonical Ltd.  Licensed under the Ubuntu Font Licence 1.0',
    'Designer': 'Dalton Maag Ltd',
    'Designer URL': 'http://www.daltonmaag.com/',
    'Font Family': 'Ubuntu Mono',
    'Font Subfamily': 'Regular',
    'Full Name': 'Ubuntu Mono',
    'ID': 'Ubuntu Mono Regular Version 0.80',
    'Manufacturer': 'Dalton Maag Ltd',
    'Postscript Name': 'UbuntuMono-Regular',
    'Preferred Family': 'Ubuntu Mono',
    'Preferred Subfamily': 'Regular',
    'Trademark': 'Ubuntu and Canonical are registered trademarks of Canonical Ltd.',
    'Vendor URL': 'http://www.daltonmaag.com/',
    'Version': 'Version 0.80'}

This script can also be executed on the command line to display the name
information for any given WOFF file:

.. ansi-block::

    \x1b[1;34muser\x1b[0m@modern-host\x1b[1;34m:~ $\x1b[0m ./woff_info static/fonts/ubuntumono-normal.woff
    {
        "Compatible Full": "Ubuntu Mono",
        "Copyright": "Copyright 2011 Canonical Ltd.  Licensed under the Ubuntu Font Licence 1.0",
        "Designer": "Dalton Maag Ltd",
        "Designer URL": "http://www.daltonmaag.com/",
        "Font Family": "Ubuntu Mono",
        "Font Subfamily": "Regular",
        "Full Name": "Ubuntu Mono",
        "ID": "Ubuntu Mono Regular Version 0.80",
        "Manufacturer": "Dalton Maag Ltd",
        "Postscript Name": "UbuntuMono-Regular",
        "Preferred Family": "Ubuntu Mono",
        "Preferred Subfamily": "Regular",
        "Trademark": "Ubuntu and Canonical are registered trademarks of Canonical Ltd.",
        "Vendor URL": "http://www.daltonmaag.com/",
        "Version": "Version 0.80"
    }

..note::

    The command line output is JSON so it can be easily used by other programs.
"""

import sys, struct, zlib, functools

def memoize(obj):
    cache = obj.cache = {}
    @functools.wraps(obj)
    def memoizer(*args, **kwargs):
        key = str(args) + str(kwargs)
        if key not in cache:
            cache[key] = obj(*args, **kwargs)
        return cache[key]
    return memoizer

# Try using Gate One's memoize decorator (with self-expiry!)
try:
    from gateone.core.utils import memoize
except ImportError:
    pass # No big, use the one above

# Globals
ENCODING_MAP = {
    0: 'ascii',
    1: 'latin-1',
    2: 'iso-8859-1'
}

NAME_ID_MAP = { # For human-readable names
    0: u"Copyright",
    1: u"Font Family",
    2: u"Font Subfamily",
    3: u"ID",
    4: u"Full Name",
    5: u"Version",
    6: u"Postscript Name",
    7: u"Trademark",
    8: u"Manufacturer",
    9: u"Designer",
    10: u"Description",
    11: u"Vendor URL",
    12: u"Designer URL",
    13: u"License Description",
    14: u"License URL",
    15: u"Reserved",
    16: u"Preferred Family",
    17: u"Preferred Subfamily",
    18: u"Compatible Full",
    19: u"Sample Text",
    20: u"Postscript CID",
    21: u"WWS Family Name",
    22: u"WWS Subfamily Name",
    #200: u"???" # Liberation Mono uses this, "Webfont 1.0" is the value but
    # what is ID 200 supposed to be?  Webfont version?
    #201: u"???" # Liberation Mono also uses this.  Looks like a date of some
    # sort.  Creation date, perhaps?
}

NAME_HEADER_FORMAT = """
    format:         H
    count:          H
    offset:         H
"""

NAME_RECORD_FORMAT = """
    platform_id:    H
    encoding:       H
    language:       H
    name_id:        H
    length:         H
    offset:         H
"""

HEADER_FORMAT = """
    signature:      4s
    flavor:         4s
    length:         L
    numTables:      H
    reserved:       H
    totalSfntSize:  L
    majorVersion:   H
    minorVersion:   H
    metaOffset:     L
    metaLength:     L
    metaOrigLength: L
    privOffset:     L
    privLength:     L
"""

DIRECTORY_FORMAT = """
    tag:            4s
    offset:         L
    compLength:     L
    origLength:     L
    origChecksum:   L
"""

class BadWoff(Exception):
    """
    Raised when the name data cannot be extracted from a a .woff file (for
    whatever reason).
    """
    pass

# Much of this code was copied from the W3C WOFF validator.py:
#   http://dev.w3.org/webfonts/WOFF/tools/validator/
# ...which is covered by the W3C's own MIT-like license:
#   http://www.w3.org/Consortium/Legal/2002/copyright-software-20021231

# This was inspired by Just van Rossum's sstruct module.
# http://fonttools.svn.sourceforge.net/svnroot/fonttools/trunk/Lib/sstruct.py

def struct_unpack(format, data):
    keys, format_string = _struct_get_format(format)
    size = struct.calcsize(format_string)
    values = struct.unpack(format_string, data[:size])
    unpacked = {}
    for index, key in enumerate(keys):
        value = values[index]
        unpacked[key] = value
    return unpacked, data[size:]

def struct_calc_size(format):
    keys, format_string = _struct_get_format(format)
    return struct.calcsize(format_string)

_struct_format_cache = {}

def _struct_get_format(format):
    if format not in _struct_format_cache:
        keys = []
        format_string = [">"] # always big endian
        for line in format.strip().splitlines():
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            key, format_char = line.split(":")
            key = key.strip()
            format_char = format_char.strip()
            keys.append(key)
            format_string.append(format_char)
        _struct_format_cache[format] = (keys, "".join(format_string))
    return _struct_format_cache[format]

HEADER_SIZE = struct_calc_size(HEADER_FORMAT)

def unpack_header(data):
    return struct_unpack(HEADER_FORMAT, data)[0]

def unpack_directory(data):
    header = unpack_header(data)
    numTables = header["numTables"]
    data = data[HEADER_SIZE:]
    directory = []
    for index in range(numTables):
        table, data = struct_unpack(DIRECTORY_FORMAT, data)
        directory.append(table)
    return directory

def unpack_table_data(data):
    directory = unpack_directory(data)
    tables = {}
    for entry in directory:
        tag = entry["tag"]
        offset = entry["offset"]
        origLength = entry["origLength"]
        compLength = entry["compLength"]
        if offset > len(data) or offset < 0 or (offset + compLength) < 0:
            tableData = ""
        elif offset + compLength > len(data):
            tableData = data[offset:]
        else:
            tableData = data[offset:offset+compLength]
        if compLength < origLength:
            try:
                td = zlib.decompress(tableData)
                tableData = td
            except zlib.error:
                tableData = None
        tables[tag] = tableData
    return tables

def unpack_name_data(data):
    header, remaining_data = struct_unpack(NAME_HEADER_FORMAT, data)
    count = header["count"]
    storage_offset = header["offset"]
    name_records = []
    for index in range(count):
        record, remaining_data = struct_unpack(
            NAME_RECORD_FORMAT, remaining_data)
        # Add the strings to the table
        offset = storage_offset + record['offset']
        end = offset + record['length']
        # Remove any null chars from the string (they can have lots)
        record['string'] = data[offset:end].replace(b'\x00', b'')
        # Now make sure the string is unicode
        encoding = ENCODING_MAP[record['encoding']]
        try:
            record['string'] = record['string'].decode(encoding)
        except UnicodeDecodeError:
            # Sometimes the listed encoding is incorrect.  Fall back to latin-1
            # (which covers the most common non-ascii characters such as the
            # copyright symbol: \xa9)
            record['string'] = record['string'].decode('latin-1')
        name_records.append(record)
    return name_records

def woff_name_data(path):
    """
    Returns the 'name' table data from the .woff font file at the given *path*.

    .. note:: Only returns the English language stuff.
    """
    with open(path, 'rb') as f:
        table_data = unpack_table_data(f.read())
    if b'name' not in table_data:
        raise BadWoff("WOFF file is invalid")
    name_data = unpack_name_data(table_data[b'name'])
    name_dict = {}
    for record in name_data:
        if record['language'] == 0: # English
            name_id = record['name_id']
            del record['name_id'] # To reduce redundancy
            name_dict[name_id] = record
    if not name_dict:
        # Fallback to using the first language we find
        language = None
        for record in name_data:
            if not language:
                language = record['language']
            if record['language'] == language:
                name_id = record['name_id']
                del record['name_id'] # To reduce redundancy
                name_dict[name_id] = record
    return name_dict

@memoize
def woff_info(path):
    """
    Returns a dictionary containing the English-language name (string) data
    from the WOFF file at the given *path*.
    """
    name_dict = woff_name_data(path)
    human_name_dict = {}
    for name_id, record in name_dict.items():
        human_name = NAME_ID_MAP.get(name_id, 'Unknown Name ID: %s' % name_id)
        human_name_dict[human_name] = record['string']
    return human_name_dict

if __name__ == "__main__":
    import json
    if len(sys.argv) < 2:
        print("Usage: %s <woff file>" % sys.argv[0])
        sys.exit(1)
    path = sys.argv[1]
    try:
        print(json.dumps(woff_info(path), indent=4, sort_keys=True))
    except BadWoff as e:
        print("Could not decode name table (metadata) from %s" % path)
        sys.exit(1)
