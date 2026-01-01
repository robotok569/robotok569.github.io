#!/usr/bin/env python3
"""Dev server for the RoboTok project page.

    python3 serve.py            # http://localhost:8000
    python3 serve.py 8080       # custom port
    python3 serve.py --no-reload

Serves the site exactly as GitHub Pages will -- including byte ranges, which
the stdlib handler does not do and a <video> scrub bar needs -- plus two dev
conveniences:
  * source files are sent no-store, so a plain refresh always shows your edits
  * HTML pages get a tiny auto-reload script that polls for file changes and
    refreshes the browser for you (disable with --no-reload)

Only stdlib. Nothing here ships to GitHub Pages -- it never serves serve.py's
behavior, it just serves the same static files.
"""

import argparse
import functools
import http.server
import os
import re
import socketserver
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
WATCH_EXT = {".html", ".css", ".js", ".json", ".svg", ".md"}
IGNORE_DIRS = {".git", "node_modules", "__pycache__", "static/videos"}

# Only the single-range form; that is all a media element asks for.
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")

RELOAD_SNIPPET = """
<!-- injected by serve.py (dev only) -->
<script>
(function () {
  var current = null;
  function poll() {
    fetch('/__version', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (v) {
        if (current === null) { current = v; }
        else if (v !== current) { location.reload(); }
      })
      .catch(function () { /* server restarting */ })
      .finally(function () { setTimeout(poll, 700); });
  }
  poll();
})();
</script>
"""


def source_stamp() -> str:
    """A cheap fingerprint of every watched file's mtime + size."""
    parts = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel = os.path.relpath(dirpath, ROOT).replace(os.sep, "/")
        dirnames[:] = [
            d for d in dirnames
            if d not in IGNORE_DIRS
            and (rel + "/" + d).lstrip("./") not in IGNORE_DIRS
        ]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in WATCH_EXT:
                continue
            path = os.path.join(dirpath, name)
            try:
                st = os.stat(path)
            except OSError:
                continue
            parts.append("%s:%s:%s" % (path, st.st_mtime_ns, st.st_size))
    return str(hash("|".join(sorted(parts))))


class Handler(http.server.SimpleHTTPRequestHandler):
    live_reload = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # Set per response by do_GET: true for a plain file off disk, false for the
    # two bodies this server makes up (the version stamp and injected HTML),
    # which cannot honour a range for the bytes they advertise.
    _ranged = False

    def end_headers(self):
        ext = os.path.splitext(self.path.split("?")[0])[1].lower()
        if ext in WATCH_EXT or not ext:
            # Source files: never cached, so an edit shows on a plain refresh.
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        else:
            # Media: revalidated every time, but allowed in the cache. no-store
            # here would make the browser refetch a video on every seek.
            self.send_header("Cache-Control", "no-cache")
        if self._ranged:
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_range(self):
        """Answer a Range request from disk. True if it handled the request.

        SimpleHTTPRequestHandler ignores Range entirely and replies 200 with the
        whole file. A browser reads that as "not seekable" and leaves the video
        scrub bar inert -- a bug you only see locally, since GitHub Pages serves
        ranges.
        """
        header = self.headers.get("Range")
        if not header:
            return False
        m = RANGE_RE.match(header.strip())
        if not m or m.group(1) == m.group(2) == "":
            return False                       # malformed: let the 200 path answer
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return False
        size = os.path.getsize(path)
        if m.group(1) == "":                   # bytes=-N -- the final N bytes
            start, end = max(0, size - int(m.group(2))), size - 1
        else:
            start = int(m.group(1))
            end = min(int(m.group(2)) if m.group(2) else size - 1, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return True
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Last-Modified", self.date_time_string(os.stat(path).st_mtime))
        self.end_headers()
        left = end - start + 1
        with open(path, "rb") as fh:
            fh.seek(start)
            while left > 0:
                chunk = fh.read(min(64 * 1024, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)
        return True

    def do_GET(self):
        self._ranged = False
        if self.path.split("?")[0] == "/__version":
            body = source_stamp().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.live_reload:
            path = self.translate_path(self.path)
            if os.path.isdir(path):
                path = os.path.join(path, "index.html")
            if path.endswith(".html") and os.path.isfile(path):
                with open(path, "rb") as fh:
                    body = fh.read()
                if b"</body>" in body:
                    body = body.replace(b"</body>", RELOAD_SNIPPET.encode() + b"</body>", 1)
                else:
                    body += RELOAD_SNIPPET.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        self._ranged = True
        if self.send_range():
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        # args are not always strings (log_error passes an HTTPStatus), so format first.
        try:
            text = fmt % args
        except Exception:
            text = str(fmt)
        # Quieter: skip the reload poll spam.
        if "__version" in text:
            return
        sys.stderr.write("  %s\n" % text)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("port", nargs="?", type=int, default=8000)
    ap.add_argument("--no-reload", action="store_true", help="serve without the auto-reload script")
    args = ap.parse_args()

    handler = functools.partial(Handler)
    Handler.live_reload = not args.no_reload

    with Server(("127.0.0.1", args.port), handler) as httpd:
        print("\n  RoboTok site  ->  http://localhost:%d" % args.port)
        print("  auto-reload   ->  %s" % ("on (edit a file, the browser refreshes)" if Handler.live_reload else "off"))
        print("  root          ->  %s" % ROOT)
        print("  ctrl-c to stop\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped.")


if __name__ == "__main__":
    main()
