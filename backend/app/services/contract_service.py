"""Business logic layer. Controllers call this; this calls models + external services."""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

from app.models.contract import Contract, ContractStatus
from app.models.event import Event
from app.models.file import ContractFile, FileKind
from app.models.recipient import Recipient
from app.models.template import Template
from app.models.user import User
from app.schemas.contract import CreateContractRequest
from app.services import documenso_client, email_service, live, storage, template_service
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
    ContractStatus.QUEUED: 0,
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


async def create_contract(data: CreateContractRequest, owner: User) -> Contract:
    tmpl = await Template.get_or_none(template_key=data.template_key, is_active=True)
    if not tmpl:
        raise ValueError("Choose a template that is ready to send.")
    _check_required_details(data, tmpl.fields_json or [])
    custom = clean_custom_values(tmpl.fields_json or [], data.custom_values)
    # "created_by" always comes from the signed-in user, never from the browser.
    contract = await Contract.create(
        **data.model_dump(exclude={"created_by", "custom_values"}),
        custom_values=custom, created_by=owner.name, owner=owner, status=ContractStatus.DRAFT,
    )
    await _log(contract, "contract.created", {"created_by": owner.name, "user_id": str(owner.id)})
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
    try:
        result = await documenso_client.use_template(
            template_envelope_id=tmpl.documenso_template_id,
            recipients=[_build_recipient(contract, tmpl.recipient_map)],
            prefill_fields=_build_prefill(contract, tmpl.fields_json or []),
            external_id=str(contract.id),
            send_now=True,
            title=document_title(contract),
        )
    except documenso_client.DocumensoError as exc:
        if exc.retry_after is None:
            raise
        # Documenso allows only a few new documents every few minutes: queue it, send automatically.
        await _queue(contract, subject, message, exc.retry_after)
        return contract

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
    contract.next_send_at = None
    await contract.save(update_fields=["documenso_envelope_id", "status", "next_send_at", "updated_at"])
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
            document_title=document_title(contract),
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


async def _queue(contract: Contract, subject: str | None, message: str | None, wait_seconds: int) -> None:
    first_time = contract.status != ContractStatus.QUEUED
    contract.status = ContractStatus.QUEUED
    contract.send_subject = (subject or "").strip() or None
    contract.send_message = (message or "").strip() or None
    contract.next_send_at = datetime.now(timezone.utc) + timedelta(seconds=wait_seconds + 5)
    await contract.save(update_fields=["status", "send_subject", "send_message", "next_send_at", "updated_at"])
    if first_time:
        await _log(contract, "contract.queued", {"retry_in_seconds": wait_seconds})


async def process_send_queue() -> None:
    """Send the oldest queued contract that is due. Called every 30s by the app (one at a time)."""
    due = (
        await Contract.filter(status=ContractStatus.QUEUED, next_send_at__lte=datetime.now(timezone.utc))
        .order_by("next_send_at")
        .first()
    )
    if not due:
        return
    try:
        await send_contract(due, subject=due.send_subject, message=due.send_message)
    except ValueError as exc:
        await due.refresh_from_db()
        if due.documenso_envelope_id:
            # Created in Documenso but the email failed — already logged; staff can use "Resend email".
            return
        # Real problem (not the rate limit): back to draft so staff can fix it and send again.
        due.status = ContractStatus.DRAFT
        due.next_send_at = None
        await due.save(update_fields=["status", "next_send_at", "updated_at"])
        await _log(due, "contract.send_failed", {"reason": str(exc)[:300]})
        logger.warning("Queued contract %s could not be sent", due.id)


# ---------------- Catch-up with Documenso (no polling) ----------------
# Webhooks can be missed (server down, tunnel closed). Used once at start-up and by "Check status now".
_DOCUMENSO_STATUS = {
    "COMPLETED": ContractStatus.COMPLETED,
    "REJECTED": ContractStatus.REJECTED,
    "CANCELLED": ContractStatus.CANCELLED,
}
_OPEN = (ContractStatus.SENT, ContractStatus.VIEWED, ContractStatus.COMPLETED)


async def sync_contract(contract: Contract) -> bool:
    """Bring one contract up to date with Documenso. Returns True if anything changed."""
    if not contract.documenso_envelope_id or contract.status not in _OPEN:
        return False
    envelope = await documenso_client.get_envelope(contract.documenso_envelope_id)
    remote = _DOCUMENSO_STATUS.get(envelope.get("status", ""))
    recipients = envelope.get("recipients") or []
    opened = any(r.get("readStatus") == "OPENED" for r in recipients)
    signed = any(r.get("signingStatus") == "SIGNED" for r in recipients)
    target = remote or (ContractStatus.VIEWED if opened else ContractStatus.SENT)

    changed = False
    seen = {e.type for e in await Event.filter(contract=contract)}
    if opened and not seen & {"webhook.document_opened", "document_opened", "sync.document_opened"}:
        await _log(contract, "sync.document_opened", {"source": "safety check"})
    if signed and not seen & {"webhook.document_signed", "document_signed", "sync.document_signed"}:
        await _log(contract, "sync.document_signed", {"source": "safety check"})
    if remote == ContractStatus.COMPLETED and not seen & {"webhook.document_completed", "document_completed", "sync.document_completed"}:
        await _log(contract, "sync.document_completed", {"source": "safety check"})
    if _RANK[target] > _RANK[contract.status]:
        contract.status = target
        await contract.save(update_fields=["status", "updated_at"])
        _notify(contract)
        changed = True
    if contract.status == ContractStatus.COMPLETED:
        await archive_and_notify(str(contract.id))  # store files + email signed copy (safe to repeat)
        changed = True
    return changed


async def sync_open_contracts() -> int:
    """Check every unfinished contract against Documenso (one at a time)."""
    fixed = 0
    for c in await Contract.filter(status__in=list(_OPEN)).exclude(documenso_envelope_id=None):
        try:
            if await sync_contract(c):
                fixed += 1
        except Exception:
            logger.warning("Safety check failed for contract %s", c.id)
    return fixed


async def catch_up_on_start() -> None:
    """Once, when the backend starts: fix anything that happened in Documenso while we were offline."""
    try:
        fixed = await sync_open_contracts()
        if fixed:
            logger.info("Start-up catch-up updated %s contract(s)", fixed)
    except Exception:
        logger.exception("Start-up catch-up failed")


async def send_queue_loop() -> None:
    """Background worker started with the app."""
    while True:
        try:
            await process_send_queue()
        except Exception:  # never let the worker die
            logger.exception("Send queue error")
        await asyncio.sleep(30)


async def cancel_contract(contract: Contract) -> Contract:
    """Stop a sent contract: the signing link stops working in Documenso."""
    if contract.status == ContractStatus.QUEUED:
        # Not created in Documenso yet — just take it out of the queue.
        contract.status = ContractStatus.CANCELLED
        contract.next_send_at = None
        await contract.save(update_fields=["status", "next_send_at", "updated_at"])
        await _log(contract, "contract.cancelled", {})
        return contract
    if contract.status not in (ContractStatus.SENT, ContractStatus.VIEWED):
        raise ValueError("Only a sent or viewed contract can be cancelled.")
    if contract.documenso_envelope_id:
        await documenso_client.cancel_envelope(contract.documenso_envelope_id, "Cancelled by Living High staff")
    contract.status = ContractStatus.CANCELLED
    await contract.save(update_fields=["status", "updated_at"])
    await _log(contract, "contract.cancelled", {})
    return contract


# Our audit event types → the timeline labels the staff app shows.
_TIMELINE: dict[str, str] = {
    "contract.created": "created",
    "contract.sent": "sent",
    "email.signing_request_sent": "email sent",
    "email.signing_request_resent": "email sent",
    "webhook.document_opened": "opened",
    "webhook.document_signed": "signed",
    "webhook.document_completed": "completed",
    "email.completed_copy_sent": "signed copy emailed",
    "email.completed_copy_resent": "signed copy emailed",
    "email.signing_request_failed": "email failed",
    "email.completed_copy_failed": "email failed",
    "contract.cancelled": "cancelled",
    "contract.queued": "queued",
    "contract.send_failed": "send failed",
    "sync.document_opened": "opened",
    "sync.document_signed": "signed",
    "sync.document_completed": "completed",
    # events logged before 2026-11-26 used the raw Documenso name
    "document_opened": "opened",
    "document_signed": "signed",
    "document_completed": "completed",
}
_ONCE = {"opened", "signed", "completed"}  # Documenso can repeat these; show the first only


def timeline(events: list[Event]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for e in sorted(events, key=lambda e: e.created_at):
        label = _TIMELINE.get(e.type)
        if not label or (label in _ONCE and label in seen):
            continue
        seen.add(label)
        out.append({"type": label, "created_at": e.created_at})
    return out


async def overview(owner: User | None = None) -> list[dict]:
    """Contracts with their timelines, newest first. owner=None → everyone's (Admins/Managers)."""
    q = Contract.all() if owner is None else Contract.filter(owner_id=owner.id)
    contracts = await q.order_by("-created_at")
    by_contract: dict[str, list[Event]] = {}
    if contracts:
        for e in await Event.filter(contract_id__in=[c.id for c in contracts]):
            by_contract.setdefault(str(e.contract_id), []).append(e)
    return [contract_dict(c, by_contract.get(str(c.id), [])) for c in contracts]


def contract_dict(c: Contract, events: list[Event]) -> dict:
    return {
        "id": str(c.id),
        "template_key": c.template_key,
        "status": c.status.value,
        "tenant_name": c.tenant_name,
        "tenant_email": c.tenant_email,
        "property_address": c.property_address,
        "room_number": c.room_number,
        "weekly_rent": float(c.weekly_rent) if c.weekly_rent is not None else None,
        "bond_amount": float(c.bond_amount) if c.bond_amount is not None else None,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "custom_values": c.custom_values or {},
        "next_send_at": c.next_send_at,
        "created_by": c.created_by,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "events": timeline(events),
    }


async def resend_email(contract: Contract) -> str:
    """Send the right email again: the signing link (not yet signed) or the signed copy."""
    if contract.status in (ContractStatus.SENT, ContractStatus.VIEWED):
        recipient = await Recipient.filter(contract=contract, role="tenant").first()
        if not recipient or not recipient.signing_url:
            raise ValueError("No signing link is stored for this contract.")
        await email_service.send_signing_request(
            to_email=contract.tenant_email,
            to_name=contract.tenant_name,
            signing_url=recipient.signing_url,
            document_title=document_title(contract),
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
        _notify(contract)

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
            _notify(contract)

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
    await ensure_audit_log(contract)

    await _log(contract, "contract.archived", {"documents": len(items)})
    return signed_pdf


async def ensure_audit_log(contract: Contract) -> ContractFile | None:
    """Keep our own copy of Documenso's Audit Log PDF. Fetched on first need (also for older contracts)."""
    existing = await ContractFile.filter(contract=contract, kind=FileKind.AUDIT_LOG).first()
    if existing or not contract.documenso_envelope_id:
        return existing
    if contract.status not in (ContractStatus.COMPLETED, ContractStatus.ARCHIVED):
        return None  # the log only becomes final once everyone has signed
    try:
        data = await documenso_client.download_audit_log(contract.documenso_envelope_id)
    except Exception:
        logger.warning("Could not download the audit log for contract %s", contract.id)
        return None
    if not data.startswith(b"%PDF"):
        return None
    await _store(contract, FileKind.AUDIT_LOG, "audit-log.pdf", data)
    return await ContractFile.filter(contract=contract, kind=FileKind.AUDIT_LOG).first()


async def _store(contract: Contract, kind: FileKind, name: str, data: bytes) -> None:
    key = f"contracts/{contract.id}/{name}"
    await storage.upload(key, data)
    await ContractFile.create(contract=contract, kind=kind, storage_key=key, sha256=sha256_hex(data))


def document_title(contract: Contract) -> str:
    """What the tenant sees (emails, signing page, file name). Template names are internal, never shown."""
    return f"Living High Agreement – {contract.tenant_name.strip()}"


async def _send_completed_copy(contract: Contract, signed_pdf: bytes) -> None:
    title = document_title(contract)
    safe = re.sub(r"[^A-Za-z0-9 _-]", "", title.replace("–", "-")).strip() or "agreement"
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


# Details printed by data boxes that must be filled when the template uses them.
_REQUIRED_WHEN_USED = {
    "property_address": "the property address",
    "weekly_rent": "the weekly rent",
    "bond_amount": "the bond amount",
    "start_date": "the start date",
}
# Contract details that are only kept when the template prints them (name + email are always needed).
_OPTIONAL_DETAILS = ("property_address", "room_number", "weekly_rent", "bond_amount", "start_date", "end_date")


def _check_required_details(data: CreateContractRequest, template_fields: list[dict]) -> None:
    """Keep only the details this template prints, and require the ones it needs.
    Messages use the template's own label (e.g. "Occupancy fee" rather than "weekly rent")."""
    labels: dict[str, str] = {}
    for f in sorted(template_fields, key=lambda x: (x.get("page", 1), x.get("positionY", 0), x.get("positionX", 0))):
        if f.get("dataKey"):
            labels.setdefault(f["dataKey"], (f.get("label") or "").strip())
    for key in _OPTIONAL_DETAILS:
        if key not in labels:
            setattr(data, key, "" if key == "property_address" else None)  # not on this template — no stray values
    for key, name in _REQUIRED_WHEN_USED.items():
        value = getattr(data, key)
        if key in labels and (value is None or (isinstance(value, str) and not value.strip())):
            shown = f"“{labels[key]}”" if labels[key] else name
            raise ValueError(f"Enter {shown} — this template prints it on the agreement.")


def tick_groups(template_fields: list[dict]) -> dict[str, dict]:
    """Staff tick boxes grouped by question: {question: {mode, options, required}}."""
    groups: dict[str, dict] = {}
    for f in template_fields:
        if f.get("tickOnly") and f.get("staffFill") and f.get("group"):
            g = groups.setdefault(f["group"], {
                "mode": f.get("groupMode") or "one", "options": [], "required": f.get("required", True),
            })
            if f.get("optionLabel") and f["optionLabel"] not in g["options"]:
                g["options"].append(f["optionLabel"])
    return groups


def clean_custom_values(template_fields: list[dict], raw: dict) -> dict:
    """Validate staff answers against the template's staff fields. Unknown keys are dropped."""
    out: dict = {}
    # Staff tick boxes over printed boxes: one answer per question, keyed "group:<question>".
    for question, g in tick_groups(template_fields).items():
        key = f"group:{question}"
        value = raw.get(key)
        if g["mode"] == "any":
            picked = [v for v in value if isinstance(v, str)] if isinstance(value, list) else []
            if any(v not in g["options"] for v in picked):
                raise ValueError(f"“{question}” has an option that isn't in the template.")
            out[key] = picked
        else:
            text = (value or "").strip() if isinstance(value, str) else ""
            if not text:
                if g["required"]:
                    raise ValueError(f"Choose an answer for “{question}”.")
                continue
            if text not in g["options"]:
                raise ValueError(f"Choose one of the options for “{question}”.")
            out[key] = text
    for f in template_fields:
        if not f.get("staffFill") or f.get("tickOnly") or f.get("linkTo"):
            continue  # linked fields reuse their main field's answer
        fid, ftype, label = f["id"], f["type"], f.get("label") or "A staff field"
        value = raw.get(fid)
        options = f.get("options") or []
        if ftype == "CHECKBOX":
            picked = [v for v in (value or []) if isinstance(v, str)] if isinstance(value, list) else []
            if any(v not in options for v in picked):
                raise ValueError(f"“{label}” has an option that isn't in the template.")
            out[fid] = picked
            continue
        text = "" if value is None else str(value).strip()
        if not text:
            if f.get("required", True):
                raise ValueError(f"Fill in “{label}”.")
            continue
        if f.get("dateInput") and not re.fullmatch(r"\d{2}/\d{2}/\d{4}", text):
            raise ValueError(f"“{label}” must be a date (dd/mm/yyyy).")
        if ftype in ("RADIO", "DROPDOWN") and text not in options:
            raise ValueError(f"Choose one of the options for “{label}”.")
        if ftype == "NUMBER":
            try:
                n = float(text)
            except ValueError:
                raise ValueError(f"“{label}” must be a number.") from None
            if f.get("minValue") is not None and n < f["minValue"]:
                raise ValueError(f"“{label}” must be at least {f['minValue']:g}.")
            if f.get("maxValue") is not None and n > f["maxValue"]:
                raise ValueError(f"“{label}” must be at most {f['maxValue']:g}.")
            text = f"{n:g}"
        if ftype == "TEXT" and f.get("characterLimit") and len(text) > f["characterLimit"]:
            raise ValueError(f"“{label}” is longer than {f['characterLimit']} characters.")
        out[fid] = text
    return out


# Documenso prefill types (v2 spec: prefillFields) for staff fields.
_PREFILL_TYPE = {"TEXT": "text", "NUMBER": "number", "RADIO": "radio", "DROPDOWN": "dropdown", "CHECKBOX": "checkbox"}


def _build_prefill(contract: Contract, template_fields: list[dict]) -> list[dict]:
    """Fill data boxes and staff fields on the template, matched by Documenso field ID."""
    values = _data_values(contract)
    custom = contract.custom_values or {}
    prefill = []
    for f in template_fields:
        field_id = f.get("documensoFieldId")
        if field_id is None:
            continue
        key = f.get("dataKey")
        if key and values.get(key):
            prefill.append({"id": field_id, "type": "text", "value": values[key]})
        elif f.get("staffFill") and f.get("tickOnly"):
            # Tick this printed box only if staff chose its option.
            answer = custom.get(f"group:{f.get('group')}")
            chosen = answer if isinstance(answer, list) else [answer] if answer else []
            if f.get("optionLabel") in chosen:
                prefill.append({"id": field_id, "type": "checkbox", "value": [template_service.tick_text(f)]})
        elif f.get("staffFill") and (f.get("linkTo") or f["id"]) in custom and f["type"] in _PREFILL_TYPE:
            value = custom[f.get("linkTo") or f["id"]]
            if f["type"] == "CHECKBOX":
                prefill.append({"id": field_id, "type": "checkbox", "value": list(value or [])})
            elif value not in (None, ""):
                prefill.append({"id": field_id, "type": _PREFILL_TYPE[f["type"]], "value": str(value)})
    return prefill


def _notify(contract: Contract) -> None:
    live.contract_changed(str(contract.id), str(contract.owner_id) if contract.owner_id else None, contract.status.value)


async def _log(contract: Contract, event_type: str, payload: dict) -> None:
    await Event.create(contract=contract, type=event_type, payload=payload)
    # Every change to a contract is logged here — tell connected staff browsers straight away.
    _notify(contract)
