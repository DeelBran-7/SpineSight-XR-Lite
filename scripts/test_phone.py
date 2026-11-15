import base64
from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from unittest import TestCase

from scripts.phone import MAX_BODY, MAX_RESPONSE_BODY, make_handler


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
