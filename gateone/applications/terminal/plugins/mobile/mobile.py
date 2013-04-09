import os

PLUGIN_PATH = os.path.split(__file__)[0]

def send_mobile_css_template(self):
    """
    Sends our mobile.css template to the client using the 'load_style'
    WebSocket action.  The rendered template will be saved in Gate One's
    'cache_dir'.
    """
    css_path = os.path.join(PLUGIN_PATH, 'templates', 'mobile.css')
    self.ws.render_and_send_css(css_path)

hooks = {
    'Events': {
        'terminal:authenticate': send_mobile_css_template
    }
}
