#!/usr/bin/env python3
"""Serve the built app through a temporary, password-protected HTTPS tunnel."""
from __future__ import annotations

import argparse
import base64
import hmac
import http.client
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import threading
import time
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY = 8 * 1024 * 1024 + 65536
MAX_RESPONSE_BODY = 2 * 1024 * 1024
BODY_TIMEOUT_SECONDS = 30


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """A private demo should not allocate a thread per unbounded tunnel connection."""

    daemon_threads = True

    def __init__(self, *args, max_connections=16, **kwargs):
        self._connections = threading.BoundedSemaphore(max_connections)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self._connections.acquire(blocking=False):
            try:
                request.settimeout(1)
                request.sendall(b"HTTP/1.0 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._connections.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._connections.release()


def make_handler(directory: Path, password: str, *, backend_port: int = 8000):
    expected = "Basic " + base64.b64encode(f"observer:{password}".encode()).decode()
    api_slots = threading.BoundedSemaphore(4)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(directory), **kwargs)

        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, *_args):
            pass  # Never log authorization, submitted content, or URL parameters.

        def end_headers(self):
            policy = "private, max-age=3600" if getattr(self, "cache_static_asset", False) else "no-store"
            self.send_header("Cache-Control", policy)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("Permissions-Policy", "camera=(self), microphone=()")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
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
            if not api_slots.acquire(blocking=False):
                self.send_error(503, "The demo is busy. Please try again shortly.")
                return
            try:
                self.proxy_request()
            finally:
                api_slots.release()

        def proxy_request(self):
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
                body = bytearray() if length else None
                deadline = time.monotonic() + BODY_TIMEOUT_SECONDS
                while body is not None and len(body) < length:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError
                    self.connection.settimeout(remaining)
                    chunk = self.rfile.read1(min(65536, length - len(body)))
                    if not chunk:
                        break
                    body.extend(chunk)
                self.connection.settimeout(30)
            except TimeoutError:
                self.send_error(408, "Request body timed out")
                return
            if body is not None and len(body) != length:
                self.send_error(400, "Incomplete request")
                return
            connection = http.client.HTTPConnection("127.0.0.1", backend_port, timeout=95)
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
            self.cache_static_asset = False
            if not self.authorize():
                return
            parsed = urlsplit(self.path)
            if parsed.scheme or parsed.netloc:
                self.send_error(400, "Invalid request target")
                return
            path = parsed.path
            if self.command == "POST" and not self.same_origin_submission():
                self.send_error(403, "Open the private demo directly to submit a request.")
                return
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
            else:
                version = parse_qs(parsed.query).get("v", [""])[0]
                self.cache_static_asset = bool(
                    (path.startswith("/models/") and re.fullmatch(r"[a-f0-9]{64}", version))
                    or (path.startswith("/wasm/") and re.fullmatch(r"\d+\.\d+\.\d+(?:[-.][\w.-]+)?", version))
                    or (path.startswith("/assets/") and re.search(r"-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$", path))
                )
            if self.command == "HEAD":
                super().do_HEAD()
            else:
                super().do_GET()

        def same_origin_submission(self) -> bool:
            # Basic credentials are ambient browser credentials. CORS alone does not
            # stop a hostile site's form from spending API tokens via a cached login.
            fetch_site = self.headers.get("Sec-Fetch-Site")
            if fetch_site is not None and fetch_site != "same-origin":
                return False
            origin = self.headers.get("Origin")
            if origin is None:
                return True  # Local CLI clients do not emit browser Origin metadata.
            try:
                source = urlsplit(origin)
                host = self.headers.get("Host", "").lower()
                return (
                    source.netloc.lower() == host
                    and source.username is None
                    and source.password is None
                    and not (source.path or source.query or source.fragment)
                    and (
                        source.scheme == "https"
                        or (source.scheme == "http" and source.hostname in ("127.0.0.1", "localhost", "::1"))
                    )
                )
            except ValueError:
                return False

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
    server = BoundedThreadingHTTPServer(("127.0.0.1", 5180), make_handler(directory, password))
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
