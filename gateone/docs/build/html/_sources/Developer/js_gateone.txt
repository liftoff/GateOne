.. _gateone-javascript:

gateone.js
==========
Gate One's JavaScript (`source <https://github.com/liftoff/GateOne/blob/master/gateone/static/gateone.js>`_) is made up of several modules (aka plugins), each pertaining to a specific type of activity.  These modules are laid out like so:

* :js:attr:`GateOne`
    * :js:attr:`GateOne.Base`
    * :js:attr:`GateOne.Events`
    * :js:attr:`GateOne.i18n`
    * :js:attr:`GateOne.Input`
    * :js:attr:`GateOne.Net`
    * :js:attr:`GateOne.Storage`
    * :js:attr:`GateOne.Visual`
    * :js:attr:`GateOne.User`
    * :js:attr:`GateOne.Utils`

The properties and functions of each respective module are outlined below.

.. autojs:: ../static/gateone.js
    :member-order: bysource
    :members: GateOne.init, GateOne.initialize, GateOne.Base, GateOne.prefs, GateOne.Logging, GateOne.noSavePrefs, GateOne.Events, GateOne.i18n, GateOne.Icons, GateOne.Input, GateOne.Net, GateOne.Storage, GateOne.Visual, GateOne.User, GateOne.Utils

