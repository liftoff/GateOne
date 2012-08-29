
__doc__ = """\
This module defines the roles for documenting Gate One's JavaScript.  It is
based on MochiKit's make_docs.py which can be found here:

https://github.com/mochi/mochikit/blob/master/scripts/make_docs.py
"""

try:
    from pkg_resources import require
    require("docutils>0.3.9")
except ImportError:
    pass
from docutils import nodes, utils
from docutils.parsers.rst import roles

def go_name(text):
    name = text.split('(', 1)[0].split()[0]
    base = ''
    if name.startswith('GateOne.'):
        # cross-reference
        parts = name.split('.')
        base = parts[1] + '.html'
        name = '.'.join(parts[2:])
    return base, name

def goref_role(role, rawtext, text, lineno, inliner, options=None, content=[]):
    if options is None:
        options = {}
    base, name = go_name(text)
    ref = base
    if name:
        ref += '#fn-' + name.lower()
    roles.set_classes(options)
    options.setdefault('classes', []).append('goref')
    node = nodes.reference(
        text, utils.unescape(text), refuri=ref, **options)
    return [node], []

def godef_role(role, rawtext, text, lineno, inliner, options=None, content=[]):
    if options is None:
        options = {}
    base, name = go_name(text)
    assert base == ''
    ref = 'fn-' + utils.unescape(name.lower())
    anchor = nodes.raw('', '\n<a name="%s"></a>\n' % (ref,), format='html')
    roles.set_classes(options)
    options.setdefault('classes', []).append('godef')
    node = nodes.reference(
        text, utils.unescape(text), refuri='#' + ref, **options)
    return [anchor, node], []

# This is just a known-working Sphinx role for reference
#def bbuser_role(name, rawtext, text, lineno, inliner, options={}, content=[]):
    #"""Link to a BitBucket user.

    #Returns 2 part tuple containing list of nodes to insert into the
    #document and a list of system messages.  Both are allowed to be
    #empty.

    #:param name: The role name used in the document.
    #:param rawtext: The entire markup snippet, with role.
    #:param text: The text marked with the role.
    #:param lineno: The line number where rawtext appears in the input.
    #:param inliner: The inliner instance that called us.
    #:param options: Directive options for customization.
    #:param content: The directive content for customization.
    #"""
    #app = inliner.document.settings.env.app
    ##app.info('user link %r' % text)
    #ref = 'https://bitbucket.org/' + text
    #node = nodes.reference(rawtext, text, refuri=ref, **options)
    #return [node], []

def setup(app):
    """Install the plugin.

    :param app: Sphinx application context.
    """
    app.info('Initializing Sphinx Gate One plugin')
    app.add_role('goref', goref_role)
    app.add_role('godef', godef_role)
    return