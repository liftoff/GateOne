import logging
html5lib = False
try:
    import html5lib
except ImportError:
    logging.warning(
        "The bookmarks plugin requires html5lib to import/export bookmarks.")
    logging.info("TIP: sudo pip install html5lib")

if html5lib:
    from .bookmarks import hooks
