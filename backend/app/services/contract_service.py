"""Business logic layer. Controllers call this; this calls models + external services."""
import asyncio
import logging
import re

from app.models.contract import Contract, ContractStatus
from app.models.event import Event
from app.models.file import ContractFile, FileKind
from app.models.recipient import Recipient
from app.models.template import Template
from app.schemas.contract import CreateContractRequest
from app.services import documenso_client, email_service, storage
from app.utils.hashing import sha256_hex

logger = logging.getLogger(__name__)

# Documenso webhook event names (docs.documenso.com/docs/developers/webhooks/events).
_WEBHOOK_STATUS_MAP: dict[str, ContractStatus] = {
    "DOCUMENT_SENT": ContractStatus.SENT,
    "DOCUMENT_OPENED": ContractStatus.VIEWED,
    "DOCUMENT_COMPLETED": ContractStatus.COMPLETED,
    "DOCUMENT_REJECTED": ContractStatus.REJECTED,
    "DOCUMENT_CANCELLED": ContractStatus.CANCELLED,
}

# Status only moves forward. Webhooks can arrive late, twice, or out of order.
_RANK: dict[ContractStatus, int] = {
    ContractStatus.DRAFT: 0,
    ContractStatus.SENT: 1,
    ContractStatus.VIEWED: 2,
    ContractStatus.COMPLETED: 3,
    ContractStatus.REJECTED: 3,
    ContractStatus.CANCELLED: 3,
    ContractStatus.ARCHIVED: 4,
}
_FINAL = {ContractStatus.COMPLETED, ContractStatus.REJECTED, ContractStatus.CANCELLED, ContractStatus.ARCHIVED}

# One archive at a time per contract (Documenso retries webhooks).
_archive_locks: dict[str, asyncio.Lock] = {}


async def create_contract(data: CreateContractRequest) -> Contract:
    contract = await Contract.create(**data.model_dump(), status=ContractStatus.DRAFT)
    await _log(contract, "contract.created", {"created_by": data.created_by})
    return contract


async def send_contract(
    contract: Contract, subject: str | None = None, message: str | None = None
) -> Contract:
    tmpl = await Template.get_or_none(template_key=contract.template_key, is_active=True)
    if not tmpl or not tmpl.documenso_template_id:
        raise ValueError(f"No active template found for key '{contract.template_key}'. Upload a template first.")
    if not tmpl.recipient_map or "tenant" not in tmpl.recipient_map:
        raise ValueError(f"Template '{contract.template_key}' has no tenant recipient. Re-upload the template.")
    if not tmpl.fields_json:
        raise ValueError(f"Template '{contract.template_key}' has no fields yet. Open it on the Templates page and add fields.")
    # Fail before touching Documenso if we can't email the tenant.
    email_service.ensure_configured()

    tenant_recipient_id = tmpl.recipient_map["tenant"]
    result = await documenso_client.use_template(
        template_envelope_id=tmpl.documenso_template_id,
        recipients=[_build_recipient(contract, tmpl.recipient_map)],
        prefill_fields=_build_prefill(contract, tmpl.fields_json or []),
        external_id=str(contract.id),
        send_now=True,
    )

    envelope_id = result.get("id") or result.get("envelopeId")
    recipients = result.get("recipients") or []
    signer = next((r for r in recipients if r.get("email") == contract.tenant_email), None) or (
        recipients[0] if recipients else {}
    )
    signing_url = signer.get("signingUrl")
    if not envelope_id or not signing_url:
        raise ValueError("Documenso did not return a signing link. Please try again.")

    contract.documenso_envelope_id = envelope_id
    contract.status = ContractStatus.SENT
    await contract.save(update_fields=["documenso_envelope_id", "status", "updated_at"])
    await Recipient.create(
        contract=contract,
        name=contract.tenant_name,
        email=contract.tenant_email,
        role="tenant",
        documenso_recipient_id=signer.get("id") or tenant_recipient_id,
        signing_url=signing_url,
    )
    await _log(contract, "contract.sent", {"envelope_id": envelope_id})

    try:
        await email_service.send_signing_request(
            to_email=contract.tenant_email,
            to_name=contract.tenant_name,
            signing_url=signing_url,
            document_title=tmpl.name,
            subject=(subject or "").strip() or None,
            message=(message or "").strip() or None,
        )
    except email_service.EmailError as exc:
        await _log(contract, "email.signing_request_failed", {"reason": str(exc)})
        raise ValueError(
            f"The contract was created, but the email could not be sent: {exc} "
            "Open the contract and click 'Resend email'."
        ) from exc
    await _log(contract, "email.signing_request_sent", {"custom_text": bool(subject or message)})
    return contract


async def resend_email(contract: Contract) -> str:
    """Send the right email again: the signing link (not yet signed) or the signed copy."""
    if contract.status in (ContractStatus.SENT, ContractStatus.VIEWED):
        recipient = await Recipient.filter(contract=contract, role="tenant").first()
        if not recipient or not recipient.signing_url:
            raise ValueError("No signing link is stored for this contract.")
        tmpl = await Template.get_or_none(template_key=contract.template_key)
        await email_service.send_signing_request(
            to_email=contract.tenant_email,
            to_name=contract.tenant_name,
            signing_url=recipient.signing_url,
            document_title=tmpl.name if tmpl else "tenancy agreement",
        )
        await _log(contract, "email.signing_request_resent", {})
        return "signing_request"

    if contract.status in (ContractStatus.COMPLETED, ContractStatus.ARCHIVED):
        signed = await ContractFile.filter(contract=contract, kind=FileKind.SIGNED_PDF).first()
        if not signed:
            await archive_and_notify(str(contract.id))
            return "completed_copy"
        await _send_completed_copy(contract, await storage.download(signed.storage_key))
        await _log(contract, "email.completed_copy_resent", {})
        return "completed_copy"

    raise ValueError(f"No email to resend for a contract that is '{contract.status.value}'.")


async def handle_webhook(event_type: str, payload: dict) -> str | None:
    """Apply a Documenso webhook. Returns the contract id if it needs archiving."""
    envelope_id = payload.get("envelopeId") or ""
    contract = await Contract.get_or_none(documenso_envelope_id=envelope_id) if envelope_id else None
    if not contract and payload.get("externalId"):
        contract = await Contract.get_or_none(id=payload["externalId"])
    if not contract:
        return None

    # Audit log without personal data: Documenso payloads include recipient names/emails.
    await _log(contract, f"webhook.{event_type.lower()}", {"envelope_id": envelope_id, "status": payload.get("status")})

    new_status = _WEBHOOK_STATUS_MAP.get(event_type)
    if new_status and _RANK[new_status] > _RANK[contract.status]:
        contract.status = new_status
        await contract.save(update_fields=["status", "updated_at"])

    if event_type == "DOCUMENT_COMPLETED":
        return str(contract.id)
    return None


async def archive_and_notify(contract_id: str) -> None:
    """Store the signed PDF + certificate in our storage, then email the signed copy. Safe to repeat."""
    lock = _archive_locks.setdefault(contract_id, asyncio.Lock())
    async with lock:
        contract = await Contract.get_or_none(id=contract_id)
        if not contract or not contract.documenso_envelope_id:
            return

        signed_pdf = await _archive_files(contract)

        if contract.status != ContractStatus.ARCHIVED:
            contract.status = ContractStatus.ARCHIVED
            await contract.save(update_fields=["status", "updated_at"])

        if await Event.filter(contract=contract, type="email.completed_copy_sent").exists():
            return
        try:
            await _send_completed_copy(contract, signed_pdf)
        except email_service.EmailError as exc:
            await _log(contract, "email.completed_copy_failed", {"reason": str(exc)})
            logger.warning("Completed-copy email failed for contract %s", contract.id)
            return
        await _log(contract, "email.completed_copy_sent", {})


async def _archive_files(contract: Contract) -> bytes:
    """Download from Documenso once; afterwards read our own copy. Returns the signed PDF."""
    existing = await ContractFile.filter(contract=contract, kind=FileKind.SIGNED_PDF).first()
    if existing:
        return await storage.download(existing.storage_key)

    envelope = await documenso_client.get_envelope(contract.documenso_envelope_id)
    items = sorted(envelope.get("envelopeItems") or [], key=lambda i: i.get("order", 0))
    if not items:
        raise ValueError("Documenso returned no documents for this envelope")

    signed_pdf = b""
    for n, item in enumerate(items):
        data = await documenso_client.download_envelope_item(item["id"], version="signed")
        suffix = "" if n == 0 else f"_{n + 1}"
        await _store(contract, FileKind.SIGNED_PDF, f"signed{suffix}.pdf", data)
        if n == 0:
            signed_pdf = data

    certificate = await documenso_client.download_certificate(contract.documenso_envelope_id)
    await _store(contract, FileKind.CERTIFICATE, "certificate.pdf", certificate)

    await _log(contract, "contract.archived", {"documents": len(items)})
    return signed_pdf


async def _store(contract: Contract, kind: FileKind, name: str, data: bytes) -> None:
    key = f"contracts/{contract.id}/{name}"
    await storage.upload(key, data)
    await ContractFile.create(contract=contract, kind=kind, storage_key=key, sha256=sha256_hex(data))


async def _send_completed_copy(contract: Contract, signed_pdf: bytes) -> None:
    tmpl = await Template.get_or_none(template_key=contract.template_key)
    title = tmpl.name if tmpl else "Tenancy agreement"
    safe = re.sub(r"[^A-Za-z0-9 _-]", "", f"{title} - {contract.tenant_name}").strip() or "agreement"
    await email_service.send_completed_copy(
        to_email=contract.tenant_email,
        to_name=contract.tenant_name,
        document_title=title,
        signed_pdf=signed_pdf,
        filename=f"{safe} (signed).pdf",
    )


def _build_recipient(contract: Contract, recipient_map: dict) -> dict:
    return {
        "id": recipient_map["tenant"],
        "email": contract.tenant_email,
        "name": contract.tenant_name,
    }


def _data_values(contract: Contract) -> dict[str, str]:
    """Contract details as they should appear printed on the agreement (AU formats)."""
    def money(v) -> str:
        return f"${v:,.2f}" if v is not None else ""

    def day(d) -> str:
        return d.strftime("%d/%m/%Y") if d else ""

    return {
        "tenant_name": contract.tenant_name or "",
        "tenant_email": contract.tenant_email or "",
        "property_address": contract.property_address or "",
        "room_number": contract.room_number or "",
        "weekly_rent": money(contract.weekly_rent),
        "bond_amount": money(contract.bond_amount),
        "start_date": day(contract.start_date),
        "end_date": day(contract.end_date),
    }


def _build_prefill(contract: Contract, template_fields: list[dict]) -> list[dict]:
    """Fill each data box on the template, matched by its Documenso field ID."""
    values = _data_values(contract)
    prefill = []
    for f in template_fields:
        key, field_id = f.get("dataKey"), f.get("documensoFieldId")
        if key and field_id is not None and values.get(key):
            prefill.append({"id": field_id, "type": "text", "value": values[key]})
    return prefill


async def _log(contract: Contract, event_type: str, payload: dict) -> None:
    await Event.create(contract=contract, type=event_type, payload=payload)
