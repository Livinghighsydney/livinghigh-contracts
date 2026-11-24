"""All Documenso API calls live here. Nothing else touches the API directly."""
import httpx
from app.config import settings
from app.utils.retry import request_with_retry

_BASE = settings.documenso_base_url
_HEADERS = {"Authorization": settings.documenso_api_key}


async def use_template(
    template_envelope_id: str,
    recipients: list[dict],
    prefill_fields: list[dict],
    external_id: str | None = None,
    send_now: bool = True,
) -> dict:
    body: dict = {
        "envelopeId": template_envelope_id,
        "recipients": recipients,
        "prefillFields": prefill_fields,
        "distributeDocument": send_now,
    }
    if external_id:
        body["externalId"] = external_id

    async with httpx.AsyncClient() as client:
        resp = await request_with_retry(
            client, "POST", f"{_BASE}/envelope/use",
            json=body, headers=_HEADERS, timeout=30,
        )
    return resp.json()


async def get_envelope(envelope_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await request_with_retry(
            client, "GET", f"{_BASE}/envelope/{envelope_id}",
            headers=_HEADERS, timeout=10,
        )
    return resp.json()


async def list_envelopes(page: int = 1, per_page: int = 20) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await request_with_retry(
            client, "GET", f"{_BASE}/envelope",
            params={"page": page, "perPage": per_page},
            headers=_HEADERS, timeout=10,
        )
    return resp.json()


async def download_envelope_item(item_id: str) -> bytes:
    async with httpx.AsyncClient() as client:
        resp = await request_with_retry(
            client, "GET", f"{_BASE}/envelope/item/{item_id}/download",
            headers=_HEADERS, timeout=60,
        )
    return resp.content
