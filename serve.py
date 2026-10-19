"""
Serve the dashboard locally:   python serve.py   ->  http://localhost:8000
                               (add --no-browser to skip opening a tab)

Uses an explicit MIME map because Windows' registry sometimes maps .js to
text/plain, which browsers refuse for ES modules.
"""
import http.server
import socketserver
import sys
import webbrowser
from functools import partial
from pathlib import Path

PORT = 8000
WEB_DIR = Path(__file__).resolve().parent / "web"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
        ".json": "application/json", ".geojson": "application/geo+json",
        ".svg": "image/svg+xml", ".html": "text/html", ".pbf": "application/x-protobuf",
    }

    def send_head(self):
        # Tiles over empty areas (sea, outside India) are never written; answer "no content"
        # so the map treats them as empty instead of logging 404s.
        path = self.translate_path(self.path)
        if self.path.split("?")[0].endswith(".pbf") and not Path(path).exists():
            self.send_response(204)
            self.end_headers()
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter console
        if args and str(args[1]) not in ("200", "304"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    if not (WEB_DIR / "data" / "summary.json").exists():
        raise SystemExit("web/data is missing - run:  python build_web_data.py")
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), partial(Handler, directory=str(WEB_DIR))) as httpd:
        url = f"http://localhost:{PORT}/"
        print(f"Serving {WEB_DIR} at {url}  (Ctrl+C to stop)")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
