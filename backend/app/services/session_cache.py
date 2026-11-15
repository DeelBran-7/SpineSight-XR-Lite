from collections import OrderedDict
from collections.abc import Callable
from threading import Lock
from time import monotonic
from uuid import UUID

from app.core.errors import ApiError
from app.schemas import PostureAnalysisResponse


class SessionCache:
    def __init__(
        self,
        ttl_seconds: float = 30 * 60,
        max_entries: int = 256,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._entries: OrderedDict[UUID, tuple[float, PostureAnalysisResponse]] = OrderedDict()
        self._lock = Lock()

    def _expire(self, now: float) -> None:
        while self._entries:
            created, _ = next(iter(self._entries.values()))
            if now - created < self._ttl:
                break
            self._entries.popitem(last=False)

    def add(self, analysis: PostureAnalysisResponse) -> None:
        with self._lock:
            now = self._clock()
            self._expire(now)
            self._entries[analysis.analysis_id] = (now, analysis)
            self._entries.move_to_end(analysis.analysis_id)
            if len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def require(self, analysis_id: UUID) -> PostureAnalysisResponse:
        with self._lock:
            self._expire(self._clock())
            entry = self._entries.get(analysis_id)
        if entry is None:
            raise ApiError(404, "ANALYSIS_SESSION_EXPIRED", "The analysis session has expired. Capture a new photo to continue.")
        return entry[1]
