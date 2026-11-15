"""Short-lived report retry reuse; never stores photos or conversations."""

import asyncio
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from uuid import UUID

from app.core.errors import ApiError
from app.schemas import Report


class ReportRequests:
    def __init__(self, reuse_seconds: float = 60, max_entries: int = 64) -> None:
        self._reuse_seconds = reuse_seconds
        self._max_entries = max_entries
        self._tasks: OrderedDict[UUID, asyncio.Task[Report]] = OrderedDict()
        self._expiry_handles: dict[UUID, asyncio.TimerHandle] = {}

    def _remove(self, key: UUID, task: asyncio.Task[Report]) -> None:
        if self._tasks.get(key) is task:
            self._tasks.pop(key)
            handle = self._expiry_handles.pop(key, None)
            if handle is not None:
                handle.cancel()

    async def get_or_create(
        self,
        key: UUID,
        generate: Callable[[], Awaitable[Report]],
        analysis_ttl: float,
    ) -> Report:
        if analysis_ttl <= 0:
            raise ApiError(404, "ANALYSIS_SESSION_EXPIRED", "The analysis session has expired. Capture a new photo to continue.")
        task = self._tasks.get(key)
        if task is None:
            # Evict only completed results; an in-flight request must keep its shared task.
            if len(self._tasks) >= self._max_entries:
                for old_key, old_task in self._tasks.items():
                    if old_task.done():
                        self._remove(old_key, old_task)
                        break
                else:
                    raise ApiError(429, "AI_BUSY", "The AI service is busy. Please try again shortly.")
            loop = asyncio.get_running_loop()
            analysis_expires = loop.time() + analysis_ttl
            task = loop.create_task(generate())
            self._tasks[key] = task

            def completed(done: asyncio.Task[Report]) -> None:
                # Retrieve failures even if every HTTP subscriber disconnected.
                if done.cancelled() or done.exception() is not None:
                    self._remove(key, done)
                    return
                ttl = min(self._reuse_seconds, analysis_expires - loop.time())
                if ttl <= 0:
                    self._remove(key, done)
                elif self._tasks.get(key) is done:
                    self._expiry_handles[key] = loop.call_later(ttl, self._remove, key, done)

            task.add_done_callback(completed)
        # A browser leaving the report must not cancel another subscriber or waste a paid call.
        return await asyncio.shield(task)

    async def aclose(self) -> None:
        tasks = list(self._tasks.values())
        for handle in self._expiry_handles.values():
            handle.cancel()
        self._expiry_handles.clear()
        self._tasks.clear()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
