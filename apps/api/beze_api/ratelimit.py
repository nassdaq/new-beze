import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    """Per-key request counter over a one-minute window. In-memory; per process."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        q = self._hits[key]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= self.per_minute:
            return False
        q.append(now)
        return True
