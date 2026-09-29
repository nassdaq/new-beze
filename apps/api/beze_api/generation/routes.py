from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..ai.content_pipeline import generate_content
from ..ai.factory import make_text_provider
from ..ai.types import ProviderError
from ..ratelimit import SlidingWindowLimiter
from ..settings import settings
from .jobs import Job, JobStore

router = APIRouter(prefix="/api/v1/generations", tags=["generations"])
jobs = JobStore(ttl_seconds=settings.job_ttl_seconds)
limiter = SlidingWindowLimiter(settings.jobs_per_minute_per_ip)
_provider = None


def provider():
    global _provider
    if _provider is None:
        _provider = make_text_provider(settings)
    return _provider


class GenerationRequest(BaseModel):
    kind: str = Field(default="content", pattern="^content$")
    prompt: str = Field(min_length=1)
    project: dict[str, Any]
    feedback: str | None = Field(default=None, max_length=8000)


class GenerationAccepted(BaseModel):
    jobId: str


class GenerationStatus(BaseModel):
    jobId: str
    status: str
    output: dict[str, Any] | None = None
    error: str | None = None


def _problem(status: int, title: str, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"type": title, "title": title, "detail": detail})


@router.post("", status_code=202, response_model=GenerationAccepted)
async def create_generation(body: GenerationRequest, request: Request) -> GenerationAccepted:
    client_key = request.client.host if request.client else "unknown"
    if not limiter.allow(client_key):
        raise _problem(429, "rate_limited", f"at most {settings.jobs_per_minute_per_ip} generations per minute")
    if len(body.prompt) > settings.prompt_max_chars:
        raise _problem(413, "prompt_too_long", f"prompts are limited to {settings.prompt_max_chars} characters")
    if len(json.dumps(body.project)) > settings.project_max_bytes:
        raise _problem(413, "project_too_large", "project document exceeds the size limit")
    if body.project.get("schemaVersion") is None or "scenes" not in body.project:
        raise _problem(422, "invalid_project", "project does not look like a Beze document")

    job = jobs.create("generation.content", {"prompt": body.prompt})

    async def work(_: Job) -> dict[str, Any]:
        try:
            out = await generate_content(
                provider=provider(),
                schemas_dir=settings.schemas_dir,
                project=body.project,
                prompt=body.prompt,
                feedback=body.feedback,
                max_tokens=settings.ai_max_tokens,
                max_iterations=settings.ai_max_iterations,
            )
        except ProviderError as e:
            raise RuntimeError(str(e)) from e
        return {
            "operations": out.operations,
            "summary": out.summary,
            "usage": {"inputTokens": out.usage.input_tokens, "outputTokens": out.usage.output_tokens},
            "iterations": out.iterations,
            "rejectedCalls": out.rejected_calls,
            "warnings": out.warnings,
            "provider": provider().name,
            "model": out.model,
        }

    jobs.run(job, work)
    return GenerationAccepted(jobId=job.id)


@router.get("/{job_id}", response_model=GenerationStatus)
async def get_generation(job_id: str) -> GenerationStatus:
    job = jobs.get(job_id)
    if job is None:
        raise _problem(404, "not_found", "no such generation")
    return GenerationStatus(jobId=job.id, status=job.status, output=job.output, error=job.error)
