#!/usr/bin/env python3
"""
Local test server for mysabak.

Usage (run from anywhere):
    python serve.py                 # http://localhost:8000/html/index.html, opens your browser
    python serve.py --port 5500     # pick another port
    python serve.py --lan           # also reachable from your phone on the same Wi-Fi
    python serve.py --no-open       # don't open the browser

Notes
- Serves the folder this file lives in (the MySabak project root).
- "/" redirects to /html/index.html.
- Sends no-cache headers so your CSS/JS edits show up on a normal refresh.
- The service worker (offline + install) only runs on localhost or HTTPS,
  so with --lan the app works on your phone but won't be installable there.
"""
import argparse
import http.server
import mimetypes
import os
import socket
import sys
import webbrowser
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))
START_PAGE = "/html/index.html"

# Some systems (especially Windows) map these wrong or not at all.
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".pbf": "application/x-protobuf",
    }

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", START_PAGE)
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        # Always fetch fresh files while developing.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s  %s\n" % (self.log_date_time_string(), fmt % args))


def lan_ip():
    """Best guess at this computer's address on the local network."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packets are sent
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def make_server(host, port, tries=20):
    """Bind to `port`, or the next free one if it's taken."""
    handler = partial(Handler, directory=ROOT)
    for p in range(port, port + tries):
        try:
            return http.server.ThreadingHTTPServer((host, p), handler), p
        except OSError:
            continue
    sys.exit(f"No free port between {port} and {port + tries - 1}.")


def main():
    ap = argparse.ArgumentParser(description="Serve the mysabak project for local testing.")
    ap.add_argument("--port", type=int, default=8000, help="port to use (default 8000)")
    ap.add_argument("--lan", action="store_true", help="listen on all network interfaces")
    ap.add_argument("--no-open", action="store_true", help="don't open a browser tab")
    args = ap.parse_args()

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server, port = make_server(host, args.port)
    local_url = f"http://localhost:{port}{START_PAGE}"

    print("\n  mysabak dev server")
    print(f"  Serving: {ROOT}")
    print(f"  Local:   {local_url}")
    if args.lan:
        ip = lan_ip()
        if ip:
            print(f"  Phone:   http://{ip}:{port}{START_PAGE}  (same Wi-Fi)")
        print("  Tip: allow Python through Windows Firewall if your phone can't connect.")
    print("  Press Ctrl+C to stop.\n")

    if not args.no_open:
        webbrowser.open(local_url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
