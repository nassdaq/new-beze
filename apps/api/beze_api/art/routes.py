"""Find art: photos and illustrations from Pixabay for backdrops and scene backgrounds.

The editor cannot hold the Pixabay key (it is a static site), so this service searches on its behalf and proxies
the download of a picked image (Pixabay's CDN is not reliably CORS-enabled and its terms prefer downloads over
hot-linking). Pixabay content is free to use without attribution (https://pixabay.com/service/license-summary/);
the search result carries the author and page URL so the editor can show them anyway.

    GET /api/v1/art/search?q=city+skyline+night&kind=photo&page=1
    GET /api/v1/art/fetch?url=https://pixabay.com/get/...   (only pixabay.com hosts)
"""
from __future__ import annotations

from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from ..settings import settings

router = APIRouter(prefix="/api/v1/art", tags=["art"])

PIXABAY_API = "https://pixabay.com/api/"
ALLOWED_HOSTS = ("pixabay.com", "cdn.pixabay.com")
MAX_FETCH_BYTES = 12 * 1024 * 1024


class ArtHit(BaseModel):
    id: int
    preview: str
    image: str
    width: int
    height: int
    tags: str
    author: str
    page: str


class ArtSearch(BaseModel):
    total: int
    hits: list[ArtHit]


async def pixabay_search(params: dict[str, Any]) -> dict[str, Any]:
    """Calls Pixabay; separated so tests can replace it."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(PIXABAY_API, params=params)
        r.raise_for_status()
        return r.json()


async def pixabay_fetch(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content, r.headers.get("content-type", "image/jpeg")


def _key() -> str:
    key = settings.pixabay_api_key
    if not key:
        raise HTTPException(status_code=503, detail="Find art is not configured: set BEZE_PIXABAY_API_KEY for the API service.")
    return key


@router.get("/search", response_model=ArtSearch)
async def search(q: str = Query(min_length=1, max_length=100), kind: Literal["photo", "illustration", "vector", "all"] = "all",
                 orientation: Literal["all", "horizontal", "vertical"] = "horizontal", page: int = Query(1, ge=1, le=20)) -> ArtSearch:
    params = {"key": _key(), "q": q, "image_type": kind, "orientation": orientation, "page": page, "per_page": 24, "safesearch": "true", "min_width": 640}
    try:
        data = await pixabay_search(params)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Pixabay answered {e.response.status_code}") from e
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Pixabay is not reachable: {e}") from e
    hits = [
        ArtHit(id=h["id"], preview=h.get("previewURL") or h["webformatURL"], image=h.get("largeImageURL") or h["webformatURL"],
               width=int(h.get("imageWidth") or h.get("webformatWidth") or 0), height=int(h.get("imageHeight") or h.get("webformatHeight") or 0),
               tags=h.get("tags", ""), author=h.get("user", ""), page=h.get("pageURL", ""))
        for h in data.get("hits", [])
    ]
    return ArtSearch(total=int(data.get("totalHits", len(hits))), hits=hits)


@router.get("/fetch")
async def fetch(url: str = Query(min_length=8, max_length=1000)) -> Response:
    host = urlparse(url).hostname or ""
    if not (host in ALLOWED_HOSTS or host.endswith(".pixabay.com")) or not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="only images hosted on pixabay.com can be fetched")
    _key()
    try:
        body, mime = await pixabay_fetch(url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"could not download the image: {e}") from e
    if len(body) > MAX_FETCH_BYTES:
        raise HTTPException(status_code=413, detail="the image is too large")
    return Response(content=body, media_type=mime.split(";")[0] or "image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
