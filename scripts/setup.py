#!/usr/bin/env python3
"""Repeatable local setup for macOS, Linux, and Windows, without overwriting secrets."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str], cwd: Path = ROOT) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def main() -> None:
    if sys.version_info[:2] != (3, 11):
        raise SystemExit("Run setup with Python 3.11: python3.11 scripts/setup.py (Windows: py -3.11 scripts/setup.py).")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise SystemExit("Install Node.js 22.12+ or a newer supported LTS, then rerun setup.")
    venv = ROOT / "backend/.venv"
    python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        run([sys.executable, "-m", "venv", str(venv)])
    run([str(python), "-m", "pip", "install", "-r", "requirements.lock.txt"], ROOT / "backend")
    run([npm, "ci"], ROOT / "frontend")
    run([str(python), str(ROOT / "scripts/download_model.py")])
    for folder in (ROOT / "backend", ROOT / "frontend"):
        example, target = folder / ".env.example", folder / ".env"
        if example.exists() and not target.exists():
            shutil.copyfile(example, target)
            if os.name != "nt":
                target.chmod(0o600)
    print("\nSetup complete. Add your DeepSeek key to backend/.env, then run: python3 scripts/dev.py")


if __name__ == "__main__":
    main()
