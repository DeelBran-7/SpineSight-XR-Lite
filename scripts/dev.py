#!/usr/bin/env python3
"""Start the local API and Vite together; Ctrl+C stops both."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def port_is_listening(port: int) -> bool:
    # A recently closed TCP connection can prevent a bare bind during TIME_WAIT
    # even though Uvicorn/Vite can reuse the port. Probe an actual listener instead.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def terminate_process_tree(process: subprocess.Popen, *, force: bool = False) -> None:
    if os.name == "nt":
        # npm.cmd launches Vite below its own process; terminating only npm leaks Vite.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", *(["/F"] if force else [])],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        )
    else:
        try:
            # The group can outlive its launcher, so do not gate this on poll().
            os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)
        except ProcessLookupError:
            pass


def main() -> int:
    python = ROOT / "backend" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not python.exists() or not npm or not (ROOT / "frontend/node_modules").is_dir():
        print("Dependencies are missing. Run: python3 scripts/setup.py", file=sys.stderr)
        return 1
    for port in (8000, 5173):
        if port_is_listening(port):
            print(f"Port {port} is already in use. Stop the existing development server first.", file=sys.stderr)
            return 1
    processes: list[subprocess.Popen] = []

    def stop(*_args: object) -> None:
        for process in processes:
            terminate_process_tree(process)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        processes.append(subprocess.Popen(
            [str(python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=ROOT / "backend",
            start_new_session=os.name != "nt",
        ))
        processes.append(subprocess.Popen(
            [npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
            cwd=ROOT / "frontend",
            start_new_session=os.name != "nt",
        ))
        print("\nSpineSight XR Lite: http://localhost:5173\nAPI: http://127.0.0.1:8000/api/health\nPress Ctrl+C to stop both servers.\n", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.3)
        return next((p.returncode for p in processes if p.returncode not in (None, 0, -15)), 0)
    finally:
        stop()
        deadline = time.monotonic() + 8
        for process in processes:
            try:
                process.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                pass
        for process in processes:
            terminate_process_tree(process, force=True)
            process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
