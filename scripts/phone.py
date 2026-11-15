#!/usr/bin/env python3
"""Serve the built app through a temporary, password-protected HTTPS tunnel."""
from __future__ import annotations

import argparse
import base64
import hmac
import http.client
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import shutil
import subprocess
import threading
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY = 8 * 1024 * 1024 + 65536
MAX_RESPONSE_BODY = 2 * 1024 * 1024


def make_handler(directory: Path, password: str, *, backend_port: int = 8000):
    expected = "Basic " + base64.b64encode(f"observer:{password}".encode()).decode()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(directory), **kwargs)

        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, *_args):
            pass  # Never log authorization, submitted content, or URL parameters.

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("Permissions-Policy", "camera=(self), microphone=()")
            super().end_headers()

        def authorize(self) -> bool:
            received = self.headers.get("Authorization", "")
            if hmac.compare_digest(received.encode(), expected.encode()):
                return True
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="SpineSight private demo", charset="UTF-8"')
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.close_connection = True
            return False

        def proxy(self):
            lengths = self.headers.get_all("Content-Length", [])
            if len(lengths) > 1 or self.headers.get("Transfer-Encoding"):
                self.send_error(400, "Unsupported request framing")
                return
            try:
                length = int(lengths[0]) if lengths else 0
            except ValueError:
                self.send_error(400, "Invalid content length")
                return
            if not 0 <= length <= MAX_BODY:
                self.send_error(413, "Upload exceeds 8 MiB limit")
                return
            try:
                body = self.rfile.read(length) if length else None
            except TimeoutError:
                self.send_error(408, "Request body timed out")
                return
            if body is not None and len(body) != length:
                self.send_error(400, "Incomplete request")
                return
            connection = http.client.HTTPConnection("127.0.0.1", backend_port, timeout=65)
            try:
                headers = {"Content-Type": self.headers.get("Content-Type", "application/json")}
                connection.request(self.command, self.path, body=body, headers=headers)
                response = connection.getresponse()
                payload = response.read(MAX_RESPONSE_BODY + 1)
                content_type = response.getheader("Content-Type", "application/json")
            except (OSError, http.client.HTTPException):
                self.send_error(502, "Local API is unavailable")
                return
            finally:
                connection.close()
            if len(payload) > MAX_RESPONSE_BODY:
                self.send_error(502, "Local API response is too large")
                return
            self.send_response(response.status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

        def route(self):
            if not self.authorize():
                return
            path = urlsplit(self.path).path
            if path.startswith("/api/"):
                self.proxy()
                return
            if self.command not in ("GET", "HEAD"):
                self.send_error(405)
                return
            local = Path(self.translate_path(path)).resolve()
            if not local.is_relative_to(directory.resolve()) or any(part.startswith(".") for part in local.relative_to(directory.resolve()).parts):
                self.send_error(404)
                return
            if not local.is_file():
                if Path(path).suffix:
                    self.send_error(404)
                    return
                self.path = "/index.html"
            if self.command == "HEAD":
                super().do_HEAD()
            else:
                super().do_GET()

        do_GET = route
        do_HEAD = route
        do_POST = route

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-tunnel", action="store_true", help="Only run the loopback gateway (for verification)")
    args = parser.parse_args()
    directory = ROOT / "frontend/dist"
    if not (directory / "index.html").is_file():
        raise SystemExit("Build the app first: cd frontend && npm run build")
    cloudflared = shutil.which("cloudflared")
    if not args.no_tunnel and not cloudflared:
        raise SystemExit("Install cloudflared first (macOS: brew install cloudflared).")
    password = secrets.token_urlsafe(12)
    server = ThreadingHTTPServer(("127.0.0.1", 5180), make_handler(directory, password))
    server.daemon_threads = True
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    print(f"Private demo login\nUsername: observer\nPassword: {password}\nKeep this terminal open. Ctrl+C stops access.\n", flush=True)
    process = None
    try:
        if args.no_tunnel:
            print("Gateway: http://127.0.0.1:5180", flush=True)
            worker.join()
        else:
            process = subprocess.Popen([cloudflared, "tunnel", "--url", "http://127.0.0.1:5180", "--protocol", "http2", "--no-autoupdate"])
            process.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
