# server.py
import http.server
import socketserver

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # The super().__init__ needs to come after setting extensions_map
        self.extensions_map = {
            '': 'application/octet-stream',
            '.html': 'text/html',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.svg': 'image/svg+xml',
            '.css': 'text/css',
            '.js': 'application/javascript',  # This is the important line for ES modules
        }
        super().__init__(*args, **kwargs)

PORT = 8001
Handler = MyHttpRequestHandler

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()