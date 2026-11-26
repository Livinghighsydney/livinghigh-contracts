"""Supabase Storage via its REST API — private bucket, signed URLs only."""
import httpx
from app.config import settings

_BASE = f"{settings.supabase_url}/storage/v1"
_BUCKET = settings.supabase_storage_bucket
_HEADERS = {
    "Authorization": f"Bearer {settings.supabase_service_key}",
    "apikey": settings.supabase_service_key,
}


async def upload(key: str, data: bytes, content_type: str = "application/pdf") -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_BASE}/object/{_BUCKET}/{key}",
            content=data,
            headers={**_HEADERS, "Content-Type": content_type, "x-upsert": "true"},
            timeout=60,
        )
        resp.raise_for_status()
    return key


async def download(key: str) -> bytes:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{_BASE}/object/{_BUCKET}/{key}", headers=_HEADERS, timeout=60)
        resp.raise_for_status()
    return resp.content


async def signed_url(key: str, expires_in: int = 3600) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_BASE}/object/sign/{_BUCKET}/{key}",
            json={"expiresIn": expires_in},
            headers=_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
    url = resp.json()["signedURL"]
    # Supabase returns a path relative to /storage/v1 — make it absolute for the browser.
    return url if url.startswith("http") else f"{_BASE}{url}"


async def delete(key: str) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{_BASE}/object/{_BUCKET}/{key}",
            headers=_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
