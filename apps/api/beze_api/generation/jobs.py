"""In-memory job store. Same shape as the Postgres `jobs` table so the swap is mechanical."""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal

JobStatus = Literal["queued", "running", "succeeded", "failed"]


@dataclass
class Job:
    id: str
    kind: str
    status: JobStatus = "queued"
    input: dict[str, Any] = field(default_factory=dict)
    output: dict[str, Any] | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None


class JobStore:
    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        self._jobs: dict[str, Job] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    def create(self, kind: str, payload: dict[str, Any]) -> Job:
        self._sweep()
        job = Job(id=f"job_{uuid.uuid4().hex[:16]}", kind=kind, input=payload)
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def run(self, job: Job, fn: Callable[[Job], Awaitable[dict[str, Any]]]) -> None:
        async def runner() -> None:
            job.status = "running"
            try:
                job.output = await fn(job)
                job.status = "succeeded"
            except Exception as e:  # noqa: BLE001 - the job record is the error report
                job.error = str(e) or e.__class__.__name__
                job.status = "failed"
            finally:
                job.finished_at = time.time()

        task = asyncio.create_task(runner())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _sweep(self) -> None:
        cutoff = time.time() - self.ttl
        for jid in [j for j, job in self._jobs.items() if job.finished_at and job.finished_at < cutoff]:
            del self._jobs[jid]
