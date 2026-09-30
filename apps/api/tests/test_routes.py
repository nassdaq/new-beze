import asyncio

import httpx

from beze_api.main import create_app


async def test_generation_roundtrip(fixture_project):
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/v1/generations", json={"prompt": "Add an NPC named Mika", "project": fixture_project})
        assert r.status_code == 202, r.text
        job_id = r.json()["jobId"]
        for _ in range(50):
            s = await client.get(f"/api/v1/generations/{job_id}")
            if s.json()["status"] in ("succeeded", "failed"):
                break
            await asyncio.sleep(0.02)
        body = s.json()
        assert body["status"] == "succeeded", body
        assert body["output"]["operations"][1]["entity"]["name"] == "Mika"

        bad = await client.post("/api/v1/generations", json={"prompt": "x", "project": {"foo": 1}})
        assert bad.status_code == 422
        missing = await client.get("/api/v1/generations/job_nope")
        assert missing.status_code == 404
