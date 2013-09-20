/*
Gate One JavaScript library wrapper
===================================
A Tornado template that will wrap any given JavaScript library inside a sandbox
and only export (to the global namespace) those globals that are passed in via
the *exports* variable.

This script wraps:

    {{script['name']}}

Exporting:
{% for _global, name in exports.items() %}
    {{_global}} as window.{{name}}
{% end %}

*/

(function(window, undefined) {

var document = window.document;

{% raw script['source'] %}

{% for _global, name in exports.items() %}
    window.{% raw name %} = {% raw _global %};
{% end %}
})(window);
