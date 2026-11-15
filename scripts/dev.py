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


def main() -> int:
    python = ROOT / "backend" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not python.exists() or not npm or not (ROOT / "frontend/node_modules").is_dir():
        print("Dependencies are missing. Run: python3 scripts/setup.py", file=sys.stderr)
        return 1
    for port in (8000, 5173):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                print(f"Port {port} is already in use. Stop the existing development server first.", file=sys.stderr)
                return 1
    processes: list[subprocess.Popen] = []

    def stop(*_args: object) -> None:
        for process in processes:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        processes.append(subprocess.Popen(
            [str(python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=ROOT / "backend",
        ))
        processes.append(subprocess.Popen(
            [npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
            cwd=ROOT / "frontend",
        ))
        print("\nSpineSight XR Lite: http://localhost:5173\nAPI: http://127.0.0.1:8000/api/health\nPress Ctrl+C to stop both servers.\n", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.3)
        return next((p.returncode for p in processes if p.returncode not in (None, 0, -15)), 0)
    finally:
        stop()
        for process in processes:
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
