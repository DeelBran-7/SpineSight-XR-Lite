import errno
import os
import signal
import socket
import subprocess
import sys
from unittest import TestCase, skipIf
from unittest.mock import Mock, patch

from scripts.dev import port_is_listening, terminate_process_tree


class DevelopmentLauncherTests(TestCase):
    def test_port_probe_detects_a_live_listener(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            self.assertTrue(port_is_listening(port))
        self.assertFalse(port_is_listening(port))

    @skipIf(os.name == "nt", "POSIX TIME_WAIT bind behavior")
    def test_time_wait_is_not_mistaken_for_a_running_service(self):
        with socket.socket() as listener, socket.socket() as client:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            client.connect(("127.0.0.1", port))
            accepted, _ = listener.accept()
            with accepted:
                # The server actively closes first, leaving this port in TIME_WAIT.
                accepted.shutdown(socket.SHUT_WR)
                self.assertEqual(client.recv(1), b"")
                client.shutdown(socket.SHUT_WR)
                self.assertEqual(accepted.recv(1), b"")
        with socket.socket() as probe:
            with self.assertRaises(OSError) as caught:
                probe.bind(("127.0.0.1", port))
            self.assertEqual(caught.exception.errno, errno.EADDRINUSE)
        self.assertFalse(port_is_listening(port))

    @skipIf(os.name == "nt", "POSIX process group behavior")
    def test_stopping_launcher_also_stops_its_child(self):
        code = """
import signal, subprocess, sys, time
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
def stop(*_args):
    child.wait(timeout=2)
    sys.exit(0)
signal.signal(signal.SIGTERM, stop)
print(child.pid, flush=True)
while True:
    time.sleep(1)
"""
        process = subprocess.Popen(
            [sys.executable, "-c", code], start_new_session=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            child_pid = int(process.stdout.readline())
            terminate_process_tree(process)
            _, errors = process.communicate(timeout=4)
            self.assertEqual(process.returncode, 0, errors)
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)
        finally:
            terminate_process_tree(process, force=True)
            process.wait(timeout=4)
            process.stdout.close()
            process.stderr.close()

    @skipIf(os.name == "nt", "POSIX process group behavior")
    def test_exited_launcher_does_not_skip_remaining_process_group(self):
        process = Mock(pid=12345)
        process.poll.return_value = 0
        with patch("scripts.dev.os.killpg") as kill_group:
            terminate_process_tree(process, force=True)
        kill_group.assert_called_once_with(12345, signal.SIGKILL)
