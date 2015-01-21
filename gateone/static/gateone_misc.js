// This is helpful when debugging
GateOne.exportShortcuts = function() {
    window.go = GateOne;
    window.prefix = GateOne.prefs.prefix;
    window.u = GateOne.Utils;
    window.v = GateOne.Visual;
    window.E = GateOne.Events;
    window.t = GateOne.Terminal;
    window.gettext = GateOne.i18n.gettext;
};
