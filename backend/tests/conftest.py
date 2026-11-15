"""Tests never read developer secrets or send paid upstream requests."""

import os

import httpx
import pytest

from app.core.config import Settings

# This runs before test modules import app.main and its default app instance.
Settings.model_config = {**Settings.model_config, "env_file": None}
os.environ["DEEPSEEK_API_KEY"] = ""


@pytest.fixture(autouse=True)
def forbid_real_http_transport(monkeypatch):
    async def blocked(*_args, **_kwargs):
        pytest.fail("A test attempted a real HTTP request; use MockTransport or ASGITransport.")

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", blocked)
