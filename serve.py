#!/usr/bin/env python3
"""
Local test server for mysabak.

Usage (run from anywhere):
    python serve.py                 # http://localhost:8000/html/, opens your browser
    python serve.py --port 5500     # pick another port
    python serve.py --lan           # also reachable from your phone on the same Wi-Fi
    python serve.py --no-open       # don't open the browser

Notes
- Serves the folder this file lives in (the MySabak project root).
- "/" redirects to /html/.
- /api/tomtom/... is forwarded to TomTom with the key from .dev.vars added,
  like worker/index.js does on Cloudflare. Copy .dev.vars.example to .dev.vars first.
  (Or test with the real Cloudflare runtime: npx wrangler dev.)
- Sends no-cache headers so your CSS/JS edits show up on a normal refresh.
- The service worker (offline + install) only runs on localhost or HTTPS,
  so with --lan the app works on your phone but won't be installable there.
"""
import argparse
import http.server
import mimetypes
import os
import re
import socket
import sys
import urllib.error
import urllib.request
import webbrowser
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))
START_PAGE = "/html/"

# Same TomTom proxy rules as worker/index.js
TOMTOM = "https://api.tomtom.com"
PROXY_PREFIX = "/api/tomtom"
ALLOWED_PATHS = re.compile(r"^/(maps/orbis/|search/2/(search|reverseGeocode)/|routing/1/calculateRoute/)")
FORWARD_HEADERS = ["Accept", "Accept-Language", "Content-Type", "TomTom-Api-Version", "Attributes"]


def read_dev_vars():
    """KEY=value lines from .dev.vars (the local stand-in for Cloudflare secrets)."""
    values = {}
    try:
        with open(os.path.join(ROOT, ".dev.vars"), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    values[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return values


TOMTOM_KEY = read_dev_vars().get("TOMTOM_KEY", "")

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
        if self.path.startswith(PROXY_PREFIX + "/"):
            return self.proxy_tomtom()
        super().do_GET()

    def do_POST(self):
        if self.path.startswith(PROXY_PREFIX + "/"):
            return self.proxy_tomtom()
        self.send_error(405)

    def send_json_error(self, status, message):
        body = ('{"error": "%s"}' % message).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_tomtom(self):
        if not TOMTOM_KEY:
            return self.send_json_error(503, "TOMTOM_KEY is not set. Copy .dev.vars.example to .dev.vars.")
        path, _, query = self.path[len(PROXY_PREFIX):].partition("?")
        if not ALLOWED_PATHS.match(path):
            return self.send_json_error(404, "Not found.")
        query = "&".join(p for p in query.split("&") if p and not p.startswith("key="))
        url = f"{TOMTOM}{path}?{query + '&' if query else ''}key={TOMTOM_KEY}"
        body = None
        if self.command == "POST":
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        req = urllib.request.Request(url, data=body, method=self.command)
        for h in FORWARD_HEADERS:
            if self.headers.get(h):
                req.add_header(h, self.headers[h])
        req.add_header("TomTom-Api-Key", TOMTOM_KEY)
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                status, headers, data = res.status, res.headers, res.read()
        except urllib.error.HTTPError as e:
            status, headers, data = e.code, e.headers, e.read()
        except OSError:
            return self.send_json_error(502, "Can't reach TomTom.")
        ctype = headers.get("Content-Type", "application/octet-stream")
        if re.search(r"json|text|xml", ctype):
            data = data.replace(TOMTOM_KEY.encode(), b"")  # never pass the key to the browser
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

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
    if not TOMTOM_KEY:
        print("  Note:    no TOMTOM_KEY in .dev.vars, so the map, search and routes won't load.")
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
