import asyncio
from uuid import uuid4

import pytest

from app.core.errors import ApiError
from app.schemas import Report
from app.services.report_requests import ReportRequests


def report():
    return Report(
        simple_summary="A geometric observation.", technical_summary="Landmark geometry.",
        findings={"shoulder": "Available.", "hip": "Available.", "torso": "Available."},
        limitations=["Camera placement matters."], disclaimer="Not a diagnosis.",
    )


def test_concurrent_retry_shares_generation_and_one_cancel_does_not_cancel_others():
    async def run():
        requests = ReportRequests()
        started, release = asyncio.Event(), asyncio.Event()
        calls = 0

        async def generate():
            nonlocal calls
            calls += 1
            started.set()
            await release.wait()
            return report()

        key = uuid4()
        first = asyncio.create_task(requests.get_or_create(key, generate, 60))
        await started.wait()
        second = asyncio.create_task(requests.get_or_create(key, generate, 60))
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        release.set()
        assert await second == report()
        assert await requests.get_or_create(key, generate, 60) == report()
        assert calls == 1
        await requests.aclose()

    asyncio.run(run())


def test_failed_generation_can_retry_and_success_expires_at_analysis_ttl():
    async def run():
        requests = ReportRequests(reuse_seconds=60)
        calls = 0

        async def generate():
            nonlocal calls
            calls += 1
            if calls == 1:
                raise ValueError("mock upstream failure")
            return report()

        key = uuid4()
        with pytest.raises(ValueError):
            await requests.get_or_create(key, generate, 60)
        assert await requests.get_or_create(key, generate, 0.01) == report()
        assert calls == 2
        await asyncio.sleep(0.02)
        assert not requests._tasks
        assert not requests._expiry_handles
        await requests.aclose()

    asyncio.run(run())


def test_capacity_does_not_cancel_in_flight_work_and_shutdown_releases_tasks():
    async def run():
        requests = ReportRequests(max_entries=1)
        started = asyncio.Event()

        async def generate():
            started.set()
            await asyncio.Event().wait()
            return report()

        pending = asyncio.create_task(requests.get_or_create(uuid4(), generate, 60))
        await started.wait()
        with pytest.raises(ApiError) as caught:
            await requests.get_or_create(uuid4(), generate, 60)
        assert caught.value.code == "AI_BUSY"
        await requests.aclose()
        with pytest.raises(asyncio.CancelledError):
            await pending
        assert not requests._tasks

    asyncio.run(run())


def test_expired_analysis_never_starts_an_upstream_report():
    async def run():
        requests = ReportRequests()

        async def generate():
            pytest.fail("An expired analysis generated a paid report.")

        with pytest.raises(ApiError) as caught:
            await requests.get_or_create(uuid4(), generate, 0)
        assert caught.value.code == "ANALYSIS_SESSION_EXPIRED"
        await requests.aclose()

    asyncio.run(run())
