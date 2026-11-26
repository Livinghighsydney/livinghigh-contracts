"""All Documenso API calls live here. Nothing else touches the API directly."""
import json
import httpx
from app.config import settings
from app.utils.retry import request_with_retry

_BASE = settings.documenso_base_url
_HEADERS = {"Authorization": settings.documenso_api_key}


# Every email type Documenso can send (from the v2 spec: override.emailSettings). All switched off.
_DOCUMENSO_EMAILS = (
    "recipientSigningRequest", "recipientRemoved", "recipientSigned", "documentPending",
    "documentCompleted", "documentDeleted", "ownerDocumentCompleted", "ownerRecipientExpired",
    "ownerDocumentCreated",
)


class DocumensoError(ValueError):
    """Raised when Documenso rejects a request. Message is safe to show staff (no API key)."""


async def _call(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> httpx.Response:
    try:
        return await request_with_retry(client, method, url, headers=_HEADERS, **kwargs)
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json().get("message", "")
        except Exception:
            detail = ""
        raise DocumensoError(f"Documenso error {exc.response.status_code}: {str(detail)[:200]}") from exc


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
    # Documenso must never email anyone: our app sends the signing request and the signed
    # copy from Living High's own mailbox. We read each recipient's signingUrl from the response.
    body["override"] = {
        "distributionMethod": "NONE",
        "emailSettings": {k: False for k in _DOCUMENSO_EMAILS},
    }

    # The v2 spec defines this endpoint as multipart/form-data with a JSON "payload" part.
    async with httpx.AsyncClient() as client:
        resp = await _call(
            client, "POST", f"{_BASE}/envelope/use",
            files={"payload": (None, json.dumps(body), "application/json")},
            timeout=30,
        )
    return resp.json()


async def get_envelope(envelope_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await _call(
            client, "GET", f"{_BASE}/envelope/{envelope_id}",
            timeout=10,
        )
    return resp.json()


async def list_envelopes(page: int = 1, per_page: int = 20) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await _call(
            client, "GET", f"{_BASE}/envelope",
            params={"page": page, "perPage": per_page},
            timeout=10,
        )
    return resp.json()


async def create_template(title: str, pdf_bytes: bytes, filename: str = "template.pdf") -> dict:
    payload = json.dumps({
        "type": "TEMPLATE",
        "title": title,
        "recipients": [
            {"email": "tenant@placeholder.invalid", "name": "Tenant", "role": "SIGNER"},
        ],
    })
    async with httpx.AsyncClient() as client:
        resp = await _call(
            client, "POST", f"{_BASE}/envelope/create",
            data={"payload": payload},
            files={"files": (filename, pdf_bytes, "application/pdf")},  # spec: "files" (array)
            timeout=60,
        )
    return resp.json()


async def create_fields(envelope_id: str, fields_data: list[dict]) -> list[dict]:
    """Returns the created fields (with their Documenso IDs) in the same order as sent."""
    async with httpx.AsyncClient() as client:
        resp = await _call(
            client, "POST", f"{_BASE}/envelope/field/create-many",
            json={"envelopeId": envelope_id, "data": fields_data},
            timeout=30,
        )
    return resp.json().get("data", [])


async def delete_field(field_id: int) -> None:
    async with httpx.AsyncClient() as client:
        await _call(
            client, "POST", f"{_BASE}/envelope/field/delete",
            json={"fieldId": field_id},
            timeout=15,
        )


async def download_envelope_item(item_id: str, version: str = "signed") -> bytes:
    """The completed document with all signatures (Documenso appends the certificate page)."""
    async with httpx.AsyncClient() as client:
        resp = await _call(
            client, "GET", f"{_BASE}/envelope/item/{item_id}/download",
            params={"version": version},
            timeout=60,
            follow_redirects=True,
        )
    return resp.content


async def download_certificate(envelope_id: str) -> bytes:
    async with httpx.AsyncClient() as client:
        resp = await _call(
            client, "GET", f"{_BASE}/envelope/{envelope_id}/certificate/download",
            timeout=60,
            follow_redirects=True,
        )
    return resp.content
