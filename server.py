import http.server
import socketserver
import mimetypes

# Add .glsl MIME type as text/plain
mimetypes.add_type('text/plain', '.glsl')

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()