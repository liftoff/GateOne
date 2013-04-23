# -*- coding: utf-8 -*-
# Original version (pam-0.1.3) ©2007 Chris AtLee <chris@atlee.ca>
# This version (modifications) © 2012 Liftoff Software Corporation
# Licensed under the MIT license:
#   http://www.opensource.org/licenses/mit-license.php
# This is a modified version of pam-0.1.3 that adds support for
# pam_set_item (specificallly, to support setting a PAM_TTY)

# Meta
__version__ = '1.0'
__license__ = "MIT"
__version_info__ = (1.0)
__author__ = 'Dan McDougall <daniel.mcdougall@liftoffsoftware.com>'

__doc__ = """\
PAM Authentication Module for Python
====================================
Provides an authenticate function that will allow the caller to authenticate
a user against the Pluggable Authentication Modules (PAM) on the system.

Implemented using ctypes, so no compilation is necessary.
"""

__all__ = ['authenticate']

from ctypes import CDLL, POINTER, Structure, CFUNCTYPE, cast, pointer, sizeof
from ctypes import c_void_p, c_uint, c_char_p, c_char, c_int
from ctypes.util import find_library

LIBPAM = CDLL(find_library("pam"))
LIBC = CDLL(find_library("c"))

CALLOC = LIBC.calloc
CALLOC.restype = c_void_p
CALLOC.argtypes = [c_uint, c_uint]

STRDUP = LIBC.strdup
STRDUP.argstypes = [c_char_p]
STRDUP.restype = POINTER(c_char) # NOT c_char_p !!!!

# Various constants
PAM_PROMPT_ECHO_OFF = 1
PAM_PROMPT_ECHO_ON = 2
PAM_ERROR_MSG = 3
PAM_TEXT_INFO = 4
# pam_set_item and pam_get_item constants:
PAM_SERVICE =       1    # The service name
PAM_USER =          2    # The user name
PAM_TTY =           3    # The tty name
PAM_RHOST =         4    # The remote host name
PAM_CONV =          5    # The pam_conv structure
PAM_AUTHTOK =       6    # The authentication token (password)
PAM_OLDAUTHTOK =    7    # The old authentication token
PAM_RUSER =         8    # The remote user name
PAM_USER_PROMPT =   9    # the prompt for getting a username
# These are Linux-specific pam_set_item/pam_get_item constants:
PAM_FAIL_DELAY =   10    # app supplied function to override failure
PAM_XDISPLAY =     11    # X display name
PAM_XAUTHDATA =    12    # X server authentication data
PAM_AUTHTOK_TYPE = 13    # The type for pam_get_authtok

class PamHandle(Structure):
    """wrapper class for pam_handle_t"""
    _fields_ = [("handle", c_void_p)]

    def __init__(self):
        Structure.__init__(self)
        self.handle = 0

class PamMessage(Structure):
    """wrapper class for pam_message structure"""
    _fields_ = [("msg_style", c_int), ("msg", c_char_p)]

    def __repr__(self):
        return "<PamMessage %i '%s'>" % (self.msg_style, self.msg)

class PamResponse(Structure):
    """wrapper class for pam_response structure"""
    _fields_ = [("resp", c_char_p), ("resp_retcode", c_int)]

    def __repr__(self):
        return "<PamResponse %i '%s'>" % (self.resp_retcode, self.resp)

CONV_FUNC = CFUNCTYPE(
    c_int,
    c_int,
    POINTER(POINTER(PamMessage)),
    POINTER(POINTER(PamResponse)),
    c_void_p)

class PamConv(Structure):
    """wrapper class for pam_conv structure"""
    _fields_ = [("conv", CONV_FUNC), ("appdata_ptr", c_void_p)]

PAM_START = LIBPAM.pam_start
PAM_START.restype = c_int
PAM_START.argtypes = [c_char_p, c_char_p, POINTER(PamConv), POINTER(PamHandle)]

PAM_AUTHENTICATE = LIBPAM.pam_authenticate
PAM_AUTHENTICATE.restype = c_int
PAM_AUTHENTICATE.argtypes = [PamHandle, c_int]

PAM_SET_ITEM = LIBPAM.pam_set_item
PAM_SET_ITEM.restype = c_int
PAM_SET_ITEM.argtypes = [PamHandle, c_int, c_char_p]

def authenticate(username, password, service='login', tty="console", **kwargs):
    """
    Returns True if the given username and password authenticate for the
    given service.  Returns False otherwise.

    :param string username: The username to authenticate.
    :param string password: The password in plain text.
    :param string service: The PAM service to authenticate against.  Defaults to 'login'.
    :param string tty: Name of the TTY device to use when authenticating.  Defaults to 'console' (to allow root).

    If additional keyword arguments are provided they will be passed to
    PAM_SET_ITEM() like so::

        PAM_SET_ITEM(handle, <keyword mapped to PAM_whatever>, <value>)

    Where the keyword will be automatically converted to a PAM_whatever constant
    if present in this file.  Example::

        authenticate(user, pass, PAM_RHOST="myhost")

    ...would result in::

        PAM_SET_ITEM(handle, 4, "myhost") # PAM_RHOST (4) taken from the global
    """
    encoding = 'utf-8'
    if isinstance(password, str):
        password = password.encode(encoding)
    if isinstance(username, str):
        username = username.encode(encoding)
    if isinstance(service, str):
        service = service.encode(encoding)
    if isinstance(tty, str):
        tty = tty.encode(encoding)
    @CONV_FUNC
    def my_conv(n_messages, messages, p_response, app_data):
        """
        Simple conversation function that responds to any prompt where the echo
        is off with the supplied password.
        """
        # Create an array of n_messages response objects
        addr = CALLOC(n_messages, sizeof(PamResponse))
        p_response[0] = cast(addr, POINTER(PamResponse))
        for i in range(n_messages):
            if messages[i].contents.msg_style == PAM_PROMPT_ECHO_OFF:
                pw_copy = STRDUP(password)
                p_response.contents[i].resp = cast(pw_copy, c_char_p)
                p_response.contents[i].resp_retcode = 0
        return 0
    handle = PamHandle()
    conv = PamConv(my_conv, 0)
    retval = PAM_START(service, username, pointer(conv), pointer(handle))
    PAM_SET_ITEM(handle, PAM_TTY, tty)
    for key, value in kwargs.items():
        if key.startswith('PAM_') and key in globals():
            if isinstance(value, str):
                value = value.encode(encoding)
            PAM_SET_ITEM(handle, globals()[key], value)
    if retval != 0:
        # TODO: This is not an authentication error, something
        # has gone wrong starting up PAM
        return False
    retval = PAM_AUTHENTICATE(handle, 0)
    return retval == 0

if __name__ == "__main__":
    import getpass
    print(authenticate(getpass.getuser(), getpass.getpass()))
