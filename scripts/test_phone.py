import base64
from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
from tempfile import TemporaryDirectory
from threading import Event, Thread
from unittest import TestCase

from scripts.phone import BoundedThreadingHTTPServer, MAX_BODY, MAX_RESPONSE_BODY, make_handler


@contextmanager
def serve(handler):
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        try:
            yield server.server_port
        finally:
            server.shutdown()
            thread.join()


class PhoneGatewayTests(TestCase):
    def setUp(self):
        self.calls = []
        calls = self.calls

        class LocalAPI(BaseHTTPRequestHandler):
            def reply(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                calls.append((self.command, self.path, self.headers, body))
                payload = b'{"success":true}'
                if self.path == "/api/large-response":
                    payload = b"x" * (MAX_RESPONSE_BODY + 1)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            do_GET = reply
            do_POST = reply

            def log_message(self, *_args):
                pass

        backend_port = self.enterContext(serve(LocalAPI))
        directory = Path(self.enterContext(TemporaryDirectory()))
        (directory / "index.html").write_bytes(b"<!doctype html><title>Demo</title>")
        (directory / "app.js").write_bytes(b"console.log('demo');")
        (directory / "models").mkdir()
        (directory / "models/pose.task").write_bytes(b"model-test-fixture")
        (directory / "wasm").mkdir()
        (directory / "wasm/vision.wasm").write_bytes(b"wasm-test-fixture")
        (directory / "assets").mkdir()
        (directory / "assets/index-abc12345.js").write_bytes(b"hashed-test-fixture")
        self.port = self.enterContext(serve(make_handler(directory, "test-password", backend_port=backend_port)))
        self.authorization = "Basic " + base64.b64encode(b"observer:test-password").decode()

    def request(self, path, *, method="GET", headers=None, body=None, authorized=True):
        headers = dict(headers or {})
        if authorized:
            headers["Authorization"] = self.authorization
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            return response.status, response.headers, response.read()
        finally:
            connection.close()

    def test_unauthenticated_requests_are_challenged_before_routing(self):
        for path, headers in (("/", {}), ("/api/health", {"Authorization": "Basic wrong"})):
            with self.subTest(path=path):
                status, response_headers, body = self.request(path, headers=headers, authorized=False)
                self.assertEqual(status, 401)
                self.assertTrue(response_headers["WWW-Authenticate"].startswith("Basic "))
                self.assertEqual(body, b"")
        self.assertEqual(self.calls, [])

    def test_authorized_static_and_spa_navigation(self):
        status, headers, body = self.request("/results?from=capture")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"<!doctype html><title>Demo</title>")
        self.assertEqual(headers["Cache-Control"], "no-store")
        status, headers, body = self.request("/app.js")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"console.log('demo');")
        status, headers, body = self.request("/app.js", method="HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(int(headers["Content-Length"]), len(b"console.log('demo');"))
        self.assertEqual(body, b"")
        self.assertEqual(self.request("/missing.js")[0], 404)

    def test_authorized_api_preserves_payload_and_strips_credentials(self):
        status, headers, body = self.request("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(body, b'{"success":true}')

        photo = b"--sample\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\ntest\r\n--sample--\r\n"
        content_type = "multipart/form-data; boundary=sample"
        status, _, _ = self.request(
            "/api/v1/analyze?test=1",
            method="POST",
            headers={"Content-Type": content_type, "Cookie": "secret=example"},
            body=photo,
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(self.calls), 2)
        method, path, forwarded, payload = self.calls[-1]
        self.assertEqual((method, path, payload), ("POST", "/api/v1/analyze?test=1", photo))
        self.assertEqual(forwarded["Content-Type"], content_type)
        for _, _, received_headers, _ in self.calls:
            self.assertNotIn("Authorization", received_headers)
            self.assertNotIn("Cookie", received_headers)

    def test_oversized_upload_is_rejected_before_read_or_forward(self):
        status, _, _ = self.request(
            "/api/v1/analyze",
            method="POST",
            headers={"Content-Length": str(MAX_BODY + 1)},
        )
        self.assertEqual(status, 413)
        self.assertEqual(self.calls, [])

    def test_oversized_upstream_response_does_not_return_truncated_success(self):
        status, _, _ = self.request("/api/large-response")
        self.assertEqual(status, 502)

    def test_cross_origin_posts_cannot_use_cached_basic_credentials(self):
        for headers in (
            {"Origin": "https://evil.example"},
            {"Origin": "null"},
            {"Sec-Fetch-Site": "cross-site"},
            {"Sec-Fetch-Site": "same-site"},
            {"Host": "demo.example", "Origin": "http://demo.example"},
            {"Host": "demo.example", "Origin": "https://observer@demo.example"},
        ):
            with self.subTest(headers=headers):
                self.assertEqual(self.request("/api/v1/report", method="POST", headers=headers, body=b"{}")[0], 403)
        self.assertEqual(self.calls, [])
        status, headers, _ = self.request(
            "/api/v1/report", method="POST", body=b"{}",
            headers={"Host": "demo.example", "Origin": "https://demo.example", "Sec-Fetch-Site": "same-origin"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertEqual(len(self.calls), 1)

    def test_only_versioned_static_assets_get_private_cache_headers(self):
        cacheable = ["/models/pose.task?v=" + "a" * 64, "/wasm/vision.wasm?v=1.2.3", "/assets/index-abc12345.js"]
        for path in cacheable:
            with self.subTest(path=path):
                status, headers, _ = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["Cache-Control"], "private, max-age=3600")
                status, headers, _ = self.request(path, authorized=False)
                self.assertEqual(status, 401)
                self.assertEqual(headers["Cache-Control"], "no-store")
        for path in ("/", "/api/health", "/models/pose.task", "/wasm/vision.wasm", "/app.js?v=1.2.3"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[1]["Cache-Control"], "no-store")

    def test_connection_capacity_is_bounded_and_recovers(self):
        started, release = Event(), Event()

        class SlowHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                started.set()
                release.wait(timeout=2)
                self.send_response(204)
                self.end_headers()

            def log_message(self, *_args):
                pass

        with BoundedThreadingHTTPServer(("127.0.0.1", 0), SlowHandler, max_connections=1) as server:
            worker = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
            worker.start()
            first = socket.create_connection(server.server_address, timeout=2)
            try:
                first.sendall(b"GET / HTTP/1.0\r\n\r\n")
                self.assertTrue(started.wait(timeout=1))
                connection = HTTPConnection(*server.server_address, timeout=2)
                connection.request("GET", "/")
                self.assertEqual(connection.getresponse().status, 503)
                connection.close()
                release.set()
                self.assertIn(b"204", first.recv(1024))
            finally:
                release.set()
                first.close()
                server.shutdown()
                worker.join()
