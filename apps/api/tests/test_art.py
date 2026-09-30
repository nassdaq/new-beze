import httpx

from beze_api.art import routes as art
from beze_api.main import create_app
from beze_api.settings import settings


async def test_search_maps_pixabay_hits(monkeypatch):
    monkeypatch.setattr(settings, "pixabay_api_key", "test-key")
    seen: dict = {}

    async def fake_search(params):
        seen.update(params)
        return {"totalHits": 1, "hits": [{"id": 7, "previewURL": "https://cdn.pixabay.com/p.jpg", "webformatURL": "https://pixabay.com/get/w.jpg",
                                          "largeImageURL": "https://pixabay.com/get/l.jpg", "imageWidth": 1920, "imageHeight": 1080,
                                          "tags": "city, night", "user": "someone", "pageURL": "https://pixabay.com/photos/7/"}]}

    monkeypatch.setattr(art, "pixabay_search", fake_search)
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/v1/art/search", params={"q": "city night", "kind": "photo"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 1
        assert body["hits"][0] == {"id": 7, "preview": "https://cdn.pixabay.com/p.jpg", "image": "https://pixabay.com/get/l.jpg", "width": 1920, "height": 1080,
                                   "tags": "city, night", "author": "someone", "page": "https://pixabay.com/photos/7/"}
        assert seen["key"] == "test-key" and seen["image_type"] == "photo" and seen["safesearch"] == "true"


async def test_search_without_key_is_503_and_fetch_is_host_restricted(monkeypatch):
    monkeypatch.setattr(settings, "pixabay_api_key", "")
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/v1/art/search", params={"q": "sky"})
        assert r.status_code == 503
        monkeypatch.setattr(settings, "pixabay_api_key", "k")
        bad = await client.get("/api/v1/art/fetch", params={"url": "https://example.com/x.jpg"})
        assert bad.status_code == 400

        async def fake_fetch(url):
            return b"\xff\xd8bytes", "image/jpeg"

        monkeypatch.setattr(art, "pixabay_fetch", fake_fetch)
        ok = await client.get("/api/v1/art/fetch", params={"url": "https://pixabay.com/get/l.jpg"})
        assert ok.status_code == 200 and ok.headers["content-type"] == "image/jpeg" and ok.content.startswith(b"\xff\xd8")
