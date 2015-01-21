.. _gateone-javascript:

gateone.js
==========
Gate One's JavaScript (`gateone.js <https://github.com/liftoff/GateOne/blob/master/gateone/static/gateone.js>`_) is made up of several modules (aka plugins), each pertaining to a specific type of activity.  These modules are laid out like so:

* :js:attr:`GateOne`
    * :js:attr:`GateOne.Base`
    * :js:attr:`GateOne.Events`
    * :js:attr:`GateOne.i18n`
    * :js:attr:`GateOne.Input` (Source: `gateone_input.js <https://github.com/liftoff/GateOne/blob/master/gateone/static/gateone_input.js>`_)
    * :js:attr:`GateOne.Net`
    * :js:attr:`GateOne.Storage`
    * :js:attr:`GateOne.Visual`
    * :js:attr:`GateOne.User`
    * :js:attr:`GateOne.Utils`

The properties and functions of each respective module are outlined below.

.. autojs:: ../static/gateone.js
    :member-order: bysource
    :members: GateOne.init, GateOne.initialize, GateOne.Base, GateOne.prefs, GateOne.Logging, GateOne.noSavePrefs, GateOne.Events, GateOne.i18n, GateOne.Icons, GateOne.Net, GateOne.Storage, GateOne.Visual, GateOne.User, GateOne.Utils

.. note:: :js:attr:`GateOne.Input` was moved to a separate file (`gateone_input.js <https://github.com/liftoff/GateOne/blob/master/gateone/static/gateone_input.js>`_) to reduce the size of `gateone.js <https://github.com/liftoff/GateOne/blob/master/gateone/static/gateone.js>`_ (since the input functions don't need to be available on the page right away).

.. autojs:: ../static/gateone_input.js
    :member-order: bysource
    :members: GateOne.Input
